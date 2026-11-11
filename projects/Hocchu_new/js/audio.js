// js/audio.js — Text-to-speech (đọc chữ Hán) + hiệu ứng âm thanh đúng/sai + chấm phát âm bằng AI
// TTS / AUDIO
// ════════════════════════════════════════════════════
let browserTtsVoice = null;
let ttsRate = 0.9;
let edgeTtsVoice = 'zh-CN-XiaoxiaoNeural';
let edgeTtsAudio = null;
let edgeTtsObjectUrl = null;
let ttsToken = 0;          // tăng mỗi lần phát/dừng → vòng lặp cũ tự thoát
let ttsSeq = null;         // { token, paused } của chuỗi đang phát
let edgeTtsAbortController = null;
let edgeTtsDbPromise = null;
let edgeTtsInflight = new Map(); // key → Promise<Blob>: bấm nhanh liên tục chỉ tải 1 lần

function initTTS() {
  if (!('speechSynthesis' in window)) return;
  const load = () => {
    const voices = speechSynthesis.getVoices();
    const femaleKeywords = ['Xiaoyi','Xiaoxiao','HuiHui','Yaoyao','Tingting','Hanhan'];
    const zhVoices = voices.filter(v => v.lang && v.lang.startsWith('zh'));
    let pick = null;
    for (const kw of femaleKeywords) {
      pick = zhVoices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()));
      if (pick) break;
    }
    if (!pick) pick = zhVoices.find(v => v.lang === 'zh-CN') || zhVoices[0] || null;
    browserTtsVoice = pick;
  };
  speechSynthesis.onvoiceschanged = load;
  load();
}
initTTS();

function updateSpeed(val) {
  const n = Number(val);
  ttsRate = Number.isFinite(n) ? Math.min(1.2, Math.max(0.8, n)) : 0.9;
  const el = document.getElementById('speed-val');
  if (el) el.textContent = ttsRate.toFixed(2);
  if (typeof progressState !== 'undefined' && progressState.ui) {
    progressState.ui.ttsRate = ttsRate;
    if (typeof cacheProgressLocally === 'function') cacheProgressLocally();
    if (typeof scheduleSync === 'function') scheduleSync();
  }
}

function updateTtsVoice(value) {
  edgeTtsVoice = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'].includes(value)
    ? value : 'zh-CN-XiaoxiaoNeural';
  if (typeof progressState !== 'undefined' && progressState.ui) {
    progressState.ui.ttsVoice = edgeTtsVoice;
    if (typeof cacheProgressLocally === 'function') cacheProgressLocally();
    if (typeof scheduleSync === 'function') scheduleSync();
  }
}

