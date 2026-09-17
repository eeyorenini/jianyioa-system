<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">材料列表</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">材料台账</view>

    <!-- 统计卡片 -->
    <view class="stats-row">
      <view class="stat-item">
        <text class="stat-num">{{ summary.total }}</text>
        <text class="stat-label">材料种类</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item">
        <text class="stat-num accent">¥{{ summary.cost }}</text>
        <text class="stat-label">总成本</text>
      </view>
    </view>

    <!-- 分类 -->
    <view class="cat-tabs">
      <view class="cat-tab" :class="{ active: curCat === '全部' }" @click="curCat = '全部'">全部</view>
      <view class="cat-tab" :class="{ active: curCat === '主材' }" @click="curCat = '主材'">主材</view>
      <view class="cat-tab" :class="{ active: curCat === '辅材' }" @click="curCat = '辅材'">辅材</view>
    </view>

    <!-- 材料列表 -->
    <view class="material-list" v-if="filteredList.length">
      <view class="material-card" v-for="item in filteredList" :key="item.id">
        <view class="material-info">
          <text class="material-name">{{ item.name }}</text>
          <text class="material-spec">{{ item.spec }}</text>
        </view>
        <view class="material-stats">
          <view class="m-stat">
            <text class="m-label">数量</text>
            <text class="m-val">{{ item.quantity }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">已用</text>
            <text class="m-val used">{{ item.used }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">剩余</text>
            <text class="m-val left">{{ item.left }}{{ item.unit }}</text>
          </view>
          <view class="m-stat">
            <text class="m-label">成本</text>
            <text class="m-val cost">¥{{ item.cost }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🧱</text>
      <text class="empty-text">暂无材料记录</text>
    </view>

    <!-- 快捷入口 -->
    <view class="material-actions">
      <view class="m-action" @click="goPage('/pages/material/purchase')">
        <text>📦</text> 采购申请
      </view>
      <view class="m-action" @click="goPage('/pages/material/inbound')">
        <text>🚚</text> 到货验收
      </view>
      <view class="m-action" @click="goPage('/pages/material/outbound')">
        <text>📤</text> 领用记录
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed } from "vue";

const curCat = ref('全部');

const summary = ref({ total: 12, cost: '32,100' });

const list = ref([
  { id: 1, name: '水泥', spec: '32.5R 普通硅酸盐', quantity: 20, used: 12, left: 8, unit: '吨', cost: '8,000', type: '辅材' },
  { id: 2, name: '沙子', spec: '中砂', quantity: 30, used: 20, left: 10, unit: '方', cost: '4,500', type: '辅材' },
  { id: 3, name: '瓷砖', spec: '800x800 全抛釉', quantity: 200, used: 150, left: 50, unit: '片', cost: '12,000', type: '主材' },
  { id: 4, name: '木工板', spec: 'E0级 18mm', quantity: 50, used: 30, left: 20, unit: '张', cost: '7,600', type: '主材' },
]);

const filteredList = computed(() => {
  if (curCat.value === '全部') return list.value;
  return list.value.filter(i => i.type === curCat.value);
});

const goPage = (url) => uni.navigateTo({ url });


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 80px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1A1F36;
  margin-bottom: 14px;
}

.stats-row {
  display: flex;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-divider {
  width: 1px;
  background: #F3F4F6;
}

.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #1E3A5F;
}

.stat-num.accent { color: #FF6B35; }

.stat-label {
  display: block;
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 2px;
}

.cat-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.cat-tab {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
  cursor: pointer;
}

.cat-tab.active {
  background: #1E3A5F;
  color: #fff;
}

.material-list { display: flex; flex-direction: column; gap: 12px; }

.material-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.material-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 2px;
}

.material-spec {
  font-size: 12px;
  color: #9CA3AF;
}

.material-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.m-stat {
  text-align: center;
}

.m-label {
  display: block;
  font-size: 10px;
  color: #9CA3AF;
  margin-bottom: 2px;
}

.m-val {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #1A1F36;
}

.m-val.used { color: #F59E0B; }
.m-val.left { color: #10B981; }
.m-val.cost { color: #EF4444; }

.material-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 16px;
}

.m-action {
  background: #fff;
  border-radius: 12px;
  padding: 14px 8px;
  text-align: center;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.m-action text {
  display: block;
  font-size: 20px;
  margin-bottom: 4px;
}
/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

</style>
