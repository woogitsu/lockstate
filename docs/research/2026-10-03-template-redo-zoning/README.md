# Completed template Redo after independently accepted zoning

Actual packed runtime and encoded V8 at integrated checkpoint
`4b5e06b4d279260318d34a7dd604bd46c6e9435f`, measured2026-10-03.
No browser, synthetic state, schema or production fix in this baseline.

## Exact lifecycle and loss

Complete mirrored90° Basic Cell at10,10, genuinely Undo it, then accept
`ZoneRoom(room.yard,10,10,8,8)` over the freed area. The actual Yard room
instance exists. Zoning does not write construction history or clear Redo.
Continue live or through real createSaveEnvelope/JSON/decode/restore, and issue
actual packed Redo at the current kernel sequence.

The real worker template preflight immediately before Redo is
`{ok:false,reason:'structure-occupied',tile:{x:10,y:10}}`, reads without
mutating the captured state. Redo nevertheless approves all twenty old orders,
pops Redo history and moves the transaction onto Undo. Genuine construction
then charges **1530 again**, funds23470→21940. Zoning overlap eventually cancels
all eighteen shell orders but leaves **two completed, source-owned physical
Bed/Toilet objects inside the Yard**, with no template ledger. The independently
zoned Yard remains. The cost and orphaned fixtures are actual settled runtime
state, not an inference from immediate order approval.

[Final baseline output](./baseline-output.txt): **two red/two legal green**,
503ms tests,3.77s total. Exact total is recorded in the terminal output.
The legal live and encodedLoad controls omit later zoning; both restore the
complete Cell and both fixtures. Earlier probe409ms/2.70s had the same two
failures before adding the explicit immutable worker preflight assertions.
The initial Storage Room3×3 attempt failed its zoning precondition; that was
an invalid diagnostic fixture, not this production failure. The retained
baseline uses genuinely accepted open Yard8×8.

Retained four full snapshots: [blocked live](./blocked-live.json),
[blocked Load](./blocked-load.json), [legal live](./legal-live.json),
[legal Load](./legal-load.json). Each holds before, immediate and settled
kernel/world/history/economy/object/room state and actual events.
[Executable baseline](./packed-baseline.test.ts) is outside the ordinary
suite; copy to the existing `tests/integration/` directory under a temporary
filename to reproduce its intentional failures. Relative imports assume that
location; no fixture replaces authoritative state.

## Existing rule, source cause and duplicate check

Opened actual production sources:

- `src/simulation/construction/room-template-placement.ts`: the read-only whole
  footprint rule rejects existing zoning before any order can be submitted.
- `src/simulation/construction/system.ts`: Redo directly reapproves cancelled
  orders and moves history, without template placement admission.
- `src/simulation/construction/room-template-coordinator.ts`: reconnects the
  reapproved shell to pending; when later zoning refuses it cancels shell
  orders, although the reapproved fixture orders can finish independently.
- `src/simulation/runtime/session-commands.ts`: calls construction Redo before
  reconciliation. Existing template placement maps the measured obstruction
  to existing `build.unbuildable`, with actual offending tile.

Fresh full Issue bodies/searches were read before reporting:
[#1687](https://github.com/woogitsu/lockstate/issues/1687) is absent pending
obligation on otherwise legal unfinished Redo; this source already restores
that obligation. [#1657](https://github.com/woogitsu/lockstate/issues/1657)
requires the entire template transaction with no partial room and already has
accepted implementation. [#1985](https://github.com/woogitsu/lockstate/issues/1985)
is latest-action eligibility on Undo, a different missing persistent fact.
No separate overlapping-zoning Redo report was found.

Narrow candidate: inspect actual current top Redo transaction plus its exact
existing undone-template descriptors, run the existing immutable full preflight
before construction history/order mutations, and report the existing placement
refusal. Preserve ordinary Redo and both live/Load legal template controls.
No inference from locations, new tariff, save field or refusal copy is needed.
Coordinator/session-command lease was granted for this case after this actual
red; implementation and production mutation are a following checkpoint.
