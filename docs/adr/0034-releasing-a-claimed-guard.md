# ADR 0034: Releasing a claimed guard — one command, every claimant

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation, and the distinction
matters.** The owner did not read this document. Asked which of the outstanding
decisions they wanted to take, they answered *"choose yourself"*. So this is a
real approval — but of the *judgement delegated*, not of the text. Anyone who
disagrees with a decision below should treat it as open rather than as settled by
an owner who weighed it.

What was weighed before the delegation: that having no way to release a claimed
guard is what made #352's defect **terminal rather than merely slow**, and that
the next resource-claiming system's equivalent bug would be terminal for the same
reason. What decided it was a measurement, not an argument — the naive
`unassign`-only version fails 7 of 18 cases, one of them a riot reaching
`resolved` while counting a released guard toward its quorum, which is containment
invented out of a guard already back in the pool.

**Decision 9's question is answered elsewhere.** It put the security tier's
ship-or-not judgement to the owner; that is #396, the owner chose a derived
default sector, and a separate change implements it.

This document answers [ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
**open question 3** — *"Should a dismiss/fire command exist regardless? The
absence of one is what made this defect terminal rather than merely slow, and it
will make the next resource-claiming system's equivalent bug terminal too. A
gameplay surface decision, not this document's."* It is a new decision rather
than an amendment to 0033 for the reason that question gives: it is a gameplay
surface, and 0033's four decisions are about what a *restore* owes an interrupted
response.

### The queue-entry debt, which is owed and quoted rather than paid

This document owes [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 an entry and does not
have one. **That is a debt, not an exemption.** The brief this work was done under
names that file as one it may not touch — a second change is in flight against it
— so the entry is quoted verbatim in this branch's pull request instead, in the
shape ADR 0032 set and ADR 0033 repeated. §2 already records that pattern as its
own rule failing under concurrency rather than as an author's oversight, and names
the fix it needs (*"a file per entry in a directory, most likely"*). Whoever next
edits that file should paste the quoted entry in.

For the same reason as 0033: **nothing in this change can be applied to a stored
save.** If this document is rejected the code comes out with it and no player's
file has been altered.

### The number

**0034**, and the check `docs/adr/README.md`'s stated next-free cannot make was
made rather than assumed. `mcp__github__list_pull_requests` at the time of
writing returns exactly two open pull requests on this repository:

- **#393** (`docs/accept-0033-and-0007-amendment`) — documentation only. Its
  `docs/adr/` listing holds 0001–0033 with 0018 and 0030 absent; it adds no ADR.
- **#355** (`fix/340-343-close-prison-id-oracles`) — its `docs/adr/` listing
  holds 0001–0029 with 0018 absent; it carries no ADR.

**Nothing holds 0034.** `docs/adr/README.md`'s next-free moves to **0035** in this
commit, because `tests/foundation/adr-numbering-contract.test.ts` derives it from
the highest number on disk. The index's own account of why that enumeration is
not optional — two collisions on 0024/0025 and one on 0030 — is why it was run.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every simulation figure was
measured by executing this tree through the real kernel and the real command
handler; every pixel figure was measured on the assembled page in a real browser
through `tests/browser/ui-held-guards.spec.ts`'s harness. There is no external
tier. The one product judgement — that a release is a claim release and not a
dismissal — is named as such in decision 5 and is the owner's to make.

---

## Context

### The defect this is the general form of

ADR 0033 measured a specific, terminal loss: a save taken during an incident
response came back with four responders permanently `'on-search'` and one sector
permanently `'lockdown'`, unchanged 53,000 ticks later. It fixed that case at
runtime, and it named the general condition behind it in one sentence:

> `GuardRoster.unassign`'s callers in `src/` are all unreachable for an
> `'on-search'` guard, and no dismiss command exists.

**Verified rather than cited.** `GuardRoster.unassign` has been complete since
#26. Every caller of it in `src/` sits *inside the system that made the claim
being released*:

| caller | fires when |
|---|---|
| `SearchSystem.releaseGuards` | its job completes, or its route fails |
| `IncidentResponseSystem.releaseResponse` | its response closes |
| `IncidentResponseSystem.releaseOrphanedClaims` | a restore-time sweep, and only for a claim *nothing* names (ADR 0033) |
| `DeploymentSystem.continueDeploymentTravel` | a deployment route fails |

So the shape of the problem is not "guards cannot be unassigned". It is: **a
claim can only be released by the thing that made it, and only when that thing
decides it is over.** Any system that loses track of a claim strands it, and
there is no outside route in. That is what makes #352's class of bug terminal
rather than slow, and it is what 0033 predicted would recur.

### What was actually missing, and it was not a button

The same diagnosis `CancelBuildOrder` sat under until #367 and
`CancelMaterialPurchase` until #285: **a read model, not a control.** A guard id
is a staff `EntityId` minted by `EntityStore.spawn` *inside* the simulation. It
never reached the main thread at all — `hud/staff` was catalogued and read by
nobody — so a control would have had nothing to aim at.

And `hud/staff` would not have been enough even if it had been read, which is the
respect in which this differs from both of those. It carries
`assignment.deploymentPhase`, and **`'on-search'` is a shared phase with exactly
two producers** — the fact ADR 0033 decision 4 is entirely about. A row saying
"On Search" cannot say whether the guard is on a contraband search or in a riot,
and those are different decisions for a player to make.

## Decision

### 1. One command, naming a guard, resolved by the simulation

`ReleaseGuardAssignment { guardId }`. A staff `EntityId` and nothing else.

**Not one command per claimant**, and the reason is not tidiness. Three commands
— release-from-search, release-from-response, release-from-post — would put the
resolution of *"what is holding this?"* on the main thread, which cannot answer
it: telling a responder from a searcher requires asking both claimants live,
inside the simulation, at the tick the release runs. A claim chosen on the main
thread would be a guess against a projection that is a cadence old, and it would
be wrong in exactly the race decision 4's refusal exists for.

So the command names the guard and the simulation names the claim.
`GuardReleaseService.claimOf` is that resolution, and it is **the same function
the read model behind the surface reports with** — so a row and the press on it
cannot disagree about what is being released.

**No claim, no sector, no incident id, no search order id, and no
"and re-deploy to".** Each is a property of the record the guard id already
reaches, or a second action. `releaseGuardAssignmentSchema` is `.strict()`, so
adding one is a decision rather than a slip.

### 2. The claimant is told first; the roster is written once

This is the decision, and everything else in the document follows from it.

`GuardRoster.unassign` **alone is a bug, not a fix, and a bigger one than the one
it repairs.** The roster holds a guard's phase and sector; the *claim* lives in
the claimant's own bookkeeping — a `SearchJobRecord`'s `guardIds`, a
`ResponseRecord`'s `guardIds` and `arrivedGuardIds`. Unassigning without telling
the claimant leaves the two disagreeing, and the disagreement is not benign.

**Measured, by building exactly that implementation and running this change's own
tests against it** (`GuardReleaseService.release` reduced to a single
`this.guards.unassign(guardId)`): **7 of 18 fail**, and the failures are not
cosmetic.

| what the naive release does | measured |
|---|---|
| a search job keeps naming a released guard | job stays `'travelling'` after its only guard is gone, `searchesCancelled` never moves |
| a response keeps counting a released guard toward its quorum | **the riot `resolved`** where it should have `lapsed` — four responders' worth of containment delivered by three |
| the two `'on-search'` claimants are indistinguishable | releasing a searcher leaves `searchSystem.claimedGuardIds()` naming it |

The second row is the one worth naming. A release that told only the roster
**invented containment**: the incident reached `'resolved'` with a responder that
had been handed back to the pool and could have been posted to a sector by
`DeploymentSystem` in the meantime. That is a worse failure than a stranded
guard, because a stranded guard is visible and this is not.

So: each claimant is asked to drop the guard, and the service performs the single
`unassign` afterwards. **Neither claimant touches the roster**, so the write
happens exactly once from exactly one place.

`SearchSystem.releaseGuard` and `IncidentResponseSystem.releaseResponder` are
those two calls. `IncidentResponseSystem.claimedGuardIds` is new beside them and
is the positive counterpart of ADR 0033's negative definition — the sweep still
asks *"which `'on-search'` guards does nothing live name"*, and this asks *"which
guards does a live record name"*. The two are not redundant: only the first can
see a claim whose record a save destroyed.

### 3. A claimant left with nothing is ended, not left empty

- **A search job with no guards is cancelled**, counted on `searchesCancelled` —
  the same counter a route failure increments, because it is the same fact about
  the order. Leaving it active would be worse than cancelling it in two ways that
  are facts about `SearchSystem` rather than judgements:
  `beginTravelToCurrentTarget` would iterate nothing, so `allArrived` stays
  `true` and the job marches through every target dwelling on each with nobody
  present; and `runDetectionForCurrentTarget` reads `job.guardIds[0]!` for the
  `foundByGuardId` on every confiscation it records.
- **A response with no responders is abandoned and the incident is left open.**
  The record is deleted and nothing is transitioned: the incident runs to its
  deadline and lapses, which is issue #28's consistent-failure outcome and
  exactly what `advanceResponse`'s no-record path already does for a response a
  save interrupted.

**The lockdown lifts, and the branch that lifts it is ADR 0033's, reused rather
than rewritten.** A record-less open incident is precisely the state
`liftLockdownNoOpenIncidentJustifies` was added for, so releasing every responder
from a severity-8 riot leaves the sector dark only until that incident closes —
measured: `'lockdown'` and `'locked'` while the riot runs, `'normal'` and
`'open'` at the lapse. Without that reuse this command would have re-created
#352 with a different cause, and that is the single strongest argument for
building it on top of 0033 rather than beside it.

**What it deliberately does not do is close the incident.** A release is a
staffing decision, not a verdict on the riot. Measured: after every responder is
released the incident is still `'notified'`, still open, and still has no
`outcome` — a command that resolved or lapsed it would be writing an outcome the
simulation had not reached.

### 4. A refusal, from a named union, because a boolean could not have reached a player

`release` answers a `GuardReleaseOutcome`, never a boolean, and that is a
repository rule rather than a preference: `tests/unit/simulation-refusals.test.ts`
requires each wire reason to come from an exhaustive `Record` over a closed
union, so a boolean return **could not be reported to the player at all**. This
is the second time that has decided an API — `ProcurementSystem.cancel` gained
`PurchaseCancelRefusalReason` for the same reason in #285 — and it is worth
naming as a pattern, because "a release either worked or it did not" is exactly
the shape a boolean looks adequate for.

`release-guard.*` is the wire vocabulary's **tenth** namespace, and it is its own
rather than more members of `hire.*` because hiring and releasing are opposite
gestures on the same roster: somebody who pressed Release must not read that a
wage could not be paid.

- `release-guard.not-held` — **the reachable one.** `hud/held-guards` is
  published on a cadence, so a response can close or a search can finish between
  the publication and the press. Silence there would be a control that appeared
  to free a guard and did not, which is #82's and #207's subject. Not
  idempotent-by-silence either: a second release of the same guard is refused and
  the player is told, so a race is distinguishable from a success.
- `release-guard.unknown-guard` — reachable only from a command composed
  elsewhere (a queued command in a restored save, a future producer), and mapped
  for the reason every other table maps its whole union.

**No pre-check on the main thread**, for `CancelMaterialPurchase`'s reason with a
person instead of money: whether a guard is still held, and by what, is not
something this thread's cadence-stale copy of the roster may decide. So the
handler branch is the *only* route a refused release reaches the player by.

### 5. A claim release, not a dismissal — and this is the product judgement

`ReleaseGuardAssignment`, not `DismissGuard`. **The guard stays hired**, stays on
the payroll, stays in the roster, and goes back into the pool all three claimants
draw from. What is released is the claim.

ADR 0033's open question 3 asks for a *"dismiss/fire command"*, and this is the
narrower half of it — deliberately, because the narrower half is the half that
closes the defect. Firing destroys an entity, which is ADR 0026's subject and
needs its own decision about generation exhaustion and id reuse before anything
should call it. **This is the owner's call and it is stated as one:** if the
intent behind that question was a payroll control rather than a staffing control,
this document answers the wrong half and should be re-scoped rather than extended.

### 6. Four claim kinds, one of them being "nothing"

`GuardClaimKind` is `'deployment' | 'incident-response' | 'search' |
'unattributed'`, a closed union so that a *fourth* claimant cannot arrive without
somebody deciding what a player is told about it — the same forcing function
ADR 0033 decision 4 built for the phase's producer set.

`'deployment'` needs no claimant call: `DeploymentSystem` holds no per-guard
record — the sector id and the phase *are* the record, both on the roster — and
`PatrolSystem` acts on an `'on-post'` guard with a waypoint index, which
`unassign` clears. **The honest cost, stated rather than hidden:**
`DeploymentSystem` reads `unassignedGuardIds()` afresh every cycle against a
schedule that still asks for a guard, so **releasing a deployed guard is a
re-shuffle rather than a dismissal** — measured, somebody is posted again within
one cycle. A player who wants a sector uncovered has to change the schedule, and
no surface for that exists. That is a real limit of this command.

`'unattributed'` is `'on-search'` with neither claimant naming it — ADR 0033's
residue. It is a *real kind* rather than a bug, because between a load and that
system's first scheduled update such a guard genuinely exists and a player
looking at the roster is entitled to an answer. `releaseOrphanedClaims` would
hand it back anyway, so this is not the only route out of that state; it is the
only **immediate** one.

### 7. The surface is where guards are

A held-guards section on the **Staff panel**, Security tab: one row per held
guard saying who and what is holding them, a Release control per row, and a
header stating the held/free pair over the whole roster.

**Not the Build panel**, and the argument is ADR 0025's rather than a new one: a
guard is not a building, and hanging a staffing control off the selected
buildable would make that panel's organising idea false. (That panel's catalogue
is also the only block `hud.css` lets it take height from, ADR 0031 spends part of
it already, and #390 is open about the rest — but the first reason is the one that
decides it.) Releasing and hiring are the two things a player does to the roster
and they belong on one panel.

**This narrows the Staff panel's own "it is not a roster" claim**, and the
narrowing is recorded rather than glossed: the held list is not the roster. It is
the held subset, windowed to `HELD_GUARD_ROW_LIMIT` rows, and it exists because a
release command needs something to aim at. Listing every guard hired, with names,
clearances and coverage, is still `projectStaff`'s job and still has no surface.

**Measured on the assembled page**, Security tab, `HELD_GUARD_ROW_LIMIT` rows plus
the "and N more" line:

| viewport | panel, nothing held | panel, 3 rows + more | block | last Release bottom | fold | verdict |
|---|---|---|---|---|---|---|
| 1440×900 | 298.0 | 541.0 | 243.0 | 746.0 | 817.6 | above the fold |
| 1280×720 | 298.0 | 541.0 | 243.0 | 566.0 | 637.6 | above the fold |
| 1024×768 | 298.0 | 593.0 | 243.0 | 614.0 | 685.6 | above the fold |
| 900×600 | 273.0 | 467.0 | 219.0 | **483.0** | **522.0** | above the fold, 25.0 of panel scroll |
| 375×812 | 298.0 | 528.0 | 230.0 | 659.0 | 717.8 | above the fold |

Every Release is **85.0×44.0 with an `offsetParent`, inside the panel's
horizontal box**, at every one of those viewports. **The arrival cost is nothing
at all**: the block has no box until the first `hud/held-guards` reply, so a
prison with nobody held renders a panel byte-identical to one that has never
asked.

**And the row limit is a measurement rather than a taste. A fourth row puts its
Release 9.0px below the 900×600 fold** — 531.0 against 522.0 — with a full box and
an `offsetParent`, which is issue #220's shape and #285's fourth delivery row to
within a pixel. Three is the largest number at which every control is on screen
without the player scrolling a panel they have no reason to think has more in it.

### 8. The read model resolves the claim, and is its own projection

`hud/held-guards`, over `projectHeldGuards`, read by
`src/ui/simulation-held-guards.ts` on the counts cadence while the Security tab
shows — the **fifth** reader of #104's channel and the **third** whose subject is
a *command* rather than a readout.

Its own projection rather than more fields on `hud/staff`, because the two answer
different questions on different cadences. `hud/staff` is the whole roster with
names, roles, permissions, clearances, coverage and patrol metrics — a panel a
player opens. This is the held subset, usually a handful of rows out of tens, read
twice a second. Widening `hud/staff` would put a per-guard claim resolution — two
live claimant reads per row — on every request for the full roster, and would make
a projection that is a *report* also be the backing store for a set of controls.

It carries a `claim` and a `deploymentPhase` and both are load-bearing: the claim
says *who* holds the guard, the phase says what the guard is *doing*, and for a
`'deployment'` claim those are genuinely two facts (`'travelling'` to a post and
standing `'on-post'`). It carries a **sector only for a `'deployment'` claim**,
because `setDeploymentPhase` does not clear `sectorId` — so a responder that was
posted somewhere before it was claimed still carries a stale one, and reporting
that would tell a player a responder is standing at a post it left.

It carries **no incident id, no search order id, no tile and no text.** The claim
*kind* is what a player decides against; naming the particular job would put a
second id space on the boundary with nothing able to aim at it, since the command
names the guard and never the claim.

### 9. The surface cannot be exercised in a session a player can start today, and that is a finding

> **Update, 2026-08-26, and read it before acting on anything below: ADR 0036
> answered this section, and §9's decision points 2 and 3 are discharged.**
>
> This section's load-bearing sentence — *"nothing in `src/` can hold a guard in
> a new session"* — is **false**, and has been since `2926c54` (#398, ADR 0036,
> v0.0.108), which landed **47 minutes** after this document was accepted at
> `1dcee50` (v0.0.106). `src/simulation/security/default-sector.ts:253` calls
> `targets.sectors.register(definition)`, reached through
> `applyDefaultSecuritySector`, which `src/simulation/runtime/session-systems.ts:27`
> imports for both a new session and a restore.
> `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1` (`default-sector.ts:99`), so
> the first hire is posted and held.
> `tests/integration/security-default-sector.test.ts:154` drives that through the
> real `HireStaff` command, and `tests/browser/app-shell.spec.ts:852-872` quotes
> the sentence above and records in terms that *"the sentence above is false
> now"*.
>
> **This matters because §9 point 2 offers the reader a course of action that is
> now wrong.** It proposes that *"the surface should come out and the command
> should wait for a sector"*, on the ground that it is a control for a state the
> shipped game cannot reach. That ground is gone: `src/ui/simulation-held-guards.ts`,
> the `'release-guard'` intent and `ReleaseGuardAssignment` are live and tested.
> **Do not delete them on the strength of this section.** Point 3 asked for
> exactly the fix ADR 0036 made — it became #396 — so the code did what this
> document asked and this document was never told.
>
> The table below is left verbatim rather than rewritten, because what it
> recorded was true when written and the record is worth more than a tidy page.
> One row still holds, re-read at `c201547`: `SearchSystem.submitOrder` has no
> caller in `src/`.
>
> (That sentence first named the shipped release in prose with no commit beside
> it, and `tests/foundation/documentation-version-claim-contract.test.ts` refused
> it: a bare current version is falsified by the very next merge's patch bump.
> The gate #417 added caught the author of this Update writing the class of
> defect the Update is about.)
>
> **Why no gate caught this.** Amending an accepted ADR moves no `Status` line,
> and both `adr-numbering-contract.test.ts` and `adr-status-reference-contract.test.ts`
> work from the status word — so a decision overtaken by a later decision is
> invisible to every mechanical check in this repository. That is the trap
> `docs/adr/STATUS-QUEUE.md` names, met again here; this Update is the only thing
> that says so.

