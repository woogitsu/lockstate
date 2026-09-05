# Where the shower runs out — 2026-09-05

Issue [#1003](https://github.com/matmaxalez/lockstate/issues/1003). A
measurement pass and only that, exactly as
[#997](https://github.com/matmaxalez/lockstate/issues/997) was: the owner's
ruling there — *"zmierz najpierw, gdzie się łamie — przed jakąkolwiek zmianą
mechaniki"* — governs this one too. **No balance constant is touched by this
branch and no file outside `tests/research/` is edited.** Everything the
measurement suggests as a repair is described here and written nowhere else.

Measured on `research/1003-hygiene-scale-cliff`, cut from `origin/main` at
`e723bc33` (v0.0.488). `TILES_PER_OPEN_GROUND_PLACE = 16`
(`src/simulation/prisoners/room-instance-registry.ts:222`),
`room.shower-room`'s authored `{ type: 'object', objectId:
'object.shower-head', minQuantity: 2 }` (`src/content/room-catalog.ts:131`),
`NEED_DECAY_PER_TICK` (`src/simulation/prisoners/needs.ts:112`),
`STATE_INCOME_UNMET_NEED_LEVEL` and every `minDurationTicks` are read by the
instrument and written by nothing.

---

## The claim under test

`docs/research/2026-09-05-where-the-yard-incentive-breaks.md` (#997) ends by
naming a class rather than a room:

> **So it is not a defect of the yard. It is a property of the class "need
> served only by a `room-catalog-id` action", whose members today are
> `recreation` and `hygiene`.**

and says of the harder member, in its §5 table, that `hygiene` scales *"yes,
harder"* because its shower room holds *two* places against the yard's four.
#1003 asks for the same measurement of that member: where it breaks, how much
shower it takes, how the rule compares with the yard's, whether a player can
find out, and whether the class really has exactly two members.

---

## The answer in one paragraph

**`hygiene` breaks inside the range the issue names, and `recreation` does
not.** With the same cell, the same seed and the same day boundary, one
authored-minimum shower room — 3×3, two heads, two places — serves everybody up
to **24** prisoners on all three seeds run, and leaves somebody short at **32**
on two of the three; the same prison's authored-minimum yard leaves nobody short
at any population up to 50. At fifty the single shower room recovers **1,720 of
a possible 2,000**, and at a hundred — on the wider cell act J needs to house
them — **1,160 of 4,000**, and past sixty the total
it recovers *falls* as the population rises — 1,720 at n=60, 1,640 at 70, 1,440
at 80 and 90, 1,160 at 100 — which the yard never does inside a hundred. The
repair is **two 3×3 shower rooms for fifty and six shower heads for a hundred**;
both restore the full `n × 40` to the unit. It costs money, unlike the yard:
**1,025 minor units** for one authored-minimum shower room against **0** for an
8×8 yard, and the player can afford it easily — two rooms are 2,050 against a
25,000 starting treasury and they return 2,000 a day, so the repair pays for
itself in about one day. **The measurement corrects the issue's premise about
why, and adds one thing the issue did not ask about.** The shower room's ceiling is *not* floor area — it is not an
`openArea` room at all, and its ceiling is the summed footprint width of its
`'hygiene'` objects. Per *place* hygiene is no worse than recreation and at a
hundred is cheaper (six places against eight); what is worse is that the
authored minimum hands you two places for 1,025 where the yard hands you four
for nothing. And **distance helps rather than hurts**: the same shower room 17
tiles away serves all fifty where the one 6 tiles away leaves seven short. The
class census is confirmed — exactly `hygiene` and `recreation` — with
refinements #997 did not carry: `hygiene` has a **second** gated provider
(`action.laundry-work`), there is a **third** exempt target kind (`job-board`),
and `safety` is outside the class because no action serves it at all rather than
because a provider escapes the ceiling. And nothing in this record reaches a player: the concurrent-use
ceiling *"is **not projected at all yet**"* in the projection layer's own words,
and neither contention counter has a reader outside the action system and the
tests.

---

## Reproduction

Everything below comes from one file and one command, both on this branch.

```
git fetch origin main
git worktree add ../lockstate-1003 -b research/1003-hygiene-scale-cliff origin/main
ln -sfn "$PWD/node_modules" ../lockstate-1003/node_modules
cd ../lockstate-1003

# every act, #997's and #1003's together:
node ./node_modules/vitest/vitest.mjs run --config tests/research/vitest.research.config.ts
```

That whole run is `Test Files 1 passed (1)`, `Tests 14 passed (14)`,
**`Duration 646.76s`**, `real 10m47.429s`. It is the only wall-clock figure in
this record and it is a spread on a shared container, not a threshold: the load
average was **1.60** when it started and **27.80** when it finished, with other
agents' suites running throughout.

**Every other figure in this record is a tick count, a need level, a grant or a
price, and none of them is a duration.** Checked rather than asserted: act I's
`[near, 60 days]` block and act J's whole block from the ten-minute full run
above were `diff`ed against the same acts run alone earlier at load averages of
21.04 and 20.27, and both diffs were **empty**.

One act at a time, with `-t` (each of these is the exact command that produces
the block quoted under it). **Act J's suffix is the issue number and not its
sentence, deliberately:** its `describe` title and #997 act G's differ only in
that prefix — both end *"past fifty, on a cell wide enough to hold them"* — so
`-t "past fifty"` runs both acts, which is a nine-minute surprise rather than a
wrong answer.

| Act | Command suffix | Question | Section |
| --- | --- | --- | --- |
| H | `-t "the class census"` | is the class really `hygiene` and `recreation`? | [§5](#5-measured--the-class-has-exactly-two-members-and-997-named-both) |
| I | `-t "hygiene across population"` | where does hygiene run short? | [§1](#1-measured--one-shower-room-serves-twenty-four-and-not-thirty-two) |
| J | `-t "#1003 act J"` | and past fifty? | [§1.2](#12-measured--past-sixty-the-shower-room-recovers-less-money-not-more) |
| K | `-t "how much shower it takes"` | how many rooms for fifty, and for a hundred? | [§2](#2-measured--two-rooms-for-fifty-six-heads-for-a-hundred) |
| L | `-t "what a shower room costs"` | and can the player afford them? | [§2.1](#21-measured--the-price-and-whether-it-is-affordable) |
| M | `-t "side by side"` | the yard and the shower room in one prison | [§3](#3-measured--the-yard-and-the-shower-room-in-the-same-prison) |
| N | `-t "long enough for hygiene"` | is twenty days enough for hygiene? | [§1.1](#11-measured--twenty-days-is-enough-for-recreation-and-not-for-hygiene) |
| O | `-t "two more seeds"` | does the shape survive a different trajectory? | [§1.3](#13-measured--the-boundary-holds-on-three-seeds) |

Two mechanics the brief for this pass supplied and this pass re-confirmed:
`vitest` 4.1.11 has no `--include` flag, which is why
`tests/research/vitest.research.config.ts` exists rather than a flag; and
without its `disableConsoleIntercept` the default reporter swallows every
`console.log` and the instrument prints nothing.

### The prison, and what changed from #997's

The fixture is #997's, unchanged, and that is the point of extending its file
rather than writing a second one: an 11×10 cell at (12,11) carrying fifty beds
and one toilet, containing the arrival tile `(16,16)`, seven guards, seed
`0x997`, intake at tick 9,599, readouts on a day boundary, money read from
`stateIncomeForCompletedDay` (`src/simulation/economy/income.ts:651`). Only what
#1003 needs is new:

- **The shower room, at three distances.** `wallRoomPerimeter` puts a room's
  door in its south boundary at its left column, so the walk is from the cell's
  step-out tile `(12, 21)` to that doorway. **near** is `(9,21)` 3×3, doorway
  `(9,24)`, **6 tiles**. **far** is `(1,1)` 3×3, **about 17 tiles** — `YARDS[0]`'s
  corner. A fixed 5×5 at `(4,21)`, doorway `(4,26)`, **about 13 tiles**, is the
  room act K varies the *head count* in without moving or growing the rectangle.
- **`SETTLED_DAYS = 60`**, for [§1.1](#11-measured--twenty-days-is-enough-for-recreation-and-not-for-hygiene)'s
  reason. Act I prints both 20 and 60.
- **Equal material purchases across arms.** Every #1003 arm buys 20 bricks
  whether it places one object or nine, because `PurchaseMaterials` spends from
  the treasury and `InsolvencyRungSystem` and `PayrollSystem` read the balance —
  two arms that bought different quantities would differ in the treasury as well
  as in the room. Acts A–G still buy 8, so **their rows are byte-for-byte the
  rows #997 published**.

---

## 1. MEASURED — one shower room serves twenty-four, and not thirty-two

**Act I, near, 60 days.** One 3×3 shower room with its two authored heads
against no shower room, no yard in either arm, everything else identical:

```
=== ACT I [near, 60 days]: one 3x3 shower room (2 heads) against none, identical prison, no yard, seed 0x997 ===
  n | hygiene permille min/med/max | unmet hyg | grant no shower | grant + shower | recovered | n x 40 | (n-unmet) x 40 | shower perform | shower travel | peak use
  4 |  985/ 990/ 995             |  0 of  4  |             880 |           1040 |       160 |    160 |            160 |          17556 |         27840 | 2 of 2
  6 |  965/ 988/ 998             |  0 of  6  |            1320 |           1560 |       240 |    240 |            240 |          18564 |         41992 | 2 of 2
  8 |  776/ 976/ 995             |  0 of  8  |            1760 |           2080 |       320 |    320 |            320 |          20160 |         56260 | 2 of 2
 10 |  776/ 965/ 995             |  0 of 10  |            2200 |           2600 |       400 |    400 |            400 |          22596 |         77256 | 2 of 2
 12 |  776/ 909/ 995             |  0 of 12  |            2640 |           3120 |       480 |    480 |            480 |          22596 |        101616 | 2 of 2
 16 |  430/ 802/ 995             |  0 of 16  |            3520 |           4160 |       640 |    640 |            640 |          30912 |        151902 | 2 of 2
 20 |  422/ 802/ 995             |  0 of 20  |            4400 |           5200 |       800 |    800 |            800 |          24948 |        193024 | 2 of 2
 24 |  242/ 723/ 995             |  0 of 24  |            5280 |           6240 |       960 |    960 |            960 |          34314 |        246674 | 2 of 2
 32 |    0/ 642/ 995             |  1 of 32  |            7040 |           8280 |      1240 |   1280 |           1240 |          34188 |        336516 | 2 of 2
 40 |    0/ 595/ 995             | 13 of 40  |            8800 |           9880 |      1080 |   1600 |           1080 |          37688 |        437552 | 2 of 2
 50 |    0/ 607/ 999             |  7 of 50  |           11000 |          12720 |      1720 |   2000 |           1720 |          56676 |        566119 | 2 of 2
```

**`recovered` equals `(n − unmet) × 40` in all eleven rows, to the unit**, which
is the same identity #997 measured for the yard and is ADR 0064's shape holding
for the other member of the class. The state pays 40 for each prisoner the room
actually keeps above the line and nothing for the rest.

**And the shortfall column is the answer to the issue's first question.** It is
`0` at every population up to 24 and non-zero from 32 up: the boundary is
between **24 and 32 prisoners for one authored-minimum shower room**, which is
inside the range #997 swept without the yard ever leaving anyone short.

**The far room is better, not worse, and that is the surprise of this pass.**
The same room, the same two heads, moved from 6 tiles to 17:

```
=== ACT I [far, 60 days]: one 3x3 shower room (2 heads) against none, identical prison, no yard, seed 0x997 ===
  n | hygiene permille min/med/max | unmet hyg | grant no shower | grant + shower | recovered | n x 40 | (n-unmet) x 40 | shower perform | shower travel | peak use
 24 |  595/ 838/ 999             |  0 of 24  |            5280 |           6240 |       960 |    960 |            960 |          35340 |        332928 | 2 of 2
 32 |  438/ 734/ 999             |  0 of 32  |            7040 |           8320 |      1280 |   1280 |           1280 |          43696 |        467364 | 2 of 2
 40 |  290/ 792/ 999             |  0 of 40  |            8800 |          10400 |      1600 |   1600 |           1600 |          52060 |        560184 | 2 of 2
 50 |  231/ 783/ 999             |  0 of 50  |           11000 |          13000 |      2000 |   2000 |           2000 |          67834 |        710682 | 2 of 2
```

**Zero short at every population, and the full `50 × 40` at fifty.** The
throughput is what separates them, and act N reads it directly: at n=50 the
near room turns over **23 visits a day** and the far room **30**, at the same
two places and the same 42-tick mean visit. Act K supplies a third point on the
same axis — the 5×5 room at 13 tiles with **two** heads also leaves nobody short
at fifty — so the ordering by distance is 6 tiles → 7 short, 13 tiles → 0, 17
tiles → 0.

**This is a measurement and not a diagnosis, per `docs/AGENT_WORKFLOW.md` §3.**
What is measured is the visit counts and the contention counters:
`contendedSubstitutionCycles` at n=50 over 60 days is **10,570** near and
**4,325** far, and `unmetDemandCycles` **8,431** near and **5,181** far — so the
near room is refusing *more* prisoners at its door while delivering *fewer*
completed visits. The strongest untested candidate is arrival synchronisation:
`ActionSystem.update` plans the whole idle population in one pass ordered by
`compareByNeedUrgency` (`src/simulation/prisoners/action-system.ts:510`, `:513`, and `compareByNeedUrgency` itself at `:100`), so
with a short walk a cohort arrives together, two get a place and the rest
substitute for the remainder of the block, while a long walk staggers the same
cohort across the window. **What would establish it:** an instrument that
histograms arrivals per tick at the shower doorway, which was not built. What
would refute it: the same ordering by distance surviving with the arrival pass
replaced by a round robin.

### 1.1 MEASURED — twenty days is enough for `recreation` and not for `hygiene`

Act A's recreation series is flat from day 6 in every row, so its day-20 readout
is a settled state. **`hygiene`'s is not**, which is why acts J, K and M read at
sixty days and act I prints both.

```
=== ACT N: is the twenty-day readout settled? n=50, one 3x3 shower room, no yard ===
  [near] 20 days: grant 12440  hygiene unmet 14 of 50  min/med/max 0/430/999  visits 252 = 13/day  perform 10580  travel 192212
      shower place-ticks a day 529 against 1000 = 2 places x the 500-tick hygiene window
  [near] 40 days: grant 12640  hygiene unmet 9 of 50  min/med/max 0/604/999  visits 814 = 20/day  perform 34165  travel 378508
      shower place-ticks a day 854 against 1000 = 2 places x the 500-tick hygiene window
  [near] 60 days: grant 12720  hygiene unmet 7 of 50  min/med/max 0/607/999  visits 1352 = 23/day  perform 56676  travel 566119
      shower place-ticks a day 945 against 1000 = 2 places x the 500-tick hygiene window
  [near] 100 days: grant 12640  hygiene unmet 9 of 50  min/med/max 0/609/999  visits 2474 = 25/day  perform 103784  travel 945091
      shower place-ticks a day 1038 against 1000 = 2 places x the 500-tick hygiene window
  [near] 140 days: grant 12480  hygiene unmet 13 of 50  min/med/max 0/602/995  visits 3525 = 25/day  perform 147854  travel 1318844
      shower place-ticks a day 1056 against 1000 = 2 places x the 500-tick hygiene window
  [far] 20 days: grant 12920  hygiene unmet 2 of 50  min/med/max 0/733/999  visits 420 = 21/day  perform 15964  travel 230980
  [far] 40 days: grant 12840  hygiene unmet 4 of 50  min/med/max 42/670/999  visits 1087 = 27/day  perform 41310  travel 471095
  [far] 60 days: grant 13000  hygiene unmet 0 of 50  min/med/max 231/783/999  visits 1785 = 30/day  perform 67834  travel 710682
  [far] 100 days: grant 13000  hygiene unmet 0 of 50  min/med/max 231/733/999  visits 3111 = 31/day  perform 118224  travel 1186013
  [far] 140 days: grant 12960  hygiene unmet 1 of 50  min/med/max 105/733/999  visits 4372 = 31/day  perform 166142  travel 1653071
```

**The day-20 figure is a transient and the day-60 figure is the middle of a
band.** A prisoner arrives at `NEED_MAX` = 255 and `hygiene` decays at 0.02 a
tick = 48 levels a day, so nobody crosses `STATE_INCOME_UNMET_NEED_LEVEL` = 51
before day `(255−51)/48 = 4.25` and the prison is still filling its shower queue
for weeks after. The near arm reads 14 short at day 20, 9 at 40, 7 at 60, 9 at
100 and 13 at 140 — it does not converge to a point, it oscillates in a band of
roughly 7 to 14. **Sixty days is chosen as the middle of that band and not as a
settled value**, and any single row of act I is a sample of a band this wide.

**A second thing that block establishes and is worth naming separately: the
regime window is a rate limit on *starts*, not on ticks.**
`GENERAL_POPULATION_REGIME` allows the `hygiene` category for 500 ticks of the
day — 400..500, 1,800..2,000 and 2,100..2,300
(`src/simulation/prisoners/regime.ts:108`, `:113`, `:115`) — so two places is
1,000 place-ticks a day, and the far arm books **1,187**. A shower that begins
inside the window keeps performing after the block that allowed it has closed.

### 1.2 MEASURED — past sixty, the shower room recovers *less* money, not more

**Act J**, on #997's wide cell so that more than fifty can be housed, with
guards scaled to `max(7, ceil(n/8))` for the reason #997 §7 records. **These rows
compare only with each other.**

```
=== ACT J: 21x10 cell, a hundred beds, one 3x3 shower room near the door, no yard, 60 days ===
  n | hygiene permille min/med/max | unmet hyg | grant no shower | grant + shower | recovered | n x 40 | (n-unmet) x 40 | shower perform | shower travel
 50 |    0/ 598/ 995             | 15 of  50 |           11000 |          12400 |      1400 |   2000 |           1400 |          50605 |        547869
 60 |    0/ 541/ 995             | 17 of  60 |           13200 |          14920 |      1720 |   2400 |           1720 |          56494 |        690955
 70 |    0/ 261/ 999             | 29 of  70 |           15400 |          17040 |      1640 |   2800 |           1640 |          56117 |        795006
 80 |    0/  42/ 995             | 44 of  80 |           17600 |          19040 |      1440 |   3200 |           1440 |          56958 |        920112
 90 |    0/   0/ 999             | 54 of  90 |           19800 |          21240 |      1440 |   3600 |           1440 |          59928 |       1039747
100 |    0/   0/ 999             | 71 of 100 |           22000 |          23160 |      1160 |   4000 |           1160 |          55664 |       1171426
```

`recovered` is exactly `(n − unmet) × 40` in all six rows again. Two things to
read off it:

- **The room's throughput is flat and the population is not.** 20, 22, 22, 23,
  24 and 22 visits a day at a **42-tick** mean visit, from n=50 to n=100 — the
  same shape #997 measured for the yard (*"about 20 visits a day whatever the
  population"*). Two places are a *rate*, not a pool.
- **The money it recovers peaks at n=60 and then falls: 1,400, 1,720, 1,640,
  1,440, 1,440, 1,160.** Adding prisoners past sixty makes the single shower
  room worth *less in total*, because the fixed number of visits is spread over
  more people and more of them fall below the line. The yard does not do this
  anywhere inside a hundred: #997's act G reads 2,000, 2,400, 2,800, 3,160,
  3,120, 3,200 across the same populations.
- **`routeFailures` is 0 in every row.** Nobody fails to find the shower room;
  they fail to find a free head when they get there. That is the same
  separation #997 drew between issue #938's unreachable-room defect and this
  rate, and it holds for `hygiene` too.

### 1.3 MEASURED — the boundary holds on three seeds

#997 named *"one seed"* as its own weakest claim. This one runs two more.

```
=== ACT O: act I's near arm on three seeds, 60 days ===
  n | seed 0x997 unmet/grant | seed 0x1003 unmet/grant | seed 0xbeef unmet/grant
 16 |  0 of 16, + 640 (visits 12/day) |  0 of 16, + 640 (visits 10/day) |  0 of 16, + 640 (visits 10/day)
 24 |  0 of 24, + 960 (visits 14/day) |  0 of 24, + 960 (visits 12/day) |  0 of 24, + 960 (visits 13/day)
 32 |  1 of 32, +1240 (visits 14/day) |  0 of 32, +1280 (visits 14/day) |  4 of 32, +1120 (visits 11/day)
 40 | 13 of 40, +1080 (visits 15/day) |  6 of 40, +1360 (visits 17/day) |  8 of 40, +1280 (visits 13/day)
 50 |  7 of 50, +1720 (visits 23/day) |  9 of 50, +1640 (visits 22/day) | 13 of 50, +1480 (visits 18/day)
```

**Every seed agrees on the boundary and none agrees on the tail.** Nobody is
short at 16 or 24 on any seed and the full `n × 40` comes back; 32 is where the
first shortfall appears (1, 0, 4); and from 40 upward the counts are a band
(13/6/8 and 7/9/13) rather than a curve. So *"one authored-minimum shower room
serves about twenty-four and stops serving everyone by about thirty-two"* is a
three-seed result, and *"and then it degrades like this"* is not a result at
all — the seed-to-seed spread at one population is as large as the change
between populations.

---

## 2. MEASURED — two rooms for fifty, six heads for a hundred

**Act K**, with the two remedies a player actually has: zone another shower
room, or put more heads in the one they have.

```
=== ACT K: how much shower it takes, at n=50 (11x10 cell) and n=100 (21x10 cell) ===
  --- n=50, 7 guards, no shower room: grant 11000 over 50 places, hygiene     unmet for 50 of 50  permille min=   0 median=   0 max=   0
      n=50 REMEDY 1 -- more 3x3 shower rooms, two heads each (the first near the door, the rest along the same wall):
        1 room(s) = 2 places: grant 12720 over 50 places  (+1720)  shower perform 56676  travel 566119  visits 1352  peak use on one 2
          hygiene     unmet for  7 of 50  permille min=   0 median= 607 max= 999   histogram [0,43,7,0,0,0,0]   metrics {"unmetDemandCycles":8431,"routeFailures":0,"substitutionCycles":66803,"contendedSubstitutionCycles":10570,"actionsStarted":83073,"actionsCompleted":74594}
        2 room(s) = 4 places: grant 13000 over 50 places  (+2000)  shower perform 64916  travel 540411  visits 1816  peak use on one 2
          hygiene     unmet for  0 of 50  permille min= 298 median= 856 max= 999   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":8001,"routeFailures":0,"substitutionCycles":64393,"contendedSubstitutionCycles":4080,"actionsStarted":80032,"actionsCompleted":71983}
        3 room(s) = 6 places: grant 13000 over 50 places  (+2000)  shower perform 87929  travel 756142  visits 2075  peak use on one 2
          hygiene     unmet for  0 of 50  permille min= 478 median= 805 max= 998   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":12263,"routeFailures":0,"substitutionCycles":67797,"contendedSubstitutionCycles":1408,"actionsStarted":81422,"actionsCompleted":69110}
        4 room(s) = 8 places: grant 13000 over 50 places  (+2000)  shower perform 88556  travel 849161  visits 2070  peak use on one 2
          hygiene     unmet for  0 of 50  permille min= 598 median= 856 max= 999   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":10419,"routeFailures":0,"substitutionCycles":64822,"contendedSubstitutionCycles":0,"actionsStarted":78463,"actionsCompleted":68003}
      n=50 REMEDY 2 -- one 5x5 shower room at a fixed spot, more heads in it (the rectangle does not move or grow):
        2 head(s) = 2 places: grant 13000 over 50 places  (+2000)  shower perform 64722  travel 642225  visits 1471  peak use 2 of 2
          hygiene     unmet for  0 of 50  permille min= 221 median= 784 max= 996   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":6977,"routeFailures":0,"substitutionCycles":62841,"contendedSubstitutionCycles":5673,"actionsStarted":77331,"actionsCompleted":70304}
        4 head(s) = 4 places: grant 13000 over 50 places  (+2000)  shower perform 85400  travel 616174  visits 1941  peak use 4 of 4
          hygiene     unmet for  0 of 50  permille min= 482 median= 858 max= 999   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":6165,"routeFailures":0,"substitutionCycles":63690,"contendedSubstitutionCycles":4664,"actionsStarted":77016,"actionsCompleted":70801}
        6 head(s) = 6 places: grant 13000 over 50 places  (+2000)  shower perform 108146  travel 579196  visits 2458  peak use 6 of 6
          hygiene     unmet for  0 of 50  permille min= 778 median= 925 max= 999   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":5163,"routeFailures":0,"substitutionCycles":65359,"contendedSubstitutionCycles":4124,"actionsStarted":77319,"actionsCompleted":72106}
        8 head(s) = 8 places: grant 13000 over 50 places  (+2000)  shower perform 124996  travel 557156  visits 2841  peak use 8 of 8
          hygiene     unmet for  0 of 50  permille min= 798 median= 966 max= 999   histogram [0,50,0,0,0,0,0]   metrics {"unmetDemandCycles":4490,"routeFailures":0,"substitutionCycles":66544,"contendedSubstitutionCycles":3556,"actionsStarted":77418,"actionsCompleted":72879}
  --- n=100, 13 guards, no shower room: grant 22000 over 100 places, hygiene     unmet for 100 of 100  permille min=   0 median=   0 max=   0
      n=100 REMEDY 1 -- more 3x3 shower rooms, two heads each (the first near the door, the rest along the same wall):
        1 room(s) = 2 places: grant 23160 over 100 places  (+1160)  shower perform 55664  travel 1171426  visits 1326  peak use on one 2
          hygiene     unmet for 71 of 100  permille min=   0 median=   0 max= 999   histogram [0,29,71,0,0,0,0]   metrics {"unmetDemandCycles":18884,"routeFailures":0,"substitutionCycles":130748,"contendedSubstitutionCycles":22668,"actionsStarted":165403,"actionsCompleted":146419}
        2 room(s) = 4 places: grant 24960 over 100 places  (+2960)  shower perform 134377  travel 1170572  visits 3506  peak use on one 2
          hygiene     unmet for 26 of 100  permille min=   0 median= 593 max= 999   histogram [0,74,26,0,0,0,0]   metrics {"unmetDemandCycles":23568,"routeFailures":0,"substitutionCycles":129087,"contendedSubstitutionCycles":10841,"actionsStarted":166249,"actionsCompleted":142585}
        3 room(s) = 6 places: grant 25960 over 100 places  (+3960)  shower perform 137872  travel 1854869  visits 3607  peak use on one 2
          hygiene     unmet for  1 of 100  permille min= 119 median= 781 max= 999   histogram [0,99,1,0,0,0,0]   metrics {"unmetDemandCycles":34032,"routeFailures":0,"substitutionCycles":130637,"contendedSubstitutionCycles":2054,"actionsStarted":167814,"actionsCompleted":133684}
        4 room(s) = 8 places: grant 25840 over 100 places  (+3840)  shower perform 131271  travel 2034612  visits 3351  peak use on one 2
          hygiene     unmet for  4 of 100  permille min=   0 median= 783 max= 999   histogram [0,96,4,0,0,0,0]   metrics {"unmetDemandCycles":27852,"routeFailures":0,"substitutionCycles":121594,"contendedSubstitutionCycles":0,"actionsStarted":158591,"actionsCompleted":130648}
      n=100 REMEDY 2 -- one 5x5 shower room at a fixed spot, more heads in it (the rectangle does not move or grow):
        2 head(s) = 2 places: grant 24040 over 100 places  (+2040)  shower perform 70886  travel 1014811  visits 1968  peak use 2 of 2
          hygiene     unmet for 49 of 100  permille min=   0 median= 413 max= 990   histogram [0,51,49,0,0,0,0]   metrics {"unmetDemandCycles":21115,"routeFailures":0,"substitutionCycles":133171,"contendedSubstitutionCycles":22233,"actionsStarted":169368,"actionsCompleted":148153}
        4 head(s) = 4 places: grant 25200 over 100 places  (+3200)  shower perform 109984  travel 951568  visits 3054  peak use 4 of 4
          hygiene     unmet for 20 of 100  permille min=  48 median= 617 max= 998   histogram [0,80,20,0,0,0,0]   metrics {"unmetDemandCycles":18579,"routeFailures":0,"substitutionCycles":141031,"contendedSubstitutionCycles":19504,"actionsStarted":169709,"actionsCompleted":151030}
        6 head(s) = 6 places: grant 26000 over 100 places  (+4000)  shower perform 152350  travel 957704  visits 4232  peak use 6 of 6
          hygiene     unmet for  0 of 100  permille min= 358 median= 803 max= 999   histogram [0,100,0,0,0,0,0]   metrics {"unmetDemandCycles":17560,"routeFailures":0,"substitutionCycles":141300,"contendedSubstitutionCycles":15024,"actionsStarted":168320,"actionsCompleted":150660}
        8 head(s) = 8 places: grant 26000 over 100 places  (+4000)  shower perform 167148  travel 951456  visits 4643  peak use 8 of 8
          hygiene     unmet for  0 of 100  permille min= 235 median= 800 max= 998   histogram [0,100,0,0,0,0,0]   metrics {"unmetDemandCycles":16981,"routeFailures":0,"substitutionCycles":144175,"contendedSubstitutionCycles":14647,"actionsStarted":168385,"actionsCompleted":151304}
```

(Verbatim, with the sixteen `grant series` lines — one per row, each 60 integers
long — removed whole. Nothing else is edited and no row is reordered; run the
command in the table above for the series.)

**At fifty: two 3×3 rooms, or four heads.** Two rooms restore the full 2,000 and
a third and fourth buy only margin — the minimum `hygiene` level in the prison
climbs 298 → 478 → 598 permille while the grant stays at 13,000.

**At a hundred: six places.** Three rooms leave 1 of 100 short (+3,960) and six
heads in one room leave nobody short (+4,000). The fourth room is *worse* than
the third — 4 short against 1 — which is the band of
[§1.3](#13-measured--the-boundary-holds-on-three-seeds) again and not a real
reversal; both are "essentially repaired".

**Remedy 2 is the better buy and remedy 1 is what a player is likelier to do.**
Heads in one room cost 40 each and no extra wall; a second room costs a whole
perimeter. And the two remedies differ in travel exactly as #997 found for the
yard: at n=100 three separate rooms book **1,854,869** travelling ticks against
the six-head room's **957,704**, for the same repair.

**One row deserves reading twice.** At n=50, remedy 2 with **two** heads — the
same two places as remedy 1's single room — leaves **nobody** short where remedy
1 leaves seven. The only difference between those two prisons is where the room
stands: 13 tiles against 6. That is
[§1](#1-measured--one-shower-room-serves-twenty-four-and-not-thirty-two)'s
distance result appearing in an act that was not built to measure it.

### 2.1 MEASURED — the price, and whether it is affordable

**Act L**, read out of `BUILDABLE_REGISTRY`
(`src/simulation/construction/definition.ts:83`) and `PROCURABLE_MATERIALS`
(`src/content/procurement-catalog.ts:99`):

```
=== ACT L: the price of the cheapest hygiene repair, read from `BUILDABLE_REGISTRY` and `PROCURABLE_MATERIALS` ===
  wall-brick           80 minor units,  50 work  (2 x item.brick)
  door-wooden          65 minor units,  30 work  (1 x item.wood-plank)
  shower-head-brick    40 minor units,  30 work  (1 x item.brick)
  bed-wooden           65 minor units,  30 work  (1 x item.wood-plank)
  toilet-brick         40 minor units,  30 work  (1 x item.brick)
  item prices: item.brick 40, item.wood-plank 65
  room.shower-room, authored 3x3 minimum, 2 heads: 12 perimeter segments = 11 wall-brick + 1 door-wooden, plus 2 shower-head-brick => 1025 minor units and 640 work
  room.shower-room, 5x5 with 8 heads: 20 perimeter segments = 19 wall-brick + 1 door-wooden, plus 8 shower-head-brick => 1905 minor units and 1220 work
  room.yard, authored 8x8 minimum: no `enclosed` requirement, no `object` requirement => 0 minor units and 0 work
  the cell every act builds, for scale: 42 perimeter segments, 50 beds and a toilet => 6635 minor units, against a starting treasury of 25000 (TREASURY_STARTING_BALANCE_MINOR_UNITS)
```

**The repair for fifty is 2,050 minor units and it returns 2,000 a day.** It
pays for itself in **one day and a fraction**, against a prison whose grant
without it is 11,000 a day and whose starting treasury is 25,000 with the whole
cell built for 6,635. The repair for a hundred — one 5×5 room with six heads —
is `19 × 80 + 65 + 6 × 40 = 1,825` and returns 4,000 a day. **Affordability is
not the constraint at any population this pass measured**, and the honest
statement of the difference from the yard is not "the player cannot afford it"
but "the yard is free and instant and the shower room is a purchase, a delivery
and 640 work".

Two things this section does **not** establish, both named because the
arithmetic above invites them:

- **It is not the treasury's own answer.** The instrument's walls are written by
  `wallRoomPerimeter` rather than ordered, and `PurchaseMaterials` charges at
  purchase while `PlaceObject` spends stock — so two arms buying the same
  materials have identical balances whatever they build, and the act prints that
  line saying so rather than pretending it measured a price.
- **It says nothing about the player's income at the moment they would build
  it.** These are prices against a starting treasury, not against a played
  economy with payroll and procurement running. That is a different measurement.

---

## 3. MEASURED — the yard and the shower room in the same prison

**Act M.** One prison, four arms, the yard at the cell door (0 tiles) and the
shower room at `(9,21)` (6 tiles), non-overlapping, sixty days:

```
=== ACT M: one prison, four arms, seed 0x997, 60 days ===
  n | arm          | grant | recovered vs bare | recreation unmet | hygiene unmet | recreation min/med | hygiene min/med
  4 | bare         |   880 |                 0 |   4 of  4       |   4 of  4    |    0/   0      |    0/   0
  4 | yard only    |  1040 |               160 |   0 of  4       |   4 of  4    |  999/ 999      |    0/   0
  4 | shower only  |  1040 |               160 |   4 of  4       |   0 of  4    |    0/   0      |  985/ 990
  4 | both         |  1200 |               320 |   0 of  4       |   0 of  4    |  982/ 988      |  966/ 975
 16 | yard only    |  4160 |               640 |   0 of 16       |  16 of 16    |  936/ 985      |    0/   0
 16 | shower only  |  4160 |               640 |  16 of 16       |   0 of 16    |    0/   0      |  430/ 802
 16 | both         |  4800 |              1280 |   0 of 16       |   0 of 16    |  926/ 957      |  665/ 909
 24 | yard only    |  6240 |               960 |   0 of 24       |  24 of 24    |  785/ 957      |    0/   0
 24 | shower only  |  6240 |               960 |  24 of 24       |   0 of 24    |    0/   0      |  242/ 723
 24 | both         |  7200 |              1920 |   0 of 24       |   0 of 24    |  652/ 931      |  427/ 825
 32 | yard only    |  8320 |              1280 |   0 of 32       |  32 of 32    |  577/ 855      |    0/   0
 32 | shower only  |  8280 |              1240 |  32 of 32       |   1 of 32    |    0/   0      |    0/ 642
 32 | both         |  9600 |              2560 |   0 of 32       |   0 of 32    |  652/ 931      |  420/ 777
 40 | yard only    | 10400 |              1600 |   0 of 40       |  40 of 40    |  512/ 823      |    0/   0
 40 | shower only  |  9880 |              1080 |  40 of 40       |  13 of 40    |    0/   0      |    0/ 595
 40 | both         | 12000 |              3200 |   0 of 40       |   0 of 40    |  652/ 893      |  238/ 777
 50 | bare         | 11000 |                 0 |  50 of 50       |  50 of 50    |    0/   0      |    0/   0
 50 | yard only    | 13000 |              2000 |   0 of 50       |  50 of 50    |  412/ 718      |    0/   0
 50 | shower only  | 12720 |              1720 |  50 of 50       |   7 of 50    |    0/   0      |    0/ 607
 50 | both         | 14680 |              3680 |   0 of 50       |   8 of 50    |  229/ 853      |    0/ 644
```

(Verbatim, with two whole populations — n = 8 and n = 12 — and the four `bare`
rows for n = 16, 24, 32 and 40 removed. The elided rows hold no surprise: at 8
and 12 every arm that provides a need serves it `0 of n`, and each elided `bare`
row is `40 × n × 2` below its population's `both` row. Run the command in the
table above for all of them.)

**Every arm that provides a yard reads `0 of n` for `recreation`; the arms that
provide a shower room do not read `0 of n` for `hygiene`.** In one prison, on
one seed, at one day count: `room.yard` at its authored minimum serves every
population the issue names; `room.shower-room` at its authored minimum stops at
32.

**And the two do not fight much.** At n=50 the "both" arm leaves 8 of 50 short
of `hygiene` against "shower only"'s 7 — one prisoner, inside
[§1.3](#13-measured--the-boundary-holds-on-three-seeds)'s band — even though the
yard and the shower room share the 1,800..2,000 and 2,100..2,300 blocks. The
grant arithmetic is exact throughout: 14,680 is `50 × 300 − 40 × 8`.

### The two rules, and how much sharper the hygiene one is

| | `recreation` | `hygiene` |
| --- | --- | --- |
| Authored-minimum room | `room.yard`, 8×8 outdoors | `room.shower-room`, 3×3 enclosed, 2 heads |
| Places it gives | **4** (`floor(64/16)`, floor area) | **2** (summed width of its `'hygiene'` objects) |
| What it costs | **0** minor units, 0 work | **1,025** minor units, 640 work |
| Population one room serves | about **70** (#997 act G: 0 short at 50, 60, 70; 1 at 80) | about **24** (0 short at 4..24 on seed `0x997`, and at 16 and 24 on all three; 1, 0 and 4 short at 32) |
| Places needed at n=50 | 4 — one yard (#997 act A) | 4 — two rooms or four heads (act K) |
| Places needed at n=100 | 8 — two yards (#997 act C) | **6** — six heads (act K) |
| Visit length | 100 ticks (`minDurationTicks`) | 42 ticks measured (`minDurationTicks` 30) |
| Category window a day | 600 ticks | 500 ticks |
| Visits one room delivers | about 20/day, flat in n | about 22/day, flat in n |

**So #997's rule of thumb has an analogue and it is sharper by room, not by
place.** #997's is *"one 8×8 per fifty prisoners"*. The analogue this pass
supports is **"two 3×3 shower rooms — four heads — per fifty prisoners, and six
heads per hundred"**. Per authored-minimum *room* the shower is about **2.5 to 3
times** sharper: one room for 24 against one yard for 70. Per *place* it is not
sharper at all — 4 places serve 50 for either need, and at a hundred hygiene
wants **fewer** places than recreation (6 against 8), because a shower visit is
42 ticks against the yard's 100 and turns its places over faster.

**Which corrects the shape of the concern this pass was given.** The brief's
premise was that hygiene is worse *because its ceiling is floor area*. It is
not: `room.shower-room` is not an `openArea` room, `openGroundCapacityOf` is
never consulted for it, and `concurrentUseCapacityFor(instance, 'hygiene')`
answers from the objects — which act K demonstrates by moving that ceiling from
2 to 8 with heads alone, in a rectangle that never changes. The real asymmetry
is that **the authored minimum hands the player four places for nothing and two
places for 1,025**, and that is a content decision (`room.yard`'s `minWidth: 8`
and `room.shower-room`'s `minQuantity: 2`) rather than a ceiling mechanism.

---

## 4. MEASURED — the player cannot find out, and the code says so itself

**Confirmed, and with a stronger citation than a grep.** The projection layer
states the gap in its own docblock,
`src/simulation/presentation/room-projection.ts:216-242`, about
`RoomOccupancyViewModel.capacity`:

> The concurrent-use figure is **not projected at all yet**, and that is a
> gap rather than a decision: it is the Rooms tab readout ADR 0028 phase 5
> owes, along with "over capacity" -- which this shape still cannot say,
> because `free` clamps at zero and `utilization` clamps at 1.

So the number that decides every row in this record — a shower room's two places
against fifty prisoners — has no path to a panel at all.

The two contention counters have no reader either:

```
$ grep -rn "unmetDemandCycles\|contendedSubstitutionCycles" src/ui src/main.ts src/rendering src/simulation/presentation
exit=1
$ grep -rln "unmetDemandCycles\|contendedSubstitutionCycles" src/ tests/
src/simulation/prisoners/action-system.ts
src/simulation/prisoners/actions.ts
src/simulation/prisoners/components.ts
tests/research/2026-09-05-yard-at-scale.research.ts
tests/browser/playtest-2026-09-04-why-they-stack.playtest.ts
tests/determinism/contended-scan-order.test.ts
tests/integration/needs-state-grant-loop.test.ts
tests/integration/canteen-shape-hunger-comparison.test.ts
tests/integration/contended-canteen-substitution-cost.test.ts
tests/integration/laundry-work-and-empty-blocks.test.ts
tests/integration/unzoned-target-mid-journey.test.ts
tests/integration/dead-room-no-doorway.test.ts
tests/integration/room-gated-needs.test.ts
tests/integration/contended-shower-fairness.test.ts
tests/unit/prisoners-substitution-cost.test.ts
tests/unit/prisoners-action-system.test.ts
tests/unit/prisoners-free-association.test.ts
tests/unit/prisoners-action-catalog.test.ts
tests/unit/prisoner-slot-recycling.test.ts
tests/unit/prisoners-concurrent-room-use.test.ts
```

`ActionSystem.getMetrics()` is called by `tests/helpers/determinism-state.ts`
and by nothing under `src/`. (`routeFailures` *does* appear in
`src/simulation/presentation/incident-projection.ts:72` and `:145` — that is
`IncidentResponseSystem`'s counter of responders who could not reach an
incident, a different system's number that happens to share the name.) **#997's
grep is confirmed on this branch.**

**What the player does see, and when.** The Regime panel draws need bars: the
roster row draws each prisoner's *worst* need
(`src/ui/hud/regime-panel.ts:1370-1372`) and the inspector draws all six
(`:1639`, `:1659`), each carrying `data-need-unmet` from
`PrisonerNeedViewModel.unmetForStateIncome`, which the projection computes as
`isNeedUnmetForStateIncome(level)`
(`src/simulation/presentation/prisoner-projection.ts:303`) — the same predicate
the money uses. The Rooms panel says what a room is *missing*
(`src/ui/simulation-room-needs.ts`), meaning unplaced objects, and
`missingCapability` for a shower room with its two authored heads is **0**: a
room that is too small for the population is a *finished* room by that readout.

**So the answer to the issue's fourth question is yes, and the shape the issue
guessed is right.** The only signal is a per-prisoner bar turning `warning` at
the moment the state starts withholding — which is after the money is lost, on
one prisoner at a time, with no number anywhere saying that the room has two
places and forty people want them. **This is where the finding is a question and
not a proposal**, per `docs/AGENT_WORKFLOW.md` §3: what a player *should* be
shown is a design decision, ADR 0028 phase 5 already owns the readout, and
nothing this pass measured says which of the available numbers belongs on a
panel.

---

## 5. MEASURED — the class has exactly two members, and #997 named both

**Act H** derives the census by walking `DEFAULT_ACTIONS` and partitioning
`NEED_IDS`, rather than by quoting #997:

```
=== ACT H: which needs are served only through a `room-catalog-id` target ===
  action                            | target kind        | room               | capability       | needs served
  action.sleep                      | own-accommodation  | -                  | sleep-surface    | sleep+2/tick  [minDuration 200]
  action.eat-meal                   | room-catalog-id    | room.canteen       | dining           | hunger+4/tick  [minDuration 40]
  action.eat-in-cell                | own-accommodation  | -                  | -                | hunger+3/tick  [minDuration 40]
  action.use-toilet                 | own-accommodation  | -                  | sanitation       | bladder+5/tick  [minDuration 10]
  action.shower                     | room-catalog-id    | room.shower-room   | hygiene          | hygiene+4/tick  [minDuration 30]
  action.yard-recreation            | room-catalog-id    | room.yard          | -                | recreation+3/tick  [minDuration 100]
  action.common-room-recreation     | room-catalog-id    | room.common-room   | recreation       | recreation+2/tick  [minDuration 80]
  action.classroom-education        | room-catalog-id    | room.classroom     | education        | recreation+1/tick  [minDuration 120]
  action.free-association           | own-accommodation  | -                  | -                | (none)  [minDuration 60]
  action.laundry-work               | room-catalog-id    | room.laundry       | laundry          | hygiene+1/tick  [minDuration 120]
  action.kitchen-work               | room-catalog-id    | room.kitchen       | food-preparation | hunger+1/tick  [minDuration 120]
  action.carry                      | job-board          | -                  | -                | (none)  [minDuration 5]

  need       | decay/tick | levels lost per day | providers by target kind
  hunger     | 0.05       | 120                 | room-catalog-id: action.eat-meal, action.kitchen-work  ||  exempt: action.eat-in-cell (own-accommodation)
  sleep      | 0.03       | 72                  | room-catalog-id: (none)  ||  exempt: action.sleep (own-accommodation)
  hygiene    | 0.02       | 48                  | room-catalog-id: action.shower, action.laundry-work  ||  exempt: (NONE -- every provider meets a ceiling)
  bladder    | 0.08       | 192                 | room-catalog-id: (none)  ||  exempt: action.use-toilet (own-accommodation)
  safety     | 0.05       | 120                 | room-catalog-id: (none)  ||  exempt: (NONE -- every provider meets a ceiling)
  recreation | 0.015      | 36                  | room-catalog-id: action.yard-recreation, action.common-room-recreation, action.classroom-education  ||  exempt: (NONE -- every provider meets a ceiling)

  MEMBERS OF THE CLASS (a need with at least one provider, and no provider outside `room-catalog-id`): ["hygiene","recreation"]
  NEEDS NO ACTION SERVES AT ALL (so outside the class for a different reason): ["safety"]
  TARGET KINDS PRESENT IN `DEFAULT_ACTIONS`: ["job-board","own-accommodation","room-catalog-id"]
```

**`["hygiene","recreation"]`, derived. There is no third member and #997's
sentence is confirmed.** Three refinements it did not carry, all of which the
derivation makes visible and a quotation would not:

1. **`hygiene` has a second gated provider.** `action.laundry-work` targets
   `room.laundry` and gains `hygiene` at **1** a tick against `action.shower`'s
   4 (`src/simulation/prisoners/actions.ts:282-283`; the reasoning is in
   `washing-machine-brick`'s docblock,
   `src/simulation/construction/definition.ts`). #997's §5 table names only the
   shower room. It does not change the class — `room.laundry` is a
   `room-catalog-id` target and meets the same ceiling — but *"the shower room
   is hygiene's only provider"* would be false, and the laundry's ceiling is 4
   for its two authored 2-wide machines. **No act in this pass builds one**; see
   [§8](#8-what-was-not-measured-and-why).
2. **There is a third exempt target kind.** `claimUseIfNeeded`'s line is
   `if (action.target.kind !== 'room-catalog-id') return true;`
   (`src/simulation/prisoners/action-system.ts:1157`), and `job-board` —
   `action.carry`'s target — is exempted by it alongside `own-accommodation`.
   The comment immediately above that line already says so and gives the
   stronger reason (the job's `available → assigned` transition *is* the claim,
   ADR 0093). `action.carry` serves no need, so it does not affect the census;
   the census sentence *"exempt: `own-accommodation`"* would nonetheless be
   wrong.
3. **`safety` is outside the class for a different reason from the other
   three.** It is not that some provider escapes the ceiling — **no action
   serves it at all**; it comes from guard coverage. So the partition is not
   "three gated, three exempt" but *two gated, three exempt, one served by no
   action*.

**Why the two members are not symmetric, in the constants act H prints.**
`hygiene` decays at 0.02 a tick — 48 whole levels a day — against `recreation`'s
0.015, or 36. And a shower restores 4 a tick over a measured 42-tick visit, so
about 168 levels, where a yard restores 3 a tick over exactly 100 and fills
anyone from 0 to `NEED_MAX`. So a yard visit holds a prisoner for 5.67 days and
a shower visit for about 3.5, and the hygiene population needs its rooms
**1.6 times** as often.

---

## 6. What the measurement suggests, written nowhere but here

By instruction, none of this is in code. Each is a decision for the owner, and
each is separable from the others.

1. **`room.shower-room`'s authored minimum is the number to look at, not
   `TILES_PER_OPEN_GROUND_PLACE`.** `minQuantity: 2` for `object.shower-head`
   (`src/content/room-catalog.ts:131`) is what makes one finished shower room
   serve 24 people. Raising it to 4 would cost 1,105 instead of 1,025 and would
   make the Rooms panel's *"missing"* readout carry the information a player
   currently cannot get anywhere. **What it would buy is measured only for a
   room this pass did not build:** act K reads four places as enough for fifty
   in a 5×5 room 13 tiles from the door, and whether four heads fit
   `room.shower-room`'s authored 3×3 and behave the same 6 tiles from the door
   is not measured here. It would also make an early prison's first shower room
   more expensive, which is a balance question and the owner's.
2. **The distance result deserves an issue of its own and probably a fix that
   is not about hygiene.** A room 6 tiles from the cell door serves *fewer*
   people than the same room 17 tiles away, at every population where either
   fails. Whatever the mechanism turns out to be, a player who puts the wash
   block next to the wing and is punished for it is being taught the wrong
   lesson, and #997's opposite finding for the yard — *"Ground next to the door
   is worth about four times ground across the map"* — means the game currently
   rewards adjacency for one member of the class and penalises it for the other.
3. **`action.shower`'s 30-tick minimum against `action.yard-recreation`'s 100.**
   The shower's short visit is why six places serve a hundred where the yard
   needs eight; it is also why the queue turns over fast enough to be sensitive
   to arrival order. Nothing here says either number is wrong.
4. **Nothing in this record argues for changing
   `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` or its docblock.** #997's
   proposed replacement text stands as it was written; the only sentence #1003
   would add to it is that the same paragraph's promise about a cheap repair is
   true for the yard and costs 1,025 for the shower room.

---

## 7. What this record does not claim, and my weakest claim

- **It does not claim a player builds this prison.** A fifty-bed cell with one
  toilet and a 3×3 shower room six tiles from its door is what this fixture
  builds; every number here is a number about that prison.
- **It does not claim the boundary is a curve.** It claims the boundary. Nobody
  is short at 24 on three seeds and somebody is short at 32 on two of three, and
  that is the whole of the shape claim [§1.3](#13-measured--the-boundary-holds-on-three-seeds)
  supports.
- **It does not claim the distance effect is understood.** It is measured at
  three distances at one population and reproduced at a fourth point in act K;
  the mechanism named in [§1](#1-measured--one-shower-room-serves-twenty-four-and-not-thirty-two)
  is a candidate with a stated test, not a diagnosis.
- **It does not claim `hygiene` is invisible to the player.** It claims the
  diagnostics *this pass used* have no reader and the concurrent-use ceiling is
  not projected. A prisoner's `hygiene` bar is on the Regime panel and turns
  `warning` at the threshold; what is missing is anything that says *why* or
  *how many*.

**My weakest claim, and what would change my mind.** That sixty days is a fair
readout. Act N shows the near arm oscillating between 7 and 14 short at n=50
from day 40 to day 140 with no convergence, so every single-population figure in
§1, §2 and §3 is one sample of a band, and act O shows the seed-to-seed spread
at one population to be as wide as the change between populations. What would
change my mind about any *ordering* in this record — near against far, one room
against two, yard against shower room — is the same comparison averaged over
five seeds at 140 days showing the order flipping. **The claims I would defend
against a re-run are the exact ones**: `recovered = (n − unmet) × 40` to the
unit in every row of acts I and J that prints both, and `["hygiene","recreation"]` from act H,
which is a derivation and not a sample.

---

## 8. What was not measured, and why

- **The laundry.** `action.laundry-work` is `hygiene`'s second provider
  ([§5](#5-measured--the-class-has-exactly-two-members-and-997-named-both)) and
  no act builds a `room.laundry`. It gains `hygiene` at a quarter of the
  shower's rate over a 120-tick visit and sits in the `work` category, so it
  draws on the 500..1,000 and 1,300..1,800 blocks the shower cannot use — which
  makes it a plausible *second* supply line and an untested one. It is the
  single largest gap in this pass. `tests/integration/laundry-work-and-empty-blocks.test.ts`
  exists and measures something else.
- **The common room and the classroom**, for the same reason #997 left them: they
  serve `recreation` at a price, and this pass is about the cheapest repair.
- **Anything in the browser.** No `tests/browser` act was run. Every claim above
  is about the simulation kernel, which runs in the worker and does not care
  whether anything was drawn. Git LFS content was therefore not needed and
  `git lfs checkout` was not run.
- **The played economy.** [§2.1](#21-measured--the-price-and-whether-it-is-affordable)
  prices the repair against a starting treasury, not against a prison paying
  payroll and procurement over the days it takes to build. Whether a player
  *has* 2,050 at the moment fifty prisoners arrive is a different measurement and
  it is not here.
- **The second-order effect on other needs.** #997 found that a far yard
  starved four prisoners of their meals. The shower's equivalent was not looked
  for. Act I prints all six needs in every row and `hunger`, `sleep`, `bladder`
  and `safety` are `0 of n` unmet in every one of them — `recreation` is unmet
  throughout because act I builds no yard, by construction — but nothing here
  searched for a population or a distance where a shower walk would cost
  somebody a meal the way a yard walk did.
- **Any repair.** By instruction. No balance constant, no authored minimum, no
  `minDurationTicks` and no regime window is touched on this branch;
  `git diff origin/main --stat` is two files —
  `tests/research/2026-09-05-yard-at-scale.research.ts` and this note — and
  nothing under `src/` or `supabase/`.

---

## Appendix — the instrument

`tests/research/2026-09-05-yard-at-scale.research.ts`, extended rather than
duplicated, with `tests/research/vitest.research.config.ts` unchanged. Acts A–G
are #997's. **Their output was checked against what #997 published rather than
assumed unchanged:** every `=== ACT`, table row, per-need line and histogram
line in that note appears in this run's output identically, and act C's — the
one block that note condensed rather than quoted whole — matches figure by
figure (grant, places, permille, perform and travel). Acts H–O are #1003's. Neither is a gate: `vitest.config.ts` collects `tests/**/*.test.ts` and
this file is `*.research.ts`, so `pnpm test` does not run it and CI is not
charged for its eleven minutes.

The only assertions in the new acts are that the prison built is the prison
described — `refusals.count === 0` (which is also what catches two rectangles
overlapping, since `RoomZoningService.zone` refuses that), the bed count the
geometry promises, the intake filling the cell, the readout tick being a day
boundary, and act H's partition covering every entry in `NEED_IDS`. A run that
passes is a run whose printed table can be trusted; a run that fails printed a
table about some other prison.
