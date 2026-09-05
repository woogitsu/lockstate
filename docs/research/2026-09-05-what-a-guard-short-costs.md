# What a guard short costs — 2026-09-05

Issue [#1004](https://github.com/matmaxalez/lockstate/issues/1004). A headless
measurement of the guard-shortage → classification → recreation loop, on the
instrument [#997](https://github.com/matmaxalez/lockstate/issues/997) built and
[#1003](https://github.com/matmaxalez/lockstate/issues/1003) extended
(`tests/research/2026-09-05-yard-at-scale.research.ts`, acts P–T).

**No production file was edited to produce any figure below.** Three
attribution mutations were made and reverted; each is quoted with its
`sha256sum` in §7.

---

## The claim under test

#1004 was opened from a side observation of the #997 pass, which recorded it
and deliberately did not chase it. In the issue's own words:

> Mniej strażników obniża `safety`, niższe `safety` promuje do `high-risk`,
> `high-risk` skraca rekreację, krótsza rekreacja podnosi niezaspokojone
> potrzeby, a niezaspokojone potrzeby obcinają dochód … czyli **gracz ma mniej
> pieniędzy na strażników, których mu brakowało.** Nikt nie zmierzył, czy ta
> pętla ma punkt, z którego nie ma powrotu.

("Fewer guards lower `safety`, lower `safety` promotes to `high-risk`,
`high-risk` shortens recreation, shorter recreation raises unmet needs, and
unmet needs cut income — so **the player has less money for the guards they
were short of.** Nobody has measured whether this loop has a point of no
return.")

Four questions were asked: does the loop close financially; where is the
threshold and is the promotion reversible; can the player see it; and change no
balance.

---

## The answer in one paragraph

**The loop does not close, and it cannot: the marginal guard returns about
sixty-eight times its own wage.** At a hundred prisoners the thirteenth guard
is worth **5,420 a day** on the income line and costs **80** — measured, not
derived — and every prison in every arm of every act ended richer than it
started, the worst of them at **664,030** from a 25,000 opening grant. **The
chain in the issue is wrong in its middle two links, and correcting them makes
the finding sharper rather than softer.** `reviewClassification` has no
`safety` term at all: the promotion runs on **disciplinary findings**, and what
writes a finding onto every prisoner at once is a **riot**, whose
`participantIds` is the sector's occupants — measured at 100 participants a
riot. And the promotion to `high-risk` **does not cost the prison money**: the
regime it moves a prisoner to shortens `recreation` to a third but
**quadruples** the `hygiene` window and more than doubles `meal`, and at a
hundred prisoners the trade is net **favourable** — 176 unmet needs at twelve
guards against **150** at seven, with the grant identity exact to the unit in
both. What *does* cost is a single binary step: **`resolveSectorCoverageState`
has no gradient, so one guard short and twelve guards short are the same
prison**, both provisioning `safety` at half rate, both bottoming out at **2
permille**, both losing the whole population's `safety` — and hiring five of
the six missing guards buys **nothing at all**. The promotion is **reversible
on a timer and not on staffing**: a prison stripped to one guard promoted 49 of
49 at day 20 and was back to 37 general-population / 8 high-risk at day 40
**while still short**. And the player is shown the shortage and shown the
consequence — but the consequence sentence exists on the `unguarded` rung
**only**, so the rung that costs everything is the one rung with nothing said
about it.

---

## Reproduction

```
$ git -C /workspace/lockstate worktree add /workspace/wt-1004 \
    -b measure/1004-guard-shortage-loop origin/research/1003-hygiene-scale-cliff
$ ln -sfn /workspace/lockstate/node_modules /workspace/wt-1004/node_modules
$ cd /workspace/wt-1004

# #1004's acts only (P, Q, R, S; T separately -- it is pure derivation):
$ node /workspace/lockstate/node_modules/vitest/vitest.mjs run \
    --config tests/research/vitest.research.config.ts -t '#1004'
 Test Files  1 passed (1)
      Tests  4 passed | 14 skipped (18)
   Duration  90.72s
```

`pnpm <script>` aborts in a worktree with `ERR_PNPM_UNSAFE_MODULES_DIR`
(`docs/AGENT_WORKFLOW.md` §2), so the binaries are called directly. Never pass
`--reporter=line`; it is dead in this repository's vitest 4.1.11.

### The prison, and what changed from #1003's

Identical to #997's and #1003's, so a row here and a row there are rows about
the same prison: one 11×10 cell with fifty beds and a toilet (21×10 and a
hundred beds for the `n = 100` acts), one 8×8 yard at the cell door, one 3×3
shower room, one 6×6 canteen, `ADMIT_AT` 9,599, money read from the production
`stateIncomeForCompletedDay`.

Three things are new and only three:

1. **The run is thirty in-game days rather than twenty**, and the reason is not
   convergence. `ClassificationReviewSystem` — the *only* system that may write
   `'high-risk'`, see §2 — is scheduled
   `{ intervalTicks: 24_000, phaseTicks: 23_999 }`, so it runs at 23,999,
   47,999, 71,999… A prisoner admitted at 9,599 is not reviewable at 23,999
   (`classifiedAtTick + CLASSIFICATION_REVIEW_INTERVAL_TICKS` is 33,599), so the
   first review that can touch this intake is **47,999** and twenty days
   (tick 57,599) passes exactly one. Thirty days reaches 81,599 and passes two,
   which is the minimum that can show a promotion *and* a demotion. Act S runs
   fifty days and passes four.
2. **Guards can be hired or dismissed mid-run** (`hireGuardsAt`,
   `dismissGuardsAt`). Two static runs cannot answer "is it reversible": a
   promotion that never happened is not a promotion that was undone.
3. **The measurement carries a per-day series** — median `safety`, unmet
   `safety`, required/assigned guards, the coverage rung, and the
   general-population/high-risk split at every day boundary. Both of #1004's
   questions are about *when*, and an end-state readout cannot tell a prison
   that was never promoted from one that was promoted and recovered.

### The one assertion that is a gate rather than a fixture check

`expectGrantReconciles` requires
`settledGrant === occupied × 300 − Σ(unmet) × 40`, where the left side is
`stateIncomeForCompletedDay`'s own walk over occupied places and the right side
is recomputed from the unmet-need histogram — a different walk over a different
accessor. Neither side is computed by the other. It runs on every row of acts
Q, R and S and it is red under a mutation of the income arithmetic (§7).

---

## 1. MEASURED — the loop cannot close, and the margin is two orders of magnitude

Act P, from the production constants with nothing simulated:

```
  one guard: 80 a day to keep (staffDailyWageMinorUnits), and the same again once to hire
  DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8
  STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300, withheld per unmet need 40
```

`staffDailyWageForRole` returns `role.wageBand.minPerDay`
(`src/simulation/economy/wages.ts`), and `staff-role.guard`'s band is
`{ minPerDay: 80, maxPerDay: 140 }` (`src/content/staff-role-catalog.ts:150`).
`staffHireCostMinorUnits` delegates to the same function, so the engagement fee
is one day of wage.

So a guard costs **10 per prisoner-day** at the eight prisoners
`DEFAULT_SECTOR_PRISONERS_PER_GUARD` gives them
(`src/simulation/security/sector-staffing.ts:147`), against a grant of **300**
and a *floor* of 60 with all six needs unmet
(`stateIncomeForPrisonerDayAt`, `src/simulation/economy/income.ts:607`). **A
fully staffed prison spends 3.3% of its worst-case income on guards.** There is
no arithmetic in which that closes.

The measured figure is far more lopsided than that ratio, because coverage is
not marginal. Act R, `n = 100`, three seeds, thirty days, the establishment
being `max(1, ceil(100/8)) = 13`:

| guards | rung | safety permille | grant, seed `0x997` / `0x1004` / `0xbeef` | high-risk of ~100 | treasury at day 33 |
| --- | --- | --- | --- | --- | --- |
| 14 | `covered` | 1000 | 27,040 / 28,160 / 27,800 | 17 / 12 / 11 | 771,590 / 772,190 / 765,230 |
| **13** | `covered` | 1000 | **28,080 / 27,880 / 28,080** | 14 / 12 / 11 | 765,390 / 769,670 / 769,070 |
| **12** | `understaffed` | **2** | **22,660 / 23,640 / 23,160** | 19 / 14 / 14 | 689,850 / 697,590 / 697,310 |
| 10 | `understaffed` | 2 | 23,580 / 24,120 / 23,540 | 13 / 12 / 13 | 688,250 / 694,550 / 696,490 |
| 7 | `understaffed` | 2 | 23,100 / 22,980 / 23,140 | **97 / 97 / 97** | 687,190 / 688,590 / 687,350 |
| 4 | `understaffed` | 2 | 23,140 / 23,060 / 23,100 | **97 / 97 / 97** | 679,190 / 678,710 / 678,950 |
| 1 | `understaffed` | 2 | 23,180 / 23,220 / 23,220 | **97 / 97 / 97** | 712,550 / 717,630 / 711,310 |
| 0 | `unguarded` | 0 | 23,180 / 23,260 / 23,020 | **97 / 97 / 97** | 664,030 / 663,910 / 663,910 |

**Every treasury in the table grew, from an opening balance of 25,000**
(`TREASURY_STARTING_BALANCE_MINOR_UNITS`, `src/simulation/economy/treasury.ts:203`).
The worst-run prison in this record — a hundred prisoners and **no guard at
all**, nine lapsed riots, every prisoner on the restricted timetable — finished
thirty days holding **664,030**, which is 26 times what it opened with. There is
no point of no return in this game at these constants, and nothing measured here
approaches one.

The band is narrow across seeds: at the establishment, 27,880–28,080; one guard
short, 22,660–23,640. So the single-guard step is **4,240 to 5,420 a day**, and
its exact form on seed `0x997` is worth writing out because it is exact:

- 13 guards: 100 occupied, unmet needs `hunger 4 + hygiene 34 + recreation 10 = 48`.
  `100 × 300 − 48 × 40 = 28,080`. ✔ matches the printed grant.
- 12 guards: 99 occupied, unmet needs `hunger 29 + hygiene 35 + recreation 13 + safety 99 = 176`.
  `99 × 300 − 176 × 40 = 22,660`. ✔ matches the printed grant.

**5,420 a day for 80 a day is 68×.** #1003's identity holds to the unit in every
row of this record, which is why `expectGrantReconciles` is an assertion rather
than an observation.

---

## 2. MEASURED — the issue's causal chain has no `safety` in it, and the promoter is a riot

`reviewClassification` (`src/simulation/prisoners/classification.ts:191`) reads
**four** named factors and `safety` is not among them:

```
const factors: ClassificationFactors = { sentence, intakeHistory, findings, cleanConduct };
const score = sentence + intakeHistory + findings + cleanConduct;
const riskTier = clampTier(score);
```

`classificationGroupIdForTier` is `riskTier >= 3 ? 'high-risk' : 'general-population'`
(`:59`), so only tier 3 changes a prisoner's day. The `findings` term is
`Math.min(MAX_FINDINGS_TERM, disciplinary.points)` with `MAX_FINDINGS_TERM = 3`
(`:127`), and this fixture's admission is `sentenceLengthTicks: 400_000` — over
`LONG_SENTENCE_THRESHOLD_TICKS` (200,000), so `sentence = 1` — with
`priorIncidents: 0`. **So `1 + 0 + 3 + 0 = 4`, clamped to 3: a single saturating
disciplinary record is the whole of the promotion, and nothing else in this
fixture can reach tier 3.**

**Correction to the issue and to the brief: `ClassificationEarlyWarningSystem`
cannot promote anybody to `high-risk`.** It is capped at
`EARLY_WARNING_TIER_CEILING = 2`
(`src/simulation/prisoners/classification.ts:249`) and writes
`classificationGroupIdForTier(cappedTier)` rather than the assessment's own
group, with its own code comment saying why:

> `cappedTier` is at most `EARLY_WARNING_TIER_CEILING` (2), which
> `classificationGroupIdForTier` always maps to `'general-population'` — only
> tier 3 ever crosses into `'high-risk'` — so this write can never move a
> prisoner's regime, only their published tier.
> — `src/simulation/prisoners/classification-early-warning-system.ts:157-162`

Both #1004 and the brief name it as one of two systems promoting the
population. It is one of two systems writing a **tier**; exactly one writes a
**group**.

**What writes a finding onto everybody at once is a riot.** The incident census
is the column that separates the mechanisms — it carries the mean participant
count, and at `n = 100`, seed `0x997`:

| guards | incidents `[type/state, count, mean participants, injured, escaped]` | disciplinary points |
| --- | --- | --- |
| 13 | `assault/lapsed 28, 2 each` | 81 prisoners at 0, the rest 3–30 |
| 12 | `assault/lapsed 29, 2 each`, `escape-attempt/lapsed 1` | 73 at 0 |
| 7 | `assault/lapsed 25`, `escape-attempt/lapsed 3`, **`riot/lapsed 4, 100 each`** | **82 at exactly 12** |
| 1 | `assault/lapsed 19`, `escape-attempt/lapsed 3`, **`riot/lapsed 7, 100 each`** | **86 at exactly 21** |
| 0 | `assault/lapsed 14`, `escape-attempt/lapsed 3`, **`riot/lapsed 9, 100 each`** | **86 at exactly 27** |

`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot` is `2` and
`LAPSED_INCIDENT_SURCHARGE_POINTS` is `1`
(`src/simulation/prisoners/disciplinary-record.ts:46`, `:58`), so a lapsed riot
is **3 points a participant** — and 4 riots is 12, 7 riots is 21, 9 riots is 27.
**Every one of those numbers is the riot count times three, exactly.** An
assault names two prisoners and a riot names a hundred, which is why a
twelve-guard prison with twenty-nine assaults promotes nineteen prisoners and a
seven-guard prison with four riots promotes ninety-seven.

**So the promotion is not a function of the shortage; it is a function of
whether a riot fired.** Twelve guards short by one produced no riot on any of
three seeds. Seven guards short by six produced four. And the difference is
stochastic rather than a threshold: at `n = 50`, one guard produced the whole
-population promotion on seeds `0x1004` and `0xbeef` (`tiers [0,0,0,47]`) and
**not** on seed `0x997` (`tiers [34,0,2,11]`). A single-seed reading of this
would have named a threshold that is not there.

---

## 3. MEASURED — coverage is a cliff with no gradient, and that is the whole cost

`resolveSectorCoverageState` (`src/simulation/security/coverage-state.ts:65`) is
three lines:

```ts
if (entry.required > 0 && entry.assigned <= 0) return 'unguarded';
if (entry.shortage > 0) return 'understaffed';
return 'covered';
```

`SAFETY_COVERAGE_PROVISION_MULTIPLIER` is
`{ covered: 1, understaffed: 0.5, unguarded: 0 }`
(`src/simulation/prisoners/needs.ts:194`) against
`SAFETY_COVERAGE_PROVISION_PER_TICK` 0.08 and `NEED_DECAY_PER_TICK.safety`
0.05. Act P derives the consequence rather than quoting the docblock's table:

```
    covered       net 0.030/tick  ->  never falls to unmet
    understaffed  net -0.010/tick  ->  20400 ticks = 8.5 days
    unguarded     net -0.050/tick  ->  4080 ticks = 1.7 days
```

**`shortage > 0` is the only test, so twelve of thirteen guards and one of
thirteen are the same rung and therefore the same prison.** The measurement is
that they read identically: `safety 2/2/2 permille` and the whole population
unmet at 12, 10, 7, 4 and 1 guards, on all three seeds. The grant does not
improve monotonically with staffing inside the band — at `n = 100` seed
`0x997`, one guard earned **23,180** and twelve guards earned **22,660**.

**So a player who is six guards short and hires five has bought nothing on the
`safety` line, and a player who hires the sixth recovers `n × 40` a day.** That
is the sharpest balance observation in this record and it belongs to one
function and one constant.

The per-day series dates the fall precisely. `n = 50`, one guard, seed `0x997`:

```
        day   4  safety median  907 permille, unmet for   0  guards  1/ 7 = understaffed
        day   5  safety median  813 permille, unmet for   0
        day   7  safety median  625 permille, unmet for   0
        day  10  safety median  342 permille, unmet for   0
        day  15  safety median    2 permille, unmet for  50
```

94 permille a day is `2,400 × 0.01 / 255 × 1,000` — the `understaffed` net rate,
exactly. And recovery is faster than decay, because `covered` nets +0.03 against
−0.01: act S's arm staffed at tick 50,000 read

```
        day  19  safety median    2 permille, unmet for  50  guards  1/ 7 = understaffed
        day  20  safety median   49 permille, unmet for  49  guards  7/ 7 = covered
        day  21  safety median  331   day  22  614   day  23  896   day  24  1000
```

**Four days from the floor to full**, which is 8,500 ticks at +0.03 — act P's
figure, met.

### One thing that self-heals, and it is not a fix

`DeploymentSystem.requiredGuardCountFor`
(`src/simulation/security/deployment-system.ts:100`) hands the **live**
occupant count to `resolveOccupancyScaledGuardCount`, so the requirement falls
as prisoners are lost. At `n = 50` the population drifts to 47–48 over thirty
days (escapes: `escape-attempt/lapsed 3, escaped 3`), the requirement drops
7 → 6, and **two of three seeds' six-guard rows therefore read `covered`** with
`safety 1000` — a prison that reached the establishment by losing people rather
than by hiring. It is real behaviour and it is recorded here because it makes a
six-guard row at `n = 50` unsafe to compare across seeds.

---

## 4. MEASURED — the promotion does not cost the prison money, and at a hundred it pays

This is the link #1004 is built on, and it is the one that does not hold.

Act T sums `endTickOfDay − startTickOfDay` over each schedule's own `blocks`
rather than quoting them:

| category | general-population | high-risk | high-risk as a share |
| --- | --- | --- | --- |
| sleep | 500 | 2,200 | 440% |
| meal | 300 | 2,200 | **733%** |
| work | 1,000 | 0 | 0% |
| **recreation** | **600** | **200** | **33%** |
| education | 1,000 | 0 | 0% |
| **hygiene** | **500** | **2,200** | **440%** |
| free-association | 1,600 | 200 | 13% |

#1004 quotes the recreation row and stops. Two corrections follow, in opposite
directions:

**The recreation cut is worse than the issue says.** `action.classroom-education`
is category `education` and its `needEffectsPerTick` serves `recreation`
(act T's second table: `education serves ["recreation"]`), so the window in
which `recreation` can be served is `600 + 1,000 = 1,600` under general
population and `200` under high-risk — **12.5%, not 33%.**

**And the rest of the day moves the other way.** `work` serves `hunger` and
`hygiene`; `meal` serves `hunger`; `hygiene` serves `bladder` and `hygiene`. So
the `hygiene`-serving window goes `1,500 → 2,200` (**147%**) and the
`hunger`-serving window `1,300 → 2,200` (**169%**). A prisoner moved to
`high-risk` gets less than an eighth of their recreation time and half again as
much time in which to wash and eat.

**The measured net, at `n = 100`, seed `0x997`:**

| | 12 guards (nobody promoted) | 7 guards (97 of 97 promoted) |
| --- | --- | --- |
| hunger unmet | 29 | **0** |
| hygiene unmet | 35 | **0** |
| recreation unmet | 13 | **53** |
| safety unmet | 99 | 97 |
| **total unmet** | **176** | **150** |
| occupied | 99 | 97 |
| grant | 22,660 | 23,100 |

**The prison whose entire population is on the restricted timetable earns more.**
Not by much and not reliably — the two are inside the seed band of each other —
but the direction is consistent across all three seeds and both populations, and
the mechanism is plain in the table: promotion trades 40 unmet `recreation` for
64 unmet `hygiene` + `hunger`, and 64 > 40.

At `n = 50` the recreation cost of promotion is smaller still: 11 or 12 of 47
against 0 in the unpromoted rows, because one 8×8 yard is four places
(#997 §"what runs out") and four places for 200 ticks a day is roughly eight
visits, which nearly covers forty-seven prisoners at one visit every several
days and does not cover ninety-seven.

**So the compounding loop #1004 describes does not exist in the income.** What
exists is a step function on `safety` — one guard short costs `n × 40` a day and
nothing else does — plus a classification promotion that is a *symptom* of the
same shortage and is close to free.

---

## 5. MEASURED — the promotion is reversible on a timer, and not on staffing

Act S, `n = 50`, fifty in-game days, five arms. `ClassificationReviewSystem`
runs at 23,999 / 47,999 / 71,999 / 95,999 / 119,999; the intake is at 9,599, so
the first review that can touch it is 47,999 = **day 20**, and every arm's
general-population count moves for the first time on exactly that day.

**Arm: staffed at the establishment, stripped to one guard at tick 20,000.**

```
      day  18  safety median    2 permille, unmet for  50  guards  1/ 7 = understaffed  general-population  50  high-risk   0
      day  20  safety median    2 permille, unmet for  49  guards  1/ 7 = understaffed  general-population   0  high-risk  49
      day  30  safety median    2 permille, unmet for  47  guards  1/ 6 = understaffed  general-population   0  high-risk  47
      day  39  safety median    2 permille, unmet for  46  guards  1/ 6 = understaffed  general-population   0  high-risk  46
      day  40  safety median    2 permille, unmet for  45  guards  1/ 6 = understaffed  general-population  37  high-risk   8
      day  53  safety median    2 permille, unmet for  43  guards  1/ 6 = understaffed  general-population  38  high-risk   5
```

**The whole population was promoted at day 20 and 37 of 45 were back in general
population at day 40, with the prison still at one guard of six.** Nothing was
staffed. The demotion is `reviewClassification`'s clean-conduct credit and
nothing else: `cleanCredit = min(MAX_CLEAN_CONDUCT_CREDIT, floor(cleanTicks /
CLEAN_CONDUCT_CREDIT_PERIOD_TICKS))` with both constants at 24,000 ticks and 2
(`classification.ts:206`, the two constants at `:127-128` and the period at `:114`), so
`1 (sentence) + 0 + 3 (findings, saturated) − 2 (credit) = 2` → tier 2 →
`'general-population'`. Two clean review periods — **20 in-game days from the
last finding** — and the prisoner comes down. The riot that promoted them fired
around tick 46,000; day 40 is tick 95,999; the gap is two periods.

That is confirmed by mutation rather than inferred: with
`MAX_CLEAN_CONDUCT_CREDIT` set to 0, the same arm reads
`general-population 0 / high-risk 43` at day 53 and never recovers (§7,
mutation 3).

**The other arms, for the record:**

| arm | end state | grant | treasury at day 53 |
| --- | --- | --- | --- |
| never short (7 guards) | `covered`, safety 1000, high-risk 4 of 50 | 15,000 | 724,800 |
| short throughout (1 guard) | `understaffed`, safety 2, high-risk 5 of 43 | 11,180 | 635,560 |
| short, staffed at tick 50,000 | `covered`, safety 1000, high-risk 2 of 49 | 14,700 | 705,700 |
| short, staffed at tick 30,000 | `covered`, safety 1000, high-risk 5 of 50 | 14,640 | 729,720 |
| staffed, stripped at tick 20,000 | `understaffed`, safety 2, high-risk 13 of 43 | 11,140 | 632,640 |

**Two things worth naming in that table.** First, the arm staffed *before* the
first review (tick 30,000) is indistinguishable at the end from the arm that was
never short — 14,640 against 15,000, high-risk 5 against 4 — so recovering from
a shortage before day 20 costs the prison essentially nothing permanent. Second,
**the never-short control still promoted four prisoners of fifty and lapsed
thirteen assaults.** A fully covered prison is not an incident-free prison, and
a high-risk badge is therefore not by itself evidence of understaffing.

**So the answer to #1004's sharper question is no: the promotion is not
irreversible, and it is not even conditional on fixing the staffing.** It
decays on a clock. The mechanism that *is* sticky is the incident log — a
finding is permanent evidence (`buildDisciplinaryIndex` reads `IncidentLog.all()`
non-destructively, `disciplinary-record.ts:173`), so `findings` stays saturated
for ever and a promoted prisoner comes back to tier 2 and never below it.

---

## 6. MEASURED — the player is shown the shortage, and is told what it costs on the one rung where it does not matter

**No.** Nothing on screen connects too few guards to shortened recreation, and
the gap is narrower and more specific than "the player cannot find out".

`describeStaffCoverage` (`src/ui/hud/staff-panel.ts:427`) returns three rungs,
and the `consequenceKey` field is populated on exactly one:

- `:431-438` — `unguarded`: badge `Unguarded`, hint `Nobody is on duty. Hire {count} to cover this population.`, **and** `consequenceKey: securityCoverageUnguardedConsequence`.
- `:440-446` — `understaffed`: badge `Understaffed`, hint `Hire {count} more to cover this population.`, **and no `consequenceKey` at all.**
- `:453+` — `covered`: hint `Incidents and searches need free guards.`

The field's own docblock says the omission is deliberate — *"the two other
branches have nothing to say here rather than a nothing to say it with"*
(`src/ui/hud/staff-panel.ts:411-417`). **§3 is the measurement that makes that a defect rather than a
decision:** `understaffed` is the rung that takes the whole population's
`safety` to 2 permille and costs `n × 40` a day, and `unguarded` is a rung
reached only by hiring nobody at all.

An exhaustive pass over the 424 authored strings in
`src/content/default-locale-en.ts` finds **exactly two** that connect staffing
to anything a prisoner experiences:

```
$ grep -oE "': '[^']*'" src/content/default-locale-en.ts | grep -iE "guard|staff|understaff" | grep -iE "safe|recreation|need|regime|timetable"
': 'Incidents and searches need free guards.'
': 'No guard is posted here, so nobody in this sector is kept safe.'
```

The first is on `covered`; the second is on `unguarded`. Neither is on
`understaffed`.

**No string mentions recreation, the timetable, or why a prisoner's
classification moved.** The words `disciplinary`, `finding` and `conduct` do not
appear in any authored string in the file — so the mechanism §2 measures has no
player-facing vocabulary at all.

**What the player *is* shown, and it is more than the issue assumed.** The chain
has five links and four of them are on screen:

1. **Shortage** — Staff panel: `Guard coverage / 12 of 13 / Understaffed / Hire 1 more to cover this population.` ✔
2. **`safety` falling** — the Regime panel roster draws each prisoner's worst need and the inspector all six, each carrying `data-need-unmet` from the same `isNeedUnmetForStateIncome` predicate the money uses (#1003 §4 opens these lines). `Safety` is a named need (`src/content/simulation-message-keys.ts:139`). ✔ as a **symptom**, ✘ as a cause: the sentence that would attribute it exists only on `unguarded`.
3. **Riot** — `hud.alert.event.incidents.riot-opened`: *"A riot has broken out — {count} prisoners have stopped taking orders."* ✔
4. **Riot → every participant's record → tier 3** — **nothing.** No alert, no panel, no string. `ClassificationReviewSystem` emits no event (it holds no `SimulationEventLog`), and the review is batched twenty days after the riot the player saw.
5. **`high-risk` → a shortened day** — Regime panel, and this one is designed for it. The panel draws both groups' timetables and the roster's group badge on one tab, and its own docblock says why: *"the timetable says what general population and high risk may do at this tick, and the roster says who is in each … That reads as cause and effect only if both halves are on screen at once"* (`src/ui/hud/regime-panel.ts:36-44`). ✔

**So the missing link is the fourth, and the missing magnitude is the second.**
A player watches a riot, waits twenty in-game days, and finds their whole
population on the restricted timetable with nothing having named the connection
— and separately watches `Safety` fall on fifty prisoners with the panel that
diagnosed the shortage saying only *"Hire 1 more"*.

**This is a question and not a proposal**, per `docs/AGENT_WORKFLOW.md` §3. What
a player *should* be shown is a design decision. Two observations that bear on
it and are not decisions:

- The `understaffed` rung's missing consequence sentence is the cheapest of the
  two gaps and the one with a precedent to copy: `unguarded`'s sentence was
  authored on measured grounds and its locale entry records what makes it true.
  A sibling sentence for `understaffed` would be the same shape of work, and
  §3's arithmetic is what would make it true.
- **Coordination note.** #1003 §4 established that the concurrent-use figure is
  not projected at all (`src/simulation/presentation/room-projection.ts` says so
  in its own docblock) and ADR 0028 phase 5 owns that readout. Another agent is
  implementing it in this session. **The gap this record names is a different
  one** — a coverage rung with no consequence, and a classification move with no
  cause — and it lives in `staff-panel.ts` and the locale rather than in the room
  projection, so the two findings do not overlap and neither supersedes the
  other.

---

## 7. The mutations — one red gate and two attributions

Baseline hashes recorded before any edit and re-verified after each restore:

```
1c60199d5d1b74e82bec2e8e98c47a42e55eff14a4ec6671b9e92992b49d54c8  src/simulation/economy/income.ts
e0b0eb3ea346878440c99e89ead512f394730d0e61896939fdaf5d7e0d40bd5a  src/simulation/prisoners/needs.ts
39ba860dd41de6563266bb20a79274f79217676225538502a0e49def4b4f281a  src/simulation/prisoners/classification.ts
```

### Mutation 1 — the income identity is a real gate

Green first, unmutated:

```
$ node .../vitest.mjs run --config tests/research/vitest.research.config.ts -t 'act Q'
 Test Files  1 passed (1)
      Tests  1 passed | 18 skipped (19)
   Duration  28.80s
```

Then `src/simulation/economy/income.ts:614`, one term:

```diff
-  return Math.max(0, STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS - withheldPerUnmetNeed * unmetNeeds);
+  return Math.max(0, STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS - withheldPerUnmetNeed * Math.max(0, unmetNeeds - 1));
```

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: the settled grant must be the grant the unmet-need histogram accounts for,
or the income seam has a term neither of them sees: expected 15000 to be 14960 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
```

Restored; `sha256sum` matches the baseline.

### Mutation 2 — the whole loop belongs to one number

`SAFETY_COVERAGE_PROVISION_MULTIPLIER.understaffed`, `0.5 → 1`
(`src/simulation/prisoners/needs.ts:196`). Act Q, seed `0x997`, unmutated
against mutated:

| guards | shipped | `understaffed: 1` |
| --- | --- | --- |
| 6 | safety 1000, grant 14,360, high-risk 12 | safety 1000, grant 14,660, high-risk 4 |
| 4 | **safety 2, unmet 47 of 47**, grant 12,100, high-risk 8 | **safety 1000, unmet 0 of 47**, grant 14,060, high-risk 6 |
| 2 | **safety 2, unmet 47 of 47**, grant 12,220, high-risk 11 | **safety 1000, unmet 0 of 47**, grant 14,060, high-risk 7 |
| 1 | **safety 2, unmet 47 of 47**, grant 12,220, high-risk 11 | **safety 1000, unmet 0 of 47**, grant 14,060, high-risk 8 |
| 0 | safety 0, grant 11,780, **high-risk 47 of 47** | safety 0, grant 11,780, **high-risk 47 of 47** |

**With that one multiplier at 1, no shortage short of zero guards produces any
`safety` loss, any income loss beyond the ordinary, or any whole-population
promotion.** The 0-guard row is byte-identical because `unguarded`'s multiplier
was not touched. This is the attribution: **every figure in §1 and §3 is
`SAFETY_COVERAGE_PROVISION_MULTIPLIER.understaffed = 0.5`'s**, and the loop
#1004 describes has exactly one lever. Restored; hash matches.

### Mutation 3 — the reversibility belongs to `MAX_CLEAN_CONDUCT_CREDIT`

`MAX_CLEAN_CONDUCT_CREDIT`, `2 → 0`
(`src/simulation/prisoners/classification.ts:128`). Act S, the stripped arm:

| day | shipped | `MAX_CLEAN_CONDUCT_CREDIT: 0` |
| --- | --- | --- |
| 19 | general 50 / high-risk 0 | general 50 / high-risk 0 |
| 20 | general **0** / high-risk 49 | general **0** / high-risk 49 |
| 39 | general 0 / high-risk 46 | general 0 / high-risk 46 |
| **40** | general **37** / high-risk 8 | general **0** / high-risk 45 |
| 53 | general **38** / high-risk 5 | general **0** / high-risk 43 |

Restored; hash matches. `git status --short` afterwards shows only
`tests/research/2026-09-05-yard-at-scale.research.ts` and this note.

---

## 8. What this record does not claim, and my weakest claim

**My weakest claim is §4's — that the promotion is net favourable on the income
line.** It is the only headline here that rests on a *difference between two
seeds' bands rather than a gap between them.* At `n = 100` the promoted rows
earn 22,980–23,220 and the one-guard-short rows 22,660–23,640; those intervals
overlap. What I can defend without qualification is the weaker and still useful
statement: **the promotion does not measurably cost the prison money at these
populations**, which is enough to refute #1004's compounding chain, and the
mechanism table (176 unmet against 150, exact to the unit on both sides) is the
evidence rather than the grant comparison. **What would change my mind:** a
population large enough that the yard's four places cannot serve even a
general-population regime's 1,600-tick window, so the recreation term stops
being offset. That is above 100 and this record does not reach it.

**Three claims I hold firmly**, each with a mutation or an exact identity behind
it: the cliff (§3, mutation 2 and identical printed rows at five staffing
levels), the riot-as-promoter (§2, `points = 3 × riots` exact in every row), and
the timer reversibility (§5, mutation 3).

**Not claimed:**

- **That understaffing is unimportant.** It costs `n × 40` a day, which at a
  hundred prisoners is 4,000 — real money and the largest single lever this
  record found. What is refuted is that it *compounds*, not that it hurts.
- **That there is no point of no return in this game.** There is none in the
  populations and staffing levels measured here, at these constants. Insolvency
  was never approached, so the insolvency ladder
  (`InsolvencyRungSystem`) was never exercised and nothing here says what
  happens to a prison that is already broke.
- **Any diagnosis of the riot trigger.** `staffingShortfallWeight` is 0.3 and
  `needsPressureWeight` 1 against a `hotThreshold` of 0.65
  (`src/simulation/incidents/sector-risk.ts`), and I did not measure which term
  crossed the line in the runs that rioted. That riots appear at 7 guards and
  not at 12 is measured; *why* is not, and `sector-risk.ts`'s own docblock warns
  that staffing is an amplifier rather than a gate.
- **Anything about balance.** No constant was changed and none is recommended.
  §3 and §6 name two places a decision could be taken and take neither.

---

## 9. What was not measured

- **Populations above 100 and below 50.** The establishment floor of 1 binds
  below eight prisoners (`resolveOccupancyScaledGuardCount` with
  `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` = 1,
  `src/simulation/security/default-sector.ts:113`), so a small prison's shortage
  is a different shape and is not covered here.
- **Hiring out of earnings under pressure.** #1004 offers two directions and
  this record measures both as *staffing changes* — act S hires and dismisses at
  named ticks. It does not model a player hiring only what they can afford,
  because no arm ever came close to being unable to afford a guard: the cheapest
  arm held 632,640 against an 80 wage.
- **More than one sector.** Every session a player can start has exactly one
  (`DEFAULT_SECURITY_SECTOR_ID`), so "the rung" and "the prison" are the same
  thing throughout. The cliff in §3 is per sector, and a prison with two sectors
  would have two cliffs.
- **The browser.** `public/assets/**` are Git LFS pointer files in this
  container and `git lfs` is not installed at all (`git lfs version` →
  `git: 'lfs' is not a git command`; no `.git/lfs`), so no browser instrument
  was run and §6's findings are from reading the composers and the locale, not
  from watching a panel. **`docs/AGENT_WORKFLOW.md` §2's claim that
  `git lfs checkout` fixes this offline in 1.07s is false in this container**;
  another agent is recording that correction.
- **Whether a demoted prisoner's needs recover.** §5 measures the group census
  coming back down. It does not measure whether the recreation debt built up
  over twenty high-risk days is repaid, only that the window reopens.

---

## Appendix — the instrument

`tests/research/2026-09-05-yard-at-scale.research.ts`, acts P–T, on
`tests/research/vitest.research.config.ts` so `pnpm test` does not collect it.
Acts A–G are #997's and H–O are #1003's, and none of them changed: every option
#1004 added defaults to `undefined` and every readout it added is a read at the
readout tick or once per day boundary.

- **P** — the arithmetic, with nothing simulated. Wage, prisoner ratio, grant,
  the three rungs' net `safety` rates and time-to-unmet, the establishment per
  population, and the four factors `reviewClassification` reads.
- **Q** — `n = 50`, guards `8, 7, 6, 4, 2, 1, 0`, three seeds, thirty days.
- **R** — `n = 100` on the 21×10 cell, guards `14, 13, 12, 10, 7, 4, 1, 0`,
  three seeds, thirty days.
- **S** — `n = 50`, fifty days, five arms: never short, short throughout, short
  then staffed after the first review, short then staffed before it, and staffed
  then stripped.
- **T** — the two regime schedules' per-category windows, summed from their own
  `blocks`, beside which needs each category can serve, read off
  `DEFAULT_ACTIONS`.

Seeds `0x997`, `0x1004`, `0xbeef`. `0x997` is #997's, so a #1004 row and a #997
row at the same staffing are rows about the same session.
