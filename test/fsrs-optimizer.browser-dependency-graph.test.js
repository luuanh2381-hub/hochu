// test/fsrs-optimizer.browser-dependency-graph.test.js
//
// V137 — tái hiện ĐÚNG lỗi production "Module name '@napi-rs/wasm-runtime' does not resolve to a valid
// URL" bằng một cây node_modules mô phỏng SÁT cấu trúc THẬT sau khi cài (manifest chép từ
// node_modules thật của @open-spaced-repetition/binding@0.5.0 + binding-wasm32-wasi@0.5.0):
//
//   binding-wasm32-wasi/wasi-worker-browser.mjs   (Worker script — module map RIÊNG, không có import map)
//     -> @napi-rs/wasm-runtime/runtime.js         (tầng 1)
//         -> ./dist/emnapi-plugins.js (tương đối) + @tybys/wasm-util (BẢN NESTED, khác bản hoisted)
//         -> @emnapi/core/dist/emnapi-core.mjs    (tầng 2)
//             -> @emnapi/wasi-threads             (tầng 3 — bản cũ maxDepth=2 KHÔNG BAO GIỜ chạm tới)
//                 -> tslib                        (tầng 4)
//         -> @emnapi/runtime/dist/emnapi.mjs      (tầng 2)
//   @tybys/wasm-util/lib/mjs/wasi/path.mjs        (chứa `validateString(from, 'from')` — bẫy regex cũ)
//
// Vì sao không dùng "package giả quá đơn giản": cây này có đủ 4 đặc điểm chỉ lộ ra ở package thật —
// exports map nhiều điều kiện, độ sâu phụ thuộc > 2, cùng 1 tên gói ở 2 root khác nhau, và câu
// `'from'` nằm trong chuỗi. Với code trước V137 test này FAIL (còn bare specifier + urlKey ghi đè nhau).
//
// Bộ test: (1) Worker tải được, (2) nội dung KHÔNG còn bare specifier, (3) phụ thuộc bậc 3–4 cũng được
// rewrite, (4) mọi URL rewrite trả HTTP 200, (5) file .wasm tải được, (6) không có vòng rewrite lặp vô
// hạn, (7) import tương đối/tuyệt đối không bị đụng vào. Mọi module phục vụ ra được `node --check`
// như ES module thật (bắt lỗi chọn nhầm bản CJS).

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const assert = require('assert');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
// Route .wasm vẫn dùng fs.createReadStream(...).pipe(res) -> response chỉ đầy đủ ở tick sau, nên test
// phải async. Gom test vào danh sách rồi chạy tuần tự ở cuối file.
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const API_SRC = process.env.HOCHU_OPTIMIZER_API || path.join(__dirname, '..', 'api', 'index.js');

