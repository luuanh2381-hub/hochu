// js/review.js — Tab "Hôm nay học" → phiên ôn tập thật, khôi phục nút Again/Hard/Good/Easy có
// highlight "System Rating" (bổ sung — revert lại phần UI thủ công của V66, ĐÈ LÊN kiến trúc V67).
// ════════════════════════════════════════════════════
// REVIEW SESSION — bổ sung "Highlight System Rating" (revert V67's auto-only flow):
// Flow (Phần 1/17 cũ + yêu cầu bổ sung): hiện chữ Hán → user chọn 1 trong 4 đáp án trắc nghiệm →
// hệ thống tự xác định đúng/sai + đo responseTime → gọi /api/study/review/preview (CHỈ ĐỌC, không
// ghi) để lấy "System Rating" mà server sẽ tự suy ra → hiện 4 nút Again/Hard/Good/Easy, HIGHLIGHT
// rõ ràng (bold + glow + border, class riêng `.system-rating`) đúng nút hệ thống đề xuất, kèm
// countdown vài giây → user có thể bấm ĐỔI sang nút khác bất kỳ lúc nào trong lúc chờ (User Rating
// luôn thắng System Rating) hoặc để hết giờ (dùng luôn System Rating) → gửi rating CUỐI CÙNG lên
// /api/study/review (server vẫn tự xác định lại đúng/sai — KHÔNG tin answerCorrect từ client; chỉ
// riêng RATING gửi vào FSRS mới có thể bị override bởi lựa chọn của user) → lộ đáp án đầy đủ
// (pinyin/nghĩa/Hán Việt/chiết tự/ví dụ) → tự chuyển câu kế.
//
// V78 (Vấn đề 7 — "Session phải là nguồn dữ liệu duy nhất"): TRƯỚC ĐÂY Review giữ 1 bộ biến RỜI
// RẠC (rvSession/rvSessionId/rvTotalPlanned/rvAnsweredCount/rvStartTime/rvEndTime/
// rvCompletedCards/rvLessonFilter) tách biệt hoàn toàn khỏi object sq* mà Flashcard/Trắc nghiệm/Gõ
// chữ/Nghe-chọn đang dùng — 2 nơi định nghĩa "1 Study Session" khác nhau, dễ lệch theo thời gian.
// Giờ Review dùng CHUNG đúng 1 object `rvQueue` tạo bằng sqCreate() (y hệt fcQueue/qzQueue/
// tyQueue/lsQueue), và dùng CHUNG các hàm quản lý phiên ở study-queue.js (sqPersist/
// sqReadPersisted/sqClearPersisted/sqStartNewSession/sqRelearnFromStart/sqSnapshotLessonFilter/
// ssArchiveSession...) — chỉ khác 1 điểm domain thật sự (không phải "state riêng" tuỳ tiện): item
// của rvQueue có dạng {type, word} (để phân biệt "Từ mới"/"Ôn tập") thay vì thẳng là word, và nguồn
// nạp là /api/study/session (trộn due+new) hoặc /api/study/weak-words — nên có rvFetchFreshSession()
// + rvAdvanceQueue() riêng thay vì sqLoad()/sqAdvance() dùng thẳng (2 hàm đó giả định item = word).
// currentIndex trong yêu cầu chính là rvQueue.items[0] (hàng đợi FIFO, "vị trí hiện tại" luôn là
// đầu hàng đợi — cùng mô hình với 4 tab kia, không có index rời).
// ════════════════════════════════════════════════════
let rvQueue = sqCreate(); // StudySessionManager dùng chung: {items,doneHz,totalPlanned,answeredCount,sessionId,startTime,endTime,completedCards,lessonFilter,dayKey}
let rvPhase = 'question'; // 'question' (đang chờ chọn đáp án) | 'answered' (đã có kết quả)
let rvWeakMode = false;
let rvSummary = { reviewCount: 0, newCount: 0 };
let rvExamplePool = [];
let rvAdaptNote = '';  // V128 giai đoạn 3: thông báo (1 lần) khi buổi học vừa bớt câu luyện thêm theo kế hoạch; xoá ở lần chuyển câu kế tiếp, không lưu
let rvLearner = null;   // V127: số đếm kỹ năng cấp NGƯỜI HỌC do server gửi kèm phiên (null = người mới/mất mạng → bộ chọn chạy như V126)
let rvSubmitting = false;
let rvOptions = [];      // 4 lựa chọn trắc nghiệm của câu hiện tại (sinh 1 lần/câu, không sinh lại mỗi lần render)
let rvStartedAt = 0;     // performance.now() tại thời điểm câu hỏi THỰC SỰ hiển thị cho user (Phần 4)
let rvCardSeq = 0;        // V117: số thứ tự câu/thẻ đang hiển thị — để tự phát âm ĐÚNG MỘT lần cho mỗi câu (vẽ lại do đổi cài đặt không phát lại)
let rvAnswerChanges = 0; // UI hiện tại chọn là chốt ngay (không cho đổi trước khi submit) nên luôn 0 (Phần 16/17)
let rvLastAnswer = null; // { correct, card, autoRating } — kết quả lượt vừa submit, để hiện feedback (Phần 18)
let rvBlockedByBacklog = false; // server chặn từ mới vì còn backlog due (có thể ở Quyển/bài KHÁC phạm vi đang chọn) và cài đặt "Chỉ học từ mới sau khi hết backlog" đang bật
let rvTotalDue = 0; // V146: số thẻ đến hạn TRONG PHẠM VI đang chọn (trước đây toàn tài khoản) — dùng để giải thích lý do bị chặn ở trên
const RV_QUIZ_TYPE = 'hz2vi'; // (giữ tên cũ cho tương thích)

// ── V106 — HỆ THỐNG TRẮC NGHIỆM THÍCH ỨNG cho "Hôm nay học" ──────────────────────────────────────
// Tách 3 lớp: (1) js/question-engine.js dựng câu hỏi hợp lệ (không DOM); (2) js/question-selector.js chọn
// DẠNG bài theo kỹ năng yếu/thiếu dữ liệu + chống lặp; (3) file này chỉ lo giao diện + luồng buổi học.
// FSRS: từ nào được học, thứ tự, số lượng, lịch ôn VẪN do server/FSRS quyết định. Mỗi thẻ FSRS chỉ được ôn
// chính thức ĐÚNG 1 lần mỗi lượt (đi đường /api/study/review như cũ); mọi câu hỏi phụ (kiểm tra ngay sau khi
// xem từ mới, từ hay sai, ghép cặp, luyện lại) là LUYỆN BỔ SUNG — chỉ ghi hồ sơ kỹ năng qua
// submitSkillPractice, KHÔNG đổi lịch ôn.
//
// Loại phần tử trong hàng đợi (item.type):
//   'review' / 'new' : thẻ FSRS chính thức (từ server). 'new' CHƯA học → hiện màn GIỚI THIỆU TỪ (xem chữ,
//                      pinyin, nghĩa, nghe, ví dụ) rồi 1 câu 'check' dễ (hz→nghĩa, KHÔNG tính FSRS); sau
//                      RV_NEW_GAP thẻ khác mới đến lượt ôn FSRS chính thức của từ đó (lúc này là nhớ lại
//                      sau khoảng nghỉ, không bị "thổi phồng" bởi vừa xem đáp án xong).
//   'check'          : câu kiểm tra ngay sau khi xem từ mới (luyện bổ sung).
//   'extra'          : từ người học hay trả lời sai (từ hồ sơ kỹ năng) — luyện bổ sung, ≤ 25% buổi, ≤ RV_EXTRA_MAX.
//   'redo'           : luyện lại câu sai (đổi DẠNG so với lần sai) — luyện bổ sung.
//   'match'          : 1 bài ghép cặp từ chính các từ của buổi — luyện bổ sung.
//   'drill'          : (cũ, V105) tương đương 'extra' dạng nghĩa→chữ Hán; chỉ còn để đọc phiên đã lưu.
let rvQuestion = null;          // câu hỏi hiện tại (QE) — sinh 1 lần/câu, không sinh lại mỗi lần render
let rvMulti = null;             // V130: "câu 3 phần" (Pinyin·Nghĩa·Hán Việt, đúng 2/3) của câu LUYỆN THÊM hiện tại — xem js/review-multi.js; null = câu 1 phần như cũ
let rvQSession = QS.newSession(); // lịch sử câu đã hỏi trong buổi (chống lặp, cân bằng vị trí đáp án)
let rvLog = [];                 // nhật ký câu trả lời của buổi → màn Tổng kết
let rvStage = 'run';            // 'start' (màn bắt đầu) | 'run'
let rvStartInfo = null;         // số liệu THẬT của màn bắt đầu
let rvMatch = null;             // trạng thái bài ghép cặp đang chơi
const RV_NEW_GAP = 3;           // thẻ FSRS chính thức của từ mới đến sau ≥ 3 thẻ khác
const RV_DRILL_GAP = 3;         // khoảng cách khi đưa câu luyện sai quay lại
const RV_DRILL_MAX_TRIES = 2;   // tối đa 2 lần hỏi 1 từ ở chế độ luyện lại (không bắt người học lặp vô hạn)
const RV_EXTRA_MAX = 6;
const RV_SKILL_NAME = { recognition: 'Nhận diện', recall: 'Nhớ chủ động', listening: 'Nghe', pinyin: 'Pinyin', context: 'Từ trong câu' }; // V128
const RV_PROBE_MAX = 2;  // V127: tối đa 2 câu tự gõ "thăm dò nhớ chủ động" mỗi buổi — luyện bổ sung, KHÔNG phải thẻ FSRS
const RV_PRACTICE_TYPES = ['drill', 'extra', 'check', 'redo', 'order', 'tone']; // V135: 'order' = câu sắp xếp câu (luyện bổ sung) · V137: 'tone' = nhận biết thanh điệu
const RV_TONE_PER_SESSION = 2; // V137: số câu "nhận biết thanh điệu" (chữ Hán → chọn cách đọc đúng thanh) chèn vào mỗi buổi "Hôm nay học"
// ── V115 ────────────────────────────────────────────────────────────────────────────────────────────────────
const RV_CORRECTION_GAP = 2;  // thẻ chính thức bị SAI → hỏi lại bằng DẠNG KHÁC sau ≥ 2 thẻ (luyện bổ sung: không đổi FSRS, không cộng điểm kỹ năng)
const RV_LEECH_LAPSES = 4;    // khớp lib/memory-forecast.js (LEECH_LAPSES): đã quên ≥ 4 lần ...
const RV_LEECH_MATURE = 21;   // ... và CHƯA vững (stability < 21 ngày; khớp LEECH_MATURE_STABILITY). lapses không bao giờ giảm nên cần điều kiện này.
// Từ cứng đầu ĐANG CÒN (dùng cho danh sách/đếm). Thiếu stability → vẫn coi là cứng đầu (không giấu từ khó).
function rvIsActiveLeech(w) {
  if (!w || !(Number(w.lapses) >= RV_LEECH_LAPSES)) return false;
  const s = Number(w.stability);
  return !(Number.isFinite(s) && s >= RV_LEECH_MATURE);
}
let rvLeechOnly = false;      // phiên "chỉ từ cứng đầu" (xem startLeechSession) — cờ dùng 1 lần khi tải danh sách
let rvLeechMode = false;      // đang ở phiên cứng đầu → nút "Học tiếp" ở màn tổng kết tiếp tục đúng chế độ này
let rvRatingExpanded = false; // người học bấm "Đổi đánh giá" → hiện 4 nút và DỪNG tự chuyển câu
function rvLsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function rvLsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
// Mặc định: hệ thống tự chấm (không bắt chọn Again/Hard/Good/Easy ở mỗi thẻ). Bật "chấm thủ công" = luôn hiện 4 nút như V114.
function rvManualRating() { return rvLsGet('rvManualRating') === '1'; }
function rvSetManualRating(on) { rvLsSet('rvManualRating', on ? '1' : '0'); if (typeof render === 'function') render(); }
// (Ghi chú lịch sử: TRƯỚC V138 khoá `rvSessionCards` có nghĩa "0 = không giới hạn"; từ V138 0 = TẮT thẻ chính thức — xem V149 bên dưới.)
// V138 — số câu luyện THEO CÂU mỗi buổi (0–15, mặc định 6). Đây là trần cho số THẺ FSRS được hỏi trong buổi này
// (mỗi thẻ hỏi bằng 1 câu ví dụ; KHÔNG tạo thẻ mới, KHÔNG phải câu bổ sung ngoài số thẻ). 0 = tắt phần thẻ chính
// thức (buổi chỉ còn câu luyện bổ sung). Dùng lại khoá localStorage cũ `rvSessionCards` để không mất lựa chọn.
// V146 — MẶC ĐỊNH ĐỔI từ "6 thẻ" sang "Tất cả (theo giới hạn ngày)": dashboard báo "Cần ôn 50 · Từ mới 10" nhưng vào học chỉ
// có 6 thẻ (5 ôn + 1 mới) vì trần 6 này cắt danh sách server trả về → người học thấy "không trả đủ câu". Nay mặc định lấy đúng
// số thẻ dashboard đã báo (server đã chặn ở dailyReviewLimit/dailyNewLimit). Ai muốn buổi ngắn vẫn chọn 2/6/10/15 như cũ.
// Lưu ở khoá MỚI `rvSessionCardsV2` ('all' | 0–15). Khoá cũ `rvSessionCards` chỉ được đọc khi là lựa chọn RÕ RÀNG khác 6
// (6 từng là mặc định nên không phân biệt được "chọn 6" với "chưa chọn") — ai đã chọn 0/2/10/15 giữ nguyên lựa chọn.
function rvSentenceCountSetting() {
  const v2 = rvLsGet('rvSessionCardsV2');
  if (v2 === 'all') return 'all';
  let n = parseInt(v2, 10);
  if (!Number.isFinite(n)) {
    const old = parseInt(rvLsGet('rvSessionCards'), 10);
    // V149 FIX ("hệ thống không trả thẻ ôn tập"): ở bản trước V138 khoá cũ `rvSessionCards` có nghĩa "0 = KHÔNG giới hạn" (và 0 là mặc định),
    // còn từ V138 số 0 bị đổi nghĩa thành "TẮT thẻ chính thức". Máy nào còn giá trị '0' cũ (hoặc số âm/rác) sẽ bị tắt sạch thẻ ôn + từ mới dù
    // dashboard vẫn báo "Cần ôn 100 · Từ mới 20" (buổi học chỉ còn câu luyện bổ sung). Giá trị cũ ≤ 0 → coi như chưa chọn ('all').
    // Chỉ khoá MỚI `rvSessionCardsV2` (người học tự chọn "Tắt" trong Cài đặt) mới được phép là 0.
    if (!Number.isFinite(old) || old <= 0 || old === 6) return 'all';
    n = old;
  }
  return Math.max(0, Math.min(15, Math.round(n)));
}
function rvSentenceCount() { const s = rvSentenceCountSetting(); return s === 'all' ? Infinity : s; }
function rvSetSentenceCount(v) { rvLsSet('rvSessionCardsV2', v === 'all' ? 'all' : String(Math.max(0, Math.min(15, parseInt(v, 10) || 0)))); }
// Chỉ tự chọn rating khi trả lời ĐÚNG và người học chưa bấm "Đổi". Trả lời SAI → KHÔNG tự chuyển câu: phải có thời gian đọc đáp án
// (trước V115 màn đáp án của câu sai chỉ có 2 giây rồi tự đi — đúng lúc sửa lỗi quan trọng nhất).
function rvShouldAutoCommit() { return !!(rvLastAnswer && rvLastAnswer.correct) && !rvRatingExpanded; }
function rvWrongCountInSession(hz) { return rvLog.filter(e => e && e.hz === hz && e.official && !e.correct).length; }
// Từ cứng đầu (trên màn đáp án của câu vừa SAI): đã quên ≥ RV_LEECH_LAPSES lần (theo lịch FSRS thật), hoặc sai ≥ 2 lượt chính thức trong buổi này.
// KHÔNG xét độ vững ở đây: câu sai vừa rồi đã làm độ ổn định tụt xuống, và đây là lúc cần đổi cách học.
function rvLeechInfo(w, card) {
  const lapses = Math.max(Number(w && w.lapses) || 0, Number(card && card.lapses) || 0);
  const wrongNow = rvWrongCountInSession(w && w.hz);
  return { isLeech: lapses >= RV_LEECH_LAPSES || wrongNow >= 2, lapses, wrongNow };
}
function rvIsPractice(it) { return !!it && RV_PRACTICE_TYPES.includes(it.type); }
function rvIsOfficial(it) { return !!it && (it.type === 'review' || it.type === 'new'); }
// V114: TÁCH 2 trạng thái trước đây dồn chung vào cờ `introduced`:
//   • introduced            = "từ này ĐÃ qua màn giới thiệu" (chỉ để không hiện lại màn giới thiệu). Tồn tại suốt phiên, kể cả khi thẻ bị sai và quay lại hàng đợi.
//   • introExposurePending  = "lượt FSRS chính thức ĐẦU TIÊN sau giới thiệu CHƯA được gửi" (người học vừa xem đáp án ở màn giới thiệu/câu kiểm tra
//     → lượt đó mang exposure:'intro', không cộng điểm kỹ năng). Chỉ đặt khi tạo thẻ chính thức sau câu kiểm tra; TẮT ngay khi lượt đó được gửi đi
//     (ghi outbox write-ahead xong) nên thẻ quay lại hàng đợi/tải lại trang/gửi lại do mất mạng không bao giờ mang lại cờ này lần nữa.
function rvIsIntroExposure(it) { return !!it && it.type === 'new' && it.introExposurePending === true; }
// Tương thích V113: hàng đợi đã lưu trong localStorage từ bản V113 chỉ có `introduced` (chưa có introExposurePending). Với thẻ chính thức
// kiểu đó, dùng nhật ký phiên (rvLog) để phân biệt: đã có lượt chính thức của từ này trong phiên → KHÔNG còn là lượt đầu; chưa có → vẫn là lượt đầu.
function rvNormalizeIntroFlags(items, log) {
  const answered = new Set((Array.isArray(log) ? log : []).filter(e => e && e.official).map(e => e.hz));
  for (const it of (Array.isArray(items) ? items : [])) {
    if (it && it.type === 'new' && it.introduced === true && it.introExposurePending === undefined && it.word) {
      it.introExposurePending = !answered.has(it.word.hz);
    }
  }
  return items;
}

