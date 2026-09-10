<template>
  <div class="system-settings">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>系统设置</span>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 短信设置 -->
        <el-tab-pane label="短信设置" name="sms">
          <el-form :model="smsForm" label-width="120px" style="max-width: 600px">
            <el-form-item label="短信服务商">
              <el-select v-model="smsForm.provider" placeholder="请选择短信服务商" style="width: 100%">
                <el-option label="阿里云短信" value="aliyun" />
                <el-option label="腾讯云短信" value="tencent" />
                <el-option label="华为云短信" value="huawei" />
              </el-select>
            </el-form-item>
            <el-form-item label="AccessKey ID">
              <el-input v-model="smsForm.access_key_id" placeholder="请输入 AccessKey ID" show-password />
            </el-form-item>
            <el-form-item label="AccessKey Secret">
              <el-input v-model="smsForm.access_key_secret" placeholder="请输入 AccessKey Secret" show-password />
            </el-form-item>
            <el-form-item label="签名名称">
              <el-select v-model="smsForm.sign_name" placeholder="请选择签名" style="width:100%">
                <el-option label="简逸装饰" value="简逸装饰" />
                <el-option label="北京福进万家房地产经纪" value="北京福进万家房地产经纪" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSmsSettings" :loading="saving">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 微信设置 -->
        <el-tab-pane label="微信设置" name="wechat">
          <el-form :model="wechatForm" label-width="120px" style="max-width: 600px">
            <el-form-item label="AppID">
              <el-input v-model="wechatForm.app_id" placeholder="请输入微信小程序 AppID" />
            </el-form-item>
            <el-form-item label="AppSecret">
              <el-input v-model="wechatForm.app_secret" placeholder="请输入 AppSecret" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveWechatSettings" :loading="saving">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 邮件设置 -->
        <el-tab-pane label="邮件设置" name="email">
          <el-form :model="emailForm" label-width="120px" style="max-width: 600px">
            <el-form-item label="SMTP 服务器">
              <el-input v-model="emailForm.smtp_host" placeholder="例如：smtp.exmail.qq.com" />
            </el-form-item>
            <el-form-item label="SMTP 端口">
              <el-input v-model="emailForm.smtp_port" placeholder="例如：465" />
            </el-form-item>
            <el-form-item label="邮箱账号">
              <el-input v-model="emailForm.smtp_user" placeholder="请输入邮箱账号" />
            </el-form-item>
            <el-form-item label="邮箱密码">
              <el-input v-model="emailForm.smtp_password" placeholder="请输入授权码或密码" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveEmailSettings" :loading="saving">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const activeTab = ref('sms')
const saving = ref(false)

const smsForm = reactive({
  provider: 'aliyun',
  access_key_id: '',
  access_key_secret: '',
  sign_name: ''
})

const wechatForm = reactive({
  app_id: '',
  app_secret: ''
})

const emailForm = reactive({
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_password: ''
})

const loadSettings = async () => {
  try {
    const { data } = await axios.get('/api/system-settings')
    if (data.sms) {
      Object.assign(smsForm, data.sms)
    }
    if (data.wechat) {
      Object.assign(wechatForm, data.wechat)
    }
    if (data.email) {
      Object.assign(emailForm, data.email)
    }
  } catch (error) {
    // 加载失败时保持默认空值
  }
}

const saveSmsSettings = async () => {
  saving.value = true
  try {
    await axios.put('/api/system-settings/sms', smsForm)
    ElMessage.success('短信设置保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const saveWechatSettings = async () => {
  saving.value = true
  try {
    await axios.put('/api/system-settings/wechat', wechatForm)
    ElMessage.success('微信设置保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const saveEmailSettings = async () => {
  saving.value = true
  try {
    await axios.put('/api/system-settings/email', emailForm)
    ElMessage.success('邮件设置保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.system-settings {
  padding: 20px;
}
.card-header {
  font-size: 16px;
  font-weight: 600;
}
</style>
