#!/usr/bin/env node
// test/v173-answer-dedupe.test.js — V173: màn đáp án "Hôm nay học" không lặp câu Hán / nghĩa / từ; "Từ mới trong câu" nằm ngay dưới câu.
// Chạy hàm THẬT trong js/review.js (cắt từ nguồn, nạp vào vm) — không cần DOM/mạng/DB.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const rv = fs.readFileSync(path.join(__dirname, '..', 'js/review.js'), 'utf8');
function grab(name) { const a = rv.indexOf('function ' + name + '('); assert.ok(a >= 0, name); let d = 0; for (let j = rv.indexOf('{', a); j < rv.length; j++) { if (rv[j] === '{') d++; else if (rv[j] === '}' && !--d) return rv.slice(a, j + 1); } }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ZH = '下午经理要看报告，所以我不得不赶紧把它打印出来。', VI = 'Chiều nay giám đốc cần xem báo cáo nên tôi không thể không mau chóng in nó ra.';
const W = { hz: '打印', py: 'dǎyìn', vi: 'in', hanviet: 'đả ấn' };
function env(over) {
  const ctx = Object.assign({ escapeHtml: esc, showPinyin: true, showMeaning: true, showHanViet: true, AM: { VERDICT_TEXT: {} }, rvLastAnswer: { correct: false },
    rvExamplePool: [{ hz: '打印', zh: ZH, vi: VI, words: [{ word: '经理', py: 'jīnglǐ', vi: 'giám đốc' }, { word: '打印', vi: 'in' }, { word: '不得不', vi: 'buộc phải', note: 'bắt buộc' }] }],
    rvQuestion: { typeId: 'sentPick', word: W, sentence: { zh: ZH, vi: VI, py: 'Xiàwǔ jīnglǐ yào kàn bàogào', source: 'example' },
      explanation: ['Câu đầy đủ: ' + ZH, 'Nghĩa cả câu: ' + VI, '打印 (dǎyìn) = in · Hán Việt: đả ấn', 'Pinyin cả câu: Xiàwǔ jīnglǐ yào kàn bàogào'] } }, over || {});
  vm.createContext(ctx);
  vm.runInContext(['rvExWordsHtml', 'rvSentenceWords', 'rvSentenceBlockHtml', 'rvExplainHtml', 'rvShowHV'].map(grab).join('\n') + '\nthis.block = rvSentenceBlockHtml; this.explain = rvExplainHtml;', ctx);
  return ctx;
}
let passed = 0, failed = 0; const test = (n, f) => { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } };

test('khối câu có: câu Hán, pinyin cả câu, nghĩa cả câu và "Từ mới trong câu" NGAY DƯỚI câu (từ đang học 打印 bị bỏ)', () => {
  const h = env().block();
  assert.ok(h.includes('下午经理') && h.includes('Xiàwǔ') && h.includes(VI));
  assert.ok(h.indexOf('rv-sent-vi') < h.indexOf('rv-words') && h.includes('Từ mới trong câu') && h.includes('经理') && h.includes('不得不'));
  assert.ok(!h.includes('<b lang="zh">打印</b>'), 'từ đang học không lặp trong danh sách từ mới');
});
test('pinyin cả câu vẫn hiện ở màn kết quả dù đang tắt "Hiện Pinyin" (như dòng "Pinyin cả câu" cũ)', () => { assert.ok(env({ showPinyin: false }).block().includes('Xiàwǔ')); });
test('khung giải thích KHÔNG còn lặp câu đầy đủ / nghĩa cả câu / pinyin cả câu / dòng tóm tắt từ → rỗng', () => { assert.strictEqual(env().explain(), ''); });
test('câu cloze: bỏ "Câu hoàn chỉnh" + "Nghĩa" nhưng giữ nguyên các dòng khác (mẹo / thanh điệu)', () => {
  const h = env({ rvQuestion: { typeId: 'cloze', word: W, sentence: { zh: ZH, vi: VI, py: 'x' }, explanation: ['Câu hoàn chỉnh: ' + ZH, 'Nghĩa: ' + VI, '打印 (dǎyìn) = in · Hán Việt: đả ấn', 'Pinyin cả câu: x', 'Mẹo: nhớ 把'] } }).explain();
  assert.ok(h.includes('Mẹo: nhớ 把') && !h.includes('Câu hoàn chỉnh') && !h.includes('Nghĩa:') && !h.includes('Pinyin cả câu') && !h.includes('dǎyìn'));
});
test('câu KHÔNG có câu thật (confusable/hz2tone): bỏ dòng tóm tắt từ, giữ mẹo / thanh điệu', () => {
  const h = env({ rvQuestion: { typeId: 'hz2tone', word: W, sentence: null, explanation: ['打印 (dǎyìn) = in · Hán Việt: đả ấn', 'Thanh điệu của từ này: thanh 3 + thanh 4.'] } }).explain();
  assert.ok(h.includes('Thanh điệu của từ này') && !h.includes('Hán Việt'));
});
test('đang ẨN nghĩa (showMeaning=false) hoặc ẨN Hán Việt → giữ dòng tóm tắt (không làm mất thông tin đang không hiện ở chỗ khác)', () => {
  assert.ok(env({ showMeaning: false }).explain().includes('dǎyìn'));
  assert.ok(env({ showHanViet: false }).explain().includes('dǎyìn'));
});
test('thiếu pinyin cả câu → vẫn giữ dòng giải thích lý do ("Pinyin của cả câu: chưa có…")', () => {
  const q = { typeId: 'sentPick', word: W, sentence: { zh: ZH, vi: VI }, explanation: ['Câu đầy đủ: ' + ZH, 'Pinyin của cả câu: chưa có trong dữ liệu nên chưa hiển thị.'] };
  assert.ok(env({ rvQuestion: q }).explain().includes('chưa có trong dữ liệu'));
});
test('nối dây: khối ví dụ riêng (.rv-ex) chỉ hiện khi câu hỏi KHÔNG có câu thật; vẫn đủ 3 khối gọi rvExWordsHtml', () => {
  const lines = rv.split('\n').filter((l) => l.includes('class="rv-ex"') && l.includes('rvExPy('));
  assert.strictEqual(lines.length, 3);
  const guarded = lines.filter((l) => /rvQuestion\.sentence && rvQuestion\.sentence\.zh/.test(l));
  assert.strictEqual(guarded.length, 2, 'màn kết quả + màn luyện bổ sung đều có điều kiện chống lặp');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
