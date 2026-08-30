# Tier 3 at intake, and the weapon nobody can smuggle. Measured on `898a16a`, v0.0.252

**Date:** 2026-08-30
**Tree:** `898a16a` (`chore(release): v0.0.252`), branch `agent/540-tier-three`
**Question put to this record:** [#540](https://github.com/matmaxalez/lockstate/issues/540) —
is `priorIncidents: 0` a placeholder or a decision, what does a non-zero value
mean at intake, what else is gated on tier 3, and how much of the security half
of the game has never run?

**Three answers, and one of them contradicts the brief this pass was given.**

1. **`priorIncidents: 0` is neither a placeholder nor a balance decision. It is
   a recorded *abstention*** — the composition root declining to make a call it
   said in the same sentence was not its to make. The commit that introduced it
   says so, and gives a second, *defensive* reason that has since been fixed
   elsewhere. §2.
2. **The escape mechanic is not dead, and has not been since
   [#659](https://github.com/matmaxalez/lockstate/pull/659) merged.**
   [#643](https://github.com/matmaxalez/lockstate/pull/643)'s
   *"escape-attempt at zero across four `priorIncidents: 0` runs"* was a
   consequence of the **sentence range**, not of `priorIncidents`. Measured here
   at the current range with `priorIncidents: 0`: **30, 13 and 1 escape attempts**
   in three prisons, and **every one of the 30 belonged to a prisoner admitted at
   tier 0, 1 or 2 and promoted to tier 3 by exactly one classification review.**
   §5.
3. **The weapon is genuinely unreachable, and it is the last thing that is.**
   Not measured-zero — **impossible**, by integer arithmetic over three constants
   plus the fact that contraband is introduced at exactly one call site, reading
   the intake tier. §6, §7.

**No threshold, range or balance value was changed.** ADR 0017 decision 5 puts
those with [#29](https://github.com/matmaxalez/lockstate/issues/29). Two source
comments left false by #659 were corrected (§8); no behaviour was touched.

---

## 0. How to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line, or the number was
  produced by running the real kernel in this worktree and pasted.
- **DERIVED** — integer arithmetic over VERIFIED constants, written out so it
  can be checked without a run. Every DERIVED claim here also has a VERIFIED
  measurement beside it.
- **UNKNOWN** — could not be established.

Line citations are against `898a16a`. Prose from other documents is quoted
rather than cited by line, per `docs/AGENT_WORKFLOW.md` §4.

---

## 1. What #659 closed, and the one thing it did not — VERIFIED

`MIN_SENTENCE_DAYS = 14` (`src/simulation/prisoners/sentence.ts:200`) and
`MAX_SENTENCE_DAYS = 90` (`:201`); a day is 2,400 ticks, so the drawable range
is **33,600 to 216,000 ticks** over 77 equiprobable values.

`LONG_SENTENCE_THRESHOLD_TICKS = 200_000`
(`src/simulation/prisoners/classification.ts:41`). `200,000 / 2,400 = 83.33`, so
the **seven** lengths from 84 to 90 in-game days score the long-sentence point —
**7 of 77, 9.09%**. — DERIVED, and VERIFIED by the enumeration in §4.

`classifyPrisoner` (`classification.ts:82-90`) is three terms:

```ts
let score = 0;
if (input.sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS) score += 1;
score += Math.min(2, Math.max(0, input.priorIncidents));

const screeningVariance = rng.nextInt(3) - 1; // -1 | 0 | +1
const riskTier = clampTier(score + screeningVariance);
```

With `priorIncidents: 0` the score is at most `1 + 0 + 1 = 2`.
`classificationGroupIdForTier` answers `'high-risk'` only at `riskTier >= 3`
(`classification.ts:59`). **So an ordinary admission clamps at tier 2 and cannot
reach tier 3, at any sentence length, on any seed.** The brief's arithmetic is
confirmed exactly. — DERIVED; VERIFIED at §4 over the whole draw space and over
200,000 real draws.

**What #659 did close, confirmed here rather than taken on trust:**

| value | before #659 | now | evidence |
| --- | --- | --- | --- |
| `ClassificationFactors.sentence` | always 0 | **1 for 9.09% of draws** | §4 shows tier 2 at intake at exactly that rate |
| a first classification review | 14.0% of prisoners | **94.0–95.3% measured** | §4; and exhaustively, every sentence of 20 days or more reaches one from all 24,000 phases |
| a *second* review | impossible for anybody | **up to 8 per prisoner** | §4, enumerated |
| `MAX_CLEAN_CONDUCT_CREDIT = 2` | could only hold 0 or −1 | **{−2, −1, 0} reachable** | §4, enumerated |

All four were tracked as unreachable by #632 and #643. They are closed. What
follows is about the one that is not.

---

## 2. Placeholder or decision? — the introducing commit settles it — VERIFIED

`git log -S "priorIncidents: 0" -- src/main.ts` returns two commits, and the
first is `1db8c16`, *"Let the player admit a prisoner, and refuse when there is
nowhere to put them (#306)"*, 2026-08-25. The line it introduced was
`const ADMISSION_REQUEST = { sentenceLengthTicks: 10_000, priorIncidents: 0 } as const;`
and the docblock it introduced above it said, in full:

> Neither number is a balance decision this file is entitled to make, so both
> are deliberately the least eventful values in range rather than interesting
> ones: `0` prior incidents is the bottom of the `priorIncidentsAtIntake` slot,
> and 10,000 ticks is well under `LONG_SENTENCE_THRESHOLD_TICKS` (200,000), so
> neither adds to `classifyPrisoner`'s score. The tier that results is therefore
> the screening draw alone -- which is the point: the variation comes from
> `prisoners.classification`, seeded, and not from a figure picked here.

**That is the answer, and it is a third category the brief's question did not
offer.** It is not a placeholder — nothing was left to be filled in later by
whoever noticed. It is not a decision that priors *should* be zero — the
sentence says the opposite, that no such decision was being taken here. It is a
**deliberate abstention**: a value chosen for being inert, by a file recording
that the choice was somebody else's.

**Two things follow from that, and they point in opposite directions.**

**First, the precedent is already set, by the other half of the same sentence.**
`sentenceLengthTicks: 10_000` was chosen in that same docblock, for that same
stated reason, in that same `as const`. It is gone: `89da98f` (#541, ADR 0069)
moved the draw inside the worker, the owner ruled on #593, and ADR 0079 set the
range. The abstention was resolved by the owner taking the decision the comment
said was theirs. **`priorIncidents` is the surviving half of a pair, and the
pair's other half has already been through this.** — VERIFIED: both commits
opened; `src/main.ts:899` now reads `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;`.

**Second, the commit body gives a *defensive* reason that no longer applies.**
`1db8c16`'s message says:

> ADR 0028's classification hole is measured and left open rather than claimed
> closed: with only a cell zoned, some seeds classify high-risk, find no
> solitary target and land in the terminal stage — but that is not reachable
> from the panel, since the admission request scores zero against the tier
> variance and only tiers 0 and 1 occur across 300 seeds.

So in August `priorIncidents: 0` was also **load-bearing for safety**: a
high-risk arrival into a cell-only prison hit the terminal `'failed'` intake
stage, and pinning priors at 0 was what kept the panel out of that trap.

**That trap is closed.** `IntakeSystem.hasAccommodationTarget`
(`src/simulation/prisoners/intake-system.ts:396-401`) now asks the question for
*every* classification group, and `DEFAULT_ACCOMMODATION_POLICY`
(`:97-101`) lists both housing types for both groups —
`classificationGroupId === 'high-risk' ? [SOLITARY_CELL, CELL] : [CELL, SOLITARY_CELL]`.
Its own docblock states the resulting property: *"if this returns true, no
classification outcome can reach `'failed'`"*, and
`tests/unit/prisoners-intake-system.test.ts` asserts it exhaustively over every
combination of housing type and group. — VERIFIED at the lines.

**So the safety reason for holding priors at 0 was retired by a fix somewhere
else, and the value stayed.** That is worth saying plainly to whoever takes
#540's decision: raising `priorIncidents` today cannot strand an arrival in the
terminal stage, and in August it could.

---

## 3. What a non-zero `priorIncidents` would mean — what the code assumes — VERIFIED

The brief asks whether the value belongs to the prisoner's past, to a difficulty
setting, or to nothing. **The code has an answer and it is narrow.**

- **It is declared as biography, and typed as almost nothing.**
  `ClassificationInput.priorIncidents`'s doc comment (`classification.ts:9`)
  reads: *"Count of prior disciplinary/security incidents on record -- a simple
  integer input, not a real history system."* The field's own author says it
  stands in for a history that does not exist.
- **It is stored, and it survives.** `priorIncidentsAtIntake` is a `Uint8Array`
  slot (`src/simulation/prisoners/components.ts:85`), written once at the
  classification stage (`intake-system.ts:274`), snapshotted, and restored
  (`src/simulation/runtime/session-systems.ts:388`, `:442`). It is part of the
  save format already.
- **It is read twice and saturates at 2 both times.** `classifyPrisoner`
  (`classification.ts:85`) and `reviewClassification` (`:195`) each apply
  `Math.min(2, Math.max(0, ...))`. **`MAX_PRIOR_INCIDENTS = 255`
  (`components.ts:75`) and `admitPrisonerSchema` accepts every value up to it
  (`src/simulation/protocol/commands.ts:270`), but 2 and 255 are the same
  prisoner to every consumer.** The only distinctions the model can make are
  0, 1 and "2 or more". — VERIFIED at all four lines.
- **Nothing renders it.** `projectPrisonerDetail` carries
  `priorIncidentsAtIntake`
  (`src/simulation/presentation/prisoner-projection.ts:218`, `:639`) and
  `grep -rn "priorIncidentsAtIntake" src/ui/` returns nothing. — VERIFIED,
  empty result.
- **It is not a difficulty setting anywhere in the tree.** There is no
  difficulty concept in `src/` for it to hang off.

**So the code assumes it is the prisoner's own past, carried on the admission,
with an effective domain of three values.** It does not assume a generator, a
difficulty dial, or a player control — it assumes *the caller knows*, and the
only caller is a composition root that has recorded that it does not.

Two consequences worth handing to #540 rather than deciding here:

- **A drawn `priorIncidents` would need a stream.** Both existing intake draws
  are commented at length about *which* stream and *where in the tick* they
  happen — `prisoners.classification` and `prisoners.sentence`, both inside
  `EntityQuery.execute()`'s ascending-entity-id walk
  (`intake-system.ts:457-484`), because *"the order sentences are drawn in is a
  function of state, not of the order a player happened to press Admit"*. A
  third draw is the same shape and `src/simulation/runtime/new-session.ts`
  already shows what registering one costs. This is a solved problem in this
  repository, not an open one.
- **A drawn `priorIncidents` moves every existing seed.** The determinism
  property #541 spent on #593 was already spent; but a draw on a *new* stream
  leaves `prisoners.classification` where it is, so the cost is the tier
  distribution changing and not the stream alignment. That distinction is what
  `new-session.ts:389-399` is written about.

---

## 4. The measured tier distribution — VERIFIED

**Enumerated over the entire intake input space** — 77 drawable sentence
lengths × 3 screening outcomes = 231 cases, each equiprobable because the draw
is `rng.nextInt(3)` over a uniform sentence:

```
MIN_SENTENCE_DAYS=14 MAX_SENTENCE_DAYS=90 DAY=2400
priors=0: t0=147 (63.64%) t1=77 (33.33%) t2=7 (3.03%) t3=0 (0.00%)
priors=1: t0=70 (30.30%)  t1=77 (33.33%) t2=77 (33.33%) t3=7 (3.03%)
priors=2: t0=0 (0.00%)    t1=70 (30.30%) t2=77 (33.33%) t3=84 (36.36%)
long-sentence lengths (>=200000 ticks): days 84..90 = 7/77
```

Against the real `Xoshiro128StarStar`, 200,000 draws, `priorIncidents: 0`:

```
t0=127005 (63.50%) t1=66949 (33.47%) t2=6046 (3.02%) t3=0 (0.00%)
```

**Tier 3 at intake is 0.00% and the enumeration is exhaustive, so that is
impossibility rather than sampling.**

**The review space, enumerated** — 925,260 cases over every drawable sentence,
every 200th classification phase, findings 0–4 and five clean-conduct positions:

```
reachable riskTier at review (priors 0, drawable sentence): {0,1,2,3}
reachable cleanConduct factor: {-2,-1,0}  (MAX_CLEAN_CONDUCT_CREDIT is 2)
reviews one prisoner can receive: min=0 max=8
wait to first review, exhaustive over 24000 phases: min=24000 max=47999
a review at the minimum wait with 3 findings and no clean credit:
  tier 3, factors {"sentence":0,"intakeHistory":0,"findings":3,"cleanConduct":0}
```

So **the earliest a prisoner can be tier 3 is 24,000 ticks — 10 in-game days —
after classification**, and it takes three disciplinary points with no clean
credit. Reachability of a *first* review by sentence length, exhaustive over all
24,000 phases:

| sentence | phases reaching a first review |
| --- | --- |
| 14 days | 9,619 / 24,000 (**40.1%**) |
| 20 days | 24,000 / 24,000 (100%) |
| 30 / 50 / 90 days | 24,000 / 24,000 (100%) |

**Six prisons in the real kernel**, 300 in-game days each,
`priorIncidents: 0`, admissions on a fixed cadence, seed `0x0cc0` unless noted.
"tier 3" is the count that ever held it; "escape" is `escape-attempt` incidents.

| prison | admits | intake t0/t1/t2/t3 | ever tier 3 | ≥1 review | escape | weapons |
| --- | --- | --- | --- | --- | --- | --- |
| 40 cells, amenities, 8 guards, 1 arrival/2d | 149 | 91 / 54 / 4 / **0** | **0 (0.0%)** | 95.3% | **0** | 0 |
| the same, seed `0x51a7` | 149 | 94 / 49 / 6 / **0** | **0 (0.0%)** | 94.0% | **0** | 0 |
| 40 cells, amenities, 8 guards, 1 arrival/day (peak 59) | 299 | 185 / 106 / 8 / **0** | 30 (10.0%) | 94.6% | 0 | 0 |
| 12 cells, amenities, 2 guards, 1 arrival/2d (peak 31) | 149 | 91 / 54 / 4 / **0** | 139 (93.3%) | 95.3% | **1** | 0 |
| 12 cells, toilets, amenities, 2 guards, 1 arrival/day (peak 59) | 299 | 185 / 106 / 8 / **0** | 281 (94.0%) | 94.6% | **13** | 0 |
| 12 bare cells, no amenities, no guards, 1 arrival/day (peak 53) | 299 | 185 / 106 / 8 / **0** | 283 (94.6%) | 94.6% | **30** | 0 |

Delay from classification to first holding tier 3, where it happened:
**min 26,390 ticks (11.0 in-game days), median 35,990–47,990 (15–20 days),
max 187,190 (78 days)**.

**Three things this table says that reading the code does not.**

- **The intake row is identical in every prison and every one of its tier-3
  cells is 0.** The prison cannot influence it; only the command can.
- **Tier 3 by review is a readout of the prison, not a lottery.** Two
  adequately-built prisons on two seeds produced **zero** promotions across
  1,112 completed reviews; the same admissions into twelve cells produced 93.3%
  and 94.6%. #643 found the same shape at the old range and it survives the new
  one.
- **The middle row is the interesting one.** A prison with enough beds but
  admitting twice as fast produced 10% tier 3, 250 assaults and **zero riots** —
  overcrowding without deprivation is a different failure from deprivation, and
  the classification review tells them apart.

---

## 5. Escape attempts are alive. The brief's third hypothesis is refuted — VERIFIED

`canAttemptEscape` (`src/simulation/incidents/flashpoint.ts:281-283`) is

```ts
return flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0;
```

with `ESCAPE_ATTEMPT_MINIMUM_RISK_TIER = 3` (`:113`), and it is the **only** gate:
`IncidentTriggerSystem` filters candidates through it before anything is scored
(`src/simulation/incidents/trigger-system.ts:343-344`). — VERIFIED at both lines.

The brief asked whether *"the escape mechanic may be dead for the same single
reason"*. **It is not, and #643's own §12 named this as its weakest claim and
said exactly what would change its mind:** *"a run that seeds a tier-0 arrival
with a long-enough sentence and a favourable classification phase, gives them a
confiscation-free holding, and reaches a review — if that produces an escape
attempt, row 8 becomes 'vanishingly rare' rather than 'measured zero'."*

**#659 produced that run by accident, in ordinary play, thirty times.** From the
neglected prison above, every `escape-attempt` incident's participant, tallied
by what they were at intake:

```
escape-attempt subjects: {"intakeTier=0 maxTier=3 reviews=1":12,
                          "intakeTier=1 maxTier=3 reviews=1":15,
                          "intakeTier=2 maxTier=3 reviews=1":3}
```

and from the 12-cell prison at half the admission rate: `{"intakeTier=2 maxTier=3 reviews=1":1}`.

**Thirty distinct prisoners, none admitted above tier 2, all promoted to tier 3
by exactly one review, all still holding contraband introduced at their own
intake.** That is the case #643 could not construct, occurring unprompted.

So the correct statement is: **`escape-attempt` was measured-zero because no
prisoner lived long enough to be reviewed, not because `priorIncidents` is 0.**
#643's row 8 is superseded by its own criterion, and #659 is what superseded it.
`SUCCESSFUL_ESCAPE_SURCHARGE_POINTS` and
`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE['escape-attempt']`
(`src/simulation/prisoners/disciplinary-record.ts`) inherit that and are alive
with it.

**What is still true**: an escape attempt needs a prisoner who is *both* promoted
*and* still carrying. Contraband enters only at intake (§6), so the carrying half
is decided before the promoting half is possible, and a search that confiscates
in between closes it. That is why the well-run prisons show 0 with 18 and 29
confiscations while the unguarded one shows 30 with none. **The mechanic is
alive and it is gated on neglect, which is a design, not a defect.**

---

## 6. Everything gated on tier 3 — the sweep

Two distinct gates exist and they must not be conflated: the **tier** (`>= 3`)
and the **regime group** (`'high-risk'`, which is the same condition read
through `classificationGroupIdForTier`, `classification.ts:59`). Every consumer
found by grepping `riskTier`, `high-risk` and `HIGH_RISK` across `src/`:

| # | gated on | site | reachable from an ordinary admission? |
| --- | --- | --- | --- |
| 1 | tier ≥ 3 | `canAttemptEscape`, `flashpoint.ts:281` | **yes, by review** — 30, 13, 1 measured (§5) |
| 2 | tier, at intake | eligible contraband categories, `contraband/introduction.ts:240` | **no for `contraband.weapon`** — §7 |
| 3 | tier, at intake | `contrabandIntroductionProbability`, `introduction.ts:245-250` | **caps at 0.3**, not 0.4 — §7 |
| 4 | group | accommodation preference `[SOLITARY_CELL, CELL]`, `intake-system.ts:99` | **no at intake**; the *review*-driven route into `room.solitary-cell` was measured by #643 |
| 5 | group | `HIGH_RISK_REGIME`, `src/simulation/prisoners/regime.ts:120-129` | **yes**, by review and by sanction |
| 6 | group | route permissions `[]`, `src/simulation/prisoners/action-system.ts:159` | yes, with 5 |
| 7 | group | `'high-risk'` access policy, `src/simulation/security/access-policy.ts:46`, and its `High Risk` label at `src/content/simulation-message-keys.ts:216` | yes, with 5 |
| 8 | group | `'warning'` tone on the regime row, `src/ui/hud/regime-panel.ts:213` | yes, with 5 |
| 9 | group | high-risk headcount, `src/simulation/presentation/status-strip-projection.ts:456` | yes, with 5 |
| 10 | tier | the `High` badge, `risk-tier` labels at `src/content/simulation-message-keys.ts:221-225` | yes, with 5 |

**Nine of the ten are reachable from a HUD admission today.** Rows 2, 3 and 4 are
not, and all three fail for the same reason: they read the tier **at the
classification stage**, which is the one moment `priorIncidents` decides and the
review cannot revisit.

Two claims #540 makes about this list do not survive the sweep, and both were
already corrected by #643 — repeated here because #540's title still carries the
first:

- **"solitary is unreachable" is false.** Row 4 is the *intake* route only;
  `SanctionSystem` relocates into `room.solitary-cell` independently of tier,
  and the accommodation branch takes a review-promoted prisoner still queued for
  a bed.
- **Cell sharing is not tier-gated.** #540 says tier decides *"cell sharing,
  contraband introduction and the regime timetable"*. Grepping `riskTier` and
  the classification group against room occupancy and capacity returns nothing:
  the other two are real (rows 2/3 and 5), sharing is not. — VERIFIED, empty
  result.

---

## 7. What is left unreachable, exactly — VERIFIED

**One thing, with two consequences hanging off it.**

**The thing:** `classifyPrisoner` cannot return 3 while `priorIncidents` is 0.
`max score = 1 (sentence) + 0 (priors) + 1 (screening) = 2`, and `clampTier`
cannot raise it. — DERIVED; VERIFIED exhaustively at §4.

**Consequence 1 — `contraband.weapon` has no producer in any prison a player can
create.** Three facts, each VERIFIED at the line:

- `contraband.introduce` has exactly one caller in `src/`:
  `introduceContrabandOnIntake` (`contraband/introduction.ts:294`), which itself
  has exactly one caller: `intake-system.ts:502`, passing `result.riskTier` —
  the tier `classifyPrisoner` returned one statement earlier at `:491`.
  `grep -rn "\.introduce(" src/` returns those two lines and nothing else.
- The eligibility band is a prefix of the severity ordering:
  `categoriesAtTierZero + categoriesPerRiskTier * riskTier` = `2 + 1 × tier`
  (`introduction.ts:240`, policy at `:200-205`). Severities in
  `src/content/contraband-catalog.ts:40-44` are weapon 9, drug 7, tool 6,
  phone 4, currency 2 — so the ordering is currency < phone < tool < drug <
  weapon and the fifth slot opens at tier 3 alone. Printed from the shipped
  catalogue:

  ```
  tier 0: contraband.currency, contraband.phone
  tier 1: + contraband.tool
  tier 2: + contraband.drug
  tier 3: + contraband.weapon
  ```
- No later system re-runs introduction. `records.riskTier` is written at
  `intake-system.ts:491` and at
  `src/simulation/prisoners/classification-review-system.ts:322`; the second has
  no contraband call beside it.

So the brief's phrasing is exactly right and can be strengthened: **drugs became
reachable and weapons did not, and weapons are not rare — they are impossible.**
Measured: **0 `contraband.weapon` across all six `priorIncidents: 0` runs**, and
1 and 2 respectively in the `priorIncidents: 1` and `2` runs of §"what a wider
admission does" below. `categoriesPerRiskTier` has a producer for its third and
fourth steps and none for its fifth.

**Consequence 2 — `contrabandIntroductionProbability` caps at 0.3, not 0.4.**
`0.1 + 0.1 × riskTier` with tier ∈ {0, 1, 2}. **This corrects #643's inventory
row 7, which said 0.2** — correct at the old range, where tier 2 was
unreachable. — DERIVED from `introduction.ts:200-205`, `:245-250`.

**And one thing that is *not* on this list, though the brief expected it:**
the intake accommodation preference (row 4) is unreachable at intake, but the
room it names is not, so nothing is dead content there.

### What a wider admission does — measured, for the decision, not as a proposal

The same two prisons with `priorIncidents` set on the command, which only a
hand-written `AdmitPrisoner` can do today (`src/main.ts:899` hard-codes 0):

| prison | priors | intake t0/t1/t2/t3 | ever tier 3 | escape | weapons |
| --- | --- | --- | --- | --- | --- |
| 40 cells, 8 guards, 1/2d | 0 | 91 / 54 / 4 / 0 | 0 | 0 | 0 |
| 40 cells, 8 guards, 1/2d | 1 | 39 / 52 / 54 / **4** | 5 | 0 | 0 |
| 40 cells, 8 guards, 1/2d | 2 | 0 / 39 / 52 / **58** | 65 | 1 | **1** |
| 12 bare cells, 0 guards, 1/1d | 0 | 185 / 106 / 8 / 0 | 283 | 30 | 0 |
| 12 bare cells, 0 guards, 1/1d | 1 | 89 / 96 / 106 / **8** | 284 | 42 | **1** |
| 12 bare cells, 0 guards, 1/1d | 2 | 0 / 89 / 96 / **114** | 288 | 51 | **2** |

**`priorIncidents: 1` is the smallest change that gives the fifth step a
producer**: it puts 3.03% of arrivals at tier 3 and produced one weapon in 299
admissions. `priorIncidents: 2` puts 36.36% there, which is a different game.
**Nothing here recommends a number** — ADR 0017 decision 5 and #29 own that, and
#540's option list is the owner's.

---

## 8. Two comments #659 left false, which #669's sweep did not reach — VERIFIED

`c93109a` (#669) corrected two present-tense comments #659 falsified. Two more
of the same shape survived, both asserting the property #659 deliberately spent:

- `src/simulation/prisoners/intake-system.ts:480-482` **as `898a16a` had it** — *"with the drawn range
  entirely below `LONG_SENTENCE_THRESHOLD_TICKS`, the tier this stage assigns is
  bit-identical to the one it assigned before this line existed."*
- `src/simulation/runtime/new-session.ts:397-399` **as `898a16a` had it** — *"with the drawn range
  entirely below `LONG_SENTENCE_THRESHOLD_TICKS`, adding this stream leaves
  every classification outcome of every existing seed bit-identical."*

Both are corrected on this branch, marked in both directions rather than
overwritten, in the shape `src/main.ts:883-892` and
`src/simulation/prisoners/sentence.ts:180-188` already use. **No behaviour, value
or threshold was touched.** A third candidate, `src/simulation/prisoners/needs.ts:70`,
was checked and is already correctly marked ("Sentences **were** drawn from 2 to
16 in-game days") — it needed nothing.

This is the class, not the instance: the sweep for it was
`grep -rn "entirely below\|always 0\|bit-identical\|\[0, 1\]\|2 to 16" src/`,
and its output is three files, all named above.

---

## 9. Reproducing this

The harness is **§12**, in two fenced blocks. Copy them to
`probe/tier3.test.ts` and `probe/tier3-scaled.test.ts` at the repository root —
the relative imports assume that depth — and run them under a config of their
own:

```
mkdir -p probe && cat > probe/vitest.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', globals: false, include: ['probe/**/*.test.ts'], testTimeout: 3_600_000, hookTimeout: 3_600_000 },
});
EOF
./node_modules/.bin/vitest run --config probe/vitest.config.ts --disable-console-intercept
```

`--disable-console-intercept` is **required**: without it vitest 4 swallows every
`console.log` and the run passes silently, having reported nothing. Both files
together are about 90 seconds. `probe/` is not in `.gitignore` and must be
deleted afterwards — and it must not be committed as a `.ts` under
`docs/research/`, for the reason #643's record establishes at length: a tracked
module file outside every tsconfig `include` is refused by
`tests/foundation/typecheck-coverage-contract.test.ts`, and a `.ts` in this
directory cannot both keep compiling against a moving `src/` and be the
read-only history this directory promises.

**Two traps cost runs here and are worth repeating.**

- **The starter world is one 32×32 chunk.** `createNewSimulationRuntime` loads
  and owns exactly `chunkCoordinate(0), chunkCoordinate(0)` with
  `new SparseWorld(32)` (`new-session.ts:365-377`). A room laid out beyond x=31
  or y=31 is refused with `place-object.unowned-land`, **and the run continues
  and reports numbers anyway** — a first pass here built its amenities at x≥34,
  got a prison with no canteen and no shower, and produced a clean-looking table
  of zeros. Every run in this record checks `runtime.refusals.count` after
  construction and the harness prints the command id of anything refused.
- **A dining bench is two tiles wide.** Four bench placements were silently
  refused with `place-object.tile-occupied` before the harness printed *which*
  command was refused. A refusal count without the command that caused it is not
  a diagnosis.

---

## 10. Deliberately not done

- **No threshold, range or balance value changed**, and `priorIncidents` was not
  moved. #540's decision is the owner's; §7's table is the numbers for it, not a
  recommendation.
- **No ADR proposed.** #540 is a balance question that ADR 0017 decision 5
  already routes to #29, and the *mechanism* questions a change would raise —
  which stream, where in the tick — are answered in the tree already (§3). An ADR
  here would restate ADR 0017 and ADR 0069.
- **No test added.** The obvious one, "no HUD admission is tier 3 at intake",
  pins the exact value the owner is about to decide. #643 declined it for the
  same reason and the reason has not changed;
  `tests/integration/incident-trigger-reachability.test.ts` is the right shape
  for it *after* #29 picks numbers.
- **No pull request opened**, per the brief; the integrator opens them.

---

## 11. Verification

Machine checked idle before every timed run —
`ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest" | grep -v "bash -c"`
empty, and re-checked between runs rather than only before the first
(`docs/AGENT_WORKFLOW.md` §2, and the failure #667 records). Load average 0.33
at the start of the session on a 4-core box.

PENDING-VERIFICATION-BLOCK

The only files changed on this branch are this record, its `docs/research/README.md`
row, and the two comment corrections in §8. No determinism fingerprint moved.

---

## 12. The weakest claim, and what would change my mind

**Weakest: the 94–95% first-review figure, and the tier-3 percentages that hang
off it, are a property of a metronome.** Every run admits on a fixed cadence —
one arrival every 2,400 or 4,800 ticks — which samples the classification-phase
space evenly. A player admits in bursts. #643 named this as its own second
weakest claim and it is *more* load-bearing here, not less, because the numbers
are bigger: at the old range a burst pattern moved a 14% figure, here it moves a
95% one. **What would change my mind:** a run whose admissions follow a real
recorded play session's timing. I did not have one and did not construct a
synthetic burst pattern, because I could not defend the shape of the burst any
better than I can defend the metronome.

**Second: "every escape attempt was a review-promoted prisoner" is measured over
31 incidents in two prisons on one seed.** The *mechanism* is not in doubt —
`canAttemptEscape` is the only gate and intake cannot reach tier 3, so the
implication is arithmetic. What is sampled is the *rate*: 30 in one prison and 1
in another is not a distribution.

**Third: the six-prison table is one seed each, except one pair.** Only the
40-cell prison was run on two seeds (`0x0cc0` and `0x51a7`), and its result was
the same zero both times. The enumerated results in §4 and §7 are
seed-independent — they are exhaustive over the input space — and should be
trusted further than the run-based ones. The sentence histogram over 149 draws
of 77 values is very sparse, so any single prison's tier counts carry the
variance of one sample.

**Fourth, and it is a limit rather than a doubt: nothing here was measured in a
browser.** These are kernel runs. What a player *sees* of a tier-3 promotion —
whether the `High` badge appears, whether the regime row turns `warning` — is
row 8 and row 10 of §6 read from the source, not observed. #540's second comment
is a badge census and the equivalent census at the current range has not been
taken.

---

## 13. The harness

Two files. Copy to `probe/tier3.test.ts` and `probe/tier3-scaled.test.ts` at the
repository root and run them as §9 says. They assert almost nothing — they
measure and print. Written against `898a16a` (v0.0.252); this is history, and it
is expected to stop compiling when `src/` moves.

### `probe/tier3.test.ts`

```ts
import { describe, it } from 'vitest';
import {
  CLASSIFICATION_REVIEW_INTERVAL_TICKS,
  classifyPrisoner,
  reviewClassification,
} from '../src/simulation/prisoners/classification';
import { MIN_SENTENCE_DAYS, MAX_SENTENCE_DAYS } from '../src/simulation/prisoners/sentence';
import { intakeStageFromIndex } from '../src/simulation/prisoners/components';
import { classifiedAtTickOf } from '../src/simulation/prisoners/classification-review-system';
import { Xoshiro128StarStar } from '../src/simulation/rng/xoshiro128starstar';
import { packCommand } from '../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { eligibleContrabandCategories } from '../src/simulation/contraband/introduction';
import { defaultContrabandRegistry } from '../src/content/contraband-catalog';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const SEED = 0x0cc0;
const DAY = 2_400;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}
function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}
function cellRect(index: number) {
  return index < 8 ? { x: 1 + index * 3, y: 1, width: 2, height: 3 } : { x: 1 + (index - 8) * 3, y: 5, width: 2, height: 3 };
}

interface Plan { readonly cells: number; readonly toilets: boolean; readonly amenities: boolean; readonly guards: number }

function buildPrison(plan: Plan, seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: plan.cells }, (_u, i) => cellRect(i));
  const planks = plan.cells + (plan.amenities ? 6 + 8 : 0);
  const bricks = (plan.toilets ? plan.cells : 0) + (plan.amenities ? 2 : 0);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: planks }));
  if (bricks > 0) submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: bricks }));
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
    if (plan.toilets) submit(runtime, `wc${i}`, packCommand({ type: 'PlaceObject', orderId: `wc${i}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  if (plan.amenities) {
    submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'sh2', packCommand({ type: 'PlaceObject', orderId: 'sh2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
    submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
    submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
    for (let i = 0; i < 4; i += 1) {
      submit(runtime, `bench${i}`, packCommand({ type: 'PlaceObject', orderId: `bench${i}`, definitionId: 'bench-wooden', x: CANTEEN.x + (i % 2) * 2, y: CANTEEN.y + 2 + Math.floor(i / 2) }));
    }
  }
  stepTo(runtime, 1_000);
  for (let i = 0; i < plan.guards; i += 1) submit(runtime, `hire${i}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);
  return runtime;
}

describe('A: intake tier space, enumerated over the whole draw', () => {
  it('what classifyPrisoner can produce at priorIncidents 0 under 14-90 days', () => {
    console.log(`MIN_SENTENCE_DAYS=${MIN_SENTENCE_DAYS} MAX_SENTENCE_DAYS=${MAX_SENTENCE_DAYS} DAY=${DAY}`);
    // Exhaustive over (sentence day, screening variance): both uniform and independent.
    for (const priors of [0, 1, 2]) {
      const counts = [0, 0, 0, 0];
      let cases = 0;
      for (let days = MIN_SENTENCE_DAYS; days <= MAX_SENTENCE_DAYS; days += 1) {
        for (const variance of [-1, 0, 1]) {
          const rng = { nextInt: (_n: number) => variance + 1 } as unknown as Xoshiro128StarStar;
          const tier = classifyPrisoner({ sentenceLengthTicks: days * DAY, priorIncidents: priors }, rng).riskTier;
          counts[tier] = (counts[tier] ?? 0) + 1;
          cases += 1;
        }
      }
      console.log(
        `priors=${priors}: ` +
          counts.map((n, t) => `t${t}=${n} (${((n / cases) * 100).toFixed(2)}%)`).join(' '),
      );
    }
    // Same, against the real generator, to show the stub above is not doing the work.
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    const sampled = [0, 0, 0, 0];
    const N = 200_000;
    for (let i = 0; i < N; i += 1) {
      const days = MIN_SENTENCE_DAYS + (i % (MAX_SENTENCE_DAYS - MIN_SENTENCE_DAYS + 1));
      const tier = classifyPrisoner({ sentenceLengthTicks: days * DAY, priorIncidents: 0 }, rng).riskTier;
      sampled[tier] = (sampled[tier] ?? 0) + 1;
    }
    console.log(`real RNG, ${N} draws, priors=0: ` + sampled.map((n, t) => `t${t}=${n} (${((n / N) * 100).toFixed(2)}%)`).join(' '));
    console.log(`long-sentence lengths (>=200000 ticks): days ${Math.ceil(200_000 / DAY)}..${MAX_SENTENCE_DAYS} = ${MAX_SENTENCE_DAYS - Math.ceil(200_000 / DAY) + 1}/${MAX_SENTENCE_DAYS - MIN_SENTENCE_DAYS + 1}`);
    for (const tier of [0, 1, 2, 3]) {
      console.log(`  tier ${tier} contraband categories: ${eligibleContrabandCategories(defaultContrabandRegistry.all(), tier).map((c) => c.id).join(', ')}`);
    }
  });
});

describe('B: review space, enumerated', () => {
  it('what a review can produce for a HUD-admitted prisoner, and how many reviews they get', () => {
    const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
    const tiers = new Set<number>();
    const credits = new Set<number>();
    const reviewCounts = new Set<number>();
    const firstTierThreeAt: number[] = [];
    let cases = 0;
    for (let days = MIN_SENTENCE_DAYS; days <= MAX_SENTENCE_DAYS; days += 1) {
      const s = days * DAY;
      for (let r = 0; r < I; r += 200) {
        const C = r;
        const dischargeTick = Math.ceil((C + s) / 20) * 20;
        let n = 0;
        for (let k = 1; k <= 20; k += 1) {
          const T = k * I - 1;
          if (T < C + I) continue;
          if (T >= dischargeTick) break;
          n += 1;
          for (let findings = 0; findings <= 4; findings += 1) {
            for (const cleanSince of [C, T, T - I, T - 2 * I, Math.floor((C + T) / 2)]) {
              if (cleanSince < C || cleanSince > T) continue;
              const a = reviewClassification({
                sentenceLengthTicks: s,
                priorIncidentsAtIntake: 0,
                classifiedAtTick: C,
                tick: T,
                disciplinary: findings === 0 ? { points: 0, findingCount: 0, lastFindingTick: undefined } : { points: findings, findingCount: 1, lastFindingTick: cleanSince },
              });
              tiers.add(a.riskTier);
              credits.add(a.factors.cleanConduct);
              if (a.riskTier === 3) firstTierThreeAt.push(T - C);
              cases += 1;
            }
          }
        }
        reviewCounts.add(n);
      }
    }
    console.log(`cases enumerated: ${cases}`);
    console.log(`reachable riskTier at review (priors 0, drawable sentence): {${[...tiers].sort().join(',')}}`);
    console.log(`reachable cleanConduct factor: {${[...credits].sort((a, b) => a - b).join(',')}} (MAX_CLEAN_CONDUCT_CREDIT is 2)`);
    console.log(`reviews one prisoner can receive: min=${Math.min(...reviewCounts)} max=${Math.max(...reviewCounts)}`);
    console.log(`earliest tick-since-classification a review can return tier 3 (phases sampled every 200): ${Math.min(...firstTierThreeAt)}`);
    // Exhaustive over all 24,000 phases: the wait to a first review.
    let minWait = Infinity;
    let maxWait = 0;
    for (let C = 0; C < I; C += 1) {
      const T = Math.ceil((C + I + 1) / I) * I - 1;
      minWait = Math.min(minWait, T - C);
      maxWait = Math.max(maxWait, T - C);
    }
    console.log(`wait to first review, exhaustive over ${I} phases: min=${minWait} max=${maxWait}`);
    const atMinWait = reviewClassification({ sentenceLengthTicks: 14 * DAY, priorIncidentsAtIntake: 0, classifiedAtTick: I - 1, tick: 2 * I - 1, disciplinary: { points: 3, findingCount: 1, lastFindingTick: 2 * I - 1 } });
    console.log(`a review at the minimum wait with 3 findings and no clean credit: tier ${atMinWait.riskTier}, factors ${JSON.stringify(atMinWait.factors)}`);
    // First-review reachability by sentence length.
    for (const days of [14, 20, 30, 50, 90]) {
      const s = days * DAY;
      let reached = 0;
      let total = 0;
      for (let C = 0; C < I; C += 1) {
        total += 1;
        const dischargeTick = Math.ceil((C + s) / 20) * 20;
        const T = Math.ceil((C + I + 1) / I) * I - 1;
        if (T < dischargeTick) reached += 1;
      }
      console.log(`  ${days}d: first review reached from ${reached}/${total} phases (${((reached / total) * 100).toFixed(1)}%)`);
    }
  });
});

interface Tracked {
  classifiedAt: number;
  sentence: number;
  intakeTier: number;
  maxTier: number;
  reviews: number;
  tierThreeAt?: number;
}

describe('C: real kernel, steady admissions, current range', () => {
  for (const scenario of [
    { label: 'well-run (12 cells, toilets, amenities, 2 guards)', plan: { cells: 12, toilets: true, amenities: true, guards: 2 } as Plan },
    { label: 'neglected (12 bare cells, no amenities, no guards)', plan: { cells: 12, toilets: false, amenities: false, guards: 0 } as Plan },
  ]) {
    it(`${scenario.label}`, () => {
      const runtime = buildPrison(scenario.plan);
      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      const tracked = new Map<number, Tracked>();
      const RUN = 300 * DAY; // 300 in-game days
      const ADMIT_EVERY = DAY;
      let admits = 0;
      while (runtime.kernel.tick < RUN) {
        const tick = runtime.kernel.tick;
        if (tick % ADMIT_EVERY === 0) {
          submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, ...ARRIVAL }));
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
        for (let i = 0; i <= store.maxActiveIndex; i += 1) {
          if (!store.isIndexAlive(i)) continue;
          const len = records.sentenceLengthTicks[i]!;
          if (len === 0) continue;
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
      }
      const all = [...tracked.values()];
      const intake = [0, 0, 0, 0];
      const max = [0, 0, 0, 0];
      for (const t of all) {
        intake[t.intakeTier] = (intake[t.intakeTier] ?? 0) + 1;
        max[t.maxTier] = (max[t.maxTier] ?? 0) + 1;
      }
      const reviewed = all.filter((t) => t.reviews > 0);
      const promoted = all.filter((t) => t.tierThreeAt !== undefined);
      const delays = promoted.map((t) => t.tierThreeAt! - t.classifiedAt).sort((a, b) => a - b);
      const sentences = new Map<number, number>();
      for (const t of all) sentences.set(t.sentence / DAY, (sentences.get(t.sentence / DAY) ?? 0) + 1);
      console.log(`\n=== ${scenario.label}: ${RUN} ticks (${RUN / DAY} in-game days) ===`);
      console.log(`admissions submitted: ${admits}; classified & tracked: ${all.length}`);
      console.log(`sentence days: min=${Math.min(...sentences.keys())} max=${Math.max(...sentences.keys())} distinct=${sentences.size}`);
      console.log(`TIER AT INTAKE:      t0=${intake[0]} t1=${intake[1]} t2=${intake[2]} t3=${intake[3]}`);
      console.log(`MAX TIER EVER HELD:  t0=${max[0]} t1=${max[1]} t2=${max[2]} t3=${max[3]}`);
      console.log(`reached >=1 review: ${reviewed.length}/${all.length} (${((reviewed.length / all.length) * 100).toFixed(1)}%)`);
      console.log(`review counts: ${JSON.stringify([...all.reduce<Map<number, number>>((m, t) => m.set(t.reviews, (m.get(t.reviews) ?? 0) + 1), new Map())].sort((a, b) => a[0] - b[0]))}`);
      console.log(`promoted to tier 3: ${promoted.length}; delay from classification (ticks): ${delays.length === 0 ? 'n/a' : `min=${delays[0]} median=${delays[Math.floor(delays.length / 2)]} max=${delays[delays.length - 1]} (${delays.length === 0 ? '' : `median ${(delays[Math.floor(delays.length / 2)]! / DAY).toFixed(1)} in-game days`})`}`);
      console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`sanction metrics: ${JSON.stringify(runtime.prisoners.sanctionSystem?.getMetrics?.() ?? 'n/a')}`);
      console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
      const byCategory = runtime.contraband.all().reduce<Record<string, number>>((acc, item) => { acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1; return acc; }, {});
      console.log(`contraband ever introduced, by category: ${JSON.stringify(byCategory)}`);
      console.log(`confiscations: ${runtime.confiscations.all().length}`);
    });
  }
});
```

### `probe/tier3-scaled.test.ts`

```ts
import { describe, it } from 'vitest';
import { CLASSIFICATION_REVIEW_INTERVAL_TICKS } from '../src/simulation/prisoners/classification';
import { intakeStageFromIndex } from '../src/simulation/prisoners/components';
import { classifiedAtTickOf } from '../src/simulation/prisoners/classification-review-system';
import { packCommand } from '../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../tests/helpers/room-walls';

const DAY = 2_400;
const ARRIVAL = { x: 30, y: 29 } as const;
const SHOWER = { x: 1, y: 17, width: 4, height: 4 } as const;
const CANTEEN = { x: 7, y: 17, width: 8, height: 8 } as const;
const YARD = { x: 17, y: 17, width: 10, height: 10 } as const;

let traceRefusals = false;
function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  const before = runtime.refusals.count;
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
  if (traceRefusals && runtime.refusals.count > before) console.log(`    refused by ${id}: ${JSON.stringify(runtime.refusals.last)}`);
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
  traceRefusals = true;
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
    for (let i = 0; i < 4; i += 1) submit(runtime, `sh${i}`, packCommand({ type: 'PlaceObject', orderId: `sh${i}`, definitionId: 'shower-head-brick', x: SHOWER.x + i % 2, y: SHOWER.y + Math.floor(i / 2) }));
    for (let i = 0; i < 4; i += 1) submit(runtime, `dt${i}`, packCommand({ type: 'PlaceObject', orderId: `dt${i}`, definitionId: 'dining-table-wooden', x: CANTEEN.x + (i % 2) * 3, y: CANTEEN.y + Math.floor(i / 2) * 3 }));
    for (let i = 0; i < 8; i += 1) submit(runtime, `bench${i}`, packCommand({ type: 'PlaceObject', orderId: `bench${i}`, definitionId: 'bench-wooden', x: CANTEEN.x + (i % 4) * 2, y: CANTEEN.y + 6 - Math.floor(i / 4) }));
  }
  stepTo(runtime, 2_000);
  void 0;
  for (let i = 0; i < plan.guards; i += 1) submit(runtime, `hire${i}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  traceRefusals = false;
  if (runtime.refusals.count > 0) console.log(`  REFUSALS during construction: ${runtime.refusals.count}`);
  return runtime;
}

interface Tracked { classifiedAt: number; sentence: number; intakeTier: number; maxTier: number; reviews: number; tierThreeAt?: number }

function run(label: string, plan: Plan, seed: number, days: number, admitEvery: number, priors = 0): void {
  const runtime = buildPrison(plan, seed);
  const store = runtime.prisoners.entityStore;
  const records = runtime.prisoners.records;
  const tracked = new Map<number, Tracked>();
  const RUN = days * DAY;
  let admits = 0;
  let peakPopulation = 0;
  while (runtime.kernel.tick < RUN) {
    const tick = runtime.kernel.tick;
    if (tick % admitEvery === 0) {
      submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: priors, ...ARRIVAL }));
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
  // Who the escape attempts belonged to: their tier at intake, and their tier now.
  const escapeSubjects: string[] = [];
  for (const record of runtime.incidents.all()) {
    if (record.type !== 'escape-attempt') continue;
    for (const participant of record.participantIds) {
      const t = tracked.get(participant);
      escapeSubjects.push(t === undefined ? `${participant}:untracked` : `intakeTier=${t.intakeTier} maxTier=${t.maxTier} reviews=${t.reviews}`);
    }
  }
  const all = [...tracked.values()];
  const intake = [0, 0, 0, 0];
  const max = [0, 0, 0, 0];
  for (const t of all) { intake[t.intakeTier] = (intake[t.intakeTier] ?? 0) + 1; max[t.maxTier] = (max[t.maxTier] ?? 0) + 1; }
  const promoted = all.filter((t) => t.tierThreeAt !== undefined);
  const delays = promoted.map((t) => t.tierThreeAt! - t.classifiedAt).sort((a, b) => a - b);
  const reviewed = all.filter((t) => t.reviews > 0);
  console.log(`\n=== ${label} | seed 0x${seed.toString(16)} | ${days} in-game days | ${plan.cells} cells, ${plan.guards} guards, amenities=${plan.amenities} | admit 1/${admitEvery / DAY}d | priorIncidents=${priors} ===`);
  console.log(`admissions ${admits}; classified ${all.length}; peak population ${peakPopulation}`);
  console.log(`TIER AT INTAKE:     t0=${intake[0]} t1=${intake[1]} t2=${intake[2]} t3=${intake[3]}`);
  console.log(`MAX TIER EVER HELD: t0=${max[0]} t1=${max[1]} t2=${max[2]} t3=${max[3]}  -> tier3 ${((max[3]! / all.length) * 100).toFixed(1)}%`);
  console.log(`reached >=1 review: ${reviewed.length}/${all.length} (${((reviewed.length / all.length) * 100).toFixed(1)}%)`);
  console.log(`tier-3 delay from classification: ${delays.length === 0 ? 'n/a' : `min=${delays[0]} (${(delays[0]! / DAY).toFixed(1)}d) median=${delays[Math.floor(delays.length / 2)]} (${(delays[Math.floor(delays.length / 2)]! / DAY).toFixed(1)}d) max=${delays[delays.length - 1]} (${(delays[delays.length - 1]! / DAY).toFixed(1)}d)`}`);
  console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
  console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
  console.log(`contraband by category: ${JSON.stringify(runtime.contraband.all().reduce<Record<string, number>>((acc, item) => { acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1; return acc; }, {}))}`);
  console.log(`confiscations: ${runtime.confiscations.all().length}`);
  if (escapeSubjects.length > 0) {
    const tally = escapeSubjects.reduce<Record<string, number>>((acc, k) => { acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    console.log(`escape-attempt subjects: ${JSON.stringify(tally)}`);
  }
}

describe('D: a prison built for the sentences it now receives', () => {
  it('40 cells, amenities, 8 guards, 1 admission / 2 days', () => {
    run('roomy + staffed', { cells: 40, guards: 8, amenities: true }, 0x0cc0, 300, 2 * DAY);
  });
  it('40 cells, amenities, 8 guards, 1 admission / 2 days, second seed', () => {
    run('roomy + staffed, seed 2', { cells: 40, guards: 8, amenities: true }, 0x51a7, 300, 2 * DAY);
  });
  it('40 cells, amenities, 8 guards, 1 admission / day (crowded)', () => {
    run('roomy but over-admitted', { cells: 40, guards: 8, amenities: true }, 0x0cc0, 300, DAY);
  });
  it('12 cells, amenities, 2 guards, 1 admission / 2 days', () => {
    run('small prison, gentle intake', { cells: 12, guards: 2, amenities: true }, 0x0cc0, 300, 2 * DAY);
  });
  it('12 bare cells, no amenities, no guards, 1 admission / day', () => {
    run('neglected', { cells: 12, guards: 0, amenities: false }, 0x0cc0, 300, DAY);
  });
});

describe('E: the same prisons with a priorIncidents a command could send', () => {
  for (const priors of [1, 2]) {
    it(`roomy + staffed, priorIncidents ${priors}`, () => {
      run('roomy + staffed', { cells: 40, guards: 8, amenities: true }, 0x0cc0, 300, 2 * DAY, priors);
    });
    it(`neglected, priorIncidents ${priors}`, () => {
      run('neglected', { cells: 12, guards: 0, amenities: false }, 0x0cc0, 300, DAY, priors);
    });
  }
});
```
