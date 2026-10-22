<template>
  <view class="scan-page">
    <view class="card">
      <!-- 绑定中 -->
      <view v-if="state === 'loading'" class="box">
        <view class="spinner"></view>
        <text class="title">正在绑定...</text>
        <text class="desc">请稍候，不要关闭小程序</text>
      </view>

      <!-- 绑定成功 -->
      <view v-else-if="state === 'success'" class="box">
        <view class="icon icon-ok">✓</view>
        <text class="title">绑定成功</text>
        <text class="desc">{{ employee.name }}<text v-if="employee.role_name"> · {{ employee.role_name }}</text></text>
        <text class="hint">{{ countdown }} 秒后进入工作台</text>
        <view class="btn" @click="goHome">
          <text class="btn-text">立即进入</text>
        </view>
      </view>

      <!-- 手动输入绑定码（小程序码生成失败时的降级通道） -->
      <view v-else-if="state === 'input'" class="box">
        <text class="title">输入绑定码</text>
        <text class="desc">请向管理员索取绑定码，或让管理员重新生成小程序码</text>
        <input
          class="code-input"
          v-model="ticketInput"
          placeholder="请输入 16 位绑定码"
          maxlength="32"
          confirm-type="done"
          @confirm="submitTicket"
        />
        <view class="btn" @click="submitTicket">
          <text class="btn-text">确认绑定</text>
        </view>
        <text class="link" @click="goLogin">用账号密码登录</text>
      </view>

      <!-- 绑定失败 -->
      <view v-else class="box">
        <view class="icon icon-err">!</view>
        <text class="title">绑定失败</text>
        <text class="desc">{{ errorMsg }}</text>
        <view class="btn" @click="goLanding">
          <text class="btn-text">返回首页</text>
        </view>
        <text class="link" @click="backToInput">重新输入绑定码</text>
      </view>
    </view>

    <text class="footer">简逸装饰 · 工地管理系统</text>
  </view>
</template>

<script setup>
import { ref, reactive } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { miniBindByTicket, saveEmployeeIdentity } from "@/utils/wechat";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();

// loading | input | success | error
const state = ref("loading");
const errorMsg = ref("");
const ticketInput = ref("");
const employee = reactive({ id: 0, name: "", role_name: "" });
const countdown = ref(3);
let timer = null;

/**
 * 从扫码参数里取 ticket。
 * - 小程序码：参数在 options.scene（URL 编码）
 * - 普通二维码（降级方案）：参数在 options.q 的 scene= 里
 */
function pickTicket(opt) {
  let scene = "";
  try {
    scene = decodeURIComponent(opt.scene || "");
  } catch (_) {
    scene = String(opt.scene || "");
  }
  if (!scene && opt.q) {
    try {
      const q = decodeURIComponent(opt.q);
      const m = q.match(/[?&]scene=([^&]+)/);
      if (m) scene = m[1];
    } catch (_) {
      /* 忽略 */
    }
  }
  return String(scene || "").trim();
}

function startCountdown() {
  countdown.value = 3;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      timer = null;
      goHome();
    }
  }, 1000);
}

const goHome = () => {
  if (timer) { clearInterval(timer); timer = null; }
  uni.switchTab({ url: "/pages/home/index" });
};

const goLanding = () => {
  uni.reLaunch({ url: "/pages/landing/index" });
};

const goLogin = () => {
  uni.reLaunch({ url: "/pages/login/login?type=employee" });
};

/** 执行绑定：扫码与手动输入共用同一条链路 */
async function doBind(ticket) {
  state.value = "loading";
  const r = await miniBindByTicket(ticket);
  if (r && r.success && r.employee) {
    saveEmployeeIdentity(r.employee);
    // storage 写完后必须回灌 store，否则本进程内 state 还是空的，
    // 跳首页后菜单/权限判定会按「未登录」渲染。
    userStore.loadUser();
    userStore.fetchMe();
    employee.id = r.employee.id || 0;
    employee.name = r.employee.name || "";
    employee.role_name = r.employee.role_name || "";
    state.value = "success";
    startCountdown();
  } else {
    state.value = "error";
    errorMsg.value = (r && r.message) || "绑定失败，请让管理员重新生成绑定码";
  }
}

/** 手动输入绑定码（小程序码生成失败时的降级通道） */
function submitTicket() {
  const t = String(ticketInput.value || "").trim();
  if (!t) {
    uni.showToast({ title: "请输入绑定码", icon: "none" });
    return;
  }
  doBind(t);
}

function backToInput() {
  ticketInput.value = "";
  state.value = "input";
}

onLoad((opt) => {
  const ticket = pickTicket(opt || {});
  if (!ticket) {
    // 没有扫码参数：降级为手动输入，而不是直接判失败
    state.value = "input";
    return;
  }
  doBind(ticket);
});

onUnload(() => {
  if (timer) { clearInterval(timer); timer = null; }
});
</script>

<style scoped>
.scan-page {
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
  padding: 36px 24px 30px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.box {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 加载圈 */
.spinner {
  width: 42px;
  height: 42px;
  border: 3px solid #E5E7EB;
  border-top-color: #1E3A5F;
  border-radius: 50%;
  margin-bottom: 22px;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 结果图标 */
.icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 20px;
}

.icon-ok {
  background: #10B981;
}

.icon-err {
  background: #EF4444;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 10px;
}

.desc {
  font-size: 13px;
  color: #6B7280;
  text-align: center;
  line-height: 1.7;
  margin-bottom: 8px;
  padding: 0 8px;
}

.hint {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 20px;
}

/* 手动输入绑定码 */
.code-input {
  width: 100%;
  margin: 8px 0 4px;
  padding: 13px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 10px;
  background: #F9FAFB;
  font-size: 16px;
  letter-spacing: 2px;
  text-align: center;
  color: #1A1F36;
  box-sizing: border-box;
}

.btn {
  width: 100%;
  background: #1E3A5F;
  border-radius: 12px;
  padding: 14px 0;
  text-align: center;
  margin-top: 14px;
}

.btn-text {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.link {
  font-size: 12px;
  color: #3B82F6;
  margin-top: 16px;
}

.footer {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 28px;
  letter-spacing: 0.5px;
}
</style>
