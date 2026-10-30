/**
 * 页面路径归一化（跨端统一入口）
 *
 * 背景：小程序自 v2.4.3 起拆了 5 个分包，页面真实路径是 `/pkg-xxx/yyy`；
 * H5 / App 没有分包，路径仍是 `/pages/yyy`。
 *
 * 为了业务代码两端完全一致，约定：**源码统一写 `/pages/yyy`**。
 *   - 源码里写死的跳转 → 小程序由 vite 插件在构建期改写（见 vite.config.ts）
 *   - 后端接口运行期返回的 url → 用本文件的 resolvePageUrl 在运行期改写
 *
 * 本函数在小程序端做映射，H5 / App 端原样返回（条件编译剔除映射逻辑）。
 *
 * ⚠️ 本文件与 utils/pageMap.ts 两端必须保持完全一致。
 */

import { mapToSubPackage, TAB_BAR_PAGES } from './pageMap'

/**
 * 把 `/pages/a/b` 归一化成当前平台可用的路径。
 * 小程序 → `/pkg-x/a/b`；H5 / App → 原样返回。
 */
export function resolvePageUrl(url?: string | null): string {
  if (!url) return ''
  const raw = String(url)
  // #ifdef MP-WEIXIN
  const mapped = mapToSubPackage(raw)
  if (mapped) return mapped
  // #endif
  return raw
}

/** 该页面是否为原生 tabBar 页（决定用 switchTab 还是 navigateTo） */
export function isTabBarPage(url?: string | null): boolean {
  if (!url) return false
  const path = String(url).split('?')[0]
  return TAB_BAR_PAGES.indexOf(path) !== -1
}

/* ==================================================================
 * 消息 → 目标页面映射
 *
 * 原 utils/messageTarget.ts 迁入。原因同 format/upload：
 * 该文件只被 pkg-misc 下的消息列表页、消息详情页引用，留在主包会被
 * 微信「主包内不应存在主包未使用的 JS 文件」判定为冗余；而它本身又
 * 依赖本文件的 resolvePageUrl / isTabBarPage，「路径归一化 + 跳转执行」
 * 本就是一条链，合并到这里内聚。
 *
 * 口径（2026-10-22 按真实库数据校准）：
 *   1. **优先看实体（source_type / related_type）**，再看事件名（type）。
 *      因为历史数据里 type 有 `inapp`、`采购`（中文）等脏值，只有 source_type 才是真实体。
 *      实测分布：project_log 78、purchase_request 58、project_file 34、contract_change 26、
 *      dispatch 21、rectification_issue 15、contract 14、project 8、node 6、acceptance 3 …
 *   2. 目标页面在源码里一律写 `/pages/xxx`；小程序构建期由 vite 插件改写成 `/pkg-xxx/xxx`，
 *      运行期由 resolvePageUrl 兜底。
 *   3. 拿不到实体 id 的、或该实体在小程序端确实没有页面的 → 返回 null，详情页不显示按钮，
 *      避免用户点了跳到一个空白详情。
 *
 * ⚠️ 本文件与 utils/pageMap.ts 两端必须保持完全一致。
 * ================================================================== */

export interface MessageTarget {
  /** 源码口径路径（/pages/xxx），交给 resolvePageUrl 归一化 */
  path: string
  /** 按钮文案 */
  label: string
  /** 该实体是否必须带 id 才有意义 */
  needId: boolean
  /** 附加查询串（不含 ?）；由 openMessageTarget 拼在归一化后的路径后面 */
  query?: string
}

