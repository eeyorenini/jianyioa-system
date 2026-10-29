<template>
  <div class="purchase-requests">
    <!-- 页面头 -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">采购申请</h2>
        <p class="page-sub">
          申请 · 审核 · 报销 · 财务确认全流程跟踪 · 当前 <b>{{ total }}</b> 条记录
        </p>
      </div>
      <div class="page-head-right">
        <el-button class="btn-ghost" @click="loadData">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
        <el-button v-if="activeTab === 'my'" class="btn-add" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>提交采购申请</span>
        </el-button>
      </div>
    </div>

    <!-- 视图切换（胶囊） -->
    <div class="tab-bar">
      <div
        v-for="tab in visibleTabs"
        :key="tab.key"
        class="tab-chip"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        <span class="chip-text">{{ tab.label }}</span>
        <span v-if="tab.badge" class="chip-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 列表卡片 -->
    <div class="table-card">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <!-- 「财务确认」tab 用自己的视图切换：默认只看待办，已完成的收进「已报销」 -->
        <div v-if="activeTab === 'finance'" class="filter-item">
          <span class="filter-label">视图</span>
          <el-radio-group v-model="financeFilter" @change="onFinanceFilterChange">
            <el-radio-button label="pending" value="pending">待上传回执</el-radio-button>
            <el-radio-button label="done" value="done">已报销</el-radio-button>
            <el-radio-button label="all" value="all">全部</el-radio-button>
          </el-radio-group>
        </div>
        <div v-else class="filter-item">
          <span class="filter-label">状态</span>
          <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width:140px;" @change="loadData">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="报销中" value="reimbursing" />
            <el-option label="受理中" value="finance_confirmed" />
            <el-option label="已报销" value="reimbursed" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">关键字</span>
          <el-input
            v-model="keyword"
            class="kw-input"
            placeholder="项目名称 / 申请人"
            clearable
            @clear="loadData"
            @keyup.enter="loadData"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>

        <el-button class="btn-search" type="primary" @click="loadData">搜索</el-button>
        <div class="filter-result">筛选结果 <b>{{ total }}</b> 条</div>
      </div>

      <!-- 表格 -->
      <el-table
        :data="list"
        class="pr-table"
        style="width:100%"
        v-loading="loading"
        row-key="id"
        @row-click="openDetail"
      >
        <el-table-column label="项目 / 单号" min-width="210">
          <template #default="{ row }">
            <div class="proj-cell">
              <div class="proj-icon">🧾</div>
              <div class="proj-main">
                <div class="proj-name">{{ row.project_name || '-' }}</div>
                <div class="proj-sub">采购申请 #{{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="申请人" width="132">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="avatar" :style="{ background: avatarBg(row.applicant_name) }">
                {{ firstChar(row.applicant_name) }}
              </div>
              <span class="user-name">{{ row.applicant_name || '-' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="申请金额" width="132" align="right">
          <template #default="{ row }">
            <span class="amount">¥{{ formatNumber(row.total_amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="实付金额" width="132" align="right">
          <template #default="{ row }">
            <span v-if="row.actual_amount > 0" class="amount paid">¥{{ formatNumber(row.actual_amount) }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <span class="status-pill" :class="statusMeta(row.status).cls">
              <span class="dot"></span>{{ statusMeta(row.status).text }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="150">
          <template #default="{ row }">
            <span class="remark-text" :title="row.remark || ''">{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="申请时间" width="150">
          <template #default="{ row }">
            <div class="time-cell">
              <div class="time-date">{{ datePart(row.created_at) }}</div>
              <div class="time-hm">{{ timePart(row.created_at) }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button class="btn-link" link @click.stop="openDetail(row)">详情</el-button>
            <el-button
              v-if="activeTab === 'my' && (row._isAdmin || row._isApplicant) && (row.status === 'pending' || row.status === 'rejected')"
              class="btn-link danger" link @click.stop="deleteRow(row)"
            >删除</el-button>
            <el-button v-if="row._canApprove && row.status === 'pending'" class="btn-action" size="small" @click.stop="showApproveDialog(row)">审核</el-button>
            <el-button v-if="row._isApplicant && row.status === 'approved'" class="btn-action" size="small" @click.stop="showReimburseDialog(row)">上传报销</el-button>
            <el-button v-if="row._canFinance && row.status === 'reimbursing'" class="btn-action" size="small" @click.stop="showFinanceAcceptDialog(row)">财务受理</el-button>
            <el-button v-if="row._canFinance && row.status === 'finance_confirmed'" class="btn-action" size="small" @click.stop="showFinanceConfirmDialog(row)">上传回执</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <div class="empty-icon">🧾</div>
            <div class="empty-title">暂无采购申请</div>
            <div class="empty-sub">{{ activeTab === 'my' ? '点击右上角「提交采购申请」发起第一笔申请' : '当前视图下没有待处理的单据' }}</div>
          </div>
        </template>
      </el-table>

      <div v-if="total > 0" class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total,sizes,prev,pager,next"
          @current-change="loadData"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="采购申请详情" size="640px" class="pr-drawer">
      <template v-if="detail">
        <!-- 摘要 -->
        <div class="detail-hero" :class="'hero-' + statusMeta(detail.status).cls.replace('st-', '')">
          <div class="hero-top">
            <span class="status-pill" :class="statusMeta(detail.status).cls">
              <span class="dot"></span>{{ statusMeta(detail.status).text }}
            </span>
            <span class="hero-id">#{{ detail.id }}</span>
          </div>
          <div class="hero-proj">{{ detail.project_name || '-' }}</div>
          <div class="hero-amount">
            <span class="hero-amount-label">申请金额</span>
            <span class="hero-amount-value">¥{{ formatNumber(detail.total_amount) }}</span>
          </div>
        </div>

        <!-- 关键信息 -->
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">申请人</div>
            <div class="info-value">{{ detail.applicant_name || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">申请时间</div>
            <div class="info-value">{{ detail.created_at || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">实付金额</div>
            <div class="info-value" :class="{ 'paid-text': detail.actual_amount > 0 }">
              {{ detail.actual_amount > 0 ? '¥' + formatNumber(detail.actual_amount) : '—' }}
            </div>
          </div>
          <div class="info-item">
            <div class="info-label">采购明细</div>
            <div class="info-value">{{ (detail.items || []).length }} 项</div>
          </div>
        </div>

        <div class="detail-block">
          <div class="block-label"><span class="block-bar"></span>备注</div>
          <div class="block-text">{{ detail.remark || '无' }}</div>
        </div>

        <div v-if="detail.status === 'rejected' && detail.rejection_reason" class="reject-box">
          <div class="reject-title">⛔ 拒绝原因</div>
          <div class="reject-text">{{ detail.rejection_reason }}</div>
        </div>

        <!-- 采购明细 -->
        <div class="detail-block">
          <div class="block-label">
            <span class="block-bar"></span>采购明细
            <span class="block-tip">{{ (detail.items || []).length }} 项</span>
          </div>
          <el-table :data="detail.items" size="small" class="item-table">
            <el-table-column prop="material_name" label="材料名称" min-width="130" />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="quantity" label="数量" width="70" align="right" />
            <el-table-column prop="unit_price" label="单价" width="100" align="right">
              <template #default="{ row }">¥{{ formatNumber(row.unit_price) }}</template>
            </el-table-column>
            <el-table-column prop="total_price" label="合计" width="110" align="right">
              <template #default="{ row }">
                <span class="item-total">¥{{ formatNumber(row.total_price) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 报销凭证 -->
        <template v-if="detail.reimbursement">
          <div class="detail-block">
            <div class="block-label">
              <span class="block-bar"></span>报销凭证
              <span class="block-tip">{{ reimburseImages.length }} 张</span>
            </div>
            <div v-if="reimburseImages.length > 0" class="detail-images">
              <el-image
                v-for="(img, idx) in reimburseImages"
                :key="idx"
                :src="img"
                :preview-src-list="reimburseImages"
                :preview-index="idx"
                fit="cover"
                class="detail-img"
              />
            </div>
            <div v-else class="block-text muted">暂无凭证图片</div>

            <div class="info-grid" style="margin-top:10px;">
              <div class="info-item">
                <div class="info-label">实付金额</div>
                <div class="info-value paid-text">¥{{ formatNumber(detail.reimbursement.actual_amount) }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">确认人</div>
                <div class="info-value">{{ detail.reimbursement.confirmed_by_name || '—' }}</div>
              </div>
            </div>
            <div class="block-text" style="margin-top:10px;">
              <span class="muted">财务备注：</span>{{ detail.reimbursement.financial_notes || '无' }}
            </div>
          </div>
        </template>

        <!-- 操作按钮 -->
        <div class="drawer-actions">
          <el-button v-if="detail._isApplicant && detail.status === 'rejected'" class="btn-save" type="primary" @click="handleResubmit">重新提交</el-button>
          <el-button v-if="detail._isApplicant && detail.status === 'approved'" class="btn-save" type="primary" @click="showReimburseDialog(detail)">上传报销单</el-button>
          <el-button v-if="detail._canApprove && detail.status === 'pending'" class="btn-save" type="primary" @click="showApproveDialog(detail)">审核</el-button>
          <el-button v-if="detail._canFinance && detail.status === 'reimbursing'" class="btn-save" type="primary" @click="showFinanceAcceptDialog(detail)">财务受理</el-button>
          <el-button v-if="detail._canFinance && detail.status === 'finance_confirmed'" class="btn-save" type="primary" @click="showFinanceConfirmDialog(detail)">上传回执</el-button>
          <el-button v-if="detail._isApplicant && detail.status === 'pending'" class="btn-reject" @click="handleDelete">删除</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 新建申请弹窗 -->
    <el-dialog v-model="createVisible" width="760px" class="pr-dialog" :close-on-click-modal="false">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🧾</div>
          <div>
            <div class="dlg-head-title">提交采购申请</div>
            <div class="dlg-head-sub">选择项目与采购明细，提交后进入审核流程</div>
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="88px" ref="formRef" class="pr-form">
        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>关联项目</div>
          <el-form-item label="关联项目" required>
            <el-select v-model="form.project_id" placeholder="请选择项目" filterable style="width:100%;" @change="onProjectChange">
              <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <!-- 选择器只返回「我关联的项目」，一个都没有时给出明确原因，避免用户以为页面坏了 -->
            <div v-if="!projectList.length" class="picker-empty-tip">
              你没有关联任何项目，暂时无法选择。请联系管理员把你加到对应项目（设计师 / 监理 / 项目经理 / 工长）。
            </div>
          </el-form-item>
        </div>

        <div class="form-section">
          <div class="section-title">
            <span class="section-bar"></span>采购明细
            <span class="section-tip">{{ form.items.length }} 项</span>
          </div>
          <div class="item-toolbar">
            <el-button class="btn-mini" size="small" @click="showMaterialPicker">
              <el-icon><Plus /></el-icon><span>从主材库选择</span>
            </el-button>
            <el-button class="btn-mini ghost" size="small" @click="addFreeItem">手动添加</el-button>
          </div>

          <el-table :data="form.items" size="small" class="item-table editable">
            <el-table-column prop="material_name" label="材料名称" min-width="130">
              <template #default="{ row }">
                <el-input v-model="row.material_name" placeholder="名称" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="unit" label="单位" width="86">
              <template #default="{ row }"><el-input v-model="row.unit" placeholder="单位" size="small" /></template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="96">
              <template #default="{ row }"><el-input-number v-model="row.quantity" :min="0" controls-position="right" size="small" style="width:100%;" /></template>
            </el-table-column>
            <el-table-column prop="unit_price" label="单价" width="112">
              <template #default="{ row }"><el-input-number v-model="row.unit_price" :min="0" :precision="2" controls-position="right" size="small" style="width:100%;" /></template>
            </el-table-column>
            <el-table-column prop="total_price" label="合计" width="104" align="right">
              <template #default="{ row }">
                <span class="item-total">¥{{ formatNumber((row.quantity || 0) * (row.unit_price || 0)) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="64" align="center">
              <template #default="{ $index }">
                <el-button class="btn-link danger" link @click="removeItem($index)">删除</el-button>
              </template>
            </el-table-column>

            <template #empty>
              <div class="empty-state small">
                <div class="empty-title">还没有采购明细</div>
                <div class="empty-sub">从主材库选择，或手动添加一行</div>
              </div>
            </template>
          </el-table>

          <div class="total-bar">
            <span class="total-label">合计金额</span>
            <span class="total-value">¥{{ formatNumber(totalAmount) }}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>备注</div>
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" resize="none" placeholder="选填，可说明采购用途、到货时间等" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="createVisible = false">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="submitting" @click="handleSubmit">提交申请</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 主材选择弹窗 -->
    <el-dialog v-model="materialPickerVisible" width="740px" class="pr-dialog">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">📦</div>
          <div>
            <div class="dlg-head-title">选择主材</div>
            <div class="dlg-head-sub">点击任意一行即可加入采购明细</div>
          </div>
        </div>
      </template>

      <div class="filter-bar inner">
        <div class="filter-item">
          <span class="filter-label">材料</span>
          <el-input v-model="materialKeyword" class="kw-input" placeholder="搜索材料名称" clearable @keyup.enter="loadMaterials" />
        </div>
        <div class="filter-item">
          <span class="filter-label">分类</span>
          <el-select v-model="materialCategory" placeholder="全部分类" clearable style="width:150px;">
            <el-option v-for="c in materialCategories" :key="c" :label="c" :value="c" />
          </el-select>
        </div>
        <el-button class="btn-search" type="primary" @click="loadMaterials">搜索</el-button>
      </div>

      <el-table :data="materialList" size="small" max-height="350" class="item-table clickable" @row-click="selectMaterial">
        <el-table-column prop="name" label="材料名称" min-width="160" />
        <el-table-column prop="category" label="分类" width="110">
          <template #default="{ row }">
            <span v-if="row.category" class="soft-tag">{{ row.category }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80" align="center" />
        <el-table-column prop="cost_price" label="成本价" width="110" align="right">
          <template #default="{ row }"><span class="item-total">¥{{ formatNumber(row.cost_price) }}</span></template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="供应商" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.supplier_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="" width="70" align="center">
          <template #default>
            <span class="pick-hint">添加</span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state small">
            <div class="empty-title">没有匹配的主材</div>
            <div class="empty-sub">换个关键字或分类再试试</div>
          </div>
        </template>
      </el-table>
    </el-dialog>

    <!-- 审核弹窗 -->
    <el-dialog v-model="approveVisible" width="480px" class="pr-dialog">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🔍</div>
          <div>
            <div class="dlg-head-title">审核采购申请</div>
            <div class="dlg-head-sub">请确认采购内容与金额后再提交审核结果</div>
          </div>
        </div>
      </template>

      <div class="mini-hero">
        <div class="mini-hero-proj">{{ approveForm.project_name || '-' }}</div>
        <div class="mini-hero-amount">¥{{ formatNumber(approveForm.total_amount) }}</div>
      </div>

      <el-form :model="approveForm" label-width="82px" class="pr-form flat">
        <el-form-item label="审核操作" required>
          <el-radio-group v-model="approveForm.action" class="audit-radios">
            <el-radio label="approve">通过</el-radio>
            <el-radio label="reject">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="approveForm.action === 'reject'" label="拒绝原因">
          <el-input v-model="approveForm.reason" type="textarea" :rows="3" resize="none" placeholder="请输入拒绝原因，将同步给申请人" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="approveVisible = false">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="submitting" @click="handleApprove">
            确认{{ approveForm.action === 'approve' ? '通过' : '拒绝' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 报销上传弹窗 -->
    <el-dialog v-model="reimburseVisible" width="540px" class="pr-dialog" :close-on-click-modal="false">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🧮</div>
          <div>
            <div class="dlg-head-title">上传报销单</div>
            <div class="dlg-head-sub">填写实付金额并上传支付凭证</div>
          </div>
        </div>
      </template>

      <el-form :model="reimburseForm" label-width="88px" class="pr-form flat">
        <el-form-item label="实付金额" required>
          <el-input-number v-model="reimburseForm.actual_amount" :min="0" :precision="2" :controls="false" style="width:100%;" placeholder="请输入实付金额" />
        </el-form-item>
        <el-form-item label="上传凭证" required>
          <el-upload
            ref="uploadRef"
            action="/api/upload-image"
            :headers="{ 'x-user-id': userId }"
            list-type="picture-card"
            :file-list="uploadFileList"
            :on-success="onUploadSuccess"
            :on-remove="onUploadRemove"
            :before-remove="beforeUploadRemove"
            multiple
            accept="image/*"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reimburseForm.financial_notes" type="textarea" :rows="2" resize="none" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="reimburseVisible = false">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="submitting" @click="handleReimburse">提交报销</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 财务受理弹窗（报销中 → 受理中） -->
    <el-dialog v-model="financeAcceptVisible" width="480px" class="pr-dialog">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">💰</div>
          <div>
            <div class="dlg-head-title">财务受理</div>
            <div class="dlg-head-sub">核对实付金额后受理，单据进入待上传回执</div>
          </div>
        </div>
      </template>

      <div class="mini-hero">
        <div class="mini-hero-proj">{{ financeForm.project_name || '-' }}</div>
        <div class="mini-hero-amount">¥{{ formatNumber(financeForm.actual_amount) }}</div>
      </div>

      <el-form :model="financeForm" label-width="88px" class="pr-form flat">
        <el-form-item label="实付金额" required>
          <el-input-number v-model="financeForm.actual_amount" :min="0" :precision="2" :controls="false" style="width:100%;" />
        </el-form-item>
        <el-form-item label="财务备注">
          <el-input v-model="financeForm.financial_notes" type="textarea" :rows="2" resize="none" placeholder="核对备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="financeAcceptVisible = false">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="submitting" @click="handleFinanceAccept">确认受理</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 上传报销回执弹窗（受理中 → 已完结） -->
    <el-dialog v-model="financeConfirmVisible" width="540px" class="pr-dialog">
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">📎</div>
          <div>
            <div class="dlg-head-title">上传报销回执</div>
            <div class="dlg-head-sub">上传回执后单据将标记为已报销</div>
          </div>
        </div>
      </template>

      <div class="mini-hero">
        <div class="mini-hero-proj">{{ financeForm.project_name || '-' }}</div>
        <div class="mini-hero-amount">¥{{ formatNumber(financeForm.actual_amount) }}</div>
      </div>

      <el-form :model="financeForm" label-width="88px" class="pr-form flat">
        <el-form-item label="报销回执" required>
          <el-upload
            action="/api/upload-image"
            :headers="{ 'x-user-id': userId }"
            list-type="picture-card"
            :file-list="financeFileList"
            :on-success="onFinanceUploadSuccess"
            :on-remove="onFinanceUploadRemove"
            multiple
            accept="image/*"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="financeConfirmVisible = false">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="submitting" @click="handleFinanceConfirm">确认完成</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'

const userId = parseInt(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).id : 0)

// 状态
const activeTab = ref('my')
const list = ref([])
const loading = ref(false)
const page = ref(1)
const limit = ref(50)
const total = ref(0)
const keyword = ref('')
const filterStatus = ref('')
const detail = ref(null)
const detailVisible = ref(false)

// 权限
const canApprove = ref(false)
const canFinance = ref(false)
const canViewAll = ref(false)

// Badge 数量
const pendingCount = ref(0)
const reimburseCount = ref(0)
const financeCount = ref(0)

// 「财务确认」tab 的视图切换：pending=待上传回执（默认）/ done=已报销 / all=全部
const financeFilter = ref('pending')

// 创建表单
const createVisible = ref(false)
const formRef = ref()
const form = ref({ project_id: null, project_name: '', items: [], remark: '' })
const submitting = ref(false)
const projectList = ref([])

// 主材选择
const materialPickerVisible = ref(false)
const materialList = ref([])
const materialKeyword = ref('')
const materialCategory = ref('')
const materialCategories = ref([])

// 审核
const approveVisible = ref(false)
const approveForm = ref({ id: null, project_name: '', total_amount: 0, action: 'approve', reason: '' })

// 报销
const reimburseVisible = ref(false)
const reimburseForm = ref({ id: null, actual_amount: null, financial_notes: '' })
const uploadRef = ref()
const uploadFileList = ref([])
const uploadedImages = ref([])

// 财务受理 / 上传回执
const financeAcceptVisible = ref(false)
const financeConfirmVisible = ref(false)
const financeForm = ref({ id: null, project_name: '', actual_amount: null, financial_notes: '' })
const financeFileList = ref([])
const financeUploadedImages = ref([])

const totalAmount = computed(() => {
  return form.value.items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
  }, 0)
})

const reimburseImages = computed(() => {
  if (!detail.value?.reimbursement?.images) return []
  try {
    const imgs = JSON.parse(detail.value.reimbursement.images)
    return Array.isArray(imgs) ? imgs : []
  } catch { return [] }
})

function statusText(s) {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝', reimbursing: '报销中', finance_confirmed: '受理中', reimbursed: '已报销' }
  return map[s] || s
}
function statusTagType(s) {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger', reimbursing: 'primary', finance_confirmed: 'warning', reimbursed: 'info' }
  return map[s] || ''
}
/* ---------- 仅用于展示 ---------- */
function statusMeta(s) {
  const map = {
    pending: { text: '待审核', cls: 'st-warning' },
    approved: { text: '已通过', cls: 'st-success' },
    rejected: { text: '已拒绝', cls: 'st-danger' },
    reimbursing: { text: '报销中', cls: 'st-primary' },
    finance_confirmed: { text: '受理中', cls: 'st-violet' },
    reimbursed: { text: '已报销', cls: 'st-info' }
  }
  return map[s] || { text: s || '-', cls: 'st-info' }
}
function firstChar(name) {
  return name ? String(name).trim().charAt(0) : '?'
}
const AVATAR_COLORS = ['#2D5A8F', '#4A7BB7', '#5B8C5A', '#B8894A', '#8A6FA8', '#4F8A8B']
function avatarBg(name) {
  const s = String(name || '?')
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
function datePart(raw) {
  if (!raw) return '-'
  return String(raw).replace('T', ' ').substring(0, 10)
}
function timePart(raw) {
  if (!raw) return ''
  return String(raw).replace('T', ' ').substring(11, 16)
}

function formatNumber(v) {
  if (!v && v !== 0) return '0'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 加载列表
async function loadData() {
  loading.value = true
  try {
    let status = filterStatus.value
    let url = '/purchase-requests?page=' + page.value + '&limit=' + limit.value
    if (status) url += '&status=' + status
    if (keyword.value) url += '&keyword=' + encodeURIComponent(keyword.value)

    let res
    if (activeTab.value === 'my') {
      res = await request.get(url)
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'pending') {
      res = await request.get(url + '&status=pending')
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'reimbursing') {
      res = await request.get(url + '&status=reimbursing')
      list.value = res.list || []
      total.value = res.total || 0
    } else if (activeTab.value === 'finance') {
      res = await request.get('/purchase-requests/finance?page=' + page.value + '&limit=' + limit.value + '&status=' + financeFilter.value)
      list.value = res.list || []
      total.value = res.total || 0
    } else {
      res = await request.get(url)
      list.value = res.list || []
      total.value = res.total || 0
    }
    loadCounts()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 加载 Badge 数量
async function loadCounts() {
  if (!canApprove.value && !canFinance.value) return
  try {
    if (canApprove.value) {
      const r = await request.get('/purchase-requests?status=pending&limit=1')
      pendingCount.value = r.total || 0
    }
    if (canFinance.value) {
      const [r1, r2] = await Promise.all([
        request.get('/purchase-requests?status=reimbursing&limit=1'),
        request.get('/purchase-requests/finance?limit=1')
      ])
      reimburseCount.value = r1.total || 0
      // v2.3.12：角标只取「待上传回执」的数量（pending_count），
      // 不能用 total —— 那是含已报销终态的总数，处理完也不会归零
      financeCount.value = r2.pending_count ?? 0
    }
  } catch {}
}

function switchTab(key) {
  activeTab.value = key
  page.value = 1
  filterStatus.value = ''
  financeFilter.value = 'pending'
  loadData()
}

// 「财务确认」tab 切换视图（待上传回执 / 已报销 / 全部）
function onFinanceFilterChange() {
  page.value = 1
  loadData()
}

// 每页条数变化 → 回到第一页重查（原分页用 Vue2 的 .sync 写法，Vue3 下无效，2026-10-29 一并修正）
function onSizeChange() {
  page.value = 1
  loadData()
}

const visibleTabs = computed(() => {
  const all = [
    { key: 'my', label: '我的申请', badge: null },
    { key: 'pending', label: '待审核', badge: pendingCount.value || null },
    { key: 'reimbursing', label: '待报销', badge: reimburseCount.value || null },
    { key: 'finance', label: '财务确认', badge: financeCount.value || null },
  ]
  return all
})

// 打开详情
async function openDetail(row) {
  try {
    detail.value = await request.get('/purchase-requests/' + row.id)
    detailVisible.value = true
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

// 打开创建弹窗
async function openCreateDialog() {
  form.value = { project_id: null, project_name: '', items: [], remark: '' }
  createVisible.value = true
  loadProjects()
}

async function loadProjects() {
  try {
    // ⚠️ GET /api/projects 返回的是**纯数组**（res.json(projects)），不是 { list }。
    // 原来写 `res.list || []` 永远取到空数组 → 「关联项目」下拉一个项目都没有（2026-10-29 修复）。
    //
    // ?picker=1 = 选择器模式：只返回「我实际关联的项目」，admin 返回全部。
    // 普通模式会尊重 project:read_all（项目经理/财务/主材配了这个权限），
    // 那样他们在提交时能选到与自己无关的项目，不符合业务规则。
    const res = await request.get('/projects?picker=1')
    const arr = Array.isArray(res) ? res : (res.list || res.data || [])
    projectList.value = Array.isArray(arr) ? arr : []
  } catch (e) {
    projectList.value = []
  }
}

function onProjectChange(id) {
  const p = projectList.value.find(p => p.id === id)
  if (p) form.value.project_name = p.name
}

// 主材选择
function showMaterialPicker() {
  materialPickerVisible.value = true
  loadMaterials()
}

async function loadMaterials() {
  try {
    let url = '/main-materials?limit=500&is_visible=1'
    if (materialKeyword.value) url += '&keyword=' + encodeURIComponent(materialKeyword.value)
    if (materialCategory.value) url += '&category=' + encodeURIComponent(materialCategory.value)
    const res = await request.get(url)
    materialList.value = res.list || []
    const cats = [...new Set(materialList.value.map(m => m.category).filter(Boolean))]
    materialCategories.value = cats
  } catch (e) {
    materialList.value = []
  }
}

function selectMaterial(row) {
  form.value.items.push({
    material_id: row.id,
    material_name: row.name,
    unit: row.purchase_unit || row.quote_unit || '',
    quantity: 1,
    unit_price: parseFloat(row.cost_price) || 0,
    total_price: parseFloat(row.cost_price) || 0
  })
  materialPickerVisible.value = false
}

function addFreeItem() {
  form.value.items.push({ material_id: null, material_name: '', unit: '', quantity: 1, unit_price: 0, total_price: 0 })
}

function removeItem(index) {
  form.value.items.splice(index, 1)
}

async function handleSubmit() {
  if (!form.value.project_id) { ElMessage.warning('请选择项目'); return }
  if (form.value.items.length === 0) { ElMessage.warning('请添加采购明细'); return }

  const items = form.value.items.map(item => ({
    ...item,
    total_price: ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2)
  }))

  submitting.value = true
  try {
    await request.post('/purchase-requests', {
      project_id: form.value.project_id,
      project_name: form.value.project_name,
      items,
      remark: form.value.remark
    })
    ElMessage.success('提交成功')
    createVisible.value = false
    loadData()
  } catch (e) {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

// 重新提交
async function handleResubmit() {
  try {
    await ElMessageBox.confirm('确认重新提交此申请？', '提示', { type: 'warning' })
    await request.post('/purchase-requests/' + detail.value.id + '/resubmit')
    ElMessage.success('重新提交成功')
    detailVisible.value = false
    loadData()
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

// 删除
async function handleDelete() {
  try {
    await ElMessageBox.confirm('确认删除此申请？删除后不可恢复。', '警告', { type: 'warning' })
    await request.delete('/purchase-requests/' + detail.value.id)
    ElMessage.success('删除成功')
    detailVisible.value = false
    loadData()
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

// 删除
async function deleteRow(row) {
  try {
    await ElMessageBox.confirm('确定删除该采购申请吗？', '删除确认', { type: 'warning' })
  } catch { return }
  submitting.value = true
  try {
    await request.delete('/purchase-requests/' + row.id)
    ElMessage.success('删除成功')
    loadData()
    detailVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    submitting.value = false
  }
}

// 审核
function showApproveDialog(row) {
  approveForm.value = { id: row.id, project_name: row.project_name, total_amount: row.total_amount, action: 'approve', reason: '' }
  approveVisible.value = true
}

async function handleApprove() {
  if (!approveForm.value.action) { ElMessage.warning('请选择操作'); return }
  if (approveForm.value.action === 'reject' && !approveForm.value.reason) { ElMessage.warning('请输入拒绝原因'); return }
  submitting.value = true
  try {
    await request.put('/purchase-requests/' + approveForm.value.id + '/approve', {
      action: approveForm.value.action,
      reason: approveForm.value.reason
    })
    ElMessage.success(approveForm.value.action === 'approve' ? '已通过' : '已拒绝')
    approveVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

// 报销上传
function showReimburseDialog(row) {
  reimburseForm.value = { id: row.id, actual_amount: parseFloat(row.total_amount) || 0, financial_notes: '' }
  uploadFileList.value = []
  uploadedImages.value = []
  reimburseVisible.value = true
  // 如果已有报销记录，回显
  if (row.reimbursement) {
    reimburseForm.value.actual_amount = parseFloat(row.reimbursement.actual_amount) || 0
    reimburseForm.value.financial_notes = row.reimbursement.financial_notes || ''
    try {
      const imgs = JSON.parse(row.reimbursement.images || '[]')
      uploadedImages.value = imgs
      uploadFileList.value = imgs.map((u, i) => ({ url: u, uid: -i - 1, name: 'image_' + i }))
    } catch {}
  }
}

function onUploadSuccess(res, file, files) {
  if (res.url) uploadedImages.value.push(res.url)
}

function onUploadRemove(file, files) {
  uploadedImages.value = files.map(f => f.url || f.response?.url).filter(Boolean)
}

function beforeUploadRemove(file, files) {
  uploadedImages.value = files.map(f => f.url || f.response?.url).filter(Boolean)
}

async function handleReimburse() {
  if (uploadedImages.value.length === 0) { ElMessage.warning('请上传报销凭证'); return }
  submitting.value = true
  try {
    await request.post('/purchase-requests/' + reimburseForm.value.id + '/reimburse', {
      actual_amount: reimburseForm.value.actual_amount || 0,
      financial_notes: reimburseForm.value.financial_notes || '',
      images: JSON.stringify(uploadedImages.value)
    })
    ElMessage.success('上传成功')
    reimburseVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

// 财务受理（报销中 → 受理中）
function showFinanceAcceptDialog(row) {
  financeForm.value = {
    id: row.id,
    project_name: row.project_name,
    actual_amount: row.reimbursement?.actual_amount ? parseFloat(row.reimbursement.actual_amount) : parseFloat(row.total_amount),
    financial_notes: row.reimbursement?.financial_notes || ''
  }
  financeAcceptVisible.value = true
}

async function handleFinanceAccept() {
  submitting.value = true
  try {
    await request.post('/purchase-requests/' + financeForm.value.id + '/finance-accept', {
      finance_amount: financeForm.value.actual_amount,
      financial_notes: financeForm.value.financial_notes || ''
    })
    ElMessage.success('受理成功')
    financeAcceptVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

// 上传报销回执（受理中 → 已完结）
function showFinanceConfirmDialog(row) {
  financeForm.value = {
    id: row.id,
    project_name: row.project_name,
    actual_amount: row.reimbursement?.actual_amount ? parseFloat(row.reimbursement.actual_amount) : parseFloat(row.total_amount),
    financial_notes: row.reimbursement?.financial_notes || ''
  }
  financeFileList.value = []
  financeUploadedImages.value = []
  financeConfirmVisible.value = true
}

function onFinanceUploadSuccess(res) {
  if (res && res.url) financeUploadedImages.value.push(res.url)
}

function onFinanceUploadRemove(file, files) {
  financeUploadedImages.value = files.map(f => f.url || (f.response && f.response.url)).filter(Boolean)
}

async function handleFinanceConfirm() {
  if (financeUploadedImages.value.length === 0) { ElMessage.warning('请上传报销回执'); return }
  submitting.value = true
  try {
    await request.post('/purchase-requests/' + financeForm.value.id + '/finance-confirm', {
      images: JSON.stringify(financeUploadedImages.value)
    })
    ElMessage.success('财务确认完成')
    financeConfirmVisible.value = false
    detailVisible.value = false
    loadData()
  } catch (e) { /* interceptor */ } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  // 检查权限（统一走用户权限 store，管理员默认拥有全部）
  const userStore = useUserStore()
  canApprove.value = userStore.canAction('purchase', 'approve')
  canFinance.value = userStore.canAction('purchase', 'finance')
  canViewAll.value = userStore.canAction('purchase', 'read_all')
  loadData()
})
</script>

<style scoped>
.purchase-requests { padding: 0; }

/* ==================== 页面头 ==================== */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title { font-size: 20px; font-weight: 700; color: #1E3A5F; margin: 0; }
.page-sub { font-size: 13px; color: #909399; margin: 6px 0 0; }
.page-sub b { color: #409EFF; font-weight: 600; }
.page-head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn-ghost {
  border-radius: 10px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #dbe3ec;
  color: #4a5b6e;
  background: #fff;
}
.btn-ghost:hover { color: #1E3A5F; border-color: #b9c7d8; background: #f7f9fc; }
.btn-add {
  border-radius: 10px;
  padding: 0 18px;
  height: 34px;
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .25);
}
.btn-add:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== Tab 胶囊 ==================== */
.tab-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.tab-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 16px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid #EBEEF5;
  color: #5a6a7d;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  transition: all .16s ease;
}
.tab-chip:hover { border-color: #c6d4e6; color: #1E3A5F; box-shadow: 0 2px 8px rgba(30, 58, 95, .07); }
.tab-chip.active {
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border-color: #1E3A5F;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .22);
}
.chip-badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #F56C6C;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 17px;
  text-align: center;
}
.tab-chip.active .chip-badge { background: rgba(255, 255, 255, .28); }

/* ==================== 列表卡片 ==================== */
.table-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 8px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, .06);
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  flex-wrap: wrap;
}
.filter-bar.inner { margin-bottom: 12px; background: #fff; padding: 0; border: none; }
.filter-item { display: flex; align-items: center; gap: 8px; }
.filter-label { font-size: 13px; color: #606266; white-space: nowrap; }
.kw-input { width: 220px; }
.kw-input :deep(.el-input__wrapper) { border-radius: 8px; }
.btn-search {
  border-radius: 8px;
  background: #1E3A5F;
  border-color: #1E3A5F;
  padding: 0 18px;
  height: 32px;
}
.btn-search:hover { background: #2D5A8F; border-color: #2D5A8F; }
.filter-result { margin-left: auto; font-size: 12px; color: #909399; }
.filter-result b { color: #409EFF; font-weight: 600; }

/* ==================== 表格 ==================== */
.pr-table { --el-table-border-color: #f0f2f5; cursor: pointer; }
.pr-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.pr-table :deep(td.el-table__cell) { padding: 12px 0; border-bottom: 1px solid #f5f7fa; }
.pr-table :deep(.el-table__row) { transition: background .15s; }
.pr-table :deep(.el-table__row:hover > td.el-table__cell) { background: #f5f9ff !important; }

.proj-cell { display: flex; align-items: center; gap: 11px; }
.proj-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #EAF0F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.proj-main { min-width: 0; }
.proj-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.proj-sub { font-size: 12px; color: #a8abb2; margin-top: 2px; font-family: ui-monospace, Menlo, monospace; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-name { font-size: 13px; color: #303133; }

.amount { font-size: 14px; font-weight: 700; color: #1f2d3d; font-family: ui-monospace, Menlo, monospace; }
.amount.paid { color: #67C23A; }

.remark-text {
  font-size: 13px;
  color: #909399;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted { color: #c0c4cc; }

.time-cell { line-height: 1.4; }
.time-date { font-size: 13px; color: #606266; font-family: ui-monospace, Menlo, monospace; }
.time-hm { font-size: 11px; color: #a8abb2; }

/* 状态胶囊 */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
  line-height: 19px;
  white-space: nowrap;
}
.status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.st-warning { color: #b88230; background: #fdf6ec; }
.st-success { color: #529b2e; background: #f0f9eb; }
.st-danger { color: #c45656; background: #fef0f0; }
.st-primary { color: #2f6fbf; background: #eef5ff; }
.st-violet { color: #6a5aa8; background: #f4f1fd; }
.st-info { color: #7b8b9e; background: #f4f6f9; }

.btn-link { font-size: 13px; padding: 0 6px; color: #2D5A8F; }
.btn-link.danger { color: #F56C6C; }
.btn-link:hover { opacity: .8; }
.btn-action {
  border-radius: 8px;
  border: 1px solid #1E3A5F;
  background: #1E3A5F;
  color: #fff;
  padding: 5px 12px;
  font-size: 12px;
}
.btn-action:hover { background: #2D5A8F; border-color: #2D5A8F; color: #fff; }

/* 空状态 */
.empty-state { padding: 44px 0 34px; text-align: center; }
.empty-state.small { padding: 24px 0 18px; }
.empty-icon { font-size: 40px; line-height: 1; opacity: .75; }
.empty-title { font-size: 14px; font-weight: 600; color: #606266; margin-top: 12px; }
.empty-state.small .empty-title { margin-top: 0; }
.empty-sub { font-size: 12px; color: #a8abb2; margin-top: 6px; }

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 12px 0 8px;
  border-top: 1px solid #f5f7fa;
}

/* ==================== 抽屉详情 ==================== */
.detail-hero {
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f4f8fd, #eef4fa);
  border: 1px solid #e3ecf6;
  margin-bottom: 14px;
}
.detail-hero.hero-warning { background: linear-gradient(135deg, #fffcf3, #fdf6e7); border-color: #f7e6c4; }
.detail-hero.hero-success { background: linear-gradient(135deg, #f6fbf3, #eef8e9); border-color: #dcefd5; }
.detail-hero.hero-danger { background: linear-gradient(135deg, #fff7f7, #fdeeee); border-color: #fadcdc; }
.detail-hero.hero-primary { background: linear-gradient(135deg, #f4f9ff, #eaf2fd); border-color: #d6e6fb; }
.detail-hero.hero-violet { background: linear-gradient(135deg, #f8f6fe, #f1edfc); border-color: #e2dbf7; }
.detail-hero.hero-info { background: linear-gradient(135deg, #f8fafc, #f2f5f8); border-color: #e6ebf1; }
.hero-top { display: flex; align-items: center; gap: 8px; }
.hero-id { font-size: 12px; color: #a8abb2; font-family: ui-monospace, Menlo, monospace; }
.hero-proj { font-size: 16px; font-weight: 700; color: #1f2d3d; margin-top: 10px; }
.hero-amount { display: flex; align-items: baseline; gap: 8px; margin-top: 8px; }
.hero-amount-label { font-size: 12px; color: #7b8b9e; }
.hero-amount-value { font-size: 24px; font-weight: 700; color: #1E3A5F; font-family: ui-monospace, Menlo, monospace; }

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.info-item {
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 9px 12px;
}
.info-label { font-size: 12px; color: #909399; }
.info-value { font-size: 13px; color: #303133; font-weight: 500; margin-top: 3px; word-break: break-all; }
.info-value.paid-text, .paid-text { color: #529b2e; font-weight: 600; }

.detail-block { margin-bottom: 14px; }
.block-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 8px;
}
.block-bar { width: 3px; height: 12px; border-radius: 2px; background: #4A7BB7; }
.block-tip { font-size: 11px; color: #a8abb2; font-weight: 400; }
.block-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.7;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 10px 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
.reject-box {
  background: #fef2f2;
  border: 1px solid #fadcdc;
  border-left: 3px solid #F56C6C;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.reject-title { font-size: 12px; font-weight: 700; color: #c45656; }
.reject-text { font-size: 13px; color: #a05252; margin-top: 4px; line-height: 1.6; }

.detail-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.detail-img {
  width: 100%;
  height: 96px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid #eef1f6;
  transition: transform .15s, box-shadow .15s;
}
.detail-img:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 21, 41, .12); }

.drawer-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  padding: 14px 0 4px;
  border-top: 1px dashed #eef1f6;
  position: sticky;
  bottom: 0;
  background: #fff;
}
.btn-save {
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  border-radius: 10px;
  padding: 0 22px;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .22);
}
.btn-save:hover { background: linear-gradient(135deg, #3569a5, #24466f); }
.btn-reject {
  border-radius: 10px;
  padding: 0 18px;
  color: #c45656;
  border: 1px solid #f3c6c6;
  background: #fff;
}
.btn-reject:hover { background: #fef0f0; border-color: #f0b6b6; color: #c45656; }

/* ==================== 弹窗通用 ==================== */
.dlg-head { display: flex; align-items: center; gap: 12px; }
.dlg-head-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #EAF0F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.dlg-head-title { font-size: 16px; font-weight: 700; color: #1E3A5F; }
.dlg-head-sub { font-size: 12px; color: #909399; margin-top: 3px; }
.dlg-footer { display: flex; justify-content: flex-end; gap: 10px; }

.mini-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  margin-bottom: 16px;
}
.mini-hero-proj { font-size: 14px; font-weight: 600; color: #1f2d3d; min-width: 0; }
.mini-hero-amount {
  font-size: 18px;
  font-weight: 700;
  color: #1E3A5F;
  font-family: ui-monospace, Menlo, monospace;
  flex-shrink: 0;
}

/* ==================== 表单 ==================== */
.pr-form { max-height: 64vh; overflow-y: auto; padding-right: 6px; }
.pr-form.flat { max-height: none; overflow: visible; padding-right: 0; }
.form-section {
  background: #fafbfd;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 14px 16px 2px;
  margin-bottom: 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 12px;
}
.section-bar {
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: linear-gradient(180deg, #4A7BB7, #1E3A5F);
}
.section-tip { margin-left: auto; font-size: 11px; color: #a8abb2; font-weight: 400; }
.pr-form :deep(.el-form-item) { margin-bottom: 14px; }
.pr-form :deep(.el-form-item__label) { color: #606266; font-size: 13px; }
.pr-form :deep(.el-input__wrapper),
.pr-form :deep(.el-textarea__inner) { border-radius: 8px; }
.pr-form :deep(.el-textarea__inner) { background: #fff; }

.item-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.btn-mini {
  border-radius: 8px;
  background: #1E3A5F;
  border-color: #1E3A5F;
  color: #fff;
  padding: 0 12px;
}
.btn-mini:hover { background: #2D5A8F; border-color: #2D5A8F; color: #fff; }
.btn-mini.ghost { background: #fff; color: #4a5b6e; border-color: #dbe3ec; }
.btn-mini.ghost:hover { background: #f7f9fc; color: #1E3A5F; border-color: #b9c7d8; }

.total-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 14px;
  margin: 10px 0 14px;
  background: linear-gradient(135deg, #fff8f8, #fff2f2);
  border: 1px solid #fadcdc;
  border-radius: 10px;
}
.total-label { font-size: 13px; color: #7b8b9e; }
.total-value { font-size: 20px; font-weight: 700; color: #F56C6C; font-family: ui-monospace, Menlo, monospace; }

/* 明细表 */
.item-table { --el-table-border-color: #eef1f6; }
.item-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 12px !important;
}
.item-table :deep(td.el-table__cell) { font-size: 13px; }
.item-table.clickable :deep(.el-table__row) { cursor: pointer; }
.item-table.clickable :deep(.el-table__row:hover > td.el-table__cell) { background: #f5f9ff !important; }
.item-total { font-family: ui-monospace, Menlo, monospace; font-weight: 600; color: #1E3A5F; }
.soft-tag {
  display: inline-block;
  font-size: 12px;
  color: #4a6fa5;
  background: #f0f5ff;
  border-radius: 7px;
  padding: 1px 8px;
  line-height: 19px;
}
.pick-hint { font-size: 12px; color: #409EFF; }
.audit-radios :deep(.el-radio) { margin-right: 24px; }

/* 项目选择器为空时的提示（选择器只返回「我关联的项目」） */
.picker-empty-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #b88230;
  background: #fdf6ec;
  border: 1px solid #f5e2c0;
  border-radius: 8px;
  padding: 6px 10px;
  width: 100%;
  box-sizing: border-box;
}

/* ==================== 响应式 ==================== */
@media screen and (max-width: 1200px) {
  .filter-result { margin-left: 0; }
}
@media screen and (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head-right { width: 100%; }
  .table-card { padding: 12px 10px 4px; }
  .filter-item { width: 100%; }
  .filter-item :deep(.el-select),
  .filter-item :deep(.el-input) { flex: 1; width: 100% !important; }
  .kw-input { width: 100%; }
  .pagination-wrap { justify-content: center; }
  .info-grid { grid-template-columns: 1fr; }
  .detail-images { grid-template-columns: repeat(3, 1fr); }
  .detail-img { height: 84px; }
  .total-bar { justify-content: space-between; }
}
</style>
