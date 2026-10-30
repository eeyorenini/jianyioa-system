<template>
  <view class="page">
    <view class="nav-bar no-print">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">{{ guest ? '验收报告' : '验收报告' }}</text>
      <text class="nav-right" @click="shareReport">转发</text>
    </view>

    <view class="loading-state" v-if="loading"><text>生成报告...</text></view>

    <template v-else-if="sheet.id">
      <!-- 提示横幅 -->
      <view class="banner" :class="'b-' + sheet.result">
        <text class="banner-title">{{ summary.result_text }}</text>
        <text class="banner-sub">{{ sheet.template_name }} · {{ sheet.accept_date }}</text>
      </view>

      <!-- 双签状态条 -->
      <view class="signbar" :class="progress.done ? 'is-done' : 'is-wait'">
        <text class="sb-dot">{{ progress.done ? '✓' : '!' }}</text>
        <text class="sb-text">{{ signBarText }}</text>
        <text class="sb-action" v-if="!guest && !progress.done && canSign" @click="signSelf">去签字 ›</text>
      </view>

      <!-- 报告主体 -->
      <view class="report">
        <view class="r-head">
          <text class="r-title">工 程 验 收 报 告</text>
          <text class="r-no">单号 {{ sheet.sheet_no }}</text>
        </view>

        <view class="r-meta">
          <view class="r-row"><text class="r-label">项目名称</text><text class="r-value">{{ sheet.project_name }}</text></view>
          <view class="r-row" v-if="project && project.customer"><text class="r-label">业主</text><text class="r-value">{{ project.customer }}</text></view>
          <view class="r-row"><text class="r-label">验收类型</text><text class="r-value">{{ sheet.template_name }}</text></view>
          <view class="r-row"><text class="r-label">验收日期</text><text class="r-value">{{ sheet.accept_date }}</text></view>
          <view class="r-row" v-if="sheet.area"><text class="r-label">验收区域</text><text class="r-value">{{ sheet.area }}</text></view>
          <view class="r-row" v-if="sheet.batch_no"><text class="r-label">进场批次</text><text class="r-value">第 {{ sheet.batch_no }} 批</text></view>
        </view>

        <view class="r-stat">
          <view class="rs-cell"><text class="rs-num">{{ summary.item_count }}</text><text class="rs-label">验收项</text></view>
          <view class="rs-cell"><text class="rs-num green">{{ summary.pass_count }}</text><text class="rs-label">合格</text></view>
          <view class="rs-cell"><text class="rs-num red">{{ summary.fail_count }}</text><text class="rs-label">不合格</text></view>
          <view class="rs-cell" v-if="summary.red_fail_count"><text class="rs-num darkred">{{ summary.red_fail_count }}</text><text class="rs-label">红线项</text></view>
        </view>

        <!-- 明细（每项照片可点开大图） -->
        <view class="r-group" v-for="(g, gi) in groups" :key="gi">
          <text class="r-group-name">{{ g.name }}</text>
          <view class="r-item" v-for="it in g.items" :key="it.seq">
            <view class="ri-left">
              <text class="ri-seq">{{ it.seq }}</text>
              <view class="ri-main">
                <text class="ri-title">{{ it.title }}</text>
                <text class="ri-std" v-if="it.standard">{{ it.standard }}</text>
                <text class="ri-remark" v-if="it.remark">说明：{{ it.remark }}</text>
                <text class="ri-value" v-if="it.value">实测：{{ it.value }}{{ it.unit || '' }}</text>
                <view class="ri-photos" v-if="itemPhotos(it).length">
                  <image
                    class="ri-photo"
                    v-for="(p, pi) in itemPhotos(it)"
                    :key="pi"
                    :src="p"
                    mode="aspectFill"
                    @click="preview(itemPhotos(it), pi)"
                  />
                </view>
              </view>
            </view>
            <text class="ri-verdict" :class="'v-' + it.verdict">{{ verdictText(it.verdict) }}</text>
          </view>
        </view>

        <view class="r-group" v-if="sheet.remark">
          <text class="r-group-name">备注</text>
          <text class="r-remark">{{ sheet.remark }}</text>
        </view>

        <!-- 签字栏（手写签名） -->
        <view class="r-sign">
          <view class="sign-cell" v-for="s in signCells" :key="s.role">
            <text class="sign-label">{{ s.label }}</text>
            <view class="sign-box">
              <image v-if="s.url" class="sign-img" :src="absAsset(s.url)" mode="aspectFit" />
              <text v-else class="sign-empty">{{ s.required ? '待签' : '暂不启用' }}</text>
            </view>
            <text class="sign-name">{{ s.name || '' }}</text>
            <text class="sign-date" v-if="s.at">{{ fmt(s.at) }}</text>
          </view>
        </view>

        <view class="r-foot">
          <text class="foot-text">本报告依据《施工服务手册》逐项判定生成，条款与判定结果均存档可查。</text>
          <text class="foot-text">报告编号 {{ sheet.sheet_no }} · 生成时间 {{ fmt(sheet.created_at) }}</text>
        </view>
      </view>

      <!-- 品牌页脚：转发给业主 / 潜在客户时的引流位 -->
      <view class="brand-card">
        <view class="brand-top">
          <text class="brand-name">简逸装饰</text>
          <text class="brand-full">北京福进万家装饰工程有限公司</text>
        </view>
        <text class="brand-slogan">按手册施工 · 逐项验收 · 每道工序都有据可查</text>
        <view class="brand-line">
          <text class="bl-label">服务热线</text>
          <text class="bl-value">{{ hotline }}</text>
        </view>
        <view class="brand-cta" @click="ctaTap">
          <text>想要同样的施工标准？免费获取报价</text>
        </view>
      </view>

      <!-- 员工操作 -->
      <view class="actions no-print" v-if="!guest">
        <view class="act-btn ghost" @click="copyShareLink">复制链接</view>
        <!-- 小程序里必须用 open-type="share" 的 button 才能直接拉起转发面板 -->
        <!-- #ifdef MP-WEIXIN -->
        <button class="act-btn primary btn-reset" open-type="share">转发给业主</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view class="act-btn primary" @click="shareReport">转发给业主</view>
        <!-- #endif -->
      </view>
      <view class="actions no-print" v-else>
        <view class="act-btn primary" @click="ctaTap">免费获取报价</view>
      </view>
    </template>

    <view class="empty-state" v-else><text>{{ errorMsg || '报告不存在' }}</text></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { authHeader } from '@/utils/permission';
