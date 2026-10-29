/**
 * 合同模板（2026-10-29 渐进拆分第 23 轮）
 *
 * 搬运自 server.js 两段，均逐字节原样搬入，未做任何逻辑调整：
 *   原 669-699 行（GET 列表，31 行）—— 原位置在 getUserId 定义之前
 *   原 906-966 行（POST / PUT / DELETE，61 行）
 * 两段原本隔着整个权限核心（getUserId / isAdmin / checkPermission 等），无法连续搬。
 * 合并到此处注册后，4 条路由的相对顺序不变；669-906 之间没有任何 app.use 或路由，
 * 因此列表接口的注册点从 669 后移到 906 不影响匹配（同方法同路径无重复注册）。
 */
module.exports = function registerContractTemplateRoutes(app, deps) {
  const {
    db,
    getUserId,
    isAdmin,
    addLog,
  } = deps;

  app.get('/api/contract-templates', async (req, res) => {
    const { template_type } = req.query;
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';

    let sql = 'SELECT * FROM contract_templates';
    const params = [];

    if (template_type) {
      // system模板所有人可见；personal模板只看自己创建的
      if (template_type === 'system') {
        sql += ' WHERE template_type = ?';
        params.push('system');
      } else {
        // personal 模板：管理员看全部，非管理员只看自己
        if (userRole === 'admin' || userRole === '超级管理员') {
          sql += ' WHERE template_type = ?';
          params.push('personal');
        } else {
          sql += ' WHERE template_type = ? AND created_by = ?';
          params.push('personal', userId);
        }
      }
    }

    sql += ' ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    res.json(params.length > 0 ? await stmt.all(...params) : await stmt.all());
  });

  app.post('/api/contract-templates', async (req, res) => {
    const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
    const userId = getUserId(req);
    const { name, category, content, is_default, template_type, template_fields } = req.body;
  
    // 检查权限：只有管理员可以创建系统模板
    if (template_type === 'system' && !(await isAdmin(userId))) {
      return res.status(403).json({ success: false, message: '只有管理员可以创建系统模板' });
    }
  
    const stmt = db.prepare('INSERT INTO contract_templates (name, category, content, is_default, template_type, template_fields, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', userId || null);
    await addLog(userId, '', '新增', '合同模板', result.lastInsertRowid, name, `模板名称: ${name}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/contract-templates/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
    const userId = getUserId(req);
    const { name, category, content, is_default, template_type, template_fields } = req.body;
  
    // 检查是否是系统模板
    const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: '模板不存在' });
    }
  
    // 检查权限：系统模板只有管理员可以修改
    if (template.template_type === 'system' && !(await isAdmin(userId))) {
      return res.status(403).json({ success: false, message: '只有管理员可以修改系统模板' });
    }
  
    const stmt = db.prepare('UPDATE contract_templates SET name=?, category=?, content=?, is_default=?, template_type=?, template_fields=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    await stmt.run(name, category, content, is_default || 0, template_type || 'personal', template_fields || '', req.params.id);
    await addLog(userId, '', '编辑', '合同模板', req.params.id, name, `更新模板: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/contract-templates/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'] || req.body.user_id;
    
    const userId = getUserId(req);
  
    // 检查是否是系统模板
    const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: '模板不存在' });
    }
  
    // 检查权限：系统模板只有管理员可以删除
    if (template.template_type === 'system' && !(await isAdmin(userId))) {
      return res.status(403).json({ success: false, message: '只有管理员可以删除系统模板' });
    }
  
    const stmt = db.prepare('DELETE FROM contract_templates WHERE id = ?');
    await await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '合同模板', req.params.id, template.name, `删除模板: ${template.name}`, req.ip);
    res.json({ message: '删除成功' });
  });
};
