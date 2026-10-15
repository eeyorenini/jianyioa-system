<template>
  <div class="project-files">
    <h2 class="page-title">📎 项目文件</h2>

    <!-- 项目选择 + 状态筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-row :gutter="12" align="middle">
        <el-col :span="10">
          <el-select v-model="filterProject" placeholder="选择项目" clearable filterable style="width: 100%" @change="loadList">
            <el-option label="（请选择项目）" :value="0" />
            <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 100%" @change="loadList">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已撤销" value="revoked" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select v-model="filterCategory" placeholder="分类" clearable style="width: 100%" @change="loadList">
            <el-option v-for="c in FILE_CATEGORIES" :key="c.key" :label="c.label" :value="c.key" />
          </el-select>
        </el-col>
        <el-col :span="2">
          <el-button type="primary" @click="loadList" style="width: 100%">刷新</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 文件列表 -->
    <el-card shadow="never" style="margin-top: 12px">
      <el-table :data="files" v-loading="loading" stripe empty-text="暂无文件">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="文件" min-width="280">
          <template #default="scope">
            <div class="file-cell">
              <div class="file-icon" :style="'background:' + catColor(scope.row.category)">
                {{ thumbIcon(scope.row.file_ext) }}
              </div>
              <div class="file-meta">
                <div class="file-name">{{ scope.row.title }}</div>
                <div class="file-sub">
                  <el-tag size="small" :style="'background:' + catColor(scope.row.category) + ';color:#1E3A5F'">
                    {{ catLabel(scope.row.category) }}
                  </el-tag>
                  <span class="file-size">{{ sizeText(scope.row.file_size) }}</span>
                  <span class="file-ext">.{{ (scope.row.file_ext || '').toLowerCase() }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="uploader_name" label="上传人" width="100" />
        <el-table-column prop="uploaded_at" label="上传时间" width="160" />
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" effect="light" size="small">
              {{ statusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预览" width="180" fixed="right">
          <template #default="scope">
            <!-- v2.3.6 hotfix 10-15：CAD + Office 文件统一入口 -->
            <!-- 1) 有 PDF 预览：显示预览按钮 -->
            <el-button v-if="isPreviewable(scope.row.file_ext) && scope.row.pdf_preview_url"
              type="primary" size="small" @click="openPdfPreview(scope.row.pdf_preview_url)">
              📄 预览 PDF
            </el-button>
            <!-- 2) 转换失败：红字提示，点击查看错误 -->
            <el-tag v-else-if="isPreviewable(scope.row.file_ext) && scope.row.preview_error"
              type="danger" size="small" effect="dark" style="cursor:pointer"
              @click="showPreviewError(scope.row)">
              ❌ 转换失败
            </el-tag>
            <!-- 3) 还没生成完：等待 -->
            <el-tag v-else-if="isPreviewable(scope.row.file_ext)" type="warning" size="small" effect="plain">
              ⏳ 生成中
            </el-tag>
            <!-- 4) 图片类型 -->
            <el-button v-else-if="isImage(scope.row.file_ext)"
              size="small" @click="openPdfPreview(downloadUrl(scope.row.id, true))">
              🖼 查看图片
            </el-button>
            <!-- 5) 其他类型：直接下载 -->
            <el-button v-else type="default" size="small" @click="openPdfPreview(downloadUrl(scope.row.id))">
              ⬇ 下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FILE_CATEGORIES } from '../utils/file-categories'

const userStore = useUserStore()
const router = useRouter()

const loading = ref(false)
const files = ref([])
const projectList = ref([])
const filterProject = ref(0)
const filterStatus = ref('')
const filterCategory = ref('')

const FILE_CATEGORIES_LOCAL = FILE_CATEGORIES

const isImage = (ext) => ['jpg','jpeg','png','gif','webp'].includes((ext || '').toLowerCase())
const isCad = (ext) => ['dwg','dxf'].includes((ext || '').toLowerCase())
// v2.3.6 hotfix 10-15：CAD + Office 文件都走 PDF 预览入口
const isPreviewable = (ext) => ['dwg','dxf','doc','docx','xls','xlsx','ppt','pptx'].includes((ext || '').toLowerCase())

// v2.3.6 hotfix 10-15：点击"转换失败"显示错误详情
const showPreviewError = (row) => {
  ElMessageBox.alert(row.preview_error || '未知错误', 'PDF 转换失败', {
    type: 'error',
    confirmButtonText: '我知道了',
  })
}

const catLabel = (key) => {
  const c = FILE_CATEGORIES_LOCAL.find(x => x.key === key)
  return c ? c.label : key
}
const catColor = (key) => {
  const c = FILE_CATEGORIES_LOCAL.find(x => x.key === key)
  return c ? c.color : '#F3F4F6'
}
const sizeText = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
const statusText = (s) => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝', revoked: '已撤销' }[s] || s)
const statusTagType = (s) => ({ approved: 'success', pending: 'warning', rejected: 'danger', revoked: 'info' }[s] || 'info')
const thumbIcon = (ext) => {
  const e = (ext || '').toLowerCase()
  if (isImage(e)) return '🖼'
  if (e === 'pdf') return '📕'
  if (['doc','docx'].includes(e)) return '📘'
  if (['xls','xlsx'].includes(e)) return '📗'
  if (['ppt','pptx'].includes(e)) return '📙'
  if (['zip','rar'].includes(e)) return '🗜'
  if (['dwg','dxf'].includes(e)) return '📐'
  return '📎'
}

const uid = () => userStore.state.id || 0
const downloadUrl = (id, inline = false) => {
  return `/api/project-files/${id}/download?user_id=${uid()}${inline ? '&inline=1' : ''}`
}

const openPdfPreview = (url) => {
  if (!url) return
  window.open(url, '_blank')
}

const loadList = async () => {
  if (!filterProject.value) {
    files.value = []
    return
  }
  loading.value = true
  try {
    const params = { project_id: filterProject.value }
    if (filterStatus.value) params.status = filterStatus.value
    if (filterCategory.value) params.category = filterCategory.value
    const res = await axios.get('/api/project-files', { params })
    files.value = (res.data && Array.isArray(res.data.list)) ? res.data.list : []
  } catch (e) {
    console.error('加载项目文件失败', e)
    files.value = []
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadProjects = async () => {
  try {
    const res = await axios.get('/api/projects')
    projectList.value = Array.isArray(res.data) ? res.data : (res.data.list || [])
  } catch (e) {
    projectList.value = []
  }
}

onMounted(() => {
  loadProjects()
  loadList()
})
</script>

<style scoped>
.project-files { padding: 20px 24px 40px; }
.page-title {
  font-size: 22px; font-weight: 700; color: #1E3A5F;
  margin: 0 0 20px;
}
.filter-card { margin-bottom: 0; }

.file-cell { display: flex; align-items: center; gap: 12px; }
.file-icon {
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.file-name {
  font-size: 14px; font-weight: 600; color: #1E3A5F;
  line-height: 1.4;
  word-break: break-all;
}
.file-sub {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #909399;
  margin-top: 4px;
}
.file-size { font-family: 'SF Mono', Menlo, monospace; }
.file-ext { color: #6B7280; }
</style>
