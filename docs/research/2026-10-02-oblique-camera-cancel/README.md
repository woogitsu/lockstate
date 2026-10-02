# Angled camera cancellation at Full HD

The [production screenshot](after-blur-fullhd.png) is captured after a
right-button camera turn, a `window.blur`, and further mouse movement without
another press. The paused map stays at the same pose; the browser test compares
the complete canvas bytes immediately after blur with the canvas after that
movement. The same case checks a canvas `pointercancel` separately.

This is the pointer lifecycle defect in [#1935](https://github.com/woogitsu/lockstate/issues/1935),
distinct from held keyboard keys in #202. `ObliqueWorldScene` had retained the
turn pointer across blur. It now clears active camera and build gestures on
blur, `pointercancel`, and lost pointer capture, and stops turning when that
pointer leaves the canvas.

The Full HD browser case is `tests/browser/oblique-camera-cancel.spec.ts`.
Removing just the production turn-pointer reset makes the unchanged browser
assertion fail at “RMB turn must stop on window blur”; restoring it returns
the test to green. The test does not raise its time budget or compare a static
scene without moving the pointer.


## Isolated main landing verification

The fix is independently applied to main release base4adfa31fdc (v0.0.833). Main stores hoveredWorldPoint rather than the later feature branch's hoveredScreenPoint; the cancellation adapter clears that existing field. No feature renderer, actor or template changes are included. TypeScript and the research/network fixture gates pass12/12.

Root built the production artifact and ran this exact Full HD case with one worker and the unchanged artifact config, overriding only testMatch to this spec. Baseline1/1green (7.7seconds suite). Removing only the turn-pointer reset from cancelPointerInput and rebuilding gives1/1red at `RMB turn must stop on window blur`. Restoring source and rebuilding returns1/1green (7.3seconds suite); the screenshot above is from that final main-based artifact.

To reproduce that artifact-only case, import `tests/browser/playwright.artifact.config.ts` in a temporary sibling config and export `{ ...original, testMatch: /oblique-camera-cancel\.spec\.ts$/ }`; run the Playwright CLI with that config after `node scripts/cloudflare-task.mjs build production`. All inherited timeouts, browser settings and retries remain unchanged. CI also discovers this spec through the standard browser suite.
