# Build target readability ? 2026-10-02

Issue [#1953](https://github.com/woogitsu/lockstate/issues/1953).

## VERIFIED: actual player reproduction

The inspected live renderer Full HD image showed the sentence `1 whole squares from 16, 16 | catalogue value 80` painted beyond the Build rail. The value inherited the counter primitive's `white-space: nowrap` and retained an intrinsic flex minimum width. Existing Issues #174/#390 concern short-screen panel/catalogue budgets; fresh searches found no duplicate for the new full-square sentence.

## VERIFIED: scoped correction

Only `.hud-build__target` and its value styling change. The sentence shrinks and wraps within its existing rail, and a fixed minimum three-line slot keeps following controls stationary as square counts change. This applies below 1920 CSS pixels too, because browser chrome or zoom can reduce the effective viewport of a physical Full HD display. Labels, catalogue values, commands, picking and camera semantics are unchanged.

## VERIFIED: production artifact evidence

`tests/browser/build-target-readability.spec.ts` creates a real prison, selects angled mode with the native View selector, arms Brick wall, hovers and drags through actual pointer events. It measures all painted text-line bounds, intrinsic overflow and the following hint's vertical position before/after dragging. No renderer feed or target text is injected.

Final restore: **3/3 passed, 20.6 s**, one worker, original 60 s test/10 s assertion limits. Viewports: 1920?1080, 2560?1080, and 960?540 CSS pixels. The latter reproduces the layout size available at 200% zoom on a 1920?1080 display; it is not a claim that browser chrome's zoom setting was changed. Existing token/target tests: 87 passed; TypeScript and production build passed.

Production mutation restoring `white-space: nowrap`: **1 failed, 4.3 s**; content was 358 px wide inside 260 px. Restored source passed all three viewports. No retries.

Opened and inspected all images:

- [Full HD: 14 squares, catalogue value 1,120](./target-1920.png).
- [2560: 20 squares, catalogue value 1,600](./target-2560.png).
- [Effective 200% Full HD CSS viewport: 2 squares, value 160](./target-960.png).

The complete target sentence is visible. The 2560 image separately shows a black terrain band near the bottom; this HUD correction does not claim to fix that renderer limitation. These drags test real visible square runs, not the largest possible worker world-bound run. Main landing remains subject to repository CI gates.
