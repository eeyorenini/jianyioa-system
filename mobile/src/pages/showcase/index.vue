<template>
  <view class="showcase">
    <!-- ==================== 顶部导航 ==================== -->
    <!-- 2026-10-26：带 navStyle 让出状态栏 + 微信胶囊宽度，否则「登录」被胶囊盖住 -->
    <view class="nav-bar" :style="navStyleCapsule">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">样板工地</text>
      <text class="nav-login" @click="goLogin">登录</text>
    </view>

    <!-- ==================== 项目卡片 ==================== -->
    <view class="hero-card">
      <view class="hero-cover">
        <image class="hero-cover-img" src="/static/landing/case-living.jpg" mode="aspectFill" />
        <text class="demo-badge">示例演示</text>
      </view>
      <view class="hero-info">
        <text class="hero-title">阳光里 3 号楼 · 120㎡</text>
        <text class="hero-meta">三室两厅 · 现代简约 · 工期 90 天</text>
        <view class="hero-progress">
          <view class="bar">
            <view class="bar-fill"></view>
          </view>
          <text class="bar-text">进度 65%</text>
        </view>
      </view>
    </view>

    <!-- ==================== 施工节点 ==================== -->
    <view class="section">
      <text class="section-title">施工节点</text>
      <view class="timeline">
        <view class="tl-item" v-for="(n, i) in nodes" :key="n.title">
          <view class="tl-rail">
            <view class="tl-dot" :class="n.state"></view>
            <view class="tl-line" v-if="i < nodes.length - 1" :class="{ done: n.state === 'done' }"></view>
          </view>
          <view class="tl-body">
            <view class="tl-head">
              <text class="tl-title">{{ n.title }}</text>
              <text class="tl-state" :class="n.state">{{ n.stateText }}</text>
            </view>
            <text class="tl-desc">{{ n.desc }}</text>
            <text class="tl-date">{{ n.date }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 模块入口 ==================== -->
    <view class="section">
      <text class="section-title">工地里的这些事</text>
      <text class="section-sub">登录后可查看以下模块在您工地上的真实内容</text>
      <view class="grid">
        <view class="grid-item" v-for="m in modules" :key="m.label" @click="onModule(m)">
          <view class="grid-icon" :style="{ background: m.bg }">
            <text class="grid-emoji">{{ m.icon }}</text>
          </view>
          <text class="grid-label">{{ m.label }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 施工记录 ==================== -->
    <view class="section">
      <text class="section-title">最近的施工记录</text>
      <view class="record" v-for="r in records" :key="r.title" @click="onRecord">
        <image class="record-img" :src="r.img" mode="aspectFill" />
        <view class="record-body">
          <text class="record-tag">{{ r.tag }}</text>
          <text class="record-title">{{ r.title }}</text>
          <text class="record-date">{{ r.date }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 提示 ==================== -->
    <view class="notice">
      <text class="notice-text">以上为演示内容，用于展示系统功能。登录后可查看您名下真实的工地数据。</text>
    </view>

    <!-- ==================== 底部固定操作 ==================== -->
    <view class="bottom-bar">
      <view class="btn-login" @click="goLogin">
        <text class="btn-login-text">{{ loginBtnText }}</text>
      </view>
      <text class="bottom-hint" @click="goBack">继续浏览其他介绍</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { requireLogin } from "@/utils/permission";

// 业主登录按钮文案：小程序端走微信一键登录，H5 走手机号登录
const loginBtnText = ref("登录查看我的工地");
// #ifdef MP-WEIXIN
loginBtnText.value = "微信登录 · 查看我的工地";
// #endif

// ⚠️ 本页所有数据均为写死的演示数据，不请求任何接口。
// 目的是满足微信审核「先体验后授权」的要求：未登录用户也能看到产品长什么样，
// 只有点进真实操作时才引导登录（见 utils/permission.ts 的 requireLogin）。
const nodes = [
  { title: "开工交底", state: "done", stateText: "已完成", desc: "现场量房、图纸确认、保护措施到位", date: "2026-10-02" },
  { title: "水电改造", state: "done", stateText: "已完成", desc: "强弱电分离布线，水管打压测试合格", date: "2026-10-08" },
  { title: "泥瓦工程", state: "doing", stateText: "进行中", desc: "厨卫墙地砖铺贴，防水闭水试验", date: "2026-10-15 起" },
  { title: "木作油漆", state: "todo", stateText: "待开始", desc: "吊顶、柜体制作与墙面乳胶漆", date: "预计 2026-11-01" },
];

const modules = [
  { label: "施工进度", icon: "📐", bg: "#DBEAFE" },
  { label: "质量巡检", icon: "🔍", bg: "#FEE2E2" },
  { label: "材料进场", icon: "🧱", bg: "#EDE9FE" },
  { label: "隐蔽验收", icon: "✅", bg: "#D1FAE5" },
  { label: "合同金额", icon: "📄", bg: "#FEF3C7" },
  { label: "消息通知", icon: "🔔", bg: "#E0E7FF" },
];

const records = [
  { tag: "泥瓦", title: "主卫墙砖铺贴完成，空鼓率检测合格", date: "10-18", img: "/static/landing/case-tiling.jpg" },
  { tag: "水电", title: "厨房水路打压测试通过，压力 0.8MPa", date: "10-12", img: "/static/landing/case-plumbing.jpg" },
  { tag: "完工", title: "客厅硬装验收，灯具开关全部就位", date: "10-20", img: "/static/landing/case-living.jpg" },
];

// 模块入口：游客点进来时用 requireLogin 弹「去登录 / 再逛逛」，不静默跳转
const onModule = (m) => {
  requireLogin(`${m.label}需要登录后查看您名下的工地`);
};

const onRecord = () => {
  requireLogin("施工记录需要登录后查看您名下的工地");
};

const goLogin = () => {
  // #ifdef MP-WEIXIN
  uni.navigateTo({ url: "/pages/bind/index" });
  // #endif
  // #ifndef MP-WEIXIN
  uni.navigateTo({ url: "/pages/login/login?type=customer" });
  // #endif
};

const goBack = () => {
  let canBack = false;
  try {
    const fn = typeof getCurrentPages === "function" ? getCurrentPages : globalThis.getCurrentPages;
    canBack = typeof fn === "function" && (fn() || []).length > 1;
  } catch (_) {
    canBack = false;
  }
  if (canBack) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: "/pages/landing/index" });
  }
};
</script>

