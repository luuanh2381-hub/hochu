#!/usr/bin/env node
// test/v180-one-file.test.js — V180: GỘP "Quản lý câu ví dụ bằng file" + "Từ mới trong câu" → chỉ cần tải lên 1 file.
//  (A) js/example-bundle.js (EXB): nhận dạng tự động file mới (1 dòng / 1 câu) và MỌI file cũ; mẫu gộp tự import lại được.
//  (B) Luồng giao diện THẬT trong js/admin.js (readBundleFile / uploadExampleFile / previewBundleFile / readExampleFile / downloadExampleTemplate)
//      + sentwPostSentences, chạy với Excel/DOM/server giả: bước ① tạo câu → bước ② nhập từ trong câu, đúng thứ tự, theo lô, báo lỗi đúng chỗ.
//  Server KHÔNG đổi — test này không thay cho thử với Postgres thật.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const EXF = require('../js/example-file.js'); const SWX = require('../js/sentence-words-file.js'); const EXB = require('../js/example-bundle.js');
const J = (x) => JSON.parse(JSON.stringify(x));
function grab(src, name) {
  const m = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); assert.ok(m, 'không thấy hàm ' + name);
  let d = 0; for (let j = src.indexOf('{', src.indexOf(')', m.index)); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(m.index, j + 1); }
}
const ADMIN = read('js/admin.js'); const SENTW = read('js/admin-sentence-words.js');

// ── dữ liệu mẫu ──
const W = (n, word, py, vi, note) => ({ ['word' + n]: word, ['py' + n]: py || '', ['vi' + n]: vi || '', ['note' + n]: note || '' });
const row1 = Object.assign({ hz: '学习', zh: '我每天学习汉语。', cau_py: 'Wǒ měitiān xuéxí Hànyǔ.', cau_vi: 'Mỗi ngày tôi học tiếng Trung.' }, W(1, '每天', 'měitiān', 'mỗi ngày'), W(2, '汉语', 'Hànyǔ', 'tiếng Trung'));
const row2 = { hz: '朋友', zh: '我有很多朋友。', cau_py: 'Wǒ yǒu hěn duō péngyou.', cau_vi: 'Tôi có rất nhiều bạn.' }; // chỉ có phần câu

const tests = []; const test = (n, f) => tests.push([n, f]);