**Stated first and plainly, because it is the most important sentence in this
document.** The held-guards block draws nothing until the simulation reports a
held guard, and **nothing in `src/` can hold a guard in a new session.** This was
found by `tests/browser/app-shell.spec.ts`'s #88 all-controls sweep failing on
this change — three Release buttons laid out in no state at any viewport — and
then measured:

| claim kind | why it cannot happen | the only caller of the gate |
|---|---|---|
| `'deployment'` | `DeploymentSystem.assignUnassignedGuards` iterates `sectors.all()`, and **nothing registers a `SecuritySectorDefinition`** for a new session | `restoreSecuritySystems`, which reads a save payload |
| `'incident-response'` | `IncidentTriggerSystem` iterates `incidentSectorIds`, empty in a new session | the same function |
| `'search'` | `SearchSystem.submitOrder` has **no caller in `src/` at all**, and `searchPolicies` is empty | the same function |
| `'unattributed'` | it is the residue of a save taken during a response, so it needs one of the above first | — |

**This is a pre-existing gap in the security tier and not a property of this
surface.** The same four facts already make `DeploymentSystem`, `PatrolSystem`,
`IncidentResponseSystem` and `SearchSystem` no-ops in every session a player can
start — the layer *below* the one ADR 0025 closed when `HireStaff` gave the roster
its first real entries. A guard can be hired; there is nothing for it to be
assigned to. #352 itself is only reachable through a scenario or a restored save.

