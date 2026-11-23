// js/listening.js — V140+: luyện nghe câu chủ động. Ưu tiên câu ví dụ DB (word_examples, có Pinyin) + SENTENCES
// theo phạm vi bài đang chọn; ẩn chữ Hán/Pinyin cho tới khi bấm “Hiện nội dung”; hỗ trợ tự đánh giá “Nghe rõ / Chưa rõ”
// (chèn nghe lại sau ít câu). KHÔNG đụng FSRS / dữ liệu ôn tập chính thức.
'use strict';

let ls2Items = [], ls2Idx = 0, ls2Revealed = false, ls2Plays = 0, ls2Clear = 0, ls2DbExamples = [], ls2DbScopeKey = '';

function ls2ScopeKey() {
  if (typeof lessonsAllMode !== 'undefined' && typeof selectedBookIds !== 'undefined') {
    const b = [...selectedBookIds].sort((a, c) => a - c).join(',');
    const l = lessonsAllMode ? 'all' : [...(selectedLessons || [])].sort((a, c) => a - c).join(',');
    return b + ':' + l;
  }
  return 'default';
}

function ls2Pool() {
  const out = [], seen = new Set();
  const push = (hz, vi, py, l, src) => {
    const k = String(hz || '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ hz: k, vi: vi || '', py: py || '', l: l != null ? l : null, src });
  };
  for (const e of ls2DbExamples) if (e && e.zh) push(e.zh, e.vi, e.py, e.l, 'db');
  const all = (typeof SENTENCES !== 'undefined' && Array.isArray(SENTENCES)) ? SENTENCES : [];
  const filtered = (typeof isLessonInSelection === 'function') ? all.filter(s => isLessonInSelection(s.l)) : all;
  for (const s of (filtered.length ? filtered : all)) if (s && s.hz) push(s.hz, s.vi, s.py, s.l, 'static');
  return out;
}

function ls2Load() {
  const pool = ls2Pool().slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  ls2Items = pool.slice(0, 12);
  ls2Idx = 0; ls2Revealed = false; ls2Plays = 0; ls2Clear = 0;
}

async function ls2FetchDbExamples() {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn() || typeof fetch !== 'function') return false;
  const key = ls2ScopeKey();
  if (key === ls2DbScopeKey && ls2DbExamples.length) return false;
  const lessons = (typeof lessonsAllMode !== 'undefined' && lessonsAllMode && typeof lessonsOfSelection === 'function')
    ? lessonsOfSelection()
    : (typeof selectedLessons !== 'undefined' ? [...selectedLessons] : []);
  if (!lessons.length) return false;
  try {
    const res = await fetch('/api/word-examples?lessons=' + lessons.slice(0, 20).join(','), {
      headers: typeof authHeaders === 'function' ? authHeaders() : {},
    });
    const d = await res.json().catch(() => null);
    if (d && d.ok && Array.isArray(d.examples) && d.examples.length) {
      ls2DbExamples = d.examples;
      ls2DbScopeKey = key;
      return true;
    }
  } catch {}
  return false;
}

function renderListening() {
  return `<div class="panel">
    <div class="panel-title">🎧 Luyện nghe câu theo phạm vi đang chọn</div>
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Nghe câu rồi tự nhẩm nghĩa và chữ Hán. Nội dung &amp; Pinyin ẩn cho tới khi bạn bấm “Hiện nội dung”. Luyện bổ sung, không đổi lịch FSRS.</div>
    <div id="ls2-body"></div>
  </div>`;
}

function bindListening() {
  const key = ls2ScopeKey();
  if (!ls2Items.length || (ls2DbScopeKey && ls2DbScopeKey !== key)) ls2Load();
  ls2Draw();
  ls2FetchDbExamples().then((updated) => {
    if (updated && typeof currentTab !== 'undefined' && currentTab === 'listening' && ls2Idx === 0 && ls2Plays <= 1) {
      ls2Load();
      ls2Draw();
    }
  });
}

function ls2Draw() {
  const el = document.getElementById('ls2-body');
  if (!el) return;
  if (!ls2Items.length) {
    el.innerHTML = '<div class="center" style="padding:24px;color:var(--muted)">Chưa có câu nào trong bài đang chọn.</div>';
    return;
  }
  el.innerHTML = `<div class="center" style="padding:8px 0">
    <div id="ls2-count" style="font-size:.78rem;color:var(--muted);font-weight:700;margin-bottom:12px">Câu ${ls2Idx + 1}/${ls2Items.length} · đã nghe ${ls2Plays} lần · rõ ${ls2Clear} câu</div>
    <button class="listen-play" onclick="ls2Play(false)" title="Nghe" style="margin:0 auto">🔊</button>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:14px">
      <button class="btn btn-sm" onclick="ls2Play(false)">🔁 Nghe lại</button>
      <button class="btn btn-sm" onclick="ls2Play(true)">🐢 Nghe chậm</button>
      <button class="btn btn-sm" onclick="ls2Reveal()">👁 Hiện nội dung</button>
      <button class="btn btn-sm" onclick="ls2Refresh()">🔄 Bộ câu khác</button>
    </div>
    <div id="ls2-content" style="margin-top:16px;min-height:4em"></div>
    <div id="ls2-judge" style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="ls2Mark(false)">🔁 Chưa rõ (nghe lại sau)</button>
      <button class="btn btn-sm btn-primary" onclick="ls2Mark(true)">✓ Nghe rõ · Câu tiếp</button>
    </div>
    <div id="ls2-status" style="font-size:.78rem;color:var(--muted);margin-top:8px;min-height:1.2em"></div>
  </div>`;
  ls2DrawContent();
  setTimeout(() => { if (typeof currentTab !== 'undefined' && currentTab === 'listening') ls2Play(false); }, 400);
}

function ls2DrawContent() {
  const el = document.getElementById('ls2-content');
  if (!el) return;
  const s = ls2Items[ls2Idx];
  if (!s) { el.innerHTML = ''; return; }
  if (!ls2Revealed) {
    el.innerHTML = '<div style="font-size:1.5rem;letter-spacing:.3em;color:var(--muted);padding:12px">•••</div>';
    return;
  }
  el.innerHTML = `<div class="rv-ex" style="text-align:center">
    <div class="cv-zh" style="font-size:1.45rem">${escapeHtml(s.hz)}</div>
    ${s.py ? `<div class="rv-py" style="margin-top:4px;font-size:.95rem">${escapeHtml(s.py)}</div>` : ''}
    <div style="font-size:.92rem;color:var(--ink-2);margin-top:6px;font-weight:600">${escapeHtml(s.vi || '')}</div>
  </div>`;
}

function ls2DrawCount() {
  const el = document.getElementById('ls2-count');
  if (el) el.textContent = `Câu ${ls2Idx + 1}/${ls2Items.length} · đã nghe ${ls2Plays} lần · rõ ${ls2Clear} câu`;
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

function ls2Mark(understood) {
  if (!ls2Items.length) return;
  const cur = ls2Items[ls2Idx];
  if (understood) {
    ls2Clear++;
  } else if (cur && ls2Items.length < 24) {
    const insertAt = Math.min(ls2Items.length, ls2Idx + 3);
    ls2Items.splice(insertAt, 0, Object.assign({}, cur));
  }
  ls2Next();
}

function ls2Refresh() {
  ls2Load();
  ls2Draw();
}

function ls2Next() {
  if (!ls2Items.length) return;
  ls2Idx = (ls2Idx + 1) % ls2Items.length;
  ls2Revealed = false;
  ls2Plays = 0;
  ls2Draw();
}
