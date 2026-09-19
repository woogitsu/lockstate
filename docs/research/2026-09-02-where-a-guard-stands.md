# 2026-09-02 — Where a guard stands, and what route they walk

**Question.** The owner's words, verbatim: *"warto dodać ustawienie
posterunku/dyżuru w konkretnym miejscu lub na konkretnej trasie jak w prison
architect, zrob research"* — it is worth adding the setting of a post or duty
at a specific place, or on a specific route, like in Prison Architect; do
research. So: **the player should be able to say where a guard stands, or what
route a guard walks.** This record establishes what that means for this
codebase, and what is genuinely absent.

Measured on `docs/where-a-guard-stands-and-what-route-they-walk`, cut from
`origin/main` at v0.0.358 (`9b8c8e85`).

**Evidence tiers**, as `docs/research/README.md` requires them:

- **MEASURED** — a number this session produced by running code, output kept.
- **VERIFIED** — a file was opened and read at the `file:line` cited, or a
  sentence is quoted from it.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it; the
  page itself would not open in this environment.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **UNKNOWN** — could not be established.

---

## 0. The answer, before the argument

**Route-walking is finished. What is missing is a value and a way to author
it.** Give the sector a `patrolRoute` and the guard walks it — through the real
`NavigationSystem`, at ADR 0059's speed, publishing a non-zero velocity on
four ticks in five, completing loops and counting them. That is MEASURED below,
in a real session, not inferred from the unit suite.

So the work the owner is asking for is **a gesture, a command and four
decisions**, not an engine. And the single largest cost in it is not the
gesture: it is that `restoreSessionSystems` throws a player-authored route
away on load, which is MEASURED in §4 and is not a schema problem.

---

## 1. How much is already built: all of it. MEASURED.

The probe is two halves of one session. It starts from
`createNewSimulationRuntime`, admits a prisoner and hires a guard through
`packCommand` — real commands, the ones a player can send — steps to tick 60,
and reads the guard. Then it authors a three-waypoint route by reaching past
`SecuritySectorRegistry`'s own (deliberately absent, see §2) mutation entry
point, and steps 3,000 more ticks reading `LocomotionStore.read` every tick.

**Half one, the shipped game:**

```
refusals after admit: 0
phase after hire: on-post tile {"x":16,"y":16}
isWalking: false
patrol metrics: {"loopsCompletedOnTime":0,"loopsCompletedLate":0,"loopsMissed":0}
```

**Half two, the same session, one field later:**

```
route authored at tick 60
ticks spent walking: 2392 of 3000
distinct tiles visited: 16 16,16 16,17 16,18 16,19 16,20 17,16 17,20 18,16
                        18,20 19,16 19,20 20,16 20,17 20,18 20,19 20,20
patrol metrics after: {"loopsCompletedOnTime":74,"loopsCompletedLate":0,"loopsMissed":0}
final phase: travelling
max velocity component (sub-tile units/tick): 128
render samples with a non-zero velocity: 2392 of 3000
```

Read the tile list: sixteen tiles, and they are exactly the perimeter of the
rectangle whose corners the route named — (20,16), (20,20), (16,20), and the
post at (16,16) that `legTarget` returns for the closing leg
(`src/simulation/security/patrol-system.ts:89`). The guard did not jump between
waypoints; it walked every tile between them. **79.7% of ticks were spent
walking**, the velocity was 128 sub-tile units a tick — ADR 0059's number,
inherited unargued for guards by ADR 0088 — and 74 loops closed, every one
inside the 200-tick budget the probe authored, none late, none missed.

**What that establishes, and it is the most useful thing in this record:** the
patrol pipeline is complete end to end. `PatrolSystem.update`
(`src/simulation/security/patrol-system.ts:72-86`) picks up an `'on-post'`
guard with no waypoint index and begins a loop; `requestLeg` plans against
`NavigationSystem`; `continueLeg` calls
`GuardRoster.locomotion.beginWalk` on the resolved route
(`src/simulation/security/patrol-system.ts:161`); `createGuardLocomotionSystem`
advances the walk each tick and dispatches the arrival back to
`onArrivedAtLegTarget` rather than to `DeploymentSystem`
(`src/simulation/security/guard-locomotion.ts:66-75`); the loop closes,
the budget is compared, the counter moves, and the next loop starts. The
render channel reads the same store the walk lives in.

