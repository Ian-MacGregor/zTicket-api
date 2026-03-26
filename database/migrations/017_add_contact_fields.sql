-- Add phone2 and distribute_code fields to client_contacts
alter table public.client_contacts
  add column if not exists phone2           text,
  add column if not exists distribute_code  boolean not null default false;
