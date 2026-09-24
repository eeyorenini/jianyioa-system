<template>
  <div class="inspection-logs">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>巡检日志</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-select v-model="filterProject" placeholder="选择项目" clearable filterable style="width:180px" @change="loadLogs">
              <el-option label="全部项目" :value="0" />
              <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-button type="primary" @click="openAddDialog">
              <el-icon><Plus /></el-icon>
              新增巡检
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="logList" style="width:100%" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="project_name" label="项目名称" width="150">
          <template #default="scope">
            {{ scope.row.project_name || scope.row.project_id || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="提交人" width="100" />
        <el-table-column prop="inspection_date" label="巡检日期" width="120" />
        <el-table-column prop="location" label="巡检地点" width="150" show-overflow-tooltip />
        <el-table-column prop="result" label="巡检结果" min-width="200" show-overflow-tooltip />
        <el-table-column prop="images" label="图片" width="80">
          <template #default="scope">
            <span v-if="getImageCount(scope.row.images) > 0" style="color:#409eff;cursor:pointer" @click="previewImages(scope.row)">
              {{ getImageCount(scope.row.images) }} 张
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="提交时间" width="160" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="handleView(scope.row)">查看</el-button>
            <el-button size="small" type="danger" @click="handleDelete(scope.row)" v-if="canEdit(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:16px;display:flex;justify-content:center">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10,20,50]"
          layout="total,sizes,prev,pager,next"
          @current-change="loadLogs"
          @size-change="loadLogs"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑巡检' : '新增巡检日志'" width="700px" destroy-on-close>
      <!-- 上传中全屏遮挡层 -->
      <div v-if="uploadingCount > 0 || uploadProgress.visible" class="upload-overlay">
        <div class="upload-overlay-content">
          <div class="upload-spinner-large"></div>
          <div class="upload-progress-text">{{ uploadProgress.text }}</div>
          <div class="upload-progress-bar-wrap">
            <div class="upload-progress-bar" :style="{ width: uploadProgress.percent + '%' }"></div>
          </div>
          <div class="upload-progress-percent">{{ uploadProgress.percent }}%</div>
        </div>
      </div>
      <el-form :model="form" label-width="100px" style="max-height:60vh;overflow-y:auto">
        <el-form-item label="项目" required>
          <el-select v-model="form.project_id" placeholder="选择项目" filterable style="width:100%">
            <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="巡检日期">
          <el-date-picker v-model="form.inspection_date" type="date" value-format="YYYY-MM-DD" style="width:100%" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="巡检地点">
          <el-input v-model="form.location" placeholder="巡检地点" />
        </el-form-item>
        <el-form-item label="巡检结果" required>
          <el-input v-model="form.result" type="textarea" :rows="4" placeholder="巡检情况描述" />
        </el-form-item>
        <el-form-item label="问题记录">
          <el-input v-model="form.issues" type="textarea" :rows="2" placeholder="发现的问题" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
        <!-- 图片上传 -->
        <el-form-item label="图片">
          <div class="photo-upload-list">
            <div v-for="(item, idx) in formImages" :key="idx" class="photo-item" :class="{ 'photo-uploading': item.status === 'uploading', 'photo-error': item.status === 'error' }">
              <el-image :src="getImageUrl(item)" fit="cover" class="photo-thumb" :preview-src-list="getPreviewList()" :preview-index="idx" />
              <div v-if="item.status === 'uploading'" class="photo-overlay">
                <span class="photo-spinner"></span>
              </div>
              <div v-if="item.status === 'error'" class="photo-overlay photo-overlay-error">
                <span style="font-size:20px">⚠</span>
              </div>
              <div class="photo-remove" @click="removeImage(idx)">×</div>
            </div>
            <div v-if="formImages.length < 9" class="photo-add" @click="choosePhoto">
              <el-icon><Plus /></el-icon>
              <span>添加图片</span>
            </div>
          </div>
          <input type="file" ref="fileInputRef" accept="image/*" multiple style="display:none" @change="onFileChange" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false" :disabled="uploadingCount > 0">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave" :disabled="uploadingCount > 0">确定</el-button>
      </template>
    </el-dialog>

    <!-- 查看详情 -->
    <el-dialog v-model="viewVisible" title="巡检详情" width="700px" destroy-on-close>
      <div v-if="viewLog" class="log-detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="项目">{{ viewLog.project_name }}</el-descriptions-item>
          <el-descriptions-item label="提交人">{{ viewLog.operator }}</el-descriptions-item>
          <el-descriptions-item label="巡检日期">{{ viewLog.inspection_date }}</el-descriptions-item>
          <el-descriptions-item label="巡检地点">{{ viewLog.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间" :span="2">{{ viewLog.created_at }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:16px">
          <div class="detail-label">巡检结果</div>
          <div class="detail-content">{{ viewLog.result }}</div>
        </div>
        <div v-if="viewLog.issues" style="margin-top:12px">
          <div class="detail-label">问题记录</div>
          <div class="detail-content">{{ viewLog.issues }}</div>
        </div>
        <div v-if="viewLog.note" style="margin-top:12px">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ viewLog.note }}</div>
        </div>
        <div v-if="getViewImages(viewLog.images).length > 0" style="margin-top:16px">
          <div class="detail-label">图片</div>
          <div class="detail-images">
            <el-image
              v-for="(img, idx) in getViewImages(viewLog.images)"
              :key="idx"
              :src="getImageUrl(img)"
              fit="cover"
              class="detail-img"
              :preview-src-list="getViewImages(viewLog.images).map(g=>getImageUrl(g))"
              :preview-index="idx"
            />
          </div>
        </div>
      </div>
    </el-dialog>

    <el-image-viewer v-if="previewVisible" :url-list="previewImagesList" @close="previewVisible=false" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '../utils/request'
import { projectLogApi } from '../utils/api'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const viewVisible = ref(false)
const previewVisible = ref(false)
const isEdit = ref(false)
const logList = ref([])
const projectList = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterProject = ref(0)
const viewLog = ref(null)
const previewImagesList = ref([])
const fileInputRef = ref(null)

const formImages = ref([]) // 每个元素: { localUrl: 'blob:xxx', serverUrl: '/uploads/logs/xxx.jpg', status: 'uploading'|'done'|'error', name: '' }
const uploadQueue = ref(0) // 上传中数量
const uploadingCount = ref(0) // 当前正在上传的图片数量

// 上传进度状态（遮挡层用）
const uploadProgress = reactive({
  visible: false,
  text: '正在上传图片…',
  percent: 0,
  total: 0,
  done: 0,
})

const getImageUrl = (item) => {
  // 优先用本地预览URL（还没上传完时），上传完成后用服务器URL
  if (!item) return ''
  if (item.serverUrl) return `/api${item.serverUrl}`
  if (item.localUrl) return item.localUrl
  return ''
}

const getPreviewList = () => formImages.value.map(item => getImageUrl(item))

// 压缩图片（最大边1920px，质量0.8）
const compressImage = (file) => {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1920
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name, { type: file.type || 'image/jpeg' }))
        } else {
          resolve(file)
        }
      }, 'image/jpeg', 0.8)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

