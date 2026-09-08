<template>
  <div class="customers">
    <!-- 客户列表 -->
    <el-card>
      <template #header>
        <div class="card-header">
          <span>客户列表</span>
          <div class="header-actions">
            <el-input 
              v-model="searchKeyword" 
              placeholder="搜索客户姓名/手机/地址" 
              style="width: 250px; margin-right: 10px;"
              clearable
              @clear="handleSearch"
              @keyup.enter="handleSearch"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-button type="primary" @click="openAddDialog">
              <el-icon><Plus /></el-icon>
              新增客户
            </el-button>
          </div>
        </div>
      </template>
      
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select v-model="filterStatus" placeholder="跟进状态" clearable style="width: 120px;">
          <el-option label="全部" value="" />
          <el-option label="新客户" value="新客户" />
          <el-option label="跟进中" value="跟进中" />
          <el-option label="量房中" value="量房中" />
          <el-option label="设计中" value="设计中" />
          <el-option label="预算中" value="预算中" />
          <el-option label="已签约" value="已签约" />
          <el-option label="已流失" value="已流失" />
        </el-select>
        <el-select v-model="filterSource" placeholder="来源" clearable style="width: 120px;">
          <el-option label="全部" value="" />
          <el-option label="自然到访" value="自然到访" />
          <el-option label="电话咨询" value="电话咨询" />
          <el-option label="网络推广" value="网络推广" />
          <el-option label="老客户推荐" value="老客户推荐" />
          <el-option label="异业联盟" value="异业联盟" />
          <el-option label="活动" value="活动" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px;"
        />
        <el-button @click="resetFilters">重置</el-button>
      </div>
      
      <el-table :data="filteredCustomerList" style="width: 100%" v-loading="loading">
        <el-table-column prop="customer_no" label="编号" width="120" />
        <el-table-column prop="name" label="客户姓名" width="100" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column prop="source" label="来源" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.source || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">{{ row.status || '新客户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="entry_date" label="录入日期" width="120" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="primary" link @click="handleView(row)">查看</el-button>
            <el-button size="small" type="danger" link @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 添加/编辑客户弹窗 -->
    <el-dialog 
      v-model="showDialog" 
      :title="isEdit ? '编辑客户' : '添加客户'" 
      width="900px" 
      :close-on-click-modal="false"
      destroy-on-close
      class="customer-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="customer-form">
        
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">基本信息</div>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="编号" prop="customer_no">
                <el-input v-model="form.customer_no" placeholder="不填写系统自动生成" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="手机" prop="phone">
                <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="客户姓名" prop="name">
                <el-input v-model="form.name" placeholder="请输入客户姓名" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="性别" prop="gender">
                <el-radio-group v-model="form.gender">
                  <el-radio label="男">男</el-radio>
                  <el-radio label="女">女</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="来源" prop="source">
                <el-select v-model="form.source" placeholder="请选择" style="width: 100%">
                  <el-option label="自然到访" value="自然到访" />
                  <el-option label="电话咨询" value="电话咨询" />
                  <el-option label="网络推广" value="网络推广" />
                  <el-option label="老客户推荐" value="老客户推荐" />
                  <el-option label="异业联盟" value="异业联盟" />
                  <el-option label="活动" value="活动" />
                  <el-option label="其他" value="其他" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="跟进状态" prop="status">
                <el-select v-model="form.status" placeholder="请选择" style="width: 100%">
                  <el-option label="新客户" value="新客户" />
                  <el-option label="跟进中" value="跟进中" />
                  <el-option label="量房中" value="量房中" />
                  <el-option label="设计中" value="设计中" />
                  <el-option label="预算中" value="预算中" />
                  <el-option label="已签约" value="已签约" />
                  <el-option label="已流失" value="已流失" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 标签 -->
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="标签">
                <div class="tags-row">
                  <el-tag
                    v-for="tag in form.tags"
                    :key="tag"
                    closable
                    @close="removeTag(tag)"
                    style="margin-right: 8px;"
                  >{{ tag }}</el-tag>
                  <el-input
                    v-if="showTagInput"
                    ref="tagInputRef"
                    v-model="newTag"
                    size="small"
                    style="width: 100px;"
                    @keyup.enter="addTag"
                    @blur="addTag"
                  />
                  <el-button v-else size="small" @click="showTagInput = true">+ 标签</el-button>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </div>
        
      </el-form>
      
      <template #footer>
        <el-button @click="showDialog = false">取 消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">
          <el-icon v-if="!submitLoading"><Check /></el-icon>
          提 交
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 查看客户详情 -->
    <el-dialog v-model="showViewDialog" title="客户详情" width="800px" destroy-on-close>
      <el-descriptions :column="2" border v-if="currentCustomer">
        <el-descriptions-item label="编号">{{ currentCustomer.customer_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机">{{ currentCustomer.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户姓名">{{ currentCustomer.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ currentCustomer.gender || '-' }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ currentCustomer.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentCustomer.status)">{{ currentCustomer.status || '新客户' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="进入时间">{{ currentCustomer.entry_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="录入时间">{{ currentCustomer.create_time || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { customerApi } from '../utils/api'

// ============ 状态 ============
const loading = ref(false)
const submitLoading = ref(false)
const showDialog = ref(false)
const showViewDialog = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const tagInputRef = ref(null)
const showTagInput = ref(false)
const newTag = ref('')
const currentCustomer = ref(null)
const employeeList = ref([])
const token = localStorage.getItem('token') || ''

// ============ 搜索和筛选 ============
const searchKeyword = ref('')
const filterStatus = ref('')
const filterSource = ref('')
const filterDateRange = ref(null)

// ============ 分页 ============
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// ============ 客户列表 ============
const customerList = ref([])

// ============ 表单 ============
const form = reactive({
  id: null,
  customer_no: '',
  phone: '',
  name: '',
  gender: '男',
  source: '',
  status: '新客户',
  entry_date: new Date().toISOString().split('T')[0],
  contact_name2: '',
  contact_phone2: '',
  other_phone: '',
  email: '',
  qq: '',
  provider: '',
  tags: []
})

// ============ 表单验证 ============
const rules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入客户姓名', trigger: 'blur' }
  ]
}

