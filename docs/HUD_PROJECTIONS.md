# HUD read models

`src/simulation/presentation/` holds the read-model layer: pure functions
from authoritative simulation state to readonly, structured-clone-safe view
models. It extends the pattern `world-projection.ts` already established
for the world renderer to everything the HUD panels show.

`AGENTS.md` boundary 1 — rendering is never the source of truth — is what
this layer exists to enforce. A panel reads a projection; it never reaches
into a `RoomInstanceRegistry`, an `EntityStore` or a `SearchSystem`.

## Contracts

### 1. Readonly, and never mutating

No projection writes to the state it is given, and no projected value
shares a mutable reference with it. Arrays are copied, tile positions are
rebuilt as plain `{x, y}` numbers. `tests/unit/hud-projections.test.ts`
asserts that projecting a live runtime leaves its full deterministic state
hash unchanged.

### 2. Deterministic iteration

Every list is ordered by a key derived from **state** — ascending entity id,
ascending string id in code-unit order, or a fixed declared catalog order —
never `Map`/`Set` insertion order and never `localeCompare`
(`docs/DETERMINISM.md`). The test suite builds the same scenario twice with
every incidental registration order reversed and requires byte-identical
canonical JSON from every projection.

`RoomInstanceRegistry.occupantsOf` returns insertion order, so this layer
sorts what it gets before projecting (`tests/determinism/projection-ordering.test.ts`
is the guard). `DoorRegistry.all` sorts by door id since #132, but this layer
still never calls it: doors are looked up by the sector's own sorted
`doorIds`.

### 3. Ids and message keys, never text (ADR 0011)

A view model carries a stable simulation/content id and, where the content
catalog defines one, its `nameKey`. Resolving a key to a translated string
is the HUD's job. A test walks every projection and fails if any string
value equals a translation from the default `en` catalog.

An **actor name** is the one player-facing string this layer emits, and it
is not an exception to the rule — it is outside the rule's three
namespaces. A person's name is never authored into a catalog, never
translated and identical in every locale; it is state that happens to be a
string ([ADR 0015](./adr/0015-actor-identity-allocation.md)). The
boundary test is unchanged, and `tests/unit/actor-identity.test.ts` asserts
the whole name pool is disjoint from the `en` catalog so it stays passing
as either side grows.

### 4. Bounded values

`BoundedValue` is how a quantity stored on an internal scale reaches a
segmented bar:

| Field | Meaning |
| --- | --- |
| `permille` | The value as an integer share of its own maximum, `0`–`1000`. Authoritative: use it for tooltips, ARIA values and width calculations. |
| `filled` / `segments` | A ready-made segmented bar: fill `filled` of `segments` (`BOUNDED_VALUE_SEGMENTS` = 10). |

`filled` obeys two rules at once, and both are **product decisions** about
how the game reads rather than implementation detail:

1. **Any value above zero lights at least one segment.** One prisoner in a
   180-capacity prison is not "nothing here", and an empty bar states a
   different fact from the one that is true.
2. **A bar is completely full only when the value is at its maximum.** The
   last segment is reserved for that case, so 254 of 255 lights nine of ten.
   Rounding would render 99.6 % as a full need bar, which is a lie a player
   acts on.

The rule that satisfies both is `ceil` of the ratio, clamped below the last
segment: `min(segments - 1, max(1, ceil(value / maximum * segments)))`, with
`0` and `value >= maximum` answered outright. It is computed from the ratio
and **not** from `permille`, which would quantize twice — 1 of 255 rounds to
`permille: 4`, and a fill derived from `4` loses the only fact rule 1 needs,
that the value is non-zero.

`src/ui/primitives/segmented-bar.ts`'s `filledSegments` implements the same
rule for bars the HUD fills from raw numbers. It is a deliberate second copy
— `AGENTS.md` boundary 1 forbids `src/ui/primitives/**` importing
`src/simulation/**` — and `tests/unit/segment-fill-agreement.test.ts` drives
both over the same inputs so the copies cannot drift. They did drift, for as
long as both existed: issue #123 item 1.

