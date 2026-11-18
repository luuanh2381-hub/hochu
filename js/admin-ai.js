// js/admin-ai.js — V171: màn "🤖 Cấu hình AI" trong tab Quản trị (chỉ superadmin).
// Đổi nhà cung cấp / URL / model / khoá AI mà KHÔNG phải sửa code hay biến môi trường. Khoá không bao giờ được server trả về
// (chỉ "đã đặt" + 4 ký tự cuối); ô khoá để trống = giữ nguyên. Server: GET/POST /api/admin/ai-config, POST /api/admin/ai-config/test.
let aiCfg = null;      // bản công khai từ server (không có khoá)
let aiCfgBusy = false;

const AIC_SRC = { admin: ['Đã lưu ở Quản trị', '#166534', '#dcfce7'], env: ['Từ biến môi trường', '#92400e', '#fef3c7'], default: ['Mặc định', '#475569', '#e2e8f0'], none: ['Chưa đặt', '#991b1b', '#fee2e2'] };
function aicBadge(src) { const b = AIC_SRC[src] || AIC_SRC.default; return `<span style="font-size:.64rem;font-weight:700;padding:1px 7px;border-radius:8px;color:${b[1]};background:${b[2]};margin-left:6px;white-space:nowrap">${b[0]}</span>`; }
function aicInput(id, label, value, opts) {
  const o = opts || {};
  return `<label style="display:block;margin-bottom:10px;font-size:.78rem;font-weight:700;color:var(--ink-2,inherit)">${label}${o.src ? aicBadge(o.src) : ''}
    <input id="${id}" type="${o.type || 'text'}" value="${escapeHtml(value == null ? '' : value)}" placeholder="${escapeHtml(o.placeholder || '')}" autocomplete="off" autocapitalize="none" spellcheck="false"
      style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px 10px;border-radius:10px;border:1.5px solid var(--border-strong,#ccc);background:var(--card,#fff);color:inherit;font-size:.9rem;font-weight:400">
    ${o.help ? `<span style="display:block;font-size:.7rem;font-weight:400;color:var(--muted);margin-top:3px">${o.help}</span>` : ''}</label>`;
}
function aicSecret(id, label, sec, section, clearField) {
  const ph = sec.set ? `Đang dùng ${sec.tail} — để trống = giữ nguyên` : 'Dán khoá vào đây';
  return `<div style="margin-bottom:10px">${aicInput(id, label, '', { type: 'password', placeholder: ph, src: sec.source })}
    ${sec.set && sec.source === 'admin' ? `<button type="button" class="btn btn-sm" style="margin-top:-4px;background:#fdecea;color:#c0392b" onclick="aicClearKey('${section}','${clearField}')">🗑️ Xoá khoá đã lưu (quay về biến môi trường)</button>` : ''}</div>`;
}
function aicBox(title, inner, section, msgId) {
  return `<div style="border:1.5px solid var(--border);border-radius:14px;padding:12px;margin-bottom:12px">
    <div style="font-weight:800;margin-bottom:8px">${title}</div>${inner}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
      <button class="btn btn-primary btn-sm" onclick="aicSave('${section}')">💾 Lưu</button>
      ${aiCfg.hasStored[section] ? `<button class="btn btn-sm" onclick="aicReset('${section}')">↩️ Về mặc định / biến môi trường</button>` : ''}
    </div>
    <div id="${msgId}" style="font-size:.78rem;margin-top:8px;overflow-wrap:anywhere"></div></div>`;
}
function aicTextHtml() {
  const t = aiCfg.text; const P = aiCfg.presets;
  const opts = Object.keys(P).map((id) => `<option value="${id}"${id === t.provider ? ' selected' : ''}>${escapeHtml(P[id].label)}</option>`).join('');
  const rs = aiCfg.reasoningOptions.map((r) => `<option value="${r}"${r === t.reasoning ? ' selected' : ''}>${{ off: 'Tắt (không gửi tham số)', low: 'Thấp (khuyên dùng)', medium: 'Vừa', high: 'Cao' }[r]}</option>`).join('');
  const modelRows = t.models.map((m) => `<div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap"><code style="font-size:.74rem;overflow-wrap:anywhere">${escapeHtml(m)}</code>
      <button type="button" class="btn btn-sm" onclick="aicTest('text','${escapeHtml(m).replace(/'/g, '&#39;')}',this)">▶ Thử</button><span class="aic-res" style="font-size:.74rem"></span></div>`).join('');
  const inner = `
    <label style="display:block;margin-bottom:10px;font-size:.78rem;font-weight:700">Nhà cung cấp
      <select id="aic-provider" onchange="aicPreset(this.value)" style="display:block;width:100%;margin-top:4px;padding:9px 10px;border-radius:10px;border:1.5px solid var(--border-strong,#ccc);background:var(--card,#fff);color:inherit;font-size:.9rem">${opts}</select>
      <span id="aic-provider-hint" style="display:block;font-size:.7rem;font-weight:400;color:var(--muted);margin-top:3px">${escapeHtml((P[t.provider] || {}).hint || '')}</span></label>
    ${aicInput('aic-baseurl', 'URL API (…/v1, chưa gồm /chat/completions)', t.baseUrl, { src: t.sources.baseUrl, placeholder: 'https://openrouter.ai/api/v1' })}
    ${aicSecret('aic-text-key', 'API key', t.apiKey, 'text', 'clearKey')}
    <label style="display:block;margin-bottom:10px;font-size:.78rem;font-weight:700">Danh sách model — mỗi dòng 1 model, thử từ trên xuống; model lỗi/quá tải thì tự chuyển model kế${aicBadge(t.sources.models)}
      <textarea id="aic-models" rows="4" spellcheck="false" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px 10px;border-radius:10px;border:1.5px solid var(--border-strong,#ccc);background:var(--card,#fff);color:inherit;font:inherit;font-size:.85rem;font-weight:400">${escapeHtml(t.models.join('\n'))}</textarea></label>
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">Thử từng model đang <b>lưu</b> (lưu trước rồi bấm ▶):${modelRows}</div>
    ${aicInput('aic-interval', 'Giãn cách tối thiểu giữa 2 lần gọi (ms)', t.minIntervalMs, { type: 'number', src: t.sources.minIntervalMs, help: 'Model miễn phí thường giới hạn ~20 lượt/phút → 3500 ms.' })}
    <label style="display:block;margin-bottom:10px;font-size:.78rem;font-weight:700">Mức suy luận (chỉ OpenRouter)${aicBadge(t.sources.reasoning)}
      <select id="aic-reasoning" style="display:block;width:100%;margin-top:4px;padding:9px 10px;border-radius:10px;border:1.5px solid var(--border-strong,#ccc);background:var(--card,#fff);color:inherit;font-size:.9rem">${rs}</select>
      <span style="display:block;font-size:.7rem;font-weight:400;color:var(--muted);margin-top:3px">Thấp giúp model "suy nghĩ" không ăn hết token (lỗi finish_reason: length). Nhà cung cấp khác bỏ qua mục này.</span></label>`;
  return aicBox('📝 AI văn bản — sinh ví dụ, giải thích, dịch, hội thoại, chiết tự…', inner, 'text', 'aic-msg-text');
}
function aicSpeechHtml() {
  const s = aiCfg.speech;
  const inner = `${aicSecret('aic-speech-key', 'API key Gemini', s.apiKey, 'speech', 'clearKey')}
    ${aicInput('aic-speech-model', 'Model Gemini', s.model, { src: s.sources.model, placeholder: 'gemini-3.5-flash' })}
    ${aicInput('aic-speech-interval', 'Giãn cách tối thiểu giữa 2 lần gọi (ms)', s.minIntervalMs, { type: 'number', src: s.sources.minIntervalMs, help: 'Free tier Gemini thường ~5 lượt/phút → 13000 ms.' })}
    <div style="margin-bottom:10px"><button type="button" class="btn btn-sm" onclick="aicTest('speech','',this)">▶ Kiểm tra key + model đã lưu</button> <span class="aic-res" style="font-size:.76rem"></span></div>`;
  return aicBox('🎤 Chấm phát âm bằng giọng nói (Google Gemini)', inner, 'speech', 'aic-msg-speech');
}
function aicRender() {
  const root = document.getElementById('aic-root'); if (!root) return;
  if (!aiCfg) { root.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px">Đang tải…</div>'; return; }
  root.innerHTML = aicTextHtml() + aicSpeechHtml();
}
function aiCfgPanelHtml() {
  return `<div class="panel" id="aic-panel">
    <div class="panel-title">🤖 Cấu hình AI <span style="font-size:.7rem;background:var(--l15c);color:var(--l15a);padding:2px 8px;border-radius:8px;">superadmin</span></div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;line-height:1.5">
      Đổi nhà cung cấp, URL, model và khoá AI tại đây — áp dụng trong ≤ 20 giây, <b>không cần sửa code hay biến môi trường</b>. Thứ tự ưu tiên: giá trị lưu ở đây → biến môi trường Vercel → mặc định.
      Khoá được lưu trong cơ sở dữ liệu của bạn và <b>không bao giờ hiển thị lại</b> (chỉ 4 ký tự cuối). Muốn an toàn hơn, vẫn có thể để khoá ở biến môi trường và chỉ chỉnh model ở đây.
    </div>
    <div id="aic-root"></div></div>`;
}
async function aicLoad() {
  if (currentRole !== 'superadmin') return;
  aicRender();
  try {
    const res = await fetch('/api/admin/ai-config', { headers: authHeaders() });
    const d = await res.json();
    if (!d.ok) { const r = document.getElementById('aic-root'); if (r) r.innerHTML = '<div style="color:#c0392b">❌ ' + escapeHtml(d.error || 'Không tải được cấu hình AI') + '</div>'; return; }
    aiCfg = d.config; aicRender();
  } catch (e) { const r = document.getElementById('aic-root'); if (r) r.innerHTML = '<div style="color:#c0392b">❌ ' + escapeHtml(e.message) + '</div>'; }
}
function aicVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function aicMsg(section, html) { const el = document.getElementById('aic-msg-' + section); if (el) el.innerHTML = html; }
function aicPreset(id) {
  const p = aiCfg && aiCfg.presets[id]; if (!p) return;
  if (id !== 'custom') { document.getElementById('aic-baseurl').value = p.baseUrl; document.getElementById('aic-models').value = p.models.join('\n'); }
  const h = document.getElementById('aic-provider-hint'); if (h) h.textContent = p.hint || '';
  aicMsg('text', `<span style="color:var(--muted)">Đã điền URL + model gợi ý của ${escapeHtml(p.label)}. Dán API key của nhà cung cấp này rồi bấm Lưu.</span>`);
}
function aicPatch(section) {
  if (section === 'text') return { text: { baseUrl: aicVal('aic-baseurl'), models: aicVal('aic-models'), minIntervalMs: aicVal('aic-interval'), reasoning: aicVal('aic-reasoning'), apiKey: aicVal('aic-text-key') } };
  if (section === 'speech') return { speech: { model: aicVal('aic-speech-model'), minIntervalMs: aicVal('aic-speech-interval'), apiKey: aicVal('aic-speech-key') } };
  return {};
}
async function aicPost(section, body, okText) {
  if (aiCfgBusy) return; aiCfgBusy = true; aicMsg(section, '<span style="color:var(--muted)">Đang lưu…</span>');
  try {
    const res = await fetch('/api/admin/ai-config', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!d.ok) { aicMsg(section, '<span style="color:#c0392b">❌ ' + escapeHtml(d.error || 'Có lỗi xảy ra') + '</span>'); return; }
    aiCfg = d.config; aicRender(); aicMsg(section, '<span style="color:#166534">✅ ' + okText + '</span>');
  } catch (e) { aicMsg(section, '<span style="color:#c0392b">❌ ' + escapeHtml(e.message) + '</span>'); }
  finally { aiCfgBusy = false; }
}
function aicSave(section) { return aicPost(section, aicPatch(section), 'Đã lưu. Áp dụng cho lần gọi AI kế tiếp (tối đa ~20 giây trên các máy chủ khác).'); }
function aicReset(section) {
  if (!confirm('Xoá mọi giá trị đã lưu ở Quản trị cho mục này (kể cả khoá) và quay về biến môi trường / mặc định?')) return;
  return aicPost(section, { [section]: { reset: true } }, 'Đã về mặc định / biến môi trường.');
}
function aicClearKey(section, field) {
  if (!confirm('Xoá khoá đã lưu ở Quản trị? Hệ thống sẽ dùng khoá trong biến môi trường (nếu có).')) return;
  return aicPost(section, { [section]: { [field]: true } }, 'Đã xoá khoá đã lưu.');
}
async function aicTest(target, model, btn) {
  const box = btn && btn.parentElement; const out = box && box.querySelector('.aic-res');
  if (out) out.innerHTML = '<span style="color:var(--muted)">⏳ đang thử…</span>';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/admin/ai-config/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ target, model }) });
    const d = await res.json();
    if (out) out.innerHTML = d.ok ? `<span style="color:#166534">✅ chạy được (${d.ms} ms)</span>` : `<span style="color:#c0392b">❌ ${escapeHtml(d.error || 'Lỗi')}</span>`;
  } catch (e) { if (out) out.innerHTML = '<span style="color:#c0392b">❌ ' + escapeHtml(e.message) + '</span>'; }
  finally { if (btn) btn.disabled = false; }
}
