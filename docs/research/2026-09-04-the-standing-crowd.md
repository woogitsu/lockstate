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
two carried a sub-tile position — and three further runs reproduced it
independently. ADR 0059's locomotion is live and visible. The
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
| 1 | the reported configuration exactly — 6 beds, 22 admitted, 6 guards — run to day 10 past a riot, with both channels, the event log and a whole-run keyframe aggregate | run 1 `1 passed (5.3m)`, run 2 `1 passed (5.2m)` |
| 2 | six beds and **one prisoner at a time**, a tile tally after each admission up to eight | `1 passed (4.1m)` |
| 3 | eight prisoners, both stacks, then **every bed removed** under the six who are housed | `1 passed (3.8m)` |

**Act 1 was run twice**, at `34f9d5e` and again at `e2a699d` after the
instrument fix in §12. Both are quoted; where a figure differs between them it
is because they are two runs of a stochastic prison, not two readings of one,
and both are given rather than the better one.

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

**One guard did change tile, and it teleported — MEASURED in act 1 run 2, and
the differential is inside a single run.** Of the twenty-four tile changes the
keyframe channel carried, eighteen are six prisoners walking in three sampled
steps each, and the other six are **one guard, crossing the same eight tiles in
one sampled step, four times**:

```
#3 pop1 (16,16)->(12,12) 8 tile(s) across ticks 13210->13218
#3 pop1 (12,12)->(16,16) 8 tile(s) across ticks 13864->13872
#3 pop1 (16,16)->(12,12) 8 tile(s) across ticks 16267->16276
#3 pop1 (12,12)->(16,16) 8 tile(s) across ticks 17410->17418
```

Eight tiles is sixteen kernel ticks at the shipped walking speed, so a walk
would have to appear as at least two sampled steps with a published velocity —
which is exactly what the six prisoners did on the same channel in the same run.
**No guard published a non-zero velocity or a sub-tile position in 2,646
keyframes** (`12 prisoner, 0 guard`). The two systems that can move a guard
without `GuardLocomotionSystem` are `SearchSystem`, which writes
`this.guards.setTile(guardId, destination)` at
`src/simulation/contraband/search-system.ts:372`, and `IncidentResponseSystem`
at `response-system.ts:867`; run 2's event log carries `contraband.discovered`
at ticks 12,050, 14,420 and 15,680, bracketing the trips. **This is decided, not
broken.**
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

**MEASURED, act 1 run 1, whole-run aggregate** — and independently again in run
2 (§13) and in acts 2 and 3 (§7). Every keyframe from page load, not the last
four hundred:

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

---

## 8. Nobody ever leaves — the tile is not the room, it is the last place an action worked

**MEASURED, act 3.** Eight prisoners, six beds, both stacks — and then **all six
beds removed under the six who are housed**, with six accepted `RemoveObject`
commands and the counts confirming the removal landed:

```
[act3] counts after removing every bed, tick 11511: roomCapacity=0 accommodationCapacity=0 roomOccupants=6
```

*Before*, tick 10,432 / 10,520:

```
    (12.00,12.00): 6 prisoner(s)      (16.00,16.00): 2 prisoner(s)
    3x (12,12) phase=performing action=action.free-association accommodation=room.cell:12:12
    3x (12,12) phase=idle       action=action.free-association accommodation=room.cell:12:12
    2x (16,16) stage=accommodation-assignment phase=idle action=NONE accommodation=NONE
```

*After*, tick 14,691 / 14,775 — three thousand ticks after the last bed was
destroyed:

```
    (12.00,12.00): 6 prisoner(s)      (16.00,16.00): 2 prisoner(s)
    3x (12,12) phase=idle       action=action.sleep accommodation=room.cell:12:12
    3x (12,12) phase=performing action=action.sleep accommodation=room.cell:12:12
    2x (16,16) stage=accommodation-assignment phase=idle action=NONE accommodation=NONE
[act3] the differential: before, 8 prisoner(s) on 12,12 16,16; after, 8 on 12,12 16,16
```

