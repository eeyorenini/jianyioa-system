<template>
  <view class="login-page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">登录</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 背景 -->
    <view class="login-bg">
      <view class="brand-area">
        <image class="brand-logo" src="/static/logo.png" mode="aspectFit" />
        <text class="brand-name">简逸装饰</text>
        <text class="brand-sub">工地管理系统</text>
      </view>

      <!-- 登录表单 -->
      <view class="login-card">
        <!-- 身份切换 -->
        <view class="role-tabs">
          <view class="role-tab" :class="{ active: loginType === 'employee' }" @click="loginType = 'employee'">
            员工登录
          </view>
          <view class="role-tab" :class="{ active: loginType === 'customer' }" @click="loginType = 'customer'">
            客户登录
          </view>
        </view>

        <!-- 员工登录 -->
        <template v-if="loginType === 'employee'">
          <view class="form-item">
            <view class="form-label">用户名</view>
            <input
              class="form-input"
              v-model="empForm.username"
              placeholder="请输入用户名"
              confirm-type="next"
            />
          </view>
          <view class="form-item">
            <view class="form-label">密码</view>
            <input
              class="form-input"
              v-model="empForm.password"
              type="password"
              placeholder="请输入密码"
              confirm-type="done"
              @keyup.enter="handleEmployeeLogin"
            />
          </view>
          <view class="btn btn-primary btn-block" :class="{ loading: loading }" @click="handleEmployeeLogin">
            <text v-if="!loading">登 录</text>
            <text v-else>登录中...</text>
          </view>
          <!-- #ifdef MP-WEIXIN -->
          <!-- 员工微信绑定入口：管理员在 PC 员工列表生成小程序码，扫码直达；
               扫不了时从这里手动输入绑定码。绑过之后就不用再输账号密码。 -->
          <view class="bind-entry" @click="goEmployeeBind">
            <text class="bind-entry-text">已绑定微信？直接进入 · 手动输入绑定码</text>
          </view>
          <!-- #endif -->
        </template>

        <!-- 客户登录 -->
        <template v-else>
          <!-- #ifdef MP-WEIXIN -->
          <!-- 微信一键登录：静默拿 openid，已绑定直接进工地；未绑定再补手机号 -->
          <view class="wx-login-btn" @click="goWxLogin">
            <text class="wx-login-text">微信一键登录</text>
          </view>
          <view class="wx-split">
            <view class="wx-split-line"></view>
            <text class="wx-split-text">或使用预约手机号</text>
            <view class="wx-split-line"></view>
          </view>
          <!-- #endif -->
          <view class="form-item">
            <view class="form-label">手机号</view>
            <input
              class="form-input"
              v-model="custForm.phone"
              type="number"
              maxlength="11"
              placeholder="请输入注册手机号"
              confirm-type="next"
            />
          </view>
          <view class="form-item">
            <view class="form-label">姓名（可选）</view>
            <input
              class="form-input"
              v-model="custForm.name"
              placeholder="请输入您的姓名"
              confirm-type="done"
              @keyup.enter="handleCustomerLogin"
            />
          </view>
          <view class="btn btn-primary btn-block" :class="{ loading: loading }" @click="handleCustomerLogin">
            <text v-if="!loading">登 录</text>
            <text v-else>登录中...</text>
          </view>
        </template>
      </view>

      <!-- 版本号（构建时从 package.json 注入） -->
      <view class="roles-demo" v-if="loginType === 'employee'">
        <text class="app-version">v{{ APP_VERSION }}</text>
      </view>

      <view class="roles-demo" v-else>
        <text class="roles-label" style="color: rgba(255,255,255,0.5);">输入您预约时登记的手机号码即可登录</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import { bindOpenidQuietly } from "@/utils/wechat";

// 默认「客户登录」：业主是主要使用者，进页面就能看到微信一键登录；
// 员工从落地页「员工登录」进入时会带 ?type=employee 自动切回员工 tab。
const loginType = ref('customer');
const loading = ref(false);

// 支持从落地页带身份进入：?type=customer / ?type=employee
onLoad((opt) => {
  if (opt && (opt.type === 'customer' || opt.type === 'employee')) {
    loginType.value = opt.type;
  }
});

// 版本号由 vite.config.ts 的 define 在构建时注入（来源：package.json 的 version）
const APP_VERSION = __APP_VERSION__;

const empForm = reactive({
  username: '',
  password: '',
});

const custForm = reactive({
  phone: '',
  name: '',
});

