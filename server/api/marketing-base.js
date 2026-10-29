'use strict';
/**
 * 营销基础资料：楼盘 / 分销渠道 / 营销案例
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 7 步，12 个路由 / 107 行）。
 * 代码逐行搬迁、逻辑零改动，只把外部依赖改成参数注入。
 *
 * 三张表结构同构，每个都是标准 CRUD（GET 列表 / POST 新增 / PUT 修改 / DELETE 删除）：
 *   buildings        楼盘表    name, address, area, building_type, total_houses,
 *                              developer, property_fee, status
 *   channels         分销渠道  name, type, contact_person, contact_phone,
 *                              address, commission_rate, status, remark
 *   marketing_cases  营销案例  title, building_name, area, style, budget, cost,
 *                              images(JSON), description, status, publish_date
 *
 * ⚠️ 鉴权现状（v2.5.3 已部分收紧）：
 *    - GET 仍无权限点（谁都能读），POST 已要求登录（401 兜底），DELETE 有 isAdmin。
 *    - PUT 仍是零校验，改动会写 addLog，但没有身份/权限判断 —— 后续要收紧从这里入手。
 *    三端目前都走 axios / uni.request，拦截器自动带 x-user-id，所以登录校验不会断页面。
 *    其余未收紧的接口已记在 docs/服务端路由清单.md 的「无权限校验」表里。
 *
 * ⚠️ 表名是扁平的（buildings / channels / marketing_cases），不叫 marketing_buildings。
 *    历史原因，改表名要同步改前端和 SQL，别动。
 *
 * 注入的依赖（全部来自 server.js）：
 *   db          Database 实例（prepare 风格）
 *   getUserId   req → 员工 id
 *   isAdmin     userId → 是否管理员（仅 DELETE 用）
 *   addLog      写操作日志
 */

module.exports = function registerMarketingBaseRoutes(app, deps) {
  const { db, getUserId, isAdmin, addLog } = deps;

  // 楼盘管理
  app.get('/api/buildings', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  // v2.5.3 鉴权加固：本模块 12 个接口原本 POST/PUT 全裸奔（只有 DELETE 有 isAdmin）。
  // 现在给三个 POST 补登录校验（前端都走 axios，带 x-user-id，不会断）。
  // 同时补 try/catch —— 原实现 await 抛错即 unhandled rejection，Node 18+ 直接退进程。
  app.post('/api/buildings', async (req, res) => {
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    try {
      const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
      const stmt = db.prepare('INSERT INTO buildings (name, address, area, building_type, total_houses, developer, property_fee, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(name, address, area, building_type, total_houses, developer, property_fee, status || '在售');
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/buildings/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { name, address, area, building_type, total_houses, developer, property_fee, status } = req.body;
    await db.prepare('UPDATE buildings SET name=?, address=?, area=?, building_type=?, total_houses=?, developer=?, property_fee=?, status=? WHERE id=?')
      .run(name, address, area, building_type, total_houses, developer, property_fee, status, req.params.id);
    await addLog(userId, '', '编辑', '楼盘管理', req.params.id, name, `更新楼盘: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/buildings/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [b] = await db.prepare('SELECT name FROM buildings WHERE id = ?').all(req.params.id);
    const bName = b ? b.name : req.params.id;
    await db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '楼盘管理', req.params.id, bName, `删除楼盘: ${bName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 渠道管理
  app.get('/api/channels', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM channels ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/channels', async (req, res) => {
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    try {
      const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
      const stmt = db.prepare('INSERT INTO channels (name, type, contact_person, contact_phone, address, commission_rate, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(name, type, contact_person, contact_phone, address, commission_rate || 0, status || '合作中', remark);
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/channels/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { name, type, contact_person, contact_phone, address, commission_rate, status, remark } = req.body;
    await db.prepare('UPDATE channels SET name=?, type=?, contact_person=?, contact_phone=?, address=?, commission_rate=?, status=?, remark=? WHERE id=?')
      .run(name, type, contact_person, contact_phone, address, commission_rate, status, remark, req.params.id);
    await addLog(userId, '', '编辑', '渠道管理', req.params.id, name, `更新渠道: ${name}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/channels/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [c] = await db.prepare('SELECT name FROM channels WHERE id = ?').all(req.params.id);
    const cName = c ? c.name : req.params.id;
    await db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '渠道管理', req.params.id, cName, `删除渠道: ${cName}`, req.ip);
    res.json({ message: '删除成功' });
  });

  // 营销案例
  app.get('/api/marketing-cases', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM marketing_cases ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/marketing-cases', async (req, res) => {
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    try {
      const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
      const stmt = db.prepare('INSERT INTO marketing_cases (title, building_name, area, style, budget, cost, images, description, status, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status || '草稿', publish_date);
      res.json({ id: result.lastInsertRowid, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/marketing-cases/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { title, building_name, area, style, budget, cost, images, description, status, publish_date } = req.body;
    await db.prepare('UPDATE marketing_cases SET title=?, building_name=?, area=?, style=?, budget=?, cost=?, images=?, description=?, status=?, publish_date=? WHERE id=?')
      .run(title, building_name, area, style, budget, cost, JSON.stringify(images || []), description, status, publish_date, req.params.id);
    await addLog(userId, '', '编辑', '营销案例', req.params.id, title, `更新案例: ${title}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/marketing-cases/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [mc] = await db.prepare('SELECT title FROM marketing_cases WHERE id = ?').all(req.params.id);
    const mcTitle = mc ? mc.title : req.params.id;
    await db.prepare('DELETE FROM marketing_cases WHERE id = ?').run(req.params.id);
    await addLog(userId, '', '删除', '营销案例', req.params.id, mcTitle, `删除案例: ${mcTitle}`, req.ip);
    res.json({ message: '删除成功' });
  });
};
