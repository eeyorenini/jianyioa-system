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
import axios from 'axios'
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
  { value: '审批', label: '审批通知' },
  { value: '系统通知', label: '系统通知' },
  { value: '公告', label: '公告' },
  { value: '合同', label: '合同通知' },
  { value: '项目', label: '项目通知' }
]

const getTypeLabel = (type) => {
  const found = notificationTypes.find(t => t.value === type)
  return found ? found.label : type || '系统通知'
}

const getTypeTagType = (type) => {
  const typeMap = {
    '审批': 'warning',
    '系统通知': 'danger',
    '公告': 'primary',
    '合同': 'success',
    '项目': 'info'
  }
  return typeMap[type] || 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
    }
    if (filterType.value.length > 0) params.type = filterType.value[0]
    if (filterRead.value !== '') params.is_read = filterRead.value
    if (keyword.value) params.keyword = keyword.value

    const res = await axios.get('/api/messages', { params })
    messageList.value = res.data || []
    total.value = res.data?.length || 0
  } catch (error) {
    console.error('加载消息失败:', error)
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

const handleRowClick = async (row) => {
  // 标记已读
  if (row.is_read === 0) {
    try {
      await axios.put(`/api/messages/${row.id}/read`)
      row.is_read = 1
    } catch (e) {}
  }
  // 跳转到审批详情
  if (row.related_type === 'approval' && row.related_id) {
    router.push('/approvals')
  }
}

const handleMarkRead = async (row) => {
  try {
    await axios.put(`/api/messages/${row.id}/read`)
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
    // 暂时不支持删除
    ElMessage.info('消息暂不支持删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('操作失败')
  }
}

const handleBatchRead = async () => {
  try {
    await ElMessageBox.confirm('确定要将所有消息标为已读吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })
    await axios.put('/api/messages/read-all')
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
