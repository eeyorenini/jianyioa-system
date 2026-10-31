<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="nav-bar" :style="navStyle">
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
                  <view class="node-status-pill node-status-btn" :class="getNodeStatusClass(displayStatus(node, idx))" @click.stop="openWheel(node, idx)">
                    <text>{{ getNodeStatusText(displayStatus(node, idx)) }}</text>
                    <text class="pill-caret">▾</text>
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
                <!-- 状态直接在列表内改（点状态按钮弹滚轮），不再放单独的操作按钮 -->
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
                  <text class="log-tag-icon status-tag" :class="`status-${statusSlug(issue)}`">
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

      <!-- 验收 -->
      <view v-if="curTab === 'accept'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">验收记录</text>
          <text class="tool-btn" @click="goAcceptAdd">+ 新建验收</text>
        </view>

        <view class="loading-state" v-if="acceptancesLoading">
          <text>加载中...</text>
        </view>
        <view class="log-list" v-else-if="acceptances.length">
          <view class="log-item" v-for="a in acceptances" :key="a.id" @click="goAcceptDetail(a)">
            <view class="log-row log-row-first">
              <view class="log-date-bar">
                <text class="log-date-day">{{ formatDay(a.created_at) }}</text>
                <text class="log-date-month">{{ formatMonth(a.created_at) }}</text>
              </view>
              <view class="log-user-info">
                <view class="log-user-line">
                  <text class="log-operator">✅ {{ a.template_name || '验收' }}</text>
                  <text class="log-time">{{ formatFullTime(a.created_at) }}</text>
                </view>
                <view class="log-tags-row">
                  <text class="log-tag-icon status-tag">{{ resultLabel(a.result) }}</text>
                  <text class="log-tag-icon">{{ a.item_count }} 项 · 合格 {{ a.pass_count }}</text>
                  <text class="log-tag-icon" v-if="a.area">{{ a.area }}</text>
                </view>
              </view>
            </view>

            <view class="log-content-area" v-if="a.remark">
              <view class="log-content-row">
                <view class="log-tag-box">备注</view>
                <view class="log-content-text">{{ a.remark }}</view>
              </view>
            </view>

            <view class="log-photos" v-if="getAcceptPhotos(a).length">
              <view
                class="log-photo"
                v-for="(photo, idx) in getAcceptPhotos(a)"
                :key="idx"
                @click.stop="previewAcceptPhoto(a, idx)"
              >
                <image class="log-photo-img" :src="photo" mode="aspectFill" />
              </view>
            </view>
          </view>
        </view>
        <view class="empty-state" v-else>
          <text class="empty-icon">✅</text>
          <text class="empty-text">暂无验收记录</text>
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

      <!-- 主材验收（v2.4.1：原「材料」tab 是空壳，materials 从未赋值 → 永远空态。
           现在接 material_acceptance 模块，从项目内进入自动绑定项目，不再让用户选项目） -->
      <view v-if="curTab === 'material'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">主材验收</text>
          <text class="tool-btn" @click="goMatAcceptAdd">+ 新建验收</text>
        </view>

        <view class="loading-state" v-if="matAcceptsLoading">
          <text>加载中...</text>
        </view>
        <view class="log-list" v-else-if="matAccepts.length">
          <view class="log-item" v-for="m in matAccepts" :key="m.id" @click="goMatAcceptDetail(m)">
            <view class="log-row log-row-first">
              <view class="log-date-bar">
                <text class="log-date-day">{{ formatDay(m.accept_date || m.created_at) }}</text>
                <text class="log-date-month">{{ formatMonth(m.accept_date || m.created_at) }}</text>
              </view>
              <view class="log-user-info">
                <view class="log-user-line">
                  <text class="log-operator">📦 {{ m.stage || '材料进场' }}</text>
                  <text class="log-time">{{ m.accept_no || '' }}</text>
                </view>
                <view class="log-tags-row">
                  <text class="log-tag-icon status-tag">{{ m.result || '未填结论' }}</text>
                  <text class="log-tag-icon">共 {{ m.item_count || 0 }} 项</text>
                  <text class="log-tag-icon" v-if="m.fail_count">不合格 {{ m.fail_count }}</text>
                </view>
              </view>
            </view>

            <view class="log-content-area" v-if="m.supplier_name">
              <view class="log-content-row">
                <view class="log-tag-box">供应商</view>
                <view class="log-content-text">{{ m.supplier_name }}</view>
              </view>
            </view>

            <view class="log-photos" v-if="getMatPhotos(m).length">
              <view
                class="log-photo"
                v-for="(photo, idx) in getMatPhotos(m)"
                :key="idx"
                @click.stop="previewMatPhoto(m, idx)"
              >
                <image class="log-photo-img" :src="photo" mode="aspectFill" />
              </view>
            </view>
          </view>
        </view>
        <view class="empty-state" v-else>
          <text class="empty-icon">📦</text>
          <text class="empty-text">暂无材料验收记录</text>
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
          <!-- 3 张总览卡片：合同金额 / 增减合计 / 实际应收（公式：合同 + 增减合计） -->
          <view class="finance-summary-3col">
            <view class="finance-card income">
              <text class="finance-card-label">合同金额</text>
              <text class="finance-card-num">¥{{ financeSummary.contract_amount.toLocaleString() }}</text>
              <text class="finance-card-sub">{{ contractList.filter(c => c.review_status === 'approved').length }} 份已审核</text>
            </view>
            <view class="finance-card" :class="financeSummary.change_total >= 0 ? 'income' : 'expense'">
              <text class="finance-card-label">增减合计</text>
              <text class="finance-card-num">{{ financeSummary.change_total >= 0 ? '+' : '' }}¥{{ financeSummary.change_total.toLocaleString() }}</text>
              <text class="finance-card-sub">{{ changeList.length }} 条增减项</text>
            </view>
            <view class="finance-card receivable-highlight">
              <text class="finance-card-label">实际应收</text>
              <text class="finance-card-num">¥{{ financeSummary.actual_receivable.toLocaleString() }}</text>
              <text class="finance-card-sub">合同 + 增减合计</text>
            </view>
          </view>

          <!-- 增减项明细（按全部/增项/减项过滤；按时间倒序） -->
          <view class="section-divider">
            <text class="section-divider-text">增减项明细</text>
            <view class="change-filter">
              <text :class="{ active: changeFilter === 'all' }" @click="changeFilter = 'all'">全部 {{ changeList.length }}</text>
              <text :class="{ active: changeFilter === 'increase' }" @click="changeFilter = 'increase'">增项 {{ increaseCount }}</text>
              <text :class="{ active: changeFilter === 'decrease' }" @click="changeFilter = 'decrease'">减项 {{ decreaseCount }}</text>
            </view>
          </view>

          <view v-if="filteredChanges.length === 0" class="empty-state small">
            <text class="empty-text">{{ changeFilter === 'increase' ? '暂无增加项' : changeFilter === 'decrease' ? '暂无减少项' : '暂无增减项' }}</text>
          </view>
          <view v-else>
            <view v-for="ch in filteredChanges" :key="ch.id" class="change-card">
              <view class="change-card-header">
                <text class="change-title">{{ ch.title }}</text>
                <text class="change-type-badge" :class="ch.change_type === 'increase' ? 'badge-increase' : 'badge-decrease'">
                  {{ ch.change_type === 'increase' ? '➕ 增项' : '➖ 减项' }}
                </text>
              </view>
              <view class="cc-row">
                <text class="cc-label">金额</text>
                <text class="cc-value" :class="ch.change_type === 'increase' ? 'accent' : 'decrease'">
                  {{ ch.change_type === 'increase' ? '+' : '-' }}¥{{ Number(ch.amount || 0).toLocaleString() }}
                </text>
              </view>
              <view class="cc-row">
                <text class="cc-label">状态</text>
                <text class="cc-value">
                  {{ ch.status === 'approved' ? '✅ 已审核' : ch.status === 'rejected' ? '❌ 已驳回' : '⏳ 待审核' }}
                </text>
              </view>
              <view class="cc-row" v-if="ch.submitted_by_name">
                <text class="cc-label">申请人</text>
                <text class="cc-value">{{ ch.submitted_by_name }}</text>
              </view>
              <view class="cc-row" v-if="formatChangeTime(ch) !== '—'">
                <text class="cc-label">时间</text>
                <text class="cc-value">{{ formatChangeTime(ch) }}</text>
              </view>
            </view>
          </view>

          <view class="empty-state" v-if="financeSummary.contract_amount === 0 && changeList.length === 0">
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
            <image v-for="(img, idx) in JSON.parse(collectionModal.data.images)" :key="idx" :src="absAsset(img)" class="modal-img" mode="aspectFill" @click="previewImage(JSON.parse(collectionModal.data.images), idx)" />
          </view>
          <view class="modal-actions">
            <button class="modal-btn cancel" @click="collectionModal.visible = false">取消</button>
            <button class="modal-btn confirm" @click="confirmCollection">确认收款</button>
          </view>
        </view>
      </view>

      <!-- 项目图库 -->
      <view v-if="curTab === 'gallery'" class="tab-panel">
        <view class="panel-toolbar">
          <text class="panel-title">项目图库</text>
          <text class="panel-subtitle">共 {{ galleryPhotos.length }} 张</text>
        </view>
        <view class="gallery-cats">
          <view class="gallery-cat" v-for="cat in galleryCats" :key="cat.name" @click="goGallery(cat.key)">
            <text class="gallery-cat-icon">{{ cat.icon }}</text>
            <text class="gallery-cat-name">{{ cat.name }}</text>
            <text class="gallery-cat-count">{{ galleryStats[cat.key] || 0 }}张</text>
          </view>
        </view>

        <!-- 最新 20 张缩略图（点开放大） -->
        <view class="section-divider">
          <text class="section-divider-text">最新照片</text>
          <text class="section-divider-sub" @click="goGallery('全部')">查看全部 ›</text>
        </view>
        <view v-if="latestGalleryPhotos.length === 0" class="empty-state small">
          <text class="empty-text">暂无照片，上传施工日志图片后会自动归类</text>
        </view>
        <view v-else class="gallery-thumbs-4col">
          <view
            v-for="(photo, idx) in latestGalleryPhotos"
            :key="photo.url + idx"
            class="thumb-cell"
            @click="previewGalleryImage(idx, galleryPhotos)"
          >
            <image class="thumb-img" :src="absAsset(photo.url)" mode="aspectFill" />
            <view class="thumb-overlay">
              <text class="thumb-cat">{{ photo.category }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 项目文件（v2.3.4 · UI 美化 2026-10-20） -->
      <view v-if="curTab === 'files'" class="tab-panel">
        <!-- 文件概览卡片 -->
        <view class="files-hero">
          <view class="files-hero-bg" />
          <view class="files-hero-row">
            <view class="files-hero-info">
              <text class="files-hero-label">项目文件总数</text>
              <text class="files-hero-count">{{ projectFiles.length }}<text class="files-hero-unit"> 个</text></text>
              <text class="files-hero-sub">{{ fileCatStats.filter(c => c.count > 0).length }} 个分类 · 最近上传 {{ recentFiles.length ? formatRecentTime(recentFiles[0].uploaded_at) : '暂无' }}</text>
            </view>
            <view class="files-hero-btn" @click="goFilesUpload" v-if="canUploadFile">
              <text class="files-hero-btn-text">+ 上传文件</text>
            </view>
          </view>
        </view>

        <!-- 分类网格 -->
        <view class="files-cats">
          <view class="files-cat" v-for="c in fileCatStats" :key="c.key" @click="goFilesList(c.key)">
            <view class="files-cat-icon" :style="{ background: catBg(c.key) }">
              <text class="files-cat-emoji">{{ c.icon }}</text>
            </view>
            <text class="files-cat-name">{{ c.label }}</text>
            <text v-if="c.count" class="files-cat-count">{{ c.count }}</text>
          </view>
        </view>

        <view class="section-divider">
          <text class="section-divider-text">最近上传</text>
          <text class="section-divider-sub" @click="goFilesList">查看全部 ›</text>
        </view>
        <view v-if="recentFiles.length === 0" class="empty-state small">
          <text class="empty-icon">📂</text>
          <text class="empty-text">暂无文件，点击右上角上传</text>
        </view>
        <view v-else class="recent-files">
          <view v-for="f in recentFiles" :key="f.id" class="recent-file" @click="goFileDetail(f.id)">
            <view class="recent-file-icon" :style="{ background: fileExtBg(f.file_ext) }">
              <text class="recent-file-emoji">{{ fileThumbIcon(f.file_ext) }}</text>
            </view>
            <view class="recent-file-info">
              <text class="recent-file-title">{{ f.title }}</text>
              <text class="recent-file-meta">{{ fileCatLabel(f.category) }} · {{ f.uploader_name || '员工' }} · {{ formatRecentTime(f.uploaded_at) }}</text>
            </view>
            <view class="recent-file-status" :style="fileStatusStyle(f.status)">{{ fileStatusText(f.status) }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部快捷操作 -->
    <view class="bottom-actions">
      <view class="action-quick" @click="goLogAdd">
        <text>📝 日志</text>
      </view>
      <view class="action-quick" @click="goInspectAdd">
        <text>🔍 巡检</text>
      </view>
      <!-- v2.4.1：原「🧱 主材」跳主材台账（用户确认台账暂无实际用途），改为切到主材验收 tab -->
      <view class="action-quick" @click="curTab = 'material'">
        <text>📦 验收</text>
      </view>
      <view class="action-primary" @click="goDispatchAdd">
        <text>+ 派工</text>
      </view>
    </view>

    <!-- 节点状态滚轮 -->
    <StatusWheel
      :visible="wheel.visible"
      :title="wheel.title"
      :items="statusOptions"
      :current="wheel.current"
      @cancel="wheel.visible = false"
      @confirm="onWheelConfirm"
    />
  </view>
</template>

<script setup >
import { ref, computed, onMounted, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { absAsset } from "@/utils/api";
import { authHeader } from "@/utils/permission";
import { useUserStore } from "@/stores/user";
import { toDate } from "@/utils/date";
import StatusWheel from "@/pkg-project/components/status-wheel.vue";

const projectId = ref(0);
const project = ref({});
const userStore = useUserStore();
const curTab = ref('nodes');
const financeSubTab = ref('records');

/**
 * 项目详情内的 tab 定义。
 * v2.3.13 修：原先 11 个 tab 全部硬编码显示，项目详情成了权限的「后门」——
 *   项目经理（manager）没有 project_file 任何权限位，首页入口看不到「项目文件」，
 *   但进项目详情照样能看到「文件」tab，点进去接口 403、列表空白。
 *   现在每个 tab 绑定后端同名权限位，canSee 不通过就不渲染（与首页快捷入口同口径）。
 *   perms 是数组：命中任意一个即可见（合同 tab 同时承载增减项）。
 *   空数组 = 进得来项目详情就能看（项目管理本身已由 project:read 把守）。
 */
const TAB_DEFS = [
  { key: 'nodes', label: '进度节点', perms: [] },
  { key: 'logs', label: '施工日志', perms: ['project_log:read'] },
  { key: 'inspect', label: '巡检', perms: ['inspection:read'] },
  { key: 'accept', label: '验收', perms: ['acceptance:read'] },
  { key: 'dispatch', label: '派工', perms: ['dispatch:read'] },
  { key: 'material', label: '主材验收', perms: ['material_acceptance:read'] },
  { key: 'purchase', label: '采购', perms: ['purchase:read'] },
  { key: 'contract', label: '合同', perms: ['contract:read', 'contract_change:read'] },
  { key: 'finance', label: '财务', perms: ['finance:read', 'collection:read'] },
  { key: 'gallery', label: '图库', perms: ['project_log:read'] },
  { key: 'files', label: '文件', perms: ['project_file:read'] },
];

const canSeeTab = (def) => !def.perms.length || def.perms.some((p) => userStore.canSee(p));

// 文件 tab 内「+ 上传文件」按钮：只有写权限才显示（后端上传接口要求 project_file:write）
const canUploadFile = computed(() => userStore.canSee('project_file:write'));

const tabs = computed(() =>
  TAB_DEFS.filter(canSeeTab).map((def) => ({
    key: def.key,
    label: def.label,
    badge:
      def.key === 'logs' ? logs.value.length || null
      : def.key === 'inspect' ? issues.value.length || null
      : def.key === 'accept' ? acceptances.value.length || null
      : def.key === 'material' ? matAccepts.value.length || null
      : def.key === 'dispatch' ? dispatches.value.length || null
      : def.key === 'finance' ? collectionRecords.value.filter((r) => r.status !== 'confirmed').length || null
      : null,
  }))
);

// 权限变更 / 数据异步到位后，若当前 tab 已不可见，自动回落到第一个可见 tab
// ⚠️ 必须在 onMounted 里注册：watch 注册时会立即求值一次 source（拿到 tabs），
//    而 tabs 里引用的 logs / issues / acceptances / dispatches / collectionRecords
//    都在本文件下方才声明。在 setup 顶层注册会在小程序端直接抛
//    TypeError: Cannot read properties of undefined (reading 'value')。
onMounted(() => {
  watch(
    tabs,
    (list) => {
      if (!list.length) return;
      if (!list.some((t) => t.key === curTab.value)) curTab.value = list[0].key;
    },
    { immediate: true }
  );
});

// 日志列表（从API加载）
const logs = ref([]);
const logsLoading = ref(false);

// 巡检问题列表（从API加载）
const issues = ref([]);
const issuesLoading = ref(false);

// 验收记录列表（从API加载）
const acceptances = ref([]);
const acceptancesLoading = ref(false);

const dispatches = ref([]);
// 主材验收记录（v2.4.1，替代原来那个从未赋值的 materials 空壳）
const matAccepts = ref([]);
const matAcceptsLoading = ref(false);
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
  return records.sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
});

const financeIncome = computed(() =>
  collectionRecords.value
    .filter(r => r.status === 'confirmed')
    .reduce((s, r) => s + Number(r.amount || 0), 0)
);

const financeExpense = computed(() =>
  financeRecords.value.reduce((s, r) => s + Number(r.amount || 0), 0)
);

const financeSummary = ref({
  contract_amount: 0,
  change_total: 0,        // 增减合计 = increase_total - decrease_total（正数=净增，负数=净减）
  actual_receivable: 0   // 实际应收 = 合同金额 + 增减合计
});
const collectionRecords = ref([]);
const collectionModal = ref({ visible: false, data: {} });
const changeFilter = ref('all'); // 应收统计 tab 的增减项过滤：all / increase / decrease

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
const galleryPhotos = ref([]);
const loadGalleryStats = async () => {
  if (!projectId.value) return;
  // 无 project_log:read 时不要发请求（后端按项目范围放行，但图库 tab 已隐藏，没必要拉数据）
  if (!userStore.canSee('project_log:read')) return;
  try {
    const res = await uni.request({ url: `/api/project-gallery?project_id=${projectId.value}` });
    if (res.data?.list) {
      // 2026-10-12 修复：原代码用 `item.count`，但 /api/project-gallery 返回的是每张照片
      // 一个 item（{url, category, date, desc}），根本没有 count 字段。
      // `undefined + 1 = NaN`，前端模板 `{{ NaN || 0 }}` = 0，所以所有分类都显示 0 张。
      // 现改为按"每张照片 +1"累加。
      const stats = {};
      for (const item of res.data.list) {
        stats[item.category] = (stats[item.category] || 0) + 1;
      }
      galleryStats.value = stats;
      galleryPhotos.value = (res.data.list || []).map((x) => ({ ...x, url: absAsset(x.url) }));
    }
  } catch (e) { console.error('loadGalleryStats', e); }
};

// 最新 20 张缩略图（按后端返回顺序，已按时间倒序）
const latestGalleryPhotos = computed(() => galleryPhotos.value.slice(0, 20));

// 缩略图点击：调用 uni.previewImage 全屏预览（支持左右滑动）
const previewGalleryImage = (idx, list) => {
  const urls = (list || []).map(p => p.url);
  if (!urls.length) return;
  uni.previewImage({ urls, current: idx });
};

// ==================== 项目文件（v2.3.4）====================
const projectFiles = ref([]);
const FILE_CATS = [
  { key: 'contract', label: '合同', icon: '📄' },
  { key: 'design_cad', label: '设计图', icon: '📐' },
  { key: 'design_render', label: '效果图', icon: '🖼️' },
  { key: 'point_layout', label: '点位图', icon: '🔌' },
  { key: 'construction_drawing', label: '施工图', icon: '📏' },
  { key: 'quote', label: '报价单', icon: '💵' },
  { key: 'change_order', label: '变更签证', icon: '✏️' },
  { key: 'other', label: '其他', icon: '📎' },
];
const fileCatMap = FILE_CATS.reduce((m, c) => { m[c.key] = c; return m; }, {});

const loadProjectFiles = async () => {
  if (!projectId.value) return;
  // 无 project_file:read 时后端 /api/project-files 会 403，直接跳过以免控制台报错
  if (!userStore.canSee('project_file:read')) return;
  try {
    const res = await uni.request({ url: `/api/project-files?project_id=${projectId.value}` });
    if (res.data && Array.isArray(res.data.list)) {
      projectFiles.value = res.data.list;
    }
  } catch (e) {
    console.error('loadProjectFiles', e);
  }
};

const recentFiles = computed(() => projectFiles.value.slice(0, 5));

const fileCatStats = computed(() => {
  const counts = {};
  projectFiles.value.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });
  return FILE_CATS.map((c) => ({ ...c, count: counts[c.key] || 0 }));
});