// ============ 计算属性 ============
const filteredCustomerList = computed(() => {
  let list = customerList.value
  
  // 关键词搜索
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(c => 
      (c.name && c.name.toLowerCase().includes(kw)) ||
      (c.phone && c.phone.includes(kw))
    )
  }
  
  // 状态筛选
  if (filterStatus.value) {
    list = list.filter(c => c.status === filterStatus.value)
  }
  
  // 来源筛选
  if (filterSource.value) {
    list = list.filter(c => c.source === filterSource.value)
  }
  
  // 日期筛选
  if (filterDateRange.value && filterDateRange.value.length === 2) {
    const [start, end] = filterDateRange.value
    list = list.filter(c => c.entry_date && c.entry_date >= start && c.entry_date <= end)
  }
  
  return list
})

// ============ 方法 ============
const getStatusType = (status) => {
  const types = {
    '新客户': 'info',
    '跟进中': 'primary',
    '量房中': 'warning',
    '设计中': 'warning',
    '预算中': 'warning',
    '已签约': 'success',
    '已流失': 'danger'
  }
  return types[status] || 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await customerApi.list()
    customerList.value = Array.isArray(res) ? res : (res.data || [])
    pagination.total = filteredCustomerList.value.length
  } catch (error) {
    console.error('加载客户列表失败:', error)
  } finally {
    loading.value = false
  }
}

const loadEmployees = async () => {
  try {
    const res = await fetch('/api/employees')
      .then(r => r.json())
      .catch(() => ({ data: [] }))
    employeeList.value = res.data || []
  } catch (error) {
    console.error('加载员工列表失败:', error)
  }
}

const openAddDialog = () => {
  isEdit.value = false
  resetForm()
  showDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  showDialog.value = true
}

const handleView = (row) => {
  currentCustomer.value = row
  showViewDialog.value = true
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该客户吗？删除后无法恢复。', '警告', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消'
    })
    await customerApi.delete(id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    submitLoading.value = true
    
    if (isEdit.value) {
      await customerApi.update(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await customerApi.create(form)
      ElMessage.success('添加成功')
    }
    
    showDialog.value = false
    loadData()
  } catch (error) {
    if (error !== false) {
      ElMessage.error('操作失败')
    }
  } finally {
    submitLoading.value = false
  }
}

const resetForm = () => {
  Object.keys(form).forEach(key => {
    if (key === 'gender') form[key] = '男'
    else if (key === 'status') form[key] = '新客户'
    else if (key === 'entry_date') form[key] = new Date().toISOString().split('T')[0]
    else if (key === 'tags') form[key] = []
    else form[key] = ''
  })
}

const resetFilters = () => {
  searchKeyword.value = ''
  filterStatus.value = ''
  filterSource.value = ''
  filterDateRange.value = null
}

const handleSearch = () => {
  pagination.page = 1
}

const handleSizeChange = (val) => {
  pagination.pageSize = val
  pagination.page = 1
}

const handlePageChange = (val) => {
  pagination.page = val
}

// 标签操作
const addTag = () => {
  if (newTag.value && !form.tags.includes(newTag.value)) {
    form.tags.push(newTag.value)
  }
  newTag.value = ''
  showTagInput.value = false
}

const removeTag = (tag) => {
  form.tags = form.tags.filter(t => t !== tag)
}

// ============ 生命周期 ============
onMounted(() => {
  loadData()
  loadEmployees()
})
</script>

<style scoped>
.customers {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 15px;
}

/* 弹窗表单样式 */
.customer-form {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 10px;
}

.form-section {
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 20px;
}

.section-title {
  font-weight: bold;
  color: #409eff;
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.address-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.upload-area {
  border: 1px dashed #dcdfe6;
  padding: 15px;
  border-radius: 4px;
  background: #fafafa;
}

.upload-tips {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

/* 响应式 */
@media screen and (max-width: 768px) {
  .filter-bar {
    flex-wrap: wrap;
  }
  
  .customer-form :deep(.el-col) {
    width: 100% !important;
  }
}
</style>

<style>
/* 弹窗全局样式 */
.customer-dialog .el-dialog__body {
  padding: 20px;
}

.customer-form .el-form-item {
  margin-bottom: 14px;
}

.customer-form .el-form-item__label {
  font-weight: normal;
  color: #606266;
}

.customer-form .is-required .el-form-item__label::before {
  content: '*';
  color: #f56c6c;
  margin-right: 4px;
}
</style>
