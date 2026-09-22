# ADR 0121: What decides whether a prison ever meets its gangs

> **THE NUMBER IS ASSIGNED AND IT IS ADR 0121.** The note below is kept rather
> than deleted, because it is the sentence the assignment answers and
> `docs/AGENT_WORKFLOW.md` §4 asks for a correction to be readable in both
> directions. Read *"this draft deliberately carries no number"* as the state
> this document was drafted in, not as its state now: the heading above, the
> filename and the row in [the index](./README.md) all carry ADR 0121, and every
> citation the note lists was re-aimed in the same commit that moved the file.
> The number was **swept rather than trusted** before it was taken — the sweep
> is recorded in the index's own next-free block — and ADR 0121 was free on every
> one of the 510 remote heads readable at `517d92e1` (v0.0.745).

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument. Nothing in `src/` or `tests/` cites it;
> `grep -rln "what-decides-whether-a-prison-ever-meets-its-gangs" src/ docs/ tests/`
> is the list and it was run rather than recalled.

## Status

**Proposed.** *(This line read* **"Still `Proposed`."** *and the value never
changed; only the shape did. `tests/foundation/adr-numbering-contract.test.ts`
reads the first non-blank line under this heading and requires it to* begin
*with a known keyword, so a `Proposed` behind the word "Still" parses as no
status at all -- the one mechanical cost of a document arriving here as a
draft, where nothing was reading this block. Marked rather than overwritten
because the word "Still" is the sentence's own history and the numbering pass
is not entitled to spend it.)* This document asks and stops, exactly as it did
when first written; nothing below is decided, implemented, or self-approved by
the agent that wrote it.

**What it originally asked for was ruled on 2026-09-19, in #1322 ("Obie
naraz" -- "both at once"): the smaller-gang assignment plus a retaliation
quiet window, options (b) and (c) below, together.** The original "Status" and
"The decision this asks for" sections are kept below exactly as written --
`docs/AGENT_WORKFLOW.md` §4 asks for both directions of a correction to be
readable -- with a note at each marking what the ruling settled.

