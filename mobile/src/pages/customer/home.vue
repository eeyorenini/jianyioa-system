<template>
  <view class="page">
    <!-- 顶部背景 -->
    <view class="home-header">
      <view class="header-top">
        <view class="greeting">
          <text class="greeting-time">{{ timeStr }}</text>
          <text class="greeting-name">{{ customerName }}，您好</text>
        </view>
        <view class="role-badge">业主</view>
      </view>
    </view>

    <!-- 内容 -->
    <view class="content-wrapper">
      <!-- 项目卡片 -->
      <view class="project-section" v-if="project">
        <view class="project-card">
          <view class="project-header">
            <text class="project-name">{{ project.name }}</text>
            <view class="status-badge" :class="getStatusClass(project.status)">
              {{ project.status || '进行中' }}
            </view>
          </view>
          <view class="project-address">
            📍 {{ project.customer_address || project.address || '地址待确认' }}
          </view>

          <!-- 进度 -->
          <view class="progress-section">
            <view class="progress-header">
              <text class="progress-label">整体进度</text>
              <text class="progress-pct" :class="getProgressClass(project.progress)">
                {{ project.progress || 0 }}%
              </text>
            </view>
            <view class="progress-bar">
              <view class="progress-fill" :class="getProgressClass(project.progress)"
                :style="{ width: (project.progress || 0) + '%' }"></view>
            </view>
          </view>

          <!-- 当前节点 -->
          <view class="current-node" v-if="currentNode">
            <text class="node-label">📅 当前节点</text>
            <text class="node-name">{{ currentNode.node_name || currentNode.stage_name }}</text>
          </view>
        </view>

        <!-- 异常提醒 -->
        <view class="alert-card" v-if="hasAlerts">
          <view class="alert-item" v-if="pendingInspect > 0" @click="goInspections">
            <text class="alert-icon">🔍</text>
            <text class="alert-text">有 {{ pendingInspect }} 条巡检记录待整改</text>
            <text class="alert-arrow">›</text>
          </view>
          <view class="alert-item" v-if="pendingPay > 0">
            <text class="alert-icon">💰</text>
            <text class="alert-text">待回款 ¥{{ pendingPay }}</text>
          </view>
        </view>

        <!-- 施工日志 -->
        <view class="section-card">
          <view class="section-title">
            <text>最近施工日志</text>
            <text class="more-link" @click="goLogs">查看全部 ›</text>
          </view>
          <view class="log-list" v-if="logs.length">
            <view class="log-item" v-for="log in logs" :key="log.id" @click="goLogDetail(log)">
              <view class="log-dot"></view>
              <view class="log-content">
                <text class="log-title">{{ log.content }}</text>
                <text class="log-meta">{{ log.creator_name }} · {{ log.created_at }}</text>
              </view>
            </view>
          </view>
          <view class="empty-tip" v-else>
            <text>暂无施工日志</text>
          </view>
        </view>

        <!-- 节点进度 -->
        <view class="section-card">
          <view class="section-title">
            <text>项目进度</text>
          </view>
          <view class="node-track" v-if="project.nodes && project.nodes.length">
            <view
              class="node-step"
              v-for="(node, idx) in project.nodes"
              :key="node.id"
            >
              <view class="step-circle" :class="`circle-${node.status || 'pending'}`">
                <text v-if="node.status === 'completed'">✓</text>
                <text v-else-if="node.status === 'in_progress'">●</text>
                <text v-else>○</text>
              </view>
              <text class="step-name" :class="`name-${node.status || 'pending'}`">
                {{ node.node_name || node.stage_name }}
              </text>
            </view>
          </view>
          <view class="empty-tip" v-else>
            <text>暂无节点信息</text>
          </view>
        </view>
      </view>

      <!-- 无项目 -->
      <view class="empty-state" v-else>
        <text class="empty-icon">🏠</text>
        <text class="empty-text">暂无关联项目</text>
        <text class="empty-sub">请联系工作人员为您绑定项目</text>
      </view>
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const customerName = computed(() => {
  const info = uni.getStorageSync('userInfo');
  return info?.name || '业主';
});

const timeStr = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const project = ref(null);
const logs = ref([]);
const pendingInspect = ref(0);
const pendingPay = ref(0);

const currentNode = computed(() => {
  if (!project.value?.nodes) return null;
  return project.value.nodes.find((n) => n.status === 'in_progress') ||
    project.value.nodes.find((n) => n.status === 'pending');
});

const hasAlerts = computed(() => pendingInspect.value > 0 || pendingPay.value > 0);

const getStatusClass = (status) => {
  if (!status) return 's-default';
  if (status.includes('竣工') || status.includes('完结') || status.includes('完成') || status.includes('验收')) return 's-done';
  if (status.includes('进行') || status.includes('施工')) return 's-progress';
  if (status.includes('暂停')) return 's-paused';
  return 's-default';
};

const getProgressClass = (progress) => {
  if (!progress || progress < 30) return 'p-low';
  if (progress < 70) return 'p-mid';
  return 'p-high';
};

