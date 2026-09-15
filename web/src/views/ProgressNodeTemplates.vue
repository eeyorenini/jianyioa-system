<template>
  <div class="progress-node-templates">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>进度节点模板</span>
          <el-button type="primary" @click="openTemplateDialog">
            <el-icon><Plus /></el-icon>
            新增模板
          </el-button>
        </div>
      </template>

      <el-table :data="templateList" style="width: 100%" border>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="模板名称" width="200" />
        <el-table-column prop="description" label="描述" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="200">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="goToNodes(scope.row)">管理节点</el-button>
            <el-button size="small" type="primary" link @click="handleEditTemplate(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="handleDeleteTemplate(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑模板弹窗 -->
    <el-dialog v-model="showTemplateDialog" :title="isEditTemplate ? '编辑模板' : '新增模板'" width="500px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模板名称" required>
          <el-input v-model="templateForm.name" placeholder="如：标准装修流程" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="templateForm.description" type="textarea" :rows="2" placeholder="模板用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTemplateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveTemplate">确定</el-button>
      </template>
    </el-dialog>

    <!-- 节点管理抽屉 -->
    <el-drawer v-model="showNodeDrawer" :title="`模板节点：${currentTemplate?.name}`" size="700px">
      <div style="margin-bottom: 12px">
        <el-button type="primary" size="small" @click="() => openNodeDialog()">
          <el-icon><Plus /></el-icon>新增节点
        </el-button>
        <el-button size="small" @click="loadTemplateNodes">刷新</el-button>
      </div>
      <el-table :data="nodeList" style="width: 100%" border>
        <el-table-column prop="sort_order" label="顺序" width="70" />
        <el-table-column prop="node_name" label="节点名称" width="160" />
        <el-table-column prop="node_key" label="标识" width="160" />
        <el-table-column prop="sms_template_name" label="默认短信模板" width="150">
          <template #default="scope">{{ scope.row.sms_template_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="openNodeDialog(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="handleDeleteNode(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- 新增/编辑节点弹窗 -->
    <el-dialog v-model="showNodeDialog" :title="isEditNode ? '编辑节点' : '新增节点'" width="500px">
      <el-form :model="nodeForm" label-width="120px">
        <el-form-item label="节点名称" required>
          <el-input v-model="nodeForm.node_name" placeholder="如：水电工程完成" @input="handleNodeNameInput" />
        </el-form-item>
        <el-form-item label="节点标识" required>
          <el-input v-model="nodeForm.node_key" placeholder="英文唯一标识，如 water_complete" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="nodeForm.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="默认短信模板">
          <el-select v-model="nodeForm.default_sms_template_id" placeholder="可选" clearable style="width: 100%">
            <el-option v-for="t in smsTemplateList" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNodeDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveNode">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import axios from 'axios'
import { pinyin } from 'pinyin-pro'
import { ElMessage, ElMessageBox } from 'element-plus'

const templateList = ref([])
const nodeList = ref([])
const smsTemplateList = ref([])
const showTemplateDialog = ref(false)
const showNodeDrawer = ref(false)
const showNodeDialog = ref(false)
const isEditTemplate = ref(false)
const isEditNode = ref(false)
const currentTemplate = ref(null)

const templateForm = reactive({
  id: null,
  name: '',
  description: ''
})

const nodeForm = reactive({
  id: null,
  template_id: null,
  node_name: '',
  node_key: '',
  sort_order: 0,
  default_sms_template_id: null
})

// 加载模板列表
const loadTemplates = async () => {
  try {
    const res = await axios.get('/api/progress-node-templates')
    templateList.value = res.data
  } catch (error) {
    console.error('加载模板失败:', error)
  }
}

// 加载短信模板
const loadSmsTemplates = async () => {
  try {
    const res = await axios.get('/api/sms-templates')
    smsTemplateList.value = res.data
  } catch (error) {
    console.error('加载短信模板失败:', error)
  }
}

const openTemplateDialog = () => {
  isEditTemplate.value = false
  templateForm.id = null
  templateForm.name = ''
  templateForm.description = ''
  showTemplateDialog.value = true
}

const handleEditTemplate = (row) => {
  isEditTemplate.value = true
  templateForm.id = row.id
  templateForm.name = row.name
  templateForm.description = row.description || ''
  showTemplateDialog.value = true
}

const handleSaveTemplate = async () => {
  if (!templateForm.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  try {
    if (isEditTemplate.value) {
      await axios.put(`/api/progress-node-templates/${templateForm.id}`, templateForm)
      ElMessage.success('更新成功')
    } else {
      await axios.post('/api/progress-node-templates', templateForm)
      ElMessage.success('创建成功')
    }
    showTemplateDialog.value = false
    loadTemplates()
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.response?.data?.error || error.message))
  }
}

