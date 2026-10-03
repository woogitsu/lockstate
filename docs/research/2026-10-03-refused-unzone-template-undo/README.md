# Existing #1996 follow-up: refused manual room removal steals Undo eligibility

Read-only source diagnosis on published `a44c3f82d147130229e2f8d94cacab2362f7166c`, 2026-10-03. No production edits at this checkpoint. Fresh existing #1996 body and ADR0104's accepted 2026-09-23 amendment were read. This is an additional command surface of that exact refused-action defect, not a duplicate Issue or a new history policy. Pending #1985 persists an accepted newer-action marker; this reproduction instead Loads before the refused action, preserving that distinction.

## Actual player command boundary

1. Packed PlaceRoomTemplate completes a mirrored90-degree Cell at5,5, including every shell and fixture order.
2. Packed AdmitPrisoner with a genuine long sentence produces a real resident; wait for occupancy1.
3. Packed PlaceBuildOrder buys a separate ordinary full-square wall at2,2; actual construction completes it as the newest transaction.
4. Continue live, or encode/decode/restore the actual V8 bundle now, before removal.
5. Packed UnzoneRoom names the completed Cell interior. Existing room occupancy protection correctly refuses `unzone.room-occupied`. Full gameplay snapshots before/after are equal after removing only kernel command bookkeeping; no treasury, world, construction, residents, ownership or room-template metadata changes.
6. Immediately packed Undo. Expected: cancel only the independently completed wall. Actual: it stays completed. Source currently marks UnzoneRoom as a newer action before asking the unzone domain service, although the command changed nothing.

`baseline.txt`:2 RED/2 no-refusal legal GREEN,4.91s. The controls actually Undo the independent wall and retain all completed template physical owners, occupancy1, metadata and funds. No injected world/job/resident/treasury/order state. No renderer or browser was run.

## Proposed narrow source scope

Only SessionCommands admission of the manual UnzoneRoom action marker: use the existing success-marked set and mark its existing successful removal branch. Refusal itself, copy, zoning selection, genuine resident relocation, successful-change semantics, V8 schema, prices and history format stay as currently approved. Source lease, producer negative/exact restoration and neighboring gates are pending.
