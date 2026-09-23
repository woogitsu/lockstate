# What would make mid-game money a decision

**Date:** 2026-09-23. **Tree:** `origin/main` at `430906af` (v0.0.757), with
the #641 commit *"feat(economy): open every new prison on 100 000 (#641)"*
(not yet on `main`, so cited by subject rather than by sha) applied to the working tree and **not** committed with this record.
So every measurement below opens on **100 000**, with the overdraft floor
derived to **−10 000** and `ARREARS_BOUND_MINOR_UNITS` to **10 000**. The probe
read those three constants back before it measured anything (MEASURED:
`START 100000 -10000 10000`).

**Question:** [#962](https://github.com/woogitsu/lockstate/issues/962), under the
owner's ruling of 2026-09-23. It was recorded on that issue as the option label
*"Tak — zbadaj dźwignie (zalecane)"*, which is the weaker provenance. It asks
which levers would make the mid-game force money choices, what each would cost,
and what each would break. The instruction was to research the levers first and
move no numbers.

**This record changes no balance value, price, rate or threshold.** Every rate
below that is not on `main` is an **illustrative rate chosen to size a lever**.
It is labelled ASSERTED and it is not a proposal. The magnitudes are the owner's
under ADR 0017 decision 5 and #29.

## How every number here was obtained

- **MEASURED** means the value came from the real `Kernel`, the real `packCommand`
  decoder and the real session command router. Prisons were built with
  `createNewSimulationRuntime` and stepped day by day, and the value was read off
  `Treasury`, `PayrollSystem`, `RoomInstanceRegistry`, `NeedsComponent` and
  `IncidentLog`.
- **DERIVED** means the value was computed from MEASURED samples or from
  catalogue values read off the tree. The step is always shown.
- **ASSERTED** means the value is a rate or estimate chosen or judged by this
  record and not established by anything. It covers every lever rate and every
  implementation-cost estimate.
- **VERIFIED** keeps [the index's](./README.md) meaning: a source file was opened
  and read.

### The instrument

It was built the way `tests/research/2026-09-05-yard-at-scale.research.ts`
builds prisons, and for the reason that file's config gives it lived outside
`pnpm test`. **It lived in a scratch directory and is not committed.** Its shape
is written down here so it can be rebuilt.

- **Housing.** Two-place `room.cell`s, 2×3 each: a bed at `(x,y)`, a bed at
  `(x+1,y+1)` and a toilet at `(x+1,y)`, with the door on the south edge. There
  are ten cells to a row at pitch 3, in rows at `y = 1, 5, 9`, with a corridor
  row under each.
- **The rest of the prison.** One 8×8 `room.yard` at `(12,13)`, one to three
  3×3 `room.shower-room`s with two heads each at `(9|5|1, 21)`, and one 6×6
  `room.canteen` at `(24,21)` with two tables and four benches.
- **Staffing and admission.** Guards are hired to the requirement,
  `max(1, ceil(P/8))`
  (`resolveOccupancyScaledGuardCount`, `src/simulation/security/sector-staffing.ts:161`).
  Admissions come at tick 9,599 with `sentenceLengthTicks: 400_000`, so nobody
  leaves inside a run.
- **Commands.** `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff` and
  `AdmitPrisoner` all go through the router, and the fixture asserts
  `refusals.count === 0`. The one shortcut is `tests/helpers/room-walls.ts`'s
  `wallRoomPerimeter`, which writes the edges that completed wall and door
  orders would write. **Wall capital is therefore DERIVED, not measured off the
  treasury.** It is priced as unique perimeter edges × 80, with one edge per room
  priced as a door at 65.
- **Sampling.** Each sample is read on the settlement tick, before that tick
  executes. So day 1 carries no settlement and every later delta is exactly one
  whole day. "Settled" means the mean over days 11–40.

The three sizes are **S** (8 places: 4 cells, 1 shower room), **M** (24
places: 12 cells, 2 shower rooms) and **L** (48 places: 24 cells, 3 shower
rooms). **X** (60 places: 30 cells) is as far as this layout goes inside the
chunk. Every size was run at 100%, 125% and 150% of its beds, and variants
remove or add guards, shower rooms and canteens. Second-seed arms (`seed2`)
reproduce the S100, M100, L100 and L150 rows to within 0.2%.

## 0. Four premises checked against today's tree before measuring

1. **#962 §5 says the withholding is switched off. It is not.**
   `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is **40**
   (VERIFIED, `src/simulation/economy/income.ts:549`). The owner restored it on
   2026-09-04, the day #962 was filed, and the docblock carries both rulings. So
   the per-need schedule `300, 260, …, 60` is live, and every figure below
   includes it.
2. **#962's 3.3% reproduces at 100 000.** Wages as a share of state income are
   **3.33%** (S100), **3.35%** (M100, L100) and **3.60%** (X100) (MEASURED).
   Crowded to 150%, L pays **6.15%**, because the extra prisoners need guards and
   pay nothing.
3. **`room.cell` now houses at most two**, because #961 (`be4dcbf8`) added
   `maxResidents: 2` (VERIFIED, `src/content/room-catalog.ts:152`). This
   record's first fixture placed 8 beds in one 3×10 cell and housed **2**
   (MEASURED: `residentCapacity: 2` beside `sleep-surface` capacity 8).
   **By the same rule, the yard-at-scale research instrument's 50-bed
   `room.cell` would now house two** (DERIVED, not re-run). Its tables are
   history, and anyone reusing that file as a fixture should know it.
4. **Wages are still the only recurring spend.** `SpendClass` is
   `'deliveries' | 'construction' | 'wages' | 'hiring'` (VERIFIED,
   `src/simulation/economy/treasury.ts:332` on `main`, `:402` with the #641 commit applied). The one abstract cost the
   simulation already computes and nothing charges for is
   `IncidentOutcome.propertyDamage`. It is 0–10 per incident: *"consumed by a
   future repair-job/economy system"* (VERIFIED, `src/simulation/incidents/incident.ts:57`).
   A lapse writes `min(10, severity)` and a resolution writes
   `floor(severity/2)` (`src/simulation/incidents/response-system.ts:708`, `:957`).

## 1. The baseline at 100 000 — MEASURED

| prison | beds | P | guards | wages/day | income/day | **net/day** | income as % of `300 × housed` | incidents in 40 days | damage in 40 days | capital (DERIVED) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S100 | 8 | 8 | 1 | 80 | 2,400 | **2,320** | 100.0% | 0 | 0 | 7,660 |
| M100 | 24 | 24 | 3 | 240 | 7,163 | **6,923** | 99.5% | 0 | 0 | 16,325 |
| L100 | 48 | 48 | 6 | 480 | 14,311 | **13,831** | 99.4% | 2 | 6 | 28,810 |
| X100 | 60 | 60 | 8 | 640 | 17,768 | **17,128** | 98.7% | 2 | 6 | 34,540 |
| S150 | 8 | 12 | 2 | 160 | 2,077 | **1,917** | 86.6% | 41 | 160 | 7,660 |
| M150 | 24 | 36 | 5 | 400 | 6,133 | **5,733** | 85.2% | 38 | 146 | 16,325 |
| L150 | 48 | 72 | 9 | 720 | 11,711 | **10,991** | 81.3% | 42 | 176 | 28,810 |

Three facts the rest of the record stands on:

- **The economy has no time axis.** On every 100% arm, settled net over days
  11–20 and days 31–40 agrees to within 0.2% (MEASURED: L100 13,844 against
  13,820, M100 6,932 against 6,924, S100 2,320 against 2,320). A prison's net is
  a function of its state, not of its age. So **no time-invariant lever can
  produce a day on which a staffed, need-meeting prison stops growing.** It
  either never stops or it stops on day 1.
- **Money accumulates without limit.** L100 goes from 94,210 after building to
  **633,290 on day 40** (MEASURED). The whole L prison's capital, 28,810, is
  **2.1 days of its own net** (DERIVED).
- **Growth stops at the land, not the money.** A session owns one chunk (MEASURED
  `tileChunkSize` 32). Building outside it is refused as `unowned-land`, and no
  command buys land: the command set is `AdmitPrisoner`, `HireStaff`,
  `PlaceBuildOrder`, `PlaceObject`, `PurchaseMaterials`, `SellMaterials` and
  `ZoneRoom` (VERIFIED, `src/simulation/protocol/commands.ts`). This layout tops
  out at **60 places** (X). A denser layout could hold more, and that ceiling is
  not measured. **Today the answer to "on what day does a well-run prison stop
  growing" is "the day it fills its chunk". That is a player-pace fact, and no
  cost lever changes it.**

## 2. Where a decision could live at all — MEASURED marginal values

A lever makes money a decision only if it brings some choice's recurring cost
close to that choice's recurring benefit. So these are the benefits of every
discretionary choice this fixture can express, in net/day:

| choice | S | M | L |
| --- | --- | --- | --- |
| build the **first** shower room | **+320** | **+955** | **+2,057** |
| build the **second** shower room | — | **+36** | **+207** |
| build the **third** shower room | — | — | **+205** |
| build a canteen | **0** | **−37** | **−45** (a second canteen: −5) |
| hire up to requirement (the last guard) | g0→g1 **+803** | g2→g3 **+864** | g5→g6 **+2,026** |
| hire guards still short of requirement | — | g1→g2 +485 | g1→g5 **+35** |
| admit 25% over beds | −400 | −1,032 | −2,461 |
| admit 50% over beds | −403 | −1,189 | −2,840 |
| house 60 in 30 cells rather than 24 (X100 against L125) | — | — | **+5,759** for 5,730 of capital |

What this table says:

1. **Every choice today is dominated by a factor of ten or more.** Each is either
   obviously worth doing (a cell, a first shower room, the last guard) or
   obviously not (crowding). That is #962's finding, now measured across the
   whole choice set rather than for one guard.
2. **Only the shower rooms have a diminishing return.** The first room is worth
   hundreds or thousands a day, and the second or third is worth 36–207. **That
   is the one place where a small recurring cost can create a close call without
   draining the prison.**
3. **The guard's value is a cliff, not a slope.** Five guards of the six L needs
   earn 35/day more than one guard does. The sixth earns 2,026. Coverage is
   judged per sector (`resolveSectorCoverageState`), so one guard short
   understaffs everybody. **No wage lever of any size in the authored band
   (80–140) can make the Nth guard a decision.** The cliff rule is what would
   have to change, and it is not a money lever.
4. **The canteen is worth nothing on this fixture.** Removing it leaves `hunger`
   met: `action.eat-in-cell` carries it, at 0.43 visits per prisoner-day at L100
   against 0.82 for `action.eat-meal` (MEASURED, visit census). Any upkeep on
   the canteen makes it dominated rather than a trade-off. **This is a
   finding for whoever owns the needs model**, and it is recorded here rather
   than chased.
5. **Crowding is already a loss, and the unhoused pay nothing.** Admission is a
   press, so crowding is a choice with only a downside. It is not a trade-off
   now, and no lever below turns it into one.

## 3. The levers, one by one

"Cost/day" is DERIVED from the MEASURED §1 samples. §4 shows that charging a
lever as a real debit changes nothing else while the balance is above every
rung, so the derivation is exact there. "Stops growing" means the day a
staffed, need-meeting prison's net reaches zero.

### A. Room upkeep, by size or type — rate ASSERTED: 10 per walled tile per day

| | S100 | M100 | L100 | L150 |
| --- | --- | --- | --- | --- |
| walled tiles | 69 | 126 | 207 | 207 |
| cost/day | 690 | 1,260 | 2,070 | 2,070 |
| share of net | **29.7%** | 18.2% | **15.0%** | 18.8% |

- **Stops growing:** never. The rate that takes L100 to zero is ~67 per tile
  (DERIVED, 13,831 / 207).
- **Trade-off:** partly. A shower room is 9 tiles, so 90/day. The second shower
  room at M (+36) becomes a skip and at L (+207) stays a build, so the same
  choice flips with scale, which is a real decision. But the canteen (36 tiles,
  360/day, worth ≤ 0) becomes a room nobody should build. Cells (60/day each,
  worth ~580/day) stay obvious.
- **It is regressive.** Fixed rooms weigh most on the small prison, which ADR
  0075 and ADR 0096 exist to protect. At the same rate S loses 30% and L 15%.
- **Crowding:** neutral in absolute terms, since the L100–L150 gap stays 2,840.
  But it is the only lever that makes crowding *relatively* cheaper than
  building. It still cannot close that gap: making the X100/L125 choice even
  needs ~960 per cell per day (DERIVED, 5,759 / 6 cells), which would bankrupt
  every prison.
- **Sentences:** see §3.1.
- **Implementation:** ASSERTED medium. It needs a new `SpendClass` member, a
  day-boundary system (a new slot in `tests/determinism/kernel-system-order.test.ts`)
  and a rate per room type or per tile. **It saves nothing and needs no
  save-format change** if an unpaid charge is simply not paid: tiles and types
  are derived from `RoomInstanceRegistry`, which the save already carries. If
  unpaid upkeep must accrue as a debt, the economy section needs a new field and
  `SAVE_SCHEMA_VERSION` (6) moves. Determinism: integer arithmetic, no RNG
  stream, and the balance fingerprint moves.

### A2. Utility running cost per fixture — rate ASSERTED: 50 per shower head, 20 per toilet, per day

| | S100 | M100 | L100 | L150 |
| --- | --- | --- | --- | --- |
| cost/day | 180 | 440 | 780 | 780 |
| share of net | 7.8% | 6.4% | 5.6% | 7.1% |

- **Stops growing:** never.
- **Trade-off:** **yes, and it is the cleanest in this record.** A shower room
  costs 100/day. The second room at M returns +36 and becomes a skip (DERIVED:
  M with 1 room 6,547 against M with 2 rooms 6,483). The third room at L returns
  +205 and stays a build (L with 2 rooms 12,945 against L with 3 rooms 13,051).
  The first room stays obvious everywhere. **Two sensible answers, and the
  better one depends on the prison.** It punishes no room the player cannot
  avoid (a cell's toilet is authored), and it leaves the canteen and the yard
  alone.
- **Scale of the decision:** 64–106/day against a 6,500–13,000 surplus. **That is
  a real choice nobody will feel** unless the margin is thinner (lever B).
- **Per use rather than per fixture:** MEASURED shower visits are
  **0.43–0.89 per prisoner-day** (L100 0.67, S100 0.89, L100 with one room
  0.43). So a per-visit cost of about **45–95** is where showering equals the
  40 withheld for unmet `hygiene` (DERIVED, 40 / visits). That locates the price
  scale on which a need's running cost starts to compete with its withholding.
- **Crowding:** neutral.
- **Sentences:** see §3.1.
- **Implementation:** ASSERTED medium, the same machinery as A, counted over
  `PlacedObjectRegistry`. No save change if stateless. A per-use variant charges
  on action completion, is event-driven and saves nothing, but it runs many
  times a day.

### B. Running cost per prisoner present (food, utilities) — rates ASSERTED: 100 and 200 per day

| | S100 | M100 | L100 | S150 | M150 | L150 |
| --- | --- | --- | --- | --- | --- | --- |
| at 100: cost/day | 800 | 2,400 | 4,800 | 1,200 | 3,600 | 7,200 |
| at 100: net after | 1,520 | 4,523 | 9,031 | 717 | 2,133 | 3,791 |
| at 200: net after | 720 | 2,123 | 4,231 | **−483** | **−1,467** | **−3,409** |

- **Stops growing:** never, for a staffed prison at 100% at any rate below
  **~288–290** (DERIVED: net / P is 290 at S, 288.5 at M and 288.1 at L). Above
  that it stops on day 1. **Crowded to 150% it goes negative from ~153–160**
  (DERIVED). MEASURED through the ladder at 250 (§4), a crowded M150 reaches 0
  on **day 31** and S150 on **day 92**. That gap is the 100 000 buffer.
- **Trade-off:** **none by itself.** It is linear in P, so it scales every
  prison's margin down and leaves every §2 ranking unchanged. **It is the only
  lever that moves the margin, and without that none of the choice-creating
  levers is felt.** It does make crowding cost real money: the L100–L150 gap
  grows from 2,840 to 5,240 at 100 and to 7,640 at 200.
- **Constraint from ADR 0096:** its guarantee is on *state income*, which this
  does not reduce. But decision 2 (VERIFIED, *"The prison may never be spent or
  charged into a position where the cheapest complete earning unit is
  unaffordable"*) means the new spend class must stop above the wages reserve.
  And a rate at or above ~260, a one-prisoner unguarded cell's income (300 − 40
  once `safety` is unmet, which MEASURED S100 at 0 guards shows as exactly 1.000
  unmet need per housed prisoner-day), makes the cheapest earning unit lose
  money for ever: a "way
  back" that pays income and never recovers the balance (DERIVED).
- **Sentences:** see §3.1.
- **Implementation:** ASSERTED low-medium, the same machinery as A. The count is
  the entity store's liveness, which is already saved. No save change if
  stateless.

### C. Wage growth or overtime — rate ASSERTED: every guard at the band's top, 140 (+60)

- **Cost/day:** 60 at S, 180 at M and 360 at L. That is **2.6% of net** at every
  size, and 4.9–6.3% crowded.
- **Stops growing:** never. The band caps the cost, and 140 × 6 is 6% of L's
  income.
- **Trade-off:** none. §2.3's cliff makes the requirement guard worth 800–2,026,
  so a 140 wage changes no decision. Overtime (a premium while understaffed) is
  the same, pushing towards a hire that is already obvious.
- **Crowding:** slight, because crowded prisons need more guards (gap
  2,840 → 3,020).
- **Sentences:** `hud.security.hire-hint` says *"Costs {total} now and {wage} a
  day in wages, including today."* **It becomes false** once a wage changes with
  tenure, unless `{wage}` is renamed as the starting wage.
- **Implementation:** ASSERTED medium-high. Tenure needs a hire tick per staff
  member, and nothing in `src/simulation` records one (VERIFIED: no `hiredAt` or
  equivalent). **That is a new saved field and a `SAVE_SCHEMA_VERSION` bump.**
  Overtime alone would be stateless.

### D. Material price drift — rate ASSERTED: +1% a day, compounding

- **Cost/day:** none recurring. It touches capital only. By day 40 prices are
  ×1.49 (DERIVED), so L's six extra cells (5,730) would cost ~8,530. That is
  **0.6 days of L's net.**
- **Stops growing:** never.
- **Trade-off:** a weak "build now or later". With capital at ~2 days of net it
  is not felt.
- **Crowding:** none.
- **Sentences:** none false. Refunds repay the amount recorded as paid, not the
  current price (VERIFIED, `src/simulation/economy/procurement.ts:78`,
  `:397-404`), so `hud.alert.event.construction.order-cancelled` and the
  cancel-refund sentences stay true. Buy, sell and hire prices are formatted
  from live figures.
- **Implementation:** ASSERTED medium-high. A price index can be a pure function
  of the tick, so saves are unaffected. But every reader of
  `unitPriceMinorUnits` would need it: purchase, just-in-time materials,
  placement preview, sell-back at 50% and the refusal shortfall figures.

### E. Incident damage and repair — rate ASSERTED: 200 per damage point

| | S100 | M100 | L100 | S150 | M150 | L150 | L100 at 1 guard |
| --- | --- | --- | --- | --- | --- | --- | --- |
| damage/day (MEASURED) | 0 | 0 | 0.15 | 4.0 | 3.65 | 4.4 | 5.2 |
| cost/day | 0 | 0 | 30 | 800 | 730 | 880 | ~1,045 |

- **Stops growing:** never, for a well-run prison, which barely has incidents.
- **Trade-off:** none. It adds weight to understaffing and crowding, both of
  which §2 already shows are losses.
- **A finding on the way:** in the crowded arms nearly every incident
  **lapsed**, even with guards hired to the full requirement (L150: 41 of 42;
  M150: 37 of 38). That is recorded, not diagnosed.
- **Crowding:** raises its cost (gap 2,840 → 3,690).
- **Sentences:** none false. A charge would need a sentence of its own.
- **Implementation:** ASSERTED low-medium. Charge on the `lapsed`/`resolved`
  transition. `propertyDamage` is already saved in the incident outcome, and a
  charge inside the transition's tick cannot be double-billed across a reload,
  because a save is taken between ticks. No RNG.

### F. A lower grant for poorly served prisoners — rate ASSERTED: withholding 40 → 80

| | S100 | M100 | L100 | S150 | M150 | L150 |
| --- | --- | --- | --- | --- | --- | --- |
| extra withheld/day (DERIVED: 40 × MEASURED unmet needs) | 0 | 37 | 91 | 323 | 1,068 | 2,681 |

- **Stops growing:** never.
- **Trade-off:** **none for a well-run prison, by construction.** A prison meeting
  its needs pays nothing, so this raises what neglect costs and makes every
  amenity *more* dominant rather than less.
- **Crowding:** the strongest interaction in the record (gap 2,840 → 5,431),
  because #586 routes crowding through `safety` and `hygiene` withholding. That
  is the rule the owner ruled on #586: *"the 40-withhold IS the tax"*.
- **Sentences:** none false. `hud.status.earned-withheld` carries no figure,
  deliberately (VERIFIED, `src/content/default-locale-en.ts`, the docblock above
  that key). The docblocks and ADR 0064 prose quoting `300, 260, …, 60` would
  need rewriting.
- **Implementation:** **the cheapest lever here.** One constant, no save change
  (`income.ts`'s own save paragraph), no RNG.

### G. Capital replacement, meaning object wear — rate ASSERTED: objects every 30 days, walls and doors every 120

- **Cost/day:** 106 at S, 214 at M and 371 at L. That is **2.7–4.6% of net.**
- **Stops growing:** never.
- **Trade-off:** none unless a durability tier exists to choose between. The
  catalogue has one bed, one toilet and one head.
- **Crowding:** none.
- **Sentences:** none false. Objects that break would need new ones.
- **Implementation:** **the most expensive lever here** (ASSERTED). It needs
  per-object condition state in `PlacedObjectRegistry`'s snapshot, a schema bump
  and a migration, a replacement flow and a readout.

### H. Not on the brief's list: pricing the next chunk of land (#649)

- **Cost/day:** none recurring. It is a one-off capital price per parcel.
- **Stops growing:** it is the lever that decides that day. Today the answer is
  "when the chunk is full" (§1). With land priced, the answer becomes "when the
  prison can afford the next chunk", which is a money decision.
- **Trade-off:** yes, if something else competes for the same money: save for
  land, or spend on the marginal amenity or staff. **At today's margin nothing
  competes**, because L banks 13,831 a day, so it needs B or A2 to matter.
- **Crowding:** a prison that cannot afford land yet is the one tempted to
  crowd. That is a real temptation, and §2 already prices crowding as the losing
  answer.
- **Sentences:** the three `unowned-land` refusals (*"you do not own that
  land"*) stay true. Buying land would need new ones.
- **Implementation:** ASSERTED medium. The world already models
  `canPurchaseParcel` and `getParcelPrice`, and `ownedParcels` is already saved
  (VERIFIED, `src/simulation/world/sparse-world.ts:702`, `:711`).
  `2026-08-30-two-subsystems-with-no-entrance.md` §4 puts the missing half at
  *"one command, one handler, one seeding call, one price"*.

### 3.1 The sentences a new recurring cost would make false (reservation 4)

**Eight catalogue strings end in *"until the prison earns the money"*:**
`hud.status.funds-before-deliveries-stop`, `hud.status.funds-deliveries-stopped`,
`hud.status.funds-treasury-floor-exhausted`,
`hud.alert.refusal.construction.materials-unfunded`,
`hud.alert.refusal.hire.insufficient-funds`,
`hud.alert.refusal.purchase.insufficient-funds`,
`hud.refusal.purchase-materials-past-floor` and
`hud.refusal.hire-staff-past-floor` (VERIFIED, `src/content/default-locale-en.ts`).
Each promises that earning is what lifts the stop. **Under any of A, A2 or B,
that promise becomes false for a prison whose running costs exceed its income.**
The state still pays, and the balance still falls. It stays true for a prison
with a positive net.

The first three also say *"The state pays at the end of each day, for prisoners
who have a place to sleep."* That sentence stays true.

`hud.overview.wages` (*"Wages a day"*) stays true but stops being the whole
daily bill. That makes the overview misleading by omission, not false.

**The choice of words is ours under the 2026-09-04 release. Whether each
sentence is true is the owner's.**

## 4. Through the ladder — MEASURED with the lever charged as a real debit

The lever is charged by calling `Treasury.spend(amount, 'wages')` right after
each day's sample. That is the deepest rung, so this measures the most a lever
could drain. **The rung a new cost would really sit on is an open decision.**

- **Above every rung a charge is pure arithmetic.** L100 and L150 were charged
  1,000/day for 40 days and compared field by field against the uncharged runs:
  `housed`, the unmet-need histogram, incidents, damage, daily operating delta
  and unpaid wages. **0 of 240 fields differed per run**, and the day-40 balance
  was lower by exactly 39,000. Nothing in the simulation reads the balance until
  a spend is refused. **That is why §3's DERIVED costs are exact** wherever net
  stays positive.
- **At 250 per prisoner present (lever B):**

  | prison | P | balance d1 → d21 → end | first charge refused | balance ≤ 0 | ≤ −1,250 | ≤ −10,000 |
  | --- | --- | --- | --- | --- | --- | --- |
  | L100 | 48 | 94,210 → 130,610 → **202,010** (d60) | never | — | — | — |
  | L125 | 60 | 94,050 → 26,250 → 10,730 (d60) | day 28 | — | — | — |
  | L150 | 72 | 93,970 → 7,690 → 6,170 (d60) | day 14 | — | — | — |
  | M150 | 36 | 96,410 → 31,410 → 810 (d90) | day 32 | **day 31** | day 32 | — |
  | S150 | 12 | 98,090 → 76,730 → −6,470 (d120) | day 99 | **day 92** | day 94 | — |

- **Wages were never unpaid in any of these runs.** The charge lands on the
  settlement tick just before that tick's income and payroll run. A charge too
  large to fit above the floor was **refused whole** rather than paid in part,
  so the balance never fell far enough for payroll to fail. So L150 is stalled on a positive
  balance that oscillates as each day's income lands. **Whether an unpaid
  running cost is forgiven, paid in part or accrued as arrears is itself a
  decision.** It decides whether the lever bites, and whether the save format
  moves.
- **At 290 per prisoner (L100):** 94,210 → 88,730 over 60 days, about −93/day.
  A staffed, need-meeting prison stops growing on day 1, as §3-B's ~288 predicts.

## 5. Ranking

The order is by how well each lever does the thing the ruling asks for. That
means making a *well-run* mid-game prison face a choice between two sensible
options, at a cost the treasury can feel, without breaking ADR 0096 or the
small prison.

1. **B + A2 together.** B is the only lever that thins the margin enough for
   anything to be felt. A2 is the only lever that creates a scale-dependent
   close call (§3-A2). Neither does the job alone. Both are stateless if unpaid
   is not accrued, and they share one day-boundary system and one new
   `SpendClass`.
2. **H, land (#649).** It is the only lever that turns "when does the prison
   stop growing" into a money question. It needs B or A2 before anything
   competes for the money.
3. **A, room upkeep.** It creates the same marginal-shower decision as A2, but
   it is regressive and makes the canteen pointless.
4. **F, a steeper withholding.** It is the cheapest and leaves no sentence false,
   but it punishes neglect and never forces a choice on a good player.
5. **E, repair.** It reinforces choices that are already dominant, and its cost
   is small wherever the prison is run well.
6. **C, wages.** At most 2.6% of net, so no decision moves, and it needs a new
   saved field.
7. **G, wear.** At most 4.6% of net, it creates no choice without durability
   tiers, and it is the most expensive to build.
8. **D, price drift.** Capital is two days of net, so drift is not felt, and it
   has the most readers to change.

## 6. Options the owner could choose from

Every option below leaves the magnitudes to the owner. Where a figure appears it
is the **band this record measured**, and the band is ASSERTED as the one worth
measuring next. It is not a number chosen.

1. **"Koszt utrzymania na osadzonego + koszt mediów za urządzenie" (B + A2)
   — recommended.** One new recurring spend class, charged at the day boundary
   per prisoner present and per shower head and toilet. It sits above the ADR
   0096 wages reserve, is stateless, and needs no save-format change if unpaid
   is not accrued.
   - **Measured effect in the band B 100–200 and A2 50/20:** L keeps
     4,231–9,031 a day, crowding costs 5,240–7,640 a day, and the second shower
     room at M becomes the wrong choice while the third at L stays the right
     one.
   - **Owed first:** the rung it sits on, the unpaid semantics (§4), and the
     eight *"until the prison earns the money"* sentences (§3.1).
2. **"Tylko koszt utrzymania na osadzonego" (B alone).**
   - **Measured effect:** the margin gets thinner and crowding costs real money,
     but no decision moves.
   - **When to choose it:** when the owner wants pressure first and choices
     later.
   - **Owed first:** the same three things as option 1.
3. **"Ziemia za pieniądze" (H, with B at the low end of its band).**
   - **Measured effect:** mid-game growth becomes "can I afford the next
     chunk", and every other money choice competes with that.
   - **What it costs to build:** it is larger than options 1 and 2, needing a
     command, a price, a UI and new sentences, and its fixture must reach past
     one chunk, which none here did.
4. **"Bez nowych kosztów — tylko ostrzejsza kara za zaniedbanie" (F, optionally
   with E).**
   - **Measured effect:** a well-run prison stays rich, and neglect or crowding
     costs 2–5× more.
   - **The honest cost:** it does *not* make the mid-game force a choice on a
     good player. It is listed so that "no" is a real option.

## 7. What was not measured

- **Sentence turnover.** Every arm holds its population for 40+ days on
  `sentenceLengthTicks: 400_000`. ADR 0079's 14–90 day sentences bring arrivals
  with full needs, which is the subsidy #641's costing named, so these runs are
  the stingy case for income.
- **The browser.** No lever was seen by a player, and no sentence here was read
  on a pixel.
- **Other staff roles.** Only security roles hold a post; any other role is
  refused a hire as *"only security staff can hold a post, and this prison has
  no other work for that role"* (VERIFIED,
  `hud.alert.refusal.hire.no-duty-for-role`). So lever C was sized on guards
  alone.
- **Past 60 places.** The chunk bound means no mid-game larger than one chunk
  exists to measure, and neither does lever H.
- **Two seeds, not a distribution.** The `seed2` arms agree to 0.2%. That is
  agreement, not variance.

## 8. My weakest claim

**§2's claim that the canteen is worth nothing.** It is the one measurement that,
if wrong, would change the ranking. Upkeep on a canteen would then create a
decision rather than kill a room, and lever A would rise to second place.

It rests on one fixture, one layout and one 6×6 canteen with 2 tables and
4 benches. `action.eat-in-cell` may be carrying `hunger` only because every cell
here is two tiles from a toilet and the population never leaves. The
second-strongest candidate is that a crowded or larger prison saturates the
in-cell fallback.

**What would change my mind:** the same M and L arms with `eat-in-cell` made
unavailable, or a prison past one chunk. If the canteen then earns the 40 × P
that `hunger` is worth, it joins the shower room as a second choice with a
diminishing return, and room upkeep has something real to price.

**And beside it, the claim this whole record is built on:** "a decision is a
choice whose recurring cost is close to its recurring benefit" is JUDGEMENT.
Every other number here is MEASURED or DERIVED. That criterion is how they were
ranked, and a different criterion would rank them differently.

### Added later on 2026-09-23: the weakest claim, re-run

After the owner chose B + A2, the M and L arms were re-run with
`action.eat-in-cell` disabled in the probe only. It was retargeted at a room
that does not exist, and the visit census confirmed 0 visits. `src/` was not
edited.

- **The canteen then earns** +320 (S), +932 (M) and +1,630 (L) a day, and a
  second canteen earns +282 (L) and +315 (X) (MEASURED).
- **So the §2 finding holds for the shipped tree, and its mechanism is
  confirmed:** the in-cell fallback fully replaces the canteen.
- **The same pass found a toilet decorative.** Cells with no toilet ran
  `use-toilet` at exactly the same rate, because the `own-accommodation` branch
  of `ActionSystem` never checks `requiredObjectCapability`.

Both findings and the measured number sets are in
[`docs/adr/drafts/XXXX-what-a-prison-costs-to-run.md`](../adr/drafts/XXXX-what-a-prison-costs-to-run.md).
