-- ================================================
-- 为核心业务表添加 creator_id 字段
-- 执行时间：2026-09-20
-- ================================================

ALTER TABLE contracts ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE contract_templates ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE signers ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE projects ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE project_stages ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE project_logs ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE quotes ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE customer_follow ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE materials ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE material_orders ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE main_materials ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE inspections ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE acceptance ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE dispatches ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE finance ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
ALTER TABLE budgets ADD COLUMN creator_id INT DEFAULT NULL COMMENT '创建人ID';
