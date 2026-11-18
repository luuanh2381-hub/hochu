// js/sentence-words-file.js — V172: "Từ mới trong câu ví dụ" — đọc / kiểm tra / xuất file giải thích từ (THUẦN — không DOM, không mạng,
// dùng chung trình duyệt + server + test). Mỗi câu ví dụ (zh) có tối đa 8 từ cần giải thích: {word, py, vi, note}.
//
// File nhập nhận 2 kiểu (trộn được):
//   • DẠNG DÀI : mỗi dòng 1 từ:  zh | word | py | vi | note       (câu lặp lại nhiều dòng)
//   • DẠNG RỘNG: mỗi dòng 1 câu: zh | word1 py1 vi1 note1 | word2 py2 vi2 note2 | … tới 8 từ   (cũng là dạng file XUẤT RA)
// Cột không nhận ra (vd hz, cau_vi) bị bỏ qua — nên file xuất ra có thể giữ nguyên các cột gợi ý cho công cụ AI bên ngoài.
const SWX = (function () {
  'use strict';
  const MAX_WORDS = 8, MAX_ROWS = 5000;
  const norm = (k) => String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = {
    zh: ['zh', 'cau', 'cauvidu', 'cautiengtrung', 'vidu'],
    word: ['word', 'tu', 'tumoi', 'tuvung'],
    py: ['py', 'pinyin', 'piyin', 'phienam'],
    vi: ['vi', 'nghia', 'nghiatu'],
    note: ['note', 'ghichu', 'giaithich'],
  };
  const FIELD = {}; for (const f of Object.keys(ALIAS)) for (const a of ALIAS[f]) FIELD[a] = f;
  const str = (v) => (v == null ? '' : String(v)).trim();

  function parseKey(key) {
    const m = norm(key).match(/^([a-z]+?)([0-9]*)$/);
    if (!m || !FIELD[m[1]]) return null;
    const field = FIELD[m[1]];
    if (field === 'zh') return m[2] ? null : { field, slot: 0 };
    const slot = m[2] ? parseInt(m[2], 10) : 1;
    if (!(slot >= 1 && slot <= MAX_WORDS)) return null;
    return { field, slot };
  }

  // Kiểm tra 1 từ của 1 câu → { word } sạch hoặc { error }.
  function cleanWord(zh, w) {
    const word = str(w && w.word), py = str(w && w.py), vi = str(w && w.vi), note = str(w && w.note);
    if (!word) return { error: 'Thiếu chữ Hán của từ' };
    if (word.length > 30) return { error: `Từ "${word.slice(0, 12)}…" quá dài (tối đa 30 ký tự)` };
    if (!zh.includes(word)) return { error: `Từ "${word}" không có trong câu` };
    if (!vi) return { error: `Từ "${word}" thiếu nghĩa tiếng Việt` };
    if (vi.length > 300 || note.length > 300 || py.length > 120) return { error: `Từ "${word}": nghĩa/ghi chú/pinyin quá dài` };
    return { word: { word, py, vi, note } };
  }

  // Gom + kiểm tra danh sách câu {zh, words:[…], line?} (dùng cho cả client lẫn server). Từ trùng trong 1 câu: giữ từ đầu tiên.
  function validateSentences(list) {
    const sentences = [], errors = []; const byZh = new Map();
    for (const s of Array.isArray(list) ? list : []) {
      const zh = str(s && s.zh); const line = s && s.line;
      if (!zh) { errors.push({ line, reason: 'Thiếu câu tiếng Trung (zh)' }); continue; }
      let cur = byZh.get(zh);
      if (!cur) { cur = { zh, words: [], line }; byZh.set(zh, cur); sentences.push(cur); }
      for (const w of Array.isArray(s.words) ? s.words : []) {
        const c = cleanWord(zh, w);
        if (c.error) { errors.push({ line: (w && w.line) || line, reason: c.error }); continue; }
        if (cur.words.some((x) => x.word === c.word.word)) continue;
        if (cur.words.length >= MAX_WORDS) { errors.push({ line: (w && w.line) || line, reason: `Câu có quá ${MAX_WORDS} từ — bỏ "${c.word.word}"` }); continue; }
        cur.words.push(c.word);
      }
    }
    return { sentences, errors };
  }

  // rawRows: sheet_to_json → { sentences, errors, ignoredColumns, rowCount }
  function parseRows(rawRows) {
    const items = []; const ignored = new Set(); let n = 0;
    (rawRows || []).forEach((r, idx) => {
      const line = idx + 2; let zh = ''; const slots = {};
      for (const key of Object.keys(r || {})) {
        const p = parseKey(key); const val = str(r[key]);
        if (!p) { if (/^(word|tu|py|pinyin|vi|nghia|note)\d+$/.test(norm(key))) ignored.add(String(key)); continue; }
        if (p.field === 'zh') { if (val && !zh) zh = val; continue; }
        const s = slots[p.slot] || (slots[p.slot] = {}); if (val && !s[p.field]) s[p.field] = val;
      }
      if (!zh && !Object.keys(slots).length) return;
      n++;
      const words = [];
      for (let i = 1; i <= MAX_WORDS; i++) { const s = slots[i]; if (s && (s.word || s.py || s.vi || s.note)) words.push(Object.assign({ line }, s)); }
      items.push({ zh, line, words });
    });
    const v = validateSentences(items);
    return { sentences: v.sentences, errors: v.errors, ignoredColumns: [...ignored], rowCount: n };
  }

  // Dòng XUẤT RA (dạng rộng): sentences = [{ zh, vi (nghĩa câu), hz (từ đang học), words? }]
  function exportRows(sentences) {
    return (sentences || []).map((s) => {
      const row = { zh: s.zh, hz: s.hz || '', cau_vi: s.vi || '' };
      for (let i = 1; i <= MAX_WORDS; i++) { const w = (s.words || [])[i - 1] || {}; row['word' + i] = w.word || ''; row['py' + i] = w.py || ''; row['vi' + i] = w.vi || ''; row['note' + i] = w.note || ''; }
      return row;
    });
  }

  const TEMPLATE_ROWS = [
    { zh: '我们去公园散步。', hz: '公园', cau_vi: 'Chúng tôi đi dạo trong công viên.', word1: '散步', py1: 'sànbù', vi1: 'đi dạo', note1: 'động từ ly hợp: 散散步', word2: '', py2: '', vi2: '', note2: '' },
    { zh: '他对艺术很感兴趣。', hz: '艺术', cau_vi: 'Anh ấy rất hứng thú với nghệ thuật.', word1: '感兴趣', py1: 'gǎn xìngqù', vi1: 'hứng thú, quan tâm', note1: '对……感兴趣', word2: '', py2: '', vi2: '', note2: '' },
  ];
  // Lời nhắc dán vào công cụ AI bên ngoài (ChatGPT, Gemini…) cùng file xuất ra.
  const PROMPT_TEXT = [
    'Bạn là giáo viên tiếng Trung cho người Việt. Tôi gửi kèm file Excel/CSV, mỗi dòng có cột zh là một câu ví dụ tiếng Trung.',
    'Với MỖI dòng, hãy liệt kê các TỪ MỚI hoặc KHÓ trong câu (bỏ từ rất cơ bản HSK 1–2, bỏ tên riêng, bỏ từ ở cột hz vì đó là từ đang học), tối đa 8 từ.',
    'Điền vào các cột word1/py1/vi1/note1, word2/py2/vi2/note2, … :',
    '- word: chữ Hán của từ, PHẢI nằm nguyên văn trong câu zh (một từ hoặc một cụm cố định như 对……感兴趣 thì ghi phần chữ liền nhau xuất hiện trong câu).',
    '- py: pinyin có dấu thanh.',
    '- vi: nghĩa tiếng Việt ngắn gọn, đúng nghĩa trong câu này.',
    '- note: ghi chú ngữ pháp/cách dùng rất ngắn (có thể để trống).',
    'Giữ nguyên các cột zh, hz, cau_vi; KHÔNG sửa câu, KHÔNG thêm/bớt dòng. Câu không có từ mới thì để trống các cột word. Trả lại đúng bảng dưới dạng file/CSV.',
  ].join('\n');

  return { MAX_WORDS, MAX_ROWS, parseKey, cleanWord, validateSentences, parseRows, exportRows, TEMPLATE_ROWS, PROMPT_TEXT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SWX;
