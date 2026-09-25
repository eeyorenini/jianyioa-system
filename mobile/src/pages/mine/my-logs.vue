<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的日志</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 日志列表 -->
    <scroll-view class="log-list" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>
      <view v-else-if="logs.length === 0" class="empty-state">
        <text class="empty-icon">📝</text>
        <text class="empty-text">暂无施工日志</text>
        <text class="empty-hint">在项目详情中可以提交施工日志</text>
      </view>
      <view v-else>
        <view class="log-item" v-for="log in logs" :key="log.id">
          <!-- 项目名称 -->
          <view class="log-project">{{ log.project_name || '项目' }}</view>
          
          <!-- 内容 -->
          <text class="log-content">{{ log.content || '暂无内容' }}</text>
          
          <!-- 照片 -->
          <view class="log-photos" v-if="getPhotos(log).length > 0">
            <view 
              class="photo-thumb" 
              v-for="(photo, idx) in getPhotos(log)" 
              :key="idx"
              @click="previewPhoto(log, idx)"
            >
              <image class="thumb-img" :src="photo" mode="aspectFill" />
            </view>
          </view>
          
          <!-- 底部信息 -->
          <view class="log-footer">
            <text class="log-time">{{ formatDate(log.created_at) }}</text>
            <text class="log-author">{{ log.operator || '未知' }}</text>
            <view class="log-actions">
              <text class="action-btn" @click="editLog(log)">编辑</text>
              <text class="action-btn delete" @click="deleteLog(log)">删除</text>
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
          <text class="modal-title">编辑日志</text>
          <text class="modal-close" @click="closeEditModal">×</text>
        </view>
        
        <!-- 项目名 -->
        <view class="edit-project">{{ editingLog?.project_name || '项目' }}</view>
        
        <!-- 内容编辑 -->
        <textarea 
          class="edit-textarea" 
          v-model="editContent" 
          placeholder="请输入日志内容"
          maxlength="500"
        ></textarea>
        
        <!-- 照片管理 -->
        <view class="photo-section">
          <view class="photo-label">现场照片</view>
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
    <!-- 隐藏canvas用于图片压缩 -->
    <canvas canvas-id="__compress_canvas_mylogs__" id="__compress_canvas_mylogs__" style="position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;"></canvas>
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useUserStore } from "@/stores/user";

const loading = ref(true);
const logs = ref([]);
const showEditModal = ref(false);
const userStore = useUserStore();
const editingLog = ref(null);
const editContent = ref('');
const editPhotos = ref([]);
const originalPhotosBeforeEdit = ref([]);
const removedPhotosInEdit = ref([]);

const fetchLogs = async () => {
  loading.value = true;
  try {
    const token = uni.getStorageSync('token');
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: '/api/my/logs',
      header: {
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),

      },
    });
    if (Array.isArray(res.data)) {
      // 只显示有内容的日志
      logs.value = res.data.filter(log => log.content);
    }
  } catch (e) {
    console.error('加载日志失败:', e);
  } finally {
    loading.value = false;
  }
};

