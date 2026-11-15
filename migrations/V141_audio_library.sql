-- V141: thư viện âm thanh dùng chung (metadata Neon + MP3 trên Cloudflare R2).
-- KHÔNG phá huỷ dữ liệu: chỉ CREATE TABLE / INDEX IF NOT EXISTS, không đụng bảng khác.
-- lib/audio-library.js tự chạy y hệt khối này ở lần dùng đầu, nên chạy tay là TUỲ CHỌN.
CREATE TABLE IF NOT EXISTS audio_library (
  id BIGSERIAL PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,          -- SHA-256(text \0 voice \0 speed \0 format \0 tts_version)
  text_content TEXT NOT NULL,
  voice TEXT NOT NULL,
  speed TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'mp3',
  storage_key TEXT NOT NULL,                  -- do server sinh: tts/v1/<2 ký tự>/<hash>.mp3
  file_size INTEGER NOT NULL DEFAULT 0,
  duration DOUBLE PRECISION,                  -- chưa đo được từ Edge-TTS → NULL
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audio_library_status_idx ON audio_library (status);
CREATE INDEX IF NOT EXISTS audio_library_updated_idx ON audio_library (updated_at);