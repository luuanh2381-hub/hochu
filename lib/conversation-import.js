'use strict';
// lib/conversation-import.js — V166: NHẬP HỘI THOẠI TỪ FILE NGOÀI (.xlsx/.csv, mỗi DÒNG = 1 LƯỢT THOẠI).
// THUẦN (không DB/mạng): nhận mảng dòng đã đọc từ file, trả về các hội thoại đã chuẩn hoá + lỗi/cảnh báo theo từng bài.
//
// Định dạng file (tiêu đề cột không phân biệt hoa/thường/dấu; nhiều tên gọi được chấp nhận — xem ALIAS):
//   dialogue_id | title_zh | title_vi | hsk_level | topic | situation | subtopics | characters   ← THÔNG TIN BÀI (chỉ cần điền ở DÒNG ĐẦU của mỗi bài)
//   turn | character | zh | py | vi | vocab | grammar                                           ← MỖI DÒNG 1 LƯỢT
//   vocab:   "词|cí|nghĩa; 词2|cí2|nghĩa2"     (hz phải nằm nguyên văn trong zh của lượt đó)
//   grammar: "mẫu câu|ghi chú; mẫu câu 2|ghi chú 2"
// Dòng để trống dialogue_id = tiếp tục bài ở dòng trên.
//
// Luật: LỖI (chặn nhập bài đó) = thiếu trường bắt buộc / HSK không phải 3 hoặc 4 / dưới MIN_TURNS lượt / trùng số lượt.
//       CẢNH BÁO (vẫn nhập) = pinyin lệch số chữ Hán, zh có chữ số/Latin, vocab không nằm trong câu... — bằng đúng luật kiểm tra của bài AI soạn.
const gen = require('./conversation-gen');

const MIN_TURNS = 12;          // khớp CHECK total_turns >= 12 của V152
const MAX_TURNS = 100;
const MAX_ROWS = 5000;
const MAX_DIALOGUES = 100;
const ID_RE = /^[A-Za-z0-9_.\-]{1,50}$/;

const norm = (k) => String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = {
  dialogue_id: ['dialogueid', 'dialogue', 'id', 'mabai', 'mahoithoai', 'mahoithoai', 'maid'],
  title_zh: ['titlezh', 'tieudezh', 'tentrung', 'tieudetrung', 'tieudehan'],
  title_vi: ['titlevi', 'tieudevi', 'tenviet', 'tieudeviet', 'tieude', 'title'],
  hsk_level: ['hsklevel', 'hsk', 'capdo', 'level', 'cap'],
  topic: ['topic', 'chude'],
  situation: ['situation', 'tinhhuong'],
  subtopics: ['subtopics', 'subtopic', 'chudephu'],
  characters: ['characters', 'dsnhanvat', 'danhsachnhanvat'],
  turn: ['turn', 'turnnumber', 'luot', 'stt', 'thutu'],
  character: ['character', 'speaker', 'nhanvat', 'nguoinoi', 'vai'],
  zh: ['zh', 'chinese', 'chinesetext', 'chuhan', 'tiengtrung', 'hanzi'],
  py: ['py', 'pinyin', 'piyin', 'phienam'],
  vi: ['vi', 'vietnamese', 'vietnamesetext', 'tiengviet', 'nghia', 'dich'],
  vocab: ['vocab', 'vocabulary', 'tuvung', 'tumoi'],
  grammar: ['grammar', 'nguphap'],
};
const FIELDS = Object.keys(ALIAS);

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());

function pickFields(row) {
  const m = {};
  for (const k of Object.keys(row || {})) { const n = norm(k); if (!(n in m)) m[n] = row[k]; }
  const out = {};
  for (const f of FIELDS) {
    out[f] = '';
    for (const a of ALIAS[f]) { if (m[a] !== undefined && s(m[a]) !== '') { out[f] = s(m[a]); break; } }
  }
  return out;
}

