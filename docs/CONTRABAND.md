# Contraband, intelligence, searches and inspections

This document covers `src/simulation/contraband/` (issue #27): contraband
that emerges from real sources, movement, possession and concealment, an
intelligence ledger that decays and carries uncertainty, and a search
system that turns suspicion and policy into staffed, time-costed,
deterministically-detected outcomes. Like #24-#26 before it, this builds
on already-shipped boundaries (#24's route-context seam, #25's
`Container`/inventory model, #26's `GuardRoster`/`NavigationSystem`/
`resolveStaffRouteContext`) rather than a parallel implementation.

## Hidden state vs. player-visible intelligence

Architecture notes: "hidden simulation state and player-visible
intelligence projections are distinct." `ContrabandRegistry` is the
ground truth of what contraband actually exists, where, and how it got
there -- this is never exposed wholesale to a UI. `IntelligenceLedger`
records are the *only* thing a future security-desk UI would read: a
confidence-scoped, expiring belief about a target, never the raw truth.
`ContrabandRegistry.getMovementHistory` (an item's full source-to-present
trail) is explicitly a **debug tool**, not a normal-UI projection --
"debug tooling can trace an item's source and movement without exposing
it in normal UI."

## Contraband categories: content, not a hidden condition chain

`src/content/contraband-catalog.ts` defines `legalContext`
(`'illicit' | 'restricted' | 'controlled'`), `baseConcealment` (0-10, a
detection-probability penalty, never a hard pass/fail) and `severity`
(0-10, reserved for #28's future incident/disciplinary weighting so that
system doesn't need a parallel severity model) per category. This issue
does not enforce the context/quantity distinction automatically -- every
item a session/scenario introduces is already a confirmed contraband
instance; `legalContext` is descriptive data for future policy work.

## Items: stable identity, one entry point, one exit point

`item.ts`'s `ContrabandRegistry` is the full lifecycle issue #27 requires:
`introduce` (the one and only way an item is created -- no fabricated
stock), `moveHolder` (the one and only way possession changes, appending
to a permanent `movementLog`), and `confiscate` (the one and only way an
item leaves circulation; there is deliberately no further "destroy" --
disposal of confiscated evidence is a future #28 concern). A holder is
`{ kind: 'prisoner' | 'staff' | 'cell' | 'container', id }`: `'prisoner'`/
`'staff'` ids are `EntityStore` ids (as decimal strings) from
`PrisonerOperationsRuntime`/`GuardRoster` respectively -- two separate
numeric-id spaces, so the holder kind disambiguates which registry an id
refers to, mirroring `RouteContext.role`'s own `'staff' | 'prisoner'`
split; `'cell'` is a `RoomInstanceRegistry` instance id; `'container'` is
a real `operations/inventory.ts` `Container` id (e.g. an incoming
delivery crate awaiting inspection).

`byHolder` is indexed by a `Map<holderKey, Set<itemId>>`, not a full scan
-- issue #27's explicit "avoid scanning every entity/item for each search
tick." A confiscated item is removed from that index immediately, so a
later search of its last holder never re-finds it.

## Intelligence: uncertain, scoped and expiring

`intelligence.ts`'s `IntelligenceLedger` stores suspicion records
(`targetKind: 'prisoner' | 'staff' | 'cell' | 'sector'`, `targetId`,
`confidence` 0-1, `sourceType`, an optional `categoryHint`), indexed by
target for the same "no full scan" reason as `ContrabandRegistry`.
Confidence is the *only* mutable field -- "intelligence decays/expires and
carries uncertainty; it is not a permanent truth flag." `IntelligenceSystem`
(a `SystemRegistration`, scheduled every 50 ticks) decays every record's
confidence by a fixed amount; a record that decays to/below
`MIN_INTELLIGENCE_CONFIDENCE` expires and is dropped rather than lingering
as a meaningless entry.

## Informants: a hook, not an AI (yet)

`informants.ts`'s `InformantRegistry` is deliberately a plain, explicitly-
set reliability score per recruited holder -- issue #39 (traits/
relationships, richer informants) does not exist yet, and issue #27's own
dependency note requires "the base interface must work without it."
`reportInformantTip` is the one hook this issue ships: a session/scenario
(or, later, #39's richer informant AI) calls it explicitly to turn a
relationship into an `IntelligenceLedger` record, with a confidence-jitter
draw from the caller-supplied named RNG stream. Nothing here decides *when*
a tip happens on its own -- that decision stays external, exactly like
`resolveEscortedPrisonerRouteContext` (#26) is a resolver, not a scheduler.

## Search policy and detection: explicit factors, named RNG

`search-policy.ts`'s `resolveDetectionProbability` is a pure function of
three explicit factors -- a policy's base probability, a category's
concealment penalty, and the strongest matching intelligence record's
confidence bonus -- clamped to [0,1]. It is the *only* thing standing
between a search and its outcome; the actual coin flip
(`SearchSystem.runDetectionForCurrentTarget`) draws from the
`'contraband.detection'` named RNG stream, entirely separate from
`'contraband.intelligence'`'s informant-tip jitter stream (both
pre-registered on every session's `Kernel` in
`src/simulation/runtime/new-session.ts`) -- "one subsystem's draws cannot
perturb another," proven directly at the RNG-plumbing level in
`tests/unit/contraband-rng-isolation.test.ts`.

## SearchSystem: staffed, real-navigation, multi-target jobs

`search-system.ts`'s `SearchSystem` (a `SystemRegistration`, scheduled
every 10 ticks) implements all four scopes issue #27 names --
`'person'`, `'cell'`, `'sector'`, `'delivery'` -- through one shared
mechanism: a `SearchOrderInput` names a scope and an explicit list of
`SearchTarget`s (`'sector'` sweep supplies several; the other scopes
supply exactly one -- the caller, which already knows sector membership
from wherever it authored the sector/cells, supplies the list rather than
this system inferring it). `submitOrder` enqueues; the order **stays
queued** (observably, via `getMetrics().searchesQueued`/`isQueued`) until
enough of `GuardRoster.unassignedGuardIds()` exist to meet the scope's
policy `requiredGuardCount` -- "searches create jobs and consume staff/
time rather than resolving instantly," and a real staffing diversion,
since every guard a search claims is one `DeploymentSystem` cannot use to
fill a sector shortage that same cycle.

Once staffed, assigned guards travel to each target through the real
`NavigationSystem` (no-teleport, exactly like deployment/patrol travel),
dwell for `dwellTicksPerTarget`, run one detection check per concealed
item currently at that target, then move to the next target or complete.
A route failure to any target cancels the whole order and releases its
guards (retryable via a fresh `submitOrder` call).

### No changes needed to the security module

A search-duty guard's `GuardRoster.DeploymentPhase` gets one new value,
`'on-search'` (the only change to `security/guard-roster.ts` this issue
required). `DeploymentSystem.assignUnassignedGuards` only pulls from
`unassignedGuardIds()` (`'unassigned'` only) and its travel-continuation
loop only touches guards whose phase is exactly `'travelling'`;
`PatrolSystem` only acts on `'on-post'`/`'travelling'` combined with its
own `patrolWaypointIndex` ownership marker. An `'on-search'` guard matches
none of those conditions, so it is invisible to both systems -- exactly
like `'on-post'` already is to `PatrolSystem`'s assignment logic. This is
why `sector.ts`, `deployment-system.ts` and `patrol-system.ts` needed zero
other changes.

## Confiscation: the evidence chain

`confiscation.ts`'s `ConfiscationLedger` is the typed downstream event
issue #27 requires: `ConfiscationEvent` carries the item's full
provenance, where it was found, which search order and guard found it,
and when -- "confiscation records provenance/evidence and emits typed
downstream events." `all()` is read-only inspection; `drain()` is how a
future consumer (#28's incident/disciplinary pipeline, not built yet)
would take ownership of pending events without the ledger growing
unbounded across a long session.

## Snapshot/restore

`ContrabandRegistry`, `IntelligenceLedger`, `InformantRegistry` and
`ConfiscationLedger` all round-trip through fresh instances directly (no
stale cross-references to a `NavigationSystem`). `SearchSystem` follows
#25/#26's "restart rather than assume arrival" convention: every restored
active job re-enters `'travelling'` with a fresh dwell timer and cleared
per-guard path-request bookkeeping (its own, not `GuardRoster`'s --
search travel never touches a guard's shared `pathRequestId` field, so no
`GuardRoster` restore changes were needed beyond the new `'on-search'`
phase value itself). A job restored mid-`'searching'` simply repeats an
already-arrived-at leg (`beginTravelToCurrentTarget` immediately finds
`sameTile` true and issues no requests), extending that leg's wait by at
most `dwellTicksPerTarget` -- never losing search progress.
`tests/unit/contraband-search-system.test.ts` proves a mid-travel search
resuming and completing correctly after a full restore.

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` constructs an empty `ContrabandRegistry`,
`IntelligenceLedger`, `InformantRegistry`, `ConfiscationLedger`, an empty
mutable `searchPolicies` array and an empty `searchContainerLocations` map
(no fabricated contraband, intelligence, informants or policies -- the
same convention every prior issue's wiring follows), registers
`IntelligenceSystem` and `SearchSystem` on the kernel, and pre-registers
both named RNG streams. `SearchSystem`'s default `TargetLocationResolver`
(`locateSearchTarget`) resolves a target's tile from the real registries
already constructed for that session: `PrisonerOperationsRuntime.position`
for `'prisoner'` targets, `GuardRoster.getTile` for `'staff'` targets,
`PrisonerOperationsRuntime.roomInstances` for `'cell'` targets, and
`searchContainerLocations` for `'container'` targets (`Container` itself
carries no position, so a session/scenario using the `'delivery'` scope
must register a real tile per container id there first).

## Scale

`tests/unit/contraband-scale.test.ts` sweeps 40 cells holding 200
contraband items to a fully-resolved, correct state (every item confiscated,
zero missed, zero leftover queued/active jobs) without pathological
slowdown, proving indexed per-target lookups scale the way the issue's
performance requirement demands (wall time logged as directional evidence
only, per `docs/BENCHMARKING.md`'s no-hard-threshold policy).

## What is out of scope here

Final gang economy or a full disciplinary/punishment system (#28); graphic
violence or detailed drug simulation; any UI disclosure of hidden state
beyond authorized intelligence confidence/scope; client-side randomness
(every draw goes through the kernel's own named RNG streams); final
balance of detection probabilities (the policy numbers here are
directional defaults, not a committed design); automatic informant
recruitment/AI (issue #39); automatic escort/incident linkage.
