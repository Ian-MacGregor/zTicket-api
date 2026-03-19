-- Add color settings table
-- Run this in the Supabase SQL Editor

create table if not exists public.color_settings (
  id         text primary key default 'global',
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id)
);

-- Insert default row
insert into public.color_settings (id, settings) values ('global', '{}'::jsonb)
on conflict (id) do nothing;

-- RLS
alter table public.color_settings enable row level security;

create policy "Color settings viewable by authenticated"
  on public.color_settings for select
  to authenticated using (true);

create policy "Color settings updatable by authenticated"
  on public.color_settings for update
  to authenticated using (true);

create policy "Color settings insertable by authenticated"
  on public.color_settings for insert
  to authenticated with check (true);
