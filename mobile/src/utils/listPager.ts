/**
 * 列表「上拉加载更多」通用分页器（纯前端切片）
 *
 * 为什么不用后端分页：
 *   当前 server.js 的所有列表接口（/api/projects、/api/contracts、/api/messages …）
 *   **没有任何分页实现** —— 没有 req.query.page / LIMIT ? OFFSET，
 *   前端就算传 page / page_size 也会被忽略，接口仍然返回全量数据。
 *
 *   于是旧代码里的「上拉加载」实际是：把同一份全量数据再 append 一遍 → 列表出现重复项。
 *   （pkg-misc/message/list.vue、pkg-finance/contract/list.vue 等都有这个问题）
 *
 * 现在的做法：
 *   一次拿到全量数据，前端按 pageSize 切片渲染。
 *   - 首屏只渲染前 pageSize 条，长列表首屏渲染更快、滚动更顺；
 *   - 上拉把 page+1，追加下一段，**不会重复、不会丢数据**；
 *   - 到底后显示「没有更多了」。
 *
 * 后续后端补上真分页时，只需把页面的 loadMore 换成真请求，模板和状态都不用改。
 */

import { ref, computed } from 'vue'

/** 默认每页条数。小程序一屏大约 6-8 张卡片，15 条够滚两屏，首屏渲染压力也小。 */
export const DEFAULT_PAGE_SIZE = 15

export function useListPager<T = any>(
  getSource: () => T[],
  pageSize: number = DEFAULT_PAGE_SIZE
) {
  const page = ref(1)

  /** 当前已渲染的条数上限 */
  const visibleCount = computed(() => page.value * pageSize)

  /** 是否还有未渲染的数据 */
  const hasMore = computed(() => (getSource() || []).length > visibleCount.value)

  /** 模板里 v-for 用的数组 */
  const visible = computed(() => (getSource() || []).slice(0, visibleCount.value))

  /** 回到第一页（重新加载数据、切换筛选条件时必须调） */
  function reset() {
    page.value = 1
  }

  /**
   * 上拉加载下一段。
   * @returns 是否真的加载了（false = 已经到底，调用方可据此不弹提示）
   */
  function loadMore(): boolean {
    if (!hasMore.value) return false
    page.value += 1
    return true
  }

  return { page, pageSize, visible, hasMore, visibleCount, reset, loadMore }
}

/**
 * 下拉刷新包装器
 *
 * 统一处理三件事，避免每个页面各写一遍：
 *   1. 一定要调 uni.stopPullDownRefresh()，否则下拉动画永远转（小程序不会自动停）
 *   2. 加一个最短展示时长，接口太快时不会「闪一下就没了」显得没刷新
 *   3. loader 抛错也要 stop，不能卡住
 *
 * @param loader   页面自己的加载函数（一般是 loadData / fetchList）
 * @param onDone   加载完成后的收尾（比如 reset 分页）
 * @param minMs    最短展示时长
 */
export async function runPullRefresh(
  loader: () => any,
  onDone?: () => void,
  minMs = 500
) {
  const start = Date.now()
  try {
    await loader()
    if (onDone) onDone()
  } catch (e) {
    // 错误提示由 loader 自己负责（各页面 toast 文案不同），这里只保证不中断流程
    console.error('[pull-refresh] 刷新失败', e)
  } finally {
    const rest = minMs - (Date.now() - start)
    setTimeout(() => {
      uni.stopPullDownRefresh()
    }, rest > 0 ? rest : 0)
  }
}
