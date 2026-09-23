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

        <!-- 微信设置（三个子Tab） -->
        <el-tab-pane label="微信设置" name="wechat">
          <el-tabs v-model="wechatSubTab" style="margin-left: 0">
            <!-- 微信公众号配置 -->
            <el-tab-pane label="微信公众号" name="mp">
              <el-alert type="info" :closable="false" style="margin-bottom: 20px">
                用于推送模板消息、网页授权登录。需在微信公众平台设置 IP 白名单和服务器域名。
              </el-alert>
              <el-form :model="mpForm" label-width="130px" style="max-width: 650px">
                <el-form-item label="AppID">
                  <el-input v-model="mpForm.app_id" placeholder="请输入微信公众号 AppID" />
                </el-form-item>
                <el-form-item label="AppSecret">
                  <el-input v-model="mpForm.app_secret" placeholder="请输入 AppSecret" show-password />
                </el-form-item>
                <el-form-item label="Token">
                  <el-input v-model="mpForm.token" placeholder="用于微信回调验证" />
                </el-form-item>
                <el-form-item label="EncodingAESKey">
                  <el-input v-model="mpForm.aes_key" placeholder="消息加解密密钥（可选）" show-password />
                </el-form-item>
                <el-form-item label="模板消息ID">
                  <el-input v-model="mpForm.template_id" placeholder="用于推送通知的模板消息ID" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="saveWechatConfig" :loading="saving">保存配置</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <!-- 微信小程序配置 -->
            <el-tab-pane label="微信小程序" name="mini">
              <el-alert type="info" :closable="false" style="margin-bottom: 20px">
                用于小程序内获取用户手机号、昵称，以及发送服务通知。
              </el-alert>
              <el-form :model="miniForm" label-width="130px" style="max-width: 650px">
                <el-form-item label="AppID">
                  <el-input v-model="miniForm.app_id" placeholder="请输入小程序 AppID" />
                </el-form-item>
                <el-form-item label="AppSecret">
                  <el-input v-model="miniForm.app_secret" placeholder="请输入 AppSecret" show-password />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="saveWechatConfig" :loading="saving">保存配置</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <!-- 开放平台配置 -->
            <el-tab-pane label="开放平台" name="openplatform">
              <el-alert type="info" :closable="false" style="margin-bottom: 20px">
                绑定公众号+小程序后，可获取 UnionID 实现跨平台用户身份打通。
              </el-alert>
              <el-form :model="openForm" label-width="130px" style="max-width: 650px">
                <el-form-item label="AppID">
                  <el-input v-model="openForm.app_id" placeholder="请输入开放平台 AppID" />
                </el-form-item>
                <el-form-item label="AppSecret">
                  <el-input v-model="openForm.app_secret" placeholder="请输入 AppSecret" show-password />
                </el-form-item>
                <el-form-item label="Token">
                  <el-input v-model="openForm.token" placeholder="用于开放平台回调验证" />
                </el-form-item>
                <el-form-item label="EncodingAESKey">
                  <el-input v-model="openForm.aes_key" placeholder="消息加解密密钥（可选）" show-password />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="saveWechatConfig" :loading="saving">保存配置</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
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

        <!-- 通知设置 -->
        <el-tab-pane label="通知设置" name="notifications">
          <div style="max-width: 700px">
            <el-alert type="info" :closable="false" style="margin-bottom: 20px">
              开启/关闭各类业务通知，并设置通知发送给哪些角色（站内消息 / 短信 / 微信）
            </el-alert>
            <el-form :model="notifForm" label-width="140px">
              <div v-for="(rule, key) in notifForm.rules" :key="key" class="notif-rule-item">
                <el-divider content-position="left">{{ notifForm.labels[key] }}</el-divider>
                <el-form-item label="启用通知">
                  <el-switch v-model="rule.enabled" />
                </el-form-item>
                <el-form-item label="通知渠道">
                  <el-checkbox-group v-model="rule.channels">
                    <el-checkbox label="inapp">站内消息</el-checkbox>
                    <el-checkbox label="sms">短信</el-checkbox>
                    <el-checkbox label="wechat">微信</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item label="接收人">
                  <el-checkbox-group v-model="rule.receivers">
                    <el-checkbox label="manager">项目经理</el-checkbox>
                    <el-checkbox label="designer">设计师</el-checkbox>
                    <el-checkbox label="supervisor">监理</el-checkbox>
                    <el-checkbox label="customer">客户</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
              </div>
              <el-form-item>
                <el-button type="primary" @click="saveNotifSettings" :loading="saving">保存通知设置</el-button>
              </el-form-item>
            </el-form>
          </div>
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
const wechatSubTab = ref('mp')
const saving = ref(false)

const smsForm = reactive({
  provider: 'aliyun',
  access_key_id: '',
  access_key_secret: '',
  sign_name: ''
})

// 微信公众号表单
const mpForm = reactive({
  app_id: '',
  app_secret: '',
  token: '',
  aes_key: '',
  template_id: ''
})

// 微信小程序表单
const miniForm = reactive({
  app_id: '',
  app_secret: ''
})

// 开放平台表单
const openForm = reactive({
  app_id: '',
  app_secret: '',
  token: '',
  aes_key: ''
})

const emailForm = reactive({
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_password: ''
})

const notifForm = reactive({
  labels: {
    node_completed: '节点完成',
    project_progress: '项目进展提交',
    inspection_submit: '巡检验收提交',
  },
  rules: {
    node_completed:    { enabled: true, channels: ['inapp'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    project_progress:  { enabled: true, channels: ['inapp'], receivers: ['manager', 'designer', 'supervisor', 'customer'] },
    inspection_submit: { enabled: true, channels: ['inapp'], receivers: ['manager', 'supervisor'] },
  }
})

const loadSettings = async () => {
  try {
    const { data } = await axios.get('/api/system-settings')
    if (data.sms) {
      Object.assign(smsForm, data.sms)
    }
    if (data.email) {
      Object.assign(emailForm, data.email)
    }
    // 加载通知规则
    try {
      const { data: notifData } = await axios.get('/api/system-settings/notifications')
      if (notifData && typeof notifData === 'object') {
        for (const key of Object.keys(notifData)) {
          if (notifForm.rules[key]) {
            Object.assign(notifForm.rules[key], notifData[key])
          }
        }
      }
    } catch {}
  } catch (error) {
    // 加载失败时保持默认空值
  }
}

// 加载微信配置（三个平台）
const loadWechatConfig = async () => {
  try {
    const { data } = await axios.get('/api/wechat/config')
    if (data.mp) Object.assign(mpForm, data.mp)
    if (data.mini) Object.assign(miniForm, data.mini)
    if (data.openplatform) Object.assign(openForm, data.openplatform)
  } catch (error) {
    console.error('加载微信配置失败', error)
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

const saveWechatConfig = async () => {
  saving.value = true
  try {
    await axios.put('/api/wechat/config', {
      mp: { ...mpForm },
      mini: { ...miniForm },
      openplatform: { ...openForm }
    })
    ElMessage.success('微信配置保存成功')
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

const saveNotifSettings = async () => {
  saving.value = true
  try {
    await axios.put('/api/system-settings/notifications', notifForm.rules)
    ElMessage.success('通知设置保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadWechatConfig()
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
.notif-rule-item {
  margin-bottom: 10px;
  padding: 10px 0;
}
</style>
