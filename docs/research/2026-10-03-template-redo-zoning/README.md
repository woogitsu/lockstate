# Completed template Redo after independently accepted zoning

Actual packed runtime and encoded V8 at integrated checkpoint
`4b5e06b4d279260318d34a7dd604bd46c6e9435f`, measured2026-10-03.
No browser, synthetic state, schema or production fix in this baseline.
Fresh nonduplicate [Issue1986](https://github.com/woogitsu/lockstate/issues/1986).

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
503ms tests,3.49s total, as recorded in the retained terminal output.
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

## Following production checkpoint: exact existing admission before Redo

Published source/test checkpoint:
`c37df121b8eaf16af5d53c4708869e8f7d2b1f1d` on
`codex/template-redo-zoning-audit-20261003`. The earlier baseline prose
mistyped the total as3.77s; its unchanged retained terminal gives3.49s and the
prose is corrected above. The actual failed/passed counts and503ms were correct.

`RoomTemplateCoordinator.preflightRedo()` reads the actual top Redo history
and the exact existing undone descriptors whose history IDs belong to that
transaction. It instantiates their stored template/origin/mirror/quarter-turns
and runs existing read-only admission before any order changes. The session
router refuses before invoking ordinary construction Redo and reports existing
`build.unbuildable` or `build.unowned-land` at the actual offending tile. No
new message, tariff, save metadata or construction-system rule is added.
Ordinary Redo passes through; older conflicting descriptors cannot prevent a
legal top gesture. No legacy absent-descriptor inference is introduced.

The final twelve real kernel cases cover normal/mirrored Cell, mirrored
Canteen and shell-free Yard, together representing all four rotations, live
and encodedLoad. They assert entire gameplay snapshot/history/order/fund
immutability on refusal, no construction-success event or delayed purchase,
then genuine UnzoneRoom→encodedLoad→successful retry of the preserved history.
Separate controls finish legal live/Load Cell, ordinary square-wall Redo, and
legal top template before its older blocked neighbour. These are gameplay
transitions, not a repeat of the catalogue scalar geometry matrix.

### Real production mutations and byte restoration

The branch was detached during each mutation so checkpoint sweeping could not
publish deliberately broken source. Each `finally` restored the original fixed
file bytes and branch before subsequent gates.

- [Disconnect actual coordinator preflight](./preflight-mutation.txt):
  **9 failed /3 legal passed**,685ms tests,2.99s total.
  [Exact restoration](./preflight-restoration.txt): **12 passed**,
  988ms/3.28s.
- [Disconnect actual top-history membership](./top-membership-mutation.txt):
  **1 failed /11 passed**,988ms/3.37s, at the legal newer gesture.
  [Exact restoration](./top-membership-restoration.txt): **12 passed**,
  1.03s/3.35s.
- Restored fixed coordinator SHA256:
  `66C92DAC5DA13D349FCBCFDD10B40DBD58654144F8DC9FF6A5CDAE2D9EAEC382`.
- Fixed session-router SHA256:
  `E6A30AB9D31049CAB608708BC8F1186C905C2A30AE382CB3B9DA37F7B6C4B0AF`.
  Only the approved27-line admission addition remains as the intended
  production change; no mutation bytes remain.

Nine focused gameplay files: **147 passed**,7.92s total. Exact paths:
`tests/integration/room-template-redo-admission-atomicity.test.ts`,
`tests/unit/room-template-redo.test.ts`, `tests/unit/undo-redo.test.ts`, and
`tests/integration/room-template-entrance-history.test.ts`,
`tests/integration/room-template-economy-transitions.test.ts`,
`tests/integration/room-template-replacement-order-ownership.test.ts`,
`tests/integration/room-template-occupied-undo-atomicity.test.ts`,
`tests/integration/room-template-manual-door-removal.test.ts`,
`tests/integration/room-template-pending-object-removal.test.ts`.
Both TypeScript projects and Vite production build passed (client5.87s).
Eight documentation/index contracts passed **62 tests**,22.49s. No live-anchor
or quotation-budget edits were required by that run. No browser, hosted
release, remote CI or full-suite claim is made here; root integration gates
remain separate.

Final documented checkpoint checks: **62/62 passed**,14.98s. After adding the
new published source citation, one citation run initially saw only the existing
main-only local origin fetch refspec. The source was already remote-verified;
fetching only this owned branch into its origin tracking ref made the cited
commit visible to the unchanged gate. Its isolated8 tests passed, then the
complete eight-file62-test run above passed. No citation allowlist or budget
was modified.
