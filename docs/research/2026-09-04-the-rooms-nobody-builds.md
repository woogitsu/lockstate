# The rooms nobody builds — does serving a need do anything a player can see?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.471** (`9429ba64`), in worktree
`/workspace/wt-the-rooms` on branch `agent/playtest-the-rooms-nobody-builds`.
Nothing under `src/` differs from that commit; the running page says so from
the inside — every screen dump below carries `v0.0.471` beside the short sha
of one of this branch's instrument-only commits (`eaaafae`, `b400341`,
`3cb3145`), each of which touches only `tests/` and `docs/`.

**`main` had moved to v0.0.473 (`70599d54`) by the time this record was
written**, two releases past the tree played, and one of the merges in between
is #981 *"fix/the-guards-that-do-not-guard"* (`83f347a9`). Nothing here was
re-measured against it. Every `Safety 100%` reading below is v0.0.471's
behaviour, at `9429ba64`, and could have moved since.

**Question, as commissioned:**

> Every play session in this repository so far has built one cell and stopped.
> That is why hunger, hygiene and recreation have never been servable, and why
> "build a canteen and there might be something to do" is still an open
> question rather than a refuted one. Build the second, third and fourth room.
> Does serving a need do anything a player can see?

**Instrument:** `tests/browser/playtest-2026-09-04-the-rooms-nobody-builds.playtest.ts`,
three acts, each runnable alone. Nothing in CI collects it —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/` and
`playwright.playtest.config.ts` is the config that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5324 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-rooms-nobody-builds.playtest.ts -g "act 3"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | the eighteen-row Rooms catalogue and the twenty-one-row Build catalogue, before anything is built | `1 passed (1.1m)` |
| 2 | four rooms zoned **before** anything is furnished — the run that measured the ordering rule, and the repository's first `room.yard` | `1 passed (13.2m)` |
| 3 | the same four rooms in the order the game allows: wall, door, designate, furnish, one room per phase with three in-game days after each | `1 passed (13.3m)` |
| 4 | one whole in-game day in the finished four-room prison, sampled across it — the repair for acts 2 and 3 both reading the roster inside the sleep block | `1 passed (7.5m)` |

## The answer, in one paragraph

**Yes — serving a need does something a player can see, and it is dramatic;
but the *only* place it can be seen is one column of one tab, and the moment
of purchase says nothing at all.** Four rooms were built in one prison for the
first time in this repository, for **5,405** of materials all told — a 5 × 3
cell with four beds (1,565), a 6 × 6 canteen (2,815, and the most expensive
room type in the game), a 3 × 3 shower room (1,025), and an 8 × 8 yard (**0**
— and the
first `room.yard` ever placed in a Lockstate playtest; acts 2, 3 and 4 placed
one each, all three accepted on the first designation attempt). All four are genuinely used, and act 4 proves it across a whole day rather
than by luck: eleven samples of a settled four-room prison show `Eating` in
the meal block, `Yard Time` in the recreation blocks and `Showering` in the
hygiene ones, with `Eating in Cell` never appearing at all. `hygiene` went
**0% → 90%** two in-game days after the shower room opened and `recreation`
went **0% → 93%** two days after the yard did, and the four-room prison ends
with every one of the six needs above 60% and every prisoner at `Minimal`
risk, against a one-cell prison whose worst need was `Hygiene 29%` and
falling. **So more rooms unambiguously makes the prison better.** What the
player is told about it is: the `ROOMS` badge going up by one at designation,
and after that, nothing — over 50,642 ticks and three rooms, exactly one of
the twenty-one published counts moved because of a room, and the only
simulation event the worker pushed in the whole run was `prisoners.discharged`.
The Rooms tab of a prison with four working rooms is the eighteen-row *type*
catalogue and nothing else; **there is no list of the rooms you have, no
readout of whether anybody is in one, and no sentence in the game that names a
room and a need in the same breath.** Two rooms are worth calling out
individually: **the canteen is the most expensive room in the game and, at
this scale, a no-op** — `action.eat-in-cell` already holds hunger at 97% in a
prison with no canteen, so the canteen buys a 33% faster route to the one need
that is not scarce; and **seven of the eighteen room types are still bought
and sold while doing nothing at all** (issue #595 says nine — at v0.0.471,
`9429ba64`, it is seven, and §3 is the census).

---

## Claim tiers

- **MEASURED** — produced by one of the runs above and quoted from its output.
- **VERIFIED, read** — a file was opened at the line cited, in the played
  worktree at v0.0.471 (`9429ba64`).
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — about what a *player* would feel rather than what the game
  did.

Nothing here is **FROM MEMORY**.

**The two channels are kept apart.** Sentences are quoted from
`document.querySelector('.hud').innerText`; numbers come from the worker's
`simulation/status-counts` through the tee, and ticks from
`simulation/clock-state`. **Every quoted screen dump is an UPPER BOUND** on
what a player can read without scrolling — `innerText` does not respect a
scroll container's clipping.

**Presses were proved to land.** Every world point pressed is checked with
`document.elementFromPoint` first and the act fails if anything but the canvas
is on top. `calibrate` measured the world origin at **(−304, −574)** at
1440×900 in both acts 2 and 3, identically.

---

## Two corrections to the brief, before anything else

**1. The two records the brief calls "just landed" are not on `main`.**
`git ls-tree -r origin/main --name-only docs/research/` returns neither
`2026-09-04-the-standing-crowd.md` nor `2026-09-04-the-hud-a-player-reads.md`
— checked twice, at `9429ba64` when this pass started and again at
`70599d54` (v0.0.473) when it finished (MEASURED, both). Their claims are therefore
treated here as unverified hypotheses, and §6 tests one of them from the other
side rather than inheriting it.

**2. A shower room *has* been built and *has* worked, so the brief's premise
is half stale.** `docs/research/2026-09-04-is-there-anything-to-do.md` §2.3
(v0.0.451) built a doored shower room and measured `Hygiene` 0% → 98%,
replicated three times. What that record could *not* do was place a
`room.yard`: it attempted one three times and placed none. **`room.canteen`
and `room.yard` had never been built by any playtest in this repository before
this one**, and no prison in the record has ever had four rooms.

---

## 1. What a player can find out about a room before they pay for it

**MEASURED, act 1.** The Rooms catalogue offers exactly eighteen types, in
this order:

```
[act1] the Rooms catalogue offers 18 type(s): ["room.staff-room","room.classroom",
  "room.canteen","room.kitchen","room.cell","room.holding-cell","room.laundry",
  "room.shower-room","room.delivery-bay","room.garbage-room","room.storage-room",
  "room.infirmary","room.reception","room.common-room","room.yard",
  "room.security-office","room.solitary-cell","room.utility-room"]
