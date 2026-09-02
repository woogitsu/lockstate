# ADR 0088: Does a guard walk to its post?

## Status

**Accepted, 2026-09-02, by the repository owner.** They were shown the
measurement this document rests on — 234 roster samples that never once read
`Travelling`, and 842 render-delta samples with zero non-zero velocities — and
the scope it proposes, and signed it as written: guards walk on **deployment
travel and patrol legs only**, with incident response and contraband search
still teleporting for the deadline and balance reasons
[ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) gave when it
excluded every guard errand.

**They were also told, before signing, what this does not buy.** A newly hired
guard spawns *on* its derived sector's post tile (ADR 0036 decision 2's
deliberate coincidence), so ordinary early-game hiring has no distance to
cross, and `Travelling` will be a state a player sees rarely even now. The
signature accepts that: the point is that the vocabulary stops naming
something impossible, not that the animation becomes common. How often a
player should see a guard walking is a separate question and is not decided
here.

**The paragraph below is kept rather than overwritten** (`docs/AGENT_WORKFLOW.md`
§4: mark both directions), because it records the warrant this document had
while it was still a proposal, and that warrant is what was signed:

> **Proposed, 2026-09-01.** Written on `fix/740-a-guard-walks-to-its-post`, with
> the implementation on the same branch, following the convention
> [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) set for
> itself. Nobody has approved it; the argument below is the whole of the
> warrant, and a reader who disagrees with it should treat the decision as open.
> **Never self-approved** — this is a proposal, not a ruling.

**The number was assigned by this branch's own sweep**, per `AGENTS.md` and
`docs/AGENT_WORKFLOW.md`: `docs/adr/README.md`'s stated next-free line reads
`0087`, but a remote sweep across all 414 heads (`git ls-remote --refs --heads
origin`, `docs/adr/` read out of each with `git ls-tree`) found `0087` already
held, unmerged, by `docs/657-what-a-refusal-is`
(`0087-whether-a-refusal-is-an-event-or-a-condition.md`). Nothing on any head
holds `0088`. If this collides with something that lands first, this file, its
row in `docs/adr/README.md` and every citation of it are renumbered without
argument.

---

## The decision, in one sentence

**A guard whose route to a post or a patrol waypoint has resolved walks it,
tile by tile, exactly the way ADR 0059 already walks a prisoner — deployment
travel and patrol legs get their own `LocomotionStore` and their own
`LocomotionSystem` instance, so `Travelling` and `Returning` name a walk a
player can actually watch happen.**

---

## What the code did, and why it is issue #740

`DeploymentSystem.continueDeploymentTravel` and `PatrolSystem.continueLeg`
each resolved a route and, in the same statement, wrote the guard onto the
destination tile:

```ts
// deployment-system.ts, before this change
const sectorId = this.guards.getSectorId(guardId)!;
const postTile = this.sectors.requireDefinition(sectorId).postTile;
this.guards.setTile(guardId, postTile);
this.guards.setDeploymentPhase(guardId, 'on-post');
```

```ts
// patrol-system.ts, before this change
const currentIndex = this.guards.getPatrolWaypointIndex(guardId)!;
this.guards.setTile(guardId, this.legTarget(sector, currentIndex));
```

So a guard's `'travelling'` phase lasted exactly as long as the path request
took to resolve — a handful of ticks against `NavigationSystem`'s work budget
— and then ended in a teleport. Issue #740 measured the consequence in a real
browser: 95 roster samples across two acts, polled every 80 ms, and not one
ever read `Travelling`. The render channel (`RENDER_ACTOR_POPULATION_GUARD`,
live since ADR 0040 slice 2) draws guards, so the snap is visible on screen,
not only in a log.

**This was already the answer to a question ADR 0059 asked and declined to
take.** Its own "Consequences if this stands" section says: *"Guards,
incident responders, contraband searchers and job carriers still teleport on
arrival … The renderer draws no guards today, so nothing on screen
teleports."* The second half of that sentence is no longer true — slice 2
shipped — which is what makes open question 4 (*"Do guards walk, and when?"*)
no longer deferrable. [ADR 0077](./0077-when-a-route-stops-being-valid.md)
went further and *built for* this decision without taking it: it made
`LocomotionStore.advance`'s `canCross` parameter **required**, specifically
because *"a default of 'always allowed' would restore the defect silently for
the next population given a walk — guards are the named candidate."* Nobody
has called `LocomotionStore` with a guard's key until this branch.

