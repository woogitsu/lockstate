# An invalid first Shower hides a working second Shower

2026-10-03 VERIFIED actual source/kernel measurement, baseline590a85501d05f0aafe5571915f18cc07bd4d9dd4. [Issue2013](https://github.com/woogitsu/lockstate/issues/2013). Browser-free diagnosis with production unchanged at this checkpoint. No producer-negative or native acceptance claim yet.

## Genuine purchases, independent poses and actual use

Real seed73 purchases complete Storage2,2, DeliveryBay20,2, two clockwise q1 Shower templates20,14 and5,14, and q1 Cell5,24. Literal5x5 Shower heads(1,1)/(3,1) rotate to(3,1)/(3,3), so exact head anchors23,15/23,17 and8,15/8,17 retain their actual template sourceOrderIds. First sorted room anchor21,15 and later6,15 both have hygiene capacity2.

A genuine ordinary square wall21,15 completes on the empty first anchor, leaving the later Shower intact and genuinely reachable through door5,16. Public Guard hire, staged prisoner admission and existing hygiene-only regime commands establish the real actor and selection. A separate actual navigation query proves the later anchor from the admitted prisoner's current tile; the original source probe separately queried16,16. No injected stock, needs, actor, world, route result or synthetic render feed is used.

After9000ticks, [four full measured worker states](./measured-results.json):

| Actual wall | Boundary | Shower performing ticks | Scaled hygiene |
| --- | --- | --- | --- |
|21,15 blocked first anchor|live|0|50920→14920|
|21,15 blocked first anchor|encoded V8|0|50920→14920|
|22,15 legal adjacent tile|live|1428|50920→50600|
|22,15 legal adjacent tile|encoded V8|1428|50920→50600|

[Actual executed probe](./executed-probe.ts.txt) and [runner](./run-probe.cjs.txt) are inert archives; [terminal measurement](./measurement.txt) also retains metrics and exact selected room IDs. Typed tests/integration/later-usable-shower-selection.test.ts yields [2RED/2legal](./baseline.txt),1.22s test execution, preserving physical owners, exact rotated positions, genuine door path, actor identity and meaningful hygiene/use outcomes.

## Cause, existing contracts and fresh dedup

VERIFIED opened RoomInstanceRegistry.findAvailableForUse retains deterministic instanceId order and existing concurrent-use capacity/occupancy. ActionSystem's existing #2008 regular-room guard rejects an invalid anchor only after selecting the first room, suppressing the whole preferred action instead of choosing the second eligible instance. That original single-room fallback fix remains correct but does not cover this two-room selection boundary.

[Fresh successful query](./fresh-dedup.json) and complete [#2008](./issue-2008.json)/[#532](./issue-532.json) bodies were read. #2008 is the single-invalid-target/fallback case; #532 is deliberate category/ranking content balance. Neither records a legal later instance hidden by a non-navigable earlier one. No duplicate exact case was found.

After reading both sources, the parent approved only an optional ephemeral eligibility predicate in existing findAvailableForUse, defaulttrue for current clients, passed only by regular room action selection using existing graph tileToRegion membership. Keep sorted priority, capacity/Infinity/occupancy and the no-eligible existing fallback. Own-accommodation, claims, fixed room anchors, persistence, tariffs, player wording and global path policy remain unchanged. No interior/per-seat coordinate or new state.

## Preparation limitation

The first typed fixture contained a meaningless check of a nonexistent PrisonerOperationsRuntime.placedObjects property; [strict typecheck error](./initial-typecheck.txt) and [original executed fixture](./initial-test.ts.txt) are retained. Removing that stray property check and using the actor's actual route origin before the genuine2RED/2legal baseline preserves every real physical-registry assertion. [Corrected application TypeScript](./diagnosis-typecheck.txt) exits0.

The previous object-on-door hypothesis was falsified by reading current navigation: objects do not themselves obstruct this navigation graph, and ordinary PlaceObject also requires room containment. No unmeasured object-route defect or Issue was manufactured from that hypothesis.

Weakest claim: this measured q1 actor lifecycle is not native acceptance, a new global-connectivity rule, proof about every room class or a mutation-tested correction. Those have not been run or changed at this checkpoint.

## Granted correction checkpoint

The approved optional callback now filters candidate instances within the existing sorted registry walk; defaulttrue keeps current capacity-only clients unchanged. Only regular ActionSystem room selection supplies the same current graph tile membership that previously rejected a room after selection. Existing capacity/use/Infinity branches and own-accommodation remain unchanged, and no eligible instance still follows the existing next-action fallback.

[Focused production](./fixed.txt) is8GREEN/2files: new4two-Shower cases and existing4single-blocked-Canteen/all-invalid fallback controls. [Real fixed actor measurement](./fixed-measurement.txt) and [full state](./fixed-measured-results.json) retain the executed public purchases/intake/regime and exact room targets. Both blocked-first live/V8 actors actually shower in room.shower-room:6:15; legal adjacent actors retain the first room. Application strict TypeScript exits0. Producer omission/exact restoration and bounded neighboring checks follow separately.
