<template>
  <div class="material-acceptance">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>材料验收</span>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            新增验收
          </el-button>
        </div>
      </template>

      <!-- 筛选 -->
      <div class="filters">
        <el-select
          v-model="filters.project_id"
          placeholder="全部项目"
          clearable
          filterable
          style="width: 220px"
          @change="reload"
        >
          <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="filters.result" placeholder="全部结论" clearable style="width: 180px" @change="reload">
          <el-option v-for="r in RESULTS" :key="r" :label="r" :value="r" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="单号 / 项目 / 供应商"
          clearable
          style="width: 220px"
          @keyup.enter="reload"
        />
        <el-button type="primary" plain @click="reload">查询</el-button>
        <el-button text @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" v-loading="loading" style="width: 100%" empty-text="暂无材料验收记录">
        <el-table-column prop="accept_no" label="单号" width="140" />
        <el-table-column label="项目" min-width="170">
          <template #default="{ row }">
            {{ row.project_name_display || row.project_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="stage" label="施工阶段" width="130" />
        <el-table-column prop="foreman_name" label="验收人" width="100" />
        <el-table-column label="合格 / 不合格" width="150">
          <template #default="{ row }">
            <span class="num pass">{{ row.pass_count || 0 }}</span>
            <span class="sep">/</span>
            <span class="num fail">{{ row.fail_count || 0 }}</span>
            <span class="muted">（共 {{ row.item_count || 0 }} 项）</span>
          </template>
        </el-table-column>
        <el-table-column label="结论" width="170">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row.result)" size="small">{{ row.result || '未填' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="供应商" width="140" show-overflow-tooltip />
        <el-table-column prop="accept_date" label="验收日期" width="110" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openView(row)">查看</el-button>
            <el-button size="small" type="primary" plain @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 新增 / 编辑 / 查看 -->
    <el-dialog
      v-model="dialog.visible"
      :title="dialog.title"
      width="1000px"
      top="4vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="90px" :disabled="dialog.readonly">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="项目" required>
              <el-select
                v-model="form.project_id"
                filterable
                placeholder="选择项目"
                style="width: 100%"
                :disabled="dialog.readonly || !dialog.isCreate"
                @change="onProjectChange"
              >
                <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="验收日期" required>
              <el-date-picker
                v-model="form.accept_date"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="施工阶段" required>
              <el-select v-model="form.stage" placeholder="选择阶段" style="width: 100%">
                <el-option v-for="s in STAGES" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="6">
            <el-form-item label="验收人">
              <el-select v-model="form.foreman_id" placeholder="选择验收人" clearable filterable style="width: 100%">
                <el-option v-for="s in staff" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="供应商">
              <el-select
                v-model="form.supplier_name"
                placeholder="选择或输入"
                clearable
                filterable
                allow-create
                default-first-option
                style="width: 100%"
              >
                <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="送货单号">
              <el-input v-model="form.delivery_no" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="堆放与保护">
              <el-select v-model="form.storage" placeholder="选择" clearable style="width: 100%">
                <el-option v-for="s in STORAGE" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">材料明细</el-divider>

        <el-table :data="form.items" size="small" border empty-text="还没有材料，点下方「添加一行」">
          <el-table-column label="材料名称" min-width="220">
            <template #default="{ row, $index }">
              <el-select
                v-model="row.material_name"
                filterable
                remote
                allow-create
                default-first-option
                :remote-method="searchMaterial"
                :loading="materialLoading"
                placeholder="搜索主材或直接输入"
                style="width: 100%"
                @change="(v) => onPickMaterial($index, v)"
              >
                <el-option v-for="m in materialOptions" :key="m.id" :label="m.name" :value="m.name" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="规格" width="150">
            <template #default="{ row }">
              <el-input v-model="row.spec" placeholder="规格" />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="80">
            <template #default="{ row }">
              <el-input v-model="row.unit" placeholder="单位" />
            </template>
          </el-table-column>
          <el-table-column label="应到" width="100">
            <template #default="{ row }">
              <el-input v-model="row.plan_qty" type="number" placeholder="0" />
            </template>
          </el-table-column>
          <el-table-column label="实到" width="100">
            <template #default="{ row }">
              <el-input v-model="row.actual_qty" type="number" placeholder="0" />
            </template>
          </el-table-column>
          <el-table-column label="结论" width="120">
            <template #default="{ row }">
              <el-select v-model="row.verdict" style="width: 100%">
                <el-option v-for="v in VERDICTS" :key="v" :label="v" :value="v" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="问题标签" width="200">
            <template #default="{ row }">
              <el-select
                v-model="row.problem_tags"
                multiple
                collapse-tags
                placeholder="不合格时选"
                :disabled="row.verdict === '合格'"
                style="width: 100%"
              >
                <el-option v-for="t in TAGS" :key="t" :label="t" :value="t" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeItem($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button size="small" text type="primary" style="margin-top: 8px" @click="addItem">
          + 添加一行
        </el-button>

        <el-divider content-position="left">验收结论</el-divider>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="随货资料">
              <el-select v-model="form.docs" multiple collapse-tags placeholder="可多选" style="width: 100%">
                <el-option v-for="d in DOCS" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="验收结论" required>
              <el-select v-model="form.result" placeholder="选择结论" style="width: 100%">
                <el-option v-for="r in RESULTS" :key="r" :label="r" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="不合格处理">
              <el-select v-model="form.handling" placeholder="选择处理方式" clearable style="width: 100%">
                <el-option v-for="h in HANDLINGS" :key="h" :label="h" :value="h" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" placeholder="现场情况补充" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="现场照片">
          <div class="photo-wrap">
            <div class="photo-item" v-for="(p, i) in form.photos" :key="i">
              <el-image :src="assetUrl(p)" fit="cover" :preview-src-list="form.photos.map(assetUrl)" :initial-index="i" />
              <i class="photo-del" v-if="!dialog.readonly" @click="form.photos.splice(i, 1)">✕</i>
            </div>
            <el-upload
              v-if="!dialog.readonly && form.photos.length < 9"
              :action="uploadUrl"
              :headers="uploadHeaders"
              name="file"
              :show-file-list="false"
              accept="image/*"
              :on-success="onUploadSuccess"
              :on-error="onUploadError"
              class="photo-upload"
            >
              <div class="photo-add">＋<span>上传</span></div>
            </el-upload>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialog.visible = false">{{ dialog.readonly ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!dialog.readonly" type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

// ===== 字典（与移动端 pages/material-accept/dict.ts 保持一致，改这里请同步两端）=====
const STAGES = ['开工材料进场', '水电材料进场', '瓦工材料进场', '木工材料进场', '油漆涂料进场', '主材安装进场', '竣工前补货', '其他']
const VERDICTS = ['合格', '不合格', '让步接收']
const TAGS = ['外观破损', '色差明显', '规格型号不符', '数量短缺', '无合格证', '无检测报告', '环保等级不符', '尺寸偏差', '包装破损']
const DOCS = ['合格证', '检测报告', '环保检测报告', '保修卡', '送货单', '说明书', '无']
const STORAGE = ['室内指定材料区', '室内待安装区', '室外覆盖堆放', '临时堆放待整理', '不涉及']
const RESULTS = ['全部合格，同意进场', '部分合格，合格品进场', '全部不合格，退场', '让步接收（降级使用）', '待复检']
const HANDLINGS = ['退货换货', '降级使用', '现场整改', '报备甲方与设计', '不涉及']

const list = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const saving = ref(false)
const projects = ref([])
const staff = ref([])
const suppliers = ref([])
const materialOptions = ref([])
const materialLoading = ref(false)

const filters = reactive({ project_id: null, result: '', keyword: '' })

const dialog = reactive({ visible: false, title: '新增材料验收', readonly: false, isCreate: true })

const emptyForm = () => ({
  id: null,
  project_id: null,
  project_name: '',
  accept_date: todayStr(),
  stage: '',
  foreman_id: null,
  foreman_name: '',
  supplier_name: '',
  delivery_no: '',
  storage: '',
  result: '',
  handling: '',
  remark: '',
  docs: [],
  photos: [],
  items: [],
})

const form = reactive(emptyForm())

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const uploadUrl = computed(() => '/api/upload-image')
const uploadHeaders = computed(() => {
  const h = {}
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (u.id) h['x-user-id'] = String(u.id)
  } catch (e) { /* ignore */ }
  return h
})

// 图片地址：后端返回 /uploads/xxx，PC 同源直接用；缺前缀时补 /
const assetUrl = (p) => {
  if (!p) return ''
  if (/^https?:/i.test(p)) return p
  return p.startsWith('/') ? p : '/' + p
}

const resultTagType = (r = '') => {
  if (r.indexOf('全部合格') === 0) return 'success'
  if (r.indexOf('全部不合格') === 0) return 'danger'
  if (r.indexOf('部分合格') >= 0 || r.indexOf('让步') >= 0) return 'warning'
  return 'info'
}

// ===== 数据加载 =====
async function loadProjects() {
  try {
    const res = await axios.get('/api/projects')
    projects.value = Array.isArray(res.data) ? res.data : (res.data?.data || [])
  } catch (e) {
    projects.value = []
  }
}

async function loadData() {
  loading.value = true
  try {
    const params = { page: page.value, limit: limit.value }
    if (filters.project_id) params.project_id = filters.project_id
    if (filters.result) params.result = filters.result
    if (filters.keyword) params.keyword = filters.keyword
    const res = await axios.get('/api/material-acceptances', { params })
    const d = res.data || {}
    list.value = Array.isArray(d.list) ? d.list : (Array.isArray(d) ? d : [])
    total.value = d.total || list.value.length
  } catch (e) {
    list.value = []
    total.value = 0
    ElMessage.error(e?.response?.data?.error || '加载失败')
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  loadData()
}

function resetFilters() {
  filters.project_id = null
  filters.result = ''
  filters.keyword = ''
  reload()
}

const authHeaders = () => {
  const h = {}
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (u.id) h['x-user-id'] = String(u.id)
    if (u.role_code || u.role_name) h['x-user-role'] = u.role_code || u.role_name || ''
  } catch (e) { /* ignore */ }
  return h
}

async function onProjectChange(val) {
  const p = projects.value.find((x) => x.id === val)
  form.project_name = p ? p.name : ''
  staff.value = []
  suppliers.value = []
  if (!val) return
  try {
    const res = await axios.get('/api/material-acceptances/meta', { params: { project_id: val } })
    const d = res.data || {}
    if (d.project_name) form.project_name = d.project_name
    staff.value = Array.isArray(d.staff) ? d.staff : []
    suppliers.value = Array.isArray(d.suppliers) ? d.suppliers : []
    if (d.foreman_id) {
      form.foreman_id = d.foreman_id
      form.foreman_name = d.foreman_name || ''
    }
  } catch (e) { /* meta 失败不阻断 */ }
}

async function searchMaterial(kw) {
  materialLoading.value = true
  try {
    const res = await axios.get('/api/material-acceptances/material-search', {
      params: { keyword: kw || '', limit: 30 },
      headers: authHeaders(),
    })
    const d = res.data || {}
    materialOptions.value = Array.isArray(d.list) ? d.list : []
  } catch (e) {
    materialOptions.value = []
  } finally {
    materialLoading.value = false
  }
}

const onPickMaterial = (idx, name) => {
  const m = materialOptions.value.find((x) => x.name === name)
  const row = form.items[idx]
  if (!row) return
  if (m) {
    row.material_id = m.id
    row.spec = m.spec || m.model || row.spec || ''
    row.unit = m.unit || row.unit || ''
  } else {
    row.material_id = null
  }
}

const addItem = () => {
  form.items.push({
    material_id: null,
    material_name: '',
    spec: '',
    unit: '',
    plan_qty: '',
    actual_qty: '',
    verdict: '合格',
    problem_tags: [],
  })
}

const removeItem = (idx) => form.items.splice(idx, 1)

// ===== 对话框 =====
function resetForm() {
  Object.assign(form, emptyForm())
  staff.value = []
  suppliers.value = []
}

function openCreate() {
  resetForm()
  dialog.isCreate = true
  dialog.readonly = false
  dialog.title = '新增材料验收'
  dialog.visible = true
  addItem()
  searchMaterial('')
  if (filters.project_id) {
    form.project_id = filters.project_id
    onProjectChange(filters.project_id)
  }
}

async function openView(row) {
  await openDetail(row, true)
}

async function openEdit(row) {
  await openDetail(row, false)
}

async function openDetail(row, readonly) {
  resetForm()
  dialog.isCreate = false
  dialog.readonly = readonly
  dialog.title = readonly ? '验收详情' : '编辑材料验收'
  try {
    const res = await axios.get(`/api/material-acceptances/${row.id}`)
    const d = res.data || {}
    if (!d.id) throw new Error('记录不存在')
    Object.assign(form, {
      id: d.id,
      project_id: d.project_id,
      project_name: d.project_name_display || d.project_name || '',
      accept_date: d.accept_date || '',
      stage: d.stage || '',
      foreman_id: d.foreman_id || null,
      foreman_name: d.foreman_name || '',
      supplier_name: d.supplier_name || '',
      delivery_no: d.delivery_no || '',
      storage: d.storage || '',
      result: d.result || '',
      handling: d.handling || '',
      remark: d.remark || '',
      docs: parseArr(d.docs),
      photos: parseArr(d.photos),
      items: (Array.isArray(d.items) ? d.items : []).map((it) => ({
        material_id: it.material_id || null,
        material_name: it.material_name || '',
        spec: it.spec || '',
        unit: it.unit || '',
        plan_qty: it.plan_qty == null ? '' : String(it.plan_qty),
        actual_qty: it.actual_qty == null ? '' : String(it.actual_qty),
        verdict: it.verdict || '合格',
        problem_tags: parseArr(it.problem_tags),
      })),
    })
    // 验收人下拉要有数据才能显示名字
    try {
      const meta = await axios.get('/api/material-acceptances/meta', { params: { project_id: d.project_id } })
      staff.value = meta.data?.staff || []
      suppliers.value = meta.data?.suppliers || []
      if (!form.foreman_name) form.foreman_name = meta.data?.foreman_name || ''
    } catch (e) { /* ignore */ }
    dialog.visible = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e.message || '加载详情失败')
  }
}

