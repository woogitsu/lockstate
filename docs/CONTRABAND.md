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
records are one of the things a security-desk UI reads — and, since
`src/simulation/presentation/contraband-projection.ts:53-60` takes five sources
(`searchSystem`, `confiscations`, `intelligence`, `informants` and
`searchPolicies`), not the only one. **This sentence said "the *only* thing"**,
which an added source falsifies without touching it; that projection's own
header (`:22-31`) already restates the intended rule more narrowly. A
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
to a permanent `movementLog`), `confiscate` (the way an item is taken out
of circulation *by the prison*; there is deliberately no further "destroy"
-- disposal of confiscated evidence is a future #28 concern), and
`departHolder` (the way an item leaves *with its holder*). A record is
never deleted by any of them. A holder is
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

**`'departed'` is the third `ContrabandState`**, added by
[ADR 0061](./adr/0061-what-the-prison-produces-on-its-own.md) with the
introduction route below: a prisoner who is discharged, or who gets out
through an escape attempt nobody contained, takes what they were concealing
with them. It is not a fourth way for an item to leave from *inside* the
prison -- nothing consumes or destroys one -- and the record and its movement
log survive, because issue #27 asks for provenance "sufficient for debugging
and evidence". Left `'concealed'` instead, the item would sit at a holder key
naming a destroyed entity for the rest of the session, and
`tests/unit/prisoner-release-completeness.test.ts` could not see it: that gate
walks the session graph for the numeric `EntityId`, and a `ContrabandHolder.id`
is a string.

## How contraband gets in

`introduction.ts`, and it is the answer to a sentence that stood in this
document's wiring section for months: *"no fabricated contraband ... the same
convention every prior issue's wiring follows"*. That convention is intact --
**a session that admits nobody holds no contraband, for ever** -- and what
changed is that "until a session introduces them" now has a producer inside
`src/` instead of waiting for a scenario format that does not exist.

At the `classification` stage of intake, where an arrival's `RiskTier` is
written, one draw on `contraband.introduction` decides whether they are
concealing something and a second decides what. `IntakeSystem` takes it as an
optional injected port, exactly as it already takes `ActorIdentityMinter`.

- **Who the player admits decides both halves.** The chance rises with the tier
  (0.10 at tier 0 to 0.40 at tier 3) and so does the band of the catalogue they
  can draw from: the `2 + tier` least severe entries in `severity` order. Only
  an arrival classified high risk can bring a weapon in. That is a prefix of an
  authored ordering rather than a second weight table, so a category added to
  `contraband-catalog.ts` places itself by its own `severity`.
- **The id is derived, not allocated** ([ADR 0012](./adr/0012-derived-identifier-reproducibility.md)
  category 2): `contraband.intake.<entityId>.<tick>`, so no counter joins the
  save payload and a restored session mints exactly what a continuous one did.
- **Why the arrival and not the delivery.** The substrate anticipates the
  delivery route most concretely — `SearchScope` declares `'delivery'`,
  `ContrabandHolderKind` declares `'container'`, and `searchContainerLocations`
  exists for it. It is the one route that cannot be built: `ProcurementSystem`'s
  own header records that `room.delivery-bay` and `object.loading-dock-door`
  "are declared content that no session instantiates (#141)", so a delivery
  lands in a container with no location and `locateSearchTarget` throws for one.
  Contraband introduced there would be unreachable by the system built to find
  it.

## Who orders a search

**This section read *"What the prison cannot yet do about it is order a search.
`SearchSystem` is complete and `submitOrder` has no production caller,
`searchPolicies` is empty in every session, and there is no command type. So a
prison now holds contraband it has no way to look for, and that half is the
owner's — ADR 0061 open question 1."*** Every sentence of that was true and the
first two are now false, which is why it is marked rather than overwritten:
issue #552 reported the visible consequence — the status strip's **Contraband**
figure reads `getMetrics().itemsDiscovered`, so it was structurally pinned at 0
— and [ADR 0073](adr/0073-who-orders-a-contraband-search.md) answers it in two
parts.

**Four default policies, always** (ADR 0073 Part 1). `default-search-policies.ts`
authors one policy per `SearchScope` as an exhaustive `Record` over the union,
and `applyDefaultSearchPolicies` fills only the scopes a list lacks. It runs in
`createNewSimulationRuntime` *and* after the payload in `restoreSessionSystems`,
exactly like `applyDefaultSecuritySector` and for its reason: every save written
before ADR 0073 carries `searchPolicies: []` and would otherwise be the one place
`findPolicy` still throws. **No save-schema bump and no migration** — the
payload already carries the array, and absence is honoured with a value.

**A standing sector duty, not a player command** (ADR 0073 Part 2, Option A).
`SectorSearchDutySystem` (`contraband.search-duty`, order 288) submits one
sweep per **staffed** sector every `DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS` (600,
a quarter of an in-game day), over a window of at most four of that sector's
occupants that rotates by a whole window each sweep, so every prisoner is
reached in `ceil(population / 4)` sweeps rather than the same few for ever. It
holds no state: "is a sweep outstanding" is a prefix scan of
`SearchSystem.orderIds()` and the window is derived from the tick, so nothing
new enters the payload.

**Two conditions, and they are the cost.** A sector orders nothing unless (1)
a guard is assigned to it and (2) the claimable pool can staff the order.
ADR 0073's Option A says *"guards on post search their own sector"*; taken
literally that is not implementable, because `assignQueuedOrders` staffs from
`claimableGuardIds` — the unassigned, post-eligible pool (ADR 0053) — never
from a posted guard, so an order in a fully-posted prison would queue for ever.
So the duty is *a staffed sector runs sweeps and a **spare** guard walks them*:
a prison that hires exactly its posted requirement finds nothing, and the first
hire past it is what makes contraband findable. Measured through the real
command path (twelve admissions, three guards, sixteen in-game days): 63 sweeps
completed, both introduced items found, none queued and none cancelled — against
0/0/0 on the same prison and seed before ADR 0073
(`tests/integration/contraband-search-duty.test.ts`).

**What is still the owner's** is ADR 0073's Option B, the targeted search
control: search *this* cell, *this* person, sweep *that* sector. The ADR
recommends not building it until a standing duty has been played, because its
whole value is letting a player spend guards deliberately and nobody yet knows
what a search costs.

What contraband *does* beyond being found is feed the two incident
producers ADR 0061 added: it is a term in the assault score and a precondition
of an escape attempt (`docs/INCIDENTS.md`, "Three producers").

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
enough post-eligible unassigned staff exist (`claimableGuardIds`,
[ADR 0053](./adr/0053-who-may-stand-a-security-post.md)) to meet the scope's
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
future consumer (#28's incident/disciplinary pipeline, **which has since been
built** — `src/simulation/incidents/` and
`src/simulation/prisoners/disciplinary-record.ts`, whose `:76-80` explicitly
declines to `drain()`, so `drain` still has no caller in `src/`)
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
`IntelligenceLedger`, `InformantRegistry`, `ConfiscationLedger`, a
`searchPolicies` array and an empty `searchContainerLocations` map
(no fabricated contraband, intelligence or informants -- the
same convention every prior issue's wiring follows; see "How contraband gets
in" above for what that convention does and does not now mean). **The policy
array is no longer among the empty ones**: `applyDefaultSearchPolicies` fills
it before anything can order a search, because an empty list makes
`findPolicy` throw rather than making a subsystem inert (ADR 0073 Part 1, and
"Who orders a search" above). It registers
`IntelligenceSystem`, `SectorSearchDutySystem` and `SearchSystem` on the kernel, and pre-registers
all three named RNG streams -- `contraband.detection`,
`contraband.intelligence` and, since ADR 0061, `contraband.introduction`.
The third is separate from the other two for the reason they are separate
from each other (issue #27's *"one subsystem's draws cannot perturb
another"*): admitting a prisoner must not shift the sequence a search checks
concealment against. `SearchSystem`'s default `TargetLocationResolver`
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
