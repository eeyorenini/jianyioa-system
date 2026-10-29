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
        <image class="brand-logo" src="/static/logo.png" mode="aspectFit" />
        <text class="brand-name">简逸ERP</text>
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
          <!-- #ifdef MP-WEIXIN -->
          <!-- 微信一键登录：静默拿 openid，命中已绑定的员工直接进工作台，不用输密码 -->
          <view class="wx-login-btn" @click="handleEmployeeWxLogin">
            <text class="wx-login-text">微信一键登录</text>
          </view>
          <view class="wx-split">
            <view class="wx-split-line"></view>
            <text class="wx-split-text">或使用账号密码</text>
            <view class="wx-split-line"></view>
          </view>
          <!-- #endif -->
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
          <!-- #ifdef MP-WEIXIN -->
          <!-- 降级通道：小程序码扫不了/已过期时，手动输管理员给的 16 位绑定码 -->
          <view class="bind-entry" @click="goEmployeeBind">
            <text class="bind-entry-text">扫不了码？手动输入绑定码</text>
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
              placeholder="请输入预约登记的手机号"
              confirm-type="next"
            />
          </view>
          <view class="form-item">
            <view class="form-label">验证码</view>
            <view class="code-row">
              <input
                class="form-input code-input"
                v-model="custForm.code"
                type="number"
                maxlength="6"
                placeholder="6 位验证码"
                confirm-type="done"
                @confirm="handleCustomerLogin"
              />
              <view
                class="code-btn"
                :class="{ 'code-btn-disabled': sending || counting > 0 }"
                @click="sendCode"
              >
                <text v-if="sending">发送中</text>
                <text v-else-if="counting > 0">{{ counting }}s 后重发</text>
                <text v-else>获取验证码</text>
              </view>
            </view>
          </view>
          <view class="btn btn-primary btn-block" :class="{ loading: loading }" @click="handleCustomerLogin">
            <text v-if="!loading">登 录</text>
            <text v-else>登录中...</text>
          </view>
          <!-- 没有项目时的出口（常驻）：
               短信登录只会认「已在本公司建档的手机号」，销售还没建档的新客户必然登录失败。
               不给出口的话用户只会以为系统坏了。将来这块会扩成主动引导（客户开发客户），
               所以文案里把「销售 / 设计师」两个角色都点明，方便对方找人。 -->
          <view class="no-project-tip">
            <text class="no-project-tip-text">未查询到项目？请联系为您服务的销售人员或设计师为您添加</text>
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
        </template>
      </view>

      <!-- 版本号（构建时从 package.json 注入，与小程序一致） -->
      <view class="roles-demo" v-if="loginType === 'employee'">
        <text class="app-version">v{{ APP_VERSION }}</text>
      </view>

      <view class="roles-demo" v-else>
        <text class="roles-label" style="color: rgba(255,255,255,0.5);">输入预约登记的手机号，获取短信验证码登录</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, reactive } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import { bindOpenidQuietly, miniSilentLogin, saveEmployeeIdentity } from "@/utils/wechat";

// 默认「客户登录」
const loginType = ref('customer');
const loading = ref(false);
const agreed = ref(false);

// 支持从落地页带身份进入：?type=customer / ?type=employee
onLoad((opt) => {
  if (opt && (opt.type === 'customer' || opt.type === 'employee')) {
    loginType.value = opt.type;
  }
});

// 版本号由 vite.config.ts 的 define 在构建时注入
const APP_VERSION = __APP_VERSION__;

const empForm = reactive({
  username: '',
  password: '',
});

const custForm = reactive({
  phone: '',
  code: '',
});

// 验证码发送状态
const sending = ref(false);
const counting = ref(0);
let countTimer = null;

// 离开页面时清掉倒计时，避免定时器泄漏
onUnload(() => {
  if (countTimer) {
    clearInterval(countTimer);
    countTimer = null;
  }
});

// 校验是否已同意条款
const checkAgreed = () => {
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意用户服务协议和隐私政策', icon: 'none', duration: 2000 });
    return false;
  }
  return true;
};

