#!/usr/bin/env node
// test/v172-sentence-words.test.js — V172: "Từ mới trong câu ví dụ": xuất file → công cụ AI ngoài điền → nhập lại → hiện ở màn đáp án.
// Phần thuần + hiển thị chạy luôn; phần Postgres THẬT: không có Postgres → bỏ qua phần đó (mã 3).
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm'); const Module = require('module');
const { connectMini } = require('./helpers/mini-pg');
const ROOT = path.join(__dirname, '..'); const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');
const S = require('../js/sentence-words-file.js');
const STUB = /^(ts-fsrs|\.\/fsrs|\.\/fsrs-auto-rating|\.\/skill-store|\.\/word-notes)$/;
const pending = []; const test = (n, f, db) => pending.push({ n, f, db: !!db });
let passed = 0, failed = 0, skipped = 0; const createdDbs = []; let seq = 0;

const Z1 = '我们去公园散步。', Z2 = '他对艺术很感兴趣。';
test('dạng rộng (đúng dạng file XUẤT RA) đọc được; cột hz/cau_vi bị bỏ qua; ô trống bỏ qua', () => {
  const rows = S.exportRows([{ zh: Z1, hz: '公园', vi: 'Đi dạo', words: [] }]);
  assert.deepStrictEqual(Object.keys(rows[0]).slice(0, 7), ['zh', 'hz', 'cau_vi', 'word1', 'py1', 'vi1', 'note1']); assert.strictEqual(Object.keys(rows[0]).length, 3 + 4 * S.MAX_WORDS);
  rows[0].word1 = '散步'; rows[0].py1 = 'sànbù'; rows[0].vi1 = 'đi dạo'; rows[0].note1 = 'ly hợp'; rows[0].word3 = '公园'; rows[0].vi3 = 'công viên';
  const p = S.parseRows(rows); assert.deepStrictEqual(p.errors, []); assert.deepStrictEqual(p.ignoredColumns, []);
  assert.deepStrictEqual(p.sentences[0].words, [{ word: '散步', py: 'sànbù', vi: 'đi dạo', note: 'ly hợp' }, { word: '公园', py: '', vi: 'công viên', note: '' }]);
});
test('dạng dài (mỗi dòng 1 từ, câu lặp lại) gom đúng theo câu; từ trùng giữ từ đầu; tiêu đề tiếng Việt/hoa thường', () => {
  const p = S.parseRows([{ 'Câu': Z2, 'Từ': '感兴趣', 'Pinyin': 'gǎn xìngqù', 'Nghĩa': 'quan tâm' }, { 'Câu': Z2, 'Từ': '艺术', 'Nghĩa': 'nghệ thuật' }, { 'Câu': Z2, 'Từ': '艺术', 'Nghĩa': 'bản trùng' }, { 'Câu': Z1, 'Từ': '散步', 'Nghĩa': 'đi dạo' }]);
  assert.strictEqual(p.sentences.length, 2); assert.deepStrictEqual(p.sentences[0].words.map((w) => w.word), ['感兴趣', '艺术']); assert.strictEqual(p.sentences[0].words[1].vi, 'nghệ thuật');
});
test('kiểm tra từ: không nằm trong câu / thiếu nghĩa / quá dài / quá 8 từ → báo lỗi có số dòng, từ tốt vẫn nhận', () => {
  const p = S.parseRows([{ zh: Z1, word: '不在句里', vi: 'x' }, { zh: Z1, word: '公园', vi: '' }, { zh: Z1, word: '散步', vi: 'đi dạo' }, { zh: Z1, word: '散步'.repeat(20), vi: 'x' }]);
  assert.strictEqual(p.sentences[0].words.length, 1); assert.strictEqual(p.errors.length, 3);
  assert.ok(p.errors.some((e) => /không có trong câu/.test(e.reason) && e.line === 2) && p.errors.some((e) => /thiếu nghĩa/.test(e.reason)));
  const many = Array.from({ length: 10 }, (_, i) => ({ word: '字' + i, vi: 'v' })); const zh = many.map((m) => m.word).join('');
  const v = S.validateSentences([{ zh, words: many }]); assert.strictEqual(v.sentences[0].words.length, 8); assert.strictEqual(v.errors.length, 2);
});
test('cột từ thứ 9 trở đi được báo "bỏ qua"; validate phía server chặn dữ liệu bẩn (không tin client)', () => {
  const p = S.parseRows([{ zh: Z1, word1: '散步', vi1: 'đi dạo', word9: '公园', vi9: 'x' }]); assert.deepStrictEqual(p.ignoredColumns, ['word9', 'vi9']);
  const v = S.validateSentences([{ zh: '', words: [{ word: 'a', vi: 'b' }] }, { zh: Z1, words: [{ word: '公园', vi: 'công viên' }, null, { word: '散步' }] }, 'rác', null]);
  assert.strictEqual(v.sentences.length, 1); assert.strictEqual(v.sentences[0].words.length, 1); assert.ok(v.errors.length >= 3);
});
test('file mẫu hợp lệ + lời nhắc cho AI ngoài nêu rõ cột và quy tắc', () => {
  const p = S.parseRows(S.TEMPLATE_ROWS); assert.deepStrictEqual(p.errors, []); assert.strictEqual(p.sentences.length, 2);
  for (const k of ['word1', 'py1', 'vi1', 'note1', 'zh', 'hz', 'nguyên văn', 'KHÔNG sửa câu']) assert.ok(S.PROMPT_TEXT.includes(k), k);
});

