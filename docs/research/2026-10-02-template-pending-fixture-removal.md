# Saved pending template fixture removal

Recorded 2026-10-02 against published integration checkpoint `3eeeddc2d276714fee6a7c8420270b78d2e49b3c`.
Diagnostic commit: `2aaca66b2e09e44062c01f077566dcfd3dc3f0e8`.
Scoped source and regression commit: `57510e769d6c1de517af16fe2bce855f9db47172`.

## Existing rule and actual missing entry

Fresh Issue bodies #1608, #1669 and #1657 describe coupled cancellation, immediate paused release and refusal before reversing an occupied gesture. This extends those records; no duplicate Issue or policy was introduced. Fresh #1687 and #1750 were checked against existing pending Redo and delivery bootstrap tests: four tests in two files passed in 4.78 seconds. The frontier ownership-only premise of #1740 remains falsified; ADR0108 question5 remains open.

The missing entry was a pending furniture removal after an encoded save, reached through packed RemoveObject or RemoveWall's object-first arm. ObjectPlacementService removed the selected pending order directly. Those command arms neither prepared collective unzoning nor reconciled the cancelled gesture immediately. A paused command dispatch never enters the scheduled coordinator update. RemoveWall's separate completed wall/door arm is a different fix and was not edited here.

## Real baseline

The first published diagnostic produced four failures and two ordinary controls passing in 3.14 seconds:

- A mirrored90-degree Cell Row Four was genuinely built until its58 shell orders completed and one fixture was in progress with seven assigned. After encoded Save/Load, removal aimed at an assigned rotated bed's second footprint square cancelled only that bed. The whole66-order gesture remained coupled by the accepted rule.
- An occupied partial row, with current metadata and with absent legacy completed metadata, changed the selected pending allocation and funds instead of refusing before changes.
- Two ordinary pending beds beside a completed Basic Cell retained single-order cancellation through either command arm.

The command helper submits packCommand with the runtime's real expected sequence and current tick, then dispatchDueCommands. The tick stays unchanged. Snapshot checks cover gameplay state, including funds, world geometry, objects, entities and construction history; the transport kernel advances its sequence to consume the command. Refusals are checked separately, and selected-order revisions stay unchanged on refusal. Saves pass createSaveEnvelope, JSON encoding, decodeSaveEnvelope and restoreSimulationRuntime.

## Narrow implementation

Only ObjectPlacementService and SessionCommands changed. A pure pendingRemovalOrderId reader uses the removal's existing full-footprint lookup and standing-object priority. Both object-entry arms call the existing template preparation before removal, reuse the existing occupied refusal and reconcile only an order-cancelled outcome before its existing cancellation notice. No save format, tariff, copy, history or completed-object demolition policy changed.

The final16 cases cover both commands, current and legacy saved partial rows, rotated bed second squares, paused collective release and same-location worker preflight followed by actual rebuilding to eight objects and four rooms. Occupied cases compare full pre/post gameplay and selected revision. Genuine relocation cases build an older Basic Cell at20,1, occupy the partial row, then confirm its resident moves to room.cell:21:2 before all66 row orders reverse; the20 older orders and two older objects survive, including another encoded Save/Load. Standing completed bed removal keeps one room and the other object, with the construction snapshot unchanged. Ordinary pending removal stays single-order.

During preparation of these extra controls, a spare at20,5 intersected the rotated row perimeter and correctly refused placement. That setup was corrected to20,1 before the successful proof. A lookup initially used a buildable ID instead of object.bed; that setup was also corrected. Neither setup failure is counted as a game defect.

## Production mutation and restoration

- Disconnecting the pure pending target reader caused eight failures and eight passing controls in6.62 seconds: current/legacy occupied refusal and legacy collective release/relocation broke.
- Disconnecting only immediate object-arm reconciliation caused eight failures and eight passing controls in5.02 seconds: all paused release/rebuild and genuine relocation cases broke.
- Each mutation ran against genuine production source; each restoration copied back exactly the original bytes. Reader-mutation SHA256 before/after: 1f72cdfa94f6a5e99f7f1a9be843fdb91e48fb881aa6745c09a12e156673d67f. Reconciliation-mutation SHA256 before/after: 1bd4aff84846a1877272398dd1068c823c15dd3baa51ebe661cd3f559e877030. A later documentation-only method move put the pure reader before the removal docblock; the final source commit is the immutable checkpoint above.
- Exact restored existing construction/object/history/save/notice group:397 tests across ten files green in24.35 seconds.
- Final targeted regression after that method move:16 tests green in5.74 seconds.
- App and tools TypeScript checks and production build passed. These are scoped local gates, not hosted CI or native browser acceptance.

An initial documentation-gate command named nonexistent tests/unit paths; it ran only the regression and is not counted as documentation verification. The proper documentation gates live in tests/foundation.

Final documentation verification: all four foundation gates passed,28 tests in13.32 seconds; no anchor correction or guard/budget change was required.
