// js/question-engine.js — BỘ TẠO CÂU HỎI (V106). THUẦN: không DOM, không mạng, không biến toàn cục của
// ứng dụng — mọi phụ thuộc (kho từ, câu ví dụ, bộ chọn nhiễu, âm thanh) truyền qua `ctx` để kiểm thử
// được trong Node và thay thế được mà không đụng giao diện.
//
// Mỗi DẠNG BÀI là 1 mục trong TYPES (module hoá: muốn thêm dạng mới = thêm 1 mục + 1 hàm dựng).
// QE.build(typeId, word, ctx) trả về câu hỏi HỢP LỆ hoặc null (null = không đủ dữ liệu để tạo câu
// không mơ hồ → bộ chọn sẽ bỏ qua dạng đó cho từ đó, KHÔNG tạo câu không thể trả lời).
//
// ĐẢM BẢO của mọi câu hỏi (kiểm bởi QE.validate, có test):
//   * đúng 1 đáp án đúng; các lựa chọn khác nhau từng đôi một (không trùng nhãn, không trùng nghĩa);
//   * đáp án sai KHÔNG thể bị coi là đúng theo dữ liệu hiện có: lọc trùng nghĩa (khi hỏi theo nghĩa),
//     trùng cách đọc (khi hỏi bằng âm thanh), trùng pinyin (khi chọn pinyin), từ đã xuất hiện trong câu (cloze);
//   * phần đề không để lộ đáp án (câu nghe không hiện chữ Hán/Pinyin; cloze đã khoét từ);
//   * vị trí đáp án đúng không lặp liên tiếp cùng một chỗ.
//
// Chỉ dùng dữ liệu CÓ THẬT: pinyin lấy đúng chuỗi `py` của từ (không tự ghép); câu ví dụ lấy từ
// word_examples / SENTENCES (không do AI sinh); câu ví dụ hiện CHƯA có pinyin nên không hiển thị pinyin câu.

