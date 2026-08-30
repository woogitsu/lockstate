# What a classification can reach. Measured on `a1d5591`, v0.0.235

**Date:** 2026-08-30
**Tree:** `a1d5591` (`chore(release): v0.0.235`), branch `agent/632-unreachable-thresholds`
**Question put to this record:** [#632](https://github.com/matmaxalez/lockstate/issues/632)
asks whether [#540](https://github.com/matmaxalez/lockstate/issues/540) — *"no
admission a player can make has ever produced a high-risk prisoner, so solitary
is unreachable"* — **collapses into it**, or is a separate defect. #632 records
two thresholds no sentence can reach; #540 records a classification tier no
admission can reach; whoever picks either up was told to check whether they are
one thing.

**Answer: they do not collapse. There are three independent gates, not one, and
only one of them is a threshold.** Fixing any one of them leaves the other two
standing. Along the way this pass **refutes the headline of #540 and one of its
comments**, confirms both of #632's arithmetic claims, and finds **two further
unreachable balance values of exactly #632's class that nobody has reported** —
`MAX_CLEAN_CONDUCT_CREDIT`, and the entire *periodic* half of the periodic
review.

**No threshold, range or balance value was changed.** ADR 0017 decision 5 puts
those with [#29](https://github.com/matmaxalez/lockstate/issues/29). No source
file under `src/` was modified at all. This record is the deliverable.

---

## 0. The tier list, and how to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line, or the number was
  produced by running the real kernel in this worktree and pasted.
- **DERIVED** — integer arithmetic over VERIFIED constants, stated so the
  arithmetic can be checked without a run. Every DERIVED claim in this record
  also has a VERIFIED measurement beside it; where the two disagree, the
  measurement wins and the disagreement is written out.
- **UNKNOWN** — could not be established.

The harness is **§12 of this file, in a fenced block**, not a tracked `.ts`.
§9 says how to run it and §9.1 says why it is inline — the first attempt at this
record committed it beside this file and the repository's own foundation gate
refused it, correctly.

---

## 1. Every `file:line` in #632, opened — VERIFIED

The brief that commissioned this pass said its author *"had been wrong on a
cited fact in every brief written today"* and asked for the citations to be
re-opened rather than taken. They are all correct. Cited as a quoted constant
rather than only a line, per `docs/AGENT_WORKFLOW.md` §4.

| #632 says | Actually at | Reads |
| --- | --- | --- |
| `classification.ts:40-45` — the threshold | `src/simulation/prisoners/classification.ts:41` | `const LONG_SENTENCE_THRESHOLD_TICKS = 200_000;` |
| `sentence.ts:120-146` — the draw | `src/simulation/prisoners/sentence.ts:128-129`, `:145-146` | `MIN_SENTENCE_DAYS = 2`, `MAX_SENTENCE_DAYS = 16`; `drawSentenceLengthTicks` returns `(MIN + rng.nextInt(MAX - MIN + 1)) * DAY_LENGTH_TICKS` |
| `classification.ts:95-105` | `src/simulation/prisoners/classification.ts:105` | `export const CLASSIFICATION_REVIEW_INTERVAL_TICKS = 24_000;` |
| `classification-review-system.ts:152-162` | `src/simulation/prisoners/classification-review-system.ts:158-161` | `schedule = { intervalTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS, phaseTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1 }` |
| `classification-review-system.ts:217-239` | same file, `:239` | `if (context.tick - classifiedAtTick < CLASSIFICATION_REVIEW_INTERVAL_TICKS) continue;` |

Two supporting constants the issues lean on, also opened:

- `src/simulation/prisoners/regime.ts:12` — `export const DAY_LENGTH_TICKS = 2_400;`, so
  16 days is **38,400 ticks**. VERIFIED by `sentence.ts:133`'s own
  `MAX_SENTENCE_LENGTH_TICKS_DRAWN = MAX_SENTENCE_DAYS * DAY_LENGTH_TICKS`.
- `src/main.ts:867` — `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;`,
  consumed at `src/main.ts:2495`. This is the only admission the HUD can send.

**#632's arithmetic is right on both counts.** 38,400 is 19.2% of 200,000, and
a 2–9 day sentence is shorter than one 24,000-tick review period. What #632
does *not* say, and what turns out to decide the collapse question, is in §3.

---

## 2. Gate 1 — the front door. `priorIncidents: 0` — VERIFIED

`classifyPrisoner` (`classification.ts:82-91`) is three terms:

```ts
let score = 0;
if (input.sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS) score += 1;
score += Math.min(2, Math.max(0, input.priorIncidents));
const screeningVariance = rng.nextInt(3) - 1; // -1 | 0 | +1
const riskTier = clampTier(score + screeningVariance);
```

Run against the real `Xoshiro128StarStar`, 20,000 draws per value:

```
priorIncidents=0 -> tiers 0,1
priorIncidents=1 -> tiers 0,1,2
priorIncidents=2 -> tiers 1,2,3
priorIncidents=3 -> tiers 1,2,3
priorIncidents=4 -> tiers 1,2,3
```

`classificationGroupIdForTier` answers `'high-risk'` only at
`riskTier >= 3` (`classification.ts:58-60`). So **tier 3 at intake requires
`priorIncidents >= 2`, and the HUD sends 0.** #540's core claim is confirmed
exactly as written.

In the real kernel, 119 HUD-shaped admissions into a built prison over 120
in-game days: **0 high-risk at intake**. With `priorIncidents: 2` — a value only
a hand-written command can send, since `src/main.ts` hard-codes 0 — the same
prison produces **44 of 119**.

---

## 3. Gate 2 — the review schedule. The one everybody has got wrong — VERIFIED

This is where both issues, and one merged PR description, have been wrong in
opposite directions.

The schedule is **global**; eligibility is **per record**. The kernel runs a
system when `this._tick % system.schedule.intervalTicks === system.schedule.phaseTicks`
(`src/simulation/kernel/kernel.ts:202`), so `ClassificationReviewSystem` runs at
every tick congruent to **23,999 mod 24,000** — and only then does it ask, per
prisoner, whether `tick - classifiedAtTick >= 24_000` (`:239`).

For a prisoner classified at tick `C` with `r = C mod 24_000`, the first
scheduled tick that can review them is `T = C - r + 47_999`, so the wait is:

> **wait = 47,999 − r**, ranging from **24,000** (classified at the last tick of
> a period) to **47,999** (classified at the first). — DERIVED

Enumerated over all 24,000 phases: `wait min=24000 max=47999`. VERIFIED.

The prisoner must still be held at `T`. `PrisonerDischargeSystem` runs every 20
ticks at phase 0 (`discharge-system.ts:119`, `DISCHARGE_CHECK_INTERVAL_TICKS = 20`)
and removes them at the first such tick where `tick >= sentenceEndTick`
(`:169`), with `sentenceEndTick = C + sentenceLengthTicks`. Review is order 55
and discharge order 65, but review ticks are ≡ 19 mod 20 and discharge ticks
≡ 0 mod 20, so the two never share a tick and the ordering is not load-bearing.

So a sentence of `d` days reaches a first review from this fraction of the
24,000 possible classification phases — VERIFIED by enumeration:

| sentence | phases that reach a review | share |
| --- | --- | --- |
| 2–9 days | **0 / 24,000** | **0%** |
| 10 days | 1 / 24,000 | 0.004% |
| 11 days | 2,401 / 24,000 | 10% |
| 12 days | 4,801 / 24,000 | 20% |
| 13 days | 7,201 / 24,000 | 30% |
| 14 days | 9,601 / 24,000 | 40% |
| 15 days | 12,001 / 24,000 | 50% |
| 16 days | 14,401 / 24,000 | 60% |

Uniform over the 15 drawable lengths and uniform over phase, that is
**14.0% of prisoners**. — DERIVED.

### 3.1 What this refutes, in both directions

**#632's claim 2 is right, and understated.** It says sentences of 2–9 days
never reach a review. True — and the table shows it is not "everyone from 10
days up is reviewed" either: eleven of the fifteen drawable lengths reach a
review in fewer than half of the phases they can be classified in.

**#540 comment 3 is wrong.** It reads: *"The new maximum sentence is 16 days =
38,400 ticks. `38,400 < 47,999`. **No sentence in the shipped range reaches a
first review.**"* That is the `r = 0` row generalised to every row. At
`r = 21,610` the wait is 26,389 ticks and an 11-day sentence clears it.

**That correction was already in the tree before this pass, and this record did
not find it first.** `src/simulation/contraband/introduction.ts:126-136`, landed
2026-08-29 in `cfda696` *"Correct eight false present-tense comments, in both
directions (#543)"*, states it in full and better than #540's comment does:

> **This paragraph said "the revision never happens" and that was wrong.** It
> was true of the session's *first* prisoner […] A prisoner classified at 20,000
> with a 16-day sentence is eligible at the 47,999 review and is discharged at
> about 58,400, so they *are* reviewed.

What that comment does not carry, and what this record adds, is the **share**:
14.0%, and 0% below 10 days.

### 3.2 Measured in the real kernel — VERIFIED

Twelve furnished cells, one HUD-shaped admission per in-game day, 120 in-game
days (288,000 ticks), seed `0x0cc0`, zero command refusals:

```
admissions submitted: 119; classified & tracked: 119
sentence days histogram: 2d:1 3d:6 4d:11 5d:4 6d:9 7d:7 8d:13 9d:8 10d:10 11d:7 12d:10 13d:4 14d:9 15d:9 16d:11
prisoners that reached >=1 review: 14 (11.8%)
  their sentence days: 12,13,14,15,16
classification phases (C mod 24000) observed: 10:11 2410:12 4810:12 7210:12 9610:12 12010:12 14410:12 16810:12 19210:12 21610:12
predicted reviewed = 14; observed = 14; mismatches = 0
```

**11.8% observed against 14.0% predicted, with zero per-prisoner mismatches.**
The model in §3 is exact; the gap is that a once-a-day admission cadence samples
only 10 of the 24,000 phases — and those ten carry the same 21/150 expectation
the uniform phase does, so the prediction is still 14.0%, drawn 119 times. 14 is
inside the noise of an expectation of 16.7.

`C mod 24000` lands on `{10, 2410, 4810, …}` because `IntakeSystem` writes the
classification two scheduled intake ticks after the command, which the shipped
`tests/integration/sentence-length-variation.test.ts:138` also observes as
`sentenceEndTick === sentence + 15` for an admission at tick 0.

### 3.3 The phase choice does not do what its own comment says — VERIFIED

`classification-review-system.ts:151-157`:

> The last tick of every review period, mirroring `economy.state-income`'s
> end-of-day phase. The phase matters more than it looks: at `phaseTicks: 0`
> the first run is tick 0, where nobody is classified and every prisoner is
> skipped, so the readout would be a system that has "run" and done nothing.

At `phaseTicks: 23_999` the **first run is also a system that has run and done
nothing**: eligibility at tick 23,999 needs `23,999 - C >= 24,000`, i.e.
`C <= -1`, which no prisoner has. The stated defect is not avoided, it is moved
from tick 0 to tick 23,999. This is a comment/behaviour mismatch, not a
malfunction — reported, not fixed, because the phase is a scheduling choice and
changing it changes reachability, which is #29's.

---

## 4. Gate 3 — the long-sentence term, and why it is not #540's cause — VERIFIED

`LONG_SENTENCE_THRESHOLD_TICKS` is read in exactly two places, and both are the
same comparison: `classification.ts:84` (intake) and `classification.ts:194`
(review, as `ClassificationFactors.sentence`).

7,500 paired draws on one seed, every drawable sentence against a zero-length
one, same stream position:

```
drawable sentence vs zero-length sentence, 7500 paired draws: differences = 0
max drawable sentence = 38400; LONG_SENTENCE_THRESHOLD_TICKS = 200000
```

So the term is **always 0** for a HUD admission, at intake and at review alike.
`ClassificationFactors.sentence` — one of the four named factors #78 asked for
so *"the panel can explain why someone sits where they do"* — is a field that
can only ever hold 0.

**And this is the decisive fact for the collapse question.** Suppose #632's
threshold were fixed tomorrow, so every 16-day sentence scored +1. With
`priorIncidents: 0` the intake score becomes `1 + variance ∈ {0, 1, 2}` —
**tier 2 at best, never tier 3, never `'high-risk'`.** — DERIVED, and it follows
directly from the `priorIncidents=1` row of §2's table, which is the same score.

> **#540 cannot be fixed by fixing #632's first threshold.** They are not the
> same root cause, and one is not the other seen from a different end.

The command *schema* is wider than the HUD: `commands.ts:269` allows
`sentenceLengthTicks` up to `MAX_SENTENCE_LENGTH_TICKS` (`0xffff_ffff`), and
`tests/integration/incident-trigger-reachability.test.ts` already admits at
400,000 ticks. So the long-sentence branch is reachable *from a command* and
dead *from the game*. That distinction matters for what a fix has to touch and
for which tests can see it.

---

## 5. The collapse question, answered

**They do not collapse.** Three gates, and the diagnosis differs for each:

| | Gate | Where | Effect | Is it #632? |
| --- | --- | --- | --- | --- |
| 1 | `priorIncidents: 0` | `src/main.ts:867` | intake tiers are `[0, 1]`; tiers 2 and 3 unreachable at admission | **No.** This is #540, and #632 never touches it |
| 2 | global phase vs per-record eligibility, against a 2–16 day range | `classification-review-system.ts:158-161` + `:239` vs `sentence.ts:128-129` | 14.0% of prisoners are reviewed; 0% below 10 days | **Yes** — #632's claim 2 |
| 3 | `LONG_SENTENCE_THRESHOLD_TICKS = 200_000` vs a 38,400 maximum | `classification.ts:41` | the `sentence` factor is always 0 | **Yes** — #632's claim 1, and it cannot reach tier 3 even if lifted |

The relationship is **multiplicative, not identical**. Gate 1 closes the front
door to high risk; gate 2 narrows the only other door to 14%. #540's own text
already names that structure without drawing the conclusion — *"reachable only
through a later classification review"* — and its final line asks the exact
question this record answers: *"whether a classification review actually fires
often enough to reach tier 3 in ordinary play becomes the next thing to
measure."* It does fire. It fires for 14% of prisoners, once each.

**What this changes about a fix.** A fix that only widens the sentence range
reaches gate 2 partially and gate 3 not at all (a 16-day range would have to
become an 84-day one to touch 200,000). A fix that only lowers the review
interval reaches gate 2 and neither of the others. A fix that only draws
`priorIncidents` reaches gate 1 and neither of the others. None of the three is
a superset of another.

---

## 6. #540's headline is false. Solitary is reachable, twice over — VERIFIED

#540 is titled *"…so solitary is unreachable"*. It is not, and the second route
was not known to either issue.

**Route A — sanction.** `SanctionSystem` relocates a sanctioned prisoner into
`room.solitary-cell` independently of classification tier. This was already
corrected in #540 comment 3 and is confirmed here by measurement. In a
neglected, unguarded twelve-cell prison with two furnished solitary cells and
**`priorIncidents: 0` throughout**:

```
--- neglected, priors 0 (what the HUD sends) ---
admissions: 119; high-risk AT INTAKE (first stage read): 0
sanction metrics: {"relocatedIntoSolitaryCount":10,...}
ever seen inside room.solitary-cell: 10; peak concurrent: 2
```

**Route B — the accommodation branch itself, after a review.** This is new.
`DEFAULT_ACCOMMODATION_POLICY` puts `SOLITARY_CELL` first for `'high-risk'`
(`intake-system.ts:99`) and `IntakeSystem` reads the group at the
`'accommodation-assignment'` stage (`intake-system.ts:509-529`). A prisoner
*already housed* is never re-read — nothing relocates on a tier change — so the
branch looked unreachable from the HUD. But `REVIEWABLE_STAGES` includes
`'accommodation-assignment'` (`classification-review-system.ts:88`), so a
prisoner **still queued for a bed** can be promoted to high risk by a review and
then housed against the high-risk preference on the next intake tick.

Measured, in a deliberately crowded prison — two ordinary cells, two solitary
cells, 119 HUD admissions, `priorIncidents: 0`:

```
  unsanctioned solitary occupant at tick 48000: tier=3 stage=completed
  unsanctioned solitary occupant at tick 72000: tier=3 stage=completed
  … (nine in all)
--- 2 ordinary cells + 2 solitary cells, priors 0, unguarded ---
distinct solitary occupancies: sanction-driven=1 accommodation-driven=9
review metrics: {"reviewsCompleted":14,"tierIncreases":14,"tierDecreases":0,"groupChanges":14}
```

and the same prison with twelve ordinary cells instead of two:

```
--- 12 ordinary cells + 2 solitary cells, priors 0, unguarded ---
distinct solitary occupancies: sanction-driven=10 accommodation-driven=0
```

**So route B exists only in a prison short of ordinary beds.** That is
[#538](https://github.com/matmaxalez/lockstate/issues/538)'s prison — *"five
prisoners sat at Cell Assignment for four in-game days while two empty solitary
cells stood next to them"* — and this measurement is the mechanism by which
that prison eventually *does* fill them, four in-game days being far short of
the 24,000 ticks it takes.

`src/main.ts:844-850` states route B without measuring it — *"`room.solitary-cell`'s
accommodation branch is reachable only through `ClassificationReviewSystem`
later revising a tier upward"* — and is **correct**. Its neighbouring sentence,
*"no admission a player can make from this panel has ever produced a high-risk
prisoner"*, is also correct and is confirmed by §2. Neither needs a correction;
what neither says is that the branch needs an *unhoused* prisoner, which is the
condition that makes it rare.

---

## 7. High risk is reachable, and it is all-or-nothing — VERIFIED

`reviewClassification` (`classification.ts:191-216`) sums four terms. With
`priorIncidents: 0` and the sentence term dead, the reachable score is
`findings − cleanCredit`, findings capped at `MAX_FINDINGS_TERM = 3` (`classification.ts:127`) and credit
at `MAX_CLEAN_CONDUCT_CREDIT = 2` (`:128`). Tier 3 therefore needs three disciplinary
points and a finding recent enough to earn no credit.

The same 120-day run, twice, differing only in whether the prison works:

| | reviews | tier increases | tier decreases | group changes | max tier ever held |
| --- | --- | --- | --- | --- | --- |
| twelve furnished cells, toilets, shower, canteen, yard, two guards | 14 | **0** | 4 | **0** | t0=75 t1=44 t2=0 **t3=0** |
| twelve bare cells, no amenities, no guards | 14 | **14** | 0 | **14** | t0=65 t1=40 t2=0 **t3=14** |

Incidents in the two runs: `{}` and `{"assault":17,"riot":58}`.

**Every reviewed prisoner in the neglected prison became high risk; none did in
the well-run one.** The review is not a lottery on top of neglect — it is a
faithful readout of it, and the fourteen it reads are the 14% §3 predicts. Those
fourteen group changes are what `ActionSystem` resolves a regime from
(`action-system.ts:715`, `:897`, `:903`), so the `HIGH_RISK_REGIME` timetable —
confined to sleep/meal/hygiene for 2,200 of 2,400 ticks — **is** reached in
ordinary play.

Tier 2 shows 0 in both runs. That is sampling, not impossibility: enumerating
every review a HUD-admitted prisoner can receive over all 15 sentence lengths ×
24,000 phases × findings 0–4 × five clean-conduct positions (1,010,660 cases)
gives

```
reachable riskTier at review (priors 0, drawable sentence): {0,1,2,3}
```

---

## 8. What is dead as a consequence — the inventory

`room.solitary-cell` is **not** on this list; §6 removes it. What follows is
what a HUD admission (`priorIncidents: 0`, sentence drawn 2–16 days) cannot
reach. Each row is measured or enumerated, not argued.

### 8.1 Unreachable, with evidence

1. **`ClassificationFactors.sentence` can only hold 0.** `classification.ts:41`
   vs a 38,400 maximum; 0 differences in 7,500 paired draws (§4). Both readers,
   `:84` and `:194`. — VERIFIED
2. **Intake tiers 2 and 3.** 0 of 119 in every `priorIncidents: 0` run; 44 of
   119 at `priorIncidents: 2`. — VERIFIED
3. **A first classification review for 60% of prisoners by draw value** (2–9
   days is 8 of the 15 equiprobable lengths, and 10 days reaches one from 1
   phase in 24,000). Overall **86.0% of prisoners are never reviewed**;
   measured 105 of 119. — VERIFIED
4. **A *second* classification review, for anybody, ever.** A second review
   needs `T2 - C >= 48,000` and the longest sentence is 38,400. Enumerated over
   the whole reachable space: `reviews one prisoner can ever receive: {0,1}`.
   `CLASSIFICATION_REVIEW_INTERVAL_TICKS`'s own doc comment calls it *"the
   interval between reviews after that"* — there is no "after that". The
   periodic review is not periodic. **This is a third unreachable balance value
   of #632's exact class and neither issue reports it.** — VERIFIED
5. **`MAX_CLEAN_CONDUCT_CREDIT = 2`.** Credit is
   `floor(cleanTicks / 24_000)` capped at 2, and `cleanTicks <= tick − classifiedAt`,
   which for a held prisoner is at most `sentence + 19 <= 38,419 < 48,000`.
   Enumerated: `reachable cleanConduct factor: {-1,0}`. The cap is authored at 2
   and the value can only ever be 0 or −1. **A fourth unreachable balance value,
   also unreported.** — VERIFIED
6. **Contraband categories at tiers 2 and 3.** `eligibleContrabandCategories`
   takes the `2 + 1 × riskTier` least severe
   (`contraband/introduction.ts:147-152`, `:181-190`), and its own comment
   enumerates the shipped catalogue: *"tier 0 — currency, phone; tier 1 — and a
   tool; tier 2 — and drugs; tier 3 — and a weapon."* Introduction happens at
   intake only (`new-session.ts:529-530`), where the tier is 0 or 1. **Drugs and
   weapons can never enter a prison a player admits into.** — VERIFIED at the
   source; the run's confiscation counts (3 and 0) do not identify categories,
   so the *count* is UNKNOWN and the *set* is what is claimed.
7. **`contrabandIntroductionProbability` above 0.2.** `0.1 + 0.1 × riskTier`
   with tier ∈ {0,1}. — DERIVED from the same constants.
8. **`escape-attempt` incidents.** `canAttemptEscape` requires
   `riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER` (3, `flashpoint.ts:113`)
   **and** `contrabandSeverity > 0`. Measured **0 escape attempts across four
   `priorIncidents: 0` runs of 120 in-game days each**, including runs in which
   14 prisoners reached tier 3 by review; and **13** and **1** in the two
   `priorIncidents: 2` runs. Row 6 is why: the prisoners who reach tier 3 do so
   long after intake decided what, if anything, they are carrying.
   Not proven impossible — a tier-0 arrival carrying a phone who is later
   promoted satisfies both conditions on paper — so this is **measured-zero, not
   unreachable**, and the distinction is deliberate.
9. **`SUCCESSFUL_ESCAPE_SURCHARGE_POINTS = 2`** and
   **`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE['escape-attempt'] = 3`**
   (`disciplinary-record.ts:50`, `:61`) are consumed only by row 8's incident
   type, so they inherit its status: measured-zero from the HUD.

### 8.2 Already inventoried elsewhere, confirmed still true

10. **`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE['gang-retaliation'] = 2` has no
    producer.** `trigger-system.ts:212-214` says so itself — *"`'gang-retaliation'`
    still has no producer of its own — it needs `GangRegistry` entries nothing
    in `src/` writes"* — and 0 appear in any run here. #632's text already
    names this. — VERIFIED

### 8.3 Alive, contrary to one or both issues

11. **`room.solitary-cell`, by sanction.** 10 relocations, `priorIncidents: 0`. — VERIFIED
12. **`room.solitary-cell`, by the accommodation branch, after a review.** 9
    placements in a bed-short prison, 0 in an adequately-bedded one. — VERIFIED
13. **`HIGH_RISK_REGIME`.** 14 group changes in a neglected prison. — VERIFIED
14. **`risk-tier.3.name` / the `High Risk` label** (`simulation-message-keys.ts:216`, `:221`).
    Reachable through 13. #540 comment 2's badge census — 802 observations,
    0 `Medium`, 0 `High` — is consistent with a 30-prisoner, 26-day run in which
    nobody could have been reviewed; it is not evidence that the badge is
    unreachable.

---

## 9. Reproducing this

The harness is **§12**, inline. Copy it to `probe/reachability.test.ts` at the
repository root — the relative imports assume that depth — and run it under a
config of its own:

```
mkdir -p probe && cat > probe/vitest.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', globals: false, include: ['probe/**/*.test.ts'], testTimeout: 900_000, hookTimeout: 900_000 },
});
EOF
./node_modules/.bin/vitest run --config probe/vitest.config.ts --disable-console-intercept
```

`--disable-console-intercept` is **required**: without it vitest 4 swallows
every `console.log` and the run passes silently, having reported nothing. That
cost two runs here before it was noticed. The whole file is about 10 seconds.

`probe/` must be deleted afterwards — see §9.1. It reads
`tests/helpers/room-walls`, which is the one shortcut the shipped integration
tests take as well; the prison fixture is `buildPrison` from
`tests/integration/incident-trigger-reachability.test.ts`, adapted in three
ways: twelve cells rather than eight, `cellRect` laid out in two rows so no cell
overlaps the shower or canteen rectangles, and admissions on a cadence rather
than one batch at tick 1,000.

### 9.1 Why the harness is a code block and not a file — VERIFIED

This record's first commit shipped the harness as
`docs/research/2026-08-30-what-a-classification-can-reach.probe.ts`, reasoning
that a dated artefact wants the same read-only standing the record has. The
repository refused it, and the refusal is better than the reasoning was:

```
FAIL tests/foundation/typecheck-coverage-contract.test.ts > typecheck coverage contract
     > leaves no tracked module file outside every TypeScript project
AssertionError: a tracked module file is in no tsconfig `include`, so no typechecker
reads it. That is how #602 happened […]
+ [ "docs/research/2026-08-30-what-a-classification-can-reach.probe.ts" ]
```

The gate's own subject is *"the tracked file list: every module file `git` knows
about has to fall inside one project's `include`"*, and it names the two ways
out — add the path to `tsconfig.json` or to `tsconfig.tools.json`.

**Both are wrong here, and that is the interesting part.** A typechecked harness
is a tracked file that must keep compiling against `src/` for ever. But
`docs/research/README.md` says of everything in this directory: *"when the code
moves on, a record here does not become wrong, it becomes older. Do not update
one to match current `main`."* A `.ts` in this directory cannot have both
properties: the moment a signature it calls changes, either `pnpm typecheck`
goes red or the history gets edited. The two contracts are genuinely
incompatible, and the gate is the one that should win — it was paid for by #602,
where a stale call site cost a silent benchmark failure.

A fenced code block is neither tracked-module nor rot-prone. It is also what the
existing precedent in `docs/AGENT_WORKFLOW.md` amounts to — *"the reproduction
stays unmerged on `agent/playtest-mouse-2`; it is a harness, not a gate"* —
made durable instead of depending on a branch nobody deletes.

## 10. Deliberately not done

- **No threshold, range or balance value changed**, per the brief and ADR 0017
  decision 5.
- **No test added.** The obvious one — "no HUD admission is high-risk at
  intake" — would pin a value the owner is about to move, and this repository
  has a rule against exactly that shape. `tests/integration/incident-trigger-reachability.test.ts`
  is the precedent for a *ladder* of prisons asserting what does and does not
  fire; the right time to write the classification equivalent is **after** #29
  picks the numbers, and it should be written then rather than now.
- **No comment corrected in `src/`.** Two present-tense sentences were checked
  and both survive: `src/main.ts:844-850` (§6) and
  `src/simulation/contraband/introduction.ts:126-136` (§3.1). The one mismatch found,
  `classification-review-system.ts:151-157` (§3.3), is a claim about *why* a
  phase was chosen rather than about what the code does, and rewriting it means
  taking a position on whether the phase should change — which is #29's.

---

## 11. The weakest claim, and what would change my mind

**The weakest claim in this record is §8.1 row 8 — that `escape-attempt` is
unreachable from the HUD.** It is the only row where the measurement and the
mechanism do not fully line up. What is established is that four independent
120-in-game-day runs at `priorIncidents: 0` produced **zero** escape attempts
while the two runs differing *only* in that value produced 13 and 1. What is
**not** established is that it is impossible: `canAttemptEscape` needs tier ≥ 3
and *any* contraband severity above zero, and a tier-0 arrival can be carrying
currency or a phone and can later be promoted by a review. I did not construct
that case, and I do not know whether `PrisonerFlashpointSampler` reads
*undiscovered holdings* or something narrower — I read `canAttemptEscape` and
`flashpoint.ts:113` but not the sampler that populates `contrabandSeverity`.

**What would change my mind:** a run that seeds a tier-0 arrival with a
long-enough sentence and a favourable classification phase, gives them a
confiscation-free holding, and reaches a review — if that produces an escape
attempt, row 8 becomes "vanishingly rare" rather than "measured zero", which is
a materially different thing to tell the owner.

**Second weakest: the 14.0% figure's dependence on admission cadence.** §3.2
measured 11.8% against a predicted 14.0% with zero per-prisoner mismatches, so
the *model* is not in doubt. But the model's input is the distribution of
`classifiedAtTick mod 24_000`, and a player does not admit on a metronome. A
player who admits in bursts — the shape #538 describes — samples very few
phases, and their prison could sit at 0% or at 40% for many hours. **The 14.0%
is a population figure, not a promise about any one prison**, and a burst-shaped
admission pattern is the case I did not measure.

**Third: every measurement here is single-seed.** All runs use `0x0cc0` for the
prison and one fixed seed for the isolated draws. The sentence histogram
(1× 2-day, 11× 4-day, 13× 8-day) is visibly not flat across 119 draws, which is
ordinary for a uniform draw at that count but means "14 of 119" carries the
variance of one sample and not of an ensemble. The enumerated results in §7 and
§8.1 rows 4 and 5 are seed-independent — they are exhaustive over the input
space — and should be trusted further than the run-based ones.

---

## 12. The harness

Copy to `probe/reachability.test.ts` at the repository root and run it as §9
says. It asserts almost nothing — it measures and prints. Written against
`a1d5591` (v0.0.235); it is history, and it is expected to stop compiling when
`src/` moves.

```ts
import { describe, expect, it } from 'vitest';
import { CLASSIFICATION_REVIEW_INTERVAL_TICKS, classifyPrisoner, reviewClassification } from '../src/simulation/prisoners/classification';
import { intakeStageFromIndex } from '../src/simulation/prisoners/components';
import { classifiedAtTickOf } from '../src/simulation/prisoners/classification-review-system';
import { Xoshiro128StarStar } from '../src/simulation/rng/xoshiro128starstar';
import { packCommand } from '../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../src/simulation/runtime/new-session';
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
  // Row 0: x 1..23, clear of SHOWER (x26). Row 1: x 1..17, clear of CANTEEN (x19).
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

interface Tracked { classifiedAt: number; sentence: number; maxTier: number; reviews: number; }

describe('PROBE', () => {
  it('front door: which tiers can classifyPrisoner produce per priorIncidents', () => {
    for (const priors of [0, 1, 2, 3, 4]) {
      const seen = new Set<number>();
      const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
      for (let i = 0; i < 20_000; i += 1) {
        seen.add(classifyPrisoner({ sentenceLengthTicks: 16 * DAY, priorIncidents: priors }, rng).riskTier);
      }
      console.log(`priorIncidents=${priors} -> tiers ${[...seen].sort().join(',')}`);
    }
    // Long sentence term: no drawable sentence differs from a zero-length one.
    const rngA = new Xoshiro128StarStar([5, 6, 7, 8]);
    const rngB = new Xoshiro128StarStar([5, 6, 7, 8]);
    let bites = 0;
    for (let days = 2; days <= 16; days += 1) {
      for (let n = 0; n < 500; n += 1) {
        const a = classifyPrisoner({ sentenceLengthTicks: days * DAY, priorIncidents: 0 }, rngA).riskTier;
        const b = classifyPrisoner({ sentenceLengthTicks: 0, priorIncidents: 0 }, rngB).riskTier;
        if (a !== b) bites += 1;
      }
    }
    console.log(`drawable sentence vs zero-length sentence, 7500 paired draws: differences = ${bites}`);
    console.log(`max drawable sentence = ${16 * DAY}; LONG_SENTENCE_THRESHOLD_TICKS = 200000`);
    console.log('long-sentence term never bites for any drawable sentence: confirmed');
  });

  it('review wait: first eligible review tick as a function of classification tick', () => {
    const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
    const waits: number[] = [];
    for (let c = 0; c < I; c += 1) {
      let t = -1;
      for (let k = 1; k <= 6; k += 1) {
        const cand = k * I - 1;
        if (cand - c >= I) { t = cand; break; }
      }
      waits.push(t - c);
    }
    console.log(`wait min=${Math.min(...waits)} max=${Math.max(...waits)}`);
    const reachable = waits.filter((w) => w <= 16 * DAY).length;
    console.log(`classification phases (of ${I}) where a 16-day sentence reaches a review: ${reachable}`);
    for (let days = 2; days <= 16; days += 1) {
      const n = waits.filter((w) => w <= days * DAY).length;
      console.log(`  ${days}d sentence: ${n}/${I} phases reach a first review (${((n / I) * 100).toFixed(1)}%)`);
    }
  });

  it('realistic run: steady admissions into a built prison', () => {
    for (const plan of [
      { label: 'well-run', plan: { cells: 12, toilets: true, amenities: true, guards: 2 } as Plan },
      { label: 'bed-only, unguarded', plan: { cells: 12, toilets: false, amenities: false, guards: 0 } as Plan },
    ]) {
      const runtime = buildPrison(plan.plan);
      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      const tracked = new Map<number, Tracked>();
      const RUN = 30 * 2400 * 4; // 120 in-game days
      let admits = 0;
      // Admit one prisoner every half in-game day, forever.
      const ADMIT_EVERY = 2_400;
      while (runtime.kernel.tick < RUN) {
        const tick = runtime.kernel.tick;
        if (tick % ADMIT_EVERY === 0) {
          submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, ...ARRIVAL }));
          admits += 1;
          continue;
        }
        // Record who is about to be reviewed.
        if (tick % CLASSIFICATION_REVIEW_INTERVAL_TICKS === CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1) {
          for (let i = 0; i <= store.maxActiveIndex; i += 1) {
            if (!store.isIndexAlive(i)) continue;
            const stage = intakeStageFromIndex(records.intakeStage[i]!);
            if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
            const c = classifiedAtTickOf(records.sentenceEndTick[i]!, records.sentenceLengthTicks[i]!);
            if (c === undefined || tick - c < CLASSIFICATION_REVIEW_INTERVAL_TICKS) continue;
            const id = store.getIdByIndex(i);
            const t = tracked.get(id);
            if (t !== undefined) t.reviews += 1;
          }
        }
        runtime.kernel.step();
        // Track classification the tick after it is written.
        for (let i = 0; i <= store.maxActiveIndex; i += 1) {
          if (!store.isIndexAlive(i)) continue;
          const len = records.sentenceLengthTicks[i]!;
          if (len === 0) continue;
          const id = store.getIdByIndex(i);
          const c = classifiedAtTickOf(records.sentenceEndTick[i]!, len);
          if (c === undefined) continue;
          const existing = tracked.get(id);
          const tier = records.riskTier[i]!;
          if (existing === undefined) tracked.set(id, { classifiedAt: c, sentence: len, maxTier: tier, reviews: 0 });
          else if (existing.classifiedAt !== c) tracked.set(id, { classifiedAt: c, sentence: len, maxTier: tier, reviews: 0 });
          else if (tier > existing.maxTier) existing.maxTier = tier;
        }
      }
      const all = [...tracked.values()];
      // Predicted-vs-observed cross-check: first scheduled review tick at or
      // after C + interval, against the tick the discharge sweep removes them.
      const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
      let predicted = 0;
      let mismatch = 0;
      const phases = new Map<number, number>();
      for (const t of all) {
        phases.set(t.classifiedAt % I, (phases.get(t.classifiedAt % I) ?? 0) + 1);
        const T = Math.ceil((t.classifiedAt + I + 1) / I) * I - 1;
        const dischargeTick = Math.ceil((t.classifiedAt + t.sentence) / 20) * 20;
        const should = T < dischargeTick && T <= RUN;
        if (should) predicted += 1;
        if (should !== t.reviews > 0) mismatch += 1;
      }
      console.log(`classification phases (C mod 24000) observed: ${[...phases.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
      console.log(`predicted reviewed = ${predicted}; observed = ${all.filter((t) => t.reviews > 0).length}; mismatches = ${mismatch}`);

      const tiers = [0, 0, 0, 0];
      for (const t of all) tiers[t.maxTier] = (tiers[t.maxTier] ?? 0) + 1;
      const reviewed = all.filter((t) => t.reviews > 0);
      const sentences = new Map<number, number>();
      for (const t of all) sentences.set(t.sentence / DAY, (sentences.get(t.sentence / DAY) ?? 0) + 1);
      console.log(`\n=== ${plan.label} : ${RUN} ticks (${RUN / DAY} in-game days) ===`);
      console.log(`admissions submitted: ${admits}; classified & tracked: ${all.length}`);
      console.log(`sentence days histogram: ${[...sentences.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}d:${n}`).join(' ')}`);
      console.log(`prisoners that reached >=1 review: ${reviewed.length} (${((reviewed.length / all.length) * 100).toFixed(1)}%)`);
      console.log(`  their sentence days: ${[...new Set(reviewed.map((t) => t.sentence / DAY))].sort((a, b) => a - b).join(',')}`);
      console.log(`max tier ever held: tier0=${tiers[0]} tier1=${tiers[1]} tier2=${tiers[2]} tier3=${tiers[3]}`);
      console.log(`review system metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
      console.log(`confiscations: ${runtime.confiscations.all().length}`);
      console.log(`discharged: ${JSON.stringify(runtime.prisoners.dischargeSystem?.getMetrics?.() ?? 'n/a')}`);
    }
  });
});

const SOLITARY_A = { x: 1, y: 10, width: 2, height: 3 } as const;
const SOLITARY_B = { x: 5, y: 10, width: 2, height: 3 } as const;

describe('PROBE solitary', () => {
  it('who ever occupies room.solitary-cell', () => {
    for (const scenario of [
      { label: 'neglected, priors 0 (what the HUD sends)', priors: 0, guards: 0, amenities: false },
      { label: 'neglected, priors 2 (only a command can send this)', priors: 2, guards: 0, amenities: false },
      { label: 'well-run, priors 2', priors: 2, guards: 2, amenities: true },
    ]) {
      const runtime = buildPrison({ cells: 12, toilets: scenario.amenities, amenities: scenario.amenities, guards: scenario.guards });
      // Two furnished solitary cells, built the way a player would.
      submit(runtime, 'buy-solitary-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-sp', itemId: 'item.wood-plank', quantity: 2 }));
      for (const rect of [SOLITARY_A, SOLITARY_B]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
      submit(runtime, 'zone-sa', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_A }));
      submit(runtime, 'zone-sb', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_B }));
      submit(runtime, 'sbed-a', packCommand({ type: 'PlaceObject', orderId: 'sbed-a', definitionId: 'bed-wooden', x: SOLITARY_A.x, y: SOLITARY_A.y }));
      submit(runtime, 'sbed-b', packCommand({ type: 'PlaceObject', orderId: 'sbed-b', definitionId: 'bed-wooden', x: SOLITARY_B.x, y: SOLITARY_B.y }));
      stepTo(runtime, runtime.kernel.tick + 1_000);
      if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);

      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      const RUN = 288_000;
      let admits = 0;
      let intakeHighRisk = 0;
      let peakSolitary = 0;
      const everInSolitary = new Set<number>();
      const seenClassified = new Set<number>();
      while (runtime.kernel.tick < RUN) {
        const tick = runtime.kernel.tick;
        if (tick % 2_400 === 0) {
          submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: scenario.priors, ...ARRIVAL }));
          admits += 1;
        } else {
          runtime.kernel.step();
        }
        if (tick % 200 === 0) {
          let occupied = 0;
          for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.solitary-cell')) {
            for (const occupant of runtime.prisoners.roomInstances.occupantsOf(instance.instanceId)) {
              occupied += 1;
              everInSolitary.add(occupant);
            }
          }
          if (occupied > peakSolitary) peakSolitary = occupied;
        }
        for (let i = 0; i <= store.maxActiveIndex; i += 1) {
          if (!store.isIndexAlive(i)) continue;
          if (records.sentenceLengthTicks[i]! === 0) continue;
          const stage = intakeStageFromIndex(records.intakeStage[i]!);
          if (stage !== 'accommodation-assignment' && stage !== 'completed') continue;
          const key = store.getIdByIndex(i) * 1_000_000 + (records.sentenceEndTick[i]! % 1_000_000);
          if (seenClassified.has(key)) continue;
          seenClassified.add(key);
          if (records.riskTier[i]! >= 3) intakeHighRisk += 1;
        }
      }
      console.log(`\n--- ${scenario.label} ---`);
      console.log(`admissions: ${admits}; high-risk AT INTAKE (first stage read): ${intakeHighRisk}`);
      console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`sanction metrics: ${JSON.stringify(runtime.prisoners.sanctionSystem?.getMetrics?.() ?? 'n/a')}`);
      console.log(`ever seen inside room.solitary-cell: ${everInSolitary.size}; peak concurrent: ${peakSolitary}`);
      console.log(`incidents: ${JSON.stringify(runtime.incidents.all().reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {}))}`);
    }
  });
});

