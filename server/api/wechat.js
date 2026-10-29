'use strict';
/**
 * 微信集成：配置 / 员工身份 / 模板 / 订阅授权 / 通知分发
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 8 步，129 行 / 9 个路由）。
 * 代码逐行搬迁、逻辑零改动，只把外部依赖改成参数注入。
 *
 * 四个子域（原文件里用 1.2.3.4.5. 编号分开）：
 *   1. wechat_config       公众号/小程序 AppID & Secret
 *   2. wechat_identities   员工 ↔ openid/unionid 绑定
 *   3. wechat_templates   模板消息 template_id 登记
 *   4. subscribe_records   一次性订阅授权记录
 *   5. POST /api/notify/dispatch  统一通知分发（前端联调用）
 *
 * ⚠️ 这里大部分能力仍是 stub（占位实现），不是 bug：
 *    - getWechatAccessToken() 直接 return { token: null, stub: true }，
 *      从没真正调过微信 API。全库零调用点，纯为将来接入预留。
 *    - 响应文案自己写着「access_token 调用待接入 SDK」「实际推送待 SDK 接入」，
 *      所以库里 wechat_* 表有数据也不代表消息真的发出去了。
 *    真要接微信推送，从这里开始改，别在 server.js 里另起一份。
 *
 * ⚠️ GET /api/wechat/config 在 server.js 里注册了两次，本文件这个是**生效**的，
 *    另一份（旧 server.js 第 11205 行附近）永远不执行。改配置接口改这里。
 *    详见 docs/服务端路由清单.md 的「重复注册」表。
 *
 * ⚠️ 9 个接口全部没有权限校验，只靠 wechat_type 白名单（mp/mini）挡脏数据。
 *    /api/notify/dispatch 更是任意用户可调用任意 channel 发通知——
 *    这是已知缺口，已记在路由清单里，要收紧请单独立项。
 *
 * 注入的依赖（全部来自 server.js）：
 *   pool                   mysql2 连接池（本段不用 db/Database，全走 pool.query）
 *   dispatchNotification   统一通知分发（server.js 第 6511 行定义）
 */