/** 实体类型（source_type）→ 目标页面构造器 */
const BY_SOURCE_TYPE: Record<string, (id: string, msg?: any) => MessageTarget> = {
  project: (id) => ({ path: `/pages/projects/detail?id=${id}`, label: '查看项目', needId: true }),
  node: (id) => ({ path: `/pages/projects/node?id=${id}`, label: '查看项目节点', needId: true }),
  project_log: (id) => ({ path: `/pages/projects/log-detail?id=${id}`, label: '查看施工日志', needId: true }),
  contract: (id) => ({ path: `/pages/contract/detail?id=${id}`, label: '查看合同', needId: true }),
  // 增减项在小程序端没有独立详情页，走「合同审核」页的增减项 tab 定位到该条
  contract_change: (id) => ({ path: `/pages/contracts/approval?tab=change&id=${id}`, label: '查看增减项', needId: true }),
  dispatch: (id) => ({ path: `/pages/dispatch/detail?id=${id}`, label: '查看派工', needId: true }),
  // 移动端「巡检」写的是 rectification_issues，详情页即整改详情
  rectification_issue: (id) => ({ path: `/pages/inspection/detail?id=${id}`, label: '查看整改详情', needId: true }),
  acceptance: (id) => ({ path: `/pages/acceptance/report?id=${id}`, label: '查看验收报告', needId: true }),
  // v2.4.1 主材验收（工长进场材料逐项验收）
  material_acceptance: (id) => ({ path: `/pages/material-accept/detail?id=${id}`, label: '查看材料验收', needId: true }),
  purchase: (id) => ({ path: `/pages/purchase/detail?id=${id}`, label: '查看采购', needId: true }),
  purchase_request: (id) => ({ path: `/pages/purchase/detail?id=${id}`, label: '查看采购', needId: true }),
  project_file: (id) => ({ path: `/pages/files/detail?id=${id}`, label: '查看项目文件', needId: true }),
  approval: (id) => ({ path: `/pages/approval/detail?id=${id}`, label: '查看审批', needId: true }),
  customer: (id) => ({ path: `/pages/customers/customers?id=${id}`, label: '查看客户', needId: false }),
  notice: (id) => ({ path: `/pages/notices/notices?id=${id}`, label: '查看公告', needId: false }),
  // ⚠️ 应收统计页必须带 projectId，否则页面只能显示 ¥0.00。
  //    messages / notifications 表本身没有 project_id 列，
  //    由后端 /api/messages 的 attachProjectInfo() 按 collection_records 反查后补上。
  collection: (id, msg) => {
    const pid = parseInt(msg && msg.project_id) || 0
    const query = pid
      ? `projectId=${pid}` + (msg && msg.project_name ? `&projectName=${encodeURIComponent(msg.project_name)}` : '')
      : ''
    return { path: `/pages/finance/finance-receivable`, label: '查看应收', needId: false, query }
  },
  invoice: () => ({ path: `/pages/finance/list`, label: '查看收支', needId: false }),
  finance: () => ({ path: `/pages/finance/list`, label: '查看收支', needId: false }),
}

/** 事件名（type）→ 实体类型，仅在 source_type 缺失时兜底 */
const TYPE_TO_SOURCE: Record<string, string> = {
  contract_created: 'contract',
  contract_updated: 'contract',
  contract_uploaded: 'contract',
  contract_approved: 'contract',
  contract_deleted: 'contract',
  contract_change_created: 'contract_change',
  contract_change_approved: 'contract_change',
  project_created: 'project',
  project_status_changed: 'project',
  project_progress: 'project_log',
  node_status_changed: 'node',
  node_in_progress: 'node',
  node_completed: 'node',
  inspection_submit: 'rectification_issue',
  // 2026-10-23 整改到期提醒（定时器推送）：source_type 正常会命中实体，
  // 但历史脏数据可能缺 source_type，这里兜底
  inspection_due: 'rectification_issue',
  acceptance_submit: 'acceptance',
  material_acceptance_submit: 'material_acceptance',
  dispatch_created: 'dispatch',
  dispatch_status_changed: 'dispatch',
  approval_submit: 'approval',
  approval_result: 'approval',
  notice_published: 'notice',
  purchase: 'purchase_request',
  '采购': 'purchase_request',
  project_file_pending: 'project_file',
  project_file_approved: 'project_file',
  collection_created: 'collection',
  collection_confirmed: 'collection',
  invoice_created: 'invoice',
  customer_follow: 'customer',
}

/** 解析一条消息的跳转目标；无对应页面返回 null */
export function resolveMessageTarget(msg: any): MessageTarget | null {
  if (!msg) return null

  const id = msg.source_id != null ? String(msg.source_id) : (msg.related_id != null ? String(msg.related_id) : '')
  const sourceType = String(msg.source_type || msg.related_type || '')
  const type = String(msg.type || '')

  // 实体优先：source_type 命中就用它，没命中再按 type 反查实体
  const st = sourceType || TYPE_TO_SOURCE[type] || ''
  const build = BY_SOURCE_TYPE[st]
  if (!build) return null

  const target = build(id, msg)
  if (target.needId && (!id || id === '0' || id === 'null')) return null
  return target
}

/** 打开目标页：tabBar 页只能 switchTab，其余 navigateTo；失败给轻提示不静默 */
export function openMessageTarget(target: MessageTarget | null) {
  if (!target || !target.path) {
    uni.showToast({ title: '该消息暂无关联页面', icon: 'none' })
    return
  }
  const base = resolvePageUrl(target.path)
  // query 要拼在**归一化之后**：resolvePageUrl 只改 path，
  // 若先拼再归一化，映射表里的键会带上 ?xx=1 而匹配不到分包
  const url = target.query
    ? base + (base.indexOf('?') === -1 ? '?' : '&') + target.query
    : base
  const fail = () => uni.showToast({ title: '页面暂不可用', icon: 'none' })
  if (isTabBarPage(target.path)) {
    uni.switchTab({ url, fail })
  } else {
    uni.navigateTo({ url, fail })
  }
}
