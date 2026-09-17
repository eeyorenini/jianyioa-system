<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">通讯录</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">通讯录</view>

    <view class="search-bar">
      <input
        v-model="keyword"
        placeholder="搜索姓名或部门"
        class="search-input"
        @input="onSearch"
      />
    </view>

    <view class="list">
      <view
        class="list-item"
        v-for="item in filteredList"
        :key="item.id"
      >
        <view class="avatar">{{ (item.name || item.username || 'U')[0] }}</view>
        <view class="item-info">
          <view class="item-name">{{ item.name || item.username }}</view>
          <view class="item-detail">{{ item.position || '' }} {{ item.position && item.department_name ? ' | ' : '' }} {{ item.department_name || '' }}</view>
          <view class="item-phone" v-if="item.phone">📞 {{ item.phone }}</view>
        </view>
      </view>
      <view v-if="filteredList.length === 0" class="empty">
        <view class="empty-icon">👤</view>
        <view class="empty-text">暂无员工</view>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted } from "vue";

const list = ref([]);
const keyword = ref("");

const filteredList = computed(() => {
  if (!keyword.value) return list.value;
  const kw = keyword.value.toLowerCase();
  return list.value.filter((item) => {
    const name = (item.name || item.username || '').toLowerCase();
    const dept = (item.department_name || '').toLowerCase();
    return name.includes(kw) || dept.includes(kw);
  });
});

const onSearch = () => {
  // computed自动过滤
};

const fetchList = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/employees",
      header: { Authorization: token },
    });
    uni.hideLoading();
    const data = res.data;
    if (Array.isArray(data)) {
      list.value = data;
    }
  } catch (e) {
    uni.hideLoading();
    console.log("加载失败", e);
  }
};

onMounted(() => {
  fetchList();
});


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 15px;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 15px;
}

.search-bar {
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 15px;
}

.search-input {
  width: 100%;
  height: 36px;
  font-size: 14px;
}

.list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 14px 15px;
  border-bottom: 1px solid #f0f0f0;
}

.list-item:last-child {
  border-bottom: none;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 12px;
}

.item-info {
  flex: 1;
  overflow: hidden;
}

.item-name {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  margin-bottom: 3px;
}

.item-detail {
  font-size: 13px;
  color: #999;
  margin-bottom: 2px;
}

.item-phone {
  font-size: 13px;
  color: #666;
}

.empty {
  padding: 50px 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: #999;
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