// 解析照片JSON（处理双重编码）
const getPhotos = (log) => {
  if (!log.images) return [];
  try {
    let photosStr = log.images;
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
  const safe = String(dateStr).replace(/-/g, '/');
  const d = new Date(safe);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 编辑日志
const editLog = (log) => {
  editingLog.value = log;
  editContent.value = log.content || '';
  const existingPhotos = getPhotos(log);
  editPhotos.value = [...existingPhotos];
  // 记录编辑前的图片路径，用于计算删除了哪些
  originalPhotosBeforeEdit.value = existingPhotos;
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingLog.value = null;
  editContent.value = '';
  editPhotos.value = [];
  originalPhotosBeforeEdit.value = [];
  removedPhotosInEdit.value = [];
};

// 删除照片（编辑时标记删除，保存时才真正删服务器文件）
const removePhoto = (idx) => {
  const photo = editPhotos.value[idx];
  if (!photo) return;
  // 如果是服务端路径，移到待删除列表
  if (typeof photo === 'string' && photo.startsWith('/uploads/')) {
    removedPhotosInEdit.value.push(photo);
  }
  editPhotos.value.splice(idx, 1);
};

// 压缩图片（canvas压缩，最大边1920px，质量0.8）
const compressImage = (tempFilePath) => {
  return new Promise((resolve) => {
    uni.getImageInfo({
      src: tempFilePath,
      success: (info) => {
        const MAX = 1920;
        let { width, height } = info;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvasId = '__compress_canvas_mylogs__';
        let canvasNode = document.getElementById(canvasId);
        if (!canvasNode) {
          canvasNode = document.createElement('canvas');
          canvasNode.id = canvasId;
          canvasNode.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
          document.body.appendChild(canvasNode);
        }
        canvasNode.width = width;
        canvasNode.height = height;
        const ctx = uni.createCanvasContext(canvasId);
        ctx.drawImage(tempFilePath, 0, 0, width, height);
        ctx.draw(false, () => {
          uni.canvasToTempFilePath({
            canvasId: canvasId,
            fileType: 'jpg',
            quality: 0.8,
            success: (res) => resolve(res.tempFilePath),
            fail: () => resolve(tempFilePath),
          });
        });
      },
      fail: () => resolve(tempFilePath),
    });
  });
};

// 添加照片（编辑时追加新照片，使用系统压缩）
const addPhoto = () => {
  uni.chooseImage({
    count: 9 - editPhotos.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      for (const path of res.tempFilePaths) {
        if (editPhotos.value.length >= 9) break;
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
const previewPhoto = (log, idx) => {
  const photos = getPhotos(log);
  uni.previewImage({
    urls: photos,
    current: idx
  });
};

// 保存编辑
const saveEdit = async () => {
  if (!editContent.value.trim()) {
    uni.showToast({ title: '内容不能为空', icon: 'none' });
    return;
  }
  try {
    // 先删除被移除的照片文件
    if (removedPhotosInEdit.value.length > 0) {
      try {
        await uni.request({
          url: '/api/delete-images',
          method: 'POST',
          data: { paths: removedPhotosInEdit.value },
        });
      } catch (e) {
        console.error('删除图片文件失败:', e);
      }
    }
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/project-logs/${editingLog.value.id}`,
      method: 'PUT',
      header: { Authorization: token },
      data: {
        content: editContent.value,
        operator: editingLog.value.operator,
        images: editPhotos.value,
      },
    });
    if (res.data.message === '更新成功') {
      uni.showToast({ title: '保存成功', icon: 'success' });
      removedPhotosInEdit.value = [];
      closeEditModal();
      fetchLogs();
    } else {
      uni.showToast({ title: res.data.error || '保存失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '保存失败', icon: 'none' });
  }
};

// 删除日志
const deleteLog = (log) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条日志吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const token = uni.getStorageSync('token');
          const result = await uni.request({
            url: `/api/project-logs/${log.id}`,
            method: 'DELETE',
            header: { Authorization: token },
          });
          if (result.data.message === '删除成功') {
            uni.showToast({ title: '删除成功', icon: 'success' });
            fetchLogs();
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
  fetchLogs();
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

.log-list {
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

.log-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.log-project {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
  margin-bottom: 8px;
}

.log-content {
  display: block;
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  margin-bottom: 10px;
}

.log-photos {
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

.log-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #F5F7FA;
  font-size: 12px;
}

.log-time {
  color: #9CA3AF;
}

.log-author {
  color: #6B7280;
  flex: 1;
}

.log-actions {
  display: flex;
  gap: 12px;
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

.edit-textarea {
  width: 100%;
  height: 120px;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  padding: 12px;
  font-size: 14px;
  box-sizing: border-box;
  resize: none;
  margin-bottom: 16px;
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
