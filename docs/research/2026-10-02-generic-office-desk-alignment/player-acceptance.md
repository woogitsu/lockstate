# Genuine Reception desk player route

## Initial provisional failures retained

The first real built-client run completed capacity in 45.7 s and normal Reception in 53.5 s. The q0 worker anchor/orientation and actual SaveLoad succeeded, but provisional RGB (143,116,87) in the oversized/cropped region had 23 pixels instead of an uncalibrated >40, before and after Load: 2 pixel failures; serial q1 not run. Its native FullHD was opened; raw evidence is retained in `provisional-run.json` and `provisional-q0-worker-and-save-evidence.json`.

The next actual run completed capacity 43.8 s, q0 green 42.9 s and rotated Reception 47.6 s. Native q0 counts 339/111 before/after matched. The q1 worker anchor (24,6), orientation1 and actual SaveLoad succeeded, but provisional off-desk rectangle/color gave 1/0 pixels: 4 pixel failures before/after. Its actual loaded FullHD was opened. The genuine right wall hides q1's teal document; acceptance samples the still-visible original steel monitor instead.

## Native calibration and queued controls

The default world camera yaw-45/elevation45 selects shared source yaw300/elevation40 for q0 and yaw30/elevation40 for q1. This was checked against the renderer's actual camera initialization, circular pose selector and object-yaw composition, and the dominant colours measured from the native PNGs. All authored materials remain unchanged.

`native-calibration.json` records four small, nonoverlapping native regions. Normal desktop/document: 339/111 pixels; rotated desktop/steel monitor: 353/455 pixels. Thresholds >200 for desktop/monitor and >70 for the normal document strengthen the provisional >40/>2 gates. The native workflow, source geometry and 60 s/case + 10 s/progress guards remain unchanged.

A complete repeat at these calibrated regions, default desk mapping removal with actual worker completion/SaveLoad, and exact mapping/worker-byte restoration remain pending. These preparation/calibration runs do not claim hosted completion or final consumer acceptance.
