<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">施工日志</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 施工日志列表 -->
    <scroll-view class="log-list" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>
      <view v-else-if="logs.length === 0" class="empty-state">
        <text class="empty-icon">📝</text>
        <text class="empty-text">暂无施工日志</text>
      </view>
      <view v-else>
        <view class="log-item" v-for="log in logs" :key="log.id">
          <!-- 第一行：日期卡片 + 提交人/时间 + 工种人数 -->
          <view class="log-row-first">
            <view class="log-date-bar">
              <text class="log-date-day">{{ formatDay(log.created_at) }}</text>
              <text class="log-date-month">{{ formatMonth(log.created_at) }}</text>
            </view>
            <view class="log-user-info">
              <view class="log-user-line">
                <text class="log-operator">👷 {{ log.operator || '未知' }}</text>
                <text class="log-time">{{ formatFullTime(log.created_at) }}</text>
              </view>
              <view class="log-tags-row" v-if="log.work_type || log.worker_count">
                <text class="log-tag-icon" v-if="log.work_type">🔧 {{ log.work_type }}</text>
                <text class="log-tag-icon" v-if="log.worker_count">👷 {{ log.worker_count }}人</text>
              </view>
            </view>
          </view>

          <!-- 内容区域 -->
          <view class="log-content-area">
            <!-- 施工内容 -->
            <view class="log-content-row" v-if="log.content">
              <view class="log-tag-box">施工内容</view>
              <view class="log-content-text">{{ log.content }}</view>
            </view>

            <!-- 明日计划 -->
            <view class="log-content-row" v-if="log.tomorrow_plan">
              <view class="log-tag-box">明日计划</view>
              <view class="log-content-text">{{ log.tomorrow_plan }}</view>
            </view>

            <!-- 备注 -->
            <view class="log-content-row" v-if="log.note">
              <view class="log-tag-box">备注</view>
              <view class="log-content-text">{{ log.note }}</view>
            </view>

            <!-- 图片 -->
            <view class="log-photos" v-if="getLogPhotos(log).length">
              <view
                class="log-photo"
                v-for="(photo, idx) in getLogPhotos(log)"
                :key="idx"
                @click="previewLogPhoto(log, idx)"
              >
                <image class="log-photo-img" :src="photo" mode="aspectFill" />
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const projectId = ref(0);
const logs = ref([]);
const loading = ref(false);

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = current.options || {};
  projectId.value = parseInt(options.projectId || '0');
  fetchLogs();
});

function fetchLogs() {
  if (!projectId.value) return;
  loading.value = true;
  uni.request({
    url: `/api/project-logs/${projectId.value}`,
    success: (res) => {
      if (Array.isArray(res.data)) {
        logs.value = res.data;
      } else if (res.data?.data?.list) {
        logs.value = res.data.data.list;
      } else {
        logs.value = [];
      }
    },
    fail: () => {
      logs.value = [];
    },
    complete: () => {
      loading.value = false;
    }
  });
}

// 获取日志图片（处理双重编码的JSON字符串）
function getLogPhotos(log) {
  if (!log.images) return [];
  try {
    let photosStr = log.images;
    let parsed = JSON.parse(photosStr);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim());
    }
    return [];
  } catch (e) {
    return [];
  }
}

// 预览日志图片
function previewLogPhoto(log, idx) {
  const photos = getLogPhotos(log);
  uni.previewImage({ urls: photos, current: photos[idx] });
}

// 施工日志日期格式化 - 日
function formatDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return String(d.getDate()).padStart(2, '0');
}

// 施工日志日期格式化 - 月
function formatMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return months[d.getMonth()];
}

// 施工日志完整时间
function formatFullTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 70px;
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

/* 日志列表 */
.log-list {
  padding: 16px;
  height: calc(100vh - 120px);
}

.loading-state {
  text-align: center;
  padding: 60px;
  color: #9CA3AF;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: #9CA3AF;
}

/* 日志卡片 */
.log-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  margin-bottom: 12px;
}

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

.log-time {
  font-size: 12px;
  color: #9CA3AF;
}

.log-content-area {
  /* 标签从最左边（日期卡片列）开始 */
}

.log-content-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 0;
}

.log-content-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
  text-align: left;
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
}

/* 图片网格：每排5个正方形 */
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
</style>
