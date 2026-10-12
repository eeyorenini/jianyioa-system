/**
 * v2.3.4 项目文件功能 · P2 权限位
 * 内容：
 *   1) permissions 表新增 1 个 module 行（project_file）+ 4 个子权限行
 *      - project_file          (menu,  sort=28, 给后台"权限树"显示用)
 *      - project_file:read     (sort=28)
 *      - project_file:read_all (sort=29)
 *      - project_file:write    (sort=30)
 *      - project_file:approve  (sort=31)
 *
 *   2) 7 个角色 preset 挂上 project_file 权限位（与 v2_3_1_role_seeding 一致，仅空角色才覆盖）：
 *      - admin   : []                          (后端识别 admin 直通)
 *      - manager : project_file:read_all + approve
 *      - designer: project_file:read + write   (设计师主要上传)
 *      - Engineer: project_file:read           (监理仅查看)
 *      - finance : project_file:read_all + approve  (财务可审核，看全部)
 *      - material: project_file:read
 *      - user    : project_file:read
 *
 * 幂等：permissions 表 SELECT 已存在则跳过；角色 preset 仅当权限数 < 5 才覆盖。
 *      不会影响 admin 已在后台手动调整过的权限（保留 [] 直通语义）。
 * 执行：node migrations/v2_3_4_project_file_perms.js
 *      可选：FORCE=1 强制覆盖
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

// 4 个子权限行（用于后台权限树显示；真正的校验走 middleware/perm.js canAction）
const SUB_PERMISSIONS = [
  ['查看项目文件',     'project_file:read',     28],
  ['查看全部项目文件', 'project_file:read_all', 29],
  ['上传项目文件',     'project_file:write',    30],
  ['审核项目文件',     'project_file:approve',  31],
];

const PRESETS = {
  admin: [],
  manager: [
    'project_file:read_all',
    'project_file:approve',
  ],
  designer: [
    'project_file:read',
    'project_file:write',
  ],
  Engineer: [
    'project_file:read',
  ],
  finance: [
    'project_file:read_all',
    'project_file:approve',
  ],
  material: [
    'project_file:read',
  ],
  user: [
    'project_file:read',
  ],
};

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ 已连接 ' + process.env.DB_HOST + '/' + process.env.DB_NAME + '\n');

    // 1) permissions 表加 module 行（如果还没有 project_file）
    const [exists] = await conn.query("SELECT id FROM permissions WHERE code = 'project_file' LIMIT 1");
    if (exists.length) {
      console.log('⏭ permissions 已有 project_file module（id=' + exists[0].id + '）');
    } else {
      await conn.query(
        "INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order, created_at) VALUES (?, ?, NULL, 'menu', ?, ?, ?, NOW())",
        ['项目文件', 'project_file', '/project-files', 'Folder', 28]
      );
      console.log('✅ permissions 新增 module：项目文件（sort=28）');
    }

    // 2) permissions 表加 4 个子权限行
    for (const [name, code, sort] of SUB_PERMISSIONS) {
      const [r] = await conn.query("SELECT id FROM permissions WHERE code = ? LIMIT 1", [code]);
      if (r.length) {
        console.log('⏭ permissions 已有 ' + code);
      } else {
        await conn.query(
          "INSERT INTO permissions (name, code, parent_id, type, path, icon, sort_order, created_at) VALUES (?, ?, NULL, 'menu', ?, ?, ?, NOW())",
          [name, code, '', '', sort]
        );
        console.log('✅ permissions 新增 ' + code + '（sort=' + sort + '）');
      }
    }

    // 3) 7 角色 preset 挂上 project_file 权限（**追加**，不覆盖现有权限）
    //    幂等：如果角色已经有所有需要的 project_file:* 权限则跳过
    const [roles] = await conn.query('SELECT id, name, code, permissions FROM roles');
    const codeToRole = new Map();
    roles.forEach((r) => codeToRole.set(r.code, r));
    let updated = 0;
    for (const [code, addPerms] of Object.entries(PRESETS)) {
      const role = codeToRole.get(code);
      if (!role) { console.log('⏭ 未找到角色 code=' + code); continue; }

      let cur = [];
      if (typeof role.permissions === 'string') {
        try { cur = JSON.parse(role.permissions); } catch { cur = []; }
      } else if (Array.isArray(role.permissions)) cur = role.permissions;

      // admin 保持 [] —— 后端识别 admin 直通
      if (code === 'admin') {
        if (cur.length === 0) {
          console.log('⏭ admin(id=' + role.id + ') 保持 []（admin 直通，不写权限位）');
        } else {
          console.log('⏭ admin(id=' + role.id + ') 当前 ' + cur.length + ' 项，admin 保持 [] 不动');
        }
        continue;
      }

      // 检查是否已经包含所有需要的 project_file 权限
      const haveAll = addPerms.every((p) => cur.includes(p));
      if (haveAll) {
        console.log('⏭ ' + code + '(id=' + role.id + ') 已包含 ' + addPerms.length + ' 项 project_file 权限，跳过');
        continue;
      }

      // 合并：cur ∪ addPerms（去重）
      const set = new Set([...(cur || []), ...addPerms]);
      const final = Array.from(set);
      await conn.query('UPDATE roles SET permissions = ? WHERE id = ?',
        [JSON.stringify(final), role.id]);
      console.log('✅ ' + code + '(id=' + role.id + ') 从 ' + cur.length + ' 项扩展到 ' + final.length + ' 项（+' + addPerms.length + ' project_file）');
      updated++;
    }

    console.log('\n🎉 P2 权限位迁移完成：更新 ' + updated + ' 个角色');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ 迁移失败:', e); process.exit(1); });
