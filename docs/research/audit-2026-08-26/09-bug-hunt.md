# Lockstate — Gameplay Simulation Bug Hunt (BUG-HUNTER)

Scope: `src/simulation/**` + `src/content/**` gameplay logic. Determinism/RNG/save-fidelity/worker-protocol
and performance were out of scope (other auditors). Baseline: typecheck clean, 2628 tests pass.

**Reproduction harness** (throwaway, outside the repo):
`/tmp/claude-0/-workspace-lockstate/767a1a51-5c01-581e-9ac6-09888874d14c/scratchpad/audit/repro/bugs.test.ts`
run with `npx vitest run --config .../repro/vitest.config.ts` from the repo root. **6 of 6 repro cases pass**
(i.e. all six asserted wrong behaviours were observed against the real modules). Nothing in the repo was modified.

Repro-case → finding map: repro `BUG-01`→BUG-01, `BUG-02`→BUG-02, `BUG-03`→BUG-10, `BUG-04`→BUG-06,
`BUG-05`→BUG-05, `BUG-06`→BUG-03.

Counts: **2 High, 6 Medium, 5 Low**. **6 reproduced**, 7 traced.

---

## BUG-01 — A `PlaceBuildOrder` with an unknown `definitionId` permanently bricks the simulation

**Severity: High** · **CONFIRMED (reproduced)**

`src/simulation/construction/system.ts:225` (`submitOrder`, no catalogue check)
`src/simulation/construction/system.ts:451` (`const def = getBuildableDefinition(order.definitionId);`)
`src/simulation/construction/definition.ts:944` (`if (!def) throw new Error(...)`)
`src/simulation/protocol/commands.ts:27` (`definitionId: z.string()`)
`src/persistence/save-schema.ts:157` (`definitionId: z.string().min(1)`)

**Scenario.** A `PlaceBuildOrder{ definitionId: 'wall-brick-typo', x:1, y:1 }` arrives (a queued command in a
restored save, a future producer, or a save written by a build whose catalogue still had a since-removed id —
`door-wooden` and friends have moved in and out of `BUILDABLE_REGISTRY`). Zod accepts it (plain `z.string()`).
`submitOrder` validates only bounds and land ownership and stores the order as `'approved'`. On the next
scheduled `ConstructionSystem.update`, line 451 resolves the definition **before the `switch`, for every order
in the walk**, and `getBuildableDefinition` throws. The throw escapes `Kernel.step()` → worker fault. The bad
order is in `ConstructionSystem.snapshot()` and therefore in the save, so **every** subsequent tick of that
session and every reload of that save throws again, and no other build order can ever advance
(reproduced: a valid `wall-brick` order submitted afterwards is stuck in `'approved'` forever).

**Root cause.** `definitionId` is never validated against `BUILDABLE_REGISTRY` at any boundary, and the one
place that resolves it is a throwing lookup inside a scheduled system update.

**Fix.** Add an `unknown-definition` member to `BUILD_ORDER_FAIL_REASONS` and refuse in `submitOrder`
(`if (!BUILDABLE_REGISTRY.has(order.definitionId)) { order.state='failed'; order.failReason='unknown-definition'; ... }`),
exactly as `ObjectPlacementService.place` already answers `'unknown-buildable'`. Additionally make `update`'s
lookup non-throwing (`BUILDABLE_REGISTRY.get`) and fail such an order rather than throwing, so a restored save
that already carries one is recoverable rather than terminal.

---

## BUG-02 — Cancelling or failing a carry job on its **dropoff** leg destroys the goods

**Severity: High** (violates a stated invariant) · **CONFIRMED (reproduced)**

`src/simulation/operations/job-system.ts:196-201` (`failJob`: `if (job.leg === 'pickup') … releaseReservation`)
`src/simulation/operations/job-system.ts:215-224` (`cancel`: `hadReservation = job.leg === 'pickup' && …`)
`src/simulation/operations/job-system.ts:157` (route failure on either leg → `failJob`)

