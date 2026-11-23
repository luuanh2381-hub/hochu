// js/skills-analysis.js — V110: các khối phân tích bổ sung cho tab "Phân tích năng lực" (js/skills-ui.js):
//   • Khuyến nghị tổng thể (quy tắc rõ ràng, có giải thích)      ← /api/skills/recommendations
//   • Trí nhớ theo khoảng nghỉ (ngay sau học / ~1 ngày / ~1 tuần / ~1 tháng) ← /api/skills/retention
//   • Kết quả theo dạng bài
//   • Chi tiết TỪNG TỪ (kỹ năng, FSRS, lịch sử, dạng hay sai, khuyến nghị riêng) ← /api/skills/word
// Nguyên tắc hiển thị: KHÔNG có điểm tổng hợp duy nhất; thiếu dữ liệu → nói "chưa đủ dữ liệu" và nêu mẫu số, không vẽ biểu đồ gây hiểu nhầm.
// Mọi dữ liệu do server tính; file này chỉ hiển thị. Mọi chuỗi từ server/dữ liệu đều qua escapeHtml.

const SA_MIN_N = 10; // khớp MIN_RETENTION_N ở lib/skills.js (chỉ dùng để giải thích cho người học)
let saState = { recs: null, retention: null, learner: null, insights: null, loadedAt: 0, error: null, word: null, wordLoading: false, wordError: null };

function saLaunchTodayForSkill(skill) {
  if (typeof tdStartAdaptiveMode === 'function') { tdStartAdaptiveMode(skill); return; }
  if (typeof ssEnterMode === 'function') ssEnterMode('review');
}

const SA_LEVEL = {
  insufficient: { text: 'Chưa đủ dữ liệu', cls: 'sa-lv-none' },
  weak: { text: 'Yếu', cls: 'sa-lv-weak' },
  developing: { text: 'Đang phát triển', cls: 'sa-lv-dev' },
  good: { text: 'Tốt', cls: 'sa-lv-good' },
};
const SA_STATE_TEXT = { 0: 'Từ mới (chưa học)', 1: 'Đang học', 2: 'Đã học (ôn định kỳ)', 3: 'Học lại (đã quên)' };
const SA_SOURCE_TEXT = {
  fsrs: 'Ôn theo lịch FSRS', check: 'Kiểm tra ngay sau khi xem từ', redo: 'Luyện lại câu sai', extra: 'Luyện từ hay sai',
  match: 'Ghép cặp', practice: 'Luyện bổ sung', mode: 'Luyện theo kỹ năng', delayed: 'Kiểm tra sau khoảng nghỉ',
};
// Nhãn dạng bài: lấy từ QE (không trùng lặp danh mục) + các nhãn của tab cũ.
function saTypeLabel(exerciseType) {
  for (const id of Object.keys(QE.TYPES)) {
    const T = QE.TYPES[id];
    if (T.exerciseFsrs === exerciseType || T.exercisePractice === exerciseType) return T.label;
  }
  const extra = {
    'quiz-hz2vi': 'Trắc nghiệm: Chữ Hán → Nghĩa', 'quiz-vi2hz': 'Trắc nghiệm: Nghĩa → Chữ Hán', 'quiz-py2hz': 'Trắc nghiệm: Pinyin → Chữ Hán',
    'type-vi2hz': 'Gõ chữ Hán', 'listen-choose-hz': 'Nghe → chọn chữ Hán', 'practice-match-vi': 'Ghép chữ Hán ↔ nghĩa', 'practice-match-py': 'Ghép chữ Hán ↔ pinyin', 'practice-match-hv': 'Ghép chữ Hán ↔ Hán Việt', 'practice-match-listen': 'Ghép nghe ↔ chữ Hán',
    'review-listen': 'Nghe → Chữ Hán', 'practice-listening': 'Nghe → Chữ Hán',
  };
  return extra[exerciseType] || exerciseType;
}
const saPct = (x) => Math.round(x * 100) + '%';

function saStyle() {
  return `<style>
    .sa-rec{border:1px solid var(--border);border-left:4px solid var(--active,#b83227);border-radius:10px;padding:10px 12px;margin:8px 0;background:var(--paper)}
    .sa-rec-t{font-weight:800;font-size:.92rem}.sa-rec-w{font-size:.8rem;color:var(--muted);line-height:1.5;margin-top:3px}
    .sa-note{font-size:.75rem;color:var(--muted);line-height:1.5;margin-top:8px}
    .sa-bar-wrap{flex:1;background:var(--border);border-radius:999px;height:10px;overflow:hidden}.sa-bar-in{height:100%;background:var(--l8a,#2d6e62);border-radius:999px}
    .sa-brow{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:.78rem}.sa-blbl{width:118px;font-weight:700;line-height:1.25}
    .sa-lv{display:inline-block;font-size:.7rem;font-weight:800;border-radius:8px;padding:2px 8px}
    .sa-lv-none{background:var(--paper);border:1px solid var(--border);color:var(--muted)}.sa-lv-weak{background:var(--l1b,#fadbd8);color:var(--l1a,#c0392b)}
    .sa-lv-dev{background:var(--l2b,#fdebd0);color:var(--l2a,#b9770e)}.sa-lv-good{background:var(--l4b,#d5f5e3);color:var(--l4a,#1e8449)}
    .sa-hist{display:flex;gap:8px;align-items:baseline;font-size:.76rem;padding:4px 0;border-bottom:1px solid var(--border)}
    .sa-hist:last-child{border-bottom:0}
    .sa-table{width:100%;border-collapse:collapse;font-size:.8rem}.sa-table td,.sa-table th{padding:6px 6px;border-bottom:1px solid var(--border);text-align:left}
    .sa-radar-wrap{display:flex;justify-content:center;margin:6px 0 10px}
    .sa-radar{width:100%;max-width:290px;height:auto;overflow:visible}
    .sa-tone-box{margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--paper);border:1px solid var(--border);font-size:.8rem;line-height:1.45}
  </style>`;
}

