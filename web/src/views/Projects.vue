<template>
  <div class="projects">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>项目列表</span>
          <el-button type="primary" @click="openAddDialog">
            <el-icon><Plus /></el-icon>
            新增项目
          </el-button>
        </div>
      </template>
      <el-table :data="projectList" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="项目名称" width="150" />
        <el-table-column prop="customer_name" label="客户" width="120">
          <template #default="scope">
            {{ scope.row.customer_name || '-' }}
          </template>
        </el-table-column>
        <!-- 节点管理横轴 -->
        <el-table-column label="进度节点" min-width="500">
          <template #default="scope">
            <div class="node-mgmt-cell" v-if="scope.row.nodes && scope.row.nodes.length > 0">
              <div class="step-bar">
                <div
                  v-for="(node, index) in scope.row.nodes"
                  :key="node.id"
                  class="step-item"
                  :class="`step-${node.status}`"
                >
                  <!-- 连接线（第一个节点前没有线） -->
                  <div v-if="index > 0" class="step-line" :class="getLineClass(scope.row.nodes, index)"></div>

                  <!-- 步骤主体 -->
                  <el-popover placement="bottom" :width="160" trigger="click" :show-after="0" :hide-after="0">
                    <template #reference>
                      <div class="step-node" @click.stop>
                        <div class="step-circle">
                          <!-- 待开始：小圆点 -->
                          <span v-if="node.status === 'pending'" class="dot-inner"></span>
                          <!-- 进行中：双环旋转 -->
                          <span v-else-if="node.status === 'in_progress'" class="spin-ring"></span>
                          <!-- 已完成：打勾 -->
                          <el-icon v-else-if="node.status === 'completed'" :size="14" color="#fff"><Check /></el-icon>
                          <!-- 已跳过：关闭 -->
                          <el-icon v-else-if="node.status === 'skipped'" :size="14" color="#fff"><Close /></el-icon>
                        </div>
                        <div class="step-name" :class="{ 'name-done': node.status === 'completed', 'name-skipped': node.status === 'skipped', 'name-active': node.status === 'in_progress' || (node.status === 'pending' && isFirstPending(scope.row.nodes, index)) }">
                          {{ node.node_name || node.stage_name }}
                        </div>
                      </div>
                    </template>
                    <!-- 状态选择菜单 -->
                    <div class="status-menu">
                      <div class="status-menu-title">{{ node.node_name || node.stage_name }}</div>
                      <div class="status-menu-items">
                        <div class="status-menu-item" :class="{ active: node.status === 'pending' }" @click="switchNodeStatus('pending', node, scope.row)">
                          <span class="dot dot-pending"></span> 待开始
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'in_progress' }" @click="switchNodeStatus('in_progress', node, scope.row)">
                          <span class="dot dot-in-progress"></span> 进行中
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'completed' }" @click="switchNodeStatus('completed', node, scope.row)">
                          <span class="dot dot-completed"></span> 已完成
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'skipped' }" @click="switchNodeStatus('skipped', node, scope.row)">
                          <span class="dot dot-skipped"></span> 已跳过
                        </div>
                      </div>
                    </div>
                  </el-popover>
                </div>
              </div>
            </div>
            <span v-else style="color: #c0c4cc; font-size: 12px;">暂无节点</span>
          </template>
        </el-table-column>
        <el-table-column label="节点设置" width="120">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="openNodeDrawer(scope.row)">
              <el-icon><Setting /></el-icon> 节点管理
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="start_date" label="开始日期" width="120" />
        <el-table-column prop="end_date" label="结束日期" width="120" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="handleEdit(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑项目弹窗 -->
    <el-dialog v-model="showAddDialog" :title="isEdit ? '编辑项目' : '新增项目'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="客户姓名">
          <el-input v-model="form.customer_name" placeholder="请输入客户姓名" />
        </el-form-item>
        <el-form-item label="客户手机">
          <el-input v-model="form.customer_phone" placeholder="请输入客户手机号" />
        </el-form-item>
        <el-form-item label="楼盘地址">
          <el-input v-model="form.address" placeholder="请输入楼盘地址" />
        </el-form-item>
        <el-form-item label="工长">
          <el-input v-model="form.manager" placeholder="请输入工长姓名" />
        </el-form-item>
        <el-form-item label="设计师">
          <el-select v-model="form.designer_id" placeholder="请选择设计师" clearable style="width: calc(100% - 140px)">
            <el-option-group
              v-for="group in groupedEmployees"
              :key="group.department_id"
              :label="group.department_name"
            >
              <el-option
                v-for="emp in group.employees"
                :key="emp.id"
                :label="emp.name"
                :value="emp.id"
              />
            </el-option-group>
          </el-select>
          <span v-if="designerPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ designerPhone }}</span>
        </el-form-item>
        <el-form-item label="工程监理">
          <el-select v-model="form.supervisor_id" placeholder="请选择工程监理" clearable style="width: calc(100% - 140px)">
            <el-option-group
              v-for="group in groupedEmployees"
              :key="group.department_id"
              :label="group.department_name"
            >
              <el-option
                v-for="emp in group.employees"
                :key="emp.id"
                :label="emp.name"
                :value="emp.id"
              />
            </el-option-group>
          </el-select>
          <span v-if="supervisorPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ supervisorPhone }}</span>
        </el-form-item>
        <el-form-item label="工长">
          <el-select v-model="form.manager_id" placeholder="请选择工长" clearable style="width: calc(100% - 140px)">
            <el-option-group
              v-for="group in groupedEmployees"
              :key="group.department_id"
              :label="group.department_name"
            >
              <el-option
                v-for="emp in group.employees"
                :key="emp.id"
                :label="emp.name"
                :value="emp.id"
              />
            </el-option-group>
          </el-select>
          <span v-if="managerPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ managerPhone }}</span>
        </el-form-item>
        <el-form-item label="预算金额">
          <el-input-number v-model="form.budget" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="开工准备" value="开工准备" />
            <el-option label="进行中" value="进行中" />
            <el-option label="已暂停" value="已暂停" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已验收" value="已验收" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>

    <!-- 节点管理抽屉 -->
    <el-drawer v-model="showNodeDrawer" :title="`节点管理 - ${currentProject?.name}`" size="600px">
      <div class="node-drawer-content">
        <!-- 快速操作提示 -->
        <div class="quick-tip">
          <el-icon><InfoFilled /></el-icon>
          点击节点名称可编辑，点击状态可切换
        </div>

        <!-- 操作按钮 -->
        <div style="margin-bottom: 12px;">
          <el-button type="primary" size="small" @click="openAddNodeDialog">
            <el-icon><Plus /></el-icon>新增节点
          </el-button>
        </div>

        <!-- 节点列表 -->
        <div class="node-list">
          <div
            v-for="(node, index) in currentProject?.nodes"
            :key="node.id"
            class="node-item"
            :class="`node-item-${node.status}`"
          >
            <div class="node-item-left">
              <div class="node-index">{{ index + 1 }}</div>
              <div class="node-info">
                <!-- 点击编辑节点名称 -->
                <div class="node-name-edit" v-if="editingNodeId !== node.id" @click="startEditNode(node)">
                  {{ node.node_name || node.stage_name || '未命名' }}
                  <el-icon class="edit-icon"><Edit /></el-icon>
                </div>
                <el-input v-else size="small" v-model="editingNodeName" @keyup.enter="saveNodeName(node)" @blur="saveNodeName(node)" @keyup.escape="cancelEditNode" ref="nodeNameInput" style="width: 160px;" />
                <div class="node-meta">
                  <el-tag size="small" :type="getNodeStatusTagType(node.status)">{{ getNodeStatusText(node.status) }}</el-tag>
                  <span class="node-date" v-if="node.actual_end_date">完成于 {{ node.actual_end_date }}</span>
                </div>
              </div>
            </div>
            <div class="node-item-right">
              <el-select v-model="node.sms_template_id" size="small" placeholder="无模板" clearable style="width: 120px; margin-right: 8px" @change="handleNodeSmsTemplateChange(node)">
                <el-option
                  v-for="t in smsTemplateList"
                  :key="t.id"
                  :label="t.name"
                  :value="t.id"
                />
              </el-select>
              <el-select v-model="node.status" size="small" style="width: 100px" @change="handleNodeStatusChange(node)">
                <el-option label="待开始" value="pending" />
                <el-option label="进行中" value="in_progress" />
                <el-option label="已完成" value="completed" />
                <el-option label="已跳过" value="skipped" />
              </el-select>
              <el-button size="small" type="danger" link style="margin-left: 8px" @click="handleDeleteNode(node)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <!-- 重置节点按钮 -->
        <div class="drawer-footer">
          <el-button type="warning" plain @click="resetAllNodes">重置所有节点</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 新增节点弹窗 -->
    <el-dialog v-model="showAddNodeDialog" title="新增节点" width="450px">
      <el-form :model="addNodeForm" label-width="90px">
        <el-form-item label="节点名称" required>
          <el-input v-model="addNodeForm.node_name" placeholder="如：水电工程" />
        </el-form-item>
        <el-form-item label="插入位置">
          <el-select v-model="addNodeForm.after_node_id" placeholder="默认追加到最后" style="width: 100%">
            <el-option label="插入到最前面" :value="0" />
            <el-option
              v-for="node in currentProject?.nodes"
              :key="node.id"
              :label="`插入到「${node.node_name || node.stage_name}」之后`"
              :value="node.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="短信通知">
          <el-select v-model="addNodeForm.sms_template_id" placeholder="不发送短信" clearable style="width: 100%">
            <el-option
              v-for="t in smsTemplateList"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddNodeDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAddNode">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Minus, More, Setting, InfoFilled, Close, Edit, Plus } from '@element-plus/icons-vue'

