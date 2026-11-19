// js/hsk-chars.js — V176: "Từng chữ Hán trong HSK" ở màn ĐÁP ÁN của "Hôm nay học".
//
// Với từ đang kiểm tra (vd 经理), mỗi chữ Hán (经, 理) được tra xem NẰM TRONG những từ nào của danh sách HSK 1-3:
//   • Chữ có trong từ HSK 1-3  → hiện tối đa 3 từ (xếp HSK thấp → cao, từ ngắn trước) kèm nhãn HSK, pinyin, nghĩa.
//   • Chữ KHÔNG có trong HSK 1-3 → tìm tiếp trong HSK 4 và ghi rõ là gợi ý từ HSK 4.
//   • Không có ở HSK 1-4        → ghi "Chưa gặp trong HSK 1–4".
// Chỉ cần chữ nằm TRONG danh sách (không đòi người học đã thật sự ôn từ đó). Chính từ đang kiểm tra không được tính.
// Dữ liệu: các Quyển HSK 1..4 (BOOKS id 4..7 = bài 33..36) — KHÔNG cần bảng/API mới; tải 1 lần rồi nhớ trong bộ nhớ trang.

var HSKC_LEVELS = [{ lv: 1, bookId: 4, lesson: 33 }, { lv: 2, bookId: 5, lesson: 34 }, { lv: 3, bookId: 6, lesson: 35 }, { lv: 4, bookId: 7, lesson: 36 }];
var HSKC_MAX_PER_CHAR = 3;
var HSKC_RETRY_BACKOFF_MS = 30000;
var hskcWords = null;      // [{ hz, py, vi, lv }] sau khi tải xong
var hskcLoading = null;    // Promise đang tải (tránh tải trùng)
var hskcRetryAt = 0;       // sau lần tải lỗi: chờ tới mốc này mới thử lại (không làm chậm các màn đáp án liên tiếp)

// Khoảng bài của HSK 1..4 — lấy theo BOOKS (admin không sửa được Quyển có sẵn); thiếu thì dùng số bài mặc định.
function hskcLevelRanges() {
  return HSKC_LEVELS.map(function (d) {
    var b = (typeof BOOKS !== 'undefined' && Array.isArray(BOOKS)) ? BOOKS.find(function (x) { return x.id === d.bookId; }) : null;
    return { lv: d.lv, from: b ? b.from : d.lesson, to: b ? b.to : d.lesson };
  });
}
function hskcLevelOfLesson(l, ranges) {
  for (var i = 0; i < ranges.length; i++) if (l >= ranges[i].from && l <= ranges[i].to) return ranges[i].lv;
  return 0;
}
function hskcIsHan(c) { return /[\u3400-\u9fff\uf900-\ufaff]/.test(c); }
function hskcHasHan(hz) { return Array.from(String(hz || '')).some(hskcIsHan); }

// Thuần tính toán (dễ kiểm thử): words = [{ hz, py, vi, lv }]. Trả về 1 mục cho mỗi chữ Hán KHÁC NHAU, theo thứ tự xuất hiện.
function hskcAnalyze(hz, words, maxPerChar) {
  var max = maxPerChar || HSKC_MAX_PER_CHAR;
  var seen = {}; var out = [];
  var order = function (a, b) { return (a.lv - b.lv) || (Array.from(a.hz).length - Array.from(b.hz).length); };
  Array.from(String(hz || '')).forEach(function (ch) {
    if (!hskcIsHan(ch) || seen[ch]) return;
    seen[ch] = true;
    var hits = {}; // 1 từ có thể nằm ở nhiều bài → giữ bản có HSK thấp nhất
    (words || []).forEach(function (w) {
      if (!w || !w.hz || w.hz === hz || w.hz.indexOf(ch) < 0) return;
      if (!hits[w.hz] || w.lv < hits[w.hz].lv) hits[w.hz] = w;
    });
    var all = Object.keys(hits).map(function (k) { return hits[k]; });
    var list = all.filter(function (w) { return w.lv >= 1 && w.lv <= 3; }).sort(order);
    var fallback4 = false;
    if (!list.length) { list = all.filter(function (w) { return w.lv === 4; }).sort(order); fallback4 = list.length > 0; }
    out.push({ ch: ch, words: list.slice(0, max), total: list.length, fallback4: fallback4 });
  });
  return out;
}

