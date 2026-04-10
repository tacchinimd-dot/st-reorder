-- ST 리오더 관리 시스템 — Supabase 테이블 스키마

-- 1. 스타일별 데이터 (매주 스크립트로 갱신)
CREATE TABLE IF NOT EXISTS style_data (
  id BIGSERIAL PRIMARY KEY,
  prdt_cd TEXT NOT NULL,
  prdt_nm TEXT,
  item_group TEXT,
  sesn TEXT,
  sex TEXT DEFAULT '',
  tag_price INTEGER DEFAULT 0,
  img_url TEXT,
  stor_qty INTEGER DEFAULT 0,
  sale_qty INTEGER DEFAULT 0,
  stock_qty INTEGER DEFAULT 0,
  sale_rt REAL DEFAULT 0,
  -- 예상판매 (월별 JSON)
  forecast_months JSONB DEFAULT '{}',
  est_remaining INTEGER,
  match_type TEXT,
  material TEXT,
  mccc BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prdt_cd)
);

-- 2. 컬러별 데이터 (매주 스크립트로 갱신)
CREATE TABLE IF NOT EXISTS color_data (
  id BIGSERIAL PRIMARY KEY,
  prdt_cd TEXT NOT NULL,
  color_cd TEXT NOT NULL,
  prdt_nm TEXT,
  item_group TEXT,
  sesn TEXT,
  sex TEXT DEFAULT '',
  tag_price INTEGER DEFAULT 0,
  img_url TEXT,
  stor_qty INTEGER DEFAULT 0,
  sale_qty INTEGER DEFAULT 0,
  stock_qty INTEGER DEFAULT 0,
  sale_rt REAL DEFAULT 0,
  forecast_months JSONB DEFAULT '{}',
  est_remaining INTEGER,
  match_type TEXT,
  material TEXT,
  mccc BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prdt_cd, color_cd)
);

-- 3. 리오더 결정사항 (웹에서 저장, 스크립트가 건드리지 않음)
CREATE TABLE IF NOT EXISTS reorder_decisions (
  id BIGSERIAL PRIMARY KEY,
  prdt_cd TEXT NOT NULL,
  color_cd TEXT DEFAULT '',
  item_type TEXT DEFAULT 'color',  -- 'style' or 'color'
  -- 표시용 정보 (재로드 시 표시를 위해 보관)
  prdt_nm TEXT DEFAULT '',
  item_group TEXT DEFAULT '',
  category_type TEXT DEFAULT '',  -- '의류' or '용품'
  decision TEXT NOT NULL,          -- '진행', '보류', '불필요'
  reorder_qty INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  -- 합의납기일 (사용자 입력)
  agreed_delivery_date DATE,
  -- 결정 당시 스냅샷 (재점검 판단용)
  snapshot_stor_qty INTEGER,
  snapshot_est_remaining INTEGER,
  snapshot_sale_rt REAL,
  -- 재점검 플래그
  needs_review BOOLEAN DEFAULT FALSE,
  review_reason TEXT DEFAULT '',
  -- 메타
  decided_by TEXT DEFAULT 'unknown',
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prdt_cd, color_cd)
);

-- 4. 데이터 갱신 이력
CREATE TABLE IF NOT EXISTS data_refresh_log (
  id BIGSERIAL PRIMARY KEY,
  refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  style_count INTEGER DEFAULT 0,
  color_count INTEGER DEFAULT 0,
  review_flagged INTEGER DEFAULT 0,
  note TEXT DEFAULT ''
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_style_data_sesn ON style_data(sesn);
CREATE INDEX IF NOT EXISTS idx_color_data_prdt ON color_data(prdt_cd);
CREATE INDEX IF NOT EXISTS idx_color_data_sesn ON color_data(sesn);
CREATE INDEX IF NOT EXISTS idx_reorder_decisions_prdt ON reorder_decisions(prdt_cd);
CREATE INDEX IF NOT EXISTS idx_reorder_decisions_decision ON reorder_decisions(decision);
