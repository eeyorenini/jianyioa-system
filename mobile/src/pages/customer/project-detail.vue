<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目信息</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 页面加载中 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 无权限 -->
    <customer-empty-state
      v-else-if="error === 'forbidden'"
      type="forbidden"
      title="无权访问"
      description="您暂无查看该项目详情"
      button-text="返回"
      @back="goBack"
    />

    <!-- 正常内容 -->
    <view v-else-if="project" class="page-content">
      
      <!-- 顶部项目信息卡片 -->
      <view class="project-header">
        <view class="project-title-row">
          <view class="project-name-wrap">
            <text class="project-name">{{ project.name }}</text>
            <view class="status-badge" :class="getStatusClass(project.status)">
              {{ project.status || '进行中' }}
            </view>
          </view>
        </view>

        <view class="project-progress">
          <view class="progress-bar-full">
            <view class="progress-fill-full" :style="{ width: actualProgress + '%' }"></view>
          </view>
          <text class="progress-text-full">{{ actualProgress }}%</text>
        </view>

        <!-- 基本信息 -->
        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">客户</text>
            <text class="info-value">{{ project.customer_name || '未关联' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">预算</text>
            <text class="info-value accent">{{ project.budget ? '¥' + project.budget.toLocaleString() : '未设置' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">开工</text>
            <text class="info-value">{{ project.start_date || '未设置' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">竣工</text>
            <text class="info-value">{{ project.end_date || '未设置' }}</text>
          </view>
        </view>
        
        <!-- 项目成员信息 -->
        <view class="project-members" v-if="projectMembers.length > 0">
          <text class="members-title">项目成员</text>
          <view class="members-table">
            <view class="member-row" v-for="member in projectMembers" :key="member.id">
              <view class="member-td role">
                <text class="member-role">{{ member.role }}</text>
              </view>
              <view class="member-td name">
                <text class="member-name">{{ member.name }}</text>
              </view>
              <view class="member-td phone">
                <text class="member-phone">{{ member.phone }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 标签页导航 - 客户版只有：节点、日志、巡检 -->
      <view class="tab-bar">
        <view
          class="tab-item"
          v-for="tab in customerTabs"
          :key="tab.key"
          :class="{ active: curTab === tab.key }"
          @click="curTab = tab.key"
        >
          <text>{{ tab.label }}</text>
          <view class="tab-dot" v-if="tab.badge">{{ tab.badge }}</view>
        </view>
      </view>

      <!-- 标签页内容 -->
      <view class="tab-content">
        
        <!-- 进度节点 - 只读 -->
        <view v-if="curTab === 'nodes'" class="tab-panel">
          <view class="panel-toolbar">
            <text class="panel-title">施工节点</text>
          </view>

          <view class="node-timeline" v-if="project.nodes && project.nodes.length">
            <view
              class="timeline-item"
              v-for="(node, idx) in project.nodes"
              :key="node.id"
            >
              <!-- 时间线 -->
              <view class="timeline-line">
                <view class="timeline-dot" :class="getNodeStatusClass(node.status)"></view>
                <view class="timeline-connector" v-if="idx < project.nodes.length - 1"></view>
              </view>

              <!-- 内容 -->
              <view class="timeline-content">
                <view class="node-card" :class="`node-card-${getNodeStatusClass(node.status)}`">
                  <view class="node-card-header">
                    <text class="node-seq">{{ idx + 1 }}</text>
                    <text class="node-title">{{ node.node_name || node.stage_name || '未命名' }}</text>
                    <view class="node-status-pill" :class="getNodeStatusClass(node.status)">
                      {{ getNodeStatusText(node.status) }}
                    </view>
                  </view>
                  <view class="node-card-body">
                    <view class="node-dates" v-if="node.plan_date">
                      <text class="node-date-icon">📅</text>
                      <text class="node-date-text">{{ node.plan_date }}
                        <text v-if="node.plan_end_date"> ~ {{ node.plan_end_date }}</text>
                      </text>
                    </view>
                    <view class="node-dates" v-else>
                      <text class="node-date-text muted">未排期</text>
                    </view>
                    <view class="node-note" v-if="node.note">
                      <text class="note-text">{{ node.note }}</text>
                    </view>
                  </view>
                  <!-- 客户版：隐藏操作按钮 -->
                </view>
              </view>
            </view>
          </view>

          <view class="empty-state" v-else>
            <text class="empty-icon">📋</text>
            <text class="empty-text">暂无节点信息</text>
          </view>
        </view>

        <!-- 施工日志 - 只读 -->
        <view v-if="curTab === 'logs'" class="tab-panel">
          <view class="panel-toolbar">
            <text class="panel-title">施工日志</text>
            <text class="tool-btn muted">仅可查看</text>
          </view>

          <view class="loading-state" v-if="logsLoading">
            <text>加载中...</text>
          </view>
          <view class="log-list" v-else-if="logs.length">
            <view class="log-item" v-for="log in logs" :key="log.id">
              <!-- 第一行：日期卡片 + 提交人/时间 + 工种人数 -->
              <view class="log-row-first">
                <view class="log-date-bar">
                  <text class="log-date-day">{{ formatDay(log.created_at) }}</text>
                  <text class="log-date-month">{{ formatMonth(log.created_at) }}</text>
                </view>
                <view class="log-user-info">
                  <view class="log-user-line">
                    <text class="log-operator">👷 {{ log.operator || '未知' }}</text>
                    <text class="log-time">{{ formatFullTime(log.created_at) }}</text>
                  </view>
                  <view class="log-tags-row" v-if="log.work_type || log.worker_count">
                    <text class="log-tag-icon" v-if="log.work_type">🔧 {{ log.work_type }}</text>
                    <text class="log-tag-icon" v-if="log.worker_count">👷 {{ log.worker_count }}人</text>
                  </view>
                </view>
              </view>

              <!-- 内容区域 -->
              <view class="log-content-area">
                <!-- 施工内容 -->
                <view class="log-content-row" v-if="log.content">
                  <view class="log-tag-box">施工内容</view>
                  <view class="log-content-text">{{ log.content }}</view>
                </view>

                <!-- 明日计划 -->
                <view class="log-content-row" v-if="log.tomorrow_plan">
                  <view class="log-tag-box">明日计划</view>
                  <view class="log-content-text">{{ log.tomorrow_plan }}</view>
                </view>

                <!-- 备注 -->
                <view class="log-content-row" v-if="log.note">
                  <view class="log-tag-box">描述</view>
                  <view class="log-content-text">{{ log.note }}</view>
                </view>

                <!-- 图片 -->
                <view class="log-photos" v-if="getLogPhotos(log).length">
                  <view
                    class="log-photo"
                    v-for="(photo, idx) in getLogPhotos(log)"
                    :key="idx"
                    @click="previewLogPhoto(log, idx)"
                  >
                    <image class="log-photo-img" :src="photo" mode="aspectFill" />
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view class="empty-state" v-else>
            <text class="empty-icon">📝</text>
            <text class="empty-text">暂无施工日志</text>
          </view>
        </view>

        <!-- 巡检问题 - 只读 -->
        <view v-if="curTab === 'inspect'" class="tab-panel">
          <view class="panel-toolbar">
            <text class="panel-title">巡检记录</text>
            <text class="tool-btn muted">仅可查看</text>
          </view>

          <view class="loading-state" v-if="inspectLoading">
            <text>加载中...</text>
          </view>

          <!-- 巡检列表：完整样式 -->
          <view class="inspect-list" v-else-if="issues.length">
            <view class="inspect-item" v-for="issue in issues" :key="issue.id">
              <!-- 第一行：日期卡片 + 提交人/时间 + 状态 -->
              <view class="log-row-first">
                <view class="log-date-bar">
                  <text class="log-date-day">{{ formatDay(issue.created_at) }}</text>
                  <text class="log-date-month">{{ formatMonth(issue.created_at) }}</text>
                </view>
                <view class="log-user-info">
                  <view class="log-user-line">
                    <text class="log-operator">🔍 {{ issue.responsible_name || issue.creator_name || '员工' }}</text>
                    <text class="log-time">{{ formatFullTime(issue.created_at) }}</text>
                  </view>
                  <view class="log-tags-row">
                    <text class="log-tag-icon">等级：{{ getLevelText(issue.level) }}</text>
                    <text class="log-tag-icon">状态：{{ getIssueStatusText(issue.status) }}</text>
                  </view>
                </view>
              </view>

              <!-- 问题描述（issue_desc） -->
              <view class="log-content-area" v-if="issue.issue_desc">
                <view class="log-content-row">
                  <view class="log-tag-box">问题</view>
                  <view class="log-content-text">{{ issue.issue_desc }}</view>
                </view>
              </view>

              <!-- 详细描述（description） -->
              <view class="log-content-area" v-if="issue.description && issue.description !== issue.issue_desc">
                <view class="log-content-row">
                  <view class="log-tag-box">描述</view>
                  <view class="log-content-text">{{ issue.description }}</view>
                </view>
              </view>

              <!-- 整改备注（remark） -->
              <view class="log-content-area" v-if="issue.remark">
                <view class="log-content-row">
                  <view class="log-tag-box">描述</view>
                  <view class="log-content-text">{{ issue.remark }}</view>
                </view>
              </view>

              <!-- 图片网格 -->
              <view class="log-photos" v-if="getIssuePhotos(issue).length">
                <view
                  class="log-photo"
                  v-for="(photo, idx) in getIssuePhotos(issue)"
                  :key="idx"
                  @click="previewIssuePhoto(issue, idx)"
                >
                  <image class="log-photo-img" :src="photo" mode="aspectFill" />
                </view>
              </view>
            </view>
          </view>

          <view class="empty-state" v-else>
            <text class="empty-icon">🔍</text>
            <text class="empty-text">暂无巡检记录</text>
          </view>
        </view>

      </view>
    </view>

    <!-- 无项目 -->
    <customer-empty-state
      v-else
      type="no-project"
      title="暂无项目信息"
      description="请联系工作人员绑定项目"
    />

    <!-- 客户专属底部导航 -->
    <customer-tabbar />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import customerTabbar from "@/components/customer-tabbar.vue";
import customerEmptyState from "@/components/customer-empty-state.vue";

const loading = ref(true);
const error = ref('');
const project = ref(null);
const projectId = ref(0);
const curTab = ref('nodes');

// 客户版Tab（badge用computed保证响应式）
const customerTabs = computed(() => [
  { key: 'nodes', label: '节点' },
  { key: 'logs', label: '日志', badge: logs.value.length || null },
  { key: 'inspect', label: '巡检', badge: issues.value.length || null },
]);

// 数据
const logs = ref([]);
const logsLoading = ref(false);
const issues = ref([]);
const inspectLoading = ref(false);

// 计算实际进度百分比（基于节点完成情况）
const actualProgress = computed(() => {
  if (!project.value) return 0;

  // 根据节点计算进度：完成数 / 总数
  const nodes = project.value.nodes;
  if (!nodes || nodes.length === 0) return 0;

  const completedCount = nodes.filter(node =>
    node.status === 'completed' || node.status === '已完成'
  ).length;

  // 计算百分比
  const progress = Math.round((completedCount / nodes.length) * 100);
  return progress;
});

// 计算项目成员列表
const projectMembers = computed(() => {
  if (!project.value) return [];

  const members = [];

  // 设计师
  if (project.value.designer_name) {
    members.push({
      id: project.value.designer_id,
      role: '设计师',
      name: project.value.designer_name,
      phone: project.value.designer_phone || ''
    });
  }

  // 项目经理
  if (project.value.manager_name) {
    members.push({
      id: project.value.manager_id,
      role: '项目经理',
      name: project.value.manager_name,
      phone: project.value.manager_phone || ''
    });
  }

  // 监理
  if (project.value.supervisor_name) {
    members.push({
      id: project.value.supervisor_id,
      role: '监理',
      name: project.value.supervisor_name,
      phone: project.value.supervisor_phone || ''
    });
  }

  return members;
});

// 获取项目详情
const loadProject = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    // 从页面参数获取项目ID
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    const options = current.options || {};
    projectId.value = parseInt(options.id || '0');
    
    // 如果没有项目ID，尝试从 storage 获取
    if (!projectId.value) {
      const savedProject = uni.getStorageSync('currentProject');
      if (savedProject && savedProject.id) {
        projectId.value = savedProject.id;
        project.value = savedProject;
      }
    } else {
      // 总是尝试从API获取最新数据（包括完整的nodes）
      const userInfo = uni.getStorageSync('userInfo');
      // 家庭成员用主账户ID查项目，主账户用自己的ID
      const customerId = uni.getStorageSync('masterCustomerId') || userInfo?.id;
      
      if (customerId) {
        const res = await uni.request({
          url: `/api/projects?customer_id=${customerId}`,
          header: {
            'x-user-role': 'admin',
            'x-user-id': '1'
          }
        });
        
        if (Array.isArray(res.data)) {
          // 优先使用URL参数中的项目ID匹配
          let found = res.data.find(p => p.id == projectId.value);
          
          // 如果没找到，尝试使用storage中的项目
          if (!found) {
            const savedProject = uni.getStorageSync('currentProject');
            if (savedProject && savedProject.id == projectId.value) {
              found = savedProject;
            }
          }
          
          // 如果仍然没找到，使用API返回的第一个项目
          if (!found && res.data.length > 0) {
            found = res.data[0];
            projectId.value = found.id;
          }
          
          if (found) {
            project.value = found;
            // 更新storage中的项目数据
            uni.setStorageSync('currentProject', found);
          }
        }
      }
    }
    
    if (!project.value || !project.value.id) {
      error.value = 'forbidden';
    } else {
      // 加载日志和巡检
      loadLogs();
      loadInspections();
    }
  } catch (e) {
    console.error('加载项目失败:', e);
    error.value = 'forbidden';
  } finally {
    loading.value = false;
  }
};

// 加载日志（只显示有内容的）
const loadLogs = async () => {
  if (!projectId.value) return;
  logsLoading.value = true;
  
  try {
    const res = await uni.request({
      url: `/api/project-logs/${projectId.value}`,
    });
    if (Array.isArray(res.data)) {
      // 过滤掉无内容的日志
      logs.value = res.data.filter(log => log.content);
    }
  } catch (e) {
    console.error('加载日志失败:', e);
  } finally {
    logsLoading.value = false;
  }
};

// 加载巡检
const loadInspections = async () => {
  if (!projectId.value) return;
  inspectLoading.value = true;
  
  try {
    // 员工提交到 rectification_issues 表，所以客户也要从这表读
    console.log('[巡检] 请求 project_id:', projectId.value, '类型:', typeof projectId.value);
    const res = await uni.request({
      url: `/api/rectification-issues?project_id=${projectId.value}`,
    });
    console.log('[巡检] 返回数据:', JSON.stringify(res.data).slice(0, 200));
    if (Array.isArray(res.data)) {
      issues.value = res.data;
    } else if (res.data && Array.isArray(res.data.list)) {
      issues.value = res.data.list;
    } else if (res.data && Array.isArray(res.data.data)) {
      issues.value = res.data.data;
    }
  } catch (e) {
    console.error('加载巡检失败:', e);
  } finally {
    inspectLoading.value = false;
  }
};

// 施工日志日期格式化 - 日
function formatDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return String(d.getDate()).padStart(2, '0');
}

// 施工日志日期格式化 - 月
function formatMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return months[d.getMonth()];
}

// 施工日志完整时间
function formatFullTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 获取日志图片（处理双重编码的JSON字符串）
function getLogPhotos(log) {
  if (!log.images) return [];
  try {
    let photosStr = log.images;
    let parsed = JSON.parse(photosStr);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim());
    }
    return [];
  } catch (e) {
    return [];
  }
}

// 预览日志图片
function previewLogPhoto(log, idx) {
  const photos = getLogPhotos(log);
  uni.previewImage({ urls: photos, current: photos[idx] });
}

// 获取巡检图片（处理双重编码的JSON字符串）
function getIssuePhotos(issue) {
  if (!issue.images) return [];
  try {
    let photosStr = issue.images;
    let parsed = JSON.parse(photosStr);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.trim());
    }
    return [];
  } catch (e) {
    return [];
  }
}

