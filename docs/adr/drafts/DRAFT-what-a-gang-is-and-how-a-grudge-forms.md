# ADR DRAFT: What a gang is, and how a grudge forms

> **This document carries no number, deliberately.** `AGENTS.md` states that
> ADR numbers are assigned centrally after drafts return and that *"A number is
> not reserved until it appears in `docs/adr/README.md`"*, so this draft takes
> none and pre-commits to being renumbered, retitled into the
> `NNNN-kebab-case.md` form, given its row in the index and moved up one
> directory without argument, exactly as every numbered ADR in this corpus
> pre-committed before it.
>
> **WHY IT IS IN `docs/adr/drafts/` AND NOT DIRECTLY IN `docs/adr/`, MEASURED
> RATHER THAN PREFERRED.** The brief that commissioned this document asked for
> it at `DRAFT-what-a-gang-is-and-how-a-grudge-forms.md` directly inside
> `docs/adr/` **and** asked
> for `tests/foundation/` to be green. Those two are mutually exclusive on this
> tree and it was checked rather than assumed: a file of that name placed
> directly in `docs/adr/` fails **five** assertions in
> `tests/foundation/adr-numbering-contract.test.ts` — the filename is not
> `NNNN-kebab-case.md`, its four-character prefix `DRAF` is not a number that
> matches any heading, the index holds no row for it, no row links to it, and
> the stated next free number becomes `0NaN`. That test's own allow-list
> comment says why it must be that strict: `SUPPORTING_DOCUMENTS` is
> *"An explicit allow-list rather than a `!/^\d{4}-/` filter"* precisely so a
> misnamed ADR is *"a malformed one"* rather than silently exempt.
>
> A subdirectory is skipped by that test's `statSync(...).isFile()` filter, so
> the exact filename the brief asked for survives, one directory down, and the
> whole foundation suite stays green — measured below under "The gates". This
> is a deviation from the brief and it is named here rather than buried in a
> report.

## Status

**Proposed. Not self-approved.** Nothing in this document is accepted, and the
agent that wrote it does not accept it. `AGENTS.md` reserves acceptance to the
owner and `docs/AGENT_WORKFLOW.md` §3 repeats it (*"never self-approve one"*).

**What the owner has already ruled, in their own words, on 2026-09-08.** Asked
whether the game should have gangs at all, they answered:

    Tak, ale najpierw ADR

("Yes, but the ADR first.")

**THE DISCLOSURE, BECAUSE A RULING MUST NOT BE MISTAKEN FOR A READING.** That
answer was given to a *question* — should prisons have gangs — and not against
this document's Context, Decision, Cost or Open Questions, none of which
existed when it was given. It settles the product question issue #979 named as
the owner's (*"Whether prisons should have gangs at all"*) in the affirmative
and settles nothing else. Every "how" below — what a gang is, how many there
are, where membership comes from, what produces a grudge, what the territory
amplifier is for, and what the first retaliation does to a prison — is this
document's, and is unaccepted until the owner reads it. The same disclosure
several ADRs in this corpus carry, for the same reason.

**What this draft does NOT do.** It authors no production code, seeds no gang,
adds no locale key, and changes no player-visible string. `AGENTS.md`'s fourth
reservation covers the *promise*, not the wording, and the sentence at issue
here already exists; this document's business with it is to say what would make
it true, not to rewrite it.

## Claim tiers used below

