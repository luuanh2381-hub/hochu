// js/listening.js — V140+: luyện nghe câu chủ động. Ưu tiên câu ví dụ DB (word_examples, có Pinyin) + SENTENCES
// theo phạm vi bài đang chọn; ẩn chữ Hán/Pinyin cho tới khi bấm “Hiện nội dung”; hỗ trợ tự đánh giá “Nghe rõ / Chưa rõ”
// (chèn nghe lại sau ít câu). KHÔNG đụng FSRS / dữ liệu ôn tập chính thức.
'use strict';

let ls2Items = [], ls2Idx = 0, ls2Revealed = false, ls2Plays = 0, ls2Clear = 0, ls2DbExamples = [], ls2DbScopeKey = '';
// Chế độ Nghe rảnh tay (Podcast ôn từ sắp quên / theo bài / câu ví dụ) — không đổi lịch FSRS
let ls2TabMode = 'active'; // 'active' | 'podcast'
let podSource = 'atrisk';  // 'atrisk' | 'lesson' | 'sentences'
let podItems = [], podIdx = 0, podPlaying = false, podRunId = 0;
let podPauseSec = 2.5, podSlow = true, podRepeat2 = true, podReadVi = true, podHideText = false;
let podSleepMin = 0, podSleepEndAt = 0, podSleepTimer = null, podWakeLock = null;
let podPhase = 'idle'; // 'idle' | 'zh1' | 'wait' | 'reveal' | 'zh2'
let podSourceNote = '';

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
  const modeBar = `<div class="gf-subtabs" role="tablist" style="margin-bottom:12px">
    <button type="button" class="gf-subtab${ls2TabMode === 'active' ? ' active' : ''}" onclick="ls2SwitchMode('active')">🎧 Nghe câu chủ động</button>
    <button type="button" class="gf-subtab${ls2TabMode === 'podcast' ? ' active' : ''}" onclick="ls2SwitchMode('podcast')">📻 Nghe rảnh tay (Podcast)</button>
  </div>`;
  if (ls2TabMode === 'podcast') {
    return `<div class="panel">
      ${modeBar}
      <div class="panel-title">📻 Nghe rảnh tay · Podcast ôn từ</div>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Tự động phát lần lượt tiếng Trung → khoảng nghỉ cho não tự nhớ → hiện &amp; đọc nghĩa tiếng Việt → lặp lại. Phù hợp lúc đi đường, thư giãn hoặc trước khi ngủ. Luyện bổ sung, không đổi lịch FSRS.</div>
      <div id="pod-body"></div>
    </div>`;
  }
  return `<div class="panel">
    ${modeBar}
    <div class="panel-title">🎧 Luyện nghe câu theo phạm vi đang chọn</div>
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Nghe câu rồi tự nhẩm nghĩa và chữ Hán. Nội dung &amp; Pinyin ẩn cho tới khi bạn bấm “Hiện nội dung”. Luyện bổ sung, không đổi lịch FSRS.</div>
    <div id="ls2-body"></div>
  </div>`;
}

function ls2SwitchMode(mode) {
  if (mode === ls2TabMode) return;
  podStop();
  ls2TabMode = mode === 'podcast' ? 'podcast' : 'active';
  if (typeof render === 'function') render();
}

function openHandsFreePodcast(src) {
  if (src) podSource = src;
  ls2TabMode = 'podcast';
  if (typeof goTab === 'function') goTab('listening');
}

