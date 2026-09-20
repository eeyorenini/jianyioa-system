-- v2.1.14 数据库迁移
-- 给 roles 表新增两个字段用于消息订阅和管理范围

-- notification_types: JSON数组，角色能收到哪些消息类型
-- managed_department_ids: JSON数组，角色能管理哪些部门（null=管全部）
ALTER TABLE roles ADD COLUMN notification_types TEXT;
ALTER TABLE roles ADD COLUMN managed_department_ids TEXT;

-- 更新管理员角色的默认值（拥有所有消息类型）
UPDATE roles SET notification_types = '["contract_created","contract_updated","project_created","project_status_changed","node_status_changed","project_progress","inspection_submit","acceptance_submit","dispatch_created","dispatch_status_changed","approval_submit","approval_result","notice_published","customer_follow","invoice_created","system_notice"]' WHERE code = 'admin' OR id = 1;

-- 更新管理员的管理范围（null=全部部门）
UPDATE roles SET managed_department_ids = NULL WHERE code = 'admin' OR id = 1;
