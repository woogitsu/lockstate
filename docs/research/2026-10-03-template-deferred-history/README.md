## Actual packed-command reproduction

Checkpoint2dc395b5cc27b605c79f1bbf5e7f5657b7e14b60 (rootd766 integration plus separately approved #1654 admission fix), seed73, no browser.

1. PlaceRoomTemplate Cell10,10 (sequence0), leave it pending.
2. Actual legal PlaceBuildOrder bed-wooden11,8 (sequence1). Both squares11,8/11,9 are outside the plan. This independent purchase is the latest player construction gesture.
3. Genuine runtime completion finishes all21 orders, all3 physical objects, one completed Cell.
4. Optional real encodedV8Save/Load.
5. Actual Undo, with no Cancel/hire/nonconstruction action in between.

The template's asynchronously emitted Bed/Toilet call ordinary registerTransactionOrder with old room-template0 after sequence1 has been registered. History becomes old18shellorders / independentBed / old2fixtures(current). Undo selects the older generated fixtures and reverses the entire older20orderCell; latest-independent-bed remains completed/owned. Funds23405 are unchanged (existing completed-spend rule), but the wrong paid gesture is destroyed.

Actual8case baseline:4RED (live/Load, normal/q1mirrored Cell),4GREEN legal controls buying the independent Bed AFTER Cell completion. Tests603ms,total4.74s. No fixture input injection, no schema edit. Each failed case has full pre/post saved-state captures.

## Existing accepted contract and dedup

ADR0104 newest construction gesture; #1657 accepts one full reversible template gesture. Generated work is continuation of the old paid gesture, not a new player purchase. Preserve exact sourceOrderId owner protections, allocation/refund rules and latest unrelated-action refusal.

Fresh full related bodies: #1657 completed reversal membership; #1824 stale finish API; #1687/#1690 unfinished Redo; closed #437 dispatch-tick inversion; closed #956 live newer unrelated action; #1985 lost eligibility marker after encodedLoad; #1975 provenance. This report is asynchronous old-gesture registration AFTER a newer real construction purchase, present in live sessions too. No duplicate matching this case found in fresh template/transaction/furnishing/history searches.

## Scope

Exact existing shell-order history membership can attach deferred furnishing to the original current/undo gesture while preserving the current latest independent transaction. No sequence/location ownership heuristic, new save field/version, copy or pricing rule. Ordinary purchase history and saved Undo/Redo remain. Production fix/mutation and neighbouring proof pending; no browser/CI result claimed.

[Fresh Issue1990](https://github.com/woogitsu/lockstate/issues/1990). This record is an actual measured diagnostic, not approval of a new persistence shape. No production edits at this checkpoint. Weakest claim: all deferred-room classes share this producer, but the baseline measures normal and rotated mirrored Cell only; broader classes require neighbouring source/gate evidence, not an asserted native result.
