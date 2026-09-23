<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">节点管理</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 项目名称 -->
    <view class="project-banner" v-if="projectName">
      <view class="project-banner-icon">📁</view>
      <view class="project-banner-info">
        <text class="project-banner-label">当前项目</text>
        <text class="project-banner-name">{{ projectName }}</text>
      </view>
    </view>

    <!-- 模板应用区 -->
    <view class="template-section">
      <view class="section-label">快速应用模板</view>
      <view class="template-pick">
        <view class="picker-value" @click="showTemplatePicker">{{ templateIndex >= 0 ? templateList[templateIndex].name : '选择节点模板...' }}</view>
        <button class="btn-apply" size="mini" :disabled="templateIndex < 0" @click="applyTemplate">应用</button>
      </view>

      <!-- 模板选择弹窗 -->
      <BottomPicker
        v-model:visible="templatePicker.visible"
        :title="templatePicker.title"
        :items="templatePicker.items"
        @select="onTemplateSelect"
        @cancel="templatePicker.visible = false"
      />
    </view>

    <!-- 节点列表 -->
    <view class="section-label">
      节点列表
      <view class="sort-toggle" @click="toggleSortMode">
        <text :class="sortMode ? 'sort-on' : 'sort-off'">{{ sortMode ? '✅ 调整顺序' : '📋 调整顺序' }}</text>
      </view>
    </view>
    <view class="node-list" :class="{ 'sort-mode': sortMode }">
      <view class="node-cards-wrap">
      <transition-group name="node-slide" tag="view">
      <view
        class="node-card"
        :class="{ 'sorting': draggingIndex === index, 'swap-flash': swappingIndexes.includes(index), 'status-pending': node.status === 'pending', 'status-in_progress': node.status === 'in_progress', 'status-completed': node.status === 'completed', 'status-skipped': node.status === 'skipped' }"
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
      </transition-group>
      </view>
      <view class="add-node-card" @click="showAddDialog">
        <text class="add-icon">+</text>
        <text class="add-text">新增节点</text>
      </view>
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

  <!-- 状态选择弹窗 -->
  <BottomPicker
    v-model:visible="statusPicker.visible"
    :title="statusPicker.title"
    :items="statusPicker.items"
    @select="onStatusSelect"
    @cancel="statusPicker.visible = false"
  />

  <!-- 短信模板选择弹窗 -->
  <BottomPicker
    v-model:visible="smsPicker.visible"
    :title="smsPicker.title"
    :items="smsPicker.items"
    @select="onSmsSelect"
    @cancel="smsPicker.visible = false"
  />
</template>

<script setup>
import { ref, onMounted, nextTick } from "vue";
import BottomPicker from "@/components/bottom-picker.vue";

defineOptions({ inheritAttrs: false });
const props = defineProps(['id']);

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

const templatePicker = ref({
  visible: false,
  title: '选择节点模板',
  items: [],
});

const showTemplatePicker = () => {
  templatePicker.value = {
    visible: true,
    title: '选择节点模板',
    items: templateList.value.map((t) => ({ name: t.name, icon: '📋', _index: templateList.value.indexOf(t) })),
  };
};