**Scenario (reproduced).** Source container holds 10 `item.brick`. A carry job for 4 is assigned (reserve 4),
dwells at the pickup tile, and `continuePerforming` calls `withdrawReserved(4)` — stock is now 6 and the 4 units
are conceptually in the worker's hands. `job.leg` becomes `'dropoff'`. Now either (a) the dropoff route comes
back `unreachable`/`permission-denied` (`continueTravelling` → `failJob`), or (b) the player/system cancels the
job. Both paths guard their compensation on `job.leg === 'pickup'`, so **nothing is returned anywhere**: total
stock across all containers drops from 10 to 6 permanently. Because materials are bought with money
(`ProcurementSystem`), this is money destruction.

**Root cause.** The compensating action is keyed on the leg the *reservation* belongs to, and the dropoff leg's
liability is a *withdrawal*, not a reservation — nobody wrote its inverse.

**Fix.** In both `failJob` and `cancel`, branch on the leg: `pickup` → `releaseReservation`; `dropoff` →
`this.containers.getById(job.sourceContainerId)?.deposit(job.itemId, job.quantity)` (put it back where it came
from — the same one-container exception `ContainerMaterialsProvider.release` already takes). `docs/OPERATIONS.md`
line 78 ("Cancellation/failure releases reservations consistently") needs the second half added.

---

## BUG-03 — Cancelling an old object order deletes a *newer* object standing on the same tile

**Severity: Medium** · **CONFIRMED (reproduced)**

`src/simulation/objects/object-placement-service.ts:565-577` (`onOrderReverted` guard)
`src/simulation/objects/object-placement-service.ts:448-461` (`remove` leaves the completed order untouched)
`src/simulation/objects/placed-object.ts` (`placedObjectIdFor(anchorTile)` — id derived from the anchor alone)

**Scenario (reproduced, entirely through shipped HUD producers).**
1. Build a bed at (0,0) — order **X** completes, bed placed, cell `residentCapacity` 1.
2. Use the Build panel's removal mode (`RemoveObject`) on (0,0). The placed object is removed; **order X stays
   `'completed'`** and its `materialsAllocated` is untouched.
3. Build a bed at (0,0) again — order **Y** completes, a new bed stands there, capacity back to 1.
4. `CancelBuildOrder`/`Undo` reaching **X** → `revertConstruction` → `onOrderReverted('object.bed', (0,0))`.
   The guard checks object id **and** anchor tile — and Y matches both, because two beds on one anchor are
   indistinguishable. **Y's bed is deleted**, capacity falls to 0, while Y still reads `'completed'`.

**Root cause.** The guard was written to distinguish "a different object took this tile" but identity is
`(objectId, anchor)`, which is not unique across orders; `placedObjectId` (the only truly unique handle) is
derived from the tile, so the order cannot record which placement was *its own*.

**Fix.** Record the `placedObjectId` the order actually created on the `BuildOrder` (or return it from
`onOrderCompleted` and store it), and have `onOrderReverted` remove only that id. Cheaper interim fix: have
`ObjectPlacementService.remove` also cancel the completed order that placed the object it removed, so no
completed order can outlive its object.

---

## BUG-04 — Redo of an object order can consume materials for an object that never appears

**Severity: Medium** · **SUSPECTED (traced; not separately reproduced — same interleaving as BUG-03)**

`src/simulation/construction/system.ts:297-317` (`redo` restores `'cancelled'` → `'approved'`, keeps `progress`)
`src/simulation/objects/object-placement-service.ts:537-541` (`onOrderCompleted` returns `false` and the order still completes)
`src/simulation/objects/placed-object-registry.ts:26-39` (`place` refuses a duplicate `placedObjectId`)

