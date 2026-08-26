-- The server stamps `updated_at` on `prisons`, `profiles` and `user_settings`
-- (issue #194's open half, decided).
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`,
-- and pinned by supabase/tests/001_rls_and_save_version_rpc.test.sql (the
-- behaviour), 003_data_api_grants.test.sql (the grants and the `default now()`
-- rule), 005_function_security_declarations.test.sql (the trigger function's
-- declaration) and 008_scalar_column_constraint_coverage.test.sql (the three
-- allow-list entries this forces to be reclassified). NOT executed against the
-- real Supabase local stack or a hosted project; see docs/CLOUD_SAVE.md, "What
-- has and has not been executed".
--
-- THE DECISION. #194 asked whether a client may stamp its own `updated_at` on
-- these three tables, and named the two answers: a `before update` trigger that
-- overwrites whatever the client sent, or leaving the column client-writable so
-- an offline-first client can report when the user actually acted. The answer is
-- the first, and it is recorded as a rule in ADR 0008 section 2 rather than only
-- as this migration, because the question is asked again by every table that
-- gets a timestamp: **authority over a row is not authority over the record of
-- when it was written.** A `created_at`/`updated_at` column is not the row's
-- content; it is the server's statement about the write. So its authority is Z2
-- even where the payload's authority is Z0/Z1, and ADR 0008 section 2's
-- "saves, settings -- client-authoritative" row is about content.
--
-- WHY THE CLIENT-WRITABLE ANSWER LOST, and neither reason is an argument from
-- principle -- both were executed.
--
-- 1. The reconciliation it would serve is prohibited. `src/persistence/cloud/
--    sync-engine.ts` states the contract: "silent last-write-wins is
--    prohibited". Ordering is `prisons.current_revision`, advanced
--    transactionally inside `create_save_version()`, and a client cannot write
--    it -- reproduced as `authenticated` inside an explicit `begin; ...
--    rollback;` with `select current_user` read back:
--      update public.prisons set current_revision = 999 where id = ...;
--      -->  ERROR: permission denied for table prisons        (42501)
--    Conflicts are surfaced to the user (`resolveSyncConflict`), never resolved
--    by comparing timestamps. A client-supplied edit time therefore has no
--    consumer in the design as it stands and exactly one prohibited use.
--
-- 2. Without a trigger the column was not merely untrustworthy, it was *wrong*.
--    `default now()` fires on INSERT and never again, and nothing stamped it on
--    UPDATE, so an UPDATE that did not name `updated_at` left it at the insert
--    value. Reproduced as `authenticated`:
--
--      insert into public.user_settings (user_id, settings_schema_version, payload)
--        values (..., 1, '{"a":1}');
--      update public.user_settings set updated_at = '2020-01-01T00:00:00Z' where ...;
--      update public.user_settings set payload = '{"a":2}' where ...;
--      -->  payload {"a": 2} | updated_at 2020-01-01 00:00:00+00 | wall clock 2026-08-26
--
--    Nothing in `src/` names the column (`SupabaseCloudSaveClient` selects
--    `game_version`, `current_version_id`, `id`, `revision`, `checksum` and
--    `created_at`, and writes `profiles`/`user_settings` not at all), so nothing
--    was keeping it current. The choice was never "trustworthy versus
--    client-known"; it was "trustworthy versus stale".
--
-- WHAT THE FORGERY COULD ACTUALLY DO, ranked honestly, because #194 asks and
-- the answer bounds the severity. Reproduced as `authenticated`: an INSERT
-- stamping `updated_at` at 4000-01-01 and an UPDATE walking it back to
-- 1900-01-01 both succeeded on all three tables.
--   * Not cross-tenant. Every policy on these tables scopes both USING and WITH
--     CHECK to `auth.uid()`, read back from `pg_policies`, so a forged value
--     reaches only the forger's own row. ADR 0008 section 2's "forging it only
--     affects the forger" holds.
--   * Not audit-trail forgery. The audit trail is `entitlement_events`, which is
--     append-only, server-stamped (`recorded_at`, no client grant) and reachable
--     only through `record_entitlement_event()`.
--   * The real exposure is a *future* reader: a retention or cleanup job keyed
--     on `updated_at` (docs/CLOUD_SAVE.md names "cleanup of abandoned anonymous
--     accounts" as open work, ADR 0013 sections 5-6), a "last synced" figure
--     shown to a player, or a settings sync that grows a reconciliation rule.
--     Each would inherit a number the client chose, and the first of those is a
--     row that outlives its cleanup by being stamped in the year 4000.
-- LATENT, then, and the reason to close it now is that the column becomes
-- load-bearing in the commit that first reads it, not in the commit that first
-- writes it.
--
-- THE ALTERNATIVE, AND THE DOOR LEFT OPEN. If a client-side edit time is ever
-- needed -- two devices editing settings offline is the case #194's comment
-- raises, and it is a real one -- it gets its own column named for what it is
-- (`client_edited_at`), so a reader of the value can see whose claim it is
-- without going to look at a grant. Overloading `updated_at` to mean both is
-- what makes a timestamp untrustworthy at the point of use.
--
-- BOTH HALVES, and this is deliberate rather than belt-and-braces. The trigger
-- makes the column *correct* (it was stale on UPDATE). Removing it from the
-- grants makes a client that sends one fail loudly with `42501` rather than be
-- silently corrected, which is how this schema already treats every other
-- column a client has no business writing: suite 001 asserts `42501` for
-- `prisons.current_revision` and `prisons.current_version_id` rather than
-- asserting that a write to them is ignored. A silent correction is a value the
-- client believes it set and the server did not.
--
-- IT HAS TO BE REVOKE-THEN-GRANT. 20260822190100 records why and it is worth
-- repeating because the obvious form silently does nothing: PostgreSQL cannot
-- subtract one column's privilege out of a table-level grant, so
-- `revoke update (updated_at) ... from authenticated` leaves the table-level
-- UPDATE in place and the PATCH still succeeds. Verified here in the other
-- direction too, because this migration relies on it: a plain
-- `revoke insert, update on public.prisons from authenticated` *does* clear the
-- per-column grants 20260824140000 left, so each list below is re-granted in
-- full rather than edited.
--
-- SCOPE: `updated_at` only. `user_settings` keeps `user_id` in its UPDATE list
-- even though the `prisons` and `profiles` grants exclude their identity columns
-- on the argument that "a client has no reason to rewrite an identity"
-- (20260822190100). Taking it away would be a second, unrelated tightening
-- decided inside a migration about timestamps, and it takes away nothing:
-- `user_settings_update_own`'s WITH CHECK already refuses any value other than
-- `auth.uid()`, so the only write it permits is a no-op. Recorded here so it
-- reads as noticed rather than as an oversight.
--
-- NOTHING BREAKS. Verified against the current tree: no code in `src/` writes
-- any of these three columns, or writes `profiles` or `user_settings` at all.
-- `registerPrison` goes through `create_prison()` and `uploadVersion` through
-- `create_save_version()`; both are `SECURITY DEFINER` and so bypass column
-- grants entirely, and neither names `updated_at`.

-- --- The stamp -------------------------------------------------------------
--
-- One function for three tables rather than three functions: the body is the
-- rule, and a rule written once cannot drift between the tables it applies to.
--
-- SECURITY INVOKER, unlike the DEFINER trigger functions in this schema. It
-- reads and writes nothing but `NEW`, so there is no relation for a caller to
-- shadow and nothing for definer rights to reach. `search_path` is pinned
-- anyway, because suite 005 requires every trigger function in `public` to pin
-- one and 20260824090000 gives the reason: the omission is invisible until the
-- day a body is reworked, and the migration that reworks it is not where anyone
-- remembers to add a `set` clause.
--
-- `now()` rather than `clock_timestamp()`: transaction time is what the
-- `default now()` it replaces meant, so two rows written by one statement carry
-- one timestamp.
create or replace function public.stamp_updated_at()
returns trigger
language plpgsql
-- `pg_temp` explicitly last; see submit_challenge_evidence() for why.
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A function with no explicit ACL is executable by PUBLIC, and Supabase's
-- `alter default privileges ... revoke execute on functions` drops only the
-- three roles' own grant. Spelled the same way as every other function
-- privilege here (20260824090000): `public` first, then each role by name.
revoke all on function public.stamp_updated_at() from public, anon, authenticated, service_role;

-- `before insert or update`, not `before update`. The INSERT half is what makes
-- the column's value the server's on both write paths, which is the asymmetry
-- 20260824140000 was written to close for `created_at`: a rule enforced on one
-- of two write paths is this repository's signature defect shape.
--
-- No `of updated_at` column list: the trigger must fire on an UPDATE that does
-- not mention the column, because that is the case in which the column went
-- stale.
drop trigger if exists prisons_stamp_updated_at on public.prisons;
create trigger prisons_stamp_updated_at
  before insert or update on public.prisons
  for each row execute function public.stamp_updated_at();

drop trigger if exists profiles_stamp_updated_at on public.profiles;
create trigger profiles_stamp_updated_at
  before insert or update on public.profiles
  for each row execute function public.stamp_updated_at();

drop trigger if exists user_settings_stamp_updated_at on public.user_settings;
create trigger user_settings_stamp_updated_at
  before insert or update on public.user_settings
  for each row execute function public.stamp_updated_at();

-- --- The grants ------------------------------------------------------------
--
-- Each list is 20260824140000's list minus `updated_at`. `anon` is named in
-- every revoke for the reason 20260822190100 gives: a revoke has to name the
-- role that might hold the privilege on a project created before Supabase
-- stopped auto-exposing new entities in `public`.
revoke insert, update on public.prisons from authenticated, anon;
grant insert (id, owner_id, game_version, display_name, slot_index)
  on public.prisons to authenticated;
grant update (display_name, game_version, slot_index)
  on public.prisons to authenticated;

revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- `user_settings` had table-level INSERT and UPDATE, which 20260824140000 left
-- alone because this table has no `created_at`. Per column now, for the first
-- time: the two writable columns plus the key.
revoke insert, update on public.user_settings from authenticated, anon;
grant insert (user_id, settings_schema_version, payload)
  on public.user_settings to authenticated;
grant update (user_id, settings_schema_version, payload)
  on public.user_settings to authenticated;
