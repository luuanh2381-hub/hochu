// js/question-selector.js — BỘ CHỌN DẠNG CÂU HỎI THÍCH ỨNG (V106). THUẦN, tách riêng khỏi giao diện.
//
// Phạm vi: bộ chọn KHÔNG quyết định từ nào được học, thứ tự hay số lượng — việc đó vẫn do FSRS (server) +
// hàng đợi quyết định (thẻ đến hạn không bao giờ bị bỏ). Bộ chọn chỉ trả lời: "với từ ĐÃ được chọn này,
// hỏi DẠNG nào?" rồi dựng câu hỏi bằng QE.build (câu không hợp lệ bị bỏ, thử dạng kế tiếp).
//
// Điểm ưu tiên của một dạng bài T cho từ w (cao hơn = chọn trước) — mọi hệ số ở WEIGHTS để chỉnh/kiểm thử:
//   base(T)
//   + weak        : kỹ năng của T "yếu" (đủ dữ liệu, điểm < 0.6)         → cộng mạnh theo độ yếu
//   + data        : kỹ năng của T "chưa đủ dữ liệu"                      → cộng nhỏ, giảm dần theo số lượt (thu thập thêm)
//   − strong      : kỹ năng của T đã ổn định cao (≥ 0.85)                → trừ nhẹ (không hỏi mãi dạng đã giỏi)
//   − repeatPair  : đã hỏi cặp (từ, dạng) này trong buổi                  → trừ rất mạnh (gần như loại)
//   − sameAsPrev  : trùng dạng với câu ngay trước; − streak khi ≥3 liên tiếp
//   − diversity   : dạng này đã dùng nhiều trong buổi
//   Giảm độ khó: nếu 3/4 câu gần nhất sai → giảm ảnh hưởng của "weak" và ưu tiên dạng dễ (hz2vi) —
//   tránh buổi học dồn toàn từ yếu khiến người học nản.
// Khi dữ liệu kỹ năng chưa đủ: KHÔNG kết luận yếu, chỉ phân phối cân bằng để thu thêm dữ liệu.
//
// V111 — THÍCH ỨNG THẬT HƠN:
//   * learn()      : hồ sơ kỹ năng được CẬP NHẬT NGAY SAU MỖI CÂU (cùng công thức server, js/skill-score.js) → câu kế tiếp
//                    thấy tiến bộ/sai lầm vừa xảy ra. Server vẫn ghi & tính lại độc lập.
//   * fragile      : trả lời ĐÚNG nhưng CHẬM (so với nhịp của chính người học trong buổi, hoặc quá ngưỡng tuyệt đối) → coi là
//                    "đúng nhưng chưa chắc": không bị trừ điểm "đã vững", được cộng nhẹ để củng cố, và chưa đủ điều kiện gõ đáp án.
//   * độ khó FSRS  : thẻ đang học dở/khó (state 1|3, difficulty ≥ 8, lapses ≥ 3) → dạng dễ trước; thẻ dễ & ổn định → dạng khó hơn.
//   * hàng đợi dài : còn nhiều thẻ chính thức → hạ các dạng chậm (tự gõ, điền từ) để buổi học không kéo dài.
//   * từ hay nhầm  : QE chèn đáp án từng nhầm làm đáp án nhiễu (xem QE.injectConfusion); bộ chọn cộng điểm bài phân biệt.
//   * why          : mỗi câu kèm lý do NGẮN vì sao chọn dạng này — chỉ khi dữ liệu thật sự hỗ trợ.
//
// V127 — NỐI PHÂN TÍCH NĂNG LỰC CẤP NGƯỜI HỌC VÀO VIỆC CHỌN DẠNG (hồ sơ theo TỪ quá thưa: mỗi ô cần ≥3 lượt mà mỗi từ thường chỉ hỏi ~1 lần/buổi):
//   * learner      : số đếm gộp mọi từ theo (kỹ năng × trắc nghiệm/tự gõ) do server gửi kèm phiên (lib/skill-pooled.learnerCounts). Bộ chọn tự
//                    trừ đoán mò (trắc nghiệm 4 đáp án đúng 25% chỉ nhờ đoán), làm mượt Laplace và trộn cửa sổ 14 ngày (có trọng số nhỏ) →
//                    MỘT lần sai không làm đổi kết luận; thiếu mẫu (< learnerMinN) thì KHÔNG kết luận, chỉ cộng nhỏ để thu thêm dữ liệu.
//   * learnerGap   : kỹ năng tụt lại so với mức GIỮA của các kỹ năng khác của chính người học (đủ mẫu cả hai phía) → cộng có TRẦN.
//   * nhận diện ≠ nhớ chủ động: chọn đúng 1 trong 4 đáp án (vd Nghĩa→Chữ Hán) là bằng chứng NHẬN DIỆN. Khi chưa có đủ bằng chứng TỰ GÕ ở
//                    cấp người học thì dạng trắc nghiệm của 'recall' KHÔNG bị coi là "đã vững" (không trừ điểm strong). Việc THU bằng chứng tự gõ
//                    nằm ở review.js dưới dạng câu luyện bổ sung (KHÔNG phải thẻ FSRS) — xem recallProbeNeeded().
//   * skillShare   : một kỹ năng chiếm > skillShareCap số câu của buổi (từ skillShareMinTotal câu) → bị trừ nhẹ (cân bằng theo KỸ NĂNG, không chỉ theo dạng).
//   * lastType     : dạng đã hỏi cho CHÍNH TỪ NÀY ở lần trước (phiên/ngày trước) → trừ nhẹ để không lặp đúng cách hỏi giữa các ngày.
//   Tất cả đều là điểm cộng/trừ có trần. Không truyền `learner`/`lastExerciseType` thì CHỈ còn cân bằng theo kỹ năng (skillShare) khác V126;
//   thêm vào đó skillShare chỉ có tác dụng khi buổi đã có ≥ skillShareMinTotal câu.

