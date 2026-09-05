# The empty work block — 2026-09-04

**The verdict in one line: the work block fills, completely, the moment the
three rooms exist — `Association` falls from every sample in both work blocks to
none of them — and the reason nobody had seen it is that the tab named for the
schedule shows one block out of ten, has no control on it at all, and the rooms
that do the filling are bought blind.**

Asked because
[`docs/research/2026-09-04-the-rooms-nobody-builds.md`](2026-09-04-the-rooms-nobody-builds.md)
§8 measured one whole in-game day in a four-room prison and found **every
sample inside the two `work / education / free-association` blocks was
`action.free-association`** — an action whose own catalogue comment says it
"fulfils no need" and scores "exactly 0". Those blocks are `[500, 1000)` and
`[1300, 1800)` of `GENERAL_POPULATION_REGIME`: 1,000 of the day's 2,400 ticks,
**42%** of a prisoner's life. The three rooms that would fill them —
`room.kitchen`, `room.laundry`, `room.classroom` — have live actions and had
never been built in a playtest in this repository.

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
