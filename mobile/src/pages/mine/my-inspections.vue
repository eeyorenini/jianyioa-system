<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的巡检</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 巡检列表 -->
    <scroll-view class="inspect-list" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>
      <view v-else-if="inspections.length === 0" class="empty-state">
        <text class="empty-icon">🔍</text>
        <text class="empty-text">暂无巡检记录</text>
        <text class="empty-hint">在项目详情中可以提交巡检记录</text>
      </view>
      <view v-else>
        <view class="inspect-item" v-for="item in inspections" :key="item.id">
          <!-- 项目名称 -->
          <view class="inspect-project">{{ item.project_name || item.title || '项目' }}</view>
          
          <!-- 问题标题 -->
          <view class="inspect-title" v-if="item.title">
            {{ item.title }}
          </view>
          
          <!-- 问题描述 -->
          <view class="inspect-desc" v-if="item.description || item.issue_desc">
            {{ item.description || item.issue_desc }}
          </view>
          
          <!-- 问题分类和位置 -->
          <view class="inspect-meta">
            <text class="meta-tag" v-if="item.category">{{ item.category }}</text>
            <text class="meta-tag" v-if="item.location">📍 {{ item.location }}</text>
            <text class="meta-tag level" :class="`level-${item.level}`" v-if="item.level">
              {{ getLevelText(item.level) }}
            </text>
          </view>
          
          <!-- 照片 -->
          <view class="inspect-photos" v-if="getPhotos(item).length > 0">
            <view 
              class="photo-thumb" 
              v-for="(photo, idx) in getPhotos(item)" 
              :key="idx"
              @click="previewPhoto(item, idx)"
            >
              <image class="thumb-img" :src="photo" mode="aspectFill" />
            </view>
          </view>
          
          <!-- 底部信息 -->
          <view class="inspect-footer">
            <text class="inspect-time">{{ formatDate(item.created_at) }}</text>
            <text class="inspect-status" :class="`status-${item.status}`">{{ getStatusText(item.status) }}</text>
            <view class="inspect-actions">
              <text class="action-btn" @click="editInspect(item)">编辑</text>
              <text class="action-btn delete" @click="deleteInspect(item)">删除</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 编辑弹窗 -->
    <view class="modal" v-if="showEditModal">
      <view class="modal-mask" @click="closeEditModal"></view>
      <view class="modal-content">
        <view class="modal-header">
          <text class="modal-title">编辑巡检</text>
          <text class="modal-close" @click="closeEditModal">×</text>
        </view>
        
        <!-- 项目名 -->
        <view class="edit-project">{{ editingInspect?.project_name || editingInspect?.title || '项目' }}</view>
        
        <!-- 问题描述 -->
        <view class="form-item">
          <view class="form-label">问题描述</view>
          <textarea class="form-textarea" v-model="editDescription" placeholder="请输入问题描述" maxlength="300"></textarea>
        </view>
        
        <!-- 整改状态 -->
        <view class="form-item">
          <view class="form-label">整改状态</view>
          <view class="status-options">
            <view 
              class="status-option" 
              :class="{ active: editStatus === '待处理' }"
              @click="editStatus = '待处理'"
            >待处理</view>
            <view 
              class="status-option" 
              :class="{ active: editStatus === '处理中' }"
              @click="editStatus = '处理中'"
            >处理中</view>
            <view 
              class="status-option" 
              :class="{ active: editStatus === '已完成' }"
              @click="editStatus = '已完成'"
            >已完成</view>
          </view>
        </view>
        
        <!-- 照片管理 -->
        <view class="photo-section">
          <view class="photo-label">巡检照片</view>
          <view class="photo-grid">
            <view class="photo-item" v-for="(img, idx) in editPhotos" :key="idx">
              <image class="photo-img" :src="img" mode="aspectFill" />
              <view class="photo-del" @click="removePhoto(idx)">✕</view>
            </view>
            <view class="photo-add" @click="addPhoto">
              <text class="photo-add-icon">📷</text>
              <text class="photo-add-text">添加照片</text>
            </view>
          </view>
        </view>
        
        <!-- 提交按钮 -->
        <view class="modal-footer">
          <text class="btn btn-cancel" @click="closeEditModal">取消</text>
          <text class="btn btn-primary" @click="saveEdit">保存</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useUserStore } from "@/stores/user";

const loading = ref(true);
const inspections = ref([]);
const showEditModal = ref(false);
const userStore = useUserStore();
const editingInspect = ref(null);
const editDescription = ref('');
const editStatus = ref('待处理');
const editPhotos = ref([]);

const fetchInspections = async () => {
  loading.value = true;
  try {
    const token = uni.getStorageSync('token');
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: '/api/my/inspections',
      header: {
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),

      },
    });
    if (Array.isArray(res.data)) {
      inspections.value = res.data;
    }
  } catch (e) {
    console.error('加载巡检失败:', e);
  } finally {
    loading.value = false;
  }
};

