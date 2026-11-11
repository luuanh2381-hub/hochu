// js/session-summary.js — V118: THỐNG KÊ TỔNG KẾT PHIÊN + CHÍNH SÁCH TRẦN LUYỆN LẠI. THUẦN (không DOM, không mạng, không DB).
//
// Đầu vào là nhật ký phiên `rvLog` của js/review.js: [{ hz, skill, typeId, correct, official, source, intro?, hinted?, ms }].
// Mọi con số đều tính từ nhật ký, không bịa. Nguyên tắc:
//   • "Số câu trả lời" và "số từ duy nhất" luôn tách riêng — một từ qua nhiều dạng bài vẫn chỉ là 1 từ.
//   • Câu 'check' (kiểm tra ngay sau xem từ mới), 'redo' (luyện lại ngay sau khi xem đáp án) và lượt chính thức ĐẦU tiên sau màn
//     giới thiệu (intro) là câu vừa xem đáp án → KHÔNG dùng làm bằng chứng về kỹ năng (server cũng không tính chúng vào điểm kỹ năng
//     từ V113). Chúng vẫn được tính vào tổng số câu/tỉ lệ đúng của buổi và vào "số lượt luyện bổ sung".
//   • Kết luận kỹ năng yếu/ổn cần ≥ MIN_ANSWERS câu hợp lệ VÀ ≥ MIN_WORDS từ khác nhau; dưới mức đó là "chưa đủ dữ liệu".
//   • Đề xuất luyện tiếp chỉ xuất hiện khi dữ liệu hỗ trợ; không đủ thì nói rõ cần thêm bao nhiêu lượt.
//   • Không tạo "điểm ghi nhớ" nào — tổng kết một buổi không nói được gì về trí nhớ dài hạn (đó là việc của FSRS).

