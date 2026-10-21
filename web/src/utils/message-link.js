// 消息 / 待办 → PC 路由映射
// 说明：后端 /api/messages 与 /api/todo/center 返回的 type 是英文 code，
//       移动端各自有一份映射表（pages/message/list.vue、pages/todo/index.vue），
//       PC 端统一走这里，避免两处漂移。

/** 消息类型 → 展示配置（图标 / 文案 / 颜色），与移动端 typeConfig 保持一致 */
export const MSG_TYPE_CONFIG = {
  contract_created: { text: '新合同', icon: '📄', color: '#409EFF' },
  contract_updated: { text: '合同变更', icon: '📝', color: '#409EFF' },
  contract_uploaded: { text: '合同上传', icon: '📤', color: '#409EFF' },
  contract_approved: { text: '合同通过', icon: '✅', color: '#67C23A' },
  contract_change_created: { text: '增减项', icon: '📝', color: '#E6A23C' },
  contract_change_approved: { text: '增减项通过', icon: '✅', color: '#67C23A' },
  project_created: { text: '新项目', icon: '🏗️', color: '#67C23A' },
  project_status_changed: { text: '项目状态', icon: '🔄', color: '#67C23A' },
  project_progress: { text: '项目进展', icon: '📊', color: '#909399' },
  node_status_changed: { text: '节点状态', icon: '📍', color: '#E6A23C' },
  node_in_progress: { text: '节点进行中', icon: '⏳', color: '#E6A23C' },
  node_completed: { text: '节点完成', icon: '🎯', color: '#67C23A' },
  inspection_submit: { text: '巡检报告', icon: '🔍', color: '#F56C6C' },
  acceptance_submit: { text: '验收提交', icon: '✅', color: '#409EFF' },
  dispatch_created: { text: '派工通知', icon: '📋', color: '#E6A23C' },
  dispatch_status_changed: { text: '派工状态', icon: '🔔', color: '#E6A23C' },
  approval_submit: { text: '待审批', icon: '⏳', color: '#F56C6C' },
  approval_result: { text: '审批结果', icon: '🎯', color: '#67C23A' },
  notice_published: { text: '公告', icon: '📢', color: '#909399' },
  customer_follow: { text: '客户跟进', icon: '👤', color: '#409EFF' },
  collection_created: { text: '新建催收', icon: '📞', color: '#E6A23C' },
  collection_confirmed: { text: '催收回款', icon: '💵', color: '#67C23A' },
  invoice_created: { text: '发票', icon: '💰', color: '#67C23A' },
  purchase: { text: '采购', icon: '🛒', color: '#E6A23C' },
  project_file_pending: { text: '文件待审', icon: '📎', color: '#E6A23C' },
  project_file_approved: { text: '文件通过', icon: '📎', color: '#67C23A' },
  project_file_rejected: { text: '文件驳回', icon: '📎', color: '#F56C6C' },
  system_notice: { text: '系统通知', icon: '⚙️', color: '#909399' },
  inapp: { text: '通知', icon: '🔔', color: '#909399' }
}

/**
 * 历史脏数据兼容：messages 表里有 58 条 type 直接存了中文「采购」，
 * 统一归一成英文 code，否则既没图标也跳不动。
 */
const TYPE_ALIAS = {
  采购: 'purchase',
  合同: 'contract_created',
  增减项: 'contract_change_created',
  派工: 'dispatch_created',
  审批: 'approval_submit',
  巡检: 'inspection_submit',
  验收: 'acceptance_submit'
}

/** 取消息类型配置，未知类型给个兜底 */
export function msgTypeConfig(type) {
  const key = TYPE_ALIAS[type] || type
  return MSG_TYPE_CONFIG[key] || { text: type || '通知', icon: '📌', color: '#909399' }
}

/**
 * 消息 / 待办类型 → PC 路由。
 * 注意：这里按「事件类型」(type) 建表，例如 contract_created。
 * PC 端没有独立派工页（派工在项目详情里），统一落到 /projects。
 */
