<template>
  <view class="page">
    <view class="nav-bar" :style="navStyle">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">上传文件</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 所属项目：从项目详情/文件列表进来时已绑定，锁定不可改；无入口参数时才允许手动选 -->
    <view class="section">
      <view class="section-label">所属项目 <text class="required">*</text></view>
      <view class="project-card" :class="{ locked: projectLocked }" @click="chooseProject">
        <text class="project-name">📁 {{ projectName || '点击选择项目' }}</text>
        <text v-if="projectLocked" class="project-lock">已绑定</text>
        <text v-else class="project-arrow">›</text>
      </view>
    </view>

    <!-- 文件分类 -->
    <view class="section">
      <view class="section-label">文件分类 <text class="required">*</text></view>
      <view class="cat-grid">
        <view
          v-for="c in categories"
          :key="c.key"
          class="cat-cell"
          :class="{ active: curCategory === c.key }"
          :style="curCategory === c.key ? 'background:' + c.color + ';border-color:#1E3A5F' : ''"
          @click="curCategory = c.key"
        >
          <text class="cat-icon">{{ c.icon }}</text>
          <text class="cat-label">{{ c.label }}</text>
        </view>
      </view>
    </view>

    <!-- 选择文件 -->
    <view class="section">
      <view class="section-label">选择文件 <text class="required">*</text></view>
      <view v-if="!fileInfo" class="upload-btn" @click="chooseFile">
        <text class="upload-icon">📎</text>
        <text class="upload-text">点击选择文件</text>
        <text class="upload-hint">支持 PDF/图片/Word/Excel/PPT/CAD/压缩包，单文件 ≤ 100MB</text>
      </view>
      <view v-else class="file-preview">
        <text class="file-preview-icon">{{ fileThumbIcon(fileInfo.ext) }}</text>
        <view class="file-preview-info">
          <text class="file-preview-name">{{ fileInfo.name }}</text>
          <text class="file-preview-size">{{ sizeText(fileInfo.size) }} · {{ fileInfo.ext.toUpperCase() }}</text>
        </view>
        <text class="file-preview-del" @click="removeFile">✕</text>
      </view>
    </view>

    <!-- 描述 -->
    <view class="section">
      <view class="section-label">备注（可选）</view>
      <textarea
        v-model="description"
        class="desc-input"
        placeholder="比如：与客户确认过的最终版本 v2"
        maxlength="200"
      />
    </view>

    <!-- 提交按钮 -->
    <view class="submit-bar">
      <view v-if="uploading" class="progress-wrap">
        <view class="progress-bar"><view class="progress-fill" :style="'width:' + progress + '%'"></view></view>
        <text class="progress-text">上传中... {{ progress }}%</text>
      </view>
      <button
        v-else
        class="btn-submit"
        :disabled="!canSubmit"
        :class="{ disabled: !canSubmit }"
        @click="submit"
      >提交上传</button>
    </view>

    <!-- 提示 -->
    <view class="tip">
      <text>📌 提交后文件进入「待审核」状态，由有审核权限的同事（项目经理/财务）审核通过后才正式归档。</text>
    </view>

    <!-- 项目选择弹层：自己实现，不用 uni.showActionSheet（微信上限 6 项，项目多了选不全） -->
    <view v-if="pickerVisible" class="picker-mask" @click="pickerVisible = false">
      <view class="picker-panel" @click.stop>
        <view class="picker-head">
          <text class="picker-title">选择所属项目</text>
          <text class="picker-close" @click="pickerVisible = false">✕</text>
        </view>
        <scroll-view scroll-y class="picker-list">
          <view
            v-for="p in projectList"
            :key="p.id"
            class="picker-item"
            :class="{ active: projectId === p.id }"
            @click="selectProject(p)"
          >
            <view class="picker-item-main">
              <text class="picker-item-name">{{ p.name || ('项目#' + p.id) }}</text>
              <text v-if="p.customer_name" class="picker-item-sub">{{ p.customer_name }}</text>
            </view>
            <text v-if="projectId === p.id" class="picker-item-check">✓</text>
          </view>
          <view v-if="!projectList.length" class="picker-empty">
            <text>{{ pickerLoading ? '加载中…' : '没有可选项目（可能没有项目查看权限）' }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import {
  FILE_CATEGORIES, fileThumbIcon, fileSizeText as sizeText,
} from "@/utils/permission";
import { absUrl } from "@/utils/api";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();

// 用临时 path 存文件（H5 用 blob URL，小程序用 tempFilePath）
const projectId = ref(0);
const projectName = ref("");
const curCategory = ref("");
const description = ref("");
const fileInfo = ref(null); // { path, name, size, ext }
const uploading = ref(false);
const progress = ref(0);

// 项目选择弹层
const pickerVisible = ref(false);
const pickerLoading = ref(false);
const projectList = ref([]);
// 项目是否已绑定（从项目详情 / 项目文件列表进入时锁定，与施工日志等其他模块保持一致）
const projectLocked = ref(false);

const categories = FILE_CATEGORIES;
const canSubmit = computed(() => projectId.value && curCategory.value && fileInfo.value);

const chooseFile = () => {
  // #ifdef H5
  // H5 端 chooseFile 走 web 原生 input
  uni.chooseFile({
    count: 1,
    extension: ['pdf','jpg','jpeg','png','gif','webp','doc','docx','xls','xlsx','ppt','pptx','dwg','dxf','zip','rar'],
    success: (res) => {
      const f = res.tempFiles[0];
      onFileChosen({
        path: f.path,
        name: f.name,
        size: f.size,
      });
    },
    fail: (e) => {
      console.warn('选择文件失败', e);
    }
  });
  // #endif
  // #ifdef MP-WEIXIN
  // 小程序走 chooseMessageFile 也支持；这里简单用 chooseImage（图片）+ 文字提示走 PC 端
  uni.chooseMessageFile({
    count: 1,
    extension: ['pdf','jpg','jpeg','png','doc','docx','xls','xlsx','ppt','pptx','dwg','dxf','zip','rar'],
    success: (res) => {
      const f = res.tempFiles[0];
      onFileChosen({
        path: f.path,
        name: f.name,
        size: f.size,
      });
    },
    fail: () => {
      // 退到图片选择
      uni.chooseImage({
        count: 1,
        success: (res2) => {
          const f = res2.tempFilePaths[0];
          const name = f.split('/').pop() || 'image.jpg';
          uni.getFileInfo({
            filePath: f,
            success: (info) => onFileChosen({ path: f, name, size: info.size }),
          });
        }
      });
    }
  });
  // #endif
};

const onFileChosen = (f) => {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (f.size > 100 * 1024 * 1024) {
    uni.showToast({ title: '文件超过 100MB', icon: 'none' });
    return;
  }
  fileInfo.value = { path: f.path, name: f.name, size: f.size, ext };
};

const removeFile = () => {
  fileInfo.value = null;
};

/**
 * 提交上传。
 * v2.3.12 修：原实现只有 H5 那一条路（XMLHttpRequest + FormData + fetch），
 * 而小程序 / App 里这三个 API 都不存在，点「提交上传」直接 ReferenceError，
 * 上传永远走不通。这里按平台分流：
 *   H5   → 原 XHR（为了拿 upload.onprogress 进度）
 *   小程序/App → uni.uploadFile + task.onProgressUpdate
 */
const submit = () => {
  if (!canSubmit.value) return;
  uploading.value = true;
  progress.value = 0;

  const userId = String((uni.getStorageSync('userInfo') || {}).id || '');
  const uploadUrl = absUrl('/api/project-files');

  // #ifdef H5
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  // H5 file path 是 blob URL，需要先 fetch 转 Blob
  fetch(fileInfo.value.path).then((r) => r.blob()).then((blob) => {
    formData.append('file', blob, fileInfo.value.name);
    formData.append('project_id', String(projectId.value));
    formData.append('category', curCategory.value);
    if (description.value) formData.append('description', description.value);

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('x-user-id', userId);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        progress.value = Math.round((e.loaded / e.total) * 100);
      }
    };
    xhr.onload = () => {
      uploading.value = false;
      try {
        const resp = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && resp.id) {
          uni.showToast({ title: '上传成功，待审核', icon: 'success' });
          setTimeout(() => safeBack(), 800);
        } else {
          uni.showToast({ title: resp.error || '上传失败', icon: 'none' });
        }
      } catch (e) {
        uni.showToast({ title: '上传失败', icon: 'none' });
      }
    };
    xhr.onerror = () => {
      uploading.value = false;
      uni.showToast({ title: '网络错误', icon: 'none' });
    };
    xhr.send(formData);
  }).catch((e) => {
    uploading.value = false;
    uni.showToast({ title: '文件读取失败', icon: 'none' });
  });
  // #endif

  // #ifndef H5
  const formData = {
    project_id: String(projectId.value),
    category: curCategory.value,
  };
  if (description.value) formData.description = description.value;

  const task = uni.uploadFile({
    url: uploadUrl,
    filePath: fileInfo.value.path,
    name: 'file',
    formData,
    header: { 'x-user-id': userId },
    success: (res) => {
      uploading.value = false;
      let resp = {};
      try {
        resp = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {});
      } catch (_) { resp = {}; }
      if (res.statusCode === 200 && resp.id) {
        uni.showToast({ title: '上传成功，待审核', icon: 'success' });
        setTimeout(() => safeBack(), 800);
      } else {
        uni.showToast({ title: resp.error || `上传失败(${res.statusCode})`, icon: 'none' });
      }
    },
    fail: (e) => {
      uploading.value = false;
      const msg = (e && e.errMsg) || '';
      uni.showToast({ title: /timeout/i.test(msg) ? '上传超时，请重试' : '网络错误，上传失败', icon: 'none' });
    },
  });
  // 上传进度（小程序 Task 形态，不支持时静默跳过）
  if (task && typeof task.onProgressUpdate === 'function') {
    task.onProgressUpdate((e) => { progress.value = e.progress || 0; });
  }
  // #endif
};

