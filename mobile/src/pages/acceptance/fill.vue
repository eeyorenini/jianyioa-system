<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">{{ template.name || '验收单' }}</text>
      <text class="nav-right" @click="submit">{{ submitting ? '提交中' : '提交' }}</text>
    </view>

    <view class="loading-state" v-if="loading"><text>加载验收标准...</text></view>

    <template v-else>
      <!-- 项目 + 单头 -->
      <view class="head-card">
        <view class="head-row" @click="chooseProject">
          <text class="head-label">项目</text>
          <text class="head-value">{{ projectName || '请选择项目' }}</text>
          <text class="head-arrow">›</text>
        </view>
        <view class="head-row">
          <text class="head-label">验收日期</text>
          <picker mode="date" :value="acceptDate" @change="onDateChange">
            <text class="head-value">{{ acceptDate }}</text>
          </picker>
        </view>
        <view class="head-row" v-if="needArea">
          <text class="head-label">验收区域</text>
          <view class="area-tags">
            <text
              v-for="a in areaOptions"
              :key="a"
              class="area-tag"
              :class="{ active: area === a }"
              @click="area = a"
            >{{ a }}</text>
          </view>
        </view>
        <view class="head-row" v-if="needBatch">
          <text class="head-label">进场批次</text>
          <view class="area-tags">
            <text
              v-for="b in [1, 2, 3, 4]"
              :key="b"
              class="area-tag"
              :class="{ active: batchNo === b }"
              @click="batchNo = b"
            >第 {{ b }} 批</text>
          </view>
        </view>
      </view>

      <!-- 手册出处 -->
      <view class="source-bar">
        <text class="source-text">{{ template.source }}</text>
        <text class="source-intro">{{ template.intro }}</text>
      </view>

      <!-- 逐项 -->
      <view class="group" v-for="(g, gi) in groups" :key="gi">
        <view class="group-title">
          <text>{{ g.name }}</text>
          <text class="group-count">{{ verdictCount(g) }}</text>
        </view>

        <view class="item" v-for="it in g.items" :key="it.item_code">
          <view class="item-head">
            <text class="item-seq">{{ it.seq }}</text>
            <view class="item-body">
              <view class="item-title-row">
                <text class="item-title">{{ it.title }}</text>
                <text class="red-flag" v-if="it.severity === 'red'">红线</text>
              </view>
              <text class="item-standard" v-if="it.standard">{{ it.standard }}</text>
              <text class="item-metric" v-if="it.metric">标准值：{{ it.metric }}</text>
            </view>
          </view>

          <!-- 判定（除评级项外全部要有三态判定；number 类也要能判合格/不合格） -->
          <view class="verdict-row" v-if="it.kind !== 'rating'">
            <text
              class="v-btn pass"
              :class="{ on: it.verdict === 'pass' }"
              @click="setVerdict(it, 'pass')"
            >合格</text>
            <text
              class="v-btn fail"
              :class="{ on: it.verdict === 'fail' }"
              @click="setVerdict(it, 'fail')"
            >不合格</text>
            <text
              class="v-btn na"
              :class="{ on: it.verdict === 'na' }"
              @click="setVerdict(it, 'na')"
            >不适用</text>
          </view>

          <!-- 评级（评价表） -->
          <view class="verdict-row" v-if="it.kind === 'rating'">
            <text
              v-for="r in ['优', '良', '一般']"
              :key="r"
              class="v-btn pass"
              :class="{ on: it.value === r }"
              @click="setRating(it, r)"
            >{{ r }}</text>
          </view>

          <!-- 实测值 -->
          <view class="value-row" v-if="it.kind === 'number' || it.metric">
            <text class="value-label">实测</text>
            <input class="value-input" v-model="it.value" :placeholder="it.metric || '填写实测值'" />
            <text class="value-unit">{{ it.unit }}</text>
          </view>

          <!-- 不合格必填说明 -->
          <input
            class="remark-input"
            v-if="it.verdict === 'fail'"
            v-model="it.remark"
            placeholder="不合格说明（必填，会写入整改单）"
          />

          <!-- 逐项拍照：每一项都能单独留证据，最多 3 张 -->
          <view class="photo-row">
            <view class="photo" v-for="(p, pi) in it.photos" :key="pi">
              <image class="photo-img" :src="absAsset(p)" mode="aspectFill" @click="preview(it.photos, pi)" />
              <text class="photo-del" @click.stop="removePhoto(it, pi)">×</text>
            </view>
            <view class="photo-add" v-if="it.photos.length < 3" @click="addPhoto(it)">
              <text class="pa-plus">+</text>
              <text class="pa-text">拍照</text>
            </view>
            <text class="photo-count" v-if="it.photos.length">{{ it.photos.length }}/3</text>
          </view>
        </view>
      </view>

      <!-- 签字区 -->
      <view class="sign-block">
        <view class="group-title">
          <text>验收签字</text>
          <text class="group-count">{{ progressText }}</text>
        </view>

        <!-- 应签角色 -->
        <view class="sign-roles">
          <text
            v-for="r in requireRoles"
            :key="r.role"
            class="role-chip"
            :class="{ on: signRole === r.role }"
            @click="signRole = r.role"
          >{{ r.label }}</text>
        </view>

        <!-- 未保存签名 -->
        <view class="sign-warn" v-if="!mySign.exists">
          <text class="sw-title">你还没有保存手写签名</text>
          <text class="sw-sub">验收单需要本人签名，先去个人中心签写一次，以后填单直接调用。</text>
          <view class="sw-btn" @click="goSignature">去签写签名 ›</view>
        </view>

        <!-- 已保存签名 -->
        <template v-else>
          <view class="sign-preview" @click="previewMySign">
            <image class="sp-img" :src="absAsset(mySign.sign_url)" mode="aspectFit" />
            <text class="sp-tag">{{ mySign.sign_name || userName }}</text>
          </view>
          <view class="sign-confirm" @click="signChecked = !signChecked">
            <view class="cb" :class="{ on: signChecked }">
              <text v-if="signChecked">✓</text>
            </view>
            <text class="sc-text">我已现场核对以上结果，签署本人签名</text>
          </view>
          <text class="sign-hint" v-if="signChecked">将以「{{ roleLabel(signRole) }}」身份签字</text>
        </template>

        <!-- 其他应签角色提示 -->
        <text class="sign-note" v-if="requireRoles.length > 1">
          本单需 {{ requireRoles.map(r => r.label).join(' + ') }} 签字，其余人可在报告页补签。
        </text>
      </view>

      <!-- 备注 -->
      <view class="group">
        <view class="group-title"><text>整体备注</text></view>
        <textarea class="remark-area" v-model="remark" placeholder="整体说明（整改项目、约定完成日期等）" />
      </view>

      <view class="tip-box">
        <text class="tip-text">判定规则：红线项不合格 → 整单不合格并阻断下道工序；一般项不合格 → 整单整改中，自动生成整改单，闭环后方可标记节点完成。</text>
      </view>

      <!-- 底部提交条 -->
      <view class="bottom-bar">
        <view class="stat">
          <text class="stat-num">{{ stats.pass }}</text><text class="stat-label">合格</text>
          <text class="stat-num fail">{{ stats.fail }}</text><text class="stat-label">不合格</text>
          <text class="stat-num red" v-if="stats.red">{{ stats.red }}</text>
          <text class="stat-label red" v-if="stats.red">红线</text>
        </view>
        <view class="submit-btn" :class="{ disabled: submitting }" @click="submit">提交验收</view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { authHeader, guardTab } from '@/utils/permission';
