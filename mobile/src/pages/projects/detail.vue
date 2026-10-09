<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar">
      <text class="nav-back" @click="goBack">‹</text>
      <text class="nav-title">项目详情</text>
      <view class="nav-placeholder"></view>
    </view>

    <!-- 顶部项目信息卡片 -->
    <view class="project-header">
      <view class="project-title-row">
        <view class="project-name-wrap">
          <text class="project-name">{{ project.name }}</text>
          <view class="status-badge" :class="getStatusClass(project.status)">
            {{ project.status || '未知' }}
          </view>
        </view>
      </view>

      <view class="project-progress">
        <view class="progress-bar-full">
          <view class="progress-fill-full" :style="{ width: (project.progress || 0) + '%' }"></view>
        </view>
        <text class="progress-text-full">{{ project.progress || 0 }}%</text>
      </view>

      <!-- 基本信息 -->
      <view class="info-grid">
        <view class="info-item">
          <text class="info-label">客户</text>
          <text class="info-value">{{ project.customer_name || '未关联' }}</text>
        </view>
        <view class="info-item">
          <text class="info-label">合同总造价</text>
          <text class="info-value accent">¥{{ contractSummary.total.toLocaleString() }}</text>
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
    </view>

    <!-- 标签页导航 -->
    <view class="tab-bar">
      <view
        class="tab-item"
        v-for="tab in tabs"
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

      <!-- 进度节点 -->
      <view v-if="curTab === 'nodes'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">施工节点</text>
          <view class="toolbar-right">
            <text class="tool-btn" @click="goNodeManage">⚙️ 管理节点</text>
          </view>
        </view>

        <view class="node-timeline" v-if="project.nodes && project.nodes.length">
          <view
            class="timeline-item"
            v-for="(node, idx) in project.nodes"
            :key="node.id"
            @click="goNode(node)"
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
                </view>
                <!-- 操作按钮 -->
                <view class="node-card-actions" v-if="node.status !== 'completed' && node.status !== 'skipped'">
                  <view class="action-btn-sm" v-if="node.status === 'pending'" @click.stop="reportStart(node)">
                    ▶ 开工
                  </view>
                  <view class="action-btn-sm accent" v-if="node.status === 'in_progress'" @click.stop="reportComplete(node)">
                    ✅ 完工上报
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="empty-state" v-else>
          <text class="empty-icon">📋</text>
          <text class="empty-text">暂无节点，请先添加节点</text>
          <view class="btn btn-primary" style="margin-top: 16px;" @click="goNodeManage">添加节点</view>
        </view>
      </view>

      <!-- 施工日志 -->
      <view v-if="curTab === 'logs'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">施工日志</text>
          <text class="tool-btn" @click="goLogAdd">+ 新建日志</text>
        </view>

        <view class="loading-state" v-if="logsLoading">
          <text>加载中...</text>
        </view>
        <view class="log-list" v-else-if="logs.length">
          <view class="log-item" v-for="log in logs" :key="log.id">
            <!-- 第一行：日期卡片 + 提交人/时间 + 工种人数（转行） -->
            <view class="log-row log-row-first">
              <view class="log-date-bar">
                <text class="log-date-day">{{ formatDay(log.created_at) }}</text>
                <text class="log-date-month">{{ formatMonth(log.created_at) }}</text>
              </view>
              <view class="log-user-info">
                <!-- 第一行：提交人 + 时间 -->
                <view class="log-user-line">
                  <text class="log-operator">👷 {{ log.operator || '未知' }}</text>
                  <text class="log-time">{{ formatFullTime(log.created_at) }}</text>
                </view>
                <!-- 第二行：工种和人数 -->
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
                <view class="log-content-text" style="text-align: left;">{{ log.content }}</view>
              </view>

              <!-- 明日计划 -->
              <view class="log-content-row" v-if="log.tomorrow_plan">
                <view class="log-tag-box">明日计划</view>
                <view class="log-content-text" style="text-align: left;">{{ log.tomorrow_plan }}</view>
              </view>

              <!-- 备注 -->
              <view class="log-content-row" v-if="log.note">
                <view class="log-tag-box">描述</view>
                <view class="log-content-text" style="text-align: left;">{{ log.note }}</view>
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

      <!-- 巡检记录 -->
      <view v-if="curTab === 'inspect'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">巡检记录</text>
          <text class="tool-btn" @click="goInspectAdd">+ 新建巡检</text>
        </view>

        <view class="loading-state" v-if="issuesLoading">
          <text>加载中...</text>
        </view>
        <view class="log-list" v-else-if="issues.length">
          <view class="log-item" v-for="issue in issues" :key="issue.id" @click="goInspectDetail(issue)">
            <!-- 第一行：日期卡片 + 提交人/时间 + 严重程度（转行） -->
            <view class="log-row log-row-first">
              <view class="log-date-bar">
                <text class="log-date-day">{{ formatDay(issue.created_at) }}</text>
                <text class="log-date-month">{{ formatMonth(issue.created_at) }}</text>
              </view>
              <view class="log-user-info">
                <!-- 第一行：提交人 + 时间 -->
                <view class="log-user-line">
                  <text class="log-operator">👷 {{ issue.creator_name || '未知' }}</text>
                  <text class="log-time">{{ formatFullTime(issue.created_at) }}</text>
                </view>
                <!-- 第二行：严重程度和状态 -->
                <view class="log-tags-row">
                  <text class="log-tag-icon" :class="`level-tag-${issue.level}`" v-if="issue.level">
                    {{ issue.level === 'serious' ? '⚠️ 严重' : issue.level === 'stop' ? '🛑 停工' : 'ℹ️ 一般' }}
                  </text>
                  <text class="log-tag-icon status-tag" :class="`status-${issue.rectify_status || issue.status}`">
                    {{ getIssueStatusText(issue) }}
                  </text>
                </view>
              </view>
            </view>

            <!-- 内容区域 -->
            <view class="log-content-area">
              <!-- 问题描述 -->
              <view class="log-content-row" v-if="issue.issue_desc">
                <view class="log-tag-box">问题</view>
                <view class="log-content-text">{{ issue.issue_desc }}</view>
              </view>

              <!-- 整改描述 -->
              <view class="log-content-row" v-if="issue.result">
                <view class="log-tag-box">整改</view>
                <view class="log-content-text">{{ issue.result }}</view>
              </view>

              <!-- 备注 -->
              <view class="log-content-row" v-if="issue.remark">
                <view class="log-tag-box">描述</view>
                <view class="log-content-text">{{ issue.remark }}</view>
              </view>

              <!-- 图片 -->
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
        </view>
        <view class="empty-state" v-else>
          <text class="empty-icon">🔍</text>
          <text class="empty-text">暂无巡检记录</text>
        </view>
      </view>

      <!-- 派工 -->
      <view v-if="curTab === 'dispatch'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">派工单</text>
          <text class="tool-btn" @click="goDispatchAdd">+ 新建派工</text>
        </view>
        <view v-if="dispatches.length === 0" class="empty-state">
          <text class="empty-icon">👷</text>
          <text class="empty-text">暂无派工单</text>
        </view>
        <view v-else>
          <view v-for="d in dispatches" :key="d.id" class="dispatch-card">
            <view class="dispatch-header">
              <text class="dispatch-content">{{ d.content }}</text>
              <view class="dispatch-status" :style="{ background: dispatchStatusBg(d.status), color: dispatchStatusColor(d.status) }">
                {{ dispatchStatusLabel(d.status) }}
              </view>
            </view>
            <view class="dispatch-info">
              <view class="dispatch-row"><text class="dispatch-label">施工地点</text><text class="dispatch-val">{{ d.location || '-' }}</text></view>
              <view class="dispatch-row"><text class="dispatch-label">工人/班组</text><text class="dispatch-val">{{ d.worker || '-' }}</text></view>
              <view class="dispatch-row"><text class="dispatch-label">约定工费</text><text class="dispatch-val amount">¥{{ d.fee || 0 }}</text></view>
              <view class="dispatch-row"><text class="dispatch-label">开始时间</text><text class="dispatch-val">{{ d.start_date || '-' }}</text></view>
              <view class="dispatch-row"><text class="dispatch-label">申请人</text><text class="dispatch-val">{{ d.applicant_name || '-' }}</text></view>
            </view>
          </view>
        </view>
      </view>

      <!-- 材料 -->
      <view v-if="curTab === 'material'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">材料台账</text>
          <text class="tool-btn" @click="goMaterial">查看全部</text>
        </view>
        <view class="empty-state" v-if="materials.length === 0">
          <text class="empty-icon">🧱</text>
          <text class="empty-text">暂无材料记录</text>
        </view>
      </view>

      <!-- 采购记录 -->
      <view v-if="curTab === 'purchase'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">采购记录</text>
          <text class="tool-btn" @click="goPurchaseAdd">+ 新建</text>
        </view>
        <view v-if="purchaseList.length === 0" class="empty-state">
          <text class="empty-icon">📦</text>
          <text class="empty-text">暂无采购记录</text>
        </view>
        <view v-else>
          <view v-for="item in purchaseList" :key="item.id" class="purchase-card" @click="goPurchaseDetail(item)">
            <view class="purchase-card-header">
              <text class="purchase-name">{{ item.items?.[0]?.material_name || item.supplier_name || '材料采购' }}</text>
              <view class="purchase-status" :style="{ color: purchaseStatusColor(item.status) }">
                {{ purchaseStatusLabel(item.status) }}
              </view>
            </view>
            <view class="purchase-info">
              <text>供应商：{{ item.supplier_name || '-' }}</text>
              <text>数量：{{ item.items?.[0]?.quantity || '-' }}{{ item.items?.[0]?.unit || '' }}</text>
              <text>金额：¥{{ item.total_amount || 0 }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 合同变更 -->
      <view v-if="curTab === 'contract'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">合同与变更</text>
          <view class="toolbar-actions">
            <text class="tool-btn" @click="goContractUpload">上传合同</text>
            <text class="tool-btn primary" @click="goContractChange">+ 增减项</text>
          </view>
        </view>

        <!-- 无合同时 -->
        <view v-if="!contractList.length" class="empty-state">
          <text class="empty-icon">📄</text>
          <text class="empty-text">暂未上传合同</text>
          <text class="empty-btn" @click="goContractUpload">上传合同</text>
        </view>

        <!-- 合同列表 -->
        <view v-else>
          <view v-for="c in contractList" :key="c.id" class="contract-card">
            <view class="contract-card-header">
              <text class="contract-card-title">合同</text>
              <text class="contract-status" :class="'s-' + c.review_status">{{ c.review_status === 'approved' ? '✅ 已审核' : c.review_status === 'rejected' ? '❌ 已驳回' : '⏳ 待审核' }}</text>
            </view>
            <view class="contract-card-body">
              <view class="cc-row">
                <text class="cc-label">合同金额</text>
                <text class="cc-value">¥{{ Number(c.contract_amount || 0).toLocaleString() }}</text>
              </view>
              <view class="cc-row" v-if="c.attachment">
                <text class="cc-label">附件</text>
                <text class="cc-value link" @click="previewFile(c.attachment)">查看文件 ({{ parseAttachments(c.attachment).length }}个)</text>
              </view>
            </view>
            <view class="contract-card-actions">
              <text v-if="canApproveContract && c.review_status === 'pending'" class="cc-btn" @click="openApproveDialog(c)">审核</text>
              <text v-else class="cc-btn" @click="goContractChangeDetail(c)">查看详情</text>
              <text class="cc-btn" @click="goCollection(c)">录入催收</text>
            </view>
          </view>

          <!-- 增减项列表 -->
          <view class="section-divider">
            <text class="section-divider-text">增减项记录</text>
            <text class="tool-btn small" @click="goContractChange">+ 新增减项</text>
          </view>

          <view v-if="!changeList.length" class="empty-state small">
            <text class="empty-text">暂无增减项</text>
          </view>
          <view v-else>
            <view v-for="ch in changeList" :key="ch.id" class="change-card">
              <view class="change-card-header">
                <text class="change-title">{{ ch.title }}</text>
                <text class="contract-status" :class="'s-' + ch.status">
                  {{ ch.status === 'approved' ? '✅ 已通过' : ch.status === 'rejected' ? '❌ 已驳回' : '⏳ 待审核' }}
                </text>
              </view>
              <view class="cc-row">
                <text class="cc-label">类型</text>
                <text class="cc-value">{{ ch.change_type === 'increase' ? '➕ 增加' : '➖ 减少' }}</text>
              </view>
              <view class="cc-row">
                <text class="cc-label">金额</text>
                <text class="cc-value" :class="ch.change_type === 'increase' ? 'accent' : 'decrease'">
                  {{ ch.change_type === 'increase' ? '+' : '-' }}¥{{ Number(ch.amount || 0).toLocaleString() }}
                </text>
              </view>
              <view class="cc-row">
                <text class="cc-label">申请人</text>
                <text class="cc-value">{{ ch.submitted_by_name || '—' }}</text>
              </view>
              <view class="contract-card-actions">
                <text v-if="ch.status === 'approved'" class="cc-btn approved-static">✅ 已通过</text>
                <text v-else-if="canApproveChange && ch.status === 'pending'" class="cc-btn" @click="openApproveChangeDialog(ch)">审核</text>
              </view>
            </view>
          </view>

          <!-- 合同总造价 -->
          <view class="contract-summary">
            <view class="contract-summary-row">
              <text class="cs-label">合同金额</text>
              <text class="cs-value">¥{{ contractSummary.contract.toLocaleString() }}</text>
            </view>
            <view class="contract-summary-row">
              <text class="cs-label">增减项合计</text>
              <text class="cs-value" :class="contractSummary.change >= 0 ? 'accent' : 'decrease'">
                {{ contractSummary.change >= 0 ? '+' : '' }}¥{{ contractSummary.change.toLocaleString() }}
              </text>
            </view>
            <view class="contract-summary-row total">
              <text class="cs-label">合同总造价</text>
              <text class="cs-value">¥{{ contractSummary.total.toLocaleString() }}</text>
            </view>
          </view>


        </view>
      </view>

      <!-- 财务收支 -->
      <view v-if="curTab === 'finance'" class="tab-panel">
        <!-- 子Tab -->
        <view class="finance-sub-tabs">
          <view class="sub-tab" :class="{ active: financeSubTab === 'records' }" @click="financeSubTab = 'records'">
            <text>收支记录</text>
          </view>
          <view class="sub-tab" :class="{ active: financeSubTab === 'receivable' }" @click="financeSubTab = 'receivable'">
            <text>应收统计</text>
          </view>
          <view class="sub-tab" :class="{ active: financeSubTab === 'collected' }" @click="financeSubTab = 'collected'">
            <text>实收统计</text>
          </view>
        </view>

        <!-- 收支记录列表 -->
        <view v-if="financeSubTab === 'records'">
          <view class="finance-summary">
            <view class="finance-card income">
              <text class="finance-card-label">已收款</text>
              <text class="finance-card-num">¥{{ financeIncome.toLocaleString() }}</text>
            </view>
            <view class="finance-card expense">
              <text class="finance-card-label">已支出</text>
              <text class="finance-card-num">¥{{ financeExpense.toLocaleString() }}</text>
            </view>
          </view>
          <view v-if="financeRecords.length === 0 && collectionRecords.filter(r=>r.status!=='confirmed').length === 0" class="empty-state">
            <text class="empty-icon">💰</text>
            <text class="empty-text">暂无收支记录</text>
          </view>
          <view v-else class="finance-list">
            <!-- 主材采购/派工支出 -->
            <view v-for="item in financeRecords" :key="item.type + '-' + item.id" class="finance-record-card">
              <view class="fr-header">
                <text class="fr-type">{{ item.type === 'purchase' ? '🏭 主材采购' : '👷 派工' }}</text>
                <text class="fr-amount">-¥{{ Number(item.amount).toLocaleString() }}</text>
              </view>
              <view class="fr-info">
                <text class="fr-desc">{{ item.desc }}</text>
                <text class="fr-date">{{ item.date }}</text>
              </view>
            </view>
            <!-- 待确认的催收记录（财务可见） -->
            <view v-for="item in collectionRecords.filter(r=>r.status!=='confirmed')" :key="'cr-'+item.id" class="finance-record-card pending" @click="openCollectionRecord(item)">
              <view class="fr-header">
                <text class="fr-type">📋 催收录入</text>
                <text class="fr-amount" style="color:#D97706;">待确认 ¥{{ Number(item.amount).toLocaleString() }}</text>
              </view>
              <view class="fr-info">
                <text class="fr-desc">{{ item.remark || '待财务确认' }}</text>
                <text class="fr-date">{{ item.record_date || item.submitted_at }}</text>
              </view>
            </view>
          </view>
        </view>
        <!-- 应收统计 -->
        <view v-if="financeSubTab === 'receivable'" class="sub-tab-content">
          <view class="finance-summary">
            <view class="finance-card income">
              <text class="finance-card-label">合同金额</text>
              <text class="finance-card-num">¥{{ financeSummary.contract_amount.toLocaleString() }}</text>
            </view>
            <view class="finance-card expense">
              <text class="finance-card-label">增减项</text>
              <text class="finance-card-num">¥{{ (financeSummary.change_total >= 0 ? '+' : '') + financeSummary.change_total.toLocaleString() }}</text>
            </view>
          </view>
          <view class="finance-summary" style="margin-top:12px;">
            <view class="finance-card" style="background:#DBEAFE;">
              <text class="finance-card-label">实际应收</text>
              <text class="finance-card-num">¥{{ financeSummary.actual_receivable.toLocaleString() }}</text>
            </view>
          </view>
          <view class="empty-state" v-if="financeSummary.contract_amount === 0">
            <text class="empty-icon">📋</text>
            <text class="empty-text">暂无合同信息</text>
          </view>
        </view>
        <!-- 实收统计 -->
        <view v-if="financeSubTab === 'collected'" class="sub-tab-content">
          <view class="finance-summary">
            <view class="finance-card income">
              <text class="finance-card-label">已收款</text>
              <text class="finance-card-num">¥{{ financeIncome.toLocaleString() }}</text>
            </view>
            <view class="finance-card expense">
              <text class="finance-card-label">已支出</text>
              <text class="finance-card-num">¥{{ financeExpense.toLocaleString() }}</text>
            </view>
          </view>
          <view class="finance-list">
            <view v-for="item in collectionRecords.filter(r => r.status === 'confirmed')" :key="item.id" class="finance-record-card">
              <view class="fr-header">
                <text class="fr-type">💰 收款</text>
                <text class="fr-amount" style="color:#059669;">+¥{{ Number(item.amount).toLocaleString() }}</text>
              </view>
              <view class="fr-info">
                <text class="fr-desc">{{ item.remark || '催款收款' }}</text>
                <text class="fr-date">{{ item.record_date || item.created_at }}</text>
              </view>
            </view>
          </view>
          <view class="empty-state" v-if="collectionRecords.filter(r => r.status === 'confirmed').length === 0">
            <text class="empty-icon">💰</text>
            <text class="empty-text">暂无收款记录</text>
          </view>
        </view>
      </view>

      <!-- 催收记录确认弹窗 -->
      <view v-if="collectionModal.visible" class="modal-mask" @click.self="collectionModal.visible = false">
        <view class="modal-box">
          <view class="modal-title">催收确认</view>
          <view class="modal-info-grid">
            <view class="modal-info-row">
              <text class="modal-info-label">收款金额</text>
              <text class="modal-info-value accent">¥{{ Number(collectionModal.data.amount || 0).toLocaleString() }}</text>
            </view>
            <view class="modal-info-row">
              <text class="modal-info-label">收款日期</text>
              <text class="modal-info-value">{{ collectionModal.data.collect_date || collectionModal.data.record_date || '—' }}</text>
            </view>
            <view class="modal-info-row">
              <text class="modal-info-label">提交人</text>
              <text class="modal-info-value">{{ collectionModal.data.submitted_by_name || collectionModal.data.submitted_by || '—' }}</text>
            </view>
            <view class="modal-info-row" v-if="collectionModal.data.remark">
              <text class="modal-info-label">备注</text>
              <text class="modal-info-value">{{ collectionModal.data.remark }}</text>
            </view>
            <view class="modal-info-row" v-if="collectionModal.data.images">
              <text class="modal-info-label">凭证图片</text>
            </view>
          </view>
          <view v-if="collectionModal.data.images" class="modal-images">
            <image v-for="(img, idx) in JSON.parse(collectionModal.data.images)" :key="idx" :src="img" class="modal-img" mode="aspectFill" @click="previewImage(JSON.parse(collectionModal.data.images), idx)" />
          </view>
          <view class="modal-actions">
            <button class="modal-btn cancel" @click="collectionModal.visible = false">取消</button>
            <button class="modal-btn confirm" @click="confirmCollection">确认收款</button>
          </view>
        </view>
      </view>

      <!-- 项目资料 -->
      <view v-if="curTab === 'gallery'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">项目图库</text>
        </view>
        <view class="gallery-cats">
          <view class="gallery-cat" v-for="cat in galleryCats" :key="cat.name" @click="goGallery(cat.key)">
            <text class="gallery-cat-icon">{{ cat.icon }}</text>
            <text class="gallery-cat-name">{{ cat.name }}</text>
            <text class="gallery-cat-count">{{ galleryStats[cat.key] || 0 }}张</text>
          </view>
        </view>
      </view>

    </view>

    <!-- 底部快捷操作 -->
    <view class="bottom-actions">
      <view class="action-quick" @click="reportStart({})">
        <text>▶ 开工</text>
      </view>
      <view class="action-quick" @click="goLogAdd">
        <text>📝 日志</text>
      </view>
      <view class="action-quick" @click="goInspectAdd">
        <text>🔍 巡检</text>
      </view>
      <view class="action-quick" @click="goMaterial">
        <text>🧱 主材</text>
      </view>
      <view class="action-primary" @click="goDispatchAdd">
        <text>+ 派工</text>
      </view>
    </view>
  </view>
</template>

<script setup >
import { ref, computed, onMounted, watch } from "vue";
import { useUserStore } from "@/stores/user";

const projectId = ref(0);
const project = ref({});
const userStore = useUserStore();
const curTab = ref('nodes');
const financeSubTab = ref('records');

const tabs = computed(() => [
  { key: 'nodes', label: '进度节点' },
  { key: 'logs', label: '施工日志', badge: logs.value.length || null },
  { key: 'inspect', label: '巡检', badge: issues.value.length || null },
  { key: 'dispatch', label: '派工', badge: dispatches.value.length || null },
  { key: 'material', label: '材料' },
  { key: 'purchase', label: '采购' },
  { key: 'contract', label: '合同' },
  { key: 'finance', label: '财务', badge: collectionRecords.value.filter(r => r.status !== 'confirmed').length || null },
  { key: 'gallery', label: '图库' },
]);

// 日志列表（从API加载）
const logs = ref([]);
const logsLoading = ref(false);

// 巡检问题列表（从API加载）
const issues = ref([]);
const issuesLoading = ref(false);

const dispatches = ref([]);
const materials = ref([]);
const purchaseList = ref([]);
const contractList = ref([]);
const changeList = ref([]);

const financeRecords = computed(() => {
  const records = [];
  // 主材采购
  purchaseList.value.forEach(p => {
    if (p.actual_amount > 0) {
      records.push({
        type: 'purchase',
        id: p.id,
        amount: p.actual_amount,
        desc: p.remark || '主材采购',
        date: p.updated_at || p.created_at,
      });
    }
  });
  // 派工
  dispatches.value.forEach(d => {
    if (d.fee > 0) {
      records.push({
        type: 'dispatch',
        id: d.id,
        amount: d.fee,
        desc: d.content || '派工',
        date: d.updated_at || d.created_at,
      });
    }
  });
  return records.sort((a, b) => new Date(b.date) - new Date(a.date));
});

const financeIncome = computed(() =>
  collectionRecords.value
    .filter(r => r.status === 'confirmed')
    .reduce((s, r) => s + Number(r.amount || 0), 0)
);

const financeExpense = computed(() =>
  financeRecords.value.reduce((s, r) => s + Number(r.amount || 0), 0)
);

const financeSummary = ref({ contract_amount: 0, change_total: 0, actual_receivable: 0 });
const collectionRecords = ref([]);
const collectionModal = ref({ visible: false, data: {} });

const galleryCats = ref([
  { key: '开工', name: '开工', icon: '🎉' },
  { key: '水电', name: '水电', icon: '⚡' },
  { key: '防水', name: '防水', icon: '💧' },
  { key: '泥瓦', name: '泥瓦', icon: '🧱' },
  { key: '木工', name: '木工', icon: '🪚' },
  { key: '油漆', name: '油漆', icon: '🎨' },
  { key: '安装', name: '安装', icon: '🔧' },
  { key: '验收', name: '验收', icon: '✅' },
]);

const galleryStats = ref({});
const loadGalleryStats = async () => {
  if (!projectId.value) return;
  try {
    const res = await uni.request({ url: `/api/project-gallery?project_id=${projectId.value}` });
    if (res.data?.list) {
      const stats = {};
      for (const item of res.data.list) {
        stats[item.category] = (stats[item.category] || 0) + item.count;
      }
      galleryStats.value = stats;
    }
  } catch (e) { console.error('loadGalleryStats', e); }
};

const getStatusClass = (status) => {
  if (!status) return 's-default';
  if (status.includes('竣工') || status.includes('完结') || status.includes('完成')) return 's-done';
  if (status.includes('进行')) return 's-progress';
  if (status.includes('未开工')) return 's-pending';
  if (status.includes('延期')) return 's-overdue';
  return 's-default';
};

const getNodeStatusClass = (status) => {
  if (status === 'completed') return 'n-done';
  if (status === 'in_progress') return 'n-progress';
  if (status === 'skipped') return 'n-skipped';
  return 'n-pending';
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

const goNode = (node) => {
  uni.navigateTo({ url: `/pages/projects/node?id=${node.id}&projectId=${projectId.value}` });
};

const goNodeManage = () => {
  uni.navigateTo({ url: `/pages/projects/nodeManage?id=${projectId.value}` });
};

// 格式化日志日期
const formatLogDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 施工日志日期格式化 - 日
const formatDay = (dateStr) => {
  if (!dateStr) return '';
  // iOS 不支持 "2024-01-01 00:00:00" 格式，改用 "/" 分隔
  const d = new Date(dateStr.replace(/-/g, '/'));
  return String(d.getDate()).padStart(2, '0');
};

// 施工日志日期格式化 - 月
const formatMonth = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return months[d.getMonth()];
};

// 施工日志完整时间
const formatFullTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(/-/g, '/'));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 获取日志图片（处理双重编码的JSON字符串）
const getLogPhotos = (log) => {
  if (!log.images) {
    console.log('getLogPhotos: log.images为空', log.id);
    return [];
  }
  try {
    // 图片数据可能是双重编码的JSON字符串："\[\"data:image/...\"\]"
    let photosStr = log.images;
    console.log('getLogPhotos原始数据:', photosStr.substring(0, 100), '...');
    
    // 第一次解析，得到字符串 "[\"data:image/...\"]"
    let parsed = JSON.parse(photosStr);
    console.log('第一次解析后:', typeof parsed, parsed ? parsed.substring(0, 50) : 'null');
    
    // 如果解析后是字符串，继续解析得到数组
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
      console.log('第二次解析后:', typeof parsed);
    }
    
    // 确保是数组
    if (Array.isArray(parsed)) {
      console.log('返回图片数组，长度:', parsed.length);
      // 过滤掉空字符串或无效数据
      return parsed.filter(p => p && p.trim());
    }
    console.log('不是数组，返回空');
    return [];
  } catch (e) {
    console.error('解析图片失败:', e.message, log.images);
    return [];
  }
};

