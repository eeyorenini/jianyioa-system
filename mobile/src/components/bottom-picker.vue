<template>
  <!-- 遮罩层 -->
  <view class="picker-overlay" :class="{ show: visible }" @click="onOverlayClick">
    <!-- 弹出面板 -->
    <view class="picker-panel" :class="{ show: visible }" @click.stop>
      <!-- 顶部标题栏 -->
      <view class="picker-header">
        <view class="picker-cancel" @click="onCancel">取消</view>
        <view class="picker-title">{{ title }}</view>
        <view class="picker-confirm" v-if="showConfirm" @click="onConfirm">确定</view>
        <view class="picker-confirm-placeholder" v-else></view>
      </view>
      <!-- 列表 -->
      <scroll-view class="picker-body" scroll-y>
        <view
          class="picker-item"
          :class="{ active: isSelected(item), disabled: item.disabled }"
          v-for="(item, index) in items"
          :key="index"
          @click="onItemClick(item, index)"
        >
          <!-- 左侧图标/色块 -->
          <view class="item-left">
            <view v-if="item.color" class="item-color" :style="{ background: item.color }"></view>
            <text v-else-if="item.icon" class="item-icon">{{ item.icon }}</text>
          </view>
          <!-- 中间内容 -->
          <view class="item-content">
            <view class="item-name">{{ item.name }}</view>
            <view class="item-desc" v-if="item.desc">{{ item.desc }}</view>
          </view>
          <!-- 右侧选中标记 -->
          <view class="item-check" v-if="isSelected(item)">✓</view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  // 是否显示
  visible: {
    type: Boolean,
    default: false
  },
  // 标题
  title: {
    type: String,
    default: '请选择'
  },
  // 选项列表 [{ name, desc, icon, color, value, disabled }]
  items: {
    type: Array,
    default: () => []
  },
  // 默认选中的值（单个）或值数组（多选）
  modelValue: {
    type: [String, Number, Array],
    default: null
  },
  // 是否显示确定按钮
  showConfirm: {
    type: Boolean,
    default: false
  },
  // 点击选项后是否自动关闭（默认 true）
  autoClose: {
    type: Boolean,
    default: true
  },
  // 是否多选
  multiple: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'update:modelValue', 'confirm', 'cancel', 'select'])

// 选中状态判断
const isSelected = (item) => {
  if (props.multiple) {
    const arr = Array.isArray(props.modelValue) ? props.modelValue : []
    return arr.includes(item.value !== undefined ? item.value : item.name)
  }
  return item.value !== undefined ? item.value === props.modelValue : item.name === props.modelValue
}

// 点击选项
const onItemClick = (item, index) => {
  if (item.disabled) return

  if (props.multiple) {
    // 多选模式：切换选中状态
    const arr = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const val = item.value !== undefined ? item.value : item.name
    const idx = arr.indexOf(val)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(val)
    emit('update:modelValue', arr)
    emit('select', { item, index, value: arr })
  } else {
    // 单选模式
    const val = item.value !== undefined ? item.value : item.name
    emit('update:modelValue', val)
    emit('select', { item, index, value: val })
    if (props.autoClose) {
      close()
    }
  }
}

// 点击确定
const onConfirm = () => {
  emit('confirm', props.modelValue)
  close()
}

// 点击取消
const onCancel = () => {
  emit('cancel')
  close()
}

// 点击遮罩关闭
const onOverlayClick = () => {
  emit('cancel')
  close()
}

// 关闭
const close = () => {
  emit('update:visible', false)
}

// 监听 visible 从外部变为 true 时重置
watch(() => props.visible, (val) => {
  if (!val) {
    // 关闭时不做处理
  }
})
</script>

<style scoped>
/* 遮罩 */
.picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0);
  z-index: 999;
  pointer-events: none;
  transition: background 0.25s ease;
}

.picker-overlay.show {
  background: rgba(0, 0, 0, 0.5);
  pointer-events: auto;
}

/* 面板 */
.picker-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  max-height: 70vh;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.36, 0.66, 0.56, 0.92);
  z-index: 1000;
  overflow: hidden;
}

.picker-panel.show {
  transform: translateY(0);
}

/* 顶部栏 */
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 52px;
  border-bottom: 1px solid #F0F0F0;
  background: #fff;
}

.picker-cancel {
  font-size: 15px;
  color: #888;
  padding: 6px 12px;
}

.picker-title {
  font-size: 16px;
  font-weight: 600;
  color: #1A1A1A;
  flex: 1;
  text-align: center;
}

.picker-confirm {
  font-size: 15px;
  color: #07C160;
  font-weight: 600;
  padding: 6px 12px;
}

.picker-confirm-placeholder {
  width: 60px;
}

/* 列表 */
.picker-body {
  max-height: calc(70vh - 52px);
  padding-bottom: env(safe-area-inset-bottom);
}

.picker-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #F5F5F5;
  transition: background 0.15s;
}

.picker-item:last-child {
  border-bottom: none;
}

.picker-item:active:not(.disabled) {
  background: #F8F8F8;
}

.picker-item.active {
  background: #F0FFF4;
}

.picker-item.disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* 左侧 */
.item-left {
  margin-right: 12px;
  flex-shrink: 0;
}

.item-color {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.item-icon {
  font-size: 22px;
  display: block;
}

/* 中间 */
.item-content {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 15px;
  color: #1A1A1A;
  font-weight: 500;
  line-height: 1.4;
}

.item-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
  line-height: 1.4;
}

/* 右侧选中 */
.item-check {
  font-size: 18px;
  color: #07C160;
  font-weight: bold;
  flex-shrink: 0;
  margin-left: 8px;
}
</style>
