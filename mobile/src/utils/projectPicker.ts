/**
 * 项目选择工具
 * 统一封装"拉项目列表 → 让用户选一个 → 跳到目标页"的流程，
 * 避免每个页面（首页 / 巡检 / 派工 / 派单等）重复同样的 picker 逻辑。
 *
 * 用法：
 *   import { pickProject } from '@/utils/projectPicker';
 *   const p = await pickProject('选择项目后添加巡检');
 *   if (p) uni.navigateTo({ url: `/pages/inspection/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
 */

interface ProjectItem {
  id: number | string;
  name: string;
  customer_name?: string;
  status?: string;
  [k: string]: any;
}

/**
 * 弹起项目选择器，返回用户选中的项目（取消/失败时返回 null）。
 * 内部用 uni.showActionSheet，UI 与 home 页 BottomPicker 略有差异（系统级 popover），
 * 但跨页面一致、不依赖任何组件实例，复用最简。
 */
export function pickProject(title = '选择项目'): Promise<ProjectItem | null> {
  return new Promise(async (resolve) => {
    let loadingShown = false;
    try {
      uni.showLoading({ title: '加载中...' });
      loadingShown = true;
      const token = uni.getStorageSync('token');
      const res: any = await uni.request({ url: '/api/projects', header: { Authorization: token } });
      uni.hideLoading();
      loadingShown = false;
      // /api/projects 返回结构可能是数组，也可能是 {code, data: []}
      const raw = res && res.data;
      const list: ProjectItem[] = Array.isArray(raw)
        ? raw
        : (raw && Array.isArray(raw.data) ? raw.data : []);
      if (!list.length) {
        uni.showToast({ title: '暂无项目', icon: 'none' });
        resolve(null);
        return;
      }
      // ActionSheet 每一项最多 14 个汉字，否则会被截断；超长截断 + 加「…」
      const labels = list.map((p) => {
        const nm = p.name || `项目#${p.id}`;
        // 客户名做副标题（如果有），append 到主名右侧；整体控制 30 字符内
        const sub = p.customer_name ? ` · ${p.customer_name}` : '';
        const full = nm + sub;
        return full.length > 30 ? full.slice(0, 29) + '…' : full;
      });
      uni.showActionSheet({
        itemList: labels,
        success: (r: any) => {
          const idx = typeof r.tapIndex === 'number' ? r.tapIndex : -1;
          resolve(idx >= 0 && idx < list.length ? list[idx] : null);
        },
        fail: () => resolve(null),
      });
    } catch (e) {
      if (loadingShown) uni.hideLoading();
      uni.showToast({ title: '加载失败', icon: 'none' });
      resolve(null);
    }
  });
}