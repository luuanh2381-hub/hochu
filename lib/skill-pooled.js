// lib/skill-pooled.js — V115: PHÂN TÍCH KỸ NĂNG Ở MỨC NGƯỜI HỌC (gộp mọi từ). THUẦN: không DB, không mạng.
//
// Vấn đề được giải quyết: điểm (từ × kỹ năng) cần ≥ 3 lượt mỗi ô, trong khi mỗi từ thường chỉ được hỏi ~1 lần/buổi → phần lớn ô
// ở trạng thái "chưa đủ dữ liệu" rất lâu. Gộp theo KỸ NĂNG (mọi từ cùng lúc) thì mẫu đủ lớn sau vài buổi.
//
// Hai hiệu chỉnh mà điểm theo từ KHÔNG có (cố ý KHÔNG sửa điểm theo từ: công thức đó còn nằm trong SQL ở lib/skill-store.js, đổi một
// phía sẽ làm lệch phía kia):
//   1) Trừ xác suất ĐOÁN MÒ: trắc nghiệm 4 đáp án đúng 25% chỉ nhờ đoán; tự gõ ≈ 0%. "75% đúng" ở trắc nghiệm ≠ "75% đã nhớ".
//        đã-trừ-đoán-mò = (p − chance) / (1 − chance), chặn dưới 0.
//   2) Không gọi "yếu" theo ngưỡng tuyệt đối: nhớ chủ động vốn khó hơn nhận diện, nên chỉ NÊU KHOẢNG CÁCH giữa các kỹ năng của chính
//      người học (và chỉ khi cả hai đủ mẫu), không phán "yếu" từ một con số tuyệt đối.
// Mọi tỉ lệ kèm khoảng tin cậy Wilson 95% và số lượt; dưới MIN_POOLED_N thì KHÔNG nêu tỉ lệ.

'use strict';

const { EXERCISES } = require('./skills');

const CHANCE_MCQ = 0.25;     // trắc nghiệm 4 đáp án
const MIN_POOLED_N = 20;     // dưới ngưỡng này không nêu tỉ lệ
const GAP_MIN_N = 30;        // so khoảng cách giữa 2 kỹ năng: cả hai cần ≥ 30 lượt
const GAP_POINTS = 0.25;     // chênh ≥ 25 điểm % (đã trừ đoán mò) mới nêu
const Z95 = 1.96;

// Loại câu hỏi → { skill, typed }. Nhãn không có trong bảng server (lạ/cũ) → null (bỏ qua, KHÔNG đoán).
function exerciseInfo(exerciseType) {
  const def = EXERCISES[exerciseType];
  return def ? { skill: def.skill, typed: !!def.typed } : null;
}

function chanceFor(typed) { return typed ? 0 : CHANCE_MCQ; }

function correctedRate(p, chance) {
  const c = Number(chance) || 0;
  if (!Number.isFinite(p)) return null;
  return Math.max(0, (p - c) / (1 - c));
}

