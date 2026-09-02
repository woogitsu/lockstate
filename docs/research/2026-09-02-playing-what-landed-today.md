# Playtest: the two features that landed today — a guard that walks, and Medium as a warning

**Date:** 2026-09-02
**Branch:** `docs/playtest-what-landed-today`, cut from `origin/main` at
**v0.0.351** (`0e2eb7fb`). `git rev-parse origin/main` was run in the worktree
rather than taken from the brief.

**Surface:** the two changes merged to `main` on 2026-09-02 that reach a
player and that no playtest had touched:

- **Guards walk to their post** — #740, ADR 0088, merged as `9dd6e601`.
  `GuardRoster` gets its own `LocomotionStore`, `createGuardLocomotionSystem`
  drives it at order 201, and deployment travel and patrol legs stop being
  applied in one step.
- **`Medium` risk as a real waypoint** — #788, ADR 0090, merged as
  `75a3797b`. `ClassificationEarlyWarningSystem` runs once a day, reuses
  `reviewClassification`, and can only ever raise a tier and only as far as
  `Medium`.

**The brief, in the owner's words:** *"znajdź bugi i błędy grając"* — find
defects **by playing**. The standing design directive under it: *"gra ma być
łatwa przyjazna do grania, a nie jakieś ukryte funkcje"* — easy and friendly
to play, not hidden features. Desktop browser first.

**The two questions the brief asked, and they are the right two:** not "does it
work" but *can a player ever actually see a guard walk, and does it read as
movement or as a glitch?*, and *a prisoner now sits at an unexplained `Medium`
for about eighteen in-game days — what does a player see, and can they act on
it?*

## Reproduction

`tests/browser/playtest-2026-09-02-what-landed-today.playtest.ts`, one act at
a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5343 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-what-landed-today.playtest.ts -g "act 3"
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`*.spec.ts` only and `playwright.playtest.config.ts` is the one that matches
`*.playtest.ts`.

**There is no `--suite playtest`, and the brief's suggestion that `run-suite.ts`
could name one is the first thing this pass corrects.** `BROWSER_SUITES` in
`tests/browser/browser-suites.ts` holds exactly two entries, `browser` and
`artifact`; `selectBrowserSuite` treats an unknown name as a hard refusal
rather than a fallback (*"An unknown name is not 'probably the default'"*); and
`tests/foundation/browser-network-changed-retry-contract.test.ts` carries the
playtest config in its `CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE` table with the
reason — *"it is not a gate ... there is no red run for a retry to act on"*.
The Playwright CLI with `--config` is the entry point, which is what every
prior note in this directory records.

**The `network-changed-fixture` import rule does not reach a playtest either**,
and that was worth checking rather than assuming: the contract walks
`tests/browser/` and filters `entry.isFile() && entry.name.endsWith('.spec.ts')`
(`tests/foundation/browser-network-changed-retry-contract.test.ts:73`), so a
`.playtest.ts` file is never in the set. `@playwright/test` is correct here and
is what all sixteen existing `*.playtest.ts` files do.

**LFS**: `bash scripts/provision-git-lfs.sh && git lfs checkout` was run in the
worktree first (62 objects, 93 MB), confirmed with `file
public/assets/actors/actor.guard.base.idle.png` returning `PNG image data, 260
x 3104, 8-bit/color RGBA`. Without it a browser run loses every actor sprite
and passes anyway.

**Every viewport is 1280×800.** Every quoted sentence is read off the DOM
(`innerText`, `textContent`, `getAttribute`, `dataset`), never off simulation
state, with one exception that is labelled as such: guard positions come off
the `simulation/delta` channel, which is the bytes the renderer draws from
rather than a projection, because the question is about sub-tile position over
ticks and no DOM surface carries that.

### No finding here rests on wall-clock timing

Every duration below is in **simulation ticks**, read from
`simulation/clock-state`. The rates, both READ:
`FixedStepClock`'s `stepMilliseconds` defaults to 50
(`src/simulation/clock/fixed-step-clock.ts:29`) and `SIMULATION_SPEEDS` is
`[1, 2, 4]` (line 17), so the kernel is 20 ticks per wall second at ×1, 40 at
×2 and 80 at ×4. One in-game day is `DAY_LENGTH_TICKS` = 2,400
(`src/simulation/prisoners/regime.ts:12`) — 120 wall seconds at ×1, 30 at ×4.
Where a wall-clock figure appears it is the standalone cost of an act, and it
is never compared, subtracted or asserted on. Load averages of 5–18 were
recorded on this container today and other agents' browser suites were visible
in `ps` throughout; a timing-derived finding here would be a finding about the
container.

### Claim tiers

- **MEASURED** — this pass drove the real page and the quoted output is
  verbatim console output from that run.
- **READ** — a source file was opened at the cited line and quoted or
  paraphrased.
- **REASONED** — follows from a MEASURED or READ fact, stated as such.

### What each act cost

| Act | What it played | Result |
| --- | --- | --- |
| 1 | four hires on an empty prison; render-delta positions and roster phases over 460 ticks at ×1 | `1 passed (1.3m)`, 79s standalone |
| 2 | Admit on a prison with no cell, then a cell and 24 admissions; the Regime roster's badges | see §3 |
| 3 | a cell, six residents, three guards; 2,000 ticks at ×1 across three sweep boundaries | see §2 |
| 4 | the neglect fixture played: beds, no toilet, no guards, to the first `Medium` | see §4 |

---
