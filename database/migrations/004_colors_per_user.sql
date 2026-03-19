-- Convert color_settings to per-user
-- Run this in the Supabase SQL Editor

-- Drop the old default so new rows don't all get 'global'
alter table public.color_settings alter column id drop default;

-- Allow the id column to reference profiles (optional but clean)
-- Remove old global row if you want (or leave it, it won't hurt)
-- delete from public.color_settings where id = 'global';

-- Update RLS so users can only read/write their own row
drop policy if exists "Color settings viewable by authenticated" on public.color_settings;
drop policy if exists "Color settings updatable by authenticated" on public.color_settings;
drop policy if exists "Color settings insertable by authenticated" on public.color_settings;

create policy "Users can view own color settings"
  on public.color_settings for select
  to authenticated using (id = auth.uid()::text);

create policy "Users can insert own color settings"
  on public.color_settings for insert
  to authenticated with check (id = auth.uid()::text);

create policy "Users can update own color settings"
  on public.color_settings for update
  to authenticated using (id = auth.uid()::text);
