# 2026-09-04 — which read models and protocol fields does this game compute, publish, and show to nobody?

**A census, taken on a fresh `origin/main` at v0.0.442 (`3d2a8bda`).** No file
under `src/` was changed. Every claim below is a text measurement over that
tree, re-run in both directions, with the greps written out so the next reader
can re-derive rather than trust.

## The question

Two orphaned read models were found by accident in two days —
`staffUnassigned` while measuring something else (issue #870), and the
`hud/incidents` / `hud/incident-detail` pair while playing
(`docs/research/2026-09-04-does-anyone-answer-an-incident.md`). Nobody had ever
enumerated the class. **For every entry in `PROJECTION_CATALOG` and every field
the HUD-facing protocol carries: who reads it, and if nobody, what can the game
already do that the player cannot see?**

## The answer, in one line

**The game computes 398 declared view-model members across 52 interfaces plus
23 status-strip counts, and 175 of the 398 have no consumer-side reader at
all.** The five wholly-unread projections are the well-known part and are
already gated. **The part nothing gates, and the part that matters, is the
orphan inside a *painted* projection**: `hud/staff` is requested twice per
session by two live readers, and it carries
`deploymentMetrics.deploymentFailures` and `patrolMetrics.loopsMissed` — the
two numbers ADR 0036's own open question 1 says *"Nothing tells the player"*
about — which reach the main thread on every request and are dropped on the
floor. **The single worst orphan is `statusCountsSchema.conditions`**: ADR
0087's standing-conditions union, recomputed at every publication, compared
field-by-field for change detection, and read by nothing — while a comment in
`src/ui/simulation-events.ts:869` tells the reader those conditions *"exist to
keep answering after this notice has scrolled away."* They do not answer
anybody.

## How to read this record

Following `docs/research/README.md`'s tiers:

- **VERIFIED** — the file was opened at the cited line and read.
- **DERIVED** — arithmetic or set logic over VERIFIED facts, shown.
- **UNCERTAIN** — stated as such, with what would settle it.

Every "nobody reads X" claim below was run twice: once as the negative
(`grep` returns nothing) and once as the positive (here is *everything* that
mentions X, classified as declaration / producer / reader / test / comment).

## 1. What the existing gates promise, exactly

`tests/foundation/projection-reachability-contract.test.ts` and
`tests/foundation/unconsumed-action-contract.test.ts` were read first, in
full, before any grep was run. **Neither has a hole, and the incidents pair
did not slip past anything.**

### 1.1 The projection gate keeps a narrower promise than "every route is painted"

It says so itself, at
`tests/foundation/projection-reachability-contract.test.ts:359`, and the
promise is **"every unpainted route says why."** The mechanism is
`UNPAINTED_PROJECTION_IDS` (`:363`), a deliberate allow-list naming each
unpainted id with its blocker, policed in both directions:

- an id with **no** reader and **no** entry fails immediately;
- an id that **gains** a reader while keeping its entry fails as stale — which
  is how the single `UNPAINTED_ROUTE` entry died at #331 and how
  `hud/prisoner-detail`'s entry died at #895;
- an entry naming an id that is not declared fails as accounting for nothing.

`hud/incidents` (`:367`) and `hud/incident-detail` (`:365`) are **declared
exemptions with stated blockers**. The gate is working as designed. **The
commissioning brief's third premise — that a hole exists and is the most
valuable finding — is wrong, and is corrected here.**

**What the promise does not cover, stated precisely:**

1. **Fields.** The gate's unit is the projection *id*, a member of
   `PROJECTION_IDS` (`src/simulation/protocol/types.ts:331-346`). A payload
   member has no representation in it at all. This is why `staffUnassigned`
   could never have been caught by it, and why the `hud/staff` orphans below
   are invisible to it.
2. **"Quoted" is not "painted".** `readersOf` asks whether a file under
   `src/ui/` or `src/rendering/` contains the id as a single-quoted literal
   (comments stripped). A module that requested a projection and discarded
   every field of the reply would satisfy it.
3. **`src/main.ts` is outside the reader surface.** `READER_SURFACE` is
   `collectTypeScriptFiles('src/ui')` plus `collectTypeScriptFiles('src/rendering')`;
   the entry point is in neither. Harmless today — all eleven readers live in
   `src/ui/` — but a reader that moved to `src/main.ts` would be reported
   unpainted.

### 1.2 `unconsumed-action-contract.test.ts` is about a different vocabulary

It gates `ACTION_IDS` (`src/input/actions.ts`) — input actions, not read
models — with the same allow-list idiom (`AWAITING_CONSUMER`, two entries:
`selection.primary` and `build.confirm`). **It covers no part of this
question.** It is cited here only because the projection gate's own docblock
cross-references its `selection.primary` entry as the blocker five projection
ids were once waiting on.

### 1.3 No gate in this repository covers producer-only *fields*

**DERIVED, and this is a genuine gap in coverage rather than a defect in an
existing gate.** The reachability family is nine files
(`fault-code-`, `challenge-rejection-code-`, `message-kind-`,
`projection-`, `content-validation-`, `trusted-tier-`,
`rpc-status-vocabulary-`, `unconsumed-action-`, `unconsumed-command-`), and
every one of them enumerates a **closed vocabulary of ids** — a fault code, a
message kind, a command type, a projection id, an action id. Not one
enumerates the *members of a payload*. Checked directly:
`grep -rln 'statusCountsSchema' tests/` returns only fixture and behaviour
tests (`tests/unit/worker-status-counts.test.ts`,
`tests/unit/ui-simulation-counts.test.ts`, browser specs), and
`grep -rn '\.shape\b' tests/` finds field-enumeration only over
`simulationCommandSchema.options` — command *types*, not fields.

The one thing that *does* police a field is `statusCountsSchema`'s `.strict()`
(`src/simulation/protocol/types.ts:710`), and it polices the wrong side: it
makes producer-and-schema disagreement a decoder fault. **Schema-and-consumer
disagreement is silent by construction.** Nothing anywhere fails when a field
is added to the wire and never read.

## 2. The census: `PROJECTION_CATALOG`, all fifteen entries

The measurement, re-derivable verbatim:

```
for id in hud/status-strip hud/build-queue hud/pending-deliveries hud/held-guards \
          hud/prisoner-population hud/prisoner-roster hud/prisoner-detail \
          hud/room-list hud/room-detail hud/staff hud/security hud/contraband \
          hud/incidents hud/incident-detail world/render-snapshot; do
  grep -rn --include='*.ts' -F "'$id'" src/
done
```

Every id returns exactly three classes of hit, or two. The two producer-side
hits every id has are its declaration
(`src/simulation/protocol/types.ts:331-346`) and its catalog entry
(`src/simulation/worker/projection-catalog.ts`). A third hit, when present, is
the reader.

| Projection id | Verdict | Reader (`file:line`) |
| --- | --- | --- |
| `hud/status-strip` | **Consumed** (one of its four top-level blocks) | `src/ui/simulation-regime.ts:151` |
| `hud/build-queue` | **Consumed** | `src/ui/simulation-build-queue.ts:192` |
| `hud/pending-deliveries` | **Consumed** | `src/ui/simulation-pending-deliveries.ts:160` |
| `hud/held-guards` | **Consumed** | `src/ui/simulation-held-guards.ts:159` |
| `hud/prisoner-population` | **Consumed** | `src/ui/simulation-intake.ts:168` |
| `hud/prisoner-roster` | **Consumed** | `src/ui/simulation-prisoner-roster.ts:307` |
| `hud/prisoner-detail` | **Consumed** | `src/ui/simulation-prisoner-detail.ts:192` |
| `hud/room-list` | **Consumed** | `src/ui/simulation-room-needs.ts:308` |
| `hud/room-detail` | **Consumed** | `src/ui/simulation-room-needs.ts:344` |
| `hud/staff` | **Consumed** (two readers; `totals` and `roster` only) | `src/ui/simulation-staff-coverage.ts:124`, `src/ui/simulation-staff-roster.ts:154` |
| `hud/security` | **Orphaned** | none |
| `hud/contraband` | **Orphaned** | none |
| `hud/incidents` | **Orphaned** | none |
| `hud/incident-detail` | **Orphaned** | none |
| `world/render-snapshot` | **Orphaned** | none |

**Ten consumed, five orphaned, by eleven reader modules** (the counts differ
because `simulation-room-needs.ts` reads two ids and `hud/staff` has two
readers — the projection gate's own docblock records that arithmetic and its
history of being got wrong).

Each of the eleven readers is itself wired: all eleven are value-imported into
`src/main.ts:64-73` and `:67-68`. So no reader is dead on the far side either.

**The reader claim was checked for indirection, not assumed.** A module
building an id at runtime would be invisible to a literal grep.
`grep -rn 'ProjectionId' src/ui/ src/rendering/ src/main.ts` returns three
hits, all in `src/ui/simulation-projections.ts` (`:3` the type import, `:66`
the request-record field, `:159` the requester's own signature) — the shared
transport, not a reader of any particular projection. `grep -rn -E '"(hud|world)/' src/`
returns nothing, so there is no double-quoted spelling to miss. **Ten is
exact, not a lower bound.**

## 3. The census: the push read model, all twenty-three counts

`statusCountsSchema` (`src/simulation/protocol/types.ts:710`) is the one place
the protocol spells a HUD payload out field for field — the pull projections
travel as opaque `versionedPayload`. It has **23 members**, and its whole
consumer is one pure function: `hudCountsFromWorkerMessage`
(`src/ui/simulation-counts.ts:31`), the single translator from
`simulation/status-counts` to `HudCountsViewModel`.

**Eighteen are read** at `src/ui/simulation-counts.ts:36-194`: `prisoners`,
`prisonersHighRisk`, `staff`, `rooms`, `roomCapacity`,
`accommodationCapacity`, `occupiedPlaces`, `prisonersCovered`,
`prisonersUnderstaffed`, `prisonersUnguarded`, `activeIncidents`,
`activeIncidentType`, `contrabandDiscovered`, `contrabandNameKey`,
`treasuryMinorUnits`, `treasuryOverdraftFloorMinorUnits`,
`stateIncomeAccruedTodayMinorUnits`, `dailyWageBillMinorUnits`.

**Five are orphaned.** Each with the grep that establishes it and the
classification of every hit:

| Field | Producer | Every consumer-side mention, classified |
| --- | --- | --- |
| `conditions` | computed `status-strip-projection.ts:833`, emitted `:908`, wire `types.ts:1182` | 5 hits for `grep -rn -w conditions src/ui/ src/main.ts src/rendering/`, and **every one is the English word in a comment**: `hud/intake-panel.ts:267`, `hud/projection.ts:926`, `hud/hud.ts:2022`, `primitives/async-action.ts:171`, and `simulation-events.ts:870` — the last being a promise *about* this field. No code reads it. |
| `staffUnassigned` | declared `status-strip-projection.ts:339`, computed `:783`/`:787`, emitted `:867`, wire `types.ts:716` | **zero** hits in `src/ui/`, `src/main.ts`, `src/rendering/`. Nine hits in `tests/` — all fixtures or producer-side assertions, none a HUD read. |
| `roomOccupants` | `status-strip-projection.ts:377`, emitted `:871`, wire `types.ts:807` | 5 consumer-side hits, all comments, and **two of them are a reader declining it on the record**: `simulation-counts.ts:71-86` (*"deliberately not read"*, with the 3×3-cell measurement) and `hud/view-model.ts:143`. |
| `prisonersInIntake` | `status-strip-projection.ts:335`, computed `:754`, emitted `:864`, wire `types.ts:713` | 1 consumer-side hit: `src/main.ts:2828`, a comment. |
| `unpaidWagesMinorUnits` | `status-strip-projection.ts:594`, emitted `:907`, wire `types.ts:1155` | 1 hit in `src/ui/` — `simulation-events.ts:853`, `return { total: event.unpaidWagesMinorUnits }` — **which is the `wagesUnpaid` *event* field (`types.ts:1814`), not this counts field.** Same spelling, different payload. The counts field has no reader. |

`conditions` is not merely published: it is *diffed*. `src/simulation/worker/status-counts.ts:135`
special-cases `key === 'conditions'` in the change comparison, because
`projectStatusStrip` returns a fresh array each call and a reference compare
would republish on every tick. So the worker spends per-publication work
keeping a field stable for a consumer that does not exist.

## 4. The census: the pull payloads, 398 declared members

Extracted mechanically from `src/simulation/presentation/` — every `export
interface` whose name is not a `*Source`, `*Options`, `*Resolver` or
`PageRequest`, and every `readonly` member inside it at any nesting depth.
**52 interfaces, 398 declared members.** Each member name was then searched
across the whole consumer surface (`src/ui/**`, `src/rendering/**`,
`src/main.ts`) twice: once with comments stripped, once with them kept.

| | Members |
| --- | --- |
| Mentioned in consumer **code** | 223 |
| **No code mention at all** | **175** |
| — of those, named only in a consumer-side **comment** | 30 |
| — of those, mentioned **nowhere** on the consumer side | 145 |

The 223 figure is a **ceiling, not a reading**. A bare-word match over a
consumer file is weak evidence in both directions, and two hits in this run
prove it:

- `PrisonerDetailViewModel.sentence` matched **43 consumer files** — because
  "sentence" is an ordinary English word in comments. Nothing reads the field.
- `ClockViewModel.dayProgress` matched three lines of
  `src/ui/hud/status-strip.ts` (`src/ui/hud/status-strip.ts:153`, `src/ui/hud/status-strip.ts:186`,
  `src/ui/hud/status-strip.ts:296`) — all three are a **local DOM element
  variable** of the same name. Nothing
  reads the field; `hud/status-strip`'s clock block is not read at all.

So the *orphan* set (175) is measured from the reliable direction — absence —
and the consumed set was established by hand, per reader, below.

### 4.1 What each consumed projection's reader actually takes

Read out of the eleven readers rather than grepped. This is the exact
consumed field set; everything else in each payload tree is producer-side.

| Projection | Fields the reader takes | Notable member it leaves |
| --- | --- | --- |
| `hud/status-strip` | `view.regime[]` only: `classificationGroupId`, `allowedCategories`, `blockProgress.permille` (`simulation-regime.ts:98-113`) | the **whole `clock` block** (8 members) and the **whole `counts` block** (23) — both duplicated on the push route; `regime[].blockStartTickOfDay`, `blockEndTickOfDay` |
| `hud/build-queue` | `orders.rows[].{orderId,definitionId,tile.x,tile.y,edge,state,cancelRefundMinorUnits}`, `orders.total`, `started`, `materialsFunding.{unfunded,shortfallMinorUnits,nextOrderShortfallMinorUnits}` (`simulation-build-queue.ts:117-139`) | `materialsFunding.items[]` — declined on the record at `simulation-build-queue.ts:96` |
| `hud/pending-deliveries` | `deliveries.rows[].{orderId,itemId,quantity,paidMinorUnits}`, `deliveries.total`, `refundableMinorUnits` (`:93-108`) | `arrivesAtTick` |
| `hud/held-guards` | `held.rows[].{entityId,staffRoleId,claim}`, `totals.held`, `totals.unassigned` (`:93-107`) | `countsByClaim[]`, `held.rows[].{staffRoleNameKey,sectorId,deploymentPhase}` |
| `hud/prisoner-population` | `byIntakeStage[]`, `total`, `waitingWithoutPlace` (`simulation-intake.ts:104-132`) | `byClassificationGroupId[]`, `unclassified` |
| `hud/prisoner-roster` | `total`, `everAdmitted`, `rows[].{entityId,name,actionPhase,currentActionId,classified,riskTier,classificationGroupId,lowestNeed}` (`:188-238`) | `rows[].{tile,intakeStage(via helper),accommodation,gangId}` |
| `hud/prisoner-detail` | `entityId`, `name`, `classified`, `riskTier`, `classificationGroupId`, `intakeStage`, `needs[]` (`:105-113`) | `currentAction` (6 members), `location` (2), `accommodation` (3), `gang`, `sentence` (4) — all five declined on the record at `simulation-prisoner-detail.ts:53-62` |
| `hud/room-list` | `rooms.rows[].{instanceId,requirementSummary.missingCapability}`, `totals.instances` (`simulation-room-needs.ts:100-246`) | `countsByRoomCatalogId[]`, `occupancy.utilization`, `security` (5 members), `objectCapabilities` |
| `hud/room-detail` | `instanceId`, `roomNameKey`, `anchorTile.x/y`, `requirements[]` (`:230-236`) | `occupantEntityIds`, `requirements[].minTiles` |
| `hud/staff` | `totals.required`, `totals.assigned`, `totals.shortage` (`simulation-staff-coverage.ts:97-99`); `totals.hired`, `roster.rows[].{entityId,staffRoleId,assignment.deploymentPhase}` (`simulation-staff-roster.ts:96-106`) | **`patrolMetrics` (3), `deploymentMetrics` (1), `countsByRoleId` (4), `countsByDeploymentPhase` (2), `coverage[]` (4), `totals.unassigned`, and seven roster-row members** |

## 5. The orphans, ranked by what a player is denied

Ranked on the brief's rule — *not* by size. A field duplicating a visible
number is near the bottom; a field that would answer a question the player
cannot currently ask is at the top.

### 1. `statusCountsSchema.conditions` — a promise the code does not keep

**The prison's standing conditions are computed twice a second and shown to
nobody, and an in-tree comment asserts otherwise.**

`PRISON_CONDITIONS` (`src/simulation/protocol/types.ts:668-673`) has four
members: `construction.unfunded`, `intake.no-place`,
`treasury.construction-refused`, `treasury.deliveries-refused`.
`computeStandingPrisonConditions` (`status-strip-projection.ts:253`)
recomputes the set from live state at every publication.

ADR 0087 decision 2 (`docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md:512`)
lists five deliverables. Four shipped — the union, the optional schema field,
the pure producer, the determinism pin. **The fifth did not:**

> - A `Record<PrisonCondition, LocalizationKey>` in `src/ui/simulation-alerts.ts`

`grep -n 'PrisonCondition' src/ui/simulation-alerts.ts` returns nothing. The
record in that file (`REFUSAL_LABEL_KEYS`, `:34`) is keyed on `RefusalReason`,
a different union.

And the owner's ruling, quoted in the ADR at `docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md:744-749`, is specifically about
being seen:

> A persistent indicator as in option 4 — a closed union recomputed from live
> state, visible without opening anything, not scrolling away, nothing in the
> save — **plus** a one-off notice at the moment of crossing, so a player who
> was looking elsewhere gets a nudge. The accepted cost is more noise on the
> events band.

The one-off notice shipped: `src/ui/simulation-events.ts:873-874` handles
`economy.deliveries-refused` and `economy.construction-refused`. The
persistent indicator did not — and the comment three lines above those cases
(`src/ui/simulation-events.ts:867-872`) tells the next reader that the conditions *"exist to keep
answering after this notice has scrolled away, per ADR 0087 decision 2's own
division of labour between the two channels."* **The division of labour has
one live half.** A player who looks away during the payroll tick #767
measured — −1,220 to −2,180, crossing both rungs in one step — gets a notice
that scrolls, and then nothing.

**What the words must convey** (no shipped string authored here — the locale
file is the owner's, `AGENTS.md`'s fourth exclusion, and is held by another
agent this hour): for each standing condition, *that it is true right now*
rather than that it happened; which lever is jammed (deliveries, construction,
the build queue's funding, or a bed for an arrival); and — per ADR 0087 open
question 2, `:682` — whether the sentence carries the figure or only the
state.

### 2. `hud/staff`'s `deploymentMetrics` and `patrolMetrics` — the class no gate can see

**A live route, requested twice a session, carrying four numbers that answer
an ADR's own "nothing tells the player", every one discarded.**

`StaffViewModel` (`src/simulation/presentation/staff-projection.ts:122-150`)
declares:

- `deploymentMetrics.deploymentFailures` (`:149`)
- `patrolMetrics.{loopsCompletedOnTime, loopsCompletedLate, loopsMissed}` (`:144-147`)

`grep -rn -w -e deploymentMetrics -e patrolMetrics -e loopsMissed src/ui/ src/main.ts src/rendering/`
returns **nothing**. Both readers of `hud/staff` take `totals` and `roster`
and stop.

Why this is the top *mechanical* finding: **`hud/staff` has a reader, so the
projection gate reports it painted, and it is.** No allow-list entry describes
these four numbers, because the gate's unit is the id. This is
`staffUnassigned`'s class, one level up in value.

What the player is denied is named by the repository itself. ADR 0036 open
question 1 (`docs/adr/0036-a-derived-default-security-sector.md:490-495`):

> **What happens when the player builds on the post tile?** A wall at (16, 16)
> makes the post unroutable: `deploymentFailures` counts and the guard returns to
> the pool, retried every cycle, for ever. Nothing tells the player.

The count exists, crosses the boundary on request, and is thrown away on
arrival. Same shape for `loopsMissed`: a patrol route the guards cannot walk
is countable and invisible.

**UNCERTAIN, and named as such:** whether `deploymentFailures` is non-zero in
an ordinary session was **not measured** in this pass — it is a text census,
not a playtest. Settling it needs a prison built over its own post tile and
the projection read. The claim made here is only that the number reaches the
main thread and is discarded, which is text-verifiable.

### 3. `hud/incidents` and `hud/incident-detail` — 66 and 26 members, the whole subject unreachable

**Confirmed exactly as the brief states, and the brief's citations check out:**
declared at `src/simulation/protocol/types.ts:344-345`, built at
`src/simulation/worker/projection-catalog.ts:417` and `:435`, requested by
nobody. This is a *gated* orphan (§1.1), so its position here is about value,
not about a missing gate.

What the game already knows and cannot say, from
`IncidentsViewModel` (`src/simulation/presentation/incident-projection.ts:118-140`):

- `summary.{resolved, lapsed, totalInjured, totalPropertyDamage, escapes}` —
  precisely the distinction the playtest measured by playing: **15 of 15
  resolved with zero injuries against 19 of 19 lapsed with 114 injuries and
  three escapes**, while the screen said the same sentence either way.
- `responseMetrics.{incidentsResolved, incidentsLapsed, respondersDispatched, routeFailures}`
  — whether guards were *sent*, and whether they could *get there*.
- `IncidentOutcomeViewModel.{injuredCount, propertyDamage, escaped}` per
  incident, and `IncidentDetailViewModel.{timeline, injuredEntityIds, participantEntityIds}`
  — the per-incident record, including the chronological state timeline that
  would show `notified → lapsed` versus `responding → resolved`.

There is no incidents panel: `ls src/ui/hud/` holds nineteen files and none of
them is one; every `incident` hit under `src/ui/hud/` is the status strip's
`activeIncidents` chip or a comment.

**What the words must convey:** that an incident *ended*, and which of the two
endings it got — handled or expired — plus the cost that attached to it. The
one sentence a player gets today ("The prison is under control again") is true
of both and therefore says nothing.

### 4. `hud/security` — 65 members, and the sector state the player builds against

Gated, blocker still true. What it holds that nothing else does:
`sectors[].controlState` and `totals.{sectorsUnderLockdown, sectorsRestricted}`
(a sector's own regime), `sectors[].staffing.{onPost, travelling, onSearch}`
(*where* a guard actually is versus merely assigned — the distinction the
Staff panel's coverage block cannot draw), `sectors[].patrol.{hasRoute,
expectedLoopTicks, patrollingGuardCount}`, `sectors[].openIncidentCount`
(**which sector** an incident is in), and the whole `accessPolicy` block —
which classification group may pass which door, computed and unreadable.

### 5. `hud/contraband` — 72 members

Gated, blocker still true. `metrics.{itemsDiscovered, itemsMissed}` is the
only place the game says how much it **missed**; `searchOrders[].progress`,
`intelligence[]` and `informants[].reliability` are a whole subsystem's state.
Lower than security only because contraband has fewer live producers in a
session a player can start.

### 6. `staffUnassigned` — real, and mitigated by a near-duplicate

**The brief's first instance is accurate in every particular and remains
open.** But it ranks here rather than higher, because a count of free guards
*is* on screen: `HeldGuardsViewModel.totals.unassigned`
(`src/simulation/presentation/guard-release-projection.ts:160`) is read at
`src/ui/simulation-held-guards.ts:107` and painted at
`src/ui/hud/staff-panel.ts:1084` under `hud.security.hire-unassigned`.

The two are **not** the same quantity, which is issue #870's subject:
`staffUnassigned` counts `getDeploymentPhase(entityId) === 'unassigned'`
(`status-strip-projection.ts:787`); `totals.unassigned` is `hired - held`,
where "held" is any claim at all. A guard held by a claim while still phased
`unassigned` is counted differently by the two. **Wiring the orphan without
resolving #870 would put two disagreeing numbers on one screen** — which is
exactly the defect `docs/research/2026-09-03-can-a-player-read-this.md` §1
already found for the two "coverage" figures.

### 7. `prisonersInIntake`, and a comment that mis-attributes it

Orphaned. The interesting part is `src/main.ts:2828`, which says a `'failed'`
record is *"counted as a prisoner and that the arrivals-backlog readout
excludes, because `prisonersInIntake` filters `'failed'` out."* **The
arrivals-backlog readout is not built from `prisonersInIntake`.** It is built
in `src/ui/simulation-intake.ts:104-121` from
`hud/prisoner-population`'s `byIntakeStage`, which filters `'failed'` by its
own rule. The behaviour the comment describes is real; the field it credits is
producer-only. **Reported, not fixed** — `src/` is frozen for this pass.

### 8. `world/render-snapshot` — gated, and duplicated by a live route

Gated. `decodeRenderLayer` has no caller outside its own module and `tests/`
(verified: `grep -rn decodeRenderLayer src/ tests/` returns its declaration at
`world-projection.ts:74`, one comment in `codec/run-length.ts:32`, and test
files). The render path already gets chunks through
`src/rendering/feed/simulation-snapshot-feed.ts`. Denies the player nothing —
the world is drawn.

### 9. The rest: 145 members with no consumer-side mention at all

The tail is real but low-value, and most of it is the interior of the four
orphaned projections above. The notable ones inside *painted* projections,
each verified as having zero code mention:

- `HeldGuardsViewModel.countsByClaim[]` — **what** is holding the guards,
  broken down; the panel shows only how many.
- `PrisonerPopulationCountsViewModel.{byClassificationGroupId, unclassified}` —
  how the population splits across the tiers the regime timetables.
- `RoomListViewModel.countsByRoomCatalogId[]` — how many of each room type the
  prison has.
- `RoomListRowViewModel.security` (5 members) and `RoomDetailViewModel.occupantEntityIds`
  — who is in a room, and under what grade.
- `StaffRosterRowViewModel.{staffRoleNameKey, department, baseSecurityClearance, permissions}`
  and `StaffAssignmentViewModel.{sectorId, patrolWaypointIndex, patrolLoopStartedAtTick}`
  — a guard's clearance and *where they are posted*; the roster row says only
  a role and a phase.
- `ClockViewModel.speedKnown`, `RegimeBlockViewModel.{blockStartTickOfDay, blockEndTickOfDay}`
  — when the current regime block began and ends. The panel shows a progress
  bar and no times.
- `RenderChunk.{geometryRevision, contentRevision}` — ADR 0040's business, not
  a player-facing gap.

**A distinction worth keeping**, because it separates a defect from a
decision: of the 175 no-code-mention members, **30 are named in a
consumer-side comment**, and several of those are a reader *declining the
field on the record with a reason* — `simulation-counts.ts:71-86` for
`roomOccupants`, `simulation-build-queue.ts:96` for `materialsFunding.items`,
`simulation-prisoner-detail.ts:53-62` for `currentAction`/`location`/
`accommodation`/`gang`, `simulation-staff-coverage.ts:58` for `coverage[]`,
`simulation-prisoner-roster.ts:54-59` for `accommodation`/`gangId`. Those are
the repository working as intended. **The 145 with no mention anywhere are the
class this pass was commissioned to find.**

## 6. Are the gate's stated blockers still true?

Each of the five `UNPAINTED_PROJECTION_IDS` reasons was checked against this
tree. **All five substantive claims hold. Three of the five carry a line
citation that no longer points where it says.**

| Entry | Substantive claim | Verdict |
| --- | --- | --- |
| `hud/incident-detail` (`:365`) | waits on the *list* half; `hud/incidents` has no reader and no panel, so there is no row to press | **Holds.** `hud/incidents` has no reader (§2); no incidents panel exists. Citation `10-product-roadmap.md:327` is **correct** — that line is item 4, "Selection + one generic inspector panel". |
| `hud/incidents` (`:367`) | roadmap names the unbuilt panel; `projectIncidents` calls `IncidentLog.all()` and pages in memory | **Both hold.** `10-product-roadmap.md:328` is item 5, *"Incident notification + response controls"* — **correct**. `all()` verified at `incident-projection.ts:207`. **Stale citation:** the cost is credited to `docs/HUD_PROJECTIONS.md:1130-1133`, which is now ADR 0028 phase-5 room prose. The claim lives in that file at `:606` and `:1515`. |
| `hud/contraband` (`:369`) | roadmap lists it unbuilt; `ConfiscationLedger.all()` unbounded; `drain()` has no caller in `src/` or `tests/` | **All hold.** `drain()` verified: the only `src/` hits are its declaration (`contraband/confiscation.ts:58`) and eight comments; the `tests/` hits are one comment plus two *different* `drain` functions (`loop.drain()` in `command-submission-monotonicity.test.ts`, a local helper in `navigation-frontier-heap.test.ts`). **Stale citation:** `docs/HUD_PROJECTIONS.md:1117-1120` is now room-requirement prose. |
| `hud/security` (`:371`) | ADR 0036 *"says plainly"* no panel reads it | **Holds.** **Stale citation:** the sentence is at `docs/adr/0036-a-derived-default-security-sector.md:508`, not `:490`; `:490` is now inside open question 1. |
| `world/render-snapshot` (`:373`) | `decodeRenderLayer` uncalled outside its module and `tests/`; ADR 0040 open question 4 defers | **Both hold.** Citation `docs/adr/0040-the-shape-of-the-render-delta-channel.md:522` is **correct** — that is open question 4's first line. |

**No blocker has quietly become false.** The three stale line numbers are the
predictable decay `docs/AGENT_WORKFLOW.md` §4 warns about, and each reason
quotes enough of its target that a reader can re-find it — which is why they
are recorded here as a maintenance note rather than as defects. They are not
policed: `documentation-source-anchor-contract.test.ts` scans markdown, and
these anchors live inside a TypeScript string.

## 7. What was wrong in the commissioning brief

1. **"That hole is itself a finding."** There is no hole.
   `UNPAINTED_PROJECTION_IDS` names both incidents ids with stated blockers,
   and the gate polices the list in both directions. The gate keeps a narrower
   promise than "every route is painted" — *"every unpainted route says why"* —
   deliberately, with its reasoning written down (§1.1). **The real gap is
   that no gate covers producer-only fields at all** (§1.3), which is a
   coverage gap rather than a defect, and the distinction matters because the
   remedy is different: a new gate, not a repair.
2. **"The class has never been enumerated."** True at field level, false at
   projection-id level: the gate has enumerated the unpainted ids
   continuously, and ADR 0040 open question 4 and `docs/HUD_PROJECTIONS.md` §9
   both carry tallies of it.
3. **Both cited instances are accurate.** Neither `staffUnassigned` nor the
   incidents pair is consumed by a route the brief missed. `staffUnassigned`
   has zero consumer-side hits of any kind; the incidents pair has none
   outside its declaration and catalog entry.
4. **`staffUnassigned` is less isolated than it looks.** A free-guard count
   *is* painted, from a different projection and a different definition
   (§5.6) — so the remedy is entangled with issue #870 rather than a
   standalone wiring.

## 8. Weakest claim in this record

**The 223 "consumed" members are a ceiling, not a count.** Absence was
measured mechanically and is reliable; *presence* was established two ways —
by a bare-word grep over the consumer surface, which over-reports (the
`sentence` and `dayProgress` false positives in §4 are the proof), and by
reading the eleven readers by hand for the table in §4.1. The by-hand pass is
what §5's rankings rest on and it covers the consumed projections completely;
but a member I classified as consumed on the strength of a grep alone, in a
file I did not read line by line, could be a third false positive of the same
shape. **What would settle it:** a gate that resolves each member through the
type system rather than by name — which is the same gate §1.3 says does not
exist, so the census and its own remedy are the same artefact.

Second weakest: §5.2's claim about `deploymentFailures` is a text claim, not a
measurement. That the number crosses the boundary and is discarded is
verified; that it is ever non-zero in a session a player can drive is
**UNCERTAIN** and needs a prison built over its own post tile.

## 9. What this pass did not do

- **No `src/` file was changed.** Six agents are live on the HUD this hour.
- **No remedy was implemented.** Two of the top three orphans need a
  player-facing sentence, which is the owner's (`AGENTS.md`'s fourth
  exclusion); each is stated as *what the words must convey* and no shipped
  string is authored.
- **No ADR was written or edited.** ADR 0087's unbuilt fifth deliverable
  (§5.1) is reported against the ADR's own text; whether it is built, deferred
  or re-argued is a decision, and `docs/adr/` is held elsewhere.
- **`docs/research/README.md` was not touched** — it appends at a single point
  and any two notes conflict by construction. The integrator adds the row.
- **`tests/foundation/` was run and is green** (52 files, 475 tests), and both
  typecheck projects exit 0. Nothing was skipped, disabled or quarantined.
