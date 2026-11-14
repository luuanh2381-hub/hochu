'use strict';
// lib/conversation-gen.js — V152: SINH LƯỢT THOẠI cho thư viện hội thoại bằng AI + KIỂM TRA TỰ ĐỘNG trước khi ghi DB.
// Thuần (không đụng DB/mạng): `callModel` được truyền vào → test được bằng model giả.
//
// Nguyên tắc: AI chỉ là người SOẠN NHÁP; mọi thứ AI trả về đều bị kiểm tra cứng. Bản nháp qua kiểm tra vẫn phải được
// quản trị viên DUYỆT (gen_status 'draft' → 'ready') thì người học mới thấy. Chưa kiểm soát được cấp HSK bằng danh sách từ
// (app chưa có bảng HSK) — cấp độ được giữ bằng prompt + khâu duyệt tay.

const PROMPT_VERSION = 'v1';
const MIN_TURNS = 12;
const MAX_TURNS = 40;
const DEFAULT_TARGET_TURNS = 20;
const MAX_ERRORS_REPORTED = 12;

const HAN_ONE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const HAN_ALL = /[\u3400-\u4dbf\u4e00-\u9fff]/g;
const LATIN_OR_DIGIT = /[A-Za-z0-9\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/;
const PY_PUNCT = /[，。？！、；：,.?!;:…—–\-"“”‘’'()（）《》\[\]]/g;
const PY_SYLLABLE = /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const hanCount = (s) => (String(s).match(HAN_ALL) || []).length;

function clampTarget(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return DEFAULT_TARGET_TURNS;
  return Math.max(MIN_TURNS, Math.min(MAX_TURNS - 6, v));
}

// ── PROMPT ──────────────────────────────────────────────────────────────────────────────────────
function buildPrompt(convo, opts) {
  const o = opts || {};
  const target = clampTarget(o.targetTurns);
  const chars = (Array.isArray(convo.characters) && convo.characters.length ? convo.characters : ['A', 'B']).map(String);
  const level = String(convo.hsk_level || 'HSK 3');
  const vocabCap = /4/.test(level) ? '1200 từ' : '600 từ';
  const fix = Array.isArray(o.fixNotes) && o.fixNotes.length
    ? `\nLẦN TRƯỚC BẠN TRẢ SAI, HÃY SỬA TRIỆT ĐỂ CÁC LỖI SAU:\n${o.fixNotes.slice(0, MAX_ERRORS_REPORTED).map((e) => '- ' + e).join('\n')}\n`
    : '';
  const shrink = o.shrink ? '\nLần trước câu trả lời bị cắt giữa chừng: hãy viết MỖI LƯỢT NGẮN HƠN (tối đa 15 chữ Hán), bớt vocab/grammar.\n' : '';
  return `Bạn là giáo viên tiếng Trung soạn hội thoại cho người VIỆT học tiếng Trung.
Hãy viết MỘT hội thoại hoàn chỉnh, tự nhiên, thực tế.

THÔNG TIN BÀI:
- Tiêu đề: ${convo.title_zh} (${convo.title_vi})
- Cấp độ: ${level} — chỉ dùng từ vựng và ngữ pháp trong khoảng ${vocabCap} đầu của cấp này, tránh thành ngữ/từ hiếm
- Chủ đề: ${convo.topic}
- Tình huống: ${convo.situation || convo.title_vi}
- Nhân vật (đúng các nhãn này): ${chars.join(', ')}

YÊU CẦU:
1. Đúng ${target} lượt thoại, các nhân vật nói xen kẽ tự nhiên, bài có mở đầu, diễn biến, kết thúc.
2. Mỗi lượt 6–22 chữ Hán, một ý. Câu ngắn gọn, dùng được ngay ngoài đời.
3. "zh": chỉ chữ Hán và dấu câu trung văn. KHÔNG dùng chữ số hay chữ Latin (viết số bằng chữ Hán: 三点, 二十块).
4. "py": pinyin CÓ DẤU THANH, các âm tiết cách nhau bằng dấu cách, MỖI chữ Hán đúng MỘT âm tiết (nhi hóa "儿" có thể gộp vào âm trước). Không viết lại dấu câu.
5. "vi": dịch tiếng Việt tự nhiên (không dịch từng chữ).
6. "vocab": tối đa 2 từ đáng học mỗi lượt, mỗi từ {"hz","py","vi"}; "hz" PHẢI là đoạn nằm nguyên văn trong "zh" của lượt đó. Có thể để [].
7. "grammar": chỉ khi lượt có mẫu câu đáng học (khoảng 1/3 số lượt), tối đa 1 mục {"pattern","note_vi"}; còn lại để [].
${fix}${shrink}
CHỈ TRẢ VỀ JSON, không kèm lời giải thích, theo đúng dạng:
{"turns":[{"character":"${chars[0]}","zh":"...","py":"...","vi":"...","vocab":[{"hz":"...","py":"...","vi":"..."}],"grammar":[{"pattern":"...","note_vi":"..."}]}]}`;
}

// ── PARSE ───────────────────────────────────────────────────────────────────────────────────────
function parseModelJson(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
  try { return { ok: true, value: JSON.parse(t) }; } catch (e) { /* thử cắt phần JSON */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return { ok: true, value: JSON.parse(t.slice(a, b + 1)) }; } catch (e) { /* hỏng thật */ }
  }
  // Cắt giữa chừng (hết max_tokens): có "{" mở mà không có "}" đóng cuối
  const truncated = a >= 0 && (b < a || !/\}\s*\]?\s*\}?\s*$/.test(t));
  return { ok: false, truncated, error: 'JSON không hợp lệ' + (truncated ? ' (có vẻ bị cắt giữa chừng)' : '') };
}

