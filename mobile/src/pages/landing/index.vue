<template>
  <view class="landing">
    <!-- ==================== 品牌区 ==================== -->
    <view class="hero">
      <image class="hero-bg" src="/static/landing/hero-bg.jpg" mode="aspectFill" />
      <view class="hero-mask"></view>
      <view class="hero-body">
        <view class="hero-logo-wrap">
          <image class="hero-logo" src="/static/logo.png" mode="aspectFit" />
        </view>
        <text class="hero-name">简逸ERP</text>
        <text class="hero-slogan">让业主随时看见工地</text>
        <text class="hero-sub">设计 · 施工 · 巡检 · 验收，全流程在线</text>

        <view class="hero-cta" @click="goShowcase">
          <text class="hero-cta-text">先逛逛 · 看个样板工地</text>
          <text class="hero-cta-arrow">›</text>
        </view>
        <text class="hero-hint">无需登录，可直接浏览</text>
      </view>
    </view>

    <!-- ==================== 能力介绍 ==================== -->
    <view class="section">
      <text class="section-title">工地上的事，都能看到</text>
      <text class="section-sub">从开工到交付，每个环节都留痕</text>
      <view class="feature" v-for="f in features" :key="f.title">
        <image class="feature-img" :src="f.img" mode="aspectFit" />
        <view class="feature-body">
          <text class="feature-title">{{ f.title }}</text>
          <text class="feature-desc">{{ f.desc }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 施工实况（横滑） ==================== -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">施工过程，全程留痕</text>
        <text class="section-more" @click="goShowcase">看更多 ›</text>
      </view>
      <scroll-view class="cases" scroll-x :show-scrollbar="false">
        <view class="case" v-for="c in cases" :key="c.title" @click="goShowcase">
          <image class="case-img" :src="c.img" mode="aspectFill" />
          <view class="case-cap">
            <text class="case-tag">{{ c.tag }}</text>
            <text class="case-title">{{ c.title }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 三步用起来 ==================== -->
    <view class="section">
      <text class="section-title">三步，就能看到自己家</text>
      <view class="steps">
        <view class="step" v-for="(s, i) in steps" :key="s.title">
          <view class="step-no">{{ i + 1 }}</view>
          <view class="step-body">
            <text class="step-title">{{ s.title }}</text>
            <text class="step-desc">{{ s.desc }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 登录入口 ==================== -->
    <view class="action">
      <view class="btn-owner" @click="goOwnerLogin">
        <text class="btn-owner-text">{{ ownerBtnText }}</text>
      </view>
      <view class="btn-staff" @click="goLogin('employee')">
        <text class="btn-staff-text">员工登录</text>
      </view>
      <text class="action-hint">浏览本页与样板工地无需登录，登录后可查看您名下的真实工地</text>
    </view>

    <!-- ==================== 底部信息 ==================== -->
    <view class="footer">
      <text class="footer-line">简逸ERP · 工地管理系统</text>
      <text class="footer-line">咨询请联系您的专属设计师或项目经理</text>
      <text class="footer-version">v{{ APP_VERSION }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";

// 版本号由 vite.config.ts 的 define 在构建时注入（来源：package.json 的 version）
const APP_VERSION = __APP_VERSION__;

// 业主入口在两端语义不同：小程序是微信一键登录，H5 是手机号登录
const ownerBtnText = ref("业主登录 · 查看我的工地");
// #ifdef MP-WEIXIN
ownerBtnText.value = "微信一键登录 · 查看我的工地";
// #endif

const features = [
  {
    img: "/static/landing/feat-progress.jpg",
    title: "施工进度随时看",
    desc: "每个节点的开工、完工照片与记录，实时同步到手机",
  },
  {
    img: "/static/landing/feat-inspect.jpg",
    title: "巡检整改留痕",
    desc: "现场发现问题当场拍照，整改前后可对照",
  },
  {
    img: "/static/landing/feat-material.jpg",
    title: "材料采购透明",
    desc: "主材辅材的采购清单与进场记录，一笔一笔可查",
  },
];

const cases = [
  { img: "/static/landing/case-plumbing.jpg", tag: "水电阶段", title: "管线开槽布线" },
  { img: "/static/landing/case-tiling.jpg", tag: "泥瓦阶段", title: "瓷砖铺贴验收" },
  { img: "/static/landing/case-living.jpg", tag: "完工实景", title: "客厅硬装完成" },
];

const steps = [
  { title: "微信授权", desc: "一键登录，不用记密码" },
  { title: "绑定手机号", desc: "核对预约时登记的手机号" },
  { title: "查看工地", desc: "进度、照片、整改一目了然" },
];

// 游客体验页：纯静态样板数据，不请求任何接口，无需登录
const goShowcase = () => {
  uni.navigateTo({ url: "/pages/showcase/index" });
};

// 登录页支持 ?type=customer / ?type=employee 预设身份
const goLogin = (type) => {
  uni.navigateTo({ url: `/pages/login/login?type=${type}` });
};

// 业主入口：小程序走微信静默登录（已绑定直接进，未绑定再补手机号）；
// H5 没有 wx.login，走手机号登录页。
const goOwnerLogin = () => {
  // #ifdef MP-WEIXIN
  uni.navigateTo({ url: "/pages/bind/index" });
  // #endif
  // #ifndef MP-WEIXIN
  uni.navigateTo({ url: "/pages/login/login?type=customer" });
  // #endif
};

onShow(() => {
  // 已登录用户不再停留在介绍页，直接进入各自首页
  if (!uni.getStorageSync("token")) return;
  if (uni.getStorageSync("userType") === "customer") {
    uni.reLaunch({ url: "/pages/customer/home" });
  } else {
    uni.switchTab({ url: "/pages/home/index" });
  }
});
</script>

<style scoped>
.landing {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 24px;
}

/* ==================== 品牌区 ==================== */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 0 0 26px 26px;
  background: #1E3A5F;
}

.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.hero-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, rgba(16, 31, 51, 0.45) 0%, rgba(16, 31, 51, 0.15) 45%, rgba(16, 31, 51, 0.55) 100%);
}

.hero-body {
  position: relative;
  padding: calc(62px + env(safe-area-inset-top)) 24px 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-logo-wrap {
  width: 66px;
  height: 66px;
  border-radius: 17px;
  background: #fff;
  padding: 3px;
  box-sizing: border-box;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-logo {
  width: 100%;
  height: 100%;
  border-radius: 14px;
}

.hero-name {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 4px;
  margin-bottom: 10px;
}

.hero-slogan {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.94);
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.hero-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  letter-spacing: 1px;
  margin-bottom: 26px;
}

.hero-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 13px 30px;
  border-radius: 30px;
  background: #FFFFFF;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.hero-cta-text {
  font-size: 15px;
  font-weight: 600;
  color: #1E3A5F;
  letter-spacing: 1px;
}

.hero-cta-arrow {
  font-size: 18px;
  font-weight: 600;
  color: #1E3A5F;
  margin-left: 6px;
  line-height: 1;
}

.hero-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 12px;
  letter-spacing: 0.5px;
}

