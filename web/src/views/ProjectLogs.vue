<template>
  <div class="project-logs">
    <!-- 页面头 -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">施工日志</h2>
        <p class="page-sub">
          工地现场每日施工记录 · 共 <b>{{ total }}</b> 条日志
        </p>
      </div>
      <div class="page-head-right">
        <el-select
          v-model="filterProject"
          class="proj-select"
          placeholder="全部项目"
          clearable
          filterable
          @change="loadLogs"
        >
          <el-option label="全部项目" :value="0" />
          <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button class="btn-add" type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          <span>新增日志</span>
        </el-button>
      </div>
    </div>

    <!-- 列表卡片 -->
    <div class="table-card">
      <div class="table-head">
        <div class="table-head-left">
          <span class="table-title">日志列表</span>
          <span v-if="filterProject" class="filter-chip">
            {{ projectNameOf(filterProject) }}
            <span class="chip-x" @click="clearProjectFilter">×</span>
          </span>
        </div>
        <span class="table-count">本页 <b>{{ logList.length }}</b> 条 / 共 {{ total }} 条</span>
      </div>

      <el-table :data="logList" class="log-table" style="width:100%" v-loading="loading" row-key="id">
        <el-table-column label="施工日期" width="106">
          <template #default="scope">
            <div class="date-cell">
              <div class="date-day">{{ dayOf(scope.row) }}</div>
              <div class="date-ym">{{ ymOf(scope.row) }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="项目 / 内容" min-width="300">
          <template #default="scope">
            <div class="log-main">
              <div class="log-proj">
                <span class="proj-dot"></span>
                {{ scope.row.project_name || scope.row.project_id || '-' }}
              </div>
              <div class="log-content" :title="scope.row.content || ''">{{ scope.row.content || '—' }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="工种 / 人数" width="140">
          <template #default="scope">
            <span v-if="scope.row.work_type" class="soft-tag">{{ scope.row.work_type }}</span>
            <div class="worker-line">
              <span v-if="scope.row.worker_count">👷 {{ scope.row.worker_count }} 人</span>
              <span v-else class="muted">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="现场照片" width="150">
          <template #default="scope">
            <div v-if="getImageCount(scope.row.images) > 0" class="thumb-stack" @click="previewImages(scope.row)">
              <div
                v-for="(img, i) in thumbList(scope.row).slice(0, 3)"
                :key="i"
                class="thumb"
              >
                <el-image :src="getImageUrl(img)" fit="cover" class="thumb-img" />
              </div>
              <span v-if="getImageCount(scope.row.images) > 3" class="thumb-more">
                +{{ getImageCount(scope.row.images) - 3 }}
              </span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="提交人" width="132">
          <template #default="scope">
            <div class="user-cell">
              <div class="avatar" :style="{ background: avatarBg(scope.row.operator) }">
                {{ firstChar(scope.row.operator) }}
              </div>
              <div class="user-main">
                <div class="user-name">{{ scope.row.operator || '-' }}</div>
                <div class="user-time">{{ shortTime(scope.row.created_at) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="112" fixed="right" align="center">
          <template #default="scope">
            <el-button class="btn-link" link @click="handleView(scope.row)">查看</el-button>
            <el-button
              v-if="canEdit(scope.row)"
              class="btn-link danger"
              link
              @click="handleDelete(scope.row)"
            >删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <div class="empty-icon">📔</div>
            <div class="empty-title">暂无施工日志</div>
            <div class="empty-sub">点击右上角「新增日志」记录今天的施工情况</div>
          </div>
        </template>
      </el-table>

      <div class="pagination-wrap">
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
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" width="720px" class="log-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">📔</div>
          <div>
            <div class="dlg-head-title">{{ isEdit ? '编辑施工日志' : '新增施工日志' }}</div>
            <div class="dlg-head-sub">记录当日施工内容、人员与现场照片</div>
          </div>
        </div>
      </template>

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

      <el-form :model="form" label-width="88px" class="log-form">
        <!-- 基础信息 -->
        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>基础信息</div>
          <el-form-item label="项目" required>
            <el-select v-model="form.project_id" placeholder="选择项目" filterable style="width:100%">
              <el-option v-for="p in pickProjectList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <div v-if="!pickProjectList.length" class="picker-empty-tip">
              你没有关联任何项目，暂时无法提交。请联系管理员把你加到对应项目。
            </div>
          </el-form-item>
          <div class="form-row">
            <el-form-item label="施工日期">
              <el-date-picker v-model="form.work_date" type="date" value-format="YYYY-MM-DD" style="width:100%" placeholder="选择日期" />
            </el-form-item>
            <el-form-item label="工种">
              <el-input v-model="form.work_type" placeholder="如：木工、泥工" />
            </el-form-item>
          </div>
          <el-form-item label="施工人数">
            <el-input-number v-model="form.worker_count" :min="0" :max="999" />
          </el-form-item>
        </div>

        <!-- 施工内容 -->
        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>施工内容</div>
          <el-form-item label="施工内容" required>
            <el-input v-model="form.content" type="textarea" :rows="4" resize="none" placeholder="本次施工内容" />
          </el-form-item>
          <el-form-item label="明日计划">
            <el-input v-model="form.tomorrow_plan" type="textarea" :rows="2" resize="none" placeholder="明日计划" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="2" resize="none" placeholder="备注信息" />
          </el-form-item>
        </div>

        <!-- 现场照片 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-bar"></span>现场照片
            <span class="section-tip">最多 9 张，{{ formImages.length }}/9</span>
          </div>
          <el-form-item label="图片">
            <div class="photo-upload-list">
              <div v-for="(item, idx) in formImages" :key="idx" class="photo-item" :class="{ 'photo-uploading': item.status === 'uploading', 'photo-error': item.status === 'error' }">
                <el-image :src="getImageUrl(item)" fit="cover" class="photo-thumb" :preview-src-list="getPreviewList()" :preview-index="idx" />
                <div v-if="item.status === 'uploading'" class="photo-overlay"><span class="photo-spinner"></span></div>
                <div v-if="item.status === 'error'" class="photo-overlay photo-overlay-error"><span style="font-size:20px">⚠</span></div>
                <div class="photo-remove" @click="removeImage(idx)">×</div>
              </div>
              <div v-if="formImages.length < 9" class="photo-add" @click="choosePhoto">
                <el-icon><Plus /></el-icon>
                <span>添加图片</span>
              </div>
            </div>
            <input type="file" ref="fileInputRef" accept="image/*" multiple style="display:none" @change="onFileChange" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="dialogVisible=false" :disabled="uploadingCount > 0">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="saving" @click="handleSave" :disabled="uploadingCount > 0">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 查看详情对话框 -->
    <el-dialog v-model="viewVisible" width="760px" class="log-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">📔</div>
          <div>
            <div class="dlg-head-title">日志详情</div>
            <div class="dlg-head-sub">{{ viewLog ? (viewLog.project_name || '-') : '' }}</div>
          </div>
        </div>
      </template>

      <div v-if="viewLog" class="log-detail">
        <!-- 摘要 -->
        <div class="detail-hero">
          <div class="hero-date">
            <div class="hd-day">{{ dayOf(viewLog) }}</div>
            <div class="hd-ym">{{ ymOf(viewLog) }}</div>
          </div>
          <div class="hero-main">
            <div class="hero-proj">{{ viewLog.project_name || '-' }}</div>
            <div class="hero-chips">
              <span v-if="viewLog.work_type" class="soft-tag">{{ viewLog.work_type }}</span>
              <span v-if="viewLog.worker_count" class="soft-tag gray">👷 {{ viewLog.worker_count }} 人</span>
              <span class="soft-tag gray">{{ viewLog.operator || '-' }} 提交</span>
            </div>
          </div>
        </div>

        <!-- 内容块 -->
        <div class="detail-block">
          <div class="block-label"><span class="block-bar"></span>施工内容</div>
          <div class="block-text">{{ viewLog.content || '—' }}</div>
        </div>
        <div v-if="viewLog.tomorrow_plan" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>明日计划</div>
          <div class="block-text">{{ viewLog.tomorrow_plan }}</div>
        </div>
        <div v-if="viewLog.note" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>备注</div>
          <div class="block-text">{{ viewLog.note }}</div>
        </div>

        <!-- 照片 -->
        <div v-if="getViewImages(viewLog.images).length > 0" class="detail-block">
          <div class="block-label">
            <span class="block-bar"></span>现场照片
            <span class="block-tip">{{ getViewImages(viewLog.images).length }} 张</span>
          </div>
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

        <div class="detail-foot">提交时间：{{ viewLog.created_at || '-' }}</div>
      </div>
    </el-dialog>

    <!-- 图片预览 -->
    <el-image-viewer v-if="previewVisible" :url-list="previewImagesList" @close="previewVisible=false" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
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
const projectList = ref([])      // 筛选用：普通模式（尊重 read_all）
const pickProjectList = ref([])  // 表单用：picker 模式（只含我关联的项目，admin 全部）
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterProject = ref(0)
const viewLog = ref(null)
const previewImagesList = ref([])
const fileInputRef = ref(null)

// form images as array of { localUrl, serverUrl, status } (支持旧字符串格式兼容)
const formImages = ref([]) // 每个元素: { localUrl: 'blob:xxx', serverUrl: '/uploads/logs/xxx.jpg', status: 'uploading'|'done'|'error', name: 'xxx.jpg' }
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

const form = reactive({
  id: null,
  project_id: null,
  content: '',
  work_date: '',
  work_type: '',
  tomorrow_plan: '',
  note: '',
  worker_count: 0,
  operator: ''
})

/* ---------- 仅用于展示的小工具 ---------- */
const projectNameOf = (id) => {
  const p = projectList.value.find(x => String(x.id) === String(id))
  return p ? p.name : `项目 #${id}`
}
const clearProjectFilter = () => {
  filterProject.value = 0
  loadLogs()
}
const dateOf = (row) => {
  const raw = row?.work_date || row?.created_at
  if (!raw) return null
  const d = new Date(String(raw).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
const dayOf = (row) => {
  const d = dateOf(row)
  return d ? String(d.getDate()).padStart(2, '0') : '--'
}
const ymOf = (row) => {
  const d = dateOf(row)
  return d ? `${d.getMonth() + 1} 月` : ''
}
const shortTime = (raw) => {
  if (!raw) return '-'
  return String(raw).replace('T', ' ').substring(5, 16)
}
const firstChar = (name) => (name ? String(name).trim().charAt(0) : '?')
const AVATAR_COLORS = ['#2D5A8F', '#4A7BB7', '#5B8C5A', '#B8894A', '#8A6FA8', '#4F8A8B']
const avatarBg = (name) => {
  const s = String(name || '?')
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
const thumbList = (row) => getViewImages(row.images)

// Check if current user can edit/delete this log
const canEdit = (log) => {
  if (userStore.isAdmin) return true
  return log.operator === userStore.userName
}

const getImageCount = (imagesField) => {
  if (!imagesField) return 0
  try {
    let val = imagesField
    if (typeof val === 'string') val = JSON.parse(val)
    if (typeof val === 'string') val = JSON.parse(val)
    if (Array.isArray(val)) return val.length
    return 0
  } catch {
    return 0
  }
}

const getViewImages = (imagesField) => {
  if (!imagesField) return []
  try {
    let val = imagesField
    if (typeof val === 'string') {
      val = JSON.parse(val)
    }
    if (typeof val === 'string') {
      // 双重JSON编码情况
      val = JSON.parse(val)
    }
    return Array.isArray(val) ? val : []
  } catch {
    return []
  }
}

const getImageUrl = (item) => {
  // 支持旧格式（字符串）和新格式（对象）
  if (!item) return ''
  if (typeof item === 'string') {
    // 旧格式字符串
    if (item.startsWith('data:') || item.startsWith('http')) return item
    // 存储的图片路径如 /uploads/logs/xxx.png，直接返回（静态文件 mount 在 /uploads）
    return item
  }
  // 新格式对象
  if (item.serverUrl) return `/api${item.serverUrl}`
  if (item.localUrl) return item.localUrl
  return ''
}

const getPreviewList = () => formImages.value.map(item => getImageUrl(item))

const loadLogs = async () => {
  loading.value = true
  try {
    const params = { page: page.value, page_size: pageSize.value }
    if (filterProject.value) params.project_id = filterProject.value
    const res = await projectLogApi.list(params)
    logList.value = Array.isArray(res) ? res : (res.list || res.data || [])
    total.value = res.total || 0
  } catch (e) {
    console.error('加载日志失败', e)
    logList.value = []
  } finally {
    loading.value = false
  }
}

const loadProjects = async () => {
  try {
    // 两个列表，用途不同：
    //   projectList     —— 顶部「按项目筛选」，保持普通模式（尊重 project:read_all，
    //                      项目经理/财务/主材能筛全部，否则他们筛不到不属于自己的项目）
    //   pickProjectList —— 写日志表单里的「项目」下拉，?picker=1 只给「我实际关联的项目」（admin 全部）
    const [all, mine] = await Promise.all([
      request.get('/projects').catch(() => []),
      request.get('/projects?picker=1').catch(() => [])
    ])
    projectList.value = Array.isArray(all) ? all : (all.data || [])
    pickProjectList.value = Array.isArray(mine) ? mine : (mine.data || [])
  } catch (e) {
    projectList.value = []
    pickProjectList.value = []
  }
}

const openAddDialog = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null, project_id: null, content: '', work_date: '',
    work_type: '', tomorrow_plan: '', note: '', worker_count: 0,
    operator: userStore.userName
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
    await ElMessageBox.confirm('确定删除这条日志？', '删除确认', { type: 'warning' })
    await projectLogApi.delete(row.id)
    ElMessage.success('删除成功')
    loadLogs()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const handleSave = async () => {
  if (!form.content.trim()) {
    ElMessage.warning('施工内容不能为空')
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
    const data = { ...form, images: formImages.value.map(i => i.serverUrl || (typeof i === 'string' ? i : '')) }
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

// 图片上传
const choosePhoto = () => {
  fileInputRef.value?.click()
}

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

  // 并行上传
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

const previewImages = (row) => {
  const imgs = getViewImages(row.images)
  if (!imgs.length) return
  previewImagesList.value = imgs.map(g => getImageUrl(g))
  previewVisible.value = true
}

onMounted(() => {
  loadLogs()
  loadProjects()
})
</script>

<style scoped>
.project-logs { padding: 0; }

/* ==================== 页面头 ==================== */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title { font-size: 20px; font-weight: 700; color: #1E3A5F; margin: 0; }
.page-sub { font-size: 13px; color: #909399; margin: 6px 0 0; }
.page-sub b { color: #409EFF; font-weight: 600; }
.page-head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.proj-select { width: 200px; }
.proj-select :deep(.el-select__wrapper) { border-radius: 10px; }
.btn-add {
  border-radius: 10px;
  padding: 0 18px;
  height: 34px;
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
}
.btn-add:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 列表卡片 ==================== */
.table-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 8px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
}
.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.table-head-left { display: flex; align-items: center; gap: 10px; }
.table-title { font-size: 15px; font-weight: 600; color: #1E3A5F; }
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1E3A5F;
  background: #EAF0F7;
  border-radius: 10px;
  padding: 2px 8px 2px 10px;
  line-height: 18px;
}
.chip-x { cursor: pointer; color: #7b8b9e; font-size: 14px; line-height: 1; }
.chip-x:hover { color: #F56C6C; }
.table-count { font-size: 12px; color: #909399; }
.table-count b { color: #409EFF; font-weight: 600; }

/* ==================== 表格 ==================== */
.log-table { --el-table-border-color: #f0f2f5; }
.log-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.log-table :deep(td.el-table__cell) { padding: 12px 0; border-bottom: 1px solid #f5f7fa; }
.log-table :deep(.el-table__row) { transition: background .15s; }
.log-table :deep(.el-table__row:hover > td.el-table__cell) { background: #f5f9ff !important; }

/* 日期块 */
.date-cell {
  width: 56px;
  text-align: center;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 5px 0 6px;
}
.date-day { font-size: 19px; font-weight: 700; color: #1E3A5F; line-height: 1.1; font-family: ui-monospace, Menlo, monospace; }
.date-ym { font-size: 11px; color: #909399; margin-top: 1px; }

/* 项目 + 内容 */
.log-main { min-width: 0; }
.log-proj {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}
.proj-dot { width: 7px; height: 7px; border-radius: 50%; background: #2D5A8F; flex-shrink: 0; }
.log-content {
  font-size: 13px;
  color: #606266;
  line-height: 1.55;
  margin-top: 5px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* 工种 */
.soft-tag {
  display: inline-block;
  font-size: 12px;
  color: #4a6fa5;
  background: #f0f5ff;
  border-radius: 7px;
  padding: 1px 8px;
  line-height: 19px;
}
.soft-tag.gray { color: #6b7a8d; background: #f4f6f9; }
.worker-line { font-size: 12px; color: #7b8b9e; margin-top: 5px; }
.muted { color: #c0c4cc; }

/* 缩略图 */
.thumb-stack { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.thumb {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eef1f6;
  flex-shrink: 0;
  transition: transform .15s;
}
.thumb-stack:hover .thumb { transform: translateY(-1px); }
.thumb-img { width: 100%; height: 100%; display: block; }
.thumb-more {
  font-size: 11px;
  color: #7b8b9e;
  background: #f4f6f9;
  border-radius: 7px;
  padding: 1px 6px;
  line-height: 18px;
}

/* 提交人 */
.user-cell { display: flex; align-items: center; gap: 8px; }
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-main { min-width: 0; }
.user-name { font-size: 13px; color: #303133; font-weight: 500; }
.user-time { font-size: 11px; color: #a8abb2; margin-top: 2px; }

.btn-link { font-size: 13px; padding: 0 6px; color: #2D5A8F; }
.btn-link.danger { color: #F56C6C; }
.btn-link:hover { opacity: .8; }

/* 空状态 */
.empty-state { padding: 44px 0 34px; text-align: center; }
.empty-icon { font-size: 40px; line-height: 1; opacity: .75; }
.empty-title { font-size: 14px; font-weight: 600; color: #606266; margin-top: 12px; }
.empty-sub { font-size: 12px; color: #a8abb2; margin-top: 6px; }

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 12px 0 8px;
  border-top: 1px solid #f5f7fa;
}

/* ==================== 弹窗通用 ==================== */
.dlg-head { display: flex; align-items: center; gap: 12px; }
.dlg-head-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #EAF0F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.dlg-head-title { font-size: 16px; font-weight: 700; color: #1E3A5F; }
.dlg-head-sub { font-size: 12px; color: #909399; margin-top: 3px; }
.dlg-footer { display: flex; justify-content: flex-end; gap: 10px; }
.btn-save {
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  border-radius: 10px;
  padding: 0 24px;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .22);
}
.btn-save:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 表单 ==================== */
.log-form { max-height: 64vh; overflow-y: auto; padding-right: 6px; }
.form-section {
  background: #fafbfd;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 14px 16px 2px;
  margin-bottom: 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 12px;
}
.section-bar {
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: linear-gradient(180deg, #4A7BB7, #1E3A5F);
}
.section-tip { margin-left: auto; font-size: 11px; color: #a8abb2; font-weight: 400; }
.form-row { display: flex; gap: 12px; }
.form-row :deep(.el-form-item) { flex: 1; min-width: 0; }
.log-form :deep(.el-form-item) { margin-bottom: 14px; }
.log-form :deep(.el-form-item__label) { color: #606266; font-size: 13px; }
.log-form :deep(.el-input__wrapper),
.log-form :deep(.el-textarea__inner) { border-radius: 8px; }
.log-form :deep(.el-textarea__inner) { background: #fff; }

/* ==================== 图片上传 ==================== */
.photo-upload-list { display: flex; flex-wrap: wrap; gap: 8px; }
.photo-item {
  position: relative;
  width: 82px;
  height: 82px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
}
.photo-item.photo-uploading { border-color: #409eff; }
.photo-item.photo-error { border-color: #f56c6c; }
.photo-thumb { width: 100%; height: 100%; display: block; }
.photo-remove {
  position: absolute;
  top: 0; right: 0;
  width: 20px; height: 20px;
  background: rgba(0, 0, 0, .55);
  color: #fff;
  text-align: center;
  line-height: 19px;
  cursor: pointer;
  font-size: 15px;
  border-bottom-left-radius: 8px;
}
.photo-add {
  width: 82px;
  height: 82px;
  border: 1px dashed #d3dce8;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  font-size: 12px;
  gap: 4px;
  background: #fff;
  transition: all .15s;
}
.photo-add:hover { border-color: #409eff; color: #409eff; background: #f5f9ff; }
.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.photo-overlay-error { background: rgba(245, 108, 108, .3); }
.photo-spinner {
  width: 24px; height: 24px;
  border: 3px solid rgba(255, 255, 255, .3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

/* ==================== 详情 ==================== */
.detail-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f4f8fd, #eef4fa);
  border: 1px solid #e3ecf6;
  margin-bottom: 16px;
}
.hero-date {
  width: 58px;
  text-align: center;
  background: #fff;
  border-radius: 10px;
  padding: 6px 0 7px;
  box-shadow: 0 2px 8px rgba(30, 58, 95, .08);
  flex-shrink: 0;
}
.hd-day { font-size: 21px; font-weight: 700; color: #1E3A5F; line-height: 1.1; font-family: ui-monospace, Menlo, monospace; }
.hd-ym { font-size: 11px; color: #909399; margin-top: 1px; }
.hero-main { min-width: 0; }
.hero-proj { font-size: 15px; font-weight: 600; color: #1f2d3d; }
.hero-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }

.detail-block { margin-bottom: 14px; }
.block-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 8px;
}
.block-bar { width: 3px; height: 12px; border-radius: 2px; background: #4A7BB7; }
.block-tip { font-size: 11px; color: #a8abb2; font-weight: 400; }
.block-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.75;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 11px 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.detail-img {
  width: 100%;
  height: 104px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid #eef1f6;
  transition: transform .15s, box-shadow .15s;
}
.detail-img:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 21, 41, .12); }
.detail-foot {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed #eef1f6;
}

/* ==================== 上传遮挡层 ==================== */
.upload-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(255, 255, 255, .92);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
:deep(.el-dialog__body) { position: relative; }
.upload-overlay-content { text-align: center; padding: 32px; min-width: 200px; }
.upload-spinner-large {
  width: 48px; height: 48px;
  border: 4px solid #e4e7ed;
  border-top-color: #2D5A8F;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  margin: 0 auto 20px;
}
.upload-progress-text { font-size: 14px; color: #303133; margin-bottom: 16px; font-weight: 500; }
.upload-progress-bar-wrap {
  width: 200px; height: 8px;
  background: #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 10px;
}
.upload-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4A7BB7, #1E3A5F);
  border-radius: 4px;
  transition: width .3s ease;
  min-width: 4px;
}
.upload-progress-percent { font-size: 20px; font-weight: 700; color: #1E3A5F; font-variant-numeric: tabular-nums; }

@keyframes spin { to { transform: rotate(360deg); } }

/* 项目选择器为空时的提示（picker 模式只返回我关联的项目） */
.picker-empty-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #b88230;
  background: #fdf6ec;
  border: 1px solid #f5e2c0;
  border-radius: 8px;
  padding: 6px 10px;
  width: 100%;
  box-sizing: border-box;
}

/* ==================== 响应式 ==================== */
@media screen and (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head-right { width: 100%; }
  .proj-select { flex: 1; width: auto; }
  .table-card { padding: 12px 10px 4px; }
  .pagination-wrap { justify-content: center; }
  .form-row { flex-direction: column; gap: 0; }
  .detail-images { grid-template-columns: repeat(3, 1fr); }
  .detail-img { height: 88px; }
}
</style>
