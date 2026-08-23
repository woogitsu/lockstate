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
A guard's `deploymentPhase` (`'unassigned' | 'travelling' | 'on-post'`) and
optional `patrolWaypointIndex` are the only fields `DeploymentSystem` and
`PatrolSystem` need to coordinate ownership of a travelling guard (see
below).

## Deployment: filling sector requirements without teleporting

`deployment-schedule.ts`'s `DeploymentSchedule` states a sector's required
guard headcount, optionally varying by tick-of-day on the same
`DAY_LENGTH_TICKS` clock #24's `RegimeSchedule` uses (a deployment schedule
and a prisoner regime schedule share one clock without coupling their
typings). A sector with no schedule entry requires zero guards -- no
fabricated demand.

`deployment-system.ts`'s `DeploymentSystem` (a `SystemRegistration`,
scheduled every 10 ticks) deterministically fills each sector's shortage
from unassigned guards (ascending entity id) and drives every assigned
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

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` (`src/simulation/runtime/new-session.ts`)
constructs an empty `SecuritySectorRegistry` (bound to the session's own
`NavigationSystem.doors`), an empty `GuardRoster`, an empty mutable
`securitySchedules` array, and registers `DeploymentSystem`/`PatrolSystem`
on the kernel -- all exposed on `SimulationRuntime`. Exactly like
#19/#22/#24/#25 before it: this wires real infrastructure with no
fabricated default content. No sectors, no hired guards and no deployment
requirements exist until an actual session/scenario registers them;
`securitySchedules` stays a plain mutable array specifically so scenario
setup can `push` staffing requirements into it after construction --
`DeploymentSystem` reads the array live on every scheduled tick.

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
effects (a session UI exists -- the HUD and save panel -- but nothing in it
surfaces sectors, guards or patrols); alarms, cameras or any detection
mechanic beyond the access-control/patrol substrate itself.
