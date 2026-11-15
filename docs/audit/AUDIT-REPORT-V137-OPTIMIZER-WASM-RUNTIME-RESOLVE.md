# AUDIT V137 — FSRS Optimizer: `@napi-rs/wasm-runtime` không resolve được (và `NotEnoughData`)

Ngày: 2026-11-07 · Phạm vi: `api/index.js`, `lib/fsrs/optimizer.js`, `js/fsrs-optimizer.js`,
`package.json`/`package-lock.json`, 2 file test optimizer.

## 1. Nguyên nhân gốc (3 tầng, xác minh thực nghiệm — không suy luận)

**Tầng 1 — Đóng gói (nguyên nhân chính của lỗi "does not resolve").**
`@open-spaced-repetition/binding-wasm32-wasi@0.5.0` khai `cpu: ["wasm32"]`; npm **bỏ qua** gói này
(dù có trong `optionalDependencies`), và **không cài luôn optionalDependencies của nó**. Ba gói
`@napi-rs/wasm-runtime`, `@emnapi/core`, `@emnapi/runtime` vì thế không có trên đĩa Vercel;
`--include=optional` không cứu được. `scripts/ensure-wasm-optimizer.js` chỉ tải đúng 1 tarball.
→ `require.resolve('@napi-rs/wasm-runtime')` = `MODULE_NOT_FOUND`.

**Tầng 2 — Chọn nhánh export sai.**
`require.resolve()` chạy trong file CJS nên chọn điều kiện `require` → trả `runtime.cjs`,
`emnapi-core/index.js`… (đầy `require()`), chết trong trình duyệt dù tải được.

**Tầng 3 — Đồ thị quét quá nông + urlKey ghi đè nhau.**
`buildImportMapForFile(entry, 2)` dừng ở độ sâu 2 nên `@emnapi/wasi-threads` (tầng 3, qua
`@emnapi/core`) không bao giờ được rewrite. urlKey chỉ là tên gói → hai bản cùng tên ở 2 root khác
nhau ghi đè root của nhau.

**Tầng 4 (phát hiện thêm khi kiểm chứng E2E) — Sai hình dạng mẫu train.**
`FSRSBindingItem` theo tài liệu: *"Each FSRSItem corresponds to a single review, but contains the
previous reviews of the card as well."* Cả `trainWithOfficialOptimizer()` (server) lẫn
`runBrowserOptimizerMainThread()` (trình duyệt) gửi **1 item/thẻ** → fsrs-rs thấy 0 mẫu train →
`compute_parameters failed: NotEnoughData`, bất kể dữ liệu nhiều đến đâu. Đã đo: 500 thẻ × 15
review dạng 1-item/thẻ FAIL; **cùng dữ liệu** dạng tiền tố (k = 2..n) PASS. Item chỉ có 1 review
(deltaT = 0) làm fsrs-rs panic `at least one review with delta_t > 0 is required` → bỏ mẫu k = 1.

## 2. File đã sửa