const choosePhoto = () => fileInputRef.value?.click()

const onFileChange = async (e) => {
  const files = Array.from(e.target.files)
  if (!files.length) return
  e.target.value = ''

  const remain = 9 - formImages.value.length
  const toUpload = files.slice(0, remain)
  if (toUpload.length === 0) {
    ElMessage.warning('最多上传9张图片')
    return
  }

  // 初始化进度状态
  uploadProgress.visible = true
  uploadProgress.text = `正在上传 ${toUpload.length} 张图片…`
  uploadProgress.total = toUpload.length
  uploadProgress.done = 0
  uploadProgress.percent = 0

  // 并行上传：立即显示所有缩略图，同时开始上传
  const uploadTasks = toUpload.map(file => {
    const localUrl = URL.createObjectURL(file)
    const tempItem = { localUrl, serverUrl: '', status: 'uploading', name: file.name }
    formImages.value.push(tempItem)
    uploadQueue.value++

    return (async () => {
      try {
        // 先压缩图片
        const compressedFile = await compressImage(file)
        const fd = new FormData()
        fd.append('file', compressedFile)
        const res = await request.post('/upload-image', fd, { timeout: 30000 })
        if (res && res.url) {
          const item = formImages.value.find(i => i.localUrl === localUrl)
          if (item) {
            URL.revokeObjectURL(item.localUrl)
            item.localUrl = ''
            item.serverUrl = res.url
            item.status = 'done'
          }
        } else {
          const item = formImages.value.find(i => i.localUrl === localUrl)
          if (item) item.status = 'error'
        }
      } catch (err) {
        const item = formImages.value.find(i => i.localUrl === localUrl)
        if (item) item.status = 'error'
        console.error(`图片 ${file.name} 上传失败`, err)
      } finally {
        uploadQueue.value--
        uploadProgress.done++
        uploadProgress.percent = Math.round((uploadProgress.done / uploadProgress.total) * 100)
        uploadProgress.text = `正在上传 ${uploadProgress.total - uploadProgress.done} / ${uploadProgress.total}…`
      }
    })()
  })

  Promise.all(uploadTasks).then(() => {
    const failed = formImages.value.filter(i => i.status === 'error').length
    const success = uploadProgress.total - failed
    if (failed > 0) {
      uploadProgress.visible = false
      ElMessage.warning(`${failed} 张图片上传失败，请删除后重试`)
    } else {
      uploadProgress.visible = false
    }
  })
}

