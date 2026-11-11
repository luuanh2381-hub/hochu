#!/usr/bin/env node
// test/v119-registration.test.js — V119.3: superadmin BẬT/TẮT trang đăng ký + TẠO tài khoản cho người khác.
// Các route được TRÍCH từ api/index.js rồi chạy trong vm với DB trong bộ nhớ (không cần mạng/Postgres);
// giao diện (auth.js, admin.js) cũng chạy trong vm với DOM giả.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let passed = 0, failed = 0; const T = [];
const test = (n, f) => T.push([n, f]);

// ───────── trích mã từ api/index.js ─────────
const SRC = read('api/index.js');
function grab(start, end) { const a = SRC.indexOf(start); assert.ok(a >= 0, 'không thấy: ' + start); const b = SRC.indexOf(end, a); assert.ok(b > a, 'không thấy: ' + end); return SRC.slice(a, b); }
function routeSrc(marker) {
  const start = SRC.indexOf(marker); assert.ok(start > 0, 'không thấy route ' + marker);
  const open = SRC.indexOf('async (req, res) => {', start) + 'async (req, res) '.length;
  let depth = 0, i = open; for (; i < SRC.length; i++) { if (SRC[i] === '{') depth++; else if (SRC[i] === '}') { depth--; if (depth === 0) break; } }
  return '(async (req, res) ' + SRC.slice(open, i + 1) + ')';
}
const HELPERS = grab('function requireSuperAdmin(', '// ── Ghi nhận 1 lượt truy cập ──') + grab('// V119.3 — Đăng ký có thể bị superadmin TẮT.', '// Trạng thái đăng ký — CÔNG KHAI');

function makeEnv(opts = {}) {
  const state = {
    db: { users: { boss: { username: 'boss', role: 'superadmin', passwordHash: 'x' }, ad: { username: 'ad', role: 'admin', passwordHash: 'x' }, usr: { username: 'usr', role: 'user', passwordHash: 'x' }, ...(opts.users || {}) }, tokens: { tboss: 'boss', tad: 'ad', tusr: 'usr' }, visits: { total: 0, byDate: {} }, settings: opts.settings || {} },
    bcryptCalls: 0, logs: [], tokenN: 0,
  };
  if (opts.empty) { state.db.users = {}; state.db.tokens = {}; }
  const ctx = {
    console, Date,
    readDB: async () => (opts.staleRead ? JSON.parse(JSON.stringify(opts.staleRead)) : state.db),
    updateDB: async (fn) => { const copy = JSON.parse(JSON.stringify(state.db)); const r = await fn(copy); state.db = copy; return r; },
    requireAuth: async (req, res) => { const u = state.db.tokens[req.token]; if (!u) { res.status(401).json({ ok: false, error: 'Chưa đăng nhập' }); return null; } return { username: u, token: req.token, db: state.db }; },
    bcrypt: { hash: async (p) => { state.bcryptCalls++; return 'hash:' + p; } },
    checkRateLimit: () => true, makeToken: () => 'tok' + (++state.tokenN), emptyProgress: () => ({ ui: {} }), getRank: () => ({ name: 'r' }),
    logActivity: (u, r, a, d) => state.logs.push([u, r, a, d]), fail: (res) => res.status(500).json({ ok: false, error: 'GENERIC' }),
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS + '\nthis.__h = { isRegistrationOpen, validateNewAccount, REGISTRATION_CLOSED_MSG };', ctx);
  const mk = (marker) => { const h = vm.runInContext(routeSrc(marker), ctx); return async (body, token, extra) => { const out = { status: 200, body: null, headers: {} }; const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; }, set(k, v) { out.headers[k] = v; return this; } }; await h({ body: body || {}, token, headers: {}, ...(extra || {}) }, res); return out; }; };
  return { state, config: mk("app.get('/api/auth/config'"), register: mk("app.post('/api/register'"), toggle: mk("app.post('/api/admin/settings/registration'"), create: mk("app.post('/api/admin/users/create'") };
}