// Split text into natural phrase chunks for the Web Speech fallback.
function splitPhrases(text) {
  const parts = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    if ('，。！？、；…—,!?;'.includes(text[i])) {
      parts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter(Boolean);
}

function edgeTtsOpenDb() {
  if (edgeTtsDbPromise) return edgeTtsDbPromise;
  edgeTtsDbPromise = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open('hsk-edge-tts-cache-v1', 1); }
    catch (_) { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('audio')) {
        const store = db.createObjectStore('audio', { keyPath: 'key' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return edgeTtsDbPromise;
}

async function edgeTtsCacheKey(text, voice, rate) {
  // V141: cùng chuỗi canonical với server (js/audio-hash.js) → content_hash của thư viện R2.
  const raw = (typeof AH !== 'undefined' && AH.canonical)
    ? AH.canonical(text, voice, rate)
    : voice + '|' + rate + '|' + text;
  if (window.crypto && crypto.subtle && window.TextEncoder) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback key is still deterministic; text is not stored in IndexedDB.
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'fnv-' + (h >>> 0).toString(16);
}

async function edgeTtsCacheGet(key) {
  const db = await edgeTtsOpenDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction('audio', 'readonly').objectStore('audio').get(key);
      req.onsuccess = () => resolve(req.result && req.result.blob instanceof Blob ? req.result.blob : null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

function edgeTtsIdbWrite(db, row) {
  return new Promise(resolve => {
    try {
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(row);
      tx.oncomplete = () => resolve('ok');
      tx.onerror = () => resolve('error');
      tx.onabort = () => resolve(tx.error && tx.error.name === 'QuotaExceededError' ? 'quota' : 'error');
    } catch (e) { resolve(e && e.name === 'QuotaExceededError' ? 'quota' : 'error'); }
  });
}

// Giữ tối đa 300 bản / 40 MB; keepFraction < 1 dùng khi IndexedDB hết dung lượng (xoá nửa cũ).
async function edgeTtsCachePrune(keepFraction) {
  const db = await edgeTtsOpenDb();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const tx = db.transaction('audio', 'readwrite');
      const store = tx.objectStore('audio');
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const rows = (allReq.result || []).sort((a, b) => a.createdAt - b.createdAt);
        let totalBytes = rows.reduce((sum, row) => sum + (row.blob && row.blob.size || 0), 0);
        let removeCount = Math.max(0, rows.length - 300);
        if (keepFraction) removeCount = Math.max(removeCount, Math.ceil(rows.length * (1 - keepFraction)));
        for (const row of rows) {
          if (removeCount <= 0 && totalBytes <= 40 * 1024 * 1024) break;
          store.delete(row.key);
          totalBytes -= row.blob && row.blob.size || 0;
          removeCount = Math.max(0, removeCount - 1);
        }
      };
      tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
    } catch (_) { resolve(); }
  });
}

async function edgeTtsCachePut(key, blob, meta) {
  const db = await edgeTtsOpenDb();
  if (!db) return;
  const row = {
    key, blob, createdAt: Date.now(),
    voice: meta && meta.voice,
    rate: meta && meta.rate,
    format: (typeof AH !== 'undefined' ? AH.FORMAT : 'mp3'),
    ttsVersion: (typeof AH !== 'undefined' ? AH.TTS_VERSION : ''),
  };
  let status = await edgeTtsIdbWrite(db, row);
  if (status === 'quota') { await edgeTtsCachePrune(0.5); status = await edgeTtsIdbWrite(db, row); }
  if (status !== 'ok') return;
  await edgeTtsCachePrune(0);
}

async function edgeTtsCacheDelete(key) {
  const db = await edgeTtsOpenDb();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').delete(key);
      tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
    } catch (_) { resolve(); }
  });
}

function ttsStopCurrent() {
  if (edgeTtsAbortController) {
    try { edgeTtsAbortController.abort(); } catch (_) {}
    edgeTtsAbortController = null;
  }
  if (edgeTtsAudio) {
    try { edgeTtsAudio.pause(); edgeTtsAudio.removeAttribute('src'); edgeTtsAudio.load(); } catch (_) {}
    edgeTtsAudio = null;
  }
  if (edgeTtsObjectUrl) {
    try { URL.revokeObjectURL(edgeTtsObjectUrl); } catch (_) {}
    edgeTtsObjectUrl = null;
  }
  ttsSeq = null;
  if ('speechSynthesis' in window) {
    try { speechSynthesis.cancel(); } catch (_) {}
  }
}

function ttsStop() { ttsToken++; ttsStopCurrent(); }

function speakWithWebSpeech(text, hooks, rate) {
  if (!('speechSynthesis' in window)) {
    if (hooks && hooks.error) hooks.error();
    return;
  }
  const r = Number(rate);
  const useRate = Number.isFinite(r) && r > 0 ? r : ttsRate;
  const phrases = splitPhrases(text);
  const make = (part, quiet) => {
    const utt = new SpeechSynthesisUtterance(part);
    utt.lang = 'zh-CN'; utt.rate = useRate;
    if (quiet) utt.volume = 0; else utt.pitch = 1.05;
    if (browserTtsVoice) utt.voice = browserTtsVoice;
    return utt;
  };
  if (phrases.length <= 1) {
    const utt = make(text, false);
    if (hooks) {
      utt.onstart = () => hooks.start && hooks.start();
      utt.onend = () => hooks.end && hooks.end();
      utt.onerror = () => hooks.error && hooks.error();
    }
    speechSynthesis.speak(utt);
    return;
  }
  phrases.forEach((phrase, i) => {
    const utt = make(phrase, false);
    if (hooks && i === 0) utt.onstart = () => hooks.start && hooks.start();
    if (hooks && i === phrases.length - 1) utt.onend = () => hooks.end && hooks.end();
    if (hooks) utt.onerror = () => hooks.error && hooks.error();
    speechSynthesis.speak(utt);
    if (i < phrases.length - 1) speechSynthesis.speak(make(' ', true));
  });
}

