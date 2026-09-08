<template>
  <div class="cost-control">
    <h2>💹 成本管控</h2>
    <el-card>
      <el-form :inline="true">
        <el-form-item label="项目">
          <el-select v-model="searchForm.project_id" placeholder="请选择项目" clearable style="width: 200px;">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="请选择" clearable>
            <el-option label="人工成本" value="人工成本" />
            <el-option label="材料成本" value="材料成本" />
            <el-option label="管理费" value="管理费" />
            <el-option label="其他支出" value="其他支出" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">新增成本</el-button>
        </el-form-item>
      </el-form>

      <!-- 成本汇总 -->
      <el-row :gutter="20" style="margin: 20px 0;">
        <el-col :span="6">
          <el-card class="summary-card">
            <div class="summary-title">总成本</div>
            <div class="summary-value">¥{{ totalCost.toLocaleString() }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="summary-card">
            <div class="summary-title">人工成本</div>
            <div class="summary-value labor">¥{{ laborCost.toLocaleString() }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="summary-card">
            <div class="summary-title">材料成本</div>
            <div class="summary-value material">¥{{ materialCost.toLocaleString() }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="summary-card">
            <div class="summary-title">其他成本</div>
            <div class="summary-value other">¥{{ otherCost.toLocaleString() }}</div>
          </el-card>
        </el-col>
      </el-row>

      <el-table :data="tableData" border style="width: 100%;">
        <el-table-column prop="project_name" label="项目" min-width="150" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="明细分类" width="100" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold;">¥{{ row.amount?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="date" label="支出日期" width="100" />
        <el-table-column prop="operator" label="经手人" width="80" />
        <el-table-column prop="invoice_status" label="发票状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.invoice_status === '已开票' ? 'success' : 'warning'">{{ row.invoice_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新增成本记录" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="项目">
          <el-select v-model="form.project_id" @change="onProjectChange" style="width: 100%">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="成本类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="人工成本" value="人工成本" />
            <el-option label="材料成本" value="材料成本" />
            <el-option label="管理费" value="管理费" />
            <el-option label="其他支出" value="其他支出" />
          </el-select>
        </el-form-item>
        <el-form-item label="明细分类">
          <el-input v-model="form.category" placeholder="如: 水电材料、木工工资等" />
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="支出日期">
          <el-date-picker v-model="form.date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="经手人">
          <el-input v-model="form.operator" />
        </el-form-item>
        <el-form-item label="发票状态">
          <el-select v-model="form.invoice_status" style="width: 100%">
            <el-option label="未开票" value="未开票" />
            <el-option label="已开票" value="已开票" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const tableData = ref([])
const projects = ref([])
const searchForm = ref({ project_id: '', type: '' })
const dialogVisible = ref(false)
const form = ref({ project_id: null, project_name: '', type: '', category: '', amount: 0, date: new Date(), operator: '', invoice_status: '未开票', remark: '' })

const totalCost = computed(() => tableData.value.reduce((sum, r) => sum + (r.amount || 0), 0))
const laborCost = computed(() => tableData.value.filter(r => r.type === '人工成本').reduce((sum, r) => sum + (r.amount || 0), 0))
const materialCost = computed(() => tableData.value.filter(r => r.type === '材料成本').reduce((sum, r) => sum + (r.amount || 0), 0))
const otherCost = computed(() => tableData.value.filter(r => !['人工成本', '材料成本'].includes(r.type)).reduce((sum, r) => sum + (r.amount || 0), 0))

const getTypeColor = (type) => {
  const map = { '人工成本': 'warning', '材料成本': 'primary', '管理费': 'info', '其他支出': '' }
  return map[type] || ''
}

const loadData = async () => {
  try {
    const [costRes, projectRes] = await Promise.all([fetch('/api/cost-records'), fetch('/api/projects')])
    let data = await costRes.json()
    projects.value = await projectRes.json()
    if (searchForm.value.project_id) data = data.filter(d => d.project_id === searchForm.value.project_id)
    if (searchForm.value.type) data = data.filter(d => d.type === searchForm.value.type)
    tableData.value = data
  } catch (error) { ElMessage.error('加载失败') }
}

const onProjectChange = (projectId) => {
  const project = projects.value.find(p => p.id === projectId)
  if (project) form.value.project_name = project.name
}

const handleAdd = () => {
  form.value = { project_id: null, project_name: '', type: '材料成本', category: '', amount: 0, date: new Date(), operator: '', invoice_status: '未开票', remark: '' }
  dialogVisible.value = true
}

const handleSave = async () => {
  try {
    await fetch('/api/cost-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
    ElMessage.success('保存成功'); dialogVisible.value = false; loadData()
  } catch (error) { ElMessage.error('保存失败') }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除吗?', '提示', { type: 'warning' })
    await fetch(`/api/cost-records/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功'); loadData()
  } catch (error) { if (error !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(loadData)
</script>

<style scoped>
.cost-control { padding: 20px; }
.summary-card { text-align: center; padding: 10px; }
.summary-title { font-size: 14px; color: #666; }
.summary-value { font-size: 24px; font-weight: bold; color: #f56c6c; margin-top: 10px; }
.summary-value.labor { color: #e6a23c; }
.summary-value.material { color: #409eff; }
.summary-value.other { color: #909399; }
</style>
