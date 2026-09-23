# ADR XXXX: What a prison costs to run

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`). This draft pre-commits to being
> renumbered without argument, along with every citation of it added by the same
> branch. Today there is none outside this file.

## Status

**Proposed, 2026-09-23. Not self-approved, and it carries no code.**

It implements the direction the owner chose on
[#962](https://github.com/woogitsu/lockstate/issues/962) on 2026-09-23. They
picked the option labelled *"Koszt na osadzonego + media (zalecane)"*: a daily
running cost per prisoner plus a per-fixture utility cost. That is the weaker
provenance, an option label the integrator wrote rather than a sentence the
owner typed. It is recorded on #962.

The owner was promised that **the numbers come back to them before any code.**
So this document decides the *shape* only:

- the spend class and when it is charged;
- the rung it stops at;
- what an unpaid charge does;
- which sentences move.

It puts **every magnitude** to the owner as one of three measured number sets
(§6). It changes no `src/` file and no balance value.

**Evidence:**
[`docs/research/2026-09-23-what-would-make-mid-game-money-a-decision.md`](../../research/2026-09-23-what-would-make-mid-game-money-a-decision.md)
(levers B and A2, and its §2 table of marginal choices). §6 below adds a second
pass run for this draft, under the semantics decisions 3 and 4 propose.

## Claim tiers used below

- **MEASURED**: the real `Kernel`, the real `packCommand` and the real session
  command router, on the research record's fixture. That fixture is 2×3
  two-place cells, a yard, 1–3 shower rooms with two heads each and one canteen.
  Guards are hired to `max(1, ceil(P/8))` and the opening balance is 100 000.
  Where §6 says "charged", the charge was a real `Treasury.spend`, applied on the
  settlement tick *after* that tick's `economy.state-income` (120) and
  `economy.payroll` (130) had run, which is exactly where decision 2 puts it.
- **DERIVED**: arithmetic on MEASURED samples or on constants that were opened
  and read. The step is shown.
- **ASSERTED**: judgement, including every candidate rate.

## Context

The research record measured three things this ADR builds on:

- **Wages are 3.33–3.35% of income** at every size staffed to requirement.
- **Every discretionary choice is dominated by 10× or more.** The first shower
  room is worth +320/+955/+2,057 a day at 8/24/48 places. The last guard to
  requirement is worth +803 to +2,026. Crowding costs −400 to −2,840.
- **Only extra shower rooms have a diminishing return:** the second room at 24
  places is worth +36, and the second and third at 48 places +207 and +205.

A per-prisoner cost (lever B) is the only lever that thins the margin. A
per-fixture cost (lever A2) is the only one that makes the marginal shower room
a choice whose answer depends on the prison's size. Neither does the job alone.

The rung ladder these costs must fit into (VERIFIED,
`src/simulation/economy/treasury.ts`, with the #641 commit applied):

| spend class | mature rung | starter rung (fresh, unfurnished: `totalResidentCapacity === 0`) |
| --- | --- | --- |
| `deliveries` | −1,250 | −1,185 (`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`) |
| `construction` | −1,250 | −1,250 |
| `hiring` | −1,250 (deliveries' threshold, ADR 0017 amendment §3c) | −1,185 |
| `wages` | the overdraft floor, **−10,000** (`Number.NEGATIVE_INFINITY` clamped by `rungFloorMinorUnits`) | **−55** = −1,250 + `WAGES_STARTER_RESERVE_MINOR_UNITS` (1,195): ADR 0096 decision 2's reserve |

Every rung is `Math.max(rung, overdraftFloor)` (`rungFloorMinorUnits`). A spend
is all-or-nothing: `canAfford` asks `balance − amount ≥ floorFor(class)`.
`PayrollSystem` is the one caller that part-pays. It bounds the day by
`balance − floorFor('wages')` and carries the rest as arrears, which are
bounded prospectively at `ARREARS_BOUND_MINOR_UNITS` (10,000). What is above the
bound is forgiven (ADR 0096 decision 3(c)).

**Two facts found while drafting that change what a fixture rate can do** (both
MEASURED):

1. **A toilet is decorative.** On 8-, 24- and 48-place prisons built with *no*
   toilet in any cell, `action.use-toilet` ran 2.513 visits per prisoner-day,
   exactly as it did with a toilet in each cell. Income, needs and incidents
   matched the toilet arms to the unit.

   The cause is read, not guessed. `ActionSystem.prisonProvides` and
   `resolveTargetInstance` resolve an `own-accommodation` action by room id and
   never consult `requiredObjectCapability`, so `use-toilet`'s `'sanitation'` is
   never enforced (`src/simulation/prisoners/action-system.ts`, the
   `own-accommodation` branches).

   **A per-toilet charge on today's tree would therefore be a pure tax that
   teaches the player to stop building toilets.** That contradicts the closed
   #933's premise that the toilet is what makes a room a Cell. This ADR does not
   fix it (`src/` is not touched), and it proposes **a toilet rate of 0 until
   the requirement is enforced**.
2. **The canteen earns nothing only because eating in the cell fully replaces
   it.** Re-run with `action.eat-in-cell` retargeted, in the probe only, at a
   room that does not exist (0 visits, confirmed by census), the canteen is
   worth **+320 (8), +932 (24), +1,630 (48)** a day. A second canteen is worth
   **+282 (48) and +315 (60)**. With the fallback in place it is worth 0, −37 and
   −45.

   So the canteen is a second diminishing-return choice *waiting behind one
   rule*. The research record's weakest claim holds for the shipped tree, and
   its mechanism is now measured. This ADR prices no canteen, because the ruling
   names prisoners and fixtures, not rooms.

## Decision

### 1. One new spend class, `'running-costs'`

`SpendClass` gains a fifth member. A day's running costs are:

> `due = perPrisoner × prisonersPresent + perShowerHead × showerHeads + perToilet × toilets`

- **`prisonersPresent`** is every admitted prisoner not yet discharged, housed or
  not: the same population `crowdingExcessPermille` reads. **This is what makes
  crowding cost money directly:** an unhoused prisoner earns nothing and costs
  the full rate.
- **Fixtures** are counted over `PlacedObjectRegistry` by object catalogue id,
  for completed objects only. A build order still standing costs nothing to run.
- All three rates are whole minor units per day, as integer arithmetic.
  **Nothing is persisted:** each term is a pure function of state the save
  already carries, so there is no RNG stream and no new field. The balance a
  determinism fingerprint hashes moves, as it does whenever money moves.

### 2. When it is charged: once a day, after income and payroll

A new `economy.running-costs` system is scheduled like payroll
(`intervalTicks: DAY_LENGTH_TICKS`, `phaseTicks: DAY_LENGTH_TICKS − 1`). Its
order is **132**, between `economy.payroll` (130) and
`economy.insolvency-rungs` (135). The edit to
`tests/determinism/kernel-system-order.test.ts` is reviewed.

That order has two consequences:

- **The day's grant is in the balance before the charge.** A prison that earns
  more than it costs is never refused a charge it could pay.
- **Wages have priority over running costs.** MEASURED: in every arm of §6,
  including the three that pinned at the rung for 8–41 days, `unpaidWages` never
  left 0.

### 3. Which rung it stops at: the deliveries rung, and the reserve line in a fresh prison

> **Mature:** `'running-costs'` → `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` (**−1,250**).
> **Starter:** `'running-costs'` → `STARTER_RUNG_WAGES_FLOOR_MINOR_UNITS` (**−55**).

Both are **existing numbers**, so no fifth threshold is authored. That is the
same discipline ADR 0017 amendment §3c applied to hiring.

- **Above ADR 0096's reserve, as the brief requires.** ADR 0096 decision 2 says
  *"the prison may never be spent or charged into a position where the cheapest
  complete earning unit is unaffordable"*. In a fresh, unfurnished prison it
  discharges that by stopping `wages` at −55, which leaves 1,195 above the
  construction rung. Running costs stopping at the same −55 cannot eat that
  reserve.

  In a mature prison there is no reserve line, because the prison already
  houses someone. Running costs then stop **8,750 above** the wage rung, so
  staff are paid first and deepest.
- **It keeps ADR 0017 decision 8's order.** Running costs stop with deliveries,
  construction and hiring, and wages alone go on to the floor. A cost that could
  follow wages into the overdraft would compete with the payroll for the last
  8,750 of room, which is the ordering that amendment exists to prevent.
- **Measured consequence.** A loss-making prison pins at −1,250. Wages are paid,
  and deliveries, construction and hiring are all refused, because they share
  the rung. It leaves that state only by **making its day positive**: admitting
  fewer, removing heads, or waiting for sentences to end. That is the decision
  the ruling asked the mid-game to force.

**Considered and not taken:**

- **Rung 0: running costs are paid only out of a positive balance.** This is
  the one alternative worth the owner's attention, because **it leaves all eight
  §5 sentences true unchanged.** A prison below zero then climbs whenever income
  outruns wages alone, exactly as today.

  The cost is the bite. A loss-making prison hovers at zero with its running
  costs silently forgiven, and it can still spend 1,250 of overdraft on
  materials every time income lifts it. Running costs become *"paid from
  profit"* and never stop anything. Option **R2** in §7 names this.
- **The overdraft floor, as wages.** Rejected, for the ordering reason above.
  In a fresh prison it would also need its own starter clamp, or it would eat
  the reserve.

### 4. What an unpaid charge does: part-paid down to the rung, the rest forgiven that day

> `paid = max(0, min(due, balance − floorFor('running-costs', isFreshUnfurnishedPrison)))`; `due − paid` is **forgiven**, not carried.

That is `PayrollSystem`'s bounded-payment line applied to a new class, without
the arrears half. It is chosen over the other two readings on measured grounds:

- **Refused whole** (all-or-nothing `spend`) is rejected. The research record's
  §4 measured it: a charge bigger than the room above the rung is refused
  entirely. The prison then sits *above* the rung on a balance that oscillates,
  and pays nothing at all on exactly the days it can least afford to. It is a
  free lunch shaped by the size of the charge.
- **Carried as arrears** is not taken, and the reason is the bound.
  `ARREARS_BOUND_MINOR_UNITS` is 10,000. The prisons that go unpaid are losing
  **1,808–4,640 a day** once pinned (MEASURED, §6 set C, forgiven per day at the
  rung). So a 10,000 bound is two to five days of charges, after which ADR 0096
  decision 3(c) forgives the rest anyway.

  Arrears would therefore add a saved figure (a `SAVE_SCHEMA_VERSION` bump from
  6, or an optional field with a migration default), a repayment order against
  wage arrears, and a second "owed" readout. All of that would buy a two-to-five
  day delay in a forgiveness that happens regardless. A separate, larger bound
  would be a new magnitude, and it is listed as a question (§8) rather than
  assumed.
- **What forgiveness does not do:** it does not create money. The money
  conservation property (`tests/integration/economy-money-conservation.test.ts`)
  is about minor units moving between the balance and the ledgers. A charge not
  taken moves nothing. The implementation must still assert
  `paid + forgiven === due` every day.
- **What the player is told:** a day on which `forgiven > 0` fires **one** event
  per day, not per tick, as `wages-unpaid` does. It needs a new sentence (§5.3).

### 5. What the player is told

#### 5.1 Seven strings become false under decision 3; one stays true

Each of the eight strings ending *"until the prison earns the money"* promises
that earning lifts the stop. Under decisions 2–4 a prison at the −1,250 rung
receives its grant, pays its wages, and then has running costs taken back down
to the rung. **So it earns and does not rise.**

The exact condition, DERIVED from decisions 2–4 for a balance at or below the
rung, is that the day ends above the rung **if and only if**

> `stateIncomeForCompletedDay(source) > wagesDueToday + runningCostsDueToday`

where `wagesDueToday` is `PayrollSystem`'s `due` (the day's bill plus arrears).
Below the rung, running costs are not charged. There, income only has to outrun
wages to *reach* the rung, and outrun both to pass it.

**`hud.status.funds-treasury-floor-exhausted` stays true**, which is why the
count is seven and not eight. It fires only at the overdraft floor, and running
costs are never charged below −1,250, so they cannot hold a prison at the floor.
Its *"until the prison earns the money"* is exactly as true as it is today.

The rewrites below are ASSERTED wording. **The choice of words is ours under the
2026-09-04 release; whether each is true is the owner's.** Each one claims only
what the condition above keeps. *"Climbs back"* is not *"earns"*, because a
`SellMaterials` credit also lifts the balance and none of these sentences should
deny that.

| key | today (EN / PL) | proposed EN | proposed PL | true when |
| --- | --- | --- | --- | --- |
| `hud.status.funds-before-deliveries-stop` | *"{remaining} left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a place to sleep."* / *"Do wstrzymania dostaw zostało {remaining} — poniżej tego progu nie można zamówić materiałów, dopóki więzienie nie zarobi. Państwo płaci…"* | *"{remaining} left before deliveries stop — past that, no materials can be ordered until the balance climbs back, and income only lifts it past that line on a day it outruns wages and running costs. The state pays at the end of each day, for prisoners who have a place to sleep."* | *"Do wstrzymania dostaw zostało {remaining} — poniżej tego progu nie można zamówić materiałów, dopóki saldo nie odbije, a przychód wyprowadza je ponad ten próg tylko w dniu, w którym przewyższa pensje i koszty utrzymania. Państwo płaci na koniec każdego dnia, za osadzonych, którzy mają miejsce do spania."* | `remaining = balance − floorFor('deliveries') > 0`; the second clause is the condition above |
| `hud.status.funds-deliveries-stopped` | *"Deliveries have stopped — no materials can be ordered until the prison earns the money. The state pays…"* / *"Dostawy wstrzymane — nie można zamówić materiałów, dopóki więzienie nie zarobi. Państwo płaci…"* | *"Deliveries have stopped — no materials can be ordered until the balance climbs back, and income only lifts it past the line on a day it outruns wages and running costs. The state pays at the end of each day, for prisoners who have a place to sleep."* | *"Dostawy wstrzymane — nie można zamówić materiałów, dopóki saldo nie odbije, a przychód wyprowadza je ponad próg tylko w dniu, w którym przewyższa pensje i koszty utrzymania. Państwo płaci na koniec każdego dnia, za osadzonych, którzy mają miejsce do spania."* | `remaining ≤ 0 && !atTreasuryFloor`: `src/ui/hud/projection.ts:810-811`, `if (atTreasuryFloor(counts)) return` |
| `hud.status.funds-treasury-floor-exhausted` | *"The treasury is at its floor — nothing can be spent at all until the prison earns the money. …"* | **unchanged** | **unchanged** | `atTreasuryFloor`; running costs are not charged at or below −1,250 |
| `hud.alert.refusal.construction.materials-unfunded` | *"The build queue is stalled — no more materials until the prison earns the money."* / *"Kolejka budowy stoi — żadnych nowych materiałów, dopóki więzienie nie zarobi."* | *"The build queue is stalled — no more materials until the balance climbs back, and income only gets it there by outrunning wages and running costs."* | *"Kolejka budowy stoi — żadnych nowych materiałów, dopóki saldo nie odbije, a przychód wyprowadzi je ponad próg tylko wtedy, gdy przewyższy pensje i koszty utrzymania."* | construction refused at `floorFor('construction')`, the same −1,250 |
| `hud.alert.refusal.hire.insufficient-funds` | *"Nobody was hired — hiring is refused until the prison earns the money."* / *"Nikogo nie zatrudniono — zatrudnianie jest wstrzymane, dopóki więzienie nie zarobi."* | *"Nobody was hired — hiring is refused until the balance climbs back, and income only gets it there by outrunning wages and running costs."* | *"Nikogo nie zatrudniono — zatrudnianie jest wstrzymane, dopóki saldo nie odbije, a przychód wyprowadzi je ponad próg tylko wtedy, gdy przewyższy pensje i koszty utrzymania."* | hire refused at `floorFor('hiring')`, −1,250 mature and −1,185 starter |
| `hud.alert.refusal.purchase.insufficient-funds` | *"Nothing was bought — deliveries are refused until the prison earns the money."* / *"Nic nie kupiono — dostawy są wstrzymane, dopóki więzienie nie zarobi."* | *"Nothing was bought — deliveries are refused until the balance climbs back, and income only gets it there by outrunning wages and running costs."* | *"Nic nie kupiono — dostawy są wstrzymane, dopóki saldo nie odbije, a przychód wyprowadzi je ponad próg tylko wtedy, gdy przewyższy pensje i koszty utrzymania."* | purchase refused at `floorFor('deliveries')` |
| `hud.refusal.purchase-materials-past-floor` | same text as the row above, EN and PL | same as the row above | same as the row above | `refusalMessageKey('purchase-materials', 'past-the-overdraft-floor')`: `src/ui/hud/projection.ts:1344-1347`, `if (reason === 'past-the-overdraft-floor')` |
| `hud.refusal.hire-staff-past-floor` | same text as `hire.insufficient-funds`, EN and PL | same as `hire.insufficient-funds` | same as `hire.insufficient-funds` | `refusalMessageKey('hire-staff', 'past-the-overdraft-floor')` |

**Two edge cases, stated so nobody finds them later:**

- In a **fresh, unfurnished prison** there is no income at all, because
  nobody has a bed. So "income only gets it there by…" is vacuously true.
- In the band **−1,185 to −55** of the starter ladder, running costs are not
  charged. Income there would only need to outrun wages, but that income is 0.

#### 5.2 A sentence that stays true but stops being the whole bill

`hud.overview.wages` (*"Wages a day"* / *"Pensje dziennie"*) is still true.
**Proposed:** a sibling row `hud.overview.running-costs` with *"Running costs a
day"* / *"Koszty utrzymania dziennie"*, showing `due`. Its breakdown
(prisoners × rate, heads × rate, toilets × rate) goes in the tooltip, so that the
overview again adds up to the whole daily outgoing.

#### 5.3 One new event

`hud.alert.event.economy.running-costs-forgiven`:

- **EN:** *"Running costs went partly unpaid today — {forgiven} was written off,
  and deliveries, building and hiring stay stopped until the day's income
  outruns wages and running costs."*
- **PL:** *"Koszty utrzymania nie zostały dziś w pełni opłacone — umorzono
  {forgiven}, a dostawy, budowa i zatrudnianie pozostają wstrzymane, dopóki
  dzienny przychód nie przewyższy pensji i kosztów utrzymania."*

It is true when it fires with `forgiven > 0`, because decision 4 only forgives
when `balance − rung < due`. That leaves the balance at the −1,250 rung, where
all three of those spends are refused.

### 6. Three number sets, measured

The format is (per prisoner present / per shower head / per toilet), per day,
minor units. The charge per day is DERIVED from the formula in decision 1 and
applied exactly as charged. Net per day is MEASURED over days 11–60, or over the
days before the prison pinned at the rung.

| prison (P) | **A** 100 / 50 / 0: charge → net | **B** 150 / 100 / 0: charge → net | **C** 200 / 150 / 20: charge → net |
| --- | --- | --- | --- |
| S100 (8) | 900 → **+1,420** | 1,400 → **+920** | 1,980 → **+340** |
| S125 (10) | 1,100 → +820 | 1,700 → +220 | 2,380 → **−460** |
| S150 (12) | 1,300 → +618 | 2,000 → **−82** | 2,780 → **−862** |
| M100 (24) | 2,600 → **+4,325** | 4,000 → **+2,925** | 5,640 → **+1,285** |
| M125 (30) | 3,200 → +2,685 | 4,900 → +985 | 6,840 → **−955** |
| M150 (36) | 3,800 → +1,906 | 5,800 → **−94** | 8,040 → **−2,307**, pinned at −1,250 from **day 43** |
| L100 (48) | 5,100 → **+8,734** | 7,800 → **+6,034** | 10,980 → **+2,854** |
| L125 (60) | 6,300 → +5,162 | 9,600 → +1,862 | 13,380 → **−1,927**, pinned from **day 53** |
| L150 (72) | 7,500 → +3,524 | 11,400 → **−376** | 15,780 → **−4,870**, pinned from **day 20** |

For comparison, today's net is S 2,320, M 6,923 and L 13,831 (MEASURED).

**The size-dependent choices each set creates.** These are MEASURED net/day
differences, with the choice made:

| choice | A | B | C |
| --- | --- | --- | --- |
| first shower room at 8 | +220 **build** | +120 **build** | **+20: a coin toss** |
| second shower room at 24 | **−57: skip** | **−157: skip** | **−257: skip** |
| second / third shower room at 48 | **+85 / +103: build** | **−15 / +3: a coin toss** | **−115 / −97: skip** |
| admit to 125% | costs −1,640 (M) / −3,572 (L) against 100% | still positive everywhere | **negative everywhere** |
| admit to 150% | still positive | **negative everywhere** | **pins at the rung** (L on day 20) |
| toilet in a cell | nothing to choose (rate 0) | nothing to choose (rate 0) | **dominated: skip it**, saves 20/cell/day and loses nothing (MEASURED, §Context fact 1) |
| guards to requirement | unchanged (the §2 cliff, +803 to +2,026) | unchanged | unchanged |

**When a prison staffed to requirement and meeting its needs stops growing:**

- **Never, under any of the three sets, at 100% occupancy.** All nine 100% arms
  stayed positive for 60 days (MEASURED).
- **The rate that would stop it on day 1** is DERIVED as
  `(net₁₀₀ − h × heads − t × toilets) / P`. At `h = 100`, `t = 0` that is
  **265 / 272 / 276** for S / M / L, and **243 / 253 / 259** at `h = 150`,
  `t = 20`.
- **What stops, and when, is the crowded prison.**
  - Under B, 150% occupancy loses 82–376 a day. From the 100 000 opening that
    is ~250+ days before it reaches the rung (DERIVED; L150 was at 71,290 on
    day 60, MEASURED).
  - Under C, 125% loses 460–1,927 a day and 150% loses 862–4,870. L150 pins on
    day 20, M150 on day 43, and L125 on day 53 (MEASURED).
- **The economy has no time axis** (research record §1), so a prison that
  is growing on day 11 is growing on day 60.

**ADR 0096's cheapest earning unit under each set:** one cell and one unguarded
prisoner earn 260 once `safety` is unmet. MEASURED in the research record,
S100 with 0 guards reads exactly 1.000 unmet need per housed prisoner-day. That
unit clears **+160 / +110 / +40** under A / B / C (C includes the one toilet at
20). So it stays positive under every set, and ADR 0096 decision 1's
income-line guarantee is untouched.

### 7. The options the owner is asked to click

1. **"Zestaw B — 150 / 100 / 0 (zalecane)".**
   - **What it does:** the first shower room pays everywhere. Extra rooms are a
     loss at 24 places and a wash at 48. 150% crowding loses money everywhere
     but slowly, so crowding becomes a mistake you can see rather than a trap.
     A 48-place prison keeps 6,034 a day, 44% of today's.
   - **Recommended because** it is the only set in which the marginal-room
     answer really depends on the prison, without making the small prison's
     first room a coin toss.
2. **"Zestaw A — 100 / 50 / 0 (łagodny)".**
   - **What it does:** only the second room at 24 places flips. Crowding stays
     profitable to 150%, so the money does not stop it. The margin falls to
     61%/62%/63% of today's.
3. **"Zestaw C — 200 / 150 / 20 (ostry)".**
   - **What it does:** every extra shower room is a loss, and the small prison
     cannot tell whether its first one pays. 125% crowding loses money and 150%
     pins at the rung within 20–43 days.
   - **Its toilet rate is a tax with no choice behind it** until the
     `'sanitation'` requirement is enforced. Choosing C is also choosing to fix
     that first, or to set the toilet rate to 0.

**And, separately, on decision 3:**

- **"R1 — próg dostaw −1 250 (zalecane)":** seven sentences are rewritten
  (§5.1).
- **"R2 — tylko z dodatniego salda":** no sentence changes, and running costs
  never stop anything.

## Consequences

- **Code, once the numbers are chosen.** ASSERTED medium:
  - one `SpendClass` member, and an entry in each of `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`
    and `STARTER_RUNG_FLOORS_MINOR_UNITS`;
  - one day-boundary system at order 132, with a reviewed edit to the
    kernel-order test;
  - three rate constants;
  - a status-counts field for `due` and `forgiven`;
  - an overview row and one event;
  - seven catalogue rewrites in two locales.
- **Save and determinism.** No `SAVE_SCHEMA_VERSION` change: decision 4
  forgives, and every term is derived from state already saved. No RNG stream.
  Integer arithmetic only.
- **Tests that must move.** Every integration test asserting a daily balance
  delta on a prison with prisoners or shower heads. The money-conservation
  property gains the `paid + forgiven === due` invariant. The kernel-order test
  gets one new row.
- **What this does not decide.** It sets no canteen rate (fact 2). It does not
  fix the toilet (fact 1). It changes no wage, grant or withholding. It leaves
  alone the guard coverage cliff, which is why no rate here moves the guard
  decision.

## 8. Questions for the owner

1. **Which number set: A, B or C (§7)?** Or a fourth, which the probe can
   measure in about a minute.
2. **R1 or R2 (decision 3)?** Do running costs stop at the −1,250 deliveries
   rung and rewrite seven sentences, or are they paid only out of a positive
   balance, keeping every sentence and never stopping anything?
3. **Forgive, or carry a separate arrears figure with its own bound (decision
   4)?** Carrying one needs a magnitude and a save field. At a 10,000 bound it
   delays forgiveness by only 2–5 days.
4. **The seven rewrites and the new event (§5).** Are they true enough to ship,
   in both languages?
5. **The toilet (fact 1).** Should the `'sanitation'` requirement be enforced
   before any toilet is priced? That fix is a behaviour change outside this ADR,
   and it would also change every prison's `bladder`.
6. **The canteen (fact 2).** Should `eat-in-cell` stay a full substitute for the
   canteen? It is the rule that makes a canteen worth 0 today and +320 to +1,630
   without it.
