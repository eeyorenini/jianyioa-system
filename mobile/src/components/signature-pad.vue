<template>
  <view class="sig-wrap">
    <canvas
      class="sig-canvas"
      :canvas-id="canvasId"
      :id="canvasId"
      :style="{ height: height + 'px' }"
      disable-scroll="true"
      @touchstart="onStart"
      @touchmove="onMove"
      @touchend="onEnd"
      @touchcancel="onEnd"
    />
    <!-- 空板提示 + 签名横线，只在没下笔时显示 -->
    <view class="sig-placeholder" v-if="!hasInk" @click.stop>
      <text class="ph-text">请在此处签名</text>
      <view class="ph-line"></view>
    </view>
    <!-- 工具条 -->
    <view class="sig-tools">
      <view class="tool-btn" :class="{ off: !hasInk }" @click="undo">
        <text>撤销</text>
      </view>
      <view class="tool-btn" :class="{ off: !hasInk }" @click="clear">
        <text>清空</text>
      </view>
      <text class="tool-tip">{{ strokeCount ? strokeCount + ' 笔' : '手写签名' }}</text>
    </view>
  </view>
</template>

<script setup>
/**
 * 手写签名板（H5 / 小程序共用，不使用三方库）
 *
 * 笔锋原理：按「落笔速度」调线宽 —— 慢写粗、快划细，再对宽度做指数平滑，
 * 所以看起来像签字笔，而不是均匀的一根面条。每段单独 stroke（圆头连接），
 * 接缝自然。
 *
 * 坐标系差异（踩过的坑）：
 *   小程序：touch 事件自带 x / y（相对 canvas 左上角），直接用。
 *   H5：原生 Touch 没有 x / y，必须用 clientX 减 canvas 的 getBoundingClientRect。
 *       这里 target 就是真实 <canvas> 元素，所以能拿到 rect。
 *
 * 绘制策略：落笔时 reserve 追加画最后一段，不整屏重绘（小程序整屏重绘会闪）；
 * 只有撤销 / 清空才全量重绘一次。
 */
import { ref, onMounted, getCurrentInstance } from 'vue';

const props = defineProps({
  height: { type: Number, default: 200 },
  canvasId: { type: String, default: 'sigPad' },
});
const emit = defineEmits(['change']);

const hasInk = ref(false);
const strokeCount = ref(0);

// 笔画集合：[[{x,y,w}, ...], ...]
let strokes = [];
let ctx = null;
let instance = null;
let size = { w: 0, h: 0 };
let drawing = false;
let lastW = 3.4;

const BASE_W = 4.2;   // 最慢时线宽
const MIN_W = 1.3;    // 最快时线宽
const SPEED_K = 0.55; // 速度→变细的系数

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/** 取坐标：小程序有 x/y；H5 用 clientX/Y 减 rect */
function pointOf(e) {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!t) return null;
  let x = t.x;
  let y = t.y;
  // #ifdef H5
  if (typeof x !== 'number' || isNaN(x)) {
    const el = t.target || (e.currentTarget && e.currentTarget.$el) || null;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      x = t.clientX - r.left;
      y = t.clientY - r.top;
    }
  }
  // #endif
  if (typeof x !== 'number' || isNaN(x)) return null;
  return { x, y, t: Date.now() };
}

function initCtx() {
  if (ctx) return;
  // 组件内创建 canvas 上下文必须带实例，否则小程序取不到这个 canvas
  ctx = uni.createCanvasContext(props.canvasId, instance ? (instance.proxy || instance) : undefined);
  const q = uni.createSelectorQuery();
  if (instance && q.in) q.in(instance.proxy || instance);
  q.select('#' + props.canvasId).boundingClientRect((r) => {
    if (r) size = { w: r.width, h: r.height };
  }).exec();
}

/** 画一段（追加） */
function drawSegment(p0, p1) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.setLineWidth(p1.w);
  ctx.setLineCap('round');
  ctx.setLineJoin('round');
  ctx.setStrokeStyle('#111827');
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  ctx.draw(true); // reserve = true，保留已有内容
}

