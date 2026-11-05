// js/training-plan.js — V128 (giai đoạn 1): KẾ HOẠCH ƯU TIÊN THEO NĂNG LỰC. THUẦN: không DOM, không mạng, không DB.
//
// Mục đích: MỘT công thức duy nhất đọc số liệu năng lực cấp NGƯỜI HỌC (`learner`, cùng định dạng server gửi kèm phiên học:
// lib/skill-pooled.learnerCounts) và trả lời "kỹ năng nào đang tụt lại so với các kỹ năng khác của chính người học?".
// Hai màn cùng dùng công thức này nên luôn nói cùng một điều:
//   • màn bắt đầu của "Hôm nay học" (js/review.js)    — cho người học biết vì sao buổi này nghiêng về kỹ năng nào;
//   • màn "Phân tích năng lực" (js/skills-analysis.js) — hiển thị đúng số liệu mà "Hôm nay học" đang dùng.
//
// NGUỒN SỰ THẬT DUY NHẤT: phép tính "tụt lại" KHÔNG viết lại ở đây mà gọi thẳng QS.learnerSkill / QS.learnerGap của bộ chọn
// dạng câu hỏi (js/question-selector.js) → kết luận ở màn hình luôn trùng kết luận bộ chọn đang dùng, cùng ngưỡng
// (QS.WEIGHTS.learnerGapMinN / learnerGapMin), cùng cách trừ đoán mò, cùng cách làm mượt.
//
// Nguyên tắc:
//   • Không đủ mẫu → nói rõ cần thêm bao nhiêu lượt, KHÔNG kết luận yếu/giỏi.
//   • Không có kỹ năng khác đủ mẫu để so sánh → nói rõ là chưa so sánh được (không bịa mức tham chiếu).
//   • Module này THUẦN: không đổi lịch FSRS, không ghi dữ liệu. Giai đoạn 1 chỉ hiển thị. Giai đoạn 2 (V128) dùng kết quả để quyết định SỐ câu và
//     TỪ của phần "luyện thêm" (luyện bổ sung, KHÔNG phải thẻ FSRS) qua extraCap/allocate/actionable. Giai đoạn 3 (V128) thích ứng NGAY TRONG BUỔI
//     (applyAnswer/adaptExtras/describeAdapt): chỉ bớt các câu luyện thêm theo kế hoạch CHƯA hỏi; thẻ FSRS chính thức không bao giờ bị đụng tới.
//   • Chuỗi trả về là văn bản thuần (chưa thoát HTML) — nơi hiển thị phải escapeHtml.