- **VERIFIED, read** — a source file was opened at the cited `file:line` on
  this branch, and where the claim rests on exact text, the text is quoted
  under `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form.
- **ARITHMETIC** — computed from constants that were opened, with the
  computation shown so it can be re-run.
- **REASONED** — derived from code that was opened, without a run behind it.
- **MEASURED** — produced by a run of an instrument named here, with its
  inputs given.
- **REPORTED, not reproduced** — carried from a test file or an earlier pass
  that states the number, without this document re-running it.

**Every anchor below was read at `491fcdce` (v0.0.541), off `origin/main`.**
Issue #979 was written against v0.0.467 and several of its anchors have since
moved; where one has, both numbers are given, because a reader checking the
issue against this document deserves to see which of us moved.

---

## Context

### 1. The three writers, and the issue's "decisive" claim — VERIFIED, read

Issue #979's central table is correct on this tree. `GangRegistry` declares
three writers and `src/` calls none of them:

| link in the chain | method | callers in `src/` | anchor, read at `491fcdce` |
| --- | --- | --- | --- |
| a gang exists | `GangRegistry.register` | none but `loadSnapshot` | `src/simulation/incidents/gangs.ts:26` |
| a prisoner belongs to one | `GangRegistry.addMember` | none but `loadSnapshot` | `src/simulation/incidents/gangs.ts:37` |
| one gang has wronged another | `GangRegistry.addGrudge` | **none at all** | `src/simulation/incidents/gangs.ts:86` |

`grep -rn "addGrudge" src/` returns one hit on this tree, the declaration
itself. The registry is constructed bare and nothing writes to it —
`const gangs = new GangRegistry();` (verbatim in
`src/simulation/runtime/new-session.ts`), at `:543`, exactly where the issue
says.

**The issue's claim that `addGrudge` is the decisive one is correct**, and the
line it rests on reads exactly as it says:
`if (grudge === 0) return 0;` (verbatim in
`src/simulation/incidents/gangs.ts`), at `:140`. So a session that seeded every
gang and assigned every prisoner to one would still open no retaliation.

**One correction to the issue's grep, and it does not weaken the finding.**
`grep -rn "addGrudge" src/` returns one hit;
`git grep -n addGrudge -- src tests benchmarks` returns **thirteen**, because
`tests/helpers/determinism-scenario.ts:241` and two unit-test files call it —
one of which is the shared determinism scenario, not a test of gangs. That matters in one direction only: the downstream
chain has *already been exercised end to end* by a fixture that hand-seeds two
gangs and a grudge, so this document is not proposing an untried path. It does
not weaken "no producer in `src/`", which is the claim the issue makes and
which holds.

### 2. There is a fourth gate above the three, and the issue does not name it — VERIFIED, read

`tryOpenRetaliation` does not walk grudges. It walks the *sector's claimants*
first and only then filters grudges to those the claimant holds:

`const claimants = this.gangs.gangsClaiming(sectorId);` (verbatim in
`src/simulation/incidents/trigger-system.ts`)

`for (const offendedGangId of claimants) {` (verbatim in
`src/simulation/incidents/trigger-system.ts`)

Both are at `:524-525`. So **a gang with an empty `territorySectorIds` can hold
a grudge for ever and never act on it**: it is never a claimant, so the outer
loop never selects it as `offended`. "A gang exists" is therefore not the
first writer's job — "a gang exists *with territory in a watched sector*" is.
An implementation that registers gangs with no territory satisfies the issue's
first row and still produces nothing. This is stated because it is the exact
shape of mistake this repository has paid for before: a writer added, a
downstream gate unnoticed, and the symptom unchanged.

### 3. The territory amplifier is not merely degenerate — at the default threshold it is load-bearing — ARITHMETIC

The issue says the `× 1.5` amplifier *"is always on"* because there is one
sector. **The first half of that is true and the second half is a weaker
reading than the code supports.**

What is true about the sector count, verified: exactly one sector id is ever
watched in a session a player can start.
`if (!targets.watchedSectorIds.includes(definition.id)) targets.watchedSectorIds.push(definition.id);`
(verbatim in `src/simulation/security/default-sector.ts`), at `:283`, and the
id it pushes is the constant `DEFAULT_SECURITY_SECTOR_ID`
(`src/simulation/security/default-sector.ts:68`).

Now the arithmetic, off constants that were opened:

- `addGrudge` clamps to `[0,1]` (`src/simulation/incidents/gangs.ts:89`).
- `resolveRetaliationRisk` returns
  `return Math.max(0, Math.min(1, contested ? grudge * 1.5 : grudge * 0.5));`
  (verbatim in `src/simulation/incidents/gangs.ts`), at `:143`.
- The gate is `if (risk < this.retaliationThreshold) continue;` (verbatim in
  `src/simulation/incidents/trigger-system.ts`), at `:529`, and the threshold
  defaults to `0.6` (`src/simulation/incidents/trigger-system.ts:262`).

So:

- **Uncontested**: `risk = grudge × 0.5 ≤ 1 × 0.5 = 0.5`, and `0.5 < 0.6`.
  **The dampened branch can never open an incident at the default threshold,
  at any sector count, for any grudge weight.** It is not "the case that does
  not happen to arise today"; it is arithmetically dead.
- **Contested**: `risk = min(1, grudge × 1.5) ≥ 0.6 ⟺ grudge ≥ 0.4`.

The repository already knows this and wrote it down in a test comment:
`gangs.addGrudge('gang-north', 'gang-south', 0.5); // 0.5 * 0.5 = 0.25, below the 0.6 threshold`
(verbatim in `tests/unit/incident-trigger.test.ts`), at `:281`.

**The consequence for this document's Decision.** The amplifier is not an
optional flourish that a second sector would switch off. Retaliation *only*
exists on contested ground. So "should the `× 1.5` ever not apply?" is the
wrong question; the right one is "should there be a path to a retaliation that
is not on contested ground at all?", and Decision §3 answers it.

**A second, narrower correction to the issue.** The uncontested branch is
reachable *as a computation* even with one sector, whenever the offended gang
claims it and the offending gang does not. It just cannot clear the threshold.
So the issue's *"every pair of gangs contests it"* is true only of gangs that
all claim the one sector, which is a property of the seeding this document has
yet to decide, not a property of there being one sector.

### 4. A retaliation is the last gate in the update loop, behind three others — VERIFIED, read

`IncidentTriggerSystem.update` (`src/simulation/incidents/trigger-system.ts:294-333`)
runs, per sector, in this order: bail out if any incident is open in the sector
at all; try a riot; try an escape attempt; try an assault; and only then, last,
`this.tryOpenRetaliation(sectorId, context.tick);`
(`src/simulation/incidents/trigger-system.ts:333`). The system's cadence is
`intervalTicks: 50` (`src/simulation/incidents/trigger-system.ts:232`).

**REASONED, from those gates**: in a prison hot enough to be producing
assaults, a retaliation can only open in the trough *after* one — the assault
takes the sector's single open slot while it runs, and its own per-type quiet
window (`DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT = 2_400`,
`src/simulation/incidents/trigger-system.ts:125`) then holds the assault
producer off for 2,400 ticks while leaving the retaliation gate open, since the
quiet windows are per type. That trough is where the mechanism this document
proposes actually lands, and it is a reason to prefer the assault as the grudge
producer rather than an argument against it.

### 5. Every gang retaliation that opens locks the whole prison down — ARITHMETIC

- Severity is
  `severity: Math.max(1, Math.min(10, Math.round(risk * 10))),` (verbatim in
  `src/simulation/incidents/trigger-system.ts`), at `:538`.
- `risk ≥ 0.6` by the gate above, so **severity ≥ 6**, always.
- The lockdown line is
  `if (incident.severity >= this.policy.lockdownSeverityThreshold) {` (verbatim
  in `src/simulation/incidents/response-system.ts`), at `:551`, and the policy
  is `lockdownSeverityThreshold: 6,` (verbatim in
  `src/simulation/incidents/response-system.ts`), at `:29`.

So the *minimum-severity* gang retaliation is exactly at the lockdown
threshold. There is no mild one. And because there is one sector and it covers
the whole prison (Context §3), the lockdown is prison-wide: the responders'
docblock states the scope in its own words — *"this system's own lockdown locks
every door in the incident's sector"*
(`src/simulation/incidents/response-system.ts:125-126`).

Responder demand, same arithmetic:
`return Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint));`
(verbatim in `src/simulation/incidents/response-system.ts`), at `:352`, against
`respondersPerSeverityPoint: 0.5,` (verbatim in
`src/simulation/incidents/response-system.ts`), at `:26` — so **3 unassigned guards at
severity 6 and 5 at severity 10**, on top of the guards `DeploymentSystem` has
already posted, or the incident lapses on `responseDeadlineTicks: 600`
(`src/simulation/incidents/response-system.ts:27`).

**The lockdown only fires if a response is actually mounted** — the line above
sits inside `mountResponse` (`src/simulation/incidents/response-system.ts:545`),
which runs after guards are claimed. A prison with nobody spare gets the
incident and the lapse without the lockdown.

### 6. A gang retaliation can open today with an empty participant list, and that is what would make the sentence false — VERIFIED, read

Participants are the union of both gangs' members:
`const participants = [...this.gangs.membersOf(offended), ...this.gangs.membersOf(offending)].sort((a, b) => a - b);`
(verbatim in `src/simulation/incidents/trigger-system.ts`), at `:531`.
`IncidentLog.open` (`src/simulation/incidents/incident.ts:239`) validates
nothing about that list's length.

This is not hypothetical. An existing unit test registers two gangs with **no
members at all**, adds a grudge, and asserts an incident opens
(`tests/unit/incident-trigger.test.ts:278-297`); a second registers one member
on one side only and replays it for determinism
(`tests/unit/incident-trigger.test.ts:301-315`). So today's code will open a
prison-wide, severity-≥6, "Two gangs are settling a score." incident involving
**nobody**.

Membership is not static either: a released prisoner is forgotten —
`surfaces.gangs?.removeMember(entityId);` (verbatim in
`src/simulation/prisoners/release.ts`), at `:211` — so a gang can be emptied
between the tick a grudge is recorded and the tick it is acted on. Any
implementation that seeds gangs must close this, or the first thing a player
sees is a lie about their prison.

### 7. The player-facing sentence, and exactly what makes it true — VERIFIED, read

`'hud.alert.event.incidents.gang-retaliation-opened': 'Two gangs are settling a score.',`
(verbatim in `src/content/default-locale-en.ts`), at `:1294` — the issue cites
`:1149`, which is where it was at v0.0.467.

The row is graded `severity: 'danger'` on both the band and the log
(`src/ui/simulation-events.ts:537-541`), and it **takes no parameters at all**:
its event kind falls through the `return {};` arm of both the parameter
resolvers (`src/ui/simulation-events.ts:1207`, `:1335`). That is a useful fact
for this decision, not a defect — it means a gang needs no `nameKey` before
this mechanism can ship, because no gang's id ever reaches the screen.

So the sentence makes exactly two assertions and both are structural:

1. **"Two gangs"** — the trigger opens a retaliation for exactly one
   `(offended, offending)` pair, so exactly two gangs are named by construction.
   **True the moment two gangs exist.**
2. **"settling a score"** — there is an outstanding, directional grudge, and it
   is discharged rather than retained:
   `this.gangs.clearGrudge(offended, offending); // acted on -- not a permanent standing grievance`
   (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:546`.
   **True the moment a grudge has a real cause.**

What is *not* guaranteed by the code today is that anybody is doing the
settling (Context §6). That is the only respect in which the existing sentence
could ship false, and Decision §4 closes it.

The HUD already says all of this against itself, which is why this is a gap
rather than a hidden defect: *"It is graded on that rather than on anything
measured in play, because nothing in `src/` seeds a gang -- `GangRegistry.addMember`
is reached only from `loadSnapshot` -- so no session a player can start opens
one today. The grade is what the code would do if one did, and it is here so
that seeding gangs is not also a copy decision."*
(`src/ui/simulation-events.ts:130-136`; the issue cites `:107-114`, its
position at v0.0.467).

### 8. Everything downstream is built and persisted, including the grudges — VERIFIED, read

The incident type is in the persisted enum
(`src/persistence/save-schema.ts:939`), the protocol event is registered
(`src/simulation/protocol/types.ts:1729`, payload schema at `:2032`), the
message census carries a label (`src/content/simulation-message-keys.ts:268`),
and both projections enumerate all four types
(`src/simulation/presentation/incident-projection.ts:149`,
`src/simulation/presentation/status-strip-projection.ts:428`).

**The registry's whole state is already in the save envelope** — definitions,
members, reputation and grudges — at `src/persistence/save-schema.ts:971-977`,
written at `src/simulation/runtime/session-systems.ts:680` and read back at
`:964`. So issue #979's expectation that a save round trip is "free" is
correct, with one caveat worth pricing: the definition schema is
`.strict()`, so **adding any field to `GangDefinition` is a schema edit**, not
a no-op. An *optional* field would not move `SAVE_SCHEMA_VERSION` under the
three conditions `docs/PERSISTENCE.md` sets and
`src/persistence/save-schema.ts:182-200` works through for two precedents, but
it is still a reviewed edit rather than free.

### 9. The assault already carries everything a grudge producer needs — VERIFIED, read

- An assault names exactly two participants
  (`ASSAULT_PARTICIPANT_COUNT = 2`, `src/simulation/incidents/flashpoint.ts:343`)
  and one of them as the instigator: `instigatorId: worst.entityId,`
  (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:450`.
- `GangRegistry.getGangOf` already exists
  (`src/simulation/incidents/gangs.ts:52`).
- There is already **one door** both terminal transitions of an assault go
  through, already narrowed to exactly this case:
  `if (incident.type !== 'assault' || incident.instigatorId === undefined) return;`
  (verbatim in `src/simulation/incidents/response-system.ts`), at `:328` —
  inside `adjudicateAssaultIfAny`, whose own docblock states why it is a single
  method: *"so the two call sites cannot drift about which incidents earn a
  sanction or which participant it lands on"*
  (`src/simulation/incidents/response-system.ts:326`).
- That door already carries an injected, defaulted port of exactly the shape a
  second consumer needs — `onAssaultAdjudicated`
  (`src/simulation/incidents/response-system.ts:218`) — whose docblock argues
  the pattern: *"The same narrow injected-port shape `onPrisonerEscaped` is,
  for the same reason"* (`src/simulation/incidents/response-system.ts:212-213`).

So the issue's proposal — *"the natural producer is an existing incident: an
assault whose two participants belong to different gangs"* — lands on a seam
that already exists, is already tested, and already has a second occupant. It
is the cheapest correct place, and Decision §2 takes it.

### 10. Nothing in the incident tree draws random numbers, and this decision keeps it that way — VERIFIED

`grep -c "rng" src/simulation/incidents/*.ts` returns **0** for all ten files
on this tree, exactly as the issue says. Six named RNG streams are registered
in a new session (`src/simulation/runtime/new-session.ts:440-483`; the
constants are at `:78`, `:81`, `:83`, `:104`,
`src/simulation/prisoners/sentence.ts:47` and
`src/simulation/identity/actor-identity.ts:188`). A seventh would be a
save-compatibility question that `src/simulation/runtime/new-session.ts:471-478`
sets out in full. **This document proposes no new stream** (Decision §5).

### 11. The issue's provenance note is not on `main` — VERIFIED

Issue #979 cites its research as `2026-09-04-what-difficulty-would-take.md`
§2.3, under `docs/research/`. **That file does not exist on `origin/main`.** It lives on the unmerged
branch `research/what-difficulty-would-take` (commits `73b1af30`, `8c20d7a9`),
and `git merge-base --is-ancestor 73b1af30 origin/main` returns non-zero. Its
§2.3 was read out of that branch for this document and says what the issue says
it says.

This is recorded for two reasons. First, a reader following the issue's own
citation from `main` finds nothing and may conclude the finding is unsupported.
Second, it is why this document names that note by title and branch rather than
by a rooted path in backticks: `documentation-links-contract.test.ts` fails a
dangling rooted path, and it already failed on that exact note once — the
branch's own commit message records the run.

One fact worth carrying over from it: the effective **floor** on a gang
retaliation's severity is 6, not the 7 an earlier brief assumed, and it is 6
*because* the threshold is 0.6. Context §5 re-derives that here rather than
relying on it.

---

## Decision

Nothing here is accepted. Each numbered item is a question this document
answers so the owner can disagree with a specific sentence rather than with a
direction.

### 1. What a gang is: a claim on territory, not a badge on a prisoner

A gang is a `GangDefinition` — an id and a set of claimed sector ids — seeded
**once per prison, at session creation**, alongside the default security
sector, and persisted from that moment like every other registry.

**Two gangs, both claiming the one default sector.** Not one — a single gang can
hold no grudge against anyone, and `addGrudge` throws on a self-grudge
(`src/simulation/incidents/gangs.ts:87`). Not more than two either, and that
half is REASONED rather than shown by anything above: with one sector every
pair of claimants contests the same ground on identical terms (Context §3's
arithmetic), so a third gang multiplies the pairs without producing any new
*kind* of situation, while tripling the chance that a released prisoner leaves
one of them empty (Context §6). Two is the smallest number the mechanism needs
and the largest one sector can distinguish.

**A gang with no territory is not seeded.** Context §2 established that such a
gang is structurally inert. Seeding one would be authored content that provably
does nothing, which is the class of defect issue #979 exists to close, repeated
one level down.

**No `nameKey`, and no gang reaches the player by name.** Context §7 showed the
alert takes no parameters, so naming gangs is not a prerequisite. Leaving it
out keeps the `.strict()` definition schema untouched (Context §8) and keeps
this decision clear of `AGENTS.md`'s fourth reservation entirely. If gang names
are wanted later they are a separate decision with a separate cost.

### 2. Where a grudge comes from: an assault the player already watched

**A grudge is written when an adjudicated assault's instigator and victim
belong to different gangs, and at no other time.**

The producer hangs off `adjudicateAssaultIfAny`
(`src/simulation/incidents/response-system.ts:327-330`) through a second
injected port beside `onAssaultAdjudicated`, taking the incident's
`instigatorId` and the other participant. Concretely: the offending gang is the
instigator's, the offended gang is the victim's, and
`addGrudge(offendedGangId, offendingGangId, weight)` is called only when both
lookups return a gang and the two differ.

**Why adjudication rather than the moment the assault opens.** The incident is
terminal there — resolved or lapsed — so the grudge is recorded *after* the
player has seen the assault run its course, and the sector's single open-incident
slot is free (Context §4). Writing it at open would create a grudge that could
in principle be acted on while the assault it came from is still being
contained, which reads as two incidents about one event.

**Why not a die roll, a timer, or a scheduled injection.** Three reasons, in
descending strength:

1. It keeps the incident tree free of RNG (Context §10), which is the property
   the whole subsystem was built to have.
2. It makes retaliation *legible*: the player can point at the assault that
   caused it. An injected event cannot be pointed at, and the difficulty
   framing issue #979 makes — that this is the one incident type that is
   *social* rather than another reading of the same two pressure terms — is
   only true if the social event has a social cause.
3. It costs no new state. The alternative producers considered and rejected
   are recorded in Open Question 3.

**Weight: one assault, one grudge unit, and the unit is a decision the owner
should see rather than a constant an implementer picks.** From Context §3, a
retaliation needs `grudge ≥ 0.4`. So a weight of `0.4` makes every
cross-gang assault produce a retaliation; `0.2` makes it every second one;
`0.15` every third. **This document recommends `0.2`** — two cross-gang
assaults buy one retaliation — on the reasoning that one is indistinguishable
from "an assault sometimes escalates" and three is far enough away that a
player would never connect the two events. It is a directional default in the
same sense `retaliationThreshold` calls itself one
(`src/simulation/incidents/trigger-system.ts:261`), and it is named here so a
balance pass has something specific to disagree with.

**"Two assaults" means two in the SAME direction, and this is the part an
implementer will get wrong.** Grudges are keyed
`` `${offendedGangId}->${offendingGangId}` `` (`src/simulation/incidents/gangs.ts:82`),
so an assault by a member of gang A on a member of gang B and an assault by a
member of B on a member of A accumulate under **two different keys** and
neither reaches 0.4. At weight 0.2 a prison whose cross-gang assaults alternate
direction never retaliates at all. That is arguably correct — a score that is
already even is not a score to settle — but it is a consequence of the
directional key rather than a decision anyone took, so it is named here and
carried into the measurement below (item 5 asks for the whole ledger, not just
the incident).

### 3. The territory amplifier stays, and the reason is now stated rather than assumed

**Keep `× 1.5` / `× 0.5` exactly as written, change nothing in
`resolveRetaliationRisk`, and accept that with one sector the amplifier is
always on.**

The issue's acceptance criterion offers two ways out — *"either has a case
where it is not applied, or the issue records that with one sector it is always
on and that is accepted"*. This document takes the second, and Context §3 is
why the first is not available: the dampened branch cannot clear the default
threshold at any grudge weight, so "a case where it is not applied" is not a
case where a retaliation happens more quietly, it is a case where **nothing
happens**. Manufacturing one would mean either lowering `retaliationThreshold`
below 0.5 — which changes the meaning of every fixture that pins it — or
seeding a territory-less gang, which Decision §1 refuses on separate grounds.

**What is accepted, said plainly so a later reader does not have to infer it:**
with one sector and two gangs that both claim it, `contested` is always `true`,
`resolveRetaliationRisk` is always `grudge × 1.5` clamped, and the entire
`× 0.5` branch is unreachable in a session a player can start. That branch is
**not dead code to delete**: it becomes reachable the moment sectors multiply,
which is the same shape of argument ADR 0061's open question 4 makes about
cell-sharing, and deleting it would have to be undone by whoever draws the
second sector.

### 4. The trigger must refuse a retaliation nobody is in

**`tryOpenRetaliation` gains one guard: skip the pair unless both
`membersOf(offended)` and `membersOf(offending)` are non-empty.**

This is the one change this document requires to code that already exists, and
Context §6 is the whole argument: without it, a released prisoner emptying a
gang between the grudge and the retaliation produces a prison-wide lockdown, a
severity-≥6 danger alert, and the sentence *"Two gangs are settling a score."*
with an empty participant list. That is precisely the promise-without-code that
`AGENTS.md`'s fourth reservation exists to prevent, and it is reachable from
the mechanism this document proposes rather than a theoretical concern.

It is a **narrowing** of an existing gate, not a lowered floor, and two
existing unit tests would have to be given members to keep asserting what they
mean: one registers two gangs with no members at all and asserts an incident
opens (`tests/unit/incident-trigger.test.ts:278-297`), and one replays a
scenario in which only the offended side has a member
(`tests/unit/incident-trigger.test.ts:301-315`). Extending a fixture so it
describes a prison that can exist is not weakening an assertion; the assertions
themselves — that an incident opens, and that it replays identically — are
untouched.

### 5. What this decision does not touch

- **No new RNG stream.** Membership assignment (Decision §6) is deterministic.
- **No new locale key and no changed string.** The one sentence involved
  already exists and this document does not edit it.
- **No change to `retaliationThreshold`, to the severity formula, to
  `lockdownSeverityThreshold`, or to any response policy constant.** Context §5
  prices what those produce; changing them is a balance decision this document
  deliberately leaves whole.
- **No server-side surface, no migration, no deploy configuration.** Nothing
  here goes near `AGENTS.md`'s first three reservations.
- **No gang reputation writer.** `adjustReputation`
  (`src/simulation/incidents/gangs.ts:71`) stays unwritten. Its docblock
  describes standing *"raised by successful retaliation, lowered when a gang's
  own incident is contained"* (`src/simulation/incidents/gangs.ts:21`), which
  is a second mechanism with its own consequences and no reader anywhere;
  adding it here would be scope this document has not priced. Open Question 4.

### 6. Membership: assigned at intake, deterministically, from the classification the prison already draws

**A prisoner joins a gang at admission, by a rule over state intake already
computes, and not by a new random draw.**

Intake already classifies every arrival on the `prisoners.classification`
stream (`src/simulation/prisoners/intake-system.ts:224`) into a risk tier and a
classification group. The recommendation is: **`high-risk` arrivals join a
gang; everyone else joins none**, and which of the two gangs is chosen
alternates on the arrival's entity id parity, which is recorded input and needs
no stream.

Two properties this buys, both of which matter more than the rule's elegance:

- **It is deterministic and adds no draw**, so no existing seed's prisoner
  classification shifts — the failure mode
  `src/simulation/runtime/new-session.ts:446-452` spells out at length for a
  shared stream.
- **It ties gang membership to the one prisoner attribute the player can
  already see and already influences**, so "why is my prison full of gang
  members" has an answer the player can act on.

**This is the weakest of the six decisions and is flagged as such**, see "The
weakest claim in this document, named". A defensible alternative — every
arrival joins a gang, so the mechanism does not depend on high-risk arrivals
being reachable at all — is Open Question 2.

### 7. Why this is Lockstate's mechanism and not a copied one

`AGENTS.md` forbids copying Prison Architect's *"code, assets, text, UI
layouts or protected content"* while permitting research to inform mechanics,
and the HUD docblock quoted in Context §7 flagged in advance that
*"seeding gangs is not also a copy decision"*. This section is that flag
answered rather than deferred.

**What is not taken.** No text, no asset, no UI layout, no numbers read off
another game, and no gang overlay, gang-leader entity, recruitment meter,
protection racket, or territory-painting interface — none of which exist here
and none of which this document proposes.

**What makes the mechanism structurally ours, stated as differences a reader
can check against the code above rather than as an assertion:**

1. **A grudge is a directional, single-use ledger entry, not a standing
   relationship.** `grudges` is keyed `offended->offending`
   (`src/simulation/incidents/gangs.ts:82`) and is *cleared on use*
   (`src/simulation/incidents/trigger-system.ts:546`). The genre's usual model
   is a persistent inter-gang hostility that modulates a probability; ours is a
   debt that is created by one identifiable event and discharged by one
   identifiable event. That is closer to the incident ledger this repository
   already has than to a relationship matrix.
2. **The producer is an incident the player already watched, not a hidden
   sampler.** Decision §2. There is no gang-activity roll anywhere; Context §10
   is why there cannot be one without a deliberate decision.
3. **Territory is a *sector* claim reusing the security sector the prison
   already derives** (Context §3), not a drawn or painted gang zone. Gangs
   inherit the geometry ADR 0036 already established for staffing and
   incidents; they do not introduce a second spatial concept.
4. **Membership is a consequence of classification**, which is this
   repository's own intake model (Decision §6), rather than a recruitment
   system with its own state.
5. **The whole model is deterministic**, which is a constraint the genre does
   not impose and this repository does (`docs/DETERMINISM.md`, ADR 0009's
   replay verification). A mechanism that must replay bit-identically from a
   seed cannot be a copy of one built on random rolls, because the shape of the
   decision is different.

The honest limit: *having* gangs at all is a genre convention, and this
document does not claim otherwise. What it claims is that the four moving parts
above — the single-use directional grudge, the assault as its sole producer,
the reused security sector as territory, and classification as membership — are
this repository's own answers, each derived from a module that already existed
here.

---

## Cost, priced

### What the first retaliation does to a prison, arithmetically

From Context §5, and it is worth reading before accepting this document because
it is the part a player experiences:

| quantity | value | derivation |
| --- | --- | --- |
| minimum severity | **6** | `round(0.6 × 10)`, and the gate refuses anything below `0.6` |
| maximum severity | **10** | `round(1.0 × 10)` |
| lockdown | **always** | severity ≥ 6 = `lockdownSeverityThreshold` |
| lockdown scope | **the whole prison** | one sector, covering all owned land |
| responders demanded | **3 to 5** | `ceil(severity × 0.5)` |
| deadline before it lapses | **600 ticks** | `responseDeadlineTicks` |

**So there is no gentle introduction to this feature.** The first gang
retaliation a prison ever sees seals every door in it and demands three spare
guards. A prison running the one-guard floor
(`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1`,
`src/simulation/security/default-sector.ts:113`) has none spare, so it gets the
alert and the lapse and no lockdown. That is a real consequence of accepting
this document and it is priced here rather than discovered in play.

### What it costs in code

- One guard clause in `tryOpenRetaliation` (Decision §4).
- One injected port beside `onAssaultAdjudicated`, on the pattern that port's
  own docblock argues for (Context §9).
- Two `register` calls and a membership rule at session creation.
- Extending two existing unit-test fixtures that today assert on memberless
  gangs (Decision §4).
- **No new module, no new system, no new message kind, no new locale key, no
  RNG stream, and no save-format version bump** (Context §8, §10).

### What it costs in save format

Nothing, under Decision §1. The registry's four collections are already
persisted (Context §8) and no field is added. If Open Question 5's `nameKey`
is ever taken, that is an optional field against a `.strict()` schema and
carries the review cost `src/persistence/save-schema.ts:182-200` describes.

### The chain in ticks — REASONED, not measured

In a prison that produces assaults, and taking the measured assault of the
fixture named below: the assault opens, holds the sector's one slot, and
reaches a terminal state; the grudge is written at that moment; the assault
producer is then held off for 2,400 ticks by its own quiet window while the
retaliation gate stays open; the trigger samples every 50 ticks. **So the
earliest a retaliation can open is roughly one sampling interval after the
assault ends**, provided the accumulated grudge has reached 0.4. At the
recommended weight of 0.2 that is the *second* cross-gang assault, not the
first. This is reasoned from the gates in Context §4 and has not been run;
running it is the measurement below.

---

## The measurement the implementation will owe

Before landing any change described in Decision above, the implementing pass
must run, and report both sides of, the following — **named this precisely so a
more flattering fixture cannot be substituted for it.**

**Fixture A — the named prison: `tests/integration/assault-sanction-loop.test.ts`'s
`buildPrison()`, seed `0x5a17`, eight `room.cell`s plus one
`room.solitary-cell`, one `staff-role.guard`, eight `AdmitPrisoner` commands at
`{ x: 16, y: 16 }` with `sentenceLengthTicks: 400_000` and `priorIncidents: 0`,
real kernel, no hand-placed incident.**

That file records what this fixture already produces, and the numbers are the
baseline the implementation must not silently move — REPORTED, not reproduced,
from that file's own comment: *"the first terminal, adjudicated assault in this
exact fixture opens at tick 13,650 and lapses (no guard responds in time -- the
one hire is elsewhere) at tick 14,260, naming participants [2, 7] and
instigator 2."*

Report, for the unmodified tree and the tree with this decision implemented:

1. **The gang each of entities 2 and 7 is in at tick 13,650**, and whether they
   differ. If they do not, this fixture cannot produce a grudge and the run
   must say so rather than being replaced — Decision §6's membership rule is
   what would then be wrong, and that is the finding.
2. **Every incident opened over the run** — type, severity, participant ids,
   instigator id, and tick — so that the assault ladder this fixture is the
   reference for is visibly unchanged for everything except the new type.
3. **The tick the first `gang-retaliation` opens, if one does**, its severity,
   its two `causeFactors` values (`gang-grudge` and `retaliation-risk`), and
   its participant list. The list must be non-empty; Decision §4 is the reason.
4. **Whether `IncidentResponseSystem` mounted a response to it**, and therefore
   whether the prison-wide lockdown in Cost above actually fired at one guard —
   the arithmetic says it will not, and a run is what settles it.
5. **The grudge ledger at the end of the run** (`allGrudges()`), so that
   accumulation and clearing are both visible rather than inferred.

**Fixture B — the reachability reference: `tests/integration/incident-trigger-reachability.test.ts`'s
`BED_ONLY` case with `guards: 1`, seed `0x0cc0`, `RUN_TICKS = 30_000`.** That
file's assault case asserts `staffing-shortfall` is exactly `0` and
`assault-pressure` at least `0.65`; report the same four cause factors after
this change, to establish that seeding gangs moved no assault input. This is
the fixture that would catch a membership rule accidentally changing
classification draws.

**Red-then-green, per `docs/AGENT_WORKFLOW.md` §3.** Mutate the grudge producer
— the simplest mutation is to drop the "different gangs" condition so a grudge
is written for every adjudicated assault including same-gang ones — and watch
the new integration test go red. Report both outputs. A green suite that has
never been watched failing proves nothing here.

**What is recommended but not owed:** a second run of Fixture A with a second
guard hired, which is the smallest change that lets a response mount and would
be the only way to observe the prison-wide lockdown this document prices.

---

## The gates this draft was run against

Documentation-only change. Run in this worktree at `491fcdce` (v0.0.541):

- `pnpm --config.verify-deps-before-run=false exec vitest run tests/foundation/`
  — **57 files, 526 tests, all passing**, both before this file existed and
  with it in place.
- The same command with this file placed directly at
  `docs/adr/` under that same basename — **5 failed** in
  `adr-numbering-contract.test.ts`, which is the measurement behind the
  placement note at the top of this document.
- **The verbatim gate was watched failing on this document rather than assumed
  to be reading it.** Mutating one character of one quotation here — the
  `if (grudge === 0)` line to `if (grudge === 0.0)` — turned
  `adr-quotation-verbatim-contract.test.ts` from **18 passed** to
  **1 failed | 17 passed**, and restoring the character turned it back. So
  every quotation above is compared against the file it names, rather than
  taken on trust — a count is deliberately not given here, because a tally in
  prose beside a gate that computes the same tally is the shape
  `docs/AGENT_WORKFLOW.md` §4 names as rotting first.
- Three real defects in this document were caught by that suite on the first
  run and are recorded rather than quietly fixed: two attributions written
  inside a wider parenthesis, which the pattern cannot read and which therefore
  checked nothing; one rooted path to the unmerged research note, which
  `documentation-links-contract.test.ts` reported as dangling exactly as it did
  for that note's own branch; and a bare version token in a table header with no
  commit beside it, which `documentation-version-claim-contract.test.ts`
  refuses because `.github/workflows/version.yml` bumps the patch on every push
  and a bare number is therefore false as soon as it merges.

---

## The weakest claim in this document, named

**Decision §6's membership rule assumes `high-risk` arrivals actually occur in
a prison a player builds, and this document did not verify that they do.**

The rule ties gang membership to a classification group produced by a draw on
`prisoners.classification`, and the fixture this document names for its own
measurement states in its own comment that its admissions *"never reach the
`>= 3` high-risk floor -- every arrival here is deterministically
`general-population`"* (`tests/integration/assault-sanction-loop.test.ts:33`).
If that is typical rather than a property of that fixture's
`priorIncidents: 0` and long sentence, then **Decision §6 seeds two gangs with
no members in ordinary play**, Decision §4's guard then correctly refuses every
retaliation, and this whole mechanism ships as inert as the one it replaces —
the exact failure issue #979 exists to close, reproduced one layer up.

This was not chased down because `src/simulation/prisoners/` is another agent's
surface on this pass, and a claim about how often a tier is drawn needs a run
rather than a reading. **The measurement above is written to catch it**: item 1
of Fixture A asks for the gang of entities 2 and 7 and says in terms that "they
are in no gang" is the finding rather than a reason to change fixtures. Until
that number exists, Decision §6 should be read as the *shape* of a membership
rule with its threshold unset, and Open Question 2 carries the alternative that
does not depend on the tier at all.

Two claims that are **not** the weakest, said so a reader does not have to
guess where the confidence is: Context §3's arithmetic and Context §5's are
computations over constants that were opened, and either can be re-derived in a
minute from the quoted lines.

---

## What would change my mind

- **A run showing that ordinary admissions never classify `high-risk`.** That
  falsifies Decision §6 as written, not the direction; the fix is Open
  Question 2's rule, and the document should be corrected rather than left
  standing.
- **The owner wanting retaliation to be reachable without a prior assault.**
  Decision §2 makes the assault the sole producer, which means a peaceful
  prison never sees a gang retaliation at all. That is defensible — and it is
  also exactly the property someone asking for *"random incidents"* might not
  want. If they want it reachable independently, the producer has to change and
  Open Question 3's alternatives become the decision.
- **A second sector arriving before this ships.** Decision §3's acceptance of
  the always-on amplifier is contingent on there being one sector; two sectors
  make the dampened branch reachable as a computation and its dead-at-threshold
  arithmetic worth revisiting rather than merely recording.
- **Evidence that a prison-wide lockdown on the first retaliation is
  unplayable.** Cost above prices it and does not judge it. A playtest finding
  it ruinous would not change the mechanism but would move
  `lockdownSeverityThreshold` or the severity formula into scope, which this
  document deliberately excluded.

---

## Open questions

1. **Should a gang retaliation's participants be restricted the way a riot's
   are?** `IncidentLog` indexes open participants for `'riot'` only, and says
   why in its own words: reading the riot's authored action restrictions onto
   `'gang-retaliation'` *"would be a content decision with no measurement
   behind it"* (`src/simulation/incidents/incident.ts:225-229`). This document
   does not take it, so a retaliation's participants carry on with their day
   while the incident is open. That is the same open question ADR 0057 left,
   now reachable for a second incident type.
2. **Should every arrival join a gang, rather than only `high-risk` ones?** The
   alternative to Decision §6, and it is the one that does not depend on tier
   reachability at all. Its cost is that gang membership stops being something
   the player influences, which is what recommended against it; its benefit is
   that the mechanism cannot ship inert. The weakest-claim section above is why
   this is a real question rather than a courtesy.
3. **Rejected grudge producers, recorded because they will be proposed again.**
   (a) *A scheduled or random injection* — refused on Context §10 and on
   legibility. (b) *Contraband seizure* — and the obvious objection to it is
   wrong, so the real one is given instead. Attribution is **not** the problem:
   `ContrabandHolderKind` includes `'prisoner'`
   (`src/simulation/contraband/item.ts:12`), so an item taken off a prisoner
   already names one, and `getGangOf` would map it to a gang. The problem is
   that a seizure is a wrong done by the **prison**, not by another gang, so it
   has no `offendingGangId` to key a directional grudge against — the model in
   `src/simulation/incidents/gangs.ts` cannot express "this gang resents the
   warden". Making it fit would mean either a second kind of grievance or
   arbitrarily blaming a rival, and both are larger decisions than this one. (c) *Cell-sharing friction* — `rateCellSharing` is the
   authored metric for two prisoners who go together badly, and ADR 0061's open
   question 4 already records that no fixture builds a shared cell, so it would
   fire nowhere.
4. **Does a successful retaliation move gang reputation?** Decision §5 leaves
   `adjustReputation` unwritten. Its own docblock describes the intent
   (`src/simulation/incidents/gangs.ts:21`), and nothing anywhere reads
   reputation back — so writing it would create a second subsystem with no
   reader, which is the class of defect this document is closing.
5. **Do gangs ever need names?** Not for this decision (Context §7: the alert
   takes no parameters). It becomes a question the first time a gang id would
   reach a player — a roster column, an incident detail panel — and it is then
   an optional `nameKey` on `GangDefinition` plus a locale key, which is
   `AGENTS.md`'s fourth reservation's territory and this document's
   deliberately is not.
6. **What weight should one cross-gang assault carry?** Decision §2 recommends
   `0.2` and shows the arithmetic that makes `0.4`, `0.2` and `0.15` mean "every
   assault", "every second" and "every third". This is the one number in the
   document a balance pass would move first.
