<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目甘特图</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">甘特图</view>
    <view class="project-info" v-if="project.name">
      📁 {{ project.name }}
    </view>

    <!-- 日期范围 -->
    <view class="date-range" v-if="project.start_date && project.end_date">
      📅 {{ project.start_date }} ~ {{ project.end_date }}
      <text class="duration">（共 {{ totalDays }} 天）</text>
    </view>

    <!-- 无日期提示 -->
    <view class="no-date-tip" v-if="!project.start_date || !project.end_date">
      ⚠️ 请先在「节点管理」中设置项目工期
    </view>

    <!-- 甘特图主体 -->
    <scroll-view class="gantt-scroll" scroll-x v-if="project.start_date && project.end_date">
      <view class="gantt-table">
        <!-- 表头：日期行 -->
        <view class="gantt-header-row">
          <view class="gantt-label-cell">节点</view>
          <view class="gantt-date-header">
            <view class="date-cell"
              v-for="(day, idx) in days"
              :key="idx"
              :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
            >
              <text class="date-num">{{ day.day }}</text>
              <text class="date-week">{{ day.week }}</text>
            </view>
          </view>
        </view>

        <!-- 节点行 -->
        <view
          class="gantt-data-row"
          v-for="node in validNodes"
          :key="node.id"
        >
          <view class="gantt-label-cell">
            <view class="node-label">
              <view class="node-dot" :class="`dot-${node.status || 'pending'}`"></view>
              <text class="node-label-text">{{ node.node_name || node.stage_name }}</text>
            </view>
          </view>
          <view class="gantt-bar-area">
            <!-- 背景格子（可选周末高亮） -->
            <view class="date-cell-bg"
              v-for="(day, idx) in days"
              :key="idx"
              :class="{ 'is-weekend': day.isWeekend }"
            ></view>
            <!-- 甘特条 -->
            <view
              v-if="node.plan_date && node.plan_end_date"
              class="gantt-bar"
              :class="`bar-${node.status || 'pending'}`"
              :style="getBarStyle(node)"
              @click="editNodeDate(node)"
            >
              <text class="bar-text">{{ node.plan_date }} ~ {{ node.plan_end_date }}</text>
            </view>
            <view v-else class="no-date-tip-bar" @click="editNodeDate(node)">
              点击设置日期
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 图例 -->
    <view class="legend" v-if="project.start_date && project.end_date">
      <view class="legend-item">
        <view class="legend-dot dot-pending"></view>
        <text>待开始</text>
      </view>
      <view class="legend-item">
        <view class="legend-dot dot-in_progress"></view>
        <text>进行中</text>
      </view>
      <view class="legend-item">
        <view class="legend-dot dot-completed"></view>
        <text>已完成</text>
      </view>
      <view class="legend-item">
        <view class="legend-dot dot-skipped"></view>
        <text>已跳过</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const project = ref({});
const projectId = ref(0);

// 计算工期天数
const totalDays = computed(() => {
  if (!project.value.start_date || !project.value.end_date) return 0;
  const s = new Date(project.value.start_date);
  const e = new Date(project.value.end_date);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
});

// 有效节点（有日期的排在前面）
const validNodes = computed(() => {
  if (!project.value.nodes) return [];
  return [...project.value.nodes].sort((a, b) => {
    // 有日期的优先
    if (a.plan_date && !b.plan_date) return -1;
    if (!a.plan_date && b.plan_date) return 1;
    return 0;
  });
});

