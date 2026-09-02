# What ruling 5 would cost

Measured on `main` @ `1eb1b5b6` (v0.0.380).

On 2026-09-02 the owner answered [ADR 0092](../adr/0092-who-decides-where-a-guard-stands.md)'s
open question 6 — which of two competing sectors owns a guard — with **the
player's sector wins**: an authored sector outranks the derived default, and
the derived default becomes a fallback that posts only a guard nobody else
claimed. That ruling is recorded; nothing here revisits it. This record costs
it out.

**The short answer, stated first because it changes what the rest of this
document is measuring: the ruling has no code to arbitrate yet.** Decision 7's
placement command (`SetSectorPost`) does not exist — `grep -n "SetSectorPost"
src/simulation/protocol/commands.ts` returns nothing — so no player action
creates a second sector today, and `claimableGuardIds` in
`src/simulation/security/post-eligibility.ts` "arbitrates" between exactly one
sector in every session a player can reach. Every measurement below is
therefore of a *mechanism that would fire*, exercised by hand-registering a
second sector the way decision 7's command eventually will, not of a defect a
player can hit on `main` today. §5 says what breaks when that command lands.

## 1. What arbitrates today, and what does it cost

Confirmed by reading and by a direct instrument (below): the arbiter is
**string sort on sector id**, and it decides nothing about authorship because
nothing marks a sector as authored.

- `SecuritySectorRegistry.all()` — `src/simulation/security/sector.ts:150-153`
  — `[...this.definitions.keys()].sort().map(...)`. JavaScript's default
  `Array.prototype.sort()` on strings is ascending code-point order; there is
  no comparator.
- `DeploymentSystem.assignUnassignedGuards` —
  `src/simulation/security/deployment-system.ts:180-198` — walks
  `this.sectors.all()` outer-to-inner, and for each sector walks
  `claimableGuardIds(this.guards)` (`src/simulation/security/post-eligibility.ts:103-107`,
  ascending entity id — `unassignedGuardIds()`'s own doc comment,
  `src/simulation/security/guard-roster.ts:231,236-238`, `.sort((a, b) => a - b)`)
  and `break`s once that sector's shortage is met
  (`deployment-system.ts:194-197`). A guard claimed for one sector is
  `assignToSector`'d immediately (`guard-roster.ts:180-184`, which flips
  `deploymentPhase` to `'travelling'`), so it drops out of
  `unassignedGuardIds()` and cannot be reclaimed by a sector processed later in
  the same call.

**So: with two sectors requiring guards, the one whose id sorts first
ascending, code-point order, wins first claim on every unassigned,
post-eligible guard, and the other gets only what is left.** That is not a
rule about authorship, registration time, or occupancy — it is a property of
two arbitrary strings, and a player cannot see either string.

**Confirmed by running the real code**, not only by reading it — a throwaway
instrument (`DeploymentSystem` wired against `SecuritySectorRegistry`,
`GuardRoster` and a real `NavigationSystem`, two sectors each requiring one
guard, exactly one claimable guard hired, `deployment.update({tick:0})` called
once so the claim is visible before any route resolves) — written as a
throwaway file under `tests/unit/`, prefixed `_scratch-` so it could never be
mistaken for a real spec, run, and deleted before this branch was pushed
(never collected by CI; not part of this diff):

| sector A id | sector B id | winner |
| --- | --- | --- |
| `security-office` | `security-sector.prison` | `security-office` |
| `zzz-player-placed` | `security-sector.prison` | `security-sector.prison` |
| `aaa-player-placed` | `security-sector.prison` | `aaa-player-placed` |

The third row is the one worth sitting with: a hypothetical player-placed
sector *beats* the derived default today, purely because its id happens to
start with `a`. The second row shows the same mechanism losing for a
differently-named placement. **Today's rule already sometimes looks like "the
player wins" and sometimes doesn't, by accident, depending on a string no
interface shows.** That is worse than a rule that is simply wrong in one
direction — it is silently non-deterministic *from a player's point of view*
even though it is perfectly deterministic in the code.

One more fact worth naming: **decision 7 has not decided what id a placed
sector gets.** No id-minting scheme for a player-placed sector exists
anywhere in `src/` or in ADR 0092. So today's accident cannot even be
characterised as "usually favours the derived default" or "usually favours the
player" — it depends on a scheme nobody has written yet.

## 2. Where an authored-vs-derived distinction would live, and what it would touch

