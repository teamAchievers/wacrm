-- ============================================================
-- 028_conversation_chatbot_toggle.sql — Chatbot toggle per conversation
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN NOT NULL DEFAULT true;
