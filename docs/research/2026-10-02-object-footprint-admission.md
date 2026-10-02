# Generic object footprint bounds and ownership admission

Recorded 2026-10-02 on source checkpoint `ca785768fd663dcedc4e4b525956e6009071e04f`, after the separate physical collision fix.
First diagnostic: `200b1d903b`.
Scoped source and regression: `81dc3159f4`.
Related existing rule: [Issue215](https://github.com/woogitsu/lockstate/issues/215).

## Actual packed-command baseline

Create a genuine session and packed ZoneRoom Yard24,24 of8x8. Encode Save/Load, then packed PlaceBuildOrder desk-wooden at31,31. Its anchor lies in the owned initial chunk; the second square32,31 is unowned. Both an unloaded far chunk and an explicitly loaded unowned far chunk approve. The equivalent PlaceObject correctly refuses. An independent Utility plan at31,10 is refused by authoritative preflight for its physical footprint extending beyond the same owned frontier.

Initial counted diagnostic:2 failures /6 legal controls in2.69 seconds. Expanded Desk2x1 and Bed1x2 baseline:4 failures /8 legal controls in2.68 seconds. Two initial fixture attempts used nonexistent registry accessors; these were corrected before counted baseline results. No game finding is drawn from those setup errors.

A separate genuine crew continuation in both Desk worlds measured completed progress60,2 allocated wood planks, assignedWorkerId mock-worker-1 and treasury debit130. The registry physically indexed the unowned far square. In the unloaded case, that chunk remained absent even though the registry indexed its square; in the loaded unowned case it remained unowned. This is a physical object footprint, distinct from Issue1740's outside doorway approach: its ownership-only obstruction premise was previously falsified and no new approach policy is introduced here.

Fresh object/unowned and object/out-of-bounds Issue searches were reviewed; Issue215's original accepted target-land admission rule is reused rather than duplicated or reopened. Source SUBMISSION_REQUIREMENT and PLACEMENT_REQUIREMENT both explicitly check ownership while deferring terrain enforcement. The rock and water controls therefore demonstrate permitted behavior, not defects: both command routes genuinely complete a Desk on an owned far rock/water tile after encoded Load.

## Scoped correction

ConstructionSystem alone extends the existing admits read over every physical tile of an object-producing order using objectFootprintTiles and the order's orientation. It refuses with the existing out-of-bounds or unowned-land reason before approval. The existing full physical object collision guard and duplicate ordering are retained. Edges still use the existing either-side admission rule; there is no terrain, room-membership, tariff, save-schema or refusal-copy change.

The final14 actual-command cases cover horizontal and vertical far tiles in loaded-unowned and unloaded chunks, matching PlaceObject controls, four owned rock/water actual completions and two owned far-chunk actual completions. A setup-only world load/setOwned establishes the legal owned-chunk controls; it is not presented as a new land-purchase command. Refusal snapshots compare funds, world, Undo/current-transaction history; generic refused orders retain their existing failed-order record. The kernel consumes the actual command sequence while paused.

## Mutation and restoration

- Targeted fixed14 cases green in2.94 seconds.
- Disconnecting only the new footprint admits read:4 failures /34 passing controls across this14-case regression and all24 physical collision cases,3.42 seconds.
- Byte-exact source restore SHA256: ba774565e4fd008f84056abedb4394cd680f40dac41fd9ae5bec1eb5bf8e7b48.
- Exact restored neighboring group:338 tests /8 files green in27.25 seconds: generic-object-footprint-admission, build-order-object-collision-boundary, construction, construction-ownership, construction-geometry, object-placement-loop, room-template-session and room-template-rotated-history.
- App and tools TypeScript and production build passed. This is local simulation/build evidence, not browser or hosted CI acceptance.

New source lines shifted the live WORLD and ADR index quotations beyond their existing budgets. Narrow source coordinate corrections retain historical spans; the associated ADR0047 cancellation references were opened and corrected to the same source checkpoint. Budgets and guards are unchanged. Final source-anchor, quotation, commit-citation and research-index verification passed28 tests across4 files in43.05 seconds.

## Limits and weakest claim

The command schema supplies default orientation0 for ordinary object commands, so these actual boundary examples cover both catalog footprint shapes with Desk and Bed. Existing rotated template/history and24 collision regressions exercise oriented construction orders through their authoritative producers. This does not claim all possible later world changes after approval are validated again at completion. A legal-command counterexample after approval would justify a separate lifecycle audit. No source-order ownership field from pending Issue1975 was introduced.