import { chooseAndUpload, absAsset } from '@/utils/api';
import { pickProject } from '@/utils/projectPicker';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const userName = computed(() => userStore.state.name || '');

const projectId = ref(0);
const projectName = ref('');
const code = ref('');
const template = ref({});
const groups = ref([]);
const acceptDate = ref(todayStr());
const area = ref('');
const batchNo = ref(1);
const remark = ref('');
const loading = ref(true);
const submitting = ref(false);

// 签字
const mySign = ref({ exists: false, sign_url: '', sign_name: '' });
const signChecked = ref(false);
const signRole = ref('');

const ROLE_LABEL = { foreman: '项目经理', supervisor: '工程监理', designer: '设计师' };

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const needArea = computed(() => code.value === 'water_test');
const needBatch = computed(() => code.value === 'main_material');
const areaOptions = ['厨房', '卫生间', '其他'];

/** 本单应签角色（去掉 customer，业主签字暂不启用） */
const requireRoles = computed(() => {
  const roles = (template.value.signRoles || []).filter((r) => ROLE_LABEL[r]);
  const list = roles.length ? roles : ['foreman'];
  return list.map((r) => ({ role: r, label: ROLE_LABEL[r] }));
});

const progressText = computed(() => {
  if (!mySign.value.exists) return '待签名';
  return signChecked.value ? '本人已签' : '已存档';
});

