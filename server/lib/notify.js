/**
 * 通知基础设施（2026-10-29 渐进拆分第 19 轮）
 *
 * 搬运自 server.js 原 570-1073 行，搬入时 504 行。这里是全站所有通知的唯一出口：
 *   notifyProject            项目级事件（订阅角色 + 关联人 + 管理员 id=1）
 *   notifyReviewSubmitted    提交审核时通知有审核权限的人
 *   notifySubmitter          审核结果回告提交人
 *   insertInAppNotification  只写站内消息（不推短信/微信）
 *   sendAppNotification      显式 targets 的通用推送
 *   sendSmsFromNotify        短信发送（内部用，也被 sendApprovalNotification 调用）
 *   getUserIdsByPermission / getUserIdsByNotificationType / getProjectRelatedUserIds
 *                            三类收件人解析
 *   getDefaultNotificationRules / pushWechatByPhone  内部辅助
 *
 * ⚠️ 为什么是工厂函数而不是直接导出：
 *    这些函数依赖 server.js 里的 pool / db / mysqlPool / sendAliyunSms / permCore，
 *    而 server.js 又要在自己的模块作用域里继续用这些名字（几百处调用点）。
 *    用工厂注入依赖，server.js 里 `const { notifyProject } = require('./lib/notify')({...})`
 *    即可保持所有调用点一字不改，也不产生循环 require。
 *
 * ⚠️ 改这里要连带看 docs 里的「三个通知函数接收人不同」：
 *    notifyProject / insertInAppNotification / sendAppNotification 收件人口径不一样，
 *    历史上多次因为用错函数导致「操作者自己收不到」或「不该收的人收到」。
 */
