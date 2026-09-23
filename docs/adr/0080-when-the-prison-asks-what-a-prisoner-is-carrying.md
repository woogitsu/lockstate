# ADR 0080: When the prison asks what a prisoner is carrying

> **0080 was recomputed off disk and swept across every remote head**, which is
> the practice `AGENTS.md` records: *"A number is not reserved until it appears
> in `docs/adr/README.md`."* `docs/adr/README.md` read `Next free number: 0080`;
> the maximum on disk was 0079; and the sweep was **performed rather than
> asserted**, over all **980 refs** returned by `git ls-remote --refs origin` —
> the maximum ADR number on any of them, `main`, `agent/*` and `wip/*` alike,
> is 0079. All three answers agree at 0080. **The number is nonetheless
> provisional**: if it collides with an ADR landing from another branch, this
> file, its row in the index and every citation of it in
> `src/simulation/prisoners/classification-review-system.ts` and
> `src/simulation/prisoners/prisoner-operations-runtime.ts` get renumbered
> together.

## Status

**Accepted, 2026-08-30, on the owner's ruling on
[#677](https://github.com/matmaxalez/lockstate/issues/677) — and superseded in
one part by the same ruling.**

**This is not a self-approval.** The document was offered as one of four
answers — this decision as written, the priors distribution instead, both, or
neither — and the owner ruled, in a comment on #677 dated 2026-08-30 titled
*"Owner ruling, 2026-08-30 — both shapes, not one"*:

> **The ruling is both:**
>
> 1. **The review that raises a prisoner into tier 3 asks what they are
>    carrying** — ADR 0080's decision, unchanged.
> 2. **`priorIncidents` moves off zero** — the shape ADR 0080 explicitly
>    declined to take (*"`priorIncidents` does not move, and no balance value is
>    decided here"*).
>
> So ADR 0080 is accepted **and** superseded in one part, and it has to be
> amended to say so rather than left reading as if the second shape was refused.
> That amendment is not a rewrite: its measurement, its decision 2 (only the
> step *into* tier 3) and its refusal to draw on every tier increase all survive
> untouched.

**So decisions 1, 2 and 4 are accepted as written. Decision 3 is superseded in
its first half and stands in its second**, and it is marked in both directions
below rather than overwritten — the practice `docs/AGENT_WORKFLOW.md` §4
requires, because the reasoning that declined the second shape has not become
wrong, only outranked. **The magnitude is still not decided**, by the owner's
own words in the same ruling: *"**Decided:** both mechanisms exist. **Not
decided: the magnitude**, and it is deliberately not mine."*

**What this Status section said while the document was `Proposed`, kept because
it records what was actually offered:**

> **Proposed, 2026-08-30. Not self-approved, and not accepted.**
>
> ... The implementation is on the same branch as this document, in a
> **separate commit**, so it can be dropped on its own if the owner decides the
> other way — the practice [ADR 0061](./0061-what-the-prison-produces-on-its-own.md)
> records about itself: *"This records a decision that has been built ... The
> reasoning below is the whole of the warrant, and a reader who disagrees with
> any of it should treat that decision as open."*
>
> **The decision the owner has to make, in one sentence:** should a prisoner the
> prison re-classifies as high risk be asked what they are carrying — or should
> `contraband.weapon` stay a catalogue entry that no prison can produce until
> somebody decides what `priorIncidents` ought to be?

The answer to that question is *both*, and the separate-commit property it
describes is now spent rather than false: the implementation
(`ee4c0b6` and its fixture half `3bf9505`) stays a separate commit from this
document (`d124548`, `256e022`) because that is how the branch was built, not
because it is still waiting to be dropped.

It answers [issue #677](https://github.com/matmaxalez/lockstate/issues/677),
which falls out of the [#540](https://github.com/matmaxalez/lockstate/issues/540)
measurement recorded in
the research note [#676](https://github.com/matmaxalez/lockstate/pull/676)
carries (*Tier 3 at intake, and the weapon nobody can smuggle*, not yet on
`main`).

## Context

### The fifth slot has no producer, and that is arithmetic rather than a rate

Three constants and one call site, each verified at the line on `898a16a`
(v0.0.252) independently of #676's record:

1. **The eligible band is a prefix of an ascending-severity ordering.**
   `eligibleContrabandCategories` takes the
   `categoriesAtTierZero + categoriesPerRiskTier * riskTier` least severe
   entries (`src/simulation/contraband/introduction.ts:250`), and
   `DEFAULT_CONTRABAND_INTRODUCTION_POLICY` is `2 + 1 x tier` (`:200-205`).
   Severities in `src/content/contraband-catalog.ts:40-44` are weapon 9, drug 7,
   tool 6, phone 4, currency 2, so the order is currency < phone < tool < drug <
   weapon and the **fifth slot opens at tier 3 alone**. Printed from the shipped
   catalogue rather than derived:

   ```
   tier 0: contraband.currency, contraband.phone
   tier 1: + contraband.tool
   tier 2: + contraband.drug
   tier 3: + contraband.weapon
   ```

2. **The band is asked exactly once, and it is asked with the intake tier.**
   `grep -rn "\.introduce(" src/` returns two lines: `introduction.ts:294`
   (inside `introduceContrabandOnIntake`) and `intake-system.ts:502`, which
   calls the injected `IntakeContrabandIntroducer` port with `result.riskTier`
   — the tier `classifyPrisoner` returned one statement earlier at `:491`. The
   port is wired in `src/simulation/runtime/new-session.ts:551`, and that
   closure is `introduceContrabandOnIntake`'s only caller in `src/`.

   > **A small correction to #677 and to #676's §7, in both directions.** Both
   > say `introduceContrabandOnIntake`'s *"exactly one caller"* is
   > `intake-system.ts:502`. There is a hop between them: `intake-system.ts:502`
   > calls the **port**, and `new-session.ts:531` is the composition root's
   > implementation of that port, which is what calls the function. The claim
   > those sentences were making — one call site, reading the intake tier — is
   > unchanged and correct.

3. **`classifyPrisoner` at `priorIncidents: 0` cannot return 3.** The score is
   `(sentence >= LONG_SENTENCE_THRESHOLD_TICKS ? 1 : 0) + min(2, max(0, priors))
   + screeningVariance` with the variance in `{-1, 0, +1}`
   (`src/simulation/prisoners/classification.ts:89-95`), so the maximum is
   `1 + 0 + 1 = 2` and `clampTier` cannot raise it. `src/main.ts:899` pins
   `const ADMISSION_REQUEST = { priorIncidents: 0 } as const`, and that is the
   only admission a player can make.

Enumerated exhaustively over the whole intake space — 77 drawable sentence
lengths (14 to 90 in-game days, ADR 0079) times 3 screening outcomes, weighted:

| tier | share of admissions |
| --- | --- |
| 0 | **63.64 %** |
| 1 | **33.33 %** |
| 2 | **3.03 %** |
| 3 | **0.00 %** |

Seven of the 77 lengths (84 days and up) clear the 200,000-tick threshold, which
is where the 3.03 % comes from. The independent enumeration here reproduces
#676's figures exactly.

**So the tier-3-only item is not rare, it is unreachable**, and has been for as
long as `ADMISSION_REQUEST` has pinned `priorIncidents: 0`. Measured to
confirm the arithmetic rather than to establish it: **zero `contraband.weapon`
across eleven `priorIncidents: 0` prisons run for 300 in-game days each.**

### What the code promises a player, and does not keep

Three statements, all shipped:

- `contraband.weapon` is one of five entries in
  `src/content/contraband-catalog.ts`, with a `contraband.weapon.name` locale
  key behind it.
- [ADR 0061](./0061-what-the-prison-produces-on-its-own.md) decision 1 says of
  the introduction rule: *"The chance rises with the tier (0.10 at tier 0, 0.40
  at tier 3) and so does the band of the catalogue they can draw from: the
  eligible set is the `2 + tier` least severe entries in `severity` order, so
  only an arrival classified high risk can bring a weapon in."* And
  `introduction.ts`'s own docblock, on the same rule: *"Only the arrival the
  player classified as high risk can bring a weapon in, and that is the point of
  reading the tier at all."* **Neither figure is reachable.**
  `contrabandIntroductionProbability` is `0.1 + 0.1 * tier` over a tier that
  tops out at 2, so it caps at **0.30**, and the weapon has no producer at
  all. (This also corrects #643's inventory row 7, which recorded
  the cap as 0.2 — correct at the old sentence range, where tier 2 was itself
  unreachable, and superseded by ADR 0079.)
- The HUD labels a tier-3 prisoner `High` and their regime row `warning`. Both
  of those *are* reachable, which is what makes the gap a broken promise rather
  than a dormant feature: a player is told a prisoner is high risk, is told the
  high-risk regime is in force, and the one consequence the fiction attaches to
  that never happens.

This is `AGENTS.md`'s fourth exclusion read from the other side — *"Anything
that reaches a player as a promise the code does not keep"* — which is why the
issue was filed separately from #540 and why this is an ADR rather than an
edit.

### Which of #677's three gates are actually dead — one of the three is not

#677 lists three consumers that *"read the tier at the classification stage
rather than the current one"*: the weapon band, the introduction probability,
and the solitary-first intake accommodation preference. **The first two survive
this pass. The third does not, and the correction is recorded here rather than
in a footnote.**

The accommodation preference lives in `DEFAULT_ACCOMMODATION_POLICY`
(`src/simulation/prisoners/intake-system.ts:98-102`), which returns
`[SOLITARY_CELL, CELL]` for `'high-risk'`. The `'accommodation-assignment'`
stage reads `classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!)`
**freshly, on every scheduled retry** — and `'accommodation-assignment'` is one
of the two entries in `ClassificationReviewSystem`'s `REVIEWABLE_STAGES`. So a
prisoner still queued for a bed one review period after classification is
reviewed, their group is rewritten, and the *next* retry of the accommodation
stage reads the promoted group. Nothing about it is frozen at intake; what makes
it rare is scheduling — the stage normally completes long before the first
review can fire at 24,000 ticks.

Measured on an **unmodified `main` tree**, `priorIncidents: 0`, 300 in-game days:

| prison | beds assigned while `general-population` | beds assigned while `high-risk` |
| --- | --- | --- |
| 12 cells, 0 guards, 1 admission/day | 79 | **9** |
| 40 cells, 8 guards, 1 admission/day | 226 | **4** |

And with the preference given something to choose between — 10 ordinary cells
and 2 solitary cells, same 300 days, same `priorIncidents: 0`:

```
placements: {"general-population -> room.cell": 70, "high-risk -> room.solitary-cell": 21}
```

**Twenty-one prisoners were routed into `room.solitary-cell` by that preference,
in a tree with no change applied.** The gate is alive. #677's item 3 is
withdrawn; its items 1 and 2 stand.

### `priorIncidents: 0` is an abstention, not a placeholder

Quoted rather than paraphrased, from the `src/main.ts` docblock `1db8c16` (#306)
introduced: *"Neither number is a balance decision this file is entitled to
make, so both are deliberately the least eventful values in range rather than
interesting ones"*. (#677 attributes that sentence to `1db8c16` without saying
where in it: it is the code comment, not the commit message, and the commit
message's own account of the same abstention is the paragraph beginning *"ADR
0028's classification hole is measured and left open rather than claimed
closed"*. The sentence has since been rewritten in place; `git show
1db8c16:src/main.ts` is where the original stands.) The other half of that same `as const` went
#541 → #593 → ADR 0079 rather than being changed in place. The defensive half of
that commit's reasoning has since retired — `hasAccommodationTarget` asks for
every group and `DEFAULT_ACCOMMODATION_POLICY` lists both housing types for
both, so a high-risk arrival can no longer be stranded at the terminal
`'failed'` stage — but the abstention itself has not, and ADR 0017 decision 5
routes balance values to [#29](https://github.com/matmaxalez/lockstate/issues/29).

## Decision

### 1. The review that raises a prisoner **into** tier 3 asks what they are carrying

`ClassificationReviewSystem` takes the same optional
`IntakeContrabandIntroducer` port `IntakeSystem` takes, and calls it with the
tier that is current at that review. The rule stays in
`src/simulation/contraband/introduction.ts`; the review system supplies an
entity, a tier, a tick and a stream, and decides nothing about what an arrival
brings.

This is #677's first shape — *read the current tier where the gate is asked* —
in the only form the gate admits. The band is not a value some later reader
looks up; it is a **question asked once**, and "reading the current tier" for a
question asked at intake can only mean asking it again when the tier changes.
Nothing about the intake draw moves.

### 2. Only the step **into** tier 3, and not every tier increase

Every lower step of the `2 + tier` band already has a producer at intake — tier
1 and tier 2 are 33.33 % and 3.03 % of admissions — so a draw on a 0 → 1 review
would add contraband in prisons where no category has changed hands, and would
advance `contraband.introduction` under every later admission for nothing.

Measured, and this is the argument rather than a preference: over four seeds of a
40-cell, 8-guard, fully-amenitied prison taking one arrival every two days, the
condition in decision 2 leaves the contraband that prison produces **exactly as
it is today** (19 → 19, 29 → 29, 27 → 27, 13 → 14 items; zero weapons before and
after; incident counts unchanged). Drawing on every increase instead perturbs
three of those four. A well-run prison should not be able to tell this decision
happened.

The threshold is `ESCALATION_INTRODUCTION_MINIMUM_TIER = 3`, and **it is not a
balance number**: it is the tier at which the band first admits a fifth entry,
which is a fact about `2 + tier` and the shipped catalogue, not a rate somebody
picked.

### 3. `priorIncidents` does not move, and no balance value is decided here — **the first half is superseded, the second stands**

**What this decision said when the document was `Proposed`, kept whole because
half of it is still in force:**

> #677's second shape — decide the priors distribution — is **not taken**. It is
> a balance decision, ADR 0017 decision 5 and #29 own it, and it is not needed:
> decision 1 gives the fifth slot a producer without it. The numbers are set out
> under *The other shape, priced* so the owner can overrule this on evidence
> rather than on absence.

**The owner overruled it on the evidence, which is exactly what that last
sentence asked for.** The ruling of 2026-08-30 takes **both** shapes:
`priorIncidents` moves off zero, *and* the review that raises a prisoner into
tier 3 asks what they are carrying. The two halves of the heading above
therefore now point in different directions, and both are stated rather than one
being deleted:

- **Superseded: *"`priorIncidents` does not move".*** It moves. That is the
  owner's ruling and not this document's finding, and the reasoning that
  declined it — that decision 1 does not *need* it — is not thereby wrong. It
  was an argument about sufficiency, and the ruling is about what the game
  should be, which outranks it. *"It is not needed"* survives as a true
  statement about the mechanism and stops being a reason.
- **Standing: *"no balance value is decided here".*** Unchanged, and reinforced
  by the ruling in the same breath — *"Not decided: the magnitude, and it is
  deliberately not mine"*. ADR 0017 decision 5 and
  [#29](https://github.com/matmaxalez/lockstate/issues/29) still own every value
  of this kind. **This document therefore names no distribution**, and nothing
  in `src/` sets one: `src/main.ts`'s `ADMISSION_REQUEST` still reads
  `{ priorIncidents: 0 }`, and moving it is a separate change under #29 with its
  own new named-RNG stream (see *A distribution is also new state*, below,
  which is unamended and is the cost of that change rather than of this one).
- **Also standing, and worth saying because the ruling did not touch it:** the
  *shape* of what a moved `priorIncidents` costs. The eight candidates are
  priced in isolation under *The other shape, priced* and **re-priced with this
  decision in force** under *The other shape, measured beside this one* — which
  is the section the ruling asked for, because every figure in the first table
  was taken at `priorIncidents: 0`.

**Nothing else in this document moves.** Decision 1, decision 2 (only the step
*into* tier 3), decision 4, the whole *Measurement* section and *Alternatives
considered* 3 (drawing on every tier increase, rejected on measurement) are
accepted as written, which the ruling says in terms.

### 4. Nothing else moves

No threshold, probability, band width, sentence range, review interval, save
version or player-facing string. `SAVE_SCHEMA_VERSION` stays 5.

## The other shape, priced

What a non-zero `priorIncidents` would do to the intake tier distribution, and
to the arrival's chance of carrying a weapon through the gate. Exact, enumerated
over the same 77 x 3 intake space rather than sampled, and the introduction
figures verified empirically at 200,000 draws per tier
(tier 3: 39.97 % introduced, of which `contraband.weapon` was 16,146 of 79,942 —
uniform over five, as `eligible[rng.nextInt(eligible.length)]` says it is):

| `priorIncidents` distribution | t0 | t1 | t2 | **t3** | P(carrying anything) | P(weapon) | weapons / 149 admissions | / 299 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **always 0 (today)** | 63.64 | 33.33 | 3.03 | **0.00** | 13.94 % | **0.000 %** | 0.00 | 0.00 |
| 90 % / 8 % / 2 % | 59.70 | 33.27 | 6.06 | **0.97** | 14.83 % | 0.078 % | 0.12 | 0.23 |
| 80 % / 15 % / 5 % | 55.45 | 33.18 | 9.09 | **2.27** | 15.82 % | 0.182 % | 0.27 | 0.54 |
| 70 % / 25 % / 5 % | 52.12 | 33.18 | 12.12 | **2.58** | 16.52 % | 0.206 % | 0.31 | 0.62 |
| 60 % / 30 % / 10 % | 47.27 | 33.03 | 15.15 | **4.55** | 17.70 % | 0.364 % | 0.54 | 1.09 |
| 50 % / 35 % / 15 % | 42.42 | 32.88 | 18.18 | **6.52** | 18.88 % | 0.521 % | 0.78 | 1.56 |
| always 1 | 30.30 | 33.33 | 33.33 | **3.03** | 20.91 % | 0.242 % | 0.36 | 0.72 |
| always 2 | 0.00 | 30.30 | 33.33 | **36.36** | 30.61 % | 2.909 % | 4.33 | 8.70 |

Three things that table says and a prose argument would not:

- **`always 1` is the smallest change that gives the fifth slot a producer at
  all**, and it buys 0.72 weapons per 299 admissions — about **one weapon every
  600 in-game days** at the harness's admission rate. That is not a mechanic a
  player would ever notice.
- **`always 2` is a different game.** It puts 36 % of arrivals at tier 3 on the
  day they walk in, which means the high-risk regime — confined for 2,200 of the
  day's 2,400 ticks — is the default experience rather than a consequence.
- **Every intermediate distribution moves tiers 1 and 2 far more than tier 3.**
  A weighted draw that reaches a defensible weapon rate has already tripled or
  quintupled the tier-2 population, which is a bigger balance change than the
  one it was chosen for.

**A distribution is also new state.** `priorIncidents` reaches the simulation
through `AdmitPrisoner` (`admitPrisonerSchema`), so "the simulation decides"
means a **fourth named RNG stream draw at the command boundary or at the
reception stage**, ordered against the sentence draw and the classification
draw. That is a determinism-fingerprint change and a stream registration, not a
constant edit — a further reason it belongs in its own ruling.

## The other shape, measured beside this one

**This section is what the owner's ruling of 2026-08-30 asked for, and it exists
because the table above cannot be chosen from**: *"Every figure in ADR 0080 was
taken with `priorIncidents` pinned at 0. **Nothing has measured the two
mechanisms together**"*. The whole record — per-seed figures, the harness, and
the validation that it reproduces this document's own Measurement table exactly
— is
[the 2026-08-30 research note](../research/2026-08-30-both-shapes-measured-together.md).
What follows is the part a decision needs.

**Method, in one paragraph.** ADR 0080's decision in force; the same three
prison shapes as *Measurement*; 300 in-game days over six seeds, and the
well-built prison again over **600 days and ten seeds**; `priorIncidents` varied
**on the `AdmitPrisoner` command**, which `admitPrisonerSchema` has always
accepted, so **no production constant moves and nothing is wired** —
`src/main.ts:899` still reads `{ priorIncidents: 0 }`. Each contraband item is
attributed to the producer that minted it by comparing
`provenance.introducedAtTick` with the holder's classification tick, which is
what makes the interaction question answerable exactly rather than by a
counterfactual run.

### The ruling's expectation is refuted: the two producers are mutually exclusive

The ruling reasoned that *"more prisoners arrive at tier 2 and reach tier 3
sooner — which feeds the same review gate ADR 0080 just armed"*. The first half
is true; the second does not follow, and the reason is decision 1's own guard:
the review asks the introduction question only when
`assessment.riskTier > previousTier`
(`src/simulation/prisoners/classification-review-system.ts:370`). **A prisoner
who *arrives* at tier 3 is never *raised into* tier 3**, so a non-zero
`priorIncidents` moves prisoners **from** the review producer **to** the intake
producer instead of adding to both.

Measured in the neglected prison, four seeds, 1,196 admissions per candidate:

| `priorIncidents` | weapons | of which intake / review | escape attempts | riots | ever tier 3 |
| --- | --- | --- | --- | --- | --- |
| **always 0 (today)** | 74 | 0 / 74 | 223 | 592 | 1,129 |
| 90 / 8 / 2 | 74 | 0 / 74 | 224 | 592 | 1,129 |
| 80 / 15 / 5 | 78 | 0 / 78 | 223 | 590 | 1,131 |
| 70 / 25 / 5 | 78 | 1 / 77 | 222 | 590 | 1,131 |
| 60 / 30 / 10 | 74 | 3 / 71 | 224 | 590 | 1,132 |
| 50 / 35 / 15 | 70 | 2 / 68 | 225 | 590 | 1,131 |
| always 1 | 79 | 3 / 76 | 224 | 591 | 1,132 |
| always 2 | 93 | 38 / 55 | 235 | 589 | 1,153 |

**The totals are flat and the split swings.** Riots move by three across the
whole range; escape attempts by twelve, which is less than one seed's noise
(the four seeds at `always 0` give 56 / 56 / 55 / 56). The under-built prison
says the same: weapons 43, 51, 44, 42, 39, 42, 39, 39. **The reason is
saturation** — the neglected prison already promotes 94 % of its admissions, so
opening the gate earlier changes *when* a prisoner is asked, not *whether*.

**So this document's *"30 → 56 escape attempts"* is the whole of the change in a
failing prison, and no distribution adds to it.**

### The well-run prison can tell — and it is the priors half it can tell, not this one

Decision 2 rests on *"A well-run prison should not be able to tell this decision
happened."* Re-measured at seven times the exposure it was originally taken at —
ten seeds, 600 in-game days, 2,990 admissions per candidate:

| `priorIncidents` | weapons | intake / review | contraband | of which review | escape attempts | **escaped** | riots | ever tier 3 | seeds with a weapon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **always 0 (today)** | **0** | 0 / 0 | 414 | **0** | **0** | **0** | 0 | 1 | **0 / 10** |
| 90 / 8 / 2 | 2 | 2 / 0 | 427 | 1 | 2 | **0** | 0 | 25 | 2 / 10 |
| 80 / 15 / 5 | 10 | 9 / 1 | 471 | 6 | 9 | **0** | 0 | 84 | 8 / 10 |
| 70 / 25 / 5 | 10 | 9 / 1 | 478 | 2 | 9 | **0** | 0 | 92 | 7 / 10 |
| 60 / 30 / 10 | 16 | 14 / 2 | 503 | 5 | 14 | **0** | 0 | 160 | 8 / 10 |
| 50 / 35 / 15 | 18 | 10 / 8 | 546 | 18 | 10 | **0** | 0 | 215 | 10 / 10 |
| always 1 | 9 | 8 / 1 | 591 | 6 | 8 | **0** | 0 | 104 | 7 / 10 |

**Three things, and the first strengthens this document rather than correcting
it.**

- **At `priorIncidents: 0` the invariant holds far beyond what was claimed for
  it**: zero weapons, zero escape attempts, zero riots and **zero items from the
  review producer** over 2,990 admissions and 6,000 in-game days, with exactly
  one prisoner in ten runs ever reaching tier 3. *What would change my mind*
  named four seeds of one shape as the weakness; ten seeds of twice the length
  do not move it.
- **Every non-zero candidate breaks it, and four of every five weapons that
  break it — 52 of 65 — were introduced at intake.** The review producer
  contributed 1 item of 427 at `90/8/2`, 6 of 471 at `80/15/5`, 5 of 503 at
  `60/30/10` and 18 of 546 at `50/35/15`. **Decision 2's guarantee survives the
  priors change intact**; what a well-run prison can now tell is that its
  *intake* changed.
- **It never loses anybody.** `escaped` is **0** in all seventy of those runs and
  in all forty-eight 300-day well-built runs, `always 2` included. The escape
  attempts a weapon opens are all contained — the general form of *One guard is
  the whole difference* below.

### One correction to this document, in both directions, and a dominance result

*The other shape, priced* says: **"Every intermediate distribution moves tiers 1
and 2 far more than tier 3."** **The tier-2 half stands; the tier-1 half does
not, and is corrected here rather than overwritten.** Tier 1 is 33.33 % today
and 33.27, 33.18, 33.18, 33.03, 32.88, 33.33 and 30.30 % across the eight
candidates — **pinned within a point everywhere except `always 2`**, because the
screening variance is uniform over `{-1, 0, +1}`. Only tier 2 is collateral.

With tier 1 out of it the trade is one ratio, **tier-2 points spent per tier-3
point bought**, and it says something the original table did not:

| distribution | +t2 | **+t3** | t2 per t3 |
| --- | --- | --- | --- |
| 90 / 8 / 2 | 3.03 | **0.97** | 3.12 |
| 80 / 15 / 5 | 6.06 | **2.27** | **2.67** |
| 70 / 25 / 5 | 9.09 | **2.58** | 3.52 |
| 60 / 30 / 10 | 12.12 | **4.55** | **2.66** |
| 50 / 35 / 15 | 15.15 | **6.52** | 2.32 |
| **always 1** | 30.30 | **3.03** | **10.00** |
| always 2 | 30.30 | **36.36** | 0.83 |

**`always 1` spends ten tier-2 points per tier-3 point, nearly four times the
worst weighted candidate.** This document calls it *"the smallest change that
gives the fifth slot a producer at all"* — true of the **edit**, and not of the
**cost**. **`60/30/10` strictly dominates it**, in the enumeration and in the
measurement alike: more tier 3 (4.55 % vs 3.03 %; 160 prisoners vs 104), more
weapons (16 vs 9), and **less** total contraband (503 items vs 591), with
`escaped` 0 and riots 0 in both.

### The costed choice, which is the owner's to make

**Recommended: `60/30/10`** — 60 % of arrivals with no prior incident, 30 % with
one, 10 % with two. **This document still decides nothing** (decision 3's second
half, and the ruling's own *"Not decided: the magnitude"*); it is a costed
recommendation for [#29](https://github.com/matmaxalez/lockstate/issues/29).

Why that one, in the order it decides the question:

1. **The number is a choice about the well-run prison and nothing else** — the
   failing prisons cannot feel any candidate below `always 2`.
2. **A prison that promotes nobody still cannot produce a weapon** under
   decision 1 alone, which is the 0 in the `always 0` row above and the half of
   the promise the ruling's second shape exists to keep.
3. **`60/30/10` closes it at a rate that exists without becoming the game**: one
   weapon per ~190 admissions, 8 of 10 well-run prisons seeing one within 600
   in-game days. `90/8/2` reaches 2 of 10, which is barely a producer.
4. **The high-risk regime stays a consequence**: 4.55 % of arrivals at tier 3,
   against `always 2`'s 36.36 % — and `always 2` measured in the *well-built*
   prison doubles its contraband, 126 → 283, with 23 escape attempts.
5. **It never costs a well-run player a prisoner**, measured.
6. **It is not dominated**, and `always 1` is.

**The conservative alternative is `80/15/5`** — 10 weapons rather than 16, tier
2 at 9.09 % rather than 15.15 %, the best ratio of the safe candidates. The
evidence supports both; the difference is a taste about frequency, which is the
part that is not this document's.

**What is weakest in all of it:** nothing here was measured in a browser, and
**no module under `src/ui/` renders a contraband category** — a confiscated
weapon and a confiscated phone are the same event on screen. So *"one weapon per
370 in-game days"* is a claim about a registry, not about anything a player
notices, and the frequency argument in point 3 is the softest part. A readout
that names what was found would change it.

## Measurement

Eleven prisons, 300 in-game days each (720,000 ticks), `priorIncidents: 0`
throughout, driven through the real kernel by real commands. "Today" is
`898a16a`; "decision" is the same tree with decisions 1 and 2 applied.

| prison | ever tier 3 | contraband items | **weapons** | escape attempts | riots |
| --- | --- | --- | --- | --- | --- |
| **Well built** — 40 cells, 8 guards, shower/canteen/yard, 1 arrival / 2 days | | | | | |
| seed `0x0cc0` | 0 → 0 | 19 → **19** | 0 → **0** | 0 → 0 | 0 → 0 |
| seed `0x51a7` | 0 → 0 | 29 → **29** | 0 → **0** | 0 → 0 | 0 → 0 |
| seed `0x2f19` | 0 → 0 | 27 → **27** | 0 → **0** | 0 → 0 | 0 → 0 |
| seed `0x77aa` | 1 → 1 | 13 → 14 | 0 → **0** | 0 → 0 | 0 → 0 |
| **Well equipped, over-admitted** — the same prison at 1 arrival / day (peak 59 in 40 cells) | | | | | |
| seed `0x0cc0` | 30 → 27 | 42 → 55 | 0 → **0** | 0 → 0 | 0 → 0 |
| seed `0x51a7` | 25 → 21 | 45 → 51 | 0 → **1** | 0 → 0 | 0 → 0 |
| seed `0x2f19` | 20 → 21 | 47 → 55 | 0 → **0** | 0 → 0 | 0 → 0 |
| seed `0x77aa` | 24 → 28 | 35 → 44 | 0 → **3** | 0 → 0 | 0 → 0 |
| **Under-built** — 12 cells, 2 guards, amenities, 1 arrival / 2 days (32 prisoners, 12 beds) | 139 → 138 | 19 → 74 | 0 → **15** | 1 → 13 | 124 → 105 |
| **Under-built, over-admitted** — 12 cells, 2 guards, amenities, 1 arrival / day | 281 → 281 | 42 → 147 | 0 → **19** | 13 → 46 | 137 → 137 |
| **Neglected** — 12 bare cells, no amenities, no guards, 1 arrival / day | 283 → 283 | 42 → 145 | 0 → **18** | 30 → 56 | 148 → 148 |

**The shape of that table is the whole argument, and it is the answer to the
owner's standing design directive** — *"gra ma być łatwa przyjazna do grania, a
nie jakieś ukryte funkcje"*. A prison with enough beds and enough guards
promotes nobody to tier 3, so nothing is asked, nothing is drawn, and the
contraband it produces is **bit-for-bit what it produces today** on three of
four seeds and one item different on the fourth. The weapons appear in prisons
that are already failing on their own terms: the under-built one was running 124
riots before this change and the neglected one 148. A player who builds cells
and hires guards never meets this decision at all; a player who does not was
already losing.

**Two costs the table also shows, stated rather than buried.**

- **Escape attempts rise where contraband appears in an under-staffed prison** —
  1 → 13, 13 → 46, 30 → 56.
  That is not contraband quantity, it is the `canAttemptEscape` predicate:
  `flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0`
  (`src/simulation/incidents/flashpoint.ts:281-282`). Today its two conditions are
  asked 24,000 ticks apart — the tier at a review, the contraband at intake —
  so they co-occur only by luck. Decision 1 makes them co-occur by construction
  in exactly the prisons that earned it. **The escape mechanic being reachable
  at all is #659's, not this decision's**; what changes here is its rate in a
  failing prison.
- **Assaults rise in the under-built prison** (34 → 111, and 12 → 12 in the
  over-admitted one). Contraband feeds `contrabandSeverity`, which is a term in
  both the sector-risk and the flashpoint scores. In the four well-built prisons
  the assault count is unchanged.

### One guard is the whole difference, and an existing fixture is what proved it

The escape rise above is not a rate this decision tunes; it is the
`canAttemptEscape` predicate finally having both of its conditions satisfiable
at once. What decides whether that costs a player anything is **staffing**, and
the cleanest measurement of it came from the suite rather than from a harness:
applying this decision turned two cases of
`tests/integration/incident-consequence-loop.test.ts` red, and the diagnosis is
the decision working.

That file builds a one-cell, **zero-guard** prison, riots one prisoner into a
review, and asserts the tier ladder ADR 0032 promises. Under this decision the
review promotes them to 3 *and* the introduction draw gives them a phone, so
`canAttemptEscape` is satisfied, the pressure score clears its threshold, and
the subject of the next two assertions **leaves the prison** — measured on that
fixture's own seed, an `escape-attempt` with `escaped: true` between ticks
48,000 and 72,000, after which `projectPrisonerDetail` returns `undefined` and
the record slot holds a stale 3.

The same fixture, same seed, same commands, varying only the number of guards
hired before the admission:

| guards | tick 48,000 | tick 72,000 | tick 96,000 | tick 120,000 |
| --- | --- | --- | --- | --- |
| **0** | tier 3, phone concealed | **gone — escaped** | gone | gone |
| **1** | tier 3, phone concealed | tier 2 | tier 1 | tier 1 |
| **2** | tier 3, phone concealed | tier 3, **phone confiscated** | tier 2 | tier 1 |

**One guard restores the pre-decision behaviour exactly** — the 3 → 2 → 1 → 1
ladder the test asserted before this decision existed, because
`staffingShortfall` leaves the escape pressure under its threshold. **Two
guards find the phone**, which is a disciplinary finding worth a point and
delays the come-down by one review period, which is the search mechanic doing
what ADR 0073 built it to do.

So the difficulty this decision adds is **purchasable with a single hire**, and
that is the strongest single answer to the owner's directive that this document
has. The fixture was updated to hire one guard in those two cases, with the
reason recorded at the fixture rather than at the call sites, and every other
case in the file stays unguarded.

**Contention, stated rather than assumed** (`docs/AGENT_WORKFLOW.md` §2,
[#667](https://github.com/matmaxalez/lockstate/issues/667)): every run above was
taken on a **busy** four-core machine — load average 8.9, another agent's
Playwright playtest and a full vitest run both live. Nothing above is a timing
measurement. These are `while (kernel.tick < n) kernel.step()` loops with no
wall clock and no timeout, so each number is a function of seed and commands
alone; contention makes them slower and cannot make them different.

## Alternatives considered

1. **Do nothing, and delete `contraband.weapon` from the catalogue.** Honest,
   and cheap. Rejected because the catalogue entry is not the problem — the
   fifth step of `categoriesPerRiskTier` is, and deleting the entry would make
   the band `2 + tier` top out at four categories with the same arithmetic gap
   one step lower. It also throws away authored content and a locale key to
   avoid a four-line change.
2. **Raise `priorIncidents`, or draw it.** Priced above. Rejected *here* as a
   balance ruling that is not this document's, and not needed for the gap.
3. **Draw on every tier increase, not only the step into 3.** Rejected on the
   measurement in decision 2: it perturbs well-run prisons for no gain.
4. **Introduce contraband on a schedule while a prisoner is at tier 3.**
   This is a different and larger mechanic — acquisition in custody, with a
   trade or supply route behind it — and ADR 0061 deliberately built none of it
   ("Two anticipated routes that this repository cannot currently build"). It
   would also make contraband quantity a function of sentence length. Not taken.
5. **Let `SanctionSystem` introduce on a solitary sanction.** Attractive because
   the sanction path is already tier-independent, and rejected because it
   attaches contraband to a *punishment* rather than to a classification, which
   inverts the fiction.

## What this does not decide

- **The `priorIncidents` distribution.** Table above; #29 and ADR 0017 decision
  5 own it. This decision is deliberately compatible with any answer — a
  non-zero `priorIncidents` gives the intake band its own tier-3 producer and
  the review one keeps working beside it.
- **Whether `contrabandIntroductionProbability` should reach 0.40 at intake.**
  It still does not; only a promoted prisoner is asked at tier 3.
- **The item id prefix.** A review-introduced item is still minted
  `contraband.intake.<entityId>.<tick>` by `introduceContrabandOnIntake`, which
  is now a slightly false name for the second caller. Ids stay unique — a
  review cannot fire on the tick a prisoner is classified, because it needs
  24,000 ticks of tenure — and the ids are opaque strings in the save, so
  renaming is safe and purely cosmetic. It is **not** done here, because a
  rename touches the persisted content of new saves for no behavioural reason
  and belongs with whoever next opens that module.
- **Whether a player is ever told a weapon was found.** Nothing in `src/ui/`
  renders a contraband category. This decision adds **no player-facing copy**,
  which `AGENTS.md`'s fourth exclusion requires; the confiscation readout is a
  separate gap.
- **Anything about search or detection rates.** `SearchSystem` and ADR 0073's
  ordering are untouched. In the neglected prison, with no guards, all 18
  weapons went unfound — which is the prison the player built, not a defect
  here.

## What must not be broken

- **Determinism.** The draw is on `contraband.introduction`, the stream intake
  already uses, inside `EntityQuery.execute()`'s canonical ascending walk,
  reading no clock. **`prisoners.classification` is never touched** — that is
  the hazard `reviewClassification`'s note names, and it is the reason the
  system's "No RNG" bullet was written; that bullet is now corrected in both
  directions in the file rather than overwritten, because the hazard is
  unchanged and only the absolute claim was too strong.
- **Idempotence.** `reviewClassification` is absolute rather than incremental,
  and the guard is `assessment.riskTier > previousTier` against the record this
  pass has already written — so a second run of the system at the same tick
  finds no increase, draws nothing, and cannot mint a duplicate item id.
- **Every existing fixture.** The port is optional. A session that supplies no
  introducer draws nothing and behaves exactly as it did, which is every fixture
  under `tests/`.
- **The save format.** `SAVE_SCHEMA_VERSION` stays **5**. No new persisted
  field; a review-introduced item is an ordinary `ContrabandRecord` and the
  stream position is already in `rngStates`.
- **`supabase/migrations/`, `wrangler.jsonc`, `public/_headers` and
  `.github/workflows/deploy.yml` are not touched**, and no Worker entry point is
  added.

## Consequences

- **`contraband.weapon` has a producer**, and `categoriesPerRiskTier`'s fifth
  step stops being dead content — the last of the four steps to get one.
- **The determinism fingerprint moves for any session that promotes somebody to
  tier 3.** The extra draw advances `contraband.introduction`, so what a *later*
  arrival brings in changes. In a prison that promotes nobody the stream never
  advances and nothing changes, which is what the four well-built seeds show.
- **The review mechanic does the work it already looks like it does.** Nine of
  the ten tier-3 gates were reachable by review promotion before this; this is
  the tenth, and #676's sweep is the enumeration.
- **An unguarded prison loses a promoted prisoner.** `canAttemptEscape`'s two
  conditions can now co-occur, so a prison that hires nobody and lets somebody
  reach tier 3 will eventually see a successful escape. One guard is enough to
  put the pressure score back under its threshold, measured above. This is the
  single largest behavioural consequence of the decision and it is the one to
  argue with first.
- **Two cases of `tests/integration/incident-consequence-loop.test.ts` hire a
  guard now**, and the file's own prediction about what that would cost —
  *"Hiring a guard would put it back at 1,000 and would change nothing else
  this file asserts"* — turned out to be exactly right: `safety` moved from 0
  to 1,000 in both arms and nothing else in the file moved. The old paragraph
  is kept beside the new one there rather than overwritten.
- **`ClassificationReviewSystem` is no longer RNG-free.** It was, and its
  docblock said so at length. That claim is now bounded to the stream it was
  ever about.

## What would change my mind

**The weakest claim in this document is the well-built prison's zero.** It rests
on four seeds of one prison shape at one admission cadence, and the mechanism
behind it — "a well-run prison promotes nobody to tier 3" — is a property of
`reviewClassification`'s clean-conduct credit against the incident rate, not of
this decision. If a prison exists that is well run by every measure a player
would recognise and still promotes steadily, this decision hands it weapons and
the table above would not have shown it. **What would settle it:** the same
eleven-prison sweep at a burst admission pattern taken from a real recorded play
session. #676 names the metronome as its own weakest claim for the same reason,
and I did not have a recorded session either.

**Second: the escape-attempt rise is measured on one seed per prison.** 1 → 13,
13 → 46 and 30 → 56 are three single samples, and the *mechanism* is not in
doubt — `canAttemptEscape` needs both conditions and this decision makes them
co-occur — but the *rate* is one draw. If the owner's answer to "how hard should
a neglected prison be" is sensitive to that rate, it needs seeds.

**Third, and it is a limit rather than a doubt: nothing here was measured in a
browser.** These are kernel runs. Whether a player *sees* anything of a
confiscated weapon is row 7 and row 10 of #676's sweep read from source, and the
honest answer to "what does a weapon do that a phone does not" today is: it
raises `contrabandSeverity`, and nothing renders it.
