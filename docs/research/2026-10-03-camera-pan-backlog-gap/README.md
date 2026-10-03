# Existing on-screen pan slice absent from the current integration

Read-only diagnostic, 2026-10-03. Subject
`d8d0f4cc4eae414fe9294e2306a0d6c94f376320`, independent branch
`codex/hud-build-input-gap-20261003`.

## Verified existing backlog

Fresh GitHub read of [Issue1590](https://github.com/woogitsu/lockstate/issues/1590)
records four on-screen pan buttons beside zoom, a fixed128CSS-pixel movement
independent of zoom, and reuse of existing localized direction labels. The
durable adjustable-camera plan names this issue in its Related work section.
The issue describes historical native evidence, not current integration proof.

Git history confirms existing source work:
`b04580171eeed707c32860120499281c28c257ab` added the World pan port and buttons;
`34d7faab9217edbd59c378ec7e83681ab6693b90` connected the earlier angled spike.
Those historical adapters cannot be copied unchanged into the current live
renderer controller. Their extra `hud.camera.controls` wording is unnecessary
for a separate group of buttons using existing direction labels.

## Current observed implementation gap

Opened `src/ui/hud/hud.ts`: the corner assembles View, zoom, four pose buttons
and minimap; `MountHudOptions` supplies zoom/pose but no pan callback. Opened
both production scenes: zoom/minimap/navigation APIs exist, no `stepCameraPan`
port exists. Opened `src/main.ts`: renderer-change gates wrap zoom/pose/minimap,
but no on-screen pan callback is mounted. Existing English labels already read
`Pan camera up/down/left/right` in `default-locale-en.ts`; no new wording is
needed to complete this previously named slice.

This is a missing integration capability established by source consumers and
history, **not a newly reproduced native input regression**. No new Issue is
appropriate while1590 already tracks it. No browser was launched.

## Bounded proposed completion at the initial diagnostic checkpoint

Mount four real icon buttons with existing accessible direction labels, using
the current compact camera-control style. Wire a renderer-only pan port through
the existing active-scene/change gate. Both scenes translate the camera by the
existing128screen-pixel step using their actual transform and update the whole
occupied Build footprint at the stationary cursor. This sends no worker command
and neither changes selected tool/cost nor the accepted template origin lock.

Requested surface: new `src/ui/hud/camera-pan-control.ts`, narrow mounting in
`hud.ts`, narrow callback in `main.ts`, pan port in both scene classes, and
existing control CSS only if needed. No production edit has been made. Native
FullHD100%/200% reachability and real placement/worker controls remain required
after source proof, under the coordinator's exclusive browser schedule.

The weakest claim is current physical usability: neither source absence nor
historical native evidence establishes current FullHD layout or command
acceptance. That needs a rebuilt current client with the exact mounted controls.

## Authorized feature checkpoint — 2026-10-03

The coordinator granted the named narrow source lease and instructed completion
of existing1590. The approved four buttons are now mounted only when the host
supplies the actual camera port. They reuse existing localized direction labels
and the compact camera-control row style; neither locale nor player wording
changes. Main routes them through the current active renderer, excluding
preparation/unavailable states. No historical spike adapter is copied wholesale.

Both scenes pan by128CSSpx, using the installed Phaser ScaleManager's
`displayScale` (baseSize/canvasBounds, per its actual source). World divides by
camera zoom. Angled movement uses the ground inverse with the current yaw and
elevation. Both preserve zoom/orientation. World reuses its actual hover/gesture
consumers for a stationary canvas pointer; Angled repaints its retained preview.
No command is submitted by panning, and the BuildTool remains armed with the
same selected definition.

Actual missing-port baseline: **48 RED**, because neither current production
scene exposed the existing approved feature. Final feature source tests:
**61 GREEN** —48 precise motion/reversal cases across both scenes, eight
stationary whole-square BuildTool hover/click cases, and five actual mounting /
button / main-callback availability cases. World uses real Phaser Camera matrix
and preRender; Angled expected movement uses an independent ground-plane basis.
Node substitutes only scene hosting and unrelated asset loading. World ordinary
click cases invoke actual gesture consumers directly; Angled cases use the real
registered handlers. They prove one exact BuildTool order after the later click,
not worker acceptance. Zero orders leave the real tool during pan itself.

The initial feature harness forgot World Camera.preRender after reverse pan,
causing24 reversal comparisons to read the prior matrix. Correcting that fixture
before the final feature baseline did not change production. The original
missing-port failures and final baseline are retained in separate raw logs.
Source mutations, neighboring checks and built-client native acceptance remain
pending at this feature checkpoint.
