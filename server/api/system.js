'use strict';
/**
 * 系统设置 + 站内通知（system-settings / notifications）
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 6 轮，329 行 / 16 个路由）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入。
 * 同日「清洗死代码」又删掉其中 3 条重复注册，现为 13 个路由。
 *
 * 为什么整段搬、不按主题拆成两个文件：
 *   在 server.js 里这两组路由是**物理连续**的一整段，只是 system-settings
 *   的 4 个路由被 notifications 从中间隔开。要是跳着切成 system-settings.js
 *   + notifications.js，`/api/system-settings/notifications`（通知规则）就会
 *   排到 `/api/notifications` 之前，注册顺序白白变化。Express 顺序敏感，
 *   这类拆分唯一真正要紧的安全属性就是「顺序不变」，所以宁可主题混一点。
 *   将来要细分，从这个文件里切，比在 server.js 里切安全得多。
 *
 * 现存 13 个路由：
 *   GET    /api/system-settings                       系统配置总览（密钥打码）
 *   PUT    /api/system-settings/sms|wechat|email      三类配置保存
 *   GET    /api/notifications/unread-count            未读数（合并 messages 表）
 *   POST   /api/notifications                         管理员手动发消息
 *   DELETE /api/notifications/:id                     删除单条
 *   DELETE /api/notifications                         批量删除
 *   GET    /api/notifications/admin-list              后台消息列表
 *   GET/PUT /api/system-settings/notifications        通知规则（节点触发开关）
 *   GET/POST /api/system-settings/customer_visibility 业主端 8 个可见开关
 *
 * ✅ 2026-10-29 已清洗掉 3 条死代码（原来在这里但永不执行）：
 *   GET  /api/notifications          弃用，生效的是 server.js:5810
 *   PUT  /api/notifications/:id/read 弃用，生效的是 server.js:5837
 *   PUT  /api/notifications/read-all 弃用，生效的是 server.js:5848
 *   Express 对「同方法 + 同路径」只认第一条，server.js 那三条注册在本文件之前
 *   （第 5810 行附近），所以本文件里的恒不命中。已删，重复注册组数降为 0。
 *
 *   教训：看到「同源两份实现」，先确认哪份在跑再改。v2.5.2 就是改过
 *   `routes/employees.js` 这种死代码，改完不生效，排查半天。
 *
 *   历史教训：v2.5.2 就把 `routes/employees.js` 这类同源死代码当活代码改过，
 *   改完不生效，排查半天。看到本文件里的这三条，先确认再动手。
 *
 * ⚠️ 其它已知隐患（都没动，只记录）：
 *   1. `GET /api/system-settings` 只给 secret 打码，access_key_id / smtp 账号
 *      是**明文**返回（实测返回了阿里云 AccessKey ID 全串）。打码只挡回显，
 *      不代表接口安全 —— 有 settings:read 就能拿到半敏感字段。
 *   2. `PUT /api/system-settings/wechat` 是**整对象覆盖**，没有像 sms/email
 *      那样的「打码串回填」保护。前端若把打码后的 app_secret 原样回传，
 *      库里就会存下 `****abcd`，小程序登录会静默失败。这是真实的踩坑点。
 *   3. `GET /api/system-settings/notifications` **没有权限校验**（PUT 有），
 *      任何登录用户都能读到通知规则的完整开关配置。
 *   4. `GET /api/system-settings/customer_visibility` 同样无权限校验。
 *   5. 未读数口径是两表相加：notifications 按 receiver_phone、messages 按
 *      user_id。两表若重复记同一条事件会重复计数。
 *
 * 注入的依赖（全部来自 server.js）：
 *   db                        Database 实例（prepare 风格）
 *   pool                      mysql2 连接池（query 返回 [rows, fields]）
 *   mysqlPool                 server.js 第 165 行的别名，就是同一个 pool
 *   checkPermission           server.js 第 2422 行，精确匹配权限点
 *   getUserId                 req → 员工 id
 *   isAdmin                   是否管理员
 *   addLog                    写操作日志
 *   getDefaultNotificationRules  server.js 第 950 行，默认节点通知规则
 *   maskSettingsSecrets       来自 ./lib/secrets
 *   isMaskedOrEmpty           来自 ./lib/secrets
 */

