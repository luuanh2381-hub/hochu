// js/admin-sentence-words.js — V172: Quản trị → "📚 Từ mới trong câu ví dụ": XUẤT file câu cần giải thích (để công cụ AI bên ngoài điền)
// rồi NHẬP lại. Việc đọc/kiểm tra file nằm ở js/sentence-words-file.js (SWX, dùng chung với server). Server: /api/admin/sentence-words/*.
const SENTW_CHUNK = 1500;
function sentwPanelHtml() {
  return `<div style="font-weight:800;font-size:.85rem;margin:14px 0 6px;">📚 Từ mới trong câu ví dụ (giải thích từ ở màn đáp án)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;line-height:1.5">
      Quy trình: <b>① Xuất</b> file các câu chưa có giải thích → <b>② đưa file + lời nhắc</b> (có sẵn ở sheet “Hướng dẫn”) vào công cụ AI bên ngoài (ChatGPT, Gemini…) để điền các cột
      <b>word1/py1/vi1/note1 … word8</b> → <b>③ Nhập</b> lại file đã điền. Mỗi câu tối đa 8 từ; từ phải nằm nguyên văn trong câu. Cũng nhận file dạng dài (mỗi dòng 1 từ: zh, word, py, vi, note).
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <button class="btn btn-sm" style="background:var(--l8c);color:var(--l8a);" onclick="sentwExport('missing')">⬇️ Xuất câu CHƯA có giải thích</button>
      <button class="btn btn-sm" onclick="sentwExport('all')">⬇️ Xuất TẤT CẢ câu (để sửa)</button>
      <button class="btn btn-sm" onclick="sentwTemplate()">📄 Tải file mẫu</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
      <input type="file" id="sentw-file-input" accept=".xlsx,.xls,.csv" style="font-size:.8rem;max-width:100%;">
      <label style="font-size:.78rem;display:flex;gap:4px;align-items:center"><input type="checkbox" id="sentw-overwrite"> Ghi đè từ đã có của câu</label>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <button class="btn btn-sm" onclick="sentwImport(true)">👁️ Xem trước</button>
      <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="sentwImport(false)">📤 Nhập giải thích từ</button>
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
async function sentwTemplate() {
  try { await sentwSaveWorkbook(SWX.TEMPLATE_ROWS, 'mau-tu-moi-trong-cau.xlsx', true); }
  catch (e) { const el = document.getElementById('sentw-result'); if (el) el.textContent = '❌ ' + e.message; }
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
async function sentwImport(dryRun) {
  const el = document.getElementById('sentw-result');
  try {
    const input = document.getElementById('sentw-file-input'); const file = input && input.files && input.files[0];
    if (!file) throw new Error('Chưa chọn file.');
    await ensureXlsx(); // V175
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets['Câu'] || wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!raw.length) throw new Error('File không có dữ liệu.');
    const p = SWX.parseRows(raw);
    if (!p.sentences.length) throw new Error('Không đọc được từ nào — kiểm tra tiêu đề cột (zh, word1, py1, vi1, note1, …).');
    const overwrite = !!document.getElementById('sentw-overwrite').checked;
    const tot = { sentencesTouched: 0, wordsAdded: 0, wordsSkipped: 0, wordsReplaced: 0, unchangedSentences: 0, notFoundTotal: 0, errorTotal: 0 }; const notFound = [];
    for (let off = 0; off < p.sentences.length; off += SENTW_CHUNK) {
      el.textContent = `Đang ${dryRun ? 'kiểm tra' : 'nhập'} ${Math.min(off + SENTW_CHUNK, p.sentences.length)}/${p.sentences.length} câu...`;
      const res = await fetch('/api/admin/sentence-words/import', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ sentences: p.sentences.slice(off, off + SENTW_CHUNK), dryRun, overwrite }) });
      const d = await res.json();
      if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra') + (off && !dryRun ? ` (đã nhập xong ${off} câu đầu)` : ''); return; }
      for (const k of Object.keys(tot)) tot[k] += d[k] || 0;
      notFound.push(...(d.notFound || []));
    }
    const list = (arr, f) => arr.length ? `<ul style="margin:4px 0 0 18px;padding:0">${arr.slice(0, 10).map(f).join('')}</ul>` : '';
    el.innerHTML = `${dryRun ? '👁️ <b>Xem trước</b> (chưa ghi gì): ' : '✅ '}${overwrite ? 'ghi đè' : 'thêm'} <b>${tot.wordsAdded}</b> từ cho <b>${tot.sentencesTouched}</b> câu` +
      `${tot.wordsSkipped ? `, bỏ qua <b>${tot.wordsSkipped}</b> từ đã có` : ''}${tot.wordsReplaced ? `, thay <b>${tot.wordsReplaced}</b> từ cũ` : ''}` +
      `${tot.notFoundTotal ? `; <b>${tot.notFoundTotal}</b> câu không khớp câu ví dụ nào (zh phải y nguyên câu trong kho)` : ''}.` +
      `${p.ignoredColumns.length ? ` ⚠️ Bỏ qua cột ${p.ignoredColumns.map(wexEsc).join(', ')} (tối đa ${SWX.MAX_WORDS} từ/câu).` : ''}` +
      list(notFound, (z) => `<li>không khớp: ${wexEsc(z)}</li>`) + (p.errors.length ? `<div style="margin-top:4px">⚠️ ${p.errors.length} từ không hợp lệ (đã bỏ qua):</div>` + list(p.errors, (x) => `<li>dòng ${x.line}: ${wexEsc(x.reason)}</li>`) : '');
    if (!dryRun) input.value = '';
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
