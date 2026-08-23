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
  constraint save_versions_prison_revision_unique unique (prison_id, revision),
  -- Idempotent-resume key (issue #20: "offline pending work resumes
  -- idempotently"): retrying the same local revision's upload after a
  -- dropped response must not create a duplicate version. A given
  -- (prison, checksum) pair is only ever the content of one version.
  constraint save_versions_prison_checksum_unique unique (prison_id, checksum)
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

-- No insert/update/delete policy is granted to `authenticated` at all:
-- every write to this table goes through create_save_version() (SECURITY
-- DEFINER), which is the only way new versions are created and the only
-- way this table is ever written -- see the RPC migration. Immutability
-- is therefore enforced by the absence of a client-facing write path, not
-- by a trigger the client could reason its way around.
revoke insert, update, delete on public.save_versions from authenticated, anon;