// 生成日期数组
const days = computed(() => {
  if (!project.value.start_date || !project.value.end_date) return [];
  const result = [];
  const start = new Date(project.value.start_date);
  const end = new Date(project.value.end_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  let current = new Date(start);

  while (current <= end) {
    const day = current.getDate();
    const week = weekDays[current.getDay()];
    const dateStr = current.toISOString().split('T')[0];
    const isToday = current.getTime() === today.getTime();
    const isWeekend = current.getDay() === 0 || current.getDay() === 6;
    result.push({ day, week, dateStr, isToday, isWeekend });
    current.setDate(current.getDate() + 1);
  }
  return result;
});

// 获取甘特条的位置和宽度
const getBarStyle = (node) => {
  if (!node.plan_date || !node.plan_date) return {};
  const start = new Date(project.value.start_date);
  const nodeStart = new Date(node.plan_date);
  const nodeEnd = new Date(node.plan_end_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 像素比例：每天60px
  const pxPerDay = 60;

  // 节点左边距（从项目开始到节点开始）
  const offsetDays = Math.max(0, Math.floor((nodeStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const left = offsetDays * pxPerDay;

  // 节点宽度（从开始到结束）
  const durationDays = Math.max(1, Math.floor((nodeEnd.getTime() - nodeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const width = durationDays * pxPerDay;

  return {
    left: left + 'px',
    width: width + 'px',
  };
};

// 点击甘特条编辑日期
const editNodeDate = async (node) => {
  // 先选开始日期
  const startDate = await new Promise((resolve) => {
    uni.showDatePicker({
      currentDate: node.plan_date || project.value.start_date || new Date().toISOString().split('T')[0],
      success: (res) => resolve(res.value || ''),
      fail: () => resolve(''),
    });
  });
  if (!startDate) return;

  // 再选结束日期
  const endDate = await new Promise((resolve) => {
    const minDate = startDate;
    uni.showDatePicker({
      currentDate: node.plan_end_date || startDate,
      success: (res) => resolve(res.value || ''),
      fail: () => resolve(''),
    });
  });
  if (!endDate) return;

  // 保存
  try {
    const token = uni.getStorageSync("token");
    await uni.request({
      url: `/api/project-stages/${node.id}`,
      method: "PUT",
      header: { Authorization: token },
      data: { plan_date: startDate, plan_end_date: endDate },
    });
    await fetchDetail();
    uni.showToast({ title: "日期已更新", icon: "success" });
  } catch (e) {
    uni.showToast({ title: "保存失败", icon: "none" });
  }
};

const fetchDetail = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/projects",
      header: { Authorization: token },
    });
    uni.hideLoading();
    const data = res.data;
    if (Array.isArray(data)) {
      const found = data.find((p) => p.id === projectId.value);
      if (found) {
        project.value = found;
      } else {
        uni.showToast({ title: "项目不存在", icon: "none" });
      }
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: "加载失败", icon: "none" });
  }
};

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = parseInt(options.id || '0');
  if (projectId.value) {
    fetchDetail();
  }
});


const goBack = () => {
  uni.switchTab({ url: '/pages/home/index' });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 15px;
  padding-bottom: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.project-info {
  font-size: 13px;
  color: #667eea;
  background: #f0f4ff;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.date-range {
  font-size: 13px;
  color: #666;
  margin-bottom: 14px;
}

.duration {
  color: #999;
  margin-left: 6px;
}

.no-date-tip {
  background: #fff7e6;
  color: #ff9f43;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
  margin-bottom: 14px;
}

/* 甘特图横向滚动 */
.gantt-scroll {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  white-space: nowrap;
}

.gantt-table {
  display: inline-block;
  min-width: 100%;
}

/* 表头行 */
.gantt-header-row {
  display: flex;
  background: #667eea;
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}

.gantt-label-cell {
  width: 80px;
  min-width: 80px;
  font-size: 13px;
  padding: 8px;
  display: flex;
  align-items: center;
  background: #f9f9f9;
  color: #666;
  border-right: 1px solid #eee;
  position: sticky;
  left: 0;
  z-index: 5;
}

/* 日期格：每天60px宽 */
.gantt-date-header {
  display: flex;
}

.date-cell {
  width: 60px;
  min-width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  border-right: 1px solid rgba(255,255,255,0.2);
  font-size: 11px;
}

.date-cell.is-today {
  background: rgba(255,255,255,0.3);
}

.date-cell.is-weekend {
  background: rgba(0,0,0,0.1);
}

.date-num {
  font-size: 13px;
  font-weight: bold;
}

.date-week {
  font-size: 10px;
  opacity: 0.8;
}

/* 数据行 */
.gantt-data-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  min-height: 44px;
}

.gantt-data-row:last-child {
  border-bottom: none;
}

/* 甘特条区域 */
.gantt-bar-area {
  display: flex;
  position: relative;
  height: 44px;
}

.date-cell-bg {
  width: 60px;
  min-width: 60px;
  height: 100%;
  border-right: 1px solid #f5f5f5;
}

.date-cell-bg.is-weekend {
  background: #fafafa;
}

/* 甘特条 */
.gantt-bar {
  position: absolute;
  top: 6px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  min-width: 30px;
}

.bar-text {
  font-size: 11px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-pending { background: linear-gradient(90deg, #ccc, #aaa); }
.bar-in_progress { background: linear-gradient(90deg, #667eea, #764ba2); }
.bar-completed { background: linear-gradient(90deg, #52c41a, #73d13d); }
.bar-skipped { background: linear-gradient(90deg, #ff6600, #ffa500); }

.no-date-tip-bar {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #ccc;
  cursor: pointer;
}

/* 节点名称列 */
.node-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-pending { background: #ccc; }
.dot-in_progress { background: #667eea; }
.dot-completed { background: #52c41a; }
.dot-skipped { background: #ff6600; }

.node-label-text {
  font-size: 12px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 图例 */
.legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
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