```

**Every one of them states its whole requirement set, in words, before you
commit.** This is the half the game does well and it should be said first.
Selecting a row repaints `.hud-rooms__rule-block`; the eighteen readings,
quoted verbatim from the run:

| type | what the panel says when you select it |
| --- | --- |
| Staff Room | `NEEDS AT LEAST 3 × 3 TILES · MUST BE ENCLOSED · NEEDS 1 × DESK · NEEDS 2 × CHAIR` |
| Classroom | `NEEDS AT LEAST 5 × 5 TILES · MUST BE ENCLOSED · NEEDS 1 × BOOKSHELF · NEEDS 4 × CHAIR` |
| Canteen | `NEEDS AT LEAST 6 × 6 TILES · MUST BE ENCLOSED · NEEDS 2 × DINING TABLE · NEEDS 4 × BENCH` |
| Kitchen | `NEEDS AT LEAST 4 × 4 TILES · MUST BE ENCLOSED · NEEDS 1 × STOVE · NEEDS 1 × PREP COUNTER · NEEDS 1 × FRIDGE` |
| Cell | `NEEDS AT LEAST 2 × 3 TILES · MUST BE ENCLOSED · NEEDS 1 × BED · NEEDS 1 × TOILET` |
| Holding Cell | `NEEDS AT LEAST 2 × 2 TILES · MUST BE ENCLOSED · NEEDS 1 × BENCH` |
| Laundry | `NEEDS AT LEAST 3 × 3 TILES · MUST BE ENCLOSED · NEEDS 2 × WASHING MACHINE` |
| Shower Room | `NEEDS AT LEAST 3 × 3 TILES · MUST BE ENCLOSED · NEEDS 2 × SHOWER HEAD` |
| Delivery Bay | `NEEDS AT LEAST 4 × 4 TILES · MUST BE ENCLOSED · NEEDS 1 × LOADING DOCK DOOR` |
| Garbage Room | `NEEDS AT LEAST 2 × 2 TILES · MUST BE ENCLOSED · NEEDS 2 × WASTE BIN` |
| Storage Room | `NEEDS AT LEAST 3 × 3 TILES · MUST BE ENCLOSED · NEEDS 2 × STORAGE RACK` |
| Infirmary | `NEEDS AT LEAST 4 × 4 TILES · MUST BE ENCLOSED · NEEDS 1 × MEDICAL BED · NEEDS 1 × MEDICINE CABINET` |
| Reception | `NEEDS AT LEAST 4 × 4 TILES · MUST BE ENCLOSED · NEEDS 1 × DESK · NEEDS 2 × CHAIR` |
| Common Room | `NEEDS AT LEAST 5 × 5 TILES · MUST BE ENCLOSED · NEEDS 2 × BENCH` |
| Yard | `NEEDS AT LEAST 8 × 8 TILES · MUST BE OUTDOORS · NO OBJECTS NEEDED` |
| Security Office | `NEEDS AT LEAST 3 × 3 TILES · MUST BE ENCLOSED · NEEDS 1 × SECURITY CONSOLE` |
| Solitary Cell | `NEEDS AT LEAST 2 × 2 TILES · MUST BE ENCLOSED · NEEDS 1 × BED · NEEDS 1 × TOILET` |
| Utility Room | `NEEDS AT LEAST 2 × 2 TILES · MUST BE ENCLOSED · NEEDS 1 × UTILITY PANEL` |

Each of the eighteen agrees, row for row, with
`src/content/room-catalog.ts`'s `rawRoomDefinitions` (VERIFIED, read: the
`requirements` array of every entry). **Nothing here has rotted.**

**What none of the eighteen says is what the room is FOR.** No row names a
need, a category, an activity or a consequence. A player reading `Canteen ·
NEEDS 2 × DINING TABLE` is told the price of admission and never told what
they are buying. §3 says which of the eighteen are buying nothing at all.

### 1.1 The Build catalogue names twenty-one things and prices none of them

**MEASURED, act 1.** Every row of `.hud-build__list`, with the row's own
`innerText`:

```
[act1] wall-brick: row="Brick wall | Selected" | arm="Place on map" | detail=".hud-build__detail: ABSENT"
[act1] bed-wooden: row="Bed" | arm="Place on map" | detail=".hud-build__detail: ABSENT"
[act1] dining-table-wooden: row="Dining Table" | arm="Place on map" | detail=".hud-build__detail: ABSENT"
…
```

— twenty-one rows, each a name, plus a `Selected` badge on the one chosen.
**VERIFIED, read.** That is all a row is:
`src/ui/hud/build-panel.ts:985-987` constructs it as
`createListRow({ icon: 'build', label: t(buildable.labelKey), … })`, and
nothing else is appended to it anywhere in the file. No material, no
quantity, no work, no price.

**One price exists, and it is one fold away.** Opening the buy row and
stepping the quantity repaints the submit control, and *that* control is the
only figure in the game that says what anything costs. MEASURED, act 2, with
the quantities this playtest bought:

```
[act2] buy wall-brick x120: the control reads "Buy 120 × Brick · 4,800"
[act2] buy door-wooden x5:  the control reads "Buy 5 × Wood Plank · 325"
[act2] buy bed-wooden x6:   the control reads "Buy 6 × Wood Plank · 390"
[act2] buy toilet-brick x3: the control reads "Buy 3 × Brick · 120"
[act2] buy shower-head-brick x6: the control reads "Buy 6 × Brick · 240"
[act2] buy dining-table-wooden x8: the control reads "Buy 8 × Wood Plank · 520"
[act2] buy bench-wooden x10: the control reads "Buy 10 × Wood Plank · 650"
```

**VERIFIED, read.** `paintBuyTotal` in `src/ui/hud/build-panel.ts` computes
`const total = material.unitPriceMinorUnits * quantity;` and feeds it to
`buySubmit.setLabel(t(HUD_MESSAGE_KEY.buildBuySubmit, { count, material,
total }))`; the string is
`'hud.build.buy-submit': 'Buy {count} × {material} · {total}'`
(`src/content/default-locale-en.ts:1400`).

**So the price a player can find is the price of a unit of raw material, and
it is behind a fold, on a control that is about buying rather than about
building.** It is *per material*, never per object and never per room: nothing
on screen says a bed is one plank, that a dining table is three, or that a
brick wall segment is two. The player is shown the price of bricks and left to
discover how many a wall eats.

## 2. What a room costs, computed, because the game will not tell you

**DERIVED**, from `BUILDABLE_REGISTRY` (`src/simulation/construction/definition.ts`,
every `materialsRequired` row opened) and
`DEFAULT_PROCUREMENT_CATALOG` (`src/content/procurement-catalog.ts:100-101`,
`item.brick` 40 and `item.wood-plank` 65 — the only two purchasable
materials). A wall segment is 2 bricks = **80**. A perimeter of a `w × h`
rectangle is `2(w + h)` segments. Objects follow the rule the registry states
about itself — *"an object costs one unit of material and 30 work per place it
provides"*, `materialsRequired[0].quantity = footprint.width`.

**The cheapest legal instance of each of the eighteen**, walls plus the
objects the requirement names, against a starting treasury of **25,000**
(`TREASURY_STARTING_BALANCE_MINOR_UNITS`, `src/simulation/economy/treasury.ts:203`):

| type | minimum | walls | required objects | **total** |
| --- | --- | --- | --- | --- |
| **Yard** | 8 × 8 | — outdoors | none | **0** |
| Utility Room | 2 × 2 | 8 × 80 = 640 | 1 utility panel = 40 | **680** |
| Garbage Room | 2 × 2 | 640 | 2 waste bins = 80 | **720** |
| Solitary Cell | 2 × 2 | 640 | bed 65 + toilet 40 | **745** |
| Holding Cell | 2 × 2 | 640 | 1 bench = 130 | **770** |
| Cell | 2 × 3 | 10 × 80 = 800 | bed 65 + toilet 40 | **905** |
| Security Office | 3 × 3 | 12 × 80 = 960 | 1 security console = 80 | **1,040** |
| Shower Room | 3 × 3 | 960 | 2 shower heads = 80 | **1,040** |
| Storage Room | 3 × 3 | 960 | 2 storage racks = 130 | **1,090** |
| Laundry | 3 × 3 | 960 | 2 washing machines = 160 | **1,120** |
| Staff Room | 3 × 3 | 960 | desk 130 + 2 chairs 130 | **1,220** |
| Infirmary | 4 × 4 | 16 × 80 = 1,280 | medical bed 65 + cabinet 65 | **1,410** |
| Delivery Bay | 4 × 4 | 1,280 | loading dock door = 195 | **1,475** |
| Kitchen | 4 × 4 | 1,280 | stove 80 + prep counter 80 + fridge 40 | **1,480** |
| Reception | 4 × 4 | 1,280 | desk 130 + 2 chairs 130 | **1,540** |
| Common Room | 5 × 5 | 20 × 80 = 1,600 | 2 benches = 260 | **1,860** |
| Classroom | 5 × 5 | 1,600 | bookshelf 130 + 4 chairs 260 | **1,990** |
| **Canteen** | 6 × 6 | 24 × 80 = 1,920 | 2 dining tables 390 + 4 benches 520 | **2,830** |

Two things fall straight out of that table and neither is on screen anywhere.

- **The canteen is the most expensive room in the game and the yard is free.**
  A canteen is 2,830 — eleven per cent of the whole opening treasury, and
  three times a cell. A yard costs **nothing at all**: no walls, no objects,
  no money, only 64 tiles of ground.
- **Floor space, not money, is the binding constraint.** The world is one
  32 × 32 chunk (`new SparseWorld(32)`, `src/simulation/runtime/new-session.ts:431`,
  VERIFIED, read) and at 1440 × 900 the clear canvas a pointer can reach
  without panning is **x = 12..22, y = 10..21** — MEASURED, act 2's clearance
  map, and identical to the map `2026-09-04-is-there-anything-to-do.md` §0
  measured at v0.0.451:

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
  …
  y=21  ######............####
  y=22  ........######........
  ```

  Twelve columns by twelve rows, 144 tiles, and **an 8 × 8 yard eats 44% of
  them.** Act 3 fits a 6 × 6 canteen, a 5 × 3 cell and a 3 × 3 shower room in
  that rectangle with one corridor row and one corridor column to spare, and
  the yard does not fit at all — it needs the camera moved (§5).

