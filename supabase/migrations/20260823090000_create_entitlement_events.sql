-- Append-only entitlement ledger and the trusted recompute path that
-- derives public.entitlements from it (issue #36, ADR 0008/0009 trust
-- boundary; mirrored in src/services/entitlements/).
--
-- The existing entitlements table (20260822190500) is SELECT-only for
-- clients. This migration adds the *why*: an auditable event log that is
-- the source of truth, with entitlements demoted to a derived projection
-- that is never written independently.
--
-- EXECUTED against PostgreSQL 16.13 via `pnpm verify:sql` (see
-- scripts/verify-supabase-sql.mjs), covered by
-- supabase/tests/002_entitlement_ledger_and_challenges.test.sql. That runs
-- against a plain Postgres prepared with a Supabase compatibility harness,
-- not the real stack -- see docs/TRUSTED_SERVICES.md for what that does and
-- does not prove.

create table if not exists public.entitlement_events (
  event_id uuid primary key default gen_random_uuid(),
  schema_version int not null default 1 check (schema_version = 1),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null check (char_length(product_id) between 1 and 128),
  -- Capability and quantity are resolved at write time and stored here, so
  -- replaying history never depends on the *current* product catalog.
  capability text not null check (capability in ('save-slots')),
  event_type text not null check (event_type in ('grant', 'revoke')),
  source text not null check (source in ('payment-webhook', 'promotional', 'support-adjustment', 'migration')),
  quantity int not null check (quantity between 1 and 25),
  provider text check (char_length(provider) between 1 and 128),
  provider_event_id text check (char_length(provider_event_id) between 1 and 128),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_kind text not null check (actor_kind in ('provider', 'staff', 'system')),
  actor_id text not null check (char_length(actor_id) between 1 and 128),
  reason text not null check (char_length(reason) between 1 and 200),
  expires_at timestamptz,
  constraint entitlement_events_provider_pair
    check ((provider is null) = (provider_event_id is null)),
  constraint entitlement_events_webhook_requires_provider
    check (source <> 'payment-webhook' or provider is not null),
  constraint entitlement_events_expiry_after_occurrence
    check (expires_at is null or expires_at > occurred_at)
);

-- Idempotency for the payment webhook path (ADR 0008 threat T6): a
-- redelivered provider event cannot create a second grant. Enforced by the
-- database, not only by the application, because "we checked first" is a
-- race, while a unique index is not.
create unique index if not exists entitlement_events_provider_event_key
  on public.entitlement_events (provider, provider_event_id)
  where provider is not null;

-- Fold order (src/services/entitlements/events.ts compareEntitlementEvents).
create index if not exists entitlement_events_account_order_idx
  on public.entitlement_events (user_id, occurred_at, event_id);

alter table public.entitlement_events enable row level security;

-- Players may read their own audit trail: an entitlement a player cannot
-- see the reason for is indistinguishable from one we invented.
create policy "entitlement_events_select_own"
  on public.entitlement_events for select
  using (auth.uid() = user_id);

-- No client write path of any kind: no policy, and the default table
-- grants Supabase applies are revoked so there is nothing to close later.
revoke insert, update, delete on public.entitlement_events from authenticated, anon;

-- Append-only in the strong sense: even a privileged connection cannot
-- edit history, because correcting a mistake means appending a
-- compensating event that stays visible in the audit trail.
--
-- Only UPDATE is blocked by trigger. DELETE is left to the `on delete
-- cascade` from auth.users so account deletion (and the data-deletion
-- obligation in docs/TELEMETRY.md) still works; no role handed to a client
-- holds the DELETE grant.
create or replace function public.reject_entitlement_event_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'entitlement_events is append-only; append a compensating event instead of editing %', old.event_id;
end;
$$;

drop trigger if exists entitlement_events_no_update on public.entitlement_events;
create trigger entitlement_events_no_update
  before update on public.entitlement_events
  for each row execute function public.reject_entitlement_event_update();

-- The projection needs a freshness marker of its own; `granted_at` records
-- the first grant, not the last recomputation.
alter table public.entitlements
  add column if not exists updated_at timestamptz not null default now();