import { absAsset } from '@/utils/api';

// 品牌信息：与《施工服务手册》一致，转发出去就是一张名片
const HOTLINE = '010-69010888';
const hotline = HOTLINE;

const id = ref(0);
const token = ref('');
const guest = ref(false);
const fresh = ref(false);
const sheet = ref({});
const project = ref(null);
const groups = ref([]);
const summary = ref({});
const signers = ref({});
const progress = ref({ require: [], signed: [], remain: [], done: false });
const share = ref({});
const loading = ref(true);
const errorMsg = ref('');

const signBarText = computed(() => {
  const p = progress.value;
  if (!p.require || !p.require.length) return '无需签字';
  if (p.done) return `已签齐：${p.signed.map((x) => x.label).join('、')}`;
  const remain = p.remain.map((x) => x.label).join('、');
  return `待${remain}签字（${p.signed.length}/${p.require.length}）`;
});

const canSign = computed(() => !progress.value.done);

const signCells = computed(() => {
  const req = (progress.value.require || []).map((x) => x.role);
  const list = req.slice();
  const out = list.map((role) => {
    const s = signers.value[role] || {};
    return {
      role,
      label: { foreman: '项目经理', supervisor: '工程监理', designer: '设计师' }[role] || role,
      required: true,
      name: s.name,
      url: s.url,
      at: s.at,
    };
  });
  // 业主栏：字段已建好，当前灰显“暂不启用”
  const c = signers.value.customer || {};
  out.push({ role: 'customer', label: '业主确认', required: false, name: c.name, url: c.url, at: c.at });
  return out;
});

/** 报告里的分享绝对地址（/r/xxx） */
const shareWebUrl = computed(() => {
  const t = share.value.token || token.value;
  if (!t) return '';
  const p = `/r/${t}`;
  // #ifdef H5
  try { return window.location.origin + p; } catch (e) { return p; }
  // #endif
  // #ifndef H5
  return absAsset(p);
  // #endif
});