// ───────── (A) EXB.parse
test('file GỘP mới (hz, zh, cau_py, cau_vi, word1…): tạo câu + từ trong câu; dòng chỉ có câu không gửi bước ②; số dòng khớp file', () => {
  const b = EXB.parse([row1, row2]);
  assert.strictEqual(b.mode, 'merged'); assert.deepStrictEqual(J(b.exampleRows), [{ hz: '学习', zh: row1.zh, vi: row1.cau_vi, py: row1.cau_py }, { hz: '朋友', zh: row2.zh, vi: row2.cau_vi, py: row2.cau_py }]);
  assert.deepStrictEqual(J(b.exampleSrc), [{ line: 2, pair: 1 }, { line: 3, pair: 1 }], 'dòng 1 dữ liệu = dòng 2 trong file (có dòng tiêu đề)');
  assert.strictEqual(b.sentences.length, 1); assert.deepStrictEqual(J(b.sentences[0].words.map((w) => w.word)), ['每天', '汉语']); assert.strictEqual(b.fatal, null);
});
test('file CÂU VÍ DỤ kiểu cũ (dạng rộng 3 cặp, dạng dài) → mode "examples", đọc bằng EXF như trước, không có từ trong câu', () => {
  const wide = [{ hz: '学习', zh1: '我学习。', py1: 'Wǒ xuéxí.', vi1: 'Tôi học.', zh2: '他学习。', py2: '', vi2: 'Anh học.', zh3: '', py3: '', vi3: '' }];
  const b = EXB.parse(wide); assert.strictEqual(b.mode, 'examples'); assert.deepStrictEqual(J(b.exampleRows), J(EXF.expandRows(wide).rows)); assert.strictEqual(b.exampleRows.length, 2); assert.strictEqual(b.sentences.length, 0);
  const long = [{ hz: '学习', zh: '我学习。', vi: 'Tôi học.', py: 'Wǒ xuéxí.' }]; const l = EXB.parse(long); assert.strictEqual(l.mode, 'examples'); assert.strictEqual(l.exampleRows.length, 1);
  const tu = EXB.parse([{ tu: '学习', zh: '我学习。', vi: 'Tôi học.' }]); assert.strictEqual(tu.mode, 'examples', '"tu" trơn là chữ Hán của từ (file cũ), KHÔNG phải cột từ-trong-câu'); assert.strictEqual(tu.exampleRows[0].hz, '学习');
});
test('file TỪ MỚI TRONG CÂU kiểu cũ (dạng rộng, dạng dài) → mode "words": chỉ từ trong câu, không tạo câu', () => {
  const wide = [Object.assign({ zh: '我们去公园散步。' }, W(1, '散步', 'sànbù', 'đi dạo', 'ly hợp'))];
  const b = EXB.parse(wide); assert.strictEqual(b.mode, 'words'); assert.strictEqual(b.exampleRows.length, 0); assert.strictEqual(b.sentences[0].words[0].note, 'ly hợp');
  const long = [{ zh: '我们去公园散步。', word: '散步', py: 'sànbù', vi: 'đi dạo', note: '' }, { zh: '我们去公园散步。', word: '公园', py: 'gōngyuán', vi: 'công viên', note: '' }];
  const l = EXB.parse(long); assert.strictEqual(l.mode, 'words'); assert.deepStrictEqual(J(l.sentences[0].words.map((w) => w.word)), ['散步', '公园']);
});
test('file XUẤT cho AI (zh, hz, cau_vi, word1…) sau khi AI điền → mode "merged"; câu đã có sẽ chỉ bị server bỏ qua như trùng', () => {
  const exported = SWX.exportRows([{ zh: '我们去公园散步。', hz: '公园', vi: 'Chúng tôi đi dạo trong công viên.', words: [] }]);
  const filled = exported.map((r) => Object.assign({}, r, W(1, '散步', 'sànbù', 'đi dạo')));
  const b = EXB.parse(filled); assert.strictEqual(b.mode, 'merged'); assert.deepStrictEqual(J(b.exampleRows), [{ hz: '公园', zh: '我们去公园散步。', vi: 'Chúng tôi đi dạo trong công viên.', py: '' }]); assert.strictEqual(b.sentences.length, 1);
  const unfilled = EXB.parse(exported); assert.strictEqual(unfilled.mode, 'merged'); assert.strictEqual(unfilled.sentences.length, 0, 'AI chưa điền → không có từ để gửi');
});
test('tiêu đề không phân biệt hoa/thường/dấu: "Chữ Hán", "Nghĩa câu", "Pinyin câu", "HZ", "Câu"…', () => {
  const b = EXB.parse([{ 'Chữ Hán': '学习', Câu: '我学习。', 'Pinyin câu': 'Wǒ xuéxí.', 'Nghĩa câu': 'Tôi học.', Word1: '学习', Py1: 'xuéxí', Vi1: 'học' }]);
  assert.strictEqual(b.mode, 'merged'); assert.deepStrictEqual(J(b.exampleRows[0]), { hz: '学习', zh: '我学习。', vi: 'Tôi học.', py: 'Wǒ xuéxí.' }); assert.strictEqual(b.sentences[0].words[0].vi, 'học');
});
test('dòng trùng (hz + zh) chỉ tạo 1 câu; dòng có hz + zh nhưng thiếu cau_vi KHÔNG tạo câu và được đếm để báo; từ trong câu vẫn nhận', () => {
  const b = EXB.parse([row1, Object.assign({}, row1), Object.assign({}, row1, { zh: '学习很好。', cau_vi: '', word1: '', word2: '' })]);
  assert.strictEqual(b.exampleRows.length, 1); assert.strictEqual(b.noMeaningRows, 1); assert.strictEqual(b.sentences.length, 1, 'zh trùng gộp 1 câu; dòng thiếu nghĩa không có từ nên không gửi');
});
test('từ không nằm trong câu / thiếu nghĩa → lỗi từ-trong-câu (bỏ từ đó), phần câu vẫn tạo được', () => {
  const b = EXB.parse([Object.assign({}, row1, W(3, '不在句里', 'x', 'y'), W(4, '公园', 'x', ''))]);
  assert.strictEqual(b.exampleRows.length, 1); assert.deepStrictEqual(J(b.sentences[0].words.map((w) => w.word)), ['每天', '汉语']); assert.ok(b.wordErrors.length >= 2 && b.wordErrors.every((e) => e.line === 2 || e.reason));
});
test('ĐỊNH DẠNG MƠ HỒ (vừa zh1/zh2 vừa word1…) → báo lỗi rõ ràng, không đoán; file rỗng / không đọc được → báo lỗi', () => {
  const a = EXB.parse([{ hz: '学习', zh1: '我学习。', py1: 'x', vi1: 'y', word1: '学习' }]); assert.ok(a.fatal && /zh1/.test(a.fatal) && /1 dòng cho 1 câu/.test(a.fatal)); assert.strictEqual(a.mode, 'empty');
  assert.ok(EXB.parse([]).fatal && EXB.parse(null).fatal);
  const none = EXB.parse([{ abc: 'x' }]); assert.ok(none.fatal);
  const blank = EXB.parse([Object.assign({ zh: '' }, W(1, '', '', ''))]); assert.ok(blank.fatal && blank.mode === 'empty');
});
test('file MẪU gộp tự import lại được: 3 câu, 2 câu có từ (3 từ), không lỗi, không cột bị bỏ qua; tiêu đề đủ 8 ô từ; sheet hướng dẫn có lời nhắc AI', () => {
  const b = EXB.parse(EXB.TEMPLATE_ROWS); assert.strictEqual(b.mode, 'merged'); assert.strictEqual(b.exampleRows.length, 3); assert.strictEqual(b.sentences.length, 2); assert.strictEqual(b.sentences.reduce((n, s) => n + s.words.length, 0), 3);
  assert.deepStrictEqual(b.wordErrors, []); assert.deepStrictEqual(b.ignoredColumns, []); assert.strictEqual(b.noMeaningRows, 0); assert.ok(Object.keys(EXB.TEMPLATE_ROWS[0]).includes('note8') && Object.keys(EXB.TEMPLATE_ROWS[0]).includes('cau_py'));
  const g = EXB.GUIDE_LINES.join('\n'); for (const k of ['hz', 'zh', 'cau_py', 'cau_vi', 'word1', 'Ghi đè', 'LỜI NHẮC']) assert.ok(g.includes(k), k); assert.ok(g.includes(SWX.PROMPT_TEXT.split('\n')[0]), 'kèm đúng lời nhắc AI cũ');
});