const allItems = computed(() => groups.value.reduce((a, g) => a.concat(g.items), []));

const stats = computed(() => {
  const s = { pass: 0, fail: 0, red: 0 };
  allItems.value.forEach((it) => {
    const ok = it.kind === 'rating' ? !!it.value : it.verdict === 'pass';
    if (ok) s.pass += 1;
    else if (it.verdict === 'fail') {
      s.fail += 1;
      if (it.severity === 'red') s.red += 1;
    }
  });
  return s;
});

function roleLabel(r) { return ROLE_LABEL[r] || r; }

function verdictCount(g) {
  const done = g.items.filter((i) => i.verdict !== 'pending' || i.value).length;
  return `${done}/${g.items.length}`;
}

function setVerdict(it, v) {
  it.verdict = it.verdict === v ? 'pending' : v;
}

function setRating(it, r) {
  it.value = it.value === r ? '' : r;
  it.verdict = it.value ? 'pass' : 'pending';
}

function onDateChange(e) {
  acceptDate.value = e.detail.value;
}

function preview(list, idx) {
  uni.previewImage({ urls: list.map(absAsset), current: absAsset(list[idx]) });
}

function previewMySign() {
  if (mySign.value.sign_url) uni.previewImage({ urls: [absAsset(mySign.value.sign_url)] });
}

async function addPhoto(it) {
  const left = 3 - it.photos.length;
  if (left <= 0) return;
  const urls = await chooseAndUpload(left);
  if (urls.length) it.photos = it.photos.concat(urls).slice(0, 3);
}

function removePhoto(it, pi) {
  it.photos.splice(pi, 1);
}

async function chooseProject() {
  const p = await pickProject('选择验收项目');
  if (p) { projectId.value = p.id; projectName.value = p.name; }
}

/** 按当前登录人猜测要签的角色 */
function guessRole() {
  const pos = String(userStore.state.position || '') + String(userStore.state.role_name || '') + String(userStore.state.role_code || '');
  const list = requireRoles.value.map((r) => r.role);
  let guess = 'foreman';
  if (/监理|Engineer/i.test(pos)) guess = 'supervisor';
  else if (/设计|designer/i.test(pos)) guess = 'designer';
  if (list.includes(guess)) return guess;
  return list[0] || 'foreman';
}

async function loadMySign() {
  try {
    const res = await uni.request({ url: '/api/signatures/me', header: authHeader() });
    const d = res.data || {};
    mySign.value = {
      exists: !!d.exists,
      sign_url: d.sign_url || '',
      sign_name: d.sign_name || '',
    };
  } catch (e) {
    mySign.value = { exists: false, sign_url: '', sign_name: '' };
  }
}

