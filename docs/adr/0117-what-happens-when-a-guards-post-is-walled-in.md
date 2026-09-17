# ADR 0117: What happens when the tile a guard's post stands on is walled in

## Status

**Accepted by the owner on 2026-09-17: option 3, "say it".** The `Proposed`
paragraph below is kept rather than replaced, on the precedent
[ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md)'s Status
block sets and for the reason it gives -- `docs/AGENT_WORKFLOW.md` §4's rule is
to mark both directions, and what a decision looked like before it was answered
is the part a later reader needs in order to judge the answer.

**The provenance is the weaker kind, and is disclosed here exactly as the
2026-09-08, 2026-09-09 and 2026-09-10 entries in `AGENTS.md` disclose their
own.** The ruling is *the label of a clickable option this session wrote and
the owner chose*, not a sentence they typed. The label, verbatim:

> Option 3 — say it (recommended)

and the description shown beside it, which is the text they were choosing
against, also verbatim:

> A fifth PRISON_CONDITIONS member, security.post-unreachable, computed from
> state already in hand. Save format zero, determinism zero, no new
> projection. Fixes existing saves because it is computed, not stored. Does
> NOT fix the prison — it stops the HUD lying and leaves the cure (take the
> wall down, measured as working) with the player. This is the ADR's own
> recommendation.

**What it was chosen against, which is the part that makes it a ruling rather
than an acclamation.** Three alternatives were live and named: **option 2**
(move the post to the nearest routable tile — the only option that repairs
existing saves without a press, and §5 says outright that a reader who weighs
*"the game must not stay broken"* above *"the game must not lie"* has a
coherent argument for it), **option 1** (refuse the build), and a **sequenced
"3 then 2"**. §5 recommends option 3 and the owner took the recommendation;
they did not take it by default.

**What Accepted does and does not settle.** It settles that the fifth
`PrisonCondition` member is built and that the prison is told. It settles
§4's second decision by consequence rather than by ruling — something had to
be done about `hud.security.coverage-met` while the condition stands, and §4
says explicitly that *"whether it is suppressed, or `assigned` stops counting
a guard that has never arrived, is a second decision that belongs to whoever
builds this"*; what was built is recorded by the commit that builds it, in a
§7 that commit adds. It settles nothing
about option 2: the prison stays broken, by the ruling's own words, and
whether it is ever repaired is still open.

---

**Proposed, 2026-09-17. Not self-approved, and it implements nothing.** *(The
state of this document before the ruling above.)* No file
under `src/` changes in the commit that lands this document, no test is added,
no player-visible sentence is authored, and no option below is built. The
ruling is the owner's.

Filed on the owner's instruction of 2026-09-17, recorded as the weaker kind of
provenance this repository has been marking since 2026-09-08 — the label of a
clickable option this session wrote and the owner chose, not a sentence they
typed:

> Napisz ADR z trzema opcjami i wróć (zalecane)

("Write an ADR with the three options and come back.") The three options are
[ADR 0036](./0036-a-derived-default-security-sector.md)'s own, quoted in §2;
this document prices them and recommends one.

### The number