// 预览日志图片
const previewLogPhoto = (log, idx) => {
  const photos = getLogPhotos(log);
  uni.previewImage({
    urls: photos,
    current: idx
  });
};

// 获取巡检图片（处理双重编码的JSON字符串）
const getIssuePhotos = (issue) => {
  if (!issue.images) return [];
  try {
    let photosStr = issue.images;
    let parsed = JSON.parse(photosStr);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (Array.isArray(parsed)) return parsed.filter(p => p && p.trim());
    return [];
  } catch (e) {
    return [];
  }
};

// 预览巡检图片
const previewIssuePhoto = (issue, idx) => {
  const photos = getIssuePhotos(issue);
  uni.previewImage({ urls: photos, current: idx });
};

// 巡检状态文字
const getIssueStatusText = (issue) => {
  const s = issue.rectify_status || issue.status || '';
  if (s === '待处理' || s === '待整改') return '⏳ 待整改';
  if (s === '整改中') return '🔧 整改中';
  if (s === '待验收') return '👀 待验收';
  if (s === '已完成') return '✅ 已完成';
  return '⏳ 待整改';
};

const goLogAdd = () => {
  uni.navigateTo({ url: `/pages/projects/log-add?projectId=${projectId.value}` });
};

const goInspectAdd = () => {
  uni.navigateTo({ url: `/pages/inspection/add?projectId=${projectId.value}` });
};

