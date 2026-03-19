-- ============================================================
-- Migration 008: Add missing DELETE RLS policy for tickets
-- Without this, authenticated users cannot delete tickets.
-- Supabase silently ignores deletes with no matching policy.
-- ============================================================

create policy "Tickets deletable by authenticated"
  on tickets for delete
  to authenticated using (true);
