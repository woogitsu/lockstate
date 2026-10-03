# Combined Cell, Utility and World-camera acceptance

Current conclusion2026-10-03: six model cases and both World-camera cases are
accepted on the same unchanged production build, in the initial model run and
a separate corrected two-case World run. The initial eight-case failure and
the first incompatible test observer remain recorded below. This is not a
claim that the original eight-case run or the full hosted suite passed.

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

## World reference discrepancy and observed correction

Both100% and200% cases reach the zoomed whole-plan SVG and clear worker
preflight, then fail the original precision3 corner comparison:
actual380 against expected380.00128000000007, difference0.001280000000065229px.
The reference reads the separate minimap CSS percentage channel. Native CSSOM
serialization can round that channel before the test reconstructs ground
coordinates. The original failure does not establish a placement error.
The raw existing percentage assignment must be observed before serialization
and compared with CSS readback to establish the cause. Neither the SVG itself
nor the production forward callback may become its expected-value reference.

Native inspection established CSSStyleDeclaration uses own data/exotic named
properties, rather than prototype accessors. The first observer assumed the
latter and caused two test-setup failures before the reference comparison;
that receipt is retained in the adjustable-camera native-reference record.
The corrected test-only observer reads the actual HUD viewport assignment
before forwarding its unchanged string to the real native style object.
An independent offline reader mutation fails five cases with eight controls;
exact byte restoration passes all thirteen. No production source changed.

Fresh actual native run: **2/2 GREEN**,11314.786ms total,4265ms and3941ms,
same worker/build, canonical artifact config and original budgets. Both scales
observe raw top28.90625% against CSS readback28.9062%, reproducing the original
0.00128px reference error. Raw independent ground bounds yield all four exact
corners `(880,380),(1200,380),(1200,940),(880,940)`, equal to the real SVG.
Physical pointer `(900,380)` lies on the chosen first ground square; no early
map command exists, and the actual click submits exactly one Cell plan at15,14
then hides the ghost. Precision3 and every original placement assertion remain.
See `world-corrected.json`, `world-corrected.txt` and both FullHD PNGs.

`src`, `public` and `tooling` are byte-identical to the frozen build source;
later commits contain only test/reference/evidence changes. The raw channel
observation confirms the rounding cause for these two native cases.

## Limits

Six focused production-artifact cases establish this model integration and
local persistence path. They do not establish the full hosted CI suite, merge,
deployment, every camera pose, furniture collision policy, or production release.
The weakest current claim is breadth across other navigation sequences and
camera poses; these focused cases do not measure every one of them.
