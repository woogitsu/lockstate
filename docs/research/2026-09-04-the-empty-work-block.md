# The empty work block — 2026-09-04

**The verdict in one paragraph. The work block fills completely, the moment
the three rooms exist.** Measured as a paired counterfactual on one tree, at
eight prisoners, over two whole in-game days: in the prison *without* a
kitchen, laundry and classroom, `action.free-association` is **54 of 56
prisoner-samples (96%)** inside the two work blocks and **45.6% of the whole
day**; in the prison that differs from it in exactly those three rooms it is
**0 of 48 (0%)** and **3.6% of the day**. Every prisoner works. **And the two
prisons paid the state exactly the same +6,720**, because there is one income
line in this game and it counts heads. So the system is not broken and it is
not missing — the three rooms were built, shipped and correct, and no playtest
here had ever put them on the ground. What is missing is everything *around*
them: the tab named for the schedule shows one block out of ten and carries no
control at all, the eighteen room types are offered by bare name with every
requirement stated and no sentence about what any of them is *for*, the ten
work places the player just bought are computed by the kernel and read by
nothing under `src/ui/`, and the only place on screen where the work is visible
is four roster rows out of eight prisoners. **A player can build the thing that
fixes 42% of a prisoner's day and receive no evidence that they did.**

Asked because `docs/research/2026-09-04-the-rooms-nobody-builds.md` §8 measured one whole in-game day in a four-room prison and found **every
sample inside the two `work / education / free-association` blocks was
`action.free-association`** — an action whose own catalogue comment says it
"fulfils no need" and scores "exactly 0". Those blocks are `[500, 1000)` and
`[1300, 1800)` of `GENERAL_POPULATION_REGIME`: 1,000 of the day's 2,400 ticks,
**42%** of a prisoner's life. The three rooms that would fill them —
`room.kitchen`, `room.laundry`, `room.classroom` — have live actions and had
never been built in a playtest in this repository.

**That record is not on `main`.** It lives on the unmerged branch
`origin/agent/playtest-the-rooms-nobody-builds` (`bf9a9906`), which is where
its §8 was read for this record; nothing under `docs/research/` on `main`
carries it, and a reader who greps for the filename in a checked-out `main`
will not find it. Its whole-day tally there, verbatim, is

```
[["Association",16],["Sleeping",10],["Yard Time",8],["Showering",4],["Eating",4],["Using Toilet",2]]
```

— four prisoners, forty-four prisoner-samples, and **`Association` ×4 at every
sample inside both work blocks.**

That pass named a paired counterfactual as its own weakest claim: it never
scanned a day in a prison *without* the room it was judging. **This record runs
both.**

## Tree, version and instrument

Branch `agent/playtest-the-empty-work-block`, cut from `origin/main` at
v0.0.473 and **merged with `origin/main` at v0.0.475 (`b984445f`) before a
single act was played**. Every number below was taken at **v0.0.475**, and the
status strip confirms it on screen in every act:

```
LockState.io | PRE-ALPHA | v0.0.475 · 39c527b | Lockstate, PRE-ALPHA build, version 0.0.475, commit 39c527b.
```

The instrument is `tests/browser/playtest-2026-09-04-the-empty-work-block.playtest.ts`,
at **1440×900**. **Nothing in CI collects it** —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/` — so it is
evidence and never a gate. **Nothing under `src/` is changed on this branch.**

| act | prison | what it answers |
| --- | --- | --- |
| **1** | a stock cell-and-toilet prison, 4 prisoners | what the **Regime tab** actually lets a player do |
| **2** | — | the clear-canvas geometry acts 3 and 4 are laid out against |
| **3** | cell + shower room + yard, **8** prisoners | the counterfactual day-scan: the work block with no work rooms |
| **4** | the same **plus kitchen + laundry + classroom** | the same day-scan with them |

Reproduction, one act at a time:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5326 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-empty-work-block.playtest.ts -g "act 1"
```

### The third channel, and the two bugs it cost the tester before this one

Sentences come from `.hud` `innerText`; numbers come from the worker through
the harness tee. **Neither is a census of what prisoners are doing.** The HUD
roster draws at most four rows (`PRISONER_ROSTER_ROW_LIMIT = 4`,
`src/ui/hud/regime-panel.ts:293`), so a player with eight prisoners sees four of
them, ever. The instrument therefore opens its own channel: it keeps the
`Worker` instance and posts `simulation/request-projection` for
`hud/prisoner-roster` with a limit of 20.

Three things had to be right before that channel answered anything, and each
cost a run:

1. **The channel must hold the *latest* worker, not the first.** "New prison"
   tears the session down and constructs a fresh `Worker`; a reference taken
   with `??=` points at a dead one for every prison after the first, and the
   request goes nowhere with no error at all.
