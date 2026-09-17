<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">添加客户</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 表单主体（可滚动） -->
    <view class="form-body">
      <!-- 基本信息 -->
      <view class="form-section">
        <view class="section-title">基本信息</view>

        <view class="form-item">
          <text class="label">客户名称 <text class="required">*</text></text>
          <input class="input" v-model="form.name" placeholder="请输入客户姓名" />
        </view>

        <view class="form-item">
          <text class="label">联系电话 <text class="required">*</text></text>
          <input class="input" v-model="form.phone" type="number" placeholder="请输入手机号" @blur="checkPhone" />
          <view class="tip-error" v-if="phoneError">{{ phoneError }}</view>
        </view>

        <view class="form-item">
          <text class="label">性别</text>
          <view class="radio-group">
            <view class="radio-item" :class="{ active: form.gender === '男' }" @click="form.gender = '男'">男</view>
            <view class="radio-item" :class="{ active: form.gender === '女' }" @click="form.gender = '女'">女</view>
          </view>
        </view>

        <view class="form-item">
          <text class="label">来源</text>
          <picker :value="sourceIndex" :range="sourceOptions" @change="onSourceChange">
            <view class="picker-value">{{ form.source || '请选择来源' }}</view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">客户级别</text>
          <picker :value="levelIndex" :range="levelOptions" @change="onLevelChange">
            <view class="picker-value">{{ form.level || '请选择级别' }}</view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">状态</text>
          <picker :value="statusIndex" :range="statusOptions" @change="onStatusChange">
            <view class="picker-value">{{ form.status || '新客户' }}</view>
          </picker>
        </view>
      </view>

      <!-- 地址信息 -->
      <view class="form-section">
        <view class="section-title">地址信息</view>

        <view class="form-item">
          <text class="label">所在地区</text>
          <input class="input" v-model="form.area" placeholder="如：朝阳区" />
        </view>

        <view class="form-item">
          <text class="label">详细地址</text>
          <textarea class="textarea" v-model="form.address" placeholder="请输入详细地址" rows="2"></textarea>
        </view>
      </view>

      <!-- 需求信息 -->
      <view class="form-section">
        <view class="section-title">需求信息</view>

        <view class="form-item">
          <text class="label">预算</text>
          <input class="input" v-model="form.budget" type="number" placeholder="请输入预算金额（元）" />
        </view>

        <view class="form-item">
          <text class="label">装修需求</text>
          <textarea class="textarea" v-model="form.demand" placeholder="请描述客户装修需求，或点击下方标签快速添加" rows="3"></textarea>
          <!-- 标签快捷标签 -->
          <view class="tag-list">
            <view
              v-for="tag in demandTags"
              :key="tag"
              class="tag-item"
              :class="{ selected: form.demand.includes(tag) }"
              @click="toggleTag(tag)"
            >{{ tag }}</view>
          </view>
        </view>
      </view>

      <!-- 底部占位（浮动按钮高度） -->
      <view class="bottom-placeholder"></view>
    </view>

    <!-- 浮动保存按钮 -->
    <view class="float-bottom">
      <view class="btn-submit" @click="doSubmit">保存客户</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";

const form = ref({
  name: '',
  phone: '',
  gender: '',
  source: '',
  status: '新客户',
  level: '普通',
  area: '',
  address: '',
  budget: '',
  demand: '',
});

const phoneError = ref('');

const sourceOptions = ['自然进店', '电话咨询', '抖音', '微信', '朋友推荐', '小区推广', '展会', '其他'];
const levelOptions = ['普通', '重点', 'VIP'];
const statusOptions = ['新客户', '跟进中', '已预约', '已量房', '已出方案', '已成交', '已签约'];

// 装修需求快捷标签
const demandTags = [
  '毛坯房装修', '旧房翻新', '局部改造', '别墅装修', '商铺装修',
  '办公室装修', '水电改造', '防水工程', '贴砖铺砖', '吊顶隔断',
  '墙面涂料', '地板铺设', '门窗更换', '全屋定制', '家具软装',
];

const sourceIndex = ref(-1);
const levelIndex = ref(0);
const statusIndex = ref(0);

const onSourceChange = (e) => {
  sourceIndex.value = e.detail.value;
  form.value.source = sourceOptions[e.detail.value];
};

const onLevelChange = (e) => {
  levelIndex.value = e.detail.value;
  form.value.level = levelOptions[e.detail.value];
};

