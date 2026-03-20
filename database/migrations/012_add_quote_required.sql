-- ============================================================
-- Migration 012: Add quote_required flag to tickets
-- Controls visibility of quoted time/price/amf fields.
-- ============================================================

ALTER TABLE tickets ADD COLUMN quote_required boolean NOT NULL DEFAULT false;
