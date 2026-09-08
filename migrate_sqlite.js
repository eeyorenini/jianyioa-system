// Migrate SQLite data to MySQL INSERT statements
const Database = require('/Users/gtamer/Desktop/test/oa-system/server/node_modules/better-sqlite3');
const fs = require('fs');

const sqliteDb = new Database('/Users/gtamer/Desktop/test/oa-system/server/oa.db');
const outputFile = '/Users/gtamer/Desktop/jianyioa-system/migrate_data.sql';

// Tables to migrate (skip operation_logs as it can be large and is less critical)
const tablesToMigrate = [
  'departments', 'roles', 'permissions', 'role_permissions',
  'employees', 'customers', 'customer_pool', 'customer_follow',
  'contract_templates', 'contract_variables',
  'contracts', 'quotes', 'budgets',
  'projects', 'project_stages', 'project_logs', 'design_measurements',
  'buildings', 'channels', 'suppliers', 'materials', 'main_materials',
  'material_orders', 'material_in', 'material_out', 'purchase_items',
  'finance', 'invoices', 'purchases',
  'approvals', 'acceptance', 'inspections', 'rectification_issues', 'warranties',
  'attendance', 'notices', 'reports', 'marketing_cases', 'dashboard_stats',
  'operation_logs'
];

let sql = '-- SQLite to MySQL Migration Data\n-- Generated from oa.db\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n';

// Helper to convert SQLite value to MySQL format
function toMySQLValue(val, type) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 1 : 0;
  // String - escape single quotes
  const str = String(val);
  return "'" + str.replace(/'/g, "''") + "'";
}

// Get table schema to determine column types
const tableInfo = {};
const pragmaStmt = sqliteDb.prepare("PRAGMA table_info('#TABLE#')");
tablesToMigrate.forEach(table => {
  try {
    const cols = pragmaStmt.all(table);
    tableInfo[table] = {};
    cols.forEach(col => {
      tableInfo[table][col.name] = col.type;
    });
  } catch (e) {
    tableInfo[table] = {};
  }
});

let totalRows = 0;
let totalTables = 0;

tablesToMigrate.forEach(table => {
  try {
    const rows = sqliteDb.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) return;

    totalTables++;
    totalRows += rows.length;

    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      sql += `-- Table: ${table} (${rows.length} rows)\n`;
      sql += `DELETE FROM ${table};\n`;

      const insertStmt = sqliteDb.prepare(`SELECT * FROM "${table}"`);
      const allRows = insertStmt.all();

      allRows.forEach(row => {
        const values = cols.map(col => toMySQLValue(row[col], tableInfo[table][col]));
        sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values.join(', ')});\n`;
      });
      sql += '\n';
    }
    console.log(`✓ ${table}: ${rows.length} rows`);
  } catch (e) {
    console.error(`✗ ${table}: ERROR - ${e.message}`);
  }
});

sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
sql += '-- Migration complete\n';

fs.writeFileSync(outputFile, sql, 'utf8');

console.log(`\nDone! Exported ${totalRows} rows from ${totalTables} tables to ${outputFile}`);
console.log(`File size: ${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB`);

sqliteDb.close();
