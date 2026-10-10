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

    <!-- 借权模式横幅 -->
    <view v-if="imp.impersonating" class="imp-banner" @click="exitImpersonate">
      <text class="imp-icon">🔑</text>
      <view class="imp-text">
        <text class="imp-title">借权模式中</text>
        <text class="imp-sub">当前身份：{{ imp.targetName }}（{{ imp.targetRole || '无角色' }}）· 点此结束</text>
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

      <!-- 核心数据统计（按角色差异化：财务视角侧重金额，其他视角侧重项目） -->
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
          <text v-if="isFinance" class="stat-num">{{ fmtMoney(stats.pendingPayAmount) }}</text>
          <text v-else class="stat-num">{{ stats.pendingPay }}</text>
          <text class="stat-label">{{ isFinance ? '待报销金额' : '待回款' }}</text>
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

    <!-- 待办事项（按角色 + 项目相关，区分审批流 vs 项目事项） -->
    <view class="todo-section">
      <view class="section-title todo-title-row">
        <view class="todo-title-left">
          <text>待办事项</text>
          <text class="todo-count" v-if="todoTotal">{{ todoTotal }}</text>
        </view>
        <text class="todo-more" @click="goTodoCenter">全部 ›</text>
      </view>
      <view v-if="!todosLoaded">
        <view class="empty-state"><text class="empty-text">加载中...</text></view>
      </view>
      <view v-else-if="displayTodos.length === 0">
        <view class="empty-state">
          <text class="empty-icon">✓</text>
          <text class="empty-text">暂无待办事项</text>
        </view>
      </view>
      <view v-else>
        <view v-for="section in displayTodos" :key="section.key">
          <view class="todo-sub-title" v-if="displayTodos.length > 1 || section.key !== 'main'">
            <text>{{ section.icon }} {{ section.label }}</text>
            <text class="todo-sub-count" v-if="section.count > section.items.length">{{ section.count }}</text>
          </view>
          <view class="todo-list">
            <view class="todo-item" v-for="todo in section.items" :key="section.key + '-' + todo.id" @click="goTodoUrl(todo)">
              <view class="todo-left">
                <view class="todo-priority" :class="`priority-${todo.priority || 'normal'}`"></view>
                <view class="todo-content">
                  <text class="todo-title">{{ todo.title }}</text>
                  <text class="todo-meta">{{ todo.subtitle || '' }}<text v-if="todo.time"> · {{ todo.time }}</text></text>
                </view>
              </view>
              <text class="todo-arrow">›</text>
            </view>
          </view>
        </view>
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
const imp = userStore.imp;
const userName = computed(() => userStore.state.name || '用户');
const roleName = computed(() => userStore.state.position || userStore.state.role_name || '未知');

const exitImpersonate = () => {
  uni.showModal({
    title: '结束借权',
    content: '确定回到管理员身份？',
    success: (r) => {
      if (!r.confirm) return;
      uni.request({
        url: '/api/admin/impersonate/stop',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { target_employee_id: userStore.state.id },
        complete: () => {
          userStore.stopImpersonate();
          uni.showToast({ title: '已结束借权', icon: 'none' });
          setTimeout(() => { uni.reLaunch({ url: '/pages/home/index' }); }, 500);
        },
      });
    },
  });
};

const unreadCount = ref(0);

const timeStr = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const stats = ref({
  inProgress: 0,
  overdue: 0,
  pendingInspect: 0,
  pendingPay: '¥0',
  pendingPayAmount: 0,
});

const isFinance = computed(() => {
  const p = userStore.state.permissions || userStore.state.role_permissions || [];
  if (Array.isArray(p) && p.includes('purchase:finance')) return true;
  const code = userStore.state.role_code || '';
  const name = userStore.state.role_name || '';
  return code === 'finance' || name.includes('财务');
});

const fmtMoney = (v) => {
  const n = Number(v) || 0;
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + n;
};

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

onShow(() => { loadUnread(); loadRecentProjects(); loadHomeStats(); userStore.fetchMe(); });

