create table if not exists public.fitnote_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fitnote_data enable row level security;

create or replace function public.set_fitnote_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  trigger_name text;
begin
  for trigger_name in
    select tgname
    from pg_trigger
    where tgrelid = 'public.fitnote_data'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on public.fitnote_data', trigger_name);
  end loop;
end;
$$;

create trigger set_fitnote_updated_at
before update on public.fitnote_data
for each row execute function public.set_fitnote_updated_at();

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fitnote_data'
  loop
    execute format('drop policy if exists %I on public.fitnote_data', policy_name);
  end loop;
end;
$$;

create policy "FitNote data is readable by owner"
on public.fitnote_data
for select
to authenticated
using (auth.uid() = user_id);

create policy "FitNote data is insertable by owner"
on public.fitnote_data
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "FitNote data is updatable by owner"
on public.fitnote_data
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "FitNote data is deletable by owner"
on public.fitnote_data
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.fitnote_data to authenticated;
revoke all on public.fitnote_data from anon;

do $$
begin
  if to_regclass('public.workout_planner_data') is not null then
    insert into public.fitnote_data (user_id, payload, created_at, updated_at)
    select user_id, payload, created_at, updated_at
    from public.workout_planner_data
    on conflict (user_id) do nothing;
  end if;
end;
$$;
