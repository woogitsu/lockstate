# Both shapes, measured together: ADR 0080's review draw beside a non-zero `priorIncidents`

**Date:** 2026-08-30
**Tree:** branch `agent/677-weapons-unreachable`, with ADR 0080's implementation
(`ee4c0b6`, and its fixture half `3bf9505`) **in force** for every run below.
**Question put to this record:** the owner's ruling of 2026-08-30 on
[#677](https://github.com/matmaxalez/lockstate/issues/677) took **both** shapes —
the review that raises a prisoner into tier 3 asks what they are carrying, *and*
`priorIncidents` moves off zero — and then named what was missing:

> Every figure in ADR 0080 was taken with `priorIncidents` pinned at 0.
> **Nothing has measured the two mechanisms together**, and they are not
> additive in the direction that matters ... The property that made ADR 0080
> safe — *a well-run prison cannot tell it happened*, 0 → 0 weapons on four
> seeds — was measured at priors 0 and **may not survive** a distribution that
> admits tier-2 prisoners as the norm.

**Three answers, and the first refutes the premise of the question.**

1. **The two mechanisms do not compound. In the prisons where ADR 0080's review
   gate actually fires, they are mutually exclusive** — and that is a fact about
   one line of code, not a rate. `ClassificationReviewSystem` asks the
   introduction question only when `assessment.riskTier > previousTier`
   (`src/simulation/prisoners/classification-review-system.ts:364`), so a
   prisoner who **arrives** at tier 3 is never *raised into* tier 3 and is never
   asked a second time. A non-zero `priorIncidents` therefore moves prisoners
   **from** the review producer **to** the intake producer rather than adding to
   both. Measured in the neglected prison over 1,196 admissions: weapons 74, 74,
   78, 78, 74, 70, 79 across the first seven candidates — flat — while the
   review's share of them falls 74 → 55 and intake's rises 0 → 38 at the eighth.
   Escape attempts 223, 224, 223, 222, 224, 225, 224, 235. Riots 592, 592, 590,
   590, 590, 590, 591, 589. §3.
2. **The property the ruling was worried about is *stronger* than ADR 0080
   claimed at priors 0, and it does break — but not the way the ruling
   expected.** At `priorIncidents: 0` the well-built prison produced **0 weapons,
   0 escape attempts and 0 riots over 2,990 admissions and 6,000 in-game days on
   ten seeds** — ADR 0080's own weakest claim rested on four seeds of 300 days,
   and this is seven times the exposure. At any non-zero candidate it breaks:
   weapons and escape attempts appear. **But four of every five of those weapons
   — 52 of 65 — come from the intake producer, not from ADR 0080's review**, so
   what breaks the invariant is the priors half alone, and ADR 0080 is very nearly a bystander in
   a well-run prison. §4.
3. **The well-run prison never loses a prisoner, at any candidate.** `escaped`
   is **0** in every well-built run of every distribution, including `always 2` —
   70 runs, 6,000 or 3,000 in-game days each. Riots are 0 everywhere except a
   single seed. The escape attempts a weapon opens are all contained, which is
   the general form of ADR 0080's *"one guard is the whole difference"*. §4.

**One correction to ADR 0080's own prose, and one dominance result.** Its bullet
*"Every intermediate distribution moves tiers 1 and 2 far more than tier 3"* is
half wrong: **tier 1 is nearly pinned at a third of admissions for every
candidate** (30.30 % to 33.33 %), so only tier 2 is a real cost — and measured
against that cost, **`always 1` is dominated by `60/30/10` on every axis**: more
tier-3 exposure (160 prisoners vs 104), more weapons (16 vs 9), and *less* total
contraband (503 items vs 591). §5.

**Recommended: `60/30/10`** — 60 % of arrivals with no prior incident, 30 % with
one, 10 % with two. §6 gives the reason and §7 says what would change it. **No
value is set anywhere in the tree by this record**; ADR 0017 decision 5 and
[#29](https://github.com/matmaxalez/lockstate/issues/29) own it, and the owner's
ruling says the magnitude is *"deliberately not mine"*.

---

## 0. How to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line, or the number was
  produced by running the real kernel in this worktree and pasted.
- **DERIVED** — arithmetic over VERIFIED constants, written out so it can be
  checked without a run.
- **UNKNOWN** — could not be established.

Prose from other documents is quoted rather than cited by line
(`docs/AGENT_WORKFLOW.md` §4). Every table below is machine-generated from the
harness's own JSON output, which is reproduced in §9.

---

## 1. Method, and the three things this harness is not

**Every run is the real kernel driven by real commands** —
`createNewSimulationRuntime(seed)`, `packCommand`, `kernel.submitCommand`,
`while (kernel.tick < n) kernel.step()` — over 300 in-game days (720,000 ticks)
or 600 where stated. No wall clock is read anywhere in the loop, so contention
makes a run slower and cannot make it different.

`priorIncidents` is varied **on the `AdmitPrisoner` command**, which
`admitPrisonerSchema` has always accepted (`z.number().int().min(0).max(MAX_PRIOR_INCIDENTS)`,
`src/simulation/protocol/commands.ts:270`). — VERIFIED.

So, three things this is not:

1. **It is not an implementation, and nothing is wired.** `src/main.ts:899`
   still reads `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;` on
   this branch — VERIFIED — and no file under `src/` was touched for this
   record. ADR 0017 decision 5 puts the value with
   [#29](https://github.com/matmaxalez/lockstate/issues/29) and the owner's own
   ruling says the magnitude is *"deliberately not mine"*.
2. **It is not the determinism cost.** The harness draws `priorIncidents` on
   its own `Xoshiro128StarStar`, seeded off the run seed and ordered against
   nothing. A real implementation draws on a **registered named stream inside
   the command boundary**, ordered against the sentence and classification
   draws — which is a fingerprint change and a stream registration, exactly as
   ADR 0080's *"A distribution is also new state"* says. The *statistics* of the
   intake tier are the same either way, and the statistics are what is being
   priced here.
3. **It is not a browser run.** These are kernel runs. What a player *sees* of a
   confiscated weapon is unchanged and is still nothing: no `src/ui/` module
   renders a contraband category.

**The prison shapes are the ones ADR 0080 measured**, rebuilt command-for-command:

| shape | cells | guards | amenities | admissions |
| --- | --- | --- | --- | --- |
| **well built** | 40, each with a bed and a toilet | 8 | shower, canteen, yard, furnished | 1 every 2 days — 149 over 300 days |
| **under built** | 12, bed and toilet | 2 | shower, canteen, yard, furnished | 1 every 2 days — 149 over 300 days |
| **neglected** | 12 bare cells | 0 | none | 1 per day — 299 over 300 days |

**Which producer minted each item is recorded, and that is what makes the
interaction question answerable.** `introduceContrabandOnIntake` writes
`provenance.introducedAtTick` and `provenance.sourceId` (the holder's entity id)
at both call sites, and the intake call site runs at the prisoner's
classification tick, which `classifiedAtTickOf` recovers from two persisted
fields. An item whose `introducedAtTick` equals its holder's classification tick
came in **at intake**; anything later came from **the review ADR 0080 armed**. A
review cannot fire on the classification tick — it needs 24,000 ticks of tenure
— so the two cases cannot collide. Across all runs the count of items that could
not be attributed to a tracked holder is **0**.

**Contention, stated rather than assumed** (`docs/AGENT_WORKFLOW.md` §2,
[#667](https://github.com/matmaxalez/lockstate/issues/667)): the machine has
four cores; load average moved between 1.3 and 5.6 while these ran, and the only
things running were this record's own two harness processes. No other agent's
Playwright or vitest run was live at any point —
`ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` was empty before
the first run started. Nothing above is a timing measurement.

## 2. The harness reproduces ADR 0080's published numbers exactly

ADR 0080's harness did not survive its session, so this one is a
reconstruction — which makes reproducing its published figures the first thing
worth doing, and the only honest way to claim the rest of this record is
comparable to it. At `priorIncidents: 0`, 300 in-game days, ADR 0080's own four
seeds:

| prison | ADR 0080's "decision" column | this harness |
| --- | --- | --- |
| well built, seed `0x0cc0` | 19 contraband, 0 weapons, 0 escapes, 0 riots, 0 ever tier 3 | **19 / 0 / 0 / 0 / 0** |
| well built, seed `0x51a7` | 29 / 0 / 0 / 0 / 0 | **29 / 0 / 0 / 0 / 0** |
| well built, seed `0x2f19` | 27 / 0 / 0 / 0 / 0 | **27 / 0 / 0 / 0 / 0** |
| well built, seed `0x77aa` | 14 / 0 / 0 / 0 / 1 | **14 / 0 / 0 / 0 / 1** |
| under built, seed `0x0cc0` | 74 contraband, 15 weapons, 13 escapes, 105 riots, 138 ever tier 3 | **74 / 15 / 13 / 105 / 138** |
| neglected, seed `0x0cc0` | 145 / 18 / 56 / 148 / 283 | **145 / 18 / 56 / 148 / 283** |

Every figure matches. — VERIFIED.


---

## 3. The two mechanisms do not compound, and the reason is one line — VERIFIED

**The ruling's expectation, quoted so it can be checked against the numbers:**

> Non-zero priors raises the *intake* tier distribution, so more prisoners
> arrive at tier 2 and reach tier 3 sooner — which feeds the same review gate
> ADR 0080 just armed.

The first half is true and the second does not follow, because of the guard on
the branch ADR 0080 added:

```ts
if (assessment.riskTier > previousTier) {
  this.tierIncreases += 1;
  // ADR 0080. ...
  if (assessment.riskTier >= ESCALATION_INTRODUCTION_MINIMUM_TIER && this.contrabandIntroducer !== undefined) {
```

— `src/simulation/prisoners/classification-review-system.ts:364` and `:379`.
VERIFIED at the line. **A prisoner who arrives at tier 3 is never *raised into*
tier 3**, so the review never asks them the question; they were asked once
already, at intake, with the band a tier-3 arrival gets. Raising the intake
distribution therefore **moves** prisoners from one producer to the other. It
does not stack them.

Measured, and the substitution is visible in the attribution columns rather than
inferred:

### Neglected — 12 bare cells, no amenities, no guards, 1 arrival / day (4 seeds, 300 in-game days each)

| distribution | admissions | **weapons** | of which intake / review | contraband | of which review | escape attempts | **escaped** | riots | assaults | confiscations | ever tier 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `always 0 (today)` | 1196 | **74** | 0 / 74 | 611 | 447 | 223 | **223** | 592 | 20 | 0 | 1129 |
| `90/8/2` | 1196 | **74** | 0 / 74 | 620 | 440 | 224 | **224** | 592 | 20 | 0 | 1129 |
| `80/15/5` | 1196 | **78** | 0 / 78 | 620 | 429 | 223 | **223** | 590 | 24 | 0 | 1131 |
| `70/25/5` | 1196 | **78** | 1 / 77 | 623 | 417 | 222 | **222** | 590 | 24 | 0 | 1131 |
| `60/30/10` | 1196 | **74** | 3 / 71 | 629 | 419 | 224 | **224** | 590 | 24 | 0 | 1132 |
| `50/35/15` | 1196 | **70** | 2 / 68 | 639 | 402 | 225 | **225** | 590 | 24 | 0 | 1133 |
| `always 1` | 1196 | **79** | 3 / 76 | 668 | 431 | 224 | **224** | 591 | 22 | 0 | 1131 |
| `always 2` | 1196 | **93** | 38 / 55 | 650 | 272 | 235 | **235** | 589 | 26 | 0 | 1153 |

per-seed weapons: `always 0 (today)` 18/19/22/15; `90/8/2` 17/19/22/16; `80/15/5` 16/20/22/20; `70/25/5` 18/20/22/18; `60/30/10` 20/17/24/13; `50/35/15` 20/16/17/17; `always 1` 16/23/22/18; `always 2` 22/25/25/21

per-seed escape attempts: `always 0 (today)` 56/56/55/56; `90/8/2` 56/56/56/56; `80/15/5` 56/56/55/56; `70/25/5` 56/56/55/55; `60/30/10` 56/56/56/56; `50/35/15` 56/57/57/55; `always 1` 56/56/56/56; `always 2` 57/59/60/59

per-seed contraband: `always 0 (today)` 145/152/160/154; `90/8/2` 152/153/158/157; `80/15/5` 152/157/166/145; `70/25/5` 155/159/166/143; `60/30/10` 155/161/166/147; `50/35/15` 162/163/161/153; `always 1` 174/164/173/157; `always 2` 155/167/171/157

**Read the `of which intake / review` column down the table.** The total barely
moves — 74, 74, 78, 78, 74, 70, 79, 93 weapons over 1,196 admissions — while the
split swings from `0 / 74` to `38 / 55`. Escape attempts move 223 → 235 across
the entire eight-candidate range, and riots move 592 → 589, which is **less
movement than one seed's worth of noise**: the four seeds at `always 0` alone
give 56 / 56 / 55 / 56 escape attempts and the four at `50/35/15` give
56 / 57 / 57 / 55.

**Why the neglected prison cannot feel a priors change at all:** it already
promotes essentially everybody. `ever tier 3` is 1,129 of 1,196 admissions
(94.4 %) at `always 0` and 1,132 at `60/30/10` — the gate is saturated, so
opening it earlier changes who is asked *when* and not *whether*.

The under-built prison says the same thing one step less extremely:

### Under built — 12 cells, 2 guards, amenities, 1 arrival / 2 days (4 seeds, 300 in-game days each)

| distribution | admissions | **weapons** | of which intake / review | contraband | of which review | escape attempts | **escaped** | riots | assaults | confiscations | ever tier 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `always 0 (today)` | 596 | **43** | 0 / 43 | 305 | 207 | 54 | **54** | 395 | 472 | 3 | 534 |
| `90/8/2` | 596 | **51** | 0 / 51 | 301 | 204 | 61 | **61** | 376 | 532 | 3 | 532 |
| `80/15/5` | 596 | **44** | 0 / 44 | 296 | 200 | 60 | **60** | 394 | 473 | 3 | 538 |
| `70/25/5` | 596 | **42** | 1 / 41 | 305 | 205 | 55 | **55** | 379 | 493 | 3 | 538 |
| `60/30/10` | 596 | **39** | 2 / 37 | 305 | 193 | 63 | **63** | 358 | 575 | 3 | 536 |
| `50/35/15` | 596 | **42** | 3 / 39 | 318 | 202 | 59 | **59** | 351 | 593 | 3 | 546 |
| `always 1` | 596 | **39** | 3 / 36 | 325 | 206 | 53 | **53** | 385 | 499 | 4 | 538 |
| `always 2` | 596 | **39** | 22 / 17 | 311 | 126 | 70 | **70** | 294 | 686 | 13 | 552 |

per-seed weapons: `always 0 (today)` 15/11/10/7; `90/8/2` 15/14/10/12; `80/15/5` 8/13/12/11; `70/25/5` 9/14/12/7; `60/30/10` 6/13/10/10; `50/35/15` 8/12/11/11; `always 1` 8/16/8/7; `always 2` 9/8/12/10

per-seed escape attempts: `always 0 (today)` 13/14/18/9; `90/8/2` 13/17/18/13; `80/15/5` 12/14/18/16; `70/25/5` 14/14/18/9; `60/30/10` 12/16/21/14; `50/35/15` 13/12/20/14; `always 1` 13/13/16/11; `always 2` 12/16/23/19

per-seed contraband: `always 0 (today)` 74/68/84/79; `90/8/2` 74/70/84/73; `80/15/5` 64/74/87/71; `70/25/5` 79/73/87/66; `60/30/10` 74/72/87/72; `50/35/15` 72/86/85/75; `always 1` 77/84/90/74; `always 2` 78/82/87/64

**Weapons: 43, 51, 44, 42, 39, 42, 39, 39.** The largest figure in that row is
the *second* candidate and the smallest are the last three — the series is
flat and, if anything, slightly downward, which is what substitution rather
than addition looks like. Per-seed spread at a single distribution
(15 / 11 / 10 / 7 at `always 0`) is wider than the whole spread across
distributions.

**So the brief's hypothesis that the two mechanisms feed each other is refuted
for both failing prisons.** ADR 0080's *"30 → 56 escape attempts"* in the
neglected prison is the whole of the change; adding any of the eight
distributions on top of it moves that figure to between 55 and 60.

---

## 4. Does the well-run prison still not know? — VERIFIED

**No, and the reason is not the one the ruling feared.** The property ADR 0080
rested on is stated at its own decision 2: *"A well-run prison should not be
able to tell this decision happened."*

First, that property at `priorIncidents: 0`, re-measured much harder than ADR
0080 measured it — ten seeds of 600 in-game days rather than four of 300:

### D. The well-built prison alone, 600 in-game days, ten seeds

| distribution | admissions | **weapons** | intake / review | contraband | of which review | escape attempts | **escaped** | riots | assaults | ever tier 3 | seeds with a weapon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `always 0 (today)` | 2990 | **0** | 0 / 0 | 414 | 0 | 0 | **0** | 0 | 1 | 1 | 0 / 10 |
| `90/8/2` | 2990 | **2** | 2 / 0 | 427 | 1 | 2 | **0** | 0 | 0 | 25 | 2 / 10 |
| `80/15/5` | 2990 | **10** | 9 / 1 | 471 | 6 | 9 | **0** | 0 | 0 | 84 | 8 / 10 |
| `70/25/5` | 2990 | **10** | 9 / 1 | 478 | 2 | 9 | **0** | 0 | 0 | 92 | 7 / 10 |
| `60/30/10` | 2990 | **16** | 14 / 2 | 503 | 5 | 14 | **0** | 0 | 2 | 160 | 8 / 10 |
| `50/35/15` | 2990 | **18** | 10 / 8 | 546 | 18 | 10 | **0** | 0 | 2 | 215 | 10 / 10 |
| `always 1` | 2990 | **9** | 8 / 1 | 591 | 6 | 8 | **0** | 0 | 0 | 104 | 7 / 10 |

per-seed weapons: `always 0 (today)` 0/0/0/0/0/0/0/0/0/0; `90/8/2` 0/1/1/0/0/0/0/0/0/0; `80/15/5` 1/1/2/1/1/1/0/0/2/1; `70/25/5` 0/2/2/1/1/1/0/0/2/1; `60/30/10` 1/3/5/2/1/2/0/0/1/1; `50/35/15` 1/2/4/1/1/2/1/1/3/2; `always 1` 1/1/2/2/0/1/1/0/0/1

per-seed escape attempts: `always 0 (today)` 0/0/0/0/0/0/0/0/0/0; `90/8/2` 0/1/1/0/0/0/0/0/0/0; `80/15/5` 1/1/2/0/1/1/0/0/2/1; `70/25/5` 0/2/2/0/1/1/0/0/2/1; `60/30/10` 1/2/5/1/1/2/0/0/1/1; `50/35/15` 1/1/2/0/1/1/1/0/3/0; `always 1` 1/1/2/1/0/1/1/0/0/1

**Four things that table says.**

- **ADR 0080's invariant holds far beyond its own claim.** `always 0`:
  **0 weapons, 0 escape attempts, 0 riots, and 0 items introduced by the review
  producer**, over 2,990 admissions and 6,000 in-game days across ten seeds.
  Exactly one prisoner in ten runs ever reached tier 3. ADR 0080 named its four
  seeds of 300 days as its weakest claim; this is seven times the exposure and
  it does not move.
- **Every non-zero candidate breaks it**, and the first one is already enough:
  `90/8/2` puts a weapon in 2 of 10 well-run prisons. By `80/15/5` it is 8 of
  10.
- **The breach belongs to intake, not to ADR 0080.** Across the six non-zero
  candidates measured at 600 days, **52 of 65 weapons** in the well-built prison were
  introduced at intake, and the review producer put **18 of 546 contraband items
  into a well-run prison at `50/35/15`, 5 of 503 at `60/30/10`, 6 of 471 at
  `80/15/5` and 1 of 427 at `90/8/2`.** ADR 0080's mechanism is close to a
  bystander in a prison that promotes nobody, which is exactly what its
  decision 2 was built to guarantee — and the guarantee survives the priors
  change intact.
- **The escape attempt tracks the weapon almost one for one**: 10 weapons and 9
  attempts at `80/15/5`, 16 and 14 at `60/30/10`, 9 and 8 at `always 1`. That is
  `canAttemptEscape` doing what `flashpoint.ts:282` says — *"tier >= 3 and
  carrying something"* — and the weapon is what carries the tier-3 prisoner over
  it.

**And the answer that decides whether any of this is safe: `escaped` is 0.**
In every one of the 70 high-power runs and every one of the 48 well-built runs
at 300 days, including all six seeds of `always 2` — **not one prisoner left a
well-run prison.** Riots are 0 in all but one seed; assaults reach 2. The 8
guards contain every attempt the weapon opens, which is the general form of ADR
0080's *"one guard restores the pre-decision behaviour exactly"*.

So the honest statement is **not** *"a well-run prison cannot tell"*. It is:

> **A well-run prison starts seeing weapons and contained escape attempts, and
> stops there. It does not riot and it does not lose anybody.** What it can tell
> is that its intake changed — not that the review changed.

The 300-day, six-seed view of the same prison, for comparability with ADR 0080's
own table:

### Well built — 40 cells, 8 guards, shower/canteen/yard, 1 arrival / 2 days (6 seeds, 300 in-game days each)

| distribution | admissions | **weapons** | of which intake / review | contraband | of which review | escape attempts | **escaped** | riots | assaults | confiscations | ever tier 3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `always 0 (today)` | 894 | **0** | 0 / 0 | 126 | 0 | 0 | **0** | 0 | 1 | 123 | 1 |
| `90/8/2` | 894 | **1** | 1 / 0 | 129 | 1 | 1 | **0** | 0 | 0 | 126 | 7 |
| `80/15/5` | 894 | **2** | 1 / 1 | 135 | 1 | 1 | **0** | 0 | 0 | 133 | 20 |
| `70/25/5` | 894 | **2** | 1 / 1 | 138 | 1 | 1 | **0** | 0 | 0 | 134 | 25 |
| `60/30/10` | 894 | **3** | 1 / 2 | 140 | 2 | 1 | **0** | 0 | 0 | 134 | 41 |
| `50/35/15` | 894 | **2** | 1 / 1 | 146 | 4 | 1 | **0** | 0 | 0 | 143 | 50 |
| `always 1` | 894 | **3** | 2 / 1 | 171 | 2 | 2 | **0** | 0 | 0 | 166 | 37 |
| `always 2` | 894 | **30** | 25 / 5 | 283 | 29 | 23 | **0** | 0 | 0 | 269 | 374 |

per-seed weapons: `always 0 (today)` 0/0/0/0/0/0; `90/8/2` 0/1/0/0/0/0; `80/15/5` 0/1/0/1/0/0; `70/25/5` 0/1/0/1/0/0; `60/30/10` 0/2/0/1/0/0; `50/35/15` 0/1/0/1/0/0; `always 1` 0/0/0/2/0/1; `always 2` 3/2/5/4/7/9

per-seed escape attempts: `always 0 (today)` 0/0/0/0/0/0; `90/8/2` 0/1/0/0/0/0; `80/15/5` 0/1/0/0/0/0; `70/25/5` 0/1/0/0/0/0; `60/30/10` 0/1/0/0/0/0; `50/35/15` 0/1/0/0/0/0; `always 1` 0/0/0/1/0/1; `always 2` 3/1/4/3/6/6

per-seed contraband: `always 0 (today)` 19/29/27/14/17/20; `90/8/2` 23/30/26/13/17/20; `80/15/5` 24/29/25/18/17/22; `70/25/5` 27/29/25/18/17/22; `60/30/10` 25/28/26/21/17/23; `50/35/15` 25/32/26/21/17/25; `always 1` 27/35/31/20/28/30; `always 2` 43/54/56/36/42/52

---

## 5. What a distribution actually costs — one correction and one dominance result

The intake tier distribution, enumerated exactly over the whole intake space
(77 drawable sentence lengths × 3 screening outcomes, `docs/adr/0080`) and
measured through the kernel over 2,686 classified prisoners per candidate:



Enumeration and measurement agree everywhere to within a percentage point, which
is what 2,686 samples buys. — VERIFIED.

**Correction, in both directions, to ADR 0080's third bullet.** It reads:

> **Every intermediate distribution moves tiers 1 and 2 far more than tier 3.**
> A weighted draw that reaches a defensible weapon rate has already tripled or
> quintupled the tier-2 population, which is a bigger balance change than the
> one it was chosen for.

**The tier-2 half is right and the tier-1 half is wrong.** Tier 1 does not move
for any candidate: it is 33.33 % today and 33.27, 33.18, 33.18, 33.03, 32.88,
33.33 and 30.30 % across the eight — **pinned within one point everywhere except
`always 2`**. That falls out of the screening variance being uniform over
`{-1, 0, +1}`: whatever the priors term is, one of the three outcomes lands on
tier 1 for most of the sentence space. So the *only* collateral a distribution
buys is tier 2, and the sentence should be read as being about tier 2 alone.

**With tier 1 out of the way, the trade is a single ratio — tier-2 points spent
per tier-3 point bought** — and it produces a dominance ADR 0080's table does
not show:

| distribution | t2 gained | **t3 gained** | t2 spent per t3 | t0 given up |
| --- | --- | --- | --- | --- |
| `90/8/2` | +3.03 | **+0.97** | 3.12 | 3.94 |
| `80/15/5` | +6.06 | **+2.27** | **2.67** | 8.19 |
| `70/25/5` | +9.09 | **+2.58** | 3.52 | 11.52 |
| `60/30/10` | +12.12 | **+4.55** | **2.66** | 16.37 |
| `50/35/15` | +15.15 | **+6.52** | 2.32 | 21.22 |
| `always 1` | +30.30 | **+3.03** | **10.00** | 33.34 |
| `always 2` | +30.30 | **+36.36** | 0.83 | 63.64 |

**`always 1` spends ten tier-2 points per tier-3 point — nearly four times the
worst weighted candidate.** ADR 0080 called it *"the smallest change that gives
the fifth slot a producer at all"*, which is true of the **edit** and not of the
**cost**. It is the *largest* balance change of the six candidates below
`always 2` and buys the second-least tier 3 of them.

**`60/30/10` strictly dominates it, and the measurement agrees with the
arithmetic on every axis:**

| in the well-built prison, 2,990 admissions | `always 1` | `60/30/10` |
| --- | --- | --- |
| tier 3 at intake, enumerated | 3.03 % | **4.55 %** |
| tier 2 at intake, enumerated | 33.33 % | **15.15 %** |
| prisoners who ever held tier 3 | 104 | **160** |
| weapons | 9 | **16** |
| **total contraband** | 591 | **503** |
| escape attempts / **escaped** | 8 / **0** | 14 / **0** |
| riots | 0 | 0 |

More of the thing the change is for, less of everything it costs. — VERIFIED.

---

## 6. Recommendation: `60/30/10`

**60 % of arrivals with no prior incident, 30 % with one, 10 % with two.**

**The reasoning, in the order it decides the question.**

1. **The distribution is a choice about the well-run prison and nothing else.**
   §3 is the whole of it: the under-built and neglected prisons cannot feel any
   candidate below `always 2`, because their review gate is already saturated at
   94 % of admissions. So every argument about difficulty in a failing prison is
   settled by ADR 0080 and is not this number's to make.
2. **The weapon has to be reachable in a prison that promotes nobody, or half
   the promise is still unkept.** ADR 0080 gave `contraband.weapon` a producer
   at the *review*; a prison that never reviews anybody up still cannot produce
   one — which is exactly the 0 across 2,990 admissions in the `always 0` row.
   That is the gap the second half of the ruling exists to close.
3. **`60/30/10` closes it at a rate a player will actually meet without it
   becoming the game.** Measured: **16 weapons in 2,990 admissions**, 8 of 10
   seeds seeing at least one in 600 in-game days — roughly one weapon per 190
   admissions, or one per 370 in-game days at one arrival every two days. ADR
   0080's own yardstick was that *"about one weapon every 600 in-game days ...
   is not a mechanic a player would ever notice"*; this is comfortably inside
   that and the two candidates below it are not (`90/8/2` reaches 2 of 10
   seeds).
4. **It keeps the high-risk regime a consequence rather than a default.** 4.55 %
   of arrivals are tier 3 and 15.15 % tier 2, against `always 2`'s 36.36 % — the
   distribution ADR 0080 correctly calls *"a different game"*, and which this
   measurement backs: 30 weapons and 23 escape attempts in the *well-built*
   prison at 300 days, and its contraband more than doubled, 126 → 283.
5. **It never costs a well-run player a prisoner.** `escaped` 0, riots 0 across
   ten seeds and 6,000 in-game days.
6. **It is not dominated.** `always 1` is (§5). `70/25/5` is worse than
   `60/30/10` on the ratio (3.52 vs 2.66) for less tier 3. `50/35/15` is a
   defensible alternative and is simply *more* of the same thing — 18 weapons,
   10 of 10 seeds, and 215 prisoners ever high-risk against 160.

**The conservative alternative, if the weapon should stay an oddity rather than
an event: `80/15/5`** — 10 weapons in 2,990 admissions, 8 of 10 seeds, tier 2 at
9.09 % rather than 15.15 %, and the best tier-2-per-tier-3 ratio of the safe
candidates. Everything in this record supports it equally; the difference
between the two is a taste about frequency, which is the part that is the
owner's.

**What this record does not recommend and deliberately leaves alone:** the
determinism cost. Whichever number is chosen, an implementation is a **new
registered named RNG stream drawn at the command boundary**, ordered against the
sentence and classification draws — ADR 0080's *"A distribution is also new
state"*, unamended and still the accurate account of what the change costs.

---

## 7. Weakest claim, and what would change my mind

**The weakest claim is that any of this is judgeable as *play*, because nothing
here was measured in a browser and a weapon renders as nothing.** No module
under `src/ui/` reads a contraband category; a confiscated weapon and a
confiscated phone are the same event on screen, differing only in the
`contrabandSeverity` they contributed. So every figure above is a statement
about simulation state, and *"one weapon per 370 in-game days"* is a claim about
a number in a registry rather than about anything a player will notice.
**What would change my mind: a readout that names what was found.** Until one
exists, a distribution can be chosen for its state and not for its feel, and the
frequency argument in §6 point 3 is the softest part of this record.

**Second: the admission cadence is a metronome, and the review promotion rate is
the one thing that depends on it.** The intake tier mix does not — it is a
function of the command alone, which §5 shows exactly — but *whether a prison
promotes anybody* is a function of crowding, and crowding is a function of how a
real player admits. #676 and ADR 0080 both name this as their weakest claim for
the same reason and neither had a recorded session either. **What would settle
it: the same sweep driven by an admission trace taken from a real play session.**

**Third, and it is a bound rather than a doubt: the well-built weapon counts are
small numbers.** 16 weapons in 2,990 admissions has a standard deviation of
about 4, so `60/30/10` at 16 and `50/35/15` at 18 are not distinguishable by
this measurement and I do not claim they are. The *enumerated* rates behind them
are exact and are what §5 and §6 actually argue from; the runs are there to show
what the enumeration does to a prison, not to rank two adjacent candidates.

**Fourth: `always 2` was measured at 300 days only**, six well-built seeds rather
than ten at 600, because the high-power pass deliberately skipped it. Its row is
the least-supported in the record. Nothing in §6 turns on it beyond
*"a different game"*, which its 126 → 283 contraband and 0 → 23 escape attempts
establish comfortably at that exposure.

---

## 8. What was checked and found unchanged

- **`src/main.ts:899`** still reads `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;`
  on this branch. No production constant was moved for this record and no
  distribution is wired anywhere. — VERIFIED.
- **No file under `src/` was modified.** `git status` on the branch shows only
  the untracked harness directory, which is not committed for the reason
  `docs/research/2026-08-30-what-a-classification-can-reach.md` §9.1 records:
  `tests/foundation/typecheck-coverage-contract.test.ts` requires every tracked
  module file to fall inside a project's `include`, and a harness does not. It
  is a fenced block in §9 instead.
- **`docs/adr/STATUS-QUEUE.md` is not edited by this work**, and the arithmetic
  says it does not need to be: `docs/adr/README.md` on `origin/main` holds
  **73 rows, 43 Accepted, 30 Proposed**, and on this branch **74 rows, 44
  Accepted, 30 Proposed**. Merging this branch adds an **Accepted** ADR and
  leaves the `Proposed` tally where it is, which is the count that file tracks.
  Separately, and not caused by this branch: STATUS-QUEUE's anchor `104d078`
  had **72 rows and 29 Proposed**, and the one ADR added to `main` since is
  **0079**, which is `Proposed` — so the file's *"unchanged at twenty-nine"* is
  true about its anchor and one behind current `main`, which is ordinary anchor
  staleness rather than a defect. Reported rather than edited, because another
  branch may be moving the same counts.

---

## 9. The harness, verbatim

`probe/combined.test.ts`, run with a config whose `include` is `probe/**/*.test.ts`
and whose `testTimeout` is an hour:
`node node_modules/vitest/vitest.mjs run --config probe/vitest.probe.config.ts`.
The high-power pass of §4 is the same file with one describe block swapped for a
600-day, ten-seed sweep of the well-built prison alone.

```ts
/**
 * Measurement harness for issue #677's owner ruling of 2026-08-30: ADR 0080's
 * review-time contraband draw AND a non-zero `priorIncidents`, together.
 *
 * NOT part of the suite. Lives outside `tests/` and outside `tsconfig.json`'s
 * `include`, and is never committed: nothing here is wired into `src/`.
 * `priorIncidents` is varied on the `AdmitPrisoner` command, which the schema
 * has always accepted -- no production constant is touched.
 */
import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CLASSIFICATION_REVIEW_INTERVAL_TICKS } from '../src/simulation/prisoners/classification';
import { intakeStageFromIndex } from '../src/simulation/prisoners/components';
import { classifiedAtTickOf } from '../src/simulation/prisoners/classification-review-system';
import { packCommand } from '../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { Xoshiro128StarStar } from '../src/simulation/rng/xoshiro128starstar';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const DAY = 2_400;
const ARRIVAL = { x: 30, y: 29 } as const;
const SHOWER = { x: 1, y: 17, width: 4, height: 4 } as const;
const CANTEEN = { x: 7, y: 17, width: 8, height: 8 } as const;
const YARD = { x: 17, y: 17, width: 10, height: 10 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}
function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}
/** 10 columns x N rows of 2x3 cells: x 1..29, y 1..(4N). */
function cellRect(index: number) {
  return { x: 1 + (index % 10) * 3, y: 1 + Math.floor(index / 10) * 4, width: 2, height: 3 };
}

interface Plan { readonly cells: number; readonly guards: number; readonly amenities: boolean }

function buildPrison(plan: Plan, seed: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: plan.cells }, (_u, i) => cellRect(i));
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: plan.cells + 40 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: plan.cells + 8 }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (plan.amenities) for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, i) => submit(runtime, `zone-c${i}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (plan.amenities) {
    submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  }
  cells.forEach((rect, i) => {
    submit(runtime, `bed${i}`, packCommand({ type: 'PlaceObject', orderId: `bed${i}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc${i}`, packCommand({ type: 'PlaceObject', orderId: `wc${i}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  if (plan.amenities) {
    for (let i = 0; i < 4; i += 1) submit(runtime, `sh${i}`, packCommand({ type: 'PlaceObject', orderId: `sh${i}`, definitionId: 'shower-head-brick', x: SHOWER.x + (i % 2), y: SHOWER.y + Math.floor(i / 2) }));
    for (let i = 0; i < 4; i += 1) submit(runtime, `dt${i}`, packCommand({ type: 'PlaceObject', orderId: `dt${i}`, definitionId: 'dining-table-wooden', x: CANTEEN.x + (i % 2) * 3, y: CANTEEN.y + Math.floor(i / 2) * 3 }));
    for (let i = 0; i < 8; i += 1) submit(runtime, `bench${i}`, packCommand({ type: 'PlaceObject', orderId: `bench${i}`, definitionId: 'bench-wooden', x: CANTEEN.x + (i % 4) * 2, y: CANTEEN.y + 6 - Math.floor(i / 4) }));
  }
  stepTo(runtime, 2_000);
  for (let i = 0; i < plan.guards; i += 1) submit(runtime, `hire${i}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  if (runtime.refusals.count > 0) console.log(`  REFUSALS during construction: ${runtime.refusals.count} ${JSON.stringify(runtime.refusals.last)}`);
  return runtime;
}

interface Tracked { classifiedAt: number; sentence: number; intakeTier: number; maxTier: number; reviews: number; tierThreeAt?: number }

/** A `priorIncidents` distribution as weights over the values 0, 1, 2. */
interface Priors { readonly label: string; readonly weights: readonly [number, number, number] }

/**
 * The harness's own draw, on its own RNG, seeded from the run seed.
 *
 * **This is not what an in-simulation implementation would do**, and the
 * difference is stated rather than hidden: a real one draws on a registered
 * named stream inside the command boundary, which changes the determinism
 * fingerprint. The *statistics* of the intake tier are the same either way,
 * which is what this harness is measuring.
 */
function makePriorsDraw(priors: Priors, seed: number): () => number {
  const [w0, w1, w2] = priors.weights;
  if (w0 === 1) return () => 0;
  if (w1 === 1) return () => 1;
  if (w2 === 1) return () => 2;
  const rng = new Xoshiro128StarStar([(seed ^ 0x9e3779b9) >>> 0, (seed ^ 0x85ebca6b) >>> 0, (seed ^ 0xc2b2ae35) >>> 0, (seed ^ 0x27d4eb2f) >>> 0]);
  const total = w0 + w1 + w2;
  return () => {
    const draw = (rng.nextInt(1_000_000) / 1_000_000) * total;
    if (draw < w0) return 0;
    if (draw < w0 + w1) return 1;
    return 2;
  };
}

interface Result {
  readonly shape: string;
  readonly priors: string;
  readonly seed: number;
  readonly admits: number;
  readonly intake: readonly number[];
  readonly max: readonly number[];
  readonly weapons: number;
  readonly contraband: number;
  readonly byCategory: Record<string, number>;
  readonly escapes: number;
  readonly escaped: number;
  readonly riots: number;
  readonly assaults: number;
  readonly confiscations: number;
  readonly peak: number;
  readonly intakeItems: number;
  readonly reviewItems: number;
  readonly intakeWeapons: number;
  readonly reviewWeapons: number;
  readonly unattributed: number;
}

function run(shape: string, plan: Plan, seed: number, days: number, admitEvery: number, priors: Priors): Result {
  const runtime = buildPrison(plan, seed);
  const drawPriors = makePriorsDraw(priors, seed);
  const store = runtime.prisoners.entityStore;
  const records = runtime.prisoners.records;
  const tracked = new Map<number, Tracked>();
  const RUN = days * DAY;
  let admits = 0;
  let peakPopulation = 0;
  while (runtime.kernel.tick < RUN) {
    const tick = runtime.kernel.tick;
    if (tick % admitEvery === 0) {
      submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: drawPriors(), ...ARRIVAL }));
      admits += 1;
      continue;
    }
    if (tick % CLASSIFICATION_REVIEW_INTERVAL_TICKS === CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1) {
      for (let i = 0; i <= store.maxActiveIndex; i += 1) {
        if (!store.isIndexAlive(i)) continue;
        const stage = intakeStageFromIndex(records.intakeStage[i]!);
        if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
        const c = classifiedAtTickOf(records.sentenceEndTick[i]!, records.sentenceLengthTicks[i]!);
        if (c === undefined || tick - c < CLASSIFICATION_REVIEW_INTERVAL_TICKS) continue;
        const t = tracked.get(store.getIdByIndex(i));
        if (t !== undefined) t.reviews += 1;
      }
    }
    runtime.kernel.step();
    let alive = 0;
    for (let i = 0; i <= store.maxActiveIndex; i += 1) {
      if (!store.isIndexAlive(i)) continue;
      const len = records.sentenceLengthTicks[i]!;
      if (len === 0) continue;
      alive += 1;
      const stage = intakeStageFromIndex(records.intakeStage[i]!);
      if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
      const id = store.getIdByIndex(i);
      const c = classifiedAtTickOf(records.sentenceEndTick[i]!, len);
      if (c === undefined) continue;
      const tier = records.riskTier[i]!;
      const existing = tracked.get(id);
      if (existing === undefined || existing.classifiedAt !== c) {
        tracked.set(id, { classifiedAt: c, sentence: len, intakeTier: tier, maxTier: tier, reviews: 0, ...(tier >= 3 ? { tierThreeAt: runtime.kernel.tick } : {}) });
      } else {
        if (tier > existing.maxTier) existing.maxTier = tier;
        if (tier >= 3 && existing.tierThreeAt === undefined) existing.tierThreeAt = runtime.kernel.tick;
      }
    }
    if (alive > peakPopulation) peakPopulation = alive;
  }
  const all = [...tracked.values()];
  const intake = [0, 0, 0, 0];
  const max = [0, 0, 0, 0];
  for (const t of all) { intake[t.intakeTier] = (intake[t.intakeTier] ?? 0) + 1; max[t.maxTier] = (max[t.maxTier] ?? 0) + 1; }
  const byCategory = runtime.contraband.all().reduce<Record<string, number>>((acc, item) => { acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1; return acc; }, {});
  /**
   * Which of the two producers minted each item.
   *
   * `introduceContrabandOnIntake` writes `provenance.introducedAtTick` and
   * `sourceId` (the holder's entity id as a string) from both call sites, and
   * the intake call site runs at the prisoner's classification tick -- which
   * `classifiedAtTickOf` recovers from two persisted fields. So an item whose
   * `introducedAtTick` equals its holder's classification tick came in at
   * intake, and anything later came from the review this decision armed.
   * A review cannot fire on the classification tick itself (it needs 24,000
   * ticks of tenure), so the two cases cannot collide.
   */
  let intakeItems = 0;
  let reviewItems = 0;
  let intakeWeapons = 0;
  let reviewWeapons = 0;
  let unattributed = 0;
  for (const item of runtime.contraband.all()) {
    const holder = tracked.get(Number(item.provenance.sourceId));
    const weapon = item.categoryId === 'contraband.weapon';
    if (holder === undefined) { unattributed += 1; continue; }
    if (item.provenance.introducedAtTick === holder.classifiedAt) {
      intakeItems += 1;
      if (weapon) intakeWeapons += 1;
    } else {
      reviewItems += 1;
      if (weapon) reviewWeapons += 1;
    }
  }
  const incidents = runtime.incidents.all();
  const byType = incidents.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {});
  let escaped = 0;
  for (const record of incidents) {
    if (record.type !== 'escape-attempt') continue;
    if (record.outcome?.escaped === true) escaped += 1;
  }
  const result: Result = {
    shape,
    priors: priors.label,
    seed,
    admits,
    intake,
    max,
    weapons: byCategory['contraband.weapon'] ?? 0,
    contraband: runtime.contraband.all().length,
    byCategory,
    escapes: byType['escape-attempt'] ?? 0,
    escaped,
    riots: byType.riot ?? 0,
    assaults: byType.assault ?? 0,
    confiscations: runtime.confiscations.all().length,
    peak: peakPopulation,
    intakeItems,
    reviewItems,
    intakeWeapons,
    reviewWeapons,
    unattributed,
  };
  const out = process.env.PROBE_OUT;
  if (out !== undefined) appendFileSync(out, `${JSON.stringify(result)}\n`);
  console.log(`RESULT ${JSON.stringify(result)}`);
  return result;
}

const PRIORS: readonly Priors[] = [
  { label: 'always 0 (today)', weights: [1, 0, 0] },
  { label: '90/8/2', weights: [0.90, 0.08, 0.02] },
  { label: '80/15/5', weights: [0.80, 0.15, 0.05] },
  { label: '70/25/5', weights: [0.70, 0.25, 0.05] },
  { label: '60/30/10', weights: [0.60, 0.30, 0.10] },
  { label: '50/35/15', weights: [0.50, 0.35, 0.15] },
  { label: 'always 1', weights: [0, 1, 0] },
  { label: 'always 2', weights: [0, 0, 1] },
];

const WELL_BUILT: Plan = { cells: 40, guards: 8, amenities: true };
const UNDER_BUILT: Plan = { cells: 12, guards: 2, amenities: true };
const NEGLECTED: Plan = { cells: 12, guards: 0, amenities: false };
/** ADR 0080's four, plus two more: its own weakest claim is that the well-built zero rests on four seeds. */
const SEEDS_WELL = [0x0cc0, 0x51a7, 0x2f19, 0x77aa, 0x1234, 0xbeef];
const SEEDS_OTHER = [0x0cc0, 0x51a7, 0x2f19, 0x77aa];

const ONLY = process.env.PROBE_ONLY;

describe('combined: ADR 0080 in force, priors varied', () => {
  for (const priors of PRIORS) {
    if (ONLY !== undefined && ONLY !== priors.label) continue;
    it(`well built | ${priors.label}`, () => {
      for (const seed of SEEDS_WELL) run('well-built', WELL_BUILT, seed, 300, 2 * DAY, priors);
    });
    it(`under built | ${priors.label}`, () => {
      for (const seed of SEEDS_OTHER) run('under-built', UNDER_BUILT, seed, 300, 2 * DAY, priors);
    });
    it(`neglected | ${priors.label}`, () => {
      for (const seed of SEEDS_OTHER) run('neglected', NEGLECTED, seed, 300, DAY, priors);
    });
  }
});
```
