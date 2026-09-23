# ADR 0124: What a prisoner brings with them

> **THE NUMBER IS ASSIGNED AND IT IS ADR 0124.** The coordinating session
> assigned it on 2026-09-23 after checking `main` and every remote head. The
> note below is kept because it is the state this document was drafted in,
> and `docs/AGENT_WORKFLOW.md` §4 asks for a correction to be readable in both
> directions. Read *"placeholder number"* in it as that state, not as the
> state now. The file moved from `docs/adr/drafts/` in the same commit that
> changed this heading.

> **This draft carries a placeholder number, `XXXX`, and commits in advance to
> being renumbered without argument.** ADR numbers are assigned centrally after
> drafts come back (`AGENTS.md`). Nothing in `src/` or `tests/` cites this
> draft. `grep -rln "what-a-prisoner-brings-with-them" src/ docs/ tests/` was
> run, not recalled, and it returns this file alone. The index's
> `Next free number` read **0124** at `430906af` (v0.0.757), the commit this
> draft was written on. That number is recorded here only as a fact about that
> commit. It is not a claim on the number.

## Status

**Accepted by the owner on 2026-09-23, in three rulings, each the option this
document recommended.** They are recorded on
[#540](https://github.com/woogitsu/lockstate/issues/540) (comment of
2026-09-23 15:21 UTC) and in `AGENTS.md`'s entry for this ADR. That entry's
number is left for the integrator to set, because two parallel branches are
adding entries on the same day.

1. **Q1, the distribution:**

   > 60/30/10, równo (zalecane)

   ("60/30/10, flat (recommended).") **Option A.** 60 % of arrivals have no
   prior incident, 30 % have one and 10 % have two. The draw does not depend
   on the sentence.
2. **Q2, the early warning:**

   > Tak, od pierwszego dnia (zalecane)

   ("Yes, from the first day (recommended).") The early warning of
   [ADR 0090](./0090-medium-as-a-warning-not-a-skipped-step.md) may lift a
   prisoner with priors to `Medium` at the end of their first day. ADR 0090's
   mechanism is unchanged.
3. **Q3, visibility:**

   > Nie teraz (zalecane)

   ("Not now (recommended).") No new player-visible string. Priors show only
   through the existing tier badge, the high-risk chip and the regime.

**The provenance is the weaker kind, all three times.** Each ruling is the
label of a clickable option the coordinating session wrote and the owner
chose, not a sentence the owner typed. `AGENTS.md` flags the same shape for
its entries 19 to 29.

**What is accepted** is §4 as written, together with Option A's table from §5.
Options B and C are kept below as history. Q1 of §10 also answers entry 25's
*"tier-dependent"* as reading (i) of §3: the tier depends on the priors.

**It is implemented in the same branch that numbered it**, in separate
commits. §11 records what the implementation measured against this
document's own predictions.

**What this Status section said while the document was a draft, kept because
it records what was offered:**

> **Proposed.** Nothing below is decided, implemented or approved by the agent
> that wrote it. No line in `src/` changed while the draft was written. Every
> measurement was taken on an unmodified tree, by sending the real kernel the
> commands a worker-side draw would produce (§6.1 says how, and what that
> method cannot establish).

