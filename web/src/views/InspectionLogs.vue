<template>
  <div class="inspection-logs">
    <!-- 页面头 -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">巡检日志</h2>
        <p class="page-sub">
          现场巡检记录与整改问题跟踪 · 整改 <b>{{ rectifyTotal }}</b> 项 / 巡检 <b>{{ total }}</b> 条
        </p>
      </div>
      <div class="page-head-right">
        <el-select
          v-if="activeTab === 'rectify'"
          v-model="rectifyFilterProject"
          class="proj-select"
          placeholder="全部项目"
          clearable filterable
          @change="loadRectifyList"
        >
          <el-option label="全部项目" :value="0" />
          <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select
          v-else
          v-model="filterProject"
          class="proj-select"
          placeholder="全部项目"
          clearable filterable
          @change="loadLogs"
        >
          <el-option label="全部项目" :value="0" />
          <el-option v-for="p in projectList" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button class="btn-add" type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          <span>新增巡检</span>
        </el-button>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="main-card">
      <el-tabs v-model="activeTab" class="insp-tabs" @tab-change="onTabChange">
        <!-- 整改问题（与移动端同源：rectification_issues） -->
        <el-tab-pane name="rectify">
          <template #label>
            <span class="tab-label">
              整改问题
              <span class="tab-badge" :class="{ zero: !rectifyTotal }">{{ rectifyTotal }}</span>
            </span>
          </template>

          <el-table :data="rectifyList" class="insp-table" style="width:100%" v-loading="rectifyListLoading" row-key="id">
            <el-table-column label="问题" min-width="300">
              <template #default="scope">
                <div class="issue-cell">
                  <div class="issue-icon" :class="'lv-' + getSeverityTagType(scope.row.level)">
                    {{ getSeverityIcon(scope.row.level) }}
                  </div>
                  <div class="issue-main">
                    <div class="issue-title">{{ scope.row.title || '未命名问题' }}</div>
                    <div class="issue-desc" :title="scope.row.issue_desc || scope.row.description || ''">{{ scope.row.issue_desc || scope.row.description || '—' }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="项目 / 位置" min-width="180">
              <template #default="scope">
                <div class="proj-line">{{ scope.row.project_name || scope.row.project_id || '-' }}</div>
                <div class="loc-line">📍 {{ scope.row.location || '未标注位置' }}</div>
              </template>
            </el-table-column>

            <el-table-column label="严重程度" width="104">
              <template #default="scope">
                <span v-if="scope.row.level" class="level-pill" :class="'lv-' + getSeverityTagType(scope.row.level)">
                  {{ getSeverityText(scope.row.level) }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>

            <el-table-column label="负责人" width="126">
              <template #default="scope">
                <div v-if="scope.row.responsible_name" class="user-cell">
                  <div class="avatar" :style="{ background: avatarBg(scope.row.responsible_name) }">
                    {{ firstChar(scope.row.responsible_name) }}
                  </div>
                  <span class="user-name">{{ scope.row.responsible_name }}</span>
                </div>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>

            <el-table-column label="整改期限" width="140">
              <template #default="scope">
                <div class="due-cell">
                  <span class="due-date" :class="{ overdue: isOverdue(scope.row) }">{{ scope.row.due_date || '未设置' }}</span>
                  <span v-if="isOverdue(scope.row)" class="overdue-badge">已逾期</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="状态" width="104">
              <template #default="scope">
                <span class="status-pill" :class="'st-' + getRectifyStatusType(scope.row)">
                  <span class="dot"></span>{{ getRectifyStatus(scope.row) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="操作" width="152" fixed="right" align="center">
              <template #default="scope">
                <el-button class="btn-primary-sm" size="small" @click="openRectifyDetail(scope.row.id)">处理</el-button>
                <el-button v-if="userStore.isAdmin" class="btn-link danger" link @click="handleDeleteRectify(scope.row)">删除</el-button>
              </template>
            </el-table-column>

            <template #empty>
              <div class="empty-state">
                <div class="empty-icon">🔧</div>
                <div class="empty-title">暂无整改问题</div>
                <div class="empty-sub">巡检中发现的待整改问题会汇总到这里</div>
              </div>
            </template>
          </el-table>

          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="rectifyPage"
              v-model:page-size="rectifyPageSize"
              :total="rectifyTotal"
              :page-sizes="[10,20,50]"
              layout="total,sizes,prev,pager,next"
            />
          </div>
        </el-tab-pane>

        <!-- 巡检记录（inspections 表，PC 端历史数据） -->
        <el-tab-pane name="inspections">
          <template #label>
            <span class="tab-label">
              巡检记录
              <span class="tab-badge" :class="{ zero: !total }">{{ total }}</span>
            </span>
          </template>

          <el-table :data="logList" class="insp-table" style="width:100%" v-loading="loading" row-key="id">
            <el-table-column label="巡检地点" min-width="300">
              <template #default="scope">
                <div class="issue-cell">
                  <div class="issue-icon lv-info">📍</div>
                  <div class="issue-main">
                    <div class="issue-title">{{ scope.row.location || scope.row.project_name || '-' }}</div>
                    <div class="issue-desc" :title="scope.row.result || ''">{{ scope.row.result || '—' }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="项目" min-width="150">
              <template #default="scope">
                <span class="proj-line">{{ scope.row.project_name || scope.row.project_id || '-' }}</span>
              </template>
            </el-table-column>

            <el-table-column label="现场照片" width="150">
              <template #default="scope">
                <div v-if="getImageCount(scope.row.images) > 0" class="thumb-stack" @click="previewImages(scope.row)">
                  <div v-for="(img, i) in getViewImages(scope.row.images).slice(0, 3)" :key="i" class="thumb">
                    <el-image :src="getImageUrl(img)" fit="cover" class="thumb-img" />
                  </div>
                  <span v-if="getImageCount(scope.row.images) > 3" class="thumb-more">
                    +{{ getImageCount(scope.row.images) - 3 }}
                  </span>
                </div>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>

            <el-table-column label="提交人" width="132">
              <template #default="scope">
                <div class="user-cell">
                  <div class="avatar" :style="{ background: avatarBg(scope.row.operator) }">
                    {{ firstChar(scope.row.operator) }}
                  </div>
                  <div class="user-main">
                    <div class="user-name">{{ scope.row.operator || '-' }}</div>
                    <div class="user-time">{{ shortTime(scope.row.created_at) }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="操作" width="112" fixed="right" align="center">
              <template #default="scope">
                <el-button class="btn-link" link @click="handleView(scope.row)">查看</el-button>
                <el-button v-if="canEdit(scope.row)" class="btn-link danger" link @click="handleDelete(scope.row)">删除</el-button>
              </template>
            </el-table-column>

            <template #empty>
              <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">暂无巡检记录</div>
                <div class="empty-sub">点击右上角「新增巡检」记录本次巡检情况</div>
              </div>
            </template>
          </el-table>

          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="pageSize"
              :total="total"
              :page-sizes="[10,20,50]"
              layout="total,sizes,prev,pager,next"
              @current-change="loadLogs"
              @size-change="loadLogs"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" width="720px" class="insp-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🔍</div>
          <div>
            <div class="dlg-head-title">{{ isEdit ? '编辑巡检' : '新增巡检日志' }}</div>
            <div class="dlg-head-sub">记录巡检地点、巡检结果与现场照片</div>
          </div>
        </div>
      </template>

      <!-- 上传中全屏遮挡层 -->
      <div v-if="uploadingCount > 0 || uploadProgress.visible" class="upload-overlay">
        <div class="upload-overlay-content">
          <div class="upload-spinner-large"></div>
          <div class="upload-progress-text">{{ uploadProgress.text }}</div>
          <div class="upload-progress-bar-wrap">
            <div class="upload-progress-bar" :style="{ width: uploadProgress.percent + '%' }"></div>
          </div>
          <div class="upload-progress-percent">{{ uploadProgress.percent }}%</div>
        </div>
      </div>

      <el-form :model="form" label-width="88px" class="insp-form">
        <!-- 基础信息 -->
        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>基础信息</div>
          <el-form-item label="项目" required>
            <el-select v-model="form.project_id" placeholder="选择项目" filterable style="width:100%">
              <el-option v-for="p in pickProjectList" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <div v-if="!pickProjectList.length" class="picker-empty-tip">
              你没有关联任何项目，暂时无法提交。请联系管理员把你加到对应项目。
            </div>
          </el-form-item>
          <div class="form-row">
            <el-form-item label="巡检日期">
              <el-date-picker v-model="form.inspection_date" type="date" value-format="YYYY-MM-DD" style="width:100%" placeholder="选择日期" />
            </el-form-item>
            <el-form-item label="巡检地点">
              <el-input v-model="form.location" placeholder="如：3 栋 2 单元客厅" />
            </el-form-item>
          </div>
        </div>

        <!-- 巡检情况 -->
        <div class="form-section">
          <div class="section-title"><span class="section-bar"></span>巡检情况</div>
          <el-form-item label="巡检结果" required>
            <el-input v-model="form.result" type="textarea" :rows="4" resize="none" placeholder="巡检情况描述" />
          </el-form-item>
          <el-form-item label="问题记录">
            <el-input v-model="form.issues" type="textarea" :rows="2" resize="none" placeholder="发现的问题" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="2" resize="none" placeholder="备注信息" />
          </el-form-item>
        </div>

        <!-- 现场照片 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-bar"></span>现场照片
            <span class="section-tip">最多 9 张，{{ formImages.length }}/9</span>
          </div>
          <el-form-item label="图片">
            <div class="photo-upload-list">
              <div v-for="(item, idx) in formImages" :key="idx" class="photo-item" :class="{ 'photo-uploading': item.status === 'uploading', 'photo-error': item.status === 'error' }">
                <el-image :src="getImageUrl(item)" fit="cover" class="photo-thumb" :preview-src-list="getPreviewList()" :preview-index="idx" />
                <div v-if="item.status === 'uploading'" class="photo-overlay">
                  <span class="photo-spinner"></span>
                </div>
                <div v-if="item.status === 'error'" class="photo-overlay photo-overlay-error">
                  <span style="font-size:20px">⚠</span>
                </div>
                <div class="photo-remove" @click="removeImage(idx)">×</div>
              </div>
              <div v-if="formImages.length < 9" class="photo-add" @click="choosePhoto">
                <el-icon><Plus /></el-icon>
                <span>添加图片</span>
              </div>
            </div>
            <input type="file" ref="fileInputRef" accept="image/*" multiple style="display:none" @change="onFileChange" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <div class="dlg-footer">
          <el-button @click="dialogVisible=false" :disabled="uploadingCount > 0">取消</el-button>
          <el-button class="btn-save" type="primary" :loading="saving" @click="handleSave" :disabled="uploadingCount > 0">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 查看详情 -->
    <el-dialog v-model="viewVisible" width="760px" class="insp-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🔍</div>
          <div>
            <div class="dlg-head-title">巡检详情</div>
            <div class="dlg-head-sub">{{ viewLog ? (viewLog.project_name || '-') : '' }}</div>
          </div>
        </div>
      </template>

      <div v-if="viewLog" class="log-detail">
        <div class="detail-hero">
          <div class="hero-left">
            <div class="hero-title">{{ viewLog.location || '巡检记录' }}</div>
            <div class="hero-chips">
              <span class="soft-tag">📍 {{ viewLog.project_name || '-' }}</span>
              <span v-if="viewLog.inspection_date" class="soft-tag gray">🗓 {{ viewLog.inspection_date }}</span>
              <span class="soft-tag gray">{{ viewLog.operator || '-' }} 提交</span>
            </div>
          </div>
        </div>

        <div class="detail-block">
          <div class="block-label"><span class="block-bar"></span>巡检结果</div>
          <div class="block-text">{{ viewLog.result || '—' }}</div>
        </div>
        <div v-if="viewLog.issues" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>问题记录</div>
          <div class="block-text">{{ viewLog.issues }}</div>
        </div>
        <div v-if="viewLog.note" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>备注</div>
          <div class="block-text">{{ viewLog.note }}</div>
        </div>

        <div v-if="getViewImages(viewLog.images).length > 0" class="detail-block">
          <div class="block-label">
            <span class="block-bar"></span>现场照片
            <span class="block-tip">{{ getViewImages(viewLog.images).length }} 张</span>
          </div>
          <div class="detail-images">
            <el-image
              v-for="(img, idx) in getViewImages(viewLog.images)"
              :key="idx"
              :src="getImageUrl(img)"
              fit="cover"
              class="detail-img"
              :preview-src-list="getViewImages(viewLog.images).map(g=>getImageUrl(g))"
              :preview-index="idx"
            />
          </div>
        </div>

        <div class="detail-foot">提交时间：{{ viewLog.created_at || '-' }}</div>
      </div>
    </el-dialog>

    <!-- 整改详情（从待办中心跳转） -->
    <el-dialog v-model="rectifyVisible" width="780px" class="insp-dialog" destroy-on-close>
      <template #header>
        <div class="dlg-head">
          <div class="dlg-head-icon">🔧</div>
          <div>
            <div class="dlg-head-title">整改详情</div>
            <div class="dlg-head-sub">{{ rectifyDetail ? (rectifyDetail.project_name || '-') : '加载中…' }}</div>
          </div>
        </div>
      </template>

      <div v-if="rectifyLoading" class="loading-state">
        <el-icon class="is-loading" style="font-size:28px;color:#2D5A8F"><Loading /></el-icon>
        <p>加载中…</p>
      </div>
      <div v-else-if="!rectifyDetail" class="loading-state">
        <div class="empty-icon">🗂</div>
        <p>记录不存在或已被删除</p>
      </div>
      <div v-else class="rectify-detail">
        <!-- 摘要 -->
        <div class="detail-hero" :class="'hero-' + getRectifyStatusType(rectifyDetail)">
          <div class="hero-left">
            <div class="hero-top">
              <span class="status-pill" :class="'st-' + getRectifyStatusType(rectifyDetail)">
                <span class="dot"></span>{{ getRectifyStatus(rectifyDetail) }}
              </span>
              <span v-if="getRectifyStatus(rectifyDetail) !== '已完成' && isOverdue(rectifyDetail)" class="overdue-badge">
                已逾期
              </span>
            </div>
            <div class="hero-title">{{ rectifyDetail.title || rectifyDetail.issue_desc || '整改问题' }}</div>
            <div class="hero-chips">
              <span v-if="rectifyDetail.category" class="soft-tag">{{ rectifyDetail.category }}</span>
              <span v-if="rectifyDetail.location" class="soft-tag gray">📍 {{ rectifyDetail.location }}</span>
              <span v-if="rectifyDetail.level" class="level-pill" :class="'lv-' + getSeverityTagType(rectifyDetail.level)">
                {{ getSeverityText(rectifyDetail.level) }}
              </span>
            </div>
          </div>
          <div class="hero-due">
            <div class="due-label">整改期限</div>
            <div class="due-value" :class="{ overdue: getRectifyStatus(rectifyDetail) !== '已完成' && isOverdue(rectifyDetail) }">
              {{ rectifyDetail.due_date || '未设置' }}
            </div>
          </div>
        </div>

        <!-- 关键信息 -->
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">项目</div>
            <div class="info-value">{{ rectifyDetail.project_name || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">检查项</div>
            <div class="info-value">{{ rectifyDetail.category || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">负责人</div>
            <div class="info-value">{{ rectifyDetail.responsible_name || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">创建时间</div>
            <div class="info-value">{{ rectifyDetail.created_at || '-' }}</div>
          </div>
        </div>

        <div class="detail-block">
          <div class="block-label"><span class="block-bar"></span>问题描述</div>
          <div class="block-text">{{ rectifyDetail.issue_desc || rectifyDetail.description || '无' }}</div>
        </div>

        <div v-if="rectifyDetail.remark" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>备注 / 整改记录</div>
          <div class="block-text">{{ rectifyDetail.remark }}</div>
        </div>

        <div v-if="getRectifyImages(rectifyDetail).length > 0" class="detail-block">
          <div class="block-label">
            <span class="block-bar"></span>现场照片
            <span class="block-tip">{{ getRectifyImages(rectifyDetail).length }} 张</span>
          </div>
          <div class="detail-images">
            <el-image
              v-for="(img, idx) in getRectifyImages(rectifyDetail)"
              :key="idx"
              :src="img.startsWith('http') ? img : img"
              fit="cover"
              class="detail-img"
              :preview-src-list="getRectifyImages(rectifyDetail)"
              :preview-index="idx"
            />
          </div>
        </div>

        <!-- 受理信息（有受理人才显示） -->
        <div v-if="rectifyDetail.accept_name || rectifyDetail.accept_date" class="detail-block">
          <div class="block-label"><span class="block-bar"></span>受理信息</div>
          <div class="accept-line">
            <span class="avatar sm" :style="{ background: avatarBg(rectifyDetail.accept_name) }">
              {{ firstChar(rectifyDetail.accept_name) }}
            </span>
            <span>{{ rectifyDetail.accept_name || '-' }}</span>
            <span class="sep">·</span>
            <span class="muted">{{ rectifyDetail.accept_date || '时间未记录' }}</span>
          </div>
        </div>

        <!-- 延期记录 -->
        <div v-if="rectifyDelayLogs.length > 0" class="detail-block">
          <div class="block-label">
            <span class="block-bar"></span>延期记录
            <span class="block-tip">{{ rectifyDelayLogs.length }} 次</span>
          </div>
          <div class="delay-list">
            <div v-for="(log, idx) in rectifyDelayLogs" :key="idx" class="delay-item">
              <div class="delay-head">
                <span class="delay-no">第 {{ idx + 1 }} 次延期</span>
                <span class="delay-time">{{ log.at || '' }}</span>
              </div>
              <div class="delay-range">
                <span class="from">{{ log.from || '未设置' }}</span>
                <span class="arrow">→</span>
                <span class="to">{{ log.to || '-' }}</span>
              </div>
              <div v-if="log.reason" class="delay-meta">原因：{{ log.reason }}</div>
              <div v-if="log.by" class="delay-meta">操作人：{{ log.by }}</div>
            </div>
          </div>
        </div>

        <!-- 操作区：按业务流程分状态（与移动端口径一致） -->
        <!-- 待处理 → 受理（可同步修改整改截止时间） -->
        <div v-if="getRectifyStatus(rectifyDetail) === '待处理'" class="action-panel">
          <div class="panel-title"><span class="block-bar"></span>受理整改</div>
          <div class="panel-tip">
            原截止时间：{{ rectifyDetail.due_date || '未设置' }}。如时间不合理可一并调整：
          </div>
          <div class="panel-row">
            <el-date-picker v-model="fixForm.acceptDue" type="date" value-format="YYYY-MM-DD"
              placeholder="新截止时间（选填）" style="width:180px" size="small" />
            <el-input v-model="fixForm.acceptRemark" placeholder="受理说明（选填）" style="width:220px" size="small" />
            <el-button class="btn-primary-sm" size="small" :loading="fixing" @click="submitAccept">确认受理</el-button>
          </div>
        </div>
        <!-- 处理中 → 申请延期 / 申报完成 -->
        <div v-else-if="getRectifyStatus(rectifyDetail) === '处理中'" class="action-panel">
          <div class="panel-title"><span class="block-bar"></span>申请延期</div>
          <div class="panel-row">
            <el-date-picker v-model="fixForm.delayDue" type="date" value-format="YYYY-MM-DD"
              placeholder="延期至（必填）" style="width:170px" size="small" />
            <el-input v-model="fixForm.delayReason" placeholder="延期原因（必填）" style="width:220px" size="small" />
            <el-button size="small" :loading="fixing" @click="submitDelay">提交延期</el-button>
          </div>

          <div class="panel-title" style="margin-top:18px"><span class="block-bar"></span>申报完成</div>
          <div class="panel-row">
            <el-input v-model="fixForm.completeRemark" placeholder="完成说明（选填）" style="width:280px" size="small" />
            <el-button class="btn-success" size="small" :loading="fixing" @click="submitComplete">确认已完成</el-button>
          </div>
        </div>
        <!-- 已完成 → 终态 -->
        <div v-else class="closed-panel">
          <span class="closed-icon">✓</span>
          <div>
            <div class="closed-title">整改已结案</div>
            <div class="closed-sub">{{ rectifyDetail.finish_date ? '结案时间：' + rectifyDetail.finish_date : '该问题已完成闭环' }}</div>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-image-viewer v-if="previewVisible" :url-list="previewImagesList" @close="previewVisible=false" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Loading } from '@element-plus/icons-vue'
import request from '../utils/request'
import { inspectionApi } from '../utils/api'
import { useUserStore } from '../stores/user'
import { normalizeRectifyStatus, parseDelayLog, RECTIFY_STATE_TEXT } from '../utils/rectify'

const route = useRoute()
const userStore = useUserStore()

// 双 Tab：整改问题（rectification_issues，与移动端同源）/ 巡检记录（inspections）
const activeTab = ref('rectify')
const rectifyList = ref([])
const rectifyListLoading = ref(false)
const rectifyPage = ref(1)
const rectifyPageSize = ref(20)
const rectifyTotal = ref(0)
const rectifyFilterProject = ref(0)

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const viewVisible = ref(false)
const previewVisible = ref(false)
const isEdit = ref(false)
const logList = ref([])
const projectList = ref([])      // 筛选用：普通模式（尊重 read_all）
const pickProjectList = ref([])  // 表单用：picker 模式（只含我关联的项目，admin 全部）
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterProject = ref(0)
const viewLog = ref(null)
const previewImagesList = ref([])
const fileInputRef = ref(null)

// 整改详情弹窗
const rectifyVisible = ref(false)
const rectifyDetail = ref(null)
const rectifyLoading = ref(false)
const fixForm = reactive({
  content: '',
  remark: '',
  acceptDue: '',
  acceptRemark: '',
  delayDue: '',
  delayReason: '',
  completeRemark: ''
})
const fixing = ref(false)

const formImages = ref([]) // 每个元素: { localUrl: 'blob:xxx', serverUrl: '/uploads/logs/xxx.jpg', status: 'uploading'|'done'|'error', name: '' }
const uploadQueue = ref(0) // 上传中数量
const uploadingCount = ref(0) // 当前正在上传的图片数量

// 上传进度状态（遮挡层用）
const uploadProgress = reactive({
  visible: false,
  text: '正在上传图片…',
  percent: 0,
  total: 0,
  done: 0,
})

/* ---------- 仅用于展示的小工具 ---------- */
const firstChar = (name) => (name ? String(name).trim().charAt(0) : '?')
const AVATAR_COLORS = ['#2D5A8F', '#4A7BB7', '#5B8C5A', '#B8894A', '#8A6FA8', '#4F8A8B']
const avatarBg = (name) => {
  const s = String(name || '?')
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
const shortTime = (raw) => {
  if (!raw) return '-'
  return String(raw).replace('T', ' ').substring(5, 16)
}
const getSeverityIcon = (level) => {
  const s = String(level || '').toLowerCase()
  if (['serious', 'high', 'urgent', 'critical'].includes(s)) return '!'
  if (['medium', 'moderate'].includes(s)) return '~'
  return 'i'
}

const getImageUrl = (item) => {
  // 优先用本地预览URL（还没上传完时），上传完成后用服务器URL
  if (!item) return ''
  if (typeof item === 'string') {
    // 存储的图片路径如 /uploads/logs/xxx.png，直接返回（静态文件 mount 在 /uploads）
    if (item.startsWith('data:') || item.startsWith('http')) return item
    return item
  }
  if (item.serverUrl) return item.serverUrl
  if (item.localUrl) return item.localUrl
  return ''
}

const getPreviewList = () => formImages.value.map(item => getImageUrl(item))

// 压缩图片（最大边1920px，质量0.8）
const compressImage = (file) => {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1920
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name, { type: file.type || 'image/jpeg' }))
        } else {
          resolve(file)
        }
      }, 'image/jpeg', 0.8)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

const choosePhoto = () => fileInputRef.value?.click()

const onFileChange = async (e) => {
  const files = Array.from(e.target.files)
  if (!files.length) return
  e.target.value = ''

  const remain = 9 - formImages.value.length
  const toUpload = files.slice(0, remain)
  if (toUpload.length === 0) {
    ElMessage.warning('最多上传9张图片')
    return
  }

  // 初始化进度状态
  uploadProgress.visible = true
  uploadProgress.text = `正在上传 ${toUpload.length} 张图片…`
  uploadProgress.total = toUpload.length
  uploadProgress.done = 0
  uploadProgress.percent = 0

  // 并行上传：立即显示所有缩略图，同时开始上传
  const uploadTasks = toUpload.map(file => {
    const localUrl = URL.createObjectURL(file)
    const tempItem = { localUrl, serverUrl: '', status: 'uploading', name: file.name }
    formImages.value.push(tempItem)
    uploadQueue.value++

    return (async () => {
      try {
        // 先压缩图片
        const compressedFile = await compressImage(file)
        const fd = new FormData()
        fd.append('file', compressedFile)
        const res = await request.post('/upload-image', fd, { timeout: 30000 })
        if (res && res.url) {
          const item = formImages.value.find(i => i.localUrl === localUrl)
          if (item) {
            URL.revokeObjectURL(item.localUrl)
            item.localUrl = ''
            item.serverUrl = res.url
            item.status = 'done'
          }
        } else {
          const item = formImages.value.find(i => i.localUrl === localUrl)
          if (item) item.status = 'error'
        }
      } catch (err) {
        const item = formImages.value.find(i => i.localUrl === localUrl)
        if (item) item.status = 'error'
        console.error(`图片 ${file.name} 上传失败`, err)
      } finally {
        uploadQueue.value--
        uploadProgress.done++
        uploadProgress.percent = Math.round((uploadProgress.done / uploadProgress.total) * 100)
        uploadProgress.text = `正在上传 ${uploadProgress.total - uploadProgress.done} / ${uploadProgress.total}…`
      }
    })()
  })

  Promise.all(uploadTasks).then(() => {
    const failed = formImages.value.filter(i => i.status === 'error').length
    const success = uploadProgress.total - failed
    if (failed > 0) {
      uploadProgress.visible = false
      ElMessage.warning(`${failed} 张图片上传失败，请删除后重试`)
    } else {
      uploadProgress.visible = false
    }
  })
}

const removeImage = (idx) => {
  const item = formImages.value[idx]
  if (item?.localUrl) URL.revokeObjectURL(item.localUrl)
  formImages.value.splice(idx, 1)
}

const getImageCount = (imagesField) => {
  if (!imagesField) return 0
  try {
    let val = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField
    if (typeof val === 'string') val = JSON.parse(val)
    return Array.isArray(val) ? val.length : 0
  } catch { return 0 }
}

const getViewImages = (imagesField) => {
  if (!imagesField) return []
  try {
    let val = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField
    if (typeof val === 'string') val = JSON.parse(val)
    return Array.isArray(val) ? val : []
  } catch { return [] }
}

// 图片预览（旧版模板里调用了但函数缺失，2026-10-29 补齐）
const previewImages = (row) => {
  const imgs = getViewImages(row.images)
  if (!imgs.length) return
  previewImagesList.value = imgs.map(g => getImageUrl(g))
  previewVisible.value = true
}

/* ---------- 整改问题列表（rectification_issues，与移动端同源） ---------- */
const loadRectifyList = async () => {
  rectifyListLoading.value = true
  try {
    const params = {}
    if (rectifyFilterProject.value) params.project_id = rectifyFilterProject.value
    const res = await request.get('/rectification-issues', { params })
    const raw = Array.isArray(res) ? res : (res.list || res.data || [])
    rectifyList.value = raw
    rectifyTotal.value = raw.length
  } catch (e) {
    console.error('加载整改问题失败', e)
    rectifyList.value = []
    rectifyTotal.value = 0
  } finally {
    rectifyListLoading.value = false
  }
}

const onTabChange = (name) => {
  if (name === 'rectify') loadRectifyList()
  else loadLogs()
}

const isOverdue = (row) => {
  if (!row || !row.due_date) return false
  // 已结案不再算逾期。注意 getRectifyStatus 返回的是归一化文本（待处理/处理中/已完成），
  // 库里旧的「已整改」已于 2026-10-23 统一刷成「已完成」，不能再拿旧名比较。
  if (getRectifyStatus(row) === '已完成') return false
  const due = new Date(String(row.due_date).replace(' ', 'T'))
  if (isNaN(due.getTime())) return false
  return due.getTime() < Date.now()
}

const handleDeleteRectify = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除这条整改问题？', '删除确认', { type: 'warning' })
    await request.delete(`/rectification-issues/${row.id}`)
    ElMessage.success('删除成功')
    loadRectifyList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

// v2.3.6 hotfix（10-15）：走 inspections 表（之前走 /api/project-logs?type=inspection 是错接口）
// 后端返回字段：inspector_name / project_name / result / issues / images / score / status / rectify_status
// 前端模板字段：operator / location / result —— loadLogs 里做映射让模板不用改
const loadLogs = async () => {
  loading.value = true
  try {
    const params = {}
    if (filterProject.value) params.project_id = filterProject.value
    const res = await inspectionApi.list(params)
    const raw = Array.isArray(res) ? res : (res.list || res.data || [])
    // 字段映射：后端 inspector_name → 前端 operator；location 用 project_name 兜底
    logList.value = raw.map(item => ({
      ...item,
      operator: item.inspector_name || item.operator || '',
      location: item.project_name || item.location || '',
    }))
    total.value = raw.length
  } catch (e) {
    console.error('加载巡检日志失败', e)
    logList.value = []
  } finally {
    loading.value = false
  }
}

const loadProjects = async () => {
  try {
    // 两个列表，用途不同：
    //   projectList     —— 顶部筛选，保持普通模式（尊重 project:read_all）
    //   pickProjectList —— 新建巡检表单的「项目」下拉，?picker=1 只给「我实际关联的项目」（admin 全部）
    const [all, mine] = await Promise.all([
      request.get('/projects').catch(() => []),
      request.get('/projects?picker=1').catch(() => [])
    ])
    projectList.value = Array.isArray(all) ? all : (all.data || [])
    pickProjectList.value = Array.isArray(mine) ? mine : (mine.data || [])
  } catch (e) {
    projectList.value = []
    pickProjectList.value = []
  }
}

const form = reactive({
  id: null,
  project_id: null,
  inspection_date: '',
  location: '',
  result: '',
  issues: '',
  note: '',
  operator: ''
})

const canEdit = (log) => {
  if (userStore.isAdmin) return true
  return log.operator === userStore.userName
}

const openAddDialog = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null, project_id: null, inspection_date: '', location: '',
    result: '', issues: '', note: '', operator: userStore.userName
  })
  // 清空图片（释放 blob URL）
  for (const item of formImages.value) {
    if (item.localUrl) URL.revokeObjectURL(item.localUrl)
  }
  formImages.value = []
  dialogVisible.value = true
}

const handleView = (row) => {
  viewLog.value = row
  viewVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除这条巡检记录？', '删除确认', { type: 'warning' })
    await inspectionApi.delete(row.id)
    ElMessage.success('删除成功')
    loadLogs()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

/* ---------- 整改详情 ---------- */
const openRectifyDetail = (id) => {
  if (!id) return
  loadRectifyDetail(id)
}

const loadRectifyDetail = async (id) => {
  rectifyLoading.value = true
  try {
    const res = await request.get(`/rectification-issues/${id}`)
    const data = res.data || res
    rectifyDetail.value = data
    rectifyVisible.value = true
    fixForm.content = ''
    fixForm.remark = data?.remark || ''
  } catch (e) {
    console.error('加载整改详情失败', e)
    ElMessage.error('加载整改详情失败')
  } finally {
    rectifyLoading.value = false
  }
}

const getRectifyImages = (item) => {
  if (!item) return []
  if (!item.images) return []
  try {
    const arr = typeof item.images === 'string' ? JSON.parse(item.images) : item.images
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

const getRectifyStatus = (item) => {
  if (!item) return '未知'
  // 统一走归一化口径（与移动端 utils/rectify 一致）：
  // 库里 status 实际是「待处理」，旧的白名单判断会漏掉它。
  return RECTIFY_STATE_TEXT[normalizeRectifyStatus(item.status || item.rectify_status)]
}

// 延期历史（后端 delay_log 为 JSON 字符串，兼容数组）
const rectifyDelayLogs = computed(() => parseDelayLog(rectifyDetail.value?.delay_log))

const getRectifyStatusType = (item) => {
  // 归一化口径：已完成→绿、处理中→橙、待处理→红（旧的「已整改/整改中」比较永不命中）
  const s = getRectifyStatus(item)
  if (s === '已完成') return 'success'
  if (s === '处理中') return 'warning'
  return 'danger'
}

const getSeverityText = (level) => {
  if (!level) return '一般'
  const map = {
    // 英文枚举（库里实际存的值）
    serious: '严重', high: '严重', urgent: '紧急', critical: '严重',
    medium: '中等', moderate: '中等',
    normal: '一般', low: '一般', minor: '一般'
  }
  return map[String(level).toLowerCase()] || level
}

const getSeverityTagType = (level) => {
  const s = String(level || '').toLowerCase()
  if (['serious', 'high', 'urgent', 'critical'].includes(s)) return 'danger'
  if (['medium', 'moderate'].includes(s)) return 'warning'
  return 'info'
}

// ===== 业务流程三动作：受理 / 延期 / 申报完成（与移动端 utils/rectify 同口径）=====

// 受理：待处理 → 处理中（可同步修改整改截止时间）
const submitAccept = async () => {
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const payload = { action: 'accept', remark: fixForm.acceptRemark }
    if (fixForm.acceptDue) payload.new_due_date = fixForm.acceptDue
    const res = await request.put(`/rectification-issues/${id}`, payload)
    const d = res.data || res
    ElMessage.success(d.message || '已受理')
    rectifyDetail.value.status = '处理中'
    if (fixForm.acceptDue) rectifyDetail.value.due_date = fixForm.acceptDue
    if (d.accept_name) rectifyDetail.value.accept_name = d.accept_name
    if (d.accept_date) rectifyDetail.value.accept_date = d.accept_date
    fixForm.acceptDue = ''
    fixForm.acceptRemark = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '受理失败')
  } finally {
    fixing.value = false
  }
}

// 延期：处理中 → 处理中（改截止时间 + 必填原因，后端记 delay_log）
const submitDelay = async () => {
  if (!fixForm.delayDue) { ElMessage.warning('请选择延期后的截止时间'); return }
  if (!String(fixForm.delayReason || '').trim()) { ElMessage.warning('请填写延期原因'); return }
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const res = await request.put(`/rectification-issues/${id}`, {
      action: 'delay',
      new_due_date: fixForm.delayDue,
      delay_reason: String(fixForm.delayReason).trim()
    })
    const d = res.data || res
    ElMessage.success(d.message || '已延期')
    rectifyDetail.value.due_date = fixForm.delayDue
    if (Array.isArray(d.delay_log)) rectifyDetail.value.delay_log = JSON.stringify(d.delay_log)
    fixForm.delayDue = ''
    fixForm.delayReason = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '延期失败')
  } finally {
    fixing.value = false
  }
}

// 申报完成：处理中（或历史遗留的待处理）→ 已完成（终态）
const submitComplete = async () => {
  fixing.value = true
  try {
    const id = rectifyDetail.value?.id
    const res = await request.put(`/rectification-issues/${id}`, {
      action: 'complete',
      remark: fixForm.completeRemark || '已整改完成'
    })
    const d = res.data || res
    ElMessage.success(d.message || '已结案')
    rectifyDetail.value.status = '已完成'
    if (d.finish_date) rectifyDetail.value.finish_date = d.finish_date
    fixForm.completeRemark = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '提交失败')
  } finally {
    fixing.value = false
  }
}

const handleSave = async () => {
  if (!form.result.trim()) {
    ElMessage.warning('巡检结果不能为空')
    return
  }
  if (!form.project_id) {
    ElMessage.warning('请选择项目')
    return
  }
  // 等待所有图片上传完成（最多等待60秒）
  if (uploadQueue.value > 0) {
    saving.value = true
    uploadProgress.visible = true
    uploadProgress.text = '图片正在上传中…'
    uploadProgress.percent = 0
    const maxWait = 60000
    const startTime = Date.now()
    while (uploadQueue.value > 0) {
      if (Date.now() - startTime > maxWait) {
        uploadProgress.visible = false
        ElMessage.error('图片上传超时，请检查网络后重试')
        saving.value = false
        return
      }
      await new Promise(r => setTimeout(r, 200))
    }
    const failedImages = formImages.value.filter(i => i.status === 'error')
    if (failedImages.length > 0) {
      uploadProgress.visible = false
      ElMessage.warning(`${failedImages.length} 张图片上传失败，请删除后重试`)
      saving.value = false
      return
    }
    uploadProgress.visible = false
  } else {
    const failedImages = formImages.value.filter(i => i.status === 'error')
    if (failedImages.length > 0) {
      ElMessage.warning(`${failedImages.length} 张图片上传失败，请删除后重试`)
      return
    }
  }

  saving.value = true
  try {
    // v2.3.6 hotfix（10-15）：映射到 inspections 表字段
    // 前端 form: { project_id, inspection_date, location, result, issues, note, operator }
    // 后端 inspections: { project_id, project_name, inspector_name, result, issues, images }
    // location / inspection_date / note 这 3 个字段 inspections 表没对应列，拼接到 issues 一起存
    const projectObj = projectList.value.find(p => String(p.id) === String(form.project_id))
    const projectName = projectObj?.name || ''
    const extraLines = []
    if (form.inspection_date) extraLines.push(`巡检日期：${form.inspection_date}`)
    if (form.location) extraLines.push(`巡检地点：${form.location}`)
    if (form.note) extraLines.push(`备注：${form.note}`)
    const mergedIssues = (form.issues || '').trim() +
      (extraLines.length ? '\n\n' + extraLines.join('\n') : '')

    const data = {
      project_id: form.project_id,
      project_name: projectName,
      inspector_name: form.operator || userStore.userName,
      result: form.result,
      issues: mergedIssues,
      images: formImages.value.map(i => i.serverUrl).filter(Boolean),
      // status / rectify_status 默认 '待整改' 由后端填
    }
    if (isEdit.value) {
      await inspectionApi.update(form.id, data)
    } else {
      await inspectionApi.create(data)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    // 新增写的是 inspections 表，切到「巡检记录」tab 才看得到
    activeTab.value = 'inspections'
    loadLogs()
  } catch (e) {
    console.error('保存失败', e)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  // 默认展示「整改问题」（实际有数据的那张表，与移动端同源）
  loadRectifyList()
  loadProjects()
  // 从待办中心跳转：?id=整改记录ID
  if (route.query.id) {
    activeTab.value = 'rectify'
    openRectifyDetail(route.query.id)
  }
})
</script>

<style scoped>
.inspection-logs { padding: 0; }

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
.proj-select { width: 200px; }
.proj-select :deep(.el-select__wrapper) { border-radius: 10px; }
.btn-add {
  border-radius: 10px;
  padding: 0 18px;
  height: 34px;
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
}
.btn-add:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 主卡片 & Tab ==================== */
.main-card {
  background: #fff;
  border-radius: 14px;
  padding: 8px 18px 8px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
}
.insp-tabs :deep(.el-tabs__header) { margin-bottom: 14px; }
.insp-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: #eef1f6; }
.insp-tabs :deep(.el-tabs__item) {
  height: 46px;
  line-height: 46px;
  font-size: 14px;
  color: #7b8b9e;
  padding: 0 18px;
}
.insp-tabs :deep(.el-tabs__item.is-active) { color: #1E3A5F; font-weight: 600; }
.insp-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, #4A7BB7, #1E3A5F);
}
.tab-label { display: inline-flex; align-items: center; gap: 7px; }
.tab-badge {
  font-size: 11px;
  font-weight: 600;
  color: #1E3A5F;
  background: #EAF0F7;
  border-radius: 9px;
  padding: 0 7px;
  line-height: 17px;
  font-family: ui-monospace, Menlo, monospace;
}
.tab-badge.zero { color: #a8abb2; background: #f4f6f9; }

/* ==================== 表格 ==================== */
.insp-table { --el-table-border-color: #f0f2f5; }
.insp-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.insp-table :deep(td.el-table__cell) { padding: 12px 0; border-bottom: 1px solid #f5f7fa; }
.insp-table :deep(.el-table__row) { transition: background .15s; }
.insp-table :deep(.el-table__row:hover > td.el-table__cell) { background: #f5f9ff !important; }

/* 问题单元格 */
.issue-cell { display: flex; align-items: flex-start; gap: 11px; }
.issue-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}
.issue-main { min-width: 0; }
.issue-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}
.issue-desc {
  font-size: 12px;
  color: #7b8b9e;
  margin-top: 3px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 380px;
  word-break: break-word;
}

.proj-line { font-size: 13px; color: #303133; font-weight: 500; }
.loc-line { font-size: 12px; color: #a8abb2; margin-top: 4px; }

/* 严重程度 */
.level-pill {
  display: inline-block;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 8px;
  line-height: 18px;
  font-weight: 500;
}
.lv-danger { color: #c45656; background: #fef0f0; }
.lv-warning { color: #b88230; background: #fdf6ec; }
.lv-info { color: #4a6fa5; background: #f0f5ff; }

/* 负责人 */
.user-cell { display: flex; align-items: center; gap: 8px; }
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.avatar.sm { width: 22px; height: 22px; border-radius: 7px; font-size: 11px; }
.user-main { min-width: 0; }
.user-name { font-size: 13px; color: #303133; font-weight: 500; }
.user-time { font-size: 11px; color: #a8abb2; margin-top: 2px; }

/* 期限 */
.due-cell { display: flex; flex-direction: column; gap: 3px; }
.due-date { font-size: 13px; color: #606266; }
.due-date.overdue { color: #F56C6C; font-weight: 600; }
.overdue-badge {
  display: inline-block;
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: #DC2626;
  background: #FEF2F2;
  border: 1px solid #FCA5A5;
  border-radius: 7px;
  padding: 0 6px;
  line-height: 17px;
}

/* 状态 */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
  line-height: 19px;
}
.status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.st-success { color: #529b2e; background: #f0f9eb; }
.st-warning { color: #b88230; background: #fdf6ec; }
.st-danger { color: #c45656; background: #fef0f0; }

/* 缩略图 */
.thumb-stack { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.thumb {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eef1f6;
  flex-shrink: 0;
  transition: transform .15s;
}
.thumb-stack:hover .thumb { transform: translateY(-1px); }
.thumb-img { width: 100%; height: 100%; display: block; }
.thumb-more {
  font-size: 11px;
  color: #7b8b9e;
  background: #f4f6f9;
  border-radius: 7px;
  padding: 1px 6px;
  line-height: 18px;
}

.btn-primary-sm {
  border-radius: 8px;
  border: 1px solid #1E3A5F;
  background: #1E3A5F;
  color: #fff;
  padding: 5px 12px;
  font-size: 12px;
}
.btn-primary-sm:hover { background: #2D5A8F; border-color: #2D5A8F; color: #fff; }
.btn-success {
  border-radius: 8px;
  border: 1px solid #67C23A;
  background: #67C23A;
  color: #fff;
}
.btn-success:hover { background: #7dd14f; border-color: #7dd14f; color: #fff; }
.btn-link { font-size: 13px; padding: 0 6px; color: #2D5A8F; }
.btn-link.danger { color: #F56C6C; }
.btn-link:hover { opacity: .8; }
.muted { color: #c0c4cc; }

/* 空状态 */
.empty-state { padding: 44px 0 34px; text-align: center; }
.empty-icon { font-size: 40px; line-height: 1; opacity: .75; }
.empty-title { font-size: 14px; font-weight: 600; color: #606266; margin-top: 12px; }
.empty-sub { font-size: 12px; color: #a8abb2; margin-top: 6px; }

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 12px 0 8px;
  border-top: 1px solid #f5f7fa;
}

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
.btn-save {
  background: linear-gradient(135deg, #2D5A8F, #1E3A5F);
  border: none;
  border-radius: 10px;
  padding: 0 24px;
  box-shadow: 0 4px 12px rgba(30, 58, 95, .22);
}
.btn-save:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 表单 ==================== */
.insp-form { max-height: 64vh; overflow-y: auto; padding-right: 6px; }
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
.form-row { display: flex; gap: 12px; }
.form-row :deep(.el-form-item) { flex: 1; min-width: 0; }
.insp-form :deep(.el-form-item) { margin-bottom: 14px; }
.insp-form :deep(.el-form-item__label) { color: #606266; font-size: 13px; }
.insp-form :deep(.el-input__wrapper),
.insp-form :deep(.el-textarea__inner) { border-radius: 8px; }
.insp-form :deep(.el-textarea__inner) { background: #fff; }

/* ==================== 图片上传 ==================== */
.photo-upload-list { display: flex; flex-wrap: wrap; gap: 8px; }
.photo-item {
  position: relative;
  width: 82px;
  height: 82px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
}
.photo-item.photo-uploading { border-color: #409eff; }
.photo-item.photo-error { border-color: #f56c6c; }
.photo-thumb { width: 100%; height: 100%; display: block; }
.photo-remove {
  position: absolute;
  top: 0; right: 0;
  width: 20px; height: 20px;
  background: rgba(0, 0, 0, .55);
  color: #fff;
  text-align: center;
  line-height: 19px;
  cursor: pointer;
  font-size: 15px;
  border-bottom-left-radius: 8px;
}
.photo-add {
  width: 82px;
  height: 82px;
  border: 1px dashed #d3dce8;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  font-size: 12px;
  gap: 4px;
  background: #fff;
  transition: all .15s;
}
.photo-add:hover { border-color: #409eff; color: #409eff; background: #f5f9ff; }
.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.photo-overlay-error { background: rgba(245, 108, 108, .3); }
.photo-spinner {
  width: 24px; height: 24px;
  border: 3px solid rgba(255, 255, 255, .3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

/* ==================== 详情通用 ==================== */
.detail-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f4f8fd, #eef4fa);
  border: 1px solid #e3ecf6;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.detail-hero.hero-danger { background: linear-gradient(135deg, #fff7f7, #fdeeee); border-color: #fadcdc; }
.detail-hero.hero-warning { background: linear-gradient(135deg, #fffcf3, #fdf6e7); border-color: #f7e6c4; }
.detail-hero.hero-success { background: linear-gradient(135deg, #f6fbf3, #eef8e9); border-color: #dcefd5; }
.hero-left { min-width: 0; flex: 1; }
.hero-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.hero-title { font-size: 16px; font-weight: 700; color: #1f2d3d; line-height: 1.4; }
.hero-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.hero-due { text-align: right; flex-shrink: 0; }
.due-label { font-size: 12px; color: #909399; }
.due-value { font-size: 15px; font-weight: 700; color: #1E3A5F; margin-top: 3px; font-family: ui-monospace, Menlo, monospace; }
.due-value.overdue { color: #F56C6C; }

.soft-tag {
  display: inline-block;
  font-size: 12px;
  color: #4a6fa5;
  background: #f0f5ff;
  border-radius: 7px;
  padding: 1px 8px;
  line-height: 19px;
}
.soft-tag.gray { color: #6b7a8d; background: rgba(255, 255, 255, .75); }

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.info-item {
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 9px 12px;
}
.info-label { font-size: 12px; color: #909399; }
.info-value { font-size: 13px; color: #303133; font-weight: 500; margin-top: 3px; word-break: break-all; }

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
  line-height: 1.75;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 11px 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.detail-img {
  width: 100%;
  height: 104px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid #eef1f6;
  transition: transform .15s, box-shadow .15s;
}
.detail-img:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 21, 41, .12); }
.detail-foot {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed #eef1f6;
}

.accept-line { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #303133; }
.accept-line .sep { color: #c8ccd4; }

/* 延期记录 */
.delay-list { display: flex; flex-direction: column; gap: 8px; }
.delay-item {
  background: #fffbf3;
  border: 1px solid #f7e6c4;
  border-left: 3px solid #E6A23C;
  border-radius: 10px;
  padding: 10px 14px;
}
.delay-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.delay-no { font-size: 12px; font-weight: 700; color: #b88230; }
.delay-time { font-size: 11px; color: #a8abb2; }
.delay-range { font-size: 13px; color: #606266; margin-top: 5px; font-family: ui-monospace, Menlo, monospace; }
.delay-range .arrow { margin: 0 6px; color: #c8ccd4; }
.delay-range .to { color: #F56C6C; font-weight: 600; }
.delay-meta { font-size: 12px; color: #909399; margin-top: 3px; }

/* 操作区 */
.action-panel {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 12px;
  background: #fafbfd;
  border: 1px solid #eef1f6;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E3A5F;
  margin-bottom: 10px;
}
.panel-tip { font-size: 12px; color: #909399; margin-bottom: 10px; }
.panel-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.panel-row :deep(.el-input__wrapper) { border-radius: 8px; }

.closed-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 14px 18px;
  border-radius: 12px;
  background: #f6fbf3;
  border: 1px solid #dcefd5;
}
.closed-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #67C23A;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}
.closed-title { font-size: 14px; font-weight: 600; color: #529b2e; }
.closed-sub { font-size: 12px; color: #7b9b6b; margin-top: 2px; }

.loading-state { text-align: center; padding: 46px 0; color: #909399; font-size: 13px; }
.loading-state p { margin-top: 10px; }

/* ==================== 上传遮挡层 ==================== */
.upload-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(255, 255, 255, .92);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
:deep(.el-dialog__body) { position: relative; }
.upload-overlay-content { text-align: center; padding: 32px; min-width: 200px; }
.upload-spinner-large {
  width: 48px; height: 48px;
  border: 4px solid #e4e7ed;
  border-top-color: #2D5A8F;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  margin: 0 auto 20px;
}
.upload-progress-text { font-size: 14px; color: #303133; margin-bottom: 16px; font-weight: 500; }
.upload-progress-bar-wrap {
  width: 200px; height: 8px;
  background: #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 10px;
}
.upload-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4A7BB7, #1E3A5F);
  border-radius: 4px;
  transition: width .3s ease;
  min-width: 4px;
}
.upload-progress-percent { font-size: 20px; font-weight: 700; color: #1E3A5F; font-variant-numeric: tabular-nums; }

@keyframes spin { to { transform: rotate(360deg); } }

/* 项目选择器为空时的提示（picker 模式只返回我关联的项目） */
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
  .info-grid { grid-template-columns: repeat(2, 1fr); }
}
@media screen and (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head-right { width: 100%; }
  .proj-select { flex: 1; width: auto; }
  .main-card { padding: 6px 10px 4px; }
  .pagination-wrap { justify-content: center; }
  .form-row { flex-direction: column; gap: 0; }
  .info-grid { grid-template-columns: repeat(2, 1fr); }
  .detail-images { grid-template-columns: repeat(3, 1fr); }
  .detail-img { height: 88px; }
  .hero-due { text-align: left; }
}
</style>
