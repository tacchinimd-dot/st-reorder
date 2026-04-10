-- 결정사항 변경 이력 테이블
CREATE TABLE IF NOT EXISTS decision_history (
  id BIGSERIAL PRIMARY KEY,
  prdt_cd TEXT NOT NULL,
  color_cd TEXT DEFAULT '',
  action TEXT NOT NULL,  -- 'create', 'update', 'delete'
  prev_decision TEXT DEFAULT '',
  new_decision TEXT DEFAULT '',
  prev_reorder_qty INTEGER,
  new_reorder_qty INTEGER,
  prev_delivery_date DATE,
  new_delivery_date DATE,
  prev_memo TEXT DEFAULT '',
  new_memo TEXT DEFAULT '',
  changed_by TEXT DEFAULT '',
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_history_prdt ON decision_history(prdt_cd, color_cd);
CREATE INDEX IF NOT EXISTS idx_decision_history_changed ON decision_history(changed_at DESC);