const removeImage = (idx) => {
  const item = formImages.value[idx]
  if (item?.localUrl) URL.revokeObjectURL(item.localUrl)
  formImages.value.splice(idx, 1)
}

const getImageCount = (imagesField) => {
  if (!imagesField) return 0
  try {
    let val = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField
    if (typeof val === 'string') val = JSON.parse(val)
    return Array.isArray(val) ? val.length : 0
  } catch { return 0 }
}

const getViewImages = (imagesField) => {
  if (!imagesField) return []
  try {
    let val = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField
    if (typeof val === 'string') return JSON.parse(val)
    return Array.isArray(val) ? val : []
  } catch { return [] }
}
const loadLogs = async () => {
  loading.value = true
  try {
    const params = { page: page.value, page_size: pageSize.value, type: 'inspection' }
    if (filterProject.value) params.project_id = filterProject.value
    const res = await projectLogApi.list(params)
    logList.value = Array.isArray(res) ? res : (res.list || res.data || [])
    total.value = res.total || 0
  } catch (e) {
    console.error('加载巡检日志失败', e)
    logList.value = []
  } finally {
    loading.value = false
  }
}

const loadProjects = async () => {
  try {
    const res = await request.get('/projects')
    projectList.value = Array.isArray(res) ? res : (res.data || [])
  } catch (e) {
    projectList.value = []
  }
}

const form = reactive({
  id: null,
  project_id: null,
  inspection_date: '',
  location: '',
  result: '',
  issues: '',
  note: '',
  operator: ''
})

const canEdit = (log) => {
  if (userStore.isAdmin) return true
  return log.operator === userStore.userName
}

const openAddDialog = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null, project_id: null, inspection_date: '', location: '',
    result: '', issues: '', note: '', operator: userStore.userName
  })
  // 清空图片（释放 blob URL）
  for (const item of formImages.value) {
    if (item.localUrl) URL.revokeObjectURL(item.localUrl)
  }
  formImages.value = []
  dialogVisible.value = true
}

