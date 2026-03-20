-- ============================================================
-- Migration 013: Replace comments column with ticket_comments table
-- Adds a forum-style per-user comment system.
-- ============================================================

-- Create table
CREATE TABLE ticket_comments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id  uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES profiles(id) NOT NULL,
  body       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-update updated_at on edit (reuses existing function from schema.sql)
CREATE TRIGGER ticket_comments_updated_at
  BEFORE UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Row-Level Security
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by authenticated"
  ON ticket_comments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can create own comments"
  ON ticket_comments FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
  ON ticket_comments FOR UPDATE
  TO authenticated USING (user_id = auth.uid());

-- Comment authors can delete their own comments.
-- Ticket deletion cascades and removes all comments automatically (ON DELETE CASCADE).
CREATE POLICY "Users can delete own comments"
  ON ticket_comments FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Migrate existing comments text field into the new table,
-- attributed to the ticket creator. Skips null / empty values.
INSERT INTO ticket_comments (ticket_id, user_id, body, created_at, updated_at)
SELECT id, created_by, comments, created_at, created_at
FROM tickets
WHERE comments IS NOT NULL AND trim(comments) != '';

-- Remove the old comments column
ALTER TABLE tickets DROP COLUMN comments;