2. **The reply correlates on `replyTo`, not `messageId`.** A reply carries its
   own fresh `messageId` and names the request it answers in `replyTo`, so a
   listener matching on `messageId` matches nothing and it reads as a worker
   that never answered.
3. **The need figure is `lowestNeed.level.permille`, not
   `lowestNeed.permille`** — found in this session, and unlike the first two it
   failed *silently*. `PrisonerNeedViewModel` is `{ needId, level:
   BoundedValue, unmetForStateIncome }`
   (`src/simulation/presentation/prisoner-projection.ts:124-128`), so a reader
   asking for `permille` at the top level prints a confident **0%** for every
   prisoner. Act 1's census printed `bladder 0%` beside a HUD reading `Bladder
   61%` for the same four people; **the HUD was right.** Fixed for act 3. The
   *action* columns — the whole point of the census — were never affected.

---

## 1. The Regime tab: five controls, none of them the schedule

**MEASURED.** Act 1 enumerated every element under `.hud-regime` matching
`button, [role="button"], a[href], input, select, textarea, [role="radio"],
[role="checkbox"], [role="tab"], [contenteditable="true"]` or carrying
`tabIndex >= 0`. There are **five**, and here they are verbatim:

```
[act1] every focusable/interactive element on the Regime tab (5):
[act1]   button.ui-icon-button ui-icon-button--quiet ui-panel__toggle role=- tabindex=0 disabled=false text="Collapse"
[act1]   div.hud-regime__roster-row role=radio tabindex=0 disabled=false text="Dario Farkas | Minimal | Using Toilet | Sleep | 83%"
[act1]   div.hud-regime__roster-row role=radio tabindex=-1 disabled=false text="Tomas Lindqvist | Minimal | Using Toilet | Sleep | 85%"
[act1]   div.hud-regime__roster-row role=radio tabindex=-1 disabled=false text="Carla Abara | Minimal | Using Toilet | Sleep | 86%"
[act1]   div.hud-regime__roster-row role=radio tabindex=-1 disabled=false text="Wanda Duarte | Minimal | Using Toilet | Hunger | 86%"
```

One panel collapse toggle, and four rows that select *a prisoner*. **Nothing on
the tab touches the schedule.**

The timetable itself:

```
[act1] the timetable, 2 row(s):
[act1]   group=general-population tabindex=-1 children-interactive=0 text="General Population | 99% THROUGH | Allows Recreation, Hygiene, Free Association"
[act1]   group=high-risk tabindex=-1 children-interactive=0 text="High Risk | 100% THROUGH | Allows Sleep, Meal, Hygiene"
```

`children-interactive=0` on both rows; `tabindex=-1` on both. It **is** laid
out — this is not a hidden panel:

```
[act1] geometry: {"panels named .hud-regime":1,".hud-regime":"1164,484 264x335 ...",".hud-regime__blocks":"1173,538 246x89 ...",".hud-regime__block-list":"1173,555 246x63 display=flex visibility=visible hidden=false",".hud-regime__block-row":"1173,555 246x27 display=block visibility=visible hidden=false"}
```

Pressing it submits nothing:

```
[act1] press .hud-regime__blocks-header at (1296,531): 0 command(s) submitted | timetable text changed = true
```

(*the text changed because the simulation advanced between the two reads, not
because the press did anything — 0 commands were submitted*)

And the keyboard cannot reach it. Twenty-four `Tab` presses from a blurred
document walk the whole HUD and land on the roster rows, the tabs, the icon
buttons, the save panel — and never on a block row:

```
[act1] any Tab stop inside the timetable block? false
```

**VERIFIED, read.** This is structural, not a missing listener.
`src/simulation/protocol/commands.ts` declares **exactly fifteen** player
commands — `PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `UnzoneRoom`,
`PurchaseMaterials`, `CancelMaterialPurchase`, `AdmitPrisoner`, `HireStaff`,
`PlaceObject`, `RemoveObject`, `ReleaseGuardAssignment`, `DismissStaff`,
`DismissAlert`, `Undo`, `Redo` (lines 53, 63, 68, 104, 152, 194, 268, 304, 372,
431, 481, 530, 584, 590, 594). **None of them names a regime, a block, a
schedule or a classification group.** There is no command a Regime control
could send even if one existed.

`src/ui/hud/regime-panel.ts:791-817` builds each row as a plain `element('div',
…)` with no listener and no `tabIndex`, and its own docblock at `:769-775` says
so in as many words: *"nothing in the block is focusable — so replacing it
cannot take focus away from a player."*

