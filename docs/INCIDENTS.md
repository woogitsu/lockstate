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

**Everything in this section is about the riot**, and that used to be the same
thing as being about this system. Since
[ADR 0061](./adr/0061-what-the-prison-produces-on-its-own.md) it produces two
more types, from different state and behind different gates — see "Three
producers, three readings of the same prison" below.

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

  **The quiet period is asked per incident type** since ADR 0061, through the
  same derived index taking an optional `type`. Read sector-wide by three
  producers, whichever fired first would silence the other two for its whole
  window — so a prison that assaulted every in-game day would stop rioting. The
  windows are 4,800 ticks for a riot, 2,400 for an assault and 12,000 for an
  escape attempt. The *one-open-incident* rule stays shared across types:
  `IncidentResponseSystem` claims responders from one pool and locks a sector
  down by sector id, so two open records in one sector would be two responses
  fighting over one lockdown.

Every iteration order in this system is explicitly sorted (sector ids, gang
ids, entity ids) -- issue #28's "without nondeterministic iteration."

## Three producers, three readings of the same prison

Until [ADR 0061](./adr/0061-what-the-prison-produces-on-its-own.md), `'assault'`
and `'escape-attempt'` were declared in `IncidentType`, counted by
`incident-projection.ts`, labelled in `simulation-message-keys.ts`, priced in
`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE` — and created by nothing. A prison could
riot, and that was the whole of what could ever happen in one.

`flashpoint.ts` adds the two producers, and the thing worth understanding about
them is that neither is a weaker riot:

| type | what it reads | who it names |
| --- | --- | --- |
| `'riot'` | the sector's **mean** need deficit, its staffing shortfall, its contraband suspicion, sustained over twelve samples | every occupant |
| `'assault'` | **one prisoner's own** deficit and holdings, at the sector's own weights and line | the worst-off two |
| `'escape-attempt'` | how much sentence is left and what the prison **classified** that person as — no need at all | one prisoner |

- **The assault exists because a mean hides an individual.** Eight housed
  prisoners at 0.48 and one homeless prisoner at 0.95 average to 0.53, nowhere
  near `hotThreshold`, so a prison that is adequate for almost everybody and
  intolerable for one person produced nothing at all.
- **It defers to the riot structurally.** No assault opens in a sector whose hot
  streak is non-zero. With the same weights and the same line, any prison whose
  mean is hot has individuals who are hot — and the riot needs twelve
  consecutive samples where the assault needs none, so without the gate the
  assault took the sector's one slot every time. Measured: ADR 0057's
  two-prisoner prison produced an assault at tick 13,250 instead of its riot.
- **Its severity is scaled into `1..5`**, below `lockdownSeverityThreshold`.
  Severity is an input — it sizes the response — and a fight is not a reason to
  seal every door in the prison.
- **The escape attempt is gated, not merely scored**: the prisoner is classified
  high risk *and* is concealing something. The second gate is the honest one
  rather than the strict one — this model has no perimeter to walk through, so
  an escape with no means is the one thing the state cannot support.
- **And a lapsed escape attempt removes the prisoner**, through the same
  `releasePrisoner` a sentence ending uses. `lapse` has written
  `escaped: incident.type === 'escape-attempt'` since #28 and it had never once
  been true in a running prison; the moment it can be, a panel saying *escaped:
  yes* beside a prisoner still in their bed would be a promise the code does not
  keep. **`lapse` is also the only route to that flag** — the other and only
  other terminal transition, `advanceResponse`'s `'resolved'` branch, writes
  `false` — which is what lets the sentence #683 authored say *why* nobody was
  stopped and not merely that somebody left. A second route to `escaped: true`
  would make that sentence a claim the code does not keep, and the write site
  carries that warning where a change would meet it.

What none of them can do is be **found**: a player cannot order a search, so the
contraband both new producers read is real, hidden and unanswerable. That is
ADR 0061 open question 1 and it is the owner's.

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
(`src/simulation/security/post-eligibility.ts`) — the same finite roster
`DeploymentSystem` and #27's `SearchSystem` draw from, so emergency
response is a genuine staffing diversion. **The traffic is one-way since issue
#996**: a search claims from `claimableSearchGuardIds`, which withholds
`INCIDENT_RESPONSE_GUARD_RESERVE` guards from it, while a response still claims
from the whole free pool. A sweep in flight can no longer empty the pool this
paragraph is about; an incident response can still empty the one a sweep draws
on, and that is the priority order rather than an oversight. Since
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

