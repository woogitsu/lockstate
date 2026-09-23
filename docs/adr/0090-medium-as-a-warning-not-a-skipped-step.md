# ADR 0090: Medium as a warning, not a skipped step

> **0090 was recomputed off disk and swept across every remote head.**
> `docs/adr/README.md` on `origin/main` (`2025f7d7`, v0.0.349) reads `Next free
> number: 0089`; the maximum ADR file in this worktree (cut from `5aef4301`,
> v0.0.348, one release behind `main`) is 0087. The sweep —
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (428 heads) with
> `git ls-tree -r --name-only <head> -- docs/adr/` read out of every one —
> finds **0088 landed on `main`** (`9dd6e601`, the guard-post-walk decision)
> and **0089 held**, unmerged, on
> `docs/791-how-a-host-refusal-reaches-the-player`
> (`0089-how-a-host-refusal-names-its-reason.md`). Nothing above 0089 appears
> on any head. Taking 0089 would collide with that hold, so this document takes
> **0090**, one past the swept ceiling rather than the number `max + 1` off
> this worktree's own stale disk would have given. **The number is
> provisional**: if it collides with an ADR landing from another branch, this
> file, its row in `docs/adr/README.md` and every citation of it in
> `src/simulation/prisoners/classification.ts`,
> `src/simulation/prisoners/classification-early-warning-system.ts`,
> `src/simulation/prisoners/classification-review-system.ts`,
> `src/simulation/prisoners/prisoner-operations-runtime.ts` and
> `tests/determinism/kernel-system-order.test.ts` get renumbered together.

## Status

**Accepted by the owner on 2026-09-23, as written.** Asked whether to accept
the mechanism this document chose, they picked the option labelled:

> Akceptuj (zalecane)

("Accept (recommended).") What is accepted is the Decision section as it
stands: a daily `ClassificationEarlyWarningSystem` that reuses the
authoritative review's scoring, can only raise a tier, and never raises one
above `Medium`. The pacing to `High` is unchanged, which is the constraint the
owner's own ruling of 2026-09-01 set. The `Proposed` block is kept below rather
than replaced, on the pattern
[ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md)'s Status
block sets.

**The provenance is the weaker kind.** The ruling is the *label of a clickable
option the integrating session wrote and the owner chose*, not a sentence they
typed. That is the same shape `AGENTS.md` flags for its entries of 2026-09-08,
2026-09-09 and 2026-09-10. It is recorded there as ruling 19 of the section
*"Instructions recorded that are not releases"*.

**This accepts a mechanism that is already built.** The system landed on
`main` in #798 (`75a3797b`, v0.0.351) while this document was `Proposed`, so
the acceptance moves no code. It does not re-open anything under *"What this
does not decide"* below either. Item 2 there, whether `priorIncidents` ever
gets a non-zero source, was answered separately the same day: ruling 25 in
`AGENTS.md` says admitted prisoners arrive with prior incidents, and an ADR
comes before any code. Until that ADR is decided, `ADMISSION_REQUEST`'s `0`
stands, and so does this document's statement that both systems read that
field.

---

**Proposed, 2026-09-02. Not self-approved.** *(The state of this document
before the ruling above.)*

