# Manual door removal must prepare its coupled template cancellation

2026-10-02. LOCAL RUNTIME VERIFIED, no browser, hosted deployment or CI claim.
Isolated published base `3eeeddc2d276714fee6a7c8420270b78d2e49b3c`.
Diagnostic `f7f223bc87`; source/proof `3671393f71`, branch
`codex/template-manual-removal-audit-20261002`.

## Selected existing rule, not a new demolition policy

The probe completed a rotated/mirrored Basic Cell with actual commands, encoded
and restored its save, then pressed its completed door through `RemoveWall`.
This command carries tile/edge, not a revision. The test records the actual
resolved completed order and its revision before the press and requires that
revision and all persisted gameplay state to remain unchanged on refusal.

Fresh open template Issue bodies included #1657, #1608, #1703 and #1710.
A fresh all-state search for RemoveWall plus template found no separate Issue.
This is an uncovered command entry to #1657/#1608's accepted whole-gesture
cancellation boundary, so no duplicate Issue or new copy was proposed.
ADR0106's ordinary wall/door demolition route and completed-spend destruction
remain unchanged. ADR0076's single-object best-effort removal remains unchanged.

## Actual baseline

The published diagnostic ran 13 cases: nine failures and four legal controls,
3.26 seconds. All occupied template fixtures had a real admitted resident and
were restored from an encoded save before the manual press.

| Saved template state | Actual manual door result before the fix |
| --- | --- |
| Current completed metadata, occupied | All 20 orders cancelled, both objects removed, occupied room and resident remain |
| Legacy absent completed metadata, occupied | Door alone cancelled; room, resident and both objects remain |
| Legacy absent completed metadata, empty mirrored 90-degree Cell | Door alone cancelled; room and furniture remain, preventing the expected whole reversal |
| Current metadata, empty mirrored 90-degree Cell | Whole reversal and subsequent adjacent construction succeed |

Ordinary north/west edge demolition beside an occupied Cell and manual removal
of its completed bed were legal controls. The bed control intentionally retains
the room and resident: the existing single-object rule is not collective unzone.

The manual wall branch resolved the real completed order and called
`cancelOrder` and `reconcileCancelledShells` directly. The existing queue Cancel
branch already called `prepareCancellation` first. Without that preparation,
current metadata attempted unzoning after mutation and continued even when the
occupied room refused; legacy metadata never recovered its exact gesture at all.

## Narrow source change

Only `src/simulation/runtime/session-commands.ts` changed in production: nine
lines in the wall arm, after object-first resolution and completed-order lookup,
before any geometry/order cancellation. It calls the existing coordinator
`prepareCancellation`; refusal uses the existing unzone reason table and the
existing wall supersession key/tile. Success follows the original cancellation,
coupled reconciliation, notice and supersession sequence.

No coordinator, object removal, tariff, history rule, revision schema, save
format, HUD, renderer or export source was changed. Ordinary walls resolve no
template association and continue down their existing path. Current completed
metadata and legacy exact order/history recovery share the same preparation
that queue Cancel already uses.

## Final actual commands and mutation

The final 17 cases add genuine older-spare relocation in current/legacy saves,
and actual Undo → encoded Save/Load → Redo → completion → admission → encoded
Save/Load → manual occupied-door refusal. Occupied refusal compares full saved
gameplay snapshots, including orders/history, geometry, objects, residency and
funds, and checks the selected order revision. Only command sequence is excluded.

The older-spare fixture builds a real Cell first at (20,5), then the rotated
mirrored target at (10,10). It asserts admission actually chose the target before
the press. Successful removal relocates to the older Cell, cancels all 20 target orders
and removes their objects/room, preserves the 20 spare orders and both spare objects, changes
no funds for completed work, and retains the destination through another encoded
Save/Load.

The empty rotated scenario projects actual worker preflight for an adjacent
Cell, verifies projection immutability, submits actual placement, waits for real
completion and verifies placed objects, room registration and fresh spending.
It proves the removed doorway leaves no phantom claim blocking reconstruction.

Deliberate production mutation: only the new manual preparation call was given
an empty unmatched order ID, leaving queue preparation and all other routes
intact. Final 17 cases became 12 failures and five legal passes in 3.52 seconds.
The selected manual boundary, legacy recovery and immutable occupied refusal
were thereby falsified; tests were not altered for the mutation.

Exact original bytes were restored in a `finally` block. Restored SessionCommands
SHA256 was `52f825b4e8fae09585dfb9188b195e811a18640fd975aed9d6b09d9f98499096`.
The related restored suite passed 204 tests across eight files in 8.32 seconds:
manual removal, occupied Cancel/Undo, legacy occupied history, ordinary wall
removal reachability, object removal, success notices and completed adjacency.

The final 17-case run passed in 3.87 seconds. App and tooling TypeScript passed
after correcting the diagnostic's widened template-ID literal type. Production
output verification passed. This is scoped local verification, not a complete
suite, native-pointer or deployed acceptance claim.

## Documentation boundary

All 28 existing source-anchor, quotation, commit-citation and research-index tests
passed on the published source in 21.08 seconds. No existing source anchor needed
editing. This record and its index row are the only documentation changes.
Budgets, scanners, tolerances, workflow and guards remain unchanged.


Final record/index verification passed all 28 tests in 12.14 seconds after explicitly
refreshing the owned remote tracking ref. The first citation run had reported the
already-pushed source/diagnostic as local-only because a named-branch fetch updated
FETCH_HEAD without creating that tracking ref; no citation guard was weakened.
