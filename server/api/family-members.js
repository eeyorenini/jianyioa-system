/**
 * 家庭成员管理（业主端）（2026-10-29 渐进拆分第 16 轮）
 *
 * 搬运自 server.js 原 433-826 行，搬入时 394 行。
 *
 * 2026-10-29 安全加固（拆分后）：身份来源从可伪造的 `x-customer-id` 改为
 * 由 `x-user-id` 反查，详见 resolveOwnerIdentity 上方注释。
 *
 * 2026-10-29 v2.5.3 家庭成员逻辑重写（大王定稿的业务口径）：
 *   1. 业主（主账户）用自己的身份添加成员，**手机号是唯一认证标识**
 *   2. 添加后成员处于「待加入」状态（bound_at 为 NULL），此时不产生任何权限
 *   3. 成员本人用该手机号登录（短信验证码 / 微信一键登录）时，前端弹窗告知
 *      「XX 邀请您加入家庭」，本人确认后才写入 bound_at
 *   4. 绑定后主账户的家庭成员页能看到 TA 的姓名 + 手机号；主账号那一行姓名后
 *      显示「（主账号）」
 *
 *   旧的四个接口有三个是坏的（详见各接口上方注释）：
 *     · GET 用 phone 反查 → 永远只返回主账户 1 条
 *     · DELETE / PUT 用 masterPhone === member.phone 判权限 → 永远 403
 *     · POST 在客户还没有 is_master 记录时，把新加的第一个成员误标成主账号
 */