const TYPE_ROUTE = {
  // 采购
  purchase: '/purchase-requests',
  purchase_approve: '/purchase-requests',
  purchase_reimburse: '/purchase-requests',
  purchase_receipt: '/purchase-requests',
  // 审批
  approval: '/approvals',
  approval_submit: '/approvals',
  approval_result: '/approvals',
  // 派工
  dispatch: '/projects',
  dispatch_created: '/projects',
  dispatch_status_changed: '/projects',
  // 合同
  contract_approve: '/contracts',
  contract_created: '/contracts',
  contract_updated: '/contracts',
  contract_uploaded: '/contracts',
  contract_approved: '/contracts',
  // 增减项
  change_approve: '/change-orders',
  contract_change: '/change-orders',
  contract_change_created: '/change-orders',
  contract_change_approved: '/change-orders',
  // 项目 / 节点
  project: '/projects',
  project_created: '/projects',
  project_status_changed: '/projects',
  project_progress: '/projects',
  node_status_changed: '/projects',
  node_in_progress: '/projects',
  node_completed: '/projects',
  stage_due: '/projects',
  // 巡检 / 验收
  inspection_submit: '/inspection-logs',
  acceptance_submit: '/acceptance',
  // 项目文件
  project_file: '/project-files',
  project_file_pending: '/project-files',
  project_file_approved: '/project-files',
  project_file_rejected: '/project-files',
  // 财务
  collection_created: '/finance-projects',
  collection_confirmed: '/finance-projects',
  invoice_created: '/invoices',
  // 其他
  notice_published: '/notices',
  customer_follow: '/customers'
}

/**
 * 实体类型（source_type / related_type）→ PC 页面。
 * 2026-10-21 补：真实库里 source_type 存的是实体名（contract / project_log / dispatch / node /
 * rectification_issue / purchase_request ...），跟事件名完全不是一套；只按事件名建表会导致
 * 绝大多数消息「点击无反应」。这里补一张实体表做兜底。
 */
const ENTITY_ROUTE = {
  contract: '/contracts',
  contract_change: '/change-orders',
  project: '/projects',
  project_log: '/projects',
  node: '/projects',
  stage: '/projects',
  dispatch: '/projects',
  purchase: '/purchase-requests',
  purchase_request: '/purchase-requests',
  purchase_order: '/material-orders',
  approval: '/approvals',
  inspection: '/inspection-logs',
  rectification_issue: '/inspection-logs',
  acceptance: '/acceptance',
  project_file: '/project-files',
  collection: '/finance-projects',
  payment_record: '/finance-projects',
  invoice: '/invoices',
  notice: '/notices',
  customer: '/customers',
  employee: '/employees'
}

/**
 * 解析一条消息（或待办项）该跳到 PC 的哪个页面。
 * @param {{type?:string, source_type?:string, related_type?:string,
 *          source_id?:number|string, related_id?:number|string, id?:number|string}} item
 * @returns {{path:string, query:object}|null} null 表示没有对应页面（调用方走详情弹窗）
 */
export function resolvePcTarget(item) {
  if (!item) return null
  const type = TYPE_ALIAS[item.type] || item.type
  const sourceType = item.source_type || item.related_type
  const id = item.source_id ?? item.related_id ?? item.id

  // 1) 事件类型优先：它最能反映「这条消息要我去处理什么」
  const byType = TYPE_ROUTE[type]
  if (byType) {
    // id 属于哪个实体不确定，只有 source_type 也指向同一页面时才带上，避免把错的 id 传过去
    const samePage = sourceType && ENTITY_ROUTE[sourceType] === byType
    return samePage && id ? { path: byType, query: { id: String(id) } } : { path: byType, query: {} }
  }

  // 2) 退回实体类型（type 是未知/通用 inapp 时靠这条兜底）
  const byEntity = ENTITY_ROUTE[sourceType]
  if (byEntity) return id ? { path: byEntity, query: { id: String(id) } } : { path: byEntity, query: {} }

  return null
}
