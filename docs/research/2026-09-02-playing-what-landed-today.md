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

Each act builds its own prison with the mouse and is runnable alone with
`-g "act N"`. The standalone cost is wall clock and is reported for planning
only; nothing below is derived from it.

| Act | What it played | Result | Standalone cost |
| --- | --- | --- | --- |
| 1 | four hires on an empty prison; render-delta positions and roster phases over 460 ticks at ×1 | `1 passed (1.3m)` | 79s |
| 2 | Admit three times on a prison with no cell, then a cell and 24 admissions; the Regime roster's badges against the incidents and contraband chips | `1 passed (5.1m)` | 301s |
| 3, first run | a sealed cell, six residents, three guards; 2,051 ticks at ×1 across three sweep boundaries | `1 passed (9.6m)` | 574s |
| 3, second run | the same plus phase 2: a Release press and 400 ticks after it | `1 passed (11.2m)` | 666s |
| 4 | the neglect fixture played: beds, no toilet, no guards, twelve admissions, to the first `Medium` and 2,400 ticks past it | `1 passed (8.6m)` | 511s |

Two runs were **stopped rather than reported**: act 4's first, once its own
`elementsFromPoint` read showed the west wall landing on `.hud-minimap` (§4),
because everything downstream would have measured an unenclosed cell; and one
duplicate act-2 invocation that raced another into the same log file, which is
`docs/AGENT_WORKFLOW.md`'s shared-scratchpad trap and mine to have avoided.

---

## The two answers, before the evidence

**Can a player see a guard walk? No — not rarely, not briefly: not at all in
any prison this pass could build.** Across three prisons, six completed
contraband sweeps, one press of the only control that should break it, and
4,978 ticks of dedicated sampling on the render channel the renderer draws
from, **not one of 7,945 guard records carried a velocity or an off-tile
position.** The
reason is not that the walk is too fast to see. Of the three routes into a
walk, two are structurally unreachable in a session a player can start — a
hire already stands on the post tile it is deployed to (§1), and no sector has
a patrol route (§1a) — and the third needs a staffing shortage to coincide with
a spare guard standing somewhere other than the post, which nothing in
ordinary play arranges (§2c). `Travelling` never appeared on the roster;
`On Search` appeared seven times, and every one of its legs was a teleport of
six tiles in two or three ticks (§2b). **The honest input to the question ADR
0088 left open is therefore not "how often" but "under what condition at
all".** §2f is where this pass's own attempt to force one fell short, and §9 is
what would change my mind.

What #740 did buy is real and is not diminished by that: the vocabulary now
names states that exist, the mechanism is wired and order-pinned, and ADR
0077's edge re-validation reaches guards. What is not true is any sentence
implying a player will watch it happen.

**What does a player see when `Medium` arrives, and can they act on it? One
word changes in a badge four rows deep on a tab they may not have open, and
nothing else on the screen moves — not even the badge's colour.** Measured on
the neglect fixture played with the mouse: eleven prisoners reached tier 2 at
tick 26,514, `badgeTone` stayed `neutral` — the same tone `Minimal` carries —
the `HIGH RISK` chip stayed `0` (it counts `riskTier >= 3` by construction),
the `INCIDENTS` chip read `Clear`, and the alerts column narrated the riot that
caused the reclassification and never mentioned the reclassification. Across
3,098 further ticks the act recorded exactly **one** distinct screen state.
Hovering the row adds no `title`; pressing it produced zero commands with the
press verified inside the row; the Regime panel has no control at all. So the
answer to "can they act on it" is that they cannot even learn what it means
(§3).

**And the ~18-in-game-day warning window is a property of #788's fixture, not
of the game.** Played on a prison built badly — 24 arrivals against six beds,
no staff — **every one of the 24 read `Medium` by in-game day 6** (§3f). The
roster is ordered by descending tier, so when every tier is equal the ordering
carries no information either, and the four rows on screen are just the four
lowest entity ids of twenty-four. Nothing about ADR 0090 is wrong here; what is
wrong is reading one fixture's ticks as the pacing.

**The sharpest thing in §3 is not a missing sentence, it is two sound decisions
composing badly.** `describePrisonerRow` ties the badge's *tone* to the
classification group deliberately, and `ClassificationEarlyWarningSystem` is
capped at `Medium` precisely so it can never move a group. So #788 introduces
the game's first tier change that is meant to be noticed, into the one layer
that is bound to a fact it is forbidden to change. That is a design call, not a
bug in either change, and it is item 3 of §10.

