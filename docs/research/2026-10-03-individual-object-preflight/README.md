# Individual object preflight — source checkpoint

## Architecture proposal (DRAFT, not an approved ADR)

Extend the existing correlated `simulation/request-projection` catalogue with
`world/object-placement-preflight`, strict `object-placement` target containing
`definitionId`, `anchor` and optional `quarterTurns` 0–3. No new envelope kind,
save field, visible text, layout, camera binding or palette rule is proposed.
The read model carries the complete footprint, catalogue material value and
existing refusal reason/first failing tile. Catalogue value is not a predicted
debit: actual procurement still nets available stock as before.

`ObjectPlacementService.preflight` is the side-effect-free admission producer.
Actual `place` calls it before minting the unchanged order/history transaction.
Catalogue, duplicate order, loaded chunk, ownership, standing/pending collision
and anchor-only room membership retain their original deterministic order.
The typed UI port reaches the real worker through the existing requester.
This checkpoint does not mount a painter; consumer ownership remains next work.

## Observed evidence

Base: `f83e2150d3a7c0f6023192312c6e52793fdfd771` (approved command source,
without the separate unapproved rotation UI draft `fa830d556e8e`). No browser
or server was started. Existing issue #2019 covers this unfinished interaction;
no duplicate issue is created.

- Original production lacks `preflight`: 3 genuine RED tests preserved.
- Source implementation: 3 GREEN; first channel gate: 1 RED / 26 GREEN because
  the catalogue lacked the presentation projection. The gate was retained.
- First actual worker observer was erroneous: `expectOk` asserts and returns
  void. Original failure and compiler errors retained; corrected to read the
  narrowed decoded `value`. No production guard was loosened.
- Final: 48 GREEN across six files, including every declared worker projection,
  whole-session determinism under every projection at each wake, reachability,
  protocol decoder and approved real oriented purchase/save controls.
- Both application and tools typechecks exit 0.
- Dedicated actual worker test uses decoded UI request and decoded response,
  all four facings, exact secondary pending collision parity, and whole paused
  session snapshot equality before/after four reads. Query strict bounds,
  nested unknown fields and omitted default are asserted independently.
- Exact q1 footprint `[8,5],[8,6]`, catalogue value 130; actual typed purchase
  changes treasury from 25000 to 24870. Reads change neither persisted state nor
  bounded refusal history. Existing unknown, nonobject, outside-room and duplicate
  refusals remain identical to actual commands.

## Real production mutation controls

1. Omit service footprint orientation: 1 RED / 4 GREEN. Restored bytes SHA256
   `669EBF40A856949908C97C7975FF644FFC9807FDB0BE438ACC3D0894BA6EFDD6`.
2. Omit worker target-facing mapping: 1 RED / 4 GREEN. Restored bytes SHA256
   `BAC1571A4FFADB9D27E8F1DEB19EED5F8794312362C929B5F6AE4603BE90D1BA`.
3. After both exact restores: 48 GREEN / 6 files. Raw logs and hashes are in
   `evidence/`; native acceptance and visible ghost verdict are not claimed.

## Next bounded consumer

Mount this read behind the existing object aim. Invalidate on selection, anchor,
world/session changes and disarm; ignore stale replies. The worker decides
footprint/cost/collision, and actual placement revalidates at release. No new copy
or approval of the separate rotate-object control is implied by this proposal.
