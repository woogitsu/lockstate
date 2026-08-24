-- The entitlement ledger's idempotency stops being a payment-webhook
-- privilege, and a concurrent redelivery stops being an exception
-- (issue #105 findings 6 and 7).
--
-- WHAT WAS WRONG, demonstrated by execution before this migration was
-- written. Both findings are about `record_entitlement_event()`, and they
-- are the same function's two halves of one contract -- "a redelivery
-- returns `duplicate` and writes nothing" -- so they are fixed together.
--
--   * FINDING 6. `entitlement_events_provider_event_key` is partial
--     (`where provider is not null`), so it keys the payment-webhook path
--     and nothing else. Three byte-identical `promotional` calls -- same
--     account, product, capability, quantity, `occurred_at`, actor and
--     reason -- returned `applied` three times with three distinct
--     `event_id`s, and the projection went to `grantedSaveSlots: 15`. The
--     same replay under `support-adjustment` and under `migration` produced
--     two rows each; seven rows and 31 slots from four distinct facts.
--     A REPLAY IS THEREFORE TWO DEFECTS AT ONCE, and they are worth keeping
--     apart because only one of them is bounded: the audit trail records a
--     grant that never happened (unbounded, and the thing the ledger
--     exists for), and the derived capacity inflates (bounded -- issue #105
--     separately confirms that `recompute_entitlement_projection()` clamps
--     at 45, so ten replays of a 25-slot grant produce 45 and not 250).
--     This migration fixes the duplicate row, which removes the inflation
--     as a consequence. It does not touch the clamp, which stays the last
--     line of defence for every other way a balance could be wrong.
--
--   * FINDING 7. A redelivery arriving while the original is still
--     in-flight raises instead of answering `duplicate`. This one is
--     DEMONSTRATED WITH TWO GENUINELY PARALLEL `psql` SESSIONS, which is
--     what issue #105's residual-risk section says was never done ("the
--     race behaviour of enforce_prison_slot_capacity and
--     record_entitlement_event is reasoned from the locking rather than
--     demonstrated"). Session A called the function inside an explicit
--     transaction and held it open; session B called it one second later
--     with the same `(provider, provider_event_id)`. B's dedup SELECT saw
--     nothing (A was uncommitted), B's INSERT then blocked on
--     `entitlement_events_provider_event_key` for three seconds, and the
--     moment A committed B raised `23505 duplicate key value violates
--     unique constraint "entitlement_events_provider_event_key"`. The
--     transcript is in the pull request for #105 findings 6, 7, 9 and 11.
--     Nothing was corrupted -- the index did its job and the ledger held
--     one row -- but the caller was told "your write failed" where the
--     function's own comment promises "return the original outcome, write
--     nothing", and a webhook handler that trusts that contract will retry
--     or alert on a redelivery that was in fact already applied.
--
-- NO DATA MIGRATES, and that is checkable rather than assumed. The unique
-- index below is the only thing here that could refuse existing rows, and
-- it can only do so if the ledger already holds two provider-less events
-- identical in every recorded field. `entitlement_events` has no writer
-- anywhere: no client role holds INSERT (see 20260823090000), the only
-- append path is this SECURITY DEFINER function, its EXECUTE is held by
-- `service_role` alone, and the Z2/Z3 service that would hold that role is
-- deliberately not built (ADR 0008; this repository contains no
-- `supabase/functions/` and no deployed worker). The table is therefore
-- empty on a scratch database and on the hosted staging project. If a
-- future project has rows, `create unique index` REFUSES rather than
-- deletes -- the failure is loud and no history is destroyed -- and the
-- operator's question is answered by:
--
--   select user_id, product_id, capability, event_type, source, quantity,
--          occurred_at, actor_kind, actor_id, reason, expires_at, count(*)
--     from public.entitlement_events where provider is null
--    group by 1,2,3,4,5,6,7,8,9,10,11 having count(*) > 1;
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`, plus the two-session run described above, with every
-- role-switched probe inside an explicit transaction block and `select
-- current_user` read back (issue #105's own note: `set local role` outside
-- a transaction silently no-ops and leaves the session privileged). NOT
-- executed against the real Supabase local stack or a hosted project; see
-- docs/CLOUD_SAVE.md, "What has and has not been executed".

-- --- 1. An idempotency key for the paths that had none ----------------
--
-- WHAT COUNTS AS THE SAME EVENT when there is no provider event id to key
-- on. Every field the ledger records about the fact, and nothing else:
-- account, product, capability, event type, source, quantity,
-- `occurred_at`, actor kind, actor id, reason and `expires_at`. The two
-- columns left out are the two that describe the *row* rather than the
-- fact -- `event_id` (server-generated per call) and `recorded_at`
-- (defaulted to `now()`) -- and excluding them is the entire point: they
-- are exactly what differs between a redelivery and the original.
--
-- The rule this expresses, and the reason it is defensible for an audit
-- trail: two rows identical in every field a human reading the ledger can
-- see are indistinguishable to that reader, so the second answers no
-- question the first did not, while doubling the capacity the projection
-- derives. `promotional`, `support-adjustment` and `migration` are all
-- machine-driven paths (a campaign runner, a staff tool, an import) whose
-- retry sends the same arguments again.
--
-- THE COST, STATED RATHER THAN HIDDEN. A caller who genuinely wants to
-- record two identical grants at the same microsecond now gets `duplicate`
-- for the second, and the second grant does not apply. The way to record
-- two separate facts is to let them differ in the field that actually
-- distinguishes them -- `occurred_at` (microsecond resolution, supplied by
-- the caller) or `reason` (which an audit trail wants distinct anyway:
-- "why does this account have ten slots" is answered by two reasons, not
-- by one reason twice). `reason` being part of the key is what makes that
-- escape hatch exist, and it is also the one field a sloppy caller could
-- vary by accident -- a reason string carrying a timestamp would defeat
-- this key. Nothing in the schema can prevent that; docs/TRUSTED_SERVICES.md
-- now says so where it describes the ledger contract.
--
-- `nulls not distinct` because `expires_at` is the one nullable column in
-- the list, and under the default NULLS DISTINCT two replays of a
-- never-expiring grant would each be unique -- which is the finding, not
-- the fix. Verified on the harness: with `nulls not distinct`, a second
-- `(1, null)` is refused; the migration would otherwise pass its own test
-- for expiring grants and fail for the common case.
--
-- `schema_version` is deliberately NOT in the key. Its CHECK constraint
-- pins it to 1 (`check (schema_version = 1)`), so it cannot distinguish
-- two rows today; the first migration that admits a version 2 has to
-- revisit this key, because two rows describing one fact under two schema
-- versions would then be a legitimate pair.
--
-- WHY NOT A MANDATORY CALLER-SUPPLIED KEY instead, which is the other
-- obvious shape. `provider`/`provider_event_id` is already a general
-- external-idempotency pair rather than a payment-only one -- verified by
-- execution: a `promotional` call supplying `('promo.campaign',
-- 'campaign-x')` deduplicates correctly today, because
-- `entitlement_events_webhook_requires_provider` requires the pair *for*
-- `payment-webhook` and forbids it for nobody. So the caller-supplied key
-- exists and callers should use it. Making it mandatory for every source
-- would mean a NOT NULL-shaped constraint change plus a matching change to
-- `entitlementEventSchema` (src/services/entitlements/events.ts), where
-- both fields are optional, and it would still leave a caller that forgets
-- to vary its key replaying cleanly. The natural key is the control that
-- holds when the caller gets it wrong, which is the only interesting case.
create unique index if not exists entitlement_events_natural_event_key
  on public.entitlement_events (
    user_id, product_id, capability, event_type, source, quantity,
    occurred_at, actor_kind, actor_id, reason, expires_at
  )
  nulls not distinct
  where provider is null;

-- --- 2. The function, made idempotent under concurrency ---------------
--
-- Three changes, and no change to the signature, the return shape or the
-- privileges: the `status` union stays `'applied' | 'duplicate'`, because
-- a concurrent redelivery is not a new outcome -- it is the outcome the
-- contract already names, arriving by a path that used to miss it.
--
--   (a) The dedup lookup covers whichever key the event carries, instead
--       of covering the provider path and skipping the rest.
--   (b) A per-key advisory lock, taken before the lookup, so two
--       concurrent redeliveries of the same event serialize and the second
--       one sees the first. Keyed on the dedup key itself and nothing
--       wider, so it serializes only redeliveries of the same event and
--       leaves every other append unaffected. This is the shape
--       20260824100100_harden_submit_challenge_evidence.sql uses for the
--       same class of problem, and the shape
--       `enforce_prison_slot_capacity()` uses per owner.
--   (c) The insert is wrapped in a handler that turns `unique_violation`
--       into the `duplicate` the contract promises, by looking the
--       original up again.
--
-- (c) IS NOT REDUNDANT WITH (b), and it is worth saying why, because "the
-- lock makes the handler dead code" is the obvious objection. The lock
-- serializes callers *of this function*; the unique indexes hold against
-- every writer. A future backfill, an admin session or a restore inserting
-- as the table owner takes no advisory lock, and a caller whose session
-- renders `timestamptz` differently (the lock key is built from a text
-- rendering, which depends on the `TimeZone` setting) computes a different
-- lock key for the same event. Both cases land on the index rather than on
-- the lock, and the handler is what makes the answer still be `duplicate`.
-- The lock is the fast path; the handler is the correct one.
--
-- CONCURRENCY CAVEAT, stated because this repository's residual-risk
-- sections are the reason it gets found: the retry works under READ
-- COMMITTED, where each statement takes a fresh snapshot and therefore
-- sees the row the concurrent transaction just committed. Under REPEATABLE
-- READ or SERIALIZABLE the re-lookup would run against the original
-- snapshot, find nothing and re-raise -- the correct behaviour for those
-- levels, where the right answer is to retry the whole transaction.
-- PostgREST and Supabase both run READ COMMITTED by default.
--
-- Two calls in one transaction, in opposite orders in two sessions, can
-- deadlock on the advisory locks; PostgreSQL detects that and raises
-- `40P01`. That is true of every per-key lock in this schema and is not
-- introduced here.
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
-- `pg_temp` explicitly last; see submit_challenge_evidence() for why every
-- SECURITY DEFINER function in this schema spells it out, and
-- supabase/tests/005_function_security_declarations.test.sql for what
-- fails if it is ever dropped or reordered.
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_event_id uuid;
  v_lock_key text;
  v_attempt int;
begin
  -- The lock key is the dedup key, rendered as a composite so the fields
  -- cannot run into each other: `row(...)::text` quotes and escapes each
  -- element, where `a || ':' || b` lets ('x:y', 'z') and ('x', 'y:z')
  -- collide. A collision would only over-serialize -- `hashtextextended`
  -- is 64-bit, so distinct keys can share a lock and nothing but
  -- throughput depends on them not doing so -- but a key that is wrong in
  -- a *systematic* way (every event of one shape sharing one lock) is
  -- worth not having.
  if p_provider is not null then
    v_lock_key := 'provider:' || row(p_provider, p_provider_event_id)::text;
  else
    v_lock_key := 'natural:' || row(
      p_user_id, p_product_id, p_capability, p_event_type, p_source, p_quantity,
      p_occurred_at, p_actor_kind, p_actor_id, p_reason, p_expires_at
    )::text;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  -- Two attempts: look, insert, and if a concurrent caller won the race
  -- between those two steps, look once more. The second lookup is the same
  -- code as the first, which is why this is a loop rather than a copied
  -- block -- a dedup lookup that drifts from its own retry is the kind of
  -- defect this schema keeps finding.
  for v_attempt in 1..2 loop
    if p_provider is not null then
      -- The provider's own event id is the key, on its own: a redelivery
      -- that disagrees with the original about quantity or reason is still
      -- the same event, and the original outcome is the honest answer.
      select e.event_id into v_existing
      from public.entitlement_events e
      where e.provider = p_provider
        and e.provider_event_id = p_provider_event_id
      order by e.recorded_at, e.event_id
      limit 1;
    else
      -- `is not distinct from` for `expires_at`, matching the index's
      -- `nulls not distinct`: `= null` is UNKNOWN, so the common case (a
      -- grant that never expires) would find nothing and fall through to
      -- an insert the index then refuses -- correct in the end, via the
      -- handler below, but by the slow path on every single replay.
      select e.event_id into v_existing
      from public.entitlement_events e
      where e.provider is null
        and e.user_id = p_user_id
        and e.product_id = p_product_id
        and e.capability = p_capability
        and e.event_type = p_event_type
        and e.source = p_source
        and e.quantity = p_quantity
        and e.occurred_at = p_occurred_at
        and e.actor_kind = p_actor_kind
        and e.actor_id = p_actor_id
        and e.reason = p_reason
        and e.expires_at is not distinct from p_expires_at
      -- Deterministic, and it matters for a ledger written before this
      -- index existed: if two identical rows are already there, the answer
      -- is the first one recorded, every time, rather than whichever the
      -- plan happened to return.
      order by e.recorded_at, e.event_id
      limit 1;
    end if;

    if v_existing is not null then
      -- Redelivery: return the original outcome, write nothing.
      return query select 'duplicate'::text, v_existing;
      return;
    end if;

    begin
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
      return;
    exception when unique_violation then
      -- A concurrent append committed this exact event between the lookup
      -- and the insert. Loop once to find it and answer `duplicate`.
      --
      -- NO SINGLE-SESSION ASSERTION REACHES THIS HANDLER, and rather than
      -- implying otherwise: disabling it leaves the whole pgTAP suite
      -- green, which the pull request for #105 findings 6, 7, 9 and 11
      -- reports as a surviving mutation. A pgTAP suite is one session, and
      -- the situation this answers needs two. It is not dead code -- the
      -- two-session race was run in all four combinations of this handler
      -- and the lock above, and either one alone answers `duplicate` while
      -- neither raises `23505`. The lock's existence and keying ARE
      -- asserted, through `pg_locks`, in suite 002.
      --
      -- On the second attempt, re-raise: the lookup has already failed to
      -- find a row for this key once after a `unique_violation`, so the
      -- violated constraint is not one of the two dedup keys and
      -- pretending otherwise would report `duplicate` for a write that was
      -- refused for an unrelated reason. `raise` with no arguments
      -- re-raises the original error unchanged, SQLSTATE and message
      -- included.
      if v_attempt = 2 then
        raise;
      end if;
    end;
  end loop;

  -- Unreachable: the loop body either returns or raises on its second
  -- pass. Spelled out because a plpgsql function that falls off the end of
  -- a `returns table` body returns zero rows, and a caller reading
  -- `status` from zero rows gets NULL rather than an error -- the silent
  -- shape this whole file is about.
  raise exception 'record_entitlement_event fell through its retry loop for account %', p_user_id;
end;
$$;

-- Privileges restated rather than assumed. `create or replace function`
-- preserves the existing ACL, and this schema spells every function
-- privilege out where the function is defined so a reader does not have to
-- open an earlier migration to learn who may call it. Unchanged from
-- 20260823090000: the browser has no path, direct or indirect, to mutate
-- an entitlement (ADR 0008 threat T4).
revoke execute on function public.record_entitlement_event(
  uuid, text, text, text, text, int, text, text, timestamptz, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.record_entitlement_event(
  uuid, text, text, text, text, int, text, text, timestamptz, text, text, text, timestamptz
) to service_role;
