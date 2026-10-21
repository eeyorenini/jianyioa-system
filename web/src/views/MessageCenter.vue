<template>
  <div class="message-center">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="page-title">消息中心</span>
            <el-tag v-if="unreadCount > 0" type="danger" effect="dark" size="small" round>
              {{ unreadCount }} 条未读
            </el-tag>
          </div>
          <el-button size="small" :disabled="unreadCount === 0" @click="handleBatchRead">
            全部标为已读
          </el-button>
        </div>
      </template>

      <!-- 筛选区域 -->
      <div class="filter-bar">
        <el-select
          v-model="filterType"
          placeholder="全部类型"
          clearable
          style="width: 160px; margin-right: 12px;"
          @change="handleFilterChange"
        >
          <el-option
            v-for="item in typeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-radio-group v-model="filterRead" @change="handleFilterChange">
          <el-radio-button label="" value="">全部</el-radio-button>
          <el-radio-button label="0" value="0">未读</el-radio-button>
          <el-radio-button label="1" value="1">已读</el-radio-button>
        </el-radio-group>

        <el-input
          v-model="keyword"
          placeholder="搜索标题/内容"
          style="width: 200px; margin-left: 12px;"
          clearable
          @clear="handleFilterChange"
          @keyup.enter="handleFilterChange"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <!-- 消息列表 -->
      <el-table
        :data="messageList"
        style="width: 100%"
        row-class-name="msg-row"
        @row-click="handleRowClick"
        v-loading="loading"
      >
        <el-table-column label="类型" width="130">
          <template #default="scope">
            <span class="type-cell">
              <span class="type-icon">{{ msgTypeConfig(scope.row.type).icon }}</span>
              <el-tag :color="msgTypeConfig(scope.row.type).color + '1A'" size="small" style="border: none;">
                <span :style="{ color: msgTypeConfig(scope.row.type).color }">
                  {{ msgTypeConfig(scope.row.type).text }}
                </span>
              </el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="220">
          <template #default="scope">
            <span class="title-cell" :class="{ unread: scope.row.is_read === 0 }">
              <span v-if="scope.row.is_read === 0" class="unread-dot"></span>
              {{ scope.row.title }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容摘要" min-width="260">
          <template #default="scope">
            <span class="content-preview">{{ scope.row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="scope">
            <el-button size="small" type="primary" link @click.stop="openDetail(scope.row)">
              查看
            </el-button>
            <el-button
              v-if="scope.row.is_read === 0"
              size="small"
              type="success"
              link
              @click.stop="handleMarkRead(scope.row)"
            >
              标为已读
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && messageList.length === 0" description="暂无消息" />

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="total > 0">
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

    <!-- 消息详情抽屉 -->
    <el-drawer v-model="detailVisible" title="消息详情" size="480px">
      <div v-if="currentMsg" class="msg-detail">
        <div class="detail-head">
          <span class="detail-icon">{{ msgTypeConfig(currentMsg.type).icon }}</span>
          <div class="detail-head-main">
            <div class="detail-title">{{ currentMsg.title }}</div>
            <div class="detail-meta">
              <el-tag :color="msgTypeConfig(currentMsg.type).color + '1A'" size="small" style="border: none;">
                <span :style="{ color: msgTypeConfig(currentMsg.type).color }">
                  {{ msgTypeConfig(currentMsg.type).text }}
                </span>
              </el-tag>
              <span class="detail-time">{{ currentMsg.created_at }}</span>
            </div>
          </div>
        </div>

        <div class="detail-content">{{ currentMsg.content || '（无正文）' }}</div>

        <div class="detail-actions">
          <el-button
            v-if="targetPath"
            type="primary"
            @click="goTarget(currentMsg)"
          >
            前往处理 →
          </el-button>
          <span v-else class="detail-tip">该消息没有关联的业务页面</span>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { Search } from '@element-plus/icons-vue'
import { MSG_TYPE_CONFIG, msgTypeConfig, resolvePcTarget } from '@/utils/message-link'

const router = useRouter()

const messageList = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterType = ref('')
const filterRead = ref('')
const keyword = ref('')
const unreadCount = ref(0)

const detailVisible = ref(false)
const currentMsg = ref(null)

// 类型下拉选项：只列业务上常用的几类，避免几十项糊满
const COMMON_TYPES = [
  'purchase', 'approval_submit', 'dispatch_created', 'dispatch_status_changed',
  'contract_created', 'contract_uploaded', 'contract_approved',
  'contract_change_created', 'contract_change_approved',
  'project_created', 'project_progress', 'node_status_changed',
  'inspection_submit', 'acceptance_submit',
  'project_file_pending', 'project_file_approved',
  'collection_created', 'collection_confirmed',
  'notice_published', 'system_notice'
]
const typeOptions = COMMON_TYPES
  .filter(t => MSG_TYPE_CONFIG[t])
  .map(t => ({ value: t, label: MSG_TYPE_CONFIG[t].text }))

const targetPath = computed(() => (currentMsg.value ? resolvePcTarget(currentMsg.value) : null))

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
    }
    if (filterType.value) params.type = filterType.value
    if (filterRead.value !== '') params.is_read = filterRead.value
    if (keyword.value) params.keyword = keyword.value

    const res = await axios.get('/api/messages', { params })
    // 后端返回 { list, total, page, page_size }
    messageList.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (error) {
    console.error('加载消息失败:', error)
    messageList.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const loadUnread = async () => {
  try {
    const res = await axios.get('/api/messages/unread-count')
    unreadCount.value = res.data?.count || res.data?.total || 0
  } catch {
    unreadCount.value = 0
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

/** 标记单条已读（本地同步 + 刷新角标） */
const markRead = async (row) => {
  if (row.is_read !== 0) return
  try {
    await axios.put(`/api/messages/${row.id}/read`)
    row.is_read = 1
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } catch (e) { /* 忽略，不阻塞跳转 */ }
}

/** 点击行：先标已读，有业务页面就直接跳，没有就打开详情 */
const handleRowClick = async (row) => {
  await markRead(row)
  const target = resolvePcTarget(row)
  if (target) {
    router.push(target)
  } else {
    currentMsg.value = row
    detailVisible.value = true
  }
}

const openDetail = async (row) => {
  await markRead(row)
  currentMsg.value = row
  detailVisible.value = true
}

const goTarget = (row) => {
  const target = resolvePcTarget(row)
  if (!target) return
  detailVisible.value = false
  router.push(target)
}

const handleMarkRead = async (row) => {
  try {
    await axios.put(`/api/messages/${row.id}/read`)
    row.is_read = 1
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    ElMessage.success('已标记为已读')
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleBatchRead = async () => {
  try {
    await ElMessageBox.confirm('确定要把所有消息标为已读吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })
    await axios.put('/api/messages/read-all')
    ElMessage.success('已全部标为已读')
    unreadCount.value = 0
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadData()
  loadUnread()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #1E3A5F;
}
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.type-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.type-icon {
  font-size: 15px;
  line-height: 1;
}
.title-cell {
  color: #303133;
}
.title-cell.unread {
  font-weight: 600;
  color: #1E3A5F;
}
.unread-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #F56C6C;
  margin-right: 6px;
  vertical-align: middle;
}
.content-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  color: #909399;
}
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.msg-detail {
  padding: 0 4px;
}
.detail-head {
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.detail-icon {
  font-size: 26px;
  line-height: 1;
}
.detail-head-main {
  flex: 1;
}
.detail-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-time {
  font-size: 12px;
  color: #909399;
}
.detail-content {
  padding: 18px 0;
  font-size: 14px;
  line-height: 1.8;
  color: #606266;
  white-space: pre-wrap;
}
.detail-actions {
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
.detail-tip {
  font-size: 12px;
  color: #c0c4cc;
}
:deep(.msg-row) {
  cursor: pointer;
}
</style>