/**
 * 时间格式化
 * ⚠️ 验收单的时间（created_at / *_sign_at）由服务端 fmtNow() 按服务器本地时间写入，
 *    不是 UTC。所以这里直接截字符串，绝不能再补 Z 转时区（否则会凭空 +8 小时）。
 *    也不用 new Date("2026-10-30 10:21") —— iOS 内核不认这种格式，会得到 Invalid Date。
 */
function fmt(v) {
  if (!v) return '';
  const raw = String(v).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return raw.slice(0, 16);
}

function verdictText(v) {
  return { pass: '合格', fail: '不合格', na: '不适用', pending: '未判定' }[v] || v;
}

/** 逐项照片 JSON → 绝对地址数组 */
function itemPhotos(it) {
  try {
    let p = it.photos;
    if (!p) return [];
    if (typeof p === 'string') p = JSON.parse(p);
    return Array.isArray(p) ? p.filter(Boolean).map(absAsset) : [];
  } catch (e) { return []; }
}

function preview(list, i) {
  uni.previewImage({ urls: list, current: list[i] });
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const url = guest.value
      ? `/api/public/acceptance-report/${token.value}`
      : `/api/acceptance-sheets/${id.value}/report`;
    const res = await uni.request({ url, header: guest.value ? {} : authHeader() });
    const d = res.data || {};
    if (!d.sheet) {
      errorMsg.value = d.error || '报告不存在或链接已失效';
      return;
    }
    sheet.value = d.sheet;
    project.value = d.project;
    groups.value = d.groups || [];
    summary.value = d.summary || {};
    signers.value = d.signers || {};
    progress.value = d.progress || { require: [], signed: [], remain: [], done: false };
    share.value = d.share || {};
  } catch (e) {
    errorMsg.value = '加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

/** 本人签字：调用个人中心存档的手写签名 */
async function signSelf() {
  const roles = (progress.value.remain || []).map((x) => x.role);
  if (!roles.length) { uni.showToast({ title: '不需要签字', icon: 'none' }); return; }

  // 先确认有没有存过签名
  let me = { exists: false };
  try {
    const r = await uni.request({ url: '/api/signatures/me', header: authHeader() });
    me = r.data || {};
  } catch (e) { /* ignore */ }

  if (!me.exists) {
    uni.showModal({
      title: '还没有手写签名',
      content: '签字需要用到你在「我的 → 我的签名」里保存的手写签名，现在去签写？',
      confirmText: '去签写',
      success: (r) => {
        if (r.confirm) uni.navigateTo({ url: '/pages/mine/signature' });
      },
    });
    return;
  }

  const role = roles[0];
  const label = { foreman: '项目经理', supervisor: '工程监理', designer: '设计师' }[role] || role;
  uni.showModal({
    title: '确认签字',
    content: `将以「${label}」身份盖上你的手写签名，确认？`,
    success: async (r) => {
      if (!r.confirm) return;
      uni.showLoading({ title: '签字中' });
      try {
        const res = await uni.request({
          url: `/api/acceptance-sheets/${id.value}/sign`,
          method: 'POST',
          header: { ...authHeader(), 'Content-Type': 'application/json' },
          data: { role },
        });
        uni.hideLoading();
        if (res.data && res.data.message) {
          uni.showToast({ title: res.data.message, icon: 'none' });
          load();
        } else {
          uni.showToast({ title: (res.data && res.data.error) || '签字失败', icon: 'none' });
        }
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: '签字失败', icon: 'none' });
      }
    },
  });
}

function copyShareLink() {
  const u = shareWebUrl.value;
  if (!u) { uni.showToast({ title: '链接生成中', icon: 'none' }); return; }
  uni.setClipboardData({
    data: u,
    success: () => {
      uni.showModal({
        title: '链接已复制',
        content: '可以粘贴到微信发给业主。业主点开就能看，无需登录。',
        showCancel: false,
      });
    },
  });
}

function shareReport() {
  // #ifdef MP-WEIXIN
  uni.showModal({
    title: '转发给业主',
    content: '点右上角「···」→ 发送给朋友，业主点开即可查看（无需登录）。',
    showCancel: false,
  });
  // #endif
  // #ifndef MP-WEIXIN
  copyShareLink();
  // #endif
}