**Nobody moved, and six of them are asleep in a room with no bed in it.**
`roomCapacity=0`, `accommodationCapacity=0`, `roomOccupants=6`,
`accommodation=room.cell:12:12`, `action=action.sleep`, `phase=performing` — and
`action.sleep` declares `requiredObjectCapability: 'sleep-surface'`
(`actions.ts:116-117`). They cannot have been mid-block since the removal:
`minDurationTicks` is 200 and the reading is 3,400 ticks later.

**That is decided too, and the code says so at the site.**
`resolveTargetInstance`'s own-accommodation arm resolves by id and checks
nothing (`src/simulation/prisoners/action-system.ts:1555-1560`), under a comment
that states the consequence in advance:

> The `own-accommodation` branch above re-checks neither gate -- it resolves by
> id -- which is why a prisoner who holds a cell keeps sleeping, eating in cell
> and using the toilet whatever stands in the room, and why the first bed placed
> buys three needs rather than one.

So act 3's answer to *"is the crowd tile the room?"* is **no, it is weaker than
that**: it is *the last tile an arrival was written on*. A prisoner's
accommodation outlives the object that justified it, the room's anchor outlives
the room's capacity, and no code path anywhere writes a position downwards. The
earlier record separated *"they stand on their bed"* from *"they stand on the
room"* by removing one bed; removing all six separates *"they stand on the
room"* from *"they stand where the last successful arrival put them"*, and it is
the second.

**One reading disagrees with another and both are right**, which is worth
recording because it looks like a defect and is not. The strip read `8 with no
bed` after the removal while the Intake panel's readout still read `2`. The
locale comment on `hud.status.prisoners-without-bed` says exactly why:
*"the strip's is the wider count of the two, since a prisoner whose bed was
removed under them is not waiting for anything"*
(`src/content/default-locale-en.ts:160-167`). Act 3 is the case that sentence
was written for, and it is the first time it has been played.

---

## 9. What this changes about the record so far

- **`docs/research/2026-09-04-why-they-stack.md` holds at v0.0.470.** Its three
  write sites are the same three lines at the same numbers
  (`prisoner-operations-runtime.ts:981-982`, `action-system.ts:1125-1126`,
  `:1438`), its `destinationTileOf` citation is exact, and its refutation of the
  arrival hypothesis reproduces at a population of two rather than six. Nothing
  in it needs correcting; this pass extends it to the guards, the riot, the
  threshold and the walk.
- **#944 §5 and `can-i-see-my-prison.md` §6b are overturned**, by the evidence
  #944 §7 itself specified. See §5 above.
- **`docs/PRISONER_OPERATIONS.md` names a constant that has never existed.**
  *"filled by `src/main.ts` from the same `STARTING_ORIGIN_TILE` the Build
  panel's numeric fields start at"* — the constant is `NEW_PRISON_ORIGIN_TILE`
  and always was. **It was false the day it was written**, and establishing
  *when* took one detour worth recording: this repository's first-parent
  history begins at a squashed commit (`f00c7d15`, 1,290 files, 420,887
  insertions), so `git log --first-parent -S` on the document returns only
  that and dates nothing. The reachable pre-history does date it.
  `git show 1db8c16a -- docs/PRISONER_OPERATIONS.md` **adds** the sentence
  (*"Let the player admit a prisoner…"*, 2026-08-25), and
  `git show 1db8c16a^:src/main.ts` already holds
  `const NEW_PRISON_ORIGIN_TILE = { x: 16, y: 16 } as const;` at its line 338 —
  so the constant carried today's name before the sentence naming a different
  one existed. `git log --all -S "STARTING_ORIGIN_TILE"` returns three commits,
  all of them documents: that one, the squash, and the release that merged it.
  A one-word documentation fix, handed over rather than made — this pass is
  read-only outside its own two files.