// ── VALIDATE ────────────────────────────────────────────────────────────────────────────────────
function pinyinTokens(py) {
  return String(py).toLowerCase().replace(PY_PUNCT, ' ').split(/\s+/).filter(Boolean);
}

// Kiểm tra 3 trường văn bản của MỘT lượt (zh/py/vi) — dùng chung cho validateTurns và sửa tay (validateTurnEdit).
function checkTextFields(zhRaw, pyRaw, viRaw) {
  const errors = [];
  const zh = str(zhRaw).replace(/\s+/g, '');
  const nHan = hanCount(zh);
  if (!zh) errors.push('thiếu "zh"');
  else if (LATIN_OR_DIGIT.test(zh)) errors.push('"zh" có chữ số/chữ Latin (phải viết bằng chữ Hán)');
  else if (nHan < 2 || nHan > 40) errors.push(`"zh" có ${nHan} chữ Hán (cần 2–40)`);

  const py = str(pyRaw).replace(/\s+/g, ' ');
  if (!py) errors.push('thiếu "py"');
  else if (HAN_ONE.test(py) || /[0-9]/.test(py)) errors.push('"py" có chữ Hán/chữ số');
  else if (zh && nHan >= 2) {
    const toks = pinyinTokens(py);
    const bad = toks.find((x) => !PY_SYLLABLE.test(x));
    const er = (zh.match(/儿/g) || []).length;
    if (bad) errors.push(`pinyin có ký tự lạ "${bad}"`);
    else if (toks.length > nHan || toks.length < nHan - er) errors.push(`pinyin ${toks.length} âm tiết ≠ ${nHan} chữ Hán`);
  }

  const vi = str(viRaw);
  if (!vi) errors.push('thiếu "vi"');
  else if (vi.length > 400) errors.push('"vi" quá dài');
  else if (HAN_ONE.test(vi)) errors.push('"vi" còn chữ Hán');
  return { errors, zh, py, vi };
}

// V153: kiểm tra bản SỬA TAY của admin (chinese_text / pinyin / vietnamese_text) bằng đúng luật như bản AI soạn.
function validateTurnEdit(input) {
  const i = input || {};
  const f = checkTextFields(i.chinese_text, i.pinyin, i.vietnamese_text);
  return { ok: f.errors.length === 0, errors: f.errors, turn: { chinese_text: f.zh, pinyin: f.py, vietnamese_text: f.vi } };
}

// V153: hạn mức sinh MỖI NGÀY (tránh đốt hết quota AI). limit <= 0 = không giới hạn; mặc định 20.
function parseDailyLimit(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 20;
}
function dailyLimitRemaining(limit, doneToday) {
  if (!(limit > 0)) return Infinity;
  return Math.max(0, limit - Math.max(0, doneToday | 0));
}

