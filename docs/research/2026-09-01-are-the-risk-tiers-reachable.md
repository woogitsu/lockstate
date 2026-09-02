# Are the risk tiers above Low reachable, or merely slow? Measured on `f0d4b01e`, v0.0.343

**Date:** 2026-09-01
**Tree:** `f0d4b01e` (`chore(release): v0.0.343`), branch `docs/are-the-risk-tiers-reachable`
**Question put to this record:** [#788](https://github.com/matmaxalez/lockstate/issues/788) —
`prisonersHighRisk` read 0 across 34 admissions in three prisons and
`priorIncidents` is hard-coded to `0`. Ruling 4 of
[#703](https://github.com/matmaxalez/lockstate/issues/703) put a high-risk
chip on the status strip and sorted the roster by tier. **Is the ladder above
`Low` unreachable in this game, or does it just take longer than a 34-admission
playtest to reach?**

**Answer: slow, not unreachable — and it is reached through a mechanism #788
never asked about.** `priorIncidents` genuinely never moves; grepping every
write to it under `src/` finds exactly one site, and the only value it is ever
given is the constant `#788` already found. That is real and it is permanent.
But `ClassificationReviewSystem` writes a prisoner's tier a second time, later,
from a completely different input — disciplinary findings folded from real
incidents — and that input is very much alive. Run against the real kernel, a
neglected, unguarded prison a player could build reaches **High risk (tier 3)
at tick 47,999**, about 20 in-game days after admission, entirely from
disciplinary findings, with `priorIncidents` pinned at `0` on every prisoner
throughout. A staffed, needs-met control over the identical window produces
**zero** incidents and settles every prisoner at **Minimal**. Both are
measured in this pass, in the real kernel, not argued from the score formula
alone.

**No threshold, weight or balance value was changed.** ADR 0017 decision 5
puts those with [#29](https://github.com/matmaxalez/lockstate/issues/29). One
new test file was added under `tests/integration/`; no other source file under
`src/` was modified in the delivered state (a two-constant mutation was made
and reverted by hand to prove the test — §6).

---

## 0. How to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line, or the number was
  produced by running the real kernel in this worktree and pasted.
- **DERIVED** — integer arithmetic over VERIFIED constants, written out so it
  can be checked without a run.
- **UNKNOWN** — could not be established in this pass.

---

## 1. #788's own citations, opened — VERIFIED

| #788 says | Actually at | Reads |
| --- | --- | --- |
| `src/main.ts:918` | `src/main.ts:918` | `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;` |
| `classification.ts:58-60` | `src/simulation/prisoners/classification.ts:57-60` | `export function classificationGroupIdForTier(riskTier: RiskTier): string { return riskTier >= 3 ? 'high-risk' : 'general-population'; }` |

Both hold exactly as cited. `classificationGroupIdForTier` really does put
tiers 0, 1 **and 2** on the same `'general-population'` regime — `Medium`
collapses onto the same block as `Minimal`, exactly as #788 says, and nothing
on screen distinguishes them (a separate, correctly-filed concern in #788 that
this record does not re-litigate).

## 2. Every write to `priorIncidents`, grepped rather than assumed — VERIFIED

`grep -n "priorIncidentsAtIntake\[" -r src/` returns four lines, and only one
of them is a write:

```
src/simulation/presentation/prisoner-projection.ts:741   (read, for the HUD projection)
src/simulation/prisoners/classification-review-system.ts:336   (read, feeds reviewClassification)
src/simulation/prisoners/intake-system.ts:274             this.records.priorIncidentsAtIntake[index] = Math.min(255, input.priorIncidents);
src/simulation/prisoners/intake-system.ts:501             (read, feeds classifyPrisoner)
```

**One write site, at intake, and it never happens again for that prisoner.**
`input.priorIncidents` traces to the `AdmitPrisoner` command
(`commands.ts:270`), whose one caller under `src/` is `src/main.ts`'s
`ADMISSION_REQUEST` — the constant `0` from §1. So the value every prisoner
the HUD admits is ever given is `0`, written once, and nothing in `src/`
revises it afterward. **This settles the question the brief asked for without
a run**: `priorIncidents` does not move slowly, or rarely — it does not move
at all, ever, under any amount of play.

## 3. What #788 did not say, and the tree already half-corrects — VERIFIED

`classifyPrisoner` (`classification.ts:82-90`) scores `sentence (0 or 1) +
priorIncidents (0..2) + screening variance (-1, 0, +1)`, clamped to `[0, 3]`.
`priorIncidents` is always `0` (§2). `LONG_SENTENCE_THRESHOLD_TICKS = 200,000`
(`classification.ts:41`), and since
[#593](https://github.com/matmaxalez/lockstate/issues/593)'s ruling the
drawable sentence range is 14-90 in-game days
(`sentence.ts:200-201`, `MIN_SENTENCE_DAYS`/`MAX_SENTENCE_DAYS`) — seven of
those 77 lengths (84-90 days) are at or over the threshold.

So an admission at one of those seven lengths, with the best screening draw
(`+1`), scores `1 + 0 + 1 = 2` — **`Medium`, at intake, in ordinary play, no
neglect required.** `tests/unit/prisoners-classification.test.ts:108-109`
already asserts exactly this (`reachableTiers({ sentenceLengthTicks: 201_600,
priorIncidents: 0 })` → `[0, 1, 2]`), and `src/main.ts`'s own docblock above
`ADMISSION_REQUEST` already says so in prose. **#788's "only `Minimal` and
`Low` arise through ordinary admission" is therefore not quite right** — it is
right about `High`, and about the overwhelming majority of admissions (93 of
100 draw a sub-threshold sentence and can only reach `[0,1]`), but a real
though narrow slice of ordinary admissions already produces `Medium` with no
review, no incident and no neglect at all. `High` at intake is impossible by
the same arithmetic: the maximum score is `1 + 0 + 1 = 2`, one point short.

## 4. The other place a tier is written, and what it reads — VERIFIED

`ClassificationReviewSystem` (`classification-review-system.ts`) reassesses
every eligible prisoner's tier periodically via `reviewClassification`
(`classification.ts:181-208`), which sums four named factors:

```
sentence      = sentenceLengthTicks >= 200,000 ? 1 : 0
intakeHistory = min(2, max(0, priorIncidentsAtIntake))   -- always 0 (§2)
findings      = min(3, max(0, disciplinary.points))       -- MAX_FINDINGS_TERM
cleanConduct  = -min(2, floor((tick - lastFindingOrClassifiedTick) / 24,000))
```

`disciplinary.points` comes from `buildDisciplinaryIndex`
(`disciplinary-record.ts:88-102`), folded from `IncidentLog.all()` and
`ConfiscationLedger.all()` — **never from `priorIncidents`.** A terminal
(`'resolved'` or `'lapsed'`) `'riot'`, `'assault'` or `'gang-retaliation'`
credits every participant 2 points (`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`,
`disciplinary-record.ts:47-49`), plus 1 more if it lapsed unanswered
(`LAPSED_INCIDENT_SURCHARGE_POINTS`, `:58`); a contraband find on a prisoner
credits 1 (`CONFISCATION_FINDING_POINTS`, `:61`). `findings` alone caps at 3,
which alone clamps `reviewClassification`'s score to tier 3 — **`High` is
reachable through the review path regardless of `priorIncidentsAtIntake` or
sentence length**, entirely through evidence a neglected prison's own
incidents supply.

`ClassificationReviewSystem` runs on a **global** schedule (every tick
`≡ 23,999 mod 24,000`) but checks **per-prisoner** eligibility
(`context.tick - classifiedAtTick >= CLASSIFICATION_REVIEW_INTERVAL_TICKS`,
24,000). For a prisoner classified at tick `C`, with `r = C mod 24,000`, the
first review that can reach them falls at `C + (47,999 - r)` — so the wait is
**24,000 to 47,999 ticks (10 to 20 in-game days at `DAY_LENGTH_TICKS = 2,400`)
after classification**, depending only on when in the schedule they were
classified. This formula is already in the tree
(`classification-review-system.ts`'s own docblock), which also states that
since #593's sentence re-range **97.27%** of prisoners now reach a first
review — up from 14.0% under the old 2-16 day range. Both figures are read
from the file, not re-derived here; §5 exercises the mechanism directly rather
than re-measuring the percentage.

## 5. The neglect run — VERIFIED, real kernel

`tests/integration/risk-tier-neglect-reachability.test.ts`, added by this
pass. Both cases admit with `src/main.ts`'s exact request —
`priorIncidents: 0` — and a fixed `sentenceLengthTicks: 60,000`, below
`LONG_SENTENCE_THRESHOLD_TICKS`, so the `sentence` and `intakeHistory` terms
are 0 for the whole run: whatever tier appears has to come from `findings`.

**Neglected**: 8 cells, beds only (no toilet, no shower, no yard), 0 guards, 8
prisoners — the same shape
`tests/integration/incident-trigger-reachability.test.ts` already showed riots
at 0 guards and stays quiet at 1. Seed `0x0cc0`, run to 50,000 ticks (kernel's
own post-increment counter — see the note below):

```
incidents opened at ticks [1801, 4201, 6201, 7001, 11001, 15801, 20601,
  25401, 30201, 35001, 39801, 44601]   -- 12 riots, all "lapsed" (no responder)
first prisoner at tier >= 3: tick 48000
every living prisoner's final assessment: findings = 3, score = 3, tier = 3 (High)
priorIncidentsAtIntake for every prisoner, checked directly: 0
```

**A one-tick reporting offset, stated exactly rather than left implicit.**
`Kernel.step()` runs systems at `context.tick = this._tick` and only then does
`this._tick++` (`kernel.ts:190-208`), so `runtime.kernel.tick` read after
`step()` is one **greater** than the tick systems actually executed at. The
review that promotes every prisoner here to tier 3 therefore really fires at
**tick 47,999** — which is exactly `C + 47,999 - r` from §4 with `C ≈ 1,010-1,020`
(these prisoners were admitted within a few ticks of each other, giving
`r ≈ 1,010-1,020`, near the *slow* end of the 24,000-47,999 range rather than
the fast end). The incident-tick list above carries the identical one-tick
offset and is otherwise exact.

**So: from admission (~tick 1,010) to High risk (tick 47,999) is about
46,989 ticks — roughly 19.6 in-game days.** The neglect itself is cheap: the
first riot opens at tick 1,801, under a day after admission. What makes this
slow is not how long a neglected prison takes to misbehave — it is the
review's own fixed clock, and specifically that these particular admissions
landed near the unlucky end of it. A prisoner classified nearer a 24,000-tick
boundary would be reviewed roughly half as fast; `src/main.ts:858`'s own
words size that clock in real time for a different case — *"a 90-day sentence
is three real hours at x1"*, i.e. 216,000 ticks ≈ 10,800 s, about 20
ticks/second — which puts 46,989 ticks at **roughly 39 minutes of real,
unaccelerated play**, before any speed multiplier a player would actually use.

## 6. The control — VERIFIED, real kernel

Same file, same seed, a fully furnished prison (bed, toilet, shower, canteen,
yard) with 1 guard, 8 prisoners, run to 50,000 ticks:

```
incidents: []
confiscations: 0
every living prisoner's final assessment: findings = 0, cleanConduct = -2, score = -2, tier = 0 (Minimal)
```

**A well-run prison does not merely fail to raise anybody's tier — it actively
lowers it.** Every prisoner here was classified at intake with whatever the
screening draw gave (0 or 1, per §3); by the time of their first review, clean
conduct credit has clamped the score to `0`, at or below the intake tier in
every case. The mechanism does not sit idle in a good prison; it corrects
downward.

## 7. Why `Medium` was not seen as a distinct waypoint in the neglect run — DERIVED, and reported as a limit rather than smoothed over

Every incident in §5 is a `'riot'`, and every one lapsed (no guard existed to
respond). `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot` is 2 and
`LAPSED_INCIDENT_SURCHARGE_POINTS` is 1, so **a single lapsed riot already
scores 3 points — the findings cap** — and every subsequent riot this
prisoner is party to adds points that `min(3, ...)` discards. The review is
**absolute, not incremental** (`reviewClassification`'s own docblock), so a
prisoner with findings already at the cap by the time their first review
fires goes straight from their intake tier to `High`, never stopping at
`Medium` in between.

**This pass tried, and did not manage, to produce a real-kernel case that
stops at `Medium` instead.** `Medium` via review needs a score of exactly 2 —
one resolved (non-lapsed) incident, or a long sentence plus one confiscation
find, or two confiscation finds alone. A second, unrecorded experiment in this
worktree (10 prisoners, 1 guard against a requirement of 2, same bed-only
prison) still produced only `'lapsed'` incidents — a guard present but
insufficient did not resolve any of them inside the 600-tick response
deadline in this run. **So whether a `Medium`-only outcome is easy, rare, or
requires a specific staffing shape this pass did not find is genuinely
unknown**, and is this record's weakest claim (§9). What is not in doubt is
that the arithmetic permits it and that neither `priorIncidents` nor
sentence length has anything to do with which of `Medium` or `High` a review
lands on — only how much disciplinary evidence had accumulated by the time it
fired.

## 8. What this settles, and what it does not

**Settled:**

- `priorIncidents` is not slow, rare, or hard to move. It never moves at all,
  under any amount of play, by any means present in `src/` today (§2).
- The tier ladder above `Low` is not dead code. `High` is reached, in the real
  kernel, from a prison a player can build, through a mechanism entirely
  independent of `priorIncidents` (§4, §5).
- It requires neglect: a needs-met, guarded prison (§6) produces none of the
  evidence the review needs and actively settles every tier at `Minimal`.
- It is slow relative to a short playtest, and the "24,000 ticks" #788 named
  as an estimate is the *fast* half of the real range — the review's own
  schedule spans 24,000-47,999 ticks after classification (§4), and this
  pass's run landed at the slow end of it (§5).
- `Medium` does not require neglect at all: a real, if narrow, slice of
  ordinary long-sentence admissions already produces it at intake (§3),
  which is a correction to #788's own framing rather than a new mechanism.

**Not settled, and named rather than guessed at:**

- Whether a review can land on `Medium` specifically, and under what staffing
  shape, was not produced in this pass (§7). The arithmetic permits it; no run
  here exhibited it.
- Single seed (`0x0cc0`) throughout. Nothing here was swept across seeds, so
  "the neglected case always reaches tier 3 by its first review" is a
  one-sample measurement, not an exhaustive one — though the mechanism it
  rests on (a single lapsed incident already saturates the cap) is a property
  of the constants in §4 and §7, not of the seed.
- Whether this pacing — up to 20 in-game days, ~39 minutes unaccelerated — is
  the pacing the owner wants for a status-strip chip and a roster sort
  (#703 ruling 4) is a balance question this record does not answer and
  `AGENTS.md` reserves.

## 9. What the owner would need to decide

This record is a measurement, not a recommendation, per `AGENTS.md`'s owner
mandate and ADR 0017 decision 5. Three things it hands over rather than
settles:

1. **Is ~20 in-game days (up to ~39 real minutes unaccelerated) the pacing
   wanted for the high-risk chip and the tier-sorted roster**, or should the
   review interval, the findings cap, or the lapse surcharge move? All three
   are named "directional defaults, not balance decisions" in their own
   docblocks (`classification-review-system.ts`, `disciplinary-record.ts`).
2. **Is a tier that can only ever go `Low → High` in one step, skipping
   `Medium`, the intended shape** for a prison whose only incidents lapse
   unanswered — or should `Medium` be reachable as a real, visitable
   waypoint rather than an arithmetic possibility this pass could not
   reproduce?
3. **Should `priorIncidents` ever be given a non-zero value** — from a
   transfer, a record import, or some other admission path not yet built —
   or is "every admission starts clean and the record is built entirely in
   custody" the intended design? Nothing here argues either way; §2 only
   establishes that today it is the latter, unconditionally.

---

## Weakest claim in this record

§7: that a real-kernel case landing on `Medium` (rather than jumping past it to
`High`) was not produced in two attempts. A better-targeted third attempt —
tuning guard count and response geometry so an incident is genuinely contained
rather than merely under-staffed — might well produce one; this pass did not
have that attempt available in its effort budget. What would change this
record's mind: a real kernel run showing a prisoner's review land on tier 2
and stay there.

## Reproduction

`tests/integration/risk-tier-neglect-reachability.test.ts`, added on
`docs/are-the-risk-tiers-reachable`. Proved against the unmodified tree: zeroing
`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot` and
`LAPSED_INCIDENT_SURCHARGE_POINTS` (both in `disciplinary-record.ts`) turns the
neglect case's `findings` assertion red (`expected +0 to be 3`); both were
restored by hand and the file's sha256 (`575b351f8b696bc86ff1a862b7ed4ca1260eb2667019a2ffb986b7e5879aeade`)
matched the pre-mutation value exactly. `./node_modules/.bin/vitest run
tests/determinism` passes (181 passed, 1 skipped, 27 files) on the delivered
tree; both `tsc -b` and `tsc -b tsconfig.tools.json` report zero errors.
