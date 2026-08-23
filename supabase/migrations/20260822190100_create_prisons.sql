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
  -- Product direction (README.md): five free save slots per account. This
  -- is an application-tier default, not hard-coded here; the constraint
  -- only prevents duplicate slot indices per owner, whatever the limit is.
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

-- RLS alone only checks row ownership, not which columns an UPDATE
-- touches. Supabase grants table-level UPDATE on every new public table to
-- `authenticated` by default (project-level `ALTER DEFAULT PRIVILEGES`),
-- so without this, an authenticated owner could bypass optimistic
-- concurrency entirely with a direct PostgREST PATCH. Column-level REVOKE
-- narrows that table-level grant; public.create_save_version() (added in
-- a later migration) is SECURITY DEFINER, so it runs as the migration
-- role that owns this table rather than as `authenticated`, and is
-- therefore unaffected by this REVOKE -- it becomes the sole path able to
-- advance these two columns, and it performs its own `auth.uid() =
-- owner_id` check internally since SECURITY DEFINER does not imply RLS
-- is re-evaluated for the definer's own privileges.
revoke update (current_version_id, current_revision, owner_id) on public.prisons from authenticated;
