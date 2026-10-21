<template>
  <div class="roles">
    <!-- 页面头（与客户列表等页面统一） -->
    <div class="page-head">
      <div class="page-head-left">
        <h2 class="page-title">角色管理</h2>
        <p class="page-sub">
          配置每个角色能看什么、能改什么、能审批什么，共 <b>{{ roleList.length }}</b> 个角色
        </p>
      </div>
      <div class="page-head-right">
        <el-button class="btn-add" type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          <span>新增角色</span>
        </el-button>
      </div>
    </div>

    <!-- 概览统计 -->
    <div class="stat-grid">
      <div v-for="s in roleStats" :key="s.key" class="stat-card">
        <div class="stat-icon" :style="{ background: s.soft, color: s.color }">
          <el-icon><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
        <span class="stat-accent" :style="{ background: s.color }"></span>
      </div>
    </div>

    <!-- 快捷创建：预设模板 -->
    <div class="preset-panel">
      <div class="panel-head">
        <span class="panel-title">快捷创建</span>
        <span class="panel-sub">按预设模板一键生成角色，生成后仍可逐项调整权限</span>
      </div>
      <div class="preset-grid">
        <button
          v-for="preset in presetRoles"
          :key="preset.code"
          type="button"
          class="preset-item"
          @click="handleQuickCreate(preset)"
        >
          <span class="preset-avatar" :style="{ background: presetMeta(preset.code).soft, color: presetMeta(preset.code).color }">
            {{ preset.name.slice(0, 1) }}
          </span>
          <span class="preset-body">
            <span class="preset-name">{{ preset.name }}</span>
            <span class="preset-desc">{{ preset.description }}</span>
          </span>
          <span class="preset-go">创建</span>
        </button>
      </div>
    </div>

    <!-- 角色列表 -->
    <div class="table-card">
      <div class="panel-head">
        <span class="panel-title">全部角色</span>
        <span class="panel-sub">{{ roleList.length }} 个</span>
      </div>
      <el-table :data="roleList" class="role-table" style="width: 100%">
        <el-table-column label="角色" min-width="240">
          <template #default="scope">
            <div class="role-cell">
              <span
                class="role-avatar"
                :style="{ background: presetMeta(scope.row.code).soft, color: presetMeta(scope.row.code).color }"
              >
                {{ (scope.row.name || '?').slice(0, 1) }}
              </span>
              <div class="role-main">
                <div class="role-name">
                  {{ scope.row.name }}
                  <span v-if="scope.row.code === 'admin'" class="role-badge">超管</span>
                </div>
                <div class="role-code">{{ scope.row.code }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="240" show-overflow-tooltip>
          <template #default="scope">
            <span class="role-desc">{{ scope.row.description || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="权限项" width="110">
          <template #default="scope">
            <span class="perm-count" :class="{ 'is-all': isAllPerms(scope.row.permissions) }">
              {{ permCountText(scope.row.permissions) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="scope">
            <el-button link type="primary" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showDialog" :title="isEdit ? '编辑角色' : '新增角色'" width="900px" top="6vh" @closed="resetForm">
      <el-tabs v-model="activeTab">
        <!-- Tab1 - 角色信息 -->
        <el-tab-pane label="角色信息" name="info">
          <div class="form-panel">
            <div class="form-card">
              <div class="form-card__head">
                <span class="form-card__title">基本信息</span>
                <span class="form-card__sub">名称会显示在员工档案里，编码用于系统内部识别</span>
              </div>
              <el-form :model="form" label-width="90px" label-position="left">
                <el-form-item label="角色名称" required>
                  <el-input v-model="form.name" placeholder="例如：项目经理" />
                </el-form-item>
                <el-form-item label="角色编码" required>
                  <el-input
                    v-model="form.code"
                    placeholder="英文标识，例如 manager"
                    :disabled="form.code === 'admin'"
                  />
                  <div class="form-hint">
                    全系统唯一。改编码等于换了一个角色，已分配的员工会失去原有权限，建议只改名称。
                  </div>
                </el-form-item>
                <el-form-item label="角色描述">
                  <el-input
                    v-model="form.description"
                    type="textarea"
                    :rows="3"
                    placeholder="一句话说明这个角色负责什么，方便以后辨认"
                  />
                </el-form-item>
              </el-form>
            </div>
            <div class="form-card form-card--tip">
              <span class="form-card__title">配置顺序建议</span>
              <ol class="tip-steps">
                <li>先填基本信息，确定角色名称与编码</li>
                <li>再到「功能权限」勾选能看到、能改、能审批的模块</li>
                <li>需要限制员工可见范围时，用「可管理部门」收窄</li>
                <li>最后在「消息订阅」勾选这个角色需要接收的提醒</li>
              </ol>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab2 - 功能权限
             版式重构：原 7 列 × 27 行表格 → 按业务分组的能力卡片。
             仅改展示：勾选仍绑定 moduleList 的 hasAll/read/write/delete/reset_password/approve/finance_action，
             handleSave / originalPerms / isActionExposed / parsePermissionsToModules 全部未改动。 -->
        <el-tab-pane label="功能权限" name="permissions">
          <div class="perm-panel" :class="{ 'is-admin': isAllPermission }">
            <!-- 能力摘要：一眼看出这个角色大概能干嘛 -->
            <div class="perm-summary">
              <div class="perm-summary__main">
                <span class="perm-summary__title">{{ form.name || '未命名角色' }}</span>
                <span v-if="!isAllPermission" class="perm-summary__sub">
                  已开 <b>{{ roleSummary.granted }}</b> / {{ roleSummary.total }} 项 · 覆盖 {{ roleSummary.mods }} 个模块
                </span>
                <span v-else class="perm-summary__sub">超级管理员，拥有全部权限，无需逐项配置</span>
              </div>
              <div v-if="!isAllPermission" class="perm-summary__stats">
                <span class="stat-pill">可见 {{ roleSummary.read }}</span>
                <span class="stat-pill">可编辑 {{ roleSummary.write }}</span>
                <span class="stat-pill is-stage">可审批 {{ roleSummary.stage }}</span>
              </div>
            </div>

            <!-- 说明：折叠收起，不再堆在表格底部 -->
            <el-collapse v-model="helpOpen" class="perm-help">
              <el-collapse-item name="help">
                <template #title>
                  <span class="perm-help__title">配置说明 · 这些开关到底在管什么</span>
                </template>
                <div class="perm-help__body">
                  <p><b>两类开关不是一回事。</b>蓝色胶囊是「数据能力」——能看到什么、能改什么；琥珀色胶囊是「流程关卡」——单据流转到你手上时，你能不能点通过。</p>
                  <p><b>查看全部</b>：不勾 = 只看自己参与的项目和自己创建的数据；勾上 = 全公司数据都能看。</p>
                  <p><b>审批 → 财务受理</b>：这是同一张单据上的两个连续关卡。以采购为例：提交申请 → 审批（审批人点通过/驳回）→ 财务受理（财务确认付款、上传回执）→ 报销完成。勾了「审批」的人只会看到「待我审批」，勾了「财务受理」的人只会看到「待我受理」，两者互相独立，可以给不同的人。</p>
                  <p><b>员工模块</b>口径：勾「查看」= 全内部员工可见；勾「查看全部」= 含外部人员；都不勾 = 仅本人。可结合「可管理部门」页签把范围收窄到指定部门。</p>
                  <p class="perm-help__note">注：目前只有「采购管理」有完整的审批 + 财务受理关卡，所以财务受理只在采购卡片上出现。</p>
                  <p><b>名字后面标「仅菜单」的模块</b>（审批管理、报表管理）：后端没有针对这两处做权限校验，勾选只控制左侧菜单是否显示，不改变能看到的数据。配置时不必纠结里面的细分项 —— 给不给，取决于你想不想让这个角色在菜单里看到它。</p>
                </div>
              </el-collapse-item>
            </el-collapse>

            <!-- 过滤：只看已授权 -->
            <div class="perm-toolbar">
              <el-checkbox v-model="onlyGranted" class="perm-filter">只看已授权</el-checkbox>
              <span v-if="onlyGranted" class="perm-toolbar__hint">已隐藏未授权的模块</span>
            </div>

            <!-- 分组卡片 -->
            <section v-for="group in groupedModules" :key="group.key" class="perm-group">
              <header class="perm-group__head">
                <span class="perm-group__name">{{ group.name }}</span>
                <span class="perm-group__sub">{{ group.count }} 个模块 · 已开 {{ group.granted }} 项</span>
                <span v-if="!isAllPermission" class="perm-group__ops">
                  <el-button link type="primary" @click="setGroupPermissions(group, true)">全选</el-button>
                  <span class="perm-group__sep">/</span>
                  <el-button link @click="setGroupPermissions(group, false)">清空</el-button>
                </span>
              </header>
              <div class="perm-cards">
                <article
                  v-for="row in group.rows"
                  :key="row.key"
                  class="perm-card"
                  :class="{ 'is-granted': moduleGrantedCount(row) > 0, 'is-wide': row.key === 'purchase' }"
                >
                  <div class="perm-card__head">
                    <span class="perm-card__name">{{ row.name }}</span>
                    <el-tooltip
                      v-if="MENU_ONLY_TIPS[row.key]"
                      :content="MENU_ONLY_TIPS[row.key]"
                      placement="top"
                      :show-after="120"
                      :persistent="false"
                    >
                      <span class="perm-card__tag">仅菜单</span>
                    </el-tooltip>
                    <el-tooltip
                      :content="MODULE_TIPS[row.key] || row.name"
                      placement="top"
                      :show-after="120"
                      :persistent="false"
                    >
                      <span class="perm-card__info">i</span>
                    </el-tooltip>
                    <span class="perm-card__count">{{ moduleGrantedCount(row) }}/{{ actionsOf(row).length }}</span>
                  </div>
                  <div class="perm-card__chips">
                    <el-tooltip
                      v-for="act in actionsOf(row)"
                      :key="act"
                      :content="ACTION_META[act].tip"
                      placement="top"
                      :show-after="120"
                      :persistent="false"
                    >
                      <el-checkbox
                        v-model="row[act]"
                        :disabled="isAllPermission"
                        :class="['perm-chip', 'perm-chip--' + ACTION_META[act].type]"
                      >
                        {{ ACTION_META[act].label }}
                      </el-checkbox>
                    </el-tooltip>
                  </div>
                  <!-- 采购管理：唯一具备「审批 → 财务受理」完整关卡的模块，把流程链直接画出来 -->
                  <div v-if="row.key === 'purchase'" class="perm-flow">
                    <span class="perm-flow__text">提交申请</span>
                    <span class="perm-flow__arrow">→</span>
                    <span class="perm-flow__node" :class="{ 'is-active': row.approve }">审批</span>
                    <span class="perm-flow__arrow">→</span>
                    <span class="perm-flow__node" :class="{ 'is-active': row.finance_action }">财务受理</span>
                    <span class="perm-flow__arrow">→</span>
                    <span class="perm-flow__text">报销完成</span>
                    <span class="perm-flow__hint">同一张单子的两个关卡</span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </el-tab-pane>

        <!-- Tab3 - 消息订阅（按业务分组的胶囊，逻辑不变：仍是 selectedNotifications 数组） -->
        <el-tab-pane label="消息订阅" name="notifications">
          <el-checkbox-group v-model="selectedNotifications" class="notif-panel">
            <div class="notif-toolbar">
              <div class="notif-toolbar__main">
                <span class="notif-summary">
                  已订阅 <b>{{ selectedNotifications.length }}</b> / {{ notificationTypes.length }} 项
                </span>
                <div class="notif-progress">
                  <span
                    class="notif-progress__bar"
                    :style="{
                      width:
                        (notificationTypes.length
                          ? (selectedNotifications.length / notificationTypes.length) * 100
                          : 0) + '%'
                    }"
                  />
                </div>
              </div>
              <span v-if="!isAllNotification" class="notif-actions">
                <el-button link type="primary" @click="selectAllNotifications(true)">全选</el-button>
                <span class="perm-group__sep">/</span>
                <el-button link @click="selectAllNotifications(false)">清空</el-button>
              </span>
            </div>
            <div class="notif-groups">
              <div
                v-for="g in notifGroups"
                :key="g.key"
                class="notif-group"
                :class="{ 'is-empty': g.selected === 0 }"
              >
                <div class="notif-group__head">
                  <span class="notif-group__name">{{ g.name }}</span>
                  <span class="notif-group__count" :class="{ 'is-on': g.selected > 0 }">
                    {{ g.selected }}/{{ g.items.length }}
                  </span>
                </div>
                <div class="notif-items">
                  <el-checkbox
                    v-for="item in g.items"
                    :key="item.value"
                    :value="item.value"
                    :disabled="isAllNotification"
                    class="notif-chip"
                  >
                    {{ item.label }}
                  </el-checkbox>
                </div>
              </div>
            </div>
          </el-checkbox-group>
        </el-tab-pane>

        <!-- Tab4 - 可管理部门 -->
        <el-tab-pane label="可管理部门" name="departments">
          <div class="dept-panel">
            <div class="info-card">
              <div class="info-card__title">这个页签只影响「通讯录」</div>
              <p>用来把「员工模块」的可见范围收窄到指定部门，不影响项目、合同等其它模块。</p>
              <ul class="info-list">
                <li><b>勾了</b>：该角色在通讯录里只能看到所辖部门（含下级部门）的员工，另外始终能看到自己。</li>
                <li><b>不勾</b>：不启用部门收窄，按「员工模块」的权限口径执行 —— 勾「查看」= 全内部员工、勾「查看全部」= 含外部人员、都不勾 = 仅本人。</li>
              </ul>
              <p class="info-note">适用：部门负责人、项目经理、财务需要限制查看范围时配置。</p>
            </div>

            <div v-if="deptOptions.length" class="panel-head">
              <span class="panel-title">选择部门</span>
              <span class="panel-sub">已选 {{ selectedDepartments.length }} 个</span>
            </div>
            <el-checkbox-group v-model="selectedDepartments">
              <div class="dept-grid">
                <el-checkbox
                  v-for="dept in deptOptions"
                  :key="dept.id"
                  :value="dept.id"
                  class="dept-chip"
                >
                  <span :style="{ paddingLeft: (dept.depth * 12) + 'px' }">
                    {{ dept.depth > 0 ? '└ ' : '' }}{{ dept.name }}
                  </span>
                </el-checkbox>
              </div>
            </el-checkbox-group>
            <div v-if="!departments.length" class="empty-hint">
              暂无部门，请先在「部门管理」中创建部门。
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab5 - 业主端可见（v2.3.1 新增）——
             业主（customers 表）不属于 roles，8 个开关是"全局一份"，存在 system_settings。
             这里只是入口跳转，不在角色内编辑；详见「业主端可见配置」独立页。 -->
        <el-tab-pane label="业主端可见" name="customer_visibility">
          <div class="cv-panel">
            <div class="info-card">
              <div class="info-card__title">业主端不属于「角色」</div>
              <p>
                业主用自己的手机号登录业主端 App，不是员工、也不在角色表里，所以这一页<b>只是入口</b>，不在角色里配置。
              </p>
              <p>
                8 项开关（项目信息、施工日志、巡检记录、验收记录、整改单、合同金额、家庭成员、消息通知）
                是<b>全局一份</b>，对所有业主一致生效，存在系统设置里。
              </p>
              <p class="info-note">前提：业主必须先与项目关联，否则开关对它不生效。</p>
            </div>
            <el-button class="btn-add" type="primary" @click="goCustomerVisibility">
              <el-icon><Setting /></el-icon>
              <span>打开「业主端可见配置」</span>
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>

    <!-- 快捷创建弹窗 -->
    <el-dialog v-model="showQuickDialog" :title="quickForm.name" width="500px">
      <el-form :model="quickForm" label-width="100px">
        <el-form-item label="角色名称">
          <el-input v-model="quickForm.name" disabled />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input v-model="quickForm.code" disabled />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="quickForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showQuickDialog = false">取消</el-button>
        <el-button type="primary" @click="handleQuickSave">确定创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { Setting, Plus, UserFilled, Key, CircleCheck, OfficeBuilding } from '@element-plus/icons-vue'
import request from '@/utils/request'

const roleList = ref([])
const departments = ref([])
const router = useRouter()
const goCustomerVisibility = () => router.push('/customer-visibility')

// 部门选项：按 parent_id 组织为层级并缩进展示（便于识别上下级部门）
const deptOptions = computed(() => {
  const list = departments.value || []
  const byParent = new Map()
  list.forEach((d) => {
    const p = d.parent_id ? d.parent_id : '__root__'
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(d)
  })
  const out = []
  const walk = (key, depth) => {
    (byParent.get(key) || []).forEach((d) => {
      out.push({ id: d.id, name: d.name, depth })
      walk(d.id, depth + 1)
    })
  }
  walk('__root__', 0)
  // 兜底：parent_id 指向不存在部门的孤立节点也要展示
  const seen = new Set(out.map((o) => o.id))
  list.forEach((d) => { if (!seen.has(d.id)) out.push({ id: d.id, name: d.name, depth: 0 }) })
  return out
})
const showDialog = ref(false)
const showQuickDialog = ref(false)
const isEdit = ref(false)
const activeTab = ref('info')

// 预设角色数据
const presetRoles = [
  {
    name: '管理员',
    code: 'admin',
    permissions: ['*'],
    notification_types: [
      'contract_created', 'contract_updated', 'project_created', 'project_status_changed',
      'node_status_changed', 'project_progress', 'inspection_submit', 'acceptance_submit',
      'dispatch_created', 'dispatch_status_changed', 'approval_submit', 'approval_result',
      'notice_published', 'customer_follow', 'invoice_created', 'system_notice',
      'purchase_submit', 'purchase_approved', 'purchase_rejected',
      'purchase_reimbursing', 'purchase_finance_confirmed', 'purchase_reimbursed'
    ],
    description: '系统超级管理员，拥有全部权限'
  },
  {
    name: '项目经理',
    code: 'project_manager',
    permissions: [
      'customer:read', 'contract:read', 'project:read', 'project:write', 'project:read_all',
      'inspection:read', 'acceptance:read', 'finance:read', 'notice:read', 'notice:write',
      'dispatch:write', 'approval:read', 'approval:write', 'budget:read',
      'quote:read', 'quote:write', 'purchase:read', 'purchase:approve'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'project_created', 'project_status_changed',
      'node_status_changed', 'project_progress', 'inspection_submit', 'acceptance_submit',
      'dispatch_created', 'approval_submit',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing', 'purchase_finance_confirmed', 'purchase_reimbursed'
    ],
    description: '负责项目整体管理和协调'
  },
  {
    name: '设计师',
    code: 'designer',
    permissions: [
      'customer:read', 'customer:write', 'project:read', 'project:write',
      'contract:read', 'inspection:read', 'notice:read',
      'quote:read', 'quote:write', 'purchase:read', 'purchase:approve'
    ],
    notification_types: [
      'project_created', 'node_status_changed', 'project_progress', 'acceptance_submit',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing'
    ],
    description: '负责设计方案和客户沟通'
  },
  {
    name: '监理',
    code: 'supervisor',
    permissions: [
      'project:read', 'inspection:write', 'acceptance:write', 'notice:read',
      'purchase:read'
    ],
    notification_types: [
      'inspection_submit', 'acceptance_submit', 'dispatch_created',
      'purchase_submit', 'purchase_approved', 'purchase_reimbursing'
    ],
    description: '负责工程质量和进度监督'
  },
  {
    name: '财务',
    code: 'finance',
    permissions: [
      'finance:read', 'finance:write', 'finance:delete', 'finance:read_all',
      'contract:read', 'invoice:read', 'invoice:write', 'notice:read',
      'purchase:read', 'purchase:finance'
    ],
    notification_types: [
      'contract_created', 'contract_updated', 'invoice_created', 'approval_result',
      'purchase_finance_confirmed', 'purchase_reimbursed'
    ],
    description: '负责财务和发票管理'
  },
  {
    name: '客户',
    code: 'customer',
    permissions: [
      'project:read', 'contract:read', 'notice:read'
    ],
    notification_types: [
      'project_created', 'node_status_changed', 'project_progress',
      'inspection_submit', 'acceptance_submit', 'notice_published'
    ],
    description: '客户角色'
  }
]

// 模块列表
// key 必须与后端权限码前缀一致（server.js 中 checkPermission / hasReadAllPermission 使用的模块名）
// hasDelete / hasResetPassword / hasApprove / hasFinance 控制该模块是否展示对应的动作列
const moduleList = ref([
  { key: 'customer', name: '客户管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'contract', name: '合同模板', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: false, finance_action: false },
  { key: 'project_contract', name: '项目合同', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: false, finance_action: false },
  { key: 'project', name: '项目管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.1 新增：施工日志（从 project 拆出来单独配置）
  { key: 'project_log', name: '施工日志', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.12 补：项目文件（v2.3.4 后端已上线 4 个权限位，但角色编辑页一直漏配，导致无法授予）
  // 权限位：read / read_all / write / approve，无 delete
  { key: 'project_file', name: '项目文件', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: false },
  { key: 'contract_change', name: '增减项', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: false, finance_action: false },
  { key: 'quote', name: '报价管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'inspection', name: '巡检验房', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'acceptance', name: '验收管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'approval', name: '审批管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'notice', name: '通知公告', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'report', name: '报表管理', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false },
  { key: 'budget', name: '预算管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // hasFinance 已收窄：后端只有 purchase:finance 真正被校验（16 处），
  // 其余模块的 xxx:finance 在生产代码里没有消费点，勾了不生效 → 不再展示（原有权限码由 originalPerms 原样保留）
  { key: 'finance', name: '财务管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasFinance: false, finance_action: false },
  // 财务受理已收窄到「采购管理」（唯一有后端校验的模块），此处不再展示 finance 列
  { key: 'collection', name: '催收记录', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasFinance: false, finance_action: false },
  { key: 'purchase', name: '采购管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false, hasFinance: true, finance_action: false },
  { key: 'warehouse', name: '仓库管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // v2.3.1 新增：主材管理（从 purchase 拆出来单独配置）
  { key: 'material', name: '主材管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  // { key: 'supplier', name: '供应商管理', hasAll: false, ... } -- 已合并到 external_contact
  { key: 'invoice', name: '发票管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'dispatch', name: '派工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false, hasApprove: true, approve: false },
  { key: 'employee', name: '员工管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: true },
  // v2.3.1 新增：外部联系人（独立模块，工人/供应商/设计师）
  { key: 'external_contact', name: '外部联系人', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'role', name: '角色管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'department', name: '部门管理', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'sms', name: '短信模板', hasAll: false, read: false, write: false, delete: false, hasDelete: true, hasResetPassword: false },
  { key: 'settings', name: '系统设置', hasAll: false, read: false, write: false, delete: false, hasDelete: false, hasResetPassword: false }
])

/**
 * 该模块的某个动作，界面上是否有对应勾选列（能表达）。
 * 用于保存时判断「这条权限原样保留」还是「由勾选结果重建」，防止误删界面表达不了的权限。
 */
const isActionExposed = (row, act) => {
  if (!row) return false
  if (act === 'read_all' || act === 'read' || act === 'write') return true
  if (act === 'delete') return !!row.hasDelete
  if (act === 'reset_password') return !!row.hasResetPassword
  if (act === 'approve') return !!row.hasApprove
  if (act === 'finance') return !!row.hasFinance
  return false // view / salary 等没有列的动作用不到这里，一律保留
}

/* ============================================================
 * 以下全部是「功能权限」页签的展示层配置（v2.3.13 版式重构）
 * 只服务于渲染：不改 moduleList 的 key、不参与 handleSave 的权限重建。
 * ============================================================ */

// 勾选项的展示顺序 + 文案 + 悬停说明。
// type：data = 数据能力（蓝）/ stage = 流程关卡（琥珀），两种颜色分开，避免"审核/财务"被误读成并列的管理权。
const ACTION_META = {
  hasAll: {
    label: '查看全部',
    type: 'data',
    tip: '查看全部：不勾 = 只看自己参与的项目、自己创建的数据；勾上 = 全公司数据都能看（read_all）。'
  },
  read: {
    label: '查看',
    type: 'data',
    tip: '查看：能看到这个模块的菜单入口和列表。不勾则菜单不显示。'
  },
  write: {
    label: '编辑',
    type: 'data',
    tip: '编辑：能新增、修改这个模块的记录。'
  },
  delete: {
    label: '删除',
    type: 'data',
    tip: '删除：能删除这个模块的记录。建议只给少数人开放。'
  },
  reset_password: {
    label: '重置密码',
    type: 'data',
    tip: '重置密码：能给员工重置登录密码。'
  },
  approve: {
    label: '审批',
    type: 'stage',
    tip: '流程关卡①：单据提交后会进入该角色的「待我审批」列表，能点通过 / 驳回。'
  },
  finance_action: {
    label: '财务受理',
    type: 'stage',
    tip: '流程关卡②：审批通过后会进入该角色的「待我受理」列表，能确认收款 / 付款、上传回执、标记完成。'
  }
}

// 固定展示顺序
const ACTION_ORDER = ['hasAll', 'read', 'write', 'delete', 'reset_password', 'approve', 'finance_action']

// 某模块实际要渲染哪些勾选项——直接复用 isActionExposed，保证与保存逻辑同一套口径（不重复维护规则）
const actionsOf = (row) => {
  if (!row) return []
  return ACTION_ORDER.filter((act) => {
    if (act === 'finance_action') return isActionExposed(row, 'finance')
    if (act === 'hasAll') return isActionExposed(row, 'read_all')
    return isActionExposed(row, act)
  })
}

// 模块业务含义（悬停 ⓘ 显示）——用业务语言解释"这个模块管什么事"，不用技术词
const MODULE_TIPS = {
  customer: '客户管理：客户档案、跟进记录与公海池分配。',
  contract: '合同模板：合同模板本身的维护。具体项目签的合同在「项目合同」里。',
  project_contract: '项目合同：某个项目实际签署的合同文件与金额。',
  contract_change: '增减项：施工过程中的增项 / 减项单据，审批后进入结算。',
  project: '项目管理：项目主数据、进度节点、项目成员与项目状态。',
  project_log: '施工日志：工地现场每日施工记录与现场照片。',
  project_file: '项目文件：图纸、合同扫描件、现场照片等资料，上传后可设置审核。',
  dispatch: '派工管理：给工人 / 班组派工，派工单可设置审核。',
  inspection: '巡检验房：工程监理巡检、整改单与复查。',
  acceptance: '验收管理：分阶段验收与竣工验收单据。',
  quote: '报价管理：给客户的报价单。',
  budget: '预算管理：项目成本预算与预算执行。',
  finance: '财务管理：应收应付台账、收付款记录。真正"记账"在这里，不是流程关卡。',
  collection: '催收记录：应收款的催收跟进记录。',
  invoice: '发票管理：报销发票与开票记录。',
  report: '报表管理：经营报表、财务报表的查看。注意：这个模块的权限位后端未做校验，勾选只控制菜单是否显示；报表里的数据能否看到，取决于你在各业务模块里的查看权限。',
  purchase: '采购管理：采购申请 → 审批 → 报销 → 财务受理，唯一具备完整流程关卡的模块。',
  warehouse: '仓库管理：材料出入库与库存。',
  material: '主材管理：主材下单、到货与收货确认。',
  external_contact: '外部联系人：工人、供应商、外部设计师的通讯录（原供应商模块已合并进来）。',
  approval: '审批管理：请假、出差等「通用审批」表单 —— 员工自己填单、自己指定几个审批人，跟采购/合同那种业务单据自带的审批是两套。注意：这套审批不看角色权限，谁能审批由发起人点名决定，这里的勾选只控制菜单是否显示。',
  notice: '通知公告：系统公告的发布与查看。',
  employee: '员工管理：内部员工档案与通讯录（含密码重置）。',
  role: '角色管理：角色与权限配置。建议只给管理员。',
  department: '部门管理：组织架构与部门层级。',
  sms: '短信模板：短信模板的维护。',
  settings: '系统设置：全局参数配置。'
}

// 卡片上的「仅菜单」角标：这些模块后端没有校验对应权限位，勾选只影响菜单显隐
// （纯展示标注，不参与任何权限计算）
const MENU_ONLY_TIPS = {
  approval: '审批管理的权限位后端未校验：审批人由发起人在单据里点名，勾选这里只决定左侧菜单是否显示。',
  report: '报表管理的权限位后端未校验：勾选这里只决定左侧菜单是否显示，报表数据能否看到取决于各业务模块的查看权限。'
}

// 业务分组（纯展示：只决定卡片在页面上归到哪一组，不影响任何权限码）
const MODULE_GROUPS = [
  { key: 'customer_contract', name: '客户与合同', modules: ['customer', 'contract', 'project_contract', 'contract_change'] },
  { key: 'project_exec', name: '项目与执行', modules: ['project', 'project_log', 'project_file', 'dispatch', 'inspection', 'acceptance'] },
  { key: 'quote_budget', name: '报价与预算', modules: ['quote', 'budget'] },
  { key: 'money', name: '资金与票据', modules: ['finance', 'collection', 'invoice', 'report'] },
  { key: 'purchase_stock', name: '采购与物资', modules: ['purchase', 'warehouse', 'material', 'external_contact'] },
  { key: 'system', name: '协同与系统', modules: ['approval', 'notice', 'employee', 'role', 'department', 'sms', 'settings'] }
]

const helpOpen = ref([])
// 「只看已授权」：纯展示过滤，不改变任何权限值
const onlyGranted = ref(false)

/* ---------- 角色列表页展示层（v2.3.13：与客户列表等页面统一视觉） ---------- */

// 预设角色的主题色（列表头像 / 快捷创建卡片）
const PRESET_COLORS = {
  admin: { soft: '#FDECEC', color: '#C0392B' },
  project_manager: { soft: '#EAF1F8', color: '#2D5A8F' },
  designer: { soft: '#F3EEFB', color: '#7C5CBF' },
  supervisor: { soft: '#FDF6EC', color: '#C98A22' },
  finance: { soft: '#E8F6F0', color: '#1D9E75' },
  customer: { soft: '#EEF3F8', color: '#5A6A7D' }
}
const presetMeta = (code) => PRESET_COLORS[code] || { soft: '#EEF3F8', color: '#5A6A7D' }

const isAllPerms = (perms) => {
  try {
    return JSON.parse(perms || '[]').includes('*')
  } catch {
    return false
  }
}
const permCountText = (perms) => {
  try {
    const list = JSON.parse(perms || '[]')
    return list.includes('*') ? '全部' : `${list.length} 项`
  } catch {
    return '0 项'
  }
}

const roleStats = computed(() => {
  const list = roleList.value || []
  let permTotal = 0
  let approveRoles = 0
  let deptRoles = 0
  list.forEach((role) => {
    let perms = []
    try { perms = JSON.parse(role.permissions || '[]') } catch { perms = [] }
    if (!perms.includes('*')) permTotal += perms.length
    if (perms.includes('*') || perms.some((p) => p.endsWith(':approve'))) approveRoles += 1
    let depts = []
    try { depts = JSON.parse(role.managed_department_ids || '[]') } catch { depts = [] }
    if (Array.isArray(depts) && depts.length) deptRoles += 1
  })
  return [
    { key: 'total', label: '角色总数', value: list.length, icon: UserFilled, color: '#2D5A8F', soft: '#EAF1F8' },
    { key: 'perm', label: '权限项合计', value: permTotal, icon: Key, color: '#4B7BEC', soft: '#EDF3FE' },
    { key: 'approve', label: '可审批的角色', value: approveRoles, icon: CircleCheck, color: '#C98A22', soft: '#FDF6EC' },
    { key: 'dept', label: '限定部门的角色', value: deptRoles, icon: OfficeBuilding, color: '#1D9E75', soft: '#E8F6F0' }
  ]
})

// 消息订阅分组（纯展示：value 仍是 notificationTypes 里的原值，未匹配的自动归入「其它」）
const NOTIF_GROUPS = [
  { key: 'contract', name: '合同', values: ['contract_created', 'contract_updated', 'contract_approved', 'contract_rejected'] },
  { key: 'project', name: '项目与进度', values: ['project_created', 'project_status_changed', 'project_archived', 'node_status_changed', 'node_started', 'node_completed', 'node_overdue', 'project_progress', 'log_submitted'] },
  { key: 'inspect', name: '巡检与验收', values: ['inspection_submit', 'rectification_created', 'rectification_done', 'rectification_passed', 'acceptance_submit', 'acceptance_passed', 'acceptance_rejected'] },
  { key: 'dispatch', name: '派工', values: ['dispatch_created', 'dispatch_status_changed', 'dispatch_completed'] },
  { key: 'change', name: '增减项', values: ['change_submitted', 'change_approved', 'change_rejected'] },
  { key: 'purchase', name: '采购与报销', values: ['purchase_submit', 'purchase_approved', 'purchase_rejected', 'purchase_reimbursing', 'purchase_finance_confirmed', 'purchase_reimbursed', 'material_inbound'] },
  { key: 'money', name: '财务与催收', values: ['collection_created', 'receivable_due', 'invoice_created'] },
  { key: 'other', name: '审批、公告与客户', values: ['approval_submit', 'approval_result', 'notice_published', 'customer_follow', 'customer_created', 'system_notice'] }
]

const notifGroups = computed(() => {
  const byValue = new Map(notificationTypes.map((n) => [n.value, n]))
  const used = new Set()
  const groups = NOTIF_GROUPS.map((group) => {
    const items = group.values.map((v) => byValue.get(v)).filter(Boolean)
    items.forEach((it) => used.add(it.value))
    return {
      key: group.key,
      name: group.name,
      items,
      selected: items.filter((it) => selectedNotifications.value.includes(it.value)).length
    }
  })
  const rest = notificationTypes.filter((n) => !used.has(n.value))
  if (rest.length) {
    groups.push({
      key: 'rest',
      name: '其它',
      items: rest,
      selected: rest.filter((it) => selectedNotifications.value.includes(it.value)).length
    })
  }
  return groups.filter((g) => g.items.length > 0)
})

const selectAllNotifications = (on) => {
  if (isAllNotification.value) return
  selectedNotifications.value = on ? notificationTypes.map((n) => n.value) : []
}

// 该模块已开几项
const moduleGrantedCount = (row) => actionsOf(row).filter((act) => !!row[act]).length

// 分组后的模块列表（含组内统计）；onlyGranted 打开时只保留有授权项的模块
const groupedModules = computed(() => {
  const byKey = new Map(moduleList.value.map((m) => [m.key, m]))
  const used = new Set()
  const groups = MODULE_GROUPS.map((group) => {
    const allRows = group.modules.map((key) => byKey.get(key)).filter(Boolean)
    allRows.forEach((row) => used.add(row.key))
    const rows = onlyGranted.value ? allRows.filter((row) => moduleGrantedCount(row) > 0) : allRows
    return {
      key: group.key,
      name: group.name,
      rows,
      count: allRows.length,
      granted: allRows.reduce((sum, row) => sum + moduleGrantedCount(row), 0)
    }
  })
  // 兜底：moduleList 里新增了但还没归组的模块，单独放一组，避免"配了却看不见"
  const restAll = moduleList.value.filter((m) => !used.has(m.key))
  if (restAll.length) {
    const rest = onlyGranted.value ? restAll.filter((row) => moduleGrantedCount(row) > 0) : restAll
    groups.push({
      key: 'other',
      name: '其他',
      rows: rest,
      count: restAll.length,
      granted: restAll.reduce((sum, row) => sum + moduleGrantedCount(row), 0)
    })
  }
  return groups.filter((g) => g.rows.length > 0)
})

// 顶部能力摘要
const roleSummary = computed(() => {
  let mods = 0
  let read = 0
  let write = 0
  let stage = 0
  let granted = 0
  let total = 0
  moduleList.value.forEach((row) => {
    const acts = actionsOf(row)
    total += acts.length
    const on = acts.filter((act) => !!row[act])
    granted += on.length
    if (on.length) mods += 1
    if (row.hasAll || row.read) read += 1
    if (row.write || row.delete || row.reset_password) write += 1
    if (row.approve || row.finance_action) stage += 1
  })
  return { mods, read, write, stage, granted, total }
})

// 组内全选 / 清空：只翻转本组模块的展示字段，仍然走同一批 v-model，不碰保存逻辑
const setGroupPermissions = (group, value) => {
  if (isAllPermission.value) return
  group.rows.forEach((row) => {
    actionsOf(row).forEach((act) => {
      row[act] = value
    })
  })
}

// 消息类型
const notificationTypes = [
  { value: 'contract_created', label: '新增合同' },
  { value: 'contract_updated', label: '合同变更' },
  { value: 'project_created', label: '新增项目' },
  { value: 'project_status_changed', label: '项目状态变更' },
  { value: 'project_archived', label: '项目归档/完成' },
  { value: 'node_status_changed', label: '节点状态变更' },
  { value: 'node_started', label: '节点开始' },
  { value: 'node_completed', label: '节点通过（验收合格自动）' },
  { value: 'node_overdue', label: '节点逾期' },
  { value: 'project_progress', label: '项目进展' },
  { value: 'log_submitted', label: '施工日志提交' },
  { value: 'inspection_submit', label: '巡检提交' },
  { value: 'rectification_created', label: '整改发起' },
  { value: 'rectification_done', label: '整改完成' },
  { value: 'rectification_passed', label: '整改复查通过' },
  { value: 'acceptance_submit', label: '验收提交' },
  { value: 'acceptance_passed', label: '验收合格（→ 节点自动通过）' },
  { value: 'acceptance_rejected', label: '验收不合格/驳回' },
  { value: 'dispatch_created', label: '新增派工' },
  { value: 'dispatch_status_changed', label: '派工状态变更' },
  { value: 'dispatch_completed', label: '派工完成' },
  { value: 'change_submitted', label: '增减项提交' },
  { value: 'change_approved', label: '增减项审核通过' },
  { value: 'change_rejected', label: '增减项审核驳回' },
  { value: 'contract_approved', label: '合同审核通过' },
  { value: 'contract_rejected', label: '合同审核驳回' },
  { value: 'collection_created', label: '催收记录' },
  { value: 'receivable_due', label: '待收款提醒/逾期' },
  { value: 'approval_submit', label: '审批提交' },
  { value: 'approval_result', label: '审批结果' },
  { value: 'notice_published', label: '发布公告' },
  { value: 'customer_follow', label: '客户跟进' },
  { value: 'customer_created', label: '新增客户' },
  { value: 'material_inbound', label: '主材入库' },
  { value: 'invoice_created', label: '新增发票' },
  { value: 'system_notice', label: '系统通知' },
  // 采购流程
  { value: 'purchase_submit', label: '采购提交' },
  { value: 'purchase_approved', label: '采购审批通过' },
  { value: 'purchase_rejected', label: '采购驳回' },
  { value: 'purchase_reimbursing', label: '采购报销中' },
  { value: 'purchase_finance_confirmed', label: '财务受理' },
  { value: 'purchase_reimbursed', label: '报销完成' }
]

const form = reactive({
  id: null,
  name: '',
  code: '',
  description: '',
  permissions: [],
  notification_types: [],
  managed_department_ids: []
})

const quickForm = reactive({
  name: '',
  code: '',
  description: '',
  permissions: [],
  notification_types: []
})

const selectedNotifications = ref([])
const selectedDepartments = ref([])

// v2.3.12：打开编辑时记下该角色「原始权限数组」。
// 保存时用来兜底——凡是界面表达不了的权限码（未建行的模块，或该模块没有对应勾选列的动作，
// 例如 purchase:view、以及未开放列时已有的 xxx:delete / xxx:approve），一律原样保留，
// 避免"只是改个名字"却把权限静默清空。
const originalPerms = ref([])

const isAllPermission = computed(() => form.code === 'admin')
const isAllNotification = computed(() => form.code === 'admin')

const getPermissionCount = (perms) => {
  try {
    const parsed = JSON.parse(perms || '[]')
    return parsed.includes('*') ? '全部' : parsed.length
  } catch {
    return 0
  }
}

const loadRoles = async () => {
  try {
    const res = await request.get('/roles')
    roleList.value = res.data || res
  } catch (error) {
    console.error('加载角色失败:', error)
  }
}

const loadDepartments = async () => {
  try {
    const res = await request.get('/departments')
    departments.value = res.data || res
  } catch (error) {
    console.error('加载部门失败:', error)
  }
}

const handleAdd = () => {
  isEdit.value = false
  activeTab.value = 'info'
  resetFormData()
  showDialog.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  activeTab.value = 'info'
  form.id = row.id
  form.name = row.name
  form.code = row.code
  form.description = row.description || ''

  // 解析权限
  try {
    const perms = JSON.parse(row.permissions || '[]')
    originalPerms.value = Array.isArray(perms) ? perms : []
    if (perms.includes('*')) {
      // admin角色本身，form.code保持原值，不强制覆盖
    } else {
      parsePermissionsToModules(perms)
    }
  } catch {
    originalPerms.value = []
    parsePermissionsToModules([])
  }

  // 解析消息订阅
  try {
    selectedNotifications.value = JSON.parse(row.notification_types || '[]')
  } catch {
    selectedNotifications.value = []
  }

  // 解析可管理部门
  try {
    selectedDepartments.value = JSON.parse(row.managed_department_ids || '[]')
  } catch {
    selectedDepartments.value = []
  }

  showDialog.value = true
}

const parsePermissionsToModules = (perms) => {
  moduleList.value.forEach(module => {
    module.hasAll = perms.includes(`${module.key}:read_all`);
    module.read = perms.includes(`${module.key}:read`);
    module.write = perms.includes(`${module.key}:write`);
    module.delete = perms.includes(`${module.key}:delete`);
    module.reset_password = perms.includes(`${module.key}:reset_password`);
    module.approve = perms.includes(`${module.key}:approve`);
    module.finance_action = perms.includes(`${module.key}:finance`);
  });
}

const handlePermissionChange = (row, type) => {
  // 权限变化时的处理
}

const handleQuickCreate = (preset) => {
  Object.assign(quickForm, {
    name: preset.name,
    code: preset.code,
    description: preset.description,
    permissions: preset.permissions,
    notification_types: preset.notification_types
  })
  showQuickDialog.value = true
}

const handleQuickSave = async () => {
  try {
    await request.post('/roles', {
      name: quickForm.name,
      code: quickForm.code,
      description: quickForm.description,
      permissions: quickForm.permissions,
      notification_types: quickForm.notification_types,
      managed_department_ids: null
    })
    ElMessage.success('创建成功')
    showQuickDialog.value = false
    loadRoles()
  } catch (error) {
    ElMessage.error('创建失败')
  }
}

const handleSave = async () => {
  if (!form.name) {
    ElMessage.warning('请输入角色名称')
    return
  }
  if (!form.code) {
    ElMessage.warning('请输入角色编码')
    return
  }

  // 构建权限数组
  let permissions = [];
  if (form.code === 'admin') {
    permissions = ['*'];
  } else {
    // v2.3.12：先把「界面表达不了的权限码」原样带回去，再按勾选重建。
    // 否则像 purchase:view 这种没有对应勾选列的动作、新增了后端权限位却还没加行的模块，
    // 只要点一次保存就被静默清掉（project_file、manager 的 read_all+approve 就是这么丢的）。
    const rowByKey = new Map(moduleList.value.map(m => [m.key, m]));
    (originalPerms.value || []).forEach(code => {
      if (!code || code === '*') return;
      const i = code.lastIndexOf(':');
      const mod = i > 0 ? code.slice(0, i) : code;
      const act = i > 0 ? code.slice(i + 1) : '';
      // 模块没建行，或该动作没有对应勾选列 → 原样保留
      if (!isActionExposed(rowByKey.get(mod), act)) permissions.push(code);
    });
    moduleList.value.forEach(module => {
      if (module.hasAll) permissions.push(`${module.key}:read_all`);
      if (module.read) permissions.push(`${module.key}:read`);
      if (module.write) permissions.push(`${module.key}:write`);
      if (module.delete) permissions.push(`${module.key}:delete`);
      if (module.reset_password) permissions.push(`${module.key}:reset_password`);
      if (module.approve) permissions.push(`${module.key}:approve`);
      if (module.finance_action) permissions.push(`${module.key}:finance`);
    });
    permissions = Array.from(new Set(permissions));
  }

  try {
    const data = {
      name: form.name,
      code: form.code,
      description: form.description,
      permissions,
      notification_types: selectedNotifications.value,
      managed_department_ids: selectedDepartments.value.length > 0 ? selectedDepartments.value : null
    }

    if (isEdit.value) {
      await request.put(`/roles/${form.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post('/roles', data)
      ElMessage.success('添加成功')
    }
    showDialog.value = false
    loadRoles()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('此操作将永久删除该数据，是否继续？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete(`/roles/${id}`)
    ElMessage.success('删除成功')
    loadRoles()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}

const resetForm = () => {
  resetFormData()
}

const resetFormData = () => {
  form.id = null
  form.name = ''
  form.code = ''
  form.description = ''
  form.permissions = []
  form.notification_types = []
  form.managed_department_ids = []
  selectedNotifications.value = []
  selectedDepartments.value = []
  originalPerms.value = []
  moduleList.value.forEach(module => {
    module.hasAll = false;
    module.read = false;
    module.write = false;
    module.delete = false;
    module.reset_password = false;
    module.approve = false;
    module.finance_action = false;
  });
}

onMounted(() => {
  loadRoles()
  loadDepartments()
})
</script>

<style scoped>
/* ==================== 页面头（与客户列表等页面统一） ==================== */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e3a5f;
  margin: 0;
}
.page-sub {
  font-size: 13px;
  color: #909399;
  margin: 6px 0 0;
}
.page-sub b { color: #2d5a8f; font-weight: 600; }
.page-head-right { display: flex; align-items: center; gap: 10px; }
.btn-add {
  border-radius: 10px;
  padding: 0 18px;
  height: 34px;
  background: linear-gradient(135deg, #2d5a8f, #1e3a5f);
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 95, 0.25);
}
.btn-add:hover { background: linear-gradient(135deg, #3569a5, #24466f); }

/* ==================== 概览统计 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 21, 41, 0.05);
  overflow: hidden;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 21, 41, 0.1);
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.stat-body { min-width: 0; }
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.1; }
.stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
.stat-accent {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  opacity: 0.85;
}

/* ==================== 通用面板头 ==================== */
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.panel-title { font-size: 14px; font-weight: 600; color: #1f2d3d; }
.panel-sub { font-size: 12px; color: #a8abb2; }

/* ==================== 快捷创建 ==================== */
.preset-panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
  margin-bottom: 16px;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}
.preset-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  background: #fbfcfe;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}
.preset-item:hover {
  background: #fff;
  border-color: #c9dbef;
  box-shadow: 0 3px 12px rgba(45, 90, 143, 0.1);
}
.preset-avatar {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.preset-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.preset-name { font-size: 13px; font-weight: 600; color: #1f2d3d; }
.preset-desc {
  font-size: 11px;
  color: #a8abb2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-go {
  font-size: 12px;
  color: #2d5a8f;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.16s;
}
.preset-item:hover .preset-go { opacity: 1; }

/* ==================== 角色表格 ==================== */
.table-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 12px;
  box-shadow: 0 2px 12px rgba(0, 21, 41, 0.06);
}
.role-table { --el-table-border-color: #f0f2f5; }
.role-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #5a6a7d !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  border-bottom: 1px solid #eef1f6 !important;
}
.role-table :deep(td.el-table__cell) {
  padding: 11px 0;
  border-bottom: 1px solid #f5f7fa;
}
.role-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: #f5f9ff !important;
}
.role-cell { display: flex; align-items: center; gap: 11px; }
.role-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}
.role-main { min-width: 0; }
.role-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 6px;
}
.role-badge {
  font-size: 11px;
  padding: 0 6px;
  line-height: 17px;
  border-radius: 5px;
  background: #fdecec;
  color: #c0392b;
  font-weight: 500;
}
.role-code {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.role-desc { font-size: 13px; color: #606266; }
.perm-count {
  display: inline-block;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 999px;
  background: #eaf1f8;
  color: #2d5a8f;
  white-space: nowrap;
}
.perm-count.is-all { background: #fdecec; color: #c0392b; }

/* ==================== 弹窗内页签通用留白 ==================== */
/* 页签内容与页签条之间留出呼吸空间；内容超过一屏时在弹窗内滚动，避免弹窗顶出屏幕 */
:deep(.el-tabs__content) {
  padding-top: 8px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

/* ==================== 角色信息页签 ==================== */
.form-panel { display: flex; flex-direction: column; gap: 12px; }
.form-card {
  background: #fbfcfe;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 16px 18px 6px;
}
.form-card--tip { padding-bottom: 16px; }
.form-card__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.form-card__title { font-size: 14px; font-weight: 600; color: #1f2d3d; }
.form-card__sub { font-size: 12px; color: #a8abb2; }
.form-hint {
  font-size: 12px;
  color: #a8abb2;
  line-height: 1.6;
  margin-top: 4px;
}
.tip-steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #606266;
  line-height: 1.9;
}

/* ==================== 消息订阅页签 ==================== */
.notif-panel { display: block; }
.notif-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 14px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 12px;
}
.notif-toolbar__main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1 1 auto;
  min-width: 0;
}
.notif-summary { font-size: 13px; color: #606266; white-space: nowrap; }
.notif-summary b { color: #2d5a8f; font-weight: 600; }
.notif-actions { font-size: 12px; white-space: nowrap; }
.notif-actions .el-button + .perm-group__sep + .el-button { margin-left: 0; }
.notif-progress {
  flex: 1 1 auto;
  min-width: 80px;
  max-width: 260px;
  height: 5px;
  border-radius: 999px;
  background: #e9eef5;
  overflow: hidden;
}
.notif-progress__bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #2d5a8f, #4a7fb5);
  transition: width 0.25s ease;
}

/* 分组卡片：两列自适应，解决原来 8 组堆叠在一起、挤成一片的问题 */
.notif-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-items: start;
  gap: 12px;
}
.notif-group {
  border: 1px solid #eef1f6;
  border-radius: 12px;
  background: #fff;
  padding: 13px 15px 15px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.notif-group:hover {
  border-color: #dbe6f2;
  box-shadow: 0 2px 10px rgba(0, 21, 41, 0.05);
}
.notif-group.is-empty { background: #fcfdfe; }
.notif-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 9px;
  margin-bottom: 12px;
  border-bottom: 1px dashed #eef1f6;
}
.notif-group__name {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2d3d;
}
.notif-group__name::before {
  content: '';
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: #2d5a8f;
  opacity: 0.75;
}
.notif-group__count {
  font-size: 11px;
  line-height: 1.7;
  padding: 0 8px;
  border-radius: 999px;
  color: #a8abb2;
  background: #f4f6f9;
  white-space: nowrap;
}
.notif-group__count.is-on { color: #2d5a8f; background: #eaf1f8; }
.notif-items {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 8px;
}
.notif-chip {
  margin: 0 !important;
  height: 30px;
  padding: 0 13px;
  border: 1px solid #e4e7ed;
  border-radius: 999px;
  background: #fff;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.notif-chip:hover {
  border-color: #bfd3e8;
  background: #f7fafd;
}
.notif-chip :deep(.el-checkbox__input) { display: none; }
.notif-chip :deep(.el-checkbox__label) {
  padding: 0;
  font-size: 13px;
  line-height: 1;
  color: #606266;
}
/* 隐藏了方框，用一个始终占位的小圆点表达勾选状态，避免切换时文字跳动 */
.notif-chip :deep(.el-checkbox__label)::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
  background: #dcdfe6;
  transition: background 0.15s;
}
.notif-chip.is-checked {
  background: #eaf1f8;
  border-color: #9dbfdd;
}
.notif-chip.is-checked :deep(.el-checkbox__label) { color: #2d5a8f; }
.notif-chip.is-checked :deep(.el-checkbox__label)::before { background: #2d5a8f; }
.notif-chip.is-disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 720px) {
  .notif-groups { grid-template-columns: 1fr; }
}

/* ==================== 可管理部门 / 客户端可见页签 ==================== */
.dept-panel, .cv-panel { display: block; }
.info-card {
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #606266;
  line-height: 1.75;
}
.info-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2d3d;
  margin-bottom: 6px;
}
.info-card p { margin: 0 0 4px; }
.info-card b { color: #1f2d3d; font-weight: 600; }
.info-list {
  margin: 4px 0;
  padding-left: 18px;
  line-height: 1.8;
}
.info-note { color: #a8abb2; font-size: 12px; }
.dept-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.dept-chip {
  margin: 0 !important;
  height: auto;
  padding: 6px 14px;
  border: 1px solid #e4e7ed;
  border-radius: 9px;
  background: #fff;
}
.dept-chip :deep(.el-checkbox__label) { font-size: 13px; color: #606266; }
.dept-chip.is-checked {
  background: #eaf1f8;
  border-color: #bfd3e8;
}
.dept-chip.is-checked :deep(.el-checkbox__label) { color: #2d5a8f; font-weight: 500; }
.empty-hint {
  font-size: 13px;
  color: #a8abb2;
  padding: 16px 0;
  text-align: center;
  background: #fbfcfe;
  border: 1px dashed #eef1f6;
  border-radius: 10px;
}

/* ===== 功能权限页签：分组能力卡片（v2.3.13 版式重构）===== */
.perm-panel {
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}
.perm-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  margin-bottom: 8px;
}
.perm-summary__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.perm-summary__title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}
.perm-summary__sub {
  font-size: 12px;
  color: #909399;
}
.perm-summary__sub b {
  color: #2d5a8f;
}
.perm-summary__stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.stat-pill {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #eaf1f8;
  color: #2d5a8f;
  white-space: nowrap;
}
.stat-pill.is-stage {
  background: #fdf6ec;
  color: #b88230;
}

.perm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 2px;
}
.perm-filter {
  height: auto;
}
.perm-filter :deep(.el-checkbox__label) {
  font-size: 12px;
  color: #909399;
}
.perm-filter.is-checked :deep(.el-checkbox__label) {
  color: #2d5a8f;
}
.perm-toolbar__hint {
  font-size: 12px;
  color: #c0c4cc;
}

.perm-help {
  border-top: none;
  border-bottom: none;
  --el-collapse-header-height: 36px;
}
.perm-help__title {
  font-size: 12px;
  color: #909399;
}
.perm-help__body {
  font-size: 12px;
  line-height: 1.75;
  color: #606266;
}
.perm-help__body p {
  margin: 0 0 6px;
}
.perm-help__note {
  color: #909399;
}

.perm-group {
  margin-top: 14px;
}
.perm-group__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 8px;
}
.perm-group__name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}
.perm-group__sub {
  font-size: 12px;
  color: #c0c4cc;
}
.perm-group__ops {
  margin-left: auto;
  font-size: 12px;
}
.perm-group__sep {
  color: #dcdfe6;
  margin: 0 2px;
}

.perm-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  align-items: start;
  gap: 10px;
}
.perm-card {
  border: 1px solid #eef1f6;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.perm-card:hover {
  border-color: #c9dbef;
  box-shadow: 0 3px 12px rgba(45, 90, 143, 0.08);
}
.perm-card.is-granted {
  border-color: #dce8f4;
  background: #fbfdff;
}
/* 采购卡片内容较宽（6 个胶囊 + 流程链），跨两列避免挤压换行 */
.perm-card.is-wide {
  grid-column: span 2;
}
@media (max-width: 760px) {
  .perm-card.is-wide {
    grid-column: span 1;
  }
}
.perm-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.perm-card__name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}
.perm-card__info {
  width: 14px;
  height: 14px;
  line-height: 12px;
  text-align: center;
  border: 1px solid #dcdfe6;
  border-radius: 50%;
  font-size: 9px;
  color: #c0c4cc;
  cursor: help;
  font-style: normal;
  flex: 0 0 auto;
}
.perm-card__info:hover {
  color: #2d5a8f;
  border-color: #bfd3e8;
}
.perm-card__count {
  margin-left: auto;
  font-size: 11px;
  color: #c0c4cc;
}
/* 「仅菜单」角标：提示该模块权限位后端未校验 */
.perm-card__tag {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 1.6;
  padding: 0 6px;
  border-radius: 4px;
  color: #9a6b12;
  background: #fdf6ec;
  border: 1px solid #f5dfb8;
  cursor: help;
  white-space: nowrap;
}
.perm-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 权限胶囊：复用 el-checkbox 的 v-model / disabled，只把方框换成胶囊 */
.perm-chip {
  margin: 0 !important;
  height: auto;
  padding: 3px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 999px;
}
.perm-chip :deep(.el-checkbox__input) {
  display: none;
}
.perm-chip :deep(.el-checkbox__label) {
  padding: 0;
  font-size: 12px;
  line-height: 1.2;
  color: #909399;
}
.perm-chip.is-checked {
  background: #eaf1f8;
  border-color: #bfd3e8;
}
.perm-chip.is-checked :deep(.el-checkbox__label) {
  color: #2d5a8f;
}
/* 流程关卡：琥珀色 + 虚线边，与「数据能力」在视觉上彻底分开 */
.perm-chip--stage {
  border-style: dashed;
  border-color: #f0d9b5;
}
.perm-chip--stage :deep(.el-checkbox__label) {
  color: #c8a06a;
}
.perm-chip--stage.is-checked {
  background: #fdf6ec;
  border-style: solid;
  border-color: #f3d19e;
}
.perm-chip--stage.is-checked :deep(.el-checkbox__label) {
  color: #b88230;
}
.perm-chip.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
/* admin 不解析具体权限码（后端直通 *），这里只把胶囊显示成"全开"，避免误以为没权限。
   纯视觉，不改 row 上的实际值——保存时 admin 仍走 permissions=['*']。 */
.perm-panel.is-admin .perm-chip {
  background: #eaf1f8;
  border-color: #bfd3e8;
}
.perm-panel.is-admin .perm-chip :deep(.el-checkbox__label) {
  color: #2d5a8f;
}
.perm-panel.is-admin .perm-chip--stage {
  background: #fdf6ec;
  border-color: #f3d19e;
}
.perm-panel.is-admin .perm-chip--stage :deep(.el-checkbox__label) {
  color: #b88230;
}

.perm-flow {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  font-size: 11px;
  color: #909399;
}
.perm-flow__arrow {
  color: #dcdfe6;
}
.perm-flow__node {
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px dashed #e4d3b4;
  color: #c8a06a;
}
.perm-flow__node.is-active {
  background: #fdf6ec;
  border-style: solid;
  border-color: #f3d19e;
  color: #b88230;
}
.perm-flow__hint {
  margin-left: auto;
  color: #c0c4cc;
}
</style>
