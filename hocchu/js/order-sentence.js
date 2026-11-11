// js/order-sentence.js — V135: "🧩 Sắp xếp câu" (orderSentence). THUẦN: không DOM, không mạng.
//
// Dùng CHUNG cho trình duyệt (dựng ô chữ để người học chạm xếp) và server (/api/skills/practice —
// CHẤM đáp án). Server luôn là nguồn sự thật; kết quả chấm ở trình duyệt chỉ để phản hồi tức thời.
//
// NGUYÊN TẮC:
//   * Chấm dựa trên CHUỖI ĐÃ CHUẨN HOÁ (bỏ khoảng trắng + dấu câu) chứ KHÔNG dựa vào cách tách ô —
//     tách ô chỉ là chuyện hiển thị. Nhờ vậy cùng một câu, tách kiểu gì cũng chấm giống nhau.
//   * Mọi câu dùng ở đây là dữ liệu CÓ THẬT (SENTENCES trong giáo trình hoặc word_examples), không do AI
//     sinh lúc làm bài. Câu phải chứa ĐÚNG MỘT LẦN từ đang học → người học nhận ra mình đang luyện từ nào.
//   * Tách từ bằng Intl.Segmenter (có sẵn trong trình duyệt/Node ≥ 16). KHÔNG có Segmenter → lùi về
//     tách từng CHỮ HÁN, vẫn chấm đúng vì chấm theo chuỗi chuẩn hoá.
//   * Dấu câu LUÔN dính vào ô đứng trước ("包子，"): người học không phải xếp dấu câu rời rạc.
'use strict';

const OS = (function () {
  const MIN_TILES = 3;   // dưới 3 ô thì không còn là "sắp xếp" nữa
  const MAX_TILES = 12;  // quá nhiều ô thì màn hình điện thoại rối và bài quá dài
  const MAX_SENTENCE_CHARS = 40;

  const CJK = /[一-鿿]/;
  const CJK_ONLY = /^[一-鿿]+$/;
  // Dấu câu bị BỎ khi chấm (người học có thể không xếp dấu câu đúng chỗ) và bị DÍNH vào ô trước khi hiển thị.
  const PUNCT = '。，、！？；：,.!?;:…～~·「」『』（）()【】《》〈〉“”‘’"\'';
  const PUNCT_RE = new RegExp('[' + PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']', 'g');
  const SPACE_RE = /[\s　]+/g;   // có cờ g → CHỈ dùng với .replace (không dùng .test: lastIndex bị giữ lại)
  const SPACE_ONLY = /^[\s　]+$/;

  function isPunctToken(t) {
    if (!t) return false;
    for (const ch of t) if (!PUNCT.includes(ch)) return false;
    return true;
  }

  // Giữ nguyên dữ liệu làm việc với Intl.Segmenter nếu môi trường có (trình duyệt hiện đại, Node ≥ 16).
  function segmenter() {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
    try { return new Intl.Segmenter('zh-Hans', { granularity: 'word' }); } catch { return null; }
  }
  const SEG = segmenter();

  function rawTokens(zh) {
    const s = String(zh == null ? '' : zh).normalize('NFC');
    if (SEG) {
      const out = [];
      for (const part of SEG.segment(s)) if (part && part.segment) out.push(part.segment);
      if (out.length) return out;
    }
    return [...s];
  }

  // Cắt câu thành các ô. Dấu câu dính vào ô ngay trước; ô toàn dấu câu ở đầu câu (nếu có) giữ riêng.
  function tokenize(zh) {
    const out = [];
    for (const t of rawTokens(zh)) {
      if (!t) continue;
      if (isPunctToken(t) && out.length) { out[out.length - 1] += t; continue; }
      if (SPACE_ONLY.test(t)) continue; // khoảng trắng thuần → bỏ
      out.push(t);
    }
    // Bỏ khoảng trắng thừa trong từng ô (Segmenter có thể trả kèm khoảng trắng).
    return out.map(t => t.replace(SPACE_RE, '')).filter(Boolean);
  }

  // Chuẩn hoá để CHẤM: bỏ khoảng trắng + mọi dấu câu. Giữ nguyên chữ Hán (kể cả giản/phồn — không đổi).
  function normalize(zh) {
    return String(zh == null ? '' : zh).normalize('NFC').replace(PUNCT_RE, '').replace(SPACE_RE, '');
  }

  // Câu có dùng được cho dạng này không: toàn chữ Hán + dấu câu, chứa đúng 1 lần từ đang học, không quá dài.
  function sentenceUsable(zh, hz) {
    if (typeof zh !== 'string' || !zh) return false;
    const chars = [...normalize(zh)];
    if (chars.length < 4 || chars.length > MAX_SENTENCE_CHARS) return false;
    if (!CJK_ONLY.test(chars.join(''))) return false;
    if (!hz || !CJK.test(hz)) return false;
    let n = 0, i = 0;
    const s = String(zh);
    while ((i = s.indexOf(hz, i)) !== -1) { n++; i += hz.length; }
    return n === 1;
  }

  function shuffleWith(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Dựng danh sách ô ĐÃ XÁO. Trả null nếu câu không phù hợp (quá ngắn/dài, hoặc không xáo được khác thứ tự gốc).
  function buildTiles(zh, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const tiles = tokenize(zh);
    if (tiles.length < MIN_TILES || tiles.length > MAX_TILES) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const mixed = shuffleWith(tiles, r);
      if (mixed.join('') !== tiles.join('')) return mixed; // khác thứ tự gốc → mới là bài "sắp xếp"
    }
    return null; // mọi ô giống hệt nhau: mọi thứ tự đều "đúng" → không phải bài tập
  }

  // Chấm: chuỗi người học ghép phải trùng câu gốc sau chuẩn hoá (và không rỗng).
  function isOrderCorrect(zh, submitted) {
    const a = normalize(zh), b = normalize(submitted);
    return !!a && !!b && a === b;
  }

  // Lấy các câu CÓ THẬT chứa từ này từ danh sách SENTENCES (mỗi mục có `hint` liệt kê các từ trong câu).
  function fromSentences(word, sentences) {
    const hz = word && word.hz;
    const out = [];
    for (const s of Array.isArray(sentences) ? sentences : []) {
      if (!s || typeof s.hz !== 'string') continue;
      const hints = String(s.hint || '').split(/[、,，]/).map(t => t.trim()).filter(Boolean);
      if (!hints.includes(hz)) continue;
      if (!sentenceUsable(s.hz, hz)) continue;
      out.push({ zh: s.hz, vi: s.vi || '', source: 'sentence' });
    }
    return out;
  }

  // Lấy các câu CÓ THẬT từ kho ví dụ theo từ (word_examples) — dữ liệu server, không phải AI sinh lúc làm bài.
  function fromExamples(word, examples) {
    const hz = word && word.hz;
    const out = [];
    for (const e of Array.isArray(examples) ? examples : []) {
      if (!e || e.hz !== hz || typeof e.zh !== 'string') continue;
      if (!sentenceUsable(e.zh, hz)) continue;
      out.push({ zh: e.zh, vi: e.vi || '', source: 'example' });
    }
    return out;
  }

  return {
    MIN_TILES, MAX_TILES, MAX_SENTENCE_CHARS,
    tokenize, normalize, sentenceUsable, buildTiles, isOrderCorrect, fromSentences, fromExamples,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OS;
