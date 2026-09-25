'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.post('/api/upload-image', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    if (!allowedExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '仅支持图片格式：jpg/png/gif/webp' });
    }
    // 重命名为唯一文件名，保留扩展名
    const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const newPath = path.join(logsUploadDir, newName);
    fs.renameSync(req.file.path, newPath);
    const url = `/uploads/logs/${newName}`;
    console.log(`[上传] 图片: ${req.file.originalname} -> ${url}`);
    res.json({ url, size: fs.statSync(newPath).size });
  } catch (error) {
    console.error('图片上传错误:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

// 删除图片文件接口（根据路径数组删除）

router.post('/api/delete-images', (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths)) return res.status(400).json({ error: 'paths 必须是数组' });
    for (const p of paths) {
      if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
      const fullPath = path.join(__dirname, p);
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

router.post('/api/upload-pdf', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到文件' });
    }
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
    // 转所有页面，每页一张 PNG
    const urls = [];
    for (let i = 1; i <= totalPages; i++) {
      const newName = `${Date.now()}_${Math.random().toString(36).slice(2)}_p${i}.png`;
      const outputPath = path.join(uploadDir, newName);
      const result = spawnSync('pdftoppm', [
        '-png', '-singlefile',
        '-f', String(i), '-l', String(i),
        '-r', '150',
        req.file.path, outputPath.replace('.png', '')
      ], { encoding: 'utf8' });
      if (!result.error && fs.existsSync(outputPath)) {
        const fileData = fs.readFileSync(outputPath);
        const base64 = fileData.toString('base64');
        urls.push(`data:image/png;base64,${base64}`);
        fs.unlinkSync(outputPath);
      }
    }
    fs.unlinkSync(req.file.path);
    if (!urls.length) {
      return res.status(500).json({ error: 'PDF 转预览图失败，请确认已安装 poppler（brew install poppler）' });
    }
    console.log(`[上传] PDF: ${req.file.originalname} -> ${urls.length} 页预览图`);
    res.json({ urls, totalPages });
  } catch (error) {
    console.error('PDF 上传错误:', error);
    res.status(500).json({ error: 'PDF 处理失败' });
  }
});


module.exports = router;