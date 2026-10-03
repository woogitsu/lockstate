# Individual object rotation: approved command preparation, interaction pending

## Subject and authorization

Source subject: root integration `0dc2000231c8318adfbd6cad2e0894222158212b`,
plus independent no-finding record `7d61fa9f197c06aa3b809a715ae159f319fbb72e`.
Existing issue [#2019](https://github.com/woogitsu/lockstate/issues/2019) was read
fresh. The coordinator expressly reported the owner's approval of optional
`quarterTurns` 0–3 mapping to existing `objectOrientation`, omission default 0.
This record does **not** establish approval of a new interaction or new copy.

## Observed source result

The strict PlaceObject schema accepts only integer literal 0, 1, 2, 3 when the
optional field is present. Its structured-clone packer retains the value; the
actual session command router maps it to the existing placement service's
`objectOrientation`. Missing fields stay absent, retaining old orientation 0.
No save format/version changes. Invented `orientation` and `objectOrientation`
wire keys remain refused. The old phase-1 rationale is marked as historical.

The new integration test uses real `createNewSimulationRuntime(73)` and typed
kernel dispatch. Storage/Delivery/Classroom plans actually finish; then a real
eight-plank purchase costs 520 (four unchanged 130 desk costs), taking the
balance from 19530 to 19010. Four separate owners construct q1/q3/q2/omitted-q0
desks. Independent literal footprints are respectively 8,5 + 8,6;
9,7 + 9,8; 8,9 + 9,9; 6,9 + 7,9. Each completed order consumes two planks.

Secondary-square collision is asserted against both pending claims and a
completed standing object; rejected commands add no order. Boundary q1 checks
the second square 8,32: unloaded is `out-of-bounds`; normal streaming load of
the unowned neighbour is `unowned-land`. The q0 control reaches `outside-room`
at the owned anchor instead. That streaming fixture grants no ownership,
injects no order/object/snapshot, and claims no public browser action.

Actual paused captures with pending orders and again after completion are each
encoded as V8, decoded, restored with the production runtime factory, and
compared by deep equality across **all** persisted subsystems. No prefilled
save or handcrafted command reply is used.

## RED and restore receipts

- Original observer attempt: 3 RED, preserved. One assertion incorrectly
  compared the payload envelope rather than its `data`; that was corrected.
- Corrected baseline before source change: 3 genuine RED, all approved turns
  rejected by the original strict schema. Original failures are retained.
- First source run: 2 GREEN/1 RED because my collision anchor overlapped the
  separate default desk. The default slot was moved to literal 6,9; that failed
  observation is retained, without changing a production rule.
- Completed test: 4 GREEN.
- Omit only actual router `quarterTurns → objectOrientation`: 3 RED/1 GREEN.
  Byte-exact restoration SHA256
  `B3BEF0A6A73E40CC35D3FD84E0233D20EE0A1E3353D0B059B4CC773B5B89B3DB`.
- Omit only PlaceObject's packer member: 4 RED. Restore exact saved bytes SHA256
  `E158E4E1B59EE05BFF34CB466079ABF81929EA6134C9839D1ABD2849B4C85E3B`.
  That hash precedes the later comment-heading correction; current final file
  is `E0FF5707F448411E6354719763C5D5A02730CF13EE57527EB293EA05B66B01D6`.
- Restored new test plus unchanged Classroom, generic footprint admission,
  object placement loop and registry neighbours: **48 GREEN / 5 files**.
- `pnpm --config.verify-deps-before-run=false typecheck`: exit 0 (the actual
  root config covers src/tests, and the tools config covers tools). An initial
  attempt at a nonexistent `tsconfig.tests.json` was corrected; no fake third
  typecheck result is claimed.

Raw command output files and byte hashes are adjacent in `evidence/`.

## Decision and limits

Integrate only this approved command producer/consumer and its real tests.
Public Build UI still emits the old omitted/default 0. New interaction/copy
must be a separate review draft: proposed EN **Rotate object**, PL **Obróć
obiekt**, existing pointer/Enter/Space activation, preserving KeyR camera
tilt. No production UI, layout, locale or binding changes belong to this chunk.

Weakest claim: no actual built-client native interaction, rotated preview
geometry, screenshot or acceptance was executed. These are still owed after
the owner decides the interaction/copy and the sole browser lease is granted.
Whole-source tests establish real command/runtime/persistence correctness,
not playable UI completion. No new duplicate issue was opened.
