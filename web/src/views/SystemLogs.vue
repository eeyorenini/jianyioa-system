<template>
  <div class="system-logs">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>系统日志</span>
          <div class="header-actions">
            <el-button @click="loadData">
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

      <!-- 筛选条件 -->
      <div class="filter-bar">
        <el-input v-model="filters.path" placeholder="接口路径" style="width: 200px" clearable @clear="loadData" />
        <el-select v-model="filters.method" placeholder="请求方式" style="width: 120px" clearable @clear="loadData">
          <el-option label="POST" value="POST" />
          <el-option label="PUT" value="PUT" />
          <el-option label="DELETE" value="DELETE" />
          <el-option label="PATCH" value="PATCH" />
        </el-select>
        <el-select v-model="filters.success" placeholder="状态" style="width: 120px" clearable @clear="loadData">
          <el-option label="成功" :value="1" />
          <el-option label="失败" :value="0" />
        </el-select>
        <el-date-picker v-model="filters.dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 260px" @change="loadData" />
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>

      <!-- 日志表格 -->
      <el-table :data="logList" style="width: 100%; margin-top: 12px" v-loading="loading" stripe>
        <el-table-column prop="created_at" label="时间" width="165" />
        <el-table-column prop="method" label="方法" width="80">
          <template #default="scope">
            <el-tag :type="methodTag(scope.row.method)" size="small">{{ scope.row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="接口路径" min-width="220">
          <template #default="scope">
            <span class="path-text">{{ scope.row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户" width="110" />
        <el-table-column prop="ip_address" label="IP" width="140" />
        <el-table-column prop="status_code" label="状态码" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status_code >= 400 ? 'danger' : scope.row.status_code >= 200 ? 'success' : 'info'" size="small">
              {{ scope.row.status_code || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="response_time" label="耗时" width="80">
          <template #default="scope">
            <span :class="scope.row.response_time > 3000 ? 'slow' : ''">{{ scope.row.response_time }}ms</span>
          </template>
        </el-table-column>
        <el-table-column prop="success" label="结果" width="70">
          <template #default="scope">
            <el-tag :type="scope.row.success ? 'success' : 'danger'" size="small">
              {{ scope.row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="showDetail(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="total"
          :page-size="filters.limit"
          :current-page="filters.page"
          @current-change="page => { filters.page = page; loadData(); }"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="日志详情" width="700px" destroy-on-close>
      <el-descriptions :column="2" border v-if="currentLog">
        <el-descriptions-item label="时间">{{ currentLog.created_at }}</el-descriptions-item>
        <el-descriptions-item label="请求方式">{{ currentLog.method }}</el-descriptions-item>
        <el-descriptions-item label="接口路径" :span="2">{{ currentLog.path }}</el-descriptions-item>
        <el-descriptions-item label="查询参数" :span="2">{{ currentLog.query || '-' }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ currentLog.username || '-' }} (ID: {{ currentLog.user_id || '-' }})</el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ currentLog.ip_address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态码">
          <el-tag :type="currentLog.status_code >= 400 ? 'danger' : 'success'">{{ currentLog.status_code || '-' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">{{ currentLog.response_time }}ms</el-descriptions-item>
        <el-descriptions-item label="结果">
          <el-tag :type="currentLog.success ? 'success' : 'danger'">{{ currentLog.success ? '成功' : '失败' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="错误信息" :span="2" v-if="currentLog.error_message">
          <span class="error-text">{{ currentLog.error_message }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="请求体" :span="2">
          <pre class="body-pre">{{ formatBody(currentLog.body) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="User-Agent" :span="2">{{ currentLog.user_agent || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { Refresh, Delete } from '@element-plus/icons-vue'

const loading = ref(false)
const clearing = ref(false)
const logList = ref([])
const total = ref(0)
const detailVisible = ref(false)
const currentLog = ref(null)

const filters = reactive({
  path: '',
  method: '',
  success: '',
  dateRange: null,
  page: 1,
  limit: 30,
})

const methodTag = (method) => {
  const map = { POST: '', PUT: 'warning', DELETE: 'danger', PATCH: 'info' }
  return map[method] || 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: filters.page,
      limit: filters.limit,
    }
    if (filters.path) params.path = filters.path
    if (filters.method) params.method = filters.method
    if (filters.success !== '') params.success = filters.success
    if (filters.dateRange && filters.dateRange.length === 2) {
      params.start_date = filters.dateRange[0]
      params.end_date = filters.dateRange[1]
    }
    const res = await axios.get('/api/system-logs', { params })
    logList.value = res.data.logs || []
    total.value = res.data.total || 0
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const showDetail = (row) => {
  currentLog.value = row
  detailVisible.value = true
}

const formatBody = (body) => {
  if (!body) return '-'
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}

const clearLogs = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有系统日志吗？此操作不可恢复。', '清空确认', { type: 'warning' })
    clearing.value = true
    await axios.delete('/api/system-logs')
    ElMessage.success('日志已清空')
    loadData()
  } catch (e) {
    // 用户取消
  } finally {
    clearing.value = false
  }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.system-logs { padding: 20px; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions { display: flex; gap: 8px; }
.filter-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.path-text { font-family: monospace; font-size: 12px; color: #409EFF; }
.slow { color: #F56C6C; font-weight: bold; }
.error-text { color: #F56C6C; }
.body-pre {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.pagination-wrapper { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
