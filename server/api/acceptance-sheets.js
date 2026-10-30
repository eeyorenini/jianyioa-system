/**
 * 通用验收单（2026-10-30 新建）
 *
 * 业务：员工在移动端选「项目 + 验收类型」填单 → 逐项判定 → 自动出结果 → 生成验收报告。
 * 与旧 acceptance 表（阶段 + 手打分 + 图）无关，旧表保留不动，本模块独立成表。
 *
 * 表：
 *   acceptance_sheets        验收单主表（sheet_no / template_code / project / 结果统计 / 签字区）
 *   acceptance_sheet_items   逐项结果（条款快照 + verdict + 实测值 + 照片 + 关联整改单）
 *
 * 判定口径：
 *   任一 severity=red 项 fail            → result='fail'     （红线，硬阻断）
 *   有 normal 项 fail                    → result='rectify'  （整改中，自动生成整改单）
 *   全部 pass / na                       → result='pass'
 *   有 pending                            → result='pending'
 *
 * 签字：foreman（项目经理）/ supervisor（工程监理）/ designer（设计师）/ customer（业主）
 *   customer 相关字段全部预留，当前版本界面不启用 —— 以后要开业主签字，只需前端加入口 + 加验证码校验。
 */
const crypto = require('crypto');
const { TEMPLATE_MAP, flattenItems, templateSummary } = require('./acceptance-templates');

