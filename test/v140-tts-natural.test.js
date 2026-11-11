#!/usr/bin/env node
// test/v140-tts-natural.test.js — V140: Edge-TTS đọc tự nhiên, câu dài, hội thoại nhiều nhân vật,
// luyện nghe, cache và các nhánh lỗi. KHÔNG cần mạng, KHÔNG cần Postgres.
//
// Phần A kiểm hàm thuần (js/tts-text.js): chia đoạn không đổi nội dung, ngắt nghỉ theo dấu câu,
// khoá cache, chuyển giọng theo nhân vật.
// Phần B nạp THẬT js/audio.js vào vm với Audio/fetch/IndexedDB giả: thứ tự phát, không chồng lấn,
// dừng/tiếp tục, cache, mạng lỗi và lỗi API.
// KHÔNG đo được độ tự nhiên thật của giọng — phải nghe trên thiết bị thật (xem báo cáo V140).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TT = require('../js/tts-text.js');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// A. Hàm thuần
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[A] Chia văn bản / ngắt nghỉ / khoá cache / hội thoại');

test('câu ngắn: 1 đoạn, giữ nguyên từng ký tự', () => {
  assert.deepStrictEqual(TT.splitSpeech('你好。', 480), ['你好。']);
  assert.deepStrictEqual(TT.splitSpeech('你叫什么名字？', 480), ['你叫什么名字？']);
});

test('câu dài: ghép lại ĐÚNG chuỗi gốc, mỗi đoạn ≤ giới hạn, không thêm khoảng trắng', () => {
  const long = '今天天气很好。'.repeat(100) + '我们去公园散步吧！';
  const chunks = TT.splitSpeech(long, 60);
  assert.ok(chunks.length > 1);
  assert.strictEqual(chunks.join(''), long);
  for (const c of chunks) assert.ok(c.length <= 60, 'đoạn quá dài: ' + c.length);
  assert.ok(!chunks.join('').includes(' '), 'không được chèn khoảng trắng');
});

test('không cắt giữa từ: mọi ranh giới đoạn trùng ranh giới từ của Intl.Segmenter', () => {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return;
  const seg = new Intl.Segmenter('zh-Hans', { granularity: 'word' });
  const text = '我们每天都在学校里认真学习汉语';
  const chunks = TT.splitSpeech(text, 5);
  const bounds = new Set([0]);
  let pos = 0;
  for (const p of seg.segment(text)) bounds.add(pos += p.segment.length);
  let at = 0;
  for (const c of chunks) { at += c.length; assert.ok(bounds.has(at), 'cắt giữa từ tại vị trí ' + at); }
  assert.strictEqual(chunks.join(''), text);
});

test('dấu câu: 。！？ nghỉ lâu hơn ，、； và không đổi nội dung', () => {
  assert.ok(TT.pauseAfter('你好。') > TT.pauseAfter('你好，'));
  assert.ok(TT.pauseAfter('你好！') > TT.pauseAfter('你好、'));
  assert.strictEqual(TT.pauseAfter(''), 0);
  const s = '早上我吃包子，喝汤。你要吃什么？好的！';
  assert.strictEqual(TT.splitSpeech(s, 480).join(''), s);
});

test('khoá cache phân biệt nội dung, giọng và tốc độ', () => {
  assert.strictEqual(TT.cacheKeyText('v', '0.9', '你好'), TT.cacheKeyText('v', '0.9', '你好'));
  assert.notStrictEqual(TT.cacheKeyText('v1', '0.9', '你好'), TT.cacheKeyText('v2', '0.9', '你好'));
  assert.notStrictEqual(TT.cacheKeyText('v', '0.8', '你好'), TT.cacheKeyText('v', '0.9', '你好'));
  assert.notStrictEqual(TT.cacheKeyText('v', '0.9', '你好'), TT.cacheKeyText('v', '0.9', '再见'));
});

