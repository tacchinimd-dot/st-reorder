/**
 * 데이터 갱신 스크립트 — 로컬에서 실행
 *
 * 사용법:
 *   node server/refresh.js <style_json> <color_json> <style_fc_json> <color_fc_json>
 *
 * 또는 Python에서 JSON 파일을 생성한 후 이 스크립트로 Supabase에 업로드.
 * 갱신 시 기존 reorder_decisions의 snapshot과 현재 값을 비교하여 needs_review 플래그 설정.
 */

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const REVIEW_THRESHOLD = 30; // 예상잔여 변동이 30 이상이면 재점검

async function refresh(styleFile, colorFile) {
  console.log('데이터 갱신 시작...');

  const styleData = JSON.parse(fs.readFileSync(styleFile, 'utf-8'));
  const colorData = JSON.parse(fs.readFileSync(colorFile, 'utf-8'));

  // 1. style_data upsert
  console.log(`스타일 ${styleData.length}건 업로드...`);
  const { error: sErr } = await supabase
    .from('style_data')
    .upsert(styleData.map(r => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: 'prdt_cd' });
  if (sErr) console.error('style_data 오류:', sErr.message);

  // 2. color_data upsert
  console.log(`컬러 ${colorData.length}건 업로드...`);
  const { error: cErr } = await supabase
    .from('color_data')
    .upsert(colorData.map(r => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: 'prdt_cd,color_cd' });
  if (cErr) console.error('color_data 오류:', cErr.message);

  // 3. 재점검 플래그 설정
  console.log('재점검 플래그 확인...');
  const { data: decisions } = await supabase
    .from('reorder_decisions')
    .select('*');

  let reviewFlagged = 0;
  for (const d of (decisions || [])) {
    // 현재 데이터에서 해당 아이템 찾기
    let currentRem = null;
    if (d.color_cd) {
      const found = colorData.find(c => c.prdt_cd === d.prdt_cd && c.color_cd === d.color_cd);
      if (found) currentRem = found.est_remaining;
    } else {
      const found = styleData.find(s => s.prdt_cd === d.prdt_cd);
      if (found) currentRem = found.est_remaining;
    }

    if (currentRem === null) continue;

    const diff = Math.abs((currentRem || 0) - (d.snapshot_est_remaining || 0));
    const needsReview = diff >= REVIEW_THRESHOLD;
    let reason = '';

    if (needsReview) {
      const direction = currentRem < d.snapshot_est_remaining ? '악화' : '개선';
      reason = `예상잔여 ${direction}: ${d.snapshot_est_remaining} → ${currentRem} (변동 ${diff})`;
      reviewFlagged++;
    }

    if (needsReview !== d.needs_review || reason !== d.review_reason) {
      await supabase
        .from('reorder_decisions')
        .update({ needs_review: needsReview, review_reason: reason, updated_at: new Date().toISOString() })
        .eq('prdt_cd', d.prdt_cd)
        .eq('color_cd', d.color_cd || '');
    }
  }

  // 4. 갱신 이력 기록
  await supabase.from('data_refresh_log').insert({
    style_count: styleData.length,
    color_count: colorData.length,
    review_flagged: reviewFlagged,
    note: `갱신완료. 재점검 ${reviewFlagged}건`,
  });

  console.log(`완료! 스타일 ${styleData.length}, 컬러 ${colorData.length}, 재점검 ${reviewFlagged}건`);
}

// CLI 실행
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('사용법: node server/refresh.js <style.json> <color.json>');
  process.exit(1);
}
refresh(args[0], args[1]).catch(console.error);
