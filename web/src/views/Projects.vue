<template>
  <div class="projects">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>项目列表</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-button type="primary" @click="openGanttDialog">
              <el-icon><Histogram /></el-icon>
              甘特图总览
            </el-button>
            <el-button type="primary" @click="openAddDialog">
              <el-icon><Plus /></el-icon>
              新增项目
            </el-button>
          </div>
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
        <el-form-item label="客户" required>
          <el-select
            v-model="form.customer_id"
            placeholder="请选择客户"
            filterable
            clearable
            style="width: 100%"
            @change="onCustomerChange"
          >
            <el-option
              v-for="c in customerList"
              :key="c.id"
              :label="c.name + ' - ' + c.phone"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.customer_id" label="客户手机">
          <el-input :model-value="selectedCustomerPhone" disabled placeholder="自动带出" />
        </el-form-item>
        <el-form-item v-if="form.customer_id" label="楼盘地址">
          <el-input :model-value="selectedCustomerAddress" disabled placeholder="自动带出" />
        </el-form-item>
        <el-form-item label="设计师">
          <div class="employee-picker" @click="openEmployeeDrawer('designer')">
            <el-input :model-value="getEmployeeName(form.designer_id)" placeholder="请选择设计师" readonly clearable @clear="form.designer_id = null" />
          </div>
          <span v-if="designerPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ designerPhone }}</span>
        </el-form-item>
        <el-form-item label="工程监理">
          <div class="employee-picker" @click="openEmployeeDrawer('supervisor')">
            <el-input :model-value="getEmployeeName(form.supervisor_id)" placeholder="请选择工程监理" readonly clearable @clear="form.supervisor_id = null" />
          </div>
          <span v-if="supervisorPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ supervisorPhone }}</span>
        </el-form-item>
        <el-form-item label="工长">
          <div class="employee-picker" @click="openEmployeeDrawer('manager')">
            <el-input :model-value="getEmployeeName(form.manager_id)" placeholder="请选择工长" readonly clearable @clear="form.manager_id = null" />
          </div>
          <span v-if="managerPhone" style="margin-left:12px;color:#909399;font-size:13px">电话: {{ managerPhone }}</span>
        </el-form-item>
        <el-form-item label="预算金额">
          <el-input-number v-model="form.budget" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="节点模板">
          <el-select v-model="form.template_id" placeholder="不选择则不生成默认节点" clearable style="width: 100%">
            <el-option
              v-for="t in templateList"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
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

        <!-- 应用模板按钮 -->
        <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <el-select v-model="drawerTemplateId" placeholder="选择节点模板" clearable size="small" style="width: 200px">
            <el-option
              v-for="t in templateList"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
          <el-button type="primary" size="small" :disabled="!drawerTemplateId" @click="applyTemplate">
            应用模板
          </el-button>
        </div>

        <!-- 节点列表 -->
        <div class="node-list">
          <div style="margin-bottom: 12px;">
            <el-button type="primary" size="small" plain @click="openAddNodeDialog">
              <el-icon><Plus /></el-icon>新增节点
            </el-button>
          </div>
          <div
            v-for="(node, index) in currentProject?.nodes"
            :key="node.id"
            class="node-item"
            :class="[`node-item-${node.status}`, { 'node-item-dragging': draggingIndex === index, 'node-item-drag-over': dragOverIndex === index }]"
            draggable="true"
            @dragstart="handleNodeDragStart(index)"
            @dragover.prevent="handleNodeDragOver(index)"
            @drop="handleNodeDrop(index)"
            @dragend="handleNodeDragEnd"
          >
            <div class="node-item-left">
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>
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
                  <span class="node-date" v-if="node.actual_date">完成于 {{ node.actual_date }}</span>
                  <span class="node-date-range" v-else-if="node.plan_date && node.plan_end_date">{{ formatNodeDateRange(node) }}</span>
                  <span class="node-date" v-else-if="node.plan_date">预计 {{ node.plan_date }}</span>
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

        <!-- 甘特图按钮（当前项目专属） -->
        <div class="drawer-footer">
          <el-button type="primary" plain @click="openGanttDialog">
            <el-icon><Histogram /></el-icon>
            查看甘特图
          </el-button>
        </div>

        <!-- 重置节点按钮 -->
        <div class="drawer-footer">
          <el-button type="warning" plain @click="resetAllNodes">重置所有节点</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 甘特图弹窗：只展示当前项目 -->
    <el-dialog
      v-model="showGanttDialog"
      :title="`甘特图：${currentProject?.name || ''}`"
      width="90%"
      top="2vh"
      :close-on-click-modal="true"
    >
      <div class="gantt-dialog-body">
        <div class="gantt-section">
          <div class="gantt-header">
            <span class="gantt-title">{{ currentProject?.name }}</span>
            <span class="gantt-range" v-if="currentProject?.start_date && currentProject?.end_date">
              工期 {{ getProjectDuration(currentProject) }} 天 | {{ formatDate(currentProject.start_date) }} ~ {{ formatDate(currentProject.end_date) }}
            </span>
          </div>
          <div class="gantt-body" @click="cancelGanttSelecting">
            <div class="gantt-single-grid">
              <!-- 日期刻度 -->
              <div class="gantt-timeline">
                <div
                  v-for="(day, idx) in ganttDays"
                  :key="idx"
                  class="gantt-day"
                  :class="{
                    'gantt-day-today': day.isToday,
                    'gantt-day-weekend': day.isWeekend,
                    'gantt-day-selecting': isDaySelected(idx)
                  }"
                  :data-day-index="idx"
                  @mousedown.left.prevent="onGanttDayMouseDown(idx, $event)"
                >
                  <span v-if="day.showLabel" class="day-label">{{ day.label }}</span>
                </div>
              </div>
              <!-- 节点条列表 -->
              <div class="gantt-bars">
                <div
                  v-for="(node, idx) in (currentProject?.nodes || [])"
                  :key="node.id"
                  class="gantt-row"
                >
                  <!-- 连接线 -->
                  <div class="gantt-connector" v-if="idx > 0">
                    <div class="connector-line" :class="{ done: isNodeCompleted(idx - 1, currentProject?.nodes || []) }"></div>
                  </div>
                  <!-- 节点条（点击后进入拖拽选择模式） -->
                  <div
                    class="gantt-bar"
                    :class="[
                      `gantt-bar-${node.status || 'pending'}`,
                      { 'gantt-bar-selecting': ganttSelectNode?.id === node.id }
                    ]"
                    :style="getGanttBarStyle(node)"
                    @click="onBarClick($event, node)"
                  >
                    <div class="bar-label">{{ node.node_name || node.stage_name }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 节点日期编辑弹窗 -->
      <el-dialog
        v-model="showNodeDateEditDialog"
        :title="`调整节点日期：${editingNodeForDate?.node_name || editingNodeForDate?.stage_name || ''}`"
        width="420px"
        append-to-body
      >
        <el-form :model="nodeDateForm" label-width="80px">
          <el-form-item label="开始日期">
            <el-date-picker
              v-model="nodeDateForm.plan_date"
              type="date"
              placeholder="选择开始日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker
              v-model="nodeDateForm.plan_end_date"
              type="date"
              placeholder="选择结束日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showNodeDateEditDialog = false">取消</el-button>
          <el-button type="primary" @click="saveNodeDate">保存</el-button>
        </template>
      </el-dialog>
    </el-dialog>

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

    <!-- 项目工期填写弹窗（无工期时打开甘特图前触发） -->
    <el-dialog
      v-model="showProjectDateDialog"
      title="设置项目工期"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form :model="projectDateForm" label-width="80px">
        <el-form-item label="开始日期" required>
          <el-date-picker
            v-model="projectDateForm.start_date"
            type="date"
            placeholder="选择项目开始日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期" required>
          <el-date-picker
            v-model="projectDateForm.end_date"
            type="date"
            placeholder="选择项目结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <div style="color:#909399;font-size:12px;padding-left:80px">
          设置项目工期后，可通过甘特图管理每个节点的预计完成时间
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showProjectDateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProjectDate">保存并打开甘特图</el-button>
      </template>
    </el-dialog>

    <!-- 员工选择抽屉 -->
    <el-drawer v-model="showEmployeeDrawer" :title="`选择${employeeDrawerTypeLabel}`" size="500px">
      <div class="employee-drawer-content">
        <div v-for="group in groupedEmployees" :key="group.department_id" class="emp-dept-group">
          <div class="emp-dept-label">{{ group.department_name }}</div>
          <div class="emp-list">
            <div
              v-for="emp in group.employees"
              :key="emp.id"
              class="emp-item"
              :class="{ 'emp-item-selected': isEmployeeSelected(emp.id) }"
              @click="selectEmployee(emp)"
            >
              <span class="emp-name">{{ emp.name }}</span>
              <span v-if="emp.phone" class="emp-phone">{{ emp.phone }}</span>
              <el-icon v-if="isEmployeeSelected(emp.id)" class="emp-check"><Check /></el-icon>
            </div>
          </div>
        </div>
        <div v-if="groupedEmployees.length === 0" style="text-align:center;color:#909399;padding:40px">
          暂无员工数据
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Minus, More, Setting, InfoFilled, Close, Edit, Plus, Rank, Histogram } from '@element-plus/icons-vue'

