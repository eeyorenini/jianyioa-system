<template>
  <div class="customers">
    <!-- 页面头 -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">客户列表</h2>
        <p class="page-sub">管理客户档案与跟进状态，共 <b>{{ customerList.length }}</b> 位客户</p>
      </div>
      <div class="page-head-right">
        <el-input
          v-model="searchKeyword"
          class="search-input"
          placeholder="搜索姓名 / 手机号"
          clearable
          @clear="handleSearch"
          @keyup.enter="handleSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button class="btn-add" type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          <span>新增客户</span>
        </el-button>
      </div>
    </div>

    <!-- 概览统计 -->
    <div class="stat-grid">
      <div v-for="s in stats" :key="s.key" class="stat-card">
        <div class="stat-icon" :style="{ background: s.soft }">{{ s.icon }}</div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
        <span class="stat-accent" :style="{ background: s.color }"></span>
      </div>
    </div>

    <!-- 主卡片：筛选 + 表格 -->
    <div class="table-card">
      <div class="filter-bar">
        <div class="filter-item">
          <span class="filter-label">跟进状态</span>
          <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 130px">
            <el-option label="全部" value="" />
            <el-option label="新客户" value="新客户" />
            <el-option label="跟进中" value="跟进中" />
            <el-option label="量房中" value="量房中" />
            <el-option label="设计中" value="设计中" />
            <el-option label="预算中" value="预算中" />
            <el-option label="已签约" value="已签约" />
            <el-option label="已流失" value="已流失" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">客户来源</span>
          <el-select v-model="filterSource" placeholder="全部来源" clearable style="width: 130px">
            <el-option label="全部" value="" />
            <el-option label="自然到访" value="自然到访" />
            <el-option label="自然进店" value="自然进店" />
            <el-option label="电话咨询" value="电话咨询" />
            <el-option label="网络推广" value="网络推广" />
            <el-option label="老客户推荐" value="老客户推荐" />
            <el-option label="异业联盟" value="异业联盟" />
            <el-option label="活动" value="活动" />
            <el-option label="其他" value="其他" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">录入日期</span>
          <el-date-picker
            v-model="filterDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </div>

        <el-button text class="btn-reset" @click="resetFilters">
          <el-icon><RefreshLeft /></el-icon>
          <span>重置</span>
        </el-button>

        <div class="filter-result">
          筛选结果 <b>{{ filteredCustomerList.length }}</b> 条
        </div>
      </div>

      <el-table
        :data="pagedCustomerList"
        class="customer-table"
        v-loading="loading"
        row-key="id"
      >
        <el-table-column label="客户" min-width="200">
          <template #default="{ row }">
            <div class="cust-cell">
              <div class="cust-avatar" :style="{ background: avatarBg(row.name) }">
                {{ firstChar(row.name) }}
              </div>
              <div class="cust-main">
                <div class="cust-name">
                  {{ row.name || '-' }}
                  <el-tag
                    v-if="row.level && row.level !== '普通'"
                    size="small"
                    effect="plain"
                    class="lvl-tag"
                  >{{ row.level }}</el-tag>
                </div>
                <div class="cust-no">{{ row.customer_no || '未编号' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="联系方式" min-width="170">
          <template #default="{ row }">
            <div class="phone-cell">
              <span class="phone-text">{{ row.phone || '-' }}</span>
              <span v-if="row.gender" class="gender-chip" :class="row.gender === '女' ? 'g-f' : 'g-m'">
                {{ row.gender }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="来源" width="118">
          <template #default="{ row }">
            <span class="source-chip" :style="sourceStyle(row.source)">{{ row.source || '未知' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="126">
          <template #default="{ row }">
            <span class="status-pill" :style="statusStyle(row.status)">
              <i class="dot"></i>{{ row.status || '新客户' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="标签" min-width="150">
          <template #default="{ row }">
            <div class="tag-cell">
              <template v-if="parseTags(row.tags).length">
                <el-tag
                  v-for="t in parseTags(row.tags).slice(0, 2)"
                  :key="t"
                  size="small"
                  effect="light"
                  class="soft-tag"
                >{{ t }}</el-tag>
                <el-tooltip
                  v-if="parseTags(row.tags).length > 2"
                  :content="parseTags(row.tags).slice(2).join('、')"
                  placement="top"
                >
                  <span class="tag-more">+{{ parseTags(row.tags).length - 2 }}</span>
                </el-tooltip>
              </template>
              <span v-else class="muted">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="录入日期" width="126">
          <template #default="{ row }">
            <span class="date-cell">{{ row.entry_date || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="146" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-cell">
              <el-tooltip content="查看详情" placement="top" :show-after="300">
                <el-button circle size="small" @click="handleView(row)">
                  <el-icon><View /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top" :show-after="300">
                <el-button circle size="small" type="primary" plain @click="handleEdit(row)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip v-if="userStore.isAdmin" content="删除" placement="top" :show-after="300">
                <el-button circle size="small" type="danger" plain @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <div class="empty-icon">🗂️</div>
            <div class="empty-title">{{ customerList.length ? '没有符合条件的客户' : '还没有客户' }}</div>
            <div class="empty-sub">
              {{ customerList.length ? '试试调整筛选条件，或清空搜索关键词' : '点击右上角「新增客户」开始建立客户档案' }}
            </div>
          </div>
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="filteredCustomerList.length"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </div>

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
                <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" @blur="handlePhoneBlur" />
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
    <el-dialog v-model="showViewDialog" width="760px" destroy-on-close class="detail-dialog">
      <template #header>
        <div v-if="currentCustomer" class="detail-head">
          <div class="detail-avatar" :style="{ background: avatarBg(currentCustomer.name) }">
            {{ firstChar(currentCustomer.name) }}
          </div>
          <div class="detail-head-main">
            <div class="detail-name">
              {{ currentCustomer.name || '-' }}
              <span class="status-pill" :style="statusStyle(currentCustomer.status)">
                <i class="dot"></i>{{ currentCustomer.status || '新客户' }}
              </span>
            </div>
            <div class="detail-meta">
              <span>{{ currentCustomer.customer_no || '未编号' }}</span>
              <span v-if="currentCustomer.phone">{{ currentCustomer.phone }}</span>
              <span v-if="currentCustomer.gender">{{ currentCustomer.gender }}</span>
            </div>
          </div>
        </div>
      </template>

      <el-descriptions :column="2" border v-if="currentCustomer" class="detail-desc">
        <el-descriptions-item label="客户编号">{{ currentCustomer.customer_no || '未编号' }}</el-descriptions-item>
        <el-descriptions-item label="客户姓名">{{ currentCustomer.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ currentCustomer.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ currentCustomer.gender || '-' }}</el-descriptions-item>
        <el-descriptions-item label="来源">
          <span class="source-chip" :style="sourceStyle(currentCustomer.source)">{{ currentCustomer.source || '未知' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="客户等级">{{ currentCustomer.level || '普通' }}</el-descriptions-item>
        <el-descriptions-item label="进入时间">{{ currentCustomer.entry_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="录入时间">{{ currentCustomer.create_time || currentCustomer.created_at || '-' }}</el-descriptions-item>
        <el-descriptions-item label="装修需求" :span="2">{{ currentCustomer.demand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ currentCustomer.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="标签" :span="2">
          <div class="tag-cell">
            <template v-if="parseTags(currentCustomer.tags).length">
              <el-tag v-for="t in parseTags(currentCustomer.tags)" :key="t" size="small" effect="light" class="soft-tag">{{ t }}</el-tag>
            </template>
            <span v-else class="muted">—</span>
          </div>
        </el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="showViewDialog = false">关闭</el-button>
        <el-button type="primary" @click="editFromDetail">编辑该客户</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { customerApi } from '../utils/api'
import { useUserStore } from '../stores/user'

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
const userStore = useUserStore()

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

// 当前页数据（原来是整份列表直接塞进表格，分页只是摆设）
const pagedCustomerList = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize
  return filteredCustomerList.value.slice(start, start + pagination.pageSize)
})

// 筛选后总数变化时收敛页码，避免停留在空白页
// （注意：必须写在 filteredCustomerList 之后，否则 watch 的 getter 立即执行会命中 TDZ）

// 顶部概览统计（纯前端聚合，数据量小不额外打接口）
const stats = computed(() => {
  const list = customerList.value
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = list.filter((c) => String(c.entry_date || c.created_at || '').startsWith(ym)).length
  const following = list.filter((c) => ['跟进中', '量房中', '设计中', '预算中'].includes(c.status)).length
  const signed = list.filter((c) => c.status === '已签约').length
  return [
    { key: 'total', label: '客户总数', value: list.length, icon: '👥', color: '#409EFF', soft: '#ecf5ff' },
    { key: 'month', label: '本月新增', value: thisMonth, icon: '✨', color: '#67C23A', soft: '#f0f9eb' },
    { key: 'following', label: '跟进中', value: following, icon: '🔥', color: '#E6A23C', soft: '#fdf6ec' },
    { key: 'signed', label: '已签约', value: signed, icon: '🏆', color: '#8B5CF6', soft: '#f5f3ff' }
  ]
})

// ============ 展示辅助 ============
// 状态 → 圆点胶囊配色
const STATUS_STYLE = {
  新客户: { color: '#409EFF', bg: '#ecf5ff' },
  跟进中: { color: '#E6A23C', bg: '#fdf6ec' },
  量房中: { color: '#8B5CF6', bg: '#f5f3ff' },
  设计中: { color: '#06B6D4', bg: '#ecfeff' },
  预算中: { color: '#D48806', bg: '#fffbe6' },
  已签约: { color: '#52A32E', bg: '#f0f9eb' },
  已流失: { color: '#909399', bg: '#f4f4f5' }
}
const statusStyle = (status) => {
  const s = STATUS_STYLE[status] || { color: '#909399', bg: '#f4f4f5' }
  return { color: s.color, background: s.bg }
}

// 来源 → 浅色 chip 配色（按来源分配固定色，避免同一来源变来变去）
const SOURCE_COLORS = {
  自然到访: '#409EFF', 自然进店: '#409EFF', 电话咨询: '#06B6D4',
  网络推广: '#8B5CF6', 老客户推荐: '#52A32E', 异业联盟: '#E6A23C',
  活动: '#F56C6C', 其他: '#909399'
}
const sourceStyle = (source) => {
  const c = SOURCE_COLORS[source] || '#909399'
  return { color: c, background: c + '14', borderColor: c + '33' }
}

// 头像取姓氏首字 + 稳定渐变色
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#5B8DEF,#3A6FD8)',
  'linear-gradient(135deg,#57C785,#2BA36A)',
  'linear-gradient(135deg,#F0A04B,#D97C24)',
  'linear-gradient(135deg,#A78BFA,#7C5CE0)',
  'linear-gradient(135deg,#4DD0E1,#22A6B3)',
  'linear-gradient(135deg,#F27D8C,#D9536A)'
]
const firstChar = (name) => (name ? String(name).trim().charAt(0) : '?')
const avatarBg = (name) => {
  const s = String(name || '')
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
  return AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length]
}

// tags 在库里是 JSON 字符串（如 '["价值客户"]'），也可能是数组或空
const parseTags = (tags) => {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  try {
    const arr = JSON.parse(tags)
    return Array.isArray(arr) ? arr : []
  } catch {
    return String(tags).split(',').map((t) => t.trim()).filter(Boolean)
  }
}

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

// 筛选结果变化时同步总数并收敛页码（避免停在空白页）
watch(
  () => filteredCustomerList.value.length,
  (len) => {
    pagination.total = len
    const maxPage = Math.max(1, Math.ceil(len / pagination.pageSize))
    if (pagination.page > maxPage) pagination.page = maxPage
  }
)

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
  // 库里 tags 是 JSON 字符串，直接 Object.assign 会让 form.tags 变成字符串，
  // 后面 form.tags.push 就会报错 —— 这里统一归一成数组
  Object.assign(form, row, { tags: parseTags(row.tags) })
  showDialog.value = true
}

const handleView = (row) => {
  currentCustomer.value = row
  showViewDialog.value = true
}

// 详情弹窗里直接跳到编辑
const editFromDetail = () => {
  const row = currentCustomer.value
  showViewDialog.value = false
  if (row) handleEdit(row)
}

// 电话输入框失焦时实时检查
const handlePhoneBlur = async () => {
  if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) return
  try {
    const res = await customerApi.checkPhone(form.phone)
    if (!res.exists) return
    if (res.code === 'SAME_CREATOR') {
      ElMessage.warning(res.message)
    } else if (res.code === 'UNCLAIMED') {
      ElMessage.info(res.message)
    } else if (res.code === 'DIFFERENT_CREATOR') {
      ElMessage.error(res.message)
    }
  } catch (e) { /* ignore */ }
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
      try {
        await customerApi.create(form)
        ElMessage.success('添加成功')
      } catch (err) {
        // 409 冲突：前端 blur 已经检查过，这里只处理无主客户被认领的情况
        if (err.response?.status === 409 && err.response?.data?.code === 'SAME_CREATOR') {
          const confirm = await ElMessageBox.confirm(
            '此号码已有客户记录，是否更新？',
            '手机号已存在',
            { confirmButtonText: '是，覆盖', cancelButtonText: '否，取消', type: 'warning' }
          ).catch(() => 'cancel')
          if (confirm === 'confirm') {
            await customerApi.overwrite(err.response.data.existing_id, form)
            ElMessage.success('客户信息已更新')
          } else {
            return
          }
        } else {
          throw err
        }
      }
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

/* ==================== 页面头 ==================== */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1E3A5F;
  margin: 0;
}
.page-sub {
  font-size: 13px;
  color: #909399;
  margin: 6px 0 0;
}
.page-sub b { color: #409EFF; font-weight: 600; }
.page-head-right { display: flex; align-items: center; gap: 10px; }
.search-input { width: 260px; }
.search-input :deep(.el-input__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #e4e7ed inset;
}
.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #409EFF inset;
}
.btn-add {
  border-radius: 10px;
  padding: 0 18px;
  height: 34px;
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
}
.btn-add:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 概览统计 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 21, 41, 0.05);
  overflow: hidden;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 21, 41, 0.1);
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  flex-shrink: 0;
}
.stat-body { min-width: 0; }
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.1; }
.stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
.stat-accent {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  opacity: 0.85;
}

/* ==================== 主卡片 ==================== */
.table-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 12px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  flex-wrap: wrap;
}
.filter-item { display: flex; align-items: center; gap: 8px; }
.filter-label { font-size: 13px; color: #606266; white-space: nowrap; }
.btn-reset { color: #909399; }
.btn-reset:hover { color: #409EFF; }
.filter-result {
  margin-left: auto;
  font-size: 12px;
  color: #909399;
}
.filter-result b { color: #409EFF; font-weight: 600; }

/* ==================== 表格 ==================== */
.customer-table { --el-table-border-color: #f0f2f5; }
.customer-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.customer-table :deep(td.el-table__cell) {
  padding: 12px 0;
  border-bottom: 1px solid #f5f7fa;
}
.customer-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: #f5f9ff !important;
}
.customer-table :deep(.el-table__row) { transition: background 0.15s; }

/* 客户单元格 */
.cust-cell { display: flex; align-items: center; gap: 11px; }
.cust-avatar {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}
.cust-main { min-width: 0; }
.cust-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lvl-tag {
  border-radius: 6px;
  transform: scale(0.88);
  transform-origin: left center;
}
.cust-no {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* 联系方式 */
.phone-cell { display: flex; align-items: center; gap: 8px; }
.phone-text {
  font-size: 13px;
  color: #303133;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.3px;
}
.gender-chip {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  line-height: 17px;
}
.gender-chip.g-m { color: #409EFF; background: #ecf5ff; }
.gender-chip.g-f { color: #F56C6C; background: #fef0f0; }

/* 来源 chip */
.source-chip {
  display: inline-block;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  line-height: 18px;
}

/* 状态胶囊 */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
  line-height: 19px;
}
.status-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* 标签 */
.tag-cell { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.soft-tag {
  border: none !important;
  background: #f0f5ff !important;
  color: #4a6fa5 !important;
  border-radius: 6px;
}
.tag-more {
  font-size: 11px;
  color: #909399;
  background: #f4f4f5;
  padding: 1px 6px;
  border-radius: 6px;
  cursor: default;
}
.muted { color: #c0c4cc; }

.date-cell { font-size: 13px; color: #606266; }

/* 操作按钮 */
.action-cell { display: flex; align-items: center; justify-content: center; gap: 6px; }
.action-cell :deep(.el-button) {
  width: 28px;
  height: 28px;
  transition: transform 0.15s;
}
.action-cell :deep(.el-button:hover) { transform: translateY(-1px); }

/* 空状态 */
.empty-state { padding: 44px 0 34px; text-align: center; }
.empty-icon { font-size: 40px; line-height: 1; opacity: 0.75; }
.empty-title { font-size: 14px; font-weight: 600; color: #606266; margin-top: 12px; }
.empty-sub { font-size: 12px; color: #a8abb2; margin-top: 6px; }

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f5f7fa;
}

/* ==================== 详情弹窗 ==================== */
.detail-head { display: flex; align-items: center; gap: 14px; }
.detail-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}
.detail-head-main { min-width: 0; }
.detail-name {
  font-size: 17px;
  font-weight: 700;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-meta { font-size: 12px; color: #909399; margin-top: 5px; }
.detail-meta span + span::before {
  content: '·';
  margin: 0 7px;
  color: #c8ccd4;
}
.detail-desc :deep(.el-descriptions__label) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 500 !important;
  width: 100px;
}
.detail-desc :deep(.el-descriptions__cell) { font-size: 13px; }

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

/* ==================== 响应式 ==================== */
@media screen and (max-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
}
@media screen and (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head-right { flex-wrap: wrap; }
  .search-input { width: 100%; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-value { font-size: 20px; }
  .filter-bar { gap: 10px; }
  .filter-item { width: 100%; }
  .filter-item :deep(.el-select),
  .filter-item :deep(.el-date-editor) { flex: 1; width: 100% !important; }
  .filter-result { margin-left: 0; }
  .table-card { padding: 12px 10px 8px; }
  /* 窄屏下分页条会挤到截断，隐藏每页条数和跳页，只留翻页 */
  .pagination-wrap { justify-content: center; }
  .pagination-wrap :deep(.el-pagination__sizes),
  .pagination-wrap :deep(.el-pagination__jump) { display: none; }
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

/* 窄屏：弹窗被 teleport 到 body，不在 .mobile-main 里，得单独收宽度 */
@media screen and (max-width: 768px) {
  .customer-dialog {
    width: 94% !important;
    margin-top: 8vh !important;
  }
  /* el-col-8 自带 max-width:33.33%，只覆盖 width 没用，三个字段会挤成一行 */
  .customer-form .el-col {
    width: 100% !important;
    max-width: 100% !important;
    flex: 0 0 100% !important;
  }
}
</style>
