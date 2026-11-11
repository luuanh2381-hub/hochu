-- migrations/V129_tts_hints.sql — "Sửa phát âm": chữ đọc riêng cho từ có chữ Hán đa âm (vd 行 → 两行).
-- lib/tts-hints.js (ensureTable) tự chạy idempotent ở lần dùng đầu; file này để đối chiếu/chạy tay.
-- CHỈ CỘNG THÊM, không đụng bảng cũ, không liên quan FSRS / tiến độ học.
CREATE TABLE IF NOT EXISTS tts_hints (
  hz TEXT PRIMARY KEY,
  say TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Hoàn tác (web quay về đọc chữ gốc, không mất dữ liệu học):  DROP TABLE IF EXISTS tts_hints;