// Biểu đồ Radar SVG thuần 5 kỹ năng — chỉ vẽ khi có ≥ 2 kỹ năng đủ mẫu (tránh vẽ hình rỗng gây hiểu nhầm).
function saRenderRadarSvg(skillsObj) {
  const keys = ['recognition', 'recall', 'listening', 'pinyin', 'context'];
  const vals = keys.map(k => {
    const x = skillsObj && skillsObj[k];
    return (x && x.enough && x.correctedRate != null) ? Math.max(0.06, Math.min(1, Number(x.correctedRate))) : null;
  });
  if (vals.filter(v => v != null).length < 2) return '';
  const cx = 140, cy = 115, R = 74;
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
  };
  const rings = [0.33, 0.66, 1].map(f => {
    const pts = keys.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="var(--border-strong,var(--border))" stroke-width="1" stroke-dasharray="${f < 1 ? '3 3' : ''}"/>`;
  }).join('');
  const axes = keys.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
  }).join('');
  const polyPts = vals.map((v, i) => pt(i, R * (v == null ? 0.08 : v)).map(n => n.toFixed(1)).join(',')).join(' ');
  const dots = vals.map((v, i) => {
    if (v == null) return '';
    const [x, y] = pt(i, R * v);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--active)" stroke="var(--card)" stroke-width="1.5"/>`;
  }).join('');
  const labels = keys.map((k, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - cx) < 10 ? 'middle' : (x > cx ? 'start' : 'end');
    const pctTxt = vals[i] != null ? ` ${Math.round(vals[i] * 100)}%` : '';
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" fill="var(--ink)" font-size="10.5" font-weight="700">${escapeHtml(SK_LABEL[k] || k)}${pctTxt}</text>`;
  }).join('');
  return `<div class="sa-radar-wrap"><svg class="sa-radar" viewBox="0 0 280 232" role="img" aria-label="Biểu đồ 5 kỹ năng">${rings}${axes}<polygon points="${polyPts}" fill="var(--active)" fill-opacity=".18" stroke="var(--active)" stroke-width="2.2" stroke-linejoin="round"/>${dots}${labels}</svg></div>`;
}

// Trích chuỗi thanh điệu (1-4) từ pinyin để chẩn đoán cặp thanh hay nhầm cho từng từ.
function saExtractTones(py) {
  const map = { 'ā':1,'á':2,'ǎ':3,'à':4,'ē':1,'é':2,'ě':3,'è':4,'ī':1,'í':2,'ǐ':3,'ì':4,'ō':1,'ó':2,'ǒ':3,'ò':4,'ū':1,'ú':2,'ǔ':3,'ù':4,'ǖ':1,'ǘ':2,'ǚ':3,'ǜ':4 };
  const out = [];
  for (const ch of String(py || '').toLowerCase()) if (map[ch]) out.push(map[ch]);
  return out;
}
function saRenderToneDiagnosis(word, history) {
  if (!word || !word.py || !Array.isArray(history) || !history.length) return '';
  const target = saExtractTones(word.py);
  if (!target.length) return '';
  const pairs = {};
  for (const h of history) {
    if (h.ok || !h.wrong_answer) continue;
    const got = saExtractTones(h.wrong_answer);
    if (got.length !== target.length) continue;
    for (let i = 0; i < target.length; i++) {
      if (got[i] !== target[i]) {
        const key = `Thanh ${target[i]} → nhầm Thanh ${got[i]}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  }
  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length) return '';
  return `<div class="sa-tone-box">🎵 <b>Chẩn đoán thanh điệu:</b> ${top.map(([k, n]) => `${escapeHtml(k)} (${n} lần)`).join(' · ')}</div>`;
}

// ── Tải dữ liệu phụ (song song, KHÔNG chặn phần chính; lỗi chỉ làm mất các khối này) ─────────────────
async function saLoadExtras() {
  try {
    const [recs, retention, learner, insights] = await Promise.all([
      skFetchJson('/api/skills/recommendations?days=90'),
      skFetchJson('/api/skills/retention?days=90'),
      skFetchJson('/api/skills/learner').catch(() => null), // V128: phần phụ — máy chủ cũ/lỗi chỉ làm mất khối "Kế hoạch ưu tiên", không làm mất các khối khác
      skFetchJson('/api/skills/insights?days=90').catch(() => null), // Phân tích chuyên sâu (ma trận thanh điệu, khung giờ vàng, tổng kết tuần, 3 tầng ổn định)
    ]);
    saState.recs = recs; saState.retention = retention; saState.learner = (learner && learner.learner) || null; saState.insights = (insights && insights.ok) ? insights : null; saState.error = null; saState.loadedAt = Date.now();
  } catch (e) { saState.error = e.message; }
  if (currentTab === 'skills' && !skState.practice && !saState.word) render();
}

// ── V128: KẾ HOẠCH ƯU TIÊN THEO NĂNG LỰC — cùng công thức (js/training-plan.js) và cùng số liệu (/api/skills/learner = đúng nguồn,
// đúng cửa sổ 90/14 ngày mà "Hôm nay học" nhận) nên hai màn luôn nói cùng một điều. Chỉ hiển thị. ──────────────────────────────────────
function saRenderPlan() {
  if (typeof TP === 'undefined' || !saState.learner) return '';
  try {
    const plan = TP.build(saState.learner, { typedEnabled: typeof rvTypedEnabled === 'function' ? rvTypedEnabled() : true });
    const d = TP.describe(plan);
    if (!d.headline) return '';
    const rows = d.rows.map(r => `<div class="sa-brow"><span class="sa-blbl">${escapeHtml(r.label)}</span><span style="flex:1">${escapeHtml(r.text)}</span></div>`).join('');
    const top = plan.priorities && plan.priorities[0];
    const jumpBtn = top ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-sm btn-primary" ${top.skill === 'listening' && !skAudioOk() ? 'disabled' : `onclick="saLaunchTodayForSkill('${escapeJsAttr(top.skill)}')"`}>🎯 Vào Hôm nay học (${escapeHtml(top.label)})</button>
      <button class="btn btn-sm" ${top.skill === 'listening' && !skAudioOk() ? 'disabled' : `onclick="skStartPractice('${escapeJsAttr(top.skill)}')"`}>Luyện bổ sung ngay</button>
    </div>` : '';
    return `<div class="panel"><div class="panel-title">🎯 Kế hoạch ưu tiên hôm nay</div>
      <div style="font-weight:800;margin-bottom:4px">${escapeHtml(d.headline)}</div>
      ${d.lines.map(l => `<div class="sa-note" style="margin:2px 0">${escapeHtml(l)}</div>`).join('')}
      <div style="margin-top:8px">${rows}</div>
      ${jumpBtn}
      <div class="sa-note">${escapeHtml(d.note)} Đây cũng chính là số liệu mà màn "Hôm nay học" và "Trắc nghiệm thích ứng" đang dùng.</div></div>`;
  } catch { return ''; }
}

// ── Phân tích chuyên sâu: Tổng kết tuần · Ma trận thanh điệu 4×4 · 4 Nguyên nhân sai · Bộ thủ hay quên · Khung giờ vàng · 3 tầng độ vững ──
function saRenderWeakRadicals() {
  const weak = (typeof skState !== 'undefined' && Array.isArray(skState.weak)) ? skState.weak : [];
  const partsDb = (typeof dbHanziParts !== 'undefined' && dbHanziParts) ? dbHanziParts : {};
  if (!weak.length || !Object.keys(partsDb).length) return '';
  const byRad = new Map();
  const seenWord = new Set();
  for (const w of weak) {
    if (!w || !w.hz || seenWord.has(w.hz)) continue;
    seenWord.add(w.hz);
    for (const ch of [...String(w.hz)]) {
      const info = partsDb[ch];
      const comps = Array.isArray(info) ? info : (info && Array.isArray(info.parts) ? info.parts : []);
      for (const c of comps) {
        const rad = typeof c === 'string' ? c : (c && (c.part || c.char || c.rad || c.hz));
        const mean = c && typeof c === 'object' ? (c.meaning || c.vi || c.mean || '') : '';
        if (!rad || rad === ch) continue;
        const slot = byRad.get(rad) || { rad, mean, words: [] };
        if (!slot.words.includes(w.hz)) slot.words.push(w.hz);
        byRad.set(rad, slot);
      }
    }
  }
  const top = [...byRad.values()].filter(x => x.words.length >= 2).sort((a, b) => b.words.length - a.words.length).slice(0, 5);
  if (!top.length) return '';
  return `<div class="panel"><div class="panel-title">🧱 Bộ thủ &amp; thành phần xuất hiện nhiều trong từ yếu</div>
    ${top.map(x => `<div class="sa-brow" style="align-items:flex-start"><span class="gf-rad-chip">${escapeHtml(x.rad)}</span>
      <div style="flex:1"><div><b>${x.words.length} từ yếu</b>${x.mean ? ` · <span style="color:var(--muted)">${escapeHtml(x.mean)}</span>` : ''}</div>
      <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${x.words.slice(0, 6).map(h => `<button type="button" class="btn btn-sm" style="padding:3px 9px;min-height:28px" onclick="saOpenWord('${escapeJsAttr(h)}')">${escapeHtml(h)}</button>`).join('')}</div></div></div>`).join('')}
    <div class="sa-note">Tổng hợp tự động từ chiết tự bộ thủ của các từ yếu hiện tại — chạm từng chữ để xem chi tiết và so sánh.</div></div>`;
}

function saRenderInsights() {
  const ins = saState.insights;
  const radHtml = saRenderWeakRadicals();
  if (!ins) return radHtml;
  const blocks = [];

  // 1) Tổng kết tuần & Từ cứng đầu đã chinh phục
  if (ins.weekly) {
    const w1 = ins.weekly.thisWeek || {}, w0 = ins.weekly.prevWeek || {};
    const diffRev = (w1.reviews || 0) - (w0.reviews || 0);
    const diffTxt = w0.reviews ? ` (${diffRev >= 0 ? '+' : ''}${diffRev} so với tuần trước)` : '';
    const conq = (ins.weekly.conquered || []).map(x => `<button type="button" class="btn btn-sm" style="padding:4px 10px;min-height:30px" onclick="saOpenWord('${escapeJsAttr(x.hz)}')"><b>${escapeHtml(x.hz)}</b> <span style="color:var(--muted)">${escapeHtml(x.vi || '')}</span></button>`).join('');
    blocks.push(`<div class="panel"><div class="panel-title">🏆 Tổng kết tuần &amp; Từ đã chinh phục</div>
      <div class="gf-insight-grid">
        <div class="dash-kpi"><div class="dash-kpi-num">${w1.reviews || 0}</div><div class="dash-kpi-lbl">Lượt ôn 7 ngày${escapeHtml(diffTxt)}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-num">${w1.accuracy != null ? w1.accuracy + '%' : '—'}</div><div class="dash-kpi-lbl">Tỉ lệ đúng tuần này${w0.accuracy != null ? ` (tuần trước ${w0.accuracy}%)` : ''}</div></div>
      </div>
      ${conq ? `<div style="font-size:.8rem;font-weight:800;margin:10px 0 6px">🌟 Từ từng hay quên đã nhớ lại trong tuần này:</div><div style="display:flex;gap:6px;flex-wrap:wrap">${conq}</div>` : `<div class="sa-note">Khi bạn nhớ lại được các từ từng quên nhiều lần, chúng sẽ xuất hiện ở đây để ghi nhận tiến bộ.</div>`}
    </div>`);
  }

  // 2) Ma trận nhầm lẫn Thanh điệu 4×4
  if (ins.toneMatrix && ins.toneMatrix.totalToneErrors > 0) {
    const tm = ins.toneMatrix, m = tm.matrix || {};
    const maxV = Math.max(1, ...Object.values(m));
    const header = `<tr><th>Đúng \\ Chọn</th><th>T1 (ā)</th><th>T2 (á)</th><th>T3 (ǎ)</th><th>T4 (à)</th></tr>`;
    const body = [1, 2, 3, 4].map(r => `<tr><th>T${r}</th>${[1, 2, 3, 4].map(c => {
      if (r === c) return `<td class="gf-tm-diag">—</td>`;
      const v = m[`${r}->${c}`] || 0;
      const lvl = v === 0 ? 0 : (v >= maxV * 0.65 ? 3 : (v >= maxV * 0.3 ? 2 : 1));
      return `<td class="gf-tm-c gf-tm-${lvl}">${v || ''}</td>`;
    }).join('')}</tr>`).join('');
    const tp = tm.topPair;
    blocks.push(`<div class="panel"><div class="panel-title">🎵 Ma trận nhầm lẫn Thanh điệu 4×4</div>
      ${tp ? `<div class="sa-rec" style="margin-top:0"><div class="sa-rec-t">Nhầm nhiều nhất: Thanh ${tp.expected} → nhầm sang Thanh ${tp.got} (${tp.count} lần · ${tp.sharePct}% lỗi thanh điệu)</div>
        <div style="margin-top:6px"><button class="btn btn-sm btn-primary" ${!skAudioOk() ? 'disabled' : `onclick="skStartPractice('tone')"`}>🎵 Luyện nghe thanh điệu</button>
        <button class="btn btn-sm" style="margin-left:6px" onclick="skStartPractice('tonevis')">👁 Luyện thanh bằng mắt</button></div></div>` : ''}
      <table class="sa-table gf-tone-grid">${header}${body}</table>
      <div class="sa-note">Hàng = thanh điệu đúng · Cột = thanh điệu bạn chọn/gõ sai (${ins.windowDays} ngày gần nhất, tổng ${tm.totalToneErrors} lỗi thanh).</div></div>`);
  }

  // 3) 4 Nguyên nhân gốc gây sai
  if (ins.rootCauses && ins.rootCauses.total >= 5) {
    const rc = ins.rootCauses;
    const rows = [
      ['tone', '🎵 Nhầm thanh điệu / Pinyin', rc.tone, 'tonevis', 'Luyện thanh điệu'],
      ['visual', '✍️ Nhầm mặt chữ Hán', rc.visual, 'confusable', 'Phân biệt chữ dễ nhầm'],
      ['semantic', '📖 Nhầm nghĩa gần', rc.semantic, 'duel', 'Luyện A hay B?'],
      ['lapse', '⏳ Quên sau khoảng nghỉ', rc.lapse, 'delayed', 'Kiểm tra sau khoảng nghỉ'],
    ].sort((a, b) => b[2] - a[2]);
    const topCause = rows[0];
    blocks.push(`<div class="panel"><div class="panel-title">🧩 Phân loại nguyên nhân trả lời sai</div>
      ${rows.map(([, lb, n]) => {
        const p = Math.round((n / rc.total) * 100);
        return `<div class="sa-brow"><span class="sa-blbl">${lb}</span><div class="sa-bar-wrap"><div class="sa-bar-in" style="width:${Math.max(p, 2)}%"></div></div><span style="width:76px;text-align:right;font-weight:700">${p}% (${n})</span></div>`;
      }).join('')}
      ${topCause && topCause[2] > 0 ? `<div style="margin-top:8px"><button class="btn btn-sm" onclick="skStartPractice('${topCause[3]}')">🎯 Khắc phục nhóm lớn nhất: ${topCause[4]}</button></div>` : ''}
      <div class="sa-note">Phân loại tự động từ ${rc.total} lượt sai trong ${ins.windowDays} ngày gần nhất.</div></div>`);
  }

  // 4) Bộ thủ hay quên (từ chiết tự)
  if (radHtml) blocks.push(radHtml);

  // 5) Khung giờ vàng học tập
  if (Array.isArray(ins.timeOfDay)) {
    const valid = ins.timeOfDay.filter(x => x.accuracy != null);
    if (valid.length >= 2) {
      const best = valid.slice().sort((a, b) => b.accuracy - a.accuracy)[0];
      blocks.push(`<div class="panel"><div class="panel-title">⏰ Khung giờ vàng học tập</div>
        <div class="sa-rec" style="margin-top:0"><div class="sa-rec-t">Bạn tập trung tốt nhất vào buổi ${escapeHtml(best.label)}: ${best.accuracy}% đúng (${best.n} lượt${best.avgMs ? ` · ~${(best.avgMs / 1000).toFixed(1)}s/câu` : ''})</div></div>
        ${ins.timeOfDay.map(x => `<div class="sa-brow"><span class="sa-blbl">${escapeHtml(x.label)}</span>${x.accuracy != null
          ? `<div class="sa-bar-wrap"><div class="sa-bar-in" style="width:${Math.max(x.accuracy, 2)}%"></div></div><span style="width:82px;text-align:right">${x.accuracy}% (${x.n})</span>`
          : `<span class="sk-nodata">${x.n} lượt (cần ≥10)</span>`}</div>`).join('')}
      </div>`);
    }
  }

  // 6) 3 tầng độ vững & Dự báo hoàn thành phạm vi đang chọn
  if (ins.mastery && ins.mastery.seen > 0) {
    const m = ins.mastery;
    const scopeTotal = (typeof WORDS !== 'undefined' && Array.isArray(WORDS) && typeof isLessonInSelection === 'function')
      ? WORDS.filter(w => isLessonInSelection(w.l)).length : 0;
    const remain = scopeTotal > m.seen ? (scopeTotal - m.seen) : 0;
    const estDays = (remain > 0 && m.newPerDay14d >= 0.5) ? Math.ceil(remain / m.newPerDay14d) : null;
    blocks.push(`<div class="panel"><div class="panel-title">📚 3 tầng độ vững FSRS &amp; Dự báo nhịp học</div>
      <div class="td-summary" style="margin-top:4px">
        <div class="td-sum-cell"><div class="td-sum-num">${m.seen}</div><div class="td-sum-lbl">Đã gặp</div></div>
        <div class="td-sum-cell"><div class="td-sum-num">${m.steady}</div><div class="td-sum-lbl">Đang vững (≥7 ngày)</div></div>
        <div class="td-sum-cell"><div class="td-sum-num">${m.mature}</div><div class="td-sum-lbl">Bền vững (≥21 ngày)</div></div>
      </div>
      <div class="sa-note">Nhịp 14 ngày gần đây: trung bình <b>${m.newPerDay14d} từ mới/ngày</b>.${estDays ? ` Với nhịp này, dự kiến phủ xong ${remain} từ còn lại trong phạm vi hiện chọn sau khoảng <b>${estDays} ngày</b>.` : ''}</div></div>`);
  }

  return blocks.join('');
}

// ── Khuyến nghị tổng thể ────────────────────────────────────────────────────────────────────────
function saActionButton(a) {
  if (!a) return '';
  if (a.kind === 'delayed') return `<button class="btn btn-sm" style="margin-top:6px" onclick="skStartPractice('delayed')">⏳ Kiểm tra sau khoảng nghỉ</button>`;
  if (a.kind === 'practice' && a.skill) {
    const disabled = a.skill === 'listening' && !skAudioOk();
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
      <button class="btn btn-sm btn-primary" ${disabled ? 'disabled' : `onclick="saLaunchTodayForSkill('${escapeJsAttr(a.skill)}')"`}>🎯 Vào Hôm nay học</button>
      <button class="btn btn-sm" ${disabled ? 'disabled' : `onclick="skStartPractice('${escapeJsAttr(a.skill)}')"`}>Luyện bổ sung · ${escapeHtml(a.hint || SK_LABEL[a.skill] || '')}</button>
    </div>`;
  }
  return '';
}
function saRenderRecs() {
  const r = saState.recs;
  let inner;
  if (!r) inner = saState.error ? `<div class="sa-note">⚠️ Không tải được khuyến nghị: ${escapeHtml(saState.error)} <button class="btn btn-sm" onclick="saLoadExtras()">Thử lại</button></div>` : `<div class="sa-note">⏳ Đang phân tích...</div>`;
  else if (r.status === 'insufficient') inner = `<div class="sa-note">${(r.notes || []).map(escapeHtml).join('<br>')}</div>`;
  else {
    const items = (r.items || []).map(it => `<div class="sa-rec"><div class="sa-rec-t">${escapeHtml(it.title)}</div><div class="sa-rec-w">${escapeHtml(it.why)}</div>${it.stopWhen ? `<div class="sa-note" style="margin:4px 0 0">⏹ ${escapeHtml(it.stopWhen)}</div>` : ''}${saActionButton(it.action)}</div>`).join('');
    const notes = (r.notes || []).map(n => `<div class="sa-note">ℹ️ ${escapeHtml(n)}</div>`).join('');
    inner = (items || `<div class="sa-note">Chưa có việc nào cần luyện thêm theo dữ liệu hiện có.</div>`) + notes;
  }
  return saStyle() + `<div class="panel"><div class="panel-title">💡 Gợi ý cho bạn</div>${inner}
    <div class="sa-note">Gợi ý tính từ quy tắc cố định trên dữ liệu của bạn (không dùng AI ngoài) và chỉ là luyện bổ sung — không thay đổi lịch ôn FSRS.</div></div>`;
}

// ── V115: MỨC TỪNG KỸ NĂNG Ở MỨC NGƯỜI HỌC (gộp mọi từ, đã trừ xác suất đoán mò) ← /api/skills/retention → pooled ──────────────
// Điểm theo (từ × kỹ năng) cần ≥3 lượt mỗi ô nên lâu mới có dữ liệu; gộp theo kỹ năng thì mẫu đủ sau vài buổi. Hai hiệu chỉnh: trừ đoán mò
// (trắc nghiệm 4 đáp án đúng 25% nhờ đoán) và KHÔNG phán \"yếu\" theo ngưỡng tuyệt đối (nhớ chủ động vốn khó hơn nhận diện).
function saRenderPooled() {
  const r = saState.retention; if (!r || !r.pooled) return '';
  const P = r.pooled, min = (P.thresholds && P.thresholds.minN) || SA_MIN_N;
  const rows = SK_MEASURED.map(k => {
    const x = P.skills && P.skills[k];
    if (!x) return `<div class="sa-brow"><span class="sa-blbl">${escapeHtml(SK_LABEL[k])}</span><span class="sk-nodata">Chưa có lượt nào</span></div>`;
    if (!x.enough) return `<div class="sa-brow"><span class="sa-blbl">${escapeHtml(SK_LABEL[k])}</span><span class="sk-nodata">Chưa đủ dữ liệu (${x.n}/${min} lượt)</span></div>`;
    const w = Math.max(2, Math.round(x.correctedRate * 100));
    return `<div class="sa-brow" style="align-items:flex-start"><span class="sa-blbl">${escapeHtml(SK_LABEL[k])}</span><div style="flex:1">
      <div style="display:flex;align-items:center;gap:8px"><div class="sa-bar-wrap"><div class="sa-bar-in" style="width:${w}%"></div></div><span style="width:44px;text-align:right;font-weight:800">${saPct(x.correctedRate)}</span></div>
      <div class="sa-note" style="margin:2px 0 0">Đúng thô ${saPct(x.rawRate)} (${x.correct}/${x.n} lượt; khoảng tin cậy ${saPct(x.ci.lo)}–${saPct(x.ci.hi)})${x.choiceN ? ` · ${x.choiceN} lượt trắc nghiệm` : ''}${x.typedN ? ` · ${x.typedN} lượt tự gõ` : ''}</div></div></div>`;
  }).join('');
  const radar = saRenderRadarSvg(P.skills);
  return `<div class="panel"><div class="panel-title">🧭 Mức từng kỹ năng của bạn</div>${radar}${rows}
    <div class="sa-note">Gộp mọi từ, ${r.windowDays} ngày gần nhất. Thanh = tỉ lệ <b>đã trừ xác suất đoán mò</b> (trắc nghiệm 4 đáp án đúng 25% chỉ nhờ đoán; tự gõ và sắp xếp câu không trừ). Chỉ hiện khi có ≥ ${min} lượt. Các kỹ năng khó khác nhau nên <b>đừng so con số tuyệt đối giữa các kỹ năng</b> — hãy xem xu hướng theo thời gian và khoảng chênh được nêu trong “Gợi ý cho bạn”.</div></div>`;
}

// ── Trí nhớ theo khoảng nghỉ ────────────────────────────────────────────────────────────────────
function saRenderRetention() {
  const r = saState.retention; if (!r) return '';
  const order = ['immediate', 'short', 'd1', 'd3', 'd7'];
  const rows = order.map(id => {
    const b = r.buckets[id]; if (!b) return '';
    const a = b.all;
    const bar = a.rate == null
      ? `<span class="sk-nodata">Chưa đủ dữ liệu (${a.n}/${SA_MIN_N} lượt)</span>`
      : `<div class="sa-bar-wrap"><div class="sa-bar-in" style="width:${Math.max(2, Math.round(a.rate * 100))}%"></div></div><span style="width:92px;text-align:right">${saPct(a.rate)} (${a.correct}/${a.n})</span>`;
    const split = (a.n > 0 && (b.fsrs.n || b.practice.n))
      ? `<div class="sa-note" style="margin:-4px 0 6px 126px">Ôn FSRS: ${b.fsrs.n} lượt${b.fsrs.rate != null ? ' · ' + saPct(b.fsrs.rate) : ''} · Luyện bổ sung: ${b.practice.n} lượt${b.practice.rate != null ? ' · ' + saPct(b.practice.rate) : ''}</div>` : '';
    return `<div class="sa-brow"><span class="sa-blbl">${escapeHtml(b.label)}</span>${bar}</div>${split}`;
  }).join('');
  const total = order.reduce((n, id) => n + (r.buckets[id] ? r.buckets[id].all.n : 0), 0);
  return `<div class="panel"><div class="panel-title">⏳ Nhớ sau khoảng nghỉ</div>
    ${total ? rows : `<div class="sa-note">Chưa có dữ liệu. Học vài phiên (và quay lại sau vài ngày) để hệ thống so sánh được trí nhớ ngay sau học với sau khoảng nghỉ.</div>`}
    <div class="sa-note">Mỗi thanh = tỉ lệ nhớ đúng trong <b>các lượt đã được kiểm tra</b> ở khoảng cách đó (${r.windowDays} ngày gần nhất); chỉ hiện % khi có ≥ ${SA_MIN_N} lượt. Từ chưa được kiểm tra lại <b>không</b> bị tính là quên. Khoảng cách tính từ lần gặp từ trước đó; lượt vừa xem đáp án (kể cả câu đầu sau màn giới thiệu từ mới) được xếp vào “ngay sau khi học”. <b>Giới hạn:</b> các thanh gộp nhiều kỹ năng và dạng câu hỏi có độ khó khác nhau, nên chỉ so sánh để tham khảo — không phải tốc độ quên đo chính xác.</div></div>`;
}

// ── Kết quả theo dạng bài ───────────────────────────────────────────────────────────────────────
function saRenderByType() {
  const r = saState.retention; if (!r || !r.byType || !r.byType.length) return '';
  const agg = {};
  for (const t of r.byType) {
    const a = agg[t.exercise_type] || (agg[t.exercise_type] = { n: 0, ok: 0 });
    a.n += t.n; a.ok += t.correct;
  }
  const rows = Object.keys(agg).sort((x, y) => agg[y].n - agg[x].n).map(k => {
    const a = agg[k];
    return `<tr><td>${escapeHtml(saTypeLabel(k))}</td><td>${a.ok}/${a.n}</td><td>${a.n >= 5 ? saPct(a.ok / a.n) : '<span class="sk-nodata">ít dữ liệu</span>'}</td></tr>`;
  }).join('');
  return `<div class="panel"><div class="panel-title">🧪 Kết quả theo dạng bài</div>
    <table class="sa-table"><tr><th>Dạng bài</th><th>Đúng</th><th>Tỉ lệ</th></tr>${rows}</table>
    <div class="sa-note">Gộp lượt ôn FSRS và luyện bổ sung (${r.windowDays} ngày gần nhất). Dạng có dưới 5 lượt không hiện tỉ lệ.</div></div>`;
}

// ── Chi tiết từng từ ────────────────────────────────────────────────────────────────────────────
async function saOpenWord(hz) {
  hz = String(hz || '').trim(); if (!hz) return;
  saState.word = { hz }; saState.wordLoading = true; saState.wordError = null;
  render();
  try {
    const d = await skFetchJson('/api/skills/word?hz=' + encodeURIComponent(hz));
    saState.word = d;
  } catch (e) { saState.wordError = e.message; }
  saState.wordLoading = false;
  if (currentTab === 'skills' && saState.word) render();
}
function saCloseWord() { saState.word = null; saState.wordError = null; render(); }
function saOpenWordFromInput() { const i = document.getElementById('sa-word-input'); if (i && i.value.trim()) saOpenWord(i.value); }

function saRenderWordSearch() {
  return `<div class="panel"><div class="panel-title">🔎 Xem chi tiết một từ</div>
    <div style="display:flex;gap:8px"><input id="sa-word-input" class="type-input" style="flex:1;margin:0" lang="zh-CN" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Gõ chữ Hán, ví dụ: 准备" onkeydown="if(event.key==='Enter')saOpenWordFromInput()">
    <button class="btn btn-primary" onclick="saOpenWordFromInput()">Xem</button></div></div>`;
}

function saRenderWordDetail() {
  const d = saState.word;
  const back = `<button class="btn" style="margin-bottom:10px" onclick="saCloseWord()">← Quay lại phân tích</button>`;
  if (saState.wordLoading) return saStyle() + back + `<div class="panel center" style="padding:24px">⏳ Đang tải...</div>`;
  if (saState.wordError) return saStyle() + back + `<div class="panel center" style="padding:24px">⚠️ ${escapeHtml(saState.wordError)}<br><button class="btn" style="margin-top:10px" onclick="saOpenWord('${escapeJsAttr(d && d.hz || '')}')">Thử lại</button></div>`;
  const w = d.word, c = d.card;
  const head = `<div class="panel" style="text-align:center">
    <div style="font-size:2.4rem;font-weight:900">${escapeHtml(w.hz)}</div>
    <div style="color:var(--muted)">${escapeHtml(w.py || '')}</div>
    <div style="font-weight:700;margin-top:2px">${escapeHtml(w.vi || '')}</div>
    ${w.hanviet ? `<div class="sa-note">Hán Việt: ${escapeHtml(w.hanviet)}</div>` : ''}
    <div style="margin-top:6px"><button class="btn btn-sm btn-sound" onclick="speak('${escapeJsAttr(w.hz)}')">🔊 Nghe</button></div></div>`;

  let fsrs;
  if (!c) fsrs = `<div class="sa-note">Từ này chưa có thẻ FSRS — bạn chưa học nó ở “Hôm nay học”.</div>`;
  else {
    const due = c.due ? new Date(c.due) : null;
    const dueTxt = due ? (due.getTime() <= Date.now() ? '<b>Đã đến hạn ôn</b>' : 'Ôn lại vào ' + escapeHtml(due.toLocaleDateString('vi-VN'))) : '—';
    fsrs = `<div style="font-size:.85rem;line-height:1.7">
      Trạng thái học: <b>${escapeHtml(SA_STATE_TEXT[c.state] || '—')}</b><br>
      Lịch ôn: ${dueTxt}<br>
      Đã ôn ${c.reps} lượt · quên ${c.lapses} lần${c.stability ? ` · độ bền ghi nhớ ~${Math.round(c.stability * 10) / 10} ngày` : ''}
    </div>`;
  }

  const skillRows = SK_MEASURED.map(k => {
    const s = d.skills[k] || { level: 'insufficient', attempts: 0 };
    const lv = SA_LEVEL[s.level] || SA_LEVEL.insufficient;
    const detail = s.level === 'insufficient'
      ? `<span class="sk-nodata">${s.attempts} lượt (cần ≥ 3)</span>`
      : `<span style="font-size:.75rem">${saPct(s.score)} · ${s.correct}/${s.attempts} đúng</span>`;
    const EV = { none: 'Chưa có dữ liệu', few: 'Dữ liệu còn ít', developing: 'Đang phát triển', stable: 'Tương đối ổn định', retested: 'Đã kiểm tra lại sau khoảng nghỉ' };
    const evTxt = s.stage && s.stage !== 'none' ? `<div class="sa-note" style="margin:2px 0 0">Bằng chứng: <b>${EV[s.stage] || ''}</b> · ${s.attempts} lượt${s.activeDays ? ' · ' + s.activeDays + ' ngày' : ''}${s.delayedN ? ` · sau khoảng nghỉ ≥24h: đúng ${s.delayedOk}/${s.delayedN}` : ''}</div>` : '';
    const last = s.lastAttemptAt ? `<div class="sa-note" style="margin:0">gần nhất: ${escapeHtml(new Date(s.lastAttemptAt).toLocaleDateString('vi-VN'))}</div>` : '';
    return `<div class="sa-brow" style="align-items:flex-start"><span class="sa-blbl">${escapeHtml(SK_LABEL[k])}</span><div style="flex:1"><span class="sa-lv ${lv.cls}">${lv.text}</span> ${detail}${evTxt}${last}</div></div>`;
  }).join('');

  const rec = d.recommendation || { items: [] };
  const recHtml = rec.items && rec.items.length
    ? rec.items.map(it => `<div class="sa-rec"><div class="sa-rec-t">${escapeHtml(it.title)}</div><div class="sa-rec-w">${escapeHtml(it.why)}</div>${it.stopWhen ? `<div class="sa-note" style="margin:4px 0 0">⏹ ${escapeHtml(it.stopWhen)}</div>` : ''}${it.action && it.action.kind === 'practice' ? `<button class="btn btn-sm" style="margin-top:6px" ${it.action.skill === 'listening' && !skAudioOk() ? 'disabled' : `onclick="skStartPracticeForWord('${escapeJsAttr(w.hz)}','${escapeJsAttr(it.action.skill)}')"`}>Luyện từ này · ${escapeHtml(it.action.hint || '')}</button>` : ''}</div>`).join('')
    : `<div class="sa-note">${escapeHtml(rec.note || 'Chưa có khuyến nghị.')}</div>`;

  const weakTypes = (d.weakTypes || []).length
    ? `<div style="font-size:.82rem"><b>Dạng bài hay sai:</b> ${d.weakTypes.map(t => `${escapeHtml(saTypeLabel(t.exercise_type))} (${t.wrong}/${t.n} sai)`).join('; ')}</div>`
    : '';
  const hist = (d.history || []).slice(0, 15).map(h => `<div class="sa-hist"><span style="width:44px;color:var(--muted)">${escapeHtml(new Date(h.ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }))}</span>
    <span>${h.ok ? '✅' : '❌'}</span><span style="flex:1">${escapeHtml(saTypeLabel(h.exercise_type) || SK_LABEL[h.skill] || '')}<span style="color:var(--muted)"> · ${escapeHtml(SA_SOURCE_TEXT[h.kind] || h.kind)}</span></span>
    ${h.response_time_ms != null ? `<span style="color:var(--muted)">${(h.response_time_ms / 1000).toFixed(1)}s</span>` : ''}</div>`).join('');

  return saStyle() + back + head
    + `<div class="panel"><div class="panel-title">📅 Trạng thái FSRS</div>${fsrs}</div>`
    + `<div class="panel"><div class="panel-title">🎯 Kỹ năng của từ này</div>${skillRows}${weakTypes}${saRenderToneDiagnosis(w, d.history)}
        <div class="sa-note">Mỗi kỹ năng đánh giá riêng; cần ≥ 3 lượt hợp lệ mới kết luận, “tốt” cần ≥ 5 lượt. Lượt vừa xem đáp án (kiểm tra ngay sau học, luyện lại câu sai) không được tính vào điểm. Không có điểm tổng hợp.</div></div>`
    + `<div class="panel"><div class="panel-title">💡 Nên luyện gì?</div>${recHtml}</div>`
    + `<div class="panel"><div class="panel-title">🕘 Lịch sử gần đây</div>${hist || '<div class="sa-note">Chưa có lượt nào ghi nhận kỹ năng cho từ này.</div>'}
        <div class="sa-note">Chỉ liệt kê các lượt từ khi hệ thống ghi nhận kỹ năng; tối đa 15 lượt gần nhất.</div></div>`;
}

function saResetState() {
  saState = { recs: null, retention: null, learner: null, insights: null, loadedAt: 0, error: null, word: null, wordLoading: false, wordError: null };
}
