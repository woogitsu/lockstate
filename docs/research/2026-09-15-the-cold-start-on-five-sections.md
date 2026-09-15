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
visible on one screen without scrolling.** §4 is the finding; §5 is the
acknowledgement census, which came back at zero again and this time from a
running page rather than from a grep.

**Two of the 2026-09-04 record's headline findings are refuted by this run**
and are refuted in the good direction — §2. That is the more important half of
this document and it is deliberately first.

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

**`#894` is the closest and it is not this.** It records a refusal from tick 0
still on screen on in-game day 9, and it is about the **alerts list row** being
undismissable — `docs/HUD_PROJECTIONS.md` gap 34, which ADR 0084 declined to
reopen. It prices three fixes and recommends none. **What it does not contain
is a contradiction**: its measurement is that the sentence is *old*, and this
one is that the sentence is *false against a readout on the same screen* and
*contradicted by the other band about the same press*. A search of the
repository's issues for the contradiction returned `#894` and nothing else.

---

## 5. MEASURED, acts 1–3 — nothing acknowledged anything, and this is the first time that was measured by playing

`2026-09-04-what-the-game-acknowledges.md` censused twenty event types off
`SIMULATION_EVENT_TYPES` and found **9 bad news, 6 undo, 2 recovery, 1 neither,
0 acknowledgements**. Its §6 names its own weakest claim and says exactly what
would settle it:

> **That no acknowledgement reaches a player by some route other than the
> events channel.** … What would settle it: a text-node sweep of the assembled
> page across a session in which something goes right … which is a playtest and
> not a grep.

**Every band sentence that appeared in act 3's whole run, in order, is two:**

```
+      0ms refusal: "Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either."
+      0ms alerts:  "Nothing was removed — … Warning"
+  24848ms event:   "The order was cancelled. Anything already spent past the point of no return stays spent."
+  24848ms alerts:  "Nothing was removed — … Warning
                     The order was cancelled. Anything already spent past the point of no return stays spent. Day 1
                     Warning
                     Clear this alert"
```

One refusal and one undo. **In act 2, six wall orders were placed, paid for and
queued, and not one band said anything at all** — `.hud__event` read
`not laid out` at every reading in that act.

**And a second asymmetry falls out of the same log, which nothing had
recorded.** In the alerts list the *cancellation* row carries `Day 1` and a
`Clear this alert` control; the *refusal* row carries neither. That is #894's
undismissable row observed from the other side — the player learns from the row
beneath that rows can be cleared and dated, and then meets one that is neither.

**What this does not settle.** The sweep §6 asked for is a *diff* of every laid
out text node across a moment when something goes right — a first room zoned, a
first bed standing, a first admission. Act 5 of the instrument does exactly
that and **is not reported here, because it had not returned when this record
was written.** §7 says so under "what was not reached", and the zero above is
therefore bounded by what acts 1–3 reached: **no acknowledgement on any surface
across six placed orders, one designation, one admission attempt and one
successful cancellation.**

---

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
- **Acts 4 and 5 did not return inside this pass's budget.** Act 4 (the
  informed run through `buildAndPopulate`, two admits, a guard, a day
  boundary) and act 5 (the text-node diff across four moments something goes
  right) are committed and runnable and are **not reported**. Three acts were
  obtained against a budget of five. What they would have settled: §5's
  remaining half, and the brief's *"a prison can sit at +320/day with nothing
  contained or −80/day with everything contained"* — **no daily figure appears
  anywhere in this record, because no act of mine crossed a day boundary.**
- **Nothing about causes.** §4 establishes that the band keeps a sentence and
  that the sentence contradicts a neighbouring readout. It does not establish
  what that costs a player, and no word like *defect*, *regression* or *users
  affected* is used about it.

## 8. The weakest claim, and what would change my mind

**The weakest claim is §6's third bullet — that the landing section telling a
newcomer nothing is worth noticing at all.** It is a JUDGEMENT about a player
nobody has watched, it rests on one arrangement of five panels measured on one
day, and the counter-argument is strong and already written down in the panel's
own header: a finance readout is what Overview is *for* since ruling 4 of
2026-09-14, and a prompt there would be a second authority on what to do next
competing with four panels that each say it in their own context.

**What would change my mind:** a single real player opening the game and being
observed to either (a) find Build within a few seconds unaided, which would make
the observation empty, or (b) sit on Overview. Neither is available from here.

**The strongest claim is §4**, and what would change my mind about it is
narrow and checkable: if `.hud__refusal` were shown to be *hidden* rather than
merely unchanged at act 3 steps C–E, the contradiction would evaporate. It is
not — `panelText` answers `"not laid out"` for a hidden node and never did in
that act, and the 120 ms recorder logged no `<hidden>` transition. A second
container reproducing that is a ten-minute check.
