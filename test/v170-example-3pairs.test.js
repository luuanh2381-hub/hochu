#!/usr/bin/env node
// V170: file câu ví dụ nhập được tới 3 cặp (zh/py/vi) / 1 từ. KHÔNG cần Postgres/mạng.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const EXF = require('../js/example-file.js');
let p = 0, f = 0;
const test = (n, fn) => { try { fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + '\n     ' + e.message); } };

test('dạng rộng: 1 dòng 3 cặp → 3 dòng {hz,zh,vi,py}, đúng thứ tự cặp và vị trí nguồn', () => {
  const r = EXF.expandRows([{ hz: '学习', zh1: 'A学习', py1: 'p1', vi1: 'v1', zh2: 'B学习', py2: 'p2', vi2: 'v2', zh3: 'C学习', py3: 'p3', vi3: 'v3' }]);
  assert.deepStrictEqual(r.rows, [
    { hz: '学习', zh: 'A学习', vi: 'v1', py: 'p1' }, { hz: '学习', zh: 'B学习', vi: 'v2', py: 'p2' }, { hz: '学习', zh: 'C学习', vi: 'v3', py: 'p3' }]);
  assert.deepStrictEqual(r.src, [{ line: 2, pair: 1 }, { line: 2, pair: 2 }, { line: 2, pair: 3 }]);
});
test('cặp trống bị bỏ qua; cặp 1 ghi không số (zh/py/vi) vẫn nhận', () => {
  const r = EXF.expandRows([{ hz: '朋友', zh: 'X朋友', py: 'p', vi: 'v', zh2: '', py2: '', vi2: '', zh3: 'Y朋友', py3: '', vi3: 'v3' }]);
  assert.strictEqual(r.rows.length, 2); assert.strictEqual(r.rows[1].zh, 'Y朋友'); assert.strictEqual(r.src[1].pair, 3);
});
test('dạng dài (cũ, 1 câu / dòng, từ lặp nhiều dòng) vẫn chạy y như trước', () => {
  const r = EXF.expandRows([{ hz: 'a', zh: 'za', vi: 'va', py: 'pa' }, { hz: 'a', zh: 'zb', vi: 'vb' }]);
  assert.deepStrictEqual(r.rows, [{ hz: 'a', zh: 'za', vi: 'va', py: 'pa' }, { hz: 'a', zh: 'zb', vi: 'vb', py: '' }]);
  assert.deepStrictEqual(r.src.map((s) => s.line), [2, 3]);
});
test('tiêu đề linh hoạt: hoa/thường, dấu, khoảng trắng, gạch dưới, tiếng Việt', () => {
  const r = EXF.expandRows([{ 'Chữ Hán': 'w', 'Câu ví dụ 1': 'z1w', 'Pinyin 1': 'p1', 'Nghĩa 1': 'v1', 'ZH_2': 'z2w', 'Piyin 2': 'p2', 'vi 2': 'v2' }]);
  assert.strictEqual(r.rows.length, 2); assert.strictEqual(r.rows[1].py, 'p2'); assert.strictEqual(r.rows[0].vi, 'v1');
});
test('cột cặp 4+ bị bỏ qua và được báo lại (không nuốt âm thầm)', () => {
  const r = EXF.expandRows([{ hz: 'w', zh1: 'a w', vi1: 'v', zh4: 'd w', vi4: 'v4' }]);
  assert.strictEqual(r.rows.length, 1); assert.ok(r.ignoredColumns.includes('zh4') && r.ignoredColumns.includes('vi4'));
});
test('dòng có từ nhưng không cặp nào → vẫn gửi 1 dòng rỗng để server báo thiếu; dòng hoàn toàn trống bị bỏ', () => {
  const r = EXF.expandRows([{ hz: 'w', zh1: '', vi1: '' }, { hz: '', zh1: '', vi1: '' }]);
  assert.strictEqual(r.rows.length, 1); assert.deepStrictEqual(r.rows[0], { hz: 'w', zh: '', vi: '', py: '' });
});
test('khoảng trắng thừa được cắt; số/giá trị null không làm lỗi', () => {
  const r = EXF.expandRows([{ hz: ' w ', zh1: '  a w ', vi1: null, py1: 5 }]);
  assert.deepStrictEqual(r.rows[0], { hz: 'w', zh: 'a w', vi: '', py: '5' });
});
test('labelFor: nhãn "dòng (cặp n)" theo lô; ngoài phạm vi → số dòng server', () => {
  const r = EXF.expandRows([{ hz: 'w', zh1: 'a', vi1: 'v', zh2: 'b', vi2: 'v' }]);
  assert.strictEqual(EXF.labelFor(r.src, 2, 0), '2'); assert.strictEqual(EXF.labelFor(r.src, 3, 0), '2 (cặp 2)');
  assert.strictEqual(EXF.labelFor(r.src, 99, 0), '99');
});
test('file mẫu: 3 cặp đầy đủ + 2 cặp; khi đọc lại ra đúng 5 câu', () => {
  const r = EXF.expandRows(EXF.TEMPLATE_ROWS); assert.strictEqual(r.rows.length, 5);
  for (const x of r.rows) assert.ok(x.zh.includes(x.hz), x.zh + ' phải chứa ' + x.hz);
});
test('nối dây: index.html nạp example-file.js trước admin.js; admin.js dùng EXF, chia lô ≤ 4000, báo cáo theo lô; server không đổi giới hạn 5000', () => {
  const idx = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(idx.indexOf('/js/example-file.js') > 0 && idx.indexOf('/js/example-file.js') < idx.indexOf('/js/admin.js'));
  const ad = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
  assert.ok(/EXF\.expandRows/.test(ad) && /WEX_CHUNK = 4000/.test(ad) && /EXF\.TEMPLATE_ROWS/.test(ad) && /tối đa 3 cặp/.test(ad));
  assert.ok(/WORD_EX_MAX_ROWS = 5000/.test(fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8')));
});
console.log(`\n${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
