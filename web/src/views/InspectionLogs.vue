<template>
  <div class="inspection-logs">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>巡检日志</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-select
              v-if="activeTab === 'rectify'"
              v-model="rectifyFilterProject"
              placeholder="选择项目"
              clearable filterable style="width:180px"
              @change="loadRectifyList"
            >
              <el-option label="全部项目" :value="0" />
              <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-select
              v-else
              v-model="filterProject"
              placeholder="选择项目"
              clearable filterable style="width:180px"
              @change="loadLogs"
            >
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

      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- 整改问题（与移动端同源：rectification_issues） -->
        <el-tab-pane label="整改问题" name="rectify">
          <el-table :data="rectifyList" style="width:100%" v-loading="rectifyListLoading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="project_name" label="项目名称" width="150">
              <template #default="scope">
                {{ scope.row.project_name || scope.row.project_id || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="title" label="问题标题" width="140" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.title || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="issue_desc" label="问题描述" min-width="200" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.issue_desc || scope.row.description || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="location" label="位置" width="120" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.location || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="level" label="严重程度" width="100">
              <template #default="scope">
                <el-tag v-if="scope.row.level" :type="getSeverityTagType(scope.row.level)" size="small">
                  {{ getSeverityText(scope.row.level) }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="responsible_name" label="负责人" width="100">
              <template #default="scope">
                {{ scope.row.responsible_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="due_date" label="整改期限" width="120">
              <template #default="scope">
                <span :style="{ color: isOverdue(scope.row) ? '#f56c6c' : '' }">{{ scope.row.due_date || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="110">
              <template #default="scope">
                <el-tag :type="getRectifyStatusType(scope.row)" size="small">
                  {{ getRectifyStatus(scope.row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160" />
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="scope">
                <el-button size="small" type="primary" @click="openRectifyDetail(scope.row.id)">处理</el-button>
                <el-button size="small" type="danger" @click="handleDeleteRectify(scope.row)" v-if="userStore.isAdmin">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top:16px;display:flex;justify-content:center">
            <el-pagination
              v-model:current-page="rectifyPage"
              v-model:page-size="rectifyPageSize"
              :total="rectifyTotal"
              :page-sizes="[10,20,50]"
              layout="total,sizes,prev,pager,next"
            />
          </div>
        </el-tab-pane>

        <!-- 巡检记录（inspections 表，PC 端历史数据） -->
        <el-tab-pane label="巡检记录" name="inspections">
          <el-table :data="logList" style="width:100%" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="project_name" label="项目名称" width="150">
              <template #default="scope">
                {{ scope.row.project_name || scope.row.project_id || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="operator" label="提交人" width="100" />
            <el-table-column prop="location" label="巡检地点" width="150" show-overflow-tooltip />
            <el-table-column prop="result" label="巡检结果" min-width="200" show-overflow-tooltip />
            <el-table-column prop="images" label="图片" width="80">
              <template #default="scope">
                <span v-if="getImageCount(scope.row.images) > 0" style="color:#409eff;cursor:pointer" @click="previewImages(scope.row)">
                  {{ getImageCount(scope.row.images) }}
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
        </el-tab-pane>
      </el-tabs>
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

    <!-- 整改详情（从待办中心跳转） -->
    <el-dialog v-model="rectifyVisible" title="整改详情" width="700px" destroy-on-close>
      <div v-if="rectifyLoading" style="text-align:center;padding:40px">
        <el-icon class="is-loading" style="font-size:28px"><Loading /></el-icon>
        <p style="color:#909399;margin-top:8px">加载中…</p>
      </div>
      <div v-else-if="!rectifyDetail" style="text-align:center;padding:40px;color:#909399">
        记录不存在或已被删除
      </div>
      <div v-else class="rectify-detail">
        <!-- 状态栏 -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <el-tag :type="getRectifyStatusType(rectifyDetail)" size="large">
            {{ getRectifyStatus(rectifyDetail) }}
          </el-tag>
          <span v-if="rectifyDetail.due_date" style="color:#f56c6c;font-size:13px">
            期限：{{ rectifyDetail.due_date }}
          </span>
        </div>

        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="项目">{{ rectifyDetail.project_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检查项">{{ rectifyDetail.category || '-' }}</el-descriptions-item>
          <el-descriptions-item label="问题位置">{{ rectifyDetail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="严重程度">
            <el-tag :type="getSeverityTagType(rectifyDetail.level)" size="small">
              {{ getSeverityText(rectifyDetail.level) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="负责人">{{ rectifyDetail.responsible_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ rectifyDetail.created_at || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div style="margin-top:16px">
          <div class="detail-label">问题描述</div>
          <div class="detail-content">{{ rectifyDetail.issue_desc || rectifyDetail.description || '无' }}</div>
        </div>

        <div v-if="rectifyDetail.remark" style="margin-top:12px">
          <div class="detail-label">备注 / 整改记录</div>
          <div class="detail-content">{{ rectifyDetail.remark }}</div>
        </div>

        <div v-if="getRectifyImages(rectifyDetail).length > 0" style="margin-top:16px">
          <div class="detail-label">现场照片</div>
          <div class="detail-images">
            <el-image
              v-for="(img, idx) in getRectifyImages(rectifyDetail)"
              :key="idx"
              :src="img.startsWith('http') ? img : img"
              fit="cover"
              class="detail-img"
              :preview-src-list="getRectifyImages(rectifyDetail)"
              :preview-index="idx"
            />
          </div>
        </div>

        <!-- 受理信息（有受理人才显示） -->
        <div v-if="rectifyDetail.accept_name || rectifyDetail.accept_date" style="margin-top:16px;padding-top:16px;border-top:1px solid #ebeef5">
          <div class="detail-label">受理信息</div>
          <div class="detail-content">
            受理人：{{ rectifyDetail.accept_name || '-' }}{{ rectifyDetail.accept_date ? ' · ' + rectifyDetail.accept_date : '' }}
          </div>
        </div>

        <!-- 延期记录 -->
        <div v-if="rectifyDelayLogs.length > 0" style="margin-top:16px;padding-top:16px;border-top:1px solid #ebeef5">
          <div class="detail-label">延期记录（{{ rectifyDelayLogs.length }} 次）</div>
          <div v-for="(log, idx) in rectifyDelayLogs" :key="idx" style="padding:8px 10px;background:#fdf6ec;border-radius:6px;margin-bottom:8px;font-size:13px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span style="font-weight:600;color:#E6A23C">第 {{ idx + 1 }} 次延期</span>
              <span style="color:#909399">{{ log.at || '' }}</span>
            </div>
            <div style="color:#606266;margin-top:4px">
              {{ log.from || '未设置' }} → <span style="color:#f56c6c;font-weight:600">{{ log.to || '-' }}</span>
            </div>
            <div v-if="log.reason" style="color:#909399;margin-top:2px">原因：{{ log.reason }}</div>
            <div v-if="log.by" style="color:#909399;margin-top:2px">操作人：{{ log.by }}</div>
          </div>
        </div>

        <!-- 操作区：按业务流程分状态（与移动端口径一致） -->
        <!-- 待处理 → 受理（可同步修改整改截止时间） -->
        <div v-if="getRectifyStatus(rectifyDetail) === '待处理'" style="margin-top:20px;padding-top:16px;border-top:1px solid #ebeef5">
          <div class="detail-label">受理整改</div>
          <div style="color:#909399;font-size:12px;margin-bottom:8px">
            原截止时间：{{ rectifyDetail.due_date || '未设置' }}。如时间不合理可一并调整：
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <el-date-picker v-model="fixForm.acceptDue" type="date" value-format="YYYY-MM-DD"
              placeholder="新截止时间（选填）" style="width:180px" size="small" />
            <el-input v-model="fixForm.acceptRemark" placeholder="受理说明（选填）" style="width:220px" size="small" />
            <el-button type="primary" size="small" :loading="fixing" @click="submitAccept">确认受理</el-button>
          </div>
        </div>
        <!-- 处理中 → 申请延期 / 申报完成 -->
        <div v-else-if="getRectifyStatus(rectifyDetail) === '处理中'" style="margin-top:20px;padding-top:16px;border-top:1px solid #ebeef5">
          <div class="detail-label">申请延期</div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <el-date-picker v-model="fixForm.delayDue" type="date" value-format="YYYY-MM-DD"
              placeholder="延期至（必填）" style="width:170px" size="small" />
            <el-input v-model="fixForm.delayReason" placeholder="延期原因（必填）" style="width:220px" size="small" />
            <el-button size="small" :loading="fixing" @click="submitDelay">提交延期</el-button>
          </div>
          <div class="detail-label" style="margin-top:16px">申报完成</div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <el-input v-model="fixForm.completeRemark" placeholder="完成说明（选填）" style="width:280px" size="small" />
            <el-button type="success" size="small" :loading="fixing" @click="submitComplete">确认已完成</el-button>
          </div>
        </div>
        <!-- 已完成 → 终态 -->
        <div v-else style="margin-top:20px;padding-top:16px;border-top:1px solid #ebeef5;color:#67C23A;font-weight:600">
          ✓ 已结案{{ rectifyDetail.finish_date ? ' · ' + rectifyDetail.finish_date : '' }}
        </div>
      </div>
    </el-dialog>

    <el-image-viewer v-if="previewVisible" :url-list="previewImagesList" @close="previewVisible=false" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Loading } from '@element-plus/icons-vue'
import request from '../utils/request'
import { inspectionApi } from '../utils/api'
import { useUserStore } from '../stores/user'
import { normalizeRectifyStatus, parseDelayLog, RECTIFY_STATE_TEXT } from '../utils/rectify'

const route = useRoute()
const userStore = useUserStore()

// 双 Tab：整改问题（rectification_issues，与移动端同源）/ 巡检记录（inspections）
const activeTab = ref('rectify')
const rectifyList = ref([])
const rectifyListLoading = ref(false)
const rectifyPage = ref(1)
const rectifyPageSize = ref(20)
const rectifyTotal = ref(0)
const rectifyFilterProject = ref(0)

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

// 整改详情弹窗
const rectifyVisible = ref(false)
const rectifyDetail = ref(null)
const rectifyLoading = ref(false)
const fixForm = reactive({
  content: '',
  remark: '',
  acceptDue: '',
  acceptRemark: '',
  delayDue: '',
  delayReason: '',
  completeRemark: ''
})
const fixing = ref(false)

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
  if (typeof item === 'string') {
    // 存储的图片路径如 /uploads/logs/xxx.png，直接返回（静态文件 mount 在 /uploads）
    if (item.startsWith('data:') || item.startsWith('http')) return item
    return item
  }
  if (item.serverUrl) return item.serverUrl
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
    if (typeof val === 'string') val = JSON.parse(val)
    return Array.isArray(val) ? val : []
  } catch { return [] }
}
/* ---------- 整改问题列表（rectification_issues，与移动端同源） ---------- */
const loadRectifyList = async () => {
  rectifyListLoading.value = true
  try {
    const params = {}
    if (rectifyFilterProject.value) params.project_id = rectifyFilterProject.value
    const res = await request.get('/rectification-issues', { params })
    const raw = Array.isArray(res) ? res : (res.list || res.data || [])
    rectifyList.value = raw
    rectifyTotal.value = raw.length
  } catch (e) {
    console.error('加载整改问题失败', e)
    rectifyList.value = []
    rectifyTotal.value = 0
  } finally {
    rectifyListLoading.value = false
  }
}

const onTabChange = (name) => {
  if (name === 'rectify') loadRectifyList()
  else loadLogs()
}

const isOverdue = (row) => {
  if (!row || !row.due_date) return false
  // 已结案不再算逾期。注意 getRectifyStatus 返回的是归一化文本（待处理/处理中/已完成），
  // 库里旧的「已整改」已于 2026-10-23 统一刷成「已完成」，不能再拿旧名比较。
  if (getRectifyStatus(row) === '已完成') return false
  const due = new Date(String(row.due_date).replace(' ', 'T'))
  if (isNaN(due.getTime())) return false
  return due.getTime() < Date.now()
}

const handleDeleteRectify = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除这条整改问题？', '删除确认', { type: 'warning' })
    await request.delete(`/rectification-issues/${row.id}`)
    ElMessage.success('删除成功')
    loadRectifyList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

// v2.3.6 hotfix（10-15）：走 inspections 表（之前走 /api/project-logs?type=inspection 是错接口）
// 后端返回字段：inspector_name / project_name / result / issues / images / score / status / rectify_status
// 前端模板字段：operator / location / result —— loadLogs 里做映射让模板不用改
const loadLogs = async () => {
  loading.value = true
  try {
    const params = {}
    if (filterProject.value) params.project_id = filterProject.value
    const res = await inspectionApi.list(params)
    const raw = Array.isArray(res) ? res : (res.list || res.data || [])
    // 字段映射：后端 inspector_name → 前端 operator；location 用 project_name 兜底
    logList.value = raw.map(item => ({
      ...item,
      operator: item.inspector_name || item.operator || '',
      location: item.project_name || item.location || '',
    }))
    total.value = raw.length
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
    await inspectionApi.delete(row.id)
    ElMessage.success('删除成功')
    loadLogs()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

/* ---------- 整改详情 ---------- */
const openRectifyDetail = (id) => {
  if (!id) return
  loadRectifyDetail(id)
}

const loadRectifyDetail = async (id) => {
  rectifyLoading.value = true
  try {
    const res = await request.get(`/rectification-issues/${id}`)
    const data = res.data || res
    rectifyDetail.value = data
    rectifyVisible.value = true
    fixForm.content = ''
    fixForm.remark = data?.remark || ''
  } catch (e) {
    console.error('加载整改详情失败', e)
    ElMessage.error('加载整改详情失败')
  } finally {
    rectifyLoading.value = false
  }
}

const getRectifyImages = (item) => {
  if (!item) return []
  if (!item.images) return []
  try {
    const arr = typeof item.images === 'string' ? JSON.parse(item.images) : item.images
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

const getRectifyStatus = (item) => {
  if (!item) return '未知'
  // 统一走归一化口径（与移动端 utils/rectify 一致）：
  // 库里 status 实际是「待处理」，旧的白名单判断会漏掉它。
  return RECTIFY_STATE_TEXT[normalizeRectifyStatus(item.status || item.rectify_status)]
}

// 延期历史（后端 delay_log 为 JSON 字符串，兼容数组）
const rectifyDelayLogs = computed(() => parseDelayLog(rectifyDetail.value?.delay_log))

const getRectifyStatusType = (item) => {
  // 归一化口径：已完成→绿、处理中→橙、待处理→红（旧的「已整改/整改中」比较永不命中）
  const s = getRectifyStatus(item)
  if (s === '已完成') return 'success'
  if (s === '处理中') return 'warning'
  return 'danger'
}

const getSeverityText = (level) => {
  if (!level) return '一般'
  const map = {
    // 英文枚举（库里实际存的值）
    serious: '严重', high: '严重', urgent: '紧急', critical: '严重',
    medium: '中等', moderate: '中等',
    normal: '一般', low: '一般', minor: '一般'
  }
  return map[String(level).toLowerCase()] || level
}

const getSeverityTagType = (level) => {
  const s = String(level || '').toLowerCase()
  if (['serious', 'high', 'urgent', 'critical'].includes(s)) return 'danger'
  if (['medium', 'moderate'].includes(s)) return 'warning'
  return 'info'
}

// ===== 业务流程三动作：受理 / 延期 / 申报完成（与移动端 utils/rectify 同口径）=====

// 受理：待处理 → 处理中（可同步修改整改截止时间）
const submitAccept = async () => {
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const payload = { action: 'accept', remark: fixForm.acceptRemark }
    if (fixForm.acceptDue) payload.new_due_date = fixForm.acceptDue
    const res = await request.put(`/rectification-issues/${id}`, payload)
    const d = res.data || res
    ElMessage.success(d.message || '已受理')
    rectifyDetail.value.status = '处理中'
    if (fixForm.acceptDue) rectifyDetail.value.due_date = fixForm.acceptDue
    if (d.accept_name) rectifyDetail.value.accept_name = d.accept_name
    if (d.accept_date) rectifyDetail.value.accept_date = d.accept_date
    fixForm.acceptDue = ''
    fixForm.acceptRemark = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '受理失败')
  } finally {
    fixing.value = false
  }
}

// 延期：处理中 → 处理中（改截止时间 + 必填原因，后端记 delay_log）
const submitDelay = async () => {
  if (!fixForm.delayDue) { ElMessage.warning('请选择延期后的截止时间'); return }
  if (!String(fixForm.delayReason || '').trim()) { ElMessage.warning('请填写延期原因'); return }
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const res = await request.put(`/rectification-issues/${id}`, {
      action: 'delay',
      new_due_date: fixForm.delayDue,
      delay_reason: String(fixForm.delayReason).trim()
    })
    const d = res.data || res
    ElMessage.success(d.message || '已延期')
    rectifyDetail.value.due_date = fixForm.delayDue
    if (Array.isArray(d.delay_log)) rectifyDetail.value.delay_log = JSON.stringify(d.delay_log)
    fixForm.delayDue = ''
    fixForm.delayReason = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '延期失败')
  } finally {
    fixing.value = false
  }
}

// 申报完成：处理中（或历史遗留的待处理）→ 已完成（终态）
const submitComplete = async () => {
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const res = await request.put(`/rectification-issues/${id}`, {
      action: 'complete',
      remark: fixForm.completeRemark || '已整改完成'
    })
    const d = res.data || res
    ElMessage.success(d.message || '已结案')
    rectifyDetail.value.status = '已完成'
    if (d.finish_date) rectifyDetail.value.finish_date = d.finish_date
    fixForm.completeRemark = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '提交失败')
  } finally {
    fixing.value = false
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
    // v2.3.6 hotfix（10-15）：映射到 inspections 表字段
    // 前端 form: { project_id, inspection_date, location, result, issues, note, operator }
    // 后端 inspections: { project_id, project_name, inspector_name, result, issues, images }
    // location / inspection_date / note 这 3 个字段 inspections 表没对应列，拼接到 issues 一起存
    const projectObj = projectList.value.find(p => String(p.id) === String(form.project_id))
    const projectName = projectObj?.name || ''
    const extraLines = []
    if (form.inspection_date) extraLines.push(`巡检日期：${form.inspection_date}`)
    if (form.location) extraLines.push(`巡检地点：${form.location}`)
    if (form.note) extraLines.push(`备注：${form.note}`)
    const mergedIssues = (form.issues || '').trim() +
      (extraLines.length ? '\n\n' + extraLines.join('\n') : '')

    const data = {
      project_id: form.project_id,
      project_name: projectName,
      inspector_name: form.operator || userStore.userName,
      result: form.result,
      issues: mergedIssues,
      images: formImages.value.map(i => i.serverUrl).filter(Boolean),
      // status / rectify_status 默认 '待整改' 由后端填
    }
    if (isEdit.value) {
      await inspectionApi.update(form.id, data)
    } else {
      await inspectionApi.create(data)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    // 新增写的是 inspections 表，切到「巡检记录」tab 才看得到
    activeTab.value = 'inspections'
    loadLogs()
  } catch (e) {
    console.error('保存失败', e)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  // 默认展示「整改问题」（实际有数据的那张表，与移动端同源）
  loadRectifyList()
  loadProjects()
  // 从待办中心跳转：?id=整改记录ID
  if (route.query.id) {
    activeTab.value = 'rectify'
    openRectifyDetail(route.query.id)
  }
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
