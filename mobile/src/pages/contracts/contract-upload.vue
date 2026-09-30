<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">上传合同</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting }">提交</text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-section-title">合同信息</view>

      <!-- 项目选择 -->
      <view class="form-item">
        <text class="form-label">项目</text>
        <view class="picker-value" :class="{ placeholder: !selectedProject }" @click="showProjectPicker">
          {{ selectedProject?.name || '请选择项目' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 合同金额 -->
      <view class="form-item">
        <text class="form-label">合同金额 *</text>
        <input class="form-input" v-model="form.contract_amount" type="digit" placeholder="¥0.00" />
      </view>

      <!-- 合同附件 -->
      <view class="form-item form-item-top">
        <text class="form-label">合同附件</text>
        <view class="file-upload-area">
          <!-- 已上传文件列表 -->
          <view v-if="uploadedFiles.length" class="file-list">
            <view v-for="(file, idx) in uploadedFiles" :key="idx" class="file-item">
              <view class="file-info" @click="previewFile(file)">
                <text class="file-icon">{{ getFileIcon(file) }}</text>
                <text class="file-name">{{ getFileName(file) }}</text>
              </view>
              <text class="file-del" @click="delFile(idx)">✕</text>
            </view>
          </view>
          <!-- 上传按钮 -->
          <view class="upload-btns">
            <view class="upload-btn" @click="chooseFile">
              <text class="upload-btn-icon">📎</text>
              <text class="upload-btn-text">上传合同附件</text>
            </view>
          </view>
          <text class="upload-hint">支持 jpg、png、pdf、doc、docx，单个文件不超过20MB</text>
        </view>
      </view>

      <!-- 备注 -->
      <view class="form-item form-item-top">
        <text class="form-label">备注</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="选填，补充合同相关信息..." rows="3" />
      </view>
    </view>

    <!-- 项目选择弹窗 -->
    <BottomPicker
      v-model:visible="projectPicker.visible"
      :title="projectPicker.title"
      :items="projectPicker.items"
      @select="onProjectSelect"
      @cancel="projectPicker.visible = false"
    />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from '@/components/bottom-picker.vue'

const selectedProject = ref(null)
const projectName = ref('')
const submitting = ref(false)
const uploadedFiles = ref([])
const uploadingFile = ref(false)

const form = ref({
  project_id: '',
  contract_amount: '',
  remark: '',
})

const projectPicker = ref({ visible: false, title: '选择项目', items: [] })

let projectList = []

// 选择图片（H5用原生input，非H5用uni.chooseImage）
const chooseImage = () => {
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    files.forEach(file => doUpload(file))
    e.target.value = '' // 清空，允许重复选择同一文件
  }
  input.click()
  // #endif
  // #ifndef H5
  uni.chooseImage({
    count: 5,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const paths = res.tempFilePaths
      if (!paths.length) return
      paths.forEach(path => doUpload(path))
    },
    fail: () => {
      uni.showToast({ title: '请允许访问相册或相机', icon: 'none' })
    },
  })
  // #endif
}

// 选择文件（pdf/word/图片）
const chooseFile = () => {
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif'
  input.multiple = true
  input.onchange = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    files.forEach(file => doUpload(file))
    e.target.value = '' // 清空，允许重复选择同一文件
  }
  input.click()
  // #endif
  // #ifndef H5
  uni.chooseMessageFile({
    count: 5,
    success: (res) => {
      res.tempFiles.forEach(f => doUpload(f.path || f.filePath))
    },
  })
  // #endif
}

// 上传文件（统一入口，H5用fetch，非H5用uni.uploadFile）
const doUpload = (file) => {
  if (uploadingFile.value) return
  uploadingFile.value = true

  // H5: 用 fetch + FormData 直接上传 File 对象
  // #ifdef H5
  const formData = new FormData()
  formData.append('file', file) // file 可以是 File 对象或 blob URL
  fetch('/api/upload-contract-file', {
    method: 'POST',
    body: formData,
  }).then(res => res.json()).then(data => {
    if (data.url) {
      uploadedFiles.value.push(data.url)
    } else {
      uni.showToast({ title: data.error || '上传失败', icon: 'none' })
    }
  }).catch(() => {
    uni.showToast({ title: '上传失败', icon: 'none' })
  }).finally(() => {
    uploadingFile.value = false
  })
  return
  // #endif

  // 非H5: filePath 是字符串路径
  let filePath = file
  if (typeof file === 'object' && file instanceof File) {
    filePath = URL.createObjectURL(file)
  }

  uni.uploadFile({
    url: '/api/upload-contract-file',
    filePath,
    name: 'file',
    success: (res) => {
      try {
        const data = JSON.parse(res.data)
        if (data.url) {
          uploadedFiles.value.push(data.url)
        }
      } catch (e) {}
    },
    fail: () => {
      uni.showToast({ title: '上传失败', icon: 'none' })
    },
    complete: () => {
      uploadingFile.value = false
      if (typeof file === 'object' && file instanceof File) {
        URL.revokeObjectURL(filePath)
      }
    },
  })
}

// 删除文件
const delFile = (idx) => {
  uploadedFiles.value.splice(idx, 1)
}