const projectList = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const showNodeDrawer = ref(false)
const showGanttDialog = ref(false)
const isEdit = ref(false)
const currentProject = ref(null)
const editingNodeId = ref(null)
const editingNodeName = ref('')
const nodeNameInput = ref(null)
const showAddNodeDialog = ref(false)
const addNodeForm = reactive({ node_name: '', after_node_id: null, sms_template_id: null })
const smsTemplateList = ref([])
const groupedEmployees = ref([])
const customerList = ref([])
const templateList = ref([])
const drawerTemplateId = ref(null)
const showEmployeeDrawer = ref(false)
const employeeDrawerType = ref('designer')
const draggingIndex = ref(-1)
const dragOverIndex = ref(-1)
const ganttDragging = ref(null) // { id, type: 'move'|'start'|'end', startX, node }
const showNodeDateEditDialog = ref(false)
const editingNodeForDate = ref(null)
const nodeDateForm = reactive({ plan_date: '', plan_end_date: '' })
const showProjectDateDialog = ref(false)
const projectDateForm = reactive({ start_date: '', end_date: '' })

// 甘特图拖拽选择模式
const ganttSelecting = ref(false)       // 是否正在选择
const ganttSelectNode = ref(null)        // 当前选中的节点
const ganttSelectStart = ref(null)       // 拖拽起始格索引
const ganttSelectEnd = ref(null)         // 当前悬停格索引