function writeFile(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
const manifest = (root, rel, obj) => writeFile(root, rel, JSON.stringify(obj, null, 2));

function buildRealisticTree(root) {
  const NM = 'node_modules';
  // ── @open-spaced-repetition/binding — exports map CHẶT, không khai "./package.json"
  manifest(root, `${NM}/@open-spaced-repetition/binding/package.json`, {
    name: '@open-spaced-repetition/binding', version: '0.5.0',
    main: 'dist/index.cjs', module: 'dist/index.mjs',
    exports: {
      '.': { browser: './dist/browser.js', types: './dist/index.d.ts', require: './dist/index.cjs', import: './dist/index.mjs', default: './dist/index.mjs' },
      './dynamic-wasi': { browser: './dist/dynamic-wasi-browser.js', types: './dist/dynamic-wasi.d.ts', require: './dist/dynamic-wasi.cjs', default: './dist/dynamic-wasi.cjs' },
    },
    optionalDependencies: { '@open-spaced-repetition/binding-wasm32-wasi': '^0.5.0' },
  });
  writeFile(root, `${NM}/@open-spaced-repetition/binding/dist/index.js`, 'export {};\n');
  writeFile(root, `${NM}/@open-spaced-repetition/binding/dist/index.mjs`, 'export {};\n');
  writeFile(root, `${NM}/@open-spaced-repetition/binding/dist/dynamic-wasi.cjs`,
    'const x = require("fs"); module.exports = { initOptimizer: async () => ({}) };\n');
  writeFile(root, `${NM}/@open-spaced-repetition/binding/dist/dynamic-wasi-browser.js`,
    "import { getDefaultContext, instantiateNapiModuleSync, WASI } from '@napi-rs/wasm-runtime'\n\n" +
    'export async function initOptimizer(options) {\n' +
    '  const wasi = new WASI({ version: \'preview1\' })\n' +
    '  return instantiateNapiModuleSync(options.wasm, { wasi, context: getDefaultContext() })\n' +
    '}\n');

  // ── @open-spaced-repetition/binding-wasm32-wasi — cpu wasm32 (npm bỏ qua khi cài!), asset + worker
  manifest(root, `${NM}/@open-spaced-repetition/binding-wasm32-wasi/package.json`, {
    name: '@open-spaced-repetition/binding-wasm32-wasi', version: '0.5.0',
    main: 'fsrs-binding.wasi.cjs', cpu: ['wasm32'],
    exports: {
      '.': { browser: './fsrs-binding.wasi-browser.js', require: './fsrs-binding.wasi.cjs', default: './fsrs-binding.wasi.cjs' },
      './wasi-worker-browser.mjs': './wasi-worker-browser.mjs',
      './fsrs-binding.wasm32-wasi.wasm': './fsrs-binding.wasm32-wasi.wasm',
      './wasi-worker': { browser: './wasi-worker-browser.mjs', default: './wasi-worker.mjs' },
    },
    dependencies: { '@napi-rs/wasm-runtime': '^1.1.4', '@emnapi/core': '^1.10.0', '@emnapi/runtime': '^1.10.0' },
  });
  writeFile(root, `${NM}/@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm`,
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
  writeFile(root, `${NM}/@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasi-browser.js`,
    "import { createOnMessage, instantiateNapiModuleSync, WASI } from '@napi-rs/wasm-runtime'\n" +
    "const __wasmUrl = new URL('./fsrs-binding.wasm32-wasi.wasm', import.meta.url).href\n" +
    'export { __wasmUrl, createOnMessage, instantiateNapiModuleSync, WASI }\n');
  // Worker script — bare import ở ĐÂY là nguồn lỗi production thật (Worker không dùng import map).
  writeFile(root, `${NM}/@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs`,
    "import { instantiateNapiModuleSync, MessageHandler, WASI } from '@napi-rs/wasm-runtime'\n\n" +
    'const handler = new MessageHandler({ onLoad() { return new WASI({}) } })\n' +
    'self.onmessage = (e) => handler.receive(e.data)\n');

  // ── @napi-rs/wasm-runtime — BẢN HOISTED (khai trực tiếp trong package.json sau V137)
  manifest(root, `${NM}/@napi-rs/wasm-runtime/package.json`, {
    name: '@napi-rs/wasm-runtime', version: '1.2.7',
    exports: { '.': { import: './runtime.js', require: './runtime.cjs' }, './fs': { import: './dist/fs.js' } },
    dependencies: { '@tybys/wasm-util': '^0.10.3' },
  });
  writeFile(root, `${NM}/@napi-rs/wasm-runtime/runtime.cjs`,
    'const x = require("@emnapi/core"); module.exports = {};\n');
  writeFile(root, `${NM}/@napi-rs/wasm-runtime/runtime.js`,
    "import * as emnapiCore from '@emnapi/core'\n" +
    "import * as emnapiRuntime from '@emnapi/runtime'\n" +
    "import { plugins } from './dist/emnapi-plugins.js'\n" +
    "export * from '@tybys/wasm-util'\n" +
    'export const WASI = emnapiCore.WASIThreads\n' +
    'export const instantiateNapiModuleSync = emnapiRuntime.instantiateNapiModuleSync\n' +
    'export const getDefaultContext = emnapiRuntime.getDefaultContext\n' +
    'export const MessageHandler = emnapiCore.ThreadMessageHandler\n' +
    'export const createOnMessage = plugins\n');
  writeFile(root, `${NM}/@napi-rs/wasm-runtime/dist/emnapi-plugins.js`, 'export const plugins = 1;\n');
  // BẢN NESTED KHÁC VERSION của cùng tên gói — urlKey phải khác bản hoisted, không ghi đè root.
  manifest(root, `${NM}/@napi-rs/wasm-runtime/node_modules/@tybys/wasm-util/package.json`, {
    name: '@tybys/wasm-util', version: '0.9.0', module: './dist/esm.mjs',
    exports: { '.': { module: './dist/esm.mjs', import: './lib/mjs/index.mjs' } },
  });
  writeFile(root, `${NM}/@napi-rs/wasm-runtime/node_modules/@tybys/wasm-util/lib/mjs/index.mjs`,
    "import { load } from './wasi/path.mjs'\nexport const nestedUtil = load\n");
  // Bản nested cũng có đúng file bẫy `validateString(from, 'from')` — để test chứng minh bản được
  // phục vụ cho runtime.js là bản nested (URL/root không bị bản hoisted ghi đè).
  writeFile(root, `${NM}/@napi-rs/wasm-runtime/node_modules/@tybys/wasm-util/lib/mjs/wasi/path.mjs`, 'function validateString(value, name) { if (typeof value !== "string") throw new TypeError(name); }\n' +
    'export function load(from, to) {\n' +
    '  validateString(from, \'from\');\n' +
    '  validateString(to, \'to\');\n' +
    '  let p = `${from}\\\\${to}`;\n' +
    '  return p;\n' +
    '}\n');

  // ── @emnapi/core -> @emnapi/wasi-threads -> tslib (bậc 3, 4)
  manifest(root, `${NM}/@emnapi/core/package.json`, {
    name: '@emnapi/core', version: '1.11.3', main: 'index.js', module: './dist/emnapi-core.esm-bundler.js',
    exports: { '.': { module: './dist/emnapi-core.esm-bundler.js', import: './dist/emnapi-core.mjs', default: './index.js' } },
    dependencies: { '@emnapi/wasi-threads': '1.2.3', tslib: '^2.4.0' },
  });
  writeFile(root, `${NM}/@emnapi/core/dist/emnapi-core.mjs`,
    "import { ThreadManager, WASIThreads, ThreadMessageHandler } from '@emnapi/wasi-threads';\n" +
    "export * from '@emnapi/wasi-threads';\n" +
    'export { ThreadManager, WASIThreads, ThreadMessageHandler };\n');
  manifest(root, `${NM}/@emnapi/runtime/package.json`, {
    name: '@emnapi/runtime', version: '1.11.3', main: 'index.js', module: './dist/emnapi.esm-bundler.js',
    exports: { '.': { module: './dist/emnapi.esm-bundler.js', import: './dist/emnapi.mjs', default: './index.js' } },
    dependencies: { tslib: '^2.4.0' },
  });
  writeFile(root, `${NM}/@emnapi/runtime/dist/emnapi.mjs`,
    'export const instantiateNapiModuleSync = () => ({});\nexport const getDefaultContext = () => ({});\n');
  manifest(root, `${NM}/@emnapi/wasi-threads/package.json`, {
    name: '@emnapi/wasi-threads', version: '1.2.3', main: 'index.js',
    exports: { '.': { module: './dist/wasi-threads.esm-bundler.js', import: './dist/wasi-threads.mjs', default: './index.js' } },
    dependencies: { tslib: '^2.4.0' },
  });
  writeFile(root, `${NM}/@emnapi/wasi-threads/dist/wasi-threads.mjs`,
    "import { __extends } from 'tslib';\nexport class ThreadManager {}\nexport class WASIThreads {}\nexport class ThreadMessageHandler {}\nexport const __x = __extends;\n");
  manifest(root, `${NM}/tslib/package.json`, {
    name: 'tslib', version: '2.8.1', main: 'tslib.js', module: 'tslib.es6.mjs',
    exports: { '.': { module: './tslib.es6.mjs', import: './tslib.es6.mjs', default: './tslib.js' }, './*': './*' },
  });
  writeFile(root, `${NM}/tslib/tslib.es6.mjs`, 'export const __extends = 1;\n');

  // ── @tybys/wasm-util — BẢN HOISTED; path.mjs chứa đúng bẫy `validateString(from, 'from')` thật
  manifest(root, `${NM}/@tybys/wasm-util/package.json`, {
    name: '@tybys/wasm-util', version: '0.10.4', main: './lib/cjs/index.js', module: './dist/wasm-util.esm-bundler.js',
    exports: { '.': { module: './dist/wasm-util.esm-bundler.js', import: './lib/mjs/index.mjs', require: './lib/cjs/index.js' } },
    dependencies: { tslib: '^2.4.0' },
  });
  writeFile(root, `${NM}/@tybys/wasm-util/lib/mjs/index.mjs`,
    "export { load } from './wasi/path.mjs'\nexport * from './wasi/path.mjs'\n");
  writeFile(root, `${NM}/@tybys/wasm-util/lib/mjs/wasi/path.mjs`,
    'function validateString(value, name) { if (typeof value !== "string") throw new TypeError(name); }\n' +
    'export function load(from, to) {\n' +
    '  validateString(from, \'from\');\n' +
    '  validateString(to, \'to\');\n' +
    '  let p = `${from}\\\\${to}`;\n' +
    '  return p;\n' +
    '}\n');
}

function loadRoutes() {
  const src = fs.readFileSync(API_SRC, 'utf8');
  const startIdx = src.indexOf('const BROWSER_OPTIMIZER_PACKAGES');
  const endIdx = src.indexOf("app.get('/api/fsrs-optimizer/browser/pkg/binding/*'");
  const ds = src.indexOf('function checkTransitiveDepsOnDisk');
  const de = src.indexOf("app.get('/api/fsrs-optimizer/diagnostics'");
  if ([startIdx, endIdx, ds, de].includes(-1)) throw new Error('Cấu trúc api/index.js đã đổi — cập nhật lại test.');
  return src.slice(ds, de) + '\n' + src.slice(startIdx, endIdx);
}

// Gọi route THẬT (không dựng Express) và materialize response thành { status, headers, body:Buffer }.
async function callRoute(M, url) {
  const m = url.match(/^\/api\/fsrs-optimizer\/browser\/(pkg|pkg-dyn)\/([^/]+)\/(.*)$/);
  assert.ok(m, `URL không khớp route: ${url}`);
  const headers = {}, chunks = [];
  let status = 200;
  let finish;
  const finished = new Promise((r) => { finish = r; });
  const res = {
    status(c) { status = c; return this; },
    json(o) { chunks.push(Buffer.from(JSON.stringify(o))); finish(); return this; },
    send(b) { chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b))); finish(); return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    // nhánh .wasm: fs.createReadStream(...).pipe(res) -> Node gọi dest.write() rồi dest.end()
    write(c) { if (c) chunks.push(Buffer.from(c)); return true; },
    end(c) { if (c) chunks.push(Buffer.from(c)); finish(); },
    on() { return this; }, once() { return this; }, emit() { return true; },
  };
  if (m[1] === 'pkg') M.serveBrowserOptimizerPackageFile(m[2])({ params: { 0: m[3] } }, res);
  else M.serveDynamicPkgFile({ params: { urlKey: m[2], 0: m[3] } }, res);
  await finished;
  return { status, headers, body: Buffer.concat(chunks), text: () => Buffer.concat(chunks).toString('utf8') };
}

