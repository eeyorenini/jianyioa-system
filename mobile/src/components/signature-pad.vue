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
    <view class="sig-placeholder" v-if="!hasInk">
      <text class="ph-text">请在此处签名</text>
      <view class="ph-line"></view>
    </view>
    <view class="sig-tools">
      <view class="tool-btn" :class="{ off: !hasInk }" @click="undo">撤销</view>
      <view class="tool-btn" :class="{ off: !hasInk }" @click="clear">清空</view>
    </view>
  </view>
</template>

<script setup>
/**
 * 手写签名板（H5 / 小程序共用，不使用三方库）
 *
 * ⚠️ 不要给 canvas 加 CSS 旋转做「横屏」。
 *   canvas 在微信里是原生组件，transform 之后 WeChat 上报的触摸坐标
 *   与画布坐标系的对应关系不稳定（不同基础库表现不一致），
 *   表现为「笔画不跟着手指走」。横屏必须走系统级旋转：
 *   页面 pages.json 配 pageOrientation: 'landscape'，
 *   canvas 本身不做任何变换，坐标就天然正确。
 *
 * ── 笔迹画法：轮廓填充（不是逐段描边）──
 *   1. 3 点加权平滑跑 2 遍，去掉手指高频抖动
 *   2. Catmull-Rom 插值重采样成等距细点，曲线天然圆顺，没有折角
 *   3. 每个点按法线向两侧各偏移「半宽」，得到左右两条边
 *   4. 左边界 + 首尾圆弧 + 右边界回，合成闭合多边形，整笔一次 fill()
 *
 * ── 笔锋（签字笔档）──
 *   起笔：前 3% 加粗 15%（轻微顿笔）
 *   行笔：宽度由运笔速度决定，慢则沉、快则轻
 *   收笔：后 9% 收到 50%，尾巴略收但不夸张
 *   墨感：宽度叠加低频正弦微扰 + 左右边缘各自独立微扰 + 墨边三叠
 *
 * ── 数据结构 ──
 *   stroke = [{ x, y, v }]   v = 归一化运笔速度(0~1)，不存宽度
 *   → 换画布尺寸能按当前参数重算，天然幂等
 */

import { ref, onMounted, getCurrentInstance } from 'vue';

const props = defineProps({
  height: { type: Number, default: 200 },
  canvasId: { type: String, default: 'sigPad' },
});
const emit = defineEmits(['change']);

const hasInk = ref(false);
const strokeCount = ref(0);

/**
 * 笔刷参数（宽度单位为「200px 画布」基准，实际会按画布等比缩放）。
 *
 * 只保留签字笔一档：细、变化收敛，接近真实中性笔。
 * 书法档（maxW 13 / 出锋到 10%）已于 2026-10-31 移除 ——
 * 实测签字笔效果够用，且少一组按钮工具条更清爽。
 */
const PEN = {
  maxW: 7.2, minW: 3.4, speedRef: 2.6, pow: 1.0,
  inLen: 0.03, inBoost: 0.15,
  outLen: 0.09, outMin: 0.5,
  wobble: 0.02,
};

const INK = '#111111';
/** 墨边三叠：外圈淡、中圈半透、内圈实心 —— 边缘才有「墨渗」而不是 CAD 硬边 */
const LAYERS = [
  { a: 0.18, k: 1.28 },
  { a: 0.42, k: 1.12 },
  { a: 1.0, k: 1.0 },
];
const JITTER = 0.075;    // 左右边缘各自的微扰幅度（像墨在纸上不匀）
const STEP = 2.2;        // 重采样间距(px)
const MIN_SEG = 0.7;     // 小于此距离视为手指抖动
const SMOOTH = 0.34;     // 速度指数平滑系数
const EXPORT_SCALE = 3;  // 导出倍率
const EXPORT_MIN = 24;   // 导出裁剪的最小边长(px)

let strokes = [];        // [[{x,y,v}]]
let ctx = null;
let instance = null;
let curSize = { w: 0, h: 0 };
let drawing = false;
let lastSp = 0.35;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/** 画布尺度：以 200px 短边为基准，横屏大字时笔宽同步放大 */
function sizeScale() {
  const m = Math.min(curSize.w || 200, curSize.h || 200);
  return clamp(m / 200, 0.85, 2.6);
}

