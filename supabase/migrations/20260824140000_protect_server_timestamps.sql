-- Stops a client setting the server's own creation timestamps (issue #194).
--
-- Reproduced as `authenticated` before this migration, inside an explicit
-- `begin; ... rollback;` with `select current_user` read back:
--
--   insert into public.profiles (id, created_at, updated_at)
--     values (..., '1970-01-01T00:00:00Z', '4000-01-01T00:00:00Z');
--   -->  created_at 1970-01-01 | updated_at 4000-01-01
--
--   insert into public.prisons (owner_id, game_version, slot_index,
--                               created_at, updated_at)
--     values (..., 'lockstate-dev', 0, '4000-01-01T00:00:00Z',
--             '1970-01-01T00:00:00Z');
--   -->  created_at 4000-01-01 | updated_at 1970-01-01
--
--   update public.profiles set updated_at = '1900-01-01T00:00:00Z' where ...;
--   -->  updated_at 1900-01-01
--
-- So `default now()` was a suggestion rather than a fact on four columns.
--
-- **The sharpest part is that `prisons` already states this intent and enforced
-- it in one direction only.** 20260822190100 says, above its UPDATE grant:
--
--   -- Editable prison metadata only. `id`, `owner_id`, `created_at` and the
--   -- two pointer columns are deliberately absent: a client has no reason to
--   -- rewrite an identity, an owner, a creation timestamp, or a revision
--   -- pointer that exists to be advanced transactionally.
--
-- That exclusion is real for UPDATE. The line above it grants **table-level
-- INSERT**, which covers every column, so the client set `created_at` on the
-- insert path. The rule was stated, correct, and enforced on one of the two
-- write paths -- this repository's signature defect shape, with the migration's
-- own comment as the statement of intent it failed to hold.
--
-- **SCOPE: `created_at` only.** Whether a client may set its own `updated_at`
-- is a real decision and it is #194's open half, deliberately untouched here:
-- `prisons` grants it on purpose, and the alternative is a `before update`
-- trigger setting it to `now()`, which is a choice about whether anything is
-- ever to trust that column for ordering. Every `updated_at` keeps exactly the
-- privileges it had. `user_settings` therefore needs no change at all -- it has
-- no `created_at`, and `updated_at` is the open question.
--
-- **It has to be revoke-then-grant, not a column-level REVOKE.** 20260822190100
-- already records why, and the reason is worth repeating because the obvious
-- approach silently does nothing: PostgreSQL cannot subtract a single column's
-- privilege out of a table-level grant, so `revoke insert (created_at) ... from
-- authenticated` leaves the table-level INSERT in place and the write still
-- succeeds.
--
-- **Nothing breaks.** Verified against the current tree: no code in `src/`
-- writes any of these columns. `registerPrison` writes
-- `{id, game_version, slot_index}` -- and is broken for an unrelated reason,
-- #192 -- while `uploadVersion` goes through `create_save_version()`, which is
-- `SECURITY DEFINER` and so bypasses column grants entirely. Policies are
-- unaffected: a policy decides which rows, never which columns.

-- `prisons`. The INSERT grant is kept rather than revoked in favour of
-- create_prison(), for the reason ADR 0013 gives and 20260822190100 records:
-- the slot cap is a count invariant of this table, enforced by a trigger on
-- every write path rather than by one blessed door whose exclusivity depends on
-- a grant staying revoked. supabase/tests/004_free_tier_capacity.test.sql
-- drives that refusal through this very grant, so it stays reachable -- it is
-- now per column instead of per table.
--
-- `owner_id` must be granted: the insert policy is `auth.uid() = owner_id` and
-- the column has no default, so a client has to supply it. `created_at` and the
-- two pointer columns are absent, matching the UPDATE grant exactly.
revoke insert on public.prisons from authenticated, anon;
grant insert (id, owner_id, game_version, display_name, slot_index, updated_at)
  on public.prisons to authenticated;

-- `profiles` had no column-level treatment at all, so both write paths covered
-- every column. `created_at` is absent from both lists below; everything a
-- client legitimately writes is present.
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, display_name, updated_at) on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
