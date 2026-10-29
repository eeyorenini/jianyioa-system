<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">家庭成员</text>
      <!-- 只有主账户才能添加家庭成员 -->
      <view class="nav-btn" v-if="canManage" @click="showAddModal">添加</view>
      <view v-else class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 家庭成员列表 -->
    <view v-else class="page-content">
      <view class="family-intro">
        <text class="intro-text" v-if="canManage">家庭成员可共享查看项目装修进度。添加后请让 TA 用该手机号登录并确认，确认后才正式加入。</text>
        <text class="intro-text" v-else>您是这个家庭的家庭成员，可查看家里的装修进度。成员由主账号管理。</text>
      </view>

      <!-- 成员列表 -->
      <view class="member-list" v-if="members.length > 0">
        <view class="member-card"
              v-for="member in members"
              :key="member.id"
              :class="{ 'is-pending': member.is_master === 0 && !member.is_bound }">
          <view class="member-avatar" :class="{ master: member.is_master === 1 }">
            {{ getAvatarText(member.name) }}
          </view>
          <view class="member-info">
            <view class="member-header">
              <!-- 主账号：姓名后紧跟「（主账号）」 -->
              <text class="member-name">{{ member.name }}</text>
              <text class="master-suffix" v-if="member.is_master === 1">（主账号）</text>
              <view class="member-badges">
                <view class="badge pending" v-if="member.is_master === 0 && !member.is_bound">待加入</view>
                <view class="badge relation" v-else-if="member.is_master === 0 && member.relation">{{ member.relation }}</view>
                <view class="badge me" v-if="member.is_self && member.is_master === 0">我</view>
              </view>
            </view>
            <text class="member-phone">{{ member.phone }}</text>
            <!-- v2.5.3 项目级授权：被授权的项目逐条列出，让业主一眼看清「这个人能看哪几套房」 -->
            <view class="member-projects" v-if="member.is_master === 0 && member.projects && member.projects.length">
              <text class="project-chip" v-for="pj in member.projects" :key="pj.id">{{ pj.name }}</text>
            </view>
            <text class="member-hint" v-if="canManage && member.is_master === 0 && !member.is_bound">还没登录确认，暂不能查看项目</text>
          </view>
          <view class="member-actions" v-if="canDelete(member)">
            <text class="delete-btn" @click="deleteMember(member)">移除</text>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty-state">
        <text class="empty-icon">👨‍👩‍👧</text>
        <text class="empty-text">暂无家庭成员</text>
        <text class="empty-hint" v-if="canManage">点击右上角"添加"邀请家人加入</text>
      </view>
    </view>

    <!-- 添加成员弹窗 -->
    <view class="modal-mask" v-if="showModal" @click="closeModal">
      <view class="modal-content" @click.stop>
        <view class="modal-header">
          <text class="modal-title">添加家庭成员</text>
          <text class="modal-close" @click="closeModal">✕</text>
        </view>
        <view class="modal-body">
          <view class="form-item">
            <text class="form-label">姓名</text>
            <input class="form-input" v-model="formData.name" placeholder="请输入成员姓名" maxlength="30" />
          </view>
          <view class="form-item">
            <text class="form-label">手机号</text>
            <input class="form-input" v-model="formData.phone" type="number" placeholder="请输入手机号" maxlength="11" />
            <text class="field-tip">手机号是唯一认证标识，请填写对方正在使用的号码</text>
          </view>
          <view class="form-item">
            <text class="form-label">关系</text>
            <picker class="form-picker" mode="selector" :range="relationOptions" @change="onRelationChange">
              <view class="picker-value" :class="{ picked: !!formData.relation }">{{ formData.relation || '请选择关系' }}</view>
            </picker>
          </view>
          <!-- 项目级授权：名下有多个项目时必须选一个；只有一个项目时自动带，不显示这一行 -->
          <view class="form-item" v-if="myProjects.length > 1">
            <text class="form-label">可查看项目</text>
            <picker class="form-picker" mode="selector" :range="projectNames" @change="onProjectChange">
              <view class="picker-value" :class="{ picked: !!formData.projectName }">{{ formData.projectName || '请选择项目' }}</view>
            </picker>
            <text class="field-tip">TA 只能看到你选中的这个项目，其他项目看不到</text>
          </view>
          <view class="bind-note">
            <text class="bind-note-text">添加后，TA 用这个手机号登录时会看到「XX 邀请您查看某个项目」的确认提示，确认后才能看到该项目的装修进度。</text>
          </view>
        </view>
        <view class="modal-footer">
          <button class="btn-cancel" @click="closeModal">取消</button>
          <button class="btn-confirm" @click="submitAdd" :disabled="!canSubmit || submitting">{{ submitting ? '添加中...' : '添加' }}</button>
        </view>
      </view>
    </view>

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";

const loading = ref(true);
const members = ref([]);
const showModal = ref(false);
const submitting = ref(false);
// 当前登录者能不能管理成员（只有主账号能增删改，服务端也拦了）
const canManage = ref(false);

