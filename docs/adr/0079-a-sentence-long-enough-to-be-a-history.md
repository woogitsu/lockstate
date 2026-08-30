# ADR 0079: A sentence long enough to be a history

> **0079 was recomputed off disk and swept across every remote head**, which is
> the practice `AGENTS.md` records: *"A number is not reserved until it appears
> in `docs/adr/README.md`."* `docs/adr/README.md` read `Next free number: 0079`;
> the maximum on disk was 0078; and the sweep this time was **performed rather
> than asserted**, over all 304 refs under `refs/remotes/origin` — 56 heads at
> 0078, nothing anywhere above it. All three answers agree at 0079, which the
> index's own history says has not been the common case. **The number is
> nonetheless provisional**: if it collides with an ADR landing from another
> branch, this file, its row in the index and every citation of it in
> `src/simulation/prisoners/sentence.ts`, `src/main.ts`,
> `src/ui/simulation-events.ts` and `src/simulation/contraband/introduction.ts`
> get renumbered together.

## Status

**Proposed, 2026-08-30. Not self-approved.**

It implements the owner's ruling on
[issue #593](https://github.com/matmaxalez/lockstate/issues/593), recorded there
on 2026-08-30: sentences become **weeks rather than days**, and the range
**crosses `LONG_SENTENCE_THRESHOLD_TICKS`** so that sentence length starts to
mean something for classification. The owner also named the arithmetic they
wanted first — *"ile trwa realnie jeden dzień gry?"* — and the answer is what
this decision rests on.

**What the ruling does not settle, and this document therefore does not take:**
remission for good behaviour, parole, and the day length itself were all named
in the same breath and are all left alone here. See *What this does not decide*.

## Context

### How long an in-game day actually is

Verified at the constants rather than estimated:

| | value | where |
| --- | --- | --- |
| tick rate | **50 ms** (20 Hz) | `src/simulation/worker/state-machine.ts` |
| in-game day | **2,400 ticks** | `DAY_LENGTH_TICKS`, `src/simulation/prisoners/regime.ts:12` |
| **one in-game day at x1** | **2 minutes of real time** | 2,400 x 50 ms |

### What the old range therefore was

[ADR 0069](./0069-how-long-a-prisoner-is-held-for.md) decision 4 proposed
uniform over whole in-game days in `[2, 16]` — 4,800 to 38,400 ticks — and said
in terms that the range was *data, not architecture*, and a proposal the owner
could replace. In real time it was a sentence of **four to thirty-two minutes**.

Three statistics were dead as a direct consequence, and all three are the same
fact seen from three places:

1. **`ClassificationFactors.sentence` could only ever hold `0`.**
   `LONG_SENTENCE_THRESHOLD_TICKS` is 200,000 (`classification.ts:41`, read at
   `:84` and `:194`); the longest drawable sentence was 38,400, short by a
   factor of more than five. Both `classifyPrisoner` and `reviewClassification`
   read the sentence at exactly that one comparison, so the factor a review
   panel would render was a constant.
2. **Most prisoners never reached a first classification review.**
   `CLASSIFICATION_REVIEW_INTERVAL_TICKS` is 24,000 and the schedule is global
   (`intervalTicks: 24,000`, `phaseTicks: 23,999`) while eligibility is per
   record, so a prisoner classified at `c` with sentence `s` is reviewed only if
   a scheduled tick falls in `[c + 24,000, c + s]`. **Measured against the real
   system: 14.0%.**
3. **Nobody ever reached a second.** The same arithmetic needs `s` of about
   48,000 ticks before two scheduled ticks can fall inside the window.
   **Measured: 0%.**

### The decoupling this replaces, quoted rather than paraphrased

`sentence.ts` put the range below the threshold **deliberately**, and said so at
the definition site:

> **Far below `LONG_SENTENCE_THRESHOLD_TICKS`** (200,000, in
> `classification.ts`), which is load-bearing rather than incidental: that
> threshold is the one place `classifyPrisoner` reads the sentence, so a range
> entirely below it leaves every risk tier this game has ever drawn from a given
> seed **bit-identical**. A range that crossed it would couple sentence length
> to classification — arguably a good mechanic, and a different decision, taken
> deliberately or not at all.

ADR 0069's own *What would change my mind* names the same thing as its second
weakest claim. **This ADR is that different decision, taken deliberately.** The
old position is not being corrected; it is being spent, and both halves of what
it bought are stated below as costs.

## Decision

### 1. A sentence is uniform over whole in-game days in `[14, 90]`

`MIN_SENTENCE_DAYS = 14`, `MAX_SENTENCE_DAYS = 90` in
`src/simulation/prisoners/sentence.ts`; 33,600 to 216,000 ticks, seventy-seven
equally likely values, mean 124,800.

| | ticks | real time at x1 |
| --- | --- | --- |
| minimum, 14 days | 33,600 | 28 minutes |
| mean, 52 days | 124,800 | 1 h 44 m |
| maximum, 90 days | 216,000 | 3 hours |

The bounds stay **data beside their derivation** rather than moving into this
document: [ADR 0017](./0017-money-primary-resource-model.md) decision 5 keeps
balance values out of ADRs, and ADR 0069 decision 4 applied that split to these
two numbers. What is decided *here* is the thing that is not a balance number:
that the range crosses a threshold it was authored to avoid.

**Uniform, still.** A skewed draw — many short sentences, a thin long tail — is
more like a real remand population and remains the obvious alternative. It is
not taken, for the reason ADR 0069 gave and which has not changed: it needs a
shape nobody has picked, and uniform is the distribution whose consequences can
be read straight off a table.

### 2. `LONG_SENTENCE_THRESHOLD_TICKS` does not move

216,000 > 200,000, so the arithmetic requires nothing of `classification.ts`,
and the narrowest change that implements the ruling is the one that touches one
file. The owner's ruling put the choice in terms — *"whoever implements this
must decide whether the threshold moves too, or the range crosses it"* — and
this is the second.

The consequence, stated so nobody rediscovers it: 200,000 ticks is **83.33 in-game
days**, so the first whole day carrying the term is **84**, and **7 of the 77
drawable lengths (9.1%)** are long sentences. A thin tail rather than a common
case, which is what a long-sentence tier should be. The alternative — moving the
threshold to a round number of days — is a second balance change with no ruling
behind it, and a threshold that is not a whole day is legible enough once the
cutoff is written down.

### 3. `CLASSIFICATION_REVIEW_INTERVAL_TICKS` does not move either, and that is measured rather than assumed

The instruction was to change it only if the new range still could not reach it.
It reaches it. Measured by running the real `ClassificationReviewSystem` inside
the real `Kernel` over every drawable length at 100 arrival phases, counting
each prisoner's reviews by watching the system overwrite an out-of-range marker
in `riskTier`, with the prisoner removed at `sentenceEndTick` (order 65, after
review's order 55, so the review at the discharge tick happens first):

| | old range `[2, 16]` | new range `[14, 90]` |
| --- | --- | --- |
| reach a **first** review | **14.00%** | **97.27%** |
| reach a **second** | **0%** | **85.06%** |
| reach a third | 0% | 72.08% |
| mean reviews per prisoner | 0.14 | 4.20 |

The harness reproduces the independently stated figure for the old range — 86%
never reach a first review, nobody reaches a second — which is why its answer
for the new one is worth quoting.

**What does not change is that the schedule is global while eligibility is per
record**, so the bottom of the range is still a lottery: at 14 in-game days the
window is 9,601 ticks inside a 24,000-tick period, so **40%** of 14-day arrivals
are reviewed. Every length from **20 in-game days** upward is reviewed whatever
tick it arrives on, and from **30 days** upward, twice. The residual is
**2.73% of prisoners who still receive no review at all**, all of them in the
14-to-19-day band. That is #593's own subject — its evidence-clock proposal
answers it — and is left to that issue rather than fixed by moving a constant.

### 4. The bit-identical-tiers property is spent, and every place that claimed it says so in both directions

Six docblocks asserted, in one form or another, that the drawn range was below
the threshold and that risk tiers were therefore stable across the change that
introduced the draw. All are corrected in the same commit, keeping the old
sentence in view rather than overwriting it, because the reason it was written
has not gone away — only the permission has changed:
`src/simulation/prisoners/sentence.ts` (module comment and bounds comment),
`src/main.ts`, `src/ui/simulation-events.ts`,
`src/simulation/contraband/introduction.ts`, and
`tests/unit/prisoners-classification.test.ts`.

### 5. Nothing else about balance moves

No price, no starting treasury, no income rate, no need decay rate, no wage.
`priorIncidents` is still hard-coded to `0` in `ADMISSION_REQUEST` and
[issue #540](https://github.com/matmaxalez/lockstate/issues/540) still owns it.

## What this does not decide

- **Remission for good behaviour**, which the owner's ruling names in the same
  sentence as the longer range ("w takim kształcie jak w Prison Architect").
  Nothing in this tree shortens a sentence for conduct, and adding it is a
  mechanic with a save-format question attached — `sentenceEndTick` is written
  once at the `classification` stage and both `PrisonerDischargeSystem` and
  `classifiedAtTickOf` derive from it, so a sentence that can move is a change
  to what those two mean. It is the natural next issue and is not started.
- **Parole**, and the release-payment-now-versus-occupied-place-income trade
  #593 records from batch B41. Untouched.
- **The day length.** `DAY_LENGTH_TICKS` is still *"a candidate value, not a
  locked balance decision"*. Because the bounds are stated in days, a change to
  it carries sentences with it rather than silently reshaping them, which is why
  this decision does not need to take it.
- **Whether a sentence is shown to a player.** Nothing in `src/ui/` renders one;
  `projectPrisonerDetail` carries `sentence.lengthTicks` and `sentence.endTick`
  and the HUD declines to draw them. **No new player-facing copy is added here**,
  which `AGENTS.md`'s fourth exclusion requires. It is now a **gap worth naming**
  rather than a convenience: a 90-day sentence is three real hours and decides
  whether its holder is long-sentence, and the player can see neither number.
  Where it belongs is the prisoner roster and detail readout #535 decision 6
  describes, with copy the owner writes.
- **The 2.73% who still get no review**, per decision 3.
- **Anything about the economy.** #641's costing brief and the treasury work are
  separate and deliberately untouched here.

## What must not be broken

- **Determinism.** One `nextInt` per admission, from the isolated
  `prisoners.sentence` stream, inside a canonical walk, reading no clock. The
  rejection loop rejected exactly one uint32 value of 2^32 at a bound of 15 and
  rejects four at a bound of 77, so a second iteration remains a
  one-in-a-billion event and the stream advances one draw per admission either
  way.
- **The save format.** `SAVE_SCHEMA_VERSION` stays **5**. Nothing new is
  persisted and no field changes shape; a sentence is still a `Uint32Array` slot
  and 216,000 is nowhere near `MAX_SENTENCE_LENGTH_TICKS` (`0xffff_ffff`), so
  `classifiedAtTickOf`'s wrap guard is as far from firing as it was.
- **Old saves.** A queued `AdmitPrisoner` that names its own length keeps it and
  is never redrawn, which is ADR 0069 decision 1 and is unaffected.
- **`supabase/migrations/`, `wrangler.jsonc`, `public/_headers` and
  `.github/workflows/deploy.yml` are not touched.**

## Consequences

- **`ClassificationFactors.sentence` is alive.** Measured end to end over 8
  seeds and 320 admissions through the real `IntakeSystem`: sentences 14 to 90
  days, mean 52.7, 76 of the 77 values drawn at least once, **34 of 320 (10.6%)
  at or over 200,000**, and `ClassificationReviewSystem.assess` returns
  `factors.sentence === 1` for exactly those 34. The smallest length carrying
  the term was 201,600 (84 days) and the largest not carrying it 199,200 (83).
- **The tiers a press of Admit can produce widened from `[0, 1]` to
  `[0, 1, 2]`.** Enumerated over the whole screening-draw space rather than
  sampled: at `priorIncidents: 0` a sentence below 84 days reaches `[0, 1]` and
  one at or above reaches `[0, 1, 2]`. **The claim that mattered survives**:
  `classificationGroupIdForTier` answers `'high-risk'` only at tier 3, and
  1 + 0 + a maximum screening draw clamps at 2, so **no admission a player can
  make produces a high-risk prisoner**. It is one screening point away now
  instead of two.
- **The grant-withholding schedule fires for every neglected prisoner rather
  than for a lucky draw.** `hygiene` and `recreation` cross
  `STATE_INCOME_UNMET_NEED_LEVEL` at 10,180 and 13,570 ticks and are charged at
  the first day boundary after — 11,999 and 14,399. The shortest drawable
  sentence is 33,600, which outlasts both by more than eight in-game days. Under
  the old range that reachability was an existence claim needing one witness;
  it is now the ordinary case.
- **Steady-state occupancy rises for a given admission rate**, by roughly the
  ratio of the means — 124,800 against 21,600, a factor of **5.8**. ADR 0050's
  200,000-tick population harness was **not** re-run, exactly as ADR 0069 said
  of its own smaller move. That is stated as the largest gap rather than filled
  with an assumption, and it is the finding most likely to matter to the
  economy work in flight.
- **`ClassificationReviewSystem` does real work now.** It was a system that ran
  and, for 86% of the population, decided nothing. `tierIncreases`,
  `tierDecreases` and `groupChanges` become non-trivial, and `room.solitary-cell`'s
  accommodation branch — reachable only through a review revising a tier upward
  — has a population that can reach it.
- **No determinism fingerprint moved, and that is a finding rather than a
  relief.** See below.

## The determinism result, which contradicts the brief this was implemented under

The instruction was that `tests/determinism/` would fail and must be
re-baselined deliberately in the same commit. **It did not fail. Nothing in it
moved, and nothing in it could have.** Measured: the full suite is 340 files,
3,867 tests, green, with the sentence range changed.

The reason is that **every admission in `tests/determinism/` names its own
`sentenceLengthTicks`** — `tests/helpers/determinism-scenario.ts:158-161`
(36,000 / 160,000 / 88,000 / 24,000), `snapshot-restore-fidelity.test.ts:52-58`,
`job-performing-restart-bound.test.ts:61`,
`save-rng-stream-compatibility.test.ts:268`, and
`contended-scan-order.test.ts:82`. ADR 0069 decision 1 is what makes a named
length authoritative, so those scenarios never take the draw at all. The
`prisoners.sentence` derived-word tables in
`save-rng-stream-compatibility.test.ts` are functions of the master seed and the
stream *name*, not of the range, so they are unmoved for a second, independent
reason.

`tests/integration/sentence-length-variation.test.ts` had already written this
down — *"Nothing else in the repository can see that: `tests/determinism`'s
scenario names its own sentences, so it never makes the draw at all"* — so the
gap was known and is confirmed here rather than discovered.

**So there was nothing to re-baseline, and re-baselining anything would have
been re-baselining something with no path to sentence length.** What the tree
lacks instead is a fingerprint that *would* have moved. Three were added rather
than left as a note, and each was watched going red before it went green — the
range was reverted to `[2, 16]` with the new tests in place, and nine cases
across four files failed, including all three of these:
`tests/unit/prisoners-sentence.test.ts`'s straddle and factor cases, and
`tests/integration/sentence-length-variation.test.ts`'s two-prison case, which
admits into the same seed twice — once leaving the length to the simulation and
once naming one below the threshold — and asserts the recorded tiers are 2 and
1. Because `prisoners.sentence` and `prisoners.classification` are separate
streams, the screening draw is the same value in both prisons, so the one-tier
difference is the sentence term and nothing else.

Six production mutants were run against those files. Five died:
`MAX_SENTENCE_DAYS` 90 to 83 (7 failures), `MIN_SENTENCE_DAYS` 14 to 10 (7),
`LONG_SENTENCE_THRESHOLD_TICKS` 200,000 to 100,000 (4), and `>=` to `>` at each
of the two places the threshold is read (1 and 2). **One survived** —
`ClassificationReviewSystem`'s eligibility test `<` to `<=` — because
`tick - classifiedAt` is exactly one interval only for a prisoner classified at
23,999, and no case in the repository used that arrival tick. It is reported
here rather than covered over, and it is also fixed:
`tests/unit/prisoners-classification-review.test.ts` now has *"reviews a
prisoner whose elapsed time is exactly one period, not one tick more"*, which
kills it.

## What would change my mind

**The weakest claim in this document is decision 2** — that
`LONG_SENTENCE_THRESHOLD_TICKS` should stay at 200,000 and let the range cross
it. It gives the long-sentence tier to 9.1% of admissions, and that number is a
consequence of two constants that were never chosen against each other: 200,000
was authored when a sentence was 10,000 ticks, and 90 days was chosen to clear
it. If playtesting says the long-sentence tier should be an *uncommon* rather
than a *rare* outcome, the honest fix is to move the threshold to a whole number
of in-game days — 60 days (144,000) would make it 41% of the range, 75 days
(180,000) would make it 21% — and that is a balance change with its own ruling,
not a follow-up to this one.

**A second, and it is about what this change cannot see.** The steady-state
occupancy consequence above is arithmetic on the mean, not a measurement. A
prison whose population is 5.8x what the economy work has been costing against
is a different prison, and the two changes are in flight at the same time. What
would settle it is ADR 0050's population harness re-run at the new range beside
the current wage and grant rates; nobody has run it, and this document does not
pretend otherwise.

**A third, smaller.** The review measurement removes a prisoner by setting the
`'failed'` intake stage rather than by running `PrisonerDischargeSystem`. That
is faithful to `REVIEWABLE_STAGES` and to the two systems' order, and it is
still a stand-in. If discharge ever stops being instantaneous — ADR 0050
decision 4's slice 2 is explicitly unbuilt — the 97.27% and 85.06% are the
numbers to re-take first.
