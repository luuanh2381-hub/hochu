// js/example-file.js — V170: đọc file câu ví dụ cho phép tới 3 CẶP câu / 1 từ (THUẦN — không DOM, không mạng).
//
// Hai kiểu file đều được nhận (có thể trộn):
//   • DẠNG RỘNG (mới): 1 dòng / 1 từ, tối đa 3 cặp: hz | zh1 py1 vi1 | zh2 py2 vi2 | zh3 py3 vi3
//       (cặp 1 có thể ghi không số: zh / py / vi).
//   • DẠNG DÀI (cũ): mỗi dòng 1 câu: hz | zh | py | vi — một từ lặp nhiều dòng.
// Mỗi cặp được tách thành 1 dòng {hz, zh, vi, py} rồi gửi lên server như cũ (server không đổi: kiểm tra từ có trong kho,
// câu phải chứa từ, bỏ trùng, bổ sung pinyin…). Cặp để trống hoàn toàn thì bỏ qua.
const EXF = (function () {
  'use strict';
  const MAX_PAIRS = 3;
  // Bỏ dấu/khoảng trắng/ký tự lạ, chữ thường: "Câu ví dụ 2" → "cauvidu2", "py_3" → "py3".
  const norm = (k) => String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = {
    hz: ['hz', 'chuhan', 'tu'],
    zh: ['zh', 'cauvidu', 'cau', 'vidu'],
    vi: ['vi', 'nghia', 'dich'],
    py: ['py', 'pinyin', 'piyin', 'pinyi', 'phienam', 'phatam'],
  };
  const FIELD_OF = {}; for (const f of Object.keys(ALIAS)) for (const a of ALIAS[f]) FIELD_OF[a] = f;

  // Khoá cột → { field, pair } hoặc null. "zh2" → {zh,2}; "zh" → {zh,1}; "hz" → {hz,0}.
  function parseKey(key) {
    const k = norm(key);
    const m = k.match(/^([a-z]+?)([0-9]*)$/);
    if (!m) return null;
    const field = FIELD_OF[m[1]];
    if (!field) return null;
    if (field === 'hz') return m[2] ? null : { field, pair: 0 };
    const pair = m[2] ? parseInt(m[2], 10) : 1;
    if (!(pair >= 1 && pair <= MAX_PAIRS)) return null;
    return { field, pair };
  }

  // rawRows: kết quả sheet_to_json (mảng object theo tiêu đề). Trả { rows, src, ignoredColumns }:
  //   rows[i] = {hz, zh, vi, py}; src[i] = { line (dòng trong file, tính cả tiêu đề), pair }.
  function expandRows(rawRows) {
    const rows = [], src = []; const ignored = new Set();
    (rawRows || []).forEach((r, idx) => {
      const line = idx + 2;
      let hz = ''; const pairs = {};
      for (const key of Object.keys(r || {})) {
        const p = parseKey(key);
        const val = String(r[key] == null ? '' : r[key]).trim();
        if (!p) { if (/^(zh|py|vi|pinyin|cau|nghia)\d+$/.test(norm(key))) ignored.add(String(key)); continue; }
        if (p.field === 'hz') { if (val && !hz) hz = val; continue; }
        const slot = pairs[p.pair] || (pairs[p.pair] = { zh: '', vi: '', py: '' });
        if (val && !slot[p.field]) slot[p.field] = val;
      }
      let any = false;
      for (let n = 1; n <= MAX_PAIRS; n++) {
        const s = pairs[n]; if (!s || !(s.zh || s.vi || s.py)) continue;
        rows.push({ hz, zh: s.zh, vi: s.vi, py: s.py }); src.push({ line, pair: n }); any = true;
      }
      // Dòng có từ nhưng không cặp nào có nội dung → vẫn gửi 1 dòng rỗng để server báo "Thiếu hz, zh hoặc vi" (không nuốt lỗi).
      if (!any && hz) { rows.push({ hz, zh: '', vi: '', py: '' }); src.push({ line, pair: 1 }); }
    });
    return { rows, src, ignoredColumns: [...ignored] };
  }

  // Nhãn vị trí thân thiện cho báo lỗi: "5 (cặp 2)". serverLine = chỉ số trong lô + 2 (như server đánh).
  function labelFor(src, serverLine, offset) {
    const s = src[(serverLine - 2) + (offset || 0)];
    if (!s) return String(serverLine);
    return s.pair > 1 ? `${s.line} (cặp ${s.pair})` : String(s.line);
  }

  const TEMPLATE_ROWS = [
    { hz: '学习', zh1: '我每天学习汉语。', py1: 'Wǒ měitiān xuéxí Hànyǔ.', vi1: 'Mỗi ngày tôi học tiếng Trung.',
      zh2: '他学习很努力。', py2: 'Tā xuéxí hěn nǔlì.', vi2: 'Anh ấy học rất chăm.',
      zh3: '我们一起学习吧。', py3: 'Wǒmen yìqǐ xuéxí ba.', vi3: 'Chúng ta cùng học nhé.' },
    { hz: '朋友', zh1: '他是我的好朋友。', py1: 'Tā shì wǒ de hǎo péngyou.', vi1: 'Anh ấy là bạn tốt của tôi.',
      zh2: '我有很多朋友。', py2: 'Wǒ yǒu hěn duō péngyou.', vi2: 'Tôi có rất nhiều bạn.',
      zh3: '', py3: '', vi3: '' },
  ];

  return { MAX_PAIRS, parseKey, expandRows, labelFor, TEMPLATE_ROWS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EXF;