const goInspectDetail = (issue) => {
  uni.navigateTo({ url: `/pages/inspection/detail?id=${issue.id}` });
};

const goDispatchAdd = () => {
  uni.navigateTo({ url: `/pages/dispatch/add?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}&projectAddress=${encodeURIComponent(project.value.customer_address || project.value.address || '')}` });
};

const goMaterial = () => {
  uni.navigateTo({ url: `/pages/material/list?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}` });
};

const goFinance = () => {
  uni.navigateTo({ url: `/pages/finance/add?projectId=${projectId.value}` });
};

const goPurchaseAdd = () => {
  uni.navigateTo({ url: `/pages/purchase/add?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}` });
};

const contractSummary = computed(() => {
  // 只统计已审核通过的合同
  const contractAmt = contractList.value
    .filter(c => c.review_status === 'approved')
    .reduce((s, c) => s + Number(c.contract_amount || 0), 0);
  const changeAmt = changeList.value
    .filter(ch => ch.status === 'approved')
    .reduce((s, ch) => {
      return s + (ch.change_type === 'increase' ? Number(ch.amount || 0) : -Number(ch.amount || 0));
    }, 0);
  return {
    contract: contractAmt,
    change: changeAmt,
    total: contractAmt + changeAmt,
  };
});

const loadContracts = async () => {
  if (!projectId.value) return;
  contractList.value = []; // 清空旧数据，确保返回后看到刷新
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: `/api/contracts/by-project/${projectId.value}`,
      header: { Authorization: token },
    });
    if (res.data.code === 0) {
      contractList.value = res.data.data || [];
    }
  } catch (e) {
    console.error('加载合同失败:', e);
  }
};

