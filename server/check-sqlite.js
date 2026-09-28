const Database = require('better-sqlite3');
const db = new Database('./jianyioa.db');

const projects = db.prepare('SELECT id, name, status, creator_id FROM projects LIMIT 10').all();
console.log('Projects:', JSON.stringify(projects, null, 2));

const employees = db.prepare('SELECT id, name, role FROM employees LIMIT 5').all();
console.log('Employees:', JSON.stringify(employees, null, 2));
