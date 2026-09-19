# ADR 0042: The consequence chain is built and has no producer a player can reach

## Status

**Proposed. Not accepted, and deliberately not self-approved.**

The owner's standing delegation has been used for ADRs 0034 through 0044, and it
is not used here. The owner's instruction for this work was *"wszystko po kolei,
jakościowo, nie tanio"* — all of it, in order, done properly, not cheaply — which
delegates the *thoroughness*, not the ordering. **The order in which a product
loop is closed is the decision**, not a detail inside it, so it goes back to the
owner. Nothing in `src/` changes on the strength of this document until it does.

**The number was a placeholder, and 0042 was assigned on landing.** ADR numbers
are assigned centrally after drafts return (`AGENTS.md`, *"A number is not
reserved until it appears in `docs/adr/README.md`"*), and two agents once took
`0034` within an hour. This draft carried `XXXX` and did not touch
`docs/adr/README.md`; 0042 was one of the two genuine gaps that README's own
paragraph records, so assigning it left the stated next free number (0045,
`max(on disk) + 1`) correct and untouched. `tests/foundation/` is green: 35
files, 327 passed.

## Context

### The subject, in one sentence

**Lockstate has a built, tested, deterministic consequence chain running from an
incident record to a prisoner's timetable, and no producer anywhere in `src/`
can put a record into the front of it in a prison a player can build.**

That is not the same subject as *"the simulation has no consequences attached to
it"*, which is what the four findings behind this document were read as saying,
and the difference decides the work. A missing consequence system is months. A
missing producer in front of a finished one is a threshold, an occupancy query
and one authored action.

### Where that sentence comes from

`tests/integration/incident-consequence-loop.test.ts` drives the real kernel and
the real protocol commands — buy a plank, zone a cell, place a bed, admit a
prisoner — and then asserts, on a named prisoner, that a lapsed riot raises them
to `riskTier` 3, moves them onto `'high-risk'`, **measurably changes the shape of
their day** because `ActionSystem` reads `classificationGroupIndex` every cycle,
decays back down as clean time accrues, is reachable by three contraband finds
instead of a riot, and reproduces across a save taken either side of the review.

It opens the incident by calling `runtime.incidents.open(...)` directly
(`tests/integration/incident-consequence-loop.test.ts:116`), and its own comment
says why:

> *Opened and lapsed through `IncidentLog`'s own API rather than by provoking
> `IncidentTriggerSystem`: a trigger needs a watched sector, a risk sample over
> its threshold and prisoners standing on the sector's post tile, none of which
> is what this file is measuring.*

The repository already knew the trigger could not be reached and routed around
it in a test. The gap this document is about is the gap that comment describes.

## What was verified, finding by finding

Every anchor below was opened in the working tree at this branch's base. Where a
finding rests on a measurement rather than on a reading, that is said, and the
measurement is the filing issue's, not this document's.

> **That sentence is a global pin, it is advisory, and this document is one of
> the places that proves it (2026-09-15).** `docs/adr/README.md`'s section on
> anchor pins records the evidence: seven commits across six documents moved or
> added anchors below an unchanged pin. Here the offender is `6c7ae159`
> (2026-08-27), which added **two new anchors** below this line —
> `action-system.ts:106` and `prisoners/prisoner-operations-runtime.ts:137`, in
> decision 1's landing note — read at that day's tree rather than at this
> branch's base, with the pin untouched and its own message silent about it.
> One of the two is not even a repository-rooted path, so nothing resolves it.
>
> **Re-read 2026-09-15, all 63 `file:line` citations below this line opened.
> Eight still land on what their sentence names**: `classification-review-system.ts:57-59`,
> `informants.ts:87` (both sites), `hiring.ts:37-44`, `cell-sharing.ts:76`,
> `disciplinary-record.ts:48-58`, `escape.ts:19`, `gangs.ts:123-124` and
> `streams.ts:20-24`. **The other fifty-five are deliberately left where they
> are, and that is a decision rather than an omission.** Re-aiming them would
> present this document's census as a reading of today's tree, and it is not:
> the tree it diagnoses has been replaced under it, by decisions taken in other
> ADRs while this one stayed `Proposed` — see the block at the head of the
> *Decision* section. #1229 left ADR 0040's twenty anchors standing for the same
> reason and was right to. **Read every anchor in this section as of
> 2026-08-27.**

> **THE OWNER OVERRULED THAT ON 2026-09-16, AND THE PARAGRAPH ABOVE IS KEPT
> RATHER THAN REWRITTEN BECAUSE IT IS THE DECISION THAT WAS REVERSED.** Asked
> whether to freeze this file as history on the ADR 0040 precedent or keep
> maintaining its anchors, the owner chose:
>
> > Żywy — przepinajcie dalej
>
> ("Live — keep re-pinning.") **The provenance is the weaker of the two kinds
> this repository distinguishes**: the label of a clickable option an agent
> session wrote, not a sentence the owner typed. The record of the ruling lives
> on `agent/2026-09-16-rulings`
> ([#1275](https://github.com/woogitsu/lockstate/pull/1275)), **which had not
> merged to `main` when this pass ran** — checked with `git merge-base
> --is-ancestor`, not assumed. That PR records the ruling and re-pins nothing;
> it says in terms that *"the 55 anchors are now a re-pinning job somebody
> owes"*, and names this branch as where it is owed.
>
> **What the ruling asks for, and what this pass did (2026-09-17).** An anchor
> that still names live code is re-aimed; a sentence that is simply false about
> the tree is marked in both directions rather than left standing under a pin
> claiming it was read. Re-aimed anchors below carry `(the anchor read `:X`)`,
> and every new coordinate was opened after the edit.
>
> **The sentences are not rewritten, and that is the part to read.** A
> 2026-08-27 diagnosis that a producer was missing stays a 2026-08-27 diagnosis;
> only the coordinate under it is brought to today's tree, so this section still
> reads as the census it was and no longer sends a reader to a blank line or to
> an unrelated docblock. Where the *claim* has expired as well —
> `applyRiotRegimeOverride` deleted, `safety` no longer read alone,
> `SAVE_SCHEMA_VERSION` no longer 5 — the correction was already marked in both
> directions in place and is left exactly as it stands.
>
> **Two claims in this section were found false by the re-pin itself**, because
> opening a line is how you find out, and they are marked at their own
> sentences below: `DEFAULT_SECTOR_RISK_POLICY`'s quoted weights and threshold,
> and *"Two `Treasury.spend` call sites in the whole of `src/`"*.
>
> **What this pass did not reach.** The eight anchors the census above records
> as landing were re-opened and still land. The re-aims below are the ones whose
> subject could be located by opening the file and reading it; where a subject
> exists nowhere in the tree, no coordinate was invented for it.

### #440 — two action categories with no action — **holds, and its persistence
claim is wrong in a way that matters**

`ACTION_CATEGORIES` has seven members (`src/simulation/prisoners/regime.ts:3`;
the anchor read `:1`, an `import type` line).
`DEFAULT_ACTIONS` has eight entries spanning five categories
(`src/simulation/prisoners/actions.ts:85`; the anchor read `:42-75`, a docblock
about an absent capability): `sleep`, `meal` ×2, `hygiene` ×2,
`recreation` ×2, `education`. There is no `work` action and no
`free-association` action. **Half of that is no longer true: decision 1 landed
on 2026-08-27 and `action.free-association` is now the ninth entry.** The
sentence is kept because the census below is measured against the eight, and
because `work` — the larger hole, 1,000 general-population ticks a day against
free-association's 400 — is still open. Derive it rather than trusting either
version of this sentence:

```
grep -o "category: '[a-z-]*'" src/simulation/prisoners/actions.ts | sort -u
```

`GENERAL_POPULATION_REGIME` (`src/simulation/prisoners/regime.ts:104`; the
anchor read `:62-76`) allots
1,000 ticks a day to `['work', 'education']` blocks and a further 400 to blocks
that list `free-association`. `RIOT_ALLOWED_CATEGORIES` is
`['free-association', 'recreation']` (`src/simulation/incidents/riot-regime.ts:41`;
the anchor read `:12`)
and its header comment calls `free-association` *"unstructured milling about"* —
naming content that was never authored. `beginNextAction` filters
`DEFAULT_ACTIONS` by the block's categories and, if no candidate resolves,
increments `unmetDemandCycles` and returns
(`src/simulation/prisoners/action-system.ts:1616`, `:1668`; the anchors read
`:391` and `:427`, both docblock lines. `:1668` is the same `unmetDemandCycles`
statement ADR 0029's sweep on this branch had to correct by one line, so the
two documents now agree). Both recreation
actions target zoned rooms, so in a prison with no yard and no common room a
riot leaves every participant with an empty candidate list for the whole day.
The tick arithmetic in #440 is a static reading of two catalogues, and it
reads correctly; the per-action counter measurement it asks for is still owed.

**Where #440 is wrong.** It puts *"Any save-schema change"* out of scope on the
grounds that *"Adding a catalogue action is content data"*, and invites the
implementer to stop and raise it if that turns out to be false. **It is false.**
`CurrentActionComponent.actionIndex` is a *positional* index into
`DEFAULT_ACTIONS` (`src/simulation/prisoners/components.ts:245-251`; the anchor
read `:205-211`, a different component's constructor) and it is
persisted verbatim (`src/persistence/save-schema.ts:440`; the anchor read `:383`,
`src/simulation/runtime/session-systems.ts:461` and `:522`; those two anchors read
`:344` and `:390`). Inserting an entry
anywhere but the end of that array silently reinterprets every in-flight action
in every existing save — a prisoner who was showering resumes doing something
else, with no error and no version mismatch. **Appending is safe; inserting is a
migration.** This is a constraint on the fix, not an argument against it, and it
belongs in whichever commit adds an action.

### #441 — a sentence never ends — **holds exactly**

`IntakeSystem` writes the field
(`src/simulation/prisoners/intake-system.ts:572`; the anchor read `:307`). Every
reader in `src/`:

```
grep -rn "sentenceEndTick" src/
```

returns the save schema, the capture/restore pair
(`src/simulation/runtime/session-systems.ts:131`, `:455`, `:509`; those three
anchors read `:111`, `:339` and `:381`), the HUD
projection (`src/simulation/presentation/prisoner-projection.ts:752`; the anchor
read `:397`), and
`classifiedAtTickOf`, which subtracts it from `sentenceLengthTicks` to recover
*when the prisoner arrived*
(`src/simulation/prisoners/classification-review-system.ts:57-59`). **Nothing
compares it against `context.tick`.** `world.setOwned` likewise has exactly one
call site, at session creation (`src/simulation/runtime/new-session.ts:438`; the anchor read
`:281`), so
the land is one chunk for the life of the session.

### #442 — one guard disables the incident system — **holds, and the issue
names the weaker of its own two gates first**

`DEFAULT_SECTOR_RISK_POLICY` is
`needsPressureWeight: 0.5, staffingShortfallWeight: 0.3, contrabandPressureWeight: 0.2, hotThreshold: 0.6`
(`src/simulation/incidents/sector-risk.ts:154-160`; the anchor read `:34-40`, a
docblock quoting a design note).

> **The quoted policy is no longer the policy, found by opening that line rather
> than by re-aiming it, and marked rather than rewritten (2026-09-17).** At
> `:154-160` today it is `needsPressureWeight: 1, staffingShortfallWeight: 0.3,
> contrabandPressureWeight: 0.2, hotThreshold: 0.65, sustainedSamplesRequired:
> 12` — the `needsPressure` weight doubled, the threshold moved, and a sixth
> field exists that this sentence predates. **So the arithmetic two paragraphs
> down — "one hire caps the score at 0.5 against a threshold of 0.6" — no longer
> follows from the numbers in the tree**, though its conclusion may still hold
> for other reasons. It is left as written because it is what the 2026-08-27
> census computed and the census is the point; re-deriving it against today's
> weights is work this pass did not do, and saying so is cheaper than a figure
> nobody ran.
`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` is `1`
(`src/simulation/security/default-sector.ts:113`; the anchor read `:99`).
`contrabandPressure` is read
from `intelligence.forTarget('sector', sectorId)`
(`src/simulation/runtime/new-session.ts:1428`; the anchor read `:622`), and the
only writer of that
ledger is `IntelligenceLedger.report`, whose one caller in `src/` is
`reportInformantTip` (`src/simulation/contraband/informants.ts:87`), which has
no caller at all. So the third term is structurally zero and one hire caps the
score at 0.5 against a threshold of 0.6. That half is arithmetic and does not
depend on anyone's run.

**The issue's own "more fundamental half" is more fundamental than it says.**
`resolveSectorOccupants` counts prisoners standing exactly on the sector's
single post tile (`src/simulation/security/sector-occupancy.ts:132`; the anchor
read `src/simulation/runtime/new-session.ts:591-604` — the function moved file,
which is why no line in the old one could be right, and the correction block
below had already re-aimed this document's *other* citation of it), and
`ActionSystem` teleports an arriving prisoner onto their target room's anchor
tile (`src/simulation/prisoners/action-system.ts:323-324`, commented *"Abstracted
arrival"*). A housed prisoner is therefore never on the post tile, so
`needsPressure` is 0 by construction and the score is capped at
`0.3 · staffingShortfall` — **at most 0.3, with zero guards, in every prison
that houses anybody.** #442's headline is "hiring one guard makes the incident
system unreachable"; the code says it is unreachable before the first hire, and
the guard count is the second lock on a door that was already locked.

> **Every load-bearing noun in that paragraph is gone, and the correction was
> published in another document and never brought back here (2026-09-15).**
> [ADR 0048](./0048-what-a-sectors-occupants-are.md)'s §*What the code did, and
> the one place ADR 0042 is wrong about it* answers this paragraph by name: it
> calls the arithmetic right and the conclusion *"too strong"*, because
> `IntakeSystem` left an unhousable arrival standing on the arrival tile, which
> ADR 0036 derived to be the post tile — so the trigger did fire, for exactly
> the prisoners the prison had failed to house, and only while the player had
> hired nobody. **That correction has been on disk since 2026-08-28 and this
> paragraph was never marked with it.**
>
> What the tree does now, opened today:
> - `resolveSectorOccupants` is no longer in `new-session.ts` at all. It is
>   `src/simulation/security/sector-occupancy.ts:132`, and for the derived
>   sector it counts **every prisoner standing on an owned tile**
>   (`sectorCoversTile`, `:122-128`), not the post tile. `countSectorOccupants`
>   (`:158`) is the same predicate without the array.
> - **There is no *"Abstracted arrival"* comment and no teleport.** A prisoner
>   walks, and the write of the anchor tile is now explicitly *"exact rather
>   than corrective"* because *"the walk has already stepped the prisoner onto
>   this tile one tile at a time"*
>   (`src/simulation/prisoners/action-system.ts:1259-1264`).
> - So `needsPressure` is not 0 by construction, and the clause below this one
>   — *"that term is multiplied by `needsPressure`, which is zero in any prison
>   that houses anybody … it is **nothing at all**"* — is false for the same
>   reason.
>
> Marked rather than rewritten: the paragraph is what #442 was read as saying
> and it is the finding that produced ADR 0048.

The three sub-findings check out too. `StaffHiringService.hire` accepts any of
the eight catalogue roles and puts every one of them on the `GuardRoster`
(`src/simulation/staff/hiring.ts:148`, `public hire(request: StaffHireRequest,
isFreshUnfurnishedPrison = false): StaffHireOutcome {`; the anchor read
`:107-134`, which spans `staffHireCostMinorUnits` and the class declaration and
stops fourteen lines short of the method the sentence names), and
`DeploymentSystem.assignUnassignedGuards` fills the post from
`unassignedGuardIds()` with no role filter
(`src/simulation/security/deployment-system.ts:180`; the anchor read `:102-113`)
— so a warden is riot
police. The default sector has no patrol route, by decision and with the reason
written down (`src/simulation/security/default-sector.ts:194-198`).
`applyRiotRegimeOverride` has no caller in `src/`
(`src/simulation/incidents/riot-regime.ts:35`). **False since
[ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md), and not by that
function gaining one:** it was deleted, and a riot now overrides its
participants' timetable through an injected resolver `ActionSystem` asks per
idle prisoner. Marked rather than rewritten, because it was true when it was
written and it is the finding that produced the fix.

### #443 — the economy is monotone, and five of six needs have no reader —
**holds; one clause is understated**

Two `Treasury.spend` call sites in the whole of `src/`
(`src/simulation/economy/procurement.ts:386`,
`src/simulation/staff/hiring.ts:217`; those two anchors read `:166` and `:132`),
both one-off;

> **"Two" is three today, found by re-running this paragraph's own derivation
> command rather than by trusting it, and marked rather than rewritten
> (2026-09-17).** `grep -rn "\.spend(" src/` returns
> `src/simulation/economy/procurement.ts:386`,
> `src/simulation/economy/payroll.ts:391` and
> `src/simulation/staff/hiring.ts:217`. The new one is payroll, which is
> **step 3 of this document's own decision having shipped** — a recurring debit
> the player cannot decline — so the finding that the economy was monotone is
> not merely stale, it was acted on. A count is the sentence shape
> `docs/AGENT_WORKFLOW.md` §4 says rots first, and this paragraph names the
> command that falsifies it two lines below itself.

 `wageBand.minPerDay` is
charged once per hire and the module says so in terms
(`src/simulation/staff/hiring.ts:37-44`). `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`
is 300 (`src/simulation/economy/income.ts:115`; the anchor read `:101`), credited
per occupied place per
in-game day. Derive the debit list rather than trusting this paragraph:

```
grep -rn "\.spend(" src/
```

The needs table holds. `NEED_IDS` is six
(`src/simulation/prisoners/needs.ts:11`; the anchor read `:9`); the only consumer
of a need level
outside the action table, the utility scorer and the HUD projection is
`sampleSectorRisk`, and it reads `safety` alone
(`src/simulation/runtime/new-session.ts:616`). `action.sleep` restores
`safety: 0.2` per tick (`src/simulation/prisoners/actions.ts:45`) against
`NEED_DECAY_PER_TICK.safety` of `0.01`
(`src/simulation/prisoners/needs.ts:56`) — the 20× surplus is exact.

> **Every fact in the paragraph above has since been changed deliberately, and
> the finding it records is what changed them.** Marked here rather than
> rewritten, because this ADR is a record of what was true when it was
> accepted. `sampleSectorRisk` stopped reading `safety` alone with
> [ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 2; `action.sleep`
> stopped restoring `safety` at all, and `NEED_DECAY_PER_TICK.safety` became
> `0.05`, with [#588](https://github.com/matmaxalez/lockstate/issues/588) under
> the owner's ruling on
> [#599](https://github.com/matmaxalez/lockstate/issues/599), which makes guard
> coverage the need's provisioner. The 20× surplus is gone, which is the point:
> the sentence under this one calls the consequence surface of the needs model
> "nothing at all", and coverage is the instrument that answers it.

**Understated:** the issue says the entire consequence surface of the needs
model is that one term. Given the paragraph above, that term is multiplied by
`needsPressure`, which is zero in any prison that houses anybody. So the
consequence surface of the needs model in a playable prison is not one term. It
is **nothing at all**, and `safety` being pinned is the second reason rather than
the first.

## What is already built and merely unattached

This is the part that changes the plan, so it is enumerated with anchors rather
than summarised. Derive the list's shape rather than trusting its length:

```
grep -rn "introduce(\|submitOrder(\|applyRiotRegimeOverride\|resolveEscapeOpportunity\|\.report(" src/
```

**Built, registered on the kernel, and reachable the moment an incident opens:**

- `IncidentResponseSystem` — the whole `active → notified → responding →
  resolved` pipeline, plus `lapse`, lockdown, responder claims and restore-time
  re-dispatch (`src/simulation/incidents/response-system.ts:473-491`; the anchor
  read `:227-249`), registered
  at `src/simulation/runtime/new-session.ts:1617` (the anchor read `:662`). Its `update` iterates
  `this.incidents.openIncidents()` and does nothing when that is empty.
- `ClassificationReviewSystem` — registered via
  `PrisonerOperationsRuntime.registerOn`
  (`src/simulation/prisoners/prisoner-operations-runtime.ts:540`; the anchor read
  `:142-147`), folds
  `IncidentLog` terminal records and `ConfiscationLedger` events into a derived
  `DisciplinaryRecord` and rewrites `riskTier` and `classificationGroupIndex`
  (`src/simulation/prisoners/classification-review-system.ts:439-443`; the anchor
  read `:229-233`).
- The downstream of that rewrite is live in three places:
  `ActionSystem.beginNextAction` resolves the regime schedule from it every
  cycle (`src/simulation/prisoners/action-system.ts:388-390`), the route-context
  resolver reads `riskTier` (`:1109`; the anchor read `:419`, a bare `*/`), and
  `cell-sharing.ts` scores placement
  distance on it (`src/simulation/prisoners/cell-sharing.ts:76`).
- `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE` and `LAPSED_INCIDENT_SURCHARGE_POINTS`
  are authored for all four incident types
  (`src/simulation/prisoners/disciplinary-record.ts:48-58`) — including the two
  with no producer.

**Built, and with no producer in `src/`:**

- `ContrabandRegistry.introduce` — one definition, no caller
  (`src/simulation/contraband/item.ts:123`; the anchor read `:104`).
- `SearchSystem.submitOrder` — one definition, no caller
  (`src/simulation/contraband/search-system.ts:190`); the system is registered
  and runs an empty queue. Its confiscation write
  (`src/simulation/contraband/search-system.ts:350`) is the *second* route into
  the built consequence chain, and
  `tests/integration/incident-consequence-loop.test.ts:277` already proves that
  route reaches tier 3 at three finds.
- `reportInformantTip` (`src/simulation/contraband/informants.ts:87`) — the only
  writer of the intelligence ledger, uncalled, which is exactly why
  `contrabandPressure` is 0.
- `applyRiotRegimeOverride` (`src/simulation/incidents/riot-regime.ts:35`) —
  called only from `tests/unit/incident-escape-riot.test.ts`. **Two
  corrections, marked rather than overwritten:** it was reached from
  `tests/unit/prisoners-free-association.test.ts` as well, and
  [ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md) deleted it in favour
  of a per-participant resolver, so this entry has left the list by removal
  rather than by acquiring a producer.
- `resolveEscapeOpportunity` and `TunnelRegistry`
  (`src/simulation/incidents/escape.ts:19`, `:76`).
- `GangRegistry.register` / `.addMember` / `.addGrudge` — written only by
  `loadSnapshot` (`src/simulation/incidents/gangs.ts:123-124`), so a live
  session's registry is empty and `tryOpenRetaliation`
  (`src/simulation/incidents/trigger-system.ts:535`; the anchor read `:108-137`)
  iterates nothing.

**Decided and unbuilt, rather than undecided:**

- [ADR 0017](./0017-money-primary-resource-model.md) decision 8 already decides
  what insolvency is: *"insolvency is a state, not a loss condition"*, with an
  authored degradation order — deliveries refused, then construction halted,
  then staff unpaid. It also states its own precondition: *"Answer 3 is not
  reachable yet. `Treasury.spend` refuses rather than overdrawing, so there is
  no negative balance for a degradation ladder to respond to. It becomes
  reachable when a recurring charge exists that the player cannot decline."*
  **The economy half of #443 is not an open architectural question.** It is a
  decided ADR waiting on one precondition, and `CLAUDE.md`'s *"Do not invent
  replacement architecture when an ADR already exists"* applies directly.

**Undecided, and blocking:**

- [ADR 0026](./0026-entity-id-lifetime.md) is Accepted *"as the framing and the
  tripwire, not as an answer"* and says of its own three questions: *"none of
  the three answers is chosen … #31 is where they become load-bearing and where
  they get taken."* Question 2 is *"what must `release` drop, and how does it
  stay complete?"* — with a table showing `RoomInstanceRegistry.release`,
  `ActorIdentityRegistry.release`, `GangRegistry.removeMember` and
  `ComponentBitset.remove` all uncalled. **Releasing a prisoner (#441) is the
  one of the four findings that cannot be done without first answering an ADR
  that declines to answer itself.**

## Decision

> **Four of these six steps have landed, none of them through this document, and
> its Status line above still reads as it did on 2026-08-27 (recorded
> 2026-09-15).** The ordering was the decision this ADR put to the owner, and
> the work went ahead on it in other ADRs' names, so a reader arriving here
> finds a plan presented as unstarted. Opened and checked:
>
> - **Step 1** — already marked below as *"Landed 2026-08-27"*.
> - **Step 2** *(make the sector risk score reachable: occupancy first)* — taken
>   by [ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 1, *"a
>   sector's occupants are the prisoners standing inside it, and the derived
>   sector is the prison"*. `resolveSectorOccupants` left
>   `src/simulation/runtime/new-session.ts` for
>   `src/simulation/security/sector-occupancy.ts:132`.
> - **Step 3** *(one recurring debit)* — taken. `src/simulation/economy/payroll.ts`
>   exists, `insolvencyRungs` is registered on the kernel
>   (`src/simulation/runtime/new-session.ts:1605`), and the save carries
>   `unpaidWagesMinorUnits` (`src/persistence/save-schema.ts:1219`,
>   `.object({ unpaidWagesMinorUnits: z.number().int().nonnegative().safe() })`;
>   this branch wrote `:1209` on 2026-09-15 and it was ten lines high by
>   2026-09-16, when the branch merged `origin/main`).
>   [ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md) was
>   written to answer this document's open question 3.
> - **Step 4** *(point `needsPressure` at the needs that are actually
>   neglected)* — taken by ADR 0048 decision 2, *"the mean deficit over all six
>   needs, not `safety` alone"*.
> - **Steps 5 and 6** — open. Step 5 still waits on
>   [ADR 0026](./0026-entity-id-lifetime.md); step 6 (`work` as authored
>   content) has no action in `DEFAULT_ACTIONS`.
>
> **Nothing below is rewritten to match.** Each step's *Depends on / Unblocks /
> Persistence / Determinism* block is the argument that produced the ordering,
> and an argument is not made true or false by being acted on. The two figures
> inside step 3 that a reader would take as current are corrected in place
> there.

**Six steps, in this order. The order is argued from what each step unblocks,
not from which finding is worst.**

### 1. Give `free-association` an action, so the riot regime terminates

Append one `free-association` action targeting `own-accommodation` with no need
effect, at the end of `DEFAULT_ACTIONS`. Appending, not inserting, for the
`actionIndex` reason above.

**Landed 2026-08-27** as `action.free-association`, `minDurationTicks: 60`, with
`tests/unit/prisoners-action-catalog.test.ts` pinning what every saved
`actionIndex` means. That gate earned itself immediately: inserting the entry at
index 0 instead of appending — which reinterprets the in-flight action of every
prisoner in every save on disk — left **70 files and 636 tests green**, and only
the new gate went red.

Two things this decision did not anticipate, both found by implementing it:

- **`continuePerforming` stamped `needFulfilledLastTick` unconditionally**, and
  that field reaches the HUD verbatim through `projectPrisonerDetail`. The
  catalogue's first zero-effect action would have made the game tell a player a
  need was met at a tick where none was — `AGENTS.md`'s fourth exclusion in
  miniature. Fixed with the action rather than after it.
- **Step 2 needs more than a producer.** `ActionSystem` holds its schedules as
  `private readonly regimeSchedules` (`action-system.ts:388`; the anchor read
`:106`, one of the two this block's own opening paragraph names as added below an
unchanged pin by `6c7ae159`), handed over once
  at construction (`prisoners/prisoner-operations-runtime.ts:137`), with no
  mutator anywhere in `src/`. Nothing can move a live session onto the riot
  schedule, so an incident producer alone would not reach this action. Step 2's
  section below does not say so.

**It changes nothing a player can see, and that is the expected outcome rather
than a disappointment** — this decision's stated purpose is to unblock step 2's
acceptance criterion, not to be visible. Measured: 0 performing ticks over 9,000
ticks of a fully furnished prison. Three independent reasons, any one of them
sufficient: the riot regime has no producer; the schedule array is immutable
(above); and no panel renders a prisoner's action at all — `hud/prisoner-roster`
and `hud/prisoner-detail` are requested by nothing outside `tests/`, and
`world/render-snapshot` projects tiles, not prisoners.

*Depends on:* nothing. *Unblocks:* step 2's acceptance criterion. A riot that
leaves every participant with an empty candidate list is a record with no
behaviour, so making the trigger fire before this lands would produce an
incident the player cannot see happening. *Persistence:* none, **because it is
appended** — the index of every existing entry is unchanged, so no save
reinterprets. *Determinism:* no new randomness; one more entry in a list already
walked in declaration order.

This is the defect half of #440. The content half — `work` as a real activity —
is step 6.

### 2. Make the sector risk score reachable: occupancy first, threshold second

Decide what a sector's occupants are, and only then whether the threshold, the
weights or the required guard count is wrong. In that order, because the
occupancy question dominates: while `resolveSectorOccupants` returns an empty
list, no weighting of `needsPressure` can matter, and a threshold tuned against
a term that is structurally zero is tuned against nothing.

*Depends on:* step 1. *Unblocks:* **the largest already-built surface in the
repository.** `IncidentResponseSystem`'s entire pipeline; `IncidentLog`'s
terminal records; and through them `buildDisciplinaryIndex` →
`ClassificationReviewSystem` → `riskTier` → `classificationGroupIndex` → the
regime schedule, the route context and cell-sharing — every link of which is
already asserted end-to-end in `tests/integration/incident-consequence-loop.test.ts`
against a hand-opened incident. One producer turns all of it on.

*Persistence:* none required. `SectorRiskTracker` already snapshots
(`src/simulation/incidents/sector-risk.ts:217`; the anchor read `:97-104`), and an
occupancy resolver is
a derivation over positions the save already carries. *Determinism:* the score
is a pure weighted sum and the streak is a counter; a spatial or
room-membership occupancy query must return a sorted list, as the current one
does (`src/simulation/security/sector-occupancy.ts:132`; the anchor read
`src/simulation/runtime/new-session.ts:603`, the file the function left). No RNG.

### 3. One recurring debit, as ADR 0017 decision 8's precondition

Charge something the player cannot decline, on a per-in-game-day pass. Wages are
the candidate ADR 0017 and the content catalogue both already point at —
`wageBand.minPerDay` is authored per day and charged per hire
(`src/content/staff-role-catalog.ts:73`, `src/simulation/staff/hiring.ts:121`;
those two anchors read `:52` and `:131`).

*Depends on:* step 2, weakly but really. The last rung of ADR 0017's authored
degradation ladder is *"staff unpaid with the morale and incident consequences
that follow"* — building the ladder before an incident can fire builds its
bottom rung onto a system that cannot respond, and the step would have to be
revisited to connect it.

*Persistence:* **this is the step with a save-format cost, and it is the reason
it is not first.** `Treasury` validates non-negative in four places
(`src/simulation/economy/treasury.ts:707`, `:790`, `:840`, `:864`; those four
anchors read `:73`, `:83`, `:120` and `:134`, all docblock lines in what is now a
900-line file) and the save
schema pins it: `balanceMinorUnits: z.number().int().nonnegative().safe()`
(`src/persistence/save-schema.ts:954`). A debt state is either a sign change on
a persisted field or a new persisted arrears field, and both are `AGENTS.md`
boundary 7 changes needing a version and a migration
([ADR 0038](./0038-what-makes-a-save-compatible.md)) — `SAVE_SCHEMA_VERSION` is
5 (`src/persistence/save-schema.ts:34`).

(**Both of those two figures are now wrong, and the prediction they carry came
true, which is why the sentence is kept — 2026-09-15.** The schema field is
`balanceMinorUnits: z.number().int().safe()`
(`src/persistence/save-schema.ts:1156`), and the docblock above it says why in
terms: *"**`.safe()` and not `.nonnegative()` since ADR 0075 decision 2**, and
the loosening is the point rather than a slip. A balance may now be negative"*
(`:1102-1104`). **Both of those two anchors were written on 2026-09-15 and were
dead by 2026-09-16**, when this branch merged `origin/main`: they read `:1146`
and `:1092-1094`, ten lines high in a 1,923-line schema file, and `:1146` had
landed inside a comment about loans. `Treasury` no longer validates non-negative anywhere —
`grep -n "nonnegative" src/simulation/economy/treasury.ts` returns nothing. And
`SAVE_SCHEMA_VERSION` is `6` (`src/persistence/save-schema.ts:38`). So the sign
change this paragraph priced as a version bump is exactly what was paid.) *Determinism:* a day-boundary integer
debit, the same shape `StateIncomeSystem` already has; no RNG.

### 4. Point `needsPressure` at the needs that are actually neglected

Widen the `sampleSectorRisk` deficit term beyond `safety`, or decide explicitly
that `safety` is right and fix its 20× restore surplus instead.

*Depends on:* step 2, hard. Today this term is multiplied into a score whose
ceiling is below its threshold in every playable configuration, so widening it
first changes no observable number and cannot be measured — it would be a change
whose acceptance test is *"a run reports the same thing"*. After step 2 it is
the cheapest honest consequence available: hunger and hygiene at the floor
already happen, and this is what makes them cost something.

*Persistence:* none — a different read of levels the save already carries.
*Determinism:* the sum must iterate `NEED_IDS` in its declared order
(`src/simulation/prisoners/needs.ts:11`; the anchor read `:9`), as
`NeedsComponent` already does
everywhere; no RNG.

### 5. Release, once ADR 0026's questions are answered

*Depends on:* an answer to ADR 0026 questions 1, 2 and 3, which that ADR
explicitly leaves open and routes to #31. It is the only one of the four
findings blocked on an undecided ADR rather than on an unwritten producer, and
it is the only one that touches entity-id generation wrap, the use-claim ledger,
`RoomInstanceRegistry` and `IntakeSystem.accommodationBacklogTicks` on the same
day. That is a dependency, not a difficulty rating: doing it earlier means
answering ADR 0026 earlier, and answering ADR 0026 well is a session of its own.

*Unblocks:* a population that is not monotonic, and therefore an occupancy —
and an income — that can fall. **Note the interaction with step 3:** until
release exists, the only way income can fall is a place being vacated, which
cannot happen, so step 3's debit is the *only* downward force in the economy
until step 5 lands. That is a reason to keep step 3 modest, not a reason to
reorder.

*Persistence:* the freed slot is an existing shape; whether a released prisoner
leaves a record behind is part of ADR 0026 question 2.

### 6. `work` as authored content

A `work` action needs somewhere to work and something to be worth. `docs/ROADMAP.md`
puts *"education/work/therapy programs"* and *"grants, operating costs and
procurement"* in Phase 9, after Phase 8's *"violence/incidents … lockdown/roll
call/emergency response"*. This step is the one place where the roadmap's own
order and the dependency order agree without argument, and it is last for both
reasons.

*Depends on:* step 3, if prison labour is to be an income line (#29).

### What is deliberately not decided here

- Whether `work` and `free-association` should instead be **dropped** from
  `ACTION_CATEGORIES`. Step 1 makes `free-association` real, which settles that
  half. `work` stays in the type with a schedule pointing at it until step 6,
  which is a live defect by #440's own standard — and it is accepted knowingly
  here rather than fixed by deleting content ADR 0017 decision 4 says not to
  delete. If step 6 slips, dropping `work` from the two schedules is the
  cheaper interim than authoring it badly.
- Any price, rate, weight or threshold value. ADR 0017 decision 5 keeps balance
  out of ADRs and nothing here changes that.
- The account/cloud-save question, telemetry, and `roomPerimeterEnclosure` —
  three other open owner decisions, none of which this loop touches.

## What must not be broken

Determinism is the repository's central invariant and every step above is
constrained by it identically:

- **No step introduces randomness.** Steps 1, 2, 3, 4 and 5 are all pure
  functions of state the kernel already holds. Step 6 may not be: an
  introduction path for contraband, if one is ever built, needs a draw.
- **If a step needs a draw, it takes a named stream.** `NamedRngStreams.get`
  throws for an unregistered name (`src/simulation/rng/streams.ts:20-24`), and a
  session registers its streams up front from
  `deriveXoshiroState(masterSeed, name)`
  (`src/simulation/runtime/new-session.ts:446`, `:483-487`; the anchor read
  `:288-293`) — today
  `prisoners.classification`, `contraband.detection`,
  `contraband.intelligence` and `identity.actor-name`.

  > **That list is four and the registration is six, found by opening the new
  > coordinate rather than merely re-aiming to it (2026-09-17).** `:483-487`
  > registers `prisoners.sentence` and `contraband.introduction` beside the
  > three named here, with `prisoners.classification` at `:446`. The sentence is
  > left as the 2026-08-27 census wrote it and the count is marked here, because
  > the claim it supports — that a new stream is the correct mechanism and is
  > cheap — is unaffected by how many exist, and two more having been added
  > since is evidence for it rather than against.

  A new stream is the
  correct mechanism and it is **cheap**: [ADR 0038](./0038-what-makes-a-save-compatible.md)
  decision 2 makes a missing named stream an *absence* seeded from
  `(masterSeed, streamName)`, because `Kernel.restoreState` merges rather than
  replaces, so **adding a stream needs no save version bump**. Sharing an
  existing stream is what would be expensive: issue #27's *"one subsystem's
  draws cannot perturb another"* is why `contraband.detection` and
  `contraband.intelligence` are separate in the first place.
- **Every step's state is serializable, or it is derived.** Steps 1, 2 and 4 add
  no persisted state. Step 3 adds some and must carry a version and a migration
  before release (`AGENTS.md` boundary 7). Step 5's is ADR 0026's to specify.
- **No step may reorder an existing iteration.** `resolveSectorOccupants` sorts
  (`src/simulation/security/sector-occupancy.ts:132`; the anchor read
  `src/simulation/runtime/new-session.ts:603`),
  `IncidentTriggerSystem.update` sorts its sector ids
  (`src/simulation/incidents/trigger-system.ts:308`; the anchor read `:63`), and
  `SectorRiskTracker.getSnapshot` sorts
  (`src/simulation/incidents/sector-risk.ts:217`; the anchor read `:97-99`).
  A richer occupancy model replaces the *contents* of that list, never its
  ordering discipline.
- **`supabase/migrations/` is not touched by any step.** A save-format change in
  step 3 is a client-side schema version, not a database migration.

## Alternatives, with their real costs

**A — economy first** ("nothing else has a price without a lose condition").
Rejected as *first*, kept as third. It is the only candidate with a save-format
cost, its governing decision (ADR 0017 decision 8) already exists so it is
implementation rather than architecture, and its authored degradation ladder
terminates in an incident consequence that cannot fire yet. Doing it first
means building the ladder's bottom rung twice.

**B — growth first** ("a multi-session goal, and it pressures economy and
pathfinding naturally"). The strongest argument against everything here, and it
is not in the four findings at all — it is #443's out-of-scope note that
`setOwned` has one call site. It is rejected on dependency: buying land is a new
command, a new persisted ownership set, and pressure on the navigation and
topology layers, and it makes every other step's measurement harder by changing
the prison under it. It also amplifies rather than closes the gap: a bigger
prison with no consequences is a bigger prison with no consequences.

**C — incidents first** ("directly reverses *nothing can go wrong*, and
`incident-*` code already exists so it may be tuning"). **Adopted, and for a
stronger reason than the one offered.** The offered reason is that the code
exists; the actual reason is that the code exists *downstream* as well, already
integration-tested against a hand-opened incident, so this is the one step whose
cost is one producer and whose payoff is a whole verified chain. The candidate
ordering also underestimates the work by calling it tuning: the occupancy
resolution is not a tuning change.

**D — one ADR per finding, four in parallel.** Rejected on the evidence: #440's
riot half and #442's trigger are the same behaviour seen twice, #443's needs
half is a term inside #442's score, and #441 is blocked on a fifth ADR none of
the four mentions. Four documents would have had to cross-reference each other
into one anyway, and the ordering — which is the actual decision — belongs to
none of them individually.

## Consequences

- **The work is smaller than #446 states, and better defined.** The correction is
  in the Context section and it is the main result of this document.
- **Step 2 is where the risk concentrates.** Everything downstream of it is
  already asserted; nothing downstream of it has ever run from a real producer.
  Expect the first real trigger to surface defects in code that is green today
  because it has only ever been driven by tests that construct their own input.
- **Three header comments describe behaviour that cannot happen** and must be
  corrected in whichever step makes them true or keeps them false:
  `riot-regime.ts`'s *"unstructured milling about"* (step 1),
  `default-sector.ts`'s lockdown-cascades-onto-nothing paragraph (step 2), and
  `treasury.ts`'s note that *"`wageBand` exists in content with no payroll
  behind it"* (step 3).
- **`docs/PRISONER_OPERATIONS.md`, `docs/INCIDENTS.md`, `docs/CONTENT.md` and
  `docs/PERSISTENCE.md`** each describe part of a loop this changes, and
  `docs/adr/STATUS-QUEUE.md` is where the gap between an ADR and the code is
  recorded until it closes.
- **ADR 0017 does not need amending; it needs its precondition met.** Step 3
  landing is the event that makes its decision 8 reachable, and the amendment
  worth writing at that point is one sentence in its *"Answer 3 is not reachable
  yet"* paragraph saying that it now is.
- **ADR 0026 needs answering, not amending.** Step 5 cannot start until it is.

## What would change my mind

**The weakest claim in this document is that step 2 is one producer's worth of
work.** It rests on a reading of the code — that `IncidentResponseSystem`,
`ClassificationReviewSystem` and everything between them are correct and merely
unreached — and the evidence for "correct" is a suite whose incident inputs are
hand-constructed. A suite that has only ever been driven by its own fixtures is
exactly the shape `docs/AGENT_WORKFLOW.md` warns about, and
`tests/integration/incident-consequence-loop.test.ts` is a good test that has
never seen a record `IncidentTriggerSystem` produced. **What would settle it:
make the trigger fire once in a furnished prison with guards on the payroll and
report what `IncidentResponseSystem` does with it.** If the answer is that the
chain needs real work behind the producer, step 2's payoff shrinks and the case
for step 3 first gets stronger, because the economy at least has an accepted ADR
telling it what to build.

Three smaller things would also move me:

- **An owner ruling that losing money is what makes it a game**, in which case
  step 3 moves to first and accepts the double work on its bottom rung.
- **Evidence that a richer occupancy resolution is hot.** #442 records
  `security.deployment` at 152 µs per call at 200 prisoners. If sector
  membership becomes a per-sample spatial query at
  `DEFAULT_PRISONER_CAPACITY` scale, step 2 needs a different shape — most
  likely membership derived from room instances rather than from tiles, which
  is a different decision with the same effect.
- **A decision that `work` is being dropped rather than deferred.** Then step 6
  disappears, `ACTION_CATEGORIES` loses a member, and the two
  `['work', 'education']` blocks in `GENERAL_POPULATION_REGIME` must change in
  the same commit — which would make step 1 the whole of #440 rather than half
  of it.

## Open questions

1. **What is a sector's occupants?** Step 2 decides it and this document
   deliberately does not: the candidates are tiles within a derived perimeter,
   membership by room instance, or membership by accommodation assignment, and
   they differ in cost and in what a player would expect. `docs/INCIDENTS.md`
   calls a richer model *"scenario knowledge"*, which is a deferral to a caller
   that does not exist.
2. **Should `requiredGuardCount` scale with population?** #442 asks it; step 2
   can be taken without answering it, and the answer changes whether
   `staffingShortfall` stays meaningful in a large prison.
3. **Does a recurring debit charge, or accrue?** Step 3's shape depends on it,
   and so does whether the save carries a new field or a signed one.
4. **Is `safety`'s 20× restore surplus a bug or a balance value?** Step 4 has to
   say. `action.sleep` is the only large source, so the question is really
   whether sleeping in a bed should make a prisoner feel safe.