// Mọi specifier (tương đối hoặc tuyệt đối) trong module đã phục vụ — để crawl tiếp như trình duyệt.
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|import\s+)(['"])([^'"\n]+)\1/g;
function specifiersOf(text) {
  const out = [];
  let m;
  while ((m = SPECIFIER_RE.exec(text))) out.push(m[2]);
  return [...new Set(out)];
}
const isRelativeOrAbsolute = (s) => s.startsWith('./') || s.startsWith('../') || s.startsWith('/');
const BARE_RE = /(?:from\s*|import\s*\(\s*|import\s+)['"](?!\.\/|\.\.\/|\/|https?:)[^'"\n]+['"]/;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsrs-optimizer-graph-test-'));
let M; // route handlers (sandbox dùng tmpRoot làm __dirname)

try {
  buildRealisticTree(tmpRoot);
  const sandbox = {
    fs, path, crypto: require('crypto'), console, module: { exports: {} }, __dirname: tmpRoot,
    require: require('module').createRequire(path.join(tmpRoot, 'index.js')),
  };
  vm.createContext(sandbox);
  vm.runInContext(loadRoutes() +
    '\nmodule.exports = { computeBrowserOptimizerAssetUrlsDetailed, serveDynamicPkgFile, serveBrowserOptimizerPackageFile, _dynamicPkgRootByUrlKey };',
    sandbox, { filename: 'api/index.js (trích đoạn)' });
  M = sandbox.module.exports;
} catch (e) {
  console.log(`  ❌ không nạp được route handlers: ${e.message}`);
  failed++;
}

if (M) {
  console.log('[test/fsrs-optimizer.browser-dependency-graph.test.js]');

  test('computeBrowserOptimizerAssetUrlsDetailed(): resolve được TOÀN BỘ đồ thị thật (binding + binding-wasm32-wasi + 4 tầng phụ thuộc), không bỏ sót gói nào', () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    assert.strictEqual(r.ok, true, `phải ok:true — nhận: ${JSON.stringify(r.diag && r.diag.unresolvedDependencies)}`);
    for (const pkg of ['@napi-rs/wasm-runtime', '@emnapi/core', '@emnapi/runtime', '@emnapi/wasi-threads', '@tybys/wasm-util', 'tslib']) {
      assert.ok(r.importMap[pkg], `importMap thiếu ${pkg} — nhận: ${JSON.stringify(r.importMap)}`);
    }
  });

  test('Worker tải được: mọi module trong đồ thị trả HTTP 200, không còn bare specifier nào lọt ra trình duyệt, và mỗi file đúng là ES module hợp lệ', async () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    assert.strictEqual(r.ok, true);
    const queue = [r.importMap['@napi-rs/wasm-runtime'], r.urls.workerScriptUrl, r.urls.dynamicWasiEntryUrl];
    const seen = new Set();
    const parsed = [];
    while (queue.length) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const resp = await callRoute(M, url);
      assert.strictEqual(resp.status, 200, `${url} trả ${resp.status} — body: ${resp.text().slice(0, 200)}`);
      assert.ok(!resp.headers['x-optimizer-unresolved-specifiers'],
        `${url} còn bare specifier chưa resolve: ${resp.headers['x-optimizer-unresolved-specifiers']}`);
      const text = resp.text();
      assert.ok(!BARE_RE.test(text), `${url} vẫn còn bare specifier trong nội dung phục vụ: ${(text.match(BARE_RE) || [])[0]}`);
      parsed.push({ url, text });
      for (const spec of specifiersOf(text)) {
        if (isRelativeOrAbsolute(spec)) queue.push(new URL(spec, `http://x${url}`).pathname);
      }
    }
    // Đã đi hết đồ thị: có ít nhất 1 file ở mỗi tầng 1–4 (wasm-runtime, emnapi-core, wasi-threads, tslib).
    const paths = [...seen];
    assert.ok(paths.some((u) => /napi-rs__wasm-runtime\.[0-9a-f]{10}\/runtime\.js$/.test(u)), 'thiếu runtime.js (tầng 1)');
    assert.ok(paths.some((u) => /emnapi__core\.[0-9a-f]{10}\/dist\/emnapi-core\.mjs$/.test(u)), 'thiếu emnapi-core.mjs (tầng 2)');
    assert.ok(paths.some((u) => /emnapi__wasi-threads\.[0-9a-f]{10}\/dist\/wasi-threads\.mjs$/.test(u)), 'thiếu wasi-threads.mjs (tầng 3 — bản maxDepth=2 bỏ sót)');
    assert.ok(paths.some((u) => /tslib\.[0-9a-f]{10}\/tslib\.es6\.mjs$/.test(u)), 'thiếu tslib.es6.mjs (tầng 4)');
    // Mỗi file phục vụ phải parse được như ES module thật (bắt lỗi chọn nhầm bản CJS).
    const parseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsrs-graph-parse-'));
    try {
      for (let i = 0; i < parsed.length; i++) {
        const f = path.join(parseDir, `m${i}.mjs`);
        fs.writeFileSync(f, parsed[i].text);
        try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
        catch (e) { throw new Error(`${parsed[i].url} KHÔNG phải ES module hợp lệ: ${String(e.stderr || e.message).slice(0, 300)}`); }
      }
    } finally { fs.rmSync(parseDir, { recursive: true, force: true }); }
  });

  test('hai bản @tybys/wasm-util (hoisted + nested trong @napi-rs/wasm-runtime) không ghi đè nhau: root đăng ký là bản NESTED, URL phục vụ đúng file của root đó', async () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    const utilRoots = Object.entries(M._dynamicPkgRootByUrlKey)
      .filter(([, root]) => /@tybys[\\/]wasm-util$/.test(root))
      .map(([, root]) => root);
    assert.strictEqual(utilRoots.length, 1, `chỉ 1 bản của @tybys/wasm-util được đồ thị dùng, nhận: ${utilRoots.length}`);
    assert.ok(/napi-rs[\\/]wasm-runtime[\\/]node_modules/.test(utilRoots[0]),
      `runtime.js phải resolve @tybys/wasm-util ra bản NESTED (gần nó nhất), nhận: ${utilRoots[0]}`);
    const utilResp = await callRoute(M, r.importMap['@tybys/wasm-util']);
    assert.strictEqual(utilResp.status, 200);
    assert.ok(utilResp.text().includes('./wasi/path.mjs'), utilResp.text().slice(0, 200));
  });

  test('file .wasm phục vụ đúng byte nhị phân + content-type application/wasm (không bị rewrite như JS)', async () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    const resp = await callRoute(M, r.urls.wasmAssetUrl);
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers['content-type'], 'application/wasm');
    assert.deepStrictEqual([...resp.body.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], 'magic \\0asm bị hỏng — file .wasm không được đọc/rewrite như text');
  });

  test('không có vòng rewrite lặp: import tương đối giữ nguyên dạng tương đối, chỉ bare specifier bị thay, và số module phục vụ hữu hạn', async () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    const runtime = (await callRoute(M, r.importMap['@napi-rs/wasm-runtime'])).text();
    assert.ok(runtime.includes("from './dist/emnapi-plugins.js'"), `import tương đối bị đụng vào: ${runtime.slice(0, 300)}`);
    assert.ok(!runtime.includes("from '@emnapi/core'"), 'bare specifier chưa được rewrite');
    const util = (await callRoute(M, r.importMap['@tybys/wasm-util'])).text();
    assert.ok(util.includes("'./wasi/path.mjs'"), `import tương đối trong wasm-util bị đụng vào: ${util}`);
    // path.mjs có `validateString(from, 'from')` — chuỗi 'from' KHÔNG được coi là từ khoá import.
    const p = await callRoute(M, new URL('./wasi/path.mjs', `http://x${r.importMap['@tybys/wasm-util']}`).pathname);
    assert.strictEqual(p.status, 200);
    assert.ok(p.text().includes("validateString(from, 'from')"), p.text().slice(0, 300));
    assert.ok(BARE_RE.test(p.text()) === false);
    const seen = new Set();
    const queue = [r.urls.dynamicWasiEntryUrl, r.urls.workerScriptUrl];
    let guard = 0;
    while (queue.length && guard++ < 500) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const resp = await callRoute(M, url);
      if (resp.status !== 200) continue;
      for (const s of specifiersOf(resp.text())) if (isRelativeOrAbsolute(s)) queue.push(new URL(s, `http://x${url}`).pathname);
    }
    assert.ok(guard < 500, 'crawl vượt 500 bước — nghi vòng rewrite lặp vô hạn');
    assert.ok(seen.size <= 30, `số module phục vụ bất thường (${seen.size}) — nghi vòng lặp`);
  });

  test('import map dùng chung CÙNG urlKey với nội dung đã rewrite (không lệch 2 nguồn dẫn tới 404 khi tải thật)', async () => {
    const r = M.computeBrowserOptimizerAssetUrlsDetailed();
    const body = (await callRoute(M, r.urls.workerScriptUrl)).text();
    for (const [spec, url] of Object.entries(r.importMap)) {
      if (!body.includes(url)) continue;
      assert.strictEqual((await callRoute(M, url)).status, 200, `${spec} -> ${url} không tải được`);
    }
    assert.ok(body.includes(r.importMap['@napi-rs/wasm-runtime']), `worker phải trỏ đúng URL trong import map: ${body.slice(0, 200)}`);
  });
}

