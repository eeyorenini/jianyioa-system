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

  const checkAuth = () => {
    const token = uni.getStorageSync("token");
    if (!token) {
      uni.reLaunch({ url: "/pages/login/login" });
    } else {
      loadUser();
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
  const canSee = (perm?: string): boolean => {
    if (!perm) return true;
    if (isAdminUser()) return true;
    if (!hasConfiguredPerms()) return true;
    const list = permissionList();
    if (list.includes("*") || list.includes(perm)) return true;
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
    setUser,
    loadUser,
    fetchMe,
    checkAuth,
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
