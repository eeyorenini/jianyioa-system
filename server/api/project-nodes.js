/**
 * 进度节点模板 / 模板节点 / 项目节点（2026-10-29 渐进拆分第 14 轮）
 *
 * 搬运自 server.js 原 9194-9425 行，搬入时 232 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerProjectNodeRoutes(app, deps) {
  const {
    db,
    getUserId,
    addLog,
    isAdmin,
  } = deps;

  // ==================== 进度节点模板 API ====================
  // GET 所有模板
  app.get('/api/progress-node-templates', async (req, res) => {
    try {
      const templates = await db.prepare('SELECT * FROM progress_node_templates ORDER BY id').all();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST 新建模板
  app.post('/api/progress-node-templates', async (req, res) => {
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
  app.put('/api/progress-node-templates/:id', async (req, res) => {
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
  app.delete('/api/progress-node-templates/:id', async (req, res) => {
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
  // GET 某模板下的所有节点
  app.get('/api/progress-node-template-nodes/:templateId', async (req, res) => {
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
  // v2.5.3 鉴权加固：同组的 DELETE 早就有 isAdmin，POST/PUT 却漏了 —— 任何人都能改
  // 进度节点模板（影响所有项目的施工节点定义和默认短信模板），补齐为管理员。
  app.post('/api/progress-node-template-nodes', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可修改进度节点模板' });
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
  app.put('/api/progress-node-template-nodes/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可修改进度节点模板' });
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
  app.delete('/api/progress-node-template-nodes/:id', async (req, res) => {
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
  // GET 某项目的所有节点
  app.get('/api/progress-nodes/:projectId', async (req, res) => {
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
  app.post('/api/progress-nodes/init/:projectId', async (req, res) => {
    try {
      const { template_id, force } = req.body;
      const userId = getUserId(req);

      // 获取项目信息（用于计算日期范围）
      const [project] = await db.prepare('SELECT * FROM projects WHERE id = ?').all([req.params.projectId]);
      if (!project) return res.status(404).json({ error: '项目不存在' });

      // 保护：项目已有节点时拒绝重复初始化（除非显式传 force=true）（2026-10-09 加）
      const existingCount = (await db.prepare(
        'SELECT COUNT(*) as count FROM project_progress_nodes WHERE project_id = ?'
      ).get([req.params.projectId]))?.count || 0;
      if (existingCount > 0 && !force) {
        return res.status(409).json({
          error: '项目已有节点，禁止重复初始化',
          existingCount,
          hint: '如需重新初始化，请传 force=true（会先清空已有节点）'
        });
      }

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
          'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, plan_date, plan_end_date, sms_template_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        ).run([
          req.params.projectId, n.node_name, n.node_key, n.sort_order, 'pending',
          n._plan_start || null, n._plan_end || null, n.default_sms_template_id || null,
          n.note || null
        ]);
      }
      await addLog(userId, '', '新增', '节点管理', parseInt(req.params.projectId), project.name, `从模板初始化项目节点，共${templateNodes.length}个节点`, req.ip);
      res.json({ message: '项目节点初始化成功', count: templateNodes.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST 新增节点到项目
  app.post('/api/progress-nodes', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { project_id, node_name, node_key, sort_order, sms_template_id, note } = req.body;
      const result = await db.prepare(
        'INSERT INTO project_progress_nodes (project_id, node_name, node_key, sort_order, status, sms_template_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
      ).run([project_id, node_name, node_key, sort_order || 0, 'pending', sms_template_id || null, note || null]);
      await addLog(userId, '', '新增', '节点管理', result.lastInsertRowid, node_name, `新增节点: ${node_name}`, req.ip);
      res.json({ id: result.lastInsertRowid, message: '节点添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT 更新项目节点
  app.put('/api/progress-nodes/:id', async (req, res) => {
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
  app.delete('/api/progress-nodes/:id', async (req, res) => {
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

};
