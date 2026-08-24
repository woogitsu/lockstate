-- `save_versions.storage_path` gets a shape, and a per-owner prefix it
-- cannot escape (issue #105 finding 11).
--
-- WHAT WAS WRONG, by execution, as `authenticated` through
-- `create_save_version()` (the only write path to this table), inside an
-- explicit transaction block with `select current_user` read back. Every
-- one of these was ACCEPTED and stored verbatim, each as a `created`
-- version of the caller's own prison:
--
--   /etc/passwd                                          (absolute)
--   ../../../../etc/shadow                               (traversal)
--   <another account's uuid>/prison/1.json               (another owner's prefix)
--   https://evil.test/x?a=1#f                            (a URL, query and fragment included)
--   ..\..\win\nsecond-line                               (backslashes and a newline)
--   %2e%2e%2fetc%2fpasswd                                (percent-encoded traversal)
--   ''                                                   (the empty string)
--   repeat('a', 1048576)                                 (a 1 MiB path, stored in full)
--
-- The column was `text` with no constraint of any kind, and the RPC passes
-- `p_storage_path` through untouched.
--
-- WHAT THIS IS AND IS NOT. It is a constraint on a column that nothing
-- writes yet: `SupabaseCloudSaveClient.uploadVersion` passes
-- `p_storage_path: null` on every call, `downloadVersion` throws on any row
-- that has one, and -- the half that is deliberately NOT fixed here -- THERE
-- IS STILL NO STORAGE BUCKET AND NO STORAGE POLICY ANYWHERE IN
-- `supabase/migrations/`. Creating one is infrastructure this repository
-- does not have: ADR 0013 treats the JSONB-vs-Storage threshold as a
-- documented *candidate* pending benchmark evidence rather than an accepted
-- decision, so choosing a bucket, its visibility and its object layout
-- would pre-empt that ADR from inside a hardening migration. The bucket
-- remains absent, and this file is the column's half only.
--
-- Which makes the value of landing it now worth stating honestly: the
-- constraint cannot be violated today because nothing writes the column
-- today. What it buys is that the shape is decided, enforced and asserted
-- *before* the first writer exists, rather than being remembered
-- afterwards -- the same argument 20260823100000 makes for putting the
-- payload bound on the table rather than in the one function that writes
-- it.
--
-- WHY THE PREFIX IS THE OWNER'S UUID AND NOT A LAYOUT. `<owner-uuid>/…` is
-- the shape any per-owner Storage rule has to have -- Supabase's own
-- object policies are written as `(storage.foldername(name))[1] =
-- auth.uid()::text` -- so requiring the first segment to be the owning
-- account and saying nothing about what follows is the least this can
-- constrain while still being a boundary. Depth, file naming, extension
-- and bucket are all left open, because those are the parts a Storage
-- decision gets to make.
--
-- NO DATA MIGRATES -- but unlike the other two migrations for #105's
-- remaining findings, that is a claim about a table that CAN be populated,
-- so it is stated as a condition rather than as a fact. `save_versions`
-- holds real rows wherever cloud save has been used; what it cannot hold is
-- a row with a non-null `storage_path` written by this repository's client,
-- which only ever sends null. A row with one could only come from a caller
-- driving the RPC directly (a hostile or hand-run PostgREST call), and on a
-- populated project the `alter table ... add constraint` below then REFUSES
-- TO APPLY rather than rewriting or deleting anything: the migration fails,
-- loudly, and no history is lost. The operator's question is answered by
--
--   select id, prison_id, storage_path from public.save_versions
--    where storage_path is not null;
--
-- and the decision about any row it returns -- rewrite it, or drop the
-- version -- is a data decision that belongs to whoever holds the project,
-- not to this file. `NOT VALID` was considered and rejected for the
-- opposite reason: it would let exactly those rows survive unchecked while
-- the constraint's name says the column is validated, which is the
-- "constraint that names a contract and enforces a different one" defect
-- 20260824100000 was written to remove.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`, with every role-switched probe inside an explicit
-- transaction block and `select current_user` read back. NOT executed
-- against the real Supabase local stack or a hosted project, and NOTHING
-- here has been exercised against Supabase Storage, which does not exist in
-- this schema; see docs/CLOUD_SAVE.md, "What has and has not been
-- executed".

-- --- 1. The shape -----------------------------------------------------
--
-- A CHECK, because it looks at a single row and nothing else -- the test
-- 20260823100000 uses to decide that `byte_size >= 0` is a CHECK while the
-- payload bound is a trigger. A CHECK is also the stronger of the two
-- available shapes: it cannot be disabled the way a trigger can (`alter
-- table ... disable trigger`, `session_replication_role = 'replica'`, both
-- routine during a bulk load or a restore), and it is re-validated by any
-- future `ALTER TABLE ... VALIDATE`.
--
-- READ THE REGEX AS FOUR RULES:
--
--   ^[0-9a-f]{8}-…-[0-9a-f]{12}   the first segment is a lowercase-hex
--                                 UUID -- the owner prefix. `uuid::text`
--                                 renders lowercase in PostgreSQL, so the
--                                 trigger below can compare without
--                                 folding case, and an uppercase spelling
--                                 of the same owner is refused rather than
--                                 quietly creating a second prefix for one
--                                 account.
--   (/…)+                         at least one further segment, so the
--                                 prefix alone is not an object key.
--   [A-Za-z0-9]                   every segment starts with an
--                                 alphanumeric. This is what makes `..`
--                                 and `.` unrepresentable AS SEGMENTS
--                                 (traversal), and dot-files
--                                 (`<owner>/.env`) with them.
--   [A-Za-z0-9._-]*               and continues in that alphabet only. No
--                                 `/` runs (`//` is an empty segment and
--                                 cannot match), no leading or trailing
--                                 `/` (absolute paths and trailing
--                                 separators), no `\`, no whitespace or
--                                 control characters (the newline probe
--                                 above), no `%` (so `%2e%2e%2f` cannot
--                                 smuggle a traversal past a consumer that
--                                 URL-decodes), and none of `:?#&`, which
--                                 is what stops the URL probe.
--
-- Dots INSIDE a segment stay legal (`c.tar.zst`, and `a..b` with them),
-- because a filename is not a traversal; `..` only means "parent" when it
-- is the whole segment, which this cannot express. Verified case by case
-- on the harness against the eight accepted probes above plus the
-- near-misses (`<owner>/../x`, `<owner>/./x`, `<owner>//x`, `<owner>/x/`,
-- `<owner>` alone, `<owner>/.env`, a space, a tab, an uppercase uuid).
--
-- 512 CHARACTERS, because the 1 MiB path above was stored in full and a
-- storage key that long is not a path -- S3-compatible object keys are
-- capped around 1024 bytes, and every plausible layout under one owner
-- prefix fits in a fraction of 512. `char_length` rather than
-- `octet_length` is exact here rather than approximate, because the
-- alphabet above is ASCII-only, so the two agree. This bounds ONE column
-- as part of giving it a shape; #105 finding 4 -- that every other
-- client-writable text/jsonb column in this schema is unbounded -- is a
-- wider problem needing a per-column judgement and is deliberately not
-- addressed here.
alter table public.save_versions
  add constraint save_versions_storage_path_shape check (
    storage_path is null
    or (
      char_length(storage_path) <= 512
      and storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9][A-Za-z0-9._-]*)+$'
    )
  );

