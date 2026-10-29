/**
 * 微信小程序接入 API（2026-10-29 渐进拆分第 12 轮）
 *
 * 本文件搬运自 server.js 原 10042-11288 行，逐字节原样搬入：
 *   1. 微信 API 内部函数（jscode2session / 用户信息 / access_token 缓存 / 小程序码 / 模板消息）
 *   2. 员工微信绑定：小程序码生成（含 unionid 回填、绑定状态）
 *   3. 小程序微信登录（静默 openid + 手机号验证码绑定）
 *
 * 这些符号块外无任何引用（均已被本文件内的路由消费），所以全部私有，
 * 不需要像 aliyun-sms 那样外提。
 *
 * ⚠️ 注册顺序敏感：本模块夹在「系统设置」和「合同上传」之间，
 *    小程序码那段会被后面的合同/验收路由依赖 wechat_users 表写入顺序，别随便挪位置。
 */
module.exports = function registerWechatMiniRoutes(app, deps) {
  const {
    pool, db, https, crypto,
    getUserId, isAdmin, checkPermission, getUserPermissions, addLog,
    normalizePhone, isPhone,
    maskSettingsSecrets, isMaskedOrEmpty, SETTINGS_SECRET_KEYS,
    sendAliyunSms,
    // v2.5.3：统一「按手机号认身份」+ 家庭成员待绑定流程
    customerLogin,
  } = deps;

  // ==================== 微信接入 API ====================

  // 微信 API 内部函数：通过 code 获取 openid/session_key（小程序用）
  async function getWechatSession(code, type, config) {
    const url = type === 'mini'
      ? `https://api.weixin.qq.com/sns/jscode2session?appid=${config.app_id}&secret=${config.app_secret}&js_code=${code}&grant_type=authorization_code`
      : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${config.app_id}&secret=${config.app_secret}&code=${code}&grant_type=authorization_code`;
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  // 微信 API 内部函数：获取用户信息（公众号/开放平台）
  async function getWechatUserInfo(openid, accessToken) {
    const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  // 微信 API 内部函数：获取全局 access_token（用于发送模板消息）
  async function getGlobalAccessToken(config) {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.app_id}&secret=${config.app_secret}`;
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  // ==================== 员工微信绑定：小程序码生成 ====================
  // access_token 缓存：微信限 2000 次/天，不缓存的话管理员多点几次生成码就会耗尽额度。
  // 单进程部署（node server.js）下内存缓存足够；若将来上 pm2 cluster 需换 Redis。
  const wxTokenCache = new Map(); // appid → { token, expiresAt }

  async function getCachedAccessToken(cfg) {
    const key = cfg.app_id;
    const hit = wxTokenCache.get(key);
    // 提前 5 分钟刷新，避免临界点用到刚过期的 token
    if (hit && hit.expiresAt > Date.now() + 5 * 60 * 1000) return hit.token;
    const r = await getGlobalAccessToken(cfg);
    if (!r || !r.access_token) {
      throw new Error((r && r.errmsg) || '获取 access_token 失败');
    }
    wxTokenCache.set(key, {
      token: r.access_token,
      expiresAt: Date.now() + (Number(r.expires_in) || 7200) * 1000,
    });
    return r.access_token;
  }

  /**
   * 生成员工绑定用的小程序码（返回 Buffer，失败抛错）
   *
   * ⚠️ check_path 必须 false：实测线上版本未索引页面时传 true 会对所有 page 报
   *    41030 invalid page（连 pages/home/index 都失败）。
   *    代价是微信不校验页面是否存在 —— 所以 pages/bind/scan 必须先随新版发布上线。
   *
   * @param {string} ticket 一次性票据，放 scene（微信限制 32 字符）
   * @param {object} cfg    { app_id, app_secret }
   */
  function generateMiniCode(ticket, cfg) {
    return new Promise(async (resolve, reject) => {
      try {
        const token = await getCachedAccessToken(cfg);
        const bodyStr = JSON.stringify({
          scene: String(ticket).slice(0, 32),
          page: 'pages/bind/scan',
          width: 430,
          check_path: false,
        });
        const req = https.request(
          `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
            },
          },
          (resp) => {
            const chunks = [];
            resp.on('data', (c) => chunks.push(c));
            resp.on('end', () => {
              const buf = Buffer.concat(chunks);
              const ct = String(resp.headers['content-type'] || '');
              // 成功返回二进制图片；失败返回 JSON
              if (ct.includes('json') || ct.includes('text')) {
                let msg = buf.toString().slice(0, 200);
                try { msg = JSON.parse(buf.toString()).errmsg || msg; } catch (_) { /* 保留原文 */ }
                return reject(new Error('小程序码生成失败：' + msg));
              }
              resolve(buf);
            });
          }
        );
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  /** 库里的 DATETIME 是 UTC 字符串（dateStrings:true），转时间戳要补 Z */
  function utcStrToTs(s) {
    if (!s) return 0;
    const str = String(s);
    return new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z').getTime();
  }

  // jscode2session 的 errmsg 是英文 + rid（"invalid code, rid: 6ad9..."），
  // 直接甩给用户看不懂。统一翻译成人话，原始信息只进日志。
  function friendlyWxErr(errmsg) {
    const m = String(errmsg || '');
    if (/invalid code|code been used|40029|40163/i.test(m)) return '微信登录凭证已失效，请重新进入小程序';
    if (/45011|frequen/i.test(m)) return '操作太频繁，请稍后再试';
    if (/40125|invalid appsecret/i.test(m)) return '小程序密钥配置有误，请联系管理员';
    if (/40013|invalid appid/i.test(m)) return '小程序 AppID 配置有误，请联系管理员';
    return '微信登录失败，请重试';
  }

  // 微信 API 内部函数：发送模板消息
  async function sendWechatTemplateMsg(openid, templateId, data, accessToken) {
    const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
    const body = {
      touser: openid,
      template_id: templateId,
      data: data
    };
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  // 读取 system_settings（兼容双重 JSON）
  async function getSetting(category) {
    try {
      const [row] = await pool.query('SELECT setting_value FROM system_settings WHERE category = ?', [category]);
      if (!row[0]) return null;
      const parsed = JSON.parse(row[0].setting_value);
      return parsed.setting_value || parsed;
    } catch { return null; }
  }

  // 保存 system_settings（兼容双重 JSON）
  async function saveSetting(category, data) {
    const value = JSON.stringify({ setting_value: data });
    const [existing] = await pool.query('SELECT id FROM system_settings WHERE category = ?', [category]);
    if (existing[0]) {
      await pool.query('UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE category = ?',
        [value, new Date().toISOString(), category]);
    } else {
      await pool.query('INSERT INTO system_settings (category, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [category, value, new Date().toISOString(), new Date().toISOString()]);
    }
  }

  // GET /api/wechat/config — 获取三个平台配置（secret 类字段打码）
  // ------------------------------------------------------------------
  // 2026-10-29 三处一起改，必须成套，缺一个就出事故：
  //   1. 权限：原来没有任何校验（而 PUT 有 settings:write），读写门槛倒置，
  //      等于任何登录用户都能拿到小程序 AppSecret。已补 settings:read。
  //   2. 读取打码：app_secret / token / aes_key 走 maskSettingsSecrets，
  //      只回末 4 位。此前是**明文**返回。
  //   3. 保存回填：见下面 mergeWechatSecret。只做 2 不做 3，前端会把
  //      `****3e9e` 原样存进库，小程序登录静默失败 —— 这是 /api/system-settings/
  //      wechat 至今存在的问题（那个接口前端没人用，没顺手动）。
  // 为什么现在才暴露：本接口此前被 api/wechat.js 的同名路由（返回 {list}）
  // 挡在前面从未执行过，清洗重复注册后才真正生效。
  app.get('/api/wechat/config', checkPermission('settings:read'), async (req, res) => {
    try {
      const [mp, mini, openplatform] = await Promise.all([
        getSetting('wechat_mp'),
        getSetting('wechat_mini'),
        getSetting('wechat_openplatform')
      ]);
      res.json(maskSettingsSecrets({
        mp: mp || {},
        mini: mini || {},
        openplatform: openplatform || {},
      }));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // 打码串回填：前端把读到的 `****3e9e` 原样传回来时，用库里原值覆盖，
  // 避免把打码串当成新密钥写进库。判据和 /api/system-settings/sms|email 一致
  // （isMaskedOrEmpty：空值 / undefined / 以 **** 开头都算「不修改」）。
  // ⚠️ 副作用：因此**无法通过本接口把密钥清空**，只能改成别的值或直接改库。
  async function mergeWechatSecret(category, incoming) {
    const merged = { ...incoming };
    const maskedKeys = SETTINGS_SECRET_KEYS.filter(k => k in merged && isMaskedOrEmpty(merged[k]));
    if (maskedKeys.length === 0) return merged;
    const old = (await getSetting(category)) || {};
    for (const k of maskedKeys) {
      merged[k] = old[k] || '';
    }
    return merged;
  }

  // PUT /api/wechat/config — 保存三个平台配置（密钥留空/打码串 → 沿用库中原值）
  app.put('/api/wechat/config', checkPermission('settings:write'), async (req, res) => {
    try {
      const { mp, mini, openplatform } = req.body;
      if (mp) await saveSetting('wechat_mp', await mergeWechatSecret('wechat_mp', mp));
      if (mini) await saveSetting('wechat_mini', await mergeWechatSecret('wechat_mini', mini));
      if (openplatform) await saveSetting('wechat_openplatform', await mergeWechatSecret('wechat_openplatform', openplatform));
      res.json({ message: '保存成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wechat/oauth-url — 获取微信授权链接
  // type=mp（公众号）或 type=mini（小程序）
  app.get('/api/wechat/oauth-url', async (req, res) => {
    try {
      const { type } = req.query;
      const config = type === 'mini' ? await getSetting('wechat_mini') : await getSetting('wechat_mp');
      if (!config || !config.app_id || !config.app_secret) {
        return res.status(400).json({ error: '微信配置未完成，请在系统设置中配置' });
      }
      const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/wechat/callback?type=${type}`);
      const scope = type === 'mini' ? 'snsapi_userinfo' : 'snsapi_userinfo';
      const state = type; // 标记来源类型
      const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${config.app_id}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
      res.json({ url });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wechat/callback — 微信授权回调
  app.get('/api/wechat/callback', async (req, res) => {
    try {
      const { code, type, state } = req.query;
      if (!code) return res.status(400).json({ error: '缺少 code' });

      const config = state === 'mini' ? await getSetting('wechat_mini') : await getSetting('wechat_mp');
      if (!config) return res.status(400).json({ error: '微信配置未完成' });

      // 用 code 换 openid + access_token
      const session = await getWechatSession(code, state, config);
      if (session.errcode) {
        return res.status(400).json({ error: session.errmsg || '获取session失败' });
      }

      const openid = session.openid;
      const accessToken = session.access_token;

      // 获取用户基本信息
      let userInfo = { openid, nickname: '', avatar: '', gender: 0, country: '', province: '', city: '' };
      try {
        const info = await getWechatUserInfo(openid, accessToken);
        if (!info.errcode) {
          userInfo = {
            openid,
            nickname: info.nickname || '',
            avatar: info.headimgurl || '',
            gender: info.sex || 0,
            country: info.country || '',
            province: info.province || '',
            city: info.city || ''
          };
        }
      } catch {}

      // 检查是否已存在
      const field = state === 'mini' ? 'mini_openid' : 'mp_openid';
      const [existing] = await pool.query(`SELECT * FROM wechat_users WHERE ${field} = ? AND status = 1`, [openid]);

      const result = {
        openid,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar,
        gender: userInfo.gender,
        country: userInfo.country,
        province: userInfo.province,
        city: userInfo.city,
        type: state,
        already_bound: existing.length > 0,
        wechat_user_id: existing.length > 0 ? existing[0].id : null,
        unionid: existing.length > 0 ? existing[0].unionid : (session.unionid || null)
      };

      // 返回 JSON 而不是跳转，前端处理绑定流程
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wechat/bind — 绑定手机号 + 微信用户
  app.post('/api/wechat/bind', async (req, res) => {
    try {
      const { phone, openid, unionid, nickname, avatar, gender, type } = req.body;
      if (!phone || !openid) return res.status(400).json({ error: '手机号和openid不能为空' });

      const field = type === 'mini' ? 'mini_openid' : 'mp_openid';

      // 查找该 openid 是否已绑定过
      const [existing] = await pool.query(`SELECT id FROM wechat_users WHERE ${field} = ?`, [openid]);

      const now = new Date().toISOString();

      if (existing.length > 0) {
        // 更新已有记录
        await pool.query(
          `UPDATE wechat_users SET phone=?, unionid=COALESCE(?,unionid), nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar), gender=?, bind_time=?, status=1, unsubscribe_time=NULL WHERE id=?`,
          [phone, unionid, nickname, avatar, gender || 0, now, existing[0].id]
        );
        res.json({ message: '绑定成功', id: existing[0].id });
      } else {
        // 新增记录
        const [result] = await pool.query(
          `INSERT INTO wechat_users (${field}, unionid, phone, nickname, avatar, gender, bind_time, status, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [openid, unionid, phone, nickname, avatar, gender || 0, now, now, now]
        );
        res.json({ message: '绑定成功', id: result.insertId });
      }

      // 同步更新 customers 表的微信字段（按手机号匹配）
      if (unionid) {
        await pool.query(
          `UPDATE customers SET wechat_unionid=?, wechat_nickname=?, wechat_avatar=?, wechat_bind_time=? WHERE phone=? AND (wechat_unionid IS NULL OR wechat_unionid='')`,
          [unionid, nickname, avatar, now, phone]
        );
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/wechat/bind/:id — 解绑
  app.delete('/api/wechat/bind/:id', checkPermission('settings:write'), async (req, res) => {
    try {
      const now = new Date().toISOString();
      await pool.query('UPDATE wechat_users SET status=0, unsubscribe_time=? WHERE id=?', [now, req.params.id]);
      res.json({ message: '解绑成功' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wechat/users — 微信客户列表（含关联客户信息 + 统计）
  // 2026-10-19 v2.3.9：支持 linked 筛选、openid 关键字搜索、返回 stats 统计
  app.get('/api/wechat/users', async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, keyword, type, linked } = req.query;
      const userId = getUserId(req);
      const userRole = req.headers['x-user-role'];

      const conds = [];
      const params = [];

      if (status !== undefined && status !== '') {
        conds.push('w.status = ?'); params.push(Number(status));
      } else {
        conds.push('w.status = 1');
      }
      if (keyword) {
        conds.push('(w.nickname LIKE ? OR w.phone LIKE ? OR w.mini_openid LIKE ? OR w.mp_openid LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k, k, k, k, k);
      }
      if (type === 'mini') conds.push("w.mini_openid IS NOT NULL AND w.mini_openid != ''");
      if (type === 'mp') conds.push("w.mp_openid IS NOT NULL AND w.mp_openid != ''");
      if (linked === '1') conds.push('w.customer_id IS NOT NULL');
      if (linked === '0') conds.push('w.customer_id IS NULL');

      // 普通员工只能看自己名下客户关联的微信用户（未关联客户的不隐藏，避免绑定后"消失"）
      if (userRole !== 'admin') {
        const [empRows] = await pool.query('SELECT permissions FROM employees WHERE id = ?', [userId]);
        const perms = empRows[0] ? JSON.parse(empRows[0].permissions || '[]') : [];
        if (!perms.includes('customer_all')) {
          conds.push('(c.creator_id = ? OR w.customer_id IS NULL)');
          params.push(userId);
        }
      }

      const where = `WHERE ${conds.join(' AND ')}`;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      const [total] = await pool.query(
        `SELECT COUNT(*) as cnt FROM wechat_users w LEFT JOIN customers c ON w.customer_id = c.id ${where}`, params);
      const [list] = await pool.query(
        `SELECT w.*, c.name as customer_name, c.phone as customer_phone, c.customer_no,
                e.name as employee_name
         FROM wechat_users w
         LEFT JOIN customers c ON w.customer_id = c.id
         LEFT JOIN employees e ON w.employee_id = e.id
         ${where}
         ORDER BY w.bind_time DESC, w.id DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(pageSize), offset]
      );

      // 统计看全量（不受当前筛选影响）
      // 注意：wechat_users 的时间字段统一用 toISOString() 写入（UTC），
      // 所以「今日」的起点要取本地零点的 UTC 表示，否则会差 8 小时。
      const now = new Date();
      const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayStart = localMidnight.toISOString().slice(0, 19).replace('T', ' ');
      const [[stat]] = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN mini_openid IS NOT NULL AND mini_openid != '' THEN 1 ELSE 0 END) as mini,
                SUM(CASE WHEN mp_openid IS NOT NULL AND mp_openid != '' THEN 1 ELSE 0 END) as mp,
                SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as phoneBound,
                SUM(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
                SUM(CASE WHEN bind_time >= ? THEN 1 ELSE 0 END) as today
         FROM wechat_users WHERE status = 1`, [todayStart]
      );

      res.json({
        list,
        total: total[0].cnt,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        stats: {
          total: Number(stat.total || 0),
          mini: Number(stat.mini || 0),
          mp: Number(stat.mp || 0),
          phoneBound: Number(stat.phoneBound || 0),
          linked: Number(stat.linked || 0),
          today: Number(stat.today || 0),
        },
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wechat/users/:id — 单个微信用户详情
  app.get('/api/wechat/users/:id', async (req, res) => {
    try {
      const [row] = await pool.query(
        `SELECT w.*, c.name as customer_name, c.phone as customer_phone, c.id as oa_customer_id,
                e.name as employee_name, e.phone as employee_phone, e.id as oa_employee_id
         FROM wechat_users w
         LEFT JOIN customers c ON w.customer_id = c.id
         LEFT JOIN employees e ON w.employee_id = e.id
         WHERE w.id = ?`, [req.params.id]
      );
      if (!row[0]) return res.status(404).json({ error: '用户不存在' });
      res.json(row[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wechat/push — 推送微信消息（内部接口，供发消息逻辑调用）
  // body: { phone, template_id, data: { key: { value, color } } }
  // v2.5.3 鉴权加固：全项目搜过没有调用方，但它是「按手机号发任意模板消息」的开关，
  // 匿名可用就等于给外部留了一个免费群发通道。这里要求登录；
  // 后端内部若要推送，请直接调 sendWechatTemplateMsg()，不要 HTTP 打自己（那条路不带 header 会 401）。
  app.post('/api/wechat/push', async (req, res) => {
    try {
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { phone, template_id, data } = req.body;
      if (!phone || !template_id) return res.status(400).json({ error: '手机号和模板ID不能为空' });

      // 查找该手机号绑定的微信用户（优先用公众号）
      const [users] = await pool.query(
        `SELECT * FROM wechat_users WHERE phone = ? AND status = 1 ORDER BY mp_openid DESC LIMIT 1`,
        [phone]
      );

      if (!users[0]) {
        return res.json({ success: false, reason: '该手机号未绑定微信' });
      }

      const user = users[0];
      const openid = user.mp_openid || user.mini_openid;
      if (!openid) return res.json({ success: false, reason: '无有效OpenID' });

      // 获取公众号配置（发送模板消息用公众号）
      const config = await getSetting('wechat_mp');
      if (!config || !config.app_id || !config.app_secret) {
        return res.json({ success: false, reason: '微信公众号配置未完成' });
      }

      // 获取全局 access_token
      const tokenResp = await getGlobalAccessToken(config);
      if (tokenResp.errcode) {
        return res.json({ success: false, reason: tokenResp.errmsg });
      }

      // 发送模板消息
      const result = await sendWechatTemplateMsg(openid, template_id, data, tokenResp.access_token);
      if (result.errcode === 0) {
        res.json({ success: true, msgid: result.msgid });
      } else {
        res.json({ success: false, reason: result.errmsg, errcode: result.errcode });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wechat/push-by-unionid — 按 UnionID 推送（用于开放平台场景）
  app.post('/api/wechat/push-by-unionid', async (req, res) => {
    try {
      // v2.5.3 鉴权加固：同 /api/wechat/push。
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const { unionid, template_id, data } = req.body;
      if (!unionid || !template_id) return res.status(400).json({ error: 'UnionID和模板ID不能为空' });

      const [users] = await pool.query(
        `SELECT * FROM wechat_users WHERE unionid = ? AND status = 1 LIMIT 1`,
        [unionid]
      );
      if (!users[0]) return res.json({ success: false, reason: '未找到绑定的微信用户' });

      const user = users[0];
      const openid = user.mp_openid || user.mini_openid;
      if (!openid) return res.json({ success: false, reason: '无有效OpenID' });

      const config = await getSetting('wechat_mp');
      if (!config) return res.json({ success: false, reason: '微信公众号配置未完成' });

      const tokenResp = await getGlobalAccessToken(config);
      if (tokenResp.errcode) return res.json({ success: false, reason: tokenResp.errmsg });

      const result = await sendWechatTemplateMsg(openid, template_id, data, tokenResp.access_token);
      if (result.errcode === 0) {
        res.json({ success: true, msgid: result.msgid });
      } else {
        res.json({ success: false, reason: result.errmsg, errcode: result.errcode });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wechat/bind-status/:phone — 查询手机号绑定状态
  app.get('/api/wechat/bind-status/:phone', async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT id, nickname, avatar, bind_time, status, mp_openid, mini_openid, unionid FROM wechat_users WHERE phone = ?`,
        [req.params.phone]
      );
      if (!users[0]) return res.json({ bound: false });
      const u = users[0];
      res.json({
        bound: u.status === 1,
        boundChannels: {
          mp: !!(u.mp_openid),
          mini: !!(u.mini_openid)
        },
        unionid: u.unionid,
        nickname: u.nickname,
        avatar: u.avatar,
        bindTime: u.bind_time
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==================== 小程序微信登录（静默 openid + 手机号绑定） ====================
  // 设计说明：
  //   微信自 2022-10-25 回收 getUserProfile 后，小程序端**拿不到**真实头像昵称，
  //   头像昵称只能由用户主动填写（chooseAvatar / input type=nickname），且不能作为身份标识。
  //   因此身份链路改为：wx.login 静默拿 openid → 手机号（唯一认证标识）绑定 → 映射到 customers。
  //   openid 仅用于"记住这台微信"，不承担认证作用。

  /** 读取小程序 appid/secret：优先环境变量，其次 system_settings.wechat_mini */
  async function getMiniConfig() {
    const envId = (process.env.WX_MINI_APPID || '').trim();
    const envSecret = (process.env.WX_MINI_SECRET || '').trim();
    if (envId && envSecret) return { app_id: envId, app_secret: envSecret };
    const cfg = await getSetting('wechat_mini');
    if (cfg && cfg.app_id && cfg.app_secret) return { app_id: cfg.app_id, app_secret: cfg.app_secret };
    return null;
  }

  /**
   * 按手机号解析客户身份。
   *
   * 2026-10-29 v2.5.3：实现搬到 lib/customer-login.js，本文件不再自己查表。
   * 搬走的原因：此前 /api/customers/login、/api/customer-auth/login-by-code、
   * 本文件三处各写了一份，且都是「先查 family_members 再查 customers」，
   * 导致有独立客户档案的人被别人的家庭成员登记抢走身份（库里「郑大」就是实例）。
   * 现在统一口径：自己的客户档案优先；家庭成员要先确认加入才生效。
   *
   * @returns {ok, kind:'master'|'member'|'pending', customer?, member?, master?, message?}
   */
  const resolveCustomerByPhone = (phone) => customerLogin.resolveCustomerByPhone(phone);

  /* ==================== 业主端：手机验证码登录（v2.5.2） ====================
   * 为什么加这一套：原来的 /api/customers/login 只凭手机号就能登录，
   * 知道客户手机号 = 拿到该客户全部档案。改成「手机号 + 短信验证码」。
   *
   * 设计要点：
   *   - 验证码只存 sha256，不存明文；5 分钟过期、一次性、错 5 次作废
   *   - 三重限流防短信轰炸（同号 60 秒 / 同号 1 小时 / 同 IP 1 小时）
   *   - 发送与校验的响应不区分「手机号是否为客户」，防客户手机号枚举
   *   - 登录成功返回结构与 /api/customers/login 完全一致，移动端可直接复用保存逻辑
   */

  const SMS_CODE_TTL_MIN = 5;        // 验证码有效期（分钟）
  const SMS_CODE_MAX_FAIL = 5;       // 同一验证码最多试错次数
  const SMS_CODE_RESEND_SEC = 60;    // 同手机号重发间隔（秒）
  const SMS_CODE_PHONE_HOUR = 5;     // 同手机号每小时最多发几条
  const SMS_CODE_IP_HOUR = 20;       // 同 IP 每小时最多发几条

  /** 读短信配置，兼容库里 {"category":"sms","setting_value":{...}} 的双层包裹 */
  async function getSmsConfig() {
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category='sms'");
    if (!rows.length) return null;
    let cfg;
    try { cfg = JSON.parse(rows[0].setting_value); } catch (e) { return null; }
    if (cfg && cfg.setting_value) cfg = cfg.setting_value;
    return cfg;
  }

  // 手机号归一化/校验已抽到 ./lib/phone.js（normalizePhone / isPhone）
  const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

  /** 发送验证码短信。模板文案要求只用 ${code} 一个变量，有效期限写在文案里。 */
  async function sendCustomerSmsCode(phone, code) {
    const cfg = await getSmsConfig();
    if (!cfg || cfg.provider !== 'aliyun') return { success: false, reason: 'sms_not_configured' };
    if (!cfg.access_key_id || !cfg.access_key_secret) return { success: false, reason: 'sms_config_incomplete' };
    const templateCode = cfg.code_template_code || '';
    if (!templateCode) return { success: false, reason: 'code_template_not_configured' };

    try {
      const r = await sendAliyunSms({
        accessKeyId: cfg.access_key_id,
        accessKeySecret: cfg.access_key_secret,
        signName: cfg.sign_name || '简逸装饰',
        templateCode,
        phone: phone.startsWith('+') ? phone : '+86' + phone,
        templateParam: JSON.stringify({ code })
      });
      if (r && r.Code === 'OK') return { success: true };
      return { success: false, error: (r && (r.Message || r.Code)) || 'unknown' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // POST /api/customer-auth/send-code — 发送登录验证码
  app.post('/api/customer-auth/send-code', async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      if (!isPhone(phone)) return res.json({ success: false, message: '请输入正确的手机号' });
      const ip = String(req.ip || '').replace('::ffff:', '').slice(0, 60);

      // 限流 1：同手机号 60 秒内只能发一次
      const [recent] = await pool.query(
        `SELECT id FROM sms_codes WHERE phone=? AND scene='login'
          AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 1`,
        [phone, SMS_CODE_RESEND_SEC]
      );
      if (recent.length) {
        return res.json({ success: false, code: 'TOO_FREQUENT', message: '发送太频繁，请稍后再试' });
      }

      // 限流 2：同手机号 1 小时上限
      const [byPhone] = await pool.query(
        `SELECT COUNT(*) AS n FROM sms_codes WHERE phone=? AND scene='login'
          AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
        [phone]
      );
      if (Number(byPhone[0].n) >= SMS_CODE_PHONE_HOUR) {
        return res.json({ success: false, code: 'TOO_MANY', message: '该手机号验证次数过多，请稍后再试' });
      }

      // 限流 3：同 IP 1 小时上限（公司同出口 IP，阈值放宽，只挡大规模扫描）
      if (ip) {
        const [byIp] = await pool.query(
          `SELECT COUNT(*) AS n FROM sms_codes WHERE ip=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
          [ip]
        );
        if (Number(byIp[0].n) >= SMS_CODE_IP_HOUR) {
          return res.json({ success: false, code: 'IP_LIMIT', message: '请求过于频繁，请稍后再试' });
        }
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const [ins] = await pool.query(
        `INSERT INTO sms_codes (phone, scene, code_hash, expires_at, fail_count, ip, created_at)
         VALUES (?, 'login', ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, ?, NOW())`,
        [phone, hashCode(code), SMS_CODE_TTL_MIN, ip]
      );

      const send = await sendCustomerSmsCode(phone, code);
      if (!send.success) {
        // 发不出去就删掉这条，别白占配额
        await pool.query('DELETE FROM sms_codes WHERE id=?', [ins.insertId]);
        console.error('[sms-code] 发送失败:', send.reason || send.error);
        const msg = send.reason === 'code_template_not_configured'
          ? '短信验证码模板未配置，请联系管理员'
          : '短信发送失败，请稍后再试';
        return res.json({ success: false, code: send.reason || 'SEND_FAILED', message: msg });
      }

      // 不暴露该手机号是否已登记客户
      res.json({ success: true, message: '验证码已发送，请注意查收', ttl: SMS_CODE_TTL_MIN * 60 });
    } catch (err) {
      console.error('send-code error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/customer-auth/login-by-code — 手机号 + 验证码登录
  app.post('/api/customer-auth/login-by-code', async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      const code = String((req.body && req.body.code) || '').trim();
      if (!isPhone(phone)) return res.json({ success: false, message: '请输入正确的手机号' });
      if (!/^\d{6}$/.test(code)) return res.json({ success: false, message: '请输入 6 位验证码' });

      // 过期判断交给 MySQL（dateStrings:true 时 JS 解析库里的时间会有时区偏差）
      const [rows] = await pool.query(
        `SELECT id, code_hash, fail_count, (expires_at > NOW()) AS not_expired
           FROM sms_codes
          WHERE phone=? AND scene='login' AND used_at IS NULL
          ORDER BY id DESC LIMIT 1`,
        [phone]
      );
      if (!rows.length) return res.json({ success: false, message: '请先获取验证码' });

      const rec = rows[0];
      if (Number(rec.not_expired) !== 1) {
        return res.json({ success: false, message: '验证码已过期，请重新获取' });
      }
      if (Number(rec.fail_count) >= SMS_CODE_MAX_FAIL) {
        return res.json({ success: false, message: '验证码错误次数过多，请重新获取' });
      }
      if (rec.code_hash !== hashCode(code)) {
        await pool.query('UPDATE sms_codes SET fail_count=fail_count+1 WHERE id=?', [rec.id]);
        return res.json({ success: false, message: '验证码错误' });
      }

      await pool.query('UPDATE sms_codes SET used_at=NOW() WHERE id=?', [rec.id]);

      // 认身份：主账户 / 已加入的成员 / 待确认加入的成员
      const who = await resolveCustomerByPhone(phone);
      if (!who || !who.ok) {
        return res.json({ success: false, message: '未查询到您名下的装修项目，请联系为您服务的销售人员或设计师为您添加' });
      }

      // ── 待加入：业主登记了这个号码，但本人从没确认过 ──
      // 不返回任何项目进度/合同信息，只给一个一次性 bindToken（5 分钟、用完即焚），
      // 前端列出「XX 邀请您查看 YY 项目」，用户点一次确认后调
      // /api/family-members/confirm-bind（支持批量，多个项目一次绑完）。
      // 业主填错一位数字时，陌生人在这里就被挡住了，进不去这家人。
      if (who.kind === 'pending') {
        const bindToken = customerLogin.issueBindToken(who, null);
        return res.json(customerLogin.buildPendingPayload(who, bindToken));
      }

      const payload = customerLogin.buildLoginPayload(who, { loginType: 'sms_code' });
      const cid = payload.customer && payload.customer.id;
      await addLog(0, (payload.customer && payload.customer.name) || '', '登录', '业主端', cid, (payload.customer && payload.customer.name) || '', '手机验证码登录', req.ip);

      // 结构与 /api/customers/login 对齐，移动端 saveCustomerIdentity 可直接复用
      res.json(payload);
    } catch (err) {
      console.error('login-by-code error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/wechat/mini-login — 静默登录：code 换 openid，返回可用身份列表
  // v2.5.0：从「只认客户」扩展为「同时认员工 + 业主」，返回 identities 数组。
  //         ⚠️ 旧字段（customer / isFamilyMember / masterCustomerId）必须保留，
  //            移动端 saveCustomerIdentity() 依赖它们，删了业主登录会挂。
  app.post('/api/wechat/mini-login', async (req, res) => {
    try {
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

      const cfg = await getMiniConfig();
      if (!cfg) return res.status(500).json({ success: false, message: '微信小程序配置未完成' });

      const session = await getWechatSession(code, 'mini', cfg);
      if (!session || session.errcode) {
        console.warn('[wechat] jscode2session:', session && session.errmsg);
        return res.json({ success: false, message: friendlyWxErr(session && session.errmsg) });
      }
      const openid = session.openid;
      if (!openid) return res.json({ success: false, message: '未获取到 openid' });

      const [rows] = await pool.query(
        'SELECT * FROM wechat_users WHERE mini_openid = ? AND status = 1 LIMIT 1', [openid]
      );
      const wxUser = rows[0];
      const unionid = (wxUser && wxUser.unionid) || session.unionid || null;

      // 完全没有记录：新微信，前端展示绑定引导
      if (!wxUser) {
        return res.json({
          success: true, bound: false, openid, unionid,
          nickname: '', avatar: '', hasProfile: false,
          identities: [], preferred: null,
        });
      }

      const identities = [];
      let customerIdent = null;

      // ---------- 员工身份 ----------
      if (wxUser.employee_id) {
        const emp = await db.prepare(`
          SELECT e.id, e.username, e.name, e.phone, e.position, e.status,
                 r.name AS role_name, r.code AS role_code
          FROM employees e LEFT JOIN roles r ON e.role_id = r.id
          WHERE e.id = ?
        `).get(wxUser.employee_id);

        // 离职 / 员工记录被删 → 绑定自动失效，顺手清库（下次要重新扫码绑定）
        if (!emp || emp.status !== '在职') {
          await pool.query(
            'UPDATE wechat_users SET employee_id = NULL, last_identity = NULL, update_time = ? WHERE id = ?',
            [new Date().toISOString(), wxUser.id]
          );
          wxUser.employee_id = null;
        } else {
          identities.push({
            type: 'employee',
            employee_id: emp.id,
            name: emp.name || '',
            username: emp.username || '',
            phone: emp.phone || '',
            position: emp.position || '',
            role_code: emp.role_code || '',
            role_name: emp.role_name || '',
            permissions: await getUserPermissions(emp.id),
            is_admin: await isAdmin(emp.id),
          });
        }
      }

      // ---------- 业主身份 ----------
      // v2.5.3：家庭成员必须先「本人确认加入家庭」才算有身份。
      //   已确认（member） → 进 identities，customer_id 给主账户 id
      //   待确认（pending）→ **不进 identities**，只在顶层回 pendingFamily，
      //                      前端看到后引导去「手机号 + 验证码」走确认流程。
      //                      静默登录不能替用户点确认，否则业主填错号码就等于自动放人进来。
      let pendingFamily = null;
      if (wxUser.phone) {
        const ident = await resolveCustomerByPhone(wxUser.phone);

        if (ident.ok && ident.kind === 'pending') {
          // 待确认：静默登录不能替用户点确认（否则业主填错号码就等于自动放人进来），
          // 只把「谁邀请你看哪个项目」带出去，前端引导去手机号+验证码确认。
          pendingFamily = {
            masterName: (ident.master && ident.master.name) || '',
            relation: (ident.member && ident.member.relation) || '',
            memberName: (ident.member && ident.member.name) || '',
            memberId: ident.member && ident.member.id,
            pendingProjects: customerLogin.mapPendingProjects(ident.pendingMembers),
          };
        } else if (ident.ok) {
          const payload = customerLogin.buildLoginPayload(ident, { loginType: 'wechat' });
          customerIdent = payload;
          const cid = payload.masterCustomerId || (payload.customer && payload.customer.id) || null;
          identities.push({
            type: 'customer',
            customer_id: cid,
            name: (payload.customer && payload.customer.name) || '',
            phone: wxUser.phone,
            isFamilyMember: !!payload.isFamilyMember,
          });

          // 兼容历史数据：早期绑定没写 customer_id，这里顺手补上（PC「微信客户」才能显示关联客户）
          if (!wxUser.customer_id && cid) {
            await pool.query('UPDATE wechat_users SET customer_id=?, update_time=? WHERE id=?',
              [cid, new Date().toISOString(), wxUser.id]);
          }
        }
      }

      // 上次选择的身份仍有效就用它；只有一个身份就直接用；否则让前端选
      const validTypes = identities.map((i) => i.type);
      const preferred = (wxUser.last_identity && validTypes.includes(wxUser.last_identity))
        ? wxUser.last_identity
        : (identities.length === 1 ? identities[0].type : null);

      return res.json({
        success: true,
        bound: identities.length > 0,
        openid,
        unionid,
        nickname: wxUser.nickname || '',
        avatar: wxUser.avatar || '',
        phone: wxUser.phone || '',
        hasProfile: !!(wxUser.nickname || wxUser.avatar),
        identities,
        preferred,
        // ↓ 待确认加入家庭：不返回任何档案，只让前端提示「请用手机号+验证码登录确认加入」
        ...(pendingFamily ? { pendingFamily } : {}),
        // ↓ 兼容旧逻辑：业主字段原样展开（无业主身份时不带 customer，前端不会误存）
        ...(customerIdent || {}),
      });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // POST /api/wechat/mini-bind-by-ticket — 员工扫码绑定（管理员发码版）
  // 入参传 code 不传 openid：openid 一律由服务端用 code 换，不信任前端。
  app.post('/api/wechat/mini-bind-by-ticket', async (req, res) => {
    try {
      const { code, ticket } = req.body || {};
      if (!code) return res.status(400).json({ success: false, message: '缺少 code' });
      const tk = String(ticket || '').trim();
      if (!tk) return res.status(400).json({ success: false, message: '缺少绑定码' });

      const cfg = await getMiniConfig();
      if (!cfg) return res.status(500).json({ success: false, message: '微信小程序配置未完成' });

      const session = await getWechatSession(code, 'mini', cfg);
      if (!session || session.errcode) {
        console.warn('[wechat] jscode2session:', session && session.errmsg);
        return res.json({ success: false, message: friendlyWxErr(session && session.errmsg) });
      }
      const openid = session.openid;
      if (!openid) return res.json({ success: false, message: '未获取到 openid' });

      const nowIso = new Date().toISOString();

      // 1. 票据校验
      const t = await db.prepare('SELECT * FROM employee_bind_tickets WHERE ticket = ? LIMIT 1').get(tk);
      if (!t) return res.json({ success: false, message: '绑定码无效，请让管理员重新生成' });
      if (t.used_at) return res.json({ success: false, message: '该绑定码已被使用，请让管理员重新生成' });
      if (utcStrToTs(t.expires_at) <= Date.now()) {
        return res.json({ success: false, message: '绑定码已过期，请让管理员重新生成' });
      }

      // 2. 员工校验
      const emp = await db.prepare(`
        SELECT e.id, e.username, e.name, e.phone, e.position, e.status,
               r.name AS role_name, r.code AS role_code
        FROM employees e LEFT JOIN roles r ON e.role_id = r.id
        WHERE e.id = ?
      `).get(t.employee_id);
      if (!emp) return res.json({ success: false, message: '该员工不存在，请联系管理员' });
      if (emp.status !== '在职') return res.json({ success: false, message: '该账号已停用，请联系管理员' });

      // 3. 该员工是否已被别的微信占用
      const occupied = await db.prepare(
        'SELECT id FROM wechat_users WHERE employee_id = ? AND mini_openid <> ? LIMIT 1'
      ).get(emp.id, openid);
      if (occupied) {
        return res.json({ success: false, message: '该账号已绑定其他微信，请先在后台解绑' });
      }

      // 4. 当前微信是否已绑了别的员工
      const self = await db.prepare('SELECT * FROM wechat_users WHERE mini_openid = ? LIMIT 1').get(openid);
      if (self && self.employee_id && Number(self.employee_id) !== Number(emp.id)) {
        return res.json({ success: false, message: '当前微信已绑定其他员工账号，请先在后台解绑' });
      }

      // 5. 事务写入：绑定关系 + 票据标记
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (self) {
          await conn.query(
            `UPDATE wechat_users
               SET employee_id = ?, phone = COALESCE(?, phone), bind_time = ?,
                   last_identity = 'employee', status = 1, update_time = ?
             WHERE id = ?`,
            [emp.id, emp.phone || null, nowIso, nowIso, self.id]
          );
        } else {
          await conn.query(
            `INSERT INTO wechat_users
               (mini_openid, unionid, employee_id, phone, bind_time, last_identity, status, create_time, update_time)
             VALUES (?, ?, ?, ?, ?, 'employee', 1, ?, ?)`,
            [openid, session.unionid || null, emp.id, emp.phone || null, nowIso, nowIso, nowIso]
          );
        }
        await conn.query(
          'UPDATE employee_bind_tickets SET used_at = ?, used_openid = ? WHERE id = ? AND used_at IS NULL',
          [nowIso, openid, t.id]
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      return res.json({
        success: true,
        message: '绑定成功',
        employee: {
          id: emp.id,
          name: emp.name || '',
          username: emp.username || '',
          phone: emp.phone || '',
          position: emp.position || '',
          role_code: emp.role_code || '',
          role_name: emp.role_name || '',
          permissions: await getUserPermissions(emp.id),
          is_admin: await isAdmin(emp.id),
        },
      });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // POST /api/wechat/my-bind-status — 员工自查微信绑定状态（「我的」页用）
  // ⚠️ 必须校验 x-user-type：employees.id 与 customers.id 是两套自增序列、会撞号，
  //    不校验的话业主查这个接口会命中同号员工的绑定记录（信息泄露 + 误判）。
  app.post('/api/wechat/my-bind-status', async (req, res) => {
    try {
      const userType = String(req.headers['x-user-type'] || '').toLowerCase();
      if (userType !== 'employee') {
        return res.status(403).json({ success: false, message: '仅员工可查询微信绑定状态' });
      }
      const employeeId = getUserId(req);
      if (!employeeId) return res.status(401).json({ success: false, message: '未登录' });

      const row = await db.prepare(
        'SELECT mini_openid, nickname, bind_time FROM wechat_users WHERE employee_id = ? LIMIT 1'
      ).get(employeeId);

      if (!row) return res.json({ success: true, bound: false, is_current: false });

      // 传了 code 才能判断「当前这台微信是不是绑定的那台」。
      // 不传（如 H5）只能回答「该账号绑过微信」，is_current 返回 null 表示未知。
      let isCurrent = null;
      const code = String((req.body || {}).code || '').trim();
      if (code) {
        try {
          const cfg = await getMiniConfig();
          if (cfg) {
            const session = await getWechatSession(code, 'mini', cfg);
            if (session && session.openid) isCurrent = session.openid === row.mini_openid;
          }
        } catch (e) {
          // 换 openid 失败不影响「有没有绑过」这个结论，降级为未知
          console.warn('[my-bind-status]', e.message);
        }
      }

      const oid = String(row.mini_openid || '');
      res.json({
        success: true,
        bound: true,
        is_current: isCurrent,
        bind_time: row.bind_time || '',
        nickname: row.nickname || '',
        openid_mask: oid.length >= 8 ? oid.slice(0, 4) + '***' + oid.slice(-4) : '',
      });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // POST /api/admin/employees/:id/bind-qrcode — 管理员生成员工微信绑定码
  app.post('/api/admin/employees/:id/bind-qrcode', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: '未登录' });
      const perms = await getUserPermissions(userId);
      const canWrite = (await isAdmin(userId)) || perms.includes('employee:write') || perms.includes('*');
      if (!canWrite) return res.status(403).json({ success: false, message: '仅管理员可生成绑定码' });

      const employeeId = parseInt(req.params.id, 10);
      if (!employeeId) return res.status(400).json({ success: false, message: '员工 id 无效' });

      const emp = await db.prepare('SELECT id, name, status FROM employees WHERE id = ?').get(employeeId);
      if (!emp) return res.status(404).json({ success: false, message: '员工不存在' });
      if (emp.status !== '在职') return res.json({ success: false, message: '该员工不是在职状态，无法绑定' });

      const bound = await db.prepare('SELECT id FROM wechat_users WHERE employee_id = ? LIMIT 1').get(employeeId);
      if (bound) return res.json({ success: false, message: '该员工已绑定微信，请先解绑' });

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const expiresIso = new Date(now + 10 * 60 * 1000).toISOString();

      // 作废该员工此前所有未使用的票据，避免同时存在多个有效码
      await pool.query(
        'UPDATE employee_bind_tickets SET expires_at = ? WHERE employee_id = ? AND used_at IS NULL AND expires_at > ?',
        [nowIso, employeeId, nowIso]
      );

      const ticket = crypto.randomBytes(8).toString('hex'); // 16 位十六进制
      await pool.query(
        `INSERT INTO employee_bind_tickets (ticket, employee_id, created_by, expires_at, create_time)
         VALUES (?, ?, ?, ?, ?)`,
        [ticket, employeeId, userId, expiresIso, nowIso]
      );

      // 生成小程序码；失败不阻断，返回 ticket 让 PC 前端降级画普通二维码
      let qrcode = null;
      let warn = '';
      const cfg = await getMiniConfig();
      if (!cfg) {
        warn = '小程序配置缺失';
      } else {
        try {
          const buf = await generateMiniCode(ticket, cfg);
          qrcode = 'data:image/jpeg;base64,' + buf.toString('base64');
        } catch (e) {
          warn = e.message;
          console.warn('[bind-qrcode]', e.message);
        }
      }

      res.json({
        success: true,
        ticket,
        expires_at: expiresIso,
        qrcode,                       // null → 前端降级
        fallback: !qrcode,
        warn: warn || undefined,
        employee: { id: emp.id, name: emp.name },
      });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // POST /api/admin/wechat/unbind-employee — 管理员解除员工微信绑定
  app.post('/api/admin/wechat/unbind-employee', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: '未登录' });
      const perms = await getUserPermissions(userId);
      const canWrite = (await isAdmin(userId)) || perms.includes('employee:write') || perms.includes('*');
      if (!canWrite) return res.status(403).json({ success: false, message: '仅管理员可解绑' });

      const employeeId = parseInt((req.body || {}).employee_id, 10);
      if (!employeeId) return res.status(400).json({ success: false, message: '缺少 employee_id' });

      const row = await db.prepare('SELECT id, customer_id FROM wechat_users WHERE employee_id = ? LIMIT 1').get(employeeId);
      if (!row) return res.json({ success: true, message: '该员工未绑定微信' });

      const nowIso = new Date().toISOString();
      // 没有业主身份 → 整行删掉，不留空壳；否则只清员工字段
      if (!row.customer_id) {
        await pool.query('DELETE FROM wechat_users WHERE id = ?', [row.id]);
      } else {
        await pool.query(
          'UPDATE wechat_users SET employee_id = NULL, last_identity = NULL, update_time = ? WHERE id = ?',
          [nowIso, row.id]
        );
      }
      // 顺手作废该员工未使用的票据
      await pool.query(
        'UPDATE employee_bind_tickets SET expires_at = ? WHERE employee_id = ? AND used_at IS NULL',
        [nowIso, employeeId]
      );

      res.json({ success: true, message: '已解除绑定' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // GET /api/admin/employees/bind-status — 员工微信绑定状态（PC 列表用）
  // ⚠️ 必须注册在 /api/admin/employees/:id 之前，否则 bind-status 会被当成 id
  app.get('/api/admin/employees/bind-status', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: '未登录' });
      const perms = await getUserPermissions(userId);
      const canRead = (await isAdmin(userId)) || perms.includes('employee:read') || perms.includes('*');
      if (!canRead) return res.status(403).json({ success: false, message: '无权限' });

      const rows = await db.prepare(
        'SELECT employee_id, mini_openid, bind_time, nickname, avatar FROM wechat_users WHERE employee_id IS NOT NULL'
      ).all();

      const data = {};
      rows.forEach((r) => {
        const oid = r.mini_openid || '';
        data[r.employee_id] = {
          employee_id: r.employee_id,
          bound: true,
          openid_mask: oid ? oid.slice(0, 6) + '***' + oid.slice(-4) : '',
          bind_time: r.bind_time,
          nickname: r.nickname || '',
          avatar: r.avatar || '',
        };
      });
      res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });


  // POST /api/wechat/mini-bind — 绑定手机号（手机号是唯一认证标识）
  // ⚠️ 安全提示（v2.5.3 记档）：本接口仍然只凭 openid + 手机号就把两者绑在一起，
  //    没有验证「这个手机号确实是操作者本人的」。风险等级：中（需要知道 openid 才能调）。
  //    正解是改用微信 getPhoneNumber 的 code 换手机号，或改走短信验证码，
  //    本次未动，见 docs/家庭成员绑定逻辑-v2.5.3.md 的「遗留」一节。
  app.post('/api/wechat/mini-bind', async (req, res) => {
    try {
      const { openid, phone, nickname, avatar } = req.body || {};
      if (!openid) return res.status(400).json({ success: false, message: '缺少 openid' });
      const p = String(phone || '').trim();
      if (!/^1\d{10}$/.test(p)) return res.json({ success: false, message: '请输入正确的手机号' });

      const ident = await resolveCustomerByPhone(p);
      if (!ident.ok) {
        return res.json({ success: false, message: '未查询到您名下的装修项目，请联系为您服务的销售人员或设计师为您添加' });
      }

      // 待确认加入家庭的成员：不写 wechat_users，交给前端弹「确认加入」。
      // 这里不下发 bindToken（静默调用方 bindOpenidQuietly 不处理），
      // 用户需要到登录页走「手机号 + 验证码」那一步完成确认。
      if (ident.kind === 'pending') {
        return res.json({
          success: false,
          needBindFamily: true,
          pendingProjects: customerLogin.mapPendingProjects(ident.pendingMembers),
          family: {
            masterName: (ident.master && ident.master.name) || '',
            relation: (ident.member && ident.member.relation) || '',
          },
          message: '您被邀请查看项目，请用手机号 + 验证码登录并确认',
        });
      }

      const payload = customerLogin.buildLoginPayload(ident);
      // 关联到 customers 主档：家庭成员也挂到主账户上，PC 端「微信客户」才能显示关联客户
      const linkedCustomerId = payload.masterCustomerId || (payload.customer && payload.customer.id) || null;

      const now = new Date().toISOString();
      const [existing] = await pool.query('SELECT id FROM wechat_users WHERE mini_openid = ? LIMIT 1', [openid]);
      if (existing.length) {
        await pool.query(
          `UPDATE wechat_users SET phone=?, nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar),
           customer_id=COALESCE(?,customer_id), bind_time=?, status=1, unsubscribe_time=NULL, update_time=? WHERE id=?`,
          [p, nickname || null, avatar || null, linkedCustomerId, now, now, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO wechat_users (mini_openid, phone, nickname, avatar, customer_id, bind_time, status, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [openid, p, nickname || '', avatar || '', linkedCustomerId, now, now, now]
        );
      }

      return res.json({ success: true, message: '绑定成功', phone: p, customer_id: linkedCustomerId, ...payload });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // POST /api/wechat/mini-profile — 保存头像昵称（不绑手机号也能存）
  // 说明：微信 2022-10-25 回收 getUserProfile 后，头像昵称只能由用户主动填写
  //      （button open-type=chooseAvatar / input type=nickname），这里接收前端上传后的地址。
  app.post('/api/wechat/mini-profile', async (req, res) => {
    try {
      const { openid, nickname, avatar } = req.body || {};
      if (!openid) return res.status(400).json({ success: false, message: '缺少 openid' });

      const now = new Date().toISOString();
      const [existing] = await pool.query('SELECT id FROM wechat_users WHERE mini_openid = ? LIMIT 1', [openid]);
      if (existing.length) {
        await pool.query(
          `UPDATE wechat_users SET nickname=COALESCE(?,nickname), avatar=COALESCE(?,avatar),
           status=1, update_time=? WHERE id=?`,
          [nickname || null, avatar || null, now, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO wechat_users (mini_openid, nickname, avatar, status, create_time, update_time)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [openid, nickname || '', avatar || '', now, now]
        );
      }
      res.json({ success: true, openid, nickname: nickname || '', avatar: avatar || '' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });
};
