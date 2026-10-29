'use strict';
/**
 * 外部工具探测（FreeCAD / LibreOffice）
 * ---------------------------------------------------------------
 * 从 server.js 抽出的模块（2026-10-29，渐进拆分第 3 步）。
 * 这是第一个「带模块内部状态」的拆分：路径探测结果缓存在本模块闭包里，
 * 启动时探测一次，之后所有调用直接读缓存，不再碰文件系统。
 *
 * 用途：PDF 预览 / Office 转 PDF。
 *   · FreeCAD  → .FCStd 等三维模型转 PDF
 *   · LibreOffice headless → .doc/.docx/.xls/.xlsx/.ppt/.pptx 转 PDF
 * 缺失不致命：返回 null，调用方回 503，不影响上传和其他功能。
 *
 * 依赖：只有 node 内置 fs。不碰数据库、不碰 req/res。
 */

const fs = require('fs');

// 探测二进制是否安装（existsSync 比 spawn ENOENT 错误更友好）
function whichBinary(candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

// 平台对应的 FreeCAD 路径候选（按优先级排序）
function freecadCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/FreeCAD.app/Contents/MacOS/FreeCAD',
      '/Applications/FreeCAD.app/Contents/Resources/bin/freecad',
      '/usr/local/bin/freecad',
      '/opt/homebrew/bin/freecad',
    ];
  }
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\FreeCAD\\bin\\FreeCAD.exe',
      'C:\\Program Files\\FreeCAD 0.21\\bin\\FreeCAD.exe',
      'C:\\Program Files (x86)\\FreeCAD\\bin\\FreeCAD.exe',
    ];
  }
  // Linux
  return [
    '/usr/bin/freecad',
    '/usr/local/bin/freecad',
    '/opt/freecad/bin/freecad',
    '/snap/bin/freecad',
  ];
}

// 平台对应的 LibreOffice 路径候选
function libreofficeCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/usr/local/bin/soffice',
      '/opt/homebrew/bin/soffice',
    ];
  }
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
  }
  // Linux
  return [
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/usr/local/bin/soffice',
    '/opt/libreoffice/program/soffice',
  ];
}

// 探测结果缓存（模块内部状态，首次调用时填充）
let _freecadPath = null;
let _libreofficePath = null;
let _toolsChecked = false;

function getToolPath(tool) {
  if (!_toolsChecked) {
    _freecadPath = whichBinary(freecadCandidates());
    _libreofficePath = whichBinary(libreofficeCandidates());
    _toolsChecked = true;
    console.log('[tools] FreeCAD:', _freecadPath || '❌ 未安装');
    console.log('[tools] LibreOffice:', _libreofficePath || '❌ 未安装');
  }
  return tool === 'freecad' ? _freecadPath : _libreofficePath;
}

module.exports = {
  whichBinary,
  freecadCandidates,
  libreofficeCandidates,
  getToolPath,
};
