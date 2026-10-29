/**
 * 短信模块（sms）—— 7 个路由
 *
 * 2026-10-29 从 server.js 整体抽出（渐进拆分第 8 轮，349 行 / 7 个路由）。
 * 代码逐行搬迁、逻辑零改动，外部依赖改为参数注入；
 * 两个阿里云调用函数已先行抽到 lib/aliyun-sms.js。
 *
 * 四段内容（共 7 个路由）：
 *   【短信模板】GET/POST/PUT/DELETE /api/sms-templates
 *   【同步阿里云】POST /api/sms-templates/sync-aliyun
 *                  把系统模板的 {客户姓名} 等中文变量转成 ${name}，
 *                  调阿里云 CreateSmsTemplate 拿到 TemplateCode 回写库
 *   【短信发送】POST /api/sms-send
 *                  按节点取客户手机号 → 模板变量替换 → 阿里云 SendSms → 写日志
 *   【发送日志】GET /api/sms-send-logs（最近 100 条，三表 LEFT JOIN）
 *
 * ⚠️ 已知问题（原样保留，未动）：
 *   1. `GET /api/sms-templates` 和 `GET /api/sms-send-logs` **没有任何权限校验**，
 *      任何登录用户都能读到全部模板内容和最近的发送记录（含客户手机号）。
 *      写操作有 sms:write / sms:delete，读操作没有对应权限点。
 *   2. `POST /api/sms-templates/sync-aliyun` 同样无权限校验 ——
 *      任何登录用户都能触发一次真实的阿里云建模板请求（会产生调用费用）。
 *   3. `POST /api/sms-send` 无权限校验，任何登录用户都能给**任意节点**的客户发短信。
 *      这是真实的费用与骚扰风险。
 *   4. `PUT /api/sms-templates/:id` 刻意**不更新** sign_name / aliyun_template_code
 *      （见路由上方 2026-10-12 注释）。改这里前先读那段注释，
 *      否则会把已同步到阿里云的模板 CODE 清空，导致后续发短信全部失败。
 *   5. 模板变量映射是硬编码的 4 个（客户姓名/项目名称/节点名称/日期），
 *      新增变量类型要同时改 varMap 和 varTypeMap 两处。
 *
 * 依赖 5 个：db / checkPermission / getUserId / addLog / isAdmin
 */

const { addAliyunSmsTemplate, sendAliyunSms } = require('../lib/aliyun-sms');