**And one defect neither feature owns.** `.hud-minimap` does not merely swallow
a click: at 1280×800 it makes four world tiles genuinely **unbuildable** — a
drag drops exactly the segments whose screen points fall inside it and keeps
the ones outside, and single presses on them reach the panel too (§4). Third
sighting, first with the cause read off `elementsFromPoint` per tile rather
than argued from load.

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

### 2b. Played: three complete sweeps, four teleports, and not one walked step

**MEASURED, act 3** — `1 passed (9.6m)`, 574s standalone. A sealed, zoned 6×6
cell at (14,12)-(19,17), six admissions (five housed, one waiting), three
guards, sampled from tick **25,943 to 27,994** at ×1 — 2,051 ticks, which
spans three 600-tick sweep boundaries.

The roster, every change, in ticks:

```
t25963: On Post // Unassigned // Unassigned
t26396: On Post // On Search  // Unassigned
t26552: On Post // Unassigned // Unassigned
t27001: On Post // On Search  // Unassigned
t27139: On Post // Unassigned // Unassigned
t27593: On Post // On Search  // Unassigned
t27715: On Post // Unassigned // Unassigned
[act3] phases seen with tick ranges: [["On Post",{"count":36,...}],
  ["On Search",{"count":7,"firstTick":26396,"lastTick":27653}],
  ["Unassigned",{"count":65,...}]]
```

Three complete sweeps. And on the channel the renderer draws from:

```
[act3] render-delta samples in the window: 982 (of 3974 since page load)
[act3] guard 0: 982 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act3] guard 1: 982 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act3]   guard 1 t26500 (14,12) -> t26502 (16,16): 6.000 tile(s) in 2 tick(s); walking could cover 1.0 -> TELEPORT
[act3]   guard 1 t27009 (16,16) -> t27011 (14,12): 6.000 tile(s) in 2 tick(s); walking could cover 1.0 -> TELEPORT
[act3]   guard 1 t27640 (14,12) -> t27643 (16,16): 6.000 tile(s) in 3 tick(s); walking could cover 1.5 -> TELEPORT
[act3]   guard 1 t27680 (16,16) -> t27682 (14,12): 6.000 tile(s) in 2 tick(s); walking could cover 1.0 -> TELEPORT
[act3] guard 2: 982 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act3] walk episodes: []
```

**2,946 guard records. Four position changes, every one of them six tiles in
two or three ticks — against the one tile per two ticks a walk can cover — and
zero samples with a velocity or an off-tile position.** The teleport/walk
threshold here is arithmetic on ticks, not a judgement: `6 > 3/2`.

`Travelling` never appeared on the roster. `On Search` did, seven times.

### 2c. Why, and it is not a bug in #740

The cause is in act 3's own roster timeline, and every step is READ:

- **The posted guard is never sent searching.**
  `claimableGuardIds(this.guards)` filters `source.unassignedGuardIds()`
  (`src/simulation/security/post-eligibility.ts:107`), and
  `unassignedGuardIds()` is *"`'unassigned'` only"*
  (`src/simulation/security/guard-roster.ts:236-238`) — a decision
  `guard-roster.ts:13-17` records deliberately, because it is what let search
  duty ship without touching `deployment-system.ts`. So the guard that reads
  `On Post` for the whole window never leaves its post, and
  `walkBackToPost` never has any distance to cross.
- **The spare that does the searching has no post to walk back to.** A
  finished sweep calls `this.guards.unassign(guardId)`
  (`src/simulation/contraband/search-system.ts:324`), and
  `DeploymentSystem.assignUnassignedGuards` draws from the pool only while
  `required - assigned > 0`. Six residents ask for exactly one guard:
  `resolveOccupancyScaledGuardCount` is
  `max(scheduled, ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD))` with
  that constant at 8 (`src/simulation/security/sector-staffing.ts:147`, `:190`)
  and the schedule's floor at 1. So the shortage is zero, and two guards stand
  `Unassigned` on whatever tile the last search left them — for ever.

**So the walk ADR 0088 built is gated on a shortage arising while a spare
happens to be standing away from the post.** In ordinary play a shortage
arises when occupancy crosses a multiple of eight, or when the player dismisses
or releases the posted guard. Nothing else moves it.

### 2d. The answer to the brief's question, plainly

