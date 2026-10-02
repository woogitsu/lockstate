# Draft: durable quarter-turn room templates and object construction

## Status

Owner approved the optional quarterTurns/objectOrientation fields0..3 with absent0 compatibility and separately approved orientation-independent rectangular minima through clickable decisions on2026-10-02. The integrated branch now implements these decisions in the worker, persistence, native room-plan control and renderer. The specific rotated Security Office player flow has passed real construction and Save/Load with authored model pixels. Full release acceptance and hosted delivery remain pending. No ADR number is reserved. Tracks existing [#1586](https://github.com/woogitsu/lockstate/issues/1586), which already requires rotation/mirroring in the player flow.

The sink audit and proposed sequence below record the pre-implementation state; their descriptions of missing fields and orientation0-only producers are historical. The current implementation checkpoints are8f430b9a9b (authoritative rotation/history),086ee794e5 (saved order schema),b51831047a (native control/preview),9654b8e30e (correct authored yaw) and2466cd8863 (actual rotated model player acceptance). [Runtime evidence](../../research/2026-10-02-authoritative-room-template-rotation/README.md) and [rendered player evidence](../../research/2026-10-02-rotated-console-rendering/README.md) delimit what was verified. This update neither assigns an ADR number nor claims the integration branch has been released.

## Concrete decision requested

Approve exactly these optional integer fields with domain0..3 and absent0:

1. `quarterTurns` on the authored room-template request saved in `simulation.roomTemplates.pending[]`, `undone[]` and `completed[]`, and on the queued `PlaceRoomTemplate` command that creates it.
2. `objectOrientation` on construction `BuildOrder` records, including copies of those orders held in construction transaction/history snapshots.

Existing completed `PlacedObject.orientation` is reused, not replaced or duplicated. All orientation values mean clockwise quarter turns relative to authored content. Mirror is applied before the quarter turn. Origin remains the minimum world x/y corner of the rotated plan's occupied rectangle.

### Exact compatibility and migration rule

A missing proposed field resolves to0 at its consumer. Existing records are not reinterpreted; an old mirrored plan remains mirrored at orientation0. No rewrite of world coordinates, order IDs, existing edge values or completed-object orientations occurs.

Under ADR0038's existing optional-field rule, these additions do not require a save-envelope version bump: absence has exactly the old meaning, both fields are optional and no existing field changes meaning. Retain the current room-template section version1 for this additive proposal. Normalization on restore may write explicit0 on a subsequent new save, but must not fabricate different geometry. Domain validation remains strict; fractional, negative, >3 and nonnumeric values are refused, not clamped.

New records with these fields may be refused by older builds' strict schemas as invalid-shape. This proposal promises old→new compatibility, not downgrade compatibility, and does not silently strip fields to make an older build accept rotated geometry. If the owner wants a different compatibility direction, it is a separate proposal.

## Why both fields are needed

The template request describes the authored transaction and reconstructs zoning, claims, completion and Undo/Redo. The object order describes a future object, which must reserve its real footprint and retain facing while construction is unfinished or paused. A completed object's existing orientation cannot preserve the state of an unfinished object order.

Storing only the template orientation and looking up every object order through history would create a durable order→history dependency. Deriving orientation from x/y, edge, mirrorX or definitionId is ambiguous. Introducing rotated copies of every buildable definition would duplicate content, art and pricing. Neither is an acceptable substitute for explicit order state.

## Existing reusable representation

- `PlacedObject.orientation` and its saved schema already allow0..3.
- `orientedFootprint` and `objectFootprintTiles` already reserve exact rotated extents. Capacity still uses the authored object definition's width by ADR0028, regardless of facing.
- Full-square walls retain existing `footprint: square` and tile location.
- Doors retain existing `edge: north|west`. The pure adapter canonicalizes rotated east to west at x+1 and rotated south to north at y+1.
- Room rectangles retain x/y/width/height. No per-tile zone rotation field is needed.

## Sink audit and required behaviour

| Consumer or schema | Current behaviour | Required integration |
| --- | --- | --- |
| `src/ui/room-template-tool.ts` | Request/revision carries templateId/origin/mirrorX; plan is unrotated | Explicit quarterTurns selection changes revision; derive the same rotated plan as worker |
| `src/ui/simulation-room-template-port.ts` | Preflight spreads existing request | Pass selected quarterTurns with exact retained origin |
| `src/main.ts` template producers | Spread request or explicitly copy mirrorX | Preserve quarterTurns in both normal Build and intent dispatch |
| `src/simulation/protocol/commands.ts` | Strict PlaceRoomTemplate has no orientation; serializer enumerates fields | Validate0..3 and preserve quarterTurns in queued command snapshot |
| `src/simulation/worker/projection-catalog.ts` and `src/simulation/presentation/room-template-preflight.ts` | Instantiate base/mirrored template only | Validate rotated safe bounds and invoke the same rotated geometry before authoritative preflight |
| `src/simulation/runtime/session-commands.ts` | Builds coordinator request from base/mirror fields | Pass normalized quarterTurns without renderer dependency |
| `src/simulation/construction/room-template-coordinator.ts` | Pending/history rows omit orientation; object claims use0; reconstruction invokes base/mirror catalogue | All pending, completion, unzone, cancel, Redo and restored transaction hooks reconstruct the exact selected orientation |
| `src/simulation/construction/room-template-build-plan.ts` | Square walls; every door north; object orders omit orientation | Consume prepared canonical door descriptors; set objectOrientation on each fixture order |
| `src/simulation/construction/build-order.ts` and `src/persistence/save-schema.ts` | BuildOrder/saved orders have no object facing; completed objects have orientation | Add only the proposed optional order field; normalize absence0; retain it through all order copies |
| `src/simulation/objects/object-placement-service.ts` | Placement footprint, pending claims and completion hardcode0 | Read order/request orientation consistently; completion receives the order's facing |
| `src/simulation/construction/system.ts` | Completion sink receives objectId/anchor; duplicate comparison checks location/edge/footprint | Thread orientation through sink and compare orientation where order identity matters; cancellation/Redo preserve it |
| `src/simulation/objects/placed-object-registry.ts` | Index/reservation already uses object's orientation | Reuse unchanged orientation-aware index; no fresh stored width/height |
| `src/rendering/world/structures.ts` | RenderStructure projects order location/definition/phase/footprint only | Add ephemeral projected orientation from order; no renderer inference |
| `src/rendering/world/appearance.ts`, angled projection and top-down painter | Use authored unrotated dimensions/frames | Use the existing oriented extent and corresponding authored facing in both views; no actor/art ownership takeover in this draft |
| `src/simulation/objects/room-capacity.ts` | Capacity intentionally ignores orientation | Retain authored-capacity behaviour |

The live production producer only emits orientation0 today. This audit found a missing future rendering path, but did not prove a separate currently player-reachable rotated-fixture bug; no speculative duplicate Issue is filed.

## Separate rule not implicitly approved here

Room zoning currently compares width against minWidth and height against minHeight. A valid2×5 Cell becomes5×2 after a quarter turn and can fail the authored minHeight3 condition. Approval of fields alone does not authorize weakening this gameplay rule.

Recommended separate owner decision: a rectangular minimum can be satisfied in either orientation, while minTiles and all other requirements remain unchanged. Implement that only after explicit approval, with tests for exact threshold pairs and below-area rooms. Alternatively rotated plans can remain refused by the existing rule, but the owner should see that limitation before approving delivery.

Truthful static control wording follows the partial release in AGENTS.md and must be recorded in the player-string inventory. A new behavioural refusal or inaccurate claim still requires the applicable owner reservation. Camera Rotate labels must not be reused for rotating a room plan.

## Executable sequence and gates

1. Obtain the exact state decision above, then add strict optional schema fields and absent0 readers together. Record approval in this draft before central ADR numbering.
2. Connect rotated catalogue geometry and canonical construction descriptors to worker preflight/build expansion; add rotated-safe-coordinate refusal tests and ordered claim coverage.
3. Carry order orientation through claims, completion, snapshot/restore, Undo/Redo and duplicate suppression. Mutation forcing0 must make the pending/completed Save/Load cases fail.
4. Obtain the separate minimum-dimension/copy choices where required. Add the actual template control and fit revision without changing the approved world-origin lock.
5. Prove all20 plans×mirror×four turns for exact occupancy, fixture facing, doors and independent room zones. Check pending save, completed save, partial-build Undo/Redo and collision refusal without partial transactions.
6. Verify the real1920×1080 and larger game in both camera modes. Clicked world origin, preview, queued order and completed pixels must agree. No geometry-only or injected-state screenshot is a release claim.

## Already prepared evidence

Pure geometry checkpoint `2ac767283f` and adapter `b7c194acf5` are pushed. Geometry tests cover all20 normal/mirrored plans with four successive turns and inverse transforms. Existing worker `objectFootprintTiles` consumes the adapter's orientation and reserves exactly the transformed fixture rectangles. Combined64 tests pass; forcing adapter orientation0 gives15 failures, then restoration gives64 green. TypeScript passes. Detailed proof is in `docs/research/2026-10-02-room-template-quarter-turns/README.md`.