// 点击节点条 → 进入选择模式
const onBarClick = (event, node) => {
  event.stopPropagation()
  ganttSelecting.value = true
  ganttSelectNode.value = node
  ganttSelectStart.value = null
  ganttSelectEnd.value = null
}

// 鼠标按下日期格 → 开始拖拽
const onGanttDayMouseDown = (dayIdx, event) => {
  if (!ganttSelecting.value || !ganttSelectNode.value) return
  ganttSelectStart.value = dayIdx
  ganttSelectEnd.value = dayIdx
  document.addEventListener('mousemove', onGanttDayMouseMove)
  document.addEventListener('mouseup', onGanttDayMouseUp)
}

// 鼠标经过日期格 → 更新范围高亮
const onGanttDayMouseMove = (event) => {
  if (!ganttSelecting.value || ganttSelectStart.value === null) return
  // 通过 event.target 找对应的 gantt-day-index 属性
  const target = event.target.closest('.gantt-day')
  if (!target) return
  const idx = parseInt(target.dataset.dayIndex)
  if (!isNaN(idx)) {
    ganttSelectEnd.value = idx
  }
}

// 鼠标释放 → 保存日期
const onGanttDayMouseUp = async () => {
  document.removeEventListener('mousemove', onGanttDayMouseMove)
  document.removeEventListener('mouseup', onGanttDayMouseUp)
  if (!ganttSelecting.value || ganttSelectStart.value === null || !ganttSelectNode.value) {
    ganttSelecting.value = false
    return
  }
  const days = ganttDays.value
  const startIdx = Math.min(ganttSelectStart.value, ganttSelectEnd.value)
  const endIdx = Math.max(ganttSelectStart.value, ganttSelectEnd.value)
  const plan_date = days[startIdx].date.toISOString().slice(0, 10)
  const plan_end_date = days[endIdx].date.toISOString().slice(0, 10)
  const node = ganttSelectNode.value
  try {
    await axios.put(`/api/project-stages/${node.id}`, {
      node_name: node.node_name || node.stage_name,
      plan_date,
      plan_end_date
    })
    node.plan_date = plan_date
    node.plan_end_date = plan_end_date
    ElMessage.success(`已设置：${plan_date} ~ ${plan_end_date}`)
  } catch {
    ElMessage.error('保存失败')
  }
  ganttSelecting.value = false
  ganttSelectNode.value = null
  ganttSelectStart.value = null
  ganttSelectEnd.value = null
}

// 判断某个日期格是否在当前选中范围内
const isDaySelected = (dayIdx) => {
  if (!ganttSelecting.value || ganttSelectStart.value === null) return false
  const start = Math.min(ganttSelectStart.value, ganttSelectEnd.value)
  const end = Math.max(ganttSelectStart.value, ganttSelectEnd.value)
  return dayIdx >= start && dayIdx <= end
}

// 退出选择模式（按 ESC 或点击空白处）
const cancelGanttSelecting = () => {
  ganttSelecting.value = false
  ganttSelectNode.value = null
  ganttSelectStart.value = null
  ganttSelectEnd.value = null
}

// 监听 ESC 键取消选择模式
const handleKeydown = (e) => {
  if (e.key === 'Escape' && ganttSelecting.value) {
    cancelGanttSelecting()
  }
}

onMounted(() => {
  loadData()
  document.addEventListener('keydown', handleKeydown)
})

