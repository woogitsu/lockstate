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
+327 bytes minified (+108 gzipped) on the client chunk, with the same again
on the simulation worker chunk (+326 / +93). Two things keep it there:
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
`default-locale-en.ts` is the one built-in `en` catalog covering every
`nameKey` the default room/object/staff-role catalogs use, enough for headless
tests and any current dev UI to show a real label.

**This passage used to continue: *"There is no bundler-loaded translation
pipeline yet (that belongs to a future UI/localization issue)."* There is
one.** `src/services/localization/` ships `MessageCatalogLoader` and
`loadMessageCatalog` (`catalog.ts`), `Localizer` (`localizer.ts`),
`format.ts`, `locale.ts` and the `en-XA` pseudo-locale (`pseudo.ts`) — the
whole of ADR 0011. `src/content/localization.ts` has said the opposite since
that layer landed (*"The actual localization runtime — fallback chains,
plurals, `Intl` formatting, catalog loading and the pseudo-locale — lives in
`src/services/localization/`"*), so the two content-layer documents
contradicted each other rather than both being merely out of date.

**Dated rather than merely contradicted, because the two are different
faults.** The sentence was *true when it was written* and false three and a
half hours later, the same day: `65b5fe2` added this document at 05:10 on
2026-08-23, and `5979b43` added the trusted-services layer including
`src/services/localization/` at 08:42. It is not a claim that was wrong on
arrival; it is one that nothing revisited for the eight months since.

The narrow reading that survives is worth keeping, because deleting the
sentence outright would overcorrect: **nothing yet fetches a catalog.** So the
infrastructure ships and the default locale is bundled; what does not exist is
a wired *remote* catalog fetch, and that is a much smaller absence than "no
pipeline".

**Two halves of that paragraph rotted separately, and both are dated rather
than overwritten.** It used to read *"`MessageCatalogLoader` is an interface,
and the trusted-services layer performs no I/O at all —
`tests/unit/services-layer-boundaries.test.ts` asserts exactly that, with an
empty allow-list."*

- **The port has an implementation.** `41db45d0` (2026-08-31, #678/#662)
  landed `createChunkCatalogLoader` and `switchLocale`: a non-default locale
  is a code-split chunk, fetched by an injected `() => import(...)` thunk when
  a player asks for it. Still nothing *registers* a locale, so "nothing yet
  fetches a catalog" holds — the sentence that stopped being true is the one
  about the interface, not the one about the fetch.
- **The allow-list has not been empty since `bb23e3f3` (2026-08-27)**, which
  wrote down `services/telemetry/http-transport.ts` as the one module in the
  layer that leaves the device. The claim above was written against
  `90703159` (2026-08-24), when the list really was empty.

What the gate asserts today is that no module in the layer performs I/O
*except* that one — and, since #664, that a **dynamic `import()` counts as
I/O there**. `chunk-catalog-loader.ts` passes because its importer is
injected rather than written; a module in this layer that imported a
catalogue chunk directly would fail, which is what keeps the sentence above
honest as a second locale arrives.

## Feeding issue #17's room vocabulary

`src/simulation/rooms/definition.ts`'s `RoomRegistry`/`RoomDefinition`
(issue #17) are unchanged in shape apart from one field.
`roomDefinitionFromCatalog` converts one validated `RoomCatalogDefinition`
into that shape, carrying `nameKey` straight across;
`buildRoomRegistryFromCatalog` does this for a whole catalog — replacing #17's two hard-coded entries
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
catalog rather than this registry. So `buildRoomRegistryFromCatalog` currently has no
consumer in `src/`. **This passage named `defaultRoomRegistry`, an eagerly-built
binding #181 deleted before v0.0.1** — `grep -rn defaultRoomRegistry src/`
returns nothing, and the only mentions left are two tests describing its
removal. **The justification has also been overtaken:** it was kept for the
object-placement work that has since shipped without using it, so what keeps it
is that it is the runtime-side room vocabulary, and it is kept for the same
reason `tests/foundation/unconsumed-content-contract.test.ts` keeps declared
ids that no code reads yet.

**The one field that did change is `RoomDefinition.name`, now `nameKey`.** It
used to be `readonly name: string`, assigned
`resolveLocalizationKey(locale, entry.nameKey)` — an English string, resolved
against `defaultLocaleEnCatalog`, stored in a `src/simulation/` type. ADR 0011
and `docs/ARCHITECTURE.md` both forbid that outright: *"Simulation code may
branch on a stable id; it may never read translated text."* ADR 0011 further
says the rule is *"enforced by a test that keeps `src/simulation/` free of
localization imports"*, and for this module it was not — the test matched the
import *specifier* (`/from ['"][^'"]*localization['"]/`) and this module
imported the resolver from `'../../content'`, the barrel that re-exports it.
Across all 145 files under `src/simulation/` the specifier rule flagged zero,
and exactly one file called the resolver: the one it could not see.
`tests/unit/services-layer-boundaries.test.ts` now also matches the symbols by
name, which no re-export can route around, and `roomDefinitionFromCatalog`
lost its `locale` parameter entirely rather than having it made optional —
there is no longer anything for a caller to pass.

Two things kept this from being a player-visible bug rather than only a
boundary one, and both are worth stating because neither is a reason it was
acceptable. `buildRoomRegistryFromCatalog` has no `src/` consumer (the
paragraph above), so no shipped path executed the resolution; and the
resolution was to `en` in a repository that ships one authored locale, so the
wrong-locale text it would have produced did not yet differ from the right
one. The defect was real in the tree and dead at runtime.

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

**Three catalogues were missing from this list**, which had enumerated rooms,
objects and staff roles only since it was written — the three `src/content/`
shipped with. It now has six, and the three below are 16 of the 62 declared
ids, so a quarter of the census was absent from the section describing the
census. `tests/foundation/unconsumed-content-contract.test.ts` asserts the
total exactly (`declared: 62`) and enumerates all six registries, which is why
the number here can be stated rather than counted by hand:

- **6 items** (`item-catalog.ts`): `item.brick` and `item.wood-plank`, the two
  construction materials the buildable registry consumes and the only two
  `PROCURABLE_MATERIALS` sells; plus `item.food-ration`, `item.clean-linen`,
  `item.dirty-linen` and `item.waste`, which no module outside `src/content/`
  names at all.
- **5 contraband kinds** (`contraband-catalog.ts`): weapon, drug, phone, tool
  and currency.
- **5 security grades** (`security-grade-catalog.ts`): `grade.general`,
  `grade.administrative`, `grade.medical`, `grade.high-security` and
  `grade.staff-only`, each pairing a clearance on the same 0–10 scale as
  `RouteContext.securityClearance` with a permission. `grade.general` is the
  one with a `src/` consumer — `door-wooden` names it so a built door takes its
  clearance and permission from a declared grade rather than hand-picked
  numbers.

## What is out of scope here

Real object *placement* tracking and #17's actual (non-mock) room
validation against placed objects; a bundler-loaded localization/i18n
pipeline; staff hiring, scheduling, jobs or AI (#24/#25/#26); final content
balance or the full long-term catalog; a custom content scripting/DSL
language.