function normHsk(v) {
  const m = /^(?:hsk)?([34])$/i.exec(s(v).replace(/\s+/g, ''));
  return m ? `HSK ${m[1]}` : null;
}
const splitList = (v) => s(v).split(/[,;，；、\n]/).map((x) => x.trim()).filter(Boolean);
const splitItems = (v) => s(v).split(/[;；\n]/).map((x) => x.trim()).filter(Boolean);
const splitParts = (v) => v.split(/[|｜]/).map((x) => x.trim());

function parseVocab(text, zh, warn) {
  const out = [];
  for (const item of splitItems(text)) {
    const [hz, py, vi] = splitParts(item);
    if (!hz || !vi) { warn(`vocab "${item.slice(0, 30)}" thiếu phần "hz|py|nghĩa" — bỏ qua`); continue; }
    if (!zh.includes(hz)) { warn(`vocab "${hz}" không nằm trong câu — bỏ qua`); continue; }
    if (!out.some((x) => x.hz === hz) && out.length < 5) out.push({ hz, py: py || '', vi });
  }
  return out;
}
function parseGrammar(text, warn) {
  const out = [];
  for (const item of splitItems(text)) {
    const [pattern, note] = splitParts(item);
    if (!pattern || !note || pattern.length > 120 || note.length > 300) { warn(`grammar "${item.slice(0, 30)}" thiếu "mẫu câu|ghi chú" hoặc quá dài — bỏ qua`); continue; }
    if (out.length < 3) out.push({ pattern, note_vi: note });
  }
  return out;
}

