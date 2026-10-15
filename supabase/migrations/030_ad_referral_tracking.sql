-- ============================================================
-- 030_ad_referral_tracking.sql
--
-- Track Meta Click-to-WhatsApp Ads (CTWA) attribution
-- (campaign name & id, adset name & id, ad name & id, referral metadata).
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS referral_data JSONB;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS referral_data JSONB;

CREATE INDEX IF NOT EXISTS idx_conversations_referral_data
  ON conversations USING gin (referral_data);

CREATE INDEX IF NOT EXISTS idx_messages_referral_data
  ON messages USING gin (referral_data);
