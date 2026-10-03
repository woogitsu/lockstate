# A square wall run occupies a completed template door

2026-10-03 VERIFIED source/kernel measurement, baseline37ecfe2acda762871a64724b575911ba66687ffd. [Issue2011](https://github.com/woogitsu/lockstate/issues/2011). Browser-free diagnosis; production unchanged at this checkpoint. No native acceptance or producer-negative claim yet.

## Actual commands and independent expectation

Real seed73 runtime completes purchased Storage2,2 and DeliveryBay20,2, then a purchased Cell10,10. Authored Cell is4x7 with south door localx1, mirroredx2, then clockwise rotation. Independent q1 door10,11 (mirror10,12), q3 door16,12 (mirror16,11). Actual public square run is not a PlaceBuildRun wire command: main submits one PlaceBuildOrder per square and a shared transactionId. The existing handler deliberately registers accepted segments only. Partial acceptance is the accepted rule, not this defect.

The [wide actual eight-case measurement](./wide-results.json) checks q1/q3×mirror×pending/completed, genuine worker construction and V8. Rotated bed footprint collisions and outside approaches are correctly refused. Its accepted interior walls confound its route failure; the focused sequence below removes that confounder. Pending wide-run treasury delta1585 includes1425 previously unfunded shell materials plus160 of accepted run segments; it is not called a hidden charge or pricing bug.

The [focused executed probe](./executed-focused-probe.ts.txt) funds the initial shell with actual ticks before capturing run treasury. A three-square horizontal run contains only the perimeter door square, its outside approach and the next exterior tile: q1x8..10 or q3x16..18 at doorY. Maximum requested quote is3×2bricks×40=240. Pending allows only the outer tile:80. Completed allows the door and outer tile:160. The outside approach remains correctly refused. No interior/room-anchor wall was purchased. Each completed pose loses its real prisoner-context route from16,16 to the retained Cell anchor; Undo restores the route, and encodedV8 followed by Redo reseals the door. Exact rotated physical object owners are retained in [actual state](./focused-results.json).

Typed tests/integration/room-template-door-square-run.test.ts yields [8RED/4legal](./baseline.txt),4.40s actual test execution: q1/q3×mirror live/V8 door-square acceptance fails; pending and adjacent controls retain exact material allocation, accepted-only history, owner identity and real Undo/V8/Redo navigation. Completed order materials are consumed, so immediate Undo does not refund them; this follows existing completed-work reversal.

## Existing contracts and fresh deduplication

VERIFIED source opened: main public per-square producer; construction handler accepted-segment registration; coordinator completed outside-approach ownership; authored door geometry adapter; square-wall navigation barrier unit evidence. ADR0104's owner optionA explicitly keeps refused placements out of history. Existing square walls block all four sides and exclude their tile from navigation, independent of a legacy edge door.

[Fresh successful query](./fresh-dedup.json), complete [#1696](./issue-1696.json) and [#1710](./issue-1710.json) bodies were read. Those bodies target outside approaches; this distinct case occupies the middle perimeter door square. The proposed correction is existing exact completed-template entrance ownership with existing unbuildable refusal before funding/history, leaving adjacent ordinary construction and separate legacy-edge policy unchanged. Production scope awaits the parent's lease; no schema, player copy, tariff, room target or provenance field changes are proposed.

## Honest preparation limits

[Initial typed fixture error](./initial-fixture-error.txt) was12schema failures because extra local test labels were spread into PlaceRoomTemplate. Only explicit existing mirrorX/quarterTurns fields were retained before the genuine8RED/4legal baseline. It is not production failure evidence. Actual executed scripts are archived as inert text; no executable scratch is in the repository.

Weakest claim: this browser-free packed kernel sequence does not prove native drag hit geometry or affordability display. Actual source maps the same square intents to these commands, but no browser was run. No producer mutation was performed while production is awaiting lease.

## Bounded ownership and ordinary construction boundary

Additional [9RED/5legal baseline](./expanded-baseline.txt),2.24s execution, adds one accepted legacy-compatible save without optional completed-gesture metadata: the existing retained completed door order still proves template membership, yet its square is admitted. One ordinary standalone door followed by a square wall remains deliberately legal, and separate genuine public gesture IDs keep its Undo from reversing the earlier door purchase. The first control omitted gesture IDs and therefore undid both purchases under existing grouping: [that fixture error](./initial-ordinary-gesture-fixture-error.txt) is retained, not called a new production defect. Application strict TypeScript exits0. Production remains unchanged.
