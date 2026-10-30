<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">我的签名</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="loading-state" v-if="loading"><text>加载中...</text></view>

    <template v-else>
      <!-- 已保存：预览 -->
      <template v-if="savedUrl && !editing">
        <view class="card">
          <view class="card-title">
            <text>当前有效签名</text>
            <text class="ver">第 {{ version }} 版</text>
          </view>
          <view class="preview-box">
            <image class="preview-img" :src="absAsset(savedUrl)" mode="aspectFit" @click="previewSaved" />
          </view>
          <view class="preview-meta">
            <text class="meta-name">{{ savedName || userName }}</text>
            <text class="meta-time">{{ fmtTime(savedAt) }}</text>
          </view>
        </view>

        <view class="tip-box">
          <text class="tip-title">关于签名</text>
          <text class="tip-line">· 验收单签字、增减项确认等需要签名的地方，会直接调用这份签名，不用每次重画。</text>
          <text class="tip-line">· 重新签写后，<text class="strong">已签过的单据不受影响</text>（那些单据存的是当时的签名图）。</text>
        </view>

        <view class="btn-row">
          <view class="btn ghost" @click="startEdit">重新签写</view>
          <view class="btn danger" @click="removeSaved">删除签名</view>
        </view>
      </template>

      <!-- 未保存 / 重签：签名板 -->
      <template v-else>
        <view class="card">
          <view class="card-title">
            <text>{{ editing ? '重新签写' : '签一个名字' }}</text>
            <text class="sub">用手指在下方书写</text>
          </view>
          <SignaturePad ref="padRef" :height="200" canvas-id="sigPad" @change="onInkChange" />
        </view>

        <view class="name-row">
          <text class="name-label">签名人</text>
          <input class="name-input" v-model="signName" placeholder="默认使用账号姓名" />
        </view>

        <view class="tip-box">
          <text class="tip-line">提示：签好后请点「保存签名」。验收签字时会直接盖上这个签名，请写得像平时签字的样子。</text>
        </view>

        <view class="btn-row">
          <view class="btn ghost" v-if="editing" @click="cancelEdit">取消</view>
          <view class="btn primary" :class="{ off: !hasInk || saving }" @click="save">
            {{ saving ? '保存中...' : '保存签名' }}
          </view>
        </view>
      </template>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { authHeader } from '@/utils/permission';
import { absAsset, uploadImage } from '@/utils/api';
import { useUserStore } from '@/stores/user';
import SignaturePad from '@/components/signature-pad.vue';

const userStore = useUserStore();
const userName = computed(() => userStore.state.name || '');

const loading = ref(true);
const saving = ref(false);
const hasInk = ref(false);
const editing = ref(false);
const padRef = ref(null);

const savedUrl = ref('');
const savedName = ref('');
const savedAt = ref('');
const version = ref(1);
const signName = ref('');

/**
 * 时间格式化
 * ⚠️ user_signatures.updated_at 由服务端按服务器本地时间写入（非 UTC），
 *    所以只截字符串，不补 Z、也不用 new Date("YYYY-MM-DD HH:mm")（iOS 不认）。
 */
function fmtTime(s) {
  if (!s) return '';
  const raw = String(s).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return raw.slice(0, 16);
}

async function load() {
  loading.value = true;
  try {
    const res = await uni.request({ url: '/api/signatures/me', header: authHeader() });
    const d = res.data || {};
    if (d.exists) {
      savedUrl.value = d.sign_url;
      savedName.value = d.sign_name || '';
      savedAt.value = d.updated_at;
      version.value = d.version || 1;
      signName.value = d.sign_name || userName.value;
      editing.value = false;
    } else {
      savedUrl.value = '';
      signName.value = userName.value;
      editing.value = true;
    }
  } catch (e) {
    savedUrl.value = '';
    editing.value = true;
  } finally {
    loading.value = false;
  }
}

function onInkChange(v) { hasInk.value = v; }

function startEdit() {
  editing.value = true;
  hasInk.value = false;
}

function cancelEdit() {
  if (savedUrl.value) { editing.value = false; return; }
  uni.navigateBack();
}

