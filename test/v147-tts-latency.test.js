#!/usr/bin/env node
// test/v147-tts-latency.test.js — V147 (cập nhật V148): độ trễ / không đọc của Edge-TTS.
// Không cần mạng, không cần Postgres. Nạp THẬT js/audio.js (và đoạn swPlayTracked) vào vm với Audio/fetch/IndexedDB giả.
//   A. (V148) Edge-TTS GỌI TRỰC TIẾP: mỗi đoạn đúng 1 request /api/tts; không có đường nào khác; lỗi → Web Speech.
//   B. Tải trước đoạn kế tiếp (hết khựng giữa các đoạn).
//   C. MỘT phần tử <audio> dùng chung + mở khoá autoplay ở lần chạm đầu + dừng không treo.
//   D. Giao diện: không đòi speechSynthesis; chậm ≠ "bị chặn".
//   (Python: test/test_edge_tts_api.py — retry, rate limit)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

function makeEnv(opts) {
  const o = opts || {};
  const calls = { tts: [], plays: [], logs: [], events: [], audioCtor: 0, listeners: {}, removed: [] };
  let seq = 0;
  class BlobStub { constructor() { this.size = 100; this.type = 'audio/mpeg'; this._id = ++seq; } }
  class FakeAudio {
    constructor(src) { calls.audioCtor++; this.src = src; this.onplay = null; this.onended = null; this.onerror = null; this._t = null; }
    play() {
      calls.plays.push(this.src); calls.events.push('play:' + this.src);
      if (String(this.src).startsWith('data:audio/wav')) return o.unlockReject ? Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) : Promise.resolve();
      if (o.playError) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      setTimeout(() => { if (this.onplay) this.onplay(); this._t = setTimeout(() => { calls.events.push('end:' + this.src); if (this.onended) this.onended(); }, o.endDelay == null ? 1 : o.endDelay); }, 0);
      return Promise.resolve();
    }
    pause() { if (this._t) { clearTimeout(this._t); this._t = null; } }
    removeAttribute() { this.src = undefined; }
    load() { /* trình duyệt thật: không bắn sự kiện error khi không còn src */ }
  }
  async function fetchStub(url, init) {
    if (url === '/api/tts') {
      const body = JSON.parse(init.body); calls.tts.push(body); calls.events.push('tts:' + body.text);
      if (o.ttsDelay) await sleep(o.ttsDelay);
      if (o.ttsFail) return { ok: false, status: 502, json: async () => ({ error: 'x' }) };
      return { ok: true, blob: async () => new BlobStub() };
    }
    throw new Error('URL không mong đợi: ' + url);
  }
  const synth = { speak(u) { calls.tts.push({ webSpeech: u.text }); }, cancel() {}, pause() {}, resume() {}, getVoices() { return []; } };
  const doc = {
    getElementById: () => null,
    addEventListener(ev, fn) { (calls.listeners[ev] = calls.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) { calls.removed.push(ev); calls.listeners[ev] = (calls.listeners[ev] || []).filter(f => f !== fn); },
  };
  const ctx = {
    console: { log: (...a) => calls.logs.push(a.join(' ')), warn: (...a) => calls.logs.push(a.join(' ')) },
    window: { AudioContext: function AudioContext() {}, speechSynthesis: synth },
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    Audio: FakeAudio, Blob: BlobStub,
    URL: { createObjectURL(b) { return 'blob:' + b._id; }, revokeObjectURL() {} },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    fetch: fetchStub,
    authHeaders: () => (o.noAuth ? {} : { Authorization: 'Bearer t' }), // V148: audio.js không còn dùng — nếu lỡ dùng, test A sẽ thấy request lạ
    document: doc,
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, Promise, Error, RegExp, setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/tts-text.js'), ctx);
  vm.runInContext(read('js/audio-hash.js'), ctx);
  vm.runInContext(read('js/audio.js'), ctx);
  return { ctx, calls, R: (c) => vm.runInContext(c, ctx) };
}

console.log('\n[A] Edge-TTS gọi trực tiếp (không có R2)');

test('speak(): đúng 1 request POST /api/tts cho 1 câu — dù đã đăng nhập', async () => {
  const env = makeEnv(); // có authHeaders, nhưng không còn bước nào khác ngoài /api/tts (fetch lạ sẽ ném lỗi)
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.tts.length, 1);
  assert.strictEqual(env.calls.plays.filter(x => String(x).startsWith('blob:')).length, 1);
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_SUCCESS')));
});