## 3. Seven dead rooms, not nine — issue #595's figure has moved, and here is the census

Issue #595 is titled *"The nine dead rooms need readers, not functions"*. The
brief asks that the figure be verified rather than quoted. **At v0.0.471
(`9429ba64`) it is seven**, and the two that came alive did so through
`docs/adr/0093-a-carry-is-an-action.md`'s delivery route.

**MEASURED**, a grep of every room-catalog id across `src/`, excluding the
catalogue that authors them and the two locale modules that name them:

```
for r in cell holding-cell … utility-room; do
  grep -rn "room.$r'" src/ --include=*.ts     | grep -v room-catalog.ts | grep -v default-locale-en.ts | grep -v simulation-message-keys.ts | wc -l
done
```

| room type | what reads it | alive? |
| --- | --- | --- |
| `room.cell` | `IntakeSystem`'s `CELL` accommodation target, `src/simulation/prisoners/intake-system.ts:70` | yes |
| `room.solitary-cell` | the same file's `SOLITARY_CELL` at `:71`, and `SOLITARY_SANCTION_ROOM_CATALOG_ID`, `src/simulation/prisoners/sanction-system.ts:18` | yes |
| `room.canteen` | `action.eat-meal`, `src/simulation/prisoners/actions.ts:120-122` | yes |
| `room.shower-room` | `action.shower`, `:132-134` | yes |
| `room.yard` | `action.yard-recreation`, `:165-167` | yes |
| `room.common-room` | `action.common-room-recreation`, `:169-171` | yes |
| `room.classroom` | `action.classroom-education`, `:173-175` | yes |
| `room.laundry` | `action.laundry-work`, `:282-284` | yes |
| `room.kitchen` | `action.kitchen-work`, `:346-348` | yes |
| `room.delivery-bay` | `DELIVERY_BAY_ROOM_CATALOG_ID`, `src/simulation/operations/delivery-route.ts:21` | **newly yes** |
| `room.storage-room` | `STORAGE_ROOM_ROOM_CATALOG_ID`, `:22` | **newly yes** |
| `room.holding-cell` | **nothing** | no |
| `room.reception` | **nothing** | no |
| `room.infirmary` | **nothing** | no |
| `room.security-office` | **nothing** | no |
| `room.staff-room` | **nothing** | no |
| `room.garbage-room` | **nothing** | no |
| `room.utility-room` | **nothing** | no |

**VERIFIED, read, that the delivery route is wired into a live session and not
merely written**: `src/simulation/runtime/new-session.ts:793` constructs
`new ProcurementSystem(treasury, constructionMaterials, deliveryCarryRoute)`,
and `src/simulation/economy/procurement.ts:439` calls
`this.carryRoute?.landAndRaiseCarry(…)` on every delivery. So #595's count
should read **seven**, and its four proposals still each name a live gap —
`garbage-room`, `utility-room`, `security-office` and `staff-room` are all in
the dead seven.

**The cheapest dead room is 680 and the most expensive is 1,540.** A player
can spend 1,540 on a Reception, satisfy every requirement the panel states,
watch the `ROOMS` badge go up by one, and receive nothing whatever in return
— and nothing on any screen distinguishes that transaction from the 1,040
they spend on a shower room, which changes a prisoner's day completely (§6).
**That is the finding in this section**, and it is a stronger statement than
"nine rooms have no function": the rooms are not merely unimplemented, they
are *sold*, at a price, indistinguishably from the ones that work.

## 4. You cannot build the furniture before you zone the room, and act 2 is the proof

**MEASURED, act 2.** The act was written to build every wall, door and object
first and then designate the rooms one at a time, so that each room's arrival
would be a clean step change. **The game does not allow it.** All fifty-two
wall segments and all three doors were accepted; **all eleven object
placements were refused**, each with the same sentence on the refusal band:

```
[act2] bed-wooden at (13,18): 1 command(s) | band "The object was not placed — it has to stand in a room you have zoned."
[act2] toilet-brick at (12,20): 1 command(s) | band "The object was not placed — it has to stand in a room you have zoned."
[act2] dining-table-wooden at (12,11): 1 command(s) | band "The object was not placed — it has to stand in a room you have zoned."
[act2] bench-wooden at (12,16): 1 command(s) | band "The object was not placed — it has to stand in a room you have zoned."
[act2] shower-head-brick at (20,18): 1 command(s) | band "The object was not placed — it has to stand in a room you have zoned."
```

**The refusal is correct, immediate, and says exactly what to do.** It is a
good sentence and this record should say so: it names the rule, it names the
remedy, and it fires on the first press rather than at the end of the build.
**JUDGEMENT:** this is the clearest single piece of teaching in the build
surface.

**So the order a player is forced into is: wall → door → designate →
furnish**, per room, and act 3 is played that way. Recorded here rather than
quietly fixed, because the run that discovered it also produced §5, and
because an instrument's false start teaches the next reader what the game
insists on.

**What act 2's prison then was, and it is worth reading as a second
measurement.** Four rooms zoned, no bed anywhere, four prisoners admitted.
Over 43,760 ticks — **eighteen in-game days** — with one guard and
`prisonersCovered: 4` throughout:

```
[act2] DELTA the whole act: one cell -> four rooms
ticks 9042 -> 52802 (43760 ticks)
  MOVED (3/21): prisonersHighRisk: 0 -> 4 | rooms: 1 -> 4 | treasuryMinorUnits: 17875 -> 16355
  STILL (18/21): accommodationCapacity, activeIncidents, conditions, contrabandDiscovered,
    dailyWageBillMinorUnits, occupiedPlaces, prisoners, prisonersCovered, prisonersInIntake,
    prisonersUnderstaffed, prisonersUnguarded, roomCapacity, roomOccupants, staff,
    staffUnassigned, stateIncomeAccruedTodayMinorUnits, treasuryOverdraftFloorMinorUnits,
    unpaidWagesMinorUnits
[act2] events over the whole act: ["incidents.assault-opened","incidents.all-clear-after-lapse",
  "incidents.assault-opened","incidents.all-clear-after-lapse","incidents.riot-opened",
  "incidents.all-clear-after-lapse", … ]  — 2 assaults and 8 riots, every one lapsing
```