The raw value and raw maximum are deliberately **absent**. Needs are
`0..255` levels at the projection boundary and are stored as scaled
`Uint16Array` values underneath (`NEED_SCALE`, #259); both are internal
storage decisions, and exposing either would guarantee some panel hard-codes
`255`.

Semantics are "how full", not "how bad": a need at `permille: 0` is a
starving prisoner. There is **no** severity band, because the simulation
defines no warning/critical thresholds for needs — inventing one would be a
balance decision, not a projection.

Incident severity and property damage keep their raw `0–10` rank alongside
a `BoundedValue`, because `incident.ts` documents both as published scales.

### 5. Paging

`ViewModelPage<T>` carries `total`, `offset`, `limit` and only the
requested `rows`. The prisoner roster projects on demand: it walks entity
indices `0..maxActiveIndex` (one `Uint8Array` liveness read each, the walk
ADR 0005 measured at ~0.6 ms for 5,000 entities) and allocates a row object
only for rows inside the window.

Measured at the actor tiers, page limit 25
(`tests/unit/hud-projections-scale.test.ts`, reported not asserted —
`docs/BENCHMARKING.md` forbids timing assertions):

| Actors | Page JSON bytes | Page ms | Counts ms | Status strip ms |
| --- | --- | --- | --- | --- |
| 250 | 9,943 | 0.36 | 0.10 | 0.31 |
| 1,000 | 9,926 | 0.06 | 0.11 | 0.18 |
| 2,500 | 9,926 | 0.05 | 0.07 | 0.16 |
| 5,000 | 9,926 | 0.04 | 0.15 | 0.19 |

Page size is flat in population, which is the property that matters.
`projectPrisonerPopulationCounts` and `projectStatusStrip` allocate no
per-prisoner object at all, so the always-visible strip is safe to
re-project every frame at the stretch tier.

The always-visible counts have no rows at all, which is what makes them
publishable on a timer: `simulation/status-counts` (section 8) carries twelve
integers and at most one three-field refusal record, so there is nothing here
for this contract to bound. A projection that carries rows must be paged
before it may be published on a cadence — a per-send cost that grows with the
prison is exactly the failure that cadence was chosen to avoid.

`offset` and `limit` now have a direction to arrive from:
`simulation/request-projection` carries them (section 9), which is what
closes #157 finding 1. The ceiling is `MAX_PROJECTION_PAGE_LIMIT` (500), on
the schema rather than in the handler, so an over-large window never decodes —
without one, "the UI may choose the window" and "the UI may ask for all five
thousand rows" would be the same request.

The twelfth is #29's "earned today" accrual, and it is the first count here
that is not a *level*. Every other one moves only when a discrete event moves
it, which is what lets `publishStatusCounts` skip a publication whose counts
are unchanged — the reason `STATUS_COUNTS_PUBLISH_INTERVAL_MS` is documented as
a ceiling rather than a rate. The accrual rises every tick that any place is
occupied, so **once the prison holds anybody this channel goes from
silent-when-idle to its full two messages a second for the rest of the
session.** That is the price of the readout, it is bounded by the same 500 ms
ceiling as everything else on the channel, and it is named here so it is paid
deliberately rather than discovered. It is not being paid yet: with no
occupied place the accrual is a constant zero and the skip still applies
(gap 21).

Rows are **not** sortable by an arbitrary column. Sorting 5,000 prisoners
by need or by cell is `O(n log n)` plus a full materialisation each time the
key changes; that needs an indexed accessor on the prisoner runtime, not a
workaround in the projection.

### 6. Withheld state

Two projections deliberately drop state they can see:

- **Contraband.** `ContrabandRegistry` ground truth — every concealed item,
  its holder, its movement history — is never projected. Only the
  confiscation ledger (what was found) and the intelligence ledger (what is
  suspected, uncertainty intact) reach the HUD, matching
  `docs/CONTRABAND.md`.
- **Incidents.** `IncidentRecord.causeFactors` and the `SectorRiskTracker`
  score are withheld, exactly as `incidents/alerts.ts` already withholds
  them from `IncidentAlert`. The timeline is not hidden: it records what
  visibly happened.

### 7. The clock, and the first route of its own

The clock was the first projection with a published route rather than a
snapshot behind it, and section 8 is the second. Everything *else* in this
document still has neither: it is computed here and nothing carries it to a
panel.

A snapshot is why. It is expensive: the render feed polls one every two
seconds while the simulation runs, and each poll makes the worker capture
the full session bundle. A day counter cannot be worth that, and a day
counter that only moved every two seconds would be worse than none.

So the clock has its own route, and it is still a route the worker owns:

1. A transport control emits a `set-clock` **intent**. The HUD changes
   nothing locally — it does not know whether the simulation accepted.
2. The composition root turns it into `simulation/set-clock`
   (`src/ui/simulation-commands.ts`).
3. The worker sets `FixedStepClock` and answers with a **correlated**
   `simulation/clock-state` carrying the tick and the clock's own control.
4. While the clock runs, the worker **publishes** an uncorrelated
   `simulation/clock-state` at most every 250 ms and only when the tick has
   moved. ADR 0003 requires an unsolicited message to carry no `replyTo`,
   so it does not.
5. `hudClockFromWorkerMessage` (`src/ui/simulation-clock.ts`) turns either
   form into a `HudClockViewModel`. It is a pure function with no timer:
   nothing on the main thread counts ticks, and nothing extrapolates from
   `performance.now()`.

The property this preserves is the one ADR 0009 turns into a product
guarantee. Pausing, resuming and changing speed decide **when** ticks
happen; they never touch what a tick computes, and the publication is a
read. `tests/determinism/clock-transport.test.ts` drives the real worker
state machine twice from one snapshot — once straight through, once paused
and resumed at three speeds — and requires a byte-identical session at the
same tick.

### 8. The status-strip counts, and the pipe the rest will use

The strip's metrics — prisoners, staff, rooms, open incidents, contraband
found, and since #96 the treasury balance — were literal zeros until issue
#104. The counts existed
(`projectStatusStrip`), the receiving mapping existed
(`src/ui/hud/projection.ts`), and there was no pipe between them.

There is now, and it is the same shape as the clock's:

1. The worker projects `projectStatusStrip(...).counts` from its own
   registries (`src/simulation/worker/status-counts.ts`) and **publishes**
   an uncorrelated `simulation/status-counts`. Nothing requests it, so ADR
   0003 gives it no `replyTo` field at all.
2. It publishes at most every 500 ms, and only when a count has changed, the
   session has refused something new, or a room has just been designated — so a
   steady prison costs the boundary nothing. The interval is checked before the projection runs, so
   the *projection* is rate-limited too, not just the message.
3. Every payload carries the tick it was read at, so a readout cannot drift
   away from the state it claims to describe.
4. `hudCountsFromWorkerMessage` (`src/ui/simulation-counts.ts`) turns it
   into a `HudCountsViewModel`. Like the clock's translator it lives outside
   `src/ui/hud/`, because the HUD may not import the simulation.

#### The refusal it also carries (#261)

The same payload has an optional `refusal` beside `counts`, and it is what
finally gives `HudViewModel.alerts` a producer. The list, the severity
badges, the folding section, the empty-state row and the insertion ordering
#209 measured in a real browser were all implemented; between #220 — which
moved the one message ever routed there, "simulation unavailable", to
`.hud__unavailable` — and #261, the only assignment to the field anywhere in
`src/` was the literal `[]` in `EMPTY_HUD_VIEW_MODEL`.

The hole it fills is between a command's two acceptances. The worker answers
`status: 'queued'` when the kernel takes the message, which ADR 0003 decision
9 is explicit is receipt and not effect; a system then decides at the
command's tick what the command *means*, and that decision had no wire
message at all. So `ConstructionSystem.submitOrder` set `state: 'failed'`
with `failReason: 'out-of-bounds'` — reachable by typing `100, 100` into the
Build panel's unbounded coordinate fields — and the player saw nothing: a
failed order is drawn as no geometry (`phaseOf` in
`src/rendering/world/structures.ts`) and the HUD's refusal line answers a
*rejected* command. `ProcurementSystem.purchase` returned an outcome that
`session-commands.ts` discarded, and `RoomZoningService.zone` returned one
that reached a bounded in-worker window and stopped there.

- **Snapshot-shaped, because the channel is.** `{ sequence, tick, reason }`:
  the most recent refusal and its 1-based ordinal, which is also the total.
  A *queue* is what this channel cannot carry honestly — the publication is
  rate-limited and skippable, so a reader could not tell a drained queue from
  one that was never sent, and its length would grow with the session, which
  is exactly what contract 5 forbids on a cadence. `RefusalLog`
  (`src/simulation/refusals/`) argues this in full.
- **A stable id, never a sentence** (ADR 0011).
  `hudAlertsFromWorkerMessage` (`src/ui/simulation-alerts.ts`) maps each
  reason onto a `hud.alert.refusal.*` message key through a `Record` over the
  closed union, so a reason added to the protocol fails to compile until it
  has something to say.
- **It stays up until another refusal replaces it, or the session ends.**
  Nothing on this channel can say "dismissed"; that needs a main-to-worker
  message and simulation state to hold it. Recorded as gap 34 below rather
  than invented here.
- **Not snapshotted.** A restored session starts with none — see gap 33.

#### The zoning notice it also carries (ADR 0022, amended)

A third field beside `counts` and `refusal`, and the reason it is not a fourth
kind of refusal is the whole point of it: an accepted designation of a cell in
open ground is **not** a refusal. The room exists, it is painted on the map and
it is in the `Rooms` count. What the player needs to be told is a *fact about*
the room they just made, which is a readout and belongs beside the control that
made it.

That distinction is not cosmetic. The alerts section starts folded
(`INITIAL_HUD_SHELL_STATE`), so a warning routed to the alerts list after a
designation would be in the DOM and painted at no viewport — the exact defect
#220 moved "simulation unavailable" out of that list to fix.

- **Two enums and two integers, and no room id.** `{ sequence, tick,
  enclosure, requirement }`, where `enclosure` is what the world answered for
  the rectangle (`'sealed'` / `'open'`) and `requirement` is what the room
  definition asked for (`'enclosed'` / `'outdoors'` / `'none'`). The pair is
  what makes the notice self-describing: the main thread does not have to
  remember which room type was selected when the player released the pointer.
  Neither value is a message key and neither is a sentence, so ADR 0011's
  separation is untouched — `src/ui/hud/rooms-panel.ts` decides which sentence
  the pair deserves, and the one combination worth warning about (`enclosed`
  asked for, `open` found) is about the pair rather than either member.
- **Snapshot-shaped, for the reason `refusal` is.** "The last room designated
  was open against an enclosed requirement" is true of the session at any tick;
  an event would not be, and this publication is rate-limited and skippable.
  `sequence` is 1-based and counts *accepted designations*, so it is both the
  notice's ordinal and how many rooms the session has designated — and it is
  what tells a republished notice from a new one.
- **It opens the interval gate, like a refusal, and is bounded the same way.**
  A designation is a player-initiated event rather than a level, and publishing
  records the sequence it published, so the cost is one extra projection per
  room designated. It needs its own sequence rather than sharing the refusal's:
  re-zoning the same tiles after a removal returns the `Rooms` count to a figure
  already published, so `statusCountsEqual` alone would suppress the notice on
  the one gesture a player is most likely to repeat.
- **Not snapshotted**, like `RefusalLog`: it is a notice about something the
  player did moments ago rather than a condition of the prison, so a restored
  session starts with none.
- **It refuses nothing.** `src/simulation/rooms/enclosure.ts` states in full why
  the simulation cannot honestly refuse on this answer; gap 14 below records the
  wider question it is narrower than.

`hudZoningFromWorkerMessage` (`src/ui/simulation-zoning.ts`) is the translator,
and it returns three states rather than two: `undefined` for "this message says
nothing about zoning", `'none'` for "it does, and no room has been designated",
and the notice otherwise. Collapsing the first two would leave a readout from an
ended session on screen.

Two things deliberately do **not** cross:

- **Every `BoundedValue`.** The projection also computes `clock.dayProgress`
  and `regime[].blockProgress`, and this channel drops both. The HUD keeps
  computing its own fill from the numbers it is given. That used to be
  load-bearing for a bad reason — the two fill rules disagreed for every
  small-but-nonzero value, so carrying `filled` across would have answered an
  open product question by accident — and issue #123 item 1 settled it: both
  now implement the rule in section 4, pinned by
  `tests/unit/segment-fill-agreement.test.ts`. What remains is an ordinary
  scope decision. Widening this channel is a change to make when a panel
  needs one of these values, not a correctness fix.
- **A prisoner capacity.** `counts.roomCapacity` sums every registered room
  instance — canteens and yards included — and the HUD's occupancy bar is
  documented as *cell* capacity with an over-capacity warning behind it. The
  simulation has no cell-only total, so `HudCountsViewModel.prisonerCapacity`
  stays `0` and the strip omits the bar rather than drawing a wrong
  denominator.

What this did **not** close, and section 9 does: the other nine projections
in this directory had no route at all. Rosters, room lists, staff, security,
contraband and incidents were reachable only from their own tests, and each
carries rows, so each needed the paging contract honoured (section 5) and a
page *request* direction the protocol did not have — the counts needed
neither.

### 9. The general channel the rest use (#104, #157 finding 1)

Section 8's pipe was the second **special case**, not the pipe: the clock had
its own message kind and the counts had another, so the nine read models left
over were nine more protocol changes away. Section 9 is the change that stops
the protocol growing with the read model.

One request and one reply carry all of them:

1. The main thread sends `simulation/request-projection` naming a
   `projectionId` from a closed vocabulary (`PROJECTION_IDS`, twelve members),
   optionally with `offset`/`limit` and optionally with a `target` — an entity
   id or a string id — for a detail projection.
2. The worker looks the id up in `PROJECTION_CATALOG`
   (`src/simulation/worker/projection-catalog.ts`), which is the only place
   that knows which registry of a live `SimulationRuntime` answers which
   projection's source shape. It is a `Record<ProjectionId, …>`, so a newly
   declared id **does not compile** until it has a binding.
3. It replies with one correlated `simulation/projection`: the id, the tick it
   read, the window it built, and the view model as a `versionedPayload` under
   the projection's own `schemaId`/`schemaVersion`.
4. `SimulationProjectionRequester` (`src/ui/simulation-projections.ts`) is the
   main thread's side. Like the clock's and the counts' translators it lives
   outside `src/ui/hud/`, because the HUD may not import the simulation.

Four properties are worth stating because each is a decision:

- **Pull, not push, and the two publications stay publications.** A level the
  player is always looking at belongs on a cadence; a list only an open panel
  cares about, in a window only that panel knows, belongs on a request.
  Nothing publishes a `simulation/projection` on a timer.
- **Which is why #157 finding 2 does not arise.** `ConfiscationLedger` has no
  windowed accessor and `IncidentLog.all()` materialises every incident ever
  recorded — both unsafe to read twice a second, and neither read at all until
  something asks. The catalog reads the ledger through the non-consuming
  `all()` and never `drain()`s;
  `tests/determinism/projection-request.test.ts` asserts that ten reads report
  the same ledger.
- **The window is the caller's** (contract 5). `offset`/`limit` are on the
  request, capped by `MAX_PROJECTION_PAGE_LIMIT` (500), and the reply echoes
  the window it actually built beside the true `total`. A worker-chosen window
  is not paging, it is truncation the UI cannot scroll.
- **Still a read.** Sixty ticks with every projection requested on every
  tick-loop wake end byte-identical to sixty ticks with none requested.

**Cost, measured rather than assumed.** The production worker chunk grows
234.84 kB → 254.44 kB (+19.6 kB, uncompressed) and the main chunk 1,627.84 kB
→ 1,628.66 kB (+0.82 kB). The worker's share is where it should be and is
almost all of it: the worker now imports every module in this directory and
the content registries they resolve `nameKey`s against, where before it
imported only the status strip's. It is a worker chunk, so it blocks no first
paint. Per-request cost is not reported here as a timing figure —
`docs/BENCHMARKING.md` forbids timing assertions and the shapes are what make
the route safe: a paged reply is bounded by `MAX_PROJECTION_PAGE_LIMIT` rather
than by the population, and nothing is projected unless something asks.

`tests/foundation/projection-reachability-contract.test.ts` is the gate: it
reads the exported projections out of this directory and fails if one has
neither a catalog entry nor a recorded route of its own. `projectClockPosition`
is the one recorded exception — it is a pure function of a tick and the main
thread already has the tick, so it is computed there rather than requested.

What this does **not** close: **no panel calls the requester yet.** The route
is reachable, every projection answers over it, and the first consumer is a
separate issue — #104 scopes it out in those words ("Not in scope: what to
*do* with the data"). The gate above records that state and fails the day a
module under `src/ui/` starts using it, so the entry cannot go quietly stale.

## Gaps: fields a panel plausibly wants that the simulation does not have

Nothing below is implemented, faked or defaulted. Each is a product
decision about what to build next.

### Identity and labelling

1. ~~**No prisoner name.**~~ **Closed** by
   `src/simulation/identity/` ([ADR 0015](./adr/0015-actor-identity-allocation.md)):
   a name is an allocated identity, minted once at the intake pipeline's
   `reception` stage from the `identity.actor-name` RNG stream and carried
   as state — not a value derived from the entity id, which `EntityStore`
   recycles behind a wrapping generation counter. `projectPrisonerRoster`
   and `projectPrisonerDetail` take an optional `identity` source and emit
   `name: { givenName, familyName }`; the row simply has no `name` when no
   source is supplied. **Still missing: portrait, age and offence.** A
   prisoner remains a classification, a risk tier and a
   `priorIncidentsAtIntake` integer beyond the name.
2. ~~**No staff name.**~~ **Closed** the same way — `projectStaff` takes the
   same optional source. Note the lookup is keyed `(kind, entityId)`:
   `GuardRoster` owns its own `EntityStore`, so a staff id and a prisoner id
   collide numerically and a name cannot be looked up by id alone. Minting
   for a hire is the caller's call, since `GuardRoster.hire` has no tick
   context to draw from.
3. **No message keys for any simulation enum.** The default locale catalog
   covers room, object, staff-role, item, security-grade and
   contraband-category names only. Needs, action ids, action categories,
   intake stages, classification groups, risk tiers, incident types,
   incident states, deployment phases, search scopes, job lifecycle states,
   gang ids and contraband holder kinds all reach the HUD as bare stable
   ids with no authored key. Every one of them is rendered text.
4. **No prison/facility name** in simulation state; the prison id lives in
   the save envelope, not the session.

### Clock

5. **No hour-of-day or wall clock.** `DAY_LENGTH_TICKS` (2,400) is a tick
   budget that `regime.ts` explicitly calls a candidate value, not a
   24-hour mapping. The projection reports day number, tick-of-day, day
   progress and the active regime block instead of inventing a clock face.

   **The HUD does not invent one either.** The status strip used to carry a
   `minuteOfDay` and render `07:45`, which is a time no system produces. It
   now shows the day number and how far through that day the simulation is
   — the same two facts `projectClockPosition` publishes — and shows `--`
   for both when no session has reported a clock. Whether a prison day
   should map onto a 24-hour dial is a balance decision, not a formatting
   one, and it stays open.
6. ~~**`FixedStepClock` exposes no getter for its current `ClockControl`**~~
   **Closed.** `FixedStepClock.control` reports what the clock is running
   under. `StatusStripSource.clockControl` is still *passed in* — a
   projection takes state and does not reach for the live scheduler — but
   the worker now reads it off the clock instead of remembering what it
   last set, so the two can no longer disagree. `speedKnown: false` remains
   for a caller that supplies no control at all.

### Prisoners

7. **No need thresholds.** Nothing defines "warning" or "critical", so a
   need bar cannot be banded without a balance decision.
8. **No need trend.** Only the current level exists; nothing records recent
   history, so a panel cannot show rising/falling.
9. **No health, injury or medical status.** Incidents produce
   `injuredEntityIds`, but nothing writes injury onto a prisoner.
10. **Position updates only on arrival.** `ActionSystem` moves a prisoner
    onto the destination anchor tile when a route resolves and never in
    between, so a travelling prisoner's projected tile is stale and a map
    dot will jump rather than walk.
11. **Room membership is not derivable from position.** A `RoomInstance`
    carries an anchor tile, not bounds or a tile set. The detail projection
    reports the room a prisoner is *performing an action in*; "which room
    is this prisoner standing in" is unanswerable.
12. **No release date in player units.** `sentenceEndTick` exists but only
    after classification, and there is no served/remaining breakdown.
12a. **Nothing projects why an admission failed, or how long one has been
    waiting.** `IntakeMetrics` (`completedCount`, `failedCount`,
    `accommodationBacklogTicks`) has no reader anywhere in `src/` outside
    `IntakeSystem` itself, so a prisoner stuck at
    `accommodation-assignment` for an in-game week is indistinguishable on
    screen from one who arrived a tick ago. This is why #261 step 4 puts the
    admission *refusal* on the `RefusalLog` route instead: a refusal is a
    fact about a press and reaches the player, while the backlog is a
    condition of the prison and reaches nothing. Prison Architect's answer
    to the same state is a persistent top-bar counter
    (`interfacetopbar_prisoners_nocells`, quoted in ADR 0023); this tree has
    no channel that could carry one. It is a *reachable* state rather than a
    hypothetical one now the Rooms tab (#312) exists: measured, a prisoner
    admitted into a prison holding one zoned `room.cell` is still at
    `accommodation-assignment` at tick 1,000 with
    `accommodationBacklogTicks` at 196, and the only thing the strip says
    about them is that they are one of `prisonersInIntake`.

### Rooms

13. **Object placement does not exist.** No system tracks which objects are
    physically in which room; `RoomInstance.objectCapabilities` is declared
    at registration. So an `object` requirement can only be checked as
    "instance declares the required object's capabilities", never against
    `minQuantity`, and `enclosed` / `outdoors` / `minimum-size` are
    projected as `'not-evaluated'`.

    Since #261 this is visible on the strip rather than only in a test.
    `RoomZoningService` is the first thing in `src/` that registers an
    instance, and it registers a *zoned* room -- an empty rectangle -- so it
    declares capacity `0` and no capabilities at all. `Rooms` therefore
    counts the room while `roomCapacity` stays `0`, and every `object`
    requirement on it reads `'missing-capability'`. Both are the room's true
    state, not a projection defect: nothing has been placed in it, and
    nothing can be until object placement exists.

    **Two of the three area requirements this gap listed as
    `'not-evaluated'` are now evaluated**, and by the zoning service rather
    than by a projection — which is why they are recorded here rather than
    removing the gap. The Rooms tab (ADR 0022, amended) needed both:

    - `minimum-size` is *enforced*. `RoomZoningService.zone` reads the
      authored `minWidth`, `minHeight` and `minTiles` through
      `src/simulation/rooms/requirements.ts` and refuses
      `below-minimum-size`. Before it, a 1×1 canteen was a legal room.
    - `enclosed` / `outdoors` is *reported*, not enforced.
      `src/simulation/rooms/enclosure.ts` answers whether the rectangle's own
      perimeter is walled and the answer travels on
      `simulation/status-counts`'s new `zoning` field. It refuses nothing,
      because the check is narrower than enclosure and because
      `edgeNumericIdFor` writes `0` for `door-wooden`, so no sealed room can
      currently have a way in. Gap 14 below is the wider question.

    `object` requirements are unchanged and still gated on placement.
14. **Nothing validates room geometry at all** *— narrowed, not closed.*
    There is no real room-geometry *validation system* to project. Until
    #123 item 2 there was a *mocked* one — `RoomSystem.validateRoom` reported
    every `object` requirement as missing and treated `minimum-size` as
    always satisfied, saying so in its own body — which made this gap look
    half-filled while production never called it. It is deleted, so
    `requirementStatus` in `room-projection.ts` is the single evaluator of a
    *room instance's* requirements.

    What is now answered is narrower and sits on the other side of the
    boundary: the two area requirements are checked **at the moment a
    rectangle is zoned** (gap 13 above), against the rectangle the player
    drew, not against a registered instance. So `requirementStatus` still
    answers `'not-evaluated'` for a room that already exists, and asking "is
    *this* room still big enough / still enclosed" has no answer, because a
    `RoomInstance` carries an anchor tile rather than bounds (gap 11).

    The wider enclosure question is unanswered and its two obstacles are
    worth naming: `TopologyManager` does region *detection* and exposes no
    enclosure query, and `TopologyManager.update()` has **no caller anywhere
    in `src/`** — it is constructed in `runtime/new-session.ts` and absent
    from the `registerSystem` block beside it, so `getTopologyId` answers `0`
    for every tile in a running session. A region id alone would not be
    enough either: a region reaching the edge of the materialised world is
    indistinguishable from one bounded by walls there.
15. **`RoomInstanceRegistry` has no `all()` or `size()`.** Enumeration
    fans out over catalog room ids, so an instance registered under a
    room-catalog id the catalog does not define is invisible to the room
    list and to the status strip's room count.
16. **No room-to-sector mapping.** A room's security grade requires a
    caller-supplied `sectorIdByRoomInstanceId`; without it the projection
    omits security rather than guessing a spatial containment rule.
17. **No room utility/power state.** `UtilityNetwork` nodes are ids with no
    association to a room instance.
18. **No room quality, cleanliness or temperature.**

### Staff

19. **`GuardRoster` is the only staff store**, and there is no employment,
    shift or scheduling system. Staffing "by time" exists only as
    `DeploymentSchedule`'s required headcount per sector. **Hiring is the one
    part of this that now exists** ([ADR 0025](./adr/0025-guard-hiring-surface.md)):
    a `HireStaff` command reaches `StaffHiringService`, which spends from the
    treasury and calls `GuardRoster.hire`, and the Staff panel on the Security
    tab is what sends it. Nothing dismisses, promotes, schedules or pays
    anybody, and there is still no employment record beyond the `GuardRecord`
    the roster writes.
20. **No per-staff skill level or fatigue.** `staff-role-catalog` declares
    skill *requirements* per role, but no staff entity carries a skill. This
    is also why hiring reads the *bottom* of a role's wage band and not a
    point inside it: where in the band an individual sits would need a skill
    or negotiation model, and there is none.
21. **`wageBand` is read once, at hire, and there is still no payroll.** A
    hire debits the treasury by the role's `wageBand.minPerDay`
    ([ADR 0025](./adr/0025-guard-hiring-surface.md) decision 2), and the Staff
    panel renders that figure on the button that will spend it — so the
    earlier form of this gap, "no wage is ever debited" and "nothing
    wage-related may be rendered as a live figure", is no longer true. What is
    still true is everything else: **nothing recurring**. The charge happens
    once, at the tick the command executes, and no system pays anyone on a
    schedule — so ADR 0017 decision 3's standing cost and decision 8's
    insolvency ladder are as unbuilt as before, and a one-off charge
    `Treasury.spend` refuses rather than overdrawing keeps the ladder
    unreachable. A *rate* — a per-day wage bill, a payroll forecast, a running
    cost — is still a figure no system produces and must not be rendered.

    **The two things that credit the treasury, and which of them is an income
    line.** `StateIncomeSystem` (`src/simulation/economy/income.ts`) is the
    income line: ADR 0017 decision 3, on decision 6's basis — the state pays
    per prisoner-day, accrued per occupied place — at 300 minor units a
    prisoner-day, credited once per in-game day on its last tick. The other is
    a cancelled purchase's refund (`ProcurementSystem.cancel`), which is not
    an income line and never was.
    `tests/foundation/documentation-claims-contract.test.ts` pins that this
    paragraph names both.

    **Neither is reachable from a session a player can drive**, for two
    different reasons, and this is the honest state of the money loop:

    - The refund has no *surface* (#285): no command in
      `simulationCommandSchema` cancels a purchase, so nothing in `src/` calls
      `ProcurementSystem.cancel`. Which surface is #285's open decision.
    - The income line has no occupied *place*. Admission is wired (#261 step
      4), so a population is now reachable, but `RoomZoningService` registers a
      zoned room with `capacity: 0`, so a prisoner holds no unit of any
      declared capacity — and 300 × 0 is 0 for as long as that holds. Measured:
      a zoned `room.cell`, one admitted prisoner and 2,500 ticks leave the
      balance at 25,000, `stateIncomeAccruedTodayMinorUnits` at 0 and both
      `roomCapacity` and `roomOccupants` at 0. Capacity is ADR 0028's subject,
      not this change's. Until it lands, both the balance and the "earned
      today" readout beside it are flat.

    So the balance a player can observe still only ever goes down, and a hire
    is now one of the two ways it does. That is not a loss of money in the
    procurement half — a purchase buys stock, an undone build order returns the
    stock it had allocated (#97), and the two together conserve value exactly,
    which `tests/integration/economy-money-conservation.test.ts` asserts in
    integer minor units over the sequences a player can produce. A hire is
    deliberately outside that property rather than a hole in it: what the money
    bought is a staff member, and no command destroys one.
22. **`'on-search'` conflates two duties.** A guard pulled onto a
    contraband search and a guard dispatched to an incident share one
    deployment phase, and neither `SearchSystem` nor
    `IncidentResponseSystem` exposes a guard→job reverse lookup, so a staff
    panel cannot say what a busy guard is actually doing.

### Security

23. **No sector membership model.** Which prisoners, rooms or tiles are in
    a sector is session/scenario knowledge supplied through
    `SectorOccupantResolver`; the simulation does not own it.
24. **Sector risk is withheld by design.** If a "tension" gauge is wanted,
    revealing `SectorRiskTracker`'s score is a product decision about
    exposing a hidden calculation, not a projection gap.

### Contraband

25. **`ConfiscationLedger.drain()` empties the ledger.** A HUD reading
    `all()` is safe, but any consumer that drains it silently blanks the
    panel — and without a drain the ledger grows unbounded over a session.
    There is no non-consuming windowed or capped accessor.
26. **`ContrabandHolder.id` is a string carrying a numeric entity id** for
    `'prisoner'` and `'staff'` holders. Linking a discovered item to a
    roster row means knowing that coupling.
27. **A search order carries no authoring metadata** — no requester, no
    created-at tick, no priority — so a queued order cannot show how long
    it has been waiting for staff.

### Incidents

28. **Terminal incidents are not indexed.** `IncidentLog` indexes open
    incidents only; history is reachable solely through `all()`, which
    materialises every incident ever recorded. An incident-history panel is
    `O(all)` per projection and unbounded over a long session.
29. **`assault` and `escape-attempt` are declared but never triggered.**
    `IncidentTriggerSystem` opens only `riot` and `gang-retaliation`, so
    two of the four incident types are permanently absent from any panel.
30. **No incident-to-responder linkage in the record.**
    `IncidentResponseSystem` keeps response bookkeeping private and drops
    it on restore, so a panel cannot show who is responding.
31. **`TunnelRegistry` has no discovery model.** Escape tunnels are real
    state with nothing saying whether the player knows about one, so a HUD
    cannot decide whether showing it is a spoiler.

### Construction

32a. ~~**Nothing stocks a new session's construction container.**~~
    **Closed for the player, still true of the session's starting state.**
    `createNewSimulationRuntime` wires `ConstructionSystem` to a
    `ContainerMaterialsProvider` over the well-known
    `construction-materials` container and still leaves that container
    **empty**, following the runtime's "no fabricated default content"
    convention — there is no starter stock, no delivery job and no scenario
    that deposits into it. `ProcurementSystem` (#249) is the one thing that
    deposits into it at all, and only for a purchase.

    What changed with #89 is that a player can now make that purchase: the
    Build panel's buy control issues `PurchaseMaterials` (`src/main.ts`), the
    purchase spends from the treasury, and `ProcurementSystem` deposits the
    delivery into that same container some ticks later. So a build order in
    the running app reaches `materials-pending` and then *leaves* it, once the
    player has bought what it needs and the clock has run long enough to
    deliver — the loop `tests/integration/economy-build-loop.test.ts` drives
    end to end. Until then it stayed there for ever, and the cause moved twice
    without the symptom moving at all: first "no supplier", then "no buy
    surface", which `tests/foundation/unconsumed-command-contract.test.ts`
    held as a gated fact until this closed it.

    Tests and fixtures still deposit directly
    (`tests/determinism/snapshot-restore-fidelity.test.ts`,
    `tests/perf/fixtures/prison-fixture.ts`), which is why the original defect
    never showed up as a failure. Whether a fresh prison should *start* with
    materials, or earn them, is a session/economy decision and still unmade;
    what is no longer true is that the wall never comes.

32. **Build costs are material quantities, and that part is real**:
    `BuildableDefinition.materialsRequired` is `{itemId, quantity}` and
    `ContainerMaterialsProvider` genuinely consumes them from a
    `Container`. But `BUILDABLE_REGISTRY` holds exactly two entries, is a
    plain `Map` rather than a validated content catalog, and its
    definitions carry a hard-coded English `name` string instead of a
    `nameKey` — a localization-boundary violation waiting to be rendered.
    `assignedWorkerId` is `'mock-worker-1'` and progress advances a fixed
    `+10` per scheduled tick regardless of workers. No construction
    projection was written for this reason.

    Issue #74 added a Build **panel** without closing this. The panel is
    handed its option list as view-model data — `{definitionId, labelKey,
    occupiesEdge, material?}` — and the id→key mapping lives at the
    composition root (`src/main.ts`) against HUD-namespaced keys, because the
    registry has no `nameKey` to pass through. The registry's own English
    `name` is never read. When a buildable gains a real content key the
    mapping goes away and nothing else changes.

    `material` is #89's addition and is projected from three places at once,
    which is why it too lives at the composition root: the requirement comes
    from `materialsRequired`, the unit price from
    `src/content/procurement-catalog.ts` and the label from the item
    catalog's real `nameKey` — the one part of this list that is not a
    workaround. It carries the *first* requirement anything sells, so a
    buildable made of two materials would get a buy control for one of them;
    both shipped buildables require exactly one, and a multi-material buy
    surface is undesigned rather than implemented and broken.

    There is still **no projection of order state**: the panel submits orders
    and cannot show what happened to them. So a player who has bought
    materials sees the wall appear and is never told that an order was waiting
    for them — which is why the buy control is a control rather than a prompt,
    and why it is offered for whatever is selected rather than "when the
    materials are short". Answering *that* needs a projection of the
    construction container's stock, which no channel carries.

    **The one thing about an order that does now cross is a refusal** (#261,
    section 8 above), and a refused *purchase* crosses beside it. That is one
    fact about one command and not a projection of order state: what travels
    is the last refusal's reason, while the order id, the tile, the definition
    and the item stay behind. A panel that listed orders and their lifecycle
    states still needs the projection this gap describes, and it carries rows,
    so it needs the paging contract too.

    The buy control's own refusals reach the player on **two** surfaces, and
    exactly one of them speaks per press. `src/main.ts` refuses an unpriced
    item, or a total the last published balance cannot cover, *before* the
    command is sent — that rejects the HUD's gated action and paints the
    refusal line on the pressed control. `ProcurementSystem` refuses whatever
    got past that, and it arrives as an alert row once the queued command
    reaches its tick — never while the clock is paused, because a paused clock
    dispatches nothing. The dispatch sits between the two, so a press produces
    one message or the other, never both and never neither. Gap 34 records why
    the difference matters at 720px and below.

### Cross-cutting

33. **Several per-system counters do not survive a restore.**
    `docs/DETERMINISM.md` records that `SearchSystem`, `DeploymentSystem`,
    `PatrolSystem` and `ActionSystem` do not snapshot `requestSequence` and
    that several metrics are not carried. A metrics panel therefore resets
    on load. `RefusalLog` (#261) joins them and does so **deliberately**
    rather than by omission: it holds a notice about an action the player
    took moments ago, not a condition of the prison, so restoring it means a
    loaded prison raising an alert about a wall that failed before the save,
    which nothing can then dismiss (gap 34). Carrying it would be cheap — an
    optional field, no version bump — so the exclusion is about what it would
    buy, and it is written down as such under "What is deliberately excluded
    from the payload" in `docs/PERSISTENCE.md`.

34. **A refusal cannot be dismissed, and carries no location.** The alerts
    row raised by `simulation/status-counts` stands until another refusal
    replaces it or the session ends: the channel is a snapshot, so "the last
    refusal was X" stays true, and there is no way for the HUD to say
    "dismissed" — that needs a main-to-worker message and a piece of
    simulation state to hold the acknowledgement. The refusal also carries no
    tile, order id or item id, so the sentence can say *what* was refused and
    *why* but not *where*; carrying a position would put a second copy of the
    order's location on the boundary and needs a decision about how the HUD
    renders it (highlight the tile? move the camera?).

    Two placement facts belong with this and are measured, not assumed: the
    alerts section starts **folded** (`INITIAL_HUD_SHELL_STATE`), and
    `hud.css` drops `.hud__corner` — which contains the whole alerts region —
    at 720px and below. So a refusal is *reported* rather than *unmissable*,
    and on a phone it is not reported at all. That is the same measurement
    #220 made when it moved the "simulation unavailable" notice out of this
    list and into `.hud__unavailable`. Whether a simulation refusal deserves
    that always-laid-out band as well is a product decision: the band is
    currently bound to a control that was pressed (`data-action`,
    `aria-describedby`), and a refusal decided several ticks later has no
    control to attach to.

    **Since #187 this gap has two producers, and the second raises the stakes
    on the placement half.** An uncorrelated `protocol/error` now paints a row
    here too — the worker rejecting a message it could not decode, the worker's
    own `internal-error` from inside the tick loop, and the main thread's
    inability to read a worker reply (`src/ui/simulation-alerts.ts`,
    [ADR 0024](./adr/0024-protocol-fault-recoverability.md)). Both halves of
    this gap apply to it unchanged: a fault row cannot be dismissed either, and
    it carries no location because a protocol fault has none. What is different
    is what a missed row costs. A missed refusal means the player does not learn
    why one wall was not built; a missed `danger` fault means they do not learn
    that the interface can no longer say what the simulation is doing. ADR 0024
    deliberately does not decide that placement question here — deciding a HUD
    question on the back of a worker one is how the folded row got its second
    producer without anyone re-asking whether folding is right — but it names
    this gap as where the answer belongs.