- **ADR 0088's `response-system.ts:818` has drifted to `:867`** at v0.0.470.
  Its `search-system.ts:372` citation is still exact.

---

## 10. Improvement proposals

Each is grounded in something measured above, and each says where the player
sees it, when, and instead of what. **None of them is landed here — this pass is
read-only on `src/`.** Where a proposal carries a string, the code that would
render it is opened and the sentence is checked against it, per `AGENTS.md`
reservation 4 as released on 2026-09-04.

### A. The Intake panel should say what having no bed *does* — one new line

**Grounded in:** act 1 (sixteen rows at `action=NONE` for ten in-game days) and
§2 (the three code sites that make it so).

**What a player sees today:** `2 waiting with no bed to sleep in` in the Intake
panel and `2 with no bed` on the strip. Both are true. Both invite the reading
*"they sleep badly"*, and what actually happens is that those prisoners begin no
action of any kind.

**Proposal:** a second, quieter line inside the same block, under the count:

> **Until a bed frees up they cannot sleep or use a toilet.**

**Where:** the `.hud-intake__no-place` block in `src/ui/hud/intake-panel.ts` —
built at `:245`, shown and filled at `:275-283`, gated by
`isIntakeWithoutPlaceWorthShowing` at `:181-182`. Putting the new line inside
that same gate is what makes it impossible for the consequence to appear without
the count it is about.

**Why it would be true, opened rather than asserted.** `action.sleep`
(`src/simulation/prisoners/actions.ts:116-117`) and `action.use-toilet`
(`:128-129`) are the only entries in `DEFAULT_ACTIONS` serving `sleep` and
`bladder`, and both target `own-accommodation`.
`resolveTargetInstance`'s own-accommodation arm answers `undefined` whenever
`getAccommodation` does (`action-system.ts:1555-1559`), and `getAccommodation`
is written only when `IntakeSystem` finds a free instance
(`intake-system.ts:565-570`). `waitingWithoutPlace` — the number the line sits
under — counts exactly the arrivals at `accommodation-assignment` for whom no
free place exists (`prisoner-projection.ts:616-638`). So for every person that
count is about, both verbs hold in every prison, whatever else is built.

**Why those two verbs and not more.** *"They cannot eat"* would be **false** in a
prison with a canteen (`action.eat-meal` targets `room.canteen`, `:120-121`) and
*"they can do nothing"* would be false in a prison with a yard
(`action.yard-recreation`, `:165-166`, needs no object). The sentence has to
survive the prison the player builds next, not only the one in front of them.

**Why not simply reword the two existing strings.**
`hud.status.prisoners-without-bed` is **the owner's own wording, approved before
it was built** (`src/content/default-locale-en.ts:159-160`), and
`hud.intake.no-place` is documented as its deliberate long form *"so the same
fact reads the same way in both places"*. Adding a line keeps that pairing
intact; rewriting either breaks something the owner already decided.

### B. Sixteen inert prisoners can be invisible in every panel — and that is a decision to revisit, not a patch

**Grounded in:** act 1. Twenty-two prisoners in two states, and
`PRISONER_ROSTER_ROW_LIMIT` is **4** (`src/ui/hud/regime-panel.ts:293`). The
projection orders those four **by risk tier**, on the owner's #703 ruling
(`src/simulation/presentation/prisoner-projection.ts:432-460`, which explains at
length why arrival order was wrong). Risk tier has no relationship to whether a
prisoner can act, so a player can open every panel in the game and never see one
of the sixteen.

**Proposal, as a question rather than a patch, because #703 is an owner ruling:**
the roster block's header already carries an *"N of M"*. It could carry a state
summary from the same projection walk — *"22 prisoners · 6 in a cell · 16
waiting for a bed"* — without touching the window's ordering or its four-row
budget. That keeps the ruling and answers the question the ruling does not: what
the eighteen rows a player cannot see are doing.