function bindListening() {
  if (ls2TabMode === 'podcast') {
    podInit();
    return;
  }
  podStop();
  const key = ls2ScopeKey();
  if (!ls2Items.length || (ls2DbScopeKey && ls2DbScopeKey !== key)) ls2Load();
  ls2Draw();
  ls2FetchDbExamples().then((updated) => {
    if (updated && typeof currentTab !== 'undefined' && currentTab === 'listening' && ls2TabMode === 'active' && ls2Idx === 0 && ls2Plays <= 1) {
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
  if (typeof markDailySealFlag === 'function') markDailySealFlag('listening');
  ls2Draw();
}

// ════════════════════════════════════════════════════
// CHẾ ĐỘ NGHE RẢNH TAY (PODCAST MODE)
// ════════════════════════════════════════════════════
function podEscape(s) {
  return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function podLoadSource(src) {
  if (src) podSource = src;
  podStop();
  podItems = [];
  podIdx = 0;
  podSourceNote = '';
  const body = document.getElementById('pod-body');
  if (body) body.innerHTML = '<div class="study-empty">⏳ Đang chuẩn bị danh sách phát...</div>';

  const allWords = (typeof WORDS !== 'undefined' && Array.isArray(WORDS)) ? WORDS : [];
  const wordByHz = new Map();
  for (const w of allWords) if (w && w.hz && !wordByHz.has(w.hz)) wordByHz.set(w.hz, w);

  if (podSource === 'atrisk') {
    const picked = [], seen = new Set();
    const addWord = (w, tag) => {
      if (!w || !w.hz || seen.has(w.hz)) return;
      seen.add(w.hz);
      picked.push({ hz: w.hz, py: w.py || '', vi: w.vi || '', hanviet: w.hanviet || '', tag: tag || '' });
    };
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
      try {
        const dash = typeof fetchTodayDashboard === 'function' ? await fetchTodayDashboard(false) : null;
        const atRisk = (dash && dash.ok && dash.memory && Array.isArray(dash.memory.atRiskWords)) ? dash.memory.atRiskWords : [];
        for (const r of atRisk) {
          const w = wordByHz.get(r.hz);
          if (w) addWord(w, `Nguy cơ quên · nhớ ~${Math.round((r.r || 0) * 100)}%`);
        }
        if (picked.length < 15) {
          const res = await fetch('/api/study/weak-words', { headers: typeof authHeaders === 'function' ? authHeaders() : {} });
          const d = await res.json().catch(() => null);
          if (d && d.ok && Array.isArray(d.words)) {
            for (const w of d.words.slice(0, 25)) addWord(w, w.lapses ? `Quên ${w.lapses} lần` : 'Từ cần củng cố');
          }
        }
      } catch {}
    }
    if (picked.length) {
      podItems = picked.slice(0, 30);
      podSourceNote = `${podItems.length} từ có nguy cơ quên / cần củng cố`;
    } else {
      const scoped = (typeof isLessonInSelection === 'function') ? allWords.filter(w => isLessonInSelection(w.l)) : allWords;
      podItems = (scoped.length ? scoped : allWords).slice(0, 25).map(w => ({ hz: w.hz, py: w.py || '', vi: w.vi || '', hanviet: w.hanviet || '', tag: w.l ? `Bài ${w.l}` : '' }));
      podSourceNote = 'Chưa có từ sắp quên — đang phát từ trong bài đã chọn';
    }
  } else if (podSource === 'lesson') {
    const scoped = (typeof isLessonInSelection === 'function') ? allWords.filter(w => isLessonInSelection(w.l)) : allWords;
    const pool = (scoped.length ? scoped : allWords).slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    podItems = pool.slice(0, 40).map(w => ({ hz: w.hz, py: w.py || '', vi: w.vi || '', hanviet: w.hanviet || '', tag: w.l ? `Bài ${w.l}` : '' }));
    podSourceNote = `${podItems.length} từ ngẫu nhiên trong phạm vi đang chọn`;
  } else {
    await ls2FetchDbExamples();
    const pool = ls2Pool().slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    podItems = pool.slice(0, 30).map(s => ({ hz: s.hz, py: s.py || '', vi: s.vi || '', hanviet: '', tag: s.l ? `Câu · Bài ${s.l}` : 'Câu ví dụ' }));
    podSourceNote = `${podItems.length} câu ví dụ theo bài đang chọn`;
  }
  podRender();
}

function podInit() {
  if (!podItems.length) podLoadSource(podSource);
  else podRender();
}

async function podAcquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !podWakeLock) {
      podWakeLock = await navigator.wakeLock.request('screen');
      podWakeLock.addEventListener('release', () => { podWakeLock = null; });
    }
  } catch {}
}
function podReleaseWakeLock() {
  try { if (podWakeLock) { podWakeLock.release(); podWakeLock = null; } } catch {}
}

function podSetSleep(min) {
  podSleepMin = Number(min) || 0;
  if (podSleepTimer) { clearTimeout(podSleepTimer); podSleepTimer = null; }
  podSleepEndAt = 0;
  if (podSleepMin > 0 && podPlaying) podArmSleepTimer();
  podRender();
}
function podArmSleepTimer() {
  if (podSleepTimer) { clearTimeout(podSleepTimer); podSleepTimer = null; }
  if (podSleepMin <= 0) { podSleepEndAt = 0; return; }
  podSleepEndAt = Date.now() + podSleepMin * 60000;
  podSleepTimer = setTimeout(() => {
    podStop();
    const st = document.getElementById('pod-phase');
    if (st) st.textContent = `🌙 Đã hết hẹn giờ ${podSleepMin} phút — tự động dừng.`;
  }, podSleepMin * 60000);
}

function podStop() {
  podRunId++;
  podPlaying = false;
  podPhase = 'idle';
  if (podSleepTimer) { clearTimeout(podSleepTimer); podSleepTimer = null; }
  podSleepEndAt = 0;
  podReleaseWakeLock();
  if (typeof ttsStop === 'function') { try { ttsStop(); } catch {} }
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch {} }
  podUpdatePlayUi();
}

