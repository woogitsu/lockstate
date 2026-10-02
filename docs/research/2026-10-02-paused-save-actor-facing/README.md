# Paused Save/Load actor facing in the production angled scene

The [Full HD screenshot](fullhd-paused-loaded.png) comes from the production
`/?renderer=oblique` composition root. The test creates a real simulation
snapshot, with a prisoner last facing north and a standing guard last facing
east, imports it through the game's save panel, then loads it while paused.
The scene requests the exact authored PNG frames selected for those headings:

- prisoner: `actor-prisoner-yaw+135-elev45.afade73be3c4.png`
- guard: `actor-guard-yaw-135-elev45.83d398db70dd.png`

`tests/browser/oblique-paused-save-facing.spec.ts` passed 1/1 at 1920×1080
(13.7 seconds, including server startup). A targeted production mutation that
ignored both saved heading maps made that same browser test fail: the expected
frame requests were absent after Load (1/1 red, 23.7 seconds). Restoring the
map lookup returned the test to 1/1 green (13.7 seconds).

This browser evidence covers the paused loaded frame. Pressing Play immediately
starts new simulation movement for both actors, so comparing a fixed pixel
region across that transition would conflate a new movement order with a lost
saved heading. The feed tests separately cover the snapshot and delta heading
mapping; the screenshot is not presented as proof of an unchanged post-Play
pose.
