<template>
  <div class="approvals">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>审批列表</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            新建审批
          </el-button>
        </div>
      </template>
      <el-table :data="list" style="width: 100%">
        <el-table-column prop="title" label="标题" width="200" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="scope">
            <el-tag>{{ scope.row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="applicant_name" label="申请人" width="100" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="scope">¥{{ formatNumber(scope.row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" />
        <el-table-column prop="created_at" label="申请时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button v-if="scope.row.status === '待审批'" size="small" type="success" @click="handleApprove(scope.row)">审批</el-button>
            <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" title="新建审批" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="标题">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="审批类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="请假" value="请假" />
            <el-option label="报销" value="报销" />
            <el-option label="采购" value="采购" />
            <el-option label="付款" value="付款" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="申请人">
          <el-input v-model="form.applicant_name" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAdd">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showApproveDialog" title="审批" width="400px">
      <el-form :model="approveForm" label-width="80px">
        <el-form-item label="审批结果">
          <el-radio-group v-model="approveForm.status">
            <el-radio label="已通过">通过</el-radio>
            <el-radio label="已拒绝">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批人">
          <el-input v-model="approveForm.approver_name" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="approveForm.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showApproveDialog = false">取消</el-button>
        <el-button type="primary" @click="submitApprove">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const list = ref([])
const showAddDialog = ref(false)
const showApproveDialog = ref(false)
const currentId = ref(null)
const form = reactive({ title: '', type: '其他', amount: 0, applicant_name: '', content: '' })
const approveForm = reactive({ status: '已通过', approver_name: '', remark: '', approve_time: '' })

const formatNumber = (num) => num ? Number(num).toLocaleString('zh-CN') : '0'

const getStatusType = (status) => {
  const types = { '待审批': 'warning', '已通过': 'success', '已拒绝': 'danger' }
  return types[status] || 'info'
}

const loadData = async () => {
  try {
    const res = await axios.get('/api/approvals')
    list.value = res.data
  } catch (error) { console.error('加载失败:', error) }
}

const handleAdd = async () => {
  try {
    await axios.post('/api/approvals', form)
    ElMessage.success('提交成功')
    showAddDialog.value = false
    loadData()
    Object.assign(form, { title: '', type: '其他', amount: 0, applicant_name: '', content: '' })
  } catch (error) { ElMessage.error('提交失败') }
}

const handleApprove = (row) => {
  currentId.value = row.id
  approveForm.status = '已通过'
  approveForm.approver_name = ''
  approveForm.remark = ''
  approveForm.approve_time = new Date().toISOString().split('T')[0]
  showApproveDialog.value = true
}

const submitApprove = async () => {
  try {
    await axios.put(`/api/approvals/${currentId.value}`, { ...approveForm, approve_time: approveForm.approve_time })
    ElMessage.success('审批成功')
    showApproveDialog.value = false
    loadData()
  } catch (error) { ElMessage.error('审批失败') }
}

const handleDelete = async (id) => {
  try {
    await axios.delete(`/api/approvals/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) { ElMessage.error('删除失败') }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