const loadChanges = async () => {
  if (!projectId.value) return;
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: `/api/contract-changes?project_id=${projectId.value}&page_size=100`,
      header: { Authorization: token },
    });
    if (res.data.code === 0) {
      changeList.value = res.data.data?.list || res.data.data || [];
    }
  } catch (e) {
    console.error('加载增减项失败:', e);
  }
};

const goContractUpload = () => {
  uni.navigateTo({ url: `/pages/contracts/contract-upload?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}` });
};

const goContractChange = (change) => {
  const id = change?.id ? `&id=${change.id}` : '';
  const view = change?.id ? `&view=1` : '';
  uni.navigateTo({ url: `/pages/contracts/contract-change-add?projectId=${projectId.value}${id}${view}` });
};

// 合同卡片操作：有无 contract:approve 权限决定显示审核还是详情
const canApproveContract = ref(false);

const checkContractApprovePermission = async () => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({ url: '/api/my-permissions', header: { Authorization: token } });
    const perms = res.data?.permissions || [];
    canApproveContract.value = perms.includes('contract:approve') || perms.includes('project_contract:approve');
  } catch {
    // 读取本地缓存
    canApproveContract.value = userStore.hasPermission('contract:approve');
  }
};

const canApproveChange = ref(false);

const checkChangeApprovePermission = async () => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({ url: '/api/my-permissions', header: { Authorization: token } });
    const perms = res.data?.permissions || [];
    canApproveChange.value = perms.includes('contract_change:approve');
  } catch {
    canApproveChange.value = userStore.hasPermission('contract_change:approve');
  }
};

