-- Prisons: one row per cloud save slot. `current_version_id`/
-- `current_revision` are only ever advanced by public.create_save_version()
-- (added in a later migration) under optimistic concurrency -- never
-- written directly by the client. Multiple prisons per owner are a
-- first-class case, not a one-per-user table.
create table if not exists public.prisons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_version text not null,
  display_name text,
  slot_index int not null,
  current_version_id uuid,
  current_revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prisons_slot_index_positive check (slot_index >= 0),
  constraint prisons_current_revision_non_negative check (current_revision >= 0),
  -- Prevents duplicate slot indices per owner, and nothing else: a CHECK
  -- constraint cannot count sibling rows, so it cannot express "at most N
  -- slots per owner" whatever N is. That bound is enforced by the
  -- `prisons_enforce_slot_capacity` trigger in
  -- 20260823100000_bound_free_tier_capacity.sql (issue #57, ADR 0013).
  constraint prisons_owner_slot_unique unique (owner_id, slot_index)
);

create index if not exists prisons_owner_id_idx on public.prisons (owner_id);

alter table public.prisons enable row level security;

create policy "prisons_select_own"
  on public.prisons for select
  using (auth.uid() = owner_id);

-- A freshly inserted prison must start with no cloud version yet; the
-- first version is created through create_save_version(), never by
-- inserting a non-default pointer/revision directly.
--
-- This policy caps *who* may insert, never *how many* -- and with
-- `enable_anonymous_sign_ins = true` the `authenticated` role is
-- effectively anyone, since a fresh identity costs one signup call. The
-- "how many" half is now answered (issue #57, ADR 0013) by the
-- `prisons_enforce_slot_capacity` trigger in
-- 20260823100000_bound_free_tier_capacity.sql, which counts an owner's
-- existing prisons against the capacity derived from the server-authoritative
-- `entitlements` projection and refuses with SQLSTATE LS001.
--
-- The INSERT grant below is deliberately NOT revoked in favour of that
-- migration's create_prison() RPC: ADR 0013 argues that the cap is a count
-- invariant of this table, so it belongs on every write path into it rather
-- than on one blessed door whose exclusivity depends on a grant staying
-- revoked. create_prison() exists alongside it as the front door that
-- answers with a discriminated status instead of an exception.
create policy "prisons_insert_own"
  on public.prisons for insert
  with check (
    auth.uid() = owner_id
    and current_version_id is null
    and current_revision = 0
  );

create policy "prisons_update_own_metadata"
  on public.prisons for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "prisons_delete_own"
  on public.prisons for delete
  using (auth.uid() = owner_id);

-- Data API grants. A policy decides *which rows* a role may touch; it never
-- grants the privilege to touch the table at all. Supabase used to hand
-- `anon`/`authenticated` table-level ALL on every new `public` table, so
-- relying on that default worked -- but it no longer does: the CLI (and
-- Studio at cloud project creation) revokes the Data API roles' default
-- SELECT/INSERT/UPDATE/DELETE in `public`, leaving `Dxtm` only. Without
-- these grants the policies above are unreachable code and every request
-- returns `42501 permission denied for table prisons`.
--
-- UPDATE is deliberately not in this list; it is granted per column below.
grant select, insert, delete on public.prisons to authenticated;

-- RLS alone only checks row ownership, not which columns an UPDATE
-- touches, so an owner-scoped UPDATE policy on its own would let a normal
-- PostgREST PATCH bypass optimistic concurrency entirely by writing
-- `current_revision` directly.
--
-- It has to be revoke-then-grant, not a column-level REVOKE. PostgreSQL
-- cannot subtract a single column's privilege out of a table-level grant:
-- `revoke update (col) ... from authenticated` leaves the table-level
-- UPDATE in place, so `has_table_privilege('authenticated', 'prisons',
-- 'UPDATE')` stays true and the PATCH still succeeds. Revoking the
-- table-level privilege first and granting back only the editable columns
-- is what actually closes it.
--
-- The REVOKE is a no-op while Supabase's current default withholds
-- table-level UPDATE anyway, and is kept precisely because that is a
-- default: it must stay closed on a project that sets
-- `[api] auto_expose_new_tables = true`, and on any existing project
-- created before the default changed.
--
-- public.create_save_version() (added in a later migration) is SECURITY
-- DEFINER, so it runs as the migration role that owns this table rather
-- than as `authenticated`, and is unaffected by this -- it becomes the
-- sole path able to advance the pointer columns, and it performs its own
-- `auth.uid() = owner_id` check internally since SECURITY DEFINER does
-- not imply RLS is re-evaluated for the definer's own privileges.
revoke update on public.prisons from authenticated, anon;

-- Editable prison metadata only. `id`, `owner_id`, `created_at` and the
-- two pointer columns are deliberately absent: a client has no reason to
-- rewrite an identity, an owner, a creation timestamp, or a revision
-- pointer that exists to be advanced transactionally.
grant update (display_name, game_version, slot_index, updated_at)
  on public.prisons to authenticated;
