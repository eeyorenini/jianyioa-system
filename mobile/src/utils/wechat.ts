// 微信登录能力封装
//
// 背景：微信自 2022-10-25 起回收了 wx.getUserProfile，小程序**拿不到**真实头像昵称，
// 头像昵称只能由用户主动填写（chooseAvatar / input type=nickname），且不能作为身份标识。
// 因此这里的登录链路是：
//   wx.login 静默拿 code → 后端换 openid（用户完全无感、不弹窗、不计费）
//   → 若该 openid 已绑定手机号，直接识别身份
//   → 未绑定则由用户输入预约手机号完成绑定（手机号才是唯一认证标识）
//
// H5 / App 端没有 wx.login，函数直接返回 null，走原有的手机号登录。

/** 调用 wx.login 拿 code */
function wxCode(): Promise<string> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: "weixin",
      success: (res) => resolve((res && (res as any).code) || ""),
      fail: () => resolve(""),
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve("");
    // #endif
  });
}

/**
 * 静默登录：code 换 openid，并返回后端判定结果。
 * @returns 小程序端返回 { success, bound, openid, customer?, ... }；H5 端返回 null
 */
export async function miniSilentLogin(): Promise<any> {
  // #ifdef MP-WEIXIN
  try {
    const code = await wxCode();
    if (!code) return null;
    const res: any = await uni.request({
      url: "/api/wechat/mini-login",
      method: "POST",
      data: { code },
    });
    return (res && res.data) || null;
  } catch (e) {
    console.warn("[wechat] 静默登录失败:", (e && (e as any).message) || e);
    return null;
  }
  // #endif
  // #ifndef MP-WEIXIN
  return null;
  // #endif
}

/**
 * 绑定手机号到当前微信。
 * @param openid miniSilentLogin 返回的 openid
 * @param phone  预约时登记的手机号
 */
export async function miniBindPhone(openid: string, phone: string): Promise<any> {
  try {
    const res: any = await uni.request({
      url: "/api/wechat/mini-bind",
      method: "POST",
      data: { openid, phone },
    });
    return (res && res.data) || null;
  } catch (e) {
    console.warn("[wechat] 绑定手机号失败:", (e && (e as any).message) || e);
    return null;
  }
}

/**
 * 上传头像到服务器，返回永久地址（chooseAvatar 给的是临时路径，必须转存）。
 * @returns 成功返回 url，失败返回空串
 */
export async function uploadAvatar(filePath: string): Promise<string> {
  if (!filePath) return "";
  // 已经是服务器地址（二次进入回填）则直接用
  if (/^\/uploads\//.test(filePath)) return filePath;
  try {
    const res: any = await uni.uploadFile({
      url: "/api/upload-image",
      filePath,
      name: "file",
    });
    const raw = res && res.data;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (data && data.url) || "";
  } catch (e) {
    console.warn("[wechat] 头像上传失败:", (e && (e as any).message) || e);
    return "";
  }
}

/**
 * 保存头像昵称（不绑手机号也能存）。
 * @param openid   miniSilentLogin 返回的 openid
 * @param nickname 用户填写的昵称
 * @param avatar   上传后的服务器地址
 */
export async function miniSaveProfile(openid: string, nickname: string, avatar: string): Promise<any> {
  try {
    const res: any = await uni.request({
      url: "/api/wechat/mini-profile",
      method: "POST",
      data: { openid, nickname, avatar },
    });
    return (res && res.data) || null;
  } catch (e) {
    console.warn("[wechat] 保存资料失败:", (e && (e as any).message) || e);
    return null;
  }
}

/**
 * 后台静默补绑：用户走手机号登录成功后，把当前微信 openid 也绑上，
 * 下次进入就能免输手机号。失败不影响主流程，故不 await、不抛错。
 */
export async function bindOpenidQuietly(phone: string): Promise<void> {
  try {
    const r = await miniSilentLogin();
    if (!r || !r.success || r.bound || !r.openid) return;
    await miniBindPhone(r.openid, phone);
  } catch (_) {
    /* 忽略 */
  }
}

/** 保存客户身份到本地（与 login.vue 的客户登录保持一致） */
export function saveCustomerIdentity(data: any): void {
  if (!data || !data.customer) return;
  uni.setStorageSync("userInfo", data.customer);
  uni.setStorageSync("token", "logged-in");
  uni.setStorageSync("userType", "customer");
  if (data.isFamilyMember && data.masterCustomerId) {
    uni.setStorageSync("masterCustomerId", data.masterCustomerId);
    uni.setStorageSync("masterPhone", (data.masterCustomer && data.masterCustomer.phone) || "");
  } else {
    uni.removeStorageSync("masterCustomerId");
    uni.removeStorageSync("masterPhone");
  }
}