function rvQCtx() {
  return {
    pool: WORDS,
    examples: rvExamplePool,
    sentences: (typeof SENTENCES !== 'undefined') ? SENTENCES : [],
    confuseGroups: (typeof CONFUSE_GROUPS !== 'undefined') ? CONFUSE_GROUPS : [],
    audioOk: (typeof skillAudioAvailable === 'function') && skillAudioAvailable(),
    heavy: (typeof pickHeavyDistractors === 'function') ? pickHeavyDistractors : null,
  };
}
// V110 — cài đặt "Cho phép câu tự gõ đáp án" (mặc định BẬT; tắt nếu gõ trên điện thoại bất tiện). Lưu cục bộ theo thiết bị.
function rvTypedEnabled() { try { return localStorage.getItem('rvAllowTyped') !== '0'; } catch { return true; } }
function rvSetTypedEnabled(on) { try { localStorage.setItem('rvAllowTyped', on ? '1' : '0'); } catch {} if (typeof render === 'function') render(); }
// V135 — số câu "🧩 Sắp xếp câu" thêm vào mỗi buổi "Hôm nay học" (0–5, mặc định 2). Đồng bộ theo tài khoản
// (progressState.ui) để mở trên máy khác vẫn giữ nguyên lựa chọn. 0 = tắt hẳn dạng này trong buổi học.
function rvOrderPerSession() {
  const ui = (typeof progressState !== 'undefined' && progressState) ? progressState.ui : null;
  const n = Number(ui && ui.orderSentencePerSession);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 2;
}
function rvSetOrderPerSession(v) {
  const n = Math.max(0, Math.min(5, parseInt(v, 10) || 0));
  if (typeof progressState === 'undefined' || !progressState) return;
  progressState.ui.orderSentencePerSession = n;
  cacheProgressLocally();
  scheduleSync();
  if (typeof render === 'function') render();
}
// V136 — tỷ lệ từng dạng bài (Cài đặt hằng ngày): 0 tắt, 0.5 ít, 1 vừa (mặc định), 2 nhiều. Đọc từ
// progressState.ui.questionMix (đồng bộ theo tài khoản). Thiếu/sai → {} (= mọi dạng hệ số 1, như trước).
function rvQuestionMix() {
  const ui = (typeof progressState !== 'undefined' && progressState) ? progressState.ui : null;
  return (ui && ui.questionMix && typeof ui.questionMix === 'object') ? ui.questionMix : null;
}
function rvSetQuestionMix(typeId, v) {
  if (typeof progressState === 'undefined' || !progressState) return;
  const n = Math.max(0, Math.min(2, Number(v)));
  const mix = Object.assign({}, progressState.ui.questionMix);
  mix[typeId] = Number.isFinite(n) ? n : 1;
  progressState.ui.questionMix = mix;
  cacheProgressLocally();
  scheduleSync();
  if (typeof render === 'function') render();
}
// V136 — khối "tỷ lệ dạng bài" trong Cài đặt hằng ngày (lesson.js chèn khi hàm này có mặt, giống
// cách rvSetOrderPerSession được dùng; tách ở đây để giữ danh sách dạng + nhãn cạnh QE).
function rvQuestionMixHtml() {
  const mix = (progressState && progressState.ui && progressState.ui.questionMix) || {};
  const label = (t) => (QE.TYPES[t] || {}).label || t;
  return `<div style="font-weight:800;font-size:.9rem;margin:14px 0 2px">🎚 Tỷ lệ dạng bài trong “Bắt đầu học”</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px;line-height:1.4">Hệ số nhân vào điểm chọn dạng, không phải tỷ lệ cứng: dạng để “Tắt” vẫn có thể xuất hiện khi không dạng nào khác dựng được câu (vd từ chưa có câu ví dụ → không có “Điền từ vào câu”).</div>
    ${QE.MCQ_ORDER.map(t => `<div class="study-settings-row"><span>${label(t)}</span>
      <select onchange="rvSetQuestionMix('${t}', this.value)">
        ${[[0, 'Tắt'], [0.5, 'Ít'], [1, 'Vừa'], [2, 'Nhiều']].map(([v, txt]) => `<option value="${v}" ${mix[t] === v ? 'selected' : ''}>${txt}</option>`).join('')}
      </select></div>`).join('')}`;
}
// Nguồn kết quả của bài luyện bổ sung (lưu ở server để tách "ngay sau xem đáp án" khỏi "nhớ sau khoảng nghỉ").
function rvPracticeSource(item) {
  if (!item) return 'practice';
  if (item.type === 'check') return 'check';
  if (item.type === 'redo') return 'redo';
  if (item.type === 'match') return 'match';
  return 'extra'; // extra / drill
}
function rvSentenceTypes(skill) { return QE.SENTENCE_ORDER.filter(t => QE.TYPES[t].skill === skill); } // V138: chỉ còn câu hỏi theo câu
function rvBuildQuestionFor(item) {
  // V111: từ hay nhầm (server) → QE chèn đáp án từng nhầm làm đáp án nhiễu; `remaining` = số thẻ chính thức còn lại → bộ chọn
  // bớt dạng chậm khi hàng đợi còn dài.
  const w = item.word, ctx = Object.assign(rvQCtx(), { confusions: item.confusions });
  // V127: learner (số liệu cấp người học) + lastExerciseType (dạng đã hỏi cho từ này ở lần trước) — chỉ làm bộ chọn cân nhắc thêm; thiếu thì y như V126.
  const base = { session: rvQSession, profile: item.skillProfile, allowTyped: rvTypedEnabled(), remaining: rvQueue.items.filter(rvIsOfficial).length,
    learner: rvLearner, lastExerciseType: item.lastExerciseType, mix: rvQuestionMix() };
  if (item.type === 'extra' && item.probe === 'typed' && rvTypedEnabled()) {
    // V127: thăm dò NHỚ CHỦ ĐỘNG — chọn đúng chữ Hán trong 4 đáp án là bằng chứng NHẬN DIỆN, chưa chứng minh tự nhớ ra chữ. Hỏi tự gõ (nghĩa → chữ Hán)
    // dưới dạng LUYỆN BỔ SUNG: ghi vào skill_practice_log (/api/skills/practice), KHÔNG đụng lịch/trạng thái FSRS. Không dựng được → rơi về luồng extra thường.
    const q = QS.choose(w, ctx, Object.assign({}, base, { allowPracticeOnly: true, only: ['typeVi2hz'], forced: true, exclude: item.failedTypes || [] }));
    if (q) { q.why = 'Bạn chọn đúng chữ Hán khá tốt ở dạng chọn đáp án, nhưng chưa đủ dữ liệu về việc tự nhớ ra chữ — câu tự gõ này để đo thêm (luyện bổ sung, không đổi lịch ôn).'; return q; }
  }
  if (item.type === 'order') { // V135: câu sắp xếp câu — chỉ dựng dạng này, không đổi sang dạng khác
    const q = QS.choose(w, ctx, Object.assign({}, base, { allowPracticeOnly: true, only: QE.ORDER_ORDER, forced: true }));
    return q || null;
  }
  if (item.type === 'tone') { // V137: nhận biết thanh điệu — chỉ dựng dạng này (luyện bổ sung, không đổi lịch ôn)
    return QS.choose(w, ctx, Object.assign({}, base, { allowPracticeOnly: true, only: ['hz2tone'], forced: true }));
  }
  if (item.type === 'check') return QS.choose(w, ctx, Object.assign({}, base, { only: QE.SENTENCE_ORDER }));
  if (item.type === 'drill') return QS.choose(w, ctx, Object.assign({}, base, { only: QE.SENTENCE_ORDER }));
  if (item.type === 'extra' || item.type === 'redo') {
    // V138: câu luyện thêm cũng hỏi THEO CÂU (không còn trắc nghiệm từ đơn lẻ). Không dựng được câu nào → null
    // (thẻ bị bỏ khỏi buổi này, KHÔNG rơi về dạng hỏi nghĩa của một từ).
    const opts = Object.assign({}, base, { allowPracticeOnly: true, exclude: item.failedTypes || [] });
    const only = item.targetSkill ? rvSentenceTypes(item.targetSkill) : [];
    // Ưu tiên đúng kỹ năng đang yếu; nếu kỹ năng đó không dựng được câu hợp lệ thì thử bất kỳ câu hỏi theo câu nào khác.
    const q = (only.length && QS.choose(w, ctx, Object.assign({}, opts, { only })))
      || QS.choose(w, ctx, Object.assign({}, opts, { only: QE.SENTENCE_ORDER }));
    // V128: câu luyện thêm do KẾ HOẠCH (kỹ năng tụt lại ở mức người học) → nói rõ lý do, chỉ khi câu dựng được ĐÚNG kỹ năng đó.
    if (q && item.fromPlan && item.targetSkill && q.skill === item.targetSkill && RV_SKILL_NAME[item.targetSkill]) {
      q.why = `Kỹ năng ${RV_SKILL_NAME[item.targetSkill]} của bạn đang thấp hơn các kỹ năng khác (theo phần Phân tích năng lực), nên câu này được thêm vào để luyện (luyện bổ sung, không đổi lịch ôn).`;
    }
    return q || null;
  }
  // V138: thẻ FSRS chính thức — CHỈ hỏi bằng câu hỏi theo câu (server tự tra lại câu thật để chấm). Không dựng
  // được câu nào (từ chưa có câu ví dụ) → null; rvPrepareCurrentCard bỏ thẻ khỏi buổi này thay vì hỏi từ đơn lẻ.
  return QS.choose(w, ctx, Object.assign({}, base, { fsrsOnly: true, only: QE.SENTENCE_ORDER }));
}
function rvStageLabel(item) {
  if (!item) return '';
  if (item.type === 'review') return '🔁 Ôn nhanh';
  if (item.type === 'new' || item.type === 'check') return '🆕 Học từ mới';
  if (item.type === 'order') return '🧩 Sắp xếp câu'; // V135: luyện bổ sung, không đổi lịch FSRS
  if (item.type === 'tone') return '🎵 Nhận biết thanh điệu'; // V137: luyện bổ sung, không đổi lịch FSRS
  return '🎯 Luyện thích ứng';
}
function rvRecordAnswer(item, q, correct, ms, official) {
  // V111: cập nhật hồ sơ kỹ năng NGAY (cùng công thức server) để câu kế tiếp — kể cả khi từ này quay lại hàng đợi — thấy kết quả
  // vừa rồi: sai thì kỹ năng đó yếu đi, đúng thì tiến lên; đúng nhưng chậm thì đánh dấu "chưa chắc". PHẢI gọi trước QS.record
  // (để câu hiện tại chưa tính vào chuẩn nhịp). Chỉ là ước lượng cục bộ cho phiên này; server ghi & tính lại độc lập.
  // V113: câu check/redo (vừa xem đáp án) và lượt đầu sau màn giới thiệu KHÔNG cập nhật hồ sơ cục bộ — server cũng không tính chúng.
  // V114: "lượt đầu sau giới thiệu" = introExposurePending (KHÔNG còn là introduced) — các lượt sau của từ đó cập nhật bình thường.
  if (item && !(item.type === 'check' || item.type === 'redo' || rvIsIntroExposure(item))) {
    const updated = QS.learn(item.skillProfile, rvQSession, q, correct, ms);
    item.skillProfile = updated;
    for (const other of rvQueue.items) if (other !== item && other.word && other.word.hz === q.hz) other.skillProfile = updated;
    // V128 giai đoạn 3: cập nhật cả số liệu cấp NGƯỜI HỌC (cùng điều kiện "là bằng chứng" như hồ sơ từng từ ngay trên; cùng cách đếm của server) để bộ chọn
    // câu hỏi và phần Phân tích thấy kết quả vừa rồi trong CHÍNH buổi này. Thiếu module / lỗi → giữ nguyên (chạy như V127). Số liệu thật vẫn do server tính lại độc lập.
    if (typeof TP !== 'undefined') { try { rvLearner = TP.applyAnswer(rvLearner, { skill: q.skill, typed: !!q.typed, correct: !!correct }); } catch {} }
  }
  QS.record(rvQSession, q, correct, ms);
  rvLog.push({ hz: q.hz, l: q.l, typeId: q.typeId, skill: q.skill, correct: !!correct, ms: ms == null ? null : Math.round(ms), official: !!official, source: item.type, hinted: !!q.hinted, intro: rvIsIntroExposure(item), plan: !!item.fromPlan }); // V128: plan = câu luyện thêm theo kế hoạch // V118: intro = lượt chính thức đầu sau màn giới thiệu (vừa xem đáp án) → không dùng làm bằng chứng kỹ năng ở tổng kết
  if (rvLog.length > 400) rvLog.shift();
}
function rvRestoreQSession() {
  rvQSession = QS.newSession();
  for (const e of rvLog) {
    // V111: dùng chính QS.record để cả nhịp trả lời (rt) được khôi phục sau khi tải lại trang.
    QS.record(rvQSession, { hz: e.hz, typeId: e.typeId, skill: e.skill, typed: !!(QE.TYPES[e.typeId] && QE.TYPES[e.typeId].typed), correctIndex: null }, !!e.correct, e.ms);
  }
  rvQSession.recentCorrectPositions = []; // vị trí đáp án đúng của buổi trước không còn ý nghĩa
}
// Thời gian đọc phản hồi trước khi tự chọn rating: câu có giải thích dài (điền từ vào câu) cần lâu hơn.
function rvBaseAutoMs() { return (typeof swAutoBaseMs === 'function') ? swAutoBaseMs() : RV_AUTO_COMMIT_MS; } // V117: người học chọn Nhanh/Vừa/Chậm trong cài đặt khu vực học
function rvAutoMs() {
  if (rvMulti) return rvBaseAutoMs() * 2; // V131 2c: câu 3 phần có thêm dòng kết quả từng phần + đáp án phần sai → cần thời gian đọc hơn câu 1 phần
  return (rvQuestion && (rvQuestion.typeId === 'cloze' || rvQuestion.typed)) ? rvBaseAutoMs() * 3 : rvBaseAutoMs();
} // V110: câu tự nhập cũng cần thời gian đọc phản hồi

// ── Bổ sung "Highlight System Rating" (revert V67's auto-only flow) ─────────────────────────────
let rvRatingPhase = null;   // null (chưa tới lúc) | 'loading' (đang hỏi server gợi ý) | 'pending'
                             // (đang hiện 4 nút + đếm ngược, chờ user) | 'committing' (đã chốt rating,
                             // đang gửi lên FSRS) | 'done' (đã lưu xong)
let rvSystemRating = null;  // 'again'|'hard'|'good'|'easy' — gợi ý CỦA HỆ THỐNG cho câu hiện tại
let rvUserRating = null;    // rating do CHÍNH USER bấm tay — null nếu để countdown tự chọn hộ
let rvFinalRating = null;   // rating THỰC SỰ đã/sẽ gửi lên FSRS: userRating nếu có, không thì systemRating
let rvPendingReview = null; // { selectedAnswer, responseTimeMs, answerChanges } cố định từ lúc chọn đáp án trắc nghiệm
let rvCountdownEndAt = 0;   // Date.now() timestamp lúc countdown kết thúc (tự chọn System Rating)
let rvCountdownTimer = null;
const RV_AUTO_COMMIT_MS = 2000; // "Tự động chọn sau 2s" — khớp ví dụ trong yêu cầu bổ sung
const RV_RATING_ORDER = ['again', 'hard', 'good', 'easy'];
const RV_RATING_META = {
  again: { label: 'Again', cls: 'rv-rate-again' },
  hard:  { label: 'Hard',  cls: 'rv-rate-hard'  },
  good:  { label: 'Good',  cls: 'rv-rate-good'  },
  easy:  { label: 'Easy',  cls: 'rv-rate-easy'  },
};

function rvStorageMode() { return 'review' + (rvWeakMode ? '-weak' : ''); }
// Tất cả việc lưu/khôi phục phiên giờ đi thẳng qua sqPersist/sqReadPersisted (study-queue.js) trên
// đúng object rvQueue — không còn hàm rvPersist() tự lắp tay từng field như trước.

// V71: khử trùng lặp {type,word} theo word.hz — cùng lý do với sqDedupeByHz (1 chữ Hán có thể gắn
// với 2 "thẻ" khác nhau ở 2 bài khác nhau phía server). V74: lọc thêm sessionKnownHz (study-queue.js)
// để không nạp lại từ vừa trả lời ĐÚNG ở tab Flashcard/Trắc nghiệm/Gõ chữ/Nghe-chọn hoặc phiên khác
// trong CÙNG NGÀY (Study Day — V77).
// V146: thẻ server trả về ở state 1 (Learning) / 3 (Relearning) là thẻ ĐANG ở bước học ngắn hạn và đã qua cooldown 15 phút
// (xem LEARNING_COOLDOWN_MINUTES ở lib/db.js) — tức server xác nhận nó ĐẾN HẠN LẠI. sessionKnownHz (trả lời đúng lần trước)
// KHÔNG được chặn nó nữa, nếu không từ vừa học/vừa sai sáng nay không bao giờ quay lại trong ngày dù dashboard vẫn đếm nó.
function rvIsLearningDue(it) { return !!(it && it.word && (it.word.state === 1 || it.word.state === 3)); }
function rvDedupeSession(list) {
  const seen = new Set();
  return list.filter(it => {
    if (seen.has(it.word.hz) || (sessionKnownHz.has(it.word.hz) && !rvIsLearningDue(it))) return false;
    seen.add(it.word.hz);
    return true;
  });
}
// V77 (dùng riêng cho "Học lại từ đầu" — Yêu cầu 8): khử trùng lặp theo hz CHỈ trong nội bộ danh
// sách vừa tải, KHÔNG lọc sessionKnownHz — vì "Học lại từ đầu" CỐ Ý cho phép ôn lại từ đã hoàn
// thành hôm nay.
function rvDedupeByHzOnly(list) {
  const seen = new Set();
  return list.filter(it => { if (seen.has(it.word.hz)) return false; seen.add(it.word.hz); return true; });
}

// V127: nạp kho câu ví dụ cho các bài có trong hàng đợi. Trước đây CHỈ phiên mới nạp (và không chờ); phiên "Học tiếp" và "Học lại từ đầu" đặt kho về
// rỗng rồi không nạp lại nên dạng "điền từ vào câu" (kỹ năng Dùng từ trong câu) bị thiếu ở các đường đó. Chờ tối đa waitMs rồi vẫn tiếp tục
// (không để mạng chậm chặn việc học); nạp xong muộn thì các câu sau vẫn dùng được.
function rvLoadExamples(items, waitMs) {
  // Phần PHỤ: mọi lỗi (kể cả lỗi đồng bộ) đều bị nuốt — việc nạp kho ví dụ không bao giờ được chặn phiên học.
  try {
    const lessons = [...new Set((items || []).filter(it => it && it.word).map(it => it.word.l))];
    if (!lessons.length || !authToken) return Promise.resolve();
    const job = Promise.resolve().then(() => fetch('/api/word-examples?lessons=' + lessons.join(','), { headers: authHeaders() }))
      .then(r => r.json()).then(d => { if (d && d.ok) rvExamplePool = d.examples || []; })
      .catch(() => {});
    if (!(waitMs > 0)) return job;
    return Promise.race([job, new Promise(res => setTimeout(res, waitMs))]);
  } catch (e) { return Promise.resolve(); }
}

// V77/V78: gọi API lấy 1 bộ từ MỚI (due/new thật từ server, hoặc weak-words) — dùng chung cho cả
// nhánh "tải phiên mới" của startStudySession() lẫn rvRelearnFromStart(), tránh 2 nơi tự viết lại
// cùng 1 logic rồi lệch nhau theo thời gian.
async function rvFetchFreshSession(ignoreDayDedupe) {
  try {
    if (rvWeakMode) {
      const res = await fetch('/api/study/weak-words', { headers: authHeaders() });
      const data = await res.json();
      if (!data.ok) return { error: data.error || 'Không tải được từ hay quên' };
      const only = rvLeechOnly; rvLeechOnly = false; // V115: dùng 1 lần
      const list = data.words.filter(w => !only || rvIsActiveLeech(w)).map(w => ({ type: 'review', word: w }));
      return { list: ignoreDayDedupe ? rvDedupeByHzOnly(list) : rvDedupeSession(list), reviewCount: list.length, newCount: 0, blockedByBacklog: false, totalDue: 0 };
    }
    // FIX (Vấn đề 5 — "Chọn bài học không hoạt động"): đảm bảo server đã thấy đúng Quyển/bài MỚI
    // NHẤT (không dính debounce 700ms của scheduleSync) trước khi truy vấn.
    await flushProgressSync();
    const res = await fetch('/api/study/session?adaptive=1', { headers: authHeaders() }); // V127: xin thêm số liệu người học + dạng câu hỏi lần trước (field mới, không thay field cũ)
    const data = await res.json();
    if (!data.ok) return { error: data.error || 'Không tải được phiên học' };
    const raw = data.session || [];
    return {
      list: ignoreDayDedupe ? rvDedupeByHzOnly(raw) : rvDedupeSession(raw),
      reviewCount: data.reviewCount || 0, newCount: data.newCount || 0,
      blockedByBacklog: !!data.blockedByBacklog, totalDue: data.totalDue || 0,
      scopeLessons: Array.isArray(data.scopeLessons) ? data.scopeLessons : [],
      learner: (data.learner && data.learner.v === 1 && data.learner.skills) ? data.learner : null, // V127
    };
  } catch (e) {
    return { error: e.message };
  }
}

