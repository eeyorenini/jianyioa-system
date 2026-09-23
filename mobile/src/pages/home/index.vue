<template>
  <view class="page">
    <!-- 顶部导航（首页不需要返回按钮） -->
    <view class="nav-bar">
      <view class="nav-placeholder"></view>
      <text class="nav-title">首页</text>
      <view class="msg-icon" @click="goMessage">
        <text>🔔</text>
        <view class="msg-badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
      </view>
    </view>

    <!-- 顶部背景 -->
    <view class="home-header">
      <view class="header-top">
        <view class="greeting">
          <text class="greeting-time">{{ timeStr }}</text>
          <text class="greeting-name">{{ userName }}，您好</text>
        </view>
        <view class="role-badge" :class="getRoleClass(roleName)">{{ roleName }}</view>
      </view>

      <!-- 核心数据统计 -->
      <view class="stats-row">
        <view class="stat-card" @click="goProjects('进行中')">
          <text class="stat-num success">{{ stats.inProgress }}</text>
          <text class="stat-label">进行中</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-card" @click="goProjects('逾期')">
          <text class="stat-num danger">{{ stats.overdue }}</text>
          <text class="stat-label">逾期节点</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-card" @click="goInspections">
          <text class="stat-num warning">{{ stats.pendingInspect }}</text>
          <text class="stat-label">待整改</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-card" @click="goFinance">
          <text class="stat-num">{{ stats.pendingPay }}</text>
          <text class="stat-label">待回款</text>
        </view>
      </view>

      <!-- 快捷入口 -->
      <view class="quick-entry-section">
        <view class="section-title">快捷操作</view>
        <view class="quick-grid">
          <view class="quick-item" v-for="item in quickEntries" :key="item.icon" @click="handleQuick(item)">
            <view class="quick-icon" :style="{ background: item.bg }">
              <text>{{ item.icon }}</text>
            </view>
            <text class="quick-label">{{ item.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 待办事项 -->
    <view class="todo-section">
      <view class="section-title">
        <text>待办事项</text>
        <text class="todo-count" v-if="todos.length">{{ todos.length }}</text>
      </view>
      <view class="todo-list" v-if="todos.length">
        <view class="todo-item" v-for="todo in todos" :key="todo.id" @click="goTodo(todo)">
          <view class="todo-left">
            <view class="todo-priority" :class="`priority-${todo.priority}`"></view>
            <view class="todo-content">
              <text class="todo-title">{{ todo.title }}</text>
              <text class="todo-meta">{{ todo.project }} · {{ todo.time }}</text>
            </view>
          </view>
          <text class="todo-arrow">›</text>
        </view>
      </view>
      <view class="empty-state" v-else>
        <text class="empty-icon">✓</text>
        <text class="empty-text">暂无待办事项</text>
      </view>
    </view>

    <!-- 预警项目 -->
    <view class="warning-section" v-if="warnings.length">
      <view class="section-title warning-title">
        <text>⚠️ 逾期预警</text>
      </view>
      <view class="warning-list">
        <view class="warning-item" v-for="w in warnings" :key="w.id" @click="goProject(w.id)">
          <view class="warning-info">
            <text class="warning-name">{{ w.name }}</text>
            <text class="warning-desc">{{ w.node }} 已逾期 {{ w.days }} 天</text>
          </view>
          <view class="warning-days">{{ w.days }}天</view>
        </view>
      </view>
    </view>

    <!-- 最近项目 -->
    <view class="recent-section">
      <view class="section-title">
        <text>最近项目</text>
        <text class="more-link" @click="goProjects()">查看全部 ›</text>
      </view>
      <view class="recent-list">
        <view class="recent-item" v-for="p in recentProjects" :key="p.id" @click="goProject(p.id)">
          <view class="recent-info">
            <text class="recent-name">{{ p.name }}</text>
            <text class="recent-meta">{{ p.customer }} · {{ p.statusText }}</text>
          </view>
          <view class="recent-progress">
            <view class="progress-bar-sm">
              <view class="progress-fill-sm" :style="{ width: p.progress + '%' }"></view>
            </view>
            <text class="progress-num-sm">{{ p.progress }}%</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ===== 底部选择弹窗 ===== -->
    <!-- 项目选择弹窗（通用） -->
    <BottomPicker
      v-model:visible="projectPicker.visible"
      :title="projectPicker.title"
      :items="projectPicker.items"
      @select="onProjectSelect"
      @cancel="onProjectPickerCancel"
    />

    <!-- 材料管理弹窗 -->
    <BottomPicker
      v-model:visible="materialPicker.visible"
      :title="materialPicker.title"
      :items="materialPicker.items"
      @select="onMaterialSelect"
      @cancel="onMaterialPickerCancel"
    />

    <!-- 甘特图项目选择弹窗 -->
    <BottomPicker
      v-model:visible="ganttPicker.visible"
      :title="ganttPicker.title"
      :items="ganttPicker.items"
      @select="onGanttSelect"
      @cancel="onGanttPickerCancel"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import BottomPicker from "@/components/bottom-picker.vue";

const userStore = useUserStore();
const userName = computed(() => userStore.state.name || '用户');
const roleName = computed(() => userStore.state.position || userStore.state.role_name || '未知');

const unreadCount = ref(0);

const timeStr = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const stats = ref({
  inProgress: 3,
  overdue: 2,
  pendingInspect: 1,
  pendingPay: '¥12.8万',
});

const getRoleClass = (role) => {
  if (role.includes('管理')) return 'role-admin';
  if (role.includes('设计')) return 'role-designer';
  if (role.includes('工长')) return 'role-worker';
  if (role.includes('监理')) return 'role-supervisor';
  if (role.includes('业主')) return 'role-owner';
  if (role.includes('主材')) return 'role-material';
  if (role.includes('财务')) return 'role-finance';
  return 'role-assistant';
};

const goMessage = () => {
  uni.navigateTo({ url: '/pages/message/list' });
};

const loadUnread = async () => {
  try {
    const res = await uni.request({ url: '/api/notifications/unread-count' });
    if (res.data?.code === 0 || res.data?.code === undefined) {
      unreadCount.value = res.data?.data ?? 0;
    }
  } catch (e) {
    // 忽略
  }
};

onShow(() => { loadUnread(); });

onMounted(() => {
  // 实际加载时从后端拉取数据
});

// ====== 快捷入口 ======
const quickEntries = [
  { label: '项目管理', icon: '📁', bg: '#DBEAFE', action: 'projectList' },
  { label: '新建项目', icon: '📋', bg: '#D1FAE5', action: 'newProject' },
  { label: '施工日志', icon: '📝', bg: '#D1FAE5', action: 'newLog' },
  { label: '质量巡检', icon: '🔍', bg: '#FEE2E2', action: 'newInspect' },
  { label: '派工管理', icon: '👷', bg: '#FEF3C7', action: 'newDispatch' },
  { label: '主材管理', icon: '🧱', bg: '#EDE9FE', action: 'newMaterial' },
  { label: '验收管理', icon: '✅', bg: '#D1FAE5', action: 'newAccept' },
  { label: '变更单', icon: '📄', bg: '#FEF3C7', action: 'newChange' },
  { label: '收支记录', icon: '💰', bg: '#DBEAFE', action: 'newFinance' },
  { label: '通讯录', icon: '📒', bg: '#EDE9FE', action: 'addressbook' },
  { label: '甘特图', icon: '📊', bg: '#FEE2E2', action: 'gantt' },
  { label: '客户', icon: '👤', bg: '#DBEAFE', action: 'customer' },
];

const todos = ref([
  { id: 1, title: '「十六局项目」水电验收申请', project: '十六局西区2-3-201', time: '今天 14:00', priority: 'warning', type: 'node' },
  { id: 2, title: '「新农村3301」泥瓦工程待审核', project: '新农村3301', time: '今天 10:30', priority: 'danger', type: 'node' },
  { id: 3, title: '巡检问题待整改：防水层破损', project: '十六局西区2-3-201', time: '昨天', priority: 'danger', type: 'inspect' },
  { id: 4, title: '材料到货待验收：水泥 2吨', project: '撒打算', time: '昨天', priority: 'info', type: 'material' },
]);

const warnings = ref([
  { id: 10, name: '新农村3301', node: '木工工程', days: 5 },
  { id: 5, name: '撒打算', node: '项目完成', days: 3 },
]);

const recentProjects = ref([
  { id: 11, name: '十六局西区2-3-201', customer: '周福晋', statusText: '进行中', progress: 62 },
  { id: 10, name: '新农村3301', customer: '张先生', statusText: '进行中', progress: 45 },
  { id: 5, name: '撒打算', customer: '郭大大', statusText: '即将竣工', progress: 88 },
]);

// ====== 底部弹窗状态 ======
// 通用项目选择弹窗
const projectPicker = ref({
  visible: false,
  title: '选择项目',
  items: [],
});
let projectPickerCallback = null; // 回调函数

// 材料管理弹窗
const materialPicker = ref({
  visible: false,
  title: '选择项目',
  items: [],
});

// 甘特图项目弹窗
const ganttPicker = ref({
  visible: false,
  title: '选择项目',
  items: [],
});

// ====== 快捷操作处理 ======
const handleQuick = (item) => {
  switch (item.action) {
    case 'projectList': uni.switchTab({ url: '/pages/projects/list' }); break;
    case 'newProject': uni.navigateTo({ url: '/pages/projects/add' }); break;
    case 'newLog': openProjectPicker('选择项目后添加施工日志', (p) => {
      uni.navigateTo({ url: `/pages/projects/log-add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'newInspect': openProjectPicker('选择项目后添加巡检', (p) => {
      uni.navigateTo({ url: `/pages/inspection/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'newDispatch': openProjectPicker('选择项目后添加派工', (p) => {
      uni.navigateTo({ url: `/pages/dispatch/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'newMaterial': openMaterialPicker(); break;
    case 'newAccept': uni.navigateTo({ url: '/pages/acceptance/list' }); break;
    case 'newChange': uni.navigateTo({ url: '/pages/change/list' }); break;
    case 'newFinance': openProjectPicker('选择项目后添加收支记录', (p) => {
      uni.navigateTo({ url: `/pages/finance/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'addressbook': uni.navigateTo({ url: '/pages/addressbook/addressbook' }); break;
    case 'customer': uni.navigateTo({ url: '/pages/customers/customers' }); break;
    case 'gantt': openGanttPicker(); break;
  }
};

// ====== 通用项目选择弹窗 ======
const openProjectPicker = async (title, callback) => {
  projectPickerCallback = callback;
  try {
    uni.showLoading({ title: '加载中...' });
    const token = uni.getStorageSync('token');
    const res = await uni.request({ url: '/api/projects', header: { Authorization: token } });
    uni.hideLoading();
    const data = (res.data) || [];
    if (data.length === 0) {
      uni.showToast({ title: '暂无项目', icon: 'none' });
      return;
    }
    projectPicker.value = {
      visible: true,
      title: title || '选择项目',
      items: data.map((p) => ({
        name: p.name,
        desc: p.customer_name ? `客户: ${p.customer_name}` : (p.status || ''),
        value: p.id,
        _raw: p,
      })),
    };
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

const onProjectSelect = ({ item }) => {
  projectPicker.value.visible = false;
  if (projectPickerCallback && item._raw) {
    projectPickerCallback(item._raw);
    projectPickerCallback = null;
  }
};

const onProjectPickerCancel = () => {
  projectPicker.value.visible = false;
  projectPickerCallback = null;
};

// ====== 材料管理弹窗 ======
const materialActionItems = [
  { name: '采购申请', desc: '向供应商提交材料采购', icon: '🛒', value: 'purchase' },
  { name: '到货验收', desc: '验收已到货的材料', icon: '📦', value: 'inbound' },
];

const openMaterialPicker = async () => {
  try {
    uni.showLoading({ title: '加载中...' });
    const token = uni.getStorageSync('token');
    const res = await uni.request({ url: '/api/projects', header: { Authorization: token } });
    uni.hideLoading();
    const data = (res.data) || [];
    if (data.length === 0) {
      // 没有项目时，直接显示操作选项
      materialPicker.value = {
        visible: true,
        title: '选择操作',
        items: materialActionItems,
      };
      return;
    }
    // 有项目时，显示操作选项列表
    materialPicker.value = {
      visible: true,
      title: '主材管理',
      items: materialActionItems.concat(
        data.map((p) => ({
          name: p.name,
          desc: p.customer_name ? `客户: ${p.customer_name}` : (p.status || ''),
          icon: '📁',
          value: `proj_${p.id}`,
          _raw: p,
        }))
      ),
    };
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

const onMaterialSelect = ({ item }) => {
  materialPicker.value.visible = false;
  if (item.value === 'purchase') {
    uni.navigateTo({ url: '/pages/material/purchase' });
  } else if (item.value === 'inbound') {
    uni.navigateTo({ url: '/pages/material/inbound' });
  } else if (item.value && item.value.startsWith('proj_') && item._raw) {
    // 选了具体项目，再选操作
    const p = item._raw;
    uni.showModal({
      title: `${p.name}`,
      content: '请选择操作',
      confirmText: '采购申请',
      cancelText: '到货验收',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({ url: `/pages/material/purchase?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
        } else {
          uni.navigateTo({ url: `/pages/material/inbound?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
        }
      },
    });
  }
};

const onMaterialPickerCancel = () => {
  materialPicker.value.visible = false;
};

// ====== 甘特图项目选择 ======
const openGanttPicker = async () => {
  try {
    uni.showLoading({ title: '加载中...' });
    const token = uni.getStorageSync('token');
    const res = await uni.request({ url: '/api/projects', header: { Authorization: token } });
    uni.hideLoading();
    const data = (res.data) || [];
    const withDates = data.filter((p) => p.start_date && p.end_date);
    if (withDates.length === 0) {
      uni.showToast({ title: '暂无可用甘特图的项目', icon: 'none' });
      return;
    }
    ganttPicker.value = {
      visible: true,
      title: '选择项目查看甘特图',
      items: withDates.map((p) => ({
        name: p.name,
        desc: `${p.start_date} → ${p.end_date}`,
        icon: '📊',
        value: p.id,
        _raw: p,
      })),
    };
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

const onGanttSelect = ({ item }) => {
  ganttPicker.value.visible = false;
  if (item._raw) {
    uni.navigateTo({ url: `/pages/projects/gantt?id=${item._raw.id}` });
  }
};

const onGanttPickerCancel = () => {
  ganttPicker.value.visible = false;
};

const goProjects = (filter) => {
  uni.switchTab({ url: '/pages/projects/list' });
};

const goInspections = () => {
  uni.switchTab({ url: '/pages/inspection/list' });
};

const goFinance = () => {
  uni.navigateTo({ url: '/pages/finance/list' });
};

const goTodo = (todo) => {
  if (todo.type === 'node') {
    uni.navigateTo({ url: `/pages/projects/detail?id=${todo.id}` });
  } else if (todo.type === 'inspect') {
    uni.navigateTo({ url: '/pages/inspection/detail' });
  }
};

const goProject = (id) => {
  uni.navigateTo({ url: `/pages/projects/detail?id=${id}` });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 30px;
}

/* 顶部 */
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
  margin-bottom: 20px;
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

.role-admin { background: rgba(239,68,68,0.3); }
.role-designer { background: rgba(59,130,246,0.3); }
.role-worker { background: rgba(234,88,12,0.3); }
.role-supervisor { background: rgba(139,92,246,0.3); }

/* 统计卡片 */
.stats-row {
  display: flex;
  background: rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 14px 0;
}

.stat-card {
  flex: 1;
  text-align: center;
}

.stat-divider {
  width: 1px;
  background: rgba(255,255,255,0.15);
}

.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
}

.stat-num.danger { color: #FCA5A5; }
.stat-num.success { color: #6EE7B7; }
.stat-num.warning { color: #FCD34D; }

.stat-label {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
}

/* 快捷入口 */
.quick-entry-section {
  margin: 16px 16px 0;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
  position: relative;
  z-index: 10;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.quick-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.quick-label {
  font-size: 11px;
  color: #444;
  text-align: center;
  line-height: 1.3;
}

/* 待办 */
.todo-section {
  margin: 16px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.todo-count {
  background: #FF4D4F;
  color: #fff;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: normal;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #F5F5F5;
}

.todo-item:last-child { border-bottom: none; }

.todo-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.todo-priority {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.priority-warning { background: #FF9C3A; }
.priority-danger { background: #FF4D4F; }
.priority-info { background: #36BFC8; }

.todo-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.todo-title {
  font-size: 14px;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo-meta {
  font-size: 12px;
  color: #999;
}

.todo-arrow {
  font-size: 18px;
  color: #CCC;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
  color: #52C41A;
}

.empty-text {
  font-size: 13px;
  color: #999;
}

/* 预警 */
.warning-section {
  margin: 0 16px;
  background: #FFF7E6;
  border-radius: 14px;
  padding: 16px;
  border: 1px solid #FFE7B0;
}

.warning-title {
  color: #D46B08;
  margin-bottom: 12px;
}

.warning-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warning-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
}

.warning-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.warning-name {
  font-size: 14px;
  font-weight: 600;
  color: #1A1A1A;
}

.warning-desc {
  font-size: 12px;
  color: #D46B08;
}

.warning-days {
  background: #FF4D4F;
  color: #fff;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 8px;
  font-weight: 600;
}

/* 最近项目 */
.recent-section {
  margin: 16px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.more-link {
  font-size: 12px;
  color: #1E3A5F;
  margin-left: auto;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.recent-name {
  font-size: 14px;
  font-weight: 600;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-meta {
  font-size: 12px;
  color: #999;
}

.recent-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.progress-bar-sm {
  width: 60px;
  height: 4px;
  background: #EEE;
  border-radius: 2px;
}

.progress-fill-sm {
  height: 100%;
  background: #1E3A5F;
  border-radius: 2px;
}

.progress-num-sm {
  font-size: 11px;
  color: #999;
}

/* 顶部导航 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
}

.nav-title {
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  flex: 1;
}

.nav-placeholder {
  width: 40px;
}

.msg-icon {
  position: relative;
  font-size: 20px;
  width: 40px;
  display: flex;
  justify-content: flex-end;
}

.msg-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF4D4F;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
</style>