---

## Options, with their real costs

### Option 1 — leave it, and rename the labels

`Travelling` and `Returning` could be renamed to something that does not
promise motion — `Dispatching`, `En Route` read the same way to a player who
never sees the state change gradually. This answers the issue's *second*
finding (the labels overclaim) without answering its first (the guard does
not move).

- **Rejected.** The issue's own framing separates the two questions and says
  the first is the one worth answering before the second: *"Whether the snap
  is a defect or a deliberate stand-in for movement `ActorMotion` will later
  animate is UNKNOWN, and that is the first question."* A prisoner already
  walks. Two populations that both teleport-with-a-`Travelling`-label and one
  that walks-with-a-`Travelling`-label would be the inconsistency, not the
  fix for it. Renaming a lie is still telling it in different words.

### Option 2 — a renderer-side interpolation between two known tiles

Keep the abstracted arrival; have the renderer draw a straight line from the
tile a guard left to the tile it is heading toward, timed against the phase's
own duration.

- **Rejected for the reason ADR 0059 rejected the identical option for
  prisoners (its Option 1):** it is a renderer-side movement model —
  `AGENTS.md` boundary 1 — because the renderer would be inventing a path no
  system holds. A guard's route can bend around a wall; a straight line
  between two tiles routinely crosses one. `src/rendering/feed/actors-from-snapshot.ts`'s
  refusal to invent a field applies here exactly as it does there.

### Option 3 — a second, independent locomotion mechanism for guards

Give guards their own walking logic, separate from `LocomotionStore`.

- **Rejected on cost alone.** `LocomotionStore` already handles integer
  sub-tile progress, heading, velocity, the render payload's units, and the
  edge-revalidation rule ADR 0077 added — all correctly, all tested, and all
  reusable as-is. `LocomotionStore`'s own header already argues for "one
  store per population, keyed however that population addresses itself"
  rather than a shared store with an invented composite key; guards keying by
  `EntityId` through a `Map` (rather than a component index into a SoA array)
  is exactly the case that header names and the reason a *second instance* of
  the existing class — not a second class — is the right shape.

### Option 4 — extend `LocomotionStore`/`LocomotionSystem` to a second population (recommended)

`GuardRoster` gets its own `LocomotionStore`; a new `createGuardLocomotionSystem`
(`guard-locomotion.ts`) wires a second `LocomotionSystem` instance around it,
identical in every respect but the closure it advances with. Deployment
travel and patrol legs call `beginWalk` on the resolved route instead of
applying it in one step; arrival is delivered by callback, on the tick the
walk finishes, to whichever of `DeploymentSystem`/`PatrolSystem` owns it.