describe('PROBE accommodation-driven solitary', () => {
  it('a crowded prison: does a review-promoted prisoner get HOUSED in solitary', () => {
    for (const cells of [2, 12]) {
      const runtime = buildPrison({ cells, toilets: false, amenities: false, guards: 0 });
      submit(runtime, 'buy-solitary-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-sp', itemId: 'item.wood-plank', quantity: 2 }));
      for (const rect of [SOLITARY_A, SOLITARY_B]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
      submit(runtime, 'zone-sa', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_A }));
      submit(runtime, 'zone-sb', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY_B }));
      submit(runtime, 'sbed-a', packCommand({ type: 'PlaceObject', orderId: 'sbed-a', definitionId: 'bed-wooden', x: SOLITARY_A.x, y: SOLITARY_A.y }));
      submit(runtime, 'sbed-b', packCommand({ type: 'PlaceObject', orderId: 'sbed-b', definitionId: 'bed-wooden', x: SOLITARY_B.x, y: SOLITARY_B.y }));
      stepTo(runtime, runtime.kernel.tick + 1_000);
      if (runtime.refusals.count > 0) console.log(`REFUSALS ${runtime.refusals.count}: ${JSON.stringify(runtime.refusals.last)}`);

      const store = runtime.prisoners.entityStore;
      const records = runtime.prisoners.records;
      let admits = 0;
      let sanctioned = 0;
      let unsanctioned = 0;
      const seen = new Set<string>();
      while (runtime.kernel.tick < 288_000) {
        const tick = runtime.kernel.tick;
        if (tick % 2_400 === 0) { submit(runtime, `a${admits}`, packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, ...ARRIVAL })); admits += 1; }
        else runtime.kernel.step();
        if (tick % 40 !== 0) continue;
        for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.solitary-cell')) {
          for (const occupant of runtime.prisoners.roomInstances.occupantsOf(instance.instanceId)) {
            if (!store.isAlive(occupant)) continue;
            const index = store.getIndex(occupant);
            const key = `${occupant}:${records.sentenceEndTick[index]!}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (records.solitarySanctionEndTick[index]! !== 0) sanctioned += 1;
            else { unsanctioned += 1; console.log(`  unsanctioned solitary occupant at tick ${tick}: tier=${records.riskTier[index]!} stage=${intakeStageFromIndex(records.intakeStage[index]!)}`); }
          }
        }
      }
      console.log(`\n--- ${cells} ordinary cells + 2 solitary cells, priors 0, unguarded ---`);
      console.log(`admissions: ${admits}`);
      console.log(`distinct solitary occupancies: sanction-driven=${sanctioned} accommodation-driven=${unsanctioned}`);
      console.log(`review metrics: ${JSON.stringify(runtime.prisoners.classificationReviewSystem.getMetrics())}`);
      console.log(`sanction metrics: ${JSON.stringify(runtime.prisoners.sanctionSystem.getMetrics())}`);
    }
  });
});

describe('PROBE reachable review space', () => {
  it('enumerates every review a HUD-admitted prisoner can receive', () => {
    const I = CLASSIFICATION_REVIEW_INTERVAL_TICKS;
    const tiers = new Set<number>();
    const credits = new Set<number>();
    const reviewCounts = new Set<number>();
    let cases = 0;
    for (let days = 2; days <= 16; days += 1) {
      const s = days * DAY;
      for (let r = 0; r < I; r += 1) {
        // Every scheduled run while this prisoner is held. Discharge sweeps
        // every 20 ticks with `tick >= sentenceEndTick`, so they are gone at
        // the first multiple of 20 at or after C + s.
        const C = r;
        const dischargeTick = Math.ceil((C + s) / 20) * 20;
        let n = 0;
        for (let k = 1; k <= 4; k += 1) {
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
              cases += 1;
            }
          }
        }
        reviewCounts.add(n);
      }
    }
    console.log(`cases enumerated: ${cases}`);
    console.log(`reachable riskTier at review (priors 0, drawable sentence): {${[...tiers].sort().join(',')}}`);
    console.log(`reachable cleanConduct factor: {${[...credits].sort((a, b) => a - b).join(',')}}  (MAX_CLEAN_CONDUCT_CREDIT is 2)`);
    console.log(`reviews one prisoner can ever receive: {${[...reviewCounts].sort().join(',')}}`);
  });
});
```