**What I did not do:** cost it. `projectPrisonerPopulationCounts` already walks
the whole population and already computes `waitingWithoutPlace`
(`prisoner-projection.ts:645+`), so the figure is a field rather than a second
pass — but whether the *header* is the right surface is a layout decision I did
not measure.

### C. Where an arrival stands — the placeholder both docblocks already name

**Grounded in:** §1–§3. Sixteen prisoners and six guards share (16,16) because
one constant and one derivation independently answer *"the middle of owned
land"*.

`NEW_PRISON_ORIGIN_TILE`'s docblock already states the fix and its cost:

> when a session can contain a room a staff member or an arrival belongs in, the
> arrival tile becomes that room's anchor and the change is to this file alone:
> both commands already carry a tile.

**And that room already exists in the catalogue, twice, with no consumer.**
`room.reception` (`src/content/room-catalog.ts:109`) and `room.holding-cell`
(`:98`) are zonable and buildable; `grep -rn "room.reception\|room.holding-cell"
src/ --include=*.ts` returns the catalogue, the locale and three comments, and
no behaviour. Giving the arrival tile to a zoned reception is the same shape
ADR 0054 decision 3 used to give `room.laundry` its first consumer.

**Stated honestly: this moves the crowd, it does not dissolve it.** The
arrivals would stack on the reception's anchor instead, by §8's rule. It is
still worth taking, for three reasons this pass can point at: it separates the
homeless population from the guard post (§3), it turns a placeholder into
something a player *did*, and it gives two authored rooms a reason to exist.
**It needs an ADR** — it changes where an incident responder is dispatched
(`response-system.ts:471-473` reads the sector's post, not the arrival tile, so
the two would stop coinciding) and it is a content decision.

### D. The load-bearing simulation change is already written down — and act 2 sharpens it

`docs/research/2026-09-04-why-they-stack.md` §4 names it: an action's
destination is a room-level answer to an actor-level question, and the fix is to
give `destinationTileOf` a tile *inside* the room. I am not re-proposing it; I am
adding the one thing act 2 contributes to it.

**The fix must not be framed as crowd relief.** At **two** prisoners with a bed
each and nobody waiting, the whole prison is already on one tile (§7). So a
change shaped like *"fan actors out when a tile gets busy"* would be a fix to
the wrong quantity: the room-level destination is wrong at n=2, when there is no
crowd to relieve. What is wrong is the *destination*, not the *density*.

### E. A sector whose guard requirement scales with occupancy still has one post tile

**Grounded in:** act 1's six guards on one tile for the whole run.
`requiredGuardCountFor` scales the requirement with sector occupancy
(`src/simulation/security/deployment-system.ts:100-107`) — the strip read
`COVERAGE 22 · Covered` with six guards hired — while `isAtPost` is exact tile
equality (`src/simulation/security/deployment-phase.ts:14-16`) against a single
`postTile`. So the better a player staffs a growing prison, the taller the
column of guards on one square.

**A question rather than a proposal**, because it is ADR 0036's territory and
that ADR is Accepted: does a sector want *n* post tiles, or a post *area*?
Either changes what `displayedDeploymentPhase` means, which is why it is not a
patch.

---

## 11. Every gate run, and its actual result

- **`node /workspace/lockstate/node_modules/typescript/bin/tsc -b --pretty false`**
  in the worktree — **clean, no output**, run after each edit to the instrument.
- **act 1, run 1** — `1 passed (5.3m)` at `LOCKSTATE_BROWSER_TEST_PORT=5323`.
- **act 2** — `1 passed (4.1m)`.
- **act 3** — `1 passed (3.8m)`.
- **act 1, run 2** — `1 passed (5.2m)`, the same act after the instrument fix
  in §12, as a second independent reproduction (§13).
