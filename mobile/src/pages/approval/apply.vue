<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">发起审批</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="form-container">
      <!-- 标题 -->
      <view class="form-item">
        <view class="form-label required">标题</view>
        <input class="form-input" v-model="form.title" placeholder="请输入审批标题" />
      </view>

      <!-- 类型 -->
      <view class="form-item">
        <view class="form-label required">审批类型</view>
        <picker mode="selector" :range="typeOptions" range-key="label" @change="onTypeChange">
          <view class="form-picker">
            {{ currentTypeLabel }}
          </view>
        </picker>
      </view>

      <!-- 审批人 -->
      <view class="form-item">
        <view class="form-label required">审批人</view>
        <picker mode="selector" :range="employeeOptions" range-key="name" @change="onApproverChange">
          <view class="form-picker" :class="{ placeholder: !form.approver_id }">
            {{ form.approver_name || '请选择审批人' }}
          </view>
        </picker>
      </view>

      <!-- 金额 -->
      <view class="form-item">
        <view class="form-label">金额</view>
        <input class="form-input" type="digit" v-model="form.amount" placeholder="请输入金额（选填）" />
      </view>

      <!-- 说明 -->
      <view class="form-item">
        <view class="form-label">说明</view>
        <textarea class="form-textarea" v-model="form.content" placeholder="请输入审批说明" />
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-bar">
      <view class="submit-btn" :class="{ disabled: submitting }" @click="handleSubmit">
        {{ submitting ? '提交中...' : '提交审批' }}
      </view>
    </view>
  </view>
</template>

<script>
const apiBase = ''  // 空字符串，使用相对路径，通过vite代理或实际域名访问

export default {
  data() {
    return {
      form: { title: '', type: '报销', approver_id: null, approver_name: '', amount: '', content: '' },
      employeeOptions: [],
      submitting: false
    }
  },
  computed: {
    typeOptions() {
      return [
        { label: '报销', value: '报销' },
        { label: '支出', value: '支出' },
        { label: '请假', value: '请假' },
        { label: '采购', value: '采购' },
        { label: '付款', value: '付款' },
        { label: '其他', value: '其他' }
      ]
    },
    currentTypeLabel() {
      const found = this.typeOptions.find(t => t.value === this.form.type)
      return found ? found.label : '报销'
    }
  },
  onLoad() { this.loadEmployees() },
  methods: {
    goBack() { uni.navigateBack() },
    onTypeChange(e) { this.form.type = this.typeOptions[e.detail.value].value },
    onApproverChange(e) {
      const emp = this.employeeOptions[e.detail.value]
      this.form.approver_id = emp.id
      this.form.approver_name = emp.name
    },
    loadEmployees() {
      uni.request({
        url: `${apiBase}/api/employees`,
        success: (res) => {
          if (res.data) this.employeeOptions = res.data
        }
      })
    },
    handleSubmit() {
      if (!this.form.title.trim()) { uni.showToast({ title: '请输入标题', icon: 'none' }); return }
      if (!this.form.approver_id) { uni.showToast({ title: '请选择审批人', icon: 'none' }); return }
      this.submitting = true
      uni.request({
        url: `${apiBase}/api/approvals`,
        method: 'POST',
        data: {
          title: this.form.title,
          type: this.form.type,
          approver_id: this.form.approver_id,
          approver_name: this.form.approver_name,
          approver_ids: this.form.approver_id.toString(),
          approver_names: this.form.approver_name,
          amount: this.form.amount || 0,
          content: this.form.content
        },
        success: (res) => {
          if (res.statusCode === 200 || res.data.id) {
            uni.showToast({ title: '提交成功', icon: 'success' })
            setTimeout(() => { uni.navigateBack() }, 1500)
          } else {
            uni.showToast({ title: res.data.error || '提交失败', icon: 'none' })
          }
        },
        fail: () => { uni.showToast({ title: '提交失败', icon: 'none' }) },
        complete: () => { this.submitting = false }
      })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: #fff; }
.nav-back { font-size: 24px; color: #333; }
.nav-title { font-size: 16px; font-weight: bold; color: #333; }
.nav-placeholder { width: 24px; }
.form-container { flex: 1; padding: 15px; }
.form-item { background: #fff; border-radius: 8px; padding: 12px 15px; margin-bottom: 10px; }
.form-label { font-size: 14px; color: #333; margin-bottom: 8px; }
.form-label.required::before { content: '*'; color: #ff4d4f; margin-right: 4px; }
.form-input { font-size: 14px; color: #333; width: 100%; }
.form-picker { font-size: 14px; color: #333; padding: 4px 0; }
.form-picker.placeholder { color: #999; }
.form-textarea { font-size: 14px; color: #333; width: 100%; min-height: 100px; border: none; }
.submit-bar { padding: 15px; background: #fff; border-top: 1px solid #eee; }
.submit-btn { background: #1890ff; color: #fff; text-align: center; padding: 14px; border-radius: 8px; font-size: 15px; }
.submit-btn.disabled { background: #ccc; }
</style>
