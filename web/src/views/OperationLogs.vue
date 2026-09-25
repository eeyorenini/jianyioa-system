<template>
  <div class="operation-logs">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>操作日志</span>
          <div class="header-actions">
            <el-button @click="loadData" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-button type="danger" @click="clearLogs" :loading="clearing">
              <el-icon><Delete /></el-icon>
              清空日志
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="logList" style="width: 100%" v-loading="loading" stripe>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="action" label="操作" width="120">
          <template #default="scope">
            <el-tag :type="getActionType(scope.row.action)">{{ scope.row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="target_name" label="操作对象" min-width="150" />
        <el-table-column prop="details" label="详情" />
        <el-table-column prop="ip_address" label="IP地址" width="140" />
      </el-table>
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :page-sizes="[20, 50, 100, 200]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { Refresh, Delete } from '@element-plus/icons-vue'

const logList = ref([])
const loading = ref(false)
const clearing = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(50)

const loadData = async () => {
  loading.value = true
  try {
    const offset = (page.value - 1) * limit.value
    const res = await axios.get(`/api/operation-logs?page=${page.value}&limit=${limit.value}&offset=${offset}`)
    const data = res.data
    if (Array.isArray(data)) {
      logList.value = data
      total.value = data.length
    } else {
      logList.value = data.logs || []
      total.value = data.total || 0
    }
  } catch (error) {
    ElMessage.error('加载失败: ' + (error.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

const clearLogs = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有操作日志吗？此操作不可恢复。', '清空确认', {
      confirmButtonText: '确定清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  clearing.value = true
  try {
    await axios.delete('/api/operation-logs')
    ElMessage.success('操作日志已清空')
    loadData()
  } catch (error) {
    ElMessage.error('清空失败: ' + (error.message || '网络错误'))
  } finally {
    clearing.value = false
  }
}

const getActionType = (action) => {
  const typeMap = {
    '新增': 'success',
    '编辑': 'warning',
    '删除': 'danger',
    '登录': 'info',
    '导出': 'info',
    '导入': 'info'
  }
  return typeMap[action] || 'info'
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