// 预览巡检图片
function previewIssuePhoto(issue, idx) {
  const photos = getIssuePhotos(issue);
  uni.previewImage({ urls: photos, current: photos[idx] });
}

// 获取状态样式
const getStatusClass = (status) => {
  if (!status) return 'status-default';
  if (status.includes('竣工') || status.includes('完成') || status.includes('验收')) return 'status-done';
  if (status.includes('进行') || status.includes('施工')) return 'status-progress';
  if (status.includes('暂停')) return 'status-paused';
  return 'status-default';
};

// 获取节点状态样式
const getNodeStatusClass = (status) => {
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'in-progress';
  if (status === 'skipped') return 'skipped';
  return 'pending';
};

// 获取节点状态文字
const getNodeStatusText = (status) => {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  if (status === 'skipped') return '已跳过';
  return '待处理';
};

// 获取巡检状态文字
const getIssueStatusText = (status) => {
  if (!status) return '待处理';
  const s = String(status).toLowerCase();
  if (s.includes('待整改') || s === 'pending' || s === '待处理') return '待整改';
  if (s.includes('已完成') || s === 'completed') return '已完成';
  if (s.includes('已验收') || s === 'verified') return '已验收';
  if (s.includes('整改中') || s === 'fixing') return '整改中';
  return status || '待处理';
};

