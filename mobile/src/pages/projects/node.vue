<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目节点</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 节点状态 -->
    <view class="node-status-card">
      <view class="node-name-row">
        <text class="node-name">{{ node.node_name || node.stage_name || '节点详情' }}</text>
        <view class="status-pill" :class="getNodeStatusClass(node.status)">
          {{ getNodeStatusText(node.status) }}
        </view>
      </view>
      <view class="node-dates-row">
        <view class="date-item">
          <text class="date-label">计划开始</text>
          <text class="date-val">{{ node.plan_date || '未设置' }}</text>
        </view>
        <text class="arrow">→</text>
        <view class="date-item">
          <text class="date-label">计划结束</text>
          <text class="date-val">{{ node.plan_end_date || '未设置' }}</text>
        </view>
      </view>
      <view class="node-dates-row" v-if="node.actual_date">
        <view class="date-item">
          <text class="date-label">实际开始</text>
          <text class="date-val success">{{ node.actual_date }}</text>
        </view>
      </view>
    </view>

    <!-- 状态操作：一行横排小按钮 -->
    <view class="status-action-row">
      <view class="status-btn" :class="node.status === 'pending' ? 'active' : ''" @click="changeStatus('pending')">
        <text class="status-btn-icon">⏳</text>
        <text class="status-btn-text">待处理</text>
      </view>
      <view class="status-btn" :class="node.status === 'in_progress' ? 'active' : ''" @click="changeStatus('in_progress')">
        <text class="status-btn-icon">▶</text>
        <text class="status-btn-text">开工</text>
      </view>
      <view class="status-btn" :class="node.status === 'completed' ? 'active' : ''" @click="changeStatus('completed')">
        <text class="status-btn-icon">✅</text>
        <text class="status-btn-text">已验收</text>
      </view>
      <view class="status-btn" :class="node.status === 'skipped' ? 'active' : ''" @click="changeStatus('skipped')">
        <text class="status-btn-icon">⏭</text>
        <text class="status-btn-text">跳过</text>
      </view>
    </view>

    <!-- 节点管理入口 -->
    <view class="manage-card" @click="goNodeManage">
      <text class="manage-icon">⚙️</text>
      <text class="manage-label">节点管理</text>
      <text class="manage-arrow">›</text>
    </view>

    <!-- 施工标准 -->
    <view class="section-card">
      <view class="section-title">施工标准</view>
      <view class="standard-content" v-if="node.note">
        <text>{{ node.note }}</text>
      </view>
      <view class="empty-standard" v-else>
        <text>暂无施工标准说明</text>
      </view>
    </view>

    <!-- 节点时间线（与详情页一致） -->
    <view class="section-card" style="margin-top: 0;">
      <view class="section-title">全部节点</view>
      <view class="node-timeline" v-if="allNodes.length">
        <view
          class="timeline-item"
          v-for="(n, idx) in allNodes"
          :key="n.id"
          @click="goNode(n)"
        >
          <view class="timeline-line">
            <view class="timeline-dot" :class="getNodeStatusClass(n.status)"></view>
            <view class="timeline-connector" v-if="idx < allNodes.length - 1"></view>
          </view>
          <view class="timeline-content">
            <view class="node-card" :class="`node-card-${getNodeStatusClass(n.status)}`">
              <view class="node-card-header">
                <text class="node-seq">{{ idx + 1 }}</text>
                <text class="node-title">{{ n.node_name || n.stage_name || '未命名' }}</text>
                <view class="node-status-pill" :class="getNodeStatusClass(n.status)">
                  {{ getNodeStatusText(n.status) }}
                </view>
              </view>
              <view class="node-card-body">
                <view class="node-dates" v-if="n.plan_date">
                  <text class="node-date-icon">📅</text>
                  <text class="node-date-text">{{ formatNodeDateRange(n.plan_date, n.plan_end_date) }}</text>
                </view>
                <view class="node-dates" v-else>
                  <text class="node-date-text muted">未排期</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view class="empty-timeline" v-else>
        <text>暂无节点</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";
