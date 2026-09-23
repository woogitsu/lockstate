# ADR 0092: Who decides where a guard stands, and what a route is

## Status

**Accepted by the owner on 2026-09-23: every decision the 2026-09-02 rulings
left open is accepted as this document recommends it.** Asked what to do with
the decisions still open, they chose the option labelled:

> Pozostałe wg rekomendacji

("The rest as recommended.") The option names no decision, so which decisions
it reaches was worked out by reading this document against its own section
*"The owner ruled on five of these, 2026-09-02"*. **The five rulings of
2026-09-02 stand unchanged**, including the rejection of decision 2's
`redefine`. The list below is that reading, decision by decision:

| Decision | Before 2026-09-23 | What the 2026-09-23 ruling does |
|---|---|---|
| 1 — a post is a property of the sector (option A) | open | **accepted**, option A, guards stacking on one tile included |
| 2 — a narrow `redefine` | **rejected** 2026-09-02 (ruling 2: a placed post is a new sector) | nothing; stays rejected |
| 3 — the save payload is authoritative | **confirmed** 2026-09-02 (ruling 3), built in #825 | nothing |
| 4 — a route is an ordered list of waypoints | **storage confirmed** 2026-09-02 (ruling 4), gesture decided differently | nothing new; the storage was already ruled |
| 5 — an unreachable post or waypoint is kept and reported (option A) | open | **accepted**, option A |
| 6 — a shortened route's index is clamped where it is read | open | **accepted as written**, its own condition included: if the hazard proves unreachable, the decision is dropped |
| 7 — two commands, neither undoable, each with its own refusal namespace | open | **accepted**, except the route gesture, which ruling 4 of 2026-09-02 already replaced |
| 8 — out of scope | open, and **partly overtaken** by ruling 1 of 2026-09-02 (a duty shift is in scope) | **accepted** for every bullet except the duty-shift one, which stays overtaken |

**Two readings in that table are judgements, and they are named here so a
reader can check them.**

