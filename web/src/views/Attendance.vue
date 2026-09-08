<template>
  <div class="attendance">
    <h2>⏰ 考勤管理</h2>
    <el-card>
      <el-form :inline="true">
        <el-form-item label="员工">
          <el-select v-model="searchForm.employee_id" placeholder="请选择员工" clearable filterable style="width: 150px;">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="searchForm.date" type="date" placeholder="选择日期" style="width: 150px;" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button type="success" @click="handleAdd">打卡</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="employee_name" label="员工姓名" width="100" />
        <el-table-column prop="date" label="日期" width="100" />
        <el-table-column prop="type" label="考勤类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.type === '上班' ? 'success' : row.type === '下班' ? 'warning' : 'info'">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="check_in_time" label="上班时间" width="100" />
        <el-table-column prop="check_out_time" label="下班时间" width="100" />
        <el-table-column prop="work_hours" label="工时" width="80">
          <template #default="{ row }">
            {{ row.work_hours }}h
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '正常' ? 'success' : row.status === '迟到' ? 'warning' : row.status === '早退' ? 'danger' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 考勤统计 -->
      <el-row :gutter="20" style="margin-top: 20px;">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-num">{{ stats.total }}</div>
            <div class="stat-label">考勤记录</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card normal">
            <div class="stat-num">{{ stats.normal }}</div>
            <div class="stat-label">正常</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card late">
            <div class="stat-num">{{ stats.late }}</div>
            <div class="stat-label">迟到</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card absent">
            <div class="stat-num">{{ stats.absent }}</div>
            <div class="stat-label">缺勤</div>
          </el-card>
        </el-col>
      </el-row>
    </el-card>

    <el-dialog v-model="dialogVisible" title="打卡" width="450px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="员工">
          <el-select v-model="form.employee_id" @change="onEmployeeChange" style="width: 100%" filterable>
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="form.date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="考勤类型">
          <el-radio-group v-model="form.type">
            <el-radio label="上班">上班打卡</el-radio>
            <el-radio label="下班">下班打卡</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="上班时间">
          <el-time-picker v-model="form.check_in_time" placeholder="选择时间" style="width: 100%" />
        </el-form-item>
        <el-form-item label="下班时间">
          <el-time-picker v-model="form.check_out_time" placeholder="选择时间" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="正常" value="正常" />
            <el-option label="迟到" value="迟到" />
            <el-option label="早退" value="早退" />
            <el-option label="缺勤" value="缺勤" />
          </el-select>
        </el-form-item>
        <el-form-item label="工时">
          <el-input-number v-model="form.work_hours" :min="0" :max="24" :step="0.5" style="width: 100%" />
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
const employees = ref([])
const searchForm = ref({ employee_id: '', date: '' })
const dialogVisible = ref(false)
const form = ref({ employee_id: null, employee_name: '', date: new Date(), check_in_time: '', check_out_time: '', work_hours: 8, status: '正常', type: '上班', remark: '' })

const stats = computed(() => {
  const total = tableData.value.length
  const normal = tableData.value.filter(r => r.status === '正常').length
  const late = tableData.value.filter(r => r.status === '迟到').length
  const absent = tableData.value.filter(r => r.status === '缺勤').length
  return { total, normal, late, absent }
})

const formatTime = (time) => {
  if (!time) return ''
  if (typeof time === 'string') return time.substring(0, 5)
  const date = new Date(time)
  return date.toTimeString().substring(0, 5)
}

const loadData = async () => {
  try {
    const [attendanceRes, empRes] = await Promise.all([
      fetch(`/api/attendance?${searchForm.value.employee_id ? 'employee_id=' + searchForm.value.employee_id : ''}`),
      fetch('/api/employees')
    ])
    tableData.value = await attendanceRes.json()
    employees.value = await empRes.json()
    if (searchForm.value.date) {
      const dateStr = new Date(searchForm.value.date).toISOString().split('T')[0]
      tableData.value = tableData.value.filter(r => r.date === dateStr)
    }
  } catch (error) { ElMessage.error('加载失败') }
}

const onEmployeeChange = (empId) => {
  const emp = employees.value.find(e => e.id === empId)
  if (emp) form.value.employee_name = emp.name
}

const handleAdd = () => {
  form.value = { employee_id: null, employee_name: '', date: new Date(), check_in_time: '', check_out_time: '', work_hours: 8, status: '正常', type: '上班', remark: '' }
  dialogVisible.value = true
}

const handleSave = async () => {
  try {
    const data = { ...form.value }
    data.check_in_time = formatTime(data.check_in_time)
    data.check_out_time = formatTime(data.check_out_time)
    data.date = new Date(data.date).toISOString().split('T')[0]
    await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    ElMessage.success('保存成功'); dialogVisible.value = false; loadData()
  } catch (error) { ElMessage.error('保存失败') }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除吗?', '提示', { type: 'warning' })
    await fetch(`/api/attendance/${id}`, { method: 'DELETE' })
    ElMessage.success('删除成功'); loadData()
  } catch (error) { if (error !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(loadData)
</script>

<style scoped>
.attendance { padding: 20px; }
.stat-card { text-align: center; padding: 20px; }
.stat-card .stat-num { font-size: 32px; font-weight: bold; }
.stat-card .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
.stat-card.normal .stat-num { color: #67c23a; }
.stat-card.late .stat-num { color: #e6a23c; }
.stat-card.absent .stat-num { color: #f56c6c; }
</style>