onMounted(() => {
  // 实际加载时从后端拉取数据
});

// ====== 首页统计 / 待办 / 逾期预警：统一从 /api/todo/center 拉（按角色 + 项目相关） ======
const loadHomeStats = async () => {
  try {
    const res = await uni.request({
      url: '/api/todo/center?limit=10',
      header: {
        'x-user-id': String(userStore.state.id),
      }
    });
    const d = (res.data && res.data.code === 0) ? res.data : null;
    if (!d) return;
    // 1) stats
    if (d.home && d.home.stats) stats.value = { ...stats.value, ...d.home.stats };
    // 2) warnings（逾期预警）
    if (d.home && Array.isArray(d.home.warnings)) warnings.value = d.home.warnings;
    // 3) 待办列表：合并审批流 groups + 项目相关 home.sections
    const merged = [];
    // 审批流按权限：财务优先报销/回执；经理/设计师：采购审批；所有人：通用审批
    for (const g of d.groups || []) {
      if (g.items && g.items.length) merged.push({ key: g.key, label: g.label, icon: g.icon, count: g.count, items: g.items });
    }
    // 项目相关（节点到期/待整改/我的派工）
    for (const s of d.home?.sections || []) {
      merged.push({ key: 'home_' + s.key, label: s.label, icon: s.icon, count: s.items.length, items: s.items });
    }
    todos.value = merged;
    todosLoaded.value = true;
    // 角标 = 审批流待办 + 项目事项 + 预警的总和
    const projItems = (d.home?.sections || []).reduce((s, x) => s + (x.items?.length || 0), 0)
    const warnCount = (d.home?.warnings || []).length
    todoTotal.value = (d.total || 0) + projItems + warnCount
  } catch (e) {
    console.error('加载首页统计失败', e);
    todosLoaded.value = true;
  }
};

// ====== 快捷入口 ======
const quickEntries = [
  { label: '项目管理', icon: '📁', bg: '#DBEAFE', action: 'projectList' },
  { label: '新建项目', icon: '📋', bg: '#D1FAE5', action: 'newProject' },
  { label: '施工日志', icon: '📝', bg: '#D1FAE5', action: 'newLog' },
  { label: '质量巡检', icon: '🔍', bg: '#FEE2E2', action: 'newInspect' },
  { label: '派工管理', icon: '👷', bg: '#FEF3C7', action: 'newDispatch' },
  { label: '主材管理', icon: '🧱', bg: '#EDE9FE', action: 'newMaterial' },
  { label: '验收管理', icon: '✅', bg: '#D1FAE5', action: 'newAccept' },
  { label: '增减项', icon: '📄', bg: '#FEF3C7', action: 'newChange' },
  { label: '收支记录', icon: '💰', bg: '#DBEAFE', action: 'newFinance' },
  { label: '催收记录', icon: '💰', bg: '#DBEAFE', action: 'newCollection' },
  { label: '通讯录', icon: '📒', bg: '#EDE9FE', action: 'addressbook' },
  { label: '甘特图', icon: '📊', bg: '#FEE2E2', action: 'gantt' },
  { label: '客户', icon: '👤', bg: '#DBEAFE', action: 'customer' },
];

const todos = ref([]);
const todosLoaded = ref(false);

// 折叠展示：所有 section 合并到最多 8 条（首页只是入口，不堆太多）
const displayTodos = computed(() => {
  const out = [];
  let total = 0;
  const MAX = 8;
  for (const sec of todos.value) {
    const items = sec.items.slice(0, Math.max(0, MAX - total));
    if (items.length > 0) {
      out.push({ ...sec, items });
      total += items.length;
    }
    if (total >= MAX) break;
  }
  return out;
});

const todoTotal = ref(0);

const warnings = ref([]);

const recentProjects = ref([]);

// 计算基于节点的进度百分比
const calcProgress = (project) => {
  if (!project.nodes || project.nodes.length === 0) return 0;
  const completed = project.nodes.filter(n => n.status === 'completed' || n.status === '已完成').length;
  return Math.round((completed / project.nodes.length) * 100);
};

