# What does not survive a save/restore round trip, by mutation

**Question:** #825 fixed one field (a security sector's `postTile`/`patrolRoute`)
that a save carried and a restore silently discarded in favour of a fresh
derivation — the derivation overwrote the payload, and
`tests/integration/security-default-sector.test.ts` had pinned only that the
derived and saved definitions were *identical*, never that a *differing* one
survives. Is that the only field with that shape? Read `docs/adr/0038-what-
makes-a-save-compatible.md` first — **not** ADR 0042, which is about
consequences and was named in error in an earlier brief. `SAVE_SCHEMA_VERSION`
is 5. Measured on a worktree cut from `origin/main` at `aa762112` (v0.0.383),
`git fetch origin main` immediately before use.

## Method

For every field the save schema carries: capture a bundle from a real,
populated session, hand-edit one field's value in the decoded object (the same
edit a hand-edited save file would produce — `restoreSimulationRuntime` and
`restoreSessionSystems` take the already-decoded bundle, not raw JSON, so
mutating the object *is* the hand edit), restore through the real
`restoreSimulationRuntime` entry point, re-capture, and compare. A field that
comes back as the derivation rather than the payload is a finding. The inverse
was also checked: is anything the runtime holds absent from the schema
entirely, so it is lost on every reload regardless of what a save contains.

All measurement ran through a scratch vitest file
(`tests/determinism/zz-scratch-audit.test.ts`), created, run, and **deleted
before this note was written** — nothing was left under `tests/`. Restored by
hand: `git status --porcelain` in the worktree is empty.

## What was enumerated

`src/persistence/save-schema.ts`'s V5 payload has 7 top-level fields
(`masterSeed`, `kernel`, `world`, `construction`, `entities`, `simulation`,
`identity`), and `simulation` itself has 9 subsections (`prisoners`,
`operations`, `navigation`, `security`, `contraband`, `incidents`, `objects`,
`alerts`, `economy`) — **16 addressable sections** in total. The consumer is
`restoreSimulationRuntime` (`src/simulation/runtime/restore-session.ts:373`),
which calls `restoreSessionSystems`
(`src/simulation/runtime/session-systems.ts:696`) for the `simulation` section.

## What was actually round-tripped by measurement (this pass)

Hand-edited to a legal, non-default, differing value and restored through the
real entry point, in one session (rich scenario:
`buildDeterminismScenario(SCENARIO_SEED)`, 50 ticks, then captured):

| Field | Section | Result |
| --- | --- | --- |
| `masterSeed` | top-level | **MEASURED — survives.** `999999` in, `999999` out. |
| `roomInstanceDefinitions[].width`/`.height` | `prisoners` | **MEASURED — survives.** A row that already carries a rectangle (2x3) is authoritative over the world's zoning plane (`bounds-recovery.ts:181-184`, the row is `claimed` but never added to the `recovered` map); mutated to 4x5, restored as 4x5. |
| `sectorDefinitions[].postTile`/`.patrolRoute`/`.expectedPatrolLoopTicks`, **default sector** | `security` | **MEASURED — survives.** ADR 0092 decision 3's `redefine` path, re-verified independently of `security-default-sector.test.ts`: `(20,21)`, a 2-waypoint route and `77` all came back unchanged. |
| `sectorDefinitions[].gradeId`, **default sector** | `security` | **MEASURED — silently discarded.** Mutated to `grade.high-security`; restored value is `grade.general`, the derivation's, not the payload's. Same shape as #825. |
| `sectorDefinitions[].doorIds`, **default sector** | `security` | **MEASURED — silently discarded.** Mutated to `['door-1']`; restored value is `[]`, the derivation's. |
| `sectorDefinitions[].postTile`, **scenario-authored sector** (`sector-a`) | `security` | **MEASURED — survives.** A sector id the runtime does not already hold takes the `register` branch, not `redefine`, so every field wins. |
| `searchPolicies[].baseDetectionProbability`, existing scope (`cell`) | `contraband` | **MEASURED — survives.** `applyDefaultSearchPolicies` only fills scopes the payload lacks. |
| `intelligenceSequence` | `contraband` | **MEASURED — survives.** |
| `guards.records[][1].sectorId` | `security` | **MEASURED — survives.** Plain `loadSnapshot`, no derivation in the path. |
| `economy.payroll.unpaidWagesMinorUnits` | `economy` | **MEASURED — survives.** |
| `identity.entries[].givenName`/`.familyName` | `identity` | **MEASURED — survives.** |
| `alerts.dismissed` | `alerts` | **MEASURED — survives.** `SimulationEventLog.loadSnapshot` filters dismissed ordinals against the just-loaded `records`, in the right order (`records` assigned first, `retained` computed from it, `dismissed` filtered against `retained`) — read to confirm the ordering is not a bug, then measured. |

