<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">新建派工单</text>
      <text class="nav-btn" @click="submit" :class="{ disabled: submitting }">提交</text>
    </view>

    <!-- 项目信息横幅 -->
    <view class="project-banner" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 表单 -->
    <view class="form-card">
      <view class="form-section-title">基本信息</view>

      <!-- 项目选择 -->
      <view class="form-item">
        <text class="form-label">项目</text>
        <view class="picker-value" :class="{ placeholder: !selectedProject }" @click="showProjectPicker">
          {{ selectedProject?.name || '请选择项目' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 施工内容 -->
      <view class="form-item">
        <text class="form-label">施工内容 *</text>
        <view class="picker-value" :class="{ placeholder: !selectedWork }" @click="showWorkPicker">
          {{ selectedWork || '请选择施工内容' }}
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 施工内容快捷选项 -->
      <view class="work-chips-wrap">
        <view class="work-chips">
          <view
            v-for="work in workTypes"
            :key="work"
            class="work-chip"
            :class="{ active: selectedWork === work }"
            @click="onWorkChipClick(work)"
          >{{ work }}</view>
        </view>
      </view>

      <!-- 施工地点 -->
      <view class="form-item">
        <text class="form-label">施工地点</text>
        <input class="form-input" v-model="form.location" placeholder="自动填入项目地址，可修改" />
      </view>

      <!-- 约定工费 -->
      <view class="form-item">
        <text class="form-label">约定工费</text>
        <input class="form-input" v-model="form.fee" type="number" placeholder="¥0" />
      </view>

      <!-- 施工开始时间 -->
      <view class="form-item">
        <text class="form-label">施工开始时间</text>
        <picker mode="date" :value="form.start_date" @change="onStartDateChange">
          <view class="picker-value" :class="{ placeholder: !form.start_date }">
            {{ form.start_date || '请选择日期' }}
            <text class="arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 施工要求 -->
      <view class="form-item form-item-top">
        <text class="form-label">施工要求</text>
        <textarea class="form-textarea" v-model="form.requirement" placeholder="补充施工要求..." rows="3" />
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
    <!-- 施工内容选择弹窗 -->
    <BottomPicker
      v-model:visible="workPicker.visible"
      :title="workPicker.title"
      :items="workPicker.items"
      @select="onWorkSelect"
      @cancel="workPicker.visible = false"
    />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BottomPicker from '@/components/bottom-picker.vue'

const selectedProject = ref(null)
const selectedWork = ref('')
const submitting = ref(false)

const form = ref({
  project_id: '',
  project_name: '',
  content: '',
  location: '',
  worker: '',
  fee: '',
  start_date: '',
  requirement: '',
})

const projectPicker = ref({ visible: false, title: '选择项目', items: [] })
const workPicker = ref({ visible: false, title: '选择施工内容', items: [] })

// 施工内容快捷选项（用于点击，也作为底部选择器数据）
const workTypes = [
  '水电改造', '防水工程', '瓦工贴砖', '水泥砂浆',
  '木工吊顶', '油漆工', '地板铺设', '门窗安装',
  '保洁开荒', '垃圾清运', '灯具安装', '开关插座',
  '全屋定制', '甲醛治理', '竣工验收', '其他工程',
]

let projectList = []

onMounted(() => {
  // 加载项目列表
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

  // 从 URL 参数读取项目信息（从项目详情页跳转来）
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const options = current.options || {}

  if (options.projectId) {
    form.value.project_id = parseInt(options.projectId)
    form.value.project_name = options.projectName ? decodeURIComponent(options.projectName) : ''
    form.value.location = options.projectAddress ? decodeURIComponent(options.projectAddress) : ''
    selectedProject.value = { id: form.value.project_id, name: form.value.project_name }
  }
})

const showProjectPicker = () => {
  projectPicker.value = {
    visible: true,
    title: '选择项目',
    items: projectList.map((p, i) => ({ name: p.name, icon: '📁', _index: i })),
  }
}

const onProjectSelect = ({ item }) => {
  const idx = item._index
  const p = projectList[idx]
  selectedProject.value = p
  form.value.project_id = p.id
  form.value.project_name = p.name
  // 自动填入项目地址
  if (p.customer_address || p.address) {
    form.value.location = p.customer_address || p.address
  }
  projectPicker.value.visible = false
}

const showWorkPicker = () => {
  workPicker.value = {
    visible: true,
    title: '选择施工内容',
    items: workTypes.map((w, i) => ({ name: w, icon: '🔧', _index: i })),
  }
}

const onWorkSelect = ({ item }) => {
  const work = workTypes[item._index]
  selectedWork.value = work
  form.value.content = work
  workPicker.value.visible = false
}

const onWorkChipClick = (work) => {
  selectedWork.value = work
  form.value.content = work
}

const onStartDateChange = (e) => {
  form.value.start_date = e.detail.value
}

function goBack() { uni.navigateBack() }

function submit() {
  console.log('submit 按钮被点击了')
  if (!form.value.project_id) { uni.showToast({ title: '请选择项目', icon: 'none' }); return }
  if (!form.value.content.trim()) { uni.showToast({ title: '请选择施工内容', icon: 'none' }); return }

  submitting.value = true
  console.log('开始发送请求')

  const userId = uni.getStorageSync('userInfo')?.id || ''
  console.log('userId:', userId)

  uni.request({
    url: '/api/dispatches',
    method: 'POST',
    header: { 'x-user-id': userId },
    data: {
      project_id: form.value.project_id,
      project_name: form.value.project_name,
      content: form.value.content,
      location: form.value.location,
      worker: form.value.worker,
      fee: form.value.fee || 0,
      start_date: form.value.start_date,
      requirement: form.value.requirement,
    },
    success: function(res) {
      console.log('请求成功, statusCode:', res.statusCode, 'data:', JSON.stringify(res.data))
      submitting.value = false
      if (res.data.code === 0 || res.data.code === undefined) {
        uni.showToast({ title: '提交成功', icon: 'success' })
        uni.$emit('dispatch-refresh')
        setTimeout(function() { uni.navigateBack() }, 1500)
      } else {
        console.log('业务错误:', res.data.msg || res.data.error)
        uni.showToast({ title: res.data.msg || res.data.error || '提交失败', icon: 'none' })
      }
    },
    fail: function(err) {
      console.log('请求失败:', JSON.stringify(err))
      submitting.value = false
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
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

/* 施工内容快捷选项 */
.work-chips-wrap { padding: 0 0 16rpx 160rpx; }
.work-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.work-chip {
  padding: 5px 14px; background: #F3F4F6;
  border-radius: 18px; font-size: 13px; color: #6B7280;
}
.work-chip.active { background: #1E3A5F; color: #fff; }

/* 项目横幅 */
.project-banner {
  font-size: 13px; color: #1E3A5F;
  background: #DBEAFE; padding: 8px 14px; font-weight: 500;
}

/* 导航栏 */
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