**0117**, and the sweep was performed rather than trusted, because
`docs/adr/README.md`'s own preamble records that disk sees only what has
merged. In this worktree, cut from `origin/main` at `076fdcee` (v0.0.654):
`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
`git ls-remote --refs --heads origin` — **459 heads** — with
`git ls-tree --name-only <head> docs/adr/` read out of every one of them and
**all 459 readable**. The highest four-digit prefix on any head is **0116**;
nothing at 0117 or above appears anywhere. The index's stated next-free line
reads `0117` and the sweep agrees with it.

**Three numbers are held on remote heads and are not on disk here** — `0018`,
`0030` and `0095` — unchanged by this document, which takes none of them.
Releasing a held number discards somebody's drafted decision and is the owner's,
exactly as `README.md` says.

**Pre-commitment, on the habit every ADR since 0035 has kept:** if a branch
landing first turns out to hold 0117, this file, its row in
`docs/adr/README.md` and every citation of "ADR 0117" get renumbered together,
without argument.

### What the evidence rests on

**Tier R — this repository, executed.** Every figure in §1 was produced by
running this tree: `createNewSimulationRuntime`, real commands through the real
command handler (`PurchaseMaterials`, `ZoneRoom`, `PlaceObject`,
`AdmitPrisoner`, `HireStaff`, `PlaceBuildOrder`, `RemoveWall`), the real
kernel, the real `NavigationSystem` and the real incident systems, on seed
`0x396` — the same seed and the same overcrowded fixture ADR 0036 decision 8
measured its own trace on, so the two are comparable. The probes were
throwaway: they are **not** committed, because this document adds no test, and
every command sequence needed to re-run them is written out in §1 so a reader
can rebuild them rather than take this document's word.

**No mutation evidence is owed and none is claimed.** This change adds no test
and no production code; there is nothing to watch going red.

---

## 1. The failure, measured — and ADR 0036's own account of it is wrong in four places

ADR 0036 open question 1 reads, in full:

> **What happens when the player builds on the post tile?** A wall at (16, 16)
> makes the post unroutable: `deploymentFailures` counts and the guard returns
> to the pool, retried every cycle, for ever. Nothing tells the player. The
> candidate answers are all decisions of their own — refuse the build, move the
> post, or raise a refusal on a state rather than a command — and the third is a
> shape this repository does not have yet.

**It still reproduces.** It is not fixed, and nothing between 2026-08-26 and
today has closed it. But four of that paragraph's clauses do not survive being
run, and each correction changes what an option is worth.

### 1a. It is four wall segments, not "a wall"

A wall in this simulation is an **edge**, not a tile.
`BUILD_EDGES = ['north', 'west']` (`src/simulation/construction/build-order.ts:32`)
and `edgeStanding` (`src/simulation/navigation/traversal.ts:54`) answers
`'wall'` for a non-zero edge value with no registered door — so a wall stands
*between* two tiles and nothing can stand *on* one. Sealing (16, 16) therefore
takes the four edges that bound it: `north` of (16, 16), `west` of (16, 16),
`north` of (16, 17) and `west` of (17, 16).

Measured, one run per count, each with a guard hired at (0, 0) and 600 ticks to
walk:

| sealing segments | `deploymentFailures` after 600 ticks | guard phase | guard tile |
|---|---|---|---|
| 1 | 0 | `on-post` | (16, 16) |
| 2 | 0 | `on-post` | (16, 16) |
| 3 | 0 | `on-post` | (16, 16) |
| **4** | **30** | `travelling` | **(0, 0)** |

So the brief's framing of this defect as *"reachable with one press"* is false,
and so is ADR 0036's *"a wall at (16, 16)"*. It takes **four** presses of
`PlaceBuildOrder` with `definitionId: 'wall-brick'`, at three different tiles
and both edges, plus the bricks and the build time for all four.

**That does not make it unreachable, and the reason is the coincidence ADR 0036
decision 2 calls load-bearing.** (16, 16) is `NEW_PRISON_ORIGIN_TILE`
(`src/main.ts:869`) — the tile the Build panel's x/y fields **start on**. A
player who opens the Build panel and presses without editing the coordinates is
building on the post tile, and four such presses is a small 2×2-ish wall stub
or the first corner of a room. The realistic route is not malice; it is a
player walling a room whose corner happens to be the middle of their land, and
not yet having cut the doorway.

**Measured through the real build path**, on the same fixture: `PurchaseMaterials`
for 12 `item.brick`, then the four `PlaceBuildOrder` presses above — **zero
refusals**, all four accepted, all four completed. Nothing in `REFUSAL_REASONS`
(`src/simulation/protocol/types.ts:1395`) concerns a security post, and no
build refusal today looks at a sector.

### 1b. It is not silent — it is *worse* than silent, because the one readout a player has is false half the time

This is the correction that matters most, and it is the one no option can be
priced without.

`CoverageReportEntry.assigned` counts *"guards assigned to the sector, whether
already on-post or still travelling there"* — its own docstring, at
`src/simulation/security/deployment-system.ts:18` — and
`assignedGuardCountFor` (`:119-125`) counts every guard whose phase is not
`'unassigned'`. The stranded guard is not standing still in one phase; it
**cycles**. `DeploymentSystem.schedule` is `{ intervalTicks: 10, phaseTicks: 0 }`
(`:39`), so one scheduled tick assigns the guard and requests a route
(`beginDeployment`, `:202`) and the *next* one, ten ticks later, reads the
failed result, counts a failure and unassigns it (`:241-244`).

Read tick by tick, seed `0x396`, one prisoner, post sealed, one guard hired at
(0, 0):

```
12:s0 13:s0 ... 20:s0 21:s1 22:s1 ... 30:s1 31:s0 ... 40:s0 41:s1 ... 50:s1 51:s0 ...
```

— `s0` meaning `shortage: 0`, `s1` meaning `shortage: 1`. Over 200 consecutive
ticks: **100 ticks report `shortage: 0` and 100 report `shortage: 1`.** Exactly
half.

`shortage: 0` is what the Staff panel renders as
`hud.security.coverage-met` — **"Covered"** (`src/content/default-locale-en.ts:2685`)
— beside `hud.security.coverage-summary`, **"{assigned} of {required}"**
(`:2684`), i.e. **"1 of 1 · Covered"**. The other half of the time it renders
`hud.security.coverage-unguarded`, **"Unguarded"** (`:2861`), with
`hud.security.coverage-unguarded-hint`, *"Nobody is on duty. Hire {count} to
cover this population."* (`:2862`) — telling the player to hire a guard they
have already hired.

So: **the prison is permanently unguarded, and the interface says it is covered
on half of all ticks.** The roster row alternates in step, between
`deployment-phase.travelling` (*"Travelling"*) and
`deployment-phase.unassigned` (*"Unassigned"*), for a guard that has not moved
one tile.

ADR 0036's *"Nothing tells the player"* is therefore too kind to the code in
one direction and too harsh in another. There **are** visible symptoms — a
flickering badge, a guard that reads "Travelling" for ever without moving — and
**nothing names the cause**; and one of those symptoms is an outright false
sentence shown to the player. Under ADR 0112's accepted constitution, article
5 (*every sentence is true*), *"1 of 1 · Covered"* over an unguarded prison is
not a gap in the interface, it is the interface asserting something false.

**This also refutes ADR 0092 decision 5 option A's stated cost**, which reads
*"coverage reads short the whole time — which is true, is the player's own
doing, and is now visible."* It does not read short the whole time. It reads
short exactly half the time and reads *covered* the other half, and the
half-truth is the part a player is likelier to act on.

### 1c. "Retried every cycle, for ever" is right about the cadence and the cost is nil

Measured over ten in-game days (24,000 ticks) from the hire:

- `deploymentFailures` = **1,200** — one failure per **20 ticks**, i.e. one per
  two deployment cadences, 120 per in-game day, for as long as the session runs.
- `NavigationSystem` queue metrics over the same 24,011 ticks:
  `resolvedCount: 1200`, `cancelledCount: 0`, **`totalExpansions: 2`**,
  `flowFieldActivations: 0`.

**So the retry costs essentially nothing.** The failing request is rejected at
the region graph, before any search: two expansions in ten days. Anybody
tempted to price this defect as a performance problem should not — the cost is
entirely that the security tier does not work and the interface lies about it.

### 1d. It is permanent in the sense that matters and reversible in the sense that does not

Nothing in `src/` ever re-derives the post tile (ADR 0036 decision 4), so the
state never self-heals and no elapsed time fixes it. That is what "for ever"
buys.

But the player **can** undo it, if they somehow work out what is wrong.
Measured: after the four walls are placed through real `PlaceBuildOrder`
commands and the guard has accumulated 20 failures, four `RemoveWall` commands
(ADR 0106) at the same four edges are accepted with zero refusals, and within
400 ticks the guard is `on-post` at (16, 16) and the failure counter stops
moving.

**One caveat, and it is a trap for the next person to measure this.**
`RemoveWall` resolves a press to *the completed build order claiming that edge*
(`ConstructionSystem.completedOrderClaimingEdge`,
`src/simulation/construction/system.ts:1496`). A wall written straight into the
edge layer by a test fixture has no order behind it, so `RemoveWall` refuses it
`remove-wall.nothing-to-remove` — which is exactly what happened on the first
run of this probe and is a property of the fixture, not of the game. Every
recovery figure above is from walls built by real commands.

### 1e. Deployment is not the whole damage — incident response dies with it

`IncidentResponseSystem` sends a responder to
`this.sectors.requireDefinition(incident.sectorId).postTile`
(`src/simulation/incidents/response-system.ts:498`) — the same tile. So a
sealed post takes the response with it.

ADR 0036 decision 8's own fixture, re-run on seed `0x396` with and without the
post sealed: three prisoners for one bed, driven to tick 15,600, five guards
hired at (0, 0), measured at tick 18,000.

| | post reachable (control) | post sealed |
|---|---|---|
| `incidentsResolved` | **1** | **0** |
| `incidentsLapsed` | 4 | 4 |
| `respondersDispatched` | 4 | 5 |
| `routeFailures` | **0** | **5** |
| `deploymentFailures` | 0 | 89 |

So the sealed post does not merely leave the sector unstaffed: it makes every
riot in the prison unanswerable, and the responders that *are* claimed are
claimed and then lost to a route failure. ADR 0036 open question 1 describes
this as a deployment problem. It is a whole-tier problem, and that is the
single strongest argument for doing something rather than nothing.

### 1f. What the save records, and what it does not

`deploymentFailures` **is persisted** — `save-schema.ts:781`, a
`z.number().int().min(0)` inside the `deployment.metrics` block — so a save
taken in this state carries the number and a restored session carries on
counting from it. Nothing else records the condition: there is **no** tile, no
sector id, no reason and no timestamp beside it, and no event or refusal is
written (measured: `refusals.count` 0 and `events.count` 1 — the admission —
over the whole ten-day run). A player who saves, quits and returns gets the
same unguarded prison and the same flickering badge, with a counter nobody
reads as the only trace.

---

## 2. What has moved under ADR 0036 since it wrote that question

Two things, and both change the pricing. Neither is visible from ADR 0036's own
text, which has not been edited since.

### 2a. ADR 0092 already answered the neighbouring case, and its answer was never ruled on

[ADR 0092](./0092-who-decides-where-a-guard-stands.md) decision 5 —
*"A post or waypoint the player makes unreachable is kept and reported, never
moved"* — says of itself that it *"answers ADR 0036 open question 1 … for the
case where the post is the player's own"*. It lists the same three candidates
this document was commissioned to price, recommends **keep and report**, and
notes that the condition-shaped refusal it wants is *"a shape this repository
does not have yet"*.

**Its status is the part to read.** ADR 0092 is `Proposed`. The owner ruled on
**five** of its questions on 2026-09-02 — scope, a placed post being a new
sector, the payload being authoritative, the route gesture, and which sector
wins a contested guard — and **decision 5 was not one of them**. Of its eight
decisions exactly one is built: decision 3, `SecuritySectorRegistry.redefine`
and the restore path that uses it (`session-systems.ts:799-805`, merged as
`4a53d292`). There is no command, no placed post, no player-authored tile.

So the case ADR 0092 answers does not exist yet, and the case that does exist —
the **derived** post, walled in by an ordinary build — has no answer. This
document is about that one.

### 2b. The shape ADR 0036 said this repository did not have now exists

ADR 0036 rejected the third candidate partly because *"a refusal raised on a
state rather than a command … is a shape this repository does not have yet"*,
and [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md) decision
2 was where it was being decided. **It was decided, ruled on and built.**
`PRISON_CONDITIONS` (`src/simulation/protocol/types.ts:668`) is a closed union
of four members today — `construction.unfunded`, `intake.no-place`,
`treasury.construction-refused`, `treasury.deliveries-refused` — produced by the
pure function `computeStandingPrisonConditions`
(`src/simulation/presentation/status-strip-projection.ts:253`) and published on
`statusCountsSchema.conditions`, an array bounded by the union's own length
(`types.ts:1234`).

That is precisely "a standing condition of the prison, recomputed every frame,
that no command raised". The premise on which ADR 0036 discounted its own third
option is no longer true.

---

## 3. The three options, priced

ADR 0036 names them as *"refuse the build, move the post, or raise a refusal on
a state rather than a command"*, and calls each *"a decision of its own"*. Each
is priced below against §1's measurements, not against adjectives.

### Option 1 — refuse the build that would strand the post

**What it is.** `PlaceBuildOrder` gains a refusal: a wall segment whose
completion would leave the sector's post tile unroutable is refused, with a new
`REFUSAL_REASONS` member and a new locale key.

**The measured objection, and it is close to fatal: the player cannot see the
tile.** The only projection that carries `postTile` is `hud/security`
(`security-projection.ts:230`, registered at `types.ts:342` and
`projection-catalog.ts:401`), and it has **zero readers** in `src/ui/` or
`src/rendering/` — grepped, the one hit is a comment in
`src/ui/simulation-staff-coverage.ts:35` explaining why that module reads
`hud/staff` instead. ADR 0110 established the same absence independently. So
this option refuses a press by appeal to a tile the interface has never drawn,
never named and cannot name, and the refusal would have to either teach the
player what a post tile is in one sentence or be incomprehensible. **Making the
post visible is a prerequisite and is not in this option's price** — it is a
render-side feature nobody has specified.

**The second objection, from §1a.** The refusal cannot fire on the press that
does the damage, because no single press does. Three segments are harmless and
the fourth is fatal; and since a build order completes later, the tile is
stranded by a *completion*, not by a press. Refusing the fourth **press** means
refusing a wall whose three neighbours are already up — the player will read it
as the game refusing to let them finish a wall, for a reason about guards.

**The third objection, stated because it is the one ADR 0092 raises.** A build
refusal that consults a security placement couples two subsystems that share
nothing today, and it refuses a wall the player may well want more than the
post.

**What it does *not* fix, and this is decisive.** It cannot help anybody already
in this state. A save whose post is already walled in stays walled in for ever:
a refusal is a rule about future presses. §1f says nothing in the save records
the condition, so there is nothing for a migration to find either.

**Price:** one refusal reason, one locale key (a player-visible sentence — see
§4), a routability query on a hot command path, a subsystem coupling, a
prerequisite render feature that is not specified, and **zero** relief for
existing saves.

### Option 2 — move the post to the nearest routable tile

**What it is.** When the post becomes unroutable, re-derive it — nearest
routable tile, or re-run the derivation.

**The mechanism exists and is cheap.** `SecuritySectorRegistry.redefine`
(`sector.ts`, ADR 0092 decision 2, built in `4a53d292`) mutates exactly
`postTile`, `patrolRoute` and `expectedPatrolLoopTicks` and cannot touch `id`,
`gradeId` or `doorIds`. The moved tile persists with **no save-schema change**:
`postTile` has been in the V5 payload since it was written
(`save-schema.ts:733`) and ADR 0092 decision 3 already made the payload
authoritative for it. `SAVE_SCHEMA_VERSION` does not move.

**What it costs, and ADR 0036 calls this a separate decision for a reason.**

1. **It is hidden state with a visible effect, which the owner's standing
   direction rules out.** The security geometry changes under the player with no
   press and no notice. ADR 0092 decision 5 option B makes the same objection in
   the same words — *"the game silently overrules a placement the player made"*.
   Here it is worse in one way and better in another: the player never placed
   this post, so nothing of theirs is overruled; but they also have no way to
   know a post exists, so they cannot even notice it moved.
2. **It needs a nearest-routable search that does not exist.** Nothing in `src/`
   answers "the closest tile to X reachable from Y". Writing one means deciding
   a tie-break that is deterministic across restores (`compareChunkPositions` is
   the precedent), and the determinism bar here is the strict one: ADR 0036
   decision 6's whole arrangement rests on a restored session deriving what a
   live one derived.
3. **It breaks ADR 0036 decision 4's "derived once, never re-derived", which is
   load-bearing for three stated reasons** — a sector id must not change under a
   live incident, the registry captures door baselines at `register` time, and
   the input does not change under ordinary play. Re-deriving on a world change
   re-opens all three, and §1e shows exactly when it would fire: during a riot,
   which is when `IncidentResponseSystem` is holding records keyed to that post
   tile.
4. **It silently un-does what the player built, in effect.** The prison keeps
   working, the walls stay up, and the reason the player's prison behaves
   differently is invisible. That is the "one control whose outcome depends on
   invisible history" shape.

**Price:** a new search with a determinism obligation, a reversal of ADR 0036
decision 4, a re-derivation trigger firing at the worst possible moment, and no
save change. It is the only option that **fixes existing broken saves
automatically**, which is its one real advantage and is not nothing.

### Option 3 — say it: a standing condition of the prison (recommended)

**What it is.** A fifth member of `PRISON_CONDITIONS` —
`security.post-unreachable` in the existing `<area>.<state>` shape — computed by
`computeStandingPrisonConditions` from the state that already exists, published
on the status strip's `conditions` array, rendered by whatever renders the four
members already there. The simulation's behaviour does not change at all: the
guard still cycles, the counter still counts, the walls stay where the player
put them.

**Why it is now cheap, where ADR 0036 priced it as impossible.** §2b: the shape
exists, has four members, has a producer and has a wire field bounded by the
union's own size.

**Price, itemised.**

- **Save format: zero.** `conditions` is a projection field, not a persisted
  one — grepped, `conditions` does not appear in `src/persistence/save-schema.ts`
  at all. No version bump, no migration, no forward-compatibility cost of the
  kind ADR 0116 §4b prices for a persisted union.
- **Determinism: zero.** A pure function of state already in hand; no RNG, no
  clock, no `Map` iteration.
- **Wire: zero new projection.** `statusCountsSchema.conditions` already exists
  and is already bounded.
- **One player-visible sentence** (§4), plus its Polish translation, plus the
  `AWAITING_PRODUCER`-style compile obligation: like `EVENT_PRESENTATION`, any
  exhaustive `Record` over `PrisonCondition` fails to compile until the new
  member is given a presentation, which is the good kind of cost.
- **The producer needs an input it does not have.** `computeStandingPrisonConditions`
  takes five scalars today; this needs a sixth — "the sector's post is
  unroutable" — and the honest source is not `deploymentFailures`, which is a
  lifetime counter that never decreases and so can never say *currently*. The
  cheap correct predicate is the one the state already expresses: a sector with
  a non-zero requirement, at least one claimable guard, and no guard that has
  reached `'on-post'` across a full assign-and-fail cycle. **Choosing that
  predicate is implementation and is deliberately not decided here.**

**What it does not fix.** The prison stays unguarded and the riots stay
unanswerable (§1e). This option buys the player the *knowledge*, and the action
— take the wall down, which §1d measures as working — stays theirs.

**And it fixes existing saves**, because it is computed rather than stored: a
save loaded into a build that has this condition reports it immediately.

### Option 0 — do nothing, named because it has to be beaten

Costs nothing and leaves §1b standing: a prison that is permanently unguarded
while the interface says "1 of 1 · Covered" on half of all ticks. Under ADR
0112's article 5 that is not neutral. It is the option this document argues
against hardest.

---

## 4. The player-visible sentence, and who owns which half of it

Any of options 1 and 3 needs a new string. `AGENTS.md`'s fourth reservation was
partly released on 2026-09-04: **the choice of words is ours; the requirement
that the sentence be true is the owner's.** ADR 0112's accepted article 5 makes
the truth half stricter, not looser.

**No string is authored here** — this document implements nothing — but a
candidate is quoted rather than described, so the owner is ruling on a sentence
and not on a gist. For option 3:

> **The guard post is walled in. No guard can reach it, so nobody is on duty.**

Its truth conditions, named so the commit that ships it can prove each one
against code rather than against this paragraph: (a) *walled in* is true exactly
when every edge bounding the post tile is impassable per `edgeStanding`
(`traversal.ts:54`); (b) *no guard can reach it* is true exactly when the route
request fails, which is the branch at `deployment-system.ts:241`; (c) *nobody is
on duty* is true exactly when no guard of this sector is `'on-post'` — which is
**not** what `shortage` measures, per §1b, and a sentence that leaned on
`shortage` would inherit the falsehood it is there to correct.

**Shipping option 3 also obliges a change to a sentence that already exists**,
and it must be stated now rather than discovered later: while this condition
stands, `hud.security.coverage-met` — **"Covered"** — is false for half of all
ticks. Whether it is suppressed, or `assigned` stops counting a guard that has
never arrived, is a second decision that belongs to whoever builds this. This
document names it and does not settle it.

## 5. The recommendation

**Option 3, and the mandate says to recommend rather than to present three doors
and leave.**

1. It is the only option whose price is measured at **zero** for save format,
   determinism and wire vocabulary (§3), and the only one that needs no new
   search, no new subsystem coupling and no reversal of a standing decision.
2. It is the only one that helps a player **already** in this state, without
   changing anything under them. Option 1 helps nobody already broken; option 2
   helps them by silently rearranging their prison.
3. It answers the thing §1b measures, which is the real defect. The prison being
   unguarded is the player's own doing and is recoverable in four presses (§1d);
   the interface asserting *"1 of 1 · Covered"* over it is not the player's doing
   and is not recoverable by anything they can press.
4. It agrees with ADR 0092 decision 5's recommendation — keep the player's
   intent, report the consequence — for the adjacent case, which means one rule
   covers both the derived post and the player-placed one when the latter ships.
   The two documents recommending opposite things about the same mechanism would
   be a worse outcome than either.

**Against it, honestly:** it is the option that leaves the prison broken. A
player who does not understand the message still has an unguarded prison. If the
owner weighs "the game must not stay broken" above "the game must not lie", that
is a coherent reading and it points at option 2, whose real advantage is that it
repairs existing saves without a press.

**The ruling is the owner's.** This document does not self-approve, and
`AGENTS.md` forbids it doing so.

## 6. The weakest claim in this document, and what would change my mind

**That four wall segments is the *only* way a player reaches this state.** §1a
enumerates the four edges bounding one tile and measures 1, 2, 3 and 4 of them;
it does **not** prove that no other ordinary action strands the post. Two
candidates went unmeasured: a door built into one of those four edges and then
locked or put under a sector lockdown (`edgeStanding` consults the door before
the edge value, so a *door* is not a wall — but a door whose access check the
guard fails is a different question, and `checkDoorAccess` was read, not run);
and a room zoned around (16, 16) whose perimeter the player walls before cutting
the doorway, which is the same four edges by a different gesture and is very
likely the **common** route rather than a second one.

If either turns out to strand the post in fewer presses, §1a's "four, not one"
correction narrows but the conclusion does not move — every option below is
priced against the *state*, not against how many presses reached it. What would
change the recommendation is the opposite finding: if the post tile turns out to
be reachable in the interface today (it is not — §3, option 1, grepped), option
1 gets considerably stronger, because a refusal naming a thing the player can
see is a different proposition from one naming a thing they cannot.

**A second, smaller one:** the incident figures in §1e are one seed and one
fixture. The direction is not in doubt — `response-system.ts:498` routes every
responder to the same tile — but "0 resolved instead of 1" is one run, not a
distribution.

## Consequences

- **Nothing is built by this document.** No `src/` file changes, no test is
  added, `SAVE_SCHEMA_VERSION` does not move, no locale key is added and no
  string is authored.
- **ADR 0036 open question 1 stays open** until the owner rules, and this
  document is where the pricing lives.
- **ADR 0036's own text is not edited.** Its open question 1 is wrong in the four
  ways §1 records; the corrections live here rather than in that file, on this
  repository's standing habit of marking a claim where the correction was found
  instead of overwriting the original.
- **ADR 0092 decision 5 option A's stated cost is refuted** (§1b): coverage does
  not read short the whole time, it reads *covered* half the time. That document
  is `Proposed` and its decision 5 unruled, so nothing is invalidated by this —
  but a reader pricing it should use §1b's figure.
- **If option 3 is chosen**, a second decision falls out immediately and is named
  in §4: what `hud.security.coverage-met` says while the condition stands.
- **`docs/adr/STATUS-QUEUE.md` is owed an entry and does not have one.** The
  brief this was written under names that file as anchored and not to be touched,
  so the debt is recorded here and reported back rather than paid — the same
  shape ADR 0036 itself used for the same file.

## References

- [ADR 0036](./0036-a-derived-default-security-sector.md) — the derived default
  sector; open question 1 is this document's subject.
- [ADR 0092](./0092-who-decides-where-a-guard-stands.md) — decision 5 answers the
  player-placed case and is unruled; decision 3 is the one piece built.
- [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md) — decision 2,
  ruled and built, supplies the standing-condition shape option 3 uses.
- [ADR 0106](./0106-how-a-finished-wall-comes-down-without-a-keyboard.md) —
  `RemoveWall`, which §1d measures as the player's way out.
- [ADR 0110](./0110-what-security-sector-a-room-is-in.md) — independently
  establishes that exactly one sector exists in any startable session and that
  nothing player-visible reads it.
- [ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md) — the
  accepted constitution whose article 5 makes §1b a correctness problem rather
  than a polish one.
- [ADR 0116](./0116-whether-a-finished-object-is-an-event.md) — the precedent for
  pricing a new member of a closed union, and for declining to implement a
  recommendation.
