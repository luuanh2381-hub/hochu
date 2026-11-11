// js/tts-text.js — V140: chia văn bản cho Edge-TTS. THUẦN: không DOM, không mạng.
//
// Nguyên tắc:
//   * KHÔNG sửa nội dung: ghép các đoạn trả về phải bằng ĐÚNG chuỗi gốc (không thêm/bớt chữ, dấu, khoảng trắng).
//   * Chỉ cắt ở dấu câu; dấu câu dính vào đoạn đứng trước. Mệnh đề dài hơn giới hạn mới cắt tiếp ở ranh
//     giới TỪ (Intl.Segmenter), không cắt giữa từ.
//   * Ngắt nghỉ trong một câu do Edge-TTS tự xử lý. Chỉ khi phải chia nhiều request mới chèn khoảng lặng
//     theo dấu câu cuối đoạn (pauseAfter). KHÔNG chèn khoảng trắng để ép ngắt nghỉ.
'use strict';

const TT = (function () {
  const SENT_END = '。！？!?…';
  const CLAUSE = '，、；：,;:';
  const PUNCT = SENT_END + CLAUSE + '—～~·「」『』（）()【】《》〈〉“”‘’"\'';
  const DEFAULT_MAX = 480; // dưới trần 500 ký tự của api/edge-tts.py

  function isPunct(ch) { return PUNCT.includes(ch); }

  function segmenter() {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
    try { return new Intl.Segmenter('zh-Hans', { granularity: 'word' }); } catch { return null; }
  }
  const SEG = segmenter();

  function units(text) {
    if (SEG) {
      const out = [];
      for (const p of SEG.segment(text)) if (p && p.segment) out.push(p.segment);
      if (out.length) return out;
    }
    return [...text];
  }

  // Cắt 1 mệnh đề quá dài ở ranh giới từ; từ đơn dài hơn giới hạn thì cắt theo ký tự (hiếm).
  function splitLong(clause, limit) {
    const out = [];
    let cur = '';
    for (const u of units(clause)) {
      if (cur && cur.length + u.length > limit) { out.push(cur); cur = ''; }
      if (u.length > limit) {
        for (let i = 0; i < u.length; i += limit) out.push(u.slice(i, i + limit));
      } else {
        cur += u;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function splitSpeech(text, maxLen) {
    const s = String(text == null ? '' : text);
    const limit = Math.max(20, Number(maxLen) || DEFAULT_MAX);
    if (!s) return [];
    if (s.length <= limit) return [s];

    const clauses = [];
    let buf = '';
    for (const ch of s) {
      buf += ch;
      if (isPunct(ch)) { clauses.push(buf); buf = ''; }
    }
    if (buf) clauses.push(buf);

    const out = [];
    let cur = '';
    for (const c of clauses) {
      const pieces = c.length > limit ? splitLong(c, limit) : [c];
      for (const p of pieces) {
        if (cur && cur.length + p.length > limit) { out.push(cur); cur = ''; }
        cur += p;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  // Khoảng lặng nối giữa hai request (ms), theo dấu câu cuối đoạn.
  function pauseAfter(chunk) {
    const s = String(chunk == null ? '' : chunk).replace(/[\s　]+$/, '');
    if (!s) return 0;
    const last = s[s.length - 1];
    if (SENT_END.includes(last)) return 450;
    if (CLAUSE.includes(last)) return 220;
    return 300;
  }

  // Khoá cache thô: cùng nội dung + giọng + tốc độ → cùng khoá; khác bất kỳ thành phần nào → khác khoá.
  function cacheKeyText(voice, rate, text) {
    return String(voice) + '|' + String(rate) + '|' + String(text);
  }

  const MALE = /^(b|m|male|nam|男)$/i;
  function defaultVoiceFor(who) {
    return MALE.test(String(who == null ? '' : who).trim()) ? 'zh-CN-YunxiNeural' : 'zh-CN-XiaoxiaoNeural';
  }

  // turns: [{ who, hz }] → segments cho ttsSpeakSegments. voices[i] ghi đè giọng mặc định của lượt i.
  function conversationSegments(turns, voices, gapMs) {
    const list = Array.isArray(turns) ? turns : [];
    const gap = Number.isFinite(gapMs) ? gapMs : 600;
    return list.map((t, i) => ({
      text: String(t && t.hz != null ? t.hz : ''),
      voice: (voices && voices[i]) || defaultVoiceFor(t && t.who),
      gapAfter: i < list.length - 1 ? gap : 0,
    }));
  }

  return { splitSpeech, pauseAfter, cacheKeyText, defaultVoiceFor, conversationSegments, DEFAULT_MAX };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TT;
