# Security: sectors, access policy, guard deployment and patrols

This document covers `src/simulation/security/` (issue #26): data-driven
security sectors with a control-state cascade onto doors, a formalized
staff/prisoner/escort access-policy surface, a minimal guard roster, and two
`Kernel`-registrable systems that deterministically deploy guards to sector
posts and walk patrol routes. Like #22-#25 before it, this builds on
already-shipped boundaries (#21/#22's `NavigationSystem`/`DoorRegistry`,
#23's staff-role catalog, #24's `routeContextResolver` seam) rather than a
parallel implementation.

## Security grades: classification policy as content, not code

`src/content/security-grade-catalog.ts` defines a security grade as the
access requirement a sector's governed doors enforce: a minimum
`RouteContext.securityClearance` (the same 0-10 scale
`staff-role-catalog.ts`'s `baseSecurityClearance` already uses) and an
optional `requiredPermission` that substitutes for the clearance floor
(e.g. a nurse below a wing's clearance still enters via `'medical-wing'`,
matching #21's single-door `checkDoorAccess` semantics applied at sector
scope). `createGradedDoor` authors a door from a grade id rather than
hand-picked `requiredSecurityClearance`/`requiredPermission` values that
could silently drift from the sector's stated grade.

## Sectors: a control-state cascade onto real doors

`sector.ts`'s `SecuritySectorRegistry` holds each sector's static definition
(`id`, `gradeId`, the `doorIds` it governs, a `postTile`, and an optional
`patrolRoute`) plus its mutable `SectorControlState`
(`'normal' | 'restricted' | 'lockdown'`). `setControlState` is an explicit
command, not a per-tick scan -- "emergency overrides are explicit
commands/state transitions, not scattered booleans" -- and cascades onto
every governed door through `DoorRegistry.setState`, the only door mutation
entry point #21/#22 expose, so a sector transition never bypasses
navigation's own access-revision/cache invalidation:

- **`'normal'`** restores each door to its state at sector *registration*
  time (its baseline).
- **`'restricted'`** closes every governed door whose baseline wasn't
  already `'locked'` (a door that's always locked, e.g. a vault, stays
  locked; everything else tightens to `'closed'` -- still passable with the
  right clearance/permission, at a higher traversal cost).
- **`'lockdown'`** locks all of them (passable only via
  `RouteContext.emergencyOverride`).

Each transition is computed from a door's *baseline* state, never its
just-prior control state, so repeated transitions (e.g. lockdown then
restricted) are order-independent -- a real bug found and fixed while
building this: computing `'restricted'` from a door's current state made a
door that had only ever been locked by a prior lockdown call stay locked
instead of relaxing to closed.

## Access policy: one authoritative surface, not per-caller hand-rolling

`access-policy.ts` formalizes issue #26's "staff-only, prisoner
classification, escort and emergency access rules":

- `resolveStaffRouteContext(staffRoleId)` reads a staff role's clearance and
  permissions straight from #23's catalog -- no forked/duplicated data.
- `resolvePrisonerRouteContext` (a drop-in `PrisonerRouteContextResolver`,
  the exact seam #24's `ActionSystem`/`PrisonerJobWorkerAdapter` already
  expose) formalizes classification-group access as explicit, versioned
  data: general-population prisoners hold the `'general-population'`
  permission; high-risk prisoners hold none, relying on an escort for
  anywhere beyond their own regime-permitted blocks.
- `resolveEscortedPrisonerRouteContext(escortStaffRoleId)` resolves an
  escorted prisoner's route under the *escorting staff member's* access
  rather than their own (`role` stays `'prisoner'`, clearance/permissions
  borrow the escort's) -- verified end-to-end against the real router in
  `tests/unit/security-access-policy.test.ts`: a high-risk prisoner escorted
  by a nurse can cross a `'medical-wing'` door a bare high-risk context
  cannot. Automatically *scheduling* an escort (deciding when a prisoner
  needs one and pairing them with an available staff member) is a future
  gameplay/incident concern, out of scope here -- this issue ships the
  access-policy resolver, callable wherever a session/scenario or a future
  escort system already knows the pairing.

Nothing in #24/#25 needed to change: these resolvers are drop-in
replacements for the seams those issues already parameterized.

## Guard roster: the first production staff entity

`guard-roster.ts`'s `GuardRoster` is the first production wiring of
`EntityStore` for a *staff* entity, matching #24's precedent of "first
production wiring... for prisoners." Realistic guard headcounts are tens,
not thousands, so every field lives in a small `Map` rather than a
hot-SoA-component treatment -- there is no per-tick hot path at this scale
(see `tests/unit/security-scale.test.ts`'s 60-sector/120-guard benchmark).
A guard's `deploymentPhase` and optional `patrolWaypointIndex` are the only
fields `DeploymentSystem` and `PatrolSystem` need to coordinate ownership of a
travelling guard (see below). **This sentence used to write the phase out as
`'unassigned' | 'travelling' | 'on-post'` and that was three of four**: issue
#27 added `'on-search'` for a guard pulled onto search duty, which is
`contraband/search-system.ts`'s own bookkeeping and is invisible to both
systems above. The union is named rather than copied here now, because a list
in prose is the part that rots.

A **fifth** word reaches a Staff panel row, `Returning`, and it is deliberately
not a member of that union -- see *A guard restored halfway to its post* under
Snapshot/restore below.

## Who may stand a post

A staff member may be claimed for a security duty -- a sector post, an
incident response, a contraband search -- only if their role is in a
department `POST_ELIGIBLE_STAFF_DEPARTMENTS` names
(`src/content/staff-role-catalog.ts`). Today that list is `security` alone, so
`staff-role.guard` and `staff-role.security-chief` are the two roles of eight
that can be sent anywhere. [ADR 0053](./adr/0053-who-may-stand-a-security-post.md)
decides it and issue #456 is what it closes.

The rule is read in exactly one place, `claimableGuardIds`
(`src/simulation/security/post-eligibility.ts`), which `DeploymentSystem`,
`IncidentResponseSystem` and `SearchSystem` each call where they used to call
`GuardRoster.unassignedGuardIds()` directly. `GuardRoster` itself is unchanged:
`unassignedGuardIds()` still answers who has no assignment, which is what the
Staff panel's `unassigned` headcount is a count of.

`StaffHiringService` refuses a hire into an ineligible role outright
(`hire.no-duty-for-role`), because nothing in `src/` removes a staff member from
the roster and `PayrollSystem` bills every id on it at every day boundary -- so
such a hire would be a permanent wage for no effect. A save written before this
rule can still carry one, and the claim filter is what stops those from covering
a post.

Measured on `bb3a01e`, in the three-prisoner one-bed prison
`tests/integration/security-default-sector.test.ts` builds, hiring an
administrator, a nurse, a cook, a doctor and a warden through the real command
path: **zero refusals, the administrator `on-post`, coverage
`required: 1, assigned: 1, shortage: 0`, and over 30,000 ticks four riots -- all
four resolved, sixteen responders dispatched, nobody injured.** Under the rule
the same prison has six riots, all six lapsed, nobody dispatched and eighteen
injuries, which is what a prison with no guards should look like.

**Both figures are riot counts, and a riot is no longer the only thing that
prison produces.** Since
[ADR 0061](./adr/0061-what-the-prison-produces-on-its-own.md) the same
unguarded, unhoused prison also opens `'assault'` incidents in the stretches
between riot windows -- `tests/integration/security-default-sector.test.ts`
pins one of them, at `incidentsTriggered: 2` against `riotsTriggered: 1`. The
riot half of the measurement above was **not** re-run at 30,000 ticks for this
change, so it is left as the measurement it was rather than restated as a
current one; what was re-measured, across seven prisons at 30,000 ticks each, is
that no riot count and no peak sector risk moved, and that table is in ADR 0061's
Consequences.

## Deployment: filling sector requirements without teleporting

`deployment-schedule.ts`'s `DeploymentSchedule` states a sector's required
guard headcount, optionally varying by tick-of-day on the same
`DAY_LENGTH_TICKS` clock #24's `RegimeSchedule` uses (a deployment schedule
and a prisoner regime schedule share one clock without coupling their
typings). A sector with no schedule entry requires zero guards -- no
fabricated demand.

`deployment-system.ts`'s `DeploymentSystem` (a `SystemRegistration`,
scheduled every 10 ticks) deterministically fills each sector's shortage
from **post-eligible** unassigned guards (ascending entity id; see "Who may
stand a post" below) and drives every assigned
guard to its `postTile` through the real `NavigationSystem` -- staff do not
teleport into deployment zones. `getCoverageReport(tick)` exposes
per-sector required/assigned/shortage counts, sorted by sector id, without
fabricating coverage that doesn't exist. A route that fails
(`permission-denied`/`unreachable`) unassigns the guard rather than leaving
it stuck -- retryable on the next assignment cycle, not a permanent loss of
coverage.

## Patrols: routes as continuous loops with on-time/late/missed outcomes

`patrol-system.ts`'s `PatrolSystem` (a `SystemRegistration`, scheduled every
10 ticks) walks a sector's optional `patrolRoute` as a continuous loop for
every `'on-post'` guard whose sector defines one -- a sector with no route
gets static coverage only from `DeploymentSystem` alone. Each leg travels
through the real `NavigationSystem`, exactly like deployment travel. A
completed loop is recorded **on-time** or **late** against the sector's
`expectedPatrolLoopTicks` budget (meaningless, and omitted, for a sector
with no route); a leg that fails routing is recorded **missed** and the
guard returns to `'on-post'` idle, ready for the next loop from wherever it
actually is -- never a permanent loss of patrol coverage.

A second real bug found and fixed while building this: `GuardRoster`'s
restore path reset a travelling patrol guard's waypoint index to `0`
instead of `undefined`, which `PatrolSystem`'s resume condition doesn't
recognize as "idle, ready for the next loop" -- guards were permanently
stuck after any restore mid-patrol (see Snapshot/restore below).

## Snapshot/restore

`SecuritySectorRegistry` snapshots only *mutable* control state (like
`RoomInstanceRegistry`, static definitions are assumed re-registered
identically by session/scenario setup before `loadSnapshot` runs) and
reapplies `setControlState` per sector on restore, so governed doors end up
consistent with the restored state rather than relying on the doors
themselves having been separately restored (#21/#22's `DoorRegistry` has no
snapshot/restore of its own -- out of #26's scope; a real restore
reconstructs the world/doors fresh from their originally-authored
definitions).

`GuardRoster` snapshots its `EntityStore` plus every guard record. A guard
restored mid-`'travelling'` (deployment *or* patrol leg) referenced a path
request against the *previous* `NavigationSystem` instance's queue, which a
fresh one never received -- `loadSnapshot` drops such a guard back to
`'on-post'` (if it has a sector; deployment already happened once) or
`'unassigned'` (otherwise), with its `patrolWaypointIndex` reset to
`undefined` so `PatrolSystem` resumes the loop on the next scheduled tick
instead of waiting forever. `tests/unit/security-snapshot-restore.test.ts`
proves a sector's `'restricted'` override, a guard mid-patrol-leg and a
still-unassigned guard all restoring correctly together in one scenario,
matching #25's combined-not-per-class restore-test convention.

### A guard restored halfway to its post

**The reset above is right and the word it left behind was not** (the owner's
ruling 24 of 2026-08-31, answering the question
`docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md` §C.1 handed
over rather than settled). `'on-post'` is an assertion about a tile -- the
guard is standing on its sector's `postTile` -- and a guard restored mid-walk
is settled on that phase while standing wherever the walk had got to. The
projection therefore checks the assertion instead of repeating it: a guard
whose phase is `'on-post'` and whose tile is not the post tile is shown as
**Returning** (`src/simulation/security/deployment-phase.ts`,
`displayedDeploymentPhase`).

Two properties are the whole of the design:

- **Derived, never stored.** `DisplayedDeploymentPhase` is
  `DeploymentPhase | 'returning'` and exists only in the view model, so
  `guardRecordSchema`'s closed `deploymentPhase` enum is untouched and
  `SAVE_SCHEMA_VERSION` stays 5. A widening would have been legal without a
  bump (ADR 0038 §1) but would have cost an older build the ability to read a
  save that recorded the value, and would have put the question "what does
  this mean to me" to every reader of the phase. The label comes from
  `simulation-message-keys.ts`'s `deployment-phase` group as an
  `additionalIds` entry.
- **A returning guard counts toward coverage**, exactly as it did while it was
  reported as `'on-post'`: `assignedGuardCountFor` counts every guard whose
  phase is not `'unassigned'`. The alternative would have made every reload
  invent a shortage, which `assignUnassignedGuards` would fill on its next
  cycle -- a prison coming back with more guards posted than it was saved
  with.

The word ends on its own, and something had to be added for that to be true.
`DeploymentSystem.walkBackToPost` sends a guard back to a post it holds and is
not standing on; a sector with a patrol route is left to `PatrolSystem`, which
starts the loop from wherever the guard stands and takes the phase to
`'travelling'`. Before this, a restored guard in a sector with **no** route
stood where it was for the rest of the session -- and since ADR 0036 that is
every session a player can start.
`tests/integration/security-returning-after-restore.test.ts` runs the ticks for
both endings.

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` (`src/simulation/runtime/new-session.ts`)
constructs a `SecuritySectorRegistry` (bound to the session's own
`NavigationSystem.doors`), an empty `GuardRoster`, a mutable
`securitySchedules` array, and registers `DeploymentSystem`/`PatrolSystem`
on the kernel -- all exposed on `SimulationRuntime`. `securitySchedules`
stays a plain mutable array specifically so scenario setup can `push`
staffing requirements into it after construction -- `DeploymentSystem` reads
the array live on every scheduled tick.

### One derived sector, and why this is the exception to "no fabricated default content"

Every other registry here starts empty, and the sector registry used to as
well. **That was the defect issue #396 measured**, not the invariant:
`securitySectors.register` had exactly one caller in all of `src/` --
`restoreSessionSystems`, reading a save payload -- so a session a player could
start held zero sectors, and `DeploymentSystem`, `PatrolSystem`,
`IncidentTriggerSystem` and `IncidentResponseSystem` all iterated empty
collections for the whole life of that session. The tier was measured only in
scenarios and in restored saves.

[ADR 0036](./adr/0036-a-derived-default-security-sector.md) closes it with a
**derived** default rather than an authored one. `applyDefaultSecuritySector`
(`src/simulation/security/default-sector.ts`) is called from the composition
root and fills three collections, because filling one of them changes nothing:

| collection | value | why the other two are needed |
| --- | --- | --- |
| `securitySectors` | `security-sector.prison`, `grade.general`, **no doors**, post tile at the middle of the first owned chunk in canonical `(y, x)` order | -- |
| `securitySchedules` | one guard, all day -- a **floor** since ADR 0048, not the whole requirement | `DeploymentSystem.requiredGuardCountFor` answers `0` for a sector with no schedule, so a sector alone posts nobody |
| `incidentSectorIds` | that one id | `IncidentTriggerSystem` samples only the ids it is handed, so a staffed sector nothing watches opens no incident |

A derived sector is not fabricated *content*: it carries no authored geometry,
no name, no grade nobody chose, and it is a pure function of the world's chunk
size and its owned chunks. Because it is pure it is **re-derived on load rather
than persisted** -- `applyDefaultSecuritySector` runs again at the end of
`restoreSessionSystems`, is idempotent, and leaves anything the payload already
carried alone. `SAVE_SCHEMA_VERSION` stays 5 and no migration exists; a save
written before ADR 0036 gains the sector on load.

**Its post tile is the tile `NEW_PRISON_ORIGIN_TILE` holds** (16, 16 for a new
session's 32-tile chunk), and that is load-bearing twice over: a hire is posted
without a route request, and the tile is on owned walkable ground.

> **It used to be load-bearing a third time**, and this paragraph said so: *"an
> unhoused arrival standing there is a sector occupant for
> `resolveSectorOccupants`"*. That was true and it was the only way any prison
> had occupants, because the resolver counted prisoners standing on exactly that
> tile and `ActionSystem` moves a housed prisoner to their room's anchor.
> [ADR 0048](./adr/0048-what-a-sectors-occupants-are.md) replaced the rule, so
> occupancy no longer rests on the coincidence -- see "What a sector's occupants
> are" below.

### What a sector's occupants are

[ADR 0048](./adr/0048-what-a-sectors-occupants-are.md) decision 1:
**the derived sector is the prison, so its occupants are every living prisoner
standing on land the prison owns** (`world.isTileOwned`, the same rule the
renderer shades from, ADR 0019). Any *other* registered sector keeps the
post-tile rule, because `SecuritySectorDefinition` records a grade, doors, a post
tile and an optional patrol route and none of those is an area -- the derived
sector is the one sector whose area is known without anyone drawing it.

`src/simulation/security/sector-occupancy.ts` holds the rule and answers it two
ways: `resolveSectorOccupants` for the list `IncidentTriggerSystem` samples and
records as participants, and `countSectorOccupants` for the number
`DeploymentSystem` scales its requirement by. Both walk the live prisoner
indices and sort by entity id; neither is persisted, and no save-schema field
moved.

### A requirement that grows with the prison

[ADR 0048](./adr/0048-what-a-sectors-occupants-are.md) decision 3:
`DeploymentSystem.requiredGuardCountFor` answers
`max(scheduled, ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD))`, with the
constant at 8. It **only ever raises** -- a schedule is authored data and the
population is a demand on top of it -- and **a scheduled zero is an exemption
that stays zero**, which is what lets a save carry one and what
`tests/helpers/default-security-sector.ts` relies on.

The reason is arithmetic rather than flavour: `staffingShortfall` is
`shortage / required`, so a requirement pinned at one is `1` before the first
hire and `0` for ever afterwards, whatever the population. That is issue #442's
"hiring one guard makes the incident system unreachable", and it is why the
scaling is applied in `requiredGuardCountFor` rather than by rewriting the
schedule: that method is the one place the requirement is read, by
`assignUnassignedGuards` and by `getCoverageReport` both, so what is enforced
and what the projections publish cannot disagree.

**What it does not bring back**, measured in
`tests/integration/security-default-sector.test.ts`:

- **Patrol.** The derived sector has no `patrolRoute`, so `PatrolSystem` is
  still a no-op. A route is an authored loop of waypoints and a derived one
  would be a made-up path across whatever the player built.
- **Lockdown's physical effect.** `doorIds` is empty, so `setControlState`
  moves a control state that cascades onto nothing. A perimeter is the one
  thing the derivation cannot know.
- **Contraband search used to be on this list and has left it** (issue #552,
  [ADR 0073](adr/0073-who-orders-a-contraband-search.md)). The bullet read
  *"for a reason that was never a sector: `SearchSystem.submitOrder` has no
  caller in `src/` at all"*, and the reason it gives was right -- a sector was
  never what search was missing. What it was missing, four policies and a
  producer, now exists: a **staffed** sector orders a rotating sweep of its own
  occupants every 600 ticks, walked by a guard the deployment requirement has
  not already taken (`contraband.search-duty`). So a sector alone still does not
  make searches happen; a sector with somebody standing it, and one guard spare,
  does. `docs/CONTRABAND.md`, "Who orders a search", carries the rule.

## Readonly projections for UI

Every public accessor on `SecuritySectorRegistry`, `GuardRoster` and both
systems' metrics/coverage-report methods returns primitives, readonly
arrays or plain data objects -- there is no method that hands out a mutable
internal `Map`/array reference. A future security-overview UI (none exists
yet: the HUD has a `security` tab, but only the `build` tab renders a panel
behind it -- matching #19/#22/#24/#25's precedent of shipping the system
before the surface) reads sector
control state, coverage reports and patrol metrics through these read-only
views without needing write access to touch simulation state, consistent
with the architecture boundary that rendering never becomes a source of
truth.

## Scale

`tests/unit/security-scale.test.ts` deploys and patrols 120 guards across
60 sectors to a steady, zero-shortage, zero-missed-patrol state without
pathological slowdown (wall time logged as directional evidence only, per
`docs/BENCHMARKING.md`'s no-hard-threshold policy) -- a generous multiple of
realistic guard counts (tens, not thousands), not a per-prisoner-scale
target.

## What is out of scope here

Contraband, intelligence, searches and inspections (#27); incident response
for violence, escapes, riots and gangs (#28); automatic escort scheduling
(deciding when a prisoner needs an escort and pairing them with an
available guard -- the access-policy *resolver* for an already-decided
escort ships here, the scheduling decision does not); final UI/visual
effects (a session UI exists -- the HUD and save panel -- but the only thing
it surfaces is a headcount of hired guards and how many are unassigned
(#104), beside the Staff panel that hires one
([ADR 0025](./adr/0025-guard-hiring-surface.md)) and lists hireable roles
rather than hired people, plus the held-guards block a release aims at
([ADR 0034](./adr/0034-releasing-a-claimed-guard.md)); `projectSecurity`
exists and `hud/security` is published, but no panel reads it, so sector
control state, patrol metrics and coverage still reach no surface); alarms,
cameras or any detection
mechanic beyond the access-control/patrol substrate itself.
