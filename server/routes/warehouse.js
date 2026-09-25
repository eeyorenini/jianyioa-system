'use strict';

const express = require('express');
const router = express.Router();

const { getUserId, checkPermission, isAdmin, getCurrentUser } = require('../middleware/auth');
const { addLog } = require('../utils/addLog');
const { pool } = require('../db-mysql-async');
const { notifyProject, sendApprovalNotification, sendAppNotification } = require('../utils/notify');
const { sendAliyunSms, addAliyunSmsTemplate } = require('../utils/sms');

router.get('/api/materials', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'warehouse');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM materials ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM materials WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});


router.post('/api/materials', checkPermission('warehouse:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  const stmt = db.prepare('INSERT INTO materials (code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(code, name, category, unit, quantity || 0, price || 0, cost_price || 0, supplier, min_stock || 0, location, userId);
  await addLog(userId, '', '新增', '材料管理', result.lastInsertRowid, name, `材料名称: ${name}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/materials/:id', checkPermission('warehouse:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM materials WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '材料不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const stmt = db.prepare('UPDATE materials SET code=?, name=?, category=?, unit=?, quantity=?, price=?, cost_price=?, supplier=?, min_stock=?, location=? WHERE id=?');
  await stmt.run(code, name, category, unit, quantity, price, cost_price, supplier, min_stock, location, req.params.id);
  await addLog(userId, '', '编辑', '材料管理', req.params.id, name, `更新材料: ${name}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/materials/:id', checkPermission('warehouse:delete'), async (req, res) => {
    
  const userId = getUserId(req);
  const [m] = await db.prepare('SELECT name, creator_id FROM materials WHERE id = ?').all(req.params.id);
  if (!m) return res.status(404).json({ error: '记录不存在' });
  if (m.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const mName = m.name;
  const stmt = db.prepare('DELETE FROM materials WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '材料管理', req.params.id, mName, `删除材料: ${mName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.post('/api/materials/in', checkPermission('warehouse:write'), async (req, res) => {
    
  const userId = getUserId(req);
  const { material_id, quantity, unit_price, supplier, operator, note, date } = req.body;
  const stmt = db.prepare('INSERT INTO material_in (material_id, quantity, unit_price, supplier, operator, note, date, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, unit_price || 0, supplier, operator, note, date, userId);
  await db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(quantity, material_id);
  const [matIn] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
  const inId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '材料入库', inId, matIn?.name || material_id, `材料入库: ${matIn?.name || material_id}, 数量: ${quantity}`, req.ip);

  // 发送应用内通知：查找使用了该材料的在建项目，通知相关人
  try {
    const [recentOut] = await db.prepare('SELECT project_id FROM material_out WHERE material_id = ? ORDER BY id DESC LIMIT 1').all(material_id);
    if (recentOut && recentOut.project_id) {
      const [proj] = await db.prepare(`
        SELECT p.*,
          des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
          sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
          mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
        FROM projects p
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?
      `).all(recentOut.project_id);

      const targets = [];
      if (proj) {
        if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
        if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
        if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      }
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

      if (targets.length > 0) {
        const content = `【${matIn?.name || '材料'}】已入库，数量：${quantity}，供应商：${supplier || '未知'}`;
        sendAppNotification('material_in', '材料已入库', content, inId, 'material_in', targets).catch(console.error);
      }
    }
  } catch (err) {
    console.error('material_in notification error:', err);
  }

  res.json({ message: '入库成功' });
});


router.post('/api/materials/out', checkPermission('warehouse:write'), async (req, res) => {
  const userId = getUserId(req);
  const { material_id, quantity, project_id, operator, note, date } = req.body;

  // 库存校验：出库数量不能超过当前库存
  const [material] = await db.prepare('SELECT quantity FROM materials WHERE id = ?').all(material_id);
  if (!material) {
    return res.status(404).json({ error: '材料不存在' });
  }
  if (material.quantity < quantity) {
    return res.status(400).json({ error: `库存不足，当前库存 ${material.quantity}，申请出库 ${quantity}` });
  }

  const stmt = db.prepare('INSERT INTO material_out (material_id, quantity, project_id, operator, note, date) VALUES (?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, project_id, operator, note, date);
  await db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(quantity, material_id);
  const [matOut] = await db.prepare('SELECT name FROM materials WHERE id = ?').all(material_id);
  const outId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '材料出库', outId, matOut?.name || material_id, `材料出库: ${matOut?.name || material_id}, 数量: ${quantity}`, req.ip);

  // 发送应用内通知：通知项目相关人
  if (project_id) {
    try {
      const [proj] = await db.prepare(`
        SELECT p.*,
          des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
          sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
          mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id
        FROM projects p
        LEFT JOIN employees des ON p.designer_id = des.id
        LEFT JOIN employees sup ON p.supervisor_id = sup.id
        LEFT JOIN employees mgr ON p.manager_id = mgr.id
        WHERE p.id = ?
      `).all(project_id);

      const targets = [];
      if (proj) {
        if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
        if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
        if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      }
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });

      if (targets.length > 0) {
        const content = `【${matOut?.name || '材料'}】已出库，数量：${quantity}，用于项目ID：${project_id}`;
        sendAppNotification('material_out', '材料已出库', content, outId, 'material_out', targets).catch(console.error);
      }
    } catch (err) {
      console.error('material_out notification error:', err);
    }
  }

  res.json({ message: '出库成功' });
});


router.get('/api/main-materials', async (req, res) => {
  const { keyword = '', category = '', page = 1, limit = 20 } = req.query;
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 20;
  const offset = (pageNum - 1) * pageSize;

  const conditions = [];
  const params = [];
  if (!hasAll) {
    conditions.push('1=0'); // 无 read_all 权限则无数据
  }
  if (keyword) {
    conditions.push('(code LIKE ? OR name LIKE ? OR brand LIKE ? OR model LIKE ?)');
    const k = `%${keyword}%`;
    params.push(k, k, k, k);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const whereSql = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM main_materials' + whereSql);
  const total = (await countStmt.get(...params))?.total || 0;

  let sql = 'SELECT * FROM main_materials' + whereSql + ' ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?';
  const stmt = db.prepare(sql);
  const list = await stmt.all(...params, pageSize, offset);

  res.json({ list, total, page: pageNum, limit: pageSize });
});


router.get('/api/main-materials/categories', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT category FROM main_materials').all();
    const categories = [...new Set(rows.map(r => r.category).filter(c => c && c.trim()))];
    categories.sort();
    res.json(categories);
  } catch(e) {
    console.log('categories error:', e.message, e.stack);
    res.json([]);
  }
});


router.post('/api/main-materials', async (req, res) => {
    
  const userId = getUserId(req);
  const data = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed, creator_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = await stmt.run(
    data.code || '',
    data.name || '',
    Number(data.original_price || 0),
    Number(data.cost_price || 0),
    Number(data.cost_price2 || 0),
    Number(data.quote_price || 0),
    Number(data.contract_price || 0),
    data.quote_unit || '片',
    Number(data.exchange_rate || 1),
    data.purchase_unit || '',
    Number(data.loss_rate || 0),
    Number(data.loss_amount || 0),
    data.warranty_period || '',
    data.stock_period || '',
    data.specification || '',
    data.model || '',
    data.color || '',
    data.spec_alternative || '',
    data.model_alternative || '',
    data.color_alternative || '',
    data.brand || '',
    Number(data.sort_order || 0),
    data.remark || '',
    data.acceptance_remark || '',
    data.contract_remark || '',
    data.other_remark || '',
    data.position || '',
    data.package_name || '',
    Number(data.upgrade_profit_rate || 0),
    Number(data.internal_control_price || 0),
    data.combo || '',
    data.limit_formula || '',
    data.quote_formula || '',
    data.category || '',
    Number(data.is_visible ?? 1),
    Number(data.is_fixed ?? 0),
    userId
  );
  await addLog(userId, '', '新增', '主材管理', result.lastInsertRowid, data.name || '', `主材: ${data.name || result.lastInsertRowid}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});


router.put('/api/main-materials/:id', async (req, res) => {
    
  const userId = getUserId(req);
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM main_materials WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '主材不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });
  const data = req.body || {};
  const stmt = db.prepare(`
    UPDATE main_materials SET
      code=?, name=?, original_price=?, cost_price=?, cost_price2=?, quote_price=?, contract_price=?,
      quote_unit=?, exchange_rate=?, purchase_unit=?, loss_rate=?, loss_amount=?, warranty_period=?, stock_period=?,
      specification=?, model=?, color=?, spec_alternative=?, model_alternative=?, color_alternative=?, brand=?,
      sort_order=?, remark=?, acceptance_remark=?, contract_remark=?, other_remark=?, position=?, package_name=?,
      upgrade_profit_rate=?, internal_control_price=?, combo=?, limit_formula=?, quote_formula=?, category=?,
      is_visible=?, is_fixed=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);
  await stmt.run(
    data.code || '',
    data.name || '',
    Number(data.original_price || 0),
    Number(data.cost_price || 0),
    Number(data.cost_price2 || 0),
    Number(data.quote_price || 0),
    Number(data.contract_price || 0),
    data.quote_unit || '片',
    Number(data.exchange_rate || 1),
    data.purchase_unit || '',
    Number(data.loss_rate || 0),
    Number(data.loss_amount || 0),
    data.warranty_period || '',
    data.stock_period || '',
    data.specification || '',
    data.model || '',
    data.color || '',
    data.spec_alternative || '',
    data.model_alternative || '',
    data.color_alternative || '',
    data.brand || '',
    Number(data.sort_order || 0),
    data.remark || '',
    data.acceptance_remark || '',
    data.contract_remark || '',
    data.other_remark || '',
    data.position || '',
    data.package_name || '',
    Number(data.upgrade_profit_rate || 0),
    Number(data.internal_control_price || 0),
    data.combo || '',
    data.limit_formula || '',
    data.quote_formula || '',
    data.category || '',
    Number(data.is_visible ?? 1),
    Number(data.is_fixed ?? 0),
    req.params.id
  );
  await addLog(userId, '', '编辑', '主材管理', req.params.id, data.name || '', `更新主材: ${data.name || req.params.id}`, req.ip);
  res.json({ message: '更新成功' });
});


router.delete('/api/main-materials/:id', async (req, res) => {
    
  const userId = getUserId(req);
  const [m] = await db.prepare('SELECT name, creator_id FROM main_materials WHERE id = ?').all(req.params.id);
  if (!m) return res.status(404).json({ error: '记录不存在' });
  if (m.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
  const mName = m.name;
  const stmt = db.prepare('DELETE FROM main_materials WHERE id = ?');
  await stmt.run(req.params.id);
  await addLog(userId, '', '删除', '主材管理', req.params.id, mName, `删除主材: ${mName}`, req.ip);
  res.json({ message: '删除成功' });
});


router.post('/api/main-materials/batch-upsert', async (req, res) => {
  const userId = getUserId(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const insertStmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    if (!row.name) continue;
    await insertStmt.run(
      row.code || '',
      row.name || '',
      Number(row.original_price || 0),
      Number(row.cost_price || 0),
      Number(row.cost_price2 || 0),
      Number(row.quote_price || 0),
      Number(row.contract_price || 0),
      row.quote_unit || '片',
      Number(row.exchange_rate || 1),
      row.purchase_unit || '',
      Number(row.loss_rate || 0),
      Number(row.loss_amount || 0),
      row.warranty_period || '',
      row.stock_period || '',
      row.specification || '',
      row.model || '',
      row.color || '',
      row.spec_alternative || '',
      row.model_alternative || '',
      row.color_alternative || '',
      row.brand || '',
      Number(row.sort_order || 0),
      row.remark || '',
      row.acceptance_remark || '',
      row.contract_remark || '',
      row.other_remark || '',
      row.position || '',
      row.package_name || '',
      Number(row.upgrade_profit_rate || 0),
      Number(row.internal_control_price || 0),
      row.combo || '',
      row.limit_formula || '',
      row.quote_formula || '',
      row.category || '',
      Number(row.is_visible ?? 1),
      Number(row.is_fixed ?? 0)
    );
  }
  await addLog(userId, '', '新增', '主材管理', null, '批量导入', `批量导入主材 ${rows.length} 条`, req.ip);
  res.json({ message: '导入成功', count: rows.length });
});


router.post('/api/main-materials/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: '未上传文件' });
    return;
  }
  const originalExt = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.xlsx', '.xlsm', '.xltx', '.xltm', '.xls'].includes(originalExt)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
    }
    res.status(400).json({ message: '仅支持Excel文件导入' });
    return;
  }
  if (originalExt === '.xls') {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
    }
    res.status(400).json({ message: '当前仅支持xlsx格式，请将xls另存为xlsx后再导入' });
    return;
  }
  const parseFilePath = `${req.file.path}${originalExt || '.xlsx'}`;
  fs.copyFileSync(req.file.path, parseFilePath);
  const script = `
import json,sys,pandas as pd
file_path=sys.argv[1]
try:
    df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
except:
    try:
        df=pd.read_excel(file_path,sheet_name=0,engine='xlrd')
    except:
        df=pd.read_excel(file_path,sheet_name=0,engine='openpyxl')
df=df.fillna('')
headers=[str(c).strip() if pd.notna(c) else '' for c in df.columns]
mapping={
  '名称':'name','原价':'original_price','核算价':'cost_price','成本价':'cost_price2','报价':'quote_price','发包价':'contract_price',
  '报价单位':'quote_unit','兑换比例':'exchange_rate','采购单位':'purchase_unit','损耗比例':'loss_rate','损耗金额':'loss_amount',
  '保修时长':'warranty_period','备货周期':'stock_period','规格':'specification','型号':'model','颜色':'color',
  '规格备选':'spec_alternative','型号备选':'model_alternative','颜色备选':'color_alternative','品牌':'brand','排序':'sort_order',
  '备注说明':'remark','验收说明':'acceptance_remark','发包备注':'contract_remark','其他备注':'other_remark',
  '位置':'position','套系':'package_name','升级利润率':'upgrade_profit_rate','内控单价':'internal_control_price',
  '组合':'combo','限量公式':'limit_formula','报价量公式':'quote_formula','系统编号':'code','类别':'category'
}
rows=[]
for idx,row in df.iterrows():
  item={}
  for i,h in enumerate(headers):
    key=mapping.get(h)
    if not key:
      continue
    v=row.iloc[i] if i < len(row) else ''
    item[key]='' if pd.isna(v) else str(v).strip()
  if item.get('name'):
    rows.append(item)
print(json.dumps(rows,ensure_ascii=False))
`;
  const result = spawnSync('python3', ['-c', script, parseFilePath], { encoding: 'utf8' });
  try {
    fs.unlinkSync(req.file.path);
  } catch (e) {
  }
  try {
    fs.unlinkSync(parseFilePath);
  } catch (e) {
  }
  if (result.status !== 0) {
    const detail = result.stderr || '';
    console.log('Excel解析错误:', detail);
    if (detail.includes('BadZipFile') || detail.includes('File is not a zip file')) {
      res.status(400).json({ message: 'Excel文件格式无效或已损坏（文件大小异常：262144字节，可能是填充文件）。请重新从系统导出Excel文件后再导入。' });
      return;
    }
    res.status(500).json({ message: 'Excel解析失败: ' + detail.substring(0, 200), detail: result.stderr || '' });
    return;
  }
  let rows = [];
  try {
    rows = JSON.parse(result.stdout || '[]');
    console.log('导入数据行数:', rows.length, '首行字段:', rows[0] ? Object.keys(rows[0]) : '无', '字段数量:', rows[0] ? Object.keys(rows[0]).length : 0);
  } catch (e) {
    res.status(500).json({ message: 'Excel解析失败' });
    return;
  }
  const insertStmt = db.prepare(`
    INSERT INTO main_materials (
      code, name, original_price, cost_price, cost_price2, quote_price, contract_price,
      quote_unit, exchange_rate, purchase_unit, loss_rate, loss_amount, warranty_period, stock_period,
      specification, model, color, spec_alternative, model_alternative, color_alternative, brand,
      sort_order, remark, acceptance_remark, contract_remark, other_remark, position, package_name,
      upgrade_profit_rate, internal_control_price, combo, limit_formula, quote_formula, category,
      is_visible, is_fixed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    await insertStmt.run(
      row.code || '',
      row.name || '',
      Number(row.original_price || 0),
      Number(row.cost_price || 0),
      Number(row.cost_price2 || 0),
      Number(row.quote_price || 0),
      Number(row.contract_price || 0),
      row.quote_unit || '片',
      Number(row.exchange_rate || 1),
      row.purchase_unit || '',
      Number(row.loss_rate || 0),
      Number(row.loss_amount || 0),
      row.warranty_period || '',
      row.stock_period || '',
      row.specification || '',
      row.model || '',
      row.color || '',
      row.spec_alternative || '',
      row.model_alternative || '',
      row.color_alternative || '',
      row.brand || '',
      Number(row.sort_order || 0),
      row.remark || '',
      row.acceptance_remark || '',
      row.contract_remark || '',
      row.other_remark || '',
      row.position || '',
      row.package_name || '',
      Number(row.upgrade_profit_rate || 0),
      Number(row.internal_control_price || 0),
      row.combo || '',
      row.limit_formula || '',
      row.quote_formula || '',
      row.category || '',
      Number(row.is_visible ?? 1),
      Number(row.is_fixed ?? 0)
    );
  }
  await addLog(userId, '', '新增', '主材管理', null, '批量导入', `Excel导入主材 ${rows.length} 条`, req.ip);
  res.json({ message: '导入成功', count: rows.length });
});


router.get('/api/main-materials/export', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM main_materials ORDER BY sort_order ASC, id DESC').all();
  const payloadPath = path.join(os.tmpdir(), `main_material_payload_${Date.now()}.json`);
  const outputPath = path.join(os.tmpdir(), `main_material_export_${Date.now()}.xlsx`);
  fs.writeFileSync(payloadPath, JSON.stringify(rows), 'utf8');
  const script = `
import json,sys,openpyxl
payload_path=sys.argv[1]
output_path=sys.argv[2]
with open(payload_path,'r',encoding='utf-8') as f:
  rows=json.load(f)
headers=['编号','名称','原价','核算价','成本价','报价','发包价','报价单位','兑换比例','采购单位','损耗比例','损耗金额','保修时长','备货周期','规格','型号','颜色','规格备选','型号备选','颜色备选','品牌','排序','备注说明','验收说明','发包备注','其他备注','位置','套系','升级利润率','内控单价','组合','限量公式','报价量公式','系统编号','类别']
fields=['id','name','original_price','cost_price','cost_price2','quote_price','contract_price','quote_unit','exchange_rate','purchase_unit','loss_rate','loss_amount','warranty_period','stock_period','specification','model','color','spec_alternative','model_alternative','color_alternative','brand','sort_order','remark','acceptance_remark','contract_remark','other_remark','position','package_name','upgrade_profit_rate','internal_control_price','combo','limit_formula','quote_formula','code','category']
wb=openpyxl.Workbook()
ws=wb.active
ws.title='主材管理'
ws.append(headers)
for r in rows:
  ws.append([r.get(f,'') for f in fields])
wb.save(output_path)
`;
  const result = spawnSync('python3', ['-c', script, payloadPath, outputPath], { encoding: 'utf8' });
  try {
    fs.unlinkSync(payloadPath);
  } catch (e) {
  }
  if (result.status !== 0) {
    res.status(500).json({ message: '导出失败', detail: result.stderr || '' });
    return;
  }
  res.download(outputPath, '主材管理导出.xlsx', () => {
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
    }
  });
});


router.get('/api/material-orders', async (req, res) => {
  const userId = getUserId(req);
  const userRole = req.headers['x-user-role'] || '';
  const userIsAdmin = userRole === 'admin' || userRole === '超级管理员';
  const hasAll = userIsAdmin || await hasReadAllPermission(userId, 'purchase');
  if (hasAll) {
    const stmt = db.prepare('SELECT * FROM material_orders ORDER BY created_at DESC');
    return res.json(await stmt.all());
  }
  const stmt = db.prepare('SELECT * FROM material_orders WHERE creator_id = ? ORDER BY created_at DESC');
  res.json(await stmt.all(userId));
});


router.post('/api/material-orders', async (req, res) => {
    
  const userId = getUserId(req);
  const { material_id, quantity, status, order_date, expected_date, supplier, operator, note } = req.body;
  const stmt = db.prepare('INSERT INTO material_orders (material_id, quantity, status, order_date, expected_date, supplier, operator, note, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = await stmt.run(material_id, quantity, status || '待采购', order_date, expected_date, supplier, operator, note, userId);
  await addLog(userId, '', '新增', '材料订单', result.lastInsertRowid, material_id, `材料订单 ID: ${material_id}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '添加成功' });
});

