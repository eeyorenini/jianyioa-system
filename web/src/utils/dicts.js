// 枚举字段中文名字典
// 说明：数据库里部分枚举字段存的是英文 code，界面一律走这里翻译成中文，
//       禁止在模板里直接 {{ row.xxx }} 输出英文 code。
// 与移动端 jianyioa-app/mobile/src/pages/finance/finance-records.vue 的 categoryLabels 保持一致。

/** 收支记录类别 payment_records.category */
export const PAYMENT_CATEGORY_LABELS = {
  contract: '合同',
  contract_change: '增减项',
  dispatch: '派工',
  collection: '催收',
  manual: '手动录入'
}

/** 收支记录状态 payment_records.status */
export const PAYMENT_STATUS_LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消'
}

/** 合同模板分类 contract_templates.category */
export const CONTRACT_TEMPLATE_CATEGORY_LABELS = {
  decoration: '装修合同',
  design: '设计合同',
  other: '其他'
}

/**
 * 按字典翻译枚举值。
 * 字典里没有的值原样返回（兼容历史中文数据），空值返回占位符。
 * @param {Object} map 字典
 * @param {*} value 原始值
 * @param {string} placeholder 空值占位
 */
export function dictLabel(map, value, placeholder = '-') {
  if (value === null || value === undefined || value === '') return placeholder
  return map[value] ?? value
}
