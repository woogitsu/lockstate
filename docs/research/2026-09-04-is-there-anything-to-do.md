# Once the first cell works — is there anything to do?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.451** (`0e614c71`), in worktree
`playtest/is-there-anything-to-do`. Nothing under `src/` differs from that
commit, and the running page says so from the inside: every screen dump below
carries `v0.0.451` and the short sha of one of this branch's
instrument-only commits.

**Question, as commissioned:** *once the first cell works and the first
prisoner sleeps in it, is there anything to do? Something to build toward, a
pressure that grows, a choice that matters, a number worth watching — or does
it flatten into a screen where nothing further is asked of you?*

**Standard:** the owner's, *"Żeby gra była fajna i super, a nie po taniości
zrobiona"*, and `AGENTS.md`'s *"a change that is right in every test and makes
the game duller has not succeeded."*

---

## The answer, in one paragraph

**There is something to do, the game asks for it, and it says what it is — so
the commissioning hypothesis that the mid-game "asks little" is refuted, in
§1, with numbers.** Packing eight more beds into the cell that was already
standing and pressing *Admit* eight times took `prisonersCovered` from 4 to
**0** and `prisonersUnderstaffed` from 0 to **12** in one step, changed the
status strip from `COVERAGE 4 · Covered` to `COVERAGE 0 · Understaffed`, put
*"Hire 1 more to cover this population."* on the Security tab, and then
produced **five assaults in about five in-game days**, every one of which
lapsed uncontained and said so on the alerts band in a sentence. **What is thin
is not the pressure — it is the decision, and the second room.** A guard costs
80 a day and covers eight occupants while an occupied bed pays 300 a day, so
fully staffing a prison costs **10 per place-day against 300 of income**, wages
are the only recurring cost in the game, and the treasury rose monotonically in
every measurement here — including straight through the five assaults. And the
one thing a player might spend the money on does not work: a correctly built,
correctly furnished shower room, designated and accepted on the first attempt,
**served nobody** — `Hygiene` went from 9% to **0%** on all four prisoners over
the two days after it opened — because neither it nor the cell had a door,
while every readout the player has said the opposite: `ENCLOSURE · Walled in on
every side`, no *not ready* warning, and `Hygiene 0%` with no cause named. §2
is that finding **and the sample that could have refuted it and did not**: the
same prison rebuilt with one wooden door per room reached `Hygiene 98%` with
prisoners visibly `Showering` and `Heading to Showering`. **The best news in
this record is what happened next in that prison** — the lowest-need column on
the roster moved off `Hygiene` by itself and onto `Recreation`, then fell 89 →
70 → 57 → 43 → 30% over four days, naming the next room to build without being
asked. **That column is a working to-do list, and it is on the tab a newcomer
opens last.**

---

## Reproduction

`tests/browser/playtest-2026-09-04-is-there-anything-to-do.playtest.ts`, one act
at a time. Nothing in CI collects it: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=43303 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-is-there-anything-to-do.playtest.ts -g "act 2"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | one cell, four prisoners, one guard, then **nothing pressed for three in-game days** | `1 passed (7.3m)` |
| 2 | **growth**: twelve beds in the same room, twelve prisoners, then a second cell | `1 passed (7.3m)` |
| 3 | the two rooms a cell cannot replace — a shower room and a yard | run A `1 failed (8.4m)` (§10b), run B `1 passed (10.2m)` |
| 4 | twenty in-game days at 4×, watching for a sentence to end | *(see §12)* |
| 5 | **the same prison with a door in each room** — act 3's refuting sample | `1 passed (7.3m)` |

## Claim tiers

- **MEASURED** — produced by one of the runs above and quoted from its output.
- **VERIFIED, read** — a file was opened at the line cited, in the played
  worktree at v0.0.451.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — about what a *player* would feel rather than what the game
  did. §11 names the weakest.

Nothing here is **FROM MEMORY**.

**The two channels are kept apart and never mixed.** Sentences are quoted from
`document.querySelector('.hud').innerText` — what is laid out. Numbers come
from the worker's `simulation/status-counts` through the tee, and ticks from
`simulation/clock-state`, which publishes every tick where the counts channel
goes quiet when nothing changes (`statusCountsEqual`,
`src/simulation/worker/status-counts.ts`).

**Which readings are upper bounds.** `innerText` does not respect a scroll
container's clipping, so **every quoted screen dump is an upper bound on what a
player can read without scrolling.** The control census shows this from the
inside: it records whether each control has a box a pointer could reach, and
the twenty-one Build catalogue rows are all `NO BOX` on the Overview tab while
their labels still appear in the dump. The counts, the ticks, the delta
vectors, the clearance map, the control census and the command counts are
**measurements**, not upper bounds.

**Presses were proved to land.** A press on a HUD-covered point submits nothing
at all — no command, no refusal, no band — and has cost this repository three
withdrawn findings. Every world point pressed is checked with
`document.elementFromPoint` first and the act fails if anything but the canvas
is on top. `calibrate` measured the world origin at **(−304, −574)** at
1440×900, identically in every act.

---

## 0. The clearance map, because three acts are built on it

**MEASURED, act 1.** The visible tile grid at 1440×900, `'.'` = clear canvas,
`'#'` = something of the HUD's on top:

```
clearance map, tiles x=5..26 y=9..22 ('.' = clear canvas, '#' = something on top)
      5678901234567890123456
y= 9  ######################
y=10  ......................
y=11  ..................####
y=12  ..................####
y=13  ..................####
y=14  ..................####
y=15  ######............####
y=16  ######............####
y=17  ######............####
y=18  ######............####
y=19  ######............####
y=20  ######............####
y=21  ######............####
y=22  ........######........
```

**The largest clear rectangle a player can build in without moving the camera
is twelve tiles by eleven: x = 11..22, y = 11..21.** The starter 6×6 cell at
(12,12)–(17,17) — the rectangle `buildAndPopulate` and every prior playtest
uses — sits in the middle of it.

**This settles the handover's claim in the other direction.** The brief warns
that a handover called tile (12,12) off-screen at 1440×900 and that this is
wrong. It is wrong: (12,12)'s centre is at screen (496, 226) and the map shows
it clear, as it shows every tile the starter cell occupies. What the brief did
*not* have is the size of that clear area, and the size is what matters for
growth: **a second 6×6 cell does not fit beside the first**, which is why act 2
built a 3×4 one, and **an 8×8 `room.yard` does not fit beside it either** (§6).

---

## 1. Growth *does* generate pressure, the game *does* name it, and not answering it *does* hurt — the brief's hypothesis is refuted

**MEASURED, act 2.** One prison, grown in one step. Before: four prisoners,
four beds, one guard, at tick 9,862.

