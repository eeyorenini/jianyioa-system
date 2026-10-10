// 移动端权限映射中心
// 所有"角色 → 菜单/入口"的差异都在这里集中定义，页面只消费结果，不再硬编码角色名。
import { useUserStore } from "@/stores/user";

export interface TabPerm {
  index: number;   // 必须与 pages.json 的 tabBar.list 顺序一致
  path: string;
  perm: string;    // 空字符串 = 所有人可见
}

/** 员工端原生 tabBar 的权限映射 */
export const TAB_BAR_PERMS: TabPerm[] = [
  { index: 0, path: "/pages/home/index", perm: "" },
  { index: 1, path: "/pages/projects/list", perm: "" },
  { index: 2, path: "/pages/inspection/list", perm: "inspection:read" },
  { index: 3, path: "/pages/dispatch/list", perm: "dispatch:read" },
  { index: 4, path: "/pages/purchase/list", perm: "purchase:read" },
  { index: 5, path: "/pages/mine/index", perm: "" },
];

/** 按当前用户权限动态隐藏/显示原生 tab（H5 / App 支持 visible，不支持的平台静默降级） */
export function applyRoleTabBar() {
  const store = useUserStore();
  // 客户（业主）使用 pages/customer/* 与自绘导航，不涉及原生 tabBar
  if (store.isCustomer()) return;
  TAB_BAR_PERMS.forEach((tab) => {
    if (!tab.perm) return; // 公共 tab 不动
    try {
      uni.setTabBarItem({
        index: tab.index,
        visible: store.canSee(tab.perm),
      } as any);
    } catch (e) {
      // 平台不支持 visible 时忽略；页面级 guardTab 仍会兜底
    }
  });
}

/** tab 页守卫：无权限时退回首页（防止用户从外部链接直达无权限 tab） */
export function guardTab(perm: string) {
  const store = useUserStore();
  if (!store.canSee(perm)) {
    uni.switchTab({ url: "/pages/home/index" });
    return false;
  }
  return true;
}

export interface EntryItem {
  label: string;
  icon: string;
  bg: string;
  action?: string;
  url?: string;
  perm: string; // 空字符串 = 所有人可见
}

/** 首页快捷入口（按权限过滤） */
export const HOME_QUICK_ENTRIES: EntryItem[] = [
  { label: "项目管理", icon: "📁", bg: "#DBEAFE", action: "projectList", perm: "" },
  { label: "新建项目", icon: "📋", bg: "#D1FAE5", action: "newProject", perm: "project:write" },
  { label: "施工日志", icon: "📝", bg: "#D1FAE5", action: "newLog", perm: "project:write" },
  { label: "质量巡检", icon: "🔍", bg: "#FEE2E2", action: "newInspect", perm: "inspection:write" },
  { label: "派工管理", icon: "👷", bg: "#FEF3C7", action: "newDispatch", perm: "dispatch:write" },
  { label: "主材管理", icon: "🧱", bg: "#EDE9FE", action: "newMaterial", perm: "purchase:read" },
  { label: "验收管理", icon: "✅", bg: "#D1FAE5", action: "newAccept", perm: "acceptance:read" },
  { label: "增减项", icon: "📄", bg: "#FEF3C7", action: "newChange", perm: "contract_change:write" },
  { label: "收支记录", icon: "💰", bg: "#DBEAFE", action: "newFinance", perm: "finance:write" },
  { label: "催收记录", icon: "💰", bg: "#DBEAFE", action: "newCollection", perm: "finance:write" },
  { label: "通讯录", icon: "📒", bg: "#EDE9FE", action: "addressbook", perm: "employee:read" },
  { label: "甘特图", icon: "📊", bg: "#FEE2E2", action: "gantt", perm: "" },
  { label: "客户", icon: "👤", bg: "#DBEAFE", action: "customer", perm: "customer:read" },
];

/** 「我的工作」快捷入口（按权限过滤） */
export const MY_WORK_ITEMS: EntryItem[] = [
  { label: "我的项目", icon: "📁", bg: "#DBEAFE", url: "/pages/projects/list", perm: "" },
  { label: "我的派工", icon: "👷", bg: "#FEF3C7", url: "/pages/dispatch/list", perm: "dispatch:read" },
  { label: "我的日志", icon: "📝", bg: "#D1FAE5", url: "/pages/mine/my-logs", perm: "" },
  { label: "我的巡检", icon: "🔍", bg: "#FEE2E2", url: "/pages/mine/my-inspections", perm: "inspection:read" },
  { label: "收支管理", icon: "💰", bg: "#DBEAFE", url: "/pages/finance/list", perm: "finance:read" },
  { label: "采购审核", icon: "🛒", bg: "#FEF3C7", url: "/pages/purchase/list", perm: "purchase:approve" },
  { label: "财务受理", icon: "🧾", bg: "#E0E7FF", url: "/pages/purchase/list", perm: "purchase:finance" },
];

/** 按权限过滤入口列表 */
export function visibleEntries(items: EntryItem[]): EntryItem[] {
  const store = useUserStore();
  return (items || []).filter((it) => store.canSee(it.perm));
}

/** 角色样式 class（优先 role_code，兼容中文角色名，避免各处重复 includes 判断） */
export function roleClass(roleCode?: string, roleName?: string): string {
  const code = (roleCode || "").toLowerCase();
  const name = roleName || "";
  if (code === "admin" || name.includes("管理")) return "role-admin";
  if (code === "designer" || name.includes("设计")) return "role-designer";
  if (code === "supervisor" || name.includes("监理")) return "role-supervisor";
  if (code === "finance" || name.includes("财务")) return "role-finance";
  if (code === "customer" || name.includes("业主") || name.includes("客户")) return "role-owner";
  if (code === "project_manager" || name.includes("经理") || name.includes("工长")) return "role-worker";
  if (name.includes("主材")) return "role-material";
  return "role-default";
}