**Across every act in this pass — 4,978 ticks of dedicated sampling and 2,700
render-delta publications carrying 7,945 guard records — a guard walked zero
times.** The arithmetic, so it can be checked: 460 + 2,051 + 2,067 + 400 ticks;
565 + 982 + 950 + 203 publications; 1,540 + 2,946 + 2,850 + 609 records. Act 1: an empty prison, four hires, 460 ticks, zero. Act 3 first run:
a staffed six-resident prison, three completed contraband sweeps, 2,051 ticks,
zero, with four teleports of six tiles in two or three ticks. Act 3 second run:
a three-resident prison, three more sweeps, 2,067 ticks, zero, and no position
change at all. Act 3 phase 2: a Release press, 400 ticks, zero (§2f, with its
own limit stated).

So: **a player cannot see a guard walk in a prison they can build in a starter
session, at any speed, and it is not because the walk is too fast to see.**
There is no walk. `Travelling` should indeed stay rarely seen, as the owner was
told — but the reason is not that the walk is brief; it is that of the three
routes into a walk, two are structurally unreachable (a hire is already on its
post; no sector has a patrol route) and the third needs a staffing shortage to
coincide with a spare guard standing somewhere else.

**What ADR 0088 bought, stated fairly, because this is not a negative result
about the change:** the vocabulary is now honest (`Travelling` names a real
state, and `Returning` names a real walk), the mechanism is wired and pinned
(`createGuardLocomotionSystem` at order 201, `LocomotionSystem`'s order made a
constructor parameter, `tests/determinism/kernel-system-order.test.ts` holding
it), and the re-validation-at-the-edge rule reaches guards
(`src/simulation/security/guard-locomotion.ts:64`). None of that is undone by
there being nothing to watch yet. What is not true is any sentence implying a
player will see it.

### 2e. Does the walk path go around walls or through them? Not answerable from any prison a player can build

