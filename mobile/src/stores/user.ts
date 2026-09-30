import { reactive } from "vue";

interface UserInfo {
  id: number;
  username: string;
  name: string;
  role_name: string;
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
  position: "",
  phone: "",
  token: "",
  permissions: [],
});

export const useUserStore = () => {
  const setUser = (user: UserInfo) => {
    state.id = user.id;
    state.username = user.username;
    state.name = user.name;
    state.role_name = user.role_name || "";
    state.position = user.position || "";
    state.phone = user.phone || "";
    state.token = user.token;
    // 解析权限列表（可能是 JSON 字符串或数组）
    let perms: string[] = [];
    if (user.permissions) {
      if (typeof user.permissions === 'string') {
        try { perms = JSON.parse(user.permissions); } catch { perms = []; }
      } else if (Array.isArray(user.permissions)) {
        perms = user.permissions;
      }
    }
    state.permissions = perms;
    uni.setStorageSync("token", user.token);
    uni.setStorageSync("userInfo", {
      id: user.id,
      username: user.username,
      name: user.name,
      role_name: user.role_name,
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
      state.position = info.position;
      state.phone = info.phone;
      state.token = uni.getStorageSync("token") || "";
      let perms: string[] = [];
      if (info.permissions) {
        if (typeof info.permissions === 'string') {
          try { perms = JSON.parse(info.permissions); } catch { perms = []; }
        } else if (Array.isArray(info.permissions)) {
          perms = info.permissions;
        }
      }
      state.permissions = perms;
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
    state.position = "";
    state.phone = "";
    state.token = "";
    state.permissions = [];
    uni.removeStorageSync("token");
    uni.removeStorageSync("userInfo");
    uni.reLaunch({ url: "/pages/login/login" });
  };

  const hasPermission = (perm: string) => {
    return state.permissions.includes(perm);
  };

  return {
    state,
    setUser,
    loadUser,
    checkAuth,
    logout,
    hasPermission,
  };
};
