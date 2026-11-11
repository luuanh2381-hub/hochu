// js/word-image-admin.js — V144: quản trị ẢNH GỢI NHỚ theo từ / bài / nhãn.
// Số liệu lấy từ /api/admin/word-images/audit (chỉ đọc database) — KHÔNG bao giờ tự tạo ảnh khi mở trang.
// Kiểm tra thật trên R2 theo lô qua /api/admin/word-images/verify (≤50 từ/lượt, có thanh tiến độ, dừng được).
// Mọi trạng thái đều dựa trên dữ liệu thật: bản ghi DB → tệp trên R2 → URL ký sẵn → ảnh load được trong UI.
// Hàng đợi ưu tiên: Bài 37 → 36 → 38 (xong bài trước mới sang bài sau) → sửa ảnh lỗi → các bài còn lại
// (bài thiếu nhiều nhất trước). Tiến trình lưu ở localStorage → mở lại là chạy tiếp, không tạo trùng.
(function (g) {
  'use strict';
  var A = g.WIAudit;
  var PRIORITY_LESSONS = [37, 36, 38];
  var GI = '/api/admin/word-images/generate'; // sinh ảnh (đã có từ V142)
  var PAGE = 50, VERIFY_CHUNK = 50, GEN_CHUNK = 15, MAX_ROUNDS = 60;
  var K_AUDIT = 'wia:audit:v1', K_VER = 'wia:verify:v1', K_RUN = 'wia:run:v1';
  var state = {
    items: [], byHz: new Map(), totals: null, byLesson: [], byTag: [], configured: true, missingEnv: [], at: 0,
    verify: {}, filter: { l: '', tag: '', st: '', q: '' }, page: 0, sel: new Set(),
    stages: [], running: false, abort: false, log: {}, items0: [], report: null, msg: '',
  };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return typeof g.escapeHtml === 'function' ? g.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hzAttr(hz) {
    // Chuỗi Hán đi vào lời gọi hàm trong thuộc tính HTML → phải escape đúng kiểu chuỗi JS (không chỉ HTML).
    return String(hz).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\x22').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/[\r\n]/g, ' ');
  }
  function num(n) { return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function lsGet(k, dflt) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* localStorage đầy/bị chặn — bỏ qua, chỉ mất khả năng chạy tiếp */ } }
  async function api(path, opts) {
    var o = opts || {};
    var res = await fetch(path, {
      method: o.method || 'GET',
      headers: o.body ? Object.assign({ 'Content-Type': 'application/json' }, g.authHeaders()) : g.authHeaders(),
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    return res.json();
  }

  // ── Khung panel (chèn vào tab Từ vựng ở js/admin.js) ──
  function wiaPanelHtml() {
    return `<div class="panel" id="wia-panel">
      <div class="panel-title">📊 Kiểm tra &amp; tạo ảnh gợi nhớ</div>
      <div style="font-size:.74rem;color:var(--muted);line-height:1.55;margin-bottom:8px;">
        Số liệu lấy trực tiếp từ database. Nút <b>🔍 Kiểm tra tệp trên R2</b> mới mở tệp thật để đối chiếu (theo lô, có tiến độ) —
        mở trang <b>không</b> tự kiểm tra R2 và <b>không</b> tự tạo ảnh.<br>
        4 mức: ①có bản ghi trong DB → ②có tệp trên R2 → ③ký được URL xem ảnh → ④ảnh hiện được trên màn hình.
      </div>
      <div id="wia-head" style="color:var(--muted);padding:10px 0;text-align:center;">Đang tải số liệu…</div>
      <div id="wia-tools"></div>
      <div id="wia-queue"></div>
      <div id="wia-words"></div>
      <div id="wia-lessons"></div>
      <div id="wia-tags"></div>
    </div>`;
  }

  // ── Nạp số liệu (chỉ DB) ──
  async function wiaLoad(force) {
    var c = force ? null : lsGet(K_AUDIT, null);
    if (c && c.words && Date.now() - (c.at || 0) < 10 * 60 * 1000) { applyAudit(c, true); return true; }
    try {
      var d = await api('/api/admin/word-images/audit');
      if (!d || !d.ok) { $('wia-head').innerHTML = '❌ ' + esc((d && d.error) || 'Không tải được số liệu.'); return false; }
      var snap = { at: Date.now(), words: d.words, totals: d.totals, byLesson: d.byLesson, byTag: d.byTag, configured: d.configured, missingEnv: d.missingEnv || [] };
      lsSet(K_AUDIT, snap);
      applyAudit(snap, false);
      return true;
    } catch (e) { $('wia-head').innerHTML = '❌ Không kết nối được máy chủ: ' + esc(e.message); return false; }
  }
  function applyAudit(snap, fromCache) {
    state.items = A.unpackItems(snap.words);
    state.byHz = new Map(state.items.map(function (it) { return [it.hz, it]; }));
    state.totals = snap.totals; state.byLesson = snap.byLesson || []; state.byTag = snap.byTag || [];
    state.configured = snap.configured !== false; state.missingEnv = snap.missingEnv || [];
    state.at = snap.at || 0;
    if (fromCache) state.msg = 'Dùng số liệu đã lưu lúc ' + time(state.at) + ' (bấm 🔄 để nạp lại từ database).';
    wiaRenderAll();
  }
  function time(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ngày ' + p(d.getDate()) + '/' + p(d.getMonth() + 1);
  }

  // ── Khối trên: 4 con số + thanh tiến độ + nút kiểm tra R2 ──
  function wiaRenderHead() {
    var t = state.totals || { total: 0, ok: 0, missing: 0, pending: 0, error: 0, dup: 0, qc: 0, pctOk: 0 };
    var ver = Object.keys(state.verify).filter(function (k) { return state.verify[k] && state.verify[k].v; });
    var broken = ver.filter(function (k) { var v = state.verify[k]; return v.v === 'gone' || v.display === false; });
    var warn = state.configured ? '' : `<div style="margin-bottom:8px;padding:8px 10px;background:#fff4e0;border-radius:10px;color:#9a6200;font-size:.78rem;">⚠️ R2 chưa cấu hình, thiếu biến môi trường: <b>${esc((state.missingEnv || []).join(', '))}</b> — chỉ xem được số liệu database, không kiểm tra được tệp.</div>`;
    var chip = function (label, val, color) { return `<span style="padding:3px 9px;border-radius:999px;background:#f2f4f7;font-size:.78rem;font-weight:700;${color || ''}">${label} <b>${num(val)}</b></span>`; };
    $('wia-head').innerHTML = warn + `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:8px;">
        ${chip('Tổng từ', t.total)}
        ${chip('✅ Có ảnh', t.ok, 'background:#e8f7ee;color:#1a7f45;')}
        ${chip('⛔ Thiếu', t.missing, 'background:#fdecea;color:#c0392b;')}
        ${chip('❌ Lỗi', t.error, 'background:#fdecea;color:#c0392b;')}
        ${chip('⏳ Đang xử lý', t.pending, 'background:#fff4e0;color:#9a6200;')}
        ${chip('👯 Nghi trùng', t.dup, 'background:#fff4e0;color:#9a6200;')}
        ${chip('❓ Cần xem lại', t.qc, 'background:#fff4e0;color:#9a6200;')}
      </div>
      <div style="height:10px;background:#eceff3;border-radius:999px;overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${Math.min(100, t.pctOk)}%;background:linear-gradient(90deg,#38b26f,#1a7f45);"></div>
      </div>
      <div style="font-size:.76rem;color:var(--muted);text-align:center;margin-bottom:10px;">
        Hoàn thành (chỉ theo database): <b>${t.pctOk}%</b> · số liệu lúc ${time(state.at)}
      </div>
      <div style="font-size:.78rem;color:var(--muted);text-align:center;margin-bottom:10px;">
        Đã kiểm tra R2: <b>${num(ver.length)}/${num(t.total)}</b> từ${broken.length ? ` · <b style="color:#c0392b">${broken.length} ảnh hỏng</b>` : ''}
        ${ver.length ? ' · lần cuối ' + time(Math.max.apply(null, ver.map(function (k) { return state.verify[k].at || 0; }))) : ' (chưa kiểm tra lần nào)'}
      </div>
      <div id="wia-progress"></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
        <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="wiaLoad(true).then(function(){wiaMsg('Đã nạp lại số liệu từ database.');})">🔄 Nạp lại số liệu</button>
        <button class="btn btn-sm" id="wia-vpage-btn" style="background:var(--l9c);color:var(--l9a);" onclick="wiaVerifyPage()">🔍 Kiểm tra R2 (trang đang xem)</button>
        <button class="btn btn-sm" id="wia-vproblems-btn" style="background:var(--l9c);color:var(--l9a);" onclick="wiaVerifyProblems()">🔍 Kiểm tra R2 (từ thiếu/lỗi)</button>
        <button class="btn btn-sm" id="wia-vall-btn" style="background:var(--l9c);color:var(--l9a);" onclick="wiaVerifyAll()">🔍 Kiểm tra lại toàn bộ</button>
        <button class="btn btn-sm" id="wia-stop-btn" style="background:#fdecea;color:#c0392b;display:none;" onclick="wiaStop()">⏹ Dừng</button>
      </div>
      <div id="wia-msg" style="font-size:.78rem;color:var(--muted);text-align:center;margin-top:8px;">${esc(state.msg || '')}</div>`;
  }
  function wiaMsg(s) { state.msg = s; var el = $('wia-msg'); if (el) el.textContent = s; }
  function wiaProgress(done, total, label) {
    var el = $('wia-progress');
    if (!el) return;
    if (!total) { el.innerHTML = ''; return; }
    var p = Math.round(done * 100 / total);
    el.innerHTML = `<div style="font-size:.76rem;color:var(--muted);text-align:center;">${esc(label || '')} ${num(done)}/${num(total)} (${p}%)</div>
      <div style="height:8px;background:#eceff3;border-radius:999px;overflow:hidden;margin-bottom:8px;">
        <div style="height:100%;width:${p}%;background:#3b82f6;"></div></div>`;
  }
  function busy(on) { $('wia-stop-btn').style.display = on ? '' : 'none'; }

  // ── Bộ lọc + chọn + xuất CSV ──
  function filtered() {
    var f = state.filter, q = f.q.trim().toLowerCase();
    return state.items.filter(function (it) {
      if (f.l && it.lessons.indexOf(Number(f.l)) < 0) return false;
      if (f.tag && (it.tag || '(không nhãn)') !== f.tag) return false;
      if (f.st && !matchStatus(it, f.st)) return false;
      if (q && (it.hz + ' ' + it.py + ' ' + it.vi).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function matchStatus(it, st) {
    var v = state.verify[it.hz] || {};
    if (st === 'ok') return it.bucket === 'ok';
    if (st === 'missing') return it.bucket === 'missing';
    if (st === 'pending') return it.bucket === 'pending';
    if (st === 'error') return it.bucket === 'error';
    if (st === 'dup') return it.hasDup;
    if (st === 'qc') return it.hasQc;
    if (st === 'broken') return it.bucket === 'ok' && (v.v === 'gone' || v.display === false);
    if (st === 'unverified') return it.bucket === 'ok' && !v.v;
    return true;
  }
  function wiaRenderTools() {
    var lessons = state.byLesson.map(function (c) { return `<option value="${c.key}"${String(state.filter.l) === String(c.key) ? ' selected' : ''}>Bài ${c.key} — thiếu ${c.missing}${c.error ? ' · lỗi ' + c.error : ''} (${c.total} từ)</option>`; }).join('');
    var tags = state.byTag.map(function (c) { return `<option value="${esc(c.key)}"${state.filter.tag === c.key ? ' selected' : ''}>${esc(c.key)} — thiếu ${c.missing} (${c.total} từ)</option>`; }).join('');
    var st = [['', 'Tất cả trạng thái'], ['missing', '⛔ Thiếu ảnh'], ['ok', '✅ Có ảnh'], ['broken', '💔 Ảnh hỏng (R2)'], ['unverified', '❔ Có ảnh nhưng chưa kiểm tra R2'], ['error', '❌ Lỗi khi tạo'], ['pending', '⏳ Đang xử lý'], ['dup', '👯 Nghi trùng ảnh/nội dung'], ['qc', '❓ Cần xem lại chất lượng']]
      .map(function (x) { return `<option value="${x[0]}"${state.filter.st === x[0] ? ' selected' : ''}>${x[1]}</option>`; }).join('');
    var list = filtered();
    $('wia-tools').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;">
        <select id="wia-f-l" onchange="wiaSetFilter('l', this.value)" style="grid-column:1 / -1;padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.85rem;"><option value="">Tất cả bài học</option>${lessons}</select>
        <select id="wia-f-tag" onchange="wiaSetFilter('tag', this.value)" style="grid-column:1 / -1;padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.85rem;"><option value="">Tất cả nhãn</option>${tags}</select>
        <select id="wia-f-st" onchange="wiaSetFilter('st', this.value)" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.85rem;">${st}</select>
        <input id="wia-f-q" value="${esc(state.filter.q)}" placeholder="Tìm chữ Hán / pinyin / nghĩa" oninput="wiaSetFilter('q', this.value)" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.85rem;">
      </div>
      <div style="font-size:.78rem;color:var(--muted);text-align:center;margin-bottom:8px;">
        Hiện <b id="wia-num-shown">${num(list.length)}</b>/<b id="wia-num-all">${num(state.items.length)}</b> từ · đã chọn <b id="wia-num-sel">${num(state.sel.size)}</b>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:12px;">
        <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="wiaSelectVisible(true)">✅ Chọn các từ đang hiện</button>
        <button class="btn btn-sm" onclick="wiaSelectVisible(false)">⬜ Bỏ chọn</button>
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaSaveCsv('missing')">⬇️ CSV: từ thiếu ảnh</button>
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaSaveCsv('error')">⬇️ CSV: ảnh lỗi/hỏng</button>
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaSaveCsv('all')">⬇️ CSV: tất cả</button>
        <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="wiaGenSelected()">🖼️ Tạo ảnh cho từ đã chọn</button>
      </div>`;
  }
  // Bộ lọc 'q' (ô tìm kiếm) KHÔNG dựng lại khối công cụ → giữ con trỏ trong ô nhập khi đang gõ.
  function wiaSetFilter(k, v) {
    state.filter[k] = v; state.page = 0;
    if (k !== 'q') wiaRenderTools();
    wiaRenderWords();
    updateCounts();
  }
  function updateCounts() {
    var a = $('wia-num-shown'), b = $('wia-num-all'), c = $('wia-num-sel');
    if (a) a.textContent = num(filtered().length);
    if (b) b.textContent = num(state.items.length);
    if (c) c.textContent = num(state.sel.size);
  }

  // ── Bảng từng từ (có ảnh thu nhỏ = bằng chứng mức ④) ──
  function wiaRenderWords() {
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = list.slice(state.page * PAGE, state.page * PAGE + PAGE);
    var rows = slice.map(rowHtml).join('');
    $('wia-words').innerHTML = `<div class="panel-title" style="margin-top:14px;">📋 Từng từ</div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.82rem;">
        <thead><tr style="text-align:left;color:var(--muted);font-size:.74rem;">
          <th style="padding:4px;"></th><th style="padding:4px;">Ảnh</th><th style="padding:4px;">Từ</th><th style="padding:4px;">Bài</th><th style="padding:4px;">Trạng thái</th>
        </tr></thead><tbody>${rows || '<tr><td colspan="5" style="padding:10px;text-align:center;color:var(--muted);">Không có từ nào khớp bộ lọc.</td></tr>'}</tbody></table></div>
      ${pages > 1 ? `<div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:8px;font-size:.8rem;">
        <button class="btn btn-sm" onclick="wiaPage(-1)">◀ Trước</button><span>Trang ${state.page + 1}/${pages}</span><button class="btn btn-sm" onclick="wiaPage(1)">Sau ▶</button></div>` : ''}
      <div id="wia-detail"></div>`;
  }
  function rowHtml(it) {
    var v = state.verify[it.hz] || {};
    var si = A.statusInfo(it, v);
    var tone = si.tone === 'ok' ? 'background:#e8f7ee;color:#1a7f45;' : (si.tone === 'bad' ? 'background:#fdecea;color:#c0392b;' : 'background:#fff4e0;color:#9a6200;');
    var thumb = v.url
      ? `<img src="${esc(v.url)}" crossorigin="anonymous" loading="lazy" width="44" height="44" alt="" style="border-radius:8px;object-fit:cover;background:#eceff3;display:block;" onload="wiaShown('${hzAttr(it.hz)}')" onerror="wiaBroken('${hzAttr(it.hz)}')">`
      : `<span style="display:flex;width:44px;height:44px;border-radius:8px;background:#eceff3;color:#98a2b3;font-size:.62rem;align-items:center;justify-content:center;text-align:center;">chưa<br>kiểm tra</span>`;
    var flags = (it.hasDup ? ' <span style="background:#fff4e0;color:#9a6200;border-radius:6px;padding:0 5px;font-size:.68rem;">nghi trùng</span>' : '')
      + (it.hasQc ? ' <span style="background:#fff4e0;color:#9a6200;border-radius:6px;padding:0 5px;font-size:.68rem;">xem lại</span>' : '')
      + (it.tag ? ` <span style="background:#eef2ff;color:#3730a3;border-radius:6px;padding:0 5px;font-size:.68rem;">${esc(it.tag)}</span>` : '');
    return `<tr style="border-top:1px solid var(--border);">
      <td style="padding:6px 2px;"><input type="checkbox" ${state.sel.has(it.hz) ? 'checked' : ''} onchange="wiaToggleSel('${hzAttr(it.hz)}', this.checked)"></td>
      <td style="padding:4px 2px;">${thumb}</td>
      <td style="padding:6px 4px;min-width:120px;cursor:pointer;" onclick="wiaDetail('${hzAttr(it.hz)}')">
        <div style="font-weight:700;font-size:.98rem;">${esc(it.hz)}${flags}</div>
        <div style="color:var(--muted);font-size:.74rem;">${esc(it.py)} — ${esc(it.vi)}</div>
      </td>
      <td style="padding:6px 4px;font-size:.76rem;color:var(--muted);">${esc(A.lessonText(it))}</td>
      <td style="padding:6px 4px;"><span id="wia-st-${esc(it.hz)}" style="border-radius:8px;padding:2px 6px;font-size:.7rem;${tone}">${esc(si.label)}</span></td>
    </tr>`;
  }
  function wiaPage(d) { state.page = Math.max(0, state.page + d); wiaRenderWords(); }
  function wiaToggleSel(hz, on) { if (on) state.sel.add(hz); else state.sel.delete(hz); updateCounts(); }
  function wiaSelectVisible(on) {
    var list = filtered();
    list.forEach(function (it) { if (on) state.sel.add(it.hz); else state.sel.delete(it.hz); });
    // "Bỏ chọn" bỏ chọn cả những từ đã chọn ở trang/bộ lọc khác (tránh chọn nhầm rồi tạo ảnh hàng loạt)
    if (!on) state.sel = new Set();
    wiaRenderTools(); wiaRenderWords();
  }
  function wiaShown(hz) { setDisplay(hz, true); }
  function wiaBroken(hz) {
    setDisplay(hz, false);
    var el = $('wia-st-' + hz);
    var it = state.byHz.get(hz);
    if (el && it) el.innerHTML = esc(A.statusInfo(it, state.verify[hz]).label);
    if (el) { el.style.background = '#fdecea'; el.style.color = '#c0392b'; }
  }
  function setDisplay(hz, ok) {
    var v = state.verify[hz];
    if (!v) { v = state.verify[hz] = { v: 'stored', at: Date.now() }; }
    if (v.display === ok) return;
    v.display = ok; if (!ok) v.reason = 'Ảnh không load được trong trình duyệt (CORS/khoá/mạng)';
    saveVerify();
  }
  function wiaDetail(hz) {
    var it = state.byHz.get(hz); if (!it) return;
    var v = state.verify[hz] || {};
    var si = A.statusInfo(it, v);
    var img = v.url
      ? `<img src="${esc(v.url)}" crossorigin="anonymous" alt="" style="max-width:100%;max-height:46vh;border-radius:12px;background:#eceff3;display:block;margin:0 auto;" onload="wiaShown('${hzAttr(hz)}')" onerror="wiaBroken('${hzAttr(hz)}')">`
      : `<div style="padding:16px;background:#f2f4f7;border-radius:10px;text-align:center;color:var(--muted);font-size:.8rem;">${it.bucket === 'ok' ? 'Bấm “🔍 Kiểm tra R2 (trang đang xem)” để xác minh tệp và xem ảnh thật.' : 'Chưa có ảnh cho từ này.'}</div>`;
    $('wia-detail').innerHTML = `<div style="border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <b>${esc(it.hz)} <span style="color:var(--muted);font-weight:500;">${esc(it.py)} — ${esc(it.vi)}</span></b>
        <button class="btn btn-sm" onclick="document.getElementById('wia-detail').innerHTML=''">✖️</button>
      </div>
      ${img}
      <div style="font-size:.78rem;line-height:1.7;margin-top:8px;">
        <div><b>Trạng thái:</b> ${esc(si.label)}</div>
        <div><b>Bài:</b> ${esc(A.lessonText(it) || '—')} · <b>Nhãn:</b> ${esc(it.tag || '(không nhãn)')}</div>
        <div><b>Bản ghi DB:</b> ${it.bucket === 'ok' ? 'ready, có storage_key' : (it.bucket === 'missing' ? 'không có hàng trong word_images' : it.bucket === 'error' ? 'failed' : 'đang xử lý')}${it.size ? ' · ' + num(Math.round(it.size / 1024)) + ' KB' : ''}${it.ctype ? ' · ' + esc(it.ctype) : ''}${it.errorText ? ' · lỗi: ' + esc(it.errorText) : ''}</div>
        <div><b>Kiểm tra R2:</b> ${v.v === 'stored' ? '✅ có tệp (HEAD ' + time(v.at) + ')' : v.v === 'gone' ? '⛔ không thấy tệp' : v.v === 'notready' ? 'chưa ở trạng thái ready' : v.v === 'norecord' ? 'chưa có bản ghi' : v.v === 'unknown' ? 'không kiểm tra được: ' + esc(v.reason || '') : 'chưa kiểm tra'}${v.warn ? ' — ' + esc(v.warn) : ''}</div>
        <div><b>Hiển thị trong UI:</b> ${v.display === true ? '✅ có' : v.display === false ? '⛔ không' : 'chưa kiểm tra'}</div>
        ${it.hasDup ? '<div><b>Nghi trùng nội dung với:</b> (xem cột Trùng với trong CSV)</div>' : ''}
        ${it.hasQc ? '<div><b>Cần xem lại:</b> xem cột “Cần xem lại” trong CSV.</div>' : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaVerifyList(['${hzAttr(hz)}'],'kiểm tra 1 từ')">🔍 Kiểm tra lại từ này</button>
        ${(v.v === 'gone' || v.display === false)
          ? `<button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="wiaRepair(['${hzAttr(hz)}'])">♻️ Xoá bản ghi lỗi để tạo lại</button>`
          : `<span style="font-size:.72rem;color:var(--muted);align-self:center;">Chỉ xoá được khi đã xác minh ảnh hỏng (không có tệp trên R2 hoặc không hiển thị được).</span>`}
      </div>
    </div>`;
    $('wia-detail').scrollIntoView({ block: 'nearest' });
  }

  // ── Bảng theo bài ──
  function wiaRenderLessons() {
    var rows = state.byLesson.map(function (c) {
      return `<tr style="border-top:1px solid var(--border);cursor:pointer;" onclick="wiaPickLesson(${c.key})">
        <td style="padding:5px 4px;"><b>Bài ${c.key}</b></td><td style="padding:5px 4px;">${num(c.total)}</td>
        <td style="padding:5px 4px;color:#1a7f45;">${num(c.ok)}</td>
        <td style="padding:5px 4px;color:#c0392b;">${num(c.missing)}</td>
        <td style="padding:5px 4px;color:#c0392b;">${num(c.error)}</td>
        <td style="padding:5px 4px;">${c.pctOk}%</td></tr>`;
    }).join('');
    $('wia-lessons').innerHTML = `<div class="panel-title" style="margin-top:14px;">📚 Theo bài học</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">Bấm 1 dòng để lọc bảng “Từng từ” theo bài đó. 1 từ có thể thuộc nhiều bài nên <b>không cộng dồn các dòng</b> để ra tổng hệ thống.</div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;">
        <thead><tr style="text-align:left;color:var(--muted);font-size:.72rem;"><th style="padding:4px;">Bài</th><th style="padding:4px;">Tổng</th><th style="padding:4px;">Có ảnh</th><th style="padding:4px;">Thiếu</th><th style="padding:4px;">Lỗi</th><th style="padding:4px;">Xong</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div style="font-size:.74rem;color:var(--muted);margin-top:6px;">⚡ <b>Ưu tiên đang đặt:</b> Bài ${PRIORITY_LESSONS.join(' → ')} (xong hẳn bài trước mới sang bài sau) → sửa ảnh lỗi → các bài còn lại (thiếu nhiều nhất trước).</div>`;
  }
  function wiaPickLesson(l) {
    state.filter.l = String(l); state.filter.st = ''; state.page = 0;
    wiaRenderTools(); wiaRenderWords();
    $('wia-words').scrollIntoView({ block: 'start' });
  }
  // ── Bảng theo nhãn ──
  function wiaRenderTags() {
    var rows = state.byTag.map(function (c) {
      return `<tr style="border-top:1px solid var(--border);"><td style="padding:5px 4px;">${esc(c.key)}</td><td style="padding:5px 4px;">${num(c.total)}</td>
        <td style="padding:5px 4px;color:#1a7f45;">${num(c.ok)}</td><td style="padding:5px 4px;color:#c0392b;">${num(c.missing)}</td><td style="padding:5px 4px;">${c.pctOk}%</td></tr>`;
    }).join('');
    $('wia-tags').innerHTML = `<div class="panel-title" style="margin-top:14px;">🏷 Theo nhãn hiện có</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">Chỉ dùng đúng các nhãn đang có trong database, không tạo/đổi tên nhãn. Một từ có thể mang nhiều nhãn → <b>không cộng số từ của các nhãn</b> để suy ra tổng hệ thống.</div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;">
        <thead><tr style="text-align:left;color:var(--muted);font-size:.72rem;"><th style="padding:4px;">Nhãn</th><th style="padding:4px;">Tổng</th><th style="padding:4px;">Có ảnh</th><th style="padding:4px;">Thiếu</th><th style="padding:4px;">Xong</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="padding:8px;text-align:center;color:var(--muted);">Chưa có nhãn nào trong database.</td></tr>'}</tbody></table></div>`;
  }

  // ── Kiểm tra R2 (theo lô) ──
  async function wiaVerifyList(hzList, label) {
    var list = hzList.filter(Boolean);
    if (!list.length) { wiaMsg('Không có từ nào để kiểm tra.'); return; }
    if (!state.configured) { wiaMsg('⚠️ R2 chưa cấu hình nên không kiểm tra được tệp.'); return; }
    busy(true); wiaMsg('Đang kiểm tra ' + list.length + ' từ trên R2…');
    var done = 0;
    for (var i = 0; i < list.length; i += VERIFY_CHUNK) {
      if (state.abort) { wiaMsg('Đã dừng ở ' + done + '/' + list.length + ' từ.'); break; }
      var chunk = list.slice(i, i + VERIFY_CHUNK);
      var d;
      try { d = await api('/api/admin/word-images/verify', { method: 'POST', body: { hz: chunk } }); }
      catch (e) { wiaMsg('❌ Lỗi mạng khi kiểm tra: ' + e.message); break; }
      if (!d || !d.ok) { wiaMsg('❌ ' + ((d && d.error) || 'Không kiểm tra được.')); break; }
      (d.results || []).forEach(function (r) { state.verify[r.hz] = Object.assign({ at: Date.now() }, r); });
      done += chunk.length;
      saveVerify();
      wiaProgress(done, list.length, label || 'Đang kiểm tra R2');
    }
    busy(false); state.abort = false;
    wiaRenderHead(); wiaRenderTools(); wiaRenderWords();
    var broken = Object.keys(state.verify).filter(function (k) { var v = state.verify[k]; return v.v === 'gone' || v.display === false; });
    wiaMsg(`Kiểm tra xong ${done}/${list.length} từ. Ảnh hỏng phát hiện: ${broken.length}.`);
  }
  function wiaVerifyPage() {
    var list = filtered().slice(state.page * PAGE, state.page * PAGE + PAGE).map(function (it) { return it.hz; });
    return wiaVerifyList(list, 'Kiểm tra R2 (trang đang xem)');
  }
  function wiaVerifyProblems() {
    var list = filtered().filter(function (it) { return it.bucket !== 'ok'; }).map(function (it) { return it.hz; });
    return wiaVerifyList(list, 'Kiểm tra R2 (từ thiếu/lỗi)');
  }
  function wiaVerifyAll() { return wiaVerifyList(state.items.map(function (it) { return it.hz; }), 'Kiểm tra lại toàn bộ'); }
  function wiaStop() { state.abort = true; wiaMsg('Đang dừng sau lô hiện tại…'); }
  function saveVerify() {
    var keys = Object.keys(state.verify);
    // tự bỏ URL đã hết hạn (>15 phút) để không hiện ảnh chết; vẫn giữ kết luận đã kiểm tra
    keys.forEach(function (k) { var v = state.verify[k]; if (v.url && Date.now() - (v.urlAt || v.at || 0) > 15 * 60 * 1000) { delete v.url; } if (v.url) v.urlAt = v.at; });
    lsSet(K_VER, state.verify);
  }

  // ── Tạo ảnh cho các từ đã chọn (KHÔNG tự chạy khi mở trang) ──
  async function wiaGenSelected() {
    var list = Array.from(state.sel);
    if (!list.length) { wiaMsg('Chưa chọn từ nào. Tick ở cột đầu bảng “Từng từ”.'); return; }
    if (!confirm('Tạo ảnh gợi nhớ cho ' + list.length + ' từ đã chọn?\nTừ nào đã có ảnh dùng được sẽ được BỎ QUA (không vẽ lại, không ghi đè).')) return;
    state.abort = false;
    await runChunks(list, 'Tạo ảnh cho từ đã chọn');
    await wiaLoad(true);
    wiaMsg('Xong lượt tạo ảnh cho từ đã chọn.');
  }

  // ── Hàng đợi ưu tiên (37 → 36 → 38 → ảnh lỗi → còn lại) ──
  async function wiaStartQueue() {
    if (state.running) return;
    if (!state.configured) { wiaMsg('⚠️ R2/CF_AI_TOKEN chưa cấu hình nên không tạo được ảnh.'); return; }
    await wiaLoad(true);
    var stages = A.buildStages(state.items, PRIORITY_LESSONS);
    if (!stages.length) { wiaMsg('Không còn từ nào thiếu ảnh hoặc lỗi ảnh.'); return; }
    var totalHz = stages.reduce(function (s, x) { return s + x.hz.length; }, 0);
    if (!confirm('Chạy hàng đợi ưu tiên cho ' + totalHz + ' từ, theo thứ tự:\n' + stages.slice(0, 6).map(function (s) { return '• ' + s.label + ' (' + s.hz.length + ' từ)'; }).join('\n') + (stages.length > 6 ? '\n• … ' + (stages.length - 6) + ' chặng nữa' : '') + '\n\nChạy theo lô, có thể dừng giữa chừng rồi bấm lại để chạy tiếp (không tạo trùng).')) return;
    state.running = true; state.abort = false;
    state.items0 = state.items.map(function (it) { return { hz: it.hz, vi: it.vi, lessons: it.lessons, bucket: it.bucket }; });
    state.report = { startedAt: Date.now(), total: totalHz, stopReason: '', stages: stages.map(function (s) { return { label: s.label, total: s.hz.length, done: 0 }; }) };
    saveRun(); wiaRenderQueue();
    var stopReason = await runStages(stages);
    state.running = false;
    await wiaLoad(true);
    var remaining = new Set(stages.reduce(function (a, s) { return a.concat(s.hz); }, []).filter(function (hz) {
      var it = state.byHz.get(hz); return it && it.bucket !== 'ok';
    }));
    state.report.stopReason = stopReason || ''; state.report.finishedAt = Date.now(); state.report.remaining = Array.from(remaining);
    saveRun(); wiaRenderQueue();
    wiaMsg(stopReason ? 'Đã dừng: ' + stopReason : 'Hàng đợi chạy xong.');
  }
  async function runStages(stages) {
    for (var si = 0; si < stages.length; si++) {
      var stage = stages[si];
      state.cur = si; state.abort = false; wiaRenderQueue();
      var noProgress = 0;
      for (var round = 0; round < MAX_ROUNDS; round++) {
        if (state.abort) return 'Người dùng dừng giữa chừng (bấm “Tiếp tục hàng đợi” để chạy tiếp)';
        await wiaLoad(true); // đối chiếu lại database: chỉ còn đúng những từ THẬT SỰ thiếu mới được xử lý
        var todo = stage.hz.filter(function (hz) { var it = state.byHz.get(hz); return it && (it.bucket === 'missing' || it.bucket === 'error'); });
        state.report.stages[si].done = stage.hz.length - todo.length;
        saveRun(); wiaRenderQueue();
        if (!todo.length) break;
        var chunk = todo.slice(0, GEN_CHUNK);
        var d;
        try { d = await api(GI, { method: 'POST', body: { hz: chunk } }); }
        catch (e) { return 'Lỗi mạng: ' + e.message; }
        if (!d || !d.ok) return 'Lỗi máy chủ: ' + ((d && d.error) || 'không rõ');
        if (d.notConfigured) return 'Thiếu cấu hình: ' + d.notConfigured.join(', ');
        if (d.quota) return 'Hết hạn mức Cloudflare hôm nay — chạy tiếp sau 07:00 giờ VN';
        // Xác minh thật cho đúng lô vừa chạy: DB → tệp R2 → URL → ảnh load được (không tin lời API tạo ảnh)
        await wiaLoad(true);
        var madeNow = [];
        chunk.forEach(function (hz) {
          var it = state.byHz.get(hz);
          var e = state.log[hz] || {};
          if (it && it.bucket === 'ok') { e.gen = true; madeNow.push(hz); }
          else { e.gen = false; e.reason = 'Chưa vẽ xong trong lượt này (hết thời gian hoặc lỗi)'; }
          state.log[hz] = e;
        });
        if (madeNow.length) {
          await wiaVerifyListQuiet(madeNow);
          await probeDisplay(madeNow);
        }
        saveRun(); wiaRenderHead(); wiaRenderQueue();
        if (!madeNow.length && !d.drafted) noProgress++; else noProgress = 0;
        if (noProgress >= 2) return 'Hai lượt liên tiếp không tạo thêm ảnh nào (dừng để tránh lặp vô ích)';
      }
    }
    return '';
  }
  // Kiểm tra R2 cho 1 lô nhỏ, không đụng thanh tiến độ chính (dùng trong hàng đợi)
  async function wiaVerifyListQuiet(hzList) {
    for (var i = 0; i < hzList.length; i += VERIFY_CHUNK) {
      var d = await api('/api/admin/word-images/verify', { method: 'POST', body: { hz: hzList.slice(i, i + VERIFY_CHUNK) } });
      if (!d || !d.ok) continue;
      (d.results || []).forEach(function (r) { state.verify[r.hz] = Object.assign({ at: Date.now() }, r); });
    }
    saveVerify();
  }
  // Mức ④: mở thật URL trong trình duyệt, chỉ tính "hiển thị OK" khi ảnh load xong.
  function probeDisplay(hzList) {
    var jobs = hzList.map(function (hz) {
      var v = state.verify[hz] || {};
      var e = state.log[hz] || {};
      if (!v.url) { e.r2 = v.v === 'stored'; e.show = false; state.log[hz] = e; return Promise.resolve(); }
      e.r2 = true;
      return new Promise(function (resolve) {
        var img = new Image(), t = setTimeout(function () { done(false, 'Quá 15 giây không load được ảnh'); }, 15000);
        function done(ok, why) { clearTimeout(t); img.onload = img.onerror = null; setDisplay(hz, ok); e.show = ok; if (!ok && why) { e.reason = why; state.verify[hz].reason = why; } state.log[hz] = e; resolve(); }
        img.onload = function () { done(true); };
        img.onerror = function () { done(false, 'Ảnh không hiển thị được (404/CORS)'); };
        img.crossOrigin = 'anonymous'; img.src = v.url;
      });
    });
    return Promise.all(jobs);
  }
  async function runChunks(hzList, label) {
    for (var i = 0; i < hzList.length; i += GEN_CHUNK) {
      if (state.abort) { wiaMsg('Đã dừng theo yêu cầu.'); break; }
      var chunk = hzList.slice(i, i + GEN_CHUNK);
      var d;
      try { d = await api(GI, { method: 'POST', body: { hz: chunk } }); }
      catch (e) { wiaMsg('❌ Lỗi mạng: ' + e.message); break; }
      if (!d || !d.ok) { wiaMsg('❌ ' + ((d && d.error) || 'Lỗi tạo ảnh.')); break; }
      if (d.notConfigured) { wiaMsg('❌ Thiếu cấu hình: ' + d.notConfigured.join(', ')); break; }
      if (d.quota) { wiaMsg('⏸️ Hết hạn mức Cloudflare hôm nay — chạy tiếp sau 07:00 giờ VN.'); break; }
      wiaProgress(i + chunk.length, hzList.length, label || 'Đang tạo ảnh');
    }
    busy(false); state.abort = false;
  }

  // ── Sửa ảnh hỏng: CHỈ xoá bản ghi đã xác minh là không dùng được (HEAD 404 hoặc ảnh không hiển thị) ──
  function brokenList() {
    return state.items.filter(function (it) {
      var v = state.verify[it.hz] || {};
      return it.bucket === 'ok' && (v.v === 'gone' || v.display === false);
    }).map(function (it) { return it.hz; });
  }
  async function wiaRepair(hzList) {
    var list = hzList || brokenList();
    if (!list.length) { wiaMsg('Chưa có ảnh nào được xác minh là hỏng. Bấm “🔍 Kiểm tra R2 (từ thiếu/lỗi)” trước.'); return; }
    if (!confirm('Xoá bản ghi của ' + list.length + ' từ đã xác minh là ảnh HỎNG (tệp không có trên R2 hoặc không hiển thị được).\nSau đó các từ này sẽ quay lại trạng thái “Thiếu ảnh” và nằm trong hàng đợi để tạo lại. Không ảnh hưởng ảnh đang dùng tốt.')) return;
    var d = await api('/api/admin/word-images/reset', { method: 'POST', body: { hz: list.slice(0, 100) } });
    if (!d || !d.ok) { wiaMsg('❌ ' + ((d && d.error) || 'Không xoá được.')); return; }
    list.slice(0, 100).forEach(function (hz) { delete state.verify[hz]; });
    saveVerify(); await wiaLoad(true);
    wiaMsg('Đã đưa ' + d.removed + ' từ vào hàng đợi tạo lại (bấm “🚀 Chạy hàng đợi ưu tiên”).');
  }

  // ── Khối hàng đợi + báo cáo ──
  function wiaRenderQueue() {
    var rep = state.report;
    var stagesTx = state.stages.map(function (s, i) {
      return `<div style="font-size:.8rem;padding:3px 0;${state.running && state.cur === i ? 'font-weight:700;' : 'color:var(--muted);'}">
        ${state.running && state.cur === i ? '▶️' : '•'} ${esc(s.label)} — ${num(s.hz.length)} từ</div>`;
    }).join('');
    var repHtml = '';
    if (rep) {
      var rows = A.runReport(state.items0, state.log, new Set(rep.remaining || [])).map(function (c) {
        return `<tr style="border-top:1px solid var(--border);"><td style="padding:4px;">Bài ${c.l || '—'}</td><td style="padding:4px;">${num(c.total)}</td>
          <td style="padding:4px;color:#1a7f45;">${num(c.okStart)}</td><td style="padding:4px;color:#c0392b;">${num(c.missingStart)}</td>
          <td style="padding:4px;">${num(c.created)}</td><td style="padding:4px;">${num(c.r2Ok)}</td><td style="padding:4px;">${num(c.showOk)}</td>
          <td style="padding:4px;color:#c0392b;">${num(c.genFail)}</td><td style="padding:4px;color:#c0392b;">${num(c.uploadFail)}</td>
          <td style="padding:4px;">${num(c.unprocessed)}</td></tr>`;
      }).join('');
      var unp = A.unprocessedList(state.items0, state.log, new Set(rep.remaining || []), rep.stopReason);
      repHtml = `<div style="margin-top:10px;">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:4px;">🧾 Báo cáo lượt chạy (bắt đầu ${time(rep.startedAt)}${rep.finishedAt ? ', kết thúc ' + time(rep.finishedAt) : ', đang chạy'})</div>
        ${rep.stopReason ? `<div style="font-size:.78rem;color:#c0392b;margin-bottom:6px;">Dừng: ${esc(rep.stopReason)}</div>` : ''}
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.74rem;">
          <thead><tr style="text-align:left;color:var(--muted);"><th style="padding:4px;">Bài</th><th style="padding:4px;">Tổng</th><th style="padding:4px;">Có ảnh</th><th style="padding:4px;">Thiếu</th><th style="padding:4px;">Đã tạo</th><th style="padding:4px;">Lên R2</th><th style="padding:4px;">Hiển thị</th><th style="padding:4px;">Lỗi tạo</th><th style="padding:4px;">Lỗi tải</th><th style="padding:4px;">Chưa xử lý</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        ${unp.length ? `<details style="margin-top:8px;"><summary style="font-size:.8rem;color:#c0392b;cursor:pointer;">⏳ ${num(unp.length)} từ chưa xử lý — xem danh sách và lý do</summary>
          <div style="max-height:240px;overflow:auto;font-size:.76rem;margin-top:6px;">
            ${unp.slice(0, 300).map(function (x) { return `<div style="padding:2px 0;border-bottom:1px solid var(--border);">${esc(x.hz)} <span style="color:var(--muted);">${esc(x.vi)} · Bài ${esc(x.lessons)}</span> — ${esc(x.reason)}</div>`; }).join('')}
            ${unp.length > 300 ? '<div style="padding:4px 0;color:var(--muted);">… còn ' + num(unp.length - 300) + ' từ nữa, tải CSV để xem hết.</div>' : ''}
          </div></details>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
          <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaSaveReportCsv()">⬇️ CSV báo cáo lượt chạy</button>
        </div>
      </div>`;
    }
    $('wia-queue').innerHTML = `<div class="panel-title" style="margin-top:14px;">🚀 Hàng đợi tạo ảnh theo ưu tiên</div>
      <div style="font-size:.74rem;color:var(--muted);line-height:1.5;margin-bottom:8px;">
        Thứ tự bắt buộc: <b>Bài ${PRIORITY_LESSONS.join(' → ')}</b> (chỉ sang bài sau khi bài trước hết từ thiếu) → <b>sửa ảnh lỗi</b> → <b>các bài còn lại</b>.
        Mỗi lô 15 từ, giữa các lô hệ thống đọc lại database nên <b>không tạo trùng</b> và tự bỏ qua từ vừa có ảnh. Tiến trình lưu trên máy này — dừng giữa chừng vẫn chạy tiếp được.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="wiaPreviewQueue()">👀 Xem trước thứ tự</button>
        <button class="btn btn-sm" id="wia-run-btn" style="background:var(--l11c);color:var(--l11a);" onclick="wiaStartQueue()">${state.running ? '⏳ Đang chạy…' : (state.report && state.report.remaining && state.report.remaining.length ? '▶️ Tiếp tục hàng đợi' : '🚀 Chạy hàng đợi ưu tiên')}</button>
        <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="wiaRepair()">♻️ Sửa ${num(brokenList().length)} ảnh hỏng đã xác minh</button>
      </div>
      <div id="wia-stages">${stagesTx}</div>${repHtml}`;
  }
  async function wiaPreviewQueue() {
    await wiaLoad(true);
    state.stages = A.buildStages(state.items, PRIORITY_LESSONS);
    $('wia-stages').innerHTML = state.stages.length
      ? state.stages.map(function (s) { return `<div style="font-size:.8rem;padding:3px 0;">• ${esc(s.label)} — ${num(s.hz.length)} từ</div>`; }).join('')
      : '<div style="font-size:.8rem;color:var(--muted);">Không còn từ nào thiếu/lỗi ảnh.</div>';
    wiaMsg('Xem trước thứ tự — chưa tạo ảnh nào.');
  }

  // ── Xuất CSV ──
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function stamp() { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
  function wiaSaveCsv(mode) {
    var list = mode === 'all' ? state.items : filtered();
    download('anh-goi-nho-' + mode + '-' + stamp() + '.csv', A.exportRows(list, state.verify, mode === 'all' ? 'all' : mode));
    wiaMsg('Đã xuất CSV (' + list.length + ' từ, mở được bằng Excel).');
  }
  function wiaSaveReportCsv() {
    var rep = state.report; if (!rep) return;
    var rows = A.runReport(state.items0, state.log, new Set(rep.remaining || []));
    var head = ['Bài', 'Tổng từ', 'Có ảnh (đầu lượt)', 'Thiếu (đầu lượt)', 'Đã tạo', 'Lên R2 OK', 'Hiển thị OK', 'Lỗi tạo', 'Lỗi tải lên', 'Chưa xử lý'];
    var body = rows.map(function (c) { return [c.l, c.total, c.okStart, c.missingStart, c.created, c.r2Ok, c.showOk, c.genFail, c.uploadFail, c.unprocessed]; });
    var unp = A.unprocessedList(state.items0, state.log, new Set(rep.remaining || []), rep.stopReason);
    var extra = [[''], ['Chưa xử lý'], ['Chữ Hán', 'Nghĩa', 'Bài', 'Lý do']].concat(unp.map(function (x) { return [x.hz, x.vi, x.lessons, x.reason]; }));
    download('bao-cao-anh-goi-nho-' + stamp() + '.csv', A.csv([head].concat(body, extra)));
    wiaMsg('Đã xuất CSV báo cáo lượt chạy.');
  }

  function wiaRenderAll() {
    state.stages = A.buildStages(state.items, PRIORITY_LESSONS);
    wiaRenderHead(); wiaRenderTools(); wiaRenderQueue(); wiaRenderWords(); wiaRenderLessons(); wiaRenderTags();
  }
  function saveRun() {
    lsSet(K_RUN, { log: state.log, report: state.report, items0: state.items0 });
  }
  async function wiaInit() {
    if (!A || !$('wia-head')) return;
    state.verify = lsGet(K_VER, {}) || {};
    var run = lsGet(K_RUN, null);
    if (run) { state.log = run.log || {}; state.report = run.report || null; state.items0 = run.items0 || []; }
    saveVerify(); // dọn URL đã hết hạn trước khi hiện
    await wiaLoad(false);
    if (state.report && state.report.remaining && state.report.remaining.length) {
      wiaMsg('Lượt chạy trước còn ' + state.report.remaining.length + ' từ chưa xong' + (state.report.stopReason ? ' (' + state.report.stopReason + ')' : '') + ' — bấm “▶️ Tiếp tục hàng đợi”.');
    }
  }

  g.wiaPanelHtml = wiaPanelHtml;
  g.wiaInit = wiaInit;
  g.wiaLoad = wiaLoad;
  g.wiaSetFilter = wiaSetFilter;
  g.wiaPage = wiaPage;
  g.wiaToggleSel = wiaToggleSel;
  g.wiaSelectVisible = wiaSelectVisible;
  g.wiaShown = wiaShown;
  g.wiaBroken = wiaBroken;
  g.wiaDetail = wiaDetail;
  g.wiaPickLesson = wiaPickLesson;
  g.wiaVerifyList = wiaVerifyList;
  g.wiaVerifyPage = wiaVerifyPage;
  g.wiaVerifyProblems = wiaVerifyProblems;
  g.wiaVerifyAll = wiaVerifyAll;
  g.wiaStop = wiaStop;
  g.wiaGenSelected = wiaGenSelected;
  g.wiaStartQueue = wiaStartQueue;
  g.wiaPreviewQueue = wiaPreviewQueue;
  g.wiaRepair = wiaRepair;
  g.wiaSaveCsv = wiaSaveCsv;
  g.wiaSaveReportCsv = wiaSaveReportCsv;
})(typeof window !== 'undefined' ? window : globalThis);
