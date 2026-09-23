<template>
  <!-- 通用空状态组件 -->
  <view class="empty-container" v-if="type === 'empty'">
    <view class="empty-icon-wrap">
      <text class="empty-icon">{{ icon || '📭' }}</text>
    </view>
    <text class="empty-title">{{ title || '暂无数据' }}</text>
    <text class="empty-desc" v-if="description">{{ description }}</text>
    <view class="empty-action" v-if="$slots.action">
      <slot name="action"></slot>
    </view>
    <view class="empty-btn" v-else-if="showButton" @click="handleAction">
      {{ buttonText || '重新加载' }}
    </view>
  </view>

  <!-- 网络错误状态 -->
  <view class="empty-container error" v-else-if="type === 'error'">
    <view class="empty-icon-wrap">
      <text class="empty-icon">⚠️</text>
    </view>
    <text class="empty-title">{{ title || '网络异常' }}</text>
    <text class="empty-desc">{{ description || '请检查网络后重试' }}</text>
    <view class="empty-btn primary" @click="handleAction">
      {{ buttonText || '重新加载' }}
    </view>
  </view>

  <!-- 无权限状态 -->
  <view class="empty-container forbidden" v-else-if="type === 'forbidden'">
    <view class="empty-icon-wrap">
      <text class="empty-icon">🔒</text>
    </view>
    <text class="empty-title">{{ title || '无权限访问' }}</text>
    <text class="empty-desc">{{ description || '您暂无该项目查看权限' }}</text>
    <view class="empty-btn" @click="handleBack">
      返回
    </view>
  </view>

  <!-- 无项目状态 -->
  <view class="empty-container no-project" v-else-if="type === 'no-project'">
    <view class="empty-icon-wrap">
      <text class="empty-icon">🏠</text>
    </view>
    <text class="empty-title">{{ title || '暂无关联项目' }}</text>
    <text class="empty-desc">{{ description || '请联系工作人员为您绑定项目' }}</text>
    <view class="empty-btn" v-if="showContact" @click="handleContact">
      联系客服
    </view>
  </view>

  <!-- 骨架屏 -->
  <view class="skeleton-container" v-else-if="type === 'skeleton'">
    <slot></slot>
  </view>
</template>

<script setup>
const props = defineProps({
  // 状态类型: empty | error | forbidden | no-project | skeleton
  type: {
    type: String,
    default: 'empty'
  },
  // 图标
  icon: {
    type: String,
    default: ''
  },
  // 标题
  title: {
    type: String,
    default: ''
  },
  // 描述
  description: {
    type: String,
    default: ''
  },
  // 按钮文字
  buttonText: {
    type: String,
    default: ''
  },
  // 是否显示按钮
  showButton: {
    type: Boolean,
    default: true
  },
  // 是否显示联系客服按钮
  showContact: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['retry', 'back', 'contact']);

const handleAction = () => {
  emit('retry');
};

const handleBack = () => {
  emit('back');
  uni.navigateBack();
};

const handleContact = () => {
  emit('contact');
  // 可以拨打客服电话或跳转客服页面
  uni.makePhoneCall({
    phoneNumber: '400-888-8888'
  });
};
</script>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  background: #fff;
  border-radius: 14px;
  margin: 16px;
}

.empty-icon-wrap {
  margin-bottom: 16px;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.8;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 8px;
  text-align: center;
}

.empty-desc {
  font-size: 14px;
  color: #6B7280;
  text-align: center;
  line-height: 1.5;
  margin-bottom: 20px;
}

.empty-action {
  margin-top: 8px;
}

.empty-btn {
  padding: 10px 32px;
  border: 1px solid #D1D5DB;
  border-radius: 24px;
  font-size: 14px;
  color: #374151;
  background: #fff;
}

.empty-btn.primary {
  background: #1E3A5F;
  border-color: #1E3A5F;
  color: #fff;
}

/* 错误状态 */
.empty-container.error .empty-icon {
  font-size: 48px;
}

.empty-container.error .empty-title {
  color: #EF4444;
}

/* 无权限 */
.empty-container.forbidden .empty-icon {
  font-size: 48px;
}

/* 无项目 */
.empty-container.no-project .empty-icon {
  font-size: 56px;
}

/* 骨架屏容器 */
.skeleton-container {
  padding: 0;
}
</style>
