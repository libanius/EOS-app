-- Circle join-request / approval flow (D-040).
--
-- Until now, POST /api/circles/join inserted a circle_members row immediately
-- (instant join). The spec (docs/12-circle-model.md "Fluxo de convite") calls for
-- the Admin to approve: entering a code / requesting → pending request → Admin
-- approves → member added. This table holds those pending requests.

create table if not exists public.circle_join_requests (
  id           uuid        primary key default uuid_generate_v4(),
  circle_id    uuid        not null references public.circles(id)  on delete cascade,
  requester_id uuid        not null references auth.users(id)      on delete cascade,
  status       text        not null default 'pending' check (status in ('pending','approved','rejected')),
  message      text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid        references auth.users(id) on delete set null,
  unique (circle_id, requester_id)
);

create index if not exists circle_join_requests_circle_idx    on public.circle_join_requests (circle_id, status);
create index if not exists circle_join_requests_requester_idx on public.circle_join_requests (requester_id);

alter table public.circle_join_requests enable row level security;

-- The requester can create and see their own requests. Admin reads/decisions go
-- through the service-role client in the API (after verifying Admin in app code),
-- so no admin RLS policy is needed here (avoids the circle_members recursion class).
drop policy if exists "join_requests: requester manages own" on public.circle_join_requests;
create policy "join_requests: requester manages own"
  on public.circle_join_requests
  for all
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid());
