<template>
  <div class="page">
    <el-card>
      <template #header>
        <div class="card-header">
          <div>
            <span class="title">外部联系人</span>
            <span class="hint">独立管理外部工人 / 供应商 / 设计师等不参与登录系统的联系人</span>
          </div>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            新增外部联系人
          </el-button>
        </div>
      </template>

      <!-- 筛选 -->
      <el-row :gutter="12" style="margin-bottom: 12px;">
        <el-col :span="6">
          <el-select v-model="filters.category" placeholder="分类" clearable style="width: 100%">
            <el-option label="工人" value="工人" />
            <el-option label="供应商" value="供应商" />
            <el-option label="设计师" value="设计师" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select v-model="filters.is_active" placeholder="状态" clearable style="width: 100%">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-col>
        <el-col :span="8">
          <el-input v-model="filters.search" placeholder="姓名 / 电话 / 公司 / 工种 / 备注 模糊搜索" clearable />
        </el-col>
        <el-col :span="4">
          <el-button @click="loadData">搜索</el-button>
        </el-col>
      </el-row>

      <el-table :data="filteredList" v-loading="loading" border style="width: 100%">
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column label="分类" width="100">
          <template #default="scope">
            <el-tag :type="categoryType(scope.row.category)">{{ scope.row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="company" label="公司/团队" min-width="160" />
        <el-table-column prop="role" label="工种/角色" width="120" />
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'info'" size="small">
              {{ scope.row.is_active ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建人" width="100">
          <template #default="scope">
            <span>{{ scope.row.created_by || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="scope">
            <div class="op-row">
              <el-button size="small" @click="handleEdit(scope.row)">编辑</el-button>
              <el-button size="small" :type="scope.row.is_active ? 'warning' : 'success'" @click="handleToggleActive(scope.row)">
                {{ scope.row.is_active ? '停用' : '启用' }}
              </el-button>
              <el-button type="danger" size="small" @click="handleDelete(scope.row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="isEdit ? '编辑外部联系人' : '新增外部联系人'" width="640px">
      <el-form :model="form" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="姓名" required>
              <el-input v-model="form.name" placeholder="称呼/姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="form.phone" placeholder="联系电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="分类">
              <el-select v-model="form.category" style="width: 100%">
                <el-option label="工人" value="工人" />
                <el-option label="供应商" value="供应商" />
                <el-option label="设计师" value="设计师" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用">
              <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="公司/团队">
              <el-input v-model="form.company" placeholder="所属公司或团队" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工种/角色">
              <el-input v-model="form.role" placeholder="工种 / 角色" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'

const list = ref([])
const loading = ref(false)
const showDialog = ref(false)
const isEdit = ref(false)
const filters = reactive({ category: '', is_active: '', search: '' })

const form = reactive({
  id: null,
  name: '',
  phone: '',
  category: '工人',
  company: '',
  role: '',
  remark: '',
  is_active: 1,
})

const categoryType = (cat) => ({
  '工人': 'primary',
  '供应商': 'success',
  '设计师': 'warning',
  '其他': 'info',
}[cat] || 'info')

// 客户端筛选（搜索是前端再过滤，避免与后端 query 冲突）
const filteredList = computed(() => list.value)

const loadData = async () => {
  loading.value = true
  try {
    const params = {}
    if (filters.category) params.category = filters.category
    if (filters.is_active !== '' && filters.is_active !== null && filters.is_active !== undefined) params.is_active = filters.is_active
    if (filters.search) params.search = filters.search
    const res = await request.get('/external-contacts', { params })
    // request 拦截器已 return response.data → res 就是业务 body { list, total }
    list.value = res?.list || []
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null, name: '', phone: '', category: '工人',
    company: '', role: '', remark: '', is_active: 1,
  })
  showDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    category: row.category || '工人',
    company: row.company || '',
    role: row.role || '',
    remark: row.remark || '',
    is_active: Number(row.is_active) || 1,
  })
  showDialog.value = true
}

const handleSave = async () => {
  if (!form.name) { ElMessage.warning('请输入姓名'); return }
  if (isEdit.value) {
    await request.put(`/external-contacts/${form.id}`, form)
    ElMessage.success('更新成功')
  } else {
    await request.post('/external-contacts', form)
    ElMessage.success('添加成功')
  }
  showDialog.value = false
  loadData()
}

const handleToggleActive = async (row) => {
  const next = row.is_active ? 0 : 1
  await request.put(`/external-contacts/${row.id}`, { is_active: next, name: row.name })
  ElMessage.success(next ? '已启用' : '已停用')
  loadData()
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm(`确认删除「${row.name}」？该操作不可恢复。`, '删除确认', { type: 'warning' })
  await request.delete(`/external-contacts/${row.id}`)
  ElMessage.success('删除成功')
  loadData()
}

onMounted(loadData)
</script>

<style scoped>
.card-header { display: flex; align-items: center; justify-content: space-between; }

/* 操作列：三按钮横排不折行 */
.op-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.op-row .el-button + .el-button { margin-left: 0; }
.title { font-weight: 600; margin-right: 12px; }
.hint { color: #909399; font-size: 12px; }
</style>