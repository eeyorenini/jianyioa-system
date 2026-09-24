const mysql = require('mysql2/promise');

async function main() {
  // 连接远程数据库
  const connection = await mysql.createConnection({
    host: '116.204.19.53',
    port: 3306,
    user: 'jianyioa',
    password: 'zpfbAsxyA76P2ZHw',
    database: 'jianyioa'
  });

  console.log('✅ 数据库连接成功');

  // 1. 检查表结构
  console.log('\n📋 检查 project_logs 表结构...');
  const [columns] = await connection.query('DESCRIBE project_logs');
  console.log('当前字段:');
  columns.forEach(col => {
    console.log(`  - ${col.Field} (${col.Type})`);
  });

  // 2. 检查是否缺少字段
  const fieldNames = columns.map(c => c.Field);
  const needFields = ['worker_count', 'work_type', 'tomorrow_plan', 'note'];
  const missingFields = needFields.filter(f => !fieldNames.includes(f));

  if (missingFields.length > 0) {
    console.log('\n⚠️ 缺少字段:', missingFields);

    // 添加缺失的字段
    console.log('\n🔧 添加缺失字段...');
    for (const field of missingFields) {
      let sql;
      if (field === 'worker_count') {
        sql = 'ALTER TABLE project_logs ADD COLUMN worker_count VARCHAR(50) DEFAULT NULL';
      } else if (field === 'work_type') {
        sql = 'ALTER TABLE project_logs ADD COLUMN work_type VARCHAR(100) DEFAULT NULL';
      } else if (field === 'tomorrow_plan') {
        sql = 'ALTER TABLE project_logs ADD COLUMN tomorrow_plan TEXT DEFAULT NULL';
      } else if (field === 'note') {
        sql = 'ALTER TABLE project_logs ADD COLUMN note TEXT DEFAULT NULL';
      }

      try {
        await connection.query(sql);
        console.log(`  ✅ 添加成功: ${field}`);
      } catch (err) {
        console.log(`  ❌ 添加失败: ${field} - ${err.message}`);
      }
    }
  } else {
    console.log('\n✅ 所有字段都已存在');
  }

  // 3. 验证字段
  console.log('\n📋 验证字段...');
  const [cols] = await connection.query('DESCRIBE project_logs');
  const allFields = cols.map(c => c.Field);
  console.log('所有字段:', allFields.join(', '));

  // 4. 测试插入数据
  console.log('\n🧪 测试插入日志数据...');
  const testData = {
    project_id: 1,
    content: '测试：水电安装完成，厨房水管铺设中',
    operator: '测试用户',
    images: JSON.stringify([]),
    worker_count: '3',
    work_type: '水电工',
    tomorrow_plan: '继续铺设水管，安装开关插座',
    note: '材料已到位'
  };

  try {
    const [result] = await connection.query(
      `INSERT INTO project_logs (project_id, content, operator, images, worker_count, work_type, tomorrow_plan, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [testData.project_id, testData.content, testData.operator, testData.images,
       testData.worker_count, testData.work_type, testData.tomorrow_plan, testData.note]
    );

    console.log('  ✅ 插入成功，ID: ' + result.insertId);

    // 5. 读取验证
    const [rows] = await connection.query(
      'SELECT * FROM project_logs WHERE id = ?',
      [result.insertId]
    );

    console.log('\n📊 读取验证:');
    const log = rows[0];
    console.log(`  - content: ${log.content}`);
    console.log(`  - worker_count: ${log.worker_count}`);
    console.log(`  - work_type: ${log.work_type}`);
    console.log(`  - tomorrow_plan: ${log.tomorrow_plan}`);
    console.log(`  - note: ${log.note}`);

    // 清理测试数据
    await connection.query('DELETE FROM project_logs WHERE id = ?', [result.insertId]);
    console.log('\n🧹 已清理测试数据');

  } catch (err) {
    console.log(`  ❌ 插入失败: ${err.message}`);
  }

  await connection.end();
  console.log('\n✅ 完成');
}

main().catch(console.error);
