require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Supabase 클라이언트
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── 스타일 데이터 조회 ──
app.get('/api/styles', async (req, res) => {
  const { data, error } = await supabase
    .from('style_data')
    .select('*')
    .order('sale_rt', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── 컬러 데이터 조회 ──
app.get('/api/colors', async (req, res) => {
  const { data, error } = await supabase
    .from('color_data')
    .select('*')
    .order('prdt_cd', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── 리오더 점검 대상 (컬러 단위, MCCC 제외, est_remaining < 0) ──
app.get('/api/review', async (req, res) => {
  const { data, error } = await supabase
    .from('color_data')
    .select('*')
    .eq('mccc', false)
    .lt('est_remaining', 0)
    .order('est_remaining', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  // 이미 결정된 것 제외
  const { data: decided } = await supabase
    .from('reorder_decisions')
    .select('prdt_cd, color_cd');
  const decidedKeys = new Set((decided || []).map(d => `${d.prdt_cd}|${d.color_cd}`));
  const filtered = data.filter(r => !decidedKeys.has(`${r.prdt_cd}|${r.color_cd}`));

  res.json(filtered);
});

// ── 리오더 결정사항 CRUD ──

// 전체 조회
app.get('/api/decisions', async (req, res) => {
  const { data, error } = await supabase
    .from('reorder_decisions')
    .select('*')
    .order('decided_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 결정 저장 (upsert)
app.post('/api/decisions', async (req, res) => {
  const { prdt_cd, color_cd = '', item_type = 'color',
          prdt_nm = '', item_group = '', category_type = '',
          decision, reorder_qty = 0, memo = '', decided_by = 'unknown',
          agreed_delivery_date = null,
          snapshot_stor_qty, snapshot_est_remaining, snapshot_sale_rt } = req.body;

  const { data, error } = await supabase
    .from('reorder_decisions')
    .upsert({
      prdt_cd, color_cd, item_type, prdt_nm, item_group, category_type,
      decision, reorder_qty, memo, decided_by,
      agreed_delivery_date,
      snapshot_stor_qty, snapshot_est_remaining, snapshot_sale_rt,
      needs_review: false, review_reason: '',
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'prdt_cd,color_cd' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 결정 삭제 (되돌리기)
app.delete('/api/decisions/:prdt_cd/:color_cd', async (req, res) => {
  const { prdt_cd, color_cd } = req.params;
  const { error } = await supabase
    .from('reorder_decisions')
    .delete()
    .eq('prdt_cd', prdt_cd)
    .eq('color_cd', color_cd || '');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── 재점검 필요 항목 조회 ──
app.get('/api/decisions/review-needed', async (req, res) => {
  const { data, error } = await supabase
    .from('reorder_decisions')
    .select('*')
    .eq('needs_review', true)
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── 상세 조회 (스타일 + 하위 컬러) ──
app.get('/api/detail/:prdt_cd', async (req, res) => {
  const { prdt_cd } = req.params;
  const [styleRes, colorRes, decisionRes] = await Promise.all([
    supabase.from('style_data').select('*').eq('prdt_cd', prdt_cd).single(),
    supabase.from('color_data').select('*').eq('prdt_cd', prdt_cd).order('sale_rt', { ascending: false }),
    supabase.from('reorder_decisions').select('*').eq('prdt_cd', prdt_cd),
  ]);
  res.json({
    style: styleRes.data,
    colors: colorRes.data || [],
    decisions: decisionRes.data || [],
  });
});

// ── 데이터 갱신 이력 ──
app.get('/api/refresh-log', async (req, res) => {
  const { data, error } = await supabase
    .from('data_refresh_log')
    .select('*')
    .order('refreshed_at', { ascending: false })
    .limit(10);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── 검색 (컬러 단위만) ──
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (q.length < 2) return res.json([]);

  const { data: colorRes } = await supabase
    .from('color_data')
    .select('prdt_cd, color_cd, prdt_nm, item_group, sesn, sex, stor_qty, est_remaining, mccc, img_url, sale_rt, forecast_months');

  const results = [];
  for (const r of (colorRes || [])) {
    if ((r.prdt_cd + ' ' + r.prdt_nm + ' ' + r.color_cd).toLowerCase().includes(q)) {
      results.push({ ...r, type: 'color' });
    }
  }

  res.json(results.slice(0, 30));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ST Reorder server running on port ${PORT}`);
});
