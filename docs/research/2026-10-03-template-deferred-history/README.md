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

## Verified correction and negative controls

The internal generated-fixture producer forwards the exact original shell-order membership to ordinary placement. System's history writer appends only to a current/undo gesture containing all supplied original shell IDs. Empty/unknown membership opens nothing. It does not select a newer gesture, clearRedo or reset the existing newer-action refusal marker. Ordinary two-argument placement history is unchanged. Only System, internal placement request/port and coordinator producer changed; no saved/packed field or refusal/copy/tariff/owner rule changed.

Additional controls bring the focused suite to13cases: full independent→template Undo and saved Redo, live guard-hire refusal during old deferred completion, genuine independent Redo preserved during completion/liveLoad, and pure unmatched-membership no-new-gesture/no-Redo-mutation. The initial expanded baseline is9RED/4GREEN (795ms tests/3.15s total). The first fixed run exposed two fixture equality errors: it omitted the existing construction.undo-refused-newer-action event from the expected snapshot. The corrected assertion requires exactly that one existing event and otherwise an immutable complete gameplay snapshot; no event/copy guard was dropped.

[Fixed13GREEN](./fixed-terminal.txt),1.02s tests/3.38s total. Genuine coordinator producer disconnection removes only the continuation argument: [8RED/5GREEN](./producer-negative.txt),917ms/3.53s; finally byte-exact restoration [13GREEN](./producer-restored.txt),1.00s/3.28s. A second real System reader disconnection also catches the pure missing-history boundary: [9RED/4GREEN](./reader-negative.txt),1.06s/3.82s; exact restored terminal output follows. [Coordinator hash receipt](./producer-restore.json), [System hash receipt](./reader-restore.json). Detached branches excluded mutation work from branch-based WIP sweeping; finally blocks restore the captured bytes.

The newer unrelated-action controls are LIVE only: #1985's missing persisted eligibility marker is separately pending an owner choice and is not silently fixed here. The no-history control exercises the internal membership writer on the actual system after real ordinary Undo; it does not claim a natural player command prunes template history. Neighbouring/type/build/doc gates pending at this source checkpoint. Browser not run.

## Terminal source gates

Second exact restored run:[13GREEN](./reader-restored.txt),1.32s tests/4.09s total. [Neighbouring source gates](./neighbours.txt):443GREEN across13files,29.05s total (two workers), including real all-catalogue completion, rotated history, current/legacy occupied reversal, provenance, Redo admission and ordinary object placement. Both application/toolsTypeScript pass; production client build6.01s passes with its existing chunk/plugin warnings. Committed production diff is zero after exact restoration.

Exact neighbour test paths:

- tests/integration/template-deferred-history-order.test.ts
- tests/unit/room-template-command-reservation.test.ts
- tests/unit/room-template-session.test.ts
- tests/unit/room-template-redo.test.ts
- tests/unit/undo-redo.test.ts
- tests/unit/construction-edit-history-availability.test.ts
- tests/integration/room-template-rotated-history.test.ts
- tests/integration/room-template-replacement-order-ownership.test.ts
- tests/integration/room-template-redo-admission-atomicity.test.ts
- tests/integration/room-template-occupied-undo-atomicity.test.ts
- tests/integration/room-template-occupied-cancel-atomicity.test.ts
- tests/integration/room-template-legacy-occupied-history.test.ts
- tests/integration/object-placement-loop.test.ts

Separate first-task #1654 chain ends at de44ac5ad7f764374e30cde140a2f564a599da40; this branch started at its earlier source/test checkpoint2dc395b5cc27b605c79f1bbf5e7f5657b7e14b60 so that diagnostic8case baseline stayed independent. Its historical doc corrections and Blender identifier correction must be retained when the branches integrate; inherited failure is not attributed to new deferred history code. No browser/CI/hosted acceptance claimed.
