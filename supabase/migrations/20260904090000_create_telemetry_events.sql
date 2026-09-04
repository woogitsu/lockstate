-- The telemetry destination ADR 0046 needs: one table, one SECURITY DEFINER
-- insert function, and one dedicated least-privilege role. Nothing else.
--
-- WHY THIS FILE EXISTS AT ALL, AND WHOSE DECISION IT IS. `supabase/migrations/`
-- is reservation 2 in AGENTS.md: "An applied migration is history. Propose new
-- migration content in an ADR or an issue instead. Rollback is not automated."
-- The owner was asked on 2026-09-04 whether to land these three objects or
-- leave the merged ingest inert, and chose to land them -- against the stated
-- cost that an applied migration cannot be rolled back automatically, and for
-- the stated reason that until the destination exists the Worker merged on
-- 2026-09-03 refuses every batch with `destination-unconfigured`, so the
-- decision already paid for has bought nothing.
--
-- **The authorisation is exactly three objects.** AGENTS.md reservation 1's
-- release paragraph names them: "the `telemetry_events` table, its insert
-- function and the dedicated least-privilege database role". A fourth object
-- is not authorised by that sentence, and the one this schema will eventually
-- need -- the scheduled retention job ADR 0046 section 7 item 1 requires -- is
-- therefore NOT in this file. See "WHAT THIS MIGRATION DELIBERATELY DOES NOT
-- DO" below, which states what that costs and who it is owed by.
--
-- WHAT IT IS FOR. `src/worker/telemetry-ingest.ts` validates a batch against
-- the same `admitTelemetryEnvelope` the browser sink calls and then has
-- nowhere to put it: `TelemetryIngestStore` has no implementation and the
-- entry point passes `undefined`, so the endpoint refuses before it reads a
-- request body. This file is the destination that interface describes, and the
-- bounds below are taken from that module's constants rather than chosen --
-- a database looser than the code that feeds it turns the code's bound into
-- decoration.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`,
-- and driven in both directions by
-- supabase/tests/012_telemetry_ingest.test.sql -- which probes every privilege
-- claim below AS the role it is about, rather than reading the grant back.
-- NOT executed against the real Supabase local stack, NOT executed against a
-- hosted project, and deliberately not applied anywhere: applying it is deploy
-- configuration and stays the owner's (AGENTS.md reservation 3). See
-- docs/CLOUD_SAVE.md, "What has and has not been executed".

-- ============================================================================
-- 1. The role
-- ============================================================================
--
-- WHY A DEDICATED ROLE IS THE SECURITY DECISION IN THIS FILE. The alternative
-- is the one that has to be made impossible rather than discouraged: wiring
-- the Worker with a `service_role` key. `service_role` may call
-- `record_entitlement_event()` -- the paid-entitlement write path -- and
-- bypasses row level security entirely, so a `service_role` key behind an
-- unauthenticated public endpoint puts the whole database behind that
-- endpoint. `docs/DEPLOYMENT.md`'s pre-merge checklist item 4 says so in as
-- many words and names the remedy: "The credential is a dedicated
-- least-privilege database role".
--
-- This role holds EXECUTE on one function and nothing else. Everything it
-- deliberately withholds, stated so a reader does not have to derive it:
--
--   * no SELECT on `telemetry_events` -- the ingest is append-only and a
--     write path that can read back what it wrote is a read path;
--   * no INSERT, UPDATE or DELETE on `telemetry_events` -- the only way in is
--     the function below, so a stolen credential cannot edit or erase what is
--     already stored, and cannot write a row that skipped a bound;
--   * no TRUNCATE -- which would ignore RLS and fire no row trigger
--     (20260824090100, 20260824150000);
--   * no privilege on any other relation or function in `public`, so nothing
--     about cloud save, entitlements or challenges is reachable with it.
--
-- **And `service_role` is revoked from the function itself** (section 3), so
-- substituting a `service_role` key is not merely unnecessary: it does not
-- work. That is the property worth having, because "we chose the right
-- credential" is a memory and `42501 permission denied` is a fact.
--
-- NOLOGIN, and no password, on purpose. A password in a migration is a
-- credential in the repository, which AGENTS.md's prohibited-behaviour list
-- forbids outright. How the Worker comes to *be* this role is deploy
-- configuration and stays the owner's: either a password for a direct
-- connection, or `grant telemetry_ingest to authenticator` so PostgREST can
-- switch into it for an RPC call. **Until one of those happens the role cannot
-- connect, and the ingest still stores nothing** -- which is the same state
-- `docs/DEPLOYMENT.md`'s "What is still owed" describes for the two Worker
-- variables, and is why this migration changes no behaviour on `lockstate.io`
-- by itself.
--
-- NOINHERIT for the same reason Supabase declares its own three roles that
-- way: privileges arrive by `set role`, never ambiently through membership.
--
-- `create role` has no `if not exists`, so the guard is a DO block -- the
-- shape `scripts/sql/supabase-compat-harness.sql` uses for the three Supabase
-- roles it emulates.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'telemetry_ingest') then
    create role telemetry_ingest nologin noinherit;
  end if;
end
$$;

-- USAGE on the schema, and nothing else on it. Without this the role cannot
-- resolve `public.record_telemetry_events` at all; with only this it can
-- resolve names and reach no object it holds no privilege on. Spelled
-- explicitly rather than relying on PostgreSQL's default `PUBLIC` USAGE,
-- because the harness records that Supabase grants schema USAGE per role and
-- because a `revoke usage on schema public from public` on the hosted project
-- would otherwise take this role's only path away silently.
grant usage on schema public to telemetry_ingest;

-- ============================================================================
-- 2. The table
-- ============================================================================
--
-- THE SHAPE IS ADR 0046's, not a reasonable schema's. Section 7 of that ADR
-- writes out what "the rest of this repository would expect", and every clause
-- of it is honoured here:
--
--   * keyed by the client's `event_id`, so a replay is idempotent;
--   * a server-stamped `received_at` the endpoint writes and the body cannot
--     set;
--   * columns for `schema_version`, `name`, `category`, `session_id`,
--     `release`, `consent_version` and a `jsonb` `attributes`;
--   * the client's `occurred_at` and `sample_rate` stored as untrusted claims
--     that nothing keys on and nothing multiplies by -- and NAMED as claims,
--     which is the point `TelemetryIngestRecord` makes in its own docblock:
--     "A column called `occurred_at` invites a retention job to key on it [...]
--     a field called `claimedOccurredAt` does not";
--   * **no `user_id` column at all**, so the join ADR 0046 section 7 item 3
--     forbids has nothing to join on;
--   * no RLS policy granting `anon` or `authenticated` any verb.
--
-- WHAT THE ABSENT COLUMN DOES AND DOES NOT BUY is stated in ADR 0046 and is
-- not restated as a stronger claim here: it removes the one-query join and it
-- does not make re-identification impossible, because `received_at`, `release`
-- and `session_id` together are a timing-correlation handle against any other
-- timestamped record that does carry an account. That remainder is
-- operational, not structural, and no shape of this table closes it.
--
-- WHY THERE IS NO SEPARATE `release_environment`. `TelemetryIngestRecord`
-- carries both the batch's `environment` and `envelope.release.environment`,
-- and the Worker refuses a batch where they disagree
-- (`environment-mismatch`). Two columns that are equal by construction are
-- two columns a reader has to check are still equal, so one is stored -- and
-- the function below re-checks the agreement itself rather than trusting the
-- Worker to have done it, so the single column is not a bet on an upstream
-- guard.
create table if not exists public.telemetry_events (
  -- The client's `eventId` (`${sessionId}-${counter}`, `identifierSchema`).
  -- Primary key because ADR 0046 asks for idempotent replays and a unique key
  -- is the only thing that delivers one: "we checked first" is a race
  -- (20260823090000 makes the same argument for the webhook dedup index).
  --
  -- **Stated rather than glossed: this key is client-chosen and the ingest is
  -- unauthenticated, so a hostile caller can claim an `event_id` a real
  -- client would later use, and the real event is then silently dropped as a
  -- replay.** That is inherent in keying idempotency on an untrusted value
  -- and it is the trade ADR 0046 chose; the cost is bounded to aggregate
  -- events nobody is waiting on, and the alternative -- a server-minted key --
  -- gives up replay idempotency, which is the property the ingest actually
  -- needs because the client retries.
  event_id text primary key
    check (char_length(event_id) between 1 and 128),

  -- Pinned, not bounded, and for the reason `entitlement_events.schema_version`
  -- is: `telemetryEnvelopeSchema` declares `z.literal(TELEMETRY_SCHEMA_VERSION)`
  -- (src/services/telemetry/events.ts), so the Worker refuses anything but 1
  -- before this column is reached. A range here would be looser than the code
  -- that feeds it. A version 2 needs a migration by design, which is the same
  -- deliberate friction the telemetry event registry itself is built on.
  schema_version int not null default 1
    check (schema_version = 1),

  -- `identifierSchema` values from the event registry
  -- (`DEFAULT_TELEMETRY_EVENTS`). Length only, not the character class:
  -- copying `identifierSchema`'s regex into SQL would put one rule in two
  -- places, which is the reasoning 20260824101000 gives for
  -- `prisons.game_version` and the defect class issues #93 and #123 are about.
  name text not null
    check (char_length(name) between 1 and 128),

  -- Closed set rather than a length bound, because the set is finite and
  -- known: `telemetryCategorySchema` is `z.enum(['diagnostics', 'performance',
  -- 'gameplay'])`. A closed set is the stronger bound and this schema already
  -- prefers it where one exists (`entitlement_events.event_type`, `source`,
  -- `actor_kind`, `capability`).
  --
  -- It is also the column a retention job keys on beside `received_at`, since
  -- docs/TELEMETRY.md promises a different window per category (90/90/30), so
  -- a free-text category would make that promise unimplementable.
  category text not null
    check (category in ('diagnostics', 'performance', 'gameplay')),

  -- Rotates per browser session, is never persisted by the client and is never
  -- derived from the account id -- which is what makes these rows aggregate.
  -- ADR 0046 section 7 item 3: do not join it to anything. There is no column
  -- here to join it *to*, and that is enforced by the absence of `user_id`
  -- rather than by this comment.
  session_id text not null
    check (char_length(session_id) between 1 and 128),

  -- The batch's environment, which the function below has proven equal to the
  -- envelope's. `TELEMETRY_ENVIRONMENTS` /
  -- `releaseIdentitySchema.environment` is a three-value enum; same reasoning
  -- as `category`.
  environment text not null
    check (environment in ('development', 'staging', 'production')),

  -- `release.buildVersion`: an `identifierSchema` value that correlates a
  -- stack frame with the privately retained source map (ADR 0010).
  release_build_version text not null
    check (char_length(release_build_version) between 1 and 128),

  -- `release.commit` is `identifierSchema.optional()`, so this is the one
  -- nullable text column. `>= 1` refuses the empty string, which would be a
  -- second spelling of "no commit" beside NULL -- the same argument
  -- 20260824101000 makes for `profiles.display_name`.
  release_commit text
    check (release_commit is null or char_length(release_commit) between 1 and 128),

  -- Which consent policy version the player agreed to. `z.number().int().min(1)`
  -- on the wire, so a range and not a pin: `TELEMETRY_CONSENT_VERSION` is 1
  -- today and raising it re-asks the player rather than needing a migration,
  -- so pinning would refuse a newer client's rows before the migration
  -- admitting them could exist. Same reasoning as
  -- `user_settings_schema_version_check`.
  consent_version int not null
    check (consent_version >= 1),

  -- ==== The two values the server decides ================================

  -- Stamped by `default now()`, and the ONLY time value a retention window may
  -- key on (ADR 0046 section 7 item 1). The function below never names this
  -- column, so a batch element carrying `receivedAt` -- which
  -- `TelemetryIngestRecord` does carry -- is ignored rather than honoured, and
  -- suite 012 proves that by sending one dated 1970 and reading `now()` back.
  --
  -- Why the DEFAULT is enough here, where 20260826130000 needed a trigger for
  -- `updated_at`: those three columns sat behind client INSERT grants that
  -- named them, so a client could supply a value and the default never ran.
  -- This table has no INSERT grant for any role at all (section 3), so the
  -- function below is the only writer and it does not name the column. If a
  -- second write path is ever added, a `BEFORE INSERT OR UPDATE` stamp trigger
  -- in the shape of `stamp_updated_at()` is what makes this structural again,
  -- and that is the moment to add one rather than now: an unused trigger is a
  -- control nobody drives.
  --
  -- **This is the database's `now()`, not the Worker's `receivedAt`.** They
  -- differ by the latency of the store call. Both are server-stamped, so
  -- neither is the caller's, and the coarse-granularity advice in ADR 0046
  -- applies to whichever a query reads.
  received_at timestamptz not null default now(),

  -- The rate the RECEIVER's own registry declares for `(schema_version, name)`
  -- -- `verdict.definition.sampleRate` in the Worker, never the caller's
  -- value. This is the only rate an aggregate may weight by (ADR 0046
  -- section 7 item 7): weighting by the caller's hands an unauthenticated
  -- POST a multiplier of `1 / sampleRate`, unbounded because `0` passes the
  -- envelope schema's `.min(0)`.
  --
  -- Stated rather than assumed: this is the registry copy held by whichever
  -- Worker accepted the row, so a stale deployment stores a stale rate. That
  -- is a property of the value and not a defect of the column; the alternative
  -- is a registry table in this schema, which would be a fourth object and is
  -- not authorised here.
  --
  -- The range refuses NaN and both infinities for free: every comparison
  -- against NaN is false, so `>= 0 and <= 1` rejects it. 20260824130000 needed
  -- an explicit `isfinite`-shaped check for `challenge_submissions.ranked_score`
  -- because that column is otherwise unbounded; a bounded float needs no
  -- second constraint.
  registry_sample_rate double precision not null
    check (registry_sample_rate >= 0 and registry_sample_rate <= 1),

  -- ==== The two values the client merely claims ==========================

  -- The caller's `sampleRate`. Kept because a receiver that reads it as a
  -- claim has a use for it -- a row whose claimed rate disagrees with
  -- `registry_sample_rate` is a signal that a build is stale or an override is
  -- misconfigured -- and named `claimed_` so that no query multiplies by it.
  claimed_sample_rate double precision not null
    check (claimed_sample_rate >= 0 and claimed_sample_rate <= 1),

  -- The caller's `occurredAt`, in epoch milliseconds, stored as an integer
  -- rather than a `timestamptz`.
  --
  -- **The type is the point.** `occurredAt` is `z.number().int().min(0)` with
  -- NO upper bound and it arrives from an unauthenticated endpoint, so a batch
  -- dated the year 4000 is admitted by the shared schema -- which is exactly
  -- how ADR 0046 section 7 item 1's original wording defeated its own 90/90/30
  -- retention table. A `timestamptz` here would invite the retention job to
  -- key on this column; a `bigint` of milliseconds does not read like a
  -- timestamp and cannot be compared to `now()` without a deliberate cast that
  -- a reviewer sees.
  --
  -- Bounded at `Number.MAX_SAFE_INTEGER`, which is the ceiling
  -- `z.number().int()` actually admits in a browser and the same bound
  -- `tickSchema` and `sequenceSchema` use in src/simulation/protocol/types.ts.
  -- Nothing keys on this column and nothing orders by it; within-session order
  -- is carried by `event_id`.
  claimed_occurred_at bigint not null
    check (claimed_occurred_at between 0 and 9007199254740991),

  -- The event's attributes: `z.record(identifierSchema,
  -- telemetryAttributeValueSchema)`, at most `MAX_TELEMETRY_ATTRIBUTES` = 24
  -- entries whose values are a string of at most
  -- `MAX_TELEMETRY_STRING_LENGTH` = 200, a finite number, or a boolean.
  --
  -- `jsonb` and not `text`, and `src/worker/telemetry-ingest.ts` says which
  -- column type it was protecting: `UNSTORABLE_TEXT` refuses `U+0000` and
  -- unpaired UTF-16 surrogates because "PostgreSQL `text` and `jsonb` cannot
  -- represent it; an insert carrying one errors". So the type refuses both
  -- shapes itself -- suite 012 drives that rather than assuming it -- and the
  -- Worker's regex is what turns a `22P02` on this column into a `400` for the
  -- caller instead of a `502`.
  --
  -- THE BOUND. 12 KiB, which is `MAX_ENVELOPE_BYTES` -- the byte budget the
  -- Worker allots one whole envelope -- so this column cannot hold more than
  -- the endpoint admits for the entire record it belongs to.
  --
  -- The worst case the shared schema can actually produce is **8,064 bytes as
  -- this constraint measures it**, and that number is measured rather than
  -- derived: 24 entries of a 128-character key and a 200-character value
  -- serialise to 8,017 bytes on the wire, and `jsonb::text` re-renders them
  -- with a space after every colon and comma, which is the 47 bytes of
  -- difference. Suite 012 builds that worst case from
  -- `MAX_TELEMETRY_ATTRIBUTES` and `MAX_TELEMETRY_STRING_LENGTH`, asserts it is
  -- accepted, and asserts the 8,064 -- so raising a cap in `events.ts` without
  -- raising this one fails a test rather than silently refusing legitimate
  -- crash reports, which is the same guard
  -- `tests/unit/worker-telemetry-ingest.test.ts` holds over
  -- `MAX_ENVELOPE_BYTES`. 12,288 sits 1.5x above it, so nothing the TypeScript
  -- contract can build is refused -- the direction 20260824101000 states as the
  -- convention: "Every bound below is chosen so that SQL refuses nothing the
  -- TypeScript contract can produce."
  --
  -- `octet_length(attributes::text)` is the same measure
  -- `user_settings_payload_bytes_check` uses, and is legal in a CHECK because
  -- `jsonb_out` is IMMUTABLE.
  --
  -- **This is the column the external audit's 33 MB finding was about**, one
  -- table over (`user_settings.payload`). It arrives bounded rather than being
  -- bounded later.
  attributes jsonb not null
    constraint telemetry_events_attributes_bytes_check
    check (octet_length(attributes::text) <= 12288),

  -- An object, not an array and not a scalar. Every read of this column
  -- assumes a record of attribute names, and `jsonb` alone does not say so.
  --
  -- What is deliberately NOT checked here: that the values are scalars and
  -- that there are at most 24 of them. A key count needs a set-returning
  -- function, which is not legal in a CHECK; and both rules live in
  -- `telemetryEnvelopeSchema`, which the Worker applies to every element
  -- through the same `admitTelemetryEnvelope` the browser sink uses. Copying
  -- them here would put one rule in two places for no gain in the property
  -- this constraint set is about, which is size -- and size is bounded above.
  constraint telemetry_events_attributes_is_object
    check (jsonb_typeof(attributes) = 'object')
);

-- The index the retention job this migration does not contain will need.
--
-- docs/TELEMETRY.md promises a different window per category, so a deletion
-- runs as `delete from telemetry_events where category = $1 and received_at <
-- now() - $2`, and without this index that is a sequential scan of the whole
-- table on every run. The index is part of the table and therefore inside the
-- three objects authorised; the job is not (see below).
create index if not exists telemetry_events_retention_idx
  on public.telemetry_events (category, received_at);

-- Row level security, enabled with no policy, which is a deliberate deny-all.
--
-- Suite 003 asserts `relrowsecurity` on every table in `public` because a
-- missing one is the difference between "each player sees their own rows" and
-- "every signed-in visitor sees every row". Suite 009 additionally asserts
-- that no table is enabled into a deny-all, on the grounds that RLS with no
-- policy fails closed and therefore never shows up as a leak -- and
-- **`telemetry_events` is the first table in this schema for which deny-all is
-- the intent rather than an accident**, so it is named as the exception there
-- the way `challenge_definitions_public_read` is named in that suite's
-- identity rule.
--
-- Why enable it at all, when no role holds a grant. Defence in depth against
-- exactly one future mistake: a later migration that grants a client role
-- SELECT on this table gets deny-all instead of every row. The definer
-- function below is unaffected -- it runs as the table owner, and an owner
-- bypasses RLS unless `force row level security` is set, which it is not.
alter table public.telemetry_events enable row level security;

-- ============================================================================
-- 3. The privilege surface: closed, and closed by this migration's own words
-- ============================================================================
--
-- `20260826120000_revoke_ambient_table_privileges.sql` removed the default
-- privileges that used to hand every new `public` table TRUNCATE, REFERENCES
-- and TRIGGER to all three Data API roles, so this table arrives with a null
-- ACL -- owner only. docs/CLOUD_SAVE.md states it as "A new relation in
-- `public` now starts closed, and its migration opens exactly what it means to
-- open."
--
-- The revoke below is therefore a no-op on a database where that migration has
-- already run, and it is stated anyway for two reasons. First, the hosted
-- project has applied nothing after `20260823100000` (docs/DEPLOYMENT.md,
-- "Database migrations"), so the closed state is a property of a migration
-- that has not been applied there yet; making it a property of THIS file means
-- the table is closed whatever order the operator ends up applying things in.
-- Second, it is the sentence a reader needs: the table opens nothing, for
-- anyone.
revoke all on table public.telemetry_events
  from public, anon, authenticated, service_role, telemetry_ingest;

-- ============================================================================
-- 4. The insert function
-- ============================================================================
--
-- The only write path into `telemetry_events`, and the only thing
-- `telemetry_ingest` may do.
--
-- SECURITY DEFINER, so it writes as the table owner and no caller needs a
-- table grant -- which is what lets the role hold none.
--
-- `set search_path = public, pg_temp`, with `pg_temp` explicitly LAST, for the
-- reason every SECURITY DEFINER function in this schema spells out and
-- `20260824090000_pin_trigger_function_search_path.sql` exists to make
-- obligatory: when `pg_temp` is not named, PostgreSQL searches the temporary
-- schema *first* for relation and type names, so a caller who can create a
-- temporary table can shadow `public.telemetry_events` and have this function
-- write somewhere else with the owner's rights. Suite 005 asserts the pin
-- exhaustively from `pg_proc`; suite 012 drives it by planting
-- `pg_temp.telemetry_events` and watching the real table receive the row.
--
-- ONE JSONB ARGUMENT, not a column list. The Worker accepts up to
-- `MAX_INGEST_BATCH_SIZE` envelopes per request and a per-row RPC would turn
-- one accepted batch into 32 round trips. The argument is the
-- `TelemetryIngestRecord[]` the Worker already builds, serialised as-is, so
-- the store implementation that eventually lands is `JSON.stringify(records)`
-- and not a mapping layer that could disagree with this file.
--
-- THE EXACT SHAPE EXPECTED, from `TelemetryIngestRecord`
-- (src/worker/telemetry-ingest.ts) -- one array element per accepted envelope:
--
--   {
--     "receivedAt":          <ignored; see below>,
--     "environment":         "development" | "staging" | "production",
--     "registrySampleRate":  number,
--     "claimedSampleRate":   number,
--     "claimedOccurredAt":   integer,
--     "envelope": {
--       "schemaVersion":  1,
--       "eventId":        string,
--       "name":           string,
--       "category":       "diagnostics" | "performance" | "gameplay",
--       "occurredAt":     integer,        -- read as claimedOccurredAt above
--       "sessionId":      string,
--       "release":        { "buildVersion": string, "environment": string,
--                           "commit": string | absent },
--       "consentVersion": integer,
--       "sampleRate":     number,         -- read as claimedSampleRate above
--       "attributes":     { ... }
--     }
--   }
--
-- **`receivedAt` is read from nowhere.** The element carries one, because the
-- Worker stamps it from its injected clock, and this function does not name
-- the column -- so the row gets the database's `now()`. That is ADR 0046
-- section 7 item 1's rule applied one hop further than the Worker applies it:
-- the endpoint is the server as far as the browser is concerned, and the
-- database is the server as far as the endpoint is concerned. A caller that
-- reached this function directly and claimed 1970 or the year 4000 gets
-- neither.
--
-- WHAT IS VALIDATED HERE AND WHAT IS VALIDATED BY THE TABLE. The division is
-- deliberate:
--
--   * **Here**: the batch-level bounds, which no column can express -- the
--     argument is an array, it is non-empty, it holds at most 32 elements, it
--     is at most `MAX_INGEST_BODY_BYTES`, and each element's two statements
--     about its environment agree.
--   * **The table**: every per-field bound, as CHECK constraints, so a second
--     write path added later cannot skip them. A function that validated the
--     fields itself would be a control that lives only on one path, which is
--     this repository's signature defect shape.
--
-- Neither half restates `telemetryEnvelopeSchema`'s character classes or its
-- attribute count. Those are enforced by `admitTelemetryEnvelope` on the only
-- path that reaches here, and copying them into SQL would put one rule in two
-- places (20260824101000's reasoning for `prisons.game_version`).
--
-- NO `LS00x` SQLSTATE IS MINTED. `LS001`-`LS004` are the player-visible fault
-- vocabulary: docs/CLOUD_SAVE.md, docs/TRUSTED_SERVICES.md and ADR 0013 all
-- describe them as codes a client reads and renders. `HttpTelemetryTransport`
-- deliberately never reads this endpoint's response body, and the Worker maps
-- any store failure to one opaque `store-failed`, so a fifth code would be a
-- player-visible vocabulary entry nothing renders -- and would owe edits to
-- three documents that enumerate the set. Standard SQLSTATEs say the same
-- thing to the only audience there is, which is an operator reading a log:
-- `22023` for a malformed argument, `54000` for one over a bound.
create or replace function public.record_telemetry_events(p_events jsonb)
returns integer
language plpgsql
security definer
-- `pg_temp` explicitly last; see the header above and
-- 20260824090000_pin_trigger_function_search_path.sql.
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_bytes int;
  v_inserted int;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'telemetry batch must be a JSON array of ingest records'
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_events);

  -- An empty batch is a caller defect rather than a no-op: the Worker refuses
  -- one with `schema-refused` before it gets here, so an empty array reaching
  -- this function means something other than the ingest is calling it.
  if v_count = 0 then
    raise exception 'telemetry batch is empty'
      using errcode = '22023';
  end if;

  -- `MAX_INGEST_BATCH_SIZE` (src/worker/telemetry-ingest.ts). Stated as a
  -- literal rather than derived, for the reason that module gives for not
  -- deriving it from the client: the caller is not trusted to bound itself,
  -- and a bound that tracks the caller is not a bound.
  if v_count > 32 then
    raise exception 'telemetry batch of % records exceeds the bound of 32', v_count
      using errcode = '54000';
  end if;

  -- `MAX_INGEST_BODY_BYTES` = 32 * 12288 + 1024. The Worker applies it to the
  -- whole HTTP body, which is this array plus the object around it, so
  -- applying it to the array alone is not looser than the endpoint. It is the
  -- guard for a caller that sends 32 records each of which is individually
  -- admissible and collectively enormous -- the shared schema bounds a field,
  -- never a batch.
  v_bytes := octet_length(p_events::text);
  if v_bytes > 394240 then
    raise exception 'telemetry batch of % bytes exceeds the bound of 394240', v_bytes
      using errcode = '54000';
  end if;

  -- The Worker refuses a batch whose wire `environment` disagrees with an
  -- envelope's `release.environment` (`environment-mismatch`), because there is
  -- no single right answer to store and picking one would be the receiver
  -- guessing. Only one of the two is stored, so that guard is re-run here
  -- rather than assumed: a single column that is only correct if an upstream
  -- check ran is a column that is wrong the day it does not.
  if exists (
    select 1
    from jsonb_array_elements(p_events) as element
    where element ->> 'environment'
          is distinct from element -> 'envelope' -> 'release' ->> 'environment'
  ) then
    raise exception 'a telemetry record disagrees with its envelope about the environment'
      using errcode = '22023';
  end if;

  -- `received_at` is deliberately absent from this column list. See the header.
  --
  -- `on conflict (event_id) do nothing` is the idempotent replay ADR 0046 asks
  -- for: a redelivered batch inserts nothing and reports how much was new,
  -- and -- the part that matters for retention -- a replay cannot move an
  -- existing row's `received_at` forward, because there is no UPDATE in this
  -- statement at all.
  --
  -- A missing field lands as NULL and is refused by the column's NOT NULL; a
  -- field of the wrong shape is refused by its cast or its CHECK. Both are the
  -- table's job, and both refuse the whole batch rather than part of it, which
  -- is the Worker's stated posture: "One bad envelope refuses the whole batch.
  -- There is no best-effort mode".
  insert into public.telemetry_events (
    event_id,
    schema_version,
    name,
    category,
    session_id,
    environment,
    release_build_version,
    release_commit,
    consent_version,
    registry_sample_rate,
    claimed_sample_rate,
    claimed_occurred_at,
    attributes
  )
  select
    element -> 'envelope' ->> 'eventId',
    (element -> 'envelope' ->> 'schemaVersion')::int,
    element -> 'envelope' ->> 'name',
    element -> 'envelope' ->> 'category',
    element -> 'envelope' ->> 'sessionId',
    element ->> 'environment',
    element -> 'envelope' -> 'release' ->> 'buildVersion',
    element -> 'envelope' -> 'release' ->> 'commit',
    (element -> 'envelope' ->> 'consentVersion')::int,
    (element ->> 'registrySampleRate')::double precision,
    (element ->> 'claimedSampleRate')::double precision,
    (element ->> 'claimedOccurredAt')::bigint,
    element -> 'envelope' -> 'attributes'
  from jsonb_array_elements(p_events) as element
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Function privileges, stated in full for every role, the way
-- 20260823090000_create_entitlement_events.sql states them.
--
-- `public` first, then each role by name: a revoke from PUBLIC does not take
-- away a role's own default grant on a project created before Supabase stopped
-- auto-exposing new entities in `public`, and a function with no explicit ACL
-- is executable by PUBLIC whatever the Data API defaults say. Suite 003's
-- "no function in public is executable by PUBLIC" sweep is what fails if this
-- line is dropped.
--
-- **`service_role` is named here, and that is the security decision this file
-- is built around.** It is not tidiness: with EXECUTE revoked, a Worker wired
-- with a `service_role` key -- the substitution
-- `docs/DEPLOYMENT.md`'s checklist item 4 exists to prevent -- gets `42501
-- permission denied for function record_telemetry_events` and stores nothing.
-- The wrong credential does not merely carry too much authority; it does not
-- work at all, which is the only form of "don't use the service role" that a
-- future operator cannot skip. Suite 012 drives it as `service_role`.
revoke execute on function public.record_telemetry_events(jsonb)
  from public, anon, authenticated, service_role;

-- ...and granted to exactly one role, which holds nothing else anywhere.
--
-- This is the whole of `telemetry_ingest`'s reach: one function, whose body a
-- reviewer can read in full, appending to one table that has no `user_id`
-- column and no other write path. Everything it withholds is enumerated in
-- section 1.
grant execute on function public.record_telemetry_events(jsonb)
  to telemetry_ingest;

-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
--
-- **The retention job is absent, and that is not an oversight.** ADR 0046
-- section 7 item 1 requires "a retention job that actually deletes, keyed on a
-- timestamp the client did not supply", per category, and
-- `docs/DEPLOYMENT.md`'s "What is still owed" lists it beside the three objects
-- here -- adding, importantly, that ADR 0008's scope amendment puts a
-- *scheduled* job INSIDE section 3, unlike the ingest. AGENTS.md reservation
-- 1's release paragraph names three objects and this is a fourth, so it is not
-- inside the authorisation this file rests on.
--
-- What that costs, stated plainly rather than left for a reader to discover:
-- `docs/TELEMETRY.md` promises 90 days for diagnostics, 90 for performance and
-- 30 for gameplay aggregates. **Nothing in this file enforces any of them**, so
-- from the moment a destination is configured this table grows without bound
-- and the promise in that document is a promise the code does not keep -- which
-- is AGENTS.md reservation 4's subject. `telemetry_events_retention_idx` above
-- is the half that can be landed without a scheduler; the scheduler needs
-- `pg_cron` (an extension decision) or an external caller (a deploy decision),
-- and both are the owner's.
--
-- **No `public/_headers` change, no `wrangler.jsonc` change, and no Worker
-- variable.** The ingest is same-origin so `connect-src 'self'` is intact
-- (checklist item 6), and the two variables that would name a destination and
-- hold its credential are deploy configuration -- AGENTS.md reservation 3.
--
-- **No `TelemetryIngestStore` implementation.** `src/worker/` is the merged
-- ingest and this migration reads it rather than editing it. The store that
-- eventually calls `record_telemetry_events` is one implementation of an
-- interface that already exists, and it belongs with the credential it needs.
--
-- **Nothing is applied anywhere.** This file has been executed against a local
-- PostgreSQL and against nothing else, on purpose.
