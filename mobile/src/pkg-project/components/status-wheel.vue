<template>
  <view v-if="visible" class="sw-overlay" @click="onCancel" @touchmove.stop.prevent="noop">
    <view class="sw-panel" @click.stop>
      <view class="sw-header">
        <text class="sw-cancel" @click="onCancel">取消</text>
        <text class="sw-title">{{ title }}</text>
        <text class="sw-confirm" @click="onConfirm">确定</text>
      </view>
      <picker-view class="sw-view" :value="picked" indicator-style="height: 44px;" @change="onChange">
        <picker-view-column>
          <view class="sw-item" v-for="(it, i) in items" :key="i">
            <text class="sw-item-text" :class="{ active: i === picked[0] }">{{ it.name }}</text>
          </view>
        </picker-view-column>
      </picker-view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '选择状态' },
  items: { type: Array, default: () => [] },
  current: { type: String, default: '' }
})

const emit = defineEmits(['cancel', 'confirm'])

const picked = ref([0])
const noop = () => {}

const syncIndex = () => {
  const idx = props.items.findIndex((it) => it.value === props.current)
  picked.value = [idx >= 0 ? idx : 0]
}

watch(() => props.visible, (v) => { if (v) syncIndex() })
watch(() => props.current, () => { if (props.visible) syncIndex() })

const onChange = (e) => {
  const val = e && e.detail ? e.detail.value : 0
  picked.value = Array.isArray(val) ? val : [val]
}

const onCancel = () => emit('cancel')

const onConfirm = () => {
  const it = props.items[picked.value[0]]
  if (it) emit('confirm', it)
  else emit('cancel')
}
</script>

<style scoped>
.sw-overlay {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}

.sw-panel {
  width: 100%;
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  padding-bottom: calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  animation: sw-up 0.2s ease-out;
}

@keyframes sw-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f0f0f0;
}

.sw-cancel { font-size: 14px; color: #909399; }
.sw-confirm { font-size: 14px; color: #2b7de9; font-weight: 500; }
.sw-title {
  font-size: 15px;
  color: #303133;
  font-weight: 500;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sw-view {
  width: 100%;
  height: 220px;
}

.sw-item {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 44px;
}

.sw-item-text {
  font-size: 16px;
  color: #909399;
}

.sw-item-text.active {
  color: #303133;
  font-weight: 500;
}
</style>
