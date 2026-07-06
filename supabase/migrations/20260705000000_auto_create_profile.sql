-- Auto-create a profiles row for every new auth user.
--
-- Root cause (D-038): a user who signs up but never completes onboarding
-- (e.g. password login → /scenario) had no profiles row. Any route that does
-- `profiles.single()` or inserts with a `profile_id` FK then failed:
--   - "Cannot coerce the result to a single JSON object" (0 rows)
--   - "violates foreign key constraint ..._profile_id_fkey"
--
-- Defense in depth: the app also self-heals via lib/ensure-profile.ts, but this
-- trigger guarantees the invariant at the database level for all future signups.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create profiles for any existing auth users that lack one.
insert into public.profiles (id, name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Usuário'
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