// 获取等级文字
function getLevelText(level) {
  const map = { serious: '严重', stop: '停工', normal: '一般', low: '轻微', medium: '中等', high: '高' };
  return map[level] || level || '一般';
}

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 页面加载
onMounted(() => {
  loadProject();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 70px;
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

/* 加载状态 */
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  color: #9CA3AF;
}

/* 内容 */
.page-content {
  padding: 16px;
}

/* 项目头部卡片 */
.project-header {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.project-title-row {
  margin-bottom: 12px;
}

.project-name-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-name {
  font-size: 18px;
  font-weight: 700;
  color: #1A1F36;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.status-default { background: #F3F4F6; color: #6B7280; }
.status-done { background: #D1FAE5; color: #065F46; }
.status-progress { background: #DBEAFE; color: #1E40AF; }
.status-paused { background: #FEF3C7; color: #92400E; }

.project-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.progress-bar-full {
  flex: 1;
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill-full {
  height: 100%;
  background: linear-gradient(90deg, #10B981, #34D399);
  border-radius: 4px;
}

.progress-text-full {
  font-size: 14px;
  font-weight: 700;
  color: #10B981;
  min-width: 40px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 12px;
  color: #9CA3AF;
}

.info-value {
  font-size: 14px;
  color: #1A1F36;
  font-weight: 500;
}

.info-value.accent {
  color: #10B981;
}

/* 项目成员 */
.project-members {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #F0F0F0;
}

.Members-title {
  font-size: 12px;
  color: #9CA3AF;
  display: block;
  margin-bottom: 8px;
}

.members-table {
  display: table;
  width: 100%;
  table-layout: fixed;
}

.member-row {
  display: table-row;
  background: #F5F7FA;
  border-radius: 6px;
  margin-bottom: 6px;
}

.member-td {
  display: table-cell;
  vertical-align: middle;
  padding: 8px 4px;
}

.member-td.role {
  width: 80px;
  text-align: left;
}

.member-td.name {
  width: 80px;
  padding-left: 8px;
  text-align: left;
}

.member-td.phone {
  text-align: left;
  padding-right: 10px;
  white-space: nowrap;
}

.member-role {
  font-size: 11px;
  color: #1E3A5F;
  background: #DBEAFE;
  padding: 2px 8px;
  border-radius: 4px;
}

.member-name {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

.member-phone {
  font-size: 12px;
  color: #6B7280;
  font-variant-numeric: tabular-nums;
}

/* Tab栏红色徽标 */
.tab-dot {
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: 600;
  display: inline-block;
  margin-left: 4px;
  vertical-align: middle;
}

.tab-bar {
  display: flex;
  background: #fff;
  border-radius: 14px;
  padding: 4px;
  margin-bottom: 12px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px;
  font-size: 14px;
  color: #6B7280;
  border-radius: 10px;
  transition: all 0.2s;
}

.tab-item.active {
  background: #1E3A5F;
  color: #fff;
}

.tab-content {
  min-height: 300px;
}

/* Tab内容区 */
.tab-panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
}

.tool-btn {
  font-size: 13px;
  color: #1E3A5F;
}

.tool-btn.muted {
  color: #9CA3AF;
  font-size: 12px;
}

/* 节点时间线 */
.node-timeline {
  position: relative;
}

.timeline-item {
  display: flex;
  margin-bottom: 8px;
}

.timeline-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  margin-right: 12px;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.timeline-dot.completed { background: #10B981; }
.timeline-dot.in_progress { background: #3B82F6; }
.timeline-dot.skipped { background: #F59E0B; }
.timeline-dot.pending { background: #E5E7EB; border: 2px solid #D1D5DB; }

.timeline-connector {
  width: 2px;
  flex: 1;
  background: #E5E7EB;
  margin-top: 4px;
}

.timeline-content {
  flex: 1;
  padding-bottom: 12px;
}

.node-card {
  background: #F9FAFB;
  border-radius: 10px;
  padding: 12px;
}

.node-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.node-seq {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #1E3A5F;
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.node-status-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.node-status-pill.completed { background: #D1FAE5; color: #065F46; }
.node-status-pill.in_progress { background: #DBEAFE; color: #1E40AF; }
.node-status-pill.skipped { background: #FEF3C7; color: #92400E; }
.node-status-pill.pending { background: #F3F4F6; color: #6B7280; }

.node-card-body {
  padding-left: 28px;
}

.node-dates {
  display: flex;
  align-items: center;
  gap: 4px;
}

.node-date-icon {
  font-size: 12px;
}

.node-date-text {
  font-size: 12px;
  color: #6B7280;
}

.node-date-text.muted {
  color: #D1D5DB;
}

.node-note {
  margin-top: 4px;
  padding: 6px 8px;
  background: #fff;
  border-radius: 6px;
}

.note-text {
  font-size: 12px;
  color: #374151;
}

/* 日志列表 */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.log-row-first {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px;
}

.log-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-user-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-tags-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.log-tag-icon {
  font-size: 13px;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 4px 12px;
  border-radius: 12px;
}

.log-date-bar {
  width: 56px;
  height: 56px;
  background: #1E3A5F;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.log-date-day {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.log-date-month {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
}

.log-operator {
  font-size: 14px;
  font-weight: 600;
  color: #1E3A5F;
}

.log-time {
  font-size: 12px;
  color: #9CA3AF;
}

.log-content-area {
  /* 标签从最左边（日期卡片列）开始 */
}

.log-content-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 0;
}

.log-content-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
  text-align: left;
  padding-left: 12px;
}

.log-tag-box {
  background: rgba(217, 246, 0, 0.11);
  color: #1E3A5F;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  min-width: 52px;
  text-align: center;
  flex-shrink: 0;
}

/* 图片网格：每排5个正方形 */
.log-photos {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.log-photo {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
}

.log-photo-img {
  width: 100%;
  height: 100%;
  display: block;
}

/* 巡检列表 */
.inspect-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inspect-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.issue-item {
  padding: 12px;
  background: #F9FAFB;
  border-radius: 10px;
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.issue-level {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
}

.level-serious { background: #FEE2E2; color: #991B1B; }
.level-stop { background: #FEF3C7; color: #92400E; }
.level-normal { background: #F3F4F6; color: #6B7280; }

.issue-title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #1A1F36;
}

.issue-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 4px;
}

.issue-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-pending, .status-待整改 { background: #FEF3C7; color: #92400E; }
.status-completed, .status-已完成 { background: #D1FAE5; color: #065F46; }
.status-verified, .status-已验收 { background: #DBEAFE; color: #1E40AF; }

.issue-desc {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.4;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: #9CA3AF;
}
</style>
