// js/theme.js — Dark/light theme init + toggle (chạy đầu tiên, tránh chớp sai theme lúc tải trang)
// ════════════════════════════════════════════════════
// GIAO DIỆN: DARK MODE — hoàn toàn độc lập, không đụng tới logic nghiệp vụ bên dưới
// ════════════════════════════════════════════════════
(function initTheme() {
  // V155: giao diện SÁNG là mặc định. Lần đầu tải bản V155, bỏ lựa chọn "tối" cũ (kể cả bản đồng bộ từ tài khoản) — người dùng
  // vẫn bật lại được bằng nút chuyển giao diện (nút đó hoạt động như cũ).
  let saved = null;
  try {
    saved = localStorage.getItem('theme');
    if (!localStorage.getItem('theme_light_default_v155')) {
      localStorage.setItem('theme_light_default_v155', '1');
      localStorage.setItem('theme', 'light');
      saved = 'light';
      window.__forceLightOnce = true;
    }
  } catch (e) { /* localStorage bị chặn: dùng mặc định sáng */ }
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();
// Áp dụng theme (sáng/tối) vào cả DOM lẫn localStorage (localStorage vẫn giữ để tránh chớp sai
// theme lúc trang vừa tải xong, trước khi kịp lấy progressState.ui.theme từ DB/cache).
function applyTheme(theme) {
  if (window.__forceLightOnce && theme === 'dark') theme = 'light'; // V155: bỏ chọn tối cũ sau khi đồng bộ tài khoản
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', theme === 'dark' ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  window.__forceLightOnce = false; // người dùng tự chọn → tôn trọng lựa chọn
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  progressState.ui.theme = newTheme;
  cacheProgressLocally();
  scheduleSync();
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
});