// 表单数据
const formData = ref({
  name: '',
  phone: '',
  relation: '',
  projectId: 0,
  projectName: ''
});

// 我名下可以授权的项目（项目级授权：成员只能看被指定的那一个）
const myProjects = ref([]);
const projectNames = computed(() => myProjects.value.map((p) => p.name || `项目${p.id}`));

// 关系选项
const relationOptions = ['配偶', '父母', '子女', '兄弟姐妹', '其他'];

// 计算属性：是否可以提交
const canSubmit = computed(() => {
  const base = !!formData.value.name.trim() &&
    formData.value.phone.length === 11 &&
    /^1[3-9]\d{9}$/.test(formData.value.phone);
  if (!base) return false;
  // 多个项目必须选一个；只有一个项目由后端自动带
  if (myProjects.value.length > 1 && !formData.value.projectId) return false;
  return true;
});

// 判断是否可以删除：主账号 + 不是主账号行 + 不是虚拟行（id 为 'master'）
// 待加入的成员也可以移除（业主填错号码时要能撤回来）
const canDelete = (member) => {
  if (!canManage.value) return false;
  if (member.is_master === 1) return false;
  if (typeof member.id !== 'number') return false;
  return true;
};

// 获取头像文字
const getAvatarText = (name) => {
  if (!name) return '?';
  return String(name).substring(0, 1);
};

// 获取家庭成员列表
// 身份（x-user-id / x-user-type / x-user-scope）由 App.vue 的请求拦截器统一注入，
// 这里不再手拼 x-customer-id —— 服务端已不采信客户端传来的客户 id。
const loadMembers = async () => {
  loading.value = true;
  try {
    const res = await uni.request({ url: '/api/family-members' });
    if (res.statusCode === 401) {
      uni.showToast({ title: '请先登录业主账号', icon: 'none' });
      members.value = [];
      return;
    }
    const data = Array.isArray(res.data) ? res.data : [];
    members.value = data;
    // can_manage 由服务端下发（副账户一律 false），前端不自己猜
    canManage.value = data.some((m) => m.can_manage === true);
  } catch (e) {
    console.error('加载家庭成员失败:', e);
    members.value = [];
    canManage.value = false;
  } finally {
    loading.value = false;
  }
};

// 拉取「我名下可授权的项目」
// 只有主账号需要（副账号不能添加成员，取到空也无所谓）
const loadMyProjects = async () => {
  try {
    const res = await uni.request({ url: '/api/projects' });
    const data = Array.isArray(res.data) ? res.data : [];
    myProjects.value = data.map((p) => ({ id: Number(p.id), name: p.name || '' }));
    // 只有一个项目时直接带进表单，界面上就不用让业主再选一次
    if (myProjects.value.length === 1) {
      formData.value.projectId = myProjects.value[0].id;
      formData.value.projectName = myProjects.value[0].name;
    }
  } catch (e) {
    console.error('加载我的项目失败:', e);
    myProjects.value = [];
  }
};

// 显示添加弹窗
const showAddModal = () => {
  const auto = myProjects.value.length === 1 ? myProjects.value[0] : null;
  formData.value = {
    name: '',
    phone: '',
    relation: '',
    projectId: auto ? auto.id : 0,
    projectName: auto ? auto.name : ''
  };
  showModal.value = true;
};

// 关闭弹窗
const closeModal = () => {
  showModal.value = false;
};

// 选择关系
const onRelationChange = (e) => {
  const index = e.detail.value;
  formData.value.relation = relationOptions[index];
};

// 选择可授权项目
const onProjectChange = (e) => {
  const index = Number(e.detail.value);
  const p = myProjects.value[index];
  if (p) {
    formData.value.projectId = p.id;
    formData.value.projectName = p.name;
  }
};

// 提交添加
const submitAdd = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  uni.showLoading({ title: '添加中...' });
  try {
    const res = await uni.request({
      url: '/api/family-members',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        name: formData.value.name.trim(),
        phone: formData.value.phone.trim(),
        relation: formData.value.relation,
        project_id: formData.value.projectId || undefined
      }
    });
    const d = res.data || {};
    if (res.statusCode === 200 && d.success) {
      uni.showToast({ title: d.updated ? '已更新该成员' : '已添加，待对方登录确认', icon: 'none' });
      closeModal();
      loadMembers();
    } else {
      // 后端可能回「请选择要授权的项目」并附项目列表，直接用它的文案
      uni.showToast({ title: d.error || d.message || '添加失败', icon: 'none' });
    }
  } catch (e) {
    console.error('添加失败:', e);
    uni.showToast({ title: '添加失败', icon: 'none' });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
};

// 删除成员
const deleteMember = (member) => {
  const pjCount = (member.projects && member.projects.length) || 0;
  const tip = member.is_bound
    ? (pjCount > 1
        ? `移除后，「${member.name}」将无法再查看您名下全部 ${pjCount} 个项目。`
        : `移除后，「${member.name}」将无法再查看本项目的装修进度。`)
    : `确定不再邀请「${member.name}」查看项目吗？`;
  uni.showModal({
    title: '确认移除',
    content: tip,
    confirmText: '移除',
    success: async (res) => {
      if (res.confirm) await confirmDelete(member);
    }
  });
};