Three things follow, and the second is the one the owner may want to overrule.

1. **The gap is recorded as a tripwire rather than a caveat.**
   `NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR` — a name that no longer exists,
   and a tripwire that did not fire the way this sentence says; read the
   correction below before quoting it — in `app-shell.spec.ts` names the
   three controls with the measurement above, and the sweep fails the moment
   anything registers a sector for a new session — the same direction
   `AWAITING_PRODUCER` fails in, and for the same reason: a record of
   unreachability must not outlive the fact.

   **Corrected 2026-09-08, in both directions, because the interesting half is
   not the rename.** The constant is now
   `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD`, declared at
   `tests/browser/app-shell.spec.ts:2266`; the spec quotes the old name and
   the old reasoning in place at `:2150` rather than deleting them, which is
   the shape this correction copies. **The tripwire's stated condition was
   met and the sweep did not fail.** ADR 0036 registers a sector for every new
   session — `2926c54a`, the commit this document's own Update names — which is
   exactly the event this point says the sweep fails on. What happened instead
   is what the spec records in its own words: *"the reason had to be
   rewritten"*, and *"What it did **not** do is fail the assertion below"*.
   The three `Release` rows stayed unreachable on a *weaker* reason after ADR
   0036, and on a stronger one again after #533 (`a8a446ed`): the sweep now
   hires three guards at every viewport, but it runs with the clock paused and
   `DeploymentSystem.assignUnassignedGuards` is called only from that system's
   `update`, so nothing holds them. So the entry is still a tripwire and it is
   a tripwire on a different fact — a change that let a hire hold a guard
   off-tick would lay a row out and fail the sweep's accounting assertion. The
   sentence above is kept because it is what a reader of this decision has
   been holding since 2026-08-26, and because the gap between "a tripwire
   fires" and "a tripwire fails a test" is the thing worth having recorded.
