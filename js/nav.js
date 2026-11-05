// js/nav.js — V116: ĐIỀU HƯỚNG GỌN. Thay thanh tab cuộn ngang 10 mục + header 3 hàng bằng:
//   • Thanh dưới 4 mục: 🏠 Trang chủ · 🎯 Học · 📊 Tiến bộ · ⋯ Thêm
//   • Hàng chip phụ (#subnav) chuyển giữa các màn trong cùng nhóm (Học: Hôm nay/Flashcard/Trắc nghiệm/Gõ chữ/Nghe; Tiến bộ: Thống kê/Năng lực/Từ khó)
//   • Bảng "Thêm" (So sánh, và Quản trị/Từ vựng cho admin) + bảng "⚙️ Hiển thị" (giao diện sáng/tối, tốc độ đọc, ẩn/hiện Pinyin–nghĩa–Hán Việt)
// KHÔNG đổi tên tab nội bộ: goTab('flash'|'quiz'|...) và mọi logic học giữ nguyên; chỉ đổi cách người dùng tới được các màn đó.
// Các id cũ (tab-home, tab-today, tab-admin, tab-vocab, py-toggle-btn, speed-slider, theme-toggle-btn...) được GIỮ để code cũ chạy tiếp.

const NAV_GROUPS = {
  home: ['home'],
  learn: ['today', 'review', 'flash', 'quiz', 'type', 'listen'],
  progress: ['stats', 'skills', 'difficult'],
  more: ['compare', 'aibank', 'ttsfix', 'admin', 'vocab'],
};
const NAV_BTN_ID = { home: 'tab-home', learn: 'tab-today', progress: 'tab-progress', more: 'tab-more' };
// Chip phụ. 'review' (đang trong phiên học) cố ý KHÔNG có chip để giữ màn học gọn.
const NAV_CHIPS = {
  learn: [['today', '🎯 Hôm nay'], ['flash', '📖 Flashcard'], ['quiz', '📝 Trắc nghiệm'], ['type', '⌨️ Gõ chữ'], ['listen', '🎧 Nghe']],
  progress: [['stats', '📊 Thống kê'], ['skills', '📈 Năng lực'], ['difficult', '😓 Từ khó']],
};
let navLastProgress = 'stats'; // lần sau bấm "Tiến bộ" quay lại đúng màn đã xem gần nhất

function navGroupOf(tab) {
  for (const g of Object.keys(NAV_GROUPS)) if (NAV_GROUPS[g].includes(tab)) return g;
  return null;
}

function navChipsHtml(tab) {
  const g = navGroupOf(tab), chips = NAV_CHIPS[g];
  if (!chips || tab === 'review') return '';
  return chips.map(([t, label]) =>
    `<button class="nav-chip${t === tab ? ' active' : ''}" onclick="goTab('${t}')"${t === tab ? ' aria-current="page"' : ''}>${label}</button>`).join('');
}

// Gọi từ goTab / ssSetActiveTabUI / khôi phục sau đăng nhập (thay cho 3 đoạn tự gắn class active theo id 'tab-'+tab).
function navMarkActive(tab) {
  if (typeof document === 'undefined') return;
  const g = navGroupOf(tab);
  if (g === 'progress') navLastProgress = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
  const btn = g && document.getElementById(NAV_BTN_ID[g]);
  if (btn) btn.classList.add('active');
  navRenderSubnav(tab);
}
function navHighlight(tab) {
  if (typeof document === 'undefined') return;
  navMarkActive(tab);
  navCloseOverlays();
}

function navRenderSubnav(tab) {
  const el = typeof document !== 'undefined' && document.getElementById('subnav');
  if (!el) return;
  const html = navChipsHtml(tab);
  el.innerHTML = html;
  el.style.display = html ? 'flex' : 'none';
}

function navGoProgress() { goTab(navLastProgress || 'stats'); }

// ── Bảng "Thêm" ─────────────────────────────────────────────────────────
function navCloseMore() {
  const s = document.getElementById('more-sheet'); if (s) s.style.display = 'none';
  const b = document.getElementById('tab-more'); if (b) b.setAttribute('aria-expanded', 'false');
}
function navToggleMore() {
  const s = document.getElementById('more-sheet'); if (!s) return;
  const open = s.style.display === 'none' || s.style.display === '';
  navCloseDisplay();
  s.style.display = open ? 'block' : 'none';
  const b = document.getElementById('tab-more'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ── Bảng "⚙️ Hiển thị" ──────────────────────────────────────────────────
function navCloseDisplay() {
  const p = document.getElementById('display-panel'); if (p) p.style.display = 'none';
  const b = document.getElementById('display-btn'); if (b) b.setAttribute('aria-expanded', 'false');
}
function navToggleDisplay() {
  const p = document.getElementById('display-panel'); if (!p) return;
  const open = p.style.display === 'none' || p.style.display === '';
  navCloseMore();
  p.style.display = open ? 'block' : 'none';
  const b = document.getElementById('display-btn'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function navCloseOverlays() { if (typeof document === 'undefined') return; navCloseMore(); navCloseDisplay(); }

// Chấm nhỏ trên ⚙️ khi đang ẨN bớt thứ gì (Pinyin/nghĩa/Hán Việt) — để người học hiểu vì sao thẻ thiếu chữ, khỏi phải mở bảng ra mới biết.
function navHiddenCount() {
  return (typeof showPinyin !== 'undefined' && !showPinyin ? 1 : 0)
       + (typeof showMeaning !== 'undefined' && !showMeaning ? 1 : 0)
       + (typeof showHanViet !== 'undefined' && !showHanViet ? 1 : 0);
}
function navSyncUI() {
  if (typeof document === 'undefined') return;
  const dot = document.getElementById('display-dot'), n = navHiddenCount();
  if (dot) { dot.style.display = n ? 'inline-block' : 'none'; }
  const btn = document.getElementById('display-btn');
  if (btn) btn.title = n ? `Hiển thị (đang ẩn ${n} mục)` : 'Hiển thị';
  // render() có thể được gọi sau khi đổi currentTab mà KHÔNG qua goTab (vd. vào phiên học 'review') → đồng bộ lại mục đang chọn + chip phụ.
  if (typeof currentTab !== 'undefined') navMarkActive(currentTab);
}

// Chạm ra ngoài thì đóng bảng; bấm nút trong bảng "Hiển thị" xong cập nhật chấm.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    if (!t.closest('#display-panel, #display-btn')) navCloseDisplay();
    if (!t.closest('#more-sheet, #tab-more')) navCloseMore();
    if (t.closest('#display-panel')) setTimeout(navSyncUI, 0);
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { NAV_GROUPS, NAV_CHIPS, NAV_BTN_ID, navGroupOf, navChipsHtml, navHiddenCount };
