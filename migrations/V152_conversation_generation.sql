-- V152: Sinh lượt thoại bằng AI + duyệt bài.
-- KHÔNG BẮT BUỘC chạy tay: lib/db.js (ensureConversationGenSchema) tự chạy đúng các lệnh này, idempotent, lần đầu có người mở tab Hội thoại.
-- File này để bạn chạy thủ công trong Neon SQL Editor nếu muốn chủ động.

BEGIN;
SELECT pg_advisory_xact_lock(152001);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS gen_status VARCHAR(12) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gen_error TEXT,
  ADD COLUMN IF NOT EXISTS gen_model VARCHAR(120),
  ADD COLUMN IF NOT EXISTS gen_prompt_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gen_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

DO $$
BEGIN
  -- Ràng buộc cũ total_turns >= 30 quá dài cho HSK 3 (ép AI độn câu) → hạ xuống 12
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_total_turns_check' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations DROP CONSTRAINT conversations_total_turns_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_total_turns_min' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_total_turns_min CHECK (total_turns >= 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_gen_status_chk' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_gen_status_chk
      CHECK (gen_status IN ('pending','generating','draft','ready','failed'));
  END IF;
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_turns_pos ON conversation_turns (conversation_id, turn_number);
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'conversation_turns có dòng trùng (conversation_id, turn_number) — bỏ qua chỉ mục duy nhất';
  END;
END $$;

-- Bài đã CÓ lượt thoại từ trước V152 (nhập tay) → coi là đã duyệt, không biến mất khỏi thư viện
UPDATE conversations c SET gen_status = 'ready'
WHERE c.gen_status = 'pending' AND c.gen_attempts = 0
  AND EXISTS (SELECT 1 FROM conversation_turns t WHERE t.conversation_id = c.id);

COMMIT;