// forceNew: false/undefined = hành vi "Học tiếp" (mặc định) — nếu còn 1 Study Session hợp lệ dang
// dở (cùng weakMode, đúng ngày hôm nay, đúng Quyển/bài đang chọn — xem sqReadPersisted/
// sqLessonFilterMatches), TIẾP TỤC đúng phiên đó (khôi phục đủ queue/currentIndex(=items[0])/
// lessonFilter/completedCards/answeredCards/seenCards — Vấn đề 3); không có thì tự nạp phiên mới.
// true = hành vi "Học mới" (Vấn đề 4) — CHỦ ĐỘNG đóng/ghi nhật ký phiên dang dở (nếu có) rồi mở
// phiên hoàn toàn MỚI, không lấy lại card đã hoàn thành/vừa học/chưa đến hạn FSRS (Vấn đề 4), tự
// tiếp tục đúng từ CHƯA học kế tiếp (không quay lại đầu danh sách).
// V110 — chế độ học THU HẸP: 'due' = chỉ thẻ đến hạn theo lịch FSRS, 'new' = chỉ từ mới. Đây chỉ là BỘ LỌC trên đúng
// danh sách do server/FSRS trả về (cùng ngân sách ngày, cùng thứ tự); không tạo nguồn dữ liệu riêng, không đổi lịch ôn.
// Chỉ áp dụng cho phiên MỚI; phiên đang dở được khôi phục nguyên trạng. Dùng 1 lần rồi tự xoá để "Học tiếp" quay lại bình thường.
let rvOnlyType = null;
// V149: số thẻ chính thức (ôn + mới) mà server đã trả nhưng bị loại vì người học ĐANG ĐẶT "Số thẻ tối đa mỗi buổi = Tắt". 0 = không có chuyện đó.
// Dùng để màn bắt đầu nói rõ lý do thay vì im lặng hiện "0 từ mới / 0 thẻ ôn".
let rvCapOffSkipped = 0;
function rvSavedSessionIsHollow(saved) {
  return !!saved && Array.isArray(saved.items) && !(saved.answeredCount > 0) && !saved.items.some(rvIsOfficial);
}
// Nút "Bật lại thẻ ôn tập" trên màn bắt đầu/dashboard: về mặc định 'all', bỏ phiên đã lưu (đang chứa buổi rỗng) rồi nạp lại từ server.
function rvEnableOfficialCards() {
  rvSetSentenceCount('all');
  try { sqClearPersisted(rvStorageMode()); } catch {}
  if (typeof invalidateTodayDashboardCache === 'function') invalidateTodayDashboardCache();
  return startStudySession(false, false);
}
function startStudyMode(kind) {
  rvOnlyType = (kind === 'due' || kind === 'new') ? kind : null;
  ssEnterMode('review');
}
async function startStudySession(weakMode, forceNew) {
  if (!rvLeechOnly) rvLeechMode = false; // vào bằng cách khác (không qua startLeechSession) → thoát chế độ cứng đầu
  const onlyType = rvOnlyType; rvOnlyType = null;
  rvWeakMode = !!weakMode;
  const savedKey = rvStorageMode();
  if (!forceNew) {
    // FIX (Vấn đề 3 — "Học tiếp" phải khôi phục ĐỦ queue/currentIndex/lessonFilter/completedCards/
    // answeredCards/seenCards): đọc thẳng qua sqReadPersisted() dùng chung với 4 tab kia, rồi gán
    // trực tiếp vào rvQueue (thay vì trước đây copy tay từng field vào các biến rời rvSession/...).
    let saved = sqReadPersisted(savedKey);
    // V149 FIX: phiên đã lưu CHƯA trả lời câu nào mà không có thẻ chính thức (ôn/mới) nào — chỉ toàn câu luyện bổ sung — là phiên "rỗng"
    // do lỗi cũ (vd trần số thẻ = 0) để lại. Khôi phục nó sẽ nhốt người học trong phiên lỗi suốt cả ngày dù server còn thẻ đến hạn →
    // bỏ và nạp phiên mới từ server.
    if (saved && rvSavedSessionIsHollow(saved)) { sqClearPersisted(savedKey); saved = null; }
    if (saved && saved.items.length && sqLessonFilterMatches(saved.lessonFilter)) {
      const filteredItems = saved.items.filter(it => (it.type !== 'review' && it.type !== 'new') || !sessionKnownHz.has(it.word.hz)); // V106: chỉ lọc thẻ FSRS đã biết; giữ câu luyện bổ sung
      const purged = saved.items.length - filteredItems.length;
      if (filteredItems.length) {
        rvQueue.items = filteredItems;
        rvQueue.sessionId = saved.sessionId;
        rvQueue.totalPlanned = saved.totalPlanned;
        rvQueue.answeredCount = saved.answeredCount + purged;
        rvQueue.startTime = saved.startTime || Date.now();
        rvQueue.endTime = null;
        rvQueue.completedCards = Array.isArray(saved.completedCards) ? saved.completedCards : [];
        rvQueue.lessonFilter = saved.lessonFilter || sqSnapshotLessonFilter();
        rvQueue.dayKey = saved.dayKey || todayKey();
        rvSummary = (saved.extra && saved.extra.summary) || rvSummary;
        rvLog = (saved.extra && Array.isArray(saved.extra.log)) ? saved.extra.log : []; rvRestoreQSession();
        rvNormalizeIntroFlags(rvQueue.items, rvLog); // V114: hàng đợi lưu từ V113 chưa có cờ introExposurePending
        rvStage = 'run'; rvStartInfo = null; rvMatch = null;
        rvBlockedByBacklog = false; rvTotalDue = 0; rvCapOffSkipped = 0; // phiên đang khôi phục chắc chắn có thẻ thật, không liên quan lý do "bị chặn"
        rvExamplePool = []; rvLastAnswer = null; rvAdaptNote = '';
        rvLearner = (saved.extra && saved.extra.learner && saved.extra.learner.v === 1) ? saved.extra.learner : null; // V127: phiên lưu từ V126 chưa có → null (bộ chọn chạy như V126)
        goTab('review');
        await rvLoadExamples(rvQueue.items, 1500); // V127: trước đây phiên khôi phục không nạp lại kho ví dụ → thiếu câu điền từ
        rvPrepareCurrentCard();
        render();
        return;
      }
    }
  } else {
    // V77 (Vấn đề 4 — "Học mới"): đóng phiên đang dở vào nhật ký ngày trước khi thay bằng phiên mới.
    ssArchiveSession(savedKey, rvQueue);
    sqClearPersisted(savedKey);
  }
  rvExamplePool = []; rvLastAnswer = null; rvLearner = null; rvAdaptNote = '';
  rvQueue = sqCreate();
  rvLog = []; rvQSession = QS.newSession(); rvMatch = null; rvStage = 'run'; rvStartInfo = null; // V106: buổi mới
  rvQueue.sessionId = genIdempotencyKey();
  rvQueue.startTime = Date.now();
  rvQueue.lessonFilter = sqSnapshotLessonFilter();
  rvQueue.dayKey = todayKey();
  goTab('review');
  const el = document.getElementById('content');
  if (el) el.innerHTML = `<div class="study-empty">Đang tải phiên học...</div>`;
  const fetched = await rvFetchFreshSession(false);
  const { error, blockedByBacklog, totalDue, scopeLessons } = fetched;
  let { list, reviewCount, newCount } = fetched;
  if (error) { alert(error); goTab('today'); return; }
  rvLearner = fetched.learner || null; // V127
  if (onlyType && !rvWeakMode) { // V110: chế độ thu hẹp
    list = list.filter(it => it.type === (onlyType === 'due' ? 'review' : 'new'));
    reviewCount = onlyType === 'due' ? list.length : 0;
    newCount = onlyType === 'new' ? list.length : 0;
  }
  // V138: trần số THẺ chính thức được hỏi trong buổi (0–15, mặc định 6). Giữ nguyên thứ tự FSRS (đến hạn trước,
  // từ mới sau), chỉ cắt phần cuối; phần bị cắt vẫn còn trên server (chưa trả lời nên chưa bị trừ ngân sách ngày)
  // và "Học tiếp" sẽ lấy tiếp. 0 = tắt phần thẻ chính thức (buổi chỉ còn câu luyện bổ sung).
  const cap = rvSentenceCount();
  rvCapOffSkipped = 0;
  if (!rvWeakMode && list.length > cap) {
    if (cap === 0) {
      rvCapOffSkipped = list.length; // V149: ghi lại để màn bắt đầu giải thích (không còn im lặng)
      list = [];
    } else {
      // FIX V124: cắt thẳng phần cuối làm TỪ MỚI (xếp sau thẻ đến hạn) không bao giờ vào phiên khi thẻ đến hạn ≥ cap.
      // Chừa ~1/4 chỗ cho từ mới; phần còn lại giữ đúng thứ tự FSRS. Thiếu thẻ đến hạn thì từ mới lấp đầy như cũ.
      const newList = list.filter(it => it.type === 'new');
      if (newList.length && newList.length < list.length) {
        const dueList = list.filter(it => it.type !== 'new');
        const reserve = Math.min(newList.length, Math.max(1, Math.floor(cap / 4)));
        let picked = dueList.slice(0, Math.max(0, cap - reserve)).concat(newList.slice(0, reserve));
        if (cap - picked.length > 0) picked = picked.concat(newList.slice(reserve, reserve + (cap - picked.length)));
        list = picked;
      } else {
        list = list.slice(0, cap);
      }
    }
    reviewCount = list.filter(it => it.type === 'review').length;
    newCount = list.filter(it => it.type === 'new').length;
  }
  // V106: thêm nguồn thứ 3 (từ hay trả lời sai) + 1 bài ghép cặp; thẻ FSRS chính thức giữ nguyên thứ tự.
  let sessionItems = list, extraCount = 0;
  if (!rvWeakMode && !onlyType) {
    const ex = await rvAddExtras(sessionItems);
    extraCount = ex.extraCount;
    sessionItems = rvInsertOrderSentence(ex.items); // V135: câu sắp xếp câu (luyện bổ sung) trước
    sessionItems = rvInsertToneRecognition(sessionItems); // V137: câu nhận biết thanh điệu (luyện bổ sung)
    sessionItems = rvInsertMatch(sessionItems);
  }
  rvQueue.items = sessionItems;
  rvSummary = { reviewCount: reviewCount || 0, newCount: newCount || 0 };
  rvBlockedByBacklog = !!blockedByBacklog;
  rvTotalDue = totalDue || 0;
  rvQueue.totalPlanned = sessionItems.filter(rvIsOfficial).length;
  // Nạp trước kho ví dụ cho các bài xuất hiện trong session (Phần 24). V127: có màn bắt đầu → không chặn (người học còn đọc màn đó);
  // vào thẳng thẻ đầu (chế độ từ hay quên/cứng đầu) → chờ tối đa 1.5s để thẻ đầu dựng được câu điền từ.
  const hasStartScreen = !rvWeakMode && sessionItems.length;
  const examplesJob = rvLoadExamples(rvQueue.items, hasStartScreen ? 0 : 1500);
  sqPersist(savedKey, rvQueue, { summary: rvSummary, log: rvLog, learner: rvLearner });
  if (hasStartScreen) {
    rvStage = 'start'; rvStartInfo = rvBuildStartInfo(sessionItems, extraCount, scopeLessons); // màn bắt đầu: chỉ số liệu thật
  } else {
    await examplesJob;
    rvPrepareCurrentCard();
  }
  render();
}

// V77 (Vấn đề 8/Yêu cầu 8 — "Học lại từ đầu" cho "Hôm nay học"): hành động TƯỜNG MINH riêng, chỉ
// chạy khi user chủ động bấm nút — KHÔNG bao giờ được gọi tự động ở bất kỳ đâu khác. Đóng/ghi nhật
// ký phiên hiện tại rồi nạp lại đúng bộ từ (due/new thật hoặc weak-words) NHƯNG cố ý bỏ qua
// sessionKnownHz để có thể ôn lại đúng những từ vừa hoàn thành trong ngày. Không đụng tới FSRS thật
// trên server.
async function rvRelearnFromStart() {
  const savedKey = rvStorageMode();
  ssArchiveSession(savedKey, rvQueue);
  sqClearPersisted(savedKey);
  rvExamplePool = []; rvLastAnswer = null; rvAdaptNote = '';
  rvQueue = sqCreate();
  rvLog = []; rvQSession = QS.newSession(); rvMatch = null; rvStage = 'run'; rvStartInfo = null; // V106: buổi mới
  rvQueue.sessionId = genIdempotencyKey();
  rvQueue.startTime = Date.now();
  rvQueue.lessonFilter = sqSnapshotLessonFilter();
  rvQueue.dayKey = todayKey();
  goTab('review');
  const el = document.getElementById('content');
  if (el) el.innerHTML = `<div class="study-empty">Đang tải phiên học...</div>`;
  const { list, error, reviewCount, newCount, blockedByBacklog, totalDue, learner } = await rvFetchFreshSession(true);
  if (error) { alert(error); goTab('today'); return; }
  rvLearner = learner || null; // V127
  rvCapOffSkipped = 0; // V149: "Học lại từ đầu" không áp trần số thẻ
  rvQueue.items = list;
  rvSummary = { reviewCount: reviewCount || 0, newCount: newCount || 0 };
  rvBlockedByBacklog = !!blockedByBacklog;
  rvTotalDue = totalDue || 0;
  rvQueue.totalPlanned = rvQueue.items.length;
  sqPersist(savedKey, rvQueue, { summary: rvSummary, learner: rvLearner });
  await rvLoadExamples(rvQueue.items, 1500); // V127: "Học lại từ đầu" trước đây không nạp kho ví dụ
  rvPrepareCurrentCard();
  render();
}

function rvFindExample(hz) {
  const matches = rvExamplePool.filter(e => e.hz === hz);
  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}
// V138 — câu CHỮ HÁN cần đọc sau khi trả lời (cả câu, không chỉ từ). Câu hỏi theo câu → câu thật của câu hỏi;
// dạng cũ (nếu còn) → chữ Hán của từ. Dùng cho cả tự phát sau khi trả lời lẫn nút "Nghe lại câu".
function rvAnswerSentence(q) {
  if (!q) return '';
  if (q.sentence && q.sentence.zh) return q.sentence.zh;
  if (q.typeId === 'vi2sent' || q.typeId === 'sentPick') return q.correctKey || '';
  return (q.word && q.word.hz) || '';
}
function rvReplaySentence() {
  const t = rvAnswerSentence(rvQuestion);
  if (t && typeof speak === 'function') speak(t);
}
// V138 — khối "câu đầy đủ" trên màn đáp án: câu chữ Hán (tô đậm từ mục tiêu) + nghĩa cả câu + nút nghe lại.
// Chỉ hiện khi câu hỏi có câu thật (câu hỏi theo câu). Không tự phát lại ở đây — tự phát đúng 1 lần ở chỗ chấm.
function rvSentenceBlockHtml() {
  const q = rvQuestion;
  if (!q || !q.sentence || !q.sentence.zh) return '';
  const safeHz = escapeHtml(q.word.hz || ''), safeZh = escapeHtml(q.sentence.zh);
  const marked = safeHz ? safeZh.split(safeHz).join(`<mark class="rv-mark">${safeHz}</mark>`) : safeZh;
  return `<div class="rv-sent-block">
      <div class="rv-sent">${marked}</div>
      ${q.sentence.vi ? `<div class="rv-sent-vi">${escapeHtml(q.sentence.vi)}</div>` : ''}
      <button class="btn btn-sm" onclick="rvReplaySentence()">🔊 Nghe lại câu</button>
    </div>`;
}

// Chuẩn bị phần tử Ở ĐẦU hàng đợi: màn giới thiệu từ mới | bài ghép cặp | câu trắc nghiệm do bộ chọn
// chọn dạng + QE dựng (đã kiểm hợp lệ). Bắt đầu đo responseTime NGAY tại đây — thời điểm câu hỏi thực sự
// sẵn sàng cho người học (Phần 4).
function rvPrepareCurrentCard() {
  rvClearCountdown();
  rvCardSeq++;
  rvQuestion = null; rvMatch = null; rvMulti = null;
  rvAnswerChanges = 0;
  rvLastAnswer = null;
  rvPhase = 'question';
  let guard = 0;
  while (rvQueue.items.length && guard++ < 60) {
    const item = rvQueue.items[0];
    if (item.type === 'new' && !item.introduced) { rvPhase = 'intro'; break; }
    if (item.type === 'match') {
      const words = (item.hzs || []).map(h => WORDS.find(x => x.hz === h)).filter(Boolean);
      const ctx = rvQCtx();
      // V132: item.kind (bài "Ghép cặp nhanh") chọn loại cặp; thiếu dữ liệu cho loại đó thì thử loại khác. Không có item.kind → như cũ (nghĩa rồi pinyin).
      const order = item.kind ? [item.kind].concat(['vi', 'py', 'hv', 'listen'].filter(k => k !== item.kind)) : ['vi', 'py'];
      let m = null;
      for (const k of order) { m = QE.buildMatch(words, k, ctx); if (m) break; }
      if (m) {
        rvMatch = { m, solved: new Set(), solvedRights: new Set(), selected: null, wrong: new Set(), answers: {}, done: false };
        rvPhase = 'match'; break;
      }
      rvQueue.items.shift(); continue; // không đủ dữ liệu ghép cặp không mơ hồ → bỏ qua, không tạo bài giả
    }
    const q = rvBuildQuestionFor(item);
    if (q) {
      rvQuestion = q; rvPhase = 'question';
      // V138: KHÔNG dựng "câu 3 phần" (Pinyin · Nghĩa · Hán Việt) nữa — đó là trắc nghiệm từ đơn lẻ, đã bị thay
      // bằng câu hỏi theo câu. rvMulti giữ null; các nhánh rvm* trong render/bind tự bỏ qua.
      break;
    }
    // Không dựng nổi câu hợp lệ nào cho từ này (kho từ quá ít): bỏ phần tử khỏi phiên thay vì kẹt vòng lặp.
    rvQueue.items.shift();
  }
  // Bổ sung "Highlight System Rating": dọn sạch trạng thái rating của câu TRƯỚC ĐÓ.
  rvRatingPhase = null; rvSystemRating = null; rvUserRating = null; rvFinalRating = null; rvPendingReview = null;
  rvRatingExpanded = false;
  rvStartedAt = performance.now();
  vtMarkStart(); // "review nhiễu khi thoát ra vào lại" — reset bộ đếm ẩn cho câu hỏi MỚI này
}

// Người học xem xong từ mới → câu kiểm tra nhanh (luyện bổ sung, không tính FSRS). Thẻ FSRS chính thức của
// từ này được đưa lại vào hàng đợi sau RV_NEW_GAP thẻ khi câu kiểm tra xong (xem rvAdvanceQueue).
function rvIntroDone() {
  const it = rvQueue.items[0];
  if (!it || rvPhase !== 'intro') return;
  rvQueue.items[0] = Object.assign({}, it, { type: 'check', introduced: true, origType: 'new' });
  rvPrepareCurrentCard();
  render();
}

function rvClearCountdown() {
  if (rvCountdownTimer) { clearInterval(rvCountdownTimer); rvCountdownTimer = null; }
}

// Ước lượng còn bao lâu tới lần ôn tiếp theo, chỉ để hiển thị thông tin cho user (Phần 18) —
// KHÔNG dùng để quyết định gì thêm, due thật đã được server/FSRS tính và lưu xong.
function rvSavedLine(r) {
  if (!r) return '';
  if (!r.card || !r.card.due) return '📌 Đã lưu lịch ôn';
  const diffMs = new Date(r.card.due).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays <= 0) return '📌 Đã lưu lịch ôn — sẽ xuất hiện lại rất sớm';
  if (diffDays === 1) return '📌 Đã lưu lịch ôn — ôn lại sau 1 ngày';
  return `📌 Đã lưu lịch ôn — ôn lại sau ${diffDays} ngày`;
}

