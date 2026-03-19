-- Add clients and contacts tables
-- Run this in the Supabase SQL Editor

-- 1) CLIENTS TABLE
create table if not exists public.clients (
  id         uuid default gen_random_uuid() primary key,
  name       text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) CLIENT CONTACTS TABLE
create table if not exists public.client_contacts (
  id         uuid default gen_random_uuid() primary key,
  client_id  uuid references public.clients(id) on delete cascade not null,
  name       text not null,
  email      text,
  phone      text,
  role       text,
  created_at timestamptz default now()
);

-- 3) ADD CLIENT REFERENCE TO TICKETS
alter table public.tickets
  add column if not exists client_id uuid references public.clients(id);

-- 4) AUTO-UPDATE updated_at ON CLIENTS
create trigger clients_updated_at
  before update on public.clients
  for each row execute function update_timestamp();

-- 5) ROW-LEVEL SECURITY
alter table public.clients         enable row level security;
alter table public.client_contacts enable row level security;

create policy "Clients viewable by authenticated"
  on public.clients for select
  to authenticated using (true);

create policy "Clients insertable by authenticated"
  on public.clients for insert
  to authenticated with check (true);

create policy "Clients updatable by authenticated"
  on public.clients for update
  to authenticated using (true);

create policy "Clients deletable by authenticated"
  on public.clients for delete
  to authenticated using (true);

create policy "Contacts viewable by authenticated"
  on public.client_contacts for select
  to authenticated using (true);

create policy "Contacts insertable by authenticated"
  on public.client_contacts for insert
  to authenticated with check (true);

create policy "Contacts updatable by authenticated"
  on public.client_contacts for update
  to authenticated using (true);

create policy "Contacts deletable by authenticated"
  on public.client_contacts for delete
  to authenticated using (true);
