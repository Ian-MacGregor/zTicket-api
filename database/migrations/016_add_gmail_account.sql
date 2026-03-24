-- ============================================================
-- Migration 016: Add gmail_account to profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_account text;
