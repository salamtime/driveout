alter table public.shared_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_messages'
  ) then
    alter publication supabase_realtime
    add table public.shared_messages;
  end if;
end
$$;