function podSleep(ms, runId) {
  return new Promise((resolve) => {
    if (runId !== podRunId) return resolve(false);
    const t = setTimeout(() => resolve(runId === podRunId), ms);
    const iv = setInterval(() => {
      if (runId !== podRunId) { clearTimeout(t); clearInterval(iv); resolve(false); }
    }, 150);
    setTimeout(() => clearInterval(iv), ms + 200);
  });
}

function podSpeakZh(text, slow, runId) {
  return new Promise((resolve) => {
    if (runId !== podRunId) return resolve(false);
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(runId === podRunId); } };
    const safety = setTimeout(finish, 12000);
    const hooks = { end: () => { clearTimeout(safety); finish(); }, error: () => { clearTimeout(safety); finish(); } };
    if (slow && typeof speakSlow === 'function') speakSlow(text, hooks);
    else if (typeof speak === 'function') speak(text, hooks);
    else { clearTimeout(safety); finish(); }
  });
}

function podSpeakVi(text, runId) {
  return new Promise((resolve) => {
    if (!podReadVi || !text || runId !== podRunId || !('speechSynthesis' in window)) return resolve(runId === podRunId);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/\([^)]*\)/g, '').slice(0, 120));
      u.lang = 'vi-VN';
      const viVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('vi'));
      if (viVoice) u.voice = viVoice;
      u.rate = 1.0;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(runId === podRunId); } };
      const safety = setTimeout(finish, 7000);
      u.onend = () => { clearTimeout(safety); finish(); };
      u.onerror = () => { clearTimeout(safety); finish(); };
      speechSynthesis.speak(u);
    } catch { resolve(runId === podRunId); }
  });
}

function podTogglePlay() {
  if (!podItems.length) return;
  if (podPlaying) { podStop(); return; }
  podPlaying = true;
  podAcquireWakeLock();
  if (podSleepMin > 0) podArmSleepTimer();
  if (typeof markDailySealFlag === 'function') markDailySealFlag('listening');
  podLoop(++podRunId);
}

function podJump(delta) {
  if (!podItems.length) return;
  const wasPlaying = podPlaying;
  podStop();
  podIdx = (podIdx + delta + podItems.length) % podItems.length;
  podRender();
  if (wasPlaying) podTogglePlay();
}

async function podLoop(runId) {
  while (runId === podRunId && podPlaying && podItems.length) {
    if (typeof currentTab !== 'undefined' && currentTab !== 'listening') { podStop(); return; }
    const item = podItems[podIdx];
    if (!item) break;

    podPhase = 'zh1';
    podRender();
    if (!(await podSpeakZh(item.hz, podSlow, runId))) break;

    podPhase = 'wait';
    podUpdatePhaseUi(`🤔 Tự nhẩm nghĩa trong ${podPauseSec} giây...`, false);
    if (!(await podSleep(Math.round(podPauseSec * 1000), runId))) break;

    podPhase = 'reveal';
    podUpdatePhaseUi('📖 Đáp án & nghĩa tiếng Việt', true);
    if (podReadVi && item.vi) {
      if (!(await podSpeakVi(item.vi, runId))) break;
    } else {
      if (!(await podSleep(1500, runId))) break;
    }

    if (podRepeat2) {
      podPhase = 'zh2';
      podUpdatePhaseUi('🔁 Nhắc lại tiếng Trung', true);
      if (!(await podSpeakZh(item.hz, false, runId))) break;
    }
    if (!(await podSleep(850, runId))) break;

    podIdx = (podIdx + 1) % podItems.length;
  }
  if (runId === podRunId) {
    podPlaying = false;
    podPhase = 'idle';
    podReleaseWakeLock();
    podUpdatePlayUi();
  }
}

function podUpdatePlayUi() {
  const btn = document.getElementById('pod-play-btn');
  if (btn) btn.textContent = podPlaying ? '⏸ Tạm dừng' : '▶️ Bắt đầu phát';
  const ph = document.getElementById('pod-phase');
  if (ph && !podPlaying && podPhase === 'idle') ph.textContent = 'Sẵn sàng phát · Bấm ▶️ để nghe rảnh tay';
}

function podUpdatePhaseUi(label, showAnswer) {
  const ph = document.getElementById('pod-phase');
  if (ph) ph.textContent = label;
  const ans = document.getElementById('pod-answer-box');
  if (ans) ans.style.opacity = showAnswer ? '1' : '0.12';
}

