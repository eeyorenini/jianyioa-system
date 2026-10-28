// 菜单配置 —— 全站唯一数据源
//
// 背景（2026-10-21）：左侧菜单写在 App.vue 里，个人中心的入口卡片又在 PersonalCenter.vue
// 里手写了第二份，两边各写各的必然漂移（个人中心缺了 20+ 个模块、还留着已下线的"渠道管理"）。
// 现在统一放这里：
//   - App.vue 左侧菜单读 MENU_CONFIG
//   - PersonalCenter.vue 读 buildPersonalSections()，按同一份 perm 过滤
// 以后加模块只改这一个文件，两边自动跟着变。

/**
 * 菜单树。perm 对应后端权限模块标识，无 perm 表示所有登录用户可见；
 * 管理员（userStore.isAdmin）由 can() 内部直接放行。
 * type: 'item' 单页 / 'group' 分组
 */
export const MENU_CONFIG = [
  { type: 'item', path: '/personal-center', icon: 'User', title: '个人中心' },
  { type: 'item', path: '/dashboard', icon: 'DataAnalysis', title: '数据看板' },
  {
    type: 'group', index: 'customer-group', icon: 'User', title: '客户服务',
    children: [
      { path: '/customers', title: '客户列表', perm: 'customer' },
      { path: '/wechat-users', title: '微信客户', perm: 'customer' },
      { path: '/sms-templates', title: '短信模板', perm: 'sms' }
    ]
  },
  {
    type: 'group', index: 'contract-group', icon: 'Document', title: '合同管理',
    children: [
      { path: '/contracts', title: '合同编辑', perm: 'contract' },
      { path: '/contract-templates', title: '合同模板', perm: 'contract' }
    ]
  },
  {
    type: 'group', index: 'project-group', icon: 'FolderOpened', title: '项目管理',
    children: [
      { path: '/projects', title: '工程管理', perm: 'project' },
      { path: '/project-files', title: '项目文件', perm: 'project_file' },
      { path: '/change-orders', title: '增减项管理', perm: 'contract_change' },
      { path: '/project-logs', title: '施工日志', perm: 'project_log' },
      { path: '/inspection-logs', title: '巡检日志', perm: 'inspection' },
      { path: '/quotes', title: '报价管理', perm: 'quote' },
      { path: '/acceptance', title: '验收管理', perm: 'acceptance' },
      { path: '/progress-node-templates', title: '节点模板', perm: 'project' }
    ]
  },
  {
    type: 'group', index: 'material-group', icon: 'Box', title: '材料管理',
    children: [
      { path: '/main-materials', title: '主材管理', perm: 'material' },
      // v2.5.1 商城管理：主材勾「上架商城」即在此处出现；也可在此单独上架/改商城价与库存
      { path: '/mall', title: '商城管理', perm: 'material' },
      // v2.4.1：工长对进场材料的逐项验收（与移动端「主材验收」同一模块）
      { path: '/material-acceptance', title: '材料验收', perm: 'material_acceptance' },
      // { path: '/suppliers', title: '供应商管理', perm: 'supplier' }, // v2.3.1 已合并到外部联系人
      { path: '/warehouse', title: '仓库管理', perm: 'warehouse' },
      { path: '/material-orders', title: '采购订单', perm: 'purchase' },
      { path: '/purchase-requests', title: '采购申请', perm: 'purchase' }
    ]
  },
  {
    type: 'group', index: 'approval-group', icon: 'Checked', title: '行政审批',
    children: [
      { path: '/approvals', title: '审批管理', perm: 'approval' },
      { path: '/reports', title: '工作汇报', perm: 'report' },
      { path: '/notices', title: '公告管理', perm: 'notice' }
    ]
  },
  {
    type: 'group', index: 'org-group', icon: 'Grid', title: '组织结构',
    children: [
      { path: '/employees', title: '员工管理', perm: 'employee' },
      // v2.3.1 外部联系人：工人/供应商/设计师等独立模块（在员工管理下）
      { path: '/external-contacts', title: '外部联系人', perm: 'external_contact' },
      { path: '/roles', title: '角色权限', perm: 'role' },
      { path: '/customer-visibility', title: '业主端可见配置', perm: 'settings' },
      { path: '/departments', title: '部门管理', perm: 'department' }
    ]
  },
  {
    type: 'group', index: 'system-group', icon: 'Tools', title: '系统设置',
    children: [
      { path: '/system-settings', title: 'API接口', perm: 'settings' },
      { path: '/operation-logs', title: '操作日志', perm: 'settings' },
      { path: '/system-logs', title: '系统日志', perm: 'settings' }
    ]
  },
  { type: 'item', path: '/finance-projects', icon: 'Wallet', title: '财务管理', perm: 'finance' },
  { type: 'item', path: '/budgets', icon: 'Money', title: '预算报价', perm: 'budget' },
  { type: 'item', path: '/invoices', icon: 'Ticket', title: '发票管理', perm: 'invoice' },
  { type: 'item', path: '/todo', icon: 'AlarmClock', title: '待办中心' },
  { type: 'item', path: '/message-center', icon: 'Bell', title: '消息中心' }
]

