#!/usr/bin/env node
// test/v143-study-ux.test.js — V143: bố cục màn "Hôm nay học"
//   A. Ảnh gợi nhớ hiện NGAY trong thẻ học (không còn mục gập phải chạm mới thấy), có giới hạn chiều cao.
//   B. Vị trí ảnh trong thẻ: sau chữ Hán + pinyin, TRƯỚC nghĩa — và KHÔNG xuất hiện ở màn câu hỏi (lộ đáp án).
//   C. Màn "Hôm nay học": cài đặt hằng ngày gập sẵn; giới hạn ngày vẫn hiện khi không có thanh tiến độ.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
const WI = read('js/word-image.js'), REVIEW = read('js/review.js'), FC = read('js/flashcard.js'), CSS = read('css/styles.css');

// ── A. Ảnh không còn bị giấu sau <details> ──
test('A1 ảnh vẽ trực tiếp, không còn <details>/<summary> phải chạm mới thấy', () => {
  const body = WI.slice(WI.indexOf('function render('), WI.indexOf('function isAdmin('));
  assert.ok(!/<details/.test(body), 'không được gập ảnh sau <details>');
  assert.ok(/<img class="wi-img"/.test(body));
});
test('A2 chạm ảnh để xem lớn (nút bàn phím dùng được), mở bằng overlay dùng lại URL đã ký', () => {
  assert.ok(/class="wi-imgbtn"/.test(WI) && /function wiZoom\(/.test(WI) && /g\.wiZoom = wiZoom/.test(WI));
  assert.ok(/wi-zoom/.test(CSS) && /\.wi-zoom\.on\{display:flex/.test(CSS));
});
test('A3 chiều cao ảnh có trần theo màn hình (không lấn chữ Hán), và có biến thể nhỏ hơn cho điện thoại', () => {
  assert.ok(/\.wi-img\{[^}]*height:min\(30vh,220px\)/.test(CSS), 'thiếu trần chiều cao mặc định');
  assert.ok(/@media \(max-width:480px\)\{\.wi-img\{height:min\(24vh,170px\)/.test(CSS), 'thiếu biến thể điện thoại');
});
test('A4 từ không có ảnh: ô chờ không chiếm chỗ, ảnh lỗi thì tự gỡ ô', () => {
  assert.ok(/\.wi-slot:empty\{display:none;\}/.test(CSS));
  assert.ok(/onerror="this\.closest\(\\'\.wi-slot\\'\)\.remove\(\)"/.test(WI));
});
test('A5 tải trước ảnh thẻ kế tiếp ở cả "Hôm nay học" và Flashcard', () => {
  assert.ok(/function wiPrefetch\(/.test(WI) && /g\.wiPrefetch = wiPrefetch/.test(WI));
  assert.ok(/wiPrefetch\(rvQueue\.items\[1\]/.test(REVIEW.replace(/\s+/g, ' ')) || /wiPrefetch\(nx\.word\.hz\)/.test(REVIEW));
  assert.ok(/wiPrefetch\(nx\.hz\)/.test(FC));
});

// ── B. Vị trí ảnh trong thẻ ──
test('B1 thẻ từ mới: Hán → pinyin → ẢNH → nghĩa → Hán Việt', () => {
  const html = REVIEW.slice(REVIEW.indexOf('function rvIntroHtml'), REVIEW.indexOf('function rvMatchHtml'));
  const order = ['rv-hz', 'rv-py', 'wiSlot(w.hz)', 'rv-vi', 'rv-hv'].map(k => { const i = html.indexOf(k); assert.ok(i > 0, 'thiếu ' + k); return i; });
  assert.deepStrictEqual(order, order.slice().sort((a, b) => a - b), 'ảnh phải nằm sau pinyin và trước nghĩa: ' + order.join(','));
});
test('B2 màn đáp án (ôn tập + luyện bổ sung): ảnh cũng sau pinyin, trước nghĩa', () => {
  const rest = REVIEW.slice(REVIEW.indexOf('function rvMatchHtml')); // bỏ rvIntroHtml (đã kiểm ở B1)
  const n = (rest.match(/rv-py[\s\S]{0,120}?wiSlot\(w\.hz\)[\s\S]{0,60}?rv-vi/g) || []).length;
  assert.strictEqual(n, 2, 'có ' + n + ' màn đáp án đặt đúng vị trí (cần 2: luyện bổ sung + ôn tập)');
});
test('B3 KHÔNG hiện ảnh ở màn câu hỏi (tránh lộ đáp án trước khi trả lời)', () => {
  const q = REVIEW.slice(REVIEW.indexOf('function rvQuestionBodyHtml'), REVIEW.indexOf('function rvCorrectionHtml'));
  assert.ok(q.length > 100 && !/wiSlot/.test(q));
});

// ── C. Màn "Hôm nay học" ──
function lessonEnv() {
  const ctx = { console, Math, Date, JSON, Set, Map, isLoggedIn: () => true, escapeHtml: s => String(s == null ? '' : s),
    progressState: { ui: { unlimitedStudy: false, dailyReviewLimit: 50, dailyNewLimit: 10, newOnlyAfterDue: true } },
    rvSentenceCount: () => 6, rvManualRating: () => false, rvQuestionMixHtml: () => '', rvTypedEnabled: () => false, rvOrderPerSession: () => 1, lessonName: l => 'Bài ' + l };
  vm.createContext(ctx); vm.runInContext(read('js/lesson.js'), ctx); return ctx;
}
const TODAY = (over) => Object.assign({ ok: true, hasScope: true, dueCount: 12, dueInScope: 20, newInCurrentLesson: 5, currentLesson: 7, weakCount: 0, blockedByBacklog: false, totalDue: 20, breakdown: null, progress: null, memory: null, daily: { reviewLimit: 50, newLimit: 10, unlimited: false, reviewToday: 8, newToday: 2 } }, over || {});
test('C1 "Cài đặt hằng ngày" gập sẵn (không chiếm màn hình trước khi học), vẫn đủ mọi cài đặt', () => {
  const h = vm.runInContext('renderToday()', lessonEnv());
  assert.ok(/<details class="td-settings">\s*<summary/.test(h), 'phải gập sẵn');
  for (const k of ['unlimitedStudy', 'dailyReviewLimit', 'dailyNewLimit', 'newOnlyAfterDue', 'rvSetSentenceCount', 'rvSetManualRating']) assert.ok(h.includes(k), 'thiếu cài đặt ' + k);
});
test('C2 nút "Bắt đầu học" đứng trước 3 số chính, thanh tiến độ ngay sau đó', () => {
  const h = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY({ progress: { officialAnswers: 10, practiceAnswers: 6, durationSeconds: 780 }, daily: { reviewLimit: 50, newLimit: 10, unlimited: false, reviewToday: 8, newToday: 2 } }))})`, lessonEnv());
  const iStart = h.indexOf('▶️ Bắt đầu học'), iSum = h.indexOf('class="td-summary"'), iProg = h.indexOf('Tiến độ nhiệm vụ hôm nay');
  assert.ok(0 < iStart && iStart < iSum && iSum < iProg, [iStart, iSum, iProg].join(','));
});
test('C3 chưa có gì phải làm: vẫn nói rõ giới hạn ngày đang áp dụng', () => {
  const h = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY({ dueCount: 0, newInCurrentLesson: 0, daily: { reviewLimit: 50, newLimit: 10, unlimited: false, reviewToday: 0, newToday: 0 } }))})`, lessonEnv());
  assert.ok(/class="td-limit"/.test(h) && h.includes('ôn 50') && h.includes('từ mới 10'), 'thiếu dòng giới hạn ngày');
});
runAll();
