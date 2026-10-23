/**
 * 巡检整改状态归一化 —— PC 端唯一口径（与移动端 utils/rectify.ts 保持一致）
 *
 * 背景（2026-10-23）：
 * rectification_issues.status 在库里实际存的是「待处理」「已完成」，
 * 而历史代码各处还写着「待整改」「整改中」「已整改」…… 各端各判各的。
 * 统一到这里，移动端与 PC 端行为一致。
 *
 * 业务流程（2026-10-23 重构）：
 *   监理提交巡检问题 → 【待处理】
 *     └─ 工长受理（可同时修改整改截止时间）→ 【处理中】
 *          ├─ 到期未完成 → 申请延期（改时间 + 必填原因，记 delay_log）→ 仍【处理中】
 *          └─ 完成申报 → 【已完成】（终态，归档凭证，任何角色不可回退）
 */

/** 归一化后的三种状态 */
export const RECTIFY_STATE_TEXT = {
  pending: '待处理',
  fixing: '处理中',
  done: '已完成'
}

/**
 * 把任意历史/脏值状态归一成 pending / fixing / done。
 * @param {*} raw status 或 rectify_status 字段的原始值（可能是 null/undefined）
 * @returns {'pending'|'fixing'|'done'}
 */
export function normalizeRectifyStatus(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase()
  if (!s) return 'pending'

  // 已完成类：已完成 / 已整改 / 已验收 / 已处理 + 英文 completed/verified/done/fixed
  if (
    s.includes('已完成') ||
    s.includes('已整改') ||
    s.includes('已验收') ||
    s.includes('已处理') ||
    s === 'completed' ||
    s === 'verified' ||
    s === 'done' ||
    s === 'fixed'
  ) {
    return 'done'
  }

  // 进行中类：处理中 / 整改中 + fixing/in_progress/processing
  if (
    s.includes('处理中') ||
    s.includes('整改中') ||
    s === 'fixing' ||
    s === 'in_progress' ||
    s === 'processing'
  ) {
    return 'fixing'
  }

  // 其余（待处理 / 待整改 / pending / 未知值）一律算待处理
  return 'pending'
}

/** 是否还能受理（仅待处理） */
export function canAccept(raw) {
  return normalizeRectifyStatus(raw) === 'pending'
}

/** 是否能申请延期（仅处理中） */
export function canDelay(raw) {
  return normalizeRectifyStatus(raw) === 'fixing'
}

/** 是否能申报完成（待处理 / 处理中 都可以；已完成是终态） */
export function canComplete(raw) {
  return normalizeRectifyStatus(raw) !== 'done'
}

/** 兼容旧名：是否允许整改操作（= 能结案） */
export function canMarkRectified(raw) {
  return canComplete(raw)
}

/** 取展示文案 */
export function rectifyStatusText(raw) {
  return RECTIFY_STATE_TEXT[normalizeRectifyStatus(raw)]
}

/** 解析延期历史（delay_log 是 JSON 字符串，容错返回数组） */
export function parseDelayLog(raw) {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
