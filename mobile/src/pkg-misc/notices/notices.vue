<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">通知公告</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-body">
    <view class="list">
      <view
        class="list-item"
        v-for="item in visible"
        :key="item.id"
        @click="showNotice(item)"
      >
        <view class="item-header">
          <view class="item-title">{{ item.title }}</view>
          <view class="tag" :class="getTypeClass(item.type)">{{ item.type || '通知' }}</view>
        </view>
        <view class="item-body">{{ item.content }}</view>
        <view class="item-footer">
          <text class="item-publisher">{{ item.publisher_name || '管理员' }}</text>
          <text class="item-time">{{ formatTime(item.publish_time || item.created_at) }}</text>
        </view>
      </view>
      <view v-if="list.length === 0" class="empty">
        <view class="empty-icon">📢</view>
        <view class="empty-text">暂无公告</view>
      </view>
      <!-- 上拉加载到底提示 -->
      <list-footer :has-more="hasMore" :count="visible.length" />
    </view>
    </view>
  </view>
</template>

<script setup >
import { ref, onMounted } from "vue";
import { onPullDownRefresh, onReachBottom } from "@dcloudio/uni-app";
import { useListPager, runPullRefresh } from "@/utils/listPager";
import ListFooter from "@/components/list-footer.vue";

const list = ref([]);

// 上拉加载：/api/notices 返回全量，前端切片渲染（详见 utils/listPager.ts）
const { visible, hasMore, reset, loadMore } = useListPager(() => list.value);

const getTypeClass = (type) => {
  if (type === '重要') return 'tag-important';
  if (type === '紧急') return 'tag-urgent';
  if (type === '活动') return 'tag-activity';
  return 'tag-normal';
};

const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 16).replace('T', ' ');
};

const showNotice = (item) => {
  uni.showModal({
    title: item.title,
    content: item.content || '暂无内容',
    showCancel: false,
  });
};

const fetchList = async (opts = {}) => {
  try {
    // 下拉刷新时不弹 loading 遮罩，原生刷新动画已经够了
    if (!opts.silent) uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/notices",
      header: { Authorization: token },
    });
    if (!opts.silent) uni.hideLoading();
    const data = res.data;
    if (Array.isArray(data)) {
      list.value = data;
      reset();
    }
  } catch (e) {
    if (!opts.silent) uni.hideLoading();
    console.log("加载失败", e);
  }
};

onMounted(() => {
  fetchList();
});

// 下拉刷新 / 上拉加载
onPullDownRefresh(() => runPullRefresh(() => fetchList({ silent: true }), reset));
onReachBottom(() => loadMore());


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  padding: 0;
  min-height: 100vh;
  background: #f5f5f5;
}
.page-body { padding: 15px; }


.list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.list-item {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.list-item:last-child {
  border-bottom: none;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.item-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  flex: 1;
  padding-right: 8px;
}

.tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.tag-normal {
  background: #e8f4ff;
  color: #3c9cff;
}

.tag-important {
  background: #fff7e6;
  color: #ff9f43;
}

.tag-urgent {
  background: #ffebee;
  color: #ff5252;
}

.tag-activity {
  background: #e8f8f0;
  color: #52c41a;
}

.item-body {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-publisher {
  font-size: 12px;
  color: #999;
}

.item-time {
  font-size: 12px;
  color: #999;
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
