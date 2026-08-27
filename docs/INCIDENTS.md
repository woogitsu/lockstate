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

Every iteration order in this system is explicitly sorted (sector ids, gang
ids, entity ids) -- issue #28's "without nondeterministic iteration."

## Riots reuse the existing regime/action framework

Issue #28 asks for "riot-specific candidate actions/regime override **using
the existing utility/action framework**." `riot-regime.ts` therefore
expresses a riot as an ordinary `RegimeSchedule`: a single full-day block
allowing only `RIOT_ALLOWED_CATEGORIES` (`free-association`, `recreation`)
— work, education, meals and scheduled sleep all become illegal.
`applyRiotRegimeOverride` returns a *new* schedule array with the named
classification groups swapped, leaving the caller's original untouched, so
lifting the override is simply going back to it.

`ActionSystem` and `utility-ai.ts` needed **zero changes**: `ActionSystem`
already resolves its schedule from whatever array it was constructed with
via `findRegimeSchedule`, and scoring already operates on whatever
categories the active block allows. There is no parallel riot AI.

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

`IncidentResponseSystem` claims guards from
`GuardRoster.unassignedGuardIds()` — the same finite shared pool
`DeploymentSystem` and #27's `SearchSystem` draw from, so emergency
response is a genuine staffing diversion. Responder count scales with
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
`DeploymentSystem.getCoverageReport`, needs pressure from the `safety` need
of prisoners standing in the sector, and contraband pressure from #27's
`IntelligenceLedger` records scoped to that sector. Sector occupancy uses
the sector's post tile; a richer sector-membership model is scenario
knowledge, and a scenario wanting one constructs its own
`IncidentTriggerSystem` with a custom `SectorRiskSampler`/
`SectorOccupantResolver` — the same injection seam #25's `JobWorkerAdapter`
and #27's `TargetLocationResolver` use.

### What that makes reachable, and the bound on it

`tests/integration/security-default-sector.test.ts` drives the whole chain
through real commands only: a cell zoned and furnished, three prisoners admitted
for its one bed, and the two it cannot house left standing on the arrival tile —
which is also the derived sector's post tile, so they *are* its occupants. Their
`safety` need decays untended, `needsPressure` crosses 0.6 against a
`staffingShortfall` of 1, and `DEFAULT_SECTOR_RISK_POLICY`'s three-sample window
opens a **severity-6 riot at tick 15,600**. Five `HireStaff` commands later three
responders walk from (0, 0) to the post tile, the sector locks down, and the riot
is `resolved` with `propertyDamage: 3` and nobody injured.

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
