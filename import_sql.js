// Run SQL file via mysql2 (after migrate_full.js generates the file)
const mysql = require('D:/wwwroot/jianyioa-system/node_modules/mysql2');
const fs = require('fs');

const OUTPUT_PATH = 'D:/wwwroot/jianyioa-system/migrate_final.sql';

async function main() {
  const content = fs.readFileSync(OUTPUT_PATH, 'utf8');
  
  // Split by semicolon at end of line
  const stmts = content.split(/;\s*\n/).filter(s => s.trim().length > 0 && !s.startsWith('--'));
  
  // Add back semicolons
  const statements = stmts.map(s => s.trim() + ';');

  // Filter out header/footer
  const inserts = statements.filter(s => 
    s.startsWith('INSERT') || s.startsWith('DELETE')
  );

  console.log(`[1] Total statements: ${statements.length}, Inserts: ${inserts.length}`);

  const conn = mysql.createConnection({
    host: '127.0.0.1',
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  await new Promise(r => conn.connect(r));
  console.log('[2] Connected to MySQL');

  // Execute each INSERT/DELETE
  let success = 0, errors = 0;
  for (const stmt of inserts) {
    try {
      await new Promise((res, rej) => conn.query(stmt, (e) => {
        if (e) {
          // Log first few errors
          if (errors < 3) console.log(`  ERR: ${stmt.substring(0, 60)} -> ${e.message.substring(0, 100)}`);
          errors++;
          res(); // continue
        } else {
          success++;
          res();
        }
      }));
    } catch (e) { /* ignore */ }
  }

  conn.end();
  console.log(`[3] Done! Success: ${success}, Errors: ${errors}`);
}

main().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