- **Machine idleness, reported rather than claimed.** It was **not** idle:
  `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` found the other
  tester's playtest running when act 1 started, and `/proc/loadavg` read
  `3.59 2.85 3.18`. `docs/AGENT_WORKFLOW.md` §2's rule about contention is about
  *timing-sensitive gate tests*, and two testers running at once on separate
  ports is this round's design — but the rule says report it, so it is reported.
  Nothing in this record is a wall-clock claim: every tick is from
  `simulation/clock-state` and every position from a decoded worker payload.
- **Not run, and named rather than implied:** `pnpm test`, the browser gate
  suite, and the production build. This branch adds one `*.playtest.ts` and one
  document and changes nothing under `src/`, so no `.spec.ts` presses anything
  it touches — but *"I did not run the suite"* is the honest sentence and this
  is it.
- **No mutation of production code**, by the brief. The evidence shape is
  differential play instead: act 2's ladder against itself across eight
  populations, and act 3's before/after inside one prison.

---

## 12. Instrument failures, and which readings they touched

Two, both found by the instrument contradicting itself, both recorded rather
than quietly fixed.

1. **The tile-change map was keyed on the entity id alone, and `EntityStore`
   ids are allocated per population.** Prisoner 0 and guard 0 both publish
   `entityId: 0`, so the two overwrote each other on every keyframe and act 1
   run 1's `moves` list filled with **about 180 fabricated eight-tile "moves"
   between (12,12) and (16,16) across a zero-tick gap**, which hit the 200-entry
   cap and evicted every real transition after tick 8,180.
   **Which readings that touches: only that list.** The velocity and sub-tile
   counters are read off each record and never compared across frames, so §5's
   aggregate is unaffected — and it was the counters *disagreeing* with the
   moves list (ten sightings, all at ticks 4,649–5,133, against 180 "moves" at
   7,784–8,180) that exposed the bug. The map is now keyed `population:id`, the
   cap is 400, and the velocity counters are split per population; acts 2 and 3
   ran with the fix and have no guards to collide with in any case.
2. **`.hud-alerts` is not a class.** Act 1 run 1 read
   `".hud-alerts: ABSENT"` for the alert column; the list is
   `.hud-alerts__list` (`src/ui/hud/hud.ts:1525`). No claim in this record rests
   on it — the incident evidence is the worker's own `simulation/event` log, on
   a different channel — and the selector is corrected in the file.

**And one thing that did *not* go wrong, worth recording because a previous pass
was bitten by it.** `2026-09-04-why-they-stack.md` §7.2 measured that six Admit
presses could produce three prisoners, because
`SimulationCommandSender.submit` throws while it is waiting for the command
sequence and a press inside that window submits nothing. **That did not
reproduce here**: act 1's twenty-two presses produced twenty-two prisoners
(`22 prisoner(s) alive after 0 extra Admit press(es)`) and act 3's eight
produced eight, on a x4 clock. Act 2 needed two extra presses per rung, which is
its own `admitUntil` racing the counts publication rather than a refusal. #942
(*"a run of presses is a run"*) landed between v0.0.451 and v0.0.469 and is the
other tester's surface this round; this is one line of corroboration and not a
finding of mine.

---

## 13. Act 1, run 2 — the same prison twice, and what it adds

**MEASURED.** The second run of the same act, on the fixed instrument. Every
headline reproduces:

```
[act1-early] tick 12154: 28 actor(s) on 2 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 6 prisoner(s), 0 guard(s)
    (16.00,16.00): 16 prisoner(s), 6 guard(s)
[act1-late]  tick 22184: 28 actor(s) on 2 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 6 prisoner(s), 0 guard(s)
    (16.00,16.00): 16 prisoner(s), 6 guard(s)
[act1] 2646 keyframe(s) spanning ticks 1..22363; 47121 actor-sample(s);
       12 actor-sample(s) with a NON-ZERO velocity (12 prisoner, 0 guard);
       8 with a NON-INTEGER position
```