const openApproveChangeDialog = (change) => {
  uni.showModal({
    title: '审核增减项',
    content: `「${change.title}」${change.change_type === 'add' ? '增加' : '减少'} ¥${Number(change.amount || 0).toLocaleString()}，确认通过？`,
    confirmText: '确认通过',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return;
      await approveChange(change.id);
    },
  });
};

const goFinanceStats = (type) => {
  const name = encodeURIComponent(project.value?.name || '');
  if (type === 'receivable') {
    uni.navigateTo({ url: `/pages/finance/finance-receivable?projectId=${projectId.value}&projectName=${name}` });
  } else {
    uni.navigateTo({ url: `/pages/finance/finance-collected?projectId=${projectId.value}&projectName=${name}` });
  }
};

const approveChange = async (id) => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      method: 'PUT',
      url: `/api/contract-changes/${id}/review`,
      header: { Authorization: token, 'Content-Type': 'application/json' },
      data: { action: 'approve' },
    });
    if (res.data.code === 0 || res.data.message) {
      uni.showToast({ title: '审核成功', icon: 'success' });
      loadChanges();
    } else {
      uni.showToast({ title: (res.data.error || '审核失败'), icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '审核异常', icon: 'none' });
  }
};

const goContractChangeDetail = (contract) => {
  const statusMap = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
  const status = statusMap[contract.review_status] || contract.review_status;
  if (contract.review_status === 'approved') {
    // 已通过 → 显示详情 + 反审核按钮
    uni.showModal({
      title: '合同详情',
      content: `合同金额：¥${Number(contract.contract_amount || 0).toLocaleString()}\n审核状态：${status}\n备注：${contract.reviewer_remark || '无'}`,
      confirmText: '反审核',
      cancelText: '关闭',
      success: async (res) => {
        if (res.confirm) {
          await revertContract(contract.id);
        }
      },
    });
  } else {
    // 待审核/已驳回 → 显示详情 + 编辑/删除按钮
    uni.showModal({
      title: '合同详情',
      content: `合同金额：¥${Number(contract.contract_amount || 0).toLocaleString()}\n审核状态：${status}\n备注：${contract.remark || '无'}`,
      confirmText: '编辑',
      cancelText: '删除',
      success: async (res) => {
        if (res.confirm) {
          // 跳转到合同上传页编辑
          uni.navigateTo({ url: `/pages/contracts/contract-upload?projectId=${projectId.value}&editId=${contract.id}` });
        } else if (res.cancel) {
          await deleteContract(contract.id);
        }
      },
    });
  }
};

const revertContract = async (contractId) => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/contracts/${contractId}/revert`,
      method: 'PUT',
      header: { Authorization: token, 'Content-Type': 'application/json' },
    });
    if (res.data.code === 0 || res.data.message) {
      uni.showToast({ title: '已反审核', icon: 'success' });
      loadContracts();
    } else {
      uni.showToast({ title: res.data.error || '操作失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '操作失败', icon: 'none' });
  }
};

const deleteContract = async (contractId) => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/contracts/${contractId}`,
      method: 'DELETE',
      header: { Authorization: token },
    });
    if (res.data.code === 0 || res.data.message) {
      uni.showToast({ title: '已删除', icon: 'success' });
      loadContracts();
    } else {
      uni.showToast({ title: res.data.error || '删除失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '删除失败', icon: 'none' });
  }
};

const openApproveDialog = (contract) => {
  uni.showModal({
    title: '合同审核',
    content: `合同金额：¥${Number(contract.contract_amount || 0).toLocaleString()}\n点击确认后此合同将审核通过。`,
    confirmText: '确认通过',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        await approveContract(contract.id, 'approve');
      }
    },
  });
};

const approveContract = async (contractId, action, remark = '') => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: `/api/contracts/${contractId}/review`,
      method: 'PUT',
      header: { Authorization: token, 'Content-Type': 'application/json' },
      data: { action, remark },
    });
    if (res.data.code === 0 || res.data.message) {
      uni.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'success' });
      loadContracts();
    } else {
      uni.showToast({ title: res.data.error || '操作失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '网络错误', icon: 'none' });
  }
};

const goCollection = (contract) => {
  uni.navigateTo({ url: `/pages/contracts/collection-add?projectId=${projectId.value}&contractId=${contract.id}&projectName=${encodeURIComponent(project.value.name || '')}&actualReceivable=${financeSummary.value.actual_receivable}` });
};

// 把后端 attachment 字段（JSON 数组 / 逗号字符串 / 单个 URL）统一解析成数组
const parseAttachments = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s) return [];
  // 优先按 JSON 数组解析
  if (s.startsWith('[')) {
    try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : [s]; } catch (_) { return [s]; }
  }
  // 兜底：老数据（逗号分隔字符串）
  return s.split(',').map(x => x.trim()).filter(Boolean);
};