// 从API加载真实项目数据
const loadRecentProjects = async () => {
  try {
    const res = await uni.request({
      url: '/api/projects',
      header: {
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),
      }
    });
    if (Array.isArray(res.data) && res.data.length) {
      // 取最新的3个项目
      recentProjects.value = res.data.slice(0, 3).map(p => ({
        id: p.id,
        name: p.name,
        customer: p.customer_name || p.customer || '',
        statusText: p.status || '进行中',
        progress: calcProgress(p),
      }));
    }
  } catch (e) {
    console.error('加载最近项目失败', e);
  }
};

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
    case 'newChange': openProjectPicker('选择项目后添加增减项', (p) => {
      uni.navigateTo({ url: `/pages/contracts/contract-change-add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'newFinance': openProjectPicker('选择项目后添加收支记录', (p) => {
      uni.navigateTo({ url: `/pages/finance/add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
    }); break;
    case 'newCollection': openProjectPicker('选择项目后添加催收记录', (p) => {
      uni.navigateTo({ url: `/pages/contracts/collection-add?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}` });
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
  { name: '采购申请列表', desc: '查看所有采购申请', icon: '📋', value: 'purchase_list' },
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
    // 直接显示操作选项列表（不再按项目分组）
    materialPicker.value = {
      visible: true,
      title: '主材管理',
      items: materialActionItems,
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
  } else if (item.value === 'purchase_list') {
    uni.navigateTo({ url: '/pages/purchase/list' });
  } else if (item.value === 'inbound') {
    uni.navigateTo({ url: '/pages/material/inbound' });
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

// 通用：根据 todo.url 跳转（兼容字符串与对象）
const goTodoUrl = (todo) => {
  const u = todo && todo.url
  if (u) {
    if (u.startsWith('/pages/')) {
      // /pages/.../detail?id=xx&y=zz
      const [path, qs] = u.split('?')
      const params = {}
      if (qs) for (const kv of qs.split('&')) { const [k, v] = kv.split('='); if (k) params[k] = v }
      if (path === '/pages/purchase/list' || path === '/pages/projects/list' || path === '/pages/inspection/list') {
        uni.switchTab({ url: path })
      } else {
        uni.navigateTo({ url: path, params, success: () => {}, fail: () => { uni.showToast({ title: '页面不存在', icon: 'none' }) } })
      }
    } else {
      uni.navigateTo({ url: u })
    }
    return
  }
  goTodo(todo)
};

// 待办中心：汇总各模块待我处理的事项（按权限聚合）
const goTodoCenter = () => {
  uni.navigateTo({ url: '/pages/todo/index' });
};

const loadTodoCount = async () => {
  try {
    const res = await uni.request({
      url: '/api/todo/count',
      header: {
        'x-user-id': String(userStore.state.id),
      }
    });
    if (res.data && res.data.code === 0) {
      todoTotal.value = res.data.total || 0;
    }
  } catch (e) {
    // 忽略
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

.todo-title-row {
  justify-content: space-between;
}

.todo-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-more {
  font-size: 13px;
  font-weight: 400;
  color: #2D5A8E;
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

.todo-sub-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #1A1F36;
  font-weight: 600;
  margin: 8px 0 4px;
}
.todo-sub-title:first-child { margin-top: 0; }
.todo-sub-count {
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  border-radius: 10px;
  padding: 0 5px;
  min-width: 16px;
  text-align: center;
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

/* 借权模式横幅 */
.imp-banner {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #F59E0B, #EF4444);
  color: #fff;
  padding: 10px 16px;
}
.imp-banner .imp-icon { font-size: 18px; margin-right: 8px; }
.imp-banner .imp-text { flex: 1; display: flex; flex-direction: column; }
.imp-banner .imp-title { font-size: 13px; font-weight: 700; }
.imp-banner .imp-sub { font-size: 11px; opacity: 0.92; margin-top: 1px; }

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
