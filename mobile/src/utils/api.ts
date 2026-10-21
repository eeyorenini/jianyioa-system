/**
 * 后端地址统一出口
 *
 * 背景：
 *  - H5 端跑在 erp.fujinwanjia.com 同源下，用相对路径 `/api/xxx` 即可（Apache 反代 / devServer.proxy 处理）。
 *  - 微信小程序 **不支持** 相对路径，`uni.request` 必须传绝对 HTTPS 地址，且该域名需在小程序后台
 *    「开发设置 → 服务器域名 → request 合法域名」中登记。
 *  - App 端同理需要绝对地址。
 *
 * 因此这里按平台条件编译出 API_ORIGIN，再由 App.vue 的拦截器统一给所有请求补前缀。
 * 全项目 221 处 `/api/...` 无需逐个修改。
 */

let origin = '';

// #ifdef MP-WEIXIN
origin = 'https://erp.fujinwanjia.com';
// #endif

// #ifdef APP-PLUS
origin = 'https://erp.fujinwanjia.com';
// #endif

// #ifdef MP-ALIPAY
origin = 'https://erp.fujinwanjia.com';
// #endif

/** 后端根地址；H5 下为空串（保持同源相对路径） */
export const API_ORIGIN = origin;

/** 是否是无需补前缀的地址（绝对地址 / 本地临时文件 / 数据协议） */
function isAbsolute(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) ||        // http(s) 绝对地址
    /^(wxfile|blob|data|file|ftp):/i.test(url) || // 本地文件 / 数据协议
    url.startsWith('//')                // 协议相对地址
  );
}

/**
 * 把相对路径补成绝对地址。
 * 仅在 API_ORIGIN 非空（小程序 / App）时生效；H5 原样返回。
 * 页面路由（/pages/xxx）不会被调用到这里 —— 拦截器只挂 request / uploadFile / downloadFile。
 */
export function absUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (!API_ORIGIN) return url;
  if (isAbsolute(url)) return url;
  if (url.startsWith('/')) return API_ORIGIN + url;
  return url;
}

/**
 * 补全静态资源（图片 / 附件）地址，供 <image :src> 使用。
 * 小程序里 <image src="/uploads/a.jpg"> 无法解析，必须绝对地址。
 */
export function absAsset(path: string): string {
  if (!path || typeof path !== 'string') return '';
  if (isAbsolute(path)) return path;
  if (path.startsWith('/')) return API_ORIGIN + path;
  return API_ORIGIN ? API_ORIGIN + '/' + path : path;
}
