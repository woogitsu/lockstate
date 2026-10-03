# Interleaved angled camera navigation — 2026-10-03

Subject: `cc695a8d05af849fef4b7dca6cff2e6e89c6d2e3`, independent worktree
`codex/hud-next-camera-menu-audit-20261003`.

## Observation

The actual registered angled scene handlers preserve the grabbed ground point
through middle drag → wheel → further drag and the current ground pivot through
right drag → wheel → further drag. The new 24 cases pass. The combined existing
wheel14 and gameout7 controls also pass: **45/45 GREEN** in `baseline.log`.
No production defect is established, so there is no new Issue or permanent
production change. Fresh GitHub searches for camera/modal/mouse and
camera/wheel/middle/pan found no corresponding interleaved case.

## Scope and independent reference

The test runs real `ObliqueWorldScene.create()`, public camera restoration,
registered pointerdown/move/wheel/up/gameout callbacks and camera snapshots.
Only Phaser hosting/graphics and unrelated asset loading are substituted. It
uses a logical FullHD 1920×1080 canvas, yaw −75°/30°/125°, elevation25°/55°/75°,
zoom1.6, both vertical wheel directions and a nonzero horizontal component.

The ground reference solves the independent 2×2 projection matrix. It imports
neither production projection functions nor scene drag anchors. Further middle
movement must still carry the initial grab point. Right movement must preserve
the pivot at each current cursor and advance yaw/elevation. Physical middle
release and the shipped Phaser gameout argument shape must stop later movement.

CSS ratios1/2 convert client samples into the already-normalized logical pointer
coordinates delivered to these handlers. This is **not native browser proof of
Phaser ScaleManager or UI scaling**. Existing native middle/right drag and
canvas-exit acceptance remains separate; this test adds interleaving coverage.

An initial fixture mistakenly passed `target` rather than the actual public
camera DTO's `centre`, causing setup TypeError in 24 cases. Correcting that test
fixture preceded the baseline. Those errors are not production regression proof.

## Actual producer negatives and exact restoration

Both mutations affected exactly one occurrence in the actual scene source,
ran sequentially, and restored the original bytes in `finally` before each
restoration run. `mutations.json` records source SHA256
`d461926ee16903ca9b430dd08f6cb649b55801cc4472449b22ecf7b51227949e`.

| Actual source mutation | RED | Unaffected legal GREEN | Byte-exact restored |
| --- | ---: | ---: | ---: |
| Wheel callback omits its physical cursor pivot | 28 | 17 | 45/45 GREEN |
| Middle-down grab anchor shifts world x by one64px square | 12 | 33 | 45/45 GREEN |

The wheel mutation fails all24 new interleaved references plus the four existing
angled vertical-wheel controls. Existing World wheel cases and camera-exit
controls survive. The grab mutation fails the12 new middle cases by64px; the12
right cases and21 existing controls survive. Raw logs retain each assertion;
neither negative is a production finding. The original producer works correctly.

Strict standalone TypeScript checking of the new test and its imports passed.
Final production diff is empty. No timeout, assertion precision, retry, worker
count or native test changed. Both Vitest runs use at most two workers.

## Limits

No browser, models, worker commands, save format, copy, layout policy, touch
gesture rule or workflow changed. The weakest claim is native interleaving: a
physical browser sequence with the same mouse buttons and wheel would be needed
to extend this result to native event ordering. No Build preview or purchase
acceptance is claimed by these camera-only tests.
