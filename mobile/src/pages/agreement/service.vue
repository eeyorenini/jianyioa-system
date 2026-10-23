<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">用户服务协议</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="content">
      <view class="section">
        <text class="title">一、协议范围</text>
        <text class="para">
          本协议是您与简逸装饰（以下简称"我们"）之间关于使用简逸装饰工地管理系统小程序及相关服务所订立的协议。
          请您在使用本服务前仔细阅读本协议，尤其是以粗体或下划线标识的条款。如您不同意本协议任何条款，请停止使用本服务。
        </text>
      </view>

      <view class="section">
        <text class="title">二、服务内容</text>
        <text class="para">
          我们向您提供以下服务：
        </text>
        <text class="list-item">1. 装修项目进度查询与管理；</text>
        <text class="list-item">2. 施工日志、巡检记录查看；</text>
        <text class="list-item">3. 材料采购申请与审批；</text>
        <text class="list-item">4. 合同、增减项及财务收支管理；</text>
        <text class="list-item">5. 消息通知与待办提醒；</text>
        <text class="list-item">6. 其他经我们不时新增或调整的功能。</text>
        <text class="para">
          我们有权根据业务发展需要，随时调整、中断或终止部分或全部服务，并会提前通过公告或消息通知的方式告知您。
        </text>
      </view>

      <view class="section">
        <text class="title">三、账号注册与使用</text>
        <text class="para">
          1. 您注册账号时须提供真实、准确、完整的个人信息（包括但不限于手机号、姓名）。
          如信息发生变更，您应及时更新。
        </text>
        <text class="para">
          2. 员工账号由管理员统一创建并分配，初始密码应及时修改。您须对账号下的一切行为负责。
        </text>
        <text class="para">
          3. 未经我们书面同意，您不得将账号转让、出借或以任何方式许可他人使用。
        </text>
        <text class="para">
          4. 如您发现账号被盗用或存在安全风险，应立即联系我们处理。
        </text>
      </view>

      <view class="section">
        <text class="title">四、用户行为规范</text>
        <text class="para">
          您在使用本服务时，应遵守法律法规及本协议约定，不得从事以下行为：
        </text>
        <text class="list-item">1. 发布、传播违法、违规、侵权或虚假内容；</text>
        <text class="list-item">2. 干扰、破坏本服务的正常运行，或攻击我们的服务器、网络；</text>
        <text class="list-item">3. 未经授权访问他人账号或数据；</text>
        <text class="list-item">4. 利用本服务从事任何营利性或非法活动；</text>
        <text class="list-item">5. 其他我们有合理理由认为不适当的行为。</text>
      </view>

      <view class="section">
        <text class="title">五、信息授权与隐私保护</text>
        <text class="para">
          1. 您理解并同意，为向您提供本服务，我们需要收集、存储和使用您的相关信息。
          具体收集范围、目的、方式及保护措施详见《隐私政策》。
        </text>
        <text class="para">
          2. 您授权我们在以下情形中使用您的信息：
          项目进度同步、施工日志推送、巡检整改通知、材料采购审批流转、财务收支提醒等。
        </text>
        <text class="para">
          3. 我们将采取合理的安全措施保护您的个人信息，防止信息泄露、损毁或丢失。
        </text>
      </view>

      <view class="section">
        <text class="title">六、知识产权</text>
        <text class="para">
          1. 本服务中的所有内容（包括但不限于文字、图片、图标、界面设计、代码等）的知识产权均归我们或相关权利人所有。
        </text>
        <text class="para">
          2. 未经我们书面许可，您不得复制、修改、传播、反向工程或以其他方式使用上述内容。
        </text>
      </view>

      <view class="section">
        <text class="title">七、免责声明</text>
        <text class="para">
          1. 本服务按"现状"和"可用性"提供，我们不就服务的连续性、安全性、准确性作出任何明示或默示的担保。
        </text>
        <text class="para">
          2. 因不可抗力（包括但不限于自然灾害、政府行为、网络故障、黑客攻击等）导致的服务中断或数据丢失，我们不承担责任。
        </text>
        <text class="para">
          3. 您因违反本协议或相关法律法规而导致的任何损失，由您自行承担。
        </text>
      </view>

      <view class="section">
        <text class="title">八、协议变更与终止</text>
        <text class="para">
          1. 我们有权根据法律法规变化或业务调整，适时修改本协议。修改后的协议将在本服务内公布，公布后即为生效。
        </text>
        <text class="para">
          2. 如您不同意修改后的协议，应停止使用本服务；如您继续使用，视为同意修改后的协议。
        </text>
        <text class="para">
          3. 如您违反本协议，我们有权暂停或终止向您提供服务，并保留追究法律责任的权利。
        </text>
      </view>

      <view class="section">
        <text class="title">九、争议解决</text>
        <text class="para">
          本协议的订立、生效、履行、解释及争议解决均适用中华人民共和国法律。
          如发生争议，双方应友好协商解决；协商不成的，任何一方均可向我们所在地有管辖权的人民法院提起诉讼。
        </text>
      </view>

      <view class="section">
        <text class="title">十、联系方式</text>
        <text class="para">
          如您对本协议有任何疑问，可通过以下方式联系我们：
        </text>
        <text class="list-item">公司名称：简逸装饰</text>
        <text class="list-item">联系电话：请通过小程序"我的 → 联系客服"获取</text>
        <text class="list-item">更新时间：2026年10月23日</text>
      </view>
    </view>
  </view>
</template>

<script setup>
const goBack = () => {
  let canBack = false;
  try {
    const fn = typeof getCurrentPages === "function" ? getCurrentPages : globalThis.getCurrentPages;
    canBack = typeof fn === "function" && (fn() || []).length > 1;
  } catch (_) {
    canBack = false;
  }
  if (canBack) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/landing/index" });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f7fa;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e3a5f;
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

.content {
  padding: 24px 20px 40px;
  background: #fff;
  margin: 12px;
  border-radius: 12px;
}

.section {
  margin-bottom: 22px;
}

.title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #1a1f36;
  margin-bottom: 10px;
}

.para {
  display: block;
  font-size: 14px;
  line-height: 1.8;
  color: #4b5563;
  margin-bottom: 8px;
  text-align: justify;
}

.list-item {
  display: block;
  font-size: 14px;
  line-height: 1.8;
  color: #4b5563;
  padding-left: 8px;
  margin-bottom: 4px;
}
</style>
