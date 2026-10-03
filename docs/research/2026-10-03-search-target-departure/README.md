# Existing #1553: standing search outlives its real prisoner target

VERIFIED on `49ba1b09069a0c8cb3292a7ab8dab4bec90ef7bc`, 2026-10-03. Existing Issue https://github.com/woogitsu/lockstate/issues/1553 was freshly read; no duplicate Issue is created.

## Genuine gameplay reproduction

Packed PlaceRoomTemplate buys a mirrored 90-degree Cell at5,5 and all actual shell/fixture orders complete. Packed HireStaff hires three guards. Packed AdmitPrisoner uses a short positive sentence that classification records ending at1809. No injected world, job, prisoner or component data; no direct submitOrder is used by the six standing-sweep cases.

The real standing sector-search producer creates contraband.sector-sweep.security-sector.prison.3 at1800. At1801 its target is the full prisoner ID0, it is travelling, and its actual guard route request is retained. The optional future encodes/decodes the actual V8 save and resumes that same in-flight route.

Immediately before tick1820 the resident is still alive and that sweep is searching. The real discharge system removes the resident at1820 before SearchSystem updates. In the recycled cases a later actual admission uses the same index under a different full entity ID. The old full ID remains dead. Nevertheless the old sweep eventually counts completed1 and cancelled0. The correct existing #1553 boundary is cancelled1 and completed0; legal live-target controls complete1/cancel0.

baseline.txt: four genuine RED / two live-target controls GREEN, 2.73s. Construction/history and placed-object ownership remain unchanged. The regression also requires no retained guard claim or route result after the old job ends.

## Earlier fixture errors, not production failures

An initial case saved the first1800 sweep but expected no completion after a later2419 discharge; that sweep had already correctly completed. A2400 sweep was already searching and also finished before the2420 discharge. Their failed aggregate assertions are invalid reproductions and are not counted as the four genuine RED above. The final fixture pins travelling at1801 and searching/alive immediately before1820, establishing the actual overlap independently of the failure counter.

## Implemented source scope

At the baseline SearchSystem checked neither queued nor active target existence. new-session resolved prisoner location with getIndex without liveness, so a freed/recycled slot could still name a position. The fix injects a pure existence reader with an unchanged default for standalone fixtures. The actual session checks full prisoner/staff identity and real room/container membership. It rejects absent targets before queued staffing and cancels active jobs through existing guard/route return and cancellation counters. No new persistence field, command, locale key, policy or tariff.

Source checkpoint `67ea0e0bfa5ac9b4c6c4f3a6c47749e3e0d9cb62` checks the queued order before staffing and the remaining active targets before each update. It uses the existing cancellation count, guard unassignment and route abandonment. Already searched targets are excluded from the active existence check. Both prisoner and staff checks use the full generation-bearing entity ID, bounded to the existing unsigned 32-bit contract. Physical room/container existence uses the existing registries; container location registration remains an explicit scenario port.

Weakest claim: six genuine cases cover the automatic prisoner sweep. Other scopes have only the existing domain search-order API, not a player-issued packed search command. Their positive/negative controls must be labelled as domain coverage, preserving the distinction.

## Permanent regression and production negatives

`tests/integration/search-target-departure.test.ts` has fourteen cases: six actual standing-sweep lifecycles, six valid/missing room/staff/container domain orders, and two live/V8 queued old-ID/new-ID controls. A subsequent actual standing sweep searches the replacement prisoner successfully. An old ID cannot be rescued by the new occupant sharing its slot. Container domain coverage is live only because the scenario location map is not persisted; this is not a new save contract.

The six original fixed cases passed in3.33s. Expanded fourteen cases passed in2.89s at `0bd8238546cdc060ff3a0b7d0116c0de8a288c72`. App TypeScript then caught the scenario location fixture's unbranded numeric coordinates; only that test was corrected to use the existing `tileCoordinate` helper. App and tools TypeScript were rerun separately and passed. The final fourteen passed in3.21s (`expanded-fixed.txt`). No source correction was needed for that fixture error.

Actual source mutations ran while this isolated worktree was detached from its published branch:

| Production mutation | Genuine failures | Legal controls |
| --- | --- | --- |
| Disable both SearchSystem existence predicates | 9 RED | 5 GREEN |
| Disconnect the actual new-session existence-reader wire | 9 RED | 5 GREEN |
| Mask full IDs to live slot indices in the session reader | 2 RED | 12 GREEN |

`finally` restored both original byte buffers before the final run: fourteen GREEN in3.06s (`restored.txt`). `exact-restoration.json` records both byte comparisons, SHA256 values and each terminal status. Source diff after restoration was zero. These negatives do not change a test assertion or counter expectation.

## Bounded neighboring evidence

`neighbors.txt`:105 GREEN across8 files,10.22s, with maximum2 Vitest workers:

- `tests/integration/search-target-departure.test.ts`
- `tests/integration/contraband-search-duty.test.ts`
- `tests/integration/security-guard-release.test.ts`
- `tests/unit/contraband-search-system.test.ts`
- `tests/unit/contraband-search-duty.test.ts`
- `tests/unit/security-search-guard-pool.test.ts`
- `tests/determinism/iteration-order.test.ts`
- `tests/determinism/restore-mid-walk-exactness.test.ts`

Separate application/tools TypeScript checks passed; the production client build passed in5.73s. No browser, native input, CI completion or release is claimed. The original eight documentation guards found60 GREEN and2 RED: the new collection needs its index row, and exactly one previously verified ADR0042 quote moved with the ten added session lines (`new-session.ts:1436` to`:1446`). Existing unrelated stale coordinates and the pinned quote allowance are preserved.

The parent approved only that current ADR0042 coordinate and this collection's continuous index row. The old1436 checkpoint remains in the same paragraph. The first corrected documentation run had61 GREEN/1 publication-reference failure because this checkout's fetch configuration tracked only main, despite both source/test checkpoints being pushed. One explicit fetch of this exact published branch populated its remote ref; the unchanged eight guards then passed62/62 in4.28s (`docs-final.txt`) with process-local `GIT_NO_LAZY_FETCH=1`. No citation allowlist or test budget changed.
