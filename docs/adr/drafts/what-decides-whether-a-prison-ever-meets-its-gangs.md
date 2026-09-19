# ADR draft: what decides whether a prison ever meets its gangs

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument. Nothing in `src/` or `tests/` cites it;
> `grep -rln "what-decides-whether-a-prison-ever-meets-its-gangs" src/ docs/ tests/`
> is the list and it was run rather than recalled.

## Status

**Proposed, and nothing on the branch that carries it implements it.** That is
the opposite ordering to the two drafts beside it, and deliberately so: what
this asks for is a change to
[ADR 0103](../0103-what-a-gang-is-and-how-a-grudge-forms.md) decision 6, which
the owner accepted on 2026-09-08 and refined by ruling open question 5 on
2026-09-09. An agent does not re-decide an accepted decision inside
implementation code (`CLAUDE.md`), so this document asks and stops.

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

## The weakest claim in this draft, named

**The twelve-seed sweep measures one prison shape.** It is the neglected
bed-only prison the existing integration test builds, chosen because it is the
one shape already known to reach tier 3 — and a prison that is *served* was
measured by an earlier pass as producing no gang member at all in eight of
eight sessions. This draft did not re-measure that shape, so it establishes
how the parity split behaves **where the mechanism is otherwise reachable**,
and says nothing about how often a real player's prison is that shape. If the
honest answer is "almost never", then (b) is necessary and still not
sufficient, and the next question is about tier 3 rather than about gangs.
