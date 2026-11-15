#!/usr/bin/env node
// test/v144-word-image-admin.test.js — V144: hệ thống quản lý & kiểm tra ẢNH GỢI NHỚ.
//
// A. Logic THUẦN (js/word-image-audit.js): phân loại theo 4 mức, thống kê bài/nhãn, nghi trùng,
//    cờ chất lượng, thứ tự hàng đợi ưu tiên (không trùng từ), nhãn trạng thái, CSV, báo cáo lượt chạy.
// B. Nối server: lọc `only` khi vẽ ảnh, 2 route mới (audit chỉ đọc DB, verify HEAD + ký URL trên R2).
// C. Nối giao diện: không tự tạo ảnh khi mở trang, chỉ xoá bản ghi khi đã xác minh ảnh hỏng, escape chuỗi.
//
// KHÔNG cần mạng/DB/R2 → KHÔNG chứng minh được: R2 thật trả 404/200 đúng, SQL thật trên Neon,
// ảnh hiển thị thật trên trình duyệt/điện thoại (phải mở trang quản trị bấm "Kiểm tra R2" mới biết).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('../js/word-image-audit.js');
const readSrc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

const STORY = 'Một người mẹ ôm con trong vườn hoa';
const WORDS = [
  { hz: '好', py: 'hǎo', vi: 'tốt', l: 36, tag: 'ly_hop', hanviet: 'hảo' },
  { hz: '好', py: 'hǎo', vi: 'tốt', l: 40, tag: null },
  { hz: '水', py: 'shuǐ', vi: 'nước', l: 37 },
  { hz: '火', py: 'huǒ', vi: 'lửa', l: 38 },
  { hz: '山', py: 'shān', vi: 'núi', l: 37 },
  { hz: '雨', py: 'yǔ', vi: 'mưa', l: 37 },
  { hz: '雨', py: 'yǔ', vi: 'mưa', l: 36 },
];
const ROWS = [
  { hz: '好', status: 'ready', storage_key: 'img/v1/aa/x.jpg', content_type: 'image/jpeg', file_size: 40000, story_vi: STORY, image_prompt: 'A happy mother hugging her child in a garden' },
  { hz: '水', status: 'ready', storage_key: 'img/v1/bb/y.jpg', content_type: 'image/jpeg', file_size: 3000, story_vi: STORY, image_prompt: 'flowing water 水 in a stream' },
  { hz: '火', status: 'failed', error: 'quota', story_vi: null, image_prompt: null },
];
const AUD = A.audit(WORDS, ROWS);
const item = (hz) => AUD.items.find((x) => x.hz === hz);
const group = (list, key) => list.find((x) => String(x.key) === String(key));

