<template>
  <div class="main-materials">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>主材管理</span>
          <div class="header-actions">
            <el-upload
              :show-file-list="false"
              action="/api/main-materials/import"
              name="file"
              accept=".xlsx,.xls"
              :on-success="handleImportSuccess"
              :on-error="handleImportError"
            >
              <el-button type="primary">Excel导入</el-button>
            </el-upload>
            <el-button type="success" @click="handleExport">Excel导出</el-button>
            <el-button @click="showColumnDialog = true">设置列</el-button>
            <el-button type="primary" @click="handleAdd">新增主材</el-button>
          </div>
        </div>
      </template>

      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item>
          <el-input v-model="searchForm.keyword" placeholder="编号/名称/品牌/型号" clearable style="width: 260px" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="searchForm.category" placeholder="所有材料" clearable style="width: 180px">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%" row-key="id">
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.key"
          :prop="col.key"
          :label="col.title"
          :width="col.width"
          :fixed="col.fixed ? 'left' : false"
          show-overflow-tooltip
        >
          <template #default="scope">
            <template v-if="['original_price', 'quote_price', 'cost_price', 'contract_price', 'cost_price2', 'exchange_rate', 'loss_rate', 'loss_amount', 'upgrade_profit_rate', 'internal_control_price'].includes(col.key)">
              {{ formatMoney(scope.row[col.key]) }}
            </template>
            <template v-else>
              {{ scope.row[col.key] || '-' }}
            </template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :page-sizes="[20, 50, 100, 200]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="loadData"
        @size-change="loadData"
      />
    </el-card>

    <el-dialog v-model="showEditDialog" :title="isEdit ? '编辑主材' : '新增主材'" width="900px">
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="系统编号"><el-input v-model="form.code" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="名称"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="类别"><el-input v-model="form.category" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="品牌"><el-input v-model="form.brand" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="规格"><el-input v-model="form.specification" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="型号"><el-input v-model="form.model" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="颜色"><el-input v-model="form.color" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="规格备选"><el-input v-model="form.spec_alternative" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="型号备选"><el-input v-model="form.model_alternative" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="颜色备选"><el-input v-model="form.color_alternative" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="报价单位"><el-input v-model="form.quote_unit" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="采购单位"><el-input v-model="form.purchase_unit" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="原价"><el-input-number v-model="form.original_price" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="核算价"><el-input-number v-model="form.cost_price" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="成本价"><el-input-number v-model="form.cost_price2" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="报价"><el-input-number v-model="form.quote_price" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="发包价"><el-input-number v-model="form.contract_price" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="兑换比例"><el-input-number v-model="form.exchange_rate" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="损耗比例"><el-input-number v-model="form.loss_rate" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="损耗金额"><el-input-number v-model="form.loss_amount" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="保修时长"><el-input v-model="form.warranty_period" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备货周期"><el-input v-model="form.stock_period" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="位置"><el-input v-model="form.position" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="套系"><el-input v-model="form.package_name" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="升级利润率"><el-input-number v-model="form.upgrade_profit_rate" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="内控单价"><el-input-number v-model="form.internal_control_price" :min="0" :precision="2" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="组合"><el-input v-model="form.combo" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="限量公式"><el-input v-model="form.limit_formula" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="报价量公式"><el-input v-model="form.quote_formula" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="显示"><el-switch v-model="form.is_visible" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="固定"><el-switch v-model="form.is_fixed" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注说明"><el-input v-model="form.remark" type="textarea" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="验收说明"><el-input v-model="form.acceptance_remark" type="textarea" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="发包备注"><el-input v-model="form.contract_remark" type="textarea" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="其他备注"><el-input v-model="form.other_remark" type="textarea" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showColumnDialog" title="列设置" width="760px">
      <div class="sort-bar">
        <el-switch v-model="enableColumnSort" />
        <span>开启排序/关闭排序</span>
        <span class="tip">打开排序后，拖动下面表格中的行即可实现排序</span>
      </div>
      <div class="column-head">
        <span class="w-name">显示名称</span>
        <span class="w-edit">修改名称</span>
        <span class="w-width">默认宽度</span>
        <span class="w-toggle">显示/隐藏</span>
        <span class="w-toggle">列固定</span>
        <span class="w-sort">排序</span>
      </div>
      <div
        v-for="(row, index) in columnSettings"
        :key="row.key"
        class="column-row"
        :class="{ sortable: enableColumnSort, dragging: draggingIndex === index }"
        :draggable="enableColumnSort"
        @dragstart="handleDragStart(index)"
        @dragover.prevent="handleDragOver(index)"
        @drop.prevent="handleDrop(index)"
      >
        <span class="w-name">{{ row.title }}</span>
        <span class="w-edit"><el-input v-model="row.title" size="small" /></span>
        <span class="w-width"><el-input-number v-model="row.width" :min="80" :max="500" :step="10" size="small" /></span>
        <span class="w-toggle"><el-switch v-model="row.visible" /></span>
        <span class="w-toggle"><el-switch v-model="row.fixed" /></span>
        <span class="w-sort">
          <el-button size="small" text :disabled="index === 0" @click="moveColumn(index, -1)">上移</el-button>
          <el-button size="small" text :disabled="index === columnSettings.length - 1" @click="moveColumn(index, 1)">下移</el-button>
        </span>
      </div>
      <template #footer>
        <el-button @click="showColumnDialog = false">关闭</el-button>
        <el-button type="primary" @click="saveColumnSettings">应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const tableData = ref([])
