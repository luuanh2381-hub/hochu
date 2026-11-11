// js/study-workspace.js — V117: KHÔNG GIAN HỌC (Study Workspace) cho màn "Hôm nay học" (tab nội bộ 'review').
//
// Làm 4 việc, tất cả NẰM TRONG TRANG WEB (không gọi Fullscreen API, không đổi cỡ cửa sổ/zoom/thanh địa chỉ của trình duyệt):
//   1. 3 chế độ bố cục: 'standard' (như cũ) | 'focus' (tập trung) | 'max-space' (không gian tối đa). Chỉ là thuộc tính
//      data-sw-layout trên <body> + CSS; đổi chế độ KHÔNG vẽ lại câu hỏi nên không mất câu trả lời đang gõ/đang chọn.
//   2. Bảng cài đặt nhỏ: cỡ chữ Hán, cỡ/khoảng cách đáp án, pinyin/nghĩa/Hán Việt, tự phát âm, tốc độ tự chuyển câu,
//      chế độ "Kiểm tra trí nhớ thực sự", khôi phục mặc định.
//   3. Tạm dừng / tiếp tục: che câu hỏi (không dùng "tạm dừng" để nghĩ), không tính thời gian dừng vào thời gian trả lời,
//      không ghi nhận câu chưa trả lời là đúng hay sai (tạm dừng không gọi bất kỳ hàm ghi kết quả nào).
//   4. Bàn phím ảo (điện thoại): theo dõi visualViewport để vùng câu hỏi không bị che.
//
// CSS chỉ có hiệu lực khi <body> có class `sw-on` (đặt CHỈ khi đang ở tab 'review') → không ảnh hưởng các trang khác.
// Tuỳ chọn lưu bằng localStorage của thiết bị (không đụng progressState/FSRS/cơ sở dữ liệu).
//
// Hàm thuần (swNormalizePrefs, swAutoBaseMs, ...) không dùng DOM để kiểm thử trong Node.

const SW_KEY = 'swPrefs.v1';
const SW_LAYOUTS = ['standard', 'focus', 'max-space'];
const SW_DEFAULTS = { layout: 'standard', hz: 1, opt: 1, gap: 'normal', autoAudio: true, autoNext: 'normal', strict: false };
const SW_GAP_PX = { tight: 6, normal: 12, loose: 20 };
const SW_NEXT_MS = { fast: 1200, normal: 2000, slow: 3500 }; // thời gian đọc phản hồi trước khi TỰ chuyển câu (chỉ khi trả lời đúng)

function swNormalizePrefs(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    layout: SW_LAYOUTS.includes(r.layout) ? r.layout : SW_DEFAULTS.layout,
    hz: num(r.hz, 0.7, 1.8, SW_DEFAULTS.hz),
    opt: num(r.opt, 0.85, 1.6, SW_DEFAULTS.opt),
    gap: SW_GAP_PX[r.gap] ? r.gap : SW_DEFAULTS.gap,
    autoAudio: r.autoAudio === undefined ? SW_DEFAULTS.autoAudio : !!r.autoAudio,
    autoNext: SW_NEXT_MS[r.autoNext] ? r.autoNext : SW_DEFAULTS.autoNext,
    strict: !!r.strict,
  };
}
function swLoadPrefs() {
  try { return swNormalizePrefs(JSON.parse(localStorage.getItem(SW_KEY) || 'null')); } catch { return swNormalizePrefs(null); }
}
let swPrefs = swLoadPrefs();
function swSavePrefs() { try { localStorage.setItem(SW_KEY, JSON.stringify(swPrefs)); } catch {} }