const TP = (function () {
  'use strict';

  const SKILLS = ['recognition', 'recall', 'listening', 'pinyin', 'context']; // các kỹ năng ĐO được (khớp SK_MEASURED ở skills-ui.js)
  const LABEL = { recognition: 'Nhận diện', recall: 'Nhớ chủ động', listening: 'Nghe', pinyin: 'Pinyin', context: 'Từ trong câu' };
  const MAX_PRIORITIES = 2; // nêu tối đa 2 kỹ năng ưu tiên — không dàn trải
  // ── Giai đoạn 2: câu LUYỆN THÊM theo kỹ năng tụt lại ──────────────────────────────────────────────────────────────────────────────────
  // Trần câu luyện thêm chỉ được NÂNG khi có kỹ năng tụt lại ĐÁNG TIN (có bằng chứng) và buổi có ≥ MIN_OFFICIAL_FOR_RAISE thẻ chính thức;
  // không có bằng chứng → giữ trần cũ (25% số thẻ, ≤ 6) để không kéo dài buổi học một cách vô cớ. Người chốt mức: 40% số thẻ, tối đa 10 câu.
  const EXTRA_SHARE = 0.4, EXTRA_MAX = 10, MIN_OFFICIAL_FOR_RAISE = 4;
  // ── Giai đoạn 3: thích ứng giữa buổi (chỉ ảnh hưởng các câu luyện thêm THEO KẾ HOẠCH chưa hỏi) ─────────────────────────────────────────────
  const ADAPT_STREAK = 3;      // 3 câu theo kế hoạch gần nhất của CÙNG kỹ năng đều đúng (không gợi ý) → bớt phần còn lại; đều sai → không dồn thêm
  const ADAPT_FATIGUE = 4;     // 4 câu "bằng chứng" gần nhất (mọi loại) đều sai → bỏ hết câu theo kế hoạch còn lại cho buổi nhẹ hơn
  const ADAPT_MIN_CLEARED = 2; // ≥ 2 câu theo kế hoạch của kỹ năng, câu gần nhất đúng, và Phân tích (số liệu vừa cập nhật) không còn coi kỹ năng này tụt lại → bớt
  const PLAN_SHARE = 0.6; // trong các chỗ luyện thêm (ngoài câu thăm dò tự gõ), tối đa 60% dành cho kỹ năng tụt lại; phần còn lại vẫn là "từ hay sai" như V127

  // Nạp trễ (lúc gọi) để không phụ thuộc thứ tự nạp file: trình duyệt dùng biến toàn cục QS, Node dùng require.
  function qs() {
    if (typeof QS !== 'undefined' && QS && typeof QS.learnerSkill === 'function') return QS;
    if (typeof require === 'function') { try { return require('./question-selector.js'); } catch { return null; } }
    return null;
  }
  const pct = (x) => Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 100) + '%';

  // learner = { v:1, skills:{...} } | null.  opts.typedEnabled (mặc định true): người học có cho phép câu tự gõ không.
  // Trả:
  //   status     'none' (không có số liệu) | 'insufficient' (chưa kỹ năng nào so sánh được) | 'ok' (có ít nhất 1 kỹ năng so sánh được)
  //   skills     { [skill]: { skill, label, n, ability, level, gap?, ref?, need? } }
  //                level: 'insufficient' (n < ngưỡng) | 'no-reference' (đủ mẫu nhưng chưa có kỹ năng khác đủ mẫu để so) | 'behind' (tụt lại) | 'ok'
  //   priorities [{ skill, label, ability, ref, gap, n }] — kỹ năng tụt lại, chênh nhiều nhất trước, tối đa MAX_PRIORITIES
  //   probe      true khi nhận diện (chọn đáp án) đã khá vững nhưng chưa đủ bằng chứng TỰ GÕ (đúng điều kiện QS.recallProbeNeeded)
  //   minN       số lượt tối thiểu mỗi kỹ năng cần để so sánh
  function build(learner, opts) {
    const o = opts || {};
    const q = qs();
    const empty = { status: 'none', skills: {}, priorities: [], probe: false, minN: q && q.WEIGHTS ? q.WEIGHTS.learnerGapMinN : 30 };
    if (!q || !learner || typeof learner !== 'object' || !learner.skills || typeof learner.skills !== 'object') return empty;
    const minN = q.WEIGHTS.learnerGapMinN;
    const skills = {};
    const comparable = []; // kỹ năng đủ mẫu (đóng vai tham chiếu cho kỹ năng khác) — xét MỌI khoá trong learner, đúng như QS.learnerGap
    for (const k of Object.keys(learner.skills)) {
      const me = q.learnerSkill(learner, k);
      if (me.n >= minN && me.ability != null) comparable.push(k);
    }
    const priorities = [];
    for (const k of SKILLS) {
      const me = q.learnerSkill(learner, k);
      const row = { skill: k, label: LABEL[k], n: me.n, ability: me.ability, level: 'insufficient' };
      if (me.n < minN || me.ability == null) {
        row.need = Math.max(0, minN - me.n);
      } else {
        const g = q.learnerGap(learner, k);
        if (g) {
          row.level = 'behind'; row.gap = g.gap; row.ref = g.ref;
          priorities.push({ skill: k, label: LABEL[k], ability: g.ability, ref: g.ref, gap: g.gap, n: g.n });
        } else if (comparable.some(c => c !== k)) {
          row.level = 'ok';
        } else {
          row.level = 'no-reference'; // đủ mẫu nhưng một mình — không có gì để so
        }
      }
      skills[k] = row;
    }
    priorities.sort((a, b) => b.gap - a.gap);
    const anyCompared = SKILLS.some(k => skills[k].level === 'behind' || skills[k].level === 'ok');
    return {
      status: anyCompared ? 'ok' : 'insufficient', skills, priorities: priorities.slice(0, MAX_PRIORITIES),
      probe: o.typedEnabled !== false && !!q.recallProbeNeeded(learner), minN,
    };
  }

  // Kỹ năng ưu tiên CÓ THỂ luyện thêm: bỏ kỹ năng bị loại vì hoàn cảnh (vd. 'listening' khi máy không có giọng đọc).
  // V128 giai đoạn 4: máy chủ đã có đường lấy từ cho MỌI kỹ năng đo được (kể cả 'recognition') nên không còn kỹ năng nào bị loại sẵn.
  function actionable(plan, exclude) {
    const ex = new Set(exclude || []);
    return ((plan && plan.priorities) || []).filter(p => p && !ex.has(p.skill));
  }
  // Trần số câu luyện thêm. baseCap = trần cũ do nơi gọi tính (25% số thẻ, ≤ 6). Không bao giờ thấp hơn baseCap; không quá EXTRA_MAX.
  function extraCap(officialN, baseCap, priorities) {
    const base = Math.max(0, Math.floor(Number(baseCap)) || 0);
    if (!Array.isArray(priorities) || !priorities.length || !(Number(officialN) >= MIN_OFFICIAL_FOR_RAISE)) return base;
    return Math.max(base, Math.min(EXTRA_MAX, Math.floor(Number(officialN) * EXTRA_SHARE)));
  }
  // Chia `slots` chỗ (chỗ luyện thêm trừ chỗ câu thăm dò) cho các kỹ năng ưu tiên. Trả { planSlots, bySkill:{skill:n} }; tổng bySkill = planSlots ≤ slots.
  // Một kỹ năng: nhận hết planSlots. Hai kỹ năng: chia theo độ tụt (chênh nhiều hơn → nhiều chỗ hơn), mỗi kỹ năng ≥ 1 khi planSlots ≥ 2.
  function allocate(priorities, slots) {
    const out = { planSlots: 0, bySkill: {} };
    const pri = (Array.isArray(priorities) ? priorities : []).filter(p => p && p.skill).slice(0, MAX_PRIORITIES);
    const s = Math.floor(Number(slots));
    if (!pri.length || !(s > 0)) return out;
    const planSlots = Math.min(s, Math.max(1, Math.ceil(s * PLAN_SHARE)));
    out.planSlots = planSlots;
    if (pri.length === 1 || planSlots < 2) { out.bySkill[pri[0].skill] = planSlots; return out; }
    const ga = Math.max(Number(pri[0].gap) || 0, 1e-4), gb = Math.max(Number(pri[1].gap) || 0, 1e-4);
    const na = Math.max(1, Math.min(planSlots - 1, Math.round(planSlots * ga / (ga + gb))));
    out.bySkill[pri[0].skill] = na; out.bySkill[pri[1].skill] = planSlots - na;
    return out;
  }

  // ── Giai đoạn 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Cập nhật số đếm cấp NGƯỜI HỌC sau MỘT câu trả lời (cùng cách server đếm: lib/skill-pooled.learnerCounts — trắc nghiệm vào c/rc, tự gõ vào t/rt;
  // câu mới thuộc cả cửa sổ dài lẫn cửa sổ gần đây). Trả BẢN SAO mới, không sửa đối tượng cũ. Không có số liệu (null) → giữ null: người mới không có "cơ sở"
  // để so sánh nên không tự dựng số liệu từ 1 buổi. a = { skill, typed, correct }.
  function applyAnswer(learner, a) {
    if (!learner || typeof learner !== 'object' || !learner.skills || typeof learner.skills !== 'object') return learner;
    if (!a || typeof a.skill !== 'string' || !a.skill) return learner;
    const cur = learner.skills[a.skill] || {};
    const cp = (x) => ({ n: Number(x && x.n) || 0, ok: Number(x && x.ok) || 0 });
    const next = { c: cp(cur.c), t: cp(cur.t), rc: cp(cur.rc), rt: cp(cur.rt) };
    for (const key of (a.typed ? ['t', 'rt'] : ['c', 'rc'])) { next[key].n += 1; next[key].ok += a.correct ? 1 : 0; }
    return Object.assign({}, learner, { skills: Object.assign({}, learner.skills, { [a.skill]: next }) });
  }
  // Mục nhật ký (rvLog) có phải BẰNG CHỨNG không — cùng điều kiện với hồ sơ từng từ ở review.js: không tính check/redo/match và lượt đầu sau màn giới thiệu.
  const isEvidenceEntry = (e) => !!e && !['check', 'redo', 'match'].includes(e.source) && !e.intro;
  // Thích ứng giữa buổi. log = rvLog; items = hàng đợi CÒN LẠI; learner = số liệu cấp người học đã cập nhật (có thể null).
  // Chỉ xét câu luyện thêm theo kế hoạch CHƯA hỏi (type 'extra', fromPlan, chưa có tries): câu hỏi lại sau khi sai là để sửa lỗi nên giữ nguyên.
  // Trả { drop:[item...] (cùng tham chiếu với items), events:[{ skill|null, reason:'good'|'cleared'|'struggle'|'tired', dropped:n }] }. KHÔNG sửa log/items.
  function adaptExtras(log, items, learner) {
    const out = { drop: [], events: [] };
    const lg = Array.isArray(log) ? log : [];
    const cand = (Array.isArray(items) ? items : []).filter(it => it && it.type === 'extra' && it.fromPlan && !it.tries && it.targetSkill);
    if (!cand.length) return out;
    const lastEv = lg.filter(isEvidenceEntry).slice(-ADAPT_FATIGUE);
    if (lastEv.length >= ADAPT_FATIGUE && lastEv.every(e => !e.correct)) { // mệt: sai liên tiếp ở mọi loại câu
      out.drop = cand.slice(); out.events.push({ skill: null, reason: 'tired', dropped: cand.length }); return out;
    }
    const skills = [];
    for (const it of cand) if (!skills.includes(it.targetSkill)) skills.push(it.targetSkill);
    for (const k of skills) {
      const mine = lg.filter(e => e && e.plan && e.source === 'extra' && e.skill === k);
      const last = mine.slice(-ADAPT_STREAK);
      const good = (e) => e.correct && !e.hinted;
      let reason = null;
      if (last.length >= ADAPT_STREAK && last.every(good)) reason = 'good';
      else if (last.length >= ADAPT_STREAK && last.every(e => !e.correct)) reason = 'struggle';
      else if (mine.length >= ADAPT_MIN_CLEARED && good(mine[mine.length - 1]) && learner) {
        const row = build(learner).skills[k]; if (row && row.level === 'ok') reason = 'cleared';
      }
      if (!reason) continue;
      const mineItems = cand.filter(it => it.targetSkill === k);
      out.drop.push(...mineItems); out.events.push({ skill: k, reason, dropped: mineItems.length });
    }
    return out;
  }
  // Câu thông báo (văn bản thuần) cho người học — mỗi sự kiện 1 câu, nói rõ đã bớt gì và thẻ ôn chính thức vẫn như cũ khi cần.
  function describeAdapt(events) {
    return (Array.isArray(events) ? events : []).map(ev => {
      const lb = ev.skill ? (LABEL[ev.skill] || ev.skill) : '';
      if (ev.reason === 'good') return `Bạn đã làm tốt kỹ năng ${lb} ở các câu luyện thêm nên mình bớt ${ev.dropped} câu luyện thêm còn lại của kỹ năng này.`;
      if (ev.reason === 'cleared') return `Theo số liệu vừa cập nhật, kỹ năng ${lb} không còn tụt lại so với các kỹ năng khác nên mình bớt ${ev.dropped} câu luyện thêm còn lại của kỹ năng này.`;
      if (ev.reason === 'struggle') return `Kỹ năng ${lb} đang khó với bạn trong buổi này nên mình không dồn thêm: bỏ ${ev.dropped} câu luyện thêm còn lại của kỹ năng này (thẻ ôn chính thức vẫn như cũ).`;
      return `Bạn vừa sai liên tiếp ${ADAPT_FATIGUE} câu nên mình bỏ ${ev.dropped} câu luyện thêm còn lại để buổi học nhẹ hơn (thẻ ôn chính thức vẫn như cũ).`;
    });
  }

  // Văn bản hiển thị. opts.probeCount: số câu thăm dò tự gõ THỰC SỰ đang có trong buổi (màn bắt đầu biết chính xác);
  // bỏ qua (undefined) ở màn phân tích → chỉ nêu điều kiện chung.
  // Trả { status, headline, lines[], rows[], note } — rows dùng cho màn phân tích (mỗi kỹ năng 1 dòng).
  function describe(plan, opts) {
    const o = opts || {};
    if (!plan || plan.status === 'none') return { status: 'none', headline: null, lines: [], rows: [], note: null };
    const lines = [];
    let headline;
    if (plan.priorities.length) {
      headline = 'Theo phân tích năng lực, kỹ năng nên ưu tiên hôm nay:';
      for (const p of plan.priorities) {
        lines.push(`${p.label}: ${pct(p.ability)} — thấp hơn mức giữa của các kỹ năng khác (${pct(p.ref)}) khoảng ${Math.round(p.gap * 100)} điểm %.`);
      }
      lines.push('Bộ chọn câu hỏi sẽ nghiêng về các dạng câu của kỹ năng này (số thẻ ôn vẫn do FSRS quyết định).');
      const ex = o.extraBySkill && typeof o.extraBySkill === 'object' ? o.extraBySkill : null;
      if (ex) { // màn bắt đầu: số câu luyện thêm THẬT đang có trong hàng đợi
        const parts = SKILLS.filter(k => Number(ex[k]) > 0).map(k => `${LABEL[k]} ${Number(ex[k])} câu`);
        lines.push(parts.length
          ? `Luyện thêm theo kế hoạch: ${parts.join(', ')} (luyện bổ sung, không đổi lịch ôn FSRS).`
          : 'Hôm nay chưa thêm câu luyện thêm riêng cho kỹ năng này.');
      } else { // màn phân tích: nêu quy tắc chung
        lines.push(`Khi có kỹ năng tụt lại đáng tin, buổi học được thêm câu luyện cho kỹ năng đó: tối đa ${Math.round(EXTRA_SHARE * 100)}% số thẻ chính thức và không quá ${EXTRA_MAX} câu (khi chưa có kỹ năng nào tụt lại: 25%, không quá 6). Đây là luyện bổ sung, không đổi lịch ôn FSRS.`);
      }

    } else if (plan.status === 'ok') {
      headline = 'Theo phân tích năng lực: chưa thấy kỹ năng nào tụt lại rõ rệt so với các kỹ năng khác.';
    } else {
      headline = 'Chưa đủ dữ liệu để biết kỹ năng nào cần ưu tiên.';
      lines.push(`Mỗi kỹ năng cần ≥ ${plan.minN} lượt (đã trừ đoán mò) và cần ít nhất 2 kỹ năng đủ lượt để so sánh với nhau.`);
    }
    const pc = Number.isFinite(o.probeCount) ? o.probeCount : null;
    if (pc != null) {
      if (pc > 0) lines.push(`Buổi này có ${pc} câu tự gõ chữ Hán để đo khả năng tự nhớ (luyện bổ sung, không đổi lịch ôn).`);
    } else if (plan.probe) {
      lines.push('Nhận diện (chọn đáp án) đã khá vững nhưng chưa đủ bằng chứng về tự gõ chữ Hán: buổi học có từ 8 thẻ chính thức trở lên sẽ thêm tối đa 2 câu tự gõ để đo (luyện bổ sung, không đổi lịch ôn).');
    }
    const rows = SKILLS.map(k => {
      const s = plan.skills[k]; if (!s) return null;
      let text;
      if (s.level === 'insufficient') text = `Chưa đủ để so sánh (${s.n}/${plan.minN} lượt)`;
      else if (s.level === 'no-reference') text = `${pct(s.ability)} · chưa có kỹ năng nào khác đủ lượt để so sánh`;
      else if (s.level === 'behind') text = `${pct(s.ability)} · tụt lại khoảng ${Math.round(s.gap * 100)} điểm % so với mức giữa (${pct(s.ref)})`;
      else text = `${pct(s.ability)} · không tụt lại so với các kỹ năng khác`;
      return { skill: k, label: s.label, level: s.level, text };
    }).filter(Boolean);
    return {
      status: plan.status, headline, lines, rows,
      note: 'Số liệu cấp người học: gộp mọi từ, đã trừ xác suất đoán mò (trắc nghiệm 4 đáp án đúng 25% chỉ nhờ đoán). So với chính các kỹ năng khác của bạn, không dùng ngưỡng tuyệt đối vì nhớ chủ động vốn khó hơn nhận diện.',
    };
  }

  return { SKILLS, LABEL, MAX_PRIORITIES, EXTRA_SHARE, EXTRA_MAX, MIN_OFFICIAL_FOR_RAISE, PLAN_SHARE, ADAPT_STREAK, ADAPT_FATIGUE, ADAPT_MIN_CLEARED, build, describe, actionable, extraCap, allocate, applyAnswer, adaptExtras, describeAdapt };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TP;
