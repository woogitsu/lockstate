# Genuine Reception desk player route

## Initial provisional failures retained

The first real built-client run completed capacity in 45.7 s and normal Reception in 53.5 s. The q0 worker anchor/orientation and actual SaveLoad succeeded, but provisional RGB (143,116,87) in the oversized/cropped region had 23 pixels instead of an uncalibrated >40, before and after Load: 2 pixel failures; serial q1 not run. Its native FullHD was opened; raw evidence is retained in `provisional-run.json` and `provisional-q0-worker-and-save-evidence.json`.

The next actual run completed capacity 43.8 s, q0 green 42.9 s and rotated Reception 47.6 s. Native q0 counts 339/111 before/after matched. The q1 worker anchor (24,6), orientation1 and actual SaveLoad succeeded, but provisional off-desk rectangle/color gave 1/0 pixels: 4 pixel failures before/after. Its actual loaded FullHD was opened. The genuine right wall hides q1's teal document; acceptance samples the still-visible original steel monitor instead.

## Native calibration and queued controls

The default world camera yaw-45/elevation45 selects shared source yaw300/elevation40 for q0 and yaw30/elevation40 for q1. This was checked against the renderer's actual camera initialization, circular pose selector and object-yaw composition, and the dominant colours measured from the native PNGs. All authored materials remain unchanged.

`native-calibration.json` records four small, nonoverlapping native regions. Normal desktop/document: 339/111 pixels; rotated desktop/steel monitor: 353/455 pixels. Thresholds >200 for desktop/monitor and >70 for the normal document strengthen the provisional >40/>2 gates. The native workflow, source geometry and 60 s/case + 10 s/progress guards remain unchanged.

The following full repeats and consumer control close the local native acceptance; initial preparation/calibration failures remain historical evidence.


## Actual calibrated baseline and consumer controls

At tested head `781d9dbf8f7e7e4eb1e0f479236d36ba21b24975`, actual production build passed and complete calibrated native baseline passed 3/3: capacity 43.9 s, q0 Reception 38.9 s, q1 Reception 39.9 s. Read-only worker snapshots confirmed canonical desk anchors/orientations both before and after genuine SaveLoad. Counts were 339/111 and 353/455, identical before/after Load; source frames and material choices were unchanged.

The negative control removed only the canonical default `object.desk` to `furniture.office.desk.generic` mapping. The accepted StaffRoom employee override remained present. The actual mutated production build passed. The native q0 route completed capacity 44.2 s and Reception 39.7 s; q1 route completed capacity 43.9 s and Reception 39.5 s. Each run produced 4 expected pixel failures, desktop/detail before and after Load; every count was 0. Canonical worker completion, orientation and SaveLoad still passed. Both negative FullHDs were opened and show fallback geometry rather than authored details.

## Exact restoration and final accepted player state

Original mapping bytes were restored exactly: SHA256 `a9eada806ff523bc9933da9b7a2e8a731c5a896286e33b0551119d8e389dd2d4`, empty scoped diff. Original 103228 byte Blender source is directly byte-equal to its pre-mutation backup, SHA256 `87ecf22ec7f4d82e5c2c47bb18870b8ef060a84759cb55d38b131fc34e72e11b`. No simulation, save, palette, UI, cost or buildable rule changed.

The exact-restored production build passed. Baseline/mutated/restored simulation worker files are directly byte-equal: 430480 bytes, SHA256 `a49b10a378d7501a0745b0e968d3c88be30e2936441c3f0e8634ddec8feec72b`. Final native group 3/3 green: capacity 45.8 s, normal 38.9 s, rotated 38.9 s. Actual before/after Load pixel counts returned to 339/111 and 353/455. All 60 s/case and 10 s/queue-progress guards were retained. No worker construction command, completion or placed-object injection was used.

Both final loaded 1920x1080 FullHD images were opened and inspected; q0 shows authored desktop/monitor/pedestal/document, q1 shows the proper quarter-turned desk with visible original desktop/monitor and genuine wall occlusion. `accepted-player-run.json` records all four completed/loaded images and exact SHA256 digests; raw accepted/negative native JSON records are retained.

After restoration five focused suites passed 52 cases, with 1 unrelated general Blender live scene rebuild skip; app/tools TypeScript passed. All browser processes are terminal; exclusive browser lease was explicitly released to root and HUD before this offline evidence checkpoint. Canonical artifact gate integration and hosted acceptance remain coordinator work; no new workflow/config was committed.