function swAutoBaseMs(prefs) { return SW_NEXT_MS[(prefs || swPrefs).autoNext] || SW_NEXT_MS.normal; }
function swStrict() { return !!swPrefs.strict; }
function swAutoAudio() { return !!swPrefs.autoAudio; }
// Chuột + bàn phím vật lý → được phép tự đưa con trỏ vào ô nhập. Màn cảm ứng thì KHÔNG (tránh bàn phím ảo tự bật làm giật giao diện).
function swCanAutoFocus() {
  try { return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
}

// ── Trạng thái tạm dừng ─────────────────────────────────────────────────────────────────────────────────────
let swPaused = false, swPauseAt = 0, swPauseHidden0 = 0, swPanelOpen = false;
function swIsPaused() { return swPaused; }

// Giữ lại nội dung ô nhập tự gõ khi một thao tác bắt buộc vẽ lại câu hỏi (bật/tắt pinyin, chế độ kiểm tra...).
function swKeepTyped(fn) {
  const before = (typeof document !== 'undefined') ? document.getElementById('rv-typed') : null;
  const val = before ? before.value : null, hadFocus = !!before && document.activeElement === before;
  fn();
  const after = document.getElementById('rv-typed');
  if (after && val !== null) { after.value = val; if (hadFocus) { try { after.focus(); } catch {} } }
}

// ── Áp dụng giao diện ──────────────────────────────────────────────────────────────────────────────────────
function swApply() {
  if (typeof document === 'undefined') return;
  const b = document.body;
  b.dataset.swLayout = swPrefs.layout;
  b.style.setProperty('--sw-hz', String(swPrefs.hz));
  b.style.setProperty('--sw-opt', String(swPrefs.opt));
  b.style.setProperty('--sw-gap', SW_GAP_PX[swPrefs.gap] + 'px');
}
function swClear() {
  if (typeof document === 'undefined') return;
  const b = document.body;
  b.classList.remove('sw-on');
  delete b.dataset.swLayout;
  ['--sw-hz', '--sw-opt', '--sw-gap'].forEach(k => b.style.removeProperty(k));
  const bar = document.getElementById('sw-bar'); if (bar) bar.remove();
  const pn = document.getElementById('sw-panel'); if (pn) pn.remove();
  const pz = document.getElementById('sw-pause'); if (pz) pz.remove();
  swPaused = false; swPanelOpen = false;
}

// Gọi từ render() mỗi lần vẽ: idempotent, rẻ.
function swSync() {
  if (typeof document === 'undefined' || !document.body) return;
  const on = (typeof currentTab !== 'undefined') && currentTab === 'review';
  if (!on) { if (document.body.classList.contains('sw-on')) swClear(); return; }
  document.body.classList.add('sw-on');
  swApply();
  swEnsureBar();
  swUpdateBar();
}

// Nút điều khiển thu gọn đặt TRONG hàng đầu của khung học (chỉ hiện ở chế độ Tập trung / Tối đa — CSS quyết định).
function swHeadActionsHtml() {
  return `<button type="button" class="sw-ib" onclick="swPause()" title="Tạm dừng" aria-label="Tạm dừng">⏸</button>`
    + `<button type="button" class="sw-ib" onclick="swTogglePanel()" title="Cài đặt khu vực học" aria-label="Cài đặt khu vực học">⚙️</button>`
    + `<button type="button" class="sw-ib" onclick="swSetLayout('standard')" title="Thoát chế độ này (Esc)" aria-label="Thoát chế độ này">✕</button>`;
}

function swSessionRunning() {
  return typeof rvQueue !== 'undefined' && rvQueue.items.length > 0 && rvStage === 'run';
}

function swEnsureBar() {
  let bar = document.getElementById('sw-bar');
  if (bar) return bar;
  const content = document.getElementById('content');
  if (!content || !content.parentNode) return null;
  bar = document.createElement('div');
  bar.id = 'sw-bar'; bar.className = 'sw-bar';
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Điều khiển phiên học');
  bar.innerHTML = `
    <div class="sw-seg" role="group" aria-label="Chế độ giao diện">
      <button type="button" data-l="standard" onclick="swSetLayout('standard')" title="Tiêu chuẩn: giữ giao diện thông thường">▭<span> Tiêu chuẩn</span></button>
      <button type="button" data-l="focus" onclick="swSetLayout('focus')" title="Tập trung: ẩn điều hướng, chữ to hơn">◎<span> Tập trung</span></button>
      <button type="button" data-l="max-space" onclick="swSetLayout('max-space')" title="Không gian tối đa: dùng gần hết vùng nội dung">⤢<span> Tối đa</span></button>
    </div>
    <div class="sw-actions">
      <button type="button" id="sw-pause-btn" class="sw-btn" onclick="swPause()" title="Tạm dừng" aria-label="Tạm dừng">⏸<span> Tạm dừng</span></button>
      <button type="button" id="sw-set-btn" class="sw-btn" onclick="swTogglePanel()" aria-expanded="false" aria-controls="sw-panel" title="Cài đặt khu vực học" aria-label="Cài đặt khu vực học">⚙️<span> Cài đặt</span></button>
      <button type="button" id="sw-exit-btn" class="sw-btn sw-exit" onclick="swSetLayout('standard')" title="Thoát chế độ này (phím Esc)" aria-label="Thoát chế độ này">✕<span> Thoát chế độ</span></button>
    </div>`;
  content.parentNode.insertBefore(bar, content);
  return bar;
}
function swUpdateBar() {
  const bar = document.getElementById('sw-bar'); if (!bar) return;
  bar.querySelectorAll('.sw-seg button').forEach(btn => {
    const active = btn.dataset.l === swPrefs.layout;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const pz = document.getElementById('sw-pause-btn'); if (pz) pz.style.display = swSessionRunning() ? '' : 'none';
  const ex = document.getElementById('sw-exit-btn'); if (ex) ex.style.display = swPrefs.layout === 'standard' ? 'none' : '';
  const st = document.getElementById('sw-set-btn'); if (st) st.setAttribute('aria-expanded', swPanelOpen ? 'true' : 'false');
}

// Đổi chế độ bố cục: KHÔNG gọi render() → câu hỏi đang làm, ô đang gõ, lựa chọn đang chọn đều giữ nguyên.
function swSetLayout(l) {
  if (!SW_LAYOUTS.includes(l)) return;
  swPrefs.layout = l; swSavePrefs();
  swApply(); swUpdateBar();
  swRenderPanel();
  if (l === 'standard' && typeof window !== 'undefined') window.scrollTo(0, 0);
  const typed = document.getElementById('rv-typed');
  if (typed && document.activeElement === typed) { try { typed.scrollIntoView({ block: 'center' }); } catch {} }
}
function swSetPref(key, value) {
  swPrefs = swNormalizePrefs(Object.assign({}, swPrefs, { [key]: value }));
  swSavePrefs(); swApply();
}
function swResetPrefs() {
  swPrefs = swNormalizePrefs(null); swSavePrefs(); swApply(); swUpdateBar();
  // Các cờ hiển thị dùng chung (⚙️ Hiển thị) cũng về mặc định = hiện hết.
  swKeepTyped(() => {
    if (typeof showPinyin !== 'undefined' && !showPinyin) togglePinyin();
    if (typeof showMeaning !== 'undefined' && !showMeaning) toggleMeaning();
    if (typeof showHanViet !== 'undefined' && !showHanViet) toggleHanViet();
    if (typeof render === 'function') render();
  });
  swRenderPanel();
}

// ── Bảng cài đặt ───────────────────────────────────────────────────────────────────────────────────────────
function swTogglePanel() { swPanelOpen ? swClosePanel() : swOpenPanel(); }
function swOpenPanel() {
  swPanelOpen = true;
  let pn = document.getElementById('sw-panel');
  if (!pn) {
    pn = document.createElement('div');
    pn.id = 'sw-panel'; pn.className = 'sw-panel'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'Cài đặt khu vực học');
    const bar = document.getElementById('sw-bar');
    if (bar && bar.parentNode) bar.parentNode.insertBefore(pn, bar.nextSibling); else document.body.appendChild(pn);
  }
  swRenderPanel(); swUpdateBar();
}
function swClosePanel() {
  swPanelOpen = false;
  const pn = document.getElementById('sw-panel'); if (pn) pn.remove();
  swUpdateBar();
}
function swSwitchRow(id, label, on, handler, hint) {
  return `<label class="sw-row"><span class="sw-row-l">${label}${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" id="${id}" ${on ? 'checked' : ''} onchange="${handler}"></label>`;
}
function swSegRow(label, key, items, cur) {
  return `<div class="sw-row"><span class="sw-row-l">${label}</span><span class="sw-mini">${items.map(([v, t]) =>
    `<button type="button" class="${v === cur ? 'active' : ''}" onclick="swChoose('${key}','${v}')">${t}</button>`).join('')}</span></div>`;
}
function swChoose(key, v) { swSetPref(key, v); swRenderPanel(); }
function swToggleStrict(on) { swSetPref('strict', !!on); swKeepTyped(() => { if (typeof render === 'function') render(); }); swRenderPanel(); }
function swToggleDisplay(which) {
  swKeepTyped(() => { if (which === 'py') togglePinyin(); else if (which === 'vi') toggleMeaning(); else toggleHanViet(); });
  swRenderPanel();
}
function swRenderPanel() {
  const pn = document.getElementById('sw-panel'); if (!pn) return;
  const sp = (typeof showPinyin !== 'undefined') ? showPinyin : true, sm = (typeof showMeaning !== 'undefined') ? showMeaning : true, sh = (typeof showHanViet !== 'undefined') ? showHanViet : true;
  pn.innerHTML = `
    <div class="sw-panel-head"><b>Cài đặt khu vực học</b><button type="button" class="sw-x" onclick="swClosePanel()" aria-label="Đóng">✕</button></div>
    <div class="sw-row"><span class="sw-row-l">Chế độ giao diện</span><span class="sw-mini">${[['standard', '▭ Chuẩn'], ['focus', '◎ Tập trung'], ['max-space', '⤢ Tối đa']].map(([v, t]) =>
      `<button type="button" class="${v === swPrefs.layout ? 'active' : ''}" onclick="swSetLayout('${v}');swRenderPanel()">${t}</button>`).join('')}</span></div>
    <div class="sw-row"><span class="sw-row-l">Cỡ chữ Hán</span><input type="range" min="0.7" max="1.8" step="0.1" value="${swPrefs.hz}" oninput="swSetPref('hz', this.value)" aria-label="Cỡ chữ Hán"></div>
    <div class="sw-row"><span class="sw-row-l">Cỡ đáp án</span><input type="range" min="0.85" max="1.6" step="0.05" value="${swPrefs.opt}" oninput="swSetPref('opt', this.value)" aria-label="Cỡ đáp án"></div>
    ${swSegRow('Khoảng cách đáp án', 'gap', [['tight', 'Gọn'], ['normal', 'Vừa'], ['loose', 'Rộng']], swPrefs.gap)}
    ${swSwitchRow('sw-cb-py', 'Hiện Pinyin ở đề', sp, "swToggleDisplay('py')", 'Đề chọn pinyin luôn tự ẩn pinyin để không lộ đáp án')}
    ${swSwitchRow('sw-cb-vi', 'Hiện nghĩa ở màn đáp án', sm, "swToggleDisplay('vi')")}
    ${swSwitchRow('sw-cb-hv', 'Hiện Hán Việt', sh, "swToggleDisplay('hv')")}
    ${swSwitchRow('sw-cb-au', 'Tự phát âm', swPrefs.autoAudio, "swSetPref('autoAudio', this.checked)", 'Câu nghe vẫn có nút 🔊 để nghe lại')}
    ${swSegRow('Tự chuyển câu (khi đúng)', 'autoNext', [['fast', 'Nhanh'], ['normal', 'Vừa'], ['slow', 'Chậm']], swPrefs.autoNext)}
    <div class="sw-sep"></div>
    ${swSwitchRow('sw-cb-strict', '🧪 Kiểm tra trí nhớ thực sự', swPrefs.strict, 'swToggleStrict(this.checked)', 'Ít gợi ý: không hiện pinyin ở đề khi không kiểm tra pinyin; không tự phát âm trừ câu nghe; ghi rõ câu đúng nhờ gợi ý')}
    <button type="button" class="sw-reset" onclick="swResetPrefs()">↺ Khôi phục mặc định</button>`;
}

// ── Tạm dừng / tiếp tục ───────────────────────────────────────────────────────────────────────────────────
function swPause() {
  if (swPaused || !swSessionRunning() || typeof document === 'undefined') return;
  swPaused = true; swPauseAt = performance.now();
  swPauseHidden0 = (typeof vtHiddenMs === 'function') ? vtHiddenMs() : 0;
  if (typeof rvClearCountdown === 'function') rvClearCountdown();     // dừng đếm ngược tự chọn rating/tự chuyển câu
  if (typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); } catch {} }
  swClosePanel();
  // Lưu hàng đợi hiện tại: nếu đóng trang khi đang dừng, "Học tiếp" khôi phục đúng chỗ. Không ghi bất kỳ kết quả câu hỏi nào.
  try { if (!rvQueue.practiceOnly) sqPersist(rvStorageMode(), rvQueue, { summary: rvSummary, log: rvLog }); } catch {}
  const pz = document.createElement('div');
  pz.id = 'sw-pause'; pz.className = 'sw-pause'; pz.setAttribute('role', 'dialog'); pz.setAttribute('aria-modal', 'true'); pz.setAttribute('aria-label', 'Đã tạm dừng');
  pz.innerHTML = `<div class="sw-pause-box">
    <div class="sw-pause-ic">⏸</div>
    <div class="sw-pause-t">Đã tạm dừng</div>
    <div class="sw-pause-s">Câu hỏi được ẩn. Thời gian dừng không tính vào thời gian trả lời; câu chưa trả lời không bị tính đúng hay sai.</div>
    <button type="button" class="btn btn-primary" onclick="swResume()">▶ Tiếp tục</button>
    <button type="button" class="btn" style="background:var(--border)" onclick="swExitSession()">Thoát về Hôm nay học</button>
  </div>`;
  document.body.appendChild(pz);
  const first = pz.querySelector('button'); if (first) { try { first.focus(); } catch {} }
}
function swResume() {
  if (!swPaused) return;
  const now = performance.now();
  const hiddenDelta = (typeof vtHiddenMs === 'function') ? Math.max(0, vtHiddenMs() - swPauseHidden0) : 0;
  const pausedMs = Math.max(0, (now - swPauseAt) - hiddenDelta);
  if (typeof rvStartedAt !== 'undefined') rvStartedAt += pausedMs;   // thời gian dừng KHÔNG tính vào responseTimeMs
  swPaused = false;
  const pz = document.getElementById('sw-pause'); if (pz) pz.remove();
  // Đang ở màn đáp án chờ tự chuyển: chạy lại đếm ngược từ đầu (người học chưa kịp đọc phản hồi).
  if (typeof rvPhase !== 'undefined' && rvPhase === 'answered' && rvRatingPhase === 'pending' && rvShouldAutoCommit()) rvStartCountdown(rvAttemptId);
  const typed = document.getElementById('rv-typed'); if (typed && swCanAutoFocus()) { try { typed.focus(); } catch {} }
}
function swExitSession() {
  const pz = document.getElementById('sw-pause'); if (pz) pz.remove();
  swPaused = false;
  goTab('today');
}