**7 of 16 sections got a direct hand-edit-and-restore measurement this pass**
(`security`, `prisoners`, `contraband`, `economy`, `identity`, `alerts`, plus
the top-level `masterSeed`).

## The one finding: the default security sector's `gradeId` and `doorIds`

**Confirmed by measurement, same shape as #825, not yet covered by any test.**

`SecuritySectorRegistry.redefine` (`src/simulation/security/sector.ts:115-136`)
is deliberately restricted to `postTile`/`patrolRoute`/`expectedPatrolLoopTicks`
— its own docblock names the reason: `gradeId` and `doorIds` are what
`normalDoorStates` was captured against at `register` time, and changing them
without re-registering would desynchronize a sector's baseline door states
from the doors it claims to govern. That is a real invariant and the exclusion
reads as **deliberate**, not an oversight — ADR 0092 decision 2 argues it at
length. But the runtime the restore path is handed always already holds the
derived default sector (`createNewSimulationRuntime` registers it,
`restoreSimulationRuntime` builds the session with that call) — so **every**
restore of **every** save takes the `redefine` branch for the default sector's
row, never `register`, and a save whose row for
`security-sector.prison` carries a different `gradeId` or `doorIds` than the
derivation loses that difference silently, every time, with no error and no
`RestoredScope` entry saying so.

`tests/unit/security-default-sector.test.ts:166-173` and
`tests/integration/security-default-sector.test.ts:549-591` both exist and
both differ a sector's fields on purpose, but neither differs `gradeId` or
`doorIds` specifically through the real restore path with a pre-existing
runtime — the unit test's case registers the sector directly
(`t.sectors.register(authored)`, bypassing `restoreSessionSystems` and its
`redefine` restriction entirely), and the integration test's differing-value
case (line 571) mutates only the three fields `redefine` accepts, and then
explicitly asserts the restored sector's `gradeId`/`doorIds` equal the
**derived** ones (line 580-581) — correctly, for what it is testing, but that
assertion is the untested boundary, not evidence against it.

**Currently unreachable by any player action**, which is why this is reported
rather than fixed. `redefine`'s only caller in `src/` is
`restoreSessionSystems` itself; nothing in `src/` ever calls it with a
different `gradeId` or `doorIds`, and no command in `src/simulation/protocol`
changes a sector's grade or its governed doors. So no save a real session can
produce today carries a default-sector row whose `gradeId`/`doorIds` differ
from the derivation — the gap is real but latent, exactly the state #825's bug
was in before a route-drawing command existed to reach it. It becomes live the
moment a feature reassigns a sector's grade, or a door construction feature
extends the default sector's perimeter, without also updating this restore
path — which is why it is named now rather than left for that feature to
discover the hard way.

