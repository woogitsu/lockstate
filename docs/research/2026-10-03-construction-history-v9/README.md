# Construction history V9 — approved continuity fields

## Decision and scope

On 2026-10-03 the coordinator relayed the owner's direct approval of the
package in commit `79a18be1cb`,
`docs/research/2026-10-03-queued-template-cancellation-load/v9-review-proposal.md`:
V9 writes exactly `payload.construction.newerActionThanTheStackTop` and optional
`payload.construction.orderRevisions`. The former is a boolean, the latter an
own-key JSON object mapping nonempty order IDs to integers from zero through
`Number.MAX_SAFE_INTEGER`. Historical absence defaults to false and `{}`.
V1–V8 validators remain frozen; the V8→V9 migration preserves the other data.
No refund, refusal message, wire command, UI or ownership inference changes.
This records the coordinator's approval relay, not a fabricated verbatim owner
quotation. The related reports are [#1985](https://github.com/woogitsu/lockstate/issues/1985)
and [#2021](https://github.com/woogitsu/lockstate/issues/2021).

## Baseline

The isolated subject is `63f8288f1386f6ac4194c189e1888e5b261a501d`.
Actual packed commands and encoded saves produce **3 RED / 7 legal GREEN**:
two queued rotated/mirrored template cancellations keep token 2 live but load
with token 0 and incorrectly refuse; an accepted Guard hire protects an older
completed square from live Undo but loses that protection after Load. No-hire
Undo, genuinely stale live tokens and fresh post-Load cancellation are controls.
The whole immutable construction/world/entity/identity/system comparison
excludes only the separately asserted alert event ledger, because refusal must
append its existing event. Two earlier executions accidentally included that
ledger (first under an incorrect field name); their 4 RED / 6 GREEN outputs are
retained as fixture mistakes, not additional product failures.

Raw outputs are in `raw/baseline.txt`, `raw/baseline-corrected.txt` and
`raw/baseline-corrected-alert-ledger.txt`. No browser, build or native claim.

## Known boundary

V1–V8 cannot recover counters or a newer-action marker they never saved.
Migration supplies the approved defaults and does not rewrite queued tokens.
An old queued nonzero token remains safely stale. No standalone object ownership
or shell ledger field is introduced. Source/codec preservation and producer
omission evidence will be recorded after implementation.

The weakest claim at this checkpoint is implementation completeness: these are
the original reproductions and accepted design, before the production fix.