const QE = (function () {
  'use strict';

  // V135: thư viện "sắp xếp câu" dùng chung client/server (js/order-sentence.js). Nạp kiểu UMD nhỏ:
  // Node (require được) thì require; trình duyệt/test vm thì dùng biến toàn cục `OS` (nạp bằng thẻ <script>
  // đứng TRƯỚC file này). Không có thư viện → dạng orderSentence chỉ đơn giản không dựng được (trả null).
  const OS_LIB = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./order-sentence')
    : (typeof OS !== 'undefined' ? OS : null);

  // ── Danh mục dạng bài ───────────────────────────────────────────────────────────────────────
  // quizType: chiều câu hỏi mà server (/api/study/review) tự chấm. answerField: đáp án là nghĩa|chữ Hán|pinyin.
  const TYPES = {
    hz2vi:      { id: 'hz2vi',      label: 'Chữ Hán → Nghĩa',        skill: 'recognition', quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: 'review-hz2vi',      exercisePractice: 'practice-recognition' },
    vi2hz:      { id: 'vi2hz',      label: 'Nghĩa → Chữ Hán',        skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: 'review-vi2hz',      exercisePractice: 'practice-recall' },
    listen2hz:  { id: 'listen2hz',  label: 'Nghe → Chữ Hán',         skill: 'listening',   quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: 'review-listen',     exercisePractice: 'practice-listening',    needsAudio: true },
    listen2vi:  { id: 'listen2vi',  label: 'Nghe → Nghĩa',           skill: 'listening',   quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: 'review-listen-vi',  exercisePractice: 'practice-listening-vi', needsAudio: true },
    hz2py:      { id: 'hz2py',      label: 'Chữ Hán → Pinyin',       skill: 'pinyin',      quizType: 'hz2py', answerField: 'py', exerciseFsrs: 'review-hz2py',      exercisePractice: 'practice-pinyin' },
    cloze:      { id: 'cloze',      label: 'Điền từ vào câu',        skill: 'context',     quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: 'review-cloze',      exercisePractice: 'practice-context',      needsExample: true },
    // V110 — câu TỰ NHẬP đáp án (không có lựa chọn). `typed` = 'hz' | 'py': server chấm bằng js/answer-match.js.
    // Có cả bản FSRS chính thức (exerciseFsrs) lẫn bản luyện bổ sung (exercisePractice), cùng kỹ năng với bản trắc nghiệm.
    typeVi2hz:  { id: 'typeVi2hz',  label: 'Nghĩa → Gõ chữ Hán',     skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: 'review-vi2hz-typed', exercisePractice: 'practice-recall-typed', typed: 'hz' },
    typeHz2py:  { id: 'typeHz2py',  label: 'Chữ Hán → Gõ pinyin',    skill: 'pinyin',      quizType: 'hz2py', answerField: 'py', exerciseFsrs: 'review-hz2py-typed', exercisePractice: 'practice-pinyin-typed', typed: 'py' },
    // Chỉ luyện bổ sung (không đi đường FSRS): đáp án chọn trong nhóm chữ dễ nhầm có chú giải kiểm chứng sẵn.
    // V115 — LUYỆN THANH ĐIỆU: nghe → chọn cách đọc đúng; các đáp án nhiễu là CÙNG chữ nhưng ĐỔI THANH (không phải từ thật → khác nguyên tắc
    // "chỉ dùng pinyin có thật" của các dạng khác, và đó là chủ ý: bài này luyện đúng chỗ người học Việt hay lẫn — phân biệt thanh bằng tai).
    // Chỉ luyện bổ sung (không đi đường FSRS). Chấm bằng so khớp chuỗi với pinyin chuẩn của từ nên dùng chung quizType 'hz2py'.
    listen2tone: { id: 'listen2tone', label: 'Nghe → Chọn thanh điệu', skill: 'listening', quizType: 'hz2py', answerField: 'py', exerciseFsrs: null, exercisePractice: 'practice-listening-tone', practiceOnly: true, needsAudio: true },
    // ── V117: dạng bài bổ sung — TẤT CẢ chỉ luyện bổ sung (practiceOnly: không đi đường FSRS, không đổi lịch ôn). ──────
    // Chỉ dùng dữ liệu có thật của từ (py / vi / hanviet). Bộ dựng trả null khi dữ liệu không đủ để câu hỏi không mơ hồ.
    py2hz:      { id: 'py2hz',      label: 'Pinyin → Chữ Hán',       skill: 'recall',      quizType: 'py2hz', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-py2hz',  practiceOnly: true },
    py2vi:      { id: 'py2vi',      label: 'Pinyin → Nghĩa',         skill: 'recognition', quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: null, exercisePractice: 'practice-py2vi',  practiceOnly: true },
    vi2py:      { id: 'vi2py',      label: 'Nghĩa → Pinyin',         skill: 'pinyin',      quizType: 'hz2py', answerField: 'py', exerciseFsrs: null, exercisePractice: 'practice-vi2py',  practiceOnly: true },
    hz2hv:      { id: 'hz2hv',      label: 'Chữ Hán → Hán Việt',     skill: 'recognition', quizType: 'hz2hv', answerField: 'hv', exerciseFsrs: null, exercisePractice: 'practice-hanviet', practiceOnly: true },
    // Nghe → tự gõ chữ Hán: chỉ dựng khi KHÔNG có từ nào khác trong kho cùng cách đọc (đồng âm không phân biệt được bằng tai).
    listen2type: { id: 'listen2type', label: 'Nghe → Gõ chữ Hán',    skill: 'listening',   quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-listening-typed', practiceOnly: true, typed: 'hz', needsAudio: true },
    confusable: { id: 'confusable', label: 'Phân biệt chữ dễ nhầm',  skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: null,                exercisePractice: 'practice-confusable',   practiceOnly: true },
    // ── V132: dạng CHỈ BẤM CHỌN (không gõ phím, không ghi âm, không cần âm thanh) — tất cả chỉ luyện bổ sung, không đổi lịch FSRS. ──
    // Hán Việt: chỉ dựng khi Hán Việt của từ là DUY NHẤT trong kho (nhiều từ cùng âm Hán Việt thì đề không xác định được 1 đáp án).
    hv2vi:      { id: 'hv2vi',      label: 'Hán Việt → Nghĩa',        skill: 'recognition', quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: null, exercisePractice: 'practice-hv2vi', practiceOnly: true },
    hv2hz:      { id: 'hv2hz',      label: 'Hán Việt → Chữ Hán',      skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-hv2hz', practiceOnly: true },
    vi2hv:      { id: 'vi2hv',      label: 'Nghĩa → Hán Việt',        skill: 'recall',      quizType: 'hz2hv', answerField: 'hv', exerciseFsrs: null, exercisePractice: 'practice-vi2hv', practiceOnly: true },
    // V133 — "A hay B?": câu 2 lựa chọn giữa đáp án đúng và đúng đáp án bạn hay chọn nhầm (từ dữ liệu lỗi thật). Cần ctx.duelWith = từ gây nhầm.
    duelHz2vi:  { id: 'duelHz2vi',  label: 'A hay B? Chữ Hán → Nghĩa',   skill: 'recognition', quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: null, exercisePractice: 'practice-duel-recognition', practiceOnly: true },
    duelVi2hz:  { id: 'duelVi2hz',  label: 'A hay B? Nghĩa → Chữ Hán',   skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-duel-recall',      practiceOnly: true },
    duelHz2py:  { id: 'duelHz2py',  label: 'A hay B? Chữ Hán → Pinyin',  skill: 'pinyin',      quizType: 'hz2py', answerField: 'py', exerciseFsrs: null, exercisePractice: 'practice-duel-pinyin',      practiceOnly: true },
    // V134 — ĐÚNG/SAI: hiện 1 khẳng định (đáp án đúng, hoặc đáp án của một từ khác) rồi chạm Đúng / Sai. Cần ctx.tfTruth (true = khẳng định đúng).
    // Câu 2 đáp án (đoán mò 50%) nên server ghi 'binary': lưu nhật ký, KHÔNG cộng điểm kỹ năng.
    tfHz2vi:    { id: 'tfHz2vi',    label: 'Đúng/Sai: Chữ Hán → Nghĩa',  skill: 'recognition', quizType: 'hz2vi', answerField: 'vi', exerciseFsrs: null, exercisePractice: 'practice-tf-recognition', practiceOnly: true },
    tfVi2hz:    { id: 'tfVi2hz',    label: 'Đúng/Sai: Nghĩa → Chữ Hán',  skill: 'recall',      quizType: 'vi2hz', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-tf-recall',      practiceOnly: true },
    tfHz2py:    { id: 'tfHz2py',    label: 'Đúng/Sai: Chữ Hán → Pinyin', skill: 'pinyin',      quizType: 'hz2py', answerField: 'py', exerciseFsrs: null, exercisePractice: 'practice-tf-pinyin',      practiceOnly: true },
    // Nhìn chữ Hán → chọn cách đọc đúng thanh điệu (nhiễu = cùng chữ, đổi thanh của 1 âm tiết). Giống listen2tone nhưng bằng mắt.
    hz2tone:    { id: 'hz2tone',    label: 'Chữ Hán → Chọn thanh điệu', skill: 'pinyin',    quizType: 'hz2py', answerField: 'py', exerciseFsrs: null, exercisePractice: 'practice-hz2tone', practiceOnly: true },
    // V135 — SẮP XẾP CÂU: hiện nghĩa tiếng Việt + từ đang học, các "mảnh" (theo TỪ) bị xáo trộn, người học chạm xếp lại.
    // Chỉ luyện bổ sung (không đi đường FSRS). Câu lấy từ SENTENCES / word_examples (dữ liệu THẬT, không AI sinh lúc làm bài).
    // Chấm theo CHUỖI ĐÃ CHUẨN HOÁ (js/order-sentence.js) nên không phụ thuộc cách tách mảnh.
    orderSentence: { id: 'orderSentence', label: 'Sắp xếp câu', skill: 'context', quizType: 'order-sentence', answerField: 'hz', exerciseFsrs: null, exercisePractice: 'practice-order-sentence', practiceOnly: true, needsExample: true, order: true },
    // ── V138 — CÂU HỎI THEO CÂU (thay trắc nghiệm từ đơn lẻ trong "Hôm nay học"). Đáp án lấy từ CÂU THẬT của từ
    // (word_examples / js/sentences-data), KHÔNG phải một trường của từ. quizType 'sentence' → server tự tra lại
    // câu trong dữ liệu thật rồi chấm (api/index.js: resolveSentenceAnswer). `sentenceField`: 'vi' = đáp án là nghĩa
    // của cả câu; 'zh' = đáp án là cả câu chữ Hán. `sentence: true` → validate riêng (validateSentence).
    sent2vi:      { id: 'sent2vi',      label: 'Câu → Nghĩa',          skill: 'context',   quizType: 'sentence', answerField: 'vi', sentenceField: 'vi', sentence: true, exerciseFsrs: 'review-sent2vi',      exercisePractice: 'practice-sent2vi',      needsExample: true },
    vi2sent:      { id: 'vi2sent',      label: 'Nghĩa → Câu',          skill: 'context',   quizType: 'sentence', answerField: 'zh', sentenceField: 'zh', sentence: true, exerciseFsrs: 'review-vi2sent',      exercisePractice: 'practice-vi2sent',      needsExample: true },
    listenSent2vi: { id: 'listenSent2vi', label: 'Nghe câu → Nghĩa',   skill: 'listening', quizType: 'sentence', answerField: 'vi', sentenceField: 'vi', sentence: true, exerciseFsrs: 'review-listen-sent',  exercisePractice: 'practice-listen-sent',  needsExample: true, needsAudio: true },
    sentPick:     { id: 'sentPick',     label: 'Chọn câu có dùng từ',  skill: 'context',   quizType: 'sentence', answerField: 'zh', sentenceField: 'zh', sentence: true, exerciseFsrs: 'review-sent-pick',    exercisePractice: 'practice-sent-pick',    needsExample: true },
  };
  const MCQ_ORDER = ['hz2vi', 'vi2hz', 'listen2hz', 'listen2vi', 'hz2py', 'cloze']; // thứ tự ưu tiên khi hoà điểm
  const PRACTICE_ORDER = ['confusable', 'py2hz', 'py2vi', 'vi2py', 'hz2hv'];       // V117: dạng chỉ luyện bổ sung (trắc nghiệm)
  const PRACTICE_TYPED_ORDER = ['listen2type'];                                      // V117: dạng tự nhập chỉ luyện bổ sung
  const DUEL_ORDER = ['duelHz2vi', 'duelVi2hz', 'duelHz2py'];                       // V133: câu "A hay B?" (chỉ chạy khi người học chọn chế độ riêng, kèm ctx.duelWith)
  const TF_ORDER = ['tfHz2vi', 'tfVi2hz', 'tfHz2py'];                                 // V134: câu Đúng/Sai (chỉ chạy khi người học chọn chế độ riêng, kèm ctx.tfTruth)
  const HV_ORDER = ['hv2vi', 'hv2hz', 'vi2hv'];                                      // V132: nhóm Hán Việt (chỉ bấm chọn; chỉ chạy khi người học chọn chế độ riêng)
  const TYPED_ORDER = ['typeVi2hz', 'typeHz2py'];                                   // V110: chỉ được xét khi người gọi bật allowTyped
  // V135: "Sắp xếp câu" — CHỈ chạy khi người gọi yêu cầu đích danh (chế độ riêng hoặc chèn chủ động vào buổi học).
  // KHÔNG nằm trong PRACTICE_ORDER để không tự chen vào mọi câu của buổi (mỗi câu cần câu ví dụ + tương tác chậm hơn).
  const ORDER_ORDER = ['orderSentence'];
  // V138: câu hỏi THEO CÂU cho thẻ FSRS chính thức (và câu kiểm tra/luyện thêm). Thứ tự ưu tiên khi hoà điểm;
  // dạng nào không dựng được (từ chưa có câu ví dụ) thì bộ chọn thử dạng kế tiếp, hết thì trả null (KHÔNG rơi về
  // trắc nghiệm từ đơn lẻ). `cloze` cũng là câu hỏi theo câu nên nằm trong danh sách này.
  const SENTENCE_ORDER = ['sent2vi', 'vi2sent', 'listenSent2vi', 'cloze', 'sentPick'];

  // ── Chuẩn hoá ──────────────────────────────────────────────────────────────────────────────
  function normText(s) {
    return String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // Tập nghĩa của 1 từ: tách theo ; , / ， 、 và bỏ phần chú thích trong ngoặc.
  function meaningSet(vi) {
    const out = new Set();
    String(vi || '').replace(/[（(][^）)]*[）)]/g, ' ').split(/[;,，、/]+/).forEach(t => {
      const n = normText(t).replace(/[.!?~"'“”]/g, '').trim();
      if (n) out.add(n);
    });
    const whole = normText(vi);
    if (whole) out.add(whole);
    return out;
  }
  function meaningsOverlap(a, b) {
    const A = meaningSet(a), B = meaningSet(b);
    for (const t of A) if (B.has(t)) return true;
    return false;
  }
  // Khoá pinyin để so sánh: giữ dấu thanh (khác thanh = khác âm), bỏ khoảng trắng/dấu nháy.
  function pyKey(py) { return normText(py).replace(/[\s'’·\-]/g, ''); }

  function defaultRand() { return Math.random(); }
  function shuffled(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function countOccurrences(text, sub) {
    if (!sub) return 0;
    let n = 0, i = 0;
    while ((i = text.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
    return n;
  }

  // ── Chọn nhiễu ─────────────────────────────────────────────────────────────────────────────
  // `eligible(candidate)` loại mọi ứng viên có thể bị coi là đáp án đúng. Ưu tiên bộ chọn nhiễu "nặng"
  // (ctx.heavy = pickHeavyDistractors) — nhưng nhiễu nặng chỉ được dùng SAU khi qua bộ lọc mơ hồ.
  function pickDistractors(word, ctx, need, eligible, preferHeavy) {
    const rand = ctx.rand || defaultRand;
    const seen = new Set([word.hz]);
    const pool = (ctx.pool || []).filter(x => x && x.hz && !seen.has(x.hz) && (seen.add(x.hz), true) && eligible(x));
    let ranked = pool;
    if (preferHeavy && typeof ctx.heavy === 'function' && pool.length) {
      try { ranked = ctx.heavy(word, pool, pool.length, { mode: 'text', answerField: 'hz' }) || pool; } catch { ranked = pool; }
    } else {
      ranked = shuffled(pool, rand);
    }
    return ranked.slice(0, need);
  }

  // Xếp đáp án đúng vào vị trí KHÔNG trùng vị trí đúng của câu trước (nếu có ≥2 vị trí).
  function placeCorrect(correctOpt, distractorOpts, ctx) {
    const rand = ctx.rand || defaultRand;
    const n = distractorOpts.length + 1;
    const recent = ctx.recentCorrectPositions || [];
    const last = recent.length ? recent[recent.length - 1] : -1;
    let positions = [];
    for (let i = 0; i < n; i++) positions.push(i);
    if (n > 1 && last >= 0) {
      const filtered = positions.filter(p => p !== last);
      // 2 câu liền trước cùng 1 vị trí → chắc chắn tránh; còn lại tránh vị trí vừa rồi.
      if (filtered.length) positions = filtered;
    }
    const pos = positions[Math.floor(rand() * positions.length)];
    const rest = shuffled(distractorOpts, rand);
    const options = rest.slice(0, pos).concat([correctOpt], rest.slice(pos));
    return { options, correctIndex: pos };
  }

  function optionOf(field, w) {
    if (field === 'hz') return { key: w.hz, label: w.hz, sub: null };
    if (field === 'py') return { key: w.py, label: w.py, sub: null };
    if (field === 'hv') return { key: w.hanviet, label: w.hanviet, sub: null };
    return { key: w.vi, label: w.vi, sub: null };
  }

  function explain(typeId, word, extra) {
    const hv = word.hanviet ? ` · Hán Việt: ${word.hanviet}` : '';
    const base = `${word.hz} (${word.py || '—'}) = ${word.vi}${hv}`;
    if (typeId === 'confusable' && extra && extra.tip) return [base, extra.tip];
    if (typeId === 'cloze' && extra && extra.sentence) {
      return [
        `Câu hoàn chỉnh: ${extra.sentence.zh}`,
        extra.sentence.vi ? `Nghĩa: ${extra.sentence.vi}` : '',
        base,
        'Pinyin của cả câu: chưa có trong dữ liệu nên chưa hiển thị.',
      ].filter(Boolean);
    }
    if (typeId === 'listen2hz' || typeId === 'listen2vi') return [`Bạn vừa nghe: ${base}`];
    if (typeId === 'listen2tone') return [`Bạn vừa nghe: ${base}`, `Thanh điệu của từ này: ${toneSequence(word.py).map(t => 'thanh ' + t).join(' + ')}.`];
    if (typeId === 'tfHz2vi' || typeId === 'tfVi2hz' || typeId === 'tfHz2py') {
      const t = extra && extra.tf;
      return [t ? (t.truth ? 'Khẳng định này ĐÚNG.' : `Khẳng định này SAI — đáp án đúng là “${t.correct}”.`) : '', base].filter(Boolean);
    }
    if (typeId === 'duelHz2vi' || typeId === 'duelVi2hz' || typeId === 'duelHz2py') {
      const d = extra && extra.donor;
      return [base, d ? `Bạn hay nhầm với ${d.hz} (${d.py || '—'}) = ${d.vi}.` : '', extra && extra.tip ? extra.tip : ''].filter(Boolean);
    }
    if (typeId === 'hz2hv' || typeId === 'hv2vi' || typeId === 'hv2hz' || typeId === 'vi2hv') return [base];
    if (typeId === 'hz2tone') return [base, `Thanh điệu của từ này: ${toneSequence(word.py).map(t => 'thanh ' + t).join(' + ')}.`];
    if (typeId === 'listen2type') return [`Bạn vừa nghe: ${base}`];
    if (typeId === 'orderSentence' && extra && extra.order) {
      return [
        `Câu đúng: ${extra.order.zh}`,
        extra.order.vi ? `Nghĩa: ${extra.order.vi}` : '',
        base,
      ].filter(Boolean);
    }
    if (TYPES[typeId] && TYPES[typeId].sentence && extra && extra.sentence) {
      return [
        `Câu đầy đủ: ${extra.sentence.zh}`,
        extra.sentence.vi ? `Nghĩa cả câu: ${extra.sentence.vi}` : '',
        base,
        'Pinyin của cả câu: chưa có trong dữ liệu nên chưa hiển thị.',
      ].filter(Boolean);
    }
    if (typeId === 'hz2py' || typeId === 'typeHz2py') return [`${word.hz} đọc là ${word.py} (${word.vi}).`];
    return [base];
  }

  // ── Dựng từng dạng ─────────────────────────────────────────────────────────────────────────
  function assemble(typeId, word, ctx, prompt, distractors, extra) {
    const T = TYPES[typeId];
    const correct = optionOf(T.answerField, word);
    const placed = placeCorrect(correct, distractors.map(d => optionOf(T.answerField, d)), ctx);
    const q = {
      typeId, hz: word.hz, l: word.l, word,
      skill: T.skill, quizType: T.quizType,
      exerciseFsrs: T.exerciseFsrs, exercisePractice: T.exercisePractice,
      fsrsEligible: !T.practiceOnly,
      prompt,
      options: placed.options, correctIndex: placed.correctIndex, correctKey: correct.key,
      explanation: explain(typeId, word, extra),
      tip: (extra && extra.tip) || null,
      sentence: (extra && extra.sentence) || null,
    };
    return q;
  }

  function buildHz2Vi(word, ctx) {
    const base = normText(word.vi);
    const ds = pickDistractors(word, ctx, 3, x => x.vi && !meaningsOverlap(x.vi, word.vi) && normText(x.vi) !== base, true);
    return assemble('hz2vi', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} có nghĩa là gì?` }, ds);
  }
  function buildVi2Hz(word, ctx) {
    // Hỏi theo NGHĨA: nhiễu không được trùng nghĩa với đáp án (nếu không có ≥2 đáp án đúng).
    const ds = pickDistractors(word, ctx, 3, x => x.hz && x.vi && !meaningsOverlap(x.vi, word.vi), true);
    return assemble('vi2hz', word, ctx, { kind: 'text', main: word.vi, sub: null, ask: 'Chữ Hán nào có nghĩa này?' }, ds);
  }
  function buildListen2Hz(word, ctx) {
    if (!ctx.audioOk) return null;
    // Hỏi bằng ÂM THANH: nhiễu không được có cùng cách đọc (đồng âm không phân biệt được bằng tai).
    const k = pyKey(word.py);
    if (!k) return null;
    const ds = pickDistractors(word, ctx, 3, x => x.hz && pyKey(x.py) && pyKey(x.py) !== k, true);
    return assemble('listen2hz', word, ctx, { kind: 'audio', audioText: word.hz, ask: 'Nghe và chọn chữ Hán đúng' }, ds);
  }
  function buildListen2Vi(word, ctx) {
    if (!ctx.audioOk) return null;
    const base = normText(word.vi);
    const ds = pickDistractors(word, ctx, 3, x => x.vi && !meaningsOverlap(x.vi, word.vi) && normText(x.vi) !== base, true);
    return assemble('listen2vi', word, ctx, { kind: 'audio', audioText: word.hz, ask: 'Nghe và chọn nghĩa đúng' }, ds);
  }
  // ── V115: thanh điệu ───────────────────────────────────────────────────────────────────────────────────────
  // Nguyên âm có dấu thanh → [thanh 1, 2, 3, 4]. Chỉ xử lý pinyin DẤU THANH (ǎ), không xử lý số thanh (a3) và không tự thêm dấu cho âm nhẹ.
  const TONE_ROWS = ['āáǎà', 'ēéěè', 'īíǐì', 'ōóǒò', 'ūúǔù', 'ǖǘǚǜ'];
  const TONE_OF = {};
  for (const row of TONE_ROWS) [...row].forEach((ch, i) => { TONE_OF[ch] = { row, tone: i + 1 }; });
  // Dãy thanh của một chuỗi pinyin, vd 'zhǔnbèi' → [3, 4]. Âm nhẹ (không dấu) không có mặt trong dãy.
  function toneSequence(py) {
    const out = [];
    for (const ch of String(py == null ? '' : py).normalize('NFC')) if (TONE_OF[ch]) out.push(TONE_OF[ch].tone);
    return out;
  }
  // Tối đa `need` biến thể KHÁC pinyin gốc, mỗi biến thể chỉ đổi thanh của MỘT âm tiết (khác biệt nghe được, dễ so sánh). Thứ tự xáo trộn.
  function toneVariants(py, need, rand) {
    const base = String(py == null ? '' : py).normalize('NFC');
    const chars = [...base];
    const pos = chars.map((ch, i) => (TONE_OF[ch] ? i : -1)).filter(i => i >= 0);
    const out = [], seen = new Set([base]);
    for (const i of pos) {
      const info = TONE_OF[chars[i]];
      for (let t = 1; t <= 4; t++) {
        if (t === info.tone) continue;
        const v = chars.slice(); v[i] = [...info.row][t - 1];
        const str = v.join('');
        if (!seen.has(str)) { seen.add(str); out.push(str); }
      }
    }
    return shuffled(out, rand || defaultRand).slice(0, need);
  }
  function buildListen2Tone(word, ctx) {
    if (!ctx.audioOk) return null;
    const py = String(word.py || '').normalize('NFC').trim();
    // Chỉ từ có ĐÚNG MỘT cách đọc, viết bằng dấu thanh, có ≥ 1 âm tiết mang thanh. Nhiều cách đọc (cháng / zhǎng), số thanh, âm nhẹ hoàn toàn → bỏ qua.
    if (!py || /[\/,;，；、0-9]/.test(py) || !toneSequence(py).length) return null;
    const vs = toneVariants(py, 3, ctx.rand);
    if (vs.length < 2) return null;
    const q = assemble('listen2tone', word, ctx, { kind: 'audio', audioText: word.hz, ask: 'Nghe và chọn cách đọc (thanh điệu) đúng' }, vs.map(v => ({ py: v })));
    return q;
  }
  // V132: nhìn chữ Hán → chọn cách đọc đúng thanh điệu (không cần âm thanh). Cùng điều kiện dữ liệu với listen2tone.
  function buildHz2Tone(word, ctx) {
    const py = String(word.py || '').normalize('NFC').trim();
    if (!py || /[\/,;，；、0-9]/.test(py) || !toneSequence(py).length) return null;
    const vs = toneVariants(py, 3, ctx.rand);
    if (vs.length < 2) return null;
    return assemble('hz2tone', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} đọc đúng (thanh điệu) là gì?` }, vs.map(v => ({ py: v })));
  }
  function buildHz2Py(word, ctx) {
    const k = pyKey(word.py);
    if (!k) return null; // không có pinyin chuẩn trong dữ liệu → không tự tạo
    const seenKeys = new Set([k]);
    const ds = pickDistractors(word, ctx, 3, x => {
      const kk = pyKey(x.py);
      if (!kk || seenKeys.has(kk)) return false;
      seenKeys.add(kk); return true;
    }, true);
    return assemble('hz2py', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} đọc là gì?` }, ds);
  }


  // ── V117: dạng bài bổ sung ─────────────────────────────────────────────────────────────────────────────────
  // Từ có NHIỀU cách đọc (cháng / zhǎng) hoặc pinyin dạng số thanh → bỏ qua: không có đáp án pinyin duy nhất để chấm.
  function singlePy(word) {
    const py = String(word.py || '').normalize('NFC').trim();
    return py && !/[\/,;，；、]/.test(py) ? py : null;
  }
  // Pinyin → chữ Hán. Nhiễu phải KHÁC cách đọc (đồng âm sẽ có ≥ 2 đáp án đúng theo đề). Nếu trong kho còn từ KHÁC
  // cùng cách đọc thì đề (chỉ có pinyin) không xác định được duy nhất 1 chữ → không dựng.
  function buildPy2Hz(word, ctx) {
    const py = singlePy(word), k = pyKey(py);
    if (!py || !k) return null;
    if ((ctx.pool || []).some(x => x && x.hz && x.hz !== word.hz && pyKey(x.py) === k)) return null;
    const ds = pickDistractors(word, ctx, 3, x => x.hz && pyKey(x.py) && pyKey(x.py) !== k, true);
    return assemble('py2hz', word, ctx, { kind: 'text', main: py, sub: null, ask: 'Chữ Hán nào đọc là như vậy?' }, ds);
  }
  // Pinyin → nghĩa. Nhiễu: khác nghĩa VÀ khác cách đọc (từ đồng âm cũng khớp với pinyin của đề nên không được làm nhiễu).
  function buildPy2Vi(word, ctx) {
    const py = singlePy(word), k = pyKey(py);
    if (!py || !k || !word.vi) return null;
    if ((ctx.pool || []).some(x => x && x.hz && x.hz !== word.hz && pyKey(x.py) === k)) return null;
    const ds = pickDistractors(word, ctx, 3, x => x.vi && pyKey(x.py) !== k && !meaningsOverlap(x.vi, word.vi) && normText(x.vi) !== normText(word.vi), true);
    return assemble('py2vi', word, ctx, { kind: 'text', main: py, sub: null, ask: 'Từ có cách đọc này nghĩa là gì?' }, ds);
  }
  // Nghĩa → pinyin. Nhiễu: pinyin KHÁC, và không lấy từ từ cùng nghĩa (có thể cũng là đáp án chấp nhận được).
  function buildVi2Py(word, ctx) {
    const py = singlePy(word), k = pyKey(py);
    if (!py || !k || !word.vi) return null;
    const seen = new Set([k]);
    const ds = pickDistractors(word, ctx, 3, x => {
      const kk = pyKey(x.py);
      if (!kk || seen.has(kk) || !x.vi || meaningsOverlap(x.vi, word.vi)) return false;
      seen.add(kk); return true;
    }, true);
    return assemble('vi2py', word, ctx, { kind: 'text', main: word.vi, sub: null, ask: 'Từ này đọc là gì? (chọn pinyin)' }, ds);
  }
  // Chữ Hán → Hán Việt. Cần từ CÓ trường hanviet (không tự suy ra). Nhiễu: Hán Việt khác (không phân biệt hoa/thường).
  function buildHz2Hv(word, ctx) {
    const hv = String(word.hanviet || '').trim();
    if (!hv) return null;
    const base = normText(hv);
    const seen = new Set([base]);
    const ds = pickDistractors(word, ctx, 3, x => {
      const n = normText(x.hanviet);
      if (!n || seen.has(n)) return false;
      seen.add(n); return true;
    }, false);
    return assemble('hz2hv', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} đọc theo âm Hán Việt là gì?` }, ds);
  }
  // ── V134: Đúng/Sai ───────────────────────────────────────────────────────────────────────────────────────────
  // Khẳng định SAI lấy đáp án của một từ KHÁC (nhiễu hợp lệ như câu trắc nghiệm: khác nghĩa / khác pinyin), nên luôn thật sự sai.
  // `ctx.tfDonor` (tuỳ chọn) ép từ gây nhầm; không có thì chọn nhiễu thông thường (ưu tiên nhiễu "nặng").
  function assembleTf(typeId, word, ctx, prompt, claim, truth, correct, donor) {
    const T = TYPES[typeId];
    return {
      typeId, hz: word.hz, l: word.l, word,
      skill: T.skill, quizType: T.quizType,
      exerciseFsrs: null, exercisePractice: T.exercisePractice, fsrsEligible: false,
      prompt,
      options: [{ key: 'true', label: '✅ Đúng', sub: null }, { key: 'false', label: '❌ Sai', sub: null }],
      correctIndex: truth ? 0 : 1, correctKey: truth ? 'true' : 'false',
      tf: { claim, truth, correct, donorHz: donor ? donor.hz : null },
      explanation: explain(typeId, word, { tf: { truth, correct }, donor }), tip: null, sentence: null,
    };
  }
  function tfTruthOf(ctx) { return ctx.tfTruth === false ? false : (ctx.tfTruth === true ? true : (ctx.rand || defaultRand)() < 0.5); }
  function tfClaimFor(word, ctx, field, eligible) {
    const truth = tfTruthOf(ctx), correct = optionOf(field, word).key;
    if (truth) return { truth, claim: correct, correct, donor: null };
    const donor = ctx.tfDonor && ctx.tfDonor.hz !== word.hz && eligible(ctx.tfDonor) ? ctx.tfDonor : pickDistractors(word, ctx, 1, eligible, true)[0];
    if (!donor) return null;
    const claim = optionOf(field, donor).key;
    if (!claim || normText(claim) === normText(correct)) return null;
    return { truth, claim, correct, donor };
  }
  function buildTfHz2Vi(word, ctx) {
    if (!word.vi) return null;
    const base = normText(word.vi);
    const c = tfClaimFor(word, ctx, 'vi', x => x.vi && !meaningsOverlap(x.vi, word.vi) && normText(x.vi) !== base);
    if (!c) return null;
    return assembleTf('tfHz2vi', word, ctx, { kind: 'text', main: word.hz, sub: null, claim: c.claim, ask: `${word.hz} có nghĩa là “${c.claim}”. Đúng hay sai?` }, c.claim, c.truth, c.correct, c.donor);
  }
  function buildTfVi2Hz(word, ctx) {
    if (!word.vi) return null;
    const c = tfClaimFor(word, ctx, 'hz', x => x.hz && x.vi && !meaningsOverlap(x.vi, word.vi));
    if (!c) return null;
    return assembleTf('tfVi2hz', word, ctx, { kind: 'text', main: word.vi, sub: null, claim: c.claim, ask: `Chữ Hán của nghĩa này là “${c.claim}”. Đúng hay sai?` }, c.claim, c.truth, c.correct, c.donor);
  }
  function buildTfHz2Py(word, ctx) {
    const py = singlePy(word), k = pyKey(py);
    if (!py || !k) return null;
    const c = tfClaimFor(word, ctx, 'py', x => singlePy(x) && pyKey(x.py) && pyKey(x.py) !== k);
    if (!c) return null;
    return assembleTf('tfHz2py', word, ctx, { kind: 'text', main: word.hz, sub: null, claim: c.claim, ask: `${word.hz} đọc là “${c.claim}”. Đúng hay sai?` }, c.claim, c.truth, c.correct, c.donor);
  }

  // ── V133: "A hay B?" ───────────────────────────────────────────────────────────────────────────────────────
  // Tìm TỪ thật trong kho mà đáp án sai (text) tương ứng, kèm TRƯỜNG khớp: 'hz' (nhầm chữ Hán) | 'py' (nhầm pinyin) | 'vi' (nhầm nghĩa).
  // Cùng cách khớp với injectConfusion. Không tìm được (vd người học gõ linh tinh) → null.
  function findDuelDonor(word, text, pool) {
    if (!word || typeof text !== 'string' || !text.trim()) return null;
    const t = text.trim(), nt = normText(t);
    for (const x of (pool || [])) {
      if (!x || !x.hz || x.hz === word.hz) continue;
      if (x.hz === t) return { donor: x, field: 'hz' };
      if (x.py && String(x.py).normalize('NFC').trim() === t.normalize('NFC')) return { donor: x, field: 'py' };
      if (x.vi && normText(x.vi) === nt) return { donor: x, field: 'vi' };
    }
    return null;
  }
  function duelTip(word, donor, ctx) {
    const g = (ctx.confuseGroups || []).find(gr => gr && gr.tip && Array.isArray(gr.chars) && gr.chars.some(c => c.hz === word.hz) && gr.chars.some(c => c.hz === donor.hz));
    return g ? g.tip : null;
  }
  function duelBase(word, ctx) {
    const d = ctx && ctx.duelWith;
    if (!d || !d.hz || d.hz === word.hz) return null;
    return d;
  }
  function buildDuelHz2Vi(word, ctx) {
    const d = duelBase(word, ctx);
    if (!d || !word.vi || !d.vi || meaningsOverlap(word.vi, d.vi) || normText(word.vi) === normText(d.vi)) return null;
    return assemble('duelHz2vi', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} có nghĩa là gì?` }, [d], { donor: d, tip: duelTip(word, d, ctx) });
  }
  function buildDuelVi2Hz(word, ctx) {
    const d = duelBase(word, ctx);
    if (!d || !word.vi || !d.vi || meaningsOverlap(word.vi, d.vi)) return null; // nghĩa trùng → đề không phân biệt được
    return assemble('duelVi2hz', word, ctx, { kind: 'text', main: word.vi, sub: null, ask: 'Chữ Hán nào có nghĩa này?' }, [d], { donor: d, tip: duelTip(word, d, ctx) });
  }
  function buildDuelHz2Py(word, ctx) {
    const d = duelBase(word, ctx);
    if (!d || !singlePy(word) || !singlePy(d) || pyKey(word.py) === pyKey(d.py)) return null;
    return assemble('duelHz2py', word, ctx, { kind: 'text', main: word.hz, sub: null, ask: `${word.hz} đọc là gì?` }, [d], { donor: d, tip: duelTip(word, d, ctx) });
  }

  // ── V132: Hán Việt ────────────────────────────────────────────────────────────────────────────────────────
  // Âm Hán Việt dạng token (tách theo / , ;). Từ chỉ dùng khi có ĐÚNG 1 âm Hán Việt và không từ KHÁC nào trong kho có cùng âm đó
  // (nhiều chữ đồng âm Hán Việt, vd "công", thì đề chỉ có Hán Việt không xác định được duy nhất 1 đáp án → không dựng).
  function hvTokens(h) { return String(h == null ? '' : h).split(/[\/,;，；、]+/).map(normText).filter(Boolean); }
  function hvUnique(word, ctx) {
    const t = hvTokens(word.hanviet);
    if (t.length !== 1) return null;
    if ((ctx.pool || []).some(x => x && x.hz && x.hz !== word.hz && hvTokens(x.hanviet).includes(t[0]))) return null;
    return t[0];
  }
  function buildHv2Vi(word, ctx) {
    if (!word.vi || !hvUnique(word, ctx)) return null;
    const base = normText(word.vi);
    const ds = pickDistractors(word, ctx, 3, x => x.vi && !meaningsOverlap(x.vi, word.vi) && normText(x.vi) !== base, true);
    return assemble('hv2vi', word, ctx, { kind: 'text', main: String(word.hanviet).trim(), sub: null, ask: 'Từ có âm Hán Việt này nghĩa là gì?' }, ds);
  }
  function buildHv2Hz(word, ctx) {
    if (!word.vi || !hvUnique(word, ctx)) return null;
    const ds = pickDistractors(word, ctx, 3, x => x.hz && x.vi && !meaningsOverlap(x.vi, word.vi), true);
    return assemble('hv2hz', word, ctx, { kind: 'text', main: String(word.hanviet).trim(), sub: null, ask: 'Chữ Hán nào có âm Hán Việt này?' }, ds);
  }
  function buildVi2Hv(word, ctx) {
    if (!word.vi || hvTokens(word.hanviet).length !== 1) return null;
    const seen = new Set([hvTokens(word.hanviet)[0]]);
    const ds = pickDistractors(word, ctx, 3, x => {
      const t = hvTokens(x.hanviet);
      if (t.length !== 1 || seen.has(t[0]) || !x.vi || meaningsOverlap(x.vi, word.vi)) return false;
      seen.add(t[0]); return true;
    }, false);
    return assemble('vi2hv', word, ctx, { kind: 'text', main: word.vi, sub: null, ask: 'Từ này có âm Hán Việt là gì?' }, ds);
  }
  function buildListen2Type(word, ctx) {
    if (!ctx.audioOk || !word.hz) return null;
    const k = pyKey(word.py);
    if (!k) return null;
    if ((ctx.pool || []).some(x => x && x.hz && x.hz !== word.hz && pyKey(x.py) === k)) return null; // đồng âm → không chấm công bằng được
    return assembleTyped('listen2type', word, { kind: 'audio', audioText: word.hz, ask: 'Nghe và gõ chữ Hán bạn nghe được' });
  }

  // Câu ví dụ hợp lệ cho cloze: chứa từ ĐÚNG 1 lần (khoét 1 chỗ trống không mơ hồ), độ dài vừa phải.
  function findSentences(word, ctx) {
    const out = [];
    for (const e of (ctx.examples || [])) {
      if (e && e.hz === word.hz && e.zh) out.push({ zh: e.zh, vi: e.vi || '', source: 'example' });
    }
    for (const s of (ctx.sentences || [])) {
      if (!s || !s.hz) continue;
      const hints = String(s.hint || '').split(/[、,，]/).map(t => t.trim()).filter(Boolean);
      if (hints.includes(word.hz)) out.push({ zh: s.hz, vi: s.vi || '', source: 'sentence' });
    }
    return out.filter(s => countOccurrences(s.zh, word.hz) === 1 && s.zh.length <= 40);
  }
  function buildCloze(word, ctx) {
    const rand = ctx.rand || defaultRand;
    const sentences = findSentences(word, ctx);
    if (!sentences.length) return null;
    const sentence = sentences[Math.floor(rand() * sentences.length)];
    const sharesChar = (a, b) => { for (const ch of a) if (b.includes(ch)) return true; return false; };
    // Nhiễu: khác nghĩa, không xuất hiện trong câu, không chung chữ với đáp án, cùng độ dài chữ (cùng dạng).
    // Hạn chế còn lại (nói rõ trong báo cáo): không có dữ liệu loại từ/ngữ pháp để chứng minh nhiễu "không
    // vừa câu"; bản dịch tiếng Việt của câu được hiển thị ngay dưới chỗ trống để khử mơ hồ về nghĩa.
    const ds = pickDistractors(word, ctx, 3, x =>
      x.hz && x.vi && !meaningsOverlap(x.vi, word.vi) && !sentence.zh.includes(x.hz) &&
      !sharesChar(x.hz, word.hz) && [...x.hz].length === [...word.hz].length, false);
    const blanked = sentence.zh.replace(word.hz, '＿＿＿');
    return assemble('cloze', word, ctx,
      { kind: 'cloze', main: blanked, sub: sentence.vi || null, ask: 'Chọn từ điền vào chỗ trống' }, ds, { sentence });
  }
  // ── V135: SẮP XẾP CÂU ────────────────────────────────────────────────────────────────────────
  // Câu lấy từ dữ liệu THẬT (SENTENCES trong giáo trình + word_examples), phải chứa ĐÚNG 1 lần từ đang học
  // (nhờ vậy người học biết mình đang luyện từ nào). Mảnh chữ do js/order-sentence.js cắt theo TỪ; nếu môi
  // trường không có Intl.Segmenter thì lùi về từng chữ Hán — chấm vẫn đúng vì chấm theo chuỗi chuẩn hoá.
  function buildOrderSentence(word, ctx) {
    if (!OS_LIB) return null;
    const rand = ctx.rand || defaultRand;
    const pool = [];
    // Ưu tiên câu ngắn (dễ xếp), sau đó trộn ngẫu nhiên trong nhóm đó để không lặp mãi 1 câu.
    const cands = OS_LIB.fromSentences(word, ctx.sentences || []).concat(OS_LIB.fromExamples(word, ctx.examples || []));
    for (const c of cands) {
      const tiles = OS_LIB.buildTiles(c.zh, rand);
      if (tiles) pool.push({ sentence: c, tiles });
    }
    if (!pool.length) return null;
    const minLen = Math.min.apply(null, pool.map(p => [...OS_LIB.normalize(p.sentence.zh)].length));
    const short = pool.filter(p => [...OS_LIB.normalize(p.sentence.zh)].length <= minLen + 4);
    const pick = short[Math.floor(rand() * short.length)];
    const T = TYPES.orderSentence;
    return {
      typeId: 'orderSentence', hz: word.hz, l: word.l, word,
      skill: T.skill, quizType: T.quizType,
      exerciseFsrs: null, exercisePractice: T.exercisePractice, fsrsEligible: false,
      // Đề KHÔNG hiện chữ Hán của từ (sẽ lộ 1 mảnh): chỉ hiện nghĩa tiếng Việt của câu + nghĩa của từ cần dùng.
      prompt: { kind: 'order', main: pick.sentence.vi, sub: word.vi ? `Câu này dùng từ có nghĩa: ${word.vi}` : null, ask: 'Chạm các mảnh theo đúng thứ tự để ghép thành câu' },
      options: [], correctIndex: -1,
      correctKey: OS_LIB.normalize(pick.sentence.zh),   // server chấm lại từ dữ liệu gốc, đây chỉ để phản hồi tức thời
      order: { sentence: pick.sentence.zh, vi: pick.sentence.vi || '', tiles: pick.tiles, source: pick.sentence.source },
      explanation: explain('orderSentence', word, { order: pick.sentence, tiles: pick.tiles }),
      tip: null, sentence: pick.sentence,
    };
  }
  // ── V138: CÂU HỎI THEO CÂU ─────────────────────────────────────────────────────────────────
  // Dùng CHUNG quy tắc với js/order-sentence.js (server tra lại đúng câu đó khi chấm): câu thật, chứa đúng 1
  // lần từ đang học, dài 4–40 chữ. Câu dùng làm đáp án nhiễu lấy từ CÙNG kho dữ liệu thật (không AI sinh).
  function sentenceOk(zh) {
    if (typeof zh !== 'string') return false;
    const n = [...String(zh).normalize('NFC').replace(/[\s　]+/g, '')].length;
    return n >= 4 && n <= 40;
  }
  function candSentences(word, ctx, needVi) {
    return findSentences(word, ctx).filter(s =>
      (OS_LIB ? OS_LIB.sentenceUsable(s.zh, word.hz) : countOccurrences(s.zh, word.hz) === 1) &&
      (!needVi || normText(s.vi)));
  }
  function sentenceBank(ctx) {
    const out = [];
    for (const e of (ctx.examples || [])) if (e && e.zh && e.vi && sentenceOk(e.zh)) out.push({ zh: e.zh, vi: e.vi });
    for (const s of (ctx.sentences || [])) if (s && s.hz && s.vi && sentenceOk(s.hz)) out.push({ zh: s.hz, vi: s.vi });
    return out;
  }
  function pickSentDistractors(correct, ctx, need, field) {
    const rand = ctx.rand || defaultRand;
    const seenZ = new Set([normText(correct.zh)]), seenV = new Set([normText(correct.vi)]);
    const out = [];
    for (const x of shuffled(sentenceBank(ctx), rand)) {
      const zz = normText(x.zh), vz = normText(x.vi);
      if (!zz || !vz || seenZ.has(zz)) continue;
      if (field === 'vi') { if (seenV.has(vz) || meaningsOverlap(x.vi, correct.vi)) continue; seenV.add(vz); }
      seenZ.add(zz); out.push(x);
      if (out.length >= need) break;
    }
    return out;
  }
  function assembleSentence(typeId, word, ctx, prompt, placed, sentence) {
    const T = TYPES[typeId];
    return {
      typeId, hz: word.hz, l: word.l, word,
      skill: T.skill, quizType: T.quizType,
      exerciseFsrs: T.exerciseFsrs, exercisePractice: T.exercisePractice,
      fsrsEligible: !T.practiceOnly,
      prompt,
      options: placed.options, correctIndex: placed.correctIndex, correctKey: placed.options[placed.correctIndex].key,
      explanation: explain(typeId, word, { sentence }),
      tip: null,
      sentence, // câu THẬT {zh, vi} — để đọc lại cả câu sau khi trả lời + server chấm lại
    };
  }
  // Đọc câu → chọn nghĩa của CẢ CÂU. Đề hiện câu chữ Hán (không hiện nghĩa) → không lộ đáp án.
  function buildSent2Vi(word, ctx) {
    const sents = candSentences(word, ctx, true);
    if (!sents.length) return null;
    const rand = ctx.rand || defaultRand;
    const s = sents[Math.floor(rand() * sents.length)];
    const ds = pickSentDistractors(s, ctx, 3, 'vi');
    if (ds.length < 3) return null;
    const placed = placeCorrect({ key: s.vi, label: s.vi, sub: null }, ds.map(d => ({ key: d.vi, label: d.vi, sub: null })), ctx);
    return assembleSentence('sent2vi', word, ctx, { kind: 'sent', main: s.zh, sub: null, ask: 'Câu này có nghĩa là gì?' }, placed, s);
  }
  // Nghĩa của cả câu → chọn câu chữ Hán đúng.
  function buildVi2Sent(word, ctx) {
    const sents = candSentences(word, ctx, true);
    if (!sents.length) return null;
    const rand = ctx.rand || defaultRand;
    const s = sents[Math.floor(rand() * sents.length)];
    const ds = pickSentDistractors(s, ctx, 3, 'zh');
    if (ds.length < 3) return null;
    const placed = placeCorrect({ key: s.zh, label: s.zh, sub: null }, ds.map(d => ({ key: d.zh, label: d.zh, sub: null })), ctx);
    return assembleSentence('vi2sent', word, ctx, { kind: 'sent', main: s.vi, sub: null, ask: 'Câu nào dưới đây có nghĩa này?' }, placed, s);
  }
  // Nghe CẢ CÂU → chọn nghĩa. Đề không hiện chữ Hán; audioText là câu sẽ được đọc.
  function buildListenSent2Vi(word, ctx) {
    if (!ctx.audioOk) return null;
    const sents = candSentences(word, ctx, true);
    if (!sents.length) return null;
    const rand = ctx.rand || defaultRand;
    const s = sents[Math.floor(rand() * sents.length)];
    const ds = pickSentDistractors(s, ctx, 3, 'vi');
    if (ds.length < 3) return null;
    const placed = placeCorrect({ key: s.vi, label: s.vi, sub: null }, ds.map(d => ({ key: d.vi, label: d.vi, sub: null })), ctx);
    return assembleSentence('listenSent2vi', word, ctx, { kind: 'audio', audioText: s.zh, ask: 'Nghe cả câu và chọn nghĩa đúng' }, placed, s);
  }
  // Chọn câu CÓ dùng từ đang học (đúng 1 đáp án): nhiễu là câu thật KHÔNG chứa từ này.
  function buildSentPick(word, ctx) {
    const sents = candSentences(word, ctx, false);
    if (!sents.length) return null;
    const rand = ctx.rand || defaultRand;
    const s = sents[Math.floor(rand() * sents.length)];
    const pool = sentenceBank(ctx).filter(x => x.zh !== s.zh && !String(x.zh).includes(word.hz));
    const seen = new Set([normText(s.zh)]), ds = [];
    for (const x of shuffled(pool, rand)) {
      const k = normText(x.zh);
      if (!k || seen.has(k)) continue;
      seen.add(k); ds.push(x);
      if (ds.length >= 3) break;
    }
    if (ds.length < 3) return null;
    const placed = placeCorrect({ key: s.zh, label: s.zh, sub: null }, ds.map(d => ({ key: d.zh, label: d.zh, sub: null })), ctx);
    return assembleSentence('sentPick', word, ctx, { kind: 'sentWord', main: word.vi, sub: null, ask: `Câu nào dùng đúng từ 「${word.hz}」 (${word.vi})?` }, placed, s);
  }
  function buildConfusable(word, ctx) {
    const groups = ctx.confuseGroups || [];
    const g = groups.find(gr => gr && Array.isArray(gr.chars) && gr.tip && gr.chars.some(c => c.hz === word.hz));
    if (!g || g.chars.length < 2) return null;
    const others = g.chars.filter(c => c.hz !== word.hz && c.vi && !meaningsOverlap(c.vi, word.vi)).map(c => ({ hz: c.hz, py: c.py, vi: c.vi }));
    if (!others.length) return null;
    const q = assemble('confusable', word, ctx, { kind: 'text', main: word.vi, sub: null, ask: 'Chữ nào có nghĩa này? (các chữ rất dễ nhầm)' }, others.slice(0, 3), { tip: g.tip });
    return q;
  }


  // ── V110: câu tự nhập ───────────────────────────────────────────────────────────────────────
  // Nghĩa → tự gõ chữ Hán. Mơ hồ nếu có từ KHÁC trùng nghĩa: cùng pinyin → không dựng (không thể phân biệt bằng đề);
  // khác pinyin → hiện pinyin làm gợi ý khử mơ hồ (đánh dấu hinted để bộ chọn/hiển thị biết đây là bài có gợi ý).
  function buildTypeVi2Hz(word, ctx) {
    if (!word.vi || !word.hz) return null;
    const pool = (ctx.pool || []).filter(x => x && x.hz && x.hz !== word.hz && x.vi && meaningsOverlap(x.vi, word.vi));
    const k = pyKey(word.py);
    if (pool.some(x => !k || !pyKey(x.py) || pyKey(x.py) === k)) return null; // không đủ dữ liệu để khử mơ hồ
    const hint = pool.length ? word.py : null;
    const q = assembleTyped('typeVi2hz', word, { kind: 'text', main: word.vi, sub: hint ? `Gợi ý pinyin: ${hint}` : null, ask: 'Gõ chữ Hán có nghĩa này' });
    if (q) q.hinted = !!hint;
    return q;
  }
  // Chữ Hán → tự gõ pinyin. Cần pinyin chuẩn hợp lệ trong dữ liệu (không tự ghép/đoán).
  function buildTypeHz2Py(word, ctx) {
    const amod = answerMatcher();
    if (!amod || !word.py || !word.hz) return null;
    const alts = amod.splitAlternatives(word.py);
    if (!alts.length || !alts.every(a => amod.parsePinyin(a))) return null; // pinyin chứa ký tự lạ → không chấm được tin cậy
    return assembleTyped('typeHz2py', word, { kind: 'text', main: word.hz, sub: null, ask: 'Gõ pinyin có dấu thanh (nǐ hǎo) hoặc số thanh (ni3 hao3)' });
  }
  function answerMatcher() {
    if (typeof AM !== 'undefined') return AM;
    try { return (typeof require === 'function') ? require('./answer-match') : null; } catch { return null; }
  }
  function assembleTyped(typeId, word, prompt) {
    const T = TYPES[typeId];
    const correct = optionOf(T.answerField, word);
    return {
      typeId, hz: word.hz, l: word.l, word,
      skill: T.skill, quizType: T.quizType, typed: T.typed,
      exerciseFsrs: T.exerciseFsrs, exercisePractice: T.exercisePractice,
      fsrsEligible: !T.practiceOnly,
      prompt, options: [], correctIndex: -1, correctKey: correct.key,
      explanation: explain(typeId, word), tip: null, sentence: null,
    };
  }

  const BUILDERS = { typeVi2hz: buildTypeVi2Hz, typeHz2py: buildTypeHz2Py, hz2vi: buildHz2Vi, vi2hz: buildVi2Hz, listen2hz: buildListen2Hz, listen2vi: buildListen2Vi, hz2py: buildHz2Py, cloze: buildCloze, confusable: buildConfusable, listen2tone: buildListen2Tone, orderSentence: buildOrderSentence,
    py2hz: buildPy2Hz, py2vi: buildPy2Vi, vi2py: buildVi2Py, hz2hv: buildHz2Hv, listen2type: buildListen2Type,
    hz2tone: buildHz2Tone, hv2vi: buildHv2Vi, hv2hz: buildHv2Hz, vi2hv: buildVi2Hv,
    duelHz2vi: buildDuelHz2Vi, duelVi2hz: buildDuelVi2Hz, duelHz2py: buildDuelHz2Py,
    tfHz2vi: buildTfHz2Vi, tfVi2hz: buildTfVi2Hz, tfHz2py: buildTfHz2Py,
    sent2vi: buildSent2Vi, vi2sent: buildVi2Sent, listenSent2vi: buildListenSent2Vi, sentPick: buildSentPick };

  // ── Kiểm tra hợp lệ (dùng cả trong build và trong test) ────────────────────────────────────
  function validateTyped(q) {
    const T = TYPES[q.typeId];
    if (!q.typed || q.typed !== T.typed) return { ok: false, reason: 'câu tự nhập thiếu kiểu chấm' };
    if (q.options && q.options.length) return { ok: false, reason: 'câu tự nhập không có lựa chọn' };
    if (!normText(q.correctKey)) return { ok: false, reason: 'thiếu đáp án chuẩn' };
    // Đề không được lộ đáp án.
    const stem = JSON.stringify({ m: q.prompt.main, a: q.prompt.ask });
    if (q.typeId === 'typeVi2hz' && stem.includes(q.word.hz)) return { ok: false, reason: 'đề lộ chữ Hán' };
    if (q.typeId === 'typeHz2py' && q.word.py && stem.includes(q.word.py)) return { ok: false, reason: 'đề lộ pinyin' };
    if (q.typeId === 'listen2type' && (stem.includes(q.word.hz) || (q.word.py && stem.includes(q.word.py)))) return { ok: false, reason: 'đề nghe lộ chữ Hán/Pinyin' };
    return { ok: true };
  }
  // V134: câu Đúng/Sai — đúng 2 lựa chọn Đúng/Sai; khẳng định không rỗng; khẳng định SAI không được trùng/đồng nghĩa với đáp án thật; đề không lộ đáp án.
  function validateTf(q) {
    if (!q.tf || !normText(q.tf.claim) || !normText(q.tf.correct)) return { ok: false, reason: 'thiếu khẳng định' };
    if (!q.options || q.options.length !== 2 || q.options[0].key !== 'true' || q.options[1].key !== 'false') return { ok: false, reason: 'câu Đúng/Sai phải có đúng 2 lựa chọn' };
    if (q.correctKey !== (q.tf.truth ? 'true' : 'false') || q.options[q.correctIndex].key !== q.correctKey) return { ok: false, reason: 'đáp án đúng không khớp' };
    const same = normText(q.tf.claim) === normText(q.tf.correct);
    if (q.tf.truth !== same) return { ok: false, reason: 'khẳng định không khớp nhãn đúng/sai' };
    if (!q.tf.truth) {
      const w = q.word;
      if (q.typeId === 'tfHz2vi' && meaningsOverlap(q.tf.claim, w.vi)) return { ok: false, reason: 'khẳng định sai lại trùng nghĩa' };
      if (q.typeId === 'tfHz2py' && pyKey(q.tf.claim) === pyKey(w.py)) return { ok: false, reason: 'khẳng định sai lại trùng pinyin' };
    }
    if (q.typeId === 'tfVi2hz' && String(q.prompt.main).includes(q.word.hz)) return { ok: false, reason: 'đề lộ chữ Hán' };
    return { ok: true };
  }
  // V135: "Sắp xếp câu" — đề chỉ có NGHĨA (không lộ chữ Hán), các mảnh ghép lại phải đúng câu gốc,
  // và thứ tự mảnh ban đầu KHÔNG được trùng câu gốc (nếu không thì bấm lần lượt là xong).
  function validateOrder(q) {
    if (!q.order || !q.order.sentence) return { ok: false, reason: 'thiếu câu nguồn' };
    if (!Array.isArray(q.order.tiles) || q.order.tiles.length < 3) return { ok: false, reason: 'quá ít mảnh' };
    if (!OS_LIB.sentenceUsable(q.order.sentence, q.word.hz)) return { ok: false, reason: 'câu không dùng được cho dạng này' };
    if (!q.correctKey) return { ok: false, reason: 'thiếu đáp án chuẩn' };
    if (q.correctKey !== OS_LIB.normalize(q.order.sentence)) return { ok: false, reason: 'đáp án không khớp câu gốc' };
    if (q.order.tiles.join('') === q.order.sentence) return { ok: false, reason: 'các mảnh chưa bị xáo' };
    // Các mảnh phải là HOÁN VỊ của cách cắt câu gốc (không thừa, không thiếu, không đổi nội dung).
    const refTiles = OS_LIB.tokenize(q.order.sentence);
    const a = q.order.tiles.slice().sort(), b = refTiles.slice().sort();
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) return { ok: false, reason: 'mảnh không khớp câu gốc' };
    // Đề không được lộ chữ Hán (chỉ hiện nghĩa tiếng Việt).
    const stem = String(q.prompt.main || '') + String(q.prompt.ask || '');
    if (stem.includes(q.word.hz)) return { ok: false, reason: 'đề lộ chữ Hán' };
    return { ok: true };
  }
  // V138 — câu hỏi theo câu: đáp án là nghĩa của CẢ CÂU ('vi') hoặc cả câu chữ Hán ('zh'). Kiểm: đủ lựa chọn,
  // khác nhau, đúng 1 đáp án; nhiễu không trùng nghĩa (khi đáp án là nghĩa) và không chứa từ mục tiêu (sentPick).
  function validateSentence(q) {
    if (!q.sentence || !q.sentence.zh) return { ok: false, reason: 'thiếu câu nguồn' };
    if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 4) return { ok: false, reason: 'số lựa chọn sai' };
    const keys = q.options.map(o => normText(o.key));
    if (keys.some(k => !k)) return { ok: false, reason: 'lựa chọn rỗng' };
    if (new Set(keys).size !== keys.length) return { ok: false, reason: 'lựa chọn trùng nhau' };
    if (!(q.correctIndex >= 0 && q.correctIndex < q.options.length)) return { ok: false, reason: 'chỉ số đáp án sai' };
    if (q.options[q.correctIndex].key !== q.correctKey) return { ok: false, reason: 'đáp án đúng không khớp' };
    if (!normText(q.correctKey)) return { ok: false, reason: 'thiếu đáp án chuẩn' };
    const T = TYPES[q.typeId];
    for (let i = 0; i < q.options.length; i++) {
      if (i === q.correctIndex) continue;
      if (T.sentenceField === 'vi') {
        if (meaningsOverlap(q.options[i].key, q.correctKey)) return { ok: false, reason: 'nhiễu trùng nghĩa' };
      } else if (q.typeId === 'sentPick' && String(q.options[i].key).includes(q.word.hz)) {
        return { ok: false, reason: 'nhiễu vẫn chứa từ mục tiêu' };
      }
    }
    return { ok: true };
  }
  function validate(q, opts) {
    if (q && TYPES[q.typeId] && TYPES[q.typeId].typed) return validateTyped(q);
    if (q && TYPES[q.typeId] && TYPES[q.typeId].order) return validateOrder(q);
    if (q && TYPES[q.typeId] && TYPES[q.typeId].sentence) return validateSentence(q);
    if (q && /^tf[A-Z]/.test(String(q.typeId))) return validateTf(q);
    const minOptions = (opts && opts.minOptions) || (q && (q.typeId === 'confusable' || (typeof q.typeId === 'string' && q.typeId.startsWith('duel'))) ? 2 : 3);
    if (!q || !q.options) return { ok: false, reason: 'thiếu câu hỏi' };
    if (q.options.length < minOptions) return { ok: false, reason: 'không đủ lựa chọn' };
    if (q.options.length > 4) return { ok: false, reason: 'quá 4 lựa chọn' };
    const keys = q.options.map(o => normText(o.key));
    if (keys.some(k => !k)) return { ok: false, reason: 'lựa chọn rỗng' };
    if (new Set(keys).size !== keys.length) return { ok: false, reason: 'lựa chọn trùng nhau' };
    if (!(q.correctIndex >= 0 && q.correctIndex < q.options.length)) return { ok: false, reason: 'chỉ số đáp án sai' };
    if (q.options[q.correctIndex].key !== q.correctKey) return { ok: false, reason: 'đáp án đúng không khớp' };
    const T = TYPES[q.typeId];
    if (!T) return { ok: false, reason: 'dạng bài lạ' };
    // Không nhiễu nào được "đúng theo dữ liệu".
    const wrong = q.options.filter((o, i) => i !== q.correctIndex);
    if (T.answerField === 'vi' || (T.answerField === 'hz' && q.typeId !== 'listen2hz' && q.typeId !== 'cloze' && q.typeId !== 'py2hz')) {
      // Đáp án là nghĩa, hoặc hỏi theo nghĩa → không được trùng nghĩa với từ gốc.
      for (const o of wrong) {
        const wv = T.answerField === 'vi' ? o.key : (opts && opts.viOf && opts.viOf(o.key));
        if (wv && meaningsOverlap(wv, q.word.vi)) return { ok: false, reason: 'nhiễu trùng nghĩa' };
      }
    }
    if (q.typeId === 'listen2hz') for (const o of wrong) { if (opts && opts.pyOf && pyKey(opts.pyOf(o.key)) === pyKey(q.word.py)) return { ok: false, reason: 'nhiễu đồng âm' }; }
    if (q.typeId === 'hz2py' || q.typeId === 'vi2py' || q.typeId === 'hz2tone' || q.typeId === 'duelHz2py') for (const o of wrong) if (pyKey(o.key) === pyKey(q.word.py)) return { ok: false, reason: 'nhiễu trùng pinyin' };
    // V117: dạng mới — nhiễu không được có thể bị coi là đúng theo dữ liệu.
    if (q.typeId === 'py2hz') for (const o of wrong) { if (pyKey(opts && opts.pyOf && opts.pyOf(o.key)) === pyKey(q.word.py)) return { ok: false, reason: 'nhiễu đồng âm' }; }
    if (q.typeId === 'py2vi') for (const o of wrong) if (meaningsOverlap(o.key, q.word.vi)) return { ok: false, reason: 'nhiễu trùng nghĩa' };
    if (q.typeId === 'hz2hv' || q.typeId === 'vi2hv') for (const o of wrong) if (normText(o.key) === normText(q.word.hanviet)) return { ok: false, reason: 'nhiễu trùng Hán Việt' };
    if (q.typeId === 'vi2hv') for (const o of wrong) { if (hvTokens(o.key).some(t => hvTokens(q.word.hanviet).includes(t))) return { ok: false, reason: 'nhiễu trùng Hán Việt' }; }
    if (q.typeId === 'hv2vi' || q.typeId === 'hv2hz') { // đề chỉ có Hán Việt → không được lộ đáp án, và phải khớp đúng Hán Việt của từ
      if (String(q.prompt.main).trim() !== String(q.word.hanviet || '').trim()) return { ok: false, reason: 'đề Hán Việt không khớp' };
      if (q.typeId === 'hv2hz' && String(q.prompt.main).includes(q.word.hz)) return { ok: false, reason: 'đề lộ chữ Hán' };
    }
    if (q.typeId === 'py2hz' || q.typeId === 'py2vi') { // đề chỉ có pinyin → không được lộ đáp án
      if (String(q.prompt.main) !== String(q.word.py || '').normalize('NFC').trim()) return { ok: false, reason: 'đề pinyin không khớp' };
    }
    if (q.typeId === 'vi2py' && String(q.prompt.main).includes(q.word.py)) return { ok: false, reason: 'đề lộ pinyin' };
    // Đề không lộ đáp án.
    if (q.prompt.kind === 'audio') {
      const text = JSON.stringify({ m: q.prompt.main, s: q.prompt.sub, a: q.prompt.ask });
      if (text.includes(q.word.hz) || (q.word.py && text.includes(q.word.py))) return { ok: false, reason: 'đề nghe lộ chữ Hán/Pinyin' };
    }
    if (q.prompt.kind === 'cloze') {
      if (!String(q.prompt.main).includes('＿＿＿')) return { ok: false, reason: 'cloze chưa khoét chỗ trống' };
      if (String(q.prompt.main).includes(q.word.hz)) return { ok: false, reason: 'cloze còn lộ từ' };
    }
    if (q.typeId === 'hz2vi' && q.prompt.ask.includes(q.word.vi)) return { ok: false, reason: 'đề lộ nghĩa' };
    return { ok: true };
  }

  // Dựng + kiểm hợp lệ. `viOf/pyOf` tra từ theo chữ Hán trong kho để kiểm nhiễu (đáp án chữ Hán).
  function build(typeId, word, ctx) {
    ctx = ctx || {};
    const T = TYPES[typeId], b = BUILDERS[typeId];
    if (!T || !b || !word || !word.hz) return null;
    if (T.needsAudio && !ctx.audioOk) return null;
    let q;
    try { q = b(word, ctx); } catch { return null; }
    if (!q) return null;
    const byHz = new Map((ctx.pool || []).map(w => [w.hz, w]));
    byHz.set(word.hz, word);
    const vopts = {
      minOptions: ctx.minOptions,
      viOf: hz => (byHz.get(hz) || {}).vi,
      pyOf: hz => (byHz.get(hz) || {}).py,
    };
    const v = validate(q, vopts);
    if (!v.ok) return null;
    // V111: từ HAY BỊ NHẦM → chèn đúng đáp án người học từng chọn nhầm làm đáp án nhiễu (luyện đúng chỗ hay nhầm).
    // Câu sau khi chèn VẪN phải qua validate; không qua thì giữ câu gốc (không bao giờ làm câu xấu đi).
    if (ctx.confusions && ctx.confusions.length) {
      const inj = injectConfusion(q, T, ctx, vopts);
      if (inj) return inj;
    }
    return q;
  }

  // Tìm TỪ thật trong kho mà đáp án sai đã gõ/chọn tương ứng (khớp chữ Hán, pinyin hoặc nghĩa), rồi dùng từ đó làm
  // đáp án nhiễu ở KHÔNG GIAN ĐÁP ÁN của dạng câu hiện tại (vd lần trước chọn nhầm "准背" ở câu nghĩa→chữ Hán, nay câu
  // chữ Hán→nghĩa sẽ có nghĩa của "准背" làm nhiễu). Bỏ qua: câu tự nhập, điền từ (cloze: nhiều từ có thể cùng vừa câu), confusable.
  function injectConfusion(q, T, ctx, vopts) {
    if (T.typed || T.sentence || q.typeId === 'cloze' || q.typeId === 'confusable' || q.typeId === 'listen2tone' || q.options.length < 3) return null;
    const pool = ctx.pool || [];
    for (const c of ctx.confusions) {
      const text = c && (c.text !== undefined ? c.text : c);
      if (typeof text !== 'string' || !text) continue;
      const donor = pool.find(x => x && x.hz !== q.hz && (x.hz === text || x.py === text || x.vi === text));
      if (!donor) continue;
      const cand = optionOf(T.answerField, donor);
      if (!cand.key || cand.key === q.correctKey || q.options.some(o => o.key === cand.key)) continue;
      // Thay MỘT đáp án nhiễu (không đụng đáp án đúng, giữ nguyên vị trí đáp án đúng).
      const idx = [...q.options.keys()].reverse().find(i => i !== q.correctIndex);
      if (idx === undefined) continue;
      const q2 = Object.assign({}, q, { options: q.options.slice() });
      q2.options[idx] = cand;
      q2.confusionInjected = { text, donorHz: donor.hz };
      if (validate(q2, vopts).ok) return q2;
    }
    return null;
  }

  // ── GHÉP CẶP (dạng 7): chữ Hán ↔ nghĩa | chữ Hán ↔ pinyin ─────────────────────────────────
  // Chỉ nhận các từ có nhãn phải KHÁC nhau hoàn toàn (nghĩa không trùng nghĩa, pinyin không trùng) để
  // mỗi cặp có đúng 1 cách ghép. Cần ≥3 cặp, tối đa 4.
  // V132: thêm kind 'hv' (chữ Hán ↔ Hán Việt): chỉ nhận từ có đúng 1 âm Hán Việt và các âm phải khác nhau hoàn toàn.
  // V133: thêm kind 'listen' (nghe ↔ chữ Hán): cần ctx.audioOk; các từ trong bài phải có cách đọc khác nhau (đồng âm không phân biệt được bằng tai).
  function buildMatch(words, kind, ctx) {
    ctx = ctx || {};
    const rand = ctx.rand || defaultRand;
    const k = kind === 'py' ? 'py' : (kind === 'hv' ? 'hv' : (kind === 'listen' ? 'listen' : 'vi'));
    if (k === 'listen' && !ctx.audioOk) return null;
    const field = k === 'hv' ? 'hanviet' : (k === 'listen' ? 'hz' : k);
    const chosen = [];
    for (const w of shuffled(words || [], rand)) {
      if (!w || !w.hz || !w[field]) continue;
      if (chosen.some(c => c.hz === w.hz)) continue;
      if (k === 'hv' && hvTokens(w.hanviet).length !== 1) continue;
      if (k === 'listen' && !pyKey(w.py)) continue;
      const clash = chosen.some(c => k === 'vi' ? meaningsOverlap(c.vi, w.vi) : (k === 'py' || k === 'listen' ? pyKey(c.py) === pyKey(w.py) : hvTokens(c.hanviet)[0] === hvTokens(w.hanviet)[0]));
      if (clash) continue;
      chosen.push(w);
      if (chosen.length === 4) break;
    }
    if (chosen.length < 3) return null;
    return {
      typeId: 'match', kind: k, skill: k === 'py' ? 'pinyin' : (k === 'listen' ? 'listening' : 'recognition'),
      exercisePractice: { vi: 'practice-match-vi', py: 'practice-match-py', hv: 'practice-match-hv', listen: 'practice-match-listen' }[k], fsrsEligible: false,
      pairs: chosen.map(w => ({ hz: w.hz, l: w.l, right: w[field], word: w })),
      rights: shuffled(chosen.map(w => w[field]), rand),
      lefts: shuffled(chosen.map(w => w.hz), rand),
    };
  }

  return { TYPES, MCQ_ORDER, PRACTICE_ORDER, PRACTICE_TYPED_ORDER, HV_ORDER, DUEL_ORDER, TF_ORDER, TYPED_ORDER, ORDER_ORDER, SENTENCE_ORDER, build, validate, buildMatch, findDuelDonor, toneSequence, toneVariants, normText, meaningSet, meaningsOverlap, pyKey, findSentences, placeCorrect };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QE;