// ── A. Logic thuần ──
test('A1 audit: gộp theo CHỮ HÁN (1 chữ ở nhiều bài), phân loại đúng 4 mức, từ không có hàng = thiếu', () => {
  assert.strictEqual(AUD.items.length, 5, '5 chữ Hán khác nhau (好 xuất hiện 2 lần)');
  assert.deepStrictEqual(item('好').lessons, [36, 40]);
  assert.deepStrictEqual(item('好').tag, 'ly_hop', 'lấy nhãn từ hàng có nhãn');
  assert.strictEqual(item('好').bucket, 'ok');
  assert.strictEqual(item('水').bucket, 'ok');
  assert.strictEqual(item('火').bucket, 'error');
  assert.strictEqual(item('山').bucket, 'missing');
  assert.strictEqual(A.bucketOf({ status: 'prompted' }), 'pending');
  assert.strictEqual(A.bucketOf({ status: 'ready' }), 'error', 'ready mà KHÔNG có storage_key là hàng hỏng, phải vào nhóm lỗi để tạo lại');
  assert.deepStrictEqual([AUD.totals.total, AUD.totals.ok, AUD.totals.missing, AUD.totals.error], [5, 2, 2, 1]);
});
test('A2 nghi trùng: 2 từ có cùng câu chuyện gợi nhớ → cảnh báo cả 2 (mỗi từ phải có ảnh riêng)', () => {
  assert.deepStrictEqual(item('好').dupOf, ['水']);
  assert.deepStrictEqual(item('水').dupOf, ['好']);
  assert.strictEqual(AUD.totals.dup, 2);
  assert.deepStrictEqual(item('火').dupOf, []);
});
test('A3 cờ chất lượng: tệp quá nhỏ, prompt còn chữ Hán, thiếu câu chuyện, content-type lạ, lỗi tạo', () => {
  assert.deepStrictEqual(item('水').qc, ['tệp ảnh nhỏ bất thường', 'prompt còn chữ Hán']);
  assert.ok(item('火').qc.some((s) => /lỗi tạo/.test(s)));
  const it = A.buildItems([{ hz: '云', l: 1 }], [{ hz: '云', status: 'ready', storage_key: 'img/v1/c.jpg', content_type: 'text/plain', file_size: 50000 }])[0];
  it.bucket = 'ok';
  const qc = A.qcFlags(it);
  assert.ok(qc.includes('thiếu câu chuyện gợi nhớ') && qc.includes('content-type lạ'), JSON.stringify(qc));
});
test('A4 thống kê bài/nhãn: từ nhiều bài được đếm ở MỖI bài → cộng dồn các dòng LỚN HƠN tổng hệ thống', () => {
  const sum = AUD.byLesson.reduce((s, c) => s + c.total, 0);
  assert.ok(sum > AUD.totals.total, 'phải lớn hơn để không ai cộng nhầm ra tổng');
  assert.deepStrictEqual([group(AUD.byLesson, 37).total, group(AUD.byLesson, 37).missing, group(AUD.byLesson, 37).ok], [3, 2, 1]);
  assert.strictEqual(group(AUD.byLesson, 40).ok, 1, 'bài 40 vẫn thấy từ 好 đã có ảnh');
  assert.strictEqual(group(AUD.byTag, 'ly_hop').total, 1);
  assert.strictEqual(group(AUD.byTag, '(không nhãn)').total, 4);
  assert.strictEqual(group(AUD.byLesson, 37).pctOk, 33.3);
});
test('A5 pack/unpack: giữ đủ dữ liệu bảng cần (bài, nhãn, trạng thái, cờ, kích thước, lỗi)', () => {
  const back = A.unpackItems(A.packItems(AUD.items));
  assert.strictEqual(back.length, AUD.items.length);
  const w = back.find((x) => x.hz === '水');
  assert.deepStrictEqual(w.lessons, [37]);
  assert.strictEqual(w.bucket, 'ok');
  assert.strictEqual(w.size, 3000);
  assert.strictEqual(w.ctype, 'image/jpeg');
  assert.ok(w.hasDup && w.hasQc);
  assert.strictEqual(back.find((x) => x.hz === '火').errorText, 'quota');
  assert.ok(JSON.stringify(A.packItems(AUD.items)).length < AUD.items.length * 140, 'payload gọn cho điện thoại');
});
test('A6 hàng đợi: Bài 37 → 36 → 38 → sửa ảnh lỗi → bài còn lại (thiếu nhiều trước), KHÔNG trùng từ', () => {
  const st = A.buildStages(AUD.items, [37, 36, 38]);
  assert.deepStrictEqual(st.map((s) => s.kind + ':' + s.label), ['lesson:Bài 37', 'errors:Sửa ảnh lỗi']);
  assert.deepStrictEqual(st[0].hz.slice().sort(), ['山', '雨'].sort(), 'bài 37 gồm 2 từ thiếu');
  assert.deepStrictEqual(st[1].hz, ['火'], 'ảnh lỗi xếp ngay sau các bài ưu tiên');
  const all = st.reduce((a, s) => a.concat(s.hz), []);
  assert.strictEqual(new Set(all).size, all.length, 'mỗi chữ Hán chỉ nằm ở 1 chặng');
  // 雨 cũng thiếu ở bài 36 nhưng đã nằm ở bài 37 (ưu tiên trước) → bài 36 không còn từ nào
  assert.ok(!st.some((s) => s.label === 'Bài 36'));
  const rest = A.buildStages(AUD.items, []);
  assert.strictEqual(rest[0].kind, 'errors', 'không đặt bài ưu tiên thì sửa ảnh lỗi vẫn đứng trước phần mở rộng');
  assert.ok(rest.length >= 3 && rest[1].hz.length >= rest[rest.length - 1].hz.length, 'bài thiếu nhiều nhất đứng trước');
});
test('A7 nhãn trạng thái: phân biệt rõ bản ghi DB / có tệp R2 / không hiển thị được', () => {
  const ok = item('好');
  assert.ok(/chưa kiểm tra R2/.test(A.statusInfo(ok, {}).label), 'chỉ có bản ghi DB thì KHÔNG được báo là đạt');
  assert.ok(/Đạt/.test(A.statusInfo(ok, { v: 'stored', display: true }).label));
  assert.ok(/hỏng/.test(A.statusInfo(ok, { v: 'gone' }).label));
  assert.ok(/không hiển thị/.test(A.statusInfo(ok, { v: 'stored', display: false }).label));
  assert.strictEqual(A.statusInfo(item('山'), {}).label, 'Thiếu ảnh');
  assert.strictEqual(A.statusInfo(item('火'), {}).tone, 'bad');
  assert.strictEqual(A.statusInfo({ bucket: 'pending', qc: [], dupOf: [] }, {}).tone, 'warn');
});
test('A8 CSV: có BOM cho Excel, escape dấu phẩy/nháy, lọc đúng từ thiếu và ảnh hỏng', () => {
  const items = AUD.items.concat([Object.assign({}, item('好'), { vi: 'tốt, "rất tốt"' })]);
  const csvMissing = A.exportRows(items, {}, 'missing');
  assert.ok(csvMissing.startsWith('﻿'), 'có BOM');
  assert.ok(csvMissing.includes('Chữ Hán,Pinyin'));
  assert.ok(csvMissing.includes('山') && !csvMissing.includes('水'), 'chỉ từ thiếu ảnh');
  const csvAll = A.exportRows(items, { '水': { v: 'stored', display: true } }, 'all');
  assert.ok(csvAll.includes('"tốt, ""rất tốt"""'), 'escape đúng chuẩn CSV');
  const csvErr = A.exportRows(items, { '好': { v: 'gone' } }, 'error');
  assert.ok(csvErr.includes('火') && csvErr.includes('好') && !csvErr.includes('山'), 'gồm cả từ lỗi tạo và ảnh hỏng đã xác minh');
});
test('A9 báo cáo lượt chạy: đếm theo bài (đã tạo / lên R2 / hiển thị / lỗi / chưa xử lý) + lý do', () => {
  const items0 = [
    { hz: '山', vi: 'núi', lessons: [37], bucket: 'missing' },
    { hz: '雨', vi: 'mưa', lessons: [37], bucket: 'missing' },
    { hz: '好', vi: 'tốt', lessons: [36], bucket: 'ok' },
  ];
  const log = { '山': { gen: true, r2: true, show: true }, '雨': { gen: true, r2: false, show: false, reason: 'Hết hạn mức Cloudflare hôm nay' } };
  const rep = A.runReport(items0, log, new Set(['雨']));
  const l37 = rep.find((c) => c.l === 37);
  assert.deepStrictEqual([l37.total, l37.okStart, l37.missingStart, l37.created, l37.r2Ok, l37.showOk, l37.uploadFail, l37.unprocessed], [2, 0, 2, 2, 1, 1, 1, 1]);
  assert.strictEqual(rep.find((c) => c.l === 36).created, 0);
  const unp = A.unprocessedList(items0, log, new Set(['雨']), 'Người dùng dừng');
  assert.deepStrictEqual(unp, [{ hz: '雨', vi: 'mưa', lessons: '37', reason: 'Hết hạn mức Cloudflare hôm nay' }]);
  assert.strictEqual(A.unprocessedList(items0, {}, new Set(['山']), 'Người dùng dừng')[0].reason, 'Người dùng dừng');
});

