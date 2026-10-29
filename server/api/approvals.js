'use strict';
/**
 * 审批流：我的申请 / 待我审批 / 详情 / 发起 / 同意 / 驳回
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 9 步，191 行 / 6 个路由）。
 * 代码逐行搬迁、逻辑零改动，只把外部依赖改成参数注入。
 *
 * 两个数据表：
 *   approvals          审批单（title/type/status/approver_ids/approver_names/max_level/form_data）
 *   approval_records   审批动作留痕（action = 同意/驳回，comment）
 *
 * 多审批人是「逗号分隔字符串」而非关联表：approver_ids = '3,7,12'，
 * 用 FIND_IN_SET 查。所以审批人名单的增删只能整串重写，没有中间态。
 * 这套设计是历史遗留，改它要同时动前端和 20 多处 SQL，不要顺手重构。
 *
 * ⚠️ 几个已知隐患，改这段之前先看清楚（都没动，只记录）：
 *   1. 无权限校验：6 个接口全部只靠 getCurrentUser 取身份，不校验角色。
 *      GET /api/approvals/:id 任何人知道 id 就能读到别人的审批单，
 *      POST /api/approvals/:id/approve 靠「是否在 approver_ids 里」兜底，
 *      但 /api/approvals/:id 泄露金额和 form_data 是真实缺口。
 *   2. approver_id 为 NULL 时 approval.approver_id.toString() 会抛 TypeError。
 *      走 /approve、/reject 且老数据缺 approver_id 时会 500。
 *   3. 审批时间写的是 new Date().toISOString()（形如 2026-10-29T01:33:13.000Z），
 *      若列是 MySQL DATETIME 而非 DATETIME(3)/VARCHAR，会被截断或报错 —— 待核实。
 *   4. 同意/驳回是「一次点击直接终结」：status 直接变「已通过」/「已驳回」，
 *      max_level 字段建了但没真正参与多级流转。
 *
 * 注入的依赖（全部来自 server.js）：
 *   db                         Database 实例（prepare 风格）
 *   getCurrentUser             req → { userId, userName }（server.js 第 5772 行）
 *   getUserId                  req → 员工 id（仅在发起审批时用）
 *   addLog                     写操作日志
 *   sendApprovalNotification   审批通知（server.js 第 6398 行，函数声明，会提升）
 */

