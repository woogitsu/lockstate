# Combined Cell, Utility and World-camera acceptance

Observed2026-10-03. Frozen integrated source
`282f6413443d784e588ff4c5ec43095796e0244a`, production build labelled
`282f641` in the four opened loaded FullHD screenshots. No source mutation or
build took place during this run. Canonical artifact config, one browser worker,
60-second per-case budget, 10-second expectations, zero retries, port5420.

Worker `worker-B7T14uJs.js`,437955bytes, SHA256
`ffcf9793209ef30ed628f72969a9ba37aad16deee1eeabf454453a306948368b`.
This identifies the actual built subject, rather than a later documentation SHA.

## Actual combined result

The initial eight-case run finished in244037.579ms: **six model cases GREEN,
two World-camera cases RED**, no skipped or retried case. Full unedited JSON and
terminal receipt are `initial-combined.json` and `initial-combined.txt`.
The two failures are retained rather than describing the whole run as accepted.

Actual player purchases Storage and Delivery capacity first, then builds the
Cell or Utility plan through ordinary commands and waits for worker completion.
Normal and rotated plans use different actual fixture anchors. Save/Load retains
the matching completed construction order, sourceOrderId, anchor and orientation:

| Fixture | Rotation | Anchor | Pixels before / after Load | Actual owner |
| --- | --- | --- | --- | --- |
| Cell toilet | 0 |22,9|227,122 /227,122|room-template-000000000002-2-object-001|
| Cell toilet | 1 |22,7|201,95 /201,95|room-template-000000000002-2-object-001|
| Utility panel | 0 |22,6|945 /945|room-template-000000000002-2-object-000|
| Utility panel | 1 |22,7|945 /945|room-template-000000000002-2-object-000|

Each of `cell-q0`, `cell-q1`, `utility-q0`, `utility-q1` preserves the actual
before/after worker snapshots, ownership receipt, and construction/loaded PNGs.
Source and copied artifact SHA256 equality was checked. Each owner resolves to
one completed order with the fixture's actual location and orientation; the
complete owner/order observation compares equal after Load. These are V8
integrated observations. The earlier independent art consumer negatives and
exact restoration remain in the dedicated Cell/Utility records; this run did
not repeat those mutations or claim that each physical detail is pixel-tested.

## World reference discrepancy under investigation

Both100% and200% cases reach the zoomed whole-plan SVG and clear worker
preflight, then fail the original precision3 corner comparison:
actual380 against expected380.00128000000007, difference0.001280000000065229px.
The reference reads the separate minimap CSS percentage channel. Native CSSOM
serialization can round that channel before the test reconstructs ground
coordinates. The original failure does not establish a placement error.
The raw existing percentage assignment must be observed before serialization
and compared with CSS readback to establish the cause. Neither the SVG itself
nor the production forward callback may become its expected-value reference.

The original precision, budgets, physical pointer and exact-command assertions
remain required. Corrected World native acceptance is outstanding here.

## Limits

Six focused production-artifact cases establish this model integration and
local persistence path. They do not establish the full hosted CI suite, merge,
deployment, every camera pose, furniture collision policy, or production release.
The weakest current claim is the cause of the two reference discrepancies;
the unrounded native channel observation can confirm or falsify it.