**What this document now asks is a different, larger question, opened by the
owner on 2026-09-21: "Otworzyć ADR o osiągalności tier 3"** ("Open an ADR on
tier-3 reachability"). Provenance is the weaker kind `AGENTS.md` records of
several rulings -- the label of an option a session wrote from a measurement,
not a sentence the owner typed. **It authorises this draft coming back to
them. It authorises no implementation.** §5 onward is that question, and it
belongs to [ADR 0048](./0048-what-a-sectors-occupants-are.md),
[ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md) and
[ADR 0061](./0061-what-the-prison-produces-on-its-own.md) territory -- the
producers that decide whether any incident opens at all -- **not** to
ADR 0103, which only ever reads a tier `IncidentTriggerSystem` has already
written. That misfiling happened twice: once in #979 (filed as a gang issue)
and once in this document's own original title. §5 says so again where the
finding lands.

**Original status paragraph, kept as history and still accurate about what it
describes:** "Proposed, and nothing on the branch that carries it
implements it. That is the opposite ordering to the two drafts beside it, and
deliberately so: what this asks for is a change to
[ADR 0103](./0103-what-a-gang-is-and-how-a-grudge-forms.md) decision 6, which
the owner accepted on 2026-09-08 and refined by ruling open question 5 on
2026-09-09. An agent does not re-decide an accepted decision inside
implementation code (`CLAUDE.md`), so this document asks and stops."

## Context

### 1. Issue #979 is met on `main`, and this draft is what is left over

[#979](https://github.com/woogitsu/lockstate/issues/979) reported that
`gang-retaliation` was built, persisted, projected, had its own player-facing
sentence, and had **no writer** for any of the three links in its chain. That
premise is stale. Verified by reading the tree at `ab3bf7ba` rather than by
taking the issue's or the ADR's word for it:

| link | writer today | called from |
| --- | --- | --- |
| a gang exists | `applyDefaultGangs` → `GangRegistry.register` | `src/simulation/runtime/new-session.ts` at session creation, and `src/simulation/runtime/session-systems.ts` again after a restore |
| a prisoner belongs to one | `defaultGangIdForArrival` → `GangRegistry.addMember` | `src/simulation/runtime/new-session.ts` at intake, and `src/simulation/prisoners/classification-review-system.ts` at the review — the second is the one that fires in play |
| one gang has wronged another | `recordGrudgeFromAdjudicatedAssault` → `GangRegistry.addGrudge` | `src/simulation/runtime/new-session.ts`, on `IncidentResponseSystem`'s adjudication seam |

All seven of the issue's acceptance criteria are met by tests on `main`:
`tests/integration/gang-retaliation-from-the-admission-surface.test.ts` plays a
real kernel from the one admission the interface can build to the incident,
`tests/integration/gang-grudge-loop.test.ts` carries gangs, members and a live
grudge through a save round trip, and
`tests/integration/gang-membership-at-review.test.ts` proves a released
prisoner is forgotten. Run on this branch: 34 passed across those three files
and the two gang unit files.

So the question this draft carries is not *can* a player meet this mechanism.
It is **what decides whether they do**, and today the answer is one the game
does not intend.

### 2. Whether a session can ever retaliate is decided by the parity of two entity ids

`defaultGangIdForArrival` assigns `DEFAULT_GANG_IDS[entityId % DEFAULT_GANG_IDS.length]`
(`src/simulation/incidents/default-gangs.ts`), which is ADR 0103 decision 6's
deterministic split and is the right shape for what it was asked to do: it
draws no random number, needs no seventh RNG stream, and is a pure function of
recorded input.

The interaction nobody priced is with **who reaches tier 3 at all**. In a
neglected prison the only prisoners the disciplinary record carries into
`high-risk` are the ones who keep fighting *each other* — a single pair, the
same two entity ids for the life of the prison. If those two ids share a
parity they share a gang, `recordGrudgeFromAdjudicatedAssault` returns
`undefined` for every one of their fights, and no grudge, no retaliation and no
sentence ever reaches the player.

### 3. What was measured for this draft

**Superseded by #1322 (2026-09-19), kept because the table is what the
ruling was priced against.** The three same-gang pairs below are the ones
`tests/integration/gang-retaliation-from-the-admission-surface.test.ts`
itself now names as fixed: *"Seed `0x0cc3` is one of the three of twelve
that could never meet this mechanism at all"* -- `0x0cc9` and `0x0cca` are
the other two -- *"and all three retaliate now"*
(`gang-retaliation-from-the-admission-surface.test.ts:257-259`, quoted
verbatim). The one seed re-run since, `0x0cc3`, is fully re-measured in that
same file's post-amendment case: still **85** assaults, now **7**
retaliations rather than zero, the pair still 1 and 5
(`gang-retaliation-from-the-admission-surface.test.ts:279`,
`` expect(retaliations.length).toBe(7); // was 0, for ever ``). This document
does not re-derive the other eleven rows of the table below -- that is not
the question it now carries -- and the table is left exactly as measured
pre-amendment, with only the three flipped cells known to have changed.

Twelve seeds, `0x0cc0`–`0x0ccb`, the bed-only prison with one guard that
`tests/integration/gang-retaliation-from-the-admission-surface.test.ts` builds
from player commands only, every arrival at `priorIncidents: 0`, ninety
in-game days each:

| seed | tier-3 pair | gangs | assaults | retaliations |
| --- | --- | --- | --- | --- |
| `0x0cc0` | 1 / 2 | alpha, beta | 85 | **34**, first at 55,700 |
| `0x0cc1` | — | — | 0 | 0 |
| `0x0cc2` | 6 / 7 | alpha, beta | 84 | **34**, first at 55,650 |
| `0x0cc3` | 1 / 5 | beta, beta | 85 | 0 |
| `0x0cc4` | — | — | 0 | 0 |
| `0x0cc5` | — | — | 0 | 0 |
| `0x0cc6` | 6 / 7 | alpha, beta | 35 | **11**, first at 100,300 |
| `0x0cc7` | — | — | 0 | 0 |
| `0x0cc8` | — | — | 0 | 0 |
| `0x0cc9` | 0 / 4 | alpha, alpha | 85 | 0 |
| `0x0cca` | 4 / 6 | alpha, alpha | 84 | 0 |
| `0x0ccb` | 6 / 7 | alpha, beta | 35 | **11**, first at 100,300 |

Read out of it:

- **Seven of twelve sessions produce a tier-3 pair at all.** The other five
  never open an assault in ninety days, so nothing about gangs is reachable in
  them for reasons that have nothing to do with gangs.
- **Three of those seven — `0x0cc3`, `0x0cc9`, `0x0cca` — produce a pair that
  shares a gang, and retaliate zero times in ninety days.** That is the coin
  flip, and it is 43% of the sessions that had everything else.
- **Where it does fire it is a metronome.** 34 retaliations in ninety days is
  one every 4,800 ticks, which is exactly
  `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`
  (`src/simulation/incidents/trigger-system.ts`) — two in-game days — and every
  one of them is severity 6, the threshold at which
  `IncidentResponseSystem` locks the sector down.

The outcome is therefore bimodal: **nothing at all, or a prison-wide lockdown
every two in-game days for the rest of the session.**

### 4. One correction to how the options were put on the issue

[#979's comment of 2026-09-15](https://github.com/woogitsu/lockstate/issues/979#issuecomment-5679194909)
offers option (c) as *"cool the cadence with a per-pair cooldown or grudge
decay — new persisted state"*. **The cheap form of (c) needs no new persisted
state at all.** `IncidentTriggerSystem` already asks `isQuiet` per sector *per
type* for a retaliation, against `quietTicksAfterIncident` — and the same
constructor already carries `quietTicksAfterAssault` and
`quietTicksAfterEscapeAttempt` as separate defaulted parameters, added for
exactly this reason. A retaliation-specific quiet window is one more defaulted
parameter and one constant, no save-schema move and no migration. That does
not make (c) the right answer; it makes it cheaper than the issue priced it,
which is worth knowing before ruling.

## The decision this asks for

**RULED 2026-09-19, VIA #1322: (b) AND (c) TOGETHER ("Obie naraz").** Kept
below exactly as put to the owner, because that is what the ruling chose
between. `src/simulation/incidents/default-gangs.ts:107-186`, whose
`defaultGangIdForArrival` is (b) as built -- the smaller-gang assignment, not
the id-parity split this section originally described as current -- and
`DEFAULT_SECTOR_QUIET_TICKS_AFTER_RETALIATION` is (c). This section is
history from here down.

**Which of three, and only the owner can take the first of them.**

- **(a) Leave it.** The parity split stays; roughly two in five otherwise
  qualifying sessions never meet the mechanism, and the ones that do meet it as
  a metronome. It is the accepted decision 6 running exactly as written.
- **(b) Stop the coin flip.** Make the population that reaches tier 3 straddle
  the gangs by construction — for instance by assigning the smaller gang at
  the review site rather than the id's parity, which is still a pure function
  of recorded state and still draws nothing. **This changes ADR 0103
  decision 6 and is the owner's.** It is also the only one of the three that
  changes whether a player meets the mechanism at all.
- **(c) Cool the cadence.** A retaliation-specific quiet window, per §4 above.
  Balance is not a reserved surface, so this one is ours to tune — but tuned
  alone it makes a rare mechanism rarer, which is the wrong direction while
  (b) is unanswered.

**This document's recommendation is (b) then (c), in that order**, and it is a
recommendation rather than a decision: the thing that makes a gang war worth
building is that a player can meet it, and a cadence is only worth tuning for
players who get there.

## What this draft does not propose

- **It proposes no new string.** *"Two gangs are settling a score."* already
  exists in `src/content/default-locale-en.ts`, is byte-identical on this
  branch, and is true of the code that renders it: ADR 0103 decision 4's guard
  refuses a retaliation whose gangs have no members, and the integration test
  named above asserts the participant list is not empty at the moment the
  sentence reaches the channel.
- **It proposes no RNG.** ADR 0103 decision 5 keeps the incident tree free of
  draws, and the branch that carries this draft adds
  `tests/foundation/incident-rng-abstinence-contract.test.ts` to enforce that
  rather than leave it as a measurement somebody once took.
- **It proposes no save-schema move.** Every option above is reachable without
  a persisted field, which is what keeps (c) cheap and (b) cheaper than it
  looks.

## The weakest claim in this draft, as originally named — and what closed it

**Original text, kept:** "The twelve-seed sweep measures one prison shape. It
is the neglected bed-only prison the existing integration test builds, chosen
because it is the one shape already known to reach tier 3 — and a prison that
is *served* was measured by an earlier pass as producing no gang member at
all in eight of eight sessions. This draft did not re-measure that shape, so
it establishes how the parity split behaves **where the mechanism is
otherwise reachable**, and says nothing about how often a real player's
prison is that shape. If the honest answer is 'almost never', then (b) is
necessary and still not sufficient, and the next question is about tier 3
rather than about gangs."

**That "next question" is what §5 onward is.** The "earlier pass" cited above
was a GitHub comment, not a file this repository can re-run or cite by line
(issue #979,
[comment 5679194909](https://github.com/woogitsu/lockstate/issues/979#issuecomment-5679194909)):
eight seeds, the same "cells + toilets + amenities, 1 guard" shape, `0/8`
gang members, `0/8` grudges, `0/8` retaliations. §5 re-measures it as a
committed, re-runnable script, at twelve seeds instead of eight, on this
document's own tree, and finds the same shape of answer -- sharper, and now
checkable by anyone rather than only quotable.

## The question this document now carries: is tier 3 reachable in a well-tended prison at all

### 5. The mechanism — gangs read a tier they never write

`reviewClassification` is the only route to tier 3 an admission at
`priorIncidents: 0` (the game's one admission surface) can ever take, and its
score is four terms added together:

`
const score = sentence + intakeHistory + findings + cleanConduct;
const riskTier = clampTier(score);
`

(`src/simulation/prisoners/classification.ts:213-214`, quoted verbatim). Below
`LONG_SENTENCE_THRESHOLD_TICKS`, `sentence` is 0; at `priorIncidents: 0`,
`intakeHistory` is 0; `cleanConduct` is a decay term that is never positive.
**`findings` is the only term that can raise the score at all**, and it is
capped by `Math.min(MAX_FINDINGS_TERM, Math.max(0, disciplinary.points))`
(`src/simulation/prisoners/classification.ts:196`) against
`export const MAX_FINDINGS_TERM = 3;`
(`src/simulation/prisoners/classification.ts:127`). `disciplinary.points`
comes from exactly two sources: a terminal incident --
`assault: 2,` among `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`
(`src/simulation/prisoners/disciplinary-record.ts:46-51`), `+1` if it lapsed
(`export const LAPSED_INCIDENT_SURCHARGE_POINTS = 1;`,
`src/simulation/prisoners/disciplinary-record.ts:58`) -- or a confiscation,
worth 1 point each
(`export const CONFISCATION_FINDING_POINTS = 1;`,
`src/simulation/prisoners/disciplinary-record.ts:64`). A single lapsed
assault or one resolved escape attempt already saturates `MAX_FINDINGS_TERM`
on its own; three confiscations do the same, and a contraband item is only
ever introduced at review time for a prisoner whose tier is already rising
(ADR 0080 decision 2, §7 below), so confiscation cannot bootstrap tier 3
without an incident either.

**So tier 3 needs at least one terminal riot, assault or escape attempt on
that prisoner, before any gang code runs at all**, and whether one ever opens
is `IncidentTriggerSystem`'s question, not `default-gangs.ts`'s. A riot needs
`if (this.risk.isSustainedHot(sectorId) && !this.isQuiet(sectorId, context.tick, 'riot', this.quietTicksAfterIncident)) {`
(`src/simulation/incidents/trigger-system.ts:375`) -- twelve consecutive hot
sampling points, per the file's own "Four gates" docblock immediately above
this method. An assault is explicitly refused whenever the sector is not
already trending hot:
`if (this.risk.getConsecutiveHotSamples(sectorId) > 0) return false;`
(`src/simulation/incidents/trigger-system.ts:489`). "Hot" is a function of
need-deficit, contraband-severity and staffing-shortfall -- a needs-met,
staffed prison never crosses it, which is the invariant §6 measures directly
and §7 traces into two other ADRs.

`classificationGroupIdForTier` is the one door a tier crosses into
`'high-risk'`: `return riskTier >= 3 ? 'high-risk' : 'general-population';`
(`src/simulation/prisoners/classification.ts:58-59`). `default-gangs.ts` --
`defaultGangIdForArrival` and `recordGrudgeFromAdjudicatedAssault` alike --
only ever reads that classification group; nothing under
`src/simulation/incidents/` decides who reaches it. That is the whole of why
this is not ADR 0103's question, whichever issue keeps filing it there.

### 6. Twelve seeds, zero of everything, on `d18c2598`

Re-measured on `origin/main` @ `d18c2598` (the commit current when this draft
was written; `main` had moved from `e22c7760`, the commit the underlying
finding was first taken on, by one merge that touched none of the files cited
here -- confirmed with
`git diff e22c7760 d18c2598 -- src/simulation/incidents/ src/simulation/prisoners/classification.ts src/simulation/prisoners/disciplinary-record.ts`,
empty). The fixture is the "well-run" prison
`tests/integration/risk-tier-neglect-reachability.test.ts`'s
`buildWellRunPrison` builds -- fully furnished cells, a shower, a canteen, a
yard, one guard, eight prisoners admitted at the interface's own
`priorIncidents: 0` -- carried to 90 in-game days instead of that test's
50,000-tick window, over the same twelve seeds `0x0cc0`-`0x0ccb` §3's table
above already uses. Committed and re-runnable:
`scripts/report-well-tended-prison-gang-reachability.ts` (`npx tsx
scripts/report-well-tended-prison-gang-reachability.ts`).

`
seed | assaults | riots | escapeAttempts | gangRetaliations | gangMembers | grudges | finalRiskTier | peakRiskTier | earlyWarnings
0xcc0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1
0xcc1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 5
0xcc2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1
0xcc3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 3
0xcc4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2
0xcc5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2
0xcc6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2
0xcc7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1
0xcc8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2
0xcc9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 4
0xcca | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 3
0xccb | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 3
`

**Twelve of twelve seeds: zero assaults, zero riots, zero escape attempts,
zero gang members, zero grudges, zero retaliations.** `finalRiskTier` settles
at 0 (`Minimal`) in every seed. `peakRiskTier` and `earlyWarnings` are
non-zero and are **not** a defect in this claim -- they are a fixture
wrinkle, explained in full in the script's own docblock and repeated briefly
here: this run's admissions carry a 400,000-tick sentence (needed so nobody
is released before day 90), which is itself above
`LONG_SENTENCE_THRESHOLD_TICKS` and trips `reviewClassification`'s `sentence`
term once, independent of any incident.
`ClassificationEarlyWarningSystem` writes that as far as tier 2 before enough
clean-conduct credit accrues to let the next authoritative review bring it
back to 0 -- capped at tier 2 the whole time by `EARLY_WARNING_TIER_CEILING`,
never reaching the tier 3 gangs read. The columns that matter to this
document's question -- assaults, riots, escape attempts, and everything
downstream of them -- are the real, cumulative, incident-log counts, not a
final snapshot that could hide an earlier peak, and they are 0 in every cell.

**#1322 could not have moved this figure in either direction**, and did not:
both its changes -- the smaller-gang assignment and the retaliation quiet
window -- only run once a cross-gang assault has already happened between two
`'high-risk'` prisoners, and none ever becomes one.

### 7. A second shape: the same prison, twice its bed count

§5's weakest-claim precedent (below) and ADR 0080's own "what would change my
mind" (§8) both name the same gap: one prison shape, at capacity. The owed
second measurement is cheap with the same script family, so it was taken:
identical amenities, identical staffing (one guard), but **sixteen**
prisoners admitted into the same **eight** single-bed cells -- still
"well-tended" by every measure the first shape used (needs served, staffed,
no confiscated contraband, no priors), just twice the population the rooms
were built for. Committed and re-runnable:
`scripts/report-crowded-well-tended-prison-gang-reachability.ts`.

`
seed | assaults | riots | escapeAttempts | gangRetaliations | gangMembers | grudges | maxRiskTier | earlyWarnings
0xcc0 | 89 | 0 | 1 | 7 | 3 | 2 | 3 | 7
0xcc1 | 89 | 0 | 1 | 7 | 2 | 1 | 3 | 11
0xcc2 | 89 | 0 | 4 | 6 | 6 | 1 | 3 | 12
0xcc3 | 89 | 0 | 3 | 6 | 6 | 2 | 3 | 11
0xcc4 | 88 | 0 | 3 | 3 | 4 | 0 | 3 | 9
0xcc5 | 87 | 0 | 4 | 7 | 7 | 2 | 3 | 12
0xcc6 | 89 | 0 | 5 | 5 | 6 | 2 | 3 | 15
0xcc7 | 87 | 0 | 3 | 2 | 8 | 2 | 3 | 12
0xcc8 | 89 | 0 | 3 | 6 | 4 | 2 | 3 | 8
0xcc9 | 90 | 0 | 3 | 5 | 6 | 2 | 3 | 12
0xcca | 89 | 0 | 1 | 7 | 2 | 2 | 3 | 8
0xccb | 89 | 0 | 2 | 6 | 8 | 2 | 3 | 14
`

**Twelve of twelve seeds now reach tier 3, and gangs meet every one of
them.** `maxRiskTier` is 3 in every seed (here read as a true final tier,
since it reaches the ceiling and stays -- no early-warning ambiguity, because
a `'high-risk'` prisoner's authoritative review confirms rather than
retracts it); every seed produces gang members, and eleven of twelve produce
at least one grudge and at least two retaliations. `riots` stays 0 throughout
-- overcrowding raises assault-producing pressure (need-deficit from beds
that ran out) without ever sustaining twelve consecutive hot *sector-mean*
samples, so the riot gate and the assault gate answer differently under this
shape, which is itself informative: this is not "the prison degraded",
amenity for amenity it is identical to §6's; it is specifically that the
population outgrew the capacity built for it.

**Reading the two tables together is the finding, not either alone.** The
"well-run prison manufactures no incident" invariant is not a property of
amenities or staffing by themselves -- it is a property of amenities and
staffing *matching population*. A player who builds well and then keeps
admitting past what they built meets every mechanism this document is about,
without ever having neglected anything they already had.

### 8. What depends on the invariant this reopens

Two accepted ADRs name the same well-run-prison zero as load-bearing, and
both are opened here rather than only cited:

**ADR 0080** rests its Decision 2 on *"A well-run prison should not be able
to tell this decision happened"*
(`docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md:420`,
quoted verbatim) and measures it at **zero weapons, zero escape attempts,
zero riots and zero review-introduced items over 2,990 admissions and 6,000
in-game days on ten seeds**
(`docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md:438`,
`it**: zero weapons, zero escape attempts, zero riots and **zero items from the` quoted verbatim).
That document names its own limit in the same words this draft now answers:
*"The weakest claim in this document is the well-built prison's zero ...
the mechanism behind it -- 'a well-run prison promotes nobody to tier 3' --
is a property of `reviewClassification`'s clean-conduct credit against the
incident rate, not of this decision. If a prison exists that is well run by
every measure a player would recognise and still promotes steadily, this
decision hands it weapons and the table above would not have shown it"*
(`docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md:717-719`,
quoted verbatim). **§7 is exactly that prison.** It is well run by every
measure ADR 0080's own scenarios check -- amenities, staffing, priors all
held at the zero/ordinary case -- and it promotes steadily, at up to 90
assaults and tier 3 in twelve of twelve seeds. ADR 0080's Decision 2 itself
is not shown wrong by this: its own invariant is about the *priors*
distribution specifically, and §7 varies occupancy, not priors. But its
*premise* -- that "well run" is a single, stable population a decision can be
checked against -- is narrower than the document states it, and this is the
concrete case its own "what would change my mind" asked for and did not
have.

**ADR 0090** relies on the same zero as its control case: *"The well-run
control is unaffected. Same test file: zero incidents,
`ClassificationEarlyWarningSystem.getMetrics().warningsIssued === 0` over the
full 50,000-tick window"*
(`docs/adr/0090-medium-as-a-warning-not-a-skipped-step.md:296`, quoted
verbatim). §7's crowded prison is the case this control never ran: every
seed there reaches tier 3 (this draft did not verify at what tick relative to
tier 3 the early warning first fires in that shape, only that
`ClassificationEarlyWarningSystem` is far from idle -- `earlyWarnings` is 7
to 15 per seed). Nothing in ADR 0090 is contradicted -- it never claimed the
early warning stays silent in a *crowded* prison, only in the one shape it
tested -- but its control case is, like ADR 0080's, one population rather
than the space of populations a player might call well-tended.

**What would break if tier 3 became reachable some other way (§9's options
(b)/(c)) rather than through occupancy is not measured here.** Both ADRs'
invariants are about the *ordinary, at-capacity* well-run prison remaining
inert; neither says anything about a *deliberately unlocked* path to tier 3,
which is exactly the thing an implementer of option (b) or (c) below would
need to re-check both documents against before writing code.

### 9. The playability argument — my opinion, marked as such, kept short

If tier 3 is reachable only through neglect or through outgrowing your own
capacity, `'Two gangs are settling a score.'` and the whole of ADR 0103 is
something a competent, engaged player is more likely to never see than to
manage. `AGENTS.md`'s "a change that is right in every test and makes the
game duller has not succeeded" standard reads on this directly: every gang
test is green, the mechanism is correct, and a well-tended, right-sized
prison is duller for gangs existing only as a failure-state penalty rather
than an ongoing thing to manage. This rests on a normative claim -- that
gangs *should* be a systemic pressure rather than a rare consequence -- that
the owner may simply disagree with, and it is offered as opinion for that
reason, not as a finding.

## The decision §5 onward asks for

**Four options, not one recommendation dressed as four**, because an ADR that
shows only its own preference is not a decision aid.

- **(a) Leave it.** Tier 3, and therefore gangs, stay reachable only through
  neglect or overcrowding — never through ordinary, at-capacity, well-tended
  play. Authorises nothing; costs nothing in code. Gives up: a player who
  runs a competent, right-sized prison never meets the gang system, or most
  of the security-classification ladder above `Minimal`, for the life of that
  prison.
- **(b) Give `high-risk` (and therefore gangs) a reachability path that does
  not require an incident first** — for instance a slow idle/boredom or
  overcrowding-specific pressure that can itself accrue disciplinary findings
  or move `riskTier` directly, independent of `IncidentTriggerSystem`'s
  riot/assault gates. This is new territory under ADR 0048/0057/0061, not
  ADR 0103, because it changes what "well-tended" protects a prison from.
  Authorises: a design change to when tier 3 is reachable. Gives up: the
  invariant §8 shows ADR 0080 and ADR 0090 currently treat as a stable
  control — both would need to be reopened or explicitly scoped to say their
  guarantee holds only for the *at-capacity* case.
- **(c) Lower the "hot" threshold or shrink the sustained-hot window** that
  gates a riot, or loosen the "not already trending hot" condition that gates
  an assault, so an adequately-but-not-generously-staffed prison occasionally
  crosses it without being neglected or overcrowded. This is balance/number
  tuning, which `AGENTS.md` says is ours rather than reserved — but the gate
  is shared by every incident type (riots, assaults, escape attempts, the
  early-warning system, contraband introduction), not gang-specific, so it
  should be scoped and measured across all of them before being changed for
  gangs' sake alone.
- **(d) Accept it as intended, scoped precisely.** Rule that tier 3 above
  `Minimal` is meant to be a consequence of neglect or overcrowding
  specifically — not a background hum of an ordinary well-run session — and
  close this question on that basis. Authorises: closing #979's and this
  draft's open thread on tier-3/gang reachability. Gives up: nothing changes
  in the game as shipped; §9's playability opinion stands unaddressed by
  design rather than by oversight.

No option here is implemented, and none is a ruling. (b) and (c) are ADR
territory and are not decided in code by this document or by an agent.

## What this document does not propose, beyond what "What this draft does not propose" above already states

- **It proposes no priority between (b) and (c) above** — unlike the original
  "The decision this asks for" section above, which did recommend an
  ordering. §5 onward found
  a different kind of gap (an entire reachability path missing) than the
  original ask (a coin flip inside an existing one), and the two options here
  trade against different, only partly measured, costs (§8). A
  recommendation would be premature without re-opening ADR 0080 and ADR 0090
  first, which is (b)'s and (c)'s cost either way.
- **It proposes no change to `IncidentTriggerSystem`'s thresholds, no new
  pressure term, and no change to `reviewClassification`.** Every number
  cited in §5 is quoted, not altered.

## How to re-run this document's measurements

Both scripts live beside this draft on the same branch:
`scripts/report-well-tended-prison-gang-reachability.ts` (§6) and
`scripts/report-crowded-well-tended-prison-gang-reachability.ts` (§7). Each
is a standalone `npx tsx scripts/<name>.ts` run against the working tree; they
are not wired into `pnpm verify` or CI, and their own docblocks say so and
say why.
