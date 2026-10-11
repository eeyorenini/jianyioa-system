/**
 * v2.3.1 权限体系 · P5 迁移 —— 7 个现有角色预置默认权限
 *
 * 严格按「docs/权限体系-待批示单.md §2.x」清单写入：
 *   - admin(id=1)         : 保持 [] → 后端直通全部
 *   - 项目经理(manager)   : 项目/日志/巡检/派工/验收/增减项/采购/客户/员工（多档 read_all）
 *   - 设计师(designer)    : 项目/日志/巡检/验收/增减项/客户/报价/预算（仅关联）
 *   - 工程监理(Engineer)  : 项目(仅关联)/巡检(read_all)/验收/派工/日志/通知/员工
 *   - 财务(finance)       : 财务/催收/采购(read_all)/发票/合同/增减项（read_all）
 *   - 主材员(material)    : 主材/仓库/采购(read_all)/项目(read_all)/合同(read)/员工
 *   - 普通员工(user)      : 项目/日志/通知/审批/报表/员工
 *
 * ⚠️ 仅作"预置初值"——之后 admin 可在后台随意增删改，无须改代码。
 * ⚠️ 幂等：可重复执行（覆盖式）；若管理员已调整过则会被覆盖。
 *    执行前会自动比对，仅当角色当前权限数 < 5（明显空）时才写入，避免覆盖人工配置。
 *
 * 执行：node migrations/v2_3_1_role_seeding.js
 * 可选环境变量：FORCE=1  强制覆盖（不管现状）
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
});

const PRESETS = {
  // admin 保持 [] —— 后端识别 admin code/username 直通全部
  admin: [],

  // 项目经理：管理全盘，重点覆盖 read_all + 流程动作
  manager: [
    'project:read_all', 'project:write', 'project:delete',
    'project_log:read_all', 'project_log:write', 'project_log:delete',
    'inspection:read_all', 'inspection:write',
    'dispatch:read_all', 'dispatch:write',
    'acceptance:read_all', 'acceptance:write',
    'contract_change:read_all', 'contract_change:write', 'contract_change:approve', 'contract_change:finance',
    'contract:read_all', 'project_contract:read_all',
    'purchase:read_all', 'purchase:approve', 'purchase:finance',
    'customer:read_all', 'customer:write',
    'employee:read',
    'budget:read_all', 'quote:read_all',
    'notice:read', 'notice:write',
    'approval:read', 'approval:write',
    'finance:read',
  ],

  // 设计师：仅关联项目（含跨子模块），但写得多
  designer: [
    'project:read',
    'project_log:read', 'project_log:write',
    'inspection:read',
    'acceptance:read',
    'contract_change:read', 'contract_change:write',
    'customer:read', 'customer:write',
    'quote:read', 'quote:write',
    'budget:read', 'budget:write',
    'collection:read', 'collection:write', // 陛下说设计师可操作催收
    'notice:read',
    'approval:read',
    'employee:read',
  ],

  // 工程监理：施工日志/巡检/验收/派工 写入主战场；项目只读关联
  Engineer: [
    'project:read',
    'inspection:read_all', 'inspection:write', 'inspection:delete',
    'acceptance:read_all', 'acceptance:write', 'acceptance:delete',
    'dispatch:read_all', 'dispatch:write', 'dispatch:delete', 'dispatch:approve',
    'project_log:write', 'project_log:read',
    'notice:read', 'notice:write',
    'customer:read',
    'purchase:read',
    'contract_change:read',
    'employee:read',
  ],

  // 财务：金额类业务（催收/合同/增减项/采购财务受理）+ 发票
  finance: [
    'finance:read_all', 'finance:write', 'finance:delete', 'finance:finance',
    'collection:read_all', 'collection:write', 'collection:finance',
    'purchase:read_all', 'purchase:finance',
    'invoice:read_all', 'invoice:write', 'invoice:delete',
    'contract:read_all',
    'project_contract:read_all',
    'contract_change:read_all', 'contract_change:finance',
    'project:read_all',
    'customer:read_all',
    'employee:read', // 财务需要联系相关人（含本人看自己）—— v2.3.1 补
    'report:read_all',
    'budget:read_all',
  ],

  // 主材员：主材/仓库写入；项目可全看
  material: [
    'material:read_all', 'material:write',
    'warehouse:read_all', 'warehouse:write',
    'purchase:read_all',
    'project:read_all',
    'contract:read',
    'project_log:read',
    'inspection:read',
    'acceptance:read',
    'notice:read',
    'employee:read',
  ],

  // 普通员工：通讯录 + 公告 + 审批 + 报表 + 项目查看
  user: [
    'project:read',
    'project_log:read',
    'notice:read',
    'approval:read',
    'report:read',
    'inspection:read',
    'acceptance:read',
    'dispatch:read',
    'employee:read',
  ],
};

// 角色 code → id 的映射（按 roles.code 查）
async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME);
    const [roles] = await conn.query('SELECT id, name, code, permissions FROM roles');
    const codeToRole = new Map();
    roles.forEach((r) => codeToRole.set(r.code, r));
    const FORCE = process.env.FORCE === '1';
    let updated = 0;
    for (const [code, perms] of Object.entries(PRESETS)) {
      const role = codeToRole.get(code);
      if (!role) { console.log(`⏭ 未找到角色 code=${code}`); continue; }
      // 当前已配权限数
      let cur = [];
      if (typeof role.permissions === 'string') {
        try { cur = JSON.parse(role.permissions); } catch { cur = []; }
      } else if (Array.isArray(role.permissions)) cur = role.permissions;
      const alreadyConfigured = Array.isArray(cur) && cur.length >= 5;
      if (alreadyConfigured && !FORCE) {
        console.log(`⏭ ${code}(id=${role.id}) 已配 ${cur.length} 项权限，跳过（FORCE=1 可覆盖）`);
        continue;
      }
      // admin 特殊：保留空（不写）
      const final = code === 'admin' ? [] : perms;
      await conn.query('UPDATE roles SET permissions = ? WHERE id = ?',
        [JSON.stringify(final), role.id]);
      console.log(`✅ ${code}(id=${role.id}) 写入 ${final.length} 项权限`);
      updated++;
    }
    console.log(`\n🎉 完成：更新 ${updated} 个角色`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });