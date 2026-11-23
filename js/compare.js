// js/compare.js — Tab So sánh chữ dễ nhầm (cp*) + Sơ đồ Họ chữ Hán (hn*) — KHÔNG qua FSRS
// ════════════════════════════════════════════════════
// COMPARE / CONFUSABLE CHARACTERS + HANZI NETWORK
// ════════════════════════════════════════════════════
let cpTestMode = false, cpTestQueue = [], cpTestIdx = 0, cpTestScore = 0;
let cpSubTab = 'confuse'; // 'confuse' | 'network'
let hnSelectedChar = '请';
let hnSelectedPart = null; // khi bấm vào 1 bộ thủ/thành phần thay vì 1 chữ đơn
let hnHistory = [];
let hnSearchQuery = '';

function renderCompare() {
  const tabs = `<div class="gf-subtabs" role="tablist" style="margin-bottom:12px">
    <button type="button" class="gf-subtab${cpSubTab === 'confuse' ? ' active' : ''}" onclick="cpSwitchTab('confuse')">🆚 Chữ dễ nhầm</button>
    <button type="button" class="gf-subtab${cpSubTab === 'network' ? ' active' : ''}" onclick="cpSwitchTab('network')">🕸️ Sơ đồ họ chữ</button>
  </div>`;
  if (cpSubTab === 'network') {
    return `<div class="panel" style="margin-bottom:14px">
      ${tabs}
      <div class="panel-title">🕸️ Sơ đồ Họ chữ Hán · Bộ thủ · Thanh phù · Từ ghép</div>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Chọn một chữ Hán hoặc bộ thủ để xem ngay mạng lưới chữ cùng bộ thủ, cùng thành phần âm, chữ dễ nhầm và toàn bộ từ ghép trong giáo trình.</div>
      <div class="gf-hn-search">
        <input id="hn-search-input" class="type-input" style="margin:0;text-align:left;font-size:.9rem;padding:8px 12px" placeholder="Tìm chữ Hán, Pinyin hoặc nghĩa (vd: 请, 话, nói, nước)..." value="${escapeHtml(hnSearchQuery)}" oninput="hnOnSearch(this.value)">
      </div>
      <div id="hn-search-results"></div>
      <div id="hn-area" style="margin-top:10px"></div>
    </div>`;
  }
  return `
  <div class="panel" style="margin-bottom:14px">
    ${tabs}
    <div style="font-size:.85rem;color:var(--muted);margin-bottom:10px">🆚 Những chữ Hán dễ nhìn nhầm hoặc đồng âm — đặt cạnh nhau để so sánh và ghi nhớ điểm khác biệt.</div>
    <button class="btn btn-primary" onclick="cpStartTest()">🧠 Kiểm tra nhanh tất cả nhóm</button>
  </div>
  <div id="cp-area">${cpRenderList()}</div>`;
}

function cpSwitchTab(tab) {
  cpSubTab = tab === 'network' ? 'network' : 'confuse';
  if (typeof render === 'function') render();
}

function openHanziNetwork(ch) {
  const cjk = /[\u4e00-\u9fff]/;
  const firstChar = [...String(ch || '')].find(c => cjk.test(c));
  if (firstChar) {
    hnSelectedChar = firstChar;
    hnSelectedPart = null;
    hnPushHistory(firstChar);
  }
  cpSubTab = 'network';
  if (typeof goTab === 'function') goTab('compare');
}

function bindCompare() {
  if (cpSubTab === 'network') {
    if (typeof loadHanziParts === 'function' && typeof hanziPartsState !== 'undefined' && hanziPartsState === 'idle') {
      loadHanziParts().then(() => { if (currentTab === 'compare' && cpSubTab === 'network') hnRender(); });
    }
    hnRender();
  }
}

function cpRenderList() {
  const appHz = new Set(WORDS.map(w => w.hz));
  const hvMap = {};
  WORDS.forEach(w => { if (w.hanviet && !hvMap[w.hz]) hvMap[w.hz] = w.hanviet; });
  return CONFUSE_GROUPS.map(g => {
    const itemsHtml = g.chars.map((c, i) => `
      ${i > 0 ? '<span class="confuse-vs">vs</span>' : ''}
      <div class="confuse-item${appHz.has(c.hz) ? ' in-vocab' : ''}">
        <div class="confuse-hz" onclick="speak('${c.hz}')">${c.hz}</div>
        ${showPinyin ? `<div class="confuse-py">${c.py}</div>` : ''}
        ${showHanViet && hvMap[c.hz] ? `<div class="confuse-hv">${hvMap[c.hz]}</div>` : ''}
        <div class="confuse-vi">${c.vi}</div>
        ${appHz.has(c.hz) ? '<div class="confuse-badge">✓ trong vốn từ</div>' : ''}
        <button type="button" class="gf-hn-mini-link" onclick="openHanziNetwork('${c.hz}')">🕸️ Họ chữ</button>
      </div>`).join('');
    return `<div class="confuse-card">
      <div class="confuse-row">${itemsHtml}</div>
      <div class="confuse-tip">💡 ${g.tip}</div>
    </div>`;
  }).join('');
}

function cpStartTest() {
  cpTestMode = true; cpTestScore = 0; cpTestIdx = 0;
  cpTestQueue = shuffle(CONFUSE_GROUPS.slice());
  cpRenderTestQ();
}

function cpRenderTestQ() {
  const area = document.getElementById('cp-area');
  if (cpTestIdx >= cpTestQueue.length) {
    area.innerHTML = `<div class="panel exam-result">
      <div class="exam-score">${cpTestScore}/${cpTestQueue.length}</div>
      <div class="exam-rank">${qzRank(cpTestScore / cpTestQueue.length)}</div>
      <button class="btn btn-primary" onclick="cpStartTest()">Làm lại</button>
      <button class="btn" onclick="cpExitTest()">Xem danh sách</button>
    </div>`;
    return;
  }
  const g = cpTestQueue[cpTestIdx];
  const target = g.chars[Math.floor(Math.random() * g.chars.length)];
  const opts = shuffle(g.chars.slice());
  const optHtml = opts.map(o => `<button class="confuse-test-opt" onclick="cpPick(this,'${o.hz}','${target.hz}')">${o.hz}</button>`).join('');
  area.innerHTML = `<div class="panel">
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:10px">${cpTestIdx + 1}/${cpTestQueue.length} · Chọn đúng chữ Hán</div>
    <div style="text-align:center;font-size:1.05rem;font-weight:700;margin-bottom:6px">${target.vi}</div>
    ${showPinyin ? `<div style="text-align:center;font-size:.85rem;color:var(--muted);font-style:italic;margin-bottom:14px">${target.py}</div>` : ''}
    <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">${optHtml}</div>
    <div style="margin-top:14px;text-align:center"><button class="btn" onclick="cpExitTest()">✕ Thoát kiểm tra</button></div>
  </div>`;
}

function cpPick(btn, hz, correctHz) {
  document.querySelectorAll('.confuse-test-opt').forEach(b => b.style.pointerEvents = 'none');
  const isCorrect = hz === correctHz;
  if (isCorrect) { btn.classList.add('correct'); cpTestScore++; }
  else {
    btn.classList.add('wrong');
    document.querySelectorAll('.confuse-test-opt').forEach(b => { if (b.textContent === correctHz) b.classList.add('correct'); });
  }
  speak(correctHz);
  setTimeout(() => { cpTestIdx++; cpRenderTestQ(); }, 1200);
}

function cpExitTest() {
  cpTestMode = false;
  document.getElementById('cp-area').innerHTML = cpRenderList();
}

// ════════════════════════════════════════════════════
// SƠ ĐỒ HỌ CHỮ HÁN (HANZI CHARACTER FAMILY EXPLORER)
// ════════════════════════════════════════════════════
function hnNormPartKey(raw) {
  return String(raw || '').replace(/\(.*?\)/g, '').trim();
}

function hnIsPhoneticNote(mean) {
  return /âm\s*:|thành phần âm|thanh phù|âm đọc/i.test(String(mean || ''));
}

function hnBuildIndex() {
  const cjk = /[\u4e00-\u9fff]/;
  const charParts = {};   // ch -> [{ c, key, m, isPhonetic }]
  const charNote = {};    // ch -> string note
  const partToChars = {}; // key -> { key, label, sampleMean, chars: Set, phoneticChars: Set }
  const charMeta = {};    // ch -> { py, vi, hanviet }
  const charToWords = {}; // ch -> [word]
  const charToConfuse = {}; // ch -> [{ hz, py, vi, tip }]

  const addPart = (ch, c, m) => {
    const key = hnNormPartKey(c);
    if (!key) return;
    const isPhon = hnIsPhoneticNote(m);
    if (!charParts[ch]) charParts[ch] = [];
    if (!charParts[ch].some(x => x.key === key)) {
      charParts[ch].push({ c, key, m: String(m || ''), isPhonetic: isPhon });
    }
    if (!partToChars[key]) partToChars[key] = { key, label: key, sampleMean: String(m || '').split(/[(:;,]/)[0].trim(), chars: new Set(), phoneticChars: new Set() };
    partToChars[key].chars.add(ch);
    if (isPhon) partToChars[key].phoneticChars.add(ch);
  };

  // 1. Nạp chiết tự từ HANZI_PARTS tĩnh + dbHanziParts (DB AI phủ rộng hơn)
  const staticMap = (typeof HANZI_PARTS !== 'undefined' && HANZI_PARTS) ? HANZI_PARTS : {};
  for (const [ch, entry] of Object.entries(staticMap)) {
    if (!cjk.test(ch)) continue;
    if (Array.isArray(entry)) entry.forEach(([c, m]) => addPart(ch, c, m));
    else if (typeof entry === 'string') charNote[ch] = entry;
  }
  const dbMap = (typeof dbHanziParts !== 'undefined' && dbHanziParts) ? dbHanziParts : {};
  for (const [ch, entry] of Object.entries(dbMap)) {
    if (!cjk.test(ch) || !entry) continue;
    if (entry.type === 'parts' && Array.isArray(entry.items)) {
      charParts[ch] = [];
      entry.items.forEach(it => addPart(ch, it.c, it.m));
    } else if (entry.type === 'note' && entry.text) {
      charNote[ch] = entry.text;
    }
  }

  // 2. Ánh xạ từ vựng & từ ghép từ WORDS
  const words = (typeof WORDS !== 'undefined' && Array.isArray(WORDS)) ? WORDS : [];
  for (const w of words) {
    if (!w || !w.hz) continue;
    const chars = [...w.hz].filter(c => cjk.test(c));
    if (chars.length === 1 && !charMeta[chars[0]]) {
      charMeta[chars[0]] = { py: w.py || '', vi: w.vi || '', hanviet: w.hanviet || '' };
    }
    for (const ch of new Set(chars)) {
      if (!charToWords[ch]) charToWords[ch] = [];
      if (charToWords[ch].length < 24 && !charToWords[ch].some(x => x.hz === w.hz)) charToWords[ch].push(w);
    }
  }

  // 3. Ánh xạ nhóm chữ dễ nhầm từ CONFUSE_GROUPS
  const groups = (typeof CONFUSE_GROUPS !== 'undefined' && Array.isArray(CONFUSE_GROUPS)) ? CONFUSE_GROUPS : [];
  for (const g of groups) {
    for (const c of (g.chars || [])) {
      if (!charMeta[c.hz]) charMeta[c.hz] = { py: c.py || '', vi: c.vi || '', hanviet: '' };
      if (!charToConfuse[c.hz]) charToConfuse[c.hz] = [];
      for (const other of (g.chars || [])) {
        if (other.hz !== c.hz && !charToConfuse[c.hz].some(x => x.hz === other.hz)) {
          charToConfuse[c.hz].push({ hz: other.hz, py: other.py, vi: other.vi, tip: g.tip });
        }
      }
    }
  }

  return { charParts, charNote, partToChars, charMeta, charToWords, charToConfuse };
}

function hnPushHistory(label) {
  if (!label) return;
  hnHistory = hnHistory.filter(x => x !== label);
  hnHistory.push(label);
  if (hnHistory.length > 8) hnHistory = hnHistory.slice(-8);
}

function hnSelectChar(ch) {
  hnSelectedChar = ch;
  hnSelectedPart = null;
  hnPushHistory(ch);
  hnRender();
}

function hnSelectPart(partKey) {
  hnSelectedPart = partKey;
  hnPushHistory('Bộ ' + partKey);
  hnRender();
}

function hnOnSearch(val) {
  hnSearchQuery = String(val || '');
  const box = document.getElementById('hn-search-results');
  if (!box) return;
  const q = hnSearchQuery.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const idx = hnBuildIndex();
  const cjk = /[\u4e00-\u9fff]/;
  const hits = [], seen = new Set();
  const pushHit = (ch, sub) => {
    if (!ch || seen.has(ch) || hits.length >= 16) return;
    seen.add(ch);
    hits.push({ ch, sub });
  };
  for (const ch of [...q]) {
    if (cjk.test(ch)) pushHit(ch, (idx.charMeta[ch] && idx.charMeta[ch].vi) || '');
  }
  const words = (typeof WORDS !== 'undefined' && Array.isArray(WORDS)) ? WORDS : [];
  for (const w of words) {
    if (hits.length >= 16) break;
    const py = (w.py || '').toLowerCase();
    const vi = (w.vi || '').toLowerCase();
    const hv = (w.hanviet || '').toLowerCase();
    if (w.hz.includes(q) || py.includes(q) || vi.includes(q) || hv.includes(q)) {
      const first = [...w.hz].find(c => cjk.test(c));
      if (first) pushHit(first, `${w.hz} · ${w.vi}`);
    }
  }
  if (!hits.length) {
    box.innerHTML = `<div style="font-size:.76rem;color:var(--muted);margin-top:6px">Không thấy chữ phù hợp trong kho từ vựng.</div>`;
    return;
  }
  box.innerHTML = `<div class="gf-hn-hits">${hits.map(h => `<button type="button" class="gf-hn-chip" onclick="hnSelectChar('${escapeJsAttr(h.ch)}')"><b>${escapeHtml(h.ch)}</b>${h.sub ? ` <span>${escapeHtml(h.sub.slice(0, 26))}</span>` : ''}</button>`).join('')}</div>`;
}

function hnWordStatusDot(hz) {
  const st = (typeof window !== 'undefined' && window._hskStatusByHz) ? window._hskStatusByHz[hz] : null;
  if (st === 'mature') return '<span class="gf-hn-dot is-mature" title="Đã vững (FSRS)"></span>';
  if (st === 'learning' || (typeof sessionKnownHz !== 'undefined' && sessionKnownHz.has(hz))) return '<span class="gf-hn-dot is-learn" title="Đang học"></span>';
  return '';
}

function hnRender() {
  const area = document.getElementById('hn-area');
  if (!area) return;
  const idx = hnBuildIndex();

  // Top bộ thủ / họ chữ phổ biến nhất có trong dữ liệu thật
  const topParts = Object.values(idx.partToChars)
    .filter(p => p.chars.size >= 3)
    .sort((a, b) => b.chars.size - a.chars.size)
    .slice(0, 12);

  const popularBar = topParts.length ? `<div class="gf-hn-pop">
    <span style="font-size:.74rem;color:var(--muted);font-weight:700">Bộ thủ nổi bật:</span>
    ${topParts.map(p => `<button type="button" class="dash-chip${hnSelectedPart === p.key ? ' sel' : ''}" onclick="hnSelectPart('${escapeJsAttr(p.key)}')">${escapeHtml(p.key)}${p.sampleMean ? ` · ${escapeHtml(p.sampleMean.slice(0, 10))}` : ''} (${p.chars.size})</button>`).join('')}
  </div>` : '';

  const trailHtml = hnHistory.length > 1
    ? `<div class="gf-hn-trail">${hnHistory.map((item, i) => {
      const isPart = item.startsWith('Bộ ');
      const fn = isPart ? `hnSelectPart('${escapeJsAttr(item.slice(3))}')` : `hnSelectChar('${escapeJsAttr(item)}')`;
      return `${i > 0 ? '<span class="gf-hn-arrow">→</span>' : ''}<button type="button" class="gf-hn-crumb" onclick="${fn}">${escapeHtml(item)}</button>`;
    }).join('')}</div>` : '';

  // Chế độ xem toàn bộ 1 bộ thủ / thành phần
  if (hnSelectedPart && idx.partToChars[hnSelectedPart]) {
    const p = idx.partToChars[hnSelectedPart];
    const chars = [...p.chars];
    area.innerHTML = `${popularBar}${trailHtml}
      <div class="gf-hn-center">
        <div class="gf-hn-seal">${escapeHtml(p.key)}</div>
        <div class="gf-hn-meta">
          <div style="font-weight:800;font-size:1rem">Họ bộ thủ / thành phần “${escapeHtml(p.key)}”</div>
          <div style="font-size:.82rem;color:var(--muted)">${escapeHtml(p.sampleMean || 'Thành phần cấu tạo chữ Hán')} · <b>${chars.length} chữ</b> có trong kho chiết tự</div>
        </div>
      </div>
      <div class="gf-hn-branch">
        <div class="gf-hn-btitle">🧩 Tất cả chữ chứa “${escapeHtml(p.key)}” (bấm chữ để mở sơ đồ chi tiết)</div>
        <div class="gf-hn-grid">${chars.map(ch => {
          const m = idx.charMeta[ch] || {};
          return `<button type="button" class="gf-hn-node" onclick="hnSelectChar('${escapeJsAttr(ch)}')">
            <div class="gf-hn-node-ch">${hnWordStatusDot(ch)}${escapeHtml(ch)}</div>
            ${m.py ? `<div class="gf-hn-node-py">${escapeHtml(m.py)}</div>` : ''}
            ${m.vi ? `<div class="gf-hn-node-vi">${escapeHtml(m.vi.slice(0, 22))}</div>` : ''}
          </button>`;
        }).join('')}</div>
      </div>`;
    return;
  }

  // Nếu chữ mặc định chưa có trong kho (vd vừa mở), chọn chữ đầu tiên có chiết tự & có từ ghép
  let ch = hnSelectedChar;
  if (!idx.charParts[ch] && !idx.charToWords[ch] && !idx.charNote[ch]) {
    const fallback = Object.keys(idx.charParts).find(k => (idx.charToWords[k] || []).length > 0) || Object.keys(idx.charParts)[0] || '学';
    ch = fallback;
    hnSelectedChar = ch;
  }

  const meta = idx.charMeta[ch] || {};
  const parts = idx.charParts[ch] || [];
  const note = idx.charNote[ch] || '';
  const words = idx.charToWords[ch] || [];
  const confuses = idx.charToConfuse[ch] || [];

  // Tách nhánh: cùng thành phần âm (thanh phù) vs cùng bộ thủ
  const phoneticSiblings = [], semanticSiblings = [];
  const seenPhon = new Set([ch]), seenSem = new Set([ch]);
  for (const pt of parts) {
    const bucket = idx.partToChars[pt.key];
    if (!bucket) continue;
    for (const sib of bucket.chars) {
      if (pt.isPhonetic) {
        if (!seenPhon.has(sib)) { seenPhon.add(sib); phoneticSiblings.push({ ch: sib, via: pt.key }); }
      } else {
        if (!seenSem.has(sib)) { seenSem.add(sib); semanticSiblings.push({ ch: sib, via: pt.key }); }
      }
    }
  }

  const renderCharNodes = (list) => list.slice(0, 18).map(item => {
    const m = idx.charMeta[item.ch] || {};
    return `<button type="button" class="gf-hn-node" onclick="hnSelectChar('${escapeJsAttr(item.ch)}')">
      <div class="gf-hn-node-ch">${hnWordStatusDot(item.ch)}${escapeHtml(item.ch)}</div>
      ${m.py ? `<div class="gf-hn-node-py">${escapeHtml(m.py)}</div>` : ''}
      ${m.vi ? `<div class="gf-hn-node-vi">${escapeHtml(m.vi.slice(0, 20))}</div>` : ''}
      ${item.via ? `<div class="gf-hn-node-via">chung ${escapeHtml(item.via)}</div>` : ''}
    </button>`;
  }).join('');

  area.innerHTML = `${popularBar}${trailHtml}
    <div class="gf-hn-center">
      <button type="button" class="gf-hn-seal" onclick="speak('${escapeJsAttr(ch)}')" title="Bấm để nghe phát âm">${escapeHtml(ch)}</button>
      <div class="gf-hn-meta">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.05rem;font-weight:800">${escapeHtml(meta.py || 'Chữ Hán')}</span>
          ${meta.hanviet ? `<span class="gf-hn-hv-tag">Hán Việt: ${escapeHtml(meta.hanviet)}</span>` : ''}
          <button type="button" class="btn-sound-sm" onclick="speak('${escapeJsAttr(ch)}')">🔊</button>
        </div>
        ${meta.vi ? `<div style="font-size:.88rem;margin-top:3px;font-weight:600">${escapeHtml(meta.vi)}</div>` : ''}
        ${parts.length
          ? `<div class="gf-hn-parts">${parts.map(pt => `<button type="button" class="gf-hn-part-pill${pt.isPhonetic ? ' is-phon' : ''}" onclick="hnSelectPart('${escapeJsAttr(pt.key)}')"><b>${escapeHtml(pt.c)}</b> <span>${escapeHtml(pt.m)}</span></button>`).join('')}</div>`
          : (note ? `<div style="font-size:.78rem;color:var(--muted);margin-top:6px">${escapeHtml(note)}</div>` : '')}
      </div>
    </div>

    ${phoneticSiblings.length ? `<div class="gf-hn-branch">
      <div class="gf-hn-btitle">🎵 Cùng thành phần âm / hình (${phoneticSiblings.length} chữ)</div>
      <div class="gf-hn-grid">${renderCharNodes(phoneticSiblings)}</div>
    </div>` : ''}

    ${semanticSiblings.length ? `<div class="gf-hn-branch">
      <div class="gf-hn-btitle">🧩 Cùng bộ thủ (${semanticSiblings.length} chữ)</div>
      <div class="gf-hn-grid">${renderCharNodes(semanticSiblings)}</div>
    </div>` : ''}

    ${confuses.length ? `<div class="gf-hn-branch">
      <div class="gf-hn-btitle">🆚 Chữ dễ nhìn nhầm / đồng âm</div>
      <div class="gf-hn-grid">${confuses.map(c => `<button type="button" class="gf-hn-node is-warn" onclick="hnSelectChar('${escapeJsAttr(c.hz)}')">
        <div class="gf-hn-node-ch">${escapeHtml(c.hz)}</div>
        <div class="gf-hn-node-py">${escapeHtml(c.py)}</div>
        <div class="gf-hn-node-vi">${escapeHtml(c.vi)}</div>
      </button>`).join('')}</div>
      <div style="font-size:.76rem;color:var(--muted);margin-top:6px">💡 ${escapeHtml(confuses[0].tip || '')}</div>
    </div>` : ''}

    <div class="gf-hn-branch">
      <div class="gf-hn-btitle">📚 Từ ghép chứa “${escapeHtml(ch)}” trong giáo trình (${words.length} từ)</div>
      ${words.length ? `<div class="gf-hn-words">${words.map(w => `<div class="gf-hn-word" onclick="speak('${escapeJsAttr(w.hz)}')">
        <span class="gf-hn-word-hz">${hnWordStatusDot(w.hz)}${escapeHtml(w.hz)}</span>
        <span class="gf-hn-word-info">${showPinyin && w.py ? `<i>${escapeHtml(w.py)}</i> · ` : ''}${escapeHtml(w.vi || '')}</span>
        ${w.l ? `<span class="gf-hn-word-l">B${w.l}</span>` : ''}
      </div>`).join('')}</div>` : `<div style="font-size:.78rem;color:var(--muted)">Chưa có từ ghép nào chứa chữ này trong dữ liệu từ vựng đã tải.</div>`}
    </div>`;
}
