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

No browser, server, build, full verify or hosted-CI polling was run. Diagnosis is published before the production fix; producer omission and exact restoration will be recorded separately.
