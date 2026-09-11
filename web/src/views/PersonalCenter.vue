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

    <!-- 修改密码 -->
    <el-card style="margin-top: 16px;">
      <template #header>
        <div class="header">修改密码</div>
      </template>
      <el-form :model="pwdForm" label-width="100px" style="max-width: 400px;">
        <el-form-item label="旧密码">
          <el-input v-model="pwdForm.old_password" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.new_password" type="password" show-password placeholder="请输入新密码（至少6位）" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleChangePassword">确认修改</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { reactive } from 'vue'

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

const pwdForm = reactive({
  old_password: '',
  new_password: ''
})

const handleChangePassword = async () => {
  if (!pwdForm.old_password) {
    ElMessage.warning('请输入旧密码')
    return
  }
  if (!pwdForm.new_password || pwdForm.new_password.length < 6) {
    ElMessage.warning('新密码至少6位')
    return
  }
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
    await axios.put(`/api/employees/${userInfo.id}/password`, {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password
    })
    ElMessage.success('密码修改成功')
    pwdForm.old_password = ''
    pwdForm.new_password = ''
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '修改失败')
  }
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
