// js/example-bundle.js — V180: GỘP "Quản lý câu ví dụ bằng file" và "Từ mới trong câu" — chỉ cần tải lên 1 FILE (THUẦN — không DOM, không mạng).
//
// Dạng file mới (1 dòng / 1 câu), cột:
//   hz | zh | cau_py | cau_vi | word1 py1 vi1 note1 | word2 py2 vi2 note2 | … tới word8
//   • hz  = từ đang học (phải có trong kho từ vựng), zh = câu tiếng Trung (phải chứa hz), cau_py = pinyin câu, cau_vi = nghĩa câu.
//     Đủ hz + zh + cau_vi thì câu được TẠO (hoặc bổ sung pinyin nếu câu đã có) như file câu ví dụ cũ.
//   • word1… = từ mới trong câu (tối đa 8, từ phải nằm nguyên văn trong zh, vi bắt buộc) như file "Từ mới trong câu" cũ.
//   Một dòng có thể chỉ có phần câu, chỉ có zh + word (câu đã có trong kho), hoặc cả hai. Tên cột không phân biệt hoa thường/dấu.
//
// Vẫn nhận mọi file CŨ, tự nhận dạng theo tiêu đề cột:
//   • Không có cột word… → file câu ví dụ kiểu cũ (dạng rộng "mỗi từ 1 dòng, tối đa 3 cặp zh1/py1/vi1" hoặc dạng dài) — đọc bằng EXF.
//   • Có cột word… nhưng KHÔNG có hz/cau_vi → file "Từ mới trong câu" kiểu cũ (dạng rộng hoặc dài) — chỉ nhập từ trong câu.
//   • Vừa có zh1/zh2… (cặp câu) vừa có word… → mơ hồ (py1/vi1 là của câu hay của từ?) → báo lỗi rõ ràng, không đoán.
// Khi chạy: bước ① tạo câu ví dụ (server /api/admin/word-examples/import), bước ② nhập từ trong câu (/api/admin/sentence-words/import)
// — server KHÔNG đổi; mỗi bước dùng lại đúng phần kiểm tra cũ (từ phải có trong kho, câu phải chứa từ, bỏ trùng…).
const EXB = (function () {
  'use strict';
  const _EXF = typeof EXF !== 'undefined' ? EXF : require('./example-file.js');
  const _SWX = typeof SWX !== 'undefined' ? SWX : require('./sentence-words-file.js');
  const norm = (k) => String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const str = (v) => (v == null ? '' : String(v)).trim();
  const HZ = new Set(['hz', 'chuhan', 'tudanghoc']);
  const SENT_VI = new Set(['cauvi', 'nghiacau', 'dichcau', 'vicau']);
  const SENT_PY = new Set(['caupy', 'pinyincau', 'phienamcau', 'pycau']);
  // Cột "từ trong câu": word/tumoi/tuvung (có hoặc không số), hoặc tu + số. "tu" trơn là chữ Hán của từ đang học ở file câu ví dụ cũ → KHÔNG tính.
  const isWordCol = (n) => /^(word|tumoi|tuvung)\d*$/.test(n) || /^tu\d+$/.test(n);
  const isPairZhCol = (n) => /^(zh|cau|cauvidu|vidu)\d+$/.test(n); // cặp câu của file câu ví dụ cũ: zh1, zh2, zh3

  function scan(rawRows) {
    let hasWord = false, hasPairZh = false;
    for (const r of rawRows || []) for (const k of Object.keys(r || {})) { const n = norm(k); if (isWordCol(n)) hasWord = true; if (isPairZhCol(n)) hasPairZh = true; }
    return { hasWord, hasPairZh };
  }

  // rawRows: kết quả sheet_to_json. Trả về:
  //   mode: 'examples' (file câu ví dụ cũ) | 'words' (chỉ từ trong câu) | 'merged' (cả hai) | 'empty'
  //   exampleRows[i] = {hz, zh, vi, py}, exampleSrc[i] = {line, pair} (để báo lỗi theo dòng trong file)
  //   sentences = [{zh, words:[{word,py,vi,note}], line}] (đã kiểm tra bằng SWX), wordErrors, ignoredColumns, rowCount
  //   noMeaningRows = số dòng có hz + zh nhưng thiếu cau_vi → KHÔNG tạo câu (chỉ nhập từ nếu câu đã có trong kho)
  //   fatal = thông báo lỗi nếu không thể đọc (file rỗng / định dạng mơ hồ)
  function parse(rawRows) {
    const out = { mode: 'empty', exampleRows: [], exampleSrc: [], sentences: [], wordErrors: [], ignoredColumns: [], rowCount: 0, noMeaningRows: 0, fatal: null };
    if (!Array.isArray(rawRows) || !rawRows.length) { out.fatal = 'File không có dữ liệu.'; return out; }
    out.rowCount = rawRows.length;
    const info = scan(rawRows);
    if (!info.hasWord) { // file câu ví dụ kiểu cũ
      const e = _EXF.expandRows(rawRows);
      out.mode = e.rows.length ? 'examples' : 'empty'; out.exampleRows = e.rows; out.exampleSrc = e.src; out.ignoredColumns = e.ignoredColumns;
      if (!e.rows.length) out.fatal = 'Không đọc được dòng nào — kiểm tra dòng tiêu đề (hz, zh, cau_py, cau_vi, word1, …).';
      return out;
    }
    if (info.hasPairZh) {
      out.fatal = 'File vừa có cột zh1/zh2… (kiểu "mỗi từ 1 dòng, tối đa 3 cặp câu") vừa có cột word1… (từ trong câu) nên không rõ py1/vi1 là của câu hay của từ. Hãy dùng 1 dòng cho 1 câu: hz, zh, cau_py, cau_vi, word1, py1, vi1, note1, …';
      return out;
    }
    const w = _SWX.parseRows(rawRows); // từ trong câu: dạng rộng hoặc dạng dài
    out.sentences = w.sentences.filter((x) => x.words.length > 0); // dòng chỉ có câu (không có từ) không cần gửi bước ②
    out.wordErrors = w.errors; out.ignoredColumns = w.ignoredColumns;
    const seen = new Set();
    rawRows.forEach((r, idx) => {
      let zh = '', hz = '', vi = '', py = '';
      for (const key of Object.keys(r || {})) {
        const val = str(r[key]); if (!val) continue;
        const n = norm(key);
        if (HZ.has(n)) { if (!hz) hz = val; continue; }
        if (SENT_VI.has(n)) { if (!vi) vi = val; continue; }
        if (SENT_PY.has(n)) { if (!py) py = val; continue; }
        const p = _SWX.parseKey(key); if (p && p.field === 'zh' && !zh) zh = val;
      }
      if (!(hz && zh)) return;
      if (!vi) { out.noMeaningRows++; return; }
      const k = hz + '\u0000' + zh; if (seen.has(k)) return; seen.add(k);
      out.exampleRows.push({ hz, zh, vi, py }); out.exampleSrc.push({ line: idx + 2, pair: 1 });
    });
    out.mode = out.exampleRows.length ? 'merged' : 'words';
    if (!out.exampleRows.length && !out.sentences.length) { out.mode = 'empty'; out.fatal = 'Không đọc được câu hay từ nào — kiểm tra dòng tiêu đề (hz, zh, cau_py, cau_vi, word1, py1, vi1, note1, …).'; }
    return out;
  }

  // ── File MẪU gộp (chính nó import được) ──
  const TEMPLATE_ROWS = [
    { hz: '学习', zh: '我每天学习汉语。', cau_py: 'Wǒ měitiān xuéxí Hànyǔ.', cau_vi: 'Mỗi ngày tôi học tiếng Trung.', words: [{ word: '每天', py: 'měitiān', vi: 'mỗi ngày', note: '' }, { word: '汉语', py: 'Hànyǔ', vi: 'tiếng Trung', note: '' }] },
    { hz: '朋友', zh: '他是我的好朋友。', cau_py: 'Tā shì wǒ de hǎo péngyou.', cau_vi: 'Anh ấy là bạn tốt của tôi.', words: [{ word: '好朋友', py: 'hǎo péngyou', vi: 'bạn tốt', note: '好 + 朋友' }] },
    { hz: '朋友', zh: '我有很多朋友。', cau_py: 'Wǒ yǒu hěn duō péngyou.', cau_vi: 'Tôi có rất nhiều bạn.', words: [] }, // chỉ có phần câu — không có từ trong câu
  ].map((s) => {
    const row = { hz: s.hz, zh: s.zh, cau_py: s.cau_py, cau_vi: s.cau_vi };
    for (let i = 1; i <= _SWX.MAX_WORDS; i++) { const w = s.words[i - 1] || {}; row['word' + i] = w.word || ''; row['py' + i] = w.py || ''; row['vi' + i] = w.vi || ''; row['note' + i] = w.note || ''; }
    return row;
  });

  const GUIDE_LINES = [
    'CÁCH DÙNG — chỉ cần tải lên MỘT file (sheet "Câu"), mỗi dòng là một câu ví dụ.',
    '',
    'PHẦN CÂU (để TẠO câu ví dụ): hz = từ đang học (phải có trong kho từ vựng) · zh = câu tiếng Trung (phải chứa hz) · cau_py = pinyin câu · cau_vi = nghĩa tiếng Việt của câu.',
    'Cần đủ hz + zh + cau_vi thì câu mới được tạo. Câu đã có trong kho sẽ được bỏ qua (chỉ bổ sung pinyin nếu còn thiếu).',
    '',
    'PHẦN TỪ MỚI TRONG CÂU (giải thích từ ở màn đáp án, không bắt buộc): word1/py1/vi1/note1, word2/py2/vi2/note2, … tới word8.',
    'word = chữ Hán nằm NGUYÊN VĂN trong zh · py = pinyin · vi = nghĩa (bắt buộc) · note = ghi chú ngắn (có thể trống). Tối đa 8 từ mỗi câu.',
    '',
    'Một dòng có thể chỉ có phần câu, chỉ có zh + word (khi câu đã có sẵn trong kho), hoặc cả hai. Từ trong câu đã có sẽ được bỏ qua, trừ khi bạn tích "Ghi đè".',
    'Vẫn nhận các file cũ: kiểu "mỗi từ 1 dòng, tối đa 3 cặp zh1/py1/vi1" và file "Từ mới trong câu" (zh + word…).',
    '',
    'MUỐN AI ĐIỀN TỪ MỚI TRONG CÂU: xuất câu ở mục "Xuất câu để AI điền từ", dán lời nhắc dưới đây cùng file vào công cụ AI, rồi nhập lại chính file AI trả về.',
    '',
    'LỜI NHẮC DÁN VÀO CÔNG CỤ AI:',
  ].concat(_SWX.PROMPT_TEXT.split('\n'));

  return { parse, scan, TEMPLATE_ROWS, GUIDE_LINES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EXB;
