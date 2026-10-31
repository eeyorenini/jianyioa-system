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
      <text class="tool-tip">{{ strokeCount ? strokeCount + ' 笔' : '手写签名' }}</text>
    </view>
  </view>
</template>

<script setup>
/**
 * 手写签名板（H5 / 小程序共用，不使用三方库）
 *
 * ── 书法感是怎么做出来的 ─────────────────────────────
 * 1. 三段式笔锋
 *    起笔：头几个点加粗（顿笔入纸），再回落
 *    行笔：宽度由「运笔速度」决定 —— 慢则沉、快则轻
 *    收笔：尾几个点快速收细（出锋），最后一档压到接近 0
 *    这三点合起来，才像毛笔/软笔，而不是一根等粗的面条。
 * 2. 密集插值
 *    touchmove 事件的采样点很稀疏（快速划动时两点可能隔几十 px），
 *    直接 lineTo 会出折角。这里按 ~1.4px 步长在两点间补点，
 *    宽度沿路径线性过渡，视觉上就是顺滑曲线。
 * 3. 宽度动态范围
 *    书法档最粗 6.2px、最细 0.8px（约 8 倍差），签字笔档 3.8→1.6（收敛）。
 * 4. 抬手时整笔重绘
 *    实时绘制算不出「收笔」，所以 touchend 会按最终点序列重算一次宽度并全量重绘。
 *    只重绘一次、内容一致，不会看到闪烁。
 *
 * ── 数据结构 ─────────────────────────────────────
 * stroke = [{ x, y, t, sp }, ...]   sp = 该点的运笔速度(px/ms)
 * 宽度不落库（不存 w），每次重绘按当前 variant 现算 ——
 * 这样切「书法 / 签字笔」能即时把已写的字整体换一套笔锋。
 *
 * ── 坐标系差异（踩过的坑）─────────────────────────
 *   小程序：touch 事件自带 x / y（相对 canvas 左上角），直接用。
 *   H5：原生 Touch 没有 x / y，必须用 clientX 减 canvas 的 getBoundingClientRect。
 *
 * ── 绘制策略 ─────────────────────────────────────
 * 落笔时 reserve 追加画最后一段，不整屏重绘（小程序整屏重绘会闪）；
 * 只有撤销 / 清空 / 抬手收锋才全量重绘一次。
 */
import { ref, onMounted, getCurrentInstance } from 'vue';

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

/** 两档笔锋参数 */
const PRESETS = {
  // 书法：粗、动态范围大、起收笔夸张
  brush: { base: 6.2, min: 0.8, speedRef: 1.5, pow: 0.72, taperIn: 0.85, taperOut: 0.92 },
  // 签字笔：细、变化收敛，接近真实中性笔
  pen: { base: 3.8, min: 1.5, speedRef: 2.2, pow: 0.85, taperIn: 0.18, taperOut: 0.28 },
};

const INK = '#111827';
const STEP = 1.8;        // 插值步长(px)；再小则命令队列变长，小程序重绘会卡
const MIN_SEG = 0.7;     // 小于此距离视为抖动
const SMOOTH = 0.32;     // 速度指数平滑系数

let strokes = [];        // [[{x,y,t,sp}]]
let ctx = null;
let instance = null;
let size = { w: 0, h: 0 };
let drawing = false;
let lastSp = 0.35;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function preset() { return PRESETS[variant.value] || PRESETS.brush; }

/** 速度 → 基础线宽（未含起收笔） */
function widthOf(sp) {
  const P = preset();
  const norm = clamp(sp / P.speedRef, 0, 1);
  return P.base - (P.base - P.min) * Math.pow(norm, P.pow);
}

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

/**
 * 把一段折线画出来。批量执行多条 stroke 命令，
 * 最后只 draw(reserve) 一次 —— 插值后点数变多，逐段 draw 会明显卡顿。
 */
function paintSegments(pts, reserve) {
  if (!ctx || pts.length < 2) return;
  // 线帽/线宽样式在循环外设一次，减少小程序端的命令队列长度
  ctx.setLineCap('round');
  ctx.setLineJoin('round');
  ctx.setStrokeStyle(INK);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.beginPath();
    ctx.setLineWidth(b.w);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.draw(reserve);
}

/**
 * 由原始点序列算出「显示用」点序列（含插值点与最终宽度）。
 * 幂等：每次都从 sp 重新推导，不做累积衰减，可反复调用。
 */
