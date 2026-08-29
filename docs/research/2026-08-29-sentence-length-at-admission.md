# 2026-08-29 — Where a sentence length comes from, and how long it should be

**Question.** Issue [#535](https://github.com/matmaxalez/lockstate/issues/535)
decision 5 settles that *"sentences are drawn from a range at admission, with
some clearly longer than 13,600 ticks"*. Three things it does not settle, and
this record answers: **which RNG stream** the draw comes from, **which side of
the worker boundary** it happens on, and **what the range should be**. It also
reports what `priorIncidents` does, because it is hard-coded beside the
sentence and turned out to be a second dead mechanic rather than a detail.

Measured on `origin/main` @ `966560f` (**v0.0.184**) plus the branch this record
lands on, `agent/sentence-length-variation`, Node 24.19.0, shared container.
Evidence tier is **VERIFIED** throughout unless a claim says otherwise: every
number was obtained by running the repository's own modules, and every
`file:line` was opened.

**A correction to the brief this work was given, first, because it is the kind
that matters.** The brief said the two room-gated needs *"take roughly 10,200
and 13,600 ticks"* to fall to the threshold, and flagged those figures as
arithmetic rather than observation. They are `204 / rate` and they are 20 and 30
ticks high. Measured, they are **10,180** and **13,570** — see §1. The
conclusion the brief drew from them is unaffected and was right: both are longer
than 10,000.

---

## 1. What decay actually costs, measured

`NeedsDecaySystem` (`src/simulation/prisoners/needs-system.ts:26-42`) decays
every need of every living prisoner in `intervalTicks: 10` batches, through
`decayNeed` (`src/simulation/prisoners/needs.ts:162`), which is exactly linear
in stored units at `NEED_SCALE = 200`. `unmetNeedCount`
(`src/simulation/economy/income.ts`) compares `NeedsComponent.get` — which
**rounds** to whole levels — against `STATE_INCOME_UNMET_NEED_LEVEL` (51).
`admitPrisoner` resets every need to `NEED_MAX` (255) when the slot is
allocated (`prisoner-operations-runtime.ts`).

Stepping the real `NeedsComponent` through the real `decayNeed` at the real
cadence from `NEED_MAX`, the first tick at which each need reads at or below 51:

| need | rate/tick | `204 / rate` | **measured first unmet tick** | in days |
| --- | --- | --- | --- | --- |
| bladder | 0.08 | 2,550.0 | **2,550** | 1.06 |
| hunger | 0.05 | 4,080.0 | **4,080** | 1.70 |
| sleep | 0.03 | 6,800.0 | **6,790** | 2.83 |
| hygiene | 0.02 | 10,200.0 | **10,180** | 4.24 |
| recreation | 0.015 | 13,600.0 | **13,570** | 5.65 |
| safety | 0.01 | 20,400.0 | **20,360** | 8.48 |

The gap between column 3 and column 4 is the ten-tick batching plus the
rounding in `get`; it is largest where the rate is slowest, which is exactly
where the two needs that matter sit.

**Crossing the threshold is not the same as being charged for it.**
`StateIncomeSystem`'s schedule is `intervalTicks: DAY_LENGTH_TICKS`,
`phaseTicks: DAY_LENGTH_TICKS - 1`, so a prisoner's condition is sampled once a
day, at ticks 2,399 / 4,799 / 7,199 / …, and only while they still hold an
occupied place. So the sentence has to outlast the **first day boundary after**
the crossing:

| need | crossing | first boundary that can charge |
| --- | --- | --- |
| hygiene | 10,180 | **11,999** |
| recreation | 13,570 | **14,399** |

The old fixed sentence was 10,000 ticks and `sentenceEndTick` is written at the
classification stage, ~15 ticks after the command, so a HUD-admitted prisoner
left at ~10,015. **Neither boundary was ever reached.** That is the mechanism
behind #535 decision 5's own sentence, stated in ticks.

**Which needs are room-gated matters and is not a guess.** `income.ts` names
them itself: *"`hygiene` with no shower room and no laundry, `recreation` with
no yard, common room or classroom ([ADR 0054] decision 1 rules both
room-gated), `bladder` with no toilet"*. The other four are served by a
furnished cell and a canteen in any prison a player would build, which the
end-to-end run in §4 confirms — hunger, sleep, bladder and safety all stay above
240 for the whole run there while hygiene and recreation fall to zero.

## 2. Which side of the worker boundary, and which stream

### Not the main thread, and the existing comment had already proved it

`ADMISSION_REQUEST` in `src/main.ts` carried its own justification:

> They are constants and not a random draw for the same reason: `Math.random`
> on this thread would make two runs of the same seed produce different
> prisoners, which is exactly what `docs/DETERMINISM.md` forbids.

That argument is correct and it is **stronger than it looks**: it rules out a
*seeded* main-thread draw too. The seed a session is reproducible from is
`masterSeed`, held in the worker (`createNewSimulationRuntime`), and ADR 0009's
challenge verification replays *a command stream from a seed*. A main-thread
draw would put a number into the command that the seed does not determine, so
two runs of the same seed and the same gestures would diverge. The command log
would still replay — it carries the value — but "the log replays" is a weaker
guarantee than the one the game sells.

`admitPrisonerSchema`'s own comment had already reached the same conclusion for
the two other per-prisoner facts: *"the risk tier, the classification group and
the prisoner's name are **not** here and must never be … A command that carried
a name or a tier would be the main thread deciding simulation state."* The
sentence belongs in that list.

### Inside the worker there were two candidates, and they are not equivalent

| | where | order draws are made in | what a save must store |
| --- | --- | --- | --- |
| A | `createSessionCommandHandler`'s `AdmitPrisoner` branch (`session-commands.ts`) — it *does* receive `SimulationContext`, so `context.rng` is in scope | command-dispatch order | nothing new |
| B | `IntakeSystem.update`, `classification` stage | `EntityQuery.execute()`'s ascending-entity-id walk | nothing new |

Both are deterministic and neither adds a byte to the save. **B was taken**, on
three grounds:

1. B is the order the other two per-prisoner draws are already made in, and the
   code says so twice — the name minting is commented *"inside
   `EntityQuery.execute()`'s canonical ascending-entity-id walk — so the order
   names are minted in is a function of state, not of the order prisoners
   happened to be admitted in a session"*, and the contraband introduction
   repeats it. A draw made in A advances the stream in the order commands were
   dispatched, which is a fact about *input*, not about state.
2. Both readers of the value are the next two statements at B:
   `classifyPrisoner` against `LONG_SENTENCE_THRESHOLD_TICKS`, and
   `sentenceEndTick = context.tick + length`.
3. `session-commands.ts`'s `AdmitPrisoner` branch carries the sentence *"Nothing
   here draws"* as a load-bearing claim. Keeping it true is worth more than the
   fifteen ticks earlier the value would have been known.

### A sixth named stream, `prisoners.sentence`

A session registers five (`new-session.ts`, and
`tests/determinism/save-rng-stream-compatibility.test.ts` writes the set out
longhand so a sixth has to fail there first): `contraband.detection`,
`contraband.intelligence`, `contraband.introduction`, `identity.actor-name`,
`prisoners.classification`. **None is a sentence stream, and reusing
`prisoners.classification` would have been the cheap wrong answer.** The two
draws happen at the same stage, one line apart, for the same prisoner — but an
extra draw on that stream shifts it by one per admission, changing every risk
tier every seed has ever produced, in a game whose challenge verification is
deterministic replay. Isolation is precisely what `docs/DETERMINISM.md` asks
these streams for.

With its own stream and a drawn range entirely below
`LONG_SENTENCE_THRESHOLD_TICKS` (200,000 — the single place `classifyPrisoner`
reads a sentence), **every classification outcome of every existing seed is
bit-identical after the change.** Measured: `tests/determinism/` is 175 passed /
1 skipped, `session-replay.test.ts`'s canonical state hashes unmoved.

## 3. What a save has to carry: nothing new

`SAVE_SCHEMA_VERSION` stays **5**.

- The drawn value lands in `PrisonerRecordComponent.sentenceLengthTicks` and
  `sentenceEndTick`, both already in the payload
  (`src/persistence/save-schema.ts:365`, `:367`).
- The stream state is in `rngStates`, already in the payload (`:88`).
- **Adding a stream is not a save-format change** (ADR 0038 §2, #415): a restore
  *merges* the bundle's streams over the runtime's, so a bundle written before
  `prisoners.sentence` existed restores with it seeded from its own
  `masterSeed` — the state a new session would have given it. The words that
  seeding produces are pinned by hand in
  `save-rng-stream-compatibility.test.ts` for two seeds, which is what
  distinguishes "the stream exists" from "the stream was seeded correctly".
- The known, bounded divergence `docs/DETERMINISM.md` already records applies
  and is not new: *"a stream re-seeded at restore does not make the restored
  session equal to a continuous one."* For `prisoners.sentence` the practical
  reach is small — it is drawn once per admission, never per tick — but it is
  real, and a replay verifier may not compare sentence draws across a restore
  boundary of a bundle that predates the stream.

**The one wire change is a widening.** `admitPrisonerSchema.sentenceLengthTicks`
becomes `.optional()`. Old direction: every payload the required version
accepted still parses, so a queued `AdmitPrisoner` in an existing save keeps its
own length and is **never redrawn** — asserted end to end. New direction: a save
written after this change may carry a queued admission with no length, and an
older build would refuse that payload. That is ADR 0065's case; it is recorded
in the schema comment rather than left to be discovered.

## 4. The range: a proposal, with what it does

**Proposed: uniform over whole in-game days in `[2, 16]` — 4,800 to 38,400
ticks, fifteen equally likely values.** Declared at `MIN_SENTENCE_DAYS` /
`MAX_SENTENCE_DAYS` in `src/simulation/prisoners/sentence.ts` with this
derivation beside it. **This is a directional balance number in the standing
sense** `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` and
`DEFAULT_ASSAULT_POLICY` both carry — it stands until the owner replaces it, and
ADR 0017 decision 5 keeps values like it out of ADRs and in the code.

Against §1's table:

| property | value |
| --- | --- |
| longer than 13,600 ticks (the owner's condition) | 11 of 15 (73%) |
| longer than the old fixed 10,000 | 12 of 15 (80%) |
| can be charged for `hygiene` (past 11,999) | 11 of 15 guaranteed, 12 of 15 depending on admission phase |
| can be charged for `recreation` (past 14,399) | 10 of 15 guaranteed, 11 of 15 depending on phase |
| mean | 9 days = 21,600 ticks (2.16× the old constant) |

Why each bound:

- **2 days at the bottom, deliberately shorter than 10,000.** ADR 0050 removed a
  population ratchet; a floor that is *longer* than today's constant would put
  some of it back. Two days is still two full grant payments and ~240
  reconsideration cycles, so a short-sentence prisoner is someone who lived in
  the prison rather than a flicker.
- **16 days at the top, which is what makes neglect bite rather than merely
  qualify.** At 16 days `hygiene` is unmet for 11.8 of them and `recreation` for
  10.3, so a neglected long-sentence prisoner is underpaid for most of their
  stay instead of on one boundary at the very end. A top of 12 would have
  cleared the owner's threshold and left the tail toothless.
- **Whole days rather than round ticks**, so the unit the draw speaks is the one
  the income boundary, the regime timetable and
  `CLASSIFICATION_REVIEW_INTERVAL_TICKS` already speak, and a change to
  `DAY_LENGTH_TICKS` — itself *"a candidate value, not a locked balance
  decision"* — carries sentences with it.
- **Uniform**, because its consequences can be read straight off the table
  above. A skewed draw (many short, a thin long tail) is more like a real remand
  population and is the obvious alternative; it needs a shape nobody has picked,
  and it is named here rather than silently not done.

### End to end, on a prison a player can build

Real kernel, real `ZoneRoom`/`AdmitPrisoner` commands, real `StateIncomeSystem`
arithmetic; one furnished cell and nothing else — no shower room, no laundry, no
yard, no common room, no classroom. Seed 535 draws **19,200 ticks (8 days)**:

| day boundary | grant | unmet needs |
| --- | --- | --- |
| 2,399 | 300 | 0 |
| 4,799 | 300 | 0 |
| 7,199 | 300 | 0 |
| 9,599 | 300 | 0 |
| **11,999** | **260** | 1 — hygiene |
| **14,399** | **220** | 2 — hygiene, recreation |
| 16,799 | 220 | 2 |
| 19,199 | 220 | 2 |

280 of 2,400 withheld over the sentence (11.7%). The same prison and the same
seed with the old 10,000-tick sentence is paid 300 on all four boundaries it
lives through and is empty by 11,999. `tests/integration/sentence-length-variation.test.ts`
asserts both arms.

Two observations about that table worth separating from the claim they support:

- **The bite is real but modest at the shipped withheld share.** 40 per unmet
  need per day against a rate of 300 means a fully neglected prisoner (all six
  needs) still earns 60. Whether 11.7% over a sentence is enough pressure to
  make a player build a yard is a **balance** question about
  `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`, not about the sentence
  range, and this record does not answer it. What it establishes is that the
  schedule now has a reachable case at all, which it did not.
- **`room.yard` requires no object** (`src/content/room-catalog.ts`), so the
  repair for `recreation` costs only the ground it stands on. That is the
  incentive `income.ts` says the per-need shape exists to create, and it is now
  an incentive a player can actually feel.

## 5. `priorIncidents` is a second dead mechanic, and is deliberately not fixed here

`ADMISSION_REQUEST` also hard-codes `priorIncidents: 0`. Measured consequence,
from `tests/unit/prisoners-classification.test.ts`'s own reachability sweep over
every seed:

- `reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 0 })` is
  `[0, 1]`. Re-run on this branch at 4,800 and at 38,400 — the ends of the
  proposed range — it is `[0, 1]` at both, because the whole range is below
  `LONG_SENTENCE_THRESHOLD_TICKS`.
- `classificationGroupIdForTier` answers `'high-risk'` only at tier 3.

**So no admission a player can make has ever produced a high-risk prisoner**,
and `room.solitary-cell`'s accommodation branch is reachable only through
`ClassificationReviewSystem` later revising a tier upward. That is the same
shape of finding as the sentence one.

It is **not** taken here, for reasons that are about scope rather than effort:

- #535 decision 5 is about sentences. The owner took eight decisions that day
  and this was not among them.
- Drawing prior incidents moves risk tiers, and tiers decide cell sharing
  (`cell-sharing.ts`), contraband introduction (`contraband/introduction.ts`)
  and which regime timetable a prisoner runs — a far wider blast radius than a
  sentence length.
- It would cost this change its strongest safety property. Holding
  `priorIncidents` at 0 and the range below 200,000 is exactly what makes every
  tier from every existing seed bit-identical.

**Recommendation: a separate decision, offered to the owner as its own option
set.** The measurement above is the whole of the case for opening it.

## 6. Weakest claim, and what would change my mind

**The weakest claim in this record is that `[2, 16]` uniform is the right
shape**, and it is weak in a specific way: the *bounds* are derived from decay
measurements that are solid, but the *distribution* is not derived from anything
— it is the simplest thing whose consequences can be tabulated. Two things would
change it:

- A measured argument that the prison's population dynamics want a skew. Mean
  sentence sets steady-state occupancy for a given admission rate, and ADR
  0050's harness (99 admissions over 200,000 ticks) is the instrument that could
  say so. It was not re-run at the new range, and that is the largest gap in
  this record.
- The owner saying the tail should be longer. Nothing in the code resists it:
  the range is two constants in one module, and anything below 200,000 leaves
  classification untouched.

**A second, smaller one.** §4's end-to-end run is one seed and one prison. It
establishes that the withholding case is reachable, which is an existence claim
and needs one witness. It does **not** establish what a typical prison loses,
and no claim of that kind is made.

**Not established, and not guessable from this repository.** Whether a player
finds an 8-day mean sentence too long to sit through at 1× — two minutes of real
time per in-game day, so about 16 minutes — is a question about how the game is
actually played, and nobody plays it yet. `docs/AGENT_WORKFLOW.md` §3 calls this
the class of finding that is a *question*, and it is left as one.

---

## ADR draft — *How long a prisoner is held for*

**Unnumbered on purpose.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), and `docs/adr/README.md`'s **Next free number** line reads
**0069** with 0068 the maximum on disk. `max + 1` recomputed off disk at commit
time is therefore 0069 — but a higher number may be in flight on a branch this
checkout cannot see, which is the failure mode 0065's and 0066's drafts each
declined to guess at. This draft does the same. **If it is given a number it
pre-commits to renumbering the file, its row in `docs/adr/README.md`, the
`Next free number` line and every citation of it, in the same commit**, per
`tests/foundation/adr-numbering-contract.test.ts`.

### Status

**Proposed, 2026-08-29. Not self-approved.** The code implementing it is on
`agent/sentence-length-variation`, because #535 decision 5 is the owner's own
recorded decision and states the outcome it wants in as many words. What this
document adds is the part the decision left open: *where* the draw happens and
*from what*.

### Context

`src/main.ts` sent `sentenceLengthTicks: 10_000` with every admission. §1 above
shows what that cost: the grant-withholding schedule ADR 0064 added had **no
reachable case** from the Intake panel, because both room-gated needs cross
their threshold after the prisoner has left. ADR 0050 flagged the number in its
own *What this does not decide* — *"one number does become load-bearing that was
not … That is left exactly as it is, and flagged"* — and this is that flag being
answered.

### Decision

1. **`AdmitPrisoner.sentenceLengthTicks` becomes optional.** Omitted, the
   simulation draws; present, the value is used exactly as given and never
   redrawn. A widening, so every existing fixture and every queued command in an
   existing save is unaffected.
2. **The draw is made inside the simulation worker**, at `IntakeSystem`'s
   `classification` stage, inside `EntityQuery.execute()`'s ascending-entity-id
   walk — the same place and the same order the actor name and the risk tier are
   already drawn in. Not on the main thread, for the reason `main.ts`'s own
   comment gave and §2 extends; not in the command handler, for the ordering
   reason in §2.
3. **From a sixth named stream, `prisoners.sentence`.** Never
   `prisoners.classification`, so that no risk tier any existing seed produces
   moves. Registering it is not a save-format change (ADR 0038 §2), and
   `SAVE_SCHEMA_VERSION` stays 5.
4. **The range is data, not architecture.** Two constants in
   `src/simulation/prisoners/sentence.ts`, carrying their derivation, revisable
   by the owner without touching this decision — ADR 0017 decision 5's split
   between a model and its values, applied again.
5. **`priorIncidents` is untouched and stays 0**, and §5 is the evidence for
   opening it as its own decision.

### What this does not decide

- **Any balance number.** The range is a proposal; §6 names what would change it.
- **Whether a sentence is shown to a player.** Nothing in `src/ui/` renders one
  today (`grep -rn "sentence" src/ui/` finds only prose), and
  `projectPrisonerDetail` already carries `sentence.lengthTicks` and
  `sentence.endTick` for whoever builds #535 decision 6's roster readout. **No
  new player-facing copy is added here**, which `AGENTS.md`'s fourth exclusion
  requires.
- **`priorIncidents`**, for the reasons in §5.
- **Whether a prisoner walks out.** ADR 0050 decision 4's slice 2 is untouched.

### What must not be broken

- **Determinism.** One draw per admission, from an isolated named stream, inside
  a canonical walk. `tests/determinism/`: 175 passed, 1 skipped, every canonical
  state hash unmoved.
- **The stream-set gate.** `save-rng-stream-compatibility.test.ts` must fail
  before a stream can be added, and it did — the set and both derived-word
  tables were extended by hand.
- **Old saves.** A bundle that omits `prisoners.sentence` restores and its
  queued admissions keep their own lengths.