/** 全量重绘（撤销 / 清空用） */
function redrawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, size.w || 9999, size.h || 9999);
  strokes.forEach((s) => {
    for (let i = 1; i < s.length; i++) {
      const p0 = s[i - 1];
      const p1 = s[i];
      ctx.beginPath();
      ctx.setLineWidth(p1.w);
      ctx.setLineCap('round');
      ctx.setLineJoin('round');
      ctx.setStrokeStyle('#111827');
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  });
  ctx.draw();
}

function onStart(e) {
  const p = pointOf(e);
  if (!p) return;
  initCtx();
  drawing = true;
  lastW = BASE_W;
  p.w = lastW;
  strokes.push([p]);
  strokeCount.value = strokes.length;
}

function onMove(e) {
  if (!drawing) return;
  const p = pointOf(e);
  if (!p) return;
  const cur = strokes[strokes.length - 1];
  if (!cur || !cur.length) return;
  const prev = cur[cur.length - 1];
  const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
  const dt = Math.max(p.t - prev.t, 1);
  if (dist < 1.2) return; // 抖动过滤，点太密会糊成一团

  // 速度（px/ms）越快线越细，再做指数平滑，避免粗细跳变
  const speed = dist / dt;
  const target = clamp(BASE_W - speed * BASE_W * SPEED_K * 4, MIN_W, BASE_W);
  const w = lastW * 0.65 + target * 0.35;
  lastW = w;

  const np = { x: p.x, y: p.y, t: p.t, w };
  drawSegment(prev, np);
  cur.push(np);
  if (!hasInk.value) {
    hasInk.value = true;
    emit('change', true);
  }
}

function onEnd() {
  if (!drawing) return;
  drawing = false;
  if (!hasInk.value && strokes.length) {
    // 只点了一下，画个圆点，代表一撇
    const s = strokes[strokes.length - 1];
    if (s.length === 1) {
      const p = s[0];
      s.push({ x: p.x + 0.8, y: p.y + 0.8, w: BASE_W });
      redrawAll();
    }
    hasInk.value = true;
    emit('change', true);
  }
}

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  strokeCount.value = strokes.length;
  if (!strokes.length) { hasInk.value = false; emit('change', false); }
  redrawAll();
}

function clear() {
  strokes = [];
  hasInk.value = false;
  strokeCount.value = 0;
  if (ctx) {
    ctx.clearRect(0, 0, size.w || 9999, size.h || 9999);
    ctx.draw();
  }
  emit('change', false);
}

/** 导出 PNG：返回 { tempFilePath, strokeCount }，无内容返回 null */
function exportImage() {
  return new Promise((resolve) => {
    if (!strokes.length) { resolve(null); return; }
    const w = size.w || 320;
    const h = size.h || props.height;
    const opts = {
      canvasId: props.canvasId,
      x: 0, y: 0, width: w, height: h,
      destWidth: Math.round(w * 3),
      destHeight: Math.round(h * 3),
      fileType: 'png',
      quality: 1,
      success: (r) => resolve({ tempFilePath: r.tempFilePath, strokeCount: strokes.length }),
      fail: () => resolve(null),
    };
    if (instance) {
      // 小程序组件内导出也需传实例
      uni.canvasToTempFilePath(opts, instance.proxy || instance);
    } else {
      uni.canvasToTempFilePath(opts);
    }
  });
}

onMounted(() => {
  instance = getCurrentInstance();
  initCtx();
});

defineExpose({ clear, undo, exportImage, hasInk, strokeCount });
</script>

<style scoped>
.sig-wrap {
  position: relative;
  background: #fff;
  border: 1px dashed #CBD5E1;
  border-radius: 12px;
  overflow: hidden;
}

.sig-canvas {
  width: 100%;
  display: block;
  background: #fff;
}

.sig-placeholder {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.ph-text {
  font-size: 13px;
  color: #C7CDD6;
  letter-spacing: 2px;
}
.ph-line {
  width: 60%;
  height: 1px;
  background: #EEF1F5;
  margin-top: 26px;
}

.sig-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #F8FAFC;
  border-top: 1px solid #EEF1F5;
}
.tool-btn {
  font-size: 12px;
  color: #1E3A5F;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 3px 12px;
}
.tool-btn.off { color: #C7CDD6; }
.tool-tip {
  margin-left: auto;
  font-size: 11px;
  color: #9CA3AF;
}
</style>
