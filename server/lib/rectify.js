'use strict';
/**
 * 「待整改」唯一口径
 * ---------------------------------------------------------------
 * 2026-10-29 从 server.js 抽出，供三处共用：
 *   ① 首页统计卡片（GET /api/dashboard 一类的整改计数）
 *   ② 待办计数（GET /api/todo/count）
 *   ③ 待办列表（GET /api/todo/center）
 *
 * ⚠️ 为什么判「未完成」而不是判状态白名单：
 *   库里存在 status=NULL 且 finish_date 也为空的历史数据（早期版本没写状态机），
 *   按 status IN ('待处理',...) 会被漏掉，永远不出现在任何待办里；
 *   而只判 status 不过滤的话，已完成的历史整改又会被算进「待整改」卡片
 *   （曾出现卡片 6 / 列表 1）。改这里等于同时改三处口径，想清楚再动。
 */
const RECTIFY_OPEN_SQL = `(ri.status IS NULL OR ri.status NOT IN ('已完成','completed','done','已关闭','已作废'))
   AND (ri.finish_date IS NULL OR ri.finish_date = '')`;

module.exports = { RECTIFY_OPEN_SQL };