- **Cost:** the same shape ADR 0059 already paid for and measured — one `Map`
  iteration per tick over guards *in transit* (never more than the guard
  headcount, which this repository's own conventions call "tens, not
  thousands"), one entry allocated per journey, four bytes... no: the guard
  render record already existed at twenty bytes (ADR 0040 slice 2's layout);
  this decision fills in the fifteen of those bytes that were previously
  written as zero (heading, sub-tile offset, velocity) rather than growing
  the payload.
- **What it buys:** `Travelling` and `Returning` become true the whole time
  they are shown, for the reason ADR 0059 gives prisoners the same property.
  A player who watches a guard get hired now sees it cross the prison.
- **The price:** every existing timing assertion in the security test suite
  that measured "does the guard arrive by tick N" now has to account for the
  walk, not only for route resolution. See "What this costs" below — this is
  the same tax ADR 0059 named for prisoners, at a much smaller scale.

---

## Recommendation, and why

**Option 4.** It is not a new decision so much as the second half of one
already made: ADR 0059 built the mechanism, chose the parameters (256 units a
tile, 128 units a tick — the same speed, unargued a second time here because
nothing about a guard's gait is a different claim than a prisoner's), and
named guards as the open question. ADR 0077 built the required-parameter
socket specifically so this could not be skipped by omission. Taking the
option that already has its plumbing laid is the smaller, more reviewable
change, and the one that cannot silently regress into "always allowed" the
way an optional parameter could have.

---

## What changes in the code

1. **`GuardRoster.locomotion`**: a public `LocomotionStore`, alongside the
   `Map<EntityId, GuardRecord>` the roster already keeps tiles in.
   `unassign` cancels an in-progress walk (a release or a failed route can
   interrupt one); `forget` also drops the heading, matching
   `releasePrisoner`'s convention; `loadSnapshot` clears the whole store —
   **no save-format field is added**, for the identical reason ADR 0059 adds
   none for prisoners: a walk is transient state a restored session cannot
   resume into (its path request named a queue a fresh `NavigationSystem`
   does not hold), so it is dropped exactly as it always was, and the guard
   resumes from the tile it had reached.
2. **`createGuardLocomotionSystem`** (`guard-locomotion.ts`) builds one
   `LocomotionSystem` instance around `GuardRoster.locomotion`, with:
   - `canCross`: `navigation.canTraverseEdge(from, to, resolveStaffRouteContext(guard's staff role))`
     — the same re-validation-at-the-edge rule ADR 0077 gives prisoners,
     applied to the same navigation system every guard route is already
     planned against.
   - `writeTile`: `guards.setTile`, unchanged from what the teleport used to
     write, now called once per tile crossed instead of once per errand.
   - `onArrived`: dispatches each finished walk to `PatrolSystem.onArrivedAtLegTarget`
     if the guard holds a `patrolWaypointIndex`, or to `DeploymentSystem.onArrivedAtPost`
     otherwise — the identical test `DeploymentSystem.update` already uses to
     decide which system owns a `'travelling'` guard.
3. **Both systems now begin a walk instead of applying a route**:
   `continueDeploymentTravel` and `continueLeg` call `guards.locomotion.beginWalk`
   on the resolved route's waypoints; a one-waypoint route (already standing
   on the destination) arrives in the same statement, matching the old
   immediate-arrival behaviour for that case exactly. Both also gain the
   `isWalking` guard `ActionSystem.continueTravelling` already has: most
   reconsideration visits to a travelling guard now do nothing, because
   `LocomotionSystem` — registered at order **201**, immediately after the
   prisoner instance and before `security.deployment` (270) and
   `security.patrol` (280) — has already moved it.
4. **The render worker publishes a guard's real position.** `render-actors-keyframe.ts`'s
   `RenderGuardSource` gained a required `locomotion` member (required for
   the reason `canCross` is: an optional one would restore the silence by
   omission), and `encodeRenderActorsKeyframe`'s guard pass reads it the same
   way the prisoner pass already does. No change was needed in
   `actors-from-delta.ts` or `actors-from-snapshot.ts` — both were already
   population-agnostic about where a position and velocity come from, which
   is the property that made the fix here entirely a simulation-and-worker
   change.

---

## Determinism

Unchanged from ADR 0059's argument, applied to a second population:

- The walk is integer arithmetic inside the tick loop (ADR 0020).
- `LocomotionStore.walks` is enumerated as a `Map`, and every walk writes
  only its own guard's tile, so iteration order cannot change where anybody
  ends up.
- The one non-commutative step — arrival order — is the `onArrived` callback,
  handed a set sorted ascending by key (ADR 0005's canonical order) exactly
  as the prisoner instance already receives it. Nothing in this decision adds
  a second thing that needs sorting: a guard's arrival does no room-claim
  contention a prisoner's does, so `DeploymentSystem.onArrivedAtPost` and
  `PatrolSystem.onArrivedAtLegTarget` do not need the tie-break ADR 0062 gave
  `ActionSystem.onWalksArrived`.
- **`tests/determinism/kernel-system-order.test.ts` pins `security.locomotion`
  at order 201** and, separately, still requires every declared order in a
  real session to be distinct — which is why `LocomotionSystem.order` moved
  from a fixed `200` to a constructor parameter defaulting to `200`, rather
  than the guard instance reusing the prisoner's number.
- `./node_modules/.bin/vitest run tests/determinism` — checked: **27 files,
  181 passed, 1 pre-existing skip**, none of them moved by this change.

---

## What this costs, measured

Re-timed rather than assumed, the same discipline ADR 0059 used:

- **`security-default-sector.test.ts`**, "walks a hire that starts somewhere
  else to the post": the old 50-tick budget was sized for route resolution
  alone. Measured on the exact fixture: **74 ticks** now elapse between the
  hire landing and `'on-post'`. Budget moved to 150 for margin.
- The same file's riot-response case: guard 0 (the sector's own deployment
  assignment, walking from the same far tile) is still genuinely
  `'travelling'` the instant the riot flips to `'responding'`, because the
  four incident responders are a *different* claimant
  (`IncidentResponseSystem`, unconverted — see below) that still teleports.
  The checkpoint's expected phases moved from `'on-post'` to `'travelling'`
  for that one guard, proven rather than papered over; the later checkpoint,
  once every incident has closed, waits for the guard's own walk to finish
  before asserting the fully-settled state.
- Three fixtures whose own kernel constructs `DeploymentSystem`/`PatrolSystem`
  by hand (`security-deployment.test.ts`, `security-patrol.test.ts`,
  `security-scale.test.ts`, `security-snapshot-restore.test.ts`) needed
  `createGuardLocomotionSystem` registered alongside them — without it a
  route resolves, a walk begins, and nothing ever advances it, which is
  exactly the shape of bug this ADR's own mechanism should make impossible to
  add *silently*, and did: the failure was a clear "guard stuck at
  `'travelling'` forever" rather than a wrong number.
- Two "genuinely mid-leg" fixtures (`security-snapshot-restore.test.ts`,
  `security-returning-after-restore.test.ts`) used to prove that state by a
  fixed ten-tick wait for "a live `pathRequestId`". Since a short leg now
  resolves and finishes walking well inside ten ticks, a live request is no
  longer the reliable signal; the tests were corrected to wait for
  `locomotion.isWalking` or for the tile to have genuinely left the origin,
  whichever the specific case needed — marked in both directions
  (`docs/AGENT_WORKFLOW.md` §4) rather than silently edited, because the
  assertion they replace was correct about the code it described.
- **Full suite**: 371 files / 4260 passed, 1 pre-existing skip (a
  contention-timeout in `contended-shower-fairness.test.ts`, unrelated to
  this change and confirmed passing alone).

## What this does not cost

Unlike ADR 0059 for prisoners, this decision does **not** move any
`needsPressure`, hunger, or regime-block figure — guards have no needs and no
timetable. The only figures that moved are tick counts a guard's own
deployment or patrol takes to complete, which is exactly and only what
changed.

---

## What is deliberately out of scope

**Incident response (`response-system.ts:818`) and contraband search
(`search-system.ts:372`) still teleport a guard on arrival.** ADR 0059 named
both as excluded for the same reason it gives here, and that reason is
unchanged: *"the two incident paths are deadline-bounded, so making their
travel cost time changes whether an incident lapses — a balance decision with
its own evidence to gather."* A riot response and a search both race a
severity clock; converting either is a decision about how much slower a riot
becomes containable, not a mechanical wiring of an existing store, and it
needs its own measurement the way ADR 0059's speed table needed one. **This
ADR takes deployment and patrol only — the two errands issue #740 is
actually about, and the two whose labels (`Travelling`, `Returning`) the
issue names.**

---

## Consequences if this stands

- `src/simulation/worker/render-actors-keyframe.ts`'s paragraph explaining why
  a guard record always carries zero velocity is corrected in both
  directions (quoted, then answered) rather than silently rewritten.
- ADR 0059's own "Consequences" section, which named guards as still
  teleporting, is now half-true: deployment and patrol walk; incident
  response and search do not. A future reader of that ADR should read this
  one beside it rather than trust the older sentence alone.
- ADR 0059 open question 4 ("Do guards walk, and when?") is answered for two
  of the four guard-teleport call sites it named; the other two remain their
  own open question, restated above rather than left implicit.
- A player who hires a guard, or whose sector runs a patrol route, now sees
  the guard cross the prison — the "world looks alive" half of issue #740
  that a snap could never deliver, regardless of what the labels said.

## Open questions

1. **Should incident response and contraband search walk too?** Both are
   named above as out of scope, with the same reasoning ADR 0059 gave. Taking
   this needs a severity/deadline analysis this ADR does not perform.
2. **Is 128 units/tick still the right speed once a second population is
   drawn walking it?** ADR 0059's speed table was built against prisoner
   starvation, a pressure guards do not have. Nothing here suggests a guard
   should walk at a different speed than a prisoner — an inconsistent pace
   between two populations sharing one screen would be its own defect — but
   the table's *argument* does not apply to guards and this ADR does not
   re-derive one for them; it inherits the number rather than re-arguing it.