const SM = (function () {
  'use strict';

  const MIN_ANSWERS = 3;          // số câu hợp lệ tối thiểu của 1 kỹ năng để kết luận
  const MIN_WORDS = 2;            // số từ khác nhau tối thiểu (tránh kết luận kỹ năng từ 1 từ duy nhất)
  const WEAK_BELOW = 0.7;         // tỉ lệ đúng < 70% → cần luyện thêm
  const GOOD_AT = 0.8;            // ≥ 80% → khá ổn (dùng làm đối chứng khi so 2 kỹ năng)
  const MAX_REDO_ANSWERS_PER_WORD = 4; // trần số câu luyện lại (redo) cho 1 từ trong 1 phiên: 2 lần sai × tối đa 2 lượt/lần

  const SKILL_NAME = { recognition: 'Nhận diện', recall: 'Nhớ chủ động', listening: 'Nghe', pinyin: 'Pinyin', context: 'Từ trong câu' };
  const SKILL_ACTION = {
    recall: 'Nghĩa → Chữ Hán (và Pinyin → Chữ Hán)',
    listening: 'Nghe → Nghĩa / Nghe → chọn Chữ Hán',
    pinyin: 'Chữ Hán → Pinyin (chú ý thanh điệu)',
    recognition: 'Chữ Hán → Nghĩa',
    context: 'Điền từ vào câu',
  };

  // Câu này có được dùng làm bằng chứng về KỸ NĂNG không?
  const isEvidence = (e) => !!e && !!e.skill && e.source !== 'check' && e.source !== 'redo' && e.intro !== true;

  function ratio(ok, n) { return n ? ok / n : null; }

  function summarize(log) {
    const L = Array.isArray(log) ? log.filter(e => e && e.hz) : [];
    const words = new Set(L.map(e => e.hz));
    const correct = L.filter(e => e.correct).length;
    const official = L.filter(e => e.official).length;

    // Theo kỹ năng: câu trả lời (mọi câu) và bằng chứng (chỉ câu hợp lệ).
    const skills = {};
    const perWord = new Map(); // hz → { [skill]: { n, ok } } (chỉ bằng chứng)
    for (const e of L) {
      if (!e.skill) continue;
      const s = skills[e.skill] || (skills[e.skill] = { answers: 0, correct: 0, words: new Set(), evN: 0, evOk: 0, evWords: new Set() });
      s.answers++; if (e.correct) s.correct++; s.words.add(e.hz);
      if (isEvidence(e)) {
        s.evN++; if (e.correct) s.evOk++; s.evWords.add(e.hz);
        const pw = perWord.get(e.hz) || {}; const c = pw[e.skill] || (pw[e.skill] = { n: 0, ok: 0 });
        c.n++; if (e.correct) c.ok++; perWord.set(e.hz, pw);
      }
    }
    const out = {};
    for (const k of Object.keys(skills)) {
      const s = skills[k];
      const enough = s.evN >= MIN_ANSWERS && s.evWords.size >= MIN_WORDS;
      const r = ratio(s.evOk, s.evN);
      out[k] = {
        answers: s.answers, correct: s.correct, words: s.words.size,
        evidenceAnswers: s.evN, evidenceCorrect: s.evOk, evidenceWords: s.evWords.size,
        rate: r, enough,
        level: !enough ? 'insufficient' : (r < WEAK_BELOW ? 'weak' : (r >= GOOD_AT ? 'good' : 'developing')),
      };
    }

    // Từ theo từng mẫu (mức TỪ, để người học biết từ nào cần chú ý — không phải kết luận về kỹ năng).
    const recognizedNotRecalled = [], listeningWeak = [], pinyinWeak = [];
    for (const [hz, pw] of perWord) {
      const rec = pw.recognition, rc = pw.recall, ls = pw.listening, py = pw.pinyin;
      if (rec && rec.ok >= 1 && rec.ok / rec.n >= 0.5 && rc && rc.ok === 0) recognizedNotRecalled.push(hz);
      if (ls && ls.ok === 0) listeningWeak.push(hz);
      if (py && py.ok === 0) pinyinWeak.push(hz);
    }
    // Từ hay sai: sai ≥ 2 câu trong buổi; từ cần ôn lại: câu CUỐI CÙNG của từ trong buổi là sai.
    const wrongCount = new Map(), last = new Map();
    for (const e of L) { if (!e.correct) wrongCount.set(e.hz, (wrongCount.get(e.hz) || 0) + 1); last.set(e.hz, e); }
    const oftenWrong = [...wrongCount].filter(([, n]) => n >= 2).map(([hz]) => hz);
    const stillWrong = [...last.values()].filter(e => !e.correct).map(e => e.hz);

    return {
      totalAnswers: L.length, uniqueWords: words.size, correct, wrong: L.length - correct,
      accuracy: L.length ? Math.round(correct / L.length * 100) : null,
      officialAnswers: official, practiceAnswers: L.length - official,
      skills: out, recognizedNotRecalled, listeningWeak, pinyinWeak, oftenWrong, stillWrong,
      tips: tipsFrom(out, { recognizedNotRecalled, listeningWeak, pinyinWeak, stillWrong, total: L.length }),
    };
  }

  // Đề xuất luyện tiếp — CHỈ khi dữ liệu hỗ trợ. Trả mảng { kind, skill?, text }. Có tối đa 3 gợi ý, ưu tiên tình huống cụ thể trước.
  function tipsFrom(sk, ctx) {
    const tips = [];
    const rec = sk.recognition, rcl = sk.recall, lis = sk.listening, pin = sk.pinyin;
    const recOk = rec && rec.enough && rec.rate >= GOOD_AT;
    if (recOk && rcl && rcl.level === 'weak') {
      tips.push({ kind: 'recall', skill: 'recall', text: 'Bạn nhận diện chữ Hán khá tốt, nhưng khả năng tự nhớ chữ Hán chưa ổn định. Hãy ưu tiên luyện Nghĩa → Chữ Hán.' });
    }
    if (recOk && lis && lis.level === 'weak') {
      tips.push({ kind: 'listening', skill: 'listening', text: 'Bạn thường trả lời đúng khi nhìn chữ Hán nhưng còn gặp khó khăn khi nghe. Hãy luyện thêm Nghe → Nghĩa.' });
    }
    if (pin && pin.level === 'weak') {
      tips.push({ kind: 'pinyin', skill: 'pinyin', text: 'Pinyin / thanh điệu chưa ổn định. Hãy luyện thêm Chữ Hán → Pinyin và nghe phân biệt thanh điệu.' });
    }
    for (const k of Object.keys(sk)) { // kỹ năng yếu khác chưa được nêu ở trên
      if (sk[k].level === 'weak' && !tips.some(t => t.skill === k)) {
        tips.push({ kind: 'weak', skill: k, text: `${SKILL_NAME[k] || k}: còn yếu trong buổi này (${sk[k].evidenceCorrect}/${sk[k].evidenceAnswers} câu đúng, ${sk[k].evidenceWords} từ). Hãy luyện thêm ${SKILL_ACTION[k] || 'dạng này'}.` });
      }
    }
    if (ctx.stillWrong.length) tips.push({ kind: 'redo', text: `Có ${ctx.stillWrong.length} từ lần trả lời cuối vẫn sai — bấm “Luyện lại câu sai”.` });
    if (!tips.length) {
      const measured = Object.keys(sk).filter(k => sk[k].enough);
      if (measured.length) tips.push({ kind: 'ok', text: 'Buổi này chưa thấy kỹ năng nào yếu rõ rệt. Cứ ôn đúng lịch FSRS.' });
      else tips.push({ kind: 'insufficient', text: `Buổi này còn ít câu nên chưa đủ dữ liệu để đề xuất: mỗi kỹ năng cần ít nhất ${MIN_ANSWERS} câu (từ ${MIN_WORDS} từ khác nhau), không tính câu vừa xem đáp án.` });
    }
    return tips.slice(0, 3);
  }

  // Có được chèn thêm 1 câu 'redo' cho từ này không? Đếm câu redo đã trả lời (trong nhật ký) + redo đang chờ trong hàng đợi.
  // Chặn việc một từ cứ sai là lại sinh thêm câu luyện lại — phiên không bị kéo dài vô hạn; thẻ chính thức vẫn quay lại như thường.
  function canQueueRedo(log, items, hz, max) {
    const cap = Number.isFinite(max) ? max : MAX_REDO_ANSWERS_PER_WORD;
    const answered = (Array.isArray(log) ? log : []).filter(e => e && e.hz === hz && e.source === 'redo').length;
    const pending = (Array.isArray(items) ? items : []).filter(it => it && it.type === 'redo' && it.word && it.word.hz === hz).length;
    return answered + pending < cap;
  }

  return { MIN_ANSWERS, MIN_WORDS, WEAK_BELOW, GOOD_AT, MAX_REDO_ANSWERS_PER_WORD, SKILL_NAME, isEvidence, summarize, canQueueRedo };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SM;
