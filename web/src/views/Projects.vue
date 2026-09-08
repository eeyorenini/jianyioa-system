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
        <el-table-column label="进度节点" min-width="420">
          <template #default="scope">
            <div class="node-mgmt-cell">
              <!-- 里程碑时间线 -->
              <div class="milestone-timeline" v-if="scope.row.nodes && scope.row.nodes.filter(n => n.node_name).length > 0">
                <template v-for="(node, index) in scope.row.nodes.filter(n => n.node_name)" :key="node.id">
                  <!-- 连接线+箭头 -->
                  <div v-if="index > 0" class="milestone-track" :class="{ 'track-done': isNodeCompletedBefore(scope.row, index) }">
                    <div class="track-line"></div>
                    <div class="track-arrow"></div>
                  </div>
                  <!-- 里程碑节点 -->
                  <el-popover placement="top" :width="160" trigger="click">
                    <template #reference>
                      <div class="milestone-node" :class="`status-${node.status}`">
                        <div class="milestone-dot">
                          <el-icon v-if="node.status === 'completed'" :size="10" color="#fff"><Check /></el-icon>
                          <el-icon v-else-if="node.status === 'skipped'" :size="10" color="#fff"><Minus /></el-icon>
                          <div v-else class="dot-center"></div>
                        </div>
                        <div class="milestone-name" :class="{
                          'name-done': node.status === 'completed',
                          'name-skipped': node.status === 'skipped',
                          'name-active': node.status === 'pending' && isFirstPending(scope.row, index)
                        }">{{ node.node_name }}</div>
                      </div>
                    </template>
                    <div class="node-status-menu">
                      <div class="status-menu-title">{{ node.node_name }}</div>
                      <div class="status-menu-items">
                        <div class="status-menu-item" :class="{ active: node.status === 'pending' }" @click="switchNodeStatus('pending', node)">
                          <span class="dot dot-pending"></span> 待开始
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'in_progress' }" @click="switchNodeStatus('in_progress', node)">
                          <span class="dot dot-in-progress"></span> 进行中
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'completed' }" @click="switchNodeStatus('completed', node)">
                          <span class="dot dot-completed"></span> 已完成
                        </div>
                        <div class="status-menu-item" :class="{ active: node.status === 'skipped' }" @click="switchNodeStatus('skipped', node)">
                          <span class="dot dot-skipped"></span> 已跳过
                        </div>
                      </div>
                    </div>
                  </el-popover>
                </template>
              </div>
              <span v-else style="color: #c0c4cc; font-size: 12px;">暂无节点</span>
              <!-- 设置按钮 -->
              <el-button size="small" type="primary" link class="node-settings-btn" @click="openNodeDrawer(scope.row)">
                <el-icon><Setting /></el-icon> 设置
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
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
        <el-form-item label="项目经理">
          <el-input v-model="form.manager" placeholder="请输入项目经理姓名" />
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
          点击上方圆点快速切换状态，或在此处管理节点详情
        </div>

        <!-- 节点列表 -->
        <div class="node-list">
          <div
            v-for="(node, index) in currentProject?.nodes?.filter(n => n.node_name)"
            :key="node.id"
            class="node-item"
            :class="`node-item-${node.status}`"
          >
            <div class="node-item-left">
              <div class="node-index">{{ index + 1 }}</div>
              <div class="node-info">
                <div class="node-name">{{ node.node_name }}</div>
                <div class="node-meta">
                  <el-tag size="small" :type="getNodeStatusTagType(node.status)">{{ getNodeStatusText(node.status) }}</el-tag>
                  <span class="node-date" v-if="node.actual_end_date">完成于 {{ node.actual_end_date }}</span>
                </div>
              </div>
            </div>
            <div class="node-item-right">
              <el-select v-model="node.status" size="small" style="width: 100px" @change="handleNodeStatusChange(node)">
                <el-option label="待开始" value="pending" />
                <el-option label="进行中" value="in_progress" />
                <el-option label="已完成" value="completed" />
                <el-option label="已跳过" value="skipped" />
              </el-select>
            </div>
          </div>
        </div>

        <!-- 重置节点按钮 -->
        <div class="drawer-footer">
          <el-button type="warning" plain @click="resetAllNodes">重置所有节点</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Minus, More, Setting, InfoFilled } from '@element-plus/icons-vue'

const projectList = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const showNodeDrawer = ref(false)
const isEdit = ref(false)
const currentProject = ref(null)

