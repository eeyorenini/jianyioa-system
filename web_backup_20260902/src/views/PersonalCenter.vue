<template>
  <div class="personal-center">
    <el-card>
      <template #header>
        <div class="header">
          <span>个人中心</span>
        </div>
      </template>
      <div class="section" v-for="section in sections" :key="section.title">
        <div class="section-title">{{ section.title }}</div>
        <el-row :gutter="16">
          <el-col :span="6" v-for="item in section.items" :key="item.name">
            <div class="entry" @click="handleJump(item)">
              <el-icon class="entry-icon"><UserFilled /></el-icon>
              <span>{{ item.name }}</span>
            </div>
          </el-col>
        </el-row>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const sections = [
  {
    title: '渠道资源',
    items: [
      { name: '我的客户', path: '/customers' },
      { name: '我的渠道', path: '/channels' }
    ]
  },
  {
    title: '行政管理',
    items: [
      { name: '我的工单', path: '/projects' },
      { name: '我的汇报', path: '/reports' },
      { name: '办公审批', path: '/approvals' },
      { name: '个人奖罚' },
      { name: '个人领用', path: '/warehouse' },
      { name: '我的巡检整改', path: '/inspections' }
    ]
  },
  {
    title: '个人费用',
    items: [
      { name: '结算详情', path: '/finance' },
      { name: '个人零售', path: '/quotes' },
      { name: '个人采购', path: '/material-orders' },
      { name: '个人报销', path: '/approvals' },
      { name: '个人借款', path: '/finance' },
      { name: '工资详情' }
    ]
  }
]

const handleJump = (item) => {
  if (!item.path) {
    ElMessage.info('该功能正在建设中')
    return
  }
  router.push(item.path)
}
</script>

<style scoped>
.header {
  font-size: 18px;
  font-weight: 600;
}

.section {
  margin-bottom: 24px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  background: #f8fbff;
  color: #2d3a4b;
  cursor: pointer;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.entry:hover {
  color: #409eff;
  background: #ecf5ff;
}

.entry-icon {
  color: #409eff;
}
</style>