**Every reader of `SecuritySectorDefinition`** (`src/simulation/security/sector.ts:48-56`
— `id`, `gradeId`, `doorIds`, `postTile`, `patrolRoute?`, `expectedPatrolLoopTicks?`,
confirmed against the file rather than assumed), found by grepping every
property-position and read-position occurrence of each field across `src/`:

| Reader | What it reads | Would it have to care about authored-vs-derived? |
| --- | --- | --- |
| `DeploymentSystem.assignUnassignedGuards` (`deployment-system.ts:180-198`) | `.id` via `.all()`, `.postTile` | **Yes — this is the one arbitration site.** |
| `DeploymentSystem.getCoverageReport` (`:87-91`) | `.id` via `.all()` | No. Per-sector required/assigned/shortage is independent of claim order; `.all()`'s existing id sort is fine for a *report*. |
| `DeploymentSystem.walkBackToPost` (`:167-178`) | `.patrolRoute`, `.postTile` | No — already resolved to one sector by the time this runs. |
| `PatrolSystem` (`security/patrol-system.ts:76-198`) | `.patrolRoute`, `.postTile`, `.expectedPatrolLoopTicks` | No — same reason. |
| `IncidentResponseSystem` (`incidents/response-system.ts:427,587,699,753`) | `.postTile` via `requireDefinition`, `.id` via `.all()` | No — responds to an incident already tied to a sector id; does not choose between sectors for a guard. |
| `SectorSearchDutySystem` (`contraband/sector-search-duty.ts:84-130`) | `.id` via `.all()` | No — sweeps sectors that already have an assigned guard; does not compete for one. |
| `deployment-phase.ts:97` (`isAtPost` support) | `.postTile` | No. |
| `sector-occupancy.ts:123` | `.postTile` | No. |
| `security-projection.ts:196-236` (HUD projection, currently has **no reader** — `hud/security` is unread per ADR 0092 §"what draws a post") | `.gradeId`, `.doorIds`, `.patrolRoute`, `.postTile`, `.expectedPatrolLoopTicks` | Only if a player-facing sentence later distinguishes an authored sector's row from the default's — that sentence is the owner's per this repo's fourth exclusion, and is out of scope here. |
| `room-projection.ts:507-510` | `.gradeId` | No. |
| `session-systems.ts:759-761` (restore relay, ADR 0092 decision 3) | `.postTile`, `.patrolRoute`, `.expectedPatrolLoopTicks` via `redefine` | No — relays fields already on the definition; does not decide between sectors. |
| `sector.ts` itself (`register`, `redefine`, `all`, `getDefinition`, `requireDefinition`) | the whole object | `register` would gain one new optional constructor field; `redefine` should **not** gain it (see below). |

**The count that matters: exactly one call site needs new logic** —
`DeploymentSystem.assignUnassignedGuards`'s outer loop. Everything else in the
table reads a `postTile`/`patrolRoute`/`doorIds`/`gradeId` value that is
already resolved to one sector; none of them chooses *between* sectors.

**Where the mark would live.** ADR 0092's own framing is right: `deriveDefaultSecuritySector`
is untouched by decision 6, so the mark is a field on the definition, not a
derivation change. Concretely: `SecuritySectorDefinition.authored?: boolean`
(or an equivalent two-valued `origin`), set once at `register()` time and
**never changed after** — for the same reason `id`, `gradeId` and `doorIds`
cannot move through `redefine` (`sector.ts:104-121`'s comment: those are what
`normalDoorStates` was captured against, and by the same logic authorship is
an identity fact about *when and how a sector came to exist*, not a live
control state a placement gesture should be able to rewrite later).
`redefine`'s `changes` parameter (`postTile?`, `patrolRoute?`,
`expectedPatrolLoopTicks?`) should **not** grow an `authored` entry — adding
one would be the one change in this whole exercise that *does* touch
`registryMethods()`'s pinned list indirectly by widening what `redefine` can
touch, and there is no reason for it to: nothing in ADR 0092 ties `redefine`
to authorship, and decision 3's restore relay only ever moves `postTile`/
`patrolRoute`/`expectedPatrolLoopTicks` onto a sector the runtime already
holds under the id it already has — it does not re-author it. (`register`
itself throws on a duplicate id at `sector.ts:85`, which §"Recommended shape"
below leans on.)

**Absence must mean "derived", not "false".** This is not a style preference;
it is load-bearing for two existing tests (§5) and for §3's save-compatibility
argument. `deriveDefaultSecuritySector` (`default-sector.ts:224-231`) would
simply not set the field — leaving it `undefined` — rather than setting
`authored: false`.