test('hội thoại: giọng mặc định theo nhân vật (甲 nữ / 乙 nam), khoảng nghỉ giữa lượt', () => {
  const turns = [{ who: 'A', hz: '你好。' }, { who: 'B', hz: '我叫王明。' }, { who: 'A', hz: '再见。' }];
  const segs = TT.conversationSegments(turns, null, 600);
  assert.deepStrictEqual(segs.map(s => s.voice), ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural']);
  assert.deepStrictEqual(segs.map(s => s.gapAfter), [600, 600, 0]);
  assert.strictEqual(TT.defaultVoiceFor('A'), 'zh-CN-XiaoxiaoNeural');
  assert.strictEqual(TT.defaultVoiceFor('B'), 'zh-CN-YunxiNeural');
  assert.strictEqual(TT.defaultVoiceFor('male'), 'zh-CN-YunxiNeural');
});

test('hội thoại: chọn giọng từng lượt ghi đè mặc định', () => {
  const turns = [{ who: 'A', hz: '你好。' }, { who: 'B', hz: '再见。' }];
  const segs = TT.conversationSegments(turns, ['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural'], 500);
  assert.deepStrictEqual(segs.map(s => s.voice), ['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural']);
  assert.deepStrictEqual(segs.map(s => s.text), ['你好。', '再见。']);
});

// ══════════════════════════════════════════════════════════════════════════════
// B. js/audio.js chạy thật với Audio/fetch/IndexedDB giả
// ══════════════════════════════════════════════════════════════════════════════
function makeEnv(opts) {
  const options = opts || {};
  const calls = { fetch: [], logs: [], plays: [], pauses: [], tts: [], events: [] };
  let seq = 0;
  const blobByUrl = new Map();

  class BlobStub {
    constructor() { this.size = options.blobSize == null ? 100 : options.blobSize; this.type = 'audio/mpeg'; this._id = ++seq; }
  }

  class FakeAudio {
    constructor(src) { this.src = src; this.paused = false; this._timer = null; this.onplay = null; this.onended = null; this.onerror = null; }
    play() {
      calls.plays.push(this.src);
      calls.events.push('play:' + this.src);
      const blob = blobByUrl.get(this.src);
      if (blob && blob.corrupt) return Promise.reject(Object.assign(new Error('decode'), { name: 'NotSupportedError' }));
      if (options.playError) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      const self = this;
      setTimeout(() => {
        if (self.onplay) self.onplay();
        self._timer = setTimeout(() => {
          calls.events.push('end:' + self.src);
          if (self.onended) self.onended();
        }, options.endDelay == null ? 1 : options.endDelay);
      }, 0);
      return Promise.resolve();
    }
    pause() { calls.pauses.push(this.src); this.paused = true; if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
    removeAttribute() {}
    load() { setTimeout(() => { if (this.onerror) this.onerror(); }, 0); }
  }

  const synth = {
    speak(u) { calls.tts.push(u.text); },
    cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
  };

  async function fetchStub(url, init) {
    const body = JSON.parse(init.body);
    calls.fetch.push(body);
    if (options.fetchDelay) await sleep(options.fetchDelay);
    if (options.netError) throw Object.assign(new Error('network'), { name: options.netError });
    const blob = new BlobStub();
    blob.corrupt = !!options.corruptFirst && calls.fetch.length === 1;
    return { ok: true, blob: async () => blob };
  }

  const idb = options.withIdb ? makeIdb() : null;
  const win = { AudioContext: function AudioContext() {}, speechSynthesis: synth };
  if (idb) win.indexedDB = idb;

  const ctx = {
    console: { log: (...a) => calls.logs.push(a.join(' ')), warn: (...a) => calls.logs.push(a.join(' ')) },
    window: win,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.volume = 1; this.pitch = 1; } },
    Audio: FakeAudio,
    Blob: BlobStub,
    URL: {
      createObjectURL(blob) { const u = 'blob:' + blob._id; blobByUrl.set(u, blob); return u; },
      revokeObjectURL() {},
    },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    fetch: fetchStub,
    document: { getElementById: () => null },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, Promise, Error, RegExp,
    setTimeout, clearTimeout,
  };
  if (idb) ctx.indexedDB = idb;
  vm.createContext(ctx);
  vm.runInContext(read('js/tts-text.js'), ctx);
  vm.runInContext(read('js/audio.js'), ctx);
  return { ctx, calls, idb, R: (code) => vm.runInContext(code, ctx) };
}

