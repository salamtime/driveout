alter table public.app_4c3a7a6153_receive_funds_entries
  drop constraint if exists app_4c3a7a6153_receive_funds_entries_method_check;

alter table public.app_4c3a7a6153_receive_funds_entries
  add constraint app_4c3a7a6153_receive_funds_entries_method_check
  check (method in ('cash', 'bank_deposit', 'wire_transfer'));