Nothing in that chain is missing. Its own header already says what it needs:

> "A deployed (`'on-post'`) guard whose sector defines a `patrolRoute` walks
> it as a continuous loop through the real `NavigationSystem`; a sector with no
> `patrolRoute` gets static coverage only" — `src/simulation/security/patrol-system.ts:24-28`

**One consequence of half two is worth flagging now because it is copy the
owner owns.** `final phase: travelling`. A guard walking a route is
`'travelling'` essentially always: `onArrivedAtLegTarget` requests the next leg
in the same statement it records the arrival
(`src/simulation/security/patrol-system.ts:199`), so `'on-post'` is held for
part of one tick per loop at most. The roster row's word for a patrolling guard
is therefore `Travelling`, permanently, and `displayedDeploymentPhase`
(`src/simulation/security/deployment-phase.ts:90-100`) never gets the chance to
say `Returning` or `On Post` about it. Coverage is unaffected —
`describeStaffCoverage` reads `required`/`assigned`/`shortage`
(`src/ui/hud/staff-panel.ts:264-284`) and `assignedGuardCountFor` counts every
phase but `'unassigned'` (`src/simulation/security/deployment-system.ts:119-125`),
so a patrolling guard still reads `Covered`. But a row that says `Travelling`
for an hour is a sentence, and §10 owes it.

---

## 2. What a sector is, and the four things it can hold that nothing writes

**VERIFIED.** A sector is five fields and a control state
(`src/simulation/security/sector.ts:48-56`):

```ts
export interface SecuritySectorDefinition {
  readonly id: string;
  readonly gradeId: string;
  readonly doorIds: readonly string[];
  readonly postTile: TilePosition;
  readonly patrolRoute?: readonly TilePosition[];
  readonly expectedPatrolLoopTicks?: number;
}
```

It is not a rectangle. **A sector has no extent at all** — this is the thing
most likely to be assumed wrongly, so it is stated first. `doorIds` is a
perimeter of doors, `postTile` is one tile, and there is no width, height,
anchor or tile set anywhere in the type. `sector-occupancy.ts` is where the
absence shows: for any sector but the derived one, "who is in this sector" is
answered by counting prisoners standing **exactly on the post tile**
(`src/simulation/security/sector-occupancy.ts:123`). A drawn sector is a
different feature from a placed post, and the brief was right to keep them
apart.

**One author for `postTile`, none for the rest.** Pinned mechanically this
session in `tests/foundation/security-sector-authorship-contract.test.ts`, red
then green:

| field | authored by | read by |
| --- | --- | --- |
| `postTile` | `deriveDefaultSecuritySectorPostTile` only | deployment, patrol, incidents, occupancy, projection |
| `patrolRoute` | **nothing in `src/`** | patrol (6 sites), deployment (2), projection (1) |
| `expectedPatrolLoopTicks` | **nothing in `src/`** | patrol, projection |
| `doorIds` | derivation, as `[]` | sector control state, projection |

And two more capabilities of the same shape, off to the side of the question
but the same class of finding:

- **`DeploymentBlock`'s multi-block form has no author.** The type carries
  `startTickOfDay`/`endTickOfDay`/`requiredGuardCount`
  (`src/simulation/security/deployment-schedule.ts:13-18`) precisely so a post
  can be manned at night and not by day — issue #26's *"counts/assignments by
  sector/time/regime"*. The only producer in `src/` is
  `constantDeploymentSchedule` (`src/simulation/security/default-sector.ts:235`).
  **`assertGaplessDeploymentSchedule` has no caller in `src/` at all**
  (`src/simulation/security/deployment-schedule.ts:25-37`) — a validator for a
  shape nobody writes. The owner's word *dyżur* ("duty", "shift") is arguably
  asking for exactly this and not only for a place; §10 asks.
- **`'restricted'` has no producer.** `tests/foundation/deployment-phase-producer-contract.test.ts`
  pins it: `expect(countedWrites('setControlState', 'restricted')).toEqual([])`.
  A sector can be tightened and nothing tightens one.

