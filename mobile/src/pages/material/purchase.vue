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
        <text class="form-label">材料名称</text>
        <input class="form-input" v-model="form.material_name" placeholder="请输入材料名称" />
      </view>
      <view class="form-item">
        <text class="form-label">规格型号</text>
        <input class="form-input" v-model="form.spec" placeholder="如：300×600" />
      </view>
      <view class="form-item">
        <text class="form-label">数量</text>
        <input class="form-input" v-model="form.quantity" placeholder="请输入数量" type="number" />
      </view>
      <view class="form-item">
        <text class="form-label">单位</text>
        <input class="form-input" v-model="form.unit" placeholder="如：块、米、个" />
      </view>
      <view class="form-item">
        <text class="form-label">供应商</text>
        <input class="form-input" v-model="form.supplier" placeholder="请输入供应商" />
      </view>
      <view class="form-item">
        <text class="form-label">预计金额</text>
        <input class="form-input" v-model="form.amount" placeholder="请输入金额" type="digit" />
      </view>
      <view class="form-item">
        <text class="form-label">用途说明</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="请输入用途说明" rows="3" />
      </view>
    </view>

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
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from "@/components/bottom-picker.vue";

const projects = ref([])
const projectIndex = ref(-1)
const selectedProject = ref(null)
const submitting = ref(false)
const form = ref({
  material_name: '', spec: '', quantity: '', unit: '', supplier: '', amount: '', remark: '', project_id: ''
})

const projectPicker = ref({
  visible: false,
  title: '选择项目',
  items: [],
})

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
  projectPicker.value.visible = false
}

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current || {}).options || {};
  if (options.projectId) {
    form.value.project_id = options.projectId;
    if (options.projectName) {
      selectedProject.value = { id: options.projectId, name: decodeURIComponent(options.projectName) };
      projectIndex.value = -1;
    }
  }
  uni.request({
    url: '/api/projects/list',
    data: { page_size: 100 },
    success: (res) => {
      if (res.data.code === 0) {
        projects.value = res.data.data?.list || [];
        if (options.projectId && options.projectName) {
          const name = decodeURIComponent(options.projectName);
          const idx = projects.value.findIndex((p) => String(p.id) === String(options.projectId));
          if (idx >= 0) projectIndex.value = idx;
          selectedProject.value = { id: options.projectId, name };
        }
      }
    }
  });
})

function onProjectChange(e) {
  projectIndex.value = e.detail.value
  selectedProject.value = projects.value[projectIndex.value]
  form.value.project_id = selectedProject.value?.id || ''
}

function goBack() { uni.navigateBack() }

function submit() {
  if (!form.value.project_id) { uni.showToast({ title: '请选择项目', icon: 'none' }); return }
  if (!form.value.material_name) { uni.showToast({ title: '请填写材料名称', icon: 'none' }); return }
  if (!form.value.quantity) { uni.showToast({ title: '请填写数量', icon: 'none' }); return }
  submitting.value = true
  uni.request({
    url: '/api/material/purchase',
    method: 'POST',
    data: form.value,
    success: (res) => {
      if (res.data.code === 0) {
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
.form-title { font-size: 28rpx; font-weight: 600; color: #1E3A5F; margin-bottom: 24rpx; }
.form-item { display: flex; align-items: flex-start; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.form-item:last-child { border-bottom: none; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; padding-top: 6rpx; }
.form-input { flex: 1; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; font-size: 28rpx; color: #333; border: 1rpx solid #eee; border-radius: 8rpx; padding: 16rpx; resize: none; }
.picker-value { flex: 1; font-size: 28rpx; color: #333; display: flex; justify-content: space-between; align-items: center; }
.submit-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 20rpx 40rpx; background: #fff; box-shadow: 0 -2rpx 10rpx rgba(0,0,0,0.05); }
.btn-primary { background: #1E3A5F; color: #fff; border-radius: 40rpx; font-size: 28rpx; height: 88rpx; line-height: 88rpx; }
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1E3A5F;
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }
</style>
