#!/usr/bin/env node
// test/v157-answer-audio.test.js — V157: màn "Hôm nay học" đọc đáp án 2 lần (có nghỉ) rồi mới sang câu kế; câu ví dụ có pinyin.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(ROOT, 'js/study-workspace.js'), 'utf8');
const RV = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
let passed = 0, failed = 0;
async function test(n, f) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); } }

function audioEnv({ readTwice = true, autoAudio = true, tab = 'review', speakMs = 5 } = {}) {
  const start = SW.indexOf('const SW_READ_GAP_MS'); const end = SW.indexOf('function swWaitAnswerAudio');
  const endFn = SW.indexOf('\n}', end) + 2;
  const waits = []; const spoken = []; const events = [];
  const ctx = {
    swPrefs: { readTwice, autoAudio }, currentTab: tab, spoken, events, waits,
    swAutoAudio: () => autoAudio,
    speak: (t, hooks) => new Promise((r) => { spoken.push(t); events.push('start'); setTimeout(() => { events.push('end'); if (hooks && hooks.end) hooks.end(); r(); }, speakMs); }),
    stopSpeaking: () => events.push('stop'),
    setTimeout: (f, ms) => { waits.push(ms); return setTimeout(f, ms < 5000 ? Math.min(ms, 20) : ms); },
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(SW.slice(start, endFn), ctx);
  return ctx;
}

(async () => {
  await test('mặc định đọc ĐÁP ÁN 2 LẦN, nghỉ ~1.1s giữa hai lần; hàm đợi chỉ xong sau lần đọc thứ 2', async () => {
    const c = audioEnv();
    vm.runInContext("swSpeakAfterAnswer('我学习汉语。')", c);
    let done = false; const w = vm.runInContext('swWaitAnswerAudio()', c).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 2)); assert.strictEqual(done, false, 'chưa đọc xong thì chưa được sang câu kế');
    await w;
    assert.deepStrictEqual(Array.from(c.spoken), ['我学习汉语。', '我学习汉语。']);
    assert.deepStrictEqual(Array.from(c.events), ['start', 'end', 'start', 'end'], 'lần 2 chỉ bắt đầu sau khi lần 1 xong');
    assert.ok(c.waits.includes(1100), 'có khoảng nghỉ giữa 2 lần');
  });
  await test('tắt "Đọc đáp án 2 lần" → đọc 1 lần; tắt "Tự phát âm" → không đọc, không phải đợi', async () => {
    const c1 = audioEnv({ readTwice: false }); vm.runInContext("swSpeakAfterAnswer('A')", c1); await vm.runInContext('swWaitAnswerAudio()', c1);
    assert.strictEqual(c1.spoken.length, 1);
    const c2 = audioEnv({ autoAudio: false }); vm.runInContext("swSpeakAfterAnswer('A')", c2); await vm.runInContext('swWaitAnswerAudio()', c2);
    assert.strictEqual(c2.spoken.length, 0);
  });
  await test('huỷ (sang câu mới/rời màn) → không đọc lần 2; đang đọc thì dừng', async () => {
    const c = audioEnv({ speakMs: 15 });
    vm.runInContext("swSpeakAfterAnswer('A')", c); await new Promise((r) => setTimeout(r, 3));
    vm.runInContext('swCancelAnswerAudio()', c); await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(c.spoken.length, 1); assert.ok(c.events.includes('stop'));
    const c2 = audioEnv({ tab: 'home' }); vm.runInContext("swSpeakAfterAnswer('A')", c2); await vm.runInContext('swWaitAnswerAudio()', c2);
    assert.strictEqual(c2.spoken.length, 0, 'đã rời tab học thì không đọc');
  });
  await test('bị chen ngang (speak trả về mà không phát xong, không còn đọc) → KHÔNG đọc lần 2 đè lên', async () => {
    const c = audioEnv(); c.speak = (t) => { c.spoken.push(t); return Promise.resolve(); };
    vm.runInContext("swSpeakAfterAnswer('A')", c); await vm.runInContext('swWaitAnswerAudio()', c);
    assert.strictEqual(c.spoken.length, 1);
  });
  await test('bài học: cả 2 đường tự chuyển câu (chấm rating & luyện bổ sung) đều ĐỢI đọc xong; cài đặt có công tắc', () => {
    const commit = RV.slice(RV.indexOf('async function rvCommitRating'), RV.indexOf('let rvStyleInjected'));
    assert.ok(/await swWaitAnswerAudio\(\)[\s\S]*rvAdvanceQueue\(\)/.test(commit), 'rating → đợi rồi mới rvAdvanceQueue');
    assert.ok(/setTimeout\(async \(\) => \{\s*if \(typeof swWaitAnswerAudio/.test(RV), 'luyện bổ sung tự sang câu cũng đợi');
    assert.ok(/swSetPref\('readTwice'/.test(SW) && /readTwice: true/.test(SW), 'mặc định bật + có công tắc');
    // FSRS: lệnh gửi đánh giá vẫn nằm TRƯỚC bước đợi (không bị trễ vì âm thanh)
    assert.ok(commit.indexOf('submitFsrsReviewAwaited') < commit.indexOf('swWaitAnswerAudio'));
  });
  await test('câu ví dụ có pinyin: engine & khối câu ở màn đáp án mang py (khi có)', () => {
    const QE = require('../js/question-engine.js'); const OS = require('../js/order-sentence.js');
    const ex = [{ hz: '学习', zh: '我每天学习汉语。', vi: 'Mỗi ngày tôi học tiếng Trung.', py: 'Wǒ měitiān xuéxí Hànyǔ.' }, { hz: '学习', zh: '他在学习。', vi: 'Anh ấy đang học.' }];
    const got = OS.fromExamples({ hz: '学习' }, ex);
    assert.strictEqual(got.find((s) => s.zh === '我每天学习汉语。').py, 'Wǒ měitiān xuéxí Hànyǔ.');
    assert.ok(!('py' in got.find((s) => s.zh === '他在学习。')), 'không có py thì không thêm khoá py (giữ nguyên hình dạng cũ)');
    assert.ok(/rv-sent-py/.test(RV) && /q\.sentence\.py/.test(RV));
    void QE;
  });
  await test('nút "Học lại từ đầu" trong lúc học: có xác nhận, dùng rvRelearnFromStart sẵn có, chỉ hiện khi đang học', () => {
    assert.ok(/id="sw-reset-btn"[^>]*onclick="swRestartSession\(\)"/.test(SW));
    const fn = SW.slice(SW.indexOf('function swRestartSession'), SW.indexOf('// Đổi chế độ bố cục'));
    assert.ok(/confirm\(/.test(fn) && /rvRelearnFromStart\(\)/.test(fn) && /swSessionRunning\(\)/.test(fn));
    assert.ok(/sw-reset-btn[\s\S]{0,120}swSessionRunning\(\)/.test(SW.slice(SW.indexOf('function swUpdateBar'))));
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
