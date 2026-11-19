// lib/db-target.js — V177: đọc VÙNG và LOẠI KẾT NỐI của Neon từ DATABASE_URL (chỉ phần tên máy chủ, KHÔNG đụng tới mật khẩu),
// để nhật ký Vercel có 1 dòng cho biết server và database có cùng vùng không, và có đang dùng địa chỉ "pooler" không.
// Vùng khác nhau = mỗi truy vấn đi qua nửa vòng trái đất → chậm; địa chỉ trực tiếp (không -pooler) = nhiều kết nối mới khi server thức dậy.

// Vùng AWS của Neon → mã vùng Function tương ứng của Vercel (cùng tên AWS: xem vercel.com/docs/regions).
const NEON_TO_VERCEL = {
  'us-east-1': 'iad1', 'us-east-2': 'cle1', 'us-west-2': 'pdx1',
  'eu-central-1': 'fra1', 'eu-west-2': 'lhr1',
  'ap-southeast-1': 'sin1', 'ap-southeast-2': 'syd1', 'sa-east-1': 'gru1',
};

// Tên máy chủ Neon dạng: ep-<tên>-<số>[-pooler].<vùng>.aws.neon.tech (bản cũ có thể thiếu <vùng>).
const HOST_RE = /^ep-[a-z0-9-]+?(-pooler)?\.(?:([a-z0-9-]+)\.)?(?:aws|azure)\.neon\.tech$/i;

function parseNeonHost(connectionString) {
  let host = '';
  try { host = new URL(String(connectionString || '')).hostname; } catch (e) { return null; }
  const m = HOST_RE.exec(host);
  if (!m) return null;
  return { pooler: !!m[1], region: m[2] ? m[2].toLowerCase() : null };
}

// Trả về { line, warn } — line luôn có thể in ra; warn=true khi có điều đáng sửa.
function describeDbTarget(connectionString, vercelRegion) {
  const t = parseNeonHost(connectionString);
  if (!t) return { line: '[db] Không nhận ra địa chỉ Neon trong DATABASE_URL (bỏ qua chẩn đoán vùng).', warn: false };
  const want = t.region ? NEON_TO_VERCEL[t.region] : null;
  const parts = ['[db] Neon ' + (t.region || 'vùng không rõ') + ' · kết nối ' + (t.pooler ? 'POOLER (tốt)' : 'TRỰC TIẾP (nên dùng địa chỉ có -pooler)') + ' · server Vercel ' + (vercelRegion || 'không rõ')];
  let warn = !t.pooler;
  if (want && vercelRegion && vercelRegion !== want) { parts.push('⚠️ KHÁC VÙNG — nên đặt Vercel Function Region = ' + want); warn = true; }
  return { line: parts.join(' · '), warn };
}

module.exports = { parseNeonHost, describeDbTarget, NEON_TO_VERCEL };
