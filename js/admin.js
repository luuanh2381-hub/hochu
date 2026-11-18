// js/admin.js — Tab Quản trị + Quản lý từ vựng (chỉ admin/superadmin)
// ════════════════════════════════════════════════════
// TAB: QUẢN TRỊ (chỉ admin)
// ════════════════════════════════════════════════════
function renderAdmin() {
  if (!isAdminRole()) {
    return `<div class="panel center" style="padding:40px">Bạn không có quyền truy cập mục này.</div>`;
  }
  return `<div class="panel">
    <div class="panel-title">📈 Lượt truy cập</div>
    <div id="visits-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải...</div>
  </div>
  ${currentRole==='superadmin' ? aiCfgPanelHtml() : ''}
  <div class="panel">
    <div class="panel-title">🛠️ Quản trị tài khoản${currentRole==='superadmin' ? ' <span style="font-size:.7rem;background:var(--l15c);color:var(--l15a);padding:2px 8px;border-radius:8px;">QUẢN TRỊ CAO NHẤT</span>' : ''}</div>
    ${currentRole==='superadmin' ? adminRegPanelHtml() : ''}
    <div id="admin-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải danh sách...</div>
  </div>`;
}

// ════════════════════════════════════════════════════
// QUẢN LÝ TỪ VỰNG — tách riêng khỏi tab Quản trị tài khoản
// ════════════════════════════════════════════════════
function renderVocabAdmin() {
  if (!isAdminRole()) {
    return `<div class="panel center" style="padding:40px">Bạn không có quyền truy cập mục này.</div>`;
  }
  return `<div class="panel">
    <div class="panel-title">📚 Quản lý Giáo trình / Quyển</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      Tự khai báo thêm 1 "Quyển"/giáo trình mới (tên hiển thị + khoảng số bài liên tục) để hiện ngay ở màn "Chọn bài học" — không cần sửa code. Các Quyển có sẵn của app (Quyển 1/2, HSK 1-6, Chuyên ngành...) không sửa/xoá được ở đây.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <input type="text" id="bookdef-name" placeholder="Tên hiển thị (vd: Quyển 5)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;grid-column:1 / -1;">
      <select id="bookdef-group" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;grid-column:1 / -1;">${bookDefGroupOptions('📗 Giáo trình cơ bản')}</select>
      <input type="number" id="bookdef-from" min="1" placeholder="Từ bài số (vd 40)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
      <input type="number" id="bookdef-to" min="1" placeholder="Đến bài số (vd 49)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
    </div>
    <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="addBookDef()">➕ Thêm Quyển này</button>
    <div id="bookdef-result" style="font-size:.8rem;color:var(--muted);margin-top:8px;"></div>
    <div style="font-size:.72rem;color:var(--muted);margin:10px 0 4px;">Các Quyển tự khai báo hiện có:</div>
    <div id="bookdef-list-area" style="color:var(--muted);padding:10px 0;text-align:center;">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">✍️ Thêm 1 từ thủ công</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <input type="text" id="vocab-manual-hz" placeholder="Chữ Hán (ví dụ 你好)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
      <input type="text" id="vocab-manual-py" placeholder="Pinyin (ví dụ nǐ hǎo)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
      <input type="text" id="vocab-manual-vi" placeholder="Nghĩa tiếng Việt (ví dụ xin chào)" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;grid-column:1 / -1;">
      <input type="number" id="vocab-manual-l" placeholder="Số bài (ví dụ 1)" min="1" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);margin-bottom:8px;">
      <input type="checkbox" id="vocab-manual-lyhop"> 🧩 Đây là động từ ly hợp (离合词)
    </label>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:8px;">ℹ️ Nếu chữ Hán này đã có trong hệ thống (ở bất kỳ bài nào), hệ thống sẽ hỏi bạn muốn giữ dữ liệu cũ hay ghi đè trước khi thêm.</div>
    <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="addVocabManual()">➕ Thêm từ này</button>
    <div id="vocab-manual-result" style="font-size:.8rem;color:var(--muted);margin-top:8px;"></div>
    <div id="vocab-manual-dialog"></div>
  </div>
  <div class="panel">
    <div class="panel-title">📥 Thêm từ vựng mới (Excel)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      File Excel (.xlsx) cần có dòng tiêu đề với đúng 4 cột: <b>hz</b> (chữ Hán), <b>py</b> (pinyin), <b>vi</b> (nghĩa tiếng Việt), <b>l</b> (số bài học, ví dụ 1, 2, 3...).
    </div>
    <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);margin-bottom:10px;" onclick="downloadVocabTemplate()">⬇️ Tải file mẫu</button>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
      <input type="file" id="vocab-file-input" accept=".xlsx,.xls" style="font-size:.8rem;max-width:100%;">
      <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="uploadVocabExcel()">📤 Tải lên & nhập</button>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      <input type="checkbox" id="vocab-excel-overwrite"> Ghi đè dữ liệu (pinyin/nghĩa) nếu chữ Hán đã tồn tại — dù ở bài nào. Bỏ tick vẫn LUÔN gắn thêm bài mới cho từ đã có, chỉ giữ nguyên metadata cũ.
    </label>
    <div id="vocab-import-result" style="font-size:.8rem;color:var(--muted);"></div>
  </div>
  <div class="panel">
    <div class="panel-title">🈶 Nghĩa Hán Việt (mỗi từ có sẵn 1 âm Hán Việt)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      AI tự sinh âm/nghĩa Hán Việt cho từng từ (vd 学习 → "Học tập"), hiện kèm Pinyin/nghĩa ở mọi nơi trong app (có nút Ẩn/Hiện Hán Việt riêng trên thanh menu).
    </div>
    <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);margin-bottom:12px;" id="gen-hanviet-btn" onclick="triggerHanVietGeneration()">🚀 Chạy sinh nghĩa Hán Việt ngay</button>
    <div id="gen-hanviet-result" style="font-size:.8rem;color:var(--muted);margin-bottom:10px;"></div>
    <div id="hanviet-progress-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">📖 Ví dụ theo từng từ (mỗi từ có ít nhất 1 ví dụ)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      Khác với câu luyện dịch ở trên (theo cả bài), đây là kho ví dụ minh hoạ hiện trong Trắc nghiệm — mỗi từ có ít nhất 1 câu ví dụ riêng (AI tự kiểm tra câu có đúng chứa từ đó không trước khi lưu). Có thể mất nhiều ngày để phủ hết toàn bộ từ vựng.
    </div>
    <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);margin-bottom:12px;" id="gen-word-ex-btn" onclick="triggerWordExampleGeneration()">🚀 Chạy sinh ví dụ theo từ ngay</button>
    <div id="gen-word-ex-result" style="font-size:.8rem;color:var(--muted);margin-bottom:10px;"></div>
    <div id="word-ex-progress-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">📄 Quản lý câu ví dụ bằng file</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      File Excel (.xlsx) hoặc CSV, dòng đầu là tiêu đề. <b>Mỗi từ 1 dòng, tối đa 3 cặp câu ví dụ</b>: cột <b>hz</b> (chữ Hán của từ) rồi từng cặp <b>zh1, py1, vi1</b> · <b>zh2, py2, vi2</b> · <b>zh3, py3, vi3</b> (zh = câu tiếng Trung — phải chứa từ đó; py = pinyin cả câu, hiện ở màn đáp án; vi = nghĩa tiếng Việt). Cặp 2, 3 để trống nếu không cần; py có thể để trống. Vẫn nhận file kiểu cũ (mỗi dòng 1 câu: hz, zh, py, vi). Nếu câu đã có mà chưa có pinyin thì nhập lại file sẽ bổ sung pinyin.
      Từ phải đã có trong kho từ vựng; câu đã tồn tại sẽ được bỏ qua. Bấm "Tải file mẫu" để lấy mẫu 3 cặp.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <input type="file" id="wex-file-input" accept=".xlsx,.xls,.csv" style="font-size:.8rem;max-width:100%;">
      <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="uploadExampleFile()">📤 Nhập ví dụ từ file</button>
      <button class="btn btn-sm" style="background:var(--l8c);color:var(--l8a);" onclick="downloadExampleTemplate()">⬇️ Tải file mẫu</button>
      <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="previewDeleteExamplesByFile()">🗑️ Xoá theo file (xem trước)</button>
    </div>
    <div id="wex-file-result" style="font-size:.8rem;color:var(--ink-2);margin-bottom:12px;overflow-wrap:anywhere;"></div>
    ${sentwPanelHtml()}
    <div style="font-weight:800;font-size:.85rem;margin:8px 0 6px;">Xoá theo bài</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
      <input id="wex-lesson" type="number" min="1" max="9999" placeholder="Bài số" style="width:110px;padding:8px 10px;border-radius:10px;border:1px solid var(--border-strong);background:var(--card);color:var(--ink);">
      <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="previewDeleteExamplesByLesson()">🗑️ Xoá ví dụ của bài (xem trước)</button>
    </div>
    <div id="wex-lesson-result" style="font-size:.8rem;color:var(--ink-2);margin-bottom:12px;overflow-wrap:anywhere;"></div>
    <div style="font-weight:800;font-size:.85rem;margin:8px 0 6px;">Xem &amp; xoá từng câu</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <input id="wex-search-hz" placeholder="Chữ Hán của từ (để trống = 100 câu mới nhất)" style="flex:1;min-width:180px;padding:8px 10px;border-radius:10px;border:1px solid var(--border-strong);background:var(--card);color:var(--ink);" onkeydown="if(event.key==='Enter')searchWordExamples()">
      <button class="btn btn-sm" onclick="searchWordExamples()">🔍 Tìm</button>
    </div>
    <div id="wex-list"></div>
  </div>
  <div class="panel">
    <div class="panel-title">🧩 Chiết tự bộ thủ (phân tích từng chữ Hán)</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">
      AI phân tích từng chữ Hán thành các thành phần cấu tạo (bộ thủ), giúp ghi nhớ mặt chữ dễ hơn — hiện trong Flashcard và Trắc nghiệm (chế độ 漢→Việt).
    </div>
    <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);margin-bottom:12px;" id="gen-hanzi-btn" onclick="triggerHanziPartsGeneration()">🚀 Chạy sinh chiết tự ngay</button>
    <div id="gen-hanzi-result" style="font-size:.8rem;color:var(--muted);margin-bottom:10px;"></div>
    <div id="hanzi-progress-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">📋 Danh sách bài đã có (sửa/xoá từng từ, hoặc xoá cả bài)</div>
    <div id="vocab-list-area" style="color:var(--muted);padding:14px 0;text-align:center;">Đang tải...</div>
  </div>
  <div class="panel">
    <div class="panel-title">🧹 Dọn bản ghi ôn tập mồ côi</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;line-height:1.5;">
      Thẻ FSRS và lịch sử ôn của những từ ĐÃ BỊ XOÁ khỏi hệ thống (chữ Hán đó không còn ở bất kỳ bài nào). Chúng vẫn được đếm vào "thẻ cần ôn" nhưng không bao giờ hiện ra để học. Việc này ảnh hưởng dữ liệu của MỌI người học, không hoàn tác được — nên có 3 bước: xem trước → tải bản sao lưu → xoá.
    </div>
    <button class="btn btn-sm" onclick="orphanPreview()">🔍 1. Kiểm tra (chỉ đọc)</button>
    <div id="orphan-result" style="font-size:.85rem;margin-top:10px;"></div>
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:8px;">📊 Số "thẻ cần ôn" của tài khoản bạn gồm những gì? (chỉ đọc)</div>
      <button class="btn btn-sm" onclick="dueBreakdown()">Phân loại thẻ đến hạn</button>
      <div id="due-breakdown-result" style="font-size:.85rem;margin-top:10px;"></div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-title">🗑️ Xoá toàn bộ dữ liệu</div>
    <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="clearAllVocab()">🗑️ Xoá toàn bộ từ đã thêm (Excel + thủ công)</button>
    <div style="font-size:.72rem;color:var(--muted);margin-top:6px;">Chỉ xoá các từ được thêm qua Excel/thủ công — không đụng tới bộ từ vựng gốc có sẵn của app (781 từ Quyển 1, 2).</div>
    <div id="vocab-clear-result" style="font-size:.8rem;color:var(--muted);margin-top:8px;"></div>
  </div>`;
}
function bindVocabAdmin() {
  if (!isAdminRole()) return;
  loadBookDefsAdminList();
  loadVocabAdminList();
  loadHanVietProgress();
  loadWordExampleProgress(); searchWordExamples();
  loadHanziPartsProgress();
}