Every prisoner sat at `Idle` for eighteen days with every need at `0%`, and
**the prison never earned a single unit**: `stateIncomeAccruedTodayMinorUnits`
was `0` at every sample, because the state pays per *occupied place* and there
were none. That is a second, independent reproduction of the standing-crowd
shape the brief describes, and **the screen said so plainly** — the status
strip read

> `4` / `PRISONERS` / **`4 with no bed`** … `4` / `HIGH RISK` … `4` / `ROOMS`

(`'hud.status.prisoners-without-bed': '{count} with no bed'`,
`src/content/default-locale-en.ts:167`, VERIFIED) and the alerts band carried
`A riot has broken out — 4 prisoners have stopped taking orders. 8× Day 21`
graded `Critical`. **An unhousable prison is one of the best-reported states
in this game.** It is a room *that works* the game has nothing to say about
(§7).

**One consequence chain here does reach the player, and it is the only one
this record found.** `prisonersHighRisk: 0 → 4` is on the status strip as its
own badge. It is not needs-driven directly — `ClassificationReviewSystem`
scores a `DisciplinaryRecord` folded from the incident log
(`src/simulation/prisoners/classification-review-system.ts:342, 364`,
VERIFIED, read) — so the chain is *unmet needs → sector risk → riot →
disciplinary evidence → risk tier → a badge*. Four links, and it took
eighteen days.

## 5. `room.yard` — designated and accepted, for the first time in this repository

**MEASURED, act 2.** The prior record attempted a yard three times and placed
none: once the rectangle landed on the HUD and submitted nothing, once it ran
off the map at tile 31, once it overlapped an existing room eight times over.
All three failures were the instrument's; none was the game's.

This pass replaced the "first fully-clear 8 × 8 square" scan with one that
**also rejects a rectangle overlapping a room this act built** — a room's
tiles are canvas, so `document.elementFromPoint` calls them clear, which is
exactly how the third failure happened. After a six-press `ArrowRight` pan
that moved the world origin from `(−304, −574)` to `(−605, −574)`:

```
[act2] 53 candidate yard rectangle(s) miss all three rooms and fit the map
[act2] the yard rectangle chosen: {"x0":18,"y0":10,"x1":25,"y1":17}
[act2] designate room.yard attempt 1: rooms=4 (was 3) | panel said ["NEEDS AT LEAST 8 × 8 TILES","MUST BE OUTDOORS","NO OBJECTS NEEDED"] | band …
[act2] the yard was accepted on attempt 1
```

**Accepted on the first attempt, on bare ground, with no walls, no objects and
no money spent.** The game's cheapest and largest room is also its easiest to
build, and the only thing standing between a player and one is that it does
not fit on the default screen beside a starter cell.

**What the prison gained by it, of the twenty-one counts the worker
publishes:**

```
[act2] DELTA the moment the yard opened
  MOVED (2/21): rooms: 3 -> 4 | treasuryMinorUnits: 17075 -> 16595
```

`rooms: 3 → 4`. The treasury move is the wage bill, not the yard: a yard is
free.


## 6. The four-room prison, one room at a time — act 3

One prison, four prisoners, one guard, `prisonersCovered: 4` throughout. Each
phase is wall → door → designate → furnish → three in-game days at 4×, with
the Regime roster and the prisoner inspector read at each day boundary. Every
room was **accepted on the first designation attempt**.

### 6.1 The cell alone already serves four of the six needs

**MEASURED, act 3, phase 0.** The furnished cell — 5 × 3, four beds, one
toilet, one wooden door, **1,565** as built (§2's table prices the *minimum*
2 × 3 cell with one bed at 905) — published `roomCapacity: 4`,
`accommodationCapacity: 4`, and once four prisoners were admitted
`roomOccupants: 4`, `occupiedPlaces: 4`, `conditions: []`. The inspector on
one prisoner, at admission and two days later:

| | Hunger | Sleep | Hygiene | Bladder | Safety | Recreation |
| --- | --- | --- | --- | --- | --- | --- |
| day 0 | 89% | 92% | 91% | 80% | 91% | 93% |
| day +2 | **97%** | **89%** | 50% | **51%** | **100%** | 62% |

and the roster's worst-need column over the three days, all four prisoners:

| | worst need on each row |
| --- | --- |
| day 0 | `Bladder 79, 68, 73, 80%` |
| day +1 | `Bladder 44, 44, 44, 45%` |
| day +2 | `Hygiene 50` / `Bladder 50, 50, 49%` |
| day +3 | `Hygiene 29, 31, 32, 33%` |

**Hunger rises to 97% in a prison with no canteen**, because
`action.eat-in-cell` targets `own-accommodation`, needs no object capability
and pays `hunger: 3` a tick (`src/simulation/prisoners/actions.ts:124-127`,
VERIFIED, read). Sleep and bladder are the bed and the toilet; safety is the
guard. **Only `hygiene` and `recreation` fall**, which is precisely what
ADR 0054 decision 1 rules they should: they are room-gated by design.

Of the twenty-one counts, over three days:

```
[act3] DELTA phase 0, cell only
ticks 7988 -> 16180 (8192 ticks)
  MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 394 -> 890 | treasuryMinorUnits: 18175 -> 21535
```

### 6.2 The canteen is used, and it changes nothing a player can see

**MEASURED, act 3, phase 1.** The canteen — 6 × 6, two dining tables, four
benches, one door: 23 wall segments, a wooden door and the minimum objects,
**2,815** as built against §2's 2,830 for an all-wall perimeter — was accepted on the first attempt and
furnished with no refusal. Building it took **7,087 ticks, nearly three
in-game days** of clock, and in that time hygiene reached 0% and recreation
2%, so the prison the canteen opened into was already at `Hunger 99%`.

```
[act3] DELTA the canteen arriving
  MOVED (3/21): rooms: 1 -> 2 | stateIncomeAccruedTodayMinorUnits: 890 -> 834 | treasuryMinorUnits: 21535 -> 24895
[act3] DELTA phase 1, three days with a canteen
  MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 834 -> 277 | treasuryMinorUnits: 24895 -> 29375
```

**`rooms: 1 → 2`, and that is the whole of it.** The accrual and the treasury
are the clock's own — the accrual resets at each boundary and the treasury
grows because a place pays 300 a day and a guard costs 80. Hunger over the
three days that followed: `99% → 90%`. It was 97% before the canteen existed.

**The canteen IS used, and the roster is where that shows.** MEASURED,
phase 2 day +1 and day +2 — the first samples that happened to land outside
the sleep block:

> `Jonas Varga | Minimal | **Eating** | …` · `Viktor Yilmaz | Minimal |
> **Eating** | …`
>
> and one day later, all four: `**Heading to Eating**`

`Eating` is `action.eat-meal`, the canteen action; the cell-side sibling has
its own distinct word, `Eating in Cell`
(`src/content/simulation-message-keys.ts:165-166`, VERIFIED, read). So
prisoners really do walk to the canteen and eat there.

**And it makes no difference to anything.** `action.eat-meal` pays
`hunger: 4` a tick against `action.eat-in-cell`'s `3`, into a need that was
already sitting at 97% without it. **DERIVED:** hunger decays at 0.05 a tick
(`NEED_DECAY_PER_TICK`, `src/simulation/prisoners/needs.ts:113`) and the three
`meal` blocks total 300 ticks a day (`GENERAL_POPULATION_REGIME`,
`src/simulation/prisoners/regime.ts:108,111,114`), so a day loses 120 levels
and the cell route alone returns up to 900. **The canteen is a 33% faster
route to a need that is not scarce.** It is the most expensive room in the
game and, at four prisoners in a cell with a toilet, it is a no-op.

That is the direct answer to the brief's *"build a canteen and there might be
something to do"*: **there is not, and it is not because the canteen is
broken — it is because the cell already feeds everybody.**

