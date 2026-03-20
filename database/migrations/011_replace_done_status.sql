-- ============================================================
-- Migration 011: Replace "complete" and "sent" with "done"
-- Recreates the enum type cleanly without the old values.
-- ============================================================

-- Release the enum dependency so we can drop and recreate it
ALTER TABLE tickets ALTER COLUMN status TYPE text;

-- Migrate existing data
UPDATE tickets SET status = 'done' WHERE status IN ('complete', 'sent');

-- Recreate the enum without complete/sent, including done
DROP TYPE ticket_status;
CREATE TYPE ticket_status AS ENUM ('unassigned', 'wait_hold', 'assigned', 'review', 'done');

-- Restore the column and default
ALTER TABLE tickets ALTER COLUMN status TYPE ticket_status USING status::ticket_status;
ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'unassigned';

-- Update trigger: set date_completed when status becomes 'done' (remove old 'sent' logic)
CREATE OR REPLACE FUNCTION set_completion_date()
RETURNS trigger AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.date_completed = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
