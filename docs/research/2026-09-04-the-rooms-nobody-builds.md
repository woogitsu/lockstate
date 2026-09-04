# The rooms nobody builds — does serving a need do anything a player can see?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.471** (`9429ba64`), in worktree
`/workspace/wt-the-rooms` on branch `agent/playtest-the-rooms-nobody-builds`.
Nothing under `src/` differs from that commit; the running page says so from
the inside — every screen dump below carries `v0.0.471` beside the short sha
of one of this branch's instrument-only commits (`eaaafae`, `b400341`,
`3cb3145`), each of which touches only `tests/` and `docs/`.

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
| 3 | the same four rooms in the order the game allows: wall, door, designate, furnish, one room per phase with three in-game days after each | *(see §)* |

## Claim tiers

- **MEASURED** — produced by one of the runs above and quoted from its output.
- **VERIFIED, read** — a file was opened at the line cited, in the played
  worktree at v0.0.471.
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

**1. The two records the brief calls "just landed" are not on `main` at
v0.0.471.** `git ls-tree -r origin/main --name-only docs/research/` at
`9429ba64` returns neither `2026-09-04-the-standing-crowd.md` nor
`2026-09-04-the-hud-a-player-reads.md` (MEASURED). Their claims are therefore
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
brief asks that the figure be verified rather than quoted. **At v0.0.471 it is
seven**, and the two that came alive did so through
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

*(written from act 3's run; each phase is: wall, door, designate, furnish,
then three in-game days at 4×, with the Regime roster and the inspector read
at each day boundary.)*

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