import { useUserStore } from "@/stores/user";
import { formatNodeDateRange } from "../../utils/format";

const projectId = ref(0);
const nodeId = ref(0);
const userStore = useUserStore();
const node = ref({});
const allNodes = ref([]);
const logs = ref([]);

const getNodeStatusClass = (status) => {
  if (status === 'completed') return 'n-done';
  if (status === 'in_progress') return 'n-progress';
  if (status === 'skipped') return 'n-skipped';
  return 'n-pending';
};

const getNodeStatusText = (status) => {
  const map = {
    pending: '待开始',
    in_progress: '进行中',
    completed: '已完成',
    skipped: '已跳过',
  };
  return map[status] || '待开始';
};

// 状态修改（替换原来的 doReport）
const changeStatus = async (newStatus) => {
  const statusLabel = { pending: '待处理', in_progress: '进行中', completed: '已完成', skipped: '已跳过' };
  // 完工时需要填 progress_percent 和 actual_date
  const extra = newStatus === 'completed'
    ? { progress_percent: 100, actual_date: new Date().toISOString().split('T')[0] }
    : {};

  const confirm = await new Promise((resolve) => {
    uni.showModal({
      title: `确认修改状态`,
      content: `确定将「${node.value.node_name || node.value.stage_name}」设为「${statusLabel[newStatus]}」？\n\n是否发送短信通知？`,
      confirmText: '确认并发送短信',
      cancelText: '仅保存',
      success: (m) => resolve(m.confirm ? 'sms' : 'save'),
    });
  });

  try {
    const token = uni.getStorageSync("token");
    const payload = { status: newStatus, ...extra };
    // 发送短信参数：sms_notify=1 表示需要发短信
    if (confirm === 'sms') payload.sms_notify = 1;

    await uni.request({
      url: `/api/project-stages/${nodeId.value}`,
      method: "PUT",
      header: { Authorization: token },
      data: payload,
    });

    // 写项目日志
    const actionMap = { pending: 'node_pending', in_progress: 'node_started', completed: 'node_completed', skipped: 'node_skipped' };
    await uni.request({
      url: "/api/project-logs",
      method: "POST",
      header: { Authorization: token },
      data: {
        project_id: projectId.value,
        stage_id: nodeId.value,
        action_type: actionMap[newStatus] || 'node_updated',
        description: `节点「${node.value.node_name || node.value.stage_name}」状态变更为「${statusLabel[newStatus]}」${confirm === 'sms' ? '（已发短信）' : ''}`,
      },
    });

    uni.showToast({ title: confirm === 'sms' ? '已保存并发送短信' : '已保存', icon: 'success' });
    await fetchData();
  } catch (e) {
    console.error(e);
    uni.showToast({ title: '操作失败', icon: 'none' });
  }
};

const goNode = (n) => {
  if (n.id !== nodeId.value) {
    uni.navigateTo({ url: `/pages/projects/node?id=${n.id}&projectId=${projectId.value}` });
  }
};

const goNodeManage = () => {
  uni.navigateTo({ url: `/pages/projects/nodeManage?id=${projectId.value}` });
};

const fetchData = async () => {
  try {
    const token = uni.getStorageSync("token");
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: "/api/projects",
      header: { 
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),

      },
    });
    const data = res.data;
    if (Array.isArray(data)) {
      const project = data.find((p) => p.id === projectId.value);
      if (project) {
        allNodes.value = project.nodes || [];
        const found = allNodes.value.find((n) => n.id === nodeId.value);
        if (found) node.value = found;
      }
    }
  } catch (e) {
    console.error(e);
  }
};

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  nodeId.value = parseInt(options.id || '0');
  projectId.value = parseInt(options.projectId || '0');
  await fetchData();
  // 加载日志
  if (projectId.value) {
    try {
      const token = uni.getStorageSync("token");
      const res = await uni.request({
        url: `/api/project-logs/${projectId.value}`,
        header: { Authorization: token },
      });
      const d = res.data;
      if (Array.isArray(d)) {
        logs.value = d.filter((l) => l.stage_id === nodeId.value);
      }
    } catch (e) {
      // 接口可能不存在
    }
  }
});


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 12px;
  padding-bottom: 30px;
}