// ── Bổ sung "Highlight System Rating": vẽ 4 nút Again/Hard/Good/Easy theo đúng rvRatingPhase.
//     Luôn vẽ đủ 4 nút (kể cả lúc 'loading') để không gây layout shift (yêu cầu Phần "Mobile UX").
// V115: thanh đánh giá GỌN (mặc định). Hệ thống đã tự chấm — người học chỉ cần bấm "Tiếp tục" (hoặc đợi tự chuyển khi đúng), muốn đổi thì
// bấm "Đổi đánh giá" để hiện 4 nút. Chế độ "chấm thủ công" (rvManualRating) và sau khi bấm "Đổi" thì dùng thanh 4 nút cũ bên dưới.
function rvRenderRatingBarCompact() {
  const committed = rvRatingPhase === 'committing' || rvRatingPhase === 'done';
  if (committed) {
    const hint = rvFinalRating ? `Đã chọn: <b>${RV_RATING_META[rvFinalRating].label}</b>${rvUserRating ? '' : ' (hệ thống tự chọn)'}` : '&nbsp;';
    return `<div class="rv-rating-wrap"><div class="rv-rating-hint">${hint}</div></div>`;
  }
  const loading = rvRatingPhase === 'loading';
  const correct = !!(rvLastAnswer && rvLastAnswer.correct);
  let hint;
  if (loading || !rvSystemRating) hint = '⏳ Đang chấm...';
  else if (correct) hint = `Hệ thống chấm: <b>${RV_RATING_META[rvSystemRating].label}</b> · tự sang câu sau sau <span id="rv-countdown-num">${Math.ceil(rvAutoMs() / 1000)}</span>s <span class="kbd-hint">· ⌨️ 1-4 để đổi</span>`;
  else hint = `Hệ thống chấm: <b>${RV_RATING_META[rvSystemRating].label}</b> · xem kỹ đáp án rồi bấm Tiếp tục <span class="kbd-hint">· ⌨️ 1-4 để đổi</span>`;
  if (!loading && rvSystemRating && typeof rvmEasyLocked === 'function' && rvmEasyLocked()) hint += ' <span style="opacity:.8">· đúng 2/3 phần nên tối đa Good</span>'; // V131 2c
  return `<div class="rv-rating-wrap"><div class="rv-rating-hint">${hint}</div>
    <div class="rv-rating-row rv-rating-row-2">
      <button class="rv-rate-btn rv-rate-change" onclick="rvExpandRating()">Đổi đánh giá</button>
      <button class="rv-rate-btn rv-rate-go" ${(loading || !rvSystemRating) ? 'disabled' : ''} onclick="rvContinueRating()">Tiếp tục ▶</button>
    </div></div>`;
}
function rvExpandRating() {
  if (rvRatingPhase !== 'pending' && rvRatingPhase !== 'loading') return;
  rvRatingExpanded = true; rvClearCountdown(); render();
}
function rvContinueRating() {
  if (rvRatingPhase !== 'pending' || !rvSystemRating) return;
  rvCommitRating(rvAttemptId, null);
}
function rvRenderRatingBar() {
  if (!rvRatingPhase) return '';
  if (!rvManualRating() && !rvRatingExpanded) return rvRenderRatingBarCompact();
  const finalRating = (rvRatingPhase === 'committing' || rvRatingPhase === 'done') ? rvFinalRating : null;
  const showSystemGlow = rvRatingPhase === 'pending' && !finalRating;
  // AUDIT V82 (UX/Performance — Phần 2/4/12): TRƯỚC ĐÂY 4 nút chỉ bấm được ở 'pending' (tức là phải
  // đợi xong round-trip /api/study/review/preview mới bấm được) — đúng cảnh "tap → loading → chờ"
  // mà yêu cầu audit muốn loại bỏ. User đã tự biết mình muốn chấm gì (không cần chờ gợi ý hệ thống)
  // nên cho bấm được NGAY từ lúc 'loading' — không đổi quy tắc "User Rating luôn thắng System
  // Rating" (rvCommitRating vẫn nhận chosenRating bình thường, không phụ thuộc rvSystemRating đã
  // có hay chưa). Chỉ riêng phần HIGHLIGHT (ngôi sao/glow đề xuất) vẫn phải đợi có rvSystemRating.
  const clickable = rvRatingPhase === 'pending' || rvRatingPhase === 'loading';
  const btns = RV_RATING_ORDER.map(r => {
    const meta = RV_RATING_META[r];
    let cls = 'rv-rate-btn ' + meta.cls;
    let extra = '';
    let extraAttrs = '';
    if (finalRating) {
      // «Đây là lựa chọn mà người dùng đã chọn» (hoặc hệ thống tự chọn khi hết giờ) — trạng thái
      // CUỐI CÙNG, mạnh hơn hẳn, KHÔNG dùng chung class với .system-rating (Phần 3/9).
      if (r === finalRating) { cls += ' rv-rate-final'; extra = ' ✓'; extraAttrs = ' aria-pressed="true"'; }
    } else if (showSystemGlow && r === rvSystemRating) {
      // «Đây là lựa chọn do hệ thống đề xuất» — class riêng .system-rating (Phần 1), không được
      // hiểu nhầm là bắt buộc (Phần 9) — accessibility: aria-label mô tả rõ đây chỉ là gợi ý (Phần 8).
      cls += ' system-rating';
      extra = ' ★';
      extraAttrs = ` aria-label="System suggested rating: ${meta.label}"`;
    }
    const locked = r === 'easy' && typeof rvmEasyLocked === 'function' && rvmEasyLocked(); // V131 2b: đúng 2/3 phần → không cho chọn Easy
    return `<button class="${cls}" ${(clickable && !locked) ? '' : 'disabled'} onclick="rvChooseRating('${r}')"${extraAttrs}${locked ? ' title="Đúng 2/3 phần nên không chọn được Easy"' : ''}>${meta.label}${locked ? ' 🔒' : extra}</button>`;
  }).join('');
  let hint = '&nbsp;';
  // AUDIT V82: nút đã bấm được ngay ở 'loading' (xem `clickable` ở trên) nên gợi ý đổi thành mời
  // bấm luôn, thay vì câu cũ khiến user tưởng phải đợi mới thao tác được.
  if (rvRatingPhase === 'loading') hint = 'Chọn đánh giá của bạn <span class="kbd-hint">· ⌨️ 1-4</span> <span style="opacity:.7">(đang tải gợi ý hệ thống...)</span>';
  else if (rvRatingPhase === 'pending' && rvSystemRating) {
    hint = `Hệ thống đề xuất: <b>${RV_RATING_META[rvSystemRating].label}</b> · Tự động chọn sau <span id="rv-countdown-num">${Math.ceil(rvAutoMs() / 1000)}</span>s <span class="kbd-hint">· ⌨️ 1-4</span>`;
  } else if (finalRating) {
    hint = `Đã chọn: <b>${RV_RATING_META[finalRating].label}</b>${rvUserRating ? '' : ' (hệ thống tự chọn)'}`;
  }
  return `<div class="rv-rating-wrap"><div class="rv-rating-hint">${hint}</div><div class="rv-rating-row">${btns}</div></div>`;
}

// Gọi /api/study/review/preview (CHỈ ĐỌC — không ghi gì lên FSRS) để lấy gợi ý System Rating của
// server cho ĐÚNG lượt trả lời này, dùng lại chung 1 logic getAutomaticFSRSRating với lúc commit
// thật (lib/fsrs-auto-rating.js) — không đoán mò riêng ở client rồi lệch với server.
async function rvFetchSystemRating({ word, selectedAnswer, responseTimeMs, answerChanges }) {
  try {
    const res = await fetch('/api/study/review/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        wordId: { hz: word.hz, l: word.l },
        quizType: rvQuestion.quizType,
        exerciseType: rvQuestion.exerciseFsrs, // V110: để server chấm đúng kiểu (tự nhập) như lúc commit
        sentence: rvQuestion.sentence ? rvQuestion.sentence.zh : undefined, // V138: server tra lại câu thật để chấm
        selectedAnswer,
        responseTimeMs: Number.isFinite(responseTimeMs) ? Math.round(responseTimeMs) : null,
        answerChanges: Number.isFinite(answerChanges) ? answerChanges : 0,
      }),
    });
    const data = await res.json().catch(() => null);
    if (data && data.ok && RV_RATING_ORDER.includes(data.systemRating)) return data.systemRating;
  } catch {}
  // Mất mạng/lỗi tạm thời — vẫn cần 1 mặc định để countdown chạy được (không chặn UI): lưới an
  // toàn bảo thủ y hệt fallback của getAutomaticFSRSRating (sai → Again; đúng chưa đủ dữ liệu → Good).
  return (rvLastAnswer && rvLastAnswer.correct) ? 'good' : 'again';
}

function rvUpdateCountdownDisplay() {
  const el = document.getElementById('rv-countdown-num');
  if (!el) return;
  el.textContent = String(Math.max(0, Math.ceil((rvCountdownEndAt - Date.now()) / 1000)));
}

// Đếm ngược AUTO_COMMIT_MS — hết giờ mà user chưa bấm nút nào thì tự dùng System Rating làm Final
// Rating (Phần 6/9 của yêu cầu bổ sung). Chỉ cập nhật số giây qua DOM trực tiếp (không gọi render()
// mỗi tick) để tránh vẽ lại cả thẻ mỗi giây (Phần "Mobile UX" — không được gây layout shift/giật).
function rvStartCountdown(attemptId) {
  rvClearCountdown();
  rvCountdownEndAt = Date.now() + rvAutoMs();
  rvUpdateCountdownDisplay();
  rvCountdownTimer = setInterval(() => {
    if (attemptId !== rvAttemptId || currentTab !== 'review' || rvRatingPhase !== 'pending' || !rvShouldAutoCommit()) { rvClearCountdown(); return; }
    if (Date.now() >= rvCountdownEndAt) { rvClearCountdown(); rvCommitRating(attemptId, null); return; }
    rvUpdateCountdownDisplay();
  }, 200);
}

// User bấm tay 1 trong 4 nút trong lúc đang đếm ngược — "User Rating luôn thắng System Rating"
// (Phần 9, quy tắc bắt buộc). Gọi từ onclick trong rvRenderRatingBar().
function rvChooseRating(rating) {
  // AUDIT V82: cho phép chọn ngay cả khi còn đang 'loading' (chờ gợi ý hệ thống) — xem giải thích ở
  // rvRenderRatingBar(). rvCommitRating() không cần rvSystemRating khi đã có chosenRating.
  if ((rvRatingPhase !== 'pending' && rvRatingPhase !== 'loading') || !RV_RATING_ORDER.includes(rating)) return;
  if (rating === 'easy' && typeof rvmEasyLocked === 'function' && rvmEasyLocked()) return; // V131 2b
  rvCommitRating(rvAttemptId, rating);
}

// Chốt Final Rating (chosenRating do user bấm, hoặc null nếu do countdown hết giờ) rồi gửi lên
// /api/study/review thật. Đặt rvRatingPhase='committing' NGAY (đồng bộ, trước await đầu tiên) để
// chặn commit lần 2 nếu click và hết giờ xảy ra gần như đồng thời (Phần 7 — "không cho timeout
// tiếp tục commit lần thứ hai").
async function rvCommitRating(attemptId, chosenRating) {
  // AUDIT V82: chấp nhận commit từ cả 'loading' lẫn 'pending' (bấm tay lúc đang loading — xem
  // rvChooseRating). Vẫn giữ nguyên chặn commit lần 2 (Phần 7 cũ) vì ngay dòng dưới đổi phase sang
  // 'committing' trước await đầu tiên — lần gọi thứ 2 (vd double-click/countdown trùng lúc) sẽ thấy
  // rvRatingPhase đã khác 'pending'/'loading' và tự thoát.
  if (attemptId !== rvAttemptId || currentTab !== 'review' || (rvRatingPhase !== 'pending' && rvRatingPhase !== 'loading')) return;
  rvClearCountdown();
  const pending = rvPendingReview;
  if (!pending) return;
  rvUserRating = chosenRating;
  rvFinalRating = chosenRating || rvSystemRating; // Quy tắc bắt buộc (Phần 9)
  rvRatingPhase = 'committing';
  render();

  const item = rvQueue.items[0];
  const w = item.word;
  const reviewPromise = submitFsrsReviewAwaited(Object.assign({
    word: w, quizType: rvQuestion.quizType, exerciseType: rvQuestion.exerciseFsrs, sessionId: rvQueue.sessionId,
    sentence: rvQuestion.sentence ? rvQuestion.sentence.zh : undefined, // V138: server tra lại câu thật để chấm
    selectedAnswer: pending.selectedAnswer,
    responseTimeMs: pending.responseTimeMs, answerChanges: pending.answerChanges,
    rating: rvFinalRating,
    exposure: rvIsIntroExposure(item) ? 'intro' : undefined, // V114: CHỈ lượt chính thức đầu tiên sau giới thiệu (V113 gắn theo `introduced` nên lượt sau cũng bị gắn nhầm)
  }, pending.parts
    // V131 2b: câu 3 phần → gửi `parts` để server chấm lại 3 phần; vẫn kèm quizType+selectedAnswer của 1 phần để server CŨ (chưa có V131) chấm được như câu 1 phần, không mất lượt.
    ? { quizType: pending.legacyQuizType, exerciseType: undefined, parts: pending.parts }
    : null)).then(data => {
    if (attemptId !== rvAttemptId || currentTab !== 'review') return;
    if (data && data.ok) {
      rvLastAnswer = { correct: data.answerCorrect, card: data.card, autoRating: data.debug ? data.debug.autoRating : null, chosen: rvLastAnswer && rvLastAnswer.chosen, multi: rvLastAnswer && rvLastAnswer.multi }; // V131: giữ kết quả 3 phần trên màn đáp án
      if (data.rating) rvFinalRating = data.rating; // server luôn là nguồn sự thật cuối (Phần 20)
    }
    rvRatingPhase = 'done';
    render();
  });
  // V114: lượt đầu sau giới thiệu ĐÃ được giao cho submitFsrsReview — hàm đó ghi outbox (write-ahead, kèm idempotencyKey + exposure) ĐỒNG BỘ trước
  // await đầu tiên, nên tới đây payload đã nằm an toàn trong outbox và việc gửi lại sẽ dùng đúng payload cũ. Tắt cờ + lưu ngay: nếu thẻ quay lại
  // hàng đợi (trả lời sai), hoặc trang bị tải lại giữa chừng, lượt sau KHÔNG bị gắn exposure:'intro' nữa.
  if (item.introExposurePending) {
    item.introExposurePending = false;
    if (!rvQueue.practiceOnly) sqPersist(rvStorageMode(), rvQueue, { summary: rvSummary, log: rvLog, learner: rvLearner });
  }
  // AUDIT V82 (Phần 2/12 — "chuyển card nhanh", "không có animation thừa"): giảm khoảng nghỉ tối
  // thiểu từ 1000ms xuống 450ms. Đây chỉ là thời gian TỐI THIỂU để user kịp thấy dòng "Đã lưu lịch
  // ôn" trước khi sang thẻ kế — KHÔNG ảnh hưởng an toàn dữ liệu (reviewPromise vẫn luôn được đợi đủ
  // qua Promise.all, có trần chờ riêng SUBMIT_REVIEW_MAX_WAIT_MS ở study-queue.js).
  await Promise.all([reviewPromise, new Promise(r => setTimeout(r, 450))]);
  if (attemptId !== rvAttemptId || currentTab !== 'review') return;
  rvRatingPhase = 'done';
  rvAdvanceQueue();
}

