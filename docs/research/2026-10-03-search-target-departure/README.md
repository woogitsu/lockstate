# Existing #1553: standing search outlives its real prisoner target

VERIFIED on `49ba1b09069a0c8cb3292a7ab8dab4bec90ef7bc`, 2026-10-03. Existing Issue https://github.com/woogitsu/lockstate/issues/1553 was freshly read; no duplicate Issue is created.

## Genuine gameplay reproduction

Packed PlaceRoomTemplate buys a mirrored 90-degree Cell at5,5 and all actual shell/fixture orders complete. Packed HireStaff hires three guards. Packed AdmitPrisoner uses a short positive sentence that classification records ending at1809. No injected world, job, prisoner or component data; no direct submitOrder is used by the six standing-sweep cases.

The real standing sector-search producer creates contraband.sector-sweep.security-sector.prison.3 at1800. At1801 its target is the full prisoner ID0, it is travelling, and its actual guard route request is retained. The optional future encodes/decodes the actual V8 save and resumes that same in-flight route.

Immediately before tick1820 the resident is still alive and that sweep is searching. The real discharge system removes the resident at1820 before SearchSystem updates. In the recycled cases a later actual admission uses the same index under a different full entity ID. The old full ID remains dead. Nevertheless the old sweep eventually counts completed1 and cancelled0. The correct existing #1553 boundary is cancelled1 and completed0; legal live-target controls complete1/cancel0.

baseline.txt: four genuine RED / two live-target controls GREEN, 2.73s. Construction/history and placed-object ownership remain unchanged. The regression also requires no retained guard claim or route result after the old job ends.

## Earlier fixture errors, not production failures

An initial case saved the first1800 sweep but expected no completion after a later2419 discharge; that sweep had already correctly completed. A2400 sweep was already searching and also finished before the2420 discharge. Their failed aggregate assertions are invalid reproductions and are not counted as the four genuine RED above. The final fixture pins travelling at1801 and searching/alive immediately before1820, establishing the actual overlap independently of the failure counter.

## Proposed source scope

SearchSystem currently checks neither queued nor active target existence. new-session resolves prisoner location with getIndex without liveness, so a freed/recycled slot can still name a position. Inject a pure existence reader with an unchanged default for standalone fixtures. The actual session checks full prisoner/staff identity and real room/container membership. Refuse absent targets before queued staffing and cancel active jobs through existing guard/route return and cancellation counters. No new persistence field, command, locale key, policy or tariff.

Weakest claim: six genuine cases cover the automatic prisoner sweep. Other scopes have only the existing domain search-order API, not a player-issued packed search command. Their positive/negative controls must be labelled as domain coverage, preserving the distinction.
