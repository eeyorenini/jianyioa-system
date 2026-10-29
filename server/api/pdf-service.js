/**
 * PDF 生成服务（Puppeteer + Chrome 渲染 / 合并）（2026-10-29 渐进拆分第 14 轮）
 *
 * 搬运自 server.js 原 9007-9193 行，搬入时 187 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerPdfRoutes(app, deps) {
  const {
    puppeteer,
    fs,
    PORT,
    getUserId,
  } = deps;

  // ============================================================
  // PDF 生成服务 - 使用 Puppeteer + Chrome 渲染
  // ============================================================
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  // 依次探测可用的 Chrome/Edge 可执行文件。
  // 背景：服务器（Windows Server 2012 R2 + PM2 跑在 systemprofile 下）执行 npm install 时
  // puppeteer 的 postinstall 没把 Chromium 下载到
  // C:\Windows\system32\config\systemprofile\.cache\puppeteer，导致 launch 直接抛
  // "Could not find Chromium (rev. xxx)"。此时若系统装了 Chrome/Edge，指过去就能救。
  function resolveChromePath() {
    // 1) 显式指定优先（部署时可配 CHROME_PATH 环境变量）
    const envPath = process.env.CHROME_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;

    const candidates = isMac
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : isWindows
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
          ];

    for (const p of candidates) {
      try { if (p && fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
    }

    // 2) 退回 puppeteer 自带的 Chromium（若 postinstall 下载成功）
    try {
      const bundled = puppeteer.executablePath();
      if (bundled && fs.existsSync(bundled)) return bundled;
    } catch (e) { /* ignore */ }

    return null; // 交给 puppeteer 自己报错，错误信息更完整
  }

  const PUPPETEER_CONFIG = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
  const _chromePath = resolveChromePath();
  if (_chromePath) {
    PUPPETEER_CONFIG.executablePath = _chromePath;
    console.log('[PDF] 使用浏览器:', _chromePath);
  } else {
    console.warn('[PDF][warn] 未找到 Chrome/Edge，PDF 导出将失败。请安装 Chrome 或设置 CHROME_PATH 环境变量');
  }

  // ============================================================
  // v2.3.7：修复「导出 PDF 里图片空白」
  // 背景：编辑器上传的图片插入的是**相对路径** `/uploads/logs/xxx.png`。
  // page.setContent() 渲染在空白页(about:blank)上，相对路径没有 origin 可解析
  // → 图片全部加载失败 → 导出的 PDF 里图片位置一片空白。
  // 解决：渲染前补一个 <base>，让相对路径指向本机后端（同端口托管的 /uploads）。
  // 纯新增，不改动任何原有的 PDF 生成流程。
  // v2.4.0 补充：PDF 上传接口已从「base64 内嵌」改为「存 JPEG 文件 + 相对路径」，
  //   正是靠这里的 <base> + waitUntil:'networkidle0' 才能正常渲染进导出的 PDF。
  //   → 千万别删 withLocalBase()，否则合同里所有 PDF 转图和插入的图片都会在导出时变空白。
  const LOCAL_BASE = `http://127.0.0.1:${PORT}/`;
  function withLocalBase(html) {
    if (typeof html !== 'string' || !html) return html;
    if (/<base\s/i.test(html)) return html; // 前端已带 base，不重复插
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${LOCAL_BASE}">`);
    }
    return `<base href="${LOCAL_BASE}">` + html;
  }

  let browserInstance = null;

  async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
      console.log('正在启动 Chrome...');
      if (browserInstance) {
        try { await browserInstance.close(); } catch(e) {}
        browserInstance = null;
      }
      browserInstance = await puppeteer.launch(PUPPETEER_CONFIG);
      console.log('Chrome 启动完成');
    }
    return browserInstance;
  }

  // POST /api/export-pdf
  // Body: { html: string, filename: string }
  app.post('/api/export-pdf', async (req, res) => {
    // v2.5.3 鉴权加固：导出走 puppeteer（起浏览器进程 + 渲染任意 HTML），
    // 匿名可调等于开放一个免费的无头浏览器服务，只要求登录即可。
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    const { html, filename = 'export.pdf' } = req.body;
    if (!html) {
      return res.status(400).json({ error: 'html 参数不能为空' });
    }

    try {
      const browser = await getBrowser();
      const page = await browser.newPage();

      // 设置内容（完整的 HTML 文档）
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4; margin: 0; }
            @media print {
              body { -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `;
      await page.setContent(withLocalBase(fullHtml), { waitUntil: 'networkidle0' });

      // 生成 PDF（交给 Chrome 根据 @page size:A4 自动处理）
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: 10, right: 10, bottom: 10, left: 10 }
      });

      // Uint8Array 转 Buffer，确保二进制传输
      const buffer = Buffer.from(pdfBuffer);

      await page.close();

      // 返回 PDF 文件（直接用 end，避免 Express JSON 序列化）
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch (err) {
      console.error('PDF 生成失败:', err);
      res.status(500).json({ error: 'PDF 生成失败: ' + err.message });
    }
  });

  // POST /api/export-pdf-multi — 多页合并
  app.post('/api/export-pdf-multi', async (req, res) => {
    // v2.5.3 鉴权加固：同 export-pdf，未登录不放开无头浏览器。
    if (!getUserId(req)) return res.status(401).json({ error: '未登录' });
    const { pages = [], filename = 'export.pdf' } = req.body;
    if (!pages.length) return res.status(400).json({ error: 'pages 不能为空' });
    try {
      const { PDFDocument } = require('pdf-lib');
      const browser = await getBrowser();
      const mergedPdf = await PDFDocument.create();
      for (const { html } of pages) {
        const page = await browser.newPage();
        // 直接使用前端传来的完整 HTML（已包含 DOCTYPE、<html>、<head>、<body>）
        // 不再二次包装，避免 body 没有高度导致 absolute 定位失效
        await page.setContent(withLocalBase(html), { waitUntil: 'networkidle0' });
        const pdfBytes = await page.pdf({ format:'A4', printBackground:true, margin:{top:0,right:0,bottom:0,left:0} });
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const [copied] = await mergedPdf.copyPages(pdfDoc, [0]);
        mergedPdf.addPage(copied);
        await page.close();
      }
      const buf = Buffer.from(await mergedPdf.save());
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    } catch(err) {
      console.error('PDF合并失败:', err);
      res.status(500).json({ error:'PDF合并失败: ' + err.message });
    }
  });

};
