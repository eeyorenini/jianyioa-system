<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">节点管理</text>
      <view class="nav-placeholder"></view>
    </view>

    <view class="page-title">节点管理</view>

    <!-- 项目名称 -->
    <view class="project-label" v-if="projectName">
      📁 {{ projectName }}
    </view>

    <!-- 模板应用区 -->
    <view class="template-section">
      <view class="section-label">快速应用模板</view>
      <view class="template-pick">
        <picker :value="templateIndex" :range="templateList" range-key="name" @change="onTemplateChange">
          <view class="picker-value">
            {{ templateIndex >= 0 ? templateList[templateIndex].name : '选择节点模板...' }}
          </view>
        </picker>
        <button class="btn-apply" size="mini" :disabled="templateIndex < 0" @click="applyTemplate">应用</button>
      </view>
    </view>

    <!-- 节点列表 -->
    <view class="section-label">
      节点列表
      <view class="sort-toggle" @click="toggleSortMode">
        <text :class="sortMode ? 'sort-on' : 'sort-off'">{{ sortMode ? '✅ 调整顺序' : '📋 调整顺序' }}</text>
      </view>
    </view>
    <view class="node-list" :class="{ 'sort-mode': sortMode }">
      <transition-group name="node-slide" tag="view" class="node-cards-wrap">
      <view
        class="node-card"
        :class="{ 'sorting': draggingIndex === index, 'swap-flash': swappingIndexes.includes(index) }"
        v-for="(node, index) in nodes"
        :key="node.id"
        :data-index="index"
        @touchstart="onDragStart($event, index)"
        @touchmove.prevent="onDragMove($event, index)"
        @touchend="onDragEnd($event, index)"
      >
        <view class="node-drag-handle">
          <text v-if="sortMode" class="drag-icon">⋮⋮</text>
          <text v-else class="node-index">{{ index + 1 }}</text>
        </view>
        <view class="node-main">
          <view class="node-header">
            <!-- 点击编辑名称 -->
            <input
              v-if="editingId === node.id"
              class="node-name-input"
              v-model="editingName"
              @blur="saveNodeName(node)"
              @confirm="saveNodeName(node)"
              confirm-type="done"
              :focus="true"
            />
            <view v-else class="node-name" @click="startEditName(node)">
              {{ node.node_name || node.stage_name || '未命名' }}
              <text class="edit-hint">✏️</text>
            </view>
          </view>

          <view class="node-dates">
            <view class="date-item">
              <text class="date-label">计划</text>
              <view class="date-val" @click="pickDate(node, 'plan')">
                {{ node.plan_date || '设置开始' }}
              </view>
            </view>
            <text class="date-arrow">→</text>
            <view class="date-item">
              <text class="date-label">结束</text>
              <view class="date-val" @click="pickDate(node, 'plan_end')">
                {{ node.plan_end_date || '设置结束' }}
              </view>
            </view>
          </view>

          <view class="node-bottom">
            <view class="status-pill" :class="getNodeStatusClass(node.status)" @click="showStatusPicker(node)">
              {{ getNodeStatusText(node.status) }}
            </view>
            <view class="sms-pill" @click="pickSmsTemplate(node)">
              📩 {{ node.sms_template_id ? '已选模板' : '选短信模板' }}
            </view>
          </view>
        </view>
        <view class="node-delete" @click="deleteNode(node, index)">✕</view>
      </view>

      <!-- 新增节点 -->
      <view class="add-node-card" @click="showAddDialog">
        <text class="add-icon">+</text>
        <text class="add-text">新增节点</text>
      </view>
    </transition-group>
    </view>

    <!-- 新增节点弹窗 -->
    <view class="dialog-mask" v-if="showDialog" @click="showDialog = false">
      <view class="dialog-box" @click.stop>
        <view class="dialog-title">新增节点</view>
        <view class="dialog-body">
          <view class="form-item">
            <text class="form-label">节点名称</text>
            <input class="form-input" v-model="addForm.node_name" placeholder="如：水电工程" />
          </view>
          <view class="form-item">
            <text class="form-label">插入位置</text>
            <picker :value="addForm.afterIndex" :range="insertOptions" @change="onInsertChange">
              <view class="picker-value">{{ insertOptions[addForm.afterIndex] || '默认追加到最后' }}</view>
            </picker>
          </view>
          <view class="form-item">
            <text class="form-label">短信模板</text>
            <picker :value="addForm.smsIndex" :range="smsTemplateList" range-key="name" @change="onSmsTemplateChange">
              <view class="picker-value">
                {{ addForm.smsIndex >= 0 ? smsTemplateList[addForm.smsIndex].name : '不发送短信' }}
              </view>
            </picker>
          </view>
        </view>
        <view class="dialog-footer">
          <button class="btn-cancel" @click="showDialog = false">取消</button>
          <button class="btn-confirm" @click="confirmAdd">确定</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";

