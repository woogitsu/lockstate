# The first ten minutes — is a newcomer led, or left to guess?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.442** (`3d2a8bda`), in worktree
`/workspace/wt-first10` on branch `playtest/the-first-ten-minutes`. Nothing
under `src/` differs from that commit — `git diff --stat 3d2a8bda -- src/`
is empty — and the strip's own version line confirms it from inside the
running page: `v0.0.442 · d918542`, where `d918542` is this branch's first,
instrument-only commit.

**Question, as given:** *a person who has never seen this game opens it. What
happens in their first ten minutes — and does the game ever tell them what
they are supposed to be doing?*

**Standard, in the owner's own words:** *"gra ma być łatwa przyjazna do
grania, a nie jakieś ukryte funkcje"* — the game should be easy and friendly
to play, not full of hidden features. So the test is not whether the
information exists somewhere. It is whether the player is **led** or **left to
guess**.

---

## The verdict, in one paragraph

**A newcomer is led further than the brief assumed and further than this
repository's own record says — but only ever *after* the fact, by refusals, and
there are exactly two moments where nothing on screen carries the next step.**
Playing with no knowledge but the screen's, a prisoner was admitted into a
zoned, walled cell in **33 interactions and one session**, with no dead end and
no source file consulted. Playing the same goal with the order already known
took **the same 33 interactions** — and reached a *housed* prisoner earning
money, for **1,815 less money**. So the gap between naive and informed is not
effort. It is **outcome and money**: the naive player pays more and ends with a
prisoner who has nowhere to sleep. The two unguided moments are (1) a
**stopped clock**, where twenty-four paid-for orders sit still and the word
*clock* is nowhere on screen, and (2) the leap from the refusal's word
**"enclosed"** to the idea of a **wall**, which the game never makes for the
player.

**Three premises of the brief are refuted below** (§6, §7, §8). One is refuted
by its own numbers: 18-of-21 build rows being refused for want of a room is
*not* what the first ten minutes runs into, because a wall needs no room and a
wall is the first thing the Build tab hands you.

---

## Reproduction

`tests/browser/playtest-2026-09-04-the-first-ten-minutes.playtest.ts`, one act
at a time. Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5363 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-first-ten-minutes.playtest.ts -g "act 4"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | the arrival screen and all five tabs, nothing pressed | `1 passed (34.7s)` |
| 2 | **the naive run** — only what the screen says | `1 passed (9.4m)` |
| 3 | **the informed run** — the order already known | `1 passed (3.3m)` |
| 4 | the newcomer who never presses Play | `1 passed (2.9m)` |

Act 3 was run twice; the first run is reported as an **instrument failure** in
§10 and its numbers are not used. Act 2's 9.4 minutes is, by coincidence,
almost exactly the ten minutes the question asks about — but this container was
at a one-minute load average of ~13 with another browser suite live, so **no
claim below rests on wall-clock time.** Every timing claim is in simulation
ticks, read from `simulation/clock-state` (published every tick, unlike
`simulation/status-counts`).

**LFS.** `git lfs checkout` was run in the worktree first (62 objects, 93 MB),
confirmed by `file public/assets/actors/actor.guard.base.idle.png` →
`PNG image data, 260 x 3104`. Nothing here is a claim about rendering, but a
worktree that had skipped it would have run green with no art.

**Presses were proved to land.** A press on a HUD-covered point submits
*nothing at all* — no command, no refusal, no band — and has cost this
repository three withdrawn findings. Every world point pressed below is checked
with `document.elementFromPoint` first and the test fails if anything but the
canvas is on top (`assertCanvasAt`). `calibrate` measured this run's origin at
**(-304, -574)** at 1440x900, identical across all four acts.

## Claim tiers

- **MEASURED** — produced by one of the four runs above and quoted from its
  output.
- **VERIFIED, read** — a file in this repository was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.

Nothing below is **FROM MEMORY**. Where a claim is about what a *player*
would do rather than what the game did, it is marked **JUDGEMENT** and §11
names the weakest of them.

