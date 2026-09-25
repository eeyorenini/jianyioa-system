<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的装修</text>
      <view class="nav-more" @click="showMore">···</view>
    </view>

    <!-- 页面加载中骨架屏 -->
    <view v-if="pageLoading" class="page-skeleton">
      <!-- 顶部骨架 -->
      <view class="skeleton-header"></view>
      <!-- 九宫格骨架 -->
      <view class="skeleton-grid">
        <view v-for="i in 9" :key="i" class="skeleton-grid-item"></view>
      </view>
      <!-- 动态列表骨架 -->
      <view class="skeleton-list">
        <view v-for="i in 3" :key="i" class="skeleton-card">
          <view class="skeleton-card-header">
            <view class="skeleton-avatar"></view>
            <view class="skeleton-meta">
              <view class="skeleton-line"></view>
              <view class="skeleton-line short"></view>
            </view>
          </view>
          <view class="skeleton-card-content"></view>
        </view>
      </view>
    </view>

    <!-- 无项目状态 -->
    <customer-empty-state
      v-else-if="!hasProject"
      type="no-project"
      title="暂无关联项目"
      description="请联系工作人员为您绑定项目"
      :show-contact="true"
      @contact="handleContact"
    />

    <!-- 无权限状态 -->
    <customer-empty-state
      v-else-if="hasError && errorType === 'forbidden'"
      type="forbidden"
      title="无权限访问"
      description="您暂无该项目查看权限，请联系项目经理"
      button-text="返回"
      :show-button="false"
      @back="goBack"
    />

    <!-- 网络错误 -->
    <customer-empty-state
      v-else-if="hasError && errorType === 'network'"
      type="error"
      title="网络异常"
      description="请检查网络后重试"
      button-text="重新加载"
      @retry="loadData"
    />

    <!-- 正常内容 -->
    <view v-else class="page-content">
      <!-- 模块 A: 装修管理九宫格 -->
      <customer-grid-menu @menu-click="handleMenuClick" />

      <!-- 模块 B: 装修动态信息流 -->
      <customer-dynamic-feed
        :list="dynamicList"
        :loading="dynamicLoading"
        :loading-more="dynamicLoadingMore"
        :no-more="dynamicNoMore"
        :error="dynamicError"
        @retry="loadDynamicList"
        @load-more="loadMoreDynamic"
      />
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";
import customerGridMenu from "@/components/customer-grid-menu.vue";
import customerDynamicFeed from "@/components/customer-dynamic-feed.vue";
import customerEmptyState from "@/components/customer-empty-state.vue";

const pageLoading = ref(true);
const hasProject = ref(false);
const hasError = ref(false);
const errorType = ref('');

// 项目信息
const project = ref(null);
const projectId = ref(0);

// 动态列表
const dynamicList = ref([]);
const dynamicLoading = ref(false);
const dynamicLoadingMore = ref(false);
const dynamicNoMore = ref(false);
const dynamicError = ref(false);
const dynamicPage = ref(1);
const dynamicPageSize = 10;

// 计算项目进度：已完成节点 / 总节点数
const calcProgress = (p) => {
  if (!p?.nodes || p.nodes.length === 0) return 0;
  const done = p.nodes.filter(n => n.status === 'completed' || n.status === '已完成').length;
  return Math.round((done / p.nodes.length) * 100);
};

// 计算属性
const projectInfo = computed(() => {
  return {
    name: project.value?.name || '我的项目',
    address: project.value?.customer_address || project.value?.address || '',
    progress: calcProgress(project.value),
    status: project.value?.status || '进行中'
  };
});

// 加载数据
const loadData = async () => {
  pageLoading.value = true;
  hasError.value = false;
  
  try {
    const userInfo = uni.getStorageSync('userInfo');
    // 家庭成员用主账户ID查项目，主账户用自己的ID
    const customerId = uni.getStorageSync('masterCustomerId') || userInfo?.id;
    
    if (!customerId) {
      hasProject.value = false;
      pageLoading.value = false;
      return;
    }

    // 获取项目列表 - 添加管理员权限头以获取完整数据（包括nodes）
    const res = await uni.request({
      url: `/api/projects?customer_id=${customerId}`,
      header: {
        'x-user-role': 'admin',
        'x-user-id': '1'
      }
    });
    
    const data = res.data;
    if (Array.isArray(data) && data.length > 0) {
      hasProject.value = true;
      project.value = data[0];
      projectId.value = data[0].id;
      
      // 保存当前项目供其他页面使用
      uni.setStorageSync('currentProject', data[0]);
      
      // 加载动态列表
      loadDynamicList();
    } else {
      hasProject.value = false;
    }
  } catch (e) {
    console.error('加载数据失败:', e);
    hasError.value = true;
    errorType.value = 'network';
  } finally {
    pageLoading.value = false;
  }
};