// 员工登录
const handleEmployeeLogin = async () => {
  if (!checkAgreed()) return;
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

// 员工微信一键登录：静默拿 openid → 后端按 wechat_users.employee_id 识别身份
// → 只有一个员工身份就直接进工作台；员工+业主双身份交给选择页。
// 全程不出现密码，也不依赖那张一次性绑定码（绑定码只在首次绑定时用）。
const handleEmployeeWxLogin = async () => {
  if (!checkAgreed()) return;
  if (loading.value) return;
  loading.value = true;
  try {
    const r = await miniSilentLogin();
    if (!r || !r.success) {
      uni.showToast({ title: '微信登录失败，请用账号密码登录', icon: 'none' });
      return;
    }

    const ids = Array.isArray(r.identities) ? r.identities : [];
    const emps = ids.filter((i) => i.type === 'employee');
    const custs = ids.filter((i) => i.type === 'customer');

    // 这个微信没绑员工：区分"是业主"和"完全没绑"，给的提示不一样
    if (!emps.length) {
      uni.showToast({
        title: custs.length
          ? '该微信是业主账号，请切到客户登录'
          : '该微信未绑定员工，请联系管理员',
        icon: 'none',
      });
      return;
    }

    // 纯员工身份：直接进
    if (emps.length === 1 && !custs.length) {
      saveEmployeeIdentity(emps[0]);
      const userStore = useUserStore();
      userStore.loadUser();
      userStore.fetchMe();
      uni.switchTab({ url: '/pages/home/index' });
      return;
    }

    // 双身份（如既是员工又是业主）：让用户选，避免串到客户首页
    uni.setStorageSync('wxLoginResult', r);
    uni.navigateTo({ url: '/pages/identity/select' });
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

// 发送登录验证码（v2.5.2：业主端改为手机号 + 短信验证码，不再只凭手机号登录）
const sendCode = async () => {
  if (sending.value || counting.value > 0) return;
  if (!checkAgreed()) return;
  const phone = String(custForm.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
    return;
  }
  sending.value = true;
  try {
    const res = await uni.request({
      url: '/api/customer-auth/send-code',
      method: 'POST',
      data: { phone },
    });
    const data = res.data || {};
    if (data.success) {
      uni.showToast({ title: '验证码已发送', icon: 'none' });
      // 60 秒倒计时，与后端重发间隔保持一致，避免用户点了必失败
      counting.value = 60;
      if (countTimer) clearInterval(countTimer);
      countTimer = setInterval(() => {
        counting.value -= 1;
        if (counting.value <= 0) {
          clearInterval(countTimer);
          countTimer = null;
        }
      }, 1000);
    } else {
      uni.showToast({ title: data.message || '发送失败', icon: 'none' });
    }
  } catch (e) {
    console.error('发送验证码失败:', e);
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    sending.value = false;
  }
};

// 把登录结果写进本地存储（主账户 / 副账户通用）
//
// v2.5.3 项目级授权：副账户的 customer.id 是**自己那条 family_members.id**，
// 前端同时注入 x-user-scope: member（见 App.vue），后端见到它只查家庭成员表、
// 跳过 customers，从根上避开 family_members.id 与 customers.id 的撞号。
// 副账户能看到哪些项目由服务端按项目授权算，不由前端决定。
const saveCustomerSession = (data) => {
  uni.setStorageSync('userInfo', data.customer);
  uni.setStorageSync('token', 'logged-in');
  uni.setStorageSync('userType', 'customer');
  if (data.isFamilyMember && data.masterCustomerId) {
    uni.setStorageSync('masterCustomerId', data.masterCustomerId);
    uni.setStorageSync('masterPhone', (data.masterCustomer && data.masterCustomer.phone) || '');
    if (data.familyMemberId) uni.setStorageSync('familyMemberId', data.familyMemberId);
  } else {
    uni.removeStorageSync('masterCustomerId');
    uni.removeStorageSync('masterPhone');
    uni.removeStorageSync('familyMemberId');
  }
};

// 家庭成员确认查看项目（服务端用一次性 bindToken 认人，前端造不出来）
const confirmBindFamily = async (bindToken) => {
  try {
    const r = await uni.request({
      url: '/api/family-members/confirm-bind',
      method: 'POST',
      data: { bindToken },
    });
    const d = r.data || {};
    if (d.success && d.customer) {
      saveCustomerSession(d);
      const n = Number(d.boundCount || 0);
      uni.showToast({ title: n > 1 ? `已加入 ${n} 个项目` : '已确认', icon: 'success' });
      setTimeout(() => uni.reLaunch({ url: '/pages/customer/home' }), 700);
      return true;
    }
    uni.showToast({ title: d.message || '确认失败，请重新登录', icon: 'none' });
    return false;
  } catch (e) {
    console.error('确认查看项目失败:', e);
    uni.showToast({ title: '网络错误', icon: 'none' });
    return false;
  }
};

// 有待确认的项目邀请时弹窗
//
// 为什么必须让本人点一次：业主在家庭成员页只填了手机号，填错一位数字就可能把陌生人
// 拉进项目（能看到地址、施工进度、合同金额）。所以绑定动作只能由本人在验证码登录后确认。
//
// v2.5.3 项目级授权：一次列出**全部**待确认项目，点一次确认全部绑定，
// 不再为每个项目各弹一次（一个人可能同时被几个项目邀请）。
const promptBindFamily = (data) => new Promise((resolve) => {
  const list = Array.isArray(data.pendingProjects) ? data.pendingProjects : [];
  const fam = data.family || {};
  const masterName = fam.masterName || '家人';
  const relText = fam.relation ? `以「${fam.relation}」身份` : '';

  let content;
  if (list.length > 1) {
    const names = list.map((p, i) => `${i + 1}. ${p.projectName || '未命名项目'}`).join('\n');
    content = `${masterName} 邀请您${relText}查看以下 ${list.length} 个项目：\n${names}\n\n确认后可查看施工进度、验收记录。`;
  } else if (list.length === 1) {
    content = `${masterName} 邀请您${relText}查看项目「${list[0].projectName || '未命名项目'}」，确认后可查看施工进度、验收记录。`;
  } else {
    content = `${masterName} 邀请您${relText}查看项目，确认后可查看施工进度。`;
  }

  uni.showModal({
    title: '确认查看项目',
    content,
    confirmText: '确认查看',
    cancelText: '暂不查看',
    success: (res) => {
      if (!res.confirm) {
        // 取消 = 这次邀请作废，用户此时**一个可见项目都没有**。
        // 只 toast 一句就留在原地会让人以为系统坏了，必须说清楚下一步找谁。
        // 登录态不落库（没绑定就没有身份），但验证码已用掉，所以提示「稍后可重新登录」。
        uni.showModal({
          title: '已取消',
          content: '您暂时无法查看项目进度。如需查看，请联系为您服务的销售人员或设计师为您添加，之后重新登录并点「确认查看」即可。',
          showCancel: false,
          confirmText: '知道了',
        });
        resolve(false);
        return;
      }
      confirmBindFamily(data.bindToken).then(resolve);
    },
    fail: () => resolve(false),
  });
});

// 客户登录：手机号 + 验证码
const handleCustomerLogin = async () => {
  if (!checkAgreed()) return;
  const phone = String(custForm.phone || '').trim();
  const code = String(custForm.code || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    uni.showToast({ title: '请输入 6 位验证码', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    const res = await uni.request({
      url: '/api/customer-auth/login-by-code',
      method: 'POST',
      data: { phone, code },
    });
    const data = res.data || {};

    // 被业主登记为家庭成员、但本人还没确认过 → 先弹窗，确认后才拿身份
    if (data.success && data.needBindFamily) {
      loading.value = false;
      await promptBindFamily(data);
      return;
    }

    if (data.success && data.customer) {
      saveCustomerSession(data);

      // 主账号也可能被别人邀请（比如同时是另一套房子的家属）→ 提醒但不拦。
      // 待确认的项目确认前没有任何权限，所以这里只提示一句，不阻塞进首页。
      const pending = Array.isArray(data.pendingProjects) ? data.pendingProjects : [];
      if (pending.length) {
        uni.showToast({
          title: `另有 ${pending.length} 个项目邀请待确认`,
          icon: 'none',
          duration: 2500,
        });
      }

      // 客户 → 客户首页（不用 switchTab，因为不在 tabBar）
      // 小程序端顺手把当前微信 openid 绑上，下次进入免输手机号（失败不影响登录）
      bindOpenidQuietly(phone);
      uni.reLaunch({ url: '/pages/customer/home' });
    } else {
      // 三种「进不去」要分开说，否则用户分不清是自己号码错了还是销售还没建档：
      //   ① 完全没登记（没客户档案、也没被邀请）→ 找销售
      //   ② 被邀请但没确认 → 理论上走上面的 needBindFamily 分支，走不到这里
      //   ③ 其他（验证码错、验证码过期等）→ 照后端原文
      const msg = data.message || '登录失败';
      if (data.code === 'NO_PROJECT' || /未登记|未查询到/.test(msg)) {
        uni.showModal({
          title: '暂无可查看的项目',
          content: '未查询到您名下的装修项目。如果您在本公司确有装修工程，请联系为您服务的销售人员或设计师为您添加。',
          showCancel: false,
          confirmText: '知道了',
        });
      } else {
        uni.showToast({ title: msg, icon: 'none' });
      }
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
  if (!checkAgreed()) return;
  uni.navigateTo({ url: '/pages/bind/index' });
};

const goService = () => {
  uni.navigateTo({ url: '/pages/agreement/service' });
};

const goPrivacy = () => {
  uni.navigateTo({ url: '/pages/agreement/privacy' });
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
/* 2026-10-26 改版：原来是整宽 48px 高的大色块，大而拙。
   改成居中胶囊小按钮（190x42），视觉更轻，点击区域仍够手指用。 */
.wx-login-btn {
  width: 190px;
  height: 42px;
  margin: 2px auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #12D06E 0%, #07C160 100%);
  border-radius: 21px;
  box-shadow: 0 2px 8px rgba(7, 193, 96, 0.24);
}

.wx-login-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
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

/* 验证码行：输入框 + 右侧获取按钮 */
.code-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
}
.code-input {
  flex: 1;
  min-width: 0;
}
.code-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 104px;
  padding: 0 14px;
  border-radius: 10px;
  background: #1E3A5F;
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.5px;
  min-height: 48px;
  box-sizing: border-box;
}
.code-btn-disabled {
  background: #C9CFD8;
  color: #fff;
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

/* 条款勾选 */
.agree-row {
  display: flex;
  align-items: flex-start;
  margin-top: 16px;
  padding: 0 4px;
}

/* 无项目出口：红字，看到就有反应，不藏在灰字里 */
.no-project-tip {
  margin-top: 14px;
  padding: 0 4px;
  text-align: center;
}

.no-project-tip-text {
  font-size: 12px;
  line-height: 1.6;
  color: #E54D42;
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