// 打开单个附件
const openOneAttachment = (url) => {
  if (!url) return;
  const fullUrl = url.startsWith('http') ? url : (location.origin + url);
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);

  // #ifdef H5
  if (isImage) {
    uni.previewImage({ urls: [fullUrl], current: fullUrl });
  } else {
    window.open(fullUrl, '_blank');
  }
  return;
  // #endif

  // #ifdef MP-WEIXIN
  uni.downloadFile({
    url: fullUrl,
    success: (res) => uni.openDocument({ filePath: res.tempFilePath, success: () => {}, fail: () => uni.showToast({ title: '打开失败', icon: 'none' }) }),
    fail: () => uni.showToast({ title: '下载失败', icon: 'none' }),
  });
  return;
  // #endif

  // #ifdef APP-PLUS
  plus.runtime.openURL(fullUrl, () => uni.showToast({ title: '打开失败', icon: 'none' }));
  // #endif
};

// previewFile 入口：兼容老字符串、新 JSON 数组、单 URL
const previewFile = (raw) => {
  const urls = parseAttachments(raw);
  if (urls.length === 0) return;
  if (urls.length === 1) {
    openOneAttachment(urls[0]);
    return;
  }
  // 多个附件：依次打开（H5 浏览器一个一个新窗口；其他平台提示选一个）
  // #ifdef H5
  uni.showActionSheet({
    itemList: urls.map((u, i) => `${i + 1}. ${decodeURIComponent(u.split('/').pop() || u)}`),
    success: (res) => openOneAttachment(urls[res.tapIndex]),
  });
  return;
  // #endif
  // #ifndef H5
  // 小程序/APP：多附件时只能让用户选一个
  uni.showActionSheet({
    itemList: urls.map((u, i) => `${i + 1}. ${decodeURIComponent(u.split('/').pop() || u)}`),
    success: (res) => openOneAttachment(urls[res.tapIndex]),
  });
  // #endif
};

const goPurchaseDetail = (item) => {
  uni.navigateTo({ url: `/pages/purchase/detail?id=${item.id}` });
};

const loadPurchase = async () => {
  if (!projectId.value) return;
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: `/api/purchase-requests?project_id=${projectId.value}&page_size=100`,
      header: { Authorization: token },
    });
    if (res.data.code === 0 || res.data.code === undefined) {
      purchaseList.value = res.data.list || res.data.data?.list || [];
    }
  } catch (e) {
    console.error('加载采购记录失败:', e);
  }
};

const purchaseStatusLabel = (s) => {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    reimburse: '待报销',
    reimbursed: '已报销',
    finance_confirmed: '财务确认',
  };
  return map[s] || s;
};

const purchaseStatusColor = (s) => {
  const map = {
    pending: '#ff9800',
    approved: '#4caf50',
    rejected: '#f44336',
    reimburse: '#ff9800',
    reimbursed: '#4caf50',
    finance_confirmed: '#2196f3',
  };
  return map[s] || '#999';
};

const goGallery = (cat) => {
  uni.navigateTo({ url: `/pages/gallery/index?projectId=${projectId.value}&cat=${cat}` });
};

const reportStart = (node) => {
  uni.showActionSheet({
    itemList: ['确认开工', '取消'],
    success: async (res) => {
      if (res.tapIndex === 0 && node.id) {
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: { status: 'in_progress' },
          });
          uni.showToast({ title: '已开工', icon: 'success' });
          await fetchDetail();
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    },
  });
};

const reportComplete = (node) => {
  uni.showModal({
    title: '完工上报',
    content: `确认「${node.node_name || node.stage_name}」已完成？`,
    confirmText: '确认完工',
    success: async (res) => {
      if (res.confirm) {
        try {
          const token = uni.getStorageSync("token");
          await uni.request({
            url: `/api/project-stages/${node.id}`,
            method: "PUT",
            header: { Authorization: token },
            data: {
              status: 'completed',
              progress_percent: 100,
              actual_date: new Date().toISOString().split('T')[0],
            },
          });
          // 记录日志
          await uni.request({
            url: "/api/project-logs",
            method: "POST",
            header: { Authorization: token },
            data: {
              project_id: projectId.value,
              stage_id: node.id,
              action_type: 'node_completed',
              description: `节点「${node.node_name || node.stage_name}」完工上报`,
            },
          });
          uni.showToast({ title: '已完工上报', icon: 'success' });
          await fetchDetail();
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    },
  });
};

const loadFinanceData = async () => {
  if (!projectId.value) return;
  try {
    const token = uni.getStorageSync('token');
    // 加载应收统计
    const summaryRes = await uni.request({ url: `/api/finance/summary?project_id=${projectId.value}`, header: { Authorization: token } });
    if (summaryRes.data) {
      financeSummary.value = {
        contract_amount: Number(summaryRes.data.contract_amount || 0),
        change_total: Number(summaryRes.data.increase_total || 0) - Number(summaryRes.data.decrease_total || 0),
        actual_receivable: Number(summaryRes.data.receivable || 0),
      };
    }
    const collectionRes = await uni.request({ url: `/api/collection-records?project_id=${projectId.value}`, header: { Authorization: token } });
    if (Array.isArray(collectionRes.data)) {
      collectionRecords.value = collectionRes.data;
    } else if (collectionRes.data?.list) {
      collectionRecords.value = collectionRes.data.list;
    }
  } catch (e) {
    console.error('加载财务数据失败:', e);
  }
};

const openCollectionRecord = (item) => {
  collectionModal.value = { visible: true, data: item };
};

const confirmCollection = async () => {
  const item = collectionModal.value.data;
  if (!item?.id) return;
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      method: 'PUT',
      url: `/api/collection-records/${item.id}/confirm`,
      header: { Authorization: token, 'Content-Type': 'application/json' },
      data: { confirmed_amount: item.amount },
    });
    if (res.data.code === 0 || !res.data.error) {
      uni.showToast({ title: '确认成功', icon: 'success' });
      collectionModal.value.visible = false;
      loadFinanceData();
    } else {
      uni.showToast({ title: res.data.error || '确认失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: '确认失败', icon: 'none' });
  }
};

const previewImage = (images, index) => {
  uni.previewImage({ urls: images, current: index });
};

const fetchDetail = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const userInfo = uni.getStorageSync('userInfo');
    const res = await uni.request({
      url: "/api/projects",
      header: {
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),
      },
    });
    uni.hideLoading();
    const data = res.data;
    if (Array.isArray(data)) {
      const found = data.find((p) => p.id === projectId.value);
      if (found) project.value = found;
    }
    // 加载日志、巡检、派工
    fetchLogs();
    fetchInspections();
    loadPurchase();
    loadDispatches();
    loadFinanceData();
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: "加载失败", icon: "none" });
  }
};

// 加载施工日志（只显示有内容的）
const fetchLogs = async () => {
  if (!projectId.value) return;
  logsLoading.value = true;
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: `/api/project-logs/${projectId.value}`,
      header: { Authorization: token },
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

// 加载巡检记录
const fetchInspections = async () => {
  if (!projectId.value) return;
  issuesLoading.value = true;
  try {
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      url: `/api/rectification-issues?project_id=${projectId.value}`,
      header: { Authorization: token },
    });
    console.log('[巡检] 返回:', JSON.stringify(res.data).slice(0, 200));
    if (Array.isArray(res.data)) {
      issues.value = res.data.map(item => ({
        ...item,
        title: item.title || item.issue_desc || '巡检记录',
        level: item.level || (item.status === '合格' ? 'normal' : 'serious'),
        location: item.location || '',
        statusText: item.rectify_status || item.status || '待整改',
      }));
    }
  } catch (e) {
    console.error('加载巡检失败:', e);
  } finally {
    issuesLoading.value = false;
  }
};

