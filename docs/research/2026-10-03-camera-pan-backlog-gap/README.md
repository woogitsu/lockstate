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

## Bounded proposed completion, awaiting source lease

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
