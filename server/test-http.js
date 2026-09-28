const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/projects?limit=3',
  method: 'GET',
  headers: {
    'x-user-id': '1',
    'x-user-name': '系统管理员',
    'x-user-role': '系统管理员'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Data:', data.slice(0, 300));
  });
});
req.on('error', e => console.error('Error:', e.message));
req.end();
