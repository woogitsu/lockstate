# Once the first cell works — is there anything to do?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.451** (`0e614c71`), in worktree
`playtest/is-there-anything-to-do`. Nothing under `src/` differs from that
commit, and the running page says so from the inside: every screen dump below
carries `v0.0.451 · 483256a` or `v0.0.451 · 82aa3be`, the two
instrument-only commits on this branch.

**Question, as commissioned:** *once the first cell works and the first
prisoner sleeps in it, is there anything to do? Something to build toward, a
pressure that grows, a choice that matters, a number worth watching — or does
it flatten into a screen where nothing further is asked of you?*

**Standard:** the owner's, *"Żeby gra była fajna i super, a nie po taniości
zrobiona"*, and `AGENTS.md`'s *"a change that is right in every test and makes
the game duller has not succeeded."*

---

## The answer, in one paragraph

**The prison does ask something of a growing player, it says what to do in a
sentence, and not doing it hurts — so the commissioning hypothesis that the
mid-game "asks little" is wrong, and §1 refutes it with numbers.** Packing
eight more beds into the cell that was already standing and pressing *Admit*
eight times took `prisonersCovered` from 4 to **0** and `prisonersUnderstaffed`
from 0 to **12** in a single step, changed the status strip from
`COVERAGE 4 · Covered` to `COVERAGE 0 · Understaffed`, put
*"Hire 1 more to cover this population."* on the Security tab, and then
produced **five assaults in about five in-game days**, every one of which
lapsed uncontained and said so on the alerts band. **What is thin is not the
pressure. It is the decision.** A guard costs 80 a day and covers eight
occupants; an occupied bed pays 300 a day. So the entire staffing bill of a
perfectly covered prison is **10 per place-day against 300 of income — 3.3%**,
the only recurring cost in the game is wages, and the treasury rose
monotonically in every measurement in this record, including through the five
assaults. Every pressure the game generates is answered by a press the player
can always afford, and **there is no second thing to spend money on**: capacity
is the sum of bed widths with no per-room ceiling, so twelve prisoners fit in
the first 6×6 cell and a second cell buys nothing. The game therefore has a
**growing pressure with a free answer**, which is a different defect from a
flat one and needs a different fix.

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
| 3 | the two rooms a cell cannot replace — a shower room and a yard | *(filled in below)* |
| 4 | twenty in-game days at 4×, watching for a sentence to end | *(filled in below)* |

## Claim tiers

- **MEASURED** — produced by one of the runs above and quoted from its output.
- **VERIFIED, read** — a file in this repository was opened at the line cited,
  in the played worktree at v0.0.451.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — a claim about what a *player* would feel rather than what the
  game did. §11 names the weakest.

Nothing here is **FROM MEMORY**.

**The two channels are kept apart and never mixed.** Sentences are quoted from
`document.querySelector('.hud').innerText` — what is laid out. Numbers come
from the worker's `simulation/status-counts` through the tee, and ticks from
`simulation/clock-state`, which publishes every tick where the counts channel
goes quiet when nothing changes (`statusCountsEqual`,
`src/simulation/worker/status-counts.ts`).

**Which readings are upper bounds.** `innerText` does not respect a scroll
container's clipping, so **every quoted screen dump is an upper bound on what a
player can read without scrolling.** This is visible in the control census
itself: of 116 controls in the HUD at once, the census marks which have a box a
pointer could reach, and the twenty-one Build catalogue rows are all
`NO BOX` on the Overview tab while their labels still appear in the dump. The
counts, the ticks, the delta vectors, the clearance map and the control census
are **measurements**, not upper bounds.

**Presses were proved to land.** A press on a HUD-covered point submits nothing
at all — no command, no refusal, no band — and has cost this repository three
withdrawn findings. Every world point pressed is checked with
`document.elementFromPoint` first and the act fails if anything but the canvas
is on top. Act 1 additionally prints a **clearance map** of the whole visible
tile grid, so acts 2 and 3 build inside a measured rectangle rather than a
guessed one. `calibrate` measured the world origin at **(−304, −574)** at
1440×900, identically in every act.

