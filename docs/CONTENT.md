# Content: data-driven room, object and staff-role catalogs

This document covers `src/content/`: issue #23's versioned, validated data
modules for the initial room/object/staff-role catalogs, and how they feed
issue #17's existing room validation contract
(`src/simulation/rooms/definition.ts`).

## Why a separate `src/content/` module

`src/simulation/rooms/` already had a minimal `RoomRegistry`/`RoomDefinition`
(issue #17) with two hard-coded entries and no schema versioning,
localization separation or cross-reference validation. Staff roles have no
existing home at all — they aren't specific to rooms, and future systems
(#25 jobs, #26 security) need them independently of zoning. `src/content/`
is a new, simulation-independent domain for *content* (static, versioned,
validated data) that `src/simulation/rooms/definition.ts` now consumes
rather than duplicates — content flows one way, into simulation code, never
the reverse.

## Schema, versioning and validation

Each catalog (`room-catalog.ts`, `object-catalog.ts`,
`staff-role-catalog.ts`) is a strict Zod schema with its own
`schemaVersion` literal, independent of `SAVE_SCHEMA_VERSION`
(`src/persistence/save-schema.ts`) — an explicit architecture requirement,
since content and save-file compatibility are unrelated concerns that
happen to both need versioning. `loadRoomCatalog`/`loadObjectCatalog`/
`loadStaffRoleCatalog` accept a raw definition array (defaulting to the
built-in representative set), validate every entry against its schema, and
route failures through `buildContentRegistry` (`registry.ts`), which
collects **every** duplicate id/numeric-id/schema failure in one pass
instead of stopping at the first — a startup content error should be a
complete report, not a series of one-at-a-time fixes.

`ContentRegistry.all()` is always sorted by `id`, never insertion or
registration order — issue #23's "content order does not change
deterministic loaded output" requirement holds regardless of how a source
data file happens to list its entries
(`tests/unit/content-registry.test.ts` proves this directly by loading the
same entries in reverse order and diffing the result).

The default catalogs (`defaultRoomContentRegistry`,
`defaultObjectRegistry`, `defaultStaffRoleRegistry`) validate themselves
**at module import time** and throw immediately on any failure — a broken
built-in catalog fails at startup, not on first use deep in gameplay code.

## Cross-reference validation

A room's `'object'`-type requirement names an object by id
(`objectId: string` in issue #17's original shape). Nothing in either
catalog's own schema can catch a *dangling* reference — a room requiring an
object id nobody registered. `validate-catalog.ts`'s
`validateRoomObjectReferences` checks every room's object requirements
against the real object registry and reports each dangling one as a
structured `missing-object-reference` error; **`room-catalog.ts` runs this
once against the default catalogs at its own import time**, immediately
after `defaultRoomContentRegistry` is built, exactly like each catalog's own
self-validation.

It says `room-catalog.ts` rather than `src/content/index.ts` because of
issue #315, and the difference is the whole point. The check used to sit in
the barrel, and this document and the barrel both said it failed fast at
startup. It never ran in a shipped build: `src/content/index.ts` has one
importer under `src/` (`src/simulation/rooms/definition.ts`), whose own only
importer is a test, so nothing in the production graph reached the module and
the bundler dropped it. Measured in the artefact, not inferred from the
source — `dist/assets/index-*.js` contained each catalog's own
`Default room catalog failed validation` / `Default object catalog failed
validation` throw, and no occurrence of `cross-reference validation` at all.
The check ran under `vite dev` and in `pnpm test`; a build a player loads
with a dangling reference booted and broke later, which is the exact failure
the sentence promised it could not.

Running it in production was measured rather than assumed before it was
chosen: 26 object requirements across 18 rooms against 20 objects,
0.12–0.18 ms for the first cold call in each of five fresh processes, and
+327 bytes minified (+109 gzipped) on the client chunk, with the same again
on the simulation worker chunk. Two things keep it there:
`tests/foundation/content-validation-reachability-contract.test.ts` fails if
the module holding the check stops being reachable from `src/main.ts` or the
simulation worker entry, and a `vite.config.ts` plugin fails the build if the
emitted client chunk does not contain the throw — reachable and emitted are
different facts, and only the bundler can settle the second. Both run in CI
via `pnpm verify`.

A barrel is the wrong home for a startup guarantee in general: it is the
module a direct import is free to skip, so whether the guarantee holds
depends on which specifier a consumer happens to write. Beside the registry
it validates, it cannot be skipped — every reader of
`defaultRoomContentRegistry` imports `room-catalog.ts`.

## Localization keys, separate from logic IDs

Every catalog entry carries a `nameKey` (a `LocalizationKey`, itself just a
stable string), never a literal display name. `localization.ts`'s
`resolveLocalizationKey(catalog, key)` looks a key up against an in-memory
`LocalizationCatalog` and falls back to the key itself if unresolved — a
missing translation is visible and debuggable rather than silently blank.
There is no bundler-loaded translation pipeline yet (that belongs to a
future UI/localization issue); `default-locale-en.ts` is the one built-in
`en` catalog covering every `nameKey` the default room/object/staff-role
catalogs use, enough for headless tests and any current dev UI to show a
real label.

## Feeding issue #17's room vocabulary

`src/simulation/rooms/definition.ts`'s `RoomRegistry`/`RoomDefinition`
(issue #17) are unchanged in shape. `roomDefinitionFromCatalog` converts one
validated `RoomCatalogDefinition` into that shape (resolving `nameKey` to
`name` via a locale catalog, `en` by default);
`buildRoomRegistryFromCatalog` does this for a whole catalog and is how
`defaultRoomRegistry` is now built — replacing #17's two hard-coded entries
with issue #23's full, validated, representative set. What the integration
establishes is that a catalog-driven room type resolves, including by the
numeric zoning id a `Uint8Array` zoning plane stores
(`tests/unit/rooms-catalog-integration.test.ts`).

It no longer feeds a *validator*. #17's `RoomSystem.validateRoom` was the
consumer of these definitions' `requirements`, and #123 item 2 deleted it: it
reported every `object` requirement as missing and treated `minimum-size` as
always satisfied, in its own words as a mock, and nothing in `src/` called it.
The single evaluator of room requirements is now `requirementStatus` in
`src/simulation/presentation/room-projection.ts`, which reads the **content**
catalog rather than this registry. So `defaultRoomRegistry` currently has no
consumer in `src/` — it is the runtime-side room vocabulary that real
object-placement work will need, not dead content, and it is kept for the same
reason `tests/foundation/unconsumed-content-contract.test.ts` keeps declared
ids that no code reads yet.

## Representative catalog scope

Per the issue's explicit "small representative content fixtures rather
than the full final catalog" scope:

- **18 rooms** across every named category (cells/holding/solitary,
  reception, kitchen/canteen, shower/laundry, yard/common/classroom,
  infirmary, offices/security/staff room, storage/deliveries/garbage, one
  core utility room).
- **20 objects** covering furniture, sanitation, food-service, security,
  storage, utility and medical categories, each with a `capabilities` tag
  list for future systems (needs, jobs) to query by capability rather than
  by hard-coded object id.
- **8 staff roles**, two per department (administration, security,
  medical, operations), each with a `baseSecurityClearance` on the exact
  0–10 scale `RouteContext.securityClearance`
  (`src/simulation/navigation/route-context.ts`, issue #21) already uses,
  a `permissions` list compatible with `RouteContext.permissions`, and
  `wageBand`/`skills` hooks — placeholders for issue #29's real economy and
  a future skills system, not a balanced economy themselves.

## What is out of scope here

Real object *placement* tracking and #17's actual (non-mock) room
validation against placed objects; a bundler-loaded localization/i18n
pipeline; staff hiring, scheduling, jobs or AI (#24/#25/#26); final content
balance or the full long-term catalog; a custom content scripting/DSL
language.