// ───────── (B) Luồng giao diện THẬT (admin.js) với Excel / DOM / server giả
function mkUi(rows, over) {
  const ui = { calls: [], progress: 0, search: 0, books: [], downloads: [], alerts: [], els: {} };
  const files = [{ name: 'f.xlsx', arrayBuffer: async () => new ArrayBuffer(8) }];
  ui.els['wex-file-input'] = { files, value: 'f.xlsx' }; ui.els['wex-file-result'] = { textContent: '', innerHTML: '' }; ui.els['wex-overwrite-words'] = { checked: false };
  const sheets = { 'Câu': { rows }, 'Hướng dẫn': { rows: [] } };
  const ctx = Object.assign({
    EXF, SWX, EXB, document: { getElementById: (id) => ui.els[id] || null }, authHeaders: () => ({}), ensureXlsx: async () => {}, alert: (m) => ui.alerts.push(m),
    loadWordExampleProgress: () => { ui.progress++; }, searchWordExamples: () => { ui.search++; },
    XLSX: { read: () => ({ Sheets: over && over.firstSheetOnly ? { Sheet1: { rows } } : sheets, SheetNames: over && over.firstSheetOnly ? ['Sheet1'] : ['Câu', 'Hướng dẫn'] }), utils: { sheet_to_json: (sh) => sh.rows, book_new: () => ({ sheets: [] }), json_to_sheet: (r) => ({ json: r }), aoa_to_sheet: (a) => ({ aoa: a }), book_append_sheet: (wb, sh, name) => wb.sheets.push({ name, sh }) }, writeFile: (wb, fn) => ui.downloads.push({ wb, fn }) },
    fetch: async (url, opts) => { const body = JSON.parse(opts.body); ui.calls.push({ url, body }); return { json: async () => (ctx.respond ? ctx.respond(url, body) : defaultResponse(url, body)) }; },
    Set, Math, JSON, Object, Array, Number, String,
  }, over);
  vm.createContext(ctx);
  const names = ['wexEsc', 'wexLines', 'wexModeLabel', 'wexBundleWarnings', 'wexWordErrors', 'readBundleFile', 'readExampleFile', 'uploadExampleFile', 'previewBundleFile', 'downloadExampleTemplate'];
  vm.runInContext('const WEX_CHUNK = 4000; const SENTW_CHUNK = 1500;\n' + [grab(SENTW, 'sentwPostSentences'), ...names.map((n) => grab(ADMIN, n))].join('\n') + '\n' + ['sentwPostSentences', ...names].map((n) => 'this.' + n + ' = ' + n + ';').join('\n'), ctx);
  ui.ctx = ctx; ui.result = () => ui.els['wex-file-result']; return ui;
}
function defaultResponse(url, body) {
  if (url === '/api/admin/word-examples/import') return { ok: true, added: body.rows.length, updatedPinyin: 0, duplicate: 0, skippedTotal: 0, withoutPinyin: 0, skipped: [] };
  if (url === '/api/admin/sentence-words/import') return { ok: true, dryRun: body.dryRun, sentencesTouched: body.sentences.length, wordsAdded: body.sentences.reduce((n, s) => n + s.words.length, 0), wordsSkipped: 0, wordsReplaced: 0, unchangedSentences: 0, notFound: [], notFoundTotal: 0, errors: [], errorTotal: 0 };
  return { ok: false, error: 'route lạ ' + url };
}
const posts = (ui) => ui.calls.map((c) => c.url + (c.body.dryRun ? '?dry' : ''));