const showEditDialog = ref(false)
const showColumnDialog = ref(false)
const isEdit = ref(false)
const enableColumnSort = ref(false)
const draggingIndex = ref(-1)
const searchForm = reactive({ keyword: '', category: '' })

const defaultColumns = [
  { key: 'id', title: '编号', width: 80, visible: true, fixed: true },
  { key: 'name', title: '名称', width: 150, visible: true, fixed: true },
  { key: 'original_price', title: '原价', width: 100, visible: true, fixed: false },
  { key: 'cost_price', title: '核算价', width: 100, visible: true, fixed: false },
  { key: 'cost_price2', title: '成本价', width: 100, visible: true, fixed: false },
  { key: 'quote_price', title: '报价', width: 100, visible: true, fixed: false },
  { key: 'contract_price', title: '发包价', width: 100, visible: true, fixed: false },
  { key: 'quote_unit', title: '报价单位', width: 100, visible: true, fixed: false },
  { key: 'exchange_rate', title: '兑换比例', width: 100, visible: false, fixed: false },
  { key: 'purchase_unit', title: '采购单位', width: 100, visible: false, fixed: false },
  { key: 'loss_rate', title: '损耗比例', width: 100, visible: false, fixed: false },
  { key: 'loss_amount', title: '损耗金额', width: 100, visible: false, fixed: false },
  { key: 'warranty_period', title: '保修时长', width: 100, visible: false, fixed: false },
  { key: 'stock_period', title: '备货周期', width: 100, visible: false, fixed: false },
  { key: 'specification', title: '规格', width: 120, visible: true, fixed: false },
  { key: 'model', title: '型号', width: 120, visible: true, fixed: false },
  { key: 'color', title: '颜色', width: 100, visible: true, fixed: false },
  { key: 'spec_alternative', title: '规格备选', width: 100, visible: false, fixed: false },
  { key: 'model_alternative', title: '型号备选', width: 100, visible: false, fixed: false },
  { key: 'color_alternative', title: '颜色备选', width: 100, visible: false, fixed: false },
  { key: 'brand', title: '品牌', width: 120, visible: true, fixed: false },
  { key: 'sort_order', title: '排序', width: 80, visible: true, fixed: false },
  { key: 'remark', title: '备注说明', width: 200, visible: true, fixed: false },
  { key: 'acceptance_remark', title: '验收说明', width: 200, visible: true, fixed: false },
  { key: 'contract_remark', title: '发包备注', width: 180, visible: false, fixed: false },
  { key: 'other_remark', title: '其他备注', width: 180, visible: true, fixed: false },
  { key: 'position', title: '位置', width: 100, visible: false, fixed: false },
  { key: 'package_name', title: '套系', width: 120, visible: true, fixed: false },
  { key: 'upgrade_profit_rate', title: '升级利润率', width: 110, visible: false, fixed: false },
  { key: 'internal_control_price', title: '内控单价', width: 100, visible: false, fixed: false },
  { key: 'combo', title: '组合', width: 100, visible: false, fixed: false },
  { key: 'limit_formula', title: '限量公式', width: 120, visible: false, fixed: false },
  { key: 'quote_formula', title: '报价量公式', width: 120, visible: false, fixed: false },
  { key: 'code', title: '系统编号', width: 100, visible: true, fixed: false },
  { key: 'category', title: '类别', width: 100, visible: true, fixed: false }
]

const columnSettings = ref(JSON.parse(localStorage.getItem('main-material-columns') || JSON.stringify(defaultColumns)))

const form = reactive({
  id: null,
  code: '',
  name: '',
  original_price: 0,
  cost_price: 0,
  cost_price2: 0,
  quote_price: 0,
  contract_price: 0,
  quote_unit: '片',
  exchange_rate: 1,
  purchase_unit: '',
  loss_rate: 0,
  loss_amount: 0,
  warranty_period: '',
  stock_period: '',
  specification: '',
  model: '',
  color: '',
  spec_alternative: '',
  model_alternative: '',
  color_alternative: '',
  brand: '',
  sort_order: 0,
  remark: '',
  acceptance_remark: '',
  contract_remark: '',
  other_remark: '',
  position: '',
  package_name: '',
  upgrade_profit_rate: 0,
  internal_control_price: 0,
  combo: '',
  limit_formula: '',
  quote_formula: '',
  category: '',
  is_visible: 1,
  is_fixed: 0
})