module.exports = function registerFamilyMemberRoutes(app, deps) {
  const {
    db,
    pool,
    permCore,
    customerLogin,
  } = deps;

  // ============================================================
  // 身份解析
  //
  // 2026-10-29 安全加固：原实现从 `x-customer-id` 请求头和 `req.body.customer_id`
  // 取客户 id，这两个值都是客户端可任意伪造的明文 —— 客户 id 是连续自增的，
  // 任何人猜一串数字就能读走别人家的家庭成员（姓名 + 手机号），
  // 也能往别人家里塞成员、改别人家成员姓名。现在一律由身份头反查。
  //
  // 2026-10-29 项目级授权改造：身份判定改用 perm.js 的统一解析，
  // 「主账号」的定义收紧为 **自己名下有客户档案**（ownCustomerId 非空）。
  // 这样一个人可以同时是：
  //   · 自己项目的主账号（能管理自己家的成员）
  //   · 别人项目的副账号（只读别人项目的进度）
  // 两者并存，互不覆盖 —— 这就是「从账号未来行使主账号权利」的落地方式。
  // ============================================================
  async function resolveOwnerIdentity(req) {
    const rawId = parseInt(req.headers['x-user-id'] || '0');
    if (!rawId) return null;
    const userType = String(req.headers['x-user-type'] || '').toLowerCase();
    const scope = String(req.headers['x-user-scope'] || '').toLowerCase();
    let identity = null;
    try {
      identity = await permCore.resolveCustomerIdentity(rawId, userType, scope);
    } catch (e) {
      return null;
    }
    if (!identity) return null;

    const ownCustomerId = identity.ownCustomerId || null;
    return {
      // 自己名下的客户档案 → 才有「管理家庭成员」的资格
      customerId: ownCustomerId,
      // 纯被邀请者（无自己档案）：只能读，不能增删改
      isFamilyMember: !ownCustomerId,
      // 锚点（纯成员时指向其被邀请项目的主账号），只读视角用它定位"我所在的这个家"
      anchorCustomerId: identity.customerId || ownCustomerId || null,
      identity,
    };
  }

  // ==================== 家庭成员管理 ====================
  // 确保家庭成员表存在
  setTimeout(async () => {
    try {
      // 创建家庭成员表（如果不存在）
      // v2.5.3：bound_at / bind_openid —— 「业主登记」与「本人确认加入」两段式
      // v2.5.3 二次改造：project_id —— 授权粒度从「客户」下沉到「项目」
      //   一行 = 一个手机号对一个项目的查看授权。同一个人可以被邀请到多个项目（多行），
      //   所以唯一键从 uk_phone(phone) 改为 uk_phone_project(phone, project_id)。
      //   project_id 为 NULL 时表示历史数据（按客户级给全项目，见 perm.js 兼容分支）。
      await db.exec(`
        CREATE TABLE IF NOT EXISTS family_members (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id INT NOT NULL COMMENT '主账户客户ID（项目归属人）',
          project_id INT DEFAULT NULL COMMENT '被授权查看的项目ID；NULL=历史客户级授权',
          name VARCHAR(100) NOT NULL COMMENT '成员姓名',
          phone VARCHAR(20) NOT NULL COMMENT '手机号（唯一认证标识）',
          relation VARCHAR(50) COMMENT '与主账户关系：配偶/父母/子女/其他',
          is_master TINYINT(1) DEFAULT 0 COMMENT '是否主账户自述行：0-否，1-是（不产生授权）',
          status TINYINT(1) DEFAULT 1 COMMENT '状态：0-禁用，1-启用',
          bound_at DATETIME DEFAULT NULL COMMENT '成员本人确认加入的时间；NULL=业主已登记但本人未登录确认',
          bind_openid VARCHAR(64) DEFAULT NULL COMMENT '确认加入时的微信 openid；H5 短信登录为空',
          created_at DATETIME DEFAULT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_phone_project (phone, project_id),
          INDEX idx_customer_id (customer_id),
          INDEX idx_project (project_id),
          INDEX idx_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭成员项目授权表'
      `);
      console.log('✅ family_members 表已创建或已存在');

      // 老库补列（列已存在时 ALTER 报错，直接忽略；MySQL 5.5 不支持 ADD COLUMN IF NOT EXISTS）
      // 只加列、不改写历史数据：存量成员 bound_at 保持 NULL，本人首次登录会走一次确认，
      // 这正是本次要的口径（业主登记 ≠ 成员本人同意）。
      for (const [col, ddl] of [
        ['bound_at', "DATETIME DEFAULT NULL COMMENT '成员本人确认加入的时间；NULL=业主已登记但本人未登录确认'"],
        ['bind_openid', "VARCHAR(64) DEFAULT NULL COMMENT '确认加入时的微信 openid；H5 短信登录为空'"],
        ['project_id', "INT DEFAULT NULL COMMENT '被授权查看的项目ID；NULL=历史客户级授权'"],
      ]) {
        try {
          await db.exec(`ALTER TABLE family_members ADD COLUMN ${col} ${ddl}`);
          console.log(`✅ family_members 补列 ${col}`);
        } catch (e) { /* 列已存在，跳过 */ }
      }

      // 唯一键从 phone 改为 (phone, project_id)：同一个人要能被邀请到多个项目。
      // 老库的 uk_phone 必须去掉，否则第二次邀请直接 Duplicate entry。
      try {
        await db.exec('ALTER TABLE family_members DROP INDEX uk_phone');
        console.log('✅ family_members 已移除 uk_phone（改为按项目唯一）');
      } catch (e) { /* 索引不存在（新库或已改过），跳过 */ }
      try {
        await db.exec('ALTER TABLE family_members ADD UNIQUE KEY uk_phone_project (phone, project_id)');
        console.log('✅ family_members 已建立 uk_phone_project');
      } catch (e) { /* 已存在，跳过 */ }
      try {
        await db.exec('ALTER TABLE family_members ADD INDEX idx_project (project_id)');
      } catch (e) { /* 已存在，跳过 */ }

      // 存量回填：只在「该客户名下恰好 1 个项目」时回填 project_id。
      // 多项目客户保持 NULL（走 perm.js 的 legacy 客户级分支），避免猜错项目把家人放进错误的房子。
      try {
        const [fill] = await pool.query(`
          UPDATE family_members fm
            JOIN (SELECT customer_id, MIN(id) AS pid FROM projects
                   GROUP BY customer_id HAVING COUNT(*) = 1) x
              ON x.customer_id = fm.customer_id
             SET fm.project_id = x.pid
           WHERE fm.project_id IS NULL AND fm.is_master = 0
        `);
        if (fill && fill.affectedRows) {
          console.log(`✅ family_members 回填 project_id ${fill.affectedRows} 行`);
        }
      } catch (e) { /* 回填失败不影响运行，权限会走 legacy 分支 */ }

      // bound_at 上建索引：列表按「待加入/已绑」排序，成员多了才有意义（失败忽略）
      try {
        await db.exec('ALTER TABLE family_members ADD INDEX idx_bound (customer_id, bound_at)');
      } catch (e) { /* 索引已存在，跳过 */ }

      // 主账号那条记录不存在「待加入」概念（就是业主本人），把 bound_at 补齐。
      // 只处理 phone 与客户档案一致的行，避免把历史脏数据（被误标成 is_master=1 的成员）也标成已绑定。
      try {
        await db.exec(`
          UPDATE family_members fm
            JOIN customers c ON fm.customer_id = c.id
             SET fm.bound_at = IFNULL(fm.bound_at, IFNULL(fm.created_at, NOW()))
           WHERE fm.is_master = 1 AND fm.phone = c.phone AND fm.bound_at IS NULL
        `);
      } catch (e) { /* 老库字符集/权限异常不影响主流程 */ }

      // 创建短信验证码表（v2.5.2 业主端「手机号 + 验证码」登录）
      // 幂等：已存在则跳过，服务器覆盖代码后重启即可自动建表，不需要单独跑 migration
      try {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS sms_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            phone VARCHAR(20) NOT NULL COMMENT '接收手机号',
            scene VARCHAR(20) NOT NULL DEFAULT 'login' COMMENT 'login/bind/reset',
            code_hash CHAR(64) NOT NULL COMMENT 'sha256(验证码)，不存明文',
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            fail_count INT NOT NULL DEFAULT 0,
            ip VARCHAR(64) NULL,
            created_at DATETIME NOT NULL,
            KEY idx_phone_scene (phone, scene),
            KEY idx_expires (expires_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='短信验证码表'
        `);
        console.log('✅ sms_codes 表已创建或已存在');
      } catch (e) {
        console.log('⚠️ sms_codes 建表失败:', e.message);
      }

      // 短信配置补 code_template_code 键（老库没这个键时补空串，避免前端保存时整对象覆盖丢掉它）
      try {
        const [cfgRows] = await pool.query("SELECT id, setting_value FROM system_settings WHERE category='sms'");
        if (cfgRows.length) {
          let parsed = null;
          try { parsed = JSON.parse(cfgRows[0].setting_value); } catch (e) { parsed = null; }
          if (parsed && typeof parsed === 'object') {
            const wrapped = !!(parsed.setting_value && typeof parsed.setting_value === 'object');
            const target = wrapped ? parsed.setting_value : parsed;
            if (!('code_template_code' in target)) {
              target.code_template_code = '';
              await pool.query('UPDATE system_settings SET setting_value=? WHERE id=?',
                [JSON.stringify(parsed), cfgRows[0].id]);
              console.log('✅ 短信配置已补 code_template_code 键');
            }
          }
        }
      } catch (e) {
        console.log('⚠️ 短信配置补键失败:', e.message);
      }

      // ================= v2.5.2 商城 + 主材品类：DDL 自动迁移 =================
      // 生产库是老库（v2.3.0），覆盖 server.js 后必须自动补齐这些表和列，
      // 否则商城 / 主材管理接口全部 500（Unknown table / Unknown column）。
      // ⚠️ 这里只做 DDL，不做数据迁移：品类种子与 category→品类映射见
      //    server/migrations/v2_5_0_material_taxonomy.js（需手动跑一次，幂等）。
      // MySQL 5.5.62：DATETIME 不能 DEFAULT CURRENT_TIMESTAMP，COMMENT 一律单引号。
      const v252Tables = [
        ['material_categories', `CREATE TABLE IF NOT EXISTS material_categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(50) NOT NULL COMMENT '不可变编码，商城/报价靠它对接',
          name VARCHAR(60) NOT NULL,
          parent_id INT DEFAULT NULL,
          level TINYINT NOT NULL DEFAULT 1,
          sort_order INT NOT NULL DEFAULT 0,
          status TINYINT NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT '2024-01-01 00:00:00',
          updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
          UNIQUE KEY uk_code (code),
          KEY idx_parent (parent_id),
          KEY idx_level (level)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='主材品类字典'`],

        ['material_brands', `CREATE TABLE IF NOT EXISTS material_brands (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(80) NOT NULL,
          alias VARCHAR(500) DEFAULT '' COMMENT '别名，逗号分隔，检索用',
          logo VARCHAR(255) DEFAULT '',
          pinyin VARCHAR(120) DEFAULT '' COMMENT '品牌全拼，检索用',
          pinyin_abbr VARCHAR(40) DEFAULT '' COMMENT '品牌拼音首字母，检索用',
          sort_order INT NOT NULL DEFAULT 0,
          status TINYINT NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT '2024-01-01 00:00:00',
          updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
          UNIQUE KEY uk_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='主材品牌字典'`],

        ['mall_orders', `CREATE TABLE IF NOT EXISTS mall_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_no VARCHAR(32) NOT NULL COMMENT '订单编号，业主转账备注用',
          customer_id INT DEFAULT NULL COMMENT 'customers.id',
          customer_name VARCHAR(100) DEFAULT '' COMMENT '下单人姓名（快照）',
          phone VARCHAR(50) DEFAULT '' COMMENT '联系电话（快照）',
          total_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '订单总额',
          item_count INT NOT NULL DEFAULT 0 COMMENT '商品种类数',
          total_qty INT NOT NULL DEFAULT 0 COMMENT '商品总件数',
          status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending待转账/paid已收款/cancelled已取消',
          remark TEXT COMMENT '业主备注',
          admin_remark TEXT COMMENT '财务备注',
          paid_at DATETIME DEFAULT NULL COMMENT '确认收款时间',
          paid_by INT DEFAULT NULL COMMENT '确认人 employees.id',
          created_at DATETIME DEFAULT '2024-01-01 00:00:00',
          updated_at DATETIME DEFAULT '2024-01-01 00:00:00',
          UNIQUE KEY uk_order_no (order_no),
          KEY idx_customer (customer_id),
          KEY idx_status (status),
          KEY idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单'`],

        ['mall_order_items', `CREATE TABLE IF NOT EXISTS mall_order_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          material_id INT DEFAULT NULL COMMENT 'main_materials.id',
          name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '商品名快照',
          spec VARCHAR(255) DEFAULT '' COMMENT '规格快照',
          brand VARCHAR(100) DEFAULT '' COMMENT '品牌快照',
          image VARCHAR(500) DEFAULT '' COMMENT '主图快照',
          unit VARCHAR(50) DEFAULT '' COMMENT '单位',
          unit_price DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '成交单价快照',
          qty INT NOT NULL DEFAULT 1,
          subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT '2024-01-01 00:00:00',
          KEY idx_order (order_id),
          KEY idx_material (material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商城订单明细'`],
      ];
      for (const [tblName, sql] of v252Tables) {
        try {
          await db.exec(sql);
        } catch (e) {
          console.log(`⚠️ ${tblName} 建表失败:`, e.message);
        }
      }
      console.log('✅ 商城/品类表已就绪（material_categories / material_brands / mall_orders / mall_order_items）');

      // main_materials 补列（列已存在时 ALTER 会报错，直接忽略）
      const mmCols = [
        ['type_id', "INT DEFAULT NULL COMMENT '一级类型：主材/辅材/家具家电'"],
        ['category_id', "INT DEFAULT NULL COMMENT '二级品类'"],
        ['sub_id', "INT DEFAULT NULL COMMENT '三级子类'"],
        ['brand_id', "INT DEFAULT NULL COMMENT '品牌字典 id'"],
        ['series', "VARCHAR(255) DEFAULT NULL COMMENT '系列/套系，从原 category 迁入'"],
        ['gallery', "TEXT COMMENT '附加图 JSON 数组，商城多图'"],
        ['mall_status', "TINYINT NOT NULL DEFAULT 0 COMMENT '0未上架 1已上架 2已下架'"],
        ['mall_price', "DECIMAL(12,2) DEFAULT NULL COMMENT '商城零售价'"],
        ['mall_stock', "INT NOT NULL DEFAULT 0 COMMENT '商城可售库存'"],
        ['mall_sku_code', "VARCHAR(100) DEFAULT NULL COMMENT '对接外部商城的 SKU'"],
        ['pinyin', "VARCHAR(255) DEFAULT NULL COMMENT '名称全拼'"],
        ['pinyin_abbr', "VARCHAR(100) DEFAULT NULL COMMENT '名称拼音首字母'"],
      ];
      let mmColAdded = 0;
      for (const [col, ddl] of mmCols) {
        try {
          await db.exec(`ALTER TABLE main_materials ADD COLUMN ${col} ${ddl}`);
          mmColAdded += 1;
        } catch (e) { /* 列已存在，跳过 */ }
      }
      if (mmColAdded) console.log(`✅ main_materials 补列 ${mmColAdded} 个`);

      // main_materials 补索引（已存在会报错，忽略）
      const mmIdx = [
        'ADD INDEX idx_type_cat (type_id, category_id)',
        'ADD INDEX idx_brand (brand_id)',
        'ADD INDEX idx_name (name(64))',
        'ADD INDEX idx_pinyin_abbr (pinyin_abbr(32))',
        'ADD INDEX idx_mall_status (mall_status)',
      ];
      for (const ddl of mmIdx) {
        try {
          await db.exec(`ALTER TABLE main_materials ${ddl}`);
        } catch (e) { /* 索引已存在，跳过 */ }
      }
    } catch (e) {
      console.log('⚠️ family_members 建表失败:', e.message);
    }
  }, 200);

  // GET /api/family-members - 家庭成员列表（按人聚合，附带被授权的项目）
  //
  // 主账号看自己家：主账号行 + 自己添加的成员 + 各自可见的项目。
  // 纯成员（被邀请的家人）看同一个家：只读，can_manage 全为 false。
  app.get('/api/family-members', async (req, res) => {
    try {
      const me = await resolveOwnerIdentity(req);
      if (!me) return res.status(401).json({ error: '请先登录业主账号' });

      // 主账号用自己档案；纯成员用「我被邀请的那个家」的锚点
      const ownerId = me.customerId || me.anchorCustomerId;
      if (!ownerId) return res.status(401).json({ error: '请先登录业主账号' });

      const master = await db
        .prepare('SELECT id, name, phone FROM customers WHERE id = ? LIMIT 1')
        .get(ownerId);
      if (!master) return res.status(401).json({ error: '客户档案不存在，请联系您的项目经理' });

      // ⚠️ 旧实现是「先查主账户手机号，再 WHERE phone = 主账户手机号」，
      //    结果永远只有主账户那一条 —— 家里其他成员怎么加都出不来。
      //    现在按 customer_id 查，并 LEFT JOIN 出被授权的项目名。
      const rows =
        (await db
          .prepare(
            `SELECT fm.id, fm.customer_id, fm.project_id, fm.name, fm.phone, fm.relation,
                    fm.is_master, fm.status, fm.bound_at, fm.created_at,
                    p.name AS project_name
               FROM family_members fm
               LEFT JOIN projects p ON p.id = fm.project_id
              WHERE fm.customer_id = ? AND fm.status = 1
              ORDER BY fm.is_master DESC, (fm.bound_at IS NULL) ASC, fm.created_at ASC, fm.id ASC`
          )
          .all(ownerId)) || [];

      const myPhone = String((me.identity && me.identity.phone) || '');

      // 按手机号聚合：同一个人被邀请到多个项目时只出现一行，下面挂项目列表。
      // 一行一项目是存储结构，聚合是展示结构 —— 否则列表里会出现三个「郑大大」。
      const people = new Map();
      for (const r of rows) {
        if (Number(r.is_master) === 1) continue; // 主账号行单独合成
        const key = String(r.phone || '');
        if (!key) continue;
        if (!people.has(key)) {
          people.set(key, {
            id: r.id, // 代表行 id（删除时后端会连带同一号码在本客户下的其他行）
            customer_id: r.customer_id,
            name: r.name || '',
            phone: key,
            relation: r.relation || '',
            is_master: 0,
            is_bound: false,
            is_self: myPhone === key,
            projects: [],
            created_at: r.created_at || null,
          });
        }
        const item = people.get(key);
        if (r.bound_at) item.is_bound = true;
        if (!item.relation && r.relation) item.relation = r.relation;
        if (r.project_id) {
          item.projects.push({ id: Number(r.project_id), name: r.project_name || '' });
        }
      }

      // 主账号恒在最上面，姓名由前端渲染成「张三（主账号）」
      const masterRow = {
        id: 'master',
        customer_id: master.id,
        name: master.name || '',
        phone: master.phone || '',
        relation: '本人',
        is_master: 1,
        is_bound: true,
        bound_at: null,
        is_self: myPhone === String(master.phone || ''),
        projects: [],
        created_at: null,
        virtual: true,
      };

      // can_manage：只有「自己是主账号」且「这一行不是自己」时才允许删改
      const canManage = !me.isFamilyMember;
      const list = [masterRow, ...people.values()].map((v) => ({
        ...v,
        can_manage: canManage && !v.is_master,
      }));

      res.json(list);
    } catch (err) {
      console.error('获取家庭成员失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/family-members - 主账户添加家庭成员（登记手机号 + 授权某个项目）
  //
  // 项目级授权的关键入口：body 必须指明 project_id（业主只有一个项目时可省略，自动带）。
  // 一个手机号可以被多个项目邀请（比如儿媳妇既看自己家也看公婆家），
  // 所以这里不再拒绝「该号码已被其他家庭登记」—— 只有本人确认后才生效，不构成越权。
  app.post('/api/family-members', async (req, res) => {
    try {
      const me = await resolveOwnerIdentity(req);
      if (!me) return res.status(401).json({ error: '请先登录业主账号' });
      if (me.isFamilyMember || !me.customerId) {
        return res.status(403).json({ error: '仅主账户可添加家庭成员' });
      }

      const { name, phone, relation, project_id } = req.body || {};
      const p = String(phone || '').trim();
      const n = String(name || '').trim();

      if (!n || !p) return res.status(400).json({ error: '姓名和手机号不能为空' });
      if (!/^1[3-9]\d{9}$/.test(p)) return res.status(400).json({ error: '手机号格式不正确' });
      if (n.length > 30) return res.status(400).json({ error: '姓名过长' });

      const master = await db
        .prepare('SELECT id, name, phone FROM customers WHERE id = ? LIMIT 1')
        .get(me.customerId);
      if (!master) return res.status(400).json({ error: '客户档案不存在' });

      // 主账户本人不需要被登记成家庭成员（列表里会由客户档案自动补一行）
      if (p === String(master.phone || '')) {
        return res.status(400).json({ error: '这是您本人的手机号，无需添加为家庭成员' });
      }

      // ---- 项目归属校验：只能授权自己名下的项目 ----
      const myProjects =
        (await db.prepare('SELECT id, name FROM projects WHERE customer_id = ?').all(me.customerId)) || [];
      if (!myProjects.length) {
        return res.status(400).json({ error: '您名下还没有项目，暂时无法添加家庭成员' });
      }
      let projectId = parseInt(project_id || '0') || 0;
      if (!projectId) {
        if (myProjects.length === 1) {
          projectId = Number(myProjects[0].id); // 只有一套房，直接带
        } else {
          return res.status(400).json({
            error: '请选择要授权的项目',
            projects: myProjects.map((x) => ({ id: Number(x.id), name: x.name })),
          });
        }
      }
      if (!myProjects.some((x) => Number(x.id) === projectId)) {
        return res.status(403).json({ error: '只能授权自己名下的项目' });
      }

      // 同号码 + 同项目 已存在 → 只更新姓名关系，不动 bound_at
      // （否则业主改个名字就把成员「重新变回待加入」了）
      const exist = await db
        .prepare(
          'SELECT id, bound_at FROM family_members WHERE phone = ? AND project_id = ? AND customer_id = ? LIMIT 1'
        )
        .get(p, projectId, me.customerId);
      if (exist) {
        await db
          .prepare('UPDATE family_members SET name = ?, relation = ? WHERE phone = ? AND project_id = ? AND customer_id = ?')
          .run(n, String(relation || ''), p, projectId, me.customerId);
        return res.json({
          success: true,
          id: exist.id,
          updated: true,
          is_bound: !!exist.bound_at,
          message: '该成员已在此项目中，已更新姓名和关系',
        });
      }

      // 防滥用：一个家庭最多 10 位成员（按人去重，不是按行）
      const cntRow = await db
        .prepare('SELECT COUNT(DISTINCT phone) AS n FROM family_members WHERE customer_id = ? AND is_master = 0')
        .get(me.customerId);
      if (Number((cntRow && cntRow.n) || 0) >= 10) {
        return res.status(400).json({ error: '一个家庭最多添加 10 位成员' });
      }
      // 一个号码最多被 10 个项目邀请（防止有人批量把号码塞进自己项目）
      const invitedRow = await db
        .prepare('SELECT COUNT(*) AS n FROM family_members WHERE phone = ? AND is_master = 0')
        .get(p);
      if (Number((invitedRow && invitedRow.n) || 0) >= 10) {
        return res.status(400).json({ error: '该手机号已被过多项目邀请，请先确认是否本人' });
      }

      // ⚠️ is_master 恒为 0。主账号只能由客户档案本身代表。
      const result = await db
        .prepare(
          `INSERT INTO family_members (customer_id, project_id, name, phone, relation, is_master, status, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 1, NOW())`
        )
        .run(me.customerId, projectId, n, p, String(relation || ''));

      const projectName = (myProjects.find((x) => Number(x.id) === projectId) || {}).name || '';
      res.json({
        success: true,
        id: result.lastInsertRowid,
        project_id: projectId,
        is_bound: false,
        message: `已添加。请让 TA 用这个手机号登录，确认后即可查看「${projectName}」`,
      });
    } catch (err) {
      console.error('添加家庭成员失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/family-members/:id - 移除家庭成员（仅主账号，连带其所有项目授权）
  app.delete('/api/family-members/:id', async (req, res) => {
    try {
      const me = await resolveOwnerIdentity(req);
      if (!me) return res.status(401).json({ error: '请先登录业主账号' });
      if (me.isFamilyMember || !me.customerId) {
        return res.status(403).json({ error: '仅主账户可移除家庭成员' });
      }

      const memberId = parseInt(req.params.id);
      // 主账号的合成行 id 是 'master'，parseInt 得到 NaN → 直接挡掉
      if (!memberId) return res.status(400).json({ error: '主账号不可删除' });

      const member = await db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: '成员不存在' });

      // ⚠️ 旧实现判的是 `masterPhone === member.phone`（主账户手机号 vs 成员手机号），
      //    永远不相等 → 除主账号外一律 403，删除功能形同虚设。改为同 customer_id 校验。
      if (Number(member.customer_id) !== Number(me.customerId)) {
        return res.status(403).json({ error: '无权删除此成员' });
      }
      if (Number(member.is_master) === 1) {
        return res.status(400).json({ error: '不能删除主账号' });
      }

      // 移除一个人 = 撤掉他在本客户所有项目的授权（不是只撤这一行）
      const del = await db
        .prepare('DELETE FROM family_members WHERE customer_id = ? AND phone = ? AND is_master = 0')
        .run(me.customerId, member.phone);

      res.json({
        success: true,
        removed: Number(del.changes || del.affectedRows || 0),
        message: '已移除该成员，TA 将无法再查看您的项目',
      });
    } catch (err) {
      console.error('删除家庭成员失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/family-members/:id - 修改成员姓名/关系（仅主账号，连带所有项目授权行）
  app.put('/api/family-members/:id', async (req, res) => {
    try {
      const me = await resolveOwnerIdentity(req);
      if (!me) return res.status(401).json({ error: '请先登录业主账号' });
      if (me.isFamilyMember || !me.customerId) {
        return res.status(403).json({ error: '仅主账户可修改家庭成员' });
      }

      const memberId = parseInt(req.params.id);
      if (!memberId) return res.status(400).json({ error: '主账号信息请在「我的」中修改' });

      const { name, relation } = req.body || {};
      const n = String(name || '').trim();
      if (!n) return res.status(400).json({ error: '姓名不能为空' });
      if (n.length > 30) return res.status(400).json({ error: '姓名过长' });

      const member = await db.prepare('SELECT * FROM family_members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: '成员不存在' });
      if (Number(member.customer_id) !== Number(me.customerId)) {
        return res.status(403).json({ error: '无权修改此成员信息' });
      }
      // 主账号的姓名应改客户档案（customers.name），不在家庭成员表里改
      if (Number(member.is_master) === 1) {
        return res.status(400).json({ error: '主账号姓名请到客户档案中修改' });
      }

      // 一个人只有一条姓名/关系，改一次要覆盖他在所有项目的授权行
      await db
        .prepare('UPDATE family_members SET name = ?, relation = ? WHERE customer_id = ? AND phone = ? AND is_master = 0')
        .run(n, String(relation || ''), me.customerId, member.phone);
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error('更新家庭成员失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/family-members/confirm-bind - 成员本人确认加入（支持一次确认多个项目）
  //
  // 这是「待绑定 → 已绑定」的唯一入口，**故意不做登录校验**：
  // 调用它时用户刚输完验证码、还没拿到任何身份。凭证是登录接口当场签发的
  // 一次性 bindToken（5 分钟、用完即焚、只存在服务端内存），
  // 前端无法凭空造出一个能绑定的 token，所以不存在「绕过确认」的路径。
  app.post('/api/family-members/confirm-bind', async (req, res) => {
    try {
      const token = String((req.body || {}).bindToken || '');
      const rec = customerLogin.consumeBindToken(token);
      if (!rec) {
        return res.status(400).json({
          success: false,
          code: 'BIND_EXPIRED',
          message: '加入项目的确认已失效，请重新登录',
        });
      }

      const ids = (rec.memberIds && rec.memberIds.length ? rec.memberIds : [rec.memberId])
        .map((x) => parseInt(x))
        .filter((x) => x > 0);
      if (!ids.length) {
        return res.status(400).json({ success: false, message: '确认信息不完整，请重新登录' });
      }

      const rows =
        (await db
          .prepare(
            `SELECT * FROM family_members
              WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 1`
          )
          .all(...ids)) || [];

      // 只认「同一个手机号 + 非主账号自述行」的记录，防 token 被挪用
      const valid = rows.filter(
        (r) => String(r.phone) === String(rec.phone) && Number(r.is_master) !== 1
      );
      if (!valid.length) {
        return res.status(400).json({ success: false, message: '成员信息已变更，请重新登录' });
      }

      // 一次写完整批 bound_at（已绑定的行不重复写，保留首次确认时间）
      await db
        .prepare(
          `UPDATE family_members SET bound_at = NOW(), bind_openid = ?
            WHERE id IN (${valid.map(() => '?').join(',')}) AND bound_at IS NULL`
        )
        .run(rec.openid || null, ...valid.map((r) => Number(r.id)));

      // 重新解析一次，拿最新状态（可能还有别的项目没确认）
      const ident = await customerLogin.resolveCustomerByPhone(rec.phone);
      if (!ident || !ident.ok) {
        return res.status(400).json({ success: false, message: '身份信息已变更，请重新登录' });
      }

      res.json(
        customerLogin.buildLoginPayload(ident, {
          justBound: true,
          boundCount: valid.length,
          loginType: 'family_bind',
        })
      );
    } catch (err) {
      console.error('确认加入项目失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

};