/* ==================== 通用区块 ==================== */
.section {
  padding: 26px 20px 2px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.section-head .section-title {
  margin-bottom: 0;
}

.section-sub {
  display: block;
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 16px;
}

.section-more {
  font-size: 12px;
  color: #3B82F6;
}

/* ==================== 能力卡片 ==================== */
.feature {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16px;
  padding: 15px 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.feature-img {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  margin-right: 14px;
  flex-shrink: 0;
}

.feature-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.feature-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 6px;
}

.feature-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #6B7280;
}

/* ==================== 施工实况 ==================== */
.cases {
  width: 100%;
  white-space: nowrap;
}

.case {
  display: inline-block;
  width: 210px;
  margin-right: 12px;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  vertical-align: top;
}

.case:last-child {
  margin-right: 0;
}

.case-img {
  width: 210px;
  height: 150px;
  display: block;
}

.case-cap {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
}

.case-tag {
  font-size: 10px;
  color: #3B82F6;
  background: #EFF6FF;
  border-radius: 4px;
  padding: 2px 6px;
  align-self: flex-start;
  margin-bottom: 6px;
}

.case-title {
  font-size: 13px;
  font-weight: 500;
  color: #1A1F36;
}

/* ==================== 三步引导 ==================== */
.steps {
  background: #fff;
  border-radius: 16px;
  padding: 6px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.step {
  display: flex;
  align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid #F3F4F6;
}

.step:last-child {
  border-bottom: none;
}

.step-no {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1E3A5F;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.step-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.step-title {
  font-size: 13px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 4px;
}

.step-desc {
  font-size: 12px;
  color: #9CA3AF;
  line-height: 1.5;
}

/* ==================== 登录入口 ==================== */
.action {
  padding: 26px 20px 8px;
  display: flex;
  flex-direction: column;
}

.btn-owner {
  background: #1E3A5F;
  border-radius: 12px;
  padding: 15px 0;
  text-align: center;
  box-shadow: 0 4px 14px rgba(30, 58, 95, 0.22);
}

.btn-owner-text {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.btn-staff {
  background: #fff;
  border: 1.5px solid #D6DEE9;
  border-radius: 12px;
  padding: 14px 0;
  text-align: center;
  margin-top: 12px;
}

.btn-staff-text {
  color: #1E3A5F;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 1px;
}

.action-hint {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 14px;
  line-height: 1.6;
}

/* ==================== 底部 ==================== */
.footer {
  padding: 28px 24px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.footer-line {
  font-size: 11px;
  color: #9CA3AF;
  line-height: 1.8;
  letter-spacing: 0.5px;
}

.footer-version {
  font-size: 11px;
  color: #C4C9D2;
  letter-spacing: 1px;
  margin-top: 10px;
}
</style>