const projectId = ref(0);
const projectName = ref('');
const nodes = ref([]);
const templateList = ref([]);
const templateIndex = ref(-1);
const smsTemplateList = ref([]);

// 编辑名称
const editingId = ref(null);
const editingName = ref('');

// 新增弹窗
const showDialog = ref(false);
const addForm = ref({
  node_name: '',
  afterIndex: 0,
  smsIndex: -1,
});

const insertOptions = ref(['插入到最前面']);

// ============= 拖拽排序 =============
const sortMode = ref(false);
const draggingIndex = ref(-1);
let dragStartY = 0;
// 记录刚交换过的两个卡片，产生缩放闪动反馈
const swappingIndexes = ref([]);

const toggleSortMode = () => {
  if (sortMode.value) {
    // 关闭时保存排序
    sortMode.value = false;
    saveSortOrder();
  } else {
    sortMode.value = true;
  }
};

const onDragStart = (e, index) => {
  if (!sortMode.value) return;
  draggingIndex.value = index;
  dragStartY = e.touches[0].clientY;
};

const onDragMove = (e, index) => {
  if (!sortMode.value || draggingIndex.value < 0) return;
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - dragStartY;
  const cardHeight = 100;
  const moved = Math.round(deltaY / cardHeight);
  const newIndex = Math.max(0, Math.min(nodes.value.length - 1, draggingIndex.value + moved));
  if (newIndex !== draggingIndex.value) {
    // 记录被交换的两个位置，用于动画反馈
    swappingIndexes.value = [draggingIndex.value, newIndex];
    // 交换数组
    const arr = [...nodes.value];
    const [removed] = arr.splice(draggingIndex.value, 1);
    arr.splice(newIndex, 0, removed);
    nodes.value = arr;
    draggingIndex.value = newIndex;
    dragStartY = currentY;
    // 300ms 后清除闪动状态
    setTimeout(() => {
      swappingIndexes.value = [];
    }, 300);
  }
};

const onDragEnd = (e, index) => {
  if (!sortMode.value) return;
  draggingIndex.value = -1;
  dragOverIndex.value = -1;
};

// ============= API =============

const fetchNodes = async () => {
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: "/api/projects",
      header: { Authorization: token },
    });
    const data = res.data || [];
    if (Array.isArray(data)) {
      const found = data.find((p) => p.id === projectId.value);
      if (found) {
        nodes.value = found.nodes || [];
        projectName.value = found.name;
      }
    }
  } catch (e) {
    console.error("加载节点失败", e);
  }
};

const fetchTemplates = async () => {
  try {
    const token = uni.getStorageSync("token");
    const [nodeTplRes, smsRes] = await Promise.all([
      uni.request({ url: "/api/progress-node-templates", header: { Authorization: token } }),
      uni.request({ url: "/api/sms-templates", header: { Authorization: token } }),
    ]);
    const nodeTpl = nodeTplRes.data || [];
    const smsTpl = smsRes.data || [];
    if (Array.isArray(nodeTpl)) templateList.value = nodeTpl;
    if (Array.isArray(smsTpl)) smsTemplateList.value = smsTpl;
  } catch (e) {
    console.error("加载模板失败", e);
  }
};

const onTemplateChange = (e) => {
  templateIndex.value = e.detail.value;
};

