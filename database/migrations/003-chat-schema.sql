-- Migration 003: Real-Time Chat Schema
-- Session: 6 — Real-Time In-App Chat
-- Run in: Supabase SQL Editor (uat project first, then production)
-- Description: Replaces the Express Interest one-tap with full real-time chat.
--   Do NOT drop the old messages table — rename it to messages_legacy first.
--   Design is clean; do not build on top of the old messages table.

-- Step 1: Archive old messages table (run before creating new schema)
-- ALTER TABLE messages RENAME TO messages_legacy;

-- Step 2: Create conversations table (one per buyer-seller-listing combination)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, buyer_id, seller_id)
);

-- Step 3: Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  content TEXT,
  message_type TEXT DEFAULT 'text',
  -- message_type values: 'text' | 'phone_request' | 'phone_granted' | 'system'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Step 4: Enable Supabase Realtime on chat_messages
-- Run in Supabase SQL Editor:
-- ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Step 5: Add RLS policies (before enabling Realtime)
-- Only conversation participants can read/write their messages
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
-- (Write policies in Session 6)

-- Step 6: Verify
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
