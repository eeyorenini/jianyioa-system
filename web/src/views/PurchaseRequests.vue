<template>
  <div class="purchase-requests">
    <el-card>
      <template #header>
        <div class="card-header">
          <!-- 自定义 Tab 栏 -->
          <div class="pr-tabs">
            <div
              v-for="tab in visibleTabs"
              :key="tab.key"
              class="pr-tab"
              :class="{ active: activeTab === tab.key }"
              @click="switchTab(tab.key)"
            >
              {{ tab.label }}
              <span v-if="tab.badge" class="pr-tab-badge">{{ tab.badge }}</span>
            </div>
          </div>
          <el-button v-if="activeTab === 'my'" type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon> 提交采购申请
          </el-button>
        </div>
      </template>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width:140px;margin-right:10px;" @change="loadData">
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="报销中" value="reimbursing" />
          <el-option label="已报销" value="reimbursed" />
        </el-select>
        <el-input v-model="keyword" placeholder="项目名称/申请人" style="width:200px;" clearable @clear="loadData" @keyup.enter="loadData">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button style="margin-left:10px;" type="primary" @click="loadData">搜索</el-button>
      </div>

      <!-- 列表 -->
      <el-table :data="list" style="width:100%;margin-top:16px;" v-loading="loading" @row-click="openDetail">
        <el-table-column prop="project_name" label="项目" min-width="150" show-overflow-tooltip />
        <el-table-column prop="applicant_name" label="申请人" width="100" />
        <el-table-column prop="total_amount" label="申请金额" width="120">
          <template #default="{ row }">¥{{ formatNumber(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column prop="actual_amount" label="实付金额" width="120">
          <template #default="{ row }">
            <span v-if="row.actual_amount > 0" style="color:#67c23a;">¥{{ formatNumber(row.actual_amount) }}</span>
            <span v-else style="color:#999;">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column prop="created_at" label="申请时间" width="160" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-button v-if="activeTab === 'my' && (row._isAdmin || row._isApplicant) && (row.status === 'pending' || row.status === 'rejected')" size="small" type="danger" @click.stop="deleteRow(row)">删除</el-button>
            <el-button v-if="row._canApprove && row.status === 'pending'" size="small" type="success" @click.stop="showApproveDialog(row)">审核</el-button>
            <el-button v-if="row._isApplicant && row.status === 'approved'" size="small" type="warning" @click.stop="showReimburseDialog(row)">上传报销</el-button>
            <el-button v-if="row._canFinance && row.status === 'reimbursing'" size="small" type="success" @click.stop="showFinanceDialog(row)">确认报销</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        style="margin-top:16px;justify-content:center;"
        :total="total" :page.sync="page" :limit.sync="limit"
        layout="total,prev,pager,next"
        @current-change="loadData"
      />
    </el-card>

    <!-- 详情面板 -->
    <el-drawer v-model="detailVisible" title="采购申请详情" size="600px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="项目">{{ detail.project_name }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicant_name }}</el-descriptions-item>
          <el-descriptions-item label="申请金额">¥{{ formatNumber(detail.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="实付金额">
            <span v-if="detail.actual_amount > 0" style="color:#67c23a;">¥{{ formatNumber(detail.actual_amount) }}</span>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(detail.status)">{{ statusText(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">{{ detail.created_at }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '无' }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.status === 'rejected' && detail.rejection_reason" label="拒绝原因" :span="2">
            <span style="color:#f56c6c;">{{ detail.rejection_reason }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider>采购明细</el-divider>
        <el-table :data="detail.items" size="small" border>
          <el-table-column prop="material_name" label="材料名称" min-width="120" />
          <el-table-column prop="unit" label="单位" width="80" />
          <el-table-column prop="quantity" label="数量" width="80" align="right" />
          <el-table-column prop="unit_price" label="单价" width="100" align="right">
            <template #default="{ row }">¥{{ formatNumber(row.unit_price) }}</template>
          </el-table-column>
          <el-table-column prop="total_price" label="合计" width="100" align="right">
            <template #default="{ row }">¥{{ formatNumber(row.total_price) }}</template>
          </el-table-column>
        </el-table>

        <!-- 报销凭证 -->
        <template v-if="detail.reimbursement">
          <el-divider>报销凭证</el-divider>
          <div v-if="reimburseImages.length > 0" style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-image
              v-for="(img, idx) in reimburseImages"
              :key="idx"
              :src="img"
              :preview-src-list="reimburseImages"
              fit="cover"
              style="width:100px;height:100px;border-radius:4px;"
            />
          </div>
          <el-descriptions v-if="detail.reimbursement" :column="2" border size="small">
            <el-descriptions-item label="实付金额">¥{{ formatNumber(detail.reimbursement.actual_amount) }}</el-descriptions-item>
            <el-descriptions-item label="确认人">{{ detail.reimbursement.confirmed_by_name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="财务备注" :span="2">{{ detail.reimbursement.financial_notes || '无' }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- 操作按钮 -->
        <div style="margin-top:20px;display:flex;gap:10px;">
          <el-button v-if="detail._isApplicant && detail.status === 'rejected'" type="primary" @click="handleResubmit">重新提交</el-button>
          <el-button v-if="detail._isApplicant && detail.status === 'approved'" type="warning" @click="showReimburseDialog(detail)">上传报销单</el-button>
          <el-button v-if="detail._canApprove && detail.status === 'pending'" type="success" @click="showApproveDialog(detail)">审核</el-button>
          <el-button v-if="detail._canFinance && detail.status === 'reimbursing'" type="success" @click="showFinanceDialog(detail)">确认报销</el-button>
          <el-button v-if="detail._isApplicant && detail.status === 'pending'" type="danger" @click="handleDelete">删除</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 新建申请弹窗 -->
    <el-dialog v-model="createVisible" title="提交采购申请" width="700px" :close-on-click-modal="false">
      <el-form :model="form" label-width="90px" ref="formRef">
        <el-form-item label="关联项目" required>
          <el-select v-model="form.project_id" placeholder="请选择项目" filterable style="width:100%;" @change="onProjectChange">
            <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="采购明细">
          <div style="width:100%;">
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
              <el-button size="small" type="primary" @click="showMaterialPicker">从主材库选择</el-button>
              <el-button size="small" type="info" plain @click="addFreeItem">手动添加</el-button>
            </div>
            <el-table :data="form.items" border size="small" style="width:100%;">
              <el-table-column prop="material_name" label="材料名称" min-width="120">
                <template #default="{ row, $index }">
                  <el-input v-model="row.material_name" placeholder="名称" />
                </template>
              </el-table-column>
              <el-table-column prop="unit" label="单位" width="80">
                <template #default="{ row }"><el-input v-model="row.unit" placeholder="单位" /></template>
              </el-table-column>
              <el-table-column prop="quantity" label="数量" width="90">
                <template #default="{ row }"><el-input-number v-model="row.quantity" :min="0" controls-position="right" style="width:100%;" /></template>
              </el-table-column>
              <el-table-column prop="unit_price" label="单价" width="110">
                <template #default="{ row }"><el-input-number v-model="row.unit_price" :min="0" :precision="2" controls-position="right" style="width:100%;" /></template>
              </el-table-column>
              <el-table-column prop="total_price" label="合计" width="100">
                <template #default="{ row }">¥{{ formatNumber((row.quantity || 0) * (row.unit_price || 0)) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="60">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" @click="removeItem($index)">删</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div style="text-align:right;padding:8px 0;font-weight:bold;">
              合计金额：<span style="color:#f56c6c;font-size:16px;">¥{{ formatNumber(totalAmount) }}</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 主材选择弹窗 -->
    <el-dialog v-model="materialPickerVisible" title="选择主材" width="700px">
      <el-form :inline="true" style="margin-bottom:12px;">
        <el-form-item label="材料名称">
          <el-input v-model="materialKeyword" placeholder="搜索材料名称" clearable />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="materialCategory" placeholder="全部分类" clearable style="width:140px;">
            <el-option v-for="c in materialCategories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="loadMaterials">搜索</el-button></el-form-item>
      </el-form>
      <el-table :data="materialList" border size="small" max-height="350" @row-click="selectMaterial">
        <el-table-column prop="name" label="材料名称" min-width="150" />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="cost_price" label="成本价" width="100" align="right">
          <template #default="{ row }">¥{{ formatNumber(row.cost_price) }}</template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="供应商" width="120" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <!-- 审核弹窗 -->
    <el-dialog v-model="approveVisible" title="审核采购申请" width="450px">
      <el-form :model="approveForm" label-width="80px">
        <el-form-item label="项目">{{ approveForm.project_name }}</el-form-item>
        <el-form-item label="申请金额">¥{{ formatNumber(approveForm.total_amount) }}</el-form-item>
        <el-form-item label="审核操作" required>
          <el-radio-group v-model="approveForm.action">
            <el-radio label="approve">通过</el-radio>
            <el-radio label="reject">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="approveForm.action === 'reject'" label="拒绝原因">
          <el-input v-model="approveForm.reason" type="textarea" :rows="2" placeholder="请输入拒绝原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleApprove">确认{{ approveForm.action === 'approve' ? '通过' : '拒绝' }}</el-button>
      </template>
    </el-dialog>

    <!-- 报销上传弹窗 -->
    <el-dialog v-model="reimburseVisible" title="上传报销单" width="500px" :close-on-click-modal="false">
      <el-form :model="reimburseForm" label-width="90px">
        <el-form-item label="实付金额" required>
          <el-input-number v-model="reimburseForm.actual_amount" :min="0" :precision="2" :controls="false" style="width:100%;" placeholder="请输入实付金额" />
        </el-form-item>
        <el-form-item label="上传凭证" required>
          <el-upload
            ref="uploadRef"
            action="/api/upload-image"
            :headers="{ 'x-user-id': userId }"
            list-type="picture-card"
            :file-list="uploadFileList"
            :on-success="onUploadSuccess"
            :on-remove="onUploadRemove"
            :before-remove="beforeUploadRemove"
            multiple
            accept="image/*"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reimburseForm.financial_notes" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reimburseVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleReimburse">提交报销</el-button>
      </template>
    </el-dialog>

    <!-- 财务确认弹窗 -->
    <el-dialog v-model="financeVisible" title="财务确认报销" width="450px">
      <el-form :model="financeForm" label-width="90px">
        <el-form-item label="项目">{{ financeForm.project_name }}</el-form-item>
        <el-form-item label="实付金额" required>
          <el-input-number v-model="financeForm.actual_amount" :min="0" :precision="2" :controls="false" style="width:100%;" />
        </el-form-item>
        <el-form-item label="财务备注">
          <el-input v-model="financeForm.financial_notes" type="textarea" :rows="2" placeholder="核对备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="financeVisible = false">取消</el-button>
        <el-button type="success" :loading="submitting" @click="handleFinanceConfirm">确认报销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../utils/request'

const userId = parseInt(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).id : 0)

// 状态
const activeTab = ref('my')
const list = ref([])
const loading = ref(false)
const page = ref(1)
const limit = ref(50)
const total = ref(0)
const keyword = ref('')
const filterStatus = ref('')
const detail = ref(null)
const detailVisible = ref(false)

// 权限
const canApprove = ref(false)
const canFinance = ref(false)
const canViewAll = ref(false)

// Badge 数量
const pendingCount = ref(0)
const reimburseCount = ref(0)
const financeCount = ref(0)

// 创建表单
const createVisible = ref(false)
const formRef = ref()
const form = ref({ project_id: null, project_name: '', items: [], remark: '' })
const submitting = ref(false)
const projectList = ref([])

// 主材选择
const materialPickerVisible = ref(false)
const materialList = ref([])
const materialKeyword = ref('')
const materialCategory = ref('')
const materialCategories = ref([])

// 审核
const approveVisible = ref(false)
const approveForm = ref({ id: null, project_name: '', total_amount: 0, action: 'approve', reason: '' })

// 报销
const reimburseVisible = ref(false)
const reimburseForm = ref({ actual_amount: null, financial_notes: '' })
const uploadRef = ref()
const uploadFileList = ref([])
const uploadedImages = ref([])

// 财务确认
const financeVisible = ref(false)
const financeForm = ref({ id: null, project_name: '', actual_amount: null, financial_notes: '' })

const totalAmount = computed(() => {
  return form.value.items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
  }, 0)
})

const reimburseImages = computed(() => {
  if (!detail.value?.reimbursement?.images) return []
  try {
    const imgs = JSON.parse(detail.value.reimbursement.images)
    return Array.isArray(imgs) ? imgs : []
  } catch { return [] }
})

function statusText(s) {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝', reimbursing: '报销中', reimbursed: '已报销' }
  return map[s] || s
}
function statusTagType(s) {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger', reimbursing: 'primary', reimbursed: 'info' }
  return map[s] || ''
}
function formatNumber(v) {
  if (!v && v !== 0) return '0'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 加载列表
async function loadData() {
  loading.value = true
  try {
    let status = filterStatus.value
    let url = '/purchase-requests?page=' + page.value + '&limit=' + limit.value
    if (status) url += '&status=' + status
    if (keyword.value) url += '&keyword=' + encodeURIComponent(keyword.value)

    let res
    if (activeTab.value === 'my') {
      res = await request.get(url)
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'pending') {
      res = await request.get(url + '&status=pending')
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'reimbursing') {
      res = await request.get(url + '&status=reimbursing')
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'finance') {
      res = await request.get('/purchase-requests/finance?page=' + page.value + '&limit=' + limit.value)
      list.value = res.list || []
      total.value = res.total || 0
    } else {
      res = await request.get(url)
      list.value = res.list || []
      total.value = res.total || 0
    }
    loadCounts()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 加载 Badge 数量
async function loadCounts() {
  if (!canApprove.value && !canFinance.value) return
  try {
    if (canApprove.value) {
      const r = await request.get('/purchase-requests?status=pending&limit=1')
      pendingCount.value = r.total || 0
    }
    if (canFinance.value) {
      const [r1, r2] = await Promise.all([
        request.get('/purchase-requests?status=reimbursing&limit=1'),
        request.get('/purchase-requests/finance?limit=1')
      ])
      reimburseCount.value = r1.total || 0
      financeCount.value = r2.total || 0
    }
  } catch {}
}

function switchTab(key) {
  activeTab.value = key
  page.value = 1
  filterStatus.value = ''
  loadData()
}

const visibleTabs = computed(() => {
  const all = [
    { key: 'my', label: '我的申请', badge: null },
    { key: 'pending', label: '待审核', badge: pendingCount.value || null },
    { key: 'reimbursing', label: '待报销', badge: reimburseCount.value || null },
    { key: 'finance', label: '财务确认', badge: financeCount.value || null },
  ]
  return all
})

// 打开详情
async function openDetail(row) {
  try {
    detail.value = await request.get('/purchase-requests/' + row.id)
    detailVisible.value = true
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

// 打开创建弹窗
async function openCreateDialog() {
  form.value = { project_id: null, project_name: '', items: [], remark: '' }
  createVisible.value = true
  loadProjects()
}

async function loadProjects() {
  try {
    const res = await request.get('/projects?limit=500')
    projectList.value = res.list || []
  } catch (e) {
    projectList.value = []
  }
}

function onProjectChange(id) {
  const p = projectList.value.find(p => p.id === id)
  if (p) form.value.project_name = p.name
}

// 主材选择
function showMaterialPicker() {
  materialPickerVisible.value = true
  loadMaterials()
}

async function loadMaterials() {
  try {
    let url = '/main-materials?limit=500&is_visible=1'
    if (materialKeyword.value) url += '&keyword=' + encodeURIComponent(materialKeyword.value)
    if (materialCategory.value) url += '&category=' + encodeURIComponent(materialCategory.value)
    const res = await request.get(url)
    materialList.value = res.list || []
    const cats = [...new Set(materialList.value.map(m => m.category).filter(Boolean))]
    materialCategories.value = cats
  } catch (e) {
    materialList.value = []
  }
}

function selectMaterial(row) {
  form.value.items.push({
    material_id: row.id,
    material_name: row.name,
    unit: row.purchase_unit || row.quote_unit || '',
    quantity: 1,
    unit_price: parseFloat(row.cost_price) || 0,
    total_price: parseFloat(row.cost_price) || 0
  })
  materialPickerVisible.value = false
}

function addFreeItem() {
  form.value.items.push({ material_id: null, material_name: '', unit: '', quantity: 1, unit_price: 0, total_price: 0 })
}

function removeItem(index) {
  form.value.items.splice(index, 1)
}

async function handleSubmit() {
  if (!form.value.project_id) { ElMessage.warning('请选择项目'); return }
  if (form.value.items.length === 0) { ElMessage.warning('请添加采购明细'); return }

  const items = form.value.items.map(item => ({
    ...item,
    total_price: ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2)
  }))

  submitting.value = true
  try {
    await request.post('/purchase-requests', {
      project_id: form.value.project_id,
      project_name: form.value.project_name,
      items,
      remark: form.value.remark
    })
    ElMessage.success('提交成功')
    createVisible.value = false
    loadData()
  } catch (e) {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

// 重新提交
async function handleResubmit() {
  try {
    await ElMessageBox.confirm('确认重新提交此申请？', '提示', { type: 'warning' })
    await request.post('/purchase-requests/' + detail.value.id + '/resubmit')
    ElMessage.success('重新提交成功')
    detailVisible.value = false
    loadData()
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

// 删除
async function handleDelete() {
  try {
    await ElMessageBox.confirm('确认删除此申请？删除后不可恢复。', '警告', { type: 'warning' })
    await request.delete('/purchase-requests/' + detail.value.id)
    ElMessage.success('删除成功')
    detailVisible.value = false
    loadData()
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

// 删除
async function deleteRow(row) {
  try {
    await ElMessageBox.confirm('确定删除该采购申请吗？', '删除确认', { type: 'warning' })
  } catch { return }
  submitting.value = true
  try {
    await request.delete('/purchase-requests/' + row.id)
    ElMessage.success('删除成功')
    loadData()
    detailVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    submitting.value = false
  }
}

// 审核
function showApproveDialog(row) {
  approveForm.value = { id: row.id, project_name: row.project_name, total_amount: row.total_amount, action: 'approve', reason: '' }
  approveVisible.value = true
}

async function handleApprove() {
  if (!approveForm.value.action) { ElMessage.warning('请选择操作'); return }
  if (approveForm.value.action === 'reject' && !approveForm.value.reason) { ElMessage.warning('请输入拒绝原因'); return }
  submitting.value = true
  try {
    await request.put('/purchase-requests/' + approveForm.value.id + '/approve', {
      action: approveForm.value.action,
      reason: approveForm.value.reason
    })
    ElMessage.success(approveForm.value.action === 'approve' ? '已通过' : '已拒绝')
    approveVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

// 报销上传
function showReimburseDialog(row) {
  reimburseForm.value = { actual_amount: parseFloat(row.total_amount) || 0, financial_notes: '' }
  uploadFileList.value = []
  uploadedImages.value = []
  reimburseVisible.value = true
  // 如果已有报销记录，回显
  if (row.reimbursement) {
    reimburseForm.value.actual_amount = parseFloat(row.reimbursement.actual_amount) || 0
    reimburseForm.value.financial_notes = row.reimbursement.financial_notes || ''
    try {
      const imgs = JSON.parse(row.reimbursement.images || '[]')
      uploadedImages.value = imgs
      uploadFileList.value = imgs.map((u, i) => ({ url: u, uid: -i - 1, name: 'image_' + i }))
    } catch {}
  }
}

function onUploadSuccess(res, file, files) {
  if (res.url) uploadedImages.value.push(res.url)
}

function onUploadRemove(file, files) {
  uploadedImages.value = files.map(f => f.url || f.response?.url).filter(Boolean)
}

function beforeUploadRemove(file, files) {
  uploadedImages.value = files.map(f => f.url || f.response?.url).filter(Boolean)
}

async function handleReimburse() {
  if (uploadedImages.value.length === 0) { ElMessage.warning('请上传报销凭证'); return }
  submitting.value = true
  try {
    // 用 FormData 提交
    const fd = new FormData()
    fd.append('actual_amount', reimburseForm.value.actual_amount || 0)
    fd.append('financial_notes', reimburseForm.value.financial_notes || '')
    for (const img of uploadedImages.value) {
      // 如果是已有URL（之前上传过的），直接提交URL字符串
    }
    await request.post('/purchase-requests/' + detail.value.id + '/reimburse', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    ElMessage.success('上传成功')
    reimburseVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

// 财务确认
function showFinanceDialog(row) {
  financeForm.value = {
    id: row.id,
    project_name: row.project_name,
    actual_amount: row.reimbursement?.actual_amount ? parseFloat(row.reimbursement.actual_amount) : parseFloat(row.total_amount),
    financial_notes: row.reimbursement?.financial_notes || ''
  }
  financeVisible.value = true
}

async function handleFinanceConfirm() {
  submitting.value = true
  try {
    await request.put('/purchase-requests/' + financeForm.value.id + '/finance-confirm', {
      actual_amount: financeForm.value.actual_amount,
      financial_notes: financeForm.value.financial_notes
    })
    ElMessage.success('财务确认完成')
    financeVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  // 检查权限
  try {
    const perms = JSON.parse(localStorage.getItem('permissions') || '[]')
    canApprove.value = perms.includes('purchase:approve')
    canFinance.value = perms.includes('purchase:finance')
    canViewAll.value = perms.includes('purchase:view')
  } catch {}
  loadData()
})
</script>

<style scoped>
.purchase-requests { padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.filter-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.pr-tabs { display: flex; gap: 4px; }
.pr-tab {
  padding: 6px 16px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: #666;
  position: relative;
  user-select: none;
  border-bottom: 2px solid transparent;
}
.pr-tab:hover { color: #409eff; }
.pr-tab.active { color: #409eff; border-bottom-color: #409eff; font-weight: 500; }
.pr-tab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f56c6c;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}
</style>