// Edge-TTS is the primary voice. If its endpoint/network is unavailable, retain
// the existing browser TTS as a graceful fallback; never block a learning action.
// Every attempt ends in exactly one diagnostic tag so a fallback is never silent.
// Tags: EDGE_TTS_SUCCESS · EDGE_TTS_API_ERROR · EDGE_TTS_PLAY_ERROR · WEB_SPEECH_FALLBACK
function edgeTtsLog(tag, detail) {
  const line = tag + (detail ? ' · ' + detail : '');
  if (tag === 'EDGE_TTS_SUCCESS') console.log('[TTS] ' + line);
  else console.warn('[TTS] ' + line);
  const el = document.getElementById('tts-status');
  if (el) el.textContent = line;
}

function ttsError(kind, message, name) {
  const e = new Error(message);
  e.ttsKind = kind;
  if (name) e.name = name;
  return e;
}

async function edgeTtsFetch(text, voice, rate) {
  const controller = new AbortController();
  edgeTtsAbortController = controller;
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
      signal: controller.signal
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw ttsError('api', 'HTTP ' + response.status + (data.error ? ' · ' + data.error : ''));
    }
    const blob = await response.blob();
    if (!blob || blob.size < 4 || (blob.type && !blob.type.includes('audio'))) {
      throw ttsError('api', 'Tệp âm thanh không hợp lệ');
    }
    return blob;
  } catch (err) {
    if (err && err.ttsKind) throw err;
    throw ttsError('api', err && err.name ? err.name : 'lỗi mạng');
  } finally {
    clearTimeout(timeout);
    if (edgeTtsAbortController === controller) edgeTtsAbortController = null;
  }
}

// V141 — thư viện âm thanh R2 dùng chung. Thứ tự: IndexedDB → server/R2 → Edge-TTS trực tiếp → Web Speech.
// Chưa đăng nhập (không có authHeaders) thì bỏ qua bước R2, giữ nguyên đường Edge-TTS cũ.
async function audioLibraryResolve(text, voice, rate, signal) {
  const headers = typeof authHeaders === 'function' ? authHeaders() : {};
  if (!headers.Authorization) { edgeTtsLog('AUDIO_LIBRARY_SKIP', 'no_auth'); return null; }
  const response = await fetch('/api/audio/resolve', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify({ text, voice, rate }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok || !data.url) {
    const code = (data && data.code) ? data.code : 'HTTP ' + response.status;
    edgeTtsLog('AUDIO_LIBRARY_MISS', code + (data && data.detail ? ':' + data.detail : ''));
    return null;
  }
  return data;
}

async function audioFetchBlob(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob || blob.size < 4 || (blob.type && !blob.type.includes('audio'))) return null;
  return blob;
}

async function audioLibraryBlob(text, voice, rate) {
  const controller = new AbortController();
  edgeTtsAbortController = controller;
  const timeout = setTimeout(() => controller.abort(), 50000);
  try {
    let data = await audioLibraryResolve(text, voice, rate, controller.signal);
    if (!data) return null;
    let blob = await audioFetchBlob(data.url, controller.signal);
    if (!blob) {
      // Neon ghi ready nhưng tệp R2 mất/hỏng → hỏi lại 1 lần (server HEAD, tạo lại nếu cần).
      data = await audioLibraryResolve(text, voice, rate, controller.signal);
      if (data) blob = await audioFetchBlob(data.url, controller.signal);
    }
    if (!blob) { edgeTtsLog('AUDIO_LIBRARY_MISS', 'r2_fetch_failed'); return null; }
    edgeTtsLog(data.cached ? 'AUDIO_LIBRARY_HIT' : 'AUDIO_LIBRARY_CREATED', voice + ' · ' + rate);
    return blob;
  } catch (err) {
    if (err && err.name !== 'AbortError') edgeTtsLog('AUDIO_LIBRARY_MISS', err.name || 'network');
    return null;
  } finally {
    clearTimeout(timeout);
    if (edgeTtsAbortController === controller) edgeTtsAbortController = null;
  }
}

