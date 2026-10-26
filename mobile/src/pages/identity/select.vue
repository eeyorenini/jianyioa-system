<template>
  <view class="select-page">
    <view class="card">
      <text class="title">选择进入身份</text>
      <text class="desc">这个微信同时绑定了员工和业主账号，请选择本次要进入的身份</text>

      <view
        class="role-item"
        v-for="it in list"
        :key="it.type"
        @click="enter(it)"
      >
        <view class="role-icon" :class="it.type === 'employee' ? 'is-emp' : 'is-cus'">
          <text class="role-icon-text">{{ it.type === 'employee' ? '员' : '业' }}</text>
        </view>
        <view class="role-body">
          <text class="role-name">{{ it.name || '未命名' }}</text>
          <text class="role-sub">{{ subOf(it) }}</text>
        </view>
        <text class="role-arrow">›</text>
      </view>

      <text class="link" @click="goLogin">用账号密码登录</text>
    </view>

    <text class="footer">简逸ERP · 工地管理系统</text>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { miniSilentLogin, saveEmployeeIdentity, saveCustomerIdentity } from "@/utils/wechat";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();
const list = ref([]);
// 完整的 mini-login 响应：业主登录要把它整体交给 saveCustomerIdentity，
// 因为里面才有 customer / isFamilyMember / masterCustomerId 这些旧字段。
const raw = ref(null);
let entered = false;

const subOf = (it) => {
  if (it.type === "employee") return it.role_name || it.position || "员工";
  return it.isFamilyMember ? "业主（家庭成员）" : "业主";
};

/** 真正落身份并跳转；员工走 TabBar 首页，业主走客户首页 */
function enter(it) {
  if (!it || entered) return;
  entered = true;
  uni.removeStorageSync("wxLoginResult");

  if (it.type === "employee") {
    saveEmployeeIdentity(it);
    // storage 写完后必须回灌 store，否则本进程内 state 还是空的，
    // 跳首页后菜单/权限会按「未登录」渲染（与 bind/scan.vue 同）。
    userStore.loadUser();
    userStore.fetchMe();
    uni.switchTab({ url: "/pages/home/index" });
    return;
  }

  saveCustomerIdentity(raw.value || {});
  uni.reLaunch({ url: "/pages/customer/home" });
}

onLoad(async () => {
  // 优先用登录页传过来的结果，避免重复打一次 jscode2session
  let r = uni.getStorageSync("wxLoginResult");
  if (!r || !Array.isArray(r.identities) || !r.identities.length) {
    r = await miniSilentLogin();
  }

  if (!r || !r.success || !Array.isArray(r.identities) || !r.identities.length) {
    uni.showToast({ title: "未识别到身份，请重新登录", icon: "none" });
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/login/login?type=employee" });
    }, 1200);
    return;
  }

  raw.value = r;
  list.value = r.identities;

  // 兜底：只有一个身份时不该停留在选择页
  if (r.identities.length === 1) enter(r.identities[0]);
});

const goLogin = () => {
  uni.removeStorageSync("wxLoginResult");
  uni.reLaunch({ url: "/pages/login/login?type=employee" });
};
</script>

<style scoped>
.select-page {
  min-height: 100vh;
  background: linear-gradient(160deg, #1E3A5F 0%, #2D5A8E 55%, #3B82F6 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.card {
  width: 100%;
  background: #fff;
  border-radius: 20px;
  padding: 32px 20px 24px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.title {
  display: block;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 8px;
}

.desc {
  display: block;
  text-align: center;
  font-size: 12px;
  color: #6B7280;
  line-height: 1.7;
  padding: 0 8px;
  margin-bottom: 22px;
}

.role-item {
  display: flex;
  align-items: center;
  padding: 14px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 12px;
  margin-bottom: 12px;
  background: #F9FAFB;
}

.role-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.is-emp {
  background: #1E3A5F;
}

.is-cus {
  background: #10B981;
}

.role-icon-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.role-body {
  flex: 1;
  margin-left: 14px;
  display: flex;
  flex-direction: column;
}

.role-name {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 3px;
}

.role-sub {
  font-size: 12px;
  color: #6B7280;
}

.role-arrow {
  font-size: 22px;
  color: #C0C4CC;
  font-weight: 300;
  margin-left: 8px;
}

.link {
  display: block;
  text-align: center;
  font-size: 12px;
  color: #3B82F6;
  margin-top: 14px;
}

.footer {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 28px;
  letter-spacing: 0.5px;
}
</style>
