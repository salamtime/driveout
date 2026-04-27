-- Persistent audit fields for manual amount-due edits on rentals.
-- This keeps the visible "reason for change" metadata on the rental row itself,
-- so it survives refresh even when shared activity log access is unavailable.

alter table public.app_4c3a7a6153_rentals
  add column if not exists amount_due_override_reason text null,
  add column if not exists amount_due_override_edited_by uuid null references auth.users(id),
  add column if not exists amount_due_override_edited_by_name text null,
  add column if not exists amount_due_override_previous_amount numeric(12,2) null,
  add column if not exists amount_due_override_edited_at timestamptz null;

comment on column public.app_4c3a7a6153_rentals.amount_due_override_reason is
  'Free-text reason entered when staff manually edits the remaining amount due.';
comment on column public.app_4c3a7a6153_rentals.amount_due_override_edited_by is
  'User id of the staff member who last edited the remaining amount due.';
comment on column public.app_4c3a7a6153_rentals.amount_due_override_edited_by_name is
  'Display name of the staff member who last edited the remaining amount due.';
comment on column public.app_4c3a7a6153_rentals.amount_due_override_previous_amount is
  'Previous remaining amount before the latest manual amount-due edit.';
comment on column public.app_4c3a7a6153_rentals.amount_due_override_edited_at is
  'Timestamp of the latest manual amount-due edit.';