// 预览文件
const previewFile = (url) => {
  if (!url) return
  const isImage = /\.(jpg|jpeg|png|gif|bmp)$/i.test(url)
  if (isImage) {
    uni.previewImage({ urls: [url] })
  } else {
    uni.previewMedia({ sources: [{ url, type: 'pdf' }] })
  }
}

// 获取文件图标
const getFileIcon = (url) => {
  if (!url) return '📄'
  if (/\.pdf$/i.test(url)) return '📕'
  if (/\.doc|\.docx$/i.test(url)) return '📘'
  if (/\.jpg|\.jpeg|\.png|\.gif$/i.test(url)) return '🖼'
  return '📎'
}

// 获取文件名
const getFileName = (url) => {
  if (!url) return '文件'
  const parts = url.split('/')
  const name = parts[parts.length - 1]
  // 去掉时间戳前缀
  return name.replace(/^\d{13}_/, '').substring(0, 20)
}

onMounted(() => {
  // 加载项目列表
  uni.request({
    url: '/api/projects',
    data: { limit: 500 },
    success: (res) => {
      if (Array.isArray(res.data)) {
        projectList = res.data
      } else if (res.data.code === 0) {
        projectList = res.data.data?.list || res.data.list || []
      } else {
        projectList = []
      }
    }
  })

  // 从 URL 参数读取项目信息（从项目详情页跳转来）
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    form.value.project_id = parseInt(options.projectId)
    projectName.value = options.projectName ? decodeURIComponent(options.projectName) : ''
    selectedProject.value = { id: form.value.project_id, name: projectName.value }
  }
})

const showProjectPicker = () => {
  projectPicker.value = {
    visible: true,
    title: '选择项目',
    items: projectList.map((p, i) => ({ name: p.name, icon: '📁', _index: i })),
  }
}

const onProjectSelect = ({ item }) => {
  const idx = item._index
  const p = projectList[idx]
  selectedProject.value = p
  projectName.value = p.name
  form.value.project_id = p.id
  projectPicker.value.visible = false
}

function goBack() { uni.navigateBack() }

function submit() {
  console.log('submit 按钮被点击了')
  if (!form.value.project_id) { uni.showToast({ title: '请选择项目', icon: 'none' }); return }
  if (!form.value.contract_amount) { uni.showToast({ title: '请输入合同金额', icon: 'none' }); return }

  submitting.value = true
  console.log('开始发送请求')

  uni.request({
    url: '/api/contracts/upload',
    method: 'POST',
    header: { Authorization: uni.getStorageSync('token') },
    data: {
      project_id: form.value.project_id,
      contract_amount: form.value.contract_amount,
      remark: form.value.remark,
      attachment: uploadedFiles.value.join(','),
    },
    success: function(res) {
      console.log('请求成功, statusCode:', res.statusCode, 'data:', JSON.stringify(res.data))
      submitting.value = false
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(function() { uni.navigateBack() }, 1500)
      } else {
        console.log('业务错误:', res.data.msg || res.data.error)
        uni.showToast({ title: res.data.msg || res.data.error || '提交失败', icon: 'none' })
      }
    },
    fail: function(err) {
      console.log('请求失败:', JSON.stringify(err))
      submitting.value = false
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.form-card { margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx; }
.form-section-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item {
  display: flex; align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.form-item:last-child { border-bottom: none; }
.form-item-top { align-items: flex-start; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; padding-top: 6rpx; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value {
  flex: 1; font-size: 28rpx; color: #333;
  display: flex; justify-content: space-between; align-items: center;
}
.picker-value.placeholder { color: #999; }
.arrow { font-size: 18px; color: #ccc; }

/* 项目横幅 */
.project-banner {
  font-size: 13px; color: #1E3A5F;
  background: #DBEAFE; padding: 8px 14px; font-weight: 500;
}

/* 导航栏 */
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-btn { font-size: 15px; color: #fff; width: 40px; text-align: right; }
.nav-btn.disabled { opacity: 0.5; }

/* 文件上传 */
.file-upload-area { flex: 1; }
.file-list { margin-bottom: 10px; }
.file-item {
  display: flex; align-items: center; justify-content: space-between;
  background: #F9FAFB; border-radius: 8rpx; padding: 10rpx 14rpx; margin-bottom: 8rpx;
}
.file-info { display: flex; align-items: center; gap: 8rpx; flex: 1; overflow: hidden; }
.file-icon { font-size: 18px; }
.file-name { font-size: 24rpx; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-del { font-size: 14px; color: #999; padding: 4rpx 8rpx; }
.file-del:hover { color: #EF4444; }
.upload-btns { display: flex; gap: 12rpx; margin-bottom: 8rpx; }
.upload-btn {
  display: flex; align-items: center; gap: 6rpx;
  background: #EFF6FF; border: 1px dashed #3B82F6; border-radius: 8rpx;
  padding: 12rpx 20rpx; color: #3B82F6;
}
.upload-btn-icon { font-size: 18px; }
.upload-btn-text { font-size: 24rpx; }
.upload-hint { font-size: 20rpx; color: #9CA3AF; }
</style>
