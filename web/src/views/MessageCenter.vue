<template>
  <div class="message-center">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>消息中心</span>
        </div>
      </template>

      <!-- 筛选区域 -->
      <div class="filter-bar">
        <el-select
          v-model="filterType"
          placeholder="消息类型"
          multiple
          collapse-tags
          collapse-tags-tooltip
          style="width: 300px; margin-right: 15px;"
          @change="handleFilterChange"
        >
          <el-option
            v-for="item in notificationTypes"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-radio-group v-model="filterRead" @change="handleFilterChange">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="0">未读</el-radio-button>
          <el-radio-button label="1">已读</el-radio-button>
        </el-radio-group>

        <el-input
          v-model="keyword"
          placeholder="搜索标题/内容"
          style="width: 200px; margin-left: 15px;"
          clearable
          @clear="handleFilterChange"
          @keyup.enter="handleFilterChange"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button style="margin-left: 10px;" @click="handleBatchRead">
          全部标为已读
        </el-button>
      </div>

      <!-- 消息列表 -->
      <el-table
        :data="messageList"
        style="width: 100%"
        @row-click="handleRowClick"
        v-loading="loading"
      >
        <el-table-column label="类型" width="120">
          <template #default="scope">
            <el-tag :type="getTypeTagType(scope.row.type)" size="small">
              {{ getTypeLabel(scope.row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="content" label="内容摘要" min-width="250">
          <template #default="scope">
            <span class="content-preview">{{ scope.row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="receiver_name" label="接收人" width="100" />
        <el-table-column prop="created_at" label="发送时间" width="160" />
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_read === 0 ? 'warning' : 'success'" size="small">
              {{ scope.row.is_read === 0 ? '未读' : '已读' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.is_read === 0"
              size="small"
              type="primary"
              link
              @click.stop="handleMarkRead(scope.row)"
            >
              标为已读
            </el-button>
            <el-button
              size="small"
              type="danger"
              link
              @click.stop="handleDelete(scope.row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import { Search } from '@element-plus/icons-vue'

const router = useRouter()

const messageList = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterType = ref([])
const filterRead = ref('')
const keyword = ref('')

// 消息类型映射
const notificationTypes = [
  { value: 'contract_created', label: '新增合同' },
  { value: 'contract_updated', label: '合同变更' },
  { value: 'project_created', label: '新增项目' },
  { value: 'project_status_changed', label: '项目状态变更' },
  { value: 'node_status_changed', label: '节点状态变更' },
  { value: 'project_progress', label: '项目进展' },
  { value: 'inspection_submit', label: '巡检提交' },
  { value: 'acceptance_submit', label: '验收提交' },
  { value: 'dispatch_created', label: '新增派工' },
  { value: 'dispatch_status_changed', label: '派工状态变更' },
  { value: 'approval_submit', label: '审批提交' },
  { value: 'approval_result', label: '审批结果' },
  { value: 'notice_published', label: '发布公告' },
  { value: 'customer_follow', label: '客户跟进' },
  { value: 'invoice_created', label: '新增发票' },
  { value: 'system_notice', label: '系统通知' }
]

// 消息类型 → 跳转路由映射
const typeRoutes = {
  contract_created: '/contracts',
  contract_updated: '/contracts',
  project_created: '/projects',
  project_status_changed: '/projects',
  node_status_changed: '/projects',
  project_progress: '/projects',
  inspection_submit: '/inspections',
  acceptance_submit: '/acceptance',
  dispatch_created: '/projects',
  dispatch_status_changed: '/projects',
  approval_submit: '/approvals',
  approval_result: '/approvals',
  notice_published: '/notices',
  customer_follow: '/customers',
  invoice_created: '/invoices',
  system_notice: '/notices'
}

const getTypeLabel = (type) => {
  const found = notificationTypes.find(t => t.value === type)
  return found ? found.label : type
}

const getTypeTagType = (type) => {
  const typeMap = {
    contract_created: 'success',
    contract_updated: 'warning',
    project_created: 'primary',
    project_status_changed: 'warning',
    node_status_changed: 'info',
    project_progress: 'info',
    inspection_submit: 'primary',
    acceptance_submit: 'primary',
    dispatch_created: 'success',
    dispatch_status_changed: 'warning',
    approval_submit: 'warning',
    approval_result: 'success',
    notice_published: 'danger',
    customer_follow: 'info',
    invoice_created: 'success',
    system_notice: 'danger'
  }
  return typeMap[type] || 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      is_read: filterRead.value,
      keyword: keyword.value,
      type: filterType.value.length > 0 ? filterType.value.join(',') : ''
    }

    const res = await request.get('/notifications/admin-list', { params })
    messageList.value = res.data || res.list || []
    total.value = res.total || 0
  } catch (error) {
    console.error('加载消息失败:', error)
    ElMessage.error('加载消息失败')
  } finally {
    loading.value = false
  }
}

const handleFilterChange = () => {
  currentPage.value = 1
  loadData()
}

const handleSizeChange = () => {
  currentPage.value = 1
  loadData()
}

const handleCurrentChange = () => {
  loadData()
}

const handleRowClick = (row) => {
  const route = typeRoutes[row.type] || '/'
  router.push({
    path: route,
    query: { highlight: row.source_id }
  })
}

const handleMarkRead = async (row) => {
  try {
    await request.put(`/notifications/${row.id}/read`)
    row.is_read = 1
    ElMessage.success('已标记为已读')
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该消息吗？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete(`/notifications/${row.id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const handleBatchRead = async () => {
  try {
    await ElMessageBox.confirm('确定要将所有消息标为已读吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })
    // 批量标记已读
    const unreadIds = messageList.value.filter(m => m.is_read === 0).map(m => m.id)
    if (unreadIds.length > 0) {
      await request.delete('/notifications', { data: { ids: unreadIds } })
    }
    ElMessage.success('已全部标为已读')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('操作失败')
  }
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
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}
.content-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