/** 本地时间 YYYY-MM-DD HH:mm:ss（服务器时区），MySQL DATETIME 直接可写 */
function fmtNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = function registerAcceptanceSheets(app, deps) {
  const { pool, db, getUserId, checkPermission, isAdmin, addLog } = deps;

  // ---------- 建表（懒加载单例，MySQL 5.5 兼容：DATETIME 不给 CURRENT_TIMESTAMP 默认值） ----------
  /** 老库补列：存在则跳过。MySQL 5.5 不支持 ADD COLUMN IF NOT EXISTS */
  async function ensureColumn(table, column, definition) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows.length) return;
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[acceptance-sheets] 补列 ${table}.${column}`);
  }

  let ensured = null;
  function ensureTables() {
    if (ensured) return ensured;
    ensured = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS acceptance_sheets (
          id INT(11) NOT NULL AUTO_INCREMENT,
          sheet_no VARCHAR(50) NOT NULL,
          template_code VARCHAR(50) NOT NULL,
          template_name VARCHAR(100) NOT NULL,
          trade VARCHAR(20) DEFAULT NULL,
          project_id INT(11) NOT NULL,
          project_name VARCHAR(255) DEFAULT NULL,
          customer_name VARCHAR(100) DEFAULT NULL,
          accept_date VARCHAR(50) DEFAULT NULL,
          area VARCHAR(50) DEFAULT NULL,
          batch_no INT(11) DEFAULT NULL,
          result VARCHAR(20) DEFAULT 'pending',
          item_count INT(11) DEFAULT 0,
          pass_count INT(11) DEFAULT 0,
          fail_count INT(11) DEFAULT 0,
          na_count INT(11) DEFAULT 0,
          red_fail_count INT(11) DEFAULT 0,
          photos TEXT,
          remark TEXT,
          foreman_id INT(11) DEFAULT NULL,
          foreman_name VARCHAR(100) DEFAULT NULL,
          foreman_sign_at DATETIME DEFAULT NULL,
          supervisor_id INT(11) DEFAULT NULL,
          supervisor_name VARCHAR(100) DEFAULT NULL,
          supervisor_sign_at DATETIME DEFAULT NULL,
          designer_id INT(11) DEFAULT NULL,
          designer_name VARCHAR(100) DEFAULT NULL,
          designer_sign_at DATETIME DEFAULT NULL,
          customer_id INT(11) DEFAULT NULL,
          customer_sign_name VARCHAR(100) DEFAULT NULL,
          customer_sign_at DATETIME DEFAULT NULL,
          customer_sign_url VARCHAR(500) DEFAULT NULL,
          customer_refused TINYINT(1) DEFAULT 0,
          report_url VARCHAR(500) DEFAULT NULL,
          report_at DATETIME DEFAULT NULL,
          creator_id INT(11) DEFAULT NULL,
          created_at DATETIME DEFAULT NULL,
          updated_at DATETIME DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uk_sheet_no (sheet_no),
          KEY idx_project (project_id),
          KEY idx_template (template_code),
          KEY idx_result (result)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      // 2026-10-30 追加：手写签名图 + 双签状态 + 分享短链
      // 老库靠这里补齐（MySQL 5.5 不支持 ADD COLUMN IF NOT EXISTS，只能查 information_schema）
      await ensureColumn('acceptance_sheets', 'foreman_sign_url', 'VARCHAR(500) DEFAULT NULL');
      await ensureColumn('acceptance_sheets', 'supervisor_sign_url', 'VARCHAR(500) DEFAULT NULL');
      await ensureColumn('acceptance_sheets', 'designer_sign_url', 'VARCHAR(500) DEFAULT NULL');
      await ensureColumn('acceptance_sheets', 'require_sign', "VARCHAR(100) DEFAULT NULL COMMENT '应签角色，逗号分隔'");
      await ensureColumn('acceptance_sheets', 'sign_state', "VARCHAR(100) DEFAULT NULL COMMENT '已签角色，逗号分隔'");
      await ensureColumn('acceptance_sheets', 'share_token', 'VARCHAR(64) DEFAULT NULL');
      await ensureColumn('acceptance_sheets', 'share_at', 'DATETIME DEFAULT NULL');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS acceptance_sheet_items (
          id INT(11) NOT NULL AUTO_INCREMENT,
          sheet_id INT(11) NOT NULL,
          seq INT(11) DEFAULT 0,
          group_name VARCHAR(50) DEFAULT NULL,
          item_code VARCHAR(50) DEFAULT NULL,
          title VARCHAR(255) DEFAULT NULL,
          standard VARCHAR(500) DEFAULT NULL,
          metric VARCHAR(100) DEFAULT NULL,
          severity VARCHAR(10) DEFAULT 'normal',
          kind VARCHAR(10) DEFAULT 'check',
          unit VARCHAR(20) DEFAULT NULL,
          verdict VARCHAR(20) DEFAULT 'pending',
          value VARCHAR(100) DEFAULT NULL,
          photos TEXT,
          remark VARCHAR(255) DEFAULT NULL,
          rectify_id INT(11) DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_sheet (sheet_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((e) => {
      ensured = null;
      console.error('[acceptance-sheets] 建表失败:', e.message);
      throw e;
    });
    return ensured;
  }

  /** 生成验收单号：YS + yyyyMMdd + 3 位当天序号 */
  async function genSheetNo(conn) {
    const q = conn || pool;
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = 'YS' + ymd;
    const [rows] = await q.query(
      'SELECT sheet_no FROM acceptance_sheets WHERE sheet_no LIKE ? ORDER BY sheet_no DESC LIMIT 1', [prefix + '%']
    );
    let next = 1;
    if (rows.length) {
      const n = parseInt(String(rows[0].sheet_no).slice(prefix.length), 10);
      if (!isNaN(n)) next = n + 1;
    }
    return prefix + String(next).padStart(3, '0');
  }

  /** 模板快照 + 判定 */
  function buildItemRows(templateCode, submitted) {
    const tplItems = flattenItems(templateCode);
    const inputMap = {};
    (Array.isArray(submitted) ? submitted : []).forEach((it) => {
      if (it && it.item_code) inputMap[it.item_code] = it;
    });
    return tplItems.map((t) => {
      const input = inputMap[t.item_code] || {};
      let verdict = String(input.verdict || 'pending');
      if (!['pass', 'fail', 'na', 'pending'].includes(verdict)) verdict = 'pending';
      return {
        ...t,
        verdict,
        value: input.value != null ? String(input.value).slice(0, 100) : null,
        remark: input.remark ? String(input.remark).slice(0, 255) : null,
        photos: Array.isArray(input.photos) ? JSON.stringify(input.photos) : (input.photos || null),
      };
    });
  }

  function summarize(rows) {
    const s = { item_count: rows.length, pass_count: 0, fail_count: 0, na_count: 0, red_fail_count: 0, result: 'pending' };
    rows.forEach((r) => {
      if (r.verdict === 'pass') s.pass_count += 1;
      else if (r.verdict === 'fail') {
        s.fail_count += 1;
        if (r.severity === 'red') s.red_fail_count += 1;
      } else if (r.verdict === 'na') s.na_count += 1;
    });
    if (s.red_fail_count > 0) s.result = 'fail';
    else if (s.fail_count > 0) s.result = 'rectify';
    else if (rows.some((r) => r.verdict === 'pending')) s.result = 'pending';
    else s.result = 'pass';
    return s;
  }

  function requireStaff(req, res) {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: '未登录' }); return null; }
    if (String(req.headers['x-user-type'] || '') === 'customer') {
      res.status(403).json({ error: '该功能仅限员工使用' });
      return null;
    }
    return userId;
  }

  // ---------- 签字相关 ----------
  const SIGN_ROLE_LABEL = { foreman: '项目经理', supervisor: '工程监理', designer: '设计师', customer: '业主' };
  const SIGN_ROLE_COL = {
    foreman: ['foreman_id', 'foreman_name', 'foreman_sign_at', 'foreman_sign_url'],
    supervisor: ['supervisor_id', 'supervisor_name', 'supervisor_sign_at', 'supervisor_sign_url'],
    designer: ['designer_id', 'designer_name', 'designer_sign_at', 'designer_sign_url'],
  };

  /** 本单应签角色：模板 signRoles 去掉 customer（业主签字字段已预留，界面暂不启用） */
  function requireSignRoles(tpl) {
    const roles = (tpl.signRoles || []).filter((r) => r !== 'customer' && SIGN_ROLE_COL[r]);
    return roles.length ? roles : ['foreman'];
  }

  function parseRoles(s) {
    return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  /** 已签角色列表 */
  function signedRoles(sheet) {
    const out = [];
    Object.keys(SIGN_ROLE_COL).forEach((role) => {
      if (sheet[SIGN_ROLE_COL[role][2]]) out.push(role);
    });
    return out;
  }

  /** 签字进度：{ require: [], signed: [], remain: [], done: bool } */
  function signProgress(sheet, requireStr) {
    const require = parseRoles(requireStr || sheet.require_sign);
    const signed = signedRoles(sheet);
    const remain = require.filter((r) => !signed.includes(r));
    return {
      require: require.map((r) => ({ role: r, label: SIGN_ROLE_LABEL[r] || r })),
      signed: signed.map((r) => ({ role: r, label: SIGN_ROLE_LABEL[r] || r })),
      remain: remain.map((r) => ({ role: r, label: SIGN_ROLE_LABEL[r] || r })),
      done: require.length > 0 && remain.length === 0,
    };
  }

  /** 分享短链 token */
  function genShareToken() {
    return crypto.randomBytes(12).toString('hex');
  }

  /** 校验签名图归属：必须是这个员工自己保存过的签名，防止拿别人的签名图冒充 */
  async function ownSignature(userId, signUrl) {
    const [rows] = await pool.query(
      'SELECT sign_url FROM user_signatures WHERE user_type = ? AND user_id = ? LIMIT 1',
      ['employee', userId]
    );
    if (!rows.length) return { ok: false, error: '你还没有保存手写签名，请先在「我的 → 我的签名」签写' };
    if (signUrl && signUrl !== rows[0].sign_url) {
      return { ok: false, error: '签名图与本人存档不一致，请重新签写' };
    }
    return { ok: true, sign_url: rows[0].sign_url };
  }

  // ==================== 验收类型（来自手册） ====================
  app.get('/api/acceptance-sheets/types', async (req, res) => {
    if (!requireStaff(req, res)) return;
    res.json({ templates: templateSummary() });
  });

  app.get('/api/acceptance-sheets/types/:code', async (req, res) => {
    if (!requireStaff(req, res)) return;
    const tpl = TEMPLATE_MAP[req.params.code];
    if (!tpl) return res.status(404).json({ error: '验收类型不存在' });
    res.json({ template: { ...tpl, items: flattenItems(tpl.code) } });
  });

  // ==================== 列表 ====================
  app.get('/api/acceptance-sheets', async (req, res) => {
    try {
      await ensureTables();
      if (!requireStaff(req, res)) return;
      const userId = getUserId(req);
      const { project_id, template_code, result, mine, keyword } = req.query;
      const where = [];
      const args = [];
      if (project_id) { where.push('project_id = ?'); args.push(project_id); }
      if (template_code) { where.push('template_code = ?'); args.push(template_code); }
      if (result) { where.push('result = ?'); args.push(result); }
      if (mine === '1') { where.push('creator_id = ?'); args.push(userId); }
      if (keyword) { where.push('(project_name LIKE ? OR sheet_no LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
      const sql = `SELECT id, sheet_no, template_code, template_name, trade, project_id, project_name,
                          accept_date, area, batch_no, result, item_count, pass_count, fail_count,
                          red_fail_count, photos, foreman_name, supervisor_name, creator_id, created_at
                   FROM acceptance_sheets
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY id DESC LIMIT 200`;
      const [rows] = await pool.query(sql, args);
      res.json({ list: rows, total: rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 详情 ====================
  app.get('/api/acceptance-sheets/:id', async (req, res) => {
    try {
      await ensureTables();
      if (!requireStaff(req, res)) return;
      const [head] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      if (!head.length) return res.status(404).json({ error: '验收单不存在' });
      const [items] = await pool.query(
        'SELECT * FROM acceptance_sheet_items WHERE sheet_id = ? ORDER BY seq ASC', [req.params.id]
      );
      res.json({ sheet: head[0], items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 新建 ====================
  app.post('/api/acceptance-sheets', checkPermission('acceptance:write'), async (req, res) => {
    try {
      await ensureTables();
      const userId = getUserId(req);
      const { project_id, template_code, accept_date, area, batch_no, photos, remark, items, own_sign } = req.body || {};
      if (!project_id) return res.status(400).json({ error: '缺少项目' });
      const tpl = TEMPLATE_MAP[template_code];
      if (!tpl) return res.status(400).json({ error: '验收类型不存在' });

      const [proj] = await pool.query('SELECT id, name, customer, customer_phone FROM projects WHERE id = ?', [project_id]);
      if (!proj.length) return res.status(400).json({ error: '项目不存在' });
      const project = proj[0];
      const [me] = await pool.query('SELECT name FROM employees WHERE id = ?', [userId]);
      const foremanName = me.length ? me[0].name : null;

      const rows = buildItemRows(template_code, items);
      const sum = summarize(rows);

      // 应签角色 + 提交人当场签名（可选，未签可事后在报告页补）
      const requireRoles = requireSignRoles(tpl);
      const requireStr = requireRoles.join(',');
      let signRole = null;
      let signUrl = null;
      if (own_sign && own_sign.role) {
        if (!requireRoles.includes(own_sign.role)) {
          return res.status(400).json({ error: `本单不需要「${SIGN_ROLE_LABEL[own_sign.role] || own_sign.role}」签字` });
        }
        const chk = await ownSignature(userId, own_sign.sign_url);
        if (!chk.ok) return res.status(400).json({ error: chk.error });
        signRole = own_sign.role;
        signUrl = chk.sign_url;
      }

      const nowStr = fmtNow();
      const conn = await pool.getConnection();
      let sheetId = null;
      let sheetNo = null;
      let shareToken = null;
      try {
        await conn.beginTransaction();
        sheetNo = await genSheetNo(conn);
        shareToken = genShareToken();
        // 列名与值成对构造，避免占位符数错位（这个表 30 列，手数必错）
        const head = {
          sheet_no: sheetNo,
          template_code,
          template_name: tpl.name,
          trade: tpl.trade,
          project_id,
          project_name: project.name,
          customer_name: project.customer || null,
          accept_date: accept_date || new Date().toISOString().slice(0, 10),
          area: area || null,
          batch_no: batch_no || null,
          result: sum.result,
          item_count: sum.item_count,
          pass_count: sum.pass_count,
          fail_count: sum.fail_count,
          na_count: sum.na_count,
          red_fail_count: sum.red_fail_count,
          photos: Array.isArray(photos) ? JSON.stringify(photos) : (photos || null),
          remark: remark || null,
          require_sign: requireStr,
          sign_state: signRole ? signRole : null,
          share_token: shareToken,
          share_at: nowStr,
          creator_id: userId,
          created_at: nowStr,
          updated_at: nowStr,
        };
        const cols = Object.keys(head);
        const [r1] = await conn.query(
          `INSERT INTO acceptance_sheets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(',')})`,
          cols.map((k) => head[k])
        );
        sheetId = r1.insertId;

        // 提交人当场签名
        if (signRole) {
          const c = SIGN_ROLE_COL[signRole];
          await conn.query(
            `UPDATE acceptance_sheets SET ${c[0]} = ?, ${c[1]} = ?, ${c[2]} = ?, ${c[3]} = ? WHERE id = ?`,
            [userId, foremanName, nowStr, signUrl, sheetId]
          );
        }

        for (const r of rows) {
          await conn.query(
            `INSERT INTO acceptance_sheet_items
              (sheet_id, seq, group_name, item_code, title, standard, metric, severity, kind, unit, verdict, value, photos, remark)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [sheetId, r.seq, r.group_name, r.item_code, r.title, r.standard, r.metric, r.severity,
              r.kind, r.unit, r.verdict, r.value, r.photos, r.remark]
          );
        }

        // 不合格项 → 复用 rectification_issues 建整改单（red 高优先级）
        if (sum.fail_count > 0) {
          const [failItems] = await conn.query(
            'SELECT id, title, severity, remark, photos FROM acceptance_sheet_items WHERE sheet_id = ? AND verdict = ? ORDER BY seq',
            [sheetId, 'fail']
          );
          for (const f of failItems) {
            const [ri] = await conn.query(
              `INSERT INTO rectification_issues
                (inspection_id, project_id, project_name, issue_desc, priority, status, images, remark,
                 title, category, location, level, creator_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
              [null, project_id, project.name,
                `${tpl.name}不合格：${f.title}${f.remark ? '（' + f.remark + '）' : ''}`,
                f.severity === 'red' ? '紧急' : '普通', '待处理',
                f.photos || null, `来源：验收单 ${sheetNo}`,
                f.title, '施工质量', tpl.trade || '', f.severity === 'red' ? '红线' : '一般', userId]
            );
            await conn.query('UPDATE acceptance_sheet_items SET rectify_id = ? WHERE id = ?', [ri.insertId, f.id]);
          }
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      await addLog(userId, '', '新增', '验收单', project_id, project.name,
        `新建${tpl.name}（${sheetNo}），${sum.item_count}项 / 不合格${sum.fail_count}项`, req.ip);
      res.json({
        id: sheetId, sheet_no: sheetNo, result: sum.result, ...sum,
        share_token: shareToken,
        require_sign: requireStr,
        sign_role: signRole,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 修改（重填逐项） ====================
  app.put('/api/acceptance-sheets/:id', checkPermission('acceptance:write'), async (req, res) => {
    try {
      await ensureTables();
      const userId = getUserId(req);
      const [head] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      if (!head.length) return res.status(404).json({ error: '验收单不存在' });
      const sheet = head[0];
      const { accept_date, area, batch_no, photos, remark, items } = req.body || {};
      if (!Array.isArray(items)) return res.status(400).json({ error: '缺少逐项结果' });

      const rows = buildItemRows(sheet.template_code, items);
      const sum = summarize(rows);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `UPDATE acceptance_sheets SET accept_date = ?, area = ?, batch_no = ?, result = ?,
             item_count = ?, pass_count = ?, fail_count = ?, na_count = ?, red_fail_count = ?,
             photos = ?, remark = ?, updated_at = NOW() WHERE id = ?`,
          [accept_date || sheet.accept_date, area || null, batch_no || null, sum.result,
            sum.item_count, sum.pass_count, sum.fail_count, sum.na_count, sum.red_fail_count,
            Array.isArray(photos) ? JSON.stringify(photos) : (photos || null), remark || null, req.params.id]
        );
        for (const r of rows) {
          const [exist] = await conn.query(
            'SELECT id FROM acceptance_sheet_items WHERE sheet_id = ? AND item_code = ? LIMIT 1',
            [req.params.id, r.item_code]
          );
          if (exist.length) {
            await conn.query(
              'UPDATE acceptance_sheet_items SET verdict = ?, value = ?, photos = ?, remark = ? WHERE id = ?',
              [r.verdict, r.value, r.photos, r.remark, exist[0].id]
            );
          } else {
            await conn.query(
              `INSERT INTO acceptance_sheet_items
                (sheet_id, seq, group_name, item_code, title, standard, metric, severity, kind, unit, verdict, value, photos, remark)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [req.params.id, r.seq, r.group_name, r.item_code, r.title, r.standard, r.metric,
                r.severity, r.kind, r.unit, r.verdict, r.value, r.photos, r.remark]
            );
          }
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      await addLog(userId, '', '修改', '验收单', sheet.project_id, sheet.project_name, `修改验收单 ${sheet.sheet_no}`, req.ip);
      res.json({ id: Number(req.params.id), result: sum.result, ...sum });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 删除 ====================
  app.delete('/api/acceptance-sheets/:id', checkPermission('acceptance:delete'), async (req, res) => {
    try {
      await ensureTables();
      const userId = getUserId(req);
      const [head] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      if (!head.length) return res.status(404).json({ error: '验收单不存在' });
      await pool.query('DELETE FROM acceptance_sheet_items WHERE sheet_id = ?', [req.params.id]);
      await pool.query('DELETE FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      await addLog(userId, '', '删除', '验收单', head[0].project_id, head[0].project_name,
        `删除验收单 ${head[0].sheet_no}`, req.ip);
      res.json({ message: '已删除' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 签字（手写签名；业主签字字段已预留） ====================
  // body: { role, sign_url }
  // ⚠️ sign_url 必须是「当前登录人自己保存过的签名」，不接受前端传别人的图。
  // ⚠️ customer 分支当前不开放：需「手机号验证码 + 版本留痕」后才启用，字段已建好。
  app.post('/api/acceptance-sheets/:id/sign', checkPermission('acceptance:write'), async (req, res) => {
    try {
      await ensureTables();
      const userId = requireStaff(req, res);
      if (!userId) return;
      const { role, sign_url } = req.body || {};
      if (role === 'customer') {
        return res.status(403).json({ error: '业主签字尚未开放' });
      }
      const cols = SIGN_ROLE_COL[role];
      if (!cols) return res.status(400).json({ error: '签字角色不正确' });
      const [head] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      if (!head.length) return res.status(404).json({ error: '验收单不存在' });
      const sheet = head[0];
      const requireStr = sheet.require_sign || requireSignRoles(TEMPLATE_MAP[sheet.template_code] || {});
      if (!parseRoles(requireStr).includes(role)) {
        return res.status(400).json({ error: `本单不需要「${SIGN_ROLE_LABEL[role]}」签字` });
      }
      const chk = await ownSignature(userId, sign_url);
      if (!chk.ok) return res.status(400).json({ error: chk.error });

      // 双签的意义是「两个岗位各自确认」，同一个人把两个角色都签了等于没签
      const already = parseRoles(requireStr).filter((r) => r !== role && sheet[SIGN_ROLE_COL[r][0]] === userId);
      if (already.length) {
        return res.status(400).json({
          error: `你已以「${SIGN_ROLE_LABEL[already[0]]}」身份签过本单，不能同时签「${SIGN_ROLE_LABEL[role]}」`,
        });
      }

      const [e] = await pool.query('SELECT name FROM employees WHERE id = ?', [userId]);
      const name = e.length ? e[0].name : null;
      const nowStr = fmtNow();
      await pool.query(
        `UPDATE acceptance_sheets SET ${cols[0]} = ?, ${cols[1]} = ?, ${cols[2]} = ?, ${cols[3]} = ?, updated_at = ? WHERE id = ?`,
        [userId, name, nowStr, chk.sign_url, nowStr, req.params.id]
      );
      const [after] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      const progress = signProgress(after[0], requireStr);
      res.json({
        message: progress.done ? '签字完成，双方已签齐' : '签字成功',
        role, name,
        progress,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 报告数据（员工端与分享端共用一份组装逻辑） ====================
  /**
   * buildReport —— 报告只在这里组装一次，员工端和业主/陌生人端都调它，
   * 避免「两套渲染逻辑慢慢跑偏」。publicView=true 时剔掉手机号等内部字段。
   */
  async function buildReport(sheetId, { publicView = false } = {}) {
    const [head] = await pool.query('SELECT * FROM acceptance_sheets WHERE id = ?', [sheetId]);
    if (!head.length) return null;
    const sheet = head[0];
    const [items] = await pool.query(
      'SELECT seq, group_name, title, standard, metric, severity, kind, unit, verdict, value, photos, remark FROM acceptance_sheet_items WHERE sheet_id = ? ORDER BY seq',
      [sheetId]
    );
    const [proj] = await pool.query(
      'SELECT id, name, customer, customer_phone, description, start_date, end_date FROM projects WHERE id = ?',
      [sheet.project_id]
    );

    const groups = [];
    items.forEach((it) => {
      let g = groups.find((x) => x.name === it.group_name);
      if (!g) { g = { name: it.group_name, items: [] }; groups.push(g); }
      g.items.push(it);
    });

    const tpl = TEMPLATE_MAP[sheet.template_code] || {};
    const requireStr = sheet.require_sign || requireSignRoles(tpl);
    const progress = signProgress(sheet, requireStr);
    const shareToken = sheet.share_token || null;

    const safeSheet = {
      id: sheet.id,
      sheet_no: sheet.sheet_no,
      template_code: sheet.template_code,
      template_name: sheet.template_name,
      trade: sheet.trade,
      project_id: sheet.project_id,
      project_name: sheet.project_name,
      customer_name: sheet.customer_name,
      accept_date: sheet.accept_date,
      area: sheet.area,
      batch_no: sheet.batch_no,
      result: sheet.result,
      item_count: sheet.item_count,
      pass_count: sheet.pass_count,
      fail_count: sheet.fail_count,
      na_count: sheet.na_count,
      red_fail_count: sheet.red_fail_count,
      photos: sheet.photos,
      remark: sheet.remark,
      require_sign: requireStr,
      sign_state: sheet.sign_state,
      created_at: sheet.created_at,
    };
    if (!publicView) {
      safeSheet.creator_id = sheet.creator_id;
    }

    return {
      sheet: safeSheet,
      project: proj[0] ? {
        id: proj[0].id,
        name: proj[0].name,
        customer: proj[0].customer,
        description: proj[0].description || null,
        start_date: proj[0].start_date || null,
        end_date: proj[0].end_date || null,
        ...(publicView ? {} : { customer_phone: proj[0].customer_phone || null }),
      } : null,
      groups,
      summary: {
        item_count: sheet.item_count,
        pass_count: sheet.pass_count,
        fail_count: sheet.fail_count,
        na_count: sheet.na_count,
        red_fail_count: sheet.red_fail_count,
        result_text: { pass: '合格', fail: '不合格', rectify: '整改中', pending: '未完成' }[sheet.result] || sheet.result,
      },
      signers: {
        foreman: { id: sheet.foreman_id, name: sheet.foreman_name, at: sheet.foreman_sign_at, url: sheet.foreman_sign_url || null },
        supervisor: { id: sheet.supervisor_id, name: sheet.supervisor_name, at: sheet.supervisor_sign_at, url: sheet.supervisor_sign_url || null },
        designer: { id: sheet.designer_id, name: sheet.designer_name, at: sheet.designer_sign_at, url: sheet.designer_sign_url || null },
        customer: { id: sheet.customer_id, name: sheet.customer_sign_name, at: sheet.customer_sign_at, url: sheet.customer_sign_url || null, enabled: false },
      },
      progress,
      share: {
        token: shareToken,
        web: shareToken ? `/r/${shareToken}` : null,
        page: shareToken ? `/pages/acceptance/report?token=${shareToken}` : null,
      },
    };
  }

  app.get('/api/acceptance-sheets/:id/report', async (req, res) => {
    try {
      await ensureTables();
      if (!requireStaff(req, res)) return;
      const data = await buildReport(req.params.id);
      if (!data) return res.status(404).json({ error: '验收单不存在' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 分享短链（免登录，给业主 / 潜在客户看） ====================
  // 设计：token 一旦生成永不变，一个验收单 = 一个短链。
  //      小程序分享卡片走 /pages/acceptance/report?token=xxx（游客白名单），
  //      H5 / PC 走 /r/xxx（302 到同一页），三端同源一份渲染，不写两套。
  app.post('/api/acceptance-sheets/:id/share', async (req, res) => {
    try {
      await ensureTables();
      if (!requireStaff(req, res)) return;
      const [head] = await pool.query('SELECT id, share_token FROM acceptance_sheets WHERE id = ?', [req.params.id]);
      if (!head.length) return res.status(404).json({ error: '验收单不存在' });
      let token = head[0].share_token;
      if (!token) {
        token = genShareToken();
        await pool.query('UPDATE acceptance_sheets SET share_token = ?, share_at = ? WHERE id = ?',
          [token, fmtNow(), req.params.id]);
      }
      res.json({
        token,
        web: `/r/${token}`,
        page: `/pages/acceptance/report?token=${token}`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 免登录读取（凭 token，不认 cookie / header） */
  app.get('/api/public/acceptance-report/:token', async (req, res) => {
    try {
      await ensureTables();
      const token = String(req.params.token || '');
      if (!/^[a-f0-9]{16,64}$/.test(token)) return res.status(400).json({ error: '链接无效' });
      const [head] = await pool.query('SELECT id FROM acceptance_sheets WHERE share_token = ? LIMIT 1', [token]);
      if (!head.length) return res.status(404).json({ error: '报告不存在或链接已失效' });
      const data = await buildReport(head[0].id, { publicView: true });
      if (!data) return res.status(404).json({ error: '报告不存在' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 短链入口：/r/xxx → 302 到 H5 报告页（微信里直接打开，无需登录） */
  app.get('/r/:token', async (req, res) => {
    try {
      await ensureTables();
      const token = String(req.params.token || '');
      const [head] = await pool.query('SELECT id FROM acceptance_sheets WHERE share_token = ? LIMIT 1', [token]);
      if (!head.length) {
        return res.status(404).send('<meta charset="utf-8"><div style="font-family:system-ui;padding:40px;text-align:center;color:#6B7280">报告不存在或链接已失效</div>');
      }
      res.redirect(302, `/m/#/pages/acceptance/report?token=${encodeURIComponent(token)}`);
    } catch (err) {
      res.status(500).send('服务异常');
    }
  });

  // ==================== 待验收提示：某项目各类型已做/未做 ====================
  app.get('/api/acceptance-sheets/project/:projectId/summary', async (req, res) => {
    try {
      await ensureTables();
      if (!requireStaff(req, res)) return;
      const [rows] = await pool.query(
        `SELECT template_code, template_name, COUNT(*) cnt,
                SUM(result = 'pass') pass_cnt, SUM(result = 'fail') fail_cnt, SUM(result = 'rectify') rectify_cnt
         FROM acceptance_sheets WHERE project_id = ? GROUP BY template_code, template_name`,
        [req.params.projectId]
      );
      const map = {};
      rows.forEach((r) => { map[r.template_code] = r; });
      const out = templateSummary().map((t) => ({
        ...t,
        done: !!map[t.code],
        count: map[t.code] ? Number(map[t.code].cnt) : 0,
        pass: map[t.code] ? Number(map[t.code].pass_cnt || 0) : 0,
        fail: map[t.code] ? Number(map[t.code].fail_cnt || 0) : 0,
        rectify: map[t.code] ? Number(map[t.code].rectify_cnt || 0) : 0,
      }));
      res.json({ templates: out });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
