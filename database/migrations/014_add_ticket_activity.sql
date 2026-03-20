-- ============================================================
-- Migration 014: Add ticket_activity table for activity feed
-- ============================================================

CREATE TABLE ticket_activity (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id  uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES profiles(id) NOT NULL,
  action     text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ticket_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity viewable by authenticated"
  ON ticket_activity FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can log own activity"
  ON ticket_activity FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
