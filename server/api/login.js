/**
 * 登录（员工 / 业主）（2026-10-29 渐进拆分第 18 轮）
 *
 * 搬运自 server.js 原 2001-2088 行，搬入时 88 行。
 *
 * 2026-10-29 v2.5.3：/api/customers/login 的「按手机号认身份」改走
 * lib/customer-login.js，不再自己查表。行为变化见下方接口注释。
 */
module.exports = function registerLoginRoutes(app, deps) {
  const {
    db,
    pool,
    permCore,
    getUserId,
    hasReadAllPermission,
    checkPermission,
    addLog,
    customerLogin,
  } = deps;

  app.post('/api/employees/login', async (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare(`
    SELECT e.*, r.name as role_name, r.code as role_code, r.permissions as role_permissions 
    FROM employees e 
    LEFT JOIN roles r ON e.role_id = r.id 
    WHERE e.username = ? AND e.password = ?
  `);
    const user = await stmt.get(username, password);
    if (user) {
      // 剔除 password 字段，防止登录响应泄露明文密码
      const { password: _, ...safeUser } = user;
      res.json({ success: true, user: safeUser });
    } else {
      res.json({ success: false, message: '用户名或密码错误' });
    }
  });

  // 客户登录（手机号 + 姓名）—— 旧接口，保留但不再是主链路
  app.post('/api/customers/login', async (req, res) => {
    // v2.5.2：业主端已改为「手机号 + 短信验证码」登录（POST /api/customer-auth/login-by-code）。
    // 这个旧接口只凭手机号就能登录，等于知道客户手机号即可拿到全部档案，是已知风险。
    // 新接口全量发版稳定后，把 .env 里 ALLOW_PHONE_ONLY_LOGIN 设为 0 即可关闭它。
    if (process.env.ALLOW_PHONE_ONLY_LOGIN === '0') {
      return res.status(410).json({ success: false, message: '请使用「手机号 + 短信验证码」登录' });
    }
    const { phone, name } = req.body || {};
    if (!phone) {
      return res.json({ success: false, message: '请输入手机号' });
    }
    try {
      const ident = await customerLogin.resolveCustomerByPhone(phone);

      if (!ident || !ident.ok) {
        return res.json({ success: false, message: ident && ident.message ? ident.message : '该手机号未注册' });
      }

      // ⚠️ 待加入的家庭成员不能从这个接口登录：
      //    本接口没有任何验证手段（不验证码、不验微信），拿它确认"我就是这个手机号的人"
      //    等于谁填个号都能入家。必须去做验证码登录，那一步才有 bindToken。
      if (ident.kind === 'pending') {
        return res.json({
          success: false,
          needBindFamily: true,
          pendingProjects: customerLogin.mapPendingProjects(ident.pendingMembers),
          message: '您被邀请查看项目，请使用「手机号 + 短信验证码」登录并确认',
        });
      }

      // 主账户（含历史脏数据里 is_master=1 的成员记录）：姓名可选匹配
      if (ident.kind === 'master') {
        const c = ident.customer || {};
        if (name && c.name && c.name !== name) {
          return res.json({ success: false, message: '姓名与手机号不匹配' });
        }
        return res.json(customerLogin.buildLoginPayload(ident, { loginType: 'phone' }));
      }

      // 已确认加入的成员
      return res.json(customerLogin.buildLoginPayload(ident, { loginType: 'phone' }));
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

};