// ───────── trạng thái & đăng ký ─────────
test('mặc định (chưa có cài đặt) đăng ký MỞ — giữ nguyên hành vi cũ; /api/auth/config công khai, không cần token, không cache', async () => {
  const e = makeEnv(); const c = await e.config({}); assert.ok(c.body.ok && c.body.registrationOpen === true && c.headers['Cache-Control'] === 'no-store');
  const r = await e.register({ username: 'newbie', password: '1234' }); assert.ok(r.body.ok && r.body.role === 'user' && r.body.token);
});
test('đăng ký bị TẮT → 403 + registrationClosed, không tạo user, không tốn bcrypt; user cũ không bị ảnh hưởng', async () => {
  const e = makeEnv({ settings: { registrationOpen: false } });
  const n0 = Object.keys(e.state.db.users).length; const r = await e.register({ username: 'newbie', password: '1234' });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.ok, false); assert.strictEqual(r.body.registrationClosed, true); assert.ok(/tạm đóng/.test(r.body.error));
  assert.strictEqual(Object.keys(e.state.db.users).length, n0); assert.strictEqual(e.state.bcryptCalls, 0, 'từ chối sớm, không băm mật khẩu');
  assert.strictEqual((await e.config({})).body.registrationOpen, false); assert.ok(e.state.db.users.usr, 'tài khoản cũ còn nguyên');
});
test('chống đua: đọc cache cũ còn "mở" nhưng DB thật đã TẮT → vẫn bị chặn trong updateDB (đọc mới nhất, có khoá)', async () => {
  const stale = { users: { boss: {} }, tokens: {}, settings: {} };
  const e = makeEnv({ settings: { registrationOpen: false }, staleRead: stale });
  const r = await e.register({ username: 'sneaky', password: '1234' }); assert.strictEqual(r.body.ok, false); assert.strictEqual(r.body.registrationClosed, true); assert.ok(!e.state.db.users.sneaky);
});
test('hệ thống CHƯA có user nào → vẫn đăng ký được dù cờ tắt (không tự khoá mình ra ngoài) và là superadmin', async () => {
  const e = makeEnv({ empty: true, settings: { registrationOpen: false } }); const r = await e.register({ username: 'first', password: '1234' });
  assert.ok(r.body.ok && r.body.role === 'superadmin');
});
test('bật lại → đăng ký được; thông tin sai vẫn báo đúng lỗi cũ (tên/mật khẩu)', async () => {
  const e = makeEnv({ settings: { registrationOpen: true } });
  assert.ok((await e.register({ username: 'okuser', password: '1234' })).body.ok);
  assert.ok(/3-20/.test((await e.register({ username: 'a!', password: '1234' })).body.error)); assert.ok(/4 ký tự/.test((await e.register({ username: 'abcd', password: '12' })).body.error));
  assert.ok(/Thiếu/.test((await e.register({ username: '', password: '' })).body.error)); assert.ok(/đã tồn tại/.test((await e.register({ username: 'USR', password: '1234' })).body.error));
});

// ───────── bật/tắt (chỉ superadmin) ─────────
test('chỉ SUPERADMIN bật/tắt được; admin và user thường bị 403; chưa đăng nhập 401; giá trị không phải boolean → 400', async () => {
  const e = makeEnv();
  assert.strictEqual((await e.toggle({ open: false }, 'tad')).status, 403); assert.strictEqual((await e.toggle({ open: false }, 'tusr')).status, 403); assert.strictEqual((await e.toggle({ open: false }, 'nope')).status, 401);
  assert.strictEqual(e.state.db.settings.registrationOpen, undefined, 'không bị đổi khi bị từ chối');
  for (const bad of ['false', 0, null, undefined, 'tắt']) assert.strictEqual((await e.toggle({ open: bad }, 'tboss')).status, 400);
  const off = await e.toggle({ open: false }, 'tboss'); assert.ok(off.body.ok && off.body.registrationOpen === false && e.state.db.settings.registrationOpen === false);
  const on = await e.toggle({ open: true }, 'tboss'); assert.ok(on.body.ok && on.body.registrationOpen === true);
  assert.deepStrictEqual(e.state.logs.map(l => l[3]), ['Tắt trang đăng ký', 'Bật trang đăng ký']); assert.ok(e.state.logs.every(l => l[0] === 'boss' && l[2] === 'admin'));
});
test('tắt rồi thì /api/auth/config và /api/register phản ánh ngay', async () => {
  const e = makeEnv(); await e.toggle({ open: false }, 'tboss');
  assert.strictEqual((await e.config({})).body.registrationOpen, false); assert.strictEqual((await e.register({ username: 'late', password: '1234' })).status, 403);
  await e.toggle({ open: true }, 'tboss'); assert.ok((await e.register({ username: 'late', password: '1234' })).body.ok);
});

