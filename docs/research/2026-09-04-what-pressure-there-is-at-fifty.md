# What pressure there is at fifty — 2026-09-04

**IN PROGRESS.** Acts B and P are measured and written up below. Acts F, G and
Y are not yet run; every section that names them is a placeholder. This file is
committed in this state deliberately: a container restart already destroyed one
set of readings for this task that lived only in a transcript.

Asked because the owner ruled it. The four-prisoner measurement — the note
named `2026-09-04-what-pressure-there-is.md` in this directory on branch
`measure/what-pressure-there-is` (PR #971; named without a rooted path because
that branch is unmerged and `tests/foundation/documentation-links-contract.test.ts`
fails on a dangling one) — closed by naming its own open item: *"every ratio
here is at `n = 4`, so a fifty-prisoner prison is unmeasured and it is the one
balance actually needs."* Shown those numbers the owner ruled: restore
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` from `0` to `40`, **but
measure at fifty prisoners first.** This is that measurement.

Played through
`tests/browser/playtest-2026-09-04-what-pressure-there-is-at-fifty.playtest.ts`
at **1440×900**, on this branch merged with `origin/main` at v0.0.467
(`36a5644c`). Nothing in CI collects that file
(`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`), so it is
evidence and never a gate. **Nothing in `src/` is changed on this branch** —
see [§0](#0-the-mutation-and-its-restore).

| act | tree | what was played | wall clock | end tick |
| --- | --- | --- | --- | --- |
| **B** the shipped curve | `withheld = 0` | 10×10 cell, **50 beds, no toilet**, 50 prisoners, **7 guards** — `ceil(50/8)`, exactly what the game asks | 758 s | 54,756 |
| **P** the penalty restored | `withheld = 40` | identical script | 728 s | 53,225 |
| **F** the break-even, penalty restored | `withheld = 40` | settle at 7, then overhire in two stages | *pending* | |
| **G** the break-even, shipped | `withheld = 0` | the same | *pending* | |
| **Y** the yard | `withheld = 40` | act P plus an 8×8 `room.yard` east of the cell | *pending* | |

---

## The answer so far, in one paragraph

**MEASURED.** Fifty prisoners *can* be housed on the ground a new prison starts
with, and it takes the whole of the reachable map to do it: a **10×10 cell, 100
tiles, fifty beds and no room for the toilet the game's own Rooms panel says the
room is missing.** It houses all fifty anyway —
`accommodationCapacity: 50`, `occupiedPlaces: 50`, `prisonersInIntake: 0`. On
the tree as shipped that prison's day-boundary treasury delta is **+14,440 at
eight consecutive boundaries**, which is `50 × 300 − 560` to the unit, and
wages are **3.7%** of income rather than the four-prisoner prison's 6.7%. The
break-even on the shipped tree is therefore **187.5 guards**, or **26.8× what
the game asks for**. **Restoring the constant the owner suspended takes that
prison from +14,440 a day to +10,440** — a **27.7% cut, not the 71% the same
change cost a four-prisoner prison**, because the composition it prices at fifty
is two unmet needs and not five. Break-even falls from 187.5 guards to 137.5,
which is still **19.6× what the game asks for**.

---

## 0. The mutation, and its restore

*Filled in when the mutated acts have run and been restored.*

```
$ sha256sum src/simulation/economy/income.ts
34a59cd222eccf85d44c9743068f57f6bf59f5c0788e2855462163fc3a612744  src/simulation/economy/income.ts
```

That is the clean hash of `src/simulation/economy/income.ts` at v0.0.467, and it
is **the same hash the four-prisoner note recorded at v0.0.465** — the file did
not move between the two measurements, which is worth one line because it means
the two records price the same code.

---

## 1. MEASURED — fifty can be housed, on a cell the game says is not ready

**This is the finding the brief that commissioned this measurement expected to
be a refusal.** It asked: *"If fifty cannot be housed, that is the finding —
report it as one."* Fifty can be housed. It takes exactly the largest rectangle
the pointer can enclose at 1440×900 and it leaves no tile over.

**Reproduction** (act B). New prison → Build → buy 90 bricks, 50 planks → four
wall drags enclosing tiles (12,11)–(21,20) → designate `room.cell` → fifty bed
presses, five to a column, ten columns → Admit ×50 → Security → Hire Guard ×7 →
run seven in-game days.

The map arithmetic, measured rather than assumed:

```
[B50] calibration: tile (0,0) top-left = (-304, -574)
[B50] the cell is 10x10 = 100 tiles, perimeter 40 segments
[B50] wall run north from (496,130) to (1072,130): 10 command(s)
[B50] wall run south from (496,770) to (1072,770): 10 command(s)
[B50] wall run west from (464,162) to (464,738): 10 command(s)
[B50] wall run east from (1104,162) to (1104,738): 10 command(s)
[B50] designate cell attempt 1: rooms=1
[B50] 50 bed order(s) placed, 0 press(es) produced nothing
[B50] furnished: rooms=1 roomCapacity=50 accommodationCapacity=50 funds=18150
```

Forty wall segments, ten per run, **no drag refused** — and the calibration is
the same `(−304, −574)` the four-prisoner file and issue #957 both measured, so
the reachable window is unchanged. **The brief carried issue #957's "the reachable clear
area is 12×11" as though it bounded this build, and it does not — it is a
different quantity, and the difference is exactly what decides whether fifty
fit.** #957 measured, with `document.elementFromPoint`, which tile *centres* are
clear of the HUD: `x = 11..22, y = 11..21`, twelve by eleven, which is the
rectangle an *object* can be placed in. A wall is drawn on a tile *edge*, so
walling a rectangle needs its **outer** edges reachable too — and column 11's
west edge is at `−304 + 64×11 = 400`, under `.hud__corner` (`x < 422`), while
row 21's south edge is at `−574 + 64×22 = 834`, under `.hud__tabs` (`y > 831`).
The enclosable rectangle is therefore strictly inside the clear one: **cols
12–21, rows 11–20, ten by ten.** Both figures are right about their own
question, and #957 is not corrected by this — the *enclosable* area is simply a
thing it did not measure. Ten by ten is
exactly a hundred tiles, which is exactly fifty beds, because `object.bed` is
`{ width: 1, height: 2 }` (`src/content/object-catalog.ts:97`) and
`residentCapacity` is the summed footprint *width* of the sleep surfaces in the
room (`deriveRoomCapacity`, `src/simulation/objects/room-capacity.ts:185`).
A hundred tiles at one place per two tiles is fifty places, and there is no
hundred-and-first tile for a toilet.

**So the prison the game reports as unfinished is the prison that houses
fifty.** The Rooms panel at the end of the build, verbatim:

> NOT READY · 1 of 1 · **Cell at 12, 11 is missing 1 × Toilet** · NEEDS AT
> LEAST 2 × 3 TILES · MUST BE ENCLOSED · NEEDS 1 × BED · **NEEDS 1 × TOILET** ·
> ENCLOSURE · Walled in on every side

and the fifty Admit presses were all accepted:

```
[B50] pressed Admit 50 time(s)
[B50] admitted 50 of 50
```

`accommodationCapacity: 50`, `roomCapacity: 50`, `occupiedPlaces: 50`,
`roomOccupants: 50`, `prisonersInIntake: 0` at every sample from tick 33,600 on.
That is `RoomZoningService.zone` enforcing size, bounds, ownership, overlap and
enclosure and **not** the catalogue's `object` requirements, and
`findAvailableResidence` asking only for the room type, an occupancy count and
a `'sleep-surface'` capability — VERIFIED, read, and now MEASURED: fifty people
live in a room the panel calls *not ready*.

---

## 2. MEASURED — the shipped curve at fifty is +14,440 a day, and the floor is gone

The day-boundary treasury, off `simulation/status-counts`. The build ran with
the clock at 4×, so the prison was already at in-game day 14 when the fiftieth
prisoner was housed — the boundaries below are absolute and the population is
printed beside each one, which is the only way to read this curve.

| boundary | tick | treasury | delta | places | staff | wage bill |
| --- | --- | --- | --- | --- | --- | --- |
| day 8 | 19,200 | 18,150 → 19,350 | +1,200 | 4 | 0 | 0 |
| day 9 | 21,600 | 19,350 → 22,950 | +3,600 | 12 | 0 | 0 |
| day 10 | 24,000 | 22,950 → 28,950 | +6,000 | 20 | 0 | 0 |
| day 11 | 26,400 | 28,950 → 37,350 | +8,400 | 28 | 0 | 0 |
| day 12 | 28,800 | 37,350 → 48,150 | +10,800 | 36 | 0 | 0 |
| day 13 | 31,200 | 48,150 → 61,050 | +12,900 | 43 | 0 | 0 |
| day 14 | 33,600 | 61,050 → 76,050 | +15,000 | **50** | 0 | 0 |
| day 15 | 36,000 | 75,570 → 90,090 | +14,520 | 50 | 6 | 480 |
| day 16 | 38,400 | 90,010 → 104,450 | **+14,440** | 50 | **7** | **560** |
| day 17 | 40,800 | 104,450 → 118,890 | **+14,440** | 50 | 7 | 560 |
| day 18 | 43,200 | 118,890 → 133,330 | **+14,440** | 50 | 7 | 560 |
| day 19 | 45,600 | 133,330 → 147,770 | **+14,440** | 50 | 7 | 560 |
| day 20 | 48,000 | 147,770 → 162,210 | **+14,440** | 50 | 7 | 560 |
| day 21 | 50,400 | 162,210 → 176,650 | **+14,440** | 50 | 7 | 560 |
| day 22 | 52,800 | 176,650 → 191,090 | **+14,440** | 50 | 7 | 560 |
| day 23 | 55,200 | 191,090 → 205,530 | **+14,440** | 50 | 7 | 560 |

`50 × 300 − 560 = 14,440`, exactly, at **eight** consecutive boundaries.
`unpaidWagesMinorUnits: 0` throughout. Every day-14-and-later `impliedDailyGrant`
— the accrual divided back out of the last sample before the boundary — reads
`15,000` or `14,999`, so the grant is the full 300 a place with nothing withheld.

**And the guard floor the four-prisoner acts were dominated by is gone, exactly
as the brief predicted.** `resolveOccupancyScaledGuardCount` is
`Math.max(scheduledGuardCount, Math.ceil(occupantCount / 8))` with a schedule
floor of one (`src/simulation/security/sector-staffing.ts:190`), so at fifty it
asks for `ceil(50/8) = 7` and the `max` is decided by the occupancy term rather
than the floor. Measured: `GUARD COVERAGE 7 of 7 Covered`,
`dailyWageBillMinorUnits: 560`, and

| | four prisoners | **fifty prisoners** | the asymptote |
| --- | --- | --- | --- |
| guards the game asks for | 1 | **7** | `n/8` |
| guards per prisoner asked | 0.25 | **0.14** | 0.125 |
| state income | 1,200 | **15,000** | `300n` |
| wage bill | 80 | **560** | `80n/8` |
| **wages as a share of income** | 6.7% | **3.7%** | 3.33% |
| break-even guard count | 15 | **187.5** | `3.75n` |
| **headroom over what the game asks** | **15×** | **26.8×** | 30× |

So the brief's *"at fifty, `ceil(50/8) = 7` should dominate the floor. Whether
it does is the measurement"* — it does, and the headroom it produces is 26.8×
rather than the 30× of the asymptote, because seven is `ceil(6.25)` and the
rounding up is still worth 12% of the wage bill.

---

## 3. MEASURED — at fifty the composition is two of six unmet, not five

This is the four-prisoner finding that **did not survive**, and it moves the
whole answer, because it is what the restored penalty prices.

The need inspector over all fifty prisoners at tick 54,835, off
`hud/prisoner-detail`'s own `unmetForStateIncome` flag rather than a reading of
a bar (`isNeedUnmetForStateIncome(level)` is `level <= 51` on the 0–255 scale
`NeedsComponent.get` works in, `src/simulation/economy/income.ts:425`):

```
[B50] FINAL   unmetNeedCount histogram: ["50 prisoner(s) at 2 unmet"]
[B50] FINAL   bladder:    unmet for  0 of 50  permille min=855 median=937 max=1000
[B50] FINAL   hunger:     unmet for  0 of 50  permille min=902 median=933 max=980
[B50] FINAL   hygiene:    unmet for 50 of 50  permille min=0   median=0   max=0
[B50] FINAL   recreation: unmet for 50 of 50  permille min=0   median=0   max=0
[B50] FINAL   safety:     unmet for  0 of 50  permille min=1000 median=1000 max=1000
[B50] FINAL   sleep:      unmet for  0 of 50  permille min=792 median=988 max=1000
```

**Every one of the fifty is at exactly two unmet needs** — `hygiene` and
`recreation`, the two the prison has no room for — and `hunger`, `sleep` and
`bladder` are all *served*, at 855 permille and up. The four-prisoner acts
measured **five of six at zero on every prisoner in every act**, `bladder`
among them, in a cell that *had* a toilet standing in it. This prison has no
toilet at all and `bladder` reads 937 permille median.

That is a straight refutation of the composition, and it is the number the
penalty multiplies: at two unmet needs the schedule pays **220** a place, not
the 100 the four-prisoner acts settled at.

**What would establish the cause, stated separately** (`docs/AGENT_WORKFLOW.md`
§3). The four-prisoner note's §8 proposed a ratchet: needs decay → a riot opens
→ `RIOT_ALLOWED_CATEGORIES` replaces every participant's day with
`['free-association', 'recreation']`, which serves nothing → needs stay at zero
→ the next riot opens. This act's event channel is consistent with that being
the four-prisoner mechanism and **absent here after the guards arrive**:

```
[B50] ===== 30 simulation/event(s), by type =====
[B50] event incidents.all-clear-after-lapse x15
[B50] event incidents.assault-opened      x13
[B50] event incidents.riot-opened          x2
```

Both riots — `participantCount` **40** and **50** — opened at ticks 30,202 and
35,002, which is *before* the seventh guard was hired at about tick 36,000 and
while `prisonersUnguarded` was 50 and `safety` was decaying. **After the prison
was staffed, thirteen assaults opened and not one riot.** An assault does not
carry the riot regime, which is the difference this record can point at; it did
not test the path, so the ratchet remains an inference and this is a
measurement consistent with it rather than proof.

### 3.1 MEASURED — `safety` still saturates at fifty, and the reading that says otherwise is a transient

The brief asked: *"At fifty with seven guards, is safety still saturated for
everyone, or does a sector's return get spread thin?"* **Saturated: 1000
permille, `unmet: false`, on all fifty.** The return is not spread thin at all.

That is worth stating with its refutation attached, because this act took the
opposite reading first. Immediately after the seven hires, at tick 36,979:

```
[B50] READY   unmetNeedCount histogram: ["11 prisoner(s) at 0 unmet","8 at 1","12 at 2","19 at 3"]
[B50] READY   safety: unmet for 39 of 50 permille min=110 median=153 max=878
```

**Thirty-nine of fifty unsafe, with `COVERAGE 50 · Covered`,
`prisonersCovered: 50`, `prisonersUnderstaffed: 0` and `prisonersUnguarded: 0`
on the same sample.** That is not a contradiction and it is not a spread-thin
effect: the prison had spent its whole 523-second build and intake with **zero**
guards, so `safety` had decayed at 0.05 a tick the entire time, and the reading
is taken 800 ticks into a recovery that runs at a net +0.03 a tick
(`SAFETY_COVERAGE_PROVISION_PER_TICK`, `src/simulation/prisoners/needs.ts`). By
the final reading, 17,900 ticks later, it is full on everyone.

**A reading of `safety` taken in the first thousand ticks after hiring is a
reading of the build phase, not of the staffing** — and it would have supported
exactly the wrong conclusion. It is recorded because it is the strongest
available demonstration that this instrument's `READY` samples are not
settled-state samples, and every settled claim in this file is from a `FINAL` or
`SETTLED` one.

---

## 4. MEASURED — restoring the constant costs this prison 27.7% of its daily gain

**Reproduction** (act P). Act B's script exactly, on the mutated tree.

| boundary | tick | treasury | delta | places | staff | implied grant | implied price per place |
| --- | --- | --- | --- | --- | --- | --- | --- |
| day 13 | 31,200 | 54,870 → 67,290 | +12,420 | 49 | 0 | 12,420 | 253 (mixed) |
| day 14 | 33,600 | 66,970 → 78,490 | +11,520 | **50** | 4 | 11,840 | 237 (mixed) |
| day 15 | 36,000 | 78,250 → 89,010 | +10,760 | 50 | **7** | 11,319 | 226 (mixed) |
| day 16 | 38,400 | 89,010 → 100,690 | +11,680 | 50 | 7 | 12,240 | 245 (mixed) |
| day 17 | 40,800 | 100,690 → 111,770 | +11,080 | 50 | 7 | 11,679 | 234 (mixed) |
| day 18 | 43,200 | 111,770 → 122,450 | +10,680 | 50 | 7 | 11,239 | 225 (mixed) |
| day 19 | 45,600 | 122,450 → 132,890 | **+10,440** | 50 | 7 | **10,999** | **220** |
| day 20 | 48,000 | 132,890 → 143,330 | **+10,440** | 50 | 7 | 10,999 | 220 |
| day 21 | 50,400 | 143,330 → 153,770 | **+10,440** | 50 | 7 | 11,000 | 220 |
| day 22 | 52,800 | 153,770 → 164,210 | **+10,440** | 50 | 7 | 11,000 | 220 |

`50 × 220 − 560 = 10,440`, exactly, at **four** consecutive boundaries, and
**220 is the third row of the schedule** `300, 260, 220, 180, 140, 100, 60` —
the row for **two** unmet needs. The need inspector at tick 53,225 reads the
same composition act B's did, to the flag:

```
[P50] FINAL   unmetNeedCount histogram: ["50 prisoner(s) at 2 unmet"]
[P50] FINAL   hygiene:    unmet for 50 of 50  permille min=0    median=0   max=0
[P50] FINAL   recreation: unmet for 50 of 50  permille min=0    median=0   max=0
[P50] FINAL   bladder:    unmet for  0 of 50  permille min=522  median=929 max=1000
[P50] FINAL   hunger:     unmet for  0 of 50  permille min=702  median=965 max=1000
[P50] FINAL   safety:     unmet for  0 of 50  permille min=1000 median=1000 max=1000
[P50] FINAL   sleep:      unmet for  0 of 50  permille min=898  median=984 max=1000
```

**So the direct comparison, at a need composition both trees were measured
showing** — which is what the four-prisoner note had to fall back on, and here
it is available at the settled state of both acts rather than as a rescue:

| | shipped (`withheld = 0`) | restored (`withheld = 40`) | at four prisoners, restored |
| --- | --- | --- | --- |
| unmet needs, every prisoner | **2 of 6** | **2 of 6** | 5 of 6 |
| state income per place | 300 | **220** | 100 |
| state income, 50 places | 15,000 | **11,000** | *(1,200 → 400 at 4)* |
| wages, 7 guards | 560 | 560 | *(80 at 1)* |
| **daily delta** | **+14,440** | **+10,440** | *(+1,120 → +320 at 4)* |
| **the cut the penalty makes** | — | **27.7%** | **71%** |
| wages as a share of income | 3.7% | **5.1%** | 20% |
| break-even guard count | 187.5 | **137.5** | 1.25 per prisoner |
| **headroom over what the game asks** | **26.8×** | **19.6×** | 5× |

**This is the answer the ruling needs and it is not the four-prisoner answer.**
At four prisoners the restored penalty was a 71% cut and took the headroom from
15× to 5×. At fifty it is a **27.7%** cut and takes the headroom from 26.8× to
**19.6×** — so the constant the owner is restoring bites *less* at the
population balance actually cares about, not more, and it does so for a
measured reason: a fifty-prisoner prison built to the limit of the map serves
three of the six needs by accident.

**Refuting sample.** *Is +10,440 a slow stretch rather than a floor?* Four
consecutive boundaries at exactly +10,440 with the histogram unchanged at
`50 prisoner(s) at 2 unmet`, and the next row of the schedule down (180, three
unmet) needs a need to fail that nothing in this prison is threatening —
`bladder`'s worst reading is 522 permille against a 200-permille line. The four
non-repeating deltas before it (11,520, 10,760, 11,680, 11,080, 10,680) are the
composition still walking down, and each one's `impliedDailyGrant` divides to a
price between two schedule rows, which is what a mixed population looks like.
**A sign or a ratio measured inside that walk is a statement about a moving
income line and not about the wage bill** — which is why acts F and G settle
first and only then overhire.

### 4.1 The one incident difference between the two trees is not the trees

Act P's event channel: 32 events, `all-clear-after-lapse` ×16,
`assault-opened` ×15, `riot-opened` ×1 (tick 30,001, `participantCount` 45).
Act B's: 30 events, ×15, ×13, ×2 (ticks 30,202 and 35,002, participants 40 and
50). **Both trees: every incident closed by lapse, not one by containment, at
the seven guards the game asks for** — which is the four-prisoner note's §5.1
reproduced at fifty, and the mechanism it read is unchanged
(`GUARD_ROSTER`'s unassigned pool is empty at `0 free`). The riot counts differ
by one and both acts' riots opened *before* the guards were hired; that is not
a difference between the trees, it is where in the build the RNG put a riot.

**The instrument predicted no riots at all here** — its `printEvents` docblock
carries `DEFAULT_SECTOR_RISK_POLICY`'s derivation, *"two of six at zero is a
ceiling of about 0.48 on `needsPressure`, under the 0.65 line"* — and **three
riots opened across the two acts. The prediction is refuted, and its own terms
say why:** every riot opened while the prison was still filling and
`prisonersUnguarded` was 34–50, when the composition was not yet two of six and
`safety` was decaying at 0.05 a tick toward zero. The ceiling is a statement
about the *settled* prison, and it holds there: no riot opened in either act
after the seventh guard was hired.

---

## 5. Pending

Acts F, G and Y. The break-even measurements, the yard question, the mutation
restore verification, the weakest claim and the instrument failures are written
when they have run.