function podRender() {
  const body = document.getElementById('pod-body');
  if (!body) return;
  const srcChips = [
    ['atrisk', '⚠️ Từ sắp quên'],
    ['lesson', '📚 Từ bài đang chọn'],
    ['sentences', '💬 Câu ví dụ'],
  ].map(([id, lbl]) => `<button type="button" class="dash-chip${podSource === id ? ' sel' : ''}" onclick="podLoadSource('${id}')">${lbl}</button>`).join('');

  if (!podItems.length) {
    body.innerHTML = `<div class="dash-filter-row" style="margin-bottom:12px">${srcChips}</div>
      <div class="study-empty">Chưa có mục nào để phát. Hãy chọn thêm bài học ở Trang chủ.</div>`;
    return;
  }
  const cur = podItems[podIdx] || podItems[0];
  const showAns = !podPlaying || podPhase === 'reveal' || podPhase === 'zh2';
  const phaseLabel = !podPlaying ? 'Sẵn sàng phát · Bấm ▶️ để nghe rảnh tay'
    : podPhase === 'zh1' ? '🔊 Đang đọc tiếng Trung...'
    : podPhase === 'wait' ? `🤔 Tự nhẩm nghĩa trong ${podPauseSec} giây...`
    : podPhase === 'reveal' ? '📖 Đáp án & nghĩa tiếng Việt'
    : '🔁 Nhắc lại tiếng Trung';
  const remainSleep = podSleepEndAt > Date.now() ? ` · 🌙 còn ~${Math.max(1, Math.ceil((podSleepEndAt - Date.now()) / 60000))}p` : '';

  body.innerHTML = `
    <div class="dash-filter-row" style="margin-bottom:10px">${srcChips}</div>
    <div style="font-size:.74rem;color:var(--muted);text-align:center;margin-bottom:10px">${podEscape(podSourceNote)} · Mục <b>${podIdx + 1}/${podItems.length}</b>${remainSleep}</div>
    <div class="gf-pod-stage">
      ${cur.tag ? `<div class="gf-pod-tag">${podEscape(cur.tag)}</div>` : ''}
      <div class="gf-pod-hz">${podHideText && podPlaying && !showAns ? '• • •' : podEscape(cur.hz)}</div>
      <div id="pod-answer-box" class="gf-pod-ans" style="opacity:${showAns ? '1' : '0.12'};transition:opacity .25s">
        ${cur.py ? `<div class="gf-pod-py">${podEscape(cur.py)}</div>` : ''}
        <div class="gf-pod-vi">${podEscape(cur.vi)}</div>
        ${cur.hanviet ? `<div class="gf-pod-hv">Hán Việt: ${podEscape(cur.hanviet)}</div>` : ''}
      </div>
      <div id="pod-phase" class="gf-pod-phase">${phaseLabel}</div>
      <div class="gf-pod-controls">
        <button type="button" class="btn btn-sm" onclick="podJump(-1)" aria-label="Từ trước">⏮ Trước</button>
        <button type="button" id="pod-play-btn" class="btn btn-primary" onclick="podTogglePlay()">${podPlaying ? '⏸ Tạm dừng' : '▶️ Bắt đầu phát'}</button>
        <button type="button" class="btn btn-sm" onclick="podJump(1)" aria-label="Từ sau">Tiếp ⏭</button>
      </div>
    </div>
    <div class="gf-pod-opts">
      <label class="gf-pod-opt"><span>⏳ Nghỉ nhớ:</span>
        <select onchange="podPauseSec=Number(this.value)">
          ${[1.5, 2.5, 4, 6].map(s => `<option value="${s}"${podPauseSec === s ? ' selected' : ''}>${s} giây</option>`).join('')}
        </select>
      </label>
      <label class="gf-pod-opt"><span>🌙 Hẹn tắt:</span>
        <select onchange="podSetSleep(this.value)">
          ${[[0, 'Không'], [5, '5 phút'], [10, '10 phút'], [20, '20 phút'], [30, '30 phút']].map(([m, t]) => `<option value="${m}"${podSleepMin === m ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <label class="gf-pod-chk"><input type="checkbox" ${podSlow ? 'checked' : ''} onchange="podSlow=this.checked"> 🐢 Đọc chậm lần đầu</label>
      <label class="gf-pod-chk"><input type="checkbox" ${podRepeat2 ? 'checked' : ''} onchange="podRepeat2=this.checked"> 🔁 Nhắc lại tiếng Trung</label>
      <label class="gf-pod-chk"><input type="checkbox" ${podReadVi ? 'checked' : ''} onchange="podReadVi=this.checked"> 🇻🇳 Đọc nghĩa tiếng Việt</label>
      <label class="gf-pod-chk"><input type="checkbox" ${podHideText ? 'checked' : ''} onchange="podHideText=this.checked;podRender()"> 🙈 Ẩn chữ lúc nghe</label>
    </div>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && podPlaying) podAcquireWakeLock();
  });
}