// IndexedDB tối giản: đủ cho get/put/delete/getAll của js/audio.js.
function makeIdb() {
  const store = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      tx.objectStore = () => ({
        get(k) { const req = {}; setTimeout(() => { req.result = store.get(k); if (req.onsuccess) req.onsuccess(); }, 0); return req; },
        put(v) { store.set(v.key, v); },
        delete(k) { store.delete(k); },
        getAll() { const req = {}; setTimeout(() => { req.result = [...store.values()]; if (req.onsuccess) req.onsuccess(); }, 0); return req; },
      });
      return tx;
    },
  };
  return { open() { const req = { result: db }; setTimeout(() => { if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); }, 0); return req; }, _store: store };
}

console.log('\n[B] Phát tuần tự, dừng/tiếp tục, cache và lỗi');

test('câu ngắn: 1 request đúng giọng/tốc độ, phát 1 lần, log EDGE_TTS_SUCCESS', async () => {
  const env = makeEnv();
  await env.R("speak('你好。')");
  assert.deepStrictEqual(env.calls.fetch.map(f => f.text), ['你好。']);
  assert.strictEqual(env.calls.fetch[0].voice, 'zh-CN-XiaoxiaoNeural');
  assert.strictEqual(env.calls.fetch[0].rate, '0.9');
  assert.strictEqual(env.calls.plays.length, 1);
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_SUCCESS')));
});

test('câu dài: nhiều request theo đúng thứ tự, ghép đúng nội dung, không chồng lấn', async () => {
  const text = '今天天气很好。'.repeat(100) + '我们去公园散步吧！';
  const env = makeEnv();
  await env.R(`speak(${JSON.stringify(text)})`);
  assert.ok(env.calls.fetch.length > 1, 'phải chia nhiều request');
  assert.strictEqual(env.calls.fetch.map(f => f.text).join(''), text);
  const plays = env.calls.events.filter(e => e.startsWith('play:'));
  const ends = env.calls.events.filter(e => e.startsWith('end:'));
  assert.strictEqual(plays.length, env.calls.fetch.length);
  for (let i = 1; i < plays.length; i++) {
    assert.ok(env.calls.events.indexOf(plays[i]) > env.calls.events.indexOf(ends[i - 1]), 'đoạn ' + i + ' phát chồng lấn');
  }
});

test('hội thoại 2 nhân vật: giọng chuyển đúng từng lượt', async () => {
  const turns = [{ who: 'A', hz: '你好。' }, { who: 'B', hz: '我叫王明。' }, { who: 'A', hz: '很高兴认识你。' }];
  const env = makeEnv();
  await env.R(`ttsSpeakSegments(${JSON.stringify(TT.conversationSegments(turns, null, 1))})`);
  assert.deepStrictEqual(env.calls.fetch.map(f => f.voice), [
    'zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural',
  ]);
  assert.strictEqual(env.calls.fetch.length, 3);
});

test('phát chậm: chỉ lần phát này dùng 0.8, không đổi ttsRate chung', async () => {
  const env = makeEnv();
  await env.R("speakSlow('你好。')");
  assert.strictEqual(env.calls.fetch[0].rate, '0.8');
  assert.strictEqual(env.R('ttsRate'), 0.9);
});

