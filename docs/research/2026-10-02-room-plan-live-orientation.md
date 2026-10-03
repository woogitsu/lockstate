# Native room-plan orientation edits after worker refusal

## Missing acceptance boundary

Measured in an isolated worktree based on published `84bff0e11c`, with the
rotation message-registry correction included. Existing rotation browser
tests covered catalogue reachability, native select operation before arming,
miniature rectangles and captured placement requests. Existing fit-controller
units covered revision changes at a locked origin. Neither proved native
orientation edits to an already armed world ghost, after a real refusal,
with genuine worker replies arriving out of order.

The new focused case uses the actual production build, served by the existing
artifact configuration through an untracked local test selection. No tracked
Playwright configuration or timeout is changed.

## Actual scenario and measurements

At 1920 × 1080, 100% interface scale and angled view, arm the four-cell row
and move the pointer to (880, 380). The actual worker-picked origin is
world tile (17, 13). Its 7 × 16 footprint is clear. Reopen the catalogue
with keyboard focus and Enter, without moving the pointer. ArrowDown on the
native select chooses 90°. Its 16-wide footprint crosses the fresh prison's
owned x32 boundary and the real worker reports blocked. The chosen world
origin remains (17, 13).

After that refusal, Space on the native checkbox enables mirroring before
rotation. Hold this genuine world preflight request, without fabricating a
reply. The ghost immediately shows the complete 16 × 7 mirrored plan while
withdrawing the old blocked verdict and material quote until a current reply.
The test independently checks all 12 occupied fixture squares, including both
squares of each of four beds, and all four door squares from SVG floor
coordinates. It does not compute expectations with the production rotation
helper.

ArrowDown chooses 180°, also with no physical pointer movement. Hold that
world query too. Both captured targets retain (17, 13), mirrorX=true, and
respectively quarterTurns=1 and quarterTurns=2. Release the newer query
first. The actual worker reports clear; all 112 floor squares, the 7 × 16
geometry, complete fixture/door positions and the full material quote agree:
Brick × 112, Wood Plank × 8, catalogue value 5,000.

Release the older 90° query afterwards. Its genuine blocked reply is observed
after the newer clear reply, but cannot replace the current ghost verdict.
After two animation frames and closing the catalogue by keyboard, the
current preview remains clear and the complete footprint stays inside the
approved HUD-safe rectangle. No PlaceRoomTemplate command was sent.
The final screenshot was opened and inspected.

## Proof and delivery boundary

- An initial obstacle-based setup was correctly refused at (32, 14), before
  reaching the orientation assertions. That was a test setup error, not a
  product defect. The final case uses the genuine land-boundary refusal above
  and needs no construction setup or injected commands.
- Actual built-artifact baseline: 1/1 green, 7.4s (10.4s overall).
- Production mutation removed both asynchronous request/selection revision
  checks in the world bridge. After rebuilding, the case failed exactly when
  the obsolete blocked reply repainted over the current clear result:
  17.5s, expected clear, received blocked. No network-change retry qualified.
- Exact bridge restoration was verified by matching SHA-256 before/after:
  7F63ABA145419ED4186433ED6AAEF216072EDD9C8A89FC5A9A55E4323041A093.
  After rebuilding, the final artifact case returned green: 8.3s (11.2s overall).
- Both TypeScript projects and the named production build passed.

Published test checkpoint `4347406afb` contains the corrected scenario.
The existing UI implementation satisfies this measured boundary; no ghost,
fit policy, camera, gameplay, persistence or art code was changed.
This is one focused regression, not full CI, other scales/languages,
Save/Load, completed-building or deployed-production acceptance.