// 打开甘特图弹窗
const openGanttDialog = () => {
  // 检查项目是否有工期
  if (!currentProject.value?.start_date || !currentProject.value?.end_date) {
    showProjectDateDialog.value = true
    return
  }
  showGanttDialog.value = true
}

// 保存项目工期
const saveProjectDate = () => {
  if (!projectDateForm.start_date || !projectDateForm.end_date) {
    ElMessage.warning('请填写开始日期和结束日期')
    return
  }
  if (new Date(projectDateForm.end_date) < new Date(projectDateForm.start_date)) {
    ElMessage.warning('结束日期不能早于开始日期')
    return
  }
  currentProject.value.start_date = projectDateForm.start_date
  currentProject.value.end_date = projectDateForm.end_date
  showProjectDateDialog.value = false
  // 更新列表中的数据
  const proj = projectList.value.find(p => p.id === currentProject.value.id)
  if (proj) {
    proj.start_date = projectDateForm.start_date
    proj.end_date = projectDateForm.end_date
  }
  // 同步到后端
  axios.put(`/api/projects/${currentProject.value.id}`, {
    name: currentProject.value.name,
    start_date: projectDateForm.start_date,
    end_date: projectDateForm.end_date
  }).then(() => {
    ElMessage.success('工期已保存')
    showGanttDialog.value = true
  }).catch(() => {
    ElMessage.error('保存工期失败')
  })
}

// 多项目甘特图：显示所有项目（不管有没有日期）
const ganttProjects = computed(() => {
  return projectList.value
})

// 多项目甘特图：全局日期轴（从有日期的项目中找最早~最晚）
const ganttAllDays = computed(() => {
  const projectsWithDates = ganttProjects.value.filter(p => p.start_date && p.end_date)
  if (projectsWithDates.length === 0) {
    // 没有项目有日期，显示一个默认范围（当前月）
    const today = new Date()
    const minDate = new Date(today.getFullYear(), today.getMonth(), 1)
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return genDaysList(minDate, maxDate)
  }
  const starts = projectsWithDates.map(p => new Date(p.start_date).getTime())
  const ends = projectsWithDates.map(p => new Date(p.end_date).getTime())
  const minDate = new Date(Math.min(...starts))
  const maxDate = new Date(Math.max(...ends))
  // 扩展到整月范围
  minDate.setDate(1)
  maxDate.setMonth(maxDate.getMonth() + 1)
  maxDate.setDate(0)
  return genDaysList(minDate, maxDate)
})