**The two channels are kept apart.** Sentences are quoted from
`document.querySelector('.hud').innerText` — what is laid out. Numbers like
`rooms`, `roomCapacity`, `treasuryMinorUnits` come from the worker's
`simulation/status-counts` through the tee. No claim below mixes them.

---

## 1. The one true dead end is the stopped clock, and the sentence that would fix it is shipped, keyed, ruled on, and rendered by nothing

**MEASURED, act 4.** A newcomer who draws a prison and never touches the
transport. Four drags, twenty-four orders, money already gone, and then three
observations seven seconds apart:

```
[act4] clock before anything: null tick=-1
[act4] 24 orders placed, clock still null
[act4] funds: 23080
[act4] observation 1: tick=-1 queue="QUEUED\n24 waiting · 0 being built" clock=null speed="PAUSED"
[act4] observation 2: tick=-1 queue="QUEUED\n24 waiting · 0 being built" clock=null speed="PAUSED"
[act4] observation 3: tick=-1 queue="QUEUED\n24 waiting · 0 being built" clock=null speed="PAUSED"
[act4] is the sentence "built while the clock runs" on screen? no
[act4] does any visible sentence contain the word "clock"? no
```

Then the one press that was missing:

```
[act4] after one press of Play: tick=174 queue="QUEUED\n23 waiting · 1 being built" clock={"mode":"running","speed":1}
```

**What the player has, and what they do not.** They have `PAUSED` in the status
strip — a real readout, and a real fix landed since the passes that complained
about `×1`. What they do not have is **any sentence connecting that word to the
twenty-four orders that are not moving**: `/clock/i` is false against the
entire laid-out HUD at the moment it matters. The tick counter never advances
past `-1`, so the day readout stays `DAY 1 / Through the day 0%` and there is
no second symptom to notice either.

**The sentence exists.** **VERIFIED, read:**
`src/content/default-locale-en.ts:1040` —

```
'hud.build.note': 'An order is queued now and built while the clock runs.',
```

— is in the shipped locale, and `src/ui/hud/messages.ts:345` gives it a key
(`buildNote: 'hud.build.note'`). `grep -rn buildNote src/` returns **that one
line and no other**: nothing renders it. `src/ui/hud/build-panel.ts:1207-1230`
says so itself, in a comment that also records the decision:

> `hud.build.note` … is in the shipped locale and in `HUD_MESSAGE_KEY` and is
> rendered by nothing. … **The owner ruled on 2026-08-30 (#639) that it should
> render again, and it still does not, because this panel has no room for
> it.**

**Not re-filed, ranked.** That the key is unrendered is already recorded
(`2026-08-30-what-the-game-never-says.md` §1, reproduced in
`2026-08-30-a-wall-that-buys-itself.md` §2d). **What this pass adds is that it
is the highest-value missing sentence in the game**, because act 4 is the state
a paused-by-default first session actually produces, and one sentence answers
it completely. The panel-space obstacle the comment names is real and is
architecture, not wording — which is why this is ranked here rather than
attempted.

**REASONED, and worth separating from the above:** money is taken at the press
and work is not, so a paused newcomer is 1,920 poorer with nothing built and
nothing on screen tying the two facts together. What *is* on screen about the
money is §6.

## 2. "Enclosed" is never turned into "wall", and that is the only place a newcomer has to guess

**MEASURED, act 2 (N3).** The naive player follows the only instruction the
arrival screen carries — *"A prison needs a cell before it can admit anyone"* —
finds Cell on the Rooms tab, drags a 6×6 rectangle on open ground, and presses
Designate:

```
[act2] N3 refusal band: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
[act2] N3 rooms count: 0
[act2] N3 does the word "wall" appear anywhere on screen now? no
```

The refusal is immediate, correct, full-width and specific about *what is
wrong*. It says nothing about **what to do**, and the whole laid-out HUD at
that moment contains no occurrence of the string `wall`.

**Two things make the recovery shorter than it sounds, and both are measured.**

- The Rooms panel does **not** fold itself away at the refusal. The dump taken
  in the same instant still carries `MUST BE ENCLOSED` beside the other
  requirement lines. `2026-08-30-the-naive-route.md` §"And the panel that was
  explaining the rules folds itself" measured the opposite on `9c453be`; **that
  behaviour does not reproduce at v0.0.442.**
- The Build tab is one press away and arrives **already selected on the brick
  wall**, with a hint that says how to place one:

```
[act2] N4 arm control label: "Place on map"
[act2] N4 note/hint line: "Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera."
```

**VERIFIED, read:** `src/ui/hud/build-panel.ts:807`,
`let selectedId = model.buildables[0]?.definitionId;` — the default selection
is the catalogue's first row, which is `wall-brick` (`Brick wall`).

**So the gap is one inference wide: "enclosed" → "wall".** The game never
writes it. **JUDGEMENT:** for a player who has played any building game it is a
short step; for the owner's stated audience it is the single most likely place
to stall, and it is the one place in the whole naive run where the screen
carries no forward statement at all. What would close it is one clause on the
enclosure refusal naming a wall. That is a wording decision and §12 says what
it must convey rather than authoring it.

## 3. Both catalogues arrive selected on a row that is not what the game told the player to build — and the Rooms panel then teaches that row's requirements

**MEASURED, act 1.** The Rooms tab, as it arrives on a fresh prison, nothing
pressed:

```
ROOM TYPE AND AREA
Staff Room
Selected
Classroom
Canteen
Kitchen
Cell
…
DRAG A RECTANGLE ACROSS THE TILES THIS ROOM SHOULD COVER.
NEEDS AT LEAST 3 × 3 TILES
MUST BE ENCLOSED
NEEDS 1 × DESK
NEEDS 2 × CHAIR
```

The prison's only instruction says **cell**. The tab whose job is designating
one arrives on **Staff Room**, and the requirement block below it — the one
piece of genuine, well-written, forward-looking guidance on the screen — is
therefore teaching the player *the wrong room's requirements*: a desk and two
chairs, and a 3×3 minimum where a Cell's is 2×3 (`[act2] N7` reads
`NEEDS AT LEAST 2 × 3 TILES` once Cell is selected).

**VERIFIED, read:** `src/ui/hud/rooms-panel.ts:444`,
`let selectedId = model.rooms[0]?.roomId;` — same one-line mechanism as the
Build panel's, and on the Build tab it happens to be *right* (a brick wall is
what a new prison needs first) while on the Rooms tab it is *wrong*.

**This is new.** No note in `docs/research/` names the default room selection.
It costs nothing to change and it is the cheapest single improvement to the
first minute that this pass found: making the arrival selection the room the
intake hint names turns a misleading requirement list into a correct one.

## 4. Two tabs give a newcomer different advice about whether a cell needs a bed

**MEASURED, act 1.** Both of these are on screen in the same session, on
different tabs, at a fresh prison:

- Overview → Intake: *"A prison needs a cell before it can admit anyone. **It
  does not need a free bed**: an arrival with none waits until a bed is
  free."*
- Regime → Prisoners: *"No prisoners yet. **Build a cell with a bed** to take
  somebody in."*

**Both are true of the code** — the first is about what admission requires, the
second about what housing requires — and that is exactly why this is a wording
finding rather than a defect. **JUDGEMENT:** a newcomer reads them as
contradicting each other, and the one that is *actionable* (build a cell with a
bed) is on the Regime tab, which is the tab a first-time player has least
reason to open. It is also **the only sentence in the game that names two steps
in the order they must be done in**, which is precisely what §5 shows the naive
player needed.

## 5. Equal effort, unequal outcome: 33 interactions either way, and the naive prison houses nobody

**MEASURED.** Both runs counted every press, drag and keystroke through the
same counter.

