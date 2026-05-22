create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  user_name text,
  amount numeric(12,2) not null check (amount > 0),
  proof_url text not null,
  proof_path text,
  note text,
  review_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  wallet_account_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wallet_topups_user_id_idx
  on public.wallet_topups(user_id, created_at desc);

create index if not exists wallet_topups_status_idx
  on public.wallet_topups(status, created_at desc);

create index if not exists wallet_topups_user_email_idx
  on public.wallet_topups(lower(user_email));

grant select, insert, update, delete on public.wallet_topups to service_role;

notify pgrst, 'reload schema';
