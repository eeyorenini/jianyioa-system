<template>
  <view class="sig-wrap" :class="{ 'is-fs': fs }">
    <!-- ───────── 内联模式 ───────── -->
    <template v-if="!fs">
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
      <view class="sig-tools">
        <view class="style-switch">
          <view
            class="style-btn"
            :class="{ on: variant === 'brush' }"
            @click="setVariant('brush')"
          >书法</view>
          <view
            class="style-btn"
            :class="{ on: variant === 'pen' }"
            @click="setVariant('pen')"
          >签字笔</view>
        </view>
        <view class="tool-btn" :class="{ off: !hasInk }" @click="undo">
          <text>撤销</text>
        </view>
        <view class="tool-btn" :class="{ off: !hasInk }" @click="clear">
          <text>清空</text>
        </view>
        <view class="tool-btn fs-entry" @click="enterFs">
          <text>横屏手写</text>
        </view>
      </view>
    </template>

    <!-- ───────── 全屏横屏模式 ─────────
         整层用 CSS 旋转 90°，画布像素仍是横的，导出即横版签名。
         用户把手机逆时针转过来（机头朝左）就是正的。 -->
    <view v-else class="fs-layer">
      <canvas
        class="fs-canvas"
        :canvas-id="canvasId"
        :id="canvasId"
        :style="{ height: fsCanvasH + 'px' }"
        disable-scroll="true"
        @touchstart="onFsStart"
        @touchmove="onFsMove"
        @touchend="onFsEnd"
        @touchcancel="onFsEnd"
      />
      <view class="fs-bar">
        <text class="fs-hint">把手机横过来（机头朝左），写大一点更好看</text>
        <view class="fs-act" :class="{ off: !hasInk }" @click="undo">撤销</view>
        <view class="fs-act" :class="{ off: !hasInk }" @click="clear">清空</view>
        <view class="fs-act primary" @click="exitFs">完成</view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 手写签名板（H5 / 小程序共用，不使用三方库）
 *
 * ── 为什么笔迹不像书法？根子不在「笔锋参数」，在「画法」──
 * 旧实现：把折线拆成几百条短线段，每段单独 setLineWidth + stroke()。
 *   问题一：每次 stroke() 都是独立的圆头笔段，接缝处反复叠加，
 *           放大看是一节一节的「香肠」，永远不会有笔锋那种连续边缘。
 *   问题二：动态范围只有 6.2 → 0.8，且默认就细，写出来像中性笔。
 *
 * 现在改成「轮廓填充」：
 *   1. 平滑原始采样点（3 点加权，跑 2 遍）
 *   2. Catmull-Rom 插值重采样成等距细点，曲线天然圆顺，没有折角
 *   3. 每个点按法线向两侧各偏移「半宽」，得到左右两条边
 *   4. 左边界去 + 首尾圆弧 + 右边界回，合成一个闭合多边形，一次 fill()
 *   → 整笔只有一次 fill，边缘是连续矢量曲线，粗细变化自然过渡。
 *
 * ── 笔锋怎么来的 ──
 *   起笔：前 7% 加粗 55%（顿笔入纸）
 *   行笔：宽度由运笔速度决定，慢则沉、快则轻（v 归一化后存盘，与画布尺寸无关）
 *   收笔：后 26% 收到 8%（出锋），所以尾巴是尖的
 *   墨感：宽度叠加两路低频正弦微扰，边缘不再像 CAD 图那样死直
 *   宽度随画布尺寸等比放大，横屏大写时比例一致
 *
 * ── 数据结构 ──
 *   stroke = [{ x, y, v }]   v = 归一化运笔速度(0~1)，不存宽度
 *   → 切风格、换画布尺寸都能按当前参数重算，天然幂等
 */

import { ref, onMounted, nextTick, getCurrentInstance } from 'vue';

const props = defineProps({
  height: { type: Number, default: 200 },
  canvasId: { type: String, default: 'sigPad' },
  // 默认风格：brush = 书法（笔锋明显），pen = 签字笔（均匀细线）
  variant: { type: String, default: 'brush' },
});
const emit = defineEmits(['change']);

