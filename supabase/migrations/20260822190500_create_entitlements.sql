-- Account entitlements (e.g. paid save-slot expansion). Client-readable,
-- never client-writable: AGENTS.md/ARCHITECTURE.md require trusted
-- mutations of entitlements to happen server-side (a future Supabase Edge
-- Function or Cloudflare Worker with the service-role key, never the
-- browser). This migration only grants SELECT.
create table if not exists public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.entitlements enable row level security;

create policy "entitlements_select_own"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- SELECT is granted explicitly: Supabase no longer auto-exposes new
-- `public` tables to the Data API roles (see the prisons migration), so
-- without this the policy above is unreachable code.
grant select on public.entitlements to authenticated;

-- No insert/update/delete policy exists for `authenticated`/`anon`, and any
-- table-level write grant a legacy auto-exposing project would have applied
-- is revoked outright so there is no ambient write path to close later.
revoke insert, update, delete on public.entitlements from authenticated, anon;
