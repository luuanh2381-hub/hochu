-- V145: Thư viện hội thoại HSK 3-4
-- Tạo bảng conversations để lưu trữ 200 hội thoại chất lượng cao
-- với phân loại theo cấp độ HSK và chủ đề

-- Bật tiện ích tìm kiếm gần đúng (cần cho các chỉ mục gin_trgm_ops bên dưới; thiếu dòng này thì tạo chỉ mục sẽ báo lỗi)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  dialogue_id VARCHAR(50) UNIQUE NOT NULL,
  title_zh VARCHAR(255) NOT NULL,
  title_vi VARCHAR(255) NOT NULL,
  hsk_level VARCHAR(10) NOT NULL CHECK (hsk_level IN ('HSK 3', 'HSK 4')),
  topic VARCHAR(100) NOT NULL,
  subtopics TEXT[],
  situation TEXT,
  characters TEXT[],
  total_turns INTEGER NOT NULL CHECK (total_turns >= 30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Tạo bảng conversation_turns để lưu từng lượt thoại
CREATE TABLE IF NOT EXISTS conversation_turns (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  character VARCHAR(50) NOT NULL,
  chinese_text TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  vietnamese_text TEXT NOT NULL,
  vocabulary_explanations JSONB,
  grammar_explanations JSONB,
  audio_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo index cho hiệu năng tìm kiếm
CREATE INDEX IF NOT EXISTS idx_conversations_hsk_topic ON conversations(hsk_level, topic);
CREATE INDEX IF NOT EXISTS idx_conversations_search ON conversations USING GIN (
  title_zh gin_trgm_ops,
  title_vi gin_trgm_ops,
  situation gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_search ON conversation_turns USING GIN (
  chinese_text gin_trgm_ops,
  vietnamese_text gin_trgm_ops
);

-- Tạo bảng conversation_progress để theo dõi tiến độ học
CREATE TABLE IF NOT EXISTS conversation_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_played_turn INTEGER DEFAULT 0,
  times_practiced INTEGER DEFAULT 0,
  is_favorited BOOLEAN DEFAULT false,
  last_practiced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, conversation_id)
);

-- Tạo index cho hiệu năng truy vấn tiến độ
CREATE INDEX IF NOT EXISTS idx_conversation_progress_user ON conversation_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_progress_convo ON conversation_progress(conversation_id);

-- Thêm dữ liệu mẫu cho các chủ đề
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('d1', '欢迎来到电子工厂', 'Chào mừng đến nhà máy điện tử', 'HSK 3', 'Nhà máy sản xuất điện tử', 'Giới thiệu về nhà máy điện tử', ARRAY['A', 'B'], 32)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration', 'V145_conversation_library', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;