// lib/memory-forecast.js — V115: CHỈ SỐ GHI NHỚ ƯỚC LƯỢNG + DỰ BÁO THẺ ĐẾN HẠN + TỪ CỨNG ĐẦU (leech). THUẦN: không DB, không ts-fsrs.
//
// Vì sao có file này: trước V115 người học không có con số nào trả lời "tôi đang nhớ bao nhiêu?". Dashboard cố ý né
// (nói rõ "tiến độ làm bài ≠ % nhớ lâu dài") nhưng FSRS thật sự tính được xác suất nhớ lại (retrievability) của từng thẻ.
// Con số ở đây là TRUNG BÌNH xác suất đó trên các thẻ đã học — là ƯỚC LƯỢNG của mô hình, không phải kết quả kiểm tra thật.
//
// Hàm tính xác suất nhớ được TRUYỀN VÀO (`retrievabilityOf`) để module này không phụ thuộc ts-fsrs → kiểm thử được trong Node
// thuần. Ở production, reviewService truyền vào lib/fsrs.getRetrievability (đúng scheduler + weights cá nhân của người học).

'use strict';

const VN_OFFSET_MS = 7 * 3600 * 1000; // Asia/Ho_Chi_Minh = UTC+7, không có giờ mùa hè → dịch cố định là đủ
const DAY_MS = 86400000;

const LEECH_LAPSES = 4;       // thẻ đã bị QUÊN (Again khi đang ở trạng thái Review) ≥ 4 lần ...
const LEECH_MATURE_STABILITY = 21; // ... VÀ hiện CHƯA vững (độ ổn định FSRS < 21 ngày, cùng ngưỡng "mature" ở lib/fsrs/analytics.js) → "từ cứng đầu".
// Vì sao cần điều kiện thứ hai: `lapses` KHÔNG BAO GIỜ GIẢM. Nếu chỉ xét lapses thì từ từng cứng đầu nhưng nay đã học vững vẫn bị gắn cờ mãi.
const AT_RISK_R = 0.8;        // xác suất nhớ dự kiến < 80% → "sắp quên / đang quên"
const FORECAST_DAYS = 7;      // dự báo số thẻ đến hạn trong 7 ngày (ngày 0 = hôm nay, gồm cả thẻ đã quá hạn)
const MIN_CARDS_FOR_AVG = 5;  // dưới ngưỡng này KHÔNG nêu % (mẫu quá nhỏ, dễ gây hiểu nhầm)
const AT_RISK_LIST_MAX = 8;

const vnDayIndex = (ms) => Math.floor((ms + VN_OFFSET_MS) / DAY_MS);
const dayLabel = (idx) => new Date(idx * DAY_MS).toISOString().slice(0, 10);

function isLeechCard(card) {
  if (!card || !(Number(card.lapses) >= LEECH_LAPSES)) return false;
  const s = Number(card.stability); // thiếu/NaN → chưa biết là đã vững → vẫn coi là cứng đầu (không giấu từ khó)
  return !(Number.isFinite(s) && s >= LEECH_MATURE_STABILITY);
}

// cards: các dòng fsrs_cards ĐÃ HỌC (reps > 0): { hz, l, due, lapses, ... }.
// retrievabilityOf(card) → số 0..1 (hoặc ném lỗi / trả NaN nếu không tính được → thẻ đó bị bỏ khỏi trung bình, KHÔNG đoán).
function summarizeMemory(cards, nowMs, retrievabilityOf) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const list = Array.isArray(cards) ? cards : [];
  const today = vnDayIndex(now);

  const forecast = [];
  for (let i = 0; i < FORECAST_DAYS; i++) forecast.push({ dayOffset: i, date: dayLabel(today + i), count: 0 });

  let sum = 0, measured = 0, atRisk = 0, overdue = 0, leech = 0;
  const risky = [];
  for (const c of list) {
    if (!c) continue;
    if (isLeechCard(c)) leech++; // dùng chung 1 định nghĩa với giao diện (xem isLeechCard)

    const dueMs = c.due ? new Date(c.due).getTime() : NaN;
    if (Number.isFinite(dueMs)) {
      if (dueMs <= now) overdue++;
      const off = Math.max(0, vnDayIndex(dueMs) - today); // quá hạn gộp vào hôm nay
      if (off < FORECAST_DAYS) forecast[off].count++;
    }

    let r = NaN;
    try { r = Number(retrievabilityOf ? retrievabilityOf(c) : NaN); } catch (e) { r = NaN; }
    if (!Number.isFinite(r) || r < 0 || r > 1) continue;
    measured++; sum += r;
    if (r < AT_RISK_R) { atRisk++; risky.push({ hz: c.hz, l: c.l, r: Math.round(r * 1000) / 1000 }); }
  }
  risky.sort((a, b) => a.r - b.r);

  return {
    learned: list.length,           // số thẻ đã học
    measured,                       // số thẻ tính được xác suất nhớ (mẫu số của trung bình)
    avgRetrievability: measured >= MIN_CARDS_FOR_AVG ? Math.round((sum / measured) * 1000) / 1000 : null,
    atRisk,                         // số thẻ có xác suất nhớ dự kiến < AT_RISK_R
    atRiskWords: risky.slice(0, AT_RISK_LIST_MAX),
    overdue,                        // số thẻ đã quá hạn (due ≤ bây giờ)
    leech,                          // số thẻ "cứng đầu"
    forecast,                       // [{dayOffset, date, count}] 7 ngày; ngày 0 gồm cả thẻ quá hạn
    thresholds: { atRisk: AT_RISK_R, leechLapses: LEECH_LAPSES, leechMatureStability: LEECH_MATURE_STABILITY, minCards: MIN_CARDS_FOR_AVG },
  };
}

module.exports = { LEECH_LAPSES, LEECH_MATURE_STABILITY, AT_RISK_R, FORECAST_DAYS, MIN_CARDS_FOR_AVG, AT_RISK_LIST_MAX, vnDayIndex, isLeechCard, summarizeMemory };
