# The standing crowd — why twenty-eight people are on two tiles, and what it costs

**Date:** 2026-09-04
**Tree played:** `995b631f` (**v0.0.470**), in worktree
`/workspace/wt-the-standing-crowd` on branch `agent/playtest-the-standing-crowd`.
Nothing under `src/` differs from that commit — this pass is read-only on the
simulation, by its brief and in fact — and the strip's own version line confirms
the tree from inside the running page on every act: `v0.0.470 · 34f9d5e` for
acts 1 and 2 (this branch's instrument-only commit).

**Git LFS is provisioned here** — `file public/assets/actors/actor.guard.base.idle.png`
answers `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`, not
`ASCII text`. Nothing below screenshots the world or asserts anything about what
was drawn all the same: the question is a simulation question, and every
position in this record is a number the worker published.

**Question, as given:** *a play session found twenty-two prisoners and six
guards standing on two tiles — six on one, twenty-two on the other — in a prison
with a riot running and sixteen people with no bed. The drawing of that crowd
has since been fixed (#944). Nobody has established why the crowd is there. Find
out.*

---

## The verdict, in one paragraph

**The crowd is two rules, both of them decided, and the brief's arithmetic is
one body out of joint: the twenty-two on the second tile are sixteen prisoners
plus all six guards, not twenty-two prisoners.** Rule one is that a room is one
tile: `destinationTileOf` can only answer `instance.anchorTile`
(`src/simulation/prisoners/action-system.ts:199-202`) and `arrive` writes it
(`:1125-1126`), so every prisoner performing any action in one room stands on
that room's north-west corner — six beds, one tile. Rule two is that **the
arrival tile and the guard post are the same tile**: `NEW_PRISON_ORIGIN_TILE` is
`{x:16, y:16}` (`src/main.ts:621`) and
`deriveDefaultSecuritySectorPostTile` independently derives the middle of the
first owned chunk, which is also (16,16)
(`src/simulation/security/default-sector.ts:194-201`) — and that file's own
docblock calls the coincidence *"load-bearing"* and says in advance that *"the
post tile is where a homeless population accumulates."* A prisoner the prison
cannot house never resolves any action, so `beginNextAction` falls off the end
of its candidate list and writes a counter and **no position** (`:1438`); a
guard hired onto the post is already standing on it, so `beginDeployment`
returns without requesting a route
(`src/simulation/security/deployment-system.ts:206-208`), and the derived sector
has no patrol route to leave on. **Neither half needs overcrowding and neither
half needs a riot** — the crowd was complete at tick 10,111, eight thousand
ticks before the riot opened at 18,050, and the riot's cause is the same
sixteen. What it costs a player is not the picture: it is that sixteen of
twenty-two prisoners are permanently inert, drag `needsPressure` over
`hotThreshold` on their own, and are named on screen only as *"16 waiting with
no bed to sleep in"* — a sentence that is true and that does not say they have
stopped doing anything at all.

**And one thing the brief told me to check is measured false at v0.0.470.**
`2026-09-04-can-i-see-my-prison.md` §6b's *"nothing walks"* and #944 §5 are
overturned by exactly the evidence #944 §7 said would overturn them: of
**52,879 actor-samples over 22,329 ticks**, ten carried a non-zero velocity and
two carried a sub-tile position. ADR 0059's locomotion is live and visible. The
crowd is not a locomotion failure — **there is simply nowhere else to walk to,
and after tick 5,133 nobody walked again for seventeen thousand ticks.**

---

## Reproduction

`tests/browser/playtest-2026-09-04-the-standing-crowd.playtest.ts`, one act at a
time. Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5323 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-standing-crowd.playtest.ts -g "act 1"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | the reported configuration exactly — 6 beds, 22 admitted, 6 guards — run to day 10 past a riot, with both channels, the event log and a whole-run keyframe aggregate | `1 passed (5.3m)` |
| 2 | six beds and **one prisoner at a time**, a tile tally after each admission from n=1 to n=8 | (below) |
| 3 | eight prisoners, both stacks, then **every bed removed** under the six who are housed | (below) |

---

## 1. The crowd, reproduced whole at v0.0.470 — and the arithmetic corrected

**MEASURED, act 1.** The rail and the counts first, so the prison is the prison
the question is about:

```
[act1] intake panel after 22 admissions: … 16 waiting with no bed to sleep in
[act1] no-place warning data: 16
[act1] counts at tick 22029: prisoners=22 accommodationCapacity=6 roomOccupants=6 rooms=1 staff=6
```

*Channel 1*, the render-actors keyframe, at tick 10,111 — and again at 22,159,
twelve thousand ticks later:

```
[act1-early] tick 10111: 28 actor(s) on 2 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 6 prisoner(s), 1 guard(s)
    (16.00,16.00): 16 prisoner(s), 5 guard(s)

[act1-late]  tick 22159: 28 actor(s) on 2 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 6 prisoner(s), 0 guard(s)
    (16.00,16.00): 16 prisoner(s), 6 guard(s)
```

**So "twenty-two on one tile" is sixteen prisoners plus six guards.** The
brief, and #944 §1 before it, read the original *"16 prisoners plus all 6
guards on (16,16)"* as twenty-two prisoners. It is not one population and it is
not one rule: the sixteen and the six are on that tile for two different
reasons, established separately in §2 and §3 below.

*Channel 2*, the `hud/prisoner-roster` projection — a different reader over the
same component arrays, carrying the three fields that turn a position into a
reason:

```
[act1-late] 22 row(s) in 2 distinct state(s):
    16x (16,16) stage=accommodation-assignment phase=idle action=NONE accommodation=NONE
     6x (12,12) stage=completed phase=performing action=action.free-association accommodation=room.cell:12:12
```

**This is the reading the brief asked for and it is the discriminating one.**
The crowd is not "everybody doing the same thing" and it is not "everybody doing
something different and all of it ending in one place". It is **two
populations in two states**: six who are *performing* an action that resolves to
their room, and sixteen who have **no action at all** — `phase=idle`,
`action=NONE`, `accommodation=NONE`, still at `accommodation-assignment` after
ten in-game days. Both channels agreed on every tile in both readings, and the
keyframe tee rejected nothing (`{"wrongContentType":0,"undecodable":0}`).

---

## 2. Why the sixteen never move — and it is a decision, quoted

**VERIFIED, read.** Three lines are the whole of it.

1. **Admission writes the arrival tile, and nothing writes it again.**
   `PrisonerOperationsRuntime.admitPrisoner` writes `originTile` at
   `src/simulation/prisoners/prisoner-operations-runtime.ts:981-982`; the
   command carries it from `src/main.ts:2935-2936`, which reads
   `NEW_PRISON_ORIGIN_TILE` — `{ x: 16, y: 16 } as const`, `src/main.ts:621`.
   That constant's own docblock names itself the cause: *"It is now also **where
   a hired staff member first stands** (ADR 0025 decision 4) and **the tile an
   admitted prisoner arrives on** (#261 step 4) … That is honestly a placeholder
   in every use: there is no reception, no gate and no staff room in any session
   a player can start."*
2. **A prisoner with no accommodation resolves no action.** Four of the twelve
   catalogued actions target `own-accommodation` — `action.sleep`,
   `action.eat-in-cell`, `action.use-toilet` and `action.free-association`
   (`src/simulation/prisoners/actions.ts:116-129, 226-227`) — and all four
   resolve through `getAccommodation`, which answers nothing for a prisoner
   still at `accommodation-assignment`
   (`src/simulation/prisoners/intake-system.ts:565-570` is where that id is
   written, and it is written only once a `findBestAvailable` succeeds). Every
   other authored action names a room this prison has not zoned.
3. **`beginNextAction` then writes a counter and nothing else.**
   `src/simulation/prisoners/action-system.ts:1438` is
   `this.unmetDemandCycles += 1;` and it is the last statement of the method —
   no phase, no target, **no position**. The prisoner keeps the tile admission
   gave it, for ever.

**And an accepted ADR decides that this is correct.**
[ADR 0054](../adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
decision 4, on the candidate walk:

> A prisoner with **no accommodation** still exhausts the walk and still counts
> an `unmetDemandCycle`, and that is correct and deliberate: it is the one thing
> the counter can still mean, and it means "this person has nowhere to live".

ADR 0054 is *Proposed*, not accepted (`docs/adr/README.md`), so that is a
recorded decision rather than a ruled one. What **is** accepted is
[ADR 0041](../adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
(*"Accepted, 2026-08-26 — by delegation"*), whose fallback walk is the mechanism
ADR 0054 decision 4 is describing, and whose own consequence section already
knew the shape: the walk ends at an action *for a housed prisoner*, and there is
no terminal at all for an unhoused one.

**So the answer to "why are the sixteen there" is: because the code decided
they should be, and wrote it down twice before anybody measured it.**
`default-sector.ts:156-167` is the second place, and it is the more explicit:

> An admitted prisoner arrives there, and an arrival with nowhere to be housed
> *stays* there -- so **the post tile is where a homeless population
> accumulates**, which is what a responder walks to and what a player looking at
> the map sees.

---

## 3. Why the six guards never move — a second, independent rule

**VERIFIED, read, and this half is nobody's finding yet: the earlier record
(`2026-09-04-why-they-stack.md` §8) names *"a guard's stacking rule"* as what it
did not reach.**

1. **A hire is placed on (16,16).** `src/main.ts:3005-3006` sends `HireStaff`
   with `NEW_PRISON_ORIGIN_TILE`, under a comment that points at the same
   docblock: *"Where a new hire stands is not part of the gesture."*
2. **The default sector's post is derived to the same tile.**
   `deriveDefaultSecuritySectorPostTile` (`default-sector.ts:194-201`) is the
   middle of the first owned chunk; a new session owns chunk (0,0) of a 32-tile
   world, so `Math.floor(32/2)` is 16 on both axes.
3. **A guard already on the post is never routed.**
   `DeploymentSystem.beginDeployment` (`deployment-system.ts:202-215`) tests
   `isAtPost(currentTile, postTile)` and returns with the phase set to
   `'on-post'` before any route is requested.
4. **The derived sector has no patrol route to leave on.**
   `deriveDefaultSecuritySector` (`default-sector.ts:224-231`) sets
   `doorIds: []` and no `patrolRoute`, and says why: *"a derived loop would be a
   made-up path across whatever the player happens to have built. `PatrolSystem`
   therefore stays inert."*

**And an incident does not move them either, which is the part worth reporting.**
`IncidentResponseSystem.incidentTile` is
`this.sectors.requireDefinition(incident.sectorId).postTile`
(`src/simulation/incidents/response-system.ts:471-473`) — so the "location" a
responder is dispatched to, for every incident in a prison with only the derived
sector, **is the tile every guard is already standing on.**

That is [ADR 0036](../adr/0036-a-derived-default-security-sector.md)'s design
(*Accepted, 2026-08-26 — by delegation*) working exactly as decided. It is also
why, in act 1, six assaults and a riot naming all twenty-two prisoners produced
no visible movement of any guard at all.

**One guard did change tile, and it teleported.** The early reading has one
guard on (12,12) and the late reading has none; no guard ever published a
non-zero velocity in 2,644 keyframes (§5). The two systems that can move a guard
without `GuardLocomotionSystem` are `SearchSystem`, which writes
`this.guards.setTile(guardId, destination)` at
`src/simulation/contraband/search-system.ts:372`, and `IncidentResponseSystem`
at `response-system.ts:867` — and act 1's event log carries two
`contraband.discovered` events (ticks 10,280 and 12,050) around the window the
guard was away. **This is decided, not broken.**
[ADR 0088](../adr/0088-does-a-guard-walk-to-its-post.md), *"What is deliberately
out of scope"*:

> **Incident response (`response-system.ts:818`) and contraband search
> (`search-system.ts:372`) still teleport a guard on arrival.** … A riot
> response and a search both race a severity clock; converting either is a
> decision about how much slower a riot becomes containable, not a mechanical
> wiring of an existing store.

(ADR 0088's `response-system.ts:818` has drifted to `:867` at v0.0.470; the
`search-system.ts:372` citation is exact.)

---

## 4. The riot follows the crowd; the crowd does not need the riot

**MEASURED, act 1.** The crowd was complete and unchanging at **tick 10,111** —
28 actors, 2 tiles, the tally above — and the worker's own event log at that
moment held two entries and no riot:

```
[act1-early] events so far: ["tick 7451 incidents.assault-opened …","tick 8061 incidents.all-clear-after-lapse …"]
```

The riot opened **8,000 ticks later**:

```
tick 18052 incidents.riot-opened sequence=11 tick=18050 participantCount=22
tick 18661 incidents.all-clear-after-lapse sequence=12 tick=18660
```

and the tally at 22,159 is identical to the tally at 10,111. **The arrow runs
one way: no riot is needed to produce the crowd, and the riot changed nothing
about it.**

**REASONED, from measured facts, on why they share a cause.**
`needsPressure` is the mean need deficit over every prisoner standing on owned
land (`src/simulation/runtime/new-session.ts:1307-1313`), weighted `1` against a
`hotThreshold` of `0.65` (`src/simulation/incidents/sector-risk.ts:112-115`).
Sixteen of twenty-two prisoners take no action of any kind, so all six of their
needs decay with nothing to arrest them; six take actions. The same sixteen who
form the crowd are therefore the term that carries the score over the line —
which is also why hiring six guards did not prevent it: `staffingShortfall` was
zero (the strip read `COVERAGE Covered` throughout) and the riot fired anyway.
**I did not measure `needsPressure` itself** — no HUD surface publishes it and
`ActionMetrics.getMetrics()` has no caller under `src/` (#930) — so this
paragraph is an inference from three opened files and not a reading.

---

## 5. Nothing walks — overturned, with the exact evidence #944 asked for

**MEASURED, act 1, whole-run aggregate.** Every keyframe from page load, not the
last four hundred:

```
[act1] whole-run keyframe aggregate: 2644 keyframe(s) spanning ticks 1..22329; 52879 actor-sample(s);
       10 keyframe(s) and 10 actor-sample(s) with a NON-ZERO velocity;
       2 keyframe(s) and 2 actor-sample(s) with a NON-INTEGER position
[act1] first 10 moving/sub-tile sighting(s):
  tick 4649 #0 pop0 at (12.000,16.000) v=(0.000,-40.000)
  tick 4707 #1 pop0 at (13.000,16.000) v=(-40.000,0.000)
  tick 4716 #1 pop0 at (12.000,12.500) v=(0.000,-40.000)
  tick 4808 #2 pop0 at (12.500,16.000) v=(-40.000,0.000)
  tick 4885 #3 pop0 at (14.000,16.000) v=(-40.000,0.000)
  tick 4893 #3 pop0 at (12.000,14.000) v=(0.000,-40.000)
  tick 5005 #4 pop0 at (14.000,16.000) v=(-40.000,0.000)
  tick 5013 #4 pop0 at (12.000,14.000) v=(0.000,-40.000)
  tick 5125 #5 pop0 at (14.000,16.000) v=(-40.000,0.000)
  tick 5133 #5 pop0 at (12.000,14.000) v=(0.000,-40.000)
```

#944 §7 named its own weakest claim and said exactly what would overturn it:
*"one keyframe anywhere with a non-zero velocity or a sub-tile position
overturns it."* **There are ten of the first and two of the second**, and
`(12.000,12.500)` and `(12.500,16.000)` are the sub-tile positions.

**Every one of them is a prisoner** (`pop0` is
`RENDER_ACTOR_POPULATION_PRISONER`, `render-actors-payload.ts:148`) and every
one is between ticks **4,649 and 5,133** — the window right after the six beds
finished at tick 3,911 (`[act1] at tick 3911: rooms=1 roomCapacity=6
accommodationCapacity=6`), when the first six admitted walked from (16,16) to
the cell anchor. `±40` tiles a second is ADR 0059's ten tiles a second at the
×4 the clock was running: the payload's velocity is per wall-clock second and
the worker multiplies by the player's speed, so this is the shipped constant
read back through the wire.

**Why the earlier reading saw none of it, and it is arithmetic rather than
disagreement.** A walk of eight tiles is sixteen kernel ticks (ADR 0059: 128 of
256 sub-tile units a tick). The delta channel's ceiling is 100 ms, which at ×4
is about eight ticks. So six walks are about twelve sampled frames in the whole
run — twelve out of 52,879 actor-samples, or **0.02%** — and they all fall in a
500-tick window that a 400-frame ring buffer read on day 11 cannot contain.
`can-i-see-my-prison`'s window (ticks 23,758–27,291) opened *eighteen thousand
ticks after the last walk in this prison*. Its measurement was right about its
window and its inference did not survive a longer one.

**What that means for this question is the important half: locomotion works,
and the crowd is still there.** After tick 5,133, in a prison of twenty-two
prisoners and six guards, **not one actor moved for seventeen thousand ticks**,
because a housed prisoner's every action resolves to the tile they are on and an
unhoused one has no action to be sent anywhere by.

---

## 6. What it costs a player

**JUDGEMENT, grounded in §1–§4.** Three things, in the order a player meets
them.

1. **Sixteen people are inert and nothing says so.** The rail says *"16 waiting
   with no bed to sleep in"* (`hud.intake.no-place`,
   `src/content/default-locale-en.ts:1592`) and the strip says `16 with no bed`.
   Both are true. Neither says that those sixteen are not sleeping *badly* —
   they are not eating, not using a toilet, not milling about and not going
   anywhere, because all four cell-side actions resolve through the
   accommodation they do not have (§2). A player who reads "no bed" as "they
   sleep on the floor" has read the sentence correctly and the game wrongly.
2. **That population is the riot.** §4: the same sixteen carry `needsPressure`
   over the line, and six guards on full coverage do not stop it.
3. **The crowd is the game's clearest picture of its own state and it is drawn
   as one tile.** #944's depth fix landed at `44852b2b` (*"fix(render): a shared
   tile draws every actor standing on it"*) and it makes a shared tile draw
   both — but twenty-two figures with twenty-two distinct depths are still
   twenty-two figures on one tile, which the earlier record already said and
   which act 1 confirms is unchanged at v0.0.470.

**What it does *not* cost, and this is worth saying because it looks
dramatic.** The prison does not stop working: the six who are housed run their
full timetable throughout (`phase=performing action=action.free-association` at
the late reading), construction completes, income accrues (`384 EARNED TODAY` at
day 10), and the riot lapses on its deadline. **The crowd is a display of a
capacity problem, not a deadlock.**

---

## 7. Where the crowd starts: two prisoners, everybody housed

**MEASURED, act 2.** Six beds, no guards, and prisoners admitted one at a time
with a tile tally between each. (The `admitUntil` helper reads the worker's own
count, which lags a press by one publication, so the populations it settled on
are even numbers rather than 1..8 — the curve is the same curve and the reading
is the worker's.)

| prisoners | rail's no-place readout | distinct tiles | tally |
| --- | --- | --- | --- |
| 2 (tick 6,371) | `null` | **1** | `(12,12): 2 prisoners` |
| 2 (tick 7,617) | `null` | **1** | `(12,12): 2 prisoners` |
| 4 (tick 9,155) | `null` | **1** | `(12,12): 4 prisoners` |
| 4 (tick 10,415) | `null` | **1** | `(12,12): 4 prisoners` |
| 6 (tick 11,978) | `null` | **1** | `(12,12): 6 prisoners` |
| 6 (tick 13,263) | `null` | **1** | `(12,12): 6 prisoners` |
| 8 (tick 14,873) | `2` | **2** | `(12,12): 6`, `(16,16): 2` |
| 8 (tick 16,301) | `2` | **2** | `(12,12): 6`, `(16,16): 2` |

**The crowd starts at two.** It does not need overcrowding, it does not need a
riot, and it does not need a population: with a bed for every prisoner, a
no-place readout of `null` and six beds standing on six different tiles, the
**whole prison is on one tile**. The second tile appears at exactly the moment
the first prisoner the prison cannot house arrives, and holds exactly the
`waitingWithoutPlace` count.

The roster says why at every rung, and the answer is never the same action
twice:

```
2 prisoners, tick 6431:   2x (12,12) phase=performing action=action.free-association
2 prisoners, tick 7698:   2x (12,12) phase=performing action=action.sleep
4 prisoners, tick 9233:   2x (12,12) phase=idle action=action.use-toilet
                          2x (12,12) phase=performing action=action.use-toilet
6 prisoners, tick 13367:  6x (12,12) phase=performing action=action.eat-in-cell
8 prisoners, tick 14964:  6x (12,12) phase=performing action=action.sleep
                          2x (16,16) phase=idle action=NONE accommodation=NONE
```

**Four different actions, one tile.** Sleeping, eating in the cell, using the
toilet and free association are the four `own-accommodation` entries in
`DEFAULT_ACTIONS`, and `destinationTileOf` answers `instance.anchorTile` for
every one of them — so a prisoner going about a full and varied day never leaves
the north-west corner of their room. **That is the strongest form of the
finding, and it is what "a crowd of people all doing the same thing is a
different bug from a crowd of people each doing something" resolves to here:
they are each doing something, and it all happens on one tile.**

**It also kills the hypothesis the brief handed me, as an explanation of the
crowd.** *"A prisoner with nowhere to go stands where they arrived"* is exactly
true of the two at (16,16) — and it predicts that beds unstack prisoners, which
this table measures false at every rung from two upward. The earlier record
(`2026-09-04-why-they-stack.md` §5) refuted it at six prisoners; act 2 refutes
it at **two**, with the rail itself confirming that nobody is waiting.

**And the walk shows up here too, independently of act 1.**

```
[act2] 1935 keyframe(s) spanning ticks 1..16301; 6446 actor-sample(s);
       12 actor-sample(s) with a NON-ZERO velocity (12 prisoner, 0 guard);
       2 with a NON-INTEGER position
[act2] every tile change seen (18): "#0 pop0 (16,16)->(14,16) 2 tile(s) across ticks 5177->5185",
       "#0 pop0 (14,16)->(12,14) 4 tile(s) across ticks 5185->5193",
       "#0 pop0 (12,14)->(12,12) 2 tile(s) across ticks 5193->5202", …
```

Six prisoners, three sampled steps each, **eighteen tile changes and not one of
them longer than the walk speed allows**: four tiles across an eight-tick
sampling gap is exactly `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`'s half a tile per
tick. `(14.500,16.000)` and `(12.000,14.500)` are the two sub-tile positions.
**The two prisoners with no bed produced no tile change at all**, and after tick
11,019 nothing in the prison moved again.
