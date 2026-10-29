// 建亿 OA · PM2 生态配置（绝对路径版，自动探测 node/npm，兼容 nvm/brew 场景）
// 启动: pm2 start ecosystem.config.js
// 停止: pm2 stop ecosystem.config.js
// 重载: pm2 reload ecosystem.config.js
// 自启: pm2 save && pm2 startup (按提示执行输出的那条命令)

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = '/Users/gtamer/Desktop/jianyioa-system';

// 自动探测 node/npm 路径（按优先级：环境变量覆盖 > nvm 当前版本 > /usr/local/bin > PATH）
function detectBin(name) {
  if (process.env[`${name.toUpperCase()}_BIN_OVERRIDE`]) {
    return process.env[`${name.toUpperCase()}_BIN_OVERRIDE`];
  }
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin && fs.existsSync(`${nvmBin}/${name}`)) {
    return `${nvmBin}/${name}`;
  }
  if (fs.existsSync(`/usr/local/bin/${name}`)) {
    return `/usr/local/bin/${name}`;
  }
  try {
    return execSync(`/usr/bin/env which ${name}`, { encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Error(`未找到 ${name}，请先安装 Node.js 或设置 ${name.toUpperCase()}_BIN_OVERRIDE 环境变量`);
  }
}

const NODE_BIN = detectBin('node');
const NPM_BIN = detectBin('npm');

// 本地 Mac（Intel）缺少 poppler，upload-pdf 依赖 pdfinfo/pdftoppm。
// 用 micromamba 装到了 ~/micromamba/envs/poppler/bin，这里仅在目录存在时注入 PATH。
// 服务器（Windows 自带 poppler）不存在该目录，配置原样生效，不受影响。
const POPPLER_BIN = path.join(process.env.HOME || '', 'micromamba/envs/poppler/bin');
const BACKEND_ENV = { NODE_ENV: 'development' };
if (fs.existsSync(POPPLER_BIN)) {
  BACKEND_ENV.PATH = `${POPPLER_BIN}:${process.env.PATH}`;
  console.log('[ecosystem] 注入 poppler PATH:', POPPLER_BIN);
}

// 本机 python3 指向「CommandLineTools」的解释器（3.9.6），
// 主材 Excel 导入/导出（main-materials.js）用 spawnSync('python3') 调它，
// 需要 openpyxl / pandas —— 已装进该解释器的 user-site。
//
// ⚠️ 为什么必须显式指定：
// PM2 daemon 由 launchd 拉起，PATH 是系统默认（/usr/bin:/bin:...），
// 但 `pm2 restart --update-env` 会把**当前 shell 的 PATH** 灌进进程，
// 而 WorkBuddy 环境里托管的 python3（3.13.12）排在 /usr/bin 前面，
// 后端就会 spawn 到那个没有 openpyxl 的解释器 → 导出报 ModuleNotFoundError。
// 这里把 CLT 解释器目录提到 PATH 最前面，保证无论怎么重启都命中同一个 python。
const CLT_PYTHON_DIR = '/Library/Developer/CommandLineTools/usr/bin';
if (fs.existsSync(path.join(CLT_PYTHON_DIR, 'python3'))) {
  BACKEND_ENV.PATH = `${CLT_PYTHON_DIR}:${BACKEND_ENV.PATH || process.env.PATH}`;
  console.log('[ecosystem] 注入 python3 PATH:', CLT_PYTHON_DIR);
}

module.exports = {
  apps: [
    {
      name: 'jianyioa-backend',
      cwd: path.join(ROOT, 'server'),
      script: path.join(ROOT, 'server/server.js'),
      interpreter: NODE_BIN,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      out_file: path.join(ROOT, '.run-logs/backend.out.log'),
      error_file: path.join(ROOT, '.run-logs/backend.err.log'),
      env: BACKEND_ENV
    },
    {
      name: 'jianyioa-frontend',
      cwd: path.join(ROOT, 'web'),
      script: path.join(ROOT, 'web/node_modules/.bin/vite'),
      args: '--host 0.0.0.0 --port 5555',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      out_file: path.join(ROOT, '.run-logs/frontend.out.log'),
      error_file: path.join(ROOT, '.run-logs/frontend.err.log')
    },
    {
      name: 'jianyioa-mobile',
      cwd: path.join(ROOT, 'jianyioa-app/mobile'),
      script: NPM_BIN,
      args: 'run dev:h5',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      out_file: path.join(ROOT, '.run-logs/mobile.out.log'),
      error_file: path.join(ROOT, '.run-logs/mobile.err.log')
    },
    {
      name: 'jianyioa-frpc',
      cwd: ROOT,
      script: '/Users/gtamer/bin/frpc',
      args: '-c ' + path.join(ROOT, 'jianyioa-app/mobile/frpc.ini'),
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      // ⚠️ 必须清掉代理环境变量：frpc 会把 HTTP_PROXY/http_proxy 当成
      // server_addr 的默认值，导致「dial tcp 127.0.0.1:51614: connection refused」
      // 而连不上真正的 frps（116.204.19.53:7000），进程秒退反复重启。
      env: { HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
      // frpc 二进制没装就 disabled=true，跳过
      enabled: require('fs').existsSync('/Users/gtamer/bin/frpc')
    }
  ]
};