module.exports = function createNotify(deps) {
  const {
    pool, db, mysqlPool, https, sendAliyunSms, permCore,
  } = deps;

  // ==================== 通知规则默认配置 ====================
  function getDefaultNotificationRules() {
    return {
      node_completed:    { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
      node_in_progress:  { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
      node_pending:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
      node_skipped:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
      project_progress:  { enabled: true, channels: ['inapp'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
      inspection_submit: { enabled: true, channels: ['inapp'], receivers: ['manager', 'supervisor'] },
    };
  }

  // ==================== 通用通知函数 ====================
  // 改造后的 notifyProject：按角色订阅发送，支持多渠道（站内/短信/微信）
  // 1. 查所有 notification_types 包含此type的角色
  // 2. 查这些角色的所有员工（去重）
  // 3. 查项目相关人（设计师/监理/客户）如果他们订阅了该消息类型也通知
  // 4. 管理员无论如何都收到
  // 5. 消息写入 notifications 表（receiver_phone=员工phone）
  // 6. 按通知规则的 channels 决定发送渠道（inapp写库 / sms发短信 / wechat发微信）
  // ============ 消息提醒 · 关联判定 helper（v2.3.1 P2） ============
  // 返回某项目关联的员工 user_id 集合（含创建人/设计师/监理/工长/项目经理）；
  // 客户端（业主）不计 user_id（手机号仍会走 projectTargets 分支）。
  // 2026-10-12：按权限码找"该审核的人"（单一真源 roles.permissions JSON，与 permCore 同源；'*' 为 admin 直通）
  // 审核提交类通知（陛下批示 2026-10-12）：审批权限人 + 提交人 + 项目经理，客户不收
  async function notifyReviewSubmitted(type, projectId, title, content, sourceId, sourceType, submitterId, permCodes) {
    const ids = [submitterId];
    for (const code of (permCodes || [])) ids.push(...await getUserIdsByPermission(code));
    if (projectId) {
      try {
        const [[p]] = await pool.query('SELECT manager_id FROM projects WHERE id = ?', [projectId]);
        if (p && p.manager_id) ids.push(p.manager_id);
      } catch {}
    }
    return notifyProject(type, projectId, title, content, sourceId, sourceType, null, { mode: 'participants', userIds: ids });
  }

  // 审核结果类通知：仅提交人（谁发起，反馈给谁）
  async function notifySubmitter(type, projectId, title, content, sourceId, sourceType, submitterId) {
    return notifyProject(type, projectId, title, content, sourceId, sourceType, null, { mode: 'participants', userIds: [submitterId] });
  }

  async function notifyProject(type, projectId, title, content, sourceId, sourceType, templateId, opts = {}) {
    // 2026-10-09 修复：收集短信发送结果，函数末尾返回给调用方
    const smsResults = [];
    // 2026-10-12 通知模式（陛下批示）：
    //   'participants' — 事件当事人：仅通知 opts.userIds（+管理员兜底）。
    //                    用于审核提交（审批人+提交人+项目经理）与审核结果（仅提交人）
    //   'subscribers'  — 按 PC「角色消息订阅」设置：客户 + 管理员 + 订阅了该类型的角色∩项目关联人。
    //                    用于项目级事件（项目创建/状态变更/节点状态/进展）
    //   默认 'related' — 全部项目关联人（巡检/整改/验收类维持现状）
    opts = (opts && typeof opts === 'object') ? opts : {};
    const notifyMode = opts.mode || 'related';
    // 事件当事人模式的显式接收人（审核提交/审核结果专用）
    const explicitTargets = [];
    if (notifyMode === 'participants' && Array.isArray(opts.userIds) && opts.userIds.length > 0) {
      const __ids = [...new Set(opts.userIds.filter(Boolean))];
      if (__ids.length > 0) {
        try {
          const [emps] = await pool.query(
          `SELECT id, phone, name FROM employees WHERE id IN (${__ids.map(() => '?').join(',')}) AND phone IS NOT NULL AND phone != ''`,
            __ids
          );
          for (const e of (emps || [])) {
            explicitTargets.push({ phone: e.phone, name: e.name || '', role: 'staff', user_id: e.id });
          }
        } catch (e) {
          console.error('[notifyProject] 当事人查询失败:', e.message);
        }
      }
    }
    try {
      // 0. 读取通知规则
      let notifRules = {};
      try {
        const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'notifications'");
        if (rows[0]) {
          const parsed = JSON.parse(rows[0].setting_value);
          notifRules = parsed.setting_value || parsed;
        }
      } catch {}

      // 读取微信公众号模板消息ID
      let mpTemplateId = null;
      try {
        const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'wechat_mp'");
        if (rows[0]) {
          const parsed = JSON.parse(rows[0].setting_value);
          const cfg = parsed.setting_value || parsed;
          mpTemplateId = cfg.template_id || null;
        }
      } catch {}

      // 决定本条消息要走的渠道（兼容旧调用：没传 templateId 则默认只 inapp）
      const rule = notifRules[type];
      const enabledChannels = rule && rule.enabled
        ? (rule.channels || ['inapp'])
        : (templateId ? ['inapp'] : ['inapp']);

      // 1. 获取所有订阅了该消息类型的角色（允许列不存在时报错跳过）
      let roles = [];
      try {
        const [rows] = await db.prepare('SELECT id, name FROM roles WHERE notification_types LIKE ?').all(`%${type}%`);
        roles = rows || [];
      } catch (e) {
        // 列不存在或查询失败，跳过角色订阅（项目相关人和admin仍会收到）
        console.log(`[notifyProject] 角色订阅查询失败（可能notification_types列不存在）: ${e.message}`);
      }

      // 2. 查这些角色的所有员工手机号 —— P2 §8.2 改造：
      //    有 projectId 时，"角色订阅员工" 与 "项目关联人" 取交集（且与 sourceId 提交人取并集）；
      //    无 projectId 时（公告 / 系统通知），仍按角色订阅广播。
      //    P2 §8.3 第 2 步原状：原代码无条件把订阅角色全员加上，改造后按 projectId 分支处理。
      let staffTargets = [];
      if (roles && roles.length > 0 && notifyMode !== 'participants') {
        const roleIds = roles.map(r => r.id);
        const rolePlaceholders = roleIds.map(() => '?').join(',');
        let candidates = [];
        if (!projectId) {
          // 无项目归属：按角色订阅广播
          candidates = roleIds;
        } else {
          // 有项目归属：仅保留与该项目关联的员工
          // 先拿相关人 user_id 集
          const linkedUserIds = await getProjectRelatedUserIds(projectId);
          if (linkedUserIds && linkedUserIds.size > 0) {
            const [employees] = await db.prepare(
            `SELECT DISTINCT e.id as user_id, e.phone, e.name FROM employees e WHERE e.role_id IN (${rolePlaceholders}) AND e.id IN (?) AND e.phone IS NOT NULL AND e.phone != ''`,
              [...roleIds, Array.from(linkedUserIds)]
            ).all();
            candidates = (employees || []).map((e) => e.id);
          }
        }
        if (candidates.length > 0) {
          const [employees] = await db.prepare(
          `SELECT DISTINCT e.id as user_id, e.phone, e.name FROM employees e WHERE e.id IN (${candidates.map(() => '?').join(',')}) AND e.phone IS NOT NULL AND e.phone != ''`
          ).all(...candidates);
          if (employees) {
            for (const e of employees) {
              if (e.phone) staffTargets.push({ phone: e.phone, name: e.name || '', role: 'staff', user_id: e.user_id || null });
            }
          }
        }
      }

      // 3. 如果有 projectId，查项目相关人（设计师/监理/客户/项目经理/工长/创建人）—— P2 §8.3 第 3 步：补 creator + foreman
      //    2026-10-12：participants 模式跳过；subscribers 模式仅保留客户（员工改由角色订阅决定）
      let projectTargets = [];
      if (projectId && notifyMode !== 'participants') {
        try {
          const [proj] = await mysqlPool.query(`
          SELECT c.phone as customer_phone, c.name as customer_name,
          des.phone as designer_phone, des.name as designer_name,
          sup.phone as supervisor_phone, sup.name as supervisor_name,
          mgr.id as manager_user_id, mgr.phone as manager_phone, mgr.name as manager_name,
          des.id as designer_user_id, sup.id as supervisor_user_id,
          cre.id as creator_user_id, cre.phone as creator_phone, cre.name as creator_name,
          fm.id as foreman_user_id, fm.phone as foreman_phone, fm.name as foreman_name
          FROM projects p
          LEFT JOIN customers c ON p.customer_id = c.id
          LEFT JOIN employees des ON p.designer_id = des.id
          LEFT JOIN employees sup ON p.supervisor_id = sup.id
          LEFT JOIN employees mgr ON p.manager_id = mgr.id
          LEFT JOIN employees cre ON p.creator_id = cre.id
          LEFT JOIN employees fm ON p.foreman_id = fm.id
          WHERE p.id = ?
        `, [projectId]);

          console.log(`[notifyProject] 项目${projectId}查询结果:`, JSON.stringify(proj && proj[0] ? proj[0] : '无'));

          if (proj && proj[0]) {
            const p = proj[0];
            // subscribers 模式（项目级事件按 PC 订阅设置走）：员工不再无条件全发，仅客户必达；
            // 员工是否接收由「角色订阅」决定（见 step 2 staffTargets）
            const pushAllStaff = notifyMode !== 'subscribers';
            // 关联人：与 7.3 一致 —— 设计师 / 监理 / 项目经理 / 客户 / 创建人 / 工长
            if (pushAllStaff && p.designer_phone) projectTargets.push({ phone: p.designer_phone, name: p.designer_name, role: 'designer', user_id: p.designer_user_id || null });
            if (pushAllStaff && p.supervisor_phone) projectTargets.push({ phone: p.supervisor_phone, name: p.supervisor_name, role: 'supervisor', user_id: p.supervisor_user_id || null });
            if (pushAllStaff && p.manager_phone) projectTargets.push({ phone: p.manager_phone, name: p.manager_name, role: 'manager', user_id: p.manager_user_id || null });
            if (p.customer_phone) projectTargets.push({ phone: p.customer_phone, name: p.customer_name, role: 'customer', user_id: null });
            if (pushAllStaff && p.creator_phone) projectTargets.push({ phone: p.creator_phone, name: p.creator_name, role: 'creator', user_id: p.creator_user_id || null });
            if (pushAllStaff && p.foreman_phone) projectTargets.push({ phone: p.foreman_phone, name: p.foreman_name, role: 'foreman', user_id: p.foreman_user_id || null });
          }
        } catch(e) {
          console.log(`[notifyProject] 项目相关人查询失败: ${e.message}`);
        }
      }
      console.log(`[notifyProject] 项目相关人:`, projectTargets.map(t => `${t.phone}(${t.role})`));

      // 4. 合并去重（按phone去重）
      const phoneSet = new Set();
      const allTargets = [];
      for (const t of [...explicitTargets, ...staffTargets, ...projectTargets]) {
        if (t.phone && !phoneSet.has(t.phone)) {
          phoneSet.add(t.phone);
          allTargets.push(t);
        }
      }

      // 5. 管理员（id=1对应的手机号）永远收到
      const [adminEmp] = await db.prepare('SELECT phone, name FROM employees WHERE id = 1').all();
      if (adminEmp && adminEmp.phone && !phoneSet.has(adminEmp.phone)) {
        allTargets.push({ phone: adminEmp.phone, name: adminEmp.name || '管理员', role: 'admin' });
      }

      // 如果没有任何接收人，跳过
      if (allTargets.length === 0) {
        console.log(`[notifyProject] 没有接收人，跳过通知 type=${type} projectId=${projectId}`);
        return;
      }

      console.log(`[notifyProject] 准备发送通知 type=${type} to=`, allTargets.map(t => t.phone));

      // 6. 对每个接收人，按渠道发送
      for (const t of allTargets) {
        // 站内消息（必须）
        if (enabledChannels.includes('inapp')) {
          try {
            const [r] = await mysqlPool.query(
              'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
              [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
            );
            console.log(`[notifyProject] ✅ 通知已写入 id=${r.insertId} phone=${t.phone} name=${t.name}`);

            // 同时写 messages 表（员工消息页面读的是 MySQL messages 表）
            if (t.user_id) {
              try {
                await pool.query(
                  'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date().toISOString()]
                );
                console.log(`[notifyProject] ✅ messages已写入 MySQL phone=${t.phone} user_id=${t.user_id}`);
              } catch(e2) {
                console.error(`[notifyProject] ❌ messages写入失败 phone=${t.phone} user_id=${t.user_id} error=${e2.message}`);
              }
            }
          } catch(e) {
            console.error(`[notifyProject] ❌ 写入失败 phone=${t.phone} error=${e.message}`);
          }
        }

        // 短信渠道 —— P2 §8.3 渠道规则：仅对客户（业主）发送，员工一律不发短信（陛下四次批示）
        if (enabledChannels.includes('sms') && templateId && t.role === 'customer') {
          try {
            const smsRes = await sendSmsFromNotify(t.phone, t.name, title, content, templateId);
            smsResults.push({ phone: t.phone, name: t.name, ...smsRes });
          } catch (e) {
            smsResults.push({ phone: t.phone, name: t.name, success: false, error: e.message });
          }
        }

        // 微信渠道（调用 push）
        if (enabledChannels.includes('wechat') && mpTemplateId) {
          // 构造微信模板消息数据格式：{ key: { value: 'xxx', color: '#xxx' } }
          const wechatData = {
            first: { value: title, color: '#1890ff' },
            keyword1: { value: t.name || '未知', color: '#333333' },
            keyword2: { value: content.substring(0, 20), color: '#333333' },
            remark: { value: '如有疑问请联系客服', color: '#999999' }
          };
          // 异步推送，不阻塞
          pushWechatByPhone(t.phone, mpTemplateId, wechatData).catch(console.error);
        }
      }
    } catch (err) {
      console.error('notifyProject error:', err);
    }
    return smsResults;
  }

  // 内部函数：通过手机号推送微信模板消息
  async function pushWechatByPhone(phone, templateId, data) {
    try {
      const [users] = await pool.query(
      `SELECT * FROM wechat_users WHERE phone = ? AND status = 1 ORDER BY mp_openid DESC LIMIT 1`,
        [phone]
      );
      if (!users[0]) return { success: false, reason: '未绑定微信' };

      const user = users[0];
      const openid = user.mp_openid || user.mini_openid;
      if (!openid) return { success: false, reason: '无有效OpenID' };

      const [configRows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'wechat_mp'");
      if (!configRows[0]) return { success: false, reason: '微信公众号未配置' };
      const parsed = JSON.parse(configRows[0].setting_value);
      const config = parsed.setting_value || parsed;
      if (!config.app_id || !config.app_secret) return { success: false, reason: '微信公众号未完成配置' };

      // 获取全局 access_token
      const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.app_id}&secret=${config.app_secret}`;
      const tokenData = await new Promise((resolve, reject) => {
        https.get(tokenUrl, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        }).on('error', reject);
      });
      if (tokenData.errcode) return { success: false, reason: tokenData.errmsg };

      // 发送模板消息
      const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${tokenData.access_token}`;
      const bodyStr = JSON.stringify({ touser: openid, template_id: templateId, data });
      const result = await new Promise((resolve, reject) => {
        const req = https.request(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
      });

      if (result.errcode === 0) {
        console.log(`[WechatPush] 推送成功 phone=${phone} msgid=${result.msgid}`);
        return { success: true, msgid: result.msgid };
      } else {
        console.error(`[WechatPush] 推送失败 phone=${phone} errcode=${result.errcode} errmsg=${result.errmsg}`);
        return { success: false, reason: result.errmsg, errcode: result.errcode };
      }
    } catch (err) {
      console.error(`[WechatPush] 异常 phone=${phone}`, err.message);
      return { success: false, reason: err.message };
    }
  }

  // 纯应用内通知（不发短信，不走通知规则，直接插入数据库）
  async function insertInAppNotification(projectId, title, content, sourceId, sourceType) {
    try {
      const [proj] = await db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone,
      des.name as designer_name, des.phone as designer_phone,
      sup.name as supervisor_name, sup.phone as supervisor_phone,
      mgr.name as manager_name, mgr.phone as manager_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      WHERE p.id = ?`).all(projectId);
      if (!proj) return;

      const roles = [
        { phone: proj.manager_phone, name: proj.manager_name },
        { phone: proj.designer_phone, name: proj.designer_name },
        { phone: proj.supervisor_phone, name: proj.supervisor_name },
        { phone: proj.customer_phone, name: proj.customer_name },
      ];

      for (const t of roles) {
        if (t.phone) {
          await mysqlPool.query(
            'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [title, content, 'inapp', sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
          );
        }
      }
    } catch (err) { console.error('insertInAppNotification error:', err); }
  }

  // 统一应用内通知：同时写 notifications 和 messages 表
  // type: 'purchase'|'material_in'|'material_out'|'node_status' 等
  // targets: 数组，每个元素是 { phone, name, user_id }
  // 注意：此函数内部按 phone 去重，避免同一人收到多条通知
  async function sendAppNotification(type, title, content, sourceId, sourceType, targets) {
    if (!targets || targets.length === 0) return;
    const channels = 'inapp';
    // 按 phone 去重
    const seen = new Set();
    const uniqueTargets = [];
    for (const t of targets) {
      if (!t.phone || seen.has(t.phone)) continue;
      seen.add(t.phone);
      uniqueTargets.push(t);
    }
    for (const t of uniqueTargets) {
      try {
        // 写 notifications 表
        await mysqlPool.query(
          'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', channels, 'pending']
        );
        // 写 messages 表（如果能查到 user_id）
        if (t.user_id) {
          await mysqlPool.query(
            'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date()]
          );
        }
      } catch (err) {
        console.error('sendAppNotification error:', err);
      }
    }
  }

  // ==================== 通知短信发送函数（被 notifyProject 调用）====================
  // templateId 可选：指定则优先用该模板的 aliyun_template_code，否则用默认模板
  async function sendSmsFromNotify(phone, name, title, content, templateId) {
    // 2026-10-09 修复：返回 { success, count, error, reason }，让调用方知道发送结果
    const result = { success: false, count: 0, error: null, reason: null };
    if (!phone) { result.reason = 'no_phone'; return result; }

    // 读取阿里云短信配置（SQLite system_settings，category='sms'）
    const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
    let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
    if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
    if (!smsConfig || smsConfig.provider !== 'aliyun') { result.reason = 'sms_not_configured'; return result; }
    if (!smsConfig.access_key_id || !smsConfig.access_key_secret) { result.reason = 'sms_config_incomplete'; return result; }

    let signName = smsConfig.sign_name || '简逸装饰';
    let templateCode = smsConfig.template_code || '';

    // 优先用节点绑定的模板，其次用默认模板
    if (templateId) {
      const [tmpl] = await db.prepare('SELECT aliyun_template_code, sign_name FROM sms_templates WHERE id=? AND is_active=1').all(templateId);
      if (tmpl && tmpl.aliyun_template_code) {
        templateCode = tmpl.aliyun_template_code;
        signName = tmpl.sign_name || signName;
      }
    }
    if (!templateCode) {
      const [tmpl] = await db.prepare(
        'SELECT aliyun_template_code, sign_name FROM sms_templates WHERE is_active=1 AND aliyun_template_code IS NOT NULL AND aliyun_template_code != "" LIMIT 1'
      ).all();
      if (tmpl) {
        templateCode = tmpl.aliyun_template_code;
        signName = tmpl.sign_name || signName;
      }
    }
    if (!templateCode) { result.reason = 'sms_template_not_found'; return result; }

    // 提取项目名称（title格式：XXX：项目名）
    // 2026-10-23：新文案「项目进度更新「节点」完成」的 title 里没有项目名，从 content 的 项目「xxx」 兜底
    let projectName = title.replace(/^(工地巡检提交：|项目节点完成：|项目新进展：|项目节点进行中：|项目节点待处理：|项目节点已跳过：)/, '');
    if (projectName === title) {
      const pm = String(content || '').match(/项目「([^」]+)」/);
      if (pm) projectName = pm[1];
    }

    try {
      const aliyunResp = await sendAliyunSms({
        accessKeyId: smsConfig.access_key_id,
        accessKeySecret: smsConfig.access_key_secret,
        signName,
        templateCode,
        phone: phone.startsWith('+') ? phone : '+86' + phone,
        templateParam: JSON.stringify({
          name: name || '业主',
          project: projectName,
          content: content.length > 50 ? content.substring(0, 50) + '…' : content,
          date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
        })
      });
      // 阿里云返回 { Code, Message, RequestId, BizId }
      if (aliyunResp && aliyunResp.Code === 'OK') {
        result.success = true;
        result.count = 1;
        return result;
      } else {
        result.error = (aliyunResp && (aliyunResp.Message || aliyunResp.Code)) || 'unknown';
        return result;
      }
    } catch (e) {
      result.error = e.message || 'send_failed';
      return result;
    }
  }
  // ==================== 审批通知 / 收件人解析（第 21 轮合并进来）====================
  // ==================== 审批通知推送服务 ====================

  // 发送审批通知（站内消息 + 短信）
  async function sendApprovalNotification({ userId, userName, title, content, type, relatedId, relatedType }) {
    try {
      // 1. 写入站内消息
      await db.prepare(`
      INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())
    `).run(userId, userName, title, content, type, relatedId, relatedType);
    
      // 2. 查询用户手机号，准备短信通知
      const [emp] = await db.prepare('SELECT phone FROM employees WHERE id = ?').all(userId);
      if (emp && emp.phone) {
        // 短信通知（异步，不阻塞）
        sendSmsFromNotify(emp.phone, userName, title, content).catch(err => console.error('短信发送失败:', err));
      }
    
    } catch (err) {
      console.error('sendApprovalNotification error:', err);
    }
  }

  // ==================== 主材采购申请 API ====================

  // 查询具有指定权限的用户ID列表
  async function getUserIdsByPermission(permCode) {
    try {
      // 2026-10-10 修复：MySQL 5.5 没有 JSON_SEARCH，改在 Node 层解析 JSON
      const [rows] = await pool.query(`
      SELECT DISTINCT e.id, r.permissions FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE r.permissions IS NOT NULL AND r.permissions != '' AND r.permissions != '[]'
    `);
      const matched = [];
      for (const row of rows) {
        let arr = [];
        try { arr = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions; } catch {}
        if (Array.isArray(arr) && arr.includes(permCode)) matched.push(row.id);
      }
      return matched;
    } catch (e) {
      console.error('getUserIdsByPermission error:', e.message);
      return [];
    }
  }

  // 查询订阅了指定消息类型的用户ID列表
  async function getUserIdsByNotificationType(notifType) {
    try {
      // 2026-10-10 修复：MySQL 5.5 没有 JSON_SEARCH，改在 Node 层解析 JSON
      const [rows] = await pool.query(`
      SELECT DISTINCT e.id, r.notification_types FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE r.notification_types IS NOT NULL AND r.notification_types != '' AND r.notification_types != '[]'
    `);
      const matched = [];
      for (const row of rows) {
        let arr = [];
        try { arr = typeof row.notification_types === 'string' ? JSON.parse(row.notification_types) : row.notification_types; } catch {}
        if (Array.isArray(arr) && arr.includes(notifType)) matched.push(row.id);
      }
      return matched;
    } catch (e) {
      console.error('getUserIdsByNotificationType error:', e.message);
      return [];
    }
  }

  // 2026-10-10 新增：获取项目相关人员（项目经理/设计师/监理/创建人/客户）
  // 只返回 employees 表里实际存在的 id（客户在 customers 表不在 employees，过滤掉）
  async function getProjectRelatedUserIds(projectId) {
    if (!projectId) return [];
    try {
      const [rows] = await pool.query(
      `SELECT manager_id, designer_id, supervisor_id, creator_id, customer_id FROM projects WHERE id = ?`,
        [projectId]
      );
      if (!rows[0]) return [];
      const r = rows[0];
      const candidates = [...new Set([r.manager_id, r.designer_id, r.supervisor_id, r.creator_id, r.customer_id].filter(Boolean))];
      if (candidates.length === 0) return [];
      // 过滤：只在 employees 表里存在
      const [emps] = await pool.query(
      `SELECT id FROM employees WHERE id IN (${candidates.map(() => '?').join(',')})`,
        candidates
      );
      return emps.map(e => e.id);
    } catch (e) {
      console.error('getProjectRelatedUserIds error:', e.message);
      return [];
    }
  }

  // 发送采购通知（站内消息）
  async function sendPurchaseNotification({ userId, userName, title, content, type, relatedId, relatedType }) {
    try {
      // 写 MySQL messages 表（移动端读的就是这个表）
      await pool.query(
        'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())',
        [userId, userName || '', title, content, type, relatedId || 0, relatedType || '', 'pending']
      );
      // 短信通知
      const [emps] = await pool.query('SELECT phone FROM employees WHERE id = ?', [userId]);
      const emp = emps[0];
      if (emp && emp.phone) {
        sendSmsFromNotify(emp.phone, userName, title, content).catch(err => console.error('短信发送失败:', err));
      }
    } catch (err) {
      console.error('sendPurchaseNotification error:', err);
    }
  }

  // 2026-10-10 新增：多通道通知分发器（站内 / 短信 / 微信小程序订阅消息 / 企业微信）
  // 调用方式：await dispatchNotification({ userId, channels: ['inapp','sms','mini_subscribe'], type:'purchase_approved', title, content, data:{thing1, time2}, relatedId, relatedType })
  // channels 可选：inapp / sms / mini_subscribe / mp_template / wecom / email
  async function dispatchNotification({ userId, channels = ['inapp', 'sms'], type, title, content, data = {}, relatedId, relatedType }) {
    if (!userId) return [];
    const results = [];
    // 1. 站内消息 (inapp)
    if (channels.includes('inapp')) {
      try {
        const [r] = await pool.query(
        `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, channel, push_status, created_at)
         VALUES (?, '', ?, ?, ?, ?, ?, 'inapp', 'sent', NOW())`,
          [userId, title, content, type, relatedId || 0, relatedType || '']
        );
        results.push({ channel: 'inapp', success: true, message_id: r.insertId });
      } catch (e) {
        results.push({ channel: 'inapp', success: false, error: e.message });
      }
    }
    // 2. 短信 (sms)
    if (channels.includes('sms')) {
      try {
        const [emps] = await pool.query('SELECT phone FROM employees WHERE id = ?', [userId]);
        if (emps[0] && emps[0].phone) {
          await sendSmsFromNotify(emps[0].phone, '', title, content);
          results.push({ channel: 'sms', success: true });
        } else {
          results.push({ channel: 'sms', success: false, error: 'no_phone' });
        }
      } catch (e) {
        results.push({ channel: 'sms', success: false, error: e.message });
      }
    }
    // 3. 微信小程序订阅消息（stub — 待小程序上线后接入 SDK）
    if (channels.includes('mini_subscribe')) {
      try {
        const [ids] = await pool.query(
        `SELECT openid FROM wechat_identities WHERE employee_id = ? AND wechat_type = 'mini' LIMIT 1`,
          [userId]
        );
        if (!ids[0] || !ids[0].openid) {
          results.push({ channel: 'mini_subscribe', success: false, error: 'no_openid' });
        } else {
          // TODO: 接入微信 subscribeMessage.send
          // 1) 查 wechat_templates 拿 template_id (按 type)
          const [tpl] = await pool.query(
          `SELECT template_id, data_keys FROM wechat_templates WHERE template_code = ? AND wechat_type = 'mini' AND status='active' LIMIT 1`,
            [type]
          );
          if (!tpl[0] || !tpl[0].template_id) {
            results.push({ channel: 'mini_subscribe', success: false, error: 'no_template', template_code: type });
          } else {
            // 2) 查 user 是否授权过这个 template_id
            const [auth] = await pool.query(
            `SELECT id, expires_at FROM subscribe_records WHERE employee_id = ? AND template_id = ? AND status='authorized' LIMIT 1`,
              [userId, tpl[0].template_id]
            );
            if (!auth[0]) {
              results.push({ channel: 'mini_subscribe', success: false, error: 'not_authorized', template_id: tpl[0].template_id });
            } else {
              // 3) 调微信 API (stub - 待实现)
              // const apiRes = await callWechatSubscribeMsgAPI({ openid, template_id, data, ... });
              // results.push({ channel: 'mini_subscribe', success: apiRes.errcode === 0, external_id: apiRes.msgid });
              results.push({ channel: 'mini_subscribe', success: true, stub: true, template_id: tpl[0].template_id });
            }
          }
        }
      } catch (e) {
        results.push({ channel: 'mini_subscribe', success: false, error: e.message });
      }
    }
    return results;
  }

  return {
    getDefaultNotificationRules,
    notifyReviewSubmitted,
    notifySubmitter,
    notifyProject,
    insertInAppNotification,
    sendAppNotification,
    sendSmsFromNotify,
    sendApprovalNotification,
    getUserIdsByPermission,
    getUserIdsByNotificationType,
    getProjectRelatedUserIds,
    sendPurchaseNotification,
    dispatchNotification,
  };
};
