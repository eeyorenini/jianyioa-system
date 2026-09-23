module.exports = {
  apps: [{
    name: 'jianyioa-mobile',
    script: 'npm',
    args: 'run dev:h5',
    cwd: '/Users/gtamer/Desktop/jianyioa-system/jianyioa-app/mobile',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development'
    }
  }]
};
