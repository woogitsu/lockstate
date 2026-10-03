# A completed Storage anchor wall strands a paid carry

2026-10-03 browser-free actual source/kernel diagnosis, baseline `5fd3034e5b935a3cadf1e3a43e2f2c0e2f5e9735`, inherited production `986acd75bcf8bae7c761840ec28f5c15555bd40b`. [Issue2009](https://github.com/woogitsu/lockstate/issues/2009). Production unchanged; source lease/policy review pending. No producer-negative/native acceptance claim.

## Exact player/domain sequence

Seed73. Three actual PlaceRoomTemplate purchases complete Storage5,5, Delivery12,5 and Cell20,5 through real resource delivery/construction. RemoveObject6,6 removes the standing anchor rack; source order is `room-template-000000000000-2-object-000`, while the other rack retains item-storage. Actual square wall6,6 completes through PlaceBuildOrder. Public Guard hire and staged prisoner admission at16,16 establish a living carrier. Existing regime blocks allow work. Repeat live and after actual encoded V8.

PurchaseMaterials buys3wood-planks; exact immediate treasury20135→19940 is195 charged. After6000ticks:

| Wall | Save boundary | Independent real anchor route | Actual carry | Construction stock / bay stock |
| --- | --- | --- | --- | --- |
|6,6|live|invalid-destination|failed dropoff, invalid-destination|0 /3|
|6,6|encoded V8|invalid-destination|failed dropoff, invalid-destination|0 /3|
|6,7 adjacent|live|success through genuine door|completed|3 /0|
|6,7 adjacent|encoded V8|success through genuine door|completed|3 /0|

The capability/room identity still exist; the actual fixed destination anchor is impassable. Read [full measured state](./measured-results.json), [terminal output](./measurement.txt), [actual executed inert source](./executed-probe.ts.txt) and [actual runner](./run-probe.cjs.txt). No direct world/stock/actor/needs modifications, fake route verdicts, synthetic render feed or browser is involved. The source probe stores real job/container/order identities and exact immediate purchase charge; later treasury changes include normal recurring income and are not called purchase refunds.

Typed `tests/integration/template-storage-anchor-delivery.test.ts` is2RED/2legal in3.13s ([raw baseline](./baseline.txt)): only the blocked-anchor live/V8 stock assertion fails. The ordinary adjacent control retains genuine physical transport and stock delivery, not a replacement injected route.

## Scope and accepted-contract boundary

Fresh successful REST storeroom+anchor and delivery+invalid-destination searches found no matching Issue. Full#811 and actual ADR0093 decision2 were read. #2008 now filters invalid generic room action anchors in ActionSystem; the separate DeliveryBayCarryRoute still selects the first capability-bearing source/destination. #1750 is the already-corrected no-living-carrier bootstrap and is not this case.

Current ADR0093 explicitly fixes source/destination at room anchors and provides graceful direct deposit when an endpoint is missing; current production also excludes unfurnished endpoints/no living carrier. Proposed narrow correction is existing navigation graph destination eligibility at endpoint selection, exact room identity retained and later valid endpoint preferred, then existing fallback if none remains. No arbitrary interior target, per-seat location, full path scan, persistence field, tariff or player wording. This candidate awaits parent scope/policy review before production edits.

## Initial fixture errors, retained

The [first source probe](./initial-probe.ts.txt) guessed a runtime property `constructionMaterials` which is not exported; [actual error](./initial-measurement.txt) was corrected only to the actual container registry reader. The [first typed fixture](./initial-owner-fixture.test.ts.txt) guessed historical suffix0; actual deferred fixture purchase has suffix2, producing [four fixture failures](./initial-owner-fixture.txt). Both are honestly fixture errors, not production RED. The final2RED/2controls occur after these concrete corrections.

Raw text is byte-preserved; byte-manifest labels working files, not reconstructed source or Git blob EOL semantics. No active executable scratch lives in the repository.