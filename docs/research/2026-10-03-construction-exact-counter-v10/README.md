# Exact construction counters V10

## Owner decision, 2026-10-03

The owner selected the clickable option for [Issue #2025](https://github.com/woogitsu/lockstate/issues/2025):

> Tak — V10, dokładne liczniki i migracja (zalecane)

This is the option label the owner selected, reported directly by the coordinator,
not an implementing agent's approval. The question covered exact counters as
text, preserving V1–V9 and the corresponding cancellation requests. The accepted
scope is canonical nonnegative decimal strings (no leading zero), exact +1
without saturation/wrapping, lossless historical migration of construction
markers/revisions and queued expectedRevision tokens. History, source ownership,
in-flight data, refunds and existing stale refusal/copy remain unchanged.

The original [V9 active limit diagnosis](../2026-10-03-v9-active-revision-limit/README.md)
is retained from immutable `ff504a35a9cabe375dc2014dae2a144bc6887776`, including
actual two RED/two legal controls and separate original protocol/treasury fixture
errors. Those are original V9 measurements, not V10 results.

Implementation subject starts at published
`c28d4815844af9081c4d16925bbf498eb3df2ff1`. This independent branch has no browser,
server, build or native claim.

## Implemented contract

Source checkpoints are `0b59108fe58bc351d53ca9054f601b7cf7bf1992`,
`5fd15db526e2e394e2a1f45f844f70f84eefee5e`, and
`d38f5ec3670467ad274c2c4fb54abe349a1d3d93` on
`codex/construction-exact-counter-v10-20261003`.

`orderRevisions` and cancellation `expectedRevision` are canonical decimal
strings. State transitions use exact integer addition and serialize back to
text; no numeric coercion, saturation, wrap or narrower decoder bound is used.
Current raw restore validates each entry before mutation. Missing tokens read
as `0`. Existing marker/history/refund/ownership rules are unchanged.

V1–V9 save validators remain frozen. V9→V10 clones validated raw data and
converts explicit numeric revisions losslessly, including own prototype-like
keys. It upgrades recognized historical V1 cancellation wrappers and their
numeric tokens to V2/text while preserving every other queue field. Other
commands and all unrelated data remain unchanged. Earlier absence still
defaults to false/{}; this does not infer missing historical protection.

ADR0003 Decision5 versions changed domain shapes independently. Live
CancelBuildOrder requires command V2; live V1 cancellation is rejected even
if its token is text. Unchanged V1 commands remain accepted. The protocol
envelope stays1, session snapshot is4 and only build-queue projection is2;
other HUD projections stay1. Historical cancellation upgrading occurs through
save migration rather than the live worker decoder.

## Actual bounded verification

- 345 GREEN in16 named source/session/migration/queue/history/refund files,
  5.91s; exact file list and raw output are retained in evidence.
- Standard application and tools TypeScript checks exit0.
- Real wall purchase, checksum-valid V9 import and packed command: active MAX
  cancellation yields `9007199254740992`, refund80 and funds25000. Genuine
  completion at tick171 yields `9007199254740994` and funds24920. Both survive
  whole current snapshot Save/Load equality.
- Real queued historical MAX cancellation migrates and dispatches once;
  distinct stale tokens refuse without world/construction/treasury mutation.
  Unused and untouched terminal MAX records remain legal.
- Rich real90° completed Cell, mirrored pending Cell and mirrored270° undone
  Cell retain exact owners/history/inflight data, actual newer-action marker,
  queued Cancel/Undo fields and own `__proto__`/`constructor` ledger keys.
  V1–V8 full-data preservation and frozen V9 numeric validation are exercised.

Four actual production controls ran detached at exact `d38f5ec`, with finally
byte-exact restoration and production diff0:

| Changed producer | Actual negative | Exact restored |
| --- | --- | --- |
| Exact increment replaced by Number addition | 2 RED /24 GREEN | 26 GREEN |
| Actual transition revision write omitted | 3 RED /3 GREEN | 6 GREEN |
| Historical queued token conversion omitted | 2 RED /9 GREEN | 11 GREEN |
| Live V1 cancellation guard omitted | 1 RED /19 GREEN | 20 GREEN |

The initial rich fixture omitted mandatory PurchaseMaterials.orderId and
produced1 RED/54 GREEN; corrected55 GREEN. Initial application type errors
included an edit typo and JSON narrowing, fixed before final checks. Their raw
outputs remain separate from product faults and final receipts.

The original docs gate produced2 RED/33 GREEN. A read-only comparison against
exact c28 source blobs identified18 newly lost quoted anchors and a separate
inherited ADR0031 failure (before1/after1,budget0). Only measured V10 live
coordinates/values and the positive live declaration control were updated;
historical coordinates remain explicit, budgets/tolerance unchanged. Final
gate is1 inherited RED/34 GREEN; root owns that ADR0031 correction separately.

## Limits

No browser, server, build, native latency or full-suite claim is made here.
Root's frozen V9 native model photographs are unchanged. This source checkpoint
requires coordinated integration of current domain versions and separately
updated native fixture expectations; historical data is not reinterpreted as
newly recorded ownership or protection.

Raw executed producer script is inert `.cjs.txt`; SHA manifest and source
restoration receipts identify the actual bytes. Citation-probe setup errors
(the installed TypeScript7 package has no legacy transpileModule entry) are
recorded as environment/tooling errors, followed by the successful Node
type-stripping read-only probe, without repository/source mutation.

## Complete-suite current consumer follow-up

One original complete suite ran at published `7b20accb8d03d38281b8026b2cca5b7d74f31b89`:
248 RED /8362 GREEN /8 existing skips,115.61s. Existing cached CI-required
Blender/angled LFS objects were hydrated before execution (9772 objects,247MB).
The complete raw outcome is retained without dropping failed groups.

Measured current consumers in30 files retained old current-save9 pins, explicit
numeric failed-order revision1, and one current snapshot3 wrapper. They now
require current-save10, exact text revision `1`, and the actual current snapshot
domain constant. Full world/history/treasury/owner/route/refusal comparisons,
historical envelope contents, frozen migration targets and all budgets remain
unchanged. Actual historical V1–V7 data cases still decode/migrate their original
formats; only their current output pin and descriptive title changed.

The original run also had19 deploy-secret and one worker-telemetry failures:
default Windows `bash` selected WSL with no installed distro. Using the tests'
existing `LOCKSTATE_BASH` port with installed Git Bash fixes execution without
changing tests or production. One citation failure came from this checkout's
main-only origin fetch specification; three exact already-published branch refs
were fetched, rather than weakening the published-commit guard. The separate
ADR0031 citation remains inherited and root-owned.

Affected30 files plus the three actual environment/citation consumers passed
497 tests/33 files,16.65s; standard application/tools types exit0. Production,
protocol, schema, UI, native fixtures, workflows and test configuration have no
changes in this follow-up. Final complete result is recorded after its bounded
verification, without a browser/server/build/native claim.
