<template>
  <div class="operation-logs">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>操作日志</span>
          <el-button @click="loadData">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      <el-table :data="logList" style="width: 100%">
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="username" label="操作人" width="100" />
        <el-table-column prop="action" label="操作" width="120">
          <template #default="scope">
            <el-tag :type="getActionType(scope.row.action)">{{ scope.row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="target_name" label="操作对象" width="150" />
        <el-table-column prop="details" label="详情" />
        <el-table-column prop="ip_address" label="IP地址" width="130" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { Refresh } from '@element-plus/icons-vue'

const logList = ref([])

const loadData = async () => {
  try {
    const res = await axios.get('/api/operation-logs?limit=100')
    logList.value = res.data
  } catch (error) {
    ElMessage.error('加载失败')
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
</style>