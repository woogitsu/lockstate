# The empty work block — 2026-09-04

**The verdict in one line: the work block fills, completely, the moment the
three rooms exist — `Association` falls from every sample in both work blocks to
none of them — and the reason nobody had seen it is that the tab named for the
schedule shows one block out of ten, has no control on it at all, and the rooms
that do the filling are bought blind.**

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
roster draws at most four rows (`PRISONER_ROSTER_ROW_LIMIT`,
`src/ui/hud/regime-panel.ts`), so a player with eight prisoners sees four of
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