const QS = (function () {
  'use strict';

  const WEIGHTS = {
    base: { hz2vi: 1.0, vi2hz: 1.0, listen2hz: 1.0, listen2vi: 1.0, hz2py: 0.9, cloze: 1.1, confusable: 0.8, listen2tone: 0.8, typeVi2hz: 0.9, typeHz2py: 0.9,
      py2hz: 0.95, py2vi: 0.95, vi2py: 0.95, hz2hv: 0.9, listen2type: 0.9 }, // V117: dạng bổ sung (chỉ luyện bổ sung)
    // V110 — câu TỰ NHẬP là "độ khó tăng dần": chỉ ưu tiên khi người học đã VỮNG kỹ năng đó ở dạng trắc nghiệm.
    typedMasteryBonus: 1.8, typedMinAttempts: 4,           // kỹ năng 'tốt' (≥0.75) và ≥ 4 lượt → cộng
    typedDevelopingPenalty: 0.6, typedNotReadyPenalty: 2.5, // đang phát triển → trừ nhẹ; yếu/thiếu dữ liệu → gần như không gõ
    typedStrugglePenalty: 3, typedLearningPenalty: 1.2, typedHardWordPenalty: 1.0, // đang vật lộn / thẻ đang học dở / từ rất khó
    staleBonusPerWeek: 0.2, staleCap: 0.8,                 // kỹ năng lâu chưa kiểm tra → ưu tiên nhẹ (tối đa +0.8)
    fragileBonus: 0.8,                                      // đúng nhưng chậm → củng cố thêm
    hesitantRatio: 1.8, hesitantFloorMs: 4000, hesitantAbsMs: 12000, hesitantAbsTypedMs: 30000, hesitantMinSamples: 3,
    hardEasyBonus: 0.5, hardHardPenalty: 0.4, hardDifficulty: 8, hardLapses: 3,         // từ khó → dạng dễ
    easyHardBonus: 0.4, easyEasyPenalty: 0.4, easyDifficulty: 4, easyMinReps: 4,        // từ dễ & ổn định → dạng khó hơn
    longQueue: 25, typedLongQueuePenalty: 0.8, slowTypeLongQueuePenalty: 0.3,            // hàng đợi dài → bớt dạng chậm
    confusionBonus: 1.2,                                                                  // từ hay nhầm → bài phân biệt
    weakMin: 2.0, weakSlope: 3.0,       // weak = weakMin + weakSlope * (0.6 - score)
    dataMax: 1.2,                       // data = dataMax / (1 + attempts)
    strongPenalty: 0.4, strongAt: 0.85,
    repeatPair: 10,
    sameAsPrev: 1.0, streak3: 2.0,
    diversityPerUse: 0.1, diversityCap: 1.0,
    struggleWindow: 4, struggleWrong: 3, struggleWeakDamp: 0.3, struggleEasyBonus: 1.5,
    // V118 — SAI LẶP LẠI → ĐỔI CHIỀU TRUY XUẤT: câu gần nhất của CHÍNH TỪ NÀY trong buổi bị sai → cộng cho dạng thuộc kỹ năng KHÁC
    // kỹ năng vừa sai (vd sai Chữ Hán→Nghĩa thì thử Nghĩa→Chữ Hán / Nghe / Pinyin). Sai từ 2 lần trở lên: cộng mạnh hơn, và trừ nhẹ
    // dạng cùng kỹ năng với các lần sai (không hỏi lại đúng cách đã thất bại). Đổi vị trí đáp án KHÔNG phải là đổi chiều.
    shiftBonus: 1.2, shiftBonusRepeat: 2.0, sameSkillAfterWrongPenalty: 0.5,
    // V127 — số liệu cấp người học (xem chú thích đầu file)
    learnerMinN: 20,                                   // dưới ngưỡng: chưa đủ dữ liệu cấp người học → không kết luận
    learnerGapMinN: 30, learnerGapMin: 0.15,           // so khoảng cách giữa các kỹ năng: cần ≥ 30 lượt, chênh ≥ 15 điểm % (đã trừ đoán mò)
    learnerWeakBase: 0.35, learnerWeakSlope: 1.0, learnerWeakMax: 0.9, // cộng khi tụt lại (đã nhân độ tin cậy n/(n+10)); trần 0.9 < "weak" theo từ
    learnerDataMax: 0.5,                               // kỹ năng chưa đủ mẫu cấp người học → cộng nhỏ, giảm dần theo số lượt
    learnerRecentWeight: 0.35, learnerRecentMinN: 8,   // trộn tỉ lệ 14 ngày gần nhất (chỉ khi ≥ 8 lượt) với 35% trọng số
    productionMinN: 20, productionOkRate: 0.7,         // "đã có bằng chứng NHỚ CHỦ ĐỘNG": ≥ 20 lượt tự gõ và (đã làm mượt) ≥ 70% đúng
    probeChoiceMinCorrected: 0.5,                      // nhận diện (trắc nghiệm) đã khá vững: đã-trừ-đoán-mò ≥ 50% → đáng thử đo tự gõ
    skillShareCap: 0.4, skillShareMinTotal: 5, skillSharePenalty: 0.8,
    lastTypePenalty: 0.6,
  };
  const WEAK_THRESHOLD = 0.6;

  function newSession() {
    return { asked: {}, history: [], typeCount: {}, skillCount: {}, recentCorrectPositions: [], rt: {} };
  }
  const SK_NAME = { recognition: 'Nhận diện chữ Hán', recall: 'Nhớ chủ động', listening: 'Nghe', pinyin: 'Pinyin', context: 'Dùng từ trong câu' };
  const EASY_TYPES = ['hz2vi', 'listen2vi', 'py2vi'], HARD_TYPES = ['vi2hz', 'cloze', 'listen2hz', 'py2hz'], SLOW_TYPES = ['cloze'];
  function scoreLib() { return (typeof SS !== 'undefined') ? SS : require('./skill-score'); }
  const rtKey = (q) => q.skill + (q.typed ? ':t' : ':c');
  function median(a) { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

  // Câu trả lời ĐÚNG này có "chậm bất thường" không? Chuẩn so sánh = nhịp của CHÍNH người học trong buổi (trung vị các câu đúng
  // cùng kỹ năng & cùng kiểu: chọn / tự gõ) khi có ≥ 3 mẫu; chưa đủ mẫu thì dùng ngưỡng tuyệt đối. Phải gọi TRƯỚC record()
  // (để chưa tính câu hiện tại vào chuẩn).
  function isHesitant(session, q, ms) {
    const W = WEIGHTS;
    if (!Number.isFinite(ms) || ms <= 0) return false; // không đo được → không kết luận
    const samples = (session && session.rt && session.rt[rtKey(q)]) || [];
    if (samples.length >= W.hesitantMinSamples) return ms > Math.max(W.hesitantRatio * median(samples), W.hesitantFloorMs);
    return ms > (q.typed ? W.hesitantAbsTypedMs : W.hesitantAbsMs);
  }

  // Cập nhật hồ sơ NGAY sau 1 câu → trả hồ sơ MỚI (không sửa bản cũ). Gọi TRƯỚC record().
  // Cùng quy tắc ghi như server: mọi câu có đáp án đều được tính (đúng/sai) vào kỹ năng của câu.
  function learn(profile, session, q, correct, ms) {
    const next = Object.assign({}, profile || {});
    if (!q || !q.skill) return next;
    const entry = scoreLib().advanceProfileEntry(next[q.skill], correct);
    entry.fragile = !!(correct && isHesitant(session, q, ms)); // sai thì đã là yếu; đúng nhanh thì bỏ cờ
    next[q.skill] = entry;
    return next;
  }
  function pairKey(hz, typeId) { return hz + '|' + typeId; }
  // Lịch sử CỦA MỘT TỪ trong buổi: { lastWrongSkill (null nếu câu gần nhất không sai), wrongSkills: {skill: số lần sai} }.
  function wordTrail(session, hz) {
    const out = { lastWrongSkill: null, wrongSkills: {}, wrongTotal: 0 };
    const h = (session && session.history) || [];
    let lastSeen = null;
    for (const x of h) {
      if (x.hz !== hz) continue;
      const T = QE.TYPES[x.typeId]; if (!T) continue; // 'match' và dạng không có trong QE.TYPES không phải một chiều truy xuất
      lastSeen = x;
      if (!x.correct) { out.wrongSkills[T.skill] = (out.wrongSkills[T.skill] || 0) + 1; out.wrongTotal++; }
    }
    if (lastSeen && !lastSeen.correct) out.lastWrongSkill = QE.TYPES[lastSeen.typeId].skill;
    return out;
  }

  // Ghi nhận 1 câu đã hỏi xong (gọi sau khi người học trả lời).
  function record(session, q, correct, ms) {
    if (!session || !q) return;
    if (!session.rt) session.rt = {};
    if (correct && Number.isFinite(ms) && ms > 0) { // chỉ câu ĐÚNG mới làm chuẩn nhịp
      const a = session.rt[rtKey(q)] || (session.rt[rtKey(q)] = []);
      a.push(ms); if (a.length > 12) a.shift();
    }
    session.asked[pairKey(q.hz, q.typeId)] = (session.asked[pairKey(q.hz, q.typeId)] || 0) + 1;
    session.typeCount[q.typeId] = (session.typeCount[q.typeId] || 0) + 1;
    if (q.skill) { // V127: đếm theo KỸ NĂNG (cân bằng kỹ năng, không chỉ dạng); câu không có kỹ năng (vd ghép cặp) không tính
      if (!session.skillCount) session.skillCount = {};
      session.skillCount[q.skill] = (session.skillCount[q.skill] || 0) + 1;
    }
    session.history.push({ hz: q.hz, typeId: q.typeId, correct: !!correct });
    if (session.history.length > 60) session.history.shift();
    session.recentCorrectPositions.push(q.correctIndex);
    if (session.recentCorrectPositions.length > 4) session.recentCorrectPositions.shift();
  }

  function struggling(session) {
    const h = (session && session.history) || [];
    const last = h.slice(-WEIGHTS.struggleWindow);
    if (last.length < WEIGHTS.struggleWindow) return false;
    return last.filter(x => !x.correct).length >= WEIGHTS.struggleWrong;
  }

  // Mức độ của 1 kỹ năng. Hồ sơ từ server có `level`; hồ sơ cũ/test chỉ có status+score → suy ra cùng quy tắc (0.6 / 0.75).
  function levelOf(p) {
    if (!p || p.status === 'insufficient') return 'insufficient';
    if (p.level) return p.level;
    if (p.status === 'weak') return 'weak';
    return (p.score != null && p.score >= 0.75) ? 'good' : 'developing';
  }

  // Độ khó của TỪ theo FSRS (phía trình duyệt đã có state/difficulty/lapses/reps trong `word`). Từ mới (chưa có thẻ) → null.
  function wordHardness(word) {
    if (!word) return null;
    const W = WEIGHTS, d = Number(word.difficulty), lap = Number(word.lapses) || 0, reps = Number(word.reps) || 0;
    if (word.state === 1 || word.state === 3 || d >= W.hardDifficulty || lap >= W.hardLapses) return 'hard';
    if (word.state === 2 && d <= W.easyDifficulty && lap === 0 && reps >= W.easyMinReps) return 'easy';
    return null;
  }

  // ── V127: số liệu cấp NGƯỜI HỌC ────────────────────────────────────────────────────────────────────────────────
  // learner = { v:1, skills: { [skill]: { c:{n,ok}, t:{n,ok}, rc:{n,ok}, rt:{n,ok} } } } (server: lib/skill-pooled.learnerCounts).
  // c/t = trắc nghiệm / tự gõ trong cửa sổ dài (90 ngày); rc/rt = cùng loại trong cửa sổ gần đây (14 ngày, tập con của cửa sổ dài).
  // Trả { n, ability (0..1, ĐÃ TRỪ ĐOÁN MÒ, null nếu chưa có lượt), choiceN, choiceCorrected, typedN, typedRate }.
  function learnerSkill(learner, skill) {
    const none = { n: 0, ability: null, choiceN: 0, choiceCorrected: null, typedN: 0, typedRate: null };
    const c = learner && learner.skills && learner.skills[skill];
    if (!c) return none;
    const W = WEIGHTS;
    const part = (L, R, chance) => {
      const n = (L && Number(L.n)) || 0;
      if (n <= 0) return null;
      let p = ((Number(L.ok) || 0) + 1) / (n + 2); // làm mượt Laplace: ít lượt thì kéo về giữa, 1 lần sai không làm đổi hẳn kết luận
      const rn = (R && Number(R.n)) || 0;
      if (rn >= W.learnerRecentMinN) p = (1 - W.learnerRecentWeight) * p + W.learnerRecentWeight * (((Number(R.ok) || 0) + 1) / (rn + 2));
      return { n, p, v: Math.max(0, (p - chance) / (1 - chance)) };
    };
    const cp = part(c.c, c.rc, 0.25), tp = part(c.t, c.rt, 0);
    const n = (cp ? cp.n : 0) + (tp ? tp.n : 0);
    if (n <= 0) return none;
    return {
      n, ability: ((cp ? cp.n * cp.v : 0) + (tp ? tp.n * tp.v : 0)) / n,
      choiceN: cp ? cp.n : 0, choiceCorrected: cp ? cp.v : null,
      typedN: tp ? tp.n : 0, typedRate: tp ? tp.p : null,
    };
  }
  // Kỹ năng này có TỤT LẠI so với mức giữa của các kỹ năng KHÁC của chính người học không (cả hai phía đủ mẫu)? → { gap, ability, ref, n } | null.
  // Cố ý KHÔNG dùng ngưỡng tuyệt đối: nhớ chủ động vốn khó hơn nhận diện (cùng triết lý lib/skill-pooled.js).
  function learnerGap(learner, skill) {
    const W = WEIGHTS, me = learnerSkill(learner, skill);
    if (me.n < W.learnerGapMinN || me.ability == null) return null;
    const refs = [];
    for (const sk of Object.keys((learner && learner.skills) || {})) {
      if (sk === skill) continue;
      const o = learnerSkill(learner, sk);
      if (o.n >= W.learnerGapMinN && o.ability != null) refs.push(o.ability);
    }
    if (!refs.length) return null;
    const ref = median(refs), gap = ref - me.ability;
    return gap >= W.learnerGapMin ? { gap, ability: me.ability, ref, n: me.n } : null;
  }
  // Điểm cộng cấp người học cho 1 dạng TRẮC NGHIỆM của kỹ năng `skill` (0 nếu không có learner).
  // AUDIT V127: "thu thêm dữ liệu" chỉ có nghĩa khi CÓ ÍT NHẤT 1 kỹ năng đã đủ mẫu để so sánh. Người mới / lâu không học (server gửi
  // learner rỗng { v:1, skills:{} }): mọi kỹ năng đều thiếu → cộng +0.5 đồng đều cho MỌI câu trắc nghiệm không mang thông tin gì,
  // chỉ làm câu tự gõ tụt hạng so với V126 (đo được: −6.8% câu tự gõ). Không có đối chứng → 0 (chạy y như V126/learner=null).
  function learnerHasContrast(learner) {
    const sk = learner && learner.skills;
    if (!sk || typeof sk !== 'object') return false;
    return Object.keys(sk).some(k => learnerSkill(learner, k).n >= WEIGHTS.learnerMinN);
  }
  function learnerBonus(learner, skill) {
    if (!learner) return 0;
    const W = WEIGHTS, me = learnerSkill(learner, skill);
    if (!learnerHasContrast(learner)) return 0;
    if (me.n < W.learnerMinN) return W.learnerDataMax * (1 - me.n / W.learnerMinN); // chưa đủ mẫu → chỉ thu thêm dữ liệu, KHÔNG kết luận yếu
    const g = learnerGap(learner, skill);
    if (!g) return 0;
    return Math.min(W.learnerWeakMax, W.learnerWeakBase + W.learnerWeakSlope * (g.gap - W.learnerGapMin)) * (g.n / (g.n + 10));
  }
  // Đã có bằng chứng NHỚ CHỦ ĐỘNG (tự gõ) đủ tin cậy cho kỹ năng 'recall' chưa?
  function productionProven(learner) {
    const me = learnerSkill(learner, 'recall');
    return me.typedN >= WEIGHTS.productionMinN && me.typedRate != null && me.typedRate >= WEIGHTS.productionOkRate;
  }
  // Nhận diện (chọn đáp án) đã khá vững nhưng CHƯA đủ lượt tự gõ để biết có tự nhớ ra chữ Hán không → đáng thu thêm bằng chứng
  // (review.js thêm vài câu tự gõ dạng LUYỆN BỔ SUNG — không phải thẻ FSRS). false khi không có learner (người mới/mất mạng).
  function recallProbeNeeded(learner) {
    if (!learner) return false;
    const W = WEIGHTS, me = learnerSkill(learner, 'recall');
    return me.choiceN >= W.learnerGapMinN && me.choiceCorrected != null && me.choiceCorrected >= W.probeChoiceMinCorrected && me.typedN < W.productionMinN;
  }
  // Nhãn loại bài đã lưu ở server (exercise_type) → typeId của bộ dựng câu. Nhãn lạ → null (bỏ qua, không đoán).
  const EX_ALIAS = { 'quiz-hz2vi': 'hz2vi', 'quiz-vi2hz': 'vi2hz', 'quiz-py2hz': 'py2hz', 'type-vi2hz': 'typeVi2hz', 'listen-choose-hz': 'listen2hz' }; // các tab luyện khác
  let _exMap = null;
  function typeIdOfExercise(label) {
    if (!label) return null;
    if (!_exMap) {
      _exMap = Object.assign({}, EX_ALIAS);
      for (const id of Object.keys(QE.TYPES)) {
        const T = QE.TYPES[id];
        if (T.exerciseFsrs) _exMap[T.exerciseFsrs] = id;
        if (T.exercisePractice && !_exMap[T.exercisePractice]) _exMap[T.exercisePractice] = id;
      }
    }
    return _exMap[label] || null;
  }

  function scoreType(typeId, skill, profile, session, word, extra) {
    const W = WEIGHTS;
    const remaining = extra && Number.isFinite(extra.remaining) ? extra.remaining : 0;
    const longQueue = remaining > W.longQueue;
    let s = W.base[typeId] != null ? W.base[typeId] : 1;
    const p = profile && profile[skill];
    const tough = struggling(session);
    const T = QE.TYPES[typeId];
    const isTyped = !!(T && T.typed);
    if (isTyped) {
      // Tự nhập: KHÔNG hưởng thưởng "kỹ năng yếu" của trắc nghiệm (gõ khi chưa vững chỉ gây nản, không thêm thông tin).
      const lvl = levelOf(p);
      if (lvl === 'good' && (p.attempts || 0) >= W.typedMinAttempts) s += W.typedMasteryBonus;
      else if (lvl === 'developing') s -= W.typedDevelopingPenalty;
      else s -= W.typedNotReadyPenalty;
      if (tough) s -= W.typedStrugglePenalty;
      if (word && (word.state === 1 || word.state === 3)) s -= W.typedLearningPenalty; // thẻ đang Learning/Relearning
      if (word && (Number(word.difficulty) >= 8 || Number(word.lapses) >= 3)) s -= W.typedHardWordPenalty;
      if (longQueue) s -= W.typedLongQueuePenalty; // còn nhiều thẻ → câu gõ chậm, để dành khi hàng đợi ngắn
    } else if (p && p.status === 'weak') {
      const sc = p.score == null ? WEAK_THRESHOLD : p.score;
      s += (W.weakMin + W.weakSlope * Math.max(0, WEAK_THRESHOLD - sc)) * (tough ? W.struggleWeakDamp : 1);
    } else if (!p || p.status === 'insufficient') {
      s += W.dataMax / (1 + ((p && p.attempts) || 0));
    } else if (p.status === 'ok' && p.fragile) {
      s += W.fragileBonus; // đúng nhưng chậm: chưa phải "đã vững" → củng cố, không trừ điểm
    } else if (p.status === 'ok' && p.score != null && p.score >= W.strongAt
               && !(skill === 'recall' && extra && extra.learner && !productionProven(extra.learner))) { // V127: chọn đúng đáp án ≠ đã tự nhớ ra chữ Hán
      s -= W.strongPenalty;
    }
    if (!isTyped && extra && extra.learner) s += learnerBonus(extra.learner, skill); // V127: số liệu cấp người học (có trần)
    // Khoảng thời gian từ lần kiểm tra trước: kỹ năng ĐÃ có dữ liệu mà lâu chưa kiểm tra → ưu tiên nhẹ (không áp cho thiếu dữ liệu).
    if (p && p.status !== 'insufficient' && Number.isFinite(p.daysSince) && p.daysSince >= 7) {
      s += Math.min(W.staleCap, W.staleBonusPerWeek * Math.floor(p.daysSince / 7));
    }
    // Độ khó của từ theo FSRS: khó → dạng dễ trước; dễ & ổn định → dạng khó hơn (không áp cho câu tự gõ: đã có quy tắc riêng).
    if (!isTyped) {
      const hard = wordHardness(word);
      if (hard === 'hard') { if (EASY_TYPES.includes(typeId)) s += W.hardEasyBonus; else if (HARD_TYPES.includes(typeId)) s -= W.hardHardPenalty; }
      else if (hard === 'easy') { if (HARD_TYPES.includes(typeId)) s += W.easyHardBonus; else if (EASY_TYPES.includes(typeId)) s -= W.easyEasyPenalty; }
      if (longQueue && SLOW_TYPES.includes(typeId)) s -= W.slowTypeLongQueuePenalty;
    }
    if (extra && extra.confused && typeId === 'confusable') s += W.confusionBonus; // từ hay nhầm → bài phân biệt (nếu từ thuộc nhóm)
    if (session) {
      if (session.asked[pairKey(word.hz, typeId)]) s -= W.repeatPair;
      const h = session.history;
      if (h.length && h[h.length - 1].typeId === typeId) {
        s -= W.sameAsPrev;
        if (h.length >= 3 && h.slice(-3).every(x => x.typeId === typeId)) s -= W.streak3;
      }
      s -= Math.min(W.diversityCap, W.diversityPerUse * (session.typeCount[typeId] || 0));
      const sc = session.skillCount; // V127: cân bằng theo KỸ NĂNG (vd 'Nghe' có 2 dạng nên dễ chiếm nhiều chỗ hơn)
      if (sc) {
        let tot = 0; for (const k of Object.keys(sc)) tot += sc[k];
        if (tot >= W.skillShareMinTotal && (sc[skill] || 0) / tot > W.skillShareCap) s -= W.skillSharePenalty;
      }
    }
    if (extra && extra.lastType && extra.lastType === typeId) s -= W.lastTypePenalty; // V127: lần trước (phiên/ngày trước) đã hỏi từ này bằng đúng dạng này
    if (tough && typeId === 'hz2vi') s += W.struggleEasyBonus;
    if (session && word) { // V118: đổi chiều truy xuất sau khi sai chính từ này
      const tr = wordTrail(session, word.hz);
      if (tr.lastWrongSkill && tr.lastWrongSkill !== skill) s += tr.wrongTotal >= 2 ? W.shiftBonusRepeat : W.shiftBonus;
      if (tr.wrongSkills[skill] && tr.wrongTotal >= 2) s -= W.sameSkillAfterWrongPenalty;
    }
    return s;
  }

  // Trả về danh sách dạng ứng viên đã xếp theo điểm (giảm dần).
  function rank(word, opts) {
    const o = opts || {};
    const rand = o.rand || Math.random;
    // 'confusable' (chỉ luyện bổ sung) chỉ được xét khi caller cho phép; từ không thuộc nhóm dễ nhầm sẽ không dựng được → tự bị bỏ qua.
    // V110: câu tự nhập (QE.TYPED_ORDER) chỉ được xét khi người gọi bật allowTyped (người học có thể tắt trong cài đặt).
    let types = (o.only && o.only.length ? o.only
      : QE.MCQ_ORDER.concat(o.allowPracticeOnly ? QE.PRACTICE_ORDER : [], o.allowTyped ? QE.TYPED_ORDER : [], (o.allowPracticeOnly && o.allowTyped) ? QE.PRACTICE_TYPED_ORDER : [])).slice();
    if (!o.allowTyped) types = types.filter(t => !(QE.TYPES[t] && QE.TYPES[t].typed));
    // V110 — CỔNG CỨNG cho câu tự gõ khi hệ thống TỰ chọn: chỉ khi kỹ năng đó đã 'đang phát triển' hoặc 'tốt' với đủ lượt
    // (trắc nghiệm trước, tự gõ sau). Không dựa vào điểm mềm: nếu trắc nghiệm không dựng được (kho từ quá ít), câu tự gõ
    // không được lặng lẽ thế chỗ cho người chưa vững. `forced` = người học CHỌN TƯỜNG MINH chế độ tự gõ → không bị cổng này chặn.
    if (!o.forced) {
      types = types.filter(t => {
        const T = QE.TYPES[t];
        if (!T || !T.typed) return true;
        const p = o.profile && o.profile[T.skill];
        const lvl = levelOf(p);
        return (lvl === 'good' || lvl === 'developing') && ((p && p.attempts) || 0) >= WEIGHTS.typedMinAttempts && !(p && p.fragile);
      });
    }
    if (o.exclude) types = types.filter(t => !o.exclude.includes(t));
    if (!o.allowPracticeOnly) types = types.filter(t => !QE.TYPES[t].practiceOnly);
    if (o.fsrsOnly) types = types.filter(t => QE.TYPES[t].exerciseFsrs);
    const scored = types.map((t, i) => ({
      typeId: t, order: i,
      score: scoreType(t, QE.TYPES[t].skill, o.profile, o.session, word, { remaining: o.remaining, confused: !!(o.confusions && o.confusions.length), learner: o.learner, lastType: typeIdOfExercise(o.lastExerciseType) }) + rand() * 1e-6, // phá hoà ổn định
    }));
    scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    return scored;
  }

  // Chọn + dựng câu hỏi. Thử lần lượt các dạng theo điểm; dạng nào không dựng được câu hợp lệ thì bỏ qua.
  // Không dạng nào dựng được (kho từ quá ít) → hạ chuẩn: cho phép 2 lựa chọn với hz2vi; vẫn không được → null.
  // Lý do NGẮN vì sao hệ thống chọn dạng này — CHỈ khi dữ liệu thật sự hỗ trợ (không bịa). Ưu tiên lý do mạnh nhất.
  // Không giải thích khi dạng bị ép (vd câu kiểm tra ngay sau xem từ mới): khi đó "chọn" không phải quyết định của bộ chọn.
  function explainChoice(q, profile, word, session, opts) {
    const p = profile && profile[q.skill];
    const nm = SK_NAME[q.skill] || q.skill;
    const pct = (x) => Math.round(x * 100) + '%';
    if (q.confusionInjected) return `Có đáp án “${q.confusionInjected.text}” vì bạn từng chọn nhầm nó nhiều lần với từ này.`;
    { const tr = wordTrail(session, q.hz); if (tr.lastWrongSkill && tr.lastWrongSkill !== q.skill) return `Bạn vừa sai từ này ở dạng ${SK_NAME[tr.lastWrongSkill] || tr.lastWrongSkill}, nên lần này đổi cách nhớ sang ${nm}.`; } // V118
    if (q.typed) return `Bạn đã làm tốt ${nm} (${pct(p.score)}) ở dạng chọn đáp án, nên lần này thử tự gõ.`;
    if (p && p.status === 'weak') return `${nm} của từ này còn yếu (${pct(p.score)} sau ${p.attempts} lượt) nên ưu tiên dạng này.`;
    if (p && p.fragile) return `Câu trước về ${nm} bạn đúng nhưng hơi chậm — luyện thêm cho chắc.`;
    if (!p || p.status === 'insufficient') return `Chưa đủ dữ liệu về ${nm} của từ này (${(p && p.attempts) || 0} lượt) — hỏi thêm để đánh giá.`;
    if (p && Number.isFinite(p.daysSince) && p.daysSince >= 7) return `Đã ${Math.round(p.daysSince)} ngày chưa kiểm tra ${nm} của từ này.`;
    if (opts && opts.learner && !q.typed) { // V127: lý do cấp người học — chỉ nêu khi thật sự tụt lại (đủ mẫu), không nêu khi chỉ "thu thêm dữ liệu"
      const g = learnerGap(opts.learner, q.skill);
      if (g) return `${nm} của bạn đang thấp hơn các kỹ năng khác (${pct(g.ability)} trên ${g.n} lượt, đã trừ đoán mò) nên ưu tiên dạng này.`;
    }
    const hard = wordHardness(word);
    if (hard === 'hard' && EASY_TYPES.includes(q.typeId)) return 'Từ này đang khó với bạn (theo lịch ôn) nên bắt đầu bằng dạng dễ.';
    if (hard === 'easy' && HARD_TYPES.includes(q.typeId)) return 'Từ này bạn đã nhớ ổn định nên thử dạng khó hơn.';
    if (struggling(session) && q.typeId === 'hz2vi') return 'Bạn vừa sai nhiều câu liên tiếp nên hệ thống cho câu dễ hơn.';
    return null;
  }

  function choose(word, qctx, opts) {
    const o = opts || {};
    const ranked = rank(word, Object.assign({ confusions: qctx && qctx.confusions }, o));
    const ctx = Object.assign({}, qctx, { recentCorrectPositions: (o.session && o.session.recentCorrectPositions) || [] });
    const forced = !!(o.only && o.only.length === 1);
    for (const r of ranked) {
      const q = QE.build(r.typeId, word, ctx);
      if (q) {
        q.chosenScore = r.score;
        q.why = forced ? null : explainChoice(q, o.profile, word, o.session, o);
        return q;
      }
    }
    // Hạ chuẩn (kho từ quá ít) chỉ được dùng hz2vi khi dạng này KHÔNG bị loại (exclude) và nằm trong phạm vi `only`
    // — nếu không, "luyện lại câu sai" sẽ lặng lẽ hỏi lại đúng dạng vừa sai.
    const allowed = !(o.exclude && o.exclude.includes('hz2vi')) && (!o.only || !o.only.length || o.only.includes('hz2vi'));
    if (!allowed) return null;
    return QE.build('hz2vi', word, Object.assign({}, ctx, { minOptions: 2 })) || null;
  }

  return { WEIGHTS, newSession, record, learn, isHesitant, wordHardness, explainChoice, rank, choose, scoreType, struggling, wordTrail,
    learnerSkill, learnerGap, learnerBonus, productionProven, recallProbeNeeded, typeIdOfExercise };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QS;