function buildDisplayPoints(s) {
  const P = preset();
  const n = s.length;
  if (!n) return [];
  if (n === 1) {
    // 单点 = 一个圆点（顿笔）
    const p = s[0];
    const w = P.base * 0.9;
    return [
      { x: p.x, y: p.y, w },
      { x: p.x + 0.6, y: p.y + 0.6, w },
    ];
  }

  // ── 1. 起笔 / 收笔的宽度系数（按点序位置算，先算好再插值）──
  const inCnt = Math.max(2, Math.min(6, Math.round(n * 0.22)));
  const outCnt = Math.max(3, Math.min(9, Math.round(n * 0.30)));
  const shape = new Array(n);
  for (let i = 0; i < n; i++) {
    const bw = widthOf(s[i].sp);
    let k = 1;
    // 起笔：第 0 点最粗，快速回落
    if (i < inCnt) {
      const r = 1 - i / inCnt;                 // 1 → 0
      k *= 1 + P.taperIn * Math.pow(r, 1.35);
    }
    // 收笔：越靠尾越细，最后一点几乎归零（出锋）
    const tail = n - 1 - i;
    if (tail < outCnt) {
      const r = 1 - tail / outCnt;             // 0 → 1
      k *= 1 - P.taperOut * Math.pow(r, 1.15);
    }
    shape[i] = Math.max(0.45, bw * k);
  }

  // ── 2. 沿路径插值，宽度线性过渡 ──
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const segs = Math.max(1, Math.ceil(d / STEP));
    for (let j = 0; j < segs; j++) {
      const r = j / segs;
      out.push({
        x: a.x + (b.x - a.x) * r,
        y: a.y + (b.y - a.y) * r,
        w: shape[i] + (shape[i + 1] - shape[i]) * r,
      });
    }
  }
  const last = s[n - 1];
  out.push({ x: last.x, y: last.y, w: shape[n - 1] });
  return out;
}

/** 全量重绘（撤销 / 清空 / 抬手收锋 / 切换风格） */
function redrawAll(stillDrawing) {
  if (!ctx) return;
  ctx.clearRect(0, 0, size.w || 9999, size.h || 9999);
  ctx.setLineCap('round');
  ctx.setLineJoin('round');
  ctx.setStrokeStyle(INK);
  strokes.forEach((s) => {
    const pts = buildDisplayPoints(s);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.beginPath();
      ctx.setLineWidth(b.w);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  });
  ctx.draw(!!stillDrawing);
}

function onStart(e) {
  const p = pointOf(e);
  if (!p) return;
  initCtx();
  drawing = true;
  const P = preset();
  lastSp = 0.28;
  p.sp = lastSp;
  p.w = P.base * (1 + P.taperIn * 0.6);
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
  if (dist < MIN_SEG) return; // 抖动过滤，点太密会糊成一团

  // 速度（px/ms）→ 指数平滑，避免宽度跳变
  const dt = Math.max(p.t - prev.t, 1);
  const sp = dist / dt;
  lastSp = lastSp * (1 - SMOOTH) + sp * SMOOTH;
  p.sp = lastSp;

  cur.push(p);

  // 实时绘制：只为「新增这一段」补插值点，不做起收笔（抬手时统一重算）
  const a = prev;
  const segs = Math.max(1, Math.ceil(dist / STEP));
  const aw = widthOf(a.sp);
  const bw = widthOf(p.sp);
  const segPts = [{ x: a.x, y: a.y, w: aw }];
  for (let j = 1; j <= segs; j++) {
    const r = j / segs;
    segPts.push({
      x: a.x + (p.x - a.x) * r,
      y: a.y + (p.y - a.y) * r,
      w: aw + (bw - aw) * r,
    });
  }
  paintSegments(segPts, true);

  if (!hasInk.value) {
    hasInk.value = true;
    emit('change', true);
  }
}

function onEnd() {
  if (!drawing) return;
  drawing = false;
  const cur = strokes[strokes.length - 1];
  if (cur) {
    // 单点补一个微小位移，让圆点能被画出来
    if (cur.length === 1) {
      cur.push({ x: cur[0].x + 0.6, y: cur[0].y + 0.6, t: cur[0].t + 16, sp: 0.2 });
    }
    // 抬手：整笔重算（起笔顿 + 收笔出锋），此时才看得出书法感
    redrawAll(false);
  }
  if (!hasInk.value) {
    hasInk.value = true;
    emit('change', true);
  }
}

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

defineExpose({ clear, undo, exportImage, hasInk, strokeCount, setVariant });
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
  padding: 3px 10px;
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
  padding: 3px 12px;
}
.tool-btn.off { color: #C7CDD6; }
.tool-tip {
  margin-left: auto;
  font-size: 11px;
  color: #9CA3AF;
}
</style>
