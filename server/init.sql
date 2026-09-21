-- 建亿 OA 系统 MySQL 数据库初始化脚本
-- 适用 MySQL 5.7+ / 8.0
-- 使用前请先创建数据库: CREATE DATABASE jianyioa DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ========================================
-- 基础组织架构
-- ========================================
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INT,
  manager_id INT,
  description TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  department_id INT,
  position VARCHAR(100),
  role_id INT,
  status VARCHAR(20) DEFAULT '在职',
  entry_date VARCHAR(50),
  salary DECIMAL(12,2),
  id_card VARCHAR(50),
  emergency_contact VARCHAR(100),
  emergency_phone VARCHAR(50),
  avatar VARCHAR(500),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  parent_id INT,
  type VARCHAR(20) DEFAULT 'menu',
  path VARCHAR(255),
  icon VARCHAR(100),
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT,
  permission_id INT,
  PRIMARY KEY (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 客户与合同
-- ========================================
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  source VARCHAR(100),
  status VARCHAR(50) DEFAULT '意向客户',
  level VARCHAR(50) DEFAULT '普通',
  follow_user VARCHAR(100),
  address VARCHAR(500),
  area DECIMAL(10,2),
  budget DECIMAL(12,2),
  demand TEXT,
  next_follow_date VARCHAR(50),
  creator_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_follow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  follow_type VARCHAR(50),
  content TEXT,
  follow_date VARCHAR(50),
  next_date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_no VARCHAR(100) UNIQUE,
  customer_id INT,
  project_name VARCHAR(255),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address VARCHAR(500),
  id_card VARCHAR(50),
  engineering_address VARCHAR(500),
  total_amount DECIMAL(12,2),
  design_fee DECIMAL(12,2) DEFAULT 0,
  manager_fee DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  area DECIMAL(10,2),
  start_date VARCHAR(50),
  end_date VARCHAR(50),
  status VARCHAR(50) DEFAULT '待签订',
  sign_date VARCHAR(50),
  decoration_style VARCHAR(100),
  payment1 DECIMAL(12,2) DEFAULT 0,
  payment2 DECIMAL(12,2) DEFAULT 0,
  payment3 DECIMAL(12,2) DEFAULT 0,
  guarantee_period VARCHAR(100),
  dispute_court VARCHAR(255),
  content LONGTEXT,
  attachment VARCHAR(500),
  category VARCHAR(50) DEFAULT 'decoration',
  custom_fields LONGTEXT,
  created_by INT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contract_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50),
  content LONGTEXT,
  is_default TINYINT DEFAULT 0,
  template_type VARCHAR(50) DEFAULT 'personal',
  template_fields LONGTEXT,
  created_by INT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00',
  updated_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  username VARCHAR(100),
  action VARCHAR(255) NOT NULL,
  module VARCHAR(100),
  target_id INT,
  target_name VARCHAR(255),
  details TEXT,
  ip_address VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 财务与项目
-- ========================================
CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  project_name VARCHAR(255),
  house_area DECIMAL(10,2),
  style VARCHAR(100),
  total_amount DECIMAL(12,2),
  profit_rate DECIMAL(5,2),
  status VARCHAR(50) DEFAULT '草稿',
  items LONGTEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(100),
  description VARCHAR(500),
  date VARCHAR(50),
  project_id INT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  customer VARCHAR(255),
  contract_id INT,
  status VARCHAR(50) DEFAULT '开工准备',
  progress INT DEFAULT 0,
  start_date VARCHAR(50),
  end_date VARCHAR(50),
  budget DECIMAL(12,2),
  cost DECIMAL(12,2) DEFAULT 0,
  manager VARCHAR(100),
  designer VARCHAR(100),
  description TEXT,
  stages LONGTEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00',
  customer_id INT,
  current_node_id INT,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  stage_name VARCHAR(255) NOT NULL,
  plan_start_date VARCHAR(50),
  plan_end_date VARCHAR(50),
  actual_start_date VARCHAR(50),
  actual_end_date VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  progress INT DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  content TEXT,
  operator VARCHAR(100),
  images TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  project_name VARCHAR(255),
  total_amount DECIMAL(12,2),
  status VARCHAR(50) DEFAULT '待确认',
  items LONGTEXT,
  valid_date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 仓库物料
