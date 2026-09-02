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
2. **The brief's first reference model, a 2026-09-02 playtest named
   *the-clock*, is not in the tree.** It named three files to read and match;
   that one has no file. `ls tests/browser/*.playtest.ts` lists 26 before this
   pass added its own, two of them dated 2026-09-02 — *the-first-five-minutes*
   and *the-world-view* — and `tests/browser/ui-clock-paused-readout.spec.ts`
   is the only clock-named file in the directory. This file is matched against
   those two plus `tests/browser/playtest-2026-09-01-the-people.playtest.ts`
   and `tests/browser/playtest-740-does-a-guard-walk.playtest.ts`, which the
   brief also named and which do exist.
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

## §4 — `.hud-minimap` does not merely swallow a click; it makes four world tiles unbuildable, and the drag over it fails silently

**This is the one finding in this pass that is a defect claim, and it is not
about either feature.** It is put in front of §2 and §3 because it cost two
runs and because it is a third independent sighting of a panel that has twice
been ruled *"not a defect claim — the camera pans"*.

**MEASURED, act 4's first run** (kept verbatim; the run was stopped after this
because everything downstream of it would have measured an unenclosed cell):

```
[act4] calibration: tile (0,0) top-left = (-384, -624)
[act4] .hud-minimap rect {"left":12,"right":410,"top":317.8125,"bottom":718.8125}
[act4] north run: 6 by drag; []; still missing []
[act4] north run: 6 by drag; []; still missing []
[act4] west run: 3 by drag; ["press at 12,15 produced NOTHING; under it:
  [{"tag":"DIV","cls":"ui-panel__body","pointerEvents":"auto"},
   {"tag":"SECTION","cls":"ui-panel hud-minimap","pointerEvents":"auto"},
   {"tag":"CANVAS","cls":"","pointerEvents":"auto"}, ...]",
  "press at 12,16 produced NOTHING; ... hud-minimap ...",
  "press at 12,17 produced NOTHING; ... hud-minimap ..."];
  still missing ["12,15","12,16","12,17"]
[act4] west run: 6 by drag; []; still missing []
```

Read that against the geometry. Origin `(-384, -624)` puts tile column 12's
west edge at screen `x = 384` and tile rows 12..17 at screen
`y = 144, 208, 272, 336, 400, 464`, each 64px tall. The panel occupies
`x 12..410, y 317.8..718.8`. So the west edges of tiles (12,15), (12,16) and
(12,17) — and part of (12,14) — are inside it, and the two runs that laid the
same wall on the *east* edge (`x = 768`, outside the panel) each produced all
six segments.

### Why this is different from the flake already on record

`playtest-2026-09-01-the-people.playtest.ts`'s header documents a six-segment
side producing three under machine load and declines to call it a defect,
correctly, because *"it rests on dropped frames under load, which is
wall-clock"*. **This run distinguishes the two causes without a timing
argument at all**: the drag dropped exactly the three segments whose screen
points `elementsFromPoint` places under a `pointer-events: auto` panel, the
three it kept are the three outside it, and three subsequent single presses —
one mousedown and one mouseup each, no interpolation — reached the panel too.
A dropped frame does not choose its victims by screen rectangle.

**So the player-facing statement is stronger than "a click is swallowed".** At
this viewport and camera, **there is no gesture that builds on those tiles**:
not a drag, not a press. And it is silent: `docs/research/2026-09-02-the-world-view.md`
§3 already measured that a blocked click and a click that landed with nothing
to report leave `.hud__refusal` and `.hud__event` byte-identical, so there is
no third state for "this did not reach the world". This pass did not re-measure
those two bands during the wall runs and does not claim to have — what it
measured is the commands, and three of six were never submitted.

### What is NOT claimed

- **Not that the camera cannot be panned away from it.** It can, and
  `docs/research/2026-09-02-the-world-view.md` §4 measured panning as unbounded
  and exactly reversible. The claim is that a player who does not know to pan
  gets a wall with holes in it and a refusal that blames the rectangle.
- **Not a number for how much of the world this affects.** That is already
  measured — 42.04%–44.42% of the canvas at four viewports, `.hud-minimap`
  alone 14.5% at 1280×800, same note §1 — and this pass adds the consequence
  rather than the fraction.
