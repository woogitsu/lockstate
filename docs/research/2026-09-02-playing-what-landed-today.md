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
is what the twenty-six other `*.playtest.ts` files in that directory do.

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

## §1 — A guard hired from the Staff panel never walks, and the two modules that make that true do not know about each other

**MEASURED, act 1.** Four hires on a brand-new prison, clock at ×1, roster and
render delta both sampled from tick 734 to tick 1,194:

```
[act1] render-delta samples over that window: 565
[act1] guard 0: 437 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 1: 402 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 2: 369 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 3: 332 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] walk episodes (non-zero published velocity): []
[act1] every distinct tile any guard was ever published on: ["16,16"]
[act1] phases seen: [["Unassigned",{"count":33,"firstTick":749,"lastTick":1127}]]
```

1,540 guard records on the channel the renderer draws from, across 460 ticks:
no velocity, no sub-tile offset, one tile. The roster said `Unassigned` and
nothing else.

**READ — why, and this is the part worth stating precisely.** Two independent
files decide it and neither imports the other:

- `src/main.ts:618` declares `NEW_PRISON_ORIGIN_TILE = { x: 16, y: 16 }`, and
  `src/main.ts:2793` sends it as the `HireStaff` origin with its own comment
  calling it *"a placeholder rather than a rule"*.
- `deriveDefaultSecuritySectorPostTile`
  (`src/simulation/security/default-sector.ts:194`) answers the middle of the
  first owned chunk — tile (16,16) of a 32-tile world.

`DeploymentSystem.beginDeployment` then takes its `isAtPost` fast path
(`src/simulation/security/deployment-system.ts:206`), sets `'on-post'`, and no
route is ever requested. **This is exactly what the owner was told before
signing ADR 0088, and it is now measured rather than predicted** — which is
the only reason it is worth a section: the prediction rested on two files
agreeing by coincidence, and `main.ts` calls its own half a placeholder.

### 1a. `Travelling` is not merely rare from a hire — it is unreachable from one, and so is a patrol leg

**READ.** ADR 0088 converts two errands. Neither is reachable through the Hire
button in any session a player can start:

- **Deployment travel**: zero-length, as above.
- **A patrol leg**: `PatrolSystem.update` skips any sector whose
  `patrolRoute` is absent or empty
  (`src/simulation/security/patrol-system.ts:77`), and
  `deriveDefaultSecuritySector` authors none, deliberately —
  *"a derived loop would be a made-up path across whatever the player happens
  to have built. `PatrolSystem` therefore stays inert"*
  (`src/simulation/security/default-sector.ts:218-222`). Nothing under `src/`
  writes a `patrolRoute`; grepping the identifier finds the projection reading
  it, the two systems guarding on it, the type declaring it, and no producer.

**So the honest answer to the question ADR 0088 left open is not "rarely".**
Of the two errands the decision converts, one has no distance and the other
has no route. §2 is where the walk that *is* reachable lives, and it is
neither of them.

### 1b. Two things act 1 found that were not in its brief

**MEASURED.** With no prisoners admitted, four hires produced this Staff panel:

```
GUARD COVERAGE
0 of 0
Covered
This prison has the guards it asks for.
...
ON DUTY
0 held · 4 free
Nobody is assigned right now.
```

**READ, and it is correct**: `resolveOccupancyScaledGuardCount` returns 0 for a
complete occupant count of zero (`src/simulation/security/sector-staffing.ts:189`),
issue #533's deliberate empty-sector exemption — *"there is nobody here, so the
schedule has nobody to author a guard for"*.

**But a comment two files over now says the opposite.**
`src/simulation/security/default-sector.ts:98` still reads *"At one, the first
hire is visibly posted and every hire after it is available to an incident."*
That was true when `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1` was an
unconditional floor; since #533 it is false in an empty prison, which is every
prison at the moment a player hires their first guard. Reported rather than
edited — the file belongs to another surface this pass was told not to wander
into. **Owed to: whoever owns `src/simulation/security/`.**

**And `STAFF_ROSTER_ROW_LIMIT` is 3, not 4.** Four hires render three rows plus
`and 1 more`. Noted only because a probe that reads "the roster" gets three of
four staff and no warning, and the next instrument to read that surface will
step on it.

## §5 — Corrections, in both directions

### 5a. Three corrections to this pass's own brief

1. **There is no `--suite playtest`.** Stated at length under "Reproduction"
   above. The brief said to *"check `run-suite.ts` for the exact suite name for
   playtests"*; the answer is that a playtest is not drivable from that wrapper
   at all, by decision, and there is a foundation contract holding the
   exclusion in writing.
2. **`tests/browser/playtest-2026-09-02-the-clock.playtest.ts` does not
   exist.** The brief named it as one of three files to read and match. The
   directory holds `playtest-2026-09-02-the-first-five-minutes` and
   `playtest-2026-09-02-the-world-view` for that date, and
   `tests/browser/ui-clock-paused-readout.spec.ts` is the only clock-named file
   in the tree. This file matches the two that exist, plus
   `playtest-2026-09-01-the-people.playtest.ts` and
   `playtest-740-does-a-guard-walk.playtest.ts` as the brief asked.
3. **"Hire a guard and deploy it somewhere far" is not a gesture the game
   has.** There is no control that chooses where a hire stands or which post it
   takes: `src/main.ts:2793` supplies the origin from a module constant, and
   `DeploymentSystem.assignUnassignedGuards` chooses the sector. §1 is the
   measurement; act 1 was rewritten around the gesture that exists rather than
   the one the brief described.

The brief's tick figures, by contrast, **check out**: 2,400 ticks a day, the
early warning at `intervalTicks: 2,400` / `phaseTicks: 2,399`, `Medium` at
4,800 and `High` at 48,000 in the neglect fixture's post-step convention, and
the ~43,000-tick window between them are all in
`tests/integration/risk-tier-neglect-reachability.test.ts` and were read there.

### 5b. One correction to this corpus, in the other direction

`docs/research/2026-09-01-playing-the-people-surface.md` §1b states:
*"`classifyPrisoner`'s screening draw at `priorIncidents: 0` can only reach
tiers 0 and 1 (`Minimal`, `Low`)"*, and concludes that `Medium` and `High`
*"require actively neglecting a prisoner for a full in-game day or more"*.

**That was already false when it was written.** `9a25700c` (2026-08-30, whose
subject line is *"A sentence long enough to be a history: 14-90 in-game days
(#659)"* and whose code comments attribute the ruling to #593 and ADR 0079)
moved `MAX_SENTENCE_DAYS` to 90, which is 216,000 ticks against
`LONG_SENTENCE_THRESHOLD_TICKS` of 200,000
(`src/simulation/prisoners/sentence.ts:201` and
`src/simulation/prisoners/classification.ts:41`), so the seven drawable
sentences from 84 days up score the long-sentence point and `classifyPrisoner`
can clamp to tier 2. `src/main.ts`'s own docblock records the change in as many
words — *"the tiers reachable from this panel's request were `[0, 1]` at every
drawable sentence and are `[0, 1]` below 84 in-game days and `[0, 1, 2]` at or
above it"* — and `src/simulation/prisoners/intake-system.ts:483-486` marks the
same property as *"spent on purpose"*.

Records here are read-only history and are not edited to match current `main`;
this is marked in a new record, which is what
`docs/research/README.md` asks for. But the correction is not merely
bookkeeping: **§3 below is about the consequence**, which is that the badge
`Medium` now has two producers with two different meanings.
