<template>
  <view class="phone-page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">绑定手机号</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="body">
      <view class="brand">
        <text class="brand-title">还差一步</text>
        <text class="brand-desc">请输入预约时登记的手机号，用于核对您名下的工地</text>
      </view>

      <view class="card" v-if="!checking">
        <view class="form-item">
          <text class="form-label">手机号</text>
          <input
            class="form-input"
            v-model="phone"
            type="number"
            maxlength="11"
            placeholder="请输入预约时登记的手机号"
            confirm-type="done"
            @keyup.enter="submit"
          />
        </view>
        <view class="btn-primary" :class="{ loading }" @click="submit">
          <text v-if="!loading">确认绑定</text>
          <text v-else>绑定中...</text>
        </view>
        <!-- 条款勾选 -->
        <view class="agree-row">
          <view class="agree-check" :class="{ checked: agreed }" @click="agreed = !agreed">
            <text v-if="agreed" class="agree-check-icon">✓</text>
          </view>
          <text class="agree-text">
            我已阅读并同意
            <text class="agree-link" @click.stop="goService">《用户服务协议》</text>
            和
            <text class="agree-link" @click.stop="goPrivacy">《隐私政策》</text>
          </text>
        </view>
        <text class="hint">仅用于核对项目归属，不会对外展示</text>
      </view>

      <view class="loading-box" v-else>
        <text class="loading-text">正在识别身份...</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { miniSilentLogin, miniBindPhone, saveCustomerIdentity } from "@/utils/wechat";

const phone = ref("");
const loading = ref(false);
const checking = ref(true);
const openid = ref("");
const agreed = ref(false);

onLoad(async () => {
  const r = await miniSilentLogin();
  if (!r || !r.success || !r.openid) {
    checking.value = false;
    uni.redirectTo({ url: "/pages/login/login?type=customer" });
    return;
  }
  // 已经绑过：直接进
  if (r.bound && r.customer) {
    saveCustomerIdentity(r);
    uni.reLaunch({ url: "/pages/customer/home" });
    return;
  }
  openid.value = r.openid;
  // 回填上次输入的手机号
  const saved = uni.getStorageSync("bindPhoneDraft");
  if (saved) phone.value = saved;
  checking.value = false;
});

const submit = async () => {
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意用户服务协议和隐私政策', icon: 'none', duration: 2000 });
    return;
  }
  const p = String(phone.value || "").trim();
  if (p.length !== 11) {
    uni.showToast({ title: "请输入 11 位手机号", icon: "none" });
    return;
  }
  if (!openid.value) {
    uni.showToast({ title: "微信身份已失效，请重新进入", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    const d = await miniBindPhone(openid.value, p);
    if (d && d.success) {
      uni.removeStorageSync("bindPhoneDraft");
      saveCustomerIdentity(d);
      uni.reLaunch({ url: "/pages/customer/home" });
    } else {
      uni.setStorageSync("bindPhoneDraft", p);
      uni.showToast({ title: (d && d.message) || "绑定失败", icon: "none", duration: 2500 });
    }
  } finally {
    loading.value = false;
  }
};

const goService = () => {
  uni.navigateTo({ url: '/pages/agreement/service' });
};

const goPrivacy = () => {
  uni.navigateTo({ url: '/pages/agreement/privacy' });
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
.phone-page {
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
  padding: 40px 24px;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 26px;
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

.form-item {
  margin-bottom: 18px;
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

.btn-primary.loading {
  opacity: 0.7;
}

.hint {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 14px;
  line-height: 1.6;
}

.loading-box {
  padding: 40px 0;
  text-align: center;
}

.loading-text {
  font-size: 13px;
  color: #6b7280;
}

/* 条款勾选 */
.agree-row {
  display: flex;
  align-items: flex-start;
  margin-top: 14px;
  margin-bottom: 6px;
}

.agree-check {
  width: 16px;
  height: 16px;
  border: 1.5px solid #9CA3AF;
  border-radius: 3px;
  margin-right: 8px;
  margin-top: 2px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agree-check.checked {
  background: #1E3A5F;
  border-color: #1E3A5F;
}

.agree-check-icon {
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.agree-text {
  font-size: 12px;
  color: #6B7280;
  line-height: 1.6;
}

.agree-link {
  color: #3B82F6;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