// 加载派工单
const loadDispatches = async () => {
  if (!projectId.value) return;
  try {
    const userId = uni.getStorageSync('userInfo')?.id || '';
    const res = await uni.request({
      url: `/api/dispatches?project_id=${projectId.value}&page_size=100`,
      header: { 'x-user-id': userId },
    });
    if (res.data.code === 0 || res.data.code === undefined || Array.isArray(res.data)) {
      dispatches.value = Array.isArray(res.data) ? res.data : (res.data.list || []);
    }
  } catch (e) {
    console.error('加载派工单失败:', e);
  }
};

const dispatchStatusLabel = (s) => ({ pending: '待审核', approved: '进行中', rejected: '已驳回', completed: '已完成' })[s] || s;
const dispatchStatusBg = (s) => ({ pending: '#fff3e0', approved: '#DBEAFE', rejected: '#ffebee', completed: '#D1FAE5' })[s] || '#f5f5f5';
const dispatchStatusColor = (s) => ({ pending: '#ff9800', approved: '#1E40AF', rejected: '#f44336', completed: '#065F46' })[s] || '#999';

onMounted(() => {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const options = (current).options || {};
  projectId.value = parseInt(options.id || '0');
  if (projectId.value) {
    fetchDetail();
    loadContracts();
    loadChanges();
    checkContractApprovePermission();
    checkChangeApprovePermission();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && projectId.value) {
    loadContracts();
    loadChanges();
    checkContractApprovePermission();
    checkChangeApprovePermission();
  }
});

watch(curTab, (val) => {
  if (val === 'dispatch' && projectId.value) {
    loadDispatches();
  }
  if (val === 'contract' && projectId.value) {
    loadContracts();
    loadChanges();
  }
  if (val === 'gallery' && projectId.value) {
    loadGalleryStats();
  }
});


const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F7FA;
  padding-bottom: 80px;
  text-align: left;
}

/* 项目头部 */
.project-header {
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%);
  padding: 16px 16px 20px;
  color: #fff;
}

.project-title-row {
  margin-bottom: 14px;
}

.project-name-wrap {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.project-name {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  flex: 1;
  line-height: 1.4;
}

.status-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
  white-space: nowrap;
}

