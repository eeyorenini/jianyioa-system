// Patch Apache vhost config to add /uploads proxy
const fs = require('fs');
const path = 'D:/BtSoft/apache/conf/extra/httpd-vhosts.conf';
let content = fs.readFileSync(path, 'utf8');

const proxyHTTPS = `
        ProxyPass /uploads/ http://127.0.0.1:3001/uploads/
        ProxyPassReverse /uploads/ http://127.0.0.1:3001/uploads/
`;

const proxyHTTP = `
    # Proxy: handle /api and /uploads before any filesystem access
    <IfModule mod_proxy.c>
        ProxyRequests Off
        <Proxy *>
            Require all granted
        </Proxy>
        ProxyPass /api/ http://127.0.0.1:3001/api/
        ProxyPassReverse /api/ http://127.0.0.1:3001/api/
        ProxyPass /uploads/ http://127.0.0.1:3001/uploads/
        ProxyPassReverse /uploads/ http://127.0.0.1:3001/uploads/
    </IfModule>
`;

// Add /uploads proxy to HTTPS vhost
if (!content.includes('ProxyPass /uploads/')) {
    content = content.replace(
        /ProxyPassReverse \/api\/ http:\/\/127\.0\.0\.1:3001\/api\/\s*<\/IfModule>/,
        'ProxyPassReverse /api/ http://127.0.0.1:3001/api/' + proxyHTTPS + '    </IfModule>'
    );
    console.log('Added /uploads to HTTPS vhost');
}

// Add full proxy block to HTTP vhost (port 80) before # Static files
if (!content.includes('# Proxy: handle /api and /uploads')) {
    content = content.replace(
        /# Static files\s*\n    DocumentRoot "d:\/wwwroot\/erp\.fujinwanjia\.com"/,
        '# Proxy: handle /api and /uploads before any filesystem access\n    <IfModule mod_proxy.c>\n        ProxyRequests Off\n        <Proxy *>\n            Require all granted\n        </Proxy>\n        ProxyPass /api/ http://127.0.0.1:3001/api/\n        ProxyPassReverse /api/ http://127.0.0.1:3001/api/\n        ProxyPass /uploads/ http://127.0.0.1:3001/uploads/\n        ProxyPassReverse /uploads/ http://127.0.0.1:3001/uploads/\n    </IfModule>\n\n    # Static files\n    DocumentRoot "d:/wwwroot/erp.fujinwanjia.com"'
    );
    console.log('Added proxy block to HTTP vhost');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done patching httpd-vhosts.conf');