const applyTemplate = async () => {
  if (templateIndex.value < 0) return;
  const tpl = templateList.value[templateIndex.value];
  try {
    uni.showLoading({ title: "应用模板..." });
    const token = uni.getStorageSync("token");
    await uni.request({
      url: `/api/progress-nodes/init/${projectId.value}`,
      method: "POST",
      header: { Authorization: token },
      data: { template_id: tpl.id },
    });
    uni.hideLoading();
    uni.showToast({ title: "模板应用成功", icon: "success" });
    await fetchNodes();
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: "应用失败", icon: "none" });
  }
};

// ============= API =============

const saveSortOrder = async () => {
  try {
    const token = uni.getStorageSync("token");
    // 逐个更新 sort_order（后端没有批量接口）
    await Promise.all(
      nodes.value.map((n, i) =>
        uni.request({
          url: `/api/project-stages/${n.id}`,
          method: "PUT",
          header: { Authorization: token },
          data: { sort_order: i + 1 },
        })
      )
    );
  } catch (e) {
    console.error("保存排序失败", e);
  }
};

// ============= 名称编辑 =============

const startEditName = (node) => {
  editingId.value = node.id;
  editingName.value = node.node_name || node.stage_name || '';
};

const saveNodeName = async (node) => {
  if (!editingName.value.trim()) {
    editingId.value = null;
    return;
  }
  try {
    const token = uni.getStorageSync("token");
    await uni.request({
      url: `/api/project-stages/${node.id}`,
      method: "PUT",
      header: { Authorization: token },
      data: { node_name: editingName.value.trim() },
    });
    editingId.value = null;
    await fetchNodes();
  } catch (e) {
    uni.showToast({ title: "保存失败", icon: "none" });
  }
};

// ============= 日期选择 =============

const pickDate = async (node, type) => {
  const date = await new Promise((resolve) => {
    uni.showDatePicker({
      currentDate: node[type === 'plan' ? 'plan_date' : 'plan_end_date'] || new Date().toISOString().split('T')[0],
      success: (res) => resolve(res.value || ''),
      fail: () => resolve(''),
    });
  });
  if (!date) return;
  try {
    const token = uni.getStorageSync("token");
    const data = type === 'plan' ? { plan_date: date } : { plan_end_date: date };
    await uni.request({
      url: `/api/project-stages/${node.id}`,
      method: "PUT",
      header: { Authorization: token },
      data,
    });
    await fetchNodes();
  } catch (e) {
    uni.showToast({ title: "保存日期失败", icon: "none" });
  }
};

// ============= 状态选择 =============

const showStatusPicker = (node) => {
  const options = ['待开始', '进行中', '已完成', '已跳过'];
  uni.showActionSheet({
    itemList: options,
    title: `修改状态：${node.node_name || node.stage_name}`,
    success: async (res) => {
      const statusMap = ['pending', 'in_progress', 'completed', 'skipped'];
      const newStatus = statusMap[res.tapIndex];
      if (newStatus === 'completed') {
        // 弹出确认：是否发送短信
        const doUpdate = await new Promise((resolve) => {
          uni.showModal({
            title: '节点完成',
            content: `是否发送短信通知？`,
            confirmText: '发送短信',
            cancelText: '仅保存',
            success: (m) => resolve(m.confirm),
          });
        });
        const updateData = {
          status: 'completed',
          progress_percent: 100,
          actual_date: new Date().toISOString().split('T')[0],
        };
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: updateData,
          });
          if (doUpdate && node.sms_template_id) {
            await uni.request({
              url: `/api/sms/send`,
              method: "POST",
              header: { Authorization: token },
              data: { node_id: node.id, template_id: node.sms_template_id },
            });
            uni.showToast({ title: "已保存并发送短信", icon: "success" });
          } else {
            uni.showToast({ title: "已保存", icon: "success" });
          }
          await fetchNodes();
        } catch (e) {
          uni.showToast({ title: "更新失败", icon: "none" });
        }
      } else {
        const updateData = { status: newStatus };
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: updateData,
          });
          await fetchNodes();
        } catch (e) {
          uni.showToast({ title: "更新失败", icon: "none" });
        }
      }
    },
  });
};

