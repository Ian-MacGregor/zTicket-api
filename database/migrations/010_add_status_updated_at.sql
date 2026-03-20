-- ============================================================
-- Migration 010: Add status_updated_at to track the last
-- status change for any status transition
-- ============================================================

ALTER TABLE tickets ADD COLUMN status_updated_at timestamptz;

-- Seed existing rows with the best available date
UPDATE tickets
SET status_updated_at = COALESCE(date_sent, date_completed, updated_at, created_at, now());

ALTER TABLE tickets ALTER COLUMN status_updated_at SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN status_updated_at SET DEFAULT now();

-- Extend the existing trigger function to also set status_updated_at
-- on any status change (not just complete/sent)
CREATE OR REPLACE FUNCTION set_completion_date()
RETURNS trigger AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
    NEW.date_completed = now();
  END IF;
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    NEW.date_sent = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