function previewSaved() {
  if (savedUrl.value) uni.previewImage({ urls: [absAsset(savedUrl.value)] });
}

async function save() {
  if (saving.value) return;
  if (!hasInk.value) { uni.showToast({ title: '请先手写签名', icon: 'none' }); return; }
  if (!padRef.value) return;
  saving.value = true;
  uni.showLoading({ title: '保存中' });
  try {
    const img = await padRef.value.exportImage();
    if (!img || !img.tempFilePath) {
      uni.hideLoading();
      uni.showToast({ title: '签名导出失败，请重新签写', icon: 'none' });
      return;
    }
    const url = await uploadImage(img.tempFilePath);
    const res = await uni.request({
      url: '/api/signatures/me',
      method: 'POST',
      header: { ...authHeader(), 'Content-Type': 'application/json' },
      data: { sign_url: url, stroke_count: img.strokeCount, sign_name: signName.value || userName.value },
    });
    uni.hideLoading();
    const d = res.data || {};
    if (d.sign_url) {
      savedUrl.value = d.sign_url;
      version.value = d.version || version.value + 1;
      savedName.value = signName.value || userName.value;
      savedAt.value = new Date().toISOString();
      editing.value = false;
      uni.showToast({ title: '签名已保存', icon: 'success' });
    } else {
      uni.showToast({ title: d.error || '保存失败', icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function removeSaved() {
  uni.showModal({
    title: '删除签名',
    content: '删除后，验收单签字时将需要重新签写。已签过的单据不受影响。',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await uni.request({ url: '/api/signatures/me', method: 'DELETE', header: authHeader() });
        savedUrl.value = '';
        editing.value = true;
        hasInk.value = false;
        signName.value = userName.value;
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e) {
        uni.showToast({ title: '删除失败', icon: 'none' });
      }
    },
  });
}

const goBack = () => {
  const pages = getCurrentPages();
  if (pages.length <= 1) uni.navigateBack();
  else uni.navigateBack();
};

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; background: #F5F7FA; padding: 16px; padding-bottom: 40px; }

.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #1E3A5F; color: #fff; padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 100; margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 16px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.loading-state { text-align: center; padding: 60px; color: #9CA3AF; font-size: 14px; }

.card { background: #fff; border-radius: 12px; padding: 14px; margin-top: 12px; }
.card-title { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.card-title text:first-child { font-size: 15px; font-weight: 600; color: #1A1F36; }
.card-title .ver { font-size: 11px; color: #2563EB; background: #EFF6FF; padding: 1px 8px; border-radius: 8px; }
.card-title .sub { font-size: 11px; color: #9CA3AF; }

.preview-box {
  background: #FCFDFE; border: 1px solid #EEF1F5; border-radius: 10px;
  height: 180px; display: flex; align-items: center; justify-content: center;
}
.preview-img { width: 100%; height: 100%; }
.preview-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.meta-name { font-size: 14px; font-weight: 600; color: #1E3A5F; }
.meta-time { font-size: 11px; color: #9CA3AF; }

.name-row { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
.name-label { width: 64px; font-size: 14px; color: #6B7280; }
.name-input { flex: 1; font-size: 14px; color: #1A1F36; }

.tip-box { background: #FFFBEB; border-radius: 10px; padding: 10px 12px; margin-top: 12px; }
.tip-title { display: block; font-size: 12px; color: #92400E; font-weight: 600; margin-bottom: 4px; }
.tip-line { display: block; font-size: 11px; color: #92400E; line-height: 1.7; }
.tip-line.strong { font-weight: 600; }

.btn-row { display: flex; gap: 10px; margin-top: 20px; }
.btn { flex: 1; text-align: center; padding: 13px 0; border-radius: 24px; font-size: 15px; font-weight: 600; }
.btn.primary { background: linear-gradient(135deg, #1E3A5F, #3B82F6); color: #fff; }
.btn.primary.off { opacity: 0.45; }
.btn.ghost { background: #fff; color: #1E3A5F; border: 1px solid #E2E8F0; }
.btn.danger { background: #fff; color: #DC2626; border: 1px solid #FECACA; }
</style>
