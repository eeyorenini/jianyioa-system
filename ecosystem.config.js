// 建亿 OA · PM2 生态配置（绝对路径版，兼容 nvm/无 brew 场景）
// 启动: pm2 start ecosystem.config.js
// 停止: pm2 stop ecosystem.config.js
// 重载: pm2 reload ecosystem.config.js
// 自启: pm2 save && pm2 startup (按提示执行输出的那条命令)

const path = require('path');

const ROOT = '/Users/gtamer/Desktop/jianyioa-system';
// 用 nvm 当前版本（项目固定 nvm；如需换版本改这一行）
const NVM_BIN = '/Users/gtamer/.nvm/versions/node/v24.21.0/bin';
const NODE_BIN = `${NVM_BIN}/node`;
const NPM_BIN = `${NVM_BIN}/npm`;

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
      env: { NODE_ENV: 'development' }
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
      // frpc 二进制没装就 disabled=true，跳过
      enabled: require('fs').existsSync('/Users/gtamer/bin/frpc')
    }
  ]
};