### 6.3 The shower room is the room that works, and it works loudly

**MEASURED, act 3, phase 2.** A 3 × 3 shower room with two shower heads and a
door, **1,025** as built, accepted on the first attempt. Hygiene had been at
**0%** on every prisoner for four in-game days when it opened. Two days later
the inspector read:

> `Wanda Tamm | Medium | Hunger 88% | Sleep 90% | **Hygiene 90%** | Bladder
> 75% | Safety 100% | Recreation 0%`

**0% → 90% in two in-game days**, and the roster's worst-need column moved off
`Hygiene` and onto `Recreation` by itself — which reproduces
`2026-09-04-is-there-anything-to-do.md` §2.3's result on a different tree, a
different layout and a different seed, and is the third and fourth
independent replication of it.

Of the twenty-one counts, the room's arrival moved `rooms: 2 → 3` and nothing
else; the three days after it moved six, and **five of the six are one
prisoner's sentence ending**, not the shower:

```
[act3] DELTA phase 2, three days with a shower room
ticks 36597 -> 44796 (8199 ticks)
  MOVED (6/21): occupiedPlaces: 4 -> 3 | prisoners: 4 -> 3 | prisonersCovered: 4 -> 3 |
    roomOccupants: 4 -> 3 | stateIncomeAccruedTodayMinorUnits: 299 -> 598 |
    treasuryMinorUnits: 31615 -> 34975
```

**So the best thing that happened in this record — a need going from nothing
to nearly full because the player built the right room — moved exactly one
published count, by one, at the moment of designation, and nothing at all
afterwards.**

### 6.4 The yard is the best room in the game, it is free, and it is the hardest to place

**MEASURED, act 3, phase 3.** After a six-press `ArrowRight` pan moved the
world origin from `(−304, −574)` to `(−665, −574)`, the yard went in at world
tiles **(18,10)–(25,17)** — 64 tiles of bare ground, no walls, no objects, no
money:

```
[yard] 53 candidate rectangle(s) miss every room and fit the map
[act3] the yard rectangle chosen: {"x0":18,"y0":10,"x1":25,"y1":17}
[act3] designate room.yard attempt 1: rooms=4 (was 3) | panel said
  ["NEEDS AT LEAST 8 × 8 TILES","MUST BE OUTDOORS","NO OBJECTS NEEDED","ENCLOSURE"]
[act3] the yard was accepted on attempt 1
```

**This is the second `room.yard` ever placed in a Lockstate playtest** — act 2
placed the first and act 4 placed a third, all in this session, and all three
went in on the first attempt, at the same rectangle (18,10)–(25,17) after the
same six-press pan. Everything that made the three prior attempts fail was the
instrument's: the fix was to reject a candidate rectangle that *overlaps a
room this run built* as well as one the HUD covers, because a room's tiles are
canvas and `document.elementFromPoint` calls them clear.

`recreation` had been pinned at **0%** on every prisoner for six in-game days.
One day after the yard opened, all three remaining prisoners were `Yard Time`
or `Heading to Yard Time` and `recreation` was no longer the worst need on any
row. Two days after:

> `Wanda Tamm | Minimal | Hunger **60%** | Sleep **95%** | Hygiene **91%** |
> Bladder **66%** | Safety **100%** | Recreation **93%**`

**Every one of the six needs above 60%, in a prison of four rooms, with one
guard.** That is the healthiest prisoner in this repository's play record.

### 6.5 The comparison the brief asked for

One prison, four states, same four prisoners, same guard, same instrument:

| the prison | worst need on the roster | risk tiers | incidents | what the screen said was different |
| --- | --- | --- | --- | --- |
| **act 2**: four rooms, **no beds** | every need `0%` for 18 days | all four `High` | **2 assaults, 8 riots** | `4 with no bed`, `4 HIGH RISK`, riot alerts graded `Critical` |
| **act 3 phase 0**: one cell | `Hygiene 29–33%`, falling | `Medium`/`Minimal` | none | — |
| **act 3 phase 1**: + canteen | `Hygiene 0%` | `Medium`/`Minimal` | none | `ROOMS 1 → 2` |
| **act 3 phase 2**: + shower | `Recreation 0%` | `Medium`/`Minimal` | none | `ROOMS 2 → 3` |
| **act 3 phase 3**: + yard | **`Bladder 60–66%`**, and every need ≥ 60% | **all `Minimal`** | none | `ROOMS 3 → 4` |

**So the answer to "does more rooms make the prison better" is yes, clearly,
and it is measurable in two places.** The worst need in the population goes
from `0%` to `60%+`; and every prisoner's risk tier settles at `Minimal`,
which is on the roster and feeds the strip's `HIGH RISK` badge.

**And the answer to "does the player learn that it worked" is: only if they
open the Regime tab and read one column.** Building each of the three
buildable rooms moved exactly one of the twenty-one published counts —
`rooms`, by one, at the moment of designation. No event fired. No alert. No
sentence anywhere named a room, a need, or a change. The `EARNED TODAY` and
`FUNDS` figures moved identically in the neglected prison and the healthy one,
because **`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0`** — the
owner's ruling of 2026-09-03, *"usuń na razie kary"*, recorded in
`docs/adr/0064-what-an-unmet-need-costs-a-prison.md`'s amendment. So the one
channel that was designed to price neglect is switched off on purpose, and
with it off **the money says nothing about rooms at all.** That is not a
defect; it is a consequence of a decision the owner took deliberately and
described as *"na razie"*, and it is worth them knowing that with the
penalties at zero, *the only feedback a four-room prison gets is a need
percentage on a tab a newcomer opens last.*

## 7. What a player is told about a room they built: the census

**MEASURED, act 3.** The Rooms tab, dumped with a working cell and a working
canteen standing — four prisoners housed in one and two dining tables in the
other — is, in full and in order: the eighteen-row *type* catalogue with
`Selected` on whichever row was last clicked, the coordinate entry, `Draw on
map`, `Remove rooms`, the drag hint, and the selected **type's** requirement
rules. **There is no list of the rooms the prison has.** The only figure on
any screen that is about the prison's actual rooms is the status strip's
`2 ROOMS`.

**VERIFIED, read, and this is the part that makes it a defect rather than a
gap in a pre-alpha.** The projection layer already computes, per room
instance, its catalog id, its category, its coordinate, its occupancy, its
free places, its utilization and every requirement's status
(`RoomListViewModel` / `RoomDetailViewModel`,
`src/simulation/presentation/room-projection.ts:236-258`), and the UI already
subscribes to that channel — `src/ui/simulation-room-needs.ts` is the reader.
**It renders one field of it.** `unfinishedRoomIds` filters to rooms with
`requirementSummary.missingCapability > 0` and the panel draws at most
**one** of them, deliberately and with a documented reason:
`export const ROOM_NEEDS_ROOMS_LIMIT = 1;`
(`src/ui/hud/rooms-panel.ts:406`, whose docblock argues for naming one room
*completely* rather than several partially, and calls the constant a request
budget). That block is real and it works — act 2's four-room prison showed

> `NOT READY` / `3 of 4` / `Shower Room at 18, 18 is missing` / `2 × Shower Head`

— so a player is told, well, about the *worst* thing wrong with one room.
**A room that is finished and working produces no line anywhere.**

**And nothing at all reports use.** There is no published count of how many
prisoners are in a canteen, a shower room or a yard. The two room counts the
worker publishes are both about *housing*: `roomOccupants` is residency
assignments and `occupiedPlaces` is residency places that still exist
(`src/simulation/protocol/types.ts:807` and `:873`, both opened). The
concurrent-use ceiling the rooms actually gate on lives in
`RoomInstanceRegistry.concurrentUseCapacityByCapability`, and
`room-projection.ts:214` says of it, in its own words:

