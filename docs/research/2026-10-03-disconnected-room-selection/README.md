# A disconnected first Shower hides a reachable second Shower

2026-10-03 VERIFIED on exact abcb2276f02acc685eca9ecd00899c3390031fb7. [Issue2014](https://github.com/woogitsu/lockstate/issues/2014). Own isolated worktree; production unchanged, browser-free diagnosis. No producer-negative/fixed/native claim yet.

## Genuine lifecycle and independent coordinates

Packed public commands buy and genuinely complete Storage2,2, DeliveryBay20,2, clockwise q1 Shower20,14 and5,14, and q1 Cell5,24 using actual procurement/delivery. The sorted Shower anchors are21,15 then6,15, each hygiene capacity2; exact independently derived shower-head positions and V8 sourceOrderId owners stay intact. Public square-wall commands build an outer9×9 perimeter x18..26,y12..20 around the first room, one tile away from its exterior doorway approach. All32 square orders genuinely complete. The legal control leaves only18,16 open, completing31 walls. A normal wall uses2bricks/80minor units, so ring list costs2560 vs2480; no altered tariff or synthetic stock.

Actual public guard hire and staged prisoner admission at16,16, followed by existing hygiene-only regime edits, create actor0. Optional real encoded/checksummed V8 capture/decode/restore follows. Both anchors really remain in the current navGraph. Independent queued routes from the actor's actual tile16,16 show the first is unreachable while the later route succeeds through door5,16. The ring does not remove either Shower, fixture or owner.

[Four full worker before/after states](./measured-results.json), [executed probe](./executed-probe.ts.txt), [runner](./run-probe.cjs.txt), [measurement](./probe.log) and [typed baseline](./baseline.txt) preserve actual commands and outcomes, without injected needs/entities/world/route verdicts.

| World | Boundary | Genuine Shower ticks in9000 | Hygiene | Route failures |
| --- | --- | --- | --- | --- |
|32wall closed ring|live|0|50920→14920|206|
|32wall closed ring|V8Load|0|50920→14920|206|
|31walls with18,16 gap|live|1428|50920→50600|0|
|31walls with18,16 gap|V8Load|1428|50920→50600|0|

Typed tests/integration/disconnected-first-shower-selection.test.ts is2RED/2legal, failing real zero Shower use, not fixture setup. Original independently queued first failure costs4expanded regions; the later success costs143expansions in the closed world. The initial terminal NavigationSystem totals210requests/294expanded nodes closed and71/625 legal are cumulative lifecycle totals including pre-observation work and diagnostic queries, not9000tick deltas. [Bounded repeat with explicit pre-window metrics](./bounded-measured-results.json) and [executed source](./bounded-executed-probe.ts.txt)/[log](./bounded-probe.log) measure the real9000tick delta:207requests/4expansions closed,68/318 legal. The actual ring debits2560/2480 and allocates64/62bricks respectively. The old cumulative wording is corrected here; original worker/probe bytes remain retained. Route cache makes failed requests cheap but cannot make the room usable. Neither comparison is a pure per-Shower CPU benchmark or evidence that closed worlds do more search work.

## Existing rules and fresh deduplication

ADR0041 decision1 walks the next legal action when a target cannot resolve. ADR0007 requires actual route work to go through the existing budgeted request queue, including permission-aware failure diagnosis. Current #2013 intentionally filters only destination tile membership; the anchor here passes it. ActionSystem consumes `unreachable`, returns to idle, and later selects the same first instance again, without trying the working second room.

Fresh successful [unreachable](./fresh-unreachable-search.json), [disconnected](./fresh-disconnected-search.json) and [sealed Shower](./fresh-sealed-search.json) queries were read with complete [#938](./issue-938.json), [#1006](./issue-1006.json), [#2008](./issue-2008.json) and [#2013](./issue-2013.json). #938/#1006 concern inaccessible-room requirements/readouts; #2008 invalid first-anchor/next-action fallback; #2013 a first anchor absent from the graph. None covers this actual same-action later-instance starvation despite both anchors being present. Issue2014 records this distinct kernel failure and bounded proposal.

## Concrete bounded query proposal, not production

[Exact proposed scope/algorithm/coverage](./implementation-proposal.md): lazily cache physical component labels keyed to the exact current navigation graph, once per graph generation; regular room selection compares actual actor/destination regions. The existing physical room-readout portal walk already treats a door as physically joining regions regardless of permissions. Actual routes/door access/failure diagnostics stay in the queue. No A*, new target/claim/persistent field, player wording, tariff, per-seat policy or global path policy is proposed.

Weakest claim: a physical component match does not promise door permission or a future unchanged route. This diagnosis is actual q1 gameplay live/V8, not every room/rotation/native acceptance. The ring demonstrates a player who sealed one room while another remains usable; there is no promise to repair or remove the ring automatically.