function preset() {
  const P = PEN;
  const k = sizeScale();
  return {
    ...P,
    maxW: P.maxW * k,
    minW: P.minW * k,
    speedRef: P.speedRef * k,
  };
}

/** 原始速度(px/ms) → 归一化 0~1，跨画布尺寸可比 */
function normSpeed(sp) {
  const P = preset();
  return clamp(sp / P.speedRef, 0, 1);
}

function initCtx() {
  if (!instance) instance = getCurrentInstance();
  // 组件内创建 canvas 上下文必须带实例，否则小程序取不到这个 canvas
  ctx = uni.createCanvasContext(props.canvasId, instance ? (instance.proxy || instance) : undefined);
}

/** 量当前画布尺寸 */
function measure(cb) {
  const q = uni.createSelectorQuery();
  if (instance && q.in) q.in(instance.proxy || instance);
  q.select('#' + props.canvasId).boundingClientRect((r) => {
    if (r && r.width) curSize = { w: r.width, h: r.height };
    if (cb) cb();
  }).exec();
}

/* ───────────────── 取坐标 ───────────────── */

function touchOf(e) {
  return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
}

/**
 * 画布内坐标。小程序 canvas 的触摸点自带 x/y（相对画布），直接用；
 * 拿不到时（H5）用 clientX/clientY 减画布 rect。
 */
function pointOf(e) {
  const t = touchOf(e);
  if (!t) return null;
  let x = t.x;
  let y = t.y;
  const bad = (n) => typeof n !== 'number' || isNaN(n);
  if (bad(x) || bad(y)) {
    const el = (e.currentTarget && e.currentTarget.$el) || t.target || null;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      x = t.clientX - r.left;
      y = t.clientY - r.top;
    }
  }
  if (bad(x) || bad(y)) return null;
  return { x, y, t: Date.now() };
}

/* ───────────────── 笔迹几何 ───────────────── */

/** 3 点加权平滑，去掉手指高频抖动（端点保持不动） */
function smoothPoints(raw, passes) {
  let out = raw.map((p) => ({ x: p.x, y: p.y, v: p.v }));
  for (let k = 0; k < passes; k++) {
    const nxt = out.map((p) => ({ ...p }));
    for (let i = 1; i < out.length - 1; i++) {
      nxt[i].x = out[i - 1].x * 0.25 + out[i].x * 0.5 + out[i + 1].x * 0.25;
      nxt[i].y = out[i - 1].y * 0.25 + out[i].y * 0.5 + out[i + 1].y * 0.25;
    }
    out = nxt;
  }
  return out;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/** Catmull-Rom 等距重采样：曲线圆顺，顺带把稀疏的 touchmove 点补密 */
function resample(pts) {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ ...p }));
  const at = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = at(i + 2);
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const segs = Math.max(1, Math.ceil(d / STEP));
    for (let j = 0; j < segs; j++) {
      const t = j / segs;
      out.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        v: p1.v + (p2.v - p1.v) * t,
      });
    }
  }
  const last = pts[n - 1];
  out.push({ x: last.x, y: last.y, v: last.v });
  return out;
}

/** 逐点宽度：速度 + 起笔顿 + 收笔锋 + 墨感微扰 */
function widthsOf(pts) {
  const P = preset();
  const n = pts.length;
  const seed = pts.length ? pts[0].x * 0.17 + pts[0].y * 0.11 : 0;
  const ws = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const v = clamp(pts[i].v, 0, 1);
    let w = P.maxW - (P.maxW - P.minW) * Math.pow(v, P.pow);

    // 起笔：顿笔入纸
    if (t < P.inLen) {
      const u = 1 - t / P.inLen;          // 1 → 0
      w *= 1 + P.inBoost * u * u;
    }
    // 收笔：出锋
    if (t > 1 - P.outLen) {
      const u = (t - (1 - P.outLen)) / P.outLen;   // 0 → 1
      w *= 1 - (1 - P.outMin) * Math.pow(u, 1.45);
    }
    // 墨感：两路低频微扰，edges 不再死直
    w *= 1 + P.wobble * (
      Math.sin(i * 0.7 + seed) * 0.5 + Math.sin(i * 1.9 + seed * 2.3) * 0.3
    );
    ws[i] = Math.max(0.7, w);
  }
  return ws;
}