**`SecuritySectorRegistry` cannot be told anything twice.** Its public surface
is `register`, four readers, `setControlState`, and the snapshot pair
(`src/simulation/security/sector.ts:65-161`); `register` throws on a duplicate
id (`src/simulation/security/sector.ts:74`). ADR 0036 decision 4 point 2 states
that as a decision and hands the consequence forward in its own words:

> "**`SecuritySectorRegistry` has no un-register and no replace**, deliberately:
> it captures each governed door's baseline state at `register` time. Adding one
> is a decision about what happens to the sector's live control state and to
> anything naming it, and that decision is not this document's."

So a post a player can move, or a route a player can redraw, **cannot be
expressed against this class at all**. That is the mechanical reason this is a
decision and not a wiring job, and it is now pinned.

---

## 3. Why a guard can never be seen walking today. VERIFIED, and the brief's arithmetic checked.

Two errands walk since ADR 0088, and both have their distance removed by
something else.

**Deployment travel has no distance.** `NEW_PRISON_ORIGIN_TILE = { x: 16, y: 16 }`
(`src/main.ts:618`) is what both player commands carry — `HireStaff` at
`src/main.ts:2829-2830`, `AdmitPrisoner` at `src/main.ts:2759-2760`. A new
session's world is `new SparseWorld(32)`
(`src/simulation/runtime/new-session.ts:421`) owning one chunk, and
`deriveDefaultSecuritySectorPostTile` returns
`chunk * tileChunkSize + floor(tileChunkSize / 2)`
(`src/simulation/security/default-sector.ts:194-201`). MEASURED, from the same
probe: `CHUNK SIZE 32`, `OWNED [{"x":0,"y":0}]`, `POST TILE {"x":16,"y":16}`.
The same tile. `beginDeployment` takes its `isAtPost` branch and returns before
requesting a route (`src/simulation/security/deployment-system.ts:206-209`).

