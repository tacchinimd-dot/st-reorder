-- 기존 reorder_decisions 테이블에 칼럼 추가
ALTER TABLE reorder_decisions ADD COLUMN IF NOT EXISTS prdt_nm TEXT DEFAULT '';
ALTER TABLE reorder_decisions ADD COLUMN IF NOT EXISTS item_group TEXT DEFAULT '';
ALTER TABLE reorder_decisions ADD COLUMN IF NOT EXISTS category_type TEXT DEFAULT '';
ALTER TABLE reorder_decisions ADD COLUMN IF NOT EXISTS agreed_delivery_date DATE;
