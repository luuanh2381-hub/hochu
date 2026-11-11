#!/usr/bin/env node
// test/v118-hanzi-parts.test.js — V118.2: "đã có chiết tự" phải nghĩa là DÙNG ĐƯỢC, không chỉ là có dòng trong DB.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { normalizeParts, auditParts } = require('../lib/hanzi-parts');
let passed = 0, failed = 0; const T = [];
const test = (n, f) => T.push([n, f]);
test('dòng đúng dạng parts/note được chấp nhận; items lọc bỏ phần thiếu c/m', () => {
  assert.deepStrictEqual(normalizeParts({ type: 'parts', items: [{ c: '木', m: 'cây' }, { c: '', m: 'x' }, null] }), { type: 'parts', items: [{ c: '木', m: 'cây' }] });
  assert.deepStrictEqual(normalizeParts({ type: 'note', text: 'nét cơ bản' }), { type: 'note', text: 'nét cơ bản' });
});
test('dòng hỏng điển hình KHÔNG dùng được: items rỗng, note rỗng, sai type, null, {}, số', () => {
  for (const bad of [{ type: 'parts', items: [] }, { type: 'parts', items: [{ c: '木' }] }, { type: 'note', text: '  ' }, { type: 'x', text: 'a' }, null, {}, 5, 'không phải json'])
    assert.strictEqual(normalizeParts(bad), null, JSON.stringify(bad));
});
test('dòng bị mã hoá JSON 2 lần (chuỗi) vẫn đọc được', () => {
  assert.deepStrictEqual(normalizeParts(JSON.stringify({ type: 'note', text: 'ghi chú' })), { type: 'note', text: 'ghi chú' });
});
test('auditParts: done chỉ đếm dòng dùng được; tách "có dòng nhưng hỏng" khỏi "chưa có dòng"', () => {
  const rows = [{ hz: '创', parts: { type: 'note', text: 'ok' } }, { hz: '村', parts: { type: 'parts', items: [] } }, { hz: '造', parts: JSON.stringify({ type: 'note', text: 'ok' }) }];
  const a = auditParts(rows, new Set(['创', '造', '村', '鬱']));
  assert.strictEqual(a.done, 2); assert.deepStrictEqual(a.invalid, ['村']); assert.deepStrictEqual(a.missing, ['鬱']);
  assert.strictEqual(auditParts(rows, new Set(['创'])).done, 1);
});
test('trước V118.2 bộ đếm chỉ đếm dòng tồn tại → 村 (dòng hỏng) được tính "xong"; giờ thì không', () => {
  const rows = [{ hz: '村', parts: { type: 'parts', items: [] } }]; const set = new Set(['村']);
  assert.strictEqual(rows.filter(r => set.has(r.hz)).length, 1, 'cách đếm cũ');
  assert.strictEqual(auditParts(rows, set).done, 0, 'cách đếm mới');
});
test('client (flashcard.js): parts dạng chuỗi JSON được giải mã; dòng hỏng bị bỏ → hiện "Chưa có chiết tự", không crash', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/flashcard.js'), 'utf8');
  const code = src.slice(src.indexOf('let dbHanziParts'), src.indexOf('function fcUpdate'));
  const ctx = { isGuest: false, authToken: 't', authHeaders: () => ({}), HANZI_PARTS: {}, setTimeout: () => 0, console,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, parts: [{ hz: '造', parts: JSON.stringify({ type: 'note', text: 'xuoc + cao' }) }, { hz: '村', parts: 'rác' }] }) }) };
  vm.createContext(ctx); vm.runInContext(code, ctx); await vm.runInContext('loadHanziParts()', ctx);
  const h = vm.runInContext("renderHanziParts('造村')", ctx);
  assert.ok(h.includes('xuoc + cao')); assert.ok(h.includes('Chưa có chiết tự')); assert.ok(!h.includes('chờ AI'));
});
test('V118.3 bố cục mới (dữ liệu như ảnh 传来): mỗi chữ 1 thẻ, mỗi thành phần 1 dòng, có tiêu đề, escape HTML', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/flashcard.js'), 'utf8');
  const code = src.slice(src.indexOf('let dbHanziParts'), src.indexOf('function fcUpdate'));
  const ctx = { isGuest: false, authToken: 't', authHeaders: () => ({}), HANZI_PARTS: {}, setTimeout: () => 0, console,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, parts: [
      { hz: '传', parts: { type: 'note', text: '(chuyên môn/tập trung), đóng vai trò biểu âm' } },
      { hz: '来', parts: { type: 'parts', items: [{ c: '木', m: 'Hình ảnh cây lúa mì nguyên bản' }, { c: '丷', m: 'Hai hạt lúa mì <b>x</b>' }] } }] }) }) };
  vm.createContext(ctx); vm.runInContext(code, ctx); await vm.runInContext('loadHanziParts()', ctx);
  const h = vm.runInContext("renderHanziParts('传来')", ctx);
  assert.strictEqual((h.match(/class="hp-card"/g) || []).length, 2, 'mỗi chữ một thẻ');
  assert.strictEqual((h.match(/class="hp-comp"/g) || []).length, 2, 'mỗi thành phần một dòng');
  assert.ok(h.includes('Chiết tự') && h.includes('>传<') && h.includes('>来<') && h.includes('>木<'), 'có tiêu đề và đủ cả 2 chữ');
  assert.ok(h.includes('đóng vai trò biểu âm') && h.includes('Hình ảnh cây lúa mì nguyên bản'));
  assert.ok(!h.includes('<b>x</b>') && h.includes('&lt;b&gt;'), 'nội dung AI phải được escape');
});
test('V118.3 CSS: khối chiết tự không còn bị khoá 82px; chỉ mặt sau flashcard có giới hạn + cuộn', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', 'css/styles.css'), 'utf8');
  assert.ok(!/max-height:82px/.test(c) && !/\.fc-parts-/.test(c));
  const base = c.match(/\.hp-wrap\{[^}]*\}/)[0]; assert.ok(!/max-height|overflow/.test(base), base);
  assert.ok(/\.fc-back \.hp-wrap\{[^}]*max-height[^}]*overflow-y:auto/.test(c));
});
test('server: /api/hanzi-parts chỉ gửi dòng đã chuẩn hoá; progress/generate dùng auditParts; có xoá dòng hỏng trước khi sinh lại', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'api/index.js'), 'utf8');
  assert.ok(/getAllHanziParts\(\)\)\.map\(r => \(\{ hz: r\.hz, parts: normalizeParts/.test(s));
  assert.ok((s.match(/auditParts\(/g) || []).length >= 2); assert.ok(/deleteHanziParts\(audit\.invalid\)/.test(s));
});
(async () => { for (const [n, f] of T) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + String(e.stack).split('\n').slice(0, 3).join('\n     ')); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })();