**The riot again followed the crowd**, at a different tick, which is what makes
it an ordering rather than a coincidence: the crowd was complete at tick 12,154
and `incidents.riot-opened … participantCount=22` fired at **20,150** — 8,000
ticks later in run 1, 8,000 ticks later in run 2, from different starting ticks.

**And the alert column, which run 1 could not read (§12.2), is worth quoting for
the player-cost question:**

```
A fight has broken out between two prisoners. 5× Day 8
No incident is still open — but the last one ran out of time instead of being
  contained, and everyone caught in it was hurt. 2× Day 9
A riot has broken out — 22 prisoners have stopped taking orders. Day 9  [Critical]
Contraband found: Phone. 2× Day 7
```

Five fights, a riot naming every prisoner in the building, and a lapse that hurt
everyone caught in it — **while the tile tally did not change by one body.** The
alerts are the game telling the player a great deal; the world is telling them
nothing, and §6's cost is the gap between those two channels rather than either
one of them.

---

## 14. Weakest claim, what would change my mind, and what I did not reach

**The weakest claim is §4's second half — that the sixteen are what carries
`needsPressure` over `hotThreshold`.** Everything else in §4 is measured (the
crowd's completion tick, the riot's tick, the unchanged tally); this part is
**REASONED** from three opened files and I could not read the quantity itself.
`needsPressure` crosses no boundary I can request, `ActionMetrics.getMetrics()`
has exactly one occurrence under `src/` — its own declaration at
`action-system.ts:370` — and no HUD surface publishes either. So I can show that
sixteen prisoners take no action and that the score is the mean deficit over
every prisoner on owned land; I cannot show the score.

**What would change my mind:** the same prison with **a bed for all twenty-two**
that still riots. That would prove the neglect term is carried by the housed
population's ordinary decay rather than by the homeless, and §4's chain would be
wrong in its middle. It is a real experiment and I did not run it — the harness
places beds along two rows of a 6×6 cell, twelve slots, so twenty-two beds need
a different prison than the one every act here shares.

**Second-weakest: that "one room, one tile" generalises to two rooms in use at
once.** I never built a second room, and neither did the pass before me
(`2026-09-04-why-they-stack.md` §8 names it as unreached for the same reason —
an 8×8 yard and a 6×6 cell do not both fit in the starter plot's clear
rectangle). What I have instead is act 2's four different actions all resolving
to one anchor and `destinationTileOf`'s single `return` statement
(`action-system.ts:199-202`), which is a mechanism rather than a second
observation. **The reading that would settle it** is a prison with a cell and a
yard and a door between them, watched across a recreation block: two anchors
should be occupied in turn, and the population should be seen walking between
them. `tests/browser/playtest-2026-09-03-the-errand-walks.playtest.ts`'s typed
build route (`.hud-build__coordinates`, `.hud-rooms__coord-*`) is how to build
it without fighting the canvas, and it is the next act somebody should write.

**What else I did not reach:**

- **Pixels.** I did not screenshot the world once. #944's depth fix
  (`44852b2b`) is *cited* here and **not verified by me**; whether a shared tile
  now draws every actor on it is `2026-09-04-can-i-see-my-prison.md`'s question
  and somebody should re-play it, because §1 shows the underlying stack is
  unchanged.
- **A save and reload of the crowd.** ADR 0059 records that a restored traveller
  drops to `idle` on the tile they had reached; a crowd that is entirely
  stationary should survive a round trip unchanged, and that is a cheap check I
  did not make.
- **The `unmetDemandCycles` value itself.** Named above; unreadable from
  outside the worker.
- **Whether a prisoner ever leaves the arrival tile once a bed frees up.** Act 3
  removed beds; nobody added one back. The prediction from §2 is that they walk
  the moment `IntakeSystem` assigns them an instance, which is what the six in
  every act did at admission — but *"a bed freeing up releases the crowd"* is
  an inference here and not a measurement.
- **Anything about the other tester's surface.** One line of corroboration on
  the Admit control is in §12 and nothing else.
