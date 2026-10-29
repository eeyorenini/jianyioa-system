/**
 * 图片 / PDF 上传接口（含 pdftoppm 转预览图）（2026-10-29 渐进拆分第 16 轮）
 *
 * 搬运自 server.js 原 2128-2272 行，搬入时 145 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 *
 * ⚠️ 唯一改写：块内 `__dirname` 已全部替换为 `ROOT`。
 *    原文件中 __dirname 指 server/ 根（uploads、tmp 等路径），
 *    搬进 api/ 后会变成 server/api，路径全部错位，所以模块内补
 *    `const ROOT = path.join(__dirname, '..')` 还原成原语义。
 */
module.exports = function registerUploadRoutes(app, deps) {
  const {
    fs,
    path,
    upload,
    spawnSync,
    fixMojibake,
    uploadDir,
    requireLogin,
    PORT,
    getUserId,
  } = deps;

  // 还原原 server.js 的 __dirname（server/ 根）
  const ROOT = path.join(__dirname, '..');

  // ==================== 图片/PDF 上传接口 ====================
  // 图片上传接口（存文件，返回路径，删图片接口）
  const logsUploadDir = path.join(uploadDir, 'logs/');
  if (!fs.existsSync(logsUploadDir)) {
    fs.mkdirSync(logsUploadDir, { recursive: true });
  }

  app.post('/api/upload-image', requireLogin, upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未找到文件' });
      }
      // v2.3.6-hotfix2：修复中文文件名乱码
      req.file.originalname = fixMojibake(req.file.originalname);
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
      let ext = path.extname(req.file.originalname).toLowerCase();

      // v2.3.7：文件名没有扩展名时，按 MIME 类型推断
      // 背景：前端 compressImage() 用 canvas.toBlob() 压缩，产物是**无文件名**的 Blob，
      // 浏览器 FormData 会把它命名成 "blob"（无扩展名）。原来 path.extname('blob') === ''
      // → 不在白名单 → 误报"仅支持图片格式"，而用户上传的确实是 jpg/png。
      // 修复：扩展名缺失时回退到 mimetype 推断。
      if (!ext) {
        const mimeExt = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'image/bmp': '.bmp',
        }[(req.file.mimetype || '').toLowerCase()];
        if (mimeExt) ext = mimeExt;
      }

      if (!allowedExts.includes(ext)) {
        fs.unlinkSync(req.file.path);
        const reason = `文件名=${req.file.originalname} 类型=${req.file.mimetype}`;
        console.error(`[上传] 非图片格式被拒: ${reason}`);
        res.errorMessage = `非图片格式被拒 (${reason})`;
        return res.status(400).json({ error: '仅支持图片格式：jpg/png/gif/webp' });
      }
      // 重命名为唯一文件名，保留扩展名
      const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const newPath = path.join(logsUploadDir, newName);
      fs.renameSync(req.file.path, newPath);
      const url = `/uploads/logs/${newName}`;
      console.log(`[上传] 图片: ${req.file.originalname} (${req.file.mimetype}) -> ${url}`);
      res.json({ url, size: fs.statSync(newPath).size });
    } catch (error) {
      console.error('图片上传错误:', error);
      // 写入 errorMessage，让全局日志中间件能记录真实原因（原来恒为空）
      res.errorMessage = '图片上传失败: ' + (error && error.message ? error.message : String(error));
      res.status(500).json({ error: '图片上传失败: ' + (error && error.message ? error.message : '未知错误') });
    }
  });

  // 删除图片文件接口（根据路径数组删除）
  app.post('/api/delete-images', (req, res) => {
    try {
      // 2026-10-29 补登录校验（止血）：本接口此前**完全没有身份检查**，
      // 实测不带任何头 POST {"paths":["/uploads/xxx.jpg"]} 直接返回 200「删除成功」，
      // 即未登录的公网请求可以删掉服务器上任意 /uploads/ 下的文件。这是**破坏性**越权，
      // 比同批查出的增减项读泄露严重一档（那个只是看到金额，这个是删数据）。
      // 调用方只有移动端 pages/mine/my-logs.vue（H5 与小程序同源一份），
      // 走 uni.request 被 App.vue 拦截器统一注入 x-user-id，加校验不会断。
      // 注：本接口仍不校验「这个文件是不是你上传的」，只挡住未登录；
      //     要做到「只能删自己的」需要给 uploads 建归属表，属独立改造。
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const { paths } = req.body;
      if (!Array.isArray(paths)) return res.status(400).json({ error: 'paths 必须是数组' });
      for (const p of paths) {
        if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
        const fullPath = path.join(ROOT, p);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`[删除图片] ${p}`);
        }
      }
      res.json({ message: '删除成功' });
    } catch (error) {
      console.error('删除图片错误:', error);
      res.status(500).json({ error: '删除图片失败' });
    }
  });

  // PDF 转多页预览图接口（Mac 用 pdftoppm 转所有页，Windows 预留 pdf2pic 接口）
  // v2.4.0 性能改造：改为「落地 JPEG 文件 + 返回 URL」，不再把 base64 塞进编辑器 HTML。
  // 改造前：每页转 PNG 再 base64 内嵌 → 单份合同 content 达 8MB+（14 页 PDF = 8.67MB），
  //         打开编辑页要拉 8MB 大字段、保存又要回传 8MB，实测详情接口 20s+，且拖慢备份。
  // 改造后：content 只存 /uploads/contracts/pdf/xxx.jpg 短路径（整份约 20KB），
  //         图片走静态服务 + 浏览器缓存，加载/保存快两个数量级。
  // 兼容性：导出 PDF 时 withLocalBase() 会注入 <base href="http://127.0.0.1:PORT/">，
  //         相对路径图片照样能渲染进 PDF（v2.3.7 已修复），业务呈现完全不变。
  // 体积：130dpi JPEG（默认质量 75）约为原 150dpi PNG 的 1/5，合同文字依然清晰。
  app.post('/api/upload-pdf', requireLogin, upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未找到文件' });
      }
      // v2.3.6-hotfix2：修复中文文件名乱码
      req.file.originalname = fixMojibake(req.file.originalname);
      if (path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '仅支持 PDF 格式' });
      }
      const { spawnSync } = require('child_process');
      // 先获取总页数
      const infoResult = spawnSync('pdfinfo', [req.file.path], { encoding: 'utf8' });
      let totalPages = 1;
      const infoMatch = infoResult.stdout.match(/Pages:\s*(\d+)/);
      if (infoMatch) totalPages = parseInt(infoMatch[1]) || 1;
      // 限制最多转 20 页，防止异常大文件
      if (totalPages > 20) totalPages = 20;
      // 转所有页面，每页一张 JPEG，落到 uploads/contracts/pdf/
      const pdfImgDir = path.join(uploadDir, 'contracts/pdf/');
      if (!fs.existsSync(pdfImgDir)) fs.mkdirSync(pdfImgDir, { recursive: true });
      const stamp = Date.now();
      const rand = Math.random().toString(36).slice(2);
      const urls = [];
      for (let i = 1; i <= totalPages; i++) {
        const baseName = `${stamp}_${rand}_p${i}`;
        const outputBase = path.join(pdfImgDir, baseName);
        const result = spawnSync('pdftoppm', [
          '-jpeg', '-singlefile',
          '-f', String(i), '-l', String(i),
          '-r', '130',
          req.file.path, outputBase
        ], { encoding: 'utf8' });
        const outputPath = `${outputBase}.jpg`;
        if (!result.error && fs.existsSync(outputPath)) {
          urls.push(`/uploads/contracts/pdf/${baseName}.jpg`);
        }
      }
      fs.unlinkSync(req.file.path);
      if (!urls.length) {
        return res.status(500).json({ error: 'PDF 转预览图失败，请确认已安装 poppler（brew install poppler）' });
      }
      console.log(`[上传] PDF: ${req.file.originalname} -> ${urls.length} 页 JPEG`);
      res.json({ urls, totalPages });
    } catch (error) {
      console.error('PDF 上传错误:', error);
      res.status(500).json({ error: 'PDF 处理失败' });
    }
  });
};