function ctaTap() {
  uni.showModal({
    title: '简逸装饰',
    content: `咨询装修请拨 ${HOTLINE}，或在小程序首页登记需求，我们会安排设计师联系你。`,
    confirmText: '拨打电话',
    cancelText: '知道了',
    success: (r) => {
      if (r.confirm) uni.makePhoneCall({ phoneNumber: HOTLINE, fail: () => {} });
    },
  });
}

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    if (guest.value) return;
    uni.navigateTo({ url: '/pages/acceptance/types' });
  } else {
    uni.navigateBack();
  }
};

onLoad((options) => {
  const o = options || {};
  token.value = o.token || '';
  id.value = parseInt(o.id || '0', 10);
  fresh.value = o.fresh === '1';
  guest.value = !!token.value && !id.value;
  if (!token.value && !id.value) {
    errorMsg.value = '缺少报告参数';
    loading.value = false;
    return;
  }
  load();
});

// 小程序转发卡片：标题带项目与结论，图用第一张现场照片
// #ifdef MP-WEIXIN
onShareAppMessage(() => {
  const t = share.value.token || token.value;
  const title = `${sheet.value.project_name || ''} · ${sheet.value.template_name || '验收报告'}（${summary.value.result_text || ''}）`;
  // 用 reduce 代替 flatMap：部分 iOS 旧内核没有 flatMap
  let firstPhoto = '';
  groups.value.forEach((g) => {
    if (firstPhoto) return;
    (g.items || []).forEach((it) => {
      if (firstPhoto) return;
      const ps = itemPhotos(it);
      if (ps.length) firstPhoto = ps[0];
    });
  });
  return {
    title,
    path: t ? `/pages/acceptance/report?token=${t}` : `/pages/acceptance/report?id=${id.value}`,
    imageUrl: firstPhoto || undefined,
  };
});
// #endif
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding: 16px; padding-bottom: 120px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100; margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; }
.nav-right { width: 48px; text-align: right; font-size: 14px; color: #93C5FD; }

.loading-state { text-align: center; padding: 60px; color: #9CA3AF; font-size: 14px; }

.banner { border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
.b-pass { background: linear-gradient(135deg, #10B981, #059669); }
.b-fail { background: linear-gradient(135deg, #EF4444, #B91C1C); }
.b-rectify { background: linear-gradient(135deg, #F59E0B, #D97706); }
.b-pending { background: linear-gradient(135deg, #9CA3AF, #6B7280); }
.banner-title { display: block; color: #fff; font-size: 20px; font-weight: 700; }
.banner-sub { display: block; color: rgba(255,255,255,0.85); font-size: 12px; margin-top: 4px; }

.signbar { display: flex; align-items: center; gap: 8px; border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
.signbar.is-done { background: #ECFDF5; }
.signbar.is-wait { background: #FFFBEB; }
.sb-dot { width: 16px; height: 16px; border-radius: 50%; text-align: center; line-height: 16px; font-size: 11px; color: #fff; }
.is-done .sb-dot { background: #10B981; }
.is-wait .sb-dot { background: #F59E0B; }
.sb-text { flex: 1; font-size: 12px; }
.is-done .sb-text { color: #065F46; }
.is-wait .sb-text { color: #92400E; }
.sb-action { font-size: 12px; font-weight: 600; color: #B45309; }

.report { background: #fff; border-radius: 12px; padding: 16px; margin-top: 12px; }
.r-head { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #1E3A5F; }
.r-title { display: block; font-size: 17px; font-weight: 700; color: #1E3A5F; letter-spacing: 4px; }
.r-no { display: block; font-size: 11px; color: #9CA3AF; margin-top: 4px; }

.r-meta { padding: 10px 0; border-bottom: 1px dashed #E5E7EB; }
.r-row { display: flex; padding: 3px 0; }
.r-label { width: 68px; font-size: 12px; color: #6B7280; flex-shrink: 0; }
.r-value { flex: 1; font-size: 12px; color: #1A1F36; }

.r-stat { display: flex; padding: 12px 0; border-bottom: 1px dashed #E5E7EB; }
.rs-cell { flex: 1; text-align: center; }
.rs-num { display: block; font-size: 20px; font-weight: 700; color: #1A1F36; }
.rs-num.green { color: #10B981; }
.rs-num.red { color: #EF4444; }
.rs-num.darkred { color: #B91C1C; }
.rs-label { display: block; font-size: 11px; color: #9CA3AF; margin-top: 2px; }

.r-group { padding: 12px 0; border-bottom: 1px dashed #E5E7EB; }
.r-group-name { display: block; font-size: 13px; font-weight: 600; color: #1E3A5F; margin-bottom: 8px; }
.r-item { display: flex; align-items: flex-start; padding: 6px 0; }
.ri-left { flex: 1; display: flex; }
.ri-seq { width: 18px; font-size: 11px; color: #9CA3AF; padding-top: 2px; }
.ri-main { flex: 1; }
.ri-title { display: block; font-size: 13px; color: #1A1F36; line-height: 1.5; }
.ri-std { display: block; font-size: 11px; color: #9CA3AF; line-height: 1.4; margin-top: 2px; }
.ri-remark { display: block; font-size: 11px; color: #DC2626; margin-top: 2px; }
.ri-value { display: block; font-size: 11px; color: #2563EB; margin-top: 2px; }
.ri-verdict { font-size: 11px; padding: 2px 8px; border-radius: 9px; white-space: nowrap; margin-left: 8px; }
.v-pass { background: #D1FAE5; color: #065F46; }
.v-fail { background: #FEE2E2; color: #991B1B; }
.v-na { background: #F3F4F6; color: #6B7280; }
.v-pending { background: #FEF3C7; color: #92400E; }

/* 逐项照片：小图整齐排列，点开看大图 */
.ri-photos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.ri-photo { width: 72px; height: 72px; border-radius: 6px; background: #F3F4F6; border: 1px solid #E5E7EB; }

.r-remark { font-size: 12px; color: #4B5563; line-height: 1.6; }

.r-sign { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 14px; border-top: 1px solid #E5E7EB; margin-top: 12px; }
.sign-cell { width: 46%; }
.sign-label { display: block; font-size: 11px; color: #9CA3AF; }
.sign-box {
  height: 54px; margin-top: 4px; border-bottom: 1px solid #E5E7EB;
  display: flex; align-items: center; justify-content: center;
}
.sign-img { width: 100%; height: 100%; }
.sign-empty { font-size: 11px; color: #D1D5DB; }
.sign-name { display: block; font-size: 12px; color: #1E3A5F; margin-top: 3px; }
.sign-date { display: block; font-size: 10px; color: #9CA3AF; margin-top: 1px; }

.r-foot { padding-top: 12px; }
.foot-text { display: block; font-size: 10px; color: #9CA3AF; line-height: 1.7; }

/* 品牌页脚 */
.brand-card { background: #fff; border-radius: 12px; padding: 16px; margin-top: 12px; }
.brand-top { display: flex; flex-direction: column; }
.brand-name { font-size: 17px; font-weight: 700; color: #1E3A5F; letter-spacing: 2px; }
.brand-full { font-size: 11px; color: #9CA3AF; margin-top: 3px; }
.brand-slogan { display: block; font-size: 12px; color: #4B5563; margin-top: 10px; line-height: 1.6; }
.brand-line { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.bl-label { font-size: 11px; color: #9CA3AF; }
.bl-value { font-size: 15px; font-weight: 700; color: #1E3A5F; letter-spacing: 1px; }
.brand-cta {
  margin-top: 12px; text-align: center; padding: 11px 0; border-radius: 22px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6); color: #fff; font-size: 14px; font-weight: 600;
}

.actions { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; padding: 10px 16px; padding-bottom: max(10px, env(safe-area-inset-bottom)); display: flex; gap: 10px; box-shadow: 0 -2px 12px rgba(0,0,0,0.06); }
.act-btn { flex: 1; text-align: center; padding: 11px 0; border-radius: 22px; font-size: 15px; font-weight: 600; }
.act-btn.ghost { background: #F3F4F6; color: #1E3A5F; }
.act-btn.primary { background: linear-gradient(135deg, #1E3A5F, #3B82F6); color: #fff; }
/* 小程序 button 默认带边框和行高，透明化后与 view 版按钮一致 */
.btn-reset { border: none; line-height: 1.4; margin: 0; }
.btn-reset::after { border: none; }

.empty-state { text-align: center; padding: 80px 20px; color: #9CA3AF; font-size: 14px; }
</style>
