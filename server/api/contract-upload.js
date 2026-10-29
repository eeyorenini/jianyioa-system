/**
 * 合同文件上传（Word / 其他附件）（2026-10-29 渐进拆分第 22 轮）
 *
 * 搬运自 server.js 原 653-702 行，搬入时 50 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerContractUploadRoutes(app, deps) {
  const {
    fs,
    path,
    upload,
    fixMojibake,
    requireLogin,
    uploadDir,
  } = deps;

  app.post('/api/contracts/upload-word', requireLogin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.json({ error: '未找到文件' });
      }
      // v2.3.6-hotfix2：修复中文文件名乱码
      req.file.originalname = fixMojibake(req.file.originalname);

      const fileName = req.file.originalname;
      if (!fileName.endsWith('.docx')) {
        fs.unlinkSync(req.file.path);
        return res.json({ error: '仅支持.docx格式' });
      }
    
      const mammoth = require('mammoth');
      const result = await mammoth.convertToHtml({ path: req.file.path });
      fs.unlinkSync(req.file.path);
      res.json({ html: result.value });
    } catch (error) {
      console.error('Word上传错误:', error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.json({ error: '文件处理失败: ' + error.message });
    }
  });

  // ==================== 合同文件上传（支持图片/PDF/Word） ====================
  app.post('/api/upload-contract-file', requireLogin, upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未找到文件' });
      }
      // v2.3.6-hotfix2：修复中文文件名乱码
      req.file.originalname = fixMojibake(req.file.originalname);
      const ext = path.extname(req.file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.doc', '.docx'];
      if (!allowedExts.includes(ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '不支持此文件格式' });
      }
      const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const contractUploadDir = path.join(uploadDir, 'contracts/');
      if (!fs.existsSync(contractUploadDir)) fs.mkdirSync(contractUploadDir, { recursive: true });
      const newPath = path.join(contractUploadDir, newName);
      fs.renameSync(req.file.path, newPath);
      const url = `/uploads/contracts/${newName}`;
      res.json({ url });
    } catch (error) {
      console.error('合同文件上传错误:', error);
      res.status(500).json({ error: '文件上传失败' });
    }
  });
};
