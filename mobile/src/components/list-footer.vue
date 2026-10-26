<template>
  <!--
    列表底部状态条（配合 utils/listPager.ts 的 useListPager 使用）

    用法：
      <list-footer :has-more="hasMore" :count="visible.length" />

    行为：
      - count = 0（空列表）不渲染，空态由各页面自己的 empty-state 负责；
      - hasMore = true  → 「上拉加载更多」
      - hasMore = false → 「— 没有更多了 —」
  -->
  <view class="list-footer" v-if="count > 0">
    <text v-if="hasMore" class="lf-more">上拉加载更多</text>
    <text v-else class="lf-end">— 没有更多了 —</text>
  </view>
</template>

<script setup>
defineProps({
  hasMore: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
})
</script>

<style scoped>
.list-footer {
  padding: 18px 0 26px;
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
}

.lf-more {
  color: #9CA3AF;
}

/* 到底了 —— 比「加载更多」更淡一点，视觉上自然收尾 */
.lf-end {
  color: #C7CBD1;
  letter-spacing: 1px;
}
</style>
