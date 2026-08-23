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

Two existing accessors return insertion order and are therefore never used
by this layer: `RoomInstanceRegistry.occupantsOf` (sorted here before
projecting) and `DoorRegistry.all` (never called; doors are looked up by the
sector's own sorted `doorIds`).

### 3. Ids and message keys, never text (ADR 0011)

A view model carries a stable simulation/content id and, where the content
catalog defines one, its `nameKey`. Resolving a key to a translated string
is the HUD's job. A test walks every projection and fails if any string
value equals a translation from the default `en` catalog.

### 4. Bounded values

`BoundedValue` is how a quantity stored on an internal scale reaches a
segmented bar:

| Field | Meaning |
| --- | --- |
| `permille` | The value as an integer share of its own maximum, `0`–`1000`. Authoritative: use it for tooltips, ARIA values and width calculations. |
| `filled` / `segments` | A ready-made segmented bar: fill `filled` of `segments` (`BOUNDED_VALUE_SEGMENTS` = 10). |

`filled` is `floor(permille * segments / 1000)`, so a partially filled last
segment reads as unfilled and a bar is full **only** when the underlying
value is exactly at its maximum. Rounding would render 96 % as a full need
bar, which is a lie a player acts on.

The raw value and raw maximum are deliberately **absent**. Needs are
`0..255` `Uint8Array` levels today; that is an internal storage decision,
and exposing it would guarantee some panel hard-codes `255`.

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

## Gaps: fields a panel plausibly wants that the simulation does not have

Nothing below is implemented, faked or defaulted. Each is a product
decision about what to build next.

### Identity and labelling

1. **No prisoner name, portrait, age, or offence.** A prisoner is an entity
   id, a classification, a risk tier and a `priorIncidentsAtIntake`
   integer. A roster panel has nothing to label a row with.
2. **No staff name.** Same for `GuardRoster`.
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
6. **`FixedStepClock` exposes no getter for its current `ClockControl`** —
   only `setControl`. The status-strip projection has to be handed the
   speed by whoever owns the clock, and reports `speedKnown: false` when it
   is not.

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

### Rooms

13. **Object placement does not exist.** No system tracks which objects are
    physically in which room; `RoomInstance.objectCapabilities` is declared
    at registration. So an `object` requirement can only be checked as
    "instance declares the required object's capabilities", never against
    `minQuantity`, and `enclosed` / `outdoors` / `minimum-size` are
    projected as `'not-evaluated'`.
14. **`RoomSystem.validateRoom` is mocked** in its own body for size and
    enclosure. There is no real room-geometry validation to project.
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
    hiring, shift or scheduling system. Staffing "by time" exists only as
    `DeploymentSchedule`'s required headcount per sector.
20. **No per-staff skill level or fatigue.** `staff-role-catalog` declares
    skill *requirements* per role, but no staff entity carries a skill.
21. **`wageBand` exists in content, and there is no economy.** No payroll,
    budget, funds or currency anywhere in `src/`. Nothing wage-related may
    be rendered as a live figure; it is a content hook for a future issue.
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

### Cross-cutting

33. **Several per-system counters do not survive a restore.**
    `docs/DETERMINISM.md` records that `SearchSystem`, `DeploymentSystem`,
    `PatrolSystem` and `ActionSystem` do not snapshot `requestSequence` and
    that several metrics are not carried. A metrics panel therefore resets
    on load.
