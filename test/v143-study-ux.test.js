#!/usr/bin/env node
// test/v143-study-ux.test.js — V143: bố cục màn "Hôm nay học"
//   (V173: đã gỡ các phần A/B về ảnh gợi nhớ vì tính năng ảnh gợi nhớ bị bỏ.)
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
// (V173: không còn dùng REVIEW/FC/CSS sau khi gỡ phần ảnh gợi nhớ)

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
