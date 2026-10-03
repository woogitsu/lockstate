# Common Room / #2013 / #2014 integration review — 2026-10-03

VERIFIED: isolated review starts at `5008b18920`, with the requested model
`5a515c4097 / 3572c0ad65 / 0e42ac34`, later-room
`e94b1e6ba / 885c53630 / abcb2276`, and physical-component
`3c820f7bb / d367aa24 / 57814321` changes reproduced in its own worktree.
The coordinator's integration worktree was not edited. Model changes touch the
dedicated Blender source, producer and exported frames; they do not alter room
geometry, object identity, room context consumer mapping or the V8 schema.
The only simulation changes are the registry eligibility callback, regular-room
target filtering and a derived physical component cache. Own accommodation
still resolves by its assigned id. Sorted candidate order, capability-specific
capacity/claims and permission-aware queued routing remain in their original
owners.

## Independent actual integration measurement

`integration.audit.ts` and its dedicated strict config are outside ordinary CI
test globs. The actual seed-73 command packer/kernel schedules Storage, Delivery,
clockwise Common Room, two clockwise Showers and clockwise Cell; construction
really completes before a separately paid 32-square wall ring isolates the first
Shower. The new Common Room retains two literal Bench anchors, q1 orientation
and construction source ids. No rooms, objects, orders, actor action, stock or
route verdict are injected.

After actual guard hire/prisoner admission and public hygiene regime commands,
the real V8 writer/JSON decoder creates two independent restored simulations.
Only one receives 200 pairs of physical queries. Those reads leave its whole
snapshot and queued navigation work unchanged. Both simulations then execute
9,000 actual ticks: 12 whole snapshots at 750-tick intervals are identical.
The prisoner actually showers only in the reachable later room, while all
physical object rows remain equal to the written V8 state. Exact measured
targets, shower ticks, hygiene, authored Bench rows and save version appear in
[`actual-receipts.jsonl`](./actual-receipts.jsonl).

The three separate cost subjects use real 16/64/256-cell door graphs. After
physical labels are warm, 100 queries read exactly 700/2,300/8,700 chunks on
7/23/87 loaded chunks respectively; they perform zero portal walks and change
no queue/results/expansion metrics. The prior #2013 `getGraph()` candidate gate
performs exactly the same number of freshness reads on each subject.

This qualifies the source comment's O(1) description: **label lookup** is O(1)
after a graph generation; the whole public query still calls `ensureGraph()`
and therefore scans loaded chunks. The integration does not introduce that
scan, so this measurement is not a demonstrated performance regression.
No synchronous route search was added. A timing/whole-prison frame claim would
need a separate budgeted workload measurement.

First strict/run observation exposed an error in the review itself: placed
objects are under optional `simulation.objects`, not a top-level bundle field.
The corrected audit explicitly checks the real object section and is strictly
typed. The untouched first failure and three initial cost receipts are retained
as [`actual-first-run.log`](./actual-first-run.log) and
[`initial-cost-receipts.jsonl`](./initial-cost-receipts.jsonl). These are observer
errors, not product findings. Final measured audit is 4/4 GREEN at 11:46:27.

## Confirmed unnecessary query cost for ordinary full rooms

The inherited O(loaded chunks) freshness cost becomes a new regression when
the new registry predicate runs before capacity/occupancy rejection.
`saturated-room-cost.audit.ts` actually builds two q1 Showers and uses the public
typed concurrent-use claim fixture to occupy both two-seat capabilities. The
previous availability-first gate finds no instance and reads zero chunks.
The new callback-first route also finds no instance, but performs two genuine
physical queries and two freshness chunk reads. Its independent zero-unnecessary-
queries assertion is RED, with actual counts in
[`actual-saturated-room-cost-red.log`](./actual-saturated-room-cost-red.log).
This is a public registry/API fixture, not four fabricated actor actions or
native browser evidence.

For R ordinary full candidates and C loaded chunks, the new scan can add R×C
freshness reads to a selection that returns no room. #2013 introduced the
predicate order; #2014 makes each predicate consult physical connectivity.
The review reported this to the coordinator before any fix. A narrow correction
would reject insufficient capability capacity/occupied candidates before asking
physical eligibility, preserving candidate order and the final eligibility
condition. No producer fix or Issue is made by this review. The separate
`vitest.saturation.config.ts` intentionally isolates this unresolved RED probe
from the four GREEN review controls and normal CI discovery.

## Own producer controls and final boundary

The reproducible `run-producer-controls.ps1` has run both real producer
negatives and restored complete source byte buffers after each. Replacing the
actor's current-position endpoint with the room's own endpoint in the actual
action consumer makes the integrated fixture RED (zero shower ticks), with all
three cost controls GREEN. Exact restoration makes all four GREEN. Disabling
physical-label reuse makes all three cost controls RED (4,000/13,600/52,000
portal accesses instead of zero), while the integration control stays GREEN;
exact restoration again makes all four GREEN at 11:51:30. Raw outputs and
matching original/restored SHA256 appear in
[`actual-producer-restoration.json`](./actual-producer-restoration.json),
[`action-current-position-negative.log`](./action-current-position-negative.log),
[`action-current-position-exact-restore.log`](./action-current-position-exact-restore.log),
[`physical-label-cache-negative.log`](./physical-label-cache-negative.log) and
[`physical-label-cache-exact-restore.log`](./physical-label-cache-exact-restore.log).
The original full-spy failure dump caused output/worker-termination noise;
its raw bytes are retained in `physical-label-cache-negative.log.original.gz`.
The final assertion reports the same zero-call requirement as a scalar count,
and restores spies after each case, without weakening the threshold or budget.

Strict app/tools/audit typechecks exit zero. Four bounded inherited neighbor
suites pass 11/11: later usable Shower, physical invalidation/permissions and
Common Room source/descriptor integrity. No final production diff is added
relative to the imported fixes. Selection and paired V8 correctness are GREEN
in the measured fixture; the ordinary-full-room cost finding above is unresolved.
All three relevant simulation files match the reviewed `57814321` producer
bytes in Git. Importing the later `ce7fa461b9` documentation checkpoint restores
its missing continuous index row; the final index contract is 5/5 GREEN.
The earlier index check's sole RED was that omitted imported collection link,
not this review's canonical row or a product regression.
The full catalogue audit is not rerun. Browser/server/native rendering are
owned by the coordinator; raster screenshots and earlier exporter negatives
cannot establish their integrated runtime correctness.

Reproduce with
`vitest run --config docs/research/2026-10-03-common-room-connectivity-review/vitest.audit.config.ts`.
Set `LOCKSTATE_CONNECTIVITY_REVIEW_RECEIPT` to a fresh file for receipts.