async function ttsBlobFor(text, voice, rate) {
  const key = await edgeTtsCacheKey(text, voice, rate);
  const cached = await edgeTtsCacheGet(key);
  if (cached) { edgeTtsLog('AUDIO_CACHE_HIT', voice + ' · ' + rate); return cached; }
  const running = edgeTtsInflight.get(key);
  if (running) return running;
  const job = (async () => {
    let blob = await audioLibraryBlob(text, voice, rate);
    if (!blob) blob = await edgeTtsFetch(text, voice, rate);
    await edgeTtsCachePut(key, blob, { voice, rate });
    return blob;
  })().finally(() => edgeTtsInflight.delete(key));
  edgeTtsInflight.set(key, job);
  return job;
}

// Phát 1 blob; resolve khi kết thúc, reject khi lỗi phát/giải mã.
function ttsPlayBlob(blob, onStart) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    edgeTtsAudio = audio;
    edgeTtsObjectUrl = url;
    audio.preload = 'auto';
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      try { URL.revokeObjectURL(url); } catch (_) {}
      if (edgeTtsObjectUrl === url) edgeTtsObjectUrl = null;
      if (edgeTtsAudio === audio) edgeTtsAudio = null;
      if (err) { try { err.ttsKind = 'play'; } catch (_) {} reject(err); } else resolve();
    };
    audio.onplay = () => { if (onStart) onStart(); };
    audio.onended = () => finish(null);
    audio.onerror = () => finish(ttsError('play', 'media'));
    audio.play().catch(finish);
  });
}

async function ttsPlaySegment(seg, onStart, token) {
  let blob = await ttsBlobFor(seg.text, seg.voice, seg.rate);
  if (token != null && token !== ttsToken) return; // đã bấm dừng trong lúc tải → không phát nữa
  try {
    await ttsPlayBlob(blob, onStart);
  } catch (err) {
    // Cache hỏng (không giải mã được) → xoá bản lỗi và tải lại đúng 1 lần.
    if (!err || (err.name !== 'NotSupportedError' && err.name !== 'EncodingError')) throw err;
    const key = await edgeTtsCacheKey(seg.text, seg.voice, seg.rate);
    await edgeTtsCacheDelete(key);
    blob = await ttsBlobFor(seg.text, seg.voice, seg.rate);
    if (token != null && token !== ttsToken) return;
    await ttsPlayBlob(blob, onStart);
  }
}

function ttsAwaitResume(seq) {
  return new Promise(resolve => {
    const tick = () => {
      if (seq.token !== ttsToken || !seq.paused) return resolve();
      setTimeout(tick, 100);
    };
    tick();
  });
}

function ttsWait(ms, seq) {
  return new Promise(resolve => {
    const tick = () => {
      if (seq.token !== ttsToken) return resolve();
      if (seq.paused) { setTimeout(tick, 100); return; }
      setTimeout(resolve, ms);
    };
    tick();
  });
}

// Phát lần lượt các đoạn (mỗi đoạn 1 giọng/tốc độ), không chồng lấn, dừng/tiếp tục được.
// segments: [{ text, voice, rate, gapAfter }]
async function ttsSpeakSegments(segments, hooks) {
  const defaultRate = (Math.round(ttsRate * 10) / 10).toFixed(1);
  const list = (segments || [])
    .filter(s => s && typeof s.text === 'string' && s.text.trim())
    .map(s => ({
      text: s.text,
      voice: s.voice || edgeTtsVoice,
      rate: s.rate || defaultRate,
      gapAfter: s.gapAfter,
    }));
  if (!list.length) { if (hooks && hooks.error) hooks.error(); return; }
  const token = ++ttsToken;
  ttsStopCurrent();
  const seq = { token, paused: false };
  ttsSeq = seq;
  let started = false;
  const onStart = () => { if (!started) { started = true; if (hooks && hooks.start) hooks.start(); } };
  const fallback = (from, why) => {
    const rest = list.slice(from).map(s => s.text).join('');
    edgeTtsLog('WEB_SPEECH_FALLBACK', why);
    speakWithWebSpeech(rest, {
      start: started ? null : (hooks && hooks.start),
      end: hooks && hooks.end,
      error: hooks && hooks.error,
    }, list[from] && list[from].rate);
  };
  for (let i = 0; i < list.length; i++) {
    if (token !== ttsToken) return;
    const seg = list[i];
    await ttsAwaitResume(seq);
    if (token !== ttsToken) return;
    try {
      await ttsPlaySegment(seg, onStart, token);
    } catch (err) {
      if (token !== ttsToken) return;
      if (err && err.ttsKind === 'api') {
        edgeTtsLog('EDGE_TTS_API_ERROR', err.message || 'lỗi không rõ');
        fallback(i, 'api');
      } else {
        edgeTtsLog('EDGE_TTS_PLAY_ERROR', err && err.name ? err.name : 'lỗi không rõ');
        fallback(i, 'play');
      }
      return;
    }
    if (token !== ttsToken) return;
    const gap = seg.gapAfter != null ? seg.gapAfter : (typeof TT !== 'undefined' ? TT.pauseAfter(seg.text) : 0);
    if (gap > 0 && i < list.length - 1) await ttsWait(gap, seq);
  }
  if (token !== ttsToken) return;
  edgeTtsLog('EDGE_TTS_SUCCESS', list.length > 1 ? list.length + ' đoạn' : (list[0].voice || ''));
  if (ttsSeq === seq) ttsSeq = null;
  if (hooks && hooks.end) hooks.end();
}