/**
 * 返回：栈深 > 1 才 navigateBack，否则回首页。
 * （页面被设成启动页 / 扫码直达时页面栈只有 1 层，裸调 navigateBack 会抛
 *   "navigateBack:fail cannot navigate back at first page"）
 */
const safeBack = () => {
  let depth = 0;
  try {
    const fn = typeof getCurrentPages === 'function' ? getCurrentPages : globalThis.getCurrentPages;
    depth = typeof fn === 'function' ? (fn() || []).length : 0;
  } catch (_) { depth = 0; }
  if (depth > 1) uni.navigateBack();
  else uni.switchTab({ url: '/pages/home/index' });
};

const goBack = () => safeBack();

/** 拉项目列表（受后端权限过滤：设计师只能看到自己关联的项目） */
const loadProjects = () => new Promise((resolve) => {
  pickerLoading.value = true;
  uni.request({
    url: '/api/projects',
    header: {
      Authorization: uni.getStorageSync('token') || '',
      // 与项目详情等页面保持一致的三个请求头，后端按 x-user-id / Authorization 解析身份
      'x-user-role': userStore.state.role_name,
      'x-user-id': String(userStore.state.id),
    },
    success: (res) => {
      const raw = res && res.data;
      const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
      projectList.value = list;
      pickerLoading.value = false;
      resolve(list);
    },
    fail: () => {
      pickerLoading.value = false;
      resolve([]);
    },
  });
});