> The concurrent-use figure is **not projected at all yet**, and that is a
> gap rather than a decision.

**So the only channel in the whole game through which a player can learn that
a room is being used is the verb on a Regime roster row** — `Showering`,
`Eating`, `Yard Time`, `Heading to …`, from
`src/content/simulation-message-keys.ts:164-176`. One tab, one column, four
words.

## 8. A whole day in the four-room prison, sampled across it — act 4

**An instrument defect in acts 2 and 3, and the repair.** Both acts read the
roster at *day boundaries*, and a day boundary lands inside
`GENERAL_POPULATION_REGIME`'s `[0, 400)` sleep block
(`src/simulation/prisoners/regime.ts:107`, VERIFIED, read). So both acts
sampled the same ninety seconds of every prisoner's day and **could not have
seen a meal, a shower or a yard session however well the rooms worked** — the
`Eating` and `Yard Time` sightings in §6 are two lucky overshoots. Act 4 builds
the same four rooms in one pass, settles for two in-game days, and then samples
the whole roster across one complete 2,400-tick day.

**MEASURED, act 4.** The prison after two settling days, built in one pass
rather than in phases — an independent replication of §6.4's end state on a
different seed:

> `Petra Engel | Low | Hunger **89%** | Sleep **84%** | Hygiene **82%** |
> Bladder **99%** | Safety **100%** | Recreation **96%**`

and the day, eleven samples, four prisoners each, with the block each sample
falls in:

| tick-of-day | regime block | what the four were doing |
| --- | --- | --- |
| 153, 379 | `sleep` | `Sleeping` ×4 |
| 604, 849 | `work / education / association` | **`Association` ×4** |
| 1054 | `recreation` | `Heading to Yard Time` ×2, `Yard Time` ×2 |
| 1279 | `meal` | **`Eating` ×4** |
| 1505, 1730 | `work / education / association` | **`Association` ×4** |
| 1974 | `recreation + hygiene` | `Yard Time` ×2, `Showering` ×2 |
| 2103 | `recreation + association + hygiene` | `Heading to Using Toilet` ×2, `Heading to Showering` ×2 |
| 2349 | `sleep` | `Yard Time` ×2, `Sleeping` ×2 |

```
[act4] verbs seen across one whole day, with how many prisoner-samples each:
  [["Association",16],["Sleeping",10],["Yard Time",8],["Showering",4],["Eating",4],["Using Toilet",2]]
```

**Three things this settles.**

1. **Every one of the four rooms is genuinely used, on schedule.** `Eating`
   fills the meal block, `Yard Time` the recreation blocks, `Showering` the
   hygiene ones. **`Eating in Cell` does not appear once** — so all four
   `Eating` samples are `action.eat-meal` in the canteen, not the cell-side
   sibling, and the two have distinct words
   (`src/content/simulation-message-keys.ts:165-166`). The canteen *wins* the
   meal block whenever it exists; §6.2's point is that winning it changes
   nothing, not that it does not win it.
2. **The biggest hole in a prisoner's day is the work block, and it is 1,000
   ticks wide.** `[500, 1000)` and `[1300, 1800)` are 42% of the day, and all
   four samples inside them are `Association` — `action.free-association`,
   which declares `needEffectsPerTick: {}` and *"fulfils no need"*
   (`src/simulation/prisoners/actions.ts:220-228`, VERIFIED, read). **36% of
   all prisoner-samples across the whole day are a prisoner doing something
   that is authored to do nothing.** The three rooms that would fill it —
   `room.kitchen`, `room.laundry`, `room.classroom` — all have live actions
   (§3) and none was built here. **That is the concrete shape of what issue
   #592 is for**, and it is a stronger argument for it than "a work window
   should be a real pie": the window exists, it is 42% of the day, and it is
   empty.
3. **Nothing about any of that reaches the player except through this one
   column.** Over the 8,603 ticks from admission to the end of the scanned
   day, in the healthiest prison in this record:

   ```
   [act4] DELTA admission -> end of the scanned day
     MOVED (2/21): stateIncomeAccruedTodayMinorUnits: 635 -> 137 | treasuryMinorUnits: 17875 -> 22355
   [act4] events over the whole act: []
   ```

   **Two counts, both the clock's own, and not one simulation event.**

## 8.1 A four-room prison's Overview screen is 83% word-for-word identical to a one-cell prison's

The brief asks this record to test, from the other side, the claim that a
prison with everything going wrong is *"62% word-for-word identical to an empty
one"*. That record is not on `main` at v0.0.471 (`9429ba64`) — see the
corrections above — so
its figure is not verified here — but the same measurement runs in this
direction and this is it.

**MEASURED, act 3.** The Overview tab of the one-cell prison at the end of
phase 0, and the Overview tab of the four-room prison at the end of phase 3,
both dumped from `.hud` `innerText` (UPPER BOUND), diffed as a longest common
subsequence:

```
one-cell lines: 60   four-room lines: 64
identical lines in the LCS: 52 of 64 = 81.2 %
identical WORDS in the LCS: 139 of 167 = 83.2 %
```

Every difference, in full:

| line | one cell | four rooms | is it about the rooms? |
| --- | --- | --- | --- |
| `PRISONERS` | `4` | `3` | no — a sentence ended |
| `COVERAGE` | `4` | `3` | no — the same discharge |
| **`ROOMS`** | **`1`** | **`4`** | **yes** |
| `FUNDS` | `21,535` | `39,895` | no — 18 in-game days of grant |
| `EARNED TODAY` | `952` | `463` | no — a different point in the day |
| `DAY` / progress | `7` / `79%` | `25` / `51%` | no — the clock |
| alerts | — | `1 released — their sentences are served. Day 19` | no — the discharge |
| save generation | `gen-mtnkfy5v-6` | `gen-mtnkrgtl-d` | no |

**One badge, of eight, differs because of the rooms, and it differs by
counting them.** The prison whose prisoners are all showered, fed, exercised
and at `Minimal` risk shows the player a screen 83% identical to the one where
hygiene was at 29% and falling — and the 17% that differs is the calendar, the
bank and a discharge.

**JUDGEMENT.** This is what makes §7's missing readouts matter rather than
being a wish-list. A player who spends **3,840** on a canteen and a shower room
gets, for their money, the digit `1` changing to `3` on a badge labelled
`ROOMS`. Everything that actually changed — and a great deal did change — is
on the Regime tab, one column wide, and has to be looked for.


## 9. The enclosure verdict said `Open on at least one side` at three designations out of three, and every one of them was sealed

**MEASURED, act 3.** `designate` reads `.hud-rooms` **after** the drag and
**before** pressing Confirm — the exact instant a player decides whether to
commit. For all three enclosed rooms, the panel said the rectangle was open,
and all three were then accepted on the first press:

```
designate room.cell attempt 1: rooms=1 (was 0) | panel said ["OPEN ON AT LEAST ONE SIDE","NEEDS AT LEAST 2 × 3 TILES","MUST BE ENCLOSED", …]
designate room.canteen attempt 1: rooms=2 (was 1) | panel said ["OPEN ON AT LEAST ONE SIDE", …]
designate room.shower-room attempt 1: rooms=3 (was 2) | panel said ["OPEN ON AT LEAST ONE SIDE", …]
```

**This is a known, documented and deliberately accepted false negative, and
the finding here is its frequency rather than its existence.**
`src/ui/hud/rooms-panel.ts` says so at length beside `confirmButton.setDisabled`
(VERIFIED, read): `pendingEnclosure` is `classifyArea`'s answer against
`WorldRenderView`, refreshed on the render-snapshot feed's own cadence — *"up
to a 30-second poll interval while the clock runs, and **not refreshed at all
while it is paused**"* — so a prison that *"built its walls, ran the clock long
enough for `data-queued` to empty, and paused again before the next periodic
poll happened to land"* reports `'open'` for a rectangle the simulation has
already sealed. The panel therefore refuses to *disable* Confirm on it, and
warns only, on the reasoning that *"a warning that turns out to be stale costs
nothing but confusion"*.

