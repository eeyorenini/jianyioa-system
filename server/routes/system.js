'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.post('/api/debug/add-type-column', async (req, res) => {
  try {
    const stmt = db.prepare('ALTER TABLE project_logs ADD COLUMN type VARCHAR(20) DEFAULT "construction" AFTER project_id');
    await stmt.run();
    res.json({ message: 'type 列已添加' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 家庭成员管理 ====================

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '装企云ERP系统运行中' });
});

// ==================== 客户管理 ====================

router.get('/api/operation-logs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { page, limit, module, action } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 50;
  const offset = (p - 1) * l;
  let countSql = 'SELECT COUNT(*) as total FROM operation_logs';
  let sql = 'SELECT * FROM operation_logs';
  const params = [];
  const conditions = [];
  if (module) {
    conditions.push('module = ?');
    params.push(module);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (conditions.length > 0) {
    countSql += ' WHERE ' + conditions.join(' AND ');
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  const [countResult] = await pool.query(countSql, params);
  const [rows] = await pool.query(sql, [...params, l, offset]);
  res.json({ logs: rows, total: countResult[0].total, page: p, limit: l });
});

// 清空操作日志

router.delete('/api/operation-logs', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE operation_logs');
    res.json({ success: true, message: '操作日志已清空' });
  } catch (e) {
    res.status(500).json({ success: false, message: '清空失败: ' + e.message });
  }
});

// ================================================================

router.get('/api/system-logs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { page = 1, limit = 50, path, method, success, user_id, start_date, end_date } = req.query;
  let sql = 'SELECT * FROM system_logs WHERE 1=1';
  const params = [];
  if (path) { sql += ' AND path LIKE ?'; params.push(`%${path}%`); }
  if (method) { sql += ' AND method = ?'; params.push(method); }
  if (success !== undefined && success !== '') { sql += ' AND success = ?'; params.push(parseInt(success)); }
  if (user_id) { sql += ' AND user_id = ?'; params.push(parseInt(user_id)); }
  if (start_date) { sql += ' AND created_at >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND created_at <= ?'; params.push(end_date); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE 1=1' + sql.split('WHERE 1=1')[1].split('ORDER BY')[0];
  const stmt = db.prepare(sql);
  const countStmt = db.prepare(countSql);
  try {
    const logs = await stmt.all(...params);
    const countResult = await countStmt.all(...params.slice(0, -2));
    const total = countResult[0] ? countResult[0].total : 0;
    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.json({ logs: [], total: 0, page: parseInt(page), limit: parseInt(limit) });
  }
});

// 清空系统日志

router.delete('/api/system-logs', async (req, res) => {
  await db.prepare('TRUNCATE TABLE system_logs').run();
  res.json({ success: true, message: '系统日志已清空' });
});


router.get('/api/debug/save-contract', (req, res) => {
  console.log('收到请求:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({ 
    received: true, 
    body: req.body,
    headers: req.headers['content-type']
  });
});


