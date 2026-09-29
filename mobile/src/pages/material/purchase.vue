<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">采购申请</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-title">基本信息</view>
      <view class="form-item">
        <text class="form-label">项目</text>
        <view class="picker-value" @click="showProjectPicker">
          {{ selectedProject?.name || '请选择项目' }}
          <text class="iconfont icon-arrow-down"></text>
        </view>
      </view>
      <view class="form-item">
        <text class="form-label">供应商</text>
        <view class="picker-value" @click="showSupplierPicker">
          {{ selectedSupplier?.name || '请选择供应商' }}
          <text class="iconfont icon-arrow-down"></text>
        </view>
      </view>
      <view class="form-item">
        <text class="form-label">主材</text>
        <view class="picker-value" :class="{ placeholder: !selectedMaterial }" @click="showMaterialPicker">
          {{ selectedMaterial?.name || '请先选择供应商' }}
          <text class="iconfont icon-arrow-down"></text>
        </view>
      </view>
      <view class="form-item">
        <text class="form-label">规格型号</text>
        <input class="form-input" v-model="form.spec" placeholder="如：300×600" disabled />
      </view>
      <view class="form-item">
        <text class="form-label">数量</text>
        <input class="form-input" v-model="form.quantity" placeholder="请输入数量" type="number" @input="onQuantityChange" />
      </view>
      <view class="form-item">
        <text class="form-label">单位</text>
        <view class="picker-value" :class="{ placeholder: !form.unit }" @click="showUnitPicker">
          {{ form.unit || '请选择单位' }}
          <text class="iconfont icon-arrow-down"></text>
        </view>
      </view>
      <view class="form-item">
        <text class="form-label">预计金额</text>
        <input class="form-input" v-model="form.amount" placeholder="选择主材后自动填入" type="digit" />
      </view>
      <view class="form-item">
        <text class="form-label">用途说明</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="请输入用途说明" rows="3" />
      </view>
      <!-- 图片上传 -->
      <view class="form-item" style="flex-direction:column;align-items:flex-start;">
        <text class="form-label" style="width:100%;">图片</text>
        <view class="image-upload-row">
          <view v-for="(img, idx) in images" :key="idx" class="thumb-wrap">
            <image :src="getImageUrl(img)" class="thumb-img" mode="aspectFill" @click="previewImage(idx)" />
            <view class="thumb-del" @click="removeImage(idx)">×</view>
          </view>
          <view v-if="images.length < 9" class="add-img-btn" @click="handleAddImage">+</view>
        </view>
      </view>
    </view>

    <!-- 单位选择弹窗 -->
    <BottomPicker
      v-model:visible="unitPicker.visible"
      :title="unitPicker.title"
      :items="unitPicker.items"
      @select="onUnitSelect"
      @cancel="unitPicker.visible = false"
    />

    <!-- 提交 -->
    <view class="submit-bar">
      <button class="btn-primary" :disabled="submitting" @click="submit">提交申请</button>
    </view>

    <!-- 项目选择弹窗 -->
    <BottomPicker
      v-model:visible="projectPicker.visible"
      :title="projectPicker.title"
      :items="projectPicker.items"
      @select="onProjectSelect"
      @cancel="projectPicker.visible = false"
    />
    <!-- 供应商选择弹窗 -->
    <BottomPicker
      v-model:visible="supplierPicker.visible"
      :title="supplierPicker.title"
      :items="supplierPicker.items"
      @select="onSupplierSelect"
      @cancel="supplierPicker.visible = false"
    />
    <!-- 主材选择弹窗 -->
    <BottomPicker
      v-model:visible="materialPicker.visible"
      :title="materialPicker.title"
      :items="materialPicker.items"
      @select="onMaterialSelect"
      @cancel="materialPicker.visible = false"
    />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from "@/components/bottom-picker.vue";
import { uploadImage, getImageUrl } from "@/utils/upload";

const projects = ref([])
const projectIndex = ref(-1)
const selectedProject = ref(null)
const submitting = ref(false)
const suppliers = ref([])
const selectedSupplier = ref(null)
const materials = ref([])
const selectedMaterial = ref(null)

const form = ref({
  project_id: '',
  project_name: '',
  supplier_id: '',
  supplier_name: '',
  material_id: '',
  material_name: '',
  spec: '',
  quantity: '',
  unit: '',
  amount: '',
  remark: '',
})

