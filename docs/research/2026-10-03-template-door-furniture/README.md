# Generic furniture on a completed template door square

Date: 2026-10-03. Exact baseline: `5e3c9d6bf71bd6e227947321fe34f2f42fc0c289`. Own branch: `codex/template-square-next-gameplay-20261003`.

## Actual reproduction before production edits

Genuine packed commands complete Basic Cell at (10,10), then submit an independent `PlaceBuildOrder` for `toilet-brick`. Independent geometry references are a 4×7 authored Cell with south door at local (1,6), mirror first then rotate:

- q1, no mirror: door (10,11), legal control (8,11).
- q3, mirrored: door (16,11), legal control (18,11).

Live and encoded V8 Load reproduce each pose. All shell and authored fixture orders actually finish before the independent purchase. The conflicting toilet also finishes, allocates one brick, spends 40 (treasury 23470 → 23430), and occupies the actual door tile with `sourceOrderId: later-toilet`. The authored bed/toilet owners are retained. The focused original result is **4 RED / 4 legal GREEN** (8 cases, 4.07s); original raw output is `baseline.txt`.

The exterior controls two squares away finish with the same existing 40 price, survive actual Load → Undo → Redo and keep the original template furniture intact. Expected refusal uses existing `unbuildable`; its atomic snapshot comparison excludes only the newly recorded failed order and the kernel command-dispatch bookkeeping.

## Existing rule, deduplication and approved scope

Fresh complete Issue bodies #1994 and #2011 and successful furniture/door/perimeter searches were read. #1994 concerns the outside approach and its generic object footprint consumer. #2011 concerns a full-square wall on the middle door tile. Neither covers this generic furniture arm on the middle tile. Source `claimsRoomDoorApproachTile` currently checks only outside approaches; the square-wall arm already checks the same completed ownership one inward step earlier.

Parent reviewed the actual RED and approved the identical existing paid-entry protection: extend only `claimsRoomDoorApproachTile` with that existing offset/helper. No System, session, save-schema, copy or tariff change. Ordinary player-built doors must remain legal and pending template claims must retain their current behavior.

**Measured limitation:** the current navigation composition does not consult placed-object occupancy. This reproduction does not prove a toilet-induced path failure and does not change navigation policy. It proves an independently funded physical object occupying the protected authored door square.

No browser, server, build, full verify or hosted-CI polling was run.

## Fixed source and meaningful production negative

Fresh nonduplicate [Issue #2023](https://github.com/woogitsu/lockstate/issues/2023) was created and read back. Diagnosis checkpoint `2fab2844a0a2abfaabd038dd5c69f33332be638c` was pushed before source checkpoint `12421a08f10ef49d9f7bb7e6f7640b1cc5f3d5dc`.

The source changes only the existing `claimsRoomDoorApproachTile` predicate: completed ownership is also queried from one inward step earlier, exactly as for the already protected full-square wall. The pending tile claim, ordinary edge branches and completed-order membership remain unchanged. Result: **10 GREEN**, including the original eight cases and two real separately constructed/enclosed/zoned ordinary Cell doors (live/V8) retaining their existing generic-furniture policy.

At detached exact source checkpoint `12421a08f1`, the executed negative removed only this offset from the actual coordinator producer. It yielded **4 RED / 6 GREEN**; `finally` restored the saved source Buffer byte for byte and the same tests yielded **10 GREEN**. SHA256 before/after: `88470ac79c6d4b9eac227260386069ee0520263f706b7e7fc191b100b57c574c`. Mutation hash: `75b7b3537a1da708b9120b1737d79b0c6e590157eb1824f637c1ec245cfe46df`. The Git production diff after restoration was zero; the original branch was then restored. Exact logs and JSON receipt are retained, and the executed script is archived inert.

## Bounded terminal checks

The final neighboring run is **266 GREEN / 5 files, 10.24s** (`neighbors.txt`):

- `completed-template-door-furniture.test.ts` (the 10 cases above).
- `generic-object-template-approach.test.ts`.
- `room-template-completed-furniture-access.test.ts`.
- `room-template-door-square-run.test.ts`.
- `room-template-legacy-entrance-collision.test.ts`.

Application/test strict TypeScript exits 0. Research index, documentation source anchors and quotation contracts finish **20 GREEN / 3 files, 4.06s**. The own index row preserves all existing rows; no source-coordinate correction, citation budget or guard change was necessary. `terminal-receipt.json` records the commands/outcomes; `local-evidence-hashes.json` records local captured bytes (Git text normalization can change their checkout line endings).

Expected refused purchases create only the normal failed order row; treasury, physical objects/owners, history, material delivery/allocation, zoning and the remaining snapshot remain unchanged. Successful independent exterior purchases retain their own real Undo/Redo and V8 Load. Ordinary doors are not newly protected. This is an existing paid-template entry rule applied to physical furniture; no new navigation collision policy, per-seat target, format, message, tariff or player UI is introduced.
