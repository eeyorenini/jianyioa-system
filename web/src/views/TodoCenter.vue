<template>
  <div class="todo-center">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="page-title">待办中心</span>
            <el-tag v-if="total > 0" type="danger" effect="dark" size="small" round>
              {{ total }} 项待处理
            </el-tag>
            <el-tag v-else type="success" effect="plain" size="small" round>
              暂无待办
            </el-tag>
          </div>
          <el-button size="small" @click="loadData">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
      </template>

      <div class="tip-bar">
        按你的权限聚合：采购审核 · 报销 · 合同 · 增减项 · 审批 · 派工 · 节点到期 · 待整改
      </div>

      <!-- 分类筛选 -->
      <div class="chip-bar" v-if="visibleGroups.length">
        <div class="chip" :class="{ active: activeKey === 'all' }" @click="activeKey = 'all'">
          全部
          <span v-if="total" class="chip-badge">{{ total }}</span>
        </div>
        <div
          v-for="g in countGroups"
          :key="g.key"
          class="chip"
          :class="{ active: activeKey === g.key }"
          @click="activeKey = g.key"
        >
          <span class="chip-icon">{{ g.icon }}</span>
          {{ g.label }}
          <span v-if="g.count" class="chip-badge">{{ g.count }}</span>
        </div>
      </div>

      <div v-loading="loading">
        <el-empty
          v-if="!loading && visibleGroups.length === 0"
          description="暂无待办，去处理点别的吧"
        />

        <div v-for="g in visibleGroups" :key="g.key" class="group">
          <div class="group-header">
            <span class="group-icon">{{ g.icon }}</span>
            <span class="group-title">{{ g.label }}</span>
            <span class="group-count">{{ g.items.length }} / {{ g.count }}</span>
          </div>

          <div class="item-list">
            <div
              v-for="item in g.items"
              :key="g.key + '-' + item.id"
              class="todo-card"
              @click="goItem(item)"
            >
              <div class="todo-main">
                <div class="todo-title-row">
                  <span class="todo-title">{{ item.title }}</span>
                  <!-- 逾期 / 加急徽标（与移动端首页同规则） -->
                  <span v-if="item.urgency === 'overdue'" class="todo-badge badge-overdue">
                    已逾期 {{ item.days_left != null ? Math.abs(item.days_left) + ' 天' : '' }}
                  </span>
                  <span v-else-if="item.urgency === 'urgent'" class="todo-badge badge-urgent">
                    加急 {{ item.days_left != null ? item.days_left + ' 天' : '' }}
                  </span>
                  <span v-if="item.amount !== null && item.amount !== undefined" class="todo-amount">
                    ¥{{ fmtMoney(item.amount) }}
                  </span>
                </div>
                <div class="todo-sub-row">
                  <span class="todo-sub">{{ item.subtitle || '—' }}</span>
                  <span class="todo-time">{{ item.time }}</span>
                </div>
              </div>
              <div class="todo-action">
                <span class="action-text">去处理</span>
                <span class="action-arrow">›</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { Refresh } from '@element-plus/icons-vue'
import { resolveTodoTarget } from '@/utils/message-link'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const groups = ref([])
const total = ref(0)
const activeKey = ref('all')

const countGroups = computed(() => groups.value.filter(g => g.count > 0))

const visibleGroups = computed(() => {
  let list = groups.value.filter(g => g.count > 0 && g.items && g.items.length)
  if (activeKey.value !== 'all') {
    list = groups.value.filter(g => g.key === activeKey.value)
  }
  return list
})

const fmtMoney = (n) => {
  const num = Number(n) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/todo/center')
    if (res.data && res.data.code === 0) {
      // 审批流待办（采购/报销/合同/增减项/审批/派工审核）
      const gs = res.data.groups || []
      // 项目相关事项（节点即将到期 / 待整改 / 我的派工）——后端在 home.sections 里。
      // ⚠️ 2026-10-21 修复：原来只渲染 groups，home.sections 完全没取，
      //    导致"移动端待办有、PC 待办中心暂无待办"（待整改类事项被吞）。
      const sections = (res.data.home?.sections || [])
        .filter(s => (s.items || []).length)
        .map(s => ({
          key: 'home_' + s.key,
          label: s.label,
          icon: s.icon,
          // count 是真实总数（items 受后端 LIMIT 10 限制），与角标口径一致
          count: s.count != null ? Number(s.count) : s.items.length,
          items: s.items
        }))
      groups.value = [...gs, ...sections]
      const projItems = sections.reduce((n, s) => n + s.count, 0)
      total.value = (res.data.total || 0) + projItems
    } else {
      groups.value = []
      total.value = 0
    }
  } catch (e) {
    console.error('加载待办失败:', e)
    groups.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/** 点待办项 → 跳到对应 PC 页面（带 id，页面支持就自动定位） */
const goItem = (item) => {
  // 用 resolveTodoTarget 而非 resolvePcTarget：催收未确认收款落到 /finance-projects，
  // 该页有 finance 权限守卫，无财务权限的提交人会回落到项目列表
  const target = resolveTodoTarget(item, userStore.can)
  if (!target) {
    router.push('/dashboard')
    return
  }
  router.push(target)
}

onMounted(loadData)
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
.tip-bar {
  font-size: 12px;
  color: #909399;
  margin-bottom: 14px;
}
.chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 16px;
  background: #f2f4f7;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.chip:hover {
  background: #e6ebf2;
}
.chip.active {
  background: #1E3A5F;
  color: #fff;
}
.chip-icon {
  font-size: 13px;
}
.chip-badge {
  background: #F56C6C;
  color: #fff;
  border-radius: 9px;
  font-size: 11px;
  padding: 0 6px;
  line-height: 16px;
}
.chip.active .chip-badge {
  background: rgba(255, 255, 255, .3);
}
.group {
  margin-bottom: 22px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.group-icon {
  font-size: 16px;
}
.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
  flex: 1;
}
.group-count {
  font-size: 12px;
  color: #909399;
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.todo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all .15s;
}
.todo-card:hover {
  border-color: #c6d4e6;
  box-shadow: 0 2px 8px rgba(30, 58, 95, .08);
}
.todo-main {
  flex: 1;
  min-width: 0;
}
.todo-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.todo-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-amount {
  font-size: 14px;
  font-weight: 700;
  color: #E6A23C;
  flex-shrink: 0;
}
/* 逾期 / 加急徽标（与移动端 home/index.vue 的 badge-overdue / badge-urgent 完全同色） */
.todo-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 18px;
}
.badge-overdue {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FCA5A5;
}
.badge-urgent {
  background: #FFF7ED;
  color: #EA580C;
  border: 1px solid #FED7AA;
}
.todo-sub-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 5px;
}
.todo-sub {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-time {
  font-size: 12px;
  color: #c0c4cc;
  flex-shrink: 0;
}
.todo-action {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.action-text {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 500;
}
.action-arrow {
  font-size: 16px;
  color: #1E3A5F;
}
</style>