// ── Âm thanh có trạng thái (câu nghe) ────────────────────────────────────────────────────────────────────────
// Phát 1 lần + báo trạng thái: 'playing' | 'done' | 'blocked'. Không bao giờ tự phát lặp. Trình duyệt chặn/không có giọng đọc → 'blocked'
// (người học vẫn bấm 🔊 được). Đếm số lần nghe trong câu hiện tại.
let swPlays = 0, swAudioKey = null, swPlayToken = 0;
function swAudioStatusEl() { return (typeof document !== 'undefined') ? document.getElementById('rv-audio-status') : null; }
function swSetAudioStatus(state) {
  const el = swAudioStatusEl(); if (!el) return;
  const msg = { idle: 'Chưa phát — bấm 🔊 để nghe', playing: '🔊 Đang phát...', done: `✓ Đã nghe ${swPlays} lần — bấm 🔊 để nghe lại`, blocked: '⚠️ Trình duyệt chưa phát được âm thanh — bấm 🔊 để thử lại' };
  el.textContent = msg[state] || msg.idle; el.dataset.state = state;
}
function swPlayTracked(text) {
  if (typeof speak !== 'function' || typeof window === 'undefined' || !('speechSynthesis' in window)) { swSetAudioStatus('blocked'); return; }
  const token = ++swPlayToken; // lần phát mới huỷ lần cũ → sự kiện "bị ngắt" của lần cũ không làm sai trạng thái
  swPlays++; swSetAudioStatus('playing');
  let started = false;
  const timer = setTimeout(() => { if (token === swPlayToken && !started) swSetAudioStatus('blocked'); }, 1800);
  speak(text, {
    start: () => { if (token !== swPlayToken) return; started = true; clearTimeout(timer); swSetAudioStatus('playing'); },
    end: () => { if (token !== swPlayToken) return; started = true; clearTimeout(timer); swSetAudioStatus('done'); },
    error: () => { if (token !== swPlayToken) return; clearTimeout(timer); swSetAudioStatus(started ? 'done' : 'blocked'); },
  });
}
// Tự phát ĐÚNG MỘT lần cho mỗi câu (render lại do đổi cài đặt không phát lại). `force` = nội dung kiểm tra chính là âm thanh.
function swAutoplayOnce(key, text, isTestedAudio) {
  if (swAudioKey === key) return;
  swAudioKey = key; swPlays = 0;
  if (!swAutoAudio()) { swSetAudioStatus('idle'); return; }
  if (swStrict() && !isTestedAudio) return;
  setTimeout(() => { if (swAudioKey === key && !swPaused) swPlayTracked(text); }, 400);
}
// Phát âm sau khi trả lời (củng cố). Tôn trọng cài đặt "Tự phát âm".
function swSpeakAfterAnswer(text) { if (swAutoAudio() && typeof speak === 'function') speak(text); }

// ── Phím tắt + bàn phím ảo ──────────────────────────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => {
    if (typeof currentTab === 'undefined' || currentTab !== 'review') return;
    if (e.key === 'Escape') {
      if (swPaused) { swResume(); return; }
      if (swPanelOpen) { swClosePanel(); return; }
      if (swPrefs.layout !== 'standard') swSetLayout('standard');
    }
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (currentTab === 'review' && t && t.id === 'rv-typed') setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 250);
  });
}
// Bàn phím ảo làm vùng nhìn thấy thấp đi → --sw-vh để vùng câu hỏi co theo, không bị che nút "Kiểm tra".
if (typeof window !== 'undefined' && window.visualViewport) {
  const upd = () => { try { document.documentElement.style.setProperty('--sw-vh', Math.round(window.visualViewport.height) + 'px'); } catch {} };
  window.visualViewport.addEventListener('resize', upd); upd();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { SW_DEFAULTS, SW_LAYOUTS, SW_NEXT_MS, swNormalizePrefs, swAutoBaseMs };
