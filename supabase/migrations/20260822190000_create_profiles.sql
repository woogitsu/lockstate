-- Profiles: one row per authenticated identity (including anonymous
-- Supabase auth users). Created lazily on first cloud interaction rather
-- than via a trigger, so anonymous-only players never need one.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner-only: a user may see and edit only their own profile row. No
-- policy permits reading another user's profile.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profiles are never deleted by the client; account deletion is a trusted
-- server-side operation (cascades from auth.users on delete).
