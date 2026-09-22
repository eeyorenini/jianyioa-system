module.exports = {
  apps: [{
    name: 'jianyioa-pc',
    script: 'npm',
    args: 'run dev',
    cwd: '/Users/gtamer/Desktop/jianyioa-system/web',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development'
    }
  }]
};