const goLogs = () => {
  if (project.value) {
    uni.navigateTo({ url: `/pages/customer/logs?projectId=${project.value.id}` });
  }
};

const goLogDetail = (log) => {
  uni.navigateTo({ url: `/pages/customer/logs?projectId=${project.value?.id}` });
};

const goInspections = () => {
  uni.navigateTo({ url: `/pages/customer/inspections?projectId=${project.value?.id}` });
};

const fetchProject = async () => {
  try {
    const userInfo = uni.getStorageSync('userInfo');
    const customerId = userInfo?.id;
    console.log('用户信息:', userInfo);
    console.log('客户ID:', customerId);
    if (!customerId) {
      console.log('没有客户ID');
      return;
    }

    // 客户通过 customer_id 参数查询项目
    const res = await uni.request({
      url: `/api/projects?customer_id=${customerId}`,
    });
    console.log('项目接口返回:', res.data);
    const data = res.data;
    if (Array.isArray(data) && data.length > 0) {
      // 取第一个关联到该客户的项目
      project.value = data[0];
      console.log('设置项目:', project.value);
      // 获取日志
      if (data[0].id) {
        fetchLogs(data[0].id);
      }
    } else {
      console.log('没有找到项目');
    }
  } catch (e) {
    console.error('获取项目失败', e);
  }
};

const fetchLogs = async (projectId) => {
  try {
    const res = await uni.request({
      url: `/api/project-logs/${projectId}`,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      logs.value = data.slice(0, 3);
    }
  } catch (e) {}
};

onMounted(() => {
  fetchProject();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 30px;
}

.home-header {
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%);
  padding: 16px 16px 24px;
  border-radius: 0 0 20px 20px;
  color: #fff;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.greeting-time {
  display: block;
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 2px;
}

.greeting-name {
  font-size: 18px;
  font-weight: 600;
}

.role-badge {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
}

/* 项目卡片 */
.project-section {
  margin: -12px 16px 0;
  position: relative;
  z-index: 10;
}

.project-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
  margin-bottom: 12px;
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.project-name {
  font-size: 17px;
  font-weight: 700;
  color: #1A1F36;
  flex: 1;
  margin-right: 10px;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
}

.s-default { background: #F3F4F6; color: #6B7280; }
.s-done { background: #D1FAE5; color: #065F46; }
.s-progress { background: #DBEAFE; color: #1E40AF; }
.s-paused { background: #FEF3C7; color: #92400E; }

.project-address {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 14px;
}

.progress-section {
  margin-bottom: 14px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.progress-label {
  font-size: 12px;
  color: #6B7280;
}

.progress-pct {
  font-size: 14px;
  font-weight: 700;
}

.p-low { color: #9CA3AF; }
.p-mid { color: #F59E0B; }
.p-high { color: #10B981; }

.progress-bar {
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-fill.p-low { background: #D1D5DB; }
.progress-fill.p-mid { background: linear-gradient(90deg, #F59E0B, #FBBF24); }
.progress-fill.p-high { background: linear-gradient(90deg, #10B981, #34D399); }

.current-node {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #F9FAFB;
  padding: 10px 12px;
  border-radius: 8px;
}

.node-label {
  font-size: 12px;
  color: #6B7280;
}

.node-name {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
}

/* 提醒卡片 */
.alert-card {
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.alert-icon {
  font-size: 14px;
}

.alert-text {
  flex: 1;
  font-size: 13px;
  color: #991B1B;
}

.alert-arrow {
  font-size: 18px;
  color: #FCA5A5;
}

/* 区块卡片 */
.section-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 12px;
}

.more-link {
  font-size: 12px;
  color: #9CA3AF;
  font-weight: 400;
}

/* 日志列表 */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #F5F7FA;
  cursor: pointer;
}

.log-item:last-child {
  border-bottom: none;
}

.log-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1E3A5F;
  margin-top: 5px;
  flex-shrink: 0;
}

.log-content {
  flex: 1;
}

.log-title {
  display: block;
  font-size: 13px;
  color: #1A1F36;
  line-height: 1.4;
  margin-bottom: 2px;
}

.log-meta {
  font-size: 11px;
  color: #9CA3AF;
}

/* 节点进度 */
.node-track {
  display: flex;
  overflow-x: auto;
  gap: 0;
  padding: 4px 0;
}

.node-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  margin-bottom: 4px;
}

.circle-pending { background: #E5E7EB; color: #9CA3AF; }
.circle-in_progress { background: #3B82F6; color: #fff; }
.circle-completed { background: #10B981; color: #fff; }
.circle-skipped { background: #F59E0B; color: #fff; }

.step-name {
  font-size: 10px;
  color: #6B7280;
  text-align: center;
  white-space: nowrap;
}

.name-in_progress { color: #3B82F6; font-weight: 600; }
.name-completed { color: #10B981; }
.name-skipped { color: #F59E0B; }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.empty-sub {
  font-size: 13px;
  color: #9CA3AF;
}

.empty-tip {
  text-align: center;
  padding: 20px 0;
  font-size: 13px;
  color: #9CA3AF;
}
</style>
