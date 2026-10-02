# Oriented catalogue inventory and genuine saved Canteen probe

## Checkpoint and boundary

Read-only diagnosis on published wall/V8 baseline
`c4cbefe6d87bbe73f3618a4ab7423d58ee99a2eb`, with the accepted physical-registry
renderer correction `db50d61ce09d79eb479d3ea9dec9aa2eae0c1add` reapplied as
`c8c2281331`. No additional production change, schema, tariff, copy or browser
execution was made. This is an inventory and one actual packed-command probe,
not a new regression gate or a claim of mutation-proved coverage.

## Existing coverage read before selecting work

- `tests/integration/room-template-rotated-history.test.ts` already covers all
  20 plans, four rotations and both mirror positions, including actual queued,
  partial, completed, encoded Save/Load, Undo and Redo state. Repeating that
  entire matrix would not identify a missing case by itself.
- `tests/integration/room-template-economy-transitions.test.ts` covers all 20
  default-orientation completed charges/materials, encoded Load, completed Undo
  and Redo, plus all eight Cell and row staged-cancellation orientations.
- `tests/unit/room-template-rotation.test.ts` checks rotated occupied squares,
  mirror order, reversible geometry, door offsets and safe signed coordinates.
- `tests/unit/object-art-orientation.test.ts` checks the current two-tile
  authored facing and projection contract.

Fresh REST Issue inventory and full bodies of #1687, #1608, #1657 and #1705
were read. Their described pending Redo, coupled cancellation, completed Undo
and inverse wall/furniture collision defects already have source and tests on
this checkpoint. No duplicate Issue was filed. #1740's frontier ownership
question was not converted into a new admission rule.

## Inventory result

All **20 plans / 18 room classes / 19 fixture kinds** are present. In each
plan's eight authored transform variants, expanded order count and aggregate
material quantities match its authoritative worker catalogue quote. Every
object descriptor's renderer rectangle agrees with the independently swapped
canonical physical width/height for odd turns. This does not assess authored
PNG pixel containment, which belongs to separate native art acceptance.

## Actual additional runtime probe

One real packed `PlaceRoomTemplate(canteen-basic)` at `(5,5)`, `mirrorX:true`,
`quarterTurns:3` was dispatched. After one actual simulation step its genuine
partial state was encoded to the current save envelope, decoded through the
real validator and restored. Continuing the restored kernel completed all
**34 orders** and placed **six physical objects**, each at orientation 3 and
with an exact construction source ID. Treasury moved from 25,000 to **21,865**,
matching the whole-template catalogue cost **3,135**. No object or stock was
injected. Probe result: **1 passed**, 130 ms test execution / 2.76 s total.

The [raw inventory and actual partial/completed session captures](./2026-10-03-room-template-oriented-catalog-audit/actual-catalog-and-canteen.json)
retain every quote, transformed descriptor, submitted command and real saved
state. No mismatch was reproduced in this scope. No production mutation was
run because there was no proposed fix; this positive probe is not presented as
proof that it would catch a missing production guard. The temporary diagnostic
consumer was removed rather than added as redundant permanent matrix coverage.

## Next concrete investigation

Inspect a genuinely mixed player transition: one transformed full plan reaches
its furnishing stage, another ordinary material-consuming gesture is ordered,
then the selected template fixture is cancelled using its current revision
after encoded Load. Compare displayed coupled refund with the actual ordered
traversal, both template and ordinary allocations, and immutable unrelated
physical ownership. First compare existing row-refund and procurement tests;
only a real mismatch warrants a new regression, source lease or Issue. This
preserves the existing pricing, history and save contracts.
