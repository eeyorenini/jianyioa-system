// 测试郑大大登录
const http = require('http');

const postData = JSON.stringify({
  phone: '13693365077',
  name: '郑大大'
});

const options = {
  hostname: 'localhost',
  port: 10086,
  path: '/api/customers/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('状态码:', res.statusCode);
    console.log('响应:', JSON.parse(data));
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e.message);
  console.log('提示: 后端可能没有启动或端口不对');
});

req.write(postData);
req.end();