// rows: mảng object {tiêu đề cột: giá trị}. Trả { fileErrors, dialogues, rowCount }.
function parseConversationRows(rows) {
  const fileErrors = [];
  if (!Array.isArray(rows) || !rows.length) return { fileErrors: ['File không có dữ liệu'], dialogues: [], rowCount: 0 };
  if (rows.length > MAX_ROWS) return { fileErrors: [`File có ${rows.length} dòng, tối đa ${MAX_ROWS}/lần — hãy chia nhỏ file`], dialogues: [], rowCount: rows.length };

  // Phải có ít nhất các cột lõi, nếu không báo rõ thay vì "dòng nào cũng thiếu"
  const present = new Set(); for (const r of rows.slice(0, 50)) Object.keys(r || {}).forEach((k) => present.add(norm(k)));
  const has = (f) => ALIAS[f].some((a) => present.has(a));
  const missingCols = ['dialogue_id', 'character', 'zh', 'py', 'vi'].filter((f) => !has(f));
  if (missingCols.length) fileErrors.push(`Thiếu cột: ${missingCols.join(', ')}. Hãy tải file mẫu để xem đúng tên cột.`);
  if (fileErrors.length) return { fileErrors, dialogues: [], rowCount: rows.length };

  const groups = new Map(); // dialogue_id → { id, first, rows:[{line, f}] }
  let current = '';
  rows.forEach((raw, idx) => {
    const line = idx + 2; // dòng 1 là tiêu đề
    const f = pickFields(raw);
    const blank = !f.dialogue_id && !f.character && !f.zh && !f.py && !f.vi;
    if (blank) return;
    if (f.dialogue_id) current = f.dialogue_id;
    if (!current) { fileErrors.push(`Dòng ${line}: chưa có dialogue_id (và không có bài ở dòng trên để nối tiếp)`); return; }
    if (!groups.has(current)) groups.set(current, { id: current, rows: [] });
    groups.get(current).rows.push({ line, f });
  });
  if (!groups.size && !fileErrors.length) fileErrors.push('Không có dòng dữ liệu nào');
  if (groups.size > MAX_DIALOGUES) return { fileErrors: [`File có ${groups.size} hội thoại, tối đa ${MAX_DIALOGUES}/lần — hãy chia nhỏ file`], dialogues: [], rowCount: rows.length };

  const dialogues = [];
  for (const g of groups.values()) {
    const errors = [], warnings = [];
    const meta = {};
    for (const key of ['title_zh', 'title_vi', 'hsk_level', 'topic', 'situation', 'subtopics', 'characters']) {
      for (const r of g.rows) {
        const v = r.f[key];
        if (!v) continue;
        if (!meta[key]) meta[key] = v;
        else if (meta[key] !== v) warnings.push(`Dòng ${r.line}: ${key} khác dòng đầu — dùng giá trị ở dòng đầu`);
      }
    }
    if (!ID_RE.test(g.id)) errors.push(`dialogue_id "${g.id.slice(0, 30)}" không hợp lệ (chỉ chữ/số/_/-/., tối đa 50 ký tự)`);
    if (!meta.title_zh) errors.push('thiếu title_zh'); else if (meta.title_zh.length > 255) errors.push('title_zh quá dài (>255)');
    if (!meta.title_vi) errors.push('thiếu title_vi'); else if (meta.title_vi.length > 255) errors.push('title_vi quá dài (>255)');
    if (!meta.topic) errors.push('thiếu topic'); else if (meta.topic.length > 100) errors.push('topic quá dài (>100)');
    const hsk = normHsk(meta.hsk_level);
    if (!hsk) errors.push(`hsk_level "${meta.hsk_level || ''}" không hợp lệ — chỉ nhận HSK 3 hoặc HSK 4 (hoặc 3 / 4)`);

    // Thứ tự lượt: nếu mọi dòng có số "turn" hợp lệ → sắp theo đó; ngược lại giữ thứ tự dòng.
    let list = g.rows.slice();
    const nums = list.map((r) => (/^\d+$/.test(r.f.turn) ? parseInt(r.f.turn, 10) : null));
    if (nums.every((n) => n !== null)) {
      const seen = new Set();
      for (const n of nums) { if (seen.has(n)) { errors.push(`số lượt ${n} bị trùng`); break; } seen.add(n); }
      list = list.map((r, i) => ({ r, n: nums[i] })).sort((a, b) => a.n - b.n).map((x) => x.r);
    }
    if (list.length < MIN_TURNS) errors.push(`chỉ có ${list.length} lượt — cần tối thiểu ${MIN_TURNS}`);
    if (list.length > MAX_TURNS) errors.push(`có ${list.length} lượt — tối đa ${MAX_TURNS}`);

    const order = [];            // nhãn nhân vật theo thứ tự xuất hiện
    const canon = new Map();
    const declared = splitList(meta.characters);
    for (const c of declared) { if (!canon.has(c.toLowerCase())) { canon.set(c.toLowerCase(), c); order.push(c); } }

    const turns = [];
    const seenZh = new Set();
    list.forEach((row, i) => {
      const f = row.f, at = `Dòng ${row.line}`;
      const e = (m) => errors.push(`${at}: ${m}`), w = (m) => warnings.push(`${at}: ${m}`);
      if (!f.character) e('thiếu character'); else if (f.character.length > 50) e('character quá dài (>50)');
      if (!f.zh) e('thiếu zh'); if (!f.py) e('thiếu py'); if (!f.vi) e('thiếu vi');
      if (!f.character || !f.zh || !f.py || !f.vi) return;
      let who = canon.get(f.character.toLowerCase());
      if (!who) { who = f.character; canon.set(who.toLowerCase(), who); order.push(who); }
      // Luật văn bản của bài AI soạn → ở đây chỉ CẢNH BÁO (người soạn file có thể có lý do riêng)
      const v = gen.validateTurnEdit({ chinese_text: f.zh, pinyin: f.py, vietnamese_text: f.vi });
      const chk = { zh: v.turn.chinese_text, py: v.turn.pinyin, vi: v.turn.vietnamese_text };
      v.errors.forEach(w);
      if (!/[㐀-䶿一-鿿]/.test(chk.zh)) { e('zh không có chữ Hán nào'); return; }
      if (seenZh.has(chk.zh)) w('câu zh trùng nguyên văn với một lượt trước'); seenZh.add(chk.zh);
      const vocab = parseVocab(f.vocab, chk.zh, w);
      const grammar = parseGrammar(f.grammar, w);
      turns.push({
        turn_number: i + 1, character: who, chinese_text: chk.zh, pinyin: chk.py, vietnamese_text: chk.vi,
        vocabulary_explanations: vocab.length ? vocab : null, grammar_explanations: grammar.length ? grammar : null,
      });
    });
    if (order.length < 2 && turns.length) warnings.push('chỉ có một nhân vật nói');

    dialogues.push({
      dialogueId: g.id, title_zh: meta.title_zh || '', title_vi: meta.title_vi || '', hsk_level: hsk, topic: meta.topic || '',
      situation: meta.situation || null, subtopics: meta.subtopics ? splitList(meta.subtopics) : null, characters: order,
      turns, errors: errors.slice(0, 15), warnings: warnings.slice(0, 15), warningCount: warnings.length, ok: errors.length === 0,
    });
  }
  return { fileErrors, dialogues, rowCount: rows.length };
}