| File | Sửa |
|---|---|
| `package.json`, `package-lock.json` | Khai trực tiếp `@napi-rs/wasm-runtime@1.2.7`, `@emnapi/core@1.11.3`, `@emnapi/runtime@1.11.3` trong `dependencies` (kéo cả closure: `@emnapi/wasi-threads`, `@tybys/wasm-util`, `tslib`) |
| `api/index.js` | `findPkgRootByName()`, `resolvePackageEntryForBrowser()` (điều kiện `browser→import→module→default→require`), `buildImportMapForFile()` BFS không giới hạn độ sâu từ **cả** entry dynamic-wasi **và** worker script, `pkgUrlKey()` có hash root, `findPkgRootByUrlKey()` tự kiểm chứng trên instance lạnh, tokenizer `findSpecifierTokens()` thay regex, `rewriteBareSpecifiersInSourceDetailed()` trả `failures`, `sendPackageFile()` log + header `X-Optimizer-Unresolved-Specifiers`, `checkTransitiveDepsOnDisk()` BFS toàn đồ thị |
| `lib/fsrs/optimizer.js` | Sinh 1 `FSRSBindingItem` cho **mỗi review** (tiền tố, k ≥ 2); ném lỗi rõ nếu không có mẫu nào; `readOwnPackageJson()` thay `require('<pkg>/package.json')` (exports map chặn) |
| `js/fsrs-optimizer.js` | Sinh item cùng quy tắc với đường server (điểm số 2 đường phải khớp) |
| `test/fsrs-optimizer.browser-asset-resolution.test.js` | Cập nhật API mới (`{importMap, failures}`, urlKey có hash), thêm case 2 bản cùng tên gói |
| `test/fsrs-optimizer.browser-dependency-graph.test.js` (mới) | Cây node_modules mô phỏng **đúng manifest thật** của 8 gói, kiểm 7 yêu cầu (D) |
| `test/fsrs-optimizer.test.js` | Test hình dạng item (1 item/review, bỏ thẻ 1 review) |

## 3. Kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npm run test:optimizer:browser-assets` | 16 PASS + 7 PASS (file mới) |
| `npm run test:optimizer:frontend` | 23 PASS |
| `npm run test:optimizer` | 74 PASS |
| `npm run test:optimizer:binding` (native) | PASS — 21 weights (trước V137 FAIL) |
| `node --check` 6 file đã sửa | PASS |
| `verify:server` / `ui` / `fsrs` / `core` | 5/5 · 7/7 · 4/4 · 5/5 |

Kiểm chứng ngoài unit test (dùng route handler thật của `api/index.js` trên `node_modules` thật):
- Crawl 23 module phục vụ: **0** bare specifier còn sót, 0 response lỗi, không lặp vô hạn;
  `.wasm` 598 176 byte, magic `0061736d`, `application/wasm`.
- Chromium (Playwright, COOP/COEP như `vercel.json`): entry import OK → `initOptimizer()` OK →
  binding ready đủ 10 export.
- Train thật trong Chromium, dữ liệu dựng qua `buildTrainingItems()` + `splitTrainValidation()`:
  2 303 item → 21 weights hữu hạn; **default log-loss 0.5774 vs personal 0.4961 (cải thiện 14.07 %)**.

## 4. Rủi ro còn lại

- Apply/Rollback không kiểm được ở đây: máy này không có `DATABASE_URL` (chưa chạy đường DB thật).
  Code đường Apply/Rollback **không bị sửa** trong V137.
- Vercel Function dùng `includeFiles: node_modules/**` — đã đủ cho closure mới, nhưng phải xác nhận
  bằng deploy thật (`/api/fsrs-optimizer/diagnostics` phải báo đủ 6 gói `onDisk: true`).
- Điều kiện `browser` của `@open-spaced-repetition/binding` trỏ `dist/browser.js`; với subpath
  `./dynamic-wasi` manifest thật **không** có nhánh `browser` nên rơi đúng vào `default`
  (`dynamic-wasi.cjs` là CJS!). Trình duyệt vẫn chạy được vì nhánh này thực chất chỉ re-export; nếu
  version sau đổi, `resolvePackageEntryForBrowser()` sẽ chọn theo `browser/import` và báo
  `dynamicWasiLooksLikeCommonJS` trong diagnostics.

## 5. Kiểm chứng production

1. Deploy → mở `GET /api/fsrs-optimizer/diagnostics` (admin): `bindingRoot`/`wasmRoot` khác null,
   `unresolvedDependencies` rỗng, `importMap` đủ 6 gói.
2. DevTools → Network: `/api/fsrs-optimizer/browser/pkg/**` và `pkg-dyn/**` đều 200; không response
   nào có header `X-Optimizer-Unresolved-Specifiers`.
3. Bấm Run Optimizer: phải thấy tiến độ chạy, rồi default log-loss / personal log-loss / % cải thiện,
   rồi Apply → Rollback → Reset.