-- --- 2. The prefix is the owner's, not merely some owner's -------------
--
-- The CHECK above can say "the first segment is a UUID"; it cannot say
-- "and it is the UUID of the account that owns this prison", because
-- ownership lives one table away (`save_versions` has no owner column of
-- its own, by design -- see 20260822190200 -- precisely so it cannot drift
-- from its prison's). A cross-row invariant is a trigger's job in this
-- schema, the same division as `enforce_prison_slot_capacity()`.
--
-- Without this half, the strongest probe above still passes: writing
-- `<another account's uuid>/prison/1.json` satisfies every rule in the
-- regex. Escaping a per-owner prefix does not need traversal syntax when
-- you can simply name someone else's prefix.
--
-- SECURITY DEFINER, for the reason `enforce_challenge_evidence_size()`
-- spells out: the bound should not depend on the writer's privileges. The
-- only writer today is `create_save_version()`, itself SECURITY DEFINER, so
-- the trigger already runs as the owner -- and a future writer without
-- SELECT on `public.prisons` would otherwise get `42501 permission denied
-- for table prisons` instead of the validation. Running as the table owner
-- also means the lookup is not filtered by `prisons`' RLS policy, which is
-- required rather than incidental: a trusted importer must be able to
-- validate a path against an owner it is not.
--
-- The body reads exactly one column of one row, keyed by the value being
-- inserted, so definer rights buy it no access it could misuse.
--
-- `LS004`, distinct from `LS001` (save-slot cap), `LS002` (save payload too
-- large) and `LS003` (challenge evidence too large), so a client can tell
-- the refusals apart -- PostgREST surfaces the SQLSTATE as `code`. The
-- shape half raises `23514` (check_violation) instead, which is
-- PostgreSQL's own code and needs no invention.
create or replace function public.enforce_save_version_storage_prefix()
returns trigger
language plpgsql
security definer
-- `pg_temp` explicitly last, as every function in this schema pins it; see
-- submit_challenge_evidence() for why.
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_prefix text;
begin
  -- A JSONB-backed version has no path to validate. This is every row this
  -- schema writes today.
  if new.storage_path is null then
    return new;
  end if;

  select p.owner_id into v_owner from public.prisons p where p.id = new.prison_id;

  -- BEFORE-row triggers run before foreign keys are checked, so a
  -- non-existent `prison_id` reaches here. Let it through: the FK refuses
  -- the row a moment later with `23503`, and raising here instead would
  -- invent a second existence error for a prison id -- exactly the kind of
  -- oracle 20260824110100 removes from the challenge path.
  if v_owner is null then
    return new;
  end if;

  -- `split_part` on the first `/` rather than `left(…, 36)`: it is the
  -- same answer for a path that satisfies the CHECK above, and the honest
  -- answer for one that does not, since BEFORE triggers run before CHECK
  -- constraints are evaluated. So this fires first, and for a path that is
  -- both malformed and foreign the caller is told about the prefix.
  v_prefix := split_part(new.storage_path, '/', 1);

  -- `is distinct from` here is defensive rather than load-bearing, and that
  -- is said out loud rather than left to look stronger than it is: both
  -- operands are non-null by construction on the two lines above --
  -- `split_part` returns the empty string, never NULL, and a NULL `v_owner`
  -- has already returned. Rewriting it as `<>` was tried and the pgTAP
  -- suite stayed green, so it is reported as a surviving mutation in the
  -- pull request for #105 findings 6, 7, 9 and 11. It is kept because the
  -- NULL-safe spelling is what every comparison in this schema uses (see
  -- `create_save_version()`), and because a future edit that makes either
  -- operand nullable should not silently turn this check into UNKNOWN.
  if v_prefix is distinct from v_owner::text then
    raise exception 'save version storage path must live under the owning account''s prefix'
      using errcode = 'LS004',
            detail = format('expected_prefix=%s', v_owner),
            -- The refused prefix is deliberately NOT echoed back: the
            -- caller supplied it, so repeating it tells them nothing, and
            -- a detail field is a place a foreign uuid would end up in a
            -- log next to the account it was aimed at.
            hint = 'Existing versions are unaffected; only this upload is refused.';
  end if;

  return new;
end;
$$;

-- A function with no explicit ACL is executable by PUBLIC, and Supabase's
-- default privileges only drop the three roles' own grant -- so this is
-- revoked at birth rather than in a later cleanup migration, matching the
-- four trigger functions in 20260824090000 and the one in 20260824100000.
-- A trigger fires regardless of who holds EXECUTE on its function;
-- 20260824090000's pull request verified that by execution rather than
-- reasoning about it.
revoke all on function public.enforce_save_version_storage_prefix()
  from public, anon, authenticated, service_role;

-- INSERT only, matching `save_versions_enforce_size`. Rows in this table
-- are immutable: no client role holds UPDATE, and `create_save_version()`
-- never rewrites a version. A consequence worth naming rather than
-- leaving implicit: if a prison's `owner_id` ever became transferable --
-- it is not today, the column is absent from the `grant update (…)` list
-- in 20260822190100 -- existing paths would keep the old owner's prefix,
-- and moving them would be a data migration paired with whatever Storage
-- decision creates the bucket.
drop trigger if exists save_versions_enforce_storage_prefix on public.save_versions;
create trigger save_versions_enforce_storage_prefix
  before insert on public.save_versions
  for each row execute function public.enforce_save_version_storage_prefix();