-- Recomputes the derived projection for one account.
--
-- This loop deliberately mirrors `foldEntitlementEvents`
-- (src/services/entitlements/ledger.ts) step for step -- ordered by
-- (occurred_at, event_id), clamping the running balance at zero after each
-- event. A set-based `sum(grants) - sum(revokes)` would be simpler and
-- *wrong*: it disagrees with the ordered fold whenever a revoke precedes
-- the grant it offsets, and a projection that disagrees with the client's
-- own fold is worse than a slower one.
create or replace function public.recompute_entitlement_projection(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_balances jsonb := '{}'::jsonb;
  v_current int;
  v_save_slots int := 0;
  v_ledger_revision int := 0;
  v_now timestamptz := now();
begin
  -- Matches `ledgerRevision` in the TypeScript fold: every effective event
  -- for the account, not only the save-slot ones.
  select count(*) into v_ledger_revision
  from public.entitlement_events
  where user_id = p_user_id
    and occurred_at <= v_now;

  for v_event in
    select product_id, event_type, quantity, expires_at
    from public.entitlement_events
    where user_id = p_user_id
      and occurred_at <= v_now
      and capability = 'save-slots'
    order by occurred_at, event_id
  loop
    v_current := coalesce((v_balances ->> v_event.product_id)::int, 0);

    if v_event.event_type = 'grant' then
      -- An expired grant contributes nothing; expiry is evaluated here
      -- rather than by a background job that could fall behind.
      if v_event.expires_at is null or v_event.expires_at > v_now then
        v_current := v_current + v_event.quantity;
      end if;
    else
      v_current := greatest(0, v_current - v_event.quantity);
    end if;

    v_balances := jsonb_set(v_balances, array[v_event.product_id], to_jsonb(v_current), true);
  end loop;

  select coalesce(sum(entry.value::int), 0)
    into v_save_slots
  from jsonb_each_text(v_balances) as entry(key, value);

  -- Same ceiling as MAX_TOTAL_SAVE_SLOTS - BASE_SAVE_SLOTS in
  -- src/services/entitlements/products.ts: a bug or a hostile event stream
  -- can inflate capacity by at most this much, never without bound.
  v_save_slots := least(45, greatest(0, v_save_slots));

  insert into public.entitlements (user_id, key, value, granted_at, updated_at)
  values (
    p_user_id,
    'save-slots',
    jsonb_build_object('grantedSaveSlots', v_save_slots, 'ledgerRevision', v_ledger_revision),
    v_now,
    v_now
  )
  on conflict (user_id, key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;
end;
$$;

-- Records one ledger event and refreshes the projection atomically.
--
-- Server-side only: EXECUTE is revoked from every client-facing role, so
-- this is reachable from a trusted function (Supabase Edge Function or
-- Cloudflare Worker holding the service role) and from nowhere else. The
-- browser never has a path -- direct or indirect -- to mutate an
-- entitlement (ADR 0008 threat T4).
create or replace function public.record_entitlement_event(
  p_user_id uuid,
  p_product_id text,
  p_capability text,
  p_event_type text,
  p_source text,
  p_quantity int,
  p_provider text,
  p_provider_event_id text,
  p_occurred_at timestamptz,
  p_actor_kind text,
  p_actor_id text,
  p_reason text,
  p_expires_at timestamptz
) returns table (
  status text, -- 'applied' | 'duplicate'
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_event_id uuid;
begin
  if p_provider is not null then
    select e.event_id into v_existing
    from public.entitlement_events e
    where e.provider = p_provider
      and e.provider_event_id = p_provider_event_id;

    if v_existing is not null then
      -- Redelivery: return the original outcome, write nothing.
      return query select 'duplicate'::text, v_existing;
      return;
    end if;
  end if;

  insert into public.entitlement_events (
    user_id, product_id, capability, event_type, source, quantity,
    provider, provider_event_id, occurred_at, actor_kind, actor_id, reason, expires_at
  ) values (
    p_user_id, p_product_id, p_capability, p_event_type, p_source, p_quantity,
    p_provider, p_provider_event_id, p_occurred_at, p_actor_kind, p_actor_id, p_reason, p_expires_at
  )
  returning entitlement_events.event_id into v_event_id;

  perform public.recompute_entitlement_projection(p_user_id);
  return query select 'applied'::text, v_event_id;
end;
$$;

revoke execute on function public.recompute_entitlement_projection(uuid) from public, anon, authenticated;
revoke execute on function public.record_entitlement_event(
  uuid, text, text, text, text, int, text, text, timestamptz, text, text, text, timestamptz
) from public, anon, authenticated;