router.get('/api/sms-templates', async (req, res) => {
  try {
    const templates = await db.prepare('SELECT id, name, content, variables, is_active, sign_name, aliyun_template_code, created_at FROM sms_templates WHERE is_active=1 ORDER BY id').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 新建短信模板

router.post('/api/sms-templates', checkPermission('sms:write'), async (req, res) => {
  try {
    const { name, content, variables } = req.body;
    const result = await db.prepare(
      'INSERT INTO sms_templates (name, content, variables, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())'
    ).run([name, content, variables || null]);
    await addLog(userId, '', '新增', '短信模板', result.lastInsertRowid, name, `短信模板: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '短信模板创建成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT 更新短信模板

router.put('/api/sms-templates/:id', checkPermission('sms:write'), async (req, res) => {
  try {
    const { name, content, variables, is_active, sign_name, aliyun_template_code } = req.body;
    await db.prepare(
      'UPDATE sms_templates SET name=?, content=?, variables=?, is_active=?, sign_name=?, aliyun_template_code=?, updated_at=NOW() WHERE id=?'
    ).run([name, content, variables || null, is_active !== undefined ? is_active : 1, sign_name || null, aliyun_template_code || null, req.params.id]);
    await addLog(userId, '', '编辑', '短信模板', parseInt(req.params.id), name, `更新短信模板: ${name}`, req.ip);
    res.json({ message: '短信模板更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE 删除短信模板

router.delete('/api/sms-templates/:id', checkPermission('sms:delete'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [tpl] = await db.prepare('SELECT name FROM sms_templates WHERE id=?').all([req.params.id]);
    await db.prepare('DELETE FROM sms_templates WHERE id=?').run([req.params.id]);
    await addLog(userId, '', '删除', '短信模板', parseInt(req.params.id), tpl?.name || '', `删除短信模板: ${tpl?.name || req.params.id}`, req.ip);
    res.json({ message: '短信模板删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST 同步模板到阿里云

router.post('/api/sms-templates/sync-aliyun', async (req, res) => {
  try {
    const { template_id, sign_name } = req.body;
    if (!template_id || !sign_name) {
      return res.status(400).json({ error: '缺少template_id或sign_name' });
    }

    // 获取模板内容
    const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(template_id);
    if (!tmpl) return res.status(404).json({ error: '模板不存在' });

    // 获取阿里云配置（DB里setting_value是双重JSON：{"category":"sms","setting_value":{...}}）
    const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
    let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
    // 取最内层配置
    if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
    console.log('【DEBUG sync-aliyun】smsConfig:', JSON.stringify(smsConfig), 'provider:', smsConfig?.provider);
    if (!smsConfig || smsConfig.provider !== 'aliyun') {
      return res.status(400).json({ error: '阿里云短信未配置' });
    }

    // 阿里云 CreateSmsTemplate 要求变量格式为 ${code}，$ 在左边
    // 系统模板的 {客户姓名} -> ${name} 映射，供 SendSms 的 templateParam 英文 key 对应
    const varMap = { '客户姓名': 'name', '项目名称': 'project', '节点名称': 'node', '日期': 'date' };
    const varTypeMap = { name: 'name', project: 'user_nick', node: 'user_nick', date: 'time' };
    let aliyunContent = tmpl.content;
    for (const [cn, en] of Object.entries(varMap)) {
      aliyunContent = aliyunContent.split('{' + cn + '}').join('${' + en + '}');
    }
    // 提取模板中的变量，生成 TemplateRule（对象格式，key=变量名，value=阿里云类型枚举中文名）
    const foundVars = [...aliyunContent.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1]);
    const templateRuleObj = {};
    foundVars.forEach(v => {
      templateRuleObj[v] = varTypeMap[v] || '个人姓名';
    });
    const templateRuleStr = JSON.stringify(templateRuleObj);
    console.log('【DEBUG sync-aliyun】原始:', tmpl.content, '| 转换后:', aliyunContent, '| TemplateRule:', templateRuleStr);

    // 调用阿里云 CreateSmsTemplate API
    const result = await addAliyunSmsTemplate({
      accessKeyId: smsConfig.access_key_id,
      accessKeySecret: smsConfig.access_key_secret,
      signName: sign_name,
      templateName: tmpl.name,
      templateContent: aliyunContent,
      templateRule: templateRuleStr,
      remark: '由系统同步'
    });

    if (result.Code === 'OK' || result.TemplateCode) {
      const aliyunTemplateCode = result.TemplateCode;
      console.log('【同步阿里云成功】TemplateCode:', aliyunTemplateCode);
      // 保存到模板记录
      await db.prepare(
        'UPDATE sms_templates SET sign_name=?, aliyun_template_code=?, updated_at=NOW() WHERE id=?'
      ).run(sign_name, aliyunTemplateCode, template_id);
      res.json({ success: true, template_code: aliyunTemplateCode, message: '同步成功' });
    } else {
      console.log('【同步阿里云失败】result:', JSON.stringify(result));
      res.status(400).json({ error: result.Message || '同步失败' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 阿里云添加模板 API ====================

router.post('/api/sms-send', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { node_id, project_id, customer_phone } = req.body;
    
    // 获取节点、项目、模板信息
    const [node] = await db.prepare('SELECT n.*, p.name as project_name, c.name as customer_name, c.phone as customer_phone FROM project_progress_nodes n LEFT JOIN projects p ON n.project_id=p.id LEFT JOIN customers c ON p.customer_id=c.id WHERE n.id=?').all(node_id);
    if (!node) return res.status(404).json({ error: '节点不存在' });
    
    const templateId = node.sms_template_id;
    let smsContent = '';
    let templateName = '';
    
    if (templateId) {
      const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(templateId);
      if (tmpl) {
        templateName = tmpl.name;
        // 替换变量
        smsContent = tmpl.content
          .replace(/\{客户姓名\}/g, node.customer_name || '')
          .replace(/\{项目名称\}/g, node.project_name || '')
          .replace(/\{节点名称\}/g, node.node_name || '')
          .replace(/\{日期\}/g, new Date().toLocaleDateString('zh-CN'));
      }
    }
    
    // 国内手机号加86前缀（阿里云要求）
    const phone = customer_phone || node.customer_phone;
    const phoneWithCode = /^86/.test(phone) ? phone : '86' + phone;
    if (!phone) {
      // 写入失败日志
      await db.prepare(
        'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
      ).run(project_id, node_id, node.customer_name || '', '', templateId, templateName, smsContent, 'failed', '客户手机号为空');
      return res.status(400).json({ error: '客户手机号为空' });
    }
    
    // 读取阿里云短信配置（DB里setting_value是双重JSON）
    const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
    let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
    if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
    const smsApiConfigured = smsConfig && smsConfig.provider === 'aliyun' && smsConfig.access_key_id && smsConfig.access_key_secret;

    // 优先用模板自己绑定的阿里云模板CODE和签名，否则用全局配置
    let templateCodeForSend = smsConfig ? smsConfig.template_code : '';
    let signNameForSend = smsConfig ? smsConfig.sign_name : '';
    if (templateId) {
      const [tmpl] = await db.prepare('SELECT aliyun_template_code, sign_name FROM sms_templates WHERE id=?').all(templateId);
      if (tmpl && tmpl.aliyun_template_code) {
        templateCodeForSend = tmpl.aliyun_template_code;
        signNameForSend = tmpl.sign_name || smsConfig.sign_name;
      }
    }

    let sendStatus = 'failed';
    let failReason = '';

    if (smsApiConfigured) {
      // 真实发送阿里云短信
      try {
        const result = await sendAliyunSms({
          accessKeyId: smsConfig.access_key_id,
          accessKeySecret: smsConfig.access_key_secret,
          signName: signNameForSend,
          templateCode: templateCodeForSend,
          phone: phoneWithCode,
          templateParam: JSON.stringify({
            name: node.customer_name || '',
            project: node.project_name || '',
            node: node.node_name || '',
            date: new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' })
          })
        });
        if (result.Code === 'OK') {
          sendStatus = 'success';
        } else {
          sendStatus = 'failed';
          failReason = result.Message || '发送失败';
        }
      } catch (e) {
        sendStatus = 'failed';
        failReason = e.message;
      }
    } else {
      sendStatus = 'failed';
      failReason = '短信接口未配置（APIKEY/Secret未申请），发送队列等待中';
    }
    
    // 写入发送日志
    await db.prepare(
      'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
    ).run(project_id, node_id, node.customer_name || '', phone, templateId, templateName, smsContent, sendStatus, failReason);
    
    // 更新节点是否已发送短信标记
    await db.prepare('UPDATE project_progress_nodes SET is_sms_sent=? WHERE id=?').run(sendStatus === 'success' ? 1 : 0, node_id);
    
    res.json({ status: sendStatus, message: failReason || '发送成功', content: smsContent, phone, log_id: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 短信发送日志 API ====================

router.get('/api/sms-send-logs', async (req, res) => {
  try {
    const logs = await db.prepare(`
      SELECT l.*, n.node_name, p.name as project_name, t.name as template_name
      FROM sms_send_logs l
      LEFT JOIN project_progress_nodes n ON l.node_id=n.id
      LEFT JOIN projects p ON l.project_id=p.id
      LEFT JOIN sms_templates t ON l.template_id=t.id
      ORDER BY l.created_at DESC LIMIT 100
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 系统设置 API ====================

router.put('/api/system-settings/sms', checkPermission('settings:write'), async (req, res) => {
  try {
    // 前端提交的是扁平对象 {provider, access_key_id, ...}，需要包裹成双重JSON格式
    const value = JSON.stringify({ category: 'sms', setting_value: req.body });
    const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('sms');
    if (existing) {
      await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
        .run(value, new Date().toISOString(), 'sms');
    } else {
      await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('sms', value, new Date().toISOString(), new Date().toISOString());
    }
    res.json({ message: '保存成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/api/debug-perms', async (req, res) => {
  const phones = (req.query.phones || '').split(',');
  if (!phones.length) return res.json({ error: '需要 phones 参数' });
  try {
    const placeholders = phones.map(() => '?').join(',');
    const emps = await db.prepare(
      `SELECT e.id, e.name, e.phone, r.name as role_name, r.code as role_code, r.permissions
       FROM employees e LEFT JOIN roles r ON e.role_id = r.id
       WHERE e.phone IN (${placeholders})`
    ).all(...phones);
    const result = emps.map(e => ({
      id: e.id, name: e.name, phone: e.phone,
      role_name: e.role_name, role_code: e.role_code,
      permissions: e.permissions ? (typeof e.permissions === 'string' ? JSON.parse(e.permissions) : e.permissions) : []
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;