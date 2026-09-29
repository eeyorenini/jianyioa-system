/**
 * 统一图片上传工具
 * 所有页面图片上传都调用这里，name 字段固定为 'file'，方便后期统一替换后端接口
 */

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

/** 补全图片 http 地址 */
export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : '/' + path;
}
