-- ============================================================
-- 027_chatbot.sql — AI Chatbot configuration table
-- ============================================================

CREATE TABLE IF NOT EXISTS chatbot_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini', 'openai')),
  api_key TEXT,
  system_prompt TEXT NOT NULL DEFAULT 'You are a helpful business assistant. Answer questions about our business.',
  handoff_keywords TEXT NOT NULL DEFAULT 'human, agent, representative, help, support, talk to a person',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_config_account_id ON chatbot_config(account_id);

ALTER TABLE chatbot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view chatbot config for their account" ON chatbot_config;
CREATE POLICY "Users can view chatbot config for their account" ON chatbot_config
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage chatbot config for their account" ON chatbot_config;
CREATE POLICY "Admins can manage chatbot config for their account" ON chatbot_config
  FOR ALL USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON chatbot_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chatbot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
