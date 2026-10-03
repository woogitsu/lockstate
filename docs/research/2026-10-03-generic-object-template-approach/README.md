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
The corrected terminal output is `baseline.log`.

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
