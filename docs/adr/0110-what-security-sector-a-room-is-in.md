# ADR 0110: What security sector a room is in

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0110, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083, 0096 and 0097 each
> pre-committed.
>
> **The arithmetic.** `docs/adr/README.md`'s own **Next free number** line reads
> 0110, and the sweep was performed rather than trusted, on 2026-09-12 from
> `origin/main` at `8b3c0907` (v0.0.589): every fetched remote head read with
> `git ls-tree --name-only <head> -- docs/adr/`, **321 heads**. The highest
> four-digit prefix on any of them is **0109**, and nothing at 0110 or above
> appears on any. **0095 is still held** —
> `origin/measure/893-coverage-and-response-draw-from-one-pool` carries
> `0095-what-the-guard-requirement-is-a-requirement-for.md` and still has no row
> in the index, unmoved since ADR 0096's preamble recorded the hold on
> 2026-09-04.
>
> **This document and ADR 0111 were drafted together and are numbered in the
> order they must be read.** They were commissioned as one question and are
> filed as two; §1 is the argument for the split, and it is the first thing in
> this document a reader should be willing to reject.

## Status

**Proposed, 2026-09-12. Not self-approved.**

The question is the owner's to settle. What is below is a finding, a
recommendation and the options that could discharge it, with what each costs.

**The owner did rule on the scope, and only on the scope.** Asked whether the
room-to-sector mapping and the render-side transport are one question or two,
they chose, from three clickable options, the one labelled:

> Dwa ADR-y: 0110 i 0111 (rekomendacja)

("Two ADRs: 0110 and 0111 (recommendation).") **That is the weaker kind of
provenance and is recorded as such** — the same disclosure the 2026-09-08,
2026-09-09 and 2026-09-10 entries in `AGENTS.md` make about themselves: the
label of a clickable option this session wrote and the owner chose, not a
sentence they typed. It settles **how the work is filed and nothing inside
either document.** Every decision below is unaccepted.

**No player-facing string is authored here**, and §7 establishes that none is at
risk: the field this document is about reaches no player today, in any form.

