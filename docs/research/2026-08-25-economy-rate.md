# Per-prisoner-day rate, payment cadence, starting balance, and the overcrowding hole

Research record for ADR 0017 decision 3 / issue #29's income line. Nothing in the
repository was changed to produce this.

## How to read the evidence labels

Every external claim carries one of three labels. Repository claims are cited by
`file:line` and were opened, not searched.

- **VERIFIED** — I opened the artifact myself in this session and quote it. For
  external material this means a file fetched from `raw.githubusercontent.com`
  (the only host of its kind the egress proxy allows) — an *unofficial community
  mirror of a shipped artifact*, not a vendor specification. A mirror can be
  stale or edited; what makes these usable is that they are verbatim shipped
  data files or machine decompilation.
- **SEARCH-ONLY** — a web-search result summary. I could not open the page:
  `WebFetch` on both Prison Architect wikis returns `EGRESS_BLOCKED`. Treat as
  hearsay. **No number labelled SEARCH-ONLY is used as an anchor anywhere in
  this document.**
- **FROM MEMORY** — believed, unchecked, no source.
- **UNKNOWN** — I could not establish it and am not guessing.

### What I deliberately did not use

The previous round's failure mode was importing another game's currency figures.
I found the corresponding figures again and am recording them here **as
unusable**, so nobody re-derives from them:

- Prison Architect's prisoner grant is reported as $100/minimum, $150/medium,
  $200/protective and death row, $250/max and supermax, plus $300 for
  criminally insane. **SEARCH-ONLY.** Note that the criminally insane tier is
  DLC-gated (*Psych Ward*) — which is precisely the silent DLC dependency that
  broke the last round. I could not open either wiki to confirm any of it.
- Prison Architect's starting cash: **UNKNOWN.** The search summary I got was
  internally contradictory — it mixed a "total prison starting value ≈ $45,000"
  (a *valuation*, not cash) with a "base value of −$20,000 in starting funds".
  Two figures that cannot both be a starting balance. I am not averaging them,
  not picking one, and not using either.

Prison Architect *is* used below, but only for **structure** (what income
categories exist, how a density rule is worded, how a danger meter is
displayed) — all of it from a shipped data file I opened and quote verbatim.

---

## The anchors, re-verified in this tree

All VERIFIED, all opened:

| Fact | Source |
| --- | --- |
| Brick = 40 minor units; wood plank = 65 | `src/content/procurement-catalog.ts:73-76` |
| Brick wall = 2 bricks → **80**; wooden door = 1 plank → **65** | `src/simulation/construction/definition.ts:19-32` |
| Treasury starts at **25,000**, documented as "a placeholder, and load-bearing for nothing" | `src/simulation/economy/treasury.ts:43-51` |
| Nothing credits the treasury on a schedule; `credit` exists only for refunds | `treasury.ts:5-14`, `:88-95` |
| `spend` refuses rather than overdrawing, so no negative balance is reachable | `treasury.ts:79-86` |
| Day = **2,400 ticks**, kernel steps at 50 ms → **120 s at 1x** | `src/simulation/prisoners/regime.ts:10`; step confirmed at `procurement-catalog.ts:57` ("100 ticks is 5 seconds at the kernel's 50 ms step") |
| Speeds are 1 / 2 / 4 and a session starts paused | `src/simulation/clock/fixed-step-clock.ts:17`, `:30` |
| Guard wage band 80–140 per day; 8 roles declared, nothing reads them | `src/content/staff-role-catalog.ts:59-62` and the file's own comment at `:37` ("a wage/skill hook, not a real economy") |
| A system runs when `tick % intervalTicks === phaseTicks`, and **systems run on tick 0** (increment happens after) | `src/simulation/kernel/kernel.ts:167-175` |

Four further facts that turned out to matter more than the price list:

1. **A cell is not just walls and a door.** `room.cell` requires *enclosed*, a
   minimum 2×3 / 6 tiles, **one `object.bed` and one `object.toilet`**
   (`src/content/room-catalog.ts:66-71`). Neither object is buildable — the
   buildable registry has exactly two entries, `wall-brick` and `door-wooden`
   (`construction/definition.ts:18-32`) — so **the bed and the toilet have no
   price at all.** Every cell cost below is a *shell* cost and is therefore a
   floor, not an estimate.

2. **Occupancy is hard-gated, so literal overcrowding is currently impossible.**
   `RoomInstanceRegistry.findAvailable` rejects an instance when
   `occupancy >= capacity`, and `assign` re-checks it
   (per ADR 0023's verified reading, `room-instance-registry.ts:81-93`). An
   arrival that finds no free place stays in `accommodation-assignment` and
   increments `accommodationBacklogTicks` (`intake-system.ts:133-135`). You
   cannot put two prisoners in one bed. **"Pack the prison" therefore cannot
   mean bunking — it can only mean sprawl: build the maximum number of minimal
   cells and nothing else.** This reframes question 4 and I answer the sprawl
   version, not the bunking version.

3. **Nothing admits a prisoner.** `src/main.ts:206` and
   `src/rendering/feed/simulation-snapshot-feed.ts:226` both state it: "nothing
   in `src/` admits a prisoner" / "nothing in `src/` calls `admitPrisoner`". A
   per-prisoner-day income line wired today pays **zero, forever.** The rate
   below is not testable in a real session until an admission path exists.

4. **Construction is effectively instantaneous and unconstrained by labour.**
   `ConstructionSystem` advances every in-progress order by `progress += 10`
   every scheduled tick, and it is scheduled every 10 ticks
   (`construction/system.ts:100`, `:315-320`). A wall needs 50 work, so it
   finishes in 5 scheduled ticks = 50 ticks = **2.5 seconds**, and all orders
   advance in parallel with no worker limit. A whole starter facility goes up
   inside the first in-game day. **Money, not time, is the only constraint** —
   which is why question 2's "two minutes is a long time to watch a static
   number" is a real problem and not a nicety: there is genuinely nothing else
   happening.

---

## 1. The rate

### Pricing a plausible small cell, with the assumption stated

**Assumption:** the smallest cell the catalog permits — interior 2 tiles by
3 tiles (`room-catalog.ts:68`) — enclosed by a single ring of brick wall, with
one wooden door occupying one tile of that ring.

```
Interior                    2 × 3            =  6 tiles
Footprint including ring    4 × 5            = 20 tiles
Ring (wall tiles)           20 − 6           = 14 tiles
One ring tile is the door   14 − 1           = 13 wall tiles + 1 door

13 walls × 80  = 1,040
 1 door  × 65  =    65
                 ------
Standalone cell  1,105      ← the anchor
```

Cells in a real block share side walls, so the *marginal* cell is cheaper. For
a row of N cells each 2×3 sharing vertical walls, the footprint is
(3N+1) × 5:

```
wall tiles   = (3N+1)×5 − 6N = 9N + 5,  minus N door tiles
cost(N)      = (8N + 5) × 80 + N × 65   = 705N + 400

N = 1 →  1,105     (matches above)
N = 8 →  6,040     (an 8-cell wing: 69 walls + 8 doors)
marginal cell = cost(N) − cost(N−1) = 705
```

**Both figures exclude the bed and the toilet, which have no price.** A cell
that actually satisfies its own requirements costs 1,105 *plus two unpriced
objects*.

### From cell price to rate

The design question is the payback period of the core capacity unit. I picked
**five prisoner-days for a standalone cell**, for one reason a player can feel:
a day is two minutes, so five days is ten minutes — one sitting. A cell you
build pays for itself inside the session in which you built it, and each cell
you add shortens the wait for the next. Shorter than that and expansion is free;
much longer and the first hour is a queue.

```
1,105 ÷ 5 days = 221 per prisoner-day  →  round to 200
```

### Recommendation: **200 minor units per prisoner-day**

Cross-checks, all in the game's own units:

| Check | At 200/prisoner-day |
| --- | --- |
| Standalone cell pays back in | 1,105 ÷ 200 = **5.5 days** (11 min at 1x) |
| Cell added to an existing wing pays back in | 705 ÷ 200 = **3.5 days** (7 min) |
| One prisoner-day buys | 5 bricks, i.e. two and a half walls |
| The 25,000 starting balance equals | **125 prisoner-days** |
| An 8-prisoner wing earns | 1,600 per day |
| One guard costs (band 80–140) | **5–9% of that wing's daily income** |
| A second 8-cell wing (6,040) costs | 30 prisoner-days ≈ 4 days at 8 prisoners |

200 is also a round number a player can do arithmetic on without a calculator
(five prisoners = 1,000 a day), and it is *not* divisible by 2,400 — which
matters in section 2.

Why not the neighbouring candidates: at **250** the standalone payback drops to
4.4 days and the marginal cell to 2.8, which makes expansion close to free
before any operating cost exists to soak it up. At **150** the standalone
payback is 7.4 days — more than one sitting — and the opening drags.

**One scheduled consequence, stated now so it is not later mistaken for an
error.** 200 is calibrated against a world with **no operating costs whatever**.
When wages, food and utilities land (issue #29's "recurring wages, utilities,
maintenance and food"), net income drops and the pacing above slows in
proportion. Expect the gross rate to need to rise to roughly **300** at that
point to preserve a five-day payback. That is a planned revision, not a
regression.

---

## 2. Cadence: at the day boundary, or continuously?

### Recommendation: **interval 2,400, phase 2,399 — one payment at the end of the day — plus a visible "earned today" counter that rises during the day**

So: the *treasury* moves once per day. The *number the player watches* moves
continuously. Both, and the reasons are not aesthetic.

**Why not continuous credit into the treasury.** The rate must divide into the
day as whole minor units. 200 ÷ 2,400 is 0.0833 per tick. A per-tick credit
therefore needs either a rate divisible by 2,400 (absurdly large), a
floating-point accumulator, or an integer remainder carried in the save. The
first is out; the second is barred outright — the balance is authoritative
simulation state that `docs/DETERMINISM.md`'s fingerprint hashes, and
`treasury.ts:26-36` says in terms that a fractional currency there would let two
runs that applied the same purchases in a different order disagree; the third
works but adds a field to the save and the fingerprint to solve a problem the
daily payment does not have.

**Why not phase 0.** Systems do run on tick 0 (`kernel.ts:167-175`, verified —
the increment is step 3, after the system loop). Phase 0 therefore fires on the
session's very first tick, before any time has passed and before anyone is
inside: it pays for a day promised rather than a day served. Phase 2,399 pays
for a day that happened. ADR 0017 rejected the block grant because it "pays for
surviving to a date"; paying in advance re-imports a smaller version of that.

**Accrue continuously in the model even though you pay discretely.** Sampling
occupancy once at the boundary is not the same as accruing per occupied place:
a prisoner admitted one tick before payday would earn a full day. Keep one
integer counter of occupied-place-ticks, add to it on each scheduled tick, and
at phase 2,399 pay `floor(counter × rate ÷ 2,400)` and carry the remainder. One
integer of new state, one division per day, exact.

**What the player sees, which is the part that actually decides this.** The
status strip already carries `dayNumber`, `tickOfDay`, `dayProgress`,
`prisoners` and `treasuryMinorUnits`
(`src/simulation/presentation/status-strip-projection.ts:65-70`, `:189-199`),
and the funds chip is rendered as a bare integer with no currency symbol and
deliberately no threshold tone (`src/ui/hud/projection.ts:205-231`). So there is
*already* a smoothly moving element telling the player when payday is — the day
progress bar. What is missing is not motion, it is the amount. Add one derived
figure, "earned today", beside funds. The player then reads: a bar filling, a
number climbing, and one satisfying jump when the bar wraps.

**The cost of that second number, named honestly.** Counts reach the main thread
through `simulation/status-counts`, capped at one message per 500 ms and
**skipped entirely when nothing it reports has changed** — the worker's own
comment says a session in which nothing happens "posts nothing at all after the
first readout" (`src/simulation/worker/state-machine.ts:58-77`). A continuously
rising figure changes on every publish, so the channel goes from silent-when-idle
to two messages a second for the whole session. That is the price of the
readout, it is small, and it should be paid deliberately rather than discovered.

**One hazard that applies to either phase.** `Kernel.snapshot()` records
`this._tick` (`kernel.ts:178-186`); a snapshot taken after the system loop but
before the increment would replay the payment tick and pay twice. Issue #29
already requires "duplicate scheduled charges for one period are prevented", so
record the last-paid day index in the save and the hazard closes for both
options at once.

---

## 3. The starting balance: **keep 25,000**

This is the answer I changed my mind about, so the arithmetic matters.

The tempting reading is that 25,000 is far too much: it buys 312 walls
(25,000 ÷ 80 = 312.5), or 34 cells in a single block (from
`cost(N) = 705N + 400`), and a starting grant that buys 34 cells is absurd.
But **a building with 34 cells and nothing else is not a prison** — and the room
catalog says exactly which other rooms a prison needs. Pricing their shells the
same way (interior area from `room-catalog.ts`, ring = footprint − interior, one
tile of the ring is a door):

| Room | Minimum interior | Walls | Doors | Shell cost |
| --- | --- | --- | --- | --- |
| 8 cells in one block | 8 × (2×3) | 69 | 8 | 6,040 |
| Canteen | 6×6 | 27 | 1 | 2,225 |
| Kitchen | 4×4 | 19 | 1 | 1,585 |
| Shower room | 3×3 | 15 | 1 | 1,265 |
| Yard | 8×8, *outdoors* | 0 | 0 | 0 |
| **Starter facility, shell only** | | | | **11,115** |

Add a modest perimeter wall — 30×30 is 116 tiles at 80 = 9,280 — and the opening
build is about **20,400**. Nothing in the code requires a perimeter, but a prison
game in which the player does not build one is not a prison game.

So 25,000 is roughly **one complete starter facility shell plus a fifth in
slack**. That is the right order of magnitude, and it lands there without anyone
having designed it — the constant was chosen to "buy a few hundred bricks" for a
test (`treasury.ts:43-51`).

**The direction of the remaining error is up, not down.** Every figure in that
table excludes furniture, and the furniture is not optional: a cell is not a cell
without a bed and a toilet, a kitchen needs a stove, a prep counter and a fridge,
a canteen needs two dining tables and four benches (`room-catalog.ts:66-101`).
None of it has a price. When it gets one, 25,000 buys *less* than one starter
facility. **Do not lower it.**

### What the first ten minutes feels like at 25,000 and 200/day

Ten minutes is five days. Because construction is instant and unconstrained
(fact 4 above), the shape is:

- **Day 1, first ~20 seconds.** The player queues the whole starter facility.
  Materials arrive 5 seconds after each purchase; walls finish 2.5 seconds after
  that. Roughly 11,000 of 25,000 is gone and the prison is *built*. Balance
  ~14,000.
- **Rest of day 1.** Nothing. Income is zero because nobody is inside. The
  end-of-day payment is 0. This is the honest low point of the current build,
  and it is not the rate's fault: nothing admits a prisoner (fact 3).
- **Days 2–5, assuming ~8 prisoners arrive.** 1,600 per day, four payments,
  6,400. Balance climbs to ~20,000 and the player can fund a second 8-cell wing
  (6,040) out of income rather than out of the grant.
- **The crossover is visible inside the session**, which is the property worth
  protecting: the grant pays for wing one, income pays for wing two, and the
  player watches the handover happen.

If the owner wants the opening to bite harder, the lever is **15,000** — enough
for cells, a canteen and a shower, but not a kitchen and not a perimeter, so the
first real decision arrives on day 1 instead of day 3.

---

## 4. Overcrowding: the open question

### First, what the problem actually is here

ADR 0017 states the debt as "income scales with population, and so does trouble
— so either overcrowding is punished somewhere, or the dominant strategy is to
pack the prison". But **this codebase cannot be overcrowded in the ordinary
sense.** Capacity is hard-gated (fact 2): a prisoner with no free place waits in
`accommodation-assignment` forever and the counter
`accommodationBacklogTicks` — described at `intake-system.ts:18` as "observable
unmet demand, not hidden success" — goes up. Two prisoners in one bed is not
representable.

So the degenerate strategy is not bunking. It is **sprawl**: build the largest
possible number of minimum-legal cells, staff nothing, provide nothing, and
collect. Every mechanism below is judged on whether it stops *that*.

Prison Architect has the same structural gap and names it in the interface —
**VERIFIED**, `main/data/language/base-language.txt`, mirror
`originalfoo/Prison-Architect-API`, opened and quoted:

```
interfacetopbar_prisoners_nocells   *X Prisoners are unable to be assigned a cell
```

That is the same backlog readout, in the same place, for the same reason.

### Candidate A — pay only for *served* places (recommended)

**The rule, in one sentence the player can read:** the state pays the full rate
for a place only while the prison meets one visible provision floor for the
population it holds; places above the floor pay half.

**One ratio, one threshold, one HUD line.** e.g. *"31 places · 24 served ·
7 paid at half — supervision short by 2 guards."*

Deterministic: it is a comparison of two integers the tree already computes. No
rolls.

For the first term I would use **supervision**, because the numbers exist.
`DeploymentSystem.getCoverageReport` already returns
`{ sectorId, required, assigned, shortage }` per sector, sorted by sector id for
determinism (`src/simulation/security/deployment-system.ts:11-16`, `:72-78`), and
`staff-projection.ts` already surfaces it. The change needed is real but small
and single-purpose: `requiredGuardCountFor` currently reads an authored
per-sector schedule and returns 0 for a sector with no entry
(`:80-83`) — it must instead scale with the occupied places in the sector.

**Why this one.** It is the only candidate that implements ADR 0017's own stated
reason for choosing per-prisoner-day — that capacity and "the ability to keep
people in it safely" should "pay off through the same line". It also unblocks a
second decision: ADR 0017 decision 8's insolvency ladder is currently
*unreachable*, because no unavoidable recurring charge exists for the balance to
go negative against. Wages are that charge. One mechanism, two decisions.

**Where the bite comes from, and where it does not.** As a *marginal cost* this
is weak: at one guard per four places, a guard's 80–140 is only 20–35 per
prisoner-day against income of 200. The teeth are in the **cliff** — an
unsupervised wing earns *nothing at all* that day, not slightly less. That is
also what makes it legible: the player is not reading a gradient, they are
reading a wing that is switched off.

Genre precedent for pairing population income against supervision cost —
**VERIFIED**, same shipped file, the finance categories listed side by side:

```
finances_category_prisoners     Prisoner Grant
finances_category_guards        Guard Wages
finances_category_noincident    Days Without Incident
finances_dailyincome            *X / day
```

Two things worth noticing there. Income *is* per-prisoner and *is* daily
("*X / day"), which corroborates ADR 0017's structure independently of any
figure I could not source. And "Days Without Incident" is an income line —
the genre pays for *calm*, not only for heads.

And for how to display it — **VERIFIED**, same file, the danger meter is an
itemised signed list, not a score:

```
interfacetopbar_tension_description       FACTORS:
interfacetopbar_tension_happyprisoners    - *X prisoners say they are well treated
interfacetopbar_tension_unhappyprisoners  + *X prisoners have serious complaints
interfacetopbar_tension_lockedupprisoners + *X prisoners are shackled in their cells or in solitary
```

Each contributor is a sentence with a sign. That is the shape to copy: a new
line slots in without redesigning anything, and there is no wall of numbers
because each line is a clause.

### Candidate B — certified capacity versus actual capacity (the CNA model)

**The rule:** each room type carries a *certified* number of places; the beds
you actually install give it an *actual* number. The state pays the full rate up
to certified, and a reduced rate for every place above it. *"Wing A: 12 beds,
certified for 8 — 4 places paid at half."*

This is the real-world distinction. **SEARCH-ONLY** (institutional sources named
in the results, pages not opened): England and Wales run *Certified Normal
Accommodation* — the "good, decent standard" the service aspires to provide —
against *operational capacity*, the number an establishment can hold "without
serious risk to good order"; places above CNA are "overcrowding places" and a
prison can be crowded while still inside operational capacity. I could not open
the pages, so treat the terminology as indicative and the framing as the useful
part.

Genre precedent for grading accommodation *per prisoner* rather than absolutely
— **VERIFIED**, same shipped file, and the contrast between the two blocks is
the point:

```
roomgrading_cell_roomsize        Room size at least *X Squares
roomgrading_dormitory_roomsize   Room size at least *X Squares per Prisoner
roomgrading_dormitory_item       Item : 1 *X per 4 Prisoners
roomgrading_shared_occupuants    Current Occupants: *X / *Y
```

A single cell is graded absolutely; shared accommodation is graded *per
prisoner*, including furniture ("1 X per 4 Prisoners"). Also **VERIFIED**
firsthand, Oxygen Not Included (`Kupie/ONI_Decomp`,
`Assembly-CSharp/RoomConstraints.cs:125-140`): rooms carry maximum as well as
minimum sizes — `MAXIMUM_SIZE_64` is literally
`(Room room) => room.cavity.NumCells <= 64` — so a room can be *too big*, and
unsatisfied criteria render in red inline (`RoomCriteriaString`, same file) rather
than in a panel.

**Why I do not pick it, despite it being the better long-run answer.** Two
reasons, both structural.

1. **It is blocked.** The two fields it needs are exactly the two ADR 0023
   proposes — an authored *nominal* occupancy on the room definition and a
   *resolved* capacity on the instance, deliberately kept separate so that
   "a room whose resolved capacity is below its nominal figure is a room that
   needs furniture" is representable. But ADR 0023 is **Proposed, not
   accepted**, and its step 1 (objects supply occupancy) is unimplementable
   today because object placement does not exist
   (`docs/HUD_PROJECTIONS.md` gap 13). Until it does, resolved capacity *equals*
   nominal for every room, so nothing can ever exceed its certified figure and
   the mechanism is inert.
2. **It answers the wrong question.** It punishes bunking. It does not punish a
   player who builds two hundred perfectly-certified single cells and hires
   nobody — which is the strategy actually available.

Its right role is **successor**, not alternative: adopt A now, add B when object
placement lands and ADR 0023 is accepted.

### Candidate C — a licensed capacity cap

**The rule:** the state pays for at most N places; raising N costs a lump sum.

Simplest and most legible of the three, and I reject it on the repository's own
grounds. It converts expansion into a purchase with a fixed price and a fixed
wait, which is the failure ADR 0017 quotes the feature audit naming: "an economy
that merely delays a click is a timer, not a strategy". It also forecloses
candidate A's tension permanently — once the cap is the binding constraint,
nothing else can be.

### Pick

**Candidate A, with B as its successor and C rejected.** One ratio, one
threshold, one HUD sentence, no rolls, reuses a coverage report that already
exists, and it makes ADR 0017's insolvency decision reachable as a side effect.

Note in passing that issue #79's route — "bad pairings raise incident
probability" — is not available here even though it is the nearest filed work:
probability is explicitly out of scope for this question, and #79's own scope
puts the consequence behind a roll.

---

## 5. The strongest argument against each recommendation

Stated as an opponent would state it, not softened.

**Against 200 per prisoner-day.** It is fitted to a cost that is missing its
main components. A cell is walls, a door, *a bed and a toilet*, and I priced the
first two because they are the only two with prices. If a bed and a toilet
together cost what a cell shell costs — entirely plausible for a manufactured
object against thirteen bricks — then the real payback is eleven prisoner-days,
not five, and 200 is wrong by a factor of two. The rigorous move is to price the
furniture first and derive the rate second; I derived the rate from the only half
of the cost that exists, and the arithmetic is exact about a partial number.

**Against paying at the end of the day.** With construction instantaneous, no
labour constraint and nothing else to spend on, the daily payment is the only
event in the game. Making it a single jump means 118 of every 120 seconds
contain nothing at all — and my answer to that is a *second* number, so I have
answered a two-option question by proposing a third option that costs more work
than either. Worse, if the accrual counter is what the player watches, the
treasury's once-a-day jump is redundant ceremony, and the honest simplification
is to credit continuously and delete the second number. The determinism
objection to continuous credit is real but it is an *implementation* cost —
one remainder integer in the save — not a design reason.

**Against keeping 25,000.** Every justification I gave is retrofitted. The
constant was chosen to buy a few hundred bricks for a test harness, its own
comment says it is "load-bearing for nothing", and I worked backwards from it to
a starter-facility total that happens to land nearby — while conceding that the
furniture prices which would move that total do not exist. A number that
coincides with a hand-built estimate has been *rationalised*, not validated, and
the fact that my first instinct was "far too much" and my second was "keep it"
should lower confidence in both.

**Against the served-places gate.** It punishes under-staffing, not
overcrowding. A player who staffs correctly can still sprawl to the edge of the
map with no penalty whatsoever, so it does not actually close the hole ADR 0017
names — it makes the hole cost wages. It also drags an entire payroll system
into a question that a single density ratio could have answered, and it needs a
change to `requiredGuardCountFor` whose current authored-schedule form was a
deliberate choice ("no fabricated demand",
`deployment-system.ts:32-33`) — so the fix reverses an existing decision rather
than extending it.

---

## OPTIONS FOR THE OWNER

Three separate decisions. Within each group the choices are mutually exclusive.
No ticks, no code.

### The rate — what the state pays you, per prisoner, per day

*(A day is two minutes of play. A basic cell costs about 1,100 to build, or
about 700 if it shares walls with cells you already built — and that price does
not yet include the bed and toilet, which are free today only because nobody has
priced them.)*

1. **150 a day.** A cell takes about fifteen minutes of play to pay for itself,
   or nine if it shares walls with cells you already built.
   *Costs:* the opening feels slow, and a player may stop before the first
   expansion. *Forecloses:* adding running costs later without making it slower
   still.
2. **200 a day — recommended.** A cell pays for itself in about eleven minutes
   if it stands alone, seven if you add it to a wing you already have.
   *Costs:* it assumes staff wages and food do not exist yet; when they arrive
   this probably has to rise to about 300. *Forecloses:* nothing — it is the
   middle, and it can move either way.
3. **250 a day.** A cell pays back in under nine minutes and expansion is nearly
   free. *Costs:* money stops being the thing the player thinks about within the
   first session. *Forecloses:* using price as a brake later, because the player
   will already be richer than any price you set.
4. **Decide the price of a bed and a toilet first, then set the rate.**
   *Costs:* the income line waits on a separate content decision, and nothing is
   playable in the meantime. *Forecloses:* nothing, and it is the only option
   that is not fitted to half a number.

### The payment cadence — how the money arrives

1. **One payment when each day ends — recommended, with a running "earned
   today" figure next to your balance.** The balance jumps once every two
   minutes; the number beside it climbs the whole time.
   *Costs:* one extra readout to build, and the game starts sending the screen
   small updates twice a second where today it goes quiet when nothing happens.
   *Forecloses:* nothing.
2. **One payment when each day ends, and nothing else.** Cheapest possible.
   *Costs:* the balance sits perfectly still for two minutes at a stretch, and
   right now there is nothing else on screen moving. *Forecloses:* the sense
   that the prison is earning while you watch it.
3. **One payment when each day begins.** Same cost, pays in advance.
   *Costs:* you are paid for prisoners before the day they are held, so the
   first payment of a new session arrives before anything has happened.
   *Forecloses:* saying honestly that the state pays for days served.
4. **Money trickles in continuously.** The balance itself rises all the time.
   *Costs:* fractions of a unit have to be carried between moments and stored in
   the save, or the totals drift and two identical games disagree — a rule this
   project treats as non-negotiable. *Forecloses:* the payday moment, which is
   the only rhythm the day currently has.

### The overcrowding mechanism — what stops "cram in as many as possible"

1. **The state pays only for prisoners it considers properly looked after —
   recommended.** One visible standard (start with: enough guards for the number
   held); places above it pay half, and a wing with no supervision earns nothing
   that day. *Costs:* it needs staff to actually cost money, so payroll comes
   with it. *Forecloses:* nothing — but it punishes neglect rather than density,
   so a well-staffed player can still build endlessly.
2. **Each room is certified for a number of people; going over pays less.**
   Closest to how real prisons describe overcrowding, and the clearest sentence
   to put on screen. *Costs:* it needs the player to be able to place beds and
   furniture, which does not exist yet, and it depends on a decision (ADR 0023)
   that is still unapproved. *Forecloses:* nothing; it is the natural next step
   after option 1.
3. **A flat cap on how many prisoners you are paid for, raised by buying a
   licence.** Simplest to build and to explain. *Costs:* expansion becomes a
   purchase with a fixed price and a fixed wait, which is the "economy as a
   timer" outcome this project has already written down as the thing to avoid.
   *Forecloses:* every other pressure — once the cap binds, nothing else
   matters.
4. **Do nothing yet, and note it.** Ship the income line, let packing be optimal
   for now. *Costs:* the first player to find the strategy has no reason to play
   the rest of the game. *Forecloses:* nothing, but it hands the same decision
   back unchanged, later, with a shipped economy built around its absence.

---

## Sources

Opened and quoted in this session (unofficial community mirrors of shipped
artifacts, fetched from `raw.githubusercontent.com`):

- Prison Architect shipped language data — `originalfoo/Prison-Architect-API`,
  `main/data/language/base-language.txt`
- Oxygen Not Included decompiled room constraints — `Kupie/ONI_Decomp`,
  `Assembly-CSharp/RoomConstraints.cs`
- RimWorld decompiled room space stat — `Chillu1/RimWorldDecompiled`,
  `RimWorld/RoomStatWorker_Space.cs` (confirms area participates as a *stat*,
  1.4 per standable cell, capped at 350 — not as a capacity)

Search results only, pages **not** openable (`EGRESS_BLOCKED` on both wikis):

- [Prison Architect Wiki — Grants](https://prisonarchitect.paradoxwikis.com/Grants),
  [Finance](https://prison-architect.fandom.com/wiki/Finance),
  [New Prison](https://prison-architect.fandom.com/wiki/New_Prison) — the grant
  figures and starting-funds figures quoted from these are **unused**.
- [Prison Reform Trust](https://prisonreformtrust.org.uk/two-thirds-of-prisons-officially-overcrowded/),
  [House of Lords Library — Prison Overcrowding](https://researchbriefings.files.parliament.uk/documents/LLN-2017-0049/LLN-2017-0049.pdf),
  [Howard League](https://howardleague.org/why-are-prisons-overcrowded/) —
  certified normal accommodation vs operational capacity.

In-repository, opened: `docs/adr/0017-money-primary-resource-model.md`,
`docs/adr/0023-room-occupancy-authority.md` (Proposed — and the source of the
prior round's tier-2 findings on RimWorld bed assignment and ONI room types),
`docs/ISSUE_BACKLOG.md`, and GitHub issues #29, #79, #80, #81.
