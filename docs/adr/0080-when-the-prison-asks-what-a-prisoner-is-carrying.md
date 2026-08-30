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

**Proposed, 2026-08-30. Not self-approved, and not accepted.**

It answers [issue #677](https://github.com/matmaxalez/lockstate/issues/677),
which falls out of the [#540](https://github.com/matmaxalez/lockstate/issues/540)
measurement recorded in
[`docs/research/2026-08-30-tier-three-at-intake.md`](../research/2026-08-30-tier-three-at-intake.md)
(PR #676). The implementation is on the same branch as this document, in a
**separate commit**, so it can be dropped on its own if the owner decides the
other way — the practice [ADR 0061](./0061-what-the-prison-produces-on-its-own.md)
records about itself: *"This records a decision that has been built ... The
reasoning below is the whole of the warrant, and a reader who disagrees with
any of it should treat that decision as open."*

**The decision the owner has to make, in one sentence:** should a prisoner the
prison re-classifies as high risk be asked what they are carrying — or should
`contraband.weapon` stay a catalogue entry that no prison can produce until
somebody decides what `priorIncidents` ought to be?

## Context

### The fifth slot has no producer, and that is arithmetic rather than a rate

Three constants and one call site, each verified at the line on `898a16a`
(v0.0.252) independently of #676's record:

1. **The eligible band is a prefix of an ascending-severity ordering.**
   `eligibleContrabandCategories` takes the
   `categoriesAtTierZero + categoriesPerRiskTier * riskTier` least severe
   entries (`src/simulation/contraband/introduction.ts:240`), and
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
   port is wired in `src/simulation/runtime/new-session.ts:531`, and that
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
   (`src/simulation/prisoners/classification.ts:83-89`), so the maximum is
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
(`src/simulation/prisoners/intake-system.ts:97-101`), which returns
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

### 3. `priorIncidents` does not move, and no balance value is decided here

#677's second shape — decide the priors distribution — is **not taken**. It is a
balance decision, ADR 0017 decision 5 and #29 own it, and it is not needed:
decision 1 gives the fifth slot a producer without it. The numbers are set out
under *The other shape, priced* so the owner can overrule this on evidence
rather than on absence.

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

- **Escape attempts rise where weapons appear** — 1 → 13, 13 → 46, 30 → 56.
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