/**
 * 把一条笔迹一次性填出来。K 是外扩系数（做墨边用）。
 * 左边界去 → 尾端半圆 → 右边界回 → 首端半圆 → 闭合 → fill
 */
function fillRibbon(pts, ws, K) {
  const n = pts.length;
  if (!ctx || n < 2) return false;
  const hw = new Array(n);
  const L = new Array(n);
  const R = new Array(n);
  const ANG = new Array(n);
  const seed = pts[0].x * 0.21 + pts[0].y * 0.13;
  const kk = K || 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    ANG[i] = Math.atan2(ty, tx);
    hw[i] = (ws[i] / 2) * kk;
    // 左右两侧各自微扰，边缘才不呆板
    const jl = 1 + JITTER * (Math.sin(i * 0.37 + seed) * 0.6 + Math.sin(i * 0.93 + seed * 1.7) * 0.4);
    const jr = 1 + JITTER * (Math.sin(i * 0.41 + seed * 2.1) * 0.6 + Math.sin(i * 1.07 + seed * 0.6) * 0.4);
    L[i] = { x: pts[i].x - ty * hw[i] * jl, y: pts[i].y + tx * hw[i] * jl };
    R[i] = { x: pts[i].x + ty * hw[i] * jr, y: pts[i].y - tx * hw[i] * jr };
  }

  ctx.beginPath();
  ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y);
  // 尾端圆头（沿切线前方）
  ctx.arc(pts[n - 1].x, pts[n - 1].y, hw[n - 1], ANG[n - 1] + Math.PI / 2, ANG[n - 1] - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
  // 首端圆头（沿切线后方）
  ctx.arc(pts[0].x, pts[0].y, hw[0], ANG[0] - Math.PI / 2, ANG[0] + Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  return true;
}

/** 单点（点一下）画个墨点 */
function fillDot(p, w) {
  if (!ctx) return;
  const r = Math.max(1, w * 0.45);
  ctx.setFillStyle('rgba(17,17,17,0.18)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.setFillStyle(INK);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function buildStroke(raw) {
  if (raw.length === 1) return null;
  const pts = resample(smoothPoints(raw, 2));
  return { pts, ws: widthsOf(pts) };
}

/* ───────────────── 绘制 ───────────────── */

function redrawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, curSize.w || 9999, curSize.h || 9999);
  const P = preset();
  strokes.forEach((raw) => {
    if (raw.length === 1) {
      fillDot(raw[0], P.maxW);
      return;
    }
    const b = buildStroke(raw);
    if (!b) return;
    // 由外到内三遍：淡墨边 → 半透过渡 → 实心笔画
    LAYERS.forEach((ly) => {
      ctx.setFillStyle(`rgba(17,17,17,${ly.a})`);
      fillRibbon(b.pts, b.ws, ly.k);
    });
  });
  ctx.draw();
}

/** 落笔实时绘制：只补「新增这一段」，两端加圆头，和上一段自然衔接 */
function paintLive(a, b) {
  if (!ctx) return;
  const P = preset();
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const segs = Math.max(1, Math.ceil(d / STEP));
  const pts = [];
  for (let j = 0; j < segs; j++) {
    const r = j / segs;
    pts.push({
      x: a.x + (b.x - a.x) * r,
      y: a.y + (b.y - a.y) * r,
      v: a.v + (b.v - a.v) * r,
    });
  }
  pts.push({ x: b.x, y: b.y, v: b.v });

  const ws = pts.map((p) => {
    const v = clamp(p.v, 0, 1);
    return Math.max(0.7, P.maxW - (P.maxW - P.minW) * Math.pow(v, P.pow));
  });

  // 实时只铺两层（外圈 + 实心），少一次 fill 让手写更跟手
  ctx.setFillStyle('rgba(17,17,17,0.22)');
  fillRibbon(pts, ws, 1.26);
  ctx.setFillStyle(INK);
  fillRibbon(pts, ws, 1.0);
  ctx.draw(true);
}

/* ───────────────── 手势 ───────────────── */

