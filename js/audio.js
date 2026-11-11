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
let edgeTtsControllers = new Set(); // V148: các request /api/tts đang chạy (đoạn hiện tại + đoạn tải trước) → bấm dừng hủy được hết
let edgeTtsDbPromise = null;
let ttsEl = null;          // V147: MỘT phần tử <audio> dùng lại cho mọi lần phát (iOS/Safari chỉ mở khoá autoplay cho phần tử đã được chạm)
let ttsPlayCancel = null;  // V147: huỷ lần phát đang chờ (dừng bấm → promise phát được giải phóng, không treo)
let ttsUnlocked = false;
const TTS_SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
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
  // Khoá cache IndexedDB = SHA-256 của chuỗi canonical (js/audio-hash.js). Giữ nguyên để không làm mất cache cũ của người học.
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

function ttsTrackController(controller) { edgeTtsControllers.add(controller); return controller; }
function ttsUntrackController(controller) { edgeTtsControllers.delete(controller); }

function ttsStopCurrent() {
  edgeTtsControllers.forEach(c => { try { c.abort(); } catch (_) {} });
  edgeTtsControllers.clear();
  edgeTtsInflight.clear(); // request vừa bị huỷ không được dùng lại cho lần bấm kế tiếp
  const cancel = ttsPlayCancel;
  ttsPlayCancel = null;
  if (cancel) { try { cancel(); } catch (_) {} }
  if (edgeTtsAudio) {
    try { edgeTtsAudio.pause(); } catch (_) {}
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

// Thứ tự lấy âm thanh: IndexedDB (máy người học) → Edge-TTS trực tiếp (/api/tts) → Web Speech dự phòng.
async function edgeTtsFetch(text, voice, rate) {
  const controller = ttsTrackController(new AbortController());
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
    ttsUntrackController(controller);
  }
}

async function ttsBlobFor(text, voice, rate) {
  const key = await edgeTtsCacheKey(text, voice, rate);
  const cached = await edgeTtsCacheGet(key);
  if (cached) { edgeTtsLog('AUDIO_CACHE_HIT', voice + ' · ' + rate); return cached; }
  const running = edgeTtsInflight.get(key);
  if (running) return running;
  let putDone = Promise.resolve();
  const job = (async () => {
    const blob = await edgeTtsFetch(text, voice, rate); // V148: gọi Edge-TTS trực tiếp (/api/tts), không qua kho lưu trữ nào
    putDone = edgeTtsCachePut(key, blob, { voice, rate }).catch(() => {});
    // Chờ ghi cache tối đa 150 ms (đủ để "cache hỏng → xoá → tải lại" không bị ghi đè); IndexedDB chậm hơn thì cứ phát, ghi tiếp nền.
    await Promise.race([putDone, new Promise(r => setTimeout(r, 150))]);
    return blob;
  })();
  const release = () => { if (edgeTtsInflight.get(key) === job) edgeTtsInflight.delete(key); };
  job.then(() => putDone.then(release, release), release);
  edgeTtsInflight.set(key, job);
  return job;
}

// V147 — phần tử audio DÙNG CHUNG. Trình duyệt (nhất là iOS Safari) chỉ cho phát tự động trên phần tử đã được
// "chạm" bằng thao tác người dùng; tạo `new Audio()` mới sau mỗi lần await mạng thì lần nào cũng bị chặn.
function ttsElement() {
  if (!ttsEl) { ttsEl = new Audio(); try { ttsEl.preload = 'auto'; } catch (_) {} }
  return ttsEl;
}

// Mở khoá âm thanh ở thao tác chạm ĐẦU TIÊN của người dùng (bất kỳ chỗ nào): phát 1 tệp WAV im lặng trên đúng phần tử dùng chung.
let ttsUnlocking = false;
let ttsUnlockCleanup = null;
function ttsUnlockDone() {
  ttsUnlocked = true; ttsUnlocking = false;
  if (ttsUnlockCleanup) { ttsUnlockCleanup(); ttsUnlockCleanup = null; }
}
function ttsUnlock() {
  if (ttsUnlocked || ttsUnlocking) return;
  try {
    if (typeof AC !== 'undefined' && AC && AC.state === 'suspended' && AC.resume) AC.resume().catch(() => {});
  } catch (_) {}
  if (edgeTtsAudio) { ttsUnlockDone(); return; } // đang phát thật rồi → đã được phép
  try {
    const el = ttsElement();
    ttsUnlocking = true;
    el.src = TTS_SILENT_WAV;
    const p = el.play();
    const quiet = () => { if (!edgeTtsAudio) { try { el.pause(); el.removeAttribute('src'); } catch (_) {} } };
    if (p && typeof p.then === 'function') {
      p.then(() => { quiet(); ttsUnlockDone(); }, () => { ttsUnlocking = false; });
    } else { quiet(); ttsUnlockDone(); }
  } catch (_) { ttsUnlocking = false; }
}
(function ttsInstallUnlock() {
  if (typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
  const events = ['touchend', 'pointerup', 'click', 'keydown'];
  const handler = () => ttsUnlock();
  events.forEach(e => document.addEventListener(e, handler, true));
  ttsUnlockCleanup = () => events.forEach(e => document.removeEventListener(e, handler, true));
})();

// Phát 1 blob; resolve khi kết thúc (hoặc khi bị dừng), reject khi lỗi phát/giải mã.
function ttsPlayBlob(blob, onStart) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = ttsElement();
    audio.onplay = audio.onended = audio.onerror = null;
    edgeTtsAudio = audio;
    edgeTtsObjectUrl = url;
    let done = false;
    const cleanup = () => {
      audio.onplay = audio.onended = audio.onerror = null;
      try { URL.revokeObjectURL(url); } catch (_) {}
      if (edgeTtsObjectUrl === url) edgeTtsObjectUrl = null;
      if (edgeTtsAudio === audio) edgeTtsAudio = null;
      if (ttsPlayCancel === cancel) ttsPlayCancel = null;
    };
    const finish = (err) => {
      if (done) return;
      done = true;
      cleanup();
      if (err) { try { err.ttsKind = 'play'; } catch (_) {} reject(err); } else resolve();
    };
    const cancel = () => { if (done) return; done = true; cleanup(); resolve(); };
    ttsPlayCancel = cancel;
    audio.onplay = () => { if (onStart) onStart(); };
    audio.onended = () => finish(null);
    audio.onerror = () => finish(ttsError('play', 'media'));
    try { audio.src = url; } catch (e) { finish(e); return; }
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(finish);
  });
}

async function ttsPlaySegment(seg, onStart, token, blobPromise) {
  let blob = await (blobPromise || ttsBlobFor(seg.text, seg.voice, seg.rate));
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
  // V147: tải trước đoạn kế tiếp trong lúc đoạn hiện tại đang tải/phát → hết khựng giữa các đoạn / lượt hội thoại.
  const blobs = [];
  const want = (j) => {
    if (j >= list.length) return null;
    if (!blobs[j]) { blobs[j] = ttsBlobFor(list[j].text, list[j].voice, list[j].rate); blobs[j].catch(() => {}); }
    return blobs[j];
  };
  for (let i = 0; i < list.length; i++) {
    if (token !== ttsToken) return;
    const seg = list[i];
    want(i); want(i + 1);
    await ttsAwaitResume(seq);
    if (token !== ttsToken) return;
    try {
      await ttsPlaySegment(seg, onStart, token, blobs[i]);
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
