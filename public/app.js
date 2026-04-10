/**
 * ST 리오더 관리 — 프론트엔드 앱
 * API 서버와 통신하여 데이터 조회/결정 저장
 */

const API = ''; // 같은 origin이므로 빈 문자열
const MONTHS = ['202601','202602','202603','202604','202605','202606','202607','202608','202609','202610','202611','202612'];
const MLABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const LEAD_TIME_WEEKS = 10; // 리드타임 평균 (8~12주)
const SAFETY_STOCK_WEEKS = 2; // 안전재고 주수

let styleData = [];
let colorData = [];
let reviewData = [];
let decisions = [];
let calcRows = [];
let decidedRows = [];
let calcId = 0;
let currentUser = localStorage.getItem('st_reorder_user') || '';
let selectedReviewKeys = new Set();
let selectedCalcIds = new Set();

// ── 사용자 이름 ──
function ensureUser() {
  if (!currentUser) {
    const name = prompt('사용자 이름을 입력하세요 (팀원 식별용):');
    if (name && name.trim()) {
      currentUser = name.trim();
      localStorage.setItem('st_reorder_user', currentUser);
    } else {
      currentUser = 'unknown';
    }
  }
  return currentUser;
}

// ── 초기화 ──
async function init() {
  ensureUser();
  try {
    const [sRes, cRes, rRes, dRes] = await Promise.all([
      fetch(API + '/api/styles').then(r => r.json()),
      fetch(API + '/api/colors').then(r => r.json()),
      fetch(API + '/api/review').then(r => r.json()),
      fetch(API + '/api/decisions').then(r => r.json()),
    ]);
    styleData = sRes;
    colorData = cRes;
    reviewData = rRes;
    decisions = dRes;
    decidedRows = dRes.map(d => ({
      id: calcId++, key: d.color_cd ? d.prdt_cd + '|' + d.color_cd : d.prdt_cd,
      cd: d.prdt_cd, cc: d.color_cd || '',
      nm: d.prdt_nm || '', ig: d.item_group || '', tp: d.category_type || '',
      stor: d.snapshot_stor_qty, rem: d.snapshot_est_remaining,
      reorderQty: d.reorder_qty, decision: d.decision, memo: d.memo,
      deliveryDate: d.agreed_delivery_date || '',
      needsReview: d.needs_review, reviewReason: d.review_reason,
    }));

    renderKPI();
    renderCalcTab();
    renderStyleTab('ws', styleData.filter(r => r.sesn && (r.sesn.endsWith('S') || r.sesn.endsWith('F'))), false);
    renderStyleTab('wc', colorData.filter(r => r.sesn && (r.sesn.endsWith('S') || r.sesn.endsWith('F'))), true);
    renderStyleTab('as', styleData.filter(r => r.sesn && r.sesn.endsWith('N')), false);
    renderStyleTab('ac', colorData.filter(r => r.sesn && r.sesn.endsWith('N')), true);
  } catch (e) {
    document.querySelectorAll('.loading').forEach(el => el.textContent = '데이터 로딩 실패: ' + e.message);
  }
}

// ── KPI ──
function renderKPI() {
  const totalStor = styleData.reduce((s, r) => s + (r.stor_qty || 0), 0);
  const totalSale = styleData.reduce((s, r) => s + (r.sale_qty || 0), 0);
  const totalStock = styleData.reduce((s, r) => s + (r.stock_qty || 0), 0);
  const avgRt = totalStor > 0 ? (totalSale / totalStor * 100).toFixed(1) : '0.0';
  const wearCnt = styleData.filter(r => r.sesn && (r.sesn.endsWith('S') || r.sesn.endsWith('F'))).length;
  const accCnt = styleData.filter(r => r.sesn && r.sesn.endsWith('N')).length;
  const wearColor = colorData.filter(r => r.sesn && (r.sesn.endsWith('S') || r.sesn.endsWith('F'))).length;
  const accColor = colorData.filter(r => r.sesn && r.sesn.endsWith('N')).length;

  document.getElementById('header-meta').textContent =
    `26SS+26N | 입고=판매+재고 | 리드타임 8~12주`;

  document.getElementById('kpi-bar').innerHTML = `
    <div class="kpi"><div class="kl">의류</div><div class="kv">${wearCnt}</div><div class="ks">컬러${wearColor}</div></div>
    <div class="kpi"><div class="kl">용품</div><div class="kv">${accCnt}</div><div class="ks">컬러${accColor}</div></div>
    <div class="kpi"><div class="kl">총입고</div><div class="kv">${totalStor.toLocaleString()}</div></div>
    <div class="kpi"><div class="kl">총판매</div><div class="kv">${totalSale.toLocaleString()}</div></div>
    <div class="kpi"><div class="kl">총재고</div><div class="kv">${totalStock.toLocaleString()}</div></div>
    <div class="kpi"><div class="kl">판매율</div><div class="kv">${avgRt}%</div></div>
    <div class="kpi kpi-clickable" onclick="openReviewPanel()"><div class="kl">리오더 점검</div><div class="kv" style="color:#ff6352" id="review-badge">${reviewData.length}</div><div class="ks">컬러 단위</div></div>
  `;
}

// ── 탭 전환 ──
const TAB_IDS = ['calc', 'ws', 'wc', 'as', 'ac'];
function switchTab(t) {
  TAB_IDS.forEach(id => document.getElementById('tab-' + id).classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + t).classList.add('active');
  document.querySelectorAll('.tab-btn')[TAB_IDS.indexOf(t)].classList.add('active');
}