```
[act2] ONE CELL, four prisoners, one guard: {"tick":9862,"counts":{
  "prisoners":4,"staff":1,"rooms":1,"roomCapacity":4,"accommodationCapacity":4,
  "roomOccupants":4,"occupiedPlaces":4,"prisonersCovered":4,
  "prisonersUnderstaffed":0,"prisonersUnguarded":0,"activeIncidents":0,
  "treasuryMinorUnits":23250,"stateIncomeAccruedTodayMinorUnits":131,
  "dailyWageBillMinorUnits":80,"conditions":[]}}
```

Eight more beds went into the same 6×6 cell and *Admit* was pressed eight
times. After, at tick 17,906:

```
[act2] DELTA four in one room -> twelve in one room
ticks 9862 -> 17906 (8044 ticks)
  MOVED (9/21): accommodationCapacity: 4 -> 12 | occupiedPlaces: 4 -> 12 |
    prisoners: 4 -> 12 | prisonersCovered: 4 -> 0 | prisonersUnderstaffed: 0 -> 12 |
    roomCapacity: 4 -> 12 | roomOccupants: 4 -> 12 |
    stateIncomeAccruedTodayMinorUnits: 131 -> 1660 | treasuryMinorUnits: 23250 -> 27460
  STILL (12/21): activeIncidents, conditions, contrabandDiscovered,
    dailyWageBillMinorUnits, prisonersHighRisk, prisonersInIntake,
    prisonersUnguarded, rooms, staff, staffUnassigned,
    treasuryOverdraftFloorMinorUnits, unpaidWagesMinorUnits
```

**`prisonersCovered` 4 → 0 and `prisonersUnderstaffed` 0 → 12 is the pressure,
and it is not a hidden number.** The status strip changed with it. Quoted
verbatim from `.hud` at that state (UPPER BOUND):

> `12` / `PRISONERS` … `1` / `STAFF` … `0` / `COVERAGE` / `Understaffed`

and the Security tab carried the fix as a sentence with a figure:

> `GUARD COVERAGE` / `1 of 2` / `Understaffed` / **`Hire 1 more to cover this
> population.`**

**VERIFIED, read.** The rule behind that "of 2" is one guard per
`DEFAULT_SECTOR_PRISONERS_PER_GUARD` occupants
(`src/simulation/security/sector-staffing.ts:147`), applied at `:190` as
`Math.ceil(occupantCount / DEFAULT_SECTOR_PRISONERS_PER_GUARD)`. Twelve
occupants ask for two guards; the prison had one.

**And the pressure had teeth.** Over the rest of the act — about five in-game
days at twelve prisoners with one guard — the worker pushed **ten**
`simulation/event` messages, in five identical pairs:

```
[act2] events over the whole act: ["incidents.assault-opened","incidents.all-clear-after-lapse",
  "incidents.assault-opened","incidents.all-clear-after-lapse","incidents.assault-opened",
  "incidents.all-clear-after-lapse","incidents.assault-opened","incidents.all-clear-after-lapse",
  "incidents.assault-opened","incidents.all-clear-after-lapse"]
```

They reached the screen. Quoted from `.hud` at the end of the act (UPPER
BOUND):

> `ALERTS`
> `A fight has broken out between two prisoners. 5× Day 13`
> `Warning`
> `Clear this alert`
> `No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. 5× Day 13`

**So the answer to "is anything asked of you" is yes, three times over: a badge
changes, a sentence names the fix and its size, and ignoring it produces
assaults reported in words.** The brief's hypothesis is **refuted on the
asking**, and this is the more valuable result of the run.

**One thing that reads as a contradiction and is not.** At the same moment the
band said a fight had broken out five times, the strip read
`0 · INCIDENTS · Clear`. Both are true: the strip's badge is the count of
incidents open *now* and none was open at that instant; the band carries the
history with a `5×` repeat count. Two channels doing different jobs, each
honestly.

**Also landed since the brief was written.** The brief lists, as an open
finding, *"one all-clear sentence serving both a handled incident and an expired
one."* It is fixed on `origin/main` at v0.0.451:
`incidents.all-clear-after-lapse` is its own event type
(`src/simulation/protocol/types.ts:1686`), the UI grades it `'warning'` rather
than `'info'` (`src/ui/simulation-events.ts:283-284`), and it has its own
sentence at `src/content/default-locale-en.ts:1064` — the one quoted above. The
five lapses this run measured are what proved it renders.

---

## 2. The room a growing player would build does not work, and every readout says it does

**This is the finding this record exists for, and §2.3 is the sample that could
have refuted it.**

### 2.1 What was built, and what happened

**MEASURED, act 3 run B.** One 6×6 cell, four prisoners, one guard, then four
in-game days with nothing else built. All four prisoners were doing the same
thing, and the reason is §4's:

```
[act3] needs with no shower room and no yard: 4 roster row(s);
  detail = "Adan Xavier | Medium | Hunger | 99% | Sleep | 81% | Hygiene | 9% |
    Bladder | 100% | Safety | 100% | Recreation | 31%";
  roster = "PRISONERS | 4 of 4 | Adan Xavier | Medium | Using Toilet | Hygiene | 8% |
    Carla Abara | Low | Using Toilet | Hygiene | 9% | Delia Tamm | Low | Using Toilet |
    Hygiene | 10% | Jonas Ueda | Minimal | Using Toilet | Hygiene | 11%"
```

**`Hygiene` between 8% and 11% on every prisoner in the prison, named on
screen, with the need's own word beside it.** That is the game telling a player
something is wrong, clearly. `room.shower-room` is the only room that serves it
(`action.shower`, `hygiene +4` a tick,
`src/simulation/prisoners/actions.ts:132-134`), so a shower room is the answer.

One was built, correctly and completely: a 3×3 at (19,15)–(21,17), twelve wall
segments in four runs, **designated and accepted on the first attempt**, then
two `shower-head-brick` orders placed inside it, each producing exactly one
command and no refusal:

```
[act3] the shower room was accepted on attempt 1
[act3] shower head at (19,15): 1 command(s) | band "Nothing was removed — …"
[act3] shower head at (19,17): 1 command(s) | band "Nothing was removed — …"
```

(The band text is the stale refusal from `calibrate`'s probe at the start of
the act, not a response to these presses; both presses submitted a command,
which is the measurement.)

**What building it changed, of the twenty-one counts the worker publishes:**

```
[act3] DELTA neglected -> shower room built
ticks 18667 -> 26927 (8260 ticks)
  MOVED (3/21): rooms: 1 -> 2 | stateIncomeAccruedTodayMinorUnits: 934 -> 264 |
    treasuryMinorUnits: 26610 -> 29730
```

**One number a player can see: the `ROOMS` badge, 1 → 2.** The other two are the
clock's own — the accrual resets at each day boundary and the treasury grows on
its own (§3).

**And two in-game days later, hygiene was worse, not better:**

