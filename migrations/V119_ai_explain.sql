-- V119: "Hỏi AI" ở câu sai. Hai bảng này cũng được TỰ TẠO khi gọi lần đầu (lib/ai-explain.js) — file này chỉ để chạy tay nếu muốn.
CREATE TABLE IF NOT EXISTS ai_word_explain (
  cache_key  TEXT PRIMARY KEY,
  hz         TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_explain_usage (
  user_id TEXT NOT NULL,
  day     DATE NOT NULL,
  n       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
-- V119.1: Thư viện AI theo từng người (mỗi người 1 dòng cho mỗi từ đã xem giải thích)
CREATE TABLE IF NOT EXISTS ai_explain_user (
  user_id    TEXT NOT NULL,
  hz         TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hz)
);