## 3. Does it need a save-format change

**No bump, no migration — but not for free**, and the reasoning is exactly
ADR 0038's, not ADR 0042's (the brief's own correction, confirmed: ADR 0042 is
"Attaching consequences to the simulation loop," not the save-compatibility
ADR; `docs/adr/0038-what-makes-a-save-compatible.md` is).

`SAVE_SCHEMA_VERSION` is 5 (`src/persistence/save-schema.ts` — grep confirms
no other value in the file), and `securitySectorDefinitionSchema`
(`save-schema.ts:716-725`) already carries `patrolRoute` and
`expectedPatrolLoopTicks` as `.optional()`. An `authored: z.boolean().optional()`
leaf added to that schema is exactly ADR 0038 decision 1's shape: *"every
section the build needs and the save omits has exactly one meaning."*

**What absence has to mean, stated concretely rather than left implicit**: a
save written by any build before this field exists carries **zero** sectors
that were ever created by a placement command, because that command does not
exist yet — every sector such a save carries was `applyDefaultSecuritySector`'d
or, at most, `redefine`'d onto by ADR 0092 decision 3's restore relay, which
(per §2 above) never touches authorship. So **absence unambiguously means
"derived"** for every save that exists today, with no ambiguity to argue
about — the same shape ADR 0038 decision 4 established for `masterSeed`
("production has never supplied another value").

**One real cost, the same one ADR 0038 §4 names for `masterSeed` and declines
to call a reason for a bump**: `securitySectorDefinitionSchema` is `.strict()`
(`save-schema.ts:725`), so a save carrying the new `authored` key, read by an
*older* build that does not declare it, refuses with `invalid-shape` /
`Unrecognized key: "authored"` rather than loading. Not measured directly
here (there is no build old enough to lack the key yet — the field does not
exist on any shipped build), but it follows deterministically from the same
Zod behaviour ADR 0038 measured for `masterSeed`, and it is the same
trade ADR 0038 accepted: a label on a refusal, not a difference in whether the
save loads.