// ============= 短信模板 =============

const pickSmsTemplate = (node) => {
  const options = ['不发送短信', ...smsTemplateList.value.map((t) => t.name)];
  const indexMap = [-1, ...smsTemplateList.value.map((_, i) => i)];
  uni.showActionSheet({
    itemList: options,
    title: `选择短信模板：${node.node_name || node.stage_name}`,
    success: async (res) => {
      const smsIndex = indexMap[res.tapIndex];
      try {
        const token = uni.getStorageSync("token");
        await uni.request({
          url: `/api/project-stages/${node.id}`,
          method: "PUT",
          header: { Authorization: token },
          data: { sms_template_id: smsIndex >= 0 ? smsTemplateList.value[smsIndex].id : null },
        });
        await fetchNodes();
      } catch (e) {
        uni.showToast({ title: "保存失败", icon: "none" });
      }
    },
  });
};

// ============= 删除节点 =============

const deleteNode = async (node, index) => {
  const confirm = await new Promise((resolve) => {
    uni.showModal({
      title: '确认删除',
      content: `删除节点「${node.node_name || node.stage_name}」？`,
      success: (m) => resolve(m.confirm),
    });
  });
  if (!confirm) return;
  try {
    const token = uni.getStorageSync("token");
    await uni.request({
      url: `/api/project-stages/${node.id}`,
      method: "DELETE",
      header: { Authorization: token },
    });
    nodes.value.splice(index, 1);
    uni.showToast({ title: "已删除", icon: "success" });
  } catch (e) {
    uni.showToast({ title: "删除失败", icon: "none" });
  }
};

// ============= 新增节点 =============

const showAddDialog = () => {
  addForm.value = { node_name: '', afterIndex: 0, smsIndex: -1 };
  insertOptions.value = ['插入到最前面', ...nodes.value.map((n) => `插入到「${n.node_name || n.stage_name}」之后`)];
  showDialog.value = true;
};

const onInsertChange = (e) => {
  addForm.value.afterIndex = e.detail.value;
};

const onSmsTemplateChange = (e) => {
  addForm.value.smsIndex = e.detail.value;
};

const confirmAdd = async () => {
  if (!addForm.value.node_name.trim()) {
    uni.showToast({ title: "请输入节点名称", icon: "none" });
    return;
  }
  try {
    const token = uni.getStorageSync("token");
    const afterOptions = [0, ...nodes.value.map((n) => n.id)];
    const afterNodeId = afterOptions[addForm.value.afterIndex];
    const data = {
      node_name: addForm.value.node_name.trim(),
      after_node_id: afterNodeId === 0 ? undefined : afterNodeId,
    };
    if (addForm.value.smsIndex >= 0) {
      data.sms_template_id = smsTemplateList.value[addForm.value.smsIndex].id;
    }
    await uni.request({
      url: "/api/project-stages",
      method: "POST",
      header: { Authorization: token },
      data,
    });
    showDialog.value = false;
    uni.showToast({ title: "添加成功", icon: "success" });
    await fetchNodes();
  } catch (e) {
    uni.showToast({ title: "添加失败", icon: "none" });
  }
};

// ============= 工具方法 =============

const getNodeStatusClass = (status) => {
  if (status === 'completed') return 's-done';
  if (status === 'in_progress') return 's-progress';
  if (status === 'skipped') return 's-skipped';
  return 's-pending';
};

const getNodeStatusText = (status) => {
  const map = {
    pending: '待开始',
    in_progress: '进行中',
    completed: '已完成',
    skipped: '已跳过',
  };
  return map[status] || '待开始';
};

// =============

onMounted(async () => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
    const options = (current.options || {});
  projectId.value = parseInt(options.id || '0');
  if (projectId.value) {
    await Promise.all([fetchNodes(), fetchTemplates()]);
  }
  // 更新插入位置选项
  insertOptions.value = ['插入到最前面', ...nodes.value.map((n) => `插入到「${n.node_name || n.stage_name}」之后`)];
});


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 15px;
  padding-bottom: 30px;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.project-label {
  font-size: 13px;
  color: #667eea;
  background: #f0f4ff;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
}