let rvStyleInjected = false;
function rvInjectStyle() {
  if (rvStyleInjected || typeof document === 'undefined') return;
  rvStyleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
  .rv-typed-rule{font-size:.78rem;color:var(--muted);text-align:center;margin-top:6px;line-height:1.4}
  .rv-why{font-size:.74rem;color:var(--muted);text-align:center;margin:-2px 0 6px;line-height:1.4}
  .rv-type-tag{font-size:.7rem;color:var(--muted);font-weight:700;text-align:center;margin-bottom:4px}
  .rv-cloze{font-size:1.5rem;font-weight:800;text-align:center;margin:10px 0 4px;line-height:1.5;word-break:break-word}
  .rv-cloze-vi{font-size:.9rem;color:var(--muted);text-align:center;margin-bottom:8px}
  .rv-sent{font-size:1.35rem;font-weight:800;text-align:center;margin:10px 0 4px;line-height:1.6;word-break:break-word}
  .rv-sent-block{background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin:10px 0;text-align:center}
  .rv-sent-block .rv-sent{margin:0 0 4px}
  .rv-sent-vi{font-size:.9rem;color:var(--muted);margin-bottom:8px;line-height:1.45}
  .rv-mark{background:var(--l7c,#fdebd0);color:inherit;border-radius:4px;padding:0 2px}
  .quiz-opt-sent{white-space:normal;text-align:left;line-height:1.5;font-size:.95rem}
  .rv-explain{font-size:.85rem;color:var(--muted);text-align:left;background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin:8px 0;line-height:1.5}
  .rv-start-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
  .rv-start-cell{background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}
  .rv-start-num{font-size:1.5rem;font-weight:900}.rv-start-lbl{font-size:.72rem;color:var(--muted);font-weight:700}
  .rv-match{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
  .rv-match-col{display:flex;flex-direction:column;gap:8px}
  .rv-match-btn{min-height:48px;border:2px solid var(--border);border-radius:12px;background:var(--paper);color:var(--ink);font:inherit;font-weight:700;padding:8px;cursor:pointer;word-break:break-word}
  .rv-match-btn.sel{border-color:var(--l10a,#2980b9);box-shadow:0 0 0 2px var(--l10c,#d6eaf8)}
  .rv-match-btn.done{border-color:var(--l8a,#27ae60);background:var(--l8c,#d5f5e3);opacity:.85}
  .rv-sum-table{width:100%;border-collapse:collapse;font-size:.85rem;margin:8px 0}
  .rv-sum-table td,.rv-sum-table th{padding:5px 6px;border-bottom:1px solid var(--border);text-align:left}
  .rv-sum-weak{display:flex;gap:10px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border);text-align:left}
  .rv-rating-row-2{grid-template-columns:1fr 1fr}
  .rv-rate-go{background:var(--active);border-color:var(--l8a,#27ae60);color:var(--ink)}
  .rv-rate-change{color:var(--muted)}
  .rv-correct-tip{font-size:.82rem;color:var(--muted);background:var(--paper);border:1px dashed var(--border);border-radius:10px;padding:8px 12px;margin:8px 0;line-height:1.5;text-align:left}
  .rv-leech{background:var(--paper);border:2px solid #e67e22;border-radius:12px;padding:10px 12px;margin:10px 0;text-align:left}
  .rv-leech-title{font-weight:900;font-size:.92rem}.rv-leech-sub{font-size:.78rem;color:var(--muted);margin:2px 0 4px}
  .rv-leech-list{margin:4px 0 8px;padding-left:20px;font-size:.82rem;line-height:1.5}
  .rv-leech-actions{display:flex;gap:8px;flex-wrap:wrap}
  .rv-pyq{font-size:2.2rem;font-weight:800;font-style:italic;line-height:1.2;overflow-wrap:anywhere}
  .rv-vi-main{font-size:1.3rem;margin:10px 0}
  .rv-strict-tag{font-size:.72rem;font-weight:800;color:var(--active-dark);background:var(--active-bg);border-radius:12px;padding:3px 10px;margin-bottom:4px}
  .rv-audio{display:flex;flex-direction:column;align-items:center;gap:6px}
  .rv-audio-status{font-size:.78rem;color:var(--muted);font-weight:700;min-height:1.2em}
  .rv-audio-status[data-state="blocked"]{color:#b45309}
  .rv-audio-status[data-state="done"]{color:var(--correct)}
  .rv-match-note{font-size:.8rem;color:var(--muted);font-weight:700;min-height:1.2em}`;
  document.head.appendChild(st);
}

function rvExplainHtml() {
  const q = rvQuestion;
  if (!q || q.typeId === 'hz2vi' || q.typeId === 'vi2hz') return ''; // 2 dạng này màn đáp án đã hiện đủ chữ/pinyin/nghĩa
  // V110: câu tự nhập — nói rõ bạn đã gõ gì, vì sao đúng/sai (ví dụ: đúng âm nhưng thiếu/sai thanh), và đáp án chuẩn.
  let typedLine = '';
  const t = rvLastAnswer && rvLastAnswer.typed;
  if (q.typed && t) {
    const blank = !t.value;
    typedLine = `<div><b>${blank ? 'Bạn đã bỏ qua câu này' : 'Bạn đã gõ: ' + escapeHtml(t.value)}</b>` +
      `${!blank && AM.VERDICT_TEXT[t.verdict] ? ` — ${escapeHtml(AM.VERDICT_TEXT[t.verdict])}` : ''}` +
      `${!blank && t.verdict === 'tone_mismatch' && AM.toneFeedback ? (() => { const f = AM.toneFeedback(t.value, q.correctKey); return f ? `<br>${escapeHtml(f)}` : ''; })() : ''}` + // V118: chỉ rõ âm tiết nào sai thanh
      `${t.correct ? '' : `<br>Đáp án chuẩn: ${escapeHtml(q.correctKey)}`}</div>`;
  }
  // V119: bỏ dòng "Bạn vừa nghe: …" (chữ, pinyin, nghĩa, Hán Việt đã hiện ngay phía trên nên lặp lại)
  const lines = (q.explanation || []).filter(l => !/^Bạn vừa nghe:/.test(l));
  if (!typedLine && !lines.length) return '';
  return `<div class="rv-explain">${typedLine}${lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>`;
}

function rvShowHV() { return typeof showHanViet === 'undefined' || !!showHanViet; } // V117: người học có thể ẩn Hán Việt (⚙️ Hiển thị / cài đặt khu vực học)
function rvHzHtml(hz) {
  return `<div class="rv-hz${[...String(hz || '')].length >= 5 ? ' rv-hz-long' : ''}">${escapeHtml(hz)}</div>`;
}
function rvQuestionBodyHtml(tagLabel, w) {
  const q = rvQuestion, p = q.prompt;
  // V117 — "Kiểm tra trí nhớ thực sự": không hiện pinyin ở đề khi pinyin không phải thứ đang kiểm tra; ẩn dòng "vì sao chọn dạng này".
  const strict = (typeof swStrict === 'function') && swStrict();
  // V135: 2 dòng phụ này được tính NGAY ĐẦU hàm (trước đây ở cuối) vì nhánh "Sắp xếp câu" trả về sớm cần dùng chúng.
  const strictTag = strict ? `<div class="rv-strict-tag">🧪 Kiểm tra trí nhớ thực sự${q.hinted ? ' · câu này có gợi ý nên nếu đúng sẽ được ghi là “đúng nhờ gợi ý”' : ''}</div>` : '';
  const adaptHtml = rvAdaptNote ? `<div class="rv-why">🔔 ${escapeHtml(rvAdaptNote)}</div>` : ''; // V128 giai đoạn 3
  const whyHtml = adaptHtml + ((q.why && !strict) ? `<div class="rv-why">💡 ${escapeHtml(q.why)}</div>` : '');
  let stem;
  if (p.kind === 'audio') {
    // Khu vực âm thanh nổi bật + nút nghe lại + dòng trạng thái (đã phát / bị chặn). Không tự phát lặp.
    // V138: audioText có thể là CẢ CÂU (nghe câu → chọn nghĩa), không chỉ một từ.
    const audioText = p.audioText || w.hz;
    stem = `<div class="rv-audio">
        <button id="rv-play" class="listen-play" onclick="swPlayTracked('${escapeJsAttr(audioText)}')" title="Nghe lại" aria-label="Nghe lại">🔊</button>
        <div id="rv-audio-status" class="rv-audio-status" role="status" aria-live="polite">Chưa phát — bấm 🔊 để nghe</div>
      </div>
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (p.kind === 'sent') {
    // V138: đề là 1 câu chữ Hán (đọc hiểu) hoặc nghĩa tiếng Việt của CẢ CÂU. Không hiện nghĩa khi đề là câu Hán.
    const isZh = /[一-鿿]/.test(String(p.main || ''));
    stem = isZh
      ? `<div class="rv-sent">${escapeHtml(p.main)}</div><div class="rv-prompt">${escapeHtml(p.ask)}</div>`
      : `<div class="rv-vi rv-vi-main">${escapeHtml(p.main || '')}</div><div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (p.kind === 'sentWord') {
    // V138: chọn câu CÓ dùng từ đang học — đề hiện từ (chữ Hán + nghĩa), đáp án là cả câu.
    stem = `${rvHzHtml(w.hz)}
      ${(showPinyin && !strict) ? `<div class="rv-py">${escapeHtml(w.py || '')}</div>` : ''}
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (p.kind === 'order') {
    // V135: "Sắp xếp câu" — đề + các mảnh xáo trộn; trình duyệt chấm tức thời rồi báo lên server (server chấm lại).
    return `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-type-tag">${escapeHtml(QE.TYPES[q.typeId].label)}</div>
      ${strictTag}${whyHtml}
      ${typeof OS_UI !== 'undefined' ? OS_UI.playHtml(q) : '<div class="rv-prompt">Thiếu thư viện sắp xếp câu.</div>'}`;
  } else if (p.kind === 'cloze') {
    stem = `<div class="rv-cloze">${escapeHtml(p.main)}</div>
      ${p.sub ? `<div class="rv-cloze-vi">${escapeHtml(p.sub)}</div>` : ''}
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (q.typeId === 'hz2vi') {
    stem = `${rvHzHtml(w.hz)}
      ${(showPinyin && !strict) ? `<div class="rv-py">${escapeHtml(w.py || '')}</div>` : ''}
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (q.typeId === 'hz2py' || q.typeId === 'hz2hv') {
    // Chọn pinyin / Hán Việt: KHÔNG hiện pinyin của từ ở đề dù người dùng đang bật "Hiện Pinyin" (sẽ lộ đáp án).
    stem = `${rvHzHtml(w.hz)}<div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else if (q.typeId === 'py2hz' || q.typeId === 'py2vi') {
    stem = `<div class="rv-pyq">${escapeHtml(p.main || '')}</div>
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  } else {
    stem = `<div class="rv-vi rv-vi-main">${escapeHtml(p.main || '')}</div>
      ${p.sub ? `<div class="rv-cloze-vi">${escapeHtml(p.sub)}</div>` : ''}
      <div class="rv-prompt">${escapeHtml(p.ask)}</div>`;
  }
  if (q.typed) { // V110: câu TỰ NHẬP — không có nút lựa chọn
    const isPy = q.typed === 'py';
    return `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-type-tag">${escapeHtml(QE.TYPES[q.typeId].label)}</div>
      ${strictTag}${whyHtml}
      ${stem}
      <input id="rv-typed" class="type-input" type="text" inputmode="text" enterkeyhint="done"
             ${isPy ? 'lang="vi"' : 'lang="zh-CN"'} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="${isPy ? 'Gõ pinyin, ví dụ: nǐ hǎo hoặc ni3 hao3' : 'Gõ chữ Hán (dùng bàn phím tiếng Trung)'}"
             onkeydown="if(event.key==='Enter'){event.preventDefault();rvSubmitTyped(false)}" ${rvSubmitting ? 'disabled' : ''}>
      <div class="rv-typed-rule">${isPy
        ? 'Quy tắc chấm: cần dấu thanh (ǎ) hoặc số thanh (a3). Không phân biệt hoa/thường và khoảng trắng. Gõ thiếu thanh điệu sẽ <b>không</b> được tính đúng.'
        : 'Quy tắc chấm: phải đúng từng chữ (không phân biệt giản/phồn). Khoảng trắng và dấu câu thừa được bỏ qua.'}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
        <button class="btn btn-primary" onclick="rvSubmitTyped(false)">Kiểm tra</button>
        <button class="btn" style="background:var(--border)" onclick="rvSubmitTyped(true)">Bỏ qua</button>
      </div>`;
  }
  const opts = q.options.map(o =>
    `<button class="quiz-opt${q.sentence ? ' quiz-opt-sent' : ''}" data-v="${escapeHtml(o.key)}" onclick="rvPick(this)" ${rvSubmitting ? 'disabled' : ''}>${escapeHtml(o.label)}</button>`
  ).join('');
  return `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-type-tag">${escapeHtml(QE.TYPES[q.typeId].label)}</div>
      ${strictTag}${whyHtml}
      ${stem}
      <div class="quiz-opts" id="rv-opts">${opts}</div>
      <div class="kbd-hint" style="text-align:center;margin-top:2px;">⌨️ 1-4 để chọn</div>`;
}

// V115: khối hiện trên màn đáp án khi trả lời SAI thẻ chính thức. Từ thường: 1 dòng nhắc đúng việc cần làm. Từ cứng đầu: đổi cách học
// (lặp lại y nguyên đã không hiệu quả) — dùng đúng thứ có sẵn: chiết tự, Hán Việt, nét chữ. (V116: bỏ "mẹo tự viết" — tính năng mẹo nhớ đã gỡ khỏi giao diện.)
function rvCorrectionHtml(w, r) {
  const info = rvLeechInfo(w, r && r.card);
  const hz = escapeJsAttr(w.hz);
  if (!info.isLeech) {
    return ''; // V119: không hiện dòng nhắc cho từ thường để màn đáp án gọn (từ vẫn được hỏi lại như cũ)
  }
  const why = info.lapses >= RV_LEECH_LAPSES ? `đã quên ${info.lapses} lần theo lịch ôn` : `sai ${info.wrongNow} lần trong buổi này`;
  const tips = [
    w.hanviet ? `Nối với âm Hán Việt <b>${escapeHtml(w.hanviet)}</b>: tự đặt một câu/hình ảnh có từ này.` : 'Tách chữ thành các phần ở trên, gắn mỗi phần với một hình ảnh.',
    'Đọc to từ này 3 lần, vừa đọc vừa nhìn chữ — nghe + nhìn cùng lúc nhớ chắc hơn chỉ nhìn.',
    'Xem nét viết và tập viết lại một lần: viết giúp ghi nhớ hình chữ.',
  ];
  return `<div class="rv-leech">
    <div class="rv-leech-title">🧲 Từ cứng đầu — ${why}</div>
    <div class="rv-leech-sub">Lặp lại y nguyên chưa hiệu quả. Thử đổi cách:</div>
    <ol class="rv-leech-list">${tips.map(t => `<li>${t}</li>`).join('')}</ol>
    <div class="rv-leech-actions">
      <button class="btn btn-sm" onclick="strokeOpen('${hz}')">✏️ Xem nét viết</button>
    </div></div>`;
}
// V119: nút "🤖 Hỏi AI" ở câu SAI (xem js/ai-explain.js). Rỗng nếu đúng / chưa đăng nhập / module chưa nạp.
function rvAiHtml(w, r) {
  if (!r || r.correct || r.multi || typeof aiExBlockHtml !== 'function') return ''; // V131: câu 3 phần không có 1 đáp án "đã chọn" duy nhất để hỏi AI
  return aiExBlockHtml(w, { typeId: rvQuestion && rvQuestion.typeId, chosen: r.chosen });
}
// V115: học riêng các từ cứng đầu (lọc từ danh sách "hay quên" của server theo số lần quên thật).
function startLeechSession() { rvLeechOnly = true; rvLeechMode = true; return startStudySession(true, true); }

function rvIntroHtml(tagLabel, w) {
  const ex = rvFindExample(w.hz);
  const audioOk = (typeof skillAudioAvailable === 'function') && skillAudioAvailable();
  return `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-type-tag">Xem kỹ từ mới trước khi được hỏi</div>
      <div class="rv-hz">${escapeHtml(w.hz)}</div>
      <div class="rv-py">${escapeHtml(w.py || '')}</div>
      ${typeof wiSlot === 'function' ? wiSlot(w.hz) : ''}
      <div class="rv-vi">${escapeHtml(w.vi || '')}</div>
      ${(w.hanviet && rvShowHV()) ? `<div class="rv-hv">Hán Việt: ${escapeHtml(w.hanviet)}</div>` : ''}
      ${audioOk ? `<button id="rv-play" class="btn btn-sound btn-sm" onclick="speak('${escapeJsAttr(w.hz)}')">🔊 Nghe</button>` : ''}
      ${renderHanziParts(w.hz, false, true)}
      ${ex ? `<div class="rv-ex">${escapeHtml(ex.zh)}<br><span style="color:var(--muted);font-size:.85rem;">${escapeHtml(ex.vi || '')}</span></div>` : ''}
      <div style="text-align:center;margin-top:14px"><button class="btn btn-primary" onclick="rvIntroDone()">Đã xem — kiểm tra ngay</button></div>`;
}

function rvMatchHtml(tagLabel) {
  const st = rvMatch, m = st.m;
  const leftBtns = m.lefts.map((hz, i) => {
    const cls = st.solved.has(hz) ? ' done' : (st.selected === hz ? ' sel' : (st.flash && st.flash.hz === hz ? ' bad' : ''));
    // V133: ghép nghe ↔ chữ Hán — bên trái là nút 🔊 (không lộ chữ Hán); ghép đúng rồi mới hiện chữ.
    const label = m.kind === 'listen' ? (st.solved.has(hz) ? `✓ ${hz}` : `🔊 ${i + 1}`) : hz;
    return `<button class="rv-match-btn${cls}" ${st.solved.has(hz) || st.done ? 'disabled' : ''} onclick="rvMatchPick('L',${i})">${escapeHtml(label)}</button>`;
  }).join('');
  const rightBtns = m.rights.map((r, i) => {
    const cls = st.solvedRights.has(r) ? ' done' : (st.flash && st.flash.right === r ? ' bad' : '');
    return `<button class="rv-match-btn${cls}" ${st.solvedRights.has(r) || st.done ? 'disabled' : ''} onclick="rvMatchPick('R',${i})">${escapeHtml(r)}</button>`;
  }).join('');
  const wrongN = st.wrong.size;
  return `
      <div class="rv-tag">${tagLabel}</div>
      <div class="rv-type-tag">Ghép cặp</div>
      <div class="rv-prompt">${m.kind === 'listen' ? 'Nghe rồi ghép với chữ Hán tương ứng' : `Ghép chữ Hán với ${m.kind === 'vi' ? 'nghĩa' : (m.kind === 'hv' ? 'âm Hán Việt' : 'Pinyin')} tương ứng`}</div>
      ${st.flash ? '<div class="rv-match-note" role="status">❌ Chưa đúng — chọn lại chữ Hán rồi thử cặp khác</div>' : (st.selected ? (m.kind === 'listen' ? '<div class="rv-match-note" role="status">Đã phát âm — chạm chữ Hán bên phải (chạm lại 🔊 để nghe lại)</div>' : '<div class="rv-match-note" role="status">Đã chọn 1 chữ Hán — chạm đáp án bên phải (chạm lại chữ để bỏ chọn)</div>') : '')}
      <div class="rv-match"><div class="rv-match-col">${leftBtns}</div><div class="rv-match-col">${rightBtns}</div></div>
      ${st.done
        ? `<div class="rv-feedback" style="color:${wrongN ? 'var(--l10a)' : 'var(--l8a)'}">${wrongN ? `Ghép xong · ${wrongN} cặp cần xem lại` : '✅ Ghép đúng hết'}</div>
           <div style="text-align:center;margin-top:10px"><button class="btn btn-primary" onclick="rvMatchContinue()">Tiếp tục</button></div>`
        : `<div class="kbd-hint" style="text-align:center">${m.kind === 'listen' ? 'Chạm 🔊 bên trái để nghe, rồi chạm chữ Hán bên phải' : 'Chạm 1 chữ Hán bên trái, rồi chạm đáp án bên phải'}</div>`}`;
}

// V128 (giai đoạn 1): kế hoạch ưu tiên theo năng lực — dùng đúng công thức của màn "Phân tích năng lực" (js/training-plan.js, gọi thẳng QS nên
// khớp bộ chọn câu hỏi). CHỈ HIỂN THỊ: không đổi câu hỏi, không đổi lịch FSRS. Thiếu module/số liệu hoặc lỗi → không hiện gì (không chặn màn bắt đầu).
function rvPlanHtml() {
  if (typeof TP === 'undefined') return '';
  try {
    const probeCount = (rvQueue && Array.isArray(rvQueue.items)) ? rvQueue.items.filter(it => it && it.probe === 'typed').length : 0;
    const extraBySkill = {}; // V128: số câu luyện thêm theo kế hoạch THẬT đang có trong hàng đợi, theo kỹ năng
    for (const it of (rvQueue && Array.isArray(rvQueue.items) ? rvQueue.items : [])) if (it && it.type === 'extra' && it.fromPlan && it.targetSkill) extraBySkill[it.targetSkill] = (extraBySkill[it.targetSkill] || 0) + 1;
    const d = TP.describe(TP.build(rvLearner, { typedEnabled: rvTypedEnabled() }), { probeCount, extraBySkill });
    if (!d.headline) return '';
    return `<div class="rv-explain" style="text-align:left"><div>🎯 <b>${escapeHtml(d.headline)}</b></div>${d.lines.map(l => `<div style="margin-top:3px">${escapeHtml(l)}</div>`).join('')}</div>`;
  } catch { return ''; }
}

function rvStartHtml() {
  const i = rvStartInfo;
  const cell = (n, l) => `<div class="rv-start-cell"><div class="rv-start-num">${n}</div><div class="rv-start-lbl">${l}</div></div>`;
  const lessons = !i.lessons.length ? 'Phạm vi đang chọn'
    : (i.lessons.length <= 8 ? `Bài ${i.lessons.join(', ')}` : `Bài ${i.lessons.slice(0, 8).join(', ')} +${i.lessons.length - 8} bài khác`);
  return `<div class="rv-card">
    <div class="rv-tag">🎓 Hôm nay học</div>
    <div style="font-size:1.2rem;font-weight:800;margin:6px 0">${escapeHtml(lessons)}</div>
    <div class="rv-start-grid">
      ${cell(i.newCount, 'Từ mới')}
      ${cell(i.reviewCount, 'Thẻ đến hạn ôn (FSRS)')}
      ${i.extraCount > 0 ? cell(i.extraCount, 'Từ cần luyện thêm') : ''}
      ${cell('~' + i.estimated, 'Số câu dự kiến')}
    </div>
    ${rvBlockedByBacklog ? `<div class="rv-explain">⏳ Đang có ${rvTotalDue} thẻ cần ôn, nên hệ thống tạm chặn học thêm từ mới cho đến khi ôn hết.</div>` : ''}
    ${rvCapOffSkipped > 0 ? `<div class="rv-explain" role="alert">⚠️ Cài đặt “Số thẻ tối đa mỗi buổi học” đang là <b>Tắt</b> nên ${rvCapOffSkipped} thẻ ôn/từ mới KHÔNG được đưa vào buổi này (chỉ còn câu luyện bổ sung).<div style="text-align:center;margin-top:8px"><button class="btn btn-primary" onclick="rvEnableOfficialCards()">Bật lại thẻ ôn tập</button></div></div>` : ''}
    ${rvPlanHtml()}
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px">
      <button class="btn btn-primary" onclick="rvBeginSession()">▶️ Bắt đầu học</button>
      ${i.extraCount > 0 ? `<button class="btn" onclick="rvStartWeakPractice()">🎯 Chỉ luyện từ hay sai</button>` : ''}
      <button class="btn" style="background:var(--border)" onclick="goTab('today')">Quay lại</button>
    </div>
  </div>`;
}

function rvSummaryHtml() {
  const total = rvLog.length;
  const right = rvLog.filter(e => e.correct).length;
  const acc = total ? Math.round((right / total) * 100) : 0;
  const end = rvQueue.endTime || Date.now();
  const mins = rvQueue.startTime ? Math.max(1, Math.round((end - rvQueue.startTime) / 60000)) : null;
  const typeLabel = (id) => id === 'match' ? 'Ghép cặp' : ((QE.TYPES[id] || {}).label || id);
  const byType = {};
  for (const e of rvLog) { const b = byType[e.typeId] || (byType[e.typeId] = { n: 0, ok: 0 }); b.n++; if (e.correct) b.ok++; }
  const typeRows = Object.keys(byType).map(id => `<tr><td>${escapeHtml(typeLabel(id))}</td><td>${byType[id].ok}/${byType[id].n}</td><td>${Math.round(byType[id].ok / byType[id].n * 100)}%</td></tr>`).join('');
  // V118 — thống kê theo kỹ năng tính bằng SM.summarize (js/session-summary.js): tách số câu / số từ duy nhất, loại câu vừa xem đáp án
  // (check/redo/lượt đầu sau giới thiệu) khỏi bằng chứng kỹ năng, và chỉ kết luận khi đủ câu + đủ số từ khác nhau.
  const SMY = SM.summarize(rvLog);
  const SK = SM.SKILL_NAME;
  const LEVEL_TXT = { insufficient: 'Chưa đủ dữ liệu', developing: 'Đang hình thành', good: 'Khá tốt trong buổi này', weak: 'Cần luyện thêm' };
  const skillKeys = Object.keys(SMY.skills);
  const weakSkills = skillKeys.filter(k => SMY.skills[k].level === 'weak').map(k => SK[k] || k);
  const skillRows = skillKeys.map(k => { const x = SMY.skills[k]; return `<tr><td>${escapeHtml(SK[k] || k)}</td><td>${x.answers} câu / ${x.words} từ</td><td>${x.enough ? Math.round(x.rate * 100) + '%' : '—'}</td><td>${escapeHtml(LEVEL_TXT[x.level])}</td></tr>`; }).join('');
  const wordChips = (list) => list.slice(0, 8).map(hz => escapeHtml(hz)).join('　');
  // Từ cần ôn lại: từ có lần trả lời CUỐI CÙNG trong buổi là sai.
  const last = new Map();
  for (const e of rvLog) last.set(e.hz, e);
  const wrongWords = [...last.values()].filter(e => !e.correct);
  const weakHtml = wrongWords.slice(0, 8).map(e => {
    const w = WORDS.find(x => x.hz === e.hz && x.l === e.l) || WORDS.find(x => x.hz === e.hz) || { hz: e.hz };
    return `<div class="rv-sum-weak"><b style="font-size:1.2rem">${escapeHtml(w.hz)}</b><span style="color:var(--muted)">${escapeHtml(w.py || '')}</span><span>${escapeHtml(w.vi || '')}</span></div>`;
  }).join('');
  // V117 — số liệu phiên MỞ RỘNG (đều tính từ nhật ký phiên rvLog, không bịa):
  //   • đúng LẦN ĐẦU = lần hỏi đầu tiên của mỗi từ trong buổi; câu đúng nhờ gợi ý tính riêng (không gộp vào "đúng ngay lần đầu").
  const firstByHz = new Map();
  for (const e of rvLog) if (!firstByHz.has(e.hz)) firstByHz.set(e.hz, e);
  const wordsPracticed = firstByHz.size;
  const firstClean = [...firstByHz.values()].filter(e => e.correct && !e.hinted).length;
  const firstHinted = [...firstByHz.values()].filter(e => e.correct && e.hinted).length;
  const officialN = rvLog.filter(e => e.official).length;
  const ctxLog = rvLog.filter(e => e.skill === 'context');
  // Từ cần chú ý: sai ≥ 2 lần trong buổi, hoặc lần trả lời cuối vẫn sai (đã có ở wrongWords).
  const wrongCount = new Map();
  for (const e of rvLog) if (!e.correct) wrongCount.set(e.hz, (wrongCount.get(e.hz) || 0) + 1);
  const attentionHz = new Set([...wrongCount].filter(([, n]) => n >= 2).map(([hz]) => hz));
  // Đề xuất luyện tiếp: CHỈ dựa vào dữ liệu của buổi (SM.tipsFrom) — không đủ dữ liệu thì nói rõ cần thêm gì.
  const nextTips = SMY.tips.map(t => t.text);
  const counts = (rvSummary.reviewCount || rvSummary.newCount) ? `Đã ôn ${rvSummary.reviewCount} từ, học ${rvSummary.newCount} từ mới.` : '';
  return `<div class="rv-done" style="text-align:left">
    <div style="text-align:center"><div class="rv-done-num">🎉</div>
    <div style="font-size:1.3rem;font-weight:800;margin:10px 0;">Tổng kết buổi học</div>
    ${counts ? `<div style="color:var(--muted);margin-bottom:10px;">${counts}</div>` : ''}</div>
    <div style="font-weight:800;margin-top:2px">1 · Kết quả buổi học này</div>
    <div class="rv-start-grid">
      <div class="rv-start-cell"><div class="rv-start-num">${total}</div><div class="rv-start-lbl">Câu đã hoàn thành</div></div>
      <div class="rv-start-cell"><div class="rv-start-num">${firstClean}/${wordsPracticed}</div><div class="rv-start-lbl">Từ đúng ngay lần đầu${firstHinted ? ` (+${firstHinted} nhờ gợi ý)` : ''}</div></div>
      <div class="rv-start-cell"><div class="rv-start-num">${right} / ${total - right}</div><div class="rv-start-lbl">Câu đúng / sai</div></div>
      <div class="rv-start-cell"><div class="rv-start-num">${wordsPracticed}</div><div class="rv-start-lbl">Số từ đã luyện</div></div>
      <div class="rv-start-cell"><div class="rv-start-num">${acc}%</div><div class="rv-start-lbl">Tỉ lệ đúng trong buổi</div></div>
      <div class="rv-start-cell"><div class="rv-start-num">${mins == null ? '—' : mins + ' phút'}</div><div class="rv-start-lbl">Thời gian học</div></div>
    </div>
    <div style="font-size:.85rem;margin:2px 0 6px"><b>Lượt ôn chính thức:</b> ${SMY.officialAnswers} · <b>Luyện bổ sung:</b> ${SMY.practiceAnswers}</div>
    <div style="font-weight:800;margin-top:6px">Kết quả theo dạng bài</div>
    <table class="rv-sum-table"><tr><th>Dạng bài</th><th>Đúng</th><th>Tỉ lệ</th></tr>${typeRows}</table>
    <div style="font-weight:800">Kỹ năng trong buổi này</div>
    ${skillRows ? `<table class="rv-sum-table"><tr><th>Kỹ năng</th><th>Đã hỏi</th><th>Đúng</th><th>Đánh giá</th></tr>${skillRows}</table>` : ''}
    <div style="font-size:.8rem;color:var(--muted);margin:2px 0 8px">Chỉ kết luận khi có ≥ ${SM.MIN_ANSWERS} câu từ ≥ ${SM.MIN_WORDS} từ khác nhau; không tính câu vừa xem đáp án (kiểm tra sau giới thiệu, luyện lại).${weakSkills.length ? ` Cần luyện thêm: ${escapeHtml(weakSkills.join(', '))}.` : ''}</div>
    ${SMY.recognizedNotRecalled.length ? `<div style="font-weight:800">Nhận diện được nhưng chưa tự nhớ (${SMY.recognizedNotRecalled.length})</div><div style="font-size:1rem;margin:4px 0 8px">${wordChips(SMY.recognizedNotRecalled)}</div>` : ''}
    ${SMY.listeningWeak.length ? `<div style="font-weight:800">Nghe chưa tốt (${SMY.listeningWeak.length})</div><div style="font-size:1rem;margin:4px 0 8px">${wordChips(SMY.listeningWeak)}</div>` : ''}
    ${SMY.pinyinWeak.length ? `<div style="font-weight:800">Pinyin / thanh điệu chưa tốt (${SMY.pinyinWeak.length})</div><div style="font-size:1rem;margin:4px 0 8px">${wordChips(SMY.pinyinWeak)}</div>` : ''}
    <div style="font-weight:800">Từ cần ôn lại ${wrongWords.length ? `(${wrongWords.length})` : ''}</div>
    ${weakHtml || '<div style="color:var(--muted);font-size:.9rem;margin:4px 0 8px">Không có từ nào sai ở lần trả lời cuối.</div>'}
    ${attentionHz.size ? `<div style="font-weight:800;margin-top:6px">Từ cần chú ý (sai từ 2 lần trong buổi)</div><div style="font-size:1rem;margin:4px 0 8px">${[...attentionHz].slice(0, 10).map(hz => escapeHtml(hz)).join('　')}</div>` : ''}
    <div class="rv-explain">Tỉ lệ đúng trong một buổi chỉ cho biết bạn làm bài ra sao hôm nay — chưa phải mức độ ghi nhớ lâu dài.</div>
    <div style="font-weight:800;margin-top:8px">2 · Ghi nhớ qua nhiều lần kiểm tra</div>
    <div class="rv-explain">Buổi này có <b>${officialN}</b> lượt ôn chính thức đã được ghi vào lịch FSRS (các câu luyện bổ sung không đổi lịch). Một buổi học không đủ để kết luận bạn đã thuộc từ — độ nhớ dài hạn do lịch FSRS theo dõi qua nhiều ngày; xem ở tab <b>Tiến bộ</b>.</div>
    <div style="font-weight:800">3 · Vận dụng trong ngữ cảnh</div>
    <div class="rv-explain">${ctxLog.length ? `Câu điền từ vào câu: đúng ${ctxLog.filter(e => e.correct).length}/${ctxLog.length}${ctxLog.length < 3 ? ' (còn ít câu — chưa đủ để kết luận)' : ''}.` : 'Buổi này chưa có câu điền từ vào câu nên chưa có dữ liệu về khả năng dùng từ trong ngữ cảnh.'}</div>
    <div style="font-weight:800">Gợi ý luyện tiếp</div>
    <ul class="rv-leech-list">${nextTips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:10px">
      ${wrongWords.length ? `<button class="btn btn-primary" onclick="rvStartRedoWrong()">🔁 Luyện lại câu sai</button>` : ''}
      <button class="btn ${wrongWords.length ? '' : 'btn-primary'}" onclick="${(typeof rvLeechMode !== 'undefined' && rvLeechMode) ? 'startLeechSession()' : `startStudySession(${rvWeakMode}, true)`}">▶️ Học tiếp</button>
      <button class="btn" onclick="rvRelearnFromStart()">🔁 Học lại từ đầu</button>
      <button class="btn" style="background:var(--border)" onclick="goTab('today')">✅ Kết thúc buổi học</button>
    </div>
  </div>`;
}

function renderReview() {
  rvInjectStyle();
  if (rvStage === 'start' && rvStartInfo) return rvStartHtml();
  if (!rvQueue.items.length) {
    // FIX (audit — màn "Xong phiên học! Đã ôn 0 từ, học 0 từ mới" gây hiểu lầm là lỗi): tách riêng
    // "chưa từng có gì để học" (kèm lý do cụ thể) khỏi "đã thật sự học xong 1 phiên có thẻ".
    if (rvLog.length === 0 && rvSummary.reviewCount === 0 && rvSummary.newCount === 0) {
      const reason = rvCapOffSkipped > 0
        ? `⚠️ Cài đặt “Số thẻ tối đa mỗi buổi học” đang là Tắt nên ${rvCapOffSkipped} thẻ ôn/từ mới không được đưa vào buổi học.`
        : (rvBlockedByBacklog
          ? `⏳ Phạm vi đang chọn có ${rvTotalDue} thẻ CẦN ÔN đến hạn, nhiều hơn số lượt ôn còn lại hôm nay — hệ thống đang chặn học từ mới cho tới khi ôn bớt backlog này`
          : `Không có thẻ nào đến hạn ôn hoặc còn trong ngân sách từ mới hôm nay ở phạm vi Quyển/bài đang chọn.`);
      return `<div class="rv-done">
        <div class="rv-done-num">📭</div>
        <div style="font-size:1.3rem;font-weight:800;margin:10px 0;">Chưa có gì để học</div>
        <div style="color:var(--muted);margin-bottom:20px;">${reason}</div>
        ${rvCapOffSkipped > 0 ? `<button class="btn btn-primary" style="margin-bottom:10px" onclick="rvEnableOfficialCards()">Bật lại thẻ ôn tập</button><br>` : ''}
        <button class="btn btn-primary" onclick="goTab('today')">Về Hôm nay học</button>
      </div>`;
    }
    return rvSummaryHtml();
  }
  const item = rvQueue.items[0];
  const w = item.word || { hz: '', py: '', vi: '', l: 0 };
  const official = rvQueue.items.filter(rvIsOfficial).length;
  const pct = Math.min(100, Math.round((rvQueue.answeredCount / (rvQueue.totalPlanned || 1)) * 100));
  const practice = rvIsPractice(item);
  const tagLabel = rvStageLabel(item);
  let body;
  if (rvPhase === 'intro') {
    body = rvIntroHtml(tagLabel, w);
  } else if (rvPhase === 'match' && rvMatch) {
    body = rvMatchHtml(tagLabel);
  } else if (rvPhase === 'question' && rvQuestion) {
    body = (rvMulti && typeof rvmBodyHtml === 'function') ? rvmBodyHtml(tagLabel, w) : rvQuestionBodyHtml(tagLabel, w);
  } else if (practice) {
    // Màn đáp án của câu LUYỆN BỔ SUNG: không có thanh đánh giá FSRS (đây không phải lượt FSRS).
    const r = rvLastAnswer;
    const exD = rvFindExample(w.hz);
    body = `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-hz">${escapeHtml(w.hz)}</div>
      <div class="rv-feedback" style="color:${r && r.correct ? 'var(--l8a)' : 'var(--l10a)'};">
        ${(r && r.multi && typeof rvmFeedback === 'function') ? rvmFeedback(r) : (r && r.correct ? '✅ Chính xác' : '❌ Chưa đúng — xem lại và thử lại sau ít câu')}
      </div>
      ${(r && r.multi && typeof rvmResultHtml === 'function') ? rvmResultHtml(r) : ''}
      ${(r && r.order) ? `<div class="os-key">${escapeHtml(r.order.sentence)}</div>` : ''}
      ${rvSentenceBlockHtml()}
      <div class="rv-py">${escapeHtml(w.py || '')}</div>
      ${typeof wiSlot === 'function' ? wiSlot(w.hz) : ''}
      ${showMeaning ? `<div class="rv-vi">${escapeHtml(w.vi || '')}</div>` : ''}
      ${(w.hanviet && rvShowHV()) ? `<div class="rv-hv">Hán Việt: ${escapeHtml(w.hanviet)}</div>` : ''}
      ${renderHanziParts(w.hz, false, true)}
      ${rvExplainHtml()}
      ${rvAiHtml(w, r)}
      ${(exD && !(rvQuestion && rvQuestion.typeId === 'cloze')) ? `<div class="rv-ex">${escapeHtml(exD.zh)}<br><span style="color:var(--muted);font-size:.85rem;">${escapeHtml(exD.vi || '')}</span></div>` : ''}
      <div style="text-align:center;margin-top:12px"><button class="btn btn-primary" onclick="rvPracticeContinue()">Tiếp tục</button></div>`;
  } else {
    // Đã có kết quả trắc nghiệm: lộ đáp án đầy đủ + bổ sung "Highlight System Rating" — hiện lại 4
    // nút Again/Hard/Good/Easy, highlight nút hệ thống đề xuất, cho user xác nhận/đổi trước khi
    // commit thật lên FSRS (thay cho hành vi 100% tự động của V67).
    const r = rvLastAnswer;
    const ex = rvFindExample(w.hz);
    // Ở màn "kết quả" của "Hôm nay học", Pinyin và Hán Việt LUÔN hiện để củng cố trí nhớ ngay sau khi biết đáp án.
    let savedLine = '';
    if (rvRatingPhase === 'committing') savedLine = `<div class="rv-saved-line">⏳ Đang lưu...</div>`;
    else if (rvRatingPhase === 'done') savedLine = `<div class="rv-saved-line">${rvSavedLine(r)}</div>`;
    body = `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-hz">${w.hz}</div>
      <div class="rv-feedback" style="color:${r && r.correct ? 'var(--l8a)' : 'var(--l10a)'};">
        ${(r && r.multi && typeof rvmFeedback === 'function') ? rvmFeedback(r) : (r && r.correct ? '✅ Chính xác' : '❌ Chưa đúng')}
      </div>
      ${(r && r.multi && typeof rvmResultHtml === 'function') ? rvmResultHtml(r) : ''}
      ${rvSentenceBlockHtml()}
      <div class="rv-py">${w.py || ''}</div>
      ${typeof wiSlot === 'function' ? wiSlot(w.hz) : ''}
      ${showMeaning ? `<div class="rv-vi">${w.vi || ''}</div>` : ''}
      ${(w.hanviet && rvShowHV()) ? `<div class="rv-hv">Hán Việt: ${w.hanviet}</div>` : ''}
      ${renderHanziParts(w.hz, false, true)}
      ${rvExplainHtml()}
      ${r && !r.correct ? rvCorrectionHtml(w, r) : ''}
      ${rvAiHtml(w, r)}
      ${(ex && !(rvQuestion && rvQuestion.typeId === 'cloze')) ? `<div class="rv-ex">${ex.zh}<br><span style="color:var(--muted);font-size:.85rem;">${ex.vi}</span></div>` : ''}
      ${rvRenderRatingBar()}
      ${savedLine}
      ${(isAdminRole() && r && r.autoRating) ? `<div class="rv-saved-line">🐞 debug: auto rating = ${r.autoRating}</div>` : ''}`;
  }
  // V117: thay thanh tiến độ bằng 1 dòng chữ "Từ mới 2/70 · Ôn 20/30" để nhường chỗ cho vùng học.
  // Đã xong = tổng dự kiến (rvSummary) − số thẻ chính thức CÒN trong hàng đợi (thẻ sai quay lại hàng đợi vẫn tính 1 lần;
  // thẻ mới đang ở câu 'check' vẫn tính là còn). Không thêm dữ liệu lưu mới → phiên đã lưu từ V116 vẫn hiển thị đúng.
  const newTotal = rvSummary.newCount || 0, revTotal = rvSummary.reviewCount || 0;
  const newLeft = rvQueue.items.filter(it => it.type === 'new' || (it.type === 'check' && it.origType === 'new')).length;
  const revLeft = rvQueue.items.filter(it => it.type === 'review').length;
  const newDone = Math.max(0, newTotal - newLeft), revDone = Math.max(0, revTotal - revLeft);
  // Mỗi mục = icon + chữ (.rv-ct-t). Khi hàng hẹp, CSS (container query) ẩn chữ, chỉ còn icon + số.
  const ct = (icon, text, val) => `<span class="rv-ct">${icon}${text ? `<span class="rv-ct-t"> ${text}</span>` : ''}${val != null ? ` <b>${val}</b>` : ''}</span>`;
  const parts = [];
  if (newTotal > 0) parts.push(ct('🆕', 'Từ mới', `${Math.min(newDone, newTotal)}/${newTotal}`));
  if (revTotal > 0) parts.push(ct('🔁', 'Ôn', `${Math.min(revDone, revTotal)}/${revTotal}`));
  if (!parts.length) parts.push(ct('📋', `Câu ${rvQueue.answeredCount + 1} · còn ${official} thẻ`, null));
  const cur = rvQueue.items[0];
  if (cur && cur.word && cur.word.l != null) parts.push(ct('📖', '', escapeHtml(lessonName(cur.word.l)))); // V117: bài của từ đang học
  if (rvPhase === 'intro') parts.push(ct('👀', 'xem kỹ từ mới', null));
  else if (practice || rvPhase === 'match') parts.push(ct('📝', 'luyện bổ sung · không tính vào lịch ôn', null));
  const counter = parts.join('');
  const headAct = (typeof swHeadActionsHtml === 'function') ? swHeadActionsHtml() : '';
  return `
    <div class="rv-card" data-phase="${rvPhase}" data-ans="${(rvPhase === 'intro' || rvPhase === 'match' || rvPhase === 'question') ? '' : '1'}" data-q="${rvPhase === 'match' ? 'match' : (rvQuestion ? rvQuestion.typeId : '')}" data-kind="${(rvPhase === 'question' && rvQuestion && rvQuestion.prompt) ? rvQuestion.prompt.kind : ''}"><div class="rv-head"><div class="rv-counter rv-counter-line" role="status" aria-live="polite">${counter}</div><div class="rv-head-act">${headAct}</div></div><div class="rv-body">${body}</div></div>
  `;
}

// Đánh dấu đáp án đúng lên từng nút NGAY SAU KHI render xong (Phần 17), giống cách bindQuiz đang
// làm cho tab Trắc nghiệm — để rvPick() biết ngay đáp án vừa chọn đúng hay sai mà không cần chờ
// server trả lời (server vẫn là nguồn sự thật cuối cùng, việc này chỉ để phản hồi UI tức thời).
function bindReview() {
  if (rvStage === 'start' || !rvQueue.items.length) return;
  if (typeof wiMount === 'function') wiMount(document.querySelector('.rv-body')); // V142: ảnh gợi nhớ (nếu đã có) — màn từ mới + màn đáp án
  // V143: tải trước ảnh của thẻ kế tiếp để mở thẻ sau là có ảnh ngay (không tải lại ảnh đã có trong cache).
  if (typeof wiPrefetch === 'function') { const nx = rvQueue.items[1]; if (nx && nx.word) wiPrefetch(nx.word.hz); }
  if (rvPhase === 'intro') {
    // Từ mới: tự phát âm khi có giọng đọc (nếu không có giọng thì không có nút/âm thanh giả).
    // V117: phát đúng 1 lần/thẻ, tôn trọng cài đặt "Tự phát âm"; chế độ kiểm tra trí nhớ không tự phát ở màn giới thiệu.
    if (typeof skillAudioAvailable === 'function' && skillAudioAvailable() && typeof swAutoplayOnce === 'function') {
      const it0 = rvQueue.items[0];
      if (it0 && it0.word) swAutoplayOnce('i' + rvCardSeq, it0.word.hz, false);
    }
    return;
  }
  if (rvPhase !== 'question' || !rvQuestion) return;
  if (rvMulti) return; // V130: câu 3 phần tự cập nhật DOM trong js/review-multi.js
  if (rvQuestion.prompt && rvQuestion.prompt.kind === 'order') { // V135: gắn trạng thái ô chữ + xử lý khi bấm Kiểm tra
    const host = document.querySelector('.rv-body');
    if (host && typeof OS_UI !== 'undefined') OS_UI.playBind(host, rvQuestion, (joined) => rvSubmitOrder(joined));
    return;
  }
  if (rvQuestion.typed) {
    // V117: chỉ tự đưa con trỏ vào ô nhập trên máy có chuột/bàn phím vật lý. Trên điện thoại KHÔNG tự bật bàn phím ảo (gây giật bố cục);
    // người học chạm vào ô khi sẵn sàng. Câu nghe-gõ vẫn tự phát âm đúng 1 lần.
    if (rvQuestion.prompt && rvQuestion.prompt.kind === 'audio' && typeof swAutoplayOnce === 'function') swAutoplayOnce('q' + rvCardSeq, rvQuestion.prompt.audioText || rvQueue.items[0].word.hz, true);
    if (typeof swCanAutoFocus === 'function' && swCanAutoFocus()) setTimeout(() => { const i = document.getElementById('rv-typed'); if (i && document.activeElement !== i && !(typeof swIsPaused === 'function' && swIsPaused())) i.focus(); }, 120);
    return;
  }
  document.querySelectorAll('#rv-opts .quiz-opt').forEach((b, i) => {
    b._correct = (i === rvQuestion.correctIndex);
  });
  if (rvQuestion.prompt.kind === 'audio') {
    // Câu nghe: nội dung kiểm tra chính là âm thanh → tự phát đúng 1 lần (nếu bật), có trạng thái + nút nghe lại; bị chặn thì báo.
    if (typeof swAutoplayOnce === 'function') swAutoplayOnce('q' + rvCardSeq, rvQuestion.prompt.audioText || rvQueue.items[0].word.hz, true);
    else setTimeout(() => { const pb = document.getElementById('rv-play'); if (pb) pb.click(); }, 400);
  }
}

// ── Phần 1/3/4/17/20: user chọn 1 đáp án → khoá UI, hiện đúng/sai tức thời → gửi
//     selectedAnswer + responseTimeMs lên server (server tự xác định lại đúng/sai + tự suy ra
//     FSRS rating + gọi ts-fsrs + lưu). ──
let rvAttemptId = 0; // FIX: đánh dấu lượt trả lời hiện tại — phản hồi server đến TRỄ (sau khi user
                      // đã sang câu khác) sẽ tự bị bỏ qua thay vì ghi đè nhầm màn hình câu sau.
async function rvPick(btn) {
  if (rvSubmitting || rvPhase !== 'question' || !rvQuestion) return;
  if (typeof swIsPaused === 'function' && swIsPaused()) return; // V117: đang tạm dừng → không nhận câu trả lời
  if (rvIsPractice(rvQueue.items[0])) return rvPickPractice(btn); // luyện bổ sung: KHÔNG đi đường FSRS
  rvSubmitting = true;
  // "Review nhiễu khi thoát ra vào lại": trừ đi tổng thời gian tab bị ẩn trong lúc câu hỏi này chờ trả lời.
  const responseTimeMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs())); // Phần 4
  const item = rvQueue.items[0];
  const w = item.word;
  const isCorrectLocally = !!btn._correct;
  const selectedAnswer = btn.dataset.v;
  const attemptId = ++rvAttemptId;

  document.querySelectorAll('#rv-opts .quiz-opt').forEach(b => {
    if (b._correct) b.classList.add('correct');
    else if (b === btn && !isCorrectLocally) b.classList.add('wrong');
    b.disabled = true;
  });
  if (isCorrectLocally) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(rvAnswerSentence(rvQuestion) || w.hz); else speak(rvAnswerSentence(rvQuestion) || w.hz); // V138: đọc CẢ CÂU
  rvRecordAnswer(item, rvQuestion, isCorrectLocally, responseTimeMs, true);

  rvLastAnswer = { correct: isCorrectLocally, card: null, autoRating: null, chosen: selectedAnswer };
  rvPhase = 'answered';
  // Bổ sung "Highlight System Rating": KHÔNG commit thẳng lên FSRS — trước tiên hỏi server gợi ý System
  // Rating (chỉ đọc), rồi hiện 4 nút Again/Hard/Good/Easy + countdown cho user xác nhận.
  rvRatingPhase = 'loading';
  rvSystemRating = null; rvUserRating = null; rvFinalRating = null;
  rvPendingReview = { selectedAnswer, responseTimeMs, answerChanges: rvAnswerChanges };
  rvSubmitting = false;
  render();

  const systemRating = await rvFetchSystemRating({ word: w, selectedAnswer, responseTimeMs, answerChanges: rvAnswerChanges });
  // AUDIT V82: chỉ tiếp tục khi vẫn đang 'loading' (user có thể đã tự bấm rating và commit trước khi gợi ý về).
  if (attemptId !== rvAttemptId || currentTab !== 'review' || rvRatingPhase !== 'loading') return;
  rvSystemRating = systemRating;
  rvRatingPhase = 'pending';
  render();
  if (rvShouldAutoCommit()) rvStartCountdown(attemptId); // V115: sai → chờ người học bấm Tiếp tục, không tự chuyển
}

// Trả lời câu LUYỆN BỔ SUNG (check/extra/redo/drill). KHÔNG gọi /api/study/review(/preview) → không đụng
// lịch FSRS. Chỉ ghi hồ sơ kỹ năng bằng bài luyện bổ sung, đi qua outbox chung (không mất khi mất mạng,
// không ghi trùng khi gửi lại).
// V135 — người học bấm "Kiểm tra" ở câu sắp xếp câu. Chấm tức thời bằng js/order-sentence.js để phản hồi ngay;
// server (/api/skills/practice) chấm LẠI từ câu thật trong dữ liệu — kết quả server mới là nguồn sự thật.
function rvSubmitOrder(joined) {
  if (rvSubmitting || rvPhase !== 'question' || !rvQuestion || !rvQuestion.order) return;
  const item = rvQueue.items[0], w = item.word, q = rvQuestion;
  rvSubmitting = true;
  rvPhase = 'answered';
  const responseTimeMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs()));
  const ok = (typeof OS !== 'undefined') ? OS.isOrderCorrect(q.order.sentence, joined) : false;
  if (ok) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(rvAnswerSentence(q) || w.hz); else speak(rvAnswerSentence(q) || w.hz); // V138: đọc CẢ CÂU
  rvRecordAnswer(item, q, ok, responseTimeMs, false);
  rvLastAnswer = { correct: ok, card: null, autoRating: null, chosen: joined, order: q.order };
  rvRatingPhase = null;
  submitSkillPractice({ word: w, exerciseType: q.exercisePractice, selectedAnswer: joined, responseTimeMs, source: rvPracticeSource(item), sessionId: rvQueue.sessionId, sentence: q.sentence ? q.sentence.zh : undefined }).catch(() => {});
  rvSubmitting = false;
  render();
  // Luôn chờ người học bấm "Tiếp tục" (không tự chuyển): câu dài cần thời gian đọc đáp án đúng.
}
function rvPickPractice(btn) {
  rvPhase = 'answered'; // chặn bấm đúp ngay lập tức (rvPick thoát sớm khi rvPhase !== 'question')
  const item = rvQueue.items[0];
  const w = item.word, q = rvQuestion;
  const responseTimeMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs()));
  const ok = !!btn._correct;
  const attemptId = ++rvAttemptId;
  document.querySelectorAll('#rv-opts .quiz-opt').forEach(b => {
    if (b._correct) b.classList.add('correct');
    else if (b === btn && !ok) b.classList.add('wrong');
    b.disabled = true;
  });
  if (ok) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(rvAnswerSentence(q) || w.hz); else speak(rvAnswerSentence(q) || w.hz); // V138: đọc CẢ CÂU
  rvLastAnswer = { correct: ok, card: null, autoRating: null, chosen: btn.dataset.v };
  rvRatingPhase = null;
  rvRecordAnswer(item, q, ok, responseTimeMs, false);
  submitSkillPractice({ word: w, exerciseType: q.exercisePractice, selectedAnswer: btn.dataset.v, responseTimeMs, source: rvPracticeSource(item), sessionId: rvQueue.sessionId, sentence: q.sentence ? q.sentence.zh : undefined }).catch(() => {});
  render();
  // Đúng và không có giải thích dài → tự sang câu kế sau 2s (đủ đọc). Có giải thích (điền từ, dễ nhầm) hoặc sai
  // → chờ người học bấm "Tiếp tục" để kịp đọc.
  const needsReading = !ok || q.typeId === 'cloze' || q.typeId === 'confusable' || q.typeId === 'hz2py' || q.typeId === 'vi2py' || q.typeId === 'hz2hv';
  if (!needsReading) {
    setTimeout(() => {
      if (attemptId === rvAttemptId && currentTab === 'review' && rvQueue.items[0] === item
          && rvPhase === 'answered' && !document.getElementById('stroke-overlay')
          && !(typeof swIsPaused === 'function' && swIsPaused())) rvAdvanceQueue(); // V116: đang xem nét viết thì không tự chuyển câu
    }, rvBaseAutoMs());
  }
}
// ── V110: trả lời câu TỰ NHẬP. Chấm tức thì bằng AM (đúng module server dùng) chỉ để phản hồi nhanh; server vẫn chấm lại.
// Thẻ FSRS chính thức → đi đường preview + chọn rating + /api/study/review (y như trắc nghiệm).
// Luyện bổ sung → chỉ ghi hồ sơ kỹ năng (/api/skills/practice), KHÔNG đổi lịch FSRS.
// "Bỏ qua" = người học chủ động không nhớ ra → tính là sai (khác bấm Kiểm tra khi để trống = bấm nhầm, không tính vào kỹ năng).
const RV_BLANK_MARK = '⨯ (bỏ trống) ⨯';
async function rvSubmitTyped(skip) {
  if (rvSubmitting || rvPhase !== 'question' || !rvQuestion || !rvQuestion.typed) return;
  if (typeof swIsPaused === 'function' && swIsPaused()) return; // V117
  const inp = document.getElementById('rv-typed');
  const value = skip ? '' : (inp ? inp.value : '');
  if (!skip && !String(value).trim()) { // chưa gõ gì: nhắc nhẹ, KHÔNG tính là câu trả lời
    if (inp) { inp.focus(); inp.placeholder = 'Hãy gõ đáp án, hoặc bấm “Bỏ qua”'; }
    return;
  }
  rvSubmitting = true;
  const q = rvQuestion, item = rvQueue.items[0], w = item.word;
  const responseTimeMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs()));
  const graded = skip ? { correct: false, verdict: 'empty' } : AM.grade(q.typed, value, q.correctKey);
  const selectedAnswer = skip ? RV_BLANK_MARK : String(value).trim();
  const attemptId = ++rvAttemptId;
  if (graded.correct) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(rvAnswerSentence(q) || w.hz); else speak(rvAnswerSentence(q) || w.hz); // V138: đọc CẢ CÂU
  rvRecordAnswer(item, q, graded.correct, responseTimeMs, rvIsOfficial(item));
  rvLastAnswer = { correct: graded.correct, card: null, autoRating: null, chosen: skip ? '' : String(value).trim(), typed: { value: skip ? '' : String(value).trim(), verdict: graded.verdict, correct: graded.correct } };
  rvPhase = 'answered';
  rvSubmitting = false;

  if (rvIsPractice(item)) { // luyện bổ sung
    rvRatingPhase = null;
    submitSkillPractice({ word: w, exerciseType: q.exercisePractice, selectedAnswer, responseTimeMs, source: rvPracticeSource(item), sessionId: rvQueue.sessionId, sentence: q.sentence ? q.sentence.zh : undefined }).catch(() => {});
    render();
    return; // câu tự nhập luôn có giải thích → chờ người học bấm "Tiếp tục"
  }
  rvRatingPhase = 'loading';
  rvSystemRating = null; rvUserRating = null; rvFinalRating = null;
  rvPendingReview = { selectedAnswer, responseTimeMs, answerChanges: 0 };
  render();
  const systemRating = await rvFetchSystemRating({ word: w, selectedAnswer, responseTimeMs, answerChanges: 0 });
  if (attemptId !== rvAttemptId || currentTab !== 'review' || rvRatingPhase !== 'loading') return;
  rvSystemRating = systemRating;
  rvRatingPhase = 'pending';
  render();
  if (rvShouldAutoCommit()) rvStartCountdown(attemptId); // V115: sai → chờ người học bấm Tiếp tục, không tự chuyển
}

function rvPracticeContinue() {
  const item = rvQueue.items[0];
  if (!item || !rvIsPractice(item) || rvPhase !== 'answered') return;
  rvAdvanceQueue();
}
function rvDrillContinue() { rvPracticeContinue(); } // tên cũ (V105)

// ── Ghép cặp (dạng 7) ──────────────────────────────────────────────────────────────────────────
function rvMatchPick(side, idx) {
  const st = rvMatch;
  if (!st || st.done || rvPhase !== 'match') return;
  if (side === 'L') {
    const hz = st.m.lefts[idx];
    if (st.solved.has(hz)) return;
    st.flash = null;
    if (st.m.kind === 'listen') { // V133: chạm 🔊 = phát âm (chạm lại = nghe lại, không bỏ chọn)
      st.selected = hz;
      if (typeof speak === 'function') speak(hz);
    } else {
      st.selected = (st.selected === hz) ? null : hz; // V117: chạm lại chữ đang chọn = bỏ chọn
    }
    render(); return;
  }
  const right = st.m.rights[idx];
  if (!st.selected || st.solvedRights.has(right)) return;
  const pair = st.m.pairs.find(p => p.hz === st.selected);
  if (!pair) return;
  if (!(pair.hz in st.answers)) st.answers[pair.hz] = right; // lần chọn ĐẦU TIÊN của chữ này là thứ được ghi nhận
  if (pair.right === right) { st.solved.add(pair.hz); st.solvedRights.add(right); playDing(); }
  else { st.wrong.add(pair.hz); st.flash = { hz: pair.hz, right }; playBuzz(); } // V117: nhấp nháy cặp vừa ghép sai
  if (pair.right === right) st.flash = null;
  st.selected = null;
  if (st.solved.size === st.m.pairs.length) rvMatchFinish();
  render();
}
function rvMatchFinish() {
  const st = rvMatch; st.done = true;
  for (const p of st.m.pairs) {
    const ok = !st.wrong.has(p.hz);
    rvLog.push({ hz: p.hz, l: p.l, typeId: 'match', skill: st.m.skill, correct: ok, ms: null, official: false, source: 'match' });
    submitSkillPractice({ word: p.word, exerciseType: st.m.exercisePractice, selectedAnswer: st.answers[p.hz], responseTimeMs: null }).catch(() => {});
  }
}
function rvMatchContinue() {
  if (!rvMatch || !rvMatch.done) return;
  rvLastAnswer = { correct: true, card: null, autoRating: null };
  rvAdvanceQueue();
}

// V71/V78: thẻ Ở ĐẦU hàng đợi (rvQueue.items[0] = currentIndex) bị loại NGAY LẬP TỨC sau khi có kết
// quả server. Đúng → loại vĩnh viễn khỏi phiên. Sai (Again) → chèn lại cách tối thiểu REPEAT_GAP
// thẻ khác, KHÔNG gọi lại server giữa phiên — hàng đợi cạn thật (kể cả các thẻ Again đã được xử lý
// xong) mới coi là hết. Dùng CHUNG field completedCards/answeredCount/endTime/sessionKnownHz với 4 tab kia.
// V128 giai đoạn 3: thích ứng giữa buổi. Làm tốt kỹ năng nào thì bớt các câu luyện thêm THEO KẾ HOẠCH còn lại của kỹ năng đó; sai liên tiếp thì không dồn thêm.
// CHỈ bớt câu luyện thêm theo kế hoạch CHƯA hỏi (fromPlan, chưa tries) — thẻ FSRS chính thức, "từ hay sai", câu thăm dò, câu luyện lại sau khi sai: không bao giờ bị đụng tới.
// Quyết định tính thuần từ rvLog + hàng đợi (cả hai đều được lưu theo buổi) nên khôi phục phiên giữa chừng vẫn ra cùng kết luận. Lỗi/thiếu module → không làm gì.
function rvAdaptExtras() {
  if (typeof TP === 'undefined' || !rvQueue || rvQueue.practiceOnly) return;
  try {
    const r = TP.adaptExtras(rvLog, rvQueue.items, rvLearner);
    if (!r.events.length) return;
    const drop = new Set(r.drop);
    for (let i = rvQueue.items.length - 1; i >= 0; i--) if (drop.has(rvQueue.items[i])) rvQueue.items.splice(i, 1);
    rvAdaptNote = TP.describeAdapt(r.events).join(' ');
  } catch {}
}
function rvAdvanceQueue() {
  if (currentTab !== 'review') return; // user đã rời màn hình, tránh render nhầm chỗ
  rvAdaptNote = ''; // V128: thông báo thích ứng chỉ hiện trong lúc người học làm câu kế tiếp
  const it = rvQueue.items.shift();
  const ok = !!(rvLastAnswer && rvLastAnswer.correct);
  if (it && it.type === 'match') {
    // bài ghép cặp: luyện bổ sung, không tính tiến độ FSRS.
  } else if (it && it.type === 'check') {
    // Xong câu kiểm tra ngay sau khi xem từ mới → đưa THẺ FSRS CHÍNH THỨC của từ này vào lại sau RV_NEW_GAP thẻ.
    rvQueue.items.splice(Math.min(RV_NEW_GAP, rvQueue.items.length), 0,
      { type: 'new', word: it.word, introduced: true, introExposurePending: true, skillProfile: it.skillProfile, suggestedSkill: it.suggestedSkill, confusions: it.confusions, lastExerciseType: it.lastExerciseType }); // V114: đây là lượt chính thức ĐẦU sau giới thiệu
  } else if (it && rvIsPractice(it)) {
    // V135: câu SẮP XẾP CÂU không hỏi lại — mỗi buổi chỉ có vài câu rải rác, hỏi lại sẽ lặp đúng câu vừa sai
    // (dạng này bị ép nên không "đổi dạng" được). Lịch FSRS không liên quan.
    if (it.type !== 'order' && it.type !== 'tone' && !ok && (it.tries || 0) + 1 < RV_DRILL_MAX_TRIES) {
      // extra/redo/drill: sai → hỏi lại tối đa RV_DRILL_MAX_TRIES lần, mỗi lần ĐỔI dạng so với lần sai.
      const failed = (it.failedTypes || []).concat(rvQuestion ? [rvQuestion.typeId] : []);
      rvQueue.items.splice(Math.min(RV_DRILL_GAP, rvQueue.items.length), 0, Object.assign({}, it, { tries: (it.tries || 0) + 1, failedTypes: failed }));
    }
  } else if (it) {
    rvQueue.answeredCount++;
    if (!Array.isArray(rvQueue.completedCards)) rvQueue.completedCards = [];
    rvQueue.completedCards.push({ hz: it.word.hz, l: it.word.l, correct: ok, at: Date.now() });
    if (ok) { sessionKnownHz.add(it.word.hz); saveSessionKnownHz(); sqPurgeHzFromAllQueues(it.word.hz); } // V74: loại khỏi TẤT CẢ tab khác; FIX: persist qua reload; purge khỏi hàng đợi tab khác
    else {
      // V138 — CHỐNG REVIEW TRÙNG: KHÔNG đưa thẻ chính thức trả lời sai quay lại hàng đợi. Mỗi thẻ chỉ được ĐÁNH
      // GIÁ FSRS tối đa 1 lần mỗi phiên (yêu cầu V138); thẻ sẽ đến hạn lại theo đúng lịch FSRS. Vẫn chèn 1 câu
      // LUYỆN BỔ SUNG (type 'redo', KHÔNG đổi lịch FSRS) sau RV_CORRECTION_GAP thẻ để sửa lỗi ngay.
      if (rvQueue.items.length > RV_CORRECTION_GAP && SM.canQueueRedo(rvLog, rvQueue.items, it.word.hz)) {
        rvQueue.items.splice(RV_CORRECTION_GAP, 0,
          { type: 'redo', word: it.word, failedTypes: rvQuestion ? [rvQuestion.typeId] : [], targetSkill: rvQuestion ? rvQuestion.skill : undefined, correction: true });
      }
    }
  }
  rvAdaptExtras(); // V128 giai đoạn 3: trước khi kiểm tra "hết hàng đợi" và trước khi lưu phiên → bản lưu phản ánh hàng đợi đã bớt
  const savedKey = rvStorageMode();
  if (!rvQueue.items.length) {
    rvQueue.endTime = Date.now();
    if (!rvQueue.practiceOnly) {
      ssArchiveSession(savedKey, rvQueue);
      refreshServerMeta(); sqClearPersisted(savedKey); // hết phiên — làm mới streak/known thật, dọn session đã lưu
    }
  } else if (!rvQueue.practiceOnly) {
    sqPersist(savedKey, rvQueue, { summary: rvSummary, log: rvLog, learner: rvLearner }); // FIX (Bug 2 — session persistence): lưu lại sau mỗi câu để refresh không mất tiến trình
  }
  rvPrepareCurrentCard();
  render();
}

// ── V106: nguồn thứ 3 — từ người học hay trả lời sai (từ hồ sơ kỹ năng), trộn xen kẽ vào buổi học ──────
// Giới hạn: ≤ 25% số thẻ chính thức (tối thiểu 1 khi buổi có ≥4 thẻ), ≤ RV_EXTRA_MAX; V128: nâng lên 40% / ≤ 10 CHỈ khi có kỹ năng tụt lại đáng tin. KHÔNG thay thế và KHÔNG
// chen lên trước thẻ FSRS nào: thẻ chính thức giữ nguyên thứ tự, extra chỉ xen vào giữa.
async function rvFetchWeakWords(limit) {
  if (!authToken) return [];
  try {
    const audio = (typeof skillAudioAvailable === 'function' && skillAudioAvailable()) ? 1 : 0;
    const res = await fetch(`/api/skills/practice-words?skill=mixed&weakOnly=1&limit=${limit}&allowListening=${audio}`, { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok || !Array.isArray(d.words)) return [];
    return d.words;
  } catch { return []; }
}
function rvWordOf(row) { return WORDS.find(x => x.hz === row.hz && x.l === row.l) || WORDS.find(x => x.hz === row.hz) || null; }
// V127: từ để THĂM DÒ nhớ chủ động = từ người học ĐÃ ôn nhưng kỹ năng 'recall' của từ đó chưa đủ dữ liệu (không lấy từ đang yếu: gõ khi chưa vững chỉ gây nản).
async function rvFetchProbeWords(limit) {
  if (!authToken) return [];
  try {
    const res = await fetch(`/api/skills/practice-words?skill=recall&weakOnly=0&limit=${limit}`, { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok || !Array.isArray(d.words)) return [];
    return d.words.filter(w => w.score == null); // score != null nghĩa là đã có điểm (yếu) → bỏ
  } catch { return []; }
}
// V128 (giai đoạn 2): từ để luyện thêm cho MỘT kỹ năng tụt lại (từ đã ôn mà kỹ năng đó yếu, rồi đến từ chưa đủ dữ liệu kỹ năng đó).
async function rvFetchSkillWords(skill, limit) {
  if (!authToken) return [];
  try {
    const audio = (typeof skillAudioAvailable === 'function' && skillAudioAvailable()) ? 1 : 0;
    const res = await fetch(`/api/skills/practice-words?skill=${encodeURIComponent(skill)}&weakOnly=0&limit=${limit}&allowListening=${audio}`, { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok || !Array.isArray(d.words)) return [];
    return d.words;
  } catch { return []; }
}
// V128: kỹ năng tụt lại ĐÁNG TIN (js/training-plan.js, cùng công thức với màn Phân tích) mà có thể luyện thêm ngay. Thiếu module/số liệu/lỗi → [] (chạy y như V127).
function rvPlanPriorities() {
  if (typeof TP === 'undefined') return [];
  try {
    const audio = typeof skillAudioAvailable === 'function' && skillAudioAvailable();
    return TP.actionable(TP.build(rvLearner, { typedEnabled: rvTypedEnabled() }), audio ? [] : ['listening']); // không có giọng đọc → không thể luyện nghe
  } catch { return []; }
}
async function rvAddExtras(items) {
  const officialN = items.length;
  const baseCap = officialN ? Math.min(RV_EXTRA_MAX, Math.max(officialN >= 4 ? 1 : 0, Math.floor(officialN / 4))) : RV_EXTRA_MAX;
  if (baseCap <= 0) return { items, extraCount: 0 };
  // V128: có kỹ năng tụt lại đáng tin → nâng trần (40% số thẻ, ≤ 10 câu). Không có → giữ trần cũ (25%, ≤ 6) như V127.
  const planPri = rvPlanPriorities();
  const cap = planPri.length ? TP.extraCap(officialN, baseCap, planPri) : baseCap;
  // V127: số liệu người học cho thấy nhận diện đã khá vững mà chưa đủ bằng chứng tự gõ → để dành tối đa RV_PROBE_MAX chỗ (không quá cap, cần cap ≥ 2
  // để từ yếu vẫn được ưu tiên ≥ 1 chỗ) cho câu thăm dò tự gõ. Câu thăm dò là luyện bổ sung nên KHÔNG đổi lịch ôn FSRS.
  const probeSlots = (cap >= 2 && rvTypedEnabled() && QS.recallProbeNeeded(rvLearner)) ? Math.min(RV_PROBE_MAX, cap - 1) : 0;
  const alloc = planPri.length ? TP.allocate(planPri, cap - probeSlots) : { planSlots: 0, bySkill: {} }; // chỗ dành cho kỹ năng tụt lại
  const planSkills = Object.keys(alloc.bySkill).filter(k => alloc.bySkill[k] > 0);
  const [rows, probeRows, planRowsArr] = await Promise.all([
    rvFetchWeakWords(cap + 3), probeSlots ? rvFetchProbeWords(probeSlots + 3) : Promise.resolve([]),
    Promise.all(planSkills.map(k => rvFetchSkillWords(k, alloc.bySkill[k] + 3))),
  ]);
  const inQueue = new Set(items.map(i => i.word.hz));
  const extras = [];
  // V128: trước hết các từ luyện cho kỹ năng tụt lại (đúng hạn mức từng kỹ năng); thiếu ứng viên → chỗ còn lại nhường cho "từ hay sai" bên dưới.
  planSkills.forEach((k, idx) => {
    let n = 0;
    for (const r of planRowsArr[idx] || []) {
      if (n >= alloc.bySkill[k] || extras.length >= cap - probeSlots) break;
      if (inQueue.has(r.hz) || sessionKnownHz.has(r.hz)) continue;
      const w = rvWordOf(r); if (!w) continue;
      inQueue.add(r.hz); n++;
      extras.push({ type: 'extra', word: w, targetSkill: k, fromPlan: true });
    }
  });
  for (const r of rows) {
    if (inQueue.has(r.hz) || sessionKnownHz.has(r.hz) || extras.length >= cap - probeSlots) continue; // FIX V123: không chèn lại từ đã trả lời ĐÚNG hôm nay
    const w = rvWordOf(r); if (!w) continue;
    inQueue.add(r.hz);
    extras.push({ type: 'extra', word: w, targetSkill: r.skill });
  }
  let probes = 0;
  for (const r of probeRows) {
    if (probes >= probeSlots || extras.length >= cap) break;
    if (inQueue.has(r.hz) || sessionKnownHz.has(r.hz)) continue;
    const w = rvWordOf(r); if (!w) continue;
    inQueue.add(r.hz); probes++;
    extras.push({ type: 'extra', word: w, targetSkill: 'recall', probe: 'typed' });
  }
  // Chỗ dành cho thăm dò mà không đủ ứng viên → nhường lại cho từ yếu (không để trống).
  if (probes < probeSlots) {
    for (const r of rows) {
      if (extras.length >= cap) break;
      if (inQueue.has(r.hz) || sessionKnownHz.has(r.hz)) continue;
      const w = rvWordOf(r); if (!w) continue;
      inQueue.add(r.hz);
      extras.push({ type: 'extra', word: w, targetSkill: r.skill });
    }
  }
  if (!extras.length) return { items, extraCount: 0 };
  if (extras.some(e => e.fromPlan)) { // V128: xen kẽ câu theo kế hoạch với "từ hay sai"/thăm dò để không dồn một loại vào nửa đầu buổi (không có câu theo kế hoạch → giữ nguyên thứ tự như V127)
    const a = extras.filter(e => e.fromPlan), b = extras.filter(e => !e.fromPlan), m = [];
    while (a.length || b.length) { if (a.length) m.push(a.shift()); if (b.length) m.push(b.shift()); }
    extras.length = 0; extras.push(...m);
  }
  const out = []; const step = Math.max(1, Math.ceil(items.length / (extras.length + 1)));
  let ei = 0;
  items.forEach((it, i) => { out.push(it); if ((i + 1) % step === 0 && ei < extras.length) out.push(extras[ei++]); });
  while (ei < extras.length) out.push(extras[ei++]);
  return { items: out, extraCount: extras.length };
}
// Chèn 1 bài ghép cặp (từ chính các từ chính thức của buổi) ở ~70% buổi học — chỉ khi có ≥4 từ khác nhau.
function rvInsertMatch(items) {
  const hzs = [...new Set(items.filter(rvIsOfficial).map(i => i.word.hz))];
  if (hzs.length < 4) return items;
  const pick = hzs.slice(0, 4);
  const out = items.slice();
  out.splice(Math.min(out.length, Math.max(1, Math.floor(out.length * 0.7))), 0, { type: 'match', hzs: pick });
  return out;
}
// V135 — SẮP XẾP CÂU trong buổi "Hôm nay học". Chèn thêm N câu (mặc định 2, đặt trong Cài đặt hằng ngày) ở khoảng
// 1/3 và 2/3 buổi để người học gặp rải rác chứ không dồn. Từ để hỏi lấy từ CHÍNH các từ chính thức của buổi
// (không đổi lịch FSRS của từ nào khác), và chỉ những từ có câu thật trong giáo trình/ví dụ dựng được bài.
// Đây là LUYỆN BỔ SUNG: item.type = 'order' → nằm trong RV_PRACTICE_TYPES, không đi đường FSRS.
function rvInsertOrderSentence(items) {
  const n = rvOrderPerSession();
  if (!n) return items;
  const ctx = rvQCtx();
  const cands = [], seen = new Set();
  for (const it of items) {
    if (!rvIsOfficial(it) || !it.word || seen.has(it.word.hz)) continue;
    seen.add(it.word.hz);
    if (QE.build('orderSentence', it.word, ctx)) cands.push(it.word); // chỉ từ dựng được câu THẬT mới được chọn
  }
  // Ưu tiên từ của CHÍNH buổi. Chưa đủ số câu (kho câu mẫu chỉ phủ một phần từ vựng) → lấy thêm từ CÙNG BÀI đang học,
  // để buổi học vẫn có bài sắp xếp câu thay vì lặng lẽ không có câu nào. Không đụng tới từ/thẻ ngoài bài.
  if (cands.length < n) {
    const lessons = new Set(items.filter(rvIsOfficial).map(it => it.word && it.word.l).filter(Number.isFinite));
    for (const w of WORDS) {
      if (cands.length >= n) break;
      if (!w || !lessons.has(w.l) || seen.has(w.hz)) continue;
      if (QE.build('orderSentence', w, ctx)) { seen.add(w.hz); cands.push(w); }
    }
  }
  if (!cands.length) return items;
  const out = items.slice();
  const count = Math.min(n, cands.length);
  // Rải đều: câu thứ k nằm ở khoảng (k+1)/(count+1) chiều dài buổi (2 câu → 1/3 và 2/3).
  // Chèn từ câu CUỐI về đầu để vị trí đã chèn không bị đẩy lệch.
  for (let k = count - 1; k >= 0; k--) {
    const frac = (k + 1) / (count + 1);
    const at = Math.max(1, Math.min(out.length, Math.round(out.length * frac)));
    out.splice(at, 0, { type: 'order', word: cands[k], skillProfile: null });
  }
  return out;
}

// V137 — NHẬN BIẾT THANH ĐIỆU trong buổi "Hôm nay học": chèn RV_TONE_PER_SESSION câu "nhìn chữ Hán → chọn cách đọc
// đúng thanh điệu" (dạng hz2tone), rải ở 1/3 và 2/3 buổi. Từ lấy từ CHÍNH các thẻ chính thức của buổi; từ có nhiều
// cách đọc / pinyin không dấu thanh thì QE.build trả null nên bị bỏ qua. Luyện bổ sung: item.type = 'tone',
// KHÔNG đi đường FSRS, không đổi lịch ôn.
function rvInsertToneRecognition(items) {
  const ctx = rvQCtx(), seen = new Set(), cands = [];
  for (const it of items) {
    if (!rvIsOfficial(it) || !it.word || seen.has(it.word.hz)) continue;
    seen.add(it.word.hz);
    if (QE.build('hz2tone', it.word, ctx)) cands.push(it.word);
  }
  if (!cands.length) return items;
  const n = Math.min(RV_TONE_PER_SESSION, cands.length);
  const out = items.slice();
  // Chèn từ câu CUỐI về đầu để vị trí đã chèn không bị đẩy lệch (cùng cách với sắp xếp câu).
  for (let k = n - 1; k >= 0; k--) {
    const at = Math.max(1, Math.min(out.length, Math.round(out.length * ((k + 1) / (n + 1)))));
    out.splice(at, 0, { type: 'tone', word: cands[k], skillProfile: null });
  }
  return out;
}

// Bài hiện tại của màn bắt đầu: các bài ĐANG CHỌN (server) mà buổi này thật sự có từ thuộc về (theo liên kết bài HIỆN TẠI
// `word.lessons`). KHÔNG dùng `word.l` — đó là cột bài cũ, có thể còn số bài đã bị xoá khỏi mục từ vựng.
function rvBuildStartInfo(items, extraCount, scopeLessons) {
  const scope = (Array.isArray(scopeLessons) ? scopeLessons : []).map(Number).filter(Number.isFinite);
  const fromWords = new Set();
  for (const it of items) {
    if (!rvIsOfficial(it) || !it.word || !Array.isArray(it.word.lessons)) continue;
    for (const l of it.word.lessons) fromWords.add(Number(l));
  }
  let lessons = scope.length ? scope.filter(l => fromWords.has(l)) : [...fromWords];
  if (!lessons.length && scope.length) lessons = scope.slice();
  lessons = [...new Set(lessons)].sort((a, b) => a - b);
  const newCount = items.filter(i => i.type === 'new').length;
  const reviewCount = items.filter(i => i.type === 'review').length;
  const matchN = items.filter(i => i.type === 'match').length;
  const orderN = items.filter(i => i.type === 'order').length; // V135: câu sắp xếp câu (luyện bổ sung) — con số "dự kiến" phải tính cả
  const toneN = items.filter(i => i.type === 'tone').length; // V137: câu nhận biết thanh điệu (luyện bổ sung)
  return { lessons, newCount, reviewCount, extraCount, estimated: reviewCount + newCount * 2 + extraCount + matchN + orderN + toneN };
}
function rvBeginSession() {
  if (rvStage !== 'start') return;
  rvStage = 'run';
  rvPrepareCurrentCard(); // đo lại responseTime từ lúc người học thực sự bấm "Bắt đầu"
  render();
}

// Luyện bổ sung độc lập (không FSRS, không lưu phiên): từ hay sai / luyện lại câu sai.
function rvBeginPracticeOnly(items) {
  rvQueue = sqCreate();
  rvQueue.practiceOnly = true;
  rvQueue.sessionId = genIdempotencyKey();
  rvQueue.startTime = Date.now();
  rvQueue.dayKey = todayKey();
  rvQueue.lessonFilter = sqSnapshotLessonFilter();
  rvQueue.items = items;
  rvQueue.totalPlanned = items.length;
  rvStage = 'run'; rvStartInfo = null; rvAdaptNote = '';
  rvPrepareCurrentCard();
  render();
}
// V132 — "Ghép cặp nhanh": chỉ chạm (không gõ, không ghi âm; loại "nghe" chỉ có khi máy có giọng đọc). Lấy các từ đã ôn, chia nhóm 4 từ, xoay vòng các loại cặp
// (chữ Hán ↔ nghĩa / pinyin / Hán Việt / âm nghe). Luyện bổ sung độc lập: không đổi lịch FSRS, không lưu phiên (giống "Chỉ luyện từ hay sai").
async function rvStartMatchDrill() {
  if (!authToken) { alert('Hãy đăng nhập để dùng chế độ này.'); return; }
  let rows = [];
  try {
    const res = await fetch('/api/skills/practice-words?skill=mixed&limit=40&allowListening=0', { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (d && d.ok && Array.isArray(d.words)) rows = d.words;
  } catch {}
  const words = [], seenHz = new Set();
  for (const r of rows) { const w = rvWordOf(r); if (w && !seenHz.has(w.hz)) { seenHz.add(w.hz); words.push(w); } }
  const ctx = rvQCtx(), kinds = ctx.audioOk ? ['vi', 'py', 'hv', 'listen'] : ['vi', 'py', 'hv'], items = []; // 'listen' chỉ khi máy có giọng đọc
  // Mỗi vòng: lấy 4 từ kế tiếp rồi chọn loại cặp (xoay vòng) dựng được trên đúng nhóm từ đó; nhóm nào không dựng được loại nào thì bỏ.
  for (let i = 0, round = 0; i + 4 <= words.length && items.length < 5; i += 4, round++) {
    const group = words.slice(i, i + 4);
    const kind = kinds.map((_, j) => kinds[(round + j) % kinds.length]).find(k => QE.buildMatch(group, k, ctx) && QE.buildMatch(group, k, ctx).pairs.length === 4);
    if (kind) items.push({ type: 'match', hzs: group.map(w => w.hz), kind });
  }
  if (!items.length) { alert('Chưa đủ từ đã ôn để ghép cặp (cần ít nhất 4 từ đã ôn có nghĩa / pinyin / Hán Việt không trùng nhau).'); return; }
  ssSetActiveTabUI('review'); // đổi tab mà KHÔNG vẽ lại → không tự nạp/khôi phục phiên học chính
  rvLog = []; rvSummary = { reviewCount: 0, newCount: 0 }; rvQSession = QS.newSession(); rvMatch = null;
  rvBeginPracticeOnly(items);
}
async function rvStartWeakPractice() {
  const rows = await rvFetchWeakWords(10);
  const items = [];
  for (const r of rows) { const w = rvWordOf(r); if (w) items.push({ type: 'redo', word: w, targetSkill: r.skill }); }
  if (!items.length) { alert('Chưa có từ nào đủ dữ liệu để kết luận là hay trả lời sai.'); return; }
  rvBeginPracticeOnly(items);
}
// Luyện lại câu sai (dạng 10): các từ có lần trả lời CUỐI trong buổi là sai; hỏi bằng DẠNG KHÁC lần sai.
function rvStartRedoWrong() {
  const last = new Map();
  for (const e of rvLog) last.set(e.hz, e);
  const failedByHz = new Map();
  for (const e of rvLog) if (!e.correct && e.typeId !== 'match') { (failedByHz.get(e.hz) || failedByHz.set(e.hz, new Set()).get(e.hz)).add(e.typeId); }
  const items = [];
  for (const e of last.values()) {
    if (e.correct) continue;
    const w = WORDS.find(x => x.hz === e.hz && x.l === e.l) || WORDS.find(x => x.hz === e.hz);
    if (!w) continue;
    items.push({ type: 'redo', word: w, failedTypes: [...(failedByHz.get(e.hz) || [])], targetSkill: e.skill });
  }
  if (!items.length) { alert('Không có câu sai nào để luyện lại.'); return; }
  rvBeginPracticeOnly(items);
}