**Scenario.** Bed X at (0,0) completes. `RemoveObject` at (0,0). Bed Y at (0,0) completes (object stands).
`Undo` cancels X (refunds X's plank). `Redo` returns X to `'approved'` with `progress` still ≥ `workRequired`,
so on the next scheduled tick it re-allocates a plank, goes straight to `'completed'`, and
`onOrderCompleted` → `placedObjects.place` returns `false` because Y already owns that `placedObjectId`.
`ConstructionSystem` ignores the boolean: the order is `'completed'`, one plank is gone, no object exists,
and the only way to get the plank back is to cancel X again.

**Root cause.** `finalizeConstruction` discards the sink's `false` and has no failure state for "the world had
moved on"; `redo` also does not reset `progress`, so the rebuild is instantaneous.

**Fix.** Make `finalizeConstruction` act on the sink's return value — on `false`, put the order back to
`'materials-pending'` (releasing its allocation) or to `'failed'` with a new `placement-conflict` reason.
Reset `order.progress = 0` and `order.failReason = undefined` in `redo`.

---

## BUG-05 — Removing the last bed leaves an occupied place the state keeps paying for, in a room that can never be un-zoned

**Severity: Medium** · **CONFIRMED (reproduced)**

`src/simulation/prisoners/room-instance-registry.ts:201-224` (`updateDerived` lowers capacity, touches no occupant)
`src/simulation/economy/income.ts:324-331` (`StateIncomeSystem.update` pays `300 × totalOccupancy`)
`src/simulation/prisoners/room-instance-registry.ts:254-258` (`unregister` throws while `claimCountOf > 0`)
`src/simulation/rooms/zoning.ts:655` (`unzone` refuses `room-occupied`)

**Scenario (reproduced).** A `room.cell` with one bed houses one prisoner (`residentCapacity` 1, occupancy 1).
The player removes the bed; `RoomCapacityResolver.resolveContaining` re-derives `residentCapacity: 0`. Occupancy
stays 1, so `totalOccupancy` stays 1 and `StateIncomeSystem` credits a full 300/day **for a place that no longer
physically exists** — money created out of a furniture removal. ADR 0028 §2 explicitly blesses over-capacity
rooms ("Nobody is evicted"), but ADR 0017's income model is "per *occupied place*", and no ADR reconciles the
two. Second half: the room is now permanently un-removable — `unzone` refuses `room-occupied` and there is no
release path for a resident (`#31`), so a stray bed removal can strand a rectangle for the life of the save.

**Root cause.** Capacity and occupancy are maintained by different writers with no invariant between them, and
income reads occupancy without asking whether the place it names still has a surface.

**Fix.** Either (a) count income against `min(occupancyOf, residentCapacity)` summed per instance rather than
raw `totalOccupancy`, or (b) have `updateDerived` release the surplus occupants (lowest entity id last) and
clear their `coldState` accommodation so intake re-houses them. (a) is the smaller change and matches ADR 0017's
wording; (b) also unblocks `unzone`.

---

## BUG-06 — A door removed by cancelling its build order leaves its security sector pointing at a dead door id (throws inside a scheduled update)

**Severity: Medium** · **CONFIRMED (reproduced)**

`src/simulation/navigation/door.ts:218-231` (`DoorRegistry.unregister` — notifies nobody)
`src/simulation/security/sector.ts:73-83` (`register` copies `doorIds` and snapshots `normalDoorStates`; no `unregister` exists)
`src/simulation/security/sector.ts:121-138` (`setControlState` → `this.doors.setState(doorId, this.normalDoorStates.get(doorId)!)`)
`src/simulation/navigation/door.ts:238` (`setState` throws `Unknown door id`)
`src/simulation/incidents/response-system.ts:322` (`mountResponse` calls `setControlState(..., 'lockdown')`)

**Scenario (reproduced).** A `door-wooden` order completes at (4,4) north; the door is registered as
`door:top:4:4`. A security sector governs it (`doorIds: ['door:top:4:4']`). The player cancels/undoes the door
order — `DoorConstructionService.onDoorOrderReverted` unregisters the door. The sector still names it, and
`SecuritySectorRegistry` has **no** door-removal API and never re-reads the registry. The next
severity ≥ 6 incident in that sector calls `setControlState('lockdown')` from inside
`IncidentResponseSystem.update` and throws `RangeError: Unknown door id "door:top:4:4"` → worker fault.
`loadSnapshot`'s `setControlState` replay throws the same way, so the save is un-restorable.
(Reachability: shipped sessions register no sectors — ADR 0034 records the whole security stack as "dark" — so
this is reachable via a scenario or a save that carries sector definitions, which `session-systems.ts:587` does
restore.)

**Root cause.** Door identity is shared between two registries with no observer and no cleanup; the `!`
non-null assertion at `sector.ts:127`/`:130` asserts an entry that `DoorRegistry.unregister` can delete.

**Fix.** Give `SecuritySectorRegistry` a `forgetDoor(doorId)` (drop it from `normalDoorStates` and from every
`definition.doorIds`) and call it from `DoorConstructionService.onDoorOrderReverted` through a port, or make
`setControlState` skip a door the registry no longer holds (`if (this.doors.getById(doorId) === undefined) continue;`)
— the second is a one-line stop-the-bleeding fix and removes both `!`s.

---

## BUG-07 — A search target that stops existing faults the worker

**Severity: Medium** · **SUSPECTED (traced)**

`src/simulation/contraband/search-system.ts:226-236` (`update` → `advanceJob`)
`src/simulation/contraband/search-system.ts:255` and `:278` (`this.locateTarget(...)` inside `update`)
`src/simulation/runtime/new-session.ts:449-461` (`locateSearchTarget` throws for an unknown room instance, container, guard or prisoner id)
`src/simulation/rooms/zoning.ts:655` (`unzone` only checks `claimCountOf`)

**Scenario.** A `'cell'`-scope search is active against room instance `room.cell:0:0`. A search job's claim lives
on the `GuardRoster` (`'on-search'`), **not** on the room instance, so `RoomInstanceRegistry.claimCountOf` for
that room is 0 and `unzone` happily unregisters it. On the next `SearchSystem.update`, `locateTarget` throws
`RangeError: Unknown cell/room instance id "room.cell:0:0"` out of a scheduled system update → worker fault,
repeated every tick because the job stays in `active`. The same shape exists for a `'container'` target whose
entry is removed from `searchContainerLocations`, and for a `'staff'`/`'prisoner'` target whose entity is gone.

**Root cause.** `TargetLocationResolver` is a throwing resolver called from inside a scheduled update, and the
"is this target still resolvable" question is asked nowhere.

**Fix.** Make `TargetLocationResolver` return `TilePosition | undefined` and have `advanceJob` cancel the job
(`releaseGuards` + `active.delete` + `searchesCancelled += 1`) when a target no longer resolves — the same
answer it already gives a route failure. Alternatively wrap the call and treat a throw as an unresolvable target.

---

## BUG-08 — Navigation results are leaked whenever a claimant is torn down mid-route

**Severity: Medium** · **SUSPECTED (traced)**

`src/simulation/incidents/response-system.ts:213-225` (`releaseResponder`: `pathRequestIdsByGuard.delete` without `navigation.clearResult`)
`src/simulation/incidents/response-system.ts:536-544` (`releaseResponse`: same)
`src/simulation/contraband/search-system.ts:285-291` (route-failure path deletes the job while other guards' requests are outstanding)
`src/simulation/operations/job-system.ts:196-201` (`failJob`/`cancel` never clear `job.pathRequestId`)
`src/simulation/security/guard-roster.ts:145-152` (`unassign` clears `pathRequestId` without clearing the result)

**Scenario.** A severity-8 riot dispatches three responders; two are still routing when the incident lapses.
`lapse` → `releaseResponse` unassigns the guards and deletes the record, but the two outstanding
`incidents.respond.*` requests stay in the `NavigationSystem`'s result map forever — nothing will ever call
`clearResult` for an id nobody holds any more. Same for `GuardReleaseService.release` on a travelling guard, a
failed/cancelled carry job, and the search route-failure path. Over a long session this is an unbounded
accumulation of dead results; combined with `requestSequence` not being persisted it is also a latent id-reuse
hazard across a save boundary.

**Root cause.** Every teardown path drops its *reference* to the request without telling the owner of the
result map.

**Fix.** In each teardown, iterate the request ids being dropped and call `navigation.clearResult(id)` (and, if
the queue supports it, cancel the pending request) before discarding the record.

---

## BUG-09 — `ClassificationReviewSystem` can move a prisoner to `high-risk` without revisiting where they live

**Severity: Medium** · **SUSPECTED (traced)**

`src/simulation/prisoners/classification-review-system.ts:119-120` (writes `riskTier` / `classificationGroupIndex`)
`src/simulation/prisoners/intake-system.ts:183-197` (accommodation and ADR 0027 cell-sharing are decided once, at intake)
`src/simulation/prisoners/cell-sharing.ts:11-19` (`rateCellSharing` — only ever consulted by intake)

**Scenario.** Two tier-1 prisoners share a 2-bed cell (`rateCellSharing` distance 0, a good match). 24,000 ticks
later one of them has three disciplinary points and reviews to tier 3 / `'high-risk'`. Their regime timetable
changes (`ActionSystem` re-reads `findRegimeSchedule` every cycle) but `coldState.accommodation` still points at
the shared general cell, and `DEFAULT_ACCOMMODATION_POLICY`'s solitary-first ordering for `'high-risk'` is never
re-applied. The cell-sharing assessment ADR 0027 exists to enforce is silently violated for the rest of the run,
and nothing surfaces it — there is no "re-house" path and no metric that counts mismatched pairs.

**Root cause.** Intake stage is terminal (`'completed'`), so nothing re-enters accommodation assignment; the
review system writes classification without a hook back into housing.

**Fix.** On a review that changes `classificationGroupIndex` (or raises `riskTier` past the sharing threshold),
release the room occupancy, clear `coldState` accommodation and set `intakeStage` back to
`'accommodation-assignment'` so `IntakeSystem` re-houses through `findBestAvailable`; count the transfers in
`ClassificationReviewMetrics` so a shortage of solitary cells is observable rather than invisible.

---

## BUG-10 — A new build gesture does not clear the redo stack when the gesture carries no transaction id

**Severity: Low** (latent: no shipped producer omits the id) · **CONFIRMED (reproduced)**

`src/simulation/construction/system.ts:252-261` (`registerTransactionOrder`: `if (transactionId !== this.currentTransactionId)`)
`src/simulation/construction/system.ts:263-268` (`undo` sets `currentTransactionId = undefined`)
`src/simulation/protocol/commands.ts:31` (`transactionId: z.string().optional()`)

**Scenario (reproduced).** `registerTransactionOrder('a', undefined)` → `undo()` (which sets
`currentTransactionId = undefined` and pushes `['a']` onto the redo stack) → `registerTransactionOrder('b', undefined)`.
Because `undefined !== undefined` is false, the second gesture is treated as a *continuation* of the first: the
redo stack is not cleared. A later `Redo` resurrects order `a` (back to `'approved'`, so it rebuilds and
re-spends materials) even though the player has done new work since undoing it — the classic broken-redo bug.

**Root cause.** "Is this a new gesture" is decided by comparing to `currentTransactionId`, and `undo()` resets
that sentinel to the same value an id-less gesture carries.

**Fix.** Track gesture identity with an explicit `hasOpenGesture: boolean` alongside the id, or treat
`transactionId === undefined` as always-new (`if (transactionId === undefined || transactionId !== this.currentTransactionId)`).
Clearing `redoStack` in `undo()` is not sufficient — the correct semantics is "any new gesture clears redo".

---

## BUG-11 — `ContainerMaterialsProvider.tryAllocate` ignores its own inventory results and mis-handles duplicated requirements

**Severity: Low** (latent: no shipped buildable repeats an item id) · **SUSPECTED (traced)**

`src/simulation/operations/inventory.ts:141-150`

**Scenario.** A buildable authored as `materialsRequired: [{item.brick, 10}, {item.brick, 10}]` against a stock
of 10. The check loop compares each requirement independently against `availableOf('item.brick')` (10 ≥ 10
twice) and passes. The withdraw loop then reserves+withdraws 10 (stock → 0) and, for the second requirement,
`reserve` returns `insufficient-stock` and `withdrawReserved` returns `insufficient-reserved` — **both return
values are discarded**. `tryAllocate` answers `true`, the order records 20 bricks allocated, and cancelling it
`deposit`s 20 back: 10 bricks created from nothing.

**Root cause.** The pre-check aggregates nothing, and the mutation loop treats two typed `InventoryResult`s as
`void`.

**Fix.** Sum requirements by `itemId` before checking, and assert (or fail the allocation and roll back) on a
non-`ok` result from `reserve`/`withdrawReserved` — the results exist precisely so this cannot pass silently.

---

## BUG-12 — `TopologyManager` is constructed in every session and never driven

**Severity: Low** · **CONFIRMED (traced: zero callers)**

`src/simulation/rooms/topology.ts:55` (`public update(chunks)`), `src/simulation/runtime/new-session.ts:246, 565`

`new-session.ts` builds a `TopologyManager`, exposes it on `SimulationRuntime`, and never registers it on the
kernel — `topology.update(...)` has **no caller anywhere in `src/`** (grep: the only non-comment references are
the import, the interface field, the construction and the return). So `chunkTopologies` is permanently empty and
the region/enclosure substrate ADR 0022 open question 2 leans on is inert in every real session. Also note its
`recomputeGlobalTopology` iterates `this.chunkTopologies.entries()` in Map insertion order (line 135), which
would be a determinism violation the moment it *is* driven.

**Fix.** Either register it as a scheduled system (and sort that iteration) or delete it from
`SimulationRuntime` so nothing reads a field that can only ever be empty.

---

## BUG-13 — A riot can open with zero participants

**Severity: Low** · **SUSPECTED (traced)**

`src/simulation/incidents/trigger-system.ts:75-88` (`openRiot`), `src/simulation/runtime/new-session.ts:432-445` (`resolveSectorOccupants`)

`resolveSectorOccupants` counts prisoners standing **exactly on the sector's post tile**. Prisoners are
teleported to *room anchor* tiles by `ActionSystem`, so in practice the list is almost always empty. A sustained
hot sector (driven by `staffingShortfall` alone, which needs no prisoners at all) therefore opens a `'riot'` with
`participantIds: []`, pulls `ceil(severity × 0.5)` guards off deployment, can lock the sector down, and on lapse
records `injuredEntityIds: []` — a riot with no rioters, and disciplinary consequences credited to nobody.

**Fix.** Refuse to open a participant-driven incident type with an empty participant list (or give the trigger a
minimum-occupant precondition), and make sector membership a rectangle/region rather than a single tile.

---

# Entity-deletion index-cleanup matrix (scope item 11)

Every place a simulation entity/record is deleted, and every index/registry/claim that references it.
**✗ = not cleaned** (findings above where load-bearing).

| Deletion site | Cleans | Does **not** clean |
|---|---|---|
| `EntityStore.destroy` | — | **No caller anywhere in `src/`.** Prisoners and guards are never destroyed (`prisoner-operations-runtime.ts:190-192` records the release path as unimplemented, #31), so prisoner/guard index desync is currently unreachable. |
| `RoomInstanceRegistry.unregister` (`room-instance-registry.ts:254`) | `instances`, `occupants`, `useClaims`, `instancesByRoomCatalogId`, `sortedCache` | ✗ `PrisonerColdState.accommodationInstanceId` (dangling instance id per prisoner) · ✗ `PrisonerColdState.currentActionTargetInstanceId` (defended reactively at `action-system.ts:149-157`) · ✗ `PlacedObjectRegistry` rows inside the rectangle · ✗ active `SearchSystem` `'cell'` targets → **BUG-07** · guarded by a `claimCountOf > 0` throw, which is why the accommodation dangle is not reachable today |
| `RoomZoningService.unzone` (`zoning.ts:646-666`) | zoning plane, room instances whose anchor is cleared | ✗ placed objects inside the removed rooms (they survive with no room; re-zoning re-adopts them, which is intended) · ✗ search targets → **BUG-07** · checks `claimCountOf` only, never a search/job claim |
| `DoorRegistry.unregister` (`door.ts:218`) | `doorsById`, `doorsByEdge`, `accessVersionById`, bumps both revisions | ✗ `SecuritySectorRegistry.definition.doorIds` · ✗ `SecuritySectorRegistry.normalDoorStates` → **BUG-06**. (`RouteCache`/`RegionGraph` are safe: they key off `structuralRevision`.) |
| `PlacedObjectRegistry.remove` (`placed-object-registry.ts:42`) | `objects`, `tileIndex` (with a sorted fallback sweep for an unknown definition) | ✗ the completed `BuildOrder` that placed it → **BUG-03**/**BUG-04** · ✗ derived room capacity (callers must re-derive; both do) · ✗ `UtilityNetwork` nodes (the network has no node-removal API at all) |
| `ConstructionSystem.cancelOrder` (`system.ts:332`) | order state, geometry (edge/object/door), `materialsAllocated` | order stays in `orders` and in `undoStack`/`redoStack` (deliberate, for redo) · ✗ `order.progress` and `order.failReason` are not reset → **BUG-04** · ✗ `assignedWorkerId` left set (harmless: `crewBusy` reads `state`) |
| `IncidentLog.transition` → `resolved`/`lapsed` (`incident.ts:141-144`) | `openIds`, `openIdsBySectorId` | records kept (deliberate audit log) · ✗ nothing prunes `IncidentResponseSystem.responses` from here — `releaseResponse` must be called first, and both call sites do |
| `IncidentResponseSystem.releaseResponse` / `releaseResponder` (`:536`, `:213`) | `responses` entry, `guardIds`, `arrivedGuardIds`, `pathRequestIdsByGuard`, roster `unassign` | ✗ `NavigationSystem` results for outstanding requests → **BUG-08** · ✗ `record.lockdownApplied` is lost when `releaseResponder` empties the record (recovered later by `liftLockdownNoOpenIncidentJustifies`) |
| `SearchSystem.releaseGuard` / route-failure teardown (`:196`, `:285`) | `active` entry, `guardIds`, `pathRequestIdsByGuard`, roster `unassign` | ✗ `NavigationSystem` results for the *other* guards' in-flight requests → **BUG-08** |
| `JobBoard.cancel` + `JobSystem.cancel`/`failJob` (`job.ts:87`, `job-system.ts:196/215`) | job state, source reservation (pickup only), `performingSince`, worker busy flag | ✗ **withdrawn dropoff-leg stock → BUG-02** · ✗ `navigation.clearResult(job.pathRequestId)` |
| `JobWorkerPool.unregister` (`job-system.ts:38-41`) | `workers`, `busy` | ✗ jobs already assigned to that worker keep running and call `workerAdapter.getPositionTile(deadId)` (throws). No caller in `src/` today — latent. **Marked 2026-09-08: `JobWorkerPool` no longer exists** — ADR 0093 decision 4 retired it at `cd41a1d6` and `job-system.ts` was deleted with it, so this row's latent defect is gone rather than fixed; the replacement on the release path is named at `src/simulation/prisoners/action-system.ts:1732` |
| `Container.withdrawReserved` / `releaseReservation` (`inventory.ts:57/68`) | `stock`, `reservedQuantity` (deletes the key at zero) | consistent; `releaseReservation` clamps at 0 so a double release cannot go negative |
| `ContrabandRegistry.confiscate` (`item.ts:122`) | `idsByHolderKey` bucket entry | record retained with `state: 'confiscated'` (deliberate) |
| `IntelligenceLedger.decayAll` expiry (`intelligence.ts:79-87`) | `records`, `idsByTargetKey` entry | ✗ empty `Set` buckets are never removed from `idsByTargetKey` (bounded by distinct targets; cosmetic) |
| `GangRegistry.removeMember` (`gangs.ts:38`) | `gangIdByMember`, `memberIdsByGang` | grudges/reputation are gang-level, correctly untouched. No caller in `src/` |
| `InformantRegistry.release` (`informants.ts:26`) | `informants` | that informant's `IntelligenceLedger` records survive (deliberate: a tip already given) |
| `SecuritySectorRegistry` | — | **no removal API exists.** `IncidentResponseSystem.redispatchInterruptedResponses:200` and `liftLockdownNoOpenIncidentJustifies:245` both defend against a missing sector, implying one was expected; `DeploymentSystem.beginDeployment`/`continueDeploymentTravel` use `requireDefinition` (throwing) instead |
| `UtilityNetwork` | — | **no node/edge removal API exists**, so an object that is a utility node cannot be un-wired when it is removed from the world |
| `ProcurementSystem.cancel` (`procurement.ts:197`) | `pending` entry, refunds the recorded `paidMinorUnits` | correct and idempotent: the record leaves with the refund, so a second cancel is `not-pending`. Money conservation verified by inspection: `paid` is recorded, never recomputed, and a landed delivery cannot be cancelled |

**Economy verdict.** I found **no** double-refund, partial-refund or negative-balance defect in
`src/simulation/economy/**`: `Treasury` is integer-only with `Number.isSafeInteger` guards on both sides,
`spend` refuses rather than overdrawing, and `ProcurementSystem.cancel` refunds a recorded figure exactly once.
Money is nevertheless **created** by BUG-05 (income for a place with no surface) and **destroyed** by BUG-02
(dropoff-leg stock) and BUG-04 (materials for an object that never appears) — all three via the materials/room
layer rather than via the treasury itself.

---

# Prioritized top 10

| # | ID | Why it is first |
|---|---|---|
| 1 | **BUG-01** | One malformed/stale `definitionId` throws out of every subsequent tick and is persisted — an unrecoverable save, reachable from a queued command or a catalogue change. |
| 2 | **BUG-02** | Silent, unbounded destruction of purchased goods on a documented-invariant path; the fix is four lines. |
| 3 | **BUG-03** | Fully reachable from the shipped Build panel; deletes an object the player paid for, defeating a guard whose comment claims to prevent exactly this. |
| 4 | **BUG-05** | Creates money every in-game day and permanently strands a zoned rectangle; needs an ADR reconciliation between 0017 and 0028. |
| 5 | **BUG-06** | Worker fault + un-restorable save from an ordinary build/cancel pair; two `!` assertions that can genuinely be null. |
| 6 | **BUG-07** | Worker fault every tick, from a throwing resolver called inside a scheduled update. |
| 7 | **BUG-04** | Materials consumed for nothing, and `redo` making a rebuild instantaneous. |
| 8 | **BUG-08** | Unbounded leak plus a latent request-id-reuse hazard across saves. |
| 9 | **BUG-09** | ADR 0027's cell-sharing rule is silently violated for the rest of a run with no observable metric. |
| 10 | **BUG-10** | Broken redo semantics; latent only because every current producer happens to mint an id. |

---

# What the existing suite should have caught and did not

- **BUG-01.** `tests/foundation/unconsumed-command-contract.test.ts` and `.../content-validation-reachability-contract.test.ts`
  check that commands have producers and content has readers, but nothing asserts that every *command field that
  names content* is validated against that content. `ObjectPlacementService` has `'unknown-buildable'`,
  `RoomZoningService` has `'unknown-room-type'`, `StaffHiringService` has `'unknown-role'` — `PlaceBuildOrder`
  has no equivalent, and no test noticed the asymmetry. A `BUILD_ORDER_FAIL_REASONS`-vs-boundary-coverage test
  would have.
- **BUG-02.** `tests/integration/economy-money-conservation.test.ts` records mutations M1… for the *procurement*
  path only. There is no conservation test over `Container` totals across a carry job's whole lifecycle, even
  though `tests/unit/operations-job-system.test.ts` has a dedicated regression test for the *pickup*-leg
  reservation bug (`docs/OPERATIONS.md` line 86 says so). The symmetric dropoff case was simply never written.
- **BUG-03 / BUG-04.** `tests/integration/furnished-cell-loop.test.ts` exercises place → complete → capacity, and
  ADR 0028 phase 3 added removal, but no test interleaves `RemoveObject` with `CancelBuildOrder`/`Undo`/`Redo` on
  one tile — which is exactly the interleaving `onOrderReverted`'s own comment says the guard is for.
- **BUG-05.** `tests/integration/economy-state-income-persistence.test.ts` and the ADR-0028 capacity tests each
  hold one half. No test asserts the invariant `occupancy ≤ capacity` (ADR 0028 deliberately allows breaking it)
  *and* nothing checks what income does when it is broken.
- **BUG-06.** `tests/determinism/protocol-fault-recovery.test.ts` covers protocol faults, not gameplay-induced
  ones. There is no test that removes a door a sector governs — the sector registry has no test for a door that
  stops existing because nothing else in the suite deletes a door and inspects a sector afterwards.
- **BUG-10.** The undo/redo tests all use explicit transaction ids (as `main.ts` does). No test passes
  `undefined`, so the `undefined !== undefined` branch is uncovered even though the schema makes it legal.
- **BUG-12.** `tests/foundation/composition-root-contract.test.ts` checks what the composition root builds; it
  does not check that everything it builds is *driven*. A "every system-shaped object on `SimulationRuntime` is
  either registered on the kernel or has a named caller" contract would have caught `TopologyManager`.