```
[act3] DELTA over two days with a shower room
ticks 26927 -> 32109 (5182 ticks)
  MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 264 -> 455 | treasuryMinorUnits: 29730 -> 31970
[act3] needs two days after the shower room: 4 roster row(s);
  roster = "PRISONERS | 4 of 4 | Adan Xavier | Medium | Association | Hygiene | 0% |
    Carla Abara | Low | Association | Hygiene | 0% | Delia Tamm | Low | Association |
    Hygiene | 0% | Jonas Ueda | Minimal | Association | Hygiene | 0%"
```

**`Hygiene` 8–11% → 0% on all four, and not one of them ever went to the
shower.** Across every act in this record the roster showed prisoners doing
`Using Toilet`, `Association`, `Sleeping` and `Eating` — all four of which
target `own-accommodation` — and **never once** an action targeting a room:
`Showering`, `Heading to Showering`, `Yard`, `Meal` in a canteen. Zero
room-targeted actions in five acts.

### 2.2 Why, from the code, and what the screen said instead

**VERIFIED, read.** A wall and a door write into the *same* edge slot, and a
door is only a doorway because navigation consults the door registry first.
`src/simulation/navigation/traversal.ts:23-36`:

> What must not differ between them is the ordering: **a registered door
> decides the edge, whatever value the edge layer holds.** That is not a
> convention, it is the only reason a doorway is not a wall — a completed
> `door-wooden` order writes `DOOR_EDGE_NUMERIC_ID` into the same edge slot a
> wall does … **no registered door is an impassable wall**.

**VERIFIED, read.** And the room-enclosure verdict deliberately does not tell
you about that. `src/simulation/rooms/enclosure.ts:70-78`:

> A completed door order now writes `DOOR_EDGE_NUMERIC_ID` into the same layer
> *and* registers a `DoorDefinition`, so this function reports a room with a
> door in its wall line as `'sealed'` — correctly … **So a `'sealed'` answer no
> longer implies "no way in"**, and an `'open'` one still means exactly what it
> says.

That sentence is precisely right about the predicate and it is the reason the
player is misled, because `'sealed'` is what the Rooms panel renders as
**`'Walled in on every side'`** (`src/content/default-locale-en.ts:1958`). So
the readouts a player has at the moment their shower room is finished and
useless are:

- `ENCLOSURE` / **`Walled in on every side`** — true, and reads as *done*;
- **no `Not ready` block at all.** The panel's only completion warning is
  driven by `unfinishedRoomIds`, which filters
  `row.requirementSummary.missingCapability > 0`
  (`src/ui/simulation-room-needs.ts:101-111`) — a room short of an *object*.
  A room nobody can walk into is short of nothing;
- `ROOMS` / `2` on the strip;
- `Hygiene 0%` on four roster rows, with **nothing naming a cause**.

**VERIFIED, read, in both directions.** No string in the shipped locale mentions
a door in connection with reaching a room:
`grep -n 'door' src/content/default-locale-en.ts` returns the buildable's name
(`'Wooden Door'`), the door-state words, and nothing else. And the Rooms panel
carries no list of the prison's existing rooms at all — act 3's dump of that
tab, with a working cell and four prisoners in it, is the eighteen-type
catalogue, the coordinate entry, `Draw on map`, `Remove rooms`, the selected
*type's* requirement list, and the enclosure verdict for the current drag.
Nothing else.

### 2.3 The sample that could have refuted it — act 5, and it did not

**MEASURED, act 5.** The same prison, hand-built rather than through
`buildAndPopulate`, with **one wooden door in each room** and nothing else
different: the cell at (12,12)–(17,17) walled except the east edge `18,14
west`, the shower room at (19,15)–(21,17) walled except the west edge `19,16
west`, and column 18 the corridor between them. Both doors submitted the order
they were aimed at:

```
[act5] cell door at (848,354), wanted 18,14 west: 1 command(s) ->
  [{"type":"PlaceBuildOrder","definitionId":"door-wooden","x":18,"y":14,"edge":"west", …}]
[act5] shower door at (912,482), wanted 19,16 west: 1 command(s) ->
  [{"type":"PlaceBuildOrder","definitionId":"door-wooden","x":19,"y":16,"edge":"west", …}]
```

Both rooms were then designated **on the first attempt** — so a door does not
cost you the `enclosed` requirement, exactly as `enclosure.ts` says — and every
object went in with one command and no refusal: four beds, a toilet, two shower
heads. Four prisoners were admitted and one guard hired, at
`accommodationCapacity: 4`, `occupiedPlaces: 4`.

**Then four in-game days, the same budget act 3 gave the doorless prison. This
is the whole result:**

| reading | lowest need on each of the four roster rows | what they were doing |
| --- | --- | --- |
| on admission | `Bladder 60, 60, 60, 65%` | `Association` ×4 |
| day +1 | `Recreation 70, 72, 73, 75%` | `Sleeping` ×4 |
| day +2 | `Recreation 57, 58, 59, 60%` | `Sleeping` ×4 |
| day +3 | `Recreation 43, 44, 46, 47%` | `Sleeping` ×3, **`Heading to Sleeping`** |
| day +4 | `Recreation 29, 31, 32, 34%` | **`Showering`**, **`Heading to Showering`**, `Using Toilet`, **`Heading to Using Toilet`** |

and the inspector at day +4 read:

> `Rosa Engel` / `Low` / `Hunger` `98%` / `Sleep` `81%` / **`Hygiene` `98%`** /
> `Bladder` `98%` / `Safety` `100%` / `Recreation` `30%`

**`Hygiene 98%` where the doorless prison reached `0%`, and the roster shows
prisoners walking — `Heading to Showering`, `Showering` — where five previous
acts had produced not one room-targeted action.** The refuting sample confirms
the claim instead of refuting it: **the shower room works, and the only thing
act 3's prison was missing was a door.**

**Two further things this sample establishes, and the second is a good one.**

1. **The Rooms panel says the same sentence either way.** Act 5's Rooms tab,
   with a doored cell and a doored, working shower room, reads
   `ENCLOSURE` / `Walled in on every side` — **the identical text act 3's
   sealed, useless shower room showed.** So that readout cannot distinguish a
   room prisoners can enter from one they cannot, and it is the only readout
   about a room's boundary that a player has.
2. **When the room works, the game immediately names the *next* thing to
   build.** The lowest-need column on each roster row moved off `Hygiene` the
   moment showering became possible and onto `Recreation`, then walked
   *downward on its own* over four days — 89 → 70 → 57 → 43 → 30% — which is
   the yard, the next room in the sequence
   (`action.yard-recreation`, the only unblocked provider of `recreation`,
   `src/simulation/prisoners/actions.ts:165-167`). **That column is a working
   to-do list**, it re-points itself as each item is done, and it is on a tab a
   newcomer opens last. §13 says what it costs to read.

**And the delta vector is the same as an empty prison's**, which is §7's point
arriving from a different direction:

