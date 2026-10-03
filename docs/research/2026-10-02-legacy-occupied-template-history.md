# Legacy occupied template history keeps real room access and atomic Undo

## Existing contract and a fresh counterexample

Fresh bounded legacy-template Issue search returned the existing incoming
entrance reports #1661 and #1672. A fresh complete read of
[#1657](https://github.com/woogitsu/lockstate/issues/1657) explicitly describes
Save/Load, full completed template reversal, occupied-room refusal/relocation
and no partial room. The owner-approved full transaction in this session
already implements that rule. The newly measured legacy counterexample belongs
to the same report; no duplicate Issue or new policy choice was made.

The isolated branch starts at published `3a0d327a5f`, including occupied Undo
source `5e044466c9` and its documentation `f5692258b9`. Source checkpoint
`e0e25f0006` changes only coordinator association and a new actual integration
proof. The concurrent HUD, renderer, input and browser surfaces are untouched.

The existing 20x8 rotated history proof already checks exact completed objects,
worker readiness and doorway access across encoded envelopes. Existing completed
row entrance proofs also reopen compatible V7 envelopes with optional completed
gesture metadata absent. Existing occupied-Undo tests exercise only recorded
completed metadata. Repeating those matrices would not test their missing
intersection: occupied history after valid metadata absence.

The baseline probe places and genuinely finishes a mirrored 90-degree four-cell
row, admits one prisoner through the actual command, then encodes and decodes
the accepted legacy shape. Only the optional completed/undone template metadata
is absent; all actual world, objects, residents, construction orders and history
remain. Save decoding succeeds. Actual Undo cancels the shell and all eight
fixture orders and moves history while the occupied row still exists. The
current-metadata control refuses atomically. Obtained result: one red legacy
case, one green control in 4.75s.

## Exact association, obtained at Undo

At `src/simulation/construction/room-template-coordinator.ts:327`,
`const request = recorded ?? this.recoverCompletedGesture(orderIds)`, the normal
recorded path stays first. Only a missing record triggers the new history reader
at `src/simulation/construction/room-template-coordinator.ts:458`,
`private recoverCompletedGesture`. Its evidence is the actual active Undo entry,
not a rendered doorway or a room rectangle alone:

- Every distinct history ID belongs to one canonical minted template sequence.
- Every ID names a real construction order. A whole canonical authored order
  book must have exactly the same IDs and count.
- Definitions, tile positions, square footprints, normalized edges and object
  orientations all match that book. Its shell orders have actually completed.
- Catalogue candidates are checked in deterministic order across both mirrors
  and four turns. Their inferred origin must fit safe coordinates.
- Every authored room zone has the correct live catalogue numeric ID. This
  distinguishes room purposes even if two layouts share shell and furniture.

A match reconstructs the existing template obligation from persisted evidence.
Ordinary construction and incomplete/foreign order books are not treated as a
full authored gesture. Shell-free Yard cannot be inferred from an empty order
book and keeps its existing world-transaction path.

The accepted absent-empty Load behavior at
`src/simulation/construction/room-template-coordinator.ts:446`,
`this.completed = snapshot?.completed?.map`, is unchanged. Loading does not add
metadata. Grouped Unzone still runs before any construction/history mutation.
If occupancy or use refuses, recovery adds nothing, so all persisted gameplay
fields remain identical. Only successful removal retains the recovered record
at `src/simulation/construction/room-template-coordinator.ts:338`,
`if (recorded === undefined) this.completed.push(request)`. Existing cancellation
reconciliation moves it into the already-approved optional undone ledger and
supplies normal saved Redo. There is no new field, schema version, copy, tariff,
latest-action choice or migration.

## Actual resident, route and lifecycle proof

Eight legacy row cases at
`tests/integration/room-template-legacy-occupied-history.test.ts:95`,
`it.each(orientations)`, cover both mirrors and all four turns. Before admission,
real budgeted session navigation finds prisoner and guard routes through the
furnished lower-cell entrance. After encoded legacy Load, occupied Undo preserves
all gameplay fields except the advancing kernel envelope, including funds,
orders, actors, zones and absent optional metadata. All eight fixtures and zero
missing worker capabilities remain. The same actual doorway route requests
still succeed. The actual sentence system then releases the resident; retried
Undo removes the row and its furniture. Encoded Load, actual Redo, genuine
completion and another Load restore furnished doorway access and readiness.

Two current-metadata controls at
`tests/integration/room-template-legacy-occupied-history.test.ts:125`,
`it.each([false, true])`, retain the existing occupied refusal path.

Eight positive relocation cases at
`tests/integration/room-template-legacy-occupied-history.test.ts:135`,
`it.each(orientations)`, complete an older spare Cell before the newest rotated
or mirrored Cell. A real admitted resident occupies the newest Cell. The legacy
save lacks completed metadata for both gestures. Undo identifies only the exact
newest history entry, relocates the resident into the surviving older spare,
removes two newest fixtures and preserves treasury. Another encoded Load retains
the spare's occupancy, readiness and prisoner/guard doorway route. These route
results measure the actual session planner, not browser animation.

Nineteen shelled catalogue-class cases at
`tests/integration/room-template-legacy-occupied-history.test.ts:161`,
`it.each(classes)`, vary mirror and turn across catalogue entries and remove
optional metadata after real completion. Successful Undo, encoded Load, Redo,
completion and another encoded Load restore exactly the original world planes,
object snapshots and correct catalogue purpose. This checks distinct legacy
order/zone association, rather than repeating the existing 160 geometry cases.
Existing complete-transaction tests retain shell-free Yard coverage.

## Mutation and exact restoration

Disconnecting only the production fallback to recoverCompletedGesture reproduces
35 failures and two unchanged current-metadata passes in 6.78s. This restores
the observed metadata-only behavior without changing test setup or assertions.
Exact byte restoration of the coordinator has SHA256
`E2408CFB2F0228D38B201BE779FEE42FB365542F92BA506DE0A596C23076AFDA`.

The restored new legacy history, existing occupied history, complete transaction,
pending/session, ordinary RoomZoning and ordinary construction suites pass 182
tests in six files in 9.59s. Both TypeScript targets and the production build
pass. Source-anchor, quotation, commit-citation and research-index contracts
also pass 28 tests in four files in 14.43s with this record indexed. No browser,
workflow edit, CI polling or merge was used.
