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
At immediate dispatch, a nonzero old token mismatches the default zero and
refuses. This is not a universal safe-stale guarantee after further state
advancement: the measured rich legacy case retained token1, restored0, then
advanced and cancelled, finalcounter2/pending0/refusalnull. That exact tuple is
`raw/legacy-counter-tuple.json`. The earlier migration fixture incorrectly
expected universal refusal after12ticks (19RED37GREEN, then1RED55GREEN retained).
The bounded legacy diagnostic is preserved as inert executed source and raw
output. Its first two successful executions lacked a captured tuple; the final
execution writes the actual tuple directly. No inference, queued-token rewrite
or new legacy cancellation rule was implemented.
No standalone object ownership or shell ledger field is introduced.

## Implementation and terminal evidence

The production files are only `src/simulation/construction/system.ts`,
`src/persistence/save-schema.ts` and `src/persistence/save-migrations.ts`.
The shared historical construction shape is untouched; V8 metadata is pinned
to literal8 and V9 gets its own extension. The migration clones raw data.
Current capture records the complete sorted own-key Map; restore reconstructs
that Map and resets absence even when restoring onto an already used instance.
The V9 record parser independently clones values and preserves `__proto__`,
which the installed Zod4 `z.record` actually omitted during the initial probe.
No source-order inference, format change beyond the two approved fields,
UI/copy, procurement, refund, workflow or renderer changes.

- Original3RED7legal → fixed10GREEN; added encoded stale controls and whole
  captured session equality produce12GREEN. Both unchanged delayed cancellations
  preserve their exact queued commands, orders, refund and complete session;
  both staleLoad cases refuse without changing orders/history/funds.
- 121GREEN/6files cover21 historical V1–V8 data cases,8 frozen validators,
  exact zero/prototype/terminal/nonexisting keys, invalid bounds/types, detached
  records, rich completed/undone/pending templates, physical owners and commands.
- Four real System producer omissions at `f374555e0ffc44c68d34636e2b39a42213080344`:
  marker capture1RED11GREEN; ledger capture4RED8GREEN; marker restore1RED11GREEN;
  ledger restore4RED8GREEN. Restoration12GREEN; exact before/after source SHA256
  `f8a8bfee9cc587aa9b20a291d787c1c57c6907f504d53f305ef17f73138b21ce`, production diff0.
  The initial negative harness expected2 ledger failures but observed4 because
  the two newly added staleLoad controls also correctly failed; that incomplete
  receipt is retained, and only the two remaining restore ports were executed
  afterward. No hidden repetition of the first two producer negatives.
- Bounded migration/history neighbors: initial16RED231GREEN exposed historical
  capture fixtures carrying new V9 fields while claimingV6/V7. After exact
  historical field removal,9RED468GREEN exposed remaining current-version and
  default expectations. Corrected477GREEN/20files24.18s retains every existing
  ownership/occupied reversal/rotation/geometry assertion.
- Both strict application/tools typechecks exit0. Initial branded-coordinate
  and encoded-fixture type mistakes were fixed in the consumer, not production.
  Current-version assertions move8→9; explicitly historical fixtures remove
  only the two new fields before validating their frozen format. The original
  direct migration data-preservation assertions remain.

No browser/server/build/fullverify run was performed. The single public browser
metadata expectation now pins9 but has no new native acceptance claim. The
weakest remaining claim is historical continuity: old saves cannot recover data
they did not record, and the measured coincident-counter boundary remains.
