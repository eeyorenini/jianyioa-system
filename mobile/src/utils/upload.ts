/**
 * 统一图片上传工具
 * 所有页面图片上传都调用这里，name 字段固定为 'file'，方便后期统一替换后端接口
 *
 * 说明：`uni.uploadFile` 的 url 无需在此补绝对地址 —— App.vue 的 onLaunch 已统一拦截补齐。
 */

import { absAsset } from './api';

/** 单图上传（Promise 版本） */
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

/** 选择图片并上传（chooseImage + uploadImage） */
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