.node-status-card {
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  border-radius: 0;
  padding: 14px;
  color: #fff;
  margin-bottom: 12px;
}

.node-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.node-name {
  font-size: 18px;
  font-weight: 700;
}

.status-pill {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 500;
}

.s-pending { background: rgba(255,255,255,0.2); color: #fff; }
.s-progress { background: #3B82F6; color: #fff; }
.s-done { background: #10B981; color: #fff; }
.s-skipped { background: #F59E0B; color: #fff; }

.node-dates-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.date-item {
  flex: 1;
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 8px 10px;
}

.date-label {
  display: block;
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 2px;
}

.date-val {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.date-val.success { color: #6EE7B7; }

.arrow {
  font-size: 16px;
  color: rgba(255,255,255,0.5);
}

/* 状态操作：一行横排小按钮 */
.status-action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.status-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 10px;
  padding: 10px 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  border: 1.5px solid transparent;
  transition: all 0.15s;
}

.status-btn:active {
  transform: scale(0.96);
  background: #F5F7FA;
}

.status-btn.active {
  border-color: #1E3A5F;
  background: #EEF2F7;
}

.status-btn-icon {
  font-size: 18px;
  margin-bottom: 4px;
}

.status-btn-text {
  font-size: 11px;
  color: #374151;
  font-weight: 500;
}

/* 节点管理入口 */
.manage-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.manage-card:active {
  background: #F5F7FA;
}

.manage-icon {
  font-size: 20px;
  margin-right: 10px;
}

.manage-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.manage-arrow {
  font-size: 18px;
  color: #9CA3AF;
}

/* 通用区块 */
.section-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #F3F4F6;
}

.standard-content {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
}

.empty-standard {
  font-size: 13px;
  color: #D1D5DB;
  text-align: center;
  padding: 12px;
}

/* 节点时间线（与详情页一致） */
.node-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 0;
}

.timeline-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 14px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
}

.n-pending { background: #E5E7EB; }
.n-progress { background: #3B82F6; }
.n-done { background: #10B981; }
.n-skipped { background: #F59E0B; }

.timeline-connector {
  width: 2px;
  flex: 1;
  background: #E5E7EB;
  min-height: 20px;
}

.timeline-content {
  flex: 1;
  padding: 0 0 16px 10px;
}

.node-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border-left: 3px solid transparent;
  cursor: pointer;
}

.node-card-n-done { border-left-color: #10B981; }
.node-card-n-progress { border-left-color: #3B82F6; }
.node-card-n-pending { border-left-color: #E5E7EB; }
.node-card-n-skipped { border-left-color: #F59E0B; }

.node-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.node-seq {
  width: 20px;
  height: 20px;
  background: #F3F4F6;
  color: #6B7280;
  border-radius: 50%;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.node-status-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.node-status-pill.n-pending { background: #F3F4F6; color: #9CA3AF; }
.node-status-pill.n-progress { background: #DBEAFE; color: #1E40AF; }
.node-status-pill.n-done { background: #D1FAE5; color: #065F46; }
.node-status-pill.n-skipped { background: #FEF3C7; color: #92400E; }

.node-card-body {
  margin-bottom: 0;
}

.node-dates {
  display: flex;
  align-items: center;
  gap: 4px;
}

.node-date-icon { font-size: 12px; }

.node-date-text {
  font-size: 12px;
  color: #6B7280;
}

.node-date-text.muted { color: #D1D5DB; }

.empty-timeline {
  font-size: 13px;
  color: #D1D5DB;
  text-align: center;
  padding: 12px;
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
