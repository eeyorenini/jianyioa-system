const Database = require('better-sqlite3');
const db = Database('/Users/gtamer/Desktop/jianyioa-system/server/jianyioa.db');
const row = db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").get();
if (row) {
  const v = JSON.parse(row.setting_value);
  console.log(JSON.stringify(v));
}
db.close();
