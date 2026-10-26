<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">数据报表</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-body">
      <!-- 项目总览 -->
      <view class="hero-card">
        <view class="hero-left">
          <text class="hero-num">{{ stats.project_total || 0 }}</text>
          <text class="hero-label">项目总数</text>
        </view>
        <view class="hero-right">
          <view class="hero-tag">
            <view class="tag-dot dot-active"></view>
            <text class="tag-text">进行中 {{ stats.project_active || 0 }}</text>
          </view>
          <view class="hero-tag">
            <view class="tag-dot dot-done"></view>
            <text class="tag-text">已完成 {{ stats.project_completed || 0 }}</text>
          </view>
          <view class="hero-tag">
            <view class="tag-dot dot-over"></view>
            <text class="tag-text">逾期 {{ stats.project_overdue || 0 }}</text>
          </view>
        </view>
      </view>

      <!-- 巡检统计 -->
      <view class="card">
        <view class="card-title"><view class="title-bar"></view>巡检统计</view>
        <view class="grid-4">
          <view class="stat" v-for="item in inspectionStats" :key="item.label">
            <text class="stat-num" :style="{ color: item.color }">{{ item.value }}</text>
            <text class="stat-label">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <!-- 收支汇总 -->
      <view class="card">
        <view class="card-title"><view class="title-bar"></view>收支汇总</view>
        <view class="finance-row">
          <view class="fin-item">
            <text class="fin-label">总收入</text>
            <text class="fin-amount c-green">¥{{ money(stats.income) }}</text>
          </view>
          <view class="fin-item">
            <text class="fin-label">总支出</text>
            <text class="fin-amount c-red">¥{{ money(stats.expense) }}</text>
          </view>
          <view class="fin-item">
            <text class="fin-label">净利润</text>
            <text class="fin-amount" :class="profit >= 0 ? 'c-blue' : 'c-red'">¥{{ money(profit) }}</text>
          </view>
        </view>
      </view>

      <!-- 项目进度 -->
      <view class="card">
        <view class="card-title"><view class="title-bar"></view>项目进度</view>
        <view v-if="projects.length === 0" class="empty">暂无项目数据</view>
        <view v-else>
          <view v-for="p in projects" :key="p.id" class="proj-row">
            <view class="proj-head">
              <text class="proj-name">{{ p.name }}</text>
              <text class="proj-pct" :style="{ color: progressColor(p.progress) }">{{ progressOf(p.progress) }}%</text>
            </view>
            <text class="proj-sub">{{ p.customer_name || '未关联客户' }}</text>
            <view class="bar">
              <view
                class="bar-fill"
                :style="{ width: progressOf(p.progress) + '%', background: progressColor(p.progress) }"
              ></view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const stats = ref({ project_total: 0, project_active: 0, project_overdue: 0, project_completed: 0, inspection_total: 0, inspection_pending: 0, inspection_fixed: 0, inspection_overdue: 0, income: 0, expense: 0 })
const projects = ref([])
const loading = ref(false)

const inspectionStats = computed(() => [
  { label: '巡检总数', value: Number(stats.value.inspection_total || 0), color: '#1E3A5F' },
  { label: '待整改', value: Number(stats.value.inspection_pending || 0), color: '#EF4444' },
  { label: '已整改', value: Number(stats.value.inspection_fixed || 0), color: '#22C55E' },
  { label: '已逾期', value: Number(stats.value.inspection_overdue || 0), color: '#FF6B35' },
])

const profit = computed(() => Number(stats.value.income || 0) - Number(stats.value.expense || 0))

const money = (v) => Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 后端返回的 progress 可能是字符串（MySQL ROUND 结果是 DECIMAL），统一转数字并夹到 0~100
const progressOf = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

const progressColor = (v) => {
  const n = progressOf(v)
  if (n >= 100) return '#22C55E'
  if (n >= 60) return '#1E3A5F'
  if (n >= 30) return '#FF6B35'
  return '#EF4444'
}

onMounted(() => {
  loadStats()
})

function loadStats() {
  loading.value = true
  uni.request({
    url: '/api/report/stats',
    success: (res) => {
      if (res.data && res.data.code === 0) {
        stats.value = res.data.data?.stats || {}
        projects.value = res.data.data?.projects || []
      }
    },
    complete: () => { loading.value = false }
  })
}

const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #f5f6f8; padding: 0; }
.page-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }

/* ===== 项目总览卡 ===== */
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 18px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1E3A5F 0%, #2E5C8A 100%);
  box-shadow: 0 6px 18px rgba(30, 58, 95, 0.24);
  margin-bottom: 14px;
}
.hero-left { display: flex; flex-direction: column; }
.hero-num { font-size: 40px; font-weight: 700; color: #fff; line-height: 1.1; }
.hero-label { font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 4px; letter-spacing: 0.5px; }
.hero-right { display: flex; flex-direction: column; gap: 8px; }
.hero-tag { display: flex; align-items: center; gap: 6px; }
.tag-dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-active { background: #4ADE80; }
.dot-done { background: #93C5FD; }
.dot-over { background: #FCA5A5; }
.tag-text { font-size: 12px; color: rgba(255, 255, 255, 0.88); }

/* ===== 通用卡片 ===== */
.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 1px 6px rgba(30, 58, 95, 0.06);
}
.card-title {
  display: flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 14px;
}
.title-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #FF6B35;
  margin-right: 8px;
}

/* ===== 四宫格统计 ===== */
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  border-radius: 10px;
  background: #F8FAFC;
}
.stat-num { font-size: 22px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 11px; color: #94A3B8; margin-top: 4px; }

/* ===== 收支 ===== */
.finance-row { display: flex; }
.fin-item { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.fin-item + .fin-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 26px;
  background: #EEF2F7;
}
.fin-label { font-size: 11px; color: #94A3B8; margin-bottom: 6px; }
.fin-amount { font-size: 16px; font-weight: 600; }
.c-green { color: #22C55E; }
.c-red { color: #EF4444; }
.c-blue { color: #1E3A5F; }

/* ===== 项目进度 ===== */
.proj-row { padding: 12px 0; border-bottom: 1px solid #F1F5F9; }
.proj-row:last-child { border-bottom: none; padding-bottom: 0; }
.proj-head { display: flex; align-items: center; justify-content: space-between; }
.proj-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 10px;
}
.proj-pct { font-size: 15px; font-weight: 700; flex-shrink: 0; }
.proj-sub { display: block; font-size: 11px; color: #94A3B8; margin: 3px 0 8px; }
.bar { height: 7px; background: #EEF2F7; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }

.empty { font-size: 13px; color: #94A3B8; text-align: center; padding: 24px 0; }

/* ===== 导航栏 ===== */
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