- **Not that any sentence is missing.** What the right sentence would be, or
  whether the panel should stop taking pointer events, is a player-facing
  decision. **Owed to: the owner** (`AGENTS.md` exclusion 4).

## §2 — The only walk a player can provoke, and what it costs in ticks

### 2a. What was left after §1, read before it was played

**READ.** ADR 0088 converts deployment travel and patrol legs. §1 established
that the first has no distance from a hire and the second has no route in any
session a player can start. What remains is a walk nobody asked for, and it is
worth stating as a chain because every link is a different module:

1. `SectorSearchDutySystem` orders a sweep of up to
   `DEFAULT_SECTOR_SWEEP_MAX_TARGETS` (4) of a sector's own occupants every
   `DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS` (600 — a quarter of an in-game day),
   but only while `claimableGuardIds(this.guards).length >=
   policy.requiredGuardCount`
   (`src/simulation/contraband/sector-search-duty.ts:126` and `:176`). ADR 0073
   Part 2 Option A; no player gesture is involved.
2. `SearchSystem` routes the claimed guard to each target and then, on arrival,
   `this.guards.setTile(guardId, destination)`
   (`src/simulation/contraband/search-system.ts:372`) — a **teleport**, and
   deliberately out of ADR 0088's scope.
3. When the last target's dwell expires, `releaseGuards` calls
   `this.guards.unassign(guardId)`
   (`src/simulation/contraband/search-system.ts:324`) — leaving the guard
   `'unassigned'` **wherever the search left it**.
4. `DeploymentSystem`, on its 10-tick schedule
   (`src/simulation/security/deployment-system.ts:39`), picks it up:
   `assignUnassignedGuards` if the sector is short, or `walkBackToPost`
   (`src/simulation/security/deployment-system.ts:170`, the owner's ruling 24 of
   2026-08-31) if it holds a post it is not standing on. Either path calls
   `beginDeployment` from the guard's current tile, so the route has real
   distance and **is** walked.

So the walk ADR 0088 made possible is the *return from a contraband sweep*, and
its length is however far the last target was from the post tile. That is the
thing act 3 measures.

**One thing that follows and is worth naming: the walk is bounded by the
prison.** `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` is 128 against
`LOCOMOTION_SUBTILE_UNITS` 256 (`src/simulation/locomotion/locomotion.ts:102`,
`:76`), so **one tile every two ticks** — ten tiles a wall second at ×1, forty
at ×4, which the constant's own docblock states as *"640 px/s on screen at 1x
— hurried"*. A starter prison owns one 32-tile chunk, so the longest route
inside it is about 62 tiles, or **124 ticks**; a walk across a 6×6 cell is
**2 to 20 ticks**.

## §6 — Do the two features interact? Measurably, no; arithmetically, by a bounded amount

The brief asked whether a `Medium` prisoner in a prison whose guards walk
rather than teleport means slower incident coverage, and whether that is
visible or measurable.

**REASONED from READ facts, and the answer is that ADR 0088 was scoped
precisely to avoid this.** The three guard errands that bear on an incident are
untouched by it:

- **Incident response still teleports**, deliberately (#740's own commit
  message: *"Incident response and contraband search guard travel are
  unchanged and still teleport on arrival"*), and its destination is
  `requireDefinition(incident.sectorId).postTile` — the tile the responder is
  already standing on in a starter prison.
- **A contraband sweep's outbound travel still teleports**
  (`src/simulation/contraband/search-system.ts:372`).
- **Coverage** is `DeploymentSystem.getCoverageReport`, which counts guards by
  deployment phase, not by position. A guard walking back is `'travelling'`,
  which the tally counts as neither `onPost` nor `onSearch`
  (`src/simulation/presentation/security-projection.ts:165-168`).

So the only thing ADR 0088 adds to a coverage gap is the *walk-back* leg, and
§2b prices it: the ticks measured there, against a 600-tick sweep period. That
is the whole of the interaction, and it is small by construction rather than by
luck.

**What this pass did NOT do, stated rather than implied:** it did not run a
prison to an incident with guards present and compare incident duration before
and after `9dd6e601`. Doing that honestly needs a second worktree at the parent
commit and a tick-indexed incident timeline on both — the shape
`docs/AGENT_WORKFLOW.md` requires for a baseline — and it is a measurement, not
a reading. **Not attempted here; named as unreached.**

## §3 — When `Medium` arrives, four badge words change and nothing else on the screen moves

**MEASURED, act 4** — `1 passed (8.6m)`, 511s standalone. The neglect fixture
played with the mouse: a sealed, zoned 6×6 cell at (14,12)-(19,17), beds only
and **no toilet**, **no guards**, twelve Admit presses (eleven landed; four
housed, seven waiting with no bed). The Regime tab was open and the roster, the
`HIGH RISK` chip, the `INCIDENTS` chip and the alerts column were sampled
together, every sample stamped with the worker's tick.

`Medium` is real, it arrives, and the player is not told. Verbatim, at the tick
it was first seen:

```
[act4] === FIRST tier >= 2 observed at tick 26514 ===
[act4] the sample at it: {"tick":26514,"tiers":["2","2","2","2"],
  "badges":["Medium","Medium","Medium","Medium"],
  "tones":["neutral","neutral","neutral","neutral"],
  "highRisk":"0","incidentsChip":"0", "alerts":"A fight has broken out ... Day 10 ..."}
[act4] full rows at that moment: [{"name":"Hana Okafor","badgeText":"Medium",
  "badgeTitle":null,"badgeTone":"neutral","badgeAriaLabel":null,"rowTitle":null,
  "riskTier":"2","classificationGroup":"general-population"}, ... ]
```

### 3a. The badge does not even change colour

**This is the sharpest single finding of the pass, and it is stronger than the
brief's hypothesis.** The brief asked whether *"a badge silently changes
colour"*. It does not change colour at all: `badgeTone` is `neutral` on every
`Medium` row, which is the same tone a `Minimal` or `Low` row carries.

**READ, and it is by design rather than an oversight.**
`describePrisonerRow` splits the badge into a word and a tone, and the tone is
the *classification group*, not the tier
(`src/ui/hud/regime-panel.ts:196-201`: *"a tier moving 1 -> 2 changes the word
while a prisoner is still on the general-population timetable, and the tone
changes on the move that actually changes their day"*).
`classificationGroupIdForTier` is `riskTier >= 3`
(`src/simulation/prisoners/classification.ts:57`), and
`ClassificationEarlyWarningSystem` is capped at `EARLY_WARNING_TIER_CEILING`
(2) precisely so that it can never move a regime
(`src/simulation/prisoners/classification-early-warning-system.ts:161-168`).

So the two decisions compose into a state neither author was choosing: **#788
introduces a warning, and the layer that would show a warning is bound to a
fact the warning is forbidden to change.** The whole of the change a player can
see is one word in a small badge going from `Low` to `Medium`, in a panel four
rows deep on a tab they may not have open.

### 3b. Nothing else on the screen moves — measured as a diff, not asserted

The act recorded every *distinct* screen state as a key over the tiers, the
badge words, the tones, the `HIGH RISK` value, the `INCIDENTS` value and the
alerts text. Across ticks 26,514 to 29,612 — **3,098 ticks, 1.3 in-game days,
with eleven prisoners at `Medium`** — it recorded exactly **one** state:

```
[act4] every distinct screen state, in ticks:
t26514: [["2","2","2","2"],["Medium",...],["neutral",...],"0","A fight ... ","0"]
[act4] first tier >= 2 at tick: 26514
[act4] final counts: {"tick":29612, ... "prisonersHighRisk":0 ... }
[act4] high-risk chip at the end: {"value":"0","title":null,"srText":""}
```

- **The `HIGH RISK` chip stays `0`.** Correct and READ:
  `prisonersHighRisk` is `riskTier >= 3`, so a tier-2 prisoner is invisible to
  it by construction. The strip has no counter that a `Medium` can move.
- **The `INCIDENTS` chip reads `0` / `Clear`** at the same moment the alerts
  column says a riot broke out on Day 11 — because the riot has closed. So the
  strip carries no trace of the evidence the tier was raised *from*, either.
- **The alerts column names the incidents and never names the tier change.**
  It read, at the `Medium` tick and unchanged 3,098 ticks later:
  *"A fight has broken out between two prisoners. Day 10"*,
  *"A riot has broken out — 11 prisoners have stopped taking orders. Day 11"*,
  *"The prison is under control again — no incident is still open. 2× Day 12"*.
  Eleven prisoners were reclassified between Day 11 and Day 12 and the channel
  whose job is to say what happened says nothing about it.

### 3c. There is no way for a player to learn why, and the press was verified

Three things a player could try, each measured rather than assumed:

```
[act4] under the first roster row's centre (1136,572.4296875):
  [{"tag":"DIV","cls":"hud-regime__roster-need","pointerEvents":"auto"},
   {"tag":"DIV","cls":"hud-regime__roster-line",...},
   {"tag":"SPAN","cls":"ui-value hud-regime__roster-name",...}, ...]
[act4] after hovering the row for 700 ms, the badge's title is still null
[act4] pressing the row produced 0 command(s)
```

The `elementsFromPoint` read is the point: **the press landed inside the row**,
on `hud-regime__roster-need`, and produced nothing — so "the row is not
interactive" is a fact about the row and not about a click that missed. Hovering
adds no `title`. `badgeAriaLabel` and `rowTitle` are `null` on every row, so a
screen reader gets the bare word too.

**READ, and it confirms the shape rather than the count.**
`createStatusBadge` sets exactly two things — `root.dataset['tone']` and
`label.textContent` (`src/ui/primitives/status-badge.ts:40-41`) — and there is
no `title`, `aria-label` or `aria-describedby` anywhere in the primitive. Its
own docblock's reasoning is sound as far as it goes (*"a badge always carries a
word, so a red-green colour-blind player, a monochrome display and a screen
reader all get the same information"*) — but the information all three get is
the word `Medium`, and the word is not defined anywhere in the game.
`docs/research/2026-09-01-playing-the-people-surface.md` §1a found the same
absence for `Minimal`/`Low`; what is new is that a word now *arrives*, as a
warning, and arriving is the case where an unexplained word costs the player
something.

And the Regime panel has no control at all to press: grepping every
`hud-regime__*` class name finds twenty-one, all of them values, rows,
headers, notes and progress bars, and not one button.

### 3d. What the roster row actually said, in full

```
PRISONERS
4 of 11
Hana Okafor / Association / Safety / Medium
Ursula Rossi / Association / Safety / Medium
Viktor Rossi / Idle / Bladder / Medium
Lena Farkas / Idle / Bladder / Medium
and 7 more
```

Four rows of eleven (`PRISONER_ROSTER_ROW_LIMIT` is 4,
`src/ui/hud/regime-panel.ts:174`), so seven of the eleven `Medium` prisoners are
not on screen at all. The row's other two words are the current activity and
the *lowest need* — `Safety` and `Bladder` — which are, as it happens, the two
facts that caused the tier change, sitting on the same line as the badge with
nothing connecting them.

### 3e. What is owed, and to whom

**The copy is the owner's** under `AGENTS.md` exclusion 4, and this pass wrote
none of it. What is owed is at least one of:

1. **A sentence on the badge** saying what `Medium` means, as a `title` and an
   accessible name. This is the open second half of #788.
2. **A sentence in the alerts column** when a tier is raised, so the channel
   that already narrates the riot narrates its consequence.
3. **A decision about the tone**, which is not copy and *is* a design call:
   whether a tier a player is meant to read as a warning may share
   `Minimal`'s colour. `describePrisonerRow`'s reasoning ties tone to the
   regime deliberately; #788 introduces the first tier change that is meant to
   be noticed and cannot move the regime. Somebody has to say which rule wins.
4. **A number for the `HIGH RISK` chip, or a second chip**, if a prison-wide
   count of warnings is wanted at all. `src/ui/hud/projection.ts:783-790`
   declines a tone for that chip for a stated reason that survives; it does not
   decide whether tier 2 should be counted anywhere on the strip.

**Owed to: the owner.** Options 1 and 2 are copy; 3 and 4 are design.
