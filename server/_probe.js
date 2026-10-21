const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, name: '系统管理员', username: 'admin', role_name: '超级管理员' }));
    localStorage.setItem('token', 'logged_in');
    localStorage.setItem('permissions', JSON.stringify(['*']));
  });
  page.on('request', r => { if (r.url().includes('unread-count') || r.url().includes('todo/count')) console.log('REQ', r.url().replace('http://127.0.0.1:3002','')); });
  page.on('response', async r => { if (r.url().includes('unread-count') || r.url().includes('todo/count')) { let b=''; try{b=(await r.text()).slice(0,80)}catch{}; console.log('RES', r.status(), r.url().replace('http://127.0.0.1:3002',''), b); } });
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 6000));
  console.log('__bd =', JSON.stringify(await page.evaluate(() => window.__bd || null)));
  console.log('bell badge =', await page.$eval('.bell-badge', e => e.textContent.trim()).catch(() => 'none'));
  console.log('menu badges =', JSON.stringify(await page.$$eval('.menu-badge', e => e.map(x => x.textContent.trim()))));
  await browser.close();
})();
