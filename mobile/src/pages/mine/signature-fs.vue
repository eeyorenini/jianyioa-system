<template>
  <view class="fs-page">
    <view class="fs-head">
      <text class="fs-tip">横屏书写更舒展，签好后点「完成」</text>
      <view class="fs-btn ghost" @click="cancel">取消</view>
      <view class="fs-btn primary" :class="{ off: !hasInk }" @click="done">完成</view>
    </view>

    <view class="fs-pad">
      <SignaturePad
        ref="padRef"
        :height="padH"
        canvas-id="sigFsPad"
        @change="(v) => (hasInk = v)"
      />
    </view>
  </view>
</template>

<script setup>
/**
 * 横屏手写签名页
 *
 * ⚠️ 之所以单独开一页，是因为「横屏」必须由系统来做：
 *   本页在 pages.json 里配了 pageOrientation: 'landscape'，
 *   微信会把整个页面旋转成横版（windowWidth 就变成手机的长边）。
 *   canvas 全程不做任何 CSS transform，触摸坐标天然与画布一致。
 *
 *   之前那版是在浮层上写 transform: rotate(90deg) 伪横屏，
 *   canvas 是原生组件，旋转后 WeChat 上报的触摸点与画布坐标系对不上，
 *   于是「笔画不跟着手指走」——这条路走不通，已彻底弃用。
 *
 * 数据回流：签完把导出的图片通过 uni.$emit 交给来源页（我的签名）去上传保存，
 *          保存逻辑只保留一份，本页不碰接口。
 */

import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import SignaturePad from '@/components/signature-pad.vue';

const padRef = ref(null);
const padH = ref(240);
const hasInk = ref(false);

/** HEAD 行 36 + 组件工具条 40 + 页面上下留白 16 */
const CHROME = 92;

function syncSize() {
  let h = 390;
  try {
    const s = uni.getSystemInfoSync();
    h = s.windowHeight || 390;
  } catch (e) { /* 忽略，用默认值 */ }
  padH.value = Math.max(160, h - CHROME);
  nextTick(() => setTimeout(() => padRef.value && padRef.value.resize(), 60));
}

function cancel() {
  uni.navigateBack();
}

async function done() {
  if (!hasInk.value || !padRef.value) {
    uni.showToast({ title: '请先手写签名', icon: 'none' });
    return;
  }
  uni.showLoading({ title: '处理中' });
  const img = await padRef.value.exportImage();
  uni.hideLoading();
  if (!img || !img.tempFilePath) {
    uni.showToast({ title: '签名导出失败，请重签', icon: 'none' });
    return;
  }
  uni.$emit('signature:captured', img);
  uni.navigateBack();
}

onMounted(() => {
  syncSize();
  try { uni.onWindowResize(syncSize); } catch (e) { /* 老版本不支持就算了 */ }
});

onUnmounted(() => {
  try { uni.offWindowResize(syncSize); } catch (e) { /* 同上 */ }
});
</script>

<style scoped>
.fs-page {
  height: 100vh;
  box-sizing: border-box;
  padding: 6px 10px 10px;
  background: #F5F7FA;
  display: flex;
  flex-direction: column;
}

.fs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  flex: none;
}
.fs-tip {
  flex: 1;
  font-size: 11px;
  color: #6B7280;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.fs-btn {
  font-size: 13px;
  padding: 5px 16px;
  border-radius: 15px;
  white-space: nowrap;
}
.fs-btn.ghost {
  color: #1E3A5F;
  background: #fff;
  border: 1px solid #E2E8F0;
}
.fs-btn.primary {
  color: #fff;
  background: #1E3A5F;
  border: 1px solid #1E3A5F;
  font-weight: 600;
}
.fs-btn.primary.off { opacity: 0.45; }

.fs-pad { flex: 1; min-height: 0; }
</style>