**What this run adds is the rate.** The sequence the comment calls *"an
ordinary sequence, not a contrived one"* is the sequence the game forces on a
player: §4 established that objects cannot be placed until the room is zoned,
so wall → wait for the queue → designate is the only order there is. Played
that way three times in one session, the warning was wrong **three times out of
three**. So the accepted cost is not "occasional confusion for one press": in
the normal build loop, **the enclosure readout is a false alarm by default**,
and a player who believes it goes looking for a hole in a wall that has none.

**No fix is proposed here** — the asymmetry the comment describes is real and
the choice not to disable Confirm is right. What is worth reconsidering, with
this number, is whether the *note* should say `Not checked since the walls
finished` rather than `Open on at least one side` when the client's world view
is older than the last completed build order. That is a decision, not a
wording tweak, and it belongs in the ADR the comment already points at.

---

# Improvement proposals

Each is grounded in a measurement above, sketched concretely, and — where it
proposes a string — comes with the code that would make the string true, per
`AGENTS.md` reservation 4's release ("verify, then write"). **None of them is
landed: this branch is read-only on `src/`.**

## P1. A room type's row should say what the room is *for*, and the seven dead ones should say they are not for anything yet

**What a player sees today** (MEASURED, §1): selecting `Canteen` repaints
`NEEDS AT LEAST 6 × 6 TILES · MUST BE ENCLOSED · NEEDS 2 × DINING TABLE ·
NEEDS 4 × BENCH`. Selecting `Reception` repaints `NEEDS AT LEAST 4 × 4 TILES ·
MUST BE ENCLOSED · NEEDS 1 × DESK · NEEDS 2 × CHAIR`. **The two rows are the
same shape and one of them is a purchase of nothing** (§3).

**What they would see instead:** one more eyebrow line in
`.hud-rooms__rule-block`, below the object lines, in the same series:

- Canteen → `SERVES HUNGER`
- Shower Room → `SERVES HYGIENE`
- Yard, Common Room → `SERVES RECREATION`
- Classroom → `SERVES RECREATION` (its action's only effect is
  `recreation: 1`)
- Kitchen → `SERVES HUNGER`; Laundry → `SERVES HYGIENE`
- Cell, Solitary Cell → `HOUSES PRISONERS`
- Delivery Bay, Storage Room → `HANDLES DELIVERIES`
- Holding Cell, Reception, Infirmary, Security Office, Staff Room, Garbage
  Room, Utility Room → **`NOTHING USES THIS ROOM YET`**

**Why each of those is true, with the code that would render it.** The verb
and the need are not invented: `DEFAULT_ACTIONS`
(`src/simulation/prisoners/actions.ts`) authors, per action, a
`target: { kind: 'room-catalog-id', roomCatalogId }` and a
`needEffectsPerTick`, so `room.canteen → hunger` is
`action.eat-meal`'s own two fields at `:120-122`, `room.shower-room → hygiene`
is `action.shower`'s at `:132-134`, and `room.yard → recreation` is
`action.yard-recreation`'s at `:165-167`. The housing pair is
`IntakeSystem`'s two `AccommodationTarget` constants
(`src/simulation/prisoners/intake-system.ts:70-71`); the delivery pair is
`DELIVERY_BAY_ROOM_CATALOG_ID` / `STORAGE_ROOM_ROOM_CATALOG_ID`
(`src/simulation/operations/delivery-route.ts:21-22`).

