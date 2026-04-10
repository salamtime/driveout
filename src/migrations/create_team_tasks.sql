begin;

create extension if not exists pgcrypto;

create table if not exists public.app_4c3a7a6153_team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_user uuid,
  assigned_user_name text,
  created_by uuid,
  created_by_name text,
  claimed_by uuid,
  claimed_by_name text,
  completed_by uuid,
  completed_by_name text,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'in_progress', 'done')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  linked_entity_type text
    check (linked_entity_type is null or linked_entity_type in ('vehicle', 'rental', 'maintenance')),
  linked_entity_id text,
  scheduled_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  comments jsonb not null default '[]'::jsonb,
  labels jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_4c3a7a6153_team_tasks
  add column if not exists labels jsonb not null default '[]'::jsonb;

do $$
declare
  priority_constraint_name text;
begin
  select c.conname
  into priority_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'app_4c3a7a6153_team_tasks'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%priority%'
  limit 1;

  if priority_constraint_name is not null then
    execute format(
      'alter table public.app_4c3a7a6153_team_tasks drop constraint %I',
      priority_constraint_name
    );
  end if;

  alter table public.app_4c3a7a6153_team_tasks
    add constraint team_tasks_priority_check
    check (priority in ('low', 'normal', 'medium', 'high', 'urgent'));
end $$;

create table if not exists public.app_4c3a7a6153_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.app_4c3a7a6153_team_tasks(id) on delete cascade,
  comment text not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_task_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.app_4c3a7a6153_team_tasks(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_tasks_status_idx
  on public.app_4c3a7a6153_team_tasks (status);

create index if not exists team_tasks_assigned_user_idx
  on public.app_4c3a7a6153_team_tasks (assigned_user);

create index if not exists team_tasks_scheduled_at_idx
  on public.app_4c3a7a6153_team_tasks (scheduled_at);

create index if not exists team_tasks_linked_entity_idx
  on public.app_4c3a7a6153_team_tasks (linked_entity_type, linked_entity_id);

create index if not exists task_comments_task_id_idx
  on public.app_4c3a7a6153_task_comments (task_id, created_at);

create index if not exists task_notifications_user_id_idx
  on public.app_4c3a7a6153_task_notifications (user_id, read_at, created_at desc);

alter table public.app_4c3a7a6153_team_tasks enable row level security;
alter table public.app_4c3a7a6153_task_comments enable row level security;
alter table public.app_4c3a7a6153_task_notifications enable row level security;

drop policy if exists team_tasks_select_authenticated on public.app_4c3a7a6153_team_tasks;
drop policy if exists team_tasks_insert_authenticated on public.app_4c3a7a6153_team_tasks;
drop policy if exists team_tasks_update_authenticated on public.app_4c3a7a6153_team_tasks;
drop policy if exists team_tasks_delete_authenticated on public.app_4c3a7a6153_team_tasks;

create policy team_tasks_select_authenticated
  on public.app_4c3a7a6153_team_tasks
  for select
  to authenticated
  using (true);

create policy team_tasks_insert_authenticated
  on public.app_4c3a7a6153_team_tasks
  for insert
  to authenticated
  with check (true);

create policy team_tasks_update_authenticated
  on public.app_4c3a7a6153_team_tasks
  for update
  to authenticated
  using (true)
  with check (true);

create policy team_tasks_delete_authenticated
  on public.app_4c3a7a6153_team_tasks
  for delete
  to authenticated
  using (true);

drop policy if exists task_comments_select_authenticated on public.app_4c3a7a6153_task_comments;
drop policy if exists task_comments_insert_authenticated on public.app_4c3a7a6153_task_comments;
drop policy if exists task_comments_update_own on public.app_4c3a7a6153_task_comments;
drop policy if exists task_comments_update_authenticated on public.app_4c3a7a6153_task_comments;
drop policy if exists task_comments_delete_authenticated on public.app_4c3a7a6153_task_comments;

create policy task_comments_select_authenticated
  on public.app_4c3a7a6153_task_comments
  for select
  to authenticated
  using (true);

create policy task_comments_insert_authenticated
  on public.app_4c3a7a6153_task_comments
  for insert
  to authenticated
  with check (true);

create policy task_comments_update_authenticated
  on public.app_4c3a7a6153_task_comments
  for update
  to authenticated
  using (true)
  with check (true);

create policy task_comments_delete_authenticated
  on public.app_4c3a7a6153_task_comments
  for delete
  to authenticated
  using (true);

drop policy if exists task_notifications_select_own on public.app_4c3a7a6153_task_notifications;
drop policy if exists task_notifications_insert_authenticated on public.app_4c3a7a6153_task_notifications;
drop policy if exists task_notifications_update_own on public.app_4c3a7a6153_task_notifications;

create policy task_notifications_select_own
  on public.app_4c3a7a6153_task_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy task_notifications_insert_authenticated
  on public.app_4c3a7a6153_task_notifications
  for insert
  to authenticated
  with check (true);

create policy task_notifications_update_own
  on public.app_4c3a7a6153_task_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Optional module-permission seed. Some deployments use this access table,
-- while others store module permissions directly on the user profile JSON.
do $$
begin
  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_users') is not null then
    update public.app_b30c02e74da644baad4668e3587d86b1_users
    set
      permissions = coalesce(permissions::jsonb, '{}'::jsonb) || jsonb_build_object('Team Tasks', true),
      updated_at = now()
    where coalesce(role, 'employee') in ('owner', 'admin', 'employee');
  end if;

  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_user_module_access') is not null then
    insert into public.app_b30c02e74da644baad4668e3587d86b1_user_module_access (
      user_id,
      module_name,
      has_access,
      created_at,
      updated_at
    )
    select
      u.id,
      'Team Tasks',
      case when u.role in ('owner', 'admin', 'employee') then true else false end,
      now(),
      now()
    from public.app_b30c02e74da644baad4668e3587d86b1_users u
    on conflict (user_id, module_name) do nothing;
  end if;
end $$;

commit;
