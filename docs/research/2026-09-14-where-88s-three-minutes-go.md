# 2026-09-14 — where #88's three minutes actually go

Taken for [#1181](https://github.com/woogitsu/lockstate/issues/1181), which
records that `tests/browser/app-shell.spec.ts`'s *"every control can actually be
pressed, on every tab and at every viewport (#88)"* passes at **2.9 m against a
3.0 m cap**, and that one extra IndexedDB read per panel refresh was enough to
tip it. #1181 asks for the cost to be **priced from a retained trace** before
anything is changed, because `#331`'s history is a session that optimised the
line the clock stopped on (`0.12 s` in the trace) rather than the loop that
held 69 % of the budget.

Checked against `e221e927` (v0.0.620), in a worktree at `/workspace/spec88`,
`git lfs checkout` done so the atlases are real PNGs rather than 131-byte
pointers.

## What was run

```
LOCKSTATE_BROWSER_TEST_PORT=5495 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.config.ts app-shell.spec.ts \
  -g "every control can actually be pressed" --trace on --reporter list
```

**VERIFIED — one traced run, passing, on an otherwise idle container** (four
cores, no GPU, Chromium rasterising WebGL through SwiftShader, one Playwright
worker, load average 0.22 at the start and ~5 during the run, which is this run
alone; no other agent's suite was running, checked with `ps`/`uptime`).
Reported `1 passed (3.5m)`, the test itself `3.1m` — **tracing inflates it**,
because `--trace on` also records a screencast (3,613 screencast frames in the
trace) and a DOM snapshot per action (1,254), and the reported duration
includes writing the zip in teardown. The *shape* below is what this run is
evidence for; the absolute seconds are an upper bound.

## The priced trace

538 Playwright calls, matched `before`/`after` by `callId` out of
`0-trace.trace`. Wall span of the calls **175.7 s**; summed call durations
148.6 s (the difference is the test's own Node-side work between calls).

| Call | Total | Count | Mean |
| --- | --- | --- | --- |
| `click` | **97.1 s** | 168 | 578 ms |
| `evaluateExpression` | 12.8 s | 148 | 86 ms |
| `expect` | 12.0 s | 128 | 94 ms |
| `mouseMove` | 8.3 s | 20 | 415 ms |
| `goto` | 5.9 s | 1 | 5.9 s |
| `fill` | 4.3 s | 12 | 358 ms |
| `waitForSelector` | 2.8 s | 10 | 280 ms |
| `getAttribute` | 2.7 s | 29 | 93 ms |
| everything else | 2.8 s | 22 | — |

**55 % of the test is `click`, and no single click is interesting**: the mean
is 578 ms and the spread across targets is 508–1023 ms, i.e. every press costs
about the same whatever it presses. The hit-test sweep itself —
`controlReachability`, one `page.evaluate` that `scrollIntoView`s and
`elementFromPoint`s five samples per control over ~200 controls — is inside the
12.8 s of `evaluateExpression`, **under 9 %** of the run.

Phase boundaries, read off the `setViewportSize` calls (setup is everything
before the second one):

| Segment | Elapsed |
| --- | --- |
| setup (load, New prison, six orders, three purchases, the polls) | 30.8 s |
| 1280x720 | 31.8 s |
| 1440x900 | 44.7 s |
| 1024x768 | 31.0 s |
| 900x600 | 21.9 s |
| 375x812 | 14.9 s |

That reproduces #1008's 2026-09-08 finding (recorded in the test's own
docblock) on a different container: **the cost is spread, and it scales with
viewport area rather than with anything the test does.**

## Why a press costs half a second — the mechanism #1008 did not name

A probe spec (below) on the same page, at 1440x900, with no trace:

| Measurement | With the world canvas as it ships | With `#game-root canvas` set to `visibility: hidden` |
| --- | --- | --- |
| mean `requestAnimationFrame` interval | **104.7 ms** (≈9.5 fps) | **16.7 ms** (60 fps) |
| 20 real `locator.click()`s | **27.8 s — 1390 ms each** | **1.5 s — 75 ms each** |

**VERIFIED**, one run each, printed by the probe. Two further readings from the
same run: `click({ force: true })` cost 25.1 s for the same 20 presses (so
actionability checks are *not* where the time is), and `dispatchEvent('click')`
cost 6.0 s (300 ms each — cheaper, because it is not a real press).

So the price of every Playwright call on this page is set by the renderer's
main thread, which SwiftShader keeps saturated rasterising a full-viewport
WebGL canvas. A press is **18.5x cheaper** when that canvas is not being
rasterised. That is why the cost scales with viewport area, why `force: true`
does not help, and why there is no phase to cut: there are 168 presses because
there are five layout states at five viewports, and each one pays the frame
tax.

The probe, for reproduction (it was deleted rather than committed; it is not a
test of anything):

```ts
// tests/browser/tmp-probe-1181.spec.ts, run with -g "probe 1181"
const frame = await page.evaluate(async () => new Promise<number>((resolve) => {
  const stamps: number[] = [];
  const tick = (t: number): void => {
    stamps.push(t);
    if (stamps.length < 40) requestAnimationFrame(tick);
    else resolve((stamps.at(-1)! - stamps[0]!) / (stamps.length - 1));
  };
  requestAnimationFrame(tick);
}));
// then: 20 x page.locator('.ui-tab[data-tab="build"|"overview"]').click(), timed;
// then the same with force:true, with dispatchEvent, and with the canvas hidden.
```

## What that rules out

- **Cutting a phase.** The largest phase is 25 % of the loop and the largest
  single call class is a press that cannot be removed without removing a
  control from the sweep. #1008 refused four specific cuts on coverage grounds
  and this measurement adds the reason those refusals cannot be worked around:
  the saving is not in what the test does between presses, it is in the presses.
- **Not rasterising the canvas during the sweep**, which is the one change that
  would be worth 18x. `visibility: hidden` takes the canvas **out of
  hit-testing**, and the canvas is exactly one of the elements #88 must be able
  to catch sitting on top of a control — the assertion is *"the topmost element
  over each control is that control"*. Stopping Phaser's loop instead (leaving
  the canvas painted and hit-testable) needs a handle on the game that
  `src/main.ts` does not expose, and would also stop Phaser processing the real
  world drag this sweep performs. Both are changes to what is measured, for a
  test whose whole subject is what the assembled page does.

## What this leaves

#1181's second shape: the test is one assertion over five viewports, each of
which already carries its own complete accounting assertion
(`neverLaidOut` / `everMeasured.size === inventory.length - exempt.length`).
Splitting per viewport leaves each part at 15–45 s against the same 3.0-minute
cap instead of one part at 176 s, and costs the repeated 30.8 s setup.

**Weakest claim here:** all of the above is one traced run and one probe run on
one container. The comparison the conclusion rests on — presses against
everything else, and a rasterising canvas against a non-rasterising one — is
internal to a single run each, which is the shape #1181's own caveat asks for;
the absolute seconds are not portable and the 3.1 m figure in particular is
inflated by tracing. What would change my mind: a trace in which `click` is not
the largest class, or a container where the rAF interval on this page is near
16 ms with the canvas visible.
