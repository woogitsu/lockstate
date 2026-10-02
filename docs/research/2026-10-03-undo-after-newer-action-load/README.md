# Encoded Load forgets the newer accepted action that barred Undo

Measured 2026-10-03 at published integrated source
`4b5e06b4d279260318d34a7dd604bd46c6e9435f`. This is actual packed kernel,
current V8 encode/decode and runtime restore; not browser acceptance.
No production, schema, copy or policy change is implemented.

## Reproduction and legal controls

The [packed reproducer](./packed-reproducer.test.ts) is retained **outside the
ordinary test suite** because one accepted-contract case fails on this source.
To reproduce from this checkpoint, copy it to
`tests/integration/.local-hire-load-undo.test.ts`, then run that file with
Vitest. Its relative production imports assume that destination. Capture files
are written under `.local-shell-ownership/`.

Create a runtime at seed73. Place and genuinely complete square `wall-brick`
order `owned-square` at12,12, costing80. Submit accepted `HireStaff` for a guard
at4,4, costing80. The precondition is one actual guard, completed wall and
funds24840. Fork the same lifecycle into a live continuation and a continuation
encoded by `createSaveEnvelope`, JSON serialization, `decodeSaveEnvelope` and
`restoreSimulationRuntime`. Send actual packed Undo at each continuation's
current expected kernel sequence without another player command.

| Continuation | Original wall after Undo | Square after Undo | Guard count | Funds | New event |
| --- | --- | --- | --- | --- | --- |
| Hire, live | completed | 1 | 1 | 24840 | construction.undo-refused-newer-action |
| Hire, encoded Load | **cancelled** | **0** | 1 | 24840 | construction.undone-spend-destroyed |
| No hire, live legal control | cancelled | 0 | 0 | 24920 | construction.undone-spend-destroyed |
| No hire, encoded Load legal control | cancelled | 0 | 0 | 24920 | construction.undone-spend-destroyed |

The paired hire continuations execute Undo at tick171. The guard survives;
the restored Undo destroys spent construction, with no refund. Full captures:
[hire live](./hire-live.json), [hire Load](./hire-encoded.json),
[latest-build live](./build-live.json), [latest-build Load](./build-encoded.json).
They retain original/pre-Undo/post-Undo world, construction, kernel and
simulation state plus actual post-command events.

[Final baseline output](./baseline-output.txt): **one failed, three passed**,
79ms tests, 2.71s total. The initial two-case probe independently gave one
failed/one passed (44ms/2.28s). An intermediate four-case consumer extension
mistakenly hired in its no-hire controls and interpolated its test labels in
PowerShell; those were diagnostic fixture errors, corrected before the final
four-case output. They are not additional production failures.

## Existing accepted contract and duplicate check

[ADR0104](../../adr/0104-what-undo-takes-back.md), option2, says Undo refuses
when its construction transaction precedes the newest accepted player
command. Its historical reload rationale assumes a newer command follows
reload before Undo; this reproduction saves **after** the accepted hire and
presses Undo directly after restoration.

Fresh GitHub searches for Undo/Load and for `newerActionThanTheStackTop`,
and complete related Issue bodies, were read on2026-10-03:

- [#956](https://github.com/woogitsu/lockstate/issues/956), closed: live hire
  semantics; explicitly did not measure the saved-Undo caveat.
- [#108](https://github.com/woogitsu/lockstate/issues/108), closed: preserving
  the open build gesture, which the no-hire encoded legal control must retain.
- [#113](https://github.com/woogitsu/lockstate/issues/113), closed: restored
  nonempty stacks and mutation coverage; different missing state.
- [#1370](https://github.com/woogitsu/lockstate/issues/1370), closed: worker
  publication of edit availability; no persistence fix in that body.
- [#1975](https://github.com/woogitsu/lockstate/issues/1975): exact object owner,
  a separate accepted V8 boundary. No replacement object is involved here.

## Opened source and exact missing state

These are immutable checkpoint coordinates, not current remote-main claims:

- `src/simulation/construction/system.ts:13-38`: ConstructionSnapshot carries
  orders, two stacks and optional current-gesture fields, with no latest-action
  eligibility marker.
- `system.ts:394`: transient `newerActionThanTheStackTop` starts false.
- `system.ts:858-871`: unrelated-action writer and refusal reader.
- `system.ts:2276-2300`: snapshot returns the existing history fields, omitting
  this flag. `system.ts:2332-2367` restores those fields, not the flag.
- `src/persistence/save-schema.ts:244`: strict construction payload schema;
  its V1–V8 users share that shape. `savePayloadV8Schema` extends V7 only in
  simulation fields (`:1873-1878` at this checkpoint).

Adding a saved marker is therefore a persistence shape change. The successful
no-hire controls refute setting every restored nonempty history to stale:
that would destroy the genuine latest-build Undo property fixed by #108.

## Concrete proposal for review, not an implementation or approval

Recommended scoped mechanism: persist the exact already-computed Boolean as
`payload.construction.newerActionThanTheStackTop`, rather than infer command
order from geometry, current guard presence, construction completion time or
old order placement sequence. Redo can legitimately make an old order the
latest action without changing that order's original placement sequence.

The review needs to choose the compatibility boundary before implementation:

1. **New V9 envelope** with the marker in its construction shape, frozen
   V1–V8 validators and a data-preserving V8→V9 migration; marker absent in old
   data defaults false to retain the prior legacy behaviour. Newly captured
   data preserves true and false exactly. This fixes the measured case for new
   saves, while explicitly leaving unknowable legacy eligibility unchanged.
2. **Optional widening only of the current V8 construction shape**, retaining
   every historical V1–V7 validator and absent=false compatibility. The #108
   optional-field precedent supports considering this, but it is still a new
   shape decision and is not assumed granted here; old strict V8 readers would
   not accept a newly written field.
3. **Defer the field**: retain this actual defect and its captured evidence.

The first option is recommended for explicit versioned reader compatibility.
No change to Undo's subject, tariffs, completed refund policy, strings or object
ownership is proposed. Conservatively refusing every old save with history
would be a separate legacy policy change and is not included.

After a reviewed grant, required proof is the real hire baseline red→fixed,
latest-build controls, genuine newer Redo, all V1–V8 data preservation, direct
worker snapshot restore, availability publication and disconnect-marker
production mutation red→byte-exact restoration. No such fix/mutation result
is claimed in this diagnosis.
