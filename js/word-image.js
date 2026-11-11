// js/word-image.js — V142: hiện ẢNH GỢI NHỚ của từ (sinh nền bằng Cloudflare FLUX.1 schnell, lưu R2).
// V143: ảnh nằm NGAY trong thẻ học (không còn mục gập phải chạm mới thấy) — chạm ảnh để xem lớn.
// Dùng: wiSlot(hz) trả về 1 ô giữ chỗ (chuỗi HTML); sau khi gán innerHTML gọi wiMount(phầnTửCha).
// Chưa có ảnh / chưa đăng nhập / lỗi mạng → ô giữ chỗ tự biến mất, KHÔNG báo lỗi, KHÔNG chặn thẻ học,
// KHÔNG để lại khoảng trống (ô rỗng bị xoá khỏi DOM, không giữ chiều cao).
(function (g) {
  'use strict';
  var TTL_MS = 15 * 60 * 1000; // URL ký sẵn sống 20 phút trên server → cache client 15 phút
  var cache = new Map();       // hz → { at, data }
  var inflight = new Map();    // hz → Promise (gộp các lần hỏi trùng)
  var HZ_RE = /^[\u4e00-\u9fff]{1,8}$/;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function wiSlot(hz) {
    return HZ_RE.test(String(hz || '')) ? '<div class="wi-slot" data-hz="' + esc(hz) + '"></div>' : '';
  }
  function headers() {
    try { return typeof g.authHeaders === 'function' ? g.authHeaders() : {}; } catch (e) { return {}; }
  }
  function fetchImage(hz) {
    var hit = cache.get(hz);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data);
    if (inflight.has(hz)) return inflight.get(hz);
    var p = g.fetch('/api/word-image?hz=' + encodeURIComponent(hz), { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.ok) cache.set(hz, { at: Date.now(), data: data });
        return data && data.ok ? data : null;
      })
      .catch(function () { return null; })
      .then(function (data) { inflight.delete(hz); return data; });
    inflight.set(hz, p);
    return p;
  }
  function render(el, data) {
    if (!el || !el.isConnected) return;
    if (!data || data.status !== 'ready' || !data.url) {
      // Chưa có ảnh: quản trị viên thấy nút tạo ngay tại thẻ; người học thường thì ô biến mất.
      if (isAdmin()) renderCreate(el, data && data.status === 'pending'); else el.remove();
      return;
    }
    var story = data.story ? '<div class="wi-story">' + esc(data.story) + '</div>' : '';
    // V143: ảnh hiển thị NGAY giữa thẻ học. Bọc trong <button> để bàn phím cũng mở được ảnh lớn
    // (thẻ <button> của trình duyệt tự nhận Enter/Space). loading=lazy vẫn giữ: ảnh chỉ tải khi thật
    // sự vào vùng nhìn → các thẻ đã bị cuộn qua/vượt qua không tốn băng thông.
    el.innerHTML = '<div class="wi-wrap" onclick="event.stopPropagation()">' +
      '<button type="button" class="wi-imgbtn" aria-label="Xem ảnh gợi nhớ lớn hơn" onclick="wiZoom(this.firstChild)">' +
      // crossorigin: site bật COEP require-corp → ảnh R2 (khác origin) chỉ tải được ở chế độ CORS (cần CORS bucket R2)
      '<img class="wi-img" loading="lazy" decoding="async" crossorigin="anonymous" alt="Hình gợi nhớ" src="' + esc(data.url) + '" onerror="this.closest(\'.wi-slot\').remove()">' +
      '</button>' + story + '</div>';
  }
  // Xem ảnh lớn: dùng lại URL đã ký sẵn của ảnh trong thẻ (không gọi thêm API, không tải lại ảnh).
  function wiZoom(img) {
    if (!g.document || !img) return;
    var ov = g.document.getElementById('wi-zoom');
    if (!ov) {
      ov = g.document.createElement('div');
      ov.id = 'wi-zoom'; ov.className = 'wi-zoom';
      ov.addEventListener('click', function () { ov.className = 'wi-zoom'; });
      g.document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ov.className = 'wi-zoom'; });
      g.document.body.appendChild(ov);
    }
    ov.innerHTML = '<img src="' + esc(img.getAttribute('src')) + '" alt="Hình gợi nhớ">';
    ov.className = 'wi-zoom on';
  }
  // Tải trước ảnh của thẻ KẾ TIẾP (dùng chung cache 15 phút + gộp request trùng) → mở thẻ sau là ảnh có ngay.
  function wiPrefetch(hz) {
    if (!g.document || typeof g.fetch !== 'function') return;
    if (!HZ_RE.test(String(hz || '')) || !headers().Authorization) return;
    fetchImage(hz);
  }
  function isAdmin() {
    try { return typeof g.isAdminRole === 'function' && g.isAdminRole(); } catch (e) { return false; }
  }
  function renderCreate(el, pending) {
    var hz = el.getAttribute('data-hz');
    el.innerHTML = '<div class="wi-wrap"><button type="button" class="wi-create">🖼️ ' +
      (pending ? 'Vẽ ảnh gợi nhớ (đã soạn, chờ vẽ)' : 'Tạo ảnh gợi nhớ') + '</button><div class="wi-msg"></div></div>';
    var btn = el.querySelector('.wi-create'), msg = el.querySelector('.wi-msg');
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      btn.disabled = true; btn.textContent = '⏳ Đang tạo… (tối đa ~50 giây)'; msg.textContent = '';
      g.fetch('/api/admin/word-images/generate', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ hz: [hz] })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'Lỗi tạo ảnh');
        if (d.notConfigured) throw new Error('Thiếu cấu hình: ' + d.notConfigured.join(', '));
        if (d.quota) throw new Error('Hết hạn mức Cloudflare hôm nay, thử lại sau 07:00 (giờ VN)');
        cache.delete(hz);
        return fetchImage(hz).then(function (data) {
          if (data && data.status === 'ready') render(el, data);
          else throw new Error((d.errorSamples && d.errorSamples[0]) || 'Chưa vẽ xong, bấm lại để thử tiếp');
        });
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '🖼️ Thử tạo lại';
        msg.textContent = String(e && e.message || e);
      });
    });
  }
  function wiMount(root) {
    if (!g.document || typeof g.fetch !== 'function') return;
    // authToken khai báo bằng `let` trong auth.js nên KHÔNG nằm trên window → kiểm tra qua authHeaders()
    var logged = !!headers().Authorization;
    var scope = root || g.document;
    var slots = scope.querySelectorAll('.wi-slot:not([data-wi])');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      el.setAttribute('data-wi', '1');
      if (!logged) { el.remove(); continue; }
      (function (slotEl) {
        fetchImage(slotEl.getAttribute('data-hz')).then(function (data) { render(slotEl, data); });
      })(el);
    }
  }
  g.wiSlot = wiSlot;
  g.wiMount = wiMount;
  g.wiPrefetch = wiPrefetch;
  g.wiZoom = wiZoom;
  if (typeof module !== 'undefined' && module.exports) module.exports = { wiSlot: wiSlot, wiMount: wiMount, wiPrefetch: wiPrefetch, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