**So the Regime tab is read-only, and the answer to "can a player change a
block, add one, move one, assign a room or a group" is no, on every one of the
five.** That is a complete and unsurprising answer for a pre-alpha; what
follows is what it is read-only *about*, which is where the cost is.

### 1.1 "Today's blocks" shows one block, and never the day

**MEASURED and VERIFIED, read.** The header over that two-row list is
`hud.regime.blocks`, and `src/content/default-locale-en.ts:1986` gives it as:

> `'hud.regime.blocks': "Today's blocks"`

The list under it has **one row per classification group**, not one row per
block, and each row shows only the block running *right now* —
`group.blockProgressPercent` and `formatRegimeAllowsText(t, group)`
(`src/ui/hud/regime-panel.ts:791-817`). `GENERAL_POPULATION_REGIME` has **ten**
blocks (`src/simulation/prisoners/regime.ts:104-118`). Act 1 saw two rows, at
99% and 100% through, and two rows is what it will always be: the count is
`regime.groups.length`, and `DEFAULT_REGIME_SCHEDULES` has two entries
(`regime.ts:130`).

**JUDGEMENT.** A player who wants to know why their prisoners are idle from
tick 500 to 1,000 is looking at the tab named for it, reading a heading that
says *Today's blocks*, and being shown neither today nor the blocks — only the
minute they are in. The schedule that decides 42% of a prisoner's life is not
displayed anywhere in the game.

---

*(§2–§5 follow as the acts complete.)*

---

## 2. Act 4 — the work block with the three rooms: 48 prisoner-samples, zero `Association`

**MEASURED.** Eight prisoners, six rooms (cell, shower room, yard, **kitchen,
laundry, classroom**), two guards. Built from a new prison, run two whole days
to settle, then one whole day sampled — fourteen samples, 112 prisoner-samples,
tick 33,169 to 35,569. **All six rooms were accepted on the first designation
attempt**, which is the geometry the previous session's act 2 clearance map
bought:

```
[act4] room.cell accepted on attempt 1
[act4] room.classroom accepted on attempt 1
[act4] room.kitchen accepted on attempt 1
[act4] room.laundry accepted on attempt 1
[act4] room.shower-room accepted on attempt 1
[act4] room.yard accepted on attempt 1
```

### 2.1 The work block, verbatim

```
[act4] BLOCK WORK/education/association (48 prisoner-samples): ["action.laundry-work 20 (42%)","action.kitchen-work 15 (31%)","action.classroom-education 10 (21%)","action.yard-recreation 2 (4%)","action.eat-in-cell 1 (2%)"]
```

**`action.free-association` does not appear at all.** Ninety-four per cent of
the block is the three room actions; the remaining 6% is two prisoners walking
to the yard and one eating in their cell — both actions with a real need effect,
neither of them idling.

Sample by sample, both blocks:

| tick-of-day | what eight prisoners were doing |
| --- | --- |
| 651 | `kitchen-work ×3`, `laundry-work ×3`, `laundry-work (travelling) ×2` |
| 836 | `kitchen-work ×2`, `kitchen-work (travelling) ×2`, `laundry-work ×2`, `classroom-education ×2` |
| 999 | `laundry-work ×4`, `classroom-education ×2`, `yard-recreation (travelling) ×2` |
| 1370 | `laundry-work ×4`, `classroom-education ×2`, `laundry-work (travelling) ×1`, `eat-in-cell ×1` |
| 1534 | `kitchen-work ×4`, `classroom-education (travelling) ×3`, `classroom-education ×1` |
| 1720 | `laundry-work ×4`, `kitchen-work ×2`, `kitchen-work (travelling) ×2` |

**Eight of eight, at every one of the six samples inside the work blocks, doing
something.** Compare the four-room prison the question came from: `Association
×4`, at every sample, at four of four.

### 2.2 The whole day

```
[act4] WHOLE DAY, prisoner-samples per action (112 in all):
[act4]   action.sleep                       26  23.2%
[act4]   action.laundry-work                20  17.9%
[act4]   action.kitchen-work                15  13.4%
[act4]   action.classroom-education         14  12.5%
[act4]   action.yard-recreation             12  10.7%
[act4]   action.shower                       8   7.1%
[act4]   action.eat-in-cell                  7   6.3%
[act4]   action.use-toilet                   6   5.4%
[act4]   action.free-association             4   3.6%
```

**`Association` is 3.6% of the day and it is not in a work block.** All four of
its samples are in one place:

```
[act4] BLOCK recreation+association (8 prisoner-samples): ["action.yard-recreation 4 (50%)","action.free-association 4 (50%)"]
```

