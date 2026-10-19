<template>
  <view class="bind-page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">微信登录</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="body">
      <view class="brand">
        <text class="brand-title">完善您的资料</text>
        <text class="brand-desc">选择头像和昵称，方便设计师与项目经理识别您</text>
      </view>

      <view class="card" v-if="!checking">
        <!-- 头像 -->
        <view class="avatar-row">
          <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
            <image v-if="avatarLocal" class="avatar-img" :src="avatarLocal" mode="aspectFill" />
            <view v-else class="avatar-empty">
              <text class="avatar-plus">+</text>
            </view>
          </button>
          <view class="avatar-tip">
            <text class="tip-title">点击选择微信头像</text>
            <text class="tip-sub">{{ avatarLocal ? '已选择，点击可重新选择' : '可使用微信头像或相册图片' }}</text>
          </view>
        </view>

        <view class="divider"></view>

        <!-- 昵称 -->
        <view class="form-item">
          <text class="form-label">昵称</text>
          <input
            class="form-input"
            type="nickname"
            v-model="nickname"
            placeholder="点击填入微信昵称"
            maxlength="20"
            @blur="onNicknameBlur"
          />
        </view>

        <view class="btn-primary" :class="{ disabled: !ready || loading }" @click="submit">
          <text v-if="loading">登录中...</text>
          <text v-else-if="!ready">请先选择头像并填写昵称</text>
          <text v-else>登 录</text>
        </view>

        <text class="skip" @click="skip">跳过，先看看</text>
      </view>

      <view class="loading-box" v-else>
        <text class="loading-text">正在识别身份...</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { miniSilentLogin, miniSaveProfile, uploadAvatar, saveCustomerIdentity } from "@/utils/wechat";

const checking = ref(true);
const loading = ref(false);
const openid = ref("");
const nickname = ref("");
const avatarLocal = ref("");   // 本地临时路径，用于立即显示
const avatarUrl = ref("");     // 上传后的服务器地址，用于落库

// 头像和昵称都完成才允许登录
const ready = computed(() => !!avatarLocal.value && !!String(nickname.value || "").trim());

onLoad(async () => {
  const r = await miniSilentLogin();

  // 非微信环境拿不到 openid，退回手机号登录页
  if (!r || !r.success || !r.openid) {
    checking.value = false;
    uni.redirectTo({ url: "/pages/login/login?type=customer" });
    return;
  }

  // 已绑手机号：直接进客户首页，不再打扰
  if (r.bound && r.customer) {
    saveCustomerIdentity(r);
    uni.reLaunch({ url: "/pages/customer/home" });
    return;
  }

  openid.value = r.openid;
  // 回填已保存的资料，方便二次进入时直接登录
  if (r.nickname) nickname.value = r.nickname;
  if (r.avatar) {
    avatarLocal.value = r.avatar;
    avatarUrl.value = r.avatar;
  }
  checking.value = false;
});

// 选择头像：拿到临时路径后立刻上传换永久地址
const onChooseAvatar = async (e) => {
  const tmp = e && e.detail && e.detail.avatarUrl;
  if (!tmp) return;
  avatarLocal.value = tmp;
  const url = await uploadAvatar(tmp);
  if (url) avatarUrl.value = url;
  else uni.showToast({ title: "头像上传失败，可稍后重试", icon: "none" });
};

const onNicknameBlur = (e) => {
  const v = e && e.detail && e.detail.value;
  if (typeof v === "string") nickname.value = v;
};

const submit = async () => {
  if (!ready.value || loading.value) return;
  loading.value = true;
  try {
    const r = await miniSaveProfile(openid.value, nickname.value.trim(), avatarUrl.value);
    if (!r || !r.success) {
      uni.showToast({ title: (r && r.message) || "保存失败", icon: "none" });
      return;
    }
    uni.setStorageSync("wxProfile", {
      openid: openid.value,
      nickname: r.nickname || nickname.value.trim(),
      avatar: r.avatar || avatarUrl.value,
    });
    uni.reLaunch({ url: "/pages/customer/home" });
  } finally {
    loading.value = false;
  }
};

// 跳过：不保存资料直接进，符合「不得强制授权」的审核要求
const skip = () => {
  uni.reLaunch({ url: "/pages/customer/home" });
};

const goBack = () => {
  let canBack = false;
  try {
    const fn = typeof getCurrentPages === "function" ? getCurrentPages : globalThis.getCurrentPages;
    canBack = typeof fn === "function" && (fn() || []).length > 1;
  } catch (_) {
    canBack = false;
  }
  if (canBack) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/landing/index" });
};
</script>

<style scoped>
.bind-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e3a5f;
  color: #fff;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

.body {
  padding: 36px 24px;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.brand-title {
  font-size: 19px;
  font-weight: 600;
  color: #1a1f36;
  margin-bottom: 8px;
}

.brand-desc {
  font-size: 12px;
  line-height: 1.7;
  color: #6b7280;
  text-align: center;
}

.card {
  background: #fff;
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

/* 头像 */
.avatar-row {
  display: flex;
  align-items: center;
}

.avatar-btn {
  width: 72px;
  height: 72px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.avatar-btn::after {
  border: none;
}

.avatar-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
}

.avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.avatar-plus {
  font-size: 28px;
  color: #9ca3af;
  font-weight: 300;
}

.avatar-tip {
  margin-left: 16px;
  display: flex;
  flex-direction: column;
}

.tip-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1f36;
  margin-bottom: 4px;
}

.tip-sub {
  font-size: 11px;
  color: #9ca3af;
}

.divider {
  height: 1px;
  background: #f3f4f6;
  margin: 20px 0;
}

/* 昵称 */
.form-item {
  margin-bottom: 22px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  font-size: 15px;
  color: #1a1f36;
  background: #f9fafb;
  box-sizing: border-box;
  min-height: 48px;
}

/* 按钮 */
.btn-primary {
  background: #1e3a5f;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  padding: 14px 0;
  text-align: center;
  min-height: 48px;
  line-height: 20px;
}

.btn-primary.disabled {
  background: #cbd5e1;
  color: #f8fafc;
}

.skip {
  display: block;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 16px;
  padding: 6px 0;
}

.loading-box {
  padding: 40px 0;
  text-align: center;
}

.loading-text {
  font-size: 13px;
  color: #6b7280;
}
</style>
