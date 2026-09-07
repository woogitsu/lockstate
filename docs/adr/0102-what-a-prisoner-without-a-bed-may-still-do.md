# ADR 0102: What a prisoner without a bed may still do

> **The number was assigned centrally by the integrator, and this document
> pre-commits to renumbering.** `AGENTS.md`'s rule is that a number is not
> reserved until it appears in `docs/adr/README.md`, and a branch nobody has
> merged is invisible from that index — so if another branch turns up holding
> 0102, this file, its row and every citation of it get renumbered without
> argument, exactly as 0031, 0034, 0035, 0037, 0048, 0049, 0074, 0075, 0076,
> 0083, 0096, 0097, 0098, 0099, 0100 and 0101 each pre-committed.
>
> **The sweep was performed rather than trusted**, on 2026-09-07 from this
> worktree, cut from `origin/main` at `e1739c78` (v0.0.538):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**238 heads**) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
> **All 238 were readable; none failed.**
>
> - The highest four-digit prefix on any head is **0101**, on `origin/main`
>   and on the heads that carry it.
> - **0095 is still held**, on the same branch every prior sweep named — it
>   still carries `0095-what-the-guard-requirement-is-a-requirement-for.md`
>   and still has no row in `docs/adr/README.md`.
> - **Nothing at 0102 or above appears on any of the 238 heads.**
>
> So `max + 1` off **disk** is 0102, the index's own **Next free number** line
> already states 0102, and `max + 1` over the **sweep** is also 0102. All
> three agree, and this document's row landing is what moves the index's line
> to 0103 — `tests/foundation/adr-numbering-contract.test.ts` states it as one
> past the highest number *on disk*, and 0095 is still not on disk.
> `docs/adr/STATUS-QUEUE.md`'s three live restatements of "Next free number"
> are updated to 0103 in the same commit as this file, for the reason its own
> marked corrections there give.

## Status

**Accepted by the owner on 2026-09-07, with one addition.**

**This section read `Proposed. Not self-approved.` until then, and everything
that paragraph and the two below it said is kept exactly as it stood** — per
`docs/AGENT_WORKFLOW.md` §4, a reader should be able to see that this document
was accepted *after* a boundary and a cost had actually been drawn, not
before, and the record of the earlier, narrower ruling that only set the
direction is what makes that visible:

> **Proposed. Not self-approved.** `AGENTS.md` is explicit that the owner
> accepts an ADR and an agent never does; nothing below changes that. What the
> owner has ruled on is the *direction* — that an unhoused prisoner must be
> able to eat and wash while waiting for a bed — and that ruling is recorded
> here in their own words. The document that works the direction out into a
> boundary, a cost and a list of what stays excluded is this one, and it has
> not itself been put in front of them.
>
> **Asked directly** whether the total exclusion from action selection that a
> prisoner below intake stage `completed` receives today is a decision anyone
> took, or an accident of one line the owner should rule on, the owner
> answered:
>
>     ADR: nieulokowany ma móc jeść i się myć
>
> ("ADR: an unhoused [prisoner] must be able to eat and wash.")
>
> **THE DISCLOSURE, BECAUSE A RULING MUST NOT BE MISTAKEN FOR A READING.** The
> question was put as a summary of the finding — that
> `src/simulation/prisoners/action-system.ts`'s per-entity loop excludes a
> prisoner waiting for a bed from *every* action, not merely from sleeping,
> and that no Accepted or Proposed decision anywhere in `docs/adr/` requires
> that — and the owner answered it on that summary, not on a reading of this
> document's Context, Decision or Cost sections below. This is the same
> disclosure ADR 0075, 0076, 0097, 0098, 0099 and 0100 each carry, for the
> same reason: so that nobody later mistakes a ruling given on a summary for
> one given on a reading of the boundary this document actually draws.
>
> **What the ruling settled, and what it left to this document.** It settled
> the *direction* — eating and washing must be reachable without a bed — and
> nothing about *how far* that reaches, *which* intake stages gain it, *which*
> of the six needs it touches beyond the two named, or what it costs the
> incident content those prisoners drive today. Those were Decision, Cost and
> Consequences below, and none of the three had been shown to the owner. The
> status stayed `Proposed` until they had been — which is the acceptance
> recorded above this blockquote.

**THE ACCEPTANCE ITSELF, AND WHAT IT WAS GIVEN AGAINST.** Asked to accept this
document, against a summary of its boundary and its cost rather than against
its own text — the same disclosure ADR 0075, 0076, 0097, 0098, 0099, 0100 and
0101 each carry, for the same reason as the earlier ruling above — the owner
answered:

    Akceptuję, ale dopisz toaletę jako otwarte pytanie

