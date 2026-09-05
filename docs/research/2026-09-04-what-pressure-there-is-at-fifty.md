# What pressure there is at fifty — 2026-09-04

**Complete.** All five acts — B, P, F, Y and G — are measured and written up
below; act G's shipped-tree break-even is in section 7.

*The paragraph this replaces read:* **"IN PROGRESS.** Acts B, P, F and Y are
measured and written up below. Act G — the shipped tree's break-even — is still
running. This file is committed in this state deliberately: a container restart
already destroyed one set of readings for this task that lived only in a
transcript." **That was true when written and stopped being true inside the same
session**, when act G finished and section 7 was written against it — and it
survived to the point of review, where an agent reading this note for a
different task caught the header contradicting the body. The commit-early rule
it describes is what saved this note; the stale header is the cost of that rule
and is cheaper than the alternative.

**Two figures for one quantity, and both are kept because they are not the same
quantity.** The headroom over what the game asks appears below as both **26.8×**
and **26.7×**. `26.8×` is the *arithmetic crossing* — income equals wages at
**187.5** guards, and `187.5 / 7 = 26.79`. `26.7×` is the *measured* figure —
the treasury still rose at **187** and fell at **188**, so the last hire that
pays for itself is 187, and `187 / 7 = 26.71`. The measured pair brackets the
arithmetic one, which is the agreement worth having; neither is a correction of
the other, and a reader who needs one number should take **26.8×** and say it
is the crossing.

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
(`36a5644c`). **`main` then moved under this record, to v0.0.473 (`70599d54`),
and one of the things it brought explains the largest open question in it** —
see [§6.2](#62-main-moved-under-this-record-and-answered-6s-open-question).
Every number here was taken at v0.0.467 and is left as it was read. Nothing in CI collects that file
(`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`), so it is
evidence and never a gate. **Nothing in `src/` is changed on this branch** —
see [§8](#8-the-mutation-and-its-restore).

| act | tree | what was played | wall clock | end tick |
| --- | --- | --- | --- | --- |
| **B** the shipped curve | `withheld = 0` | 10×10 cell, **50 beds, no toilet**, 50 prisoners, **7 guards** — `ceil(50/8)`, exactly what the game asks | 758 s | 54,756 |
| **P** the penalty restored | `withheld = 40` | identical script | 728 s | 53,225 |
| **F** the break-even, penalty restored | `withheld = 40` | settle at 7, then **137** guards, then **138** | 1,117 s | 49,835 |
| **G** the break-even, shipped | `withheld = 0` | settle at 7, then **187** guards, then **188** | 1,145 s | 50,600 |
| **Y** the yard | `withheld = 40` | act P plus an 8×8 `room.yard`, panned east | 772 s | 55,922 |

---

## The answer in one paragraph

**MEASURED.** Fifty prisoners *can* be housed on the ground a new prison starts
with, and it takes the whole of the enclosable map to do it: a **10×10 cell, 100
tiles, fifty beds and no room for the toilet the game's own Rooms panel says the
room is missing.** It houses all fifty anyway. On the tree as shipped that
prison's day-boundary treasury delta is **+14,440 at eight consecutive
boundaries** — `50 × 300 − 560` to the unit — and **restoring the constant the
owner suspended makes it +10,440**, a **27.7% cut, against the 71% the same
change cost a four-prisoner prison.** It bites less at fifty for a measured
reason: a prison built to the limit of the map settles at **two** unmet needs
per prisoner rather than five, so the schedule prices a place at 220 instead of
100. Break-even, measured by watching the sign flip one hire at a time, is
**187 guards shipped and 137 restored** — `+40` a day at each, `−40` at one
more — which is **26.7×** and **19.6×** what the game asks for. And the repair
the mechanic was designed to reward returns nothing: an 8×8 yard, zoned first
attempt on owned ground, leaves the settled delta at **+10,440**, identical to
the prison without one, with `recreation` at **0 permille on all fifty**.

**One fact conditions all of it, and it was not known while the acts ran.**
Every act's cell is walled on four sides with **no doorway**, because neither
instrument ever builds a door — and issue #938's fix, which landed on `main` in v0.0.472
(`c6e89146` — absent at v0.0.471, present at v0.0.472) while this was being
measured, is a controlled measurement that **a
sealed room with no doorway is dead**: two prisons differing by one edge, and
`hygiene` after ten days reads 254.8/255 with a door and **0** without. That is
the exact signature of the two unmet needs measured here, and it means the
composition this record prices — `hygiene` and `recreation` at 0 on all fifty —
is **a dead cell's composition**, not a well-built prison's. It is still the
composition a player gets from the prison the game's own readouts call finished,
which is #938's whole point; but a prison with a door would settle somewhere
else and the penalty would cost it something else
([§6.2](#62-main-moved-under-this-record-and-answered-6s-open-question)).

**So the shape of the answer at fifty is the opposite of the four-prisoner
one.** There, restoring the penalty created a sharp staffing pressure — the
overhire a prison survived fell from sixteen guards to six — and the yard was a
real, cheap, measurable repair. Here the penalty moves break-even from 187
guards to 137, which no player will ever approach, and the repair does not work
at all. **The pressure the constant creates at four prisoners does not scale;
what scales is the gap between the prison that earns and the prison that
contains its incidents, and that gap is now 131 guards wide.**

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

## 5. MEASURED — the sign flips between 137 and 138 guards, with the penalty restored

**Reproduction** (act F). Act P's prison, on the mutated tree, then: run five
in-game days at the seven guards the game asks for until the delta repeats;
**pause the clock**; hire 130 more; fast-forward; watch two days; pause; hire
**one** more; watch two days.

The pause is not a convenience. A sentence is drawn uniformly from 14 to 90
in-game days (`MIN_SENTENCE_DAYS`/`MAX_SENTENCE_DAYS`,
`src/simulation/prisoners/sentence.ts`), so a prison stays fifty strong for
fourteen days after its intake and then starts discharging people — and the 130
presses cost **380 seconds of wall clock**, which at 4× is about seventeen
in-game days. This act's first attempt (recorded in the instrument's own
`pauseClock` docblock, from the session a container restart interrupted) spent
that time with the clock running and measured a **thirty-eight**-prisoner prison
without saying so.

| boundary | tick | treasury | delta | staff | free | wage bill | implied grant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| day 15 | 36,000 | 108,750 → 119,270 | +10,520 | 7 | 0 | 560 | 11,079 |
| day 16 | 38,400 | 108,870 → 108,910 | **+40** | **137** | 129 | 10,960 | 11,000 |
| day 17 | 40,800 | 108,910 → 108,950 | **+40** | 137 | 129 | 10,960 | 11,000 |
| day 18 | 43,200 | 108,950 → 108,990 | **+40** | 137 | 129 | 10,960 | 11,000 |
| day 19 | 45,600 | 108,910 → 108,870 | **−40** | **138** | 130 | 11,040 | 11,000 |
| day 20 | 48,000 | 108,870 → 108,830 | **−40** | 138 | 130 | 11,040 | 10,999 |
| day 21 | 50,400 | 108,830 → 108,790 | **−40** | 138 | 130 | 11,040 | 10,999 |

`50 × 220 − 137 × 80 = 11,000 − 10,960 = +40` and
`11,000 − 138 × 80 = −40`, each exactly, each at three consecutive boundaries,
with `unpaidWagesMinorUnits: 0` and the histogram at
`50 prisoner(s) at 2 unmet` throughout both stages.

**So the break-even with the penalty restored is 137 guards — measured, not
divided.** The hire that flips it is a single press; the day-19 boundary is the
first negative one this repository has measured on a fifty-prisoner prison. The
131 free guards cost 10,480 a day and the seven posted ones cost 560.

### 5.1 MEASURED — the hire that flips the sign is the hire that starts containing incidents, and this act settles the cause

The four-prisoner note found that the only act which contained an incident was
the only act that went broke, read it off the event *band*, and said plainly
what it could not do: *"This record **read** that docblock and did not test the
path… What would settle it: an act at 2 guards, where one is posted and one is
free."* Act F settles it better than that, because it is **one world with one
variable changed** and the event channel gives the tick.

Every `incidents.*` event act F published, in order, with the 130 hires at tick
38,104:

| assault opened | closed at | how | ticks | free guards |
| --- | --- | --- | --- | --- |
| 14,751 | 15,361 | `all-clear-after-lapse` | 610 | 0 |
| 17,151 | 17,761 | `all-clear-after-lapse` | 610 | 0 |
| 19,551 | 20,162 | `all-clear-after-lapse` | 611 | 0 |
| 21,951 | 22,561 | `all-clear-after-lapse` | 610 | 0 |
| 24,351 | 24,961 | `all-clear-after-lapse` | 610 | 0 |
| 26,751 | 27,362 | `all-clear-after-lapse` | 611 | 0 |
| 29,151 | 29,762 | `all-clear-after-lapse` | 611 | 0 |
| 31,601 | 32,211 | `all-clear-after-lapse` | 610 | 0 |
| 34,301 | 34,911 | `all-clear-after-lapse` | 610 | 0 |
| 36,701 | 37,311 | `all-clear-after-lapse` | 610 | 0 |
| *— 130 guards hired at tick 38,104 —* | | | | |
| 39,101 | 39,171 | **`all-clear`** | **70** | 129 |
| 41,501 | 41,571 | **`all-clear`** | **70** | 129 |
| 43,901 | 43,972 | **`all-clear`** | **71** | 129 |
| 46,301 | 46,371 | **`all-clear`** | **70** | 130 |
| 48,702 | 48,771 | **`all-clear`** | **69** | 130 |
| 51,101 | 51,171 | **`all-clear`** | **70** | 130 |

**Sixteen assaults, one prison, one hire between them. Every one of the ten
before it lapsed after ~610 ticks and every one of the six after it was
contained in ~70 — an 8.7× collapse in response time, with no other change to
the world.** The band changed with it, from *"the last one ran out of time
instead of being contained, and everyone caught in it was hurt"* to *"The prison
is under control again — no incident is still open."*

That is as close to a controlled experiment as this instrument can produce, and
it promotes the four-prisoner note's §5.1 from a correspondence across four
separate worlds to a **within-world** result. What it still does not do is open
`IncidentResponseSystem`; the mechanism named in `hud.security.coverage-met-hint`'s
docblock — that `claimableResponders` draws from `GuardRoster.unassignedGuardIds()`,
so a posted guard is `'travelling'` or `'on-post'` and never in the pool — is
**VERIFIED, read** and is what these ticks are consistent with.

**And the staffing sentence #941 landed is the one that is true of it.** The
Staff panel at the end of act F, verbatim:

> GUARD COVERAGE — **7 of 7** — Covered — **Only free guards answer
> incidents.** … ON DUTY — **7 held · 131 free** … ON THE PAYROLL — **11,040 a
> day**

The panel says `7 of 7 Covered` on a prison carrying 138 guards, which is
accurate (`required` is the posts a sector asks to be filled) and is exactly
what the retired sentence — *"This prison has the guards it asks for"* — made
misleading. **The four-prisoner note recorded that sentence being retired the
same day it measured the harm; this act is the first measurement taken with the
replacement on screen, and the replacement is true of what it measured.**

### 5.2 What is still not on screen at −40 a day

The chips at the day-21 boundary, three consecutive negative days in:

```
prisoners 50 | high-risk 4 | staff 138 | coverage 50 Covered | rooms 1
incidents 0 Clear | contraband 3 | funds 108,790 | earned-today (rising)
```

`FUNDS` carries no badge, the band is about an incident, and `EARNED TODAY` is a
within-day accrual that rises all day on a prison losing money. **Nothing on
this screen distinguishes +14,440 a day from −40 a day** — the same observation
the four-prisoner note made at −80, at a population and a payroll a player
would actually reach. That is an observation and not a defect claim: what a
readout must convey, and whether it should exist, is a design question.

---

## 6. MEASURED — the yard incentive is worth exactly nothing at fifty

This is the second four-prisoner finding that **did not survive**, and it is the
one the restored constant's own docblock rests an argument on:

> **The cheapest repair pays for itself in days.** `room.yard` requires no
> object at all (`src/content/room-catalog.ts`), so zoning 8x8 of owned ground
> turns `recreation` from unmet to served and returns 40 a prisoner a day for
> nothing. That is the incentive the mechanic exists to create…

At four prisoners that was measured true to the unit: `+480` against `+320`,
`480 − 320 = 160 = 4 × 40`. **At fifty it returns zero.**

**Reproduction** (act Y). Act P exactly, plus: after the build and before the
intake, press `ArrowRight` eight times, recalibrate, and zone an 8×8
`room.yard` on the bare ground the pan revealed.

The yard was zoned **on the first attempt**, and the pan is the escape issue
#957 §3 names, exercised and measured:

```
[Y50] pan round 1 (8 ArrowRight presses): origin = (-1118, -574)
[Y50] reachable columns [24,25,26,27,28,29,30,31] rows [11..21]
[Y50] the yard will be {"x0":24,"y0":11,"x1":31,"y1":18}
[Y50] YARD attempt 1: rooms=2 roomCapacity=50
```

Eight presses moved the origin 814 px, about 12.7 tiles, and the Rooms panel
before the press read `NEEDS AT LEAST 8 × 8 TILES · MUST BE OUTDOORS · NO
OBJECTS NEEDED`, with the enclosure verdict *"Open on at least one side"*
afterwards — `RoomZoningService.zone` refusing only `'enclosed'`. `rooms` went
`1 → 2`. **So a 10×10 cell for fifty and an 8×8 yard both fit in one prison;
what does not fit is both on one screen**, which is what #957 actually claims.

**And it bought nothing:**

| boundary | act P (no yard) | act Y (8×8 yard) |
| --- | --- | --- |
| settled delta | **+10,440** | **+10,440** |
| consecutive boundaries at it | 4 (days 19–22) | 3 (days 21–23) |
| implied daily grant | 10,999–11,000 | 10,999 |
| implied price per place | 220 | 220 |
| `recreation` permille, all fifty | 0 | **0** |
| `recreation` unmet for state income | 50 of 50 | **50 of 50** |
| unmet-need histogram | 50 at 2 unmet | **41 at 2, 9 at 3** |

Identical to the unit, and the histogram moved the **wrong way**: nine
prisoners are at *three* unmet needs in act Y, because `bladder` fell from a
median of 929 permille (unmet for 0 of 50) to **357** (unmet for 9 of 50).

```
[Y50] FINAL   unmetNeedCount histogram: ["41 prisoner(s) at 2 unmet","9 prisoner(s) at 3 unmet"]
[Y50] FINAL   recreation: unmet for 50 of 50  permille min=0  median=0   max=0
[Y50] FINAL   bladder:    unmet for  9 of 50  permille min=43 median=357 max=475
```

**Not one of the fifty performed `action.yard-recreation` even once**, on a
prison that has a zoned, legal, outdoor yard.

**What would establish the cause, stated separately.** Three candidates, and
the measurement rules the first one out on its own:

1. **Capacity — ruled out as a sufficient explanation.** An 8×8 yard is four
   places: `max(1, floor(width × height / TILES_PER_OPEN_GROUND_PLACE))` with
   `TILES_PER_OPEN_GROUND_PLACE = 16`
   (`src/simulation/prisoners/room-instance-registry.ts:222,341`), so 64 tiles
   is `floor(64/16) = 4`. Four places rotating among fifty people would leave
   *some* prisoners with a non-zero `recreation` reading. **All fifty read
   exactly 0**, so capacity cannot be the whole of it.
2. **Reachability — the strongest candidate, and untested.** The cell is walled
   on all four sides and **neither instrument ever builds a door** — grep for
   `door` in either playtest file returns nothing. Issue #938 records that a
   room with no doorway is dead while every readout says it works, and
   `ActionSystem` gates on exactly this: it counts *"reconsideration cycles
   where no legal action had a reachable, available target"*
   (`src/simulation/prisoners/action-system.ts:105`). A prisoner sealed in the
   cell can take the cell-side actions — which is consistent with `hunger`,
   `sleep` and `bladder` being served in every act — and can reach nothing
   else. **What would establish it: an act that builds one door in the cell's
   east wall and re-measures `recreation`.**
3. **Distance.** The four-prisoner yard was *adjacent* to its cell — cell
   (12,12)–(14,15), yard (15,12)–(22,19), sharing the wall line — and it paid.
   This one sits three tiles clear of the cell's east wall at (24,11)–(31,18),
   because the pan that makes an 8×8 reachable at all also moves the cell off
   screen. **What would separate this from (2): the same door act, with the
   yard adjacent and then far.**

**This record does not claim which.** What it claims is the number the ruling
needs: **on the prison a player can actually build for fifty, the repair the
penalty is designed to reward returns nothing, and the state's ledger says so
by paying exactly 220 a place either way.**

### 6.1 The two four-prisoner findings the brief asked about, answered

The brief asked whether the fork *"+320/day with nothing contained or −80/day
with everything contained"* still exists at fifty. **It does, and it is wider.**
The staffed-at-the-requirement prison earns **+10,440** a day with every
incident lapsing after ~610 ticks; the prison that contains them costs **131
free guards**, which is where the sign flips at −40
([§5.1](#51-measured--the-hire-that-flips-the-sign-is-the-hire-that-starts-containing-incidents-and-this-act-settles-the-cause)).
At four prisoners the gap between those two prisons was 5 guards; at fifty it
is **131**.

It also asked whether the yard incentive still pays `50 × 40`. **It pays 0**
([§6](#6-measured--the-yard-incentive-is-worth-exactly-nothing-at-fifty)) — and
the sub-question it raised, *"does one 8×8 yard even serve fifty people,"* has a
sharper answer than the capacity arithmetic it expected: no prisoner used it at
all.

### 6.2 `main` moved under this record, and answered §6's open question

**Written after the acts ran, at v0.0.473 (`70599d54`), and kept separate from
them for that reason.** Merging `origin/main` into this branch to write this note
brought issue #938's fix (PR #980, first released in v0.0.472),
`tests/integration/dead-room-no-doorway.test.ts` — and its docblock is a
controlled measurement of exactly the mechanism [§6](#6-measured--the-yard-incentive-is-worth-exactly-nothing-at-fifty)
named as its strongest untested candidate:

> Two prisons that differ by **one edge**. Both zone a `room.shower-room` and
> place both of its shower heads; one has a wooden door in the wall line and one
> does not. On the same seed, after ten in-game days:
>
> | | with a door | without |
> | --- | --- | --- |
> | `hygiene`, both prisoners | 254.8 / 253.2 of 255 | **0 / 0** |
> | `roomPerimeterEnclosure` | `'sealed'` | `'sealed'` |
> | `requirementSummary.missingCapability` | 0 | **0** |

**That is the signature this record measured, for a different need, at fifty
people.** `recreation` at exactly 0 permille on all fifty, with a legal zoned
yard standing, is what a prisoner who cannot leave the cell looks like — and
`hygiene` at exactly 0 on all fifty is the same thing, measured here in every
one of the five acts. Neither playtest in this pair has ever built a door: grep
for `door` in either file returns nothing.

**So candidate 2 is promoted from "untested" to "measured on `main`, by someone
else, for another need"** — which is a stronger claim than this record could
make and a weaker one than running the act. It does not settle the yard: this
record still has not built a door and re-measured `recreation`, and until it
does, *"the yard pays nothing at fifty"* and *"the yard pays nothing to a prison
whose cell has no door"* are the same measurement wearing two labels. **The
second is the one the evidence supports.**

**What this costs the rest of the record, stated plainly.** The two unmet needs
every act settled at are `hygiene` and `recreation` — the two that need a room
outside the cell. If a door changes them, it changes the price per place, and
with it every ratio in [§4](#4-measured--restoring-the-constant-costs-this-prison-277-of-its-daily-gain)
and both break-evens. What does **not** move is the shape: the shipped tree pays
300 a place whatever the composition, so **act B's +14,440, act G's 187/188 flip
and the whole shipped column are unaffected by any of this.** It is the restored
column that is conditional, and the direction is knowable: a door can only
*reduce* the number of unmet needs, so a prison with one earns **more** than
11,000 and its break-even is **above** 137. The penalty's bite at fifty is
therefore **at most** the 27.7% measured here, and the ruling is being made on
the pessimistic end of the range.


---

## 7. MEASURED — on the shipped tree the sign flips between 187 and 188 guards

**Reproduction** (act G). Act F's script on the unmutated tree, hiring 187 and
then 188.

| boundary | tick | treasury | delta | staff | free | wage bill | implied grant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| day 15 | 36,000 | 117,050 → 131,490 | +14,440 | 7 | 0 | 560 | 15,000 |
| day 16 | 38,400 | 131,490 → 145,930 | +14,440 | 7 | 0 | 560 | 14,999 |
| day 17 | 40,800 | 131,530 → 131,570 | **+40** | **187** | 179 | 14,960 | 14,999 |
| day 18 | 43,200 | 131,570 → 131,610 | **+40** | 187 | 179 | 14,960 | 15,000 |
| day 19 | 45,600 | 131,530 → 131,490 | **−40** | **188** | 180 | 15,040 | 14,999 |
| day 20 | 48,000 | 131,490 → 131,450 | **−40** | 188 | 180 | 15,040 | 14,999 |
| day 21 | 50,400 | 131,450 → 131,410 | **−40** | 188 | 180 | 15,040 | 14,999 |

`50 × 300 − 187 × 80 = +40` and `− 188 × 80 = −40`, exactly, and the
composition is `50 prisoner(s) at 2 unmet` throughout — which on the shipped
tree costs nothing, and is printed only to show the two acts are comparing the
same prison.

And the containment result replicates on the second tree, with the 180 hires at
tick 38,582: the assault opened at 37,151 lapsed after 611 ticks; the five
opened from 39,551 on were each `all-clear` in 69–70. **Ten lapses then five
containments in act G, ten then six in act F — the same boundary, at the same
hire, on both trees.**

### 7.1 The two break-evens, side by side

| | shipped (`withheld = 0`) | restored (`withheld = 40`) |
| --- | --- | --- |
| state income, 50 places at 2 unmet | 15,000 | **11,000** |
| settled delta at the 7 guards the game asks for | **+14,440** | **+10,440** |
| last guard count still positive | **187** (+40) | **137** (+40) |
| first guard count negative | **188** (−40) | **138** (−40) |
| headroom over what the game asks | **26.7×** | **19.6×** |
| guards per prisoner at break-even | 3.75 | **2.75** |
| what the game asks for, per prisoner | 0.14 | 0.14 |

**Both flips are measured, not divided**, three or two consecutive boundaries
either side of one hire, in one world each.

---

## 8. The mutation, and its restore

`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` has one production reader —
`stateIncomeForPrisonerDay`, `src/simulation/economy/income.ts:503` — and no
seam a test can inject through, by a design its own docblock states. Acts P, F
and Y ran against a source mutation of it from `0` to `40`; acts B and G ran on
the unmutated tree. The mutation was made **once**, before act P, and restored
**once**, after act Y and before act G:

```
$ sha256sum src/simulation/economy/income.ts > income.sha256
34a59cd222eccf85d44c9743068f57f6bf59f5c0788e2855462163fc3a612744  src/simulation/economy/income.ts
$ sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/…= 40;/'     src/simulation/economy/income.ts
$ grep -n 'WITHHELD_PER_UNMET_NEED_MINOR_UNITS = ' src/simulation/economy/income.ts
401:export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;
  ... acts P, F, Y ...
$ git checkout -- src/simulation/economy/income.ts
$ sha256sum -c income.sha256
src/simulation/economy/income.ts: OK
$ grep -n 'WITHHELD_PER_UNMET_NEED_MINOR_UNITS = ' src/simulation/economy/income.ts
401:export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;
$ git diff --stat origin/main..HEAD -- src/
  (empty)
```

**`OK`**, and `git diff origin/main..HEAD -- src/` is empty at the commit that
carries this note. **Balance is the owner's; this record is a set of numbers.**

**A fourth mutation was found already applied and was restored before any act
ran.** The worktree this measurement inherited from the interrupted session had
`= 40` uncommitted in `src/simulation/economy/income.ts` — the previous
session's mutation, left in place when its container died. It was restored
first, and the clean file hashed to
`34a59cd222eccf85d44c9743068f57f6bf59f5c0788e2855462163fc3a612744` — **the same
hash the four-prisoner note recorded at v0.0.465.** The file did not move
between the two measurements, so the two records price the same code.

The mutation was **not** proved live by a `vitest` probe this time, as the
four-prisoner note's §0 did. It did not need to be: acts P, F and Y each
divide to a price of exactly **220** a place, which is the schedule's row for
two unmet needs at a withheld rate of 40 and is not a number the unmutated tree
can produce — acts B and G divide to 300 on the identical composition. The
mutation is therefore evidenced by four acts' arithmetic rather than by a probe.

---

## 9. What this record does *not* claim

- **That any of the restored-tree numbers describe a prison with a door.**
  **This is the weakest claim in the file with weight on it**, and it is
  weakest in a knowable direction. Every act's cell is sealed with no doorway;
  `tests/integration/dead-room-no-doorway.test.ts` on `main` measures that such
  a room is dead; so the two unmet needs priced throughout are a dead cell's
  two, and a prison with a door would earn more than 11,000 a day and break
  even above 137 guards
  ([§6.2](#62-main-moved-under-this-record-and-answered-6s-open-question)). The
  shipped column is immune — 300 a place is paid at any composition — so what
  is conditional is exactly the 27.7% and the 137, and both are the
  *pessimistic* end. What would refute it: an act that builds one door and
  re-measures the composition.
- **That the yard's zero has a cause this record established.** It measures that
  the yard returns nothing and rules capacity out as a *sufficient* explanation
  — all fifty at exactly 0, where four rotating places would leave some
  non-zero. Reachability is measured on `main` for `hygiene` and inferred here
  for `recreation`; distance is untested. What would separate them: one act with
  a door and the yard adjacent, one with a door and the yard far.
- **That acts B and P are the same world.** They are the same *script* on two
  trees, and the RNG trajectories diverge — this is the four-prisoner note's own
  weakest claim, inherited. It matters much less here, because **acts F and G
  each contain their own controlled comparison**: the sign flip is two stages of
  one run, one hire apart, same world, same population, same composition. The
  cross-tree comparison in [§4](#4-measured--restoring-the-constant-costs-this-prison-277-of-its-daily-gain)
  is stated as *price per place at a matched composition* (300 against 220 at
  `50 prisoner(s) at 2 unmet`, measured on both), not as one curve minus the
  other. What would refute it: a boundary where the two trees are shown the same
  composition and do not pay 300 and 220.
- **That the composition is stable past day 23.** Every act ran seven in-game
  days after intake and stopped. A sentence is 14–90 in-game days, so **no act
  here ran long enough for the roster to start discharging** — act F's first
  attempt did, by accident, and measured a thirty-eight-prisoner prison. What a
  fifty-prisoner prison's curve does at day 40 is unmeasured.
- **That fifty is the ceiling.** Fifty is what the *starting camera* can enclose
  in one rectangle. #957 establishes the world is one owned 32×32 chunk with no
  command that buys more, so the ceiling is a few hundred; nothing here tests a
  prison built with the camera moved, which act Y shows is possible.
- **That anything here is about rendering.** Every number is off the worker's
  `simulation/status-counts` and `simulation/event` channels and the
  `hud/prisoner-roster` / `hud/prisoner-detail` projections. Git LFS content is
  smudged in this worktree (`file public/assets/actors/actor.guard.base.idle.png`
  → `PNG image data, 260 x 3104`), so the actors did draw, but nothing was
  concluded from a pixel.
- **That any of this is a defect.** *Defect*, *regression* and *too easy* are
  claims about impact, and the impact question here is balance, which is the
  owner's.

---

## 10. What the brief that commissioned this got wrong

Correcting the brief is expected (`docs/AGENT_WORKFLOW.md` §3). Five things, and
two of them change the answer.

1. **"Housing fifty is the hard part and is where your time will go … If fifty
   cannot be housed, that is the finding."** Fifty can be housed, it took one
   attempt, and no press was refused. The time went into the *break-even* acts
   instead: 380 and 431 seconds of wall clock spent on 130 and 180 Hire Guard
   presses, which is where act F's first attempt had been lost.
2. **"issue #957 records that the clear area is 12×11 tiles."** True of #957 and
   not applicable to this build: #957 measured clear tile *centres*, which is
   where an object may go. Walls run on tile *edges*, so the **enclosable**
   rectangle is ten by ten
   ([§1](#1-measured--fifty-can-be-housed-on-a-cell-the-game-says-is-not-ready)).
   Ten by ten is a hundred tiles is fifty beds, exactly — the two figures differ by
   the two tiles that decide whether the ruling's population fits.
3. **"`safety` read 1000 permille on every prisoner … At fifty with seven
   guards, is safety still saturated for everyone, or does a sector's return get
   spread thin?"** Still saturated: 1000 permille, `unmet: false`, on all fifty,
   in every settled reading of all five acts. Not spread thin at all. The
   documented floor of 60 remains unreachable for a staffed prison and the real
   staffed floor is still 100 — **but at fifty that no longer matters**, because
   the prison does not get near it: it settles at **two** unmet needs, which is
   220, four rows above the floor.
4. **"the two prisons on offer were +320/day with nothing contained or −80/day
   with everything contained … Does that fork still exist at fifty?"** It does,
   and it is wider by a factor of 26: at four prisoners the gap between the two
   prisons was **5** guards, at fifty it is **131**
   ([§6.1](#61-the-two-four-prisoner-findings-the-brief-asked-about-answered)).
5. **"Whether the yard incentive still pays to the unit — at four it was exactly
   4 × 40 = 160/day. At fifty, is it 50 × 40?"** **It is 0**, and the brief's
   own follow-up — *"does one 8×8 yard even serve fifty people, or does
   `recreation` stay unmet for most of them because a yard has a capacity"* —
   understates it: not *most of them*, **all** of them, and not because of
   capacity, which the measurement rules out as sufficient
   ([§6](#6-measured--the-yard-incentive-is-worth-exactly-nothing-at-fifty)).

Everything else the brief cited opened where it said.
`resolveOccupancyScaledGuardCount` is
`Math.max(scheduledGuardCount, Math.ceil(occupantCount / 8))` at
`src/simulation/security/sector-staffing.ts:190`, and `ceil(50/8) = 7` does
dominate the schedule floor of one — measured, `GUARD COVERAGE 7 of 7 Covered`,
`dailyWageBillMinorUnits: 560`.

---

## 11. Instrument failures

- **The branch was handed over with `tests/foundation` red**, at `2 failed |
  473 passed`, and all three defects were citations in the instrument's own
  docblocks: `ProjectionRequester` is declared nowhere (the class is
  `SimulationProjectionRequester`, `src/ui/simulation-projections.ts:114`), and
  two rooted paths that do not exist on this branch — the four-prisoner
  instrument, which lives on an unmerged branch, and this note, which did not
  yet exist. Fixed in `c8b6b2a9`; the gate is green at 475/475 at the commit
  carrying this note. **Neither the instrument nor this note may cite the
  four-prisoner pair by rooted path** while PR #971 is open, and both now say so
  where the citation is.
- **The worktree still held the previous session's source mutation**, `= 40`,
  uncommitted. Anything run before noticing it would have been a mutated-tree
  measurement reported as a shipped one. Restored and hash-verified before any
  act ran ([§8](#8-the-mutation-and-its-restore)).
- **A `READY` reading of `safety` is a reading of the build phase.** Act B's
  first need sample, 800 ticks after the hires, read `safety` unmet for **39 of
  50** with `COVERAGE 50 · Covered` on the same sample, and would have supported
  the exact opposite of [§3.1](#31-measured--safety-still-saturates-at-fifty-and-the-reading-that-says-otherwise-is-a-transient).
  The prison spends its whole ~520 s build with zero guards, so `safety` has
  decayed to the floor by the time anyone is hired and needs about 17,000 ticks
  to come back at +0.03 a tick. Every settled claim here is from a `FINAL`,
  `SETTLED` or `STAGE-2` sample.
- **Nothing hit the 600 s per-test timeout, because nothing was run under it.**
  These acts set `test.setTimeout(2_400_000)` in the file rather than raising
  `tests/browser/playwright.playtest.config.ts`, so the repository's 600 s
  budget is untouched for every other playtest. The five acts took 758, 728,
  1,117, 772 and 1,145 seconds — **three of the five would have been killed by
  the config's budget**, and the four-prisoner file's yard act already was. This
  is not a timeout raised to hide a race: no assertion in the file waits on
  anything, and every reading is printed as it is taken.
- **The instrument's own prediction of zero riots was refuted three times.**
  Its `printEvents` docblock derives a `needsPressure` ceiling of about 0.48 at
  two-of-six against a 0.65 line. Three riots opened across acts B and P
  (`participantCount` 40, 45, 50) — every one of them while the prison was still
  filling, unguarded, and not yet at two-of-six. The ceiling holds for the
  settled prison and the docblock does not say that it is only about the settled
  prison.
- **`console.log` inside a `vitest` test is swallowed by the default reporter**
  — carried forward from the four-prisoner file, and the reason the schedule
  probe was not repeated here (see [§8](#8-the-mutation-and-its-restore) for
  what replaced it).

---

## Reproduction

```
# acts B and G -- unmodified tree
LOCKSTATE_BROWSER_TEST_PORT=5412 node node_modules/@playwright/test/cli.js test   --config tests/browser/playwright.playtest.config.ts   tests/browser/playtest-2026-09-04-what-pressure-there-is-at-fifty.playtest.ts   --grep "B the shipped curve at fifty"

# acts P, F and Y -- mutate once, run all three, restore once, verify
sha256sum src/simulation/economy/income.ts > /tmp/income.sha256
sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;/'   src/simulation/economy/income.ts
#   ... --grep "P the curve with the penalty restored at fifty"
#             | "F the break-even guard count with the penalty restored"
#             | "Y the yard with the penalty restored at fifty" ...
git checkout -- src/simulation/economy/income.ts
sha256sum -c /tmp/income.sha256          # must print OK
```

One act at a time, twelve to nineteen wall-clock minutes each. Do not edit
`src/**` while a run is in flight — Vite serves it live. **Never push the
mutated constant.**

The break-even acts take the guard counts from the environment, so a re-run at
another population does not need the file edited:
`LOCKSTATE_PT_GUARDS_PENALTY` (default 137) and `LOCKSTATE_PT_GUARDS_SHIPPED`
(default 187) are the *first* stage; each act then hires one more.

