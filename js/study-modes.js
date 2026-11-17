// js/study-modes.js — V168: CHẾ ĐỘ HỌC ở "Hôm nay học" (THUẦN — không DOM, không mạng; dùng được ở cả trình duyệt lẫn test).
//
// Chế độ = một BỘ DẠNG ĐỀ (+ trọng số) mà bộ chọn câu hỏi (QS.choose) được phép dùng. Chế độ KHÔNG đổi:
//   • thứ tự / danh tính thẻ đến hạn (FSRS + server quyết định, như trước),
//   • cách chấm (server tự tra đáp án rồi chấm theo nhãn exerciseFsrs của dạng đề).
// Vì thẻ phải là THẺ CHÍNH THỨC áp dụng FSRS, MỌI dạng trong mọi chế độ đều là dạng CHÍNH THỨC (có nhãn FSRS, không
// practiceOnly, không phải dạng gõ bàn phím). Test test/v168-study-modes.test.js khoá điều này.
const SMODE = (function () {
  'use strict';

  // Dạng cần âm thanh (khớp QE.TYPES[t].needsAudio — test kiểm chéo).
  const AUDIO_TYPES = ['listen2hz', 'listen2vi', 'listenSent2vi', 'listenSent2zh'];

  const MODES = [
    { id: 'mix', icon: '🎯', label: 'Tổng hợp', short: 'Tổng hợp', needsAudio: false, types: null, weights: null,
      desc: 'Hệ thống tự cân theo kỹ năng còn yếu (cách học mặc định).' },
    { id: 'basic', icon: '📘', label: 'Cơ bản', short: 'Cơ bản', needsAudio: false,
      types: ['hz2vi', 'vi2hz', 'hz2py', 'cloze'], weights: null,
      desc: 'Chữ Hán ↔ nghĩa, chữ Hán → pinyin, điền từ. Nền tảng nhận mặt chữ.' },
    { id: 'listen', icon: '🎧', label: 'Nghe nhiều', short: 'Nghe nhiều', needsAudio: true,
      types: ['listen2hz', 'listen2vi', 'listenSent2vi', 'listenSent2zh'], weights: null,
      desc: 'Toàn câu hỏi nghe: nghe từ và nghe cả câu. Đề không hiện chữ.' },
    { id: 'translateListen', icon: '🗣️', label: 'Dịch nghe', short: 'Dịch nghe', needsAudio: true,
      types: ['listenSent2vi', 'listenSent2zh', 'listen2vi'], weights: { listenSent2vi: 2, listenSent2zh: 1, listen2vi: 0.5 },
      desc: 'Nghe cả câu rồi chọn nghĩa đúng — chủ yếu nghe hiểu.' },
    { id: 'translateRead', icon: '📖', label: 'Dịch đọc', short: 'Dịch đọc', needsAudio: false,
      types: ['sent2vi', 'vi2sent', 'cloze', 'sentPick'], weights: null,
      desc: 'Đọc câu → nghĩa, nghĩa → câu, điền từ, chọn câu có dùng từ.' },
    { id: 'recall', icon: '🧠', label: 'Nhớ chữ Hán', short: 'Nhớ chữ', needsAudio: false,
      types: ['vi2hz', 'listen2hz', 'cloze'], weights: null,
      desc: 'Từ nghĩa hoặc âm thanh, chọn đúng chữ Hán. Chọn đáp án, không gõ.' },
  ];
  const BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));
  const DEFAULT_ID = 'mix';

  const list = () => MODES.slice();
  const get = (id) => BY_ID[id] || BY_ID[DEFAULT_ID];
  const normalize = (id) => (BY_ID[id] ? id : DEFAULT_ID);
  // Chế độ dùng được không (chế độ cần âm thanh bị khoá khi máy không có giọng đọc).
  const available = (id, audioOk) => !get(id).needsAudio || !!audioOk;

  // Các dạng đề chế độ được phép dùng NGAY BÂY GIỜ: bỏ dạng cần âm thanh khi không có giọng đọc, bỏ dạng người học đã
  // đặt "Tắt" (mix = 0) trong Cài đặt hằng ngày. Chế độ 'mix' → [] (không giới hạn — cách chọn cũ).
  function typesFor(id, opts) {
    const m = get(id);
    if (!m.types) return [];
    const o = opts || {};
    const mix = o.mix && typeof o.mix === 'object' ? o.mix : null;
    return m.types.filter((t) => {
      if (!o.audioOk && AUDIO_TYPES.includes(t)) return false;
      if (mix && Number(mix[t]) === 0) return false;
      return true;
    });
  }

  // Tỷ lệ dạng bài: giữ tỷ lệ người học đã đặt, trọng số của chế độ (nếu có) nhân lên trên đó.
  function mixFor(id, userMix) {
    const m = get(id);
    const out = Object.assign({}, userMix || {});
    if (m.weights) for (const t of Object.keys(m.weights)) out[t] = (Number.isFinite(Number(out[t])) ? Number(out[t]) : 1) * m.weights[t];
    return out;
  }

  return { MODES, AUDIO_TYPES, DEFAULT_ID, list, get, normalize, available, typesFor, mixFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SMODE;
