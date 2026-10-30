import { reactive } from "vue";

interface UserInfo {
  id: number;
  username: string;
  name: string;
  role_name: string;
  role_code: string;
  position: string;
  phone: string;
  token: string;
  permissions: string[];
}

const state = reactive<UserInfo>({
  id: 0,
  username: "",
  name: "",
  role_name: "",
  role_code: "",
  position: "",
  phone: "",
  token: "",
  permissions: [],
});

// 借权相关状态（仅 admin 使用）
const imp = reactive({
  isAdmin: false,
  impersonating: false,
  impersonatorName: "", // 原管理员姓名
  targetName: "",       // 当前借权对象的姓名
  targetRole: "",       // 当前借权对象的角色名
});

// 客户端（业主）可见配置 —— v2.3.1 P4
// 8 项开关由后台「客户端可见配置」页控制，全局一份
const customerVisibility = reactive({
  loaded: false,
  project_info: true,
  project_log: true,
  inspection: true,
  acceptance: true,
  rectification: true,
  contract_amount: false, // 默认关（敏感财务）
  family_members: true,
  messages: true,
});

/** 从后端拉取客户可见配置。失败时保持默认值（不让登录阻塞） */
const loadCustomerVisibility = async () => {
  try {
    const res: any = await uni.request({ url: '/api/system-settings/customer_visibility' });
    if (res?.data && typeof res.data === 'object') {
      Object.assign(customerVisibility, res.data, { loaded: true });
    } else {
      customerVisibility.loaded = true;
    }
  } catch (e) {
    customerVisibility.loaded = true; // 默认放行（防止 500 卡住）
  }
};

/** 客户端某一类是否可见（如 'project_log'） */
const canCustomerSee = (key: keyof typeof customerVisibility): boolean => {
  if (key === 'loaded') return true;
  return !!(customerVisibility as any)[key];
};

const parsePerms = (perms: any): string[] => {
  if (!perms) return [];
  if (typeof perms === "string") {
    try { return JSON.parse(perms); } catch { return []; }
  }
  if (Array.isArray(perms)) return perms;
  return [];
};

