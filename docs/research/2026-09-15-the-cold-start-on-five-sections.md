# The cold start on five sections — what the first quarter of an hour asks, and what it tells

**Date:** 2026-09-15
**Tree played:** `origin/main` at **v0.0.640** (`e044a3e8`) in worktree
`/tmp/claude-0/wt-play`, branch `agent/cold-start-measurement`. **Nothing under
`src/` differs from that commit** — this branch adds one `*.playtest.ts`
instrument and this record. The status strip confirms the tree from inside the
running page in every act: acts 1–3 read `v0.0.640 · e044a3e`, and acts 4–5,
run after the instrument was committed, read `v0.0.640 · 105a1ea`.

---

## The question, and why it is not the one the brief handed over

**As given:** *what does the first quarter of an hour of this game actually ask
of a player, and what does it tell them?*

**As refined after act 1 and before anything was committed to:** the last time
that question was asked here — `2026-09-04-the-first-ten-minutes.md`, at
v0.0.442 — the answer was about *leading*: a player was led after the fact by
refusals, with two unguided moments. **Eleven days later that framing no longer
fits, because the guidance arrived and the refusals did not change.** So the
question this record actually answers is:

> On the five-section navigation that landed on 2026-09-14, the game now tells
> a newcomer what to do **before** they act. Do the surfaces that tell them what
> *happened* keep up — and do any two of them ever disagree on one screen?

**The answer is that they do disagree, twice, and that the disagreement is
visible on one screen without scrolling** — §4.

**But the headline of this record is not that.** It is that **four separate
findings of this repository's own 2026-09-04 records are refuted by playing,
every one of them in the good direction**, and one of them is the most-quoted
sentence in the corpus: *nothing a player does right is ever acknowledged*.
**That is no longer true and this pass watched it happen.** §2 and §5.

So the honest summary of the first quarter of an hour on this tree is: **the
game leads a newcomer better than any record here says it does, and the one
thing it still does badly is stop talking.** A refusal, once shown, is never
taken back.

---

## Claim tiers

- **MEASURED** — produced by one of the acts below and quoted from its output.
- **VERIFIED, read** — a file in this repository was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **JUDGEMENT** — a claim about what a *player* would do. §8 names the weakest.

Nothing here is FROM MEMORY. Sentences are quoted from the laid-out page
(`innerText` of a named selector, via the harness's `panelText`, which answers
`"not laid out"` rather than empty for a hidden node). Numbers like `rooms`,
`treasuryMinorUnits` come from the worker's `simulation/status-counts` through
the tee. **The two channels are never mixed in one claim.**

## Reproduction

`tests/browser/playtest-2026-09-15-cold-start.playtest.ts`, one act at a time.
Nothing in CI collects it: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=45247 node_modules/.bin/playwright test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-15-cold-start.playtest.ts -g "act 1"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | the arrival screen and all five sections, nothing pressed | `1 passed (27.5s)` |
| 2 | the naive run — only what the screen says | `1 passed (1.1m)` |
| 3 | the refusal lifecycle on one tile edge | `1 passed (1.4m)` |
| 4 | the informed run — a walled, zoned, furnished cell, two admits, one guard, past a day boundary | `1 passed (5.9m)` |

**Presses were proved to land.** Every world gesture goes through the harness's
`press`/`drag`, which since #1017 compare what the page was last asked to place
against the `definitionId` on the command that came out, and throw on a
mismatch. No act below threw.

**Git LFS: the fourth state, and every act ran without art.** In this container
`file public/assets/actors/actor.guard.base.idle.png` → `ASCII text`,
`git lfs version` → `git: 'lfs' is not a git command.`, and `.git/lfs` does not
exist — the state `docs/AGENT_WORKFLOW.md` §2 records as the fourth, where the
free `git lfs checkout` is not a command that can be run. Every act's console
therefore carries `Failed to process file: image "/assets/actors/…"` and
`World renderer: InvalidStateError: The source image could not be decoded.`
**No claim in this record is about anything drawn**, and every sentence quoted
is a DOM text node. A reader wanting a claim about the world view needs a
container in one of the other three states.

---

## 1. MEASURED, act 1 — the arrival screen, in full

Pressing **New prison** and touching nothing else. The whole laid-out page, as
one `innerText` per region:

