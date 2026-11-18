// V175 — LỚP "CHỊU LỖI MẠNG" DÙNG CHUNG + tải thư viện Excel theo nhu cầu.
// File này PHẢI nạp đầu tiên (trước mọi file khác trong index.html).
//
// Vì sao có file này: web chỉ có vài người dùng nên thường "ngủ" — database (Neon) và server (Vercel) tự tắt
// khi rảnh, lần bấm đầu tiên phải đánh thức chúng mất vài giây hoặc báo lỗi. Trước đây app không chờ, không thử
// lại → báo lỗi và người học phải tải lại trang. Nay:
//   1) Mọi yêu cầu ĐỌC (GET /api/...) tự thử lại tối đa 2 lần khi mạng chập chờn / server trả 500-504 / quá thời gian chờ.
//      Chỉ GET (đọc dữ liệu) mới tự thử lại — POST/PUT (ghi) KHÔNG bao giờ tự gửi lại để khỏi ghi trùng
//      (việc gửi kết quả học đã có hàng chờ outbox riêng trong study-queue.js).
//   2) friendlyNetError: đổi thông báo kỹ thuật ("Failed to fetch", "Unexpected token <") thành tiếng Việt dễ hiểu.
//   3) showLoadError / showLoadBanner: hiện nút "Thử lại" thay vì bắt người học tải lại cả trang.
//   4) ensureXlsx: thư viện Excel (~900KB, từng chặn việc mở app) chỉ tải khi thật sự nhập/xuất file.

var NET_RETRY_STATUS = [500, 502, 503, 504];
var NET_RETRY_WAITS_MS = [800, 2200, 4000];
var NET_TIMEOUT_MS = 15000;

function netSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function friendlyNetError(e) {
  var m = String((e && e.message) || e || '');
  if (e && e.__friendly) return m;
  if (/Failed to fetch|NetworkError|Load failed|network|Unexpected token|Unexpected end|JSON|is not valid|abort|timeout|timed out/i.test(m) || (e && e.name === 'AbortError')) {
    return 'Mạng đang chập chờn hoặc máy chủ chưa kịp phản hồi (có thể vừa "thức dậy"). Hãy bấm Thử lại.';
  }
  return m || 'Có lỗi xảy ra. Hãy thử lại.';
}

var __rawFetch = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch.bind(window) : null;

// Thử lại tự động cho yêu cầu ĐỌC. Trả về Response như fetch thường nên code cũ (res.json()...) chạy y nguyên.
async function fetchRetry(url, opts, cfg) {
  var o0 = opts || {};
  var c = cfg || {};
  var method = String(o0.method || 'GET').toUpperCase();
  var retries = c.retries != null ? c.retries : (method === 'GET' ? 2 : 0);
  var timeoutMs = c.timeoutMs || NET_TIMEOUT_MS;
  var rawFetch = __rawFetch || fetch;
  var lastErr = null;
  for (var a = 0; a <= retries; a++) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      var off = new Error('Bạn đang offline. Hãy bật mạng rồi bấm Thử lại.'); off.__friendly = true; throw off;
    }
    var ctl = (!o0.signal && typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
    try {
      var res = await rawFetch(url, ctl ? Object.assign({}, o0, { signal: ctl.signal }) : o0);
      if (timer) clearTimeout(timer);
      if (NET_RETRY_STATUS.indexOf(res.status) >= 0 && a < retries) { await netSleep(NET_RETRY_WAITS_MS[a] || 4000); continue; }
      return res;
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (o0.signal && o0.signal.aborted) throw e; // chính người gọi chủ động huỷ → không thử lại
      lastErr = e;
      if (a < retries) { await netSleep(NET_RETRY_WAITS_MS[a] || 4000); continue; }
    }
  }
  var err = new Error(friendlyNetError(lastErr)); err.__friendly = true; err.cause = lastErr; throw err;
}

// Gắn vào fetch toàn cục CHỈ cho yêu cầu đọc nội bộ (GET /api/...). Nhờ vậy mọi chỗ đang gọi fetch('/api/...') tự được
// bảo vệ mà không phải sửa từng nơi. Muốn tắt cho 1 lệnh riêng: truyền { noRetry: true }.
if (typeof window !== 'undefined' && __rawFetch && !window.__fetchRetryInstalled) {
  window.__fetchRetryInstalled = true;
  window.fetch = function (input, init) {
    var method = String((init && init.method) || 'GET').toUpperCase();
    if (typeof input !== 'string' || input.indexOf('/api/') !== 0 || method !== 'GET' || (init && init.noRetry)) return __rawFetch(input, init);
    return fetchRetry(input, init);
  };
}