("I accept, but add the toilet as an open question.")

**What the summary put in front of them, so a later reader can see the
acceptance was not given blind.** Two consequences were named explicitly, and
both are exactly true of the document as it stands:

- **The `own-accommodation` boundary leaves bladder relief structurally
  unreachable.** `action.use-toilet` is the only authored action anywhere in
  the catalogue that restores `bladder`, and its target is
  `own-accommodation` — so no reachable action serves that need for a
  prisoner with no assigned cell, and Decision §2 does not propose one. The
  owner's addition, worked out in Open Question 1 below, is exactly this gap.
- **The cost is conditional, and riots do not simply stop.** Cost above's
  need-deficit floor reaches roughly a third only in a covered sector with a
  canteen, a shower and a recreation room all built; with only the named
  fixture's own canteen, in an unguarded sector, the floor is roughly
  five-sixths — still above `DEFAULT_ASSAULT_POLICY`'s threshold on need
  alone. The owner accepted knowing a prison that has built nothing for a
  bedless prisoner is unaffected by this document at all, and that even a
  built one does not stop rioting outright.

**What the acceptance obliges, and what it does not.** It obliges widening
`ActionSystem`'s gate on the structural boundary Decision describes, and it
obliges recording the toilet gap as a first-class open question — Open
Question 1 below is that addition, not an afterthought. It does **not** decide
`failed`'s inclusion (Decision §1's recommendation stays a recommendation),
does not decide work (Decision §2's exclusion stands), does not decide
`SanctionSystem`'s gate (untouched, per Decision §3), and authors no
player-facing string. The implementing pass still owes the measurement named
below before landing anything.

## Claim tiers used below

- **MEASURED** — produced by a run of an instrument named below, with its
  inputs given, so the number can be reproduced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`, and
  where the claim rests on exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form.
- **ARITHMETIC** — computed from constants that were opened, with the
  computation shown so it can be re-run.
- **REASONED** — derived from code that was opened, without a run behind it.
- **REPORTED, not reproduced** — carried from an earlier pass whose code does
  not exist on this branch, so this document could not re-run it.

---

## Context

### 1. The line, and what it actually excludes — VERIFIED, read

`src/simulation/prisoners/action-system.ts`'s `ActionSystem.update` is the
system that puts a prisoner into an action every tick. **Until this document's
Decision was implemented on 2026-09-07**, its per-entity loop opened by
comparing `this.records.intakeStage[index]` against
`intakeStageIndex('completed')` and `continue`-ing on anything that was not
equal to it.

That comparison was the loop's **first** statement, before the `phase` check
that would otherwise route a prisoner to continue performing, continue
travelling, or be planned an idle selection. A prisoner who had not yet reached
intake stage `completed` was therefore excluded from the whole of `update` —
not routed to a narrower set of legal actions, not given a fallback, simply
never considered — and that was true whether they were one tick from being
housed or had been waiting for a bed for the whole of a thirty-day sentence. No
comment sat on that line explaining why the exclusion was total rather than
partial; none existed anywhere else in the file either.

**This paragraph is kept in the past tense rather than deleted, because it is
the finding the whole document rests on and a reader needs to see what was
there. What it no longer does is quote the removed line under
`tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form**: that
contract fails on a verbatim quotation of code that is not in the file it
names, which is exactly what a quotation of a deleted line becomes, and the
answer to it is to describe rather than to restate. The evidence the paragraph
offers is therefore the statement that stands there now:

`if (!ACTION_ELIGIBLE_INTAKE_STAGE_INDICES.has(this.records.intakeStage[index]!)) {`
(verbatim in `src/simulation/prisoners/action-system.ts`)

— whose set is built from `intakeStageIndex` over exactly the two stages
Decision §1 admits, and whose body gives back the claim of a prisoner whose
stage leaves that set mid-action. That last part is an exit this document did
not name and the implementing pass had to add; see "Consequences for existing
sentences" below.

### 2. What happens once a prisoner is admitted and no bed is free — VERIFIED, read

`IntakeSystem.update`'s `accommodation-assignment` stage looks for a free room
instance of the target room type and, failing to find one, does this:

`continue; // stay in accommodation-assignment; retried next scheduled tick`
(verbatim in `src/simulation/prisoners/intake-system.ts`)

There is no timeout and no fallback. The only route out of
`accommodation-assignment` other than a bed becoming free is the *target
itself* not existing anywhere in the prison, which routes to the terminal
`failed` stage and is a structurally different condition — "this prison can
never house this group" rather than "this prison is full right now." A
prisoner with a real target and no free instance of it retries every
scheduled tick, forever, for as long as the prison stays over capacity for
their group.

### 3. `NeedsDecaySystem` does not read intake stage at all — VERIFIED, read

`NeedsDecaySystem.update` walks every live prisoner the query returns and
decays all six needs, with no stage check anywhere in the loop:

`public update(_context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      for (const needId of NEED_IDS) {
        this.needs.setScaled(index, needId, decayNeed(this.needs.getScaled(index, needId), needId, this.schedule.intervalTicks));
      }
    }
  }`
(verbatim in `src/simulation/prisoners/needs-system.ts`)

Decay runs on a prisoner from the tick they are admitted, before
classification, before an accommodation target is even known.
`PrisonerOperationsRuntime.admitPrisoner` writes a prisoner's tile position at
admission, immediately — before `IntakeSystem.submitIntake` is even called —
so every admitted prisoner, at every intake stage, is already standing
somewhere in a security sector and already inside every walk that reads
sector occupants. `queued`, `reception` and `classification` are each held for
about one of `IntakeSystem`'s own five-tick schedule intervals before
advancing, so in practice the stage that matters for how long decay runs
unopposed is `accommodation-assignment`, which — per §2 — can last
indefinitely.

Five of the six needs (`hunger`, `sleep`, `hygiene`, `bladder`, `recreation`)
are restored **only** by an authored action's `needEffectsPerTick`, and every
route to one of those runs through `ActionSystem`, which §1 already excludes
a non-`completed` prisoner from entirely. The sixth, `safety`, does not work
this way, and §5 below is about exactly that difference.

### 4. `SanctionSystem` already treats this as a known gap for its own purpose, and does not decide the general question

`SanctionSystem.update` writes and serves solitary confinement, and it already
refuses to touch a prisoner outside intake stage `completed`:

`if (intakeStageFromIndex(this.records.intakeStage[index]!) !== 'completed') continue;`
(verbatim in `src/simulation/prisoners/sanction-system.ts`)

The comment above that line says why, in its own words: a prisoner "still in
the intake pipeline… is left exactly where `IntakeSystem` left them and
retried on its own schedule" — which means a `solitarySanctionEndTick` can be
*written* for a prisoner waiting for a bed (a riot or an assault can name them
a participant while they are unhoused) and never *served*, because the system
that would move them into solitary and release them from it afterwards only
ever looks at prisoners who are already housed. This document does not touch
that line or that mechanism — see Decision §3 — but the gap it names is real
and is priced in Cost below.

### 5. `safety` already has its own, intake-stage-independent path, and that corrects an assumption an earlier pass made

`SafetyCoverageSystem` — issue #588, the owner's ruling on issue #599 —
provisions `safety` for every occupant a sector's coverage report covers, and
that occupant list is `resolveSectorOccupants`, which has no intake-stage
filter at all (confirmed by reading it: it excludes only a dead entity or one
with no tile position, and includes everyone else the sector's tiles cover).
So `safety`, alone among the six needs, can rise for a prisoner who is still
waiting for a bed, *if* the sector they are standing in is adequately guarded:

| coverage | net rate | outcome for `safety` |
| --- | --- | --- |
| `covered` | **+0.03**/tick | never bottoms; recovers fully |
| `understaffed` | **-0.01**/tick | a 20,400-tick accumulator before it starts costing anything |
| `unguarded` | **-0.05**/tick | decays like every other need |

(rates ARITHMETIC from `SAFETY_COVERAGE_PROVISION_PER_TICK = 0.08`,
`NEED_DECAY_PER_TICK.safety = 0.05` and
`SAFETY_COVERAGE_PROVISION_MULTIPLIER`, all in
`src/simulation/prisoners/needs.ts`, net rate = provision − decay per rung).

**This means an unhoused prisoner's mean need deficit is not always exactly
1.0**, which is worth correcting explicitly because it is the kind of claim
that is easy to overstate: in a `covered` sector, `safety` recovers to full
regardless of whether the prisoner has a bed, and the other five needs still
floor at their maximum deficit because nothing in `ActionSystem` will ever
touch them. The arithmetic this produces is in Cost below; the point here is
narrower — `safety` is not something this document's decision needs to touch,
because the code that provisions it already does not care about intake stage.

### 6. The mechanism that would serve the other five needs already tolerates "no accommodation" without crashing — REASONED

`ActionSystem.prisonProvides` is the function that decides whether the prison
can actually give a prisoner a candidate action, and its `own-accommodation`
branch is exactly the gate that would need to exclude sleep, in-cell meals,
using a toilet and free association for a prisoner with no cell:

`if (action.target.kind === 'own-accommodation') {
      const instanceId = this.coldState.getAccommodation(entityId);
      return instanceId !== undefined && this.roomInstances.getById(instanceId) !== undefined;
    }`
(verbatim in `src/simulation/prisoners/action-system.ts`)

`getAccommodation` returns `undefined` for anyone with no assigned room
instance, so this branch already answers `false` for exactly the actions a
bedless prisoner cannot perform, with no new code. It is not hypothetical
that the surrounding machinery tolerates the answer: `beginNextAction`'s own
docblock already names the case where every `own-accommodation` candidate
fails for one prisoner while a room-catalogue candidate would still resolve,
distinguishing "no legal action had a reachable, available target" from a
housed prisoner's ordinary walk —

`the one thing it still distinguishes is **a prisoner with no accommodation**, who exhausts the walk because every`
(verbatim in `src/simulation/prisoners/action-system.ts`)

— a scenario that, on today's tree, can only be reached by a **housed**
prisoner who loses their accommodation after intake stage `completed` (the
subject of [ADR 0076](./0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)),
because §1's gate never lets an unhoused one reach this code at all. The
control flow this document would rely on is therefore not new: it is
exercised today by a different population, for a different reason, and
behaves exactly as this document needs it to.

### 7. No accepted decision requires the total exclusion

Two documents were checked because an earlier pass attributed the exclusion
to them, and neither requires it.

ADR 0036 records the owner's acceptance of a default security sector, and its
own text never uses the word "action" — checked by search, zero matches. Its
Context §2 is about where the sector's guard post stands, and has nothing to
do with what an occupant of the sector may do. The document does carry a
worked trace, in its Context §8, in which two unhoused prisoners' `safety`
decays for want of a guard on post — that is a claim about one need, made
before `SafetyCoverageSystem` existed to provision it, and it says nothing
about the other five.

ADR 0048 gives `needsPressure` its current shape — the mean deficit over all
six needs, rather than `safety` alone — and its decision 2 measures what that
widened term reads across several prison configurations, including one at "1
bed, 3 prisoners, no amenities." Nothing in that decision, or anywhere else in
that document, calls for an unhoused prisoner to be barred from every action;
the decision is about how a *deficit that already exists* gets averaged into
a sector's risk sample, not about how that deficit comes to exist in the
first place. ADR 0048's own status has never advanced past its filed state,
which is one more reason it cannot be read as authorising a stronger rule than
its own text states.

ADR 0061 gives `'assault'` its scoring formula and uses, as its own worked
illustration, a sector of eight housed prisoners at a moderate deficit and one
unhoused prisoner at a deficit near the ceiling — exactly the dynamic this
document is about, offered there as the *reason a per-prisoner score is
needed*, not as an argued requirement that the ceiling be reached by locking
every action away. That document, too, has never itself been accepted.

**The finding this document rests on is therefore narrow and, as far as this
pass could establish, correct: the total exclusion in `action-system.ts`'s
per-entity loop is not required by anything Accepted or Proposed in this
repository's ADR corpus. It is one line, with no comment, whose effect nobody
appears to have decided on purpose.**

### 8. What the exclusion does to the incident content, mechanically

`IncidentTriggerSystem.tryOpenAssault` ranks every occupant of a sector by a
score that substitutes one prisoner's own need deficit for the sector's mean,
weighted at 1 against a staffing-shortfall weight of 0.3 and a
contraband-severity weight of 0.4, clamped to at most 1, and opens an assault
naming the top two scorers when the top score clears a threshold of 0.65 — all
four numbers read directly from `DEFAULT_ASSAULT_POLICY` in
`src/simulation/incidents/flashpoint.ts`. The occupant list this ranks over,
`resolveSectorOccupants`, has no intake-stage filter (§5), so an unhoused
prisoner is ranked on equal footing with everyone else in the sector — and,
per Cost below, is today the prisoner most likely to top that ranking, by
arithmetic rather than by anything drawn from randomness.

---

## Decision

**Accepted by the owner on 2026-09-07** — see the Status section, which
records the ruling in the owner's own words and discloses that it was given
against a summary rather than against this section's own text, and names the
one addition the owner asked for as part of accepting it.

### 1. Which intake stages gain access to action selection

`ActionSystem.update`'s per-entity gate widens from admitting only intake
stage `completed` to also admitting `accommodation-assignment` — the stage
§2 established has no timeout and is exactly "classified, has a real target
room type, and is waiting for an instance of it to free up." `queued`,
`reception` and `classification` stay excluded, and not merely as a matter of
degree: a prisoner in any of those three has no `classificationGroupIndex`
written yet (it is written during the `classification` stage itself, per
`src/simulation/prisoners/intake-system.ts`), and `ActionSystem.planIdleSelection`
resolves a regime schedule from that group id — so admitting those three
stages is not a smaller version of this decision, it is a different one that
would need a schedule to resolve against something that does not yet exist.

**`failed` is named rather than silently included or excluded.** It shares
one property with `accommodation-assignment` that already has a precedent
elsewhere in the codebase: `DischargeSystem` already groups the two together,
with `completed`, as the stages a sentence runs against —

`const SENTENCE_BEARING_STAGES: readonly IntakeStage[] = ['accommodation-assignment', 'completed', 'failed'];`
(verbatim in `src/simulation/prisoners/discharge-system.ts`)

— so a `failed` prisoner already serves out a real sentence, in the
population, needing the same six things everyone else does, for as long as
that sentence runs. The owner's own words name a prisoner "waiting for a bed,"
and a `failed` prisoner structurally never gets one (ADR 0028 decision 8 keeps
the stage terminal), which is why this document does not fold it in as a
matter of course. But the needs-decay mechanism does not know the difference
between "waiting" and "never coming," and neither does the incident content
it feeds — a `failed` prisoner sits in exactly the same all-five-needs-floored
state as one still in `accommodation-assignment`, for longer, since nothing
ever resolves it. **This document's recommendation is to include `failed`
alongside `accommodation-assignment`, on the `SENTENCE_BEARING_STAGES`
precedent above, and flags this as a place the owner may want to rule
separately from the direction already given**, since "waiting for a bed" does
not, on its most literal reading, describe a prisoner who never gets one.

### 2. Which actions — a structural boundary, not a hand-picked list

The boundary is `action.target.kind`, not a new list of permitted actions.
`ActionSystem.prisonProvides`'s existing `own-accommodation` branch (Context
§6) already answers `false` for a prisoner with no assigned room instance, so
the four actions that require one continue to be unreachable for an unhoused
prisoner with no further change:

`id: 'action.sleep', category: 'sleep', target: { kind: 'own-accommodation' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — sleep, obviously and
inevitably, since it is what a bed *is* for.

`id: 'action.eat-in-cell', category: 'meal', target: { kind: 'own-accommodation' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — a housed prisoner's
alternative to the canteen, not a route the owner's direction needs opened.

`id: 'action.use-toilet', category: 'hygiene', target: { kind: 'own-accommodation' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — the one authored
`bladder`-restoring action in the whole catalogue, and it has no
non-accommodation alternative today. **Bladder relief is therefore not
reachable under this decision, at all, for an unhoused prisoner, and it stays
that way unless a later change authors a room-catalogue-targeted alternative
— which this document does not propose.** This lines up with the owner's own
words: they named eating and washing, not the third bodily need, and the
action catalogue happens to already draw that exact line.

`id: 'action.free-association', category: 'free-association', target: { kind: 'own-accommodation' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — the catch-all "wants
nothing" terminal a housed prisoner's regime always resolves to, also
unreachable without a cell.

What widening the gate *does* reach — because these four actions target a
room catalogue id rather than an accommodation, and `prisonProvides` asks the
room registry rather than `coldState`:

`id: 'action.eat-meal', category: 'meal', target: { kind: 'room-catalog-id', roomCatalogId: 'room.canteen' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — the "eat" the owner
named.

`id: 'action.shower', category: 'hygiene', target: { kind: 'room-catalog-id', roomCatalogId: 'room.shower-room' },`
(verbatim in `src/simulation/prisoners/actions.ts`) — the "wash" the owner
named.

`action.yard-recreation`, `action.common-room-recreation` and
`action.classroom-education` — all `room-catalog-id`-targeted, all in
categories the owner did not name. This document does not exclude them: the
structural boundary is "does this action need a cell," not "did the owner say
this specific word," and a room-catalogue action that serves `recreation`
costs the prison nothing new to reach once the gate is open. Naming a
narrower carve-out that admits `meal` and `hygiene` but not `recreation` would
require a second, arbitrary filter on top of the one the code already
provides for free, and this document does not propose inventing one.

**Work is the one category this document explicitly excludes and does not
decide.** `action.laundry-work`, `action.kitchen-work` and `action.carry` are
also not `own-accommodation`-targeted and would also pass the structural
test above, but a job for a prisoner with no cell to return to at shift's end
raises questions this document does not answer — does an unhoused prisoner
get paid the same way, does a job assignment wait for them the way a bed does,
does `ActionSystem`'s work-block scheduling even make sense for someone with
no fixed regime yet. **The implementing pass must add an explicit
`category !== 'work'` filter** (or equivalent) alongside the widened stage
gate, so that the structural `own-accommodation` test does not silently admit
work by default. Whether an unhoused prisoner should work is a separate
question for a separate document.

### 3. What this decision does not touch

- **`SanctionSystem`'s own gate stays exactly as it is.** An unhoused
  prisoner still cannot begin, or be moved into, a solitary sanction, and a
  `solitarySanctionEndTick` written while they are unhoused still goes
  unserved until they are housed (Context §4). Whether that gap should also
  close is a related but separate question, named here and not decided.
- **The intake stages themselves are unchanged.** `INTAKE_STAGES`'s six
  values, their order, and every transition between them in `IntakeSystem`
  are untouched. This document changes only which stages `ActionSystem` will
  read, not what the stages mean or when a prisoner moves between them.
- **No incident-model weight moves.** `DEFAULT_ASSAULT_POLICY`,
  `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_ESCAPE_ATTEMPT_POLICY` are
  unchanged. Cost below is entirely about what a *different distribution of
  need deficits* does to scores computed by weights that stay exactly as they
  are today.
- **No player-facing string is authored here.** Nothing about this decision
  requires new copy — the panels that already read `intakeStage` and need
  levels keep reading them; this document changes what those numbers *are*,
  not what any sentence says about them. If the implementing pass finds a
  string that needs new wording as a result, `AGENTS.md` reservation 4's
  2026-09-04 release makes the choice of words theirs to make, verified true
  of the code before it ships — not this document's to pre-empt.

---

## Cost, priced

**This is a balance change, and the direction is a real one: an unhoused
prisoner is, by the arithmetic in Context §8, today's single most reliable
source of assault and riot pressure, and this decision is expected to reduce
that.** What follows quantifies what can be quantified without running code
that does not exist on this branch, and names plainly where the honest answer
needs a run this document cannot itself perform.

### How far a bedless prisoner's need deficit can fall, by which rooms exist

`needDeficitOf` is the mean, over `NEED_IDS`, of each need's own deficit
(`(NEED_MAX − level) / NEED_MAX`):

`export const NEED_IDS = ['hunger', 'sleep', 'hygiene', 'bladder', 'safety', 'recreation'] as const;`
(verbatim in `src/simulation/prisoners/needs.ts`)

`sleep` and `bladder` stay floored at deficit 1 under this decision no matter
what the prison has built (Decision §2). `safety` floors at 1 only when the
sector is `unguarded` (Context §5) and is independent of this decision either
way. `hunger`, `hygiene` and `recreation` can each independently drop to 0
deficit, but **only if the prison has built the room type that serves them
without a bed** — a canteen, a shower room, a yard or a common room or a
classroom respectively. ARITHMETIC, holding coverage and room availability
fixed and asking what the floor becomes:

| sector coverage | rooms built for the 3 non-bed-servable needs | best-case deficit floor |
| --- | --- | --- |
| unguarded | none | **1.0** (today's floor, unchanged) |
| unguarded | canteen only (this document's named fixture) | 5/6 ≈ **0.833** |
| covered | canteen only | 4/6 ≈ **0.667** |
| unguarded | canteen + shower + one recreation room | 3/6 = **0.5** |
| covered | canteen + shower + one recreation room | 2/6 ≈ **0.333** |

**This is a floor a well-served prisoner could approach, not a number this
decision guarantees.** A canteen with six seats and thirty prisoners competing
for them does not serve everyone to zero deficit; the actual distribution a
real prison produces is exactly the thing the measurement in the next section
has to establish, and this table is offered only to bound what is arithmetically
possible, not what is typical.

### What that does to the assault score, arithmetically

`scoreAssaultPressure` is `clamp01(needDeficit × 1 + contrabandSeverity × 0.4
+ staffingShortfall × 0.3)` against a threshold of 0.65 (Context §8). Taking
the best-case floors above with zero contraband:

- **Today, unguarded, no amenities**: needDeficit 1.0 alone clamps the score
  to 1.0 — an unhoused prisoner crosses the threshold on need alone, before
  staffing or contraband contribute anything.
- **This document's named fixture (canteen only), unguarded**: 0.833 alone is
  still above 0.65 — the threshold is still crossed on need alone.
- **Canteen + shower + recreation, unguarded**: 0.5 + a fully unguarded
  sector's staffing term (0.3) sums to 0.8, clamped to 0.8 — still above
  threshold, on need plus staffing together.
- **Canteen + shower + recreation, covered**: 0.333 + a covered sector's
  staffing term (0, since the sector is adequately staffed) is 0.333 — well
  under 0.65, and it takes real contraband (any authored severity, scaled by
  0.4, needs only ≈0.04 to close the 0.017 gap to a fully unguarded sector's
  staffing term) to cross it at all.

**Read plainly: this decision helps most where a prison has already built the
rooms a bedless prisoner would need and is adequately staffed, and helps
least, or not at all, in the degenerate one-cell prisons this repository's own
evidence (ADR 0048 decision 2's "1 bed, 3 prisoners, no amenities" row, 15
riots in 30 days at zero guards) already used to argue for the riot
mechanism's threshold.** A prison with nothing built for a bedless prisoner to
use is unaffected by this document at all — its needs floor exactly as they
do today, because there is nowhere for the widened gate to send them.

### The fixture the first pass measured, reported rather than reproduced

An earlier pass reported running one bed, one canteen, two admissions, 20,000
ticks, seed `0x1064` against an unmerged implementation, and recorded that the
unhoused prisoner in that fixture became the instigator of an assault
(severity 3), a participant in three riots (severities 7, 10 and 10), ended at
risk tier 2, and had a `solitarySanctionEndTick` written that the sanction
system's own `completed`-only gate then never served. **This document did not
re-run that fixture: the implementation it measured does not exist on this
branch, and re-running a fixture without the code under test would only
reproduce today's unmodified behaviour.** It is reported here, and named
precisely, because the next section makes it the fixture the implementing
pass owes a repeat of.

---

## The measurement the implementation will owe

Before landing any change described in Decision above, the implementing pass
must run, and report both sides of:

**Fixture: one bed, one canteen, two admissions, 20,000 ticks, seed `0x1064`**
— named exactly so a flattering fixture cannot be substituted for it. Report,
for both the unmodified tree and the tree with this decision implemented:

1. Every incident opened over the run — type, severity, participant and
   instigator entity ids, and tick.
2. Whether the unhoused prisoner's `solitarySanctionEndTick`, if one is
   written, is ever served (per Context §4, it is not, today, regardless of
   this decision — this document does not change `SanctionSystem`, so this
   number is expected to be unchanged and reporting it either confirms that or
   surfaces an interaction nobody anticipated).
3. The unhoused prisoner's own need levels — all six, sampled at the same
   cadence — across the run, so the arithmetic in Cost above can be checked
   against what a real contested canteen actually produces rather than the
   best-case floor this document could only bound.
4. `needsPressure` for the sector, sampled the same way, so the effect on the
   *riot* trigger (sustained-mean, not one prisoner's own score) is visible
   alongside the effect on the assault trigger this document's arithmetic
   addresses directly.

A second run, with a shower room and a yard added to the same fixture, is
recommended but not owed to the same standard — it exercises the wider end of
the arithmetic table above and would settle whether the "canteen only"
numbers or the "full amenities" numbers describe the change a player actually
experiences.

---

## Consequences for existing sentences

`tests/integration/over-admission-signal.test.ts`'s own docblock argues, in
its own words, that admitting a prisoner the prison cannot house is
deliberately not refused, because doing so would close the route into a
sector's needs pressure crossing threshold, and separately records that
*that* refusal decision — accepting the admission — is the owner's decision
on issue #549. This document does not reopen that decision: the admission
still happens, and is still accepted. What it changes is what the resulting
occupant's need deficit looks like over time, which is a premise the same
docblock's *surrounding* argument leans on without asserting a specific
number for. Whoever revisits that test file after this decision ships should
re-read whether its own reasoning about *how* an unhoused arrival drives
sector pressure still describes the mechanism accurately, since the number
that mechanism produces is what Cost above changes.

ADR 0061 decision 2's own worked illustration — a sector of several housed
prisoners at a moderate deficit and one unhoused prisoner at a deficit near
the ceiling, offered there as the reason a per-prisoner assault score is
needed at all — describes today's arithmetic accurately and would describe a
narrower gap after this decision, in exactly the prisons Cost above's table
shows the widest room to move. The illustration's *conclusion* — that a
sector-mean score can hide one person's crisis, which is why the assault
score exists — is untouched; only the specific numbers in the illustration
would no longer be the numbers a similarly-configured prison produces.
Neither of these is an ADR-status sentence and neither is quoted verbatim
here, in keeping with the same reason the Context above does not restate
another ADR's status in predicative form.

---

## The weakest claim in this document, named

**The Cost section's arithmetic bounds what is possible; it does not measure
what a contested canteen actually produces.** Every deficit-floor number in
the table above assumes the relevant room fully serves the prisoner who needs
it, which is the same optimistic assumption ADR 0098's own weakest-claim
section warns against making about an un-run measurement. A canteen sized for
a housed population, now also serving prisoners who have nowhere else to eat,
may leave an unhoused prisoner's `hunger` only partly served rather than
fully — which would put the real deficit somewhere between today's floor and
this document's best case, not at the best case itself. The measurement this
document commits the implementing pass to, above, is the only way to learn
where in that range a real prison actually lands, and until that run exists,
every number in Cost above should be read as a bound rather than a forecast.

---

## What would change my mind

- **The owed measurement showing no meaningful movement.** If the named
  fixture's before/after incident counts are close enough that the
  arithmetic in Cost above turns out not to matter in practice — because
  canteen contention keeps the real deficit near today's floor even with the
  gate widened — the direction the owner chose would still be right on its
  own terms (an unhoused prisoner should be able to eat and wash), but this
  document's claim that it meaningfully reduces incident pressure would be
  wrong and should be corrected rather than left standing.
- **A reading of `failed`'s treatment that disagrees with Decision §1's
  recommendation.** The `SENTENCE_BEARING_STAGES` precedent is real, but it
  was authored for `DischargeSystem`'s question (does a sentence's clock run),
  not for this one, and the owner's own words describe "waiting," which
  `failed` structurally is not.
- **A fifth room type that serves one of the three reachable needs without a
  bed and without a `room-catalog-id` target**, which would mean the
  structural boundary in Decision §2 needs a second case rather than the one
  branch `prisonProvides` already has.

## Open questions

1. **Bladder relief has no reachable action under this decision, and closing
   that gap is not decided here — added at the owner's own request on
   acceptance.** `action.use-toilet` is the only entry in `DEFAULT_ACTIONS`
   whose `needEffectsPerTick` names `bladder` at all — confirmed by search,
   one hit — and its target is `own-accommodation`:

   `id: 'action.use-toilet', category: 'hygiene', target: { kind: 'own-accommodation' },`
   (verbatim in `src/simulation/prisoners/actions.ts`)

   `requiredObjectCapability: 'sanitation', needEffectsPerTick: { bladder: 5 }, minDurationTicks: 10,`
   (verbatim in `src/simulation/prisoners/actions.ts`)

   So no action this decision makes reachable, and no action anywhere in the
   catalogue, restores `bladder` for a prisoner with no assigned cell — the
   need floors at deficit 1 for the whole of `accommodation-assignment` (and
   `failed`, if Decision §1's recommendation is taken), exactly as it does
   today, and Decision §2 already says so plainly rather than in passing.
   **This is a known, unresolved problem, not a side effect for a later pass
   to rediscover.** Closing it is not a boundary question this document can
   answer by redrawing the `own-accommodation` line: it would need **a
   non-cell sanitation action that does not exist in the catalogue today** —
   new content (a room-catalogue-targeted fixture, or a standalone facility,
   with its own object capability and its own footprint rules) — which is new
   content and its own decision, not a corollary of the structural boundary
   Decision §2 already draws. This document deliberately does not take it:
   authoring a fixture and an action to serve one need is a different scope
   than deciding which existing actions an unhoused prisoner may already
   reach, and conflating the two would have made this document's own
   Decision harder to implement cleanly for no gain to the direction the
   owner ruled on. The owner accepted this document with the gap named
   rather than closed, and asked for exactly this entry.
2. **Should `failed`-stage prisoners be included alongside
   `accommodation-assignment`?** Decision §1 recommends it and names why; the
   owner's own words describe a narrower case than the codebase's own
   `SENTENCE_BEARING_STAGES` grouping does.
3. **Should work be opened to an unhoused prisoner in a later document?**
   Decision §2 excludes it and names the open questions (pay, job
   persistence, regime scheduling) a future ADR would have to answer.
4. **Should `SanctionSystem`'s gate widen the same way this one does?**
   Context §4 names the gap — a sanction can be written against an unhoused
   prisoner and never served — without arguing either side of closing it.
5. **What does a second amenity configuration (shower and yard added to the
   named fixture) actually measure?** Named in "The measurement the
   implementation will owe" as recommended, not owed, and would settle which
   row of the Cost table describes a real prison rather than the theoretical
   ends of it.