**A prior owner ruling stands behind the question itself.** The owner ruled that
the room-to-sector mapping be taken to an ADR (recorded in
[#1145](https://github.com/woogitsu/lockstate/issues/1145) §3, against
[#595](https://github.com/woogitsu/lockstate/issues/595)). This is that
document. It does not discharge that ruling by deciding the mapping — it
discharges it by establishing that **the mapping was never the hard part**, and
putting the decision that actually is hard where the owner can see it.

## Claim tiers used below

- **MEASURED** — produced by a run of a committed instrument, or quoted from a
  merged research record that says how it was produced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`, and
  where the claim rests on the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form so that it
  cannot drift silently.
- **REASONED** — derived from code that was opened, without a run behind it.

---

## Context

### 1. Why this is two documents and not one, which is the claim to attack first

The work was commissioned as **one** question. `docs/AGENT_WORKFLOW.md` §3 makes
correcting a brief the expected outcome rather than an awkward one, so the
argument is set out here rather than buried.

Two symptoms were handed over together, on the grounds that both are
"room-instance identity crossing a boundary":

1. No room-instance-to-sector mapping exists, so a room's security grade is
   absent.
2. No room-instance geometry reaches the render side, so ADR 0097's accepted
   Option A cannot be built.

They share a phrase. They do not share a boundary, a consumer, a cost or a
decision:

| | this document (0110) | ADR 0111 |
| --- | --- | --- |
| boundary | inside the simulation, presentation layer | worker → renderer |
| what is missing | a *relation* nothing computes | a *transport* nothing carries |
| consumer | the security-office reader (#595) | ADR 0097's condition overlay (#1022) |
| blocked by | a sector has no extent (§2) | nothing; two options, both free at the wire |
| decision shape | should a sector be drawn at all | which of two existing channels |

**And the evidence that they are different questions is not this table — it is
that the repository already wrote the distinction down and nobody read it.**
`docs/HUD_PROJECTIONS.md`, gap 23, VERIFIED, read:

> What is still missing is the projection. A room's `security` block stays
> absent because `RoomProjectionOptions.sectorIdByRoomInstanceId` is never
> supplied, and a **room**-to-sector map is a different question from a
> prisoner-to-sector one — ADR 0048 answers the second and declines the first,
> because a room has an extent and a sector still does not.

That sentence distinguishes *two* sector questions and is right about both. This
document adds a third distinction it does not draw: the render transport is not
a sector question at all.

### 2. What a sector is, exhaustively — and the sentence the whole question turns on

VERIFIED, read. `SecuritySectorDefinition` carries `id`, `gradeId`, `doorIds`,
`postTile`, an optional `patrolRoute` and an optional `expectedPatrolLoopTicks`
(`src/simulation/security/sector.ts:48-56`). No rectangle, no tile set, no
perimeter, no area.

The repository states the consequence itself, in the module whose whole job is
answering who is in a sector:

`grade, a set of governed doors, a post tile and optionally a patrol route, and none of those is an area.`
(verbatim in `src/simulation/security/sector-occupancy.ts`)

**So "which sector contains this room?" is not a hard question. It is a
malformed one.** Containment needs something to contain with, and a sector has
nothing. Every candidate rule an implementer would reach for — post tile inside
the rectangle, a governed door on the perimeter, a hull over the sector's known
points — is not a *choice between containment rules*. It is a proposal to give
sectors an extent by inference, from fields that were never designed to carry
one.

That is the decision this document exists to put to the owner, and it is a
larger one than the mapping it was commissioned about.

### 3. The one sector that does have an area, and what it costs to say so

VERIFIED, read. There is exactly one, and its area is not inferred — it is
defined. `sectorCoversTile` branches on identity:

`if (sector.id !== DEFAULT_SECURITY_SECTOR_ID) {`
(verbatim in `src/simulation/security/sector-occupancy.ts`)

For any other sector the body of that branch reduces coverage to a single-tile
equality against `postTile`. For the derived default sector — `security-sector.prison`
(`src/simulation/security/default-sector.ts:68`) — coverage is
`world.isTileOwned`, which is ADR 0048's adopted rule: tiles within a derived
perimeter, the one candidate that ADR *accepted* after rejecting the two that
depend on rooms.

### 4. In every session a player can start there is exactly one sector, and the repository already says so twice

**This is the finding, and it is in the reassuring direction, which is why it is
evidenced four ways rather than asserted.**

VERIFIED, read:

1. **Two production call sites of `SecuritySectorRegistry.register`, and neither
   authors a sector from anything a player did.** `default-sector.ts:277`
   registers the derived default; `session-systems.ts:775` replays rows out of a
   save payload. There is no third.
2. **No command creates a sector.** `src/simulation/protocol/commands.ts` and
   `src/simulation/protocol/types.ts` contain no sector-authoring command kind
   at all — searched for any create/define/zone-sector shape, zero hits. A
   player has no gesture that could produce one.
3. **The default is applied on both paths and is idempotent**, so a restored
   session has it too: `new-session.ts:1274` and `session-systems.ts:993` both
   call `applyDefaultSecuritySector`, and `default-sector.ts:277` registers only
   when absent.
4. **Two modules in `src/ui/` already state the conclusion in prose**, having
   needed it for their own reasons:

   `derives exactly one sector for every session a player can start`
   (verbatim in `src/ui/simulation-staff-coverage.ts`)

   and, about a field deliberately built to survive the day that stops being
   true:

   `they stop agreeing the moment a second sector exists, and the field that survives that is the one the simulation summed.`
   (verbatim in `src/ui/hud/view-model.ts`)

**So the staff panel solved this problem already, and solved it well.** It
carries a summed field rather than a netted one precisely so that the arithmetic
survives a second sector arriving. It did not wait for sectors to acquire an
extent; it wrote the honest readout for the world as it is, and made it
forward-compatible. That is a precedent this document takes seriously in §9.

### 5. Every tile of every room is on owned land — falsifier named and RUN

This is the load-bearing claim of Decision 2, so it was attacked rather than
assumed. `docs/AGENT_WORKFLOW.md` §3 and ADR 0108's own history are the reason:
that ADR's named-but-unrun falsifier defeated a decision the owner had already
accepted, in the reassuring direction, which is the direction this claim points.

**The falsifier: can a room instance exist any of whose tiles is not owned
land?** If it can, then "the default sector covers this room" is a partial claim
and the quantifier question (every tile, or any tile?) becomes a real decision.

Two independent ways it could happen, both run:

**(a) Zoning a room over unowned land.** It is refused, per tile, inside the
loop that walks every tile of the requested rectangle — not once for the anchor:

`return this.refuse('unowned-land', request, tick, tile);`
(verbatim in `src/simulation/rooms/zoning.ts`)

at `src/simulation/rooms/zoning.ts:556`, guarded by `canBuildAt` on the line
above it, inside the nested offset loop opened at
`src/simulation/rooms/zoning.ts:544-545` — whose bounds are `request.height` and
`request.width`, so it is every tile of the rectangle and not the anchor. **So
at the moment a room is created, every one of its tiles is owned.**

**(b) Ownership being revoked after the room exists.** `world.setOwned` has
exactly one call site in all of `src/` — `new-session.ts:438`,
`world.setOwned(initialChunk, true)` — and `discharge-system.ts` states the same
fact for its own purposes:

`has one call site at session creation, no room-catalog entry names an exit`
(verbatim in `src/simulation/prisoners/discharge-system.ts`)

**One room shape is outside this argument entirely, and decision 2 has to say
so.** `RoomInstance.width` and `RoomInstance.height` are optional — *"Absent for
an instance restored from a save written before bounds were recorded."*
(`src/simulation/prisoners/room-instance-registry.ts:79-82`) — so a V4 save
restores instances with an anchor tile and **no rectangle**, and
`room-projection.ts:487` already skips exactly those before projecting a room's
contents. There are no tiles to ask `sectorCoversTile` about. Such an instance is
**omitted from the map**, which is the same degrade-to-absence decision 2 makes
for ambiguity, and not a new rule.

**The falsifier did not falsify, and the honest boundary is one branch wide.**
`SparseWorld.setParcelOwned` *does* carry a revoking branch —
`} else if (this.ownedParcels.delete(id)) {` at
`src/simulation/world/sparse-world.ts:637` — and it has **zero call sites
anywhere in `src/`** outside the class that defines it, and no command reaches
it. So land cannot be un-owned today, and the mechanism that would allow it is
already written and merely unused. §10 carries this as the weakest claim.

### 6. What the alternatives would get wrong, since two of them will be proposed again

REASONED, from the code read in §2–§4.

- **Post tile inside the rectangle.** Measured across every fixture in the
  repository where a `RoomInstanceRegistry` and a `SecuritySectorRegistry`
  coexist — there are two, `tests/helpers/determinism-scenario.ts` and
  `tests/integration/security-default-sector.test.ts` — an authored sector's
  post tile falls inside a room rectangle in **zero** of them. It also inverts
  the one sector that matters: the default sector's post tile is derived to the
  middle of the first owned chunk (`default-sector.ts:194-201`), so the sector
  defined to cover *every* room would map to at most one. And nothing forbids
  two sectors posting inside one room: `SecuritySectorRegistry.register`
  validates `doorIds` against the `DoorRegistry` and never looks at rooms at all
  (`sector.ts:84-93`).
- **A governed door on the room's perimeter.** The closest to defensible, and it
  answers a different question — "whose checkpoint guards entry here" — which
  may be worth having on its own terms. It is not buildable today without new
  code: `roomPerimeterHoldsDoor` asks the registry *by position and edge*
  (`src/simulation/rooms/enclosure.ts:264-290`), `DoorRegistry.getById` is a
  separate lookup (`src/simulation/navigation/door.ts:233`), and **nothing in
  `src/` chains them.** It is also neither total (a room with no door, which
  ADR 0108 names `'no-way-in'` and `'gap'`, matches nothing) nor unique (nothing
  stops two sectors listing one door).
- **A derived hull over a sector's doors and post tile.** This is the one the
  repository has already refused, twice, in its own words —
  `sector-occupancy.ts` about sectors and `projection-catalog.ts` about rooms:

  `would be the worst place in the repository to decide it.`
  (verbatim in `src/simulation/worker/projection-catalog.ts`)

### 7. What breaks today — and the answer is weaker and more interesting than "a wrong sentence"

VERIFIED, read, and checked twice by two independent passes that agreed.

`projectSecurity` returns `undefined` when the map is absent
(`src/simulation/presentation/room-projection.ts:657-678`), and the worker never
supplies the map, so `RoomListRowViewModel.security` is `undefined` in every
session a player can start.

**Nothing reads it.** `src/ui/` was swept for `RoomSecurityViewModel`,
`gradeNameKey`, `minSecurityClearance` and the `security` field on any room view
model: zero hits outside `src/simulation/presentation/`.
`src/ui/hud/rooms-panel.ts` does not contain the word "security" at all, and
there is no locale string anywhere for a room's security grade. Every
`hud.security.*` key belongs to the Staff tab — guard hiring, roster, coverage —
which is a different feature.

**So there is no false sentence on screen and no `AGENTS.md` reservation 4
obligation here. There is silence.** That is worth stating plainly because it
changes the urgency: this is a latent feature with no consumer, not a live
defect, and a document that called it one would be doing what
`docs/AGENT_WORKFLOW.md` §3 forbids — promoting a gap into an incident.

### 8. The demand, counted honestly — one consumer, and two that were miscounted

The handover named several beneficiaries. Checked one at a time:

- **The security-office reader (#595) — real, and the strongest case.**
  `room.security-office` is in the catalogue (`src/content/room-catalog.ts:159-163`),
  and both halves of what it would read exist and are idle:
  `SectorRiskTracker.getConsecutiveHotSamples`
  (`src/simulation/incidents/sector-risk.ts:201`) and `ContrabandRegistry.all()`
  (`src/simulation/contraband/item.ts:191`). The handover's "nearly free" was
  checked rather than trusted, and it holds.
- **ADR 0048's risk model — not demand.** It rejected membership by room
  instance on **two** counts and the mapping fixes one. The other survives
  intact: a prisoner standing in a corridor, a yard, or anywhere outside a room
  is in no room and therefore in no sector, which is exactly the population a
  risk model must not lose. ADR 0048 adopted owned-land tiles *because* they
  cover open ground. **It would not switch.**
- **ADR 0097's overlay — a different boundary.** ADR 0111.
- **Three of #595's four "cheap readers" — unrelated.** Garbage-room filth and
  staff-room fatigue want a new persisted field; utility power wants a sitewide
  aggregation with an open design question. None is a sector consumer. (Those
  two were additionally reported as blocked by reservation 2; they are not, and
  #1145's comment thread carries the correction and the owner's ruling on it.)

**One consumer. That is not an argument against acting — it is the number that
should decide how much architecture the action is allowed to cost**, and it is
why Decision 2 recommends the cheapest thing that is true.

---

## Decision

### 1. The question is whether a sector has an extent, not which containment rule to pick

**Recommended.** §2 is the argument. A containment rule chosen now would be an
extent invented by inference from `doorIds` and `postTile`, and the repository
has refused that in its own words twice. Whether sectors become drawn things is
a design decision about the game — it is the player-facing sector gesture
ADR 0036 declined to build, and `default-sector.ts` says so about the cost it is
already paying:

`is the honest cost of a sector nobody drew, and it is the strongest argument for the player-facing sector gesture ADR 0036 declines to build.`
(verbatim in `src/simulation/security/default-sector.ts`)

That decision is the owner's and is **not** taken here. §9 Option D is where it
sits if they want it.

### 2. Supply the mapping from the extent that already exists, and refuse for any sector that has none

**Recommended.** Concretely: build `sectorIdByRoomInstanceId` in
`projection-catalog.ts` by asking, for each room instance, which registered
sector covers its tiles under the rule `sectorCoversTile` **already implements**
— and omit the room from the map when no sector covers it or more than one does.

**This is not inventing a spatial containment rule, which is the objection the
wiring raises against itself.** The rule is ADR 0048's, adopted, shipped and
already the answer to the sibling question about prisoners. The wiring would be
*reading* a rule, not choosing one. `projection-catalog.ts`'s own docblock draws
exactly this distinction about the option beside it — `placedObjects` **is**
supplied, because ADR 0028 decision 2 already stated that rule.

**What it yields today, stated exactly:** every room instance maps to
`security-sector.prison`, because §5 establishes every tile of every room is
owned land and §3 establishes the default sector covers every owned tile. The
security grade a room then reports is `grade.general` — which is true, is the
grade the whole prison has, and is not a guess.

**And what it yields the day a second sector exists is the property that makes
it safe:** an authored sector covers exactly its post tile, so a room containing
that tile would map to two sectors and be **omitted**, not guessed. The map
degrades to absence — the same failure mode `projectSecurity` already has and
already handles — rather than to a false grade.

**Decision 2 is worth less than it looks, and saying so is the point.** It gives
the security-office reader its input and gives a room a true grade. It does not
make sectors mean anything they do not already mean.

### 3. Whatever is built, build the forward-compatible shape, not the one-sector shape

**Recommended.** `src/ui/simulation-staff-coverage.ts` and
`src/ui/hud/view-model.ts` already did this for the same fact (§4), and the
second of them explains why in a sentence about a field that survives a second
sector arriving. A reader or projection that assumes one sector will be wrong
silently; one that sums, lists, or omits-on-ambiguity will be right in both
worlds. That is cheap now and unpriceable later.

---

## Options, with their real costs

### Option A — Decision 2 only: supply the map from the rule that exists

**What it is.** `projection-catalog.ts` builds the map by reading
`sectorCoversTile`; nothing else changes.

**Cost.** One function in the wiring, one already-declared option populated, no
new type, no wire change (the field rides `hud/room-list`/`hud/room-detail`,
which are validated by the generic `jsonValueSchema` and tolerate an additive
field with no version bump), and no save-schema bump — nothing persisted moves.

**What it buys.** The security-office reader's blocker, gone. A room's grade,
true rather than absent.

**What it does not solve.** Sectors still mean nothing spatially. A lockdown
still cascades onto no doors (`default-sector.ts:206-216`).

### Option B — Decision 2, plus a door-perimeter relation as a *separate, named* fact

**What it is.** Option A, plus a new `sectorGuardingEntryTo(room)` built by
chaining `DoorRegistry.getById` onto the perimeter walk (§6), published as its
own field with its own name rather than as "the room's sector".

**Cost.** Option A, plus a new predicate and its tests, plus a second concept in
the room view model that a reader must not confuse with the first.

**What it buys.** A true answer to a question worth asking — which checkpoint
governs entry — without pretending it is containment. **Not recommended now**:
no consumer asks for it (§8), and `docs/AGENT_WORKFLOW.md`'s rule about not
broadening scope applies to documents as much as to diffs.

### Option C — Do nothing; leave `security` absent

**What it is.** The status quo, held deliberately rather than by omission.

**Cost.** Nothing. **What it forecloses.** The security-office reader stays one
of #595's seven dead rooms. Honest and defensible given §8's count of one, and
it is the option to take if the owner wants sectors settled properly first.

### Option D — Decide that sectors are drawn, and open the gesture ADR 0036 declined

**What it is.** The real architectural question: a player-facing gesture that
authors a sector with an extent, which makes lockdown mean something, makes
patrol routes non-arbitrary, and makes room-to-sector a containment question
with something to contain with.

**Cost.** Large, and not costed here — a command, a persisted definition
(touching the local save shape, which is ours under the standing mandate with
architectural boundary 7's versioning discipline, and which does **not** touch
`supabase/migrations/`), an input gesture, an authoring UI, and interactions
with ADR 0036, ADR 0048 and ADR 0092.

**This is the option the code keeps pointing at**, and it is the owner's call
rather than a recommendation of this document's. Options A and D are not
exclusive: A is true today and stays true after D, because A reads whatever
extent a sector has rather than assuming which one.

---

## Consequences if this stands

- **ADR 0048 is untouched.** Its rejection of membership by room instance stands
  on the ground that survives (§8), and nothing here asks it to change.
- **ADR 0036's declined gesture becomes the named open decision** rather than an
  aside in a docblock.
- **`docs/HUD_PROJECTIONS.md` gaps 16 and 23 change state** under Option A: gap
  16 closes, and gap 23's *"a room has an extent and a sector still does not"*
  stays true and stops being the blocker it reads as.
- **#595's title is wrong by two and this does not fix it.** Seven dead rooms,
  not nine, re-measured twice independently; Option A addresses one of the seven.

## Open questions

1. **Every tile, or any tile?** Vacuous today (§5) and a real decision the day
   land can be un-owned or a sector has a drawn extent. Decision 2 says *covers*
   without committing, deliberately; it must be answered before, not during, the
   change that makes it matter.
2. **Should a room covered by two sectors be omitted or should the finer-grained
   one win?** Decision 2 says omitted. With one sector this is unreachable.
3. **Does the security-office reader want its own sector's risk, or the
   prison's?** With one sector these are the same number, which is exactly the
   kind of agreement §4's staff-panel precedent warns is temporary.

## The weakest claim in this document, named

**That land cannot be un-owned.** §5 rests it on `setParcelOwned` having no
caller, and that is an absence — `docs/AGENT_WORKFLOW.md` §4's own account of
which sentences rot first puts an absence at the top of the list. The revoking
branch is already written (`sparse-world.ts:637`). One command, in a land-sale
feature nobody has filed, turns "every room tile is owned" false and makes open
question 1 live on the same day.

Second weakest: the fixture survey in §6 covers **two** fixtures, which is the
whole population where the question is askable and is still two. It shows the
post-tile rule is never exercised, not that it cannot be.

## What would falsify each, and what has not been run

| claim | falsifier | run? |
| --- | --- | --- |
| Every tile of every room is owned land | zone a room, then revoke ownership under it, and read `sectorCoversTile` | **Not run** — no code path reaches the revoking branch, so the test would have to call it directly, which tests a mechanism rather than a behaviour |
| A room cannot be zoned on unowned land | read the refusal's position in the per-tile loop | **Run** (§5a) — refused per tile, inside the loop |
| Ownership is never revoked | sweep every `setOwned`/`setParcelOwned` call site in `src/` | **Run** (§5b) — one call site, at session creation, `true` |
| Exactly one sector exists in a player session | sweep registration sites and the command vocabulary | **Run** (§4) — two sites, neither player-driven; zero sector commands |
| Nothing reads `RoomListRowViewModel.security` | sweep `src/ui/` for the field and its members | **Run** (§7) — zero hits |
| Adding the map changes no wire format | check which schemas are `.strict()` | **Run** — the envelope and `statusCountsSchema` are; `hud/room-list` is not |

**The unrun row is the one to read.** It is unrun because the code cannot reach
the state, which is the same reasoning ADR 0108 used about a walled unzoned shed
before its falsifier was run and defeated it. The difference — and it is why
this document accepts the gap rather than hiding it — is that ADR 0108's
falsifier probed a state the *player* could reach with ordinary play, and this
one probes a state no code path produces at all.

## What would change my mind

- **A second sector turning up in a real session.** Decision 2 survives it by
  omitting rather than guessing, but §4's whole framing would need rewriting and
  Option D would stop being optional.
- **A consumer for the door-perimeter relation.** Option B is recommended
  against on demand, not on merit; one real reader moves it.
- **The owner wanting sectors drawn.** Then A is a stopgap to state as one, not
  a decision, and this document should be read as the costing for D.
- **Finding that `grade.general` on every room reads to a player as a claim
  rather than a default.** That is a playability question this document cannot
  answer from the code, and `AGENTS.md` makes playability count as correctness.
  It is the one thing here that wants a person playing rather than a test.