const genDaysList = (minDate, maxDate) => {
  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cur = new Date(minDate)
  while (cur <= maxDate) {
    const dow = cur.getDay()
    const isWeekend = dow === 0 || dow === 6
    const isToday = cur.getTime() === today.getTime()
    const showLabel = dow === 1 // 每周一显示标签
    const label = `${cur.getMonth() + 1}月${cur.getDate()}日`
    days.push({ date: new Date(cur), isToday, isWeekend, showLabel, label })
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// 格式化日期：5月1日
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 多项目甘特图：节点条位置
const getMultiBarStyle = (node, project) => {
  const allDays = ganttAllDays.value
  if (allDays.length === 0) return { display: 'none' }

  // 确定项目的时间范围（用全局轴范围，未设置日期的项目用全局轴）
  const projStart = project.start_date ? new Date(project.start_date) : allDays[0].date
  const projEnd = project.end_date ? new Date(project.end_date) : allDays[allDays.length - 1].date
  const totalCount = allDays.length

  const nodeStart = node.plan_date ? new Date(node.plan_date) : projStart
  const nodeEnd = node.plan_end_date ? new Date(node.plan_end_date) : projEnd

  const projStartMs = projStart.getTime()
  const projEndMs = projEnd.getTime()
  const projDurMs = projEndMs - projStartMs || 1

  const offsetDays = Math.max(0, Math.round((nodeStart - projStart) / 86400000))
  const durationDays = Math.max(1, Math.round((nodeEnd - nodeStart) / 86400000) + 1)

  const leftPct = (offsetDays / totalCount) * 100
  const widthPct = (durationDays / totalCount) * 100

  return {
    position: 'absolute',
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    height: '100%',
    top: 0
  }
}

// 打开节点日期编辑
const openNodeDateEdit = (node) => {
  editingNodeForDate.value = node
  nodeDateForm.plan_date = node.plan_date || ''
  nodeDateForm.plan_end_date = node.plan_end_date || ''
  showNodeDateEditDialog.value = true
}

// 保存节点日期
const saveNodeDate = async () => {
  if (!editingNodeForDate.value) return
  try {
    await axios.put(`/api/project-stages/${editingNodeForDate.value.id}`, {
      node_name: editingNodeForDate.value.node_name || editingNodeForDate.value.stage_name,
      plan_date: nodeDateForm.plan_date || null,
      plan_end_date: nodeDateForm.plan_end_date || null
    })
    editingNodeForDate.value.plan_date = nodeDateForm.plan_date
    editingNodeForDate.value.plan_end_date = nodeDateForm.plan_end_date
    showNodeDateEditDialog.value = false
    ElMessage.success('节点日期已更新')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const ganttDays = computed(() => {
  const nodes = currentProject.value?.nodes || []
  let start = currentProject.value?.start_date ? new Date(currentProject.value.start_date) : null
  let end = currentProject.value?.end_date ? new Date(currentProject.value.end_date) : null

  // 如果项目没有日期，从节点plan_date/plan_end_date中找范围
  if (!start || !end) {
    const nodeDates = nodes.map(n => ({
      start: n.plan_date ? new Date(n.plan_date) : null,
      end: n.plan_end_date ? new Date(n.plan_end_date) : null
    })).filter(n => n.start || n.end)
    if (nodeDates.length > 0) {
      const allDates = nodeDates.flatMap(n => [n.start, n.end].filter(Boolean))
      const minNode = new Date(Math.min(...allDates.map(d => d.getTime())))
      const maxNode = new Date(Math.max(...allDates.map(d => d.getTime())))
      if (!start || minNode < start) start = minNode
      if (!end || maxNode > end) end = maxNode
    }
  }

  // 如果仍然没有日期，默认显示当前月
  if (!start || !end) {
    const now = new Date()
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  }

  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isToday = d.getTime() === today.getTime()
    const showLabel = true // 每天都显示日期标签
    const label = `${d.getMonth() + 1}月${d.getDate()}日`
    days.push({ date: new Date(d), isWeekend, isToday, showLabel, label })
  }
  return days
})

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

const employeeDrawerTypeLabel = computed(() => {
  const map = { designer: '设计师', supervisor: '工程监理', manager: '工长' }
  return map[employeeDrawerType.value] || ''
})

const getEmployeeName = (empId) => {
  if (!empId) return ''
  for (const group of groupedEmployees.value) {
    const emp = group.employees.find(e => e.id === empId)
    if (emp) return emp.name
  }
  return ''
}

const isEmployeeSelected = (empId) => {
  return form[employeeDrawerType.value + '_id'] === empId
}

const selectEmployee = (emp) => {
  form[employeeDrawerType.value + '_id'] = emp.id
  showEmployeeDrawer.value = false
}

const openEmployeeDrawer = async (type) => {
  employeeDrawerType.value = type
  showEmployeeDrawer.value = true
}

const form = reactive({
  id: null,
  name: '',
  customer_id: null,
  designer_id: null,
  supervisor_id: null,
  manager_id: null,
  budget: 0,
  status: '开工准备',
  start_date: '',
  end_date: '',
  description: '',
  template_id: null
})

// 选中客户后自动带出信息
const selectedCustomerPhone = computed(() => {
  const c = customerList.value.find(c => c.id === form.customer_id)
  return c ? c.phone : ''
})
const selectedCustomerAddress = computed(() => {
  const c = customerList.value.find(c => c.id === form.customer_id)
  return c ? c.address : ''
})
const onCustomerChange = (val) => {
  if (!val) {
    form.customer_id = null
  }
}

// 加载客户列表
const loadCustomers = async () => {
  try {
    const res = await axios.get('/api/customers')
    customerList.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.error('加载客户列表失败:', error)
  }
}

// 加载节点模板列表
const loadTemplates = async () => {
  try {
    const res = await axios.get('/api/progress-node-templates')
    templateList.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.error('加载节点模板失败:', error)
  }
}

// 应用模板到当前项目
const applyTemplate = async () => {
  if (!drawerTemplateId.value || !currentProject.value) return
  try {
    await axios.post(`/api/progress-nodes/init/${currentProject.value.id}`, {
      template_id: drawerTemplateId.value
    })
    ElMessage.success('模板应用成功，节点已生成')
    // 强制清空节点列表后刷新
    if (currentProject.value) {
      currentProject.value.nodes = []
    }
    await loadData()
    drawerTemplateId.value = null
  } catch (error) {
    ElMessage.error('应用模板失败')
  }
}

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

// 格式化节点预计日期范围：预计 5月1日 至 5月15日，共15日
const formatNodeDateRange = (node) => {
  if (!node.plan_date || !node.plan_end_date) return ''
  const start = new Date(node.plan_date)
  const end = new Date(node.plan_end_date)
  const startStr = `${start.getMonth() + 1}月${start.getDate()}日`
  const endStr = `${end.getMonth() + 1}月${end.getDate()}日`
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1)
  return `预计 ${startStr} 至 ${endStr}，共${days}日`
}

// 获取项目总工期（天数）
const getProjectDuration = (project) => {
  if (!project.start_date || !project.end_date) return null
  const start = new Date(project.start_date)
  const end = new Date(project.end_date)
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}

// 判断连接线是否已完成（看前一个节点）
const isLineDone = (nodes, index) => {
  if (index <= 0) return false
  const prev = nodes[index - 1]
  return prev.status === 'completed'
}

// 判断甘特图连接线是否已完成（前一个节点完成）
const isNodeCompleted = (index, nodes) => {
  if (index < 0 || index >= nodes.length) return false
  return nodes[index].status === 'completed'
}

// 计算甘特图节点条的位置和宽度（基于ganttDays的日期范围）
const getGanttBarStyle = (node) => {
  const days = ganttDays.value
  if (!days || days.length === 0) return { display: 'none' }

  const totalDays = days.length
  const start = days[0].date
  const end = days[days.length - 1].date

  const nodeStart = node.plan_date ? new Date(node.plan_date) : start
  const nodeEnd = node.plan_end_date ? new Date(node.plan_end_date) : (node.plan_date ? new Date(node.plan_date) : start)

  const clampedStart = new Date(Math.max(nodeStart.getTime(), start.getTime()))
  const clampedEnd = new Date(Math.min(nodeEnd.getTime(), end.getTime()))

  const offsetDays = Math.round((clampedStart - start) / 86400000)
  const spanDays = Math.max(1, Math.round((clampedEnd - clampedStart) / 86400000) + 1)

  const leftPct = (offsetDays / totalDays) * 100
  const widthPct = (spanDays / totalDays) * 100

  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 3)}%`,
    minWidth: '30px'
  }
}

// 甘特图拖拽：鼠标按下
const onBarMouseDown = (event, node, type) => {
  event.preventDefault()
  ganttDragging.value = { id: node.id, type, startX: event.clientX, node: { ...node } }
  document.addEventListener('mousemove', onGanttMouseMove)
  document.addEventListener('mouseup', onGanttMouseUp)
}

// 甘特图拖拽：鼠标移动
const onGanttMouseMove = async (event) => {
  if (!ganttDragging.value || !currentProject.value) return
  const { type, startX, node: origNode } = ganttDragging.value
  const totalDays = getProjectDuration(currentProject.value)
  if (!totalDays) return

  const start = new Date(currentProject.value.start_date)
  const end = new Date(currentProject.value.end_date)
  const ganttEl = document.querySelector('.gantt-body')
  if (!ganttEl) return
  const rect = ganttEl.querySelector('.gantt-timeline')?.getBoundingClientRect()
  if (!rect) return

  const deltaX = event.clientX - startX
  const dayWidth = rect.width / totalDays
  const deltaDays = Math.round(deltaX / dayWidth)
  if (deltaDays === 0) return

  // 更新本地节点数据（乐观更新）
  const node = currentProject.value.nodes.find(n => n.id === origNode.id)
  if (!node) return

  let newStart = origNode.plan_date ? new Date(origNode.plan_date) : new Date(start)
  let newEnd = origNode.plan_end_date ? new Date(origNode.plan_end_date) : new Date(newStart)
  newStart.setHours(0, 0, 0, 0)
  newEnd.setHours(0, 0, 0, 0)

  if (type === 'move') {
    newStart = new Date(newStart.getTime() + deltaDays * 86400000)
    newEnd = new Date(newEnd.getTime() + deltaDays * 86400000)
  } else if (type === 'start') {
    newStart = new Date(Math.min(newStart.getTime() + deltaDays * 86400000, newEnd.getTime() - 86400000))
  } else if (type === 'end') {
    newEnd = new Date(Math.max(newEnd.getTime() + deltaDays * 86400000, newStart.getTime() + 86400000))
  }

  // 边界检查
  if (newStart < start) { const diff = start - newStart; newStart = new Date(start); newEnd = new Date(newEnd.getTime() + diff) }
  if (newEnd > end) { const diff = newEnd - end; newEnd = new Date(end); newStart = new Date(newStart.getTime() - diff) }

  node.plan_date = newStart.toISOString().slice(0, 10)
  node.plan_end_date = newEnd.toISOString().slice(0, 10)
  ganttDragging.value.startX = event.clientX
}

// 甘特图拖拽：鼠标松开
const onGanttMouseUp = async () => {
  if (!ganttDragging.value || !currentProject.value) {
    cleanupGanttDrag()
    return
  }
  const { node: origNode } = ganttDragging.value
  const node = currentProject.value.nodes.find(n => n.id === origNode.id)
  if (node) {
    // 同步保存到后端
    try {
      await axios.put(`/api/project-stages/${node.id}`, {
        plan_date: node.plan_date,
        plan_end_date: node.plan_end_date
      })
    } catch (e) {
      console.error('保存节点日期失败:', e)
      // 回滚
      node.plan_date = origNode.plan_date
      node.plan_end_date = origNode.plan_end_date
    }
  }
  cleanupGanttDrag()
}

const cleanupGanttDrag = () => {
  ganttDragging.value = null
  document.removeEventListener('mousemove', onGanttMouseMove)
  document.removeEventListener('mouseup', onGanttMouseUp)
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
    // 强制清空节点列表后再刷新，解决抽屉内数据不更新问题
    if (currentProject.value) {
      currentProject.value.nodes = []
    }
    await loadData()
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
    if (currentProject.value) currentProject.value.nodes = []
    await loadData()
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

// 拖拽开始
const handleNodeDragStart = (index) => {
  draggingIndex.value = index
}

// 拖拽经过（显示放置目标）
const handleNodeDragOver = (index) => {
  if (draggingIndex.value < 0 || draggingIndex.value === index) return
  dragOverIndex.value = index
}

// 放置（真正排序）
const handleNodeDrop = async (toIndex) => {
  if (draggingIndex.value < 0 || draggingIndex.value === toIndex) {
    handleNodeDragEnd()
    return
  }
  const fromIndex = draggingIndex.value
  const nodes = currentProject.value.nodes

  // 移动数组元素
  const [moved] = nodes.splice(fromIndex, 1)
  nodes.splice(toIndex, 0, moved)

  // 批量更新 sort_order 到后端
  try {
    await Promise.all(nodes.map((node, i) =>
      axios.put(`/api/project-stages/${node.id}`, {
        node_name: node.node_name,
        sort_order: i
      })
    ))
    // 刷新 projectList 中的节点（保持横向横轴同步）
    const proj = projectList.value.find(p => p.id === currentProject.value.id)
    if (proj) {
      proj.nodes = [...nodes]
    }
    ElMessage.success('节点顺序已更新')
  } catch (error) {
    ElMessage.error('更新顺序失败')
    // 失败后重新拉取数据
    await loadData()
  }
  handleNodeDragEnd()
}

// 拖拽结束
const handleNodeDragEnd = () => {
  draggingIndex.value = -1
  dragOverIndex.value = -1
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
  drawerTemplateId.value = null
  await Promise.all([loadSmsTemplates(), loadTemplates()])
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
  await Promise.all([loadGroupedEmployees(), loadCustomers(), loadTemplates()])
  showAddDialog.value = true
}

// 编辑项目
const handleEdit = async (row) => {
  isEdit.value = true
  resetForm()
  await Promise.all([loadGroupedEmployees(), loadCustomers()])
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
      // 如果选了模板，自动生成节点
      if (form.template_id) {
        try {
          await axios.post(`/api/progress-nodes/init/${res.data.id}`, {
            template_id: form.template_id
          })
        } catch (e) {
          console.error('自动生成节点失败:', e)
        }
      }
      ElMessage.success('添加成功')
    }
    closeDialog()
    loadData()
  } catch (error) {
    ElMessage.error('操作失败')
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
  form.customer_id = null
  form.designer_id = null
  form.supervisor_id = null
  form.manager_id = null
  form.budget = 0
  form.status = '开工准备'
  form.start_date = ''
  form.end_date = ''
  form.description = ''
  form.template_id = null
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
  cursor: grab;
}

.node-item:active {
  cursor: grabbing;
}

.node-item:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.node-item-dragging {
  opacity: 0.4;
  background: #f5f7fa;
}

.node-item-drag-over {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.2);
}

.drag-handle {
  color: #c0c4cc;
  cursor: grab;
  display: flex;
  align-items: center;
  margin-right: 4px;
  transition: color 0.15s;
}

.drag-handle:hover {
  color: #909399;
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

.node-date-range {
  font-size: 12px;
  color: #e6a23c;
  white-space: nowrap;
}

.drawer-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: center;
}

/* 员工选择器 */
.employee-picker {
  cursor: pointer;
  display: inline-block;
}

.employee-drawer-content {
  padding: 0 8px;
}

.emp-dept-group {
  margin-bottom: 20px;
}

.emp-dept-label {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  padding: 6px 12px;
  background: #f0f7ff;
  border-radius: 4px;
  margin-bottom: 8px;
}

.emp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.emp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.emp-item:hover {
  background: #f5f7fa;
  border-color: #dcdfe6;
}

.emp-item-selected {
  background: #ecf5ff;
  border-color: #409eff;
}

.emp-name {
  font-size: 14px;
  color: #303133;
  flex: 1;
}

.emp-phone {
  font-size: 12px;
  color: #909399;
}

.emp-check {
  color: #409eff;
  font-size: 16px;
}

/* ========== 甘特图 ========== */
.gantt-section {
  margin-top: 20px;
  padding: 14px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.gantt-dialog-body {
  max-height: calc(90vh - 120px);
  overflow-y: auto;
}

.gantt-single-grid {
  min-width: 100%;
}

.gantt-empty {
  text-align: center;
  color: #909399;
  padding: 60px 0;
  font-size: 14px;
}

.gantt-multi {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.gantt-multi-header {
  display: flex;
  background: #f5f7fa;
  border-bottom: 2px solid #dcdfe6;
  position: sticky;
  top: 0;
  z-index: 10;
}

.gantt-proj-name-header {
  width: 200px;
  min-width: 200px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-right: 1px solid #dcdfe6;
  background: #f5f7fa;
}

.gantt-timeline-area {
  flex: 1;
  overflow-x: auto;
  position: relative;
}

.gantt-multi-body {
  overflow-y: auto;
  max-height: calc(90vh - 220px);
}

.gantt-project-row {
  display: flex;
  border-bottom: 1px solid #ebeef5;
  min-height: 50px;
}

.gantt-project-row:last-child {
  border-bottom: none;
}

.gantt-proj-name-cell {
  width: 200px;
  min-width: 200px;
  padding: 10px 12px;
  border-right: 1px solid #ebeef5;
  background: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.gantt-project-row:hover .gantt-proj-name-cell {
  background: #f5f7fa;
}

.proj-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proj-dates {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}

.gantt-node-bars {
  position: relative;
  height: 50px;
  width: 100%;
}

.gantt-multi-bar-wrap {
  position: absolute;
  height: 100%;
}

.gantt-multi-bar {
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0 2px;
  transition: filter 0.15s;
  overflow: hidden;
}

.gantt-multi-bar:hover {
  filter: brightness(1.1);
}

.gantt-multi-bar .bar-label {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 6px;
  text-align: center;
}

.gantt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.gantt-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.gantt-range {
  font-size: 12px;
  color: #909399;
}

.gantt-body {
  overflow-x: auto;
}
.gantt-timeline-area {
  flex: 1;
  overflow-x: auto;
  position: relative;
  min-width: 0;
}

.gantt-timeline {
  display: flex;
  height: 24px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 4px;
  position: relative;
  /* 每天最小20px，确保日期轴有足够宽度 */
  min-width: max-content;
}

.gantt-day {
  flex: 1;
  min-width: 32px;
  height: 24px;
  position: relative;
  border-right: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gantt-day-today {
  background: #fffbe6;
}

.gantt-day-weekend {
  background: #f5f5f5;
}

.gantt-day-selecting {
  background: #e6f0ff !important;
  outline: 2px solid #409eff;
  z-index: 1;
}

.day-label {
  position: static;
  font-size: 10px;
  color: #909399;
  white-space: nowrap;
  text-align: center;
}

.gantt-bars {
  position: relative;
}

.gantt-row {
  height: 36px;
  display: flex;
  align-items: center;
  position: relative;
  margin-bottom: 4px;
}

.gantt-connector {
  position: absolute;
  left: 0;
  right: 0;
  top: -4px;
  height: 8px;
  display: flex;
  align-items: center;
  z-index: 0;
}

.connector-line {
  width: 100%;
  height: 2px;
  background: #dcdfe6;
  transition: background 0.3s;
}

.connector-line.done {
  background: #67c23a;
}

.gantt-bar {
  position: absolute;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  cursor: grab;
  user-select: none;
  z-index: 1;
  transition: opacity 0.15s;
  overflow: visible;
}

.gantt-bar:active {
  cursor: grabbing;
}

.gantt-bar-dragging {
  opacity: 0.8;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.gantt-bar-selecting {
  outline: 3px solid #409eff;
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.5);
  z-index: 2;
}

.gantt-bar-pending {
  background: linear-gradient(90deg, #909399, #a6a9ad);
}

.gantt-bar-in_progress {
  background: linear-gradient(90deg, #e6a23c, #ebb563);
}

.gantt-bar-completed {
  background: linear-gradient(90deg, #67c23a, #85ce61);
}

.gantt-bar-skipped {
  background: linear-gradient(90deg, #c0c4cc, #d3d4d6);
}

.bar-left-handle,
.bar-right-handle {
  width: 8px;
  height: 100%;
  cursor: ew-resize;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar-left-handle:hover,
.bar-right-handle:hover {
  background: rgba(255,255,255,0.3);
  border-radius: 4px;
}

.bar-label {
  font-size: 11px;
  color: #fff;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  padding: 0 6px;
  text-align: center;
  line-height: 1.2;
  width: 100%;
}
</style>