test('Edge-TTS lỗi: log EDGE_TTS_API_ERROR + Web Speech dự phòng (không im lặng)', async () => {
  const env = makeEnv({ ttsFail: true });
  await env.R("speak('你好。')");
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_API_ERROR')));
  assert.ok(env.calls.tts.some(t => t.webSpeech === '你好。'));
});

test('js/audio.js không còn dấu vết R2 / thư viện âm thanh / hedge', () => {
  const src = read('js/audio.js');
  for (const bad of ['R2', 'r2.', '/api/audio/resolve', 'audioLibrary', 'TTS_HEDGE', 'ttsAcquireBlob', 'presign']) {
    assert.ok(!src.includes(bad), 'js/audio.js còn chứa: ' + bad);
  }
});

console.log('\n[B] Tải trước đoạn kế tiếp');

test('hội thoại: request đoạn 2 được gửi TRƯỚC khi đoạn 1 phát xong', async () => {
  const env = makeEnv({ noAuth: true, endDelay: 60 });
  await env.R("ttsSpeakSegments([{text:'你好。',voice:'zh-CN-XiaoxiaoNeural',rate:'0.9',gapAfter:0},{text:'再见。',voice:'zh-CN-YunxiNeural',rate:'0.9',gapAfter:0}])");
  const ev = env.calls.events;
  const secondReq = ev.indexOf('tts:再见。');
  const firstEnd = ev.findIndex(e => e.startsWith('end:'));
  assert.ok(secondReq >= 0 && firstEnd >= 0 && secondReq < firstEnd, 'đoạn 2 phải được tải trước: ' + ev.join(','));
  assert.strictEqual(env.calls.plays.length, 2);
});

test('chỉ tải trước 1 đoạn (không bắn cả danh sách cùng lúc)', async () => {
  const env = makeEnv({ noAuth: true, endDelay: 40 });
  const segs = [1, 2, 3, 4].map(i => ({ text: '第' + i + '句。', voice: 'zh-CN-XiaoxiaoNeural', rate: '0.9', gapAfter: 0 }));
  const p = env.R(`ttsSpeakSegments(${JSON.stringify(segs)})`);
  await sleep(15);
  assert.ok(env.calls.tts.length <= 2, 'tại thời điểm đầu chỉ được có tối đa 2 request, thực tế ' + env.calls.tts.length);
  await p;
  assert.strictEqual(env.calls.tts.length, 4);
});

test('dừng giữa chừng: lỗi của request bị huỷ không thành unhandled rejection', async () => {
  const env = makeEnv({ noAuth: true, ttsDelay: 30 });
  let unhandled = 0; const h = () => { unhandled++; }; process.on('unhandledRejection', h);
  const p = env.R("ttsSpeakSegments([{text:'甲。',voice:'zh-CN-XiaoxiaoNeural',rate:'0.9'},{text:'乙。',voice:'zh-CN-XiaoxiaoNeural',rate:'0.9'}])");
  env.R('stopSpeaking()');
  await p; await sleep(80);
  process.removeListener('unhandledRejection', h);
  assert.strictEqual(unhandled, 0);
  assert.strictEqual(env.calls.plays.filter(x => String(x).startsWith('blob:')).length, 0);
});

console.log('\n[C] Một phần tử audio dùng chung + mở khoá autoplay');

test('nhiều lần phát chỉ tạo đúng 1 phần tử Audio', async () => {
  const env = makeEnv({ noAuth: true });
  await env.R("speak('一。')"); await env.R("speak('二。')"); await env.R("speak('三。')");
  assert.strictEqual(env.calls.audioCtor, 1);
  assert.strictEqual(env.calls.plays.length, 3);
});

test('mở khoá: lần chạm đầu phát WAV im lặng trên phần tử dùng chung rồi gỡ listener', async () => {
  const env = makeEnv({ noAuth: true });
  assert.ok((env.calls.listeners.click || []).length === 1, 'phải gắn listener chạm');
  env.calls.listeners.click[0]();
  await sleep(5);
  assert.ok(env.calls.plays.some(s => String(s).startsWith('data:audio/wav')));
  assert.strictEqual(env.R('ttsUnlocked'), true);
  assert.ok(env.calls.removed.includes('click'), 'phải gỡ listener sau khi mở khoá');
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.audioCtor, 1, 'dùng lại đúng phần tử đã mở khoá');
});

test('mở khoá bị từ chối: giữ listener để thử lại ở lần chạm sau', async () => {
  const env = makeEnv({ noAuth: true, unlockReject: true });
  env.calls.listeners.click[0]();
  await sleep(5);
  assert.strictEqual(env.R('ttsUnlocked'), false);
  assert.ok(!env.calls.removed.includes('click'));
});

