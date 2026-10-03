# Construction history V9 — approved continuity fields

## Decision and scope

On 2026-10-03 the coordinator relayed the owner's direct approval of the
package in commit `79a18be1cb`,
[the published V9 review proposal](https://github.com/woogitsu/lockstate/blob/79a18be1cb97f581adc563767e3c5da6a5a55d32/docs/research/2026-10-03-queued-template-cancellation-load/v9-review-proposal.md):
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

## Direct restore review follow-up

The coordinator identified another real input boundary: worker initialize calls
`restoreSimulationRuntime(sessionSnapshotBundleFromTransport(snapshot.data))`,
and that transport adapter only casts; `InProcessSessionHost.startFromSnapshot`
also directly restores. They do not run the save-envelope parser. A genuine
packed square purchase provided the immutable healthy bundle, then targeted
malformed ledger entries were passed through the actual restore methods and
worker initialize. Original12RED3legal proved negative/fractional/unsafe/NaN/
Infinity/nonnumber/empty-ID entries and nonplain prototypes were admitted.
The in-process host incorrectly replaced its existing session, and the worker
became ready for a negative counter.

The narrow added guard validates these entries before orders/history change,
using existing `SnapshotRefusedError('damaged-payload', ...)`; plain and null
prototypes with own `__proto__`/zero/maxsafe keys match the codec behavior.
The source guard rejects malformed input without new player copy or cancellation
policy. Fixed15GREEN; combinedV9 domain/codec proof71GREEN/4files. This supplements
the earlier477GREEN/20files; it is not a claim those20 were rerun after this guard.

The first documentation gate1RED19GREEN found exactly four formerly verified
citations drifting; `raw/shifted-anchors.json` records the before/current scanner
comparison. Exact current quotations were corrected in ADR0028/0047/0062, keeping
the old coordinates explicitly historical. The restored gate20GREEN/3files
keeps all pinned budgets and tolerances unchanged.

Two additional real System guard omissions at
`2a27081053de07384b515db6957bfb4e7317cb1e` independently remove entry validation
(10RED5legalGREEN) and prototype validation (2RED13legalGREEN). The finally
restoration returns15GREEN, production diff0, with exact before/after source
SHA256 `9ceda8f098de34b0ba6493f2c453719fca5f5dcf185352dc53100d7b3b1d443c`.
The raw logs, executed inert script and receipt are under `raw/raw-validation-*`
and `raw/negative-raw-*`; the earlier four capture/restore loops were not rerun.

Final bounded consumers are30GREEN/4files2.64s: individual object rotation,
individual object preflight publication, room-template session preflight and
restore refusal reasons. Both strict application/tools typechecks exit0 at the
same checkpoint. The final documentation gate is20GREEN/3files568ms. These
terminal logs supplement the explicitly earlier477-test run without claiming a
second full verification, browser, server, build or native execution.

## Root integration gate: retained initial failures

The combined Staff-chair/template-door/V9 subject is
`2102c1700f79f5f5191edfcb3e64bdc571b3e697`. Both strict typechecks exited0;
the complete 717-file run exited1 with182 failures,8361 passes and2 existing
skips. The chained production build was not reached. Original captured
[test output](./raw/root-integration/original-complete-suite.txt),
[typecheck output](./raw/root-integration/original-complete-types.txt) and
[capture hashes](./raw/root-integration/original-complete-receipt.json)
are retained. UTF16LE console captures are explicitly converted to UTF8;
the receipt keeps both original and archived hashes.

The initial gate exposed three distinct integration boundaries. Published
commit citations were invisible to this checkout's main-only remote fetch
specification; fetching the actual published owning branches repairs the
local history view without changing the citation guard. The approval proposal
exists on its published diagnostic branch, so the reference above now links
to that immutable GitHub document instead of claiming it is a local file.
Staff template expectations still named the former ordinary wooden chairs;
the independently authored expected asset IDs now name both real padded-chair
consumers while preserving the employee Desk and every other room's mapping.

The remaining failed whole-state comparisons require a separate consumer
review: V9 now exposes the existing failed-order revision counters and retains
the existing newer-action marker. Those fields must be asserted explicitly,
not discarded from protected-state comparisons or reset to recover the old
Load defect. In particular, occupied Undo fixtures that relied on lost current
save data must separately prove current V9 refusal and genuine frozen V8
compatibility. This paragraph records the failing integration gate, not a
claim of complete test, build or native acceptance.

The independently checked correction scopes are now published: the nine
failed-purchase/footprint files require each exact new failed order's revision1
and all earlier entries unchanged (132RED/114GREEN becomes246GREEN); the four
occupied/command-marker files retain current V9 protection before executing
genuine checksum-valid historical V8 occupancy controls (40RED/91GREEN becomes
131GREEN). Production is unchanged by either correction. Root's Staff/context
and documentation scope is201GREEN/3files. These are bounded outcomes, not a
replacement for the next complete run on the combined product. The separate
Laundry public consumer now explicitly captures/restores V9 while its original
V8 receipts remain historical evidence.