`[1000, 1200)` allows `recreation` and `free-association` only. The yard's
`concurrentUse` ceiling is `max(1, floor(width × height / 16))` for a room
action with no capability — an 8×8 yard is `floor(64/16)` = **4** —
[ADR 0071](../adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md),
quoted at `src/simulation/rooms/bounds-recovery.ts:20-28`, which adds *"a yard
zoned by this build admits 4 prisoners"*. Four prisoners took the yard;
the other four had no legal second recreation room and associated. **REASONED,
from those two MEASURED facts:** what is left of `Association` in a
fully-built prison is the yard's ceiling, not the work block — build a common
room and it very likely goes to zero, which this record did not test.

### 2.3 The screen says so, in the one place it can

**MEASURED.** The Regime tab's roster during the first work block, verbatim:

```
"PRISONERS | 4 of 8 | Marta Balogh | Low | Heading to Laundry Duty | Bladder | 91% | Ursula Novak | Low | Heading to Laundry Duty | Bladder | 91% | Alma Dolan | Low | Kitchen Duty | Bladder | 73% | Ines Ivanov | Low | Laundry Duty | Bladder | 93% | and 4 more"
```

"Kitchen Duty", "Laundry Duty", "Class", "Heading to Laundry Duty" — the labels
are authored (`src/content/simulation-message-keys.ts:171,176,179,187` —
`'action.classroom-education': 'Class'`, `'action.free-association':
'Association'`, `'action.laundry-work': 'Laundry Duty'`,
`'action.kitchen-work': 'Kitchen Duty'`) and they land.
The count is honest too: `4 of 8` and `and 4 more`
(`hud.regime.roster-count`, `hud.regime.roster-more`,
`src/content/default-locale-en.ts:2005,2009`). **So a player who opens the
Regime tab during a work block does see kitchen work happening — to four
prisoners out of eight, in a four-row window with no way to page.**

### 2.4 And it produces nothing — no food, no money, no number that moves

**MEASURED.** From admission to the end of the scanned day, 7,508 ticks with
eight prisoners working, **three of twenty-one status counts moved and none of
them is a work product**:

```
[act4] DELTA admission -> end of the scanned day
ticks 28159 -> 35667 (7508 ticks)
  MOVED (3/21): contrabandDiscovered: 0 -> 2 | stateIncomeAccruedTodayMinorUnits: 1760 -> 2068 | treasuryMinorUnits: 15920 -> 22640
  STILL (18/21): accommodationCapacity, activeIncidents, conditions, dailyWageBillMinorUnits, occupiedPlaces, prisoners, prisonersCovered, prisonersHighRisk, prisonersInIntake, prisonersUnderstaffed, prisonersUnguarded, roomCapacity, roomOccupants, rooms, staff, staffUnassigned, treasuryOverdraftFloorMinorUnits, unpaidWagesMinorUnits
[act4] events over the whole act: ["contraband.discovered","contraband.discovered"]
```

The two that moved are the head-count grant and a contraband search. The
treasury gained **6,720 over 7,508 ticks**, which is `8 prisoners × 300 × 2.8
days` — the state grant alone, to the unit.

**VERIFIED, read**, and it explains the whole table:

- **There is exactly one income line into the treasury.**
  `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300`
  (`src/simulation/economy/income.ts:115`), paid per prisoner per completed
  day; the only other constant is the withholding
  `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`, suspended at **0**
  (`:401`). There is no labour line and no wage credited to a working prisoner.
- **No item is produced.** `item.food-ration`, `item.clean-linen`,
  `item.dirty-linen` and `item.waste` are declared in
  `src/content/item-catalog.ts:27-30` and named in
  `src/content/default-locale-en.ts:116-119`. A grep of `src/` for each returns
  **those two lines and nothing else** — no producer, no consumer, no store.
  (`tests/foundation/unconsumed-content-contract.test.ts` guards *room* ids on
  exactly this pattern and does not guard item ids, so nothing catches it.)
- **The kitchen is deliberately not a supplier.** The catalogue says so at
  `src/simulation/prisoners/actions.ts:322-331`: *"A prisoner on kitchen duty
  eats a little of what passes through their hands; **nothing is produced,
  stored or delivered**"*, and *"`room.canteen` does not ask whether anybody
  cooked."*

**What the work does move is one need each, on the prisoner doing it**:
`action.kitchen-work` `hunger: 1`/tick, `action.laundry-work` `hygiene: 1`/tick,
`action.classroom-education` `recreation: 1`/tick
(`src/simulation/prisoners/actions.ts:346`, `:282` and `:173`). Against
`NEED_DECAY_PER_TICK` of `hunger 0.05`, `hygiene 0.02`, `recreation 0.015`
(`src/simulation/prisoners/needs.ts:112-119`), a 120-tick shift is worth **20×,
50× and 67×** the decay it is racing. That is why the block fills so
completely, and why every prisoner's worst need in act 4 is `Bladder` — the one
need no room serves.

