create table if not exists public.workout_planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_planner_data enable row level security;

create or replace function public.set_workout_planner_updated_at()
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
    where tgrelid = 'public.workout_planner_data'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on public.workout_planner_data', trigger_name);
  end loop;
end;
$$;

create trigger set_workout_planner_updated_at
before update on public.workout_planner_data
for each row execute function public.set_workout_planner_updated_at();

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_planner_data'
  loop
    execute format('drop policy if exists %I on public.workout_planner_data', policy_name);
  end loop;
end;
$$;

create policy "FitNote data is readable by owner"
on public.workout_planner_data
for select
to authenticated
using (auth.uid() = user_id);

create policy "FitNote data is insertable by owner"
on public.workout_planner_data
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "FitNote data is updatable by owner"
on public.workout_planner_data
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "FitNote data is deletable by owner"
on public.workout_planner_data
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workout_planner_data to authenticated;
revoke all on public.workout_planner_data from anon;
