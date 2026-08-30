# What an escape says: a distinct event kind, or a field on one that exists

**Date:** 2026-08-30
**Tree:** `eaf95a3` (`chore(release): v0.0.262`), worktree on branch
`agent/683-escape-says-nothing`
**Question put to this record:**
[#683](https://github.com/matmaxalez/lockstate/issues/683) — a successful escape
produces the same all-clear a contained attempt produces, and the sentence that
should distinguish them is the owner's to author. What can be settled without
copy is the plumbing: **is a successful escape a distinct event kind from a
contained attempt, or the same kind with an outcome field?**

**#683's central claim survives, measured rather than accepted.** Two runs of
the real `IncidentResponseSystem` differing in one input — three guards against
none — put the *same two rows* on the events channel, in the same order and the
same colours, resolved through the shipped catalogue:

```
danger: A prisoner is trying to break out.
info:   The prison is under control again — no incident is still open.
```

In one of them the incident lapses, `outcome.escaped` is `true`, and the
participant is handed to the port ADR 0061 decision 5 wires to
`releasePrisoner`. In the other nobody left. The measurement is committed as
`tests/integration/escape-outcome-visibility.test.ts` on this branch, with three
mutations recorded red-then-green.

**The plumbing answer, in one line: at the incident *record* the outcome field
already exists, is persisted and is projected; at the *event channel* neither a
kind nor a field exists, and the field shape is not available there.** So the
choice #683 poses is not between two options — one of them is already taken at
the layer where it belongs, and the other layer has only one shape open to it.

**Nothing under `src/` is changed by this branch and no sentence is authored.**
A prototype was built, measured and reverted; its cost is in §3.4.

**Gates on the branch as it stands:** `./node_modules/.bin/tsc -b --pretty false`
exit 0, and the vitest suite `350 passed (350)` files / `3970 passed | 1 skipped
(3971)` tests, exit 0, on the committed tree. Another agent's suite was running
in the main checkout during part of that window (issue #667); nothing failed, so
the contention cost nothing to record.

---

## 0. Tiers, and how to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line and quoted, or the
  command was run in this worktree and its output pasted.
- **MEASURED** — a run of this repository's own modules in this worktree, with
  the output pasted.
- **DERIVED** — a conclusion drawn from VERIFIED or MEASURED facts, stated so
  the step can be checked separately from the facts.
- **INHERITED** — taken from another record and not re-measured here.
- **UNKNOWN** — could not be established.

Code is cited by `file:line`, prose by quoting it — `docs/AGENT_WORKFLOW.md` §4.

---

## 1. Does the claim survive? — MEASURED

### 1.1 What the two outcomes actually are

An escape attempt has exactly two terminal shapes, and both go through
`IncidentResponseSystem`:

- **Contained.** Responders arrive and `advanceResponse` transitions the
  incident to `'resolved'` with `escaped: false`
  (`src/simulation/incidents/response-system.ts:750`).
- **Successful.** Nobody arrives before `responseDeadlineTicks`, `lapse` writes
  `escaped: incident.type === 'escape-attempt'`
  (`src/simulation/incidents/response-system.ts:551`), and the block below it
  hands every participant to `onPrisonerEscaped`
  (`:566-568`), which `new-session.ts:1190-1192` wires to
  `prisoners.releasePrisoner` — *"the same door a sentence ending uses"*.

Both terminal transitions then call the same two things:
`adjudicateAssaultIfAny` (a no-op for this type) and `reportAllClearIfCalm`,
which records `incidents.all-clear` when nothing is open anywhere
(`:211-214`).

### 1.2 The measurement

`tests/integration/escape-outcome-visibility.test.ts` (this branch) runs the
real response system over a real `NavigationSystem`, `GuardRoster` and
`SecuritySectorRegistry`, opens one severity-6 escape attempt — the lowest a
trigger can produce, see §1.4 — and varies only the guard count. Each arm's
events are put through the real protocol schema and the real HUD reader
(`hudEventNoticeFromWorkerMessage`) and localized with the shipped catalogue,
because *"expect(log.count).toBe(1) would pass for a channel nobody could
read"* — `tests/integration/incident-events-loop.test.ts` states that standard
and this file holds itself to it.

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  769ms
```

The two arms differ in the prison — `'resolved'` / nobody removed against
`'lapsed'` / `escaped: true` / the participant handed to the departure port —
and are byte-identical in what they say.

### 1.3 Red-then-green — MEASURED

Three mutations, each red on the intended assertion and green again after:

| mutation | result |
| --- | --- |
| `escaped: incident.type === 'escape-attempt'` → `escaped: false` | `2 failed \| 1 passed` — the departure and the projection count |
| `reportAllClearIfCalm(tick)` removed from `lapse` | `1 failed \| 2 passed` — the sentence equality, `[1 item]` against `[2 items]` |
| `'incidents.escape-succeeded'` added to `SIMULATION_EVENT_TYPES` | `1 failed \| 2 passed` — the premise test |

The third is the both-directions half: this file is only worth keeping while the
absence is real, and it says so in its own failure message.

### 1.4 Is a *contained* escape attempt reachable at all? — DERIVED, and this
refines #683

The comparison #683 draws is between a successful escape and a contained
attempt. That contrast is worth checking rather than assuming, because the same
understaffing that opens an attempt is what leaves nobody to answer it — if
containment were unreachable, the defect would be *"an escape is silent"*
rather than *"an escape is indistinguishable from containment"*.

It is reachable, and the arithmetic says how narrowly:

- `scoreEscapeAttemptPressure` is `sentenceRemaining × 0.3 + contrabandSeverity
  × 0.35 + staffingShortfall × 0.35`, threshold `0.6`
  (`src/simulation/incidents/flashpoint.ts:248-253`, `:286-296`).
- With a *fully staffed* sector the shortfall term is zero, so the maximum
  score is `0.65` — an attempt still fires for a prisoner with a long sentence
  carrying something severe.
- Severity is `Math.max(1, Math.min(10, Math.round(candidate.score * 10)))`
  (`src/simulation/incidents/trigger-system.ts:360`), so the cheapest attempt
  the trigger can open is **severity 6**, and
  `requiredResponderCount(6)` is 3 (`respondersPerSeverityPoint: 0.5`,
  `:25-30`).

So containment needs **three claimable guards** and is a real state of the
game, not a hypothetical. `tests/integration/incident-trigger-reachability.test.ts`
measures the other end of the same ladder end to end — a well-run prison with
`priorIncidents: 2` and **no** guards loses two prisoners in twelve and a half
in-game days, and the same prison with one guard opens no attempt at all
(`13 passed (4.09s)` on this tree).

**Both directions, kept rather than overwritten.** #683's framing is right —
the two outcomes are indistinguishable to the player. What this adds is that the
sharper statement is the *stronger* one: **the escape itself emits nothing.**
The two rows the player sees are "an attempt opened" and "nothing is open any
more", and both are true of a containment. There is no row on the channel whose
subject is the escape.

**And the one row that *is* about the attempt does not stay.** The alerts list
keeps the newest `MAX_EVENT_ALERT_ROWS` = 8 rows
(`src/ui/simulation-events.ts:252`) and drops the oldest, so in a prison
producing incidents the opening line is gone within a few events — which the
playtest observed directly, with an eight-row list holding two riots, one escape
attempt and four all-clears beside a population that had just fallen by one.

### 1.5 What *does* move on screen when somebody escapes — VERIFIED

#683 says *"the only signal that the prison is one person short is the
population number going down"*. Four things move, three of them painted, and
the correction does not weaken the finding — none of them says *why*:

- The `PRISONERS` stat tile (`projectStatusCounts`'s `prisoners`).
- The accommodation counts, because `releasePrisoner` frees the place —
  `incident-trigger-reachability.test.ts:471-472` asserts both the population
  and the housed count fall by exactly the number of escapes.
- The Regime tab's roster row disappears — `src/ui/simulation-prisoner-roster.ts`
  is one of the nine painted read models — though #683's own adjacent note
  records that `refreshPrisonerRoster` returns early unless that tab happens to
  be open.
- The state income the freed place was earning stops. **DERIVED, from ADR 0061
  open question 6** — *"Losing a prisoner costs the state income their place was
  earning and nothing else"* — rather than measured here.

Each of them also moves for a discharge, which is the whole of the problem:
every one of these needles moves for *"their sentence ended"* and for *"they are
over the wall"* alike, and the one row that could tell them apart —
`prisoners.discharged`, *"{count} released — their sentences are served."*
(`src/content/default-locale-en.ts:437`) — is emitted only by
`PrisonerDischargeSystem` (`src/simulation/prisoners/discharge-system.ts:231`).
`releasePrisoner` itself records no event at all: `src/simulation/prisoners/release.ts`
contains no reference to the event log.

### 1.6 One surface distinguishes them, and it has no panel — VERIFIED

The distinguishing fact is not missing from the simulation. `projectIncidents`
carries `outcome.escaped` per terminal incident and `summary.escapes` for the
session (`src/simulation/presentation/incident-projection.ts`), and
`hud/incidents` is declared in `PROJECTION_IDS`
(`src/simulation/protocol/types.ts:344`) and catalogued
(`src/simulation/worker/projection-catalog.ts:412`).

It has no reader. `tests/foundation/projection-reachability-contract.test.ts`
names it in `UNPAINTED_PROJECTION_IDS`:

> `'hud/incidents': 'No reader. docs/research/audit-2026-08-26/10-product-roadmap.md:328
> names the panel this waits on, "Incident notification + response controls,"
> and it is not built.'`

and that entry fails in both directions, so the day a panel paints it the entry
goes stale and this paragraph is corrected by the same change. `hud/incidents`
is one of six routed-and-unpainted read models; the other five are named there
with what blocks each.

**So #683's *"the player is told nothing"* is exactly right about the screen and
would be wrong about the worker.** The measured claim is: the fact exists, is
persisted, is projected, has a route out of the worker, and stops one layer
short of a pixel.

---

## 2. Q1 — a distinct kind, or the same kind with an outcome field? — VERIFIED

**Both, at different layers, and the layer is the whole answer.**

### 2.1 At the incident record: the outcome field already exists

`IncidentOutcome.escaped` has been there since #28
(`src/simulation/incidents/incident.ts:59-60`):

> `/** True only when an escape-attempt actually got out -- the one outcome later economy/story systems (#29/#31) care about most. */`
> `readonly escaped: boolean;`

There is no distinct `IncidentType` for a successful escape and there should not
be: `IncidentType` is `'assault' | 'escape-attempt' | 'riot' |
'gang-retaliation'` (`incident.ts:6`), the type is fixed at `open` and the
outcome is not known until a terminal transition. The record discriminates by
`state` (`'lapsed'` versus `'resolved'`) plus the flag. It is persisted:
`save-schema.ts:860-877` carries `type`, `state` and
`outcome: { injuredEntityIds, propertyDamage, escaped }`.

### 2.2 At the event channel: neither exists, and the field shape is not
available

`SIMULATION_EVENT_TYPES` (`src/simulation/protocol/types.ts:1385-1394`) has
eight members. Five are incidents: one per type at **opening**, plus
`incidents.all-clear`. Nothing on the channel reports an outcome.

The "same kind with an outcome field" option has no host:

- **`incidents.escape-attempt-opened` cannot carry it.** It is recorded by
  `IncidentTriggerSystem` through `SimulationEventLog.recordIncidentOpened`
  (`src/simulation/events/event-log.ts:216-233`) at the tick the incident
  *opens*. The outcome does not exist yet, and this channel is occurrences, not
  levels — *"there is no current value of it to republish"*
  (`event-log.ts`, class comment) — so nothing amends a published event.
- **`incidents.all-clear` must not carry it, and its own schema argues why.**
  It is deliberately an aggregate about the whole prison
  (`types.ts:1599-1632`):

  > Carries no figure. What it costs — who was injured, what was damaged,
  > whether anybody got out — is `IncidentOutcome`, which the `hud/incidents`
  > projection already renders per incident; summing it into one number here
  > would be a second, coarser answer to a question that already has one.

  It is also emitted only when `openIncidentCount` reaches zero, so two
  incidents closing on one tick produce one row. With the shipped topology that
  is harmless — `deriveDefaultSecuritySector` authors exactly one sector
  (`src/simulation/security/default-sector.ts:224-230`) and ADR 0061 decision 6
  keeps one open incident per sector, so a closure always leaves zero open —
  but with a second sector an escape closing beside an open riot would emit
  **nothing at all**, and a field on this event would be silently dropped with
  it.

**DERIVED: the only shape open at the event channel is a distinct kind.** Not
because a field is worse in the abstract, but because there is no event on this
channel whose subject is the escape and whose publication is after it.

### 2.3 The exhaustive `Record` the brief asked for

The brief names `src/ui/simulation-alerts.ts`'s fault-code `Record` and asks for
the incident equivalent. It is **`EVENT_PRESENTATION`**
(`src/ui/simulation-events.ts:127-146`) — and the correction worth marking is
that it is keyed by **`SimulationEventType`, not by `IncidentType`**:

```ts
const EVENT_PRESENTATION: Readonly<
  Record<SimulationEventType, { readonly labelKey: LocalizationKey; readonly severity: HudSeverity }>
> = { … }
```

`tests/unit/ui-orchestration-boundaries.test.ts:279` states what it is for:
*"the `Record` over `SimulationEventType` is what makes an event type added to
the protocol fail to compile until somebody has decided what it says to a player
and how loudly (#507)"*.

Three further sites are exhaustive over `IncidentType` rather than over the
event type, and a fourth is not exhaustive at all — see §3.2.

---

## 3. Q2 — what would each shape cost?

### 3.1 The save format (ADR 0038): neither shape is a format change — VERIFIED

- **The outcome field is already in the save.** `save-schema.ts:857-877` carries
  `outcome.escaped` as a required member of an optional `outcome`. Nothing to
  add, nothing to bump.
- **The event channel is not persisted at all.** `docs/PERSISTENCE.md` lists
  `SimulationEventLog` under what a save deliberately excludes:

  > an event is a statement that something happened *now*, so a loaded prison
  > announcing last week's discharges would be describing a tick the player is
  > not looking at

  So a new event kind adds no field to any save, and ADR 0038 §1's compatibility
  rule — *"A save is compatible with a build when the build can interpret every
  section the save carries"* — is not engaged in either direction.

The same passage names the one wrinkle that already exists and that a new kind
inherits: an incident open when the save was taken is open again on load, but
its opening event was not persisted, so *"the sequence a restored session shows
is the end of an incident it never announced the start of"*. An escape event
would behave identically — a save taken during an attempt, restored, and lapsing
would announce the escape without having announced the attempt. That is the
existing shape, not a new one.

### 3.2 The worker protocol and the exhaustive mappings — MEASURED

Adding `'incidents.escape-succeeded'` to the tuple alone, and then to the
discriminated union, and running `./node_modules/.bin/tsc -b --pretty false`,
enumerates the required sites rather than guessing them:

| site | file | forced by |
| --- | --- | --- |
| the vocabulary + a zod member in the union | `src/simulation/protocol/types.ts` | the change itself |
| `EVENT_PRESENTATION` | `src/ui/simulation-events.ts:127` | `TS2741` |
| `eventParameters` | `src/ui/simulation-events.ts:409` | `TS2366`, *"Function lacks ending return statement"* |
| `SAMPLE` | `tests/unit/ui-simulation-events.test.ts:42` | `TS2741` |

`SIMULATION_PROTOCOL_VERSION` is `1` and does **not** move: the version guards
the envelope and the message kinds (`types.ts:9`, `:22-34`), and
`simulation/event` is an existing kind whose payload is a discriminated union —
a new member is a new *payload shape on an existing kind*, exactly as
`prisoners.relocated` was at ADR 0076.

**The one site the compiler does not force is the interesting one.**
`eventParameterMessages` (`src/ui/simulation-events.ts:467-479`) opens with
`if (event.type !== 'prisoners.relocated') return undefined;` — an early return,
not an exhaustive `switch`. A new event whose sentence carries `{name}` and
which is not added here would render the literal `{name}` on screen, and
`tests/unit/ui-simulation-events.test.ts`'s per-type loop would not catch it:
that loop asserts the sentence does not contain `hud.alert.event` and is
non-empty, and only the relocation-specific test asserts `not.toContain('{')`.
**Reported, not fixed** — it is one line in a module whose surface belongs to
whoever implements the sentence, and it is exactly the handover
`docs/AGENT_WORKFLOW.md` §2 says the integrator owns.

The three sites that are exhaustive over `IncidentType` rather than over the
event type are unaffected by a new event kind and are listed so a reader does
not go looking: `SimulationEventLog.recordIncidentOpened`'s `switch`
(`event-log.ts:216-233`), `INCIDENT_TYPES` in the incidents projection
(`incident-projection.ts:149`), and `statusCountsIncidentTypeSchema`
(`types.ts:580`).

### 3.3 Determinism — VERIFIED

No fingerprint moves and none has to be re-baselined.

- The fingerprints in this repository are computed at runtime and compared
  between two runs of the same seed, not stored as constants:
  `tests/unit/prisoners-operations-scenario.test.ts:162` *"an identical seed and
  scenario produce an identical fingerprint"* builds two runs and compares them.
- The event log cannot feed back into simulation state. Publication is a read —
  `since` *"does not trim, does not clear and does not move a watermark"*
  (`event-log.ts`) — and the watermark lives on the worker state machine
  (`src/simulation/worker/state-machine.ts:258`).
- Writing to it is already deterministic: *"it is written only from scheduled
  system updates, at the tick the thing happened, from values those systems
  decided."*

The one determinism-shaped requirement a producer in `lapse` must meet is
iteration order, and it is already met: an escape attempt has exactly one
participant (`trigger-system.ts:355-358`, and
`incident-trigger-reachability.test.ts:452` asserts it), and
`participantIds` is sorted ascending before `open` is called.

### 3.4 The prototype, and what it cost — MEASURED, then reverted

A working prototype was built to prove the route rather than argue it:
`SimulationEventLog.recordEscapeSucceeded`, a call in `lapse` beside
`onPrisonerEscaped`, a zod member shaped like `prisoners.relocated`
(`entityId` plus an optional two-half `name`), an `EVENT_PRESENTATION` row
**reusing the existing authored key** `hud.alert.event.incidents.escape-attempt-opened`,
and the test fixture's `SAMPLE` row.

```
 src/simulation/events/event-log.ts          | 14 ++++++++++++++
 src/simulation/incidents/response-system.ts |  5 ++++-
 src/simulation/protocol/types.ts            | 11 +++++++++++
 src/ui/simulation-events.ts                 |  6 ++++++
 tests/unit/ui-simulation-events.test.ts     |  1 +
 5 files changed, 36 insertions(+), 1 deletion(-)
```

`tsc -b` exit 0. Against it, `escape-outcome-visibility.test.ts` reports
`2 failed | 1 passed` — the escape arm gains a third row at the moment the
prisoner leaves, carried through the real protocol schema and the real HUD
reader with the `danger` band, and the premise test fails as designed. The
targeted blast radius was then measured: `tests/unit/ui-simulation-events.test.ts`,
`tests/unit/simulation-message-keys.test.ts`,
`tests/integration/incident-events-loop.test.ts`,
`tests/unit/ui-orchestration-boundaries.test.ts` and all of `tests/contract`
returned `13 passed (13) / 173 passed (173)`.

**Everything was reverted; `git status` is clean apart from the new test file
and this record.** The prototype is quoted here as a cost measurement, not
offered as a change.

**The finding inside that green suite is worth stating on its own.** The
existing gates force the new type to resolve to *some* sentence in the shipped
catalogue — `ui-simulation-events.test.ts`'s per-type loop — and nothing forces
it to be a *new* one. A wrong-but-existing sentence compiles, passes, and ships.
The gate against that is a person, which is precisely why #683 is filed rather
than fixed.

### 3.5 The projection catalogue

Unaffected by an event kind: `PROJECTION_IDS` and `PROJECTION_CATALOG` are the
*pull* route, and the events channel is push. The catalogue matters only for the
alternative in §5.3 — painting `hud/incidents` — where the route already exists
and the panel does not.

---

## 4. Q3 — which shape does the code already lean toward? — VERIFIED

**The relocation notice, and it is a distinct event kind carrying identity.**
Traced end to end, in the order the fact travels:

1. **Producer.** `src/simulation/events/resident-relocation-notice.ts:117` calls
   `sources.events.recordResidentRelocated(...)` with the per-resident split
   `PrisonerOperationsRuntime.relocateExcessResidentsOf` returns.
2. **Log.** `SimulationEventLog.recordResidentRelocated`
   (`event-log.ts:159-176`) appends `{ type: 'prisoners.relocated', entityId,
   name?, roomNameKey }`. Its docblock records the rule this event *broke*, in
   both directions rather than overwriting it:

   > **This read "It carries no identity", flatly, until `recordResidentRelocated`
   > below.** … An event whose subject survives it may name them; one whose
   > subject does not, may not.

3. **Wire.** `residentRelocatedEventSchema` (`types.ts:1474-1488`) carries the
   entity id, the two name halves as *state* (ADR 0015 — a name is never
   translated) and the room's catalogue `nameKey`. No text crosses the boundary.
4. **Main thread.** `hudEventAlertsFromWorkerMessage` and
   `hudEventNoticeFromWorkerMessage` (`src/ui/simulation-events.ts:291`, `:343`)
   are called from `src/main.ts:1703` and `:1708` — the list and the band, read
   in that order.
5. **Parameters.** `eventParameters` returns `{}` for this member and
   `eventParameterMessages` supplies `{name}` and `{room}` as *deferred
   translations*: `{name}` reuses `hud.regime.roster-name`, `{room}` passes the
   catalogue key through. *"Neither key is new copy. The only string this change
   authors is the sentence the owner approved."*
6. **Pixel.** The band element is `.hud__event` (`src/ui/hud/hud.ts:1005`),
   which `main.ts:1704-1707` describes as *"a band laid out at every viewport
   with no section to open — which the alerts list is not, at any viewport
   (#220)"*. The sentence is
   `'{name} had nowhere to sleep and moved to {room}.'`
   (`src/content/default-locale-en.ts:461`).

**What an escape would need to travel the same way — DERIVED:**

- Steps 1–4 and 6 are unchanged work of the shape §3.4 measured: a producer call
  in `lapse`, a log method, a schema member, a `Record` row.
- Step 5 is the one that is *not* free, and it is the non-exhaustive site of
  §3.2: if the sentence names the prisoner, `eventParameterMessages` must be
  extended or `{name}` ships literally.
- **The identity rule needs one narrow ruling, and only one.** The relocation
  exception is justified by *"a relocated resident is alive, housed, and already
  on the roster projection under the same entity id"* — which is **false of an
  escapee**: `releasePrisoner` destroys the entity, so by the time the main
  thread reads the event the subject is gone, which is exactly the case the
  original rule was written for. But the relocation event does not *look
  anything up*: it carries both name halves in the payload, so a name rendered
  from the payload is safe for a departed subject too. What is not safe is the
  fallback — `hud.regime.roster-unnamed`, *"Prisoner 3"* — which would name a
  dead entity id. In practice that fallback is unreachable from `src/`:
  `tests/unit/ui-simulation-events.test.ts` records that *"No path in `src/` can
  produce that — `createNewSimulationRuntime` always wires one"*.

---

## 5. Q4 — what the owner has to decide

### 5.1 It is one sentence, and one question inside it — DERIVED

**The decision is: what does the prison say the moment a prisoner gets out?**

Everything else follows from that sentence rather than being a separate call:

- **If it names the person** — the shape the relocation notice proves and the
  one this record recommends — the payload is `entityId` + the two name halves,
  `eventParameterMessages` gains a branch, and the sentence reuses
  `hud.regime.roster-name` for the ordering of the halves, as ADR 0076 already
  does. No second key is authored.
- **If it does not** — the shape `prisoners.discharged` uses — the payload is
  empty and the event is four lines lighter.

That is a property of the sentence, not an extra question: a sentence with the
prisoner's name in it has chosen the first, and one that speaks of *a prisoner*
has chosen the second. **No candidate wording is offered here, deliberately** —
`AGENTS.md`'s fourth exclusion is about the words themselves, and a record that
supplied a plausible one would be inviting it to be lifted.

### 5.2 What is *not* the owner's, and is recommended here

- **The shape** is settled by §2.2: a distinct event kind is the only one
  available at the event channel. No ADR is needed for it — it is an existing
  vocabulary gaining a member, which is what `SIMULATION_EVENT_TYPES` is for,
  and the argument for the alternative is already written in the all-clear
  schema's own comment.
- **The band** is `'danger'`, and `src/ui/simulation-events.ts:85-89` has
  already made this argument for the *opening*: *"It is the one incident whose
  failure is irreversible … Nothing about that is recoverable, which is the test
  ADR 0049 set for unpaid wages and this one fails."* Every word of that is
  more true of the success than of the attempt.
- **The producer site** is `IncidentResponseSystem.lapse`, beside
  `onPrisonerEscaped`, after the transition — the same ordering ADR 0061
  decision 5 argues for: *"the record is what says they escaped, and the
  departure is a consequence of the record rather than a condition of it."*

### 5.3 The one genuine alternative, stated so it can be refused — DERIVED

Instead of a sentence, **paint `hud/incidents`**. The projection already carries
`outcome.escaped` per incident and `summary.escapes` for the session, the route
already exists, and the four incident-type labels are already authored
(`src/content/simulation-message-keys.ts:236`, *"Escape Attempt"*).

It is not recommended, for three reasons and one of them is decisive:

1. It is a panel, which the roadmap lists as unbuilt (*"Incident notification +
   response controls"*), not a row.
2. `projectIncidents` costs `O(all incidents ever recorded)` per request — its
   own comment says so and `docs/HUD_PROJECTIONS.md` tracks it as a gap the
   route *"does not yet have a panel to hit"*.
3. **Decisive:** a panel is a place a player looks. The band is what reaches a
   player who is looking somewhere else, and an escape is the one event where
   the player being told at the moment it happens is the entire point.

They are not exclusive. The panel is the aftermath; the sentence is the moment.

### 5.4 What is deliberately not asked

Whether losing a prisoner should also be a *level* — a running "escaped: 3" the
prison remembers — is a second promise and a separate decision. ADR 0061 open
question 6 already holds the ground next to it: *"Does an escape deserve a
reputation consequence? Losing a prisoner costs the state income their place was
earning and nothing else."* It is named here so that answering #683 does not
quietly answer that too.

---

## 6. What this record does not propose

No sentence, no locale key, no change under `src/`. The one file added to `src`-
adjacent surfaces is a test that measures an absence and is written to fail when
the absence ends.

The `eventParameterMessages` early return (§3.2) is **handed over** rather than
fixed: it is a defect only in the presence of a name-carrying sentence that does
not exist yet, and the change that authors that sentence is the change that
should close it.

---

## 7. What could not be established — UNKNOWN

- **Whether the band is actually painted for this event at a real viewport.**
  Everything in §4 step 6 is read out of source. A worktree cannot measure
  rendering honestly — `docs/AGENT_WORKFLOW.md` §2 records that a browser run in
  a worktree loses every actor sprite and passes anyway — and no browser suite
  was run here. The 1440×32 at y=80 figure #683 quotes is **INHERITED** from
  the playtest record `2026-08-30-playing-main-after-fifteen-changes.md`
  (PR #682, unmerged — deliberately not spelled as a rooted path, because
  `tests/foundation/documentation-links-contract.test.ts` requires every one of
  those to be on disk and this one is not on `main`) and is not re-measured.
- **Whether an escape *feels* like a loss with one sentence.** That is a
  playtest, and it cannot be run before the sentence exists.
- **How often a player would see the contained case.** §1.4 shows it is
  reachable and gives the arithmetic; nothing here measures its frequency in a
  prison a player would actually build.

---

## 8. My weakest claim

**That a distinct event kind is the *only* shape available at the event
channel** (§2.2). It rests on two premises that are true of the code today and
are not laws: that this channel carries occurrences rather than levels, so a
published event is never amended; and that `incidents.all-clear` is an aggregate
that must not carry a per-incident figure. Both are argued at length in
`event-log.ts` and in the all-clear schema, and both are design decisions rather
than constraints.

**What would change my mind:** a decision to make the events channel carry
*revisions* — a second publication keyed to the same `sequence` — which would
make an outcome field on the opening event coherent and would be a much larger
change than the sentence this issue needs. Or a ruling that the escape belongs
in the aftermath panel rather than in the moment, which would make §5.3 the
answer and this whole question premature.

The claim I am **most** confident of is the measurement in §1: two arms, one
input apart, identical sentences, with the mutations to show the assertions
have teeth.
