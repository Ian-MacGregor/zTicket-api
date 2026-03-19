-- Add auto-incrementing reference number to tickets
-- Run this in the Supabase SQL Editor

-- Create a sequence
create sequence if not exists ticket_ref_seq start 1000;

-- Add the column with a default from the sequence
alter table public.tickets
  add column if not exists ref_number integer unique default nextval('ticket_ref_seq');

-- Backfill any existing tickets that have null ref_number
update public.tickets
  set ref_number = nextval('ticket_ref_seq')
  where ref_number is null;

-- Make it not null now that all rows have values
alter table public.tickets
  alter column ref_number set not null;