// 采购申请（移动端专用）

router.post('/api/material/purchase', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, material_name, spec, quantity, unit, supplier, amount, remark } = req.body;
  if (!project_id) return res.status(400).json({ code: 1, msg: '请选择项目' });
  if (!material_name) return res.status(400).json({ code: 1, msg: '请填写材料名称' });
  if (!quantity) return res.status(400).json({ code: 1, msg: '请填写数量' });
  const stmt = db.prepare(
    'INSERT INTO material_orders (project_id, material_name, spec, quantity, unit, supplier, amount, note, status, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = await stmt.run(project_id, material_name, spec || '', quantity, unit || '', supplier || '', amount || 0, remark || '', '待采购', userId);
  const newPurchaseId = result.lastInsertRowid;
  await addLog(userId, '', '新增', '采购申请', newPurchaseId, 0, `采购申请：${material_name}`, req.ip);

  // 发送应用内通知：查项目相关人（设计师/监理/经理）+ 管理员
  try {
    const [proj] = await db.prepare(`
      SELECT p.*,
        des.phone as designer_phone, des.name as designer_name, des.id as designer_id,
        sup.phone as supervisor_phone, sup.name as supervisor_name, sup.id as supervisor_id,
        mgr.phone as manager_phone, mgr.name as manager_name, mgr.id as manager_id,
        creator.phone as creator_phone, creator.name as creator_name
      FROM projects p
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      LEFT JOIN employees creator ON creator.id = ?
      WHERE p.id = ?
    `).all(userId, project_id);

    const targets = [];
    if (proj) {
      if (proj.designer_phone) targets.push({ phone: proj.designer_phone, name: proj.designer_name, user_id: proj.designer_id });
      if (proj.supervisor_phone) targets.push({ phone: proj.supervisor_phone, name: proj.supervisor_name, user_id: proj.supervisor_id });
      if (proj.manager_phone) targets.push({ phone: proj.manager_phone, name: proj.manager_name, user_id: proj.manager_id });
      if (proj.creator_phone) targets.push({ phone: proj.creator_phone, name: proj.creator_name, user_id: userId });
      // 管理员
      const [admin] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = 1').all();
      if (admin && admin.phone) targets.push({ phone: admin.phone, name: admin.name || '管理员', user_id: admin.id });
    }

    const creatorName = proj?.creator_name || '未知';
    const content = `【${material_name}】采购申请，数量：${quantity}${unit || ''}，金额：¥${amount || 0}，申请人：${creatorName}`;
    sendAppNotification('purchase', '新采购申请', content, newPurchaseId, 'purchase', targets).catch(console.error);
  } catch (err) {
    console.error('purchase notification error:', err);
  }

  res.json({ code: 0, msg: '提交成功', id: newPurchaseId });
});