**Proposed shape**, not applied (persistence is ADR 0038 territory, out of
this pass's authority): either (a) extend `redefine` to accept `gradeId` and
re-derive `normalDoorStates` for the sector's `doorIds` at redefine time the
way `register` does, which repairs the invariant the exclusion protects rather
than just documenting around it, or (b) if `gradeId`/`doorIds` should stay
fixed for the *derived* default sector specifically (an argument the ADR
gestures at but does not make explicitly — the default sector's grade and
doors are not authored, they are a fact about being the whole-prison
fallback), state that as a rule about the default sector rather than as a
general limit of `redefine`, and add the test this pass's mutation stood in
for: a differing `gradeId`/`doorIds` in the payload, restored, asserted lost,
with the assertion naming *why* rather than silently matching current
behaviour.

## What was read but not independently hand-mutated this pass

Nine sections (`kernel`, `world`, `construction`, `entities`, `operations`,
`navigation`, `incidents`, `objects`) were read rather than mutated by this
pass specifically, for the reasons below — each is a **READ** verdict, weaker
than the **MEASURED** ones above:

- **`kernel` (RNG streams, tick, command queue).** Already the subject of ADR
  0038 itself and `tests/determinism/save-rng-stream-compatibility.test.ts`
  (four of seven cases red on the pre-ADR-0038 tree, per that ADR's own
  acceptance-criteria section) — MEASURED, but not by this pass, by the ADR
  that shipped six minutes after it.
- **`construction`.** ADR 0038's own "Alternatives considered" names
  `ConstructionSystem.restore` as having "the same replace-without-checking
  shape" as the pre-fix sector bug, **deferred rather than fixed**, and
  measures it producing a `TypeError` on corruption (`orders` replaced by
  junk → `Cannot read properties of undefined (reading 'map')`). That is a
  different failure shape from this pass's brief (a crash, not a silent
  discard of a legal differing value), so it is out of scope here, but it is
  the same open item ADR 0038 already named and it is still open.
- **`operations` (containers/jobs/utility networks), `incidents`.**
  `restoreSessionSystems` applies these with a plain `loadSnapshot` call and
  no conditional "already exists, skip" branch anywhere in the path (grepped:
  the only two `=== undefined ?` register guards in
  `src/simulation/runtime/session-systems.ts` are the room-bounds recovery,
  confirmed payload-wins by reading `bounds-recovery.ts:181-184`, and the
  security-sector redefine dance above) — so the #825 shape structurally
  cannot occur here. `tests/determinism/snapshot-restore-fidelity.test.ts`'s
  `roundTripIsExact` cases already measure a differing donor value surviving
  `loadSnapshot` for `contraband`, `intelligence`, `confiscations`,
  `incidents`, `gangs`, `sectorRisk`, `containers`, `roomInstances` and
  `incidentTriggerSystem` directly (not through the full
  `restoreSimulationRuntime`, but at the same call each subsystem's own
  `loadSnapshot` makes) — re-run this pass, 41/41 green.
