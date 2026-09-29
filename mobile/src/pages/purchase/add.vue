<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建采购</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting }">提交</text>
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-section-title">基本信息</view>

      <!-- 项目 -->
      <view class="form-item">
        <text class="form-label">项目</text>
        <view class="picker-value" :class="{ placeholder: !selectedProject }" @click="showProjectPicker">
          {{ selectedProject?.name || '请选择项目' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 供应商 -->
      <view class="form-item">
        <text class="form-label">供应商</text>
        <view class="picker-value" :class="{ placeholder: !selectedSupplier }" @click="showSupplierPicker">
          {{ selectedSupplier?.name || '请选择供应商' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 主材选择 -->
      <view class="form-item">
        <text class="form-label">主材</text>
        <view class="picker-value" :class="{ placeholder: !selectedMaterial && !freeMaterialName }" @click="showMaterialPicker">
          {{ freeMaterialName || selectedMaterial?.name || '请选择主材' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 规格型号 -->
      <view class="form-item">
        <text class="form-label">规格型号</text>
        <input class="form-input" v-model="form.spec" placeholder="如：300×600" />
      </view>

      <!-- 数量 -->
      <view class="form-item">
        <text class="form-label">数量</text>
        <input class="form-input" v-model="form.quantity" placeholder="请输入数量" type="number" />
      </view>

      <!-- 单位 -->
      <view class="form-item">
        <text class="form-label">单位</text>
        <view class="picker-value" :class="{ placeholder: !form.unit }" @click="showUnitPicker">
          {{ form.unit || '请选择单位' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 图片 -->
      <view class="form-item form-item-top">
        <text class="form-label">图片</text>
        <view class="image-upload-area">
          <view v-for="(img, idx) in images" :key="idx" class="image-preview-item">
            <image class="image-preview" :src="getImageUrl(img)" mode="aspectFill" />
            <view class="image-remove" @click="removeImage(idx)">×</view>
          </view>
          <view v-if="images.length < 9" class="image-add-btn" @click="chooseImage">
            <text class="image-add-icon">+</text>
            <text class="image-add-text">添加图片</text>
          </view>
        </view>
      </view>

      <!-- 预计金额 -->
      <view class="form-item">
        <text class="form-label">预计金额</text>
        <input class="form-input" v-model="form.amount" placeholder="选择主材后自动填入，可修改" type="digit" />
      </view>

      <!-- 用途说明 -->
      <view class="form-item form-item-top">
        <text class="form-label">用途说明</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="请输入用途说明" rows="3" />
      </view>
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
    <!-- 单位选择弹窗 -->
    <BottomPicker
      v-model:visible="unitPicker.visible"
      :title="unitPicker.title"
      :items="unitPicker.items"
      @select="onUnitSelect"
      @cancel="unitPicker.visible = false"
    />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from '@/components/bottom-picker.vue'

const selectedProject = ref(null)
const selectedSupplier = ref(null)
const selectedMaterial = ref(null)
const freeMaterialName = ref('')
const submitting = ref(false)

const form = ref({
  project_id: '',
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
const uploadingImage = ref(false)

const unitList = [
  '个', '块', '片', '张', '卷', '卷', '米', '平方米', '立方米',
  '套', '件', '根', '条', '米', '袋', '箱', '桶', '捆', '包', '把',
  '台', '部', '台', '扇', '樘', '盏', '米', '平方', '延米',
]
const unitPicker = ref({ visible: false, title: '选择单位', items: unitList.map(n => ({ name: n, icon: '📏' })) })

onMounted(() => {
  // 加载项目列表（admin看到所有，非admin只看到自己参与的）
  uni.request({
    url: '/api/projects',
    data: { limit: 500 },
    success: (res) => {
      if (Array.isArray(res.data)) {
        projectList = res.data
      } else if (res.data.code === 0) {
        projectList = res.data.data?.list || res.data.list || []
      } else {
        projectList = []
      }
    }
  })

  // 加载供应商列表（主材类型）
  uni.request({
    url: '/api/suppliers',
    success: (res) => {
      const all = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      supplierList = all.filter(s => s.type === '主材')
    }
  })
})

let projectList = []
let supplierList = []
let materialList = []

const showProjectPicker = () => {
  projectPicker.value = {
    visible: true,
    title: '选择项目',
    items: projectList.map((p, i) => ({ name: p.name, icon: '📁', _index: i })),
  }
}

const onProjectSelect = ({ item }) => {
  const idx = item._index
  selectedProject.value = projectList[idx]
  form.value.project_id = projectList[idx].id
  projectPicker.value.visible = false
}

const showSupplierPicker = () => {
  if (!supplierList.length) {
    uni.showToast({ title: '暂无可选供应商', icon: 'none' })
    return
  }
  supplierPicker.value = {
    visible: true,
    title: '选择供应商',
    items: supplierList.map((s, i) => ({ name: s.name, icon: '🏭', _index: i })),
  }
}

const onSupplierSelect = ({ item }) => {
  const idx = item._index
  selectedSupplier.value = supplierList[idx]
  form.value.supplier_id = supplierList[idx].id
  form.value.supplier_name = supplierList[idx].name
  // 清空已选主材
  selectedMaterial.value = null
  freeMaterialName.value = ''
  form.value.material_id = ''
  form.value.material_name = ''
  form.value.spec = ''
  form.value.amount = ''
  materialPicker.value.visible = false
  // 加载该供应商的主材
  loadMaterials(supplierList[idx].id)
  supplierPicker.value.visible = false
}

const showMaterialPicker = () => {
  if (!form.value.supplier_id) {
    uni.showToast({ title: '请先选择供应商', icon: 'none' })
    return
  }
  const baseItems = materialList.map((m, i) => ({
    name: m.name + (m.specification ? ` (${m.specification})` : ''),
    icon: '📦',
    _index: i,
  }))
  // 加"未录入"选项
  baseItems.push({ name: '＋ 未录入供应商主材', icon: '✏️', _index: -1 })
  materialPicker.value = {
    visible: true,
    title: '选择主材',
    items: baseItems,
  }
}

const onMaterialSelect = ({ item }) => {
  materialPicker.value.visible = false
  if (item._index === -1) {
    // 未录入，走自由填写
    freeMaterialName.value = ''
    selectedMaterial.value = null
    form.value.material_id = ''
    form.value.material_name = ''
    form.value.spec = ''
    form.value.amount = ''
    uni.showModal({
      title: '输入主材名称',
      editable: true,
      placeholderText: '请输入主材名称',
      success: (res) => {
        if (res.content && res.content.trim()) {
          freeMaterialName.value = res.content.trim()
          form.value.material_name = freeMaterialName.value
          form.value.material_id = ''
        }
      }
    })
    return
  }
  const idx = item._index
  selectedMaterial.value = materialList[idx]
  freeMaterialName.value = ''
  form.value.material_id = materialList[idx].id
  form.value.material_name = materialList[idx].name
  form.value.spec = materialList[idx].specification || materialList[idx].model || ''
  form.value.amount = materialList[idx].quote_price || ''
}

const loadMaterials = (supplierId) => {
  uni.request({
    url: '/api/main-materials',
    data: { supplier_id: supplierId, limit: 500 },
    success: (res) => {
      if (res.data.code === 0 || res.data.list) {
        materialList = res.data.list || []
      } else {
        materialList = []
      }
    },
    fail: () => { materialList = [] }
  })
}

function goAdd() { uni.navigateTo({ url: '/pages/purchase/add' }) }

const showUnitPicker = () => {
  unitPicker.value.visible = true
}

const onUnitSelect = ({ item }) => {
  form.value.unit = item.name
  unitPicker.value.visible = false
}

const getImageUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return path
}

const chooseImage = () => {
  if (uploadingImage.value) return
  uni.chooseImage({
    count: 9 - images.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      uploadingImage.value = true
      let successCount = 0
      for (const tempPath of res.tempFilePaths) {
        try {
          const up = await uploadImage(tempPath)
          images.value.push(up)
          successCount++
        } catch (e) {
          console.error('图片上传失败:', e)
        }
      }
      uploadingImage.value = false
      if (successCount === 0 && res.tempFilePaths.length > 0) {
        uni.showToast({ title: '图片上传失败', icon: 'none' })
      }
    },
    fail: () => { uploadingImage.value = false }
  })
}

const uploadImage = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('userInfo')?.id || ''
    uni.uploadFile({
      url: 'http://localhost:10086/api/upload-image',
      filePath,
      name: 'file',
      header: { 'x-user-id': token },
      success: (up) => {
        try {
          const d = JSON.parse(up.data)
          if (d.url) resolve(d.url)
          else reject(new Error(d.error || '上传失败'))
        } catch { reject(new Error('解析失败')) }
      },
      fail: (e) => reject(e)
    })
  })
}

const removeImage = (idx) => images.value.splice(idx, 1)

function goBack() { uni.navigateBack() }

function submit() {
  if (!form.value.project_id) { uni.showToast({ title: '请选择项目', icon: 'none' }); return }
  if (!form.value.supplier_id) { uni.showToast({ title: '请选择供应商', icon: 'none' }); return }
  if (!form.value.material_name) { uni.showToast({ title: '请选择或输入主材', icon: 'none' }); return }
  if (!form.value.quantity) { uni.showToast({ title: '请填写数量', icon: 'none' }); return }
  if (!form.value.unit) { uni.showToast({ title: '请填写单位', icon: 'none' }); return }

  submitting.value = true
  const payload = {
    project_id: form.value.project_id,
    supplier_id: form.value.supplier_id,
    supplier_name: form.value.supplier_name,
    material_id: form.value.material_id || '',
    material_name: form.value.material_name,
    spec: form.value.spec,
    quantity: form.value.quantity,
    unit: form.value.unit,
    amount: form.value.amount || 0,
    remark: form.value.remark,
    images: images.value,
  }

  uni.request({
    url: '/api/purchase-requests',
    method: 'POST',
    header: { 'x-user-id': uni.getStorageSync('userInfo')?.id || '' },
    data: payload,
    success: (res) => {
      console.log('提交响应:', res.statusCode, JSON.stringify(res.data))
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => { uni.navigateBack() }, 1500)
      } else {
        uni.showToast({ title: res.data.msg || '提交失败', icon: 'none' })
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
.form-section-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item {
  display: flex; align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.form-item:last-child { border-bottom: none; }
.form-item-top { align-items: flex-start; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; padding-top: 6rpx; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value {
  flex: 1; font-size: 28rpx; color: #333;
  display: flex; justify-content: space-between; align-items: center;
}
.picker-value.placeholder { color: #999; }
.arrow { font-size: 18px; color: #ccc; }

.image-upload-area {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
}
.image-preview {
  width: 100%;
  height: 100%;
}
.image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.image-add-btn {
  width: 80px;
  height: 80px;
  border: 1px dashed #ccc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}
.image-add-icon { font-size: 24px; color: #999; }
.image-add-text { font-size: 11px; color: #999; margin-top: 2px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-btn { font-size: 15px; color: #fff; width: 40px; text-align: right; }
.nav-btn.disabled { opacity: 0.5; }
</style>
