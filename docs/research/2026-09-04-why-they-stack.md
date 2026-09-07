# Why does the simulation stack twenty-two prisoners on one tile?

**Date:** 2026-09-04
**Question:** issue [#944](https://github.com/matmaxalez/lockstate/issues/944)
§3 — the half that #944 says must be answered *before* the draw order is
touched, because fixing depth makes twenty-two prisoners on one tile **visible**
rather than **correct**.
**Tree played:** `9ef67944` (**v0.0.458**), in worktree
`.../scratchpad/wt-stack` on branch `measure/944-why-they-stack`. Nothing under
`src/` differs from that commit on this branch — this pass is read-only on the
simulation, by its brief and in fact. The strip's own version line confirms the
tree from inside the running page on every act: `v0.0.458 · 19d0635` for acts 1
and 2, `v0.0.458 · 72fd83d` for act 3 (this branch's own instrument-only commits).

**Read positions off the worker, never off pixels.** This is a worktree, Git LFS
is not provisioned in this container, and the actor atlases are therefore
pointer files rather than images — a browser run here draws **no actor sprites
at all and passes anyway**, because the simulation lives in the worker
(`docs/AGENT_WORKFLOW.md` §2). Nothing below screenshots the world or asserts
anything about what was drawn. Every position in this record is a number the
worker published.

**Reproduction:** `tests/browser/playtest-2026-09-04-why-they-stack.playtest.ts`,
one act at a time. Nothing in CI collects it —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, and
`playwright.playtest.config.ts` is the config that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=43505 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-why-they-stack.playtest.ts -g "act 1"
```

---

## The answer, in one paragraph

**A prisoner's position is only ever written at three places, and none of them
is a place inside a room.** It is written once on admission, to the arrival tile
the composition root supplies; it is written per tile crossed by the walker; and
it is written on arrival to **the room instance's `anchorTile`** — the
north-west corner of the rectangle the player dragged, which is also the tile
the instance id is minted from. There is no per-object, per-bed or per-seat
position anywhere in the simulation: `PrisonerColdState.getAccommodation`
returns a **room instance id**, an action's destination is
`instance.anchorTile`, and the arrival writes that same tile. So **every
prisoner performing an action in one room stands on exactly one tile, and every
prisoner for whom no action ever resolves stands on the arrival tile for ever.**
Twenty-eight people on two tiles is those two rules and nothing else: one tile
per room in use, plus the arrival tile for everyone the prison cannot occupy.

**MEASURED, and the discriminating comparison is the point:** giving every
prisoner a bed put them on **fewer** tiles, not more. Six prisoners with two
beds stood on two tiles; six prisoners with six beds stood on **one**.

---

## 1. The measurement

Three acts, no guards in any of them — so the depth tie #944 §2 diagnoses cannot
confound a single reading, and every figure below is about the simulation alone.

Two channels, read and reported separately, never mixed into one sentence:

1. **The render-actors keyframe**, decoded from the bytes — the same channel
   `ActorLayer` draws from.
2. **The `hud/prisoner-roster` projection**, requested on the instrument's own
   `messageId`. A different reader over the same component arrays, and it
   carries the three fields that turn a position into a reason: `actionPhase`,
   `currentActionId`, `accommodation.instanceId`.

### act 1 — two beds, six prisoners

Rail: `6 PRISONERS`, `4 with no bed`; counts `accommodationCapacity=2`,
`roomOccupants=2`, `rooms=1`.

*Channel 1*, tick 21169 — and again unchanged at tick 22549:

```
6 actor(s) on 2 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 2 prisoner(s), 0 guard(s)
    (16.00,16.00): 4 prisoner(s), 0 guard(s)
```

*Channel 2*, tick 21281:

```
    #0 at (12,12) stage=completed                phase=idle action=action.use-toilet accommodation=room.cell:12:12
    #1 at (12,12) stage=completed                phase=idle action=action.use-toilet accommodation=room.cell:12:12
    #2 at (16,16) stage=accommodation-assignment phase=idle action=NONE            accommodation=NONE
    #3 at (16,16) stage=accommodation-assignment phase=idle action=NONE            accommodation=NONE
    #4 at (16,16) stage=accommodation-assignment phase=idle action=NONE            accommodation=NONE
    #5 at (16,16) stage=accommodation-assignment phase=idle action=NONE            accommodation=NONE
```

Two populations, two tiles, and the roster names the difference between them
without any inference: the two on (12,12) hold `room.cell:12:12`, the four on
(16,16) hold nothing, are still at `accommodation-assignment`, and have **no
action at all**.

### act 2 — six beds, six prisoners. The discriminating comparison

Rail: `6 PRISONERS`, no no-place badge at all (`data-without-place` is `null`);
counts `accommodationCapacity=6`, `roomOccupants=6`.

*Channel 1*, tick 23188 — and again unchanged at tick 24958:

```
6 actor(s) on 1 distinct tile(s), 0 with a non-zero velocity
    (12.00,12.00): 6 prisoner(s), 0 guard(s)
```

*Channel 2*, tick 23611: all six rows read
`at (12,12) stage=completed phase=performing action=action.free-association accommodation=room.cell:12:12`.

**A bed for everybody halved the number of tiles the population occupies.** The
six beds stand on six distinct tiles — `buildAndPopulate` places them along row
12 from column 12, and the run's own log records six accepted bed orders taking
`roomCapacity` to 6 — and all six prisoners stand on the first of them.

### act 3 — take the bed off that tile and see whether anybody moves

Act 2's prison exactly, and then one press: the bed on (12,12) is removed under
the six prisoners standing there.

```
[act3] press on the anchor tile (12,12) at (496,226) produced [{"type":"RemoveObject","x":12,"y":12}]
[act3] counts after removing the anchor bed, tick 29619: roomCapacity=5 accommodationCapacity=5 roomOccupants=6
```

*Before*, tick 26039/26306: `(12.00,12.00): 6 prisoner(s)`, all six rows
`accommodation=room.cell:12:12`.

*After*, tick 29701/29941: `(12.00,12.00): 6 prisoner(s)`, all six rows
`accommodation=room.cell:12:12`, `phase=performing`.

The room lost a bed — `roomCapacity` and `accommodationCapacity` both fell from
6 to 5, so the removal was applied and the derivation re-ran — and **nobody
moved**. The tile they are standing on now has no sleep surface on it at all.
That separates *"they stand on their bed"* from *"they stand on the room"*, and
it is the room.

### What every reading agrees on

- **Zero non-zero velocities**, in every keyframe read in all three acts.
- **Both channels agree on every tile**, in all six readings.
- **The tile is stable**: each act read the same stack twice, 1,200–3,600 ticks
  apart, and the tally did not change.
- **The stack tile *is* the instance id.** The room was zoned from (12,12), the
  instance is `room.cell:12:12`, and the prisoners are on (12,12).

---

## 2. Why — the code that decides it, every line opened

**VERIFIED.** Three writers of `PositionComponent.tileX/tileY` exist for a
prisoner, and that is the whole mechanism.

1. **Admission writes the arrival tile.**
   `PrisonerOperationsRuntime.admitPrisoner` at
   `src/simulation/prisoners/prisoner-operations-runtime.ts:981-982` writes
   `originTile`, which comes from the `AdmitPrisoner` command. The HUD's admit
   dispatch supplies it from `NEW_PRISON_ORIGIN_TILE` — `{ x: 16, y: 16 }`,
   `src/main.ts:621`, sent at `src/main.ts:2935-2936`. Its own docblock says
   what it is: *"It is now also **where a hired staff member first stands** (ADR
   0025 decision 4) and **the tile an admitted prisoner arrives on** (#261 step
   4) … That is honestly a placeholder in every use: there is no reception, no
   gate and no staff room in any session a player can start."* **That is the
   (16,16) stack, named in advance by the constant that causes it.**
2. **The walker writes one tile per tile crossed.**
   `src/simulation/prisoners/prisoner-operations-runtime.ts:438-439`, the step
   callback ADR 0059 introduced.
3. **Arrival writes the room's anchor tile.**
   `ActionSystem.arrive` at
   `src/simulation/prisoners/action-system.ts:1125-1126`:
   `this.position.tileX[index] = instance.anchorTile.x`. The walk that got them
   there was requested to the same tile: `destinationTileOf` at
   `src/simulation/prisoners/action-system.ts:199-202` is
   `if (target.kind === 'room') return target.instance.anchorTile;`, and
   `beginNextAction` requests the walk to it at `:1429-1431`.

And the anchor tile is one tile per room, not one per user:

- **An accommodation is a room, not a bed.** `IntakeSystem` at
  `src/simulation/prisoners/intake-system.ts:569` writes
  `this.coldState.setAccommodation(entityId, instance.instanceId)` — a room
  instance id. `resolveTargetInstance`'s `own-accommodation` arm
  (`action-system.ts:1555-1560`) resolves that id straight back to the
  `RoomInstance`. Nothing in the chain names an object.
- **`RoomInstance` does not know where its objects are.** It carries
  `anchorTile`, `width`/`height` and three derived *counts*
  (`src/simulation/prisoners/room-instance-registry.ts:75-150`, `anchorTile` at
  `:78`), and `updateDerived` (`:408-428`) writes only the counts. The tiles exist — every
  `PlacedObject` carries an `anchorTile`
  (`src/simulation/objects/placed-object.ts:26-33`) and `deriveRoomCapacity`
  walks them (`src/simulation/objects/room-capacity.ts:172-206`) — but it sums
  footprint widths and keeps no tile. **So at the moment a prisoner is told
  where to stand, the tile of the bed they were admitted against is not
  reachable from anything the action system holds.**
- **The anchor is the rectangle's corner and the instance's name.**
  `roomInstanceIdFor` at `src/simulation/rooms/zoning.ts:403-404` is
  `` `${roomCatalogId}:${anchor.x}:${anchor.y}` ``, which is why the roster's
  `room.cell:12:12` and the tile `(12,12)` are the same fact printed twice.

And the four with no bed have no action to be sent anywhere by:

- **Four of the twelve catalogued actions target `own-accommodation`** —
  `action.sleep`, `action.eat-in-cell`, `action.use-toilet` and
  `action.free-association` (`src/simulation/prisoners/actions.ts`) — and all
  four resolve through `getAccommodation`, which answers `undefined` for a
  prisoner still at `accommodation-assignment`. Every other action names a
  `room-catalog-id` this prison has not zoned (`room.canteen`,
  `room.shower-room`, `room.yard`, `room.common-room`, `room.classroom`,
  `room.laundry`, `room.kitchen`) or the job board, which is empty.
- **`beginNextAction` then falls off the end of its candidate loop and writes
  nothing at all**: `src/simulation/prisoners/action-system.ts:1438` is
  `this.unmetDemandCycles += 1;` and it is the last statement of the method. No
  phase, no target, **no position**. The prisoner keeps the tile admission gave
  it, which is why "the point of arrival" is where it stays.
- The roster reading is exactly that state: `phase=idle action=NONE`.

### The diagnostic for this state is computed and read by nobody

**VERIFIED, and it is stronger than #930 states.** `ActionMetrics` is documented
as *"Reconsideration cycles where no legal action had a reachable, available
target -- observable unmet demand"*
(`src/simulation/prisoners/action-system.ts:104-106`). `getMetrics()` is at
`:370`. **Under `src/` there is no caller.** `grep -rn "getMetrics()" src/`
returns patrol, deployment, search, incident trigger/response and the three
navigation caches, and no `actionSystem.getMetrics()` anywhere; the only two
occurrences of the identifier `unmetDemandCycles` outside its own module are
comments in `actions.ts:188` and `components.ts:408`. Ten test files read it.

So the counter that would have named this state in one number **could not be
read in this run at all**, and the phase field had to stand in for it. I did not
measure a value for it and am not reporting one.

---

## 3. Simulation fact or snapshot-feed artefact

**A simulation fact.** Three separate arguments, weakest last:

1. **The write sites are in the simulation.** §2's three writers are all inside
   `src/simulation/`, and the value written at
   `action-system.ts:1125-1126` is `instance.anchorTile` — one tile per room
   instance, by construction rather than by rounding. Nothing downstream had to
   collapse anything, because nothing was ever apart.
2. **The feed is a faithful read, opened line by line.**
   `encodeRenderActorsKeyframe`
   (`src/simulation/worker/render-actors-keyframe.ts:138-203`) walks live slots
   and writes, per actor, `locomotion.read(index, position.tileX[index],
   position.tileY[index], reading)` straight into the record. `LocomotionStore.read`
   (`src/simulation/locomotion/locomotion.ts:408-427`) answers
   `tileX * LOCOMOTION_SUBTILE_UNITS` with zero velocity for an actor holding no
   walk — the exact tile, not a snapped or quantised one. There is no per-actor
   offset, no de-duplication and no bucketing anywhere on the path.
3. **Two independent readers agree.** The keyframe encoder and
   `projectRosterRow` (`src/simulation/presentation/prisoner-projection.ts:332-366`)
   are different code with no shared step past the component arrays, and they
   agreed on every tile in all six readings.

**How far that goes, stated honestly.** What arguments 2 and 3 exclude is a
*feed* artefact — a keyframe encoder or a renderer collapsing distinct positions.
They do not, on their own, exclude a defect in `PositionComponent` itself,
because both readers read it. What excludes that is argument 1: the value in
those arrays is written by code that had one tile to write. Act 3 is the
measurement that closes it from the outside — the *simulation* changed
(`roomCapacity` 6 → 5) and the position did not, which no feed artefact can
produce.

**Who owns it, then.** The simulation, and specifically the action system's
notion of a destination — not `src/rendering/`. #944 §2's depth fix is
independent and remains ordinary work; it simply cannot help here, because
twenty-two figures with twenty-two distinct depths are still twenty-two figures
on one tile.

---

## 4. What a fix would have to change (and this pass makes none)

The defect is that **"where to perform an action" is a room-level answer to an
actor-level question.** Three changes are what that costs, in dependency order:

1. **Give the action system a tile inside the room to send an actor to.** Today
   `destinationTileOf` (`action-system.ts:199-202`) can only answer
   `instance.anchorTile`, because a `RoomInstance` holds no object tiles
   (`room-instance-registry.ts:75-150`). Either the registry carries the placed
   objects' anchor tiles alongside the counts it already derives from them
   (`room-capacity.ts:172-206` walks them and discards the tiles), or the action
   system gains a reader for the object store. **This is the load-bearing
   change and it is an architectural one**: it makes an action's target a
   *place* rather than a room, which is what ADR 0029's "seat" has always been
   in name only.
2. **Decide what a claimed seat *is*.** `claimUseIfNeeded`
   (`action-system.ts:1149-1169`) counts users against a capability's summed
   footprint width and holds no identity, so two prisoners can hold "a seat" in
   the same room without either of them owning a tile. A per-object claim is a
   different data structure and a different concurrency argument, and ADR 0029
   decision 2's own revisit condition is the place that discussion belongs.
   Until it is made, a fix that merely fans actors out onto arbitrary free tiles
   would draw them apart while the simulation still thinks of them as
   interchangeable room users — better to look at, and no more true.
3. **Decide where an unhoused arrival stands.** The four in act 1 are a separate
   half with a separate owner: `NEW_PRISON_ORIGIN_TILE` (`src/main.ts:621`) is
   the composition root's *placeholder*, and its own docblock already names the
   fix — *"when a session can contain a room a staff member or an arrival
   belongs in, the arrival tile becomes that room's anchor and the change is to
   this file alone"*. A reception or holding room would move them; nothing else
   will, because §2's `beginNextAction` fall-through writes no position.

**Two things a fix must not be mistaken for.** Separating prisoner and guard
depth (#944 §4 step 2) is real and does not touch this. A count badge on a
crowded tile (#944 §4 step 3) is a *rendering* answer to a simulation fact — it
would honestly report the stack, and the stack would still be there.

**A cheap intermediate that changes no architecture, offered rather than
recommended:** publish `ActionMetrics` (#930). It would not unstack anybody, but
"sixteen prisoners have had no legal action for four days" is the sentence this
state currently makes nowhere, and every act above had to infer it from a phase
field.

---

## 5. Where my brief and the hypothesis were wrong

- **The hypothesis is REFUTED as the answer, and confirmed as a half.** *"A
  prisoner with nowhere to go may appear to stand at the point of arrival"* is
  exactly true of act 1's four — they are at (16,16), the arrival tile, with
  `accommodation=NONE` and `action=NONE`. It is **not** the answer to #944 §3,
  because it predicts that beds unstack prisoners and **act 2 measured the
  opposite**: six beds took six prisoners from two tiles to one. The `16 with no
  bed` reading in the original round explains which *of two* stacks the sixteen
  were in; it explains neither stack.
- **The brief's other four candidates, priced.** *An intake staging tile* — no;
  the tile is `NEW_PRISON_ORIGIN_TILE` from the composition root, and intake
  writes no position. *A pathfinding fallback when no target is reachable* — no;
  a route was never requested, because no candidate resolved. *A spawn position
  never updated because no action was ever selected* — **yes, for the sixteen,
  and this is the precise form of it**: `beginNextAction`'s fall-through at
  `action-system.ts:1438` writes a counter and nothing else. *The utility AI's
  block filter leaving no legal action* — **not the cause here.** The four
  `own-accommodation` actions were legal in every act; they failed to *resolve*,
  which is `resolveTargetInstance` and one stage later than
  `utility-ai.ts`'s pre-ranking block filter. The filter's ordering defect
  measured in `2026-09-04-is-there-anything-to-do.md` is real and is a different
  defect.
- **The brief said the stacking might be "a snapshot-feed artefact" with a
  different owner.** It is not, and §3 says how that was told apart. The half
  of the brief that was right and load-bearing was the instruction to verify the
  envelope path before believing a reading — see §6.
- **#944 §1's framing invites one wrong reading and this record should close
  it.** *"6 prisoners on (12,12) and 16 plus all 6 guards on (16,16)"* reads as
  one anomaly with one cause. It is two rules with two owners: the room's anchor
  (the simulation's action system) and the arrival placeholder (the composition
  root). Acts 1 and 2 separate them, and a fix to either leaves the other.

---

## 6. Every gate run, and its actual result

- **`node node_modules/typescript/bin/tsc -b --pretty false`** in the worktree —
  **clean, no output**, run after each of the three edits to the instrument.
- **act 1** — `1 passed (6.1m)`, at `LOCKSTATE_BROWSER_TEST_PORT=43505`.
- **act 2** — `1 passed (6.4m)`.
- **act 3** — `1 passed (8.6m)` (the rewritten act; the first version failed, §7).
- **Machine idleness before the runs**, because a browser failure is the
  runner's until it is not:
  `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` returned
  nothing and `/proc/loadavg` read `0.83 0.53 0.29`.
- **Not run, and named rather than implied:** `pnpm test`, the browser gate
  suite, and the production build. This branch adds one `*.playtest.ts` and one
  document and changes nothing under `src/`, so no `.spec.ts` presses anything
  it touches — but *"I did not run the suite"* is the honest sentence and this
  is it. `playwright.config.ts`'s `testMatch: /.*\.spec\.ts$/` means CI will not
  collect the new file either, which is deliberate and must not be "fixed".
- **No mutation of production code**, by the brief. The evidence shape is
  differential play instead: act 2 against act 1 across two prisons, and act 3
  against itself inside one.

---

## 7. Instrument failures, and which readings are upper bounds

Three, all found by the instrument contradicting something, all fixed in the
file rather than worked around silently.

1. **The roster reply was polled out of an array that drops it.** The first run
   of act 1 read replies from `installTee`'s `lockstateFromWorker` and failed
   with *"no reply to the roster projection request within 20s"* — about a page
   that had answered immediately. `installTee` skips
   `simulation/projection` along with `simulation/delta` and
   `simulation/snapshot` to keep its array bounded
   (`tests/browser/playtest-harness.ts`). **This is the same class of failure
   the previous round recorded as its §9.2 and warned me about**: the reading
   was not wrong, the channel was. The projection replies are collected in this
   file's own tee now, and the actor tee additionally checks the payload's
   `contentType` against `RENDER_ACTORS_CONTENT_TYPE` and *counts* undecodable
   bodies, so "no samples" and "samples nobody could read" cannot be confused.
   Both counters read `0` in every act.
2. **Six Admit presses produce fewer than six prisoners, and the page says why.**
   Act 1's first run admitted **three of six**; act 2 needed 2 retries and act 3
   needed 5. The console carried the reason each time —
   `"The simulation has not reported its command sequence yet; try again in a
   moment."` thrown from `SimulationCommandSender.submit`
   (`src/ui/simulation-commands.ts`) — and a press inside that window submits
   nothing at all. **That is a finding about the Admit control rather than about
   this question**, it is not mine to fix (`src/ui/simulation-commands.ts` is
   another agent's surface today), and it is handed over as-is: a player pressing
   Admit six times in a row can get three prisoners, with no refusal band and
   nothing on screen to say so. `admitUntil` in the instrument retries against
   the worker's own count, which is why every act's population is the number it
   claims.
3. **`waitForQueueEmpty` answered "empty" about a queue it could not see, and it
   cost act 3 a ten-minute run.** The first version of act 3 built a bedless
   cell; `panelText('.hud-build__queue')` answered `not laid out`, the helper
   treats that as an empty queue, and the zoning that followed was refused
   *"open on at least one side"* **eleven times over ten minutes** because the
   walls genuinely were not up. This is the previous round's §9.1 hit from the
   other end. Act 3 was rewritten to reuse the one build sequence measured
   working twice today and to change the prison *after* it is populated — which
   also made it a within-run differential instead of a cross-prison one, and
   therefore better evidence than the version that failed.

**Which readings are upper bounds, and which are not.** None of the positions:
they are decoded worker payloads and projection view models, not screen
readings, and `innerText`'s scroll-clipping problem does not touch them. The
**rail and strip quotations are upper bounds** in the usual way — they come from
`panelText`, which does not respect scroll clipping — and they are used here
only as corroboration of counts the worker also published. **The tick beside a
counts figure may lag**, because the worker skips a counts publication equal to
the last one (`statusCountsEqual`); every tick quoted against a *position* is
the keyframe's or the clock channel's, never the counts envelope's.

---

## 8. Weakest claim, and what would change my mind

**The weakest claim in this record is §4's, not §1's or §2's** — §4 says what a
fix *would have to* change, and that is an argument about a design nobody has
decided, not a measurement. Specifically: I claim a fix cannot stop at fanning
actors out on arrival, because a room-level seat claim would still treat them as
interchangeable. That is reasoning from `claimUseIfNeeded` and ADR 0029, and
somebody who decides that a purely cosmetic fan-out inside the room's rectangle
is an acceptable rendering-side answer would be making a defensible product call
I have not costed.

**What would change my mind about §1 and §2 — the parts I do claim as
measured:** one keyframe, in any prison, carrying two prisoners of the same room
instance on two different tiles while both are `performing`. That is impossible
if `arrive` is the only writer, so it would mean a fourth writer exists that I
did not find. A single `grep -rn "position.tileX\[" src/` returning a fourth
site would do it just as well.

**What I did not reach.** A prison with **two** rooms in use at once, which
would show two anchors and is the reading that would make "one tile per room"
visible rather than inferred — the starter plot's clear rectangle is 12×11 tiles
and a second 6×6 room does not fit beside the starter cell, so it needs a
different build than the harness's. A prisoner **walking**: every keyframe here
carried zero velocity, which is consistent with #944 §5 and adds nothing to it,
because in a one-room prison the anchor is reached from (16,16) once and never
left. And a **guard's** stacking rule, which is `GuardRoster`'s and not this
question's.
