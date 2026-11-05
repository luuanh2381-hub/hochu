// test/v129-tts-hints.test.js — V129 "Sửa phát âm": kiểm thử phần thuần (không cần DB/mạng/trình duyệt thật).
// KHÔNG kiểm thử được: giọng đọc thật của trình duyệt (phải nghe bằng tai) và Gemini/DB thật.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('../lib/tts-hints');

let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('V129 — Sửa phát âm');

t('findCandidates: chỉ giữ từ dùng cách đọc phụ của chữ đa âm', () => {
  const out = T.findCandidates([
    { hz: '银行', py: 'yínháng', vi: 'ngân hàng' },
    { hz: '行李', py: 'xíngli', vi: 'hành lý' },
    { hz: '好吃', py: 'hǎochī', vi: 'ngon' },
    { hz: '爱好', py: 'àihào', vi: 'sở thích' },
    { hz: '了解', py: 'liǎojiě', vi: 'hiểu' },
    { hz: '了', py: 'le', vi: 'rồi' },
    { hz: '朋友', py: 'péngyou', vi: 'bạn' },
  ]).map(x => x.hz);
  assert.deepStrictEqual(out, ['银行', '爱好', '了解']);
});

t('findCandidates: pinyin có khoảng trắng / viết hoa vẫn so được', () => {
  const out = T.findCandidates([{ hz: '银行', py: 'Yín Háng', vi: '' }]);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].chars, ['行']);
  assert.strictEqual(out[0].loose, false);
});

t('findCandidates: pinyin không có dấu thanh → giữ từ có chữ đa âm (loose)', () => {
  const out = T.findCandidates([{ hz: '银行', py: 'yin2hang2', vi: '' }, { hz: '朋友', py: 'peng2you5', vi: '' }]);
  assert.deepStrictEqual(out.map(x => x.hz), ['银行']);
  assert.strictEqual(out[0].loose, true);
});

t('findCandidates: đầu vào lạ không làm lỗi', () => {
  assert.deepStrictEqual(T.findCandidates(null), []);
  assert.deepStrictEqual(T.findCandidates([null, {}, { hz: 5 }]), []);
});

t('validateSay: chấp nhận chữ đọc hợp lệ (bỏ khoảng trắng)', () => {
  assert.deepStrictEqual(T.validateSay('行', '两行'), { ok: true, say: '两行' });
  assert.deepStrictEqual(T.validateSay('了', '了 解'), { ok: true, say: '了解' });
  assert.strictEqual(T.validateSay('差', '差不多').ok, true);
});

t('validateSay: từ chối chữ đọc sai quy tắc', () => {
  assert.strictEqual(T.validateSay('行', '行').ok, false);          // trùng chữ gốc
  assert.strictEqual(T.validateSay('行', '银航').ok, false);        // không chứa chữ gốc
  assert.strictEqual(T.validateSay('行', 'háng').ok, false);        // không phải chữ Hán
  assert.strictEqual(T.validateSay('行', '两行。').ok, false);      // có dấu câu
  assert.strictEqual(T.validateSay('行', '一二三四行').ok, false);  // thêm quá 3 chữ
  assert.strictEqual(T.validateSay('行', 123).ok, false);
  assert.strictEqual(T.validateSay('abc', '两行').ok, false);       // hz không hợp lệ
});

t('buildSuggestPrompt: có từ, pinyin, nghĩa và quy tắc chứa nguyên từ gốc', () => {
  const p = T.buildSuggestPrompt([{ hz: '行', py: 'háng', vi: 'hàng, dòng' }]);
  assert.ok(p.includes('行') && p.includes('háng') && p.includes('hàng, dòng'));
  assert.ok(p.includes('"items"'));
});

t('parseSuggestions: lọc đề xuất sai, từ lạ, trùng; chịu được ```json', () => {
  const words = [{ hz: '行' }, { hz: '了' }];
  const raw = '```json\n{"items":[{"hz":"行","say":"两行"},{"hz":"行","say":"银行"},{"hz":"了","say":"liǎo"},{"hz":"谁","say":"谁呀"}]}\n```';
  assert.deepStrictEqual(T.parseSuggestions(raw, words), [{ hz: '行', say: '两行' }]);
  assert.deepStrictEqual(T.parseSuggestions('không phải json', words), []);
  assert.deepStrictEqual(T.parseSuggestions(undefined, words), []);
});

t('POLY: mọi cách đọc đều ở dạng NFC và có dấu thanh', () => {
  for (const [c, rs] of Object.entries(T.POLY)) {
    assert.ok(rs.length > 0, c);
    for (const r of rs) {
      assert.strictEqual(r, r.normalize('NFC'), c + ' ' + r);
      assert.ok(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(r), c + ' ' + r);
    }
  }
});

t('speak() đọc "chữ đọc" đã lưu, đọc nguyên chữ khi raw, và không đổi từ không có sửa', () => {
  const spoken = [];
  const ctx = {
    speechSynthesis: { getVoices: () => [], speak: (u) => spoken.push(u.text), cancel() {}, onvoiceschanged: null },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    AudioContext: function () {},
    console: { log() {}, error() {} },
    isLoggedIn: () => false, // không gọi mạng trong test
    progressState: { ui: {} }, cacheProgressLocally() {}, scheduleSync() {},
    document: { getElementById: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/audio.js'), ctx);
  vm.runInContext(read('js/tts-fix.js'), ctx);
  vm.runInContext("ttsHints = { '行': '两行' }; ttsHintsLoaded = true;", ctx);
  vm.runInContext("speak('行'); speak('行', null, { raw: true }); speak('银行'); speak('你好，行');", ctx);
  assert.deepStrictEqual(spoken, ['两行', '行', '银行', '你好，', ' ', '行']);
});

t('đã nối đủ vào web: tab, script, quyền, API', () => {
  assert.ok(read('index.html').includes('/js/tts-fix.js') && read('index.html').includes('id="tab-ttsfix"'));
  assert.ok(read('js/auth.js').includes("'ttsfix'") && read('js/auth.js').includes('tab-ttsfix'));
  assert.ok(read('js/nav.js').includes("'ttsfix'"));
  assert.ok(read('js/navigation.js').includes('renderTtsFix'));
  const api = read('api/index.js');
  for (const r of ["app.get('/api/tts/hints'", "app.get('/api/tts/candidates'", "app.post('/api/tts/hints'", "app.post('/api/tts/suggest'"]) assert.ok(api.includes(r), r);
  assert.ok(/'\/api\/tts\/candidates'[\s\S]{0,400}requireAdmin/.test(api) && /'\/api\/tts\/suggest'[\s\S]{0,400}requireAdmin/.test(api));
});

console.log(process.exitCode ? '\nCó lỗi.' : `\nOK — ${pass} kiểm thử đạt.`);
