# Occupied templates and ordinary queue cancellation

## VERIFIED: existing issue scope and actual baseline

The isolated integrated baseline is published `68da30f64c`. Fresh GitHub reads
opened the complete #1608 and #1657 bodies. #1608 requires a cancelled member
to reverse its entire coupled plan. #1657 requires occupied-room refusal or
relocation to remain atomic, with no partial room. The accepted whole-gesture
Undo implementation already answers that rule; ordinary `CancelBuildOrder`
did not run its preparation. This is a remaining command boundary of those
existing issues, not a new salvage or history policy and not a duplicate Issue.

Complete a Basic Cell at (10,10), admit a real prisoner, then submit
`CancelBuildOrder` for its completed bed order with the actual current revision.
Cancellation is legal for completed orders under the existing construction
contract. The bed is removed first; reconciliation tries to unzone the room,
ignores its occupied refusal, and cancels the remaining shell and fixture.
The admitted resident remains in the registered room after its shell and
required furniture disappear. The same defect occurs after encoded Save/Load.

Diagnostic `7a7072799a` publishes two actual-command failures and a legal
unoccupied cancellation control. Expanded pre-fix verification gives eighteen
failures and three legal controls. These include all four rotations and both
mirror states of a genuinely built, occupied four-cell row, with current
metadata and encoded legacy saves omitting only the optional completed/undone
template metadata. Real orders, history, zoning and resident state are retained.

## VERIFIED: preparation before reversal

Initial published source `8a07fdfcab` adds `prepareCancellation` at
`src/simulation/construction/room-template-coordinator.ts:321`. It finds the
actual undo/current transaction containing the selected order, then delegates
to existing `prepareUndo`. Review additionally found that this must not make
actual completed metadata depend on an Undo group: the decoder accepts a valid
restored order book with that metadata but empty history. No native history
eviction occurs in the opened construction source. Published follow-up
`7aa65eaef1` first reads
exact generated order-ID membership from completed metadata; only the absent-
metadata legacy fallback requires the actual history group and existing exact
order/history/zone-derived association. Both delegate to `prepareUndo`. The collective
`unzoneTogether` excludes every removed row member from relocation destinations.
No second persisted ownership or inferred location-only template rule is added.

At `src/simulation/runtime/session-commands.ts:1206`,
`if (simCommand?.type === 'CancelBuildOrder')`, the command invokes preparation
only for a found, cancellable order whose actual revision matches the press.
An occupied refusal returns before cancellation, geometry removal, material
refunds or success events. The existing `unzone.room-occupied` reason is reused.
Unknown, terminal and stale presses retain the ordinary construction handler.
No new-session wire or construction-system change is needed.

The final twenty-seven cases compare every persisted gameplay field except the
advancing kernel command sequence on refusal. A real older spare Cell receives
the resident before successful cancellation, including legacy reload. Another
case lets the real sentence system release the sole resident, then retries the
same cancellation successfully and checks encoded reload. Unoccupied full
gesture cancellation, stale cancellation, and an unrelated ordinary wall
cancellation remain legal controls.
The review adds the successfully decoded restored-book compatibility case,
which fails on the initial fix, plus two genuine Undo/Save/Redo/rebuild/admission
cycles ending in current and legacy reload. The restored-book case is explicitly
a decoder/restore compatibility control, not an invented native eviction.

## VERIFIED: mutation, exact restoration and gates

The initial production session-preparation disconnect produces twenty failures
and four passing controls in the twenty-four-case regression. The final
twenty-seven-case disconnect produces twenty-three failures and four controls.
Separately disabling only the direct completed-metadata association produces
one restored-book failure and twenty-six controls. The matching
current-metadata spare relocation already works in the older reconciliation
path, explaining why that positive control remains green. The legacy spare
case exposes the missing history association as well as the occupied refusal
cases. Exact restoration of session-commands has SHA256
`C79028B6C191E4ED45698EA941700FE498F22C823A8F798F6A1F04DBAE43B399`.
Exact coordinator restoration has SHA256
`64E1DD7BCB5323030A822EFE3F3663CB13117937ECF576AB0286F03638EB16C2`.

After initial restoration, 378 tests in ten files pass in 34.24 seconds.
Final restoration with the review cases passes 381 tests in those same ten
files in 26.05 seconds: cancellation,
occupied Undo, legacy occupied history, template session/completed transactions,
rotated history, stale cancellation, money conservation, cancellation refund
preview and construction. Application and tools TypeScript pass; the production
build passes. The four documentation gates pass 28 tests before this note; no
existing WORLD/ADR0047/ADR index live fragment needs correction at this source
checkpoint. No quotation budget or guard is changed.
The completed record and index also pass the same 28 documentation tests in
12.17 seconds.

## Limits

No browser, workflow, schema, copy, tariff, salvage or history-policy change,
and no CI polling or merge. The weakest claim is native queue interaction:
these are genuine packed commands and encoded runtime restoration, without a
browser press. A native queue press mutating the same occupied fixture despite
the worker refusal would require a separate producer/dispatch investigation.