module.exports = function registerSystemRoutes(app, deps) {
  const { db, pool, mysqlPool, checkPermission, getUserId, isAdmin, addLog, getDefaultNotificationRules, maskSettingsSecrets, isMaskedOrEmpty } = deps;
  // ==================== 系统设置 API ====================
  // 敏感字段打码逻辑已抽到 ./lib/secrets.js（maskSettingsSecrets / isMaskedOrEmpty）

  async function getSettingsCategory(category) {
    const row = await db.prepare('SELECT setting_value FROM system_settings WHERE category = ?').get(category);
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.setting_value);
      return parsed.setting_value || parsed || {};
    } catch {
      return {};
    }
  }

  app.get('/api/system-settings', checkPermission('settings:read'), async (req, res) => {
    try {
      const rows = await db.prepare('SELECT * FROM system_settings').all();
      const settings = {};
      rows.forEach(row => {
        try {
          const parsed = JSON.parse(row.setting_value);
          // SMS 配置是双重JSON格式，取最内层 setting_value；其他保持原样
          settings[row.category] = parsed.setting_value || parsed;
        } catch {
          settings[row.category] = row.setting_value;
        }
      });
      res.json(maskSettingsSecrets(settings));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/system-settings/sms', checkPermission('settings:write'), async (req, res) => {
    try {
      // 前端提交的是扁平对象 {provider, access_key_id, ...}，需要包裹成双重JSON格式
      const body = { ...req.body };
      // 密钥留空/仍是打码串 → 沿用库中原值（防止把 ****abcd 这种打码串写进库）
      if (isMaskedOrEmpty(body.access_key_secret)) {
        const old = await getSettingsCategory('sms');
        body.access_key_secret = old.access_key_secret || '';
      }
      const value = JSON.stringify({ category: 'sms', setting_value: body });
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

  app.put('/api/system-settings/wechat', checkPermission('settings:write'), async (req, res) => {
    try {
      const value = JSON.stringify(req.body);
      const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('wechat');
      if (existing) {
        await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
          .run(value, new Date().toISOString(), 'wechat');
      } else {
        await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('wechat', value, new Date().toISOString(), new Date().toISOString());
      }
      res.json({ message: '保存成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/system-settings/email', checkPermission('settings:write'), async (req, res) => {
    try {
      const body = { ...req.body };
      // 邮箱密码留空/仍是打码串 → 沿用库中原值
      if (isMaskedOrEmpty(body.smtp_password)) {
        const old = await getSettingsCategory('email');
        body.smtp_password = old.smtp_password || '';
      }
      const value = JSON.stringify(body);
      const existing = await db.prepare('SELECT id FROM system_settings WHERE category = ?').get('email');
      if (existing) {
        await db.prepare('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?')
          .run(value, new Date().toISOString(), 'email');
      } else {
        await db.prepare('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('email', value, new Date().toISOString(), new Date().toISOString());
      }
      res.json({ message: '保存成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 站内消息通知 API（MySQL: notifications 表）====================
  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { phone: phoneParam } = req.query;

      let phone = phoneParam || null;
      if (!phone && userId > 0) {
        const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
        phone = emp ? emp.phone : null;
      }
      if (!phone) { res.json({ count: 0 }); return; }

      // v2.3.1：合并两表（notifications 按手机号 + messages 按 user_id），与移动端消息页口径一致
      const [r1] = await mysqlPool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [phone]);
      const [r2] = await mysqlPool.query('SELECT COUNT(*) AS cnt FROM messages WHERE user_id = ? AND is_read = 0', [userId || 0]);
      const count = Number(r1[0].cnt || 0) + Number(r2[0].cnt || 0);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 消息管理 API（后台增删改）====================
  // POST 新增消息（管理员手动发消息）
  app.post('/api/notifications', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
      const { title, content, type, receiver_phone, receiver_name, channels } = req.body;
      if (!title || !receiver_phone) return res.status(400).json({ error: '标题和接收人手机号不能为空' });
      await mysqlPool.query(
        'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())',
        [title, content || '', type || 'admin_notice', 0, 'admin', userId, receiver_phone, receiver_name || '', channels || 'inapp', 'pending']
      );
      const [notifId] = await mysqlPool.query('SELECT LAST_INSERT_ID() as id');
      await addLog(userId, '', '新增', '通知消息', notifId[0]?.id || 0, title, `发送通知: ${title}`, req.ip);
      res.json({ message: '消息发送成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE 删除消息
  app.delete('/api/notifications/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
      const [notif] = await mysqlPool.query('SELECT title FROM notifications WHERE id = ?', [req.params.id]);
      await mysqlPool.query('DELETE FROM notifications WHERE id = ?', [req.params.id]);
      await addLog(userId, '', '删除', '通知消息', parseInt(req.params.id), notif[0]?.title || '', `删除通知: ${notif[0]?.title || req.params.id}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE 批量删除消息
  app.delete('/api/notifications', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供要删除的消息ID列表' });
      const placeholders = ids.map(() => '?').join(',');
      await mysqlPool.query(`DELETE FROM notifications WHERE id IN (${placeholders})`, ids);
      await addLog(userId, '', '删除', '通知消息', 0, '', `批量删除${ids.length}条通知`, req.ip);
      res.json({ message: '批量删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET 后台消息列表（管理员查看所有消息，不受手机号限制）
  app.get('/api/notifications/admin-list', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可操作' });
      const { page = 1, pageSize = 20, is_read, keyword } = req.query;
      let where = '1=1';
      const params = [];
      if (is_read !== undefined) {
        where += ' AND is_read = ?';
        params.push(is_read === 'true' ? 1 : 0);
      }
      if (keyword) {
        where += ' AND (title LIKE ? OR content LIKE ? OR receiver_name LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      const [totalRows] = await mysqlPool.query(`SELECT COUNT(*) as cnt FROM notifications WHERE ${where}`, params);
      const [list] = await mysqlPool.query(
        `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)]
      );
      res.json({ list, total: totalRows[0].cnt, page: parseInt(page), pageSize: parseInt(pageSize) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 通知规则设置 API ====================
  app.get('/api/system-settings/notifications', async (req, res) => {
    try {
      const [row] = await mysqlPool.query('SELECT * FROM system_settings WHERE category = ?', ['notifications']);
      if (row[0]) {
        try { res.json(JSON.parse(row[0].setting_value)); } catch { res.json({}); }
      } else { res.json(getDefaultNotificationRules()); }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/system-settings/notifications', checkPermission('settings:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const value = JSON.stringify(req.body);
      const [existing] = await mysqlPool.query('SELECT id FROM system_settings WHERE category = ?', ['notifications']);
      if (existing[0]) {
        await mysqlPool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
          [value, new Date().toISOString(), 'notifications']);
      } else {
        await mysqlPool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
          ['notifications', value, new Date().toISOString(), new Date().toISOString()]);
      }
      await addLog(userId, '', '编辑', '系统设置', null, '通知规则', `更新通知规则设置`, req.ip);
      res.json({ message: '保存成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== 客户端可见（业主 8 开关，全局一份）v2.3.1 P3 ====================
  const __DEFAULT_CV = () => ({
    project_info: true,
    project_log: true,
    inspection: true,
    acceptance: true,
    rectification: true,
    contract_amount: false,
    family_members: true,
    messages: true,
  });

  app.get('/api/system-settings/customer_visibility', async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'customer_visibility' LIMIT 1");
      if (rows && rows[0]) {
        try { return res.json(JSON.parse(rows[0].setting_value)); } catch {}
      }
      res.json(__DEFAULT_CV());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/system-settings/customer_visibility', checkPermission('settings:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const incoming = (req.body && req.body.setting_value) || req.body || {};
      // 归并默认值 + 白名单过滤，避免脏数据写入
      const merged = { ...__DEFAULT_CV() };
      const keys = Object.keys(__DEFAULT_CV());
      for (const k of keys) if (k in incoming) merged[k] = !!incoming[k];
      const value = JSON.stringify(merged);
      const [existing] = await pool.query("SELECT id FROM system_settings WHERE category = 'customer_visibility' LIMIT 1");
      if (existing && existing[0]) {
        await pool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
          [value, new Date().toISOString(), 'customer_visibility']);
      } else {
        await pool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
          ['customer_visibility', value, new Date().toISOString(), new Date().toISOString()]);
      }
      await addLog(userId, '', '编辑', '系统设置', null, '客户端可见', `更新客户端可见配置: ${JSON.stringify(merged)}`, req.ip);
      res.json({ message: '保存成功', data: merged });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};
