<template>
  <view class="login-page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">登录</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 背景 -->
    <view class="login-bg">
      <view class="brand-area">
        <view class="brand-logo">🏗️</view>
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
        </template>

        <!-- 客户登录 -->
        <template v-else>
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

      <!-- 角色展示 -->
      <view class="roles-demo" v-if="loginType === 'employee'">
        <text class="roles-label">系统角色</text>
        <view class="roles-row">
          <view class="role-chip" v-for="r in roles" :key="r">{{ r }}</view>
        </view>
      </view>

      <view class="roles-demo" v-else>
        <text class="roles-label" style="color: rgba(255,255,255,0.5);">输入您预约时登记的手机号码即可登录</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive } from "vue";

const loginType = ref('employee');
const loading = ref(false);

const empForm = reactive({
  username: '',
  password: '',
});

const custForm = reactive({
  phone: '',
  name: '',
});

const roles = ['管理员', '设计师', '工长', '监理', '业主', '主材', '财务', '助理'];

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
    const data = res.data;
    if (data.success && data.customer) {
      uni.setStorageSync('userInfo', data.customer);
      uni.setStorageSync('token', 'logged-in');
      uni.setStorageSync('userType', 'customer');
      // 客户 → 客户首页
      uni.switchTab({ url: '/pages/customer/home' });
    } else {
      uni.showToast({ title: data.message || '登录失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
};


const goBack = () => {
  uni.navigateBack();
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
  font-size: 56px;
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

.roles-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.role-chip {
  font-size: 11px;
  padding: 3px 10px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 20px;
  color: rgba(255,255,255,0.5);
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
