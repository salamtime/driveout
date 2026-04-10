alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists address text,
  add column if not exists date_of_birth date,
  add column if not exists emergency_contact text,
  add column if not exists emergency_phone text,
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists staff_id_documents jsonb not null default '[]'::jsonb;

update public.app_b30c02e74da644baad4668e3587d86b1_users
set
  username = coalesce(
    nullif(username, ''),
    nullif(
      regexp_replace(
        lower(
          coalesce(
            nullif(split_part(email, '@', 1), ''),
            nullif(replace(trim(coalesce(full_name, '')), ' ', '.'), ''),
            'user'
          )
        ),
        '[^a-z0-9._-]+',
        '',
        'g'
      ),
      ''
    )
  ),
  first_name = coalesce(
    nullif(first_name, ''),
    nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '')
  ),
  last_name = coalesce(
    nullif(last_name, ''),
    nullif(
      trim(
        substr(
          trim(coalesce(full_name, '')),
          length(split_part(trim(coalesce(full_name, '')), ' ', 1)) + 1
        )
      ),
      ''
    )
  )
where coalesce(full_name, '') <> '';

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  drop constraint if exists app_users_username_format_check;

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add constraint app_users_username_format_check
  check (
    username is null
    or username ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$'
  );

create index if not exists idx_app_users_first_name
  on public.app_b30c02e74da644baad4668e3587d86b1_users (first_name);

create index if not exists idx_app_users_last_name
  on public.app_b30c02e74da644baad4668e3587d86b1_users (last_name);

create unique index if not exists idx_app_users_username_unique
  on public.app_b30c02e74da644baad4668e3587d86b1_users (lower(username))
  where username is not null;
