<template>
  <div class="project-files">
    <!-- 顶部：状态统计（点击即筛选） -->
    <div class="stat-row">
      <div
        v-for="s in statusCards"
        :key="s.key"
        class="stat-card"
        :class="{ active: filterStatus === s.key }"
        @click="pickStatus(s.key)"
      >
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value" :style="{ color: s.color }">{{ s.count }}</div>
        <div class="stat-bar" :style="{ background: s.color }"></div>
      </div>
    </div>

    <!-- 检索区 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="搜索项目名称 / 文件名 / 备注"
          clearable
          class="kw-input"
          :prefix-icon="Search"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select
          v-model="filterProject"
          placeholder="全部项目"
          clearable
          filterable
          class="proj-select"
          @change="reload"
        >
          <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="全部状态" clearable class="status-select" @change="reload">
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="已撤销" value="revoked" />
        </el-select>
        <el-button type="primary" @click="reload">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <!-- 分类检索 -->
      <div class="cat-row">
        <div class="cat-chip" :class="{ active: !filterCategory }" @click="pickCategory('')">
          <span class="chip-text">全部分类</span>
          <span class="chip-count">{{ totalAll }}</span>
        </div>
        <div
          v-for="c in FILE_CATEGORIES"
          :key="c.key"
          class="cat-chip"
          :class="{ active: filterCategory === c.key }"
          @click="pickCategory(c.key)"
        >
          <span class="chip-dot" :style="{ background: c.color }"></span>
          <span class="chip-text">{{ c.icon }} {{ c.label }}</span>
          <span class="chip-count">{{ (stats.byCategory || {})[c.key] || 0 }}</span>
        </div>
      </div>
    </el-card>

    <!-- 文件列表 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="files" v-loading="loading" stripe empty-text="暂无文件">
        <el-table-column label="项目" min-width="150" show-overflow-tooltip>
          <template #default="scope">
            <span class="proj-name">{{ scope.row.project_name || ('项目 #' + scope.row.project_id) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="文件" min-width="300">
          <template #default="scope">
            <div class="file-cell">
              <div class="file-icon" :style="'background:' + catColor(scope.row.category)">
                {{ thumbIcon(scope.row.file_ext) }}
              </div>
              <div class="file-meta">
                <div class="file-name">{{ scope.row.title }}</div>
                <div class="file-sub">
                  <el-tag size="small" effect="light" :style="'background:' + catColor(scope.row.category) + ';color:#1E3A5F;border:none'">
                    {{ catLabel(scope.row.category) }}
                  </el-tag>
                  <span class="file-size">{{ sizeText(scope.row.file_size) }}</span>
                  <span class="file-ext">.{{ (scope.row.file_ext || '').toLowerCase() }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="uploader_name" label="上传人" width="100">
          <template #default="scope">{{ scope.row.uploader_name || '-' }}</template>
        </el-table-column>

        <el-table-column label="上传时间" width="150">
          <template #default="scope">{{ fmtTime(scope.row.uploaded_at) }}</template>
        </el-table-column>

        <el-table-column label="状态" width="96">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" effect="light" size="small">
              {{ statusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="审核" width="140" show-overflow-tooltip>
          <template #default="scope">
            <template v-if="scope.row.reviewer_name">
              <span class="reviewer">{{ scope.row.reviewer_name }}</span>
              <span v-if="scope.row.review_comment" class="review-comment">「{{ scope.row.review_comment }}」</span>
            </template>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="212" fixed="right">
          <template #default="scope">
            <el-button
              v-if="canPreview(scope.row)"
              type="primary" link size="small"
              @click="openPreview(scope.row)"
            >预览</el-button>
            <el-button
              v-else-if="isPreviewable(scope.row.file_ext) && scope.row.preview_error"
              type="danger" link size="small"
              @click="showPreviewError(scope.row)"
            >转换失败</el-button>
            <el-button type="primary" link size="small" @click="download(scope.row)">下载</el-button>
            <el-button
              v-if="scope.row.status === 'pending' && canApprove"
              type="warning" link size="small"
              @click="openReview(scope.row)"
            >审核</el-button>
            <el-button
              v-if="canDelete(scope.row)"
              type="danger" link size="small"
              @click="handleDelete(scope.row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadList"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" :title="previewTitle" width="80%" top="5vh" destroy-on-close>
      <div class="preview-body">
        <img v-if="previewKind === 'image'" :src="previewUrl" class="preview-img" />
        <iframe v-else-if="previewKind === 'pdf'" :src="previewUrl" class="preview-frame"></iframe>
        <el-empty v-else description="该文件类型不支持在线预览，请下载后查看" />
      </div>
    </el-dialog>

    <!-- 审核弹窗 -->
    <el-dialog v-model="reviewVisible" title="审核项目文件" width="560px" destroy-on-close>
      <div class="review-file">
        <div class="file-icon" :style="'background:' + catColor(reviewRow.category)">
          {{ thumbIcon(reviewRow.file_ext) }}
        </div>
        <div>
          <div class="review-title">{{ reviewRow.title }}</div>
          <div class="review-sub">
            {{ reviewRow.project_name || ('项目 #' + reviewRow.project_id) }}
            · {{ catLabel(reviewRow.category) }}
            · {{ sizeText(reviewRow.file_size) }}
          </div>
        </div>
      </div>
      <el-form :model="reviewForm" label-width="90px" style="margin-top:16px">
        <el-form-item label="审核结果">
          <el-radio-group v-model="reviewForm.action">
            <el-radio value="approve">通过</el-radio>
            <el-radio value="reject">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审核意见">
          <el-input
            v-model="reviewForm.comment"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="可选，拒绝时建议说明原因（上传人会收到站内通知）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="reviewSubmitting" @click="submitReview">提交审核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { FILE_CATEGORIES } from '../utils/file-categories'

const userStore = useUserStore()

// ---------- 权限 ----------
const uid = computed(() => userStore.userId || 0)
const isAdmin = computed(() => userStore.isAdmin)
const canApprove = computed(() => userStore.canAction('project_file', 'approve'))

// ---------- 数据 ----------
const loading = ref(false)
const files = ref([])
const projectList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const stats = ref({ byCategory: {}, byStatus: {} })

// ---------- 筛选条件 ----------
const keyword = ref('')
const filterProject = ref('')
const filterStatus = ref('')
const filterCategory = ref('')

const totalAll = computed(() => {
  const bs = stats.value.byStatus || {}
  return Object.values(bs).reduce((a, b) => a + (Number(b) || 0), 0)
})

const statusCards = computed(() => {
  const bs = stats.value.byStatus || {}
  return [
    { key: '', label: '全部文件', count: totalAll.value, color: '#1E3A5F' },
    { key: 'pending', label: '待审核', count: bs.pending || 0, color: '#E6A23C' },
    { key: 'approved', label: '已通过', count: bs.approved || 0, color: '#10B981' },
    { key: 'rejected', label: '已拒绝', count: bs.rejected || 0, color: '#EF4444' },
  ]
})

// ---------- 分类 / 状态 展示辅助 ----------
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
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
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
const fmtTime = (v) => {
  if (!v) return '-'
  return String(v).replace('T', ' ').slice(0, 16)
}

// ---------- 权限判断 ----------
// 可在线预览：图片 / PDF 原件 / CAD/Office 已生成 PDF 预览
const canPreview = (row) => isImage(row.file_ext) || isPdf(row.file_ext) || (isPreviewable(row.file_ext) && !!row.pdf_preview_url)
const canDelete = (row) => {
  // 规则（v2.3.11）：已通过审核的文件视为归档凭证，任何人（含管理员）都不可删除
  if (row.status === 'approved') return false
  if (isAdmin.value) return true
  return Number(row.uploaded_by) === Number(uid.value)
}

// ---------- 接口 ----------
// inline=1 让后端返回 Content-Disposition: inline，浏览器内联渲染
// ⚠️ iframe/img 带不了自定义请求头，用户身份走 query.user_id（后端 getUserId 支持）
const inlineUrl = (id) => `/api/project-files/${id}/download?user_id=${uid.value}&inline=1`
const downloadUrl = (id) => `/api/project-files/${id}/download?user_id=${uid.value}`

const loadList = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    if (filterProject.value) params.project_id = filterProject.value
    if (filterStatus.value) params.status = filterStatus.value
    if (filterCategory.value) params.category = filterCategory.value
    const res = await axios.get('/api/project-files', { params })
    const data = res.data || {}
    files.value = Array.isArray(data.list) ? data.list : []
    total.value = Number(data.total) || 0
    stats.value = data.stats || { byCategory: {}, byStatus: {} }
  } catch (e) {
    console.error('加载项目文件失败', e)
    files.value = []
    total.value = 0
    const msg = e?.response?.data?.error || '加载失败'
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}

const loadProjects = async () => {
  try {
    // ?picker=1：上传/筛选用的项目下拉只返回「我实际关联的项目」（admin 返回全部）
    const res = await axios.get('/api/projects?picker=1')
    projectList.value = Array.isArray(res.data) ? res.data : (res.data.list || [])
  } catch (e) {
    // 只有 project_file 权限、没有 project 权限时这里会 403，下拉为空但关键词检索仍可用
    projectList.value = []
  }
}

// ---------- 筛选交互 ----------
const reload = () => {
  page.value = 1
  loadList()
}
const onSizeChange = () => {
  page.value = 1
  loadList()
}
const pickStatus = (key) => {
  filterStatus.value = filterStatus.value === key ? '' : key
  reload()
}
const pickCategory = (key) => {
  filterCategory.value = key
  reload()
}
const resetFilters = () => {
  keyword.value = ''
  filterProject.value = ''
  filterStatus.value = ''
  filterCategory.value = ''
  reload()
}

// ---------- 预览 ----------
const previewVisible = ref(false)
const previewUrl = ref('')
const previewKind = ref('')
const previewTitle = ref('')

const openPreview = (row) => {
  previewTitle.value = row.title
  if (isImage(row.file_ext)) {
    previewKind.value = 'image'
    previewUrl.value = inlineUrl(row.id)
  } else if (isPdf(row.file_ext)) {
    previewKind.value = 'pdf'
    previewUrl.value = inlineUrl(row.id)
  } else if (row.pdf_preview_url) {
    previewKind.value = 'pdf'
    previewUrl.value = row.pdf_preview_url
  } else {
    previewKind.value = 'none'
    previewUrl.value = ''
  }
  previewVisible.value = true
}

const showPreviewError = (row) => {
  ElMessageBox.alert(row.preview_error || '未知错误', 'PDF 转换失败', {
    type: 'error',
    confirmButtonText: '我知道了',
  })
}

const download = (row) => {
  window.open(downloadUrl(row.id), '_blank')
}

// ---------- 审核 ----------
const reviewVisible = ref(false)
const reviewSubmitting = ref(false)
const reviewRow = ref({})
const reviewForm = ref({ action: 'approve', comment: '' })

const openReview = (row) => {
  reviewRow.value = row
  reviewForm.value = { action: 'approve', comment: '' }
  reviewVisible.value = true
}

const submitReview = async () => {
  reviewSubmitting.value = true
  try {
    await axios.post(`/api/project-files/${reviewRow.value.id}/review`, {
      action: reviewForm.value.action,
      comment: reviewForm.value.comment || '',
    })
    ElMessage.success(reviewForm.value.action === 'approve' ? '已通过' : '已拒绝')
    reviewVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '审核失败')
  } finally {
    reviewSubmitting.value = false
  }
}

// ---------- 删除 ----------
const handleDelete = async (row) => {
  if (row.status === 'approved') return ElMessage.warning('该文件已通过审核，不允许删除')
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.title}」？物理文件会一并删除，不可恢复。`,
      '删除项目文件',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    await axios.delete(`/api/project-files/${row.id}`)
    ElMessage.success('已删除')
    if (files.value.length === 1 && page.value > 1) page.value -= 1
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

onMounted(() => {
  loadProjects()
  loadList()
})
</script>

<style scoped>
.project-files { padding: 20px 24px 40px; }

/* 统计卡 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}
.stat-card {
  position: relative;
  background: #fff;
  border-radius: 10px;
  padding: 16px 18px 18px;
  cursor: pointer;
  overflow: hidden;
  border: 1px solid #EBEEF5;
  transition: all .18s ease;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(30,58,95,.08); }
.stat-card.active { border-color: #1E3A5F; box-shadow: 0 6px 18px rgba(30,58,95,.12); }
.stat-label { font-size: 13px; color: #6B7280; }
.stat-value { font-size: 28px; font-weight: 700; line-height: 1.3; margin-top: 4px; }
.stat-bar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  opacity: .85;
}

/* 检索区 */
.filter-card { margin-bottom: 14px; }
.filter-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.kw-input { width: 300px; }
.proj-select { width: 220px; }
.status-select { width: 140px; }

.cat-row {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 14px;
  border-top: 1px dashed #EBEEF5;
}
.cat-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  background: #F5F7FA;
  font-size: 13px; color: #606266;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all .15s ease;
}
.cat-chip:hover { background: #EBF3FF; color: #1E3A5F; }
.cat-chip.active { background: #1E3A5F; color: #fff; border-color: #1E3A5F; }
.cat-chip.active .chip-count { background: rgba(255,255,255,.22); color: #fff; }
.chip-dot { width: 8px; height: 8px; border-radius: 50%; }
.chip-count {
  font-size: 11px; padding: 0 6px;
  border-radius: 8px;
  background: #E4E7ED; color: #606266;
  line-height: 16px;
}

/* 表格 */
.table-card { margin-bottom: 0; }
.proj-name { color: #1E3A5F; font-weight: 500; }
.file-cell { display: flex; align-items: center; gap: 12px; }
.file-icon {
  width: 42px; height: 42px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.file-meta { min-width: 0; }
.file-name {
  font-size: 14px; font-weight: 600; color: #1E3A5F;
  line-height: 1.4; word-break: break-all;
}
.file-sub {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #909399;
  margin-top: 4px;
}
.file-size { font-family: 'SF Mono', Menlo, monospace; }
.file-ext { color: #6B7280; }
.reviewer { color: #303133; }
.review-comment { color: #E6A23C; margin-left: 4px; }
.muted { color: #C0C4CC; }

.pager { margin-top: 16px; display: flex; justify-content: flex-end; }

/* 预览 */
.preview-body { height: 72vh; display: flex; align-items: center; justify-content: center; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.preview-frame { width: 100%; height: 100%; border: none; }

/* 审核 */
.review-file { display: flex; align-items: center; gap: 12px; }
.review-title { font-size: 15px; font-weight: 600; color: #1E3A5F; word-break: break-all; }
.review-sub { font-size: 12px; color: #909399; margin-top: 4px; }

@media screen and (max-width: 1200px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
  .kw-input { width: 220px; }
  .proj-select { width: 180px; }
}
</style>
