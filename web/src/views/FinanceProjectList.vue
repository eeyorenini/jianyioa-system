<template>
  <div class="finance-project-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>选择项目</span>
          <el-button type="primary" size="small" @click="fetchProjects">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <el-table :data="projects" style="width:100%" v-loading="loading" stripe>
        <el-table-column prop="project_name" label="项目名称" min-width="180" />
        <el-table-column prop="customer_name" label="客户" width="140" />
        <el-table-column label="合同金额" width="130" align="right">
          <template #default="{ row }">
            <span style="color:#409EFF;font-weight:600">¥{{ formatNumber(row.contract_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="增减项净额" width="130" align="right">
          <template #default="{ row }">
            <span v-if="row.change_net > 0" style="color:#67C23A">+¥{{ formatNumber(row.change_net) }}</span>
            <span v-else-if="row.change_net < 0" style="color:#F56C6C">-¥{{ formatNumber(Math.abs(row.change_net)) }}</span>
            <span v-else style="color:#999">¥0.00</span>
          </template>
        </el-table-column>
        <el-table-column label="应收金额" width="130" align="right">
          <template #default="{ row }">
            <span style="font-weight:700;color:#303133">¥{{ formatNumber(row.receivable) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实收金额" width="130" align="right">
          <template #default="{ row }">
            <span style="color:#67C23A">¥{{ formatNumber(row.collected) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="未收金额" width="130" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.unpaid > 0 ? '#F56C6C' : '#67C23A', fontWeight: 600 }">
              ¥{{ formatNumber(row.unpaid) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="openProjectDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 项目详情弹窗 -->
    <el-dialog v-model="detailVisible" :title="currentProject?.name + ' — 财务详情'" width="900px" top="3vh">
      <div v-if="currentProject">
        <!-- 统计卡片 -->
        <el-row :gutter="12" style="margin-bottom: 16px;">
          <el-col :span="6">
            <div class="stat-card">
              <div class="stat-label">合同金额</div>
              <div class="stat-value">¥{{ formatNumber(summary.contract_amount) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card increase">
              <div class="stat-label">增加项</div>
              <div class="stat-value">+¥{{ formatNumber(summary.increase_total) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card decrease">
              <div class="stat-label">减少项</div>
              <div class="stat-value">-¥{{ formatNumber(summary.decrease_total) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card primary">
              <div class="stat-label">实际应收</div>
              <div class="stat-value highlight">¥{{ formatNumber(actualReceivable) }}</div>
            </div>
          </el-col>
        </el-row>

        <!-- Tab 切换 -->
        <el-tabs v-model="activeTab" class="finance-tabs">
          <el-tab-pane label="收支记录" name="records" />
          <el-tab-pane label="应收统计" name="receivable" />
          <el-tab-pane label="实收统计" name="collected" />
        </el-tabs>

        <!-- 收支记录 -->
        <div v-if="activeTab === 'records'">
          <el-table :data="paymentRecords" size="small" border>
            <el-table-column prop="type" label="类型" width="80">
              <template #default="{ row }">
                <el-tag :type="row.type === 'income' ? 'success' : 'danger'" size="small">
                  {{ row.type === 'income' ? '收入' : '支出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="category" label="类别" width="120" />
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.type === 'income' ? '#67C23A' : '#F56C6C', fontWeight: 600 }">
                  {{ row.type === 'income' ? '+' : '-' }}¥{{ formatNumber(row.amount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ row.created_at ? row.created_at.substring(0, 16) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="paymentRecords.length === 0" description="暂无收支记录" />
        </div>

        <!-- 应收统计 -->
        <div v-if="activeTab === 'receivable'">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="合同金额">
              <span style="color:#409EFF;font-weight:600">¥{{ formatNumber(summary.contract_amount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="增加项">
              <span style="color:#67C23A">+¥{{ formatNumber(summary.increase_total) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="减少项">
              <span style="color:#F56C6C">-¥{{ formatNumber(summary.decrease_total) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="实际应收">
              <span style="color:#303133;font-weight:700;font-size:16px">¥{{ formatNumber(actualReceivable) }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 实收统计 -->
        <div v-if="activeTab === 'collected'">
          <!-- 顶部汇总 -->
          <el-row :gutter="12" style="margin-bottom: 16px;">
            <el-col :span="8">
              <div class="stat-card success">
                <div class="stat-label">已确认收款</div>
                <div class="stat-value">¥{{ formatNumber(collectedTotal) }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-card warning">
                <div class="stat-label">待确认催收</div>
                <div class="stat-value">¥{{ formatNumber(pendingTotal) }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-card">
                <div class="stat-label">未收款</div>
                <div class="stat-value" :style="{ color: actualReceivable - collectedTotal > 0 ? '#F56C6C' : '#67C23A' }">
                  ¥{{ formatNumber(actualReceivable - collectedTotal) }}
                </div>
              </div>
            </el-col>
          </el-row>

          <!-- 催收录入按钮 -->
          <div style="margin-bottom: 12px; text-align: right;">
            <el-button type="primary" size="small" @click="openCollectionDialog">
              <el-icon><Plus /></el-icon>
              录入催收
            </el-button>
          </div>

          <!-- 待确认 -->
          <div class="section-title">待确认催收</div>
          <el-table v-if="pendingRecords.length > 0" :data="pendingRecords" size="small" border style="margin-bottom: 16px;">
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="{ row }">
                <span style="color:#E6A23C;font-weight:600">¥{{ formatNumber(row.amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="collection_date" label="日期" width="120">
              <template #default="{ row }">
                {{ row.collection_date || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" />
            <el-table-column prop="submitted_by_name" label="提交人" width="100" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="success" size="small" @click="confirmCollection(row)">
                  确认收款
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无待确认记录" :image-size="60" />

          <!-- 已确认 -->
          <div class="section-title">已确认收款</div>
          <el-table v-if="confirmedRecords.length > 0" :data="confirmedRecords" size="small" border>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="{ row }">
                <span style="color:#67C23A;font-weight:600">¥{{ formatNumber(row.amount) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="collection_date" label="日期" width="120" />
            <el-table-column prop="remark" label="备注" />
            <el-table-column prop="submitted_by_name" label="提交人" width="100" />
            <el-table-column label="状态" width="100">
              <template #default>
                <el-tag type="success" size="small">已确认</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无已确认记录" :image-size="60" />
        </div>
      </div>
    </el-dialog>

    <!-- 录入催收弹窗 -->
    <el-dialog v-model="collectionDialogVisible" title="录入催收" width="520px">
      <el-form :model="collectionForm" label-width="100px">
        <el-form-item label="催收金额">
          <el-input-number v-model="collectionForm.amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="催收日期">
          <el-date-picker
            v-model="collectionForm.collect_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="上传凭证">
          <div class="image-upload-row">
            <el-upload
              :action="'/api/upload-image'"
              :headers="{ Authorization: axios.defaults.headers.common['Authorization'] }"
              :show-file-list="false"
              :before-upload="beforeImageUpload"
              :on-success="onImageUploadSuccess"
              :on-error="onImageUploadError"
              accept="image/*"
              class="image-uploader"
            >
              <el-button size="small" :loading="uploading">
                <el-icon v-if="!uploading"><Plus /></el-icon>
                上传图片
              </el-button>
            </el-upload>
            <span class="upload-tip">最多3张，支持jpg/png/gif/webp</span>
          </div>
          <div v-if="collectionForm.images.length > 0" class="image-list">
            <div v-for="(img, idx) in collectionForm.images" :key="idx" class="image-item">
              <el-image :src="img" fit="cover" class="image-thumb" :preview-src-list="collectionForm.images" />
              <el-icon class="image-remove" @click="removeImage(idx)"><Close /></el-icon>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="collectionForm.remark" type="textarea" :rows="3" placeholder="一句话描述（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="collectionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCollection">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Close } from '@element-plus/icons-vue'

const loading = ref(false)
const projects = ref([])
const detailVisible = ref(false)
const currentProject = ref(null)
const activeTab = ref('records')
const paymentRecords = ref([])
const collectionRecords = ref([])
const summary = ref({ contract_amount: 0, increase_total: 0, decrease_total: 0 })
const collectionDialogVisible = ref(false)
const submitting = ref(false)
const uploading = ref(false)
const collectionForm = ref({
  amount: 0,
  collect_date: new Date().toISOString().split('T')[0],
  remark: '',
  images: []
})

const actualReceivable = computed(() => {
  return (summary.value.contract_amount || 0)
    + (summary.value.increase_total || 0)
    - (summary.value.decrease_total || 0)
})

const pendingRecords = computed(() => collectionRecords.value.filter(r => r.status === 'pending'))
const confirmedRecords = computed(() => collectionRecords.value.filter(r => r.status === 'confirmed'))
const pendingTotal = computed(() => pendingRecords.value.reduce((s, r) => s + parseFloat(r.amount || 0), 0))
const collectedTotal = computed(() => confirmedRecords.value.reduce((s, r) => s + parseFloat(r.amount || 0), 0))

const getStatusType = (status) => {
  if (status === 'confirmed') return 'success'
  if (status === 'pending') return 'warning'
  return 'info'
}

const getStatusLabel = (status) => {
  if (status === 'confirmed') return '已确认'
  if (status === 'pending') return '待确认'
  return status
}

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const fetchProjects = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/finance/receivable-by-project')
    const list = res.data?.list || []
    projects.value = list
  } catch (e) {
    projects.value = []
  } finally {
    loading.value = false
  }
}

const openProjectDetail = async (project) => {
  currentProject.value = project
  detailVisible.value = true
  activeTab.value = 'records'
  await Promise.all([loadPaymentRecords(), loadCollectionRecords(), loadProjectSummary()])
}

const loadPaymentRecords = async () => {
  try {
    const res = await axios.get(`/api/payment-records?project_id=${currentProject.value.project_id}`)
    paymentRecords.value = Array.isArray(res.data) ? res.data : (res.data?.list || [])
  } catch { paymentRecords.value = [] }
}

const loadCollectionRecords = async () => {
  try {
    const res = await axios.get(`/api/collection-records?project_id=${currentProject.value.project_id}`)
    collectionRecords.value = Array.isArray(res.data) ? res.data : (res.data?.list || [])
  } catch { collectionRecords.value = [] }
}

const loadProjectSummary = async () => {
  try {
    const res = await axios.get(`/api/finance/summary?project_id=${currentProject.value.project_id}`)
    const data = res.data?.data || res.data || {}
    summary.value = {
      contract_amount: data.contract_amount || data.contract_amount || 0,
      increase_total: data.increase_total || 0,
      decrease_total: data.decrease_total || 0
    }
  } catch {
    summary.value = { contract_amount: 0, increase_total: 0, decrease_total: 0 }
  }
}

const beforeImageUpload = (file) => {
  if (collectionForm.value.images.length >= 3) {
    ElMessage.warning('最多上传3张图片')
    return false
  }
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
  if (!allowed.includes(file.type)) {
    ElMessage.warning('仅支持 jpg/png/gif/webp 格式')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过10MB')
    return false
  }
  uploading.value = true
  return true
}

const onImageUploadSuccess = (res) => {
  uploading.value = false
  if (res.url) {
    collectionForm.value.images.push(res.url)
  }
}

const onImageUploadError = () => {
  uploading.value = false
  ElMessage.error('图片上传失败，请重试')
}

const removeImage = (idx) => {
  collectionForm.value.images.splice(idx, 1)
}

const openCollectionDialog = () => {
  collectionForm.value = {
    amount: 0,
    collect_date: new Date().toISOString().split('T')[0],
    remark: '',
    images: []
  }
  collectionDialogVisible.value = true
}

const submitCollection = async () => {
  if (!collectionForm.value.amount || collectionForm.value.amount <= 0) {
    ElMessage.warning('请输入有效的催收金额')
    return
  }
  if (!collectionForm.value.collect_date) {
    ElMessage.warning('请选择催收日期')
    return
  }
  submitting.value = true
  try {
    await axios.post('/api/collection-records', {
      project_id: currentProject.value.project_id,
      amount: collectionForm.value.amount,
      collect_date: collectionForm.value.collect_date,
      remark: collectionForm.value.remark,
      images: JSON.stringify(collectionForm.value.images)
    })
    ElMessage.success('提交成功')
    collectionDialogVisible.value = false
    await loadCollectionRecords()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    submitting.value = false
  }
}

const confirmCollection = async (record) => {
  try {
    await ElMessageBox.confirm('确定已收到该笔款项？', '确认收款', { type: 'success' })
    await axios.put(`/api/collection-records/${record.id}/confirm`, {})
    ElMessage.success('确认成功')
    await loadCollectionRecords()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '确认失败')
  }
}

onMounted(() => {
  fetchProjects()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stat-card {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 14px 16px;
  text-align: center;
  border: 1px solid #e8e8e8;
}
.stat-card.increase { background: #f0f9eb; border-color: #c2e7b0; }
.stat-card.decrease { background: #fef0f0; border-color: #fad7d7; }
.stat-card.primary { background: #ecf5ff; border-color: #b3d8fd; }
.stat-card.success { background: #f0f9eb; border-color: #b2e6ab; }
.stat-card.warning { background: #fef9f3; border-color: #f5dab1; }
.stat-label { font-size: 12px; color: #666; margin-bottom: 6px; }
.stat-value { font-size: 16px; font-weight: 700; color: #333; }
.stat-card.increase .stat-value { color: #67C23A; }
.stat-card.decrease .stat-value { color: #F56C6C; }
.stat-card.primary .stat-value { color: #409EFF; }
.stat-card.success .stat-value { color: #67C23A; }
.stat-card.warning .stat-value { color: #E6A23C; }
.stat-value.highlight { color: #fff; font-size: 18px; }
.stat-card.primary .stat-value.highlight { color: #fff; }
.stat-card.primary { background: #1E3A5F; border-color: #1E3A5F; }
.stat-card.primary .stat-label { color: rgba(255,255,255,0.8); }

.finance-tabs {
  margin-bottom: 16px;
}

.image-upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.upload-tip {
  font-size: 12px;
  color: #999;
}
.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.image-item {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e8e8e8;
}
.image-thumb {
  width: 100%;
  height: 100%;
}
.image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0,0,0,0.5);
  color: #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
}
</style>
