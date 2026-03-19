-- ============================================================
-- TICKETING APP — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1) ALLOWED EMAILS TABLE
--    Only emails in this list can register via Supabase Auth.
create table if not exists allowed_emails (
  id         uuid default gen_random_uuid() primary key,
  email      text not null unique,
  created_at timestamptz default now()
);

-- Seed with your allowed company emails:
insert into allowed_emails (email) values
  ('alice@yourcompany.com'),
  ('bob@yourcompany.com'),
  ('carol@yourcompany.com');

-- 2) PROFILES TABLE
--    Mirrors auth.users; filled by a trigger on signup.
create table if not exists profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text not null unique,
  full_name  text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 3) TICKETS TABLE
create type ticket_priority as enum ('low', 'medium', 'high', 'critical');
create type ticket_status   as enum ('assigned', 'review', 'complete', 'sent');

create table if not exists tickets (
  id              uuid default gen_random_uuid() primary key,
  title           text not null,
  description     text,
  priority        ticket_priority not null default 'medium',
  status          ticket_status   not null default 'assigned',
  assigned_to     uuid references profiles(id),
  reviewer        uuid references profiles(id),
  gmail_links     text[] default '{}',
  date_assigned   timestamptz default now(),
  date_completed  timestamptz,
  date_sent       timestamptz,
  created_by      uuid references profiles(id) not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 4) TICKET FILES TABLE
--    Metadata for files stored in Supabase Storage.
create table if not exists ticket_files (
  id          uuid default gen_random_uuid() primary key,
  ticket_id   uuid references tickets(id) on delete cascade not null,
  file_name   text not null,
  file_path   text not null,
  file_size   bigint,
  mime_type   text,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz default now()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile row on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Block signups from emails NOT in allowed_emails
create or replace function check_allowed_email()
returns trigger as $$
begin
  if not exists (select 1 from allowed_emails where email = new.email) then
    raise exception 'Email not authorized to register';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_allowed_email on auth.users;
create trigger enforce_allowed_email
  before insert on auth.users
  for each row execute function check_allowed_email();

-- Auto-update updated_at on tickets
create or replace function update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tickets_updated_at
  before update on tickets
  for each row execute function update_timestamp();

-- Auto-set date_completed when status → 'complete'
create or replace function set_completion_date()
returns trigger as $$
begin
  if new.status = 'complete' and old.status != 'complete' then
    new.date_completed = now();
  end if;
  if new.status = 'sent' and old.status != 'sent' then
    new.date_sent = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- Add trigger for status changes
create trigger tickets_status_dates
  before update on tickets
  for each row execute function set_completion_date();

  create or replace function check_allowed_email()
returns trigger as $$
begin
  if not exists (select 1 from public.allowed_emails where email = new.email) then
    raise exception 'Email not authorized to register';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table profiles    enable row level security;
alter table tickets     enable row level security;
alter table ticket_files enable row level security;

-- Profiles: any authenticated user can read all; users update own
create policy "Profiles viewable by authenticated"
  on profiles for select
  to authenticated using (true);

create policy "Users update own profile"
  on profiles for update
  to authenticated using (id = auth.uid());

-- Tickets: all authenticated can CRUD
create policy "Tickets viewable by authenticated"
  on tickets for select
  to authenticated using (true);

create policy "Tickets insertable by authenticated"
  on tickets for insert
  to authenticated with check (true);

create policy "Tickets updatable by authenticated"
  on tickets for update
  to authenticated using (true);

-- Ticket files: all authenticated can CRUD
create policy "Files viewable by authenticated"
  on ticket_files for select
  to authenticated using (true);

create policy "Files insertable by authenticated"
  on ticket_files for insert
  to authenticated with check (true);

create policy "Files deletable by authenticated"
  on ticket_files for delete
  to authenticated using (true);

-- ============================================================
-- STORAGE BUCKET (run separately in Supabase dashboard or via API)
-- ============================================================
-- Create a bucket called "ticket-attachments" with:
--   • Public: OFF
--   • File size limit: 50 MB
--   • Allowed MIME types: (leave open or restrict as needed)
--
-- Then add these storage policies in the Supabase dashboard:
--   SELECT  → authenticated users
--   INSERT  → authenticated users
--   DELETE  → authenticated users

-- OR run this SQL to create the bucket and policies:
-- insert into storage.buckets (id, name, public)
-- values ('ticket-attachments', 'ticket-attachments', false);

-- create policy "Authenticated users can upload"
--   on storage.objects for insert
--   to authenticated
--   with check (bucket_id = 'ticket-attachments');

-- create policy "Authenticated users can read"
--   on storage.objects for select
--   to authenticated
--   using (bucket_id = 'ticket-attachments');

-- create policy "Authenticated users can delete"
--   on storage.objects for delete
--   to authenticated
--   using (bucket_id = 'ticket-attachments');