**So the honest answer to "does the work produce anything" is: it produces a
need, on the worker, and nothing else in the prison.** That is not a defect —
it is [ADR 0061](../adr/0061-what-the-prison-produces-on-its-own.md)'s subject
and issues [#591](https://github.com/matmaxalez/lockstate/issues/591) and
[#592](https://github.com/matmaxalez/lockstate/issues/592)'s, and **both of
those are open proposals with no linked pull request and nothing implemented**
(read 2026-09-04; #591 "Prison labour: pay for work performed", #592 "Kitchen
labour feeds the meal block"). The system is not built yet, and this is exactly
how far it goes.

---

## 3. Act 3 — the paired counterfactual: the same prison without the three rooms

**MEASURED.** The identical script with `withWorkRooms: false` — same
rectangles, same walls, same beds, same toilet, same shower room, same 8×8
yard, same eight admissions, same two guards, same two settling days, same
fourteen-to-seventeen-sample day scan. **The two prisons differ in exactly the
kitchen, the laundry and the classroom**, which is the repair the previous
pass named as its own weakest claim.

### 3.1 The work block, verbatim

```
[act3] BLOCK WORK/education/association (56 prisoner-samples): ["action.free-association 54 (96%)","action.sleep 2 (4%)"]
```

Sample by sample:

| tick-of-day | what eight prisoners were doing |
| --- | --- |
| 542 | `free-association ×6`, `sleep ×2` |
| 685 | **`free-association ×8`** |
| 828 | **`free-association ×8`** |
| 971 | **`free-association ×8`** |
| 1370–1720 | the same, through the second block |

The two `action.sleep` samples at tick-of-day 542 are a sleep action begun in
the `[0, 400)` block and still running: **the regime gates *selection*, not
*continuation*** — `continuePerforming` tests `elapsed >= action.minDurationTicks`
and nothing else (`src/simulation/prisoners/action-system.ts:627-628`), so an
action outruns its block by up to its own minimum duration. The same mechanism
explains act 3's `free-association ×4` inside the `[1200, 1300)` **`meal`**
block, which allows no such category at all, and act 4's
`classroom-education ×2` at tick-of-day 468. **This is not a defect and it is
not reported as one** — it is a 20-tick reconsideration cadence and a 60-to-120
tick commitment, both authored — but it means **no day-scan tally can be read
as "what the block allows"**, and this record's cannot either.

### 3.2 The two tables side by side — the whole answer

| action | **act 3**, no work rooms | **act 4**, with them |
| --- | --- | --- |
| `action.free-association` | **62 · 45.6%** | **4 · 3.6%** |
| `action.sleep` | 31 · 22.8% | 26 · 23.2% |
| `action.yard-recreation` | 14 · 10.3% | 12 · 10.7% |
| `action.eat-in-cell` | 11 · 8.1% | 7 · 6.3% |
| `action.shower` | 9 · 6.6% | 8 · 7.1% |
| `action.use-toilet` | 9 · 6.6% | 6 · 5.4% |
| `action.laundry-work` | — | 20 · 17.9% |
| `action.kitchen-work` | — | 15 · 13.4% |
| `action.classroom-education` | — | 14 · 12.5% |
| *prisoner-samples* | *136* | *112* |

And in the two blocks the question is about:

| | **act 3** | **act 4** |
| --- | --- | --- |
| `action.free-association` | **54 of 56 · 96%** | **0 of 48 · 0%** |
| doing something with a need effect | 2 · 4% | **48 · 100%** |

**So the answer to the question as asked is yes, completely.** The day fills up.
`Association` falls from 45.6% of a prisoner's life to 3.6%, and from 96% of the
work block to none of it. The three rooms are not decoration and they are not
unfinished: they are the content that was already built and that no playtest
here had ever put on the ground.

### 3.3 The two prisons earned the state exactly the same money

**MEASURED, and this is the finding with the most in it.** The treasury delta
over each act's whole run:

```
[act3] ticks 16182 -> 23730 (7548 ticks)   treasuryMinorUnits: 16800 -> 23520
[act4] ticks 28159 -> 35667 (7508 ticks)   treasuryMinorUnits: 15920 -> 22640
```

**+6,720 in both.** Eight prisoners on kitchen, laundry and classroom duty for
three in-game days earned the prison **the same, to the minor unit**, as eight
prisoners standing in their wing doing an action the catalogue says fulfils
nothing. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` is 300 and the withholding
is suspended at 0 (`src/simulation/economy/income.ts:115,401`), so the grant is
a pure head-count and the work is worth exactly zero to it.

**JUDGEMENT, and it is what a player would feel.** The rooms cost real money —
act 3's build left 16,960 of the 25,000 grant and act 4's left 16,080, so the
three work rooms' materials were **880** on top of a prison that already had a
cell, a shower room and a yard. A player who spends that gets: three more
entries in the `ROOMS` count, four roster rows that sometimes say "Kitchen
Duty", and **no change to any other number the game shows them**. Nothing tells
them their prisoners' hunger, hygiene and boredom are now being served during
1,000 ticks that were previously spent standing still — because §2.4 and the
counts table show that improvement reaches no HUD surface at all.

*(880 is what the two runs' `FUNDS` readouts differ by, MEASURED. The catalogue
arithmetic for the extra order — 2 stoves, 2 prep counters, 2 fridges, 3 washing
machines, 2 bookshelves and 6 chairs — comes to 1,290 at `item.brick` 40 and
`item.wood-plank` 65 (`src/content/procurement-catalog.ts:100-101`). **I do not
know why the two disagree** and did not chase it; the purchase path has a
just-in-time reservation layer (`src/simulation/economy/just-in-time-materials.ts`)
that may already have held some of it. The measured figure is the one to trust
about what left the treasury at that moment.)*

---

## 4. Proposals

Every one is grounded in a measurement above, and for each the code that would
render the sentence is opened, per `AGENTS.md` reservation 4's *verify, then
write*. **Nothing here is landed; this branch is read-only on `src/`.**

### P1. The Regime panel already receives the block's start and end tick, and throws them away

**VERIFIED, read.** `RegimeBlockViewModel` crosses the worker boundary carrying
**five** fields — `classificationGroupId`, `allowedCategories`,
`blockStartTickOfDay`, `blockEndTickOfDay`, `blockProgress`
(`src/simulation/presentation/status-strip-projection.ts:850-860`). The UI
adapter `regimeFromProjection` maps **four** of them and drops both tick fields
on the floor (`src/ui/simulation-regime.ts:99-115`), so
`HudRegimeBlockViewModel` has no way to say *when* (`src/ui/hud/view-model.ts:1684-1697`).

**The change:** carry the two tick fields through the adapter and add a second
eyebrow line to the block row beside `hud.regime.block-progress`:

> `Until 1000` — or, with `DAY_LENGTH_TICKS` and the clock projection already on
> the same view model, the same instant rendered as a clock time.

**Why this is true of the code that renders it**: the number is
`block.endTickOfDay`, resolved by `resolveActiveRegimeBlock`
(`src/simulation/prisoners/regime.ts:133-140`), which is the same function
`ActionSystem` uses to decide what a prisoner may do. It cannot disagree with
the simulation because it *is* the simulation's answer.

**What it buys a player**, from §1: a player looking at *"Allows Work,
Education, Free Association · 30% through"* currently cannot tell whether that
block ends in ten ticks or four hundred, which is the whole question when they
are deciding whether to build a kitchen now or later.

### P2. "Today's blocks" should show today's blocks

**MEASURED, §1.1.** The header is `hud.regime.blocks` = **"Today's blocks"**
(`src/content/default-locale-en.ts:1986`) and the list under it has one row per
classification *group* showing only the block running now.
`GENERAL_POPULATION_REGIME` has ten (`src/simulation/prisoners/regime.ts:104-118`).

**The change:** a ten-segment day bar, one segment per block, width proportional
to `endTickOfDay - startTickOfDay`, each segment tinted by its dominant category
and carrying its category list on hover/focus, with a now-marker at
`tickOfDay / 2400`. One row per group as today.

**What it costs**: the projection must carry `schedule.blocks` rather than the
one resolved block — and `schedules` is *already in scope* at exactly that point
(`status-strip-projection.ts:848`, `const schedules = source.regimeSchedules ??
DEFAULT_REGIME_SCHEDULES` at `:807`), so this is a wider map over data the
function already holds, not a new read of simulation state.

**The cheap alternative if that is too much**: change the *header* instead. A
string that said `Now` rather than `Today's blocks` would be true of the code
that renders it today, and costs one locale value.

### P3. A room's panel says what it needs and never what it is for

**MEASURED, act 4.** The Rooms panel with a Yard selected, verbatim from the run:

```
DRAG A RECTANGLE ACROSS THE TILES THIS ROOM SHOULD COVER.
NEEDS AT LEAST 8 × 8 TILES
MUST BE OUTDOORS
NO OBJECTS NEEDED
ENCLOSURE
Open on at least one side
```

and with a Kitchen selected, mid-build:

```
NEEDS AT LEAST 4 × 4 TILES
MUST BE ENCLOSED
NEEDS 1 × STOVE
NEEDS 1 × PREP COUNTER
NEEDS 1 × FRIDGE
```

**Eighteen room types are offered by bare name and not one sentence anywhere
says what any of them does.** A player deciding between a Kitchen and a
Classroom — which §2.1 shows is a real choice between three needs — is choosing
between two words.

**The change:** one derived line under the selected room, generated from
`DEFAULT_ACTIONS` rather than authored per room, so it cannot go stale:

> **Kitchen** — Prisoners work here in work blocks. Serves hunger.
> **Yard** — Prisoners take recreation here. Serves recreation.
> **Garbage Room** — Nothing happens here yet.

**Why each is true of the code that renders it.** The generator reads the
actions whose `target` is `{ kind: 'room-catalog-id', roomCatalogId: <this
room> }` and reports their `category` and the keys of their `needEffectsPerTick`
(`src/simulation/prisoners/actions.ts`, `action.kitchen-work` at `:346` naming
`room.kitchen`, `work` and `hunger: 1`). A room with no such action renders the
third form — which is the honest answer for `room.garbage-room`,
`room.staff-room` and `room.utility-room`, the three
`tests/foundation/unconsumed-content-contract.test.ts` still lists as
*"Declared with no reader anywhere"* (`:159,197,198`). **The sentence is
derived from the same array `ActionSystem` selects out of, so it cannot promise
a behaviour the kernel does not have** — which is precisely reservation 4's
subject.

### P4. Nothing on screen counts how many prisoners are working

**MEASURED.** The status strip in act 4 during a work block reads `8 PRISONERS ·
0 HIGH RISK · 2 STAFF · 8 COVERAGE · Covered · 6 ROOMS · 0 INCIDENTS · Clear · 2
CONTRABAND · 22,640 FUNDS · 2,313 EARNED TODAY`. **Not one of those numbers
changes when the work block opens.** The only place the work is visible at all
is four roster rows out of eight prisoners (§2.3).

**The change:** during a block whose `allowedCategories` include `work` or
`education`, the strip shows one more pair — `6 WORKING / 2 IDLE` — counting
prisoners whose `currentActionId` has `category: 'work' | 'education'` against
those on `action.free-association`.

**And the capacity the player bought is invisible too.** Compare the two
prisons' counts at the moment the last room went up:

```
[act3] every room standing: ... "rooms":3,"roomCapacity":8,"accommodationCapacity":8 ...
[act4] every room standing: ... "rooms":6,"roomCapacity":8,"accommodationCapacity":8 ...
```

**Three more rooms, and the only count that moved is `rooms` itself.**
**VERIFIED, read:** `roomCapacity` sums each instance's `residentCapacity` —
beds (`src/simulation/presentation/status-strip-projection.ts:766-777`, and
`:355-363` says so explicitly). The number that *did* change is
`concurrentUseCapacity`, computed as the sum of each qualifying object's
`footprint.width` (`src/simulation/objects/room-capacity.ts:177-203`) — a
2-wide stove is 2 slots, so act 4's kitchen seats 4, its laundry 4 and its
classroom 2, ten work places for eight prisoners. **A grep of `src/ui/` for
`concurrentUseCapacity` returns nothing at all**: the figure is computed by the
kernel, published on the room projection's own note as deliberately not the
housing number (`src/simulation/presentation/room-projection.ts:224-231`), and
rendered by no HUD surface. The player bought ten work places and was told
`ROOMS 6`.

**Why it is true**: both halves are already projected per prisoner —
`currentActionId` is on `hud/prisoner-roster`'s row (this record's whole census
channel reads it) and the category is a lookup in `DEFAULT_ACTIONS`. **This is
issue [#591](https://github.com/matmaxalez/lockstate/issues/591)'s own
`employed N / idle N`,** proposed there on 2026-08-29 and not built; what this
record adds is that the number is now *worth showing*, because §3's table proves
it is not always 0 and §2's proves it is not always 8.

### P5. The four-row roster cannot see half a prison, and the fix is a tally rather than a longer list

**MEASURED, §2.3.** `4 of 8`, honestly labelled, with `and 4 more` and no way to
page. The record only knows what the other four were doing because the
instrument opened a private worker channel to ask.

**The change:** put an activity tally above the four rows — `Laundry Duty 3 ·
Kitchen Duty 3 · Class 2` — computed over the *whole* population rather than
the four rows drawn. It answers "what is my prison doing" in one line, which
four rows out of eight cannot, and it does not fight
`PRISONER_ROSTER_ROW_LIMIT`'s layout budget, whose derivation
(`src/ui/hud/regime-panel.ts:293`, `PRISONER_ROSTER_ROW_LIMIT = 4`) is about **row**
height and is unaffected by one eyebrow line.

**Why it is true**: the labels already exist and already land — §2.3 quotes
"Kitchen Duty" and "Laundry Duty" off the real screen — and the aggregate is a
sum over the same projection rows the panel already receives.

---

## 5. What this record did not reach

1. **Act 2 was not re-run at v0.0.475.** Its clearance map was measured by the
   previous session at v0.0.473 and the layout constants come from it. What
   *was* re-verified is the only thing that matters: all six rectangles were
   accepted on the **first** designation attempt in both acts, and every world
   press passed `document.elementFromPoint` first. One difference is recorded
   rather than hidden — the sixteen `ArrowRight` presses moved the camera
   **796px in act 4 and 777px in act 3**, against the **453px** the previous
   session's comment records for the same sixteen presses. Nothing camera-shaped
   landed between v0.0.473 and v0.0.475 (`git log b984445f -25` is releases,
   research records and a rooms-panel layout fix), so this reads as
   key-repeat timing variance rather than a change; **the instrument is immune
   to it because it re-runs `calibrate` after the pan and works in tile
   coordinates.** It is on the other tester's surface, so it is one line here
   and no more.
2. **Sampling granularity.** Fourteen samples in act 4 and seventeen in act 3
   over 2,400 ticks — roughly one every 170 ticks, because the scan samples on
   wall clock while the kernel runs at 4×. Each work block therefore holds 3
   samples, not 500. The tally is a **stratified sample of eight prisoners at
   six moments**, not a tick census. It is three times denser than the pass that
   set the question (which had 4 prisoners at 4 moments), and the effect it
   measures — 96% to 0% — is far larger than that granularity can manufacture.
3. **A common room was never built.** §2.2 attributes act 4's residual 3.6%
   `Association` to the yard's ceiling of 4 in the `[1000, 1200)` block. That is
   REASONED from two measurements, not tested: building a common room and
   re-scanning would settle it, and might drive `Association` to zero outright.
4. **No prison was run past eight prisoners**, so ADR 0062's contention never
   properly bit. Act 4's ten work places against eight prisoners is slack. At
   twelve or sixteen the classroom's ceiling of **2** would be the binding
   constraint and the block would begin to refill with `Association` — that is
   the measurement issue #592's "genuine allocation of the same scarce ticks"
   actually needs, and this record does not have it.
5. **The Regime tab was played on a four-prisoner prison** (act 1), not on the
   eight-prisoner ones. The control inventory cannot change with population —
   the panel builds a fixed structure — but the roster's `4 of 4` there is not
   the `4 of 8` that makes the window a problem; that came from acts 3 and 4.
6. **`HIGH_RISK_REGIME` was never exercised.** No prisoner in any act was
   classified high-risk (`prisonersHighRisk: 0` throughout), so the second
   timetable row was read and never played. That schedule has **no `work`
   block at all** (`src/simulation/prisoners/regime.ts:120-127`), which means a
   high-risk prisoner cannot reach a kitchen — measured by reading, not by
   playing.

## 6. The weakest claim, and what would change my mind

**The weakest claim is §3.3's "the two prisons earned exactly the same".**

It rests on two treasury readings taken at different absolute ticks in two
different sessions (16,182→23,730 and 28,159→35,667), differing by 40 ticks of
run length, and the fact that both deltas came out at **+6,720** is partly
arithmetic luck: at 300 per prisoner-day and 8 prisoners, any run covering the
same number of *day boundaries* pays the same, and 7,508 and 7,548 ticks both
cover 2.8 days. **So the strong reading — "work earns nothing" — is right, but
the evidence for it is not really the coincidence of the two figures; it is
`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` being the sole income line, which I
established by reading and not by playing.** A second run of either act
straddling one more day boundary would print a different number and the
coincidence would evaporate without the finding changing at all.

**What would change my mind:** any measured treasury delta that differs between
a working and an idle prison of the same population over the same day count. I
would also withdraw the whole §3 comparison if a re-run of act 3 with the three
rooms present produced anything other than a near-empty `free-association`
column, since a single paired run is a sample of one prison each.

**The second-weakest is §2.2's attribution of act 4's residual `Association` to
the yard's ceiling.** Both prisons split `[1000, 1200)` exactly 4 yard / 4
association, which is a strikingly good fit for a ceiling of 4 derived from
ADR 0071's `floor(64/16)` — but I never varied the yard's size to see the split
move, and that is the experiment that would prove it. A 12×12 yard should make
it 8/0.