module.exports = function registerSmsRoutes(app, deps) {
  const { db, checkPermission, getUserId, addLog, isAdmin } = deps;

  // ==================== 短信模板 API ====================
  // GET 所有短信模板
  app.get('/api/sms-templates', async (req, res) => {
    try {
      const templates = await db.prepare('SELECT id, name, content, variables, is_active, sign_name, aliyun_template_code, created_at FROM sms_templates WHERE is_active=1 ORDER BY id').all();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST 新建短信模板
  app.post('/api/sms-templates', checkPermission('sms:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, content, variables } = req.body;
      const result = await db.prepare(
        'INSERT INTO sms_templates (name, content, variables, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())'
      ).run([name, content, variables || null]);
      await addLog(userId, '', '新增', '短信模板', result.lastInsertRowid, name, `短信模板: ${name}`, req.ip);
      res.json({ id: result.lastInsertRowid, message: '短信模板创建成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT 更新短信模板
  // 2026-10-12 修复：
  //   1) 之前 `addLog(userId, ...)` 引用外层 userId，无定义 → ReferenceError 500；现补上 const userId = getUserId(req);
  //   2) sign_name / aliyun_template_code 不再由本路由更新——这两个字段只由同步接口 /api/sms-templates/sync-aliyun 写，
  //      前端编辑表单不带这俩字段（form 只有 name/content/is_active），原实现 `sign_name || null` 会把已同步
  //      到阿里云的 sign_name/code 清成 null，造成已同步模板丢失。下次发短信将找不到对应阿里云模板。
  app.put('/api/sms-templates/:id', checkPermission('sms:write'), async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, content, variables, is_active } = req.body;
      const fields = [];
      const params = [];
      if (name !== undefined) { fields.push('name=?'); params.push(name); }
      if (content !== undefined) { fields.push('content=?'); params.push(content); }
      if (variables !== undefined) { fields.push('variables=?'); params.push(variables); }
      if (is_active !== undefined) { fields.push('is_active=?'); params.push(is_active ? 1 : 0); }
      if (!fields.length) return res.json({ code: 0, message: '无更新内容' });
      fields.push('updated_at=NOW()');
      params.push(req.params.id);
      await db.prepare(`UPDATE sms_templates SET ${fields.join(', ')} WHERE id=?`).run(params);
      await addLog(userId, '', '编辑', '短信模板', parseInt(req.params.id), name || '', `更新短信模板: ${name || ''}`, req.ip);
      res.json({ message: '短信模板更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE 删除短信模板
  app.delete('/api/sms-templates/:id', checkPermission('sms:delete'), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isAdmin(userId))) return res.status(403).json({ error: '只有管理员可删除此数据' });
      const [tpl] = await db.prepare('SELECT name FROM sms_templates WHERE id=?').all([req.params.id]);
      await db.prepare('DELETE FROM sms_templates WHERE id=?').run([req.params.id]);
      await addLog(userId, '', '删除', '短信模板', parseInt(req.params.id), tpl?.name || '', `删除短信模板: ${tpl?.name || req.params.id}`, req.ip);
      res.json({ message: '短信模板删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST 同步模板到阿里云
  // v2.5.3 鉴权加固：这个接口会真实调用阿里云 CreateSmsTemplate（占配额、可能计费），
  // 原本零校验。权限口径与同文件「新建短信模板」保持一致，用 sms:write（短信模板写入）。
  app.post('/api/sms-templates/sync-aliyun', checkPermission('sms:write'), async (req, res) => {
    try {
      const { template_id, sign_name } = req.body;
      if (!template_id || !sign_name) {
        return res.status(400).json({ error: '缺少template_id或sign_name' });
      }

      // 获取模板内容
      const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(template_id);
      if (!tmpl) return res.status(404).json({ error: '模板不存在' });

      // 获取阿里云配置（DB里setting_value是双重JSON：{"category":"sms","setting_value":{...}}）
      const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
      let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
      // 取最内层配置
      if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
      console.log('【DEBUG sync-aliyun】smsConfig:', JSON.stringify(smsConfig), 'provider:', smsConfig?.provider);
      if (!smsConfig || smsConfig.provider !== 'aliyun') {
        return res.status(400).json({ error: '阿里云短信未配置' });
      }

      // 阿里云 CreateSmsTemplate 要求变量格式为 ${code}，$ 在左边
      // 系统模板的 {客户姓名} -> ${name} 映射，供 SendSms 的 templateParam 英文 key 对应
      const varMap = { '客户姓名': 'name', '项目名称': 'project', '节点名称': 'node', '日期': 'date' };
      const varTypeMap = { name: 'name', project: 'user_nick', node: 'user_nick', date: 'time' };
      let aliyunContent = tmpl.content;
      for (const [cn, en] of Object.entries(varMap)) {
        aliyunContent = aliyunContent.split('{' + cn + '}').join('${' + en + '}');
      }
      // 提取模板中的变量，生成 TemplateRule（对象格式，key=变量名，value=阿里云类型枚举中文名）
      const foundVars = [...aliyunContent.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1]);
      const templateRuleObj = {};
      foundVars.forEach(v => {
        templateRuleObj[v] = varTypeMap[v] || '个人姓名';
      });
      const templateRuleStr = JSON.stringify(templateRuleObj);
      console.log('【DEBUG sync-aliyun】原始:', tmpl.content, '| 转换后:', aliyunContent, '| TemplateRule:', templateRuleStr);

      // 调用阿里云 CreateSmsTemplate API
      const result = await addAliyunSmsTemplate({
        accessKeyId: smsConfig.access_key_id,
        accessKeySecret: smsConfig.access_key_secret,
        signName: sign_name,
        templateName: tmpl.name,
        templateContent: aliyunContent,
        templateRule: templateRuleStr,
        remark: '由系统同步'
      });

      if (result.Code === 'OK' || result.TemplateCode) {
        const aliyunTemplateCode = result.TemplateCode;
        console.log('【同步阿里云成功】TemplateCode:', aliyunTemplateCode);
        // 保存到模板记录
        await db.prepare(
          'UPDATE sms_templates SET sign_name=?, aliyun_template_code=?, updated_at=NOW() WHERE id=?'
        ).run(sign_name, aliyunTemplateCode, template_id);
        res.json({ success: true, template_code: aliyunTemplateCode, message: '同步成功' });
      } else {
        console.log('【同步阿里云失败】result:', JSON.stringify(result));
        res.status(400).json({ error: result.Message || '同步失败' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 短信发送 API ====================
  app.post('/api/sms-send', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { node_id, project_id, customer_phone } = req.body;
    
      // 获取节点、项目、模板信息
      const [node] = await db.prepare('SELECT n.*, p.name as project_name, c.name as customer_name, c.phone as customer_phone FROM project_progress_nodes n LEFT JOIN projects p ON n.project_id=p.id LEFT JOIN customers c ON p.customer_id=c.id WHERE n.id=?').all(node_id);
      if (!node) return res.status(404).json({ error: '节点不存在' });
    
      const templateId = node.sms_template_id;
      let smsContent = '';
      let templateName = '';
    
      if (templateId) {
        const [tmpl] = await db.prepare('SELECT * FROM sms_templates WHERE id=?').all(templateId);
        if (tmpl) {
          templateName = tmpl.name;
          // 替换变量
          smsContent = tmpl.content
            .replace(/\{客户姓名\}/g, node.customer_name || '')
            .replace(/\{项目名称\}/g, node.project_name || '')
            .replace(/\{节点名称\}/g, node.node_name || '')
            .replace(/\{日期\}/g, new Date().toLocaleDateString('zh-CN'));
        }
      }
    
      // 国内手机号加86前缀（阿里云要求）
      const phone = customer_phone || node.customer_phone;
      const phoneWithCode = /^86/.test(phone) ? phone : '86' + phone;
      if (!phone) {
        // 写入失败日志
        await db.prepare(
          'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
        ).run(project_id, node_id, node.customer_name || '', '', templateId, templateName, smsContent, 'failed', '客户手机号为空');
        return res.status(400).json({ error: '客户手机号为空' });
      }
    
      // 读取阿里云短信配置（DB里setting_value是双重JSON）
      const [smsSettings] = await db.prepare("SELECT setting_value FROM system_settings WHERE category='sms'").all();
      let smsConfig = smsSettings ? JSON.parse(smsSettings.setting_value) : null;
      if (smsConfig && smsConfig.setting_value) smsConfig = smsConfig.setting_value;
      const smsApiConfigured = smsConfig && smsConfig.provider === 'aliyun' && smsConfig.access_key_id && smsConfig.access_key_secret;

      // 优先用模板自己绑定的阿里云模板CODE和签名，否则用全局配置
      let templateCodeForSend = smsConfig ? smsConfig.template_code : '';
      let signNameForSend = smsConfig ? smsConfig.sign_name : '';
      if (templateId) {
        const [tmpl] = await db.prepare('SELECT aliyun_template_code, sign_name FROM sms_templates WHERE id=?').all(templateId);
        if (tmpl && tmpl.aliyun_template_code) {
          templateCodeForSend = tmpl.aliyun_template_code;
          signNameForSend = tmpl.sign_name || smsConfig.sign_name;
        }
      }

      let sendStatus = 'failed';
      let failReason = '';

      if (smsApiConfigured) {
        // 真实发送阿里云短信
        try {
          const result = await sendAliyunSms({
            accessKeyId: smsConfig.access_key_id,
            accessKeySecret: smsConfig.access_key_secret,
            signName: signNameForSend,
            templateCode: templateCodeForSend,
            phone: phoneWithCode,
            templateParam: JSON.stringify({
              name: node.customer_name || '',
              project: node.project_name || '',
              node: node.node_name || '',
              date: new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' })
            })
          });
          if (result.Code === 'OK') {
            sendStatus = 'success';
          } else {
            sendStatus = 'failed';
            failReason = result.Message || '发送失败';
          }
        } catch (e) {
          sendStatus = 'failed';
          failReason = e.message;
        }
      } else {
        sendStatus = 'failed';
        failReason = '短信接口未配置（APIKEY/Secret未申请），发送队列等待中';
      }
    
      // 写入发送日志
      await db.prepare(
        'INSERT INTO sms_send_logs (project_id, node_id, customer_name, customer_phone, template_id, template_name, sms_content, send_time, status, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)'
      ).run(project_id, node_id, node.customer_name || '', phone, templateId, templateName, smsContent, sendStatus, failReason);
    
      // 更新节点是否已发送短信标记
      await db.prepare('UPDATE project_progress_nodes SET is_sms_sent=? WHERE id=?').run(sendStatus === 'success' ? 1 : 0, node_id);
    
      res.json({ status: sendStatus, message: failReason || '发送成功', content: smsContent, phone, log_id: null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 短信发送日志 API ====================
  app.get('/api/sms-send-logs', async (req, res) => {
    try {
      const logs = await db.prepare(`
        SELECT l.*, n.node_name, p.name as project_name, t.name as template_name
        FROM sms_send_logs l
        LEFT JOIN project_progress_nodes n ON l.node_id=n.id
        LEFT JOIN projects p ON l.project_id=p.id
        LEFT JOIN sms_templates t ON l.template_id=t.id
        ORDER BY l.send_time DESC LIMIT 100
      `).all();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