// 解析照片JSON（处理双重编码）
const getPhotos = (item) => {
  if (!item.images) return [];
  try {
    let photosStr = item.images;
    let parsed = JSON.parse(photosStr);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim());
    }
    return [];
  } catch (e) {
    console.error('解析图片失败:', e);
    return [];
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getLevelText = (level) => {
  const map = { normal: '一般', serious: '严重', stop: '停工' };
  return map[level] || level || '';
};

const getStatusText = (status) => {
  const map = { '待处理': '待处理', '处理中': '处理中', '已完成': '已完成' };
  return map[status] || status || '待处理';
};

// 编辑巡检
const editInspect = (item) => {
  editingInspect.value = item;
  editDescription.value = item.description || item.issue_desc || '';
  editStatus.value = item.status || '待处理';
  editPhotos.value = [...getPhotos(item)];
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingInspect.value = null;
  editDescription.value = '';
  editPhotos.value = [];
};

// 删除照片
const removePhoto = (idx) => {
  editPhotos.value.splice(idx, 1);
};

// 添加照片
const addPhoto = () => {
  uni.chooseImage({
    count: 9 - editPhotos.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      for (const path of res.tempFilePaths) {
        try {
          const uploadRes = await uni.uploadFile({
            url: '/api/upload-image',
            filePath: path,
            name: 'file',
          });
          const data = JSON.parse(uploadRes.data);
          if (data.url) {
            editPhotos.value.push(data.url);
          }
        } catch (e) {
          console.error('上传失败:', e);
        }
      }
    }
  });
};

// 预览照片
const previewPhoto = (item, idx) => {
  const photos = getPhotos(item);
  uni.previewImage({
    urls: photos,
    current: idx
  });
};

// 保存编辑
const saveEdit = async () => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/rectification-issues/${editingInspect.value.id}`,
      method: 'PUT',
      header: { Authorization: token },
      data: {
        description: editDescription.value,
        remark: editDescription.value,
        status: editStatus.value,
        images: editPhotos.value,
      },
    });
    if (res.data.message === '更新成功') {
      uni.showToast({ title: '保存成功', icon: 'success' });
      closeEditModal();
      fetchInspections();
    } else {
      uni.showToast({ title: res.data.error || '保存失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '保存失败', icon: 'none' });
  }
};

// 删除巡检
const deleteInspect = (item) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条巡检记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const token = uni.getStorageSync('token');
          const result = await uni.request({
            url: `/api/rectification-issues/${item.id}`,
            method: 'DELETE',
            header: { Authorization: token },
          });
          if (result.data.message === '删除成功') {
            uni.showToast({ title: '删除成功', icon: 'success' });
            fetchInspections();
          } else {
            uni.showToast({ title: result.data.error || '删除失败', icon: 'none' });
          }
        } catch (e) {
          uni.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    }
  });
};

const goBack = () => {
  uni.navigateBack();
};

onMounted(() => {
  fetchInspections();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
}

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

.inspect-list {
  padding: 16px;
  height: calc(100vh - 60px);
}

.loading-state {
  text-align: center;
  padding: 60px;
  color: #9CA3AF;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: #9CA3AF;
}

.inspect-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.inspect-project {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
  margin-bottom: 6px;
}

.inspect-title {
  font-size: 14px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 6px;
}

.inspect-desc {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.5;
  margin-bottom: 8px;
}

.inspect-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.meta-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #F3F4F6;
  color: #6B7280;
}

.meta-tag.level-normal { background: #FEF3C7; color: #92400E; }
.meta-tag.level-serious { background: #FEE2E2; color: #991B1B; }
.meta-tag.level-stop { background: #EDE9FE; color: #7C3AED; }

.inspect-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.photo-thumb {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  overflow: hidden;
}

.thumb-img {
  width: 100%;
  height: 100%;
}

.inspect-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #F5F7FA;
  font-size: 12px;
}

.inspect-time {
  color: #9CA3AF;
}

.inspect-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: #FEF3C7;
  color: #92400E;
}

.inspect-status.status-已完成 {
  background: #D1FAE5;
  color: #065F46;
}

.inspect-status.status-处理中 {
  background: #DBEAFE;
  color: #1E40AF;
}

.inspect-actions {
  display: flex;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}

.action-btn {
  color: #1E3A5F;
  padding: 4px 8px;
}

.action-btn.delete {
  color: #EF4444;
}

/* 编辑弹窗 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.modal-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
}

.modal-content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 20px;
  max-height: 85vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #1A1F36;
}

.modal-close {
  font-size: 24px;
  color: #9CA3AF;
  padding: 0 8px;
}

.edit-project {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #F5F7FA;
  border-radius: 8px;
}

.form-item {
  margin-bottom: 16px;
}

.form-label {
  font-size: 13px;
  color: #6B7280;
  margin-bottom: 6px;
}

.form-textarea {
  width: 100%;
  height: 80px;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  box-sizing: border-box;
  resize: none;
}

.status-options {
  display: flex;
  gap: 10px;
}

.status-option {
  flex: 1;
  padding: 10px;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  text-align: center;
  font-size: 13px;
  color: #6B7280;
  background: #F9FAFB;
}

.status-option.active {
  border-color: #1E3A5F;
  background: #1E3A5F;
  color: #fff;
}

.photo-section {
  margin-bottom: 16px;
}

.photo-label {
  font-size: 13px;
  color: #6B7280;
  margin-bottom: 10px;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.photo-item {
  position: relative;
  width: 80px;
  height: 80px;
}

.photo-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
}

.photo-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  background: #EF4444;
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-add {
  width: 80px;
  height: 80px;
  border: 1px dashed #D1D5DB;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #F9FAFB;
}

.photo-add-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.photo-add-text {
  font-size: 11px;
  color: #9CA3AF;
}

.modal-footer {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn {
  flex: 1;
  padding: 14px;
  border-radius: 25px;
  font-size: 15px;
  text-align: center;
}

.btn-cancel {
  background: #F3F4F6;
  color: #6B7280;
}

.btn-primary {
  background: #1E3A5F;
  color: #fff;
}
</style>
