-- Save versions are immutable generations of a prison's cloud save,
-- mirroring the local-first repository's generation model
-- (src/persistence/local/, issue #19) so a prison's history is recoverable
-- rather than overwritten in place. `prisons.current_version_id` is the
-- only mutable pointer; rows here are never updated once inserted.
create table if not exists public.save_versions (
  id uuid primary key default gen_random_uuid(),
  prison_id uuid not null references public.prisons (id) on delete cascade,
  revision int not null,
  save_schema_version int not null,
  checksum text not null,
  -- Exactly one of payload/storage_path is set. See "Storage placement"
  -- in docs/CLOUD_SAVE.md: the JSONB-vs-Storage threshold is a documented
  -- candidate pending real benchmark evidence (issue #20 acceptance
  -- criteria), not yet an accepted ADR decision.
  payload jsonb,
  storage_path text,
  byte_size int not null,
  created_at timestamptz not null default now(),
  constraint save_versions_revision_positive check (revision > 0),
  constraint save_versions_exactly_one_location check (
    (payload is not null and storage_path is null)
    or (payload is null and storage_path is not null)
  ),
  -- Idempotent-resume key (issue #20: "offline pending work resumes
  -- idempotently"). Retrying the same local revision's upload after a
  -- dropped response must not create a duplicate version, and this
  -- constraint is what makes the retry safe: create_save_version() looks up
  -- (prison_id, revision, checksum) and replays whatever row it finds.
  --
  -- Content is deliberately NOT unique on its own. An earlier design also
  -- carried `unique (prison_id, checksum)` and keyed idempotency off the
  -- checksum alone, which made a legitimately recurring state (a player
  -- undoing back to an earlier layout) indistinguishable from a retry --
  -- see the RPC migration's header for what that cost. A revision is part
  -- of the identity of a save attempt; content on its own is not.
  constraint save_versions_prison_revision_unique unique (prison_id, revision)
);

create index if not exists save_versions_prison_id_idx on public.save_versions (prison_id);

alter table public.prisons
  add constraint prisons_current_version_fk
  foreign key (current_version_id) references public.save_versions (id);

alter table public.save_versions enable row level security;

-- Ownership is indirect (via prisons.owner_id); a version has no owner
-- column of its own so it can never drift from its prison's ownership.
create policy "save_versions_select_own"
  on public.save_versions for select
  using (
    exists (
      select 1 from public.prisons
      where prisons.id = save_versions.prison_id
        and prisons.owner_id = auth.uid()
    )
  );

-- Read-only for the client. The SELECT grant is explicit because Supabase
-- no longer auto-exposes new `public` tables to the Data API roles (see
-- the prisons migration); without it the policy above is unreachable code
-- and a pull returns `42501 permission denied for table save_versions`.
grant select on public.save_versions to authenticated;

-- No insert/update/delete policy is granted to `authenticated` at all:
-- every write to this table goes through create_save_version() (SECURITY
-- DEFINER), which is the only way new versions are created and the only
-- way this table is ever written -- see the RPC migration. Immutability
-- is therefore enforced by the absence of a client-facing write path, not
-- by a trigger the client could reason its way around. The REVOKE is
-- redundant under the current default and kept for projects where the
-- legacy auto-expose behaviour is still in effect.
revoke insert, update, delete on public.save_versions from authenticated, anon;