```
[act5] DELTA over four days with doors
ticks 17998 -> 28726 (10728 ticks)
  MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 599 -> 1163 | treasuryMinorUnits: 21210 -> 25690
  STILL (19/21): accommodationCapacity, activeIncidents, conditions, contrabandDiscovered,
    dailyWageBillMinorUnits, occupiedPlaces, prisoners, prisonersCovered, prisonersHighRisk,
    prisonersInIntake, prisonersUnderstaffed, prisonersUnguarded, roomCapacity, roomOccupants,
    rooms, staff, staffUnassigned, treasuryOverdraftFloorMinorUnits, unpaidWagesMinorUnits
[act5] events over the whole act: []
```

**Two of twenty-one counts moved and no event fired, in the best-run prison in
this record** — this one measured with the *fixed* event reader (§10a), so the
zero is a reading rather than a bug. A prison where four prisoners are showering
on schedule with full hygiene publishes exactly what an idle one does.

### 2.4 What a fix must convey, without authoring the sentence

**No player-visible string is authored here** (the locale file is another
agent's this wave). What has to be said, and where, from the measurements
above:

- **That a room nobody can walk into is not finished.** The place is the Rooms
  panel's completion warning, which already exists and already has the right
  shape — `'{room} at {x}, {y} is missing'` plus `'{count} × {object}'`
  (`src/content/default-locale-en.ts:2001-2005`) — and already has the wrong
  predicate: `unfinishedRoomIds` filters on a missing *object*
  (`src/ui/simulation-room-needs.ts:101-111`), so a room short of a *way in* is
  short of nothing. What is missing on the projection side is a reachability
  term; §9.1's `routeFailures` and `unmetDemandCycles` are already counting the
  consequence.
- **That the word for the fix is a door.** `grep -n 'door'
  src/content/default-locale-en.ts` returns the buildable's name (`'Wooden
  Door'`) and the door-state words, and nothing that connects a door to
  reaching a room.
- **That `Walled in on every side` is about the boundary and not about
  access.** It is true as written; it is the sentence a player finishing a room
  reads as *done*.

---

---

## 3. The pressure never costs a decision, and this is the arithmetic

**VERIFIED, read, four constants.**

| figure | value | `file:line` |
| --- | --- | --- |
| what one occupied place pays per in-game day | **300** | `src/simulation/economy/income.ts:115` |
| a guard's daily wage — the *bottom* of the band, always | **80** | `src/content/staff-role-catalog.ts:148-151`, applied by `src/simulation/economy/wages.ts:44-46` (`return role.wageBand.minPerDay`) |
| occupants one guard covers | **8** | `src/simulation/security/sector-staffing.ts:147` |
| every class of money the prison can spend | `'deliveries' \| 'construction' \| 'wages' \| 'hiring'` | `src/simulation/economy/treasury.ts:332` |

**DERIVED.** Three of those four spend classes are player-initiated: a delivery,
a build order and a hire happen only when somebody presses something. **Wages
are the whole of the game's recurring cost.** Fully staffing a prison costs
`80 / 8 = 10` per occupied place-day against `300` of income from the same
place — **3.3%**. There is no food bill, no power bill, no maintenance bill and
no per-prisoner upkeep on that list.

**MEASURED, act 1, the slope with nothing pressed.** Four prisoners, one guard,
read off the treasury series at each day boundary:

| day boundary tick | treasury | step |
| --- | --- | --- |
| 7,210 | 23,410 | +1,200 |
| 7,495 | 23,330 | −80 *(the hire's second charge — below)* |
| 9,617 | 24,450 | +1,120 |
| 12,022 | 25,570 | +1,120 |
| 14,429 | 26,690 | +1,120 |
| 16,806 | 27,810 | +1,120 |
| 19,224 | 28,930 | +1,120 |
| 21,610 | 30,050 | +1,120 |
| 24,014 | 31,170 | +1,120 |
| 26,426 | 32,290 | +1,120 |

**`+1,120` a day, eight consecutive day boundaries, not one of them
different** — which is `4 × 300 − 80` exactly, and confirms both the
per-occupied-place rule and the single-guard payroll from outside the code. The
lone −80 at t7,495 is the documented double charge on a mid-day hire: the hire
takes one day's wage up front and the boundary bills the same day again
(`src/simulation/staff/hiring.ts:38,55-62`).

**MEASURED, act 2, the slope while the prison was failing.** Twelve prisoners,
still one guard, five assaults, every one uncontained: the treasury went from
**27,460 to 43,470** over the remaining ~12,400 ticks, and
`unpaidWagesMinorUnits` never left 0.

**So the number a player steers by is `FUNDS`, and in every prison that has
beds it only rises.** `TREASURY_STARTING_BALANCE_MINOR_UNITS` is 25,000
(`src/simulation/economy/treasury.ts:203`) and every act in this record ended
above it. The insolvency ladder that
`docs/research/2026-09-04-can-this-prison-fail.md` played — the rungs at −1,250
and the overdraft floor at −2,500 — is reachable only *before* the first bed is
occupied. **After that the economy has no downward slope at all.**

**This is the finding, as precisely as the brief asked for it.** A pressure
exists and it grows; what is missing is that **relieving it is never a
decision**, because the remedy costs 3.3% of the income of the thing that
created it. At twelve prisoners the game says *"Hire 1 more to cover this
population"* and the only honest player answer is *"obviously"*. There is no
state in which a player must choose between a guard and something else, because
there is nothing else to choose and there is always enough.

**Note on the suspended penalty, and what would change with it.** The unmet-need
withholding is `0` by the owner's current ruling
(`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0`,
`src/simulation/economy/income.ts:401`), and **this record does not file that as
a defect.** What it changes if restored is stated here so the owner can weigh
it: at the withholding the ADR 0064 fixture measured, a prison with two of six
needs on the floor earns 20,800 over ten days where a fully served one earns
24,000 — **13% less** (`src/simulation/incidents/sector-risk.ts:86-95`, quoting
`tests/integration/needs-state-grant-loop.test.ts`). That is four times the
whole staffing bill, so restoring it would make §2's shower room worth building
*for money* and would be the first thing in the game that makes a budget
tight. **Every finding in this section is about a prison run at withholding 0;
none of them is about the penalty being absent.**

---

## 4. There is no reason to build a second cell, and the reason is arithmetic

The brief asked for exactly this shape of answer — *"there is no reason to build
a second cell because X"* — so here is X.

**VERIFIED, read.** `deriveRoomCapacity`
(`src/simulation/objects/room-capacity.ts:172-190`) walks the objects in a room
and credits `residentCapacity += definition.footprint.width` for every object
whose capabilities include `'sleep-surface'`. That is the whole derivation:
**no per-room ceiling, no tiles-per-occupant term, nothing else contributing.**
Two catalogue objects declare that capability — `object.bed` and
`object.medical-bed` (`src/content/object-catalog.ts:97-98`), both
`footprint: { width: 1, height: 2 }`.

**VERIFIED, read.** Cell sharing is a *preference*, not a limit.
`rateCellSharing` (`src/simulation/prisoners/cell-sharing.ts:72-81`) returns
`max |arrival.riskTier − occupant.riskTier|`, and its own docblock says why it
is a number and not a verdict: *"some pairings are unwise rather than
forbidden"* (`:29-30`). Allocation prefers a better rating; nothing refuses a
worse one.

**MEASURED, act 2.** Eight bed orders inside the standing 6×6 cell — no new
walls, no new room, no designation:

```
[act2] 8 extra bed order(s) placed INSIDE the existing 6x6 cell
[act2] ONE CELL with twelve beds: {"tick":14724,"counts":{"prisoners":4,"rooms":1,
  "roomCapacity":12,"accommodationCapacity":12,"roomOccupants":4,"occupiedPlaces":4, …}}
```

and after eight presses of *Admit*, all twelve were housed and all twelve paid
for: `occupiedPlaces: 4 -> 12`, `rooms` **still 1**.

**DERIVED.** A 6×6 room is 36 tiles; a bed is 1×2 and the room type requires one
toilet at 1×1 (`src/content/room-catalog.ts:92-97`). So the starter cell holds
about **seventeen beds** — **5,100 a day** out of one rectangle, against
`ceil(17/8) = 3` guards at 240. **Nothing in the game asks for a second room,
and a second room adds no capacity the first cannot supply.**

**And a second room, built anyway, was accepted while housing nobody.** Act 2
walled a 3×4 rectangle at (19,11)–(21,14) — 3×4 rather than 6×6 because §0's
clear rectangle has no room for a second 6×6 — and designated it `room.cell`.
It was accepted **on attempt 1**, and `ROOMS` went 1 → 2, with **zero beds and
zero toilets in it**:

```
[act2] designate room.cell attempt 1: rooms=2 | panel said ["NEEDS AT LEAST 2 × 3 TILES",
  "MUST BE ENCLOSED","NEEDS 1 × BED","NEEDS 1 × TOILET","ENCLOSURE"]
  | band "The object was not placed — it has to stand in a room you have zoned."
```

That band sentence is the game catching **my** ordering mistake, not its own
(§10b): objects may only be placed inside a room that is already zoned. But the
room was designated a Cell regardless, the requirement list beside it still
read `NEEDS 1 × BED` / `NEEDS 1 × TOILET`, and the strip's `ROOMS` badge
incremented.

**So the requirement list can never be satisfied at designation time** — the
objects it asks for cannot legally exist yet — which makes it purely
informational, and **`ROOMS` counts rooms rather than working rooms.** A prison
can show `2 ROOMS` while one of them is an empty walled box. That is the same
shape, one level up, as the rule the brief verified from the other end: *24
prisoners with no bed earn zero.*

---

## 5. The player has fifteen verbs, and ten of them are one verb

**VERIFIED, read.** `src/simulation/protocol/commands.ts` declares exactly
fifteen command types. This is the whole vocabulary of player action in the
game:

| group | commands | count |
| --- | --- | --- |
| build, buy, undo | `PlaceBuildOrder`, `PlaceObject`, `RemoveObject`, `CancelBuildOrder`, `PurchaseMaterials`, `CancelMaterialPurchase`, `ZoneRoom`, `UnzoneRoom`, `Undo`, `Redo` | **10** |
| people | `AdmitPrisoner`, `HireStaff`, `DismissStaff`, `ReleaseGuardAssignment` | 4 |
| the HUD itself | `DismissAlert` | 1 |

**There is no command that sets a policy.** Not a regime, not a security grade,
not a sector, not a post, not a search, not a lockdown, not a transfer, not a
punishment. A prison cannot be *managed*; it can only be *built* and *staffed*.

**MEASURED, act 1.** A census of every `button`, `input` and `select` inside
`.hud` found **116 controls**, and the Regime panel contributes **none of
them** — its only entries in the census are the tab button itself and a
`Collapse` toggle.

That matters because the regime is visibly deciding what the prisoners do:

> `TODAY'S BLOCKS` / `General Population` / `84% THROUGH` / `Allows Recreation,
> Hygiene, Free Association` / `High Risk` / `98% THROUGH` / `Allows Sleep,
> Meal, Hygiene`

and the roster underneath showed all four prisoners doing the same thing at the
same time:

> `PRISONERS` / `4 of 4` / `Sonia Varga` / `Low` / `Using Toilet` / `Hygiene` /
> `0%` / `Gustav Abara` / `Minimal` / `Using Toilet` / `Hygiene` / `0%` /
> `Sonia Ueda` / `Minimal` / `Using Toilet` / `Hygiene` / `0%` / `Petra Dolan` /
> `Minimal` / `Using Toilet` / `Hygiene` / `0%`

**VERIFIED, read**, and this is why: the block filter is applied before the
utility ranking (`src/simulation/prisoners/utility-ai.ts:6`,
`allowedCategories.includes(action.category)`); the `General Population` block
running at that moment allowed `recreation`, `hygiene` and `free-association`
only; and of those the prison provided exactly one thing —
`action.use-toilet`, category `'hygiene'`, requiring `'sanitation'`
(`src/simulation/prisoners/actions.ts:127-131`), because `action.shower` needs a
shower room and `action.yard-recreation` needs a yard. **Four prisoners queueing
for one toilet at bladder 91–99% is the regime working exactly as authored, and
the player cannot change the schedule, because no command exists to change it.**

The two schedules are authored constants — `GENERAL_POPULATION_REGIME` and
`HIGH_RISK_REGIME` (`src/simulation/prisoners/regime.ts:104`, `:120`), collected
into `DEFAULT_REGIME_SCHEDULES` at `:130`. Nothing in `src/` writes a third and
nothing edits either.

---

## 6. Seven of the eighteen room types do nothing at all once built, and the cheapest one does not fit on the screen

**The Rooms tab offers eighteen room types**, quoted from the panel (UPPER
BOUND): `Staff Room`, `Classroom`, `Canteen`, `Kitchen`, `Cell`, `Holding
Cell`, `Laundry`, `Shower Room`, `Delivery Bay`, `Garbage Room`, `Storage
Room`, `Infirmary`, `Reception`, `Common Room`, `Yard`, `Security Office`,
`Solitary Cell`, `Utility Room`.

**MEASURED, a text census over the played tree, run in both directions.** For
each id, every `'room.<id>'` occurrence in `src/` outside the catalogue itself,
the locale file and the message-key completeness list:

```
for r in cell holding-cell solitary-cell reception kitchen canteen shower-room \
         laundry yard common-room classroom infirmary security-office staff-room \
         storage-room delivery-bay garbage-room utility-room; do
  grep -rn "room.$r'" src/ --include='*.ts' \
    | grep -v 'src/content/room-catalog.ts' | grep -v default-locale \
    | grep -v simulation-message-keys | wc -l
done
```

**Seven return zero: `room.holding-cell`, `room.reception`, `room.infirmary`,
`room.security-office`, `room.staff-room`, `room.garbage-room`,
`room.utility-room`.** The negative was checked for indirection: room
*categories* reach the simulation nowhere either —
`grep -rn '\.category\b' src/simulation/` returns only *object* categories
(walls, `construction/definition.ts:1006`) and two projection pass-throughs
(`presentation/room-projection.ts:552`, `:612`). There is no category-driven
behaviour to catch them.

The other eleven are wired, each **VERIFIED, read**:

| room | what reaches it | `file:line` |
| --- | --- | --- |
| `room.cell` | accommodation, intake | `src/simulation/prisoners/intake-system.ts` |
| `room.solitary-cell` | an accommodation target and the solitary sanction | `intake-system.ts:71`, `sanction-system.ts:18` |
| `room.canteen` | `action.eat-meal`, `hunger +4`/tick | `prisoners/actions.ts:120-122` |
| `room.kitchen` | `action.kitchen-work` | `actions.ts:346` |
| `room.shower-room` | `action.shower`, `hygiene +4`/tick | `actions.ts:132-134` |
| `room.laundry` | `action.laundry-work` | `actions.ts:282` |
| `room.yard` | `action.yard-recreation`, `recreation +3`/tick | `actions.ts:165-167` |
| `room.common-room` | `action.common-room-recreation`, `recreation +2`/tick | `actions.ts:169-171` |
| `room.classroom` | `action.classroom-education`, `recreation +1`/tick | `actions.ts:173-176` |
| `room.delivery-bay`, `room.storage-room` | the delivery route | `operations/delivery-route.ts:21-22` |

**So there genuinely is something to build toward — eleven of eighteen rooms
change what prisoners do.** Nothing lies to a player who builds an Infirmary;
nothing tells them either.

**And the cheapest room in the game cannot be placed beside the starter cell.**
`room.yard` asks only for `outdoors` and 8×8 tiles — no walls, no objects, no
money (`src/content/room-catalog.ts:138-141`) — and it is the only thing that
serves `recreation` with no `requiredObjectCapability`.

**MEASURED, act 3 run B.** An 8×8 at (19,13)–(26,20), the largest square that
fits east of the cell, hits the HUD on two corners:

```
[act3] an 8x8 yard at (19,13)-(26,20) BEFORE panning:
  ["(19,13) at screen (944,290) -> canvas",
   "(26,13) at screen (1392,290) -> div.save-panel__actions",
   "(19,20) at screen (944,738) -> canvas",
   "(26,20) at screen (1392,738) -> span.ui-badge__text"]
[act3] does an 8x8 yard fit in clear canvas at 1440x900 without moving the camera? NO
```

The camera does move — twelve `ArrowRight` presses shifted the world origin from
(−304, −574) to (−1083, −574), 779 px, about **12.2 tiles**, and the clear
rectangle after panning has the same 12 × 11 shape with the starter cell out of
it. **So the yard is placeable; what is not placeable is a yard *and* a 6×6
cell on one screen at 1440×900**, and nothing on screen suggests moving the
camera. There is no minimap to do it with either: the panel is present in every
dump and reads **`MINIMAP IS NOT AVAILABLE YET`**.

---

## 7. The one positive-feedback channel the game has is empty by construction

**MEASURED, act 1.** Across the whole act — 24 wall segments ordered and built,
one room designated, four beds and a toilet placed, four prisoners admitted, a
guard hired, and 27,658 ticks of clock (11.5 in-game days) — the worker pushed
**zero** `simulation/event` messages:

```
[act1] worker message kinds so far: {"simulation/ready":1,"simulation/status-counts":340,
  "simulation/command-result":50,"simulation/clock-state":956}
```

`simulation/event` does not appear in that tally at all. (The tally is
kind-agnostic, which is the only reason this survived my own reader bug —
§10a. `simulation/delta`, `simulation/snapshot` and `simulation/projection` are
absent because `installTee` drops them on purpose to bound its array, so their
absence is the harness's design and not a finding.)

**VERIFIED, read**, and this is why zero is the expected number rather than a
surprise. `SIMULATION_EVENT_TYPES`
(`src/simulation/protocol/types.ts:1675-1694`) has **eighteen** members and
**not one of them reports something going right**:

- four `construction.*` — a cancellation, a cancellation underway, an undo, a redo;
- one `contraband.discovered`;
- four `economy.*` — deliveries refused, construction refused, a delivery cancelled, wages unpaid;
- seven `incidents.*` — assault, riot, gang retaliation, escape attempt, escape succeeded, and two all-clears which are recoveries *from* those;
- `prisoners.relocated` — a resident whose bed was taken away;
- `prisoners.discharged` — the single neutral one, graded `'info'` at `src/ui/simulation-events.ts:286`.

**So the alerts band is a bad-news-and-undo channel, and in a well-run prison it
is silent.** There is no event for a wall finishing, a cell becoming habitable,
a prisoner settling in, a day being paid, or a coverage gap being closed. A
player's successful actions produce a `simulation/command-result` — 50 of them
in act 1 — which is a refusal channel that says nothing when it accepts.

**MEASURED, and this is the flattest number in the record.** Act 1's three
in-game days with nothing pressed:

```
[act1] DELTA VECTOR
ticks 19387 -> 27658 (8271 ticks)
  MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 94 -> 629 | treasuryMinorUnits: 28930 -> 32290
  STILL (19/21): accommodationCapacity, activeIncidents, conditions, contrabandDiscovered,
    dailyWageBillMinorUnits, occupiedPlaces, prisoners, prisonersCovered, prisonersHighRisk,
    prisonersInIntake, prisonersUnderstaffed, prisonersUnguarded, roomCapacity, roomOccupants,
    rooms, staff, staffUnassigned, treasuryOverdraftFloorMinorUnits, unpaidWagesMinorUnits
[act1] control lines that differ after three days: (none)
```

**Two of twenty-one published counts moved, and 116 of 116 controls were
byte-identical to what they were three in-game days earlier** — same labels,
same enabled state, same boxes. That is the brief's requested shape of finding
with the numbers in it: at tick 27,658 the only things that had changed since
tick 19,387 were the treasury and the accrual, and **every one of the 116
controls did exactly what it did before.**

**The honest counterweight**, because it is real: `EARNED TODAY` is a live
number that moves every tick, at `dailyGrant / DAY_LENGTH_TICKS` — 0.5 a tick
at four occupied places. It read `12` when the settled screen was dumped and
`629` three days later. **That is a number worth watching. It is also the only
one.**

---

## 8. Nothing on screen states the rule the whole economy runs on

**VERIFIED, read.** `stateIncomeForOccupiedPlaces`
(`src/simulation/economy/income.ts:548-556`) folds over occupied *place* ids —
`residentIdsWithExistingPlace()` — so the unit of income is a bed with somebody
in it, not a prisoner. The brief verified this independently and it holds.

**VERIFIED, read.** What the player gets for it is two words and a number:
`'hud.status.earned-today': 'Earned today'`
(`src/content/default-locale-en.ts:339`), and the comment above it makes the
omission deliberate — *"'Earned today', never 'Income' — there is no rate, no
budget and no forecast behind it"* (`:334-338`). **No string anywhere states the
rate, the unit, or that an empty bed pays nothing.**

**What the strip does carry, and it is more than the brief credited.** The
`PRISONERS` chip has a segmented occupancy bar labelled `Cell occupancy` with
`{value} of {capacity}` (`src/ui/hud/status-strip.ts:270-286`,
`src/content/default-locale-en.ts:340-341`), fed from `occupiedPlaces` against
`accommodationCapacity` — and `src/ui/simulation-counts.ts:66-87` records on the
spot why it is `occupiedPlaces` and not `roomOccupants`: *"a badge fed from
`roomOccupants` would read '0 with no bed' for a prison the state has already
stopped paying for."* **So the numerator of the income rule is on screen.** Only
the multiplier is missing.

**JUDGEMENT.** A player growing a prison can therefore see how many beds are
full and how much came in today, and can divide one by the other to discover
300. They cannot be told it. That is a smaller gap than the brief feared, and a
real one: the difference between a game that shows its rule and one whose rule
can be reverse-engineered.

---

## 9. Two numbers a growing player needs: one is never published, and one is dropped for a reason that expired the day before this run

### 9.1 "Your prisoners want something you have not built" never leaves the worker — and §2 is exactly the case it would have caught

**VERIFIED, read.** `ActionMetrics`
(`src/simulation/prisoners/action-system.ts:104-110`) declares
`unmetDemandCycles`, defined in its own comment as
*"Reconsideration cycles where no legal action had a reachable, available
target — observable unmet demand."* Beside it: `routeFailures`,
`actionsStarted`, `actionsCompleted`, and a substitution counter for
*"somebody was served worse than they asked for"*.

**MEASURED, both directions.**
`grep -rn 'unmetDemandCycles' src/ui/ src/main.ts src/rendering/ src/simulation/presentation/`
returns **nothing**. `grep -rn 'ActionMetrics' src/` outside `action-system.ts`
returns five comments (`session-systems.ts`, `actions.ts`,
`prisoner-operations-runtime.ts`, `components.ts` ×2) plus the save schema.
**It is not merely unread on the main thread: it is never published at all.**

**Why this is outside the existing census rather than a duplicate of it.**
`docs/research/2026-09-04-what-the-game-shows-nobody.md` enumerates
`PROJECTION_CATALOG`'s fifteen ids, `statusCountsSchema`'s twenty-three fields,
and the 398 declared members of the 52 view-model interfaces in
`src/simulation/presentation/`. `ActionMetrics` is in **none of those three
sets** — it is a simulation-side metrics object with no projection — so no gate
and no census in this repository has it in scope. Checked against that record
before filing, as the brief asked.

**And this is not hypothetical.** §2's shower room is the exact state
`unmetDemandCycles` and `routeFailures` describe: four prisoners whose
highest-ranked provided action was unreachable, for two in-game days, while the
prison counted it every twenty ticks and the player's screen said `Walled in on
every side`. **The one number that would have explained the failure was being
computed the whole time.**

### 9.2 The prison's only long-horizon number is invisible, and its stated blocker was relaxed on 2026-09-04

**VERIFIED, read.** A sentence is drawn per prisoner from **14 to 90 in-game
days** (`src/simulation/prisoners/sentence.ts:200-201`), written at the
classification stage as `sentenceEndTick`
(`src/simulation/prisoners/intake-system.ts:506`), and enforced by
`DischargeSystem` every 20 ticks
(`src/simulation/prisoners/discharge-system.ts:24`). At `DAY_LENGTH_TICKS`
2,400 and a 50 ms step that is 33,600 to 216,000 ticks — **28 minutes to three
hours of real time at 1×, seven minutes to 45 at the top of the speed ladder**
(`SIMULATION_SPEEDS = [1, 2, 4]`,
`src/simulation/clock/fixed-step-clock.ts:17`). `projectPrisonerDetail`
publishes both figures (`sentence.lengthTicks`, `sentence.endTick`,
`src/simulation/presentation/prisoner-projection.ts:748-750`).

**The reader drops them, and says why.**
`src/ui/simulation-prisoner-detail.ts:64-72`:

> **`sentence` and `currentAction`.** Both are renderable and neither can be
> *said*: a tick count is not a date … and every sentence that would frame
> either figure is new player-facing copy, **which is `AGENTS.md`'s fourth
> exclusion and the owner's.**

**That blocker no longer holds.** `AGENTS.md`'s fourth reservation was **partly
released by the owner on 2026-09-04**, the day before this run, and the release
covers exactly this: *"the CHOICE OF WORDS is ours now; the requirement that a
sentence be TRUE is not"*, on the owner's *"Sam decyduj zawsze, jak zacznę grać
to ujednolicimy."* The remaining objection — that a tick count is not a date —
has an answer the game already uses everywhere: the strip renders a `DAY`
number and `Through the day 36%`, and the Regime panel renders `84% THROUGH`.
Days are already the unit the player reads time in.

**No string is authored here** — the locale file is another agent's this wave.
What the wording must convey, for the integrator to place: **how much of this
prisoner's sentence is left, in days**, in the inspector that already shows
their six needs.

**Why it is load-bearing for *this* question rather than just another orphan.**
The census already lists `PrisonerDetailViewModel.sentence` as declined on the
record, and that part is not new. What is new is the play consequence: **a
sentence ending is the only mechanism in the game that takes something away
from the player without their pressing anything.** Income falls when a prisoner
leaves, and it is the one force that makes the prison a loop rather than a
ratchet. A player cannot see it coming, cannot plan for it, and finds out from
one line on a band that scrolls — and `DischargeSystem`'s own docblock records
that the moment carries nothing else, calling out what it does *not* do: *"no
ceremony, an inspection consequence or a reputation effect — those are #31"*
(`src/simulation/prisoners/discharge-system.ts:81`).

---

## 10. This pass's own instruments failed four times, and all four are recorded

**(a) The event reader filtered on a message kind that does not exist.** It
looked for `kind === 'simulation/events'` and a `payload.events` array. The
worker posts `'simulation/event'`, **singular**, one event per message under
`payload.event`, and says so: *"One message per event rather than one carrying
an array"* (`src/simulation/worker/state-machine.ts:728`). So act 1's
`events over the whole act: []` is what that reader always returns and is not a
measurement. **The conclusion it supported still stands, and only because a
second instrument carried it:** `messageKinds` tallies whatever arrives without
naming any kind, and it reported no `simulation/event` message in act 1 at all.
That is the measurement §7 rests on. The reader was fixed before act 2 and
immediately found ten events, which is also the proof the fix works.

**(b) Objects were placed before the room was zoned, twice.** Act 2 phase C and
act 3 run A both placed objects into an un-zoned rectangle and had every one
refused — *"The object was not placed — it has to stand in a room you have
zoned."* `buildAndPopulate` encodes the correct order (walls, zone, objects) and
this file re-derived it badly, the same shape of failure the shared harness's
own docblock records for `waitForQueueEmpty`. It produced a finding anyway (§4:
the room is still designated a Cell and `ROOMS` still increments), but **the
capacity figures in act 3 run A measure my mistake and not the game**, and run
A's shower-room numbers are not used anywhere in this record. Run B, with the
order corrected, is what §2 quotes.

**(c) `calibrate` needs the Build tab, and act 3 run A died on it.** It opens
with `page.locator('.hud-build__remove').click()`
(`tests/browser/playtest-harness.ts:256`), which is laid out only while Build is
the visible tab, and `playwright.playtest.config.ts` sets no `actionTimeout`.
Run A reached the post-pan recalibration from the Rooms tab and spent its
60-second `page.setDefaultTimeout` waiting for an element that would never have
a box. **This is the trap the brief warns about, hit exactly as described**, and
the only reason it cost eight minutes rather than the whole act is the explicit
default timeout.

**(d) The prisoner inspector is a toggle, and a second read of it closed it.**
`needsReadout` presses a roster row to open the inspector; pressing the row a
player is already inspecting closes it, so act 3's second reading returned
`.hud-regime__detail: not laid out` from a press that had worked perfectly. It
now re-presses and dumps the roster block beside the inspector either way —
which is why §2's second reading is quoted from the roster rather than the
inspector.

**(e) Not a failure, but a limit worth stating.** `installTee` drops
`simulation/projection`, `simulation/delta` and `simulation/snapshot` to bound
its array. Every "the worker published only these kinds" reading here is
therefore about the *small* messages only, and no claim depends on a projection
reply.

---

## 11. Weakest claim, and what would change it

**The weakest claim is §3's — that the pressure is real but its answer is never
a decision.** It rests on four constants and eleven measured day boundaries, and
the arithmetic is not in doubt. What is **JUDGEMENT** is the step from *"a guard
costs 3.3% of the income it protects"* to *"therefore no choice is being
made"*. A player who does not know the rate might hesitate; one with 43,470 in
the bank and a band full of assaults would not.

**What would change my mind:** a second recurring cost. The 1:30 ratio is fixed
by two constants, so it never arrives by growth. `SpendClass`
(`src/simulation/economy/treasury.ts:332`) is the four-member list I checked it
against, and a fifth member is what would refute it. Restoring the unmet-need
withholding would not add a *cost*, but it would make §2's shower room worth
300 × 6 × places a day, which changes the answer to the whole question — which
is why §3 states that figure explicitly rather than leaving it to be inferred.

**Second weakest: §6's seven inert rooms.** It is a text census, and a text
census cannot see a room reached through a variable. I checked the one
indirection that would matter — room *category* — and found none, but a room
resolved from a save, from a content pack, or from an id built at runtime would
be invisible to it. What would settle it is playing one: designate an Infirmary,
put a medical bed in it, and watch whether any prisoner ever goes there. This
run did not.

**Third: the claim that nothing names a room to build.** §1 refutes the strong
version — *"Hire 1 more to cover this population"* is exactly that sentence, for
staff. The narrow claim is that **no sentence in any state this run reached
named a room**: not *shower room*, not *yard*, not *canteen*, with `Hygiene 0%`
on every prisoner on screen. The room-needs readout that exists
(`'{room} at {x}, {y} is missing'`, `'{count} × {object}'`,
`src/content/default-locale-en.ts:2001-2005`) is driven by `unfinishedRoomIds`,
which filters the rooms that already exist
(`src/ui/simulation-room-needs.ts:101-111`), so it can say *"the Shower Room you
built is missing 2 × Shower Head"* and can never say *"you have no shower
room"*. A run that reached a state where some panel volunteers a missing room
type would refute the narrow claim.

---

## 12. Straight answers to the commissioned question

**Is there anything to do?** Yes, three things, and they are not the same size.

1. **Grow, and staff what you grow.** This is real: it is announced on the
   strip, named in a sentence with a figure on the Security tab, and punished
   with assaults reported in words. It is also the only pressure in the game,
   and answering it costs 3.3% of the income that created it.
2. **Build the eleven rooms that change what prisoners do**, in the order the
   needs put them in. This is the real depth in the game and it works — once
   there is a door (§2.3). A shower room took `Hygiene` from 9% to 98% and
   handed the player `Recreation` as the next thing to fix, unprompted.
3. **Follow the lowest-need column on the Regime roster.** It is the closest
   thing the game has to an objective list: it names the need, it re-points
   itself as each room opens, and it is a per-prisoner figure a player can act
   on. Its two costs are that it shows four prisoners of any population
   (§13) and that nothing ever converts the need's name into a room's name
   (§11).
4. **Watch `EARNED TODAY`.** It moves every tick and it responds to what you
   built. It is the only figure in the game that does both.

**And what is not there, precisely:** no goal, no objective, no milestone, no
unlock, no research. **MEASURED**, both directions:
`grep -rn -iwE 'milestone|objective|progression|reputation' src/simulation/`
returns seven hits, of which six are the word *reputation* on a gang registry
that `new-session.ts` constructs empty, and one is a comment. No string in
`src/content/default-locale-en.ts` matches `goal`, `objective`, `milestone` or
`unlock`. **Nothing in the game ever states what a player is trying to
achieve**, which is the same conclusion
`docs/research/2026-09-04-the-first-ten-minutes.md` §8 reached about the first
ten minutes, holding equally at hour two.

---

## 13. What this pass did not reach

- **No inert room was played.** §11 names the remedy.
- **No prison was grown past twelve prisoners.** The ratios in §3 and §4 are
  constants and do not change with scale, but the panels might: the Regime
  roster is a four-row window on the population by the owner's own ruling
  (`PRISONER_ROSTER_ROW_LIMIT = 4`, `src/ui/hud/regime-panel.ts:293`, whose
  docblock records the ruling and the layout budget behind it), so at twelve
  prisoners a player can inspect four and at fifty the same four. That is
  configured and ruled; this record does not file it as a defect, and notes only
  that it is the surface on which `Hygiene 0%` is discovered.
- **Contraband was never exercised.** `contrabandDiscovered` stood at 0 in every
  sample of every act, and `contrabandPressureWeight` is documented as
  structurally zero (`src/simulation/incidents/sector-risk.ts:105-107`), so this
  record says nothing about that system.
- **Nothing here is about rendering.** Git LFS content is not provisioned in
  this container, so the atlas PNGs are pointer files and every act logged
  `Failed to process file … image /assets/actors/…`. Expected baseline; no claim
  depends on an actor being drawn.