const projectPicker = ref({ visible: false, title: '选择项目', items: [] })
const supplierPicker = ref({ visible: false, title: '选择供应商', items: [] })
const materialPicker = ref({ visible: false, title: '选择主材', items: [] })
const images = ref([])
const uploading = ref(false)

const unitList = ['个', '块', '片', '张', '卷', '米', '平方米', '立方米', '套', '件', '箱', '桶', '袋', '捆', '包', '把', '台', '部', '扇', '樘', '盏', '根', '条', '延米', '平方', '千克', '克', '吨', '升', '毫升']
const unitPicker = ref({ visible: false, title: '选择单位', items: [] })

const showUnitPicker = () => {
  unitPicker.value = {
    visible: true,
    title: '选择单位',
    items: unitList.map((u, i) => ({ name: u, icon: '📏', _index: i })),
  }
}

const onUnitSelect = ({ item }) => {
  form.value.unit = unitList[item._index]
  unitPicker.value.visible = false
}

const showProjectPicker = () => {
  projectPicker.value = {
    visible: true,
    title: '选择项目',
    items: projects.value.map((p) => ({ name: p.name, icon: '📁', _index: projects.value.indexOf(p) })),
  }
}

const onProjectSelect = ({ item }) => {
  projectIndex.value = item._index
  selectedProject.value = projects.value[item._index]
  form.value.project_id = selectedProject.value?.id || ''
  form.value.project_name = selectedProject.value?.name || ''
  projectPicker.value.visible = false
}

const showSupplierPicker = () => {
  if (!suppliers.value.length) {
    uni.showToast({ title: '暂无可选供应商', icon: 'none' })
    return
  }
  supplierPicker.value = {
    visible: true,
    title: '选择供应商',
    items: suppliers.value.map((s) => ({ name: s.name, icon: '🏭', _index: suppliers.value.indexOf(s) })),
  }
}

const onSupplierSelect = ({ item }) => {
  const idx = item._index
  selectedSupplier.value = suppliers.value[idx]
  form.value.supplier_id = selectedSupplier.value?.id || ''
  form.value.supplier_name = selectedSupplier.value?.name || ''
  // 清空已选主材
  selectedMaterial.value = null
  form.value.material_id = ''
  form.value.material_name = ''
  form.value.spec = ''
  form.value.amount = ''
  // 加载该供应商的主材列表
  loadMaterials(selectedSupplier.value.id)
  supplierPicker.value.visible = false
}

const showMaterialPicker = () => {
  if (!form.value.supplier_id) {
    uni.showToast({ title: '请先选择供应商', icon: 'none' })
    return
  }
  if (!materials.value.length) {
    uni.showToast({ title: '该供应商暂无主材', icon: 'none' })
    return
  }
  materialPicker.value = {
    visible: true,
    title: '选择主材',
    items: materials.value.map((m) => ({ name: m.name, icon: '📦', _index: materials.value.indexOf(m) })),
  }
}

const onMaterialSelect = ({ item }) => {
  const idx = item._index
  selectedMaterial.value = materials.value[idx]
  form.value.material_id = selectedMaterial.value?.id || ''
  form.value.material_name = selectedMaterial.value?.name || ''
  form.value.spec = selectedMaterial.value?.specification || selectedMaterial.value?.model || ''
  // 自动填入单价
  const unitPrice = parseFloat(selectedMaterial.value?.quote_price || '0')
  form.value.amount = unitPrice > 0 ? unitPrice.toFixed(2) : ''
  // 自动选中单位
  if (selectedMaterial.value?.unit) {
    form.value.unit = selectedMaterial.value.unit
  }
  // 如果有数量，算总价
  if (form.value.quantity && unitPrice > 0) {
    form.value.amount = (parseFloat(form.value.quantity) * unitPrice).toFixed(2)
  }
  materialPicker.value.visible = false
}

const onQuantityChange = () => {
  const qty = parseFloat(form.value.quantity || '0')
  const price = parseFloat(selectedMaterial.value?.quote_price || '0')
  if (qty > 0 && price > 0) {
    form.value.amount = (qty * price).toFixed(2)
  }
}

const loadMaterials = (supplierId) => {
  uni.request({
    url: '/api/main-materials',
    data: { supplier_id: supplierId, limit: 500 },
    success: (res) => {
      if (res.data.code === 0 || res.data.list) {
        materials.value = res.data.list || []
      } else {
        materials.value = []
      }
    },
    fail: () => { materials.value = [] }
  })
}