test('dừng khi đang phát: promise phát được giải phóng (không treo), trạng thái sạch', async () => {
  const env = makeEnv({ noAuth: true, endDelay: 500 });
  const p = env.R("speak('很长的一句话。')");
  await sleep(30);
  env.R('stopSpeaking()');
  const r = await Promise.race([p.then(() => 'done'), sleep(200).then(() => 'hang')]);
  assert.strictEqual(r, 'done');
  assert.strictEqual(env.R('edgeTtsAudio'), null);
  assert.strictEqual(env.R('ttsSeq'), null);
});

test('bấm dừng rồi bấm lại cùng câu: không dùng request cũ đã bị huỷ', async () => {
  const env = makeEnv({ noAuth: true, ttsDelay: 40 });
  env.R("speak('你好。')");
  await sleep(5);
  env.R('stopSpeaking()');
  await env.R("speak('你好。')");
  assert.ok(!env.calls.logs.some(l => l.includes('EDGE_TTS_API_ERROR')), 'không được rơi xuống fallback vì request cũ');
  assert.strictEqual(env.calls.plays.filter(x => String(x).startsWith('blob:')).length, 1);
});

test('play() bị chặn (NotAllowedError): log EDGE_TTS_PLAY_ERROR + fallback, không im lặng', async () => {
  const env = makeEnv({ noAuth: true, playError: true });
  await env.R("speak('你好。')");
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_PLAY_ERROR')));
  assert.ok(env.calls.tts.some(t => t.webSpeech === '你好。'));
});

console.log('\n[D] Giao diện trạng thái âm thanh (study-workspace.js)');

function loadSw(opts) {
  const o = opts || {};
  const src = read('js/study-workspace.js');
  const a = src.indexOf('function swAudioStatusEl');
  const b = src.indexOf('function swPlayTracked');
  const c = src.indexOf('// Tự phát ĐÚNG MỘT lần cho mỗi câu');
  assert.ok(a > 0 && b > a && c > b);
  const el = { textContent: '', dataset: {} };
  const timers = [];
  let hooks = null;
  const ctx = {
    document: { getElementById: (id) => (id === 'rv-audio-status' ? el : null) },
    window: {}, // KHÔNG có speechSynthesis (WebView)
    swPlays: 0, swPlayToken: 0,
    speak: (t, h) => { hooks = h; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
  };
  if (o.noSpeak) delete ctx.speak;
  vm.createContext(ctx);
  vm.runInContext('let swPlays = 0, swAudioKey = null, swPlayToken = 0;\n' + src.slice(a, c), ctx);
  return { el, timers, ctx, hooks: () => hooks, R: (x) => vm.runInContext(x, ctx) };
}

test('không có speechSynthesis vẫn gọi speak() (trước đây báo "blocked" ngay)', () => {
  const t = loadSw();
  t.R("swPlayTracked('你好')");
  assert.ok(t.hooks(), 'speak() phải được gọi');
  assert.strictEqual(t.el.dataset.state, 'playing');
});

test('chậm (>1,8 s) chỉ báo "đang tải", KHÔNG báo bị chặn', () => {
  const t = loadSw();
  t.R("swPlayTracked('你好')");
  const slow = t.timers.find(x => x.ms === 1800);
  assert.ok(slow); slow.fn();
  assert.strictEqual(t.el.dataset.state, 'loading');
  assert.ok(/Đang tải/.test(t.el.textContent));
  t.hooks().start();
  assert.strictEqual(t.el.dataset.state, 'playing');
  t.hooks().end();
  assert.strictEqual(t.el.dataset.state, 'done');
});

test('chỉ báo "bị chặn" khi lỗi thật hoặc quá 60 s', () => {
  const t = loadSw();
  t.R("swPlayTracked('你好')");
  t.hooks().error();
  assert.strictEqual(t.el.dataset.state, 'blocked');
  const t2 = loadSw();
  t2.R("swPlayTracked('你好')");
  const dead = t2.timers.find(x => x.ms === 60000);
  assert.ok(dead); dead.fn();
  assert.strictEqual(t2.el.dataset.state, 'blocked');
});

test('lần phát cũ không ghi đè trạng thái của lần phát mới', () => {
  const t = loadSw();
  t.R("swPlayTracked('一')");
  const old = t.hooks();
  t.R("swPlayTracked('二')");
  old.error();
  assert.strictEqual(t.el.dataset.state, 'playing');
});

runAll();
