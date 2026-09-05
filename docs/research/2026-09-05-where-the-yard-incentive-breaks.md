# Where the yard incentive breaks — 2026-09-05

Issue [#997](https://github.com/matmaxalez/lockstate/issues/997). A measurement
pass, and only that: the owner ruled *"zmierz najpierw, gdzie się łamie — przed
jakąkolwiek zmianą mechaniki"* ("measure first where it breaks, before any
change to the mechanic"). **No balance constant is touched by this branch and no
production file is edited.** Everything the measurement suggests as a repair is
described here and written nowhere else.

Measured on `research/997-recreation-scale-cliff`, cut from `origin/main` at
`1ad2189a` (v0.0.483), with
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40`
(`src/simulation/economy/income.ts:513`) exactly as it stands on `main`. **No
source mutation was needed for any figure below**, which is the one respect in
which this pass is cheaper than the two browser instruments it re-measures.

---

## The claim under test

`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s own docblock:

> **The cheapest repair pays for itself in days.** `room.yard` requires no
> object at all (`src/content/room-catalog.ts`), so zoning 8x8 of owned ground
> turns `recreation` from unmet to served and returns 40 a prisoner a day for
> nothing.

and, immediately under it, the amendment that produced #997:

> **This bullet is measured true at four prisoners and measured false at fifty,
> and restoring the constant does not by itself fix that.** … At fifty the same
> zoning returned **exactly nothing** … `recreation` read **0** permille and
> unmet for 50 of 50, and not one prisoner performed `action.yard-recreation` at
> all.

That amendment ruled capacity out as a *sufficient* cause and named reachability
— *"the cell in both instruments is walled on four sides with no doorway"* — as
the strongest untested candidate
(`docs/research/2026-09-04-what-pressure-there-is-at-fifty.md` §6).

---

## The answer in one paragraph

**The bullet is true at fifty. What was false at fifty was the prison, not the
population.** With a door in the cell wall, one 8×8 yard at fifty prisoners
returns **2,000 minor units a day, which is 50 × 40 to the unit**, and the same
holds at 4, 8, 12, 16, 24, 32, 40 and 50 — the recovered income is `n × 40`
exactly at every one of the eight populations the issue names. The
fifty-prisoner zero is reproduced here headlessly and is entirely the missing
doorway: the same prison with the cell sealed pays 11,000 instead of 13,000,
performs **0** ticks of `action.yard-recreation`, and books 11,558
`routeFailures`. There *is* a real scale limit and it is further out and not a
cliff: one 8×8 yard holds four places, delivers **about 20 visits a day whatever
the population**, and a visit lasts long enough to keep a prisoner above the
threshold for 5.67 days — so it serves everyone up to about **70**, loses 1
prisoner at 80, 12 at 90 and 20 at 100, degrading smoothly rather than snapping.
The remedy is free and works: **a second 8×8 yard, or one 16×8, restores the
full `n × 40` at a hundred prisoners**, and `ZoneRoom` moves no money
(`src/simulation/runtime/session-commands.ts:144`, `src/simulation/rooms/zoning.ts:20`).
One need behaves identically and for the same reason — **`hygiene`**, whose
shower room holds *two* places rather than four — and three needs (`hunger`,
`sleep`, `bladder`) are immune to population entirely because their actions
target `own-accommodation`, which `claimUseIfNeeded` exempts from every ceiling
on one line (`src/simulation/prisoners/action-system.ts:1157`). **So it is not a
defect of the yard. It is a property of the class "need served only by a
`room-catalog-id` action", whose members today are `recreation` and
`hygiene`.**

---

## Reproduction

Everything below comes from one file and one command. Both are on this branch.

```
git fetch origin main
git worktree add ../lockstate-997 -b research/997-recreation-scale-cliff origin/main
ln -sfn "$PWD/node_modules" ../lockstate-997/node_modules
cd ../lockstate-997

# every act:
node ./node_modules/vitest/vitest.mjs run --config tests/research/vitest.research.config.ts
```

**Every figure in this record is a tick count, a need level or a grant, and
none of them is a duration** — the kernel is fixed-step and the instrument reads
state, so machine load cannot move a single number below. The one wall-clock
figure anywhere in this record is how long the whole file takes to run: **65 s**
and **71 s** on two runs, the second at a load average of about 13 with several
agents working, which is the spread to expect rather than a threshold.

One act at a time, with `-t`:

| Act | Command suffix | Question |
| --- | --- | --- |
| A | `-t "across population"` | [§1](#1-measured--the-recovered-income-is-n--40-at-every-population-the-issue-names) — the eight populations, at two yard placements |
| B | `-t "the door"` | [§2](#2-measured--the-fifty-prisoner-zero-is-the-doorway-and-nothing-else) — the same prison with and without a doorway |
| C | `-t "more yard"` | [§4](#4-measured--more-yard-does-fix-it-and-it-costs-nothing) — 1–4 yards and 8×8 / 16×8 / 20×8 |
| D | `-t "other five needs"` | [§5](#5-measured--hygiene-breaks-identically-hunger-sleep-and-bladder-cannot) — every need at n=4 and n=50 |
| E | `-t "ceilings"` | [§3](#3-measured--what-runs-out-named) — the ceilings read off the registry |
| G | `-t "past fifty"` | [§1.2](#12-measured--past-fifty-the-boundary-is-a-slope-and-not-a-step) — 50 to 100 prisoners |

`vitest.config.ts` collects `tests/**/*.test.ts`; the instrument is
`tests/research/2026-09-05-yard-at-scale.research.ts` and is collected only by
`tests/research/vitest.research.config.ts`, so **`pnpm test` does not run it**
and CI is not charged for its minute. Two mechanics, both measured rather than assumed:
`vitest` 4.1.11 rejects `--include` outright (``CACError: Unknown option
`--include` ``), which is why a second config exists rather than a flag; and
without `disableConsoleIntercept` the default reporter swallows every
`console.log`, so the instrument prints nothing at all.

### The prison every act builds

One owned chunk, 32×32 tiles (`createNewSimulationRuntime`,
`src/simulation/runtime/new-session.ts:422-434`). Seed `0x997`. Built through
the commands a player has — `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`,
`HireStaff`, `AdmitPrisoner` — with `wallRoomPerimeter` (`tests/helpers/room-walls.ts`)
as the one shortcut, writing the edges completed `wall-brick` and `door-wooden`
orders would have written.

- **The cell** is 11×10 at (12,11), carrying **fifty beds** and one toilet, in
  every arm, at every population. Only the number of `AdmitPrisoner` commands
  changes — that is what the issue's *"the rest of the prison identical"*
  requires, and scaling the beds with the population would vary two things at
  once.
- **It contains the arrival tile.** `src/main.ts:621`'s `NEW_PRISON_ORIGIN_TILE` is
  `(16,16)`, and the browser instrument this pass re-measures walls its cell at
  columns 12..21, rows 11..20 — so an admission there arrives *inside* the cell
  and a sealed cell seals its occupants **in**. This rectangle is that
  instrument's, to the tile. A fixture whose cell did not contain the arrival
  tile would seal them **out**, which is a different prison; that was built
  first by accident and is why the note says this out loud.
- **Seven guards**, which is `max(scheduledGuardCount, ceil(50/8))` —
  `resolveOccupancyScaledGuardCount`, `src/simulation/security/sector-staffing.ts:190`.
  Fixed at the fifty figure for every population in acts A–E; scaled to
  `max(7, ceil(n/8))` in acts C and G, for the reason [§7](#7-what-this-record-does-not-claim)
  gives.
- **Twenty in-game days after the intake.** The intake is at tick 9,599, which
  is `4 × DAY_LENGTH_TICKS − 1`, so the final readout tick is again a day
  boundary — the tick `StateIncomeSystem` settles the day on. Every need level
  and every histogram below is read at the *same* tick as the last grant in its
  series.
- **The money is `stateIncomeForCompletedDay(runtime.prisoners)`**
  (`src/simulation/economy/income.ts:651`), the exported production function
  `StateIncomeSystem` credits from, called at a day boundary. It is pure, so it
  reads the integer the treasury is about to receive with payroll, procurement
  and the insolvency ladder not folded in. **"Recovered" everywhere below is
  that integer with the yard minus that integer without it, on the same seed at
  the same tick.**

### Two yard placements, because the two browser instruments differed in exactly this

`wallRoomPerimeter` puts the cell's door in the south boundary at its left
column, so a prisoner leaving the cell steps onto `(12, 21)`.

- **at-the-door** — the 8×8 yard is `(12,21)`–`(19,28)`. Walking distance from
  the door: **0 tiles**. This is the four-prisoner browser instrument's
  arrangement, which zoned its yard adjacent to its cell sharing the wall line.
- **far** — the 8×8 yard is `(1,1)`–`(8,8)`. Walking distance from the door:
  **17 tiles**. This is nearer to the fifty-prisoner instrument, which had to
  pan the camera and left clear ground between cell and yard.

---

## 1. MEASURED — the recovered income is `n × 40` at every population the issue names

**Act A, at-the-door.** Verbatim, one row per population:

```
=== ACT A [at-the-door]: one 8x8 yard against no yard, identical prison, seed 0x997, 20 days ===
  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel | peak use
  4 |  999/ 999/ 999                |  0 of  4  |           880 |         1040 |       160 |    160 |        23916 |        9600 | 4 of 4
  8 |  988/ 995/ 999                |  0 of  8  |          1760 |         2080 |       320 |    320 |        39516 |       21920 | 4 of 4
 12 |  977/ 992/ 999                |  0 of 12  |          2640 |         3120 |       480 |    480 |        34396 |       25600 | 4 of 4
 16 |  859/ 984/ 999                |  0 of 16  |          3520 |         4160 |       640 |    640 |        39758 |       31680 | 4 of 4
 24 |  785/ 957/ 999                |  0 of 24  |          5280 |         6240 |       960 |    960 |        39996 |       50080 | 4 of 4
 32 |  577/ 855/ 999                |  0 of 32  |          7040 |         8320 |      1280 |   1280 |        39916 |       63680 | 4 of 4
 40 |  512/ 823/ 999                |  0 of 40  |          8800 |        10400 |      1600 |   1600 |        39916 |       82400 | 4 of 4
 50 |  436/ 696/ 998                |  0 of 50  |         11000 |        13000 |      2000 |   2000 |        38800 |      115840 | 4 of 4
```

**`recovered` equals `n × 40` in all eight rows, to the unit, and `unmet rec` is
`0 of n` in all eight.** The grant series is flat for the last fifteen days in
every row — for example at fifty:

```
      no-yard grant series:   [15000,15000,15000,15000,13000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000]
      with-yard grant series: [15000,15000,15000,15000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000]
      with-yard unmet histogram: [0,50,0,0,0,0,0]
      no-yard unmet histogram:   [0,0,50,0,0,0,0]
```

Fifty places at `300 − 40 = 260` is 13,000; at `300 − 80 = 180` it is… 11,000 is
`50 × 220`, which is `300 − 2 × 40`: **without a yard every prisoner is short two
needs (`hygiene` and `recreation`), with one they are short one (`hygiene`), and
this act builds no shower room in either arm.** That is the whole of the
difference and the histogram says so.

**So the boundary the issue asks for is not inside 4..50 at all.** Nothing about
the payout degrades between four prisoners and fifty. What *does* degrade,
continuously, is the margin: the lowest `recreation` any prisoner holds at the
settlement tick falls 999 → 436 permille as the population goes 4 → 50, against
a threshold at **200 permille** (`STATE_INCOME_UNMET_NEED_LEVEL = 51` of
`NEED_MAX = 255`, `src/simulation/economy/income.ts:330`). The prison at fifty is
paying in full with about a factor of two in hand, and that factor is what runs
out later.

### 1.1 MEASURED — the far yard costs `n × 40` at four prisoners, and the reason is not recreation

**Act A, far.** The same eight populations, the same prison, the yard moved 17
tiles:

```
=== ACT A [far]: one 8x8 yard against no yard, identical prison, seed 0x997, 20 days ===
  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel | peak use
  4 |  984/ 984/ 984                |  0 of  4  |           880 |          880 |         0 |    160 |        18880 |       16320 | 4 of 4
  8 |  984/ 992/ 999                |  0 of  8  |          1760 |         2000 |       240 |    320 |        28196 |       39168 | 4 of 4
 12 |  843/ 984/ 999                |  0 of 12  |          2640 |         3120 |       480 |    480 |        28236 |       65280 | 4 of 4
 16 |  721/ 984/ 999                |  0 of 16  |          3520 |         4120 |       600 |    640 |        29083 |       86292 | 4 of 4
 24 |  719/ 931/ 999                |  0 of 24  |          5280 |         6240 |       960 |    960 |        28548 |      136884 | 4 of 4
 32 |  701/ 856/ 999                |  0 of 32  |          7040 |         8320 |      1280 |   1280 |        28397 |      176970 | 4 of 4
 40 |  559/ 842/ 999                |  0 of 40  |          8800 |        10400 |      1600 |   1600 |        28515 |      225726 | 4 of 4
 50 |  275/ 756/ 999                |  0 of 50  |         11000 |        13000 |      2000 |   2000 |        29043 |      285192 | 4 of 4
```

`recreation` is served at every population here too — `0 of n` unmet in all eight
rows. But **at four prisoners the yard returns nothing at all**, and at eight and
sixteen it returns less than `n × 40`. The cause is in the need breakdown, and it
is not the need the yard serves:

```
  4 |  ... recovered 0 ...
      with a yard:
    hunger      unmet for  4 of  4  permille min=   0 median=   0 max=   0
    recreation  unmet for  0 of  4  permille min= 984 median= 984 max= 984
      without a yard:
    hunger      unmet for  0 of  4  permille min= 943 median= 943 max= 943
    recreation  unmet for  4 of  4  permille min=   0 median=   0 max=   0
      with-yard performing ticks:  {"action.sleep":47524,"action.free-association":54168,"action.yard-recreation":18880,"action.eat-in-cell":232,"action.use-toilet":6240}
      no-yard performing ticks:    {"action.sleep":47524,"action.free-association":67680,"action.eat-in-cell":12640,"action.use-toilet":15120}
```

**`action.eat-in-cell` falls from 12,640 performing ticks to 232, and `hunger`
falls from 943 permille to 0.** The yard fixed `recreation` and starved the
prison: the state pays 220 a place either way and the player sees no change at
all. At eight prisoners the same effect costs two of eight their meals
(`hunger unmet for 2 of 8, min 0`), at sixteen it costs one, and from
twenty-four up it stops — because from there the yard's four places are
contended, most prisoners never leave the cell, and contention is what protects
their lunch.

**Why the walk does it.** `GENERAL_POPULATION_REGIME`'s meal blocks are 100 ticks
long (`src/simulation/prisoners/regime.ts:108`, `:111` and `:114`), and a prisoner who spent
the preceding recreation block in a yard 17 tiles away is still walking when the
block opens and closes. The far arm pays **285,192 travelling ticks against
29,043 performing ticks** at fifty — nearly ten to one — where the at-the-door
arm pays 115,840 against 38,800.

**This is a second finding and it is stated separately from the first, per
`docs/AGENT_WORKFLOW.md` §3.** What is measured is the pair of numbers. What
would establish that a player would ever build this: nothing in this record. It
is the arrangement the fifty-prisoner browser instrument was forced into by the
camera (issue #957), so it is at least reachable in play.

### 1.2 MEASURED — past fifty, the boundary is a slope and not a step

The issue's eight populations end at fifty and the payout is intact there, so the
sweep was extended on a **wider cell** — 21×10 with a hundred beds — with guards
scaled to `max(7, ceil(n/8))` and one 8×8 yard at the door. **These rows compare
only with each other**, not with §1's: the cell is a different rectangle.

```
=== ACT G: 21x10 cell, a hundred beds, one 8x8 yard at the door, 20 days ===
  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel
 50 |  505/ 704/ 996                |  0 of  50 |         11000 |        13000 |      2000 |   2000 |        38800 |      114320
 60 |  286/ 710/ 999                |  0 of  60 |         13200 |        15600 |      2400 |   2400 |        38796 |      142680
 70 |  229/ 696/ 999                |  0 of  70 |         15400 |        18200 |      2800 |   2800 |        40716 |      171280
 80 |  145/ 669/ 999                |  1 of  80 |         17600 |        20760 |      3160 |   3200 |        41596 |      196320
 90 |   82/ 577/ 999                | 12 of  90 |         19800 |        22920 |      3120 |   3600 |        42196 |      223160
100 |    0/ 569/ 999                | 20 of 100 |         22000 |        25200 |      3200 |   4000 |        41596 |      256240
```

Read the `recovered` column against `(n − unmet) × 40`:

| n | unmet | `(n − unmet) × 40` | recovered |
| --- | --- | --- | --- |
| 50 | 0 | 2,000 | **2,000** |
| 60 | 0 | 2,400 | **2,400** |
| 70 | 0 | 2,800 | **2,800** |
| 80 | 1 | 3,160 | **3,160** |
| 90 | 12 | 3,120 | **3,120** |
| 100 | 20 | 3,200 | **3,200** |

**Exact in every row.** The state pays 40 for each prisoner the yard actually
keeps above the line and nothing for the rest, with no rounding and no
interaction — which is ADR 0064's shape holding under load.

**The degradation is smooth: 0, 0, 0, 1, 12, 20 unmet.** There is no tick at
which the yard stops working. The lowest `recreation` level in the prison crosses
the 200-permille threshold somewhere between n=70 (229) and n=80 (145), and from
there the tail thickens gradually.

---

## 2. MEASURED — the fifty-prisoner zero is the doorway, and nothing else

**Act B.** Two prisons at fifty prisoners with one at-the-door yard, differing by
**one edge**: whether `wallRoomPerimeter` was handed the door registry.

```
=== ACT B: n=50, one yard, cell walled on four sides with no door ===
  no door: grant 11000  series [15000,15000,15000,15000,13000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000,11000]
    yard performing ticks 0  peak use 0 of 4
    metrics {"unmetDemandCycles":11558,"routeFailures":11558,"substitutionCycles":24479,"contendedSubstitutionCycles":0,"actionsStarted":32512,"actionsCompleted":20904}   unmet histogram [0,0,50,0,0,0,0]
    hunger      unmet for  0 of 50  permille min= 943 median= 947 max= 982
    sleep       unmet for  0 of 50  permille min= 999 median= 999 max= 999
    hygiene     unmet for 50 of 50  permille min=   0 median=   0 max=   0
    bladder     unmet for  0 of 50  permille min= 637 median= 637 max= 984
    safety      unmet for  0 of 50  permille min=1000 median=1000 max=1000
    recreation  unmet for 50 of 50  permille min=   0 median=   0 max=   0
    performing ticks: {"action.sleep":601710,"action.free-association":711360,"action.eat-in-cell":161080,"action.use-toilet":40700}
  door: grant 13000  series [15000,15000,15000,15000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000,13000]
    yard performing ticks 29043  peak use 4 of 4
    metrics {"unmetDemandCycles":2549,"routeFailures":0,"substitutionCycles":19723,"contendedSubstitutionCycles":1930,"actionsStarted":23120,"actionsCompleted":20521}   unmet histogram [0,50,0,0,0,0,0]
    hunger      unmet for  0 of 50  permille min= 484 median= 888 max= 971
    sleep       unmet for  0 of 50  permille min= 764 median= 920 max= 999
    hygiene     unmet for 50 of 50  permille min=   0 median=   0 max=   0
    bladder     unmet for  0 of 50  permille min= 793 median= 940 max= 991
    safety      unmet for  0 of 50  permille min=1000 median=1000 max=1000
    recreation  unmet for  0 of 50  permille min= 275 median= 756 max= 999
    performing ticks: {"action.sleep":451466,"action.free-association":815352,"action.yard-recreation":29043,"action.eat-in-cell":52641,"action.use-toilet":71753}
```

**The sealed column is the browser instrument's act Y, reproduced to the
signature:** `recreation` at exactly 0 permille for 50 of 50, and *not one*
`action.yard-recreation` tick on a prison with a zoned, legal, outdoor yard —
which is precisely the sentence
`docs/research/2026-09-04-what-pressure-there-is-at-fifty.md` §6 wrote about the
browser run. It also reproduces that record's *"the histogram moved the wrong
way"* observation, in the same direction: `bladder`'s median in the sealed
column is 637 against 940 with a door.

The counter that separates them is `routeFailures`, and it is **11,558 in the
sealed column and 0 with a door**. Every one of the sealed prison's unmet cycles
is `continueTravelling`'s route-failure arm
(`src/simulation/prisoners/action-system.ts:908-909`) — a prisoner selecting the
yard, being sent to it and never arriving. `contendedSubstitutionCycles` is **0**
sealed and **1,930** with a door, which is the same fact from the other side:
the sealed prison never even reaches contention.

**So candidate 2 of that record's three is confirmed and candidate 1 is
demoted.** The zero at fifty is a room nobody could walk to, exactly as issue
#938 and `tests/integration/dead-room-no-doorway.test.ts` describe for `hygiene`.
Capacity is real, it is [§3](#3-measured--what-runs-out-named)'s subject, and it
does not bind at fifty.

---

## 3. MEASURED — what runs out, named

Not "probably capacity". The chain, in the order a prisoner walks it:

1. **`ActionSystem.resolveTargetInstance`
   (`src/simulation/prisoners/action-system.ts:1569`)** calls
   `this.roomInstances.findAvailableForUse(action.target.roomCatalogId,
   action.requiredObjectCapability)` for every `room-catalog-id` target. This is
   the only gate, and it is per-room-type.
2. **`RoomInstanceRegistry.findAvailableForUse`
   (`src/simulation/prisoners/room-instance-registry.ts:985`)** answers with the
   first instance whose `useOccupancyOf(...) < ceiling` (`:998`).
3. **The ceiling for a yard is floor area.** `concurrentUseCapacityFor` (`:609`)
   reaches, for a room tagged `openArea`, the derivation at **`:341`**:

   ```ts
   return Math.max(1, Math.floor((width * height) / TILES_PER_OPEN_GROUND_PLACE));
   ```

   with `TILES_PER_OPEN_GROUND_PLACE = 16` (`:222`). `room.yard`'s authored
   minimum is 8×8 (`src/content/room-catalog.ts:138-141`), so **an 8×8 yard is
   `floor(64/16) = 4` places**, read off the registry rather than computed here:

   ```
   === ACT E: concurrent-use ceilings, read off `RoomInstanceRegistry` ===
     --- four 8x8 yards ---
       room.yard room.yard:12:1 capability=(none)  concurrentUseCapacityFor=4  residentCapacity=0
       room.yard room.yard:1:1 capability=(none)  concurrentUseCapacityFor=4  residentCapacity=0
       room.yard room.yard:21:1 capability=(none)  concurrentUseCapacityFor=4  residentCapacity=0
       room.yard room.yard:21:24 capability=(none)  concurrentUseCapacityFor=4  residentCapacity=0
       room.cell room.cell:12:11 capability=sleep-surface  concurrentUseCapacityFor=50  residentCapacity=50
       room.cell room.cell:12:11 capability=sanitation  concurrentUseCapacityFor=1  residentCapacity=50
     --- one 8x8 yard at the door, a shower room and a canteen ---
       room.yard room.yard:12:21 capability=(none)  concurrentUseCapacityFor=4  residentCapacity=0
       room.shower-room room.shower-room:20:21 capability=hygiene  concurrentUseCapacityFor=2  residentCapacity=0
       room.canteen room.canteen:24:21 capability=dining  concurrentUseCapacityFor=6  residentCapacity=0
     --- one 20x8 yard at the door and nothing else ---
       room.yard room.yard:12:21 capability=(none)  concurrentUseCapacityFor=10  residentCapacity=0
   ```
4. **The claim is taken on arrival, not on selection** —
   `RoomInstanceRegistry.claimUse` (`:1184`) compares
   `useOccupancyOf(instanceId, capability) >= ceiling` at `:1195`. A prisoner who
   was answered "yes" and walked can be refused at the door, and
   `ActionSystem` counts that at **`action-system.ts:1079`**.

**But the ceiling alone is not what runs out, and the instrument says which
number does.** `peak use` is `4 of 4` in every populated row from n=4 upward —
the yard saturates immediately and stays saturated — yet fifty prisoners are
fully served and a hundred are not. The number that separates them is
**throughput, in visits**:

| n (act A, at the door) | yard visits, 20 days | visits/day | mean visit | one visit per prisoner every |
| --- | --- | --- | --- | --- |
| 4 | 240 | 12 | 100 ticks | 0.33 days |
| 8 | 396 | 20 | 100 | 0.40 |
| 12 | 344 | 17 | 100 | 0.70 |
| 16 | 398 | 20 | 100 | 0.80 |
| 24 | 400 | 20 | 100 | 1.20 |
| 32 | 400 | 20 | 100 | 1.60 |
| 40 | 400 | 20 | 100 | 2.00 |
| 50 | 388 | 19 | 100 | 2.58 |
| 80 (act G) | 416 | 21 | 100 | 3.85 |
| 90 (act G) | 422 | 21 | 100 | 4.27 |
| 100 (act G) | 416 | 21 | 100 | 4.81 |

**The yard delivers about twenty visits a day and nothing in the range 8..100
moves that number.** The mean visit is exactly **100 ticks**, which is
`action.yard-recreation`'s `minDurationTicks`
(`src/simulation/prisoners/actions.ts:166`) — so a place is held for the minimum
whatever the visitor needed, and the four places are a *rate*, not a pool.

The supply and demand sides, both from authored constants:

- **Supply.** Four places × the 600 ticks a day
  `GENERAL_POPULATION_REGIME` allows `recreation` in — three blocks of 200 at
  `src/simulation/prisoners/regime.ts:110`, `:113` and `:115` — ÷ 100 ticks a
  visit = **24 visits a day**, of which about 20 are realised. The instrument
  prints the shortfall as utilisation: 81% at n=50, 87–88% at n=80..100. The
  missing fifth is walking: at n=100 the prison spends 256,240 ticks travelling
  to the yard against 41,596 in it, six to one, and a place stands empty while
  its next occupant is on the way.
- **Demand.** `recreation` decays at **0.015 a tick**
  (`src/simulation/prisoners/needs.ts:118`), which is 36 whole levels a day; the
  yard restores 3 a tick (`actions.ts:166`), so a 100-tick visit refills anyone
  from 0 to `NEED_MAX`. A refilled prisoner falls to the threshold after
  `(255 − 51) / 36 = ` **5.67 days**.

`20 visits/day × 5.67 days ≈ 113 prisoners` is what one 8×8 yard would sustain if
the visits were rationed perfectly. Measured, it frays at about **80**, because
they are not: `ActionSystem.update` orders both the arrival pass and the
selection pass by `compareByNeedUrgency` (`action-system.ts:487-515`), which is a
greedy order and not a round robin, so a prisoner can take a second visit before
another has had a first.

**Answering the four candidates the issue lists by name:**

| Candidate | Verdict |
| --- | --- |
| Object capacity in the yard | **Not the mechanism.** `room.yard` has no `object` requirement at all. Its ceiling is floor area, `room-instance-registry.ts:341`. |
| Access time / queueing | **Yes, and it is the larger half.** Travel is 3:1 against use at n=50 and 6:1 at n=100; `contendedSubstitutionCycles` reaches 10,279 at n=100 and falls to **0** the moment the yard has spare places. |
| The schedule window | **Yes, as a multiplier.** 600 of 2,400 ticks a day. It is the `600` in `4 × 600 / 100`; nothing else in the day can use the yard. |
| Path throughput | **No.** `routeFailures` is **0** in every arm whose cell has a door, at every population up to 100. Nobody fails to find a route; they fail to find a free place when they get there. |

---

## 4. MEASURED — more yard does fix it, and it costs nothing

**Act C**, at fifty and at a hundred, with the two remedies a player actually
has: zone another yard, or zone more ground under the one they have.

At fifty there is nothing to repair — one 8×8 already returns the whole
`50 × 40`, and more yard buys only margin:

```
  --- n=50, 7 guards, no yard: grant 11000 over 50 places, recreation unmet for 50 of 50  permille min=0 median=0 max=0
      n=50 REMEDY 1 -- more 8x8 yards (the first at the door, the rest on the north strip):
        1 yard(s) = 4 places: grant 13000 (+2000)   recreation unmet 0 of 50  min=436 median=696   contendedSubstitutionCycles 4751
        2 yard(s) = 8 places: grant 13000 (+2000)   recreation unmet 0 of 50  min=699 median=862   contendedSubstitutionCycles 1360
        3 yard(s) = 12 places: grant 13000 (+2000)  recreation unmet 0 of 50  min=699 median=930   contendedSubstitutionCycles 258
        4 yard(s) = 16 places: grant 13000 (+2000)  recreation unmet 0 of 50  min=697 median=981   contendedSubstitutionCycles 0
      n=50 REMEDY 2 -- one yard at the door, more ground under it:
        8x8  = 64 tiles  = 4 places:  grant 13000 (+2000)  min=436 median=696  yard perform 38800  travel 115840
        16x8 = 128 tiles = 8 places:  grant 13000 (+2000)  min=851 median=935  yard perform 79392  travel 105840
        20x8 = 160 tiles = 10 places: grant 13000 (+2000)  min=858 median=979  yard perform 98191  travel 103400
```

At a hundred it repairs the shortfall completely, and **one extra 8×8 is
enough**:

```
  --- n=100, 13 guards, no yard: grant 22000 over 100 places, recreation unmet for 100 of 100
      n=100 REMEDY 1 -- more 8x8 yards:
        1 yard(s) =  4 places: grant 25200 (+3200)  recreation unmet 20 of 100  min=  0 median=569
        2 yard(s) =  8 places: grant 26000 (+4000)  recreation unmet  0 of 100  min=224 median=717
        3 yard(s) = 12 places: grant 26000 (+4000)  recreation unmet  0 of 100  min=441 median=842
        4 yard(s) = 16 places: grant 26000 (+4000)  recreation unmet  0 of 100  min=562 median=838
      n=100 REMEDY 2 -- one yard at the door, more ground under it:
        8x8  = 64 tiles  =  4 places: grant 25200 (+3200)  recreation unmet 20 of 100  min=  0
        16x8 = 128 tiles =  8 places: grant 26000 (+4000)  recreation unmet  0 of 100  min=428
        24x8 = 192 tiles = 12 places: grant 26000 (+4000)  recreation unmet  0 of 100  min=569
```

`26,000` is `100 × 260`: every place short exactly one need, and this act builds
no shower room, so that need is `hygiene`. **The recreation shortfall is gone
entirely at eight places.**

**How many are needed for fifty, and can the player afford it.** One, and the
question of affording it does not arise: `room.yard` authors `outdoors` and a
minimum size and **no object requirement at all**
(`src/content/room-catalog.ts:138-141`), and `ZoneRoom` moves no money —
`src/simulation/rooms/zoning.ts:20` states it (*"zoning designates an area and
costs nothing"*) and `src/simulation/runtime/session-commands.ts:144` states it
again from the command side. The price of the repair is 64 tiles of owned ground
and nothing else, at any population. **The rule of thumb the measurement
supports is one 8×8 per fifty prisoners**, or equivalently 16 tiles of open
ground per place and one place per 12–13 prisoners.

**Two things that do not help and are worth saying, because a player would try
them.** Yards two, three and four in remedy 1 sit on the north strip, away from
the door; each one added *raises* the total travel bill (335,192 → 349,374 →
364,838 ticks at fifty) while `contendedSubstitutionCycles` falls to zero. And at
a hundred, remedy 1's second yard is far while remedy 2's extra ground is at the
door: both reach 26,000, but the far pair spends **827,148** travelling ticks
against the 16×8's **229,040**. Ground next to the door is worth about four times
ground across the map, and nothing on any panel says so.

---

## 5. MEASURED — `hygiene` breaks identically; `hunger`, `sleep` and `bladder` cannot

**Act D.** The same cell and yard, plus the cheapest room that serves each of the
other needs: a 3×3 `room.shower-room` with its two authored shower heads, and a
6×6 `room.canteen` with two dining tables and four benches. Both are within a
dozen tiles of the cell door. Every need read at n=4 and at n=50.

```
  --- n=4 ---
    everything built: grant 1200 over 4 places  series [1200 x 20]
    hunger      unmet for  0 of  4  permille min= 943 median= 947 max= 951
    sleep       unmet for  0 of  4  permille min= 782 median= 891 max= 999
    hygiene     unmet for  0 of  4  permille min= 971 median= 979 max= 987
    bladder     unmet for  0 of  4  permille min= 959 median= 969 max= 978
    safety      unmet for  0 of  4  permille min=1000 median=1000 max=1000
    recreation  unmet for  0 of  4  permille min= 926 median= 963 max= 999
    unmet histogram [4,0,0,0,0,0,0]
    marginal grant of the yard        : 160 (n x 40 = 160)
    marginal grant of the shower room : 160 (n x 40 = 160)
    marginal grant of the canteen     : 0   (n x 40 = 160)

  --- n=50 ---
    everything built: grant 14840 over 50 places
      series [15000,15000,15000,15000,14840,14920,15000,15000,15000,14920,15000,15000,14840,14760,15000,14920,14840,14840,14920,14840]
    hunger      unmet for  0 of 50  permille min= 320 median= 806 max= 963
    sleep       unmet for  0 of 50  permille min= 764 median= 927 max= 999
    hygiene     unmet for  4 of 50  permille min= 110 median= 759 max= 995
    bladder     unmet for  0 of 50  permille min= 592 median= 959 max= 991
    safety      unmet for  0 of 50  permille min=1000 median=1000 max=1000
    recreation  unmet for  0 of 50  permille min= 370 median= 843 max= 999
    unmet histogram [46,4,0,0,0,0,0]
    marginal grant of the yard        : 1880 (n x 40 = 2000)
    marginal grant of the shower room : 1840 (n x 40 = 2000)
    marginal grant of the canteen     : 0    (n x 40 = 2000)
```

At four prisoners a fully built prison earns **1,200 = 4 × 300**, the maximum,
with the unmet-need histogram at `[4,0,0,0,0,0,0]` — nobody short of anything. At
fifty the same prison earns **14,840 of a possible 15,000**, and the series
oscillates between 14,760 and 15,000: on any given day nought to six prisoners of
fifty dip below the line. **That is the scale effect, and at fifty it is worth
about 1% of the grant, not 27%.**

Need by need:

| Need | Provider | Ceiling | n=4 | n=50 | Scales? |
| --- | --- | --- | --- | --- | --- |
| `recreation` | `action.yard-recreation` → `room.yard` | floor area, 4 for 8×8 | served, worth `4 × 40` | served, worth 1,880 of 2,000 | **yes** |
| `hygiene` | `action.shower` → `room.shower-room` | `'hygiene'` objects, **2** for the authored pair | served, worth `4 × 40` | 4 of 50 short, worth 1,840 of 2,000 | **yes, harder** |
| `hunger` | `action.eat-meal` → `room.canteen`, **and `action.eat-in-cell` → `own-accommodation`** | 6 for two tables — and none for the cell fallback | served with or without a canteen | served with or without a canteen | **no** |
| `sleep` | `action.sleep` → `own-accommodation` | none consulted | served | served | **no** |
| `bladder` | `action.use-toilet` → `own-accommodation` | none consulted — the cell's `sanitation` ceiling reads **1** and is never asked | served | served, median 959 | **no** |
| `safety` | `SafetyCoverageSystem`, from guard coverage | not a room | served | served at 7 guards | **staffing, not rooms** |

**The canteen's marginal grant is 0 at both populations.** It is not that the
canteen fails — it is that `action.eat-in-cell` (`actions.ts:124-125`) already
serves `hunger` from `own-accommodation`, so no canteen can ever earn the state's
40 for it. The canteen is worth something for other reasons; it is worth nothing
to this mechanic, at any population.

**The line that decides the whole table** is
`ActionSystem.claimUseIfNeeded`, `src/simulation/prisoners/action-system.ts:1157`:

```ts
if (action.target.kind !== 'room-catalog-id') return true;
```

An `own-accommodation` action re-checks neither the capability nor the
concurrent-use ceiling — `resolveTargetInstance` resolves it by instance id
(`:1556-1560`) and this line lets it through. **So one toilet serves fifty people
and two shower heads do not.** That is not a yard defect and it is not a shower
defect: it is the difference between a need whose action names a room type and a
need whose action names the prisoner's own cell, and the game currently has three
of each.

**Stated as the issue asks it to be stated: this is a defect of the scale of
needs, not of the yard.** It has exactly two members today (`recreation` and
`hygiene`), the yard is the more forgiving of the two, and any need added in
future with a `room-catalog-id` target joins the class automatically.

---

## 6. What the docblock should promise after this measurement

**Proposed text. Not written into `src/simulation/economy/income.ts` by this
branch**, per the issue's instruction and `AGENTS.md`'s rule that an implementing
agent does not approve its own work. It replaces the third bullet of
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s three properties **and the
amendment under it**, both of which this record supersedes:

> - **The cheapest repair pays for itself in days, and it keeps paying as the
>   prison grows.** `room.yard` requires no object and `ZoneRoom` moves no money
>   (`src/simulation/rooms/zoning.ts`), so 8x8 of owned ground turns
>   `recreation` from unmet to served and returns 40 a prisoner a day for
>   nothing. That is the incentive the mechanic exists to create, and it is why
>   the withheld share is per *need* rather than per prison: the player is paid
>   for each thing they fix, on the day they fix it.
>
>   **Measured at 4, 8, 12, 16, 24, 32, 40 and 50 prisoners on one seed: the
>   recovered grant is `n x 40` to the unit at every one of them**, and past
>   fifty it stays `(n - short) x 40` to the unit while `short` grows from 0 at
>   seventy to 20 at a hundred. One 8x8 yard is four places
>   (`floor(64 / TILES_PER_OPEN_GROUND_PLACE)`) and about twenty visits a day,
>   and a visit holds a prisoner above this threshold for 5.67 days, so **one
>   8x8 serves about fifty people and a second one is the repair** -- also free,
>   also just ground. The curve between is a slope and not a step.
>
>   **What this bullet does not promise is a yard nobody can reach.** A cell
>   with no doorway pays 0 for a legally zoned yard standing beside it, at any
>   population, and every published readout says the yard is finished: that is
>   issue #938 and `tests/integration/dead-room-no-doorway.test.ts`, not this
>   rate. Numbers in `docs/research/2026-09-05-where-the-yard-incentive-breaks.md`.

**And the amendment presently in the file should be marked rather than deleted**,
per `docs/AGENT_WORKFLOW.md` §4's rule about marking both directions. Its
measurement was correct; its attribution was not. Suggested marking, again not
written:

> **This paragraph read "measured true at four prisoners and measured false at
> fifty" from 2026-09-04 to 2026-09-05, and the second half is withdrawn.** The
> fifty-prisoner zero it recorded is real and is reproduced exactly --
> `recreation` at 0 permille for 50 of 50, not one `action.yard-recreation` tick
> -- but it is a property of a cell with no doorway and not of the population.
> The same prison with one door in the same wall pays `50 x 40`. Its own
> candidate 2 was right, and #997's measurement is what promoted it from
> "strongest candidate" to cause.

---

## 7. What this record does not claim

- **It does not claim the four-prisoner and fifty-prisoner browser numbers were
  wrong.** They are reproduced here: `+160` at four with an adjacent yard
  ([§1](#1-measured--the-recovered-income-is-n--40-at-every-population-the-issue-names)),
  and `0` at fifty with a sealed cell
  ([§2](#2-measured--the-fifty-prisoner-zero-is-the-doorway-and-nothing-else)).
  What is withdrawn is the *inference* from the pair, which nobody had the
  controlled arm to test.
- **It does not claim a player builds the prison this instrument builds.** A
  fifty-bed cell with one toilet and a door in its south-west corner is what a
  pointer can reach on the starting camera; it is not what anyone would design.
  Every number here is a number about *that* prison on *that* seed.
- **One seed.** `0x997`, one command order, twenty in-game days. The instrument
  is deterministic and the figures are exact, but they are exact about one
  trajectory. A second seed would tell you whether the 80/90/100 tail is stable;
  it has not been run.
- **The guard scaling in acts C and G is a correction, not a control.** With
  seven guards and a hundred prisoners the first run of act G had `safety` at 2
  permille and `ClassificationReviewSystem` /
  `ClassificationEarlyWarningSystem` had promoted the **whole** population to
  `high-risk` — the group census read `[["high-risk",99,56]]` with nobody left
  in general population, and `HIGH_RISK_REGIME` allows `recreation` for 200
  ticks of the day instead of 600 (`src/simulation/prisoners/regime.ts:120-128`).
  That row was reading a staffing collapse, not a yard. Acts C and G therefore
  hire `max(7, ceil(n/8))`. **That, on its own, is a finding worth an issue: an
  understaffed prison reclassifies its whole population into a regime with a
  third of the recreation time, which compounds the very penalty the
  understaffing already causes.** It is recorded here and not pursued.
- **The travel-versus-meals result of [§1.1](#11-measured--the-far-yard-costs-n--40-at-four-prisoners-and-the-reason-is-not-recreation)
  is a measurement, not a diagnosis of a defect.** What is measured is that a
  17-tile yard costs four prisoners every meal they would otherwise have eaten.
  Whether that is wrong, and what it should cost instead, is a balance question
  and the owner's.

**My weakest claim, and what would change my mind.** That the boundary is a
*slope* rather than a *step* rests on six populations from one seed on the wide
cell (0, 0, 0, 1, 12, 20 unmet at 50..100). Six points and one seed is thin for
a shape claim. What would change my mind: the same sweep on two more seeds, or a
finer grid between 70 and 90, showing the unmet count jumping rather than
climbing. The `n × 40` exactness in §1 is much stronger — eight populations, two
yard placements, an exact integer identity in every row — and I would defend
that one against a re-run.

---

## 8. What was not measured, and why

- **Nothing in the browser.** No `tests/browser` act was run for this pass. The
  headless instrument needs none of it: every claim above is about the
  simulation kernel, which runs in the worker and does not care whether
  anything was drawn.

  **The reason given for that in this agent's brief was wrong, and correcting
  it is cheaper than repeating it.** The brief said Git LFS content is pointer
  text in a worktree and that `pnpm verify:assets` therefore refuses "by
  design". The first half was true on checkout and the second does not follow.
  Measured in this worktree, under a load average of 12.78:

  ```
  $ file public/assets/actors/actor.guard.base.idle.png
  public/assets/actors/actor.guard.base.idle.png: ASCII text
  $ git lfs checkout
  Checking out LFS objects: 100% (62/62), 93 MB | 0 B/s, done.     # real 2.0s
  $ file public/assets/actors/actor.guard.base.idle.png
  public/assets/actors/actor.guard.base.idle.png: PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced
  $ node tooling/validate-runtime-atlas.mjs public/assets/actors
  Validated 10 clip atlases in /workspace/lockstate-997/public/assets/actors    # exit 0
  ```

  `0 B/s` is not a rounding: the objects are already in `.git/lfs` and nothing
  is fetched. **`git lfs checkout` materialises what is already local;
  `git lfs pull` downloads** — so the session-start hook's advice to reach for
  `pull`, and its bandwidth warning, are the wrong command for this state.
  Recorded here because the wrong version of this bullet has now been carried
  into more than one brief, which is exactly what `docs/AGENT_WORKFLOW.md` §4
  is about.
- **The common room and the classroom.** `action.common-room-recreation` and
  `action.classroom-education` also serve `recreation`
  (`src/simulation/prisoners/actions.ts:169-175`) and would raise the ceiling
  the same way a second yard does. They are not free — two benches, a bookshelf
  and four chairs — so they are a different question from *"the cheapest repair"*
  and were left to
  `tests/integration/yard-and-common-room.test.ts`, which already measures the
  substitution between them at six prisoners.
- **`safety` beyond confirming it is served.** It is provisioned by guard
  coverage rather than by any room, so it is not in the class this pass is
  about. Its own scale behaviour is visible in the bullet above and is not
  characterised here.
- **Whether any of this reaches a player's eye.** `contendedSubstitutionCycles`
  and `unmetDemandCycles` are the two numbers that separate every column in this
  record, and neither is read anywhere under `src/ui/`, `src/main.ts`,
  `src/rendering/` or `src/simulation/presentation/` — grepped on this branch,
  which is the same absence issue #938 records for `unmetDemandCycles` and ADR
  0062 open question 3 for the substitution pair. Nothing here checks what a
  player *could* see instead, so "invisible to the player" is a claim this
  record does not make: what it says is that the diagnostic it used has no
  reader. The travel asymmetry in
  [§4](#4-measured--more-yard-does-fix-it-and-it-costs-nothing) — ground at the
  door worth about four times ground across the map — is the finding most worth
  putting in front of a player, and nothing this record opened would tell
  them.
- **Any repair.** By instruction. The docblock text in
  [§6](#6-what-the-docblock-should-promise-after-this-measurement) is a proposal;
  the constant, the yard's minimum size, `TILES_PER_OPEN_GROUND_PLACE`,
  `minDurationTicks` and the regime windows are all untouched on this branch.

---

## Appendix — the instrument

`tests/research/2026-09-05-yard-at-scale.research.ts`, with
`tests/research/vitest.research.config.ts`. Both are added by this branch and
**both are meant to stay**: the acts are cheap, they are the only controlled
measurement of this mechanic that does not need a browser, and the next pass at
the same question should extend them rather than rebuild them. Neither is a
gate. The only assertions in the instrument are that the prison it built is the
prison it says it built — `refusals.count === 0`, the bed count its geometry
promises, the intake filling the cell, and the readout tick being a day
boundary — so a run that passes is a run whose printed table can be trusted, and
a run that fails printed a table about some other prison.
