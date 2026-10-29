/**
 * 签约人管理（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 660-737 行，搬入时 78 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerSignerRoutes(app, deps) {
  const {
    db,
    getUserId,
    addLog,
  } = deps;

  // ==================== 签约人管理 ====================
  app.get('/api/signers', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { keyword } = req.query;
    try {
      let rows;
      if (keyword) {
        rows = await db.prepare('SELECT * FROM signers WHERE created_by = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY updated_at DESC').all(userId, `%${keyword}%`, `%${keyword}%`);
      } else {
        rows = await db.prepare('SELECT * FROM signers WHERE created_by = ? ORDER BY updated_at DESC').all(userId);
      }
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/signers', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { name, phone, id_card, remark } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请填写签约人姓名' });
    }
    try {
      const existing = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(name.trim(), userId);
      if (existing) {
        await db.prepare('UPDATE signers SET phone=?, id_card=?, remark=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(phone || '', id_card || '', remark || '', existing.id);
        res.json({ id: existing.id, message: '更新成功' });
      } else {
        const result = await db.prepare('INSERT INTO signers (name, phone, id_card, remark, created_by, creator_id) VALUES (?, ?, ?, ?, ?, ?)').run(name.trim(), phone || '', id_card || '', remark || '', userId, userId);
        await addLog(userId, '', '新增', '签约人管理', result.lastInsertRowid, name.trim(), `签约人: ${name.trim()}`, req.ip);
        res.json({ id: result.lastInsertRowid, message: '添加成功' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/signers/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { name, phone, id_card, remark } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请填写签约人姓名' });
    }
    try {
      const existing = await db.prepare('SELECT id FROM signers WHERE id = ? AND created_by = ?').get(req.params.id, userId);
      if (!existing) {
        return res.status(403).json({ error: '无权修改此签约人' });
      }
      await db.prepare('UPDATE signers SET name=?, phone=?, id_card=?, remark=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name.trim(), phone || '', id_card || '', remark || '', req.params.id);
      await addLog(userId, '', '编辑', '签约人管理', req.params.id, name, `更新签约人: ${name}`, req.ip);
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/signers/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    try {
      const [s] = await db.prepare('SELECT name FROM signers WHERE id = ?').all(req.params.id);
      const sName = s ? s.name : req.params.id;
      await db.prepare('DELETE FROM signers WHERE id = ? AND created_by = ?').run(req.params.id, userId);
      await addLog(userId, '', '删除', '签约人管理', req.params.id, sName, `删除签约人: ${sName}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

};