module.exports = function registerWechatRoutes(app, deps) {
  const { pool, dispatchNotification, getUserId, isAdmin } = deps;

  // 2026-10-10 新增：access_token 缓存（微信 API 调用前置）
  const _wechatTokenCache = new Map();
  async function getWechatAccessToken(wechatType) {
    // TODO: 实际接入时从 wechat_config 读 appid/secret，调用微信 API
    // const [rows] = await pool.query('SELECT appid, app_secret FROM wechat_config WHERE wechat_type = ? AND is_default = 1', [wechatType]);
    // if (cached && !expired) return cached;
    // const res = await axios.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`);
    // cache.set(wechatType, { token: res.access_token, expires: Date.now() + 7000*1000 });
    return { token: null, stub: true, wechatType };
  }

  // =================== 微信小程序/公众号 配置 + 身份 + 模板 + 订阅 ===================
  // 1. 微信配置 CRUD
  // v2.5.3 鉴权加固：写入的是公众号/小程序 appid + app_secret（微信密钥），
  // 原本零校验 = 任何人可覆盖密钥，导致模板消息全站发不出去（或指向攻击者的号）。
  app.post('/api/wechat/config', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可修改微信配置' });
      const { wechat_type, appid, app_secret, is_default } = req.body;
      if (!wechat_type || !['mp', 'mini'].includes(wechat_type)) return res.status(400).json({ error: 'wechat_type 必须为 mp 或 mini' });
      if (is_default) await pool.query('UPDATE wechat_config SET is_default = 0');
      const [r] = await pool.query(
        'INSERT INTO wechat_config (wechat_type, appid, app_secret, is_default, created_at) VALUES (?, ?, ?, ?, NOW())',
        [wechat_type, appid || '', app_secret || '', is_default ? 1 : 0]
      );
      res.json({ id: r.insertId, message: '配置已保存（access_token 调用待接入 SDK）' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 2. 员工微信身份 CRUD
  app.get('/api/wechat/identity', async (req, res) => {
    try {
      const { employee_id, wechat_type } = req.query;
      let sql = 'SELECT * FROM wechat_identities WHERE 1=1';
      const params = [];
      if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
      if (wechat_type) { sql += ' AND wechat_type = ?'; params.push(wechat_type); }
      const [rows] = await pool.query(sql, params);
      res.json({ list: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wechat/identity', async (req, res) => {
    try {
      // v2.5.3 鉴权加固：绑定 employee_id ↔ openid，绑定关系决定「谁收到谁的推送」，
      // 匿名可写等于能把任意员工的通知改投到自己的微信上。要求登录即可。
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { employee_id, wechat_type, appid, openid, unionid } = req.body;
      if (!employee_id || !wechat_type) return res.status(400).json({ error: '缺少 employee_id 或 wechat_type' });
      if (!['mp', 'mini'].includes(wechat_type)) return res.status(400).json({ error: 'wechat_type 必须为 mp 或 mini' });
      if (!openid && !unionid) return res.status(400).json({ error: 'openid 和 unionid 至少需要一个' });
      // upsert
      await pool.query(
        `INSERT INTO wechat_identities (employee_id, wechat_type, appid, openid, unionid, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE appid=VALUES(appid), openid=COALESCE(VALUES(openid), openid), unionid=COALESCE(VALUES(unionid), unionid)`,
        [employee_id, wechat_type, appid || '', openid || null, unionid || null]
      );
      res.json({ message: '微信身份已绑定（待小程序上线后实际生效）' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 3. 微信模板 CRUD（用户在微信后台申请后，把 template_id 录入到这里）
  app.get('/api/wechat/templates', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM wechat_templates ORDER BY template_code, wechat_type');
      res.json({ list: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wechat/templates', async (req, res) => {
    try {
      // v2.5.3 鉴权加固：模板登记错会导致对应业务通知全部发不出去，属于系统级配置。
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可登记微信模板' });
      const { template_code, wechat_type, template_id, title, data_keys, status } = req.body;
      if (!template_code || !wechat_type || !template_id) return res.status(400).json({ error: '缺少必填字段 template_code/wechat_type/template_id' });
      await pool.query(
        `INSERT INTO wechat_templates (template_code, wechat_type, template_id, title, data_keys, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE template_id=VALUES(template_id), title=VALUES(title), data_keys=VALUES(data_keys), status=VALUES(status)`,
        [template_code, wechat_type, template_id, title || '', JSON.stringify(data_keys || []), status || 'active']
      );
      res.json({ message: '模板已注册（实际推送待 SDK 接入）' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 4. 订阅授权记录（用户在 H5/小程序里点订阅按钮后调用）
  app.get('/api/wechat/subscribe', async (req, res) => {
    try {
      const { employee_id } = req.query;
      if (!employee_id) return res.status(400).json({ error: '缺少 employee_id' });
      const [rows] = await pool.query(
        `SELECT * FROM subscribe_records WHERE employee_id = ? AND status='authorized' ORDER BY authorized_at DESC`,
        [employee_id]
      );
      res.json({ list: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wechat/subscribe', async (req, res) => {
    try {
      // v2.5.3 鉴权加固：订阅授权记录决定后续能不能给该员工发模板消息，匿名可写即伪造授权。
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { employee_id, template_id, expires_at } = req.body;
      if (!employee_id || !template_id) return res.status(400).json({ error: '缺少 employee_id 或 template_id' });
      await pool.query(
        `INSERT INTO subscribe_records (employee_id, template_id, authorized_at, expires_at, status)
         VALUES (?, ?, NOW(), ?, 'authorized')
         ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at), status='authorized'`,
        [employee_id, template_id, expires_at || null]
      );
      res.json({ message: '订阅授权已记录' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 5. 统一通知分发接口（前端/PC 端测试用）
  // v2.5.3 鉴权加固：能给任意 user_id 发任意标题正文的通知，是最容易用来钓鱼的入口
  // （伪造一条「财务通知：请打款到 XX 账户」）。仅管理员可取用。
  app.post('/api/notify/dispatch', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可手动分发通知' });
      const { user_id, channels, type, title, content, data, related_id, related_type } = req.body;
      if (!user_id) return res.status(400).json({ error: '缺少 user_id' });
      if (!title || !content) return res.status(400).json({ error: '缺少 title 或 content' });
      const results = await dispatchNotification({
        userId: user_id,
        channels: channels || ['inapp'],
        type: type || 'custom',
        title, content, data: data || {},
        relatedId: related_id,
        relatedType: related_type
      });
      res.json({ results, message: '通知已分发（外部通道为 stub）' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