// ════════════════════════════════════════════════════
// QUẢN LÝ GIÁO TRÌNH / QUYỂN (V102 — tự khai báo trên web, không cần sửa code)
// ════════════════════════════════════════════════════
let bookDefsAdminCache = []; // danh sách Quyển tự khai báo hiện tại (id đã +3000) — tra cứu khi Sửa/Xoá, khỏi phải nhúng chuỗi vào onclick
const BOOK_DEF_GROUPS = ['📗 Giáo trình cơ bản', '🧩 Từ vựng mở rộng', '🎯 Luyện thi HSK', '🆕 Giáo trình tự thêm'];
function bookDefGroupOptions(selected) {
  // Luôn hiện đúng giá trị đang chọn dù nó không khớp 4 gợi ý mặc định (vd admin từng gõ 1 nhóm khác).
  const opts = BOOK_DEF_GROUPS.includes(selected) ? BOOK_DEF_GROUPS : [selected, ...BOOK_DEF_GROUPS];
  return opts.map(g => `<option value="${escapeAttr(g)}"${g === selected ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('');
}

async function loadBookDefsAdminList() {
  const area = document.getElementById('bookdef-list-area');
  if (!area) return;
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được danh sách.'; return; }
    bookDefsAdminCache = data.books;
    if (data.books.length === 0) {
      area.innerHTML = `<div style="color:var(--muted);text-align:center;padding:10px 0;font-size:.82rem;">Chưa có Quyển nào tự khai báo.</div>`;
      return;
    }
    area.innerHTML = data.books.map(b => renderBookDefRow(b)).join('');
  } catch (e) {
    area.textContent = 'Không kết nối được máy chủ: ' + e.message;
  }
}

function renderBookDefRow(b) {
  return `<div style="border-bottom:1px solid var(--border);">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 2px;flex-wrap:wrap;">
      <div style="flex:1;min-width:160px;">
        <div style="font-weight:700;">${escapeHtml(b.name)} <span style="color:var(--muted);font-weight:600;font-size:.8rem;">(Bài ${b.from}-${b.to})</span></div>
        <div style="font-size:.72rem;color:var(--muted);">${escapeHtml(b.group)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" id="bookdef-edit-btn-${b.id}" onclick="toggleBookDefEdit(${b.id})">✏️ Sửa</button>
        <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="deleteBookDefAdmin(${b.id})">🗑️ Xoá</button>
      </div>
    </div>
    <div id="bookdef-edit-${b.id}" style="display:none;padding:4px 0 10px;"></div>
  </div>`;
}

function toggleBookDefEdit(id) {
  const box = document.getElementById(`bookdef-edit-${id}`);
  const btn = document.getElementById(`bookdef-edit-btn-${id}`);
  if (!box) return;
  const isOpen = box.style.display !== 'none';
  if (isOpen) { box.style.display = 'none'; btn.textContent = '✏️ Sửa'; return; }
  const b = bookDefsAdminCache.find(x => x.id === id);
  if (!b) return;
  box.style.display = 'block';
  btn.textContent = '✖️ Đóng';
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <input type="text" id="bookdef-edit-name-${id}" value="${escapeAttr(b.name)}" placeholder="Tên hiển thị" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;grid-column:1 / -1;">
      <select id="bookdef-edit-group-${id}" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;grid-column:1 / -1;">${bookDefGroupOptions(b.group)}</select>
      <input type="number" id="bookdef-edit-from-${id}" min="1" value="${b.from}" placeholder="Từ bài số" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
      <input type="number" id="bookdef-edit-to-${id}" min="1" value="${b.to}" placeholder="Đến bài số" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
    </div>
    <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="saveBookDefEdit(${id})">💾 Lưu</button>
    <div id="bookdef-edit-result-${id}" style="font-size:.8rem;color:var(--muted);margin-top:6px;"></div>`;
}

async function addBookDef() {
  const resultEl = document.getElementById('bookdef-result');
  const name = document.getElementById('bookdef-name').value.trim();
  const group = document.getElementById('bookdef-group').value;
  const from = document.getElementById('bookdef-from').value;
  const to = document.getElementById('bookdef-to').value;
  resultEl.style.color = 'var(--muted)';
  resultEl.textContent = 'Đang lưu...';
  try {
    const res = await fetch('/api/admin/books/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name, group, from, to }),
    });
    const data = await res.json();
    if (!data.ok) { resultEl.style.color = '#c0392b'; resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    resultEl.style.color = 'var(--l11a)';
    resultEl.textContent = `✅ Đã thêm "${data.book.name}". Tải lại trang để thấy ở màn chọn bài.`;
    document.getElementById('bookdef-name').value = '';
    document.getElementById('bookdef-from').value = '';
    document.getElementById('bookdef-to').value = '';
    loadBookDefsAdminList();
  } catch (e) {
    resultEl.style.color = '#c0392b';
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}

async function saveBookDefEdit(id) {
  const resultEl = document.getElementById(`bookdef-edit-result-${id}`);
  const name = document.getElementById(`bookdef-edit-name-${id}`).value.trim();
  const group = document.getElementById(`bookdef-edit-group-${id}`).value;
  const from = document.getElementById(`bookdef-edit-from-${id}`).value;
  const to = document.getElementById(`bookdef-edit-to-${id}`).value;
  resultEl.style.color = 'var(--muted)';
  resultEl.textContent = 'Đang lưu...';
  try {
    const res = await fetch('/api/admin/books/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id, name, group, from, to }),
    });
    const data = await res.json();
    if (!data.ok) { resultEl.style.color = '#c0392b'; resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    alert(`Đã lưu "${data.book.name}". Tải lại trang để cập nhật màn chọn bài.`);
    loadBookDefsAdminList();
  } catch (e) {
    resultEl.style.color = '#c0392b';
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}

async function deleteBookDefAdmin(id) {
  const b = bookDefsAdminCache.find(x => x.id === id);
  const label = b ? `"${b.name}" (Bài ${b.from}-${b.to})` : 'Quyển này';
  if (!confirm(`Xoá khai báo ${label}? Từ vựng của các bài này KHÔNG bị xoá — chỉ mất nhãn hiển thị (các bài đó sẽ rơi vào mục "Từ vựng mới tự nhận diện" ở màn chọn bài). Không thể hoàn tác.`)) return;
  try {
    const res = await fetch('/api/admin/books/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error || 'Có lỗi xảy ra'); return; }
    loadBookDefsAdminList();
  } catch (e) {
    alert('Không kết nối được máy chủ: ' + e.message);
  }
}
async function loadHanVietProgress() {
  const area = document.getElementById('hanviet-progress-area');
  if (!area) return;
  try {
    const res = await fetch('/api/admin/hanviet/progress', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được dữ liệu.'; return; }
    const pct = data.total ? Math.round(data.done / data.total * 100) : 0;
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:.85rem;font-weight:700;margin-bottom:6px;">
        <span>${data.done} / ${data.total} từ đã có nghĩa Hán Việt</span>
        <span style="color:var(--active-dark)">${pct}%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--active);"></div></div>
      ${(data.invalidCount || data.missingCount) ? `<div style="font-size:.8rem;margin-top:8px;color:var(--muted)">${data.missingCount ? `Chưa có: <b>${data.missingCount}</b> chữ (${escapeHtml((data.missing || []).join(' '))}${data.missingCount > (data.missing || []).length ? ' …' : ''}). ` : ''}${data.invalidCount ? `Có dòng nhưng không dùng được: <b>${data.invalidCount}</b> chữ (${escapeHtml((data.invalid || []).join(' '))}${data.invalidCount > (data.invalid || []).length ? ' …' : ''}). ` : ''}Bấm "Chạy sinh chiết tự ngay" để sinh/sinh lại.</div>` : ''}`;
  } catch (e) {
    area.textContent = 'Không kết nối được máy chủ: ' + e.message;
  }
}
async function triggerHanVietGeneration() {
  const btn = document.getElementById('gen-hanviet-btn');
  const resultEl = document.getElementById('gen-hanviet-result');
  btn.disabled = true;
  btn.textContent = '⏳ Đang chạy... (có thể mất tới 50 giây, đừng rời trang)';
  resultEl.textContent = '';
  try {
    const res = await fetch('/api/admin/generate-hanviet', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { resultEl.innerHTML = `❌ ${data.error || 'Có lỗi xảy ra'}`; }
    else {
      resultEl.innerHTML = `✅ Đã xử lý ${data.batches} lô, thêm ${data.done} từ${data.errors ? `, lỗi: ${data.errors}` : ''}. Còn ${data.totalPending - data.done} từ đang chờ xử lý.` + renderErrorSamples(data.errorSamples);
      loadHanVietProgress();
      refreshVocabHanviet(); // nạp lại nghĩa Hán Việt vào WORDS đã tải để dùng ngay không cần tải lại trang
    }
  } catch (e) {
    resultEl.innerHTML = `❌ Không kết nối được máy chủ: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Chạy sinh nghĩa Hán Việt ngay';
  }
}
// ── V156: quản lý câu ví dụ bằng file ──
function wexEsc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function downloadExampleTemplate() {
  // V170: mẫu DẠNG RỘNG — 1 dòng / 1 từ, tối đa 3 cặp (zh1/py1/vi1 … zh3/py3/vi3)
  const ws = XLSX.utils.json_to_sheet(EXF.TEMPLATE_ROWS);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ví dụ');
  XLSX.writeFile(wb, 'mau-cau-vi-du.xlsx');
}
// Đọc file .xlsx/.csv → { rows:[{hz,zh,vi,py}], src } (V170: mỗi dòng có thể chứa tới 3 cặp zh/py/vi — xem js/example-file.js).
// Tiêu đề không phân biệt hoa/thường/dấu; vẫn nhận file dạng cũ (1 câu / dòng).
async function readExampleFile() {
  const input = document.getElementById('wex-file-input');
  const file = input && input.files && input.files[0];
  if (!file) throw new Error('Chưa chọn file.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!raw.length) throw new Error('File không có dữ liệu.');
  const out = EXF.expandRows(raw);
  if (!out.rows.length) throw new Error('Không đọc được dòng nào — kiểm tra dòng tiêu đề (hz, zh1, py1, vi1, zh2, …).');
  return out;
}
function wexLines(list, key) {
  if (!list || !list.length) return '';
  return `<ul style="margin:6px 0 0;padding-left:18px;font-size:.76rem;color:var(--muted);">${list.map(x => `<li>Dòng ${x.line}: ${wexEsc(x.reason)}</li>`).join('')}</ul>`;
}
const WEX_CHUNK = 4000; // server nhận tối đa 5000 dòng / lần; mỗi từ có thể ra 3 dòng → gửi theo lô
async function uploadExampleFile() {
  const el = document.getElementById('wex-file-result');
  try {
    const { rows, src, ignoredColumns } = await readExampleFile();
    const tot = { added: 0, updatedPinyin: 0, duplicate: 0, skippedTotal: 0, withoutPinyin: 0 }; const skipped = [];
    for (let off = 0; off < rows.length; off += WEX_CHUNK) {
      el.textContent = `Đang nhập ${Math.min(off + WEX_CHUNK, rows.length)}/${rows.length} câu...`;
      const res = await fetch('/api/admin/word-examples/import', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ rows: rows.slice(off, off + WEX_CHUNK) }) });
      const d = await res.json();
      if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra') + (off ? ` (đã nhập xong ${off} câu đầu)` : ''); return; }
      for (const k of Object.keys(tot)) tot[k] += d[k] || 0;
      for (const x of d.skipped || []) skipped.push({ line: EXF.labelFor(src, x.line, off), reason: x.reason });
    }
    el.innerHTML = `✅ Đã thêm <b>${tot.added}</b> câu${tot.updatedPinyin ? `, bổ sung pinyin cho <b>${tot.updatedPinyin}</b> câu đã có` : ''}, bỏ qua <b>${tot.duplicate}</b> câu đã có, <b>${tot.skippedTotal}</b> câu không hợp lệ.${tot.withoutPinyin ? ` ⚠️ ${tot.withoutPinyin} câu mới thêm chưa có pinyin.` : ''}${ignoredColumns.length ? ` ⚠️ Bỏ qua cột ${ignoredColumns.map(wexEsc).join(', ')} (chỉ nhận tối đa ${EXF.MAX_PAIRS} cặp).` : ''}${wexLines(skipped.slice(0, 50))}`;
    document.getElementById('wex-file-input').value = '';
    loadWordExampleProgress();
    searchWordExamples();
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
let wexPendingDelete = null;
async function previewDeleteExamplesByFile() {
  const el = document.getElementById('wex-file-result');
  try {
    const { rows, src } = await readExampleFile();
    if (rows.length > 5000) throw new Error('File quá lớn: tối đa 5000 câu mỗi lần xoá.');
    const res = await fetch('/api/admin/word-examples/delete-by-file', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ rows, dryRun: true }) });
    const d = await res.json();
    if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    wexPendingDelete = rows;
    el.innerHTML = `Xem trước: sẽ xoá <b>${d.matched}</b> câu; <b>${d.notFoundTotal}</b> câu không khớp.${wexLines((d.notFound || []).map(x => ({ line: EXF.labelFor(src, x.line, 0), reason: x.reason })))}
      ${d.matched ? `<div style="margin-top:8px;"><button class="btn btn-sm" style="background:#c0392b;color:#fff;" onclick="confirmDeleteExamplesByFile()">Xác nhận xoá ${d.matched} câu (không hoàn tác)</button></div>` : ''}`;
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
async function confirmDeleteExamplesByFile() {
  const el = document.getElementById('wex-file-result');
  if (!wexPendingDelete) return;
  try {
    const res = await fetch('/api/admin/word-examples/delete-by-file', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ rows: wexPendingDelete }) });
    const d = await res.json();
    wexPendingDelete = null;
    if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    el.innerHTML = `✅ Đã xoá <b>${d.deleted}</b> câu ví dụ.`;
    document.getElementById('wex-file-input').value = '';
    loadWordExampleProgress();
    searchWordExamples();
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
async function wexLessonCall(dryRun) {
  const lesson = parseInt((document.getElementById('wex-lesson') || {}).value, 10);
  if (!Number.isFinite(lesson) || lesson < 1) throw new Error('Nhập số bài hợp lệ.');
  const res = await fetch('/api/admin/word-examples/delete-by-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ lesson, dryRun }) });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || 'Có lỗi xảy ra');
  return { d, lesson };
}
async function previewDeleteExamplesByLesson() {
  const el = document.getElementById('wex-lesson-result');
  try {
    const { d, lesson } = await wexLessonCall(true);
    el.innerHTML = d.matched
      ? `Bài ${lesson}: sẽ xoá <b>${d.matched}</b> câu ví dụ của <b>${d.words}</b> từ. (Từ thuộc nhiều bài sẽ mất ví dụ ở cả các bài khác.)
         <div style="margin-top:8px;"><button class="btn btn-sm" style="background:#c0392b;color:#fff;" onclick="confirmDeleteExamplesByLesson()">Xác nhận xoá ${d.matched} câu (không hoàn tác)</button></div>`
      : `Bài ${lesson} không có câu ví dụ nào để xoá.`;
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
async function confirmDeleteExamplesByLesson() {
  const el = document.getElementById('wex-lesson-result');
  try {
    const { d, lesson } = await wexLessonCall(false);
    el.innerHTML = `✅ Đã xoá <b>${d.deleted}</b> câu ví dụ của Bài ${lesson}.`;
    loadWordExampleProgress(); searchWordExamples();
  } catch (e) { el.textContent = '❌ ' + e.message; }
}
async function searchWordExamples() {
  const box = document.getElementById('wex-list');
  if (!box) return;
  const hz = (document.getElementById('wex-search-hz') || {}).value || '';
  try {
    const res = await fetch('/api/admin/word-examples/list?hz=' + encodeURIComponent(hz.trim()), { headers: authHeaders() });
    const d = await res.json();
    if (!d.ok) { box.textContent = d.error || 'Không tải được.'; return; }
    if (!d.items.length) { box.innerHTML = '<div style="color:var(--muted);padding:8px 0;">Không có câu ví dụ nào.</div>'; return; }
    const head = hz.trim() ? `<div style="margin-bottom:6px;"><button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="deleteExamplesOfWord(${JSON.stringify(hz.trim()).replace(/"/g, '&quot;')})">🗑️ Xoá tất cả ${d.items.length} câu của từ này</button></div>` : '';
    box.innerHTML = head + d.items.map(x => `<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);">
      <div style="min-width:0;overflow-wrap:anywhere;"><b>${wexEsc(x.hz)}</b> · ${wexEsc(x.zh)}${x.py ? `<div style="color:var(--active);font-size:.8rem;">${wexEsc(x.py)}</div>` : ''}<div style="color:var(--muted);font-size:.8rem;">${wexEsc(x.vi)}</div></div>
      <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;flex:none;" onclick="deleteExampleRow(${Number(x.id)})" aria-label="Xoá câu này">🗑️</button></div>`).join('');
  } catch (e) { box.textContent = 'Không kết nối được máy chủ: ' + e.message; }
}
async function deleteExampleRow(id) {
  if (!confirm('Xoá câu ví dụ này? Không thể hoàn tác.')) return;
  await fetch('/api/admin/word-examples/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id }) });
  loadWordExampleProgress(); searchWordExamples();
}
async function deleteExamplesOfWord(hz) {
  if (!confirm(`Xoá TẤT CẢ câu ví dụ của từ "${hz}"? Không thể hoàn tác.`)) return;
  await fetch('/api/admin/word-examples/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ hz }) });
  loadWordExampleProgress(); searchWordExamples();
}
async function loadWordExampleProgress() {
  const area = document.getElementById('word-ex-progress-area');
  if (!area) return;
  try {
    const res = await fetch('/api/admin/word-examples/progress', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được dữ liệu.'; return; }
    const pct = data.total ? Math.round(data.done / data.total * 100) : 0;
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:.85rem;font-weight:700;margin-bottom:6px;">
        <span>${data.done} / ${data.total} từ đã có ví dụ</span>
        <span style="color:var(--active-dark)">${pct}%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--active);"></div></div>`;
  } catch (e) {
    area.textContent = 'Không kết nối được máy chủ: ' + e.message;
  }
}
// Hiện chi tiết vài lỗi mẫu (không lặp lại) gặp phải khi chạy sinh dữ liệu bằng AI — giúp admin biết
// chính xác vì sao có lỗi (vd thiếu GEMINI_API_KEY, Gemini quá tải, JSON trả về sai định dạng...).
function renderErrorSamples(errorSamples) {
  if (!Array.isArray(errorSamples) || errorSamples.length === 0) return '';
  const items = errorSamples.map(msg => `<li style="margin-bottom:3px;">${msg}</li>`).join('');
  return `<div style="margin-top:8px;padding:10px 12px;background:#fdecea;border-radius:10px;color:#c0392b;font-size:.78rem;">
    <b>Chi tiết lỗi:</b>
    <ul style="margin:6px 0 0;padding-left:18px;">${items}</ul>
  </div>`;
}
async function triggerWordExampleGeneration() {
  const btn = document.getElementById('gen-word-ex-btn');
  const resultEl = document.getElementById('gen-word-ex-result');
  btn.disabled = true;
  btn.textContent = '⏳ Đang chạy... (có thể mất tới 50 giây, đừng rời trang)';
  resultEl.textContent = '';
  try {
    const res = await fetch('/api/admin/generate-word-examples', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { resultEl.innerHTML = `❌ ${data.error || 'Có lỗi xảy ra'}`; }
    else {
      resultEl.innerHTML = `✅ Đã xử lý ${data.batches} lô. Từ xong hoàn toàn: ${data.wordsDone}, cần thử lại: ${data.wordsRetried}${data.errors ? `, lỗi: ${data.errors}` : ''}. Còn ${data.totalPending - data.wordsDone} từ đang chờ xử lý.` + renderErrorSamples(data.errorSamples);
      loadWordExampleProgress();
    }
  } catch (e) {
    resultEl.innerHTML = `❌ Không kết nối được máy chủ: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Chạy sinh ví dụ theo từ ngay';
  }
}
async function loadHanziPartsProgress() {
  const area = document.getElementById('hanzi-progress-area');
  if (!area) return;
  try {
    const res = await fetch('/api/admin/hanzi-parts/progress', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được dữ liệu.'; return; }
    const pct = data.total ? Math.round(data.done / data.total * 100) : 0;
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:.85rem;font-weight:700;margin-bottom:6px;">
        <span>${data.done} / ${data.total} chữ đã có chiết tự</span>
        <span style="color:var(--active-dark)">${pct}%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--active);"></div></div>`;
  } catch (e) {
    area.textContent = 'Không kết nối được máy chủ: ' + e.message;
  }
}
async function triggerHanziPartsGeneration() {
  const btn = document.getElementById('gen-hanzi-btn');
  const resultEl = document.getElementById('gen-hanzi-result');
  btn.disabled = true;
  btn.textContent = '⏳ Đang chạy... (có thể mất tới 50 giây, đừng rời trang)';
  resultEl.textContent = '';
  try {
    const res = await fetch('/api/admin/generate-hanzi-parts', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { resultEl.innerHTML = `❌ ${data.error || 'Có lỗi xảy ra'}`; }
    else {
      resultEl.innerHTML = `✅ Đã xử lý ${data.batches} lô, thêm ${data.done} chữ${data.errors ? `, lỗi: ${data.errors}` : ''}. Còn ${data.totalPending - data.done} chữ đang chờ xử lý.` + renderErrorSamples(data.errorSamples);
      loadHanziPartsProgress();
      loadHanziParts(); // nạp lại dữ liệu mới để dùng ngay không cần tải lại trang
    }
  } catch (e) {
    resultEl.innerHTML = `❌ Không kết nối được máy chủ: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Chạy sinh chiết tự ngay';
  }
}
// Sau khi admin chạy sinh Hán Việt xong, các bài đã tải về máy (WORDS) vẫn đang giữ dữ liệu CŨ
// (chưa có hanviet) vì ensureVocabLoaded() bỏ qua từ đã có trong WORDS theo key hz+l. Hàm này tải
// lại đúng các bài đã tải và GHI ĐÈ trường hanviet vào những mục đã có sẵn trong WORDS, để admin
// thấy kết quả ngay mà không cần tải lại trang.
async function refreshVocabHanviet() {
  if (!loadedLessonNumbers.size) return;
  if (!authToken) return;
  const url = '/api/vocab?lessons=' + [...loadedLessonNumbers].join(',');
  try {
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (data.ok && Array.isArray(data.vocab)) {
      const byKey = new Map(data.vocab.map(w => [w.hz + '-' + w.l, w]));
      WORDS.forEach(w => {
        const fresh = byKey.get(w.hz + '-' + w.l);
        if (fresh && fresh.hanviet) w.hanviet = fresh.hanviet;
      });
    }
  } catch {
    // Không tải lại được thì thôi, dữ liệu vẫn đã lưu đúng trong DB, chỉ là chưa hiện ngay trên máy này
  }
}
async function loadVocabAdminList() {
  const area = document.getElementById('vocab-list-area');
  if (!area) return;
  try {
    const res = await fetch('/api/vocab/counts', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được danh sách.'; return; }
    const entries = Object.entries(data.counts)
      .map(([l, c]) => [parseInt(l, 10), c])
      .filter(([l, c]) => c > 0)
      .sort((a, b) => a[0] - b[0]);
    if (entries.length === 0) {
      area.innerHTML = `<div style="color:var(--muted);text-align:center;padding:14px 0;">Chưa có bài nào được thêm qua Excel/thủ công.</div>`;
      return;
    }
    area.innerHTML = entries.map(([l, c]) => `
      <div style="border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 2px;gap:8px;">
          <span style="font-weight:700;">Bài ${l} <span style="color:var(--muted);font-weight:600;font-size:.82rem;">(${c} từ)</span></span>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="toggleLessonWords(${l})" id="toggle-words-btn-${l}">📝 Xem/Sửa từ</button>
            <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="deleteLessonVocab(${l})">🗑️ Xoá bài</button>
          </div>
        </div>
        <div id="lesson-words-${l}" style="display:none;padding:4px 0 10px;"></div>
      </div>`).join('');
    // Bài nào đang mở dở (VD vừa sửa/xoá 1 từ xong) thì tự mở lại đúng bài đó, khỏi phải bấm lại
    for (const l of openLessonWords) {
      const box = document.getElementById(`lesson-words-${l}`);
      const btn = document.getElementById(`toggle-words-btn-${l}`);
      if (box) { box.style.display = 'block'; loadLessonWords(l); }
      if (btn) btn.textContent = '📝 Ẩn danh sách từ';
    }
  } catch (e) {
    area.textContent = 'Không kết nối được máy chủ: ' + e.message;
  }
}

// ── Mở/đóng danh sách từng từ của 1 bài, để sửa/xoá riêng từng từ ──
const openLessonWords = new Set();
async function toggleLessonWords(l) {
  const box = document.getElementById(`lesson-words-${l}`);
  const btn = document.getElementById(`toggle-words-btn-${l}`);
  if (!box) return;
  const isOpen = box.style.display !== 'none';
  if (isOpen) { box.style.display = 'none'; btn.textContent = '📝 Xem/Sửa từ'; openLessonWords.delete(l); return; }
  btn.textContent = '📝 Đang tải...';
  box.style.display = 'block';
  openLessonWords.add(l);
  await loadLessonWords(l);
  btn.textContent = '📝 Ẩn danh sách từ';
}

const lessonWordsListCache = {}; // { [lessonNumber]: [{id,hz,py,vi,l,tag,hanviet}, ...] } — để "Sửa" khỏi phải gọi lại API
async function loadLessonWords(l) {
  const box = document.getElementById(`lesson-words-${l}`);
  if (!box) return;
  box.innerHTML = `<div style="color:var(--muted);padding:10px 0;text-align:center;font-size:.85rem;">Đang tải...</div>`;
  try {
    const res = await fetch('/api/admin/vocab/lesson-words?l=' + l, { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { box.innerHTML = `<div style="color:#c0392b;font-size:.82rem;">${data.error || 'Không tải được'}</div>`; return; }
    lessonWordsListCache[l] = data.words;
    renderLessonWordsList(l, data.words);
  } catch (e) {
    box.innerHTML = `<div style="color:#c0392b;font-size:.82rem;">Không kết nối được máy chủ: ${e.message}</div>`;
  }
}

function renderLessonWordsList(l, words) {
  const box = document.getElementById(`lesson-words-${l}`);
  if (!box) return;
  if (!words.length) {
    box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:8px 0;font-size:.82rem;">Bài này không còn từ nào.</div>`;
    return;
  }
  box.innerHTML = words.map(w => renderWordRow(l, w)).join('');
}

function renderWordRow(l, w) {
  const tagBadge = w.tag === 'ly_hop' ? ' <span style="font-size:.68rem;background:var(--l15c);color:var(--l15a);padding:1px 6px;border-radius:6px;">离合</span>' : '';
  // V93 (Phần 15 audit): nếu từ này thuộc NHIỀU bài, hiện đủ danh sách (vd "Bài: 1, 5, 8") thay vì
  // chỉ số bài đang xem — để admin biết sửa/xoá ở đây sẽ ảnh hưởng tới 1 từ DÙNG CHUNG nhiều bài.
  const lessons = Array.isArray(w.lessons) && w.lessons.length ? w.lessons : [w.l];
  const lessonsBadge = lessons.length > 1
    ? ` <span style="font-size:.7rem;color:var(--l9a);background:var(--l9c);padding:1px 6px;border-radius:6px;" title="Từ này dùng chung cho nhiều bài">Bài: ${lessons.join(', ')}</span>`
    : '';
  return `
    <div class="word-row" id="word-row-${w.id}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;background:var(--panel-2, rgba(0,0,0,.02));border-radius:8px;margin-bottom:6px;">
      <div style="min-width:0;">
        <div style="font-weight:700;">${escapeHtml(w.hz)}${tagBadge}${lessonsBadge} <span style="color:var(--muted);font-weight:500;font-size:.82rem;">${escapeHtml(w.py || '')}</span></div>
        <div style="font-size:.82rem;color:var(--muted);">${escapeHtml(w.vi)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="startEditWord(${l}, ${w.id})">✏️ Sửa</button>
        <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="deleteWord(${l}, ${w.id}, '${escapeHtml(w.hz).replace(/'/g, "\\'")}')">🗑️</button>
      </div>
    </div>`;
}

// Lưu lại data gốc của các từ đang hiện, để "Sửa" có sẵn giá trị điền vào form + "Huỷ" khôi phục lại đúng dòng cũ
let lessonWordsCache = {}; // { [id]: word } — dòng gốc của từ đang sửa, dùng khi bấm "Huỷ" để khôi phục lại đúng dòng
function startEditWord(l, id) {
  const row = document.getElementById(`word-row-${id}`);
  if (!row) return;
  const renderForm = (w) => {
    lessonWordsCache[id] = w;
    const lessonsStr = (Array.isArray(w.lessons) && w.lessons.length ? w.lessons : [w.l]).join(', ');
    row.outerHTML = `
      <div class="word-row" id="word-row-${id}" style="padding:8px;background:var(--panel-2, rgba(0,0,0,.03));border-radius:8px;margin-bottom:6px;border:1.5px solid var(--l11c);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
          <input type="text" id="edit-hz-${id}" value="${escapeAttr(w.hz)}" placeholder="Chữ Hán" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.88rem;">
          <input type="text" id="edit-py-${id}" value="${escapeAttr(w.py || '')}" placeholder="Pinyin" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.88rem;">
          <input type="text" id="edit-vi-${id}" value="${escapeAttr(w.vi)}" placeholder="Nghĩa tiếng Việt" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.88rem;grid-column:1 / -1;">
          <input type="text" id="edit-l-${id}" value="${escapeAttr(lessonsStr)}" placeholder="Số bài, có thể nhiều (vd: 1, 5, 8)" style="padding:7px;border-radius:8px;border:1.5px solid #ddd;font-size:.88rem;">
          <label style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);">
            <input type="checkbox" id="edit-lyhop-${id}" ${w.tag === 'ly_hop' ? 'checked' : ''}> 🧩 Ly hợp từ
          </label>
        </div>
        <div style="font-size:.7rem;color:var(--muted);margin-bottom:6px;">ℹ️ Từ này 1 bản ghi duy nhất, dùng chung cho mọi bài liệt kê ở trên — sửa nghĩa/pinyin ở đây áp dụng cho TẤT CẢ các bài đó.</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="saveEditWord(${id})">💾 Lưu</button>
          <button class="btn btn-sm" style="background:var(--border);" onclick="cancelEditWord(${l}, ${id})">Huỷ</button>
          <span id="edit-word-result-${id}" style="font-size:.78rem;color:#c0392b;"></span>
        </div>
      </div>`;
  };
  // Ưu tiên dùng lại dữ liệu vừa tải khi mở danh sách (khỏi gọi lại API); chỉ fetch lại nếu vì lý do
  // gì đó cache không còn (VD người dùng bấm quá nhanh trước khi danh sách kịp tải xong).
  const cached = (lessonWordsListCache[l] || []).find(x => x.id === id);
  if (cached) { renderForm(cached); return; }
  fetch('/api/admin/vocab/lesson-words?l=' + l, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      const w = data.words.find(x => x.id === id);
      if (w) renderForm(w);
    })
    .catch(() => alert('Không tải được dữ liệu từ để sửa.'));
}

function cancelEditWord(l, id) {
  const w = lessonWordsCache[id];
  const row = document.getElementById(`word-row-${id}`);
  if (!row) return;
  if (w) row.outerHTML = renderWordRow(l, w);
  else loadLessonWords(l);
}

async function saveEditWord(id) {
  const resultEl = document.getElementById(`edit-word-result-${id}`);
  const hz = document.getElementById(`edit-hz-${id}`).value.trim();
  const py = document.getElementById(`edit-py-${id}`).value.trim();
  const vi = document.getElementById(`edit-vi-${id}`).value.trim();
  // V93: ô "Số bài" giờ nhận NHIỀU bài, cách nhau dấu phẩy (vd "1, 5, 8") — thay thế TOÀN BỘ tập
  // bài của từ này bằng đúng danh sách đã nhập (Phần 15 audit).
  const lessons = [...new Set(
    document.getElementById(`edit-l-${id}`).value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 1)
  )];
  const tag = document.getElementById(`edit-lyhop-${id}`).checked ? 'ly_hop' : null;
  const oldLessons = lessonWordsCache[id] ? (lessonWordsCache[id].lessons || [lessonWordsCache[id].l]) : lessons;
  if (!hz || !vi || lessons.length === 0) {
    resultEl.textContent = 'Vui lòng nhập đủ Chữ Hán, Nghĩa và ít nhất 1 Số bài hợp lệ.';
    return;
  }
  resultEl.style.color = 'var(--muted)';
  resultEl.textContent = 'Đang lưu...';
  try {
    const res = await fetch('/api/admin/vocab/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id, hz, py, vi, l: lessons[0], lessons, tag }),
    });
    const data = await res.json();
    if (!data.ok) { resultEl.style.color = '#c0392b'; resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    // Nếu tập bài đổi (thêm/bớt bài nào đó), mở sẵn các bài mới để thấy ngay kết quả
    lessons.forEach(x => { if (!oldLessons.includes(x)) openLessonWords.add(x); });
    loadVocabAdminList(); // nạp lại toàn bộ danh sách bài + tự mở lại các bài đang xem dở
    alert(`Đã lưu từ "${hz}". Tải lại trang để cập nhật dữ liệu học.`);
  } catch (e) {
    resultEl.style.color = '#c0392b';
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}

async function deleteWord(l, id, hz) {
  if (!confirm(`Xoá từ "${hz}" khỏi Bài ${l}?\n(Nếu từ này không còn thuộc bài nào khác, dữ liệu từ vựng sẽ được xoá hẳn. Không thể hoàn tác.)`)) return;
  try {
    const res = await fetch('/api/admin/vocab/delete-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id, lesson: l }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error || 'Có lỗi xảy ra'); return; }
    // V93: nếu từ vẫn còn thuộc bài khác (chưa xoá hẳn), báo cho admin biết để tránh hiểu nhầm là mất dữ liệu
    if (data.fullyDeleted === false && Array.isArray(data.remainingLessons) && data.remainingLessons.length) {
      alert(`Đã gỡ "${hz}" khỏi Bài ${l}. Từ này vẫn còn thuộc Bài ${data.remainingLessons.join(', ')} nên KHÔNG bị xoá hẳn.`);
    }
    loadVocabAdminList(); // nạp lại số đếm theo bài + tự mở lại đúng bài đang xem, cập nhật danh sách từ
  } catch (e) {
    alert('Không kết nối được máy chủ: ' + e.message);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
async function deleteLessonVocab(l) {
  if (!confirm(`Xoá toàn bộ từ vựng của Bài ${l}? Không thể hoàn tác.`)) return;
  try {
    const res = await fetch('/api/admin/vocab/delete-lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ l }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error || 'Có lỗi xảy ra'); return; }
    alert(`Đã xoá ${data.removed} từ của Bài ${l}. Tải lại trang để cập nhật màn hình chọn bài.`);
    openLessonWords.delete(l);
    loadVocabAdminList();
  } catch (e) {
    alert('Không kết nối được máy chủ: ' + e.message);
  }
}
// V93 (Phần 7 audit — "Manual Add Word phải detect duplicate TRƯỚC KHI INSERT"): lưu tạm dữ liệu
// đang chờ xác nhận (Giữ / Ghi đè) — dùng biến toàn cục thay vì nhúng JSON vào HTML onclick (an
// toàn hơn với ký tự đặc biệt trong nghĩa tiếng Việt/pinyin), theo đúng convention của file này
// (lessonWordsCache, openLessonWords cũng là biến toàn cục tương tự).
let pendingManualAddPayload = null;

async function addVocabManual() {
  const resultEl = document.getElementById('vocab-manual-result');
  const dialogEl = document.getElementById('vocab-manual-dialog');
  dialogEl.innerHTML = '';
  const hz = document.getElementById('vocab-manual-hz').value.trim();
  const py = document.getElementById('vocab-manual-py').value.trim();
  const vi = document.getElementById('vocab-manual-vi').value.trim();
  const l = parseInt(document.getElementById('vocab-manual-l').value, 10);
  const tag = document.getElementById('vocab-manual-lyhop').checked ? 'ly_hop' : null;
  if (!hz || !vi || !Number.isFinite(l) || l < 1) {
    resultEl.textContent = 'Vui lòng nhập đủ Chữ Hán, Nghĩa và Số bài (số nguyên ≥ 1).';
    return;
  }
  pendingManualAddPayload = { hz, py, vi, l, tag };
  resultEl.textContent = 'Đang kiểm tra trùng lặp...';
  try {
    const checkRes = await fetch('/api/admin/vocab/find-by-hz?hz=' + encodeURIComponent(hz), { headers: authHeaders() });
    const checkData = await checkRes.json();
    if (!checkData.ok) { resultEl.textContent = '❌ ' + (checkData.error || 'Không kiểm tra được dữ liệu trùng'); return; }
    if (!checkData.word) {
      // Chưa tồn tại — thêm mới luôn, không cần hỏi gì (Giữ/Ghi đè chỉ có ý nghĩa khi đã có bản ghi cũ)
      resultEl.textContent = 'Đang thêm...';
      await submitVocabManual(false);
      return;
    }
    resultEl.textContent = '';
    renderManualAddDuplicateDialog(checkData.word, pendingManualAddPayload);
  } catch (e) {
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}

// Hiện dialog so sánh dữ liệu cũ/mới + 2 lựa chọn, đúng theo mẫu ở Phần 7 audit.
function renderManualAddDuplicateDialog(existing, incoming) {
  const dialogEl = document.getElementById('vocab-manual-dialog');
  const existingLessons = (Array.isArray(existing.lessons) && existing.lessons.length ? existing.lessons : [existing.l]).join(', ');
  dialogEl.innerHTML = `
    <div style="margin-top:10px;padding:10px;border-radius:8px;border:1.5px solid var(--l15c);background:var(--panel-2, rgba(0,0,0,.03));">
      <div style="font-weight:700;margin-bottom:6px;">⚠️ Từ "${escapeHtml(existing.hz)}" đã tồn tại (đang ở Bài ${escapeHtml(existingLessons)})</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.82rem;margin-bottom:8px;">
        <div>
          <div style="color:var(--muted);margin-bottom:2px;">Dữ liệu hiện tại</div>
          <div>${escapeHtml(existing.py || '(chưa có pinyin)')}</div>
          <div>${escapeHtml(existing.vi)}</div>
        </div>
        <div>
          <div style="color:var(--muted);margin-bottom:2px;">Dữ liệu mới bạn vừa nhập</div>
          <div>${escapeHtml(incoming.py || '(chưa có pinyin)')}</div>
          <div>${escapeHtml(incoming.vi)}</div>
        </div>
      </div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:8px;">Dù chọn cách nào, từ này cũng sẽ được gắn thêm vào Bài ${incoming.l} nếu chưa có — không tạo bản ghi từ vựng trùng, không ảnh hưởng lịch ôn tập (FSRS) đã có.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-sm" style="background:var(--border);" onclick="submitVocabManual(false)">Giữ dữ liệu hiện tại</button>
        <button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="submitVocabManual(true)">Ghi đè bằng dữ liệu mới</button>
      </div>
    </div>`;
}

async function submitVocabManual(overwrite) {
  const payload = pendingManualAddPayload;
  if (!payload) return;
  const resultEl = document.getElementById('vocab-manual-result');
  const dialogEl = document.getElementById('vocab-manual-dialog');
  dialogEl.innerHTML = '';
  resultEl.style.color = 'var(--muted)';
  resultEl.textContent = 'Đang lưu...';
  try {
    const res = await fetch('/api/admin/vocab/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ words: [payload], overwrite }),
    });
    const data = await res.json();
    if (!data.ok) { resultEl.style.color = '#c0392b'; resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    resultEl.style.color = 'var(--muted)';
    if (data.added > 0) {
      resultEl.innerHTML = `✅ Đã thêm từ mới <b>${escapeHtml(payload.hz)}</b>. <span style="color:var(--l9a);">Tải lại trang để dùng ngay.</span>`;
    } else if (data.updated > 0) {
      resultEl.innerHTML = `✅ Đã ghi đè dữ liệu + gắn <b>${escapeHtml(payload.hz)}</b> vào Bài ${payload.l}. <span style="color:var(--l9a);">Tải lại trang để dùng ngay.</span>`;
    } else if (data.lessonLinked > 0) {
      resultEl.innerHTML = `✅ Đã giữ dữ liệu cũ, gắn thêm <b>${escapeHtml(payload.hz)}</b> vào Bài ${payload.l}. <span style="color:var(--l9a);">Tải lại trang để dùng ngay.</span>`;
    } else {
      resultEl.textContent = `ℹ️ "${payload.hz}" đã có sẵn ở đúng Bài ${payload.l} rồi, không có gì thay đổi.`;
    }
    document.getElementById('vocab-manual-hz').value = '';
    document.getElementById('vocab-manual-py').value = '';
    document.getElementById('vocab-manual-vi').value = '';
    document.getElementById('vocab-manual-l').value = '';
    document.getElementById('vocab-manual-lyhop').checked = false;
    pendingManualAddPayload = null;
    loadVocabAdminList();
  } catch (e) {
    resultEl.style.color = '#c0392b';
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}
// Chuẩn hoá cột "tag" khi đọc file Excel — chấp nhận nhiều cách viết khác nhau (tiếng Việt có dấu,
// không dấu, hoặc chữ Hán) đều quy về 1 giá trị chuẩn duy nhất 'ly_hop' để web hiểu và hiển thị đúng.
function normalizeVocabTag(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (['ly_hop', 'lyhop', 'ly hợp', 'ly hop', 'động từ ly hợp', 'dong tu ly hop', '离合词', '离合动词']
      .some(x => s === x || s.includes('ly hợp') || s.includes('ly hop') || s.includes('离合'))) {
    return 'ly_hop';
  }
  return s; // giữ nguyên các loại tag khác trong tương lai, không chỉ riêng ly hợp
}
function downloadVocabTemplate() {
  const ws = XLSX.utils.json_to_sheet([
    { hz: '你好', py: 'nǐ hǎo', vi: 'xin chào', l: 1, tag: '' },
    { hz: '谢谢', py: 'xièxie', vi: 'cảm ơn', l: 1, tag: '' },
    { hz: '睡觉', py: 'shuìjiào', vi: 'ngủ', l: 1, tag: 'ly_hop' },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Từ vựng');
  XLSX.writeFile(wb, 'mau-tu-vung.xlsx');
}
async function uploadVocabExcel() {
  const input = document.getElementById('vocab-file-input');
  const resultEl = document.getElementById('vocab-import-result');
  const file = input.files && input.files[0];
  if (!file) { resultEl.textContent = 'Chưa chọn file.'; return; }
  resultEl.textContent = 'Đang đọc file...';
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) { resultEl.textContent = 'File không có dữ liệu.'; return; }
    const words = rows.map(r => ({
      hz: String(r.hz ?? r['Chữ Hán'] ?? '').trim(),
      py: String(r.py ?? r['Pinyin'] ?? '').trim(),
      vi: String(r.vi ?? r['Nghĩa'] ?? '').trim(),
      l: parseInt(r.l ?? r['Bài'], 10),
      tag: normalizeVocabTag(r.tag ?? r['Loại từ'] ?? r['Nhãn'] ?? ''),
    }));
    resultEl.textContent = `Đang nhập ${words.length} dòng...`;
    const overwrite = document.getElementById('vocab-excel-overwrite').checked;
    const res = await fetch('/api/admin/vocab/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ words, overwrite }),
    });
    const data = await res.json();
    if (!data.ok) { resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    // V93: "skipped" giờ CHỈ nghĩa là từ đã có VÀ đã ở đúng bài đó rồi (thật sự không đổi gì) — từ
    // trùng nhưng THUỘC BÀI MỚI luôn được gắn thêm (tính vào lessonLinked) dù có tick ghi đè hay không.
    resultEl.innerHTML = `✅ Đã thêm <b>${data.added}</b> từ hoàn toàn mới, cập nhật dữ liệu <b>${data.updated}</b> từ trùng (đã tick ghi đè), gắn thêm bài cho <b>${data.lessonLinked || 0}</b> từ đã có. Bỏ qua ${data.skipped} dòng (đã có sẵn đúng bài này), ${data.invalid} dòng thiếu dữ liệu.<br>Tổng số từ vựng hiện có: <b>${data.total}</b>.<br><span style="color:var(--l9a);">Tải lại trang để dùng ngay các từ mới.</span>`;
    loadVocabAdminList();
    input.value = '';
  } catch (e) {
    resultEl.textContent = '❌ Không đọc được file: ' + e.message;
  }
}
async function clearAllVocab() {
  if (!confirm('Xoá toàn bộ từ vựng đã thêm qua Excel/thủ công? Không thể hoàn tác. Bộ từ vựng gốc có sẵn của app sẽ KHÔNG bị ảnh hưởng.')) return;
  const resultEl = document.getElementById('vocab-clear-result');
  resultEl.textContent = 'Đang xoá...';
  try {
    const res = await fetch('/api/admin/vocab/clear', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { resultEl.textContent = '❌ ' + (data.error || 'Có lỗi xảy ra'); return; }
    resultEl.innerHTML = `✅ Đã xoá ${data.removed} từ. <span style="color:var(--l9a);">Tải lại trang để cập nhật.</span>`;
    loadVocabAdminList();
  } catch (e) {
    resultEl.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}
async function bindAdmin() {
  if (!isAdminRole()) return;
  if (currentRole === 'superadmin') aicLoad(); // V171: màn Cấu hình AI
  if (currentRole === 'superadmin') adminLoadReg(); // V119.3: trạng thái trang đăng ký (không chặn danh sách tài khoản)
  await adminLoadVisits();
  await adminLoadUsers();
}
async function adminLoadVisits() {
  const area = document.getElementById('visits-area');
  if (!area) return;
  try {
    const res = await fetch('/api/admin/visits', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được thống kê.'; return; }
    const maxCount = Math.max(1, ...data.last14.map(d => d.count));
    const bars = data.last14.map(d => {
      const h = Math.round(d.count / maxCount * 60);
      const label = d.date.slice(5); // MM-DD
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;">
        <div style="font-size:.68rem;font-weight:800;color:var(--l9a);">${d.count}</div>
        <div style="width:100%;max-width:18px;height:${Math.max(h,2)}px;background:var(--l9a);border-radius:3px 3px 0 0;"></div>
        <div style="font-size:.62rem;color:var(--muted);">${label}</div>
      </div>`;
    }).join('');
    area.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;text-align:center;">
        <div><div style="font-size:1.4rem;font-weight:900;color:var(--l9a);">${data.total}</div><div style="font-size:.72rem;color:var(--muted);">Tổng lượt truy cập</div></div>
        <div><div style="font-size:1.4rem;font-weight:900;color:var(--l8a);">${data.today}</div><div style="font-size:.72rem;color:var(--muted);">Hôm nay</div></div>
        <div><div style="font-size:1.4rem;font-weight:900;color:var(--l11a);">${data.totalUsers}</div><div style="font-size:.72rem;color:var(--muted);">Tổng tài khoản</div></div>
      </div>
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:6px;">14 ngày gần nhất</div>
      <div style="display:flex;align-items:flex-end;gap:4px;padding:6px 2px;">${bars}</div>
    `;
  } catch {
    area.textContent = 'Không kết nối được máy chủ.';
  }
}
// V119.4: dòng "📅 học X ngày · 🗓️ tạo N ngày trước" cho từng tài khoản (số liệu từ /api/admin/users).
function adminDaysLine(u) {
  const parts = [];
  if (Number.isFinite(u.studyDays)) parts.push(`📅 Đã học ${u.studyDays} ngày`);
  if (Number.isFinite(u.accountDays)) parts.push(u.accountDays === 0 ? '🗓️ Tạo hôm nay' : `🗓️ Tạo ${u.accountDays} ngày trước`);
  if (u.lastStudyDay) parts.push(`Học gần nhất: ${String(u.lastStudyDay).split('-').reverse().join('/')}`);
  return parts.join(' · ');
}
async function adminLoadUsers() {
  const area = document.getElementById('admin-area');
  if (!area) return;
  area.textContent = 'Đang tải danh sách...';
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    const data = await res.json();
    if (!data.ok) { area.textContent = data.error || 'Không tải được danh sách.'; return; }
    area.innerHTML = `<div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">Tổng ${data.users.length} tài khoản</div>` +
      data.users.map(u => {
        const roleBadge = u.role === 'superadmin'
          ? '<span style="background:var(--l15c);color:var(--l15a);font-size:.68rem;font-weight:800;padding:2px 7px;border-radius:8px;margin-left:6px;">👑 SUPERADMIN</span>'
          : u.role === 'admin'
          ? '<span style="background:var(--l11c);color:var(--l11a);font-size:.68rem;font-weight:800;padding:2px 7px;border-radius:8px;margin-left:6px;">ADMIN</span>'
          : '';
        const canDelete = u.role !== 'superadmin';
        const canReset = u.role !== 'superadmin' || currentRole === 'superadmin';
        const canToggleRole = currentRole === 'superadmin' && u.role !== 'superadmin';
        return `
      <div style="border:1.5px solid #eee;border-radius:12px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <b>${u.username}</b>
            ${roleBadge}
          </div>
          <div style="font-size:.8rem;color:var(--muted);">📚 ${Math.round(u.known/WORDS.length*100)}% (${u.known}/${WORDS.length} từ)${Number.isFinite(u.streak) ? ' · 🔥' + u.streak : ''}</div>
        </div>
        <div style="font-size:.72rem;color:var(--muted);margin:4px 0 2px;">Tạo lúc: ${new Date(u.createdAt).toLocaleString('vi-VN')}</div>
        <div style="font-size:.72rem;color:var(--muted);margin:0 0 8px;">${adminDaysLine(u)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${canReset ? `<button class="btn btn-sm" style="background:var(--l9c);color:var(--l9a);" onclick="adminResetUser('${escapeJsAttr(u.key)}','${escapeJsAttr(u.username)}')">🔄 Reset tiến độ</button>` : ''}
          ${canToggleRole ? `<button class="btn btn-sm" style="background:var(--l11c);color:var(--l11a);" onclick="adminToggleRole('${escapeJsAttr(u.key)}','${escapeJsAttr(u.role)}')">${u.role==='admin' ? '⬇️ Bỏ quyền admin' : '⬆️ Cấp quyền admin'}</button>` : ''}
          ${canDelete ? `<button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="adminDeleteUser('${escapeJsAttr(u.key)}','${escapeJsAttr(u.username)}')">🗑️ Xoá tài khoản</button>` : '<span style="font-size:.72rem;color:var(--muted);align-self:center;">🔒 Được bảo vệ</span>'}
        </div>
      </div>`;
      }).join('');
  } catch {
    area.textContent = 'Không kết nối được máy chủ.';
  }
}
async function adminResetUser(key, username) {
  if (!confirm(`Reset toàn bộ tiến độ học của "${username}"? Không thể hoàn tác.`)) return;
  const res = await fetch(`/api/admin/users/${key}/reset`, { method:'POST', headers: authHeaders() });
  const data = await res.json();
  if (!data.ok) alert(data.error || 'Có lỗi xảy ra');
  adminLoadUsers();
}
async function adminDeleteUser(key, username) {
  if (!confirm(`Xoá vĩnh viễn tài khoản "${username}"? Không thể hoàn tác.`)) return;
  const res = await fetch(`/api/admin/users/${key}/delete`, { method:'POST', headers: authHeaders() });
  const data = await res.json();
  if (!data.ok) alert(data.error || 'Có lỗi xảy ra');
  adminLoadUsers();
}
async function adminToggleRole(key, currentR) {
  const newRole = currentR === 'admin' ? 'user' : 'admin';
  const res = await fetch(`/api/admin/users/${key}/role`, {
    method:'POST',
    headers: { 'Content-Type':'application/json', ...authHeaders() },
    body: JSON.stringify({ role: newRole }),
  });
  const data = await res.json();
  if (!data.ok) alert(data.error || 'Có lỗi xảy ra');
  adminLoadUsers();
}



// ════════════════════════════════════════════════════
// DỌN BẢN GHI ÔN TẬP MỒ CÔI (xem lib/orphans.js) — 3 bước: xem trước → sao lưu → xoá có xác nhận
// ════════════════════════════════════════════════════
let orphanState = { cards: 0, history: 0, backedUp: false };

async function orphanPreview() {
  const el = document.getElementById('orphan-result');
  el.textContent = 'Đang kiểm tra...';
  orphanState = { cards: 0, history: 0, backedUp: false };
  try {
    const res = await fetch('/api/admin/orphans', { headers: authHeaders() });
    const d = await res.json();
    if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    orphanState.cards = d.cards; orphanState.history = d.history;
    if (!d.cards && !d.history) { el.innerHTML = '✅ Không có bản ghi mồ côi nào cần dọn.'; return; }
    const users = d.byUser.map(u => `<tr><td>${escapeHtml(u.user_id)}</td><td>${u.cards}</td><td>${u.due}</td></tr>`).join('');
    const hz = d.topHz.map(h => `${escapeHtml(h.hz)} (${h.cards})`).join(' · ');
    el.innerHTML = `
      <div><b>${d.cards}</b> thẻ FSRS mồ côi (trong đó <b>${d.dueCards}</b> đang đến hạn) và <b>${d.history}</b> lượt ôn mồ côi.</div>
      <table style="width:100%;font-size:.8rem;margin:8px 0;border-collapse:collapse;"><tr><th align="left">Người dùng</th><th align="left">Thẻ</th><th align="left">Đang đến hạn</th></tr>${users}</table>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;">Chữ Hán hay gặp: ${hz || '—'}</div>
      <button class="btn btn-sm" onclick="orphanBackup()">💾 2. Tải bản sao lưu (JSON)</button>
      <div style="margin-top:10px;">
        <input type="text" id="orphan-confirm" placeholder="Gõ XOA để xác nhận" style="padding:8px;border-radius:8px;border:1.5px solid #ddd;font-size:.9rem;">
        <button class="btn btn-sm" style="background:#fdecea;color:#c0392b;" onclick="orphanCleanup()">🗑️ 3. Xoá</button>
      </div>
      <div id="orphan-status" style="margin-top:8px;"></div>`;
  } catch (e) {
    el.textContent = '❌ Không kết nối được máy chủ: ' + e.message;
  }
}

async function orphanBackup() {
  const st = document.getElementById('orphan-status');
  st.textContent = 'Đang tạo bản sao lưu...';
  try {
    const res = await fetch('/api/admin/orphans/export', { headers: authHeaders() });
    if (!res.ok) { st.textContent = '❌ Không tải được bản sao lưu'; return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orphan-review-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    orphanState.backedUp = true;
    st.textContent = '✅ Đã tải bản sao lưu. Giữ file này cho tới khi chắc chắn không cần.';
  } catch (e) { st.textContent = '❌ ' + e.message; }
}

async function orphanCleanup() {
  const st = document.getElementById('orphan-status');
  if (!orphanState.backedUp) { st.textContent = '⚠️ Hãy tải bản sao lưu (bước 2) trước khi xoá.'; return; }
  const confirmText = (document.getElementById('orphan-confirm').value || '').trim();
  if (confirmText !== 'XOA') { st.textContent = '⚠️ Gõ đúng chữ XOA để xác nhận.'; return; }
  if (!confirm(`Xoá ${orphanState.cards} thẻ và ${orphanState.history} lượt ôn mồ côi? Không thể hoàn tác.`)) return;
  st.textContent = 'Đang xoá...';
  try {
    const res = await fetch('/api/admin/orphans/cleanup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ expectedCards: orphanState.cards, expectedHistory: orphanState.history, confirm: confirmText }),
    });
    const d = await res.json();
    if (!d.ok) { st.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    document.getElementById('orphan-result').innerHTML = `✅ Đã xoá ${d.removedCards} thẻ và ${d.removedHistory} lượt ôn mồ côi. <span style="color:var(--l9a);">Tải lại trang để cập nhật số liệu.</span>`;
    orphanState = { cards: 0, history: 0, backedUp: false };
  } catch (e) { st.textContent = '❌ Không kết nối được máy chủ: ' + e.message; }
}


// Phân loại thẻ đến hạn của tài khoản đang đăng nhập (chỉ đọc) — thay cho việc chạy SQL tay.
async function dueBreakdown() {
  const el = document.getElementById('due-breakdown-result');
  el.textContent = 'Đang phân loại...';
  try {
    const res = await fetch('/api/admin/due-breakdown', { headers: authHeaders() });
    const d = await res.json();
    if (!d.ok) { el.textContent = '❌ ' + (d.error || 'Có lỗi xảy ra'); return; }
    const lessons = d.byLesson.map(r => `<tr><td>Bài ${r.lesson}</td><td>${r.cards}</td></tr>`).join('');
    el.innerHTML = `
      <div>Tổng thẻ đến hạn: <b>${d.total}</b></div>
      <div>• Từ còn trong ít nhất 1 bài: <b>${d.wordInLesson}</b></div>
      <div>• Từ không thuộc bài nào (không vào phiên học được): <b>${d.wordNoLesson}</b></div>
      <div>• Không còn từ nào (mồ côi): <b>${d.noWord}</b></div>
      <table style="width:100%;font-size:.8rem;margin-top:8px;border-collapse:collapse;"><tr><th align="left">Theo bài</th><th align="left">Thẻ đến hạn</th></tr>${lessons}</table>
      <div style="font-size:.75rem;color:var(--muted);margin-top:6px;">Từ thuộc nhiều bài được đếm ở mỗi bài nên tổng theo bài có thể lớn hơn.</div>`;
  } catch (e) { el.textContent = '❌ Không kết nối được máy chủ: ' + e.message; }
}

// ══════════════════════════════════════════════════════
// V119.3 — CHỈ SUPERADMIN: bật/tắt trang đăng ký + tạo tài khoản cho người khác
// ══════════════════════════════════════════════════════
let adminRegOpen = null; // null = chưa biết

function adminRegPanelHtml() {
  return `<div class="adm-reg" id="adm-reg">
    <div class="adm-reg-row">
      <div>
        <div class="adm-reg-title">🔐 Trang đăng ký</div>
        <div class="adm-reg-state" id="adm-reg-state">Đang tải…</div>
      </div>
      <button class="btn btn-sm" id="adm-reg-btn" onclick="adminToggleRegistration()" disabled>…</button>
    </div>
    <div class="adm-reg-hint">Khi tắt, người lạ không tự đăng ký được (tab "Đăng ký" ở màn đăng nhập bị ẩn). Bạn vẫn tạo tài khoản được ở bên dưới.</div>
    <details class="adm-create">
      <summary>➕ Tạo tài khoản mới</summary>
      <div class="adm-create-body">
        <input id="adm-new-user" type="text" placeholder="Tên đăng nhập (3-20 ký tự: chữ, số, _)" autocomplete="off" autocapitalize="none">
        <input id="adm-new-pass" type="text" placeholder="Mật khẩu (tối thiểu 4 ký tự)" autocomplete="off">
        <select id="adm-new-role"><option value="user">Người học (user)</option><option value="admin">Quản trị viên (admin)</option></select>
        <button class="btn btn-primary btn-sm" id="adm-create-btn" onclick="adminCreateUser()">Tạo tài khoản</button>
        <div class="adm-create-msg" id="adm-create-msg"></div>
      </div>
    </details>
  </div>`;
}

function adminRegRender() {
  const st = document.getElementById('adm-reg-state'), btn = document.getElementById('adm-reg-btn');
  if (!st || !btn) return;
  if (adminRegOpen === null) { st.textContent = 'Không tải được trạng thái'; btn.disabled = true; btn.textContent = 'Thử lại'; btn.onclick = adminLoadReg; return; }
  btn.onclick = adminToggleRegistration; btn.disabled = false;
  st.innerHTML = adminRegOpen ? '🟢 <b>Đang MỞ</b> — ai cũng đăng ký được' : '🔴 <b>Đang TẮT</b> — chỉ bạn tạo được tài khoản';
  btn.textContent = adminRegOpen ? 'Tắt đăng ký' : 'Bật đăng ký';
}

async function adminLoadReg() {
  try {
    const res = await fetch('/api/auth/config');
    const d = await res.json();
    adminRegOpen = d && d.ok ? !!d.registrationOpen : null;
  } catch { adminRegOpen = null; }
  adminRegRender();
}

async function adminToggleRegistration() {
  if (adminRegOpen === null) return adminLoadReg();
  const next = !adminRegOpen;
  const msg = next ? 'Bật lại trang đăng ký? Mọi người sẽ tự đăng ký được.' : 'Tắt trang đăng ký? Người mới sẽ không tự tạo được tài khoản (tài khoản đang có không bị ảnh hưởng).';
  if (!confirm(msg)) return;
  const btn = document.getElementById('adm-reg-btn'); if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/admin/settings/registration', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ open: next }) });
    const d = await res.json();
    if (!d.ok) { alert(d.error || 'Có lỗi xảy ra'); } else { adminRegOpen = !!d.registrationOpen; }
  } catch { alert('Không kết nối được máy chủ.'); }
  adminRegRender();
}

async function adminCreateUser() {
  const u = document.getElementById('adm-new-user'), p = document.getElementById('adm-new-pass'), r = document.getElementById('adm-new-role');
  const msg = document.getElementById('adm-create-msg'), btn = document.getElementById('adm-create-btn');
  if (!u || !p || !r || !msg) return;
  const show = (t, ok) => { msg.textContent = t; msg.className = 'adm-create-msg ' + (ok ? 'ok' : 'err'); };
  const username = u.value.trim(), password = p.value;
  if (!username || !password) return show('Nhập đủ tên đăng nhập và mật khẩu', false);
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/users/create', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ username, password, role: r.value }) });
    const d = await res.json();
    if (!d.ok) { show(d.error || 'Có lỗi xảy ra', false); }
    else { show(`✅ Đã tạo "${d.user.username}" (${d.user.role}). Hãy gửi mật khẩu cho người đó.`, true); u.value = ''; p.value = ''; adminLoadUsers(); }
  } catch { show('Không kết nối được máy chủ.', false); }
  btn.disabled = false;
}