.s-default { background: rgba(255,255,255,0.15); color: #fff; }
.s-done { background: #10B981; color: #fff; }
.s-progress { background: #3B82F6; color: #fff; }
.s-pending { background: rgba(255,255,255,0.15); color: #fff; }
.s-overdue { background: #EF4444; color: #fff; }

/* 进度条 */
.project-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.progress-bar-full {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill-full {
  height: 100%;
  background: linear-gradient(90deg, #10B981, #34D399);
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-text-full {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  width: 42px;
  text-align: right;
}

/* 信息格 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 8px 10px;
}

.info-label {
  display: block;
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 2px;
}

.info-value {
  font-size: 13px;
  color: #fff;
  font-weight: 500;
}

.info-value.accent { color: #6EE7B7; }

/* 标签页 */
.tab-bar {
  display: flex;
  background: #fff;
  padding: 0 8px;
  border-bottom: 1px solid #F3F4F6;
  overflow-x: auto;
  white-space: nowrap;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 12px 12px;
  font-size: 13px;
  color: #9CA3AF;
  border-bottom: 2px solid transparent;
  position: relative;
  flex-shrink: 0;
}

.tab-item.active {
  color: #1E3A5F;
  font-weight: 600;
  border-bottom-color: #1E3A5F;
}

.tab-dot {
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: 600;
}

/* 标签内容 */
.tab-content {
  padding: 12px 16px;
}

.tab-panel {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1A1F36;
}

.tool-btn {
  font-size: 13px;
  color: #1E3A5F;
  font-weight: 500;
}

/* 节点时间线 */
.node-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 0;
}

.timeline-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 14px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
}

.n-pending { background: #E5E7EB; }
.n-progress { background: #3B82F6; }
.n-done { background: #10B981; }
.n-skipped { background: #F59E0B; }

.timeline-connector {
  width: 2px;
  flex: 1;
  background: #E5E7EB;
  min-height: 20px;
}

.timeline-content {
  flex: 1;
  padding: 0 0 16px 10px;
}

.node-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border-left: 3px solid transparent;
}

.node-card-n-done { border-left-color: #10B981; }
.node-card-n-progress { border-left-color: #3B82F6; }
.node-card-n-pending { border-left-color: #E5E7EB; }

.node-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.node-seq {
  width: 20px;
  height: 20px;
  background: #F3F4F6;
  color: #6B7280;
  border-radius: 50%;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  font-weight: 500;
}

.node-status-pill.n-pending { background: #F3F4F6; color: #9CA3AF; }
.node-status-pill.n-progress { background: #DBEAFE; color: #1E40AF; }
.node-status-pill.n-done { background: #D1FAE5; color: #065F46; }

.node-card-body {
  margin-bottom: 8px;
}

.node-dates {
  display: flex;
  align-items: center;
  gap: 4px;
}

.node-date-icon { font-size: 12px; }

.node-date-text {
  font-size: 12px;
  color: #6B7280;
}

.node-date-text.muted { color: #D1D5DB; }

.node-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #F9FAFB;
}

.action-btn-sm {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  background: #F3F4F6;
  color: #374151;
  cursor: pointer;
}

.action-btn-sm.accent {
  background: #1E3A5F;
  color: #fff;
}

/* 日志 */
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
  margin-bottom: 12px;
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
  /* 不在这里加 padding，否则标签也会被推走 */
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

.log-content-value {
  font-size: 14px;
  color: #333;
  margin-right: 16px;
}

.log-tag {
  font-size: 12px;
  color: #1E3A5F;
  background: #E8F4FF;
  padding: 4px 12px;
  border-radius: 12px;
  margin-right: 8px;
}

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

.log-section {
  margin-bottom: 8px;
}

.log-section-label {
  font-size: 12px;
  color: #9CA3AF;
  display: block;
  margin-bottom: 2px;
}

.log-section-content {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  display: block;
}

.log-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.log-tag {
  font-size: 12px;
  padding: 3px 8px;
  background: #F3F4F6;
  color: #6B7280;
  border-radius: 4px;
}

/* 问题 */
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issue-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.issue-level {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.level-normal { background: #FEF3C7; color: #92400E; }
.level-serious { background: #FEE2E2; color: #991B1B; }
.level-stop { background: #7C3AED; color: #fff; }

.issue-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.issue-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.issue-location {
  font-size: 12px;
  color: #9CA3AF;
}

.issue-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-pending { background: #FEE2E2; color: #991B1B; }
.status-fixing { background: #FEF3C7; color: #92400E; }

/* 合同 */
.contract-info {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.contract-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #F9FAFB;
}

.contract-item.total {
  border-bottom: none;
  padding-top: 14px;
}

.contract-label {
  font-size: 13px;
  color: #6B7280;
}

.contract-value {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.contract-value.accent { color: #EF4444; }
.contract-value.decrease { color: #10B981; }

/* 合同卡片 */
.contract-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
}
.contract-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.contract-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}
.contract-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.contract-status.s-approved { background: #D1FAE5; color: #065F46; }
.contract-status.s-rejected { background: #FEE2E2; color: #991B1B; }
.contract-status.s-pending { background: #FEF3C7; color: #92400E; }
.approved-static {
  background: #D1FAE5;
  color: #065F46;
  font-size: 13px;
  text-align: center;
  padding: 8px 0;
  border-radius: 8px;
}
.contract-card-body {
  margin-bottom: 10px;
}
.cc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}
.cc-label {
  font-size: 13px;
  color: #6B7280;
}
.cc-value {
  font-size: 13px;
  font-weight: 600;
  color: #1A1F36;
}
.cc-value.link { color: #3B82F6; text-decoration: underline; }
.cc-value.accent { color: #EF4444; }
.cc-value.decrease { color: #10B981; }
.contract-card-actions {
  display: flex;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #F9FAFB;
}
.cc-btn {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: #3B82F6;
  padding: 8px 0;
  background: #EFF6FF;
  border-radius: 8px;
}

/* 区块分割 */
.section-divider {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px 8px;
}
.section-divider-text {
  font-size: 13px;
  font-weight: 600;
  color: #6B7280;
}

/* 增减项卡片 */
.change-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
}
.change-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.change-title {
  font-size: 13px;
  font-weight: 600;
  color: #1A1F36;
}

/* 合同汇总 */
.contract-summary {
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  border-radius: 12px;
  padding: 16px;
  margin-top: 14px;
  color: #fff;
}
.contract-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}
.contract-summary-row.total {
  border-top: 1px solid rgba(255,255,255,0.2);
  margin-top: 8px;
  padding-top: 12px;
}
.cs-label {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
}
.cs-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

/* 财务子Tab */
.cs-value.accent { color: #FCA5A5; }
.cs-value.decrease { color: #6EE7B7; }

/* 空状态按钮 */
.empty-btn {
  margin-top: 10px;
  font-size: 13px;
  color: #3B82F6;
  padding: 8px 20px;
  background: #EFF6FF;
  border-radius: 20px;
}

/* 工具栏按钮 */
.toolbar-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.tool-btn {
  font-size: 12px;
  color: #3B82F6;
  padding: 4px 10px;
  background: #EFF6FF;
  border-radius: 6px;
}
.tool-btn.primary {
  background: #3B82F6;
  color: #fff;
}
.tool-btn.small {
  font-size: 11px;
  padding: 3px 8px;
}
.empty-state.small {
  padding: 20px 0;
}


.finance-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.finance-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.finance-card.income {
  background: linear-gradient(135deg, #D1FAE5, #A7F3D0);
}

.finance-card.expense {
  background: linear-gradient(135deg, #FEE2E2, #FECACA);
}

.finance-card-label {
  display: block;
  font-size: 12px;
  color: #065F46;
  margin-bottom: 6px;
}

.finance-card.expense .finance-card-label {
  color: #991B1B;
}

.finance-card-num {
  font-size: 20px;
  font-weight: 700;
  color: #065F46;
}

.finance-card.expense .finance-card-num { color: #991B1B; }

/* 财务子Tab */
.finance-sub-tabs {
  display: flex;
  background: #F1F5F9;
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 12px;
}
.sub-tab {
  flex: 1;
  text-align: center;
  padding: 7px 0;
  font-size: 14px;
  color: #64748B;
  border-radius: 8px;
}
.sub-tab.active {
  background: #fff;
  color: #1E40AF;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.sub-tab-content { padding-top: 4px; }

/* 收支记录卡片 */
.finance-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.finance-record-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.fr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.fr-type { font-size: 14px; font-weight: 600; color: #1E293B; }
.fr-amount { font-size: 15px; font-weight: 700; color: #991B1B; }
.fr-info { display: flex; justify-content: space-between; }
.fr-desc { font-size: 12px; color: #64748B; }
.fr-date { font-size: 12px; color: #94A3B8; }
.finance-record-card.pending {
  border-left: 3px solid #D97706;
}

/* 图库分类 */
.gallery-cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.gallery-cat {
  background: #fff;
  border-radius: 12px;
  padding: 14px 8px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.gallery-cat:active {
  transform: scale(0.97);
}

.gallery-cat-icon {
  display: block;
  font-size: 24px;
  margin-bottom: 6px;
}

.gallery-cat-name {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #1A1F36;
  margin-bottom: 2px;
}

.gallery-cat-count {
  font-size: 11px;
  color: #9CA3AF;
}

/* 底部操作 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 10px 16px;
  display: flex;
  gap: 8px;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  z-index: 100;
}

.action-quick {
  flex: 1;
  background: #F3F4F6;
  color: #374151;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.action-primary {
  flex: 1.2;
  background: #1E3A5F;
  color: #fff;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
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
  padding: 40px;
  color: #9CA3AF;
}

/* 采购卡片 */
.purchase-card {
  background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px;
}
.purchase-card-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
}
.purchase-name { font-size: 14px; font-weight: 600; color: #333; }
.purchase-status { font-size: 12px; }
.purchase-info {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: #666;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 50px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: #9CA3AF;
}

/* 巡检列表 */
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.issue-item {
  padding: 12px;
  background: #fff;
  border-radius: 10px;
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.issue-level {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
}

.level-serious { background: #FEE2E2; color: #DC2626; }
.level-normal { background: #DBEAFE; color: #2563EB; }
.level-stop { background: #FEF3C7; color: #D97706; }

.issue-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
}

.issue-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #6B7280;
}

.issue-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
}

.status-待整改, .status-待处理, .status-pending { background: #FEF3C7; color: #D97706; }
.status-整改中 { background: #EDE9FE; color: #7C3AED; }
.status-待验收 { background: #DBEAFE; color: #2563EB; }
.status-已完成, .status-completed { background: #D1FAE5; color: #059669; }

.level-tag-serious { background: #FEE2E2; color: #DC2626; }
.level-tag-stop { background: #1E3A5F; color: #fff; }
.level-tag-normal { background: #D1FAE5; color: #059669; }

.issue-desc {
  margin-top: 6px;
  font-size: 13px;
  color: #6B7280;
  line-height: 1.4;
}

/* 派工卡片 */
.dispatch-card {
  background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.dispatch-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 10px;
}
.dispatch-content { font-size: 15px; font-weight: 600; color: #1A1F36; flex: 1; margin-right: 10px; }
.dispatch-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.dispatch-info { display: flex; flex-direction: column; gap: 4px; }
.dispatch-row { display: flex; font-size: 13px; }
.dispatch-label { color: #999; width: 80px; flex-shrink: 0; }
.dispatch-val { color: #333; flex: 1; }
.dispatch-val.amount { color: #1E3A5F; font-weight: 600; }

/* 催收确认弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-box {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 88%;
  max-width: 600px;
  box-sizing: border-box;
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: #1A1F36;
  text-align: center;
  margin-bottom: 18px;
}
.modal-info-grid { display: flex; flex-direction: column; gap: 10px; }
.modal-info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.modal-info-label { font-size: 14px; color: #64748B; flex-shrink: 0; }
.modal-info-value { font-size: 14px; color: #1A1F36; font-weight: 500; text-align: right; }
.modal-info-value.accent { color: #059669; font-size: 16px; font-weight: 700; }
.modal-images { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.modal-img { width: 80px; height: 80px; border-radius: 8px; object-fit: cover; }
.modal-actions { display: flex; gap: 12px; margin-top: 20px; }
.modal-btn { flex: 1; height: 44px; line-height: 44px; border-radius: 10px; font-size: 15px; font-weight: 600; border: none; }
.modal-btn.cancel { background: #F1F5F9; color: #64748B; }
.modal-btn.confirm { background: #059669; color: #fff; }

</style>
