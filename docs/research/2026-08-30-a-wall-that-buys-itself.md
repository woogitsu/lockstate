# Playtest: does a wall get built without ever pressing *Buy*, and what stops the player next?

**Date:** 2026-08-30
**Branch measured:** `agent/627-just-in-time-materials` (PR #640), played from
`agent/640-playtest-just-in-time`.
**Reproduction:** `tests/browser/playtest-just-in-time.playtest.ts`, run with
`LOCKSTATE_BROWSER_TEST_PORT=5184 ./node_modules/.bin/playwright test -c tests/browser/playwright.playtest.config.ts tests/browser/playtest-just-in-time.playtest.ts`.
Nothing in CI collects `.playtest.ts`.

**Six runs, which tree each was of, and which two are the pair.**

| run | tree | result | what it added |
| --- | --- | --- | --- |
| A | `17ac74d` | `2 passed (11.6m)` | the first complete route, and the lock |
| B | `17ac74d` | `2 passed (12.5m)` | the delivery probe; the stall watch |
| C | `61dbee8` | `3 passed (13.8m)` | the control that presses *Buy* |
| D | `61dbee8` | `2 passed, 1 timed out (16.0m)` | showed the both-in-flight experiment was confounded, and act 3's budget too small |
| **E** | `61dbee8` | **`3 passed (13.5m)`** | the final file |
| **F** | `61dbee8` | **`3 passed (13.6m)`** | the final file again |

`17ac74d` was the branch tip when this pass started; `61dbee8` is that branch's
own later tip `4bc4aab` — `main` merged in, `v0.0.237` — merged into this one.
**E and F are the pair**: same file, same tree, and their decisive lines are
identical character for character. **Every load-bearing figure below is the same
in all six runs**, across two trees; where a figure moved between runs it is
said so and it is not load-bearing.

**Run D failed and is quoted anyway.** Its act 3 exceeded a 600 s test timeout
inside the stall watch, *after* producing the same 313/40 result as every other
run. A failed run whose measurement completed is evidence; what it is not is a
green suite, and the distinction is the point of listing it.

**Contention.** None of these runs was on an idle machine — other agents held
browser suites throughout, and each run's log opens with the `ps` output at its
start. That is why **the figures this document rests on are ticks, treasury
values and panel text, all of which come from the simulation and are identical
across six runs, and not wall-clock milliseconds, which are not.** Where a
duration in seconds is quoted it is labelled as such and is not part of any
claim.

**LFS.** `git lfs checkout` was run in the worktree before any browser work and
confirmed: `file public/assets/actors/actor.guard.base.idle.png` → `PNG image
data, 260 x 3104`. Nothing here is a claim about rendering, but a worktree that
had skipped it would have run green with no art and said nothing.

## The question, and the one rule the pass played under

The owner's own words are the brief: *"znajdź bugi i błędy grając, bo ja nie
mogłem postawić więzienia itp grając sam"* — find defects **by playing**,
because they could not put up a prison playing on their own. And the standing
directive: *"gra ma być łatwa przyjazna do grania, a nie jakieś ukryte funkcje
jak tu, że trzeba zamawiać materiał budowlany"*.

So the rule this pass played under is one line long: **`buy()` was never
called.** `tests/browser/playtest-harness.ts` exports it and `buildAndPopulate`
calls it twice before drawing a single wall, so every previous playtest in that
directory measures the game *for a player who already knows the procurement fold
is there*. That is the population #627 says does not include the owner. This
file imports neither `buy` nor `buildAndPopulate`.

**One deliberate exception, and it is labelled in the file and in the log.** The
last test is named `control:` and it is the only thing in the pass that presses
*Buy*. It exists because §2b's first reading needed a control before it could be
either believed or refuted, and it was refuted. Nothing in acts 1, 2 or 3 —
every finding about the route a player walks — ever opened the procurement fold,
and the log prefix says which act each line came from: `A1`, `A2`, `A3` never,
`C1` deliberately.

**The clock was pressed deliberately, and it is said out loud rather than
folded in.** A new session's clock is constructed `paused`
(`src/simulation/worker/state-machine.ts:216`) and the strip reads `×1` in both
states; that is a separate defect, being fixed on `agent/639-clock-is-stopped`,
and this pass is not measuring it. Every act presses **Play** — transport index
1 of `pause / play / fast-forward`, `src/ui/hud/status-strip.ts:157-159` —
immediately after `New prison`, and logs the clock either side:

```
[A1 +54.6s] clock BEFORE pressing Play: null (tick -1)
[A1 +59.1s] clock AFTER pressing Play: {"mode":"running","speed":1} (tick 51)
```

Every tick figure below is therefore from a clock a player started on purpose.

## Claim tiers

- **MEASURED** — produced by a run of the playtest, quoted from its output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **UNKNOWN** — could not be established here.

Nothing below is tiered **FROM MEMORY**.

---

# Part A — findings, ranked by how early a new player meets them

## 0. The clock, at second zero — not this pass's, ranked for completeness

**MEASURED, and it reproduces.** `clockMode=paused`, `speed="×1"`, and the whole
visible HUD at second zero contains no word for *stopped*:

```
[A1] transport: [{"label":"Pause","pressed":"true"},{"label":"Play at normal speed","pressed":"false"},{"label":"Fast forward","pressed":"false"}] clockMode=paused speed="×1"
```

Already recorded in full in
[`2026-08-30-what-the-game-never-says.md`](./2026-08-30-what-the-game-never-says.md)
§1, and owned by another branch. It is listed here only because **it is earlier
than everything else in this document**, and a ranking that omitted it would
mis-state what a new player meets first.

## 1. The wall does get built, with no procurement press — the answer to #627

**MEASURED.** One drag along the north edge of tiles 12..17 produced six
`PlaceBuildOrder` commands, and the money left at the press:

```
[A1 +74.9s] wall run north: 6 PlaceBuildOrder of 6 command(s) -> ["12,12 north","13,12 north","14,12 north","15,12 north","16,12 north","17,12 north"]
[A1 +75.3s] TREASURY AT THE PRESS: 25000 -> 24520 (delta -480) for 6 wall segment(s)
```

480 is exactly 6 × 80, and 80 is two `item.brick` at 40 (**VERIFIED, read:**
`src/content/procurement-catalog.ts:100`, `src/simulation/construction/definition.ts:89`).

The Build panel then read, at each poll, with nothing pressed in between:

```
[A1] act1 t+1181ms  tick=443 treasury=24520 queue="QUEUED | 6 waiting · 0 being built"
[A1] act1 t+6939ms  tick=561 treasury=24520 queue="QUEUED | 6 waiting · 1 being built"
[A1] act1 t+10013ms tick=623 treasury=24520 queue="QUEUED | 5 waiting · 1 being built"
[A1] act1 t+13169ms tick=685 treasury=24520 queue="QUEUED | 4 waiting · 1 being built"
[A1] act1 t+16210ms tick=751 treasury=24520 queue="QUEUED | 2 waiting · 0 being built"
[A1] act1 t+19487ms tick=813 treasury=24520 queue="QUEUED | 1 waiting · 0 being built"
[A1] act1 t+22852ms tick=879 treasury=24520 queue=".hud-build__queue: not laid out"
```

**Six segments, ordered at tick 408, all standing by tick 879 — 471 ticks, and
not one press outside the drag itself.** Runs E and F read the same delta at the
press and the same empty queue:

```
run E: [A1 +57.2s] TREASURY AT THE PRESS: 25000 -> 24520 (delta -480) for 6 wall segment(s)
run F: [A1 +59.5s] TREASURY AT THE PRESS: 25000 -> 24520 (delta -480) for 6 wall segment(s)
run F: [A1 +83.4s] ACT 1 RESULT: 6 segment(s); queue reached ".hud-build__queue: not laid out" at t+9820ms, tick 867, treasury 24520
```
Before this branch that same drag parked six orders in `materials-pending` for
ever. This is the fix working, played rather than asserted.

The whole prison follows from it. **MEASURED**, same session, still no `Buy`:

| step | what it cost | balance after |
| --- | --- | --- |
| 24-segment perimeter (4 drags) | 1,920 | 23,080 |
| `Designate` a 6×6 Cell | 0 | 23,080 |
| one Bed | 65 | 23,015 |
| one Toilet | 40 | 22,975 |
| one Guard | 80 | 22,895 |

```
[A2 +200.7s] ZONING: accepted after 1 attempt(s), 21905ms
[A2 +213.9s] TREASURY AT THE BED PRESS: 23080 -> 23015 (delta -65)
[A2 +258.3s] TREASURY AT THE HIRE: 22975 -> 22895 (delta -80) staff=1 wageBill=80
```

**A working prison — one cell, one bed, one toilet, two prisoners, one guard —
cost 2,105 of 25,000, which is 8.4% of the treasury.** Hold that figure; §4
needs it.

**Identical in every run**, and the balances are the check: runs A, B, C and D
all read 25,000 → 24,520 → 23,080 → 23,015 → 22,975 → 22,895, and all four
zoned on the first `Designate` press. Nothing here depends on a timing.

## 2. What stops a player next: nothing did, and that is the finding

**MEASURED.** Acts 1 and 2 ran end to end and nothing refused, nothing stalled,
and nothing required a mechanic the game had not shown. `2 passed (11.6m)`.

That is a real answer and it should be stated as one rather than dressed up: on
this branch, **the naive route completes.** The brief expected another hidden
requirement after the wall; the pass looked for one and did not find one in the
route a new player walks.

What it found instead are four things that are *slower* or *quieter* than they
could be, in the order a player meets them. None of them stops a prison.

### 2a. Every wall is built one at a time, by one crew

**MEASURED.** The `being built` column never exceeded 1 in any sample of any
run, and the 24-segment perimeter took 40 seconds of wall-clock at ×1:

```
[A2 +140.0s] perimeter t+1288ms  tick=1668 queue="QUEUED | 13 waiting · 1 being built"
[A2 +178.8s] perimeter t+40038ms tick=2447 queue=".hud-build__queue: not laid out"
```

**VERIFIED, read:** `src/ui/hud/view-model.ts:451-455` says so in its own
comment — *"`0` or `1` in every session the simulation can produce, because
construction builds one order at a time (#348)"*. So this is known and filed,
not new. It is listed here because it is the first thing that makes the game
*feel* slow, and because it is the multiplier on §4: 313 segments at this rate
is a very long time.

### 2b. The money the game spends for the player is shown only inside the fold the whole change exists so the player need not open

**This finding was written the other way round first, and both directions are
kept rather than one overwritten**, because the wrong version was a plausible,
well-evidenced reading of five runs and the next person to probe this surface
will start where it started.

**What was measured first, and it reproduced in all five runs that carried the
probe:** *On the way* — the
Build panel block that names bought-and-not-yet-arrived material — read `not
laid out` for the whole twelve seconds after a wall run, sampled four times a
second, while six just-in-time deliveries of two `item.brick` were in flight.

```
[A1 +47.3s]   ON THE WAY at t+395ms (tick 323): ".hud-build__deliveries: not laid out"
[A1 +59.0s] ON THE WAY block showed 1 distinct state(s) across the 12 s after the press: [".hud-build__deliveries: not laid out"]
```

**And the control, the only place in the file that presses *Buy*:**

```
[C1 +17.9s] the Buy control reads: "Buy 10 × Brick · 400"
[C1 +21.4s]   ON THE WAY at t+438ms (tick 199): "ON THE WAY | 1 bought · 400 back if cancelled | 10 × Brick · 400 back | Cancel"
```

A pressed purchase rendered in 438 ms; a just-in-time purchase never rendered.
The obvious reading — *the block does not show a purchase the game made* — is
what this section said, and **it is wrong.**

**What refutes it.** Reading found no filter anywhere on the path
(`projectPendingDeliveries`, `src/simulation/presentation/procurement-projection.ts:138-152`,
maps every entry of `ProcurementSystem.pendingDeliveries`), so the two readings
were separated by experiment instead: **stop the clock**, so that nothing can
land while the block is read. Buy ten bricks; then, with the clock still
stopped, drag a six-segment run.

**Run E:**

```
[C1 +66.8s] clock for the decisive half: clockMode=paused pressed=["true","false","false"]
[C1 +73.0s] Buy 10 bricks with the clock stopped: 25000 -> 24600 (delta -400)
[C1 +82.5s] wall run of 6 segments OVER 10 bricks already in flight: 24600 -> 24520 (delta -80)
[C1 +83.2s]   BOTH IN FLIGHT, CLOCK STOPPED, at t+335ms (tick 0): "ON THE WAY | 2 bought · 480 back if cancelled | 2 × Brick · 80 back | Cancel | 10 × Brick · 400 back | Cancel"
```

**Run F, the same file on the same tree:**

```
[C1 +66.3s] clock for the decisive half: clockMode=paused pressed=["true","false","false"]
[C1 +72.0s] Buy 10 bricks with the clock stopped: 25000 -> 24600 (delta -400)
[C1 +80.5s] wall run of 6 segments OVER 10 bricks already in flight: 24600 -> 24520 (delta -80)
[C1 +81.1s]   BOTH IN FLIGHT, CLOCK STOPPED, at t+287ms (tick 0): "ON THE WAY | 2 bought · 480 back if cancelled | 2 × Brick · 80 back | Cancel | 10 × Brick · 400 back | Cancel"
```

**The just-in-time delivery is there, with its own row, its own refund figure
and its own `Cancel`.** So the block is not filtered and nothing is invisible in
the sense first claimed. Two things follow, and the second is the real finding.

1. **ADR 0017 decision 7 works exactly as written.** The run wanted twelve
   bricks, netted off the ten already in flight *that the player had bought*,
   and spent **80 rather than 480**. *"Holding is permitted, never required"* is
   true and measured, and a player who pre-buys is not charged twice.
2. **VERIFIED, read** — `src/ui/hud/build-panel.ts:1293-1311`: `deliveriesBlock`
   is the **last child of `buyRow`**, and the line after that list is
   `buyRow.hidden = true`. The block therefore exists only inside the *Buy*
   disclosure, which starts shut and is opened by `.hud-build__buy-toggle`.

So the honest statement, and it is sharper than the one it replaces:

> **The purchase the game makes on the player's behalf is announced only inside
> the procurement fold — the exact fold #627 exists so that the player never has
> to find.** Act 1 never opened it and never saw a row, in **five** runs of a
> probe sampling four times a second for twelve seconds (B, C, D, E, F — run A
> predates the probe); the control opened it and saw the row in 267–759 ms, in
> **four** (C, D, E, F).

That is the #629 shape one layer along from where #627 removed it: the
requirement to visit the fold is gone, and the *report* of what happened instead
of it is still inside the fold. Whether anything should be said outside it is a
product call, and the sentence would be copy.

### 2c. The empty build queue is an *absent* block, not a `0 waiting` one

**VERIFIED, read**, `src/ui/hud/build-panel.ts:1589-1591`: `paintQueue` sets
`queueSection.element.hidden = true` whenever `queue.total === 0`, and the
comment beside it gives the reason — the panel's always-visible budget at
900x600 is 7.8px, so a block saying "nothing is queued" would be permanent
furniture saying the least interesting thing it could say. That reasoning is
sound and this is **not** filed as a defect.

It is here because it cost this pass an hour and because it is a trap for the
next agent: see §7.

### 2d. The one shipped sentence that ties building to the clock is still unrendered

**MEASURED.** The Build panel's visible text, at the moment 191 walls were
queued, in full:

```
Stop placing / Remove / Buy / Where / Point at the world /
Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. /
Enter coordinates / Queued
```

`hud.build.note` — *"An order is queued now and built while the clock runs."* —
is not among them. Already recorded, with the commit that removed its renderer,
in [`2026-08-30-what-the-game-never-says.md`](./2026-08-30-what-the-game-never-says.md)
§1. Reproduced here on a second branch, so it is not a property of that pass's
tree.

## 3. What the game says when it runs out: the sentence is reachable, at full width, and it is the wrong width

**MEASURED.** `purchase.insufficient-funds` is reachable by playing. It arrives
on the refusal band at 1440x32, unfolded, on the press that caused it:

```
[A3 +394.7s]   refusal band: hidden=false box=1440x32 text="The materials were not ordered — there are not enough funds."
```

**Verbatim, and it is the whole of what the game says about the state:**

> The materials were not ordered — there are not enough funds.

Three things about that sentence, and only the first is good news.

1. **It is legible and it is true.** It is `hud.alert.refusal.purchase.insufficient-funds`
   (**VERIFIED, read:** `src/content/default-locale-en.ts:328`), the same
   sentence a hand-pressed *Buy* gets, and the materials genuinely were not
   ordered and genuinely for that reason. #640 authored no new string, which is
   correct under `AGENTS.md`.
2. **It does not say what the player lost.** The player dragged a wall. The
   sentence talks about *materials*, which is a noun the game has never put in
   front of them on this route — this branch's whole point is that the player
   need not know materials exist. It names no wall, no tile, no count and no
   number. `#640`'s own handler comment says this and hands it over: *"a
   `build.*`-namespaced sentence would say more… That is new copy and it is not
   this change's to write."* **This pass agrees, and confirms by playing that
   the gap is real rather than theoretical.**
3. **It persists, unchanged, while eighty-one walls visibly go up behind it.**
   MEASURED, run B, watching the queue header with nothing pressed:

   ```
   [A3 +288.2s]   stalling t+500ms:    header="QUEUED 237 waiting · 1 being built" band="The materials were not ordered — there are not enough funds."
   [A3 +529.5s]   stalling t+241799ms: header="QUEUED 156 waiting · 0 being built" band="The materials were not ordered — there are not enough funds."
   [A3 +529.5s]   the queue was still moving after 240 s -- stopping the watch, not the queue
   [A3 +530.0s] does the band still name money with nothing pressed since? true
   ```

   The band said the same sentence for four straight minutes while the queue
   drained from 237 to 156 — and it was **still draining** when the watch gave
   up, because 312 of the 313 *were* paid for and only the last was not. So the player reads "there are not enough funds" while the
   prison builds happily in front of them, and the one order that will never
   move is indistinguishable from the 156 that will. `src/simulation/construction/system.ts:699`
   is why nothing further is ever said: the scheduled-tick procurement pass
   calls `procureQueuedMaterials` and **discards the report**, so only the two
   press paths (`handler.ts:75`, `session-commands.ts:508`) ever reach
   `reportMaterialsFunding`. **VERIFIED, read** — `grep -rn 'reportMaterialsFunding' src/`
   returns exactly those two call sites.

### The shortfall figure exists on the wire and reaches no pixel

**VERIFIED, read**, and this is a defect *in the branch under test*, reported
rather than patched, per the brief.

`BuildQueueViewModel` gains `materialsFunding: { unfunded, shortfallMinorUnits,
items }` (`src/simulation/presentation/construction-projection.ts`), the
projection catalogue is wired to supply it
(`src/simulation/worker/projection-catalog.ts:231`), and its own doc comment
states the purpose: *"the answer to 'you cannot afford it' is a number the
player can compare against the balance on the strip."*

**No `src/ui/` module reads it.** `buildQueueFromProjection`
(`src/ui/simulation-build-queue.ts:91-103`) maps `orderId`, `tile`, `edge`,
`state` and the two counts, and `HudBuildQueueViewModel`
(`src/ui/hud/view-model.ts:448-463`) has exactly three members — `total`,
`started`, `orders`. There is nowhere for the field to land, so `build-panel.ts`
is never given it and cannot render it. `grep -rn materialsFunding src/` returns
the projection, the two tests, and nothing under `src/ui/`.

**What is measured, separately from what it means:** the number is computed,
serialised, and dropped. Whether that is a gap worth closing is a product call —
the sentence that would use it is copy, and copy is the owner's.

## 4. How close an ordinary session gets to the 312-wall lock: not close, and #641's framing overstates the gesture

Issue #641 records `floor(25_000 / 80) = 312`, leaving 40, below the 65 ADR 0075
names as unwinnable, and says *"a single sustained drag reaches it"*.

**The arithmetic is confirmed by play, to the segment, in every run that
reached it.** The treasury tracked `25,000 − 80 × ordered` on every one of the
24 order-producing drags, and segment 313 is where the band spoke — the same
number in runs A, B, C, D, E and F:

**Run A:**

```
[A3 +375.9s] pass 0 column 20: +12 (total 301) treasury=920 predicted=920
[A3 +394.7s] pass 0 column 21: +12 (total 313) treasury=40 predicted=-40 band="The materials were not ordered — there are not enough funds."
[A3 +398.0s] ACT 3 RESULT: 313 wall segments ordered; treasury=40; funds refusal first seen at segment 313
```

**Runs E and F, the pair:**

```
[A3 +330.7s] ACT 3 RESULT: 313 wall segments ordered; treasury=40; funds refusal first seen at segment 313
[A3 +347.6s] ACT 3 RESULT: 313 wall segments ordered; treasury=40; funds refusal first seen at segment 313
```

312 funded, the 313th refused, **40 left** — which is the exact figure ADR 0075
calls *"a positive balance the status strip displays, and the identical trap"*.
The strip agreed: `40 | Funds`.

**But "a single sustained drag" is not what it took, and the difference is the
whole answer to the brief's question.** MEASURED, at 1440x900:

- **One drag is at most 20 segments** — 1,600, or 6.4% of the treasury. The
  visible tile window is columns 6..26 and rows 10..22, and the HUD covers part
  of it: the first row gave 20, the next six gave 16 each, rows 17–21 gave
  **zero** because the panel sits over them.
- **One whole screenful of horizontal drags is 116 segments** (9,280). Not the
  lock.
- **Reaching 313 took 24 separate drags across rows *and* columns, six and a
  half minutes of continuous dragging, and the player must want it.** The run
  log is 24 lines long and every one of them is a deliberate gesture.

Set that against §1's measured cost of an actual prison: **2,105 of 25,000, or
26 wall segments' worth.** A player doing ordinary things is not near the cliff;
they are at 8% of it. The route to the lock is not "played normally and fell in",
it is "spent six minutes fencing empty ground".

**So this pass does not corroborate #641's *"a player who drags a long wall and
then finds the game silently unwinnable"* as written, and says so.** What it
corroborates is the arithmetic, the reachability, and the silence — and one
thing #641 does not claim, which is worse than the framing it does claim: see
§5.

## 5. Ranking note: the ordinary failure is running out on wages, not on walls

**MEASURED, partially, and the gap is named.** §1's prison ends at 22,895 with
`dailyWageBill=80` and one guard. `PayrollSystem` re-charges that at every
in-game day boundary and the hire hint says *"Taken from the treasury on hire"*
— measured in full by
[`2026-08-30-what-the-game-never-says.md`](./2026-08-30-what-the-game-never-says.md)
§2 as 25,000 → 24,920 → 24,840 → 24,760.

This pass did not run a prison long enough to reach insolvency by wages, so the
comparison is arithmetic rather than played: a prison at 22,895 with one guard
has 286 in-game days before the payroll alone takes it below 65. **UNKNOWN**
which arrives first for a real player, and what would settle it is a long run
with a realistic staff roster, which this pass did not do.

---

# Part B — three things that are FINE, with the evidence, so they are not re-checked

## 6a. Zoning was accepted on the first press, in every run

```
[A2 +200.7s] designate attempt 1 at t+21389ms: rooms=1
[A2 +200.7s] ZONING: accepted after 1 attempt(s), 21905ms
```

The stale-enclosure-verdict retry loop that
[`2026-08-29-playtest-ordering-and-the-second-room.md`](./2026-08-29-playtest-ordering-and-the-second-room.md)
§7 documents did **not** fire once the perimeter was genuinely complete. The one
time it appeared to fire in this pass, it was this pass's own regex bug (§7).

## 6b. Intake says what it is doing, unfolded

```
[A2 +248.2s] intake panel: "INTAKE\nCollapse\nAdmit a prisoner\n1 waiting with no bed to sleep in\nA prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free.\nIN INTAKE\n1 of 2\n1 at Cell Assignment"
```

Two admissions against one bed, and the panel says `1 waiting with no bed to
sleep in` without anything being unfolded. Confirms
[`2026-08-30-what-the-game-never-says.md`](./2026-08-30-what-the-game-never-says.md)
§4 on a second branch.

## 6c. The hire control names its price before the press

```
[A2 +253.5s] hire control reads: "Hire Guard · 80"
```

What it does not name is that the 80 recurs — which is §2 of the other record,
not a new finding here.

---

# Part C — this pass's own instrumentation, corrected in the open

## 7. The queue-empty regex matched a queue of ten, and it was the shared harness's

**MEASURED defect, fixed on this branch, in `tests/browser/playtest-harness.ts`
and in the copy this pass had made of it.**

`hud.build.queue-count` is `'{count} waiting · {started} being built'`
(**VERIFIED, read:** `src/content/default-locale-en.ts:567`), so a queue of ten
renders `10 waiting · 0 being built` — and `waitForQueueEmpty`'s
`/0 waiting . 0 being built/` matches that as a substring of `1` + `0 waiting ·
0 being built`. So do 20, 30, 40 and every other multiple of ten.

```
$ node -e '...'
harness regex /0 waiting . 0 being built/ matches a queue of TEN: true
anchored /(?<![0-9])0 waiting . 0 being built/ matches it: false
anchored still matches a real empty queue: true
```

What it cost, and what it nearly published: a 24-segment perimeter reported
"empty" at 10 still waiting; the `Designate` that followed was refused
`zone.not-enclosed` because the wall genuinely was not up; and the retry loop
then hung on a control that never became actionable, consuming a whole 600 s
test budget. **The reading that produced — "zoning is refused after the queue
empties" — would have been an artifact of a regex, reported as a fact about the
game.** It is exactly the shape `docs/AGENT_WORKFLOW.md` §3 calls "a measurement
is not a diagnosis", and it was caught only because the run before it had
already zoned successfully at the first attempt.

**`buildAndPopulate` waits on this twice**, and its own 24-segment perimeter
passes through exactly `10 waiting` on the way down, so every playtest in the
directory inherited it. Fixed with a `(?<![0-9])` lookbehind, with the
measurement in the comment.

## 8. Five more instrumentation facts, each paid for once

- **`calibrate()` leaves a refusal standing, and the band does not decay.** It
  bisects by pressing *Remove* on empty tiles, so it ends with *"Nothing was
  removed — there is no object on that tile, and none being built there."* still
  on screen 3,600 ticks later. The first version of act 3 tested
  `refusal.text !== ''` and would have "found" a funding refusal on its first
  wall run. **A probe that watches the refusal band must record what calibration
  left on it first.**
- **Playwright's default action timeout is `0` — no timeout.** One control that
  never becomes actionable consumes the entire test budget with no line saying
  which. Every act now sets `page.setDefaultTimeout(20_000)` and prints elapsed
  seconds on every line.
- **`latestCounts` immediately after a press answers the balance from before
  it.** `simulation/status-counts` is published on the worker's cadence and
  skipped when unchanged, so one run read `TREASURY AT THE PRESS: 25000 ->
  25000 (delta 0)` for six segments that had demonstrably cost 480, and the next
  observation a second later read 24,520. `settledTreasury` polls until it moves
  and says so when it does not.
- **The camera calibration rule holds again**, measured rather than assumed:
  `tile (0,0) top-left = (-304, -574)` at 1440x900 in every act of every run,
  which is `(viewportW/2 − 1024, viewportH/2 − 1024)`.
- **A probe whose window is five seconds and whose target is behind a fold will
  answer confidently and wrongly.** §2b is the worked example, and the general
  form is the one that generalises: **when a surface can be absent for two
  different reasons, remove one of them by construction rather than by
  sampling harder.** Stopping the clock removed the window; nothing about
  sampling four times a second could have.

---

# Part D — what is owed, and to whom

**Nothing here is proposed as a code change to `src/`, and the reason is a rule
rather than a judgement.** `AGENTS.md` reserves *"anything that reaches a player
as a promise the code does not keep"* to the owner, and #629 states the mirror:
the rule says **that** something must reach the player, never **what words**.

| # | what is missing | where it would go | what already exists there |
| --- | --- | --- | --- |
| 1 | the shortfall figure the projection already computes | the Build panel, beside the queue | `BuildQueueViewModel.materialsFunding.shortfallMinorUnits` is on the wire; `HudBuildQueueViewModel` has no field to carry it and `buildQueueFromProjection` drops it. **This is plumbing, not copy** — the sentence that uses it is copy |
| 1b | that the game bought something, anywhere outside the *Buy* fold | somewhere in the Build panel that is not `buyRow` | the row already exists, renders correctly and carries its own `Cancel` and refund figure (§2b). Moving or mirroring it is a placement decision, not a new string |
| 2 | a sentence that names the *wall* rather than the *materials* | the refusal band | `#640`'s own handler comment specifies exactly what it would need: a `build.*` `RefusalReason` member, a `hud.alert.refusal.build.*` key, and its English text |
| 3 | that a drag costs money before it commits | the Build panel's *Where* readout, which already says `{count} × {edge} from {x}, {y}` | `hud.build.target-run` renders the count during the drag. The multiplication is not there, and issue #641 option 2 is exactly this |

Items 1 and 1b are the cheapest and are the ones this pass would raise first,
for the same reason in two forms: **in both, the thing that would reach the
player already exists and stops one step short of them** — a number that travels
most of the way across the boundary and is dropped, and a row that renders
perfectly inside a fold the change exists to make unnecessary. Neither needs a
word written.

---

# Weakest claim, and the cheapest thing that would falsify it

**Weakest: §2 — "nothing stopped the player" — because this pass played one
route, competently, six times.** Six runs of one route is one route. What is measured is that *the specific sequence*
new prison → Play → four wall drags → Designate → bed → toilet → admit → hire
completes with no procurement press and no refusal. What is **not** measured is
the space of routes a person actually takes. A player who zones before walling,
who builds a room too small, who admits before there is a cell, or who does any
of it at 900x600 was not played here.

**#569 named its weakest claim and was still wrong, and its retraction says why:
naming a weak claim is not testing it.** So the test is stated:

**The cheapest falsification: hand this branch to the owner and ask them to
build a prison without opening the Buy fold.** One session from them settles
what no amount of scripted mouse work can, and it is the same falsification
[`2026-08-30-the-naive-route.md`](./2026-08-30-the-naive-route.md) asked for and
did not get. Failing that: run the same file at 900x600, where §4's usable tile
window would be different again and where the Build panel's always-visible
budget is much smaller than at 1440x900.

**And a third, cheaper than either, which this pass should have run and did
not:** play the same route with **the wall tool never armed** — that is, place a
bed as the very first act, in a prison with no room. §1 measured the route in
the order the brief named. A player who starts with furniture was not played.

**Second weakest: §4's claim that a player is "not near the cliff".** It rests
on one prison's cost — 2,105 — being representative of an ordinary session. A
player who builds four cell blocks rather than one cell is four times nearer,
and a player who fences a perimeter around their land is nearer still.
**UNKNOWN** what an ordinary session's footprint is; nothing in this repository
can supply it, and it is one sentence from the owner.

# What this pass did not reach

- **A player.** Every impact statement is withheld for that reason, per
  `docs/AGENT_WORKFLOW.md` §3.
- **Any viewport but 1440x900.**
- **Insolvency by wages** (§5). The comparison there is arithmetic, not played.
- **A save/restore across the just-in-time state.** An order whose materials
  were bought and whose delivery is in flight when the prison is saved is a
  state this branch newly creates;
  [`2026-08-30-does-a-prison-survive-being-reopened.md`](./2026-08-30-does-a-prison-survive-being-reopened.md)
  covers reopening but not this state. **UNKNOWN.**
- **The map as drawn.** This pass read text, never pixels.
