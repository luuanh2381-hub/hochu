// lib/conversation-batches.js — V154: danh mục 8 file dữ liệu hội thoại + báo cáo "database đang thiếu batch nào".
// THUẦN (không DB, không fs): db.js đưa danh sách dialogue_id hiện có vào, hàm trả báo cáo. KHÔNG tự chạy batch nào.
// Danh mục khớp 1–1 với migrations/V145_conversation_data_batch{1..8}.sql (test v154 đối chiếu với chính các file SQL).
const CONVERSATION_BATCHES = [
  { batch: 1, file: 'V145_conversation_data_batch1.sql', prefix: 'hsk3', from: 1, to: 25, level: 'HSK 3' },
  { batch: 2, file: 'V145_conversation_data_batch2.sql', prefix: 'hsk3', from: 26, to: 50, level: 'HSK 3' },
  { batch: 3, file: 'V145_conversation_data_batch3.sql', prefix: 'hsk3', from: 51, to: 75, level: 'HSK 3' },
  { batch: 4, file: 'V145_conversation_data_batch4.sql', prefix: 'hsk3', from: 76, to: 100, level: 'HSK 3' },
  { batch: 5, file: 'V145_conversation_data_batch5.sql', prefix: 'hsk4', from: 1, to: 25, level: 'HSK 4' },
  { batch: 6, file: 'V145_conversation_data_batch6.sql', prefix: 'hsk4', from: 26, to: 50, level: 'HSK 4' },
  { batch: 7, file: 'V145_conversation_data_batch7.sql', prefix: 'hsk4', from: 51, to: 75, level: 'HSK 4' },
  { batch: 8, file: 'V145_conversation_data_batch8.sql', prefix: 'hsk4', from: 76, to: 100, level: 'HSK 4' },
];

function batchIds(b) {
  const ids = [];
  for (let n = b.from; n <= b.to; n++) ids.push(`${b.prefix}-${String(n).padStart(3, '0')}`);
  return ids;
}

// presentIds: mảng/Set dialogue_id đang có trong DB. turnStats: { total, withTurns, withoutTurns } (tuỳ chọn).
function buildConversationDataReport(presentIds, turnStats) {
  const present = new Set(Array.from(presentIds || [], String));
  const expectedAll = new Set();
  const batches = CONVERSATION_BATCHES.map((b) => {
    const ids = batchIds(b);
    ids.forEach((i) => expectedAll.add(i));
    const missing = ids.filter((i) => !present.has(i));
    const status = missing.length === 0 ? 'ok' : (missing.length === ids.length ? 'missing' : 'partial');
    return { batch: b.batch, file: b.file, level: b.level, expected: ids.length, present: ids.length - missing.length, missingCount: missing.length, missing: missing.slice(0, 10), status };
  });
  const extra = [...present].filter((i) => !expectedAll.has(i));
  const needBatches = batches.filter((b) => b.status !== 'ok').map((b) => b.batch);
  return {
    expectedTotal: expectedAll.size,
    presentTotal: expectedAll.size - batches.reduce((a, b) => a + b.missingCount, 0),
    extraCount: extra.length, // vd 'd1' (mẫu V145) hoặc hội thoại nhập thêm — không phải lỗi
    batches,
    needBatches,
    complete: needBatches.length === 0,
    turns: turnStats || null,
    advice: needBatches.length
      ? `Cần nhập: ${needBatches.map((n) => CONVERSATION_BATCHES[n - 1].file).join(', ')} (Neon SQL Editor; mỗi file dùng ON CONFLICT DO NOTHING nên chạy lại không tạo trùng).`
      : 'Đủ 200 hội thoại đầu bài từ 8 batch.',
  };
}

module.exports = { CONVERSATION_BATCHES, batchIds, buildConversationDataReport };