// ───────── tạo tài khoản (chỉ superadmin) ─────────
test('superadmin tạo tài khoản user/admin: lưu mật khẩu đã băm, tiến độ rỗng, KHÔNG trả token, ghi nhật ký; tạo được cả khi đăng ký đang TẮT', async () => {
  const e = makeEnv({ settings: { registrationOpen: false } });
  const r = await e.create({ username: 'Hoa_01', password: 'abcd', role: 'user' }, 'tboss');
  assert.ok(r.body.ok && r.body.user.key === 'hoa_01' && r.body.user.username === 'Hoa_01' && r.body.user.role === 'user'); assert.ok(!('token' in r.body) && !JSON.stringify(r.body).includes('abcd') && !JSON.stringify(r.body).includes('hash'));
  const u = e.state.db.users.hoa_01; assert.strictEqual(u.passwordHash, 'hash:abcd'); assert.ok(u.progress && u.createdAt); assert.strictEqual(u.role, 'user');
  assert.ok(!Object.values(e.state.db.tokens).includes('hoa_01'), 'không đăng nhập hộ');
  const a = await e.create({ username: 'trogiang', password: 'abcd', role: 'admin' }, 'tboss'); assert.ok(a.body.ok && e.state.db.users.trogiang.role === 'admin');
  const d = await e.create({ username: 'mac_dinh', password: 'abcd' }, 'tboss'); assert.strictEqual(e.state.db.users.mac_dinh.role, 'user', 'không nêu quyền → user');
  assert.ok(e.state.logs.some(l => /Tạo tài khoản "hoa_01" \(quyền user\)/.test(l[3])));
  assert.strictEqual(e.state.db.settings.registrationOpen, false, 'tạo tài khoản không đổi cài đặt đăng ký');
});
test('chỉ superadmin được tạo: admin/user 403, chưa đăng nhập 401 — không tạo gì', async () => {
  const e = makeEnv(); const n0 = Object.keys(e.state.db.users).length;
  for (const t of ['tad', 'tusr']) assert.strictEqual((await e.create({ username: 'hack1', password: '1234' }, t)).status, 403);
  assert.strictEqual((await e.create({ username: 'hack1', password: '1234' }, 'nope')).status, 401); assert.strictEqual(Object.keys(e.state.db.users).length, n0);
});
test('không thể tạo superadmin qua API; quyền lạ bị từ chối; tên/mật khẩu sai bị từ chối đúng lý do; trùng tên (không phân biệt hoa thường) bị từ chối', async () => {
  const e = makeEnv();
  for (const role of ['superadmin', 'root', 'Admin', 5]) assert.ok(/Quyền không hợp lệ/.test((await e.create({ username: 'tester1', password: '1234', role }, 'tboss')).body.error), String(role));
  assert.ok(/3-20/.test((await e.create({ username: 'ab', password: '1234' }, 'tboss')).body.error)); assert.ok(/3-20/.test((await e.create({ username: 'a b c', password: '1234' }, 'tboss')).body.error));
  assert.ok(/4 ký tự/.test((await e.create({ username: 'tester1', password: '123' }, 'tboss')).body.error)); assert.ok(/Thiếu/.test((await e.create({ username: 'tester1' }, 'tboss')).body.error));
  assert.ok(/đã tồn tại/.test((await e.create({ username: 'USR', password: '1234' }, 'tboss')).body.error)); assert.ok(!e.state.db.users.tester1 && e.state.db.users.usr.passwordHash === 'x', 'tài khoản cũ không bị ghi đè');
});
test('mã nguồn: cả 2 route admin đều yêu cầu superadmin; register dùng chung validateNewAccount; db.normalize có settings', () => {
  for (const m of ["app.post('/api/admin/settings/registration'", "app.post('/api/admin/users/create'"]) { const b = SRC.slice(SRC.indexOf(m), SRC.indexOf(m) + 500); assert.ok(/requireSuperAdmin\(authed\.db\.users\[authed\.username\], res\)/.test(b), m); }
  assert.ok(/validateNewAccount\(username, password\)/.test(routeSrc("app.post('/api/register'")));
  assert.ok(/db\.settings = \{\}/.test(read('lib/db.js').slice(read('lib/db.js').indexOf('function normalize'), read('lib/db.js').indexOf('function normalize') + 500)));
});

