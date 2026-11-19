#!/usr/bin/env node
// test/v176-hsk-chars.test.js — V176: màn ĐÁP ÁN "Hôm nay học" hiện từng chữ Hán của từ đang kiểm tra nằm trong từ nào của HSK 1-3
// (không có thì tìm HSK 4). Chạy hàm THẬT trong vm, không cần mạng/DB.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SRC = read('js/hsk-chars.js');

const BOOKS = [{ id: 4, from: 33, to: 33 }, { id: 5, from: 34, to: 34 }, { id: 6, from: 35, to: 35 }, { id: 7, from: 36, to: 36 }];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = (hz, lv, py, vi) => ({ hz, lv, py: py || '', vi: vi || '' });

function env(over) {
  const clock = { now: 1000000 };
  const els = [];
  const ctx = Object.assign({
    BOOKS, WORDS: [], loadedLessonNumbers: new Set(), escapeHtml: esc, authHeaders: () => ({}),
    fetch: async () => ({ json: async () => ({ ok: true, vocab: [] }) }),
    Date: { now: () => clock.now },
    document: { querySelectorAll: () => els.slice() },
  }, over);
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, clock, els };
}
const fakeEl = (hz) => ({ hz, html: null, removed: false, getAttribute() { return hz; }, set outerHTML(v) { this.html = v; }, remove() { this.removed = true; } });
const J = (x) => JSON.parse(JSON.stringify(x)); // đưa mảng từ vm ra cùng 'vùng' với test để so sánh
const names = (item) => J(item.words.map((w) => w.hz));
const HI = (a, b) => a + '<span class="rv-hskc-hl">' + b + '</span>'; // dạng chữ đang tra được nhấn trong HTML

const tests = []; const test = (n, f) => tests.push([n, f]);

const POOL = [W('已经', 2, 'yǐjīng', 'đã'), W('经常', 3, 'jīngcháng', 'thường'), W('经济', 4, 'jīngjì', 'kinh tế'), W('经理', 3, 'jīnglǐ', 'giám đốc'), W('道理', 3, 'dàolǐ', 'đạo lý'), W('理想', 4, 'lǐxiǎng', 'lý tưởng'), W('好', 1, 'hǎo', 'tốt'), W('你好', 1, 'nǐhǎo', 'xin chào')];

test('mỗi chữ Hán được phân tích riêng; chính từ đang kiểm tra KHÔNG được tính', () => {
  const { ctx } = env(); const r = ctx.hskcAnalyze('经理', POOL);
  assert.deepStrictEqual(J(r.map((x) => x.ch)), ['经', '理']);
  assert.deepStrictEqual(names(r[0]), ['已经', '经常'], '经: chỉ HSK 1-3, từ HSK thấp trước, bỏ 经理 và bỏ 经济 (HSK 4 vì đã có HSK 1-3)');
  assert.deepStrictEqual(names(r[1]), ['道理'], '理: 道理 (HSK 3); 理想 là HSK 4 nên chưa dùng');
  assert.ok(!r[0].fallback4 && !r[1].fallback4);
});
test('chữ KHÔNG có trong HSK 1-3 → tìm tiếp trong HSK 4 và đánh dấu gợi ý HSK 4', () => {
  const { ctx } = env(); const r = ctx.hskcAnalyze('理想', POOL);
  const li = r.find((x) => x.ch === '理');
  assert.deepStrictEqual(names(li), ['经理', '道理'], '理 có ở HSK 3 (经理, 道理) nên KHÔNG rơi xuống HSK 4');
  const xiang = r.find((x) => x.ch === '想'); assert.deepStrictEqual(names(xiang), []);
  const only4 = ctx.hskcAnalyze('济', POOL)[0];
  assert.deepStrictEqual(names(only4), ['经济']); assert.strictEqual(only4.fallback4, true);
});
test('chữ không có ở HSK 1-4 → danh sách rỗng, không báo lỗi', () => {
  const { ctx } = env(); const r = ctx.hskcAnalyze('龘', POOL)[0];
  assert.deepStrictEqual(J(r.words), []); assert.strictEqual(r.total, 0); assert.strictEqual(r.fallback4, false);
});
test('chữ lặp chỉ hiện 1 lần; ký tự không phải chữ Hán bị bỏ qua', () => {
  const { ctx } = env(); const r = ctx.hskcAnalyze('好好A1…', POOL);
  assert.deepStrictEqual(J(r.map((x) => x.ch)), ['好']);
  assert.deepStrictEqual(names(r[0]), ['好', '你好'], 'chữ 好 tự nó là từ HSK 1 (xếp trước vì ngắn hơn) rồi tới 你好');
});
test('từ đang kiểm tra là 1 chữ (好): chính nó bị loại, các từ chứa nó vẫn hiện', () => {
  const { ctx } = env(); assert.deepStrictEqual(names(ctx.hskcAnalyze('好', POOL)[0]), ['你好']);
});
test('xếp theo HSK rồi độ dài; tối đa 3 từ + đếm tổng; từ trùng ở nhiều bài giữ HSK thấp nhất', () => {
  const { ctx } = env();
  const pool = [W('学习班', 3), W('学生', 1), W('学习', 2), W('学校', 1), W('留学生', 3), W('学生', 3)];
  const r = ctx.hskcAnalyze('学', pool)[0];
  assert.deepStrictEqual(names(r), ['学生', '学校', '学习'], 'HSK1 (ngắn trước, giữ thứ tự nạp) rồi HSK2'); assert.strictEqual(r.total, 5); assert.strictEqual(r.words[0].lv, 1, '学生 trùng 2 bài → giữ HSK 1');
});

