-- ============================================================
-- v2.2 合同管理与财务管理功能迁移
-- 执行方式：连接到云服务器 MySQL 后执行
-- ============================================================

-- 1. contracts 表新增字段（关联项目 + 营收金额 + 合同文件）
ALTER TABLE contracts ADD COLUMN project_id INT DEFAULT NULL COMMENT '关联项目ID' AFTER customer_id;
ALTER TABLE contracts ADD COLUMN contract_amount DECIMAL(12,2) DEFAULT NULL COMMENT '营收金额（合同金额）' AFTER project_id;
ALTER TABLE contracts ADD COLUMN file_path VARCHAR(500) DEFAULT NULL COMMENT '合同文件路径' AFTER contract_amount;
ALTER TABLE contracts ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending' COMMENT '审核状态：pending/approved/rejected' AFTER file_path;
ALTER TABLE contracts ADD COLUMN reviewed_by INT DEFAULT NULL COMMENT '审核人ID' AFTER review_status;
ALTER TABLE contracts ADD COLUMN reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间' AFTER reviewed_by;

-- 为 contracts.project_id 添加索引
CREATE INDEX idx_contracts_project_id ON contracts(project_id);

-- 2. 新增增减项表 contract_changes
CREATE TABLE IF NOT EXISTS contract_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL COMMENT '关联合同ID',
  project_id INT NOT NULL COMMENT '关联项目ID',
  type ENUM('increase', 'decrease') NOT NULL COMMENT 'increase=增项, decrease=减项',
  project_name VARCHAR(255) NOT NULL COMMENT '施工项目名称',
  amount DECIMAL(12,2) NOT NULL COMMENT '金额',
  details TEXT COMMENT '详情描述',
  status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/approved/rejected',
  created_by INT DEFAULT NULL COMMENT '创建人（员工）',
  reviewed_by INT DEFAULT NULL COMMENT '审核人（项目经理）',
  reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_contract_changes_project_id ON contract_changes(project_id);
CREATE INDEX idx_contract_changes_contract_id ON contract_changes(contract_id);
CREATE INDEX idx_contract_changes_status ON contract_changes(status);

-- 3. 新增催收记录表 collection_records
CREATE TABLE IF NOT EXISTS collection_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '关联项目ID',
  amount DECIMAL(12,2) NOT NULL COMMENT '催收金额',
  record_date DATE NOT NULL COMMENT '记录日期',
  remark TEXT COMMENT '备注',
  images TEXT COMMENT '图片JSON数组',
  status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending待确认, confirmed已确认收款',
  created_by INT DEFAULT NULL COMMENT '录入人',
  confirmed_by INT DEFAULT NULL COMMENT '确认人（财务）',
  confirmed_at DATETIME DEFAULT NULL COMMENT '确认时间',
  confirmed_amount DECIMAL(12,2) DEFAULT NULL COMMENT '实际确认金额',
  confirmed_remark TEXT COMMENT '确认备注',
  confirmed_images TEXT COMMENT '确认图片JSON',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_collection_records_project_id ON collection_records(project_id);
CREATE INDEX idx_collection_records_status ON collection_records(status);

-- 4. 新增收支记录表 payment_records
CREATE TABLE IF NOT EXISTS payment_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '关联项目ID',
  type VARCHAR(20) NOT NULL COMMENT 'expense=支出, income=收入',
  category VARCHAR(50) DEFAULT 'manual' COMMENT '来源分类：dispatch/purchase/manual/collection',
  source_id INT DEFAULT NULL COMMENT '来源记录ID（如派工ID/采购ID）',
  amount DECIMAL(12,2) NOT NULL COMMENT '金额',
  status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending待确认, confirmed已确认',
  remark TEXT COMMENT '备注',
  created_by INT DEFAULT NULL COMMENT '创建人',
  confirmed_by INT DEFAULT NULL COMMENT '确认人',
  confirmed_at DATETIME DEFAULT NULL COMMENT '确认时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_payment_records_project_id ON payment_records(project_id);
CREATE INDEX idx_payment_records_type ON payment_records(type);
CREATE INDEX idx_payment_records_status ON payment_records(status);

-- 5. 更新派工表状态（新增"已审核"状态用于触发自动写入payment_records）
-- dispatches.status 现有值：待接单/施工中/已完工
-- 新增：已审核（财务审核通过后状态，或派工完成自动进入）
-- 注意：如果派工审核通过就写入payment_records，则需要一个新字段或新状态
-- 这里用新的 review_status 字段来区分"派工业务审核"和"财务确认"
ALTER TABLE dispatches ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending' COMMENT '业务审核状态：pending/approved/rejected';
ALTER TABLE dispatches ADD COLUMN financial_status VARCHAR(20) DEFAULT 'unpaid' COMMENT '财务状态：unpaid/paid';

-- ============================================================
-- 迁移数据（测试用，真实环境可跳过）
-- ============================================================
-- INSERT INTO contract_changes (contract_id, project_id, type, project_name, amount, details, status, created_by)
-- VALUES (1, 5, 'increase', '水电改造', 500, '增项内容', 'approved', 1);

-- INSERT INTO collection_records (project_id, amount, record_date, remark, images, status, created_by)
-- VALUES (5, 3000, '2026-10-01', '第一次催款', '[]', 'confirmed', 1);

-- INSERT INTO payment_records (project_id, type, category, source_id, amount, status, remark, created_by)
-- VALUES (5, 'expense', 'dispatch', 1, 2000, 'confirmed', '派工费', 1);
