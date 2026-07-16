-- 040_quick_replies.sql
-- Table to store quick replies (text snippets triggered by / shortcut)

CREATE TABLE IF NOT EXISTS wacrm.quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES wacrm.accounts(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate shortcuts for the same account
  CONSTRAINT unique_shortcut_per_account UNIQUE (account_id, shortcut)
);

-- Enable RLS
ALTER TABLE wacrm.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage quick replies" ON wacrm.quick_replies;
CREATE POLICY "Users can manage quick replies" ON wacrm.quick_replies FOR ALL
  USING (wacrm.is_account_member(account_id));