2. **Shipping the surface anyway is a judgement, and it is the owner's.** The
   argument for it: the command, the service, the read model and the panel are
   what a sector registration turns into a working feature, and the alternative —
   ship the command with no surface — would put `ReleaseGuardAssignment` on
   `AWAITING_PRODUCER` and make this change the exact shape ADR 0033's open
   question 3 warns about. The argument against it: this is a control for a state
   the shipped game cannot reach, which is a thing this repository has three gates
   specifically to prevent. **If the owner reads that as the wrong trade, the
   surface should come out and the command should wait for a sector.**
3. **The real blocker is one registration, and it is not this document's.**
   Nothing in `src/` created a security sector, so #26's whole tier — deployment,
   patrol, incidents, contraband search — was dark. That is a bigger finding than
   this ADR and it belongs in its own issue rather than being fixed in a
   gameplay-surface change.

   **This point is now closed, and is kept in the past tense rather than
   deleted, because it is what asked for the issue that closed it.** It became
   **#396**, which is closed as completed by PR #398, *"Give every session a
   security sector, derived from the world (#396, ADR 0034 decision 9)"* — the
   decision recorded as
   [ADR 0036](./0036-a-derived-default-security-sector.md). A new session now
   registers a sector: `createNewSimulationRuntime` calls
   `applyDefaultSecuritySector` (`src/simulation/runtime/new-session.ts:609`),
   which registers the derived definition at
   `src/simulation/security/default-sector.ts:253`, so the tier is reachable
   from the front door. The amendment at the top of this document already said
   the question was answered elsewhere; **this paragraph is the one that went on
   asserting the defect, in the present tense, inside the decision a reader
   stops at.** That is the same shape [ADR 0012](./0012-derived-identifier-reproducibility.md)
   was corrected for in the same sweep as this — a Status or amendment recording
   a fix while the body denies it — and finding it twice in one corpus is the
   argument for reading a document's own headings against each other rather than
   trusting that whoever landed the fix updated every mention of it.

The simulation half of this change is fully exercised regardless:
`tests/integration/security-guard-release.test.ts` drives all three claim kinds
through the real kernel and the real command handler, because a test can register
a sector.

## Consequences

- **No save-schema version, and no persisted shape moves.**
  `src/persistence/save-schema.ts` is untouched, `SAVE_SCHEMA_VERSION` stays
  **5**, `tests/fixtures/persistence/` is unchanged, and no migration is added.
  Everything this reads is state a V5 save has held all along —
  `security.guards.records` and `contraband.search.active` — and everything it
  writes goes through `GuardRoster.unassign`, which writes fields already in the
  payload. **V6 stays free**, which #337 wants and #361 contends.
- **`GuardRoster.unassign` has its first caller in `src/` that is not inside a
  claimant.** That is the whole point, and it is also the thing to watch: the
  invariant that keeps it safe is decision 2, and it lives in one method.
- **A fourth `'on-search'` producer, or a third `'on-search'` claimant, breaks
  this by compiling.** `GUARD_CLAIM_KINDS` is closed and
  `tests/foundation/deployment-phase-producer-contract.test.ts` already pins the
  producer set and its call-site count (ADR 0033 decision 4), so a new producer
  fails a test — but it fails *that* test, and whoever adds it has to give the
  new claimant a `claimOf` branch, a `releaseX` method, a claim kind and a label
  in the same change. This document is where that is asked for.
- **Releasing a deployed guard is a re-shuffle.** Decision 6 states it; there is
  no surface for changing a `DeploymentSchedule`, so a player cannot express
  "leave this sector uncovered".
- **The surface is unreachable in a new session, and the tripwire says so.**
  Decision 9 has the measurement. This is the consequence most likely to be read
  as a reason to reject this document, and it is stated in those terms there
  rather than softened here.
- **Gates moved, in the same change as the code.**
  `tests/foundation/unconsumed-command-contract.test.ts` reads **thirteen
  produced, none unproduced**; `tests/unit/simulation-refusals.test.ts` gains a
  tenth namespace; `tests/foundation/projection-reachability-contract.test.ts`
  gains a fifth painter and a fourteenth projection module;
  `tests/unit/simulation-message-keys.test.ts` gains one labelled group
  (`guard-claim`) and one exemption (`GuardReleaseRefusalReason`);
  `tests/unit/ui-orchestration-boundaries.test.ts` and
  `tests/unit/ui-save-panel-status.test.ts` gain the new reader.
- **Determinism is unaffected.** The release draws no RNG, enumerates claimants
  in sorted id order, performs one roster write, and is dispatched from the
  kernel's command handler at the tick the command executes. Two runs of the same
  seed and the same command sequence are hash-identical at every checkpoint.
- **Nothing reaches the database.** `supabase/migrations/` is untouched.
- **If this ADR is rejected**, the command, the service, the projection, the
  reader and the panel section come out together, ADR 0033's open question 3
  re-opens, and no player's save has been altered — the same property 0033 argues
  for, and the reason both changes are safe to propose with their code.

## Open questions

1. **Should a guard be releasable in bulk?** "Release every responder" is four
   presses today, and a severity-10 riot's response is five. A bulk control needs
   a decision about what it names — a claim kind? an incident? — and every
   candidate answer puts a second id space on the wire that decision 1 spent its
   argument keeping off. Deliberately not in this change.
2. **Should the player be told a guard was released, rather than only seeing the
   row go?** Nothing raises a notice; the refusal channel carries only refusals.
   This is ADR 0033's open question 4 in a different coat, and the same
   projection question.
3. **Should releasing a responder below quorum say so?** Measured, it costs the
   incident its containment — the response never reaches `'responding'` and the
   incident lapses with every participant injured — and the interface says
   nothing about that being the consequence. It is knowable *before* the press
   (`requiredResponderCount` against the record's size) and would be the first
   thing in this interface that warned rather than reported.
4. **Does the deployment re-shuffle in decision 6 want a schedule surface, or a
   "hold unassigned" flag on the guard?** Both are coherent and they produce
   different play. Neither is this document's.
5. **What registers a security sector in a new session?** Decision 9's finding,
   as the question it really is. It is the blocker for this surface, for #352
   being reachable outside a scenario, and for four systems that currently no-op
   — and it needs a decision about *where* a sector comes from (zoned rooms? an
   authored starting layout? a player gesture?) rather than an implementation.
   Deliberately out of scope here, and the largest thing this change found.