- **`world`, `entities`, `navigation` (doors).** `doorsSnapshot`
  (`session-systems.ts:529-534`) deliberately writes a **governed** door's
  *baseline* state rather than its live one (documented at length,
  `getBaselineDoorStates`'s own comment) — read and reasoned about rather than
  measured this pass, and it is not the #825 shape: the payload's own baseline
  value is what is restored verbatim; nothing here is a derivation overwriting
  the payload.
- **`objects` (placedObjects).** Captured and restored unconditionally
  (`objects: { placedObjects: runtime.placedObjects.getSnapshot() }`, no
  `pruneUndefined` removal path since the value is never `undefined`);
  `restoreSessionSystems` calls `runtime.placedObjects.loadSnapshot(...)`
  directly with no pre-existing state to conflict with (a fresh runtime places
  nothing before restore). Read, not measured.

## The inverse: runtime state absent from the schema

Nothing new found. Every gap this pass located was already named and reasoned
about in `src/`, and each carries its own justification for why the loss is
acceptable:

- **The loan book and the overdraft floor** (ADR 0075 decision 2).
  `TreasurySnapshot` is `{ balanceMinorUnits }` and nothing else — an
  outstanding principal and the floor that let a session spend it do not
  survive a save. `src/simulation/economy/loans.ts` calls this a gap in its
  own comment, and `tests/determinism/loan-ledger-restore-boundary.test.ts`
  already measures what a reload forgives (cited, not re-run this pass).
- **`RefusalLog` (`runtime.refusals`).** Deliberately not snapshotted — a
  notice about an action the player just took, not a condition of the prison.
- **`InsolvencyRungSystem`'s `standing`/`seeded` state.** Deliberately kept in
  memory only; the class's own comment argues at length why re-seeding from
  the restored treasury balance on the first `update()` after a load is safe
  and produces no false notice.
- **`RoomZoningService.recentRefusals`, `ObjectPlacementService`'s bounded
  refusal window.** Same class as `RefusalLog`.
- **Navigation and room geometry caches**
  (`CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion`). Named in the
  schema's own restored-scope constant; a restored session rebuilds these
  rather than carrying them, and `restored-scope.test.ts` pins the labels.

None of these are new findings — each is already documented in `src/` with a
reason, and most already have their own dedicated test. They are listed here
only because item 3 of the brief asked the inverse question to be checked
explicitly, not assumed answered by the absence of a complaint.

## What the four existing round-trip suites do not cover, read rather than
## trusted by name

- **`snapshot-restore-fidelity.test.ts`** exercises every subsystem's own
  `loadSnapshot` with a differing donor value (thorough, and it is what makes
  the `operations`/`incidents` READ verdicts above safe to make) but never
  calls the full `restoreSimulationRuntime` → `restoreSessionSystems` pipeline
  with a payload row for an id the runtime **already holds before restore** —
  the one shape #825 lived in and the one this pass's finding lives in too.
  Its one test that does go through the full pipeline with a real scenario
  (`'a captured bundle survives a restore with only the documented in-flight
  travel reset...'`) asserts sections are *unchanged* across an untouched
  round trip, never that a *differing* value survives — the same gap ADR 0092
  itself named in `security-default-sector.test.ts` before landing its fix.
- **`operations-snapshot-restore.test.ts`** tests four subsystems
  (navigation, containers, jobs, utility networks) built and wired **by
  hand**, entirely outside `src/persistence` and `restoreSessionSystems` — it
  proves the subsystems' own `loadSnapshot` contracts, not the save-schema
  restore path at all.
- **`local-save-durability.spec.ts`** and **`local-save-migration.spec.ts`**
  (both Playwright, not run this pass — no `src/` or rendering change to
  verify, and the finding above needed no browser) test the **storage
  mechanics**: IndexedDB generation retention, corrupt-generation fallback, V1
  migration triggering on a real navigation. Neither inspects a single
  simulation field's value after restore; both would pass unchanged whether or
  not the `gradeId`/`doorIds` gap above exists.
- **`security-default-sector.test.ts`** (both the unit and integration files)
  is the one suite that does test the #825 shape directly, and does so well —
  see "The one finding" above for exactly where its coverage stops.

## Corrections to the brief

- The brief's own correction stands: ADR 0038, not 0042, is the save-
  compatibility ADR. Confirmed by reading both — 0042 is
  "Attaching consequences to the simulation loop."
- Nothing else in the brief was found wrong. `SAVE_SCHEMA_VERSION` is 5,
  confirmed; `src/persistence/` holds 28 files, confirmed by `find`; #825's
  description of the prior bug (sector definition silently discarded, payload
  overwritten by derivation) matches ADR 0092's own account exactly.

## Weakest claim

The `gradeId`/`doorIds` finding is currently **inert** — no code path in
`src/` produces a save whose default-sector row differs from the derivation in
those two fields, so today's players cannot lose anything to it. That is
stated plainly above and is not a hedge: it is the whole reason this is a
finding to record rather than a defect to escalate. What would change that:
any future command that changes a sector's grade or extends its governed-door
set (a natural companion to the patrol-route command ADR 0092 anticipates).
