-- Add quoted fields and comments to tickets
-- Run this in the Supabase SQL Editor

alter table public.tickets
  add column if not exists quoted_time text,
  add column if not exists quoted_price numeric(10,2),
  add column if not exists quoted_amf numeric(10,2),
  add column if not exists comments text;
