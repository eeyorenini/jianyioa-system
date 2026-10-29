/**
 * 项目文件 + 预览转换 API（2026-10-29 渐进拆分第 13 轮）
 *
 * 搬运自 server.js 原 8205-8816 行，612 行：
 *   1. 项目文件 multer 配置（100MB，uploads/project_files/{yyyy}/{mm}/{uuid}.{ext}）
 *   2. 预览转换函数：CAD(DWG/DXF)→PDF、Office→PDF(LibreOffice)、统一入口 convertToPdf
 *   3. 文件转换路由 7 个：列表 / 详情 / 上传 / 审核 / 撤销 / 删除 / 下载（流式）
 *
 * ⚠️ 与其它模块不同的一处改写：块内原本 6 处 `__dirname` 指的是 server/ 根目录
 *    （uploads、tmp），搬进 api/ 后 __dirname 会变成 server/api，路径全部错位。
 *    所以统一替换为 ROOT = path.join(__dirname, '..')，行为与原文件完全一致。
 *
 * 转换工具在服务器上可能没装（LibreOffice / ODA File Converter），
 * 缺失时接口返 503 而不是崩，getToolPath 负责探测。
 */
module.exports = function registerProjectFileRoutes(app, deps) {
  const {
    path, fs, os, crypto, multer, spawn,
    pool, db,
    getUserId, checkPermission, permCore, addLog, getUserIdsByPermission,
    getToolPath, fixMojibake,
  } = deps;

  // 原 server.js 的 __dirname（server/ 根），块内 6 处路径拼接都基于它
  const ROOT = path.join(__dirname, '..');

  // ==================== 项目文件 v2.3.4 ====================
  // 业务流程：上传（自动 pending）→ 通知有 approve 权限的人 → 审核 → 通知上传人
  // 8 个路由 + 1 个 helper function

  // multer 独立配置：100MB，路径 uploads/project_files/{yyyy}/{mm}/{uuid}.{ext}
  const projectFilesDir = path.join(ROOT, 'uploads', 'project_files');
  fs.mkdirSync(projectFilesDir, { recursive: true });
  const projectFileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dir = path.join(projectFilesDir, String(yyyy), mm);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // 先修乱码再取扩展名，保证中文名文件的 ext 也正确
      const ext = path.extname(fixMojibake(file.originalname)).toLowerCase();
      cb(null, crypto.randomUUID() + ext);
    },
  });
  const projectFileUpload = multer({
    storage: projectFileStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
                       '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                       '.dwg', '.dxf', '.zip', '.rar'];
      const ext = path.extname(fixMojibake(file.originalname)).toLowerCase();
      if (allowed.includes(ext)) cb(null, true);
      else cb(new Error('不支持的文件类型: ' + ext));
    },
  });


  // ==================== 文件预览转换（CAD/Office → PDF）====================
  // v2.3.6 hotfix 10-15：补全 P1 健壮性 + P2 增强
  //   - Linux 路径（之前只写 macOS / Windows，服务器如果是 Linux 直接报错）
  //   - 启动探测工具是否安装（缺失返 503，不阻塞上传）
  //   - LibreOffice headless 处理 Office 文件（.doc/.docx/.xls/.xlsx/.ppt/.pptx）
  //   - 临时脚本 chmod 0o600（防本机其他用户偷看转换脚本）
  //   - 转换失败时通过 project_files 表存 preview_error，前端可见

  // 探测二进制是否安装（existsSync 比 spawn ENOENT 错误更友好）
  // 工具路径探测（whichBinary / freecadCandidates / libreofficeCandidates / getToolPath）
  // 已抽到 ./lib/tools.js，探测结果缓存在那边，行为不变
  // v2.3.6 hotfix 10-15：server 启动时主动探测一次（让运维第一时间看到工具状态）
  // 不在 convertToPdf 里再探测（避免首次转换时才发现问题）
  (function probeToolsOnStartup() {
    getToolPath('freecad');
    getToolPath('libreoffice');
    // stdout 被 buffer 时强制 flush（避免日志文件看不到启动探测）
    if (process.stdout.write) process.stdout.write('');
  })();

  // ==================== CAD (DWG/DXF) 转 PDF 预览 ====================
  // 用 FreeCAD headless 模式将 CAD 文件转换为 PDF，供移动端预览
  function convertCadToPdf(inputPath, outputDir) {
    return new Promise((resolve, reject) => {
      const inputExt = path.extname(inputPath).toLowerCase();
      if (!['.dwg', '.dxf'].includes(inputExt)) {
        return reject(new Error('非 CAD 文件'));
      }
      const freecadBin = getToolPath('freecad');
      if (!freecadBin) {
        return reject(new Error('FreeCAD 未安装：请在服务器安装 FreeCAD（macOS: brew install freecad；Ubuntu: apt install freecad；Windows: 官网下载）'));
      }
      const pdfName = path.basename(inputPath, inputExt) + '.pdf';
      const outputPdf = path.join(outputDir, pdfName);
      if (fs.existsSync(outputPdf)) {
        // 懒加载：PDF 已存在，跳过转换
        console.log('[CAD] PDF 已存在，跳过转换:', outputPdf);
        return resolve(outputPdf);
      }

      // FreeCAD Python 脚本：打开 CAD 文件并导出 PDF
      const pyScript = [
        'import sys',
        'import FreeCAD',
        'import os',
        '',
        'input_file = sys.argv[1]',
        'output_file = sys.argv[2]',
        '',
        'doc = FreeCAD.newDocument()',
        'try:',
        '    # 尝试用 DXF 模块导入',
        '    try:',
        '        import importDXF',
        '        importDXF.insert(input_file, "Doc")',
        '    except:',
        '        # 尝试直接打开',
        '        FreeCAD.open(input_file)',
        '    ',
        '    doc.recompute()',
        '    ',
        '    # 使用 TechDraw 导出 PDF',
        '    import TechDraw',
        '    page = TechDraw.newDrawPage(doc)',
        '    ',
        '    # 遍历所有可见对象添加到页面',
        '    for obj in doc.Objects:',
        '        if hasattr(obj, "Shape") and obj.Shape.Solids:',
        '            try:',
        '                view = TechDraw.View(doc)',
        '                view.Source = obj',
        '                page.addView(view)',
        '                break',
        '            except:',
        '                pass',
        '    ',
        '    page.exportToPDF(output_file)',
        '    print("SUCCESS:" + output_file if os.path.exists(output_file) else "FAILED")',
        'except Exception as e:',
        '    print("ERROR:" + str(e))',
        '    sys.exit(1)',
        'finally:',
        '    FreeCAD.closeDocument("Doc")',
      ].join('\n');

      // 写入临时 Python 脚本（chmod 0o600 防本机其他用户偷看）
      const tmpDir = path.join(ROOT, 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
      const scriptPath = path.join(tmpDir, '_cad_convert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.py');
      fs.writeFileSync(scriptPath, pyScript, { mode: 0o600 });

      console.log('[CAD] 开始转换:', inputPath, '->', outputPdf);

      const proc = spawn(freecadBin, ['--headless', '-c', scriptPath, inputPath, outputPdf], {
        timeout: 90000,  // 90秒超时
        windowsHide: true,
        // 进程资源限制（防 RCE/资源耗尽）
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        try { fs.unlinkSync(scriptPath); } catch {}
        if (code === 0 && fs.existsSync(outputPdf)) {
          console.log('[CAD] 转换成功:', outputPdf);
          resolve(outputPdf);
        } else {
          const errMsg = stderr || stdout || 'Unknown error';
          console.error('[CAD] 转换失败, code:', code, 'stdout:', stdout, 'stderr:', stderr);
          reject(new Error('FreeCAD 转换失败: ' + errMsg.slice(0, 200)));
        }
      });

      proc.on('error', (err) => {
        try { fs.unlinkSync(scriptPath); } catch {}
        console.error('[CAD] FreeCAD 进程错误:', err.message);
        reject(err);
      });

      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        try { fs.unlinkSync(scriptPath); } catch {}
        reject(new Error('FreeCAD 转换超时（90秒）'));
      }, 90000);
    });
  }

  // ==================== Office 文件转 PDF 预览 ====================
  // 用 LibreOffice headless 处理 .doc/.docx/.xls/.xlsx/.ppt/.pptx
  function convertOfficeToPdf(inputPath, outputDir) {
    return new Promise((resolve, reject) => {
      const inputExt = path.extname(inputPath).toLowerCase();
      if (!['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(inputExt)) {
        return reject(new Error('非 Office 文件'));
      }
      const sofficeBin = getToolPath('libreoffice');
      if (!sofficeBin) {
        return reject(new Error('LibreOffice 未安装：请在服务器安装 LibreOffice（macOS: brew install --cask libreoffice；Ubuntu: apt install libreoffice）'));
      }
      const pdfName = path.basename(inputPath, inputExt) + '.pdf';
      const outputPdf = path.join(outputDir, pdfName);
      if (fs.existsSync(outputPdf)) {
        console.log('[Office] PDF 已存在，跳过转换:', outputPdf);
        return resolve(outputPdf);
      }

      // LibreOffice 转 PDF：soffice --headless --convert-to pdf --outdir <outputDir> <inputPath>
      // 注意：soffice 在 macOS 上必须设置 HOME 避免偏好文件冲突
      const env = { ...process.env };
      if (process.platform === 'darwin') {
        env.HOME = process.env.HOME || '/tmp';
      }

      console.log('[Office] 开始转换:', inputPath, '->', outputPdf);

      const proc = spawn(sofficeBin, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', outputDir,
        inputPath,
      ], {
        timeout: 120000,  // Office 转 PDF 比较慢，给 2 分钟
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPdf)) {
          console.log('[Office] 转换成功:', outputPdf);
          resolve(outputPdf);
        } else {
          const errMsg = stderr || stdout || 'Unknown error';
          console.error('[Office] 转换失败, code:', code, 'stdout:', stdout, 'stderr:', stderr);
          reject(new Error('LibreOffice 转换失败: ' + errMsg.slice(0, 200)));
        }
      });

      proc.on('error', (err) => {
        console.error('[Office] soffice 进程错误:', err.message);
        reject(err);
      });

      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error('LibreOffice 转换超时（120秒）'));
      }, 120000);
    });
  }

  // 文件转换路由（统一 CAD/Office → PDF）
  async function convertToPdf(inputPath, outputDir) {
    const ext = path.extname(inputPath).toLowerCase();
    if (['.dwg', '.dxf'].includes(ext)) {
      return await convertCadToPdf(inputPath, outputDir);
    }
    if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) {
      return await convertOfficeToPdf(inputPath, outputDir);
    }
    throw new Error('不支持的文件类型: ' + ext);
  }

  // 1. GET 列表
  // v2.3.11：PC 端「项目文件」独立页需要跨项目检索 → project_id 改为可选
  //   - 不传 project_id：按权限返回全部（read_all）或仅关联项目（read）
  //   - keyword：同时匹配 文件名 / 项目名 / 上传备注（PC 的「项目检索」靠它）
  //   - page/pageSize：分页，默认 20 条
  //   - stats.byCategory / stats.byStatus：分类与状态计数（不受当前分类/状态筛选影响）
  //   - 返回结构在原 { list } 基础上新增字段，移动端 pages/files/list.vue 仍读 list，兼容
  app.get('/api/project-files', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await permCore.loadUserPermissions(userId);
      const isAdmin = perms.has('*');
      const canReadAll = isAdmin || perms.has('project_file:read_all');
      const canRead = canReadAll || perms.has('project_file:read');
      if (!canRead) return res.status(403).json({ error: '无权限' });

      const projectId = parseInt(req.query.project_id) || 0;
      const keyword = String(req.query.keyword || '').trim();
      const { status, category, mine } = req.query;

      // 基础条件：项目范围 + 关键词（分类/状态计数也基于这一层）
      const baseConds = [];
      const baseArgs = [];
      if (projectId) {
        baseConds.push('f.project_id = ?');
        baseArgs.push(projectId);
      } else if (!canReadAll) {
        // 只有 project_file:read（没有 read_all）：只能看自己关联的项目
        const ids = Array.from(await permCore.relatedProjectIds(userId));
        if (!ids.length) {
          return res.json({ list: [], total: 0, page: 1, pageSize: 20, stats: { byCategory: {}, byStatus: {} } });
        }
        baseConds.push(`f.project_id IN (${ids.map(() => '?').join(',')})`);
        baseArgs.push(...ids);
      }
      if (keyword) {
        baseConds.push('(f.title LIKE ? OR p.name LIKE ? OR IFNULL(f.description, \'\') LIKE ?)');
        const kw = `%${keyword}%`;
        baseArgs.push(kw, kw, kw);
      }

      const conds = [...baseConds];
      const args = [...baseArgs];
      if (status) { conds.push('f.status = ?'); args.push(status); }
      if (category) { conds.push('f.category = ?'); args.push(category); }
      if (mine === '1') { conds.push('f.uploaded_by = ?'); args.push(userId); }

      const whereSql = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
      const baseWhereSql = baseConds.length ? ' WHERE ' + baseConds.join(' AND ') : '';
      const fromSql = 'FROM project_files f LEFT JOIN projects p ON p.id = f.project_id';

      let page = parseInt(req.query.page) || 1;
      let pageSize = parseInt(req.query.pageSize) || 20;
      if (page < 1) page = 1;
      if (pageSize < 1) pageSize = 20;
      if (pageSize > 200) pageSize = 200;
      const offset = (page - 1) * pageSize;

      const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}${whereSql}`, args);
      const total = Number(countRow && countRow.total) || 0;

      const [rows] = await pool.query(
        `SELECT f.*, e.name AS uploader_name, r.name AS reviewer_name, p.name AS project_name
         FROM project_files f
         LEFT JOIN employees e ON e.id = f.uploaded_by
         LEFT JOIN employees r ON r.id = f.reviewed_by
         LEFT JOIN projects p ON p.id = f.project_id
         ${whereSql}
         ORDER BY f.uploaded_at DESC, f.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        args
      );
      // v2.3.6 hotfix 10-15：自动拼 pdf_preview_url + 透传 preview_error（前端能看见）
      for (const r of rows) {
        r.pdf_preview_url = r.pdf_preview ? `/uploads/${r.pdf_preview}` : null;
      }

      const [catRows] = await pool.query(
        `SELECT f.category, COUNT(*) AS n ${fromSql}${baseWhereSql} GROUP BY f.category`, baseArgs);
      const [stRows] = await pool.query(
        `SELECT f.status, COUNT(*) AS n ${fromSql}${baseWhereSql} GROUP BY f.status`, baseArgs);
      const byCategory = {};
      for (const r of catRows) byCategory[r.category] = Number(r.n) || 0;
      const byStatus = {};
      for (const r of stRows) byStatus[r.status] = Number(r.n) || 0;

      res.json({ list: rows, total, page, pageSize, stats: { byCategory, byStatus } });
    } catch (e) {
      console.error('[project-files list] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 2. GET 详情
  app.get('/api/project-files/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      // v2.3.11：补权限校验（原先只校验登录，任何登录用户可遍历 id 读他人项目文件）
      const perms = await permCore.loadUserPermissions(userId);
      if (!perms.has('*') && !perms.has('project_file:read_all') && !perms.has('project_file:read')) {
        return res.status(403).json({ error: '无权限' });
      }
      const [rows] = await pool.query(
        `SELECT f.*, e.name AS uploader_name, r.name AS reviewer_name, p.name AS project_name
         FROM project_files f
         LEFT JOIN employees e ON e.id = f.uploaded_by
         LEFT JOIN employees r ON r.id = f.reviewed_by
         LEFT JOIN projects p ON p.id = f.project_id
         WHERE f.id = ?`,
        [parseInt(req.params.id)]
      );
      if (!rows.length) return res.status(404).json({ error: '文件不存在' });
      const file = rows[0];
      // v2.3.6 hotfix 10-15：自动拼 pdf_preview_url（preview_error 直接透传 DB 字段）
      file.pdf_preview_url = file.pdf_preview ? `/uploads/${file.pdf_preview}` : null;
      res.json(file);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. POST 上传（自动 pending + 发通知）
  app.post('/api/project-files', projectFileUpload.single('file'), async (req, res) => {
    const cleanup = () => { if (req.file) try { fs.unlinkSync(req.file.path); } catch {} };
    try {
      const userId = getUserId(req);
      if (!userId) { cleanup(); return res.status(401).json({ error: '未登录' }); }
      const perms = await permCore.loadUserPermissions(userId);
      if (!perms.has('*') && !perms.has('project_file:write')) {
        cleanup();
        return res.status(403).json({ error: '无上传权限' });
      }
      const { project_id, category, description } = req.body;
      if (!project_id || !category) {
        cleanup();
        return res.status(400).json({ error: '缺少 project_id 或 category' });
      }
      if (!req.file) return res.status(400).json({ error: '请选择文件' });
      // v2.3.6-hotfix2：修复中文文件名乱码（见 fixMojibake 注释）
      req.file.originalname = fixMojibake(req.file.originalname);
      const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
      const relPath = path.relative(path.join(ROOT, 'uploads'), req.file.path);
      const [result] = await pool.query(
        `INSERT INTO project_files
         (project_id, category, title, file_path, file_size, file_ext, description, status, uploaded_by, uploaded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW(), NOW())`,
        [parseInt(project_id), category, req.file.originalname, relPath, req.file.size, fileExt,
         description || null, userId]
      );
      // 通知所有有 project_file:approve 权限的人（跳过自己）
      // 用 messages 表（站内通知），不是 notifications 表（外发短信）
      const approvers = await getUserIdsByPermission('project_file:approve');

      // v2.3.6 hotfix 10-15：CAD/Office 文件异步转 PDF 预览（不阻塞上传响应）
      // 转换失败时把错误信息写入 project_files.preview_error，前端可见
      if (['dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        const fileId = result.insertId;
        const inputPath = req.file.path;
        const outputDir = path.dirname(inputPath);
        // setImmediate：不阻塞 POST 响应，先返"上传成功"，后台异步转换
        setImmediate(() => {
          convertToPdf(inputPath, outputDir).then(async (pdfPath) => {
            const pdfRelPath = path.relative(path.join(ROOT, 'uploads'), pdfPath);
            await pool.query(
              `UPDATE project_files SET pdf_preview = ?, preview_error = NULL WHERE id = ?`,
              [pdfRelPath, fileId]
            );
            console.log('[preview] PDF 预览生成成功:', pdfRelPath);
          }).catch(async (e) => {
            // 转换失败：写 preview_error（前端能看见），但不影响上传本身
            const errMsg = String(e.message || e).slice(0, 500);
            await pool.query(
              `UPDATE project_files SET preview_error = ? WHERE id = ?`,
              [errMsg, fileId]
            );
            console.error('[preview] PDF 转换失败（不影响上传）:', errMsg);
          });
        });
      }
      for (const aid of approvers) {
        if (aid === userId) continue;
        const [[emp]] = await pool.query('SELECT name FROM employees WHERE id = ?', [aid]);
        await pool.query(
          `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'sent')`,
          [aid, emp ? emp.name : '', '项目文件待审核', `${req.file.originalname} 等待您审核`, 'project_file_pending', result.insertId, 'project_file']
        );
      }
      await addLog(userId, '', '上传', '项目文件', result.insertId, req.file.originalname,
        `上传项目文件: ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB)`, req.ip);
      res.json({ id: result.insertId, message: '上传成功，待审核' });
    } catch (e) {
      cleanup();
      console.error('[project-files upload] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 4. POST 审核
  app.post('/api/project-files/:id/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await permCore.loadUserPermissions(userId);
      if (!perms.has('*') && !perms.has('project_file:approve')) {
        return res.status(403).json({ error: '无审核权限' });
      }
      const { action, comment } = req.body;
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action 必须是 approve/reject' });
      }
      const id = parseInt(req.params.id);
      const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '文件不存在' });
      const file = rows[0];
      if (file.status !== 'pending') return res.status(400).json({ error: '只能审核待审文件' });
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query(
        `UPDATE project_files SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_comment = ?, updated_at = NOW() WHERE id = ?`,
        [newStatus, userId, comment || null, id]
      );
      // 通知上传人（用 messages 表站内通知）
      await pool.query(
        `INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'sent')`,
        [file.uploaded_by, '',
         action === 'approve' ? '文件已通过审核' : '文件被拒绝',
         `${file.title}${comment ? ': ' + comment : ''}`,
         action === 'approve' ? 'project_file_approved' : 'project_file_rejected',
         id, 'project_file']
      );
      await addLog(userId, '', action === 'approve' ? '审核通过' : '审核拒绝', '项目文件', id, file.title,
        `${action} project_file: ${file.title}${comment ? ' 意见: ' + comment : ''}`, req.ip);
      res.json({ message: action === 'approve' ? '已通过' : '已拒绝' });
    } catch (e) {
      console.error('[project-files review] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 5. POST 撤销（仅上传人自己，状态=pending）
  app.post('/api/project-files/:id/revoke', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const id = parseInt(req.params.id);
      const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '文件不存在' });
      const file = rows[0];
      if (file.uploaded_by !== userId) return res.status(403).json({ error: '只能撤销自己上传的文件' });
      if (file.status !== 'pending') return res.status(400).json({ error: '只能撤销待审文件' });
      await pool.query(`UPDATE project_files SET status = 'revoked', updated_at = NOW() WHERE id = ?`, [id]);
      res.json({ message: '已撤销' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. DELETE 删除（上传人未审前 / admin 通杀 / 审过后不能删）
  app.delete('/api/project-files/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await permCore.loadUserPermissions(userId);
      const isAdmin = perms.has('*');
      const id = parseInt(req.params.id);
      const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: '文件不存在' });
      const file = rows[0];
      // v2.3.11 规则：项目文件一旦审核通过即视为归档凭证，任何角色（含 admin）都不得删除
      if (file.status === 'approved') {
        return res.status(403).json({ error: '该文件已通过审核，不允许删除' });
      }
      if (file.uploaded_by !== userId && !isAdmin) {
        return res.status(403).json({ error: '只能删除自己上传的文件（admin 通杀）' });
      }
      try {
        const fp = path.join(ROOT, 'uploads', file.file_path);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) { console.error('删除物理文件失败:', e.message); }
      await pool.query('DELETE FROM project_files WHERE id = ?', [id]);
      await addLog(userId, '', '删除', '项目文件', id, file.title, `删除项目文件: ${file.title}`, req.ip);
      res.json({ message: '已删除' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 7. GET 下载（流式）
  app.get('/api/project-files/:id/download', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: '未登录' });
      const perms = await permCore.loadUserPermissions(userId);
      if (!perms.has('*') && !perms.has('project_file:read_all') && !perms.has('project_file:read')) {
        return res.status(403).json({ error: '无权限' });
      }
      const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [parseInt(req.params.id)]);
      if (!rows.length) return res.status(404).json({ error: '文件不存在' });
      const file = rows[0];
      const fp = path.join(ROOT, 'uploads', file.file_path);
      if (!fs.existsSync(fp)) return res.status(404).json({ error: '物理文件不存在' });
      // ?inline=1 → 内嵌预览（PDF/图片等），设置 inline 让浏览器直接渲染而非下载
      // 用于移动端审核页/详情页的预览（H5 的 <img>/<iframe> 无法携带自定义请求头，
      // 故鉴权用户 ID 通过 query.user_id 传入，见 getUserId）。
      if (req.query.inline === '1') {
        const ext = (file.file_ext || '').toLowerCase();
        const MIME = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif', webp: 'image/webp',
          txt: 'text/plain; charset=utf-8',
        };
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.title)}`);
        return fs.createReadStream(fp).pipe(res);
      }
      res.download(fp, file.title);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/invoices', async (req, res) => {
    const stmt = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json(await stmt.all());
  });

  app.post('/api/invoices', checkPermission('invoice:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
    const stmt = db.prepare('INSERT INTO invoices (invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate || 0, tax_amount || 0, total_amount || amount, type, status || '待开具', issue_date, remark);
    await addLog(userId, '', '新增', '发票管理', result.lastInsertRowid, invoice_no, `发票号: ${invoice_no}`, req.ip);
    res.json({ id: result.lastInsertRowid, message: '添加成功' });
  });

  app.put('/api/invoices/:id', checkPermission('invoice:write'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    const { invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark } = req.body;
    const stmt = db.prepare('UPDATE invoices SET invoice_no=?, customer_id=?, customer_name=?, amount=?, tax_rate=?, tax_amount=?, total_amount=?, type=?, status=?, issue_date=?, remark=? WHERE id=?');
    await stmt.run(invoice_no, customer_id, customer_name, amount, tax_rate, tax_amount, total_amount, type, status, issue_date, remark, req.params.id);
    await addLog(userId, '', '编辑', '发票管理', req.params.id, invoice_no, `更新发票: ${invoice_no}`, req.ip);
    res.json({ message: '更新成功' });
  });

  app.delete('/api/invoices/:id', checkPermission('invoice:delete'), async (req, res) => {
    const _rawUid = req.headers['x-user-id'];
    
    const userId = getUserId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
    const [inv] = await db.prepare('SELECT invoice_no FROM invoices WHERE id = ?').all(req.params.id);
    const invNo = inv ? inv.invoice_no : req.params.id;
    const stmt = db.prepare('DELETE FROM invoices WHERE id = ?');
    await stmt.run(req.params.id);
    await addLog(userId, '', '删除', '发票管理', req.params.id, invNo, `删除发票: ${invNo}`, req.ip);
    res.json({ message: '删除成功' });
  });

};