const onTemplateSelect = ({ item }) => {
  templateIndex.value = item._index;
  templatePicker.value.visible = false;
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

const statusPicker = ref({
  visible: false,
  title: '',
  items: [],
  _node: null,
});

const onStatusSelect = async ({ item }) => {
  const node = statusPicker.value._node;
  statusPicker.value.visible = false;
  if (!node) return;

  const statusMap = { '待开始': 'pending', '进行中': 'in_progress', '已完成': 'completed', '已跳过': 'skipped' };
  const newStatus = statusMap[item.name];

  if (newStatus === 'completed') {
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
    try {
      const token = uni.getStorageSync("token");
      await uni.request({
        url: `/api/project-stages/${node.id}`,
        method: "PUT",
        header: { Authorization: token },
        data: { status: newStatus },
      });
      await fetchNodes();
    } catch (e) {
      uni.showToast({ title: "更新失败", icon: "none" });
    }
  }
};

const showStatusPicker = (node) => {
  statusPicker.value = {
    visible: true,
    title: `修改状态：${node.node_name || node.stage_name}`,
    items: [
      { name: '待开始', icon: '⏳', value: 'pending' },
      { name: '进行中', icon: '🔄', value: 'in_progress' },
      { name: '已完成', icon: '✅', value: 'completed' },
      { name: '已跳过', icon: '⏭️', value: 'skipped' },
    ],
    _node: node,
  };
};

// ============= 短信模板 =============

const smsPicker = ref({
  visible: false,
  title: '',
  items: [],
  _node: null,
});

const onSmsSelect = async ({ item }) => {
  const node = smsPicker.value._node;
  smsPicker.value.visible = false;
  if (!node) return;
  const smsIndex = item._index;
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
};

const pickSmsTemplate = (node) => {
  smsPicker.value = {
    visible: true,
    title: `选择短信模板：${node.node_name || node.stage_name}`,
    items: [
      { name: '不发送短信', icon: '🚫', value: -1, _index: -1 },
      ...smsTemplateList.value.map((t) => ({ name: t.name, icon: '📩', value: t.id, _index: smsTemplateList.value.indexOf(t) })),
    ],
    _node: node,
  };
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
  projectId.value = parseInt(props.id || '0');
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
  background: #f0f2f7;
  padding: 12px 14px 40px;
}

/* 项目名称横幅 */
.project-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #1e3a5f, #2d5a8a);
  border-radius: 0;
  padding: 12px 16px;
  margin-bottom: 14px;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
}
.project-banner-icon {
  font-size: 26px;
  background: rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 8px;
  line-height: 1;
}
.project-banner-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.project-banner-label {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.project-banner-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.section-label {
  font-size: 13px;
  color: #888;
  margin-bottom: 10px;
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
}
.sort-off { background: #e8eaef; color: #666; }
.sort-on { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }

.template-section {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
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
  background: #f5f5f7;
  padding: 9px 12px;
  border-radius: 8px;
}

.btn-apply {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  font-size: 13px;
  padding: 0 18px;
  height: 34px;
  border-radius: 8px;
}
.btn-apply[disabled] { background: #ccc; }

/* 节点列表 */
.node-list { /* nothing */ }

.node-cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.node-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-left: 4px solid transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s, border-color 0.3s;
}
.status-pending { border-left-color: #d9d9d9; }
.status-in_progress { border-left-color: #ff9f43; }
.status-completed { border-left-color: #52c41a; }
.status-skipped { border-left-color: #bfbfbf; }

.node-drag-handle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}
.drag-icon {
  color: #667eea;
  font-size: 18px;
  letter-spacing: -3px;
}
.node-index {
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sort-mode .node-card { cursor: grab; }
.sort-mode .node-card:active { cursor: grabbing; }
.node-card.sorting {
  opacity: 0.7;
  transform: scale(0.98);
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
}
.swap-flash { animation: swap-pop 0.3s ease; }
@keyframes swap-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.04); box-shadow: 0 0 18px rgba(102, 126, 234, 0.5); }
  100% { transform: scale(1); }
}
.sort-mode .node-main > * { pointer-events: none; }

.node-main { flex: 1; min-width: 0; }

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.node-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-name-input {
  font-size: 15px;
  font-weight: 600;
  border: 1.5px solid #667eea;
  border-radius: 6px;
  padding: 2px 8px;
  flex: 1;
}
.edit-hint { font-size: 11px; margin-left: 4px; opacity: 0.4; }

.node-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.date-item { display: flex; align-items: center; gap: 4px; }
.date-label { font-size: 11px; color: #aaa; }
.date-val {
  font-size: 12px;
  color: #667eea;
  background: #f0f4ff;
  padding: 3px 8px;
  border-radius: 5px;
  font-weight: 500;
}
.date-arrow { color: #ccc; font-size: 11px; }

.node-bottom {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.status-pill {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 20px;
  cursor: pointer;
}
.s-pending { background: #f5f5f5; color: #999; }
.s-progress { background: #fff7e6; color: #e67e00; font-weight: 600; }
.s-done { background: linear-gradient(135deg, #e8f8f0, #d4f0e4); color: #27ae60; font-weight: 600; }
.s-skipped { background: #f5f5f5; color: #aaa; }

.sms-pill {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  background: #f9f9f9;
  color: #888;
  cursor: pointer;
  border: 1px solid #eee;
}

.node-delete {
  color: #ff4d4f;
  font-size: 15px;
  padding: 2px 6px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.node-delete:hover { opacity: 1; }

.add-node-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  border: 2px dashed #dcdfe6;
  margin-top: 6px;
  transition: border-color 0.2s, background 0.2s;
}
.add-node-card:active {
  background: #f0f4ff;
  border-color: #667eea;
}
.add-icon { font-size: 20px; color: #667eea; font-weight: bold; }
.add-text { font-size: 14px; color: #667eea; font-weight: 500; }

/* 弹窗 */
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: flex-end;
  z-index: 999;
}
.dialog-box {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 75vh;
  overflow-y: auto;
}
.dialog-title {
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  padding: 18px 16px 14px;
  border-bottom: 1px solid #f0f0f0;
  color: #1a1a1a;
}
.dialog-body { padding: 16px; }
.form-item { margin-bottom: 16px; }
.form-label { font-size: 13px; color: #666; margin-bottom: 7px; display: block; font-weight: 500; }
.form-input {
  border: 1.5px solid #eee;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.form-input:focus { border-color: #667eea; }
.dialog-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px 24px;
}
.btn-cancel {
  flex: 1;
  background: #f5f5f7;
  color: #333;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  height: 44px;
}
.btn-confirm {
  flex: 1;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  height: 44px;
  font-weight: 600;
}

/* 导航栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #1e3a5f, #264573);
  color: #fff;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 12px rgba(30, 58, 95, 0.3);
}
.nav-back {
  font-size: 30px;
  font-weight: 300;
  width: 40px;
  line-height: 1;
}
.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.nav-placeholder { width: 40px; }
</style>
