// js/audio-hash.js — V141: khoá nội dung dùng CHUNG server + trình duyệt cho thư viện âm thanh R2.
// Chuỗi canonical là hợp đồng giữa hai phía: server băm bằng node:crypto, client băm bằng crypto.subtle.
// Không thay đổi chuỗi này nếu không đổi TTS_VERSION — đổi giọng/cách đọc thì tăng version để tự tạo bản mới.
// THUẦN: không DOM, không mạng, không crypto (nơi gọi tự băm).
const AH = (function () {
  const TTS_VERSION = 'edge-tts-7.3.1-v1';
  const FORMAT = 'mp3';
  const VOICES = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'];
  const SPEEDS = ['0.8', '0.9', '1.0', '1.1', '1.2'];

  function normalizeSpeed(value) {
    const n = Math.round(Number(value) * 10) / 10;
    if (!Number.isFinite(n)) return '0.9';
    return Math.min(1.2, Math.max(0.8, n)).toFixed(1);
  }

  function normalizeText(text) {
    return String(text == null ? '' : text).trim();
  }

  // NUL không xuất hiện trong câu tiếng Trung nên các trường không thể "dính" vào nhau.
  function canonical(text, voice, speed, format, version) {
    return [
      normalizeText(text),
      String(voice || ''),
      normalizeSpeed(speed),
      format || FORMAT,
      version || TTS_VERSION,
    ].join('\u0000');
  }

  return { TTS_VERSION, FORMAT, VOICES, SPEEDS, normalizeSpeed, normalizeText, canonical };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AH;