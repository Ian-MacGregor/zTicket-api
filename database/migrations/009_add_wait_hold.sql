-- ============================================================
-- Migration 009: Rename "reserved" to "wait_hold" and add
-- wait_hold_reason column to tickets
-- ============================================================

ALTER TYPE ticket_status RENAME VALUE 'reserved' TO 'wait_hold';

ALTER TABLE tickets ADD COLUMN wait_hold_reason text;