The status strip **before** any prison exists carries `--` in every slot:

```
LockState.io / PRE-ALPHA / v0.0.640 · e044a3e /
-- PRISONERS / -- HIGH RISK / -- STAFF / -- COVERAGE / -- ROOMS /
-- INCIDENTS / -- CONTRABAND / -- FUNDS / -- EARNED TODAY /
DAY -- / Through the day -- / PAUSED
```

and **after**:

```
0 PRISONERS / 0 HIGH RISK / 0 STAFF / 0 COVERAGE Covered / 0 ROOMS /
0 INCIDENTS Clear / 0 CONTRABAND / 25,000 FUNDS / 0 EARNED TODAY /
DAY 1 / Through the day 0% / PAUSED
```

The five sections read, in order:

| section | tab label | panel | what it says on arrival |
| --- | --- | --- | --- |
| `overview` | `OVERVIEW` | `.hud-overview` | `Finances / FUNDS 25,000 / EARNED TODAY 0 / WAGES A DAY 0` |
| `build` | `BUILD` | `.hud-build` | 21 catalogue rows, **`Brick wall · 80 per segment` `Selected`**, then `WHERE / Point at the world / Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.` |
| `zones` | `ZONES` | `.hud-rooms` | 18 room rows, **`Staff Room` `Selected`**, then `DRAG A RECTANGLE ACROSS THE TILES THIS ROOM SHOULD COVER. / NEEDS AT LEAST 3 × 3 TILES / MUST BE ENCLOSED / NEEDS 1 × DESK / NEEDS 2 × CHAIR` |
| `manage` | `MANAGE` | `.hud-intake` | `Intake / Admit a prisoner / A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free.` |
| `day-plan` | `SCHEDULE` | `.hud-regime` | two regime blocks, then `PRISONERS 0 of 0 / No prisoners yet. Build a cell with a bed to take somebody in.` |

The landing section is `overview` (`INITIAL_HUD_SHELL_STATE`,
`src/ui/hud/hud-state.ts:124` — **VERIFIED, read**).

---

## 2. MEASURED, acts 1–2 — two of the 2026-09-04 record's findings are refuted, both in the good direction

`2026-09-04-the-first-ten-minutes.md` is read-only history and is not edited.
What follows is what the same two questions answer today.

### 2a. The stopped clock is no longer an unguided dead end

That record's §1 headline: twenty-four paid-for orders sit still, and *"does
any visible sentence contain the word `clock`? **no**"*. Its §1 names the
sentence that would have fixed it, `hud.build.note` — *"An order is queued now
and built while the clock runs."* — as *"shipped, keyed, ruled on, and rendered
by nothing"*.

**It renders now.** Act 2 lays six wall orders on a paused clock and then asks
the whole laid-out HUD the same question:

```
[act2] does the laid-out HUD contain /clock/i? yes
[act2] does it contain /paused/i? yes
[act2] tick still: -1 clock=null
```

and the Build panel at that moment carries it verbatim, between the placement
hint and the deliveries block:

> `An order is queued now and built while the clock runs.`

**VERIFIED, read:** `src/ui/hud/build-panel.ts:1567` constructs it as
`.hud-build__note.hud-build__order-note` and `:1578` sets `orderNote.hidden =
true` — *"Hidden until `paintQueue` says otherwise"*. So it appears at the
moment there is a queue to explain and not before, which is why act 1's arrival
screen does not carry it and act 2's does.

### 2b. A newcomer no longer has to know to buy materials first

That record's naive run cost **1,815 more money** than the informed one, and
`buildAndPopulate` still opens with two `buy` calls. **A player who buys
nothing is not refused today.** Act 2 arms the pre-selected `wall-brick` and
drags one six-segment run with an empty store:

```
[act2] first wall drag with NOTHING bought: 6 command(s) from 13
[act2] queue: "QUEUED\n6 waiting · 0 being built"
```

and the Build panel grows a deliveries block that both charges and explains:

> `ON THE WAY / 6 bought · 480 back if cancelled / 2 × Brick · 80 back / Cancel
> / 2 × Brick · 80 back / Cancel / 2 × Brick · 80 back / Cancel / and 3 more on
> the way — these arrive first, and the rest come into view as they land.`

