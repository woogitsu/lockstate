# Actual canvas exit ends only mouse camera drags

[Issue #1982](https://github.com/woogitsu/lockstate/issues/1982) records a genuine
angled-camera input defect. A held middle/right drag that crosses from canvas
to a native HUD control resumes panning/turning when it returns to the canvas.
The existing cancellation listener was attached to Phaser's GameObject-specific
`pointerout`, which does not report leaving the canvas.

## Producer and correction

The installed Phaser source documents the distinction in
`POINTER_OUT_EVENT.js` inside its installed input/events directory. `MouseManager` calls `setCanvasOut` on
native canvas `mouseout`; `InputPlugin.onGameOut` emits
`gameout(nativeEvent.timeStamp, nativeEvent)`. That event does not provide a
Phaser Pointer. These installed sources were read before changing the listener.

The real scene constructor/create/callback diagnostic is published as
`5f234f1feb6e8b8d86b37bef79189e1860a7a552`. The correction in `e3bd575b13`
adds one listener clearing only the four mouse camera IDs/anchors. It preserves
the existing construction gesture, hover, touch tracker, pointer capture,
pointercancel and blur behavior. No control, copy, placement or persistence rule
changes. The native instrument and preservation checkpoint is `95f3570bdd`.

The corrected source was restored from the original byte array after every
negative: SHA256
`D461926EE16903CA9B430DD08F6CB649B55801CC4472449B22ECF7B51227949E`.
Final production diff against the committed correction is zero.

## Real callback and protected-state proof

The unit test instantiates the production scene and invokes its registered
handlers with the shipped gameout argument shape. Only graphics/input plumbing
and texture loading are mocked; camera math and callback bodies are real.

| Stage | Result |
| --- | --- |
| Original six-case diagnostic | 2 RED, 4 valid controls GREEN |
| Initial corrected/producer omission/exact restoration | 6 GREEN / 2 RED, 4 GREEN / 6 GREEN |
| Final seven-case producer omission | 2 RED, 5 controls GREEN |
| Exact restoration | 7 GREEN |
| Deliberately broad cancellation clearing construction/touch state | 1 RED, 6 GREEN |
| Exact restoration after broad negative | 7 GREEN |

Controls prove unbroken middle/right movement, existing GameObject pointerout
cancellation, and retained hover/pressed footprint/touch identity. Complete
terminal outputs are retained alongside this receipt.

## Genuine production-client native acceptance

The production build and dedicated simulation worker run through the existing
artifact configuration: 1920×1080, UI100%, one worker, zero Playwright retries,
unchanged 60/10-second case/expectation limits. An untracked local matcher selects
the scoped cases. No handler, camera state or worker command is injected.

Each case creates and pauses a prison, opens Build without arming a tool, and
starts a genuine middle/right drag on uncovered map. It verifies ordinary map
movement, crosses into the native Category SELECT, then returns with buttons4/2
still held. Passive DOM traces confirm canvas mouseout, actual SELECT ownership
and the held button on reentry. A later fresh press must move the map again.

The assertion compares exact PNG bytes of a separately hit-tested uncovered
map region (400,300,1000,400) and independently checks minimap viewport style.
Raw JSON records both results and before/after worker commands before asserting.

| Built source | Middle | Right |
| --- | --- | --- |
| Corrected source, strict map instrument | GREEN 9.0s | GREEN 9.0s |
| Remove only corrected producer listener: original callback behavior | RED 8.4s | RED 7.8s |
| Exact source restoration and rebuild | GREEN 8.9s | GREEN 9.1s |

Both intended negatives fail at exact map pixels; their independent minimap
styles also change. Corrected/restored pixels and viewport are identical. Every
camera observation keeps the worker-command array empty and unchanged.

The final restoration group passes **8/8**: the two camera cases plus the existing
wall capture at FullHD100%/200% and all four retained mirrored room-plan hover
cases (0°/90° at 100%/200%). Wall controls verify whole-run quote and actual
worker footprints through release beneath HUD; native HUD-origin presses remain
owned by the selector. Room controls preserve chosen origin, rotation, mirror,
complete quote and stationary confirmation. All browser processes are terminal;
port5404 has zero listeners. Both TypeScript checks and production build pass.

## Instrument corrections retained honestly

The initial original-source run failed because a class selector matched both
View and Category. It is retained as a setup failure, not product evidence.
The corrected exact accessible Category name then reproduced both camera jumps.

The first fixed-source full-canvas comparison also failed. A canvas occupies
the entire viewport, so its screenshot composites HUD hover painting. Numerical
pixel analysis shows **every** fixed-image difference confined to the right HUD
(x1569..1909); the uncovered map is identical. Original-source images differ
across the map. The revised strict map instrument removes this unrelated HUD
painting, introduces no pixel tolerance, and fails on the same original producer.

[native/](native/) retains the original/fixed full-canvas attempts, numerical
difference bounds, revised map PNGs, raw DOM/viewport/command traces, final
FullHD images and wall footprint controls. The final FullHD images were
opened and inspected. Complete logs preserve expected wrapper no-retry reports;
no network retry occurred.

## Nonduplicate search and boundaries

Fresh all-state REST searches found gameout0, camera reentry0 and camera drag
HUD19. Issues #878, #1971 and #1935 were read: construction capture and
blur/pointercancel are separate causes. The new Issue was fetched after creation;
title and body match the submitted payload exactly.

Acceptance covers angled middle/right camera canvas→HUD→canvas at UI100%, normal
and fresh camera drag, and the named protected construction fixtures at
UI100%/200%. Touch hardware, browser-window exit, fixed-renderer mouse turn/pan,
Save/Load, main CI, merge and deployment remain outside this receipt.
