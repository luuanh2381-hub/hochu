// lib/study-days.js — V119.4: đếm "số ngày đã học" và "số ngày từ khi tạo tài khoản" (theo NGÀY LỊCH giờ Việt Nam,
// cùng cách backend tính streak — xem lib/fsrs/analytics.js). Phần thuần (không DB) để kiểm thử được.
//  • Ngày đã học  = số NGÀY KHÁC NHAU có ít nhất 1 lượt ôn/học (study_sessions có cards_reviewed > 0, hoặc review_history).
//  • Ngày tạo tài khoản = số ngày lịch từ ngày tạo đến hôm nay (0 = tạo hôm nay, 1 = tạo hôm qua…).
//  • Tỉ lệ = ngày đã học / (ngày tạo + 1): tính cả ngày tạo, tối đa 100%.
'use strict';

const VN_TZ = 'Asia/Ho_Chi_Minh';

// 'YYYY-MM-DD' của một mốc thời gian theo giờ Việt Nam (nhận ms, Date hoặc chuỗi ISO). Không hợp lệ → null.
function vnDateKey(t) {
  if (t === null || t === undefined || t === '') return null; // new Date(null) là 1970 — không coi là mốc hợp lệ
  const d = t instanceof Date ? t : new Date(t);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Số ngày lịch giữa 2 khoá 'YYYY-MM-DD' (b - a). Tính bằng UTC nên không dính giờ mùa hè/lệch múi giờ.
function daysBetweenKeys(a, b) {
  if (!a || !b) return null;
  const A = Date.parse(a + 'T00:00:00Z'), B = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(A) || !Number.isFinite(B)) return null;
  return Math.round((B - A) / 86400000);
}

// { accountDays, createdDate } hoặc null nếu tài khoản cũ không có mốc tạo hợp lệ.
function accountAge(createdAt, now) {
  const created = vnDateKey(createdAt);
  const today = vnDateKey(now == null ? Date.now() : now);
  if (!created || !today) return null;
  return { accountDays: Math.max(0, daysBetweenKeys(created, today)), createdDate: created };
}

// Gộp thành 1 đối tượng gửi cho giao diện.
//  studyInfo: { studyDays, firstStudyDay, lastStudyDay } từ database (có thể thiếu → 0 ngày).
function summarize(studyInfo, createdAt, now) {
  const studyDays = Math.max(0, Math.floor(Number(studyInfo && studyInfo.studyDays) || 0));
  const age = accountAge(createdAt, now);
  const out = {
    studyDays,
    firstStudyDay: (studyInfo && studyInfo.firstStudyDay) || null,
    lastStudyDay: (studyInfo && studyInfo.lastStudyDay) || null,
    accountDays: age ? age.accountDays : null,
    createdDate: age ? age.createdDate : null,
    totalDays: null,
    studyRatePct: null,
  };
  if (age) {
    out.totalDays = Math.max(age.accountDays + 1, studyDays); // dữ liệu cũ có thể lệch: không để tỉ lệ vượt 100%
    out.studyRatePct = Math.min(100, Math.round((studyDays / out.totalDays) * 100));
  }
  return out;
}

module.exports = { VN_TZ, vnDateKey, daysBetweenKeys, accountAge, summarize };