async function speak(text, hooks, opts) {
  if (typeof text !== 'string' || !text.trim()) {
    if (hooks && hooks.error) hooks.error();
    return;
  }
  if (!(opts && opts.raw) && typeof ttsResolve === 'function') text = ttsResolve(text);
  const cleanText = text.trim();
  const rate = (opts && opts.rate) ? String(opts.rate) : (Math.round(ttsRate * 10) / 10).toFixed(1);
  const split = (typeof TT !== 'undefined' && TT.splitSpeech) ? TT.splitSpeech : (t => [t]);
  const chunks = split(cleanText, (typeof TT !== 'undefined' && TT.DEFAULT_MAX) || 480);
  const segments = chunks.map(c => ({
    text: c,
    voice: edgeTtsVoice,
    rate,
    gapAfter: (typeof TT !== 'undefined' && TT.pauseAfter) ? TT.pauseAfter(c) : 0,
  }));
  await ttsSpeakSegments(segments, hooks);
}

// Nghe chậm: chỉ đổi tốc độ cho lần phát này, không đổi cài đặt chung.
function speakSlow(text, hooks) { return speak(text, hooks, { rate: '0.8' }); }

// Nút "Kiểm tra giọng đọc": gọi thẳng endpoint thật (bỏ qua cache) cho từng giọng
// và báo rõ kết quả ở #tts-status, tách lỗi API với lỗi phát.
async function testTtsVoice(voice) {
  ttsStop();
  edgeTtsLog('EDGE_TTS_TEST', voice);
  let blob;
  try {
    blob = await edgeTtsFetch('你好，这是语音测试。', voice, '0.9');
  } catch (err) {
    edgeTtsLog('EDGE_TTS_API_ERROR', voice + ' · ' + (err && err.message ? err.message : 'lỗi không rõ'));
    return;
  }
  try {
    await ttsPlayBlob(blob, null);
    edgeTtsLog('EDGE_TTS_SUCCESS', voice + ' · test');
  } catch (err) {
    edgeTtsLog('EDGE_TTS_PLAY_ERROR', voice + ' · ' + (err && err.name ? err.name : 'lỗi không rõ'));
  }
}

function pauseSpeaking() {
  if (ttsSeq) ttsSeq.paused = true;
  if (edgeTtsAudio) { try { edgeTtsAudio.pause(); } catch (_) {} }
  else if ('speechSynthesis' in window) { try { speechSynthesis.pause(); } catch (_) {} }
}

function resumeSpeaking() {
  if (ttsSeq) ttsSeq.paused = false;
  if (edgeTtsAudio) { edgeTtsAudio.play().catch(() => {}); }
  else if ('speechSynthesis' in window) { try { speechSynthesis.resume(); } catch (_) {} }
}

function stopSpeaking() { ttsStop(); }

const AC = new (window.AudioContext || window.webkitAudioContext || function(){})();
function playDing() {
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    o.type='sine'; o.frequency.value=880;
    g.gain.setValueAtTime(.3,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.4);
    o.start(); o.stop(AC.currentTime+.4);
  } catch {}
}
function playBuzz() {
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    o.type='sawtooth'; o.frequency.value=140;
    g.gain.setValueAtTime(.25,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.35);
    o.start(); o.stop(AC.currentTime+.35);
  } catch {}
}

// ════════════════════════════════════════════════════