<style scoped>
.showcase {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 118px;
}

/* ==================== 导航栏 ==================== */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
}

.nav-back {
  font-size: 26px;
  font-weight: 300;
  width: 44px;
  line-height: 1;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.nav-login {
  width: 44px;
  text-align: right;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

/* ==================== 项目卡片 ==================== */
.hero-card {
  margin: 14px 16px 0;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.hero-cover {
  position: relative;
  width: 100%;
  height: 150px;
}

.hero-cover-img {
  width: 100%;
  height: 150px;
  display: block;
}

.demo-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.42);
  border-radius: 4px;
  padding: 3px 7px;
  letter-spacing: 0.5px;
}

.hero-info {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
}

.hero-title {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.hero-meta {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 14px;
}

.hero-progress {
  display: flex;
  align-items: center;
}

.bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #E8EEF6;
  overflow: hidden;
  margin-right: 10px;
}

.bar-fill {
  width: 65%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, #3B82F6, #1E3A5F);
}

.bar-text {
  font-size: 12px;
  font-weight: 600;
  color: #1E3A5F;
}

/* ==================== 通用区块 ==================== */
.section {
  padding: 22px 16px 0;
}

.section-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.section-sub {
  display: block;
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 14px;
}

/* ==================== 时间轴 ==================== */
.timeline {
  background: #fff;
  border-radius: 16px;
  padding: 18px 16px 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  margin-top: 8px;
}

.tl-item {
  display: flex;
  align-items: stretch;
}

.tl-rail {
  width: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.tl-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 3px;
  background: #E5E7EB;
  flex-shrink: 0;
}

.tl-dot.done {
  background: #10B981;
}

.tl-dot.doing {
  background: #F59E0B;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);
}

.tl-line {
  width: 2px;
  flex: 1;
  background: #E5E7EB;
  margin: 4px 0;
}

.tl-line.done {
  background: #10B981;
}

.tl-body {
  flex: 1;
  padding-bottom: 18px;
  display: flex;
  flex-direction: column;
}

.tl-head {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}

.tl-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
  margin-right: 8px;
}

.tl-state {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #F3F4F6;
  color: #6B7280;
}

.tl-state.done {
  background: #D1FAE5;
  color: #065F46;
}

.tl-state.doing {
  background: #FEF3C7;
  color: #92400E;
}

.tl-desc {
  font-size: 12px;
  color: #6B7280;
  line-height: 1.6;
  margin-bottom: 5px;
}

.tl-date {
  font-size: 11px;
  color: #C4C9D2;
}

/* ==================== 模块九宫格 ==================== */
.grid {
  display: flex;
  flex-wrap: wrap;
  background: #fff;
  border-radius: 16px;
  padding: 16px 8px 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.grid-item {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 18px;
}

.grid-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.grid-emoji {
  font-size: 20px;
  line-height: 1;
}

.grid-label {
  font-size: 12px;
  color: #374151;
}

/* ==================== 施工记录 ==================== */
.record {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.record-img {
  width: 76px;
  height: 58px;
  border-radius: 10px;
  margin-right: 12px;
  flex-shrink: 0;
}

.record-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.record-tag {
  font-size: 10px;
  color: #3B82F6;
  background: #EFF6FF;
  border-radius: 4px;
  padding: 2px 6px;
  align-self: flex-start;
  margin-bottom: 6px;
}

.record-title {
  font-size: 13px;
  font-weight: 500;
  color: #1A1F36;
  line-height: 1.5;
  margin-bottom: 4px;
}

.record-date {
  font-size: 11px;
  color: #C4C9D2;
}

/* ==================== 提示 ==================== */
.notice {
  margin: 20px 16px 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #EFF6FF;
}

.notice-text {
  font-size: 11px;
  line-height: 1.7;
  color: #1E40AF;
}

/* ==================== 底部固定栏 ==================== */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 50;
}

.btn-login {
  width: 100%;
  background: #1E3A5F;
  border-radius: 12px;
  padding: 14px 0;
  text-align: center;
  box-shadow: 0 4px 14px rgba(30, 58, 95, 0.22);
}

.btn-login-text {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.bottom-hint {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 8px;
}
</style>