function _lrEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

// Khung lỗi to giữa màn hình (thay cho alert + quay về trang khác). onRetry chạy khi bấm "Thử lại".
function showLoadError(message, onRetry, opts) {
  var el = (opts && opts.container) || (typeof document !== 'undefined' && document.getElementById('content'));
  if (!el) return false;
  var title = (opts && opts.title) || 'Chưa tải được dữ liệu';
  el.innerHTML = '<div class="study-empty load-error" role="alert"><div style="font-size:1.6rem">⚠️</div>' +
    '<div style="font-weight:800;margin:4px 0">' + _lrEsc(title) + '</div>' +
    '<div style="font-size:.85rem;opacity:.8;margin-bottom:12px;overflow-wrap:anywhere">' + _lrEsc(friendlyNetError(message)) + '</div>' +
    '<button class="btn" data-lr="retry">🔄 Thử lại</button> ' +
    ((opts && opts.noHome) ? '' : '<button class="btn btn-sm" data-lr="home">Về trang Hôm nay</button>') + '</div>';
  var rb = el.querySelector('[data-lr="retry"]');
  if (rb) rb.addEventListener('click', function () { rb.disabled = true; rb.textContent = 'Đang thử lại...'; try { if (onRetry) onRetry(); } catch (e) { /* người gọi tự xử lý */ } });
  var hb = el.querySelector('[data-lr="home"]');
  if (hb) hb.addEventListener('click', function () { if (typeof goTab === 'function') goTab('today'); });
  return true;
}

// Thanh báo nhỏ ở đầu màn hình cho lỗi tải NỀN (không chặn người học). kind dùng để chỉ gỡ đúng thanh của mình.
function showLoadBanner(message, onRetry, kind) {
  if (typeof document === 'undefined' || !document.body) return;
  var b = document.getElementById('load-banner');
  if (!b) {
    b = document.createElement('div'); b.id = 'load-banner'; b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(8px + env(safe-area-inset-top,0px));z-index:9999;background:var(--card,#fff);color:var(--ink,#222);border:1px solid var(--border,#ddd);border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;font-size:.85rem;max-width:560px;margin:0 auto';
    document.body.appendChild(b);
  }
  b.setAttribute('data-kind', kind || '');
  b.innerHTML = '<span style="flex:1;overflow-wrap:anywhere">⚠️ ' + _lrEsc(friendlyNetError(message)) + '</span><button class="btn btn-sm" data-lb="retry">Thử lại</button><button class="btn btn-sm" data-lb="x" aria-label="Đóng">✕</button>';
  var rb = b.querySelector('[data-lb="retry"]');
  if (rb) rb.addEventListener('click', function () { rb.disabled = true; rb.textContent = 'Đang thử...'; try { if (onRetry) onRetry(); } catch (e) { } });
  var xb = b.querySelector('[data-lb="x"]');
  if (xb) xb.addEventListener('click', function () { b.remove(); });
}
function hideLoadBanner(kind) {
  if (typeof document === 'undefined') return;
  var b = document.getElementById('load-banner');
  if (b && (!kind || b.getAttribute('data-kind') === kind)) b.remove();
}

// Thư viện Excel chỉ tải khi cần (nhập/xuất file .xlsx). Gọi nhiều lần vẫn chỉ tải 1 lần.
function ensureXlsx() {
  if (typeof XLSX !== 'undefined') return Promise.resolve(XLSX);
  if (ensureXlsx._p) return ensureXlsx._p;
  ensureXlsx._p = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.crossOrigin = 'anonymous'; // bắt buộc: trang bật COEP nên script bên ngoài phải có CORS
    s.async = true;
    var fail = function () { ensureXlsx._p = null; if (s.parentNode) s.parentNode.removeChild(s); reject(new Error('Không tải được thư viện Excel. Kiểm tra mạng rồi thử lại.')); };
    s.onload = function () { if (typeof XLSX !== 'undefined') resolve(XLSX); else fail(); };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return ensureXlsx._p;
}