const handleDeleteTemplate = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该模板？节点数据也会一并删除。', '确认删除', { type: 'warning' })
    await axios.delete(`/api/progress-node-templates/${id}`)
    ElMessage.success('删除成功')
    loadTemplates()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

// ========== 节点管理 ==========
const goToNodes = async (row) => {
  currentTemplate.value = row
  showNodeDrawer.value = true
  nodeForm.template_id = row.id
  await loadTemplateNodes()
}

const loadTemplateNodes = async () => {
  if (!currentTemplate.value) return
  try {
    const res = await axios.get(`/api/progress-node-template-nodes/${currentTemplate.value.id}`)
    nodeList.value = res.data
    await nextTick()
  } catch (error) {
    console.error('加载节点失败:', error)
  }
}

const openNodeDialog = (row = null) => {
  // 强制重置编辑状态，避免上次编辑后 isEditNode 没有重置
  isEditNode.value = false
  if (row) {
    isEditNode.value = true
    nodeForm.id = row.id
    nodeForm.template_id = currentTemplate.value.id
    nodeForm.node_name = row.node_name
    nodeForm.node_key = row.node_key
    nodeForm.sort_order = row.sort_order || 0
    nodeForm.default_sms_template_id = row.default_sms_template_id || null
  } else {
    isEditNode.value = false
    nodeForm.id = null
    nodeForm.template_id = currentTemplate.value.id
    nodeForm.node_name = ''
    nodeForm.node_key = ''
    nodeForm.sort_order = nodeList.value.length + 1
    nodeForm.default_sms_template_id = null
  }
  showNodeDialog.value = true
}

// 中文名称自动转英文标识
const handleNodeNameInput = (value) => {
  if (!value || isEditNode.value) return  // 编辑模式下不自动覆盖
  // 转换为拼音，用空格分隔每个字
  const pinyinArr = pinyin(value, { toneType: 'none', separator: ' ' })
  // 转成下划线格式：水电工程完成 → shui_dian_gong_cheng_wan_cheng
  const key = pinyinArr.replace(/\s+/g, '_').toLowerCase()
  nodeForm.node_key = key
}

const handleSaveNode = async () => {
  if (!nodeForm.node_name || !nodeForm.node_key) {
    ElMessage.warning('请填写节点名称和标识')
    return
  }
  try {
    if (isEditNode.value) {
      await axios.put(`/api/progress-node-template-nodes/${nodeForm.id}`, nodeForm)
      ElMessage.success('节点更新成功')
    } else {
      await axios.post('/api/progress-node-template-nodes', nodeForm)
      ElMessage.success('节点添加成功')
    }
    showNodeDialog.value = false
    // 强制刷新抽屉内表格内容
    nodeList.value = []
    await nextTick()
    await loadTemplateNodes()
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.response?.data?.error || error.message))
  }
}

const handleDeleteNode = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该节点？', '确认删除', { type: 'warning' })
    await axios.delete(`/api/progress-node-template-nodes/${id}`)
    ElMessage.success('删除成功')
    loadTemplateNodes()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(() => {
  loadTemplates()
  loadSmsTemplates()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
