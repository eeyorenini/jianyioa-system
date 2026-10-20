<template>
  <div class="pf-panel">
    <!-- 工具条：分类筛选 + 上传 -->
    <div class="pf-toolbar">
      <div class="pf-cats">
        <span class="pf-chip" :class="{ active: !curCategory }" @click="pickCat('')">
          全部 <em>{{ files.length }}</em>
        </span>
        <span
          v-for="c in FILE_CATEGORIES"
          :key="c.key"
          class="pf-chip"
          :class="{ active: curCategory === c.key }"
          @click="pickCat(c.key)"
        >
          <i class="pf-dot" :style="{ background: c.color }"></i>{{ c.icon }} {{ c.label }}
          <em>{{ catCount(c.key) }}</em>
        </span>
      </div>
      <div class="pf-right">
        <span class="pf-total">共 {{ filtered.length }} 个文件</span>
        <el-button v-if="canWrite" type="primary" size="small" :icon="Upload" @click="openUpload">上传文件</el-button>
      </div>
    </div>

    <el-table :data="filtered" size="small" border max-height="380" v-loading="loading" empty-text="本项目暂无文件">
      <el-table-column label="文件" min-width="240">
        <template #default="{ row }">
          <div class="pf-file">
            <span class="pf-icon" :style="'background:' + catColor(row.category)">{{ thumbIcon(row.file_ext) }}</span>
            <div class="pf-file-meta">
              <div class="pf-name">{{ row.title }}</div>
              <div class="pf-sub">
                <span class="pf-tag" :style="'background:' + catColor(row.category)">{{ catLabel(row.category) }}</span>
                {{ sizeText(row.file_size) }} · .{{ (row.file_ext || '').toLowerCase() }}
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="uploader_name" label="上传人" width="100">
        <template #default="{ row }">{{ row.uploader_name || '-' }}</template>
      </el-table-column>
      <el-table-column label="上传时间" width="140">
        <template #default="{ row }">{{ fmtTime(row.uploaded_at) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="88">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small" effect="light">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canPreview(row)" type="primary" link size="small" @click="openPreview(row)">预览</el-button>
          <el-button v-else-if="isPreviewable(row.file_ext) && row.preview_error" type="danger" link size="small" @click="showPreviewError(row)">转换失败</el-button>
          <el-button type="primary" link size="small" @click="download(row)">下载</el-button>
          <el-button v-if="canDelete(row)" type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 上传弹窗 -->
    <el-dialog v-model="uploadVisible" title="上传项目文件" width="520px" append-to-body destroy-on-close>
      <el-form label-width="72px">
        <el-form-item label="项目">
          <span class="pf-project-name">{{ projectName || ('项目 #' + projectId) }}</span>
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="uploadForm.category" placeholder="选择文件分类" style="width:100%">
            <el-option v-for="c in FILE_CATEGORIES" :key="c.key" :label="c.icon + ' ' + c.label" :value="c.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件" required>
          <el-upload
            drag
            :auto-upload="false"
            :limit="1"
            :file-list="uploadFiles"
            :on-change="onFileChange"
            :on-remove="() => (uploadFiles = [])"
            :on-exceed="onExceed"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip,.rar"
            style="width:100%"
          >
            <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 PDF / 图片 / Office / CAD / 压缩包，单文件 ≤ 100MB</div>
              <div class="el-upload__tip pf-rule">审核通过后文件不可删除，请确认无误后再提交</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="uploadForm.description" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" :title="previewTitle" width="80%" top="5vh" append-to-body destroy-on-close>
      <div class="pf-preview">
        <img v-if="previewKind === 'image'" :src="previewUrl" class="pf-preview-img" />
        <iframe v-else-if="previewKind === 'pdf'" :src="previewUrl" class="pf-preview-frame"></iframe>
        <el-empty v-else description="该文件类型不支持在线预览，请下载后查看" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { FILE_CATEGORIES } from '../utils/file-categories'

const props = defineProps({
  projectId: { type: [Number, String], default: 0 },
  projectName: { type: String, default: '' },
})

const userStore = useUserStore()
const uid = computed(() => userStore.userId || 0)
const canWrite = computed(() => userStore.canAction('project_file', 'write') || userStore.isAdmin)

const loading = ref(false)
const files = ref([])
const curCategory = ref('')

const filtered = computed(() => (curCategory.value ? files.value.filter((f) => f.category === curCategory.value) : files.value))
const catCount = (key) => files.value.filter((f) => f.category === key).length