const form = reactive({
  id: null,
  name: '',
  customer_name: '',
  customer_phone: '',
  address: '',
  manager: '',
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

// 判断当前节点前是否已完成
const isNodeCompletedBefore = (project, index) => {
  const nodes = project.nodes?.filter(n => n.node_name) || []
  if (index <= 0) return false
  return nodes[index - 1].status === 'completed'
}

// 判断是否是第一个待开始节点
const isFirstPending = (project, index) => {
  const nodes = project.nodes?.filter(n => n.node_name) || []
  for (let i = 0; i < index; i++) {
    if (nodes[i].status !== 'completed' && nodes[i].status !== 'skipped') {
      return false
    }
  }
  return true
}

// 切换节点状态
const switchNodeStatus = async (status, node) => {
  try {
    await axios.put(`/api/project-nodes/${node.id}`, { status })
    ElMessage.success(`已更新为"${getNodeStatusText(status)}"`)
    loadData()
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

// 节点状态变更（从抽屉内）
const handleNodeStatusChange = async (node) => {
  try {
    await axios.put(`/api/project-nodes/${node.id}`, {
      status: node.status,
      actual_end_date: node.status === 'completed' ? new Date().toISOString().split('T')[0] : null
    })
    ElMessage.success(`已更新为"${getNodeStatusText(node.status)}"`)
    loadData()
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
      if (node.node_name) {
        await axios.put(`/api/project-nodes/${node.id}`, {
          status: 'pending',
          actual_end_date: null
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
const openNodeDrawer = (project) => {
  currentProject.value = project
  showNodeDrawer.value = true
}

// 加载数据
const loadData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/projects')
    // 每个项目加载其节点
    const projectsWithNodes = await Promise.all(
      (res.data || []).map(async (project) => {
        try {
          const nodeRes = await axios.get(`/api/project-nodes?project_id=${project.id}`)
          project.nodes = nodeRes.data || []
        } catch {
          project.nodes = []
        }
        return project
      })
    )
    projectList.value = projectsWithNodes
  } catch (error) {
    console.error('加载失败:', error)
  } finally {
    loading.value = false
  }
}

// 新增项目
const openAddDialog = () => {
  isEdit.value = false
  resetForm()
  showAddDialog.value = true
}

// 编辑项目
const handleEdit = (row) => {
  isEdit.value = true
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
      await axios.post('/api/project-nodes', {
        project_id: projectId,
        node_name: defaultNodes[i],
        status: 'pending',
        sort_order: i + 1
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
  gap: 6px;
  min-height: 50px;
}

/* ========== 里程碑时间线 ========== */
.milestone-timeline {
  display: flex;
  align-items: flex-start;
  gap: 0;
  overflow-x: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  flex-shrink: 0;
}

.milestone-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.milestone-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: all 0.25s;
}

.milestone-node:hover .milestone-dot {
  transform: scale(1.2);
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}

.milestone-dot.status-pending {
  background: #e4e7ed;
  border-color: #c0c4cc;
}

.milestone-dot.status-in_progress {
  background: #e6a23c;
  border-color: #f5c77e;
}

.milestone-dot.status-completed {
  background: #67c23a;
  border-color: #b3e19d;
}

.milestone-dot.status-skipped {
  background: #f56c6c;
  border-color: #f8b4b4;
}

.dot-center {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #909399;
}

.milestone-name {
  font-size: 10px;
  color: #606266;
  text-align: center;
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
  line-height: 1.2;
}

.milestone-name.name-done {
  color: #67c23a;
  font-weight: 600;
}

.milestone-name.name-skipped {
  color: #f56c6c;
  text-decoration: line-through;
}

.milestone-name.name-active {
  color: #409eff;
  font-weight: 600;
}

/* ========== 连接线+箭头 ========== */
.milestone-track {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-top: 11px;
}

.track-line {
  width: 16px;
  height: 2px;
  background: #e4e7ed;
  border-radius: 1px;
}

.track-arrow {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 5px solid #e4e7ed;
}

.milestone-track.track-done .track-line,
.milestone-track.track-done .track-arrow {
  background: #67c23a;
  border-left-color: #67c23a;
}

.node-settings-btn {
  flex-shrink: 0;
  margin-left: 4px;
}

/* ========== 节点状态菜单 ========== */
.node-status-menu {
  user-select: none;
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

.dot-pending { background: #e4e7ed; }
.dot-in-progress { background: #e6a23c; }
.dot-completed { background: #67c23a; }
.dot-skipped { background: #f56c6c; }

/* ========== 节点抽屉 ========== */
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

.node-item-completed .node-index {
  background: #67c23a;
}

.node-item-in_progress .node-index {
  background: #e6a23c;
}

.node-item-skipped .node-index {
  background: #909399;
}

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