That is not a coincidence anybody stumbled into; ADR 0036 decision 2 arranges
it and lists three reasons, the first of which is *"A hire is posted without a
route request"*. ADR 0088's Status paragraph says the owner was told this
before signing: *"A newly hired guard spawns \*on\* its derived sector's post
tile (ADR 0036 decision 2's deliberate coincidence), so ordinary early-game
hiring has no distance to cross"* — the emphasis is the ADR's own.

**A patrol leg has no route**, per §2.

**And the second and third guards do not help.** `resolveOccupancyScaledGuardCount`
raises the requirement by one guard per eight occupants
(`src/simulation/security/sector-staffing.ts:147`, `:190`), and
`assignUnassignedGuards` sends every one of them to the same `sector.postTile`
(`src/simulation/security/deployment-system.ts:196`). A 24-prisoner prison
needs three posted guards and all three stand on (16,16), each arriving by the
`isAtPost` fast path. **REASONED**, from those two lines.

`walkBackToPost` (`src/simulation/security/deployment-system.ts:170-178`) is the
one path that could produce a walk without a route, and it needs a guard to be
off its post first — which, per its own comment, is a reload artefact.

### Three corrections to the brief, all in the direction of it being right

1. **The file the brief names as the shape for a pinning test does not
   exist.** It asked for one *"in the shape of
   tests/foundation/job-production-contract.test.ts"* — written here without a
   rooted path on purpose, because `tests/foundation/documentation-links-contract.test.ts`
   correctly refuses a citation of a file that is not on disk, and it refused
   this one while this note was being written. `tests/foundation/` holds 48
   files and none of them is it. The right sibling is
   `tests/foundation/deployment-phase-producer-contract.test.ts`, which is in
   the same domain and pins the same kind of thing; that is the shape this
   session's new contract took.
2. **"`patrolRoute` is *read* in four places" undercounts by five.** Four
   *files*, nine occurrences: `patrol-system.ts` reads it six times,
   `deployment-system.ts` twice, `security-projection.ts` once, and
   `save-schema.ts` declares it. The distinction matters only because the new
   contract pins counts, and a count off by five is a pin that fails on the
   first unrelated edit.
3. **ADR 0004 is not about sector geometry.** The brief hedged — *"if that is
   what it covers"* — and it is right to have hedged: `docs/adr/0004-chunk-size-selection.md`
   is *"Chunk size selection and parcel decoupling"*, and its relevance here is
   only that the chunk size is 32, which is why the post tile is (16,16). There
   is **no ADR on sector geometry**, because there is no sector geometry (§2).

---

## 4. The save format needs no migration — and the schema was never the problem

**VERIFIED: both fields are already in the shipped V5 schema.**
`securitySectorDefinitionSchema` (`src/persistence/save-schema.ts:717-726`)
is `.strict()` and carries `postTile: tilePositionSchema` and
`patrolRoute: z.array(tilePositionSchema).optional()`, with
`expectedPatrolLoopTicks` beside it. `SAVE_SCHEMA_VERSION` is 5
(`src/persistence/save-schema.ts:36`).

So the ADR 0038 decision 1 test does not even have to be applied to a *new*
field. Applied anyway, to the change in what the existing field means: the
rule is *"A save is compatible with a build when the build can interpret every
section the save carries, and every section the build needs and the save omits
has exactly one meaning."* An absent `patrolRoute` means "static coverage
only" today and would mean "the player has drawn no route" tomorrow, which is
the same behaviour — the sector is not patrolled. **No bump, no migration.**
V6 stays free, which ADR 0036 decision 6 records #337 as wanting.

### The finding: the restore throws it away. MEASURED.

`restoreSessionSystems` step 1 skips any sector id the runtime already holds
(`src/simulation/runtime/session-systems.ts:731-733`):

```ts
for (const sector of systems.security.sectorDefinitions) {
  if (runtime.securitySectors.getDefinition(sector.id) !== undefined) continue;
  runtime.securitySectors.register({ ...sector });
}
```

`restoreSimulationRuntime` builds its session through
`createNewSimulationRuntime`, which has already run
`applyDefaultSecuritySector` (`src/simulation/runtime/new-session.ts:1137`), so
the derived sector is present before this loop runs and **the payload's row for
it is never read**. The second call at the end of the restore
(`src/simulation/runtime/session-systems.ts:925-930`) cannot recover it either:
`applyDefaultSecuritySector` registers only when `getDefinition` answers
`undefined` (`src/simulation/security/default-sector.ts:276-277`).

ADR 0036 says both halves of this itself, and they pull in opposite
directions — worth quoting, because a reader who reads only one will get the
wrong answer. Decision 6:

> "The payload's row for this sector is therefore never read."

and, three bullets later in the same decision:

> "**Anything the payload already carries wins.** The derivation is
> authoritative only where the payload is silent, so a session can hold a
> requirement for this sector other than the derived one and keep it across a
> save."

Both are true, and the subject changes between them: the *definition* is
skipped, the *schedule* and the *watch entry* are payload-wins. A player-drawn
route lives in the definition, on the skipped side.

MEASURED, by capturing a real bundle, hand-editing the default sector's row to
`postTile: (20,20)` with a two-waypoint route, and restoring it:

```
PAYLOAD BEFORE [{"id":"security-sector.prison","gradeId":"grade.general","doorIds":[],"postTile":{"x":16,"y":16}}]
RESTORED       [{"id":"security-sector.prison","gradeId":"grade.general","doorIds":[],"postTile":{"x":16,"y":16}}]
```

The route is gone and the post is back at (16,16). No error, no refusal,
nothing in any log. **A player who drew a patrol route and reloaded would find
it deleted.**

**So the cost is a restore change, not a migration**, and the change is small
and safe: make the loop prefer the payload's row for the default sector id
instead of skipping it. Safe for every save that exists, and the reason is
arithmetic rather than optimism —
`tests/integration/security-default-sector.test.ts` already pins that a
captured row is byte-identical to the derived one
(*"carries a copy in the payload that is identical to the derived one, which is
what makes skipping it safe"*), so for every V5 save written by any shipped
build, preferring the payload changes nothing. It only starts to matter once
something authors a difference. What it costs is the forcing function that
assertion currently provides: change the derivation rule and that test fails
today, and it would stop failing. **That is a decision, and it is decision 3 in
the ADR beside this record.**

---

## 5. What the ADRs already decide, and what they hand forward

Searched rather than assumed: `docs/adr/README.md` indexes 91 ADRs.
(The brief's counting warning is real — a `grep -c` over the status column
over-counts, because status cells quote the word "Proposed" while narrating
their own history. Counting the leading word of each cell is what the index's
own `statusKeyword` helper in `tests/foundation/adr-numbering-contract.test.ts:97`
does.)

**Already decided, do not re-decide:**

- **ADR 0059** (Proposed) built the locomotion mechanism and left open question
  4, *"Do guards walk, and when?"* — VERIFIED at
  `docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md:583`.
- **ADR 0088** (Accepted, by the owner, 2026-09-02) answered it for deployment
  travel and patrol legs, and left incident response and contraband search
  teleporting. **How a guard walks is settled. This record does not reopen it.**
- **ADR 0077** (Proposed) already decides what happens when a route stops being
  valid, and it decides it in the way a player-drawn route needs: *"No actor
  may traverse an edge that is non-traversable at the tick on which the edge is
  crossed"*, asked once per tile, and *"A refusal stops the walk; it does not
  arrive"* (decisions 1–3). So **a route drawn through where the player later
  builds a wall is not an open question**: the guard stops at the wall and
  re-plans at its next reconsideration. Its decision 5 made `canCross` a
  required parameter *specifically* so guards could not be given a walk without
  answering it, and ADR 0088 is the call site that answered.
- **ADR 0036** (Accepted, by delegation) decides that the sector is derived,
  that the derivation never re-runs, that the id is a constant, that there are
  no doors and no route, and that none of it is a player gesture.
- **ADR 0053** (Proposed) decides who may stand a post — only a post-eligible
  role, via `claimableGuardIds`. A per-guard assignment gesture inherits that
  filter and must not bypass it.
- **ADR 0048** (Proposed) decides that a sector's requirement scales with
  occupancy, which is why several guards share one post tile today (§3).
- **ADR 0089** (Proposed) decides how a refusal names its reason, and gives the
  mechanism a post command would use: a namespaced id on a closed union whose
  `Record` fails the build until a `LocalizationKey` is named.
- **ADR 0011** decides that no text crosses the worker boundary, so the post
  tool's label and the route's sentence are locale keys and therefore the
  owner's (§10).

**Handed forward explicitly, and therefore this record's subject:**

- **ADR 0036 open question 1** — *"What happens when the player builds on the
  post tile?"* — *"A wall at (16, 16) makes the post unroutable:
  `deploymentFailures` counts and the guard returns to the pool, retried every
  cycle, for ever. Nothing tells the player."* A player-placed post makes this
  reachable on purpose rather than by accident.
- **ADR 0036 open question 4** — *"Does the sector need a name a player can
  read?"* — becomes live with the first surface that shows a sector, which a
  post tool is.
- **ADR 0036 open question 5** — *"When a player can draw a sector, what
  happens to this one?"* — *"they imply different things about the id, about
  `SecuritySectorRegistry` needing an un-register (decision 4 point 2), and
  about what an incident open in it does. This document deliberately does not
  choose."*
- **ADR 0036 decision 4 point 2**, quoted in §2: the replace/un-register
  decision.

**Checked and not applicable:**

- **ADR 0062** (Proposed) is prisoner room contention — `needUrgency` and who
  gets a seat. Its only bearing here is the arrival-order tie-break precedent,
  and **ADR 0088 already ruled that guards need none**: *"a guard's arrival
  does no room-claim contention a prisoner's does, so
  `DeploymentSystem.onArrivedAtPost` and `PatrolSystem.onArrivedAtLegTarget` do
  not need the tie-break ADR 0062 gave `ActionSystem.onWalksArrived`."* Several
  guards sharing one route therefore needs no ordering decision.
- **ADR 0004**, per §3 correction 3.

### What ADR 0088's amendment should record, if this changes the picture

Not written here — the owner holds it. But this record supplies one sentence it
does not have yet. Its "Consequences if this stands" says:

> "A player who hires a guard, or whose sector runs a patrol route, now sees
> the guard cross the prison"

**Both halves are unreachable, and for two different reasons** — the first
because the hire tile and the post tile are the same tile by ADR 0036 decision
2, the second because nothing authors a route. The amendment should say which
reason applies to which half, because they have different remedies: the first
is fixed by a post the player can place, the second by a route the player can
draw, and neither fixes the other. §1's probe is the evidence that the
mechanism itself is sound and only starved of input.

---

## 6. What Prison Architect does, as a source of options and not as an authority

**SEARCH-SUMMARY throughout this section.** The Paradox wiki page returned a
JavaScript error body and the Fandom page returned HTTP 402 in this
environment; what follows is search-tool summary plus one guide page that did
open, and it is weaker than everything above. `AGENTS.md` forbids copying that
game's code, assets, text or UI layouts; this is read for the *shape of the
decisions* only.

- **Deployment is painted over rooms, not over tiles.** An area counts as
  deployable only if it is *"surrounded by walls and have doors"*. A stationed
  guard **roams the zone**; it does not stand on a point.
- **Patrols are a separate, research-gated sub-tab**, and a route is drawn by
  *"left click and drag your desired route onto the deployment map"*, removed by
  *"right click and drag over the route you want to delete"*. So it is a
  **painted set of squares**, not an ordered list of waypoints.
- **A guard is assigned to a route directly, not by sector membership.**
  *"Guards assigned to the sectors in which the patrol is located will not
  automatically follow a route, and instead must be assigned to a route
  directly by clicking on an existing patrol route square."* Several guards can
  be assigned to one route, and the advice is to do so.
- **Two route colours exist for one mechanical reason:** *"they allow for
  patrols to overlap."* Nothing else distinguishes them.
- **A guard leaves its route only for a high-priority incident.**
- **UNKNOWN:** what that game does when the ground under a post or a route is
  demolished. Neither page that opened says, and this is exactly the question
  ADR 0036 open question 1 is about, so it is worth saying plainly that the
  reference does not answer it.

### The divergence that decides the gesture, and it is easy to miss

**Copying that game's gesture would not fill the field this codebase already
reads.** Lockstate's `patrolRoute` is an *ordered* loop with a closing leg back
to the post, a `expectedPatrolLoopTicks` budget, and on-time/late/missed
counters (§1). A painted region has no order, so it cannot produce a loop, a
budget or a completion — you would be building a second, region-shaped patrol
concept beside a finished, sequence-shaped one, and then deciding which of them
`PatrolSystem` obeys. **That is the option this record recommends against**, and
it is recommended against on cost measured in §1 rather than on taste.

Two more shape divergences worth naming:

- **Their station is per-guard-per-zone; ours is per-sector-per-tile.** One
  `postTile` serves every guard the sector requires, so a growing prison stacks
  guards on one tile (§3). "Whose post is it" is a genuinely absent decision,
  not an implementation detail.
- **Their deployable area requires walls and a door; ours requires nothing.** A
  post on bare dirt is placeable here and routable to. Whether it *should* be
  is a decision.

---

## 7. The gesture, and what it collides with

### A post is a click, and the HUD already has that gesture

**VERIFIED.** `ObjectTool` (`src/ui/object-tool.ts`) is 208 lines and is
exactly the shape: one press, one tile, reported to the HUD, with removal as a
mode rather than a fourth class. Its own header states the rule for when a
fourth sibling is right — *"What made `RoomTool` a separate class from
`BuildTool` was a different shape"* — and a post has the same shape as an
object placement, not a different one. The arming pair is already extracted to
a pure reducer, `toggleRemovalMode`/`pressArm`
(`src/ui/hud/tool-arming.ts:71-74`, `:130` onward), specifically because two
panels had drifted into two copies of it, so a third consumer costs nothing.

**A route is a sequence, and no gesture in this HUD produces one.** `RoomTool`
drags a rectangle; `BuildTool` drags a run of edges; `ObjectTool` presses one
tile. Nothing accumulates an ordered list across several presses and then
commits it. **The smallest honest gesture for a route is therefore: arm, press
tiles one at a time to append waypoints, press a confirm control to commit** —
and `RoomsPanel` already has the confirm half of that pattern
(`.hud-rooms__confirm`, whose press stands the tool down, #684). The genuinely
new part is the *held, uncommitted, ordered list*, which is chrome state no
existing tool keeps.

### What it collides with

1. **`.hud-minimap` eats presses silently, and the brief understates it.** The
   brief says the minimap *"makes four world tiles unbuildable"*. Re-read
   this session: `docs/research/2026-09-02-the-world-view.md` §0–§1 measured a
   live rect of `x:12 y:346.8 w:398 h:372` at 1280×800 — **14.5% of the
   screen**, not four tiles — and measured the press: at the rect's centre,
   `press -> commands: []`, both feedback channels `"hidden" -> "hidden"`; 259px
   to the right on bare canvas, the identical gesture produced a
   `PlaceBuildOrder`. The panel's width was widened from 224px to 396px on
   2026-09-01 (`src/ui/hud/hud.css:282`), and it opts into pointer events
   through `.hud__corner > *` (`src/ui/hud/hud.css:59-65`), of which the minimap
   panel is the sole child (`src/ui/hud/hud.ts:1514`). **Any new world gesture
   inherits this**, and a post placed by one press has no run to salvage: a
   wall drag that loses three of six presses still builds three walls; a post
   press that lands on the minimap places nothing and says nothing.
2. **No panel reads `hud/security`.** VERIFIED:
   `tests/foundation/projection-reachability-contract.test.ts:326` records
   `'hud/security'` as *"No reader"*, and `projectSecurity` already publishes
   `postTile` and the full `patrol.waypoints` list
   (`src/simulation/presentation/security-projection.ts:229-236`). So the data
   a post-and-route surface needs is already on the wire and there is nothing
   subscribed to it. **A player who places a post has nowhere to read it back
   except the map.** That makes the map drawing part of the gesture's cost, not
   an enhancement — and `docs/research/2026-08-28-drawing-guards.md` §3 already
   makes the argument for why an invisible lever is worse than an imperfect
   visible one.
3. **Undo cannot reach it, and that is consistent rather than a gap.** `Undo`
   reaches construction orders only; `UnzoneRoom` exists as its own command for
   exactly that reason (`src/simulation/protocol/commands.ts:86-90`: *"Neither
   command produces a construction order, so `ConstructionSystem` has nothing to
   group either of them under and `Undo` cannot reach either -- which is exactly
   why removal is a command of its own rather than a use of undo."*). A post
   move and a route clear follow that precedent: a second command, not an undo
   entry.
4. **The refusal vocabulary is a closed union and adding to it is cheap.**
   `RefusalReason` is namespaced per command
   (`src/simulation/protocol/types.ts:1195-1207`), `REFUSAL_LABEL_KEYS`
   (`src/ui/simulation-alerts.ts:34`) is total over it so a new member fails the
   build until a key is named, and **refusals are not persisted** — nothing in
   `src/persistence/save-schema.ts` carries one. So the wire cost of a
   `set-post.*` namespace is a compile error until the copy exists, which is the
   right shape, and the copy is §10's.

---

## 8. What is genuinely absent

Each of these is a question the code cannot answer and no ADR takes. They are
the ADR beside this record; the costs are argued there.

1. **Is a post a property of the sector, or of a guard?** One `postTile` per
   sector today, with every required guard sent to it. Prison Architect assigns
   per guard. Choosing "per sector" keeps every reader unchanged; choosing "per
   guard" touches `GuardRecord`, and `guardRecordSchema` is `.strict()`.
2. **How does a sector definition change at all?** `SecuritySectorRegistry` is
   append-only by decision (§2), and ADR 0036 hands the replace decision
   forward by name.
3. **Does a save's sector definition win over the derivation?** It does not
   today, measured in §4, and a player-authored anything is lost on reload
   until it does.
4. **Is a route an ordered list or a painted region?** §6. The field that
   exists is a list.
5. **What happens to a post or a waypoint the player makes unreachable?** ADR
   0036 open question 1 for the post; the same condition on a waypoint
   currently increments `loopsMissed` and retries for ever
   (`src/simulation/security/patrol-system.ts:141-152`). ADR 0077 already
   decides the mid-walk case; this is the plan-time one.
6. **Can a route be shortened while a guard is walking it, and what happens to
   the guard's index?** A hazard created *by* this feature and not present
   today: `continueLeg` re-requests the stored waypoint index unchecked
   (`src/simulation/security/patrol-system.ts:131`) and `legTarget` throws a
   `RangeError` for an index past the end
   (`src/simulation/security/patrol-system.ts:91`), which would come out of
   `Kernel.step()`. Unreachable today because the registry cannot be mutated and
   `GuardRoster.loadSnapshot` clears the index on restore
   (`src/simulation/security/guard-roster.ts:288`). **REASONED, not measured** —
   see §9.
7. **Is "duty" a place or a shift?** The owner's word is *posterunek/dyżur*.
   `DeploymentBlock` exists for the shift reading and nothing authors one (§2).

---

## 9. What was not measured, and the weakest claim

**Not measured:**

- **No browser run, no playtest, no screenshot.** Everything in §1 and §4 is
  simulation-level, in Node. The brief's own playtest numbers (2,700 render-delta
  publications, 7,945 guard records, zero non-zero velocities) were not re-run;
  they were **corroborated structurally instead**, which is a different and in
  one way stronger thing: §3 shows the two errands cannot produce a walk, so a
  zero measured on the wire is what the code requires rather than what one
  session happened to see. A worktree browser run would also have been worthless
  for anything visual — `docs/AGENT_WORKFLOW.md` §2 records that a worktree gets
  LFS pointer files and loses every actor sprite while passing anyway.
- **No cost estimate in hours or lines for any option.** The costs in the ADR
  are named as which files and which contracts move, not as effort.
- **Nothing about whether the *play* is better.** Whether a player wants to
  place posts is not a thing this repository can measure; nobody plays the game
  yet, and `docs/AGENT_WORKFLOW.md` §3 says a finding that depends on unreadable
  state is a question.

**Weakest claim, and what would change my mind.** §8 item 6 — the shrinking
route throwing a `RangeError` out of `Kernel.step()` — is REASONED from two
lines and was **not** reproduced, because reproducing it requires the mutation
entry point that does not exist. If `continueLeg`'s `?? 0` fallback or an
intervening guard I did not find clamps the index, the hazard is not real and
decision 6 in the ADR is a decision about nothing. What would settle it is one
integration case that authors a route, drives a guard to waypoint index 2,
replaces the definition with a shorter route, and steps — which is a test that
can only be written after decision 2 exists.

The second-weakest is §6 in its entirety, at SEARCH-SUMMARY tier, and it is the
part the ADR leans on least: the divergence argument in §6 rests on §1's
MEASURED shape of `patrolRoute`, not on what that game does.

---

## 10. Sentences owed to the owner

`AGENTS.md`'s fourth exclusion reserves player-facing copy. Each of these is
owed and deliberately not written:

1. **The post tool's label**, in the shape of `.hud-rooms__arm`'s and
   `.hud-build__arm`'s one-word arm labels.
2. **The route tool's label, and its confirm label.** Two controls, because §7
   establishes that a sequence needs a commit.
3. **A sentence for a post the prison cannot route to**, which ADR 0036 open
   question 1 says nothing currently says at all.
4. **A sentence for a route waypoint that cannot be reached.** Distinct from
   the above by the namespace rule at
   `src/simulation/protocol/types.ts:1222-1226`: "you cannot stand there" and
   "the round cannot be walked" are two sentences.
5. **The word for a patrolling guard on the roster row.** §1 measured that such
   a guard reads `Travelling` continuously and effectively never reads
   `On Post`. `Patrolling` would be a third **derived**
   `DisplayedDeploymentPhase`, beside `'returning'` — and that is the cheap
   half of a distinction `src/simulation/security/deployment-phase.ts:61-72`
   draws sharply: a fifth *`DeploymentPhase`* is persisted and *"an \*older\* build
   reading a save that recorded the new value refuses it as `invalid-shape`"*,
   while a word derived at projection time *"avoids that cost entirely"*. So
   the mechanism is free and the word is the owner's.
6. **A name for a sector, if a post surface shows one** — ADR 0036 open
   question 4.

And one question rather than a sentence: **does *dyżur* mean a shift?** If the
owner wants "this post is manned at night", that is `DeploymentBlock` (§2) and
a different feature from a place on the map. The ADR beside this record assumes
"place, and route" and says so.