- **Decision 4 is listed as already ruled.** The comment on
  [#557](https://github.com/matmaxalez/lockstate/issues/557) that records this
  ruling names *"a route is stored as ordered waypoints"* among the decisions
  accepted now. This document's own decision 4 heading reads *"CONFIRMED as to
  storage"* from 2026-09-02, so that clause adds nothing. Either reading gives
  the same result: ordered waypoints, owned by the sector.
- **Decision 6 is accepted together with its self-cancelling clause.** It was
  written as a guard against a hazard that only decision 2's `redefine` made
  reachable, and decision 2 was rejected. Under ruling 2 a player-placed post
  is a new sector. A `redefine` does exist, but only on decision 3's restore
  path, and a restore clears the walking index. Whether `SetSectorPatrolRoute`
  can shorten a route under a walking guard depends on how that unbuilt
  command changes an authored sector's definition. The decision's own words
  already cover this: *"If an intervening guard clamps it already, this
  decision is about nothing and should be dropped."* The acceptance does not
  go further than those words.

**The open questions are not decisions and the label does not reach them.**
Open questions 1 and 6 were answered on 2026-09-02. Questions 2, 3, 4, 5 and 7
carry no recommendation to accept, and they stay open. The same applies to
every player-facing sentence this feature needs. The 2026-09-04 partial release
of reservation 4 makes the wording ours and leaves its truth the owner's.

**The provenance is the weaker kind.** The ruling is the *label of a clickable
option the integrating session wrote and the owner chose*, not a sentence they
typed. `AGENTS.md` flags the same shape for its entries of 2026-09-08,
2026-09-09 and 2026-09-10. It is recorded there as ruling 20 of the section
*"Instructions recorded that are not releases"*. The `Proposed` block below is
kept rather than replaced, on the pattern
[ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md)'s Status
block sets.

---

**Proposed, 2026-09-02. Not self-approved.** *(The state of this document
before the ruling above.)* **One of the eight decisions is
now implemented and the other seven are not**; a reader who disagrees with any
of them should still treat the document as open, because the argument is the
whole of the warrant and the owner has signed no part of it beyond what is
named below.

**Decision 3 landed on `main` in `4a53d292` (pull request #825).** The restore
path now applies a sector definition the save payload carries, through
`SecuritySectorRegistry.redefine`, instead of skipping any sector id the
runtime already holds. That is the decision the owner marked *CONFIRMED as
written*, and it is the only one that has been built. Nothing else here has a
line of code behind it: no command, no `SetSectorPost`, no control a player can
press, and no field a player can author.

> **The sentence this replaces is kept, because how it came to be wrong is the
> point.** It read: *"Nothing below is implemented and no code on this branch
> does any of it; the branch carries this document, the research record it
> rests on, and one contract test that pins the absences the document is
> about."* Every word was true the day it was written. **It was falsified by
> the very pull request that implemented the decision it describes** — #825
> built decision 3 and never opened this file, so nothing brought the two into
> contact, and the sentence went stale within one release of being written.
> `docs/adr/STATUS-QUEUE.md`'s anchor at v0.0.377 caught it and handed it back
> rather than editing it, which is why this correction is a separate change
> with its own reasoning rather than a line buried in an anchor pass.
>
> **The lesson is mechanical, not moral**: an ADR that says *"nothing here is
> implemented"* is a claim about the code, and it is the one claim in an ADR
> that a pull request can invalidate without touching the ADR at all. A
> document whose status says that should expect to be re-read whenever any of
> its decisions ships, and no gate in this repository does that for it.

Answers the owner's request of 2026-09-02, in their own words: *"warto dodać
ustawienie posterunku/dyżuru w konkretnym miejscu lub na konkretnej trasie jak
w prison architect, zrob research"* — it is worth adding the setting of a
post/duty at a specific place, or on a specific route, like in Prison
Architect; do research.

The evidence is `docs/research/2026-09-02-where-a-guard-stands.md`, measured on
v0.0.358 (`9b8c8e85`). **Prison Architect is read there as a source of options
and not as an authority**, at that record's SEARCH-SUMMARY tier, and this
document departs from it twice on purpose (decisions 1 and 4). `AGENTS.md`
forbids copying that game's code, assets, text or UI layouts.

**Every player-facing sentence this feature needs is deliberately absent from
this document.** `AGENTS.md`'s fourth exclusion reserves them, and the research
record's §10 lists the six that are owed. Where a sentence is owed below, it
says so rather than proposing one.

### The number

**0092**, assigned by this branch's own remote sweep rather than by `max + 1`
off disk, per `AGENTS.md` and `docs/AGENT_WORKFLOW.md` §2.
`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
`git ls-remote --refs --heads origin` — **448 heads** — with
`git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
Nothing on any head holds `0092`; the highest number any head holds is `0091`,
which is on `main`. `docs/adr/README.md`'s stated next-free line reads `0092`
and the sweep agrees with it, which is worth recording because the previous
four passes each found the stated line behind the sweep. Two heads still state
`0091` as next-free (`measure/717-what-cancelling-gives-back`,
`measure/the-construction-schedule-window`), and neither carries an ADR file,
so neither holds a number.

**This document pre-commits to renumbering without argument** if a branch that
lands first turns out to hold `0092`: this file, its row in
`docs/adr/README.md` and every citation of "ADR 0092" move together.

**The document sets its own status and the index only reports it.** The row
added in this commit says `Proposed`, because this section does.

---

## The owner ruled on five of these, 2026-09-02 — and rejected one recommendation

**This section is the record of what was decided; the decisions below are left
as written and each affected one is marked in place.** The document stays
`Proposed` as a whole: **five** questions of its seven now have answers, two do
not. The fifth ruling answers open question 6, which had itself been *created*
by the first four — so the count of answered questions and the count of open
ones both moved on the same day, in opposite directions.

> **"The document stays `Proposed` as a whole" stopped being true on
> 2026-09-23.** The owner accepted the rest as recommended, and the Status
> block above records which decisions that reaches. The sentence is kept
> because it was true for three weeks, and this section is the record of what
> the 2026-09-02 rulings did and did not settle.

> **The sentence this replaces is kept, because the shape it describes is the
> finding.** It read: *"four questions of its seven now have answers, three do
> not, and one new one was created by an answer."* One ruling closing a question
> that an earlier ruling opened is the loop this document was written to
> demonstrate, and it closed within a day.

**1. *Dyżur* means shifts, so this document answers half the feature.** The
owner's original words were *"posterunku/dyżuru"* — post **or duty** — and the
scoping question was put to them directly, with the finding that
`DeploymentBlock`'s multi-block form is an unauthored capability and that its
validator `assertGaplessDeploymentSchedule` has **no call site in `src/` at
all** (verified: it is exported at `deployment-schedule.ts:25` and named in two
comments, and nothing calls it). They ruled that **duty means a time shift as
well** — this guard stands here from dawn to noon, then another. So decision 8's
out-of-scope list is now **wrong about the schedule**, and a second ADR is owed
for it. This document's *"place, and route"* assumption is accurate as far as it
goes and is no longer the whole subject.

**2. A player-placed post creates a NEW sector; the recommended `redefine` is
rejected.** Decision 2 recommended narrowing the registry with a `redefine`, and
the owner **did not take it**: the registry stays append-only, the derived
default stays untouched, and a placed post is a new sector beside it. The cost
was stated when the question was put — *"wtedy dwa sektory rywalizują o tych
samych strażników i trzeba rozstrzygnąć, który wygrywa"* — and the ruling was
made with that in front of them, so **it is a known consequence rather than an
oversight**. See open question 5 below, which this answer creates.

**3. The save payload is authoritative — decision 3 is confirmed as written.**
The owner was shown the measured defect (`session-systems.ts:731` does
`continue` when the runtime already holds a sector of that id, and the derived
default is registered first, so a bundle carrying `postTile: (20,20)` and two
waypoints restores as (16,16) with no route, **silently**) and ruled that what
the player placed must come back. The `continue` goes. No bump and no migration:
`patrolRoute` has been in the V5 schema since it was written, and ADR 0038
decision 1 covers an optional field whose absence has one meaning.

Note the interaction with ruling 2, which the ruling's own framing anticipated:
if a placed post is a *new* sector with its own id, `continue` never fires for
it, so ruling 3 is belt and braces rather than the whole fix. It is still the
right rule — a payload that carries a definition for a sector the runtime holds
should not have it thrown away in silence — and it closes the case where the
ids do coincide.

**4. The route is drawn as a region and the ordered list is derived from it.**
Decision 4's *storage* stands unchanged: the sector holds an ordered list of
waypoints, because that is what `PatrolSystem` consumes and what makes its loop
budget and metrics mean anything. What the owner chose is the **gesture**: the
player paints a rectangle, and the perimeter walk is derived from it. The
measurement is what makes this coherent rather than a compromise — the recorded
run authored **four waypoints and the guard visited sixteen tiles, the
rectangle's whole perimeter**, so a perimeter circuit is already what happens.
Prison Architect's painted region was rejected as a *storage* model for the
reason the research gives: a region has no order, so it cannot produce the loop,
budget or metrics `PatrolSystem` already keeps. Drawing a region and deriving
the order takes the cheap gesture without giving up the field the engine wants.

**The stated cost of this, accepted:** a player cannot draw a route that is not
a rectangle. Decision 4's own list-of-waypoints storage means a non-rectangular
route remains *expressible* in the save format and by a future gesture — the
ruling constrains what the first tool can draw, not what the sector can hold.

**5. Which of two competing sectors owns a guard: THE PLAYER'S SECTOR WINS.**
Put to the owner as open question 6 — the question this document's own first
four rulings created, and the one it marked as needing an answer *before* the
placement command ships. Of the three candidate rules named there, the owner
took the first: **a sector the player authored outranks the derived default,
and the derived default becomes a fallback that posts only a guard nobody else
has claimed.**

**What this rules out, and why that matters more than what it rules in.**
*Registration order* would have made the derived default permanently senior,
because it exists from the first tick of a new prison and an authored sector
cannot predate it — so the first post a player ever places would have been
ignored, and the game would have read as broken rather than as arbitrated.
*Higher occupancy pressure* needs no new concept, which was its whole appeal,
and it is the only one of the three a player cannot predict: the same press
would post a guard or not depending on a number the interface does not show.
Against the standing design direction — the game is to be easy and friendly,
with no hidden mechanics — an unpredictable arbiter is the worst of the three
even though it is the cheapest.

**The cost this ruling accepts, stated rather than discovered later.** It needs
a distinction the code does not have today: *authored* versus *derived* sector.
`deriveDefaultSecuritySector` produces the default and decision 6 leaves it
unchanged, so the new field is a mark on the definition rather than a change to
the derivation — and `claimableGuardIds` (`guard-roster.ts`), which today draws
only from `'unassigned'` guards and arbitrates nothing, becomes the place the
rule is enforced. **The first prison a player places a post in is still a
prison with more requirement than roster** — six residents ask for exactly one
guard — so this ruling does not make every requirement satisfiable; it makes
the *unsatisfied* one the derived default's rather than the player's, which is
the half a player can see.

**What is still not decided by this.** Nothing here says what the interface
tells a player whose derived default went unstaffed because their own post took
the guard. That sentence is a new promise to a player and is the owner's; it is
named in the open questions rather than written here.

## The decision, in one sentence

**A post and a patrol route are properties of a *sector*, authored by the
player through two commands and changed through one narrow, explicit
`redefine` on `SecuritySectorRegistry`; a route is an ordered list of
waypoints, never a painted region; the save payload becomes authoritative for
a sector definition it carries; and a post or waypoint the player makes
unreachable is kept as written and reported, not silently moved.**

---

## Context: the mechanism is finished and starved

The research record's §1 is the whole reason this document is short on
mechanism and long on ownership. Measured in a real session, from
`createNewSimulationRuntime` through real commands:

| | shipped game | same session, one field later |
| --- | --- | --- |
| phase | `on-post` at (16,16) | `travelling` |
| ticks walking | 0 | **2,392 of 3,000** |
| distinct tiles visited | 1 | **16** — the authored rectangle's perimeter |
| loops on time / late / missed | 0 / 0 / 0 | **74 / 0 / 0** |
| render samples with non-zero velocity | 0 | **2,392 of 3,000**, at 128 units/tick |

The one field is `SecuritySectorDefinition.patrolRoute`, and **nothing under
`src/` writes it** — pinned this session in
`tests/foundation/security-sector-authorship-contract.test.ts`. `postTile` has
exactly one writer, `deriveDefaultSecuritySectorPostTile`, which computes the
middle of the first owned chunk (`src/simulation/security/default-sector.ts:194-201`)
— (16,16) for a new session, which is the same tile `HireStaff` sends every
guard to (`src/main.ts:621`, `src/main.ts:2992-2993`, re-anchored). So deployment travel has
no distance and a patrol leg has no route, and
[ADR 0088](./0088-does-a-guard-walk-to-its-post.md)'s accepted mechanism has
nothing to act on.

Three things this document therefore does **not** decide, because an existing
ADR decides them:

- **How a guard walks.** ADR 0088, Accepted by the owner on 2026-09-02, for
  deployment travel and patrol legs.
- **What happens to a route mid-walk when the ground under it changes.**
  [ADR 0077](./0077-when-a-route-stops-being-valid.md) decision 1: *"No actor
  may traverse an edge that is non-traversable at the tick on which the edge is
  crossed, regardless of when its route was calculated. A route is a plan, not
  an entitlement."* A guard whose drawn route now crosses a wall stops at the
  wall and re-plans. Decision 5 of that document made `canCross` a required
  parameter precisely so this could not be skipped, and ADR 0088 is the call
  site that answered it.
- **Whether several guards walking one route need an arrival tie-break.** ADR
  0088: *"a guard's arrival does no room-claim contention a prisoner's does, so
  `DeploymentSystem.onArrivedAtPost` and `PatrolSystem.onArrivedAtLegTarget` do
  not need the tie-break ADR 0062 gave `ActionSystem.onWalksArrived`."*

And two things [ADR 0036](./0036-a-derived-default-security-sector.md) hands
forward by name, which are decisions 2 and 3 below:

> "**`SecuritySectorRegistry` has no un-register and no replace**, deliberately:
> it captures each governed door's baseline state at `register` time. Adding one
> is a decision about what happens to the sector's live control state and to
> anything naming it, and that decision is not this document's."
> — ADR 0036 decision 4 point 2

> "The payload's row for this sector is therefore never read."
> — ADR 0036 decision 6

---

## Decision

### 1. A post is a property of the sector, not of a guard

`SecuritySectorDefinition.postTile` stays where it is and stays singular. Every
guard the sector's requirement posts stands the same tile.

**Options.**

- **A. Keep it on the sector (recommended).** Nothing that reads a post tile
  changes: `DeploymentSystem` (three sites), `PatrolSystem`'s closing leg,
  `IncidentResponseSystem`'s responder destination
  (`src/simulation/incidents/response-system.ts:427`), `sector-occupancy.ts`'s
  post-tile occupant test (`src/simulation/security/sector-occupancy.ts:123`),
  `displayedDeploymentPhase`, and the projection. **Cost:** guards stack. A
  24-prisoner prison requires three posted guards
  (`src/simulation/security/sector-staffing.ts:147`) and
  `assignUnassignedGuards` sends all three to one tile
  (`src/simulation/security/deployment-system.ts:196`). Prison Architect does
  not do this; its stationed guards roam a zone.
- **B. A post per guard**, held on `GuardRecord`. **Cost:** `guardRecordSchema`
  is `.strict()` (`src/persistence/save-schema.ts:727-738`), so a per-guard post
  is a new persisted field on a strict object — allowed without a version bump
  under [ADR 0038](./0038-what-makes-a-save-compatible.md) decision 1 while
  absence means "use the sector's", but it also makes *assignment* a player
  gesture: somebody has to say which guard stands which post, which is a second
  surface (a roster row control) on top of the map gesture, and it must respect
  [ADR 0053](./0053-who-may-stand-a-security-post.md)'s post-eligibility filter
  rather than bypassing it.
- **C. A list of post tiles on the sector**, filled in order by
  `assignUnassignedGuards`. **Cost:** it is B's spreading without B's control —
  the player says where the posts are but not who holds which — and it makes
  `postTile` ambiguous for the four readers above that want *one* tile,
  particularly `IncidentResponseSystem`, which needs a destination and not a
  set.

**A, and the stacking is accepted rather than hidden.** Two reasons. First,
this codebase already accepts co-located actors by decision: ADR 0036 decision
2 records that unhoused arrivals accumulate on the post tile, and nothing
reserves a tile for an actor. Second, C is A with the readers broken and B is a
different feature — B is *assignment*, and the owner asked for *placement*.
**If the owner wants "this guard, that post", that is B and it is a second
ADR**; this one deliberately does not build toward it, and B remains reachable
because a per-guard override read before the sector's is a widening rather than
a rewrite.

### 2. A sector definition changes through one narrow `redefine`, and only three fields move

> **NOT TAKEN. The owner ruled on 2026-09-02 that a placed post creates a new
> sector instead, leaving the registry append-only and the derived default
> untouched.** The reasoning below is kept because it is the argument the
> decision was made against, and because open question 5 — which of two
> competing sectors owns a guard — exists *because* this was declined. Read it
> as the rejected option, not as the plan.

`SecuritySectorRegistry` gains exactly one mutator:

> `redefine(id, changes: { postTile?, patrolRoute?, expectedPatrolLoopTicks? })`

It throws for an unknown id. It cannot change `id`, `gradeId` or `doorIds`. It
does not touch `controlStates` or `normalDoorStates`.

**Why narrow rather than a general replace.** ADR 0036 decision 4 point 2 (quoted
above) names the hazard exactly: the registry captures each governed door's
baseline state at `register` time, so a replace that changed `doorIds` would
have to decide what happens to a baseline it never captured and to a door whose
baseline it now holds for a sector that no longer governs it. **The three
fields above are the three that no other registry state is derived from.** A
general `replace` is a bigger decision and it is not needed for this feature;
an `unregister` is bigger again and is ADR 0036 open question 5's, not this
document's.

**Options rejected.**

- **Re-register under a new id.** Rejected on ADR 0036 decision 4 point 1's
  reasoning, which this document does not improve on: a sector id is written
  into incident records, guard records, gang territory claims,
  `SectorRiskTracker` state and the save payload, and *"an id that moved with
  the world would strand every one of them"*.
- **Mutate the definition object in place.** `SecuritySectorDefinition`'s fields
  are `readonly` and `all()` hands the stored object out. In-place mutation
  would let any holder of a definition change the registry, which is the
  ownership collision `guard-roster.ts`'s header is careful about.
- **A whole second registry of player overrides, consulted before the
  definitions.** It keeps `register`-only purity and costs every reader a second
  lookup and a merge rule; five readers would each have to remember it. Rejected
  on the "one passability rule, one place" reasoning ADR 0077 decision 4 uses.

**A live control state is left alone deliberately, and that is a stated cost.**
A sector under lockdown whose post moves stays under lockdown. Since the derived
sector governs no doors (ADR 0036 decision 5), a lockdown cascades onto nothing
today, so this costs nothing observable now and will need re-examining the first
time a sector has a perimeter.

### 3. The save payload is authoritative for a sector definition it carries — no bump, no migration

> **CONFIRMED by the owner, 2026-09-02, as written.**

`restoreSessionSystems` step 1 currently skips any sector id the runtime
already holds (`src/simulation/runtime/session-systems.ts:731-733`), and
`createNewSimulationRuntime` has already registered the derived default
(`src/simulation/runtime/new-session.ts:1157`). So the payload's row for the
default sector is never read. **Measured:** a bundle hand-edited to carry
`postTile: (20,20)` and a two-waypoint route restores to `postTile: (16,16)`
with no route, silently — research record §4. A player who drew a route and
reloaded would find it deleted.

The loop becomes: for a sector id the runtime already holds, **apply the
payload's `postTile`, `patrolRoute` and `expectedPatrolLoopTicks` through
decision 2's `redefine`**; for an id it does not hold, `register` as today.

**`SAVE_SCHEMA_VERSION` stays 5, no persisted field is added and there is no
migration.** `securitySectorDefinitionSchema` has carried `postTile` and
`patrolRoute: z.array(tilePositionSchema).optional()` since V5
(`src/persistence/save-schema.ts:717-726`). ADR 0038 decision 1's rule —
*"every section the build needs and the save omits has exactly one meaning"* —
is satisfied without argument: an absent `patrolRoute` means "this sector is
not patrolled" today and would mean "the player has drawn no route" after, and
those are the same behaviour.

**Safe for every save that exists, and this is arithmetic rather than
optimism.** `tests/integration/security-default-sector.test.ts` already pins
that a captured row is identical to the derived one — its own case is *"carries
a copy in the payload that is identical to the derived one, which is what makes
skipping it safe"* — so for every V5 file any shipped build has written,
preferring the payload changes nothing at all.

**What it costs, said plainly: the forcing function that assertion provides.**
Today, changing the derivation rule makes that test fail, which ADR 0036
decision 6 calls *"the forcing function this arrangement is worth having"*.
Preferring the payload removes it. **The replacement is a narrower assertion
that keeps the property that matters** — that a session whose payload carries no
player-authored fields still derives the same sector — plus a new case that a
payload carrying a post and a route restores both. Both are named here so the
implementer cannot quietly drop the first.

**Option rejected: a separate `security.playerAuthoredSectors` section.** It
would leave the identity assertion intact and cost a new persisted section,
which is a real save-schema addition rather than a reinterpretation, and it
would put two answers for one sector's post tile in one file with no rule for
which wins. Rejected on ADR 0038's own preference for absence having one
meaning.

### 4. A route is an ordered list of waypoints, and it belongs to the sector

> **CONFIRMED as to storage; the gesture is decided differently.** The owner
> ruled on 2026-09-02 that the player paints a rectangle and the ordered
> perimeter walk is derived from it. The list below stays exactly as the
> sector's storage; what changes is what the first tool draws.

`patrolRoute: readonly TilePosition[]`, in walk order, closed by
`PatrolSystem`'s existing return leg to the post. Every guard the sector posts
walks the same loop.

**This is a deliberate departure from the reference.** Prison Architect draws a
patrol by *"left click and drag your desired route onto the deployment map"* and
removes one by *"right click and drag over the route you want to delete"*, which
makes it a **painted set of squares** with no order (research record §6,
SEARCH-SUMMARY). A painted region cannot produce an order, so it cannot produce
a loop, a `expectedPatrolLoopTicks` budget, or the on-time/late/missed counters
`PatrolSystem` already keeps and `projectSecurity` already publishes
(`src/simulation/presentation/security-projection.ts:229-236`).

**Options.**

- **A. Ordered waypoints (recommended).** The field that exists; the engine
  that works; §1's measurement is of exactly this shape. **Cost:** the gesture
  is a sequence, and no HUD tool produces one (decision 7).
- **B. A painted region, converted to an order at commit time.** **Cost:** the
  conversion is an invented decision — which tile is first, and which way round
  — and an invented one that the player did not make and cannot see. It is the
  same objection ADR 0088 makes to a renderer inventing a path: *"the renderer
  would be inventing a path no system holds"*.
- **C. A painted region, with a region-shaped second patrol concept beside the
  sequence-shaped one.** **Cost:** two patrol systems and a rule for which one
  `PatrolSystem` obeys, to keep a gesture. Rejected on cost.

**A.** And the route is the *sector's* rather than a guard's for decision 1's
reason, with one addition: several guards on one loop is the behaviour the
reference recommends (*"assign multiple guards to the sector and create smaller
routes"*) and ADR 0088 has already ruled that it needs no ordering decision
here.

### 5. A post or waypoint the player makes unreachable is kept and reported, never moved

The prison keeps the player's intent. `DeploymentSystem` already counts
`deploymentFailures` and retries next cycle; `PatrolSystem` already counts
`loopsMissed`, settles the guard on `'on-post'` and re-paths from wherever it
stands (`src/simulation/security/patrol-system.ts:141-152`). Neither behaviour
changes. What is added is that **the player is told**, through the refusal
channel, and the sentence is owed (below).

This answers ADR 0036 open question 1 — *"A wall at (16, 16) makes the post
unroutable: `deploymentFailures` counts and the guard returns to the pool,
retried every cycle, for ever. Nothing tells the player."* — for the case where
the post is the player's own.

**Options.**

- **A. Keep and report (recommended).** **Cost:** a guard can be unassigned
  indefinitely while the player's post is walled in, and coverage reads short
  the whole time — which is true, is the player's own doing, and is now visible.
- **B. Move the post to the nearest routable tile.** **Cost:** the game silently
  overrules a placement the player made, which is the hidden state
  `tool-arming.ts` records the owner's standing directive as ruling out
  (*"one control whose outcome depends on invisible history"*, generalised). It
  also needs a nearest-routable search that nothing in `src/` has.
- **C. Refuse the build that would strand a post.** **Cost:** a build refusal
  that depends on a security placement couples two subsystems that share
  nothing today, and it refuses a wall the player may well want more than the
  post. ADR 0036 open question 1 lists this option and notes the third
  candidate — a refusal raised on a *state* rather than a command — *"is a shape
  this repository does not have yet"*, and [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md)
  is where that shape is being decided.

**A**, and it is explicitly the cheap answer: it changes no simulation
behaviour at all, only what is said. If ADR 0087's condition-shaped refusal
lands, "this post cannot be reached" is a natural first citizen of it, and
that is a better home than either B or C.

### 6. A route may be shortened while a guard is walking it; the index is clamped where it is read

`PatrolSystem.continueLeg` re-requests the stored waypoint index unchecked
(`src/simulation/security/patrol-system.ts:131`) and `legTarget` throws a
`RangeError` for an index past the end
(`src/simulation/security/patrol-system.ts:91`). Today that is unreachable —
the registry cannot be mutated and `GuardRoster.loadSnapshot` clears the index
on restore (`src/simulation/security/guard-roster.ts:288`). **Decision 2 makes
it reachable**, and a `RangeError` out of `Kernel.step()` ends the session.

So: an index at or past `patrolRoute.length` is treated as the closing leg
(`RETURNING_TO_POST`) rather than thrown on, and the guard finishes the loop it
is on from wherever it stands. `legTarget`'s throw stays for a genuinely
negative index other than the sentinel, because that is a code defect rather
than a player action.

**This is the weakest decision in this document**, and the research record says
why: the hazard is REASONED from two lines and was not reproduced, because
reproducing it needs decision 2 first. If an intervening guard clamps it
already, this decision is about nothing and should be dropped. The test that
settles it — author a route, drive a guard to index 2, `redefine` a shorter
route, step — can only be written after decision 2 exists, and the
implementation of decision 2 owes it.

**Option rejected: cancel every walk in the sector on `redefine`.** It is
simpler and it is worse: a player adjusting one waypoint would reset every
guard's loop and every loop timing, and `loopsMissed` would move for a player
action rather than for a prison condition, which makes the metric mean two
things.

### 7. Two commands, neither undoable, each with its own refusal namespace

- **`SetSectorPost`** — a sector id and a tile. One press, one tile.
- **`SetSectorPatrolRoute`** — a sector id and an ordered tile list. The empty
  list clears the route, which is the removal gesture; there is no separate
  clear command, because an empty list is unambiguous where `UnzoneRoom`'s
  rectangle was not.

**Neither is undoable**, following `UnzoneRoom`'s stated precedent: *"Neither
command produces a construction order, so `ConstructionSystem` has nothing to
group either of them under and `Undo` cannot reach either -- which is exactly
why removal is a command of its own rather than a use of undo."*
(`src/simulation/protocol/commands.ts:86-90`).

**Refusal reasons are namespaced per command**, per
`src/simulation/protocol/types.ts:1195-1207`, and the namespace does real work
here for exactly the reason that comment gives: "you cannot stand there" and
"that round cannot be walked" are two sentences. `REFUSAL_LABEL_KEYS`
(`src/ui/simulation-alerts.ts:34`) is total over the union, so a new member
fails the build until a `LocalizationKey` is named for it — which is the right
shape, and **the key's sentence is the owner's**. Refusals are not persisted:
nothing in `src/persistence/save-schema.ts` carries one, so the wire cost is
zero saves.

**The gesture.** A post is `ObjectTool`'s shape — one press, one tile, arming
held as the `HudToolArming` pair `src/ui/hud/tool-arming.ts:24-29` already
extracts — so it is a fourth sibling of `BuildTool`/`RoomTool`/`ObjectTool` or a
mode on a new small class, and it costs nothing new. **A route is a sequence and
no tool in this HUD produces one**: `RoomTool` drags a rectangle, `BuildTool`
drags a run of edges, `ObjectTool` presses one tile, and nothing accumulates an
ordered list across presses and then commits it. The smallest honest gesture is
*arm, press tiles to append, press a confirm to commit*, and `RoomsPanel`
already has the confirm half of that pattern. **The genuinely new thing is the
held, uncommitted, ordered list**, which is chrome state no tool keeps.

**What the gesture collides with, and it is not new.** `.hud-minimap` covers
14.5% of the screen at 1280×800 (measured in
`docs/research/2026-09-02-the-world-view.md` §0) and silently eats presses over
it: at the panel's centre, *"press -> commands: []"* with both feedback channels
`"hidden" -> "hidden"`, while the identical gesture 259px right produced a
`PlaceBuildOrder`. **A one-press post is strictly worse off than a drag**: a
wall run that loses three of six presses still builds three walls; a post press
that lands on the minimap places nothing and says nothing. This document does
**not** decide what to do about that — it is a HUD-layout decision with its own
evidence — but it records that the collision is a cost of this feature and not
only of that panel.

**And there is nowhere to read a post back.** `hud/security` has no subscriber:
`tests/foundation/projection-reachability-contract.test.ts:326` records it as
*"No reader"*, while `projectSecurity` already publishes `postTile` and the
whole `patrol.waypoints` list. So a post the player places is visible only if
the map draws it. **Drawing it is part of this feature's cost, not an
enhancement** — `docs/research/2026-08-28-drawing-guards.md` §3 already argues
why an invisible lever is worse than an imperfect visible one.

### 8. Out of scope, named rather than left implicit

> **PARTLY OVERTAKEN. The owner ruled on 2026-09-02 that a duty shift is in
> scope for the feature**, so whatever this list says about scheduling who
> stands a post and when is no longer the boundary. A second ADR is owed for
> `DeploymentBlock`'s multi-block form; this document is not it, and nothing
> below was written expecting it.

- **Drawing a sector.** ADR 0036 open question 5 and issue #396's option 2. A
  sector still has no extent — `SecuritySectorDefinition` has no rectangle and
  never had one — and the derived sector remains the only one. This document
  moves a post inside a sector nobody drew; it does not let anybody draw one.
- **A perimeter.** `doorIds` stays `[]`, so a lockdown still cascades onto
  nothing, exactly as ADR 0036 decision 5 records.
- **Per-guard assignment.** Decision 1 option B, reachable later.
- **A duty *shift*.** `DeploymentBlock`'s multi-block form has no author and
  `assertGaplessDeploymentSchedule` has no caller in `src/` at all
  (`src/simulation/security/deployment-schedule.ts:25-37`), so "this post is
  manned at night" is a whole unauthored capability. **The owner's word *dyżur*
  may mean this**, and the research record's §10 asks. This document assumes
  "place, and route".
- **Incident response and contraband search walking.** ADR 0088's own open
  question 1, unchanged.
- **Every player-facing sentence.** Six are owed; the research record's §10
  lists them.

---

## What this changes in the code, if it stands

1. `SecuritySectorRegistry.redefine` (decision 2) — and
   `tests/foundation/security-sector-authorship-contract.test.ts`'s pin on the
   registry's public surface goes red until it is updated, which is what that
   pin is for.
2. `restoreSessionSystems` step 1 prefers the payload for a held id (decision
   3), plus the two integration assertions decision 3 names.
3. `PatrolSystem.continueLeg`/`legTarget` clamp instead of throwing (decision 6),
   with the test decision 6 owes.
4. Two commands in `src/simulation/protocol/commands.ts`, two refusal
   namespaces, and a worker-side handler each (decision 7).
5. A post tool and a route tool at the composition root, and whatever draws
   them on the map (decision 7).
6. `deriveDefaultSecuritySector` is unchanged. The derivation stays the
   *default*, and a player who never touches either control gets exactly
   today's prison — which is what makes this additive rather than a rewrite of
   ADR 0036.

## Determinism

Nothing here draws from an RNG stream, a clock or a `Set`/`Map` iteration
order. A `redefine` is a command-ordered mutation, so it lands at a tick like
every other command; `SecuritySectorRegistry.all()` already sorts by id
(`src/simulation/security/sector.ts:101-103`); the waypoint list is ordered by
construction. Decision 6's clamp replaces a throw with a deterministic branch.

## Consequences if this stands

- **ADR 0088's mechanism becomes reachable.** Its "Consequences" sentence — *"A
  player who hires a guard, or whose sector runs a patrol route, now sees the
  guard cross the prison"* — is true of neither half today, for two different
  reasons, and decisions 3, 4 and 7 make the second half true. The first half
  needs a *placed* post, which decision 7's `SetSectorPost` supplies.
  **The amendment to ADR 0088 recording all of this is the owner's to write and
  is deliberately not written here.**
- **ADR 0036 stops being the whole story about a sector.** Its decision 7 — *"No
  command, no refusal, no locale key: this is not a player gesture"* — is
  accurate about the derivation and would no longer be accurate about the
  sector. That sentence should be marked in both directions rather than
  overwritten, per `docs/AGENT_WORKFLOW.md` §4.
- **A patrolling guard's roster row reads `Travelling` continuously**, measured
  in the research record §1: `onArrivedAtLegTarget` requests the next leg in the
  same statement it records the arrival, so `'on-post'` is held for part of one
  tick per loop. Coverage is unaffected. The word is a sentence and is owed.
- **`loopsMissed` becomes a number a player can cause**, by drawing a route
  through a wall. It is currently structurally zero.
- **The forcing function in `security-default-sector.test.ts` is replaced, not
  removed** — decision 3 names the replacement.

## Open questions

1. **Does *dyżur* mean a shift?** If so, `DeploymentBlock` is the feature and
   this document answered the wrong half. Asked in the research record's §10 and
   not answered here.
2. **What draws a post and a route on the map?** Decision 7 establishes that
   nothing reads `hud/security` and that drawing is part of the cost, and stops
   there. Whether the post is a sprite, an overlay tile or a marker in the
   existing ghost layer is a rendering decision with ADR 0040's slices behind it.
3. **Should a post require walkable, owned ground at placement time?** Prison
   Architect requires a deployable area to be walled with a door. Decision 5
   deliberately accepts an unreachable post rather than refusing it, so the
   *placement* validation is left at "owned land" by omission — which is an
   omission, and naming it is the point.
4. **Does the derived post tile stay the default once a player can move one?**
   ADR 0036 decision 4's "derived once, never re-derived" is unchanged here, and
   its open question 2 (what a land purchase does to "the first owned chunk")
   becomes sharper once a player-set post exists beside a derived one.
5. **Is one route per sector enough?** Prison Architect's two colours exist only
   so routes can overlap, which is a symptom of many routes per area. With one
   sector there is one route, and the question arrives with the second sector.
6. **Which of two competing sectors owns a guard, and by what rule?**
   **Created by the owner's ruling of 2026-09-02**, and the sharpest of these
   because it is now load-bearing rather than hypothetical. Declining decision
   2's `redefine` means a placed post is a **new** sector standing beside the
   derived default, so from the first placement onwards two sector requirements
   draw from one guard roster. `claimableGuardIds` (`guard-roster.ts`) draws
   only from `'unassigned'` guards, so nothing today arbitrates between two
   requirements that both want one — and the first prison a player places a
   post in is a prison with more requirement than roster, because six residents
   ask for exactly one guard.
   The candidate rules, none taken here: **the player's sector wins** and the
   derived default becomes a fallback that only posts a guard nobody else
   claimed; **registration order wins**, which makes the derived default
   permanently senior and would read as the placed post being ignored;
   **the requirement with the higher occupancy pressure wins**, which is the
   only rule that needs no new concept but is also the only one a player cannot
   predict. This wants deciding **before** the placement command ships, not
   after, because whichever rule is taken is immediately visible in whether a
   newly placed post gets a guard at all.

   > **ANSWERED 2026-09-02: the player's sector wins.** Recorded as ruling 5
   > above, with what it rules out and what it costs. **The question is left
   > standing rather than deleted** because the three candidate rules it
   > enumerates are the warrant for the one that was taken — a reader who only
   > sees the answer cannot tell that *registration order* would have made the
   > derived default permanently senior, or that *occupancy pressure* was
   > rejected for being unpredictable rather than for being wrong. **It also
   > asked to be decided before the placement command ships, and it was**, which
   > is the one thing about it worth not losing.
   >
   > **One question it did not answer** and that is now the live one: what the
   > interface says to a player whose derived default sits unstaffed because
   > their own post took the only guard. That is a player-facing sentence and
   > therefore the owner's.
7. **Does a duty shift belong to the sector or to the guard?** Created by the
   same ruling, and out of scope for this document by the owner's own framing —
   named here so the second ADR does not start from nothing.
   `DeploymentBlock`'s multi-block form and `assertGaplessDeploymentSchedule`
   (exported, **no caller in `src/`**) are the unauthored capability that would
   carry it.
