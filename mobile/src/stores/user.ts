import { reactive } from "vue";

interface UserInfo {
  id: number;
  username: string;
  name: string;      // 后端返回的是 name 不是 nickname
  role_name: string;
  position: string;
  phone: string;
  token: string;
}

const state = reactive<UserInfo>({
  id: 0,
  username: "",
  name: "",
  role_name: "",
  position: "",
  phone: "",
  token: "",
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
    uni.setStorageSync("token", user.token);
    // 同时缓存用户信息
    uni.setStorageSync("userInfo", {
      id: user.id,
      username: user.username,
      name: user.name,
      role_name: user.role_name,
      position: user.position,
      phone: user.phone,
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
    uni.removeStorageSync("token");
    uni.removeStorageSync("userInfo");
    uni.reLaunch({ url: "/pages/login/login" });
  };

  return {
    state,
    setUser,
    loadUser,
    checkAuth,
    logout,
  };
};