async function loadTemplate() {
  loading.value = true;
  try {
    const res = await uni.request({
      url: `/api/acceptance-sheets/types/${code.value}`,
      header: authHeader(),
    });
    const tpl = res.data && res.data.template;
    if (!tpl) { uni.showToast({ title: '验收类型不存在', icon: 'none' }); return; }
    template.value = {
      name: tpl.name, trade: tpl.trade, source: tpl.source, intro: tpl.intro,
      signRoles: tpl.signRoles || [],
    };
    signRole.value = guessRole();
    const map = {};
    (tpl.items || []).forEach((it) => {
      const gname = it.group_name || '验收项目';
      if (!map[gname]) map[gname] = { name: gname, items: [] };
      map[gname].items.push({
        seq: it.seq, item_code: it.item_code, title: it.title, standard: it.standard,
        metric: it.metric, severity: it.severity, kind: it.kind, unit: it.unit,
        verdict: 'pending', value: '', remark: '', photos: [],
      });
    });
    groups.value = Object.values(map);
  } catch (e) {
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function goSignature() {
  uni.navigateTo({ url: '/pages/mine/signature' });
}

function submit() {
  if (submitting.value) return;
  if (!projectId.value) { uni.showToast({ title: '请先选择项目', icon: 'none' }); return; }
  // 签名是硬前置：没存档签名就不让提交，避免走到服务端才报错
  if (!mySign.value.exists) {
    uni.showModal({
      title: '还没有手写签名',
      content: '验收单需要本人签字。请先在「我的 → 我的签名」手写保存，再回来提交。',
      confirmText: '去签写',
      success: (r) => { if (r.confirm) goSignature(); },
    });
    return;
  }
  const pending = allItems.value.filter((it) => it.kind !== 'rating' && it.verdict === 'pending');
  if (pending.length) {
    uni.showModal({ title: '还有未判定项', content: `还有 ${pending.length} 项未判定，确定提交？`, success: (r) => { if (r.confirm) doSubmit(); } });
    return;
  }
  const noRemark = allItems.value.filter((it) => it.verdict === 'fail' && !it.remark);
  if (noRemark.length) { uni.showToast({ title: '不合格项需填写说明', icon: 'none' }); return; }
  doSubmit();
}

async function doSubmit() {
  submitting.value = true;
  uni.showLoading({ title: '提交中' });
  try {
    const items = allItems.value.map((it) => ({
      item_code: it.item_code,
      verdict: it.kind === 'rating' ? (it.value ? 'pass' : 'pending') : it.verdict,
      value: it.kind === 'rating' ? it.value : (it.value || ''),
      remark: it.remark || '',
      photos: it.photos || [],
    }));
    const res = await uni.request({
      url: '/api/acceptance-sheets',
      method: 'POST',
      header: { ...authHeader(), 'Content-Type': 'application/json' },
      data: {
        project_id: projectId.value,
        template_code: code.value,
        accept_date: acceptDate.value,
        area: needArea.value ? area.value : '',
        batch_no: needBatch.value ? batchNo.value : null,
        remark: remark.value,
        items,
        own_sign: signChecked.value ? { role: signRole.value } : null,
      },
    });
    uni.hideLoading();
    const d = res.data || {};
    if (d.id) {
      // 用 replace 而不是 redirect：返回时直接回验收中心，不再回到填单页
      uni.redirectTo({ url: `/pages/acceptance/report?id=${d.id}&fresh=1` });
    } else {
      uni.showToast({ title: d.error || '提交失败', icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) uni.switchTab({ url: '/pages/home/index' });
  else uni.navigateBack();
};

onLoad((options) => {
  if (!guardTab('acceptance:write')) return;
  code.value = (options && options.code) || '';
  projectId.value = parseInt((options && options.projectId) || '0', 10);
  projectName.value = (options && options.projectName) ? decodeURIComponent(options.projectName) : '';
  if (!code.value) { uni.showToast({ title: '缺少验收类型', icon: 'none' }); return; }
  loadTemplate();
  loadMySign();
});

// 从签名页返回时刷新签名状态
onShow(() => {
  if (!loading.value) loadMySign();
});
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding: 16px; padding-bottom: 120px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100;
  margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; }
.nav-right { width: 48px; text-align: right; font-size: 14px; color: #93C5FD; }

.loading-state { text-align: center; padding: 60px; color: #9CA3AF; font-size: 14px; }

.head-card { background: #fff; border-radius: 12px; padding: 4px 14px; margin-top: 12px; }
.head-row { display: flex; align-items: center; padding: 11px 0; border-bottom: 1px solid #F3F4F6; }
.head-row:last-child { border-bottom: none; }
.head-label { width: 72px; font-size: 14px; color: #6B7280; flex-shrink: 0; }
.head-value { flex: 1; font-size: 14px; color: #1A1F36; font-weight: 500; }
.head-arrow { font-size: 20px; color: #D1D5DB; }

.area-tags { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.area-tag { padding: 4px 12px; border-radius: 14px; font-size: 13px; background: #F3F4F6; color: #6B7280; }
.area-tag.active { background: #1E3A5F; color: #fff; }

.source-bar { background: #EFF6FF; border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.source-text { display: block; font-size: 11px; color: #1D4ED8; margin-bottom: 4px; }
.source-intro { display: block; font-size: 12px; color: #374151; line-height: 1.6; }

.group { background: #fff; border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
.group-title { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; color: #1A1F36; padding-bottom: 10px; border-bottom: 1px solid #F3F4F6; }
.group-count { font-size: 12px; color: #9CA3AF; font-weight: 400; }

.item { padding: 12px 0; border-bottom: 1px solid #F9FAFB; }
.item:last-child { border-bottom: none; }
.item-head { display: flex; align-items: flex-start; }
.item-seq { width: 22px; font-size: 12px; color: #9CA3AF; padding-top: 2px; flex-shrink: 0; }
.item-body { flex: 1; }
.item-title-row { display: flex; align-items: center; gap: 6px; }
.item-title { font-size: 14px; color: #1A1F36; font-weight: 500; line-height: 1.5; flex: 1; }
.red-flag { font-size: 10px; color: #fff; background: #EF4444; padding: 1px 6px; border-radius: 8px; flex-shrink: 0; }
.item-standard { display: block; font-size: 12px; color: #9CA3AF; line-height: 1.5; margin-top: 4px; }
.item-metric { display: block; font-size: 12px; color: #2563EB; margin-top: 3px; }

.verdict-row { display: flex; gap: 8px; margin: 10px 0 0 22px; }
.v-btn { flex: 1; text-align: center; padding: 7px 0; font-size: 13px; border-radius: 8px; background: #F3F4F6; color: #6B7280; }
.v-btn.pass.on { background: #10B981; color: #fff; }
.v-btn.fail.on { background: #EF4444; color: #fff; }
.v-btn.na.on { background: #9CA3AF; color: #fff; }

.value-row { display: flex; align-items: center; gap: 8px; margin: 8px 0 0 22px; }
.value-label { font-size: 12px; color: #6B7280; }
.value-input { flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 7px 10px; font-size: 13px; }
.value-unit { font-size: 12px; color: #6B7280; width: 44px; }

.remark-input { margin: 8px 0 0 22px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 10px; font-size: 13px; }

/* 逐项照片：正方形小图，尺寸统一，不会一排大脸 */
.photo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0 22px; }
.photo { width: 58px; height: 58px; border-radius: 8px; overflow: hidden; position: relative; background: #F3F4F6; }
.photo-img { width: 100%; height: 100%; display: block; }
.photo-del { position: absolute; top: 0; right: 0; width: 17px; height: 17px; line-height: 16px; text-align: center; background: rgba(0,0,0,0.55); color: #fff; font-size: 12px; border-bottom-left-radius: 6px; }
.photo-add {
  width: 58px; height: 58px; border: 1px dashed #CBD5E1; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #FCFDFE;
}
.pa-plus { font-size: 18px; color: #94A3B8; line-height: 1; }
.pa-text { font-size: 10px; color: #94A3B8; margin-top: 2px; }
.photo-count { font-size: 10px; color: #B0B7C3; }

/* 签字区 */
.sign-block { background: #fff; border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
.sign-roles { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.role-chip { font-size: 12px; padding: 5px 14px; border-radius: 15px; background: #F3F4F6; color: #6B7280; }
.role-chip.on { background: #1E3A5F; color: #fff; }

.sign-warn { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 12px; margin-top: 10px; }
.sw-title { display: block; font-size: 13px; color: #92400E; font-weight: 600; }
.sw-sub { display: block; font-size: 11px; color: #B45309; line-height: 1.6; margin-top: 4px; }
.sw-btn { margin-top: 8px; font-size: 13px; color: #B45309; font-weight: 600; }

.sign-preview {
  display: flex; align-items: center; gap: 10px; margin-top: 10px;
  background: #FCFDFE; border: 1px solid #EEF1F5; border-radius: 10px; padding: 6px 10px;
}
.sp-img { width: 120px; height: 56px; }
.sp-tag { font-size: 12px; color: #1E3A5F; font-weight: 600; }

.sign-confirm { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; }
.cb {
  width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #CBD5E1;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
}
.cb.on { background: #10B981; border-color: #10B981; }
.cb text { color: #fff; font-size: 12px; line-height: 1; }
.sc-text { flex: 1; font-size: 13px; color: #374151; line-height: 1.5; }
.sign-hint { display: block; font-size: 11px; color: #10B981; margin: 6px 0 0 26px; }
.sign-note { display: block; font-size: 11px; color: #9CA3AF; margin-top: 10px; line-height: 1.6; }

.remark-area { width: 100%; min-height: 72px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px; font-size: 13px; margin-top: 10px; box-sizing: border-box; }

.tip-box { background: #FFFBEB; border-radius: 10px; padding: 10px 12px; margin-top: 12px; }
.tip-text { display: block; font-size: 11px; color: #92400E; line-height: 1.6; }

.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0;
  background: #fff; padding: 10px 16px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06); z-index: 100;
}
.stat { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.stat-num { font-size: 18px; font-weight: 700; color: #10B981; }
.stat-num.fail { color: #EF4444; margin-left: 10px; }
.stat-num.red { color: #DC2626; margin-left: 8px; }
.stat-label { font-size: 11px; color: #9CA3AF; }
.stat-label.red { color: #DC2626; }
.submit-btn { background: linear-gradient(135deg, #1E3A5F, #3B82F6); color: #fff; padding: 10px 26px; border-radius: 22px; font-size: 15px; font-weight: 600; }
.submit-btn.disabled { opacity: 0.6; }
</style>
