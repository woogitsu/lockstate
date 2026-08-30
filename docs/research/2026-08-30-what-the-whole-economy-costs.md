# What the whole economy costs, end to end

**Date:** 2026-08-30. **Branch:** `agent/641-economy-costing`, cut from
`origin/main` at `4f0b508` (v0.0.238).
**Question:** [#641](https://github.com/matmaxalez/lockstate/issues/641), under
the owner's ruling of 2026-08-30 — *"trzeba zrobić research, policzyć koszt
wszystkiego, zmniejszyć ceny lub dać większy skarbiec startowy i finansowanie
każdego więźnia, żeby to było grywalne"*: price everything, then choose between
lower prices, a bigger starting treasury, and per-prisoner funding.

**This record changes no balance value.** Choosing the lever is the owner's.

## How every number here was obtained

Two tiers, and they are kept apart on purpose.

- **DERIVED** — computed from the shipped catalogues by importing them, never
  transcribed. `src/content/procurement-catalog.ts`,
  `src/simulation/construction/definition.ts`, `src/content/room-catalog.ts`,
  `src/content/object-catalog.ts`, `src/content/staff-role-catalog.ts`.
- **MEASURED** — run through the real `Kernel`, the real `packCommand`
  decoder and the real session command router, by building prisons with
  `createNewSimulationRuntime` and stepping them past in-game day boundaries.
  Every prison below is built the long way: materials purchased, one
  `PlaceBuildOrder` per perimeter segment, `ZoneRoom`, `PlaceObject`,
  `HireStaff`, `AdmitPrisoner`. Nothing is stubbed and no fixture helper writes
  an edge that a completed order would have written.

Anything neither derived nor measured is marked in place.

**What is not here:** the browser playtest of an ordinary session. §6 says what
was measured instead and why, and names it as the gap.

## 1. The complete price list

### 1.1 The two prices everything else is made of — DERIVED

`src/content/procurement-catalog.ts:100-101`

| material | unit price |
| --- | --- |
| `item.brick` | **40** |
| `item.wood-plank` | **65** |

Nothing else is purchasable. `PROCUREMENT_DELIVERY_DELAY_TICKS` is 100 ticks
(5 s at ×1) and is shared by both.

### 1.2 Every buildable — one-off, DERIVED

All 21 rows of `BUILDABLE_REGISTRY`, priced by multiplying each row's
`materialsRequired` through the table above. `work` is in work units; the
construction crew advances **one work unit per tick** and runs **one order at
a time** (`src/simulation/construction/system.ts:209,741-751`), so `work` is
also the order's duration in ticks once its materials are in the container.

| buildable | cost | materials | work | places |
| --- | --- | --- | --- | --- |
| `fridge-brick` | **40** | 1 brick | 30 | `object.fridge` |
| `shower-head-brick` | **40** | 1 brick | 30 | `object.shower-head` |
| `toilet-brick` | **40** | 1 brick | 30 | `object.toilet` |
| `utility-panel-brick` | **40** | 1 brick | 30 | `object.utility-panel` |
| `waste-bin-brick` | **40** | 1 brick | 30 | `object.waste-bin` |
| `bed-wooden` | **65** | 1 plank | 30 | `object.bed` |
| `chair-wooden` | **65** | 1 plank | 30 | `object.chair` |
| `door-wooden` | **65** | 1 plank | 30 | a door on a tile edge |
| `medical-bed-wooden` | **65** | 1 plank | 30 | `object.medical-bed` |
| `medicine-cabinet-wooden` | **65** | 1 plank | 30 | `object.medicine-cabinet` |
| `storage-rack-wooden` | **65** | 1 plank | 30 | `object.storage-rack` |
| `prep-counter-brick` | **80** | 2 bricks | 60 | `object.prep-counter` |
| `security-console-brick` | **80** | 2 bricks | 60 | `object.security-console` |
| `stove-brick` | **80** | 2 bricks | 60 | `object.stove` |
| `wall-brick` | **80** | 2 bricks | 50 | — (opaque tile edge) |
| `washing-machine-brick` | **80** | 2 bricks | 60 | `object.washing-machine` |
| `bench-wooden` | **130** | 2 planks | 60 | `object.bench` |
| `bookshelf-wooden` | **130** | 2 planks | 60 | `object.bookshelf` |
| `desk-wooden` | **130** | 2 planks | 60 | `object.desk` |
| `dining-table-wooden` | **195** | 3 planks | 90 | `object.dining-table` |
| `loading-dock-door-wooden` | **195** | 3 planks | 90 | `object.loading-dock-door` |

**A door is cheaper than a wall — 65 against 80 — and both seal a perimeter.**
`roomPerimeterEnclosure` (`src/simulation/rooms/enclosure.ts`) asks only whether
every perimeter edge holds edge geometry, and a completed `door-wooden` order
writes `DOOR_EDGE_NUMERIC_ID` into the same layer a wall writes into. So the
cheapest legal enclosure of any rectangle is **made entirely of doors**, and it
is 19% cheaper than the same rectangle in walls. MEASURED in §3: a `room.cell`
walled in nine walls and one door costs 890; the same cell walled in ten doors
costs **755**, zones without a refusal, and houses a prisoner identically. This
is a price-list inversion, not an exploit in the code — it falls out of the two
material prices, and it is the first thing a price change should look at.

### 1.3 Every room type, at its authored minimum — DERIVED

Shell = `2 × (width + height) − 1` wall segments plus one door, for a definition
carrying an `enclosed` requirement; nothing at all for `room.yard`, whose
requirement is `outdoors` and which authors no object.

| room | minimum | shell | required objects | **total** |
| --- | --- | --- | --- | --- |
| `room.yard` | 8×8, outdoors | — | none | **0** |
| `room.utility-room` | 2×2 | 7 walls + door = 625 | 1 utility panel = 40 | **665** |
| `room.garbage-room` | 2×2 | 625 | 2 waste bins = 80 | **705** |
| `room.solitary-cell` | 2×2 | 625 | bed + toilet = 105 | **730** |
| `room.holding-cell` | 2×2 | 625 | 1 bench = 130 | **755** |
| `room.cell` | 2×3 | 9 walls + door = 785 | bed + toilet = 105 | **890** |
| `room.security-office` | 3×3 | 11 walls + door = 945 | 1 console = 80 | **1,025** |
| `room.shower-room` | 3×3 | 945 | 2 shower heads = 80 | **1,025** |
| `room.storage-room` | 3×3 | 945 | 2 racks = 130 | **1,075** |
| `room.laundry` | 3×3 | 945 | 2 washing machines = 160 | **1,105** |
| `room.staff-room` | 3×3 | 945 | desk + 2 chairs = 260 | **1,205** |
| `room.infirmary` | 4×4 | 15 walls + door = 1,265 | medical bed + cabinet = 130 | **1,395** |
| `room.delivery-bay` | 4×4 | 1,265 | 1 loading dock door = 195 | **1,460** |
| `room.kitchen` | 4×4 | 1,265 | stove + counter + fridge = 200 | **1,465** |
| `room.reception` | 4×4 | 1,265 | desk + 2 chairs = 260 | **1,525** |
| `room.common-room` | 5×5 | 19 walls + door = 1,585 | 2 benches = 260 | **1,845** |
| `room.classroom` | 5×5 | 1,585 | bookshelf + 4 chairs = 390 | **1,975** |
| `room.canteen` | 6×6 | 23 walls + door = 1,905 | 2 tables + 4 benches = 910 | **2,815** |

**One of every room type in the game, at minimum size, is 21,660** — inside the
25,000 opening balance, with 3,340 left over. That single line is the headline
of this record, and §7 is about whether it survives.

The shell is **68% to 94% of every priced room, 86% at the median**. Furniture
is not what a prison costs; perimeter is. `room.canteen` is the most extreme: 1,905 of wall
against 910 of furniture, and its 6×6 minimum is 36 tiles for 6 diners.

### 1.4 Staff — one-off **and** recurring, DERIVED

The distinction #650 is fixing in the HUD, kept separate here because it is the
whole shape of the staff bill. `staffHireCostMinorUnits`
(`src/simulation/staff/hiring.ts:121-126`) delegates to
`staffDailyWageMinorUnits`, so **the hire charge is exactly one day's wage** —
and then `PayrollSystem` (order 130, `{ intervalTicks: 2400, phaseTicks: 2399 }`)
bills the same figure again at **every in-game day boundary**, for ever.

| role | **one-off at hire** | **recurring, per in-game day** | per real minute at ×1 |
| --- | --- | --- | --- |
| `staff-role.kitchen-staff` | 60 | **60** | 30 |
| `staff-role.maintenance-worker` | 70 | **70** | 35 |
| `staff-role.guard` | 80 | **80** | 40 |
| `staff-role.nurse` | 120 | **120** | 60 |
| `staff-role.administrator` | 150 | **150** | 75 |
| `staff-role.security-chief` | 200 | **200** | 100 |
| `staff-role.doctor` | 250 | **250** | 125 |
| `staff-role.warden` | 300 | **300** | 150 |

One of each is **1,230 to hire and 1,230 every day afterwards**. The one-day
lookahead matters: a hire's *lifetime* cost is unbounded, and the number the
game shows on the button is one day of it.

**Everything else in the economy is one-off.** Verified by enumeration rather
than by memory: `Treasury.spend` has exactly three callers in `src/` —
`ProcurementSystem.purchase` (`procurement.ts:166`), `PayrollSystem`
(`payroll.ts:234`) and `StaffHiringService.hire` (`hiring.ts:199`) — and
`Treasury.credit` exactly two: `StateIncomeSystem` (`income.ts:644`) and a
cancelled delivery's refund (`procurement.ts:201`). **Payroll is the only
recurring line in the game, on either side of the ledger except income.**

### 1.5 The income side — DERIVED

| constant | value | where |
| --- | --- | --- |
| opening balance | **25,000** | `treasury.ts:79` |
| paid per occupied place per day | **300** | `income.ts:103` |
| withheld per unmet need per day | **40** | `income.ts:323` |
| a need counts as unmet at or below | **51** of 255 | `income.ts:283` |
| needs in the game | **6** | `needs.ts:11` |
| therefore the floor | **300 − 6 × 40 = 60** | reached, never clamped |
| in-game day | **2,400 ticks = 2 min at ×1, 30 s at ×4** | `regime.ts:12`, `state-machine.ts:216`, `view-model.ts:25` |

An occupied place is a resident holding a unit of residency capacity **that
still exists** (`residentIdsWithExistingPlace`, the invariant #585 added and
#626 pinned), and residency capacity is the summed `footprint.width` of
`'sleep-surface'` objects standing in the room. Both catalogue sleep surfaces
are one wide, so **one bed is one place, and one place is one prisoner paying**.

## 2. What a need actually costs, because it is the whole income model

Income is not 300. It is 300 minus 40 for each of six needs that has fallen to
51 or below, and **three of the six cannot be met in a prison made only of
cells**. This is derived from the decay table
(`src/simulation/prisoners/needs.ts:100-107`) and the action catalogue
(`src/simulation/prisoners/actions.ts`), and confirmed against the measured
grant curves in §4.

| need | decay per tick | met by | needs which room | ticks from full to unmet |
| --- | --- | --- | --- | --- |
| `bladder` | 0.08 | `action.use-toilet` | the cell's own toilet | 2,550 |
| `hunger` | 0.05 | `action.eat-in-cell` | **none** — own accommodation | 4,080 |
| `safety` | 0.05 | guard coverage | a guard posted to the sector | 4,080 |
| `sleep` | 0.03 | `action.sleep` | the cell's own bed | 6,800 |
| `hygiene` | 0.02 | `action.shower` | `room.shower-room` (1,025) | 10,200 |
| `recreation` | 0.015 | `action.yard-recreation` | `room.yard` (**0**) | 13,600 |

Three consequences, and each is a design fact rather than an arithmetic one:

- **A bare cell already meets three of six needs.** `action.eat-in-cell` targets
  `own-accommodation` and requires no object capability at all, so hunger needs
  no kitchen and no canteen.
- **Recreation is free.** `room.yard` authors `outdoors` and no object, so
  `RoomZoningService.zone` accepts an 8×8 rectangle of open ground with no
  walls, no door and no furniture. MEASURED: zoning one cost **0** and raised a
  prison's daily grant by 40 per prisoner.
- **`safety` is the need a guard is for**, and it is the only need whose
  provider is a *recurring* cost. §5 is that trade.

## 3. The minimum viable prison — MEASURED

The smallest thing that admits a prisoner, houses them and earns. Admission is
gated by `IntakeSystem.hasAccommodationTarget`, which needs one instance of
`room.cell` **or** `room.solitary-cell` — no reception, no guard, no door
policy. All four rows below were built through real commands and each ended with
`places = 1` and a rising balance.

| prison | shell | furniture | **total** | break-even |
| --- | --- | --- | --- | --- |
| `room.cell` 2×3, 9 walls + 1 door | 785 | bed 65 + toilet 40 | **890** | **day 4** |
| `room.cell` 2×3, 10 doors | 650 | 105 | **755** | day 3 |
| `room.solitary-cell` 2×2, 7 walls + 1 door | 625 | 105 | **730** | day 3 |
| `room.solitary-cell` 2×2, 8 doors | 520 | 105 | **625** | day 3 |

**The canonical answer is 890** — one `room.cell` at its authored 2×3 minimum,
nine `wall-brick`, one `door-wooden`, one `bed-wooden`, one `toilet-brick`: 19
bricks and 2 planks. That is **3.6% of the opening balance**, and the opening
balance buys **28 of them**.

The cheapest admitting prison in the game is **625**, and it is a solitary cell
whose entire perimeter is doors. It is not a bug; it is §1.2's price inversion
plus the fallback in `DEFAULT_ACCOMMODATION_POLICY`, which lists both housing
types for both classification groups so that a prison holding either can admit
anybody.

**Time, not money, is the other cost.** The crew builds one order at a time at
one work unit per tick, so a cell is 540 work units — 9×50 for the walls, 30
each for door, bed and toilet — plus a 100-tick delivery wait. MEASURED
end to end: **665 ticks per cell** including deliveries and command steps
(8 cells took 5,319 ticks, 2.2 in-game days, 4.4 real minutes at ×1).

## 4. What it earns, and the day it breaks even — MEASURED

Per-in-game-day state grant for one resident, admitted on a day boundary, from
`stateIncomeForCompletedDay` at each payment tick. Four prisons, identical
except for what they can meet.

| prison | build cost | daily grant, days 1…∞ | steady state |
| --- | --- | --- | --- |
| cell only | 890 | 300, 260, 260, 260, 220, **180**, 180, … | **180** (hygiene, safety, recreation unmet) |
| cell + 1 guard | 970 | 300, 300, 300, 300, 260, **220**, 220, … | **220** (hygiene, recreation unmet) |
| cell + guard + yard | 970 | 300, 300, 300, 300, **260**, 260, … | **260** (hygiene unmet) |
| cell + guard + yard + shower | 1,995 | **300** every day, 30 days running | **300** |

**Break-even is day 4 in every configuration measured**, and it is day 4 for a
one-prisoner prison and for an eight-prisoner one:

| prison | spent | first day the balance is back at 25,000 |
| --- | --- | --- |
| 1 cell, 1 prisoner, no staff | 890 | **day 4** (25,230) |
| 8 cells, 8 prisoners, 1 guard, yard, shower | 8,225 | **day 4** (26,055) |

Day 4 is **8 real minutes at ×1** and **2 minutes at ×4**.

**Afterwards it compounds and nothing stops it.** The eight-prisoner prison that
meets every need nets **2,320 a day** — 8 × 300 less one guard's 80 — and was
measured at **44,575** on day 12, from an opening 25,000 with 8,225 spent. The
cells-only eight-prisoner prison, meeting nothing, still nets **1,440 a day**.

**There is no configuration in which a prison with a furnished cell and a
prisoner in it loses money.** The floor of the income line is 60 per place per
day; the only recurring cost is wages; and a prison with no staff has no
recurring cost at all.

## 5. The wage bill against income as staff scale — MEASURED and DERIVED

The guard requirement is not fixed: `resolveOccupancyScaledGuardCount`
(`sector-staffing.ts:190`) raises it to `ceil(prisoners / 8)`, floored at 1
(`default-sector.ts:113`, `sector-staffing.ts:147`). Coverage at or above the
requirement provisions `safety` at the full 0.08 per tick against a decay of
0.05 (`needs.ts:162,175`); below it, at half — 0.04, which is still *under* the
decay, so an understaffed sector loses `safety` slowly rather than holding it.

So a guard buys exactly one thing in the income line: **40 per prisoner per
day**, for **80 per day**.

| prisoners | guards required | wage bill/day | safety income/day | **net of hiring** |
| --- | --- | --- | --- | --- |
| 1 | 1 | 80 | 40 | **−40** |
| 2 | 1 | 80 | 80 | **0** |
| 4 | 1 | 80 | 160 | **+80** |
| 8 | 1 | 80 | 320 | **+240** |
| 16 | 2 | 160 | 640 | **+480** |
| 64 | 8 | 640 | 2,560 | **+1,920** |

MEASURED at the 8/1 row: the same eight-prisoner prison netted 1,440/day with
no guard and **1,680/day with one** — exactly +240.

**Hiring to the requirement is affordable from two prisoners onward and never
stops being affordable**, because the requirement grows at one guard per eight
prisoners while the income it unlocks grows at 40 per prisoner. `40P ≥ 80⌈P/8⌉`
holds for every `P ≥ 2` and the margin widens with `P`. That is the answer to
#641's question 4, and it is the opposite of the shape the question expects.

**Over-hiring is the failure mode, and it is slow.** MEASURED, one cell, one
prisoner:

| guards | wage/day | outcome over 120 in-game days |
| --- | --- | --- |
| 1 | 80 | solvent throughout, 41,230 at day 120 |
| 4 | 320 | solvent throughout, 12,190 at day 120 and falling ~100/day |
| 10 | 800 | balance hits 0 and arrears begin on **day 41**; 45,890 owed by day 120 |

Ten guards for one prisoner is 41 in-game days — **82 real minutes at ×1** —
before anything goes wrong. Nothing in this economy goes wrong quickly.

## 6. Where the money actually runs out

**It runs out in exactly one place, and it is not the running of a prison.** It
is spending the opening balance on geometry that earns nothing, before anything
is zoned. Three routes, all previously measured and re-confirmed here against
the price list:

1. **The drag.** With PR [#640](https://github.com/matmaxalez/lockstate/pull/640)'s
   just-in-time materials a wall segment costs 80 at the press, so
   `floor(25,000 / 80) = 312` segments leave **40** — below the 65 that buys the
   plank that becomes the bed that creates the place that earns. That branch's
   own `construction-just-in-time-materials.test.ts:378-423` asserts the 312 and
   the refusal on 313. The starter prison owns one 32×32 chunk whose bare
   perimeter is 128 segments, so 312 is two or three rooms' worth of wall — an
   ordinary first build, not a reckless one.
2. **The bulk purchase.** On `main` the same state is one press away without
   #640: 625 bricks at 40 is exactly 25,000. `tests/integration/economy-liquidity-hard-lock.test.ts`
   drives every escape and finds none.
3. **The slow one, which presses nothing.** ADR 0075's own table: 616 bricks,
   one guard, and three days of payroll walks the balance to 40 with no further
   input from the player.

**All three are the same state**, and this costing sharpens what that state is:
*cash below 65, no plank in stock, nothing plank-built to reverse.* 65 is the
price of a plank; a plank is the only route to a `sleep-surface`; a
`sleep-surface` is the only route to a place; and a place is the only route to
money. The chain is four links long and every link is single-supplier.

Two figures this record adds to it:

- **The escape is cheap and the trap is not near it.** From a zoned, walled,
  toilet-fitted cell, restoring the income line costs **65**. From nothing at
  all it costs **625**. The player is never trapped for want of a large sum;
  they are trapped for want of a small one, having spent a large one.
- **The trap is 312 walls away and the first thing the game says about money is
  313 walls away.** There is no warning, no reserve, and no preview of what a
  drag will cost.

**What was not done, and it is a real gap.** #641 asks for this measured *by
playing* in a browser. The machine carried two live Playwright runs throughout
this pass (`playtest-just-in-time.playtest.ts` and an `app-shell.spec.ts`
selection, both another agent's), and `docs/AGENT_WORKFLOW.md` is explicit that
a timing-sensitive browser measurement taken under contention is worthless. So
the session-level measurement here is the headless one above — real kernel, real
commands, no renderer — and the browser playtest is handed over. What it would
add that this cannot: how long the *player* takes, how many attempts zoning
needs, and whether the HUD says any of this. The first two are already recorded
in `2026-08-29-playtest-ordering-and-the-second-room.md` and
`2026-08-30-the-naive-route.md`; the third in
`2026-08-30-what-the-game-never-says.md`.

## 7. The sentence-length ruling, costed both ways

The owner ruled on [#593](https://github.com/matmaxalez/lockstate/issues/593) in
the same breath that **sentences must be weeks rather than days**. Today's range
is 2–16 in-game days (`sentence.ts:128-129,146`), which at 2 real minutes a day
is **4 to 32 real minutes**. A plausible weeks-long range — 14–28 days — is 28
to 56 real minutes.

Sentence length changes income because **a new arrival's needs start full**
(`needs.ts:209`, filled to `NEED_MAX`). Every prisoner therefore pays 300 for
their first days and decays toward whatever their prison can actually meet.
Turnover is a subsidy, and a longer sentence spends it.

MEASURED — mean daily grant per resident, averaged over every stay length in
each range, from the day-by-day grant curves in §4:

| prison | 2–16 day sentences | 14–28 day sentences | change |
| --- | --- | --- | --- |
| cell only | **233.5** | **199.9** | **−14.4%** |
| cell + guard | 267.1 | 237.9 | −10.9% |
| cell + guard + yard | 281.8 | 268.0 | −4.9% |
| cell + guard + yard + shower | **300.0** | **300.0** | **0%** |

### What survives the sentence change

- **The price list.** Nothing in §1 depends on sentence length.
- **The minimum viable prison at 890**, and its break-even at **day 4**. A
  prisoner's first four days pay 300, 260, 260, 260 even in the worst prison
  measured, and every sentence in either range is longer than four days.
- **The guard arithmetic in §5, exactly.** Safety is one of the needs a longer
  sentence exposes, so a guard's value per prisoner-day is *un*changed at 40
  while the fraction of days on which it is being collected **rises**. Longer
  sentences make hiring more clearly worth it, not less.
- **The whole of §6.** The hard lock is a property of the opening balance and
  four prices; no sentence length touches it.
- **The conclusion that the economy is not short of money.** The worst case
  measured — a cells-only prison under weeks-long sentences — still pays 199.9
  per place per day against a one-off 890 and no recurring cost.

### What does not survive

- **The claim that a prison earns "about 300 a day per prisoner".** It earns 300
  only while the prisoner is new, or in a prison that meets all six needs. Under
  weeks-long sentences a cells-only prison earns **two thirds of that**, and the
  difference is invisible today because sentences are too short for it to show.
- **Any income projection taken from the current range.** A 14% cut is the
  measured worst case and it applies exactly where a new player lives — the
  prison that is only cells.
- **The idea that the two rulings are separable.** They are not, and the
  direction is one-way: **the sentence change makes need provision the thing the
  economy is about.** Today a player can ignore hygiene and recreation and lose
  little, because nobody stays long enough. At 14–28 days the shower room
  (1,025) and the yard (0) stop being decoration and become the difference
  between 200 and 300 per place per day. That is a *better* game, and it is an
  argument for making the sentence change **before** touching any price.

## 8. What the numbers say about the three levers

The ruling names three: lower prices, a bigger starting treasury,
per-prisoner funding. The measurements support **none of them as stated**, and
the reason is the same for all three.

**The economy is not short of money.** 25,000 buys one of every room type in
the game (21,660), or 28 furnished cells (24,920). The minimum viable prison
costs 3.6% of it and repays itself in four in-game days — eight real minutes.
An eight-prisoner prison meeting every need repays itself in the same four days
and then compounds at 2,320 a day with no ceiling. Wages never overtake income
for a player who hires to the requirement, and a player who over-hires ten to
one takes 41 in-game days to notice.

So:

- **Lowering prices** makes an economy that is already generous more generous,
  and does not remove the cliff: `floor(25,000 / 40)` is 625 wall segments
  rather than 312, which is the same lock further away. ADR 0075 measured this
  exact substitution and says so — *"624 bricks leaves 40 … a floor at zero
  fixes nothing"*.
- **A bigger starting treasury** has the same property, and ADR 0075's third
  route reaches the trap with no press at all, so a larger opening balance
  postpones it rather than closing it.
- **Per-prisoner funding** already exists. It is `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`
  = 300 per occupied place per day, and it is the only income line in the game.
  Raising it would raise a number that is already sufficient by a factor of
  several, and it would do nothing at all for a prison with **zero** occupied
  places — which is precisely the state the player is stuck in.

### What the numbers do support

**The problem is not the level of money, it is that the income line can be
switched off by a gesture and cannot be switched back on.** Four single-supplier
links — money → plank → bed → place → money — and the loop is cut anywhere
below 65.

Three things follow, in the order the numbers rank them.

1. **ADR 0075 decision 1's first threshold is the one lever that fits the
   measurements, and it is already Accepted.** A development grant that fires at
   a very low population is money that arrives *when there is no income*, which
   is the only moment the player needs it — unlike a bigger opening balance,
   which arrives when they have plenty. The magnitude this costing supports is
   small: **anything at or above 890 restores a prison from nothing**, and 65
   restores one from a walled cell. A first threshold of one prisoner paying
   ~1,000 would close §6 without touching a single price. The thresholds and
   amounts remain #29's and the owner's; what this record contributes is the
   floor they have to clear.
2. **A drag-cost preview and a reserve floor are cheap and are about the
   gesture, not the economy.** #641 option 2 and option 3. The measurements say
   the cliff is reached by an *ordinary* first build, so the warning has to be
   on the gesture rather than on the balance.
3. **If any price moves, move the wall.** The shell is 68–94% of every priced
   room and 86% at the median, `wall-brick` is the single most-bought row in the
   game, and it is the one row priced *above* the door that substitutes for it.
   A wall at 65 would make the price list internally consistent and cut one of
   every room type from 21,660 to **18,465** — 15%. It would also move the lock
   from 312 segments to 384, which is a side effect and not a fix, and should
   not be sold as one.

**And do the sentence change first.** §7 shows it is the change that gives the
prices something to be about: it makes the 1,025 shower room and the free yard
matter, it costs nothing to the break-even case, and every conclusion above
survives it.

## 9. My weakest claim

**That "the economy is not short of money" is a statement about the game and not
about my prisons.** Every prison in §3 to §5 was built by a script that knew
exactly which tiles to use, bought exactly the right materials, never
mis-clicked, never bought a brick it did not need, and never demolished
anything. A real player wastes money, and this record measures **none** of that
waste. The three published playtests
(`2026-08-29-playtest-ordering-and-the-second-room.md`,
`2026-08-30-the-naive-route.md`, `2026-08-30-what-the-game-never-says.md`) each
found a player spending materials on a build that then stalled — sixty bricks
for half a perimeter in one of them — and none of them costed it.

So the honest form of my conclusion is: **the economy is not short of money for
a player who does not waste any, and I do not know the waste multiplier.** If it
is 3× or more, an ordinary first prison costs 2,700 rather than 890 and the
break-even day moves from 4 to 12 — still solvent, but a different feeling.
If it is 10×, the argument in §8 weakens considerably.

What would change my mind: a browser playtest of an unaided first prison that
records the treasury at every press, giving a measured ratio between what was
spent and what the finished prison needed. That is the measurement §6 could not
take on a contended machine, and it is the single most useful thing to run next.