test('(B) file GỘP: 1 lần bấm "Nhập file" → bước ① câu ví dụ RỒI bước ② từ trong câu; đúng dữ liệu, đúng thứ tự; ô chọn file được xoá; làm mới danh sách', async () => {
  const ui = mkUi([row1, row2]); await ui.ctx.uploadExampleFile();
  assert.deepStrictEqual(posts(ui), ['/api/admin/word-examples/import', '/api/admin/sentence-words/import']);
  assert.deepStrictEqual(J(ui.calls[0].body.rows), [{ hz: '学习', zh: row1.zh, vi: row1.cau_vi, py: row1.cau_py }, { hz: '朋友', zh: row2.zh, vi: row2.cau_vi, py: row2.cau_py }]);
  assert.strictEqual(ui.calls[1].body.sentences.length, 1); assert.strictEqual(ui.calls[1].body.sentences[0].zh, row1.zh); assert.strictEqual(ui.calls[1].body.dryRun, false); assert.strictEqual(ui.calls[1].body.overwrite, false);
  const h = ui.result().innerHTML; assert.ok(h.includes('Câu ví dụ:') && h.includes('thêm <b>2</b> câu') && h.includes('Từ mới trong câu:') && h.includes('<b>2</b> từ cho <b>1</b> câu'));
  assert.strictEqual(ui.els['wex-file-input'].value, ''); assert.strictEqual(ui.progress, 1); assert.strictEqual(ui.search, 1);
});
test('(B) tích "Ghi đè" → bước ② gửi overwrite=true và báo "ghi đè"', async () => {
  const ui = mkUi([row1]); ui.els['wex-overwrite-words'].checked = true; await ui.ctx.uploadExampleFile();
  assert.strictEqual(ui.calls[1].body.overwrite, true); assert.ok(ui.result().innerHTML.includes('ghi đè <b>2</b> từ'));
});
test('(B) file CÂU VÍ DỤ cũ: CHỈ gọi bước ① như trước (không đụng bước ②); file TỪ TRONG CÂU cũ: CHỈ bước ②', async () => {
  const a = mkUi([{ hz: '学习', zh1: '我学习。', py1: '', vi1: 'Tôi học.', zh2: '', py2: '', vi2: '' }]); await a.ctx.uploadExampleFile(); assert.deepStrictEqual(posts(a), ['/api/admin/word-examples/import']); assert.ok(!a.result().innerHTML.includes('Từ mới trong câu'));
  const b = mkUi([Object.assign({ zh: '我们去公园散步。' }, W(1, '散步', 'sànbù', 'đi dạo'))]); await b.ctx.uploadExampleFile(); assert.deepStrictEqual(posts(b), ['/api/admin/sentence-words/import']); assert.ok(b.result().innerHTML.includes('Từ mới trong câu') && !b.result().innerHTML.includes('Câu ví dụ:'));
});
test('(B) đọc sheet "Câu" nếu có; file không có sheet "Câu" thì dùng sheet đầu (file người dùng tự làm)', async () => {
  const ui = mkUi([row1], { firstSheetOnly: true }); await ui.ctx.uploadExampleFile(); assert.deepStrictEqual(posts(ui), ['/api/admin/word-examples/import', '/api/admin/sentence-words/import']);
});
test('(B) bước ① báo lỗi → DỪNG, không gửi bước ②, nói rõ "chưa nhập từ trong câu"', async () => {
  const ui = mkUi([row1], { respond: (url) => (url.includes('word-examples') ? { ok: false, error: 'Chỉ admin' } : defaultResponse(url, { sentences: [] })) }); await ui.ctx.uploadExampleFile();
  assert.deepStrictEqual(posts(ui), ['/api/admin/word-examples/import']); const t = ui.result().textContent; assert.ok(t.includes('Bước ①') && t.includes('Chỉ admin') && t.includes('chưa nhập từ trong câu'));
});
test('(B) bước ② báo lỗi → vẫn hiện kết quả bước ① đã làm xong + lỗi bước ②; không xoá ô chọn file (để thử lại)', async () => {
  const ui = mkUi([row1], { respond: (url, body) => (url.includes('sentence-words') ? { ok: false, error: 'Lỗi DB' } : defaultResponse(url, body)) }); await ui.ctx.uploadExampleFile();
  const h = ui.result().innerHTML; assert.ok(h.includes('Câu ví dụ:') && h.includes('Bước ②') && h.includes('Lỗi DB')); assert.strictEqual(ui.els['wex-file-input'].value, 'f.xlsx');
});
test('(B) câu của bước ② không khớp kho → liệt kê rõ; dòng thiếu cau_vi và từ sai được cảnh báo', async () => {
  const bad = Object.assign({}, row1, { zh: '学习很好。', cau_vi: '' }, W(1, '不在', 'x', 'y'), W(2, '', '', ''));
  const ui = mkUi([row1, bad], { respond: (url, body) => (url.includes('sentence-words') ? { ok: true, sentencesTouched: 0, wordsAdded: 0, wordsSkipped: 0, wordsReplaced: 0, notFound: ['学习很好。'], notFoundTotal: 1, errors: [] } : defaultResponse(url, body)) }); await ui.ctx.uploadExampleFile();
  const h = ui.result().innerHTML; assert.ok(h.includes('<b>1</b> câu không khớp') && h.includes('không khớp: 学习很好。') && h.includes('thiếu <b>cau_vi</b>') && h.includes('từ trong câu không hợp lệ'));
});
test('(B) chia lô: 4500 câu → 2 lô ≤ 4000 ở bước ①; 1600 câu có từ → 2 lô ≤ 1500 ở bước ②; nhãn dòng lỗi trỏ đúng dòng trong file', async () => {
  const many = Array.from({ length: 4500 }, (_, i) => Object.assign({ hz: '学习', zh: `我学习第${i}次。`, cau_py: '', cau_vi: 'x' }, i < 1600 ? W(1, '学习', 'xuéxí', 'học') : {}));
  const ui = mkUi(many, { respond: (url, body) => (url.includes('word-examples') && body.rows.length === 4000 ? { ok: true, added: 3999, updatedPinyin: 0, duplicate: 0, skippedTotal: 1, withoutPinyin: 0, skipped: [{ line: 5, reason: 'từ không có trong kho' }] } : defaultResponse(url, body)) });
  await ui.ctx.uploadExampleFile(); const sizes = ui.calls.map((c) => (c.body.rows || c.body.sentences).length);
  assert.deepStrictEqual(sizes, [4000, 500, 1500, 100]); assert.ok(ui.result().innerHTML.includes('Dòng 5: từ không có trong kho'), 'lô 1, dòng 5 của lô = dòng 5 trong file');
});
test('(B) XEM TRƯỚC: không gửi lô ghi nào; chỉ hỏi dryRun cho câu ĐÃ CÓ sẵn trong kho (không nằm trong file)', async () => {
  const ui = mkUi([row1, Object.assign({ zh: '他对艺术很感兴趣。' }, W(1, '感兴趣', 'gǎn xìngqù', 'quan tâm'))]); await ui.ctx.previewBundleFile();
  assert.deepStrictEqual(posts(ui), ['/api/admin/sentence-words/import?dry'], 'không có word-examples/import, và bước ② chỉ dryRun'); assert.strictEqual(ui.calls[0].body.sentences.length, 1); assert.strictEqual(ui.calls[0].body.sentences[0].zh, '他对艺术很感兴趣。');
  const h = ui.result().innerHTML; assert.ok(h.includes('Xem trước') && h.includes('chưa ghi gì') && h.includes('file gộp') && h.includes('Sẽ thử tạo <b>1</b>') && h.includes('được tạo cùng lúc ở bước ①')); assert.strictEqual(ui.els['wex-file-input'].value, 'f.xlsx', 'xem trước không xoá file');
  const only = mkUi([row1]); await only.ctx.previewBundleFile(); assert.deepStrictEqual(posts(only), [], 'mọi câu đều được tạo cùng lúc → không cần hỏi server');
});
test('(B) XOÁ THEO FILE dùng được với MỌI định dạng: file gộp → dòng câu của file; file cũ → như trước; file không có câu → báo lỗi', async () => {
  const g = mkUi([row1, row2]); const r = await g.ctx.readExampleFile(); assert.strictEqual(r.rows.length, 2); assert.deepStrictEqual(J(r.src), [{ line: 2, pair: 1 }, { line: 3, pair: 1 }]);
  const old = mkUi([{ hz: '学习', zh1: '我学习。', py1: '', vi1: 'Tôi học.', zh2: '他学习。', py2: '', vi2: 'Anh học.' }]); assert.strictEqual((await old.ctx.readExampleFile()).rows.length, 2);
  const w = mkUi([Object.assign({ zh: '我们去公园散步。' }, W(1, '散步', 'sànbù', 'đi dạo'))]); await assert.rejects(() => w.ctx.readExampleFile(), /không có dòng câu ví dụ/);
});
test('(B) lỗi đọc file (mơ hồ / chưa chọn file) hiện thông báo, không gọi server', async () => {
  const amb = mkUi([{ hz: '学习', zh1: '我学习。', py1: 'x', vi1: 'y', word1: '学习' }]); await amb.ctx.uploadExampleFile(); assert.deepStrictEqual(posts(amb), []); assert.ok(amb.result().textContent.startsWith('❌') && amb.result().textContent.includes('1 dòng cho 1 câu'));
  const none = mkUi([row1]); none.els['wex-file-input'].files = []; await none.ctx.uploadExampleFile(); assert.ok(none.result().textContent.includes('Chưa chọn file'));
});
test('(B) "Tải file mẫu": xuất đúng 2 sheet ("Câu" = mẫu gộp, "Hướng dẫn" = cách dùng + lời nhắc AI); tên file giữ nguyên; chờ thư viện Excel', async () => {
  const ui = mkUi([]); await ui.ctx.downloadExampleTemplate();
  assert.strictEqual(ui.downloads.length, 1); assert.strictEqual(ui.downloads[0].fn, 'mau-cau-vi-du.xlsx'); const sheets = ui.downloads[0].wb.sheets; assert.deepStrictEqual(sheets.map((s) => s.name), ['Câu', 'Hướng dẫn']);
  assert.deepStrictEqual(J(sheets[0].sh.json), J(EXB.TEMPLATE_ROWS)); assert.strictEqual(sheets[1].sh.aoa[0][0], 'Hướng dẫn'); assert.ok(sheets[1].sh.aoa.length > 10);
  const fail = mkUi([], { ensureXlsx: async () => { throw new Error('Không tải được thư viện Excel.'); } }); await fail.ctx.downloadExampleTemplate(); assert.deepStrictEqual(fail.alerts, ['Không tải được thư viện Excel.']); assert.strictEqual(fail.downloads.length, 0);
});
test('(B) sentwPostSentences: chia lô 1500, cộng dồn số liệu, báo lỗi kèm số câu đã nhập; dryRun/overwrite được chuyển đúng', async () => {
  const ui = mkUi([]); const list = Array.from({ length: 3200 }, (_, i) => ({ zh: 's' + i, words: [{ word: 'x', vi: 'y' }] }));
  const r = await ui.ctx.sentwPostSentences(list, true, true); assert.strictEqual(r.ok, true); assert.deepStrictEqual(ui.calls.map((c) => c.body.sentences.length), [1500, 1500, 200]); assert.ok(ui.calls.every((c) => c.body.dryRun === true && c.body.overwrite === true)); assert.strictEqual(r.tot.wordsAdded, 3200);
  const prog = []; const bad = mkUi([], { respond: (url, body) => (body.sentences.length === 1500 && bad.calls.length > 1 ? { ok: false, error: 'hết thời gian' } : defaultResponse(url, body)) });
  const r2 = await bad.ctx.sentwPostSentences(list, false, false, (d, t) => prog.push([d, t])); assert.strictEqual(r2.ok, false); assert.strictEqual(r2.doneBefore, 1500); assert.deepStrictEqual(prog[0], [1500, 3200]);
});

