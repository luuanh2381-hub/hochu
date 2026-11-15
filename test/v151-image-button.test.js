#!/usr/bin/env node
// test/v151-image-button.test.js — V151: nút "🖼️ Tạo ảnh" ngay trên thanh đầu của màn câu hỏi (admin, từ chưa có ảnh).
// Chạy THẬT js/word-image.js trong vm với DOM/fetch giả. KHÔNG cần trình duyệt/Postgres/mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

function mkBtn() { return { disabled: false, textContent: '', l: {}, addEventListener(t, f) { this.l[t] = f; }, click() { return this.l.click({ stopPropagation() {} }); } }; }
function mkEl(hz) {
  return {
    attrs: { 'data-hz': hz }, isConnected: true, className: 'wi-act', _html: '', btn: null, msg: null,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = v; },
    remove() { this.isConnected = false; },
    set innerHTML(h) { this._html = h; this.btn = mkBtn(); this.msg = { textContent: '', title: '' }; },
    get innerHTML() { return this._html; },
    querySelector(sel) { return sel === '.wi-hbtn' ? this.btn : (sel === '.wi-hmsg' ? this.msg : null); },
  };
}
// Dựng môi trường: routes = (url, opts) => JSON trả về. calls ghi lại mọi request.
function env({ admin = true, logged = true, routes }) {
  const calls = [];
  const els = [];
  const win = {
    fetch: (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve(routes(url, opts)) }); },
    authHeaders: () => (logged ? { Authorization: 'Bearer t' } : {}),
    isAdminRole: () => admin,
    document: { querySelectorAll: () => els.filter(e => !('data-wi' in e.attrs)) },
  };
  const ctx = { window: win, Map, Promise, Date, String, JSON, Object, console, setTimeout };
  vm.runInNewContext(read('js/word-image.js'), ctx);
  return { win, calls, els };
}
const tick = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };

test('wiActionSlot: chỉ admin + chữ Hán hợp lệ mới có ô nút; escape thuộc tính', () => {
  assert.ok(/class="wi-act" data-hz="好"/.test(env({ routes: () => ({}) }).win.wiActionSlot('好')));
  assert.strictEqual(env({ admin: false, routes: () => ({}) }).win.wiActionSlot('好'), '');
  assert.strictEqual(env({ routes: () => ({}) }).win.wiActionSlot('abc'), '');
  assert.strictEqual(env({ routes: () => ({}) }).win.wiActionSlot('"><script>'), '');
});

test('từ chưa có ảnh: hiện nút "🖼️ Tạo ảnh"; không hiện ảnh nào ở màn câu hỏi', async () => {
  const E = env({ routes: () => ({ ok: true, status: 'none' }) });
  const el = mkEl('好'); E.els.push(el);
  E.win.wiMountAction({ querySelectorAll: E.win.document.querySelectorAll });
  await flush();
  assert.ok(el.isConnected && el.btn, 'phải có nút');
  assert.strictEqual(el.btn.textContent, '🖼️ Tạo ảnh');
  assert.ok(!/<img/.test(el.innerHTML), 'không được hiện ảnh (tránh lộ đáp án)');
  assert.strictEqual(E.calls.length, 1); assert.ok(/\/api\/word-image\?hz=/.test(E.calls[0].url));
});

test('từ đã có ảnh (ready): ô nút tự biến mất; từ đã soạn chờ vẽ (pending): nút "Vẽ ảnh"', async () => {
  const E = env({ routes: () => ({ ok: true, status: 'ready', url: 'https://x/y.jpg' }) });
  const el = mkEl('好'); E.els.push(el); E.win.wiMountAction(); await flush();
  assert.strictEqual(el.isConnected, false);
  const P = env({ routes: () => ({ ok: true, status: 'pending' }) });
  const e2 = mkEl('好'); P.els.push(e2); P.win.wiMountAction(); await flush();
  assert.strictEqual(e2.btn.textContent, '🖼️ Vẽ ảnh');
});

test('người học thường / chưa đăng nhập: ô bị xoá, KHÔNG gọi API nào', async () => {
  for (const o of [{ admin: false }, { logged: false }]) {
    const E = env(Object.assign({ routes: () => ({ ok: true, status: 'none' }) }, o));
    const el = mkEl('好'); E.els.push(el); E.win.wiMountAction(); await flush();
    assert.strictEqual(el.isConnected, false); assert.strictEqual(E.calls.length, 0);
  }
});

test('bấm nút: POST đúng 1 lần dù bấm đúp, xong → "Đã tạo", lấy lại trạng thái ảnh', async () => {
  let ready = false;
  const E = env({ routes: (url) => url.startsWith('/api/admin/word-images/generate') ? (ready = true, { ok: true }) : { ok: true, status: ready ? 'ready' : 'none', url: ready ? 'https://x/y.jpg' : undefined } });
  const el = mkEl('好'); E.els.push(el); E.win.wiMountAction(); await flush();
  const b = el.btn; b.click(); b.click(); await flush();
  const posts = E.calls.filter(c => /generate/.test(c.url));
  assert.strictEqual(posts.length, 1, 'chỉ 1 lượt vẽ');
  assert.strictEqual(posts[0].opts.method, 'POST');
  assert.deepStrictEqual(JSON.parse(posts[0].opts.body), { hz: ['好'] });
  assert.ok(/Đã tạo/.test(b.textContent), b.textContent);
  assert.ok(/wi-act-done/.test(el.className));
});

test('lỗi (hết hạn mức / thiếu cấu hình / chưa vẽ xong): nút thành "Thử lại" + báo lý do, bấm lại được', async () => {
  const cases = [
    [{ ok: true, quota: true }, /Hết hạn mức/],
    [{ ok: true, notConfigured: ['CF_AI_TOKEN'] }, /CF_AI_TOKEN/],
    [{ ok: false, error: 'Không có quyền' }, /Không có quyền/],
  ];
  for (const [resp, re] of cases) {
    const E = env({ routes: (url) => /generate/.test(url) ? resp : { ok: true, status: 'none' } });
    const el = mkEl('好'); E.els.push(el); E.win.wiMountAction(); await flush();
    el.btn.click(); await flush();
    assert.strictEqual(el.btn.textContent, '🖼️ Thử lại'); assert.strictEqual(el.btn.disabled, false);
    assert.ok(re.test(el.msg.textContent), el.msg.textContent);
  }
});

test('review.js nối dây: ô nút ở thanh đầu (rv-head-act) cho thẻ có từ + gắn sau mỗi lần render; ảnh vẫn chỉ ở màn đáp án', () => {
  const src = read('js/review.js');
  assert.ok(/wiActionSlot\(cur\.word\.hz\)/.test(src));
  assert.ok(/rv-head-act">\$\{wiAct\}\$\{headAct\}/.test(src));
  assert.ok(/wiMountAction\(document\.querySelector\('\.rv-head'\)\)/.test(src));
  const css = read('css/styles.css');
  assert.ok(css.indexOf('.wi-hbtn') > 0 && css.indexOf('.wi-hbtn') < css.indexOf('V117 — STUDY WORKSPACE'), 'CSS nằm trong khối V142 (trước V117)');
  assert.ok(/crossorigin="anonymous"/.test(read('js/word-image.js')));
});

runAll();
