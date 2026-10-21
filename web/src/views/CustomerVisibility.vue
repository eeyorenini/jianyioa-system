<template>
  <div class="customer-visibility">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>业主端可见配置</span>
          <el-button type="primary" @click="handleSave">
            <el-icon><Check /></el-icon>保存
          </el-button>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px;">
        <div style="line-height: 1.7; font-size: 13px;">
          这一页控制<b>业主在自己手机 App 里能看到哪些内容</b>。<br/>
          业主不是员工、不在角色表里，所以这 8 项是<b>全局开关</b>：改一次，所有业主统一生效。<br/>
          ⚠️ <b>前提</b>：业主必须先关联了项目，否则这里开不开都一样看不到。
        </div>
      </el-alert>

      <el-form :model="form" label-width="160px" v-loading="loading">
        <el-form-item label="项目信息（名称/进度/节点）">
          <el-switch v-model="form.project_info" />
          <span class="hint">首页 / 我的项目 / 项目信息</span>
        </el-form-item>

        <el-form-item label="施工日志">
          <el-switch v-model="form.project_log" />
          <span class="hint">含照片</span>
        </el-form-item>

        <el-form-item label="巡检记录">
          <el-switch v-model="form.inspection" />
          <span class="hint">巡检 / 质量记录</span>
        </el-form-item>

        <el-form-item label="验收记录">
          <el-switch v-model="form.acceptance" />
          <span class="hint">验收结果</span>
        </el-form-item>

        <el-form-item label="整改单">
          <el-switch v-model="form.rectification" />
          <span class="hint">整改单及状态</span>
        </el-form-item>

        <el-form-item label="合同金额">
          <el-switch v-model="form.contract_amount" />
          <span class="hint">合同/增项的金额字段（默认关，涉敏感财务）</span>
        </el-form-item>

        <el-form-item label="家庭成员">
          <el-switch v-model="form.family_members" />
          <span class="hint">可增删副账户（唯一可操作项）</span>
        </el-form-item>

        <el-form-item label="消息通知">
          <el-switch v-model="form.messages" />
          <span class="hint">客户端消息页</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import request from '@/utils/request'

const loading = ref(false)
const form = reactive({
  project_info: true,
  project_log: true,
  inspection: true,
  acceptance: true,
  rectification: true,
  contract_amount: false,
  family_members: true,
  messages: true,
})

const loadConfig = async () => {
  loading.value = true
  try {
    // 注意：request 实例的 baseURL 已经是 '/api'，这里不能再写 '/api/...'，
    // 否则会拼成 /api/api/... → 404（v2.3.13 修正）
    const data = await request.get('/system-settings/customer_visibility')
    if (data && typeof data === 'object') Object.assign(form, data)
  } catch (e) {
    // 接口异常时按默认值继续展示（不强失败），避免整页打不开
    console.warn('load customer_visibility failed:', e?.message)
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  loading.value = true
  try {
    await request.post('/system-settings/customer_visibility', { setting_value: form })
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || ''))
  } finally {
    loading.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.customer-visibility { padding: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.hint { color: #909399; font-size: 12px; margin-left: 12px; }
:deep(.el-form-item) { margin-bottom: 18px; }
</style>