`IncidentRowViewModel` (`src/simulation/presentation/incident-projection.ts`)
is what a player sees: type, sector, state, severity, participant *count*,
start tick, age, outcome and required responder count.

**"Is what a player sees" is what this document has said since `31c51ef`
(2026-08-23, #28), and it has never been true.** It is what a player *would*
see: `hud/incidents` is declared, catalogued and routed out of the worker, and
no module under `src/ui/` or `src/rendering/` has ever quoted that id on any
ref — `git log --all -S` over both directories for the quoted id returns
nothing. The absence is asserted rather than merely noted:
`tests/foundation/projection-reachability-contract.test.ts` names it in
`UNPAINTED_PROJECTION_IDS` with the panel it waits on, and fails in both
directions, so the day something paints it that entry goes stale and this
paragraph is corrected by the same change. Both readings are kept rather than
overwritten (`docs/AGENT_WORKFLOW.md` section 4), because the field list above
is accurate and it is the verb that was wrong.

What that costs was measured at
[#683](https://github.com/matmaxalez/lockstate/issues/683): `outcome.escaped` —
the one field that says a prisoner got out rather than was stopped — reached no
pixel, so a successful escape and a contained attempt put the same two rows on
the events channel. See `docs/research/2026-08-30-what-an-escape-says.md` and
`tests/integration/escape-outcome-visibility.test.ts`.

**Half of that is now false and the other half is not, so both are kept**
(`docs/AGENT_WORKFLOW.md` section 4). The escape reaches a pixel: #683's ruling
added `incidents.escape-succeeded` to the events channel, and the band names
the escapee at the moment they get out. What is unchanged is the sentence this
paragraph sits under — **`projectIncidents` still has no reader**. The band is
the moment; the panel is the aftermath, and it is the aftermath that is still
unbuilt. `outcome.escaped` per incident, `summary.escapes` for the session and
everything else in that projection remain unpainted.

The incident's
`causeFactors` — the raw risk and grudge scores that produced it — are
withheld, exactly as #27's contraband ground truth stays behind its
intelligence projection. `summarizeIncidents`
(`src/simulation/incidents/incident-summary.ts`) gives aggregate
post-incident metrics (resolved/lapsed/open, injuries, damage, escapes) for
a future economy/story consumer, still with no hidden calculations exposed.

**This section named `alerts.ts`'s `IncidentAlert` until issue #555, and
that projection is gone.** It had no caller outside its own test for as
long as it had existed and carried a strict subset of the fields the
projection above carries; keeping both would have been two answers to one
question, with the unreachable one free to rot. The file was renamed
`incident-summary.ts` with the deletion and carries the full argument.

**What a player is told about an incident *as it happens* is a different
channel and is not this one.** `simulation/event` carries
`incidents.riot-opened` and its three siblings the moment
`IncidentTriggerSystem` opens one, and one of `incidents.all-clear` /
`incidents.all-clear-after-lapse` when the last one closes; those are
occurrences and are pushed once, where everything above is a projection the
HUD pulls. See `src/ui/simulation-events.ts` for which kind is graded
`'danger'` and why.

**Which of the two closing rows is chosen is decided by the transition that
emptied the log, and issue #914 is why there are two.** A contained incident
injures nobody (`advanceResponse`'s `'resolved'` branch writes
`injuredEntityIds: []`) and a lapsed one injures every participant, and until
that issue both published the same sentence: measured over one prison shape
played twice, **15 incidents resolved with zero injuries and 19 lapsed with
114 prisoner-injuries and three escapes produced byte-identical alert
columns** (`docs/research/2026-09-04-does-anyone-answer-an-incident.md`
finding 4). The lapse row is graded `'warning'` rather than `'info'` for the
same reason. Neither carries a figure, and the reason a *count* of injured is
not on the wire is stated at the schema: the HUD localizer has no plural rule
to render one with, and a lapsed escape attempt injures exactly one.

**A per-incident accounting is still owed, and it is a panel rather than a
row.** `projectIncidents` already answers `injuredCount` and `propertyDamage`,
and nothing under `src/ui/` requests `hud/incidents` --
`tests/foundation/projection-reachability-contract.test.ts` names it in
`UNPAINTED_PROJECTION_IDS`. Until that panel exists, the closing row is the
whole of what a player is told about how an incident ended.

**This read "Every member of that set is about an incident *starting*, except
the one that says the prison is calm again", and #683 is what ended it.** It
went on: *"No event on the channel reports an outcome, so the two ways an escape
attempt can end reach the player as the same pair of rows — the opening, then
the all-clear."* That was true and is not any more.

`incidents.escape-succeeded` is the one member about an **outcome**, recorded in
`IncidentResponseSystem.lapse` at the moment a participant actually leaves,
graded `danger`, and carrying the escapee's entity id and name so the sentence
can say who. It is a distinct event kind rather than a field on one that exists,
for a reason the research settled and the schemas restate: the opening event is
published before an outcome exists and this channel never amends a published
event, and the two `all-clear` members refuse per-incident figures in their own
comments and fire only when nothing is open anywhere.

The counting rule that survives all of it is not "every member is an opening"
but the one that was doing the work underneath: **an event on this channel is an
occurrence at a tick, and the incident members are one per transition worth
telling the player about** — an opening, this one departure, and the return to
calm in whichever of its two shapes the ending had. Why the outcome is worth a
row, and what the alternatives cost, is in
`docs/research/2026-08-30-what-an-escape-says.md`; what the player reads is
measured in `tests/integration/escape-outcome-visibility.test.ts`.

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
interval**: `tests/integration/incident-response-restore.test.ts:443-456` runs a
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

**A session now also supplies a `PrisonerFlashpointSampler`**, the third
injection seam beside `SectorRiskSampler` and `SectorOccupantResolver`, reading
each occupant's own need deficit, contraband holdings, sentence remaining and
risk tier out of the real components. It is optional at the constructor: a
`IncidentTriggerSystem` built without one opens `'riot'` and
`'gang-retaliation'` and nothing else, which is what every fixture predating
ADR 0061 expects.

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
- **Needs pressure** was the mean `safety` deficit, and `action.sleep` restored
  `safety` twenty times faster than it decayed, so the term read ~0 for anybody
  with a bed and ~1 for anybody without one: it measured homelessness. It is now
  the mean over `NEED_IDS` of each occupant's deficit, averaged over the
  occupants -- so a prison with no toilet, no shower room and no yard reads
  about 0.44 where it used to read 0.

  **The past tense in that bullet became load-bearing with
  [#588](https://github.com/matmaxalez/lockstate/issues/588).** `action.sleep`
  no longer restores `safety` at all: under the owner's ruling on
  [#599](https://github.com/matmaxalez/lockstate/issues/599) the provisioner is
  **guard coverage** -- `SafetyCoverageSystem` gives a `covered` sector's
  occupants 0.08 a tick, an `understaffed` one half of that and an `unguarded`
  one nothing, against a decay raised from 0.01 to 0.05. So `safety` is back
  inside `needsPressure` as a term that *moves*, and it moves with staffing:
  the two bullets above widened who is counted and what is counted, and this
  narrows what one of the six needs means.

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
window opens a **severity-7 riot at tick 3,450**. Five `HireStaff` commands
later four responders walk from (0, 0) to the post tile, the sector locks down,
and the riot is `resolved` with `propertyDamage: 3` and nobody injured.

> **Both of those figures moved with ADR 0048**, and the direction is the point.
> The paragraph read *"`needsPressure` crosses 0.6 ... opens a **severity-6 riot
> at tick 15,600**"* when the sample was the two homeless prisoners' `safety`
> alone. Nearly four times sooner is the intended change: `bladder` falls at
> 0.08 a tick and `hunger` at 0.05, against `safety`'s 0.01 at the time.
>
> **They moved again with #588**, in the same direction and for a reason that
> is now about staffing rather than about who is counted: 0.389 became 0.4427
> and tick 4,000 became tick 3,450. This prison hires nobody, so its sector is
> `unguarded`, nothing provisions `safety`, and that need now falls at 0.05
> rather than 0.01 -- a sixth of the mean reaches the floor five times sooner.
> The same prison **with a guard on post** does not riot at all, which is the
> half of the change worth reading and is measured in
> `tests/integration/room-gated-needs.test.ts`.
>
> **And again with issue #586**, for a reason that is about the prison being
> over its beds: 0.4427 became **0.3969** and tick 3,450 became **2,050**.
> Three prisoners on one bed is three times this prison's accommodation, so
> crowding makes `safety` and `hygiene` fall faster for all three
> (`src/simulation/prisoners/crowding.ts`), and the streak completes 1,400 ticks
> sooner at a *lower* mean -- the needs crowding does not touch have simply had
> less time to fall. Severity, participants and the response that follows are
> unchanged.

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

> **Two rows of that table are false since issue #586, and the sentence under
> it is narrower.** The file's fixtures have since changed as well -- the
> 16-for-8 prison is measured *without* amenities since ADR 0102 -- so read the
> file rather than this table for its current shape. What #586 moved, on the
> file's own seed: sixteen prisoners for eight beds with **two** guards now
> riots five times (it was quiet), and four guards do not stop it -- twice the
> beds is a crowding cost no hire answers; and sixteen for four beds needs
> **eight** guards to contain every riot, where six did. Crowding is the
> ruling on #586 working as it reads -- a prison over its beds is punished
> through the needs it already prices -- and its incident half is recorded in
> `tests/integration/incident-trigger-reachability.test.ts`'s ADR 0102
> describe, with the before-and-after table.


**The bound is worth naming, because it decides the shape of the play.**
`DeploymentSystem` and `IncidentResponseSystem` draw from the same
`unassignedGuardIds()` pool, so a staffing shortfall — the term that makes a riot
possible at all — exists exactly when the responder pool is empty. A riot in a
one-sector prison therefore cannot be answered by the guards whose absence
caused it; it is answered by guards hired *after* it starts, inside the
600-tick `responseDeadlineTicks`. That is coherent play rather than a defect, but
it is a consequence of a single sector and it changes when a second one exists.

> **Two sentences in the paragraph above are false, and they are marked rather
> than overwritten** (`docs/AGENT_WORKFLOW.md` §4) **because the false step is
> the finding, not a typo.** Re-established 2026-09-15 on `2559eb14`.
>
> **First, the pool is named wrongly, and the wrong name is what makes the
> rest read as plausible.** Neither system draws from `unassignedGuardIds()`
> any more. Since ADR 0053 both draw from `claimableGuardIds` -- that pool
> filtered to post-eligible roles -- `DeploymentSystem.assignUnassignedGuards`
> at `src/simulation/security/deployment-system.ts` and
> `IncidentResponseSystem` at `src/simulation/incidents/response-system.ts`,
> each with a comment saying so in the same words. `unassignedGuardIds()` is
> deliberately *not* narrowed (`src/simulation/security/post-eligibility.ts`:
> *"A prison whose roster holds a nurse and no guard should read three staff,
> one of them unassigned, and nobody available to guard"*), so the two counts
> genuinely differ and the paragraph names the one neither system reads.
>
> **Second, *"exists exactly when"* is a biconditional and only one direction
> of it holds.** A shortfall surviving a deployment pass does imply an empty
> claimable pool -- `assignUnassignedGuards` fills posts until `shortage <= 0`
> or the pool runs out. An empty pool does
> **not** imply a shortfall, because `getCoverageReport` publishes
> `shortage: Math.max(0, required - assigned)` and posting is what drives
> `assigned` up: a prison that hires **exactly** its requirement reads
> `shortage 0` and has **nothing left to claim**, both at once. Measured here,
> seed `0x893`, twelve prisoners over one bed so the sector asks for two: two
> hires publish `required: 2, assigned: 2, shortage: 0`, the Staff panel badges
> the prison **`Covered`**, the claimable pool is **0**, and across sixteen
> in-game days that prison **resolved 0 incidents, let 9 lapse, dispatched 0
> responders and found 0 contraband, with `routeFailures: 0`** -- so nothing
> failed to *reach* an incident; nothing was ever sent. Six hires at the same
> seed resolve all ten and let none lapse. The ladder is on the unmerged branch
> `measure/893-coverage-and-response-draw-from-one-pool`; read it as a draft,
> and the figures above are the ones re-run on this commit.
>
> **So *"coherent play rather than a defect"* rested on a reader picturing a
> prison that is visibly short, where the panel is already telling the player
> to hire.** The prison above is being told the opposite. How many guards it
> actually needs is stated nowhere a player can read -- the thresholds are
> `required + 1` to search, `required + 2` to answer a severity-3 assault and
> `required + 4` for a severity-8 riot. **Whether that should change is not
> settled here**, and it cannot be: the replacement for a sentence the panel
> says to a player is the owner's under `AGENTS.md`'s fourth exclusion. What is
> settled is that this paragraph may not go on saying the two conditions are
> the same condition.

ADR 0095 decision 1 now makes that difference visible in the Staff panel.
The read model counts free, post-eligible guards after posting and other claims,
and compares them with a fixed ceiling of five (`ceil(10 * 0.5)` under the
current default response policy). Filled posts with fewer than five free guards
show a reserve-short rung; the posted requirement and response dispatch rules
remain as before. Searches use the same claimable pool, so the figure describes
current availability rather than guaranteeing the largest response while a
search is active. The choice between a fixed ceiling and a risk-derived target
remains ADR 0095 open question 1 / issue #29.

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
