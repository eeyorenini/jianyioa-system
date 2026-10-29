/**
 * 站内通知 / 消息（含 resolveMessageActor、attachProjectInfo）（2026-10-29 渐进拆分第 18 轮）
 *
 * 搬运自 server.js 原 2127-2541 行，搬入时 415 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerMessageRoutes(app, deps) {
  const {
    pool,
    db,
    permCore,
    getCurrentUser,
  } = deps;

  // GET /api/debug-notify —— v2.5.3 已删除。
  // 它会**真的**向项目 5「撒打算」的所有关联人写一条通知（notifyProject 同时写
  // notifications + messages 两张表并推送）。零鉴权 ⇒ 任何人都能反复调用：
  // 既是针对项目关联人的骚扰通道，也是刷库手段。前端零调用方。
  // 需要验证通知链路时，用真实业务动作触发（如提交一条巡检），不要留这种后门。
  //
  // 原实现（保留备查）：
  //   app.get('/api/debug-notify', async (req, res) => {
  //     await notifyProject('inspection_submit', 5, '【测试通知】撒打算项目',
  //                         '这是一条测试通知内容', 999, 'test');
  //     res.json({ ok: true });
  //   });

  // 获取通知列表（业主端消息页用 /api/notifications，员工端走 /api/messages）
  //
  // ⚠️ 2026-10-29 修复「未登录即可按手机号拉任意人的通知」：
  // 原来只要 `?phone=` 有值就直接按它查，不等价于任何身份校验。
  // 现在必须先有身份，phone 由身份反查（详见 resolveMessageActor 注释）。
  // 前端（H5/小程序 pages/customer/messages.vue）无需改动：它传的本来就是自己的号，
  // 两端的 App.vue 请求拦截器已经自动注入 x-user-id / x-user-type。
  app.get('/api/notifications', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      const denied = checkPhoneClaim(req, actor);
      if (denied) return res.status(denied.code).json({ error: denied.error });

      const { type, is_read, keyword, page = 1, pageSize = 20 } = req.query;

      // 账号在库里没登记手机号 → 不可能有归属它的通知，返回空列表（不报错，前端照常渲染）
      if (!actor.phone) {
        return res.json({ list: [], total: 0, page: parseInt(page), page_size: parseInt(pageSize) });
      }

      let sql = 'SELECT * FROM notifications WHERE receiver_phone = ?';
      const params = [actor.phone];

      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
      if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }

      sql += ' ORDER BY created_at DESC';
      const allStmt = db.prepare(sql);
      const all = await allStmt.all(...params);
      const total = all.length;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      const list = all.slice(offset, offset + parseInt(pageSize));

      res.json({ list, total, page: parseInt(page), page_size: parseInt(pageSize) });
    } catch (err) {
      console.error('notifications error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 标记单条通知已读
  // ⚠️ 2026-10-29 修复：原来 `UPDATE ... WHERE id = ?` 谁都能改任意一条通知的已读状态
  // （id 连续自增，遍历一遍就能把全公司通知全标成已读）。现在必须归属本人。
  app.put('/api/notifications/:id/read', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });
      if (!actor.phone) return res.status(403).json({ error: '当前账号未登记手机号，无法操作通知' });

      await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?')
        .run(req.params.id, actor.phone);
      res.json({ message: '已标记已读' });
    } catch (err) {
      console.error('mark read error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 标记全部通知已读（按当前身份自己的手机号，不再接受 ?phone= 指定别人）
  app.put('/api/notifications/read-all', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      const denied = checkPhoneClaim(req, actor);
      if (denied) return res.status(denied.code).json({ error: denied.error });

      if (!actor.phone) return res.json({ message: '已全部标记已读' });
      await db.prepare('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?').run(actor.phone);
      res.json({ message: '已全部标记已读' });
    } catch (err) {
      console.error('mark all read error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // ============================================================
  // 消息/通知的"当前身份"解析（2026-10-21 修复，2026-10-29 收紧）
  //
  // 背景：原代码一律用 `SELECT phone FROM customers WHERE id = ?` 判断"是不是客户"，
  // 但 x-user-id 传的其实是**员工 id**（getCurrentUser 也是查 employees）。
  // employees.id 和 customers.id 是两套独立自增序列，撞号时（如员工 6 田翔 / 客户 6 郑大）
  // 员工会被当成客户 → 消息列表查到别人的数据、未读角标永远清不掉、全部已读清错人。
  //
  // ⚠️ 2026-10-29 安全修复（本轮第二个洞，和 `?user_id=1` 同一类）：
  // 原判定顺序里有一步是「显式 ?phone= / body.phone → 当成客户，phone 直接采信」。
  // 于是**任何人不带任何身份头**，只要 `GET /api/notifications?phone=13716900747`
  // 就能拉到该手机号的全部通知（项目名、金额、客户姓名）。
  // 关键错误在于：把「请求里声称的 phone」当成了「身份证明」。phone 是论据不是证据。
  //
  // 现在 phone 一律**由身份反查**，绝不再从请求参数取：
  //   1) x-user-type=customer → 只认 customers / family_members（避免撞号时被当成员工）
  //   2) 否则/未声明      → 先 employees，再退回 customers（兼容不带 x-user-type 的老客户端）
  //   3) 请求里的 ?phone= 不再参与「查谁」，只用于**一致性断言**：
  //      与本人在库里登记的手机号不符就 403，便于把越权调用直接暴露出来而不是静默返回空。
  //   4) 拿不到身份 → unknown，调用方一律返 401。
  //   5) 身份**只认 x-user-id header**；`?user_id=` / `body.user_id` 一律不认
  //      （否则补了校验也被 `?user_id=5` 一步绕过，见下方函数内注释）。
  // ============================================================
  async function resolveMessageActor(req) {
    // ⚠️ 只认 x-user-id header，**不兜底 query/body 的 user_id**。
    // 这是和 getUserId(req) 对齐的硬要求：原来这里留了 `|| req.query.user_id ||
    // req.body?.user_id`，等于把刚补上的身份校验又开了一个后门 ——
    // 匿名请求只要带 `?user_id=5` 就能被当成业主 5，照样拉走他全部通知。
    // 前端唯一用 `?user_id=` 的地方是项目文件 URL（`<img>`/下载链接带不了 header），
    // 那些请求打的是 project-files，不走本函数。
    const rawId = req.headers['x-user-id'];
    const userId = rawId ? parseInt(rawId) : 0;
    const userType = String(req.headers['x-user-type'] || '').toLowerCase();

    if (userId > 0) {
      // 1) 明确声明是业主 → 只认业主/家庭成员，绝不再落到 employees（撞号时这是错的）
      if (userType === 'customer') {
        const ident = await permCore.resolveCustomerIdentity(userId, 'customer', req.headers['x-user-scope']);
        if (ident) return { type: 'customer', userId, phone: ident.phone || null };
        return { type: 'unknown', userId, phone: null };
      }

      // 2) 员工（主路径）
      try {
        const [emp] = await pool.query('SELECT id, phone FROM employees WHERE id = ?', [userId]);
        if (emp.length) return { type: 'employee', userId, phone: emp[0].phone || null };
      } catch (e) { /* 忽略，继续往下判 */ }

      // 3) 没带 x-user-type 的老客户端：id 落在业主表就按业主处理
      const ident = await permCore.resolveCustomerIdentity(userId, '', req.headers['x-user-scope']);
      if (ident) return { type: 'customer', userId, phone: ident.phone || null };
    }

    return { type: 'unknown', userId: userId || null, phone: null };
  }

  /**
   * 校验请求里声称的 ?phone= 是否就是本人的号。
   * 只做「断言」用，返回值用来决定要不要 403；不参与决定查谁。
   * 返回 null = 通过，返回 { code, error } = 拒绝。
   */
  function checkPhoneClaim(req, actor) {
    const claimed = req.query.phone || req.body?.phone;
    if (!claimed) return null;
    if (!actor.phone) return { code: 403, error: '当前账号未登记手机号，无法查看通知' };
    if (String(claimed) !== String(actor.phone)) return { code: 403, error: '无权查看他人的通知' };
    return null;
  }

  /* ------------------------------------------------------------------
   * 消息 → 项目信息补全（2026-10-23 新增）
   *
   * 背景：messages / notifications 两张表**都没有 project_id 列**，只有
   * related_id / related_type（对外 alias 成 source_id / source_type）。
   * 前端的「查看应收」按钮跳到 /pages/finance/finance-receivable 时需要
   * projectId 才能核算，拿不到就只能显示 ¥0.00（实测就是这个现象）。
   *
   * 这里按实体类型把 project_id 反查回来，并补 project_name：
   *   collection（催收记录）→ collection_records.project_id
   *   project（项目）        → source_id 本身就是 project_id
   * 查不到就保持 null，让前端自己降级，绝不猜。
   * ------------------------------------------------------------------ */
  async function attachProjectInfo(list) {
    if (!Array.isArray(list) || list.length === 0) return list;
    const sourceOf = (m) => String(m.source_type || m.related_type || '');
    const idOf = (m) => parseInt(m.source_id != null ? m.source_id : m.related_id) || 0;

    const collectIds = [];
    for (const m of list) {
      const sid = idOf(m);
      if (!sid) continue;
      if (sourceOf(m) === 'collection') collectIds.push(sid);
      else if (sourceOf(m) === 'project') m.project_id = sid;
    }

    if (collectIds.length) {
      try {
        const ids = [...new Set(collectIds)];
        const [rows] = await pool.query(
        `SELECT id, project_id FROM collection_records WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        const map = {};
        for (const r of rows) map[r.id] = r.project_id;
        for (const m of list) {
          if (sourceOf(m) === 'collection') {
            const pid = map[idOf(m)];
            if (pid) m.project_id = pid;
          }
        }
      } catch (e) {
        console.error('[attachProjectInfo] 催收记录反查项目失败:', e.message);
      }
    }

    const pids = [...new Set(list.map((m) => parseInt(m.project_id) || 0).filter(Boolean))];
    if (pids.length) {
      try {
        const [pros] = await pool.query(
        `SELECT id, name FROM projects WHERE id IN (${pids.map(() => '?').join(',')})`,
          pids
        );
        const pm = {};
        for (const p of pros) pm[p.id] = p.name;
        for (const m of list) if (m.project_id && pm[m.project_id]) m.project_name = pm[m.project_id];
      } catch (e) {
        console.error('[attachProjectInfo] 项目名查询失败:', e.message);
      }
    }

    return list;
  }

  // 获取消息列表（统一查 notifications 表，兼容员工和客户）
  app.get('/api/messages', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      const { type, is_read, keyword, page = 1, pageSize = 20 } = req.query;

      // 客户用 phone 查 notifications，员工用 user_id 查 messages
      let list = [];
      let total = 0;

      if (actor.type === 'customer') {
        // 客户：查 notifications 表（按 receiver_phone 匹配）
        let sql = 'SELECT * FROM notifications WHERE receiver_phone = ?';
        const params = [actor.phone];
      
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
        if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
      
        sql += ' ORDER BY created_at DESC';
      
        const allStmt = db.prepare(sql);
        const all = await allStmt.all(...params);
        total = all.length;
      
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        list = all.slice(offset, offset + parseInt(pageSize));
      } else {
        // 员工：合并查 messages + notifications 两表（修复：notifyProject 等同时写两表，
        // 列表只查 messages 导致 notifications 表 70+ 条永远不可见；unread-count 端点又算两表所以红点一直在）
        // 1) 员工 phone 由 resolveMessageActor 一并取回（用于 notifications 表 receiver_phone 匹配）
        const userId = actor.userId;
        const empPhone = actor.phone;

        // 2) messages WHERE user_id=?；related_id alias 成 source_id 让前端 getTargetPath 兼容
        let msgSql = `SELECT id, user_id, user_name, title, content, type, related_id AS source_id, related_type AS source_type, is_read, push_status, created_at, 'messages' AS src FROM messages WHERE user_id = ?`;
        const msgParams = [userId];

        if (type) { msgSql += ' AND type = ?'; msgParams.push(type); }
        if (is_read !== undefined && is_read !== '') { msgSql += ' AND is_read = ?'; msgParams.push(parseInt(is_read)); }
        if (keyword) { msgSql += ' AND (title LIKE ? OR content LIKE ?)'; msgParams.push(`%${keyword}%`, `%${keyword}%`); }

        // 3) notifications WHERE receiver_phone=?（与 unread-count 端点口径一致）
        let notifSql = '';
        let notifParams = [];
        if (empPhone) {
          notifSql = `SELECT id, NULL AS user_id, receiver_name AS user_name, title, content, type, source_id, source_type, is_read, channels AS push_status, created_at, 'notifications' AS src FROM notifications WHERE receiver_phone = ?`;
          notifParams = [empPhone];
          if (type) { notifSql += ' AND type = ?'; notifParams.push(type); }
          if (is_read !== undefined && is_read !== '') { notifSql += ' AND is_read = ?'; notifParams.push(parseInt(is_read)); }
          if (keyword) { notifSql += ' AND (title LIKE ? OR content LIKE ?)'; notifParams.push(`%${keyword}%`, `%${keyword}%`); }
        }

        // 4) UNION + 排序 + 分页（注意 MySQL 不支持在 UNION 外 LIMIT 子查询里的 ORDER BY，
        //    所以 LIMIT 放在最外层；ORDER BY created_at DESC 用括号包住子查询）
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        let unionSql, unionParams;
        if (notifSql) {
          unionSql = `SELECT * FROM ((${msgSql}) UNION ALL (${notifSql})) t ORDER BY created_at DESC LIMIT ? OFFSET ?`;
          unionParams = [...msgParams, ...notifParams, parseInt(pageSize), offset];
        } else {
          unionSql = `SELECT * FROM (${msgSql}) t ORDER BY created_at DESC LIMIT ? OFFSET ?`;
          unionParams = [...msgParams, parseInt(pageSize), offset];
        }
        const [rows] = await pool.query(unionSql, unionParams);
        list = rows;

        // 5) 总数（两表分别 COUNT 后相加）
        const [c1] = await pool.query(`SELECT COUNT(*) AS total FROM (${msgSql}) t`, msgParams);
        let totalAll = c1[0].total;
        if (notifSql) {
          const [c2] = await pool.query(`SELECT COUNT(*) AS total FROM (${notifSql}) t`, notifParams);
          totalAll += c2[0].total;
        }
        total = totalAll;
      }

      // 补 project_id / project_name（「查看应收」等按钮要靠它定位项目）
      await attachProjectInfo(list);

      res.json({ list, total, page: parseInt(page), page_size: parseInt(pageSize) });
    } catch (err) {
      console.error('messages error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 获取未读消息数量（统一查 notifications 表，兼容员工和客户）
  app.get('/api/messages/unread-count', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      let count = 0;
      if (actor.type === 'customer') {
        // 客户：查 notifications 表
        const [row] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE receiver_phone = ? AND is_read = 0', [actor.phone]);
        count = Number(row[0].count || 0);
      } else {
        // 员工：合并查 messages + notifications 两表（与 /api/notifications/unread-count 端点口径一致）
        const [mRow] = await pool.query('SELECT COUNT(*) AS cnt FROM messages WHERE user_id = ? AND is_read = 0', [actor.userId]);
        let total = Number(mRow[0].cnt || 0);
        if (actor.phone) {
          const [nRow] = await pool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE receiver_phone = ? AND is_read = 0', [actor.phone]);
          total += Number(nRow[0].cnt || 0);
        }
        count = total;
      }

      res.json({ count });
    } catch (err) {
      console.error('unread-count error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 标记消息已读（统一处理 notifications 和 messages）
  app.put('/api/messages/:id/read', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      if (actor.type === 'customer') {
        // 客户：更新 notifications 表
        await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?', [req.params.id, actor.phone]);
      } else {
        // 员工：两表都尝试 UPDATE（哪张表有改哪张；前端不需要知道）
        await pool.query('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, actor.userId]);
        if (actor.phone) {
          await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND receiver_phone = ?', [req.params.id, actor.phone]);
        }
      }
      res.json({ message: '已标记已读' });
    } catch (err) {
      console.error('mark read error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 标记全部已读（统一处理 notifications 和 messages）
  app.put('/api/messages/read-all', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      if (actor.type === 'customer') {
        // 客户：更新 notifications 表
        await pool.query('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?', [actor.phone]);
      } else {
        // 员工：同时更新 messages + notifications 两表（修复：原来只改 messages，notifications 表的 is_read 永远不变，
        // 导致首页 unread-count 红点永远显示，因为 unread-count 端点合并查两表）
        await pool.query('UPDATE messages SET is_read = 1 WHERE user_id = ?', [actor.userId]);
        if (actor.phone) {
          await pool.query('UPDATE notifications SET is_read = 1 WHERE receiver_phone = ?', [actor.phone]);
        }
      }
      res.json({ message: '已全部标记已读' });
    } catch (err) {
      console.error('mark all read error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 获取单条消息
  // 2026-10-22 修复：/api/messages 列表是 messages + notifications 两表 UNION 的，
  // 两表 id 各自自增、必然撞号；而这里原来只查 messages 且用 getCurrentUser，
  // 导致 notifications 来的消息（实测占未读大头：inapp/node 168 条、project_log 145 条…）
  // 点进详情永远「消息不存在」。
  // 现在按前端回传的 src 精确查对应表，缺省时两表依次兜底；
  // 返回字段统一 alias 成 source_id / source_type，与列表口径一致。
  app.get('/api/messages/:id', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      const id = parseInt(req.params.id) || 0;
      if (!id) return res.status(400).json({ error: '参数错误' });
      const src = String(req.query.src || '');

      const MSG_COLS = `id, user_id, user_name, title, content, type, related_id AS source_id, related_type AS source_type, is_read, push_status, created_at, 'messages' AS src`;
      const NOTIF_COLS = `id, NULL AS user_id, receiver_name AS user_name, title, content, type, source_id, source_type, is_read, channels AS push_status, created_at, 'notifications' AS src`;

      const findMessages = async () => {
        if (!actor.userId) return null;
        const [rows] = await pool.query(`SELECT ${MSG_COLS} FROM messages WHERE id = ? AND user_id = ?`, [id, actor.userId]);
        return rows[0] || null;
      };
      const findNotification = async () => {
        if (!actor.phone) return null;
        const [rows] = await pool.query(`SELECT ${NOTIF_COLS} FROM notifications WHERE id = ? AND receiver_phone = ?`, [id, actor.phone]);
        return rows[0] || null;
      };

      let msg = null;
      if (src === 'notifications') msg = await findNotification();
      else if (src === 'messages') msg = await findMessages();
      else msg = (await findMessages()) || (await findNotification());

      if (!msg) return res.status(404).json({ error: '消息不存在' });

      // 补 project_id / project_name（详情页「查看应收」按钮要用）
      await attachProjectInfo([msg]);

      res.json(msg);
    } catch (err) {
      console.error('messages/:id error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 删除单条消息（本人删自己的）
  // 2026-10-22 新增：移动端左滑删除原来调的是 DELETE /api/notifications/:id，
  // 那个接口 ① 只允许管理员 → 普通员工 403 ② 只删 notifications 表，
  // 而列表是两表 UNION，messages 来的消息根本删不掉；
  // 前端 success 回调不校验 statusCode，于是「看着删掉了，下拉刷新又回来」。
  app.delete('/api/messages/:id', async (req, res) => {
    try {
      const actor = await resolveMessageActor(req);
      if (actor.type === 'unknown') return res.status(401).json({ error: '未登录' });

      const id = parseInt(req.params.id) || 0;
      if (!id) return res.status(400).json({ error: '参数错误' });
      const src = String(req.query.src || '');

      const delMessages = async () => {
        if (!actor.userId) return 0;
        const [r] = await pool.query('DELETE FROM messages WHERE id = ? AND user_id = ?', [id, actor.userId]);
        return r.affectedRows || 0;
      };
      const delNotification = async () => {
        if (!actor.phone) return 0;
        const [r] = await pool.query('DELETE FROM notifications WHERE id = ? AND receiver_phone = ?', [id, actor.phone]);
        return r.affectedRows || 0;
      };

      let affected = 0;
      if (src === 'notifications') affected = await delNotification();
      else if (src === 'messages') affected = await delMessages();
      else affected = (await delMessages()) || (await delNotification());

      if (!affected) return res.status(404).json({ error: '消息不存在或无权删除' });
      res.json({ message: '已删除' });
    } catch (err) {
      console.error('messages delete error:', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

};
