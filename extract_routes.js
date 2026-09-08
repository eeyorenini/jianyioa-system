// Extract route info from server.js
const fs = require('fs');
const content = fs.readFileSync('D:/wwwroot/jianyioa-system/server.js', 'utf8');
const lines = content.split('\n');
const routes = [];
lines.forEach((line, i) => {
  if (/app\.(get|post|put|delete|patch|use)\(/.test(line)) {
    routes.push(`${i+1}: ${line.trim()}`);
  }
});
console.log(routes.join('\n'));
console.log(`\nTotal: ${routes.length} routes`);