// File MẪU (1 bài 12 lượt, đã qua kiểm tra — nhập thử được ngay). Nguồn duy nhất cho nút "Tải file mẫu" ở giao diện.
const TEMPLATE_COLUMNS = ['dialogue_id', 'title_zh', 'title_vi', 'hsk_level', 'topic', 'situation', 'characters', 'turn', 'character', 'zh', 'py', 'vi', 'vocab', 'grammar'];
function templateRows() {
  const T = [
    ['服务员', '你好，请问几位？', 'Nǐ hǎo, qǐng wèn jǐ wèi?', 'Xin chào, cho hỏi mấy người ạ?', '请问|qǐng wèn|cho hỏi', ''],
    ['小明', '我们两个人。', 'Wǒ men liǎng ge rén.', 'Chúng tôi hai người.', '', ''],
    ['服务员', '这边请，想喝点什么？', 'Zhè biān qǐng, xiǎng hē diǎn shén me?', 'Mời đi lối này, bạn muốn uống gì?', '', ''],
    ['小明', '来两杯茶，谢谢。', 'Lái liǎng bēi chá, xiè xie.', 'Cho hai ly trà, cảm ơn.', '', ''],
    ['服务员', '这是菜单，您慢慢看。', 'Zhè shì cài dān, nín màn màn kàn.', 'Đây là thực đơn, mời bạn xem từ từ.', '菜单|cài dān|thực đơn', ''],
    ['小明', '这个鱼多少钱？', 'Zhè ge yú duō shao qián?', 'Món cá này bao nhiêu tiền?', '', ''],
    ['服务员', '一条四十八块。', 'Yì tiáo sì shí bā kuài.', 'Một con bốn mươi tám tệ.', '', ''],
    ['小明', '太贵了，有便宜的吗？', 'Tài guì le, yǒu pián yi de ma?', 'Đắt quá, có món nào rẻ hơn không?', '便宜|pián yi|rẻ', ''],
    ['服务员', '有，这个鸡肉很好吃。', 'Yǒu, zhè ge jī ròu hěn hǎo chī.', 'Có, món thịt gà này rất ngon.', '', ''],
    ['小明', '好，就要鸡肉和一碗饭。', 'Hǎo, jiù yào jī ròu hé yì wǎn fàn.', 'Được, vậy cho tôi thịt gà và một bát cơm.', '', '就要|dùng khi quyết định chọn ngay'],
    ['服务员', '请稍等，马上就好。', 'Qǐng shāo děng, mǎ shàng jiù hǎo.', 'Xin chờ một chút, xong ngay ạ.', '马上|mǎ shàng|ngay lập tức', ''],
    ['小明', '好的，谢谢你。', 'Hǎo de, xiè xie nǐ.', 'Vâng, cảm ơn bạn.', '', ''],
  ];
  return T.map((t, i) => {
    const r = {}; TEMPLATE_COLUMNS.forEach((c) => { r[c] = ''; });
    if (i === 0) Object.assign(r, { dialogue_id: 'mau-001', title_zh: '点菜', title_vi: 'Gọi món ăn', hsk_level: 'HSK 3', topic: 'Nhà hàng', situation: 'Hai người bạn gọi món ở nhà hàng', characters: '服务员, 小明' });
    Object.assign(r, { turn: i + 1, character: t[0], zh: t[1], py: t[2], vi: t[3], vocab: t[4], grammar: t[5] });
    return r;
  });
}

module.exports = { parseConversationRows, templateRows, TEMPLATE_COLUMNS, MIN_TURNS, MAX_TURNS, MAX_ROWS, MAX_DIALOGUES };
