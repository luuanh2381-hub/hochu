// js/stroke.js — V115: XEM NÉT VIẾT + TẬP VIẾT chữ Hán (thư viện HanziWriter, nạp MUỘN khi người học bấm "Xem nét viết").
//
// Vì sao: app chưa có luyện viết, trong khi viết tay là một con đường ghi nhớ hình chữ khác hẳn nhìn–chọn. Đặc biệt hữu ích với "từ cứng đầu".
// Thiết kế an toàn:
//   * Chỉ nạp thư viện khi bấm (không làm chậm lần mở app, không phụ thuộc mạng lúc học bình thường).
//   * Mọi lỗi (mất mạng, chữ chưa có dữ liệu nét, CDN chặn) chỉ hiện 1 dòng thông báo — không ảnh hưởng buổi học.
//   * Trang đang bật COEP require-corp (vercel.json) nên script phải nạp với crossorigin="anonymous".
//   * Phiên bản ghim cố định (không dùng "latest"); thử lần lượt 2 URL.
// LƯU Ý KIỂM THỬ: phần nạp thư viện/dữ liệu nét cần mạng → KHÔNG kiểm tra được trong môi trường build; chỉ phần tách chữ được test.

const STROKE_LIB_URLS = [
  'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js',
  'https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.0/dist/hanzi-writer.min.js',
];
const STROKE_MAX_CHARS = 6;
let strokeLibPromise = null;
let strokeWriters = [];
let strokePaused = false; // đã tạm dừng đếm ngược tự chuyển câu khi mở cửa sổ nét viết (V116: trước đây dùng biến của word-notes.js)

(function strokeInjectStyle() {
  if (typeof document === 'undefined' || document.getElementById('stroke-style')) return;
  const st = document.createElement('style');
  st.id = 'stroke-style';
  st.textContent = `
  .stroke-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:flex-end;justify-content:center}
  .stroke-sheet{background:var(--paper,#fff);width:100%;max-width:520px;border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}
  .stroke-title{font-size:1.05rem;margin-bottom:6px}.stroke-hint{font-size:.8rem;color:var(--muted);margin-bottom:8px;line-height:1.4}
  .stroke-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center}`;
  document.head.appendChild(st);
})();

// Tách các chữ Hán (bỏ ký tự khác, bỏ trùng lặp liên tiếp không cần) — tối đa STROKE_MAX_CHARS.
function strokeChars(hz) {
  const out = [];
  for (const ch of String(hz || '')) {
    if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch) && !out.includes(ch)) out.push(ch);
    if (out.length >= STROKE_MAX_CHARS) break;
  }
  return out;
}

function strokeLoadScript(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = url; el.async = true; el.crossOrigin = 'anonymous';
    el.onload = () => (typeof HanziWriter !== 'undefined' ? resolve() : reject(new Error('Thư viện nạp xong nhưng không dùng được')));
    el.onerror = () => { el.remove(); reject(new Error('Không tải được thư viện nét viết')); };
    document.head.appendChild(el);
  });
}
function strokeLoadLib() {
  if (typeof HanziWriter !== 'undefined') return Promise.resolve();
  if (strokeLibPromise) return strokeLibPromise;
  strokeLibPromise = (async () => {
    let lastErr = null;
    for (const url of STROKE_LIB_URLS) {
      try { await strokeLoadScript(url); return; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Không tải được thư viện nét viết');
  })().catch(e => { strokeLibPromise = null; throw e; }); // lần sau cho phép thử lại
  return strokeLibPromise;
}

function strokeClose() {
  const ov = document.getElementById('stroke-overlay');
  if (ov) ov.remove();
  strokeWriters = [];
  if (strokePaused) {
    strokePaused = false;
    if (typeof rvRatingPhase !== 'undefined' && rvRatingPhase === 'pending' && currentTab === 'review' && typeof rvShouldAutoCommit === 'function' && rvShouldAutoCommit()) rvStartCountdown(rvAttemptId);
  }
}

function strokeQuizSequence() {
  let i = 0;
  const next = () => {
    if (i >= strokeWriters.length) return;
    const w = strokeWriters[i++];
    w.quiz({ onComplete: next });
  };
  next();
}
function strokeAnimateAll() { strokeWriters.forEach((w, i) => setTimeout(() => { try { w.animateCharacter(); } catch (e) {} }, i * 150)); }

async function strokeOpen(hz) {
  if (typeof document === 'undefined' || document.getElementById('stroke-overlay')) return;
  const chars = strokeChars(hz);
  // Tạm dừng đếm ngược tự chuyển câu (nếu đang chạy) trong lúc xem nét viết.
  if (typeof rvCountdownTimer !== 'undefined' && rvCountdownTimer) { rvClearCountdown(); strokePaused = true; }
  const ov = document.createElement('div');
  ov.id = 'stroke-overlay'; ov.className = 'stroke-ov';
  const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ov.innerHTML = `<div class="stroke-sheet" role="dialog" aria-label="Nét viết">
    <div class="stroke-title">✏️ Nét viết: <b>${esc(hz)}</b></div>
    <div id="stroke-msg" class="stroke-hint">${chars.length ? '⏳ Đang tải nét viết...' : 'Từ này không có chữ Hán để hiện nét.'}</div>
    <div id="stroke-boxes" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center"></div>
    <div class="stroke-actions">
      <button class="btn btn-sm" id="stroke-play" disabled>▶ Xem nét</button>
      <button class="btn btn-sm" id="stroke-quiz" disabled>✍️ Tập viết</button>
      <button class="btn btn-sm" id="stroke-close">Đóng</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) strokeClose(); });
  document.getElementById('stroke-close').onclick = strokeClose;
  if (!chars.length) return;

  const msg = document.getElementById('stroke-msg');
  try {
    await strokeLoadLib();
  } catch (e) {
    if (document.getElementById('stroke-msg')) msg.textContent = '⚠️ Không tải được nét viết (cần kết nối mạng). Bạn vẫn có thể học bình thường.';
    return;
  }
  if (!document.getElementById('stroke-overlay')) return; // người học đã đóng trong lúc chờ
  const boxes = document.getElementById('stroke-boxes');
  const color = (typeof getComputedStyle === 'function' && getComputedStyle(document.body).color) || '#333';
  let failed = 0;
  strokeWriters = chars.map(ch => {
    const box = document.createElement('div');
    box.style.cssText = 'width:110px;height:110px;border:1px solid var(--border);border-radius:10px;background:var(--bg,#fff)';
    boxes.appendChild(box);
    return HanziWriter.create(box, ch, {
      width: 110, height: 110, padding: 6, strokeColor: color, outlineColor: '#bbb', showOutline: true,
      strokeAnimationSpeed: 1.2, delayBetweenStrokes: 200,
      onLoadCharDataError: () => { failed++; box.textContent = ch; box.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:2.4rem'; if (failed === chars.length && document.getElementById('stroke-msg')) document.getElementById('stroke-msg').textContent = '⚠️ Chưa có dữ liệu nét cho chữ này (hoặc mất mạng).'; },
    });
  });
  msg.textContent = 'Bấm “Xem nét” để xem thứ tự nét, hoặc “Tập viết” rồi vẽ từng nét bằng ngón tay/chuột.';
  const play = document.getElementById('stroke-play'), quiz = document.getElementById('stroke-quiz');
  play.disabled = false; quiz.disabled = false;
  play.onclick = strokeAnimateAll;
  quiz.onclick = strokeQuizSequence;
  strokeAnimateAll();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { strokeChars, STROKE_LIB_URLS, STROKE_MAX_CHARS };
