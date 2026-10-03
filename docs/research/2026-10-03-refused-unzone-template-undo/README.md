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

## Narrow source scope

Only SessionCommands admission of the manual UnzoneRoom action marker: use the existing success-marked set and mark its existing successful removal branch. Refusal itself, copy, zoning selection, genuine resident relocation, successful-change semantics, V8 schema, prices and history format stay as currently approved. At the initial diagnostic checkpoint the source lease, producer negative/exact restoration and neighboring gates were pending; their terminal results follow.

The parent granted exactly that source lease. The first fixed checkpoint adds UnzoneRoom to the existing success-marked command set and marks only the existing non-refused unzone branch. Expanded six cases pass in3.37s (`fixed.txt`), including two actual successful removals of an unoccupied completed template, live/V8. Those successful removals still prevent Undo from reaching the earlier independent wall; the wall, physical objects, funds and post-removal world/history remain unchanged by refused Undo. No successful removal is mistaken for an attempt.

## Actual production negatives and final gates

While detached from the published branch, remove UnzoneRoom from the actual deferred-marker set: the two genuine occupied-refusal cases fail and four controls pass,2.67s (`negative-premature-marker.txt`). Independently disconnect only the actual successful unzone marker: the two successful-removal controls fail and four others pass,2.69s (`negative-success-marker.txt`). No assertion or fixture is changed for either mutation.

`finally` restores the original source byte buffer. All six pass in2.70s (`restored.txt`); `exact-restoration.json` records byteExact=true and SHA256 `93d6b562b5e09639c870c74386e122fbf5b58d224a88d1a23388c0d9ad6da32d`. Back on the named branch, the production diff is zero.

`neighbors.txt`:265 GREEN across seven files,24.94s, maximum2 workers:

- `tests/integration/refused-unzone-template-undo.test.ts`
- `tests/integration/occupied-template-refusal-undo-selection.test.ts`
- `tests/integration/undo-refuses-a-transaction-the-player-did-not-just-create.test.ts`
- `tests/integration/room-zoning-loop.test.ts`
- `tests/integration/room-template-rotated-history.test.ts`
- `tests/integration/room-template-legacy-occupied-history.test.ts`
- `tests/integration/unzoned-target-mid-journey.test.ts`

Separate app/tools TypeScript checks exit0. Production client build GREEN6.45s (the existing bundle-size/plugin-timing warnings remain). The unchanged original eight documentation guards pass62/62 in13.08s with process-local `GIT_NO_LAZY_FETCH=1` after the exact published-branch fetch and this collection's continuous index row. The single added source line requires no live-coordinate change under the actual guards; no budgets, quotation allowance or citation allowlist changes. No native/browser, CI or release claim.