onMounted(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = (current || {}).options || {}

  if (options.projectId) {
    form.value.project_id = options.projectId
    if (options.projectName) {
      selectedProject.value = { id: options.projectId, name: decodeURIComponent(options.projectName) }
    }
  }

  // 加载项目列表
  uni.request({
    url: '/api/projects',
    data: { page_size: 100 },
    success: (res) => {
      if (Array.isArray(res.data)) {
        projects.value = res.data
      } else if (res.data.code === 0) {
        projects.value = res.data.data?.list || []
      }
    }
  })

  // 加载供应商列表（只取"主材"类型）
  uni.request({
    url: '/api/suppliers',
    success: (res) => {
      const all = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      suppliers.value = all.filter(s => s.type === '主材')
    }
  })
})

function goBack() { uni.navigateBack() }

function previewImage(idx) {
  const urls = images.value.map(getImageUrl)
  uni.previewImage({ current: idx, urls })
}

function removeImage(idx) {
  images.value.splice(idx, 1)
}

async function handleAddImage() {
  if (images.value.length >= 9) {
    uni.showToast({ title: '最多9张', icon: 'none' }); return
  }
  const remaining = 9 - images.value.length
  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const paths = res.tempFilePaths
      if (!paths.length) return
      uploading.value = true
      try {
        const newPaths = await Promise.all(paths.map((p) => uploadImage(p)))
        images.value = [...images.value, ...newPaths]
      } catch (e) {
        uni.showToast({ title: '有图片上传失败', icon: 'none' })
      } finally {
        uploading.value = false
      }
    }
  })
}

function submit() {
  if (!form.value.project_id) { uni.showToast({ title: '请选择项目', icon: 'none' }); return }
  if (!form.value.supplier_id) { uni.showToast({ title: '请选择供应商', icon: 'none' }); return }
  if (!form.value.material_id) { uni.showToast({ title: '请选择主材', icon: 'none' }); return }
  if (!form.value.quantity) { uni.showToast({ title: '请填写数量', icon: 'none' }); return }
  if (uploading.value) { uni.showToast({ title: '图片上传中，请稍候', icon: 'none' }); return }
  submitting.value = true
  const payload = {
    project_id: form.value.project_id,
    project_name: form.value.project_name,
    supplier_id: form.value.supplier_id,
    supplier_name: form.value.supplier_name,
    material_id: form.value.material_id,
    material_name: form.value.material_name,
    spec: form.value.spec,
    quantity: form.value.quantity,
    unit: form.value.unit,
    amount: form.value.amount,
    remark: form.value.remark,
    images: JSON.stringify(images.value),
  }
  console.log('[提交采购]', JSON.stringify(payload))
  uni.request({
    url: '/api/purchase-requests',
    method: 'POST',
    header: { 'x-user-id': uni.getStorageSync('userInfo')?.id || '' },
    data: payload,
    success: (res) => {
      if (res.data.code === 0 || res.data.id || res.data.message) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => { uni.navigateBack() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || res.data.message || '提交失败', icon: 'none' })
      }
    },
    fail: () => { uni.showToast({ title: '网络错误', icon: 'none' }) },
    complete: () => { submitting.value = false }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.form-card { margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx; }
.form-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item { display: flex; align-items: flex-start; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.form-item:last-child { border-bottom: none; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; padding-top: 6rpx; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-input[disabled] { color: #999; background: #f9f9f9; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value { flex: 1; font-size: 28rpx; color: #333; display: flex; justify-content: space-between; align-items: center; }
.picker-value.placeholder { color: #999; }
.submit-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); }
.btn-primary { background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; height: 88rpx; line-height: 88rpx; }
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }
.image-upload-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.thumb-wrap { position: relative; width: 120rpx; height: 120rpx; }
.thumb-img { width: 120rpx; height: 120rpx; border-radius: 8rpx; }
.thumb-del { position: absolute; top: -16rpx; right: -16rpx; width: 36rpx; height: 36rpx; background: #ff4d4f; color: #fff; border-radius: 50%; font-size: 24rpx; text-align: center; line-height: 36rpx; }
.add-img-btn { width: 120rpx; height: 120rpx; border: 2rpx dashed #ccc; border-radius: 8rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; color: #ccc; }
</style>
