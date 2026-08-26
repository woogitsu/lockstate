# ADR 0033: A restored session abandons an incident response and returns what it claimed

## Status

**Proposed — pending human approval.** Not accepted.

The implementing change is on the same branch as this document, which is the
shape [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 warns about: an ADR that lands
alongside its code is `Proposed` on `main` from the moment it merges and can sit
there unnoticed. **Its rule is not followed here, and that is a debt rather than
an exemption.** `STATUS-QUEUE.md` was out of this change's scope — the brief
this work was done under names that file as one it may not touch — so the queue
entry is owed, and this branch's pull request quotes the text it would have
added, verbatim, in the shape ADR 0032 set the day before. Whoever next edits
that file should paste it in.

Nothing here can be applied to a stored save. If this document is rejected the
code comes out with it and no player's file has been altered, which is the
property it exists to argue for.

### The number

**0033**, and the check `docs/adr/README.md`'s stated next-free cannot make was
made: the open pull requests on this repository at the time of writing are
**#355** (`fix/340-343-close-prison-id-oracles`, which carries no ADR) and
**#361** (`fix/352-incident-response-record-persistence`, which holds **0030**).
Nothing holds 0033. `docs/adr/README.md`'s next-free moves to **0034** in this
commit, because `tests/foundation/adr-numbering-contract.test.ts` derives it
from the highest number on disk. The index's own account of why that
enumeration is not optional — two collisions on 0024/0025 and one on 0030 — is
the reason it was run rather than assumed.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every figure below was measured
by executing this tree through the real save path (`captureSessionSnapshot` →
`createSaveEnvelope` → JSON round trip → `decodeSaveEnvelope` →
`restoreSimulationRuntime`), at `38e9c8d` (v0.0.104) for the defect and at this
branch's head for the fix. There is no external tier: the one product judgement
in here is named as such in decision 1 and is the owner's to make.

---

## Context

### The defect, measured before it was fixed

`IncidentResponseSystem` claims two things when it dispatches a response: it
moves each responder into the `'on-search'` deployment phase, and for an
incident at or above `lockdownSeverityThreshold` it drives the incident's sector
into `'lockdown'`, which cascades onto every door that sector governs.
`releaseResponse` gives both back when the response closes, and it reads a
private per-incident record to know what to give back.

That record is not in the payload — `getSnapshot` emits metrics only — while
**both claims are**: a guard's `deploymentPhase` including `'on-search'`, and
`sectorControlStates` including `'lockdown'`. So a restore does not undo the
claim. It makes it permanent.

Re-measured at v0.0.104 on issue #352's own reproduction — a severity-8 riot,
six guards hired, four required responders, saved one tick after dispatch:

| | incident | sector control | door | guard phases | unassigned |
|---|---|---|---|---|---|
| at save (tick 1) | `notified` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | 2 |
| continuous, release on tick 71 | `resolved` | **`normal`** | **`open`** | 6×`unassigned` | **6** |
| restored, +2,000 | `lapsed` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | 2 |
| restored, **+53,000** | `lapsed` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | **2** |

There is no recovery path: `GuardRoster.unassign`'s callers in `src/` are all
unreachable for an `'on-search'` guard, and no dismiss command exists. The
prison is permanently four guards smaller and one sector darker, with the hiring
charge already spent. Issue #352 has the full account.

### Why this is a decision rather than a bug fix

Two things put it outside the "bug fix inside a contract `docs/PERSISTENCE.md`
already states" category, and `AGENTS.md`'s requirement that a persistence
trade-off be recorded rather than decided in implementation code is what makes
them this document's business:

1. **What a restored session owes an interrupted response is a semantic
   choice**, not a repair. Resuming it and abandoning it are both coherent, and
   they produce different play.
2. **The obvious fix is a save-schema version.** Putting the record in the
   payload is mechanical and correct, and it is also a V6 — which means a
   migration has to decide what happens to the resources a save already
   written is holding, applied silently and irreversibly to a player's stored
   prison the first time they load it.

Issue #352 named both options and declined to choose. PR #361 chose the first
and recorded it as its own ADR (0030, on that branch, not on `main`). **This
document is the second, and it exists because the first one's decision 3 asks
for a permission it turns out not to need.**

### The claim this document disputes

ADR 0030 decision 3 grants a migration permission to write a section its version
did not change, under three conditions, the third of which is: *"the alternative
must be a loss the player cannot reverse in game."*

**The third condition is not met, and the measurement below is why.** The
recovery does not have to be written to disk. Both of the facts decision 3
derives its written values from are available at load time to the *running
simulation*, from the same payload:

- an `'on-search'` guard that no active search job names was a responder, and
- a `'lockdown'` that no open incident justifies is residue.

A migration writes those conclusions into the file. A restored session can act
on them instead, on a tick, leaving the file exactly as it found it. The
alternative to rewriting the section was never "leave it held forever"; it was
"release it at runtime", and that alternative is reversible in the strongest
sense available — the player still has the save they had.

## Decision

### 1. A restored session does not inherit an emergency response

The response is **abandoned and its resources are returned**, not resumed.

`IncidentResponseSystem.loadSnapshot` marks a reconciliation as owed, and the
system's **first scheduled `update` after the load** performs it: every
`'on-search'` guard that no active search job names and no live response record
claims is handed back to the unassigned pool, and every `'lockdown'` sector that
no open incident justifies is returned to `'normal'`. The incident itself is
untouched. It lapses at its own deadline, which is issue #28's
*"failed/late response produces consistent outcomes rather than hidden success"*
rather than a hidden success.

**This is the product judgement in this document, and it is the owner's.** What
a player sees, against the two alternatives:

| | This decision | PR #361 (save-schema V6) | Leave it as it is |
|---|---|---|---|
| Responders | Back on duty, one system interval after the load at the latest | Stay on the response, which completes | **Held forever** |
| Lockdown | Lifts when the incident closes | Lifts when the response contains the incident | **Held forever** |
| The incident | Lapses: every participant injured, property damage equal to severity | Resolves: nobody injured, damage halved | Lapses, holding everything |
| A stored save already stranded | Repaired on every load, in memory | Repaired once, **by rewriting the file** | Never |
| Reversible by the player | Yes — the file is unchanged | **No** | — |
| Save-schema version | Unchanged (5) | 6 | Unchanged |

The cost is stated rather than minimised: **a save taken during a severe
incident makes that incident's outcome worse.** It is the outcome an
understaffed prison gets anyway, it is confined to incidents open at the moment
of the save, and it is not a resource the player can never get back. A prison
silently four guards smaller forever is a corrupt save; a riot that ran its
course because the response was interrupted is a bad afternoon.

### 2. The guards go back immediately; the lockdown waits for the incident

Asymmetric on purpose, and the asymmetry is the semantics.

- **The responders** are the response's claim and nothing else's, so they are
  released as soon as the sweep runs.
- **The lockdown** is a consequence of an incident's *severity*, not of the
  responders — `tryDispatch` applies it from
  `incident.severity >= lockdownSeverityThreshold`. Lifting it while a
  severity-8 riot is still running would unlock a sector the prison would have
  locked anyway. So a `'lockdown'` an open incident still justifies is left
  standing, and `lapse` lifts it at the transition that ends the justification.
  A `'lockdown'` no open incident justifies — the state a save already stranded
  by an earlier load is in — is residue and is lifted by the sweep itself.

`'restricted'` is never touched, and `releaseResponse`'s own condition for
lifting a lockdown it *does* hold a record for is unchanged.

The doors need no handling at all: `navigation.doors` records each governed door
at its **baseline** state and `SecuritySectorRegistry.loadSnapshot`
re-cascades, so writing the control state is what unlocks them. That is
`docs/PERSISTENCE.md`'s "A lockdown must stay liftable" already paying for
itself.

### 3. On a tick, and owed by a flag rather than by a tick comparison

The release is a simulation state change and happens where simulation state
changes belong: inside a system's `update`, driven by the kernel. A snapshot
load is re-hydration.

Two consequences, both load-bearing:

- **The payload a restored session re-captures is the payload it was given.**
  This is the property that makes the decision reversible, and it is asserted
  rather than described: an eager sweep inside `loadSnapshot` fails that test
  with `deploymentPhase` rewritten in the re-captured bundle.
- **A save taken on a scheduled tick is reconciled on that tick.** The sweep is
  owed by a pending flag consumed on the first `update`, never by a comparison
  against the tick the save was taken at — the trap `ProcurementSystem.update`'s
  `<=` comment states, since a restored session resumes at the save's tick and a
  scheduled system does not run on every tick.

Measured, and pinned as numbers rather than described as small. `kernel.tick`
below is read after the step that produced the observation, the convention
#352's table used:

| save taken at | continuous release | responders released | lockdown lifted |
|---|---|---|---|
| tick 1 (`notified`, responders travelling) | 71 | **11** | 611 |
| tick 10 (`notified`, on this system's cadence) | 71 | **11** | 611 |
| tick 11 (`responding`, responders arrived) | 71 | **21** | 611 |

The bound is **the distance from the save to this system's next scheduled
update, and nothing else** — at most one interval, ten ticks, and zero when the
save lands on one. Whether the responders had arrived makes no difference,
because nothing is resumed.

### 4. The premises are facts about `src/`, and they are tested rather than cited

The same standard ADR 0030 decision 3 sets for itself, met here for the same
reason: a rule derived from a fact about the tree is only as sound as the fact,
and a fact nothing asserts is a fact that will change quietly.

- **An `'on-search'` guard that no active search job names was a responder.**
  Exactly two things in `src/` set that phase, and one of them is `SearchSystem`,
  whose active jobs *are* in the payload — which is why it does not leak and
  this system did.
  `tests/integration/incident-response-restore.test.ts` builds a session
  holding both kinds of `'on-search'` guard at once and shows the sweep
  separating them, and
  `tests/foundation/deployment-phase-producer-contract.test.ts` pins the
  producer set **and its call-site count**, so a third producer fails a test
  instead of silently having its guard released out from under it. A new
  producer is not forbidden; it has to arrive with a decision about what a
  restore owes its claim, and that is where the decision is asked for.
- **A `'lockdown'` no open incident justifies is residue.**
  `IncidentResponseSystem` is the only writer of `'lockdown'` in `src/`, and it
  holds one only while an incident in that sector is open. Pinned in the same
  contract file, with `'restricted'` asserted to have no producer at all.
- **The claim view is read live, not captured at load.** `SearchSystem`
  (order 290) updates *before* this system (order 295) on the very tick the
  sweep runs, and can staff a queued search order out of the unassigned pool in
  between. A guard claimed in that pass is `'on-search'` by the time the sweep
  looks and was not when the payload was written. Measured: capturing the set
  at load time instead releases that guard and strands the search job, and one
  test fails.

## Consequences

- **`SAVE_SCHEMA_VERSION` stays 5.** `src/persistence/save-schema.ts` is not
  touched, the `incidents.response` object stays `.strict()` with metrics only,
  `tests/fixtures/persistence/` is unchanged, and no migration is added. **V6
  stays free**, which #337 also wants it to be.
- **Nothing is written to a stored save, ever.** The repair is recomputed on
  every load from evidence already in the file. A save the unfixed build
  stranded loads to the same repair every time, and still holds its
  `'on-search'` guards and its `'lockdown'` if it is loaded by an older build.
- **The `docs/PERSISTENCE.md` bullet stays corrected rather than reverted.**
  #353 moved `IncidentResponseSystem` out of the group that pays "a bounded
  delay, not lost progress", and it stays out: progress *is* lost here — the
  response is abandoned — and the honest statement is that **nothing is
  stranded**, which is a different and weaker claim. Putting it back in that
  group would require resuming the response, which decision 1 declines.
- **A restored session and a continuous one reach different incident
  outcomes.** They agree exactly on every resource the response claimed and
  disagree on the incident: `resolved` against `lapsed`. That is a divergence a
  replay verifier (ADR 0009) must not be pointed at across a restore boundary
  for an open incident, and it is the same class of divergence
  `docs/DETERMINISM.md` already records for `JobSystem.performingSince`, one
  step larger.
- **Determinism is unaffected.** The sweep draws no RNG, iterates ascending
  guard id and sector id, and is a pure function of the restored payload; two
  sessions restored from one payload are hash-identical at every checkpoint
  through the release and the lapse.
- `supabase/migrations/` is untouched, and nothing about this reaches the
  database.
- **If this ADR is rejected**, the fix comes out with it and #352 is open again
  with PR #361's V6 as the remaining candidate. Nothing has to be un-migrated,
  which is the whole of the argument.

## Open questions

1. **Should a restored session re-dispatch instead of abandoning?** The freed
   responders are back in the pool and the incident is still open, so a fresh
   response is one `tryDispatch` away — except that the incident lifecycle is
   forward-only and the incident is already `'notified'`, so re-dispatching
   means creating a record for an incident in a state `tryDispatch` never sees.
   That would recover the *outcome* as well as the resources, at the cost of a
   containment timer that restarts. It is deliberately not in this change: it is
   a second semantic decision ("a restored session mounts a new response"), not
   an implementation detail of the first.
2. **Could the response be resumed exactly, with no schema change at all?**
   Partly, and more than ADR 0030 decision 1 assumes. `containmentStartedAtTick`
   is recoverable from the incident's persisted `timeline` — the `'responding'`
   entry's `atTick` is the tick it was set on — and `arrivedGuardIds` is
   recoverable from tile geometry, because an arrived responder stands on its
   incident's post tile and `beginTravelToIncident`'s `sameTile` check already
   makes exactly that inference. What is **not** recoverable is which incident
   each responder served when two are open with responders committed, and a
   resumption has to guess. Not done, because a release needs no guess at all
   and a permanent guess is worse than a one-off migration guess.
3. **Should a dismiss/fire command exist regardless?** The absence of one is
   what made this defect terminal rather than merely slow, and it will make the
   next resource-claiming system's equivalent bug terminal too. A gameplay
   surface decision, not this document's.
4. **Should the player be told the response was interrupted?** The incident log
   records the lapse and its outcome; nothing surfaces "this response was
   abandoned by a save/load". A projection question.

---

## Amendment: a restored session re-dispatches (open question 1, answered)

**Status of this section: `Proposed`, with the rest of this document.** It is an
amendment rather than a new ADR because open question 1 is this decision's own
question — *"a restored session mounts a new response"* is the second half of
"what does a restored session owe an interrupted response", not a different
subject. **Nothing above is edited**, including the Status: the four decisions
stand exactly as written and this section is additive. Where a sentence above is
now narrower than it was, this section says so and does not go back and reword
it, because the document's value is partly the record of what was decided when.

### What the owner asked for

The outcome recovered as well as the resources, accepting the containment timer
that restarts as the price. Open question 1 named that price and named the
obstacle; both are addressed below.

### The obstacle, verified rather than trusted

Open question 1 states it as: *"the incident lifecycle is forward-only and the
incident is already `'notified'`, so re-dispatching means creating a record for
an incident in a state `tryDispatch` never sees."*

**Both halves are true and the conclusion drawn from them was too strong.** The
lifecycle really is forward-only (`LEGAL_TRANSITIONS` in
`src/simulation/incidents/incident.ts`: `notified: ['responding', 'lapsed']`,
with no edge back to `'active'`), `tryDispatch` really does run only from
`'active'` (`update`'s `if (incident.state === 'active')`), and a re-dispatch
really does mean creating a record for an incident in a state `tryDispatch`
never sees. What none of that establishes is that the record cannot be created.
`tryDispatch` was doing **two** things in one method — claiming responders and
*notifying* — and only the second is unavailable past `'active'`. Separating them
is the whole of what this needed:

- `mountResponse` claims the responders, applies the lockdown the severity calls
  for, routes whoever is not already there and records the response. It performs
  **no lifecycle transition** and is legal from any open state.
- `tryDispatch` is `mountResponse` followed by `transition(..., 'notified')`,
  and is still reached only from `'active'`.

**`LEGAL_TRANSITIONS` is not widened by a single edge, no state is written
backwards, and `IncidentLog.transition` still rejects an illegal transition
rather than being asked to permit one.** The obstacle was a fact about a method
boundary, not about the lifecycle. `advanceResponse`'s own comment claimed
*"re-dispatch is impossible from here"*; it was wrong in one word — impossible
*from `tryDispatch`* — and that comment is corrected in the same change.

### Decision 5. A restored session releases, and then mounts a fresh response

Immediately after `releaseOrphanedClaims`, on the same scheduled update and owed
by the same flag, `redispatchInterruptedResponses` mounts a **new** response to
every still-open incident that no live record claims.

**Decision 1 stands unchanged.** The interrupted response is still abandoned and
everything it held is still handed back; the release is what refills the pool the
re-dispatch draws from. There is no resumption anywhere in this: no responder is
attributed to the incident it used to serve, no containment progress is
inherited, and no `arrivedGuardIds` is reconstructed. So **open question 2's
guess is still never made** — the fact it names as unrecoverable is not needed by
a fresh dispatch, exactly as it was not needed by a release.

Decision 3's shape is kept exactly: one flag, set by `loadSnapshot`, consumed on
the first `update`, never a comparison against the tick the save was taken at.
Both steps happen once per restore, in one statement, on a tick the kernel drove.
A save taken *on* a scheduled tick is re-dispatched on that tick — the case the
`ProcurementSystem.update` `<=` trap would have stepped over.

Determinism is unaffected for decision 3's reasons plus one: `openIncidents()` is
sorted by id, `claimableResponders` draws the lowest unassigned entity ids
(`unassignedGuardIds()` is ascending), and nothing in the pass touches an RNG
stream. Two sessions restored from one payload are hash-identical at every
checkpoint through the release, the re-dispatch, the fresh containment window and
the resolution.

### 6. The outcome is fully recovered. Here is what it costs

**Tier R, measured on #352's own reproduction** — a severity-8 riot, six guards,
four required responders — through the same real save path as the figures above,
at this branch's head. Every restored figure is compared against a **continuous
run executed live on the same seed**, never against a literal from a prior run
(#375).

| | incident | outcome | closes on | `respondersDispatched` |
|---|---|---|---|---|
| continuous | `resolved` | `injuredEntityIds: []`, `propertyDamage: 4` | 71 | 4 |
| restored, save at tick 1 | `resolved` | **`[]`, `4`** | **81** | **8** |
| restored, save at tick 10 (on cadence) | `resolved` | `[]`, `4` | 81 | 8 |
| restored, save at tick 11 (`'responding'`) | `resolved` | `[]`, `4` | 81 | 8 |

Against decision 1's own measurement — `injuredEntityIds: [1,2,3]` and
`propertyDamage: 8` — **the outcome is recovered exactly, not approximately.**
Three costs, each priced rather than described:

1. **The incident closes later, by the progress the save discarded.** The fresh
   response's clocks start at the re-dispatch tick: a `'notified'` save redoes
   the travel, a `'responding'` save restarts the containment timer. So the
   lateness is that discarded progress, rounded up to this system's cadence and
   **capped at `containmentTicks`** — a save one tick before containment
   completes throws away sixty ticks and no more, because there were never more
   than sixty to throw away. Measured, for a save taken mid-containment:

   | save taken at | restored closes on | later by |
   |---|---|---|
   | 11 | 81 | 10 |
   | 21 | 91 | 20 |
   | 31 | 101 | 30 |
   | 51 | 121 | 50 |
   | 61 | 131 | **60** |
   | 69 | 131 | **60** |

2. **The responders come back when the *new* response closes, not one interval
   after the load.** This narrows decision 1's table row *"Responders: Back on
   duty, one system interval after the load at the latest"* — measured, all six
   guards are in the pool on tick 81 rather than tick 11. It is stated as a
   narrowing rather than a correction: that row was true of decision 1 and is
   true of this document's first four decisions. What matters is that the wait is
   still **bounded**, where #352's was permanent, and it ends with the incident
   contained rather than with a riot that ran its course.

3. **`respondersDispatched` counts the second dispatch**, so a restored
   session's counter is twice a continuous one's for the same incident. Counted
   rather than suppressed, because a second dispatch is what happened, and it is
   the observable that proves both halves ran: four guards were handed back and
   four were claimed again from a pool they were only in because the release put
   them there.

### 7. Re-dispatch is refused rather than guessed at, in four cases

Each one is a refusal to invent something, and the fourth is a real bound on
what this amendment can recover.

1. **An `'active'` incident is skipped** — `tryDispatch` owns it and runs on the
   same update, a few lines below. Dispatching here as well would double-claim.
2. **An incident past `responseDeadlineTicks` is skipped**, so the deadline still
   decides. `startedAtTick` is in the payload, so a save loaded long after the
   incident began finds it already too late and lapses on the incident pass
   exactly as decision 1 says.
3. **An incident whose sector the registry does not hold is skipped.** A
   restore-path hazard rather than a hypothetical:
   `SecuritySectorRegistry.loadSnapshot` skips a sector session setup did not
   re-register, and `mountResponse` reaches `requireDefinition` through both
   `setControlState` and `incidentTile`, which throws — out of `Kernel.step()`,
   which nothing on a tick may do. `lapse` already tolerates exactly this case
   for exactly this reason, and this pass tolerates it the same way rather than
   turning a tolerated restore into a crash.
4. **An incident already `'responding'` is re-dispatched only if every responder
   the pool offers is already standing on its post tile.** That state asserts
   that responders arrived, and `advanceResponse`'s `'responding'` branch reads
   no route results at all — so a response re-mounted from guards who are
   somewhere else would contain the incident with a responder still in transit
   and leave a navigation request nothing ever collects.

   **Case 4 is reachable, and this is the honest cost of the whole amendment.**
   With two incidents open, `openIncidents()` is sorted by id and
   `unassignedGuardIds()` is ascending, so the incident whose id sorts first
   claims the lowest guard ids. When the incident that sorts *last* is the one
   already `'responding'`, what is left for it is the other incident's
   ex-responders, standing at the other incident's post tile. Measured — two
   severity-8 riots in two sectors, ten guards, `'incident-z'` mid-containment
   and `'incident-a'` mid-travel at the save: `'incident-a'` resolves with `[]`
   and `4`, and **`'incident-z'` lapses with `[1,2]` and `8`**, which is decision
   1's outcome verbatim. Nothing is stranded either way — all ten guards return
   and both sectors return to `'normal'`, so #352 is fixed for both.

   This is **open question 2's un-recoverable fact re-appearing as a bound**:
   *"which incident each responder served when two are open with responders
   committed"* is exactly what would have to be known to give a `'responding'`
   incident its own responders back, and it is still not in the payload. This
   amendment does not guess it. So the honest summary is: **a restored session
   recovers the outcome of every interrupted incident except a `'responding'` one
   that loses the id race to another open incident, and that one gets decision
   1's outcome unchanged.**

### 8. What this changes about the Consequences above

- **`SAVE_SCHEMA_VERSION` is still 5.** `src/persistence/save-schema.ts` is
  untouched, `incidents.response` stays `.strict()` with metrics only,
  `tests/fixtures/persistence/` is unchanged, no migration is added, and **V6
  stays free** for #337.
- **Nothing is written to a stored save, ever**, and the round-trip assertion
  that proves it is unchanged and still passes: the payload a restored session
  re-captures is the payload it was given.
- **The "different incident outcomes" consequence is narrowed, not withdrawn.**
  It said a restored session and a continuous one *"agree exactly on every
  resource the response claimed and disagree on the incident: `resolved` against
  `lapsed`."* They now agree on the incident too, and disagree on **when** it
  closed and on `respondersDispatched`. A replay verifier (ADR 0009) may compare
  the resource state and the eventual outcome across a restore boundary, and may
  not compare the closing tick or a dispatch counter — a narrower prohibition
  than the one recorded above. `docs/DETERMINISM.md` is corrected accordingly.
- **The `docs/PERSISTENCE.md` bullet stays out of the "bounded delay, not lost
  progress" group**, and the reason changes rather than disappearing: progress
  *is* still lost — the interrupted response is abandoned — and it is then
  redone, so what the player pays is time rather than the outcome. The bound is
  no longer "one interval to the release" but "the discarded progress, capped at
  `containmentTicks`".
- Open question 3 is answered separately and is a gameplay surface, as this
  document said it was.
