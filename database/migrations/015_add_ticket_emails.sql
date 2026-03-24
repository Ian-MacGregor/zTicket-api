-- ============================================================
-- Migration 015: Replace gmail_links with ticket_emails table
-- ============================================================

-- Drop the old gmail_links column from tickets
ALTER TABLE tickets DROP COLUMN IF EXISTS gmail_links;

-- New table: stores imported Gmail message content
CREATE TABLE ticket_emails (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id        uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id  text,
  subject          text,
  from_email       text,
  from_name        text,
  to_email         text,
  snippet          text,
  body_html        text,
  body_text        text,
  received_at      timestamptz,
  imported_by      uuid REFERENCES profiles(id),
  created_at       timestamptz DEFAULT now(),
  -- Prevent the same Gmail message being imported to the same ticket twice
  UNIQUE (ticket_id, gmail_message_id)
);

ALTER TABLE ticket_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Emails viewable by authenticated"
  ON ticket_emails FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can import emails"
  ON ticket_emails FOR INSERT
  TO authenticated WITH CHECK (imported_by = auth.uid());

CREATE POLICY "Users can remove emails"
  ON ticket_emails FOR DELETE
  TO authenticated USING (true);
