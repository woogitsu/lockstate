# Incidents: violence, escapes, riots, gangs and emergency response

This document covers `src/simulation/incidents/` (issue #28): one auditable
incident lifecycle, sustained-condition triggers, a lightweight gang model,
an initial escape/tunnel data model, and an emergency response path that
uses real guards, real navigation and real lockdown. Like #24-#27 before
it, this builds on already-shipped boundaries (#24's regime/utility-AI,
#25's jobs, #26's sectors/deployment/lockdown, #27's intelligence) rather
than a parallel implementation.

## Incidents are records, not popups

Architecture notes: "incidents are simulation entities/records and domain
events, not transient UI popups." `IncidentLog` is the authoritative,
versioned (`INCIDENT_RECORD_SCHEMA_VERSION`) store: each record carries its
type, sector, participants, severity, **cause factors**, a full state
timeline and (once terminal) its outcome. Nothing is ever deleted --
terminal incidents stay in `all()` as the auditable history later economy
and story systems (#29/#31) read.

`IncidentLog` indexes open incidents both globally and by sector, so
`IncidentResponseSystem` never scans the full history to find the handful
still running -- issue #28's "do not scan all actors against all actors
each tick."

## One validated, forward-only lifecycle

```
active ──> notified ──> responding ──> resolved
  │            │             │
  └────────────┴─────────────┴──────> lapsed
```

- **`active`** — the incident exists and is running; no responders yet.
- **`notified`** — responders have been dispatched and are en route.
- **`responding`** — enough responders have physically *arrived*.
- **`resolved`** — responders contained it (terminal).
- **`lapsed`** — it ran its course without an adequate response (terminal).

`IncidentLog.transition` rejects anything outside this table: no backwards
moves, no skipping `notified`, and nothing at all out of a terminal state.
`isLegalIncidentTransition` exposes the same table for callers that want to
check before acting.

**`lapsed` is the consistent-failure outcome** issue #28 requires ("failed/
late response produces consistent outcomes rather than hidden success"): a
lapsed incident injures every participant and does property damage equal to
its full severity, where a contained one injures nobody and does half the
damage. There is no path where an unhandled incident quietly disappears.

## Triggers use sustained conditions, never a one-tick spike

`sector-risk.ts` splits this in two. `scoreSectorRisk` is a pure, explicit-
factor weighted sum of three 0-1 inputs -- needs pressure, staffing
shortfall, contraband pressure -- clamped to [0,1], the same shape as
#27's `resolveDetectionProbability`. `SectorRiskTracker` then requires
`sustainedSamplesRequired` **consecutive** hot samples before a sector
counts as sustained-hot; a single sample below `hotThreshold` resets the
streak to zero outright (not a decay). An oscillating sector therefore
never accumulates toward a riot no matter how long it runs -- proven
directly in `tests/unit/incident-sector-risk.test.ts` and again at the
system level in `incident-trigger.test.ts`.

`IncidentTriggerSystem` runs on a multi-rate schedule (every 50 ticks), so
one "sample" is a sampling point spanning real simulated time, not one
frame. When a sector fires, its streak is reset -- one sustained window
produces one incident, not one per subsequent sample. Only one open
incident per sector exists at a time, which keeps response staffing
attributable.

**Four gates, not two.** The streak and the one-open-incident rule are the two
above; [ADR 0048](./adr/0048-what-a-sectors-occupants-are.md) added the other
two, and both became necessary only once the trigger could fire in a playable
prison at all:

- **A quiet period.** `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` is 4,800 ticks
  -- two in-game days -- measured from the previous incident's *start*, so the
  incident's own life sits inside it. Without it a prison whose conditions never
  improve re-arms in one sustained window and riots again: measured at **49
  riots in 20 in-game days** in an over-admitted unguarded starter prison, each
  one a fresh record with fresh disciplinary points. The gate reads a derived
  per-sector index on `IncidentLog` (`lastIncidentStartedAtTick`, maintained in
  `open` and rebuilt in `loadSnapshot`), never a scan of `all()` -- the log is
  never pruned, which is the same reason `openIdsBySectorId` exists.
- **A participant floor.** `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` is 2. A riot is a
  collective act, `IncidentLog` already carries `'assault'` for what one
  prisoner does, and `lapse` injures every participant. A sector below the floor
  still samples, still scores and still accumulates its streak; it simply has
  nobody to riot, and it opens one on the first sampling point after a second
  prisoner arrives.

Every iteration order in this system is explicitly sorted (sector ids, gang
ids, entity ids) -- issue #28's "without nondeterministic iteration."

## Riots reuse the existing regime/action framework

Issue #28 asks for "riot-specific candidate actions/regime override **using
the existing utility/action framework**." `riot-regime.ts` therefore
expresses a riot as an ordinary `RegimeSchedule`: a single full-day block
allowing only `RIOT_ALLOWED_CATEGORIES` (`free-association`, `recreation`)
— work, education, meals, scheduled hygiene and sleep all become illegal.

**Who gets that schedule is decided per prisoner, at the point of use**
([ADR 0057](./adr/0057-what-a-riot-does-to-a-prisoners-day.md)).
`ActionSystem`'s `beginNextAction` asks an injected
`PrisonerRegimeOverrideResolver` before it consults `findRegimeSchedule`, and
`createRiotRegimeOverride` answers `buildRiotRegimeSchedule` for any prisoner
`IncidentLog` names in a riot that is still open. Three properties follow:
nothing is stored, so a save taken mid-riot restores onto the riot regime with
no schema bump; there is no lift step to forget, because the override ends when
the incident does; and the set is `IncidentRecord.participantIds`, so a riot in
one sector does not restrict a prisoner in another.

`utility-ai.ts` needed **zero changes**, and `ActionSystem` needed one
constructor port and one line in `beginNextAction`: scoring already operates on
whatever categories the active block allows, and the block still comes from a
gapless schedule resolved the same way. There is no parallel riot AI.

**`applyRiotRegimeOverride` was deleted rather than wired**, and the paragraph
this replaced described it as "the whole regime override mechanism". It returned
a new schedule array with named *classification groups* swapped — the same set
as the participants while one derived sector is the whole prison, and the wrong
set the moment a second sector exists.

**The scoring and candidate machinery needed no changes; the content did, and
for a while it did not have it.** `free-association` was a member of `ACTION_CATEGORIES` with no
action authored under it, and both `recreation` actions target a zoned room —
so a rioting prisoner in a prison with no yard and no common room had *no
candidate at all*, and `beginNextAction` reached its empty-candidate path on
every reconsideration of every day the riot lasted. `action.free-association`
closes that
([ADR 0042](./adr/0042-attaching-consequences-to-the-simulation-loop.md)
decision 1); `tests/unit/prisoners-free-association.test.ts` drives the real
`ActionSystem` under the real riot schedule and measures a full riot day at
zero unmet-demand cycles, and
`tests/unit/prisoners-action-catalog.test.ts` records the same figure as a
per-schedule census (2,400 of 2,400 ticks before, 0 after).

**Two things used to stand between that and a riot a player can see, and both
are gone.** This paragraph read: *"`applyRiotRegimeOverride` has no caller in
`src/` — it is reached from tests only — and `ActionSystem` takes its schedule
array as a `readonly` constructor field with no setter, so nothing can swap a
live session onto the riot schedule even if something wanted to."* ADR 0057 did
that work and neither half survived in the form the sentence implies: the
function is deleted, and the array is still `readonly` with no setter because
the override is resolved rather than swapped.

Measured on the real kernel, in a neglected two-prisoner prison that riots at
tick 13,300 against the same prison with two guards hired, which does not:
before, the two produced **byte-identical** action censuses over the day the
riot ran. After, the rioting prison loses 160 of the day's 360
`action.use-toilet` prisoner-ticks — `hygiene` is not a riot category — and its
population's mean need deficit ends 611 ticks of riot at 0.4542 against the
control's 0.3497. `tests/integration/riot-regime-loop.test.ts` holds both
columns. What a player still cannot see is *which* prisoners are rioting: the
status strip counts open incidents and the roster names each prisoner's
activity, and nothing joins them (ADR 0057 open question 1).

## Gangs: lightweight, deterministic, feeding existing scoring

`gangs.ts`'s `GangRegistry` covers membership (exclusive — joining a new
gang leaves the old), territory (claimed sector ids), reputation (0-1,
starting neutral) and directional grudges (`offended -> offending`,
accumulating and clamped). Every accessor is deterministically ordered.
This is explicitly *not* final gang diplomacy or economy (out of scope).

`resolveRetaliationRisk` is a pure function of the outstanding grudge,
amplified 1.5× when both gangs claim the sector in question and dampened
0.5× when they don't — a grudge is far likelier to be acted on where both
sides actually are. It feeds `IncidentTriggerSystem`'s existing decision
path rather than a parallel AI engine. An acted-on grudge is **cleared**,
so retaliation is a discharge, not a permanent standing grievance.

## Escapes: real doors, an initial tunnel model

`escape.ts`'s `TunnelRegistry` is deliberately a progress record between
two tiles, not geometry — issue #28 asks for an "initial tunnel data model
without final depth" and excludes "full tunnel rendering/content balance."
Progress only ever advances through explicit `advance` calls; there is no
implicit per-tick digging in this slice.

`resolveEscapeOpportunity` reads **real `DoorRegistry` doors**, never a
parallel perimeter model: a perimeter door that is `'open'` or `'closed'`
is an exploitable weakness, while a `'locked'` one never is (#21's
`checkDoorAccess` treats `locked` as absolute short of `emergencyOverride`,
which a prisoner never holds). Completed tunnels count alongside doors, and
staffing shortfall amplifies existing weaknesses without ever creating one
— a fully locked perimeter with no completed tunnel scores exactly zero no
matter how understaffed the sector is.

## Response: real guards, real routes, real lockdown

`IncidentResponseSystem` claims guards through `claimableGuardIds`
(`src/simulation/security/post-eligibility.ts`) — the same finite shared pool
`DeploymentSystem` and #27's `SearchSystem` draw from, so emergency
response is a genuine staffing diversion. Since
[ADR 0053](./adr/0053-who-may-stand-a-security-post.md) that pool is the
*post-eligible* unassigned staff rather than every unassigned staff member: a
nurse on the roster is not a responder, and a prison holding five of them lets a
severity-7 riot lapse rather than reporting `respondersDispatched: 4`. Responder count scales with
severity (`respondersPerSeverityPoint`); while too few guards exist the
incident stays observably `'active'` rather than silently resolving.

Dispatched guards travel to the sector's post tile through the real
`NavigationSystem` — never teleporting into an incident. An incident at or
above `lockdownSeverityThreshold` drives its sector to `'lockdown'` through
#26's `SecuritySectorRegistry`, which cascades onto #21's `DoorRegistry`;
the lockdown is lifted when the incident becomes terminal.

Like search duty, a responding guard sits in the `'on-search'`
`DeploymentPhase` — neither `DeploymentSystem` nor `PatrolSystem` acts on
that phase, so this system needed no changes to either (see
`docs/CONTRABAND.md`'s note on why).

### A real bug this caught: responders sealed out by their own lockdown

Applying a lockdown locks every door in the incident's sector — including
the doors responders must cross to *reach* the incident. The first
implementation routed responders with an ordinary staff context, so every
severe incident sealed its own responders out and lapsed. Responders now
route with `emergencyOverride`, which is exactly what #21 defines it for
("bypasses `locked`, e.g. fire evacuation"). The override bypasses
`'locked'` only: clearance and permission requirements still apply, so a
responder still cannot enter somewhere their role was never cleared for.
`tests/unit/incident-response.test.ts` locks this in with a dedicated
regression test asserting zero route failures through a live lockdown.

## Alerts: projections, not the record

`alerts.ts`'s `IncidentAlert` is what a player sees: type, sector, state,
severity, participant *count* and start tick. The incident's
`causeFactors` — the raw risk and grudge scores that produced it — are
withheld, exactly as #27's contraband ground truth stays behind its
intelligence projection. `summarizeIncidents` gives aggregate post-incident
metrics (resolved/lapsed/open, injuries, damage, escapes) for a future
economy/story consumer, still with no hidden calculations exposed.

## Snapshot/restore

`IncidentLog`, `SectorRiskTracker`, `GangRegistry` and `TunnelRegistry` all
round-trip through fresh instances directly, including mid-window risk
streaks (a sector 2 samples into a 3-sample window resumes at 2, it does
not restart) and the trigger system's id sequence (so restored ids never
collide with newly generated ones).

`IncidentResponseSystem` restores **metrics only**. Live response
bookkeeping references the *previous* `NavigationSystem` instance's request
queue, exactly like #25's jobs and #26's guards. A restored open incident
therefore has no active response **on the tick it loads**, and is then
**re-dispatched**: `IncidentResponseSystem.update` runs a one-shot sweep on its
first scheduled update after a load — `releaseOrphanedClaims()` followed by
`redispatchInterruptedResponses(context.tick)`, both inside
`src/simulation/incidents/response-system.ts`'s `orphanedClaimSweepPending`
block — and `mountResponse` attaches a fresh response.

> **The two citations this paragraph used to carry were wrong, and one of them
> was wrong in the direction that costs a reader the most.** It cited
> `mountResponse` at `:395-414`, which is `redispatchInterruptedResponses` — the
> *caller*, not the callee — so a reader following it landed in the right story
> and the wrong function, with nothing to tell them so. Both are now cited by
> name: this file is about a mechanism spread over three methods in a file that
> is still being edited, and `docs/AGENT_WORKFLOW.md` §4 says a `file:line` into
> such a file is the least durable citation available. `grep -n` on the method
> name is what a reader should use, and it is what this sentence now asks for. The forward-only lifecycle is not the
obstacle this paragraph claimed it was, because re-dispatch mounts a new
response rather than returning the incident to `'active'`.

The outcome is the **same terminal state, later by at most one scheduling
interval**: `tests/integration/incident-response-restore.test.ts:392-404` runs a
restored session against a continuous one and asserts both reach `'resolved'`
with equal outcomes, the restored one closing at tick 81 against the continuous
run's 71. `docs/DETERMINISM.md` has carried that reading since the change.

**This paragraph used to say the incident "lapses at its deadline ... which is
precisely the consistent-failure outcome issue #28 demands", and cited
`tests/unit/incident-response.test.ts` as proving it directly.** That became
false at `e44bcb9` (#394, v0.0.106) and survived a later edit to this file at
`2926c54` (v0.0.108). The cited test still passes, which is why nothing caught
it: its `restored` harness hires no guard, so there is nobody to re-dispatch —
a special case that was being read as the general rule.

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` constructs an empty `IncidentLog`,
`SectorRiskTracker`, `GangRegistry`, `TunnelRegistry` and a mutable
`incidentSectorIds` array, and registers `IncidentTriggerSystem` and
`IncidentResponseSystem` on the kernel. No incidents, gangs or tunnels exist
until a session/scenario registers them — the same "no fabricated default
content" convention every prior issue's wiring follows, asserted directly in
`tests/unit/new-session-runtime.test.ts`.

**`incidentSectorIds` is the exception, and it is not a small one.** It used to
start empty too, and because it did, `IncidentTriggerSystem` sampled nothing and
**no incident was ever opened in any session a player could start** — the whole
of this document was measured in scenarios and restored saves. Issue #396
measured that and [ADR 0036](./adr/0036-a-derived-default-security-sector.md)
closes it: every session derives one sector and watches it. See
`docs/SECURITY.md`'s "One derived sector" for what is derived and why it is
re-derived on load rather than persisted.

The default risk sampler derives its inputs from the systems already
constructed for that session: staffing shortfall from
`DeploymentSystem.getCoverageReport`, needs pressure from the prisoners in the
sector, and contraband pressure from #27's `IntelligenceLedger` records scoped
to that sector. The injection seam is unchanged -- a scenario wanting different
inputs constructs its own `IncidentTriggerSystem` with a custom
`SectorRiskSampler`/`SectorOccupantResolver`, the same way #25's
`JobWorkerAdapter` and #27's `TargetLocationResolver` work.

**Two of those inputs changed with
[ADR 0048](./adr/0048-what-a-sectors-occupants-are.md), and this paragraph used
to describe both of them wrongly by describing them accurately.** It said
occupancy "uses the sector's post tile" and that needs pressure came from "the
`safety` need", and both were true:

- **Occupancy** counted prisoners standing on exactly one tile of the 1,024 a
  prison owns. `ActionSystem` teleports an arrival to their room's anchor, so a
  *housed* prisoner was never an occupant; the only occupants any prison ever
  had were arrivals it could not house, who stay on the arrival tile -- which
  ADR 0036 derived to be the post tile. It is now every prisoner standing on
  owned land, and `docs/SECURITY.md`'s "What a sector's occupants are" carries
  the rule.
- **Needs pressure** was the mean `safety` deficit, and `action.sleep` restores
  `safety` twenty times faster than it decays, so the term read ~0 for anybody
  with a bed and ~1 for anybody without one: it measured homelessness. It is now
  the mean over `NEED_IDS` of each occupant's deficit, averaged over the
  occupants -- so a prison with no toilet, no shower room and no yard reads
  about 0.44 where it used to read 0.

The second change is not optional given the first. Widening the occupant set
without widening the need set divides the same numerator by the whole
population, so occupancy alone would have made the trigger *harder* to reach in
every prison that houses anybody. ADR 0048 records the measurement.


### What that makes reachable, and the bound on it

`tests/integration/security-default-sector.test.ts` drives the whole chain
through real commands only: a cell zoned and furnished, three prisoners admitted
for its one bed, and the two it cannot house left standing on the arrival tile
with nothing to restore any of their six needs. `needsPressure` reaches 0.389 --
the mean of three prisoners' mean deficits, the housed one included -- against a
`staffingShortfall` of 1, and `DEFAULT_SECTOR_RISK_POLICY`'s twelve-sample
window opens a **severity-7 riot at tick 4,000**. Five `HireStaff` commands
later four responders walk from (0, 0) to the post tile, the sector locks down,
and the riot is `resolved` with `propertyDamage: 3` and nobody injured.

> **Both of those figures moved with ADR 0048**, and the direction is the point.
> The paragraph read *"`needsPressure` crosses 0.6 ... opens a **severity-6 riot
> at tick 15,600**"* when the sample was the two homeless prisoners' `safety`
> alone. Nearly four times sooner is the intended change: `bladder` falls at
> 0.08 a tick and `hunger` at 0.05, against `safety`'s 0.01.

`tests/integration/incident-trigger-reachability.test.ts` is the other half of
that claim and the more important one -- a trigger that fires in every prison is
as broken as one that fires in none. It measures four prisons rather than one,
and the assertions about the quiet ones are its subject:

| prison | guards | riots in 12.5 in-game days |
| --- | --- | --- |
| 8 furnished cells with shower, canteen and yard, 8 prisoners | 1, then 0 | **none, either way** |
| 8 cells with beds and nothing else, 8 prisoners | 0 | riots |
| the same | 1 | **none** |
| furnished, 16 prisoners for 8 beds | 1 | riots, with `required: 2, shortage: 1` |
| the same | 2 | **none** |
| furnished, 16 prisoners for 4 beds | 6 | riots, and every one **contained with nobody injured** |

So: needs cause unrest, staffing amplifies it, and past about three times bed
capacity staffing stops buying prevention and starts buying containment.


**The bound is worth naming, because it decides the shape of the play.**
`DeploymentSystem` and `IncidentResponseSystem` draw from the same
`unassignedGuardIds()` pool, so a staffing shortfall — the term that makes a riot
possible at all — exists exactly when the responder pool is empty. A riot in a
one-sector prison therefore cannot be answered by the guards whose absence
caused it; it is answered by guards hired *after* it starts, inside the
600-tick `responseDeadlineTicks`. That is coherent play rather than a defect, but
it is a consequence of a single sector and it changes when a second one exists.

## Scale

`tests/unit/incident-scale.test.ts` drives 30 simultaneous sector riots
against 120 guards to fully terminal states — all 30 contained, 150
responders dispatched, zero route failures through live lockdowns, every
guard returned to the pool and no sector left stuck in lockdown (wall time
logged as directional evidence only, per `docs/BENCHMARKING.md`'s
no-hard-threshold policy).

## What is out of scope here

Graphic content, tactical combat micromanagement or real-time action
controls; final gang diplomacy/economy; full tunnel rendering/content
balance; police/external agency campaign simulation; the Kronikarz pacing
layer (#37); traits/relationships for richer social outcomes (#39 — the
base model here functions without it); final balance of any threshold or
weight in this module (every default is directional, per the issue's own
scope).