**A second, smaller cost worth naming that ADR 0038 does not have an analogue
for**: `guardRecordSchema` is also `.strict()` (per ADR 0092 decision 1
option B's own citation, `save-schema.ts:727-738`), and nothing about ruling 5
touches guard records — but if a future implementer is tempted to persist
*which sector claimed a guard's arbitration priority* as a guard-record field
rather than deriving it from `GuardRoster.getSectorId` at restore time, that
would be a second `.strict()` schema to extend for no reason: `getSectorId`
already answers it, and nothing needs a second copy.

## 4. How visible is the change to a player, measured rather than guessed

**Today: not visible at all, because nothing a player can do creates a second
sector.** `grep -rn "SecuritySectorRegistry" src/main.ts` finds no call —
`register` is called only from `applyDefaultSecuritySector`
(`default-sector.ts:277`, via `createNewSimulationRuntime`) and from the
restore path. A starting prison has **zero** guards
(`grep -rln "\.hire(" src/simulation/` finds exactly two production call
sites, `src/simulation/runtime/session-commands.ts` — the `HireStaff` command
handler — and `src/simulation/staff/hiring.ts`; `new-session.ts` calls
neither), so the very first thing that could compete for a guard is the
player's own first `HireStaff` press, and there is nothing to compete against
until decision 7 ships.

**The two population numbers the brief asked for, measured against
`sector-staffing.ts` rather than restated from ADR 0092:**

- **Six residents ask for exactly one guard**, confirmed:
  `resolveOccupancyScaledGuardCount(scheduledGuardCount=1, occupantCount=6,
  true)` = `Math.max(1, Math.ceil(6/8))` = `Math.max(1, 1)` = `1`
  (`sector-staffing.ts:161-191`, `DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8` at
  `:147`).
- **A second guard becomes required at nine residents, not before**:
  `Math.ceil(8/8) = 1`, `Math.ceil(9/8) = 2`. The threshold is exact and there
  is no fractional zone — population 8 asks for 1, population 9 asks for 2.
- **A starting prison has zero guards.** Nobody is auto-hired; `HireStaff` is
  entirely player-initiated (confirmed above).

**What a player would concretely see change, once decision 7 ships and this
ruling is implemented — stated as a comparison of two mechanisms' behaviour,
not as a promise**: today, a player who has hired exactly one guard and places
one post competes with the derived default for that one guard *by the string
their placement command happens to mint as the new sector's id* — invisible,
and (per §1's table) not even reliably in the player's favour. Under ruling 5,
the same player's placed post **always** gets that guard, and the derived
default (wherever it is watching — the whole prison, per ADR 0048 decision 1)
goes unstaffed until a second guard is hired, **regardless of what id the
placement command mints**. The magnitude of the change is therefore not "a new
shortage appears" — ADR 0092 itself says the shortage is unavoidable at low
population and the ruling only decides *whose* it is — it is "the outcome
stops depending on an implementation detail and starts depending on what the
player actually did." That is a predictability improvement, not a headcount
improvement, and it is invisible until decision 7 exists to make it
observable at all.

**What this document does not do, per its own constraints**: it does not
propose the sentence a player reads when their derived default sits
unstaffed. ADR 0092 names that as owed to the owner and this brief repeats the
exclusion; nothing here drafts it.

## 5. What breaks

**Nothing breaks today**, because nothing under `src/` creates a second
sector — every existing test that registers more than one sector
(`tests/unit/security-scale.test.ts:42`, `tests/unit/security-sector.test.ts:13`)
does so to exercise doors, control state or occupancy, never two sectors
racing for a shared, scarce guard pool for the assertion itself. That absence
was itself worth confirming rather than assuming: `grep -rn "register(" tests/unit/security-*.test.ts
tests/integration/security-*.test.ts` was read in full; no fixture stands up
two sectors with combined requirement exceeding available guards.

**Named by file:line, with a verdict on each:**

- `tests/foundation/security-sector-authorship-contract.test.ts` — **would
  legitimately NOT need to change**, for the recommended shape in §2, and this
  is worth stating explicitly against the brief's own framing (which cited
  this file's PR #825 history as reason to expect it moves again). Its three
  pins are: `countedSites('patrolRoute')` (`:147-151`) and
  `countedSites('postTile')` (`:190-197`), which regex property-position
  occurrences of exactly those two field names and would only move if the new
  `authored` field's implementation touched a `patrolRoute:`/`postTile:` site
  — it should not; and `registryMethods()` (`:201-234`), which pins
  `SecuritySectorRegistry`'s public method list — unaffected because the
  recommended shape adds a field to `SecuritySectorDefinition`, consumed by
  the existing `register()`, not a new method. **This file's name is a false
  cognate worth flagging on its own**: it pins *field-origination* authorship
  (which module in `src/` writes a `patrolRoute`/`postTile` value) — a
  completely different sense of "authored" from ruling 5's *sector*
  authorship (which command created the sector). A future editor skimming
  the filename could easily update the wrong "authorship" concern in the
  wrong file.
- `tests/integration/security-default-sector.test.ts:200-202` —
  `expect(runtime.securitySectors.all()).toEqual([{ id: DEFAULT_SECTOR_ID,
  gradeId: 'grade.general', doorIds: [], postTile: ORIGIN }])` and
  `tests/unit/security-default-sector.test.ts:92` (`expect(deriveDefaultSecuritySector(...)).toEqual({...})`,
  same shape) — **would NOT need to change, and this was verified rather than
  assumed**: `toEqual` treats an object with an explicit `authored: undefined`
  property as equal to one that omits the key entirely (confirmed by a
  throwaway instrument run against this repository's actual `vitest` 4.1.11 —
  `expect({ id: 'x', authored: undefined }).toEqual({ id: 'x' })` passes — and
  the negative control, `expect({ id: 'x', authored: false }).toEqual({ id:
  'x' })`, throws, also confirmed, both deleted before push). **This is the
  concrete, measured reason `deriveDefaultSecuritySector` must leave the field
  entirely unset rather than writing `authored: false`** — §2's "absence must
  mean derived, not false" is not a style note, it is the difference between
  this pin staying green and going red on day one of the implementation.
- `tests/determinism/kernel-system-order.test.ts:436` — pins
  `{ id: 'security.deployment', order: 270 }` in the full system order list.
  **Would NOT need to change.** The recommended shape reorders *guard claims
  within* `DeploymentSystem.update`, not the system's position in the kernel's
  schedule.
- `tests/unit/security-deployment.test.ts:34` (*"assigns the required number
  of guards (ascending id)"*) — **would NOT need to change.** It registers one
  sector; the recommended two-key sort (authored-before-derived, then id
  ascending) is identical to plain id-ascending for a single sector, and the
  guard-ordering-within-a-sector half is untouched by this ruling entirely.
- **What *would* need a new test, rather than an existing one going red**: a
  case exercising exactly what §1's instrument measured — two sectors, one
  authored and one derived, combined requirement exceeding claimable guards —
  asserting the authored sector's shortage is filled first regardless of
  which id sorts first. No such case exists today because no such case is
  reachable without decision 7's command; the test itself will need a way to
  register an "authored" sector by hand (a fixture, the same way
  `tests/unit/security-sector.test.ts:13` hand-registers `sector-a` today)
  until that command exists to submit through.

## Recommended shape and its determinism argument

**Do not change `SecuritySectorRegistry.all()`'s sort.** Every other reader in
§2's table wants ascending-id order for its own reasons unrelated to
arbitration (a stable HUD listing, a stable coverage report, a stable sweep
order for `SectorSearchDutySystem`), and changing it would ripple into all of
them for no reason tied to this ruling.

**Give `DeploymentSystem.assignUnassignedGuards` its own ordering for the
claim loop only**: partition `this.sectors.all()`'s result into authored and
derived, and within each partition keep the existing ascending-id order
(`.all()` already gives you this order; a partition preserves it). Concretely,
a comparator of `(authoredRank, id)` where `authoredRank` is `0` for
`definition.authored === true` and `1` otherwise, walked in that order instead
of `.all()`'s raw order, for this one loop.

**Why this is a total order, per this document's hard constraint.** Two keys:
`authoredRank` (two values, `0` or `1`) then `id` (a string).
`SecuritySectorRegistry.register` throws on a duplicate id
(`sector.ts:88`, `if (this.definitions.has(definition.id)) throw...`), so no
two sectors in one registry ever share an id — the second key alone is
already a total order over the sectors in play, and prepending the first key
cannot introduce a tie: two sectors can share `authoredRank` (both authored,
or both derived — today's shape has at most one derived sector by identity,
`default-sector.ts`'s comment on `DEFAULT_SECURITY_SECTOR_ID` being "fixed for
the life of a prison," but nothing stops two future authored sectors sharing
`authoredRank=0`) and in that case the id — already unique — breaks it. **No
comparison in this shape can return "equal."**

## What could not be measured, and why

- **Whether an old `.strict()`-schema refusal for a future `authored` key
  reads `invalid-shape` with the exact message ADR 0038 measured for
  `masterSeed`.** Not measured directly: there is no build in this
  repository's history that lacks the field (it does not exist on any commit
  yet), so there is nothing to construct the "older build reads newer save"
  case against. §3's claim rests on Zod's `.strict()` behaviour being uniform
  across leaves of the same schema, which ADR 0038 already measured for a
  sibling optional field in the same envelope — a reasonable inference, not a
  fresh measurement.
- **What a player-placed sector's id-minting scheme will be.** Decision 7 is
  unbuilt and names no scheme. §1's "today's arbiter sometimes favours a
  hypothetical player sector and sometimes doesn't" is therefore itself
  provisional on ids this document invented (`security-office`,
  `zzz-player-placed`, `aaa-player-placed`) to demonstrate the mechanism, not
  on ids any real command would mint.
- **The magnitude of the visible change in a real playtest.** §4's comparison
  is derived from reading `resolveOccupancyScaledGuardCount` and the
  deployment loop, not from driving a real session through both the old and
  new arbitration with a placement command — because that command does not
  exist to drive. A real playtest of this ruling's visibility has to wait for
  decision 7.

## Corrections to this brief

- **ADR 0038, not ADR 0042, is the save-compatibility ADR** — the brief said
  so itself and it is confirmed: `docs/adr/0042-attaching-consequences-to-the-simulation-loop.md`
  answers ADR 0048 decision 3's own open question 2 (occupancy scaling), not
  save compatibility.
- **`post-eligibility.ts:98` and `deployment-system.ts:180-200` are close but
  not exact** — `claimableGuardIds` is declared at `post-eligibility.ts:103`
  (`:98` lands inside its doc comment, a reasonable near-miss), and
  `assignUnassignedGuards` runs `:180-198`, with the claim `break` at `:195`
  rather than `:200`.
- **Nothing else in the brief needed correcting.** Its two central factual
  claims — that `claimableGuardIds` returns unassigned post-eligible staff in
  ascending id, and that `deriveDefaultSecuritySector` is unchanged by
  decision 6 — both held up exactly as stated against the real files.
