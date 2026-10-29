/**
 * 客户管理（含合同编号生成）（2026-10-29 渐进拆分第 16 轮）
 *
 * 搬运自 server.js 原 1468-1897 行，搬入时 430 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerCustomerRoutes(app, deps) {
  const {
    db,
    pool,
    permCore,
    getUserId,
    checkPermission,
    hasReadAllPermission,
    isAdmin,
    addLog,
    notifyProject,
  } = deps;

  // ==================== 客户管理 ====================
  // GET 客户列表 — 下拉选择用，不受权限限制
  app.get('/api/customers', async (req, res) => {
    try {
      const { search, status } = req.query;
      const userId = getUserId(req);
      const userRole = req.headers['x-user-role'] || '';
      const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
      const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'customer');

      let sql = hasAll
        ? 'SELECT * FROM customers WHERE 1=1'
        : 'SELECT * FROM customers WHERE creator_id = ?';
      const params = hasAll ? [] : [userId];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC';
      const stmt = db.prepare(sql);
      res.json(await stmt.all(...params));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
    
      // 检查手机号是否存在（phone 为空则跳过查重）
      const existing = phone ? await db.prepare('SELECT id, creator_id FROM customers WHERE phone = ?').get(phone) : null;
      if (existing) {
        // 手机号已存在，判断是否可认领（creator_id 为 null 表示无主，可被任何人认领）
        const isSameCreator = existing.creator_id === userId;
        const isUnclaimed = existing.creator_id === null || existing.creator_id === 0;
        if (isSameCreator || isUnclaimed) {
          // 同添加人 或 无主客户 → 前端询问是否覆盖
          return res.status(409).json({ 
            code: 'SAME_CREATOR',
            message: '该手机号已被您添加，是否更新客户信息？',
            existing_id: existing.id
          });
        } else {
          // 不同添加人 → 查出对方姓名返回
          const emp = await db.prepare('SELECT name FROM employees WHERE id = ?').get(existing.creator_id);
          const adderName = emp ? emp.name : '其他员工';
          return res.status(409).json({ 
            code: 'DIFFERENT_CREATOR', 
            message: `此客户已被 ${adderName} 添加`,
            existing_id: existing.id
          });
        }
      }
    
      // 自动生成客户编号
      let finalCustomerNo = customer_no;
      if (!finalCustomerNo || finalCustomerNo.trim() === '') {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rows = await db.prepare("SELECT customer_no FROM customers WHERE customer_no LIKE ? ORDER BY customer_no DESC LIMIT 1").all('KH' + today + '%');
        const maxRow = rows[0];
        let seq = 1;
        if (maxRow && maxRow.customer_no) {
          const lastSeq = parseInt(maxRow.customer_no.slice(-4));
          seq = lastSeq + 1;
        }
        finalCustomerNo = 'KH' + today + String(seq).padStart(4, '0');
      }
    
      const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
      const stmt = db.prepare('INSERT INTO customers (customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, creator_id, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(finalCustomerNo, name, phone, source, status || '新客户', level || '普通', follow_user, address, area, budget, demand, next_follow_date, userId, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson);
      await addLog(userId, '', '新增', '客户管理', result.lastInsertRowid, name, `客户名称: ${name}, 电话: ${phone}`, req.ip);
      res.json({ id: result.lastInsertRowid, customer_no: finalCustomerNo, message: '添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 手机号查重（实时检查，blur 时前端调用）
  app.get('/api/customers/check-phone', async (req, res) => {
    try {
      const { phone } = req.query;
      const userId = getUserId(req);
      if (!phone) return res.json({ exists: false });

      const existing = await db.prepare('SELECT id, creator_id FROM customers WHERE phone = ?').get(phone);
      if (!existing) return res.json({ exists: false });

      // 无主客户 → 可认领
      if (existing.creator_id === null || existing.creator_id === 0) {
        return res.json({ exists: true, code: 'UNCLAIMED', message: '此号码客户尚无归属，您可以直接认领' });
      }
      // 同添加人
      if (existing.creator_id === userId) {
        return res.json({ exists: true, code: 'SAME_CREATOR', message: '此号码是您添加的客户' });
      }
      // 不同添加人 → 查出对方姓名
      const emp = await db.prepare('SELECT name FROM employees WHERE id = ?').get(existing.creator_id);
      return res.json({ exists: true, code: 'DIFFERENT_CREATOR', message: `此客户已被 ${emp?.name || '其他员工'} 添加` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/customers/:id', checkPermission('customer:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
      const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
      const stmt = db.prepare('UPDATE customers SET customer_no=?, name=?, phone=?, source=?, status=?, level=?, follow_user=?, address=?, area=?, budget=?, demand=?, next_follow_date=?, gender=?, entry_date=?, contact_name2=?, contact_phone2=?, other_phone=?, email=?, qq=?, provider=?, tags=? WHERE id=?');
      await stmt.run(customer_no, name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson, req.params.id);
      await addLog(userId, '', '编辑', '客户管理', req.params.id, name, `更新客户: ${name}`, req.ip);
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 强制覆盖更新（用于手机号冲突时用户确认覆盖）
  app.put('/api/customers/:id/overwrite', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, phone, source, status, level, follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tags } = req.body;
      const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);

      // 先查现有客户，判断 creator_id 是否为 NULL（无主客户可认领）
      const existing = await db.prepare('SELECT creator_id FROM customers WHERE id = ?').get(req.params.id);
      const newCreatorId = (existing?.creator_id === null || existing?.creator_id === 0) ? userId : existing?.creator_id;

      const stmt = db.prepare('UPDATE customers SET name=?, phone=?, source=?, status=?, level=?, follow_user=?, address=?, area=?, budget=?, demand=?, next_follow_date=?, gender=?, entry_date=?, contact_name2=?, contact_phone2=?, other_phone=?, email=?, qq=?, provider=?, tags=?, creator_id=? WHERE id=?');
      await stmt.run(name, phone, source, status || '新客户', level || '普通', follow_user, address, area, budget, demand, next_follow_date, gender, entry_date, contact_name2, contact_phone2, other_phone, email, qq, provider, tagsJson, newCreatorId, req.params.id);
      await addLog(userId, '', '覆盖更新', '客户管理', req.params.id, name, `覆盖更新客户: ${name}`, req.ip);
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/customers/:id', checkPermission('customer:delete'), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
      const [c] = await db.prepare('SELECT name FROM customers WHERE id = ?').all(req.params.id);
      const cName = c ? c.name : req.params.id;
      const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
      await stmt.run(req.params.id);
      await addLog(userId, '', '删除', '客户管理', req.params.id, cName, `删除客户: ${cName}`, req.ip);
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/customer-follow/:customerId', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM customer_follow WHERE customer_id = ? ORDER BY created_at DESC');
    res.json(await stmt.all(req.params.customerId));
  });

  app.post('/api/customer-follow', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { customer_id, follow_type, content, follow_date, next_date } = req.body;
    const stmt = db.prepare('INSERT INTO customer_follow (customer_id, follow_type, content, follow_date, next_date, creator_id) VALUES (?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(customer_id, follow_type, content, follow_date, next_date, userId);
    const [cust] = await db.prepare('SELECT name FROM customers WHERE id = ?').all(customer_id);
    await addLog(userId, '', '新增', '客户跟进', result.lastInsertRowid, cust?.name || '', `跟进客户: ${cust?.name || customer_id}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.get('/api/contracts', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const page = parseInt(req.query.page || 1);
    const pageSize = Math.min(parseInt(req.query.pageSize || 100), 500);
    const offset = (page - 1) * pageSize;

    // 列表接口排除 content 字段（内容太大，按需加载）
    const listFields = 'id, contract_no, category, customer_name, customer_phone, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, attachment, custom_fields, created_by, created_at';

    let rows, total;
    const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
    const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'contract');

    if (hasAll) {
      const [countRows] = await pool.query('SELECT COUNT(*) as total FROM contracts');
      total = Number(countRows[0]?.total) || 0;
      const [rowsRaw] = await pool.query(`SELECT ${listFields} FROM contracts ORDER BY id DESC LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`);
      rows = rowsRaw;
    } else if (userId) {
      // P2 §4.5：合同可见性 = (创建人 ∪ 关联项目)；project_id IS NULL 的历史合同按创建人走
      const relatedIds = Array.from(await permCore.relatedProjectIds(userId));
      const placeholders = relatedIds.length ? relatedIds.map(() => '?').join(',') : '';
      const cond = `(created_by = ? ${relatedIds.length ? ` OR project_id IN (${placeholders})` : ''})`;
      const params = [userId, ...relatedIds];
      const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM contracts WHERE ${cond}`, params);
      total = Number(countRows[0]?.total) || 0;
      const [rowsRaw] = await pool.query(`SELECT ${listFields} FROM contracts WHERE ${cond} ORDER BY id DESC LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`, params);
      rows = rowsRaw;
    } else {
      total = 0;
      rows = [];
    }

    // 批量查出创建人名字
    const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
    let creatorMap = {};
    if (creatorIds.length > 0) {
      const placeholders = creatorIds.map(() => '?').join(',');
      const [creatorRows] = await pool.query(`SELECT id, name FROM employees WHERE id IN (${placeholders})`, creatorIds);
      creatorRows.forEach(u => { creatorMap[u.id] = u.name; });
    }

    rows.forEach(row => {
      if (row.custom_fields) {
        try { row.custom_fields = JSON.parse(row.custom_fields); } catch (e) {}
      }
      row.creator_name = creatorMap[row.created_by] || '';
    });

    res.json({ list: rows, total, page, pageSize });
  });

  app.get('/api/contracts/:id', async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const userRole = req.headers['x-user-role'] || '';
    const id = parseInt(req.params.id);

    try {
      const row = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: '合同不存在' });

      const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
      const canReadAll = userIsAdmin || await hasReadAllPermission(userId, 'contract');
      if (!canReadAll && row.created_by !== userId) {
        return res.status(403).json({ error: '无权查看此合同' });
      }

      if (row.custom_fields) {
        try { row.custom_fields = JSON.parse(row.custom_fields); } catch (e) {}
      }
      res.json(row);
    } catch (err) {
      console.error('合同详情查询失败:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  async function generateContractNo() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // FOR UPDATE 锁定同日期的行，防止并发冲突
      const [rows] = await conn.query(
        "SELECT contract_no FROM contracts WHERE contract_no LIKE ? FOR UPDATE",
        [`HT-${dateStr}%`]
      );
      let maxSeq = 0;
      for (const row of rows) {
        const seq = parseInt(row.contract_no.split('-').pop() || '0', 10);
        if (seq > maxSeq) maxSeq = seq;
      }
      const newNo = `HT-${dateStr}-${String(maxSeq + 1).padStart(3, '0')}`;
      await conn.commit();
      return newNo;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  app.post('/api/contracts', checkPermission('contract:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    console.log('=== POST /api/contracts 收到请求 ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body:', JSON.stringify(req.body));

    // 只提取需要的字段，排除多余字段
    const allowedFields = ['contract_no', 'customer_id', 'project_name', 'customer_name', 'customer_phone', 'customer_address', 'id_card', 'engineering_address', 'total_amount', 'design_fee', 'manager_fee', 'tax_amount', 'area', 'start_date', 'end_date', 'status', 'sign_date', 'decoration_style', 'payment1', 'payment2', 'payment3', 'guarantee_period', 'dispute_court', 'content', 'attachment', 'category', 'custom_fields'];
    const data = {};
    for (const field of allowedFields) {
      if (req.body && req.body[field] !== undefined) {
        data[field] = req.body[field];
      } else {
        data[field] = null;
      }
    }
  
    let { contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields } = data;
  
    console.log('解析后的字段:', { contract_no, project_name, customer_name, total_amount });
  
    customer_id = customer_id || null;
    attachment = attachment || '';
  
    if (!contract_no || !contract_no.trim()) {
      contract_no = await generateContractNo();
    }
  
    if (!project_name || !project_name.trim()) {
      return res.status(400).json({ error: '请填写项目名称' });
    }
    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: '请填写客户名称' });
    }
    if (!total_amount || total_amount <= 0) {
      return res.status(400).json({ error: '请填写有效的合同金额' });
    }
  
    // 打印参数值用于调试
    console.log('参数: contract_no=%s, customer_id=%s, project_name=%s, total_amount=%s', 
      contract_no, customer_id, project_name, total_amount);
  
    try {
      // 使用参数化 INSERT，lastInsertRowid 来自 mysql2 的 result.insertId
      const customFieldsVal = typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null);
      console.log('INSERT contracts SQL params:', {
        contract_no, customer_id, project_name, customer_name, customer_phone,
        customer_address, id_card, engineering_address, total_amount,
        design_fee: design_fee || 0, manager_fee: manager_fee || 0, tax_amount: tax_amount || 0,
        area, start_date, end_date, status: status || '待签订', sign_date, decoration_style,
        payment1: payment1 || 0, payment2: payment2 || 0, payment3: payment3 || 0,
        guarantee_period, dispute_court, content: content?.slice(0, 50), attachment: attachment?.slice(0, 50),
        category: category || 'decoration', customFieldsVal: customFieldsVal?.slice(0, 50),
        userId: userId || null, userId2: userId || null
      });
      const result = await db.prepare(`
        INSERT INTO contracts (contract_no, customer_id, project_name, customer_name, customer_phone,
          customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee,
          tax_amount, area, start_date, end_date, status, sign_date, decoration_style,
          payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment,
          category, custom_fields, created_by, creator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        contract_no, customer_id, project_name, customer_name, customer_phone,
        customer_address, id_card, engineering_address, total_amount,
        design_fee || 0, manager_fee || 0, tax_amount || 0,
        area, start_date, end_date, status || '待签订', sign_date, decoration_style,
        payment1 || 0, payment2 || 0, payment3 || 0,
        guarantee_period, dispute_court, content, attachment,
        category || 'decoration', customFieldsVal, userId || null, userId || null
      );
      const lastId = result.lastInsertRowid;
      console.log('INSERT contracts 执行成功, lastId:', lastId);
      await addLog(userId, '', '新增', '合同管理', lastId, project_name, `合同编号: ${contract_no}, 金额: ${total_amount}`, req.ip);
    
      // 自动保存签约人
      if (customer_name && customer_name.trim()) {
        try {
          const existingSigner = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(customer_name.trim(), userId || 0);
          if (existingSigner) {
            await db.prepare('UPDATE signers SET phone=?, id_card=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(customer_phone || '', id_card || '', existingSigner.id);
          } else {
            await db.prepare('INSERT INTO signers (name, phone, id_card, created_by, creator_id) VALUES (?, ?, ?, ?, ?)').run(customer_name.trim(), customer_phone || '', id_card || '', userId || 0, userId || 0);
          }
        } catch(e) { /* 签约人保存失败不影响合同保存 */ }
      }
    
      // 通知：新增合同
      notifyProject('contract_created', null,
        `新合同签订：${customer_name || ''} - ${project_name || ''}`,
        `合同编号：${contract_no}，客户：${customer_name || ''}，项目：${project_name || ''}，金额：${total_amount || ''}`,
        lastId, 'contract'
      ).catch(console.error);

      res.json({ id: lastId, message: '添加成功' });
    } catch (err) {
      console.error('数据库错误:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/contracts/:id', checkPermission('contract:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const editUserId = getUserId(req);
    const { contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee, manager_fee, tax_amount, area, start_date, end_date, status, sign_date, decoration_style, payment1, payment2, payment3, guarantee_period, dispute_court, content, attachment, category, custom_fields } = req.body;
  
    // 权限检查：非管理员只能修改自己创建的合同
    const [existingContract] = await db.prepare('SELECT created_by FROM contracts WHERE id = ?').all(req.params.id);
    if (!existingContract) return res.status(404).json({ error: '合同不存在' });
    if (existingContract.created_by !== editUserId && !(await isAdmin(editUserId))) return res.status(403).json({ error: '无权修改他人的数据' });

    if (!project_name || !project_name.trim()) {
      return res.status(400).json({ error: '请填写项目名称' });
    }
    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: '请填写客户名称' });
    }
    if (!total_amount || total_amount <= 0) {
      return res.status(400).json({ error: '请填写有效的合同金额' });
    }
  
    const stmt = db.prepare('UPDATE contracts SET contract_no=?, customer_id=?, project_name=?, customer_name=?, customer_phone=?, customer_address=?, id_card=?, engineering_address=?, total_amount=?, design_fee=?, manager_fee=?, tax_amount=?, area=?, start_date=?, end_date=?, status=?, sign_date=?, decoration_style=?, payment1=?, payment2=?, payment3=?, guarantee_period=?, dispute_court=?, content=?, attachment=?, category=?, custom_fields=? WHERE id=?');
    await stmt.run(contract_no, customer_id, project_name, customer_name, customer_phone, customer_address, id_card, engineering_address, total_amount, design_fee || 0, manager_fee || 0, tax_amount || 0, area, start_date, end_date, status, sign_date, decoration_style, payment1 || 0, payment2 || 0, payment3 || 0, guarantee_period, dispute_court, content, attachment, category, typeof custom_fields === 'string' ? custom_fields : (custom_fields ? JSON.stringify(custom_fields) : null), req.params.id);

    // 自动保存签约人
    if (customer_name && customer_name.trim()) {
      try {
        const existingSigner = await db.prepare('SELECT id FROM signers WHERE name = ? AND created_by = ?').get(customer_name.trim(), editUserId || 0);
        if (existingSigner) {
          await db.prepare('UPDATE signers SET phone=?, id_card=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(customer_phone || '', id_card || '', existingSigner.id);
        } else {
          await db.prepare('INSERT INTO signers (name, phone, id_card, created_by, creator_id) VALUES (?, ?, ?, ?, ?)').run(customer_name.trim(), customer_phone || '', id_card || '', editUserId || 0, editUserId || 0);
        }
      } catch(e) { /* 签约人保存失败不影响合同更新 */ }
    }

    await addLog(editUserId, '', '编辑', '合同管理', req.params.id, project_name, `更新合同: ${project_name}`, req.ip);
    res.json({ message: '更新成功' });
  });

};