// ── Hồi quy NGUYÊN NHÂN GỐC #1 (đóng gói): 3 gói runtime của napi-rs phải khai TRỰC TIẾP trong
// package.json — nếu chỉ còn nằm trong optionalDependencies của binding-wasm32-wasi (cpu: wasm32,
// npm bỏ qua) thì npm KHÔNG cài chúng và lỗi production quay lại dù code resolve đúng đến đâu.
test('package.json khai TRỰC TIẾP @napi-rs/wasm-runtime + @emnapi/core + @emnapi/runtime (npm không cài optionalDependencies của gói bị bỏ qua vì cpu: wasm32)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const dep of ['@napi-rs/wasm-runtime', '@emnapi/core', '@emnapi/runtime']) {
    assert.ok(pkg.dependencies && pkg.dependencies[dep], `${dep} phải nằm trong "dependencies", không chỉ optionalDependencies`);
    assert.ok(!pkg.optionalDependencies || !pkg.optionalDependencies[dep], `${dep} không được để ở optionalDependencies (npm có thể bỏ qua cả cây)`);
  }
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); passed++; }
    catch (e) { console.log(`  ❌ ${name}\n     ${String(e.message).split('\n').join('\n     ')}`); failed++; }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`Kết quả: ${passed} PASS, ${failed} FAIL`);
  console.log(`════════════════════════════════════════════════════`);
  if (failed > 0) process.exitCode = 1;
})();
