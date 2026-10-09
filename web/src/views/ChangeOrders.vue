<template>
  <div class="change-orders">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>增减项管理</span>
          <el-button type="primary" @click="fetchList">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <!-- 状态筛选 -->
      <div class="filter-row">
        <el-radio-group v-model="curStatus" size="default">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="待审核">待审核</el-radio-button>
          <el-radio-button value="已通过">已通过</el-radio-button>
          <el-radio-button value="已驳回">已驳回</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 列表 -->
      <el-table :data="filteredList" style="width:100%" v-loading="loading" stripe>
        <el-table-column prop="project_name" label="项目名称" min-width="160" />
        <el-table-column prop="change_type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.change_type === 'increase' ? 'success' : 'danger'" size="small">
              {{ row.change_type === 'increase' ? '增加项' : '减少项' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column prop="amount" label="金额（元）" width="130" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.change_type === 'increase' ? '#67C23A' : '#F56C6C', fontWeight: 600 }">
              {{ row.change_type === 'increase' ? '+' : '-' }}¥{{ formatNumber(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="submitted_by_name" label="提交人" width="100" />
        <el-table-column prop="submitted_at" label="提交时间" width="160">
          <template #default="{ row }">
            {{ row.submitted_at ? row.submitted_at.substring(0, 16) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="statusText" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ row.statusText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              type="primary"
              size="small"
              @click="openReviewDialog(row)"
            >
              审核
            </el-button>
            <el-button
              v-else-if="row.status === 'approved'"
              type="success"
              size="small"
              disabled
            >
              已通过
            </el-button>
            <el-button
              v-else-if="row.status === 'rejected'"
              type="danger"
              size="small"
              disabled
            >
              已驳回
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 审核弹窗 -->
    <el-dialog v-model="reviewDialogVisible" title="审核增减项" width="480px">
      <div v-if="currentItem" class="review-info">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="项目">{{ currentItem.project_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            <el-tag :type="currentItem.change_type === 'increase' ? 'success' : 'danger'" size="small">
              {{ currentItem.change_type === 'increase' ? '增加项' : '减少项' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标题">{{ currentItem.title }}</el-descriptions-item>
          <el-descriptions-item label="金额">
            <span :style="{ color: currentItem.change_type === 'increase' ? '#67C23A' : '#F56C6C', fontWeight: 700 }">
              {{ currentItem.change_type === 'increase' ? '+' : '-' }}¥{{ formatNumber(currentItem.amount) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="原因/说明">{{ currentItem.reason || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-form style="margin-top: 20px;" label-width="80px">
          <el-form-item label="审核备注">
            <el-input v-model="reviewRemark" type="textarea" :rows="3" placeholder="选填，可输入通过/驳回原因" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="doReject">驳回</el-button>
        <el-button type="success" @click="doApprove">通过</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const loading = ref(false)
const list = ref([])
const curStatus = ref('')
const reviewDialogVisible = ref(false)
const currentItem = ref(null)
const reviewRemark = ref('')

const filteredList = computed(() => {
  if (!curStatus.value) return list.value
  return list.value.filter(i => i.statusText === curStatus.value)
})

const getStatusType = (status) => {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

const formatNumber = (num) => {
  return num ? Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/change-orders')
    const arr = Array.isArray(res.data) ? res.data : (res.data?.data || [])
    list.value = arr
  } catch (e) {
    list.value = []
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const openReviewDialog = (item) => {
  currentItem.value = item
  reviewRemark.value = ''
  reviewDialogVisible.value = true
}

const doApprove = async () => {
  if (!currentItem.value) return
  try {
    await axios.put(`/api/contract-changes/${currentItem.value.id}/review`, {
      action: 'approve',
      remark: reviewRemark.value
    })
    ElMessage.success('已通过')
    reviewDialogVisible.value = false
    fetchList()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

const doReject = async () => {
  if (!currentItem.value) return
  try {
    await ElMessageBox.confirm('确定驳回该增减项吗？', '确认', { type: 'warning' })
    await axios.put(`/api/contract-changes/${currentItem.value.id}/review`, {
      action: 'reject',
      remark: reviewRemark.value
    })
    ElMessage.success('已驳回')
    reviewDialogVisible.value = false
    fetchList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-row {
  margin-bottom: 16px;
}
.review-info {
  padding: 4px 0;
}
</style>