const projectList = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const showNodeDrawer = ref(false)
const isEdit = ref(false)
const currentProject = ref(null)
const editingNodeId = ref(null)
const editingNodeName = ref('')
const nodeNameInput = ref(null)
const showAddNodeDialog = ref(false)
const addNodeForm = reactive({ node_name: '', after_node_id: null, sms_template_id: null })
const smsTemplateList = ref([])
const groupedEmployees = ref([])

// 根据 employee id 查找电话
const getEmployeePhone = (empId) => {
  for (const group of groupedEmployees.value) {
    const emp = group.employees.find(e => e.id === empId)
    if (emp) return emp.phone || ''
  }
  return ''
}
const designerPhone = computed(() => getEmployeePhone(form.designer_id))
const supervisorPhone = computed(() => getEmployeePhone(form.supervisor_id))
const managerPhone = computed(() => getEmployeePhone(form.manager_id))

const form = reactive({
  id: null,
  name: '',
  customer_name: '',
  customer_phone: '',
  address: '',
  manager: '',
  designer_id: null,
  supervisor_id: null,
  manager_id: null,
  budget: 0,
  status: '开工准备',
  start_date: '',
  end_date: '',
  description: ''
})

// 状态映射
const getStatusType = (status) => {
  const map = {
    '开工准备': 'info',
    '进行中': 'primary',
    '已暂停': 'warning',
    '已完成': 'success',
    '已验收': 'success'
  }
  return map[status] || 'info'
}