export const useUserStore = () => {
  const setUser = (user: UserInfo) => {
    state.id = user.id;
    state.username = user.username;
    state.name = user.name;
    state.role_name = user.role_name || "";
    state.role_code = (user as any).role_code || "";
    state.position = user.position || "";
    state.phone = user.phone || "";
    state.token = user.token;
    const perms = parsePerms((user as any).permissions || (user as any).role_permissions);
    state.permissions = perms;
    uni.setStorageSync("token", user.token);
    uni.setStorageSync("userInfo", {
      id: user.id,
      username: user.username,
      name: user.name,
      role_name: user.role_name,
      role_code: (user as any).role_code || "",
      position: user.position,
      phone: user.phone,
      permissions: perms,
    });
  };

  const loadUser = () => {
    const info = uni.getStorageSync("userInfo");
    if (info) {
      state.id = info.id;
      state.username = info.username;
      state.name = info.name;
      state.role_name = info.role_name;
      state.role_code = info.role_code || "";
      state.position = info.position;
      state.phone = info.phone;
      state.token = uni.getStorageSync("token") || "";
      state.permissions = parsePerms(info.permissions || info.role_permissions);
    }
    // 恢复借权状态
    const impFlag = uni.getStorageSync("impersonating");
    const impAdmin = uni.getStorageSync("impersonator");
    imp.impersonating = !!impFlag;
    imp.impersonatorName = impAdmin?.name || "";
    if (imp.impersonating) {
      imp.targetName = state.name;
      imp.targetRole = state.role_name || state.position || "";
    }
  };

  // 从服务端拉取"当前身份"，判断是否管理员（权威判定）
  const fetchMe = async () => {
    try {
      if (!state.id) return;
      const res: any = await uni.request({
        url: "/api/me",
        header: { "x-user-id": String(state.id) },
      });
      if (res?.data && typeof res.data.is_admin !== "undefined") {
        imp.isAdmin = !!res.data.is_admin;
        // 以服务端返回的权限为准（借权切换后会随身份变化）
        if (Array.isArray(res.data.permissions)) {
          state.permissions = res.data.permissions;
          const cur = uni.getStorageSync("userInfo") || {};
          uni.setStorageSync("userInfo", { ...cur, permissions: res.data.permissions });
        }
      }
    } catch (e) {
      // 忽略
    }
  };

  // ============ 登录守卫 ============
  // 微信审核要求「先体验后授权」：未登录时必须允许浏览公开页面，
  // 不得一进小程序就强制跳登录页。故只有受保护页面才拦截。
  // 注意 pages/bind/index 属于登录流程本身（微信静默登录 + 手机号绑定），必须放行，
  // 否则冷启动直达时会被守卫踢回登录页。
  // pages/showcase/index 是「样板工地」游客体验页：纯静态演示数据，不请求任何接口，
  // 微信审核要求「先体验后授权」，未登录必须能进，否则引导页的「先逛逛」按钮会失效。
  // pages/bind/scan 是员工扫码绑定落地页：进页面时还没有身份，绑定成功后才写 storage，
  // 必须放行，否则会被守卫踢走，绑定码白扫。
  // pages/identity/select 是双身份（员工+业主）选择页：同理，选之前还没有身份。
  const PUBLIC_PAGES = [
    "pages/landing/index",
    "pages/showcase/index",
    "pages/login/login",
    "pages/bind/index",
    "pages/bind/scan",
    "pages/identity/select",
    // 验收报告分享页：业主 / 潜在客户点开分享卡片直接看，凭 ?token= 免登录。
    // 不带 token 时接口 401，页面提示「报告不存在」，不会泄露数据。
    // ⚠️ 小程序端该页在 pkg-inspect 分包，构建期 subpackagePaths 会把路径改写成
    //    pkg-inspect/acceptance/report，所以两种写法都要在白名单里，否则业主被踢回登录页。
    "pages/acceptance/report",
    "pkg-inspect/acceptance/report",
  ];

  /** 安全取页面栈（小程序 / H5 都可用，取不到返回空数组） */
  const getPages = (): any[] => {
    try {
      const fn: any =
        typeof getCurrentPages === "function"
          ? getCurrentPages
          : (globalThis as any).getCurrentPages;
      return typeof fn === "function" ? fn() || [] : [];
    } catch (_) {
      return [];
    }
  };

  /** 当前路由；冷启动时页面栈为空，回退到启动参数里的 path */
  const currentRoute = (): string => {
    const pages = getPages();
    if (pages.length) {
      const cur: any = pages[pages.length - 1];
      return (cur && (cur.route || cur.$page?.fullPath)) || "";
    }
    try {
      const opt: any =
        (uni as any).getEnterOptionsSync?.() || (uni as any).getLaunchOptionsSync?.();
      return String(opt?.path || "").replace(/^\//, "");
    } catch (_) {
      return "";
    }
  };

  /** 是否处于免登录页（拿不到路由时放行，交给页面自身守卫） */
  const isPublicPage = (): boolean => {
    const route = currentRoute();
    if (!route) return true;
    return PUBLIC_PAGES.some((p) => route === p || route.indexOf(p) === 0);
  };

  const checkAuth = () => {
    const token = uni.getStorageSync("token");
    if (token) {
      loadUser();
      return;
    }
    // 未登录：仅在受保护页面强制跳登录，公开页放行
    if (!isPublicPage()) {
      uni.reLaunch({ url: "/pages/login/login" });
    }
  };

  const logout = () => {
    state.id = 0;
    state.username = "";
    state.name = "";
    state.role_name = "";
    state.role_code = "";
    state.position = "";
    state.phone = "";
    state.token = "";
    state.permissions = [];
    imp.isAdmin = false;
    imp.impersonating = false;
    imp.impersonatorName = "";
    imp.targetName = "";
    imp.targetRole = "";
    uni.removeStorageSync("token");
    uni.removeStorageSync("userInfo");
    uni.removeStorageSync("impersonator");
    uni.removeStorageSync("impersonating");
    // 身份类型与业主主账户 id 必须一起清：x-user-type 现在是后端区分「员工/业主」的依据，
    // 残留会让下一次登录带着上一个身份的标识（业主登出后员工登录会被当成客户）。
    uni.removeStorageSync("userType");
    uni.removeStorageSync("masterCustomerId");
    uni.removeStorageSync("masterPhone");
    // v2.5.3：副账户自己的成员 id，留着会让下一个登录的人被当成这家的成员
    uni.removeStorageSync("familyMemberId");
    uni.reLaunch({ url: "/pages/login/login" });
  };

  // ============ 权限判定（与服务端 isAdminRoleInfo 保持一致） ============

  // 是否管理员：role_code=admin 或登录名 admin（与后端完全一致）
  const isAdminUser = () => state.role_code === "admin" || state.username === "admin";

  // 当前权限数组
  const permissionList = (): string[] => (Array.isArray(state.permissions) ? state.permissions : []);

  // 是否已配置权限（用于菜单可见性的宽容降级：未配置=不限制）
  const hasConfiguredPerms = () => permissionList().length > 0;

  // 严格判定：是否拥有某权限（管理员直通，支持 * 通配）
  const can = (perm: string): boolean => {
    if (!perm) return true;
    if (isAdminUser()) return true;
    const list = permissionList();
    return list.includes("*") || list.includes(perm);
  };

  // 任一权限满足即可
  const canAny = (perms: string[]): boolean => (perms || []).some((p) => can(p));

  // 菜单/入口可见性（宽容降级）：
  //  - 管理员 → 全部可见
  //  - 未配置权限的角色 → 不限制（向后兼容，避免把老角色锁死）
  //  - 已配置权限 → 按权限判定，并兼容"仅模块名"的旧格式
  //  - 兼容：`xxx:read_all` 自动覆盖 `xxx:read`（与后端 perm.js canAction 对齐，
  //    修复财务等持有 read_all 但无 read 的角色看不到对应菜单的 bug）
  const canSee = (perm?: string): boolean => {
    if (!perm) return true;
    if (isAdminUser()) return true;
    if (!hasConfiguredPerms()) return true;
    const list = permissionList();
    if (list.includes("*") || list.includes(perm)) return true;
    const colonIdx = perm.indexOf(":");
    if (colonIdx > 0) {
      const mod = perm.slice(0, colonIdx);
      const action = perm.slice(colonIdx + 1);
      if (action === "read" && list.includes(`${mod}:read_all`)) return true;
    }
    const mod = perm.split(":")[0];
    return !!mod && list.includes(mod);
  };

  // 是否为客户端（业主）身份：客户登录走 /api/customers/login，不使用员工 tabBar
  const isCustomer = (): boolean => {
    if (state.role_code === "customer") return true;
    try { return uni.getStorageSync("userType") === "customer"; } catch { return false; }
  };

  // 兼容旧调用点
  const hasPermission = (perm: string) => can(perm);

  // 开始借权：保存原管理员身份，切换到目标员工
  const startImpersonate = (targetUser: any) => {
    const adminInfo = {
      id: state.id,
      username: state.username,
      name: state.name,
      role_name: state.role_name,
      role_code: state.role_code,
      position: state.position,
      phone: state.phone,
      permissions: state.permissions,
    };
    uni.setStorageSync("impersonator", adminInfo);
    uni.setStorageSync("impersonating", "1");
    setUser({
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      role_name: targetUser.role_name || "",
      role_code: targetUser.role_code || "",
      position: targetUser.position || "",
      phone: targetUser.phone || "",
      token: "logged-in",
      permissions: targetUser.permissions || [],
    } as any);
    imp.impersonating = true;
    imp.impersonatorName = adminInfo.name || "";
    imp.targetName = targetUser.name || "";
    imp.targetRole = targetUser.role_name || targetUser.position || "";
  };

  // 结束借权：恢复原管理员身份
  const stopImpersonate = () => {
    const adminInfo = uni.getStorageSync("impersonator");
    uni.removeStorageSync("impersonator");
    uni.removeStorageSync("impersonating");
    imp.impersonating = false;
    imp.targetName = "";
    imp.targetRole = "";
    if (adminInfo) {
      setUser({
        id: adminInfo.id,
        username: adminInfo.username,
        name: adminInfo.name,
        role_name: adminInfo.role_name,
        role_code: adminInfo.role_code,
        position: adminInfo.position,
        phone: adminInfo.phone,
        token: "logged-in",
        permissions: adminInfo.permissions || [],
      } as any);
    }
  };

  return {
    state,
    imp,
    customerVisibility,
    loadCustomerVisibility,
    canCustomerSee,
    setUser,
    loadUser,
    fetchMe,
    checkAuth,
    isPublicPage,
    logout,
    hasPermission,
    can,
    canAny,
    canSee,
    isAdminUser,
    isCustomer,
    hasConfiguredPerms,
    permissionList,
    startImpersonate,
    stopImpersonate,
  };
};
