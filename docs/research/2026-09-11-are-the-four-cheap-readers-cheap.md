# Are the four "cheap" dead-room readers actually cheap?

Answers [#595](https://github.com/woogitsu/lockstate/issues/595)'s own question against itself:
it names garbage-room filth, utility-panel per-N power, security-office
information and staff-room fatigue as four readers that "cost almost nothing"
for the nine-dead-room gap [#584](https://github.com/woogitsu/lockstate/issues/584)
calls "probably the single largest design hole in the game." This record checks
that pricing against the tree at `c4cfc565` (v0.0.586) rather than inheriting
it, per the brief's own instruction to do so.

**VERIFIED** below means a file was opened and the cited lines read as quoted.
No claim here is FROM MEMORY.

## 1. The census, re-run

#595's own comment thread (2026-09-04, v0.0.465) already found the four rooms
this issue proposes readers for, plus three more, dead: for every catalogue
room id, every `'room.<id>'` occurrence in `src/` outside the catalogue, the
locale file and the message-key completeness list. Re-run today on the working
tree (`c4cfc565`, v0.0.586), the same grep returns:

| room id | occurrences outside catalogue/locale/message-keys | what they are |
| --- | --- | --- |
| `cell` | 3 | accommodation (intake, capacity) |
| `holding-cell` | 1 | `rendering/world/appearance.ts:120` — colour only |
| `solitary-cell` | 3 | sanction placement |
| `reception` | 1 | `appearance.ts:122` — colour only |
| `kitchen` | 2 | food-preparation action |
| `canteen` | 2 | dining action |
| `shower-room` | 3 | hygiene action |
| `laundry` | 2 | hygiene action |
| `yard` | 3 | recreation action |
| `common-room` | 2 | recreation action |
| `classroom` | 2 | education action |
| `infirmary` | 1 | `appearance.ts:130` — colour only |
| `security-office` | 1 | `appearance.ts:131` — colour only |
| `staff-room` | 1 | `appearance.ts:132` — colour only |
| `storage-room` | 2 | delivery/logistics |
| `delivery-bay` | 2 | delivery route |
| `garbage-room` | 1 | `appearance.ts:135` — colour only |
| `utility-room` | 1 | `appearance.ts:136` — colour only |

**Seven rooms are still dead: `holding-cell`, `reception`, `infirmary`,
`security-office`, `staff-room`, `garbage-room`, `utility-room`.** Each one's
single hit is `src/rendering/world/appearance.ts` mapping the room id to a fill
colour for the world view (`appearance.ts:120-136`, VERIFIED) — a render, not a
simulation read, so it does not change what a room does. **All four of #595's
candidates (`garbage-room`, `utility-room`, `security-office`, `staff-room`)
are confirmed still dead**, one week after the last check, at the same count
(seven) that check found. Nothing shipped against any of the nine in the
interim.

**#595's own title says "nine dead rooms," and the comment thread's own
recount already found seven, not nine — a correction #595 carries but does not
fold into its own title.** `holding-cell` has its own issue (#590) and
`infirmary` has its own (#589); neither is proposed a reader here. So "nine" is
this corpus's original count before two of the seven got their own issues
filed, and #595's title inherited the stale number. Restated for a reader who
starts at the title: **seven dead rooms remain, #595 proposes readers for four
of them, and the other three (`holding-cell`, `reception`, `infirmary`) are
tracked elsewhere or not at all.**

The three capabilities #595 calls "unread" are confirmed unread: `waste-disposal`
(`object-catalog.ts:115`), `utility-control` (`:116`) and `surveillance`
(`:112`) are each declared on exactly one object and appear nowhere else in
`src/` except in docblock prose that already says so (`construction/definition.ts:589-597`,
VERIFIED, quoted below).

## 2. Garbage-room filth — hits the save format, per the brief's own STOP rule

#595's mechanic: "Kitchen spoil, laundry and canteen use increment a filth
integer on those rooms." That integer has to survive a save/reload — a filth
counter that resets to zero every time a player reopens the game is a silent
defect, not a cheap version of the mechanic — so it is new **persisted**
per-room-instance state.

`RoomInstance` (`src/simulation/prisoners/room-instance-registry.ts:75`) is
the room-instance shape, and it is part of the save payload: `roomInstanceSchemaV5`
(`src/persistence/save-schema.ts:522`, VERIFIED) is the persisted room-instance
shape, referenced by `prisonersSectionSchemaFor`'s `roomInstanceDefinitions`
(`save-schema.ts:642`, VERIFIED). A `filth` field lives on exactly this object
and would need a row in exactly this schema.

The brief's own instruction is explicit: *"If a reader needs the save format
… STOP. `AGENTS.md` reservation 2 is not released."* `AGENTS.md` reservation 2
is `supabase/migrations/`, and [ADR 0107](../adr/0107-what-a-stale-build-order-cancellation-is-refused-for.md)
§6 (VERIFIED, quoted): *"`AGENTS.md` reservation 2 covers `supabase/migrations/`
and the save format; [ADR 0096]'s own approval-list item 6 restates that a
restore question is "outside any agent's mandate" even inside an accepted
document."* That ADR's own precedent for staying inside
reservation 2 is instructive by contrast: it added a token that lives in
memory and is never part of `ConstructionSnapshot`, precisely so it would not
need the reservation released. Filth cannot take that route — the whole point
is that it survives a reload — so it does not have ADR 0107's escape.

**Stopped here.** Building this needs the owner's release of reservation 2 for
this specific field, exactly as ADR 0096's approval-list item 6 and ADR 0107's
Decision §6 require. #595 prices this "cheap version tiny" (quoting its own
source, `batch-b-extract.md` B45); that source's own "Accepted cost" line
says the opposite in the same breath — *"filth is a new accumulator"* — and
the accumulator is the part that is not cheap.

## 3. Staff-room fatigue — hits the save format the same way

#595's mechanic: "Each guard carries a fatigue integer: +1 per worked day, +2
if wage arrears are outstanding, −2 at the day boundary if a `staff-room`…
exists." Same shape as filth: an integer that must survive a reload, attached
to an entity that is already persisted.

`GuardRecord` (`src/simulation/security/guard-roster.ts:22`, VERIFIED) carries
the comment *"Exported so the save payload (#70) can name this shape instead
of re-declaring it"* — it is authored specifically so the save schema can
mirror it field-for-field. `save-schema.ts:729,733,735` (VERIFIED) does mirror
it: `staffRoleId`, `deploymentPhase`, `patrolWaypointIndex` all appear there as
the persisted shape of one `GuardRecord`. A `fatigue` field added to
`GuardRecord` needs the identical treatment.

Neither `fatigue` nor `wage.*arrears` (as a per-guard signal — wage arrears
itself already persists, per #595's own correct claim, but nothing about
*this guard's* fatigue does) exists anywhere in `src/` today: `grep -rln
fatigue src/` returns nothing, VERIFIED by an empty result.

**Stopped here for the same reason as §2.** This is not "small — a counter, one
modifier" as priced; it is a new persisted field on an already-persisted
entity, which is exactly reservation 2's subject.

## 4. Utility-panel per-N power — not blocked by the save format, but not "one modifier" either

This one does not obviously need new *persisted* state: a sitewide count of
`utility-panel` objects against a count of provisioning objects
(`shower-head`, `stove`, `washing-machine`, `security-console`) can in
principle be recomputed from already-persisted object placements every time it
is needed, the same way `RoomDerivedCapacity` is recomputed from placements
rather than stored (`room-instance-registry.ts`'s own account of
`RoomCapacityResolver`, §"What changed" comment, VERIFIED). So this is not a
reservation-2 STOP.

But "one modifier" understates what wiring it in actually touches. The one
hook point where a room object's provisioning reaches a prisoner's need is
`applyNeedEffects` (`src/simulation/prisoners/action-system.ts:317-322`,
VERIFIED): it applies a **static** `action.needEffectsPerTick[needId]` — a
number authored once in the action catalogue, per action, with no notion of
"which object instance," "how many exist," or "is the site-wide pool
exhausted" anywhere near it. Making that rate depend on a utility-panel count
means:

1. A new aggregation across every `RoomInstance` in the prison (not per-room:
   #595 itself says the pool is sitewide, "one source gives 8"), counting
   panels and each provisioned object type, recomputed whenever a relevant
   object is placed or removed — the same shape `RoomCapacityResolver`
   already is for capacity, but a second one, for rate.
2. A decision this repository has not made and no comment addresses: whether
   the half-rate applies **per object instance** (which needs a deterministic
   rule for which specific `shower-head` is "inside" vs "beyond" the pool when
   it is short — nothing in `RoomInstanceRegistry` orders provisioning objects
   at all today) or **uniformly to the action's rate** (simpler, but a
   different mechanic from what #595 describes, since #595's own wording is
   "objects beyond the pool operate at half rate" — an object-level claim, not
   an action-level one).
3. Wiring the result into `applyNeedEffects` for (at least) four different
   need/action pairings — hygiene via `shower-head`, food via `stove`,
   laundry via `washing-machine`, and whatever `security-console`'s
   `'surveillance'`/`'workstation'` capabilities would mean for a rate (they
   are not a need-provisioning action at all today, per
   `construction/definition.ts:589-597` quoted in §5 below — `security-console`
   provisions nothing existing to rate-limit).

That is a new system with an undecided design question in the middle of it
(item 2), not "a count of panels against a count of provision objects, and a
half-rate flag on the provisioner" (#595's own quoted build size). `AGENTS.md`'s
required workflow says *"If a necessary architectural decision is genuinely
absent, create or propose an ADR instead of silently deciding inside
implementation code"* — item 2 is exactly such an absent decision, and picking
one silently here would be deciding architecture inside a "cheap reader," which
is the failure mode that rule exists to prevent.

**Not built.** Not because it is reserved, but because it is not the size
priced, and the missing piece (per-instance vs. uniform rate) is a real design
choice with a determinism consequence (per-instance needs a stable, ordered
rule; uniform does not), which belongs in an ADR rather than picked implicitly
by whichever agent gets to it first.

## 5. Security-office information — blocked by a decision the codebase already says is not its own to make

#595's mechanic has two halves: the Security HUD shows contraband-in-sector
counts without a sweep, and the alert band fires one regime block earlier.
Checked separately, because they turned out to need different things.

**The predictive half is closer to free than any of the other three.**
`SectorRiskTracker` (`src/simulation/incidents/sector-risk.ts:182`, VERIFIED)
already exposes exactly the quantity an early warning would read:
`getConsecutiveHotSamples(sectorId)` (`:201`) and `isSustainedHot(sectorId)`
(`:206`, `= getConsecutiveHotSamples(sectorId) >= this.policy.sustainedSamplesRequired`).
A security-office's early warning is, mechanically, just checking that a
sector's streak is one sample short of `sustainedSamplesRequired` — a read of
existing tracked state, no new persisted field (the tracker's snapshot already
carries `consecutiveHotSamples`, `sector-risk.ts:217-224`).

**But both halves need to know which sector a given `room.security-office`
instance is in, and the codebase says outright that this does not exist.**
`RoomProjectionOptions.sectorIdByRoomInstanceId` (`src/simulation/presentation/room-projection.ts:81`,
VERIFIED) is documented in the same file, verbatim:

> "The simulation has **no** room-instance-to-sector mapping: a
> `SecuritySectorDefinition` names the doors it governs and a post tile, and a
> `RoomInstance` names an anchor tile -- neither knows about the other. Rather
> than invent a spatial containment rule here, this is an explicit
> caller-supplied map, exactly the way `SimulationRuntime.searchContainerLocations`
> supplies the container positions `Container` itself does not carry. Without
> it, a room's security grade is simply absent rather than guessed."

And it is never actually supplied: `grep -rn sectorIdByRoomInstanceId src/`
returns exactly two hits, the declaration above and its own docblock in
`src/simulation/worker/projection-catalog.ts:75`, which explains why it is
left absent in the one place that could supply it, also verbatim:

> "`RoomProjectionOptions.sectorIdByRoomInstanceId` is left absent, so a
> room's security grade is absent rather than guessed. The simulation has no
> room-instance-to-sector mapping at all -- `room-projection.ts` says so at
> length -- and inventing a spatial containment rule *here*, in the wiring,
> would be the worst place in the repository to decide it."

So a room's sector is unknown in the running game today, by explicit,
load-bearing design choice recorded in two places, not by oversight. Building
"the Security HUD shows contraband-in-sector counts" or "the alert fires one
regime block earlier for a sector with a console" needs exactly the spatial
containment rule that comment refuses to invent in the one place it could be
invented cheaply. Doing it here, in a room reader, would be the same mistake
in a different file.

**Not built**, for the same `AGENTS.md` reason as §4: this is a genuinely
absent architectural decision (how a room relates to a sector, geometrically),
flagged as such by the people who wrote the code around it, and belongs in an
ADR rather than picked implicitly inside a "cheap reader." Once that mapping
exists, the security-office reader itself would be close to free — both
`getConsecutiveHotSamples` and `ContrabandRegistry.all()`
(`src/simulation/contraband/item.ts:191`) already carry the ground truth a
console would surface — but the mapping does not exist yet, and inventing it
is not a four-line reader.

## 6. Verdict

None of the four hold up as priced. Two ("cheap version tiny", "small — a
counter, one modifier") are new persisted state on already-persisted entities
and are blocked by `AGENTS.md` reservation 2 exactly as the brief anticipated.
The other two ("small", "the information … is what the no-patrol decision
removed") each need a system or a spatial mapping the codebase does not have
and, in the security-office case, explicitly declines to invent outside an
ADR. **No production code was changed.** The closest to buildable, once its
missing piece lands, is security-office's early-warning half — everything it
would read (`SectorRiskTracker`, `ContrabandRegistry`) already exists; only the
room-to-sector mapping is missing, and that mapping is a repository-wide
question (also needed by `room-projection.ts`'s own security grade display,
which has wanted it since before this issue), not specific to this reader.

## Weakest claim

This record did not attempt the "uniform rate" simplification of §4 to see
whether it alone (no per-instance ordering, applied only to the four named
object types) would fit inside what "small" should mean — it stopped at
finding the design question undecided, on the `AGENTS.md` rule that deciding
it here would be the error. A reader who disagrees that the choice needs an
ADR, rather than an implementation default, would reach a different verdict
for utility-panel specifically. Sections 2, 3 and 5 do not carry that
qualification: reservation 2 and the missing sector mapping are load-bearing
either way.
