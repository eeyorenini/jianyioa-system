/**
 * 手写签名库（2026-10-30 新建）
 *
 * 业务：员工 / 业主在个人中心手写一次签名并保存，之后任何需要签名的地方
 *      （验收单签字、未来的增减项确认、材料签收…）直接调用，不用每次重画。
 *
 * 表 user_signatures：一行 = 一个身份（员工或业主）的一份当前有效签名。
 *   - user_type = 'employee' | 'customer'   ← 两套用户表 id 会撞号，必须带类型
 *   - version 每次重签 +1，签过的历史单存的是自己的 url 快照，不受影响
 *
 * 身份判定：
 *   getUserId(req) 只认 x-user-id header；user_type 取 x-user-type header。
 *   ⚠️ 绝不从 body/query 取 user_id —— 那等于「?user_id=1 就能改别人的签名」。
 *
 * 图片：签名由前端 canvas 导出 PNG 后走 /api/upload-image 上传，
 *      这里只收 /uploads/ 下的相对路径，避免被塞外链。
 */
module.exports = function registerSignatureRoutes(app, deps) {
  const { pool, getUserId, addLog } = deps;

  let ensured = null;
  function ensureTable() {
    if (ensured) return ensured;
    ensured = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_signatures (
          id INT(11) NOT NULL AUTO_INCREMENT,
          user_type VARCHAR(20) NOT NULL DEFAULT 'employee',
          user_id INT(11) NOT NULL,
          sign_url VARCHAR(500) NOT NULL,
          sign_name VARCHAR(100) DEFAULT NULL,
          stroke_count INT(11) DEFAULT 0,
          version INT(11) DEFAULT 1,
          created_at DATETIME DEFAULT NULL,
          updated_at DATETIME DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uk_owner (user_type, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((e) => {
      ensured = null;
      console.error('[signatures] 建表失败:', e.message);
      throw e;
    });
    return ensured;
  }

  /** 当前身份：{ userId, userType }；未登录返回 null */
  function currentOwner(req) {
    const userId = getUserId(req);
    if (!userId) return null;
    const userType = String(req.headers['x-user-type'] || '') === 'customer' ? 'customer' : 'employee';
    return { userId: Number(userId), userType };
  }

  function fmtNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** 取某个身份的签名行（内部复用） */
  async function getSignature(userType, userId) {
    const [rows] = await pool.query(
      'SELECT * FROM user_signatures WHERE user_type = ? AND user_id = ? LIMIT 1',
      [userType, userId]
    );
    return rows[0] || null;
  }

  // ==================== 我的签名 ====================
  app.get('/api/signatures/me', async (req, res) => {
    try {
      await ensureTable();
      const owner = currentOwner(req);
      if (!owner) return res.status(401).json({ error: '未登录' });
      const row = await getSignature(owner.userType, owner.userId);
      if (!row) return res.json({ exists: false });
      // 姓名兜底：员工取 employees.name，业主取 customers.name
      let name = row.sign_name;
      if (!name) {
        try {
          const table = owner.userType === 'customer' ? 'customers' : 'employees';
          const [u] = await pool.query(`SELECT name FROM ${table} WHERE id = ?`, [owner.userId]);
          name = u.length ? u[0].name : null;
        } catch (e) { /* 忽略 */ }
      }
      res.json({
        exists: true,
        sign_url: row.sign_url,
        sign_name: name,
        version: row.version,
        stroke_count: row.stroke_count,
        updated_at: row.updated_at,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/signatures/me', async (req, res) => {
    try {
      await ensureTable();
      const owner = currentOwner(req);
      if (!owner) return res.status(401).json({ error: '未登录' });
      const { sign_url, stroke_count, sign_name } = req.body || {};
      if (!sign_url || typeof sign_url !== 'string' || !sign_url.startsWith('/uploads/')) {
        return res.status(400).json({ error: '签名图片无效，请重新签写' });
      }
      const strokes = Number(stroke_count) || 0;
      // 只挡「完全没下笔」的空图；1 笔也可能是合法的连笔签名，不能卡 2 笔
      if (strokes < 1) return res.status(400).json({ error: '签名内容为空，请重新签写' });

      const old = await getSignature(owner.userType, owner.userId);
      const nowStr = fmtNow();
      if (old) {
        await pool.query(
          'UPDATE user_signatures SET sign_url = ?, sign_name = ?, stroke_count = ?, version = version + 1, updated_at = ? WHERE id = ?',
          [sign_url, sign_name || old.sign_name || null, strokes, nowStr, old.id]
        );
      } else {
        await pool.query(
          'INSERT INTO user_signatures (user_type, user_id, sign_url, sign_name, stroke_count, version, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)',
          [owner.userType, owner.userId, sign_url, sign_name || null, strokes, nowStr, nowStr]
        );
      }
      if (owner.userType === 'employee') {
        await addLog(owner.userId, '', old ? '修改' : '新增', '我的签名', owner.userId, null,
          old ? '重新签写手写签名' : '保存手写签名', req.ip);
      }
      const saved = await getSignature(owner.userType, owner.userId);
      res.json({ message: '签名已保存', sign_url: saved.sign_url, version: saved.version });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/signatures/me', async (req, res) => {
    try {
      await ensureTable();
      const owner = currentOwner(req);
      if (!owner) return res.status(401).json({ error: '未登录' });
      await pool.query('DELETE FROM user_signatures WHERE user_type = ? AND user_id = ?',
        [owner.userType, owner.userId]);
      res.json({ message: '已删除' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 报告渲染用：按身份取签名（员工内部调用，不带敏感信息） */
  app.get('/api/signatures/lookup', async (req, res) => {
    try {
      await ensureTable();
      if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
      const type = String(req.query.user_type || 'employee') === 'customer' ? 'customer' : 'employee';
      const uid = parseInt(req.query.user_id, 10);
      if (!uid) return res.status(400).json({ error: '缺少 user_id' });
      const row = await getSignature(type, uid);
      res.json({ exists: !!row, sign_url: row ? row.sign_url : null, version: row ? row.version : 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
