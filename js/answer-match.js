// js/answer-match.js — CHẤM ĐÁP ÁN TỰ NHẬP (V110). THUẦN: không DOM, không mạng. Dùng CHUNG:
//   * server (api/index.js: /api/study/review, /preview, /api/skills/practice) — NGUỒN SỰ THẬT khi chấm;
//   * trình duyệt (js/review.js) — chỉ để hiện đúng/sai tức thì; server luôn chấm lại, không tin client.
// Không dùng AI/dịch vụ ngoài: mọi quy tắc dưới đây là quy tắc xác định, có test.
//
// ── QUY TẮC CHỮ HÁN (typed vi→hz) ──────────────────────────────────────────────────────────
//   1. Chuẩn hoá Unicode NFKC (gộp dạng tương thích: chữ Hán tương thích U+F900.., dạng toàn chiều),
//      bỏ ký tự vô hình (zero-width, BOM), bỏ MỌI khoảng trắng (kể cả khoảng trắng toàn chiều).
//   2. Bỏ dấu câu cuối/đầu thường gặp khi gõ bằng bộ gõ (。，、！？ . , ! ?) và dấu "～ … ..." đánh dấu chỗ trống.
//   3. KHÔNG đổi giản thể ↔ phồn thể, KHÔNG chấp nhận chữ gần giống: khác chữ = sai.
//   4. Đáp án chuẩn có thể có nhiều phương án ("和/跟", "(一)点儿"): chấp nhận bất kỳ phương án nào.
//
// ── QUY TẮC PINYIN (typed hz→py) ───────────────────────────────────────────────────────────
//   Chấp nhận 2 cách viết thanh điệu, đều là "ĐÚNG":
//     (a) dấu thanh:        zhǔnbèi, zhǔn bèi, Zhǔnbèi (không phân biệt hoa/thường, khoảng trắng, ' - ·)
//     (b) số thanh:         zhun3bei4, zhun3 bei4 ; ü viết ü / v / u: (lü, lv, lu:) ; thanh 5 (nhẹ) = không dấu hoặc số 5
//   Gõ thiếu thanh điệu hoàn toàn (zhunbei) → verdict 'toneless': đúng âm, nhưng KHÔNG tính là đúng
//     (kỹ năng "liên kết chữ Hán ↔ pinyin" bao gồm thanh điệu). Chế độ nào muốn nới có thể truyền
//     { allowToneless: true } và PHẢI hiện quy tắc đó cho người học (UI hiện dòng hướng dẫn riêng).
//   Gõ đủ âm nhưng sai thanh → 'tone_mismatch' (SAI). Khác âm → 'wrong' (SAI).
//   Đáp án chuẩn có nhiều cách đọc ("cháng / zhǎng"): chấp nhận bất kỳ cách đọc nào.
//   KHÔNG đoán ý người học: gần giống mà không khớp quy tắc = không đúng.

