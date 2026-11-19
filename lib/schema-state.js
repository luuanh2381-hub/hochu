// lib/schema-state.js — V177: BỎ các lệnh "kiểm tra/tạo bảng" lặp lại mỗi lần server thức dậy.
//
// Vấn đề: mỗi hàm ensureXxx() (tạo bảng/cột/index nếu chưa có) chạy MỘT LẦN cho mỗi instance server, nhưng web ít người
// dùng nên server liên tục "ngủ" rồi "thức dậy" → lần nào cũng chạy lại hàng chục lệnh CREATE/ALTER ... IF NOT EXISTS
// (lib/db.js ≈ 46 lệnh, thêm skill-store/optimizer/analytics...), mỗi lệnh là 1 vòng đi-về tới Neon. Các lệnh ALTER TABLE còn
// xin khoá mạnh trên bảng nên khi nhiều server thức dậy cùng lúc (mở app = 5-6 yêu cầu đồng thời) có thể chờ nhau/tắc.
//
// Cách làm: bảng nhỏ `schema_state(name, fingerprint)` ghi lại "hàm khởi tạo X đã chạy XONG ở phiên bản code có dấu vân tay F".
// Lần thức dậy sau chỉ cần 1 lệnh SELECT; khớp dấu vân tay thì BỎ QUA toàn bộ lệnh tạo bảng của hàm đó.
//   • Dấu vân tay = băm mã nguồn của chính hàm khởi tạo → ai sửa lược đồ (thêm cột/bảng/index) thì dấu vân tay đổi → tự chạy lại 1 lần.
//   • AN TOÀN theo hướng "không chắc thì chạy như cũ": đọc bảng lỗi / thiếu quyền / bất kỳ ngoại lệ nào → chạy đầy đủ như trước.
//   • Ghi dấu vân tay là "cố gắng hết sức": ghi lỗi thì thôi, KHÔNG làm hỏng việc khởi tạo.
//   • Không đụng tới dữ liệu học, không đụng tới việc ghi kết quả sau mỗi câu.
//   • Ép chạy lại toàn bộ (vd sau khi tự tay xoá bảng trong Neon): đặt biến môi trường SCHEMA_FORCE_INIT=1 rồi deploy lại,
//     hoặc chạy `DELETE FROM schema_state;` rồi để server thức dậy lại.
// Chỉ dùng cho hàm khởi tạo thuần lược đồ (idempotent) và KHÔNG chạy trong giao dịch (đã kiểm tra: không nơi nào gọi ensure* sau BEGIN).

const crypto = require('crypto');

const FINGERPRINT_SALT = 'schema-state-v1'; // đổi chuỗi này nếu muốn buộc MỌI hàm khởi tạo chạy lại 1 lần ở lần deploy sau

let statePromise = null; // Promise<Map<name, fingerprint> | null> — chỉ đọc bảng schema_state 1 lần mỗi instance

function fingerprint(fn) {
  return crypto.createHash('sha1').update(FINGERPRINT_SALT + '\n' + Function.prototype.toString.call(fn)).digest('hex').slice(0, 20);
}

function forced() { return process.env.SCHEMA_FORCE_INIT === '1'; }

function loadState(client) {
  if (!statePromise) {
    const p = (async () => {
      try {
        let rows;
        try {
          rows = (await client.query('SELECT name, fingerprint FROM schema_state')).rows;
        } catch (e) {
          if (!e || e.code !== '42P01') throw e; // 42P01 = bảng chưa tồn tại (lần đầu) → tạo rồi coi như rỗng; lỗi khác → "không chắc"
          await client.query('CREATE TABLE IF NOT EXISTS schema_state (name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
          rows = [];
        }
        return new Map(rows.map((r) => [r.name, r.fingerprint]));
      } catch (e) {
        return null; // không chắc → để các hàm khởi tạo chạy đầy đủ như cũ
      }
    })();
    statePromise = p;
    p.then((v) => { if (v === null && statePromise === p) statePromise = null; }); // lần sau thử đọc lại
  }
  return statePromise;
}

async function isApplied(client, name, fp) {
  if (forced()) return false;
  const state = await loadState(client);
  return !!state && state.get(name) === fp;
}

async function markApplied(client, name, fp) {
  try {
    const state = await loadState(client);
    if (!state) return;
    await client.query(
      'INSERT INTO schema_state (name, fingerprint) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, applied_at = now()',
      [name, fp]
    );
    state.set(name, fp);
  } catch (e) { /* cố gắng hết sức: ghi lỗi thì lần sau chạy lại như cũ */ }
}

// Bọc 1 hàm khởi tạo `impl(client)`. Kết quả giữ nguyên hợp đồng cũ: gọi nhiều lần dùng chung 1 Promise; lỗi KHÔNG bị nhớ (lần sau thử lại).
function withSchemaFastPath(name, impl) {
  let inflight = null;
  return function schemaGuarded(client, ...rest) {
    if (inflight) return inflight;
    const p = (async () => {
      const fp = fingerprint(impl);
      if (await isApplied(client, name, fp)) return;
      await impl(client, ...rest);
      await markApplied(client, name, fp);
    })();
    inflight = p;
    p.catch(() => { if (inflight === p) inflight = null; });
    return p;
  };
}

function _resetForTests() { statePromise = null; }

module.exports = { withSchemaFastPath, fingerprint, _resetForTests };