const catLabel = (key) => {
  const c = FILE_CATEGORIES.find((x) => x.key === key)
  return c ? c.label : (key || '未分类')
}
const catColor = (key) => {
  const c = FILE_CATEGORIES.find((x) => x.key === key)
  return c ? c.color : '#F3F4F6'
}
const statusText = (s) => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝', revoked: '已撤销' }[s] || s || '-')
const statusTagType = (s) => ({ approved: 'success', pending: 'warning', rejected: 'danger', revoked: 'info' }[s] || 'info')
const isImage = (ext) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes((ext || '').toLowerCase())
const isPdf = (ext) => (ext || '').toLowerCase() === 'pdf'
const isPreviewable = (ext) => ['dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes((ext || '').toLowerCase())
const sizeText = (bytes) => {
  const n = Number(bytes) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
const thumbIcon = (ext) => {
  const e = (ext || '').toLowerCase()
  if (isImage(e)) return '🖼'
  if (e === 'pdf') return '📕'
  if (['doc', 'docx'].includes(e)) return '📘'
  if (['xls', 'xlsx'].includes(e)) return '📗'
  if (['ppt', 'pptx'].includes(e)) return '📙'
  if (['zip', 'rar'].includes(e)) return '🗜'
  if (['dwg', 'dxf'].includes(e)) return '📐'
  return '📎'
}
const fmtTime = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '-')

const canPreview = (row) => isImage(row.file_ext) || isPdf(row.file_ext) || (isPreviewable(row.file_ext) && !!row.pdf_preview_url)
const canDelete = (row) => {
  // 规则（v2.3.11）：已通过审核的文件视为归档凭证，任何人（含管理员）都不可删除
  if (row.status === 'approved') return false
  if (userStore.isAdmin) return true
  return Number(row.uploaded_by) === Number(uid.value)
}

// ⚠️ img / iframe 带不了自定义请求头，用户身份走 query.user_id
const inlineUrl = (id) => `/api/project-files/${id}/download?user_id=${uid.value}&inline=1`
const downloadUrl = (id) => `/api/project-files/${id}/download?user_id=${uid.value}`

const loadFiles = async () => {
  if (!props.projectId) { files.value = []; return }
  loading.value = true
  try {
    const res = await axios.get('/api/project-files', { params: { project_id: props.projectId, page: 1, pageSize: 200 } })
    const data = res.data || {}
    files.value = Array.isArray(data.list) ? data.list : []
  } catch (e) {
    files.value = []
    ElMessage.error(e?.response?.data?.error || '加载项目文件失败')
  } finally {
    loading.value = false
  }
}

const pickCat = (key) => { curCategory.value = key }

// ---------- 上传 ----------
const uploadVisible = ref(false)
const uploading = ref(false)
const uploadFiles = ref([])
const uploadForm = ref({ category: '', description: '' })
const pickedFile = ref(null)

const openUpload = () => {
  uploadForm.value = { category: '', description: '' }
  uploadFiles.value = []
  pickedFile.value = null
  uploadVisible.value = true
}

const onFileChange = (file) => {
  // limit=1：新选的文件替换旧的
  uploadFiles.value = [file]
  pickedFile.value = file.raw || null
}
const onExceed = (files) => {
  const f = files[0]
  uploadFiles.value = [{ name: f.name, raw: f }]
  pickedFile.value = f
}

const submitUpload = async () => {
  if (!uploadForm.value.category) return ElMessage.warning('请选择文件分类')
  if (!pickedFile.value) return ElMessage.warning('请选择要上传的文件')
  const fd = new FormData()
  fd.append('file', pickedFile.value)
  fd.append('project_id', String(props.projectId))
  fd.append('category', uploadForm.value.category)
  if (uploadForm.value.description) fd.append('description', uploadForm.value.description)
  uploading.value = true
  try {
    await axios.post('/api/project-files', fd)
    ElMessage.success('上传成功，待审核')
    uploadVisible.value = false
    await loadFiles()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '上传失败')
  } finally {
    uploading.value = false
  }
}

// ---------- 预览 ----------
const previewVisible = ref(false)
const previewUrl = ref('')
const previewKind = ref('')
const previewTitle = ref('')

const openPreview = (row) => {
  previewTitle.value = row.title
  if (isImage(row.file_ext)) { previewKind.value = 'image'; previewUrl.value = inlineUrl(row.id) }
  else if (isPdf(row.file_ext)) { previewKind.value = 'pdf'; previewUrl.value = inlineUrl(row.id) }
  else if (row.pdf_preview_url) { previewKind.value = 'pdf'; previewUrl.value = row.pdf_preview_url }
  else { previewKind.value = 'none'; previewUrl.value = '' }
  previewVisible.value = true
}

const showPreviewError = (row) => {
  ElMessageBox.alert(row.preview_error || '未知错误', 'PDF 转换失败', { type: 'error', confirmButtonText: '我知道了' })
}

const download = (row) => window.open(downloadUrl(row.id), '_blank')

const handleDelete = async (row) => {
  if (row.status === 'approved') return ElMessage.warning('该文件已通过审核，不允许删除')
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？物理文件会一并删除，不可恢复。`, '删除项目文件', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await axios.delete(`/api/project-files/${row.id}`)
    ElMessage.success('已删除')
    loadFiles()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

watch(() => props.projectId, (v) => { if (v) loadFiles() })
onMounted(loadFiles)
</script>

<style scoped>
.pf-panel { padding: 2px 0; }
.pf-toolbar {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
}
.pf-cats { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.pf-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 12px;
  background: #F5F7FA; color: #606266;
  font-size: 12px; cursor: pointer;
  border: 1px solid transparent;
  transition: all .15s;
}
.pf-chip:hover { background: #EBF3FF; color: #1E3A5F; }
.pf-chip.active { background: #1E3A5F; color: #fff; border-color: #1E3A5F; }
.pf-chip em { font-style: normal; font-size: 11px; opacity: .75; }
.pf-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.pf-right { display: flex; align-items: center; gap: 10px; }
.pf-total { font-size: 12px; color: #909399; }

.pf-file { display: flex; align-items: center; gap: 10px; }
.pf-icon {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; flex-shrink: 0;
}
.pf-file-meta { min-width: 0; }
.pf-name { font-size: 13px; font-weight: 600; color: #1E3A5F; line-height: 1.4; word-break: break-all; }
.pf-sub { font-size: 11px; color: #909399; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
.pf-tag { padding: 0 6px; border-radius: 6px; color: #1E3A5F; line-height: 16px; }
.pf-project-name { font-size: 13px; color: #1E3A5F; font-weight: 500; }
.pf-rule { color: #E6A23C; }

.pf-preview { height: 68vh; display: flex; align-items: center; justify-content: center; }
.pf-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pf-preview-frame { width: 100%; height: 100%; border: none; }
</style>