const getNodeStatusTagType = (status) => {
  const map = {
    'pending': 'info',
    'in_progress': 'warning',
    'completed': 'success',
    'skipped': 'danger'
  }
  return map[status] || 'info'
}

const getNodeStatusText = (status) => {
  const map = {
    'pending': '待开始',
    'in_progress': '进行中',
    'completed': '已完成',
    'skipped': '已跳过'
  }
  return map[status] || status
}

// 判断连接线是否已完成（看前一个节点）
const isLineDone = (nodes, index) => {
  if (index <= 0) return false
  const prev = nodes[index - 1]
  return prev.status === 'completed'
}

// 判断是否是当前第一个待开始节点
const isFirstPending = (nodes, index) => {
  for (let i = 0; i < index; i++) {
    if (nodes[i].status !== 'completed' && nodes[i].status !== 'skipped') {
      return false
    }
  }
  return true
}

// 获取连接线样式类
const getLineClass = (nodes, index) => {
  if (index <= 0) return ''
  const prev = nodes[index - 1]
  if (prev.status === 'completed') return 'line-done'
  if (prev.status === 'skipped') return 'line-skipped'
  return 'line-pending'
}

// 开始编辑节点名称
const startEditNode = (node) => {
  editingNodeId.value = node.id
  editingNodeName.value = node.node_name || node.stage_name || ''
  // 等待 DOM 更新后聚焦输入框
  setTimeout(() => {
    if (nodeNameInput.value && nodeNameInput.value.$el) {
      nodeNameInput.value.$el.querySelector('input').focus()
    }
  }, 50)
}