function startStroke(p) {
  if (!ctx) initCtx();
  drawing = true;
  lastSp = 0.28;
  p.v = normSpeed(lastSp);
  strokes.push([p]);
  strokeCount.value = strokes.length;
}

function moveStroke(p) {
  if (!drawing) return;
  const cur = strokes[strokes.length - 1];
  if (!cur || !cur.length) return;
  const prev = cur[cur.length - 1];
  const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
  if (dist < MIN_SEG) return;      // 抖动过滤，点太密会糊成一团

  // 速度 → 指数平滑，避免宽度跳变
  const dt = Math.max(p.t - prev.t, 1);
  lastSp = lastSp * (1 - SMOOTH) + (dist / dt) * SMOOTH;
  p.v = normSpeed(lastSp);

  cur.push(p);
  paintLive(prev, p);

  if (!hasInk.value) {
    hasInk.value = true;
    emit('change', true);
  }
}

function endStroke() {
  if (!drawing) return;
  drawing = false;
  // 抬手：整笔重算（起笔顿 + 收笔略收），此时才看得出笔锋收放
  if (strokes.length) redrawAll();
  if (!hasInk.value) {
    hasInk.value = true;
    emit('change', true);
  }
}

function onStart(e) {
  const p = pointOf(e);
  if (p) startStroke(p);
}
function onMove(e) {
  const p = pointOf(e);
  if (p) moveStroke(p);
}
function onEnd() { endStroke(); }

/* ───────────────── 对外操作 ───────────────── */

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
    ctx.clearRect(0, 0, curSize.w || 9999, curSize.h || 9999);
    ctx.draw();
  }
  emit('change', false);
}

/** 画布尺寸变了（例如进横屏页、旋转设备）：重新量尺寸并重绘 */
function resize() {
  measure(() => {
    if (strokes.length) redrawAll();
  });
}

/** 墨迹外接框：导出时裁掉四周空白，签名图才紧凑（盖章时不会显得偏小） */
function inkBBox() {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  strokes.forEach((st) => st.forEach((p) => {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }));
  if (!isFinite(x0)) return null;
  const m = preset().maxW * 0.8;   // 留一圈墨边，别贴死
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
}

function doExport() {
  return new Promise((resolve) => {
    const cw = curSize.w || 320;
    const ch = curSize.h || props.height || 200;
    const bb = inkBBox();

    let sx = 0;
    let sy = 0;
    let sw = cw;
    let sh = ch;
    if (bb) {
      sx = clamp(bb.x0, 0, cw);
      sy = clamp(bb.y0, 0, ch);
      sw = clamp(bb.x1, 0, cw) - sx;
      sh = clamp(bb.y1, 0, ch) - sy;
      if (sw < EXPORT_MIN) { sx = clamp(sx - (EXPORT_MIN - sw) / 2, 0, cw); sw = Math.min(EXPORT_MIN, cw); }
      if (sh < EXPORT_MIN) { sy = clamp(sy - (EXPORT_MIN - sh) / 2, 0, ch); sh = Math.min(EXPORT_MIN, ch); }
    }

    const opts = {
      canvasId: props.canvasId,
      x: Math.round(sx),
      y: Math.round(sy),
      width: Math.round(sw),
      height: Math.round(sh),
      destWidth: Math.round(sw * EXPORT_SCALE),
      destHeight: Math.round(sh * EXPORT_SCALE),
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

/** 导出 PNG：返回 { tempFilePath, strokeCount }，无内容返回 null */
function exportImage() {
  return new Promise((resolve) => {
    if (!strokes.length) { resolve(null); return; }
    // 先量一次尺寸，避免画布刚挂上时 curSize 还是 0
    measure(() => { doExport().then(resolve); });
  });
}

onMounted(() => {
  instance = getCurrentInstance();
  initCtx();
  measure();
});

defineExpose({ clear, undo, exportImage, resize, hasInk, strokeCount });
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
  gap: 6px;
  padding: 6px 8px;
  background: #F8FAFC;
  border-top: 1px solid #EEF1F5;
  flex-wrap: nowrap;
}
.tool-btn {
  font-size: 12px;
  color: #1E3A5F;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 3px 10px;
  white-space: nowrap;
}
.tool-btn.off { color: #C7CDD6; }
</style>
