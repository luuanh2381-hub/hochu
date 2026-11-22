// js/admin-sentence-words.js — V172: XUẤT file câu cần giải thích từ (để công cụ AI bên ngoài điền). V180: phần NHẬP đã GỘP vào khung
// "Quản lý câu ví dụ bằng file" (js/admin.js: 1 file duy nhất cho cả câu ví dụ + từ mới trong câu; đọc file ở js/example-bundle.js).
// File này còn: panel xuất cho AI, xuất file Excel, và sentwPostSentences (gửi từ trong câu lên /api/admin/sentence-words/import theo lô).
const SENTW_CHUNK = 1500;
function sentwPanelHtml() {
  return `<div style="font-weight:800;font-size:.85rem;margin:14px 0 6px;">🤖 Xuất câu để AI điền “từ mới trong câu” (tuỳ chọn)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;line-height:1.5">
      <b>① Xuất</b> file các câu chưa có giải thích → <b>② đưa file + lời nhắc</b> (có sẵn ở sheet “Hướng dẫn”) vào công cụ AI bên ngoài (ChatGPT, Gemini…) để điền các cột
      <b>word1/py1/vi1/note1 … word8</b> → <b>③ nhập lại chính file đó ở khung “Nhập file” phía trên</b> (không cần file riêng). Mỗi câu tối đa 8 từ; từ phải nằm nguyên văn trong câu.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <button class="btn btn-sm" style="background:var(--l8c);color:var(--l8a);" onclick="sentwExport('missing')">⬇️ Xuất câu CHƯA có giải thích</button>
      <button class="btn btn-sm" onclick="sentwExport('all')">⬇️ Xuất TẤT CẢ câu (để sửa)</button>
    </div>
    <div id="sentw-result" style="font-size:.8rem;color:var(--ink-2);margin-bottom:12px;overflow-wrap:anywhere;"></div>`;
}
async function sentwSaveWorkbook(rows, filename, withPrompt) {
  await ensureXlsx(); // V175: thư viện Excel tải theo nhu cầu (lỗi tải → ném lỗi cho nơi gọi hiện thông báo)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Câu');
  if (withPrompt) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lời nhắc dán vào công cụ AI (kèm file ở sheet "Câu")']].concat(SWX.PROMPT_TEXT.split('\n').map((l) => [l]))), 'Hướng dẫn');
  XLSX.writeFile(wb, filename);
}
async function sentwExport(scope) {
  const el = document.getElementById('sentw-result'); el.textContent = 'Đang lấy danh sách câu...';
  try {
    const res = await fetch('/api/admin/sentence-words/export?scope=' + scope, { headers: authHeaders() });
    const d = await res.json();
    if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    if (!d.rows.length) { el.textContent = scope === 'missing' ? `✅ Tất cả ${d.total} câu đã có giải thích từ — không còn câu nào cần xuất.` : 'Chưa có câu ví dụ nào.'; return; }
    await sentwSaveWorkbook(d.rows, scope === 'missing' ? 'cau-can-giai-thich-tu.xlsx' : 'tat-ca-cau-giai-thich-tu.xlsx', true);
    el.innerHTML = `✅ Đã xuất <b>${d.rows.length}</b> câu (tổng ${d.total} câu, đã có giải thích ${d.done}). Sheet “Hướng dẫn” có lời nhắc để dán vào công cụ AI.${d.rows.length >= 5000 ? ' ⚠️ Đã chạm giới hạn 5000 câu/lần — xuất lại sau khi nhập để lấy phần còn lại.' : ''}`;
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
// V180: gửi danh sách câu {zh, words} lên server theo lô (dùng chung cho Nhập và Xem trước). Trả về { ok, tot, notFound } hoặc { ok:false, error, doneBefore }.
async function sentwPostSentences(sentences, dryRun, overwrite, onProgress) {
  const tot = { sentencesTouched: 0, wordsAdded: 0, wordsSkipped: 0, wordsReplaced: 0, unchangedSentences: 0, notFoundTotal: 0, errorTotal: 0 }; const notFound = [];
  for (let off = 0; off < sentences.length; off += SENTW_CHUNK) {
    if (onProgress) onProgress(Math.min(off + SENTW_CHUNK, sentences.length), sentences.length);
    const res = await fetch('/api/admin/sentence-words/import', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ sentences: sentences.slice(off, off + SENTW_CHUNK), dryRun: !!dryRun, overwrite: !!overwrite }) });
    const d = await res.json();
    if (!d.ok) return { ok: false, error: d.error || 'Có lỗi xảy ra', doneBefore: off };
    for (const k of Object.keys(tot)) tot[k] += d[k] || 0;
    notFound.push(...(d.notFound || []));
  }
  return { ok: true, tot, notFound };
}
