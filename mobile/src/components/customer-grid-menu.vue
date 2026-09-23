<template>
  <!-- 装修管理九宫格 -->
  <view class="grid-menu">
    <view class="menu-grid">
      <view
        v-for="item in enabledMenuList"
        :key="item.id || item.key"
        class="menu-item"
        @click="handleClick(item)"
      >
        <view class="menu-icon">{{ item.icon || '📋' }}</view>
        <text class="menu-text">{{ item.name }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from "vue";

// 定义菜单项
const defaultMenuList = [
  { key: 'basic', name: '项目信息', icon: '🏠', pagePath: '/pages/customer/project-detail' },
  { key: 'budget', name: '预算报价', icon: '📋', pagePath: '/pages/customer/budget' },
  { key: 'changes', name: '项目变更', icon: '📝', pagePath: '/pages/customer/changes' },
  { key: 'warranty', name: '售后维保', icon: '🛡️', pagePath: '/pages/customer/warranty' },
  { key: 'drawings', name: '图纸资料', icon: '📄', pagePath: '/pages/customer/drawings' },
  { key: 'family', name: '家庭成员', icon: '👨‍👩‍👧', pagePath: '/pages/customer/family' },
  { key: 'bill', name: '账单', icon: '💰', pagePath: '/pages/customer/bill' },
  { key: 'notices', name: '相关通知', icon: '⚠️', pagePath: '/pages/customer/notices' },
  { key: 'review', name: '装修评价', icon: '⭐', pagePath: '/pages/customer/review' },
];

const props = defineProps({
  // 从后端返回的菜单列表，如果为空则使用默认列表
  menuList: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['menu-click']);

const enabledMenuList = computed(() => {
  // 如果有后端返回的菜单，使用后端的
  if (props.menuList && props.menuList.length > 0) {
    return props.menuList;
  }
  // 否则使用默认菜单
  return defaultMenuList;
});

const handleClick = (item) => {
  emit('menu-click', item);
  
  const projectId = getProjectId();
  
  // 根据不同功能跳转到不同页面
  switch (item.key) {
    case 'basic':
      // 项目信息 - 跳转到客户专属项目详情
      if (projectId) {
        uni.navigateTo({ url: `${item.pagePath}?id=${projectId}` });
      } else {
        uni.showToast({ title: '请先选择项目', icon: 'none' });
      }
      break;
    case 'budget':
      // 预算报价 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    case 'changes':
      // 项目变更 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    case 'warranty':
      // 售后维保 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    case 'drawings':
      // 图纸资料 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    case 'family':
      // 家庭成员 - 跳转家庭成员管理页面
      uni.navigateTo({ url: `${item.pagePath}` });
      break;
    case 'bill':
      // 账单 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    case 'notices':
      // 相关通知 - 跳转消息页面
      uni.switchTab({ url: '/pages/customer/messages' });
      break;
    case 'review':
      // 装修评价 - 提示功能开发中
      uni.showToast({ title: '功能开发中', icon: 'none' });
      break;
    default:
      uni.showToast({ title: '功能开发中', icon: 'none' });
  }
};

// 获取当前项目ID（从页面栈或存储中）
const getProjectId = () => {
  // 尝试从页面参数获取
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (current?.options?.id) {
    return current.options.id;
  }
  if (current?.options?.projectId) {
    return current.options.projectId;
  }
  // 尝试从 storage 获取
  const project = uni.getStorageSync('currentProject');
  if (project && project.id) {
    return project.id;
  }
  return '';
};
</script>

<style scoped>
.grid-menu {
  padding: 12px 16px;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 10px;
  background: #F9FAFB;
  transition: all 0.2s;
  cursor: pointer;
}

.menu-item:active {
  transform: scale(0.95);
  background: #F3F4F6;
}

.menu-icon {
  font-size: 28px;
  margin-bottom: 6px;
}

.menu-text {
  font-size: 12px;
  color: #374151;
  text-align: center;
  line-height: 1.2;
}
</style>