// ───────── giao diện ─────────
function makeDom() {
  const els = {}; const mk = (id, extra) => (els[id] = { id, style: {}, textContent: '', innerHTML: '', value: '', disabled: false, className: '', classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } }, ...extra });
  return { els, mk, document: { getElementById: id => els[id] || null } };
}
test('màn đăng nhập: đăng ký TẮT → ẩn tab Đăng ký + hiện ghi chú + tự về tab Đăng nhập; MỞ → hiện lại; lỗi mạng → giữ nguyên', async () => {
  const dom = makeDom(); ['auth-tab-register', 'auth-note'].forEach(id => dom.mk(id));
  let mode = 'register', switched = null; const resp = [{ ok: true, registrationOpen: false }, { ok: true, registrationOpen: true }, new Error('net')];
  const ctx = { document: dom.document, get authMode() { return mode; }, authSwitchTab(m) { switched = m; mode = m; }, fetch: async () => { const r = resp.shift(); if (r instanceof Error) throw r; return { json: async () => r }; } };
  vm.createContext(ctx); const src = read('js/auth.js'); vm.runInContext(src.slice(src.indexOf('let authRegistrationOpen'), src.indexOf('function authShowError')), ctx);
  await vm.runInContext('authLoadConfig()', ctx);
  assert.strictEqual(dom.els['auth-tab-register'].style.display, 'none'); assert.ok(/tạm đóng/.test(dom.els['auth-note'].textContent) && dom.els['auth-note'].classList.contains('show')); assert.strictEqual(switched, 'login');
  await vm.runInContext('authLoadConfig()', ctx); assert.strictEqual(dom.els['auth-tab-register'].style.display, ''); assert.strictEqual(dom.els['auth-note'].textContent, ''); assert.ok(!dom.els['auth-note'].classList.contains('show'));
  vm.runInContext('authApplyRegistration(false)', ctx); await vm.runInContext('authLoadConfig()', ctx); assert.strictEqual(dom.els['auth-tab-register'].style.display, 'none', 'mạng lỗi: không tự đổi trạng thái');
});
test('auth.js: mở màn đăng nhập thì hỏi cấu hình; đăng ký bị từ chối (registrationClosed) thì ẩn tab ngay', () => {
  const a = read('js/auth.js'); const o = a.slice(a.indexOf('function openAuthGate'), a.indexOf('function openAuthGate') + 300);
  assert.ok(/authLoadConfig\(\)/.test(o)); assert.ok(/data\.registrationClosed\) authApplyRegistration\(false\)/.test(a)); assert.ok(/id="auth-note"/.test(read('index.html')));
});
function makeAdmin(opts = {}) {
  const dom = makeDom(); ['adm-reg-state', 'adm-reg-btn', 'adm-new-user', 'adm-new-pass', 'adm-create-msg', 'adm-create-btn'].forEach(id => dom.mk(id)); dom.mk('adm-new-role', { value: 'user' });
  const fetches = []; const responses = (opts.responses || []).slice();
  const ctx = { document: dom.document, authHeaders: () => ({ Authorization: 'x' }), confirm: () => opts.confirm !== false, alert(m) { ctx._alert = m; }, adminLoadUsers() { ctx._reloaded = (ctx._reloaded || 0) + 1; },
    fetch: async (url, init) => { fetches.push({ url, init }); const r = responses.shift(); if (r instanceof Error) throw r; return { json: async () => r }; } };
  vm.createContext(ctx); const src = read('js/admin.js'); vm.runInContext(src.slice(src.indexOf('let adminRegOpen')), ctx);
  return { ctx, dom, fetches, run: c => vm.runInContext(c, ctx) };
}
test('màn quản trị: panel đăng ký chỉ dựng cho superadmin; hiển thị MỞ/TẮT đúng; bấm đổi → xác nhận → gọi API → cập nhật nút', async () => {
  const src = read('js/admin.js'); assert.ok(/currentRole==='superadmin' \? adminRegPanelHtml\(\) : ''/.test(src)); assert.ok(/currentRole === 'superadmin'\) adminLoadReg\(\)/.test(src));
  const a = makeAdmin({ responses: [{ ok: true, registrationOpen: true }, { ok: true, registrationOpen: false }] });
  await a.run('adminLoadReg()'); assert.ok(/Đang MỞ/.test(a.dom.els['adm-reg-state'].innerHTML) && a.dom.els['adm-reg-btn'].textContent === 'Tắt đăng ký' && !a.dom.els['adm-reg-btn'].disabled);
  await a.run('adminToggleRegistration()'); assert.strictEqual(a.fetches[1].url, '/api/admin/settings/registration'); assert.deepStrictEqual(JSON.parse(a.fetches[1].init.body), { open: false });
  assert.ok(/Đang TẮT/.test(a.dom.els['adm-reg-state'].innerHTML) && a.dom.els['adm-reg-btn'].textContent === 'Bật đăng ký');
  const h = a.run('adminRegPanelHtml()'); assert.ok(h.includes('adminToggleRegistration()') && h.includes('adminCreateUser()') && h.includes('adm-new-role'));
});
test('màn quản trị: huỷ xác nhận → không gọi API; lỗi mạng/quyền → thông báo, trạng thái giữ nguyên', async () => {
  const a = makeAdmin({ responses: [{ ok: true, registrationOpen: true }], confirm: false }); await a.run('adminLoadReg()'); await a.run('adminToggleRegistration()'); assert.strictEqual(a.fetches.length, 1);
  const b = makeAdmin({ responses: [{ ok: true, registrationOpen: true }, { ok: false, error: 'Chỉ quản trị cao nhất mới dùng được chức năng này' }] }); await b.run('adminLoadReg()'); await b.run('adminToggleRegistration()');
  assert.ok(/quản trị cao nhất/.test(b.ctx._alert) && /Đang MỞ/.test(b.dom.els['adm-reg-state'].innerHTML));
  const c = makeAdmin({ responses: [new Error('x')] }); await c.run('adminLoadReg()'); assert.ok(/Không tải được/.test(c.dom.els['adm-reg-state'].textContent) && c.dom.els['adm-reg-btn'].textContent === 'Thử lại');
});
test('màn quản trị: tạo tài khoản — kiểm tra rỗng, gửi đúng dữ liệu, báo thành công (xoá ô nhập, tải lại danh sách), báo lỗi từ server; hiển thị bằng textContent (không chèn HTML)', async () => {
  const a = makeAdmin({ responses: [{ ok: true, user: { key: 'hoa', username: 'Hoa', role: 'admin' } }, { ok: false, error: 'Tên đăng nhập đã tồn tại' }] });
  await a.run('adminCreateUser()'); assert.ok(/Nhập đủ/.test(a.dom.els['adm-create-msg'].textContent) && a.fetches.length === 0);
  a.dom.els['adm-new-user'].value = ' Hoa '; a.dom.els['adm-new-pass'].value = 'abcd'; a.dom.els['adm-new-role'].value = 'admin';
  await a.run('adminCreateUser()'); assert.strictEqual(a.fetches[0].url, '/api/admin/users/create'); assert.deepStrictEqual(JSON.parse(a.fetches[0].init.body), { username: 'Hoa', password: 'abcd', role: 'admin' });
  assert.ok(/Đã tạo "Hoa" \(admin\)/.test(a.dom.els['adm-create-msg'].textContent) && a.dom.els['adm-create-msg'].className.includes('ok')); assert.strictEqual(a.dom.els['adm-new-user'].value, ''); assert.strictEqual(a.dom.els['adm-new-pass'].value, ''); assert.strictEqual(a.ctx._reloaded, 1);
  a.dom.els['adm-new-user'].value = 'Hoa'; a.dom.els['adm-new-pass'].value = 'abcd'; await a.run('adminCreateUser()'); assert.ok(/đã tồn tại/.test(a.dom.els['adm-create-msg'].textContent) && a.dom.els['adm-create-msg'].className.includes('err') && a.dom.els['adm-create-btn'].disabled === false);
  assert.ok(!/innerHTML\s*=\s*[^;]*(d\.error|d\.user)/.test(read('js/admin.js').slice(read('js/admin.js').indexOf('async function adminCreateUser'))));
});
test('CSS của phần này nằm trước khối workspace (không vi phạm quy tắc selector của khối V117)', () => {
  const c = read('css/styles.css'); const a = c.indexOf('V119.3: bật/tắt trang đăng ký'), w = c.indexOf('V117 — STUDY WORKSPACE'); assert.ok(a > 0 && a < w);
});

(async () => { for (const [n, f] of T) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + String(e.stack || e).split('\n').slice(0, 4).join('\n     ')); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })();