// ── 미니 바 차트 생성 ──
function buildBar(forecastMonths) {
  if (!forecastMonths || typeof forecastMonths !== 'object') return '-';
  const now = new Date();
  const curYYMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevYYMM = now.getMonth() === 0
    ? `${now.getFullYear() - 1}12`
    : `${now.getFullYear()}${String(now.getMonth()).padStart(2, '0')}`;

  const vals = MONTHS.map(m => forecastMonths[m] || 0);
  const mx = Math.max(...vals, 1);
  return '<div class="bar-chart">' + MONTHS.map((m, i) => {
    const v = forecastMonths[m] || 0;
    const h = v > 0 ? Math.max(2, Math.round(v / mx * 36)) : 2;
    const cls = m < curYYMM ? 'bar-a' : (m === curYYMM ? 'bar-m' : 'bar-f');
    return `<div class="bc" title="${MLABELS[i]}: ${v.toLocaleString()}"><div class="b ${cls}" style="height:${h}px"></div><div class="bv">${v}</div><div class="bm">${MLABELS[i].slice(0,2)}</div></div>`;
  }).join('') + '</div>';
}

// SVG 선 그래프 생성
function buildSVGChart(vals, curYYMM) {
  const W = 800, H = 200, PAD_L = 40, PAD_R = 20, PAD_T = 20, PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const max = Math.max(...vals, 1);
  const stepX = chartW / (vals.length - 1);

  // 당월 인덱스 (구분점)
  const curIdx = MONTHS.indexOf(curYYMM);

  // 점들
  const points = vals.map((v, i) => ({
    x: PAD_L + i * stepX,
    y: PAD_T + chartH - (v / max * chartH),
    v, i
  }));

  // 실적선 (초록) + 예측선 (주황)
  let actualPath = '', forecastPath = '';
  points.forEach((p, i) => {
    const cmd = (i === 0 || (curIdx > 0 && i === curIdx)) ? 'M' : 'L';
    if (i <= curIdx) actualPath += `${cmd}${p.x},${p.y} `;
    if (i >= curIdx) {
      if (i === curIdx) forecastPath += `M${p.x},${p.y} `;
      else forecastPath += `L${p.x},${p.y} `;
    }
  });

  // 축
  let axis = `<line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#ccc"/>`;
  axis += `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#ccc"/>`;

  // Y축 레이블 (0, max/2, max)
  axis += `<text x="${PAD_L - 5}" y="${PAD_T + 4}" text-anchor="end" font-size="10" fill="#888">${max}</text>`;
  axis += `<text x="${PAD_L - 5}" y="${PAD_T + chartH / 2 + 4}" text-anchor="end" font-size="10" fill="#888">${Math.round(max / 2)}</text>`;
  axis += `<text x="${PAD_L - 5}" y="${H - PAD_B + 4}" text-anchor="end" font-size="10" fill="#888">0</text>`;

  // X축 레이블
  MLABELS.forEach((l, i) => {
    axis += `<text x="${PAD_L + i * stepX}" y="${H - PAD_B + 14}" text-anchor="middle" font-size="10" fill="#888">${l}</text>`;
  });

  // 점 원
  let circles = '';
  points.forEach((p, i) => {
    const fill = i < curIdx ? '#4caf50' : (i === curIdx ? '#ffa726' : '#ff9800');
    circles += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${fill}"><title>${MLABELS[i]}: ${p.v.toLocaleString()}</title></circle>`;
    circles += `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="9" fill="#555">${p.v}</text>`;
  });

  return `<div style="background:#fff;border:1px solid #eee;border-radius:8px;padding:8px">
    <svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:100%">
      ${axis}
      <path d="${actualPath}" fill="none" stroke="#4caf50" stroke-width="2.5"/>
      <path d="${forecastPath}" fill="none" stroke="#ff9800" stroke-width="2.5" stroke-dasharray="4,4"/>
      ${circles}
    </svg>
  </div>`;
}

// 시즌마감 예상 판매율 계산
function calcSeasonEndSellThrough(r) {
  const fm = r.forecast_months || {};
  const total = MONTHS.reduce((s, m) => s + (fm[m] || 0), 0);
  const stor = r.stor_qty || 0;
  if (stor === 0) return 0;
  return Math.min(1, total / stor);
}