const chooseProject = async () => {
  // 已绑定项目（从项目详情进来）不允许改选，和其他模块口径一致
  if (projectLocked.value) return;
  pickerVisible.value = true;
  if (!projectList.value.length) await loadProjects();
};

const selectProject = (p) => {
  projectId.value = Number(p.id) || 0;
  projectName.value = p.name || ('项目#' + p.id);
  pickerVisible.value = false;
};

/** 安全解码：URL 参数里的中文是 percent-encoded，直接显示会变成一串 %E6%9F%8F… 的乱码 */
const safeDecode = (v) => {
  const s = String(v || '');
  if (!s || s.indexOf('%') < 0) return s;
  try { return decodeURIComponent(s); } catch (_) { return s; }
};

/**
 * v2.3.12 修：入口参数必须在 onLoad(options) 里读。
 * 原先在 setup 顶层用 getCurrentPages() 取「当前页」的 options —— 小程序端 setup 执行时
 * 当前页还没进页面栈，拿到的其实是上一页（项目详情，options 是 {id:15}），
 * 所以 projectId 恒为 0、项目名恒为空，页面永远显示「未选择」，上传按钮也永远 disabled。
 *
 * v2.3.13 修：
 *  1. 带 projectId 进来 = 项目已绑定，锁定不可改选（和施工日志等模块一致）；
 *  2. 项目名以 /api/projects 返回为准，URL 里的名字只做首屏占位，且必须 decode，否则显示乱码。
 */
