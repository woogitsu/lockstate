# Held camera arrow and HUD radio focus

Issue [#1943](https://github.com/woogitsu/lockstate/issues/1943) concerns a
key already down when focus enters a roving radio group. Normal `ArrowDown`
presses begun on Build or Rooms rows were already consumed by their shared
roving handler. The angled camera still held a prior world `ArrowDown` in its
keyboard adapter after the player focused a Build row. Its frame loop kept
panning under the panel until key-up.

The production fix releases the four held physical arrow codes when a radio
inside a radiogroup takes focus. It does not release WASD, yaw, or tilt codes,
and an ordinary HUD button still permits the documented camera controls. A
fresh world arrow works after the list releases focus.

## Evidence

The historical results below were obtained on the full room-plan integration branch before this independent main backport. The backport keeps only the arrow-focus release and preserves main's existing pointer lifecycle. Its input/index tests pass46/46 and TypeScript passes.

Independent backport falsification also removes only the adapter's physical-code deletion: the targeted release subset fails1/5, because camera.down remains active after releaseCodes; restoring the exact source bytes returns all41 input cases to green. This proves the adapter case on main, not the scene's actual focus transition.

Independent main-based production-artifact acceptance is now obtained: both actual Full HD cases pass2/2 (11.8s). Removing only the scene's physical-arrow release keeps normal radio navigation green and makes the held-arrow focus transition red1/2 (12.1s), because the world continues panning. Restoring exact source bytes and rebuilding the artifact returns2/2 green (12.1s), with unchanged60s/10s limits and one worker. Root opened the refreshed screenshot from this restored main-based run, replacing the earlier integration screenshot. PR1945 is ready for full exact-head CI; this does not assert deployment or the template feature release.

- Actual game at 1920×1080, `/?renderer=oblique`, new prison, paused. The
  browser case in `tests/browser/oblique-hud-roving-camera.spec.ts` captures
  an uncovered central map rectangle. A full canvas-element screenshot also
  included HUD overlays and falsely treated scrolling list rows as map motion;
  this was corrected before the result below.
- Before the fix: ordinary Build and Rooms row navigation passed 1/1, while a
  held world arrow followed by Build radio focus failed 1/1 because the map
  continued to pan. No `net::ERR_NETWORK_CHANGED` signature was observed.
- With the fix: both production browser cases passed 2/2 (21.0 seconds).
  `tests/unit/input.test.ts` passed 43/43 and strict TypeScript passed.
- Production mutation: removing only the new arrow release made the held-key
  case fail again while the ordinary navigation case stayed green (1/2).
  Restoring the line returned the browser suite to 2/2 green (21.2 seconds).

The [Full HD screenshot](oblique-roving-focus-fullhd.png) records the actual
angled map and the Build panel after the successful browser case. A still
image cannot itself establish that the camera stopped; the held-key assertion
compares map pixels over 300 ms after the focus transition.
