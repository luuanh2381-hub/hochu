#!/usr/bin/env node
// test/v181-podcast-background.test.js — Kiểm tra nâng cấp Nghe rảnh tay khi tắt màn hình:
//   A. WAV im lặng 16-bit PCM mono 8kHz đúng chuẩn header + phát trên thẻ <audio> dùng chung (không setTimeout trơn).
//   B. Đọc nghĩa tiếng Việt qua Edge-TTS (vi-VN-HoaiMyNeural) + dự phòng Web Speech vi-VN.
//   C. Prefetch mục hiện tại + mục kế tiếp không bị huỷ khi chuyển đoạn, chỉ huỷ khi gọi ttsStop().
//   D. Media Session API: metadata, playbackState (playing/paused/none), điều khiển play/pause/next/prev từ màn hình khoá.
//   E. Hẹn giờ tắt (sleep timer) kiểm tra theo đồng hồ thực trong podLoop (chống bị OS throttle setTimeout).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
const pending = [];
const test = (n, f) => pending.push({ n, f });

async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

function makeEnv(opts) {
  const o = opts || {};
  const calls = { tts: [], plays: [], blobs: [], webSpeech: [], msHandlers: {}, msMeta: [], audioCtor: 0, progress: [] };
  let seq = 0;

  class BlobStub {
    constructor(parts, init) {
      this.parts = parts || [];
      this.type = (init && init.type) || 'audio/mpeg';
      this.size = this.parts.reduce((s, p) => s + (p && p.byteLength ? p.byteLength : 100), 0) || 100;
      this._id = ++seq;
      calls.blobs.push(this);
    }
  }

  class FakeAudio {
    constructor(src) {
      calls.audioCtor++;
      this.src = src;
      this.loop = false;
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      this._t = null;
    }
    play() {
      const curSrc = this.src;
      calls.plays.push({ src: curSrc, loop: !!this.loop });
      if (String(curSrc).startsWith('data:audio/wav')) return Promise.resolve();
      if (this.loop) return Promise.resolve();
      setTimeout(() => {
        if (this.src !== curSrc) return;
        if (this.onplay) this.onplay();
        this._t = setTimeout(() => {
          if (this.src !== curSrc) return;
          if (this.onended) this.onended();
        }, o.endDelay == null ? 5 : o.endDelay);
      }, 0);
      return Promise.resolve();
    }
    pause() { if (this._t) { clearTimeout(this._t); this._t = null; } }
    removeAttribute() { this.src = undefined; }
  }

  async function fetchStub(url, init) {
    if (url === '/api/tts') {
      const body = JSON.parse(init.body);
      calls.tts.push(body);
      if (o.ttsDelay) await sleep(o.ttsDelay);
      if (o.ttsFail) return { ok: false, status: 502, json: async () => ({ error: 'x' }) };
      return { ok: true, blob: async () => new BlobStub([], { type: 'audio/mpeg' }) };
    }
    if (url === '/api/conversations' && o.conversations) {
      return { ok: true, json: async () => ({ ok: true, conversations: o.conversations }) };
    }
    if (url.startsWith('/api/conversations/') && o.convoDetails) {
      const id = decodeURIComponent(url.slice('/api/conversations/'.length));
      const convo = o.convoDetails[id];
      return convo
        ? { ok: true, json: async () => ({ ok: true, conversation: convo }) }
        : { ok: false, status: 404, json: async () => ({ ok: false, error: 'Not found' }) };
    }
    throw new Error('Unexpected fetch: ' + url);
  }

  const synth = {
    speak(u) {
      calls.webSpeech.push({ text: u.text, lang: u.lang, rate: u.rate });
      setTimeout(() => { if (u.onend) u.onend(); }, 2);
    },
    cancel() {}, pause() {}, resume() {},
    getVoices() { return [{ lang: 'vi-VN', name: 'VN' }, { lang: 'zh-CN', name: 'ZH' }]; },
  };

  const mediaSession = {
    playbackState: 'none',
    _meta: null,
    get metadata() { return this._meta; },
    set metadata(v) { this._meta = v; calls.msMeta.push(v); },
    setActionHandler(action, fn) { calls.msHandlers[action] = fn; },
  };

  class MediaMetadataStub {
    constructor(init) { Object.assign(this, init); }
  }

  const dom = {};
  const ctx = {
    console: { log() {}, warn() {} },
    window: { AudioContext: function AudioContext() {}, speechSynthesis: synth },
    navigator: { mediaSession },
    location: { origin: 'https://example.test' },
    MediaMetadata: MediaMetadataStub,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    Audio: FakeAudio,
    Blob: BlobStub,
    ArrayBuffer, Uint8Array, DataView,
    URL: {
      createObjectURL(b) { return (b.type === 'audio/wav' ? 'blob:wav:' : 'blob:mp3:') + b._id; },
      revokeObjectURL() {},
    },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    fetch: fetchStub,
    authHeaders: () => ({ Authorization: 'Bearer tok' }),
    convoMarkProgress: (convo, lastTurn, countAsPractice) => {
      calls.progress.push({ id: convo && convo.id, lastTurn, countAsPractice });
    },
    goTab(tab) { ctx.currentTab = tab; },
    document: {
      visibilityState: 'visible',
      getElementById: (id) => (dom[id] = dom[id] || { innerHTML: '', textContent: '', style: {} }),
      addEventListener() {},
      removeEventListener() {},
    },
    currentTab: 'listening',
    markDailySealFlag() {},
    escapeHtml: (s) => String(s == null ? '' : s),
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, Promise, Error, RegExp, setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/tts-text.js'), ctx);
  vm.runInContext(read('js/audio-hash.js'), ctx);
  vm.runInContext(read('js/audio.js'), ctx);
  vm.runInContext(read('js/listening.js'), ctx);
  return { ctx, calls, dom, mediaSession, R: (c) => vm.runInContext(c, ctx) };
}

console.log('\n[A] WAV im lặng giữ phiên audio nền');

test('ttsSilenceBlob tạo WAV PCM 16-bit mono 8kHz đúng kích thước & header RIFF/WAVE', () => {
  const env = makeEnv();
  const blob = env.R('ttsSilenceBlob(2500)');
  assert.ok(blob && blob.type === 'audio/wav');
  const buf = blob.parts[0];
  const view = new DataView(buf);
  const tag = (off) => String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
  assert.strictEqual(tag(0), 'RIFF');
  assert.strictEqual(tag(8), 'WAVE');
  assert.strictEqual(tag(12), 'fmt ');
  assert.strictEqual(tag(36), 'data');
  assert.strictEqual(view.getUint16(20, true), 1);     // PCM
  assert.strictEqual(view.getUint16(22, true), 1);     // mono
  assert.strictEqual(view.getUint32(24, true), 8000);  // 8 kHz
  assert.strictEqual(view.getUint16(34, true), 16);    // 16-bit
  assert.strictEqual(view.getUint32(40, true), 40000); // 2.5s * 8000 * 2 bytes
  assert.strictEqual(buf.byteLength, 44 + 40000);
});

test('ttsPlaySilence phát WAV im lặng trên thẻ <audio> dùng chung và huỷ tức thì khi ttsStop()', async () => {
  const env = makeEnv({ endDelay: 300 });
  const p = env.R('ttsPlaySilence(2500)');
  await sleep(10);
  assert.ok(env.calls.plays.some(x => x.src.startsWith('blob:wav:')), 'phải phát blob WAV im lặng');
  env.R('ttsStop()');
  const ok = await p;
  assert.strictEqual(ok, false, 'bị huỷ qua ttsStop() phải trả về false');
  assert.strictEqual(env.calls.audioCtor, 1);
});

console.log('\n[B] Đọc nghĩa tiếng Việt qua Edge-TTS & dự phòng Web Speech');

test('speakVi gọi /api/tts với giọng vi-VN-HoaiMyNeural', async () => {
  const env = makeEnv();
  await env.R("speakVi('xin chào')");
  assert.strictEqual(env.calls.tts.length, 1);
  assert.strictEqual(env.calls.tts[0].voice, 'vi-VN-HoaiMyNeural');
  assert.strictEqual(env.calls.tts[0].rate, '1.0');
  assert.strictEqual(env.calls.plays.filter(p => p.src.startsWith('blob:mp3:')).length, 1);
});

test('speakVi lỗi mạng: tự rơi về Web Speech với lang vi-VN', async () => {
  const env = makeEnv({ ttsFail: true });
  await env.R("speakVi('cảm ơn')");
  assert.strictEqual(env.calls.webSpeech.length, 1);
  assert.strictEqual(env.calls.webSpeech[0].lang, 'vi-VN');
});

console.log('\n[C] MediaSession, Prefetch và Vòng lặp Podcast nền');

test('podStart phát đủ vòng: zh1 → silence WAV → vi Edge-TTS → zh2, cập nhật MediaSession và prefetch mục tiếp theo', async () => {
  const env = makeEnv({ endDelay: 8 });
  env.R(`
    podItems = [
      { hz: '你好', py: 'nǐ hǎo', vi: 'xin chào (thân mật)', tag: 'Bài 1' },
      { hz: '谢谢', py: 'xièxie', vi: 'cảm ơn', tag: 'Bài 1' }
    ];
    podIdx = 0; podPauseSec = 1.5; podSlow = true; podRepeat2 = true; podReadVi = true;
    podStart();
  `);
  await sleep(160);
  env.R('podPause()');

  assert.strictEqual(env.calls.audioCtor, 1, 'toàn bộ podcast chỉ dùng đúng 1 thẻ <audio>');
  assert.ok(env.calls.tts.some(t => t.text === '你好' && t.rate === '0.8'), 'đọc tiếng Trung chậm');
  assert.ok(env.calls.tts.some(t => t.text === 'xin chào' && t.voice === 'vi-VN-HoaiMyNeural'), 'đọc nghĩa tiếng Việt qua Edge-TTS (bỏ ngoặc)');
  assert.ok(env.calls.tts.some(t => t.text === '谢谢'), 'tải trước mục kế tiếp');
  assert.ok(env.calls.plays.some(p => p.src.startsWith('blob:wav:')), 'khoảng nghỉ phát bằng WAV im lặng');
  assert.ok(env.calls.msMeta.length >= 2, 'cập nhật MediaMetadata cho màn hình khoá');
  assert.strictEqual(typeof env.calls.msHandlers.play, 'function');
  assert.strictEqual(typeof env.calls.msHandlers.pause, 'function');
  assert.strictEqual(typeof env.calls.msHandlers.nexttrack, 'function');
  assert.strictEqual(typeof env.calls.msHandlers.previoustrack, 'function');
  assert.strictEqual(env.mediaSession.playbackState, 'paused', 'podPause giữ playbackState = paused để bấm Play lại trên màn hình khoá');

  // Bấm Next và Play từ màn hình khoá
  env.calls.msHandlers.nexttrack();
  assert.strictEqual(env.R('podIdx'), 1);
  env.calls.msHandlers.play();
  assert.strictEqual(env.R('podPlaying'), true);
  assert.strictEqual(env.mediaSession.playbackState, 'playing');

  // podStop xoá hoàn toàn MediaSession
  env.R('podStop()');
  assert.strictEqual(env.mediaSession.playbackState, 'none');
  assert.strictEqual(env.calls.msHandlers.play, null);
});

test('Hẹn giờ tắt (sleep timer) dừng ngay trong podLoop khi quá hạn (kể cả khi setTimeout bị throttle)', async () => {
  const env = makeEnv({ endDelay: 5 });
  env.R(`
    podItems = [{ hz: '你好', py: 'nǐ hǎo', vi: 'xin chào', tag: '' }];
    podIdx = 0; podSleepMin = 5; podPlaying = true;
    podSleepEndAt = Date.now() - 10;
    podLoop(++podRunId);
  `);
  await sleep(30);
  assert.strictEqual(env.R('podPlaying'), false);
  assert.strictEqual(env.mediaSession.playbackState, 'none');
  assert.ok(env.dom['pod-phase'].textContent.includes('hết hẹn giờ'));
});

console.log('\n[D] Nghe thụ động nguồn Hội thoại (2 giọng Nam/Nữ + tự chuyển bài)');

test('podLoadSource("convo") tải hội thoại, phân 2 giọng Nam/Nữ, lưu tiến độ và tự chuyển bài kế tiếp', async () => {
  const c1 = {
    id: 11, dialogue_id: 'hsk3-001', title_zh: '打招呼', title_vi: 'Chào hỏi',
    hsk_level: 'HSK 3', topic: 'Giao tiếp', situation: 'Gặp đồng nghiệp buổi sáng', total_turns: 2,
    progress: { is_favorited: true },
    turns: [
      { character: '小王', chinese_text: '早上好！', pinyin: 'zǎoshang hǎo!', vietnamese_text: 'Chào buổi sáng!' },
      { character: '小李', chinese_text: '你也好！', pinyin: 'nǐ yě hǎo!', vietnamese_text: 'Chào bạn!' },
    ],
  };
  const c2 = {
    id: 12, dialogue_id: 'hsk4-002', title_zh: '开会', title_vi: 'Họp nhóm',
    hsk_level: 'HSK 4', topic: 'Công việc', situation: 'Chuẩn bị cuộc họp', total_turns: 1,
    progress: { is_favorited: false },
    turns: [
      { character: '经理', chinese_text: '会议开始了。', pinyin: 'huìyì kāishǐ le.', vietnamese_text: 'Cuộc họp bắt đầu rồi.' },
    ],
  };
  const env = makeEnv({
    endDelay: 5,
    conversations: [c1, c2],
    convoDetails: { 'hsk3-001': c1, 'hsk4-002': c2 },
  });

  await env.R("podLoadSource('convo')");
  assert.strictEqual(env.R('podConvoId'), 'hsk3-001');
  assert.strictEqual(env.R('podItems.length'), 2);
  assert.strictEqual(env.R('podItems[0].voice'), 'zh-CN-XiaoxiaoNeural', 'nhân vật 1 dùng giọng nữ');
  assert.strictEqual(env.R('podItems[1].voice'), 'zh-CN-YunxiNeural', 'nhân vật 2 dùng giọng nam');

  env.R('podPauseSec = 0.6; podSlow = false; podRepeat2 = false; podReadVi = false; podConvoAutoNext = true; podStart();');
  await sleep(160);
  env.R('podPause()');

  assert.ok(env.calls.tts.some(t => t.text === '早上好！' && t.voice === 'zh-CN-XiaoxiaoNeural'));
  assert.ok(env.calls.tts.some(t => t.text === '你也好！' && t.voice === 'zh-CN-YunxiNeural'));
  assert.ok(env.calls.progress.some(p => p.id === 11 && p.lastTurn === 2 && p.countAsPractice === true), 'hết bài hội thoại phải ghi nhận tiến độ');
  assert.strictEqual(env.R('podConvoId'), 'hsk4-002', 'phải tự chuyển sang bài hội thoại kế tiếp');
  assert.ok(env.calls.tts.some(t => t.text === '会议开始了。'));
  assert.ok(env.calls.msMeta.some(m => String(m.album).includes('打招呼')));

  // Lọc theo yêu thích chỉ giữ c1
  await env.R("podSetConvoFilter('fav')");
  assert.strictEqual(env.R('podFilteredConvos().length'), 1);
  assert.strictEqual(env.R('podConvoId'), 'hsk3-001');
});

test('js/conversation.js có nút mở Nghe rảnh tay và không nhét JSON vào onclick', () => {
  const src = read('js/conversation.js');
  assert.ok(src.includes('openHandsFreeConvo()'), 'danh sách hội thoại phải có nút mở Nghe rảnh tay');
  assert.ok(src.includes('openHandsFreeConvo(currentConvo&&currentConvo.dialogue_id)'), 'chi tiết hội thoại phải có nút mở Nghe rảnh tay bài hiện tại');
  const detailSrc = src.slice(src.indexOf('function renderConvoDetail'), src.indexOf('function renderConvoTurn'));
  assert.ok(!/onclick="[^"]*(?<!\$)\{/.test(detailSrc), 'không nhét JSON vào onclick');
});

runAll();
