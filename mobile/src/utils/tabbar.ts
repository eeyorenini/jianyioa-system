/**
 * 底部 tabBar 原生徽标同步（两端共用）
 *
 * ⚠️ 微信的 setTabBarBadge / removeTabBarBadge **只能在 tabBar 页面调用**，
 *    在分包页面（消息通知页 pkg-misc/message/list 等）调用必定抛
 *      MiniProgramError {"errMsg":"removeTabBarBadge:fail not TabBar page"}
 *    所以这里先判断当前页是否 tabBar 页，不是就直接跳过，
 *    交给 tabBar 页（首页 / 我的）的 onShow 去同步。
 *
 * 背景（2026-10-21 的教训）：setTabBarBadge 是原生持久化徽标，页面刷新、小程序重启
 * 都不会自动消失，必须显式 remove 才会掉。所以「已读之后」一定要有人负责同步。
 */

import { TAB_BAR_PAGES } from './pageMap'

/** 「我的」tab 的下标（tabBar 共 5 项：首页0 项目1 巡检2 采购3 我的4） */
const MINE_TAB_INDEX = 4

/** 当前页面是否原生 tabBar 页 */
export function onTabBarPage(): boolean {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const cur: any = pages && pages.length ? pages[pages.length - 1] : null
    const route = cur ? cur.route || cur.__route__ || '' : ''
    if (!route) return false
    return TAB_BAR_PAGES.indexOf('/' + route) !== -1
  } catch (e) {
    return false
  }
}

/**
 * 同步「我的」tab 的未读徽标。
 * @param count 未读条数，>99 显示 99+
 */
export function syncMessageBadge(count: number) {
  if (!onTabBarPage()) return
  const n = Number(count) || 0
  if (n > 0) {
    uni.setTabBarBadge({ index: MINE_TAB_INDEX, text: n > 99 ? '99+' : String(n), fail: () => {} })
  } else {
    uni.removeTabBarBadge({ index: MINE_TAB_INDEX, fail: () => {} })
  }
}
