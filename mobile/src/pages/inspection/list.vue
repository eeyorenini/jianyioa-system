<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">巡检记录</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 筛选 -->
    <view class="filter-row">
      <view class="filter-tag" :class="{ active: curStatus === '' }" @click="curStatus = ''; loadData()">全部</view>
      <view class="filter-tag danger" :class="{ active: curStatus === '待整改' }" @click="curStatus = '待整改'; loadData()">待整改</view>
      <view class="filter-tag warning" :class="{ active: curStatus === '整改中' }" @click="curStatus = '整改中'; loadData()">整改中</view>
      <view class="filter-tag success" :class="{ active: curStatus === '已完成' }" @click="curStatus = '已完成'; loadData()">已完成</view>
    </view>

    <!-- 加载中 -->
    <view class="loading-state" v-if="loading">
      <text>加载中...</text>
    </view>

    <!-- 巡检列表 -->
    <view class="inspect-list" v-else-if="filteredList.length">
      <view class="inspect-item" v-for="item in filteredList" :key="item.id" @click="goDetail(item)">
        <!-- 第一行：日期 + 提交人/时间 + 状态标签 -->
        <view class="log-row-first">
          <view class="log-date-bar">
            <text class="log-date-day">{{ formatDay(item.created_at) }}</text>
            <text class="log-date-month">{{ formatMonth(item.created_at) }}</text>
          </view>
          <view class="log-user-info">
            <view class="log-user-line">
              <text class="log-operator">🔍 {{ item.responsible_name || item.creator_name || '员工' }}</text>
              <text class="log-time">{{ formatFullTime(item.created_at) }}</text>
            </view>
            <view class="log-tags-row">
              <text class="log-tag-icon">等级：{{ getLevelText(item.level) }}</text>
              <text class="log-tag-icon">{{ getStatusText(item.status) }}</text>
            </view>
          </view>
        </view>

        <!-- 标题 = 问题 -->
        <view class="log-content-area" v-if="item.title">
          <view class="log-content-row">
            <view class="log-tag-box">问题</view>
            <view class="log-content-text">{{ item.title }}</view>
          </view>
        </view>

        <!-- 问题描述 = 表述 -->
        <view class="log-content-area" v-if="item.issue_desc">
          <view class="log-content-row">
            <view class="log-tag-box">表述</view>
            <view class="log-content-text">{{ item.issue_desc }}</view>
          </view>
        </view>

        <!-- 整改时间 -->
        <view class="log-content-area" v-if="item.due_date">
          <view class="log-content-row">
            <view class="log-tag-box">整改时间</view>
            <view class="log-content-text">{{ item.due_date }}</view>
          </view>
        </view>

        <!-- 地点 -->
        <view class="log-content-area" v-if="item.location">
          <view class="log-content-row">
            <view class="log-tag-box">地点</view>
            <view class="log-content-text">{{ item.location }}</view>
          </view>
        </view>

        <!-- 图片网格 -->
        <view class="log-photos" v-if="getPhotos(item).length">
          <view
            class="log-photo"
            v-for="(photo, idx) in getPhotos(item)"
            :key="idx"
            @click.stop="previewPhoto(item, idx)"
          >
            <image class="log-photo-img" :src="photo" mode="aspectFill" />
          </view>
        </view>

        <!-- 底部项目名 -->
        <view class="inspect-footer">
          <text class="inspect-project">📁 {{ item.project_name || item.project_id }}</text>
          <text class="inspect-arrow">›</text>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <text class="empty-icon">🔍</text>
      <text class="empty-text">{{ curStatus ? '暂无' + curStatus + '记录' : '暂无巡检记录' }}</text>
    </view>

    <!-- 新建按钮 -->
    <view class="fab" @click="goAdd">
      <text>+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

const loading = ref(false);
const curStatus = ref('');
const list = ref([]);

// 格式化日期
function formatDay(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return String(d.getDate()).padStart(2, '0');
}

function formatMonth(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr.replace(/-/g, '/'));
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return months[d.getMonth()];
}

function formatFullTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 获取巡检图片
function getPhotos(item) {
  if (!item.images) return [];
  try {
    let s = item.images;
    let p = JSON.parse(s);
    if (typeof p === 'string') p = JSON.parse(p);
    if (Array.isArray(p)) return p.filter(x => x && x.trim());
    return [];
  } catch { return []; }
}

// 预览图片
function previewPhoto(item, idx) {
  const photos = getPhotos(item);
  uni.previewImage({ urls: photos, current: photos[idx] });
}

// 获取状态文字
function getStatusText(status) {
  if (!status) return '待处理';
  const s = String(status).toLowerCase();
  if (s.includes('待整改') || s.includes('待处理') || s === 'pending') return '待整改';
  if (s.includes('已完成') || s === 'completed') return '已完成';
  if (s.includes('已验收') || s === 'verified') return '已验收';
  if (s.includes('整改中') || s === 'fixing') return '整改中';
  return status;
}

// 获取等级文字
function getLevelText(level) {
  const map = { serious: '严重', stop: '停工', normal: '一般', low: '轻微', medium: '中等', high: '高' };
  return map[level] || level || '一般';
}

// 加载真实数据
async function loadData() {
  loading.value = true;
  try {
    // 员工提交到 rectification_issues 表，读自己的表
    const res = await uni.request({ url: '/api/rectification-issues' });
    let data = [];
    if (Array.isArray(res.data)) {
      data = res.data;
    } else if (res.data && Array.isArray(res.data.list)) {
      data = res.data.list;
    } else if (res.data && Array.isArray(res.data.data)) {
      data = res.data.data;
    }
    // 按状态筛选
    if (curStatus.value) {
      data = data.filter(i => getStatusText(i.rectify_status || i.status) === curStatus.value);
    }
    list.value = data;
  } catch (e) {
    console.error('加载巡检失败', e);
    list.value = [];
  } finally {
    loading.value = false;
  }
}

const filteredList = computed(() => list.value);

const goDetail = (item) => {
  // 把完整数据通过页面栈传递，避免额外请求
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  currentPage.$inspectionData = item;
  uni.navigateTo({ url: `/pages/inspection/detail?id=${item.id}` });
};

const goAdd = () => {
  uni.navigateTo({ url: '/pages/inspection/add' });
};

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    uni.switchTab({ url: '/pages/home/index' });
  } else {
    uni.navigateBack();
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 80px;
}

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

.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.filter-tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #fff;
  color: #6B7280;
}

.filter-tag.active { background: #1E3A5F; color: #fff; }
.filter-tag.danger.active { background: #EF4444; }
.filter-tag.warning.active { background: #F59E0B; }
.filter-tag.success.active { background: #10B981; }

/* 加载 */
.loading-state {
  text-align: center;
  padding: 40px;
  color: #9CA3AF;
  font-size: 14px;
}

/* 列表 */
.inspect-list { display: flex; flex-direction: column; gap: 12px; }

.inspect-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

/* 和日志tab一致的样式 */
.log-row-first {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px;
}

.log-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-user-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-tags-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.log-tag-icon {
  font-size: 13px;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 4px 12px;
  border-radius: 12px;
}

.log-date-bar {
  width: 56px;
  height: 56px;
  background: #1E3A5F;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.log-date-day {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.log-date-month {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
}

.log-operator {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
}

.log-time { font-size: 12px; color: #9CA3AF; }

.log-content-area { /* 标签从最左边开始 */ }

.log-content-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
}

.log-content-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
  padding-left: 12px;
}

.log-tag-box {
  background: rgba(217, 246, 0, 0.11);
  color: #1E3A5F;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  min-width: 52px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 图片网格 */
.log-photos {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.log-photo {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
}

.log-photo-img {
  width: 100%;
  height: 100%;
  display: block;
}

/* 底部 */
.inspect-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
  margin-top: 4px;
}

.inspect-project { font-size: 12px; color: #6B7280; }
.inspect-arrow { font-size: 20px; color: #D1D5DB; }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
}
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #9CA3AF; }

/* FAB */
.fab {
  position: fixed;
  right: 20px;
  bottom: 90px;
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff;
  border-radius: 50%;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(30,58,95,0.4);
  cursor: pointer;
  z-index: 100;
}
</style>