**What it answers.** The owner ruled on
[#540](https://github.com/woogitsu/lockstate/issues/540) on 2026-09-23
(`AGENTS.md` entry 25):

> Tak, z historią (zalecane)

("Yes, with a history (recommended).") This ruling authorises an ADR and no
code. **The provenance is the weaker kind**: the owner chose the label of an
option a session wrote, not a sentence they typed. Entry 25 lists what the ADR
must cover: *"a seeded, deterministic, tier-dependent draw of prior incidents,
how that draw feeds classification and gang membership (ADR 0121), and what it
means for saves and for the intake queue (#594)"*. It also answers
[ADR 0090](./0090-medium-as-a-warning-not-a-skipped-step.md)'s *"What this
does not decide"*, item 2.

**This is the second time the owner has said "yes" to this question, and the
first answer is what this draft builds on.**
[ADR 0080](./0080-when-the-prison-asks-what-a-prisoner-is-carrying.md)'s
Status records the owner's ruling on #677 of 2026-08-30: *"`priorIncidents`
moves off zero"*. The same ruling says *"**Not decided: the magnitude**, and
it is deliberately not mine."* ADR 0080 and
`docs/research/2026-08-30-both-shapes-measured-together.md` then priced eight
distributions and recommended `60/30/10`. Nothing implemented that
recommendation, so the dead branch #540 names has had a costed answer for
twenty-four days without anyone building it. **This draft does not re-price
that work.** It adds three things:

1. **The architecture ADR 0080 left open.** Its own words, unamended, were
   *"A distribution is also new state ... a determinism-fingerprint change and
   a stream registration, not a constant edit — a further reason it belongs in
   its own ruling."* This is that document.
2. **What landed after ADR 0080 was measured**, and changes what a prior
   incident does:
   - ADR 0090's daily early warning, proposed and built on 2026-09-02 and
     accepted on 2026-09-23;
   - ADR 0103's gangs, accepted 2026-09-08;
   - ADR 0103 decision 6, amended 2026-09-19 (ADR 0121);
   - the 14–90-day sentence range. That range is older than ADR 0080, so it
     is *not* new here. §6 draws sentences from it, rather than using the fixed
     400,000-tick fixture sentence, so its effect is included.
3. **The two questions entry 25 names that no earlier document asked**: what
   "tier-dependent" can mean when the tier is computed *from* the priors
   (§3), and what #594's intake queue does to the draw site (§4.8).

## Claim labels used below

- **MEASURED**: produced by running the real kernel in this session. The
  harness is in Appendix A.
- **DERIVED**: arithmetic or an exhaustive enumeration over code that was
  opened and quoted.
- **ASSERTED**: read from code or a document and not executed, or a judgement.

---

## 1. Context: the path an admission takes today

Each step below was opened at `430906af`.

1. **The interface.** `const ADMISSION_REQUEST = { priorIncidents: 0 } as const;`
   (verbatim in `src/main.ts`), at `src/main.ts:1190`. It is sent at
   `src/main.ts:3752` (`priorIncidents: ADMISSION_REQUEST`) as the only
   `AdmitPrisoner` the interface builds, with
   no `sentenceLengthTicks`, so the worker draws the sentence.
2. **The wire.** `priorIncidents: z.number().int().min(0).max(MAX_PRIOR_INCIDENTS),`
   (verbatim in `src/simulation/protocol/commands.ts`) is **required**, and
   `MAX_PRIOR_INCIDENTS` is 255 (`src/simulation/prisoners/components.ts:75`),
   the ceiling of a `Uint8Array`.
3. **The record.** `submitIntake` stores the value as given:
   `this.records.priorIncidentsAtIntake[index] = Math.min(255, input.priorIncidents);`
   (verbatim in `src/simulation/prisoners/intake-system.ts`).
4. **The classification stage**, `src/simulation/prisoners/intake-system.ts:562-571`.
   It draws the sentence from `prisoners.sentence` if the admission named
   none. It then calls `classifyPrisoner`, which scores
   `score += Math.min(2, Math.max(0, input.priorIncidents));`
   (verbatim in `src/simulation/prisoners/classification.ts`) plus one point
   for a sentence of at least 200,000 ticks, plus one draw of screening
   variance in `{-1, 0, +1}` on `prisoners.classification`. **Only three
   values of the field matter: 0, 1 and "2 or more".**
5. **In the same stage, after the record is written:**
   - contraband introduction on `contraband.introduction`, banded by the tier
     just written (`intake-system.ts:581`). Only tier 3 can bring a weapon;
   - gang assignment (`intake-system.ts:597`), keyed on the group:
     `if (classificationGroupId !== HIGH_RISK_GROUP_ID) return undefined;`
     (verbatim in `src/simulation/incidents/default-gangs.ts`). Tier 3 is the
     only tier in that group.
6. **Afterwards, two readers of the persisted value.** Both
   `ClassificationReviewSystem` (`classification-review-system.ts:411`) and
   `ClassificationEarlyWarningSystem` (`classification-early-warning-system.ts:145`)
   pass `priorIncidentsAtIntake` into `reviewClassification`, which reads it
   as
   `const intakeHistory = Math.min(2, Math.max(0, input.priorIncidentsAtIntake));`
   (verbatim in `src/simulation/prisoners/classification.ts`). **A prior
   incident is a permanent floor under every later review, not only an input
   at the gate.**
7. **What the player sees.** The roster's tier badge: Minimal, Low, Medium
   or High. `projectPrisonerDetail` carries `sentence.priorIncidentsAtIntake`
   (`src/simulation/presentation/prisoner-projection.ts:753`,
   `priorIncidentsAtIntake: source.records.priorIncidentsAtIntake`), but
   `grep -rn "priorIncidents" src/ui/` finds only one doc comment
   (`src/ui/simulation-events.ts:700`, `{ priorIncidents: 0 }`). **No screen
   shows the number today**
   (ASSERTED, by that grep).

**So "the prisoner record already carries the value" holds, in every sense
the brief asked about.** The slot exists, it is persisted
by `priorIncidentsAtIntake: z.array(byteSchema),`
(verbatim in `src/persistence/save-schema.ts`), it is projected, and all four readers are
wired. What is missing is a producer of anything but 0.

## 2. What today's 0 costs, briefly

This is already established in #540's comments and in ADR 0080. It is
restated only so the measurements in §6 have a baseline:

- **The interface cannot admit a tier-3 prisoner.** DERIVED, by exhaustive
  enumeration over 77 sentence lengths and 3 screening outcomes. The intake
  distribution is **63.64 / 33.33 / 3.03 / 0.00 %** for tiers 0/1/2/3. The
  probe reproduces those figures in Appendix A's `analytic.mjs`.
- **So no gang member, no weapon at intake and no high-risk housing at
  intake, ever.** Gangs are reached only through
  `ClassificationReviewSystem`, whose earliest effective run for an early
  arrival is tick 47,999 (ADR 0090, ADR 0121 §5).

## 3. "Tier-dependent" cannot mean what it says, and what it can mean

Entry 25 describes *"a seeded, deterministic, **tier-dependent** draw of prior
incidents"*. **The tier is computed from the priors** (§1 step 4), so a draw
conditioned on the tier is circular: at the moment of the draw, no tier exists
for it to depend on. The phrase has three honest readings.

- **(i) The tier depends on the priors.** Priors are drawn first and the
  existing formula turns them into a tier. This is what the code already does
  with whatever value arrives. It needs no new coupling. **Every option in
  §5 is this reading.**
- **(ii) The priors are conditioned on something drawn before them.** The only
  such thing is the sentence, one line earlier at the same stage. No offence
  type exists: `grep -rniE "offen[cs]e|crime|convict" src --include=*.ts`,
  excluding the locale, returns nothing. This reading is §5's Option B.
- **(iii) Draw a tier first and derive priors to explain it.** **Rejected.**
  It turns `classifyPrisoner` inside out: the tier becomes the draw and the
  priors become decoration. It either moves `prisoners.classification`, which
  shifts every tier every seed has produced, or it adds a second
  tier-shaped draw that the screening variance then perturbs. It also makes
  the review's `intakeHistory` floor a function of a hidden target rather
  than of a recorded fact.

**Flagged as an owner question** (Q1, §10), because the ruling's
wording and reading (i) do not quite match. This draft recommends reading (i)
and does not assume the owner meant it.

## 4. Decision (common to every option in §5)

The draw architecture below does not depend on which distribution the owner
picks. §5 is where the options differ.

### 4.1 `AdmitPrisoner.priorIncidents` becomes optional, which widens the wire

**If the field is omitted, the simulation draws the value. If present, the
value is used exactly as given and is never redrawn.** This is ADR 0069
decision 1's shape for `sentenceLengthTicks`, reused as-is. The consequences:

- Every fixture that names the field keeps its behaviour. That is 154
  occurrences of `priorIncidents: 0` and 42 of other values across `tests/` (MEASURED,
  `grep -rhoE "priorIncidents: ?[0-9]+" tests | sort | uniq -c`).
- A queued `AdmitPrisoner` in an existing save carries the field and keeps
  parsing. Making a required field optional accepts every payload the
  required version accepted.
- `src/main.ts` stops sending the field. **`ADMISSION_REQUEST` then carries
  nothing at all** and can be deleted, along with the docblock that defends
  its 0 (`src/main.ts:1100-1189`).

### 4.2 The worker draws, at the `classification` stage, after the sentence and before `classifyPrisoner`

**Not the main thread.** The seed lives in the worker, and ADR 0009 replays a
command stream from a seed. `src/main.ts`'s own docblock already records that
this rules out even a *seeded* draw on the main thread.

**Not the `AdmitPrisoner` handler** in `session-commands.ts`, which does have
`context.rng`. ADR 0069 rejected that site for the sentence: a draw there
advances the stream in command-dispatch order rather than the ascending
entity-id order every other per-prisoner draw uses. The same reasoning holds
here, and the handler's own comment repeats it
(`src/simulation/runtime/session-commands.ts:425-428`, `command-dispatch order`).

**Between the sentence draw and `classifyPrisoner`, because Option B needs the
sentence, and no option needs anything that comes later.** Putting the draw
here in every option keeps Option B a change to one expression rather than to
the draw's position.

**The simulation stays authoritative.** Nothing on the main thread decides a
prior, a tier or a gang.

### 4.3 A seventh named stream, `prisoners.priors`, with exactly one `nextInt(100)` per drawn admission

The draw uses its own stream, **never `prisoners.classification` or
`prisoners.sentence`**. An extra draw on either would shift every tier or
every sentence that every seed has ever produced, one admission onward. That
is the argument ADR 0069 made for `prisoners.sentence`
(`src/simulation/runtime/new-session.ts`, the docblock above its registration
at `:483`). It holds here for the same reason.

**Exactly one `nextInt(100)`, drawn unconditionally, even when the
distribution's answer turns out to be 0.** The stream's position is then a
function of how many drawn admissions have been classified, and never of
what any of them drew. `nextInt` rejects the unrepresentable tail
(`drawSentenceLengthTicks`'s docblock gives the reason), so a weight table in
whole percent is exact. Integer weights also keep the table editable as data
(ADR 0017 decision 5) without a floating-point threshold.

### 4.4 The record slot marks "not drawn yet" with 255, and stores an explicit value as `min(254, v)`

The worker cannot draw at `submitIntake`. §4.2 puts the draw at the
`classification` stage, `IntakeSystem` runs every 5 ticks
(`intake-system.ts:258`), and an arrival passes through `queued` and
`reception` first. So the slot has to hold "no value yet" for about 10–15
ticks, and a save can be taken in that window. **0 cannot be the marker**, as
it is for `SENTENCE_UNSET_TICKS`, because 0 is a legal prior count.

**The proposal:** `PRIOR_INCIDENTS_UNSET = 255`, written by `submitIntake` for
an omitted field. An explicit value is stored as `min(254, v)`, and
`admitPrisonerSchema` keeps its maximum of 255. **Behaviour is identical for
every value the schema accepts**, because every reader saturates at 2 (§1
steps 4 and 6). The only visible difference is a projected
`priorIncidentsAtIntake` reading 254 where a caller sent 255, and no screen
reads that field. **The rejected alternatives:**

- **Narrow the schema to 254.** This would refuse a queued old-save admission
  that carries 255. Nothing in the game ever produced one, but refusing a
  payload the old build accepted is the one direction ADR 0038 §1 forbids.
- **A new per-slot "pending" flag.** This is a new persisted field for a
  window measured in ticks. The sentinel buys the same thing without one.

### 4.5 The domain is `{0, 1, 2}`

The score only distinguishes three values, so drawing more would put numbers
on the record that nothing reads. **One exception would change this:** a
player-facing string that says *"N prior incidents"* and needs a realistic
spread. §4.7 declines to add that string, so the question does not arise yet.
If a later change adds it, the choice is between drawing wider (with the score
still saturating) and writing *"2 or more"*. That choice is reservation 4's,
and it is named as Q3.

### 4.6 Every reader stays as it is, so the effects are the formula's own

**This draft proposes no change to `classifyPrisoner`, `reviewClassification`,
`ClassificationEarlyWarningSystem`, `defaultGangIdForArrival`, contraband
introduction or any threshold.** What the draw changes, derived from code
that was opened and then measured in §6:

- **The initial tier.** It moves tiers 0 → 2 and 0 → 3, and tier 1 barely
  moves: ADR 0080 found it pinned within a point by the uniform screening
  variance, and that still holds (§6.2).
- **The early-warning system: a finding no earlier document names.** Its
  daily assessment is `sentence + intakeHistory + findings − cleanConduct`.
  With no findings and no clean credit yet (under 24,000 ticks), that is
  `sentence + priors`. It writes `min(2, ·)` whenever that exceeds the
  current tier: `if (cappedTier <= currentTier) return;`
  (verbatim in `src/simulation/prisoners/classification-early-warning-system.ts`). **So
  for any arrival with priors ≥ 1, a screening draw of −1 is undone at the
  end of their first in-game day, with no incident at all.** DERIVED for
  `60/30/10`: tier 2 rises from **15.15 % at intake to 19.09 % after the first
  early warning**. MEASURED as 16 → 22 of 96 arrivals in the well-run prison
  (§6.2), and in 30 days that prison issues **2 → 12** early warnings with
  zero incidents (§6.3). ADR 0090 built `Medium` as *"a warning"* on the way
  to `High` in a neglected prison. With priors it also becomes a statement
  about the record the prisoner arrived with. **This draft recommends
  accepting that and asks the owner (Q2).** A "warning" nobody earned inside
  the prison is a reading ADR 0090's title does not obviously cover.
- **Gang eligibility.** Tier-3 arrivals join a gang at intake, through the
  site ADR 0103 decision 6 built and nothing has fed until now. **Membership
  outlasts the tier that granted it.** A tier-3 arrival with priors 2 and a
  clean record is reviewed down at 47,999 (score `2 − 1 + sentence`). The
  trace in Appendix A shows this in the well-run prison under Option A's
  table, over twelve seeds: **5 arrivals enter at tier 3, 0 are still at tier
  3 at tick 48,001, and all 5 are still gang members** (MEASURED). Membership
  stays because *"What this deliberately does not do is revoke"*
  (`classification-review-system.ts:364`). This is ADR 0103's accepted
  behaviour and is not re-opened here. It does mean a well-run prison under
  priors carries gang members who are Low or Medium risk, which it has never
  done before. **The same trace shows why that prison cannot retaliate:**
  each seed produced at most one intake member, and the smaller-gang rule
  puts a lone member in `gang.alpha`. So no cross-gang pair exists to form a
  grudge.
- **Incidents.** Only through the tier, the regime and the contraband the
  tier opens (§6.3).

### 4.7 Player visibility: no new string in the change that implements this

**What the player sees changes, and every string involved already exists and
stays true.** The roster's `High` badge and the high-risk chip now light for
arrivals on day one, where before they lit only after about 20 days of
neglect. The Regime panel's restricted timetable, the `warning` tone and
*"Two gangs are settling a score."* all become reachable from intake. Each of
them is true of the code that renders it (ADR 0103 decision 4's guard covers
the last one).

**No sentence gains a new meaning.** One comment block does become false and
must be corrected in the same change: `tests/browser/app-shell.spec.ts:12051`
onward says *"`prisonersHighRisk` is honestly 0 in any prison this test can
build"*. Several `src/` docblocks say the interface cannot produce tier 3.
The list is in §7.

**What is deliberately not added:** a line in the prisoner detail such as
*"Prior incidents: 2"*. That line would be a new player-facing promise, and
reservation 4 makes its *truth* the owner's. The hard part is not the number;
the record holds it exactly. The hard part is the word *incidents*. Nothing in
`IncidentLog` corresponds to these incidents: they did not happen in this
prison and the player cannot inspect them. A string would need to say
*"on record before admission"* or similar to avoid implying otherwise. **Q3.**

### 4.8 #594's intake queue moves the draw with the sentence, and neither moves alone

#594 shows candidates *"with risk tier, sentence length, and whether
contraband has already rolled"* **before** the player accepts them. So once
#594 lands, the whole `classification` stage happens at candidate generation,
not after `AdmitPrisoner`. **The rule this draft sets for that change:** the
priors draw, the sentence draw, the screening draw and the contraband roll are
one unit and move together, each on its own stream, in the order §4.2 fixes.
The stream name `prisoners.priors` does not change when the site moves.

Two consequences for #594, recorded here so they are not rediscovered:

- **#594's constraint *"packing high-risk becomes the optimum unless incidents
  and unguarded safety already cost money"* has no subject until this ADR is
  implemented.** At `priorIncidents: 0`, a candidate is never tier 3 (§2), so
  the bounty's top tier would be unreachable.
- **A player-visible queue makes the priors themselves visible**, which is
  Q3's string arriving by a different route. Whichever of the two lands first
  answers Q3 for both.

### 4.9 Saves: no `SAVE_SCHEMA_VERSION` move (it stays 6)

- **The slot is already persisted** (§1) as a byte, and 255 fits.
- **The new stream is an absence in every existing save.** It is seeded from
  `(masterSeed, "prisoners.priors")` on restore (ADR 0038 §2,
  `docs/PERSISTENCE.md` *"What makes a save compatible, and where a named RNG
  stream fits"*), which is the state a new session would have given it.
- **Existing prisoners keep 0.** Nothing redraws the value for a prisoner who
  has already been classified, and a queued admission from an old save names
  its 0 explicitly.
- **The reverse direction is ADR 0065's case, exactly as ADR 0069 named it
  for the sentence.** An older build reading a newer save could meet a queued
  admission with no `priorIncidents`, which its strict schema refuses. It
  could also meet a slot reading 255 during the ~10-tick pending window,
  which it would score as "2 or more". **The second one is new** and is worth
  saying out loud: it is a silent misreading rather than a refusal. It needs
  a save taken inside a 10-tick window and restored on an older build, and it
  costs that one arrival a tier. ASSERTED; not measured.

### 4.10 Determinism: what moves and what does not

**Unmoved, DERIVED from the branch's shape.** Every scenario that names
`priorIncidents` does not move, and that is every fixture in `tests/`. The
new draw runs only for an omitted field, and the new stream is isolated, so
no existing stream's position changes. This is the property ADR 0069 bought
for the sentence and then ADR 0079 spent. Here nothing spends it.

**Moves, ASSERTED by opening each file** (a prototype that would have run the
whole suite was not built; see §8):

| file | why it moves |
| --- | --- |
| `tests/determinism/session-replay.test.ts:172`, `streams.map((entry) => entry.name)` | asserts the exact list of six registered stream names |
| `tests/determinism/rng-stream-isolation.test.ts:199`, `expect(names).toEqual(` | the same list |
| `tests/determinism/save-rng-stream-compatibility.test.ts:74` | `REGISTERED_STREAMS`, the same list. `new-session.ts`'s docblock for the sixth stream records that this file *"had to be extended by hand"*, which is the file working as intended |
| `tests/integration/gang-retaliation-from-the-admission-surface.test.ts` | stays green but **stops being what its name says**: it sends `priorIncidents: 0` because that was the interface's value. To keep its claim, it must omit the field, and then its measured ticks (`FIRST_REVIEW_TICK = 48_000`, the grudge at 53,261, retaliation at 55,700, and `0x0cc3`'s 7 retaliations) have to be re-measured |
| `tests/integration/gang-membership-at-review.test.ts` | the same situation: its docblock cites `ADMISSION_REQUEST.priorIncidents` |
| `tests/integration/security-post-unreachable-condition.test.ts` | sends `{ type: 'AdmitPrisoner', priorIncidents: 0, ... }` as the interface's shape |
| `tests/browser/app-shell.spec.ts` (#703 case) | plays the real interface, so its prisoners' tiers are now drawn and its comment in §4.7 becomes false |
| `tests/unit/prisoners-classification.test.ts:81-104` | `reachableTiers` for *"what the Intake panel asks for"* at `priorIncidents: 0`. It stays true as a statement about 0 and false as a statement about the panel |

**Challenge replay (ADR 0009) is unaffected in kind.** Evidence recorded on
an older build carries explicit `priorIncidents: 0` and replays exactly. New
evidence omits the field, and the draw is a function of the seed and the
command stream, which is exactly what ADR 0009 verifies. A challenge that
wants fixed priors can name them in its commands. ASSERTED.

---

## 5. The options: all share §4 and differ only in the table

This is a balance question, so ADR 0017 decision 5 and #29 own the value.
The owner has already said twice that the value moves (#677 and #540). What
is left is the number.

### Option A: flat `60/30/10` (ADR 0080's costed recommendation), **recommended**

60 % of arrivals have no prior incident, 30 % have one and 10 % have two.
Drawn unconditionally. DERIVED intake tiers: **47.27 / 33.03 / 15.15 / 4.55 %**.
After the first early warning: **36.36 / 40.00 / 19.09 / 4.55 %**.

**Why this option:** ADR 0080's six reasons still stand. It dominates
`always 1`, and in ADR 0080's words it *"closes it at a rate that exists
without becoming the game"*. In ADR 0080's
600-day run, 8 of 10 well-run prisons saw a weapon and **0 of 70 runs lost a
prisoner**. Since then two things have changed, and §6 re-measures both. The
early warning makes the effective tier-2 share about 19 % rather than 15 %.
Gangs now exist, and in a 30-day window a neglected prison under this table
retaliates in **3 of 12** seeds where today it does so in **0 of 12**.

### Option B: the same marginal, conditioned on the sentence

The weights are `80/20/0` below 35 days, `60/32/8` from 35 to 62 days, and
`45/35/20` from 63 days up. The marginal is 60.0 / 29.8 / 10.2 %. DERIVED
intake tiers: **47.52 / 32.73 / 14.70 / 5.06 %**. The effect is small: tier 3
rises about half a point, because the 84-to-90-day sentences that already
score the long-sentence point are also the ones most likely to carry two
priors.

**Why not:** it links two tables that different decisions own. The sentence
range belongs to the owner, through ADR 0079. The priors table belongs to
#29. Under this option, a future change to the sentence range silently moves
the tier distribution through a second route. The player sees neither the
sentence nor the priors (ADR 0079 names the first gap and §4.7 the second),
so the story it tells ("long sentence, long record") is not one the player
can read. **Recommended against for now. Worth reconsidering after #594 or
Q3 makes both numbers visible**, because the correlation is then something
the player can see.

### Option C: flat `80/15/5` (ADR 0080's conservative alternative)

DERIVED intake tiers: **55.45 / 33.18 / 9.09 / 2.27 %**. After the first early
warning: **48.48 / 38.18 / 11.06 / 2.27 %**. Tier 2 is spent at the best
ratio of the safe candidates, according to ADR 0080. **It is a fair choice if
the owner wants tier 3 at the gate to be rare rather than occasional.** ADR
0080 put it this way: *"the difference is a taste about frequency"*. §6
measures its effect at about half of Option A's or less: well-run gang
members 2 against 5, neglected-prison assaults over 30 days 40 against 89,
and retaliating seeds 1 against 3.

**The draft's recommendation is Option A.** It is a recommendation, not a
decision.

---

## 6. Balance, measured through the real kernel

### 6.1 Method, and what it cannot establish

The balance figures come from `a-540/priors-balance.probe.ts`. Its
load-bearing parts are reproduced in Appendix A. The whole file lives in this
session's scratchpad and will not outlast it, so the appendix is the durable
record. It builds each prison from player commands on an
**unmodified** `430906af`. For each admission, the probe draws the sentence
from `deriveXoshiroState(seed, "prisoners.sentence")` and the priors from
`deriveXoshiroState(seed, "prisoners.priors")`, then sends both as explicit
`AdmitPrisoner` fields.

**Why this matches what the in-worker draw would produce (DERIVED, not
MEASURED):**

- admissions go one per tick, in ascending entity-id order;
- `IntakeSystem` walks ascending entity ids;
- so the probe's draw order is the order §4.2's draw would take;
- so the sentences are bit-identical to what the game draws today, and the
  priors are what the seventh stream would give.

What this does **not** establish is that an implementation of §4 produces the
same numbers. Only that implementation, run, can show that (§8).

**The setup:**

- **Seeds:** 12 (`0x0cc0`–`0x0ccb`), per cell of the tables below.
- **Admissions:** all at about tick 1,000, which is the batch pattern of the
  existing fixtures. The windows are 10 and 30 in-game days.
- **Prisons:**
  - **W**, well-run: `report-well-tended-prison-gang-reachability.ts`'s
    prison. 8 furnished cells, a shower room, canteen and yard, 1 guard and
    8 prisoners.
  - **C**, crowded: the same prison with 16 prisoners.
  - **N**, neglected: 8 bed-only cells, 1 guard and 8 prisoners, as in
    `gang-retaliation-from-the-admission-surface.test.ts`, but with drawn
    sentences instead of 400,000 ticks.

**Cross-check:** the enumeration in Appendix A reproduces ADR 0080's
published tier rows exactly for `always 0`, `80/15/5`, `70/25/5` and
`60/30/10`.

### 6.2 Intake tiers: how many prisoners land in each tier

MEASURED, summed over 12 seeds. Tiers are read at tick 1,200 (at intake) and
at tick 2,401 (after the first early warning).

| table | priors 0/1/2 drawn (W, N) | W and N, t0/t1/t2/t3 at intake (96 arrivals) | after day 1 | C at intake (192) | after day 1 |
| --- | --- | --- | --- | --- | --- |
| today (all 0) | 96/0/0 | 59/32/5/**0** | 57/34/5/**0** | 118/63/11/**0** | 114/67/11/**0** |
| C: `80/15/5` | 76/16/4 | 51/32/11/**2** | 45/36/13/**2** | 105/61/21/**5** | 93/70/24/**4** |
| **A: `60/30/10`** | 53/32/11 | 37/38/16/**5** | 31/38/22/**5** | 85/65/31/**11** | 65/76/40/**8** |
| B: by sentence | 50/34/12 | 40/33/16/**7** | 29/41/19/**7** | 85/65/28/**14** | 63/79/36/**11** |

W and N admit the same eight arrivals per seed, so their intake rows are
identical. In C, the tier-3 count after day 1 falls below the intake count.
That is not a demotion: day-1 counts are taken over live prisoners. Under
Option A's table, across the twelve seeds, **3 prisoners are gone by tick
2,401, and 3 escape attempts had opened by then** (MEASURED, `trace2` in
Appendix A).

### 6.3 Gangs and incidents over 10 and 30 in-game days

MEASURED, summed over 12 seeds. Incidents are given as riots / assaults /
escape attempts / gang retaliations.

**W, the well-run prison:**

| table | members at intake | 10 d incidents | 30 d incidents | 30 d members | 30 d early warnings |
| --- | --- | --- | --- | --- | --- |
| today | 0 | 0/0/0/0 | 0/0/0/0 | 0 | 2 |
| C: `80/15/5` | 2 | 0/0/0/0 | 0/0/0/0 | 2 | 8 |
| **A: `60/30/10`** | 5 | 0/0/0/0 | 0/0/0/0 | 5 | 12 |
| B: by sentence | 7 | 0/0/0/0 | 0/0/0/0 | 7 | 14 |

**C, the crowded prison:**

| table | members at intake | 10 d incidents | 30 d incidents | 30 d seeds with a retaliation | 30 d weapons |
| --- | --- | --- | --- | --- | --- |
| today | 0 | **48**/72/0/0 | **103**/260/17/11 | 11/12 | 13 |
| C: `80/15/5` | 5 | **44**/76/1/0 | **98**/264/20/12 | 12/12 | 13 |
| **A: `60/30/10`** | 11 | **41**/79/3/0 | **86**/275/23/10 | 10/12 | 13 |
| B: by sentence | 14 | **38**/83/3/0 | **80**/281/21/11 | 11/12 | 11 |

**N, the neglected prison:**

| table | members at intake | 10 d incidents | 30 d incidents | 30 d seeds with a retaliation | 30 d members |
| --- | --- | --- | --- | --- | --- |
| today | 0 | 0/10/0/0 | 0/**30**/0/0 | **0/12** | 4 |
| C: `80/15/5` | 2 | 0/11/0/0 | 0/**40**/0/1 | **1/12** | 6 |
| **A: `60/30/10`** | 5 | 0/21/0/0 | 0/**89**/0/3 | **3/12** | 12 |
| B: by sentence | 7 | 0/21/0/0 | 0/**89**/0/2 | **2/12** | 14 |

What the tables say:

- **Riots over 10 days: zero in the well-run and neglected prisons under
  every table, and *lower* in the crowded prison** (48 → 41 under A; 103 → 86
  over 30 days). Assaults rise by about the number of riots lost. **The
  mechanism is not established.** ASSERTED hypothesis: tier-3 prisoners run
  `HIGH_RISK_REGIME`, which confines them to sleep, meal and hygiene for
  2,200 of the day's 2,400 ticks (`src/simulation/prisoners/regime.ts:120-128`).
  That may change which rooms are contended enough to sustain a hot sector
  mean, and the assault trigger defers to the riot's hot streak by
  construction. §8 names this.
- **The well-run prison meets gangs but no incident.** Over 30 days and 12
  seeds, every table produces 0 riots, 0 assaults, 0 escape attempts and 0
  retaliations. The members exist (2, 5 or 7), and no grudge can form
  without a cross-gang assault. ADR 0080's 600-day run is the longer
  measurement and saw weapons and contained escape attempts. This 30-day
  window is too short to see either and does not contradict it.
- **The neglected prison meets retaliation sooner.** Today no seed retaliates
  within 30 days, because the review route to tier 3 takes about 20 days and
  the grudge follows it. Under A, 3 of 12 seeds do. Assaults nearly triple
  (30 → 89), because tier-3 pairs exist from day one.
- **The crowded prison is already saturated.** Its 30-day retaliation-seed
  count moves between 10 and 12 of 12 with no trend. This is ADR 0080's
  saturation finding (*"opening the gate earlier changes when a prisoner is
  asked, not whether"*) seen again with gangs.
- **Escape attempts at 10 days (C: 0 → 1 → 3 → 3)** are the first ones any
  prison can produce inside the review floor. They follow from tier-3
  arrivals who carry intake contraband. In C, gang members fall between
  intake and day 10 by the same count (11 → 8 under A), which is consistent
  with lapsed attempts removing prisoners through `releasePrisoner`.
  ASSERTED as the link; the counts are MEASURED.

## 7. Consequences: what an implementing change must touch

This list is ASSERTED, from `grep -rn priorIncidents src` at `430906af`, and
it is not a diff.

- `src/simulation/protocol/commands.ts` (`.optional()` and its docblock) and
  `src/simulation/prisoners/classification.ts` (`AdmissionRequest.priorIncidents?`).
- `src/simulation/prisoners/intake-system.ts`: the sentinel in `submitIntake`,
  the draw at the `classification` stage, and the docblock at `:439-443`.
- `src/simulation/runtime/new-session.ts`: register `prisoners.priors`.
- `src/simulation/runtime/session-commands.ts`: forward the field
  conditionally, as it already does for the sentence.
- `src/main.ts`: delete `ADMISSION_REQUEST` and its docblock; stop sending
  the field at `:3752`.
- Docblocks that say the interface cannot produce tier 3 or that assert
  `priorIncidents: 0`, all to be corrected in both directions per
  `docs/AGENT_WORKFLOW.md` §4:
  - `src/simulation/incidents/default-gangs.ts:99-145`
  - `src/simulation/prisoners/classification-review-system.ts:329-339`
  - `src/simulation/contraband/introduction.ts:95-193` (`ADMISSION_REQUEST`)
  - `src/simulation/prisoners/prisoner-operations-runtime.ts:229-254`
    (`priorIncidents: 0`)
  - `src/ui/simulation-events.ts:700` (`{ priorIncidents: 0 }`)
- The tests in §4.10's table. Also a new test that admits through the real
  `AdmitPrisoner` with the field omitted and proves:
  1. the draw happens once per arrival;
  2. an explicit value is never redrawn;
  3. a save taken in the pending window restores to the same tier;
  4. a mutation of the stream name goes red.
- `docs/adr/0090`'s *"What this does not decide"* item 2, and ADR 0069
  decision 5 (*"`priorIncidents` is untouched and stays 0"*), each marked as
  answered by this ADR.

## 8. The weakest claim, and what would change my mind

**Weakest: that §6's numbers are what an implementation of §4 would produce.**
The probe sends explicit values drawn from the same derived stream. The
argument that the in-worker draw hands out the same values is an
ordering argument (§6.1), and it was **not run**. A prototype implementation
in a scratch worktree, which would also have run the full suite to
MEASURE §4.10's table instead of asserting it, was refused by this session's
permission policy. That refusal was reasonable: "change nothing in `src/`"
covers a probe worktree's `src/` too. **What would change my mind:** the
implementing change's own integration test, run on the same three prisons and
twelve seeds, producing different tier counts than §6.2. That would mean the
draw order is not what §6.1 argues.

**Second weakest: the crowded prison's riot decrease.** It is measured, it is
monotone across four tables, and its mechanism is only a hypothesis. If it is
real, priors are in one sense a *relief* valve for an over-admitted prison,
which is the opposite of what a player would expect. **What would change my
mind:** a run that holds the tier-3 population fixed and swaps
`HIGH_RISK_REGIME` for the general timetable. If riots return to today's
count, the hypothesis holds. If they do not, something else is going on and
it has to be found before Option A ships.

**Third: short windows and batch admissions.** Thirty days and one batch of
arrivals at tick 1,000 is the weakness #540's research comment of 2026-08-30
named as its own (*"a property of a metronome"*), in a sharper form. ADR 0080's 600-day, 10-seed well-built run is the stronger
evidence for Option A's well-run behaviour. This draft's runs add only the
gang and early-warning dimensions ADR 0080 could not have measured.

## 9. Alternatives rejected

- **Leave the value at 0 and make that deliberate** (#540's shape 2). The
  owner has ruled against it twice.
- **The player chooses the value at intake** (#540's shape 3). Not ruled.
  It is also subsumed by #594: a queue lets the player choose *who*, which is
  the useful half, without a field that asks for a number.
- **Tier first, then priors** (§3 reading iii).
- **A draw on the main thread, or in the command handler** (§4.2).
- **Sharing `prisoners.classification` or `prisoners.sentence`** (§4.3).
- **Narrowing the schema, or adding a persisted pending flag** (§4.4).
- **A wider numeric domain** (§4.5), which waits on Q3.

---

## 10. Questions for the owner

Each question is phrased as the option a session would offer. The first
option in each is this draft's recommendation.

- **Q1: which distribution.** "Option A: 60/30/10, flat (recommended)" /
  "Option C: 80/15/5, flat, rarer" / "Option B: 60/30/10, tied to the
  sentence". Choosing any of these also answers entry 25's "tier-dependent"
  as reading (i) of §3: the tier depends on the priors.
- **Q2: the early warning and the record.** "Accept: a prisoner with priors
  can show Medium from day one (recommended)" / "Early warning ignores the
  arrival record and fires only on findings in this prison". The second
  option changes ADR 0090's accepted mechanism and would need its own
  amendment.
- **Q3: showing the priors.** "Not now: the High badge and the regime are
  the only readout, and no new string is added (recommended)" / "Add a
  prisoner-detail line such as 'Prior incidents on record before admission:
  N' in the same change" / "Decide with #594's intake queue".

---

## Appendix A: the harness, as run

**Run:** from the scratchpad directory holding `a-540/` and `wt-540/`, run
`wt-540/node_modules/.bin/vitest run --config a-540/vitest.probe.config.ts --root a-540`.
Vitest is used only because the repository has no `tsx`. The file is not a
test and is not under `tests/`. The whole sweep takes about 70 s. Its
distribution table, as run for §6:

```ts
export const DISTRIBUTIONS: readonly Distribution[] = [
  { id: 'Z (all 0, today)', weightsFor: () => [100, 0, 0] },
  { id: 'A (80/15/5)', weightsFor: () => [80, 15, 5] },
  { id: 'B (60/30/10)', weightsFor: () => [60, 30, 10] },
  {
    // Same marginal as B (59.8/29.8/10.2), correlated with the drawn sentence.
    id: 'C (60/30/10 by sentence)',
    weightsFor: (days) => (days < 35 ? [80, 20, 0] : days < 63 ? [60, 32, 8] : [45, 35, 20]),
  },
];

/** Exactly one nextInt(100) per admission, unconditionally. */
function drawPriors(rng: Xoshiro128StarStar, weights: Weights): number {
  const roll = rng.nextInt(100);
  if (roll < weights[0]) return 0;
  if (roll < weights[0] + weights[1]) return 1;
  return 2;
}
```

The probe's own ids are **not** this document's option letters. Probe `A` is
Option C, probe `B` is Option A, and probe `C` is Option B. The tables in §6
use this document's letters.

The admission loop, which is the part §6.1's equivalence argument rests on:

```ts
const sentenceRng = new Xoshiro128StarStar(deriveXoshiroState(seed, PRISONER_SENTENCE_RNG_STREAM).words);
const priorsRng = new Xoshiro128StarStar(deriveXoshiroState(seed, PRIORS_STREAM).words);
for (let i = 0; i < spec.prisoners; i += 1) {
  const sentenceTicks = drawSentenceLengthTicks(sentenceRng);
  const priors = drawPriors(priorsRng, dist.weightsFor(sentenceTicks / DAY));
  submit(runtime, `admit${String(i)}`, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: sentenceTicks, priorIncidents: priors, ...ARRIVAL }));
}
```

The prison builders are `report-well-tended-prison-gang-reachability.ts`'s
`buildWellRunPrison`, used for W with 8 prisoners and for C with 16, and the
bed-only `buildPrison` of
`tests/integration/gang-retaliation-from-the-admission-surface.test.ts` for N.
All are copied unchanged except the admission loop above.

**The exact enumeration** (`a-540/analytic.mjs`), whose output §5 quotes:

```
Z priors 100.00/0.00/0.00 | intake 63.64/33.33/3.03/0.00 | after first early warning 60.61/36.36/3.03/0.00
A priors 80.00/15.00/5.00 | intake 55.45/33.18/9.09/2.27 | after first early warning 48.48/38.18/11.06/2.27
B priors 60.00/30.00/10.00 | intake 47.27/33.03/15.15/4.55 | after first early warning 36.36/40.00/19.09/4.55
C priors 60.00/29.82/10.18 | intake 47.52/32.73/14.70/5.06 | after first early warning 37.27/39.12/18.55/5.06
```

(The labels here are the probe's again: `A` is Option C and `B` is Option A.)
The "after first early warning" column is `max(intake tier, min(2, sentence
point + priors))`, which is the early-warning write of §4.6 with no findings
and no clean credit.

**The tier trace** behind §4.6's "membership outlasts the tier"
(`a-540/trace3.probe.ts`): prison W, Option A's table, twelve seeds. It lists
every arrival who was tier 3 at tick 1,200:

```
seed 0xcc1 entity 1 priors 2 sentence 56d: tier3 at 1200 -> tier 1 at 48001, gang gang.alpha
seed 0xcc3 entity 1 priors 2 sentence 55d: tier3 at 1200 -> tier 1 at 48001, gang gang.alpha
seed 0xcc5 entity 4 priors 2 sentence 84d: tier3 at 1200 -> tier 2 at 48001, gang gang.alpha
seed 0xcc7 entity 5 priors 1 sentence 84d: tier3 at 1200 -> tier 1 at 48001, gang gang.alpha
seed 0xcc8 entity 6 priors 2 sentence 80d: tier3 at 1200 -> tier 1 at 48001, gang gang.alpha
W/B: intake tier-3 5, still tier 3 at 48001: 0, still in a gang: 5
```

**The crowded-prison removal check** behind §6.2's note
(`a-540/trace2.probe.ts`): prison C, Option A's table, twelve seeds, checked
at tick 2,401. Result: `prisoners removed 3, escape attempts 3`.

**A correction made while writing this draft**, kept so the record reads in
both directions. The first version of §4.6 quoted a one-seed trace taken
under an earlier, discarded probe table (`50/30/20`), not Option A's. It was
re-run under Option A's table, which is the trace above, before this draft
was committed.
