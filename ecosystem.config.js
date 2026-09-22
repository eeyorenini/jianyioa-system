module.exports = {
  apps: [
    {
      name: 'jianyioa-backend',
      script: 'server/server.js',
      cwd: '/Users/gtamer/Desktop/jianyioa-system',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'jianyioa-frontend',
      script: 'npx',
      args: 'vite --host 0.0.0.0 --port 5555',
      cwd: '/Users/gtamer/Desktop/jianyioa-system/web',
      instances: 1,
      autorestart: true,
      watch: false,
      interpreter: 'none'
    },
    {
      name: 'jianyioa-mobile',
      script: 'npx',
      args: 'vite --host 0.0.0.0 --port 10086',
      cwd: '/Users/gtamer/Desktop/jianyioa-app/mobile',
      instances: 1,
      autorestart: true,
      watch: false,
      interpreter: 'none'
    },
    {
      name: 'jianyioa-frpc',
      script: '/usr/local/bin/frpc',
      args: '-c /Users/gtamer/Desktop/jianyioa-system/frpc.ini',
      instances: 1,
      autorestart: true,
      watch: false,
      interpreter: 'none'
    }
  ]
};
