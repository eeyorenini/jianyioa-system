/**
 * 格式化节点日期区间
 * 同一天只显示 "9月14日"，不同天显示 "9月14日 ~ 9月18日"
 * @param {string} planDate
 * @param {string} planEndDate
 * @returns {string}
 */
export function formatNodeDateRange(planDate, planEndDate) {
  if (!planDate) return '';
  const fmt = (d) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };
  if (!planEndDate || planDate === planEndDate) {
    return fmt(planDate);
  }
  return `${fmt(planDate)} ~ ${fmt(planEndDate)}`;
}
