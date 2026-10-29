/**
 * 汇报 / 公告 / 巡检（2026-10-29 渐进拆分第 18 轮）
 *
 * 搬运自 server.js 原 3560-3771 行，搬入时 212 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerReportNoticeRoutes(app, deps) {
  const {
    db,
    pool,
    permCore,
    getUserId,
    addLog,
    checkPermission,
    isAdmin,
    buildProjectScopeClause,
    notifyProject,
  } = deps;

  app.get('/api/reports', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/reports', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { title, content, report_type, reporter_id, reporter_name, status } = req.body;
    const stmt = db.prepare('INSERT INTO reports (title, content, report_type, reporter_id, reporter_name, status) VALUES (?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(title, content, report_type, reporter_id, reporter_name, status || '待审核');
    await addLog(userId, '', '新增', '汇报管理', result.lastInsertRowid, title, `汇报标题: ${title}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/reports/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { title, content, report_type, status, reviewer_id, reviewer_name, review_time } = req.body;
    const stmt = db.prepare('UPDATE reports SET title=?, content=?, report_type=?, status=?, reviewer_id=?, reviewer_name=?, review_time=? WHERE id=?');
    await stmt.run(title, content, report_type, status, reviewer_id, reviewer_name, review_time, req.params.id);
    await addLog(userId, '', '编辑', '汇报管理', req.params.id, title, `更新汇报: ${title}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/reports/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [r] = await db.prepare('SELECT title FROM reports WHERE id = ?').all(req.params.id);
    const rTitle = r ? r.title : req.params.id;
    const stmt = db.prepare('DELETE FROM reports WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '汇报管理', req.params.id, rTitle, `删除汇报: ${rTitle}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.get('/api/notices', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM notices ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/notices', checkPermission('notice:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { title, content, type, publisher_id, publisher_name, status, publish_time } = req.body;
    const stmt = db.prepare('INSERT INTO notices (title, content, type, publisher_id, publisher_name, status, publish_time) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(title, content, type, publisher_id, publisher_name, status || '草稿', publish_time);
    await addLog(userId, '', '新增', '公告管理', result.lastInsertRowid, title, `公告标题: ${title}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/notices/:id', checkPermission('notice:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { title, content, type, status, publish_time } = req.body;
    const stmt = db.prepare('UPDATE notices SET title=?, content=?, type=?, status=?, publish_time=? WHERE id=?');
    await stmt.run(title, content, type, status, publish_time, req.params.id);
    await addLog(userId, '', '编辑', '公告管理', req.params.id, title, `更新公告: ${title}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/notices/:id', checkPermission('notice:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [n] = await db.prepare('SELECT title FROM notices WHERE id = ?').all(req.params.id);
    const nTitle = n ? n.title : req.params.id;
    const stmt = db.prepare('DELETE FROM notices WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '公告管理', req.params.id, nTitle, `删除公告: ${nTitle}`, req.ip);
    res.json({ message: '删除成功' });
  });

  app.get('/api/inspections', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { project_id } = req.query;

    // 业主端：x-user-id 是 customers.id / family_members.id，不在 employees 表，
    // 走下面员工 RBAC 必然 403。业主只看自己名下项目的巡检记录。
    const customer = await permCore.resolveCustomerIdentity(userId, req.headers['x-user-type'], req.headers['x-user-scope']);
    if (customer) {
      const myIds = await permCore.customerProjectIds(customer);
      if (project_id) {
        if (!myIds.has(Number(project_id))) {
          return res.status(403).json({ error: '该项目不在您的名下' });
        }
        const [rows] = await pool.query(
        `SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC`,
          [project_id]
        );
        return res.json(rows);
      }
      const ids = Array.from(myIds);
      if (!ids.length) return res.json([]);
      const [rows] = await pool.query(
      `SELECT * FROM inspections WHERE project_id IN (?) ORDER BY created_at DESC`,
        [ids]
      );
      return res.json(rows);
    }

    const scope = await buildProjectScopeClause(userId, 'inspection', '', 'project_id');
    // 即使传了 project_id，仍校验它在可见集内
    if (project_id) {
      const ids = Array.from(await permCore.relatedProjectIds(userId));
      const admin = await permCore.canReadAll(userId, 'inspection');
      if (!admin && !ids.includes(Number(project_id))) return res.status(403).json({ error: '该项目不在可见范围内' });
      const [rows] = await pool.query(
      `SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC`,
        [project_id]
      );
      return res.json(rows);
    }
    const [rows] = await pool.query(
    `SELECT * FROM inspections WHERE 1=1${scope.sql} ORDER BY created_at DESC`,
      scope.params
    );
    res.json(rows);
  });

  app.post('/api/inspections', checkPermission('inspection:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status } = req.body;
    const stmt = db.prepare('INSERT INTO inspections (project_id, project_name, inspector_id, inspector_name, score, status, issues, images, result, rectify_status, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    const result2 = await stmt.run(project_id, project_name, inspector_id, inspector_name, score, status || '待整改', issues, JSON.stringify(images || []), result, rectify_status || '待整改', userId);
    await addLog(userId, '', '新增', '验房管理', result2.lastInsertRowid, project_name, `项目: ${project_name}`, req.ip);

    // 通知：巡检验收提交
    notifyProject(
      'inspection_submit',
      project_id,
    `工地巡检提交：${project_name}`,
    `工地巡检已提交，巡检人：${inspector_name}，得分：${score || '未评分'}。请及时查看。`,
      result2.lastInsertRowid,
      'inspection'
    ).catch(console.error);

    res.json({ id: result2.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/inspections/:id', checkPermission('inspection:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];

    const userId = getUserId(req);
    const { score, status, issues, result, rectify_status } = req.body;
    // 权限检查
    const [existing] = await db.prepare('SELECT project_name, creator_id FROM inspections WHERE id = ?').all(req.params.id);
    if (!existing) return res.status(404).json({ error: '验房记录不存在' });
    if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
    const inspName = existing.project_name;
    const stmt = db.prepare('UPDATE inspections SET score=?, status=?, issues=?, result=?, rectify_status=? WHERE id=?');
    await stmt.run(score, status, issues, result, rectify_status, req.params.id);
    await addLog(userId, '', '编辑', '验房管理', req.params.id, inspName, `更新验房: ${inspName}`, req.ip);
    res.json({ message: '更新成功' });
  });

  // 删除巡检（谁创建谁可以删除）
  // 删除巡检记录
  // ⚠️ 权限口径：创建者本人 或 管理员。
  //   刻意**不**用 checkPermission('inspection:delete')。理由：
  //   `inspection:delete` 在角色种子里只发给了工程监理（Engineer），
  //   而本接口同时允许「创建者本人删除自己的记录」——创建者可能是设计师、
  //   项目经理、普通员工，他们都没有这个权限点。加中间件会把「自删」砍掉，
  //   还会反过来让监理获得删除全公司巡检的能力，整体是**放宽**而非收紧。
  //   （2026-10-29 清洗重复注册时删掉的 7431 就是 checkPermission 版，
  //    当时误判为「加固版」，实际是相反的，这里更正。）
  //   判断改用 isAdmin(userId) 权威解析（按 id 反查角色，带 60s 缓存），
  //   不再读 x-user-role 头 —— 虽然 server.js:201 的中间件会重算覆盖该头，
  //   但少依赖一次「中间件先跑」这个隐含前提更稳。
  app.delete('/api/inspections/:id', async (req, res) => {
    const userId = getUserId(req);

    const [insp] = await db.prepare('SELECT * FROM inspections WHERE id = ?').all(req.params.id);
    if (!insp) return res.status(404).json({ error: '巡检记录不存在' });

    const isSelf = insp.creator_id != null && String(insp.creator_id) === String(userId);
    if (!isSelf && !(await isAdmin(userId))) {
      return res.status(403).json({ error: '无权删除他人的巡检' });
    }

    await db.prepare('DELETE FROM inspections WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  });

  // 获取我的巡检（当前用户创建的所有整改问题）
  app.get('/api/my/inspections', async (req, res) => {
    const userId = getUserId(req);
    try {
      const stmt = db.prepare(`
      SELECT r.*, p.name as project_name 
      FROM rectification_issues r 
      LEFT JOIN projects p ON r.project_id = p.id 
      WHERE r.creator_id = ? OR r.creator_id IS NULL
      ORDER BY r.created_at DESC
    `);
      res.json(await stmt.all(userId));
    } catch (e) {
      console.error('查询巡检失败:', e.message);
      res.json([]);
    }
  });

};