// ── Hiển thị ở màn đáp án (hàm thật trong review.js) ──
function loadHtml() {
  const rv = read('js/review.js'); const a = rv.indexOf('function rvExWordsHtml('); const b = rv.indexOf('// V138 — câu CHỮ HÁN cần đọc');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ctx = { escapeHtml: esc, showPinyin: true }; vm.createContext(ctx); vm.runInContext(rv.slice(a, b) + '\nthis.f = rvExWordsHtml;', ctx); return ctx;
}
test('màn đáp án: liệt kê từ mới (chữ, pinyin, nghĩa, ghi chú), hiện đủ mọi từ (V175), thoát HTML, luôn hiện pinyin, không có dữ liệu → rỗng', () => {
  const c = loadHtml();
  const e = { hz: '公园', zh: Z1, words: [{ word: '公园', py: 'gōngyuán', vi: 'công viên' }, { word: '散步', py: 'sànbù', vi: 'đi <dạo>', note: 'ly hợp' }] };
  const h = c.f(e); assert.ok(h.includes('散步') && h.includes('sànbù') && h.includes('đi &lt;dạo&gt;') && h.includes('ly hợp') && h.includes('Từ mới trong câu'));
  assert.ok(h.includes('công viên'), 'V175: hiện đủ mọi từ, kể cả từ đang học');
  c.showPinyin = false; assert.ok(c.f(e).includes('sànbù'), 'V175: pinyin luôn hiện dù tắt Hiện Pinyin'); c.showPinyin = true;
  assert.strictEqual(c.f({ hz: 'a', words: [] }), ''); assert.strictEqual(c.f({ hz: 'a' }), ''); assert.strictEqual(c.f(null), ''); 
});
test('nối dây: 3 khối .rv-ex của Hôm nay học gọi rvExWordsHtml; server/route/nạp script đúng thứ tự; route chỉ admin', () => {
  const rv = read('js/review.js'); const exLines = rv.split('\n').filter((l) => l.includes('class="rv-ex"') && l.includes('rvExPy('));
  assert.strictEqual(exLines.length, 3); for (const l of exLines) assert.ok(/rvExWordsHtml\(/.test(l));
  const idx = read('index.html'); const pos = (f) => idx.indexOf('/js/' + f);
  assert.ok(pos('sentence-words-file.js') > 0 && pos('sentence-words-file.js') < pos('admin-sentence-words.js') && pos('admin-sentence-words.js') < pos('admin.js'));
  const api = read('api/index.js'); const seg = api.slice(api.indexOf("app.get('/api/admin/sentence-words/export'"), api.indexOf('async function adminOnly'));
  assert.ok((seg.match(/adminOnly\(req, res\)/g) || []).length === 2 && /SWX\.validateSentences/.test(seg) && /MAX_ROWS/.test(seg));
  assert.ok(/sentwPanelHtml\(\)/.test(read('js/admin.js')) && /SWX\.parseRows/.test(read('js/admin-sentence-words.js')) && /Hướng dẫn/.test(read('js/admin-sentence-words.js')));
});

// ── Postgres thật ──
function useDb(name) {
  const origLoad = Module._load;
  Module._load = function (request) { if (STUB.test(request)) return {}; if (request === 'pg') return { Pool: class { async connect() { return connectMini({ database: name }); } async query(s, p) { const c = await connectMini({ database: name }); try { return await c.query(s, p); } finally { c.end(); } } on() {} } }; return origLoad.apply(this, arguments); };
  const dbPath = path.join(ROOT, 'lib/db.js'); const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x'; delete require.cache[dbPath];
  return { D: require(dbPath), restore() { Module._load = origLoad; delete require.cache[dbPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; } };
}
test('db THẬT: xuất (thiếu/tất cả) → nhập (xem trước không ghi, thêm, bỏ qua từ đã có, ghi đè, câu không khớp) → màn học nhận words', async () => {
  const name = `t172_${process.pid}_${++seq}`;
  const a = await connectMini({ database: 'postgres' }); await a.query(`CREATE DATABASE ${name}`); a.end(); createdDbs.push(name);
  const { D, restore } = useDb(name);
  try {
    const probe = await connectMini({ database: name });
    await D.importVocab([{ hz: '公园', py: 'gōngyuán', vi: 'công viên', l: 4 }, { hz: '艺术', py: 'yìshù', vi: 'nghệ thuật', l: 4 }], false);
    await D.importWordExamples([{ hz: '公园', zh: Z1, vi: 'Chúng tôi đi dạo trong công viên.', py: 'Wǒmen qù gōngyuán sànbù.' }, { hz: '艺术', zh: Z2, vi: 'Anh ấy rất hứng thú với nghệ thuật.' }]);
    let ex = await D.listSentencesForWordsExport('missing', 100); assert.strictEqual(ex.rows.length, 2); assert.strictEqual(ex.total, 2); assert.strictEqual(ex.done, 0);
    const parsed = S.parseRows([{ zh: Z1, word1: '散步', py1: 'sànbù', vi1: 'đi dạo', word2: '公园', vi2: 'công viên' }, { zh: 'câu lạ không có trong kho 学。', word1: '学', vi1: 'học' }]);
    // xem trước: không ghi
    const dry = await D.importSentenceWords(parsed.sentences, { dryRun: true });
    assert.strictEqual(dry.wordsAdded, 2); assert.strictEqual(dry.notFound.length, 1); assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM sentence_words')).rows[0].n, 0);
    const r1 = await D.importSentenceWords(parsed.sentences, {}); assert.strictEqual(r1.wordsAdded, 2); assert.strictEqual(r1.sentencesTouched, 1);
    // xuất lại: câu 1 đã có → chỉ còn câu 2; "all" có kèm từ để sửa
    ex = await D.listSentencesForWordsExport('missing', 100); assert.deepStrictEqual(ex.rows.map((x) => x.zh), [Z2]); assert.strictEqual(ex.done, 1);
    const all = await D.listSentencesForWordsExport('all', 100); const row1 = all.rows.find((x) => x.zh === Z1); assert.deepStrictEqual(row1.words.map((w) => w.word), ['散步', '公园']);
    assert.strictEqual(S.exportRows(all.rows).find((r) => r.zh === Z1).word1, '散步', 'xuất "tất cả" giữ giải thích hiện có để sửa');
    // nhập lại (không ghi đè): từ đã có bị bỏ qua, từ mới được thêm, giữ thứ tự
    const r2 = await D.importSentenceWords(S.validateSentences([{ zh: Z1, words: [{ word: '散步', vi: 'KHÁC' }, { word: '我们', py: 'wǒmen', vi: 'chúng tôi' }] }]).sentences, {});
    assert.strictEqual(r2.wordsAdded, 1); assert.strictEqual(r2.wordsSkipped, 1);
    assert.strictEqual((await probe.query(`SELECT vi FROM sentence_words WHERE zh=$1 AND word='散步'`, [Z1])).rows[0].vi, 'đi dạo', 'không ghi đè khi chưa bật ghi đè');
    // ghi đè: thay toàn bộ từ của câu
    const r3 = await D.importSentenceWords(S.validateSentences([{ zh: Z1, words: [{ word: '散步', vi: 'đi bộ thư giãn' }] }]).sentences, { overwrite: true });
    assert.strictEqual(r3.wordsReplaced, 3); assert.strictEqual(r3.wordsAdded, 1);
    const rows = (await probe.query('SELECT word, vi FROM sentence_words WHERE zh=$1', [Z1])).rows; assert.deepStrictEqual(rows, [{ word: '散步', vi: 'đi bộ thư giãn' }]);
    // màn học: payload ví dụ kèm words (câu chưa có thì không có khoá words)
    const got = await D.getWordExamplesForLessons([4]); const g1 = got.find((x) => x.zh === Z1), g2 = got.find((x) => x.zh === Z2);
    assert.deepStrictEqual(g1.words, [{ word: '散步', py: '', vi: 'đi bộ thư giãn', note: '' }]); assert.ok(!('words' in g2)); assert.strictEqual(g1.hz, '公园');
    // nhập lặp lại cùng dữ liệu không lỗi, không nhân bản
    await D.importSentenceWords(S.validateSentences([{ zh: Z1, words: [{ word: '散步', vi: 'x' }] }]).sentences, {});
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM sentence_words')).rows[0].n, 1);
    probe.end();
  } finally { restore(); }
}, true);
test('db THẬT: bảng sentence_words lỗi KHÔNG làm mất kho ví dụ của màn học (phần phụ nuốt lỗi)', async () => {
  const name = `t172_${process.pid}_${++seq}`;
  const a = await connectMini({ database: 'postgres' }); await a.query(`CREATE DATABASE ${name}`); a.end(); createdDbs.push(name);
  const { D, restore } = useDb(name);
  try {
    const probe = await connectMini({ database: name });
    await D.importVocab([{ hz: '公园', py: 'gōngyuán', vi: 'công viên', l: 4 }], false);
    await D.importWordExamples([{ hz: '公园', zh: Z1, vi: 'x' }]);
    await D.getWordExamplesForLessons([4]); // tạo bảng
    await probe.query('ALTER TABLE sentence_words RENAME COLUMN vi TO vi_hong'); // phá bảng
    const got = await D.getWordExamplesForLessons([4]);
    assert.strictEqual(got.length, 1); assert.ok(!('words' in got[0])); probe.end();
  } finally { restore(); }
}, true);

(async () => {
  let pg = false; try { const a = await connectMini({ database: 'postgres' }); await a.query('SELECT 1'); a.end(); pg = true; } catch (e) { pg = false; }
  for (const { n, f, db } of pending) {
    if (db && !pg) { skipped++; console.log('  ⏭️  SKIP (không có Postgres) ' + n); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  if (pg) { try { const a = await connectMini({ database: 'postgres' }); for (const d of createdDbs) await a.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`); a.end(); } catch (e) { /* bỏ qua */ } }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`); process.exit(failed ? 1 : (skipped ? 3 : 0));
})();