// Khoảng tin cậy Wilson cho tỉ lệ k/n.
function wilson(k, n) {
  if (!(n > 0)) return { lo: 0, hi: 1 };
  const p = k / n, z2 = Z95 * Z95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// rows: [{ exercise_type, kind?, n, correct }] (getTypeBreakdown). Trả { skills: { [skill]: {...} }, usedN, skippedN }.
function summarizePooled(rows) {
  const acc = {};
  let usedN = 0, skippedN = 0;
  for (const r of rows || []) {
    const n = Number(r && r.n) || 0, k = Number(r && r.correct) || 0;
    if (n <= 0) continue;
    const info = exerciseInfo(r.exercise_type);
    if (!info) { skippedN += n; continue; }
    usedN += n;
    const a = acc[info.skill] || (acc[info.skill] = { n: 0, correct: 0, choiceN: 0, choiceOk: 0, typedN: 0, typedOk: 0 });
    a.n += n; a.correct += k;
    if (info.typed) { a.typedN += n; a.typedOk += k; } else { a.choiceN += n; a.choiceOk += k; }
  }
  const skills = {};
  for (const sk of Object.keys(acc)) {
    const a = acc[sk];
    const enough = a.n >= MIN_POOLED_N;
    // Đã-trừ-đoán-mò: hiệu chỉnh riêng từng nhóm (trắc nghiệm / tự gõ) rồi lấy trung bình có trọng số theo số lượt.
    const parts = [];
    if (a.choiceN > 0) parts.push({ n: a.choiceN, v: correctedRate(a.choiceOk / a.choiceN, CHANCE_MCQ) });
    if (a.typedN > 0) parts.push({ n: a.typedN, v: correctedRate(a.typedOk / a.typedN, 0) });
    const corrected = parts.reduce((s, x) => s + x.v * x.n, 0) / a.n;
    const ci = wilson(a.correct, a.n);
    skills[sk] = {
      n: a.n, correct: a.correct, choiceN: a.choiceN, typedN: a.typedN,
      enough,
      rawRate: enough ? r3(a.correct / a.n) : null,
      correctedRate: enough ? r3(corrected) : null,
      ci: enough ? { lo: r3(ci.lo), hi: r3(ci.hi) } : null,
    };
  }
  return { skills, usedN, skippedN, thresholds: { minN: MIN_POOLED_N, chanceMcq: CHANCE_MCQ } };
}

// Khoảng cách nhận diện → nhớ chủ động (cùng đã trừ đoán mò). Chỉ trả khi cả hai kỹ năng đủ mẫu VÀ chênh đủ lớn.
function recognitionRecallGap(pooled) {
  const s = pooled && pooled.skills;
  if (!s || !s.recognition || !s.recall) return null;
  const a = s.recognition, b = s.recall;
  if (a.n < GAP_MIN_N || b.n < GAP_MIN_N || a.correctedRate == null || b.correctedRate == null) return null;
  const gap = a.correctedRate - b.correctedRate;
  if (gap < GAP_POINTS) return null;
  return { gap: r3(gap), recognition: a.correctedRate, recall: b.correctedRate, recognitionN: a.n, recallN: b.n };
}

// ── V127: SỐ ĐẾM GỌN theo (kỹ năng × trắc nghiệm/tự gõ) để bộ chọn câu hỏi phía client dùng. THUẦN, chỉ ĐỌC. ──
// Vì sao tách trắc nghiệm (c) và tự gõ (t): chọn đúng 1 trong 4 đáp án là bằng chứng NHẬN DIỆN, không tương đương việc tự nhớ
// ra chữ Hán. Bộ chọn cần biết riêng từng loại bằng chứng này, nên server chỉ gửi SỐ ĐẾM THÔ (n, ok), còn việc trừ đoán mò/
// làm mượt/trộn dữ liệu gần đây nằm ở js/question-selector.js (một nơi duy nhất).
//   rowsLong  = getTypeBreakdown(days=90), rowsRecent = getTypeBreakdown(days=14) → cùng dạng [{exercise_type, n, correct}]
//   Trả { v:1, skills: { [skill]: { c:{n,ok}, t:{n,ok}, rc:{n,ok}, rt:{n,ok} } } } — c/t: cửa sổ dài; rc/rt: cửa sổ gần đây.
// Nhãn lạ/cũ không có trong bảng EXERCISES → bỏ qua (KHÔNG đoán), y như summarizePooled.
function learnerCounts(rowsLong, rowsRecent) {
  const skills = {};
  const cell = (sk) => skills[sk] || (skills[sk] = { c: { n: 0, ok: 0 }, t: { n: 0, ok: 0 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } });
  const add = (rows, keyChoice, keyTyped) => {
    for (const r of rows || []) {
      const n = Number(r && r.n) || 0, k = Number(r && r.correct) || 0;
      if (n <= 0) continue;
      const info = exerciseInfo(r.exercise_type);
      if (!info) continue;
      const t = cell(info.skill)[info.typed ? keyTyped : keyChoice];
      t.n += n; t.ok += Math.min(k, n);
    }
  };
  add(rowsLong, 'c', 't');
  add(rowsRecent, 'rc', 'rt');
  return { v: 1, skills };
}

module.exports = { CHANCE_MCQ, MIN_POOLED_N, GAP_MIN_N, GAP_POINTS, exerciseInfo, chanceFor, correctedRate, wilson, summarizePooled, recognitionRecallGap, learnerCounts };