**Where it would be computed.** `roomCatalogue()` in `src/main.ts:963` — the
composition root that already builds `HudRoomViewModel` and already carries
exactly this kind of type-level fact. Its own docblock for the requirement
list says the reason: *"so the cost of a canteen is readable **before** the
drag rather than only after it (#529)"*. What a room is *for* is the other
half of the same sentence.

**The wording follows the panel's existing conventions**, which is the point
of proposing strings at all here: `'hud.rooms.requires-object': 'Needs {count}
× {object}'` and `'hud.rooms.requires-none': 'No objects needed'`
(`src/content/default-locale-en.ts`), whose comment says the absence is
*"said out loud … once every other room type lists its objects, silence reads
as a panel that failed rather than as a room that needs nothing."* **The same
argument, one line down, is the whole of this proposal.** So:
`'hud.rooms.serves': 'Serves {need}'`, `'hud.rooms.houses': 'Houses
prisoners'`, `'hud.rooms.serves-none': 'Nothing uses this room yet'`.

**The one thing that must not be hand-maintained.** `NOTHING USES THIS ROOM
YET` is a sentence asserting an absence, which `docs/AGENT_WORKFLOW.md` §4
names as the kind that rots first — the day somebody gives the infirmary a
reader, a hand-written list still says it is dead. So the list is **derived**
(from `DEFAULT_ACTIONS` and the two constant pairs above) and pinned by a
foundation test in the shape of
`tests/foundation/content-vocabulary-contract.test.ts`, which already
enumerates capabilities-with-no-consumer and would fail on a new reader.

**What it costs a player if it is wrong:** nothing — it is a label. **What it
costs today:** up to 1,540 and a wall run, for a Reception that does nothing,
with no way at all to find that out short of reading `src/`.

## P2. The Rooms tab should list the rooms the prison has

**What a player sees today** (MEASURED, §7): a prison with a working cell and
a working canteen shows the eighteen-row *type* catalogue and nothing else.
The only figure anywhere about the rooms that exist is the strip's `2 ROOMS`.

**What they would see instead:** a `YOUR ROOMS` block above the catalogue, one
row per instance: the type's name, the coordinate the not-ready block already
uses (`Shower Room at 18, 18`), and a status word. Rows sorted the way
`projectRoomList` already sorts them.

**Why it is nearly free.** `RoomListViewModel` already carries, per instance,
`roomCatalogId`, `roomNameKey`, `category`, the anchor, `occupancy`
(`current` / `capacity` / `free` / `utilization`) and
`requirementSummary` — `src/simulation/presentation/room-projection.ts:236-258`,
opened — and `src/ui/simulation-room-needs.ts` is already a subscriber on that
channel. **This is the defect class the brief calls the one this repository
keeps paying for: shipped, keyed, tested and rendered by nothing.**

**What it must not do:** raise `ROOM_NEEDS_ROOMS_LIMIT`.
`src/ui/hud/rooms-panel.ts:406`'s docblock argues, correctly, that naming
*one* room completely beats one line each from several, and that the constant
is also a per-tick request budget. A list of rooms is a different block with a
different job and its own request; the not-ready block should stay exactly as
it is.

## P3. Say what a room costs before the drag, since the game already knows

**What a player sees today** (MEASURED, §1.1): twenty-one Build rows that are
each a bare name, and one price — `Buy 120 × Brick · 4,800` — behind a fold,
quoted per unit of raw material. Nothing says a wall segment is two bricks or
a dining table three planks. **DERIVED §2:** a canteen is 2,830 and a yard is
0, and a player cannot know either without arithmetic over source.

**Two concrete places, in increasing cost:**

1. **A Build row gains its bill:** `Dining Table · 3 × Wood Plank`. Everything
   needed is in `BUILDABLE_REGISTRY`'s `materialsRequired`
   (`src/simulation/construction/definition.ts`) and the row is built at
   `src/ui/hud/build-panel.ts:985-987`, which today passes only `labelKey`.
2. **The Rooms panel's area line gains an estimate** once a rectangle is
   drawn: beside `hud.rooms.area-value` (`'{width} × {height} tiles at {x},
   {y}'`), a second line — `About 2,830 to build: 24 wall segments, 2 ×
   Dining Table, 4 × Bench`. Every term is available where the panel already
   stands: the perimeter is arithmetic on the drag, the objects are the
   `requirements` the same block already renders, and the prices are
   `DEFAULT_PROCUREMENT_CATALOG` (`src/content/procurement-catalog.ts:100-101`).
   **"About" is load-bearing and honest**: a player may draw a bigger
   rectangle, reuse a shared wall, or place more objects than the minimum, so
   an exact figure would be a promise the code cannot keep.

## P4. The one number that would answer "did building it work"

**What a player sees today** (MEASURED, §7 and §6): building a room moves
exactly one published count, `rooms`, by one. Everything else about whether the
room is doing anything lives in a verb on one column of one tab.

**What they would see instead:** on the strip, beside `ROOMS`, a badge naming
the **worst need across the population** — `HYGIENE 29%` — falling and rising
as rooms come and go. It is the same reading the Regime roster already makes
per prisoner: `PrisonerRosterRowViewModel.lowestNeed`, rendered at
`src/ui/hud/regime-panel.ts:1360-1362`. Taken over the population it is the
single number that moves when a room starts working and does not move when it
does not — which is exactly the question this record was commissioned to ask.

**Why this rather than a use counter.** A use counter (`IN USE 2 OF 2` on a
room row) is the more informative readout and it is the one
`room-projection.ts:214` names as an owed gap — but it needs the
concurrent-use figure projected, which is new projection surface. The
worst-need badge needs no new simulation state at all.

**Where the threshold problem sits, and it is not ours.** ADR 0054 decision 1,
as amended 2026-08-29, says the player-facing "what is bad" threshold is
*"still unmade and still the owner's"*. So this badge should show the level
and the need's name and **must not** colour it as good or bad until that
ruling exists; the existing bar's toning off `STATE_INCOME_UNMET_NEED_LEVEL`
is the precedent to follow, not to extend.

## P6. The work block is 42% of a prisoner's day and nothing fills it — the case for #592, measured

**MEASURED, §8.** In a four-room prison with every need above 82%, `Association`
is 16 of 44 prisoner-samples across a whole day, and every sample inside the two
`work / education / association` blocks is `Association`.
**VERIFIED, read:** `action.free-association` declares
`needEffectsPerTick: {}` and its own comment says *"It fulfils no need"*
(`src/simulation/prisoners/actions.ts:220-228`).

**This is not a proposal for new mechanics — it is the measurement issue #592
was missing.** #592 argues that kitchen labour and laundry make the work window
*"a real pie rather than a second income slider"*. What this record adds is the
size of the pie: `[500, 1000)` and `[1300, 1800)` are **1,000 ticks, 42% of
every prisoner's day**, and in the best prison anybody has built here they are
spent entirely on an action authored to change nothing. Three room types with
live actions already exist to fill it — `room.kitchen`
(`action.kitchen-work`), `room.laundry` (`action.laundry-work`) and
`room.classroom` (`action.classroom-education`) — and **none of them has ever
been built in a playtest in this repository.** The cheapest, a 3 × 3 laundry, is
**1,120** (§2).

**So the smallest useful next playtest is not a new feature at all: build the
kitchen, the laundry and the classroom, and find out whether the work block
fills.** That is a one-act question and this pass did not reach it.

## P5. A question for the owner, not a proposal: the yard does not fit

**MEASURED, §2 and §5.** `room.yard` needs 64 contiguous tiles; the clear
canvas at 1440 × 900 is 144; a starter cell, a canteen and a shower room leave
no 8 × 8 inside it, so **every yard in this repository's history has needed the
camera moved first**, and the three that were never built failed on exactly
that. The yard is simultaneously the cheapest room in the game (0) and the
hardest to place.

Three ways out, each with a real cost, none of them this branch's to take:
lower the minimum to 6 × 6 (a content/balance change, `room.yard`'s
`minimum-size` requirement); start the camera further out or centred on more
ground (a rendering default); or leave it and treat "you will have to move the
camera" as the intended first lesson about space. **The measurement is the
contribution; the choice is a balance decision.**

---

# What this pass did not reach

- **Scale.** Every measurement here is four prisoners and one guard. Contention
  for a room — ADR 0062's whole subject — never bit: two shower heads for four
  prisoners, six dining places for four, an 8 × 8 yard whose open-area capacity
  is `floor(64 / 16) = 4` (`TILES_PER_OPEN_GROUND_PLACE = 16`,
  `src/simulation/prisoners/room-instance-registry.ts:222`, and the open-area
  gate at `:337`, both opened). **Nothing in this record tests what happens when
  more prisoners want a room than it seats**, and §6.2's "the canteen is a
  no-op" is a claim about four prisoners and may be false at twelve.
- **Eleven of the eighteen room types were never built.** The kitchen, laundry,
  common room and classroom all have live readers (§3) and none of them was
  played; nor was any of the seven dead ones, so this record's statement that
  they do nothing is VERIFIED-from-code and not MEASURED-from-play.
- **The `work` block's three rooms.** `room.kitchen`, `room.laundry` and
  `room.classroom` all have live actions and none was built. §8 measures how
  big the hole they would fill is — 42% of the day — and P6 says why that is
  the next playtest, but this pass did not run it.
- **`room.solitary-cell` and the sanction path.** Alive, unplayed.
- **The camera.** Every act ran at 1440 × 900 at zoom 1. The yard's fit problem
  (§P5) may be entirely dissolved by `camera.zoom.out`; measuring that needs a
  calibration this harness does not have, because `calibrate` bisects on a
  64-pixel tile.
- **Save and reload.** Nothing here checks that a four-room prison comes back.
  `docs/research/2026-09-04-does-a-prison-come-back.md` covers a one-room one.
- **The other tester's surface** — replaying the fixes since v0.0.451 — was not
  entered. One thing was tripped over and is left as a line: in act 3 the
  refusal band still carried `Nothing was removed — there is no object on that
  tile, and none being built there.` from `calibrate`'s probe, minutes and
  several successful commands later, so a stale band outlives the action that
  produced it.

# The weakest claim in this record, and what would change my mind

**"The canteen is a no-op."** (§6.2.) It is the strongest-sounding sentence
here and it rests on the narrowest evidence: one prison, four prisoners, three
in-game days after the canteen opened, with hunger measured at day boundaries.
Three things could refute it and none was tested:

1. **Population.** Hunger decays 0.05 a tick per prisoner and the three meal
   blocks are 300 ticks a day. With twelve prisoners contending for six dining
   places — or for one cell's worth of `eat-in-cell` time inside the same
   blocks — the cell route may stop covering everybody, and then the canteen's
   4-a-tick against 3 would matter. **A twelve-prisoner run with and without a
   canteen, hunger sampled inside the meal blocks, would settle it.**
2. **Sampling — half repaired.** Acts 2 and 3 read the roster at day
   boundaries, which fall in the `[0, 400)` sleep block, so what those acts saw
   of the canteen is two incidental overshoots. Act 4 repairs *whether the
   canteen is used* (§8: it wins the meal block outright, four samples of four
   prisoners, with `Eating in Cell` never once appearing). It does **not**
   repair the counterfactual: I never ran the same day-scan on a prison with
   *no* canteen, so "hunger would have been just as high without it" is still
   an inference from §6.1's 97% rather than a paired measurement.
3. **#592.** If kitchen labour ever makes a meal consume a portion, a canteen
   with no portions becomes a way to *fail* hunger and the whole reading
   changes.

**The second-weakest is the cost table in §2.** Every figure is DERIVED from
two catalogues and one rule I read rather than from a purchase I made: I bought
raw material by the unit and never watched a room's total leave the treasury.
A run that buys nothing up front and reads `FUNDS` before and after one
complete room would confirm or refute it in one act, and I did not do it.