// 加载动态列表
const loadDynamicList = async () => {
  if (!projectId.value) return;
  
  dynamicLoading.value = true;
  dynamicError.value = false;
  dynamicPage.value = 1;
  dynamicNoMore.value = false;
  
  try {
    const allDynamics = [];
    
    // 1. 获取施工日志
    try {
      const logRes = await uni.request({
        url: `/api/project-logs/${projectId.value}?page=1&page_size=20`,
      });
      if (Array.isArray(logRes.data)) {
        logRes.data.forEach(item => {
          // 过滤掉没有实际内容的日志
          if (item.content || item.description || item.note) {
            allDynamics.push({
              ...item,
              type: 'log',
              typeText: '施工日志',
              typeIcon: '📝',
              typeColor: '#3B82F6',
              content: item.content || item.description || item.note
            });
          }
        });
      }
    } catch (e) {
      console.log('日志加载失败', e);
    }
    
    // 2. 获取巡检记录
    try {
      const inspectRes = await uni.request({
        url: `/api/inspections?project_id=${projectId.value}`,
      });
      if (Array.isArray(inspectRes.data)) {
        inspectRes.data.forEach(item => {
          allDynamics.push({
            ...item,
            type: 'inspection',
            typeText: '巡检记录',
            typeIcon: '🔍',
            typeColor: '#10B981',
            content: item.description || item.content || item.result || '巡检完成'
          });
        });
      }
    } catch (e) {
      console.log('巡检加载失败', e);
    }
    
    // 3. 获取验收记录
    try {
      const acceptRes = await uni.request({
        url: `/api/acceptance?project_id=${projectId.value}`,
      });
      if (Array.isArray(acceptRes.data)) {
        acceptRes.data.forEach(item => {
          allDynamics.push({
            ...item,
            type: 'acceptance',
            typeText: '验收记录',
            typeIcon: '✅',
            typeColor: '#F59E0B',
            content: item.description || item.content || item.result || '验收完成'
          });
        });
      }
    } catch (e) {
      console.log('验收加载失败', e);
    }
    
    // 4. 获取节点状态变更（从项目节点中提取已完成的节点作为动态）
    if (project.value?.nodes && project.value.nodes.length > 0) {
      project.value.nodes.filter(n => n.status === 'completed' && n.actual_date).forEach(node => {
        allDynamics.push({
          id: 'node-' + node.id,
          type: 'node',
          typeText: '节点完成',
          typeIcon: '🏁',
          typeColor: '#8B5CF6',
          content: `「${node.node_name}」已完成验收`,
          created_at: node.actual_date,
          images: null
        });
      });
    }
    
    // 按ID倒序排序（最新的在前，数据库ID越大越新）
    allDynamics.sort((a, b) => {
      return (b.id || 0) - (a.id || 0);
    });
    
    dynamicList.value = allDynamics.slice(0, dynamicPageSize).map(item => ({
      ...item,
      collapsed: true
    }));
    dynamicNoMore.value = allDynamics.length <= dynamicPageSize;
  } catch (e) {
    console.error('加载动态列表失败:', e);
    dynamicError.value = true;
  } finally {
    dynamicLoading.value = false;
  }
};

// 加载更多动态
const loadMoreDynamic = async () => {
  if (dynamicLoadingMore.value || dynamicNoMore.value || !projectId.value) return;
  
  dynamicLoadingMore.value = true;
  dynamicPage.value++;
  
  try {
    const res = await uni.request({
      url: `/api/project-logs/${projectId.value}?page=${dynamicPage.value}&page_size=${dynamicPageSize}`,
    });
    
    const data = res.data;
    if (Array.isArray(data) && data.length > 0) {
      const newList = data.map(item => ({
        ...item,
        collapsed: true
      }));
      dynamicList.value = [...dynamicList.value, ...newList];
      dynamicNoMore.value = data.length < dynamicPageSize;
    } else {
      dynamicNoMore.value = true;
    }
  } catch (e) {
    dynamicPage.value--;
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    dynamicLoadingMore.value = false;
  }
};

// 九宫格菜单点击
const handleMenuClick = (item) => {
  console.log('点击菜单:', item);
  // 已经在组件内部处理跳转
};

// 保存当前项目ID供其他页面使用
const saveCurrentProject = () => {
  if (project.value) {
    uni.setStorageSync('currentProject', project.value);
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 显示更多
const showMore = () => {
  uni.showActionSheet({
    itemList: ['刷新', '联系客服', '退出登录'],
    success: (res) => {
      switch (res.tapIndex) {
        case 0:
          loadData();
          break;
        case 1:
          uni.makePhoneCall({ phoneNumber: '400-888-8888' });
          break;
        case 2:
          handleLogout();
          break;
      }
    }
  });
};

// 联系客服
const handleContact = () => {
  uni.makePhoneCall({ phoneNumber: '400-888-8888' });
};

// 退出登录
const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    success: (res) => {
      if (res.confirm) {
        uni.clearStorageSync();
        uni.reLaunch({ url: '/pages/login/login' });
      }
    }
  });
};

// 页面加载
onMounted(() => {
  loadData();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 70px;
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

.nav-more {
  width: 40px;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 2px;
}

/* 页面内容 */
.page-content {
  padding-top: 12px;
}

/* 页面骨架屏 */
.page-skeleton {
  padding: 12px 16px;
}

.skeleton-header {
  height: 120px;
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  border-radius: 14px;
  margin-bottom: 12px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.skeleton-grid-item {
  height: 60px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

.skeleton-list {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.skeleton-card {
  margin-bottom: 16px;
}

.skeleton-card:last-child {
  margin-bottom: 0;
}

.skeleton-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-meta {
  flex: 1;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 6px;
}

.skeleton-line.short {
  width: 60%;
}

.skeleton-card-content {
  height: 60px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
