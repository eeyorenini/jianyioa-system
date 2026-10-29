/**
 * 合同附件文件清理（2026-10-29 渐进拆分第 20 轮）
 *
 * 搬运自 server.js 原 600-659 行，搬入时 60 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
 */
module.exports = function registerContractAttachmentRoutes(app, deps) {
  const {
    pool,
    db,
    fs,
    path,
    isAdmin,
    checkPermission,
    addLog,
    extractUploadPaths,
  } = deps;

  // ==================== 合同附件文件清理（v2.4.0）====================
  // 背景：删除合同原来只删数据库行。content 里的 base64 图片会随行消失，
  //       但 /uploads/ 下的真实文件没有任何清理逻辑，长期会堆成孤儿文件。
  // 策略：删合同后，把 content / attachment 里引用到的本地文件逐个检查，
  //       确认没有其他合同还在用才删——避免误删多份合同共享的同一张图。
  // 路径抽取已抽到 ./lib/parse.js（extractUploadPaths）
  async function cleanupContractFiles(paths, deletedId) {
    const uploadsRoot = path.join(__dirname, 'uploads');
    for (const p of paths) {
      try {
        const like = `%${p}%`;
        const [rows] = await pool.query(
          'SELECT id FROM contracts WHERE id <> ? AND (content LIKE ? OR attachment LIKE ?) LIMIT 1',
          [deletedId, like, like]
        );
        if (rows.length) continue; // 还有别的合同在用，保留
        const full = path.join(__dirname, p.replace(/^\//, ''));
        // 防路径穿越：必须落在 uploads 目录内
        if (!full.startsWith(uploadsRoot + path.sep)) continue;
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
          console.log(`[删除合同] 已清理附件: ${p}`);
        }
      } catch (e) {
        console.error('[删除合同] 清理附件失败:', p, e.message);
      }
    }
  }

  app.delete('/api/contracts/:id', checkPermission('contract:delete'), async (req, res) => {
    const rawUserId = req.headers['x-user-id'];
    const userId = rawUserId ? parseInt(rawUserId) : 0;
    console.log('[DELETE contracts] userId=%s, isAdmin=%s, targetId=%s', userId, await isAdmin(userId), req.params.id);
    const [c] = await db.prepare('SELECT project_name, created_by, content, attachment FROM contracts WHERE id = ?').all(req.params.id);
    if (!c) return res.status(404).json({ error: '记录不存在' });
    if (c.created_by !== userId && !(await isAdmin(userId))) return res.status(403).json({ error: '无权删除他人的数据' });
    const cName = c.project_name;
    const stmt = db.prepare('DELETE FROM contracts WHERE id = ?');
    await stmt.run(req.params.id);
    // v2.3.12 修：删合同必须连带清掉它产生的「合同」收入记录，
    // 否则 payment_records 里会留下一条找不到来源合同的孤儿收入
    // （柏林山水 12 万那条就是删了合同 #76 之后残留下来的）。
    try {
      const [orphan] = await pool.query(
        "DELETE FROM payment_records WHERE source_id = ? AND category = 'contract'",
        [req.params.id]
      );
      if (orphan.affectedRows) console.log('[删除合同] 连带清理收支记录 %d 条, contractId=%s', orphan.affectedRows, req.params.id);
    } catch (e) {
      console.error('[删除合同] 清理收支记录失败:', e.message);
    }
    // 异步清理附件文件，不阻塞响应
    const paths = [...extractUploadPaths(c.content), ...extractUploadPaths(c.attachment)];
    if (paths.length) {
      cleanupContractFiles(paths, req.params.id).catch(e => console.error('[删除合同] 附件清理异常:', e.message));
    }
    await addLog(userId, '', '删除', '合同管理', req.params.id, cName, `删除合同: ${cName}`, req.ip);
    res.json({ message: '删除成功' });
  });

};