// ───────── nối dây
test('nối dây: 1 ô chọn file duy nhất; nút Xem trước/Nhập/Mẫu/Xoá theo file; panel xuất cho AI không còn ô chọn file hay nút nhập riêng; hàm nhập cũ đã gỡ; script nạp đúng thứ tự; server giữ nguyên', () => {
  const start = ADMIN.indexOf('📄 Quản lý câu ví dụ bằng file'); const panel = ADMIN.slice(start, ADMIN.indexOf('Xoá theo bài', start));
  assert.strictEqual((panel.match(/type="file"/g) || []).length, 1); assert.ok(panel.includes('id="wex-file-input"') && panel.includes('onclick="previewBundleFile()"') && panel.includes('onclick="uploadExampleFile()"') && panel.includes('onclick="downloadExampleTemplate()"') && panel.includes('onclick="previewDeleteExamplesByFile()"') && panel.includes('id="wex-overwrite-words"'));
  const sp = grab(SENTW, 'sentwPanelHtml'); assert.ok(!/type="file"|sentwImport|sentw-file-input|sentw-overwrite/.test(sp) && sp.includes("sentwExport('missing')") && sp.includes("sentwExport('all')") && sp.includes('sentw-result'));
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) { const s = read('js/' + f); assert.ok(!/sentwImport|sentwTemplate|sentw-file-input/.test(s), 'còn tham chiếu hàm/ô nhập cũ trong ' + f); }
  const idx = read('index.html'); const pos = (f) => idx.indexOf('/js/' + f); assert.ok(pos('example-file.js') < pos('sentence-words-file.js') && pos('sentence-words-file.js') < pos('example-bundle.js') && pos('example-bundle.js') < pos('admin-sentence-words.js') && pos('admin-sentence-words.js') < pos('admin.js'));
  const api = read('api/index.js'); for (const r of ["app.post('/api/admin/word-examples/import'", "app.post('/api/admin/sentence-words/import'", "app.get('/api/admin/sentence-words/export'", "app.post('/api/admin/word-examples/delete-by-file'"]) assert.ok(api.includes(r), r);
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
