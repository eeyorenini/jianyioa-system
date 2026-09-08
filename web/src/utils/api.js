/**
 * API 接口模块化封装
 * 使用方式：import { customerApi, employeeApi } from '@/utils/api'
 */

import request from './request'

// ============ 客户相关 ============
export const customerApi = {
  list: () => request.get('/customers'),
  detail: (id) => request.get(`/customers/${id}`),
  create: (data) => request.post('/customers', data),
  update: (id, data) => request.put(`/customers/${id}`, data),
  delete: (id) => request.delete(`/customers/${id}`)
}

// ============ 员工相关 ============
export const employeeApi = {
  list: () => request.get('/employees'),
  detail: (id) => request.get(`/employees/${id}`),
  create: (data) => request.post('/employees', data),
  update: (id, data) => request.put(`/employees/${id}`, data),
  delete: (id) => request.delete(`/employees/${id}`),
  login: (data) => request.post('/employees/login', data)
}

// ============ 合同相关（不动） ============
export const contractApi = {
  list: () => request.get('/contracts'),
  detail: (id) => request.get(`/contracts/${id}`),
  create: (data) => request.post('/contracts', data),
  update: (id, data) => request.put(`/contracts/${id}`, data),
  delete: (id) => request.delete(`/contracts/${id}`)
}

// ============ 合同模板相关（不动） ============
export const contractTemplateApi = {
  list: () => request.get('/contract-templates'),
  detail: (id) => request.get(`/contract-templates/${id}`),
  create: (data) => request.post('/contract-templates', data),
  update: (id, data) => request.put(`/contract-templates/${id}`, data),
  delete: (id) => request.delete(`/contract-templates/${id}`)
}

// ============ 项目相关 ============
export const projectApi = {
  list: () => request.get('/projects'),
  detail: (id) => request.get(`/projects/${id}`),
  create: (data) => request.post('/projects', data),
  update: (id, data) => request.put(`/projects/${id}`, data),
  delete: (id) => request.delete(`/projects/${id}`)
}

// ============ 财务相关 ============
export const financeApi = {
  list: () => request.get('/finance'),
  summary: () => request.get('/finance/summary'),
  create: (data) => request.post('/finance', data),
  delete: (id) => request.delete(`/finance/${id}`)
}

// ============ 部门相关 ============
export const departmentApi = {
  list: () => request.get('/departments'),
  create: (data) => request.post('/departments', data),
  update: (id, data) => request.put(`/departments/${id}`, data),
  delete: (id) => request.delete(`/departments/${id}`)
}

// ============ 角色相关 ============
export const roleApi = {
  list: () => request.get('/roles'),
  create: (data) => request.post('/roles', data),
  update: (id, data) => request.put(`/roles/${id}`, data),
  delete: (id) => request.delete(`/roles/${id}`)
}

// ============ 报价相关 ============
export const quoteApi = {
  list: () => request.get('/quotes'),
  detail: (id) => request.get(`/quotes/${id}`),
  create: (data) => request.post('/quotes', data),
  update: (id, data) => request.put(`/quotes/${id}`, data),
  delete: (id) => request.delete(`/quotes/${id}`)
}

// ============ 仓库相关 ============
export const warehouseApi = {
  list: () => request.get('/warehouse'),
  create: (data) => request.post('/warehouse', data),
  update: (id, data) => request.put(`/warehouse/${id}`, data),
  delete: (id) => request.delete(`/warehouse/${id}`)
}

// ============ 主材相关 ============
export const materialApi = {
  list: () => request.get('/main-materials'),
  create: (data) => request.post('/main-materials', data),
  update: (id, data) => request.put(`/main-materials/${id}`, data),
  delete: (id) => request.delete(`/main-materials/${id}`)
}

// ============ 采购订单相关 ============
export const orderApi = {
  list: () => request.get('/material-orders'),
  create: (data) => request.post('/material-orders', data),
  update: (id, data) => request.put(`/material-orders/${id}`, data),
  delete: (id) => request.delete(`/material-orders/${id}`)
}

// ============ 审批相关 ============
export const approvalApi = {
  list: () => request.get('/approvals'),
  create: (data) => request.post('/approvals', data),
  update: (id, data) => request.put(`/approvals/${id}`, data),
  approve: (id) => request.post(`/approvals/${id}/approve`),
  reject: (id, reason) => request.post(`/approvals/${id}/reject`, { reason })
}

// ============ 报表相关 ============
export const reportApi = {
  dashboard: () => request.get('/dashboard/stats')
}

// ============ 其他 ============
export const invoiceApi = {
  list: () => request.get('/invoices'),
  create: (data) => request.post('/invoices', data),
  delete: (id) => request.delete(`/invoices/${id}`)
}

export const budgetApi = {
  list: () => request.get('/budgets'),
  create: (data) => request.post('/budgets', data),
  update: (id, data) => request.put(`/budgets/${id}`, data),
  delete: (id) => request.delete(`/budgets/${id}`)
}

export const inspectionApi = {
  list: () => request.get('/inspections'),
  create: (data) => request.post('/inspections', data),
  update: (id, data) => request.put(`/inspections/${id}`, data),
  delete: (id) => request.delete(`/inspections/${id}`)
}

export const acceptanceApi = {
  list: () => request.get('/acceptance'),
  create: (data) => request.post('/acceptance', data),
  update: (id, data) => request.put(`/acceptance/${id}`, data),
  delete: (id) => request.delete(`/acceptance/${id}`)
}

export const noticeApi = {
  list: () => request.get('/notices'),
  create: (data) => request.post('/notices', data),
  update: (id, data) => request.put(`/notices/${id}`, data),
  delete: (id) => request.delete(`/notices/${id}`)
}

export const reportWorkApi = {
  list: () => request.get('/reports'),
  create: (data) => request.post('/reports', data),
  delete: (id) => request.delete(`/reports/${id}`)
}

export const channelApi = {
  list: () => request.get('/channels'),
  create: (data) => request.post('/channels', data),
  update: (id, data) => request.put(`/channels/${id}`, data),
  delete: (id) => request.delete(`/channels/${id}`)
}

export const logApi = {
  list: () => request.get('/operation-logs')
}