| | naive (act 2) | informed (act 3) |
| --- | --- | --- |
| interactions | **33** | **33** |
| `rooms` | 1 | 1 |
| `roomCapacity` | **0** | **1** |
| `accommodationCapacity` | **0** | **1** |
| `prisoners` | 1 | 1 |
| `roomOccupants` | **0** | **1** |
| `stateIncomeAccruedTodayMinorUnits` | **0** | **110** |
| `treasuryMinorUnits` | **20,680** | **22,495** |

```
[act2] NAIVE RUN: 33 interactions, final tick 7455, counts {"tick":7392,"prisoners":1,"prisonersInIntake":1,"rooms":1,"roomCapacity":0,"accommodationCapacity":0,"roomOccupants":0,"treasuryMinorUnits":20680,...}
[act3] INFORMED RUN: 33 interactions, final tick 10540
[act3] counts: {"tick":10483,"prisoners":1,"prisonersInIntake":0,"rooms":1,"roomCapacity":1,"accommodationCapacity":1,"roomOccupants":1,"treasuryMinorUnits":22495,"stateIncomeAccruedTodayMinorUnits":110,...}
```

**The naive run's 33 presses buy a prison that holds nobody.** The prisoner is
admitted (`prisoners: 1`) and stays in intake (`prisonersInIntake: 1`) because
the cell has no bed and no toilet, so it has no capacity, so nothing is earned.

**And the game does say so — in two places, correctly, after the fact.**
MEASURED, act 2 (N10, N11):

```
NOT READY
1 of 1
Cell at 12, 12 is missing
1 × Bed
1 × Toilet
…
ENCLOSURE
Walled in on every side
```

```
[act2] N11 intake panel: "INTAKE\nCollapse\nAdmit a prisoner\n1 waiting with no bed to sleep in\nA prison needs a cell before it can admit anyone. …\nIN INTAKE\n1 of 1\n1 at Cell Assignment"
```

**This is the strongest evidence in the pass that the game does lead.** Once a
room exists, the Rooms panel names the room, its coordinates, exactly what it
is missing and how many; and the Intake panel names the consequence in a
sentence a player can act on (*"1 waiting with no bed to sleep in"*). Both
appear with no fold opened. **The pattern across the whole run is consistent:
every statement of what to do next arrives after the player has already done
something wrong.** That is a design posture, not a bug, and it is the one thing
in this note the owner may want to rule on directly: *guidance in this game is
entirely retrospective.*

## 6. The naive route no longer dead-ends on materials — the walls buy their own bricks, and the panel now says so unfolded

**MEASURED, act 2 (N5).** No `Buy` press, empty stock, four drags:

```
[act2] N5 total build orders placed with an empty stock and a paused clock: 24
[act2] N5 funds now: 23080
```

25,000 − 23,080 = **1,920**, which is 48 bricks at 40 — 24 segments × 2 bricks
each. **VERIFIED, read:**
`src/simulation/construction/definition.ts:89` (`materialsRequired: [{ itemId:
'item.brick', quantity: 2 }]`) and `src/content/procurement-catalog.ts:100`
(`{ itemId: 'item.brick', unitPriceMinorUnits: 40 }`).

The walls then built themselves with nothing else pressed except Play:

```
[act2] N6 observation 1 at tick 197: queue="QUEUED\n23 waiting · 1 being built"
[act2] N6 observation 3 at tick 593: queue="QUEUED\n16 waiting · 1 being built"
```

**Two established records are updated by this, and one of the brief's premises
goes with them.**

- `2026-08-30-a-wall-that-buys-itself.md` §1 established the auto-purchase. It
  **reproduces at v0.0.442 (`3d2a8bda`)**, and its §2b — *"the money the game spends for the
  player is shown only inside the fold the whole change exists so the player
  need not open"* — **no longer holds.** The purchase is stated in the
  laid-out HUD with no fold opened (act 2 N5 and act 4, verbatim):

  ```
  ON THE WAY
  24 bought · 1,920 back if cancelled
  2 × Brick · 80 back
  Cancel
  …
  and 21 more on the way — these arrive first, and the rest come into view as they land.
  ```

