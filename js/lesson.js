// js/lesson.js — Trang chủ + "Hôm nay học" (dashboard FSRS: due hôm nay, từ mới, bài hiện tại)
// ════════════════════════════════════════════════════
// HOME
// ════════════════════════════════════════════════════
// AUDIT V82 (Phần 1/7 — "Home → Bắt đầu học, một thao tác"): TRƯỚC ĐÂY user phải chuyển sang tab
// "🎯 Hôm nay học" mới thấy số từ due/mới + nút "Bắt đầu học" — Trang chủ chỉ có 4 nút chọn CHẾ ĐỘ
// (không ưu tiên FSRS thật). Giờ thêm 1 khối "at a glance" ngay đầu Trang chủ cho user đã đăng nhập:
// due/mới hôm nay + đúng 1 nút "Bắt đầu học" (đi thẳng vào hàng đợi ôn tập FSRS thật, giống hệt tab
// "Hôm nay học"), rút app xuống còn "mở app → 1 chạm" cho luồng học chính. 4 nút chế độ cũ vẫn giữ
// nguyên bên dưới làm lối vào phụ (khi user chủ động muốn luyện 1 kiểu cụ thể).
function renderHome() {
  return `
  ${isLoggedIn() ? `<div class="panel" id="home-quickstart-panel"><div id="home-quickstart" class="study-empty">Đang tải...</div></div>` : ''}
  <div class="panel">
    <div class="panel-title">Chọn bài học</div>
    ${lessonFilterHtml()}
  </div>
  <div class="panel">
    <div class="panel-title">Bắt đầu học nhanh</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <button class="btn btn-primary" onclick="ssEnterMode('flash')">📖 Flashcard</button>
      <button class="btn" style="background:var(--l8c);color:var(--l8a);" onclick="ssEnterMode('quiz')">📝 Trắc nghiệm</button>
      <button class="btn" style="background:var(--l9c);color:var(--l9a);" onclick="ssEnterMode('listen')">🎧 Nghe chọn</button>
      <button class="btn" style="background:var(--l10c);color:var(--l10a);" onclick="ssEnterMode('type')">⌨️ Gõ chữ</button>
    </div>
  </div>`;
}
function bindHome() {
  if (!isLoggedIn()) return;
  loadHomeQuickstart();
}
async function loadHomeQuickstart() {
  const area = document.getElementById('home-quickstart');
  if (!area) return;
  const data = await fetchTodayDashboard(false);
  if (currentTab !== 'home') return; // user đã rời Trang chủ trong lúc chờ
  const panel = document.getElementById('home-quickstart-panel');
  // Không có gì đáng hiện ở Trang chủ (chưa chọn phạm vi/lỗi mạng) — ẩn hẳn khối này, đừng chiếm
  // chỗ bằng thông báo lỗi mà tab "Hôm nay học" đã giải thích đầy đủ hơn (Phần 1 — giảm nhiễu).
  if (!data || !data.ok || !data.hasScope) { if (panel) panel.remove(); return; }
  if (data.dueCount === 0 && data.newInCurrentLesson === 0) {
    area.innerHTML = `🎉 Đã ôn hết từ đến hạn và học hết từ mới của Bài ${data.currentLesson}!`;
    return;
  }
  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:10px;font-size:.85rem;color:var(--muted);font-weight:700;">
      <span>🔴 ${data.dueCount} cần ôn</span><span>🆕 ${data.newInCurrentLesson} từ mới</span>
    </div>
    ${data.blockedByBacklog ? `<div style="font-size:.78rem;color:var(--muted);text-align:center;margin-bottom:10px;">⏳ Từ mới đang tạm khoá vì còn ${data.totalDue} thẻ cần ôn (có thể ở Quyển/bài khác) — tắt "Chỉ học từ mới sau khi hết backlog ôn tập" trong Cài đặt hằng ngày nếu muốn học từ mới ngay.</div>` : ''}
    <button class="btn btn-primary" style="width:100%;font-size:1.05rem;padding:15px;" onclick="ssEnterMode('review')">▶️ Bắt đầu học</button>`;
}

// ════════════════════════════════════════════════════
// HÔM NAY HỌC — dashboard FSRS (Phần 13)
// ════════════════════════════════════════════════════
function renderToday() {
  if (!isLoggedIn()) {
    return `<div class="panel">
      <div class="panel-title">今日学习 · Hôm nay học</div>
      <div class="study-empty">🔒 Cần đăng nhập để dùng hệ thống ôn tập FSRS cá nhân hoá và lưu tiến độ.</div>
      <button class="btn btn-primary" style="width:100%;" onclick="openAuthGate()">Đăng nhập / Đăng ký</button>
    </div>`;
  }
  const ui = progressState.ui;
  return `
  <div class="panel">
    <div class="panel-title">今日学习 · Hôm nay học</div>
    <div id="study-dash-area" class="study-empty">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">Cài đặt hằng ngày</div>
    <div class="study-settings-row">
      <span>♾️ Học không giới hạn mỗi ngày</span>
      <input type="checkbox" ${ui.unlimitedStudy ? 'checked' : ''} onchange="updateStudySetting('unlimitedStudy', this.checked)">
    </div>
    <div class="study-settings-row">
      <span>🔁 Giới hạn ôn tập / ngày</span>
      <input type="number" min="1" value="${ui.dailyReviewLimit}" onchange="updateStudySetting('dailyReviewLimit', this.value)">
    </div>
    <div class="study-settings-row">
      <span>🆕 Giới hạn từ mới / ngày</span>
      <input type="number" min="0" value="${ui.dailyNewLimit}" onchange="updateStudySetting('dailyNewLimit', this.value)">
    </div>
    <div class="study-settings-row">
      <span>Chỉ học từ mới sau khi hết backlog ôn tập</span>
      <input type="checkbox" ${ui.newOnlyAfterDue ? 'checked' : ''} onchange="updateStudySetting('newOnlyAfterDue', this.checked)">
    </div>
    <div class="study-settings-row">
      <span>⏱ Độ dài mỗi phiên (có điểm dừng)</span>
      <select onchange="rvSetSessionCards(this.value)">
        ${[[0, 'Không giới hạn'], [10, '10 thẻ'], [20, '20 thẻ'], [30, '30 thẻ']].map(([v, t]) => `<option value="${v}" ${rvSessionCards() === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="study-settings-row">
      <span>🤖 Hệ thống tự chấm đánh giá (không hiện 4 nút mỗi thẻ)</span>
      <input type="checkbox" ${rvManualRating() ? '' : 'checked'} onchange="rvSetManualRating(!this.checked)">
    </div>
    <div style="font-size:.85rem;opacity:.7;margin-top:4px;">
      ${ui.unlimitedStudy
        ? 'Bật: không bị chặn lại vì "đã học đủ hôm nay" — học được nhiều lượt tuỳ ý trong ngày. Mỗi lượt vẫn lấy đúng theo 2 giới hạn ôn tập/từ mới ở trên.'
        : 'Tắt: mỗi ngày chỉ học tối đa đúng 2 giới hạn ở trên (trừ dần theo số đã học trong ngày), hết là phải đợi qua ngày mới.'}
    </div>
  </div>`;
}
function bindToday() {
  if (!isLoggedIn()) return;
  loadStudyDashboard();
}
// AUDIT V82 (Phần 12/14 — chống duplicate request, tái sử dụng dữ liệu): /api/study/today giờ dùng
// CHUNG qua fetchTodayDashboard() (cache TTL ngắn) giữa tab "Hôm nay học" và khối "at a glance" mới
// ở Trang chủ — bấm qua lại 2 tab này liên tục trong vài giây không gọi lại API 2 lần. force=true
// dùng khi user CHỦ ĐỘNG vào "Hôm nay học" (muốn số liệu mới nhất ngay), force=false (mặc định) cho
// Trang chủ (chấp nhận cache vài giây, ưu tiên hiển thị tức thời).
let _todayDashCache = null, _todayDashCacheAt = 0;
const TODAY_DASH_CACHE_TTL_MS = 10000;
// V98 fix ("Hôm nay học"/"Bắt đầu học" ở Trang chủ không theo lựa chọn bài mới): saveSelectionState()
// (js/ui.js) gọi hàm này ngay khi Quyển/bài đang chọn vừa đổi — trước đây chỉ
// sqInvalidateQueuesForSelectionChange() (huỷ hàng đợi luyện tập) được gọi, còn cache dashboard này
// (TTL 10s, dùng chung cho khối "at a glance" Trang chủ VÀ tab "Hôm nay học") không hề bị huỷ — nên
// đổi bài xong, số due/mới hiển thị ngay vẫn là số theo phạm vi CŨ tới khi cache tự hết hạn.
function invalidateTodayDashboardCache() {
  _todayDashCache = null;
  _todayDashCacheAt = 0;
}
async function fetchTodayDashboard(force) {
  if (!force && _todayDashCache && (Date.now() - _todayDashCacheAt) < TODAY_DASH_CACHE_TTL_MS) return _todayDashCache;
  try {
    // V98 fix (cùng lớp bug với "Vấn đề 5" đã sửa ở loadFsrsPracticePool/rvFetchFreshSession —
    // js/study-queue.js/js/review.js): TRƯỚC ĐÂY hàm này fetch thẳng /api/study/today mà không đợi
    // flushProgressSync() — nếu gọi trong vòng 700ms sau khi user vừa đổi Quyển/bài (scheduleSync()
    // còn đang debounce), server vẫn đọc user.progress.ui CŨ, trả về due/new theo phạm vi CŨ. Đây
    // chính là lý do khối "Hôm nay học"/"Bắt đầu học" ở Trang chủ có vẻ "không theo lựa chọn bài" dù
    // cache phía client (ở trên) đã được huỷ đúng lúc.
    await flushProgressSync();
    const res = await fetch('/api/study/today', { headers: authHeaders() });
    const data = await res.json();
    _todayDashCache = data; _todayDashCacheAt = Date.now();
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function loadStudyDashboard() {
  const area = document.getElementById('study-dash-area');
  if (!area) return;
  try {
    const data = await fetchTodayDashboard(true);
    if (currentTab !== 'today') return; // user đã rời tab trong lúc chờ
    if (!data.ok) { area.innerHTML = `<div class="study-empty">${data.error || 'Không tải được dữ liệu'}</div>`; return; }
    if (!data.hasScope) {
      area.innerHTML = `<div class="study-empty">Chưa có từ vựng trong phạm vi Quyển/bài bạn đang chọn.<br>Vào <b>Trang chủ</b> để chọn Quyển/bài trước.</div>`;
      return;
    }
    // V110: KHÔNG thoát sớm khi hết thẻ/từ mới — người học vẫn cần thấy thống kê và các chế độ luyện bổ sung / kiểm tra lại.
    area.innerHTML = renderTodayPanel(data);
  } catch (e) {
    area.innerHTML = `<div class="study-empty">Lỗi kết nối: ${e.message}</div>`;
  }
}

// ── V110: bảng điều khiển học tập hằng ngày ─────────────────────────────────────────────────────
// Mọi số đều lấy từ server (không số giả). Phân biệt rõ 3 đơn vị KHÁC NHAU:
//   • TỪ duy nhất  — mỗi từ chỉ đếm 1 lần dù thuộc nhiều nhóm (vừa đến hạn vừa yếu nghe...).
//   • THẺ đến hạn  — số thẻ FSRS tới hạn ôn (1 từ = 1 thẻ ở bài đang chọn).
//   • LƯỢT câu hỏi — mỗi lần trả lời; 1 từ có thể được hỏi nhiều lượt trong 1 buổi.
// Các nhóm "cần củng cố / kỹ năng yếu / kiểm tra lại" có thể TRÙNG nhau → KHÔNG cộng chúng lại; dùng "từ duy nhất".
function tdFmtDuration(sec) {
  const m = Math.round((sec || 0) / 60);
  if (!sec) return '0 phút';
  return m < 1 ? 'dưới 1 phút' : (m < 60 ? m + ' phút' : Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút');
}
// ── V115: chỉ số GHI NHỚ ƯỚC LƯỢNG (từ /api/study/today → memory). Luôn ghi rõ đây là ước lượng của mô hình FSRS, không phải điểm kiểm tra. ──
function tdMemoryPct(mem) { return (mem && mem.avgRetrievability != null) ? Math.round(mem.avgRetrievability * 100) : null; }
function tdWordLabel(hz, l) {
  const w = (typeof WORDS !== 'undefined') ? (WORDS.find(x => x.hz === hz && x.l === l) || WORDS.find(x => x.hz === hz)) : null;
  return w ? `${escapeHtml(w.hz)} <span style="color:var(--muted)">${escapeHtml(w.vi || '')}</span>` : escapeHtml(hz);
}
function tdForecastHtml(mem) {
  if (!mem || !Array.isArray(mem.forecast) || !mem.forecast.length) return '';
  const max = Math.max(1, ...mem.forecast.map(f => f.count));
  const dn = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const bars = mem.forecast.map((f, i) => {
    const d = new Date(f.date + 'T00:00:00Z');
    const lbl = i === 0 ? 'Nay' : dn[d.getUTCDay()];
    return `<div style="flex:1;text-align:center"><div style="font-size:.68rem;font-weight:800">${f.count}</div><div style="height:${Math.max(2, Math.round(f.count / max * 44))}px;background:var(--l8a,#27ae60);border-radius:3px;margin:2px 3px 0"></div><div style="font-size:.66rem;color:var(--muted);margin-top:2px">${lbl}</div></div>`;
  }).join('');
  return `<div style="margin:10px 0"><div style="font-weight:800;font-size:.85rem;margin-bottom:4px">📅 Thẻ đến hạn 7 ngày tới</div>
    <div style="display:flex;align-items:flex-end;gap:2px">${bars}</div>
    <div style="font-size:.7rem;color:var(--muted);margin-top:4px">Ngày “Nay” gồm cả ${mem.overdue || 0} thẻ đã quá hạn. Số thẻ này chưa trừ giới hạn ngày.</div></div>`;
}
function tdAtRiskHtml(mem) {
  if (!mem || !mem.atRisk) return '';
  const chips = (mem.atRiskWords || []).map(x => `<span style="display:inline-block;background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:3px 10px;margin:3px 4px 0 0;font-size:.8rem">${tdWordLabel(x.hz, x.l)} · ${Math.round(x.r * 100)}%</span>`).join('');
  return `<div style="margin:10px 0"><div style="font-weight:800;font-size:.85rem">⚠️ ${mem.atRisk} từ đang có nguy cơ quên (xác suất nhớ dự kiến dưới ${Math.round((mem.thresholds && mem.thresholds.atRisk || 0.8) * 100)}%)</div>
    <div>${chips}</div>${mem.atRisk > (mem.atRiskWords || []).length ? `<div style="font-size:.7rem;color:var(--muted);margin-top:3px">Hiện ${(mem.atRiskWords || []).length} từ thấp nhất.</div>` : ''}</div>`;
}
function tdMemoryDetailHtml(mem) {
  if (!mem) return '';
  const pct = tdMemoryPct(mem);
  const head = pct == null
    ? `Chưa đủ dữ liệu để ước lượng (cần ≥ ${(mem.thresholds && mem.thresholds.minCards) || 5} từ đã học; hiện ${mem.measured}).`
    : `Dự kiến còn nhớ <b>~${pct}%</b> trên ${mem.measured} từ đã học.`;
  return `<div style="margin:12px 0 0;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-weight:800;font-size:.9rem">🧠 Trí nhớ (ước lượng)</div>
    <div style="font-size:.82rem;margin:4px 0">${head}</div>
    <div style="font-size:.7rem;color:var(--muted);line-height:1.5">Là trung bình xác suất nhớ lại mà FSRS tính cho từng thẻ ngay lúc này (theo lịch ôn và tham số của riêng bạn). <b>Đây là ước lượng của mô hình, không phải điểm kiểm tra</b> — càng ôn đều, càng sát thực tế.</div>
    ${tdAtRiskHtml(mem)}${tdForecastHtml(mem)}
    ${mem.leech ? `<div style="font-size:.8rem;margin-top:6px">🧲 ${mem.leech} từ cứng đầu (đã quên ≥ ${(mem.thresholds && mem.thresholds.leechLapses) || 4} lần và hiện chưa vững — ổn định dưới ${(mem.thresholds && mem.thresholds.leechMatureStability) || 21} ngày).</div>` : ''}
  </div>`;
}

function renderTodayPanel(data) {
  const b = data.breakdown, pr = data.progress, dl = data.daily;
  const nothingToDo = (data.dueCount || 0) === 0 && (data.newInCurrentLesson || 0) === 0;
  const cell = (cls, num, label, sub) => `<div class="study-stat ${cls}"><div class="study-stat-num">${num}</div><div class="study-stat-label">${label}</div>${sub ? `<div style="font-size:.68rem;color:var(--muted);font-weight:600;margin-top:2px">${sub}</div>` : ''}</div>`;

  // Tiến độ nhiệm vụ hôm nay = số thẻ FSRS chính thức đã làm / (đã làm + còn lại có thể làm hôm nay).
  let progressHtml = '';
  if (dl) {
    const done = (dl.reviewToday || 0) + (dl.newToday || 0);
    const planned = done + (data.dueCount || 0) + (data.newInCurrentLesson || 0);
    if (planned > 0) {
      const pct = Math.round((done / planned) * 100);
      progressHtml = `<div style="margin:2px 0 12px">
        <div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700"><span>Tiến độ nhiệm vụ hôm nay</span><span>${done}/${planned} thẻ (${pct}%)</span></div>
        <div style="height:10px;border-radius:5px;background:var(--active);overflow:hidden;margin-top:4px"><div style="height:100%;width:${Math.max(pct, 2)}%;background:var(--l8a,#27ae60)"></div></div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:3px">${dl.unlimited ? 'Chế độ học không giới hạn mỗi ngày' : `Giới hạn ngày: ôn ${dl.reviewLimit} · từ mới ${dl.newLimit}`} · <b>Đây là tiến độ làm bài, không phải % từ đã nhớ lâu dài.</b></div></div>`;
    }
  }

  const capNote = (data.dueInScope > data.dueCount)
    ? `hôm nay lấy ${data.dueCount}/${data.dueInScope} (theo giới hạn ngày)` : 'theo lịch FSRS';
  const grid = [
    cell('due', `🔴 ${data.dueCount}`, 'Thẻ đến hạn ôn', capNote),
    cell('new', `🆕 ${data.newInCurrentLesson}`, 'Từ mới dự kiến', ''),
    b ? cell('weak', `🧱 ${b.reinforce}`, 'Từ cần củng cố', 'đang học / học lại') : '',
    b ? cell('weak', `🎯 ${b.weakSkill}`, 'Từ có kỹ năng yếu', b.weakSkill ? 'cần ≥3 lượt/kỹ năng để kết luận' : 'chưa phát hiện (hoặc chưa đủ dữ liệu)') : '',
    b ? cell('lesson', `⏳ ${b.delayed}`, 'Cần kiểm tra lại', `đã học, chưa đến hạn, ≥${b.delayedAfterDays} ngày chưa gặp`) : '',
    pr ? cell('lesson', `✅ ${pr.officialAnswers + pr.practiceAnswers}`, 'Lượt câu hỏi hôm nay', `${pr.officialAnswers} ôn chính thức · ${pr.practiceAnswers} luyện thêm`) : '',
    // V113: tỉ lệ đúng CÓ mẫu số (chỉ lượt tính năng lực; không tính câu vừa xem đáp án) + từ đủ bằng chứng ổn định.
    pr && pr.measuredAnswers != null ? cell('lesson', pr.measuredAnswers >= 5 ? `🎯 ${Math.round(pr.measuredCorrect / pr.measuredAnswers * 100)}%` : '🎯 —', 'Tỉ lệ trả lời đúng', pr.measuredAnswers >= 5 ? `${pr.measuredCorrect}/${pr.measuredAnswers} lượt (không tính câu vừa xem đáp án)` : `mới ${pr.measuredAnswers} lượt — chưa đủ để nêu %`) : '',
    b && b.stableWords != null ? cell('lesson', `🧭 ${b.stableWords}`, 'Từ đủ bằng chứng tương đối ổn định', 'cần ≥2 kỹ năng, ≥6 lượt, ≥3 ngày — không phải “đã thuộc”') : '',
    // V112: thời gian học THỰC (chỉ cộng khi tab hiển thị + đang ở màn học + có tương tác) — không còn tính lúc chuyển tab/ẩn app.
    pr ? cell('lesson', `⏱ ${tdFmtDuration(pr.durationSeconds)}`, 'Thời gian học thực', 'không tính lúc chuyển tab / không thao tác') : '',
  ].join('');

  // V113: MỤC TIÊU ƯU TIÊN CHÍNH của phiên — chọn theo thứ tự cố định, KHÔNG bỏ qua thẻ đến hạn: ôn đến hạn → củng cố → kỹ năng yếu → kiểm tra sau nghỉ.
  let goalHtml = '';
  {
    let goal = null;
    if ((data.dueCount || 0) > 0) goal = `Ưu tiên ôn ${data.dueCount} thẻ đến hạn theo lịch FSRS.`;
    else if (b && b.reinforce > 0) goal = `Ưu tiên củng cố ${b.reinforce} từ đang học / học lại.`;
    else if ((data.newInCurrentLesson || 0) > 0) goal = `Học ${data.newInCurrentLesson} từ mới của Bài ${data.currentLesson}.`;
    else if (b && b.weakSkill > 0) goal = `Luyện thêm kỹ năng yếu của ${b.weakSkill} từ (luyện bổ sung, không đổi lịch FSRS).`;
    else if (b && b.delayed > 0) goal = `Kiểm tra lại sau khoảng nghỉ cho ${b.delayed} từ.`;
    if (goal) goalHtml = `<div style="font-size:.85rem;font-weight:800;margin:0 0 10px;padding:8px 10px;border-radius:10px;background:var(--active)">🎯 Mục tiêu chính: ${goal}</div>`;
  }
  let unique = '';
  if (b) {
    const total = b.uniqueWords + (data.newInCurrentLesson || 0);
    const overlaps = [];
    if (b.overlap.weakAndDue) overlaps.push(`${b.overlap.weakAndDue} từ vừa đến hạn vừa yếu kỹ năng`);
    if (b.overlap.reinforceAndDue) overlaps.push(`${b.overlap.reinforceAndDue} từ vừa đang học vừa đến hạn`);
    unique = `<div style="font-size:.78rem;color:var(--muted);line-height:1.5;margin:10px 0;background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
      <b>${total} từ duy nhất</b> cần chú ý (${b.uniqueWords} từ đã học + ${data.newInCurrentLesson || 0} từ mới), trong tổng ${b.knownWords} từ đã học ở phạm vi này.
      ${overlaps.length ? `Một từ có thể thuộc nhiều nhóm nên <b>không cộng các ô trên với nhau</b> (${overlaps.join('; ')}).` : 'Các nhóm trên không trùng nhau.'}
      <br>Phân biệt: <i>từ</i> (mỗi từ đếm 1 lần) · <i>thẻ</i> (lịch FSRS) · <i>lượt</i> (mỗi lần trả lời).</div>`;
  }

  // 8 chế độ học — dùng chung bộ tạo câu hỏi/chấm điểm/ghi kết quả; gom trong mục thu gọn để màn hình không rối.
  const audioOk = (typeof skillAudioAvailable === 'function') && skillAudioAvailable();
  const mode = (icon, label, onclick, enabled, why) => `<button class="btn" ${enabled ? `onclick="${onclick}"` : 'disabled'} style="text-align:left;padding:10px;font-size:.82rem;line-height:1.3">${icon} ${label}${enabled ? '' : `<div style="font-size:.66rem;font-weight:600;opacity:.8">${why}</div>`}</button>`;
  const modes = `<details ${nothingToDo ? 'open' : ''} style="margin-top:12px"><summary style="cursor:pointer;font-weight:800;font-size:.9rem;padding:6px 0">🎛 Chế độ học khác</summary>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      ${mode('📅', 'Theo lịch FSRS<br><small>chỉ thẻ đến hạn</small>', "startStudyMode('due')", data.dueCount > 0, 'Không có thẻ đến hạn')}
      ${mode('🆕', 'Học từ mới<br><small>xem → kiểm tra</small>', "startStudyMode('new')", data.newInCurrentLesson > 0, 'Không có từ mới hôm nay')}
      ${mode('🧠', 'Nhớ chủ động<br><small>nghĩa → chữ Hán</small>', "skStartPractice('recall')", true, '')}
      ${mode('🎧', 'Luyện nghe<br><small>nghe → chữ Hán / nghĩa</small>', "skStartPractice('listening')", audioOk, 'Máy này không có giọng đọc tiếng Trung')}
      ${mode('🔤', 'Luyện pinyin<br><small>chữ Hán → pinyin</small>', "skStartPractice('pinyin')", true, '')}
      ${mode('🎵', 'Luyện thanh điệu<br><small>nghe → chọn cách đọc</small>', "skStartPractice('tone')", audioOk, 'Máy này không có giọng đọc tiếng Trung')}
      ${mode('📖', 'Dùng từ trong câu<br><small>điền từ vào chỗ trống</small>', "skStartPractice('context')", true, '')}
      ${mode('🧩', 'Phân biệt từ dễ nhầm', "skStartPractice('confusable')", true, '')}
      ${mode('⏳', 'Kiểm tra sau khoảng nghỉ' + (b ? ` (${b.delayed})` : ''), "skStartPractice('delayed')", !b || b.delayed > 0, 'Chưa có từ đủ điều kiện')}
    </div>
    <div style="font-weight:800;font-size:.85rem;margin:14px 0 2px">🖐 Chỉ chạm chọn — không gõ phím, không ghi âm</div>
    <div style="font-size:.7rem;color:var(--muted);margin-bottom:6px;line-height:1.4">Không cần bàn phím hay micro: chỉ chạm đáp án (phần ghép cặp nghe chỉ bật khi máy có giọng đọc). Luyện bổ sung, không đổi lịch FSRS. Câu 2 đáp án (A hay B?, Đúng/Sai) không cộng vào điểm kỹ năng.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${mode('🔗', 'Ghép cặp nhanh<br><small>chữ Hán ↔ nghĩa / pinyin / Hán Việt / âm nghe</small>', "rvStartMatchDrill()", true, '')}
      ${mode('📜', 'Hán Việt<br><small>Hán Việt ↔ nghĩa / chữ Hán</small>', "skStartPractice('hanviet')", true, '')}
      ${mode('👁', 'Thanh điệu bằng mắt<br><small>nhìn chữ → chọn thanh đúng</small>', "skStartPractice('tonevis')", true, '')}
      ${mode('⚔️', 'A hay B?<br><small>các cặp bạn hay nhầm</small>', "skStartPractice('duel')", true, '')}
      ${mode('✅', 'Đúng hay sai?<br><small>chạm Đúng / Sai nhanh</small>', "skStartPractice('tf')", true, '')}
      ${mode('🧩', 'Sắp xếp câu<br><small>chạm các mảnh theo đúng thứ tự</small>', "skStartPractice('ordersentence')", true, '')}
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin-top:6px;line-height:1.5">Chế độ 1–2 vẫn là ôn chính thức theo FSRS (có đổi lịch ôn). Các chế độ còn lại là luyện bổ sung: chỉ ghi hồ sơ kỹ năng, <b>không đổi lịch FSRS</b>.
    <label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" ${rvTypedEnabled() ? 'checked' : ''} onchange="rvSetTypedEnabled(this.checked)"> Cho phép câu tự gõ đáp án trong “Bắt đầu học”</label>
    ${typeof rvmEnabled === 'function' ? `<label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" ${rvmEnabled() ? 'checked' : ''} onchange="rvmSetEnabled(this.checked)"> Câu luyện thêm gồm 3 phần (Pinyin · Nghĩa · Hán Việt), đúng 2/3 mới tính là đúng</label>` : ''}
    ${typeof rvmOfficialEnabled === 'function' ? `<label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" ${rvmOfficialEnabled() ? 'checked' : ''} onchange="rvmSetOfficialEnabled(this.checked)"> 🧪 Thử nghiệm: thẻ ÔN NHANH (chính thức) cũng gồm 3 phần, đúng 2/3 mới tính là đúng. Ảnh hưởng lịch ôn; đúng 2/3 thì không chọn được Easy</label>` : ''}
    <label style="display:flex;gap:6px;align-items:center;margin-top:6px">🧩 Số câu “Sắp xếp câu” thêm vào mỗi buổi “Bắt đầu học”:
      <select onchange="rvSetOrderPerSession(this.value)" style="font:inherit;padding:2px 6px;border-radius:8px;border:1px solid var(--border);background:var(--paper);color:var(--ink)">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${rvOrderPerSession() === n ? 'selected' : ''}>${n === 0 ? 'Tắt' : n + ' câu'}</option>`).join('')}</select></label></div>
  </details>`;

  // V115 — BỐ CỤC GỌN: 1 nút lớn + 1 dòng mục tiêu + 3 con số chính. Mọi thứ còn lại gập vào \"Chi tiết\" (trước đây ~9 ô số + đoạn giải
  // thích đẩy nút "Bắt đầu học" xuống dưới). Không bỏ số liệu nào — chỉ đổi chỗ.
  const mem = data.memory || null, memPct = tdMemoryPct(mem);
  const sumCell = (num, lbl) => `<div class="td-sum-cell"><div class="td-sum-num">${num}</div><div class="td-sum-lbl">${lbl}</div></div>`;
  const summary = `<div class="td-summary">
      ${sumCell(`🔴 ${data.dueCount}`, 'Cần ôn')}
      ${sumCell(`🆕 ${data.newInCurrentLesson}`, 'Từ mới')}
      ${sumCell(memPct == null ? '🧠 —' : `🧠 ~${memPct}%`, mem ? (memPct == null ? 'Dự kiến nhớ (chưa đủ dữ liệu)' : 'Dự kiến nhớ (ước lượng)') : 'Dự kiến nhớ')}
    </div>`;
  const leechBtn = (mem && mem.leech > 0)
    ? `<button class="btn" style="width:100%;margin-top:8px;background:var(--l7c,#fdebd0);color:var(--l7a,#b25f22);" onclick="startLeechSession()">🧲 Học riêng ${mem.leech} từ cứng đầu</button>` : '';
  const detail = `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:800;font-size:.9rem;padding:6px 0">📊 Chi tiết số liệu</summary>
      <div class="study-grid" style="margin-top:8px">${grid}</div>
      ${unique}
      ${tdMemoryDetailHtml(mem)}
    </details>`;
  return `
    <style>.td-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.td-sum-cell{background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px 4px;text-align:center}.td-sum-num{font-size:1.3rem;font-weight:900}.td-sum-lbl{font-size:.68rem;color:var(--muted);font-weight:700;margin-top:2px;line-height:1.25}</style>
    ${goalHtml}
    ${nothingToDo
      ? `<div class="study-empty" style="margin:8px 0">🎉 Bạn đã ôn hết thẻ đến hạn và học hết từ mới của Bài ${escapeHtml(String(data.currentLesson))} hôm nay!<br><span style="font-size:.8rem">Muốn học thêm? Chọn một chế độ luyện bổ sung bên dưới, hoặc chọn thêm Quyển/bài ở Trang chủ.</span></div>`
      : `<button class="btn btn-primary" style="width:100%;font-size:1.05rem;padding:15px;" onclick="ssEnterMode('review')">▶️ Bắt đầu học</button>`}
    ${summary}
    ${data.blockedByBacklog ? `<div style="font-size:.8rem;color:var(--muted);margin:8px 0;">⏳ Từ mới đang tạm khoá vì còn ${data.totalDue} thẻ cần ôn (có thể ở Quyển/bài khác) — tắt "Chỉ học từ mới sau khi hết backlog ôn tập" trong Cài đặt hằng ngày nếu muốn học từ mới ngay.</div>` : ''}
    ${progressHtml}
    ${data.weakCount > 0 ? `<button class="btn" style="width:100%;margin-top:8px;background:var(--l10c);color:var(--l10a);" onclick="ssEnterMode('review-weak')">⚠️ Luyện từ hay quên (${data.weakCount})</button>` : ''}
    ${leechBtn}
    ${detail}
    ${modes}
    ${b ? '' : `<div style="font-size:.75rem;color:var(--muted);margin-top:8px">Chưa tải được thống kê chi tiết (củng cố / kỹ năng yếu / kiểm tra lại) — chưa đủ dữ liệu hoặc lỗi tạm thời.</div>`}
  `;
}

function updateStudySetting(key, value) {
  if (key === 'newOnlyAfterDue' || key === 'unlimitedStudy') progressState.ui[key] = !!value;
  else {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 0) progressState.ui[key] = n;
  }
  cacheProgressLocally();
  scheduleSync();
  // V100 fix ("Hôm nay học không đổi dù đã chỉnh Cài đặt hằng ngày"): TRƯỚC ĐÂY chỉ unlimitedStudy
  // mới render() lại — đổi dailyReviewLimit/dailyNewLimit/newOnlyAfterDue KHÔNG hề vẽ lại số due/
  // mới, số cũ vẫn đứng yên tới khi user rời tab rồi quay lại. Giờ MỌI thay đổi ở đây đều huỷ cache
  // dashboard rồi vẽ lại ngay (render() tự gọi loadStudyDashboard()/loadHomeQuickstart() tuỳ tab
  // đang mở — xem js/navigation.js); fetchTodayDashboard() cũng tự flushProgressSync() nên server
  // luôn thấy đúng giá trị MỚI NHẤT trước khi tính lại, không dính debounce 700ms của scheduleSync().
  invalidateTodayDashboardCache();
  if (typeof render === 'function') render();
}

