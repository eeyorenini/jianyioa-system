<template>
  <view class="page">
    <!-- 顶部导航（首页不需要返回按钮） -->
    <view class="nav-bar">
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
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";

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

const quickEntries = [
  { label: '项目管理', icon: '📁', bg: '#DBEAFE', action: 'projectList' },
  { label: '新建项目', icon: '📋', bg: '#D1FAE5', action: 'newProject' },
  { label: '施工日志', icon: '📝', bg: '#D1FAE5', action: 'newLog' },
  { label: '质量巡检', icon: '🔍', bg: '#FEE2E2', action: 'newInspect' },
  { label: '派工管理', icon: '👷', bg: '#FEF3C7', action: 'newDispatch' },
  { label: '材料申请', icon: '🧱', bg: '#EDE9FE', action: 'newMaterial' },
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

const handleQuick = (item) => {
  switch (item.action) {
    case 'projectList': uni.switchTab({ url: '/pages/projects/list' }); break;
    case 'newProject': uni.navigateTo({ url: '/pages/projects/add' }); break;
    case 'newLog': pickProjectThen('/pages/projects/log-add'); break;
    case 'newInspect': pickProjectThen('/pages/inspection/add'); break;
    case 'newDispatch': pickProjectThen('/pages/dispatch/add'); break;
    case 'newMaterial': pickProjectThenMaterial(); break;
    case 'newAccept': pickProjectThen('/pages/acceptance/list'); break;
    case 'newChange': pickProjectThen('/pages/change/list'); break;
    case 'newFinance': pickProjectThen('/pages/finance/add'); break;
    case 'addressbook': uni.navigateTo({ url: '/pages/addressbook/addressbook' }); break;
    case 'customer': uni.navigateTo({ url: '/pages/customers/customers' }); break;
    case 'gantt': showGanttPicker(); break;
  }
};

// 选项目后跳转（通用）
const pickProjectThen = async (targetUrl) => {
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
    const items = data.map((p) => p.name);
    uni.showActionSheet({
      title: '选择项目',
      itemList: items,
      success: (res) => {
        const selected = data[res.tapIndex];
        uni.navigateTo({ url: `${targetUrl}?projectId=${selected.id}&projectName=${encodeURIComponent(selected.name)}` });
      },
    });
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

// 材料管理选项目后弹操作菜单
const pickProjectThenMaterial = async () => {
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
    const items = data.map((p) => p.name);
    uni.showActionSheet({
      title: '选择项目',
      itemList: [...items, '采购申请', '到货验收'],
      success: (res) => {
        if (res.tapIndex < data.length) {
          const selected = data[res.tapIndex];
          // 选项目后再选操作类型
          uni.showActionSheet({
            title: `「${selected.name}」的操作`,
            itemList: ['采购申请', '到货验收'],
            success: (r) => {
              if (r.tapIndex === 0) {
                uni.navigateTo({ url: `/pages/material/purchase?projectId=${selected.id}&projectName=${encodeURIComponent(selected.name)}` });
              } else {
                uni.navigateTo({ url: `/pages/material/inbound?projectId=${selected.id}&projectName=${encodeURIComponent(selected.name)}` });
              }
            },
          });
        } else {
          // 不选项目，直接选操作
          uni.showActionSheet({
            title: '选择操作',
            itemList: ['采购申请', '到货验收'],
            success: (r) => {
              if (r.tapIndex === 0) {
                uni.navigateTo({ url: '/pages/material/purchase' });
              } else {
                uni.navigateTo({ url: '/pages/material/inbound' });
              }
            },
          });
        }
      },
    });
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

const showGanttPicker = async () => {
  try {
    uni.showLoading({ title: '加载中...' });
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/projects',
      header: { Authorization: token },
    });
    uni.hideLoading();
    const data = (res.data) || [];
    // 过滤出有日期的项目
    const withDates = data.filter((p) => p.start_date && p.end_date);
    if (withDates.length === 0) {
      uni.showToast({ title: '暂无可用甘特图的项目', icon: 'none' });
      return;
    }
    const items = withDates.map((p) => p.name);
    uni.showActionSheet({
      title: '选择项目',
      itemList: items,
      success: (res) => {
        const selected = withDates[res.tapIndex];
        uni.navigateTo({ url: `/pages/projects/gantt?id=${selected.id}` });
      },
    });
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
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

onMounted(() => {
  // 实际加载时从后端拉取数据
});
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
  color: #6B7280;
}

/* 待办 */
.todo-section {
  margin: 16px 16px 0;
}

.todo-count {
  background: var(--color-accent, #FF6B35);
  color: #fff;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: 600;
}

.todo-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #F5F7FA;
  cursor: pointer;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:active {
  background: #F9FAFB;
}

.todo-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.todo-priority {
  width: 4px;
  height: 32px;
  border-radius: 2px;
}

.priority-danger { background: #EF4444; }
.priority-warning { background: #F59E0B; }
.priority-info { background: #3B82F6; }

.todo-content {
  flex: 1;
}

.todo-title {
  display: block;
  font-size: 14px;
  color: #1A1F36;
  font-weight: 500;
  margin-bottom: 2px;
}

.todo-meta {
  font-size: 12px;
  color: #9CA3AF;
}

.todo-arrow {
  font-size: 20px;
  color: #D1D5DB;
}

/* 预警 */
.warning-section {
  margin: 16px 16px 0;
}

.warning-title {
  color: #DC2626;
}

.warning-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.warning-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #FEF2F2;
  cursor: pointer;
}

.warning-item:last-child { border-bottom: none; }

.warning-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1A1F36;
  margin-bottom: 2px;
}

.warning-desc {
  font-size: 12px;
  color: #EF4444;
}

.warning-days {
  background: #FEE2E2;
  color: #991B1B;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
}

/* 最近项目 */
.recent-section {
  margin: 16px 16px 0;
}

.more-link {
  font-size: 12px;
  color: #9CA3AF;
  margin-left: auto;
}

.recent-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #F5F7FA;
  cursor: pointer;
}

.recent-item:last-child { border-bottom: none; }
.recent-item:active { background: #F9FAFB; }

.recent-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1A1F36;
  margin-bottom: 2px;
}

.recent-meta {
  font-size: 12px;
  color: #9CA3AF;
}

.recent-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar-sm {
  width: 60px;
  height: 5px;
  background: #E5E7EB;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill-sm {
  height: 100%;
  background: linear-gradient(90deg, #1E3A5F, #3B82F6);
  border-radius: 3px;
}

.progress-num-sm {
  font-size: 12px;
  color: #1E3A5F;
  font-weight: 600;
  width: 32px;
  text-align: right;
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

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

/* 消息铃铛 */
.msg-icon {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.msg-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #FF4949;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  line-height: 1;
}
</style>
