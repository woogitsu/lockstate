# Dedicated washing machine — native calibration checkpoint

Initial frozen source `f78f02404777722f174a54ae333bd5f799eb4138`; actual production build served through the inherited artifact preview, one worker, scoped port5197,60second cases/10second progress guard/zero retries. No injected objects, completion, orientation, materials or saves.

| Initial real route | Capacity | Laundry stage | Observed state/pixels |
| --- | --- | --- | --- |
| Normal q0 |43.2s,passed |37.1s,passed | Both authoritative anchors/orientation0 retained through actual Load; glass827/833 before and after |
| Clockwise90 q1 |42.8s,passed |38.3s,failed | Both authoritative anchors/orientation1 retained through actual Load; provisional enamel/crops2/0 caused four soft pixel failures |

Both initial loaded Full HD scenes were opened. The normal view visibly consumes the new physical side louvres, raised inspection seams, machined door rings and control details. The rotated view shows the genuine differently oriented front faces; adjacent walls hide their right sides. It is not correct to sample that view using the normal illumination or unrelated provisional rectangles.

Native calibrated q0 samples remain(820,400,90,140) and(975,340,65,110), exact glass RGB(32,59,66),827/833. Rotated samples are(990,384,48,54) and(1100,465,52,61), exact glass RGB(36,67,76),1484/1480. Each rectangle is isolated to one exposed glass and has equal counts before/after actual Load. The original Laundry requirement of greater than100 is preserved; it replaces the pending fixture's provisional50 threshold. [Calibration receipt](native-calibration.json) records source/candidates and actual measurements.

The initial emitted commands are genuine `PlaceRoomTemplate(laundry-basic,{x:20,y:5})` and the same with `quarterTurns:1`. Completed washer rows are(21,6),(23,6),orientation0 or(24,6),(24,8),orientation1, before and after Load. Actual command/worker observations are in the initial q0/q1 JSON files. The strengthened fixture also retains full read-only completion/load snapshots in later runs.

Initial production worker:435322bytes, SHA256 `776debc4d1612161aa9ed5ecf91e330e7dffc947c59c84afb23dbd05f6fa27aa`. This initial worker belongs to the initial frozen head. After committing calibration, the complete baseline/mutated/restored comparison freezes the new head and compares direct whole bytes, including its build metadata.

The calibrated baseline, default-consumer-only mutation and exact restore remain pending at this checkpoint. These initial observations are not final acceptance or hosted delivery.
