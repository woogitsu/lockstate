# ADR 0078: What keeps a prisoner safe

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0078, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074 and 0077 each pre-committed.
>
> **The arithmetic, written out rather than asserted**, in the practice ADR
> 0071's preamble records and 0077's follows: the assigner performs the sweep
> and the drafting agent recomputes it. Both halves were done here and, unlike
> 0077's case, they **agree** — which is worth writing down precisely because
> the interesting entries in this history are the disagreements.
>
> - The drafting agent declined to take a number while the work was in flight,
>   for the reason 0065, 0066, 0069 and 0070 each declined: whether a higher
>   number is held on an unmerged branch is a fact about branches a worktree
>   cannot see.
> - The sweep was performed by the integrator across **every** remote head and
>   its output handed over to be re-verified rather than trusted. This agent
>   re-ran it independently after merging current `main`: `origin/main`,
>   `origin/agent/sim-001-stale-routes` and its `wip/` shadow max at **0077**;
>   nothing on any remote head is above 0077.
> - `max + 1` recomputed off disk at commit time, on this branch with `main`
>   merged in, is **0078**. The `Next free number` line said 0078 before this
>   commit. All three agree.
> - **0072 is still held and unwritten** for the events-persistence decision.
>   It is a hold, not a gap, and 0078 clears it as 0073, 0074 and 0077 each did.
>
> **Every citation of this ADR in the code names it by title rather than by
> number**, following 0077's practice and for its reason:
> `grep "What keeps a prisoner safe"` is what finds them. A renumber is then an
> edit to this filename and the index row rather than a hunt through the
> modules.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It implements the owner's ruling on
[#599](https://github.com/matmaxalez/lockstate/issues/599) — *"safety is a bug;
hygiene and recreation are the point"* — through
[#588](https://github.com/matmaxalez/lockstate/issues/588), and records the
three things that ruling deliberately left to the implementation: **which** of
its two dispositions for the 20,400-tick figure, **at what rates**, and whether
the sequencing constraint it calls load-bearing is actually met.

The evidence is `docs/research/2026-08-29-coverage-provisions-the-safety-need.md`,
which carries the measurements at length; this document carries the decision.

## Context

[ADR 0017](./0017-money-primary-resource-model.md) decision 1 pays a prison for
its capacity **and for the ability to keep people in it safely**. Everything
that sentence needs existed before this decision and nothing joined it: security
sectors, a guard roster, a deployment schedule, a `safety` need, and the
three-rung readout [ADR 0048](./0048-what-a-sectors-occupants-are.md)
consequence 1 gave the Staff panel — `Unguarded` → `Understaffed` → `Covered`.
Since [ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md) the state also
withholds part of the prisoner-day grant for each need a place's occupant has at
or below `STATE_INCOME_UNMET_NEED_LEVEL`. The "safely" half had no instrument
between those two facts.

### The premise both issues were argued from has the wrong sign

#588 and #599 both describe the old state as *"the 20,400-tick requirement makes
40 of the withholding a permanent constant that no play can move"*.

**Measured, it was a permanent zero.** `action.sleep` carried
`needEffectsPerTick: { sleep: 2, safety: 0.2 }` — twenty times a decay rate of
0.01 — and a prisoner sleeps about 1,200 ticks of a 2,400-tick day, so a bed
alone returned roughly **+240 a day against −120 of decay**. Any prisoner with a
furnished cell therefore sat at 237 or above indefinitely
(`tests/integration/room-gated-needs.test.ts` pinned `safety: 237.1` as the
*lowest* level over ten in-game days, against a threshold of 51), and the state
withheld **nothing** for `safety` in any prison that had built a cell —
including a completely unguarded one.

`src/simulation/incidents/sector-risk.ts` had already recorded the same fact
from the other side, and it is the load-bearing prior art rather than a
coincidence: `needsPressure` *"used to be the `safety` deficit alone, which
`action.sleep` restores twenty times faster than it decays, so the term was
pinned near zero for anybody with a bed."* It measured homelessness.

Both readings agree on the conclusion the ruling drew — the number was a
constant and no play moved it — and disagree about its sign. The consequence for
this decision is the same either way, and it is the reason the bed's
contribution could not simply stay: **an instrument a bed overrides twenty to
one is not an instrument.** The integrator has corrected the record on #599.

## Decision

### 1. Guard coverage is what provisions the `safety` need

Each tick a prisoner spends in a security sector, `safety` is provisioned at
that sector's coverage rung: **`covered` at the full rate, `understaffed` at
half, `unguarded` at nothing** (`SafetyCoverageSystem`,
`src/simulation/prisoners/safety-coverage-system.ts`). `NeedsDecaySystem` goes
on subtracting regardless, so what coverage decides is the **sign of the net
rate** and not the drain itself.

The rung comes from `resolveSectorCoverageState`
(`src/simulation/security/coverage-state.ts`), which is the Staff panel's own
ladder — a prisoner cannot be provisioned at a rung the panel would not show
them standing on. It is a **second copy and not a shared function**, because
`AGENTS.md` boundary 1 forbids `src/ui/hud/**` from importing
`src/simulation/**`; `tests/unit/security-coverage-state.test.ts` drives both
ladders over the same grid of triples and is the only place the two definitions
may meet.

**Provision only, never drain.** `unguarded` adds zero rather than subtracting.
That is the refinement #588 carries from its source C22 — the premium is
*suspended* and never made negative, so a security lapse cannot manufacture a
debt on top of a decay that is already charged — and it is what keeps the two
systems' arithmetic independent of the order they run in.

### 2. The 20,400-tick figure is discarded *and* demoted, on different rungs

`NEED_DECAY_PER_TICK.safety` rises **0.01 → 0.05**, and
`SAFETY_COVERAGE_PROVISION_PER_TICK` is **0.08**, taken at 1 / 0.5 / 0.

| coverage | provision | net per tick | full to unmet |
| --- | --- | --- | --- |
| `covered` | 0.08 | **+0.03** | never; 1,700 ticks back *out* of the unmet band |
| `understaffed` | 0.04 | **−0.01** | **20,400 ticks** |
| `unguarded` | 0 | **−0.05** | 4,080 ticks |

The ruling offered two dispositions — *"discarded, or demoted to a long-stay
accumulator"* — and at these rates it is **both**. 20,400 is discarded for the
unguarded prison, which now crosses inside `MIN_SENTENCE_LENGTH_TICKS` (4,800),
so every sentence the game draws outlasts it; and it is preserved exactly, to
the tick, as the long-stay accumulator for the understaffed one, where only a
prisoner held more than eight and a half in-game days ever crosses. **A prison
short of guards does not stop being safe; it stops being safe for its
long-stayers.**

> **Three figures in this section and one in *Alternatives considered* rest on
> a sentence range that changed on 2026-08-30**, when the owner ruled on
> [#593](https://github.com/matmaxalez/lockstate/issues/593) and
> [ADR 0079](./0079-a-sentence-long-enough-to-be-a-history.md) made a sentence
> **14 to 90** in-game days rather than 2 to 16. Recorded here rather than
> rewritten, because **decision 2 is unaffected and none of this reopens it**:
>
> - *"crosses inside `MIN_SENTENCE_LENGTH_TICKS` (4,800)"* — that constant is
>   **33,600** now. The conclusion holds a fortiori: every sentence the game
>   draws still outlasts 4,080 ticks, by far more than it did.
> - *"0.09's never accumulates (past the 38,400-tick maximum sentence)"* — this
>   is now **false**. 0.09's accumulator is 40,800 ticks, which is inside all
>   but the shortest eleven of the seventy-seven drawable lengths. It was one of
>   two reasons 0.09 was set aside; the other (legibility against `hunger`'s
>   0.05) is untouched, and no rate is changed here.
> - *"sentences are drawn from 2 to 16 in-game days: more than half the
>   population would leave before an entirely unguarded prison could cost them
>   anything"* (Alternatives considered) — also **false** at the new range: at
>   decay 0.01 the 20,400-tick crossing is inside every drawable sentence. The
>   alternative it rejects would now describe a real population, so **whether
>   decision 2 is still the best answer is a question for the owner rather than
>   a conclusion for this note.** It is raised, not answered.

**The bracket the rate was chosen inside**, so a later balance pass can see what
it is moving within: three rungs stay three distinct outcomes only while
`provision / 2 < decay < provision`. Below the lower bound `understaffed`
recovers and stops costing anything; above the upper, `covered` drains and the
instrument reads backwards. At decay 0.05, with the *half* rate also having to
be representable at `NEED_SCALE`, the entire available range is 0.06, 0.07, 0.08
and 0.09 — accumulators of 10,200, 13,600, 20,400 and 40,800 ticks. 0.09's never
accumulates (past the 38,400-tick maximum sentence); 0.06's and 0.07's are
`hygiene`'s and `recreation`'s own numbers and would read as a coincidence
rather than as a decision.

0.05 is `hunger`'s rate, which is this repository's existing statement of *"a
need a prison must attend to about daily"*.

### 3. `hygiene`'s 10,200 and `recreation`'s 13,600 stand unchanged

The other half of the same ruling, and the reason is quoted from it: *"If you
make all six needs finishable in a few thousand ticks, every prisoner is the
same again."* Nothing here touches either rate, either need's room gating, or
[ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
decision 1.

### 4. No action provisions `safety` any more

`action.sleep` loses `safety: 0.2` for the reason in Context. **`action.yard-recreation`
loses `safety: 0.1` as well**, and this one was got wrong for a draft and is
recorded because the wrong argument is instructive.

The first argument for keeping it was that it is *dominated*: a yard session
returns about 6% of what `safety` now loses in a day, so it is nowhere near a
substitute for a guard. That is true, and it is the wrong argument, because the
term's effect is not on the **need**. It is on **what the prisoner chooses**.
`scoreAction` is deficit × effect summed, so a term worth `d_safety * 0.1` grows
with the deficit — and an unguarded prison now drives that deficit to the top of
its range. Measured on `tests/integration/yard-and-common-room.test.ts`'s
six-prisoner fixture over ten in-game days, with the term still in: yard time
went from **5,872 to 8,588** performing ticks in the minimum yard and from
**7,208 to 13,120** in the enlarged one — the yard climbing over meals, showers
and sleep in the ranking, for a need standing in it barely moves. With the term
removed those read **6,120 and 7,424**, 4% and 3% off the unmodified tree. A
prisoner skipping lunch because they feel unsafe and the yard helps a little is
not a mechanic anybody chose.

**What it costs, recorded rather than hidden:** the yard and the common room now
tie wherever `recreation` alone is full, instead of only where `recreation`
*and* `safety* are both full, so the ascending-id tie-break sends a prisoner who
wants no recreation indoors. Common-room time rises from 1,248 to 4,208 ticks in
that fixture. It is the same "a prisoner who wants nothing" state #532's ceiling
isolates; what moved is how often a prison is in it.

### 5. The status strip attributes the withholding, and adds no new money term

`SafetyCoverageSystem` publishes a three-rung census on the same walk that
provisions the need — a second pass to count what the first just decided would
be a second chance to disagree with it — and it rides the existing
`simulation/status-counts` channel to a `Coverage` chip. Two new locale keys,
`hud.status.coverage` and `hud.status.coverage-detail`; the all-covered case
falls back to the Staff panel's existing `hud.security.coverage-met`.

**No income term and no incident fine.** The 300/40/60 schedule is untouched;
what changed is whether `safety` is one of the needs the existing 40 fires on.
The source of the ruling is explicit: *"Do not also add an incident fine on top
in the same pass."*

## The sequencing constraint, and whether it is met

#588 makes this conditional: *"If incidents still fire every two in-game days
under full coverage, this mechanic punishes the player twice for a rate they
cannot move."*

Seed `0x588`, ten in-game days, 16 prisoners in 8 furnished cells — the
over-capacity shape the brief's claim is about. "Before" was measured in a
**second worktree checked out at the unmodified `05640b6`**, never in the tree
being edited.

| coverage | riots before → after | incidents before → after | peak risk before → after |
| --- | --- | --- | --- |
| `covered` 2 of 2 | **2 → 0** | 7 → 7 | 0.7373 → 0.6538 |
| `understaffed` 1 of 2 | 3 → 4 | 5 → 6 | 0.9018 → 0.9734 |
| `unguarded` 0 of 2 | 4 → 5 | 5 → 6 | 1.0 → 1.0 |

**The constraint is met.** A fully covered prison rioted twice in ten days and
riots zero times now. Two qualifications belong beside that figure:

- **Coverage was not a lever before, and extra guards still are not one.** Two
  guards and four measure identically in both trees, because
  `resolveOccupancyScaledGuardCount` asks for one guard per eight occupants and
  the extras stay unassigned. What changed is that *reaching* the requirement
  now does something.
- **Seven assaults remain under full coverage, unchanged, and nothing here
  touches them.** They come from
  [ADR 0061](./0061-what-the-prison-produces-on-its-own.md)'s per-prisoner
  flashpoint sampler, which reads overcrowding and sentence pressure rather than
  sector coverage — a rate the player *can* move, by building cells. So this is
  not the "punished twice" case. Stated as `docs/AGENT_WORKFLOW.md` §3 requires:
  the rate was measured, it was not diagnosed, and what it costs a player is not
  established here.

On the smaller eight-prisoner fixture the same split reads **0.4824 → 0.4742**
guarded and **0.7981 → 0.9661** unguarded: coverage moved that score by 0.0142
before and moves it by 0.4919 now.

## Consequences

- **Determinism.** No RNG stream is taken and no clock is read
  (`docs/DETERMINISM.md`). The system walks the coverage report, which
  `getCoverageReport` sorts by sector id, and inside each sector
  `resolveSectorOccupants`'s ascending-entity-id list. `provisionSafety` is
  exactly linear in `ticksElapsed` at `NEED_SCALE`, so `intervalTicks` is a
  scheduling choice and not a balance one, exactly as `NeedsDecaySystem`'s is.
- **Persistence.** **No save-format change and nothing new persisted.** The
  census is derived from state the save already carries and is rebuilt on the
  first update after a load — the same argument `IncidentTriggerSystem` makes
  for reading its extra counters off the log rather than adding fields to a
  `.strict()` schema.
- **Ordering.** `order` 275: after `DeploymentSystem` (270) so it reads the
  coverage this tick's assignments produced, and before `IncidentTriggerSystem`
  (285) so the risk sampler reads a `safety` level coverage has moved — which is
  the whole of how coverage comes to suppress incidents.
- **Cost.** One `resolveSectorOccupants` walk per sector per ten ticks — the
  same `O(sectors × population)` shape and cadence `DeploymentSystem` already
  pays through `countSectorOccupants`. About 54 µs a tick amortised at the
  5,000-prisoner ceiling with one sector, a tenth of a percent of the 50 ms
  tick.
- **A design claim elsewhere became half false and is corrected in both
  directions.** `tests/integration/riot-regime-loop.test.ts` said *"nothing in
  guard deployment reaches prisoner action selection"*. Guards now reach one
  thing a prisoner *has*, so its need comparison is scoped to the five needs a
  hire does not change; action selection is still untouched, because nothing in
  `ActionSystem` reads coverage and no action serves `safety` any more.
- **Four contention fixtures now hire guards**, because an unstaffed prison of
  their size riots and a riot regime takes away the actions they measure. The
  resulting numeric churn is caused by the **hire**, verified by applying the
  same `HireStaff` commands to the unmodified tree and reproducing the new
  arrays exactly — a guard standing on the arrival tile changes how a population
  routes to its rooms, which is true on `main` today.

## Alternatives considered

- **Keep `action.sleep`'s `safety: 0.2` and let coverage top it up.** Rejected
  on arithmetic rather than on taste: +240 a day against −120 of decay pins the
  need at `NEED_MAX` in an entirely unguarded prison, so the instrument would be
  dead on arrival. This is the Context section stated as an option.
- **Leave the decay at 0.01 and demote 20,400 to a long-stay accumulator
  only.** This is the ruling's second disposition taken alone. Rejected because
  sentences are drawn from 2 to 16 in-game days: more than half the population
  would leave before an *entirely unguarded* prison could cost them anything,
  and #588's own arithmetic — *"a guard covering three prisoners prevents
  120/day of withhold against an 80/day wage"* — requires the withhold to fire
  on ordinary prisoners. Decision 2 keeps this disposition for the middle rung,
  where it does describe a real population.
- **A provision rate of 0.06 or 0.07.** Both produce three distinct outcomes and
  neither is wrong. Rejected on legibility: their accumulators are `hygiene`'s
  and `recreation`'s numbers. See the weakest claim below.
- **Add an incident fine, or a risk premium suspended by coverage.** Out of
  scope by instruction, and the corpus's own refinement (C22) is already taken
  in decision 1: the provision is suspended rather than made negative.

## What would change my mind

**The weakest claim is the choice between 0.08 and 0.07**, and it is an argument
about legibility rather than about play — either produces three distinct
outcomes and neither needs any structural change. What would move it is a
playtest finding that eight and a half in-game days is too long a fuse for an
understaffed prison to feel any consequence, in which case 0.07 or 0.06 is the
same design at a shorter fuse and only two constants move.

**The second weakest is that the assault rate is not this decision's problem.**
It rests on assaults being driven by overcrowding, which a player can answer by
building cells. That is what ADR 0061's sampler reads, but nobody has measured
whether a player who builds enough cells actually sees the rate fall — and if
they do not, then "the player is punished twice" is true of a different producer
and this decision needs the companion change #588 says it might.

**What this record does not establish at all** is how any of it feels to play.
Every figure here is a tick count off a deterministic run.
