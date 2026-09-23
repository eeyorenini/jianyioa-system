// 测试项目API返回的数据
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 10086,
  path: '/api/projects?customer_id=5',
  method: 'GET',
  headers: {
    'x-user-role': 'admin',
    'x-user-id': '1'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const projects = JSON.parse(data);
    if (Array.isArray(projects) && projects.length > 0) {
      console.log('项目字段:', Object.keys(projects[0]));
      console.log('第一个项目:', JSON.stringify(projects[0], null, 2));
    } else {
      console.log('无项目数据');
    }
  });
});

req.on('error', (e) => console.error('错误:', e.message));
req.end();
