# Generic object order at a completed template entrance, 2026-10-03

## Measured baseline

VERIFIED by packed commands on `db74581f01e6f04f9488fc9bbdfca21ca8f4fa42`,
in the isolated `codex/template-completion-next-audit-20261003` worktree.
`tests/integration/generic-object-template-approach.test.ts` builds a genuine
Basic Cell at (10,10) until all shell and furniture orders complete. It then
submits an independent `PlaceBuildOrder` for a canonical two-square object.
There is no injected geometry, queue completion, placement or renderer state.

- Normal unmirrored Cell: Desk at (10,17), second tile (11,17), the existing
  protected outside approach. The order completes with progress60 and two
  allocated planks. Funds fall from23470 to23340, the physical registry owns
  the Desk under `independent-object`, and (11,17) is occupied.
- Mirrored clockwise90-degree Cell: Bed at (9,11), second tile (9,12), its
  protected outside approach. The order completes with progress30 and one
  allocated plank. Funds fall from23470 to23405 and the approach is occupied.
- Both occur live and after actual checksummed V8 encode/decode/restore.
- Shift the incoming object one square left: all four legal controls complete
  under the independent order ID while leaving the approach clear.

Original probe: four RED / four legal GREEN, tests647ms, total5.87s. Its
diagnostic mistakenly read treasury directly from the simulation snapshot and
printed no before value. Correcting that diagnostic to read the real treasury
does not change the commands or failure: four RED / four legal GREEN,
tests559ms, total3.10s. That correction is retained as a fixture error; no
economic observation is derived from the missing value in the original run.
The corrected terminal output is `baseline.txt`.

## Cause and existing rule

VERIFIED from `src/simulation/runtime/new-session.ts` and the construction
admission code: the existing tile callback protects every `PlaceObject`
footprint against pending and genuinely completed template entrances. The
generic `PlaceBuildOrder` object loop has bounds, ownership, physical object,
square-wall and pending-rectangle readers, but lacks that approach reader.
Its order-shaped approach callback intentionally handles walls only.

Fresh REST bodies/searches read #1700 (pending PlaceObject), #1710 (completed
ordinary walls), #1976 (generic object versus physical furniture), and search
results for doorway objects/approach furniture. The measured generic object
route at a completed entrance is distinct from those source entry points.
No new reservation, terrain, ownership, refund or room-membership policy is
proposed. Existing duplicate precedence and low-level free object construction
remain controls of the proposed narrow correction.

## Limits

This demonstrates forbidden physical occupancy and real spending. It does not
claim a navigation failure: no before/after actor route was measured. There is
no browser, drawn-pixel or hosted CI claim. The scope is this missing generic
object admission reader, not the already covered160 catalogue lifecycle
combinations. Fix and production-negative evidence will be recorded separately.

## Scoped correction and producer controls

Issue: https://github.com/woogitsu/lockstate/issues/1994 . Baseline diagnosis
was committed/pushed as15812fdec4 before production edits. The coordinator and
its accepted ownership heuristic are unchanged. System receives one optional
pure approach-tile reader; new-session binds it once. Its existing canonical
full-footprint admission loop rejects any claimed approach with existing
`unbuildable`, after duplicate checks and before approval/procurement/history.

VERIFIED: fixed8/8GREEN, total3.31s. Disconnecting only the genuine System
footprint predicate gives4RED/4legalGREEN, total2.76s. Disconnecting only the
live session binding gives4RED/4legalGREEN, total2.70s. Both mutations ran
serially on detachedHEAD with `finally` byte-exact restoration, then return to
the own branch. Restored8/8GREEN is a separate terminal run. Full failed-order
snapshot controls exclude only the actual existing diagnostic failed row and
kernel command bookkeeping; all other world/physical ownership/economy/history
snapshot bytes agree with the pre-command capture.

Restored production SHA256:
- System:48fddef4507bc8a2eb020b01a16eccde7e20436d0c3c98e6512306449b2bf7b2
- new-session:e3d658b24672502df0d45a5167601d4e209af785c66879a3a281162f47eeb27c

Expanded orientation, neighbouring compatibility and documentation gates are
pending at this first source checkpoint. There is no browser/CI claim.
## Terminal expanded source checkpoint

VERIFIED:32/32GREEN, total4.00s, across all four quarter turns and both
mirrors, live and encoded V8Load. Expected exterior points come from a literal
4x7 Cell transform, not the production geometry helper. Each legal adjacent
purchase then finishes, retains its exact sourceOrderId, survives encoded
Load, undoes independently leaving the original two template fixtures and
completed gesture, and redoes after another encoded Load.

Expanded actual producer negatives preserve16RED/16legalGREEN each: System
predicate total4.55s; session binding total4.98s. Both finally restores reproduce
the SHA256 above. The earlier8-case restored run was8GREEN2.62s.

Restored neighbouring verification:389GREEN in10files, total26.83s, two
workers. Exact paths:
- tests/integration/generic-object-template-approach.test.ts
- tests/integration/room-template-rotated-history.test.ts
- tests/integration/build-order-object-collision-boundary.test.ts
- tests/integration/completed-square-incoming-object-footprint.test.ts
- tests/integration/pending-square-wall-incoming-object.test.ts
- tests/integration/room-template-completed-furniture-access.test.ts
- tests/integration/template-deferred-history-order.test.ts
- tests/unit/construction.test.ts
- tests/unit/construction-geometry.test.ts
- tests/unit/construction-doors.test.ts

The existing all-catalogue rotated lifecycle test is included specifically to
check that the new admission reader does not self-block deferred furnishing;
it is compatibility evidence, not a newly discovered matrix gap. Existing
edge/door and bare ConstructionSystem controls remain unchanged and GREEN.
App and tools TypeScript exit0; production client build6.85sGREEN with existing
size/plugin timing warnings. Source diff0 after exact restore and source commit.

Documentation first pass:60GREEN/2RED in8files, total21.66s: quotation gate
reports the three granted shifted docs; published-commit gate lacks the local
own remote tracking ref for the already pushed parentdb745. An explicit
bounded fetch of this own published branch restores that ref. No publication
or citation guard change is proposed. Only measured live coordinates and own
index row will be corrected in the next separate documentation checkpoint.
## Terminal documentation checkpoint

VERIFIED:62/62GREEN across the same8 documentation files, total12.02s.
The granted corrections change only actual live System coordinates in WORLD,
ADR0047 and its index. Old coordinates remain explicit historical amendments.
System adds six lines; the single new-session binding is below the referenced
live call sites, so no new-session documentation coordinate required a change.
The own research index row preserves all inherited records. Budgets, tolerances,
quotation/source/citation guards and historical claims remain unchanged.

No further production edits or tests were introduced at this documentation
checkpoint. The source tree is byte-identical to the terminal restored389-test
run, both production files have zero diff against their committed source, and
all source leases are released. Browser and hosted release gates belong to the
parent's separate integration; this record makes no native acceptance claim.