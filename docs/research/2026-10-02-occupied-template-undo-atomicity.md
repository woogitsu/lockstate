# Occupied completed template Undo preserves a whole prison transaction

## Existing coverage and fresh Issue evidence

Source review of `tests/integration/room-template-rotated-history.test.ts:94`,
`const cases = ROOM_TEMPLATE_IDS.flatMap`, and its worker room-detail check at
`tests/integration/room-template-rotated-history.test.ts:89`,
`expect(detail?.requirementSummary.missingCapability).toBe(0)`, found the
existing 20-template, four-rotation, two-mirror completion and encoded Save/Load
coverage. That matrix was not repeated or presented as new evidence.

Fresh complete Issue reads opened
[#1657](https://github.com/woogitsu/lockstate/issues/1657),
[#478](https://github.com/woogitsu/lockstate/issues/478), and
[#528](https://github.com/woogitsu/lockstate/issues/528).
The accepted complete reversible transaction in #1657 already requires occupied
room refusal or resident relocation. #478 supplies the implemented relocation
rule; #528 supplies exact required furniture quantities. The new failure belongs
to #1657. No duplicate Issue, new owner choice, persistence field or copy was made.

The isolated branch starts at published integration `74ab00891a`. Its two
prerequisite cherries `791eabb5e4` and `ace05c3391` duplicate the already handed
completed wall/furniture sources `6bbe678b2e` and `d6802fa2b6`. The new source
checkpoint is `322cb5e5a4`; integration should take this new commit without
repeating the prerequisites.

## Actual session failure

A packed PlaceRoomTemplate command completes Basic Cell, including its bed and
toilet. A packed AdmitPrisoner command obtains a real residency claim; the save
is encoded through createSaveEnvelope, JSON and decodeSaveEnvelope before the
runtime is restored. Worker room-detail reads zero missing capabilities and
existing doorway access.

On the original source, actual Undo cancels the shell and object orders and
moves the construction transaction into Redo even though RoomZoning refuses
removal of the occupied Cell. The room still names its resident while its
walls, bed and toilet have been destroyed. This reproduces a live domain
failure after valid catalogue completion rather than an authored-layout error.

There is a second measured relocation defect. A saved rotated four-cell row
contains one admitted resident and three empty cells. Excluding only occupied
removed rooms allows the existing relocation search to choose another empty
cell which the same gesture also removes. The first grouped-unzone trial throws
`Room instance "room.cell:11:14" still has occupants`. The existing relocation
port already accepts every excluded room; its caller must pass empty removed
rooms as well as occupied ones.

## Correction under the existing rule

`src/simulation/construction/system.ts:833`, `public setUndoPreparation`, installs
a runtime preparation port. `src/simulation/construction/system.ts:896`,
`this.undoPreparation?.(newest)`, runs it before flushing or popping any history
and before cancelling an order. Standalone construction retains its existing
history outcome and cancellation rules.

`src/simulation/construction/room-template-coordinator.ts:313`,
`public prepareUndo`, identifies the completed template for the exact history
entry. It passes the authored zones to one grouped removal at
`src/simulation/construction/room-template-coordinator.ts:322`,
`this.roomZoning.unzoneTogether(plan.zones, tick)`. A row is not replaced with
its bounding rectangle, which would also select the intervening corridor.
Pending shells and the existing shell-free Yard transaction keep their paths.

`src/simulation/rooms/zoning.ts:805`, `public unzoneTogether`, collects and
validates every affected room before clearing any plane. It reuses the existing
use-claim refusal and all-or-nothing resident relocation. Ordinary single-area
Unzone delegates to the same path. At `src/simulation/rooms/zoning.ts:903`,
`const excludedInstanceIds = removed.map`, all removed rooms are excluded as
relocation destinations, including empty ones. Code-unit sorting preserves
existing determinism. The existing relocation implementation at
`src/simulation/prisoners/prisoner-operations-runtime.ts:747`,
`const excluded = new Set(instanceIds)`, needs no change.

The composition port at `src/simulation/runtime/new-session.ts:1633`,
`const refusal = roomTemplates.prepareUndo`, records the existing actual
Unzone refusal and stops Undo. A later successful retry supersedes that
refusal. No save schema, owner-approved history ordering, latest-action rule,
refusal wording, workflow or renderer policy changes.

## Regression cases and mutation evidence

The new integration file dispatches actual packed commands and compares every
persisted gameplay field except the advancing kernel command envelope:

- Eight Basic Cell mirror/rotation cases refuse occupied Undo without changing
  funds, orders, history, world or actors, repeat after encoded Load, then use
  the actual sentence system to release the resident. Retried Undo succeeds;
  encoded Load, actual Redo, completion and another Load restore worker readiness.
- Two mirrored 90-degree row cases save a partially completed shell, resume it,
  admit one resident and save again. Undo cannot use any of the other three
  empty members as a relocation destination. All eight fixtures survive refusal.
- Eight positive controls create an older real spare Cell before the newest
  template. Undo relocates the admitted resident to that spare, removes exactly
  the newest room and preserves the spare's readiness after encoded Load.
  Undo of the now-occupied spare then refuses atomically when no vacancy remains.

Disconnecting only the production before-Undo preparation in new-session makes
all 18 tests fail in 4.29s. Exact byte restoration has SHA256
`024ECB624071B880F2B233B194FE8E9267041AAA95BFC80F5FD6483E129FD637`.
Restoring the previous occupied-only relocation exclusion makes the two row
cases fail with the occupant RangeError in 2.64s (16 others deliberately
filtered). Exact zoning restoration has SHA256
`15EF9BDC9772A20C5ADC06EFECFDAB9B64D20DC07E7434D48F27B4397DBA04AC`.

The restored new regression, completed-template transaction, entrance history,
room-zoning loop, relocation-notice loop and edit-history availability suites
pass 69 tests in six files in 4.43s. Generic construction, RoomZoning, template
session and template Redo pass another 106 tests in four files in 5.45s.
Both TypeScript targets and the production build pass. These are obtained
session/worker/persistence results; no browser, CI polling or merge was used.

The restored source-anchor, quotation, commit-citation and research-index
contracts pass 28 tests in four files in 12.20s. Five shifted existing anchors
were amended in ADR0022, ADR0047 and the ADR index; earlier coordinates are
retained explicitly as historical indications. Budgets and guards are unchanged.