.section-label {
  font-size: 13px;
  color: #999;
  margin-bottom: 8px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-toggle {
  display: inline-block;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  margin-left: auto;
  cursor: pointer;
}

.sort-off {
  background: #f0f0f0;
  color: #666;
}

.sort-on {
  background: #667eea;
  color: #fff;
}

.template-section {
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.template-pick {
  display: flex;
  align-items: center;
  gap: 10px;
}

.picker-value {
  flex: 1;
  font-size: 14px;
  color: #333;
  background: #f5f5f5;
  padding: 8px 12px;
  border-radius: 6px;
}

.btn-apply {
  background: #667eea;
  color: #fff;
  border: none;
  font-size: 13px;
}

.btn-apply[disabled] {
  background: #ccc;
}

/* 节点卡片拖拽动画 */
.node-slide-move {
  transition: transform 0.3s ease;
}

.node-list {
  /* 容器样式由 node-cards-wrap 承担 */
}

.node-cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.node-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.node-drag-handle {
  font-size: 18px;
  font-weight: bold;
  padding: 4px 6px;
  line-height: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.drag-icon {
  color: #667eea;
  font-size: 16px;
  letter-spacing: -2px;
}

.node-index {
  width: 20px;
  height: 20px;
  background: #667eea;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sort-mode .node-card {
  cursor: grab;
}

.sort-mode .node-card:active {
  cursor: grabbing;
}

.node-card.sorting {
  opacity: 0.6;
  transform: scale(0.98);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.swap-flash {
  animation: swap-pop 0.3s ease;
}

@keyframes swap-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); box-shadow: 0 0 16px rgba(102, 126, 234, 0.5); }
  100% { transform: scale(1); }
}

.node-card.sort-drag-over {
  border: 2px dashed #667eea;
}

.sort-mode .node-main > * {
  pointer-events: none;
}

.node-main {
  flex: 1;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.node-num {
  width: 20px;
  height: 20px;
  background: #667eea;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-name {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.node-name-input {
  font-size: 15px;
  font-weight: bold;
  border: 1px solid #667eea;
  border-radius: 4px;
  padding: 2px 6px;
  flex: 1;
}

.edit-hint {
  font-size: 12px;
  margin-left: 4px;
  opacity: 0.5;
}

.node-dates {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.date-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.date-label {
  font-size: 12px;
  color: #999;
}

.date-val {
  font-size: 12px;
  color: #667eea;
  background: #f0f4ff;
  padding: 2px 8px;
  border-radius: 4px;
}

.date-arrow {
  color: #ccc;
  font-size: 12px;
}

.node-bottom {
  display: flex;
  gap: 8px;
  align-items: center;
}

.status-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.s-pending { background: #f0f0f0; color: #999; }
.s-progress { background: #fff7e6; color: #ff9f43; }
.s-done { background: #e8f8f0; color: #52c41a; }
.s-skipped { background: #fff3e6; color: #ff6600; }

.sms-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  background: #f9f9f9;
  color: #666;
  cursor: pointer;
}

.node-delete {
  color: #ff4d4f;
  font-size: 16px;
  padding: 4px;
  cursor: pointer;
}

.add-node-card {
  background: #f9f9f9;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  border: 2px dashed #ddd;
}

.add-icon {
  font-size: 22px;
  color: #667eea;
  font-weight: bold;
}

.add-text {
  font-size: 14px;
  color: #667eea;
}

/* 弹窗 */
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-end;
  z-index: 999;
}

.dialog-box {
  background: #fff;
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
}

.dialog-title {
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.dialog-body {
  padding: 16px;
}

.form-item {
  margin-bottom: 14px;
}

.form-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
  display: block;
}

.form-input {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.dialog-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px 20px;
}

.btn-cancel {
  flex: 1;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 8px;
  font-size: 15px;
}

.btn-confirm {
  flex: 1;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
}
/* 导航栏 */
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

</style>