// 保存节点名称
const saveNodeName = async (node) => {
  const name = editingNodeName.value.trim()
  if (!name) {
    ElMessage.warning('节点名称不能为空')
    return
  }
  try {
    await axios.put(`/api/project-stages/${node.id}`, {
      node_name: name
    })
    node.node_name = name
    node.stage_name = name
    ElMessage.success('节点名称已更新')
  } catch (error) {
    ElMessage.error('更新失败')
  }
  editingNodeId.value = null
  editingNodeName.value = ''
}

// 取消编辑节点名称
const cancelEditNode = () => {
  editingNodeId.value = null
  editingNodeName.value = ''
}

// 打开新增节点弹窗
const openAddNodeDialog = () => {
  addNodeForm.node_name = ''
  addNodeForm.after_node_id = null
  addNodeForm.sms_template_id = null
  showAddNodeDialog.value = true
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

// 加载按部门分组的员工列表
const loadGroupedEmployees = async () => {
  try {
    const res = await axios.get('/api/employees/grouped-by-department')
    groupedEmployees.value = res.data
  } catch (error) {
    console.error('加载员工列表失败:', error)
  }
}

// 新增节点
const handleAddNode = async () => {
  const name = addNodeForm.node_name.trim()
  if (!name) {
    ElMessage.warning('请输入节点名称')
    return
  }
  try {
    const payload = {
      project_id: currentProject.value.id,
      node_name: name,
      status: 'pending'
    }
    if (addNodeForm.sms_template_id) {
      payload.sms_template_id = addNodeForm.sms_template_id
    }
    // after_node_id: null = 追加到最后，0 = 插入最前面
    if (addNodeForm.after_node_id === 0) {
      payload.after_node_id = null
      // 后端会用 sort_order=0 方式插入最前
    } else {
      payload.after_node_id = addNodeForm.after_node_id || null
    }
    await axios.post('/api/project-stages', payload)
    showAddNodeDialog.value = false
    ElMessage.success('节点添加成功')
    await loadData()
    // 重新获取最新的项目数据刷新抽屉
    const updated = projectList.value.find(p => p.id === currentProject.value.id)
    if (updated) currentProject.value = updated
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

// 删除节点
const handleDeleteNode = async (node) => {
  try {
    await ElMessageBox.confirm(`确定删除节点"${node.node_name || node.stage_name}"？`, '确认删除', { type: 'warning' })
    await axios.delete(`/api/project-stages/${node.id}`)
    ElMessage.success('删除成功')
    await loadData()
    const proj = projectList.value.find(p => p.id === currentProject.value.id)
    if (proj) currentProject.value = proj
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

// 切换节点状态（点击状态菜单）
const switchNodeStatus = async (status, node, row) => {
  try {
    // 如果标记为完成，询问是否发送短信
    if (status === 'completed') {
      const confirm = await ElMessageBox.confirm(
        `是否发送服务通知短信？`,
        '节点完成',
        { confirmButtonText: '发送短信', cancelButtonText: '取消', type: 'info' }
      ).catch(() => 'cancel');
      
      if (confirm === 'confirm') {
        // 先更新状态
        await axios.put(`/api/project-stages/${node.id}`, {
          node_name: node.node_name,
          status: 'completed',
          actual_date: new Date().toISOString().split('T')[0]
        });
        node.status = 'completed';
        node.actual_date = new Date().toISOString().split('T')[0];
        ElMessage.success(`已更新为"${getNodeStatusText('completed')}"`);
        
        // 调用发送短信
        try {
          const res = await axios.post('/api/sms-send', {
            node_id: node.id,
            project_id: node.project_id
          });
          if (res.data.status === 'success') {
            ElMessage.success('短信已发送');
          } else {
            ElMessage.warning('短信发送失败：' + res.data.message);
          }
        } catch (smsErr) {
          ElMessage.warning('短信发送失败：' + (smsErr.response?.data?.error || smsErr.message));
        }
        return;
      }
      // 点取消则只更新状态
    }
    
    await axios.put(`/api/project-stages/${node.id}`, {
      node_name: node.node_name,
      status,
      actual_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null
    })
    // 本地立即更新 UI，不等待整个列表刷新
    node.status = status
    if (status === 'completed') {
      node.actual_date = new Date().toISOString().split('T')[0]
    } else {
      node.actual_date = null
    }
    ElMessage.success(`已更新为"${getNodeStatusText(status)}"`)
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

// 节点短信模板变更
const handleNodeSmsTemplateChange = async (node) => {
  try {
    await axios.put(`/api/project-stages/${node.id}`, {
      node_name: node.node_name,
      sms_template_id: node.sms_template_id || null
    })
    ElMessage.success('短信模板已更新')
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

// 节点状态变更（从抽屉内）
const handleNodeStatusChange = async (node) => {
  try {
    await axios.put(`/api/project-stages/${node.id}`, {
      node_name: node.node_name,
      status: node.status,
      actual_date: node.status === 'completed' ? new Date().toISOString().split('T')[0] : null
    })
    node.actual_date = node.status === 'completed' ? new Date().toISOString().split('T')[0] : null
    ElMessage.success(`已更新为"${getNodeStatusText(node.status)}"`)
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

// 重置所有节点
const resetAllNodes = async () => {
  if (!currentProject.value) return
  try {
    await ElMessageBox.confirm('确定要重置所有节点状态吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const nodes = currentProject.value.nodes || []
    for (const node of nodes) {
      if (node.node_name || node.stage_name) {
        await axios.put(`/api/project-stages/${node.id}`, {
          node_name: node.node_name,
          status: 'pending',
          actual_date: null
        })
      }
    }
    ElMessage.success('已重置所有节点')
    loadData()
    showNodeDrawer.value = false
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('重置失败')
  }
}

// 打开节点抽屉
const openNodeDrawer = async (project) => {
  currentProject.value = project
  showNodeDrawer.value = true
  await loadSmsTemplates()
  // 确保 currentProject 指向最新的数据
  const updated = projectList.value.find(p => p.id === project.id)
  if (updated) currentProject.value = updated
}

// 加载数据
const loadData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/projects')
    // 映射 node_name -> stage_name，保持字段一致
    const projectsWithNodes = (res.data || []).map(project => {
      project.nodes = (project.nodes || []).map(node => ({
        ...node,
        node_name: node.node_name || node.stage_name
      }))
      return project
    })
    projectList.value = projectsWithNodes
    // 刷新 currentProject 引用，指向最新的 projectList 中的对象
    if (currentProject.value) {
      const updated = projectList.value.find(p => p.id === currentProject.value.id)
      if (updated) currentProject.value = updated
    }
  } catch (error) {
    console.error('加载失败:', error)
  } finally {
    loading.value = false
  }
}

// 打开新增项目弹窗
const openAddDialog = async () => {
  isEdit.value = false
  resetForm()
  await loadGroupedEmployees()
  showAddDialog.value = true
}

// 编辑项目
const handleEdit = async (row) => {
  isEdit.value = true
  await loadGroupedEmployees()
  Object.assign(form, row)
  showAddDialog.value = true
}

// 保存项目
const handleSave = async () => {
  if (!form.name?.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }
  try {
    if (isEdit.value) {
      await axios.put(`/api/projects/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      const res = await axios.post('/api/projects', form)
      // 为新项目创建默认节点
      await createDefaultNodes(res.data.id)
      ElMessage.success('添加成功')
    }
    closeDialog()
    loadData()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

// 为新项目创建默认节点
const createDefaultNodes = async (projectId) => {
  const defaultNodes = [
    '客户签约完成',
    '开工交底完成',
    '水电施工完成',
    '水电验收合格',
    '泥瓦工程完工',
    '木工工程完工',
    '油漆工程完工',
    '全屋安装收尾',
    '整体竣工验收',
    '项目正式完工'
  ]
  for (let i = 0; i < defaultNodes.length; i++) {
    try {
      await axios.post('/api/project-stages', {
        project_id: projectId,
        node_name: defaultNodes[i],
        status: 'pending'
      })
    } catch (error) {
      console.error('创建节点失败:', error)
    }
  }
}

// 删除项目
const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该项目吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await axios.delete(`/api/projects/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

// 重置表单
const resetForm = () => {
  form.id = null
  form.name = ''
  form.customer_name = ''
  form.customer_phone = ''
  form.address = ''
  form.manager = ''
  form.designer_id = null
  form.supervisor_id = null
  form.manager_id = null
  form.budget = 0
  form.status = '开工准备'
  form.start_date = ''
  form.end_date = ''
  form.description = ''
}

// 关闭弹窗
const closeDialog = () => {
  showAddDialog.value = false
  isEdit.value = false
  resetForm()
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

/* ========== 节点管理单元格 ========== */
.node-mgmt-cell {
  display: flex;
  align-items: center;
  min-height: 60px;
  overflow-x: auto;
  scrollbar-width: thin;
}

/* ========== 步骤条横轴 ========== */
.step-bar {
  display: flex;
  align-items: flex-start;
  min-width: max-content;
  gap: 0;
  padding: 4px 0;
}

.step-item {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  position: relative;
}

/* 连接线 */
.step-line {
  width: 28px;
  height: 2px;
  background: #e4e7ed;
  flex-shrink: 0;
  transition: background 0.3s;
  margin-top: -10px;
}

.step-line.line-done {
  background: #67c23a;
}

.step-line.line-skipped {
  background: #909399;
}

.step-line.line-pending {
  background: #e4e7ed;
}

/* 步骤节点 */
.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  user-select: none;
  min-width: 52px;
}

.step-node:hover .step-circle {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 圆形步骤图标 */
.step-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
  position: relative;
  flex-shrink: 0;
}

/* 待开始：空心灰圈 */
.step-pending .step-circle {
  background: #fff;
  border: 2px solid #c0c4cc;
}

/* 进行中：橙色填充+旋转环 */
.step-in_progress .step-circle {
  background: #e6a23c;
  border: 2px solid #e6a23c;
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.2);
}

/* 已完成：绿色填充 */
.step-completed .step-circle {
  background: #67c23a;
  border: 2px solid #67c23a;
}

/* 已跳过：灰色填充 */
.step-skipped .step-circle {
  background: #909399;
  border: 2px solid #909399;
}

/* 待开始内部小圆点 */
.dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c0c4cc;
}

/* 进行中旋转环 */
.spin-ring {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 步骤名称 */
.step-name {
  font-size: 11px;
  color: #909399;
  text-align: center;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 5px;
  line-height: 1.3;
  transition: color 0.25s;
}

.step-name.name-active {
  color: #e6a23c;
  font-weight: 600;
}

.step-name.name-done {
  color: #67c23a;
  font-weight: 600;
}

.step-name.name-skipped {
  color: #909399;
  text-decoration: line-through;
}

/* ========== 状态选择菜单 ========== */
.status-menu {
  user-select: none;
  min-width: 140px;
}

.status-menu-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
}

.status-menu-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #606266;
  transition: all 0.15s;
}

.status-menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

.status-menu-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 500;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-pending { background: #e4e7ed; border: 1px solid #c0c4cc; }
.dot-in-progress { background: #e6a23c; }
.dot-completed { background: #67c23a; }
.dot-skipped { background: #909399; }

/* ========== 节点抽屉（保留） ========== */
.node-drawer-content {
  padding: 0 16px;
}

.quick-tip {
  background: #f4f4f5;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #909399;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  background: #fff;
  transition: all 0.2s;
}

.node-item:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.node-item-in_progress {
  border-left: 3px solid #e6a23c;
  background: #fdf6ec;
}

.node-item-completed {
  border-left: 3px solid #67c23a;
  background: #f0f9eb;
}

.node-item-skipped {
  border-left: 3px solid #f56c6c;
  background: #fef0f0;
  opacity: 0.75;
}

.node-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-item-completed .node-index { background: #67c23a; }
.node-item-in_progress .node-index { background: #e6a23c; }
.node-item-skipped .node-index { background: #909399; }

.node-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.node-name-edit {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.node-name-edit:hover {
  background: #f5f7fa;
  color: #409eff;
}

.node-name-edit .edit-icon {
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.node-name-edit:hover .edit-icon {
  opacity: 1;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-date {
  font-size: 12px;
  color: #909399;
}

.drawer-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: center;
}
</style>