// 员工登录
const handleEmployeeLogin = async () => {
  if (!empForm.username.trim() || !empForm.password.trim()) {
    uni.showToast({ title: '请输入用户名和密码', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const res = await uni.request({
      url: '/api/employees/login',
      method: 'POST',
      data: { username: empForm.username, password: empForm.password },
    });
    const data = res.data;
    if (data.success && data.user) {
      const userStore = useUserStore();
      userStore.setUser({ ...data.user, token: 'logged-in' });
      uni.setStorageSync('userInfo', data.user);
      uni.setStorageSync('token', 'logged-in');
      uni.setStorageSync('userType', 'employee');
      // 员工 → TabBar 首页
      uni.switchTab({ url: '/pages/home/index' });
    } else {
      uni.showToast({ title: data.message || '用户名或密码错误', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 员工微信绑定：进扫码落地页，没有扫码参数时该页会显示手动输入框
const goEmployeeBind = () => {
  uni.navigateTo({ url: '/pages/bind/scan' });
};

// 客户登录
const handleCustomerLogin = async () => {
  if (!custForm.phone.trim()) {
    uni.showToast({ title: '请输入手机号', icon: 'none' });
    return;
  }
  if (custForm.phone.length !== 11) {
    uni.showToast({ title: '手机号格式不正确', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const res = await uni.request({
      url: '/api/customers/login',
      method: 'POST',
      data: { phone: custForm.phone, name: custForm.name },
    });
    console.log('登录响应:', res);
    const data = res.data;
    console.log('data:', data);
    if (data && data.success && data.customer) {
      // 保存用户信息
      uni.setStorageSync('userInfo', data.customer);
      uni.setStorageSync('token', 'logged-in');
      uni.setStorageSync('userType', 'customer');
      // 如果是家庭成员，额外保存主账户ID和手机号用于查项目和消息
      if (data.isFamilyMember && data.masterCustomerId) {
        uni.setStorageSync('masterCustomerId', data.masterCustomerId);
        // 保存主账户手机号用于消息查询
        uni.setStorageSync('masterPhone', data.masterCustomer?.phone || '');
      } else {
        uni.removeStorageSync('masterCustomerId');
        uni.removeStorageSync('masterPhone');
      }
      // 客户 → 客户首页（不用 switchTab，因为不在 tabBar）
      // 小程序端顺手把当前微信 openid 绑上，下次进入免输手机号（失败不影响登录）
      bindOpenidQuietly(custForm.phone);
      uni.reLaunch({ url: '/pages/customer/home' });
    } else {
      uni.showToast({ title: data?.message || '登录失败', icon: 'none' });
    }
  } catch (e) {
    console.error('登录错误:', e);
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
};


// 微信一键登录：跳绑定页（该页会先静默登录，已绑定直接进工地，未绑定才要手机号）
const goWxLogin = () => {
  uni.navigateTo({ url: '/pages/bind/index' });
};

const goBack = () => {
  // 登录页可能作为启动页（栈底），此时 navigateBack 无效 → 回落地页
  // 微信审核要求登录环节必须提供有效的「取消/返回」途径
  let canBack = false;
  try {
    const fn =
      typeof getCurrentPages === "function"
        ? getCurrentPages
        : globalThis.getCurrentPages;
    canBack = typeof fn === "function" && (fn() || []).length > 1;
  } catch (_) {
    canBack = false;
  }
  if (canBack) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: '/pages/landing/index' });
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #F5F7FA;
}

.login-bg {
  min-height: 100vh;
  background: linear-gradient(160deg, #1E3A5F 0%, #2D5A8E 50%, #3B82F6 100%);
  padding: 60px 24px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand-area {
  text-align: center;
  margin-bottom: 40px;
  color: #fff;
}

.brand-logo {
  width: 80px;
  height: 80px;
  margin-bottom: 12px;
}

.brand-name {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.brand-sub {
  display: block;
  font-size: 13px;
  color: rgba(255,255,255,0.65);
  letter-spacing: 1px;
}

.login-card {
  width: 100%;
  background: #fff;
  border-radius: 20px;
  padding: 28px 24px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  margin-bottom: 30px;
}

/* 身份切换 */
.role-tabs {
  display: flex;
  background: #F5F7FA;
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 20px;
}

.role-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  color: #6B7280;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.role-tab.active {
  background: #1E3A5F;
  color: #fff;
}

/* 微信一键登录（仅小程序端出现） */
.wx-login-btn {
  background: #07C160;
  border-radius: 10px;
  padding: 14px 0;
  text-align: center;
  min-height: 48px;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.22);
}

.wx-login-text {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.wx-split {
  display: flex;
  align-items: center;
  margin: 18px 0 16px;
}

.wx-split-line {
  flex: 1;
  height: 1px;
  background: #E5E7EB;
}

.wx-split-text {
  font-size: 11px;
  color: #9CA3AF;
  padding: 0 10px;
  letter-spacing: 0.5px;
}

.form-item {
  margin-bottom: 18px;
}

.form-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 8px;
  display: block;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid #E5E7EB;
  border-radius: 10px;
  font-size: 15px;
  color: #1A1F36;
  box-sizing: border-box;
  min-height: 48px;
  background: #F9FAFB;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #1E3A5F;
  background: #fff;
}

.btn {
  display: block;
  width: calc(100% - 0px);
  margin: 0;
}

.btn-primary {
  background: #1E3A5F;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  padding: 14px 0;
  text-align: center;
  min-height: 48px;
  line-height: 48px;
  transition: opacity 0.2s;
}

.btn-primary.loading {
  opacity: 0.7;
}

.btn-block {
  width: 100%;
  margin-top: 8px;
}

/* 员工微信绑定入口 */
.bind-entry {
  text-align: center;
  padding: 14px 0 4px;
}

.bind-entry-text {
  font-size: 12px;
  color: #3B82F6;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.roles-demo {
  text-align: center;
  color: rgba(255,255,255,0.5);
}

.roles-label {
  display: block;
  font-size: 11px;
  margin-bottom: 10px;
  letter-spacing: 1px;
}

/* 版本号：原先这里是「系统角色」+ 8 个角色 chip，现改为版本号 */
.app-version {
  display: block;
  font-size: 11px;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.45);
}
/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
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
</style>
