<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 顶部项目信息卡片 -->
    <view class="project-header">
      <view class="project-title-row">
        <view class="project-name-wrap">
          <text class="project-name">{{ project.name }}</text>
          <view class="status-badge" :class="getStatusClass(project.status)">
            {{ project.status || '未知' }}
          </view>
        </view>
      </view>

      <view class="project-progress">
        <view class="progress-bar-full">
          <view class="progress-fill-full" :style="{ width: (project.progress || 0) + '%' }"></view>
        </view>
        <text class="progress-text-full">{{ project.progress || 0 }}%</text>
      </view>

      <!-- 基本信息 -->
      <view class="info-grid">
        <view class="info-item">
          <text class="info-label">客户</text>
          <text class="info-value">{{ project.customer_name || '未关联' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">预算</text>
          <text class="info-value accent">{{ project.budget ? '¥' + project.budget.toLocaleString() : '未设置' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">开工</text>
          <text class="info-value">{{ project.start_date || '未设置' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">竣工</text>
          <text class="info-value">{{ project.end_date || '未设置' }}</text>
        </view>
      </view>
    </view>

    <!-- 标签页导航 -->
    <view class="tab-bar">
      <view
        class="tab-item"
        v-for="tab in tabs"
        :key="tab.key"
        :class="{ active: curTab === tab.key }"
        @click="curTab = tab.key"
      >
        <text>{{ tab.label }}</text>
        <view class="tab-dot" v-if="tab.badge">{{ tab.badge }}</view>
      </view>
    </view>

    <!-- 标签页内容 -->
    <view class="tab-content">

      <!-- 进度节点 -->
      <view v-if="curTab === 'nodes'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">施工节点</text>
          <view class="toolbar-right">
            <text class="tool-btn" @click="goNodeManage">⚙️ 管理节点</text>
          </view>
        </view>

        <view class="node-timeline" v-if="project.nodes && project.nodes.length">
          <view
            class="timeline-item"
            v-for="(node, idx) in project.nodes"
            :key="node.id"
            @click="goNode(node)"
          >
            <!-- 时间线 -->
            <view class="timeline-line">
              <view class="timeline-dot" :class="getNodeStatusClass(node.status)"></view>
              <view class="timeline-connector" v-if="idx < project.nodes.length - 1"></view>
            </view>

            <!-- 内容 -->
            <view class="timeline-content">
              <view class="node-card" :class="`node-card-${getNodeStatusClass(node.status)}`">
                <view class="node-card-header">
                  <text class="node-seq">{{ idx + 1 }}</text>
                  <text class="node-title">{{ node.node_name || node.stage_name || '未命名' }}</text>
                  <view class="node-status-pill" :class="getNodeStatusClass(node.status)">
                    {{ getNodeStatusText(node.status) }}
                  </view>
                </view>
                <view class="node-card-body">
                  <view class="node-dates" v-if="node.plan_date">
                    <text class="node-date-icon">📅</text>
                    <text class="node-date-text">{{ node.plan_date }}
                      <text v-if="node.plan_end_date"> ~ {{ node.plan_end_date }}</text>
                    </text>
                  </view>
                  <view class="node-dates" v-else>
                    <text class="node-date-text muted">未排期</text>
                  </view>
                </view>
                <!-- 操作按钮 -->
                <view class="node-card-actions" v-if="node.status !== 'completed' && node.status !== 'skipped'">
                  <view class="action-btn-sm" v-if="node.status === 'pending'" @click.stop="reportStart(node)">
                    ▶ 开工
                  </view>
                  <view class="action-btn-sm accent" v-if="node.status === 'in_progress'" @click.stop="reportComplete(node)">
                    ✅ 完工上报
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="empty-state" v-else>
          <text class="empty-icon">📋</text>
          <text class="empty-text">暂无节点，请先添加节点</text>
          <view class="btn btn-primary" style="margin-top: 16px;" @click="goNodeManage">添加节点</view>
        </view>
      </view>

      <!-- 施工日志 -->
      <view v-if="curTab === 'logs'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">施工日志</text>
          <text class="tool-btn" @click="goLogAdd">+ 新建日志</text>
        </view>

        <view class="log-list" v-if="logs.length">
          <view class="log-item" v-for="log in logs" :key="log.id">
            <view class="log-date-tag">{{ log.date }}</view>
            <view class="log-content">
              <text class="log-title">{{ log.content || '暂无内容' }}</text>
              <view class="log-meta">
                <text>👷 {{ log.worker || '未知' }}</text>
                <text v-if="log.photos">📷 {{ log.photos }}张</text>
              </view>
            </view>
          </view>
        </view>
        <view class="empty-state" v-else>
          <text class="empty-icon">📝</text>
          <text class="empty-text">暂无施工日志</text>
        </view>
      </view>

      <!-- 巡检问题 -->
      <view v-if="curTab === 'inspect'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">质量问题</text>
          <text class="tool-btn" @click="goInspectAdd">+ 新建巡检</text>
        </view>

        <view class="issue-list" v-if="issues.length">
          <view class="issue-item" v-for="issue in issues" :key="issue.id" @click="goInspectDetail(issue)">
            <view class="issue-header">
              <view class="issue-level" :class="`level-${issue.level}`">
                {{ issue.level === 'serious' ? '严重' : issue.level === 'stop' ? '停工' : '一般' }}
              </view>
              <text class="issue-title">{{ issue.title }}</text>
            </view>
            <view class="issue-meta">
              <text class="issue-location">📍 {{ issue.location }}</text>
              <view class="issue-status" :class="`status-${issue.status}`">{{ issue.statusText }}</view>
            </view>
          </view>
        </view>
        <view class="empty-state" v-else>
          <text class="empty-icon">🔍</text>
          <text class="empty-text">暂无质量问题</text>
        </view>
      </view>

      <!-- 派工 -->
      <view v-if="curTab === 'dispatch'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">派工单</text>
          <text class="tool-btn" @click="goDispatchAdd">+ 新建派工</text>
        </view>
        <view class="empty-state" v-if="dispatches.length === 0">
          <text class="empty-icon">👷</text>
          <text class="empty-text">暂无派工单</text>
        </view>
      </view>

      <!-- 材料 -->
      <view v-if="curTab === 'material'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">材料台账</text>
          <text class="tool-btn" @click="goMaterial">查看全部</text>
        </view>
        <view class="empty-state" v-if="materials.length === 0">
          <text class="empty-icon">🧱</text>
          <text class="empty-text">暂无材料记录</text>
        </view>
      </view>

      <!-- 合同变更 -->
      <view v-if="curTab === 'contract'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">合同与变更</text>
        </view>
        <view class="contract-info">
          <view class="contract-item">
            <text class="contract-label">合同金额</text>
            <text class="contract-value">¥{{ project.budget ? project.budget.toLocaleString() : '0' }}</text>
          </view>
          <view class="contract-item">
            <text class="contract-label">变更金额</text>
            <text class="contract-value accent">+¥0</text>
          </view>
          <view class="contract-item total">
            <text class="contract-label">合同总造价</text>
            <text class="contract-value">¥{{ project.budget ? project.budget.toLocaleString() : '0' }}</text>
          </view>
        </view>
        <view class="empty-state">
          <text class="empty-icon">📄</text>
          <text class="empty-text">暂无变更记录</text>
        </view>
      </view>

      <!-- 财务收支 -->
      <view v-if="curTab === 'finance'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">收支记录</text>
          <text class="tool-btn" @click="goFinance">+ 新增</text>
        </view>
        <view class="finance-summary">
          <view class="finance-card income">
            <text class="finance-card-label">已收款</text>
            <text class="finance-card-num">¥{{ financeData.income.toLocaleString() }}</text>
          </view>
          <view class="finance-card expense">
            <text class="finance-card-label">已支出</text>
            <text class="finance-card-num">¥{{ financeData.expense.toLocaleString() }}</text>
          </view>
        </view>
        <view class="empty-state" v-if="financeData.records.length === 0">
          <text class="empty-icon">💰</text>
          <text class="empty-text">暂无收支记录</text>
        </view>
      </view>

      <!-- 项目资料 -->
      <view v-if="curTab === 'gallery'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">项目图库</text>
        </view>
        <view class="gallery-cats">
          <view class="gallery-cat" v-for="cat in galleryCats" :key="cat.name" @click="goGallery(cat.key)">
            <text class="gallery-cat-icon">{{ cat.icon }}</text>
            <text class="gallery-cat-name">{{ cat.name }}</text>
            <text class="gallery-cat-count">{{ cat.count }}张</text>
          </view>
        </view>
      </view>

    </view>

    <!-- 底部快捷操作 -->
    <view class="bottom-actions">
      <view class="action-quick" @click="reportStart({})">
        <text>▶ 开工</text>
      </view>
      <view class="action-quick" @click="goLogAdd">
        <text>📝 日志</text>
      </view>
      <view class="action-quick" @click="goInspectAdd">
        <text>🔍 巡检</text>
      </view>
      <view class="action-primary" @click="goDispatchAdd">
        <text>+ 派工</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const projectId = ref(0);
const project = ref({});
const curTab = ref('nodes');

const tabs = computed(() => [
  { key: 'nodes', label: '进度节点' },
  { key: 'logs', label: '施工日志' },
  { key: 'inspect', label: '巡检', badge: issues.value.length || null },
  { key: 'dispatch', label: '派工' },
  { key: 'material', label: '材料' },
  { key: 'contract', label: '合同' },
  { key: 'finance', label: '财务' },
  { key: 'gallery', label: '图库' },
]);

// 假数据
const logs = ref([
  { id: 1, date: '09-16', content: '今日进行水电改造，完成了卫生间和厨房的布线工作...', worker: '李工长', photos: 6 },
  { id: 2, date: '09-15', content: '开工交底完成，设计师、项目经理、业主三方现场确认...', worker: '王监理', photos: 12 },
]);

const issues = ref([
  { id: 1, title: '防水层局部破损', level: 'serious', location: '卫生间', status: 'pending', statusText: '待整改' },
  { id: 2, title: '墙面空鼓', level: 'normal', location: '客厅', status: 'fixing', statusText: '整改中' },
]);

const dispatches = ref([]);
const materials = ref([]);

const financeData = ref({
  income: 58000,
  expense: 32100,
  records: [],
});

const galleryCats = ref([
  { key: '开工', name: '开工', icon: '🎉', count: 5 },
  { key: '水电', name: '水电', icon: '⚡', count: 12 },
  { key: '防水', name: '防水', icon: '💧', count: 8 },
  { key: '泥瓦', name: '泥瓦', icon: '🧱', count: 20 },
  { key: '木工', name: '木工', icon: '🪚', count: 15 },
  { key: '油漆', name: '油漆', icon: '🎨', count: 10 },
  { key: '安装', name: '安装', icon: '🔧', count: 6 },
  { key: '验收', name: '验收', icon: '✅', count: 3 },
]);

const getStatusClass = (status) => {
  if (!status) return 's-default';
  if (status.includes('竣工') || status.includes('完结') || status.includes('完成')) return 's-done';
  if (status.includes('进行')) return 's-progress';
  if (status.includes('未开工')) return 's-pending';
  if (status.includes('延期')) return 's-overdue';
  return 's-default';
};

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

const goNode = (node) => {
  uni.navigateTo({ url: `/pages/projects/node?id=${node.id}&projectId=${projectId.value}` });
};

const goNodeManage = () => {
  uni.navigateTo({ url: `/pages/projects/nodeManage?id=${projectId.value}` });
};

const goLogAdd = () => {
  uni.navigateTo({ url: `/pages/projects/log-add?projectId=${projectId.value}` });
};

const goInspectAdd = () => {
  uni.navigateTo({ url: `/pages/inspection/add?projectId=${projectId.value}` });
};

const goInspectDetail = (issue) => {
  uni.navigateTo({ url: `/pages/inspection/detail?id=${issue.id}` });
};

const goDispatchAdd = () => {
  uni.navigateTo({ url: `/pages/dispatch/add?projectId=${projectId.value}` });
};

const goMaterial = () => {
  uni.navigateTo({ url: `/pages/material/list?projectId=${projectId.value}` });
};

const goFinance = () => {
  uni.navigateTo({ url: `/pages/finance/add?projectId=${projectId.value}` });
};

const goGallery = (cat) => {
  uni.navigateTo({ url: `/pages/gallery/index?projectId=${projectId.value}&cat=${cat}` });
};

const reportStart = (node) => {
  uni.showActionSheet({
    itemList: ['确认开工', '取消'],
    success: async (res) => {
      if (res.tapIndex === 0 && node.id) {
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: { status: 'in_progress' },
          });
          uni.showToast({ title: '已开工', icon: 'success' });
          await fetchDetail();
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    },
  });
};

const reportComplete = (node) => {
  uni.showModal({
    title: '完工上报',
    content: `确认「${node.node_name || node.stage_name}」已完成？`,
    confirmText: '确认完工',
    success: async (res) => {
      if (res.confirm) {
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: {
              status: 'completed',
              progress_percent: 100,
              actual_date: new Date().toISOString().split('T')[0],
            },
          });
          // 记录日志
          await uni.request({
            url: "/api/project-logs",
            method: "POST",
            header: { Authorization: token },
            data: {
              project_id: projectId.value,
              stage_id: node.id,
              action_type: 'node_completed',
              description: `节点「${node.node_name || node.stage_name}」完工上报`,
            },
          });
          uni.showToast({ title: '已完工上报', icon: 'success' });
          await fetchDetail();
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    },
  });
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
      if (found) project.value = found;
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
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 80px;
}

/* 项目头部 */
.project-header {
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%);
  padding: 16px 16px 20px;
  color: #fff;
}

.project-title-row {
  margin-bottom: 14px;
}

.project-name-wrap {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.project-name {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  flex: 1;
  line-height: 1.4;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
  white-space: nowrap;
}

.s-default { background: rgba(255,255,255,0.15); color: #fff; }
.s-done { background: #10B981; color: #fff; }
.s-progress { background: #3B82F6; color: #fff; }
.s-pending { background: rgba(255,255,255,0.15); color: #fff; }
.s-overdue { background: #EF4444; color: #fff; }

/* 进度条 */
.project-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.progress-bar-full {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill-full {
  height: 100%;
  background: linear-gradient(90deg, #10B981, #34D399);
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-text-full {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  width: 42px;
  text-align: right;
}

/* 信息格 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 8px 10px;
}

.info-label {
  display: block;
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 2px;
}

.info-value {
  font-size: 13px;
  color: #fff;
  font-weight: 500;
}

.info-value.accent { color: #6EE7B7; }

/* 标签页 */
.tab-bar {
  display: flex;
  background: #fff;
  padding: 0 8px;
  border-bottom: 1px solid #F3F4F6;
  overflow-x: auto;
  white-space: nowrap;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 12px 12px;
  font-size: 13px;
  color: #9CA3AF;
  border-bottom: 2px solid transparent;
  position: relative;
  flex-shrink: 0;
}

.tab-item.active {
  color: #1E3A5F;
  font-weight: 600;
  border-bottom-color: #1E3A5F;
}

.tab-dot {
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: 600;
}

/* 标签内容 */
.tab-content {
  padding: 12px 16px;
}

.tab-panel {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
}

.tool-btn {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 500;
}

/* 节点时间线 */
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
}

.node-card-n-done { border-left-color: #10B981; }
.node-card-n-progress { border-left-color: #3B82F6; }
.node-card-n-pending { border-left-color: #E5E7EB; }

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

.node-card-body {
  margin-bottom: 8px;
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

.node-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #F9FAFB;
}

.action-btn-sm {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  background: #F3F4F6;
  color: #374151;
  cursor: pointer;
}

.action-btn-sm.accent {
  background: #1E3A5F;
  color: #fff;
}

/* 日志 */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  display: flex;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.log-date-tag {
  background: #1E3A5F;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  height: fit-content;
}

.log-title {
  font-size: 14px;
  color: #1A1F36;
  line-height: 1.5;
  display: block;
  margin-bottom: 6px;
}

.log-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #9CA3AF;
}

/* 问题 */
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issue-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.issue-level {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.level-normal { background: #FEF3C7; color: #92400E; }
.level-serious { background: #FEE2E2; color: #991B1B; }
.level-stop { background: #7C3AED; color: #fff; }

.issue-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.issue-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.issue-location {
  font-size: 12px;
  color: #9CA3AF;
}

.issue-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-pending { background: #FEE2E2; color: #991B1B; }
.status-fixing { background: #FEF3C7; color: #92400E; }

/* 合同 */
.contract-info {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.contract-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #F9FAFB;
}

.contract-item.total {
  border-bottom: none;
  padding-top: 14px;
}

.contract-label {
  font-size: 13px;
  color: #6B7280;
}

.contract-value {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.contract-value.accent { color: #EF4444; }

/* 财务 */
.finance-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.finance-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.finance-card.income {
  background: linear-gradient(135deg, #D1FAE5, #A7F3D0);
}

.finance-card.expense {
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
}

.finance-card-label {
  display: block;
  font-size: 12px;
  color: #065F46;
  margin-bottom: 6px;
}

.finance-card.expense .finance-card-label {
  color: #991B1B;
}

.finance-card-num {
  font-size: 20px;
  font-weight: 700;
  color: #065F46;
}

.finance-card.expense .finance-card-num { color: #991B1B; }

/* 图库分类 */
.gallery-cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.gallery-cat {
  background: #fff;
  border-radius: 12px;
  padding: 14px 8px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.gallery-cat:active {
  transform: scale(0.97);
}

.gallery-cat-icon {
  display: block;
  font-size: 24px;
  margin-bottom: 6px;
}

.gallery-cat-name {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 2px;
}

.gallery-cat-count {
  font-size: 11px;
  color: #9CA3AF;
}

/* 底部操作 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 10px 16px;
  display: flex;
  gap: 8px;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  z-index: 100;
}

.action-quick {
  flex: 1;
  background: #F3F4F6;
  color: #374151;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.action-primary {
  flex: 1.2;
  background: #1E3A5F;
  color: #fff;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
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