const hasInk = ref(false);
const strokeCount = ref(0);
const variant = ref(props.variant === 'pen' ? 'pen' : 'brush');
const fs = ref(false);
const fsCanvasH = ref(320);

/** 两档笔刷参数（宽度单位为「200px 画布」基准，实际会按画布等比缩放） */
const PRESETS = {
  // 书法：粗、动态范围大、起收笔夸张、边缘有墨感
  brush: {
    maxW: 13, minW: 2.8, speedRef: 1.9, pow: 1.0,
    inLen: 0.09, inBoost: 0.45,
    outLen: 0.28, outMin: 0.10,
    wobble: 0.035,
  },
  // 签字笔：细、变化收敛，接近真实中性笔
  pen: {
    maxW: 7.2, minW: 3.4, speedRef: 2.6, pow: 1.0,
    inLen: 0.03, inBoost: 0.15,
    outLen: 0.09, outMin: 0.5,
    wobble: 0.02,
  },
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
const FS_BAR = 44;       // 全屏模式底部工具条高度(px)

let strokes = [];        // [[{x,y,v}]]
let ctx = null;
let instance = null;
let curSize = { w: 0, h: 0 };
let drawing = false;
let lastSp = 0.35;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 画布尺度：以 200px 短边为基准，横屏大字时笔宽同步放大 */
function sizeScale() {
  const m = Math.min(curSize.w || 200, curSize.h || 200);
  return clamp(m / 200, 0.85, 2.6);
}

function preset() {
  const P = PRESETS[variant.value] || PRESETS.brush;
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

/** 量当前画布尺寸（旋转后的全屏画布不能用 boundingClientRect，走系统尺寸算） */
function measure(cb) {
  const q = uni.createSelectorQuery();
  if (instance && q.in) q.in(instance.proxy || instance);
  q.select('#' + props.canvasId).boundingClientRect((r) => {
    if (r && r.width) curSize = { w: r.width, h: r.height };
    if (cb) cb();
  }).exec();
}

function winSize() {
  try {
    const s = uni.getSystemInfoSync();
    return { w: s.windowWidth || 375, h: s.windowHeight || 667 };
  } catch (e) {
    return { w: 375, h: 667 };
  }
}

/* ───────────────── 取坐标 ───────────────── */

function touchOf(e) {
  return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
}

/** 内联：小程序自带 x/y；H5 用 clientX 减 rect */
function pointOf(e) {
  const t = touchOf(e);
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

/**
 * 全屏横屏：整层被 rotate(90deg) + translateX(100vw) 旋转，
 * 所以屏幕坐标 → 画布坐标的逆变换是固定的：
 *   canvasX = clientY
 *   canvasY = windowWidth - clientX
 * （画布贴在全屏层的顶部，工具条在底部）
 */
function fsPointOf(e) {
  const t = touchOf(e);
  if (!t) return null;
  const sx = t.clientX;
  const sy = t.clientY;
  if (typeof sx !== 'number' || typeof sy !== 'number') return null;
  const W = winSize().w;
  return { x: sy, y: W - sx, t: Date.now() };
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

function redrawAll(reserve) {
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
  ctx.draw(!!reserve);
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
  const cur = strokes[strokes.length - 1];
  if (cur) {
    // 抬手：整笔重算（起笔顿 + 收笔出锋），此时才看得出书法感
    // 只有 1 个点的（轻点一下）由 redrawAll 里的 fillDot 画成墨点
    redrawAll(false);
  }
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

function onFsStart(e) {
  const p = fsPointOf(e);
  if (p) startStroke(p);
}
function onFsMove(e) {
  const p = fsPointOf(e);
  if (p) moveStroke(p);
}
function onFsEnd() { endStroke(); }

/* ───────────────── 全屏横屏切换 ───────────────── */

function remapStrokes(from, to) {
  if (!from || !to || !from.w || !from.h || !to.w || !to.h) return;
  if (from.w === to.w && from.h === to.h) return;
  const s = Math.min(to.w / from.w, to.h / from.h);
  const dx = (to.w - from.w * s) / 2;
  const dy = (to.h - from.h * s) / 2;
  strokes.forEach((st) => st.forEach((p) => {
    p.x = p.x * s + dx;
    p.y = p.y * s + dy;
  }));
}

async function enterFs() {
  const ws = winSize();
  const prev = { ...curSize };
  fsCanvasH.value = Math.max(160, ws.w - FS_BAR);
  fs.value = true;
  ctx = null;
  await nextTick();
  await wait(60);                       // 等新 canvas 真正挂上去
  curSize = { w: ws.h, h: fsCanvasH.value };
  initCtx();
  remapStrokes(prev, curSize);
  redrawAll(false);
}

async function exitFs() {
  const prev = { ...curSize };
  fs.value = false;
  ctx = null;
  await nextTick();
  await wait(60);
  initCtx();
  measure(() => {
    remapStrokes(prev, curSize);
    redrawAll(false);
  });
}

/* ───────────────── 对外操作 ───────────────── */

/** 切换笔锋风格：已写的字整体重绘成新风格 */
function setVariant(v) {
  if (v !== 'brush' && v !== 'pen') return;
  if (variant.value === v) return;
  variant.value = v;
  if (strokes.length) redrawAll(false);
}

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  strokeCount.value = strokes.length;
  if (!strokes.length) { hasInk.value = false; emit('change', false); }
  redrawAll(false);
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

/** 导出 PNG：返回 { tempFilePath, strokeCount }，无内容返回 null */
function exportImage() {
  return new Promise((resolve) => {
    if (!strokes.length) { resolve(null); return; }
    const w = curSize.w || 320;
    const h = curSize.h || (fs.value ? fsCanvasH.value : props.height);
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
  measure();
});

defineExpose({ clear, undo, exportImage, hasInk, strokeCount, setVariant, enterFs, exitFs });
</script>

<style scoped>
.sig-wrap {
  position: relative;
  background: #fff;
  border: 1px dashed #CBD5E1;
  border-radius: 12px;
  overflow: hidden;
}
/* 全屏时父容器不能再当包含块，否则可能把 fixed 层裁掉 */
.sig-wrap.is-fs {
  position: static;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
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
}
.style-switch {
  display: flex;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
}
.style-btn {
  font-size: 12px;
  color: #64748B;
  padding: 3px 8px;
  line-height: 18px;
}
.style-btn.on {
  background: #1E3A5F;
  color: #fff;
}
.tool-btn {
  font-size: 12px;
  color: #1E3A5F;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 3px 10px;
}
.tool-btn.off { color: #C7CDD6; }
.tool-btn.fs-entry {
  margin-left: auto;
  color: #fff;
  background: #1E3A5F;
  border-color: #1E3A5F;
}

/* ───────── 全屏横屏层 ─────────
   width/height 互换 + rotate(90deg)：整层转成横版铺满屏幕。
   translateX(100vw) 把旋转后跑到屏幕左边的盒子拉回原位。 */
.fs-layer {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vh;
  height: 100vw;
  transform-origin: 0 0;
  transform: translateX(100vw) rotate(90deg);
  background: #FFFFFF;
  z-index: 9999;
  display: flex;
  flex-direction: column;
}
.fs-canvas {
  width: 100%;
  display: block;
  background: #fff;
}
.fs-bar {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #0F172A;
  box-sizing: border-box;
}
.fs-hint {
  flex: 1;
  font-size: 11px;
  color: #94A3B8;
}
.fs-act {
  font-size: 13px;
  color: #E2E8F0;
  padding: 5px 14px;
  border: 1px solid #334155;
  border-radius: 15px;
}
.fs-act.off { color: #64748B; border-color: #1E293B; }
.fs-act.primary {
  color: #fff;
  background: #2563EB;
  border-color: #2563EB;
  font-weight: 600;
}
</style>