const fileCatLabel = (key) => (fileCatMap[key] ? fileCatMap[key].label : key);
const fileStatusText = (s) => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝', revoked: '已撤销' }[s] || s);
const fileStatusColor = (s) => ({ pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444', revoked: '#9CA3AF' }[s] || '#6B7280');
const fileThumbIcon = (ext) => {
  const e = (ext || '').toLowerCase();
  if (['pdf'].includes(e)) return '📕';
  if (['doc','docx'].includes(e)) return '📘';
  if (['xls','xlsx'].includes(e)) return '📗';
  if (['ppt','pptx'].includes(e)) return '📙';
  if (['dwg','dxf'].includes(e)) return '📐';
  if (['zip','rar'].includes(e)) return '🗜️';
  if (['jpg','jpeg','png','gif','webp'].includes(e)) return '🖼';
  return '📎';
};
// 分类图标底色（柔和色系，按分类固定）
const catBg = (key) => ({
  contract: '#FEE2E2',
  design_cad: '#DBEAFE',
  design_render: '#FCE7F3',
  point_layout: '#FEF3C7',
  construction_drawing: '#D1FAE5',
  quote: '#E0E7FF',
  change_order: '#FFEDD5',
  other: '#F1F5F9',
}[key] || '#F1F5F9');

// 文件类型图标底色（按扩展名）
const fileExtBg = (ext) => {
  const e = (ext || '').toLowerCase();
  if (e === 'pdf') return '#FEE2E2';
  if (['doc', 'docx'].includes(e)) return '#DBEAFE';
  if (['xls', 'xlsx', 'csv'].includes(e)) return '#D1FAE5';
  if (['ppt', 'pptx'].includes(e)) return '#FEF3C7';
  if (['dwg', 'dxf'].includes(e)) return '#EDE9FE';
  if (['zip', 'rar', '7z'].includes(e)) return '#E2E8F0';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(e)) return '#FCE7F3';
  return '#F1F5F9';
};

// 审核状态样式（软底 + 深字 pill）
const fileStatusStyle = (s) => ({
  pending:    { background: '#FEF3C7', color: '#B45309' },
  approved:   { background: '#D1FAE5', color: '#047857' },
  rejected:   { background: '#FEE2E2', color: '#B91C1C' },
  revoked:    { background: '#F1F5F9', color: '#64748B' },
}[s] || { background: '#F1F5F9', color: '#64748B' });

const formatRecentTime = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(/-/g, '/'));
  const m = d.getMonth() + 1, day = d.getDate();
  return `${m}-${day} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const goFilesList = (catKey) => uni.navigateTo({
  url: `/pages/files/list?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}${catKey ? '&category=' + catKey : ''}`,
});
const goFilesUpload = () => uni.navigateTo({
  url: `/pages/files/upload?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}`,
});
const goFileDetail = (id) => uni.navigateTo({ url: `/pages/files/detail?id=${id}` });

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
      return parsed.filter(p => p && p.trim()).map(absAsset);
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
    if (Array.isArray(parsed)) return parsed.filter(p => p && p.trim()).map(absAsset);
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

// 巡检状态文字（口径与业务流程统一：待处理 → 处理中 → 已完成）
const getIssueStatusText = (issue) => {
  const s = issue.rectify_status || issue.status || '';
  if (s === '待处理' || s === '待整改') return '⏳ 待处理';
  if (s === '处理中' || s === '整改中') return '🔧 处理中';
  if (s === '待验收') return '👀 待验收';
  if (s === '已完成') return '✅ 已完成';
  return '⏳ 待处理';
};

// 状态 → ASCII 类名后缀
// ⚠️ 类名里不能出现中文：构建会把 .status-待整改 转义成 .status-\5f85\6574\6539，
// 微信 WXSS 编译器遇到反斜杠转义直接报编译错误。所以这里统一映射成英文。
const statusSlug = (issue) => {
  const s = (issue && (issue.rectify_status || issue.status)) || '';
  const map = {
    '待整改': 'pending', '待处理': 'pending', pending: 'pending',
    '整改中': 'fixing', '处理中': 'fixing', fixing: 'fixing',
    '待验收': 'review',
    '已完成': 'done', completed: 'done',
  };
  return map[s] || 'pending';
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

// v2.4.1：material/list（主材台账）在项目内已无入口，用户确认暂无实际用途。
// 台账仍可从首页「主材管理 → 采购申请列表」/ PC 端进入，这里不再保留跳转函数。

const goFinance = () => {
  uni.navigateTo({ url: `/pages/finance/add?projectId=${projectId.value}` });
};

const goPurchaseAdd = () => {
  uni.navigateTo({ url: `/pages/purchase/add?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}` });
};

// v2.3.6 hotfix 10-15：合同金额优先用 loadFinanceData 的 financeSummary（接口口径已修复），
// 否则回退到 contractList 计算。改前：直接读 contractList.value（contracts 表里 project_id 全 NULL）→ 合同金额 0 → 总价变成 增减项净额（负数）。
const contractSummary = computed(() => {
  // 增减项（来自 contract_changes 表，数据完整）
  const changeAmt = changeList.value
    .filter(ch => ch.status === 'approved')
    .reduce((s, ch) => {
      return s + (ch.change_type === 'increase' ? Number(ch.amount || 0) : -Number(ch.amount || 0));
    }, 0);
  // 合同金额：优先用 financeSummary（已修好），否则用 contractList 兜底
  const contractAmtFromFinance = Number(financeSummary.value?.contract_amount || 0);
  const contractAmtFromList = contractList.value
    .filter(c => c.review_status === 'approved')
    .reduce((s, c) => s + Number(c.contract_amount || 0), 0);
  const contractAmt = contractAmtFromFinance > 0 ? contractAmtFromFinance : contractAmtFromList;
  return {
    contract: contractAmt,
    change: changeAmt,
    total: contractAmt + changeAmt,
  };
});

// 应收统计 tab 用的细分计算（基于 changeList）
const increaseCount = computed(() => changeList.value.filter(c => c.change_type === 'increase').length);
const decreaseCount = computed(() => changeList.value.filter(c => c.change_type === 'decrease').length);
const filteredChanges = computed(() => {
  let arr = changeList.value;
  if (changeFilter.value === 'increase') arr = arr.filter(c => c.change_type === 'increase');
  if (changeFilter.value === 'decrease') arr = arr.filter(c => c.change_type === 'decrease');
  // 按"审核时间/提交时间"倒序：最新的在最上面（大王指示）
  return arr.slice().sort((a, b) => {
    const ta = toDate(a.reviewed_at || a.submitted_at || a.created_at || 0).getTime();
    const tb = toDate(b.reviewed_at || b.submitted_at || b.created_at || 0).getTime();
    return tb - ta;
  });
});

// 应收统计 tab 明细列表的「时间」字段格式化（优先审核时间，其次提交/更新时间）
const formatChangeTime = (ch) => {
  const t = ch.reviewed_at || ch.submitted_at || ch.updated_at || ch.created_at;
  if (!t) return '—';
  try { return String(t).replace('T', ' ').substring(0, 16); } catch { return String(t); }
};

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
  // 权限统一走 store（管理员直通，数据源与 /api/me 一致）
  await userStore.fetchMe();
  canApproveContract.value = userStore.can('contract:approve') || userStore.can('project_contract:approve');
};

const canApproveChange = ref(false);

const checkChangeApprovePermission = async () => {
  await userStore.fetchMe();
  canApproveChange.value = userStore.can('contract_change:approve');
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
  // 小程序无 location，统一用 absAsset 补绝对地址（H5 下同源相对路径也能正确解析）
  const fullUrl = absAsset(url);
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

// ===== 节点状态：列表内直接改（滚轮）=====
const statusOptions = [
  { name: '待开始', value: 'pending' },
  { name: '进行中', value: 'in_progress' },
  { name: '已完成', value: 'completed' },
  { name: '已跳过', value: 'skipped' },
];

const wheel = ref({ visible: false, title: '', current: '', node: null, display: '' });

// 与 PC 端 Projects.vue 的 isFirstPending 保持一致：
// 前面节点全部完成/跳过时，第一个「待开始」节点在视觉上视为「进行中」（仅显示，不写库）
const isFirstPending = (nodes, index) => {
  for (let i = 0; i < index; i++) {
    if (nodes[i].status !== 'completed' && nodes[i].status !== 'skipped') return false;
  }
  return true;
};

const displayStatus = (node, idx) => {
  if (node.status === 'pending' && isFirstPending(project.value.nodes || [], idx)) return 'in_progress';
  return node.status;
};

const openWheel = (node, idx) => {
  const shown = displayStatus(node, idx);
  wheel.value = {
    visible: true,
    title: node.node_name || node.stage_name || '节点状态',
    current: shown,
    display: shown,
    node,
  };
};

const onWheelConfirm = async (item) => {
  const cur = wheel.value;
  wheel.value = { ...cur, visible: false };
  if (!cur.node || !item) return;
  // 没改动选择 → 不写库（自动推进只是显示效果，不落库）
  if (item.value === cur.display) return;
  await applyNodeStatus(cur.node, item.value);
};

const applyNodeStatus = async (node, status) => {
  const token = uni.getStorageSync('token');
  // 与 PC 端一致：标记完成时询问是否发送服务通知短信
  let sendSms = false;
  if (status === 'completed') {
    sendSms = await new Promise((resolve) => {
      uni.showModal({
        title: '节点完成',
        content: '是否发送服务通知短信？',
        // 微信小程序按钮文案上限 4 个字
        confirmText: '发送短信',
        cancelText: '仅保存',
        success: (m) => resolve(!!m.confirm),
        fail: () => resolve(false),
      });
    });
  }
  try {
    await uni.request({
      url: `/api/project-stages/${node.id}`,
      method: 'PUT',
      header: { Authorization: token },
      data: {
        status,
        actual_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null,
      },
    });

    if (sendSms) {
      try {
        const r = await uni.request({
          url: '/api/sms-send',
          method: 'POST',
          header: { Authorization: token },
          data: { node_id: node.id, project_id: projectId.value },
        });
        const d = r.data || {};
        if (d.status === 'success') {
          uni.showToast({ title: '短信已发送', icon: 'success' });
        } else {
          uni.showModal({
            title: '短信未发送',
            content: (d.message || '未知原因') + '\n\n请检查：\n1. 系统设置 → 阿里云短信配置\n2. 节点是否绑定了短信模板\n3. 客户手机号是否填写',
            showCancel: false,
            confirmText: '知道了',
          });
        }
      } catch (smsErr) {
        uni.showToast({ title: '短信发送失败', icon: 'none' });
      }
    } else {
      uni.showToast({ title: '状态已更新', icon: 'success' });
    }

    // 写项目日志（后端按 action_type=node_* 判定，不再额外推「项目新进展」消息）
    try {
      await uni.request({
        url: '/api/project-logs',
        method: 'POST',
        header: { Authorization: token },
        data: {
          project_id: projectId.value,
          stage_id: node.id,
          action_type: status === 'completed' ? 'node_completed' : 'node_updated',
          content: `节点「${node.node_name || node.stage_name}」状态变更为「${getNodeStatusText(status)}」${sendSms ? '（已发短信）' : ''}`,
        },
      });
    } catch (logErr) {}

    await fetchDetail();
  } catch (e) {
    uni.showToast({ title: '操作失败', icon: 'none' });
  }
};

const loadFinanceData = async () => {
  if (!projectId.value) return;
  try {
    const token = uni.getStorageSync('token');
    // 加载应收统计
    const summaryRes = await uni.request({ url: `/api/finance/summary?project_id=${projectId.value}`, header: { Authorization: token } });
    if (summaryRes.data) {
      const incT = Number(summaryRes.data.increase_total || 0);
      const decT = Number(summaryRes.data.decrease_total || 0);
      financeSummary.value = {
        contract_amount: Number(summaryRes.data.contract_amount || 0),
        change_total: incT - decT,
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

// ⚠️ 兼容旧版后端：v2.6.0 及更早的 /api/projects/:id 只返回项目主体，
//    不附带 nodes / progress / current_node_name（只有列表接口 /api/projects 才拼这三个字段）。
//    后端若未升级，直接改用单条接口会让「进度节点」tab 变空白。
//    这里兜底回退到列表接口取该项目的节点，后端升级后 Array.isArray(data.nodes) 为真，自然不再触发。
const fetchNodesFallback = async () => {
  try {
    const token = uni.getStorageSync('token');
    const res = await uni.request({
      url: '/api/projects',
      header: {
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),
      },
    });
    const list = res.data;
    if (!Array.isArray(list)) return;
    const found = list.find((p) => Number(p.id) === Number(projectId.value));
    if (!found) return;
    project.value = {
      ...project.value,
      nodes: found.nodes || [],
      progress: found.progress,
      current_node_name: found.current_node_name,
    };
  } catch (e) {
    console.warn('节点兜底加载失败:', e);
  }
};

const fetchDetail = async () => {
  try {
    uni.showLoading({ title: "加载中..." });
    const token = uni.getStorageSync("token");
    const res = await uni.request({
      // v2.6.1：改为按 id 拉单条。原来拉 /api/projects 全量列表再 find，
      // 项目多时（read_all 角色能看到全部）要传几百 KB JSON，小程序解析慢，
      // 是"点开项目详情慢"的主因。单条接口字段与列表一致（同样的 SELECT p.* + 4 个 JOIN）。
      url: `/api/projects/${projectId.value}`,
      header: {
        Authorization: token,
        'x-user-role': userStore.state.role_name,
        'x-user-id': String(userStore.state.id),
      },
    });
    uni.hideLoading();
    const data = res.data;
    if (data && !data.error && data.id) {
      project.value = data;
      // 旧版后端不返回 nodes → 回退列表接口补齐，否则进度节点 tab 空白
      if (!Array.isArray(data.nodes)) {
        await fetchNodesFallback();
      }
    }
    // 加载日志、巡检、派工
    // ⚠️ 必须按 tab 权限守卫：tabs 已被 canSeeTab 过滤，但没有权限的 tab 数据若照样请求，
    //    后端会按 RBAC 直接回 403（例：财务角色无 acceptance:read，进项目详情就报
    //    GET /api/acceptance?project_id=x 403）。既刷错误又白白多几个必失败的请求。
    if (userStore.canSee('project_log:read')) fetchLogs();
    if (userStore.canSee('inspection:read')) fetchInspections();
    if (userStore.canSee('acceptance:read')) fetchAcceptances();
    if (userStore.canSee('purchase:read')) loadPurchase();
    if (userStore.canSee('dispatch:read')) loadDispatches();
    if (userStore.canSee('finance:read') || userStore.canSee('collection:read')) loadFinanceData();
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
      // v2.3.6 hotfix 10-15：去掉"过滤掉无内容的"前端 filter，保持与 PC 端一致
      // 之前：filter(log => log.content) → 只显示有 content 的（id=63 全空、id=66 有图无文都被过滤）
      // 现在：显示所有日志，空 section 由 template 的 v-if="log.content" 自动隐藏
      logs.value = res.data;
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

// 加载验收记录（2026-10-30 改走新验收单接口，旧 acceptance 表在移动端不再展示）
const fetchAcceptances = async () => {
  if (!projectId.value) return;
  // 无 acceptance:read 的角色（如财务）后端会 403，直接跳过，不发必失败的请求
  if (!userStore.canSee('acceptance:read')) {
    acceptances.value = [];
    acceptancesLoading.value = false;
    return;
  }
  acceptancesLoading.value = true;
  try {
    const res = await uni.request({
      url: `/api/acceptance-sheets?project_id=${projectId.value}`,
      header: authHeader(),
    });
    const d = res.data || {};
    acceptances.value = Array.isArray(d.list) ? d.list : [];
  } catch (e) {
    console.error('加载验收失败:', e);
    acceptances.value = [];
  } finally {
    acceptancesLoading.value = false;
  }
};

// 验收附件图片（新接口 photos 为 JSON 字符串数组，统一补绝对地址）
const getAcceptPhotos = (a) => {
  if (!a || !a.photos) return [];
  try {
    let p = a.photos;
    if (typeof p === 'string') p = JSON.parse(p);
    return Array.isArray(p) ? p.filter((x) => x && String(x).trim()).map(absAsset) : [];
  } catch { return []; }
};

const previewAcceptPhoto = (a, idx) => {
  const photos = getAcceptPhotos(a);
  uni.previewImage({ urls: photos, current: photos[idx] });
};

const resultLabel = (r) => ({ pass: '合格', fail: '不合格', rectify: '整改中', pending: '未完成' }[r] || r || '');

const goAcceptAdd = () => {
  uni.navigateTo({ url: `/pages/acceptance/types?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}` });
};

const goAcceptDetail = (a) => {
  uni.navigateTo({ url: `/pages/acceptance/report?id=${a.id}` });
};

// ===== 主材验收（v2.4.1）=====
const fetchMatAccepts = async () => {
  if (!projectId.value) return;
  matAcceptsLoading.value = true;
  try {
    const res = await uni.request({
      url: `/api/material-acceptances?project_id=${projectId.value}`,
      header: { Authorization: uni.getStorageSync("token") },
    });
    const d = res.data || {};
    const rows = Array.isArray(d) ? d : (Array.isArray(d.list) ? d.list : []);
    matAccepts.value = rows;
  } catch (e) {
    console.error('加载主材验收失败:', e);
    matAccepts.value = [];
  } finally {
    matAcceptsLoading.value = false;
  }
};

// 照片字段是 JSON 字符串数组，且要过 absAsset（小程序/App 补域名）
const getMatPhotos = (m) => {
  if (!m || !m.photos) return [];
  try {
    let p = m.photos;
    if (typeof p === 'string') p = JSON.parse(p);
    if (typeof p === 'string') p = JSON.parse(p);
    return Array.isArray(p) ? p.filter((x) => x && String(x).trim()).map(absAsset) : [];
  } catch { return []; }
};

const previewMatPhoto = (m, idx) => {
  const photos = getMatPhotos(m);
  uni.previewImage({ urls: photos, current: photos[idx] });
};

const goMatAcceptAdd = () => {
  uni.navigateTo({
    url: `/pages/material-accept/add?projectId=${projectId.value}&projectName=${encodeURIComponent(project.value.name || '')}`,
  });
};

const goMatAcceptDetail = (m) => {
  uni.navigateTo({ url: `/pages/material-accept/detail?id=${m.id}` });
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
  // 2026-10-23：支持 ?tab=xxx 直达指定 tab —— 待办中心「催收未确认收款」点进来
  //   直接落到财务收支（待确认催收列表），不用用户自己再找。
  //   若该 tab 被权限过滤掉，上面 onMounted 注册的 tabs watch 会自动回落到第一个可见 tab。
  if (options.tab) curTab.value = String(options.tab);
  if (projectId.value) {
    fetchDetail();
    loadContracts();
    loadChanges();
    checkContractApprovePermission();
    checkChangeApprovePermission();
  }
});

// #ifdef H5
// 仅在 H5 有效：从后台切回前台时刷新合同/变更列表。
// 小程序/App 没有 document，直接用 onShow 生命周期替代（见下方 onShow）。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && projectId.value) {
    loadContracts();
    loadChanges();
    checkContractApprovePermission();
    checkChangeApprovePermission();
  }
});
// #endif

// 小程序 / App 没有 document.visibilitychange，用页面 onShow 替代：
// 从其他页面返回时刷新合同/变更列表。首次进入 projectId 仍为 0，自动跳过，避免重复请求。
onShow(() => {
  if (projectId.value) {
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
    loadGalleryStats(); // 一次调用同时刷新分类统计 + 缩略图全量
  }
  if (val === 'accept' && projectId.value) {
    fetchAcceptances();
  }
  if (val === 'material' && projectId.value) {
    fetchMatAccepts();
  }
  if (val === 'files' && projectId.value) {
    loadProjectFiles();
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
.node-status-pill.n-skipped { background: #F3F4F6; color: #9CA3AF; }

/* 状态可点：点击弹滚轮直接改 */
.node-status-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
}
.pill-caret {
  font-size: 10px;
  opacity: 0.65;
}

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

/* 应收统计 tab 内的 3 列总览（合同+增项+减项 / 应收+已收+未收） */
.finance-summary-3col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

/* 卡片底部说明文字（如「X 份已审核」「X 条已审核」） */
.finance-card-sub {
  display: block;
  font-size: 11px;
  color: #6B7280;
  margin-top: 4px;
}
.finance-card.expense .finance-card-sub { color: #B45309; }
.finance-card.income .finance-card-sub { color: #047857; }

/* 实际应收（蓝色主调） */
.finance-card.receivable-highlight {
  background: linear-gradient(135deg, #DBEAFE, #BFDBFE);
}
.finance-card.receivable-highlight .finance-card-label { color: #1E3A5F; }
.finance-card.receivable-highlight .finance-card-num { color: #1E3A5F; font-size: 18px; }

/* 增减项过滤 tab */
.change-filter {
  display: inline-flex;
  gap: 10px;
  font-size: 12px;
}
.change-filter text {
  padding: 4px 10px;
  border-radius: 14px;
  color: #6B7280;
  background: #F3F4F6;
}
.change-filter text.active {
  background: #1E3A5F;
  color: #fff;
  font-weight: 600;
}

/* 增减项类型徽章（➕ 增项 / ➖ 减项） */
.change-type-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.change-type-badge.badge-increase {
  background: #D1FAE5;
  color: #065F46;
}
.change-type-badge.badge-decrease {
  background: #FEE2E2;
  color: #991B1B;
}

/* 增减项明细卡片复用合同 tab 中的 change-card 样式（项目原本就有） */

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

/* 项目图库 tab 内的工具栏副标题 */
.panel-subtitle {
  font-size: 12px;
  color: #9CA3AF;
  margin-left: 8px;
}
.section-divider-sub {
  font-size: 12px;
  color: #1E3A5F;
  font-weight: 500;
}

/* 项目图库缩略图 4 列网格（最新 20 张） */
.gallery-thumbs-4col {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 0 12px 8px;
}
.thumb-cell {
  position: relative;
  aspect-ratio: 1;
  background: #F3F4F6;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}
.thumb-cell:active { transform: scale(0.97); }
.thumb-img {
  width: 100%;
  height: 100%;
  display: block;
}
.thumb-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.55));
  padding: 10rpx 6rpx 6rpx;
}
.thumb-cat {
  font-size: 10px;
  color: #fff;
  opacity: 0.9;
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

.status-pending { background: #FEF3C7; color: #D97706; }
.status-fixing { background: #EDE9FE; color: #7C3AED; }
.status-review { background: #DBEAFE; color: #2563EB; }
.status-done { background: #D1FAE5; color: #059669; }

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

/* ==================== 项目文件 tab（2026-10-20 美化） ==================== */
/* 概览卡片 */
.files-hero {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%);
  box-shadow: 0 6px 16px rgba(30, 58, 95, 0.22);
}
/* 装饰性圆形（右上/左下淡淡光晕） */
.files-hero-bg {
  position: absolute;
  right: -30px;
  top: -40px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.files-hero-row {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.files-hero-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.files-hero-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 1px;
}
.files-hero-count {
  font-size: 30px;
  font-weight: 700;
  color: #fff;
  line-height: 1.1;
}
.files-hero-unit {
  font-size: 14px;
  font-weight: 500;
  margin-left: 2px;
}
.files-hero-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.files-hero-btn {
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.files-hero-btn:active { background: rgba(255, 255, 255, 0.28); }
.files-hero-btn-text {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

/* 分类网格 4 列 */
.files-cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 4px;
}
.files-cat {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px 10px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.05);
}
.files-cat:active { transform: scale(0.96); }
.files-cat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.files-cat-emoji {
  font-size: 20px;
  line-height: 1;
}
.files-cat-name {
  font-size: 11px;
  color: #475569;
  line-height: 1.2;
  text-align: center;
}
.files-cat-count {
  position: absolute;
  top: 6px;
  right: 8px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: #1E3A5F;
  color: #fff;
  font-size: 10px;
  line-height: 17px;
  text-align: center;
  font-weight: 600;
}

/* 最近上传列表 */
.recent-files {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.recent-file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.05);
}
.recent-file:active { background: #F8FAFC; }
.recent-file-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.recent-file-emoji {
  font-size: 22px;
  line-height: 1;
}
.recent-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.recent-file-title {
  font-size: 14px;
  font-weight: 600;
  color: #1A1F36;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-file-meta {
  font-size: 11px;
  color: #94A3B8;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-file-status {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 20px;
  line-height: 1.2;
}

/* 底部操作栏 */
.files-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.files-action {
  flex: 1;
  height: 42px;
  line-height: 42px;
  text-align: center;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  background: #fff;
  color: #1E3A5F;
  border: 1px solid #E2E8F0;
}
.files-action:active { background: #F1F5F9; }
.files-action.primary {
  background: linear-gradient(135deg, #1E3A5F, #2D5A8E);
  color: #fff;
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
  font-weight: 600;
}
</style>