function hskcCardHtml(item) {
  var esc = escapeHtml;
  var head = '<div class="rv-hskc-h"><b lang="zh">' + esc(item.ch) + '</b>' + (item.fallback4 ? ' <span class="rv-hskc-note">không có ở HSK 1–3 → gợi ý HSK 4</span>' : '') + '</div>';
  if (!item.words.length) return '<div class="rv-hskc-i">' + head + '<div class="rv-hskc-none">Chưa gặp trong HSK 1–4</div></div>';
  var rows = item.words.map(function (w) {
    var hzHtml = Array.from(w.hz).map(function (c) { return c === item.ch ? '<span class="rv-hskc-hl">' + esc(c) + '</span>' : esc(c); }).join('');
    return '<div class="rv-hskc-w"><span class="rv-hskc-lv">HSK ' + w.lv + '</span> <b lang="zh">' + hzHtml + '</b> <span class="rv-hskc-py">' + esc(w.py || '—') + '</span> <span class="rv-hskc-m">' + esc(w.vi || '—') + '</span></div>';
  }).join('');
  var more = item.total > item.words.length ? '<div class="rv-hskc-more">+' + (item.total - item.words.length) + ' từ khác</div>' : '';
  return '<div class="rv-hskc-i">' + head + rows + more + '</div>';
}

function hskcBlockHtml(hz, words) {
  var items = hskcAnalyze(hz, words);
  if (!items.length) return '';
  return '<div class="rv-hskc"><div class="rv-hskc-t">🔎 Từng chữ trong từ vựng HSK (' + items.length + ')</div><div class="rv-hskc-g' + (items.length % 2 ? ' odd' : '') + '">' + items.map(hskcCardHtml).join('') + '</div></div>';
}

// Tải dữ liệu HSK 1-4 (không bao giờ ném lỗi — lỗi thì đơn giản là không hiện khối này). Dùng từ đã có sẵn trong WORDS,
// chỉ gọi server cho các bài CHƯA tải; kết quả lưu riêng, KHÔNG đụng vào WORDS / loadedLessonNumbers.
function hskcLoad() {
  if (hskcWords) return Promise.resolve(hskcWords);
  if (hskcLoading) return hskcLoading;
  if (Date.now() < hskcRetryAt) return Promise.resolve(null);
  var p = (async function () {
    try {
      var ranges = hskcLevelRanges();
      var lessons = [];
      ranges.forEach(function (r) { for (var l = r.from; l <= r.to; l++) lessons.push(l); });
      var words = [];
      var push = function (w) { var lv = hskcLevelOfLesson(w.l, ranges); if (lv && w.hz) words.push({ hz: w.hz, py: w.py || '', vi: w.vi || '', lv: lv }); };
      if (typeof WORDS !== 'undefined' && Array.isArray(WORDS)) WORDS.forEach(push);
      var have = (typeof loadedLessonNumbers !== 'undefined' && loadedLessonNumbers) ? loadedLessonNumbers : new Set();
      var missing = lessons.filter(function (l) { return !have.has(l); });
      if (missing.length) {
        var res = await fetch('/api/vocab?lessons=' + missing.join(','), { headers: (typeof authHeaders === 'function' ? authHeaders() : {}) });
        var data = await res.json();
        if (!(data && data.ok && Array.isArray(data.vocab))) throw new Error('Không tải được danh sách HSK');
        data.vocab.forEach(push);
      }
      hskcWords = words;
      return words;
    } catch (e) {
      hskcRetryAt = Date.now() + HSKC_RETRY_BACKOFF_MS;
      return null;
    } finally {
      hskcFillPending();
    }
  })();
  // Gán SAU khi async chạy: nếu mọi thứ có sẵn thì hàm xong ngay (đồng bộ), gỡ cờ "đang tải" phải làm qua .then để không bị kẹt.
  hskcLoading = p;
  p.then(function () { if (hskcLoading === p) hskcLoading = null; });
  return p;
}

// Gọi trong màn đáp án. Dữ liệu sẵn → khối đầy đủ ngay. Chưa sẵn → khung chờ nhỏ, tự điền khi tải xong (hoặc tự biến mất nếu lỗi).
function hskcHtml(hz) {
  if (!hskcHasHan(hz)) return '';
  if (hskcWords) return hskcBlockHtml(hz, hskcWords);
  if (Date.now() < hskcRetryAt) return '';
  hskcLoad();
  // Có thể đã xong NGAY (đủ dữ liệu sẵn trong WORDS) hoặc lỗi ngay → xử lý luôn, không để khung chờ bị kẹt.
  if (hskcWords) return hskcBlockHtml(hz, hskcWords);
  if (Date.now() < hskcRetryAt) return '';
  return '<div class="rv-hskc rv-hskc-pending" data-hskc-hz="' + escapeHtml(hz) + '"><div class="rv-hskc-t">🔎 Đang tra từng chữ trong HSK…</div></div>';
}

function hskcFillPending() {
  if (typeof document === 'undefined') return;
  var els = document.querySelectorAll('[data-hskc-hz]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var html = hskcWords ? hskcBlockHtml(el.getAttribute('data-hskc-hz') || '', hskcWords) : '';
    if (html) el.outerHTML = html; else el.remove();
  }
}
