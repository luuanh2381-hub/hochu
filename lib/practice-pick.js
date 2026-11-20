// lib/practice-pick.js — V178: chọn "từ hay sai" cho phần LUYỆN BỔ SUNG của buổi "Hôm nay học" — bớt lặp lại cùng một nhóm từ.
//
// Vấn đề: trước đây danh sách xếp STRICT theo độ yếu (điểm thấp nhất trước), chỉ ngẫu nhiên khi hai từ bằng điểm, và từ vừa luyện
// không được nghỉ → buổi nào cũng gặp lại đúng các từ yếu nhất cho tới khi điểm của chúng vượt ngưỡng.
//
// Cách làm (thuần tính toán, không đụng DB, dễ kiểm thử):
//   1) Mỗi từ chỉ 1 dòng (dòng đầu tiên theo thứ tự SQL = kỹ năng yếu nhất của từ đó) — giữ đúng quy tắc cũ "mỗi từ chỉ 1 câu".
//   2) TRỌNG SỐ theo độ yếu: điểm càng thấp càng dễ được chọn, nhưng KHÔNG chắc chắn (xổ số có trọng số, không phải top-N cố định).
//   3) NGHỈ MỀM: từ có lần luyện gần nhất trong COOLDOWN_HOURS giờ qua bị nhân trọng số với COOLDOWN_FACTOR → rất ít khi được chọn,
//      (hầu như không lọt vào) nhưng KHÔNG bị loại hẳn: nếu không đủ từ "đã nghỉ" thì vẫn lấy thêm từ vừa luyện để buổi học không thiếu câu.
//   4) Lấy mẫu có trọng số KHÔNG hoàn lại (Efraimidis–Spirakis): khoá = rand^(1/trọng số), lấy `limit` khoá lớn nhất.
// Chỉ dùng cho weakOnly (extras trong buổi học). Các màn khác (Luyện theo kỹ năng, từ thiếu dữ liệu, thăm dò) giữ thứ tự cũ.

const WEAK_THRESHOLD = 0.6;     // cùng ngưỡng "yếu" với lib/skills.js (điểm < 0,6 = yếu)
const COOLDOWN_HOURS = 36;      // nghỉ ~1,5 ngày: người học ôn mỗi ngày thì từ luyện hôm qua được nghỉ hôm nay
const COOLDOWN_FACTOR = 0.02;   // trọng số còn 2% khi đang nghỉ (đo mô phỏng: 0,1 vẫn để lọt ~15% từ vừa luyện khi số từ đã nghỉ đúng bằng số câu cần)

// Điểm 0 → 0,65; điểm 0,55 → 0,10 (từ yếu nhất ≈ 6,5 lần dễ được chọn hơn từ sát ngưỡng). Điểm không có (null) → như sát ngưỡng.
function weakWeight(score) {
  const s = (score === null || score === undefined || score === '') ? NaN : Number(score); // Number(null) = 0 sẽ bị coi là yếu nhất → phải chặn riêng
  const gap = Number.isFinite(s) ? Math.max(0, WEAK_THRESHOLD - s) : 0;
  return gap + 0.05;
}

function isCoolingDown(lastAt, nowMs, cooldownHours) {
  if (lastAt == null) return false;
  const t = lastAt instanceof Date ? lastAt.getTime() : Date.parse(lastAt);
  if (!Number.isFinite(t)) return false;
  const ageH = (nowMs - t) / 3600000;
  return ageH >= 0 && ageH < cooldownHours;
}

// rows: các dòng ứng viên theo thứ tự SQL (priority, score tăng dần). Mỗi dòng cần word_id, score, last_at (có thể null).
// Trả về tối đa `limit` dòng (mỗi từ 1 dòng), KHÔNG sửa mảng/dòng đầu vào.
function pickWeakWords(rows, opts) {
  const o = opts || {};
  const limit = Math.max(0, Math.floor(o.limit == null ? 10 : o.limit));
  const rand = typeof o.rand === 'function' ? o.rand : Math.random;
  const nowMs = o.now instanceof Date ? o.now.getTime() : (Number.isFinite(o.now) ? o.now : Date.now());
  const cooldownHours = o.cooldownHours == null ? COOLDOWN_HOURS : o.cooldownHours;
  const cooldownFactor = o.cooldownFactor == null ? COOLDOWN_FACTOR : o.cooldownFactor;
  if (!limit || !Array.isArray(rows) || !rows.length) return [];

  const seen = new Set();
  const keyed = [];
  for (const row of rows) {
    if (!row || seen.has(row.word_id)) continue; // dòng đầu của mỗi từ = kỹ năng yếu nhất của từ
    seen.add(row.word_id);
    let w = weakWeight(row.score);
    if (isCoolingDown(row.last_at, nowMs, cooldownHours)) w *= cooldownFactor;
    let u = rand();
    if (!(u > 0)) u = Number.MIN_VALUE; // tránh khoá = 0 làm mọi từ nghỉ ngang nhau
    keyed.push({ row, key: Math.pow(u, 1 / w) });
  }
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, limit).map((k) => k.row);
}

module.exports = { pickWeakWords, weakWeight, isCoolingDown, WEAK_THRESHOLD, COOLDOWN_HOURS, COOLDOWN_FACTOR };
