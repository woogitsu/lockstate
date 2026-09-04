# A tablet and nothing else — how far does a touch-only player get?

**Date:** 2026-09-04
**Tree played:** `0e614c7` (**v0.0.451**), in worktree `/workspace/wt-touch-only`
on branch `agent/playtest-touch-only`. Nothing under `src/` differs from that
commit — `git diff --stat 0e614c7 -- src/` is empty — and the running page
confirmed it from inside: the strip reads `v0.0.451 · <this branch's
instrument-only commit>`.

**Question, as given:** *a person picks this game up on a tablet. They have a
touchscreen and nothing else — no keyboard, no mouse, no right-click, no
hover, no scroll wheel. How far into Lockstate can they actually get?*

**The standard is the product's own.** `AGENTS.md` architectural boundary 10:
*"Input must support remapping, QWERTY/AZERTY and touch/pointer interaction."*
So the test is not whether a workaround exists — it is whether a touch-only
player is **led**.

**The two viewports, and why these two.** **1024×768 landscape** and
**768×1024 portrait**: one device, rotated. An iPad (9th/10th generation, and
the mini) reports exactly these CSS pixel sizes, so holding the device fixed
while turning it isolates *orientation* from *size* — every difference below is
the rotation and nothing else. 768 is also the interesting number: `hud.css`'s
narrow layout is `@media (max-width: 720px)` (`src/ui/hud/hud.css:3716`) and
`styles.css`'s is the same (`src/styles.css:82`), so **a tablet held in
portrait is 48px above the phone breakpoint** and gets the full desktop rail.

**Three things already on record are not re-reported as new, and two are
extended with measurement, which is said where it happens:** #517 (on a phone
the Build panel covers the whole map while the hint says *"point at the
world"*), #899 (at 375×812, 8.2% of the viewport is canvas — its table also
already carries 1024×768 at 49.6% and 92 press-reachable tiles), and #928 (a
finished wall comes down only with `KeyZ`).

---

## The verdict, in one paragraph

*(written after the findings below, see §0)*

---

## Reproduction

`tests/browser/playtest-2026-09-04-touch-only.playtest.ts`, one act at a time.
Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-touch-only.playtest.ts -g "act 4"
```

**The instrument never calls `page.mouse` or `page.keyboard`.** That is not a
flourish: `playtest-harness.ts`'s `press`, `drag`, `calibrate`, `armBuildable`,
`buy` and `buildAndPopulate` all drive the game with the mouse, and
Playwright's `locator.click()` is a *mouse* click even inside a `hasTouch`
context — so a touch playtest built on them would measure a mouse and report
about a finger. Taps go through `page.touchscreen.tap`; drags and every
multi-finger gesture go through CDP `Input.dispatchTouchEvent`, for the reason
`tests/browser/world-scene-touch.spec.ts` gives (one `page.touchscreen` finger
cannot express a second). Everything a finger does not touch — `installTee`,
`sentCommands`, `currentTick`, `panelText`, `latestCounts` — is reused
unchanged.

**Presses were proved to land.** Every world press is preceded by
`document.elementFromPoint` at the exact point, and the act fails if anything
but the canvas is on top; every HUD tap is preceded by the same check against
the control itself. Two of this round's findings *are* that check failing.

**LFS.** `git lfs checkout` was run in the worktree first;
`file public/assets/actors/actor.guard.base.idle.png` → `PNG image data, 260 x
3104`. No claim here is about rendering, but a worktree that had skipped it
would have run green with no art.

**No claim rests on wall-clock time.** The box was at a one-minute load average
of 12.8–14.9 with four other testers' browsers live; timing claims are in
simulation ticks read from `simulation/clock-state`.