function validateTurns(raw, ctx) {
  const c = ctx || {};
  const errors = [];
  const warnings = [];
  const target = clampTarget(c.targetTurns);
  const characters = (Array.isArray(c.characters) && c.characters.length ? c.characters : ['A', 'B']).map(String);
  const canon = new Map(characters.map((x) => [x.toLowerCase(), x]));
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.turns) ? raw.turns : null);
  if (!list) return { ok: false, errors: ['Không có mảng "turns"'], warnings, turns: [] };

  const minN = Math.max(MIN_TURNS, target - 4), maxN = Math.min(MAX_TURNS, target + 6);
  if (list.length < minN || list.length > maxN) errors.push(`Số lượt = ${list.length}, cần trong khoảng ${minN}–${maxN} (mục tiêu ${target})`);

  const turns = [];
  const seenZh = new Set();
  const speakers = new Set();
  list.forEach((t, idx) => {
    const n = idx + 1;
    const e = (msg) => errors.push(`Lượt ${n}: ${msg}`);
    if (!t || typeof t !== 'object') { e('không phải object'); return; }

    const who = canon.get(str(t.character).toLowerCase());
    if (!who) e(`nhân vật "${str(t.character)}" không thuộc [${characters.join(', ')}]`); else speakers.add(who);

    const f = checkTextFields(t.zh, t.py, t.vi);
    f.errors.forEach(e);
    const zh = f.zh, py = f.py, vi = f.vi;
    if (zh) { if (seenZh.has(zh)) e('trùng lặp nguyên văn với một lượt trước'); seenZh.add(zh); }

    // vocab: loại mục lỗi (không làm hỏng cả bài), nhưng hz PHẢI nằm trong zh
    const vocab = [];
    if (Array.isArray(t.vocab)) {
      for (const v of t.vocab) {
        const hz = str(v && v.hz), vpy = str(v && v.py), vvi = str(v && v.vi);
        if (!hz || !vvi || !zh.includes(hz)) { warnings.push(`Lượt ${n}: bỏ vocab "${hz}" (không nằm trong câu hoặc thiếu nghĩa)`); continue; }
        if (!vocab.some((x) => x.hz === hz) && vocab.length < 3) vocab.push({ hz, py: vpy, vi: vvi });
      }
    }
    const grammar = [];
    if (Array.isArray(t.grammar)) {
      for (const gm of t.grammar) {
        const pattern = str(gm && gm.pattern), note = str(gm && gm.note_vi);
        if (!pattern || !note || pattern.length > 120 || note.length > 300) continue;
        if (grammar.length < 2) grammar.push({ pattern, note_vi: note });
      }
    }
    turns.push({
      turn_number: n, character: who || str(t.character), chinese_text: zh, pinyin: py, vietnamese_text: vi,
      vocabulary_explanations: vocab.length ? vocab : null,
      grammar_explanations: grammar.length ? grammar : null,
    });
  });
  if (characters.length >= 2 && list.length && speakers.size < 2) errors.push('Chỉ có một nhân vật nói — cần ít nhất hai nhân vật');
  return { ok: errors.length === 0, errors: errors.slice(0, MAX_ERRORS_REPORTED), warnings: warnings.slice(0, 20), turns };
}

// ── ORCHESTRATOR (thử lại có phản hồi lỗi) ──────────────────────────────────────────────────────
// callModel(prompt) → Promise<string>. Lỗi mạng/quota do callModel ném ra được để nguyên cho bên gọi xử lý.
async function generateConversationTurns({ convo, callModel, targetTurns, maxAttempts }) {
  const target = clampTarget(targetTurns);
  const attempts = Math.max(1, Math.min(4, maxAttempts || 3));
  let fixNotes = [];
  let shrink = false;
  let lastErrors = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const prompt = buildPrompt(convo, { targetTurns: target, fixNotes, shrink });
    const text = await callModel(prompt);
    const parsed = parseModelJson(text);
    if (!parsed.ok) {
      lastErrors = [parsed.error];
      fixNotes = [parsed.error + ' — chỉ trả JSON thuần đúng dạng đã nêu'];
      shrink = shrink || !!parsed.truncated;
      continue;
    }
    const v = validateTurns(parsed.value, { characters: convo.characters, targetTurns: target });
    if (v.ok) return { ok: true, turns: v.turns, warnings: v.warnings, attempts: attempt, promptVersion: PROMPT_VERSION };
    lastErrors = v.errors;
    fixNotes = v.errors;
  }
  return { ok: false, errors: lastErrors, attempts, promptVersion: PROMPT_VERSION };
}

module.exports = {
  PROMPT_VERSION, MIN_TURNS, MAX_TURNS, DEFAULT_TARGET_TURNS,
  buildPrompt, parseModelJson, validateTurns, validateTurnEdit, generateConversationTurns, clampTarget, pinyinTokens,
  parseDailyLimit, dailyLimitRemaining,
};