// ---- HTML
test('HTML: chữ + nhãn HSK + pinyin + nghĩa luôn hiện; chữ đang tra được nhấn; thoát HTML', () => {
  const { ctx } = env(); const h = ctx.hskcBlockHtml('经理', [W('已经', 2, 'yǐjīng', 'đã <b>x</b>'), W('道理', 3, 'dàolǐ', 'đạo lý')]);
  assert.ok(h.includes('Từng chữ trong từ vựng HSK (2)'));
  assert.ok(h.includes('HSK 2') && h.includes('yǐjīng') && h.includes('đã &lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>x</b>'));
  assert.ok(h.includes(HI('已', '经')) && h.includes(HI('道', '理')), 'mỗi từ nhấn đúng chữ đang tra');
  assert.ok(!/rv-hskc-g odd/.test(h), '2 chữ → 2 cột đều, không lệch');
});
test('HTML: số chữ lẻ → ô cuối trải ngang (cân đối 2 bên); gợi ý HSK 4 và "chưa gặp" được ghi rõ; có "+N từ khác"', () => {
  const { ctx } = env();
  assert.ok(/rv-hskc-g odd/.test(ctx.hskcBlockHtml('经济理', POOL)), '3 chữ → odd');
  const h = ctx.hskcBlockHtml('济龘', POOL);
  assert.ok(h.includes('gợi ý HSK 4') && h.includes('HSK 4') && h.includes('Chưa gặp trong HSK 1–4'));
  const many = [W('学生', 1), W('学校', 1), W('学习', 2), W('留学', 3), W('大学', 1)];
  assert.ok(env().ctx.hskcBlockHtml('学', many).includes('+2 từ khác'));
  assert.strictEqual(ctx.hskcBlockHtml('ABC', POOL), '', 'không có chữ Hán → không hiện khối');
});