- `2026-08-30-the-naive-route.md` §3 named **the quantity** as *"the one place
  the naive route does dead-end"* — that nothing says how much material
  anything needs, and the obvious guess is wrong by a factor of two. **That
  dead end is gone**, because the player never has to name a quantity: the
  order names it. Nothing about the *record* was wrong; the game moved.

**And the cost of not knowing is measurable.** The naive run, following what a
player would reasonably conclude from a stalled queue, opened the Buy
disclosure and bought 60 bricks it already owned:

```
[act2] N9 the Buy disclosure, verbatim: "QUANTITY\n−\n+\nBuy 2 × Brick · 80\nArrives while the clock runs, into the stock a build draws from."
[act2] N9 funds after buying: 20680
```

**2,400 wasted, 12% of the starting balance, for a purchase the game had
already made.** Nothing on screen says the orders had bought their own bricks
in those words — `24 bought` is there and is true, but it does not say *these
orders are already paid for and need nothing from you*.

## 7. Two findings from `2026-09-02-the-first-five-minutes.md` no longer reproduce, and the third's mechanism is now shown in both directions

**Finding 1 of that note — the admit refusal is generic — is FIXED.**
MEASURED, act 2 (N1), pressing Admit on a prison with no rooms:

```
[act2] N1 refusal band: "Nobody was admitted — this prison has no room to hold anybody."
[act2] N1 commands the press submitted: []
```

That note measured *"Nobody was admitted — the request was refused."* and built
a finding on the specific sentence being unreachable. The refusal is now
specific, and it is still a client-side pre-check (no command reaches the
worker).

**Finding 2 — a successful designation leaves a false refusal standing — is
half FIXED, and this pass has the other half.** MEASURED, act 2 (N10): after
the enclosure refusal at rectangle (12,12)-(17,17) and a later success at *the
same rectangle*, the band is gone —

```
[act2] N10 designate attempt 1 at tick 7197: rooms=1 | band ".hud__refusal: not laid out"
```

— while in act 3 a refusal about a *different action* (calibration's own
`RemoveObject` probe) survived a successful designation, thirty interactions
and ~10,000 ticks:

```
[act3] refusal band after admitting: "Nothing was removed — there is no object on that tile, and none being built there."
```

**Both readings are exactly what the keyed supersede predicts** — a success
clears the refusal keyed to *that* rectangle and room type and nothing else —
and having both in one pass explains why two earlier notes disagreed: the
2026-09-02 run's mistake and success were at *different* rectangles. The act 3
sentence is **an instrument artefact of `calibrate`, not a product finding
about admitting**, and is reported here only because it demonstrates the
mechanism.

