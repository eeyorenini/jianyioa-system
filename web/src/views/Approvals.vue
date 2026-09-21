<template>
  <div class="approvals">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-tabs v-model="activeTab" @tab-change="onTabChange">
            <el-tab-pane label="我的申请" name="my" />
            <el-tab-pane label="待我审批" name="todo" />
          </el-tabs>
          <el-button v-if="activeTab === 'my'" type="primary" @click="openApplyDialog">
            <el-icon><Plus /></el-icon>
            发起审批
          </el-button>
        </div>
      </template>

      <!-- 筛选 -->
      <div class="filter-bar">
        <el-select v-model="filterType" placeholder="审批类型" clearable style="width: 150px; margin-right: 10px;" @change="loadData">
          <el-option label="报销" value="报销" />
          <el-option label="支出" value="支出" />
          <el-option label="请假" value="请假" />
          <el-option label="采购" value="采购" />
          <el-option label="付款" value="付款" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-select v-if="activeTab === 'my'" v-model="filterStatus" placeholder="审批状态" clearable style="width: 150px; margin-right: 10px;" @change="loadData">
          <el-option label="待审批" value="待审批" />
          <el-option label="已通过" value="已通过" />
          <el-option label="已驳回" value="已驳回" />
        </el-select>
        <el-input v-model="keyword" placeholder="搜索标题/内容" style="width: 200px;" clearable @clear="loadData" @keyup.enter="loadData">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button style="margin-left: 10px;" @click="loadData">搜索</el-button>
      </div>

      <!-- 我的申请列表 -->
      <el-table v-if="activeTab === 'my'" :data="list" style="width: 100%" v-loading="loading">
        <el-table-column prop="title" label="标题" width="200" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }"><el-tag>{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="approver_name" label="审批人" width="120" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" width="130">
          <template #default="{ row }">¥{{ formatNumber(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" show-overflow-tooltip />
        <el-table-column prop="created_at" label="申请时间" width="160" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 待我审批列表 -->
      <el-table v-if="activeTab === 'todo'" :data="list" style="width: 100%" v-loading="loading">
        <el-table-column prop="title" label="标题" width="200" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }"><el-tag>{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="applicant_name" label="申请人" width="120" />
        <el-table-column prop="amount" label="金额" width="130">
          <template #default="{ row }">¥{{ formatNumber(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" show-overflow-tooltip />
        <el-table-column prop="created_at" label="申请时间" width="160" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="openApproveDialog(row)">审批</el-button>
            <el-button size="small" type="primary" @click="viewDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="activeTab === 'my'"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 15px;"
        @size-change="loadData"
        @current-change="loadData"
      />
    </el-card>

    <!-- 发起审批对话框 -->
    <el-dialog v-model="showApplyDialog" title="发起审批" width="600px">
      <el-form :model="applyForm" label-width="100px" :rules="applyRules" ref="applyFormRef">
        <el-form-item label="标题" prop="title">
          <el-input v-model="applyForm.title" placeholder="请输入审批标题" />
        </el-form-item>
        <el-form-item label="审批类型" prop="type">
          <el-select v-model="applyForm.type" style="width: 100%">
            <el-option label="报销" value="报销" />
            <el-option label="支出" value="支出" />
            <el-option label="请假" value="请假" />
            <el-option label="采购" value="采购" />
            <el-option label="付款" value="付款" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批人" prop="approver_id">
          <el-select v-model="applyForm.approver_id" placeholder="请选择审批人" filterable style="width: 100%">
            <el-option v-for="emp in employeeList" :key="emp.id" :label="emp.name + (emp.phone ? ' - ' + emp.phone : '')" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="applyForm.amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="applyForm.content" type="textarea" :rows="4" placeholder="请输入审批说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showApplyDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitApply">提交</el-button>
      </template>
    </el-dialog>

    <!-- 审批对话框 -->
    <el-dialog v-model="showApproveDialog" title="审批" width="500px">
      <el-form :model="approveForm" label-width="80px">
        <el-form-item label="审批操作">
          <el-radio-group v-model="approveForm.action">
            <el-radio label="同意">同意</el-radio>
            <el-radio label="驳回">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批意见">
          <el-input v-model="approveForm.comment" type="textarea" :rows="3" :placeholder="approveForm.action === '同意' ? '选填' : '请输入驳回原因'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showApproveDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitApprove">确定</el-button>
      </template>
    </el-dialog>

    <!-- 审批详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="审批详情" width="700px">
      <el-descriptions :column="2" border v-if="detailData.id">
        <el-descriptions-item label="标题">{{ detailData.title }}</el-descriptions-item>
        <el-descriptions-item label="类型"><el-tag>{{ detailData.type }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="申请人">{{ detailData.applicant_name }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ detailData.approver_name }}</el-descriptions-item>
        <el-descriptions-item label="金额">¥{{ formatNumber(detailData.amount) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">{{ detailData.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="申请时间" :span="2">{{ detailData.created_at }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="2">{{ detailData.content || '无' }}</el-descriptions-item>
        <el-descriptions-item label="审批时间" :span="2">{{ detailData.approve_time || '待审批' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailData.remark || '无' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 审批记录 -->
      <div v-if="detailData.records && detailData.records.length > 0" style="margin-top: 20px;">
        <h4>审批记录</h4>
        <el-timeline>
          <el-timeline-item v-for="(record, idx) in detailData.records" :key="idx" :timestamp="record.created_at">
            <strong>{{ record.approver_name }}</strong> {{ record.action }}
            <div v-if="record.comment" style="color: #666;">意见：{{ record.comment }}</div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'

const activeTab = ref('my')
const list = ref([])
const loading = ref(false)
const showApplyDialog = ref(false)
const showApproveDialog = ref(false)
const showDetailDialog = ref(false)
const submitting = ref(false)
const employeeList = ref([])
const detailData = ref({})
const applyFormRef = ref(null)

const filterType = ref('')
const filterStatus = ref('')
const keyword = ref('')

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const applyForm = reactive({
  title: '',
  type: '报销',
  approver_id: null,
  approver_name: '',
  amount: 0,
  content: ''
})

const approveForm = reactive({
  action: '同意',
  comment: ''
})

const applyRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  approver_id: [{ required: true, message: '请选择审批人', trigger: 'change' }]
}

const formatNumber = (num) => num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'

const getStatusType = (status) => {
  const types = { '待审批': 'warning', '已通过': 'success', '已驳回': 'danger' }
  return types[status] || 'info'
}

const onTabChange = () => {
  pagination.page = 1
  loadData()
}

const loadEmployees = async () => {
  try {
    const res = await axios.get('/api/employees')
    employeeList.value = res.data || []
  } catch (e) { console.error('加载员工失败', e) }
}

const loadData = async () => {
  loading.value = true
  try {
    const api = activeTab.value === 'my' ? '/api/approvals/my' : '/api/approvals/todo'
    const params = { page: pagination.page, pageSize: pagination.pageSize }
    if (filterType.value) params.type = filterType.value
    if (filterStatus.value && activeTab.value === 'my') params.status = filterStatus.value
    if (keyword.value) params.keyword = keyword.value

    const res = await axios.get(api, { params })
    list.value = res.data
    if (activeTab.value === 'my') {
      pagination.total = res.data.length
    }
  } catch (e) {
    console.error('加载失败', e)
  } finally {
    loading.value = false
  }
}

const openApplyDialog = () => {
  Object.assign(applyForm, { title: '', type: '报销', approver_id: null, approver_name: '', amount: 0, content: '' })
  showApplyDialog.value = true
}

const submitApply = async () => {
  if (!applyForm.title || !applyForm.approver_id) {
    ElMessage.warning('请填写标题和选择审批人')
    return
  }
  submitting.value = true
  try {
    const emp = employeeList.value.find(e => e.id === applyForm.approver_id)
    await axios.post('/api/approvals', {
      ...applyForm,
      approver_name: emp ? emp.name : '',
      approver_ids: applyForm.approver_id.toString(),
      approver_names: emp ? emp.name : ''
    })
    ElMessage.success('提交成功')
    showApplyDialog.value = false
    activeTab.value = 'my'
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    submitting.value = false
  }
}

const openApproveDialog = (row) => {
  detailData.value = row
  approveForm.action = '同意'
  approveForm.comment = ''
  showApproveDialog.value = true
}

const submitApprove = async () => {
  if (approveForm.action === '驳回' && !approveForm.comment.trim()) {
    ElMessage.warning('请输入驳回原因')
    return
  }
  submitting.value = true
  try {
    const api = approveForm.action === '同意'
      ? `/api/approvals/${detailData.value.id}/approve`
      : `/api/approvals/${detailData.value.id}/reject`
    await axios.post(api, { comment: approveForm.comment })
    ElMessage.success(approveForm.action === '同意' ? '已同意' : '已驳回')
    showApproveDialog.value = false
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    submitting.value = false
  }
}

const viewDetail = async (row) => {
  try {
    const res = await axios.get(`/api/approvals/${row.id}`)
    detailData.value = res.data
    showDetailDialog.value = true
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

onMounted(() => {
  loadData()
  loadEmployees()
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.filter-bar { display: flex; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
</style>
