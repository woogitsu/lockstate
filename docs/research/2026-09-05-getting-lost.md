# Getting lost — can a player pan away from their prison, and does anything bring them back? — 2026-09-05

**The verdict in one line: yes, three drags, and the way back exists, works
perfectly, and is hidden behind a sentence that tells the player it does not.**
One press on the minimap surface re-centres the camera on tile **(16,16)** —
`NEW_PRISON_ORIGIN_TILE` to the tile — from a screen on which **113 of 113
sampled world points are exactly `VOID_COLOR`**. The player's problem is not
that there is no way back. It is that the only thing on the screen that is the
way back reads **`MINIMAP IS NOT AVAILABLE YET`** until after you have clicked
it, and the sentence that says *`No map is drawn here yet — click to jump the
camera there`* is only ever shown to a player who has already made the click it
is advertising.

Played on `agent/playtest-getting-lost`, merged with `origin/main` at
**v0.0.475** (`b984445f`); the tree played is the merge commit `72896dd2`, and
every act's own first log line quotes the version strip it read at run time —
`v0.0.475 · 72896dd`. Viewport **1440×900** unless a line says otherwise.
Instrument: `tests/browser/playtest-2026-09-05-getting-lost.playtest.ts`.

**Nothing in CI collects that file.** `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`; the playtest is `*.playtest.ts` and only
`tests/browser/playwright.playtest.config.ts` collects it. It is evidence, never
a gate. **Nothing under `src/` is changed on this branch.**

This record **resumes a session an API limit cut off.** That session built the
instrument and ran acts 1 and 2 at v0.0.473 and gathered no findings; acts 1–2
were re-run here at v0.0.475 and read identically, and acts 3–7 are run here for
the first time. Where a v0.0.473 reading is quoted it is labelled as such.

## Claim tiers

Every factual claim below is labelled **MEASURED** (from a run in this record,
quoted), **READ** (the file was opened at the line cited), **REASONED** (follows
from a stated MEASURED/READ fact) or **JUDGEMENT** (what a player would do or
feel). Nothing is from memory.

## Reproduction

From `/workspace/wt-getting-lost`:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5327 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-getting-lost.playtest.ts -g "act N"
```

| act | what it plays |
| --- | --- |
| **1** | arrival: where the camera starts, the minimap's footprint at five viewports, and the complete control inventory of all five tabs |
| **2** | getting lost on purpose at zoom 1: how many 800px drags, and what the screen and the HUD say when it has happened |
| **3** | both ends of `ZOOM_BOUNDS`, and how far one drag carries at each |
| **4** | the way back, counted in interactions |
| **5** | the edges: how far the world goes and whether anything degrades out there |
| **6** | across a reload and across a prison switch |
| **7** | the three candidate ways back, measured against each other, and the affordance audit |

---

## The baseline this extends

`docs/research/2026-09-02-the-world-view.md` §2–§3 measured this surface at
v0.0.344: the pan had no clamp, the minimap took presses and produced nothing,
and the far end of a four-drag pan was solid `VOID_COLOR`. Both became issues —
**#794** (pan into solid black, nothing says the way back) and **#793** (the
minimap eats clicks and does nothing). **Both are still open.** One of them is
no longer true of the code.

**READ.** `8fead7e7`, *"The minimap navigates (#793) — and the mutation that
survived a diagonal-only corner test (#802)"*, dated **2026-09-02**, added
`WorldScene.navigateToMinimapPoint` (`src/rendering/scene/world-scene.ts:1279`)
and wired it at `src/main.ts:2106`. §2 of the baseline record became false on
that date. This pass re-derived it behaviourally rather than inheriting either
the issue or the commit.

---
