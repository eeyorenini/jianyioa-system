<template>
  <div class="sms-templates">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>短信模板列表</span>
          <el-button type="primary" @click="openAddDialog">
            <el-icon><Plus /></el-icon>
            新增模板
          </el-button>
        </div>
      </template>

      <!-- 说明文字 -->
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        模板内容支持变量占位符，创建项目节点时选择模板即可自动替换。
        变量格式：<code>{"{"}客户姓名{"}"}</code>、<code>{"{"}项目名称{"}"}</code>、<code>{"{"}节点名称{"}"}</code>、<code>{"{"}日期{"}"}</code>
      </el-alert>

      <el-table :data="templateList" style="width: 100%" border>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="模板名称" width="150" />
        <el-table-column prop="content" label="短信内容">
          <template #default="scope">
            <span style="font-size: 13px; color: #666">{{ scope.row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sign_name" label="签名" width="130">
          <template #default="scope">
            <span v-if="scope.row.sign_name" style="color: #67c23a">{{ scope.row.sign_name }}</span>
            <span v-else style="color: #909399">未设置</span>
          </template>
        </el-table-column>
        <el-table-column prop="aliyun_template_code" label="阿里云CODE" width="160">
          <template #default="scope">
            <span v-if="scope.row.aliyun_template_code" style="font-family: monospace; font-size: 12px">{{ scope.row.aliyun_template_code }}</span>
            <el-tag v-else type="warning" size="small">未同步</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'info'" size="small">
              {{ scope.row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="220">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="handleEdit(scope.row)">编辑</el-button>
            <el-button size="small" type="success" link @click="openSyncDialog(scope.row)" :loading="syncingId === scope.row.id">
              同步阿里云
            </el-button>
            <el-button size="small" type="danger" link @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="isEdit ? '编辑短信模板' : '新增短信模板'" width="600px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如：节点完成通知" />
        </el-form-item>
        <el-form-item label="短信内容" required>
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="您好{客户姓名}，您的项目{项目名称}的{节点名称}已完成，期待您的确认。" />
          <!-- 变量快捷插入区 -->
          <div class="var-insert-bar">
            <span class="var-label">快捷插入变量：</span>
            <el-tag
              v-for="v in varList"
              :key="v.key"
              class="var-tag"
              effect="plain"
              @click="insertVar(v.key)"
            >{{ v.label }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>

    <!-- 同步阿里云弹窗 -->
    <el-dialog v-model="showSyncDialog" title="同步到阿里云" width="480px">
      <el-form label-width="100px">
        <el-form-item label="模板">
          <span style="color: #333">{{ syncForm.template_name }}</span>
        </el-form-item>
        <el-form-item label="选择签名" required>
          <el-select v-model="syncForm.sign_name" placeholder="请选择阿里云签名" style="width: 100%">
            <el-option label="福进万家地产" value="福进万家地产" />
            <el-option label="简逸装饰" value="简逸装饰" />
          </el-select>
        </el-form-item>
        <el-form-item label="变量说明">
          <div style="font-size: 12px; color: #909399; line-height: 1.6">
            同步时自动映射：<br/>
            {客户姓名} → ${name}<br/>
            {项目名称} → ${project}<br/>
            {节点名称} → ${node}<br/>
            {日期} → ${date}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSyncDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSync" :loading="syncLoading">确认同步</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const templateList = ref([])
const showDialog = ref(false)
const isEdit = ref(false)
const showSyncDialog = ref(false)
const syncingId = ref(null)
const syncLoading = ref(false)

// 短信模板变量列表
const varList = [
  { key: '{客户姓名}', label: '客户姓名' },
  { key: '{项目名称}', label: '项目名称' },
  { key: '{节点名称}', label: '节点名称' },
  { key: '{日期}', label: '日期' }
]

// 插入变量到内容
const insertVar = (key) => {
  form.content += key
}

const form = reactive({
  id: null,
  name: '',
  content: '',
  is_active: true
})

const syncForm = reactive({
  template_id: null,
  template_name: '',
  sign_name: ''
})

const loadData = async () => {
  try {
    const res = await axios.get('/api/sms-templates')
    templateList.value = res.data
  } catch (error) {
    console.error('加载失败:', error)
  }
}

const openAddDialog = () => {
  isEdit.value = false
  form.id = null
  form.name = ''
  form.content = ''
  form.is_active = true
  showDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  form.id = row.id
  form.name = row.name
  form.content = row.content
  form.is_active = row.is_active == 1
  showDialog.value = true
}

const openSyncDialog = (row) => {
  syncForm.template_id = row.id
  syncForm.template_name = row.name
  syncForm.sign_name = row.sign_name || ''
  showSyncDialog.value = true
  syncLoading.value = false
}

const handleSync = async () => {
  if (!syncForm.sign_name) {
    ElMessage.warning('请先选择签名')
    return
  }
  syncLoading.value = true
  try {
    const res = await axios.post('/api/sms-templates/sync-aliyun', {
      template_id: syncForm.template_id,
      sign_name: syncForm.sign_name
    })
    if (res.data.success) {
      ElMessage.success('同步成功，阿里云模板CODE：' + res.data.template_code)
      showSyncDialog.value = false
      loadData()
    } else {
      ElMessage.error(res.data.error || '同步失败')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '同步失败')
  } finally {
    syncLoading.value = false
  }
}

const handleSave = async () => {
  if (!form.name || !form.content) {
    ElMessage.warning('请填写完整信息')
    return
  }
  try {
    if (isEdit.value) {
      await axios.put(`/api/sms-templates/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/sms-templates', form)
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    loadData()
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.response?.data?.error || error.message))
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该短信模板？', '确认删除', { type: 'warning' })
    await axios.delete(`/api/sms-templates/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
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
.var-insert-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.var-label {
  font-size: 13px;
  color: #909399;
}
.var-tag {
  cursor: pointer;
  font-size: 13px;
}
</style>