router.put('/api/material-orders/:id', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, material_id, material_name, spec, quantity, unit, supplier, amount, status, order_date, expected_date, operator, note } = req.body;
  // 权限检查
  const [existing] = await db.prepare('SELECT creator_id FROM material_orders WHERE id = ?').all(req.params.id);
  if (!existing) return res.status(404).json({ error: '订单不存在' });
  if (existing.creator_id !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权修改他人的数据' });

  // 查旧状态，用于判断是否变为"已到货"
  const [oldOrder] = await db.prepare('SELECT status, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
  const oldStatus = oldOrder?.status;

  const stmt = db.prepare('UPDATE material_orders SET project_id=?, material_id=?, material_name=?, spec=?, quantity=?, unit=?, supplier=?, amount=?, status=?, order_date=?, expected_date=?, operator=?, note=? WHERE id=?');
  await stmt.run(project_id || null, material_id || null, material_name || '', spec || '', quantity || '', unit || '', supplier || '', amount || 0, status, order_date || '', expected_date || '', operator || '', note || '', req.params.id);
  await addLog(userId, '', '编辑', '材料订单', req.params.id, material_name || material_id || '', `更新材料订单：${material_name || material_id}`, req.ip);

  // 状态变为"已到货"时，通知创建人
  if (oldStatus !== '已到货' && status === '已到货') {
    try {
      const [order] = await db.prepare('SELECT creator_id, project_id, material_name FROM material_orders WHERE id = ?').all(req.params.id);
      if (order) {
        const [creator] = await db.prepare('SELECT phone, name, id FROM employees WHERE id = ?').all(order.creator_id);
        if (creator && creator.phone) {
          const content = `【${order.material_name}】采购材料已到货，请注意验收`;
          sendAppNotification('purchase_status', '采购材料已到货', content, parseInt(req.params.id), 'purchase', [{ phone: creator.phone, name: creator.name, user_id: creator.id }]).catch(console.error);
        }
      }
    } catch (err) {
      console.error('purchase_status notification error:', err);
    }
  }

  res.json({ message: '更新成功' });
});


module.exports = router;