// ── B. Nối server ──
test('B1 vẽ ảnh theo đúng danh sách yêu cầu: claimForImage nhận bộ lọc `only` (giữ thứ tự ưu tiên)', () => {
  const wi = readSrc('lib/word-images.js');
  assert.ok(/async claimForImage\(limit, only\)/.test(wi), 'store nhận tham số only');
  assert.ok(/\$3::text\[\] IS NULL OR hz = ANY\(\$3::text\[\]\)/.test(wi), 'SQL lọc theo danh sách');
  assert.ok(/claimForImage\(IMAGE_CONCURRENCY, only\)/.test(wi), 'runBatch truyền only xuống');
  assert.ok(/Array\.isArray\(runOpts\.only\) \? new Set/.test(wi), 'chuẩn hoá only thành Set như cũ');
});
test('B2 hai route mới đều admin + chỉ đọc: audit (DB) và verify (R2, tối đa 50 từ/lượt)', () => {
  const api = readSrc('api/index.js');
  assert.ok(/const wordImageAudit = require\('\.\.\/js\/word-image-audit'\)/.test(api), 'dùng chung module thuần với trình duyệt');
  const auditRoute = api.slice(api.indexOf("app.get('/api/admin/word-images/audit'"), api.indexOf("app.post('/api/admin/word-images/verify'"));
  assert.ok(/requireAuth\(req, res\)/.test(auditRoute) && /requireAdmin\(authed\.db\.users\[authed\.username\], res\)/.test(auditRoute));
  assert.ok(/getAllVocabWords\(\)/.test(auditRoute) && /svc\.store\.auditRows\(\)/.test(auditRoute));
  assert.ok(!/r2\.|headObject|presign/.test(auditRoute), 'audit KHÔNG được gọi R2 (nhanh, không quét bucket)');
  const verifyRoute = api.slice(api.indexOf("app.post('/api/admin/word-images/verify'"), api.indexOf("app.post('/api/admin/word-images/reset'"));
  assert.ok(/requireAdmin\(authed\.db\.users\[authed\.username\], res\)/.test(verifyRoute));
  assert.ok(/isValidHz[\s\S]{0,40}slice\(0, 50\)/.test(verifyRoute), 'giới hạn 50 từ mỗi lượt');
  assert.ok(/await r2\.headObject\(row\.storage_key\)/.test(verifyRoute), 'mức 2: kiểm tra tệp thật trên R2');
  assert.ok(/await r2\.presignImageGet\(row\.storage_key/.test(verifyRoute), 'mức 3: ký URL để xem ảnh');
  assert.ok(!/markReady|store\.remove|runBatch/.test(verifyRoute), 'verify chỉ ĐỌC, không sửa/xoá gì');
});
test('B3 3 route cũ của V142 vẫn nguyên vẹn (không phá thẻ quản trị đang chạy)', () => {
  const api = readSrc('api/index.js');
  for (const r of ["app.get('/api/word-image'", "app.post('/api/admin/word-images/generate'", "app.get('/api/admin/word-images/status'", "app.post('/api/admin/word-images/reset'"]) {
    assert.ok(api.includes(r), r);
  }
  assert.ok(/async auditRows\(\)/.test(readSrc('lib/word-images.js')) && /async rowsFor\(hzList\)/.test(readSrc('lib/word-images.js')));
});

// ── C. Nối giao diện ──
test('C1 index.html nạp module thuần TRƯỚC phần giao diện, cả hai trước admin.js', () => {
  const html = readSrc('index.html');
  const iA = html.indexOf('/js/word-image-audit.js'), iB = html.indexOf('/js/word-image-admin.js'), iC = html.indexOf('/js/admin.js');
  assert.ok(iA > 0 && iB > iA && iC > iB, `${iA} < ${iB} < ${iC}`);
});
test('C2 tab Từ vựng có panel mới và nạp số liệu khi mở (không phá kiểm tra của V142)', () => {
  const a = readSrc('js/admin.js');
  assert.ok(/wiaPanelHtml\(\)/.test(a) && /typeof wiaInit === 'function'\) wiaInit\(\)/.test(a));
  assert.ok(/loadWordImageStatus\(\);\s*\n\}/.test(a), 'V142 D2 vẫn phải khớp');
});
test('C3 mở trang quản trị KHÔNG tự tạo ảnh, KHÔNG tự kiểm tra R2 (chỉ đọc số liệu database)', () => {
  const s = readSrc('js/word-image-admin.js');
  const init = s.slice(s.indexOf('async function wiaInit()'), s.indexOf('g.wiaPanelHtml = wiaPanelHtml'));
  assert.ok(init.length > 100 && !/\bGI\b|word-images\/generate|word-images\/verify|wiaVerifyList\(/.test(init), 'wiaInit chỉ được nạp audit: ' + init.slice(0, 80));
  assert.ok(/K_AUDIT/.test(s) && /10 \* 60 \* 1000/.test(s), 'cache số liệu 10 phút, không gọi lại liên tục');
});
test('C4 hàng đợi đúng thứ tự bắt buộc + chia lô trong giới hạn API', () => {
  const s = readSrc('js/word-image-admin.js');
  assert.ok(/var PRIORITY_LESSONS = \[37, 36, 38\]/.test(s));
  assert.ok(/A\.buildStages\(state\.items, PRIORITY_LESSONS\)/.test(s));
  const chunk = Number((s.match(/var PAGE = (\d+), VERIFY_CHUNK = (\d+), GEN_CHUNK = (\d+)/) || []).slice(1)[2]);
  assert.strictEqual(chunk, 15);
  assert.ok(chunk <= 50 && Number((s.match(/VERIFY_CHUNK = (\d+)/) || [])[1]) <= 50, 'không vượt giới hạn 50 từ/route');
  assert.ok(/if \(d\.quota\) return 'Hết hạn mức Cloudflare/.test(s), 'hết quota thì dừng, không lặp vô hạn');
  assert.ok(/noProgress >= 2/.test(s) && /MAX_ROUNDS/.test(s), 'có trần vòng lặp + dừng khi 2 lượt không tiến triển');
});
test('C5 ảnh cũ chỉ bị xoá khi ĐÃ xác minh hỏng (không có tệp trên R2 hoặc không hiển thị được)', () => {
  const s = readSrc('js/word-image-admin.js');
  assert.ok(/it\.bucket === 'ok' && \(v\.v === 'gone' \|\| v\.display === false\)/.test(s), 'điều kiện xác minh trước khi xoá');
  assert.strictEqual((s.match(/word-images\/reset/g) || []).length, 1, 'chỉ có đúng 1 chỗ gọi reset');
  const match = s.match(/if \(!confirm\('Xoá bản ghi[\s\S]{0,200}/);
  assert.ok(match, 'phải hỏi xác nhận trước khi xoá');
});
test('C6 xác minh cả bước hiển thị: ảnh thu nhỏ ghi nhận load/lỗi thật của trình duyệt', () => {
  const s = readSrc('js/word-image-admin.js');
  assert.ok(/onload="wiaShown\('/.test(s) && /onerror="wiaBroken\('/.test(s));
  assert.ok(/img\.onload = function \(\) \{ done\(true\); \}/.test(s) && /img\.onerror = function \(\) \{ done\(false/.test(s));
  assert.ok(/e\.r2 = true;/.test(s) && /e\.show = ok;/.test(s), 'báo cáo ghi riêng "lên R2" và "hiển thị"');
  assert.ok(/if \(!d \|\| !d\.ok\) return 'Lỗi máy chủ/.test(s), 'không tin kết quả API tạo ảnh: vẫn đọc lại DB sau mỗi lô');
});
test('C7 escape đúng chỗ: chữ Hán trong onclick phải thoát cả dấu nháy kép, nội dung qua escapeHtml', () => {
  const s = readSrc('js/word-image-admin.js');
  assert.ok(/replace\(\/"\/g, '\\\\x22'\)/.test(s), 'escape \\x22 cho chuỗi JS trong thuộc tính HTML');
  assert.ok(/function esc\(s\) \{ return typeof g\.escapeHtml/.test(s));
  assert.ok(!/innerHTML = [^`'"]*\+ *it\.vi/.test(s), 'không nhét nghĩa tiếng Việt trực tiếp vào innerHTML');
  assert.ok(/esc\(it\.vi\)/.test(s));
});
test('C8 xuất CSV/Excel bằng Blob + BOM, có đủ 3 kiểu (thiếu ảnh / ảnh lỗi / tất cả)', () => {
  const s = readSrc('js/word-image-admin.js');
  assert.ok(/new Blob\(\[text\], \{ type: 'text\/csv;charset=utf-8' \}\)/.test(s));
  assert.ok(/wiaSaveCsv\('missing'\)/.test(s) && /wiaSaveCsv\('error'\)/.test(s) && /wiaSaveCsv\('all'\)/.test(s));
  assert.ok(/wiaSaveReportCsv/.test(s), 'xuất được cả báo cáo lượt chạy');
});

// ── D. Chạy THẬT js/word-image-admin.js trong DOM giả (bắt lỗi tham chiếu, kiểm luồng thật) ──
// Không thay cho việc mở trang quản trị trên trình duyệt thật, nhưng chứng minh: mở trang chỉ đọc DB,
// không gọi route tạo ảnh/kiểm tra R2; sau khi kiểm tra thì ảnh thu nhỏ dùng đúng URL ký sẵn.
function bootEnv(over) {
  const store = new Map();
  const mk = (id) => ({ id, innerHTML: '', textContent: '', style: {}, scrollIntoView() {}, querySelectorAll: () => [] });
  const doc = {
    getElementById(id) { if (!store.has(id)) store.set(id, mk(id)); return store.get(id); },
    createElement() { return { style: {}, appendChild() {}, remove() {}, click() {} }; },
    body: { appendChild() {} }, addEventListener() {},
  };
  const calls = [];
  const ls = {};
  const sandbox = {
    console, Math, Date, JSON, Set, Map, Promise, Error, Number, String, Array, Object, RegExp,
    setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {},
    document: doc, localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    escapeHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    authHeaders: () => ({ Authorization: 'Bearer t' }), isAdminRole: () => true,
    confirm: () => true, alert() {},
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Image: function () { const self = this; setTimeout(() => { if (self.onload) self.onload(); }); },
    fetch: (url, opts) => { calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null }); return over.fetch(url, opts); },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readSrc('js/word-image-audit.js'), sandbox);
  assert.ok(sandbox.WIAudit && sandbox.WIAudit.audit, 'module thuần phải nạp được thành WIAudit');
  vm.runInContext(readSrc('js/word-image-admin.js'), sandbox);
  return { sandbox, doc, calls, store };
}
const auditPayload = (items, extra) => Object.assign({
  ok: true, configured: true, missingEnv: [], generatedAt: new Date().toISOString(),
  totals: AUD.totals, byLesson: AUD.byLesson, byTag: AUD.byTag, words: A.packItems(items),
}, extra || {});

test('D1 mở tab Từ vựng: chỉ gọi đúng 1 lượt /audit, KHÔNG gọi tạo ảnh, KHÔNG kiểm tra R2', async () => {
  const env = bootEnv({ fetch: () => Promise.resolve({ json: () => Promise.resolve(auditPayload(AUD.items)) }) });
  assert.ok(/Kiểm tra &amp; tạo ảnh gợi nhớ/.test(env.sandbox.wiaPanelHtml()), 'khung panel có tiêu đề');
  await env.sandbox.wiaInit();
  assert.deepStrictEqual(env.calls.map((c) => c.url), ['/api/admin/word-images/audit']);
  const head = env.doc.getElementById('wia-head').innerHTML;
  assert.ok(head.includes('⛔ Thiếu') && head.includes('width:'), 'có 4 nhóm số + thanh tiến độ');
  const words = env.doc.getElementById('wia-words').innerHTML;
  assert.ok(words.includes('山') && words.includes('Thiếu ảnh'), 'bảng từng từ có dữ liệu thật: ' + words.slice(0, 60));
  assert.ok(env.doc.getElementById('wia-lessons').innerHTML.includes('Bài 37'));
  assert.ok(env.doc.getElementById('wia-tags').innerHTML.includes('ly_hop'));
  assert.ok(!words.includes('<img'), 'chưa kiểm tra R2 thì KHÔNG hiện ảnh thu nhỏ giả');
});
test('D2 sau khi kiểm tra R2: ảnh thu nhỏ dùng URL ký sẵn, từ tệp mất (gone) vào nhóm ảnh hỏng', async () => {
  const env = bootEnv({
    fetch: (url) => Promise.resolve({
      json: () => Promise.resolve(url.endsWith('/verify')
        ? { ok: true, configured: true, results: [{ hz: '水', v: 'stored', url: 'https://r2.example/x.jpg', size: 3000 }, { hz: '好', v: 'gone', reason: 'Không thấy tệp trên R2' }] }
        : auditPayload(AUD.items)),
    }),
  });
  await env.sandbox.wiaInit();
  await env.sandbox.wiaVerifyAll();
  const words = env.doc.getElementById('wia-words').innerHTML;
  assert.ok(words.includes('https://r2.example/x.jpg') && words.includes('crossorigin="anonymous"'), 'thu nhỏ lấy từ URL đã ký');
  assert.ok(words.includes('Ảnh hỏng: tệp không có trên R2'), 'từ 好 có nhãn ảnh hỏng');
  env.sandbox.wiaSetFilter('st', 'broken');
  const only = env.doc.getElementById('wia-words').innerHTML;
  assert.ok(only.includes('好') && !only.includes('山'), 'lọc "ảnh hỏng" chỉ còn từ đã xác minh hỏng');
  assert.ok(env.doc.getElementById('wia-head').innerHTML.includes('1 ảnh hỏng'), 'đếm được ảnh hỏng ở khối trên');
});
test('D3 hàng đợi chạy thật (1 chặng): tạo theo lô → kiểm tra R2 → xác minh hiển thị → có báo cáo', async () => {
  let done = false; // sau lô đầu coi như database đã có ảnh cho mọi từ của bài ưu tiên
  const env = bootEnv({
    fetch: (url) => {
      if (url.endsWith('/audit')) return Promise.resolve({ json: () => Promise.resolve(auditPayload(AUD.items.map((it) => (done ? Object.assign({}, it, { bucket: 'ok', row: null }) : it)))) });
      if (url.endsWith('/verify')) return Promise.resolve({ json: () => Promise.resolve({ ok: true, configured: true, results: env.calls[env.calls.length - 1].body.hz.map((hz) => ({ hz, v: 'stored', url: 'https://r2.example/' + encodeURIComponent(hz) + '.jpg' })) }) });
      if (url.endsWith('/generate')) { done = true; return Promise.resolve({ json: () => Promise.resolve({ ok: true, drafted: 2, generated: 2, failed: 0, quota: false, pendingDraft: 0 }) }); }
      return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: 'unexpected ' + url }) });
    },
  });
  await env.sandbox.wiaInit();
  await env.sandbox.wiaStartQueue();
  const genCalls = env.calls.filter((c) => c.url.endsWith('/generate'));
  assert.strictEqual(genCalls.length, 1, 'chỉ 1 lô cho bài 37');
  assert.deepStrictEqual(genCalls[0].body.hz.slice().sort(), ['山', '雨'].sort(), 'chỉ gửi từ còn thiếu của bài ưu tiên');
  assert.ok(env.calls.some((c) => c.url.endsWith('/verify')), 'phải kiểm tra lại tệp trên R2 sau khi tạo');
  const queue = env.doc.getElementById('wia-queue').innerHTML;
  assert.ok(queue.includes('Báo cáo lượt chạy'), 'có bảng báo cáo theo bài');
  assert.ok(!env.calls.some((c) => c.url.endsWith('/reset')), 'không xoá gì khi chạy hàng đợi');
});
test('D4 bấm "Chạy hàng đợi" nhưng HUỶ xác nhận → không có lượt tạo ảnh nào', async () => {
  const env = bootEnv({ fetch: () => Promise.resolve({ json: () => Promise.resolve(auditPayload(AUD.items)) }) });
  env.sandbox.confirm = () => false;
  await env.sandbox.wiaInit();
  await env.sandbox.wiaStartQueue();
  assert.ok(!env.calls.some((c) => c.url.endsWith('/generate')), 'không xác nhận thì không tạo ảnh: ' + JSON.stringify(env.calls.map((c) => c.url)));
});

runAll();