-- ========================================
CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(50),
  quantity INT DEFAULT 0,
  price DECIMAL(12,2) DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  supplier VARCHAR(255),
  min_stock INT DEFAULT 0,
  location VARCHAR(255),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_in (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_id INT,
  quantity INT,
  unit_price DECIMAL(12,2),
  supplier VARCHAR(255),
  operator VARCHAR(100),
  note TEXT,
  date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_out (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_id INT,
  quantity INT,
  project_id INT,
  operator VARCHAR(100),
  note TEXT,
  date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_id INT,
  quantity INT,
  status VARCHAR(50) DEFAULT '待采购',
  order_date VARCHAR(50),
  expected_date VARCHAR(50),
  supplier VARCHAR(255),
  operator VARCHAR(100),
  note TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS main_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  original_price DECIMAL(12,2) DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  cost_price2 DECIMAL(12,2) DEFAULT 0,
  quote_price DECIMAL(12,2) DEFAULT 0,
  contract_price DECIMAL(12,2) DEFAULT 0,
  quote_unit VARCHAR(50),
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  purchase_unit VARCHAR(50),
  loss_rate DECIMAL(5,2) DEFAULT 0,
  loss_amount DECIMAL(10,2) DEFAULT 0,
  warranty_period VARCHAR(100),
  stock_period VARCHAR(100),
  specification TEXT,
  model VARCHAR(255),
  color VARCHAR(100),
  spec_alternative TEXT,
  model_alternative VARCHAR(255),
  color_alternative VARCHAR(100),
  brand VARCHAR(255),
  sort_order INT DEFAULT 0,
  remark TEXT,
  acceptance_remark TEXT,
  contract_remark TEXT,
  other_remark TEXT,
  position VARCHAR(255),
  package_name VARCHAR(255),
  upgrade_profit_rate DECIMAL(5,2) DEFAULT 0,
  internal_control_price DECIMAL(12,2) DEFAULT 0,
  combo TEXT,
  limit_formula TEXT,
  quote_formula TEXT,
  category VARCHAR(100),
  is_visible TINYINT DEFAULT 1,
  is_fixed TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00',
  updated_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 审批 / 报告 / 公告
-- ========================================
CREATE TABLE IF NOT EXISTS approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT '其他',
  applicant_id INT,
  applicant_name VARCHAR(100),
  content TEXT,
  amount DECIMAL(12,2),
  status VARCHAR(50) DEFAULT '待审批',
  approver_id INT,
  approver_name VARCHAR(100),
  approver_ids VARCHAR(500),
  approver_names VARCHAR(500),
  current_level INT DEFAULT 1,
  max_level INT DEFAULT 1,
  approve_time VARCHAR(50),
  remark TEXT,
  form_data TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00',
  updated_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 审批记录表
CREATE TABLE IF NOT EXISTS approval_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  approval_id INT,
  approver_id INT,
  approver_name VARCHAR(100),
  action VARCHAR(20) DEFAULT '同意',
  comment TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  user_name VARCHAR(100),
  title VARCHAR(255),
  content TEXT,
  type VARCHAR(50) DEFAULT '系统通知',
  related_id INT,
  related_type VARCHAR(50),
  is_read TINYINT DEFAULT 0,
  push_status VARCHAR(20) DEFAULT 'pending',
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  report_type VARCHAR(50) DEFAULT '日报',
  reporter_id INT,
  reporter_name VARCHAR(100),
  status VARCHAR(50) DEFAULT '待审核',
  reviewer_id INT,
  reviewer_name VARCHAR(100),
  review_time VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  type VARCHAR(50) DEFAULT '公告',
  publisher_id INT,
  publisher_name VARCHAR(100),
  status VARCHAR(50) DEFAULT '草稿',
  publish_time VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 巡检 / 验收 / 发票
-- ========================================
CREATE TABLE IF NOT EXISTS inspections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  project_name VARCHAR(255),
  inspector_id INT,
  inspector_name VARCHAR(100),
  score INT DEFAULT 100,
  status VARCHAR(50) DEFAULT '待整改',
  issues TEXT,
  images TEXT,
  result TEXT,
  rectify_status VARCHAR(50) DEFAULT '待整改',
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acceptance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  project_name VARCHAR(255),
  stage VARCHAR(100),
  accept_status VARCHAR(50) DEFAULT '待验收',
  accept_date VARCHAR(50),
  quality_score INT DEFAULT 100,
  issues TEXT,
  attachment VARCHAR(500),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(100),
  customer_id INT,
  customer_name VARCHAR(255),
  amount DECIMAL(12,2),
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2),
  type VARCHAR(50) DEFAULT '增值税发票',
  status VARCHAR(50) DEFAULT '待开具',
  issue_date VARCHAR(50),
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- ERP 扩展
-- ========================================
CREATE TABLE IF NOT EXISTS customer_pool (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  source VARCHAR(100),
  area DECIMAL(10,2),
  budget DECIMAL(12,2),
  demand TEXT,
  lost_reason TEXT,
  lost_date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS buildings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  area VARCHAR(100),
  building_type VARCHAR(100),
  total_houses INT,
  decoration_count INT DEFAULT 0,
  developer VARCHAR(255),
  property_fee DECIMAL(10,2),
  status VARCHAR(50) DEFAULT '在售',
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(50),
  address VARCHAR(500),
  commission_rate DECIMAL(5,2) DEFAULT 0,
  total_customer INT DEFAULT 0,
  status VARCHAR(50) DEFAULT '合作中',
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketing_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  building_name VARCHAR(255),
  area DECIMAL(10,2),
  style VARCHAR(100),
  budget DECIMAL(12,2),
  cost DECIMAL(12,2),
  images TEXT,
  description TEXT,
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  status VARCHAR(50) DEFAULT '草稿',
  publish_date VARCHAR(50),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(50),
  address VARCHAR(500),
  bank_account VARCHAR(100),
  tax_number VARCHAR(100),
  total_amount DECIMAL(12,2) DEFAULT 0,
  payable_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT '合作中',
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_no VARCHAR(100) UNIQUE,
  supplier_id INT,
  supplier_name VARCHAR(255),
  project_id INT,
  project_name VARCHAR(255),
  total_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT '待审核',
  purchase_date VARCHAR(50),
  expected_date VARCHAR(50),
  operator VARCHAR(100),
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT,
  material_id INT,
  material_name VARCHAR(255),
  unit VARCHAR(50),
  quantity INT,
  unit_price DECIMAL(12,2),
  total_price DECIMAL(12,2),
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cost_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  project_name VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  amount DECIMAL(12,2) NOT NULL,
  date VARCHAR(50),
  operator VARCHAR(100),
  invoice_status VARCHAR(50) DEFAULT '未开票',
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rectification_issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id INT,
  project_id INT,
  project_name VARCHAR(255),
  issue_desc TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT '普通',
  status VARCHAR(50) DEFAULT '待处理',
  responsible_id INT,
  responsible_name VARCHAR(100),
  due_date VARCHAR(50),
  finish_date VARCHAR(50),
  images TEXT,
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT,
  employee_name VARCHAR(100),
  date VARCHAR(50) NOT NULL,
  check_in_time VARCHAR(50),
  check_out_time VARCHAR(50),
  work_hours DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT '正常',
  type VARCHAR(50) DEFAULT '上班',
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 短信模板表
CREATE TABLE IF NOT EXISTS sms_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT,
  type VARCHAR(50) DEFAULT 'default',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 进度节点模板表
CREATE TABLE IF NOT EXISTS progress_node_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 进度节点模板节点表
CREATE TABLE IF NOT EXISTS progress_node_template_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  node_name VARCHAR(255) NOT NULL,
  node_key VARCHAR(100),
  sort_order INT DEFAULT 0,
  default_sms_template_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES progress_node_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warranties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  project_name VARCHAR(255),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  type VARCHAR(100),
  description TEXT,
  images TEXT,
  status VARCHAR(50) DEFAULT '待处理',
  handle_user VARCHAR(100),
  handle_date VARCHAR(50),
  result TEXT,
  satisfaction INT,
  cost DECIMAL(12,2) DEFAULT 0,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS design_measurements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  customer_name VARCHAR(255),
  building_name VARCHAR(255),
  house_number VARCHAR(100),
  area DECIMAL(10,2),
  layout VARCHAR(100),
  measure_date VARCHAR(50),
  designer VARCHAR(100),
  status VARCHAR(50) DEFAULT '待测量',
  drawings TEXT,
  remark TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dashboard_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stat_date VARCHAR(50) NOT NULL,
  new_customers INT DEFAULT 0,
  signed_contracts INT DEFAULT 0,
  total_income DECIMAL(12,2) DEFAULT 0,
  total_expense DECIMAL(12,2) DEFAULT 0,
  active_projects INT DEFAULT 0,
  finished_projects INT DEFAULT 0,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contract_variables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT '2024-01-01 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category VARCHAR(50) NOT NULL UNIQUE,
  setting_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 派工表
CREATE TABLE IF NOT EXISTS dispatches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  project_name VARCHAR(255),
  content VARCHAR(500) NOT NULL COMMENT '施工内容',
  location VARCHAR(255) COMMENT '施工地点',
  worker VARCHAR(100) COMMENT '工人/班组',
  fee VARCHAR(50) COMMENT '工费',
  start_date DATE COMMENT '开始时间',
  requirement TEXT COMMENT '施工要求',
  status VARCHAR(20) DEFAULT '待接单' COMMENT '待接单/施工中/已完工',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- 索引建议（按需添加）
-- CREATE INDEX idx_employees_username ON employees(username);
-- CREATE INDEX idx_customers_phone ON customers(phone);
-- CREATE INDEX idx_contracts_contract_no ON contracts(contract_no);
-- CREATE INDEX idx_projects_status ON projects(status);
-- CREATE INDEX idx_finance_date ON finance(date);
-- CREATE INDEX idx_finance_type ON finance(type);
