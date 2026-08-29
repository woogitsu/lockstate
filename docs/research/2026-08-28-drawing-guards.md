# 2026-08-28 — Should a guard be drawn while `GuardRecord` still teleports?

**Question.** ADR 0059 open question 4 left this open on purpose: *"Do guards
walk, and when? They are the other population the render channel will carry
(ADR 0040 slice 2), and drawing them while they teleport between patrol
waypoints would look worse than not drawing them. The two decisions are
therefore one decision, and neither is taken here."* Issue #414's surviving
half is "guards are never drawn on the map" (issue body, and the two source
comments it quotes), so that decision cannot stay open if the gap is closing.
This record takes it, and states the evidence rather than deciding silently
inside `actors-from-snapshot.ts`/`render-actors-keyframe.ts`.

Evidence tier: **VERIFIED** throughout — every claim below is a quotation or a
line this session opened on `agent/414-draw-the-guards` (based on
`origin/main` at `01974e5`, v0.0.163), not a memory of the code.

---

## 1. What ADR 0059 was actually worried about

> "**Guards, incident responders, contraband searchers and job carriers still
> teleport on arrival.**" — `docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md`,
> "Consequences if this stands".

and, on why patrol specifically was left out of ADR 0059's scope:

> "the two security paths are inert or one-shot in a session a player can
> start (`deriveDefaultSecuritySector` authors no patrol route, so
> `PatrolSystem` never runs)" — same section.

Read together: the scenario ADR 0059 was picturing — a guard snapping between
patrol waypoints next to a prisoner who visibly walks — is not the scenario a
player actually gets in a session started from the shipped default. A guard
enters `GuardRoster` through `hire` at whatever tile the caller names
(`src/simulation/security/guard-roster.ts:76-91`), and reaches its assigned
sector's `postTile` on arrival via `DeploymentSystem`/`PatrolSystem`
(`patrol-system.ts:94-134`, "position updates only on arrival" stated in the
comment at the failed-leg branch). **Once there, nothing moves the guard again
unless a patrol route exists to send it round** — and
`deriveDefaultSecuritySector` (`docs/adr/0059-...`'s own citation) does not
author one. So the ordinary case this session's own fixtures reproduce
(`tests/unit/new-session-runtime.test.ts`'s guard, `tests/helpers/determinism-scenario.ts`'s
five) is: hired, travels once to a post, stands there. The waypoint-to-waypoint
snap ADR 0059 worried about is real but conditional on an authored patrol
route existing, which the shipped content does not yet provide.

## 2. The counterfactual already shipped and was accepted

Before ADR 0059, a prisoner was drawn from exactly the state a guard is in
today: a whole-tile position that changes only on arrival, `deltaX`/`deltaY`
published as `0`, and the idle clip selected every time
(`actors-from-snapshot.ts`'s own words, still true of the snapshot channel:
*"a prisoner walking across the yard is still drawn standing, because nothing
in the bundle says which way they are going"*). That was shipped, tested
(`tests/unit/rendering-feed.test.ts`'s pre-ADR-0059 assertions, which still
pass unchanged), and nobody recorded it as looking broken — ADR 0059 corrected
it because motion is nicer, not because standing-and-snapping was a defect
severe enough to prefer an invisible prisoner. A guard drawn this way is not a
new risk; it is the same risk the game already accepted for a different
population, for longer.

## 3. What the alternative costs

Not drawing guards at all is not neutral — it is the status quo issue #477
measured: a single guard moves an eight-prisoner, eight-cell prison with no
shower room and no yard over twenty in-game days from a peak sector risk with
three riots to 0.4824 with zero, against `hotThreshold` 0.65. The peak-risk
figure needs one correction the brief handed to this record already had right
and the issue text itself does not: issue #477's body reads **0.7979**, but
that is the pre-ADR-0059 number — `docs/adr/README.md`'s row on ADR 0054 and
`docs/PRISONER_OPERATIONS.md` both record that ADR 0059 (locomotion) nudged it
to **0.7981**, and `tests/integration/room-gated-needs.test.ts:381` pins
exactly that: `expect(watched.peakRisk).toBeCloseTo(0.7981, 4)`, green on this
tree (`node node_modules/vitest/vitest.mjs run tests/integration/room-gated-needs.test.ts`,
verified this session). So the issue's own body is the stale side here, not the
brief that cited it — a live GitHub issue can rot exactly like a doc. Either
number supports this section's argument identically; 0.7981 is the one this
tree actually produces. A player who hires guards and sees no change to the
map has no way to notice that lever exists, confirm it is working, or place a
post somewhere that matters. That cost is certain and already being paid every
session. The teleport-snap cost is conditional on an authored patrol route,
which does not exist in the shipped content today.

## 4. What was not measured

- **No screenshot or playtest** of a guard snapping mid-patrol was taken in
  this session — `tests/browser/` was not exercised for this change (see the
  branch's own report for what *was* covered: unit-level decode/encode tests
  reading real `GuardRoster`/`SimulationRuntime` state, not a rendered frame).
  This record's claim is about frequency (rare under shipped content), not
  about how a snap looks once a patrol route exists.
- **No measurement of what changes the day a security sector's route is
  authored.** If that content ships, the "rare case" in §1 becomes the
  ordinary one and this record's central argument weakens. That is the
  condition under "What would change this" below.
- **No opinion is offered on whether the delta channel's diff mode (ADR 0040
  slice 3) needs a different rule for a population that only ever teleports.**
  Slice 3 is unbuilt; this record only concerns the keyframe-only slice 2 this
  branch adds to.

## 5. What would change this decision

- **A patrol route landing in shipped, player-reachable content** (a security
  sector definition with `patrolRoute` set, reachable from a session a player
  can actually start) would make the snap the common case rather than the rare
  one, and would be the point to revisit whether a guard mid-leg should
  suppress its sprite, ease visually between waypoints, or something else ADR
  0059's own locomotion answer might extend to.
- **A player report or a screenshot showing the snap reads as broken** rather
  than merely static — this record's §2 argument is an analogy to a shipped
  precedent, not a playtest of guards specifically.

---

## The decision this record proposes

**Draw guards now, at their `GuardRecord` tile, motionless (`deltaX`/`deltaY`
always `0`, no heading), on both the snapshot channel and the render delta —
exactly the treatment a prisoner had before ADR 0059, and exactly what ADR
0040 slice 2 already named as the step (`actors-from-snapshot.ts`,
`render-actors-keyframe.ts`). This is implemented on
`agent/414-draw-the-guards` already; this record is the answer to ADR 0059
open question 4 that decision needed, not a proposal to build something new.**

This is small enough, and follows closely enough from ADR 0040's and ADR
0059's own text, that it is recorded here rather than opened as a new ADR
number — per `AGENTS.md`, a number is assigned centrally after a draft returns,
and none is taken by this file. If a reader disagrees that this fits inside
ADR 0040/0059's existing scope, the fallback is to draft a proper amendment to
ADR 0059 (closing open question 4 explicitly) and route it through the normal
numbering process; this record is the evidence that draft would cite.
