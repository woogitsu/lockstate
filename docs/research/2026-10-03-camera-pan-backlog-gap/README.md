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
Source mutations and neighboring checks are recorded below. Built-client native
acceptance remains pending.

## Load-bearing producers and exact restoration

The following actual production mutations each replaced exactly one unique
source boundary, sequentially, with original bytes restored in `finally` before
the restoration run. `producer-mutations.json` retains the file hashes and exit
codes; each named negative/restored log retains the actual assertions.

| Actual producer mutation | RED | Legal GREEN | Byte-exact restored |
| --- | ---: | ---: | ---: |
| Main pan callback disconnected | 2 | 59 | 61 GREEN |
| World camera step made zero | 28 | 33 | 61 GREEN |
| Angled camera step made zero | 28 | 33 | 61 GREEN |
| World stationary preview refresh skipped | 4 | 57 | 61 GREEN |
| Angled stationary preview refresh skipped | 4 | 57 | 61 GREEN |

The preview negatives leave all48 exact-motion checks passing while rejecting
the stale whole-square target. Main disconnect fails both real mounted control
paths while unavailable/preparation controls remain green. This distinguishes
actual camera movement, matching Build target, and composition reachability.

Nine focused source suites pass **134/134**: new pan, existing interleaved
navigation, wheel direction/anchoring, gameout lifecycle, View focus/keyboard,
pose controls, HUD localization boundaries and rendering boundaries. The first
neighboring run correctly found the newly added HUD module absent from the named
inventory. Appending `camera-pan-control.ts` to that pinned list fixed the
inventory without changing any scan or forbidden-import rule. Both raw outputs
are retained. App/tools TypeScript and strict standalone checking of both new
test files passed. The production build passed and its Cloudflare output was
verified; this is a local build, not deployment or hosted availability.

## Native acceptance queued to the coordinator

At real1920×1080, UI100%/200%, in World and Angled: independently hit-test all
four `.hud-camera-pan button[data-camera-pan-direction]` controls and assert
actual map/minimap displacement, left/right and up/down reversal, retained
armed wall definition, whole-square quote/target after keyboard activation with
a stationary canvas cursor, and zero worker mutations during camera pan. Then
verify a later physical map click places the shown footprint. Repeat with an
armed fitted room plan, preserving its approved retained origin and cost across
camera navigation until genuine physical pointer movement. Keep original test
budgets and one browser worker. A main callback no-op must fail real movement;
exact source restoration and rebuilt client must pass the same cases.

No native scenario has run on this branch. In particular134 source checks do
not establish FullHD200% row bounds, hit targets, worker placement or fitted
template behavior. The coordinator owns that remaining acceptance and research
index integration. No existing Issue was closed or new duplicate created.
