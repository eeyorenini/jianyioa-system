'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/projects', async (req, res) => {
  console.log('[/api/projects] called, query:', req.query);
  try {
    const { customer_id, status, search } = req.query;
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'project');

    let sql = `SELECT p.*, 
               c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
               des.name as designer_name, des.phone as designer_phone,
               sup.name as supervisor_name, sup.phone as supervisor_phone,
               mgr.name as manager_name, mgr.phone as manager_phone
               FROM projects p
               LEFT JOIN customers c ON p.customer_id = c.id
               LEFT JOIN employees des ON p.designer_id = des.id
               LEFT JOIN employees sup ON p.supervisor_id = sup.id
               LEFT JOIN employees mgr ON p.manager_id = mgr.id`;
    const params = [];
    const conditions = [];

    // 客户查询：通过 customer_id 参数直接查询，忽略 creator_id 限制
    if (customer_id) {
      conditions.push('p.customer_id = ?');
      params.push(customer_id);
    } else if (!hasAll) {
      // 非admin且无read_all权限时，只看自己创建的项目
      conditions.push('p.creator_id = ?');
      params.push(userId);
    }

    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(p.name LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY p.created_at DESC';
    const stmt = db.prepare(sql);
    const projects = await stmt.all(...params);

    // 附加每个项目的节点列表
    const nodeStmt = db.prepare(`SELECT ps.*, s.name as sms_template_name
      FROM project_progress_nodes ps
      LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
      WHERE ps.project_id = ?
      ORDER BY ps.sort_order ASC, ps.id ASC`);
    for (const p of projects) {
      p.nodes = await nodeStmt.all(p.id);
      // 计算进度百分比
      if (p.nodes && p.nodes.length > 0) {
        const completedNodes = p.nodes.filter(n => n.status === 'completed').length;
        p.progress = Math.round((completedNodes / p.nodes.length) * 100);
      } else {
        p.progress = 0;
      }
    }

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/projects/:id', async (req, res) => {
  try {
    const stmt = db.prepare(`SELECT p.*,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      des.name as designer_name, des.phone as designer_phone,
      sup.name as supervisor_name, sup.phone as supervisor_phone,
      mgr.name as manager_name, mgr.phone as manager_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      WHERE p.id = ?`);
    const project = await stmt.get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/api/projects', checkPermission('project:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
    const stmt = db.prepare('INSERT INTO projects (name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(name, customer_id || null, status || '开工准备', start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, userId);
    const projectId = result.lastInsertRowid;

    // 如果选了节点模板，从模板复制节点到项目
    if (template_id) {
      const templateNodes = await db.prepare(
        'SELECT node_name, node_key, sort_order, default_sms_template_id FROM progress_node_template_nodes WHERE template_id = ? ORDER BY sort_order'
      ).all([template_id]);
      for (const node of templateNodes) {
        await db.prepare(
          'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, sms_template_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(projectId, node.node_name, node.node_key, node.sort_order, 'pending', node.default_sms_template_id || null);
      }
    }

    await addLog(userId, '', '新增', '项目管理', projectId, name, `项目名称: ${name}`, req.ip);
    // 通知：新增项目
    notifyProject('project_created', projectId,
      `新项目创建：${name}`,
      `项目「${name}」已创建，客户ID：${customer_id || ''}，请相关人员及时跟进。`,
      projectId, 'project'
    ).catch(console.error);
    res.json({ id: projectId, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/projects/:id', checkPermission('project:write'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, customer_id, status, start_date, end_date, budget, description, designer_id, supervisor_id, manager_id, template_id } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT creator_id FROM projects WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const stmt = db.prepare('UPDATE projects SET name=?, customer_id=?, status=?, start_date=?, end_date=?, budget=?, description=?, designer_id=?, supervisor_id=?, manager_id=?, template_id=? WHERE id=?');
    await stmt.run(name, customer_id || null, status, start_date || null, end_date || null, budget || null, description || null, designer_id || null, supervisor_id || null, manager_id || null, template_id || null, req.params.id);
    await addLog(userId, '', '编辑', '项目管理', req.params.id, name, `更新项目: ${name}`, req.ip);
    // 通知：项目状态变更
    if (existing.status !== status) {
      notifyProject('project_status_changed', parseInt(req.params.id),
        `项目状态变更：${name}`,
        `项目「${name}」状态已变更为「${status}」，请知悉。`,
        parseInt(req.params.id), 'project'
      ).catch(console.error);
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.delete('/api/projects/:id', checkPermission('project:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const [proj] = await db.prepare('SELECT name, creator_id FROM projects WHERE id = ?').all(req.params.id);
    if (!proj) return res.status(404).json({ error: '记录不存在' });
    if (proj.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const projName = proj.name;
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '项目管理', req.params.id, projName, `删除项目: ${projName}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/project-stages', async (req, res) => {
  const stmt = db.prepare(`SELECT ps.*, s.name as sms_template_name
    FROM project_progress_nodes ps
    LEFT JOIN sms_templates s ON s.id = ps.sms_template_id
    WHERE ps.project_id = ?
    ORDER BY ps.sort_order, ps.id`);
  res.json(await stmt.all(req.query.project_id));
});


router.post('/api/project-stages', async (req, res) => {
    
  const userId = getUserId(req);
  const { project_id, node_name, plan_date, plan_end_date, status, progress, note, sms_template_id, after_node_id } = req.body;
  try {
    if (after_node_id !== undefined && after_node_id !== null) {
      const [after] = await db.prepare('SELECT sort_order FROM project_progress_nodes WHERE id = ?').all(after_node_id);
      if (after) {
        await db.prepare('UPDATE project_progress_nodes SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?').run(project_id, after.sort_order);
        const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, after.sort_order + 1, status || 'pending', note, sms_template_id || null, userId);
        const nodeId = result.lastInsertRowid;
        notifyProject('node_status_changed', project_id,
          `新增项目节点：${node_name}`,
          `项目「ID:${project_id}」新增节点「${node_name}」，请及时跟进。`,
          nodeId, 'node'
        ).catch(console.error);
        await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
        return res.json({ id: nodeId, message: '添加成功' });
      }
    }
    const [max] = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM project_progress_nodes WHERE project_id = ?').all(project_id);
    const stmt = db.prepare('INSERT INTO project_progress_nodes (project_id, node_name, plan_date, plan_end_date, sort_order, status, note, sms_template_id, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(project_id, node_name, plan_date, plan_end_date || null, max.m + 1, status || 'pending', note, sms_template_id || null, userId);
    const nodeId = result.lastInsertRowid;
    await addLog(userId, '', '新增', '项目节点', nodeId, node_name, `新增节点: ${node_name}`, req.ip);
    notifyProject('node_status_changed', project_id,
      `新增项目节点：${node_name}`,
      `项目「ID:${project_id}」新增节点「${node_name}」，请及时跟进。`,
      nodeId, 'node'
    ).catch(console.error);
    res.json({ id: nodeId, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/project-stages/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const [row] = await db.prepare('SELECT * FROM project_progress_nodes WHERE id = ?').all(req.params.id);
    if (!row) return res.status(404).json({ error: '节点不存在' });
    if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const { node_name, plan_date, plan_end_date, actual_date, status, note, sms_template_id, sort_order } = req.body;
    const updated = {
      node_name: node_name !== undefined ? node_name : row.node_name,
      plan_date: plan_date !== undefined ? plan_date : row.plan_date,
      plan_end_date: plan_end_date !== undefined ? plan_end_date : row.plan_end_date,
      actual_date: actual_date !== undefined ? actual_date : row.actual_date,
      status: status !== undefined ? status : row.status,
      note: note !== undefined ? note : row.note,
      sms_template_id: sms_template_id !== undefined ? (sms_template_id || null) : row.sms_template_id,
      sort_order: sort_order !== undefined ? sort_order : row.sort_order
    };
    const stmt = db.prepare('UPDATE project_progress_nodes SET node_name=?, plan_date=?, plan_end_date=?, actual_date=?, status=?, note=?, sms_template_id=?, sort_order=? WHERE id=?');
    await stmt.run(updated.node_name, updated.plan_date, updated.plan_end_date, updated.actual_date, updated.status, updated.note, updated.sms_template_id, updated.sort_order, req.params.id);

    await addLog(userId, '', '编辑', '项目节点', parseInt(req.params.id), updated.node_name || row.node_name, `更新节点: ${updated.node_name || row.node_name}`, req.ip);

    // ✅ 节点状态变化时，通知项目成员和客户（任意状态变化都通知）
    if (row.status !== updated.status) {
      const statusLabel = { pending: '待处理', in_progress: '进行中', completed: '已完成', skipped: '已跳过' };
      const typeMap = { pending: 'node_pending', in_progress: 'node_in_progress', completed: 'node_completed', skipped: 'node_skipped' };
      const type = typeMap[updated.status] || 'node_completed';
      const title = `项目节点${statusLabel[updated.status] || updated.status}：${updated.node_name || row.node_name}`;
      const content = `项目「${row.node_name}」已变更为「${statusLabel[updated.status] || updated.status}」，请知悉。`;
      const smsNotify = parseInt(req.body.sms_notify || 0);
      if (smsNotify) {
        // 用户选择发送短信：用节点绑定的模板发短信
        await notifyProject(type, row.project_id, title, content, row.id, 'node', null, updated.sms_template_id);
      }
      // 无论是否发短信，都写一条应用内消息记录状态变更
      await insertInAppNotification(row.project_id, title, content, row.id, 'node');
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.delete('/api/project-stages/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const [row] = await db.prepare('SELECT id, creator_id FROM project_progress_nodes WHERE id = ?').all(req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (row.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const stmt = db.prepare('DELETE FROM project_progress_nodes WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '项目节点', parseInt(req.params.id), row.id, `删除节点 ID: ${row.id}`, req.ip);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 通用施工/巡检日志列表（支持 type/page/project_id 过滤）

router.get('/api/project-logs', async (req, res) => {
  try {
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

    const { type, project_id, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    let where = [];
    let params = [];

    if (type && type !== 'all') {
      where.push('l.type = ?');
      params.push(type);
    }
    if (project_id) {
      where.push('l.project_id = ?');
      params.push(project_id);
    }
    // 非管理员只看自己的日志
    if (!userIsAdmin && userId) {
      where.push('l.creator_id = ?');
      params.push(userId);
    }

    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM project_logs l ${whereSql}`);
    const [{ total }] = await countStmt.all(...params);

    const listStmt = db.prepare(`
      SELECT l.*, p.name as project_name
      FROM project_logs l
      LEFT JOIN projects p ON l.project_id = p.id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const list = await listStmt.all(...params, parseInt(page_size), offset);

    res.json({ list, total, page: parseInt(page), page_size: parseInt(page_size) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/project-logs/:projectId', async (req, res) => {
  const stmt = db.prepare(`
    SELECT l.*, p.name as project_name
    FROM project_logs l
    LEFT JOIN projects p ON l.project_id = p.id
    WHERE l.project_id = ?
    ORDER BY l.created_at DESC
  `);
  res.json(await stmt.all(req.params.projectId));
});


router.post('/api/project-logs', async (req, res) => {
    
  const userId = getUserId(req);
  const { project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note } = req.body;
  const stmt = db.prepare('INSERT INTO project_logs (project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
  const result = await stmt.run(project_id, content, operator, JSON.stringify(images || []), worker_count || null, work_type || null, tomorrow_plan || null, note || null, userId);
  const logId = result.lastInsertRowid;

  // ✅ 新增项目进展时，通知项目成员和客户
  const [proj] = await db.prepare('SELECT name FROM projects WHERE id = ?').all(project_id);
  await addLog(userId, '', '新增', '项目进展', logId, proj?.name || project_id, `项目「${proj?.name || project_id}」添加进展`, req.ip);
  if (proj) {
    await notifyProject('project_progress', project_id,
      `项目新进展`,
      `「${proj.name}」有新进展：${content ? content.substring(0, 50) : ''}...`,
      logId, 'project_log');
  }

  res.json({ id: logId, message: '添加成功' });
});

// 删除日志（谁创建谁可以删除）

router.delete('/api/project-logs/:id', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });

  // 检查权限：创建者本人或管理员可以删除
  if (log.creator_id !== userId && !userIsAdmin) {
    return res.status(403).json({ error: '无权删除他人的日志' });
  }

  // 删除日志关联的图片文件（兼容新旧数据：路径格式 vs base64格式）
  try {
    let paths = [];
    if (log.images) {
      let parsed = JSON.parse(log.images);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) {
        paths = parsed.filter(p => p && typeof p === 'string');
      }
    }
    for (const p of paths) {
      if (!p.startsWith('/uploads/')) continue;
      const fullPath = path.join(__dirname, p);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`[删除日志图片] ${p}`);
      }
    }
  } catch (e) {
    console.error('删除日志图片失败:', e);
  }

  await db.prepare('DELETE FROM project_logs WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

// 更新日志

router.put('/api/project-logs/:id', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';

  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });

  // 检查权限：创建者本人或管理员可以编辑
  if (log.creator_id !== userId && !userIsAdmin) {
    return res.status(403).json({ error: '无权编辑他人的日志' });
  }

  const { content, operator, images } = req.body;
  const stmt = db.prepare('UPDATE project_logs SET content = ?, operator = ?, images = ? WHERE id = ?');
  await stmt.run(content, operator, JSON.stringify(images || []), req.params.id);
  res.json({ message: '更新成功' });
});

// 获取单个日志详情

router.get('/api/project-log/:id', async (req, res) => {
  const [log] = await db.prepare('SELECT * FROM project_logs WHERE id = ?').all(req.params.id);
  if (!log) return res.status(404).json({ error: '日志不存在' });
  res.json(log);
});

// 获取我的日志（当前用户创建的所有日志）

router.get('/api/my/logs', async (req, res) => {
  const userId = getUserId(req);
  const stmt = db.prepare(`
    SELECT l.*, p.name as project_name 
    FROM project_logs l 
    LEFT JOIN projects p ON l.project_id = p.id 
    WHERE l.creator_id = ? 
    ORDER BY l.created_at DESC
  `);
  res.json(await stmt.all(userId));
});


router.get('/api/quotes', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'quote');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM quotes WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});


router.post('/api/quotes', async (req, res) => {
    
  const userId = getUserId(req);
  const { customer_name, project_name, total_amount, status, items, valid_date } = req.body;
  const stmt = db.prepare('INSERT INTO quotes (customer_name, project_name, total_amount, status, items, valid_date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(customer_name, project_name, total_amount, status || '待确认', JSON.stringify(items), valid_date, userId);
  await addLog(userId, '', '新增', '报价管理', result.lastInsertRowid, project_name, `项目: ${project_name}, 客户: ${customer_name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.delete('/api/quotes/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const [q] = await db.prepare('SELECT project_name, creator_id FROM quotes WHERE id = ?').all(req.params.id);
  if (!q) return res.status(404).json({ error: '记录不存在' });
  if (q.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const qName = q.project_name;
  const stmt = db.prepare('DELETE FROM quotes WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '报价管理', req.params.id, qName, `删除报价: ${qName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.get('/api/progress-node-templates', async (req, res) => {
  try {
    const templates = await db.prepare('SELECT * FROM progress_node_templates ORDER BY id').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新建模板

router.post('/api/progress-node-templates', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    const result = await db.prepare(
      'INSERT INTO progress_node_templates (name, description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())'
    ).run([name, description || '']);
    await addLog(userId, '', '新增', '节点模板', result.lastInsertRowid, name, `节点模板: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '模板创建成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新模板

router.put('/api/progress-node-templates/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    await db.prepare(
      'UPDATE progress_node_templates SET name=?, description=?, updated_at=NOW() WHERE id=?'
    ).run([name, description || '', req.params.id]);
    await addLog(userId, '', '编辑', '节点模板', parseInt(req.params.id), name, `更新节点模板: ${name}`, req.ip);
    res.json({ message: '模板更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除模板

router.delete('/api/progress-node-templates/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [tpl] = await db.prepare('SELECT name FROM progress_node_templates WHERE id=?').all([req.params.id]);
    await db.prepare('DELETE FROM progress_node_templates WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '节点模板', parseInt(req.params.id), tpl?.name || '', `删除节点模板: ${tpl?.name || req.params.id}`, req.ip);
    res.json({ message: '模板删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 模板节点 API ====================

router.get('/api/progress-node-template-nodes/:templateId', async (req, res) => {
  try {
    const nodes = await db.prepare(
      'SELECT n.*, t.name as sms_template_name FROM progress_node_template_nodes n LEFT JOIN sms_templates t ON n.default_sms_template_id=t.id WHERE n.template_id=? ORDER BY n.sort_order'
    ).all([req.params.templateId]);
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新增节点到模板

router.post('/api/progress-node-template-nodes', async (req, res) => {
  try {
    const { template_id, node_name, node_key, sort_order, default_sms_template_id, note } = req.body;
    const result = await db.prepare(
      'INSERT INTO progress_node_template_nodes (template_id, node_name, node_key, sort_order, default_sms_template_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())'
    ).run([template_id, node_name, node_key, sort_order || 0, default_sms_template_id || null, note || null]);
    res.json({ id: result.lastInsertRowid, message: '节点添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新模板节点

router.put('/api/progress-node-template-nodes/:id', async (req, res) => {
  try {
    const { node_name, node_key, sort_order, default_sms_template_id, note } = req.body;
    await db.prepare(
      'UPDATE progress_node_template_nodes SET node_name=?, node_key=?, sort_order=?, default_sms_template_id=?, note=? WHERE id=?'
    ).run([node_name, node_key, sort_order || 0, default_sms_template_id || null, note || null, req.params.id]);
    res.json({ message: '节点更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除模板节点

router.delete('/api/progress-node-template-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    await db.prepare('DELETE FROM progress_node_template_nodes WHERE id=?').run([req.params.id]);
    res.json({ message: '节点删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 项目节点 API ====================

router.get('/api/progress-nodes/:projectId', async (req, res) => {
  try {
    const nodes = await db.prepare(
      'SELECT n.*, t.name as sms_template_name FROM project_progress_nodes n LEFT JOIN sms_templates t ON n.sms_template_id=t.id WHERE n.project_id=? ORDER BY n.sort_order'
    ).all([req.params.projectId]);
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 用模板初始化项目节点（同时自动分配计划日期）

router.post('/api/progress-nodes/init/:projectId', async (req, res) => {
  try {
    const { template_id } = req.body;
    const userId = getUserId(req);

    // 获取项目信息（用于计算日期范围）
    const [project] = await db.prepare('SELECT * FROM projects WHERE id = ?').all([req.params.projectId]);
    if (!project) return res.status(404).json({ error: '项目不存在' });

    const templateNodes = await db.prepare(
      'SELECT * FROM progress_node_template_nodes WHERE template_id=? ORDER BY sort_order'
    ).all([template_id]);
    if (!templateNodes.length) {
      return res.status(400).json({ error: '模板无节点' });
    }

    // 如果项目有起止日期，按工期平均分配节点时间段
    let planStart = null;
    let planEnd = null;
    if (project.start_date && project.end_date) {
      const start = new Date(project.start_date);
      const end = new Date(project.end_date);
      const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      const nodeCount = templateNodes.length;
      const daysPerNode = Math.ceil(totalDays / nodeCount);
      planStart = start;
      for (let i = 0; i < templateNodes.length; i++) {
        const nodeStart = new Date(start.getTime() + i * daysPerNode * 86400000);
        const nodeEnd = new Date(start.getTime() + (i + 1) * daysPerNode * 86400000 - 86400000);
        templateNodes[i]._plan_start = nodeStart.toISOString().slice(0, 10);
        templateNodes[i]._plan_end = nodeEnd.toISOString().slice(0, 10);
      }
    }

    for (const n of templateNodes) {
      await db.prepare(
        'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, plan_date, plan_end_date, sms_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
      ).run([
        req.params.projectId, n.node_name, n.node_key, n.sort_order, 'pending',
        n._plan_start || null, n._plan_end || null, n.default_sms_template_id || null
      ]);
    }
    await addLog(userId, '', '新增', '节点管理', parseInt(req.params.projectId), project.name, `从模板初始化项目节点，共${templateNodes.length}个节点`, req.ip);
    res.json({ message: '项目节点初始化成功', count: templateNodes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新增节点到项目

router.post('/api/progress-nodes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { project_id, node_name, node_key, sort_order, sms_template_id } = req.body;
    const result = await db.prepare(
      'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, sms_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())'
    ).run([project_id, node_name, node_key, sort_order || 0, 'pending', sms_template_id || null]);
    await addLog(userId, '', '新增', '节点管理', result.lastInsertRowid, node_name, `新增节点: ${node_name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '节点添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新项目节点

router.put('/api/progress-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { node_name, node_key, sort_order, status, plan_date, actual_date, sms_template_id, note } = req.body;
    await db.prepare(
      'UPDATE project_progress_nodes SET node_name=?, node_key=?, sort_order=?, status=?, plan_date=?, actual_date=?, sms_template_id=?, note=?, updated_at=NOW() WHERE id=?'
    ).run([node_name, node_key, sort_order || 0, status, plan_date || null, actual_date || null, sms_template_id || null, note || null, req.params.id]);
    await addLog(userId, '', '编辑', '节点管理', req.params.id, node_name, `更新节点: ${node_name}，状态: ${status}`, req.ip);
    res.json({ message: '节点更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除项目节点

router.delete('/api/progress-nodes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [node] = await db.prepare('SELECT node_name FROM project_progress_nodes WHERE id=?').all([req.params.id]);
    const nodeName = node ? node.node_name : req.params.id;
    await db.prepare('DELETE FROM project_progress_nodes WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '节点管理', req.params.id, nodeName, `删除节点: ${nodeName}`, req.ip);
    res.json({ message: '节点删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 短信模板 API ====================

module.exports = router;