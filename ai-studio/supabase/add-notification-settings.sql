-- Migration: Add notification preferences to user_settings table
begin;

-- Add notification preference columns
alter table public.user_settings
  add column if not exists email_notifications boolean not null default true,
  add column if not exists job_completion_notifications boolean not null default true,
  add column if not exists product_updates boolean not null default true,
  add column if not exists reminders_enabled boolean not null default false;

commit;

