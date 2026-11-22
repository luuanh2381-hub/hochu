#!/usr/bin/env node
// test/v175-resilience.test.js — V175: web hay "ngủ" (Neon/Vercel) → tải lỗi, phải F5.
// Kiểm tra: (1) fetch GET /api tự thử lại; (2) POST không bao giờ tự gửi lại; (3) thông báo lỗi tiếng Việt; (4) nút "Thử lại";
// (5) thư viện Excel tải theo nhu cầu; (6) lỗi gốc "bài bị đánh dấu đã tải dù server báo lỗi" đã sửa. Chạy hàm THẬT trong vm, không cần mạng/DB.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const RES = read('js/resilience.js');

function grab(src, name) {
  const re = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('); const m = re.exec(src); assert.ok(m, 'không thấy hàm ' + name);
  let d = 0; for (let j = src.indexOf('{', m.index); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(m.index, j + 1); }
}
const jsonRes = (status, body) => ({ status, ok: status < 400, json: async () => body });

// Môi trường trình duyệt giả: setTimeout chạy ngay (trừ đồng hồ "quá thời gian" 15s — do test chủ động kích hoạt khi cần).
function browser(fetchImpl, over) {
  const timers = []; const calls = [];
  const win = {};
  const ctx = Object.assign({
    window: win, navigator: { onLine: true },
    AbortController: class { constructor() { this.signal = { aborted: false, _l: [] }; } abort() { this.signal.aborted = true; this.signal._l.forEach((f) => f()); } },
    setTimeout: (fn, ms) => { if (ms >= 15000) { timers.push(fn); return timers.length; } Promise.resolve().then(fn); return 0; },
    clearTimeout: () => {},
    fetch: (...a) => { calls.push(a); return fetchImpl(...a); },
    document: over && over.document,
  }, over && over.extra);
  win.fetch = ctx.fetch;
  vm.createContext(ctx); vm.runInContext(RES, ctx);
  return { ctx, win, calls, fireTimeout: () => timers.splice(0).forEach((f) => f()) };
}
const sequence = (...steps) => { let i = 0; return async () => { const s = steps[Math.min(i++, steps.length - 1)]; if (s instanceof Error) throw s; return s; }; };

const tests = []; const test = (n, f) => tests.push([n, f]);

test('GET /api: server 503 (đang thức dậy) → tự thử lại rồi thành công', async () => {
  const b = browser(sequence(jsonRes(503, {}), jsonRes(503, {}), jsonRes(200, { ok: true })));
  const r = await b.win.fetch('/api/study/session', { headers: {} });
  assert.strictEqual(r.status, 200); assert.strictEqual(b.calls.length, 3);
});
test('GET /api: lỗi mạng 1 lần → thử lại; 500 cũng được thử lại', async () => {
  const b = browser(sequence(new TypeError('Failed to fetch'), jsonRes(500, {}), jsonRes(200, { ok: true })));
  const r = await b.win.fetch('/api/progress'); assert.strictEqual(r.status, 200); assert.strictEqual(b.calls.length, 3);
});
test('GET /api: lỗi người dùng 400/401/404 KHÔNG thử lại (không làm chậm vô ích)', async () => {
  for (const st of [400, 401, 404]) { const b = browser(sequence(jsonRes(st, { ok: false }))); const r = await b.win.fetch('/api/x'); assert.strictEqual(r.status, st); assert.strictEqual(b.calls.length, 1); }
});
test('hết số lần thử mà vẫn lỗi mạng → ném lỗi TIẾNG VIỆT dễ hiểu (không phải "Failed to fetch")', async () => {
  const b = browser(sequence(new TypeError('Failed to fetch')));
  await assert.rejects(() => b.win.fetch('/api/progress'), (e) => /Mạng đang chập chờn/.test(e.message) && !/Failed to fetch/.test(e.message));
  assert.strictEqual(b.calls.length, 3, '1 lần đầu + 2 lần thử lại');
});
test('server vẫn 503 sau khi thử hết → trả lại phản hồi cuối (code cũ tự xử lý như trước)', async () => {
  const b = browser(sequence(jsonRes(503, { ok: false, error: 'bận' }))); const r = await b.win.fetch('/api/x'); assert.strictEqual(r.status, 503); assert.strictEqual(b.calls.length, 3);
});
test('POST/PUT KHÔNG BAO GIỜ tự gửi lại (tránh ghi trùng); gọi thẳng fetch gốc với đúng tham số', async () => {
  const b = browser(sequence(jsonRes(503, {})));
  const opts = { method: 'POST', body: '{}' }; const r = await b.win.fetch('/api/study/review', opts);
  assert.strictEqual(r.status, 503); assert.strictEqual(b.calls.length, 1); assert.strictEqual(b.calls[0][1], opts);
});
test('chỉ GET nội bộ "/api/..." được bọc; URL ngoài hoặc noRetry thì đi thẳng', async () => {
  const b = browser(sequence(jsonRes(503, {})));
  await b.win.fetch('https://example.com/x'); await b.win.fetch('/api/x', { noRetry: true });
  assert.strictEqual(b.calls.length, 2, 'mỗi lệnh đúng 1 lần gọi');
});
test('quá thời gian chờ (server treo) → huỷ và thử lại, rồi báo lỗi tiếng Việt', async () => {
  let n = 0; let b;
  const hang = (url, o) => new Promise((res, rej) => { n++; o.signal._l.push(() => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); Promise.resolve().then(() => b.fireTimeout()); });
  b = browser(hang);
  await assert.rejects(() => b.win.fetch('/api/study/session'), (e) => /chập chờn/.test(e.message)); assert.strictEqual(n, 3);
});
test('đang offline → báo ngay, không chờ', async () => {
  const b = browser(sequence(jsonRes(200, {})), { extra: { navigator: { onLine: false } } });
  await assert.rejects(() => b.win.fetch('/api/x'), (e) => /offline/i.test(e.message)); assert.strictEqual(b.calls.length, 0);
});
test('friendlyNetError: đổi câu kỹ thuật thành tiếng Việt, giữ nguyên thông báo tiếng Việt của app', () => {
  const b = browser(sequence(jsonRes(200, {})));
  for (const m of ['Failed to fetch', 'Load failed', 'Unexpected token < in JSON at position 0', 'NetworkError when attempting to fetch resource.']) assert.ok(/Hãy bấm Thử lại/.test(b.ctx.friendlyNetError(new Error(m))), m);
  assert.strictEqual(b.ctx.friendlyNetError(new Error('Phiên đăng nhập đã hết hạn')), 'Phiên đăng nhập đã hết hạn');
});

// ---- khung "Thử lại"
function fakeEl() {
  const btns = {}; const mk = (k) => (btns[k] = { disabled: false, textContent: '', handlers: [], addEventListener(ev, f) { this.handlers.push(f); } });
  return { innerHTML: '', btns, querySelector(sel) { const k = /data-l[rb]="(\w+)"/.exec(sel)[1]; return /data-lr/.test(sel) ? (this.innerHTML.includes('data-lr="' + k + '"') ? btns['r_' + k] || mk('r_' + k) : null) : (btns['b_' + k] || mk('b_' + k)); } };
}
test('showLoadError: hiện nội dung đã thoát HTML + nút Thử lại gọi lại đúng hàm', () => {
  const b = browser(sequence(jsonRes(200, {}))); const el = fakeEl(); let retried = 0;
  assert.strictEqual(b.ctx.showLoadError('<img src=x onerror=1>', () => retried++, { container: el }), true);
  assert.ok(el.innerHTML.includes('Thử lại') && !el.innerHTML.includes('<img') && el.innerHTML.includes('&lt;img'));
  const rb = el.btns.r_retry; rb.handlers[0](); assert.strictEqual(retried, 1); assert.strictEqual(rb.disabled, true);
});
test('showLoadError: không có chỗ hiển thị → trả false để code cũ dùng cách cũ', () => {
  const b = browser(sequence(jsonRes(200, {})), { document: { getElementById: () => null } });
  assert.strictEqual(b.ctx.showLoadError('x', () => {}), false);
});

// ---- thư viện Excel theo nhu cầu
test('ensureXlsx: gọi nhiều lần chỉ chèn 1 thẻ script; tải xong có XLSX; lỗi tải cho phép thử lại', async () => {
  const added = []; const head = { appendChild: (s) => added.push(s) };
  const doc = { head, createElement: () => ({ set onload(f) { this._l = f; }, set onerror(f) { this._e = f; }, get onload() { return this._l; }, get onerror() { return this._e; } }) };
  const b = browser(sequence(jsonRes(200, {})), { document: doc });
  const p1 = b.ctx.ensureXlsx(), p2 = b.ctx.ensureXlsx(); assert.strictEqual(added.length, 1);
  assert.ok(/cdnjs\.cloudflare\.com.*xlsx/.test(added[0].src) && added[0].crossOrigin === 'anonymous', 'COEP cần crossOrigin');
  added[0].onerror(); await assert.rejects(p1, /Không tải được thư viện Excel/); await assert.rejects(p2, /Không tải được/);
  const p3 = b.ctx.ensureXlsx(); assert.strictEqual(added.length, 2, 'sau lỗi cho thử lại'); b.ctx.XLSX = { ok: 1 }; added[1].onload(); assert.deepStrictEqual(await p3, { ok: 1 });
  assert.strictEqual(added.length, 2); await b.ctx.ensureXlsx(); assert.strictEqual(added.length, 2, 'đã có XLSX thì không tải lại');
});

// ---- nối dây trong index.html + các chỗ dùng Excel
test('index.html: resilience.js nạp ĐẦU TIÊN; không còn thẻ tải thư viện Excel chặn trang', () => {
  const h = read('index.html'); const srcs = [...h.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(srcs[0], '/js/resilience.js'); assert.ok(!/xlsx/i.test(h), 'không còn xlsx trong index.html');
});
test('mọi hàm dùng XLSX đều gọi ensureXlsx() TRƯỚC khi dùng', () => {
  const spec = { 'js/admin.js': ['downloadExampleTemplate', 'readBundleFile', 'downloadVocabTemplate', 'uploadVocabExcel'], 'js/conversation.js': ['convoDownloadTemplate', 'convoReadFile'], 'js/admin-sentence-words.js': ['sentwSaveWorkbook'] };
  for (const [f, fns] of Object.entries(spec)) { const s = read(f); for (const fn of fns) { const body = grab(s, fn); assert.ok(body.indexOf('ensureXlsx') >= 0 && body.indexOf('ensureXlsx') < body.indexOf('XLSX.'), f + ':' + fn); } }
  assert.ok(/await sentwSaveWorkbook\(d\.rows/.test(read('js/admin-sentence-words.js')), 'sentwExport phải chờ lưu xong rồi mới báo ✅');
});

// ---- lỗi gốc: bài bị đánh dấu "đã tải" dù server trả lỗi
function vocabEnv(fetchImpl) {
  const banner = { shown: [], hidden: [] };
  const ctx = { BOOKS: [{ id: 1, from: 1, to: 2 }], loadedLessonNumbers: new Set(), authToken: 't', authHeaders: () => ({}), WORDS: [], _bookCountCache: { len: 0 }, render() {},
    fetch: fetchImpl, showLoadBanner: (m, r, k) => banner.shown.push({ m, r, k }), hideLoadBanner: (k) => banner.hidden.push(k), friendlyNetError: (e) => e.message };
  vm.createContext(ctx); vm.runInContext(grab(read('js/app.js'), 'ensureVocabLoaded') + '\nthis.run = ensureVocabLoaded;', ctx);
  return { ctx, banner };
}
test('ensureVocabLoaded: server trả ok:false → KHÔNG đánh dấu bài là đã tải + hiện thanh Thử lại (lỗi gốc "phải F5")', async () => {
  const { ctx, banner } = vocabEnv(async () => jsonRes(200, { ok: false, error: 'DB đang thức dậy' }));
  await ctx.run([1]); assert.strictEqual(ctx.loadedLessonNumbers.size, 0); assert.strictEqual(banner.shown.length, 1); assert.strictEqual(banner.shown[0].k, 'vocab'); assert.ok(/DB đang thức dậy/.test(banner.shown[0].m));
});
test('ensureVocabLoaded: lỗi mạng → thanh Thử lại; bấm Thử lại khi mạng ổn → có từ + đánh dấu đã tải + gỡ thanh', async () => {
  let ok = false; const { ctx, banner } = vocabEnv(async () => { if (!ok) throw new Error('Mạng chập chờn'); return jsonRes(200, { ok: true, vocab: [{ hz: '你', l: 1 }] }); });
  await ctx.run([1]); assert.strictEqual(ctx.loadedLessonNumbers.size, 0); ok = true; await banner.shown[0].r();
  assert.strictEqual(ctx.WORDS.length, 1); assert.ok(ctx.loadedLessonNumbers.has(1) && ctx.loadedLessonNumbers.has(2)); assert.ok(banner.hidden.includes('vocab'));
});
test('ensureVocabLoaded: thành công → tải đủ từ, không hiện cảnh báo', async () => {
  const { ctx, banner } = vocabEnv(async () => jsonRes(200, { ok: true, vocab: [{ hz: '你', l: 1 }, { hz: '好', l: 2 }] }));
  await ctx.run([1]); assert.strictEqual(ctx.WORDS.length, 2); assert.strictEqual(banner.shown.length, 0);
});
test('fetchTodayDashboard: phản hồi LỖI không bị nhớ (cache) 10 giây; phản hồi tốt thì có', async () => {
  const mk = (resp) => { const ctx = { _todayDashCache: null, _todayDashCacheAt: 0, TODAY_DASH_CACHE_TTL_MS: 10000, flushProgressSync: async () => {}, authHeaders: () => ({}), fetch: async () => jsonRes(200, resp) }; vm.createContext(ctx); vm.runInContext(grab(read('js/lesson.js'), 'fetchTodayDashboard') + '\nthis.run = fetchTodayDashboard;', ctx); return ctx; };
  const bad = mk({ ok: false, error: 'x' }); await bad.run(); assert.strictEqual(bad._todayDashCache, null);
  const good = mk({ ok: true, due: 3 }); await good.run(); assert.strictEqual(good._todayDashCache.due, 3);
});
test('màn học: lỗi tải phiên hiện khung Thử lại (không alert + đá về trang khác); 4 tab luyện tập cũng có nút Thử lại', () => {
  const rv = read('js/review.js');
  assert.ok(!/if \(error\) \{ alert\(error\); goTab\('today'\); return; \}/.test(rv), 'không còn alert + goTab trực tiếp ở 2 chỗ tải phiên');
  assert.strictEqual((rv.match(/rvLoadFailed\(error, \(\) =>/g) || []).length, 2, 'đúng 2 nơi gọi (không đếm phần khai báo hàm)');
  for (const f of ['flashcard', 'quiz', 'type', 'listen']) assert.ok(/showLoadError\(error,/.test(read('js/' + f + '.js')), f);
  assert.ok(/friendlyNetError\(e\)/.test(read('js/study-queue.js')) && /friendlyNetError\(e\)/.test(rv));
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