Funds move `25,000 → 24,520`, which is `6 × 80` against the catalogue row's own
`Brick wall · 80 per segment`. **The money is attributable on the same panel
that spent it**, which is the one place in this run where the brief's fourth
bullet — *where the money goes and whether the player can tell* — comes back
positive.

---

## 3. MEASURED, act 2 — what is refused, and whether the refusal says what to do

Three refusals were provoked, each quoted verbatim off `.hud__refusal`:

| what was pressed | the sentence | does it name the fix? |
| --- | --- | --- |
| Confirm a 6×6 `Cell` rectangle with only one wall run ordered and the clock paused | `The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side.` | **No.** It names the condition, not the wall. |
| `Admit a prisoner` with no room | `Nobody was admitted — this prison has no room to hold anybody.` | **No** — but the panel above it already did, before the press. |
| A world press armed to Remove, on an empty tile edge | `Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.` | Not applicable — nothing was wanted. |

**The leap the 2026-09-04 record names is still unmade and is now only half a
leap.** That record's second unguided moment was *"the leap from the refusal's
word **enclosed** to the idea of a **wall**, which the game never makes for the
player"*. The refusal still never makes it. What is new is that the Rooms panel
makes a *checklist* of it, live, the moment a room type is selected — act 2,
with `Cell` selected and a rectangle drawn:

> `Designate 6 × 6 / Discard / AREA / 6 × 6 tiles at 12, 12 /
> OPEN ON AT LEAST ONE SIDE / NEEDS AT LEAST 2 × 3 TILES / MUST BE ENCLOSED /
> NEEDS 1 × BED / NEEDS 1 × TOILET`

`OPEN ON AT LEAST ONE SIDE` is the live verdict on the rectangle actually
drawn, and it appears **before** the player presses Designate. **JUDGEMENT:**
that is a different and better thing than a refusal, and it still does not
contain the word *wall*.

**And the second row of that table is the one worth the owner's attention, for
the opposite reason.** The Intake panel states the precondition *and* the
non-precondition, unprompted, on a prison with nothing in it:

> `A prison needs a cell before it can admit anyone. It does not need a free
> bed: an arrival with none waits until a bed is free.`

That sentence is doing the job the refusal is not: it is on screen before the
press, it names the missing thing, and it forecloses the wrong inference. It is
the shape the other two rows lack.

---

## 4. THE FINDING — MEASURED, act 3: a refusal is not taken off the band when it stops being true, and the screen contradicts itself

Act 3 drives one tile edge — the north edge of tile (20,20) — through five
steps on a fresh prison, reading `.hud__refusal` after each. **The band's text
is byte-identical at every one of the five**, and the recorder that samples
both bands every 120 ms logs exactly one refusal value for the whole run and
never a transition to `<hidden>`:

| step | what was done | `.hud__refusal` after it | `.hud-build__queue` at the same moment |
| --- | --- | --- | --- |
| A | Remove press on the empty edge | `Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.` | — |
| B | Remove press on a *different* empty edge, (25,20) | same sentence | — |
| C | **a wall ordered on the very edge A refused** | **same sentence** | `QUEUED / 1 waiting · 0 being built` |
| D | clock run to tick 138 | **same sentence** | `QUEUED / 1 waiting · 1 being built` |
| E | **Remove press on that edge, which succeeded** | **same sentence** | — |

**Three separate things are wrong on that screen and they are wrong in three
different ways.**

1. **At step D the two readouts contradict each other in the same words.** The
   refusal band says `none being built there` while the Build panel's queue,
   laid out on the same screen with no scrolling, says `1 being built`. The
   band's sentence is in the **present tense** about **that tile**, and the
   tile is the one the player last pressed — the same one that now carries the
   order. **VERIFIED, read:** the sentence's own locale comment at
   `src/content/default-locale-en.ts:1104-1108` is explicit that the clause is
   about a live state — *"a wall still being built answers `nothing-to-remove`
   here too … and a sentence that said 'no wall' would be false of that case"*
   — so the clause was written precisely to be true of a moment, and the band
   goes on showing it past that moment.

2. **At step E the two bands disagree about whether anything was removed.** The
   Remove press succeeded: it cancelled the in-flight order, and the event band
   said so at the recorder's `+24848ms`:

   > `The order was cancelled. Anything already spent past the point of no
   > return stays spent.`

   The refusal band, still visible, still read `Nothing was removed`. **Two
   sentences about the same press, on two adjacent grid rows, saying opposite
   things.**