// ---- Tải dữ liệu
test('hskcLoad: dùng từ HSK đã có trong WORDS, CHỈ hỏi server các bài chưa tải; bỏ từ ngoài HSK 1-4; không đụng WORDS/loadedLessonNumbers', async () => {
  const calls = [];
  const WORDS = [{ hz: '好', py: 'hǎo', vi: 'tốt', l: 33 }, { hz: '苹果', py: 'píngguǒ', vi: 'táo', l: 1 }];
  const loaded = new Set([33]);
  const { ctx } = env({ WORDS, loadedLessonNumbers: loaded, fetch: async (u) => { calls.push(u); return { json: async () => ({ ok: true, vocab: [{ hz: '已经', py: 'yǐjīng', vi: 'đã', l: 34 }, { hz: '经济', py: 'jīngjì', vi: 'kinh tế', l: 36 }] }) }; } });
  const words = await ctx.hskcLoad();
  assert.deepStrictEqual(J(calls), ['/api/vocab?lessons=34,35,36']);
  assert.deepStrictEqual(J(words.map((w) => w.hz + ':' + w.lv)), ['好:1', '已经:2', '经济:4'], 'bài 1 (苹果) bị loại');
  assert.strictEqual(WORDS.length, 2); assert.deepStrictEqual([...loaded], [33]);
  await ctx.hskcLoad(); assert.strictEqual(calls.length, 1, 'đã có dữ liệu thì không tải lại');
});
test('hskcLoad: đủ 4 bài trong WORDS → không gọi server, hskcHtml có khối NGAY (không kẹt khung chờ)', () => {
  let n = 0; const WORDS = [{ hz: '你好', py: 'nǐhǎo', vi: 'xin chào', l: 33 }];
  const { ctx } = env({ WORDS, loadedLessonNumbers: new Set([33, 34, 35, 36]), fetch: async () => { n++; } });
  const h = ctx.hskcHtml('好'); assert.ok(h.includes('rv-hskc-g') && !h.includes('pending') && h.includes(HI('你', '好'))); assert.strictEqual(n, 0);
});
test('khung chờ → tự điền khi tải xong (màn đáp án hiện ra trước khi tải xong)', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const { ctx, els } = env({ fetch: async () => { await gate; return { json: async () => ({ ok: true, vocab: [{ hz: '你好', py: 'nǐhǎo', vi: 'xin chào', l: 33 }] }) }; } });
  const h = ctx.hskcHtml('好'); assert.ok(h.includes('rv-hskc-pending') && h.includes('data-hskc-hz="好"'));
  const el = fakeEl('好'); els.push(el); release(); await ctx.hskcLoad();
  assert.ok(el.html && el.html.includes(HI('你', '好')) && !el.removed);
});
test('tải lỗi → khung chờ biến mất (không báo lỗi làm phiền), tạm nghỉ 30 giây rồi tự thử lại', async () => {
  let ok = false, n = 0;
  const { ctx, clock, els } = env({ fetch: async () => { n++; if (!ok) throw new Error('mạng'); return { json: async () => ({ ok: true, vocab: [{ hz: '你好', py: 'nǐhǎo', vi: 'xin chào', l: 33 }] }) }; } });
  const h = ctx.hskcHtml('好'); assert.ok(h.includes('pending'));
  const el = fakeEl('好'); els.push(el); assert.strictEqual(await ctx.hskcLoad(), null);
  assert.ok(el.removed, 'khung chờ bị gỡ khi lỗi'); assert.strictEqual(ctx.hskcHtml('好'), '', 'đang nghỉ → không hiện gì, không gọi lại'); assert.strictEqual(n, 1);
  ok = true; clock.now += 31000; const h2 = ctx.hskcHtml('好'); assert.ok(h2.includes('pending'), 'hết nghỉ → thử lại'); await ctx.hskcLoad();
  assert.ok(ctx.hskcHtml('好').includes(HI('你', '好')));
});
test('server trả ok:false cũng coi là lỗi (không lưu danh sách rỗng làm kết quả)', async () => {
  const { ctx } = env({ fetch: async () => ({ json: async () => ({ ok: false, error: 'x' }) }) });
  assert.strictEqual(await ctx.hskcLoad(), null); assert.strictEqual(ctx.hskcWords, null);
});

// ---- Nối dây
test('nối dây: CHỈ 2 màn đáp án trong renderReview; KHÔNG ở màn giới thiệu/câu hỏi; tải sẵn khi vẽ màn học; index.html nạp trước review.js', () => {
  const rv = read('js/review.js');
  assert.strictEqual((rv.match(/hskcHtml\(w\.hz\)/g) || []).length, 2);
  const grab = (name) => { const m = new RegExp('function ' + name + '\\(').exec(rv); let d = 0; for (let j = rv.indexOf('{', m.index); j < rv.length; j++) { if (rv[j] === '{') d++; else if (rv[j] === '}' && !--d) return rv.slice(m.index, j + 1); } };
  for (const fn of ['rvIntroHtml', 'rvQuestionBodyHtml', 'rvMatchHtml']) assert.ok(!/hskc/.test(grab(fn)), fn + ' không được có khối này');
  assert.ok(/function renderReview\(\) \{\s*rvInjectStyle\(\);\s*if \(typeof hskcLoad === 'function'\) hskcLoad\(\);/.test(rv));
  assert.ok(rv.includes('.rv-hskc-g{display:grid;grid-template-columns:1fr 1fr'));
  const h = read('index.html'); assert.ok(h.indexOf('/js/hsk-chars.js') > 0 && h.indexOf('/js/hsk-chars.js') < h.indexOf('/js/review.js'));
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