const visibleColumns = computed(() => columnSettings.value.filter(c => c.visible))
const categoryOptions = ref([])
const pagination = reactive({ page: 1, limit: 20, total: 0 })

const formatMoney = (value) => Number(value || 0).toFixed(2)

const loadData = async () => {
  const params = { ...searchForm, page: pagination.page, limit: pagination.limit }
  const res = await axios.get('/api/main-materials', { params })
  tableData.value = res.data.list || []
  pagination.total = res.data.total || 0
  categoryOptions.value = [...new Set(tableData.value.map(item => item.category).filter(Boolean))]
}

const resetForm = () => {
  Object.assign(form, {
    id: null, code: '', name: '', original_price: 0, cost_price: 0, cost_price2: 0, quote_price: 0, contract_price: 0,
    quote_unit: '片', exchange_rate: 1, purchase_unit: '', loss_rate: 0, loss_amount: 0, warranty_period: '', stock_period: '',
    specification: '', model: '', color: '', spec_alternative: '', model_alternative: '', color_alternative: '', brand: '',
    sort_order: 0, remark: '', acceptance_remark: '', contract_remark: '', other_remark: '', position: '', package_name: '',
    upgrade_profit_rate: 0, internal_control_price: 0, combo: '', limit_formula: '', quote_formula: '', category: '',
    is_visible: 1, is_fixed: 0
  })
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  showEditDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  showEditDialog.value = true
}

const handleSave = async () => {
  if (!form.name) {
    ElMessage.warning('请填写主材名称')
    return
  }
  if (isEdit.value) {
    await axios.put(`/api/main-materials/${form.id}`, form)
    ElMessage.success('更新成功')
  } else {
    await axios.post('/api/main-materials', form)
    ElMessage.success('新增成功')
  }
  showEditDialog.value = false
  loadData()
}

const handleDelete = async (id) => {
  await ElMessageBox.confirm('确认删除该主材吗？', '提示', { type: 'warning' })
  await axios.delete(`/api/main-materials/${id}`)
  ElMessage.success('删除成功')
  loadData()
}

const moveColumn = (index, offset) => {
  if (!enableColumnSort.value) return
  const target = index + offset
  if (target < 0 || target >= columnSettings.value.length) return
  const list = [...columnSettings.value]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  columnSettings.value = list
}

const handleDragStart = (index) => {
  if (!enableColumnSort.value) return
  draggingIndex.value = index
}

const handleDragOver = (index) => {
  if (!enableColumnSort.value) return
  if (draggingIndex.value === index || draggingIndex.value < 0) return
}

const handleDrop = (index) => {
  if (!enableColumnSort.value) return
  const from = draggingIndex.value
  if (from < 0 || from === index) {
    draggingIndex.value = -1
    return
  }
  const list = [...columnSettings.value]
  const [item] = list.splice(from, 1)
  list.splice(index, 0, item)
  columnSettings.value = list
  draggingIndex.value = -1
}

const saveColumnSettings = () => {
  localStorage.setItem('main-material-columns', JSON.stringify(columnSettings.value))
  showColumnDialog.value = false
  ElMessage.success('列设置已保存')
}

const resetSearch = () => {
  searchForm.keyword = ''
  searchForm.category = ''
  loadData()
}

const handleImportSuccess = (res) => {
  ElMessage.success(`导入成功，共 ${res.count || 0} 条`)
  loadData()
}

const handleImportError = (error) => {
  const msg = error?.response?.data?.message || error?.message || '导入失败'
  ElMessage.error(msg)
}

const handleExport = async () => {
  const resp = await axios.get('/api/main-materials/export', { responseType: 'blob' })
  const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '主材管理导出.xlsx'
  link.click()
  window.URL.revokeObjectURL(url)
}

onMounted(async () => {
  loadData()
  const res = await axios.get('/api/main-materials/categories')
  categoryOptions.value = res.data || []
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.search-form {
  margin-bottom: 12px;
}
.sort-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.tip {
  color: #909399;
}
.column-head {
  display: grid;
  grid-template-columns: 1.5fr 1.6fr 1.2fr 0.9fr 0.9fr 1fr;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f7fa;
  color: #606266;
  border: 1px solid #ebeef5;
  border-bottom: none;
  font-size: 13px;
}
.column-row {
  display: grid;
  grid-template-columns: 1.5fr 1.6fr 1.2fr 0.9fr 0.9fr 1fr;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-top: none;
}
.column-row.sortable {
  cursor: move;
}
.column-row.dragging {
  opacity: 0.6;
  background: #ecf5ff;
}
.w-name,
.w-edit,
.w-width,
.w-toggle,
.w-sort {
  min-width: 0;
}
</style>