// 确认删除
const confirmDelete = async (member) => {
  uni.showLoading({ title: '处理中...' });
  try {
    const res = await uni.request({
      url: `/api/family-members/${member.id}`,
      method: 'DELETE'
    });
    const d = res.data || {};
    if (res.statusCode === 200 && d.success) {
      uni.showToast({ title: '已移除', icon: 'success' });
      loadMembers();
    } else {
      uni.showToast({ title: d.error || d.message || '移除失败', icon: 'none' });
    }
  } catch (e) {
    console.error('删除失败:', e);
    uni.showToast({ title: '移除失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 页面加载
onMounted(async () => {
  await loadMembers();
  // 只有主账号需要项目列表（添加成员时要指定授权哪个项目）
  if (canManage.value) loadMyProjects();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 70px;
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

.nav-btn {
  font-size: 15px;
  color: #fff;
  padding: 4px 12px;
  background: rgba(255,255,255,0.2);
  border-radius: 6px;
}

/* 加载状态 */
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  color: #9CA3AF;
}

/* 内容 */
.page-content {
  padding: 16px;
}

/* 说明文字 */
.family-intro {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.intro-text {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.5;
}

/* 成员列表 */
.member-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.member-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9CA3AF, #6B7280);
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.member-avatar.master {
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
}

.member-info {
  flex: 1;
}

.member-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.member-name {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
}

.member-badges {
  display: flex;
  gap: 6px;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.badge.master {
  background: #DBEAFE;
  color: #1E40AF;
}

.badge.relation {
  background: #F3F4F6;
  color: #6B7280;
}

/* 「（主账号）」紧跟姓名，做成弱化的后缀而不是彩色 badge */
.master-suffix {
  font-size: 12px;
  color: #1E40AF;
  margin-left: 2px;
}

/* 待加入：还没登录确认过的成员 */
.badge.pending {
  background: #FEF3C7;
  color: #B45309;
}

/* 副账户列表里标出「我」 */
.badge.me {
  background: #DCFCE7;
  color: #15803D;
}

/* 待加入的成员整行弱化，和已加入的区分开 */
.member-card.is-pending {
  background: #FAFAFA;
}

.member-card.is-pending .member-avatar {
  opacity: 0.6;
}

.member-hint {
  display: block;
  font-size: 11px;
  color: #D97706;
  margin-top: 4px;
}

/* 被授权的项目标签（项目级授权：一个人可以看多套房） */
.member-projects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.project-chip {
  font-size: 11px;
  color: #1D4ED8;
  background: #EFF6FF;
  border: 1px solid #DBEAFE;
  border-radius: 4px;
  padding: 2px 6px;
  line-height: 16px;
}

.member-phone {
  font-size: 13px;
  color: #9CA3AF;
}

.member-actions {
  display: flex;
  gap: 8px;
}

.delete-btn {
  font-size: 13px;
  color: #EF4444;
  padding: 6px 12px;
  background: #FEF2F2;
  border-radius: 6px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
  background: #fff;
  border-radius: 14px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 13px;
  color: #9CA3AF;
}

/* 弹窗 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.modal-content {
  width: 100%;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid #F0F0F0;
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #1A1F36;
}

.modal-close {
  font-size: 20px;
  color: #9CA3AF;
  padding: 4px;
}

.modal-body {
  padding: 20px;
}

.form-item {
  margin-bottom: 18px;
}

.form-label {
  font-size: 14px;
  color: #374151;
  margin-bottom: 8px;
  display: block;
}

.form-input {
  width: 100%;
  height: 46px;
  background: #F9FAFB;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 15px;
  color: #1A1F36;
  box-sizing: border-box;
}

.form-picker {
  width: 100%;
  height: 46px;
  background: #F9FAFB;
  border-radius: 10px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.picker-value {
  font-size: 15px;
  color: #9CA3AF;
}

.picker-value.picked {
  color: #1A1F36;
}

/* 字段下方的小字说明 */
.field-tip {
  display: block;
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 6px;
  line-height: 1.5;
}

/* 弹窗底部的绑定说明块 */
.bind-note {
  background: #EFF6FF;
  border-radius: 8px;
  padding: 10px 12px;
}

.bind-note-text {
  font-size: 12px;
  color: #1D4ED8;
  line-height: 1.6;
}

.form-hint {
  margin-top: 8px;
}

.form-hint text {
  font-size: 12px;
  color: #9CA3AF;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
}

.btn-cancel, .btn-confirm {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.btn-cancel {
  background: #F3F4F6;
  color: #6B7280;
}

.btn-confirm {
  background: #1E3A5F;
  color: #fff;
}

.btn-confirm[disabled] {
  background: #D1D5DB;
  color: #9CA3AF;
}
</style>
