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

## Current verdict and boundary

No material selection, determinism or save regression is confirmed by the
source review and measured integrated fixture. No Issue is opened. These are
actual source observations, not yet guarded regression claims: own controlled
consumer-negative/exact-restoration evidence is pending at this checkpoint.
The full catalogue audit is not rerun. Browser/server/native rendering are
owned by the coordinator; raster screenshots and earlier exporter negatives
cannot establish their integrated runtime correctness.

Reproduce with `vitest run --config
docs/research/2026-10-03-common-room-connectivity-review/vitest.audit.config.ts`.
Set `LOCKSTATE_CONNECTIVITY_REVIEW_RECEIPT` to a fresh file for receipts.