module.exports = function registerApprovalRoutes(app, deps) {
  const { db, getCurrentUser, getUserId, addLog, sendApprovalNotification } = deps;

  // 我的申请列表
  app.get('/api/approvals/my', async (req, res) => {
    try {
      const { userId } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
    
      const { status, type, keyword } = req.query;
      let sql = 'SELECT * FROM approvals WHERE applicant_id = ?';
      const params = [userId];
    
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    
      sql += ' ORDER BY created_at DESC';
      const stmt = db.prepare(sql);
      const list = await stmt.all(...params);
      res.json(list);
    } catch (err) {
      console.error('approvals/my error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 待我审批列表
  app.get('/api/approvals/todo', async (req, res) => {
    try {
      const { userId } = await getCurrentUser(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
    
      const { status, type, keyword } = req.query;
      // 查找 approver_ids 包含当前用户ID的记录
      let sql = "SELECT * FROM approvals WHERE status = '待审批' AND FIND_IN_SET(?, approver_ids)";
      const params = [userId.toString()];
    
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    
      sql += ' ORDER BY created_at DESC';
      const stmt = db.prepare(sql);
      const list = await stmt.all(...params);
      res.json(list);
    } catch (err) {
      console.error('approvals/todo error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 获取审批详情（含审批记录）
  app.get('/api/approvals/:id', async (req, res) => {
    try {
      const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
      if (!approval) return res.status(404).json({ error: '审批不存在' });
    
      const records = await db.prepare('SELECT * FROM approval_records WHERE approval_id = ? ORDER BY created_at ASC').all(req.params.id);
      res.json({ ...approval, records });
    } catch (err) {
      console.error('approvals/:id error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 发起审批
  app.post('/api/approvals', async (req, res) => {
    const userId = getUserId(req);
    const { userId: uid, userName: uname } = await getCurrentUser(req);
  
    const { title, type, content, amount, approver_id, approver_name, approver_ids, approver_names, form_data } = req.body;
  
    if (!title || !approver_id) {
      return res.status(400).json({ error: '标题和审批人不能为空' });
    }
  
    // 支持多审批人（逗号分隔）
    const approverIdStr = approver_ids || approver_id.toString();
    const approverNameStr = approver_names || approver_name;
  
    const stmt = db.prepare(`
      INSERT INTO approvals (title, type, applicant_id, applicant_name, content, amount, 
        status, approver_id, approver_name, approver_ids, approver_names, max_level, form_data)
      VALUES (?, ?, ?, ?, ?, ?, '待审批', ?, ?, ?, ?, 1, ?)
    `);
    const result = await stmt.run(
      title, type || '其他', uid, uname, content, amount,
      approver_id, approver_name, approverIdStr, approverNameStr, 
      form_data ? JSON.stringify(form_data) : null
    );
  
    const approvalId = result.lastInsertRowid;
    await addLog(uid, '', '新增', '审批管理', approvalId, title, `发起审批: ${title}`, req.ip);
  
    // 发送通知给审批人
    const approverIdList = approverIdStr.split(',');
    const approverNameList = approverNameStr.split(',');
    for (let i = 0; i < approverIdList.length; i++) {
      const aId = parseInt(approverIdList[i]);
      if (aId && aId !== uid) {
        await sendApprovalNotification({
          userId: aId,
          userName: approverNameList[i] || '',
          title: '您有新的审批待处理',
          content: `${uname} 提交了审批：${title}`,
          type: '审批',
          relatedId: approvalId,
          relatedType: 'approval'
        });
      }
    }
  
    res.json({ id: approvalId, message: '提交成功' });
  });

  // 审批操作（同意）
  app.post('/api/approvals/:id/approve', async (req, res) => {
    const { userId, userName } = await getCurrentUser(req);
    const { comment } = req.body;
  
    const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
    if (!approval) return res.status(404).json({ error: '审批不存在' });
  
    // 检查是否是当前审批人
    const approverIdList = (approval.approver_ids || approval.approver_id.toString()).split(',');
    if (!approverIdList.includes(userId.toString())) {
      return res.status(403).json({ error: '您不是此审批的审批人' });
    }
  
    // 记录审批
    await db.prepare(`
      INSERT INTO approval_records (approval_id, approver_id, approver_name, action, comment)
      VALUES (?, ?, ?, '同意', ?)
    `).run(req.params.id, userId, userName, comment || '');
  
    // 更新审批状态
    await db.prepare(`
      UPDATE approvals SET status = '已通过', approve_time = ?, remark = CONCAT(IFNULL(remark, ''), ?)
      WHERE id = ?
    `).run(new Date().toISOString(), `${userName}同意${comment ? '：' + comment : ''}；`, req.params.id);
  
    await addLog(userId, '', '审批', '审批管理', req.params.id, approval.title, `审批通过: ${approval.title}`, req.ip);
  
    // 通知申请人
    await sendApprovalNotification({
      userId: approval.applicant_id,
      userName: approval.applicant_name,
      title: '审批已通过',
      content: `您的审批「${approval.title}」已通过`,
      type: '审批',
      relatedId: approval.id,
      relatedType: 'approval'
    });
  
    res.json({ message: '审批成功' });
  });

  // 审批操作（驳回）
  app.post('/api/approvals/:id/reject', async (req, res) => {
    const { userId, userName } = await getCurrentUser(req);
    const { comment } = req.body;
  
    const [approval] = await db.prepare('SELECT * FROM approvals WHERE id = ?').all(req.params.id);
    if (!approval) return res.status(404).json({ error: '审批不存在' });
  
    const approverIdList = (approval.approver_ids || approval.approver_id.toString()).split(',');
    if (!approverIdList.includes(userId.toString())) {
      return res.status(403).json({ error: '您不是此审批的审批人' });
    }
  
    await db.prepare(`
      INSERT INTO approval_records (approval_id, approver_id, approver_name, action, comment)
      VALUES (?, ?, ?, '驳回', ?)
    `).run(req.params.id, userId, userName, comment || '');
  
    await db.prepare(`
      UPDATE approvals SET status = '已驳回', approve_time = ?, remark = CONCAT(IFNULL(remark, ''), ?)
      WHERE id = ?
    `).run(new Date().toISOString(), `${userName}驳回${comment ? '：' + comment : ''}；`, req.params.id);
  
    await addLog(userId, '', '审批', '审批管理', req.params.id, approval.title, `审批驳回: ${approval.title}`, req.ip);
  
    await sendApprovalNotification({
      userId: approval.applicant_id,
      userName: approval.applicant_name,
      title: '审批已被驳回',
      content: `您的审批「${approval.title}」已被驳回${comment ? '：' + comment : ''}`,
      type: '审批',
      relatedId: approval.id,
      relatedType: 'approval'
    });
  
    res.json({ message: '驳回成功' });
  });
};
