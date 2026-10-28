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

/**
 * 解析小程序 / App 的后端地址。
 *
 * 默认返回生产域名。开发者工具联调本机后端时，可在调试器 Console 里临时覆盖：
 *   wx.setStorageSync('__api_origin_override', 'http://192.168.1.32:3002')
 *   wx.removeStorageSync('__api_origin_override')   // 恢复生产域名
 *
 * 说明：
 *  - 覆盖值只存在调试工具的本地 Storage 里，不随代码打包，线上用户永远不会命中；
 *  - 仅在模块加载时读一次，改完需要重新编译 / 重启小程序；
 *  - 用 http + IP 联调时，微信开发者工具必须勾选「不校验合法域名、TLS 版本以及 HTTPS 证书」。
 */
function resolveApiOrigin(fallback: string): string {
  try {
    const v = uni.getStorageSync('__api_origin_override');
    if (v && typeof v === 'string') {
      const t = v.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(t)) {
        console.warn('[api] 后端地址已被本地 Storage 覆盖：', t, '（生产值', fallback + '）');
        return t;
      }
    }
  } catch (e) {
    /* Storage 不可用时静默回退生产域名 */
  }
  return fallback;
}

// #ifdef MP-WEIXIN
origin = resolveApiOrigin('https://erp.fujinwanjia.com');
// #endif

// #ifdef APP-PLUS
origin = resolveApiOrigin('https://erp.fujinwanjia.com');
// #endif

// #ifdef APP-HARMONY
// 鸿蒙 Next 端不会命中 APP-PLUS（uni-app 官方：只有 APP-HARMONY 和 APP 能条件编译到鸿蒙），
// 漏了这段 API_ORIGIN 会是空串，所有 /api 请求退化成相对路径 → 全部失败。
origin = resolveApiOrigin('https://erp.fujinwanjia.com');
// #endif

// #ifdef MP-ALIPAY
origin = resolveApiOrigin('https://erp.fujinwanjia.com');
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

/* ------------------------------------------------------------------
 * 图片上传与图片地址补全
 *
 * 原 utils/upload.ts 迁入。该文件被 pkg-purchase（采购）与
 * pkg-finance（财务）两个分包共用，分包之间不能互相引用，只能留主包；
 * 但它又不被任何主包页面直接引用，会被微信「主包内不应存在主包未使用
 * 的 JS 文件」判定为冗余。由于 getImageUrl 本身就是 absAsset 的外层
 * 封装，合并到本文件语义最内聚，同时也让主包引用真实成立。
 *
 * 说明：`uni.uploadFile` 的 url 无需在此补绝对地址 —— App.vue 的
 * onLaunch 已统一拦截补齐。
 * ------------------------------------------------------------------ */

/** 单图上传（Promise 版本）。name 字段固定为 'file'，便于后期统一换后端接口 */
export function uploadImage(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: '/api/upload-image',
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const data = JSON.parse(res.data) as { url?: string; path?: string };
          const url = data.url || data.path || '';
          if (url) resolve(url);
          else reject(new Error('上传返回数据无 url'));
        } catch (e) {
          reject(new Error('解析上传响应失败'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/** 多图上传（并行） */
export async function uploadImages(filePaths: string[]): Promise<string[]> {
  return Promise.all(filePaths.map((p) => uploadImage(p)));
}

/** 选择图片并上传（chooseImage + uploadImage），失败一律返回空数组不打断页面 */
export function chooseAndUpload(count = 9): Promise<string[]> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFilePaths;
        if (!paths.length) { resolve([]); return; }
        uploadImages(paths).then(resolve).catch(() => resolve([]));
      },
      fail: () => resolve([]),
    });
  });
}

/**
 * 补全图片地址，供 <image :src> / previewImage 使用。
 *
 * 统一规则（两端必须一致）：
 *   1. 先补前导斜杠，保证 `/uploads/x.jpg` 形态
 *   2. 再交给 absAsset 按平台补域名：
 *      H5 → 原样返回相对路径；小程序 / App → 补 https 绝对地址
 *
 * 小程序和 App 里 <image src="/uploads/x.jpg"> 无法解析，必须是绝对地址；
 * H5 同源则保持相对路径最省事。差异全部收敛在 absAsset 的条件编译里。
 */
export function getImageUrl(path: string): string {
  if (!path) return '';
  const p =
    path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')
      ? path
      : '/' + path;
  return absAsset(p);
}
