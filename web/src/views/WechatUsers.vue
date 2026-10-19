<template>
  <div class="wechat-users">
    <!-- 统计卡片 -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-icon total"><el-icon><User /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">微信客户总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon mini"><el-icon><ChatDotSquare /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.mini }}</div>
          <div class="stat-label">小程序来源</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon mp"><el-icon><Promotion /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.mp }}</div>
          <div class="stat-label">公众号来源</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon phone"><el-icon><Iphone /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.phoneBound }}</div>
          <div class="stat-label">已绑手机号</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon link"><el-icon><Link /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.linked }}</div>
          <div class="stat-label">已关联客户</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon today"><el-icon><Calendar /></el-icon></div>
        <div class="stat-body">
          <div class="stat-value">{{ stats.today }}</div>
          <div class="stat-label">今日新增</div>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <el-card>
      <template #header>
        <div class="card-header">
          <span>微信客户</span>
          <div class="header-actions">
            <el-input
              v-model="keyword"
              placeholder="搜索昵称 / 手机 / OpenID / 客户姓名"
              style="width: 280px; margin-right: 10px;"
              clearable
              @clear="handleSearch"
              @keyup.enter="handleSearch"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-select v-model="filterType" placeholder="绑定渠道" clearable style="width: 120px; margin-right: 10px;" @change="handleSearch">
              <el-option label="全部" value="" />
              <el-option label="小程序" value="mini" />
              <el-option label="公众号" value="mp" />
            </el-select>
            <el-select v-model="filterLinked" placeholder="关联状态" clearable style="width: 120px; margin-right: 10px;" @change="handleSearch">
              <el-option label="全部" value="" />
              <el-option label="已关联客户" value="1" />
              <el-option label="未关联" value="0" />
            </el-select>
            <el-button @click="loadList">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="list" style="width: 100%" v-loading="loading" empty-text="暂无微信客户">
        <el-table-column label="头像" width="72" align="center">
          <template #default="{ row }">
            <el-avatar v-if="row.avatar" :src="row.avatar" :size="40" />
            <el-avatar v-else :size="40" class="avatar-fallback">
              {{ (row.nickname || '微').slice(0, 1) }}
            </el-avatar>
          </template>
        </el-table-column>

        <el-table-column label="微信昵称" min-width="130">
          <template #default="{ row }">
            <span>{{ row.nickname || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="手机号" width="130">
          <template #default="{ row }">
            <span v-if="row.phone">{{ row.phone }}</span>
            <span v-else class="muted">未绑定</span>
          </template>
        </el-table-column>

        <el-table-column label="绑定渠道" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.mini_openid" type="warning" size="small" style="margin-right: 4px;">小程序</el-tag>
            <el-tag v-if="row.mp_openid" type="success" size="small">公众号</el-tag>
            <span v-if="!row.mp_openid && !row.mini_openid" class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="小程序 OpenID" min-width="200">
          <template #default="{ row }">
            <div v-if="row.mini_openid" class="openid-cell">
              <span class="openid-text" :title="row.mini_openid">{{ row.mini_openid }}</span>
              <el-button link size="small" @click="copyText(row.mini_openid)">复制</el-button>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="公众号 OpenID" min-width="200">
          <template #default="{ row }">
            <div v-if="row.mp_openid" class="openid-cell">
              <span class="openid-text" :title="row.mp_openid">{{ row.mp_openid }}</span>
              <el-button link size="small" @click="copyText(row.mp_openid)">复制</el-button>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="关联客户" width="150">
          <template #default="{ row }">
            <div v-if="row.customer_name">
              <div>{{ row.customer_name }}</div>
              <div class="sub-text">{{ row.customer_no || row.customer_phone || '' }}</div>
            </div>
            <span v-else class="muted">未关联</span>
          </template>
        </el-table-column>

        <el-table-column label="绑定时间" width="150">
          <template #default="{ row }">
            {{ fmtTime(row.bind_time || row.create_time) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="viewUser(row)">查看</el-button>
            <el-button size="small" type="danger" link v-if="userStore.isAdmin" @click="unbindUser(row)">解绑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="showDetail" title="微信客户详情" width="680px" destroy-on-close>
      <div v-if="current" class="detail-wrap">
        <div class="detail-head">
          <el-avatar v-if="current.avatar" :src="current.avatar" :size="72" />
          <el-avatar v-else :size="72" class="avatar-fallback">
            {{ (current.nickname || '微').slice(0, 1) }}
          </el-avatar>
          <div class="detail-head-info">
            <div class="detail-name">{{ current.nickname || '未填写昵称' }}</div>
            <div class="detail-sub">
              <el-tag v-if="current.mini_openid" type="warning" size="small">小程序</el-tag>
              <el-tag v-if="current.mp_openid" type="success" size="small" style="margin-left: 4px;">公众号</el-tag>
              <span v-if="current.phone" class="detail-phone">{{ current.phone }}</span>
            </div>
          </div>
        </div>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="手机号">{{ current.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ genderText(current.gender) }}</el-descriptions-item>
          <el-descriptions-item label="关联客户">
            <span v-if="current.customer_name">
              {{ current.customer_name }}
              <span class="sub-text" v-if="current.customer_phone">（{{ current.customer_phone }}）</span>
            </span>
            <span v-else class="muted">未关联</span>
          </el-descriptions-item>
          <el-descriptions-item label="客户编号">{{ current.customer_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="员工">{{ current.employee_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="绑定时间">{{ fmtTime(current.bind_time) }}</el-descriptions-item>
          <el-descriptions-item label="首次创建">{{ fmtTime(current.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="最近更新">{{ fmtTime(current.update_time) }}</el-descriptions-item>
          <el-descriptions-item label="小程序 OpenID" :span="2">
            <div class="openid-cell">
              <span class="openid-text" :title="current.mini_openid">{{ current.mini_openid || '-' }}</span>
              <el-button v-if="current.mini_openid" link size="small" @click="copyText(current.mini_openid)">复制</el-button>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="公众号 OpenID" :span="2">
            <div class="openid-cell">
              <span class="openid-text" :title="current.mp_openid">{{ current.mp_openid || '-' }}</span>
              <el-button v-if="current.mp_openid" link size="small" @click="copyText(current.mp_openid)">复制</el-button>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="UnionID" :span="2">
            <div class="openid-cell">
              <span class="openid-text" :title="current.unionid">{{ current.unionid || '-' }}</span>
              <el-button v-if="current.unionid" link size="small" @click="copyText(current.unionid)">复制</el-button>
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

// ============ 列表状态 ============
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterType = ref('')
const filterLinked = ref('')

// ============ 统计 ============
const stats = reactive({ total: 0, mini: 0, mp: 0, phoneBound: 0, linked: 0, today: 0 })

// ============ 详情 ============
const showDetail = ref(false)
const current = ref(null)

// ============ 方法 ============
const loadList = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (filterType.value) params.type = filterType.value
    if (filterLinked.value !== '') params.linked = filterLinked.value
    const res = await axios.get('/api/wechat/users', { params })
    list.value = res.data.list || []
    total.value = res.data.total || 0
    if (res.data.stats) Object.assign(stats, res.data.stats)
  } catch (e) {
    ElMessage.error('加载微信客户失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  page.value = 1
  loadList()
}

const viewUser = async (row) => {
  try {
    const res = await axios.get(`/api/wechat/users/${row.id}`)
    current.value = res.data
    showDetail.value = true
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

const unbindUser = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要解绑「${row.nickname || row.phone || '该用户'}」吗？解绑后该微信将无法自动登录。`,
      '确认解绑',
      { type: 'warning', confirmButtonText: '确定解绑', cancelButtonText: '取消' }
    )
    await axios.delete(`/api/wechat/bind/${row.id}`)
    ElMessage.success('解绑成功')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('解绑失败')
  }
}

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch (e) {
    ElMessage.warning('复制失败，请手动选择')
  }
}

const fmtTime = (v) => {
  if (!v) return '-'
  let s = String(v).trim()
  // 后端统一用 toISOString() 写库（UTC），数据库连接开了 dateStrings，
  // 读出来是 "YYYY-MM-DD HH:mm:ss" 的 UTC 字符串 —— 按 UTC 解析再转本地，否则会少 8 小时
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(v).slice(0, 19)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const genderText = (g) => (g === 1 ? '男' : g === 2 ? '女' : '未知')

onMounted(loadList)
</script>

<style scoped>
.wechat-users {
  padding: 0;
}

/* 统计卡片 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  flex-shrink: 0;
}
.stat-icon.total { background: linear-gradient(135deg, #409eff, #6aa9ff); }
.stat-icon.mini  { background: linear-gradient(135deg, #07c160, #3ddc84); }
.stat-icon.mp    { background: linear-gradient(135deg, #e6a23c, #f3c078); }
.stat-icon.phone { background: linear-gradient(135deg, #909399, #b1b3b8); }
.stat-icon.link  { background: linear-gradient(135deg, #9b59b6, #b98ad1); }
.stat-icon.today { background: linear-gradient(135deg, #f56c6c, #f89c9c); }

.stat-body { min-width: 0; }
.stat-value { font-size: 22px; font-weight: 600; line-height: 1.2; color: #303133; }
.stat-label { font-size: 12px; color: #909399; margin-top: 2px; white-space: nowrap; }

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

/* 表格内元素 */
.avatar-fallback {
  background: #07c160;
  color: #fff;
  font-size: 16px;
}
.muted { color: #c0c4cc; }
.sub-text { font-size: 12px; color: #909399; }

.openid-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.openid-text {
  font-family: Menlo, Consolas, monospace;
  font-size: 11px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 详情弹窗 */
.detail-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}
.detail-head-info { min-width: 0; }
.detail-name { font-size: 18px; font-weight: 600; color: #303133; }
.detail-sub { margin-top: 6px; display: flex; align-items: center; }
.detail-phone { margin-left: 10px; font-size: 13px; color: #606266; }

@media (max-width: 1400px) {
  .stat-row { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
