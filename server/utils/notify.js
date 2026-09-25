'use strict';

const { pool } = require('../db-mysql-async');
const { sendAliyunSms } = require('./sms');

// ==================== 通知规则默认配置 ====================
function getDefaultNotificationRules() {
  return {
    node_completed:    { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_in_progress:  { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_pending:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    node_skipped:      { enabled: true, channels: ['inapp', 'sms'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    project_progress:  { enabled: true, channels: ['inapp'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    inspection_submit: { enabled: true, channels: ['inapp'], receivers: ['manager', 'supervisor'] },
  };
}

async function notifyProject(type, projectId, title, content, sourceId, sourceType, templateId) {
  try {
    // 0. 读取通知规则
    let notifRules = {};
    try {
      const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'notifications'");
      if (rows[0]) {
        const parsed = JSON.parse(rows[0].setting_value);
        notifRules = parsed.setting_value || parsed;
      }
    } catch {}

    // 读取微信公众号模板消息ID
    let mpTemplateId = null;
    try {
      const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE category = 'wechat_mp'");
      if (rows[0]) {
        const parsed = JSON.parse(rows[0].setting_value);
        const cfg = parsed.setting_value || parsed;
        mpTemplateId = cfg.template_id || null;
      }
    } catch {}

    // 决定本条消息要走的渠道（兼容旧调用：没传 templateId 则默认只 inapp）
    const rule = notifRules[type];
    const enabledChannels = rule && rule.enabled
      ? (rule.channels || ['inapp'])
      : (templateId ? ['inapp'] : ['inapp']);

    // 1. 获取所有订阅了该消息类型的角色（允许列不存在时报错跳过）
    let roles = [];
    try {
      const [rows] = await db.prepare('SELECT id, name FROM roles WHERE notification_types LIKE ?').all(`%${type}%`);
      roles = rows || [];
    } catch (e) {
      // 列不存在或查询失败，跳过角色订阅（项目相关人和admin仍会收到）
      console.log(`[notifyProject] 角色订阅查询失败（可能notification_types列不存在）: ${e.message}`);
    }

    // 2. 查这些角色的所有员工手机号（如果没有任何角色订阅，则为空数组，不阻断后续逻辑）
    let staffTargets = [];
    if (roles && roles.length > 0) {
      const roleIds = roles.map(r => r.id);
      const rolePlaceholders = roleIds.map(() => '?').join(',');
      const [employees] = await db.prepare(
        `SELECT DISTINCT e.id as user_id, e.phone, e.name FROM employees e WHERE e.role_id IN (${rolePlaceholders}) AND e.phone IS NOT NULL AND e.phone != ''`
      ).all(...roleIds);
      if (employees) {
        for (const e of employees) {
          if (e.phone) staffTargets.push({ phone: e.phone, name: e.name || '', role: 'staff', user_id: e.user_id || null });
        }
      }
    }

    // 3. 如果有 projectId，查项目相关人（设计师/监理/客户）——用 MySQL 直查（projects表在MySQL不在SQLite）
    let projectTargets = [];
    if (projectId) {
      try {
        const [proj] = await mysqlPool.query(`
          SELECT c.phone as customer_phone, c.name as customer_name,
          des.phone as designer_phone, des.name as designer_name,
          sup.phone as supervisor_phone, sup.name as supervisor_name,
          mgr.id as manager_user_id, mgr.phone as manager_phone, mgr.name as manager_name,
          des.id as designer_user_id, sup.id as supervisor_user_id
          FROM projects p
          LEFT JOIN customers c ON p.customer_id = c.id
          LEFT JOIN employees des ON p.designer_id = des.id
          LEFT JOIN employees sup ON p.supervisor_id = sup.id
          LEFT JOIN employees mgr ON p.manager_id = mgr.id
          WHERE p.id = ?
        `, [projectId]);

        console.log(`[notifyProject] 项目${projectId}查询结果:`, JSON.stringify(proj && proj[0] ? proj[0] : '无'));

        if (proj && proj[0]) {
          const p = proj[0];
          if (p.designer_phone) projectTargets.push({ phone: p.designer_phone, name: p.designer_name, role: 'designer', user_id: p.designer_user_id || null });
          if (p.supervisor_phone) projectTargets.push({ phone: p.supervisor_phone, name: p.supervisor_name, role: 'supervisor', user_id: p.supervisor_user_id || null });
          if (p.manager_phone) projectTargets.push({ phone: p.manager_phone, name: p.manager_name, role: 'manager', user_id: p.manager_user_id || null });
          if (p.customer_phone) projectTargets.push({ phone: p.customer_phone, name: p.customer_name, role: 'customer', user_id: null });
        }
      } catch(e) {
        console.log(`[notifyProject] 项目相关人查询失败: ${e.message}`);
      }
    }
    console.log(`[notifyProject] 项目相关人:`, projectTargets.map(t => `${t.phone}(${t.role})`));

    // 4. 合并去重（按phone去重）
    const phoneSet = new Set();
    const allTargets = [];
    for (const t of [...staffTargets, ...projectTargets]) {
      if (t.phone && !phoneSet.has(t.phone)) {
        phoneSet.add(t.phone);
        allTargets.push(t);
      }
    }

    // 5. 管理员（id=1对应的手机号）永远收到
    const [adminEmp] = await db.prepare('SELECT phone, name FROM employees WHERE id = 1').all();
    if (adminEmp && adminEmp.phone && !phoneSet.has(adminEmp.phone)) {
      allTargets.push({ phone: adminEmp.phone, name: adminEmp.name || '管理员', role: 'admin' });
    }

    // 如果没有任何接收人，跳过
    if (allTargets.length === 0) {
      console.log(`[notifyProject] 没有接收人，跳过通知 type=${type} projectId=${projectId}`);
      return;
    }

    console.log(`[notifyProject] 准备发送通知 type=${type} to=`, allTargets.map(t => t.phone));

    // 6. 对每个接收人，按渠道发送
    for (const t of allTargets) {
      // 站内消息（必须）
      if (enabledChannels.includes('inapp')) {
        try {
          const [r] = await mysqlPool.query(
            'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
          );
          console.log(`[notifyProject] ✅ 通知已写入 id=${r.insertId} phone=${t.phone} name=${t.name}`);

          // 同时写 messages 表（员工消息页面读的是这个表）
          if (t.user_id) {
            try {
              await db.prepare(
                'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date().toISOString());
              console.log(`[notifyProject] ✅ messages已写入 phone=${t.phone} user_id=${t.user_id}`);
            } catch(e2) {
              console.error(`[notifyProject] ❌ messages写入失败 phone=${t.phone} user_id=${t.user_id} error=${e2.message}`);
            }
          }
        } catch(e) {
          console.error(`[notifyProject] ❌ 写入失败 phone=${t.phone} error=${e.message}`);
        }
      }

      // 短信渠道
      if (enabledChannels.includes('sms') && templateId) {
        sendSmsFromNotify(t.phone, t.name, title, content, templateId).catch(console.error);
      }

      // 微信渠道（调用 push）
      if (enabledChannels.includes('wechat') && mpTemplateId) {
        // 构造微信模板消息数据格式：{ key: { value: 'xxx', color: '#xxx' } }
        const wechatData = {
          first: { value: title, color: '#1890ff' },
          keyword1: { value: t.name || '未知', color: '#333333' },
          keyword2: { value: content.substring(0, 20), color: '#333333' },
          remark: { value: '如有疑问请联系客服', color: '#999999' }
        };
        // 异步推送，不阻塞
        pushWechatByPhone(t.phone, mpTemplateId, wechatData).catch(console.error);
      }
    }
  } catch (err) {
    console.error('notifyProject error:', err);
  }
}

async function sendApprovalNotification({ userId, userName, title, content, type, relatedId, relatedType }

async function sendAppNotification(type, title, content, sourceId, sourceType, targets) {
  if (!targets || targets.length === 0) return;
  const channels = 'inapp';
  // 按 phone 去重
  const seen = new Set();
  const uniqueTargets = [];
  for (const t of targets) {
    if (!t.phone || seen.has(t.phone)) continue;
    seen.add(t.phone);
    uniqueTargets.push(t);
  }
  for (const t of uniqueTargets) {
    try {
      // 写 notifications 表
      await mysqlPool.query(
        'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [title, content, type, sourceId || 0, sourceType || '', 0, t.phone, t.name || '', channels, 'pending']
      );
      // 写 messages 表（如果能查到 user_id）
      if (t.user_id) {
        await mysqlPool.query(
          'INSERT INTO messages (user_id, user_name, title, content, type, related_id, related_type, is_read, push_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [t.user_id, t.name || '', title, content, type, sourceId || 0, sourceType || '', 0, 'sent', new Date()]
        );
      }
    } catch (err) {
      console.error('sendAppNotification error:', err);
    }
  }
}

async function insertInAppNotification(projectId, title, content, sourceId, sourceType) {
  try {
    const [proj] = await db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone,
      des.name as designer_name, des.phone as designer_phone,
      sup.name as supervisor_name, sup.phone as supervisor_phone,
      mgr.name as manager_name, mgr.phone as manager_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees des ON p.designer_id = des.id
      LEFT JOIN employees sup ON p.supervisor_id = sup.id
      LEFT JOIN employees mgr ON p.manager_id = mgr.id
      WHERE p.id = ?`).all(projectId);
    if (!proj) return;

    const roles = [
      { phone: proj.manager_phone, name: proj.manager_name },
      { phone: proj.designer_phone, name: proj.designer_name },
      { phone: proj.supervisor_phone, name: proj.supervisor_name },
      { phone: proj.customer_phone, name: proj.customer_name },
    ];

    for (const t of roles) {
      if (t.phone) {
        await mysqlPool.query(
          'INSERT INTO notifications (title, content, type, source_id, source_type, sender_id, receiver_phone, receiver_name, channels, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [title, content, 'inapp', sourceId || 0, sourceType || '', 0, t.phone, t.name || '', 'inapp', 'pending']
        );
      }
    }
  } catch (err) { console.error('insertInAppNotification error:', err); }
}