/** 个人中心卡片的展示文案（图标/一句话说明/配色），key 为路由 path */
export const ENTRY_META = {
  '/customers': { emoji: '👤', desc: '客户档案与跟进', theme: 'blue' },
  '/wechat-users': { emoji: '💬', desc: '微信绑定的客户', theme: 'cyan' },
  '/sms-templates': { emoji: '✉️', desc: '短信文案模板', theme: 'teal' },

  '/contracts': { emoji: '📄', desc: '合同录入与编辑', theme: 'blue' },
  '/contract-templates': { emoji: '📋', desc: '合同模板管理', theme: 'purple' },

  '/projects': { emoji: '🏗️', desc: '项目全流程管理', theme: 'blue' },
  '/project-files': { emoji: '📎', desc: '图纸与凭证归档', theme: 'cyan' },
  '/change-orders': { emoji: '➕', desc: '合同增减项', theme: 'orange' },
  '/project-logs': { emoji: '📝', desc: '每日施工记录', theme: 'teal' },
  '/inspection-logs': { emoji: '🔍', desc: '工地巡检记录', theme: 'red' },
  '/quotes': { emoji: '💲', desc: '报价单管理', theme: 'green' },
  '/acceptance': { emoji: '✅', desc: '节点与竣工验收', theme: 'green' },
  '/progress-node-templates': { emoji: '🧩', desc: '施工节点模板', theme: 'purple' },

  '/main-materials': { emoji: '🧱', desc: '主材档案', theme: 'orange' },
  '/mall': { emoji: '🛍️', desc: '商城上架与订单', theme: 'green' },
  '/material-acceptance': { emoji: '📦', desc: '进场材料逐项验收', theme: 'orange' },
  '/warehouse': { emoji: '📦', desc: '库存出入库', theme: 'teal' },
  '/material-orders': { emoji: '🛒', desc: '采购订单', theme: 'green' },
  '/purchase-requests': { emoji: '📝', desc: '采购申请与报销', theme: 'orange' },

  '/approvals': { emoji: '✅', desc: '请假 / 报销 / 通用审批', theme: 'blue' },
  '/reports': { emoji: '📊', desc: '工作汇报', theme: 'purple' },
  '/notices': { emoji: '📢', desc: '公司公告', theme: 'orange' },

  '/finance-projects': { emoji: '💼', desc: '项目收支 / 应收实收', theme: 'green' },
  '/budgets': { emoji: '🧮', desc: '预算编制', theme: 'blue' },
  '/invoices': { emoji: '🧾', desc: '开票与发票记录', theme: 'red' },

  '/todo': { emoji: '⏰', desc: '待我处理的事项', theme: 'orange' },
  '/message-center': { emoji: '🔔', desc: '系统消息与通知', theme: 'blue' }
}

/**
 * 个人中心展示的业务分组（按用户确认：只放业务模块，
 * 不含「组织结构」「系统设置」这类管理配置，也不含个人中心/数据看板自身）。
 * key 对应 MENU_CONFIG 里的 group index；带 paths 的表示由散落的单页项组成。
 */
export const BIZ_GROUPS = [
  { key: 'customer-group', title: '客户服务', icon: '👥' },
  { key: 'contract-group', title: '合同管理', icon: '📄' },
  { key: 'project-group', title: '项目管理', icon: '🏗️' },
  { key: 'material-group', title: '材料管理', icon: '📦' },
  { key: 'approval-group', title: '行政审批', icon: '🗂️' },
  { key: '__finance', title: '财务', icon: '💰', paths: ['/finance-projects', '/budgets', '/invoices'] },
  { key: '__ops', title: '待办与消息', icon: '🔔', paths: ['/todo', '/message-center'] }
]

/**
 * 生成个人中心的分组卡片。
 * @param {(perm:string)=>boolean} can 权限判定，直接传 userStore.can
 * @returns {Array<{title:string, icon:string, items:Array}>}
 */
export function buildPersonalSections(can) {
  // 先把菜单树摊平成 path -> 节点，避免每组各找一遍
  const byPath = {}
  for (const m of MENU_CONFIG) {
    if (m.type === 'item') {
      byPath[m.path] = m
    } else {
      for (const c of m.children || []) byPath[c.path] = c
    }
  }

  const sections = []
  for (const g of BIZ_GROUPS) {
    let nodes = []
    if (g.paths) {
      nodes = g.paths.map((p) => byPath[p]).filter(Boolean)
    } else {
      const grp = MENU_CONFIG.find((m) => m.type === 'group' && m.index === g.key)
      nodes = grp ? grp.children || [] : []
    }
    // 同一份权限口径：无 perm 全可见，有 perm 走 can()
    const visible = nodes.filter((it) => !it.perm || can(it.perm))
    if (!visible.length) continue

    sections.push({
      title: g.title,
      icon: g.icon,
      items: visible.map((it) => {
        const meta = ENTRY_META[it.path] || {}
        return {
          name: it.title,
          desc: meta.desc || '',
          emoji: meta.emoji || '📌',
          path: it.path,
          theme: meta.theme || 'blue'
        }
      })
    })
  }
  return sections
}
