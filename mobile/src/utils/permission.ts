// 移动端权限映射中心
// 所有"角色 → 菜单/入口"的差异都在这里集中定义，页面只消费结果，不再硬编码角色名。
import { useUserStore } from "@/stores/user";

export interface TabPerm {
  index: number;   // 必须与 pages.json 的 tabBar.list 顺序一致
  path: string;
  perm: string;    // 空字符串 = 所有人可见
}

/**
 * 员工端原生 tabBar 的权限映射
 * ⚠️ 与微信小程序保持一致：tabBar 固定 5 项，原「派工」已移出 tabBar
 *    （派工页仍保留，从首页快捷入口「派工管理」进入）。
 *    改动 tabBar 顺序时务必同步 pages.json。
 */
export const TAB_BAR_PERMS: TabPerm[] = [
  { index: 0, path: "/pages/home/index", perm: "" },
  { index: 1, path: "/pages/projects/list", perm: "" },
  { index: 2, path: "/pages/inspection/list", perm: "inspection:read" },
  { index: 3, path: "/pages/purchase/list", perm: "purchase:read" },
  { index: 4, path: "/pages/mine/index", perm: "" },
];

/** 按当前用户权限动态隐藏/显示原生 tab（H5 / App 支持 visible，不支持的平台静默降级） */
export function applyRoleTabBar() {
  const store = useUserStore();
  // 客户（业主）使用 pages/customer/* 与自绘导航，不涉及原生 tabBar
  if (store.isCustomer()) return;

  // 关键守卫：uni.setTabBarItem 只在「当前页面是 tabBar 页」时才允许执行。
  // 在采购详情/审批详情等非 tabBar 页调用会异步 reject：
  //   "setTabBarItem:fail not TabBar page"
  // 老代码 try/catch 只接同步异常，异步 reject 漏出来就成了 unhandledrejection。
  // 这里先用 getCurrentPages 判定当前页是否是 tabBar，是再调 setTabBarItem，
  // 并给它加 fail 回调/Task.catch 兜底。
  let pages: any = [];
  try { pages = typeof getCurrentPages === 'function' ? (getCurrentPages() as any) : []; } catch (_) { pages = []; }
  const cur = pages && pages.length ? pages[pages.length - 1] : null;
  // uni-h5 的 route 是 'pages/home/index' 这种不带前杠、不带参数的形态
  const curRoute = (cur && (cur.route || cur.$page?.fullPath || '')) || '';
  const isTabBarPage = TAB_BAR_PERMS.some((t) => curRoute === t.path || curRoute.indexOf(t.path + '?') === 0);
  if (!isTabBarPage) return;

  TAB_BAR_PERMS.forEach((tab) => {
    if (!tab.perm) return; // 公共 tab 不动
    const visible = store.canSee(tab.perm);
    try {
      const task: any = uni.setTabBarItem({
        index: tab.index,
        visible,
      } as any);
      // 异步 reject 兜底（uni 返回 Task/Promise），catch 后静默
      if (task && typeof task.then === 'function') {
        task.catch(() => { /* 平台不支持/权限不足/非 tabBar 页，静默降级 */ });
      } else if (task && typeof task.on === 'function') {
        // 小程序侧 Task 形态
        try { task.on('fail', () => {}); } catch (_) { /* 忽略 */ }
      }
    } catch (_) {
      // 同步异常（参数错误、平台不支持）静默降级；页面级 guardTab 仍会兜底
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

/**
 * 登录守卫：需要身份的入口在点击时调用。
 * 未登录不直接跳转，而是弹窗让用户自己选「去登录 / 再逛逛」——
 * 微信审核明确要求登录环节必须提供可取消/拒绝的选择权，禁止强制跳转。
 * @returns true 表示已登录、可继续执行；false 表示已弹窗拦截
 */
export function requireLogin(content = "该功能需登录后使用"): boolean {
  if (uni.getStorageSync("token")) return true;
  uni.showModal({
    title: "需要登录",
    content,
    confirmText: "去登录",
    cancelText: "再逛逛",
    success: (res) => {
      if (res.confirm) {
        uni.navigateTo({ url: "/pages/login/login" });
      }
    },
  });
  return false;
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
  // v2.3.6: 首页快捷入口的"收支记录"原本 action=newFinance → 跳新建收支页（add.vue，写入老 finance 表），
  // 是命名和逻辑双重错位。改成 url 直跳全公司财务大盘（基于 payment_records 活数据）。
  { label: "公司财务", icon: "💰", bg: "#DBEAFE", url: "/pages/finance/dashboard", perm: "finance:read" },
  { label: "催收记录", icon: "💰", bg: "#DBEAFE", action: "newCollection", perm: "finance:write" },
  { label: "通讯录", icon: "📒", bg: "#EDE9FE", action: "addressbook", perm: "employee:read" },
  { label: "甘特图", icon: "📊", bg: "#FEE2E2", action: "gantt", perm: "" },
  { label: "客户", icon: "👤", bg: "#DBEAFE", action: "customer", perm: "customer:read" },
  // v2.3.4 新增：项目文件（设计师上传为主，财务/经理审核）
  { label: "项目文件", icon: "📎", bg: "#E0E7FF", url: "/pages/files/list", perm: "project_file:read" },
];

/** 项目文件分类（8 类，按装修业务高频排序） */
export interface FileCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export const FILE_CATEGORIES: FileCategory[] = [
  { key: "contract",              label: "合同",     icon: "📄", color: "#DBEAFE" },
  { key: "design_cad",            label: "设计图",   icon: "📐", color: "#FEF3C7" },
  { key: "design_render",         label: "效果图",   icon: "🖼️", color: "#D1FAE5" },
  { key: "point_layout",          label: "点位图",   icon: "🔌", color: "#EDE9FE" },
  { key: "construction_drawing",  label: "施工图",   icon: "📏", color: "#FEE2E2" },
  { key: "quote",                 label: "报价单",   icon: "💵", color: "#FEF3C7" },
  { key: "change_order",          label: "变更签证", icon: "✏️", color: "#FED7AA" },
  { key: "other",                 label: "其他",     icon: "📎", color: "#F3F4F6" },
];

export const FILE_CATEGORY_MAP: Record<string, FileCategory> = FILE_CATEGORIES.reduce(
  (m, c) => { m[c.key] = c; return m; }, {} as Record<string, FileCategory>
);

/** 文件状态显示 */
export function fileStatusText(s: string): string {
  const map: Record<string, string> = {
    pending: "待审核", approved: "已通过", rejected: "已拒绝", revoked: "已撤销",
  };
  return map[s] || s;
}
export function fileStatusColor(s: string): string {
  const map: Record<string, string> = {
    pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444", revoked: "#9CA3AF",
  };
  return map[s] || "#6B7280";
}

/** 文件扩展名 → 缩略图标（图片直显，其他显示分类图标） */
export function fileThumbIcon(ext: string): string {
  const e = (ext || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp"].includes(e)) return ""; // 空 = 图片直显
  if (e === "pdf") return "📕";
  if (["doc","docx"].includes(e)) return "📘";
  if (["xls","xlsx"].includes(e)) return "📗";
  if (["ppt","pptx"].includes(e)) return "📙";
  if (["dwg","dxf"].includes(e)) return "📐";
  if (["zip","rar"].includes(e)) return "🗜️";
  return "📎";
}

/** 文件大小字节转可读 */
export function fileSizeText(size: number): string {
  if (!size) return "0 B";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
  return (size / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

/** 「我的工作」快捷入口（按权限过滤） */
export const MY_WORK_ITEMS: EntryItem[] = [
  { label: "我的项目", icon: "📁", bg: "#DBEAFE", url: "/pages/projects/list", perm: "" },
  { label: "我的派工", icon: "👷", bg: "#FEF3C7", url: "/pages/dispatch/list", perm: "dispatch:read" },
  { label: "我的日志", icon: "📝", bg: "#D1FAE5", url: "/pages/mine/my-logs", perm: "" },
  { label: "我的巡检", icon: "🔍", bg: "#FEE2E2", url: "/pages/mine/my-inspections", perm: "inspection:read" },
  { label: "收支管理", icon: "💰", bg: "#DBEAFE", url: "/pages/finance/dashboard", perm: "finance:read" },
  { label: "采购审核", icon: "🛒", bg: "#FEF3C7", url: "/pages/purchase/list", perm: "purchase:approve" },
  { label: "财务受理", icon: "🧾", bg: "#E0E7FF", url: "/pages/purchase/list", perm: "purchase:finance" },
];

/** 按权限过滤入口列表 */
export function visibleEntries(items: EntryItem[]): EntryItem[] {
  const store = useUserStore();
  return (items || []).filter((it) => store.canSee(it.perm));
}

/**
 * uni.request 的鉴权请求头：后端 getUserId 优先读 x-user-id（见 server.js）。
 * 20+ 个页面都在手动拼 { 'x-user-id': String(id) }，这里收拢成一份，避免遗漏导致 401。
 * 注意：<img>/<iframe>/uni.previewImage 无法带自定义头，那类 URL 用 projectFileUrl（拼 query）。
 */
export function authHeader(uid?: number): Record<string, string> {
  let id: any = uid;
  if (!id) {
    try {
      id = (uni.getStorageSync("userInfo") || {}).id || 0;
    } catch (_) {
      id = 0;
    }
  }
  return { "x-user-id": String(id || "") };
}

/**
 * 项目文件下载/预览 URL（自动拼 user_id，供 <image>/<iframe>/uni.previewImage/window.open 用）
 *
 * ⚠️ H5 必须返回【绝对 URL】：uni-h5 的 <image> / uni.previewImage 会把以 "/" 开头的 src
 * 交给 getRealPath() 拼上 router.base="/m/"（见 manifest.json 的 h5.router.base），实际
 * 请求 /m/api/... —— 后端没有这条路由，命中 SPA fallback 返回 index.html（text/html），
 * 图片/预览必然裂开（后端 getUserId 支持 query.user_id，故 URL 里带 user_id 即可鉴权）。
 * getRealPath 对 http(s):// 开头的路径原样返回，用 location.origin 拼绝对 URL 绕过；
 * 小程序端没有 window/location，保持相对路径。
 *
 * @param id    文件 id
 * @param query 额外 query，如 '?user_id=1&inline=1'
 */
export function projectFileUrl(id: number, query = ""): string {
  const p = `/api/project-files/${id}/download${query}`;
  try {
    if (typeof window !== "undefined" && window.location && /^https?:/i.test(window.location.href)) {
      return window.location.origin + p;
    }
  } catch (_) {
    /* 非浏览器环境（小程序/App）走下边的相对路径 */
  }
  return p;
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