---

## 0. The clearance map, because two acts are built on it

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

Two consequences are measured off this and reported where they arise: a second
6×6 cell does not fit beside the first (§3), and neither does an 8×8 yard (§6).

**This also settles the handover's claim in the other direction.** The brief
warns that a handover called tile (12,12) off-screen at 1440×900 and that this
is wrong. It is wrong: (12,12)'s centre is at screen (496, 226) and the map
above shows it clear, as it shows every tile the starter cell occupies.

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

and the Security tab, unfolded, carried the fix as a sentence with a figure:

> `GUARD COVERAGE` / `1 of 2` / `Understaffed` / **`Hire 1 more to cover this
> population.`**

**VERIFIED, read.** The rule behind that "of 2" is one guard per
`DEFAULT_SECTOR_PRISONERS_PER_GUARD` occupants,
`src/simulation/security/sector-staffing.ts:147`, applied at `:190` as
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
assaults that are reported in words.** The commissioning brief's hypothesis
that "after the first working cell the game asks little and offers little" is
**refuted on the asking**, and this is the more valuable result of this run.

**One thing that reads as a contradiction and is not.** At the same moment the
band said a fight had broken out five times, the strip read
`0 · INCIDENTS · Clear`. Both are true: the strip's badge is the count of
incidents open *now* and no incident was open at that instant, and the band
carries the history with a `5×` repeat count. The two channels are doing
different jobs and each does its own honestly.

**Also landed since the brief was written.** The brief lists, as a finding still
open, *"one all-clear sentence serving both a handled incident and an expired
one."* That is fixed on `origin/main` at v0.0.451:
`incidents.all-clear-after-lapse` is its own event type
(`src/simulation/protocol/types.ts:1686`), the UI grades it `'warning'` rather
than `'info'` (`src/ui/simulation-events.ts:283-284`), and it has its own
sentence at `src/content/default-locale-en.ts:1064` — the one quoted above. The
five lapses this run measured are what proved it renders.

---

## 2. The pressure never costs a decision, and this is the arithmetic

**VERIFIED, read, four constants.**

| figure | value | `file:line` |
| --- | --- | --- |
| what one occupied place pays per in-game day | **300** | `src/simulation/economy/income.ts:115` |
| a guard's daily wage — the *bottom* of the band, always | **80** | `src/content/staff-role-catalog.ts:151`, applied by `src/simulation/economy/wages.ts:45` (`return role.wageBand.minPerDay`) |
| occupants one guard covers | **8** | `src/simulation/security/sector-staffing.ts:147` |
| every class of money the prison can spend | `'deliveries' \| 'construction' \| 'wages' \| 'hiring'` | `src/simulation/economy/treasury.ts:332` |

**DERIVED.** Three of those four spend classes are player-initiated: a delivery,
a build order and a hire happen only when the player presses something. **Wages
are the whole of the game's recurring cost.** Fully staffing a prison costs
`80 / 8 = 10` per occupied place-day against `300` of income from the same
place — **3.3%**. There is no food bill, no power bill, no maintenance bill, no
per-prisoner upkeep of any kind on that list.

**MEASURED, act 1, the slope with nothing pressed.** Four prisoners, one guard,
read off the treasury series at each day boundary:

| day boundary tick | treasury | step |
| --- | --- | --- |
| 7,210 | 23,410 | +1,200 |
| 7,495 | 23,330 | −80 *(the hire's second charge — see below)* |
| 9,617 | 24,450 | +1,120 |
| 12,022 | 25,570 | +1,120 |
| 14,429 | 26,690 | +1,120 |
| 16,806 | 27,810 | +1,120 |
| 19,224 | 28,930 | +1,120 |
| 21,610 | 30,050 | +1,120 |
| 24,014 | 31,170 | +1,120 |
| 26,426 | 32,290 | +1,120 |

**`+1,120` a day, eight consecutive day boundaries, not one of them different.**
That is `4 × 300 − 80` exactly, which confirms both the per-occupied-place rule
and the single-guard payroll from the outside. The −80 on its own at t7,495 is
the documented double charge on a hire mid-day: the hire takes one day's wage up
front and the boundary bills the same day again
(`src/simulation/staff/hiring.ts:38,58-62`).

**MEASURED, act 2, the slope while the prison was failing.** Twelve prisoners,
still one guard, five assaults, every one uncontained: the treasury went from
**27,460 to 43,470** over the remaining ~12,400 ticks, and `unpaidWagesMinorUnits`
never left 0.

**So the number a player would steer by is `FUNDS`, and in every prison that has
beds it only goes up.** `TREASURY_STARTING_BALANCE_MINOR_UNITS` is 25,000
(`src/simulation/economy/treasury.ts:203`) and every measurement in this record
ends above it. The insolvency ladder — the rungs at −1,250 and the overdraft
floor at −2,500 that `2026-09-04-can-this-prison-fail.md` played — is reachable
only *before* the first bed is occupied. **After that the economy has no
downward slope at all.**

**This is the finding, stated as precisely as the brief asked.** There is a
pressure and it grows; what is missing is that **relieving it is never a
decision**, because the remedy costs 3.3% of the income of the thing that
created it. At twelve prisoners the game says *"Hire 1 more to cover this
population"* and the honest player answer is *"obviously, it costs 2% of what I
earn"*. There is no state in which a player must choose between a guard and
something else, because there is nothing else and there is always enough.

**What would change this finding, precisely:** any recurring cost that scales
with population at a rate comparable to 300 per place-day. Not a penalty — a
*bill*. The suspended unmet-need withholding is not that either: see §5.

---

## 3. There is no reason to build a second cell, and the reason is arithmetic

**The brief asked for exactly this shape of answer** — *"There is no reason to
build a second cell because X"* — so here is X.

**VERIFIED, read.** `deriveRoomCapacity`
(`src/simulation/objects/room-capacity.ts:172-190`) walks the objects in a room
and credits `residentCapacity += definition.footprint.width` for every object
whose capabilities include `'sleep-surface'`. That is the whole derivation.
There is **no per-room ceiling, no tiles-per-occupant term, and nothing else
that contributes.** Two objects in the catalogue declare that capability —
`object.bed` and `object.medical-bed`
(`src/content/object-catalog.ts:97-98`), both `footprint: { width: 1, height: 2 }`.

**VERIFIED, read.** Cell sharing is a *preference*, not a limit.
`rateCellSharing` (`src/simulation/prisoners/cell-sharing.ts:72-81`) returns
`max |arrival.riskTier − occupant.riskTier|` and its own docblock says why it
is a number and not a verdict: *"some pairings are unwise rather than
forbidden"* (`:29-30`). `firstAvailableAccommodationTarget` prefers a better
rating; nothing refuses a worse one.

**MEASURED, act 2.** Eight bed orders were placed inside the standing 6×6 cell —
no new walls, no new room, no designation:

```
[act2] 8 extra bed order(s) placed INSIDE the existing 6x6 cell
[act2] ONE CELL with twelve beds: {"tick":14724,"counts":{"prisoners":4,"rooms":1,
  "roomCapacity":12,"accommodationCapacity":12,"roomOccupants":4,"occupiedPlaces":4, …}}
```

and after eight presses of *Admit*, all twelve were housed and all twelve were
paid for: `occupiedPlaces: 4 -> 12`, `rooms` **still 1**.

**DERIVED.** A 6×6 room is 36 tiles; a bed is 1×2 and the room type requires one
toilet at 1×1 (`src/content/room-catalog.ts:92-97`). So the starter cell holds
about **seventeen beds**, which at 300 a place-day is **5,100 a day** out of one
rectangle, against `ceil(17/8) = 3` guards at 240. **Nothing in the game asks
for a second room, and building one adds no capacity the first cannot supply.**

**And the second room, built anyway, was accepted while housing nobody.** Act 2
phase C walled a 3×4 rectangle at (19,11)–(21,14) and designated it
`room.cell`. It was accepted **on attempt 1** — and the `ROOMS` badge went from
1 to 2 — with **zero beds and zero toilets in it**:

```
[act2] designate room.cell attempt 1: rooms=2 | panel said ["NEEDS AT LEAST 2 × 3 TILES",
  "MUST BE ENCLOSED","NEEDS 1 × BED","NEEDS 1 × TOILET","ENCLOSURE"]
  | band "The object was not placed — it has to stand in a room you have zoned."
[act2] DELTA one room -> two rooms
  MOVED (5/22): activeIncidentType: undefined -> "assault" | activeIncidents: 0 -> 1 |
    rooms: 1 -> 2 | stateIncomeAccruedTodayMinorUnits: 2836 -> 2224 |
    treasuryMinorUnits: 30980 -> 43470
  STILL (17/22): accommodationCapacity, … occupiedPlaces, prisoners, …
```

Two things in that one line, and the second is an instrument failure of mine
(§10): **`accommodationCapacity` did not move**, because this run placed the
beds *before* zoning and the game refused every one of them with a clear and
correct sentence — *"The object was not placed — it has to stand in a room you
have zoned."* But the **room was still designated a Cell**, the requirement
list beside it still said `NEEDS 1 × BED` / `NEEDS 1 × TOILET`, and the
`ROOMS` badge on the strip incremented anyway.

**So `ROOMS` counts rooms, not working rooms**, and the room-type requirement
list is a readout rather than a gate. That is consistent with the rule the brief
verified from the other end — *24 prisoners with no bed earn zero* — and it is
the same shape one level up: a prison can show `2 ROOMS` while one of them is an
empty walled box.

---

## 4. The player has fifteen verbs, and eleven of them are one verb

**VERIFIED, read.** `src/simulation/protocol/commands.ts` declares exactly
fifteen command types, and this is the whole vocabulary of player action in the
game:

| group | commands | count |
| --- | --- | --- |
| build, buy, undo | `PlaceBuildOrder`, `PlaceObject`, `RemoveObject`, `CancelBuildOrder`, `PurchaseMaterials`, `CancelMaterialPurchase`, `ZoneRoom`, `UnzoneRoom`, `Undo`, `Redo` | **10** |
| people | `AdmitPrisoner`, `HireStaff`, `DismissStaff`, `ReleaseGuardAssignment` | 4 |
| the HUD itself | `DismissAlert` | 1 |

**There is no command that sets a policy.** Not a regime, not a security grade,
not a sector, not a post, not a search, not a lockdown, not a transfer, not a
punishment. Growth cannot be *managed*; it can only be *built*.

**MEASURED, act 1.** A census of every `button`, `input` and `select` inside
`.hud` found **116 controls**, and the Regime panel contributes **none of
them** — the only regime entries in the census are the tab button itself and a
`Collapse` toggle.

That matters because the regime is visibly deciding what the prisoners do. The
Regime tab at that moment, quoted (UPPER BOUND):

> `TODAY'S BLOCKS` / `General Population` / `84% THROUGH` / `Allows Recreation,
> Hygiene, Free Association` / `High Risk` / `98% THROUGH` / `Allows Sleep,
> Meal, Hygiene`

and the roster underneath it showed all four prisoners doing the same thing at
the same time:

> `PRISONERS` / `4 of 4` / `Sonia Varga` / `Low` / `Using Toilet` / `Hygiene` /
> `0%` / `Gustav Abara` / `Minimal` / `Using Toilet` / `Hygiene` / `0%` /
> `Sonia Ueda` / `Minimal` / `Using Toilet` / `Hygiene` / `0%` / `Petra Dolan` /
> `Minimal` / `Using Toilet` / `Hygiene` / `0%`

**VERIFIED, read**, and this is why: the block filter is applied before the
utility ranking (`src/simulation/prisoners/utility-ai.ts:6`,
`allowedCategories.includes(action.category)`), the `General Population` block
running at that moment allows `recreation`, `hygiene` and `free-association`
only, and of those the prison provided exactly one thing —
`action.use-toilet`, category `'hygiene'`, requiring `'sanitation'`
(`src/simulation/prisoners/actions.ts:127-131`). `action.shower` needs a
`room.shower-room` and `action.yard-recreation` needs a `room.yard`; the prison
had neither. **Four prisoners queueing for one toilet at bladder 91–99% is the
regime working exactly as authored, and the player cannot change the schedule,
because no command exists to change it.**

The two schedules themselves are authored constants —
`GENERAL_POPULATION_REGIME` and `HIGH_RISK_REGIME`,
`src/simulation/prisoners/regime.ts:104` and `:120`, collected into
`DEFAULT_REGIME_SCHEDULES` at `:130`. Nothing in `src/` writes a third, and
nothing edits either.

---

## 5. Seven of the eighteen room types do nothing at all once built

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
`room.utility-room`.** Nothing in the simulation names them, and the negative
was checked for indirection: room *categories* reach the simulation nowhere
either — `grep -rn '\.category\b' src/simulation/` returns only object
categories (walls, in `construction/definition.ts:1006`) and two projection
pass-throughs (`presentation/room-projection.ts:552`, `:612`). There is no
category-driven behaviour to catch them.

The other eleven are wired, each to something specific and each **VERIFIED,
read**:

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

**So there is genuinely something to build toward — eleven of eighteen rooms
change what prisoners do — and the catalogue is honest about seven of them only
in the sense that it never claims otherwise.** A player who builds an Infirmary
because the list offers one has built a walled box with a bed in it. Nothing
lies to them; nothing tells them either.

---

## 6. The one positive-feedback channel the game has is empty by construction

**MEASURED, act 1.** Across the whole act — 24 wall segments ordered and built,
one room designated, four beds and a toilet placed, four prisoners admitted, a
guard hired, and 27,658 ticks of clock (11.5 in-game days) — the worker pushed
**zero** `simulation/event` messages:

```
[act1] worker message kinds so far: {"simulation/ready":1,"simulation/status-counts":340,
  "simulation/command-result":50,"simulation/clock-state":956}
```

`simulation/event` does not appear in that tally at all. (The tally is
kind-agnostic, which is the only reason this survived my own reader bug — §10.
`simulation/delta`, `simulation/snapshot` and `simulation/projection` are absent
because `installTee` drops them on purpose to bound the array, so their absence
is the harness's design and not a finding.)

**VERIFIED, read**, and this is why zero is the expected number rather than a
surprise. `SIMULATION_EVENT_TYPES` (`src/simulation/protocol/types.ts:1675-1694`)
has **eighteen** members, and **not one of them reports something going right**:

- four `construction.*` — a cancellation, a cancellation underway, an undo, a redo;
- one `contraband.discovered`;
- four `economy.*` — deliveries refused, construction refused, a delivery cancelled, wages unpaid;
- six `incidents.*` — an assault, a riot, a gang retaliation, an escape attempt, an escape succeeded, and two all-clears that are recoveries *from* those;
- `prisoners.relocated` — a resident whose bed was taken away;
- `prisoners.discharged` — the single neutral one, graded `'info'` at `src/ui/simulation-events.ts:286`.

**So the alerts band is a bad-news-and-undo channel, and in a well-run prison it
is silent.** There is no event for a wall finishing, a cell becoming habitable,
a prisoner settling in, a day being paid, or a coverage gap being closed. The
player's own successful actions produce nothing at all: they produce a
`simulation/command-result` (50 of them in act 1), which is a refusal channel
that says nothing when it accepts.

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
same enabled state, same boxes. That is the brief's requested shape of finding,
with the count filled in: at tick 27,658 the only things that had changed since
tick 19,387 were the treasury and the accrual, and **every** control did exactly
what it did before.

**The honest counterweight**, because it is real: `EARNED TODAY` is a live
number that moves every tick. It rises at `dailyGrant / DAY_LENGTH_TICKS` —
0.5 a tick at four occupied places — and it is the one figure on the strip a
player can watch respond to what they built. It was `12` at the moment the
settled screen was dumped and `629` three days later. That is a number worth
watching. It is also the only one.

---

## 7. Nothing on screen states the rule the whole economy runs on

**VERIFIED, read.** `stateIncomeForOccupiedPlaces`
(`src/simulation/economy/income.ts:548-556`) folds over occupied *place* ids —
`residentIdsWithExistingPlace()` — so the unit of income is a bed with somebody
in it, not a prisoner. The brief verified this independently and it holds.

**VERIFIED, read.** What the player is given for it is two words and a number.
`'hud.status.earned-today': 'Earned today'`
(`src/content/default-locale-en.ts:339`), and the comment above it states the
design deliberately: *"'Earned today', never 'Income' — there is no rate, no
budget and no forecast behind it"* (`:334-338`). **No string anywhere states the
rate, the unit, or that an unoccupied bed pays nothing.** `grep -n "earned\|income\|accrued" src/content/default-locale-en.ts`
returns the label, the funds labels and the insolvency sentences; none of them
carries the rule.

**What the strip does carry, and it is more than the brief credited.** The
`PRISONERS` chip has a segmented occupancy bar labelled `Cell occupancy` with
`{value} of {capacity}` (`src/ui/hud/status-strip.ts:275-286`,
`src/content/default-locale-en.ts:340-341`), fed from `occupiedPlaces` against
`accommodationCapacity` — and `simulation-counts.ts:70-87` records on the spot
why it is `occupiedPlaces` and not `roomOccupants`: *"a badge fed from
`roomOccupants` would read '0 with no bed' for a prison the state has already
stopped paying for."* So the numerator of the income rule **is** on screen. Only
the multiplier is missing.

**JUDGEMENT.** A player growing a prison can therefore see *how many beds are
full* and *how much came in today*, and can divide one by the other to
discover 300. They cannot be told it. That is a smaller gap than the brief
feared and a real one: the difference between a game that shows a rule and one
that can be reverse-engineered from it.

---

## 8. The number that says "your prisoners want something you have not built" never leaves the worker

**VERIFIED, read.** `ActionMetrics`
(`src/simulation/prisoners/action-system.ts:104-110`) declares
`unmetDemandCycles`, and its own comment defines it as
*"Reconsideration cycles where no legal action had a reachable, available
target — observable unmet demand."* Beside it: `routeFailures`,
`actionsStarted`, `actionsCompleted`, and a substitution counter for
*"somebody was served worse than they asked for"*.

**MEASURED, both directions.**
`grep -rn 'unmetDemandCycles' src/ui/ src/main.ts src/rendering/ src/simulation/presentation/`
returns **nothing**. `grep -rn 'ActionMetrics' src/` outside
`action-system.ts` returns five hits, all comments in
`session-systems.ts`, `actions.ts`, `prisoner-operations-runtime.ts` and
`components.ts`, plus the save schema. **It is not merely unread on the main
thread: it is never published.**

**Why this is outside the existing census rather than a duplicate of it.**
`docs/research/2026-09-04-what-the-game-shows-nobody.md` enumerates
`PROJECTION_CATALOG`'s fifteen ids, `statusCountsSchema`'s twenty-three fields
and the 398 declared members of the 52 view-model interfaces in
`src/simulation/presentation/`. `ActionMetrics` is in **none of those three
sets** — it is a simulation-side metrics object with no projection at all — so
no gate and no census in this repository has it in scope. Checked against that
record before filing, exactly as the brief asked.

**What a growing player is denied by it, concretely.** Act 1 measured four
prisoners with `Hygiene 0%` and `Recreation 0%` for want of two rooms, and act 4
runs it longer. The prison *knows* how many times a prisoner asked for something
it could not provide. The player can only find out by opening the Regime tab,
selecting one prisoner at a time out of a four-row window, and reading six
percentages.

---

## 9. The only long-horizon number in the game is invisible, and its stated blocker expired the day before this run

**VERIFIED, read.** A sentence is drawn per prisoner from **14 to 90 in-game
days** (`src/simulation/prisoners/sentence.ts:200-201`), written at the
classification stage as `sentenceEndTick`
(`src/simulation/prisoners/intake-system.ts:506`), and enforced by
`DischargeSystem` every 20 ticks
(`src/simulation/prisoners/discharge-system.ts:24`). At `DAY_LENGTH_TICKS`
2,400 and a 50 ms step that is 33,600 to 216,000 ticks — **28 minutes to three
hours of real time at 1×, seven minutes to 45 at the maximum speed of 4×**
(`SIMULATION_SPEEDS = [1, 2, 4]`,
`src/simulation/clock/fixed-step-clock.ts:17`).

`projectPrisonerDetail` publishes it: `sentence.lengthTicks` and
`sentence.endTick` (`src/simulation/presentation/prisoner-projection.ts:748-750`).

**The reader drops it, and says why.** `src/ui/simulation-prisoner-detail.ts:64-72`:

> **`sentence` and `currentAction`.** Both are renderable and neither can be
> *said*: a tick count is not a date … and every sentence that would frame
> either figure is new player-facing copy, **which is `AGENTS.md`'s fourth
> exclusion and the owner's.**

**That blocker no longer holds.** `AGENTS.md`'s fourth reservation was **partly
released by the owner on 2026-09-04** — the day before this run — and the
release covers exactly this: *"the CHOICE OF WORDS is ours now; the requirement
that a sentence be TRUE is not."* The owner's words, quoted in `AGENTS.md`:
*"Sam decyduj zawsze, jak zacznę grać to ujednolicimy"*. So the reason this
field is unpainted is a reservation that was relaxed, and the remaining
objection — that a tick count is not a date — is a presentation question with
an obvious answer the game already uses everywhere else: the strip renders a
`DAY` number and the Regime panel renders `84% THROUGH`, so days are already the
unit the player reads time in.

**No string is authored here** — the locale file is another agent's this wave,
and the brief forbids it. What the wording must convey, for the integrator to
place: **how much of this prisoner's sentence is left, in days**, on the
prisoner inspector that already shows their six needs.

**Why it is load-bearing for this question and not just another orphan.** The
census already lists `PrisonerDetailViewModel.sentence` as declined on the
record, and that part is not new. What is new is the *play* consequence: a
sentence ending is the **only mechanism in the game that takes something away
from the player without their pressing anything**. Income falls when a prisoner
leaves, and it is the one force that makes the prison a loop rather than a
ratchet. A player cannot see it coming, cannot plan for it, and finds out from
one line on a band that scrolls.

---

## 10. This pass's own instruments failed twice, and both are recorded

**(a) The event reader filtered on a message kind that does not exist.** It
looked for `kind === 'simulation/events'` and a `payload.events` array. The
worker posts `'simulation/event'`, **singular**, one event per message under
`payload.event`, and its own comment says so:
*"One message per event rather than one carrying an array"*
(`src/simulation/worker/state-machine.ts:728`). So act 1's
`events over the whole act: []` is what that reader always returns and is not a
measurement.

**The conclusion it supported still stands, and only because a second
instrument carried it.** `messageKinds` tallies whatever kind arrives without
naming any, and it reported no `simulation/event` message in act 1 at all. That
is the measurement §6 rests on. The reader was fixed before act 2 and promptly
found ten events — which is also the proof the fix works.

**(b) The second cell was built in the wrong order, and the game caught it.**
Act 2 phase C placed beds and a toilet *before* designating the room, and every
one was refused with *"The object was not placed — it has to stand in a room you
have zoned."* `buildAndPopulate` encodes the right order and this act
re-derived it badly, which is the same failure mode the shared harness's own
docblock warns about for `waitForQueueEmpty`. **It produced a finding anyway**
(§3: the room was still accepted as a Cell with no bed and no toilet, and
`ROOMS` still incremented), but the capacity figure in that delta vector
measures my mistake and not the game, and is labelled as such above.

**(c) Not a failure, but a limit worth stating.** `installTee` drops
`simulation/projection`, `simulation/delta` and `simulation/snapshot` to bound
its array. Every "the worker published only these kinds" reading in this record
is therefore about the *small* messages only. No claim here depends on a
projection reply.

---

## 11. Weakest claim, and what would change it

**The weakest claim in this record is §2's — that the pressure is real but its
answer is never a decision.** It rests on four constants and eleven measured day
boundaries, and the arithmetic is not in doubt. What is a **JUDGEMENT** is the
step from *"a guard costs 3.3% of the income it protects"* to *"therefore no
choice is being made"*. A player who does not know the rate might hesitate; a
player who has 43,470 in the bank and an alerts band full of assaults would not.

**What would change my mind:** a measurement at a population where the wage bill
is a visible fraction of income. The ratio is fixed at 1:30 by the two
constants, so it never arrives by growth — it would take a second recurring
cost. If one exists that this run missed, §2 is wrong and the whole reading
changes; `SpendClass` (`treasury.ts:332`) is the four-member list I checked it
against, and a fifth member is what would refute it.

**Second weakest: §5's seven inert rooms.** It is a text census, and a text
census cannot see a room reached through a variable. I checked the one
indirection that would matter — room *category* — and found none, but a room
resolved from a save, from a content pack or from an id built at runtime would
be invisible to it. What would settle it is a play of one inert room: designate
an Infirmary, put a medical bed in it, and watch whether any prisoner ever goes
there. This run did not do that.

**Third: the claim that nothing tells a player what to build next.** §1 refutes
the strong version of it — *"Hire 1 more to cover this population"* is exactly
that sentence, for staff. What I claim is narrower: **nothing ever names a
room.** No sentence in any state this run reached said *shower room*, *yard* or
*canteen*, with `Hygiene 0%` on every prisoner on screen. A run that reached a
state where the Rooms panel volunteers a missing room would refute it.

---

## 12. What was wrong in the commissioning brief

1. **"My hypothesis is that the mid-game is thin — that after the first working
   cell the game asks little and offers little."** **Wrong on the asking**, and
   §1 has the numbers: growth flips two published counts, changes a strip badge,
   puts a sentence with a figure on the Security tab, and produces five
   reported assaults. It is right on the *offering* in one specific sense — §4's
   fifteen verbs — and for a reason the brief did not anticipate: the pressure
   has a free answer (§2), not no answer.
2. **The handover's claim that tile (12,12) is off-screen at 1440×900.** The
   brief already flagged this as wrong; §0's clearance map confirms it and adds
   the measurement the brief did not have — the clear rectangle is only
   **12 × 11 tiles**, which is why a second 6×6 cell and an 8×8 yard do not fit
   beside the starter cell without moving the camera.
3. **"One all-clear sentence serving both a handled incident and an expired
   one", listed as an open finding.** Landed on `main` at v0.0.451 before this
   run: `incidents.all-clear-after-lapse` is its own type, graded `'warning'`,
   with its own sentence. Five lapses in act 2 rendered it.
4. **"Income is per occupied place-day … find out whether the game
   *communicates* that shape."** The brief expected the numerator to be missing
   too. It is not: the `PRISONERS` chip carries a `Cell occupancy` bar reading
   `{value} of {capacity}` off `occupiedPlaces`, with the reasoning for that
   exact field recorded in `simulation-counts.ts:70-87`. Only the **rate** is
   unstated (§7).

---

## 13. What this pass did not reach

- **No inert room was played.** §11 names this as the second-weakest claim's
  remedy.
- **No prison was grown past twelve prisoners.** The ratios in §2 and §3 are
  constants and do not change with scale, but the *rendering* and the panel
  windows might: the Regime roster is a four-row window on the population by
  the owner's own ruling (`PRISONER_ROSTER_ROW_LIMIT = 4`,
  `src/ui/hud/regime-panel.ts:293`), so at twelve prisoners a player can inspect
  four, and at fifty the same four. That is configured and ruled, not a defect,
  and this record does not file it as one.
- **Contraband was never exercised.** `contrabandDiscovered` stood at 0 in every
  sample of every act, and `contrabandPressureWeight` is documented as
  structurally zero (`src/simulation/incidents/sector-risk.ts:105-107`), so this
  record says nothing about that system.
- **Nothing here is about rendering.** Git LFS content is not provisioned in
  this container, so the atlas PNGs are pointer files and every act logged
  `Failed to process file … image /assets/actors/…`. That is the expected
  baseline; no claim above depends on an actor being drawn.