onLoad((options) => {
  // 页面级守卫：后端 /api/project-files 上传要求 project_file:write，前端同口径拦一道
  if (!userStore.canSee('project_file:write')) {
    uni.showToast({ title: '无文件上传权限', icon: 'none' });
    setTimeout(() => safeBack(), 600);
    return;
  }
  const opt = options || {};
  const pid = parseInt(opt.projectId || opt.project_id || 0);
  projectId.value = pid || 0;
  projectLocked.value = pid > 0;
  // 先放 URL 里解出来的名字占位（避免首屏闪「点击选择项目」）
  projectName.value = safeDecode(opt.projectName || opt.project_name || '');
  // 支持从列表页带分类进来（预选）
  if (opt.category) curCategory.value = opt.category;

  // 名字以接口为准：既纠正 URL 编码问题，也能覆盖「只传 id 不传名字」的入口
  if (projectId.value) {
    loadProjects().then((list) => {
      const hit = (list || []).find((p) => Number(p.id) === projectId.value);
      if (hit && hit.name) projectName.value = hit.name;
      else if (!projectName.value) projectName.value = '项目#' + projectId.value;
    });
  }
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding: 16px;
  padding-bottom: 120px;
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
.nav-back { font-size: 28px; font-weight: 300; width: 40px; }
.nav-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
.nav-placeholder { width: 40px; }

.section {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 10px;
}
.required { color: #EF4444; }

.project-card {
  background: #F5F7FA;
  padding: 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.project-name { font-size: 14px; color: #1E3A5F; flex: 1; }
.project-arrow { font-size: 20px; color: #9CA3AF; margin-left: 8px; }
/* 已绑定项目：视觉上不可点，避免用户误以为还能改 */
.project-card.locked { background: #F3F4F6; }
.project-card.locked .project-name { color: #374151; }
.project-lock {
  font-size: 12px;
  color: #6B7280;
  background: #E5E7EB;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 8px;
}

/* ==================== 项目选择弹层 ==================== */
.picker-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 900;
  display: flex;
  align-items: flex-end;
}
.picker-panel {
  width: 100%;
  max-height: 70vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
}
.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #E5E7EB;
}
.picker-title { font-size: 16px; font-weight: 600; color: #1A1F36; }
.picker-close { font-size: 18px; color: #9CA3AF; padding: 0 4px; }
.picker-list { max-height: 55vh; }
.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #F3F4F6;
}
.picker-item.active { background: #E8EEF6; }
.picker-item-main { display: flex; flex-direction: column; flex: 1; }
.picker-item-name { font-size: 15px; color: #1A1F36; }
.picker-item-sub { font-size: 12px; color: #9CA3AF; margin-top: 3px; }
.picker-item-check { font-size: 16px; color: #1E3A5F; font-weight: 700; }
.picker-empty { padding: 40px 16px; text-align: center; font-size: 13px; color: #9CA3AF; }

.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.cat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 6px;
  border-radius: 10px;
  background: #F9FAFB;
  border: 2px solid transparent;
  transition: all 0.15s;
}
.cat-icon { font-size: 24px; margin-bottom: 4px; }
.cat-label { font-size: 12px; color: #1E3A5F; }

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 20px;
  border: 2px dashed #D1D5DB;
  border-radius: 12px;
  background: #F9FAFB;
}
.upload-icon { font-size: 40px; margin-bottom: 8px; }
.upload-text { font-size: 15px; color: #1E3A5F; font-weight: 600; margin-bottom: 4px; }
.upload-hint { font-size: 11px; color: #9CA3AF; text-align: center; }

.file-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #F9FAFB;
  border-radius: 10px;
}
.file-preview-icon { font-size: 32px; }
.file-preview-info { flex: 1; min-width: 0; }
.file-preview-name {
  font-size: 14px;
  color: #1E3A5F;
  font-weight: 600;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.file-preview-size { font-size: 11px; color: #9CA3AF; margin-top: 2px; }
.file-preview-del {
  font-size: 18px;
  color: #EF4444;
  padding: 4px 8px;
}

.desc-input {
  width: 100%;
  min-height: 80px;
  padding: 10px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 14px;
  background: #F9FAFB;
  box-sizing: border-box;
}

.submit-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: #fff;
  border-top: 1px solid #F3F4F6;
  z-index: 50;
}
.btn-submit {
  width: 100%;
  height: 48px;
  background: linear-gradient(135deg, #1E3A5F, #3B82F6);
  color: #fff;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
}
.btn-submit.disabled { background: #D1D5DB; color: #fff; }

.progress-wrap { display: flex; flex-direction: column; gap: 6px; }
.progress-bar {
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1E3A5F, #3B82F6);
  transition: width 0.2s;
}
.progress-text { font-size: 12px; color: #6B7280; text-align: center; }

.tip {
  margin-top: 16px;
  padding: 10px;
  background: #FEF3C7;
  border-radius: 8px;
  font-size: 12px;
  color: #92400E;
  line-height: 1.5;
}
</style>
