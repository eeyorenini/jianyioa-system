-- approvals 表新增字段
ALTER TABLE approvals 
  ADD COLUMN approver_ids VARCHAR(500) DEFAULT NULL COMMENT '审批人ID列表，逗号分隔' AFTER approver_name,
  ADD COLUMN approver_names VARCHAR(500) DEFAULT NULL COMMENT '审批人姓名列表' AFTER approver_ids,
  ADD COLUMN current_level INT DEFAULT 1 COMMENT '当前审批级别' AFTER approver_names,
  ADD COLUMN max_level INT DEFAULT 1 COMMENT '最大审批级别' AFTER current_level,
  ADD COLUMN form_data TEXT DEFAULT NULL COMMENT '表单JSON数据' AFTER remark,
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at;

-- 新建审批记录表
CREATE TABLE IF NOT EXISTS approval_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  approval_id INT COMMENT '审批ID',
  approver_id INT COMMENT '审批人ID',
  approver_name VARCHAR(100) COMMENT '审批人姓名',
  action VARCHAR(20) DEFAULT '同意' COMMENT '操作：同意/驳回',
  comment TEXT COMMENT '审批意见',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 新建消息表
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT COMMENT '接收人ID',
  user_name VARCHAR(100) COMMENT '接收人姓名',
  title VARCHAR(255) COMMENT '消息标题',
  content TEXT COMMENT '消息内容',
  type VARCHAR(50) DEFAULT '系统通知' COMMENT '消息类型：审批/系统/通知',
  related_id INT COMMENT '关联业务ID',
  related_type VARCHAR(50) COMMENT '关联业务类型',
  is_read TINYINT DEFAULT 0 COMMENT '是否已读',
  push_status VARCHAR(20) DEFAULT 'pending' COMMENT '推送状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