const handleView = (row) => {
  viewLog.value = row
  viewVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除这条巡检记录？', '删除确认', { type: 'warning' })
    await projectLogApi.delete(row.id)
    ElMessage.success('删除成功')
    loadLogs()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const handleSave = async () => {
  if (!form.result.trim()) {
    ElMessage.warning('巡检结果不能为空')
    return
  }
  if (!form.project_id) {
    ElMessage.warning('请选择项目')
    return
  }
  // 等待所有图片上传完成（最多等待60秒）
  if (uploadQueue.value > 0) {
    saving.value = true
    uploadProgress.visible = true
    uploadProgress.text = '图片正在上传中…'
    uploadProgress.percent = 0
    const maxWait = 60000
    const startTime = Date.now()
    while (uploadQueue.value > 0) {
      if (Date.now() - startTime > maxWait) {
        uploadProgress.visible = false
        ElMessage.error('图片上传超时，请检查网络后重试')
        saving.value = false
        return
      }
      await new Promise(r => setTimeout(r, 200))
    }
    const failedImages = formImages.value.filter(i => i.status === 'error')
    if (failedImages.length > 0) {
      uploadProgress.visible = false
      ElMessage.warning(`${failedImages.length} 张图片上传失败，请删除后重试`)
      saving.value = false
      return
    }
    uploadProgress.visible = false
  } else {
    const failedImages = formImages.value.filter(i => i.status === 'error')
    if (failedImages.length > 0) {
      ElMessage.warning(`${failedImages.length} 张图片上传失败，请删除后重试`)
      return
    }
  }

  saving.value = true
  try {
    const data = { ...form, type: 'inspection', images: formImages.value.map(i => i.serverUrl).filter(Boolean) }
    if (isEdit.value) {
      await projectLogApi.update(form.id, data)
    } else {
      await projectLogApi.create(data)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    loadLogs()
  } catch (e) {
    console.error('保存失败', e)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadLogs()
  loadProjects()
})
</script>

<style scoped>
.card-header { display:flex; justify-content:space-between; align-items:center; }
.photo-upload-list { display:flex; flex-wrap:wrap; gap:8px; }
.photo-item { position:relative; width:80px; height:80px; border-radius:4px; overflow:hidden; border: 2px solid transparent; }
.photo-item.photo-uploading { border-color: #409eff; }
.photo-item.photo-error { border-color: #f56c6c; }
.photo-thumb { width:100%; height:100%; }
.photo-remove { position:absolute; top:0; right:0; width:20px; height:20px; background:rgba(0,0,0,0.6); color:#fff; text-align:center; line-height:20px; cursor:pointer; font-size:16px; }
.photo-add { width:80px; height:80px; border:1px dashed #dcdfe6; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; color:#909399; font-size:12px; gap:4px; }
.photo-add:hover { border-color:#409eff; color:#409eff; }
.photo-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; }
.photo-overlay-error { background:rgba(245,108,108,0.3); }
.photo-spinner { width:24px; height:24px; border:3px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
.detail-label { font-size:13px; color:#909399; margin-bottom:6px; }
.detail-content { background:#f5f7fa; padding:10px 12px; border-radius:4px; line-height:1.6; white-space:pre-wrap; }
.detail-images { display:flex; flex-wrap:wrap; gap:8px; }
.detail-img { width:100px; height:100px; border-radius:4px; cursor:pointer; }

/* 上传进度遮挡层 */
.upload-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
/* 让 el-dialog__body 成为遮挡层的定位参照 */
:deep(.el-dialog__body) {
  position: relative;
}
.upload-overlay-content {
  text-align: center;
  padding: 32px;
  min-width: 200px;
}
.upload-spinner-large {
  width: 48px;
  height: 48px;
  border: 4px solid #e4e7ed;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 20px;
}
.upload-progress-text {
  font-size: 14px;
  color: #303133;
  margin-bottom: 16px;
  font-weight: 500;
}
.upload-progress-bar-wrap {
  width: 200px;
  height: 8px;
  background: #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 10px;
}
.upload-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #67c23a);
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 4px;
}
.upload-progress-percent {
  font-size: 20px;
  font-weight: 700;
  color: #409eff;
  font-variant-numeric: tabular-nums;
}
</style>