**Not measured, and the reason is structural rather than a gap in effort.**
Every tile a guard can be sent to in a starter session is inside the single
room that also contains the post tile, because both `HireStaff` and
`AdmitPrisoner` arrive at (16,16) and a cell that does not contain (16,16)
houses nobody (§4's fixture note). A walk inside one open room crosses no wall
edge, so no `canTraverseEdge` call can be observed refusing one.

What *is* READ: the predicate is asked once per tile crossed rather than once
per tick, with the walking guard's own staff role as the route context
(`src/simulation/security/guard-locomotion.ts:64`), which is ADR 0077's rule
reaching guards. And the *teleports* above cross the cell wall freely —
`SearchSystem` writes `guards.setTile` directly — which is correct per ADR
0059's deadline reasoning and is worth naming because it is what a player
would see if guards were drawn moving: a guard appearing inside a sealed cell.

### 2f. The one gesture that should have produced a walk did not — and the run cannot say whether the gesture or the fixture is why

**MEASURED, act 3's second run, phase 2** — `1 passed (11.2m)`, 666s standalone.
Same fixture, a fresh prison and a fresh master seed: three residents (six
Admit presses, three landed), three guards, sampled tick **27,745 to 29,812**
at ×1 across three more complete sweeps, then Release pressed at tick
**30,097** and 400 ticks sampled after it.

Phase 1 of the second run reproduced phase 1 of the first exactly:

```
t27792: On Post // Unassigned // Unassigned
t28224: On Post // On Search  // Unassigned      t28281: back to Unassigned
t28829: On Post // On Search  // Unassigned      t28890: back to Unassigned
t29397: On Post // On Search  // Unassigned      t29519: back to Unassigned
[act3] guard 0/1/2: 950 delta sample(s) each, 0 with a non-zero velocity, 0 not on a tile centre
[act3] walk episodes: []
```

— and this time with **no position change at all**, not even a teleport: every
guard was published on one tile for the whole 2,067 ticks. With three residents
all housed and all arriving at (16,16), the sweep's targets resolved to the
tile the searching guard was already standing on.

Then the Release press, with the target verified first:

```
[act3] under the Release control's centre: [{"tag":"SPAN","cls":"ui-action__label",...},
  {"tag":"BUTTON","cls":"ui-action","pointerEvents":"auto"},
  {"tag":"DIV","cls":"hud-staff__held-row",...}, ...]
[act3] pressed Release at tick 30097; held panel now
  "ON DUTY / 1 held · 2 free / Guard · Sector Post / Release / ..."
[act3] phase 2 roster changes over 400 ticks after Release:
t30268: On Post // Unassigned // Unassigned
[act3p2] guard 0/1/2: 203 delta sample(s) each, 0 with a non-zero velocity, 0 not on a tile centre
[act3] phase 2 walk episodes: []
```

**No walk. And two readings of that, only one of which this run can support.**

- **What is established:** across 400 ticks after a verified press on the
  Release control, 609 guard records carried no velocity and no off-tile
  position, and the ON DUTY panel and the roster were byte-identical before and
  after. To a player, pressing Release did nothing visible.
- **What is NOT established, and this is the honest limit:** whether Release
  *can* produce a walk. The precondition §2c identifies — a spare standing
  **away** from the post — was absent in this run, which its own zero position
  changes prove: all three guards were on (16,16) throughout. Re-posting a
  guard that is already on the post is `beginDeployment`'s `isAtPost` fast path,
  so no route could have been requested whichever guard the cycle picked.
- **A third possibility this run cannot separate from the other two**: that the
  released guard was re-posted within `DeploymentSystem`'s 10-tick cycle, which
  is faster than the roster's ~250 ms heartbeat, so the panel never had a state
  to show. Distinguishing it needs the submitted `ReleaseGuard` command read off
  the worker tee, which this act does not log. **Named as unreached.**

So the tally over both runs of act 3 and act 1 together — **2,700
render-delta publications, six completed contraband sweeps, one Release press,
4,978 ticks of dedicated sampling, zero walked steps** — is a strong negative
result about *ordinary* play and an incomplete one about the one gesture that
should break it.

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
(`src/simulation/prisoners/classification.ts:59`), and
`ClassificationEarlyWarningSystem` is capped at `EARLY_WARNING_TIER_CEILING`
(2) precisely so that it can never move a regime
(`src/simulation/prisoners/classification-early-warning-system.ts:151`, and its own comment at `:158-168`: *"this write can never move a prisoner's regime, only their published tier"*).

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
   count of warnings is wanted at all. `src/ui/hud/projection.ts:785-792`
   declines a tone for that chip for a stated reason that survives; it does not
   decide whether tier 2 should be counted anywhere on the strip.

**Owed to: the owner.** Options 1 and 2 are copy; 3 and 4 are design.

### 3f. Act 2 tried to catch a `Medium` that intake wrote, and could not — and found something else

**MEASURED, act 2** — `1 passed (5.1m)`, 301s standalone, after two earlier
invocations that produced nothing usable (§"What each act cost"). A sealed
zoned cell with six usable beds, 24 Admit presses (all 24 landed; six housed,
eighteen waiting), no guards, paused at tick 15,537:

```
[act2] Regime roster rows on screen (4 of 24 admitted; PRISONER_ROSTER_ROW_LIMIT is 4):
  [{"name":"Wanda Tamm","badgeText":"Medium","badgeTitle":null,"badgeTone":"neutral",
    "badgeAriaLabel":null,"rowTitle":null,"riskTier":"2",
    "classificationGroup":"general-population"}, ... all four identical ... ]
[act2] distinct badge words: ["Medium"]     [act2] distinct tiers: ["2"]
[act2] high-risk chip: {"value":"0",...}    [act2] prisoners chip: {"value":"24",...}
[act2] incidents chip: {"value":"1",...}    [act2] contraband chip: {"value":"0",...}
[act2] badge titles: [null,null,null,null]; badge aria-labels: [null,null,null,null];
  row titles: [null,null,null,null]
```

**The act's own attribution test fails, and that is reported rather than
glossed.** The design was: with the incidents and contraband chips both at
zero there is no disciplinary evidence, so `reviewClassification`'s `findings`
term is 0, the early warning's ceiling is tier 1, and a `Medium` on screen must
be `classifyPrisoner`'s. **The incidents chip read `1`.** The alerts column
says why — *"A fight has broken out between two prisoners. 2× Day 6"*, *"A riot
has broken out — 24 prisoners have stopped taking orders. Day 7"* — so 24
prisoners against six beds and no guards rioted before this act could read the
roster, and the early warning had evidence to work with. **So this pass did not
measure a `Medium` written at intake.** That claim stays READ, from
`classifyPrisoner`'s arithmetic and `src/main.ts`'s own docblock (§5b), and is
not upgraded.

**What the act did find instead is worth more than what it was looking for.**

- **Every one of the 24 prisoners reads `Medium`, by in-game day 6.** Not a
  waypoint one prisoner passes: a uniform label. `projectPrisonerRoster` orders
  the roster `(descending riskTier, ascending entity index)` — the ordering
  `src/ui/hud/regime-panel.ts:168` calls *"a total order over state"* — so when
  every tier is equal the ordering carries no information either, and the four
  rows a player sees are just the four lowest entity ids of twenty-four.
- **#788's ~18-in-game-day warning window is a property of its fixture, not of
  the game.** The integration test measures `Medium` at 4,800 and `High` at
  48,000 on eight residents in eight one-bed cells. Played on a prison a player
  can build badly — 24 arrivals, six beds, no staff — `Medium` is on every row
  by day 6, which is act 4's tick 26,514 finding at a different pace again
  (eleven prisoners, twelve admissions, eight beds). **The tier arrives when
  the neglect does**, and neither number generalises. Nothing about ADR 0090 is
  wrong here; what is wrong is treating one fixture's ticks as the pacing.
- **The badge is still bare at 24 rows as it was at 4**: `badgeTitle`,
  `badgeAriaLabel` and `rowTitle` all `null`, tone `neutral`, on every row.
- **And the refusal band disagreed with itself between two runs of this act.**
  In the run that timed out it read `.hud__refusal: not laid out` after 24
  presses; in this one, *"The object was not placed — something is already
  standing there."* — a bed-placement refusal from around tick 7,600, still on
  screen at 15,537, through 24 successful admissions, a fight and a riot.
  Reported as an observation with no cause attached: what supersedes a refusal
  is keyed (`refusals.supersede`), so a successful *admission* plausibly does
  not displace a refused *object placement* — but this pass did not read the
  supersession keys and does not claim that. §7 carries the correction this
  produced.

## §4 — `.hud-minimap` does not merely swallow a click; it makes four world tiles unbuildable, and the drag over it fails silently

**This is the one finding in this pass that is a defect claim, and it is not
about either feature.** It is here rather than in a footnote because it cost
two runs of this pass and because it is a third independent sighting of a
panel that has twice been ruled *"not a defect claim — the camera pans"*.

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

## §4b — Admit on a prison with no cell: three presses, three refusals, and the control never disables itself

**MEASURED, act 2 phase 1**, verbatim, with the press verified before it was
made:

```
[act2] under the Admit control's centre: [{"tag":"SPAN","cls":"ui-action__label",...},
  {"tag":"BUTTON","cls":"ui-action hud-intake__admit","pointerEvents":"auto"}, ...]
[act2] no-cell Admit press 1: disabled=null | refusal band "Nobody was admitted — the request was refused."
  | event notice ".hud__event: not laid out" | alerts "No active alerts" | prisoners 0
[act2] no-cell Admit press 2: disabled=null | ... identical ...
[act2] no-cell Admit press 3: disabled=null | ... identical ...
[act2] intake panel after three refused presses: "INTAKE / Collapse / Admit a prisoner /
  A prison needs a cell before it can admit anyone. It does not need a free bed:
  an arrival with none waits until a bed is free."
```

This is a corroboration rather than a new finding, and the corroborating half
is what is new. `docs/research/2026-09-02-the-first-five-minutes.md` already
established the sentence — *"the first refusal a new player is likely to see
says nothing"*, `"Nobody was admitted — the request was refused"` against a
`main.ts` `Error` that ADR 0011 keeps off screen. What this adds:

- **`disabled` is `null` on all three presses.** #772 taught the Buy control to
  disable itself when a press would be refused — and CI's `browser` job caught
  three `app-shell.spec.ts` tests that press Buy deliberately, which is on
  record in `docs/AGENT_WORKFLOW.md`. Admit did not get the same treatment, so
  the two controls one tab apart now behave differently about a press that
  cannot succeed. Whether they should is item 7 in §10.
- **The panel's own hint is right there and says exactly why**: *"A prison needs
  a cell before it can admit anyone."* So the information exists on the same
  panel as the control; it is the *refusal* that does not use it.
- **Nothing reaches the alerts column** — `"No active alerts"` through all
  three — and `.hud__event` is not laid out. The refusal band is the only
  channel, and §7 is where what that band then does is measured in both
  directions.
- **The sentence the player never sees exists and is specific.** The page
  console carried, on each of the three presses:
  `HUD action failed {"actionId":"admit-prisoner","error":{"name":"Error",
  "message":"This prison has no room to hold a prisoner, so nobody can be
  admitted into it."` — thrown at `src/main.ts:2710`. ADR 0011 keeps it off
  screen deliberately; this pass adds only that it was captured verbatim from a
  real run rather than read off the source.
- **And a second refusal nobody has named.** Four of the 24 presses in this
  act's *second* prison failed with
  `"The simulation has not reported its command sequence yet; try again in a
  moment."` (`src/ui/simulation-commands.ts:252`; the browser stack said `:167`, which is the served module offset and not the throw), which is why 24 presses
  produced 20 prisoners. The player is told the same generic sentence for a
  transient race as for a structural refusal. Reported as an observation: what
  the player should be told about it is copy, and copy is the owner's.

**Not a defect claim about #788 or #740.** It is here because act 2's first
version admitted 24 times into a prison with no cell and got `prisoners: 0`,
and measuring why was cheaper than working around it.

## §5 — Corrections, in both directions

### 5a. Three corrections to this pass's own brief

1. **There is no `--suite playtest`.** Stated at length under "Reproduction"
   above. The brief said to *"check `run-suite.ts` for the exact suite name for
   playtests"*; the answer is that a playtest is not drivable from that wrapper
   at all, by decision, and there is a foundation contract holding the
   exclusion in writing.
2. **The brief's first reference model, a 2026-09-02 playtest named
   *the-clock*, was not in the tree at this branch's point — and landed on
   `main` while this pass ran. Both directions are marked rather than one
   overwritten.** At `0e2eb7fb`, `ls tests/browser/*.playtest.ts` listed 26
   files, two of them dated 2026-09-02 (*the-first-five-minutes* and
   *the-world-view*), and `tests/browser/ui-clock-paused-readout.spec.ts` was
   the only clock-named file in the directory; so the brief named a file that
   did not exist and this pass matched the two that did, plus
   `tests/browser/playtest-2026-09-01-the-people.playtest.ts` and
   `tests/browser/playtest-740-does-a-guard-walk.playtest.ts`. **`4bce0888`
   ("Playing the clock — Play is the ×1 button …", #801) merged to `main` at
   09:51 the same day** and added
   `tests/browser/playtest-2026-09-02-the-clock.playtest.ts`, so the brief was
   describing work in flight rather than a file that never existed. The
   correction is kept because "the file is missing" and "the file arrived two
   hours later" are different facts and only the second is fair to the brief.

   **And it carries a handover for this file.** That commit's first change
   *exports* `buildResilientCell` and `wallSide` from
   `tests/browser/playtest-2026-09-01-the-people.playtest.ts` so the clock
   playtest can reuse them. Nothing was exported at `0e2eb7fb`, so this
   instrument wrote its own leaner `wallSide` and its own
   `buildSealedCell` — which is now duplication rather than necessity, and
   this one adds two things the shared pair does not have: a `withToilet: false`
   mode (the neglect fixture) and `cellShiftClearing`'s clamp keeping tile
   (16,16) inside the room. **Handed over:** whoever next touches these should
   fold those two into the exported helper and delete this file's copy.
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

## §7 — Three things confirmed CORRECT, which is a result

1. **`ClassificationEarlyWarningSystem` does what ADR 0090 says it does, played
   rather than unit-tested.** Act 4 reached tier 2 on eleven prisoners, every
   `classificationGroup` still `general-population`, `prisonersHighRisk` still
   0, and no row ever read `High` inside the 3,098 ticks after it. The cap
   holds through the browser, the worker, the projection and the DOM, not only
   in the kernel fixture.
2. **The incident channel works and narrates in order.** The alerts column
   carried, in the order a player reads it: a fight on Day 10, a riot on Day 11
   (*"11 prisoners have stopped taking orders"*), and *"The prison is under
   control again — no incident is still open"* on Day 12 with a `2×` occurrence
   count. That is #703 ruling 13's shape working on a prison nobody scripted.
3. **The empty-sector exemption is right, and the panel says the right thing.**
   Four hires on an empty prison read `0 of 0 / Covered / This prison has the
   guards it asks for` — #533's rule, and the sentence is true.

And one thing confirmed for the third time — **with a correction to how this
section first stated it**. `docs/research/2026-09-01-playing-the-rooms-surface.md`
found that `.hud__refusal` keeps a stale refusal and
`docs/research/2026-09-02-the-first-five-minutes.md` reproduced it as the
ordinary shape of play. This pass adds a tick distance: at tick 26,514 act 4's
band still read *"The object was not placed — something is already standing
there."*, a refusal produced by a bed press around tick 17,700 — about
**8,800 ticks**, three and a half in-game days, a riot, a fight and eleven
reclassifications earlier.

**This section originally called that "indefinitely", and act 2 refutes the
word.** After 24 Admit presses — four of which the console shows being
refused — act 2's band read `.hud__refusal: not laid out`, meaning hidden. So
the band is not a one-way latch: it clears. What act 4 shows is that a refusal
stays until *something supersedes it*, and in act 4 the refused presses were
the last of their kind, so nothing did for 8,800 ticks. Both readings are kept
because the stronger one is the one that would have been quoted.

## §8 — Two measurements this pass could not explain, reported as measurements

**A measurement is not a diagnosis** (`docs/AGENT_WORKFLOW.md` §3), so these
are stated with what would settle them and no cause attached.

1. **Bed orders do not always all become beds, and it is run-to-run rather
   than systematic — which is a correction to what this section first said.**
   Act 3's first run pressed six beds along row 12, all six produced a
   `PlaceObject` command, and the counts read
   `roomCapacity=5 accommodationCapacity=5`. This section originally reported
   that as one bed reliably going missing. **Act 3's second run, same fixture,
   same footprint, read `roomCapacity=6 accommodationCapacity=6`** — so six of
   six landed, and the earlier five was not a property of the fixture.
   Act 4 pressed eight (six along row 12, two along row 13), one produced no
   command at all (below), and the counts read `4`. `bed-wooden` is a `1×2`
   buildable (`src/simulation/construction/definition.ts:283` states
   *"`bed-wooden` is `1x2`, width 1, height 2"*), so a bed anchored on row 12
   occupies rows 12 and 13, act 4's two row-13 presses were refused, and act
   4's own refusal band confirms it: *"something is already standing there"*.
   That accounts for all of act 4 and leaves **one run of one act** with an
   unexplained missing bed. **What would settle it:** the refusal log read per
   press rather than at the end, which this pass did not do. Marked in both
   directions rather than overwritten, because a tally in a research note is
   exactly the sentence `docs/AGENT_WORKFLOW.md` §4 says rots first.
2. **One bed press on an in-room tile produced no command, with the canvas
   under it.** Verbatim: `bed at (19,12) produced NO command; under it:
   [{"tag":"CANVAS","cls":"","pointerEvents":"auto"}, ...]`. So this is not
   §4's panel: the press reached the world canvas and the host submitted
   nothing. **What would settle it:** the Build panel's arm label and pending
   material stock read immediately before that press. Not measured.

Neither is claimed as a defect and neither touches either feature.

## §9 — This pass's own weakest claim, and what would change my mind

**The weakest claim is §2d: "a guard walked zero times, so a player cannot see
one."** Two things could make it wrong, and one of them is cheap to test.

**The gap that matters, and §2f half-closed it and half did not.** "Zero walks
in 4,978 sampled ticks" is a statement about three prisons — an empty one, a
six-resident one and a three-resident one, each played once on its own random
master seed. §2c names the route into a walk: a staffing shortage arising while
a spare guard stands **away** from its post. Act 3's phase 2 pressed the one
control that manufactures the shortage — Release, on the ON DUTY row — and got
no walk. But **that run had no spare standing away from the post**, which its
own zero position changes prove, so it does not settle the question; it only
shows that the gesture did not produce one there, and why it could not have.

So what is established is *"no walk happens by itself, and pressing Release
with every guard already on the post produces none"*. What is **not**
established is *"no walk is possible"*.

**What would change my mind, in order of cost:**

1. A run that gets a spare guard genuinely off-post first — a sweep whose
   target is a prisoner standing somewhere other than the arrival tile, which
   act 3's *first* run did get (its four teleports between (14,12) and (16,16)
   are exactly that state) — and *then* presses Release. That combination is
   one act away and this pass did not manage to get both in the same run.
2. A prison grown past eight residents so `resolveOccupancyScaledGuardCount`
   raises the requirement while a spare is away. A longer act; not attempted.
3. Reading the submitted `ReleaseGuard` command off the worker tee, which would
   at least separate "Release did nothing" from "Release worked and the guard
   was re-posted inside `DeploymentSystem`'s 10-tick cycle". Cheapest of the
   three and the one this act should have carried.

If any of them produces a walk, §2d weakens to *"a player who never manages to
coincide a staffing shortage with a spare guard standing elsewhere sees no
guard walk"* — still a real answer to ADR 0088's open question, and a narrower
one.

**The second weakness is one I cannot close from this repository.** Everything
about *how a walk reads on screen* — movement or glitch — is inferred from the
render channel and from `tests/browser/actor-guard-rendering.spec.ts` proving a
guard sprite is drawn from the guard atlas. **This pass never watched a guard
move**, so it has no opinion at all on whether ten tiles a second reads as
walking or as sliding. The constant's own docblock says 640 px/s is *"hurried,
and the honest cost of a 2,400-tick day"*, and that judgement is untested by
anybody, including this pass.

**A fourth, and it is a claim this pass set out to make and could not.** §3f
was designed to catch a `Medium` written by `classifyPrisoner` at intake, by
reading the roster while the incidents and contraband chips were both zero. The
incidents chip read `1`: 24 prisoners against six beds rioted before the act
could read the roster, so the early warning had evidence and the attribution
collapsed. **`Medium` at intake therefore remains READ and not MEASURED** — the
arithmetic in `src/simulation/prisoners/classification.ts:84` and `src/main.ts`'s
own docblock, not an observation. What would settle it: admit into a prison with
enough beds that nothing riots, and read the roster with `incidents` at `0`.
One act, not attempted.

**A fifth, smaller one.** §3's claim that nothing else on the screen moves is a
diff over six fields — tiers, badge words, badge tones, the `HIGH RISK` value,
the `INCIDENTS` value and the alerts text. It is not a diff over the whole DOM.
A change somewhere this pass did not sample would not have been seen. The six
were chosen because they are the surfaces a player scanning for a warning would
look at, and that choice is a judgement.

## §10 — Every sentence this pass says is owed, and to whom

`AGENTS.md` exclusion 4 reserves anything that reaches a player as a promise to
the owner, and this pass wrote no player-facing copy. Collected, so nothing has
to be re-derived from the sections above:

| # | What is owed | Whose | Why it cannot be written here |
| --- | --- | --- | --- |
| 1 | A sentence explaining what `Medium` means, as a badge `title` **and** an accessible name. The open second half of #788. | Owner (copy) | It is the first thing a player reads about a prisoner they are being warned about. §3c. |
| 2 | A sentence in the alerts column when a tier is raised — the channel already narrates the riot that caused it and says nothing about the consequence. | Owner (copy) | Same exclusion, and it would be a new locale key with a new producer. §3b. |
| 3 | A decision about the **tone**: may a tier meant to read as a warning share `Minimal`'s `neutral`? `describePrisonerRow` ties tone to the regime deliberately, and #788's tier is forbidden to move a regime. | Owner (design) | Not copy, and not a bug in either change — the two decisions compose into it. §3a. |
| 4 | Whether tier 2 is counted anywhere on the status strip at all. | Owner (design) | `projection.ts:783-790` declines a *tone* for the `HIGH RISK` chip for a reason that survives; it does not decide this. §3b. |
| 5 | What, if anything, the game says when a build gesture cannot reach a tile because a panel is over it — or whether the panel should stop taking pointer events there. | Owner (design + copy) | Third sighting, first with a measured "no gesture works" rather than "a click was swallowed". §4. |
| 6 | Whether `Travelling` and `Returning` should ever be seen, now that it is measured that they are not. This is the question ADR 0088 explicitly left open, and the honest input to it is that of three routes into a walk two are structurally unreachable. | Owner (design) | It is a balance and animation call, not a correctness one. §2d. |
| 7 | Whether the Admit control should disable itself when a press would be refused, as the Buy control now does (#772) — three presses on a prison with no cell were all accepted and all refused. | Owner (design) | The same call #772 already made one control over, not extended by this pass. §4b. |

And one handover that is not the owner's:

| # | What | Whose |
| --- | --- | --- |
| 8 | `src/simulation/security/default-sector.ts:98` says *"At one, the first hire is visibly posted"*. #533's empty-sector exemption (`sector-staffing.ts:189`) made that false in an empty prison, which is every prison at the moment a player hires their first guard. Measured in §1b. | Whoever owns `src/simulation/security/` — this branch is docs-only and did not edit it |
