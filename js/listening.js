// js/listening.js — V140: luyện nghe câu. Ẩn chữ Hán; nghe 1 lần / lặp lại / chậm; hiện nội dung khi
// người học yêu cầu. KHÔNG hiện pinyin khi đang luyện nghe. Không đụng FSRS / dữ liệu học.
'use strict';

let ls2Items = [], ls2Idx = 0, ls2Revealed = false, ls2Plays = 0;

function ls2Pool() {
  const all = (typeof SENTENCES !== 'undefined' && Array.isArray(SENTENCES)) ? SENTENCES : [];
  const filtered = (typeof isLessonInSelection === 'function') ? all.filter(s => isLessonInSelection(s.l)) : all;
  return filtered.length ? filtered : all;
}

function ls2Load() {
  const pool = ls2Pool().slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  ls2Items = pool.slice(0, 10);
  ls2Idx = 0; ls2Revealed = false; ls2Plays = 0;
}

function renderListening() {
  return `<div class="panel">
    <div style="font-size:.8rem;opacity:.8;margin-bottom:8px">Nghe câu rồi tự đoán. Chữ Hán được ẩn cho tới khi bạn bấm “Hiện nội dung”.</div>
    <div id="ls2-body"></div>
  </div>`;
}

function bindListening() {
  if (!ls2Items.length) ls2Load();
  ls2Draw();
}

function ls2Draw() {
  const el = document.getElementById('ls2-body');
  if (!el) return;
  if (!ls2Items.length) {
    el.innerHTML = '<div class="center" style="padding:24px">Chưa có câu nào trong bài đang chọn.</div>';
    return;
  }
  el.innerHTML = `<div class="center" style="padding:8px 0">
    <div id="ls2-count" style="font-size:.75rem;opacity:.7;margin-bottom:10px">Câu ${ls2Idx + 1}/${ls2Items.length} · đã nghe ${ls2Plays} lần</div>
    <button class="listen-play" onclick="ls2Play(false)" title="Nghe">🔊</button>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px">
      <button class="btn btn-sm" onclick="ls2Play(false)">🔁 Nghe lại</button>
      <button class="btn btn-sm" onclick="ls2Play(true)">🐢 Nghe chậm</button>
      <button class="btn btn-sm" onclick="ls2Reveal()">👁 Hiện nội dung</button>
      <button class="btn btn-sm" onclick="ls2Next()">➡ Câu tiếp</button>
    </div>
    <div id="ls2-content" style="margin-top:14px;min-height:3em"></div>
    <div id="ls2-status" style="font-size:.8rem;opacity:.8;margin-top:6px;min-height:1em"></div>
  </div>`;
  ls2DrawContent();
  // Nghe đúng 1 lần cho mỗi câu mới (không phát lại khi bấm "Hiện nội dung").
  setTimeout(() => { if (typeof currentTab !== 'undefined' && currentTab === 'listening') ls2Play(false); }, 400);
}

function ls2DrawContent() {
  const el = document.getElementById('ls2-content');
  if (!el) return;
  const s = ls2Items[ls2Idx];
  if (!s) { el.innerHTML = ''; return; }
  if (!ls2Revealed) {
    el.innerHTML = '<div style="font-size:1.6rem;letter-spacing:.3em;opacity:.5">🀄 •••</div>';
    return;
  }
  el.innerHTML = `<div style="font-size:1.5rem">${escapeHtml(s.hz)}</div>
    <div style="font-size:.9rem;opacity:.8;margin-top:6px">${escapeHtml(s.vi || '')}</div>`;
}

function ls2DrawCount() {
  const el = document.getElementById('ls2-count');
  if (el) el.textContent = `Câu ${ls2Idx + 1}/${ls2Items.length} · đã nghe ${ls2Plays} lần`;
}

function ls2Play(slow) {
  const s = ls2Items[ls2Idx];
  if (!s) return;
  ls2Plays++;
  ls2DrawCount();
  const st = document.getElementById('ls2-status');
  const label = slow ? '🐢 Đang phát chậm…' : '🔊 Đang phát…';
  if (st) st.textContent = label;
  const hooks = {
    start: () => { if (st) st.textContent = label; },
    end: () => { if (st) st.textContent = '✓ Đã phát'; },
    error: () => { if (st) st.textContent = '⚠️ Không phát được âm thanh'; },
  };
  if (slow && typeof speakSlow === 'function') speakSlow(s.hz, hooks);
  else if (typeof speak === 'function') speak(s.hz, hooks);
}

function ls2Reveal() {
  ls2Revealed = true;
  ls2DrawContent();
}

function ls2Next() {
  if (!ls2Items.length) return;
  ls2Idx = (ls2Idx + 1) % ls2Items.length;
  ls2Revealed = false;
  ls2Plays = 0;
  ls2Draw();
}
