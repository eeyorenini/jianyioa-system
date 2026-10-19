<template>
  <view class="landing">
    <!-- 品牌区 -->
    <view class="hero">
      <image class="hero-logo" src="/static/logo.png" mode="aspectFit" />
      <text class="hero-name">简逸装饰</text>
      <text class="hero-slogan">让业主随时看见工地</text>
      <text class="hero-sub">设计 · 施工 · 巡检 · 验收，全流程在线</text>
    </view>

    <!-- 能力介绍（纯展示，不请求接口，无需登录即可浏览） -->
    <view class="section">
      <text class="section-title">工地上的事，都能在这里看到</text>
      <view class="feature" v-for="(f, i) in features" :key="f.title">
        <view class="feature-no">{{ i + 1 }}</view>
        <view class="feature-body">
          <text class="feature-title">{{ f.title }}</text>
          <text class="feature-desc">{{ f.desc }}</text>
        </view>
      </view>
    </view>

    <!-- 登录入口：由用户主动点击，不自动弹出 -->
    <view class="action">
      <view class="btn-owner" @click="goOwnerLogin">
        <text class="btn-owner-text">{{ ownerBtnText }}</text>
      </view>
      <view class="btn-staff" @click="goLogin('employee')">
        <text class="btn-staff-text">员工登录</text>
      </view>
      <text class="action-hint">浏览本页无需登录，登录后可查看您名下的工地</text>
    </view>

    <!-- 底部信息 -->
    <view class="footer">
      <text class="footer-line">简逸装饰 · 工地管理系统</text>
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
  { title: "施工进度随时看", desc: "每个节点的开工、完工照片与记录，实时同步到手机" },
  { title: "巡检整改留痕", desc: "现场发现问题当场拍照，整改前后可对照" },
  { title: "材料采购透明", desc: "主材辅材的采购清单与进场记录，一笔一笔可查" },
];

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
  background: linear-gradient(160deg, #1E3A5F 0%, #2D5A8E 60%, #3B82F6 100%);
  padding: calc(48px + env(safe-area-inset-top)) 24px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 0 0 24px 24px;
}

.hero-logo {
  width: 72px;
  height: 72px;
  margin-bottom: 14px;
}

.hero-name {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 3px;
  margin-bottom: 10px;
}

.hero-slogan {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.hero-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 1px;
}

/* ==================== 能力介绍 ==================== */
.section {
  padding: 28px 20px 4px;
}

.section-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 16px;
}

.feature {
  display: flex;
  align-items: flex-start;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.feature-no {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #E8EEF6;
  color: #1E3A5F;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
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
  margin-bottom: 5px;
}

.feature-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #6B7280;
}

/* ==================== 登录入口 ==================== */
.action {
  padding: 20px 20px 8px;
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
