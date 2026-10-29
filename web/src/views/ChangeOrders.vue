<template>
  <div class="change-orders">
    <!-- 页面头 -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">增减项管理</h2>
        <p class="page-sub">
          施工过程中的增项 / 减项单据，审批通过后进入结算 · 共 <b>{{ list.length }}</b> 条
        </p>
      </div>
      <div class="page-head-right">
        <el-button class="btn-ghost" @click="fetchList">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>
    </div>

    <!-- 状态概览（点击即筛选） -->
    <div class="stat-grid">
      <div
        v-for="s in statCards"
        :key="s.key"
        class="stat-card"
        :class="{ active: curStatus === s.key }"
        @click="curStatus = s.key"
      >
        <div class="stat-icon" :style="{ background: s.soft, color: s.color }">{{ s.icon }}</div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
        <span class="stat-accent" :style="{ background: s.color }"></span>
      </div>
    </div>

    <!-- 列表 -->
    <div class="table-card">
      <div class="table-head">
        <div class="table-head-left">
          <span class="table-title">变更单列表</span>
          <span v-if="curStatus" class="filter-chip">
            {{ curStatus }}
            <span class="chip-x" @click="curStatus = ''">×</span>
          </span>
        </div>
        <span class="table-count">当前筛选 <b>{{ filteredList.length }}</b> 条</span>
      </div>

      <el-table :data="filteredList" class="co-table" style="width:100%" v-loading="loading" row-key="id">
        <el-table-column label="项目" min-width="200">
          <template #default="{ row }">
            <div class="proj-cell">
              <div class="proj-icon">🏗</div>
              <div class="proj-main">
                <div class="proj-name">{{ row.project_name || '-' }}</div>
                <div class="proj-sub">变更单 #{{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="变更事项" min-width="220">
          <template #default="{ row }">
            <div class="item-title">{{ row.title || '-' }}</div>
            <div v-if="row.reason" class="item-sub">{{ row.reason }}</div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="104">
          <template #default="{ row }">
            <span class="type-pill" :class="row.change_type === 'increase' ? 't-inc' : 't-dec'">
              {{ row.change_type === 'increase' ? '增加项' : '减少项' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="金额（元）" width="150" align="right">
          <template #default="{ row }">
            <span class="amount" :class="row.change_type === 'increase' ? 'a-inc' : 'a-dec'">
              {{ row.change_type === 'increase' ? '+' : '-' }}¥{{ formatNumber(row.amount) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="提交人" width="130">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="avatar" :style="{ background: avatarBg(row.submitted_by_name) }">
                {{ firstChar(row.submitted_by_name) }}
              </div>
              <span class="user-name">{{ row.submitted_by_name || '-' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">
            <span class="time-text">{{ row.submitted_at ? row.submitted_at.substring(0, 16) : '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="106">
          <template #default="{ row }">
            <span class="status-pill" :class="'st-' + getStatusType(row.status)">
              <span class="dot"></span>{{ row.statusText }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              class="btn-review"
              size="small"
              @click="openReviewDialog(row)"
            >
              去审核
            </el-button>
            <span v-else-if="row.status === 'approved'" class="done-text st-success">已通过</span>
            <span v-else-if="row.status === 'rejected'" class="done-text st-danger">已驳回</span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <div class="empty-title">{{ curStatus ? `暂无「${curStatus}」的变更单` : '暂无增减项记录' }}</div>
            <div class="empty-sub">施工过程中提交的增项 / 减项单据会显示在这里</div>
          </div>
        </template>
      </el-table>
    </div>

    <!-- 审核弹窗 -->
    <el-dialog v-model="reviewDialogVisible" width="520px" class="co-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🔍</div>
          <div>
            <div class="dlg-head-title">审核增减项</div>
            <div class="dlg-head-sub">请确认变更内容与金额无误后再提交审核结果</div>
          </div>
        </div>
      </template>

      <div v-if="currentItem" class="review-body">
        <!-- 摘要 -->
        <div class="review-hero" :class="currentItem.change_type === 'increase' ? 'h-inc' : 'h-dec'">
          <div class="hero-left">
            <span class="type-pill" :class="currentItem.change_type === 'increase' ? 't-inc' : 't-dec'">
              {{ currentItem.change_type === 'increase' ? '增加项' : '减少项' }}
            </span>
            <div class="hero-title">{{ currentItem.title || '-' }}</div>
            <div class="hero-proj">{{ currentItem.project_name || '-' }}</div>
          </div>
          <div class="hero-amount" :class="currentItem.change_type === 'increase' ? 'a-inc' : 'a-dec'">
            {{ currentItem.change_type === 'increase' ? '+' : '-' }}¥{{ formatNumber(currentItem.amount) }}
          </div>
        </div>

        <!-- 明细 -->
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">项目名称</div>
            <div class="info-value">{{ currentItem.project_name || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">提交人</div>
            <div class="info-value">{{ currentItem.submitted_by_name || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">提交时间</div>
            <div class="info-value">{{ currentItem.submitted_at ? currentItem.submitted_at.substring(0, 16) : '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">当前状态</div>
            <div class="info-value">
              <span class="status-pill" :class="'st-' + getStatusType(currentItem.status)">
                <span class="dot"></span>{{ currentItem.statusText }}
              </span>
            </div>
          </div>
        </div>

        <!-- 原因 -->
        <div class="block">
          <div class="block-label">原因 / 说明</div>
          <div class="block-text">{{ currentItem.reason || '未填写说明' }}</div>
        </div>

        <!-- 审核备注 -->
        <div class="block">
          <div class="block-label">审核备注 <span class="opt">（选填）</span></div>
          <el-input
            v-model="reviewRemark"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="可填写通过或驳回的原因，将同步给提交人"
          />
        </div>
      </div>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="reviewDialogVisible = false">取消</el-button>
          <div class="footer-right">
            <el-button class="btn-reject" @click="doReject">驳回</el-button>
            <el-button class="btn-approve" @click="doApprove">通过</el-button>
          </div>
        </div>
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

/* ---------- 仅用于展示：状态统计卡 ---------- */
const countOf = (statusText) => list.value.filter(i => i.statusText === statusText).length
const statCards = computed(() => [
  { key: '', label: '全部变更单', value: list.value.length, icon: '📋', color: '#1E3A5F', soft: '#EAF0F7' },
  { key: '待审核', label: '待审核', value: countOf('待审核'), icon: '⏳', color: '#E6A23C', soft: '#FDF6EC' },
  { key: '已通过', label: '已通过', value: countOf('已通过'), icon: '✅', color: '#67C23A', soft: '#F0F9EB' },
  { key: '已驳回', label: '已驳回', value: countOf('已驳回'), icon: '⛔', color: '#F56C6C', soft: '#FEF0F0' },
])

const firstChar = (name) => (name ? String(name).trim().charAt(0) : '?')
const AVATAR_COLORS = ['#2D5A8F', '#4A7BB7', '#5B8C5A', '#B8894A', '#8A6FA8', '#4F8A8B']
const avatarBg = (name) => {
  const s = String(name || '?')
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

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
.change-orders { padding: 0; }

/* ==================== 页面头 ==================== */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1E3A5F;
  margin: 0;
}
.page-sub { font-size: 13px; color: #909399; margin: 6px 0 0; }
.page-sub b { color: #409EFF; font-weight: 600; }
.page-head-right { display: flex; align-items: center; gap: 10px; }
.btn-ghost {
  border-radius: 10px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #dbe3ec;
  color: #4a5b6e;
  background: #fff;
}
.btn-ghost:hover { color: #1E3A5F; border-color: #b9c7d8; background: #f7f9fc; }

/* ==================== 统计卡 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #EBEEF5;
  box-shadow: 0 2px 10px rgba(0, 21, 41, 0.04);
  overflow: hidden;
  cursor: pointer;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0, 21, 41, 0.09); }
.stat-card.active { border-color: #1E3A5F; box-shadow: 0 8px 22px rgba(30, 58, 95, 0.14); }
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.stat-body { min-width: 0; }
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.1; }
.stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
.stat-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; opacity: .85; }

/* ==================== 表格卡片 ==================== */
.table-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 8px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
}
.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.table-head-left { display: flex; align-items: center; gap: 10px; }
.table-title { font-size: 15px; font-weight: 600; color: #1E3A5F; }
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1E3A5F;
  background: #EAF0F7;
  border-radius: 10px;
  padding: 2px 8px 2px 10px;
  line-height: 18px;
}
.chip-x {
  cursor: pointer;
  color: #7b8b9e;
  font-size: 14px;
  line-height: 1;
}
.chip-x:hover { color: #F56C6C; }
.table-count { font-size: 12px; color: #909399; }
.table-count b { color: #409EFF; font-weight: 600; }

/* ==================== 表格 ==================== */
.co-table { --el-table-border-color: #f0f2f5; }
.co-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.co-table :deep(td.el-table__cell) {
  padding: 12px 0;
  border-bottom: 1px solid #f5f7fa;
}
.co-table :deep(.el-table__row) { transition: background .15s; }
.co-table :deep(.el-table__row:hover > td.el-table__cell) { background: #f5f9ff !important; }

.proj-cell { display: flex; align-items: center; gap: 11px; }
.proj-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #EAF0F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.proj-main { min-width: 0; }
.proj-name { font-size: 14px; font-weight: 600; color: #1f2d3d; }
.proj-sub { font-size: 12px; color: #a8abb2; margin-top: 2px; font-family: ui-monospace, Menlo, monospace; }

.item-title { font-size: 14px; color: #303133; font-weight: 500; }
.item-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.type-pill {
  display: inline-block;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 8px;
  line-height: 18px;
  font-weight: 500;
}
.t-inc { color: #529b2e; background: #f0f9eb; }
.t-dec { color: #c45656; background: #fef0f0; }

.amount { font-size: 14px; font-weight: 700; font-family: ui-monospace, Menlo, monospace; }
.a-inc { color: #67C23A; }
.a-dec { color: #F56C6C; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-name { font-size: 13px; color: #303133; }

.time-text { font-size: 13px; color: #606266; }

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
  line-height: 19px;
}
.status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.st-success { color: #529b2e; background: #f0f9eb; }
.st-warning { color: #b88230; background: #fdf6ec; }
.st-danger { color: #c45656; background: #fef0f0; }

.btn-review {
  border-radius: 8px;
  border: 1px solid #1E3A5F;
  background: #1E3A5F;
  color: #fff;
  padding: 5px 12px;
  font-size: 12px;
}
.btn-review:hover { background: #2D5A8F; border-color: #2D5A8F; color: #fff; }
.done-text { font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 8px; }

/* 空状态 */
.empty-state { padding: 44px 0 34px; text-align: center; }
.empty-icon { font-size: 40px; line-height: 1; opacity: .75; }
.empty-title { font-size: 14px; font-weight: 600; color: #606266; margin-top: 12px; }
.empty-sub { font-size: 12px; color: #a8abb2; margin-top: 6px; }

/* ==================== 审核弹窗 ==================== */
.dlg-head { display: flex; align-items: center; gap: 12px; }
.dlg-head-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #EAF0F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.dlg-head-title { font-size: 16px; font-weight: 700; color: #1E3A5F; }
.dlg-head-sub { font-size: 12px; color: #909399; margin-top: 3px; }

.review-body { padding: 2px 0 0; }

.review-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  margin-bottom: 16px;
}
.review-hero.h-inc { background: linear-gradient(135deg, #f2faf0, #eaf6e6); border: 1px solid #dcefd5; }
.review-hero.h-dec { background: linear-gradient(135deg, #fff5f5, #fdeeee); border: 1px solid #fadcdc; }
.hero-left { min-width: 0; }
.hero-title { font-size: 15px; font-weight: 600; color: #1f2d3d; margin-top: 8px; }
.hero-proj { font-size: 12px; color: #7b8b9e; margin-top: 4px; }
.hero-amount {
  font-size: 22px;
  font-weight: 700;
  font-family: ui-monospace, Menlo, monospace;
  white-space: nowrap;
  flex-shrink: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.info-item {
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 9px 12px;
}
.info-label { font-size: 12px; color: #909399; }
.info-value { font-size: 13px; color: #303133; font-weight: 500; margin-top: 3px; word-break: break-all; }

.block { margin-bottom: 14px; }
.block-label { font-size: 12px; color: #909399; margin-bottom: 6px; }
.block-label .opt { color: #c0c4cc; }
.block-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.7;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.dlg-footer { display: flex; align-items: center; justify-content: space-between; }
.footer-right { display: flex; gap: 10px; }
.btn-approve {
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  color: #fff;
  border-radius: 10px;
  padding: 0 22px;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .22);
}
.btn-approve:hover { background: linear-gradient(135deg, #3569a5, #24466f); color: #fff; }
.btn-reject {
  border-radius: 10px;
  padding: 0 18px;
  color: #c45656;
  border: 1px solid #f3c6c6;
  background: #fff;
}
.btn-reject:hover { background: #fef0f0; border-color: #f0b6b6; color: #c45656; }

/* ==================== 响应式 ==================== */
@media screen and (max-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
}
@media screen and (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-value { font-size: 20px; }
  .stat-icon { width: 38px; height: 38px; font-size: 17px; }
  .table-card { padding: 12px 10px 4px; }
  .info-grid { grid-template-columns: 1fr; }
  .review-hero { flex-direction: column; align-items: flex-start; }
}
</style>
