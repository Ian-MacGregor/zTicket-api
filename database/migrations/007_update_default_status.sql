-- ============================================================
-- Migration 007: Set UNASSIGNED as the default ticket status
-- Must be run AFTER 006_add_statuses.sql has been committed
-- ============================================================

ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'unassigned';
