# Dedicated washing machine — actual native acceptance

Initial frozen source `f78f02404777722f174a54ae333bd5f799eb4138`; actual production build served through the inherited artifact preview, one worker, scoped port5197,60second cases/10second progress guard/zero retries. No injected objects, completion, orientation, materials or saves.

| Initial real route | Capacity | Laundry stage | Observed state/pixels |
| --- | --- | --- | --- |
| Normal q0 |43.2s,passed |37.1s,passed | Both authoritative anchors/orientation0 retained through actual Load; glass827/833 before and after |
| Clockwise90 q1 |42.8s,passed |38.3s,failed | Both authoritative anchors/orientation1 retained through actual Load; provisional enamel/crops2/0 caused four soft pixel failures |

Both initial loaded Full HD scenes were opened. The normal view visibly consumes the new physical side louvres, raised inspection seams, machined door rings and control details. The rotated view shows the genuine differently oriented front faces; adjacent walls hide their right sides. It is not correct to sample that view using the normal illumination or unrelated provisional rectangles.

Native calibrated q0 samples remain(820,400,90,140) and(975,340,65,110), exact glass RGB(32,59,66),827/833. Rotated samples are(990,384,48,54) and(1100,465,52,61), exact glass RGB(36,67,76),1484/1480. Each rectangle is isolated to one exposed glass and has equal counts before/after actual Load. The original Laundry requirement of greater than100 is preserved; it replaces the pending fixture's provisional50 threshold. [Calibration receipt](native-calibration.json) records source/candidates and actual measurements.

The initial emitted commands are genuine `PlaceRoomTemplate(laundry-basic,{x:20,y:5})` and the same with `quarterTurns:1`. Completed washer rows are(21,6),(23,6),orientation0 or(24,6),(24,8),orientation1, before and after Load. Actual command/worker observations are in the initial q0/q1 JSON files. The strengthened fixture also retains full read-only completion/load snapshots in later runs.

Initial production worker:435322bytes, SHA256 `776debc4d1612161aa9ed5ecf91e330e7dffc947c59c84afb23dbd05f6fa27aa`. This initial worker belongs to the initial frozen head. After committing calibration, the complete baseline/mutated/restored comparison freezes the new head and compares direct whole bytes, including its build metadata.

## Final baseline, consumer negative and exact restoration

All comparison builds freeze source `3fc97ac2797ada48ddbd65dbd95fc11da1a348f5`; evidence commits follow afterward. The calibrated baseline passed3/3 in43.3/37.7/38.2seconds. Removing only the default `object.washing-machine` row in `oblique-object-mapping.ts`, rebuilding production and repeating each genuine route gives:

| Actual route | Terminal cases | Construction/Load glass counts | Pixel failures |
| --- | --- | --- | --- |
| q0 consumer removed |1passed,1failed;43.2/39.0s |0/0 for both machines before and after Load |4 expected |
| q1 consumer removed |1passed,1failed;42.8/38.2s |0/0 for both machines before and after Load |4 expected |
| Exact restored full fixture |3passed;43.4/37.2/38.0s |q0:827/833; q1:1484/1480, equal after Load |0 |

Authoritative anchors/orientations remain correct in both negatives, all washer construction orders remain completed, and Save/Load succeeds. Both negative Full HD scenes were opened: the two actual placed objects use flat fallback blocks while the new physical machine meshes and glass disappear. This isolates the renderer consumer; no simulation or save-state mutation is used.

Baseline, mutated and restored production simulation-worker files are directly byte-identical:435322bytes, SHA256 `a2d140db5cee3be762e02680b209cd77f0f51a2bb802c5f43dfcb3dcac14473a`. Mapping bytes restore exactly to SHA256 `a9eada806ff523bc9933da9b7a2e8a731c5a896286e33b0551119d8e389dd2d4`; its Git diff is empty. Both original/dedicated Blender source bytes restore exactly, retaining their audited digests. Raw controls are in [native-consumer-control.json](native-consumer-control.json), whole-build receipt in [frozen-native-build-receipt.json](frozen-native-build-receipt.json), terminal counts/times/errors in [native-terminal-excerpts.md](native-terminal-excerpts.md).

Full read-only completed/loaded worker snapshots are retained separately for both orientations in the baseline, negative and restored routes. [Accepted state verification](accepted-worker-state-verification.json) checks both real washer orders are completed, every retained construction order is completed, and both placed object orientations survive Load. It records the actual snapshot rows and original/dedicated source digests. These observations come from real workers and IndexedDB, not handcrafted saves.

Both restored loaded Full HD images were opened. Normal q0 visibly shows louvres, physical door rings, top seams and controls; rotated q1 shows the front facing with correctly turned1x2 occupied extents while adjacent walls conceal the right-side vents. That occlusion is not claimed as visibility of hidden detail. [Normal loaded scene](accepted-q0-loaded-fullhd.png), SHA256 `0ca2f768141453f20082dd0af110694a5c63809681f6cda5845da99f0b0bbbe7`; [rotated loaded scene](accepted-q1-loaded-fullhd.png), SHA256 `63f786faf9246cf74973422fc9d9807d185954c5f0139c5a778379ec017c4912`.

Final focused seven-suite source/registry/mapping/coverage/determinism run:55passed,1optional Blender-subprocess skipped. App/tools TypeScript exits0. The actual Blender subprocess evidence is separately present in the producer controls, so the optional generic test skip is not described as native coverage.

All native browser processes are terminal; scoped5197listener and owned preview/test nodes are absent. Exclusive lease explicitly released to coordinator/HUD. The ignored manual config is removed after execution. No tracked artifact configuration, timeout, workflow, renderer, core, HUD, identity or palette rule changes. This completes the isolated local new-model player proof; root integration and hosted acceptance remain separate.