const AM = (function () {
  'use strict';

  const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
  const HZ_EDGE_PUNCT = /^[\s。，、！？．，,.!?；;：:"'“”‘’（）()\[\]【】…～~·-]+|[\s。，、！？．，,.!?；;：:"'“”‘’（）()\[\]【】…～~·-]+$/g;
  const HZ_PLACEHOLDER = /[～~…]|\.{2,}|。{2,}/g;

  function nfkc(s) { return String(s == null ? '' : s).normalize('NFKC').replace(INVISIBLE, ''); }

  // ── Tách các phương án của đáp án chuẩn ─────────────────────────────────────────────────
  function splitAlternatives(s) {
    const out = [];
    const parts = nfkc(s).split(/[\/;；|、]+|,(?!\d)|，/).map(t => t.trim()).filter(Boolean);
    for (const p of parts) {
      out.push(p);
      if (/[（(][^）)]*[）)]/.test(p)) { // "(一)点儿": thêm bản bỏ phần trong ngoặc và bản giữ nội dung ngoặc
        out.push(p.replace(/[（(][^）)]*[）)]/g, '').trim());
        out.push(p.replace(/[（(]([^）)]*)[）)]/g, '$1').trim());
      }
    }
    return [...new Set(out.filter(Boolean))];
  }

  // ═══ CHỮ HÁN ══════════════════════════════════════════════════════════════════════════════
  function normalizeHanzi(s) {
    return nfkc(s).replace(/\s+/g, '').replace(HZ_PLACEHOLDER, '').replace(HZ_EDGE_PUNCT, '');
  }
  function matchHanzi(input, expected) {
    const given = normalizeHanzi(input);
    if (!given) return { verdict: 'empty', correct: false };
    for (const alt of splitAlternatives(expected)) {
      if (normalizeHanzi(alt) === given) return { verdict: 'exact', correct: true };
    }
    return { verdict: 'wrong', correct: false };
  }

  // ═══ PINYIN ═══════════════════════════════════════════════════════════════════════════════
  // Bảng nguyên âm có dấu → [nguyên âm gốc, thanh]. Dùng dạng NFC dựng sẵn; dạng tổ hợp (combining) đã được
  // NFC gộp trước khi tra. ü có dấu: ǖǘǚǜ. ɡ (U+0261, g một tầng) đổi về g.
  const MARKED = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
    'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4],
  };
  const VOWELS = 'aeiouü';

  function cleanPinyinText(s) {
    return nfkc(s).normalize('NFC').toLowerCase()
      .replace(/ɡ/g, 'g')
      .replace(/u:/g, 'ü').replace(/v/g, 'ü')
      .replace(/[\s'’`·\-_.,，。]+/g, '');
  }

  // Vị trí nguyên âm mang dấu trong 1 âm tiết đã bỏ dấu (quy tắc chuẩn: a, e → ou: o → nguyên âm cuối).
  function toneVowelIndex(syl) {
    const a = syl.indexOf('a'); if (a >= 0) return a;
    const e = syl.indexOf('e'); if (e >= 0) return e;
    const ou = syl.indexOf('ou'); if (ou >= 0) return ou;
    for (let i = syl.length - 1; i >= 0; i--) if (VOWELS.includes(syl[i])) return i;
    return -1;
  }

  // Trả về { letters, tones: {chỉ số: thanh} } hoặc null nếu không phải pinyin hợp lệ về mặt ký tự.
  // - Dạng có dấu: mỗi nguyên âm có dấu ghi 1 thanh tại đúng chỉ số của nó.
  // - Dạng số: số thanh đứng NGAY SAU âm tiết → đặt thanh lên nguyên âm theo quy tắc trên.
  function parsePinyin(raw) {
    const s = cleanPinyinText(raw);
    if (!s) return null;
    let letters = '';
    const tones = {};
    let sylStart = 0; // chỉ số (trong `letters`) nơi âm tiết hiện tại bắt đầu — dùng khi gặp số thanh
    let sawMark = false, sawDigit = false;
    for (const ch of s) {
      if (MARKED[ch]) {
        const [base, tone] = MARKED[ch];
        tones[letters.length] = tone;
        letters += base; sawMark = true;
      } else if (/[a-zü]/.test(ch)) {
        letters += ch;
      } else if (/[1-5]/.test(ch)) {
        sawDigit = true;
        const syl = letters.slice(sylStart);
        const rel = toneVowelIndex(syl);
        const t = Number(ch);
        if (rel >= 0 && t !== 5) tones[sylStart + rel] = t;
        sylStart = letters.length;
      } else {
        return null; // ký tự lạ (chữ Hán, ký hiệu...) → không phải pinyin
      }
    }
    if (!letters) return null;
    return { letters, tones, sawMark, sawDigit };
  }

  function sameTones(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => a[k] === b[k]);
  }

  function matchPinyin(input, expected, opts) {
    const allowToneless = !!(opts && opts.allowToneless);
    const given = parsePinyin(input);
    if (!cleanPinyinText(input)) return { verdict: 'empty', correct: false };
    if (!given) return { verdict: 'wrong', correct: false };
    let best = 'wrong';
    for (const alt of splitAlternatives(expected)) {
      const want = parsePinyin(alt);
      if (!want || want.letters !== given.letters) continue;
      if (sameTones(want.tones, given.tones)) return { verdict: 'exact', correct: true };
      // Cùng chữ cái nhưng thanh khác. 'toneless' CHỈ khi người học KHÔNG gõ bất kỳ thanh nào.
      if (Object.keys(given.tones).length === 0 && Object.keys(want.tones).length > 0) {
        best = best === 'tone_mismatch' ? best : 'toneless';
      } else {
        best = 'tone_mismatch';
      }
    }
    if (best === 'toneless' && allowToneless) return { verdict: 'toneless', correct: true };
    return { verdict: best, correct: false };
  }

  // ── V118: PHẢN HỒI THANH ĐIỆU CỤ THỂ ────────────────────────────────────────────────────────
  // Chỉ để GIẢI THÍCH (không đổi cách chấm): khi verdict = 'tone_mismatch', chỉ ra âm tiết nào sai thanh, bạn gõ thanh mấy,
  // đáp án là thanh mấy. Tách âm tiết theo cụm nguyên âm (mỗi âm tiết pinyin có đúng 1 cụm nguyên âm); phụ âm nằm giữa hai cụm
  // được chia theo quy tắc: 'ng' thuộc âm tiết trước; 'n'/'r' đứng trước phụ âm khác thuộc âm tiết trước; còn lại thuộc âm tiết sau.
  // Chuỗi âm tiết chỉ dùng để HIỂN THỊ — việc phát hiện khác thanh dựa trên chỉ số ký tự nên không phụ thuộc cách tách này.
  function syllableBounds(letters) {
    const runs = [];
    for (let i = 0; i < letters.length;) {
      if (VOWELS.includes(letters[i])) { let j = i; while (j < letters.length && VOWELS.includes(letters[j])) j++; runs.push([i, j]); i = j; } else i++;
    }
    if (!runs.length) return [];
    const cuts = [0];
    for (let k = 1; k < runs.length; k++) {
      const c = letters.slice(runs[k - 1][1], runs[k][0]);
      let cut = runs[k - 1][1];                                   // mặc định: toàn bộ cụm phụ âm thuộc âm tiết sau
      if (c.startsWith('ng')) cut += 2;                           // ng luôn là âm cuối (tiếng Hán không có thanh mẫu ng)
      else if (c.length >= 2 && (c[0] === 'n' || c[0] === 'r')) cut += 1;
      cuts.push(cut);
    }
    cuts.push(letters.length);
    return runs.map((_, k) => ({ start: cuts[k], end: cuts[k + 1] }));
  }
  function toneInRange(tones, start, end) {
    for (const k of Object.keys(tones)) { const i = Number(k); if (i >= start && i < end) return tones[k]; }
    return 0; // 0 = không có thanh (thanh nhẹ / không gõ)
  }
  // Trả mảng [{ n, syllable, got, want }] cho các âm tiết khác thanh (n tính từ 1); null nếu không có phương án nào cùng chữ cái.
  function toneDiff(input, expected) {
    const given = parsePinyin(input);
    if (!given) return null;
    let best = null;
    for (const alt of splitAlternatives(expected)) {
      const want = parsePinyin(alt);
      if (!want || want.letters !== given.letters || sameTones(want.tones, given.tones)) continue;
      const diffs = [];
      syllableBounds(want.letters).forEach((b, k) => {
        const w = toneInRange(want.tones, b.start, b.end), g = toneInRange(given.tones, b.start, b.end);
        if (w !== g) diffs.push({ n: k + 1, syllable: want.letters.slice(b.start, b.end), got: g, want: w });
      });
      if (diffs.length && (!best || diffs.length < best.length)) best = diffs;
    }
    return best;
  }
  const toneName = (t) => t ? 'thanh ' + t : 'không có thanh (thanh nhẹ)';
  // Câu giải thích ngắn bằng tiếng Việt, '' nếu không có gì cụ thể để nói.
  function toneFeedback(input, expected) {
    const d = toneDiff(input, expected);
    if (!d || !d.length) return '';
    const multi = syllableBounds((parsePinyin(expected.split(/[\/;；|、,，]/)[0]) || { letters: '' }).letters).length > 1;
    return d.map(x => `${multi ? `Âm tiết ${x.n} (${x.syllable}): ` : ''}bạn gõ ${toneName(x.got)}, đáp án là ${toneName(x.want)}.`).join(' ');
  }

  // Giao diện thống nhất cho server: kind = 'hz' | 'py'.
  function grade(kind, input, expected, opts) {
    return kind === 'py' ? matchPinyin(input, expected, opts) : matchHanzi(input, expected);
  }

  const VERDICT_TEXT = {
    exact: 'Đúng',
    toneless: 'Đúng âm nhưng thiếu thanh điệu — cần gõ dấu thanh (ǎ) hoặc số thanh (a3)',
    tone_mismatch: 'Đúng âm nhưng sai thanh điệu',
    wrong: 'Chưa đúng',
    empty: 'Chưa nhập đáp án',
  };

  return { normalizeHanzi, matchHanzi, parsePinyin, matchPinyin, grade, splitAlternatives, VERDICT_TEXT, toneDiff, toneFeedback };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AM;