This document is not offered as one of several options for the owner to choose
among — the owner has already ruled, in a comment on
[#788](https://github.com/matmaxalez/lockstate/issues/788) dated 2026-09-01:

> **The pacing is right** — twenty in-game days of neglect is a sensible price
> for high risk, and that is not to be changed. **But the skip is wrong**: a
> player should see `Medium` as a warning rather than get `High` with no
> notice.

What is `Proposed` here is the *mechanism* chosen to satisfy that ruling, which
the ruling itself left open, and `AGENTS.md`'s rule against self-approving
architecture stands regardless of how firm the instruction that motivates it
is. The owner can accept this mechanism, or direct a different one; the
ruling's two constraints do not change either way.

## Context

[#788](https://github.com/matmaxalez/lockstate/issues/788) found
`prisonersHighRisk` reading 0 across 34 admissions and asked whether the tier
ladder above `Low` was reachable at all. A follow-up measurement,
`docs/research/2026-09-01-are-the-risk-tiers-reachable.md` (commit `f0d4b01e`,
v0.0.343), answered: reachable, not dead code, but slow — a neglected,
unguarded, bed-only, eight-resident prison reaches `High` at tick 47,999
(≈19.6 in-game days) purely from disciplinary findings, entirely independent of
`priorIncidents` (which is hard-coded to `0` at `src/main.ts:918` and never
moves — confirmed again in this pass, untouched). And it found something #788
had not asked about: that same run never visits `Medium`. It goes straight from
whatever intake gave (`Minimal` or `Low`) to `High` in one write.

### Why `Medium` is skipped, verified against this tree

`ClassificationReviewSystem.update` (`classification-review-system.ts`)
recomputes a prisoner's tier via `reviewClassification`
(`classification.ts:191-217`), which sums four factors and clamps the result to
`[0, 3]`. In a neglect run with the sentence held below
`LONG_SENTENCE_THRESHOLD_TICKS` and `priorIncidents` pinned at `0`, `sentence`
and `intakeHistory` are both `0` for the whole run, so only `findings` can move
a tier. `findings = min(MAX_FINDINGS_TERM, disciplinary.points)`
(`classification.ts:196`), `MAX_FINDINGS_TERM = 3`
(`classification.ts:127`) — the same value as the tier scale's own ceiling —
and a single terminal `'riot'` scores 2 points
(`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot`, `disciplinary-record.ts:48`) plus
1 more for lapsing unanswered (`LAPSED_INCIDENT_SURCHARGE_POINTS`,
`disciplinary-record.ts:58`) — **3 points, exactly the cap, from one incident,
in a prison with no guard to answer it.**

That arithmetic is necessary but not sufficient to explain the skip on its
own, and the part #788's own research pass did not establish is the reason a
*graduated* cap (say, one incident scoring less than 3) would not have fixed
it either. `ClassificationReviewSystem` runs on a **global** schedule —
`schedule = { intervalTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS,
phaseTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1 }`, so `Kernel.step` only
invokes it at ticks ≡ 23,999 mod 24,000 (`kernel.ts:202`,
`this._tick % system.schedule.intervalTicks === system.schedule.phaseTicks`) —
and eligibility additionally requires a full interval since classification
(`context.tick - classifiedAtTick >= CLASSIFICATION_REVIEW_INTERVAL_TICKS`).
For a prisoner classified at any tick `C < 24,000` — every prisoner admitted in
a fresh session's opening minutes, which is every prisoner this ADR is about —
the earliest tick satisfying both conditions is **always exactly 47,999**,
independent of `C`: eligibility opens at `C + 24,000 ∈ [24,000, 47,999]`, and
the smallest schedule tick at or after that is the next one, 47,999, because
24,000 already exceeds the previous schedule tick (23,999). Measured directly
in this tree: `ClassificationReviewSystem.getMetrics().reviewsCompleted` is `0`
after the run through tick 23,999 and nonzero only after 47,999
(`classification-review-system.ts`'s own docblock names the same fact for
24,000 simultaneous prisoners spanning every possible classification tick in
`[0, 23,999]`).

So **tick 47,999 is not merely where `High` happens to land in this one
fixture — it is the earliest tick at which `ClassificationReviewSystem` can
ever write anything, for any prisoner, in any fresh session.** By that tick, a
genuinely neglected prison has had 46,000+ ticks to accumulate disciplinary
evidence — this file's own fixture shows twelve riots opened by tick 44,601,
all lapsed, giving every one of eight prisoners `disciplinary.points` between
27 and 36 by the time the one evaluation point before day 20 arrives. **No
choice of cap, per-incident weight or lapse surcharge changes this**: whatever
constant makes one incident insufficient to saturate, twelve incidents'
accumulated points still exceed any cap low enough to leave room for `High` to
remain reachable from findings alone (a cap below 3 forecloses `High` outright,
since `sentence` and `intakeHistory` are both 0 in this scenario and `findings`
is the only term left). The skip is a **timing** defect, not an
**arithmetic** one: there is no tick before 47,999 at which anything ever
looks, so there is no tick before 47,999 at which anything could show
`Medium` — regardless of how the score that eventually gets computed there is
weighted.

### Why the four candidate levers named in the brief that produced this ADR are each wrong

The brief that commissioned this document named four candidates: the cap, the
per-incident points, the lapse surcharge, and the tier thresholds. Each is
addressed in turn, because the reasoning above is easy to misread as ruling out
only the first.

1. **The cap (`MAX_FINDINGS_TERM`).** Lowering it below 3 makes `High`
   unreachable from `findings` alone in this exact fixture (`sentence` and
   `intakeHistory` are both 0), which fails the ruling's own constraint before
   the arithmetic is even checked against the neglect run's tick. Leaving it at
   3 changes nothing, per the accumulation argument above.
2. **Per-incident points.** Lowering `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot`
   changes what a *single* incident scores, and this fixture's prisoners have
   accumulated many incidents' worth of points by the only tick that ever looks
   — twelve riots, most of them shared across all eight residents because
   [ADR 0048](./0048-what-a-sectors-occupants-are.md) makes the derived sector
   the *whole prison*, so a riot's participants are the whole population on
   owned land, not a subset. Weakening the per-incident weight delays which
   *incident count* first reaches the cap; it does not change that the cap is
   reached well before tick 47,999 regardless, because the accumulation window
   is 46,000 ticks wide and the cap is reached by the fourth incident at the
   lightest plausible weighting.
3. **The lapse surcharge.** Same argument as 2, one level down: removing it
   makes a single incident score 2 rather than 3, which would matter if this
   fixture's first review happened after exactly one incident. It happens
   after twelve.
4. **The tier thresholds** (the score-to-tier boundaries `clampTier` applies).
   Widening the range a `RiskTier` can take (say, four bands of two points
   each instead of one point each) does not help either, for the same reason:
   whatever score twelve incidents' worth of evidence produces by tick 47,999
   still has to map to the ladder's own top band for `High` to remain
   reachable at all, and there is still exactly one evaluation point at which
   that mapping happens.

**None of the four constants the review's score is built from can produce a
visible `Medium` before `High` in this scenario, because the defect is not in
what score gets computed — it is in there being only one tick, ever, before
day 20, at which any score gets computed at all.** A fix has to add an earlier
evaluation point or it cannot satisfy the ruling.

## Decision

### A second system, `ClassificationEarlyWarningSystem`, runs daily and can only ever raise a tier as far as `Medium`

`src/simulation/prisoners/classification-early-warning-system.ts`. It shares
`ClassificationReviewSystem`'s evidence fold (`buildDisciplinaryIndex` over the
same `DisciplinaryEvidenceSource`) and its scoring function
(`reviewClassification`, unchanged), and differs from it in exactly three
ways:

- **Schedule.** `intervalTicks: DAY_LENGTH_TICKS (2,400)`,
  `phaseTicks: DAY_LENGTH_TICKS - 1` — once a day rather than once every ten,
  and with no minimum-time-since-classification eligibility gate (a well-run
  prisoner's score without findings never exceeds what intake already gave, so
  the absence of a gate cannot raise anyone with nothing against them; see
  "Consequences" for the measurement).
- **Ceiling.** `EARLY_WARNING_TIER_CEILING = 2` (`Medium`,
  `classification.ts`). The write is `Math.min(EARLY_WARNING_TIER_CEILING,
  reviewClassification(...).riskTier)`. It never writes `3` (`High`).
- **Direction.** It only ever raises: `if (cappedTier <= currentTier) return;`.
  It never lowers a tier — clean-conduct credit stays exclusively
  `ClassificationReviewSystem`'s job, so there remains exactly one place a
  tier ever goes down, and this system cannot flicker a warning on and off
  from one day to the next.

`ClassificationReviewSystem` itself is **unmodified**: same schedule, same
cap, same per-incident points, same surcharge, same thresholds, same tick at
which it first evaluates anyone. A prisoner the early warning raises to
`Medium` still receives the exact same authoritative review, at the exact same
tick, computing the exact same score from the exact same evidence, as they
would have if this system did not exist. If that score is `High`, `High` is
still what gets written, when it always was.

### Why a second system rather than any single-constant change

Established in Context: no combination of the four named constants can make
the *existing* review show `Medium` before `High` in this scenario, because
there is no tick before 47,999 at which it evaluates anyone at all. Showing an
intermediate state at some earlier tick requires an evaluation at that earlier
tick — a second look, not a different number computed at the same look. That
is a second system by construction, whatever its cadence turns out to be.

### Why capped at `Medium` and never `High`

Crossing into `High` carries real consequences beyond the number itself: the
high-risk regime (confining a prisoner to sleep/meal/hygiene for most of the
day, ADR 0032 decision 5) and [ADR 0080](./0080-when-the-prison-asks-what-a-prisoner-is-carrying.md)'s
contraband-introduction question, gated to exactly the step *into* tier 3. Both
are keyed to *when* `High` is first written. Reserving that write to
`ClassificationReviewSystem` alone is what keeps every one of those
consequences arriving at precisely the tick they did before this ADR — which
is the ruling's own constraint, made mechanical rather than merely intended.

### Why daily, and not some other cadence

`DAY_LENGTH_TICKS` (2,400) is an existing, already-meaningful unit —
`economy.state-income` and `economy.payroll` both run on it — rather than an
invented number. It is fast enough to matter: in this file's own neglect
fixture, the first riot (opened tick 1,801) has lapsed by the early warning's
*second* daily check (tick 4,799, systems-executed; the kernel's post-increment
tick read gives 4,800 — see `kernel.ts:190-208` and
`tests/integration/risk-tier-neglect-reachability.test.ts` for the offset),
giving a player roughly 43,000 ticks (about 18 in-game days) of `Medium`
warning before `High` arrives at tick 47,999 (observed as 48,000 in the same
test's convention). A cadence any slower than a day was expected to risk the warning
arriving too close to `High` to read as one, **and that expectation has since
been measured and is weaker than it was stated as** — see the correction below;
a cadence faster than a day was not chosen
because nothing in this scenario's incident dynamics (riots quiet for
`DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`, 4,800 ticks, between them) needs
sub-day granularity to catch, and running the evidence fold more often than
that raises the cost named below for no observed benefit.

**Correction, measured rather than argued (integrator, 2026-09-02, before this
document was proposed for signature).** The sentence above rejected a slower
cadence on a risk it did not measure. The measurement was then taken, as a
mutation of the shipped code rather than a thought experiment: the early
warning's `schedule` was changed in place to `intervalTicks: DAY_LENGTH_TICKS *
10` — the authoritative review's own cadence — and
`tests/integration/risk-tier-neglect-reachability.test.ts` re-run against the
same neglect fixture. `Medium` was still reached, at tick **24,000**, and
`High` did not move at all, staying at **48,000**. So a ten-day cadence still
gives a player a **24,000-tick (~10 in-game day) `Medium` window** before
`High`, which is not plausibly "too close to `High` to read as one".

**The decision is unchanged and the reasoning for it is narrower.** Daily is
still the right cadence, but the honest argument for it is *margin*, not
necessity: it buys ~43,000 ticks of warning where ten-day buys ~24,000, and it
decouples the warning's arrival from the authoritative review's own phase
instead of landing on the same tick every ten days. What is **not** true is
that a slower cadence fails to produce the waypoint at all. This matters
because the owner is being asked to sign a mechanism, and a justification that
overstates what forced it invites the wrong question later — the real question
is how much warning a player is owed, which is a design call, and a range of
cadences can serve it.

**The mutation was restored by hand and the restore verified** (`sha256sum -c`
matched the pre-mutation digest, `git status` clean, the suite green again at 2
passed) — it is recorded here rather than left as a claim about a tree nobody
can inspect.

### Ordering: 52, between intake (50) and the authoritative review (55)

Inserted into the existing gap, so no other system's declared order moves.
Because `CLASSIFICATION_REVIEW_INTERVAL_TICKS` (24,000) is an exact multiple of
`DAY_LENGTH_TICKS` (2,400), both systems fire on the same tick every ten days —
including tick 47,999 itself. Running the early warning first on that shared
tick means the authoritative review's write, which can reach `High`, is the
one left standing; had the order been reversed the outcome at that tick would
be identical (the authoritative review does not read what the early warning
wrote), so the order is chosen for legibility rather than correctness.
`tests/determinism/kernel-system-order.test.ts`'s pinned list is extended with
this row, following that file's own precedent for a reviewed insertion.

## What this does not decide

Everything the standing #788 research record already handed to the owner and
that this ADR does not re-open:

1. **Whether ~20 in-game days is the right pacing for `High`.** The owner has
   ruled it is. This decision is built to leave that arithmetic untouched, not
   to relitigate it.
2. **Whether `priorIncidents` should ever get a non-zero source.** Untouched.
   `classification-early-warning-system.ts` reads `priorIncidentsAtIntake`
   through the same `reviewClassification` call the authoritative review
   makes, and both still read the same permanently-zero field.
3. **The tier-badge copy gap** (`createStatusBadge` carries no `title`, no
   screen-reader text). `AGENTS.md`'s fourth exclusion reserves new
   player-facing copy to the owner; this decision makes the gap wider in
   practical terms — a prisoner can now sit at an unexplained `Medium` for
   roughly eighteen in-game days where before that word never appeared in a
   neglect run at all — but the copy itself is not this document's to write.

## Consequences

- **A neglected prison now shows three tiers in sequence rather than two.**
  Proven on the real kernel in
  `tests/integration/risk-tier-neglect-reachability.test.ts`: `Medium`
  observed at tick 4,800, `High` still at tick 48,000 (both in that file's
  post-step tick-reading convention), a gap of 43,200 ticks.
- **The well-run control is unaffected.** Same test file: zero incidents,
  `ClassificationEarlyWarningSystem.getMetrics().warningsIssued === 0` over the
  full 50,000-tick window — the early warning never had evidence to raise
  anyone from, and the persisted tier settles at `Minimal` exactly as it did
  before this ADR.
- **Cell-sharing placement reads an earlier, more accurate tier.**
  `rateCellSharing`'s one term is the worst classification distance across a
  cell's occupants (ADR 0032 decision 5), consulted at every new admission. A
  prisoner correctly raised to `Medium` on day 2 instead of remaining
  (incorrectly stale at) `Low` until day 20 changes which cell the *next*
  admission is offered, in the direction of more accurate information reaching
  that decision sooner. This is a real, if minor, behavioural change outside
  the risk-tier ladder itself, named rather than smoothed over.
- **A tenth of the evidence-fold cost, run ten times more often.**
  `buildDisciplinaryIndex` is a full scan of `IncidentLog` and
  `ConfiscationLedger` (ADR 0032's own consequences already name this cost for
  the authoritative review, and decline to optimise it pre-emptively: *"if the
  log grows to where [this cadence] is too often, the answer is a
  per-participant index in `IncidentLog`, not a change to any decision here"*).
  Running it daily instead of every ten days multiplies that cost by ten. No
  benchmark is included in this pass; the honest position is that this is the
  same kind of cost ADR 0032 already accepted and gave itself the same escape
  hatch for, not a newly-taken risk.
- **`ClassificationReviewSystem`'s own docblock and ADR 0032's "Consequences"
  section both describe a prisoner going from tier 0 straight to tier 3 "at
  their next review" as the example of the loop closing.** That sentence is
  now only half the story for a prisoner admitted in a session's first ten
  days: `ClassificationEarlyWarningSystem` will, in the overwhelming majority
  of neglect scenarios, have already raised them to `Medium` well before that
  review fires. Marked in both places (`classification-review-system.ts`'s
  class docblock, ADR 0032 is left as written since its own text is a
  historical measurement rather than a forward-looking claim) rather than
  silently superseded.
