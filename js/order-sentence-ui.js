// js/order-sentence-ui.js — V135: giao diện dùng CHUNG cho dạng "🧩 Sắp xếp câu".
//
// Dùng ở 2 nơi: màn "🎯 Hôm nay học" (js/review.js) và màn "Luyện theo kỹ năng" (js/skills-ui.js).
// Tách riêng để 2 nơi không tự viết lại cùng 1 giao diện rồi lệch nhau (mọi quy tắc xếp ô nằm ở đây).
//
// Cách chơi: mảnh bị xáo nằm ở hàng dưới; chạm mảnh để đưa lên "câu của bạn"; chạm mảnh đã xếp để trả về.
// Chỉ khi đã dùng HẾT mảnh mới bấm "Kiểm tra". Việc CHẤM do nơi gọi quyết định (client chấm tức thời
// bằng js/order-sentence.js, server luôn chấm lại từ dữ liệu thật).
'use strict';

const OS_UI = (function () {
  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let styleDone = false;
  function injectStyle() {
    if (styleDone || typeof document === 'undefined') return;
    styleDone = true;
    const st = document.createElement('style');
    st.id = 'os-style';
    st.textContent = `
      .os-vi{font-size:1.15rem;font-weight:800;text-align:center;line-height:1.5;margin:8px 0 2px;word-break:break-word}
      .os-sub{font-size:.82rem;color:var(--muted);text-align:center;margin-bottom:10px}
      .os-answer{min-height:52px;border:2px dashed var(--border);border-radius:12px;background:var(--paper);
                 padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;margin-bottom:10px}
      .os-answer.empty::after{content:'Chạm các mảnh bên dưới để xếp câu';color:var(--muted);font-size:.82rem;align-self:center}
      .os-pool{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:10px}
      .os-tile{min-height:44px;min-width:44px;padding:8px 12px;border:2px solid var(--border);border-radius:10px;
               background:var(--paper);color:var(--ink);font:inherit;font-size:1.15rem;font-weight:700;cursor:pointer;
               word-break:keep-all;transition:transform .08s}
      .os-tile:active{transform:scale(.96)}
      .os-tile.placed{border-style:solid;border-color:var(--active,#2a4fd6);background:var(--active,#eaf0ff)}
      .os-tile:disabled{opacity:.45;cursor:default}
      .os-actions{display:flex;gap:8px;justify-content:center;margin-top:6px}
      .os-result{border-radius:10px;padding:10px;margin:10px 0;text-align:center;font-weight:800}
      .os-result.ok{background:var(--l8c,#d5f5e3);color:var(--l8a,#1e8449)}
      .os-result.bad{background:var(--l10c,#fadbd8);color:var(--l10a,#922b21)}
      .os-key{font-size:1.15rem;font-weight:800;text-align:center;margin:6px 0;line-height:1.5}`;
    document.head.appendChild(st);
  }

  // state: { answer: [tileIndex,...] } — lưu trong phần tử DOM (dataset) để không cần biến toàn cục.
  function readState(container) {
    const raw = container.getAttribute('data-os-answer') || '';
    return raw ? raw.split(',').filter(Boolean).map(Number) : [];
  }
  function writeState(container, arr) {
    container.setAttribute('data-os-answer', arr.join(','));
  }

  // HTML phần chơi (đề + ô đáp án + kho mảnh). `q.order.tiles` là mảng chuỗi ĐÃ XÁO.
  function playHtml(q) {
    injectStyle();
    const tiles = (q.order && q.order.tiles) || [];
    const pool = tiles.map((t, i) =>
      `<button type="button" class="os-tile" data-os-idx="${i}" onclick="osUIPick(this)">${esc(t)}</button>`
    ).join('');
    return `<div class="os-play" data-os-answer="">
        <div class="os-vi">${esc(q.prompt.main || '')}</div>
        ${q.prompt.sub ? `<div class="os-sub">${esc(q.prompt.sub)}</div>` : ''}
        <div class="os-answer empty" id="os-answer"></div>
        <div class="os-pool" id="os-pool">${pool}</div>
        <div class="os-actions">
          <button type="button" class="btn" style="background:var(--border)" onclick="osUIReset(this)">↺ Xếp lại</button>
          <button type="button" class="btn btn-primary" id="os-check" disabled onclick="osUICheck(this)">Kiểm tra</button>
        </div>
      </div>`;
  }

  function findPlay(el) { return el.closest ? el.closest('.os-play') : null; }

  function redraw(play, tiles) {
    const ans = readState(play);
    const ansBox = play.querySelector('#os-answer');
    const poolBox = play.querySelector('#os-pool');
    if (!ansBox || !poolBox) return;
    ansBox.innerHTML = ans.map(i =>
      `<button type="button" class="os-tile placed" data-os-idx="${i}" onclick="osUIPick(this)">${esc(tiles[i])}</button>`
    ).join('');
    ansBox.classList.toggle('empty', ans.length === 0);
    // Mảnh đã đưa vào câu bị ẩn khỏi kho (giữ chỗ để bố cục không nhảy).
    for (const b of poolBox.querySelectorAll('.os-tile')) {
      b.disabled = ans.includes(Number(b.dataset.osIdx));
    }
    const btn = play.querySelector('#os-check');
    if (btn) btn.disabled = ans.length !== tiles.length;
  }

  // Chạm 1 mảnh: ở kho → lên câu; ở câu → về kho.
  function osUIPick(btn) {
    const play = findPlay(btn);
    if (!play || play.getAttribute('data-os-locked') === '1') return;
    const tiles = JSON.parse(play.getAttribute('data-os-tiles') || '[]');
    const idx = Number(btn.dataset.osIdx);
    let ans = readState(play);
    ans = ans.includes(idx) ? ans.filter(i => i !== idx) : ans.concat(idx);
    writeState(play, ans);
    redraw(play, tiles);
  }

  function osUIReset(btn) {
    const play = findPlay(btn);
    if (!play || play.getAttribute('data-os-locked') === '1') return;
    writeState(play, []);
    redraw(play, JSON.parse(play.getAttribute('data-os-tiles') || '[]'));
  }

  // Bấm Kiểm tra → gọi callback do nơi render gắn vào (play._osDone). Chuỗi ghép = các mảnh theo thứ tự đã xếp.
  function osUICheck(btn) {
    const play = findPlay(btn);
    if (!play || play.getAttribute('data-os-locked') === '1') return;
    const tiles = JSON.parse(play.getAttribute('data-os-tiles') || '[]');
    const ans = readState(play);
    if (ans.length !== tiles.length) return;
    play.setAttribute('data-os-locked', '1');
    const joined = ans.map(i => tiles[i]).join('');
    if (typeof play._osDone === 'function') play._osDone(joined);
  }

  // Gắn dữ liệu + callback vào HTML vừa render. Gọi NGAY SAU khi chèn playHtml vào DOM.
  function playBind(root, q, onDone) {
    if (!root || !q || !q.order) return;
    const play = root.querySelector('.os-play');
    if (!play) return;
    play.setAttribute('data-os-tiles', JSON.stringify(q.order.tiles || []));
    writeState(play, []);
    play._osDone = onDone;
    redraw(play, q.order.tiles || []);
  }

  return { injectStyle, playHtml, playBind, osUIPick, osUIReset, osUICheck, readState, writeState, redraw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OS_UI;
// onclick=... trong HTML cần hàm ở phạm vi toàn cục của trình duyệt.
if (typeof window !== 'undefined') {
  window.osUIPick = OS_UI.osUIPick;
  window.osUIReset = OS_UI.osUIReset;
  window.osUICheck = OS_UI.osUICheck;
}