**The double-render is CONFIRMED (#894).** MEASURED, act 2 (N6): the same
refusal is in the band and in the alerts column at once —

```
alerts="The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side.\nWarning"
```

## 8. Nothing anywhere states a goal, and the brief's fold claim is half wrong

**MEASURED, act 1.** Seventeen controls are visible before `New prison` is
pressed:

```
["Pause","Play at normal speed","Fast forward","Collapse","ALERTS","100%","New prison","Save now","Export","Import","Collapse","Admit a prisoner","OVERVIEW","BUILD","ROOMS","SECURITY","REGIME"]
```

Across all five tabs of a fresh prison, the words `goal`, `objective`,
`tutorial` and `how to` occur **nowhere**. The closest thing the game has to an
objective is §4's Regime sentence. There is no win condition, no task list, no
"first steps" block, and no place a player can go to ask what the prison is
for. **REASONED:** a player therefore has to supply their own goal, which for a
sandbox is a legitimate design choice — but combined with §5's entirely
retrospective guidance it means the first ten minutes are structured as a
sequence of corrections rather than a sequence of invitations.

**The brief's claim that `Cell` is below the fold on the tab whose purpose is
designating one is not true at 1440x900.** MEASURED, act 1:

```
[act1] Build catalogue fold: {"rows":21,"fullyVisible":5,"scrollHeight":924,"clientHeight":223,"visibleLabels":["Brick wall Selected","Wooden door","Bed","Bench","Bookshelf"]}
[act1] Rooms catalogue fold: {"rows":18,"fullyVisible":5,"scrollHeight":837,"clientHeight":252,"visibleLabels":["Staff Room Selected","Classroom","Canteen","Kitchen","Cell"]}
```

`Cell` is the fifth of eighteen rows and **fully visible**. #902's substance —
both catalogues show about a quarter of themselves (5 of 21, 5 of 18) — is
confirmed with numbers; the specific consequence attributed to it is not,
at this viewport. It may well hold at a shorter one, and this pass measured
only 1440x900.

## 9. What this pass checked and found genuinely right

Recorded because a note that only lists faults mis-states the state of the
game, and because breaking any of these while fixing the above would be a
regression.

- **The refusals are specific, immediate, full-width and correct.** All three
  this pass produced named the actual condition: *"this prison has no room to
  hold anybody"*, *"the area you drew is open on at least one side"*, and
  *"there is no object on that tile, and none being built there"* (the last
  from calibration's own probe). A fourth — an object placed outside a zoned
  room — belongs to `2026-08-30-the-naive-route.md` and was not re-run here.
- **The arrival screen does not pretend a prison exists.** `No prisons yet.` /
  `Local saves only — no network required.` / funds `0` / day `--`, and 25,000
  and day 1 appear only after `New prison`.
- **`PAUSED` is on the strip**, in both a sighted readout and the transport's
  pressed state. The `×1`-while-stopped defect earlier passes reported is
  fixed.
- **The Rooms panel's `NOT READY` block is the best piece of writing in the
  game**: it names the room, its coordinates, and each missing object with a
  count, and it appears with no fold opened.
- **`ENCLOSURE / Walled in on every side`** confirms the thing the player just
  achieved, which is the only positive acknowledgement of progress found
  anywhere in the run.
- **Designation succeeded on the first press in both runs** once the walls were
  up (act 2 tick 7,197; act 3 tick 7,206), so the retry loop earlier passes
  needed for a snapshot race did not trigger here.
- **The intake panel reports its own backlog**: `IN INTAKE / 1 of 1 / 1 at Cell
  Assignment`.

## 10. This pass's own instrument was wrong once, and it is recorded rather than hidden

**The queue poll never terminated, and it printed a number that looked like a
measurement.** An empty build queue is not `0 waiting · 0 being built` — the
whole `QUEUED` block is *removed*
(`2026-08-30-a-wall-that-buys-itself.md` §2c). My poll matched only the zero
readout, so it sat out its budget against a queue that had been empty for
minutes, and act 3's first run then printed:

```
[act3] the queue emptied 23417 ticks after the wall runs
```

**That number is my poll giving up, not anything the game did.** With the
`not laid out` clause added — which `waitForQueueEmpty` in
`playtest-harness.ts` has always carried, and which I re-derived badly — the
same act on the same tree reads:

```
[act3] the queue emptied 495 ticks after the wall runs
```

Forty-seven times smaller. Act 3's first run is discarded and act 2's `N9 the
queue did NOT empty within the poll budget` line is likewise not evidence of
anything. This is the fifth instrument in this directory to be caught by its
own logging rather than by an assertion, and the lesson is the shared harness's:
re-implementing one of its helpers loses the finding baked into it.

**And one inherited instrumentation rule needs an amendment.** #569's
retraction gave this directory *"print the container, not the parts"*, with the
rationale that `innerText` reflects layout so a shut fold is correctly absent.
True for a fold; **false for a scroll container.** Act 1 measured the Build
catalogue at `fullyVisible: 5` of 21 rows while the same `innerText` dump lists
all twenty-one labels. So every guidance-vocabulary reading in this note is an
**upper bound** on what a player can read without scrolling, and each claim
that a word was *reachable* is checked against the measured fold instead. The
instrument's own docblock now says so.

## 11. Weakest claim, and what would change my mind

**The weakest claim in this note is §2's — that the "enclosed" → "wall"
inference is the only place a newcomer has to guess.** It is weak for a
structural reason: **my naive run is a model of a newcomer, not a newcomer.**
The script makes that exact leap immediately and without hesitation — it opens
the Build tab straight after the enclosure refusal — so the run *demonstrates
that the recovery is short* and **cannot** demonstrate that a person would find
it. A scripted player never wanders, never re-reads, never gives up, and never
tries the wrong tab twice.

**What would change my mind, cheapest first:**

1. **A run that exhausts the Rooms tab before opening Build.** Press `Remove
   rooms`, open `ENTER COORDINATES`, try a second room type, re-drag a bigger
   rectangle — and count how many of those the game answers with something
   that mentions a wall. If several plausible next moves each produce a refusal
   that still never says "wall", §2 is stronger than stated. If any of them
   does say it, §2 is wrong.
2. **One person, ten minutes, no instructions.** That is the only measurement
   that settles §2, §4 and §8, and no playtest in this directory can substitute
   for it.
3. **A shorter viewport.** Every fold number here is 1440x900. At 900x600 the
   Rooms list is already on its floor (the table in
   `src/ui/hud/build-panel.ts:1207-1230` records that for the Build panel), so
   `Cell` may well be below the fold there and §8's correction would narrow to
   "not true at 1440x900".

**Second-weakest: §5's interaction counts are equal by coincidence, and the
table should not be read as "naive costs the same".** Both runs happen to be
33 because the naive run's four wasted steps (a refused Admit, a refused
Designate, a needless Buy, a tab hunt) are offset by the informed run's three
purchases and two furniture placements. A naive run that stalls at §1's paused
clock, or that never makes §2's inference, has no bound at all. **The count is
evidence that the naive route is *not* longer, and it is not evidence that it
is equally good** — the outcome columns are what carry that.

## 12. What a fix must convey, without authoring the sentences

The choice of words is ours as of 2026-09-04 (*"Sam decyduj zawsze, jak zacznę
grać to ujednolicimy"*), but a sentence must be **true of the code**, and this
note is not the place to ship strings. So, in order of value:

1. **On the Build panel, at any moment an order is queued: that an order is
   paid for now and built while the clock runs.** This is `hud.build.note`
   verbatim, it is already shipped and keyed, and the owner already ruled it
   should render (#639). The obstacle is panel space, which is a layout
   decision, not a wording one.
2. **On the enclosure refusal: that the area needs a wall around it, and that
   walls are on the Build tab.** Must not promise a control that does not
   exist; the Build tab does arrive with a brick wall selected, so naming the
   tab is true.
3. **The arrival selection of the Rooms catalogue should be the room the intake
   hint names.** Not a sentence at all — a one-line default — and it turns a
   misleading requirement list into the correct one.
4. **The two bed sentences (§4) should agree.** Either the intake hint says
   what the Regime tab says, or the Regime tab stops implying a bed is required
   to admit.

## 13. What this pass did not reach

- **A second viewport.** Everything is 1440x900.
- **Anything after the first prisoner is housed.** No day boundary, no wages,
  no guard, no incident — those are other passes' ground
  (`2026-09-04-can-this-prison-fail.md`,
  `2026-09-04-does-anyone-answer-an-incident.md`).
- **The keyboard route.** Every interaction counted here is mouse.
- **Whether a reload preserves any of it** —
  `2026-09-02-what-does-not-survive-a-reload.md` owns that.
- **The 18-of-21 refused build rows.** They are real
  (`2026-09-03-does-building-feel-good.md` §1) and the first ten minutes never
  meet them, because a wall needs no room and a wall is what the panel hands
  you first. That is why the brief's framing of the ordering problem does not
  match what a naive run actually hits.
- **Filed elsewhere and deliberately not re-filed here:** the Build panel's
  zero digits (#901), the 0px scrollbar gutter (#902), the minimap that says it
  is unavailable and then answers a click (#903), the Bed that says to click a
  tile edge (#904), the roster row's two `Low`s (#909), the Overview tab's 52
  identical lines of 58, and the 19-interaction usable cell. Each is cited
  above where it bore on the run and none is re-measured.
