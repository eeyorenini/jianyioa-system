<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">主材验收</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目横幅（从项目详情进来时项目已绑定，不可改） -->
    <view class="project-banner" v-if="projectName">📁 {{ projectName }}</view>

    <!-- 单据信息 -->
    <view class="form-card">
      <view class="card-title">单据信息</view>

      <view class="form-item">
        <text class="form-label">验收日期 <text class="required">*</text></text>
        <picker mode="date" :value="form.accept_date" @change="onDateChange">
          <view class="picker-wrap">
            <text :class="form.accept_date ? 'picker-value' : 'picker-placeholder'">{{ form.accept_date || '请选择日期' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="form-label">施工阶段 <text class="required">*</text></text>
        <picker :range="stages" @change="onStageChange">
          <view class="picker-wrap">
            <text :class="form.stage ? 'picker-value' : 'picker-placeholder'">{{ form.stage || '请选择材料进场阶段' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="form-label">验收人</text>
        <picker v-if="staff.length" :range="staffNames" @change="onForemanChange">
          <view class="picker-wrap">
            <text :class="form.foreman_name ? 'picker-value' : 'picker-placeholder'">
              {{ form.foreman_name || '请选择验收人' }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <view v-else class="picker-wrap">
          <text class="picker-placeholder">项目未关联员工</text>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">供应商</text>
        <view class="picker-wrap">
          <input class="inline-input" v-model="form.supplier_name" placeholder="输入或从右侧选择" />
          <picker v-if="suppliers.length" :range="supplierNames" @change="onSupplierChange">
            <text class="picker-arrow">›</text>
          </picker>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">送货单号</text>
        <view class="picker-wrap">
          <input class="inline-input" v-model="form.delivery_no" placeholder="选填，供应商送货单号" />
        </view>
      </view>
    </view>

    <!-- 材料明细 -->
    <view class="form-card">
      <view class="card-header">
        <text class="card-title">材料明细 <text class="count-badge">{{ items.length }}</text></text>
        <text class="tool-btn" @click="openMaterialPicker">+ 添加材料</text>
      </view>

      <view v-if="!items.length" class="empty-mini">
        <text class="empty-mini-icon">📦</text>
        <text class="empty-mini-text">还没有添加材料，点右上「+ 添加材料」</text>
      </view>

      <view class="item-card" v-for="(it, idx) in items" :key="it.key">
        <view class="item-head">
          <text class="item-idx">{{ idx + 1 }}</text>
          <view class="item-title-wrap">
            <text class="item-name">{{ it.material_name }}</text>
            <text class="item-spec">{{ [it.brand, it.spec, it.unit].filter(Boolean).join(' · ') || '无规格信息' }}</text>
          </view>
          <text class="item-del" @click="removeItem(idx)">✕</text>
        </view>

        <view class="item-qty-row">
          <view class="qty-cell">
            <text class="qty-label">应到</text>
            <input class="qty-input" type="digit" v-model="it.plan_qty" placeholder="0" />
          </view>
          <view class="qty-cell">
            <text class="qty-label">实到</text>
            <input class="qty-input" type="digit" v-model="it.actual_qty" placeholder="0" />
          </view>
          <text class="qty-unit">{{ it.unit || '' }}</text>
        </view>

        <view class="verdict-row">
          <text
            class="verdict-chip"
            v-for="v in verdicts"
            :key="v"
            :class="['tone-' + verdictTone(v), { active: it.verdict === v }]"
            @click="setVerdict(it, v)"
          >{{ v }}</text>
        </view>

        <view class="tag-wrap" v-if="it.verdict !== '合格'">
          <text
            class="tag-chip"
            v-for="t in problemTags"
            :key="t"
            :class="{ active: it.problem_tags.indexOf(t) >= 0 }"
            @click="toggleProblem(it, t)"
          >{{ t }}</text>
        </view>
      </view>
    </view>

    <!-- 结论与资料 -->
    <view class="form-card">
      <view class="card-title">验收结论</view>

      <view class="form-item col">
        <text class="form-label">随货资料（可多选）</text>
        <view class="tag-wrap">
          <text
            class="tag-chip"
            v-for="d in docOptions"
            :key="d"
            :class="{ active: form.docs.indexOf(d) >= 0 }"
            @click="toggleDoc(d)"
          >{{ d }}</text>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">堆放与保护</text>
        <picker :range="storageOptions" @change="onStorageChange">
          <view class="picker-wrap">
            <text :class="form.storage ? 'picker-value' : 'picker-placeholder'">{{ form.storage || '请选择堆放情况' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="form-label">验收结论 <text class="required">*</text></text>
        <picker :range="resultOptions" @change="onResultChange">
          <view class="picker-wrap">
            <text :class="form.result ? 'picker-value' : 'picker-placeholder'">{{ form.result || '请选择验收结论' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="form-label">不合格处理</text>
        <picker :range="handlingOptions" @change="onHandlingChange">
          <view class="picker-wrap">
            <text :class="form.handling ? 'picker-value' : 'picker-placeholder'">{{ form.handling || '请选择处理方式' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-item col">
        <text class="form-label">备注</text>
        <textarea class="form-textarea" v-model="form.remark" placeholder="现场情况补充、与供应商沟通结果等" />
      </view>
    </view>

    <!-- 现场照片 -->
    <view class="form-card">
      <text class="form-label">现场照片</text>
      <view class="photo-grid">
        <view class="photo-item" v-for="(img, idx) in photos" :key="img.id">
          <image class="photo-img" :src="photoSrc(img)" mode="aspectFill" @error="onPhotoImgError(img)" @click="previewPhoto(idx)" />
          <view class="photo-del" @click.stop="delPhoto(idx)">✕</view>
          <view class="photo-uploading" v-if="img.status === 'uploading'"><text>⟳</text></view>
          <view v-else-if="img.status === 'failed'" class="photo-status-badge badge-failed">未上传</view>
          <view v-else-if="img.status === 'local-only'" class="photo-status-badge badge-warn">仅预览</view>
        </view>
        <view class="photo-add" v-if="photos.length < 9" @click="choosePhoto">
          <text class="photo-add-icon">📷</text>
          <text class="photo-add-text">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 上传进度 -->
    <view class="upload-mask" v-if="uploadProgress.visible">
      <view class="upload-box">
        <text class="upload-title">正在上传图片</text>
        <view class="upload-bar-bg">
          <view class="upload-bar-fill" :style="{ width: uploadProgress.percent + '%' }"></view>
        </view>
        <text class="upload-text">{{ uploadProgress.text }}</text>
      </view>
    </view>

    <!-- 提交 -->
    <view class="bottom-bar">
      <view class="btn-submit" :class="{ loading: submitting }" @click="submit">
        <text v-if="!submitting">提 交</text>
        <text v-else>提交中...</text>
      </view>
    </view>

    <!-- ===== 材料搜索弹层 ===== -->
    <view class="picker-mask" v-if="matPicker.visible" @click="closeMaterialPicker">
      <view class="picker-panel" @click.stop>
        <view class="picker-head">
          <text class="picker-title">选择材料</text>
          <text class="picker-close" @click="closeMaterialPicker">✕</text>
        </view>
        <view class="picker-search">
          <input
            class="picker-input"
            v-model="matPicker.keyword"
            placeholder="搜主材名称 / 品牌 / 型号，如「瓷砖」"
            confirm-type="search"
            @input="onKeywordInput"
            @confirm="doSearch"
          />
        </view>
        <scroll-view class="picker-list" scroll-y>
          <view v-if="matPicker.loading" class="picker-empty">搜索中...</view>
          <view v-else-if="!matPicker.list.length" class="picker-empty">没有匹配的主材，换个关键词试试</view>
          <view
            class="picker-row"
            v-for="m in matPicker.list"
            :key="m.id"
            @click="pickMaterial(m)"
          >
            <view class="picker-row-main">
              <text class="picker-row-name">{{ m.name }}</text>
              <text class="picker-row-sub">{{ [m.brand, m.spec || m.model, m.category].filter(Boolean).join(' · ') }}</text>
            </view>
            <text class="picker-row-unit">{{ m.unit || '' }}</text>
          </view>
        </scroll-view>
        <view class="picker-foot">
          <text class="picker-manual" @click="addManualItem">手动填写材料</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  MA_STAGES, MA_VERDICTS, MA_PROBLEM_TAGS, MA_DOCS, MA_STORAGE, MA_RESULTS, MA_HANDLINGS,
  verdictTone, todayStr,
} from './dict';

const projectId = ref(0);
const projectName = ref('');
const staff = ref([]);
const suppliers = ref([]);
const items = ref([]);
const photos = ref([]);
const submitting = ref(false);
const choosingPhoto = ref(false);
const uploadProgress = reactive({ visible: false, total: 0, done: 0, percent: 0, text: '' });

const stages = MA_STAGES;
const verdicts = MA_VERDICTS;
const problemTags = MA_PROBLEM_TAGS;
const docOptions = MA_DOCS;
const storageOptions = MA_STORAGE;
const resultOptions = MA_RESULTS;
const handlingOptions = MA_HANDLINGS;

const form = reactive({
  accept_date: todayStr(),
  stage: '',
  foreman_id: null,
  foreman_name: '',
  supplier_name: '',
  delivery_no: '',
  docs: [],
  storage: '',
  result: '',
  handling: '',
  remark: '',
});

const staffNames = computed(() => staff.value.map((s) => s.name + (s.position ? `（${s.position}）` : '')));
const supplierNames = computed(() => suppliers.value.map((s) => s.name));

const authHeader = () => ({ Authorization: uni.getStorageSync('token') });

const onDateChange = (e) => { form.accept_date = e.detail.value; };
const onStageChange = (e) => { form.stage = stages[e.detail.value]; };
const onStorageChange = (e) => { form.storage = storageOptions[e.detail.value]; };
const onResultChange = (e) => { form.result = resultOptions[e.detail.value]; };
const onHandlingChange = (e) => { form.handling = handlingOptions[e.detail.value]; };
const onForemanChange = (e) => {
  const s = staff.value[e.detail.value];
  if (s) { form.foreman_id = s.id; form.foreman_name = s.name; }
};
const onSupplierChange = (e) => {
  const s = suppliers.value[e.detail.value];
  if (s) form.supplier_name = s.name;
};

const toggleDoc = (d) => {
  const i = form.docs.indexOf(d);
  if (i >= 0) { form.docs.splice(i, 1); return; }
  if (d === '无') {
    form.docs = ['无'];
    return;
  }
  form.docs = form.docs.filter((x) => x !== '无');
  form.docs.push(d);
};

// ===== 明细行 =====
let _itemSeq = 0;
const newItem = (m) => ({
  key: 'it_' + Date.now().toString(36) + '_' + (++_itemSeq),
  material_id: m ? m.id : null,
  material_name: m ? m.name : '',
  spec: m ? (m.spec || m.model || '') : '',
  brand: m ? (m.brand || '') : '',
  unit: m ? (m.unit || '') : '',
  plan_qty: '',
  actual_qty: '',
  verdict: '合格',
  problem_tags: [],
});

const setVerdict = (it, v) => {
  it.verdict = v;
  if (v === '合格') it.problem_tags = [];
};
const toggleProblem = (it, t) => {
  const i = it.problem_tags.indexOf(t);
  if (i >= 0) it.problem_tags.splice(i, 1);
  else it.problem_tags.push(t);
};
const removeItem = (idx) => { items.value.splice(idx, 1); };

// ===== 材料搜索弹层 =====
const matPicker = reactive({ visible: false, keyword: '', list: [], loading: false });
let searchTimer = null;

const openMaterialPicker = () => {
  matPicker.visible = true;
  matPicker.keyword = '';
  doSearch();
};
const closeMaterialPicker = () => { matPicker.visible = false; };

const doSearch = async () => {
  matPicker.loading = true;
  try {
    const kw = encodeURIComponent(matPicker.keyword || '');
    const res = await uni.request({ url: `/api/material-acceptances/material-search?keyword=${kw}&limit=30`, header: authHeader() });
    const d = res.data || {};
    matPicker.list = Array.isArray(d.list) ? d.list : (Array.isArray(d) ? d : []);
  } catch (e) {
    matPicker.list = [];
  } finally {
    matPicker.loading = false;
  }
};

const onKeywordInput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 350);
};

const pickMaterial = (m) => {
  items.value.push(newItem(m));
  closeMaterialPicker();
};

const addManualItem = () => {
  const it = newItem(null);
  items.value.push(it);
  closeMaterialPicker();
  uni.showToast({ title: '已添加空行，请填写材料名', icon: 'none' });
};

// ===== 照片上传（与巡检/验收同一套稳健逻辑）=====
let _photoSeq = 0;
const nextPhotoId = () => 'p_' + Date.now().toString(36) + '_' + (++_photoSeq).toString(36);
const photoSrc = (p) => (p ? (p.url || p.localUrl || '') : '');
const onPhotoImgError = (img) => {
  if (img && img.localUrl && img.url !== img.localUrl) img.url = img.localUrl;
};

const choosePhoto = () => {
  if (choosingPhoto.value) return;
  const remain = 9 - photos.value.length;
  if (remain <= 0) { uni.showToast({ title: '最多9张', icon: 'none' }); return; }
  choosingPhoto.value = true;
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const paths = res.tempFilePaths || [];
      if (!paths.length) { choosingPhoto.value = false; return; }
      const placeholders = paths.map((p) => ({ id: nextPhotoId(), localUrl: p, url: p, serverUrl: '', status: 'uploading' }));
      photos.value.push(...placeholders);
      uploadProgress.visible = true;
      uploadProgress.total = paths.length;
      uploadProgress.done = 0;
      uploadProgress.percent = 0;
      uploadProgress.text = '正在上传 0/' + paths.length;
      await Promise.all(paths.map((path, i) => uploadOne(path, placeholders[i])));
      uploadProgress.visible = false;
      choosingPhoto.value = false;
    },
    fail: () => { choosingPhoto.value = false; },
  });
};

const uploadOne = (filePath, placeholder) => {
  return new Promise((resolve) => {
    uni.uploadFile({
      url: '/api/upload-image',
      filePath,
      name: 'file',
      header: authHeader(),
      success: (res) => {
        let serverUrl = '';
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          serverUrl = data?.url || data?.path || '';
        } catch (e) { /* 忽略 */ }
        const idx = photos.value.findIndex((p) => p.id === placeholder.id);
        if (idx >= 0) {
          if (serverUrl) photos.value[idx] = { ...photos.value[idx], url: serverUrl, serverUrl, status: 'done' };
          else {
            photos.value[idx] = { ...photos.value[idx], status: 'local-only' };
            uni.showToast({ title: '有图片返回异常，仅本地预览', icon: 'none' });
          }
        }
        bumpProgress();
        resolve(true);
      },
      fail: () => {
        const idx = photos.value.findIndex((p) => p.id === placeholder.id);
        if (idx >= 0) photos.value[idx] = { ...photos.value[idx], status: 'failed' };
        uni.showToast({ title: '有图片上传失败，已跳过', icon: 'none' });
        bumpProgress();
        resolve(false);
      },
    });
  });
};

const bumpProgress = () => {
  uploadProgress.done++;
  uploadProgress.percent = uploadProgress.total ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 100;
  uploadProgress.text = '正在上传 ' + uploadProgress.done + '/' + uploadProgress.total;
};

const delPhoto = (idx) => { photos.value.splice(idx, 1); };
const previewPhoto = (idx) => {
  const urls = photos.value.map((p) => photoSrc(p)).filter(Boolean);
  uni.previewImage({ urls, current: urls[idx] });
};

// ===== 提交 =====
const validate = () => {
  if (!projectId.value) return '未指定项目';
  if (!form.accept_date) return '请选择验收日期';
  if (!form.stage) return '请选择施工阶段';
  if (!items.value.length) return '请至少添加一项材料';
  for (let i = 0; i < items.value.length; i++) {
    const it = items.value[i];
    if (!it.material_name) return `第 ${i + 1} 项材料名为空`;
    if (it.plan_qty !== '' && it.actual_qty !== '' && Number(it.actual_qty) > Number(it.plan_qty)) {
      return `第 ${i + 1} 项实到数量大于应到，请核对`;
    }
  }
  if (!form.result) return '请选择验收结论';
  const hasFail = items.value.some((x) => x.verdict === '不合格');
  if (form.result.indexOf('全部合格') === 0 && hasFail) {
    return '结论选了「全部合格」，但有材料判为不合格，请改结论';
  }
  if (hasFail && (!form.handling || form.handling === '不涉及')) {
    return '有不合格材料，请选择处理方式';
  }
  return '';
};

const submit = () => {
  if (submitting.value) return;
  const err = validate();
  if (err) { uni.showToast({ title: err, icon: 'none' }); return; }

  submitting.value = true;
  const imageUrls = photos.value
    .map((p) => p.serverUrl || (p.url && !String(p.url).startsWith('blob:') ? p.url : null))
    .filter(Boolean);

  const payload = {
    project_id: projectId.value,
    project_name: projectName.value,
    accept_date: form.accept_date,
    stage: form.stage,
    foreman_id: form.foreman_id,
    foreman_name: form.foreman_name,
    supplier_name: form.supplier_name,
    delivery_no: form.delivery_no,
    docs: form.docs,
    storage: form.storage,
    result: form.result,
    handling: form.handling,
    remark: form.remark,
    photos: imageUrls,
    items: items.value.map((it) => ({
      material_id: it.material_id,
      material_name: it.material_name,
      spec: it.spec,
      brand: it.brand,
      unit: it.unit,
      plan_qty: it.plan_qty === '' ? null : Number(it.plan_qty),
      actual_qty: it.actual_qty === '' ? null : Number(it.actual_qty),
      verdict: it.verdict,
      problem_tags: it.problem_tags,
    })),
  };

  uni.request({
    url: '/api/material-acceptances',
    method: 'POST',
    header: { 'Content-Type': 'application/json', ...authHeader() },
    data: payload,
    timeout: 20000,
  }).then((res) => {
    const ok = res.statusCode === 200 || res.statusCode === 201;
    if (ok) {
      const no = (res.data && res.data.accept_no) || '';
      uni.showToast({ title: no ? '已提交 ' + no : '提交成功', icon: 'success', duration: 1500 });
      setTimeout(() => { uni.navigateBack(); }, 1500);
    } else {
      uni.showToast({ title: (res.data && res.data.error) || '提交失败', icon: 'none' });
    }
  }).catch(() => {
    uni.showToast({ title: '提交失败', icon: 'none' });
  }).finally(() => {
    submitting.value = false;
  });
};

// ===== 初始化 =====
const loadMeta = async () => {
  try {
    const res = await uni.request({
      url: `/api/material-acceptances/meta?project_id=${projectId.value}`,
      header: authHeader(),
    });
    const d = res.data || {};
    if (d.project_name && !projectName.value) projectName.value = d.project_name;
    staff.value = Array.isArray(d.staff) ? d.staff : [];
    suppliers.value = Array.isArray(d.suppliers) ? d.suppliers : [];
    // 默认验收人 = 项目工长，没有工长则留空让用户选
    if (d.foreman_id) {
      form.foreman_id = d.foreman_id;
      form.foreman_name = d.foreman_name || '';
    }
  } catch (e) {
    /* meta 失败不阻断，工长可手工选/留空 */
  }
};

// ⚠️ 用 onLoad 而不是 onMounted + getCurrentPages()：H5 首屏 mounted 阶段页面栈可能还没就绪
onLoad(async (options) => {
  const opts = options || {};
  projectId.value = parseInt(opts.projectId || '0') || 0;
  if (opts.projectName) projectName.value = decodeURIComponent(opts.projectName);
  if (projectId.value) await loadMeta();
});

const goBack = () => uni.navigateBack();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 110px;
  box-sizing: border-box;
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
  margin: -16px -16px 0 -16px;
}
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.project-banner {
  font-size: 13px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 8px 14px;
  font-weight: 500;
  border-radius: 8px;
  margin: 12px 0;
}

.form-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.card-title { font-size: 15px; font-weight: 600; color: #1A1F36; }
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.count-badge {
  font-size: 11px;
  color: #fff;
  background: #1E3A5F;
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 4px;
}
.tool-btn {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 600;
  background: #DBEAFE;
  padding: 6px 12px;
  border-radius: 16px;
}

.form-item { margin-bottom: 14px; }
.form-item.col { display: block; }
.form-item:last-child { margin-bottom: 0; }

.form-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 8px;
  display: block;
}

.required { color: #EF4444; }

.picker-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  min-height: 44px;
  box-sizing: border-box;
}
.picker-value { font-size: 14px; color: #1A1F36; flex: 1; }
.picker-placeholder { font-size: 14px; color: #C7CBD3; flex: 1; }
.picker-arrow { font-size: 18px; color: #C7CBD3; padding-left: 8px; }
.inline-input { flex: 1; font-size: 14px; color: #1A1F36; }

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  min-height: 88px;
  box-sizing: border-box;
}

.empty-mini {
  padding: 24px 0;
  text-align: center;
}
.empty-mini-icon { font-size: 28px; display: block; margin-bottom: 6px; }
.empty-mini-text { font-size: 13px; color: #9CA3AF; }

/* 明细行 */
.item-card {
  border: 1px solid #EEF1F5;
  border-radius: 12px;
  padding: 12px;
  margin-top: 10px;
  background: #FCFDFF;
}
.item-head { display: flex; align-items: flex-start; }
.item-idx {
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background: #1E3A5F;
  color: #fff;
  font-size: 11px;
  margin-right: 8px;
  flex-shrink: 0;
}
.item-title-wrap { flex: 1; min-width: 0; }
.item-name { font-size: 14px; color: #1A1F36; font-weight: 600; display: block; }
.item-spec { font-size: 11px; color: #8A93A3; margin-top: 2px; display: block; }
.item-del { font-size: 14px; color: #C0C6D0; padding: 0 4px; }

.item-qty-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
}
.qty-cell {
  display: flex;
  align-items: center;
  border: 1.5px solid #E5E7EB;
  border-radius: 8px;
  padding: 4px 10px;
  margin-right: 8px;
  flex: 1;
}
.qty-label { font-size: 12px; color: #8A93A3; margin-right: 6px; }
.qty-input { flex: 1; font-size: 14px; color: #1A1F36; text-align: center; }
.qty-unit { font-size: 12px; color: #8A93A3; }

.verdict-row { display: flex; margin-top: 10px; }
.verdict-chip {
  flex: 1;
  text-align: center;
  font-size: 13px;
  padding: 8px 0;
  margin-right: 8px;
  border-radius: 8px;
  border: 1.5px solid #E5E7EB;
  color: #6B7280;
  background: #fff;
}
.verdict-chip:last-child { margin-right: 0; }
.verdict-chip.active.tone-pass { background: #E8F7EF; border-color: #10B981; color: #0E9F6E; font-weight: 600; }
.verdict-chip.active.tone-fail { background: #FDECEC; border-color: #EF4444; color: #DC2626; font-weight: 600; }
.verdict-chip.active.tone-warn { background: #FFF6E5; border-color: #F59E0B; color: #B45309; font-weight: 600; }

.tag-wrap { display: flex; flex-wrap: wrap; margin-top: 10px; }
.tag-chip {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 14px;
  border: 1px solid #E5E7EB;
  color: #6B7280;
  background: #fff;
  margin: 0 8px 8px 0;
}
.tag-chip.active { background: #FDECEC; border-color: #EF4444; color: #DC2626; }

/* 照片 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.photo-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #F3F4F6;
}
.photo-img { width: 100%; height: 100%; display: block; }
.photo-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.photo-uploading {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
}
.photo-status-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  color: #fff;
}
.badge-failed { background: #EF4444; }
.badge-warn { background: #F59E0B; }
.photo-add {
  aspect-ratio: 1;
  border: 1.5px dashed #D1D5DB;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9CA3AF;
}
.photo-add-icon { font-size: 24px; }
.photo-add-text { font-size: 12px; margin-top: 4px; }

.upload-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.upload-box {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  width: 220px;
  text-align: center;
}
.upload-title { font-size: 14px; color: #1A1F36; font-weight: 600; }
.upload-bar-bg {
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  margin: 14px 0 8px;
  overflow: hidden;
}
.upload-bar-fill { height: 100%; background: #3B82F6; transition: width 0.2s; }
.upload-text { font-size: 12px; color: #6B7280; }

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  z-index: 100;
}
.btn-submit {
  background: #1E3A5F;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 14px 0;
  border-radius: 10px;
  letter-spacing: 2px;
}
.btn-submit.loading { opacity: 0.7; }

/* 材料搜索弹层 */
.picker-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 900;
  display: flex;
  align-items: flex-end;
}
.picker-panel {
  width: 100%;
  max-height: 76vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.picker-title { font-size: 15px; font-weight: 600; color: #1A1F36; }
.picker-close { font-size: 16px; color: #9CA3AF; padding: 4px 8px; }
.picker-search { margin-bottom: 8px; }
.picker-input {
  border: 1.5px solid #E5E7EB;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  box-sizing: border-box;
  width: 100%;
}
.picker-list { flex: 1; max-height: 46vh; }
.picker-empty { text-align: center; color: #9CA3AF; font-size: 13px; padding: 28px 0; }
.picker-row {
  display: flex;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid #F3F4F6;
}
.picker-row-main { flex: 1; min-width: 0; }
.picker-row-name { font-size: 14px; color: #1A1F36; display: block; }
.picker-row-sub { font-size: 11px; color: #9CA3AF; margin-top: 2px; display: block; }
.picker-row-unit { font-size: 12px; color: #6B7280; }
.picker-foot { padding-top: 10px; text-align: center; }
.picker-manual { font-size: 13px; color: #1E3A5F; font-weight: 600; }
</style>