const onStatusChange = (e) => {
  statusIndex.value = e.detail.value;
  form.value.status = statusOptions[e.detail.value];
};

const toggleTag = (tag) => {
  if (form.value.demand.includes(tag)) {
    // 已选则取消（去掉这个标签及前后分隔符）
    form.value.demand = form.value.demand.replace(tag, '').replace(/[,，]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  } else {
    // 未选则追加
    if (form.value.demand && !form.value.demand.endsWith(',') && !form.value.demand.endsWith('，')) {
      form.value.demand += '，';
    }
    form.value.demand += tag + '，';
  }
};

const checkPhone = async () => {
  const phone = form.value.phone;
  if (!phone || phone.length !== 11) return;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/customers/check-phone?phone=${phone}`,
      header: { Authorization: token },
    });
    const data = res.data;
    if (data.exists) {
      if (data.code === 'SAME_CREATOR') {
        phoneError.value = '此号码是您添加的客户';
      } else if (data.code === 'DIFFERENT_CREATOR') {
        phoneError.value = data.message;
      } else if (data.code === 'UNCLAIMED') {
        phoneError.value = '此号码客户尚无归属，您可以直接添加';
      }
    } else {
      phoneError.value = '';
    }
  } catch (e) {
    console.log('校验失败', e);
  }
};

const doSubmit = async () => {
  if (!form.value.name) {
    uni.showToast({ title: '请输入客户名称', icon: 'none' });
    return;
  }
  if (!form.value.phone) {
    uni.showToast({ title: '请输入联系电话', icon: 'none' });
    return;
  }
  if (form.value.phone.length !== 11) {
    uni.showToast({ title: '手机号格式不正确', icon: 'none' });
    return;
  }

  // 清理 demand 末尾逗号
  const demand = form.value.demand.replace(/，$/, '').trim();

  uni.showLoading({ title: '保存中...' });
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/customers',
      method: 'POST',
      header: { Authorization: token, 'Content-Type': 'application/json' },
      data: { ...form.value, demand },
    });
    uni.hideLoading();
    if (res.data.id || res.data.message === '添加成功') {
      uni.showToast({ title: '添加成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else if (res.data.exists) {
      uni.showModal({
        title: '客户已存在',
        content: res.data.message + '，是否覆盖？',
        success: async (modal) => {
          if (modal.confirm) {
            await doUpdate(res.data.existing_id);
          }
        }
      });
    } else {
      uni.showToast({ title: res.data.message || '添加失败', icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '网络错误', icon: 'none' });
  }
};

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
}

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

.nav-back {
  font-size: 28px;
  font-weight: 300;
  width: 40px;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}

.nav-placeholder {
  width: 40px;
}

.form-body {
  padding: 15px;
  padding-bottom: 0;
}

.form-section {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 15px;
}

.section-title {
  font-size: 15px;
  font-weight: bold;
  color: #1E3A5F;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}

.form-item {
  margin-bottom: 15px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.required {
  color: #ff4d4f;
}

.input {
  width: 100%;
  height: 40px;
  background: #f8f8f8;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  background: #f8f8f8;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  box-sizing: border-box;
}

.picker-value {
  height: 40px;
  background: #f8f8f8;
  border-radius: 8px;
  padding: 0 12px;
  line-height: 40px;
  font-size: 14px;
  color: #333;
}

.radio-group {
  display: flex;
  gap: 10px;
}

.radio-item {
  width: 60px;
  height: 36px;
  background: #f8f8f8;
  border-radius: 8px;
  text-align: center;
  line-height: 36px;
  font-size: 14px;
  color: #666;
}

.radio-item.active {
  background: #1E3A5F;
  color: #fff;
}

.tip-error {
  font-size: 12px;
  color: #ff4d4f;
  margin-top: 4px;
}

/* 需求标签 */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.tag-item {
  padding: 5px 12px;
  background: #f0f0f0;
  border-radius: 16px;
  font-size: 12px;
  color: #666;
}

.tag-item.selected {
  background: #1E3A5F;
  color: #fff;
}

/* 底部占位 */
.bottom-placeholder {
  height: 80px;
}

/* 浮动保存按钮 */
.float-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.08);
  z-index: 200;
}

.btn-submit {
  height: 48px;
  background: #1E3A5F;
  color: #fff;
  border-radius: 24px;
  text-align: center;
  line-height: 48px;
  font-size: 16px;
  font-weight: 600;
}
</style>