// ── 스타일/컬러 테이블 렌더링 ──
function renderStyleTab(tabId, data, withColor) {
  const tab = document.getElementById('tab-' + tabId);
  const isWear = tabId.startsWith('w');
  const typeLabel = isWear ? '의류' : '용품';

  let rows = '';
  data.forEach((r, i) => {
    const rtPct = ((r.sale_rt || 0) * 100).toFixed(1);
    const rtCls = rtPct >= 20 ? 'rt-high' : (rtPct >= 10 ? 'rt-mid' : '');
    const seasonRt = calcSeasonEndSellThrough(r);
    const seasonRtPct = (seasonRt * 100).toFixed(0);
    const seasonRtCls = seasonRt >= 0.9 ? 'rt-high' : (seasonRt >= 0.7 ? 'rt-mid' : '');
    const img = r.img_url ? `<img src="${r.img_url}" loading="lazy" onerror="this.style.display='none'">` : '';
    const bar = buildBar(r.forecast_months);
    const rem = r.est_remaining;
    const remCls = rem !== null && rem < 0 ? 'rem-danger' : (rem !== null && rem < 50 ? 'rem-warn' : '');
    const remStr = rem !== null ? rem.toLocaleString() : '-';
    const key = withColor ? r.prdt_cd + '|' + (r.color_cd || '') : r.prdt_cd;
    const colorTd = withColor ? `<td>${r.color_cd || ''}</td>` : '';
    const shortCd = r.prdt_cd.length > 9 ? r.prdt_cd.slice(-9) : r.prdt_cd;

    rows += `<tr data-cat="${r.item_group || ''}" data-sesn="${r.sesn || ''}">
      <td>${i + 1}</td><td class="img-cell">${img}</td>
      <td>${r.item_group || ''}</td><td>${r.sex || ''}</td><td>${r.sesn || ''}</td>
      <td class="cd clickable" onclick="showDetail('${key}')">${shortCd}</td>
      <td class="left pnm clickable" onclick="showDetail('${key}')" title="${r.prdt_nm || ''}">${r.prdt_nm || ''}</td>
      ${colorTd}
      <td class="right">${(r.tag_price || 0).toLocaleString()}</td>
      <td class="right">${(r.stor_qty || 0).toLocaleString()}</td>
      <td class="right">${(r.sale_qty || 0).toLocaleString()}</td>
      <td class="right"><span class="rt-badge ${rtCls}">${rtPct}%</span></td>
      <td class="right">${(r.stock_qty || 0).toLocaleString()}</td>
      <td class="fc-cell">${bar}</td>
      <td class="right ${remCls}"><strong>${remStr}</strong></td>
      <td class="right"><span class="rt-badge ${seasonRtCls}">${seasonRtPct}%</span></td>
    </tr>`;
  });

  const colorTh = withColor ? `<th>컬러</th>` : '';

  tab.innerHTML = `
    <div class="legend">
      <span><span class="dot" style="background:#4caf50"></span> 실적확정</span>
      <span><span class="dot" style="background:linear-gradient(to right,#4caf50 50%,#ff9800 50%)"></span> 당월(실적+예측)</span>
      <span><span class="dot" style="background:#ff9800"></span> 예측</span>
      <span style="color:#d32f2f;font-weight:700">빨간색=재고부족</span>
      <span>품번 클릭→상세</span>
    </div>
    <div class="count-info">${typeLabel} <strong>${data.length}</strong>개</div>
    <div class="tbl-wrap"><table class="dt" id="tbl-${tabId}"><thead><tr>
      <th>No</th><th>이미지</th><th>카테고리</th><th>성별</th><th>시즌</th><th>품번</th><th>제품명</th>
      ${colorTh}<th>택가</th><th>입고</th><th>판매</th><th>판매율</th><th>재고</th><th>월별예상판매</th><th>예상잔여</th><th>마감예상판매율</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ── 상세 팝업 ──
async function showDetail(key) {
  const parts = key.split('|');
  const prdt_cd = parts[0];
  const color_cd = parts[1] || '';

  try {
    const res = await fetch(API + '/api/detail/' + prdt_cd);
    const { style, colors, decisions: decs } = await res.json();

    if (!style) { alert('데이터를 찾을 수 없습니다.'); return; }

    const target = color_cd ? colors.find(c => c.color_cd === color_cd) || style : style;
    const fm = target.forecast_months || {};

    let h = '<button class="modal-close" onclick="closeModal()">&times;</button>';
    h += `<h2>${target.prdt_nm || '-'}</h2>`;
    h += `<div class="modal-sub">${target.prdt_cd.slice(-9)}${color_cd ? ' / ' + color_cd : ''} | ${target.item_group} | ${target.sesn} | ${target.match_type || ''} | ${target.material || ''}</div>`;
    h += '<div class="modal-kpi">';
    h += `<div class="mk"><div class="mkl">택가</div><div class="mkv">${(target.tag_price || 0).toLocaleString()}</div></div>`;
    h += `<div class="mk"><div class="mkl">입고</div><div class="mkv">${(target.stor_qty || 0).toLocaleString()}</div></div>`;
    h += `<div class="mk"><div class="mkl">판매</div><div class="mkv">${(target.sale_qty || 0).toLocaleString()}</div></div>`;
    h += `<div class="mk"><div class="mkl">판매율</div><div class="mkv">${((target.sale_rt || 0) * 100).toFixed(1)}%</div></div>`;
    h += `<div class="mk"><div class="mkl">재고</div><div class="mkv">${(target.stock_qty || 0).toLocaleString()}</div></div>`;
    const rem = target.est_remaining;
    const remStyle = rem !== null && rem < 0 ? 'color:#d32f2f' : '';
    h += `<div class="mk"><div class="mkl">예상잔여</div><div class="mkv" style="${remStyle}">${rem !== null ? rem.toLocaleString() : '-'}</div></div>`;
    h += '</div>';

    // 월별 테이블
    h += '<div style="font-weight:700;margin-bottom:6px">월별 예상판매</div>';
    h += '<table class="month-table"><tr><th></th>';
    MLABELS.forEach(l => h += '<th>' + l + '</th>');
    h += '<th>합계</th></tr><tr><td style="font-weight:600">수량</td>';
    let total = 0;
    const now = new Date();
    const curYYMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const vals = [];
    MONTHS.forEach(m => {
      const v = fm[m] || 0;
      total += v;
      vals.push(v);
      const cls = m < curYYMM ? 'ma' : (m === curYYMM ? 'mm' : 'mf');
      h += `<td class="${cls}">${v.toLocaleString()}</td>`;
    });
    h += `<td style="font-weight:700">${total.toLocaleString()}</td></tr></table>`;

    // SVG 선 그래프
    h += '<div style="font-weight:700;margin:12px 0 6px">월별 판매 추이</div>';
    h += buildSVGChart(vals, curYYMM);

    // 컬러별 (스타일 상세일 때)
    if (!color_cd && colors.length > 0) {
      h += '<div style="font-weight:700;margin:12px 0 6px">컬러별 내역</div>';
      h += '<table class="color-table"><tr><th>컬러</th><th>입고</th><th>판매</th><th>판매율</th><th>재고</th><th>예상잔여</th></tr>';
      colors.forEach(c => {
        const crem = c.est_remaining;
        const cs = crem !== null && crem < 0 ? 'color:#d32f2f;font-weight:700' : '';
        h += `<tr><td style="font-weight:600">${c.color_cd}</td><td>${(c.stor_qty||0).toLocaleString()}</td><td>${(c.sale_qty||0).toLocaleString()}</td><td>${((c.sale_rt||0)*100).toFixed(1)}%</td><td>${(c.stock_qty||0).toLocaleString()}</td><td style="${cs}">${crem !== null ? crem.toLocaleString() : '-'}</td></tr>`;
      });
      h += '</table>';
    }

    // 계산기 추가 버튼
    h += `<div style="margin-top:16px;text-align:right"><button class="btn btn-primary" id="modal-add-btn">리오더 계산기에 추가</button></div>`;

    document.getElementById('modal-content').innerHTML = h;
    document.getElementById('modal-bg').classList.add('open');

    document.getElementById('modal-add-btn').onclick = () => {
      addToCalcDirect(target, color_cd);
      closeModal();
    };
  } catch (e) {
    alert('상세 조회 실패: ' + e.message);
  }
}

function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }

// ── 리오더 계산기 ──
function renderCalcTab() {
  document.getElementById('tab-calc').innerHTML = `
    <div class="calc-input-area" style="position:relative">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:#1a237e">리오더 아이템 추가</div>
      <input class="calc-search" id="calc-search" placeholder="품번 또는 제품명을 입력하여 검색" oninput="onCalcSearch()" onfocus="onCalcSearch()">
      <div class="calc-suggestions" id="calc-suggestions"></div>
    </div>
    <div class="summary-cards">
      <div class="sc orange"><div class="sl">계산 중</div><div class="sv" id="calc-pending">0</div></div>
      <div class="sc green"><div class="sl">결정 완료</div><div class="sv" id="calc-decided">${decidedRows.length}</div></div>
    </div>
    <div class="section-title">리오더 계산</div>
    <div class="action-bar" id="calc-bulk-bar" style="display:none">
      <span style="font-size:11px;color:#555"><strong id="calc-selected-count">0</strong>개 선택됨</span>
      <select id="bulk-decision" class="decision-select"><option value="">일괄 결정</option><option value="진행">리오더 진행</option><option value="보류">보류</option><option value="불필요">불필요</option></select>
      <input type="date" id="bulk-delivery" class="calc-date">
      <button class="btn btn-primary btn-sm" onclick="applyBulk()">일괄 적용</button>
      <button class="btn btn-secondary btn-sm" onclick="clearCalcSelection()">선택 해제</button>
    </div>
    <div class="tbl-wrap"><table class="dt" id="tbl-calc-pending"><thead><tr>
      <th><input type="checkbox" id="calc-check-all" onchange="toggleAllCalc(this.checked)"></th>
      <th>No</th><th>구분</th><th>카테고리</th><th>품번</th><th>제품명</th><th>컬러</th>
      <th>입고</th><th>예상잔여</th><th>부족수량</th><th>안전재고</th><th>추천수량</th><th>소진월</th><th>발주마감(8주)</th>
      <th>리오더수량</th><th>리오더후잔여</th><th>합의납기일</th><th>결정</th><th>메모</th><th>삭제</th>
    </tr></thead><tbody id="calc-pending-body"></tbody></table></div>
    <div class="section-title" style="margin-top:24px">리오더 결정사항</div>
    <div class="action-bar"><button class="btn btn-primary" onclick="exportDecidedCSV()">CSV 내보내기</button></div>
    <div class="tbl-wrap"><table class="dt" id="tbl-calc-decided"><thead><tr>
      <th>No</th><th>구분</th><th>카테고리</th><th>품번</th><th>제품명</th><th>컬러</th>
      <th>입고</th><th>예상잔여</th><th>리오더수량</th><th>합의납기일</th><th>결정</th><th>메모</th><th>재점검</th><th>이력</th><th>되돌리기</th>
    </tr></thead><tbody id="calc-decided-body"></tbody></table></div>
  `;
  renderCalcRows();

  document.addEventListener('click', e => {
    if (!e.target.closest('.calc-input-area')) {
      const sg = document.getElementById('calc-suggestions');
      if (sg) sg.style.display = 'none';
    }
  });
}

let _lastMatches = [];
async function onCalcSearch() {
  const q = document.getElementById('calc-search').value;
  const sg = document.getElementById('calc-suggestions');
  if (q.length < 2) { sg.style.display = 'none'; return; }

  try {
    const res = await fetch(API + '/api/search?q=' + encodeURIComponent(q));
    _lastMatches = await res.json();
  } catch { _lastMatches = []; }

  if (!_lastMatches.length) { sg.style.display = 'none'; return; }
  sg.innerHTML = _lastMatches.map((x, i) => {
    const cc = x.color_cd ? `<span class="sug-cc">${x.color_cd}</span>` : '';
    const mccc = x.mccc ? '<span class="sug-mccc">MCCC</span>' : '';
    const rem = x.est_remaining !== null ? x.est_remaining : '-';
    const remStyle = x.est_remaining !== null && x.est_remaining < 0 ? 'color:#d32f2f;font-weight:700' : 'color:#888';
    const shortCd = x.prdt_cd.length > 9 ? x.prdt_cd.slice(-9) : x.prdt_cd;
    return `<div class="sug-item" onclick="addToCalcByIdx(${i})"><span class="sug-cd">${shortCd}</span>${cc}${mccc}<span class="sug-nm">${x.prdt_nm || ''}</span><span class="sug-ig">${x.item_group || ''}</span><span style="${remStyle};font-size:11px;margin-left:auto">잔여:${rem}</span></div>`;
  }).join('');
  sg.style.display = 'block';
}

function addToCalcByIdx(idx) {
  if (_lastMatches[idx]) addToCalcDirect(_lastMatches[idx], _lastMatches[idx].color_cd || '');
  document.getElementById('calc-search').value = '';
  document.getElementById('calc-suggestions').style.display = 'none';
}

function addToCalcDirect(item, colorCd) {
  const key = colorCd ? item.prdt_cd + '|' + colorCd : item.prdt_cd;
  if (calcRows.find(r => r.key === key) || decidedRows.find(r => r.key === key)) return;

  const rem = item.est_remaining;
  const shortage = rem !== null && rem < 0 ? Math.abs(rem) : 0;
  const tp = item.sesn && item.sesn.endsWith('N') ? '용품' : '의류';

  const fm = item.forecast_months || {};

  // 소진월 계산
  let soMonth = null, cumul = 0;
  for (const m of MONTHS) { cumul += (fm[m] || 0); if (cumul >= (item.stor_qty || 0)) { soMonth = m; break; } }

  let deadline = '-';
  if (soMonth) {
    const soDate = new Date(parseInt(soMonth.slice(0, 4)), parseInt(soMonth.slice(4)) - 1, 1);
    const dl8 = new Date(soDate.getTime() - 8 * 7 * 24 * 3600 * 1000);
    deadline = (dl8.getMonth() + 1) + '/' + dl8.getDate();
  }

  // 안전재고 = 최근 4주(=1개월) 평균판매 × 2주 / 4주
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const prevM = curM === 1 ? 12 : curM - 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const prevKey = `${prevY}${String(prevM).padStart(2, '0')}`;
  const recentMonthSale = fm[prevKey] || 0;
  const safetyStock = Math.round(recentMonthSale * SAFETY_STOCK_WEEKS / 4);

  // 리드타임 버퍼 = 최근 월 평균 × (리드타임/4.33주)
  const leadTimeBuffer = Math.round(recentMonthSale * LEAD_TIME_WEEKS / 4.33);

  // 추천 리오더 수량 = 부족분 + 안전재고
  const recommendedQty = shortage + safetyStock;

  calcRows.push({
    id: calcId++, key, cd: item.prdt_cd, cc: colorCd, nm: item.prdt_nm || '',
    ig: item.item_group || '', tp, stor: item.stor_qty || 0, rem,
    saleRt: item.sale_rt || 0,
    shortage, safetyStock, leadTimeBuffer, recommendedQty,
    soMonth, deadline,
    reorderQty: recommendedQty, decision: '', memo: '', deliveryDate: ''
  });
  renderCalcRows();
}

function renderCalcRows() {
  const pb = document.getElementById('calc-pending-body');
  if (!pb) return;

  pb.innerHTML = calcRows.map((r, i) => {
    const remCls = r.rem !== null && r.rem < 0 ? 'rem-danger' : '';
    const soLabel = r.soMonth ? '20' + r.soMonth.slice(2, 4) + '년' + parseInt(r.soMonth.slice(4)) + '월' : '-';
    const after = (r.rem || 0) + r.reorderQty;
    const afterStyle = after >= 0 ? 'color:#2e7d32' : 'color:#d32f2f';
    const shortCd = r.cd.length > 9 ? r.cd.slice(-9) : r.cd;
    const checked = selectedCalcIds.has(r.id) ? 'checked' : '';
    return `<tr>
      <td><input type="checkbox" class="calc-check" data-id="${r.id}" ${checked} onchange="toggleCalcRow(${r.id},this.checked)"></td>
      <td>${i + 1}</td><td>${r.tp}</td><td>${r.ig}</td>
      <td class="cd clickable" data-key="${r.key}">${shortCd}</td>
      <td class="left pnm clickable" data-key="${r.key}">${r.nm}</td>
      <td>${r.cc || '-'}</td>
      <td class="right">${r.stor.toLocaleString()}</td>
      <td class="right ${remCls}">${r.rem !== null ? r.rem.toLocaleString() : '-'}</td>
      <td class="right">${(r.shortage || 0).toLocaleString()}</td>
      <td class="right">${(r.safetyStock || 0).toLocaleString()}</td>
      <td class="right" style="background:#e3f0ff;font-weight:700">${(r.recommendedQty || 0).toLocaleString()}</td>
      <td>${soLabel}</td><td>${r.deadline}</td>
      <td><input type="number" class="calc-reorder-qty" value="${r.reorderQty}" min="0" onchange="updateCalcQty(${r.id},this.value)"></td>
      <td class="right" style="${afterStyle};font-weight:700">${(after >= 0 ? '+' : '') + after.toLocaleString()}</td>
      <td><input type="date" class="calc-date" value="${r.deliveryDate || ''}" onchange="updateCalcDate(${r.id},this.value)"></td>
      <td><select class="decision-select" onchange="onDecision(${r.id},this.value)"><option value="">선택</option><option value="진행">리오더 진행</option><option value="보류">보류</option><option value="불필요">불필요</option></select></td>
      <td><input type="text" class="reorder-memo" value="${r.memo}" onchange="updateCalcMemo(${r.id},this.value)"></td>
      <td><button class="btn btn-danger btn-sm" onclick="removeCalcRow(${r.id})">×</button></td></tr>`;
  }).join('');
  updateBulkBar();

  // clickable 바인딩
  pb.querySelectorAll('.clickable[data-key]').forEach(el => {
    el.onclick = function () { showDetail(this.getAttribute('data-key')); };
  });

  document.getElementById('calc-pending').textContent = calcRows.length;

  // 결정 완료
  const db = document.getElementById('calc-decided-body');
  db.innerHTML = decidedRows.map((r, i) => {
    const reviewTag = r.needsReview ? `<span class="review-badge" title="${r.reviewReason || ''}">재점검</span>` : '';
    const rowCls = r.needsReview ? 'row-review' : '';
    const shortCd = r.cd.length > 9 ? r.cd.slice(-9) : r.cd;
    return `<tr class="${rowCls}">
      <td>${i + 1}</td><td>${r.tp || ''}</td><td>${r.ig || ''}</td>
      <td class="cd clickable" data-key="${r.key}">${shortCd}</td>
      <td class="left pnm clickable" data-key="${r.key}">${r.nm}</td>
      <td>${r.cc || '-'}</td>
      <td class="right">${(r.stor || 0).toLocaleString()}</td>
      <td class="right">${r.rem !== null ? r.rem.toLocaleString() : '-'}</td>
      <td class="right">${(r.reorderQty || 0).toLocaleString()}</td>
      <td><input type="date" class="calc-date" value="${r.deliveryDate || ''}" onchange="updateDecidedDate(${r.id},this.value)"></td>
      <td><strong>${r.decision}</strong></td><td>${r.memo || ''}</td>
      <td>${reviewTag}</td>
      <td><button class="btn btn-secondary btn-sm" data-prdt="${r.cd}" data-cc="${r.cc || ''}" onclick="showHistory(this.dataset.prdt,this.dataset.cc)">📜</button></td>
      <td><button class="btn btn-secondary btn-sm" onclick="undoDecision(${r.id})">↩</button></td></tr>`;
  }).join('');

  db.querySelectorAll('.clickable[data-key]').forEach(el => {
    el.onclick = function () { showDetail(this.getAttribute('data-key')); };
  });

  document.getElementById('calc-decided').textContent = decidedRows.length;
}

function updateCalcQty(id, val) { const r = calcRows.find(x => x.id === id); if (r) r.reorderQty = parseInt(val) || 0; renderCalcRows(); }
function updateCalcMemo(id, val) { const r = calcRows.find(x => x.id === id); if (r) r.memo = val; }
function updateCalcDate(id, val) { const r = calcRows.find(x => x.id === id); if (r) r.deliveryDate = val; }
async function updateDecidedDate(id, val) {
  const r = decidedRows.find(x => x.id === id);
  if (!r) return;
  r.deliveryDate = val;
  // 서버에 업데이트
  try {
    await fetch(API + '/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prdt_cd: r.cd, color_cd: r.cc, item_type: 'color',
        prdt_nm: r.nm, item_group: r.ig, category_type: r.tp,
        decision: r.decision, reorder_qty: r.reorderQty, memo: r.memo,
        agreed_delivery_date: val || null,
        snapshot_stor_qty: r.stor, snapshot_est_remaining: r.rem, snapshot_sale_rt: r.saleRt,
      })
    });
  } catch (e) { console.error(e); }
}
function removeCalcRow(id) { calcRows = calcRows.filter(x => x.id !== id); renderCalcRows(); }

async function onDecision(id, val) {
  if (!val) return;
  const idx = calcRows.findIndex(x => x.id === id);
  if (idx < 0) return;
  const r = calcRows[idx];
  r.decision = val;
  calcRows.splice(idx, 1);
  decidedRows.push(r);
  renderCalcRows();

  // 서버에 저장
  try {
    await fetch(API + '/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prdt_cd: r.cd, color_cd: r.cc, item_type: 'color',
        prdt_nm: r.nm, item_group: r.ig, category_type: r.tp,
        decision: val, reorder_qty: r.reorderQty, memo: r.memo,
        agreed_delivery_date: r.deliveryDate || null,
        snapshot_stor_qty: r.stor, snapshot_est_remaining: r.rem,
        snapshot_sale_rt: r.saleRt,
      })
    });
  } catch (e) { console.error('결정 저장 실패:', e); }

  if (document.getElementById('review-panel').classList.contains('open')) renderReviewPanel();
}

async function undoDecision(id) {
  const idx = decidedRows.findIndex(x => x.id === id);
  if (idx < 0) return;
  const r = decidedRows[idx];
  r.decision = '';
  decidedRows.splice(idx, 1);
  calcRows.push(r);
  renderCalcRows();

  try {
    await fetch(API + '/api/decisions/' + encodeURIComponent(r.cd) + '/' + encodeURIComponent(r.cc || ''), { method: 'DELETE' });
  } catch (e) { console.error('결정 삭제 실패:', e); }
}

// ── 리오더 점검 패널 ──
function openReviewPanel() {
  renderReviewPanel();
  document.getElementById('review-panel').classList.add('open');
  document.getElementById('review-overlay').classList.add('open');
}
function closeReviewPanel() {
  document.getElementById('review-panel').classList.remove('open');
  document.getElementById('review-overlay').classList.remove('open');
}

function renderReviewPanel() {
  const decidedKeys = new Set([...calcRows.map(r => r.key), ...decidedRows.map(r => r.key)]);
  const items = reviewData.filter(r => {
    const key = r.prdt_cd + '|' + (r.color_cd || '');
    return !decidedKeys.has(key);
  });

  document.getElementById('review-count').textContent = '(' + items.length + '개)';
  const badge = document.getElementById('review-badge');
  if (badge) badge.textContent = items.length;

  const body = document.getElementById('review-body');
  if (!items.length) { body.innerHTML = '<div style="text-align:center;padding:40px;color:#888">모든 아이템이 점검 완료되었습니다.</div>'; return; }

  const toolbar = `<div style="padding:10px 12px;border-bottom:1px solid #eef0f4;display:flex;gap:8px;align-items:center;background:#fafbfd;position:sticky;top:0;z-index:2">
    <label style="font-size:11px;cursor:pointer"><input type="checkbox" id="review-check-all" onchange="toggleAllReview(this.checked)"> 전체선택</label>
    <span style="flex:1;font-size:11px;color:#555"><strong id="review-selected-count">${selectedReviewKeys.size}</strong>개 선택</span>
    <button id="review-bulk-add" class="btn btn-primary btn-sm" style="display:${selectedReviewKeys.size > 0 ? 'inline-block' : 'none'}" onclick="addSelectedToCalc()">선택 항목 추가</button>
  </div>`;

  body.innerHTML = toolbar + items.map((x, i) => {
    const img = x.img_url ? `<img class="ri-img" src="${x.img_url}" onerror="this.style.display='none'">` : '<div class="ri-img"></div>';
    const shortCd = x.prdt_cd.length > 9 ? x.prdt_cd.slice(-9) : x.prdt_cd;
    const key = x.prdt_cd + '|' + (x.color_cd || '');
    const tp = x.sesn && x.sesn.endsWith('N') ? '용품' : '의류';
    const checked = selectedReviewKeys.has(key) ? 'checked' : '';
    return `<div class="review-item">
      <input type="checkbox" class="ri-check" data-key="${key}" ${checked} onchange="toggleReviewItem('${key}',this.checked)">
      ${img}
      <div class="ri-info">
        <span class="ri-cd" data-key="${key}">${shortCd}</span> ${x.color_cd ? '<span class="ri-cc">' + x.color_cd + '</span>' : ''}
        <div class="ri-nm">${x.prdt_nm || ''}</div>
        <div class="ri-meta">${tp} · ${x.item_group || ''} · 판매율 ${((x.sale_rt || 0) * 100).toFixed(1)}% · 입고 ${(x.stor_qty || 0).toLocaleString()}</div>
      </div>
      <div class="ri-rem">${(x.est_remaining || 0).toLocaleString()}</div>
      <button class="ri-btn" data-idx="${i}">추가</button>
    </div>`;
  }).join('');

  body.querySelectorAll('.ri-cd').forEach(el => {
    el.onclick = function () { showDetail(this.getAttribute('data-key')); };
  });
  body.querySelectorAll('.ri-btn').forEach(btn => {
    btn.onclick = function () {
      const idx = parseInt(this.getAttribute('data-idx'));
      const decidedKeys2 = new Set([...calcRows.map(r => r.key), ...decidedRows.map(r => r.key)]);
      const filtered = reviewData.filter(r => !decidedKeys2.has(r.prdt_cd + '|' + (r.color_cd || '')));
      if (filtered[idx]) { addToCalcDirect(filtered[idx], filtered[idx].color_cd || ''); renderReviewPanel(); }
    };
  });
}

function toggleAllReview(checked) {
  const decidedKeys = new Set([...calcRows.map(r => r.key), ...decidedRows.map(r => r.key)]);
  const items = reviewData.filter(r => !decidedKeys.has(r.prdt_cd + '|' + (r.color_cd || '')));
  if (checked) {
    selectedReviewKeys = new Set(items.map(r => r.prdt_cd + '|' + (r.color_cd || '')));
  } else {
    selectedReviewKeys.clear();
  }
  renderReviewPanel();
}

// ── 일괄 편집 ──
function toggleCalcRow(id, checked) {
  if (checked) selectedCalcIds.add(id);
  else selectedCalcIds.delete(id);
  updateBulkBar();
}
function toggleAllCalc(checked) {
  selectedCalcIds = new Set(checked ? calcRows.map(r => r.id) : []);
  renderCalcRows();
}
function clearCalcSelection() {
  selectedCalcIds.clear();
  renderCalcRows();
}
function updateBulkBar() {
  const n = selectedCalcIds.size;
  const bar = document.getElementById('calc-bulk-bar');
  if (!bar) return;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const cnt = document.getElementById('calc-selected-count');
  if (cnt) cnt.textContent = n;
}
async function applyBulk() {
  const decision = document.getElementById('bulk-decision').value;
  const delivery = document.getElementById('bulk-delivery').value;
  if (!decision && !delivery) { alert('일괄 결정 또는 납기일을 선택해주세요.'); return; }

  const targetIds = [...selectedCalcIds];
  for (const id of targetIds) {
    const r = calcRows.find(x => x.id === id);
    if (!r) continue;
    if (delivery) r.deliveryDate = delivery;
    if (decision) {
      r.decision = decision;
    }
  }

  // 결정이 있으면 모두 결정사항으로 이동
  if (decision) {
    const moving = calcRows.filter(r => selectedCalcIds.has(r.id));
    calcRows = calcRows.filter(r => !selectedCalcIds.has(r.id));
    decidedRows.push(...moving);
    for (const r of moving) {
      await saveDecisionToServer(r);
    }
  }

  selectedCalcIds.clear();
  document.getElementById('bulk-decision').value = '';
  document.getElementById('bulk-delivery').value = '';
  renderCalcRows();
}

async function saveDecisionToServer(r) {
  try {
    await fetch(API + '/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prdt_cd: r.cd, color_cd: r.cc, item_type: 'color',
        prdt_nm: r.nm, item_group: r.ig, category_type: r.tp,
        decision: r.decision, reorder_qty: r.reorderQty, memo: r.memo,
        agreed_delivery_date: r.deliveryDate || null,
        decided_by: currentUser,
        snapshot_stor_qty: r.stor, snapshot_est_remaining: r.rem, snapshot_sale_rt: r.saleRt,
      })
    });
  } catch (e) { console.error(e); }
}

// ── 변경 이력 모달 ──
async function showHistory(prdt_cd, color_cd) {
  try {
    const res = await fetch(API + '/api/history/' + prdt_cd + '/' + (color_cd || ''));
    const history = await res.json();

    let h = '<button class="modal-close" onclick="closeModal()">&times;</button>';
    h += `<h2>변경 이력</h2>`;
    h += `<div class="modal-sub">${prdt_cd.slice(-9)}${color_cd ? ' / ' + color_cd : ''}</div>`;

    if (!history.length) {
      h += '<div style="padding:40px;text-align:center;color:#888">이력이 없습니다.</div>';
    } else {
      h += '<table class="month-table"><thead><tr><th>시간</th><th>작업</th><th>결정</th><th>리오더수량</th><th>납기일</th><th>메모</th><th>변경자</th></tr></thead><tbody>';
      for (const entry of history) {
        const date = new Date(entry.changed_at).toLocaleString('ko-KR');
        const actionLabel = entry.action === 'create' ? '생성' : (entry.action === 'update' ? '수정' : '삭제');
        const decChange = entry.prev_decision !== entry.new_decision ? `${entry.prev_decision || '-'} → <strong>${entry.new_decision || '-'}</strong>` : entry.new_decision || '-';
        const qtyChange = entry.prev_reorder_qty !== entry.new_reorder_qty ? `${entry.prev_reorder_qty ?? '-'} → <strong>${entry.new_reorder_qty ?? '-'}</strong>` : (entry.new_reorder_qty ?? '-');
        const dateChange = entry.prev_delivery_date !== entry.new_delivery_date ? `${entry.prev_delivery_date || '-'} → <strong>${entry.new_delivery_date || '-'}</strong>` : (entry.new_delivery_date || '-');
        h += `<tr><td style="font-size:10px">${date}</td><td>${actionLabel}</td><td>${decChange}</td><td>${qtyChange}</td><td>${dateChange}</td><td>${entry.new_memo || '-'}</td><td>${entry.changed_by || '-'}</td></tr>`;
      }
      h += '</tbody></table>';
    }

    document.getElementById('modal-content').innerHTML = h;
    document.getElementById('modal-bg').classList.add('open');
  } catch (e) {
    alert('이력 조회 실패: ' + e.message);
  }
}

// ── 리오더 점검 패널 다중 선택 ──
function toggleReviewItem(key, checked) {
  if (checked) selectedReviewKeys.add(key);
  else selectedReviewKeys.delete(key);
  const countEl = document.getElementById('review-selected-count');
  if (countEl) countEl.textContent = selectedReviewKeys.size;
  const btn = document.getElementById('review-bulk-add');
  if (btn) btn.style.display = selectedReviewKeys.size > 0 ? 'inline-block' : 'none';
}
function addSelectedToCalc() {
  const keys = [...selectedReviewKeys];
  for (const key of keys) {
    const item = reviewData.find(r => (r.prdt_cd + '|' + (r.color_cd || '')) === key);
    if (item) addToCalcDirect(item, item.color_cd || '');
  }
  selectedReviewKeys.clear();
  renderReviewPanel();
}

// ── CSV 내보내기 ──
function exportDecidedCSV() {
  let csv = '\uFEFFNo,구분,카테고리,품번,제품명,컬러,입고,예상잔여,리오더수량,합의납기일,결정,메모\n';
  decidedRows.forEach((r, i) => {
    const v = [i + 1, r.tp, r.ig, r.cd.slice(-9), r.nm, r.cc || '-', r.stor, r.rem || 0, r.reorderQty, r.deliveryDate || '', r.decision, r.memo];
    csv += v.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ST_reorder_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}

// ── 시작 ──
init();
