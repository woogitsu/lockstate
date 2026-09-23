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
ascending string id in code-unit order, a fixed declared catalog order, or a
declared component field with entity index as the tie-break (the prisoner
roster's descending `riskTier`, issue #703) — never `Map`/`Set` insertion order
and never `localeCompare`
(`docs/DETERMINISM.md`). The test suite builds the same scenario twice with
every incidental registration order reversed and requires byte-identical
canonical JSON from every projection.

`RoomInstanceRegistry.occupantsOf` returns ascending entity id. It returned
insertion order until the accessor was made a function of state
(`tests/determinism/room-occupant-ordering.test.ts`); this layer still sorts
what it gets before projecting, because the projection's own output order is
its contract rather than the registry's, and
`tests/determinism/projection-ordering.test.ts` is the guard that holds that
contract independently of where the occupants came from.

`DoorRegistry.all` sorts by door id since #132, but this layer still never
calls it: doors are looked up by the sector's own sorted `doorIds`.

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
starving prisoner. `BoundedValue` carries **no** severity band — inventing one
would be a balance decision, not a projection.

That sentence used to justify the absent band with "the simulation defines no
warning/critical thresholds for needs", which stopped being true at #488 and is
corrected rather than overwritten (§4 of `docs/AGENT_WORKFLOW.md`). The band
still does not belong on `BoundedValue`, for the better reason: it is shared by
incidents, rooms and occupancy, which the state's grant line means nothing
about. The need-specific fact lives on the need — see
`PrisonerNeedViewModel.unmetForStateIncome` and gap 7.

Incident severity and property damage keep their raw `0–10` rank alongside
a `BoundedValue`, because `incident.ts` documents both as published scales.

### 5. Paging

`ViewModelPage<T>` carries `total`, `offset`, `limit` and only the
requested `rows`. The prisoner roster projects on demand: it walks entity
indices `0..maxActiveIndex` (one `Uint8Array` liveness read each, the walk
ADR 0005 measured at ~0.6 ms for 5,000 entities) and allocates a row object
only for rows inside the window.

**Since 2026-08-31 (issue #703, the owner's fourth ruling) that is two such
walks rather than one**, and the sentence above is amended rather than replaced
because its point — a row object is allocated only for the window — is exactly
what the second walk was written to preserve. The roster is ordered by
descending `riskTier` with ties on ascending entity index, so the first walk
counts the population into one bucket per rank and the second hands each
prisoner its position out of that bucket's cursor. See section 2 below for why
that is not the arbitrary-column sort this document still refuses.

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
publishable on a timer: `simulation/status-counts` (section 8) carries twenty-one
integers and at most one three-field refusal record, so there is nothing here
for this contract to bound. *(The refusal record is four fields since
2026-09-16 and five since 2026-09-22, the fifth being a nested `tile` of two
integers; the sentence is left as written because the property it claims — a
fixed set of scalars, nothing that grows with the prison — is what a tally in
a sentence is standing in for, and that property is exactly as true of five as
of three. `tests/unit/worker-status-counts.test.ts` derives the member list
from `refusalSchema` itself rather than from any number written down, which is
the direction #1304 closed.)* *(Eighteen until issue #585 added `occupiedPlaces`,
the residency places that currently exist, and nineteen until the owner's
ruling 18 of 2026-08-31 added `treasuryOverdraftFloorMinorUnits`, how far below
zero the balance may be taken, and twenty until issue #890 added
`stateIncomeWithheldTodayMinorUnits`, how much of today's grant unmet needs
have kept back — a tally in a sentence, so it is
worth saying that the property being claimed is "a fixed set of scalars", not
the number. `tests/unit/worker-status-counts.test.ts` pins the exact count and
the bytes, which is where the number is actually enforced.)* A projection that carries rows must be paged
before it may be published on a cadence — a per-send cost that grows with the
prison is exactly the failure that cadence was chosen to avoid.

`offset` and `limit` now have a direction to arrive from:
`simulation/request-projection` carries them (section 9), which is what
closes #157 finding 1. The ceiling is `MAX_PROJECTION_PAGE_LIMIT` (500), on
the schema rather than in the handler, so an over-large window never decodes —
without one, "the UI may choose the window" and "the UI may ask for all five
thousand rows" would be the same request.

**The one publication on a cadence that does carry a list, and why it is not a
contradiction.** ADR 0040 slice 1 (#414) publishes `simulation/delta` on a
100 ms ceiling with one **fixed-width** record per live actor. That is a list,
on a timer, whose length grows with the prison — the shape this contract exists
to refuse — and it is admitted here rather than exempted, because what the
contract is actually protecting is the *cost* of the send and this channel
answers it by the record width instead of by `offset`/`limit`:

- The **boundary** cost is flat: an `array-buffer` body is validated by a schema
  id, a content type and a `byteLength` cross-check and is never walked, so
  decoding the whole message measures 0.0049 ms at 500 actors and 0.0051 ms at
  5,000 (`docs/RENDERING.md` carries the table). A paged JSON reply is bounded
  at 500 rows; this is bounded at one comparison.
- The **payload** is 20 bytes an actor: 10,016 bytes at 500 and 100,016 at
  5,000, against 596,659 for the session bundle the renderer used to poll for
  the same fields.

  > **16 bytes, 8,016 and 80,016 until
  > [ADR 0059](./adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)**,
  > which made actors walk and gave the record a sub-tile position, a velocity
  > and a heading to carry — one word more each. The argument the figure is
  > here to support is unchanged and is why the correction is a number rather
  > than a rewrite: an order of magnitude under the bundle it replaced, and the
  > boundary cost beside it is still flat, because a longer buffer is still a
  > buffer nothing walks.
- A **window would be wrong here** in a way it is not for a roster. The receiver
  draws every actor it is told about and culls by camera range; a worker-chosen
  page would be exactly the truncation-the-UI-cannot-scroll this contract
  forbids one paragraph up, and a caller-chosen one would need the renderer to
  know which actors it is missing, which is the base-tick problem in a worse
  place. ADR 0040's answer is the keyframe interval and, in a later slice,
  changed-only records — bounding what is *sent*, rather than bounding what is
  *asked for*. ADR 0059 makes that later slice worth less than it looked:
  a walking actor changes its position every tick, so under locomotion the
  changed set at any moment is every actor in transit rather than the handful
  of arrivals ADR 0040 priced it against.

So the rule stands as written for anything carrying rows of view-model objects,
and this is the recorded exception with the property that replaces it: a payload
the boundary does not walk, at a width that is a constant.

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

**The prisoner roster has one fixed ordering key as of 2026-08-31, and the
paragraph above is narrowed rather than withdrawn** (issue #703, the owner's
fourth ruling: *"the Regime roster sorts by tier instead of by arrival
order"*). `projectPrisonerRoster` orders by descending `riskTier`, ties on
ascending entity index. What the refusal above prices is a **comparison** sort
over a key with as many distinct values as there are prisoners, chosen at
request time; `riskTier` is `0 | 1 | 2 | 3` plus one rank for a prisoner
classification has not run on yet, which is a bucket count rather than a
comparison — `O(n)`, two arrays of at most five numbers, and one extra liveness
walk. Neither an arbitrary column nor a *requested* order exists, and a filter
still does not: the reasons this document gives for both are untouched. What
changed is that after ADR 0080 the tier gates both a contraband introduction
and an escape attempt, so the four rows the Regime panel draws
(`PRISONER_ROSTER_ROW_LIMIT`) had to be the four that matter rather than the
four oldest.

### 6. Withheld state

Two projections deliberately drop state they can see:

- **Contraband.** `ContrabandRegistry` ground truth — every concealed item,
  its holder, its movement history — is never projected. Only the
  confiscation ledger (what was found) and the intelligence ledger (what is
  suspected, uncertainty intact) reach the HUD, matching
  `docs/CONTRABAND.md`.
- **Incidents.** `IncidentRecord.causeFactors` and the `SectorRiskTracker`
  score are withheld by `incident-projection.ts`. The timeline is not
  hidden: it records what visibly happened.
  This sentence used to end *"exactly as `incidents/alerts.ts` already
  withholds them from `IncidentAlert`"*, and both that module and that
  projection are gone — deleted in issue #555 as superseded by this one,
  with the argument kept in `src/simulation/incidents/incident-summary.ts`,
  the file that was `alerts.ts`. The rule has not changed; only the number
  of places applying it has, from two to one.

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
finally gives `HudViewModel.alerts` a producer — and, since the structural
half of #220, `HudViewModel.refusal` as well: the same record is read twice,
once for the log row and once for the always-laid-out band that is the surface
the player actually sees. Gap 34 records why, and what each surface is for. The list, the severity
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
  **A fourth member joined it on 2026-09-16 and the three above are kept as
  written, because they are still the whole of the *record*.**
  `routeDecidedSince` is `true`-or-absent and is not part of the refusal: it
  says whether the **same command route** has decided another outcome since,
  which is a fact about the session rather than about the refusal. Only the
  band reads it (ADR 0091 decision 2, option F, ruled by the owner); the
  alerts list ignores it, and the row is unchanged. It carries no target and
  no coordinates, so the "nothing here grows and nothing here locates" rule
  is untouched.

  **A FIFTH MEMBER JOINED ON 2026-09-22 AND IT IS THE FIRST THING ON THIS
  CHANNEL THAT LOCATES ANYTHING, SO HALF OF THE SENTENCE ABOVE IS NOW
  HISTORY.** Kept rather than rewritten, because the half that moved is the
  interesting one. `tile` is two integers — the coordinate the refused command
  was aimed at — and it is **absent on ten of the sixteen refusal domains**,
  which is the statement rather than a shortfall: six domains (`build.*`,
  `zone.*`, `unzone.*`, `place-object.*`, `remove-object.*`,
  `remove-wall.*`) are aimed somewhere and their supersession keys already
  name a tile or a rectangle; the other ten name an item and a quantity, an
  order id, a role, a person, a schedule boundary or nothing at all. Two of
  those ten hold a tile at the point of record and decline it anyway —
  `admit.*` and `construction.materials-unfunded`, whose refusals are facts
  about the whole prison rather than about where the press landed.

  **"Nothing here grows" is untouched and "nothing here locates" is what was
  given up.** Only the first half is a contract about a cadence, and `tile` is
  fixed-width whatever the prison holds; the second was a description of what
  this record happened to carry, recorded as gap 34 below, and it is that gap
  this member half-closes. It is a **tile and not a rectangle** — for
  `zone.*`/`unzone.*` the rectangle's anchor, not its extent — because the
  only reader the adopted sequence plans is tile-targeted
  ([ADR 0122](./adr/0122-what-an-action-column-is-and-whether-a-message-can-carry-a-next-step.md)
  option D step 4) and this document's own habit is to refuse a member no
  consumer reads.

  **Nothing renders it yet, and no player-visible string moved for it.** ADR
  0122 §7 sequences the payload before the affordance, and its recommendation
  was adopted by the owner on 2026-09-22 as the option labelled *"Naciskany
  wiersz, bez czasownika"* ("a pressable row, without the verb") — provenance
  of the weaker kind, an option label rather than a typed sentence. The four
  `hud.alert.refusal.build.*` sentences that say *"that tile"* are
  deliberately unchanged until something puts a coordinate on the screen.

  **THE FIRST HALF OF THAT PARAGRAPH STOPPED BEING TRUE LATER THE SAME DAY
  AND IS KEPT, BECAUSE IT IS THE STATE THE SEQUENCE PASSED THROUGH.** ADR 0122
  option D steps 3 and 4 landed on 2026-09-22: a refusal row that carries a
  tile is now a real `<button>`, a press on it is one `show-alert-place`
  `HudIntent`, and `src/main.ts` routes that to `WorldScene.navigateToTile`,
  which centres the camera on the tile. So the member has a reader and the
  member is read.

  **The second half did not move, and that is the half that is a reservation.**
  **No player-visible string was authored for the press**, and none is owed:
  the row's accessible name is the catalogue sentence it already carried plus
  the severity word beside it, because `createIcon` marks the glyph
  `aria-hidden` and the row holds nothing else. The four *"that tile"*
  sentences are still unchanged. What would change them is a sentence that
  names a coordinate, and that is `AGENTS.md`'s fourth reservation and
  `docs/LOCALIZATION.md`'s standing instruction, neither of which the 2026-09-22
  ruling touched.

  **One measurement came back with the affordance and belongs here rather than
  only in a test.** ADR 0122 §8 asked whether a pressable row inside a scroll
  container works at 200 % page zoom.
  `tests/browser/ui-alert-row-presses-to-its-place.spec.ts` took that run on
  the assembled page: the press clears `--tap-target` at every combination and
  `.ui-row--interactive` declares that floor for itself, the focus ring is
  drawn **outside** the row (`outline-offset: +2px`, not the inside offset §8
  assumed of this stylesheet), and no dismiss control shares the row because a
  dismissable row never becomes a press. What the run also found is that at
  200 % page zoom **the alerts log is not on screen at any of the six
  viewports that harness measures** — the Overview panel that holds it below
  720 px collapses to a 2 px box and clips its own content — measured
  identically at `--ui-scale: 1` in the same halved viewport and identically
  with the press suppressed, so it is the deferred zero-sum vertical budget
  those twelve `KNOWN_FAILING` combinations share rather than anything the
  press introduced.
- **A stable id, never a sentence** (ADR 0011).
  `hudAlertsFromWorkerMessage` (`src/ui/simulation-alerts.ts`) maps each
  reason onto a `hud.alert.refusal.*` message key through a `Record` over the
  closed union, so a reason added to the protocol fails to compile until it
  has something to say. `hudRefusalFromWorkerMessage` reads the same table for
  the band, so the two surfaces cannot drift apart about what a reason says.
- **It stays up until another refusal replaces it, the session ends, or the
  simulation accepts the very command it refused.** The third case is issue
  #492, and it is not the HUD dismissing anything: nothing on this channel
  can say "dismissed" in the sense of a player gesture, and that still needs
  a main-to-worker message and simulation state to hold it, unbuilt. What
  changed is that `RefusalLog.supersede` (`src/simulation/refusals/`) lets a
  route withdraw its own standing refusal, from inside the same handler that
  would have recorded it, the moment the identical command it once refused
  succeeds — a wall built at the tile it was refused for, a room zoned over
  the rectangle it was refused for. Recorded as gap 34 below, amended rather
  than invented here.

  **That sentence is still true of the alerts list and is no longer the whole
  truth about the band, and it is kept rather than rewritten because the band
  is what moved.** ADR 0091 decision 2 was ruled by the owner on 2026-09-16 as
  **option F**: `.hud__refusal` also retires on a **decided outcome of the
  same route** — the player zones something else, removes something else,
  hires somebody else. The refusal itself is *not* withdrawn (that is #492's
  rule and it decides exactly what it decided before), the alerts list keeps
  the row, and the two surfaces therefore disagree here **on purpose**. That
  divergence is the cost the ruling bought, and it is the split
  `src/ui/simulation-alerts.ts` has claimed in prose since #507 without
  anything making it true. Options D (any route retires it) and B/C (widening
  `supersede` itself) were rejected, the second pair because they turn #492's
  two guarding tests red. The provenance of the ruling is the weaker kind —
  the label of a clickable option, not a typed sentence — and the ADR's Status
  block says so.
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

**The second sentence expired on 2026-08-31 and the first one did not, which is
the useful half.** The owner ruled (issue #703, ruling 1) that the alerts
section starts *open*, and the same change gave the list a bounded box with
`overflow-y: auto` so it scrolls instead of letting its `.ui-panel` ancestor
clip the newest row — measured before that fix: at 900×600 four of eight rows
were inside the panel and they were the four **oldest**. So above 720px a row in
that list is now laid out and reachable. **Below 720px it still is not**:
`hud.css` still drops `.hud__corner`, and ruling 5 asked for that to change
before the attempt was withdrawn on measurement — the stretched rail shares the
corner's grid area there, so the Intake panel's *Admit* button covered the
Alerts fold header. `hud.css` carries the numbers.

**None of that moves the distinction above.** The alerts list carries refusals;
an accepted designation is not one. Visibility is what made the taxonomy
*urgent* in 2026-08; the taxonomy is what makes it right, and that argument
never depended on the fold.

- **Two enums and two integers, and no room id.** `{ sequence, tick,
  enclosure, requirement }`, where `enclosure` is what the world answered for
  the rectangle (`'sealed'` / `'open'`) and `requirement` is what the room
  definition asked for (`'enclosed'` / `'outdoors'` / `'none'`). The pair is
  what makes the notice self-describing: the main thread does not have to
  remember which room type was selected when the player released the pointer.
  Neither value is a message key and neither is a sentence, so ADR 0011's
  separation is untouched — `src/ui/hud/rooms-panel.ts` decides which sentence
  the pair deserves.

  **This bullet used to end "and the one combination worth warning about
  (`enclosed` asked for, `open` found) is about the pair rather than either
  member".** That pair no longer reaches an accepted designation: `zone` refuses
  it (the ADR *"Must a zoned room be enclosed"*), so the panel's warning, its
  `hud.rooms.enclosure-open-required` key and its English text are deleted, and
  the sentence is `hud.alert.refusal.zone.not-enclosed` on the refusal channel
  instead. What an accepted notice can now carry is `sealed` against anything,
  or `open` against `outdoors`/`none` — every one of them correct, so the panel
  reads them out and tones none of them.
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
- **It is a readout of an accepted designation, and the refusal is a separate
  channel.** This bullet used to read *"It refuses nothing.
  `src/simulation/rooms/enclosure.ts` states in full why the simulation cannot
  honestly refuse on this answer"*, and the owner has ruled otherwise. `zone`
  refuses an `enclosed` room whose perimeter is open, under
  `zone.not-enclosed`, which travels on `RefusalLog` like every other refusal;
  this notice still carries only what was *accepted*. Gap 14 below records what
  the wider, topological question would still need — and no longer waits on it,
  because `enclosed` now means "this room's own boundary is closed".

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
- ~~**A prisoner capacity.**~~ **Closed, and the reason it was open was
  half wrong.** This bullet read: *"`counts.roomCapacity` sums every registered
  room instance — canteens and yards included — and the HUD's occupancy bar is
  documented as *cell* capacity with an over-capacity warning behind it. The
  simulation has no cell-only total, so `HudCountsViewModel.prisonerCapacity`
  stays `0` and the strip omits the bar rather than drawing a wrong
  denominator."*

  **A canteen and a yard contribute nothing to `roomCapacity`**, and never
  did. `deriveRoomCapacity` (`src/simulation/objects/room-capacity.ts`) credits
  `residentCapacity` only for an object whose capabilities include
  `'sleep-surface'`; a bench, a dining table and a shower head declare none, so
  a 40-seat canteen adds 0. **Since issue #961 that sum is also capped** at the
  room type's authored `maxResidents` where it declares one -- `room.cell` 2,
  `room.solitary-cell` 1 -- so a cell with four beds in it contributes 2 rather
  than 4. The *conclusion* was right for the reason the
  bullet's own last clause named: `object.medical-bed` declares
  `'sleep-surface'` too, so `roomCapacity` counts a furnished infirmary's beds
  while `IntakeSystem` will never house anybody in one.

  The channel now carries `accommodationCapacity` beside `roomCapacity` — the
  summed `residentCapacity` of the room instances the session's
  `AccommodationPolicy` names, which is `room.cell` and `room.solitary-cell`
  under the shipped policy — and `HudCountsViewModel.prisonerCapacity` maps
  straight from it. The bar and `occupancyTone`'s over-capacity warning are on,
  which matters because ADR 0048 made overcrowding the thing a prison riots
  over. `roomCapacity` stays exactly what it was: the Rooms readout's total,
  with no reader in `src/ui/` yet.

#### The edit-history pair it also carries (#1370)

A fourth field beside `counts`, `refusal` and `zoning`: `editHistory`, two
booleans saying whether a press of `Undo` and a press of `Redo` would each do
something the player is told about. The status strip's Undo and Redo buttons
(#1356) are marked `aria-disabled` on it; before it existed they were always
live, because the edit history is `ConstructionSystem`'s and nothing carried
anything about it across the boundary.

- **What each bit means is the command handler's, not this channel's.**
  `editHistoryAvailability` in `src/simulation/construction/handler.ts`
  computes it, and `true` means dispatching the command now would record an
  event: `construction.undone` (or its spend-destroyed sibling),
  `construction.redone`, or ADR 0104's `construction.undo-refused-newer-action`.
  A refused Undo is therefore *available* — it is a press with an answer.
  `tests/unit/construction-edit-history-availability.test.ts` holds the pair to
  the handler by pressing and reading the event log.
- **Narrower than "the stack is not empty", on purpose.** A transaction whose
  every order has failed stays on the stack and `undo()` pops it silently; a
  wall typed onto a tile outside the prison is the ordinary way to make one,
  because a placement refused on its content is still registered on its
  transaction. `ConstructionSystem.undoWouldReverseSomething` reads the
  transaction `undo()` would reach and asks `isCancellable`, as `undo()` does.
- **A level, not an event**, unlike its two siblings — so it is **required**
  rather than optional. Their absence states a fact ("nothing refused",
  "nothing designated"); an absent pair could state nothing `false, false`
  does not.
- **It opens the interval gate when either bit changes**, on the refusal's
  terms: it is the answer to the player's own press, and a change happens only
  when a command or an order failing on its own moves the history — bounded by
  how fast a player can press. `_publishedEditHistory` in
  `src/simulation/worker/state-machine.ts` is the watermark.
- **Derived, and not in the save.** The stacks are in `ConstructionSnapshot`
  and this is a function of them and of the order states beside them.
- **On the main thread**, `hudEditHistoryFromWorkerMessage`
  (`src/ui/simulation-counts.ts`) copies it into `HudViewModel.editHistory` on
  the three-state contract `overview` uses: a pair, `'none'` for a stopped
  session, `undefined` for a message that said nothing. **Absent is "no
  opinion"**, and the strip removes `aria-disabled` rather than writing
  `"false"` for it. The `disabled` property is never written — `createBusyGroup`
  owns it, and a hard disable would let a verdict one publication stale
  swallow a press the worker would honour.

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
   `projectionId` from a closed vocabulary (`PROJECTION_IDS`, fifteen members),
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
- **And what makes the main thread ask is the clock heartbeat, not the counts.**
  Corrected 2026-09-01 (issue #718). Every reader below is introduced as riding
  *"the counts cadence"*, and six sentences in this section said so; the
  composition root's nine comments said it with a number, *"up to 500ms for the
  next counts publication"*. **All of them were false the day they were
  written.** `src/main.ts:2164` opens **one** listener for every worker-to-main
  message, and its early return (`src/main.ts:2244-2253`) fires only when all
  six of its translators say nothing. `hudClockFromWorkerMessage`
  (`src/ui/simulation-clock.ts:22-57`) has no "nothing changed" arm — it
  returns a view model for *every* `simulation/clock-state` — so every one of
  those falls through to the refresh block at `src/main.ts:2355-2364`, which
  calls ten refreshers. (**Those three citations read `1702`, `1735-1740` and
  `1795-1804` until 2026-09-02 and `1781`, `1822-1830` and `1886-1894` until
  2026-09-15, and the block this sentence called "nine-call" at both of those
  readings now makes ten calls** — every one of them had rotted; the quoted
  sentences are unchanged, which is why the quotations are the durable half and
  the line numbers are not.) `publishClockState` posts one at most every 250 ms
  and only when the tick has moved
  (`src/simulation/worker/state-machine.ts:454-478`), which is twice the rate
  of the counts channel and, crucially, **not change-gated on the counts**.

  Measured on the **harness** (`SimulationWorkerStateMachine`, fake timers, no
  render thread) over 30 simulated seconds at ×1, classifying every posted
  message by the composition root's own six translators: a prison with **no
  occupied place publishes `simulation/status-counts` exactly once** and
  refreshes its readouts **120 times**, worst gap **255 ms**; a housed prison
  publishes 59 and refreshes 178. The mutation says why this is load-bearing
  rather than incidental — remove the clock term from that predicate and the
  same two prisons refresh **once in thirty seconds**, which is issue #718's
  reported symptom exactly.

  **255 ms is the harness figure and understates what a player actually waits
  by about 18% (issue #765).** PR #762 (`73996787d4`) ran the no-occupied-place
  scenario in a real browser instead
  (`tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts`), four
  runs of 30 s: **118, 118, 118, 119 requests** — the harness's "120 times"
  confirmed almost exactly — but **46-58 of the ~118 gaps exceeded 260 ms**,
  median gap **253-260 ms**, and a **tail of 292.8-299.6 ms**. The honest
  figure for "worst gap" in a browser is **up to roughly 300 ms**, not 255;
  [ADR 0086](./adr/0086-what-refreshes-a-pulled-hud-readout.md) **§5's** own
  260 ms bound is falsified by the same data (see that ADR's amendment,
  not yet accepted).

  **That last clause said "§2's own 260 ms bound" until 2026-09-02 and named
  the wrong section**, which inverted the very distinction this paragraph
  exists to keep: §2 is the *mechanism* and the same four runs **confirm** it —
  118 requests against a counts channel that published once. What is falsified
  is §5's *prediction*, "no gap above 260 ms".

  **And §5's 260 ms and §3's 255 ms are one claim at two numbers**, which is
  why one measurement falsified both: 255 ms is exact and 260 was §5 rounding
  it up before predicting against it. **255 ms is arithmetic, not an
  observation** — `publishClockState` can publish only on a tick-loop wake and
  `startTickLoop` wakes on `setInterval(..., 15)`, so the gap is
  `ceil(CLOCK_STATE_PUBLISH_INTERVAL_MS / 15) * 15` = 255, a function of two
  constants of which only one has a name.
  `tests/foundation/hud-refresh-cadence-contract.test.ts` verifies it by
  mutation: the interval at 200 gives 210. In a browser that arithmetic is a
  **floor** rather than a bound — it bounds the worker's publication grid under
  punctual timers, and a player's wait adds timer lateness, the worker's
  per-wake work and the main thread's delivery, none of which any constant here
  bounds. **"Up to roughly 300 ms" is therefore a sample maximum over four
  30-second runs on one four-core container, not a bound**: the right figure to
  budget against and the wrong one to promise. `docs/BENCHMARKING.md` is why no
  gate in this repository can assert it.

  **What each of those six sentences was reaching for is still true** and is why
  they are corrected rather than deleted: none of these readouts is refreshed
  only on arrival, and each rides a cadence that already exists rather than a
  timer of its own. What was wrong is *which* cadence, and the number. The
  decision about whether that heartbeat should be the deliberate contract is
  [ADR 0086](./adr/0086-what-refreshes-a-pulled-hud-readout.md), Proposed;
  it also carries the inventory of every pulled readout and what moves each one.
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

**The first consumers, and what is still unpainted.** The route had no reader
for as long as #104 had shipped it — the gate above recorded that state as
`UNPAINTED_ROUTE` and was written to fail the day a module under `src/ui/`
started using it, which is what happened. `src/ui/simulation-room-needs.ts`
reads `hud/room-list` and, for the rooms it says are unfinished,
`hud/room-detail`, so the Rooms panel can tell the player what a zoned room is
missing; the composition root asks while the Rooms tab is the one showing, on
the refresh cadence the bullet above corrects (this sentence read *"on the
`simulation/status-counts` cadence"*), and `RoomNeedsReader.read` refuses to
stack so a slow answer cannot queue a second question. The gate's entry is gone
and its assertion now runs the other way: there must be a reader, and deleting
the last one fails.

`src/ui/simulation-build-queue.ts` is the second, on identical terms —
`hud/build-queue`, while the Build tab is showing, on the refresh cadence
corrected above, refusing to stack — and it is the one worth naming separately, because it is the
first time this channel made a **command** reachable rather than a readout.
`CancelBuildOrder` names an `orderId`; no order id reached the main thread at
all, so nothing could aim it, and
`tests/foundation/unconsumed-command-contract.test.ts` carried it as the
repository's last command with no production producer for as long as that gate
had existed. It asks for the panel's own row budget rather than the default
window, because the block draws three rows and a hundred would be ninety-odd
built for nothing twice a second.

`src/ui/simulation-intake.ts` is the third, on the same three terms —
`hud/prisoner-population`, while the Overview tab is showing, on the refresh
cadence corrected above, refusing to stack — and it is the first that is about *people* rather
than about the building. It asks for no window at all, because that projection
is declared `paged: false` and the worker refuses `offset`/`limit` on a
projection with no list rather than ignoring them; the reply is six stage counts
whatever the population, which is the same shape that makes the status counts
publishable (contract 5).

What it carries is a fact the prison already knew and no surface had: an arrival
that has been classified and is waiting for somewhere to sleep is **not**
refused. `IntakeSystem` keeps the stage and retries it, and it is the state a
zoned cell with no bed in it produces, because a room with no bed derives
`residentCapacity: 0` (ADR 0028 decision 8). The status strip counts that
prisoner among the population all the while, so a press of Admit moved a number
and explained nothing. The readout names the stage the arrivals are at and, in a
separate sentence, the terminal `failed` stage — which is terminal in the
stronger sense that nothing the player builds afterwards releases those
arrivals, so summing the two would promise a fix that does not exist. It narrows
gap 12a rather than closing it: *how many* are waiting is now on screen, *how
long* (`accommodationBacklogTicks`) and *why* a particular arrival failed are
still read by nothing.

**Since issue #549 this projection also carries `waitingWithoutPlace`**, and it
is a different question from every stage count beside it: how many of the
arrivals at `accommodation-assignment` the prison has **no free place for right
now**, computed by subtracting each accommodation target's unoccupied resident
capacity from the arrivals holding out for that target. It exists because the
stage count could not be used for a warning. Every arrival passes through that
stage — `IntakeSystem` advances one stage per scheduled tick, so an arrival sits
there for a whole interval before anybody looks for a bed — so a signal keyed on
it fires on a prison that is working. Measured on this tree: two arrivals
admitted at one tick into a two-bed cell read `accommodation-assignment: 2` for
five ticks and `waitingWithoutPlace: 0` throughout.

That is what made the Intake panel's standing note false rather than merely
imprecise. It said *"A prisoner can only be admitted into a prison that has a
room to hold them"*, and `IntakeSystem.hasAccommodationTarget` asks whether the
prison holds an *instance* of a housing room type and never whether a place in
one is free — so a played prison with one bed accepted twelve admissions, housed
one, and left eleven at Cell Assignment with nothing on screen saying so. The
note now states both halves of what the control needs, and
`hud.intake.no-place` states what the press costs when the prison is full.

`src/ui/simulation-pending-deliveries.ts` is the fourth, on the same three terms
as the build queue -- `hud/pending-deliveries`, while the Build tab is showing, on
the refresh cadence corrected above, asking for the panel's own three-row window
rather than the default hundred -- and it is the second time this channel is what makes a
*command* reachable rather than a readout. The difference from the queue's is what
was unreachable behind it: not a control, but a **credit**.

`ProcurementSystem.cancel` refunds the recorded `paidMinorUnits` of a delivery
that has not landed, exactly, and it is one of only three things in the simulation
that credit the treasury at all (gap 21) — **this sentence read "only two" until
ADR 0075 decision 2's `LoanBook.draw` became the third**, and gap 21 carries the
enumeration. Every caller in the repository was a
test -- `grep -rn "procurement\.cancel" src/` found nothing -- because no command
named a purchase, and a command could not usefully have named one: a purchase
`orderId` is minted on the main thread by the press that spends the money and then
forgotten, exactly as a build order id was before `hud/build-queue`. So money
spent on a delivery a player had changed their mind about was unrecoverable by
any means the interface offered (#285), and nothing on screen said it was in
transit either.

What this read model carries is therefore two things a player can act on: the
**purchase ids**, which `CancelMaterialPurchase` names, and
`refundableMinorUnits` -- what every pending delivery together would give back.
The status strip's Funds readout says what is *left*; this is the first figure in
the interface that says what is *out*. It needs no new persisted state and no
save-schema version: `pendingDeliveries` is a public accessor over the list
`snapshot`/`restore` already carry, and `economySectionSchema` already types every
field of it.

`src/ui/simulation-held-guards.ts` is the fifth, on the same three terms --
`hud/held-guards`, while the Security tab is showing, on the refresh cadence
corrected above, asking for the panel's own three-row window rather than the default hundred -- and
it is the **third** time this channel is what makes a *command* reachable rather
than a readout. What was unreachable behind it was neither a control nor a credit
but a **release** ([ADR 0034](./adr/0034-releasing-a-claimed-guard.md), answering
[ADR 0033](./adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
open question 3).

`GuardRoster.unassign` has been complete since #26, and every caller of it in
`src/` sits *inside the system that made the claim being released*, each firing
only when that system decides the claim is over. So a claim whose owner had lost
track of it was permanent -- which is exactly what #352 was, measured at four
guards and one sector still held 53,000 ticks after a restore. A guard id is a
staff `EntityId` minted inside the simulation and it never reached the main thread
at all: `hud/staff` was catalogued and read by nobody. (It has **two** readers
now -- the sixth below takes its `totals` rather than the roster, and
`src/ui/simulation-staff-roster.ts` takes a row window for `DismissStaff`
(#533). Neither affects the paragraph after this one: a coverage figure cannot
say which of the two `'on-search'` claimants holds a guard, and neither can a
roster row, because both read `assignment.deploymentPhase` and that is exactly
the field the next paragraph is about. `DismissStaff` does not need to know --
it dismisses whoever the row names and lets `GuardReleaseService` resolve the
claim inside the simulation -- which is why the roster block could be built on
a projection the release command could not use.)

**And `hud/staff` would not have been enough even if it had been read**, which is
where this differs from the queue's case and the deliveries'. It carries
`assignment.deploymentPhase`, and `'on-search'` is a *shared* phase with exactly
two producers -- so a row saying "On Search" cannot say whether the guard is on a
contraband search or in a riot, and those are different decisions. This read model
resolves the claim through `GuardReleaseService.claimOf`, **the same function the
release itself uses**, so a row and the press on it cannot disagree about what is
being released.

It needs no new persisted state and no save-schema version: everything it reads is
`security.guards.records` and the live claim views of the two `'on-search'`
claimants, all of which a V5 save has held all along.

`src/ui/simulation-staff-coverage.ts` is the sixth, on the same three terms --
`hud/staff`, while the Security tab is showing, on the refresh cadence corrected
above -- and it
is the first whose subject is neither a readout of what the prison holds nor an
id a control aims at, but a **warning**
([ADR 0048](./adr/0048-what-a-sectors-occupants-are.md) consequence 1). Its
window is `limit: 0`, which is the panel's-own-budget rule taken to its floor:
the coverage block draws no roster row, and `StaffViewModel.totals` is summed
over the whole roster regardless of the page, so a window of zero returns every
figure it uses and no row it would discard.

ADR 0048 made a riot reachable in a prison a player can build and scaled
`requiredGuardCount` with occupancy -- one guard per eight prisoners standing on
owned land, as a floor over whatever the `DeploymentSchedule` authored. Its own
Consequences record what that left undone: `StaffCoverageRowViewModel` carried
`required`/`assigned`/`shortage` per sector and **no panel rendered any of it**,
so the requirement rising from 1 to 2 at the ninth prisoner -- the clearest
warning the simulation produces -- was computed and invisible. Measured on this
tree in a 12-bed prison driven through the real command path with nobody hired:
the report reads `required: 1, assigned: 0, shortage: 1` from the first
admission through the eighth and `required: 2, assigned: 0, shortage: 2` **on
the tick the ninth is admitted**, 12,788 ticks before that prison's first riot at
tick 13,200. Hiring answers it in 20 ticks -- `DeploymentSystem` runs every ten,
so a hire standing on the post tile is assigned on the next update -- which is
what makes the readout a control surface rather than a caption.

It carries the summed `totals` rather than the per-sector `coverage` rows,
because `applyDefaultSecuritySector` derives exactly one sector for every session
a player can start (ADR 0036), so a per-sector list would be a list that always
has one row. The totals survive a second sector: `projectStaff` sums the
per-sector shortfalls rather than netting the requirement against the headcount,
so a prison with one sector over-staffed and another short still reports a
shortage. What stops being answerable then is *which* sector is short, which is a
breakdown to add on the day a player can draw one.

**One** of the fifteen catalogued read models still has a route and nobody on
the end of it: **fourteen are read, by thirteen modules.** Both numbers are stated
because the difference between them is what made an earlier sentence wrong.
An older one said ten, having counted reader *modules* rather than read models —
`src/ui/simulation-room-needs.ts` asks for two, `hud/room-list` and
`hud/room-detail` — and the pair is restated rather than one half edited,
because the pair is what a reader checks.

**This paragraph read "**Eight** … **seven are read, by six modules**" until
2026-09-01, and both halves had been overtaken by the two readers on the fifth
tab.** `src/ui/simulation-regime.ts` reads `hud/status-strip` and
`src/ui/simulation-prisoner-roster.ts` reads `hud/prisoner-roster` (issue #451,
the Regime panel), which is +2 read and −2 unread; the two counts then happen
to coincide at nine because `simulation-room-needs.ts` reads two models and
`hud/staff` has two readers, and those cancel. The correction is marked rather
than overwritten because the *shape* of the old sentence was right and only its
arithmetic rotted — exactly what `docs/AGENT_WORKFLOW.md` §4 says a tally does.

**And it read "**Six** … **nine are read, by nine modules**" until 2026-09-03,
overtaken the same way by the reader under the roster.**
`src/ui/simulation-prisoner-detail.ts` reads `hud/prisoner-detail` (issue #895,
the inspector), which is +1 read and −1 unread, and the two counts stay
coincidentally equal because it is one module asking for one id. The direction
is marked rather than overwritten for the reason the correction above gives,
and because this is the first of the five that #157 found *waiting on a
selection model* to actually get a reader — the entry blocking it named "no
selection state, no highlight and no inspector", and a panel-local selection
answered two of those three. There is still no highlight: nothing in
`src/rendering/` marks the selected prisoner in the world, and nothing anywhere
maps a world position to an entity.

**And it read "**Five** … **ten are read, by ten modules**" until 2026-09-17,
overtaken by the Security section — which is the largest single move this tally
has made and the first where the two counts move by different amounts.** The
owner ruled that day that the four remaining HUD read models get a navigation
section of their own, and `src/ui/hud/security-panel.ts` paints them through
three readers: `src/ui/simulation-security.ts` (`hud/security`),
`src/ui/simulation-incidents.ts` (`hud/incidents` **and**
`hud/incident-detail`, the pair) and `src/ui/simulation-contraband.ts`
(`hud/contraband`). So read models moved +4 and reader modules +3, and the
coincidence the two paragraphs above depend on — that the counts happen to stay
equal — ended here rather than being restated. The direction is marked rather
than overwritten for the reason those corrections give.

The fourteen with a reader are `hud/status-strip`, `hud/build-queue`,
`hud/pending-deliveries`, `hud/held-guards`, `hud/prisoner-population`,
`hud/prisoner-roster`, `hud/prisoner-detail`, `hud/room-list`, `hud/room-detail`,
`hud/staff`, `hud/security`, `hud/incidents`, `hud/incident-detail` and
`hud/contraband`; a
`grep -rl "'hud/<id>'" src/ui/` per id is the whole derivation. The one without
one is **`world/render-snapshot`** — which is worth naming rather than assumed read, because the world is
plainly on screen: `SimulationSnapshotFeed` reaches it through
`simulation/request-snapshot` (`src/rendering/feed/simulation-snapshot-feed.ts:450`)
and not through this channel at all, which is why it has a cadence of its own
and why that cadence is the only worked precedent this repository has for
[ADR 0086](./adr/0086-what-refreshes-a-pulled-hud-readout.md)'s question.

`tests/foundation/projection-reachability-contract.test.ts` carries the same
sentence and is not corrected here; it is another agent's surface.

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

7. **No need *warning* thresholds.** Nothing defines "warning" or "critical"
   for a player, so a need bar cannot be banded without a balance decision.

   **Narrowed, not closed, by #443.** The simulation now has exactly one line
   it acts on: `STATE_INCOME_UNMET_NEED_LEVEL` (51, a fifth of `NEED_MAX`) is
   the level at or below which the state withholds part of that prisoner's
   day of the operating grant. That is a statement about what the state
   declines to pay for, not about what a player should be alarmed by, and the
   two are deliberately separate — but it is the fact this gap was waiting
   for. #477 put it exactly: *"a need warning threshold is a statement to a
   player about what is bad, and on today's numbers the honest statement would
   call 'bad' a condition that costs a staffed prison nothing … fix the cost
   first, then the threshold has something true to say."* The cost exists; the
   threshold is still the owner's, and so is whether it should be this one.

   What the interface would need, if the owner wants the mechanic to be fair
   rather than merely correct, is named in
   [ADR 0064](./adr/0064-what-an-unmet-need-costs-a-prison.md): which
   needs are unmet **per prisoner**, what that is costing **per day**, and
   which room would fix it. The first is already projected
   (`PrisonerDetailViewModel.needs`), the second is derivable from figures the
   status strip already carries, and the third exists nowhere.

   **The middle clause is false, and it is kept rather than rewritten because
   it is an instruction to the next implementer and the instruction is the
   defect** (`docs/AGENT_WORKFLOW.md` §4). *"the second is derivable from
   figures the status strip already carries"* tells a reader to subtract one
   grant from another in the HUD. Re-measured 2026-09-15 on `2559eb14` it fails
   for two independent reasons, and either one alone is enough.

   1. **The strip does not carry the headline rate, and the HUD may not go and
      fetch it.** What `projectStatusStrip` publishes is the *prorated* grant --
      `stateIncomeAccruedTodayMinorUnits`, which is
      `stateIncomeForOccupiedPlaces` folded through `stateIncomeAccruedByTick`,
      so the withholding is already inside it -- and the count,
      `occupiedPlaces`. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` is declared
      in `src/simulation/economy/income.ts` and reaches no payload in
      `src/simulation/protocol/types.ts`, and
      `tests/unit/ui-hud-messages.test.ts`'s *"imports nothing from the
      simulation"* forbids every module under `src/ui/hud/` from importing it
      (`AGENTS.md` boundary 1). Hard-coding 300 beside the projection is the
      drift `status-strip-projection.ts`'s own comment refuses in the
      neighbouring case: *"Deriving it from the count instead would be a chip
      that promises money the day boundary then does not pay."*
   2. **The subtraction is not exact, so even given the rate it is the wrong
      arithmetic.** `stateIncomeAccruedByTick` floors --
      `floorDiv(dailyGrantMinorUnits * ticksServed, DAY_LENGTH_TICKS)` -- and
      flooring does not distribute over subtraction. For the smallest prison
      that can show it, one occupied place with one unmet need, a 300 headline
      against the 260 actually accrued: `accrued(300) - accrued(260)` differs
      from `accrued(300 - 260)` at **1,320 of the day's 2,400 ticks**, computed
      on today's constants. The discrepancy is exactly one minor unit, and it
      is **zero at the payment tick** (`tickOfDay === DAY_LENGTH_TICKS - 1`,
      where the numerator divides by 2,400 exactly) -- which is what makes it
      dangerous rather than obvious, because a test written at a day boundary
      agrees with it and the chip is still wrong for 1,320 ticks of every day.

   So the second of ADR 0064's three is **not** derivable from what the channel
   carries: it is a figure the simulation would have to project beside the two
   it already does, computed where the withholding is computed.

   **It now does, and the paragraph above is kept rather than rewritten
   because the instruction in it is still the one a reader needs**
   (`docs/AGENT_WORKFLOW.md` §4). `stateIncomeWithheldTodayMinorUnits` is
   published from `projectStatusStrip` as of issue #890 —
   `stateIncomeAccruedByTick(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS x
   occupied places, tick)` less `stateIncomeAccruedTodayMinorUnits` — and the
   `Earned today` chip carries it as a description, so ADR 0064's second of
   three reaches a player. Reason 2 above was re-derived on the two prisons
   `tests/integration/needs-state-grant-loop.test.ts` builds rather than on
   the smallest case: at eight occupied places with three unmet needs each the
   two orderings disagree at **2,240 of 2,400 ticks**, and a mutation using
   the wrong one goes red at tick 0 while the day-boundary case stays green —
   which is the trap this entry predicted, reproduced.

   **The third of the three — which room would fix it — still exists
   nowhere**, and what is *not* settled is loudness: whether the withheld
   figure should also be a badge visible without hovering is the owner's, and
   #890 holds it.

   **Half-answered by #535 decision 6, and the half that moved is the first
   one.** `PrisonerNeedViewModel` now carries `unmetForStateIncome` — computed
   by `isNeedUnmetForStateIncome`, the same predicate `unmetNeedCount` sums to
   compute the money, so the readout and the treasury cannot drift — and the
   Regime panel's roster draws each prisoner's worst need as a bar toned off
   that flag. So "which needs are unmet per prisoner" is projected rather than
   merely derivable, and the roster answers it for the worst one at a glance.

   **This did not close the gap and did not decide the threshold.** The bar is
   toned `warning` and never `danger`, and what that tone means is *the state
   is withholding grant for this need* — a promise `stateIncomeForPrisonerDay`
   keeps — not *this prisoner is in danger*, which nothing in the simulation
   says. The player-facing "your prisoners are unhappy" line is still the
   owner's, and so is still whether it should be this one. The second and third
   items above are untouched: nothing says what neglect is costing per day in
   the prison's own money, and nothing names the room that would fix it.

   **The first item is now answered for a whole prisoner rather than for their
   worst need (issue #895), and the sentence above that called it "already
   projected" is what changed.** `PrisonerDetailViewModel.needs` was projected
   and read by nobody; `src/ui/simulation-prisoner-detail.ts` reads it, and the
   Regime panel draws all six needs of a selected prisoner with the same flag
   per need. That matters to *this* gap specifically, because the state
   withholds **per unmet need** — `unmetNeedCount` is the multiplier — so the
   roster's single bar could only ever say whether that count was at least one,
   and the inspector shows the count's composition. What is still owed is
   unchanged and is unchanged deliberately: no threshold is decided, no need is
   called critical, and neither the per-day money nor the room that would fix it
   is anywhere on screen.
8. **No need trend.** Only the current level exists; nothing records recent
   history, so a panel cannot show rising/falling.
9. **No health, injury or medical status.** Incidents produce
   `injuredEntityIds`, but nothing writes injury onto a prisoner.
10. **Position updates only on arrival.** `ActionSystem` moves a prisoner
    onto the destination anchor tile when a route resolves and never in
    between, so a travelling prisoner's projected tile is stale and a map
    dot will jump rather than walk.
11. **Room membership is not derivable from position** *— narrowed by ADR
    0028 phase 1, not closed.* A `RoomInstance` now carries `width` and
    `height`, so "is this tile inside this room" *is* answerable, and
    `roomInstanceContaining` (`src/simulation/objects/room-capacity.ts`)
    answers it by narrowing the tile to a room type through the zoning plane
    and then testing the rectangle. That is what gives object placement a
    containment rule.

    What is still unanswered is the *projection* question: nothing projects
    the room a prisoner is standing in. The detail projection still reports
    the room a prisoner is *performing an action in*, which is a different
    fact — a prisoner walking to the canteen is in neither room by that
    reading — and joining the two would mean projecting a position against
    every rectangle on a cadence.
12. **No release date in player units.** `sentenceEndTick` exists but only
    after classification, and there is no served/remaining breakdown.
12a. **Nothing projects why an admission failed, or how long one has been
    waiting** *— narrowed by the Intake panel's readout (section 9), not
    closed.* `hud/prisoner-population` now reaches a surface, so **how many**
    arrivals are at each stage is on screen: a prison holding one zoned cell
    and three arrivals says two are at cell assignment, and a terminal
    failure gets a sentence of its own. What is still unread is the rest of
    this gap. `IntakeMetrics` (`completedCount`, `failedCount`,
    `accommodationBacklogTicks`) has no reader anywhere in `src/` outside
    `IntakeSystem` itself, so a prisoner stuck at
    `accommodation-assignment` for an in-game week is still
    indistinguishable on screen from one who arrived a tick ago, and nothing
    projects *why* a particular arrival failed — only that one did.
    **Narrowed again by #549, in one direction only and not the one named
    above.** `waitingWithoutPlace` now separates an arrival the prison has a
    bed for from one it does not, which is the difference a player can act on;
    *how long* anybody has been waiting is still `accommodationBacklogTicks`,
    still cumulative ticks over the whole prison rather than per arrival, and
    still published nowhere. This is why #261 step 4 puts the
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
12b. **Closed: whether a `total: 0` roster means "never admitted" or "fully
    discharged."** Issue #506 measured this live -- five prisoners admitted,
    served the sentence `ADMISSION_REQUEST`'s fixed `sentenceLengthTicks`
    gives every one of them, and discharged within the same window (ADR
    0050 "What this does not decide"), and the Regime panel's roster-empty
    sentence, "Nobody has been admitted yet", was shown over that prison as
    though nobody ever had been. **That sentence reads "No prisoners yet.
    Build a cell — big enough, walled all round, with a bed and a toilet in
    it — to take somebody in." since the owner's ruling of 2026-09-03 as
    corrected in place on their ruling of 2026-09-19 (#933)**; the wording
    quoted above is what was measured and is kept as the record, and the two
    states this gap is about are unmoved by either change. `projectPrisonerRoster` now carries
    `everAdmitted` (`PrisonerOperationsRuntime.admittedCount > 0`,
    `prisoner-projection.ts`), read at the one door every real admission
    passes through, so the two states are distinguishable at the projection
    for the first time.

    **What is still true, and is not this gap re-opening:** `admittedCount`
    is observability-only and not persisted, the same shape gap 33 already
    names for `PrisonerDischargeSystem.dischargedCount` and `IntakeMetrics`
    — a session restored from a save whose prison was populated and then
    fully emptied *before* the save reads `everAdmitted: false` once more,
    for exactly as long as it takes to admit and discharge again in the
    restored session. And the panel itself still authors no sentence for the
    "fully discharged" state: `regime-panel.ts`'s `paintRoster` draws
    neither the empty-roster sentence, which is false of it, nor an invented
    replacement there, because the sentence that should replace it is a new
    player-facing string and `AGENTS.md`'s fourth exclusion keeps that the
    owner's. **The owner's ruling of 2026-09-03 settled the sentence for the
    *never admitted* state and not this one** -- the sentence quoted above is
    false of a prison that emptied out for one more reason than its
    predecessor was, because the cell it tells the player to build is already
    standing. So this half of the gap is
    unclosed and is owed to the owner as its own sentence.

### Rooms

13. **Object placement exists, and `minQuantity` is counted** *— both
    halves of this gap are now closed, the second at #528.*

    It read "object placement does not exist. No system tracks which objects
    are physically in which room; `RoomInstance.objectCapabilities` is
    declared at registration." Both sentences are now false.
    `PlacedObjectRegistry` holds one row per object with a tile index over
    every footprint tile, `RoomCapacityResolver` turns the objects inside a
    room's rectangle into its two capacities and its capability list, and
    nothing declares any of the three at registration — ADR 0028 phase 1.

    So `roomCapacity` on the strip moves for the first time: a zoned cell
    with a bed in it reads `1`, and a zoned cell with nothing in it still
    reads `0`, which is the same true state it always was. What a player sees
    is in that ADR's phase 1 section.

    **`minQuantity` is read, and the paragraph that stood here said it was
    not.** What it said: *"`minQuantity` is still uncheckable, and the reason
    has changed. Objects are individuated, so counting the beds in a cell is
    possible for the first time; what is missing is that `room-projection.ts`
    is not handed the placed objects, only the instance's derived capability
    list. Wiring that is phase 4's, which is when a second object type makes a
    quantity mean something. Until then an `object` requirement still reads
    `'satisfied-by-capability'` or `'missing-capability'` and never a count —
    so a cell with a bed and no toilet reads `'missing-capability'` on the
    toilet, which is exactly why ADR 0028 names phase 2 as the milestone rather
    than phase 1."*

    **What is true.** Phase 4 landed at `b097e70` on 2026-08-26 (#384) and did
    not wire it. That commit's own ADR section says so — *"gap 13 stayed
    half-answerable rather than becoming answered: `requirementStatus` still
    compares capabilities and never counts objects, so one chair still
    satisfies a classroom's requirement for four"*, calling the counting *"a
    mechanism, not a row"* — so the deferral above named a phase that had
    already shipped without it, and the sentence was **false from `b097e70`
    onwards** rather than merely stale. Issue #528 is what a player then saw:
    `room.canteen` asks for two dining tables and four benches, and one of each
    read the room finished, while the room's footprint-derived `'dining'`
    ceiling seated three diners rather than six.

    `RoomProjectionOptions.placedObjects` is that wiring, supplied by
    `src/simulation/worker/projection-catalog.ts` on both `hud/room-list` and
    `hud/room-detail`. An `object` requirement is satisfied when the room holds
    at least `minQuantity` objects whose own catalogue capabilities cover the
    required object's — the containment rule
    `src/simulation/construction/definition.ts` already states about the
    buildable rows, so a security console counts toward a desk requirement and
    a desk does not count toward a console requirement. The last clause above
    is unchanged: a cell with a bed and no toilet reads `'missing-capability'`
    on the toilet, which is why ADR 0028 names phase 2 as the milestone rather
    than phase 1.

    **The capability test survives where there is nothing to count**, and only
    there: an instance with no recorded rectangle (a V4 save; gap 11) contains
    nothing this projection can attribute to it, and a caller that supplies no
    `placedObjects` — every test that registers `objectCapabilities` by hand —
    has handed it nothing to attribute. Both answer from the instance's
    capability list and ignore `minQuantity`, exactly as before #528, because
    reporting a furnished room as empty would be worse than the weaker answer.
    That is the same shape and the same reason as
    `RoomInstanceRegistry.concurrentUseCapacityFor`'s third case.

    **Phase 2 has landed and both of `room.cell`'s `object` requirements can
    now read `'satisfied-by-capability'`** — measured in
    `tests/integration/furnished-cell-loop.test.ts`, off two real construction
    orders rather than a hand-registered instance. **The verdict is now on
    screen**, and this paragraph used to say the opposite: it read "no HUD
    surface consumes either verdict … the difference between a finished cell
    and an unfinished one is computable and off screen". It was true for as
    long as nothing under `src/ui/` requested a projection.
    `src/ui/simulation-room-needs.ts` requests `hud/room-list` and, for the
    rooms whose `requirementSummary.missingCapability` is above zero,
    `hud/room-detail` — so the Rooms panel reads out which rooms are unfinished
    and names one thing one of them wants, from the object's own `nameKey`. The
    panel re-derives nothing: `'missing-capability'` is asked for and rendered,
    which is what keeps the rule that gates an admission from acquiring a second
    definition on the main thread.

    **This is part of ADR 0028 phase 5 and not the whole of it**, which is worth
    saying plainly rather than letting the phase read as closed. Phase 5 owes
    three things: a surface for the verdict, the *room-level* verdict ADR 0023
    §4 argues for — one answer per room rather than counts — and "over
    capacity", which `RoomOccupancyViewModel` still cannot express because
    `free` clamps at zero and `utilization` clamps at 1. Only the first has
    landed. The other two are changes to what the projection publishes, not to
    what the panel asks for.

    **Two corrections to the paragraph above, 2026-09-05, and it is kept
    because its list is what the phase is measured against.** First, the list
    is short by one item: phase 5 also owes the **concurrent-use** figure, which
    ADR 0028's phase 5 section names in the same breath and which
    `room-projection.ts` recorded against itself as *"not projected at all
    yet"*. That one has now landed — `RoomListRowViewModel.concurrentUse`
    publishes one ceiling per capability with `useOccupancyOf`'s live count
    against each, and the Rooms panel reads the full rooms out under an "At
    capacity" header (#997, #1003). Second, *"`RoomOccupancyViewModel` still
    cannot express"* over-capacity does not follow from the clamping it cites:
    `current` and `capacity` are both published raw, so `current > capacity` is
    derivable by any reader, and only `free` and `utilization` clamp. The gap
    is a **surface**, not a field — which changes who owes it. So of the four
    items, two have landed (the surface, the concurrent-use figure) and two have
    not (the room-level verdict, an over-capacity readout).

    The per-requirement quantity is now *evaluated* but still not *read out*,
    and the sentence that stood here denied both halves — it read *"The
    per-requirement quantity above is unchanged too: the readout says a cell
    needs a toilet, never how many."* The second clause is still exactly true
    and is the one a player feels: since #528 the projection knows a canteen is
    two dining tables short, and the panel still says only that it needs a
    dining table. Naming the number is a new player-facing sentence and
    therefore the owner's (`AGENTS.md`, fourth exclusion); it is issue #529.

    The readout counts unfinished rooms and names one unmet requirement, because
    a single line is what the panel's height budget affords at 900×600 —
    `ROOM_NEEDS_NAMED_LIMIT` in `src/ui/hud/rooms-panel.ts` carries the
    measurement, including what a three-row version did to the panel's fold.

    **That budget is now measured per host rather than as one number, because
    the panel has more than one place to put something** (ADR 0038, #411).
    Growing a fixed-height block in each candidate until the panel's height, its
    fold gap or any of `.hud-rooms > .ui-panel__body`, `.hud-rooms__catalogue`
    and the catalogue's `.ui-section__body` moves, in the state this readout is
    showing: the panel body affords **32px at 1280×720 and 0px at 900×600**, the
    catalogue section's body **41px and 4px**, and `.hud-rooms__list` at least
    400px at both — the list being the one box here that is meant to hold more
    than it shows. A collapsed section header is 44px, so anything that must be
    *always* visible is refused at both viewports and the scroller is the only
    answer. The typed route to a rectangle is inside it for exactly that reason,
    and costs this readout nothing: with the form folded and with it open, the
    panel's height, fold gap and last block's bottom edge are identical to their
    figures before it existed, at all six viewports.

    **Two of the three area requirements this gap listed as
    `'not-evaluated'` are now evaluated**, and by the zoning service rather
    than by a projection — which is why they are recorded here rather than
    removing the gap. The Rooms tab (ADR 0022, amended) needed both:

    - `minimum-size` is *enforced*. `RoomZoningService.zone` reads the
      authored `minWidth`, `minHeight` and `minTiles` through
      `src/simulation/rooms/requirements.ts` and refuses
      `below-minimum-size`. Before it, a 1×1 canteen was a legal room.
    - `enclosed` is *enforced too*, and this line used to say the opposite.
      It read *"`enclosed` / `outdoors` is **reported**, not enforced ... It
      refuses nothing, because the check is narrower than enclosure, and
      because it runs at designation time while the walls usually go up
      afterwards."* The owner ruled that `roomPerimeterEnclosure` is not to
      stay advisory, and `RoomZoningService.zone` now refuses
      `not-enclosed` for a definition authoring `enclosed` whose rectangle's
      own perimeter is open. The ADR *"Must a zoned room be enclosed"* is the
      decision, and what it settles is also the *meaning* of `enclosed`: this
      room's own boundary is closed, rather than this room is topologically
      indoors — against which the check is exact rather than narrow.

      **`outdoors` is still only reported**, and deliberately: a walled
      exercise yard is an ordinary prison yard, and `outdoors` is a claim about
      a roof, which this world model does not represent. `none` likewise.

      (This bullet also used to note that `edgeNumericIdFor` wrote `0` for
      `door-wooden`, so no sealed room could have a way in; a completed door
      order now writes `DOOR_EDGE_NUMERIC_ID` and registers a real door, so a
      sealed room with a door in it is exactly what the check reports — and
      that is what keeps the refusal above from making every room a box nobody
      can enter.) Gap 14 below is the wider question.

    `object` requirements are gated on the *derived* capability list since
    ADR 0028 phase 1 rather than on a declared one, which changes where the
    answer comes from and not what it can say.
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
    *this* room still big enough / still enclosed" has no answer. The
    *geometry* is no longer the obstacle — a `RoomInstance` carries its
    rectangle since ADR 0028 phase 1 (gap 11) — so re-checking the authored
    minimum against a registered instance is now cheap rather than blocked;
    what is missing is a decision about what a room that has become too small
    should do, which that ADR leaves open.

    The wider *topological* enclosure question is unanswered, and it is no
    longer on anyone's critical path: `enclosed` is defined as "this room's own
    boundary is closed" (the ADR *"Must a zoned room be enclosed"*), which the
    rectangle predicate answers exactly. It is recorded here because a future
    decision could want the topological reading back as a **widening** — letting
    a sub-room inside a sealed hall through — and because its two obstacles are
    worth naming either way: `TopologyManager` does region *detection* and
    exposes no enclosure query, and `TopologyManager.update()` has **no caller
    anywhere in `src/`** — it is constructed in `runtime/new-session.ts` and
    absent from the `registerSystem` block beside it, so `getTopologyId` answers
    `0` for every tile in a running session. A region id alone would not be
    enough either: a region reaching the edge of the materialised world is
    indistinguishable from one bounded by walls there.
15. **`RoomInstanceRegistry` has no `all()` or `size()`.** Enumeration
    fans out over catalog room ids, so an instance registered under a
    room-catalog id the catalog does not define is invisible to the room
    list and to the status strip's room count.

    > **The last clause under-states what this reaches, corrected
    > 2026-09-15 and marked rather than rewritten.** "The room list and the
    > status strip's room count" are readouts, and the sentence reads as if a
    > blind spot here only costs a display. It also costs a **decision**:
    > `counts.roomCapacity` is summed over the same fan-out, and
    > `src/ui/hud/projection.ts`, `src/ui/hud/build-panel.ts` and
    > `src/ui/hud/staff-panel.ts` each derive "is this prison fresh and
    > unfurnished" from `roomCapacity === 0` — the predicate ADR 0017's
    > "Amendment, 2026-09-01" defines as
    > `RoomInstanceRegistry.totalResidentCapacity === 0`, which is a different
    > question with a different answer. The registry's own docblock already
    > names this gap as the reason a structural gate asks the registry
    > directly; the host cannot, because the registry figure is never put on
    > the wire. Measured consequence and the reason it is not fixed in place
    > are in that amendment's §2.
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
21. **`wageBand` is read at hire *and* on a schedule, and the payroll exists —
    what is missing is the panel.** This gap has now been narrowed twice and
    both narrowings are marked rather than overwritten, because the sentence it
    keeps producing is the one that rots.

    Its first form said "no wage is ever debited" and "nothing wage-related may
    be rendered as a live figure". That stopped being true when the Staff panel
    rendered `wageBand.minPerDay` on the button that spends it
    ([ADR 0025](./adr/0025-guard-hiring-surface.md) decision 2).

    Its second form said: *"What is still true is everything else: **nothing
    recurring**. The charge happens once, at the tick the command executes, and
    no system pays anyone on a schedule — so ADR 0017 decision 3's standing cost
    and decision 8's insolvency ladder are as unbuilt as before […] A rate — a
    per-day wage bill, a payroll forecast, a running cost — is still a figure no
    system produces and must not be rendered."* Every clause of that is now
    false. `PayrollSystem` (`src/simulation/economy/payroll.ts`,
    [ADR 0042](./adr/0042-attaching-consequences-to-the-simulation-loop.md)
    step 3) bills every employee's authored wage at the end of every in-game
    day; `simulation/status-counts` carries both `dailyWageBillMinorUnits` —
    which *is* the rate the old sentence forbade — and `unpaidWagesMinorUnits`,
    the arrears
    ([ADR 0049](./adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)).
    Decision 8's ladder is reachable: a real session can empty its treasury and
    start owing wages, and does so in
    `tests/integration/economy-payroll-loop.test.ts`.

    **What is still a gap is the surface.** No locale key names a running cost
    or an arrears figure, and none may be added before something renders the
    figure it names — a label authored ahead of its readout is `AGENTS.md`'s
    fourth exclusion, and `src/content/default-locale-en.ts` says so at the
    `hud.status.*` block with `tests/unit/ui-hud-messages.test.ts` as the gate.
    Two integers are on the channel and nothing on screen reads them, which is
    the narrower and more accurate form of this gap: **the figures exist, the
    panel does not.** A *forecast* — anything projecting the balance forward —
    is still a figure no system produces and must not be rendered.

    **The three things that credit the treasury, and which of them is an
    income line.** `StateIncomeSystem` (`src/simulation/economy/income.ts`) is
    the income line: ADR 0017 decision 3, on decision 6's basis — the state
    pays per prisoner-day, accrued per occupied place — at 300 minor units a
    prisoner-day less what unmet needs withhold, credited once per in-game day
    on its last tick. **Unmet needs withhold nothing as of 2026-09-03**, the
    repository owner having suspended the share at `0` while they play and
    judge difficulty ([ADR 0064](./adr/0064-what-an-unmet-need-costs-a-prison.md)'s
    amendment of that date carries their words); the clause is kept rather than
    cut because the arithmetic it describes is unchanged and only its rate is
    (`docs/AGENT_WORKFLOW.md` §4). The second is a cancelled purchase's refund
    (`ProcurementSystem.cancel`), which is not an income line and never was.

    **The third arrived with [ADR 0075](./adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
    decision 2 and is not an income line either: a loan drawdown**
    (`LoanBook.draw`, `src/simulation/economy/loans.ts`). That decision
    requires the distinction to reach the player rather than only this
    paragraph — *"a ledger where the operating net is negative while cash
    rises is a loan masking a deficit, and the player should be able to see
    the difference"* — so a readout that adds a drawdown to income would be
    the defect the sentence names, and **no such readout exists yet**: nothing
    in `src/ui/` reads a loan, no locale key names one, and none may be added
    before the figure it names is rendered. **Two of the three are still
    unreachable from a session a player can drive**, and the loan is the one
    that is unreachable at the *command* boundary: `simulationCommandSchema`
    has no member that draws one, so a loan can only be opened by a fixture.
    Whoever gives it a surface is choosing player-facing wording, which
    `AGENTS.md` reserves to the owner.

    `tests/foundation/documentation-claims-contract.test.ts` pins that this
    paragraph names all three.

    **Unmet needs withhold 40 again, and have since 2026-09-04.** The sentence
    three paragraphs up -- *"**Unmet needs withhold nothing as of
    2026-09-03**"* -- is the state of the game for one day and not a standing
    fact: the owner restored
    `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `40` on 2026-09-04,
    after the two measurements they had made the restoration conditional on.
    Both rulings are in that constant's own docblock in
    `src/simulation/economy/income.ts`, and the restoration reached the source
    at `3134a78e`. The suspended reading is kept rather than cut for exactly
    the §4 reason it was itself written under: it happened, and a document that
    erases it cannot show that this rate is a dial the owner turns rather than
    a constant of the design.

    **That correction reached `src/` on the day and did not reach this file for
    eleven days, and the asymmetry is worth naming because it is where this
    repository's documentation rot actually comes from.** Three consumers of
    that constant mark both directions in their own comments --
    `src/simulation/protocol/types.ts` (*"There were no 40s to attribute
    between 2026-09-03 and 2026-09-04, and there are again"*),
    `src/ui/hud/regime-panel.ts`, and
    `src/simulation/presentation/prisoner-projection.ts` (*"it stopped being
    true on 2026-09-03 ... and it is true again since they restored it to `40`
    on 2026-09-04"*) -- as does
    `tests/integration/economy-bed-recycling.test.ts`, which numbers the moves
    of its own literal and calls the restoration *"the fifth move ... the first
    that is a return rather than a step"*. Every one of those is a file the
    restoring change had to open. Nothing made that change open a document.
    **A ruling recorded in a code comment is carried by the next edit of that
    code; a ruling recorded in `docs/` is carried by nobody** -- so a change
    that moves an authored constant should be assumed to have left every
    document naming its value behind, and `grep` for the value is the whole of
    the check.

    **A fourth crediting *event* arrived with the owner's ruling 20 of
    2026-08-31, and it does not move the file list that gate checks, which is
    why it is written out here by hand.**
    [ADR 0076](./adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
    amendment of that date -- *"Anulowanie zwraca pieniądze zamiast cegieł"* --
    makes cancelling a build order before its crew starts give the **money**
    back. It reaches the treasury through two calls that were already in
    `src/simulation/economy/procurement.ts`: `ProcurementSystem.cancel`, for a
    just-in-time delivery the cancellation made surplus, and
    `ProcurementSystem.refundMaterials`, which is new and sells an allocated
    order's materials back at the catalogue price. **The second of those gained
    a second caller with
    [#717](https://github.com/matmaxalez/lockstate/issues/717), and the
    sentence above is kept because it is what ruling 20 shipped.** The owner
    took ADR 0076's own open question -- *"whether surplus stock can be sold
    back"* -- on **2026-09-02**, in the broad reading and with the measured
    cost in front of them, so `refundMaterials` now also sells back the stock a
    cancelled `'approved'` or `'materials-pending'` order's demand left on the
    shelf, bounded by that order's own requirement
    (`JustInTimeMaterialsService.refundSurplusStock`). **No file and no count
    moved**: it is the same call in the same file, so *three sites* and *four
    events* stand, which is why this is a marked sentence rather than a new
    bullet. `ProcurementSystem.previewRefundMaterials` is not a fifth of
    anything either -- it is the pure formula `refundMaterials` is built on and
    credits nothing, which is the whole reason a projection may ask it. **Neither is an income
    line** -- both are the prison's own money coming back, exactly as a
    cancelled purchase's refund is -- so neither is diverted to a loan under
    ADR 0075 decision 2, and neither may be added to a readout that shows
    income. The count in the heading above therefore stays *three sites* and
    becomes *four events*, and the distinction is the one the gate cannot make:
    it scans for files, and the fourth event is in a file the list already
    names.

    **Both are now reachable from a session a player can drive.** This section
    used to say neither was, then that one was: the income half was changed by
    ADR 0028 rather than by anything in the money loop, and the refund half by
    #285's surface. Both are recorded here because each was, at some point, a
    credit path the documentation described and no session could produce:

    - **The refund is reachable, and it has a surface.** This bullet used to read
      "the refund has no *surface* (#285): no command in
      `simulationCommandSchema` cancels a purchase, so nothing in `src/` calls
      `ProcurementSystem.cancel`", and both halves of that are now false.
      `CancelMaterialPurchase` is that command, `createSessionCommandHandler`
      routes it to `ProcurementSystem.cancel`, and the Build panel's buy
      disclosure lists what is on the way with a Cancel per delivery -- read over
      `hud/pending-deliveries` (section 9), which is what carries the purchase ids
      back to the thread that mints them. #285's decision was resolution 2, a
      purchase-cancel command with its own surface.

      Two properties of it are worth keeping here rather than only in the code.
      The refund is the **recorded** `paidMinorUnits` and never a recomputation,
      so no buy-low-cancel-high trade exists even once prices move. And a
      cancellation whose delivery has already landed is **refused rather than
      swallowed** (`cancel-purchase.not-pending`): crediting a delivered purchase
      would hand back the money while the materials stayed in the container, which
      is value created out of a button press -- mutation M1 of
      `tests/integration/economy-money-conservation.test.ts`. The balance
      returning to exactly its prior figure is asserted in integer minor units by
      `tests/integration/economy-purchase-cancellation.test.ts`.

      **A third property was added by [#687](https://github.com/matmaxalez/lockstate/issues/687),
      and the two above are kept rather than rewritten because neither has
      stopped being true.** They describe the refund; what #687 measured is that
      for one kind of delivery the refund did not *last*. #640 made a build
      order buy its own materials, so the fold now lists deliveries the build
      queue bought as well as ones the player pressed *Buy* for, and cancelling
      one of the first kind left the order that had caused it queued and still
      wanting the material: with the clock stopped a fifteen-segment wall run
      refunded in full, `23,800 -> 24,760`, and six seconds after *Play* the
      treasury read `23,800` again. The fold's own sentence, *"15 bought - 1,200
      back if cancelled"*, was true when it was read and false a moment later,
      and nothing on screen said so. So `CancelMaterialPurchase` now also
      **withdraws** queued build orders -- the fewest that make the prison stop
      having to buy the material back, decided against what it already holds and
      has coming rather than against the cancelled quantity, and taken from the
      back of the crew's own walk. **That walk was ascending id when this
      paragraph was written and is placement order with id as the tie-break
      since [ADR 0082](./adr/0082-what-order-build-orders-are-carried-out-in.md)
      (#722)**, so the back of it is now the segment the player drew last rather
      than the one holding the greatest id; the method is unchanged, only what
      "the back" means. **Only for a delivery the build
      queue bought** (`isJustInTimePurchaseOrderId`): a delivery the player
      pressed *Buy* for is stock they chose to hold, and no order is waiting on
      it by name. Gated by
      `tests/integration/economy-refund-survives-the-clock.test.ts`, and the
      conservation equation across the whole sequence by the `#687` case in
      `tests/integration/economy-money-conservation.test.ts`.

      **"The fold" in the paragraph above stopped being a fold on 2026-08-31**
      (issue #703 ruling 2). It is kept as written, because what it describes is
      where those rows were and the sentence *"15 bought · 1,200 back if
      cancelled"* is unchanged copy — but that list, that sentence and the
      `Cancel` #687's fix hangs on are now laid out on the Build panel itself,
      with nothing opened. Measured before the move, on the real page with a
      six-segment wall run and the fold shut: `data-pending="24"`, three filled
      rows, the correct refundable total, and a `0x0` box
      (`docs/research/2026-08-31-playing-the-nine-changes.md` §1b) — so for a
      `jit:` delivery, which is the only kind #687's withdrawal applies to, the
      refund had no trigger a player could reach.

      **Two things about that were asserted without a measurement behind them
      and have since been measured; both are corrections to the claims rather
      than to the behaviour.** *Which* segment a player watches disappear was
      guessed to be *"somewhere in the middle of the line"* -- it **was** the
      tile holding the greatest id, whose ordinal position in a run of
      `order-${crypto.randomUUID()}` ids is uniform, so it was as likely to be
      either end, and the measured fixture took the segment the player drew
      **first**. **ADR 0082 (#722) closed that on 2026-08-31 and it is now the
      segment the player drew last**, which is what #693 had claimed and could
      not deliver; the account above is kept because it is what every build
      before that did, and is still what a save carrying no placement ordinals
      does. And *"cancelling a delivery the player pressed Buy for is
      correct, only the fold's sentence is false"* holds in a prison that can
      pay: the refund goes out again at the same price, the same segments stand,
      and the whole cost is one delivery delay restarted. It does **not** hold
      in a prison that cannot pay in one lump, where cancelling such a delivery
      stalls the queue it was part-funding -- see
      `src/simulation/economy/just-in-time-materials.ts` for that one, which is
      a question about money and not about a projection.
    - **The income line pays.** It used to have no occupied *place*:
      `RoomZoningService` registered a zoned room with `capacity: 0`, so a
      prisoner held no unit of any declared capacity and 300 × 0 was 0 in every
      session a player could start. Capacity is now derived from the objects
      standing in the room (ADR 0028 phase 1,
      `src/simulation/objects/room-capacity.ts`), so a cell holds as many
      prisoners as it has beds. Measured through the real commands and the real
      kernel: one plank bought, a `bed-wooden` placed in a zoned `room.cell`,
      and the instance reads `residentCapacity: 1` with
      `objectCapabilities: ['sleep-surface']`; an admitted prisoner reaches
      `completed` and occupies it; the balance moves *up* by 300 on the day's
      last tick. `tests/integration/object-placement-loop.test.ts` asserts all
      of it in literals, including the closing balance as `25_000 - 65 + 300`.

    So the balance a player can observe no longer only goes down — it rises
    once per in-game day per occupied place, and the "earned today" readout
    beside it is no longer flat. A hire remains one of the two ways it falls.
    Neither direction is a loss of money in the procurement half: a purchase
    buys stock, an undone build order returns the stock it had allocated (#97),
    and the two together conserve value exactly, which
    `tests/integration/economy-money-conservation.test.ts` asserts in integer
    minor units over the sequences a player can produce. A hire is deliberately
    outside that property rather than a hole in it: what the money bought is a
    staff member, and no command destroys one.
22. **`'on-search'` conflates two duties.** A guard pulled onto a
    contraband search and a guard dispatched to an incident share one
    deployment phase, and neither `SearchSystem` nor
    `IncidentResponseSystem` exposes a guard→job reverse lookup, so a staff
    panel cannot say what a busy guard is actually doing.

### Security

23. **No sector membership model a *panel* can read.** Which prisoners, rooms
    or tiles are in a sector is supplied to the simulation through
    `SectorOccupantResolver`, and no projection publishes the answer.

    **The simulation half of this gap closed** with
    [ADR 0048](./adr/0048-what-a-sectors-occupants-are.md): the derived sector
    is the prison, so its occupants are every prisoner standing on owned land
    (`src/simulation/security/sector-occupancy.ts`). This entry used to say the
    resolver "counts prisoners standing exactly on its post tile — which
    happens to be the arrival tile, so it finds the arrivals a full prison
    cannot house", and that was true and was the defect: a *housed* prisoner
    was in no sector at all.

    What is still missing is the projection. A room's `security` block stays
    absent because `RoomProjectionOptions.sectorIdByRoomInstanceId` is never
    supplied, and a **room**-to-sector map is a different question from a
    prisoner-to-sector one — ADR 0048 answers the second and declines the
    first, because a room has an extent and a sector still does not.

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

    **Half of that sentence stopped being true and the half that did is the
    cheaper half, which is why the entry is amended rather than closed.**
    `projectIncidents` used to build a whole `IncidentRowViewModel` for every
    terminal incident and then hand the array to `pageOf`, which kept `limit`
    of them and dropped the rest — so a request showing four rows built one
    per finished incident, each with a bounded-value record, an optional
    outcome record and a `requiredResponderCount` call on the response source.
    It now carries a terminal **ordinal** through the same walk and calls
    `projectRow` only inside the window, which is the shape
    `projectPrisonerRoster` already used (*"materialise only the ones the
    window asked for"*). The page is unchanged: same records, same order, same
    `total`/`offset`/`limit`.

    **What is still open is the walk itself**, and it is the part that needs
    the index this entry is named for: the aggregate `projectIncidents`
    reports — `summary`, `countsByState`, `countsByType` — is a fold over
    every record, so `all()` is still called and still materialises the log.
    Closing that is a change to `IncidentLog`, not to the projection.
29. **~~`assault` and `escape-attempt` are declared but never triggered.~~
    Closed by [ADR 0061](./adr/0061-what-the-prison-produces-on-its-own.md).**
    `IncidentTriggerSystem` opened only `riot` and `gang-retaliation`, so two
    of the four types were permanently absent from every panel. Both now have
    producers reading real prisoner state, `gang-retaliation` is the one member
    of the union left without one, and the labels these rows need were already
    in `simulation-message-keys.ts` waiting for them. **What is not closed is
    the gap one layer up**, and ADR 0061 open question 2 records it beside
    ADR 0057's: nothing on screen says *which* prisoners are in an incident, so
    a player sees that an assault happened and not to whom.
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

    **Amended 2026-08-30 (#627): the sentence above about the player having to
    buy first is now false, and the paragraph is kept rather than rewritten
    because the sequence it describes is what the defect was.** It read *"a
    build order in the running app reaches `materials-pending` and then
    *leaves* it, once the player has bought what it needs"*, and that "once
    the player has bought" was a **requirement the game never stated**. The
    owner met it live: forty wall orders, 25,000 untouched, nothing built, and
    the word *material* appearing nowhere on the visible HUD. ADR 0017
    decision 7 had already ruled the other way — *"materials are just-in-time
    by default; holding is permitted, never required"* — so the code and an
    accepted decision had disagreed since #249.

    A build order now **buys what it needs**, at the press, from the treasury,
    at catalogue price (`JustInTimeMaterialsService`,
    `ConstructionProcurementSink`). A player who pre-buys sees no change: the
    deficit nets off both stock held and deliveries already paid for. What a
    fresh prison *starts* with is still unmade and still a session/economy
    decision; what changed is that starting with nothing is no longer a dead
    end.

32b. **`hud/build-queue` says whether the queue is stalled on money** —
    `BuildQueueViewModel.materialsFunding`, added with #627. It carries
    `unfunded`, a `shortfallMinorUnits` total, and the per-item quantities and
    costs behind it, all in ascending item id.

    **Not derivable from the rows, which is the whole reason it exists.**
    Since a build order procures for itself, `'materials-pending'` means two
    different things that a player cannot separate: *the lorry is on its way*,
    which resolves itself in ten scheduled ticks, and *the prison could not
    pay*, which resolves itself never. Both draw the identical row.

    It answers the standing directive in
    [#629](https://github.com/matmaxalez/lockstate/issues/629) — *"a mechanic
    the player must discover in order to proceed is a defect"* — at the level
    this document owns, which is the payload. **What is owed above it is a
    player-facing sentence, and that is the owner's** (`AGENTS.md`): the
    shortfall reaches the alert band today only as
    `purchase.insufficient-funds`, *"The materials were not ordered — there
    are not enough funds."* — true, shipped, and authored by nobody for this
    route. A `build.*`-namespaced sentence could name the wall as well as the
    money, and would need a new `RefusalReason` member, a new
    `hud.alert.refusal.build.*` key and its English text.

    **The quoted sentence is not the shipped one as of 2026-08-31 and the
    paragraph is otherwise unchanged.** The owner's ruling 23 gave
    `purchase.insufficient-funds` the host's words for the same refusal —
    *"Nothing was bought — that would go past what the state will carry."* —
    so it now names the overdraft floor rather than an absence of funds. What
    is owed here is the same thing it was: a sentence that names the *wall*,
    which is still a new `RefusalReason` member, a new
    `hud.alert.refusal.build.*` key and new copy, and still the owner's.
    **Amended 2026-09-01, and half of what the paragraph above calls owed is
    now paid.** The owner ruled that a stalled build queue gets a sentence of
    its own, accepting the plumbing the paragraph above priced: there is a new
    `RefusalReason` member, `construction.materials-unfunded`, a new
    `REFUSAL_LABEL_KEYS` entry and a new key,
    `hud.alert.refusal.construction.materials-unfunded`, reading *"The build
    queue is stalled — no more materials until the prison earns the money."*
    (that tail read *"until the state pays what it owes"* until 2026-09-04,
    when issue #913 measured the state owing nothing to a prison that is not
    earning; ruling 19's requirement — name what stops, not the number it
    stops at — is what the replacement keeps)
    `reportMaterialsFunding` records that instead of
    `purchase.insufficient-funds`, so rung 2's event no longer reports rung
    1's sentence. What is **still** owed is the other half: the sentence names
    the queue and not the *wall*, because `RefusalLog` carries no order id or
    definition id, and it does not say what a partial pass did buy. ADR 0081's
    open question 2 is unchanged.


    **Amended 2026-08-30: the payload now reaches the main thread, and the
    paragraph above described only half of where it stopped.** It said what is
    owed is a sentence, which is true and is still true — but between the
    projection and any sentence there was a second break nobody had recorded.
    `buildQueueFromProjection` mapped the rows and the two counts and dropped
    `materialsFunding` on the floor: `HudBuildQueueViewModel` had no member to
    receive it, so the figure crossed the worker boundary inside the
    projection's JSON and was discarded on arrival. Found by playing, on the
    branch that added it — #640's playtest, PR #655, section *"The shortfall
    figure exists on the wire and reaches no pixel"*. Cited by title rather
    than by path: that research document is on the playtest's own branch and
    not yet on this one.

    `HudBuildQueueViewModel.materialsFunding` now carries `unfunded` and
    `shortfallMinorUnits` — the projection's `items` list is deliberately not
    carried, because naming an item needs the catalogue lookup
    `HudPendingDeliveryViewModel.labelKey` needs and nothing asks for it yet.

    **Amended again, the same day, and the sentence directly above this one was
    true for about an hour.** It said *"Nothing renders it… the sentence is the
    owner's"*, and both halves have been overtaken rather than one: the owner
    wrote the sentence, and the panel now draws it. It is
    `hud.build.queue-shortfall`, **authored by the owner and used verbatim** —
    *"Waiting for {total} to buy materials."* — and `{total}` is
    `shortfallMinorUnits` through `localizer.formatNumber`, in the same minor
    units as `hud.status.funds`, which is the comparison this figure was
    computed for.

    Two things about *where* it draws, because both were decided by a defect
    this document already records:

    - **Outside the fold.** It is appended to the Build panel's body after the
      queue section, not to the section's body. `queueSection` opens collapsed,
      and #625 is the record of what putting a requirement inside it costs —
      *"Awaiting Materials"* was there and reached nobody. Asserted at all six
      viewports in `tests/browser/ui-build-queue.spec.ts` with the fold shut and
      never toggled.

      **The third application of that rule in this panel landed on 2026-08-31**
      (issue #703 ruling 2): the pending-deliveries block came out of the *Buy*
      fold the same way and for the same reason, so the spend #640 makes for the
      player and the `Cancel` that reverses it are laid out without a press.
      Asserted at 1920x1080, 1440x900, 1280x800, 900x600 and 375x812 in
      `tests/browser/build-deliveries-outside-the-fold.spec.ts`, on `/index.html`
      with the fold never opened.
    - **Kept off screen entirely when the queue is paid for**, box and all.
      `.hud-build__note` carries an author `display: -webkit-box`, which beats
      the user agent's `[hidden] { display: none }`, so the line needs
      `.hud-build__queue-shortfall[hidden]` in `hud.css` or a solvent prison
      gets a permanent empty line under its queue — the same trap
      `.hud-build__queue-more[hidden]` already closes.

    **The wording settled one open question in passing, and it is worth recording
    that it did.** The sentence names no material, so the two scalars above are
    the right width and `items` stays uncarried — which had been reported as the
    weakest claim of the change that added them.

32. **Build costs are material quantities, and that part is real**:
    `BuildableDefinition.materialsRequired` is `{itemId, quantity}` and
    `ContainerMaterialsProvider` genuinely consumes them from a
    `Container`. But `BUILDABLE_REGISTRY`'s definitions carry a hard-coded
    English `name` string instead of a `nameKey` — a localization-boundary
    violation waiting to be rendered.

    **Two clauses of this gap have expired and are removed rather than left
    to mislead.** It said the registry *"holds exactly two entries"*: it holds
    four — `wall-brick`, `door-wooden`, `bed-wooden` and `toilet-brick` — and
    nothing recounted when ADR 0028's phases added the last two. It also said
    the registry is *"a plain `Map` rather than a validated content catalog"*.
    It is still a `Map`, and it is no longer unvalidated: three checks run at
    import and throw — `validateBuildableItemReferences`,
    `validateBuildableObjectReferences` and `validateBuildableDoorReferences`
    — so a row naming an unknown item, object or security grade fails the
    module load rather than waiting in `materials-pending` for ever. The
    `name`/`nameKey` clause is untouched and is still true.
    `assignedWorkerId` is `'mock-worker-1'` and progress advances a fixed
    `+10` per scheduled tick regardless of workers. No construction
    projection was written for this reason.

    **That sentence is now half true (#348), and the false half is the half a
    projection would have to show.** Still one mock worker id, still `+10` per
    scheduled tick, still nothing that models a worker. What changed is that
    only **one order at a time** advances: the crew is busy or it is not, and a
    waiting order takes it in the canonical ascending-id sequence. So a queue
    is no longer free — a twelve-wall perimeter finishes at tick 730 rather
    than 70 — and "how far along is this, and what is it waiting behind" became
    a question a player can now ask and the interface still cannot answer.

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

    The buy control's own refusals are decided in **two** places, and exactly
    one of them speaks per press. `src/main.ts` refuses an unpriced item, or a
    total the last published balance cannot cover, *before* the command is
    sent — that rejects the HUD's gated action and marks the pressed control.
    `ProcurementSystem` refuses whatever got past that, once the queued
    command reaches its tick. The dispatch sits between the two, so a press
    produces one message or the other, never both and never neither.

    > **This said "never while the clock is paused, because a paused clock
    > dispatches nothing", and that half is no longer true.** Since ADR 0051
    > (*"What a player sees for an order given while the clock is paused"*) the
    > worker dispatches a command that is already due the moment it is
    > submitted against a paused clock, so a purchase pressed during a pause is
    > refused during that pause. The "one message or the other" property is
    > unchanged and is now simply immediate on both sides.
    Both now land on the same band, told apart by `data-source`; only the
    pre-flight's marks a control, because only it can name one. Gap 34 records
    why the simulation's half needed that band at all.

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
    **`SimulationEventLog` (#507) joined them on the same terms, and left them
    on 2026-09-01.** The owner took
    [ADR 0084](./adr/0084-what-the-alerts-channel-owes-a-player.md)'s decision
    3 — the alerts log survives a reload — so the log *is* snapshotted, as an
    optional `simulation.alerts` section carrying the retained records, the
    ordinals a player dismissed and the log's sequence counter. No
    `SAVE_SCHEMA_VERSION` bump; the pricing is in `docs/PERSISTENCE.md` under
    the same heading, which carries the corrected entry in full.

    The paragraph that stood here is kept, because the argument in it is still
    the reason a restored record **announces** nothing:

    > **`SimulationEventLog` (#507) joins them on the same terms**, and the
    > entry is worth reading beside `RefusalLog`'s rather than as a repetition:
    > both are excluded because they hold a *notice* rather than a condition, but
    > this one can say so more strongly. The conditions behind its events are
    > persisted separately — arrears in the payroll snapshot (ADR 0049), sentence
    > ticks in the prisoner components (ADR 0050) — so a restored prison
    > re-announces at its next failed payday and at the next sentence that ends,
    > and nothing a player would have been told is actually lost. It is recorded
    > in `docs/PERSISTENCE.md` under the same heading, and asserted in
    > `tests/integration/sentence-end-release.test.ts`.

    What separates the two now is which surface a restored record reaches. It
    is republished with `restored: true`, which rebuilds the **list** — the log
    a player scrolls back through, which is what the owner decided they keep —
    and is ignored by the **band**, which carries what just happened and would
    otherwise be describing a tick the player was not looking at. So the
    quoted argument is not withdrawn; it is the reason for the flag.

    **`RefusalLog` above is unchanged and is still not snapshotted.** The owner
    ruled on the events log and not on the refusal, and the two stop being
    siblings in this one respect.

    **What the log gives back is bounded by the buffer rather than by the
    list.** At most `MAX_BUFFERED_SIMULATION_EVENTS` records are retained and
    the list keeps eight rows chosen by *severity*, so a `danger` row the live
    list had kept whose record had already left the buffer does not come back.
    The rows are main-thread state and the main thread contributes nothing to a
    save, which is the whole of why the save carries records instead of rows.

    **#749's five press-notices ride that same decision, and the sentence that
    stood here about them is corrected in both directions.** It read:

    > **#749's five members have no condition behind them at all**, which does
    > not weaken that argument but replaces it with `RefusalLog`'s own: a
    > cancellation, an undo and a redo are notices about a press, and a loaded
    > prison confirming a press from a session that has ended would be the same
    > defect gap 34 describes for a refusal.

    The defect it names is real and `restored: true` is what prevents it: a
    reloaded prison does **not** announce "the order was cancelled" on the band.
    What is false is the conclusion that the record therefore stays out of the
    save. The log is a scrollback now, and a player who cancelled an order
    before saving is owed that row on their return exactly as they are owed the
    riot. No member of `SIMULATION_EVENT_TYPES` is filtered out of the capture.

34. **A refusal cannot be dismissed by the player, and carries no location on
    the wire.** *Amended for issue #492 — the standing-until-another-refusal
    half of this gap was closed, the rest of it stands.* **Amended again on
    2026-09-22: the "carries no location" half is closed for six of the
    sixteen refusal domains and is honestly open for the other ten.**
    `refusalSchema.tile` is on the wire and reaches
    `HudAlertViewModel.tile`; what is still missing is the press that would
    use it (ADR 0122 option D steps 3 and 4) and therefore any sentence that
    names a coordinate. Read the rest of this entry as written — it is about
    the dismissal half, which did not move. The refusal raised
    by `simulation/status-counts` used to stand until another refusal
    replaced it or the session ended, full stop; it now also withdraws the
    moment the simulation accepts the exact command it once refused —
    `RefusalLog.supersede`, called from the same route that would have
    recorded the refusal, with a key built from that command's own arguments
    (a rectangle, a tile, an order id, a role, a guard id — one domain,
    `admit`, compares nothing narrower than "an admission of any kind
    succeeded", because both its reasons are session-global facts re-checked
    identically regardless of which admission asked; see
    `src/simulation/refusals/refusal-log.ts`'s "Supersession keys" section
    for the ten routes' own reasoning). What is still true: there is no
    *player* gesture that dismisses a refusal — no "close" button, no
    main-to-worker message for it — **and this half of the gap is now the
    narrow one, which is worth saying so a reader does not carry the wider
    version away.** The alerts list's *other* producer got its gesture on
    2026-09-01: the owner took
    [ADR 0084](./adr/0084-what-the-alerts-channel-owes-a-player.md)'s decision
    2, so an event row carries an `×` control that dismisses it, `DismissAlert`
    carries the run of arrivals it stood for to the worker, and the mark is in
    the save. **The control is its own element rather than the row**, which is
    the owner's ruling of the same day and overrides `createListRow`'s general
    rule for this row: a press writes into the save and there is no undo, so a
    mis-tap that cannot be reversed was judged worse than a smaller target.
    What it costs the sentence beside it — 88px of label down to a
    **36-61px range depending on severity** (#720's own measured spread,
    undocumented anywhere until 2026-09-01) — is derived in
    `src/ui/hud/hud.css`, and **the owner answered it on the same day by moving
    the question up a level: the width comes from the rail.** Nothing in the
    row gives way — the severity badge stays, because it is how ruling 11
    reaches a player; the control stays on the row's line; the label keeps its
    subject — and the corner widens instead, on
    [ADR 0085](./adr/README.md) decision 1, which already recommends widening it
    for reasons of its own.

    **Done, 2026-09-01, for issue #739.** `.hud-minimap` widened from 224px to
    396px — the smallest width at which the worst-case severity badge
    (`warning`, the narrowest label) still holds the 109-character refusal
    sentence to 4 line boxes, measured 2px at a time rather than derived,
    against ADR 0085's own 430px guardrail (396 clears the same 4-line-box
    property at 34px less, buying nothing further from the extra headroom).
    The corner measures 422px. `.hud-minimap__surface`'s own width is capped
    at its pre-#739 224px rather than growing with the panel: uncapped, its
    `aspect-ratio: 1 / 1` ties its height to the wider panel, and measured, a
    single ordinary alert stopped fitting its own list box at two viewports
    with the square left to grow — the opposite of what the widening was for.
    See `src/ui/hud/hud.css`'s own block above `.hud-alerts__list > .ui-row`
    and ADR 0085's Status-section addendum for the arithmetic, including what
    this spends against the world view at 900×600 (190px, against 362px
    before and 182px had the corner gone all the way to the guardrail).

    **What this list no longer is: knowingly over-subscribed.** Before this
    change, at the then-current width, a long sentence with a control beside
    it wrapped past the list's box — about five characters a line by
    derivation, though the real measurement was worse, 4.5 characters a line
    (`docs/research/2026-09-01-the-measurements-that-were-owed.md` §1) — so one
    long alert could be taller than the box holding it. Measured now
    (`tests/browser/ui-alerts-column.spec.ts`): no alert is taller than its
    list box at any of the five viewports this issue is measured at.
    None of that reaches a refusal row, deliberately — a refusal is a *level*,
    republished unchanged up to twice a second, so suppressing one is a
    different mechanism from retiring a run of occurrences, and ADR 0084 says
    in terms that it does not reopen this gap. The rows a player can press are
    exactly the rows carrying `HudAlertViewModel.occurrences`, and a refusal
    row carries none.

    The rest of what is still true stands unchanged: `SimulationRefusal`, what
    actually crosses the worker boundary, still carries no tile, order id or
    item id,
    so the sentence on screen can say *what* was refused and *why* but not
    *where*. The key `supersede` compares against is a second, purely
    in-worker string that never reaches `src/ui/` and is not part of
    `SimulationRefusal`; carrying a *position* on the wire itself is still the
    open question this gap always named, and still needs a decision about how
    the HUD would render it (highlight the tile? move the camera?).

    **Amended again, 2026-09-16, and the clause about the key is narrowed
    rather than withdrawn.** ADR 0091 decision 2 was ruled by the owner as
    option F: **the band** — not the log, and not the alerts list — retires its
    sentence on a **decided outcome of the same command route**. The key is
    still purely in-worker and still never reaches `src/ui/`; what does reach
    it is one boolean derived from the key's route prefix,
    `SimulationRefusal.routeDecidedSince`, which names a command and not a
    place. So the *where* this gap is about is exactly as absent as it was, and
    that is also the reason the ruling was needed: a corner that cannot say
    where it is about cannot be read beside a room the player has just
    successfully zoned. The measured form of that was two adjacent grid rows
    making opposite claims about one press.

    **What this does not close.** #780's plain different-location case for a
    route the player never repeats: a `zone.not-enclosed` refusal about a
    rectangle they abandon stands until they zone or refuse something else. And
    there is still no player gesture — a refusal is a level, not an occurrence
    run, and ADR 0084's `×` deliberately does not reach it.

    **The placement half of this gap is closed, and this is the answer it
    named.** It used to record that the alerts section starts *folded*
    (`INITIAL_HUD_SHELL_STATE`) and that `hud.css` drops `.hud__corner` — the
    whole alerts region — at 720px and below, so a refusal routed there was
    *reported* rather than unmissable and on a phone was not reported at all;
    and it left open whether a simulation refusal deserved the always-laid-out
    band, on the argument that the band was bound to a control that was
    pressed (`data-action`, `aria-describedby`) while a refusal decided
    several ticks later has none.

    It does deserve it, and the binding was the answer rather than the
    obstacle: a simulation refusal simply arrives with no `data-action` and
    marks no control, which is honest — there may have been no control, only a
    drag on the world. `HudViewModel.refusal` carries the last refusal's
    ordinal and message key, `.hud__refusal` renders it, and the fix is made
    for the **class** rather than per message, which is the property #220's
    own fix lacked: it moved one sentence and every later refusal route
    re-opened the hole, most recently ADR 0028 phase 3's object removal.
    Measured on the shipped page with a real worker, with the fold left shut:
    the band is 1280×32 at 1280×800 and 375×47 at 375×812, `offsetParent`
    non-null at both, while the alerts row is present with a 0×0 box and
    `offsetParent === null` at both.

    One line means one sentence, so the rule is the one the band already had:
    **the most recently decided refusal is the one on the line**, whichever
    side decided it, and taking the line unmarks the previous occupant's
    control. Nothing is stacked and nothing is restored — when a host refusal
    clears because that action later succeeded, an older simulation refusal
    does not come back. It is still in the log.

    **The alerts list keeps a role, and it is the log.** It holds the refusal
    row under its ordinal *beside* the rows the band deliberately does not
    take: since #187 an uncorrelated `protocol/error` paints one here too —
    the worker rejecting a message it could not decode, its own
    `internal-error` from inside the tick loop, and the main thread's
    inability to read a worker reply (`src/ui/simulation-alerts.ts`,
    [ADR 0024](./adr/0024-protocol-fault-recoverability.md)). A fault is not a
    refusal of a player's command, it stands per code, and several can stand
    at once, so one line cannot hold them and the list can. Both halves of the
    *dismissal* half of this gap still apply to a fault unchanged: it cannot
    be dismissed either, and it carries no location because a protocol fault
    has none.

    What stays open is the fault's own placement, and the stakes are the ones
    #187 named: a missed refusal means the player does not learn why one wall
    was not built; a missed `danger` fault means they do not learn that the
    interface can no longer say what the simulation is doing. That is a
    different question from the one answered above — a fault is not a refusal
    and does not belong on a band that says a command was declined — and it is
    deliberately still open here rather than settled as a side effect.

    **A third half opened on 2026-09-15, and it is not a placement question:
    a refusal a player never saw is not retained anywhere, and constitution
    article 6 appears to forbid that.** The article is
    `docs/design/2026-09-13-identity-v5/DOKUMENTACJA/konstytucja.md:35`, and
    ADR 0112 decision 1 accepted the constitution as a product contract under
    `AGENTS.md`:

    > *"Ostrzeżenia nie znikają dlatego, że przyszło nowsze zdarzenie.
    > Historia zdarzeń pozostaje dostępna."*

    ("Warnings do not disappear because a newer event arrived. The event
    history remains available.")

    **Measured rather than argued**, with a throwaway `vitest` probe against
    `RefusalLog`, `hudAlertsFromWorkerMessage` and `hudRefusalFromWorkerMessage`
    directly (deleted before commit, `docs/AGENT_WORKFLOW.md` §2; the four
    assertions and their output are in the report that accompanies this
    change):

    - `RefusalLog.record` replaces
      (`src/simulation/refusals/refusal-log.ts:189-208`, `public record(`).
      Two refusals leave `count === 2` and `last` holding only the second; the
      first is unreachable from the object.
    - The alerts list keeps exactly one refusal row, keyed by ordinal, and
      the previous one is filtered out before the new one is appended
      (`src/ui/simulation-alerts.ts:325-338`). Probe: after
      `place-object.tile-occupied` then `purchase.insufficient-funds`, the list
      is `[{"id":"refusal-2", …}]` — length 1.
    - The band carries the newest ordinal and nothing else
      (`src/ui/simulation-alerts.ts:501-508`, `src/ui/hud/hud.ts:1730-1745`).
    - Neither surface shows the count. The row literal carries `id`,
      `labelKey` and `severity` only, and `sequence` reaches a player only as
      an opaque row id.

    **Four of the five code coordinates above were repinned on 2026-09-16, and
    one of the four sentences is now false. Both are #1261's doing** — ADR 0091
    decision 2, option F, ruled by the owner on 2026-09-16 — and the sentence is
    kept rather than rewritten (`docs/AGENT_WORKFLOW.md` §4: mark both
    directions).

    - **The repins are citation maintenance and change no finding.** `record`
      is `refusal-log.ts:189-208`, `public record(` — both ends re-aimed on
      2026-09-22, when `refusalSchema.tile` gave the method a fourth parameter
      and the signature went from one line to five, on top of the
      `supersessionKeyRoute` that had already been added above it; the band's notice is built at `simulation-alerts.ts:483-490`,
      on `sequence: refusal.sequence`;
      the band's rule is `hud.ts:1730-1745`; and the publisher's single read of
      `refusals.last` is `state-machine.ts:597`, called from `onTickLoop` at
      `:407`. Each measurement re-reads the same at its new coordinate.
    - **"The band carries the newest ordinal and nothing else" is false in both
      directions since #1261.** It carries one thing *more*: the notice now
      forwards `routeDecidedSince` as well
      (`src/ui/simulation-alerts.ts:504`). And on that flag it carries *less*
      than the newest ordinal — a notice marked `routeDecidedSince` is treated
      as no notice at all, so the corner is cleared while the refusal still
      stands in `RefusalLog` and still holds its row in the alerts list
      (`src/ui/hud/hud.ts:1731-1735`). The band is therefore no longer even a
      lossy copy of the newest refusal; it is a copy that retires itself when
      the same command route decides something else.

    **Both `simulation-alerts.ts` coordinates above moved again on 2026-09-20,
    and the second sentence they carry is now understated rather than false.**
    The dead numbers, outside backticks so nothing tries to check them, were
    449-453 and then 462-469 for the notice, and 452 and then 465 for the
    forwarded flag — they moved twice in one day, both times because this
    repository added prose beside the code rather than because the code moved.
    The notice is now built at `src/ui/simulation-alerts.ts:501-508`, on
    `sequence: refusal.sequence`, and `routeDecidedSince` is forwarded at
    `:486`. Nothing about those two findings changed — the same
    lines were re-read at the new coordinates — and the shift is this repository
    adding the *second* way the band lets go of a sentence.

    - **The owner ruled on 2026-09-20 that the band also retires when nothing
      further happens, counted in simulation ticks**, amending ADR 0091 and ADR
      0084's amendment section 6. The provenance is the weaker of the two kinds
      this repository distinguishes: the label of a clickable option a session
      wrote, *"Tak, ale liczony w tikach"* ("Yes, but counted in ticks"), not a
      sentence they typed. `docs/adr/0091-what-clears-the-refusal-band.md`
      carries it in full.
    - **So "the band carries the newest ordinal and nothing else" is now false
      in the *same* two directions, one door wider.** The notice carries a
      second mark, `outlivedBandTicks`, computed rather than forwarded; and on
      that mark too the corner is cleared while the refusal still stands in
      `RefusalLog` and still holds its row in the alerts list.
    - **It is not on the wire**, which is the difference worth reading against
      the bullet above. `routeDecidedSince` crosses the boundary because only
      `RefusalLog` can know it; this one is a subtraction of two integers
      `simulation/status-counts` already carries, so `refusalSchema` gains no
      member. What the worker contributes is the *publication*: a refusal in a
      prison where nothing further happens moves no count and no ordinal, so
      `SimulationWorkerStateMachine` opens its own gate once when the ceiling is
      crossed. That is the gate this section's own retention finding depends on
      and it is why the change is not main-thread-only.
    - **What that does not touch is the retention finding this section is
      about**, for exactly the reason option F did not: the band holds *less* of
      the history, never more.
    - **A second ruling the same day scales the threshold with the running
      speed** (*"Skalować sufit prędkością"*, same weaker provenance), because
      counting in ticks alone made the hold 15.0 s at x1, 7.5 s at x2 and
      3.75 s at x4. The unit did not move and a paused prison still ages the
      sentence by nothing; the threshold is 300 ticks at x1, 600 at x2 and
      1,200 at x4. The speed reaches the translator as a **parameter** that
      `src/main.ts` reads off `HudClockViewModel.speed`, so
      `simulation/status-counts` still gains no member — which is why this
      section's own three-member enumeration of `refusal` above needs no
      further correction beyond the one already recorded for
      `routeDecidedSince`.
    - **What that does not touch is the retention finding this section is
      about.** Option F makes the band hold *less* of the history, never more,
      so a refusal a player never saw is if anything less retained after #1261
      than before it. The other three bullets are unchanged and were re-read at
      their new coordinates: `record` still replaces, the alerts list still
      keeps exactly one refusal row keyed by ordinal, and neither surface shows
      the count. So is the twelve-refusal measurement below — `supersede` on a
      *different* target now marks the standing record instead of doing nothing
      at all, but a `record` on a failed order still replaces outright, which is
      the reduction that measurement is about.
    - **And #1261 is not this section's question being answered by the back
      door.** It moved `src/` for ADR 0091 decision 2 — when the *band* retires
      a sentence — not for article 6, which the owner answered separately below
      on 2026-09-15 by ruling that article 6 does not reach a refusal at all.

    **Eleven of twelve refusals from one gesture never cross the worker
    boundary at all**, which is stronger than "overwritten fast". One build
    drag submits one `PlaceBuildOrder` per edge (`src/main.ts:2934-2949`) and
    the handler records one refusal per failed order
    (`src/simulation/construction/handler.ts:113-124`); the publisher reads
    `this._runtime.refusals.last` once per wake
    (`src/simulation/worker/state-machine.ts:597`, called from `onTickLoop` at
    `:407`), so a burst decided inside one dispatch pass is reduced to its last
    member before anything is posted. Probe: twelve recorded refusals across
    three reasons leave one row, `refusal-12`, `build.out-of-bounds`; the
    `build.water-blocked` and `build.unowned-land` sentences are gone from both
    surfaces with no trace. **What was not done: the gesture was not reproduced
    in a browser.** The reduction is established from the call graph and from
    the probe against the three pure functions; that a twelve-edge drag across
    a shoreline is a first-ten-minutes gesture is an inference from
    `build-tool.ts`'s one-gesture-many-edges contract, not a measurement.

    **Why this is not fixable here and is the owner's.** Every route out
    changes something reserved or already ruled on: carrying more than one
    refusal changes `SimulationRefusal` and the `simulation/status-counts`
    payload (the worker boundary); routing refusals into
    `SIMULATION_EVENT_TYPES` gives them a save section
    (`simulation.alerts`) and an `EVENT_PRESENTATION` row whose severity and
    `surfaces` value has been an owner's ruling every previous time
    (ADR 0084 ruling 11, #1006, #998); and re-announcing a standing refusal is
    the unbounded inflation ADR 0087 cost 1 measured at 240 rows in twelve
    seconds. ADR 0087 is `Proposed, not self-approved` for exactly decision 1,
    and ADR 0084 says in terms that it does not reopen this gap.

    **And the reading itself is not settled.** Article 3 gives *odmowa* (a
    refusal) its own vocabulary, distinct from a *komunikat* (a message), so
    article 6's *ostrzeżenia* may mean a warning about a condition of the
    prison rather than the decline of a press the player has just made. The
    literal reading is unusually easy to reach here only because every refusal
    row is graded `severity: 'warning'` uniformly — and that grading was chosen
    for an unrelated reason, stated at `src/ui/simulation-alerts.ts:262-268`:
    grading one refusal above another is a balance judgement this layer has no
    basis for. **The question, in one sentence: does article 6's
    *"ostrzeżenia"* reach a refusal of a player's own command, or only a
    warning about a condition of the prison?** Nothing in `src/` moves until
    that is answered.

    > **ANSWERED BY THE OWNER ON 2026-09-15: ONLY A CONDITION OF THE PRISON.**
    > Put to them as the sentence above, they ruled that article 6 governs
    > arrears, missing beds, an open incident — the state of the prison — and
    > **not** the decline of a press. That is article 3's *odmowa*, which has
    > its own vocabulary in the same document. **This records the repository
    > owner's own ruling, dated. It is not a recommendation of this
    > repository's and it was not self-approved** — the terms
    > [ADR 0064](./adr/0064-what-an-unmet-need-costs-a-prison.md)'s two
    > amendments are recorded under, and for the same reason
    > (`docs/AGENT_WORKFLOW.md` §3).
    >
    > **So this is not a constitutional conflict, and the paragraphs above are
    > kept rather than deleted** (`docs/AGENT_WORKFLOW.md` §4: mark both
    > directions). Everything they measure is still true and still worth
    > having — the refusal channel does replace rather than accumulate, eleven
    > of twelve refusals from one wall drag are reduced before anything
    > crosses the worker boundary, and no refusal is a `SimulationEventType`
    > so the event scrollback never holds one. **What changed is what those
    > measurements mean**: they describe how the refusal channel works, not a
    > promise the code fails to keep. A future reader weighing whether to
    > carry more than one refusal should read them as the cost side of that
    > question rather than as a defect report.
    >
    > **And the reading the ruling rejects is the one the code's own word
    > invites**, which is the part worth carrying: every refusal row is graded
    > `severity: 'warning'` for a reason that has nothing to do with the
    > constitution, so *"warning"* in `src/` and *ostrzeżenie* in
    > `konstytucja.md` are now known to be different words. Nothing enforces
    > that distinction; this paragraph is the only place it is written down.

    > **Every coordinate in this section was re-opened on 2026-09-17 against
    > `main` at `33c02a12`, and none of them moved.** Recorded with the commit
    > rather than with the date alone, per `docs/AGENT_WORKFLOW.md` §4 — a
    > "checked recently" with no commit on it is a claim a reader cannot
    > re-run. The eleven read back, verbatim at the line cited:
    > `konstytucja.md:35` *"Ostrzeżenia nie znikają dlatego, że przyszło nowsze
    > zdarzenie."*; `refusal-log.ts:158` *"public record(reason: RefusalReason,
    > tick: number, key?: string): void {"*; `simulation-alerts.ts:325`
    > *"const standing = previous.filter((row) =>
    > !row.id.startsWith(REFUSAL_ROW_PREFIX));"*; `simulation-alerts.ts:452`
    > *"...(refusal.routeDecidedSince === true ? { routeDecidedSince: true as
    > const } : {}),"*; `simulation-alerts.ts:262` the `severity` paragraph;
    > `hud.ts:1731` *"if (notice === undefined || notice.routeDecidedSince ===
    > true) {"*; `main.ts:2935` *"for (const edge of intent.edges) {"*;
    > `handler.ts:114` *"refusals.record(BUILD_REFUSAL_REASONS[order.failReason],
    > context.tick, buildKey);"*; `state-machine.ts:597` *"const refusal =
    > this._runtime.refusals.last;"*; and `state-machine.ts:407`
    > *"this.publishStatusCounts(now);"*, inside `onTickLoop` (`:392`).
    >
    > **What the re-check was looking for and did not find.** Between the
    > 2026-09-16 repin above and `33c02a12`, `main` took #1266, #1264, #1276,
    > #1271, #1269 and #1265, and the owner ruled on ADR 0091 decision 2
    > (option F, already carried above), ADR 0112 decision 4, ADR 0116 and
    > ADR 0115. None of those touched a line this section cites, and none of
    > them touches the refusal channel's retention. **The ruling that could
    > have is ADR 0116** — a construction-completion event, `'info'`,
    > `'log-only'`, counted rather than repeated, Accepted on `main` — because
    > it adds a `SimulationEventType` and so bears on the paragraph above that
    > prices routing refusals into `SIMULATION_EVENT_TYPES`. It does not
    > change that price: it is a *completion*, not a refusal, and the
    > `EVENT_PRESENTATION` row it needs was an owner's ruling exactly as that
    > paragraph says every previous one was. The paragraph is therefore
    > confirmed by the new ruling rather than falsified by it.
    >
    > **Re-run once more at `725aad40`**, after #1279 (*"fix(hud): mount the
    > alerts fold in the rail below 720px (#1201)"*) merged the same day and
    > added 53 lines to `src/ui/hud/hud.ts` — the file two of these coordinates
    > point into. **All ten still read back verbatim**, because #1279's hunks
    > are the layout-tier plumbing and `placeAlertsFold`, none of it above
    > `applySimulationRefusal`. Stated because a merge touching a cited file is
    > the case a reader would assume breaks something, and here it did not.
