-- ============================================================
-- Migration 006: Add UNASSIGNED and RESERVED ticket statuses
-- Run this first, then run 007_update_default_status.sql
-- ============================================================

ALTER TYPE ticket_status ADD VALUE 'unassigned';
ALTER TYPE ticket_status ADD VALUE 'reserved';
