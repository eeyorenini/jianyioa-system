/**
 * 合同 content base64 图片 → 文件迁移脚本（v2.4.0）
 *
 * 背景：/api/upload-pdf 原先把 PDF 每页转 PNG 再 base64 内嵌进编辑器 HTML，
 *       导致单份合同 content 达 8MB+，打开编辑页/保存/备份全线变慢。
 *
 * 本脚本做的事：
 *   1. 扫 contracts.content 里所有 data:image/...;base64,xxx
 *   2. 解码成图片文件，用「内容 md5」命名 → 天然去重（同一份 PDF 传多次只存一份）
 *   3. 用 macOS 自带 sips 转 JPEG（质量 70），体积约为原 PNG 的 1/5
 *   4. 把 content 里的 base64 替换成 /uploads/contracts/pdf/mig_<md5>.jpg
 *   5. 逐条 UPDATE 回数据库
 *
 * ⚠️ 运行前必须：
 *   - 已备份 contracts 表（backup-20261020/contracts_before_migration.sql.gz）
 *   - 生成的图片文件要一并上传到服务器的 server/uploads/contracts/pdf/，
 *     否则线上合同里的图片会全部裂开（404）
 *
 * 用法：cd server && node _migrate_contract_base64.js [--dry-run]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = path.join(__dirname, 'uploads/contracts/pdf');
const TMP_DIR = path.join(__dirname, '_mig_tmp');

const RE = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g;

function ensureDirs() {
  for (const d of [OUT_DIR, TMP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/** base64 → 文件，返回 URL；同内容只落一次盘 */
function saveImage(mime, b64) {
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return null;
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 16);
  const fileName = `mig_${hash}.jpg`;
  const target = path.join(OUT_DIR, fileName);
  if (fs.existsSync(target)) return `/uploads/contracts/pdf/${fileName}`;

  const ext = mime === 'png' ? 'png' : (mime === 'webp' ? 'webp' : 'jpg');
  const tmp = path.join(TMP_DIR, `mig_${hash}.${ext}`);
  fs.writeFileSync(tmp, buf);
  try {
    if (ext === 'jpg') {
      // 本来就是 JPEG，直接用（改个名）
      fs.renameSync(tmp, target);
    } else {
      // PNG/WebP → JPEG，压缩到约 1/5
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', tmp, '--out', target], { stdio: 'ignore' });
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  } catch (e) {
    // sips 失败就原样保留（至少不丢图）
    if (fs.existsSync(tmp)) fs.renameSync(tmp, target.replace(/\.jpg$/, `.${ext}`));
    else return null;
  }
  return `/uploads/contracts/pdf/${fileName}`;
}

(async () => {
  ensureDirs();
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, connectionLimit: 2, dateStrings: true,
  });

  const [ids] = await pool.query("SELECT id FROM contracts WHERE content LIKE '%data:image%' ORDER BY id");
  console.log(`[迁移] 待处理合同: ${ids.length} 条${DRY_RUN ? '（dry-run，不写库）' : ''}`);

  let totalBefore = 0, totalAfter = 0, totalImgs = 0, updated = 0;
  for (const { id } of ids) {
    const [rows] = await pool.query('SELECT id, contract_no, project_name, content FROM contracts WHERE id = ?', [id]);
    const row = rows[0];
    if (!row || !row.content) continue;
    const before = row.content.length;
    totalBefore += before;

    let count = 0;
    const newContent = row.content.replace(RE, (full, mime, b64) => {
      const url = saveImage(mime, b64);
      if (!url) return full;
      count++;
      return url;
    });
    totalImgs += count;
    totalAfter += newContent.length;

    if (!DRY_RUN && newContent !== row.content) {
      await pool.query('UPDATE contracts SET content = ? WHERE id = ?', [newContent, id]);
      updated++;
    }
    console.log(`  id=${id} ${row.contract_no || ''} ${(row.project_name || '').slice(0, 16)}  图片 ${count} 张  ${(before / 1024 / 1024).toFixed(2)}MB → ${(newContent.length / 1024).toFixed(1)}KB`);
  }

  const files = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter(f => f.startsWith('mig_')) : [];
  let diskSize = 0;
  files.forEach(f => { diskSize += fs.statSync(path.join(OUT_DIR, f)).size; });

  console.log('\n================ 迁移结果 ================');
  console.log(`合同条数      : ${ids.length}（实际更新 ${updated} 条）`);
  console.log(`图片引用      : ${totalImgs} 处 → 去重后落盘 ${files.length} 个文件`);
  console.log(`content 总量  : ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024).toFixed(1)} KB`);
  console.log(`磁盘占用      : ${(diskSize / 1024 / 1024).toFixed(2)} MB（uploads/contracts/pdf/）`);
  console.log(`压缩比        : 数据库瘦身 ${((1 - totalAfter / totalBefore) * 100).toFixed(2)}%`);
  if (DRY_RUN) console.log('（dry-run 模式，数据库未改动）');
  await pool.end();
})().catch(e => { console.error('迁移失败:', e); process.exit(1); });