3. **B answers a question the player cannot ask.** The sentence names no tile,
   so a second refusal on a different edge is indistinguishable from the first
   — the band is byte-identical and nothing marks it as new.

### Why this is not a bug report

**VERIFIED, read.** All of it is the documented design, and the document is
`docs/adr/0091-what-clears-the-refusal-band.md` by way of
`src/ui/hud/hud.ts:1631-1642`:

> The refusal stops being true the moment the same action succeeds.
>
> Scoped to a *host* refusal of that exact action. A successful build order
> says nothing about a refusal the simulation decided … so a later success may
> not clear it. What clears a simulation refusal is another one, or the session
> ending.

`remove-wall.nothing-to-remove` is a **simulation** refusal
(`hud.alert.refusal.*`, applied through `applySimulationRefusal` at
`src/ui/hud/hud.ts:1679-1693`), so by that rule nothing in act 3 could have
cleared it: no second simulation refusal occurred, and the session did not end.

**So the measurement is not that the code misbehaves. It is that the band's own
docblock one screen earlier asserts something the band does not deliver.**
`src/ui/hud/hud.ts:1286-1295` says a refusal stands *"until the same action
later succeeds, when a newer refusal replaces it, when the session ends, which
are the **first moments** each sentence stops being true"*. Act 3 step C is an
earlier moment than any of the three: the sentence stops being true when
something is built on the tile it is about, and that is neither the same action
succeeding nor a new refusal.

**REASONED, and this is the part that reaches `AGENTS.md`'s fourth
reservation.** A sentence in the present tense, displayed while false of the
world, is the shape the fourth reservation is about, and the identity delivery's
article 5 (*every sentence is true*) binds since ADR 0112 was accepted. What
keeps this short of a clear violation is one word: the sentence says *"that
tile"* and names no coordinates, so a reader who takes *that tile* to mean "the
tile of the press this sentence is about" reads it as past-tense reportage and
is not misled. **JUDGEMENT: that reading is not available to a player**, who
pressed on one tile, got one sentence, then built on that tile and still has the
sentence.

### What is already filed, and what is not

**Independently reproduced in act 4, on a run that did nothing but succeed.**
`calibrate` leaves one probe refusal on the band at `+15590ms`. Act 4 then
built twenty-four walls, zoned a Cell, placed two beds and a toilet, admitted
two prisoners and hired a guard, and crossed seven in-game day boundaries. The
final reading, **5.9 minutes and at in-game `DAY 8` later**:

```
[act4] refusal: "Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either."
```

and at the moment the room was successfully designated, the harness's own log
line carries the two side by side:

```
[act4] designate attempt 1: rooms=1 | panel said ["MUST BE ENCLOSED"] | band "Nothing was removed — …"
```

**`#894` is the closest and it is not this.** It records a refusal from tick 0
still on screen on in-game day 9, and it is about the **alerts list row** being
undismissable — `docs/HUD_PROJECTIONS.md` gap 34, which ADR 0084 declined to
reopen. It prices three fixes and recommends none. **What it does not contain
is a contradiction**: its measurement is that the sentence is *old*, and this
one is that the sentence is *false against a readout on the same screen* and
*contradicted by the other band about the same press*. A search of the
repository's issues for the contradiction returned `#894` and nothing else.

**Act 4 does independently reproduce `#894`'s own measurement on a different
tree, eleven days later**, which is worth recording beside it: the phenomenon it
describes is not a one-off of the session that filed it.

---

## 5. THE OTHER FINDING — MEASURED, act 4: the game acknowledges things now, and this is the first time anybody watched it

`2026-09-04-what-the-game-acknowledges.md` censused the event registry at
**twenty types — 9 bad news, 6 undo, 2 recovery, 1 neither, 0
acknowledgements** — and its own §6 named its weakest claim and said what would
settle it:

> **That no acknowledgement reaches a player by some route other than the
> events channel.** … What would settle it: a text-node sweep of the assembled
> page across a session in which something goes right … which is a playtest and
> not a grep.

**It did not need the other route. The events channel itself grew three
acknowledgements, and act 4 caught two of them on the page.** The band
recorder, sampling `.hud__event` and `.hud-alerts__list` every 120 ms across
the whole 5.9-minute run, logged these:

```
+ 214072ms alerts: "… Cell designated. Day 5 / Info / Clear this alert"
+ 274015ms event:  "Fiona Eriksen has a place in Cell."
+ 280215ms event:  "Carla Tamm has a place in Cell."
```

and the alerts list at the end of the run reads, verbatim:

> `Cell designated. Day 5 / Info / Clear this alert`
> `Fiona Eriksen has a place in Cell. Day 7 / Info / Clear this alert`
> `Carla Tamm has a place in Cell. Day 7 / Info / Clear this alert`
> `Nothing was removed — there is no object on that tile, none being built
> there, and no finished wall there either. / Warning`

**Three `Info` rows about things that went right, each dated and each
dismissible.** The first is the room the player designated; the other two are
the prisoners the player made a place for.

### VERIFIED, read — the registry moved from 20 to 27, and three of the seven are acknowledgements

`SIMULATION_EVENT_TYPES` (`src/simulation/protocol/types.ts`) holds **27**
today against the **20** the census counted at `4c00eaba`. Both counts are
derived by the census's own command rather than by hand. The seven added:

| new type | what it is |
| --- | --- |
| `rooms.zoned` | **acknowledgement** — `'{room} designated.'` |
| `prisoners.housed` | **acknowledgement** — `'{name} has a place in {room}.'` |
| `rooms.needs-cleared` | **acknowledgement** — a room that was not ready now is |
| `rooms.unzoned` | undo |
| `construction.undo-refused-newer-action` | refusal |
| `economy.construction-restored` | recovery |
| `economy.deliveries-restored` | recovery |

The commits, and the dates matter because one of them is the *same day* as the
census:

- `20aa619e`, **2026-09-04** — *"feat(rooms): a designated room says so, which
  is the first thing this game acknowledges (#966)"*
- `659a388b`, **2026-09-10** — *"fix(rooms): confirm a repair and confirm a
  removal in the alerts column (#1006)"*
- `eea81acb`, **2026-09-11** — *"fix(events): publish the two remaining #966
  sites still silent"*

**So the census's `0 acknowledgements` was true of the tree it read and the fix
was landing beside it.** That is not a criticism of the census — it is the
mechanism `docs/AGENT_WORKFLOW.md` §4 warns about, a count rotting because
adding the thing it denies never touches the sentence denying it, and here the
addition was hours away.

### VERIFIED, read — neither is a clock, which is the check the 2026-09-04 census makes necessary

That census took `prisoners.discharged` apart precisely because it *"fires for
a prison that did nothing"* — the gate is a sentence, not good play — so a new
acknowledgement is only one if a player's own action produces it. Both
producers were opened:

- **`rooms.zoned`** is recorded at `src/simulation/runtime/session-commands.ts:314`,
  inside the `DesignateRoom` branch and only after `zone` returned an accepted
  outcome. The comment beside it notes the refused press *"takes the other arm,
  which records a `RefusalLog` reason and calls nothing here"*. **It is the
  player's own press, acknowledged.**
- **`prisoners.housed`** is recorded through
  `src/simulation/events/intake-housed-notice.ts:67`, when an arrival is
  actually given a place. Its own header says what it deliberately does not
  announce: *"Nothing about an arrival still waiting, still being classified,
  or resolved `'failed'` for want of any instance of its room type."* **It
  fires on the payoff of the player's build, not on a timer.**

**Neither has the shape `prisoners.discharged` has.** What is still open — and
§8 says so — is whether either could fire in a prison the player is neglecting;
no act here ran one.

**What this pass adds that a re-census would not:** the sentences reached a
player. They were on `.hud__event`, they were in the alerts list, they were
dated, and they carried `Clear this alert`. That is the part only a run can
establish, and it is what §6 of that record asked for.

### And the contrast is sharper than §4 could make it on its own

Look at the last line of that alerts list. **Three dated, dismissible
acknowledgements sit above one refusal that has neither** — the refusal from
`calibrate`'s probe press at the very start of the act, still there **5.9
minutes and eight in-game days later**, with no `Day` stamp and no `Clear this
alert`.

That is `#894`'s measurement — *a refusal from tick 0 was still on screen on day
9* — reproduced independently on a different tree, and it is now worse in a way
#894 could not have said, because the rows it is sitting beside did not exist
when #894 was filed. **The player now learns from three neighbouring rows, in
the same list, in the same act, that a row carries a day and can be cleared, and
then meets one that does neither.**

## 6. MEASURED, acts 1–2 — the status strip against what is true

Eight chips and a clock. Across the whole naive run, **exactly one chip ever
moved**: `FUNDS`, `25,000 → 24,520`. `ROOMS`, `PRISONERS`, `STAFF`,
`INCIDENTS`, `CONTRABAND`, `EARNED TODAY`, `DAY` and `Through the day` were
identical at every one of act 2's four readings.

Three things are worth separating, because only one of them is a defect
candidate and it is the least obvious one.

- **`0 COVERAGE / Covered` on an empty prison is correct and is defended in
  place.** **VERIFIED, read**, `src/ui/hud/projection.ts:451-459`: *"'Covered'
  is also what an empty prison reads, which is correct for the same reason it
  is correct on the panel: a prison with nobody in a sector has all the
  coverage it needs."* Not a finding; recorded so the next pass does not file
  it.
- **The six queued-but-unbuilt wall orders are on no chip.** The strip has
  nine slots and none of them is work in flight; the queue readout lives in the
  Build panel, which is one section away from the landing section. **REASONED:**
  a player on Overview with a paused clock sees `25,000 → 24,520` and eight
  unchanged chips, and the strip alone does not say where the 480 went. The
  Build panel does, exactly (§2b) — so this is a *placement* observation, not a
  missing figure.
- **The landing section is the only one of the five that tells a newcomer
  nothing about what to do.** Manage carries *"A prison needs a cell before it
  can admit anyone…"*, Schedule carries *"No prisoners yet. Build a cell with a
  bed to take somebody in."*, Zones carries a live requirements checklist and
  Build carries a placement hint. **Overview carries three numbers and no
  sentence**, and it is where `INITIAL_HUD_SHELL_STATE` puts the player. **This
  is not a false sentence and not a missing feature** — `overview-panel.ts`'s
  own header says why the panel exists and what it may not do, and *"it states
  published figures and computes none"* is a deliberate boundary. It is an
  observation about which of five doors is open first. **JUDGEMENT**, and §8
  names it as the weakest thing here.

---

### 6a. MEASURED, act 4 — the strip told the player something true that the build had got wrong

On the informed run the strip moved for the first time, and one badge is the
most useful thing on it:

```
2 PRISONERS / 0 HIGH RISK / 1 STAFF / 2 COVERAGE Covered / 1 ROOMS  1 not ready /
0 INCIDENTS Clear / 0 CONTRABAND / 22,860 FUNDS / 515 EARNED TODAY / DAY 8 / 86%
```

**`1 not ready` is true and is the only thing on screen that says so.** The
prison act 4 built is `buildAndPopulate`'s sealed 6×6 box: four wall runs and
**no door**. The published counts agree the room is otherwise finished —
`rooms=1 roomCapacity=2 accommodationCapacity=2` — so a player reading the
count alone would think the cell was done. **VERIFIED, read:**
`hud.status.rooms-not-ready` counts
`requirementSummary.missingCapability + (access === 'no-way-in' ? 1 : 0)`
(`src/content/default-locale-en.ts:180-187`), and the no-way-in term is the one
that fires here. The badge's own locale comment states its limit in the same
breath — *"Not **why**: a missing bed and a missing door are both counted here
and only the panel tells them apart"* — which is exactly the limit a player
meets.

**REASONED:** the strip is not wrong anywhere this pass could find. The
sentence *"it has been wrong before, in both directions"* in the brief did not
reproduce on this tree in any of the four acts.

### 6b. MEASURED, act 4 — where the money went, and whether the player could tell

Every figure from the tee, beside the same moment's strip:

| moment | `treasuryMinorUnits` | what happened |
| --- | --- | --- |
| new prison | `25,000` | — |
| after buying 60 bricks and 4 beds | `22,340` | **−2,660**, and the Build panel's deliveries block itemised it |
| 24 walls, a zoned cell, 2 beds, a toilet, 2 admits — at `DAY 7` | `22,340` | **0**, because the build consumed stock already paid for |
| after hiring one guard, at `DAY 8` | `22,860` | **+520** |

**The `+520` is the interesting one and the player is not told what it is.**
`Hire Guard · 80` is the control's own label and `dailyWageBillMinorUnits`
becomes `80`, so hiring is not what added money — a day boundary crossed
between the two readings and paid the prison. The Overview panel at that moment
reads:

> `Finances / FUNDS 22,860 / EARNED TODAY 494 / WAGES A DAY 80`

**Three true figures and no rate.** The brief's fourth bullet asks whether a
player can tell whether the prison runs at `+320/day` or `−80/day`, and the
answer on this tree is: **they can compute it and nothing computes it for
them** — `EARNED TODAY` is a partial day's accrual (it read `173`, `348`, `494`
and `515` at four readings inside one day), `WAGES A DAY` is a full day's bill,
and the two are not the same unit. **VERIFIED, read:** that is deliberate —
`src/ui/hud/overview-panel.ts`'s header states *"every figure here arrives on
`HudOverviewViewModel`, already decided, and this file does arithmetic on none
of them"*, with the reason that a second authority would drift from the
treasury. **So the missing rate is a boundary, not an oversight**, and anyone
proposing to fix it in the panel is proposing to cross that boundary.

## 7. What this record does not claim, and what was not reached

- **Nothing about anything drawn.** LFS is in the fourth state in this
  container (see Reproduction); every actor atlas failed to decode in every
  act. No claim here rests on a pixel.
- **Nothing about wall-clock feel.** Act 2 is `1.1m` and act 3 `1.4m` of
  machine time, on a container shared with other agents and a canvas rasterised
  in software — `2026-09-14-where-88s-three-minutes-go.md` prices a single
  press at 1390 ms against 75 ms for exactly this reason. **The "quarter of an
  hour" in the title is the brief's unit, not a measurement**, and no timing
  claim is made.
- **No daily rate was measured.** §6b reports four treasury readings and one
  `+520` across a day boundary. **That is one boundary on one prison and it is
  not a rate**, so the brief's *"a prison can sit at +320/day with nothing
  contained or −80/day with everything contained"* is neither confirmed nor
  refuted here. `2026-08-29-what-a-day-actually-pays.md` is the record that
  took that question seriously and this one does not re-take it.
- **Nothing about a prison under pressure.** No incident, no contraband, no
  escape and no unpaid wage occurred in any act. The nine bad-news event types
  are therefore unobserved here; §5's acknowledgement finding is about the
  three that fired, not about the balance of the twenty-seven.
- **Only one act was run per question.** Nothing below is a repeated
  measurement, and act 3's five steps in particular are one sequence on one
  tile in one container.
- **Nothing about causes.** §4 establishes that the band keeps a sentence and
  that the sentence contradicts a neighbouring readout. It does not establish
  what that costs a player, and no word like *defect*, *regression* or *users
  affected* is used about it.

## 8. The weakest claim, and what would change my mind

**The weakest claim is §6's third bullet — that the landing section telling a
newcomer nothing is worth noticing at all.** (§5's headline is the strongest
thing here and §4 the second; this is the one to attack.) It is a JUDGEMENT about a player
nobody has watched, it rests on one arrangement of five panels measured on one
day, and the counter-argument is strong and already written down in the panel's
own header: a finance readout is what Overview is *for* since ruling 4 of
2026-09-14, and a prompt there would be a second authority on what to do next
competing with four panels that each say it in their own context.

**What would change my mind:** a single real player opening the game and being
observed to either (a) find Build within a few seconds unaided, which would make
the observation empty, or (b) sit on Overview. Neither is available from here.

**The residual doubt about §5 is named and partly closed in §5 itself**, so it
is not repeated here: `rooms.zoned` is a player's own press, `prisoners.housed`
is the payoff of one, and neither is a clock — both producers opened. What is
not established is whether either would fire in a prison the player is
neglecting, which is the test `prisoners.discharged` failed in the 2026-09-04
census and which no act here ran.

**The second strongest claim is §4**, and what would change my mind about it is
narrow and checkable: if `.hud__refusal` were shown to be *hidden* rather than
merely unchanged at act 3 steps C–E, the contradiction would evaporate. It is
not — `panelText` answers `"not laid out"` for a hidden node and never did in
that act, and the 120 ms recorder logged no `<hidden>` transition. A second
container reproducing that is a ten-minute check.