test('dừng giữa chuỗi: không phát thêm đoạn nào', async () => {
  const text = '第一句。'.repeat(120);
  const env = makeEnv({ endDelay: 30 });
  const p = env.R(`speak(${JSON.stringify(text)})`);
  await sleep(5);
  env.R('stopSpeaking()');
  await p;
  const after = env.calls.plays.length;
  await sleep(60);
  assert.strictEqual(env.calls.plays.length, after, 'vẫn phát sau khi dừng');
  assert.ok(after <= 1, 'đã phát ' + after + ' đoạn trước khi dừng');
  assert.strictEqual(env.R('ttsSeq'), null);
});

test('tạm dừng / tiếp tục: gọi đúng audio.pause và audio.play', async () => {
  const env = makeEnv();
  await env.R("ttsSeq = { token: ttsToken, paused: false }; edgeTtsAudio = { pause(){ __p = true; }, play(){ __r = true; return Promise.resolve(); } };");
  env.R('pauseSpeaking()');
  assert.strictEqual(env.R('ttsSeq.paused'), true);
  assert.strictEqual(env.R('__p'), true);
  env.R('resumeSpeaking()');
  assert.strictEqual(env.R('ttsSeq.paused'), false);
  assert.strictEqual(env.R('__r'), true);
});

test('cache: lần 2 lấy MP3 đã lưu, không gọi lại API; không lưu trùng', async () => {
  const env = makeEnv({ withIdb: true });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.fetch.length, 1);
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.fetch.length, 1, 'phải dùng cache');
  assert.strictEqual(env.calls.plays.length, 2);
  assert.strictEqual(env.idb._store.size, 1, 'cùng nội dung chỉ 1 bản');
});

test('cache: khác giọng hoặc khác tốc độ → bản riêng', async () => {
  const env = makeEnv({ withIdb: true });
  await env.R("speak('你好。')");
  await env.R("speak('你好。', null, { rate: '0.8' })");
  await env.R("edgeTtsVoice = 'zh-CN-YunxiNeural'; speak('你好。')");
  assert.strictEqual(env.calls.fetch.length, 3);
  assert.strictEqual(env.idb._store.size, 3);
});

test('cache hỏng: xoá bản lỗi và tải lại đúng 1 lần', async () => {
  const env = makeEnv({ withIdb: true, corruptFirst: true });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.fetch.length, 2, 'phải tải lại sau khi cache hỏng');
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_SUCCESS')));
  assert.strictEqual(env.idb._store.size, 1);
});

test('mạng lỗi / API lỗi: log EDGE_TTS_API_ERROR + WEB_SPEECH_FALLBACK, vẫn đọc bằng Web Speech', async () => {
  for (const netError of ['TypeError', 'AbortError']) {
    const env = makeEnv({ netError });
    await env.R("speak('你好。')");
    assert.strictEqual(env.calls.plays.length, 0);
    assert.deepStrictEqual(env.calls.tts, ['你好。']);
    assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_API_ERROR')), netError);
    assert.ok(env.calls.logs.some(l => l.includes('WEB_SPEECH_FALLBACK')), netError);
  }
});

test('lỗi phát (autoplay bị chặn): log EDGE_TTS_PLAY_ERROR + fallback, không im lặng', async () => {
  const env = makeEnv({ playError: true });
  await env.R("speak('你好。')");
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_PLAY_ERROR')));
  assert.ok(env.calls.logs.some(l => l.includes('WEB_SPEECH_FALLBACK')));
  assert.deepStrictEqual(env.calls.tts, ['你好。']);
});

test('hội thoại không tự đặt tốc độ → dùng tốc độ chung, không tạo cache trùng', async () => {
  const env = makeEnv({ withIdb: true });
  await env.R("speak('你好。')");
  await env.R("ttsSpeakSegments([{ text: '你好。', voice: 'zh-CN-XiaoxiaoNeural', gapAfter: 0 }])");
  assert.strictEqual(env.calls.fetch.length, 1, 'phải dùng chung cache với speak()');
  assert.strictEqual(env.idb._store.size, 1);
});

runAll();