<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">家庭成员</text>
      <!-- 只有主账户才能添加家庭成员 -->
      <view class="nav-btn" v-if="isMasterAccount" @click="showAddModal">添加</view>
      <view v-else class="nav-placeholder"></view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 家庭成员列表 -->
    <view v-else class="page-content">
      <view class="family-intro">
        <text class="intro-text">家庭成员可共享查看项目装修进度，主账户可管理家庭成员</text>
      </view>

      <!-- 成员列表 -->
      <view class="member-list" v-if="members.length > 0">
        <view class="member-card" v-for="member in members" :key="member.id">
          <view class="member-avatar" :class="{ master: member.is_master === 1 }">
            {{ getAvatarText(member.name) }}
          </view>
          <view class="member-info">
            <view class="member-header">
              <text class="member-name">{{ member.name }}</text>
              <view class="member-badges">
                <!-- 副账户看时：is_master=1显示"主账户"，is_master=0显示关系 -->
                <view class="badge master" v-if="!isMaster && member.is_master === 1">主账户</view>
                <view class="badge relation" v-if="!isMaster && member.is_master === 0 && member.relation">{{ member.relation }}</view>
                <!-- 主账户看时：显示关系 -->
                <view class="badge relation" v-if="isMaster && member.relation && member.relation !== '本人'">{{ member.relation }}</view>
              </view>
            </view>
            <text class="member-phone">{{ member.phone }}</text>
          </view>
          <view class="member-actions" v-if="canDelete(member)">
            <text class="delete-btn" @click="deleteMember(member)">删除</text>
          </view>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty-state">
        <text class="empty-icon">👨‍👩‍👧</text>
        <text class="empty-text">暂无家庭成员</text>
        <text class="empty-hint">点击右上角"添加"邀请家人加入</text>
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
            <input class="form-input" v-model="formData.name" placeholder="请输入成员姓名" />
          </view>
          <view class="form-item">
            <text class="form-label">手机号</text>
            <input class="form-input" v-model="formData.phone" type="number" placeholder="请输入手机号" maxlength="11" />
          </view>
          <view class="form-item">
            <text class="form-label">关系</text>
            <picker class="form-picker" mode="selector" :range="relationOptions" @change="onRelationChange">
              <view class="picker-value">{{ formData.relation || '请选择关系' }}</view>
            </picker>
          </view>
        </view>
        <view class="modal-footer">
          <button class="btn-cancel" @click="closeModal">取消</button>
          <button class="btn-confirm" @click="submitAdd" :disabled="!canSubmit">添加</button>
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
const customerId = ref(0);
const currentPhone = ref('');
// 当前登录者是否是主账户（用于控制是否显示"主账户"标签）
const isMaster = ref(false);
// 是否是主账户账号（用于控制添加按钮）
const isMasterAccount = ref(false);

// 表单数据
const formData = ref({
  name: '',
  phone: '',
  relation: ''
});

// 关系选项
const relationOptions = ['配偶', '父母', '子女', '兄弟姐妹', '其他'];

// 计算属性：是否可以提交
const canSubmit = computed(() => {
  return formData.value.name.trim() && 
         formData.value.phone.length === 11 &&
         /^1[3-9]\d{9}$/.test(formData.value.phone);
});

// 判断是否可以删除（主账户可以删除非主账户成员）
const canDelete = (member) => {
  // 不能删除自己（主账户）
  if (member.is_master === 1) return false;
  return true;
};

// 获取头像文字
const getAvatarText = (name) => {
  if (!name) return '?';
  return name.substring(0, 1);
};

// 获取家庭成员列表
const loadMembers = async () => {
  loading.value = true;
  
  try {
    const userInfo = uni.getStorageSync('userInfo');
    // 家庭成员用主账户ID查，主账户用自己的ID
    const masterCustomerId = uni.getStorageSync('masterCustomerId');
    const effectiveCustomerId = masterCustomerId || userInfo?.id;
    
    if (userInfo?.id) {
      customerId.value = userInfo.id;
    }
    
    // 判断是否是主账户（有masterCustomerId说明是副账户，没有则是主账户）
    isMasterAccount.value = !masterCustomerId;
    
    const res = await uni.request({
      url: '/api/family-members',
      header: {
        'x-customer-id': effectiveCustomerId
      }
    });
    
    if (Array.isArray(res.data)) {
      members.value = res.data;
      // 判断当前登录者是否是主账户（用于显示"主账户"标签）
      // 用手机号匹配当前登录者，因为 customer_id 对于副账户来说是主账户的ID
      const currentPhone = userInfo?.phone;
      const currentMember = res.data.find(m => m.phone === currentPhone);
      isMaster.value = currentMember?.is_master === 1;
    } else {
      members.value = [];
      isMaster.value = false;
    }
  } catch (e) {
    console.error('加载家庭成员失败:', e);
    members.value = [];
    isMaster.value = false;
    isMasterAccount.value = false;
  } finally {
    loading.value = false;
  }
};

// 显示添加弹窗
const showAddModal = () => {
  formData.value = { name: '', phone: '', relation: '' };
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

// 提交添加
const submitAdd = async () => {
  if (!canSubmit.value) return;
  
  uni.showLoading({ title: '添加中...' });
  
  try {
    const userInfo = uni.getStorageSync('userInfo');
    // 家庭成员用主账户ID添加
    const masterCustomerId = uni.getStorageSync('masterCustomerId');
    const effectiveCustomerId = masterCustomerId || userInfo?.id;
    
    const res = await uni.request({
      url: '/api/family-members',
      method: 'POST',
      header: {
        'x-customer-id': effectiveCustomerId,
        'Content-Type': 'application/json'
      },
      data: {
        name: formData.value.name.trim(),
        phone: formData.value.phone.trim(),
        relation: formData.value.relation
      }
    });
    
    if (res.data.success || res.statusCode === 200) {
      uni.showToast({ title: '添加成功', icon: 'success' });
      closeModal();
      loadMembers();
    } else {
      uni.showToast({ title: res.data.error || '添加失败', icon: 'none' });
    }
  } catch (e) {
    console.error('添加失败:', e);
    uni.showToast({ title: '添加失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
};

// 删除成员
const deleteMember = (member) => {
  uni.showModal({
    title: '确认删除',
    content: `确定要删除成员"${member.name}"吗？`,
    success: async (res) => {
      if (res.confirm) {
        await confirmDelete(member);
      }
    }
  });
};

// 确认删除
const confirmDelete = async (member) => {
  uni.showLoading({ title: '删除中...' });
  
  try {
    const userInfo = uni.getStorageSync('userInfo');
    // 家庭成员用主账户ID删除
    const masterCustomerId = uni.getStorageSync('masterCustomerId');
    const effectiveCustomerId = masterCustomerId || userInfo?.id;
    
    const res = await uni.request({
      url: `/api/family-members/${member.id}`,
      method: 'DELETE',
      header: {
        'x-customer-id': effectiveCustomerId
      }
    });
    
    if (res.data.success || res.statusCode === 200) {
      uni.showToast({ title: '删除成功', icon: 'success' });
      loadMembers();
    } else {
      uni.showToast({ title: res.data.error || '删除失败', icon: 'none' });
    }
  } catch (e) {
    console.error('删除失败:', e);
    uni.showToast({ title: '删除失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 页面加载
onMounted(() => {
  loadMembers();
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