function parseArr(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  try {
    let s = JSON.parse(v)
    if (typeof s === 'string') s = JSON.parse(s)
    return Array.isArray(s) ? s : []
  } catch (e) {
    return []
  }
}

function onUploadSuccess(res) {
  const url = res?.url || res?.path || res?.data?.url || ''
  if (url) form.photos.push(url)
  else ElMessage.warning('上传返回异常')
}

function onUploadError() {
  ElMessage.error('图片上传失败')
}

async function handleSave() {
  if (saving.value) return
  if (!form.project_id) return ElMessage.warning('请选择项目')
  if (!form.accept_date) return ElMessage.warning('请选择验收日期')
  if (!form.stage) return ElMessage.warning('请选择施工阶段')
  const items = form.items.filter((x) => x.material_name)
  if (!items.length) return ElMessage.warning('请至少添加一项材料')
  if (!form.result) return ElMessage.warning('请选择验收结论')
  const hasFail = items.some((x) => x.verdict === '不合格')
  if (form.result.indexOf('全部合格') === 0 && hasFail) {
    return ElMessage.warning('结论选了「全部合格」，但有材料判为不合格，请改结论')
  }
  if (hasFail && (!form.handling || form.handling === '不涉及')) {
    return ElMessage.warning('有不合格材料，请选择处理方式')
  }

  const payload = {
    project_id: form.project_id,
    project_name: form.project_name,
    accept_date: form.accept_date,
    stage: form.stage,
    foreman_id: form.foreman_id,
    foreman_name: form.foreman_name,
    supplier_name: form.supplier_name,
    delivery_no: form.delivery_no,
    storage: form.storage,
    result: form.result,
    handling: form.handling,
    remark: form.remark,
    docs: form.docs,
    photos: form.photos,
    items: items.map((it) => ({
      material_id: it.material_id,
      material_name: it.material_name,
      spec: it.spec,
      brand: '',
      unit: it.unit,
      plan_qty: it.plan_qty === '' ? null : Number(it.plan_qty),
      actual_qty: it.actual_qty === '' ? null : Number(it.actual_qty),
      verdict: it.verdict,
      problem_tags: it.verdict === '合格' ? [] : it.problem_tags,
    })),
  }

  saving.value = true
  try {
    if (dialog.isCreate) {
      const res = await axios.post('/api/material-acceptances', payload)
      ElMessage.success(res.data?.accept_no ? `已提交 ${res.data.accept_no}` : '提交成功')
    } else {
      await axios.put(`/api/material-acceptances/${form.id}`, payload)
      ElMessage.success('已保存')
    }
    dialog.visible = false
    loadData()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.accept_no || row.project_name_display || '该记录'}」？删除后不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.delete(`/api/material-acceptances/${row.id}`)
    ElMessage.success('已删除')
    loadData()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

onMounted(async () => {
  await loadProjects()
  await loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
.num {
  font-weight: 600;
}
.num.pass {
  color: #0e9f6e;
}
.num.fail {
  color: #dc2626;
}
.sep {
  margin: 0 4px;
  color: #c0c4cc;
}
.muted {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
.photo-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-item {
  position: relative;
  width: 78px;
  height: 78px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}
.photo-item .el-image {
  width: 100%;
  height: 100%;
}
.photo-del {
  position: absolute;
  top: 2px;
  right: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 11px;
  cursor: pointer;
  font-style: normal;
}
.photo-add {
  width: 78px;
  height: 78px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 16px;
  cursor: pointer;
}
.photo-add span {
  font-size: 11px;
}
</style>
