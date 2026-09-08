# ADR 0029: What a concurrent-use claim on a room is — when it is taken, when it ends, and who waits

## Status

**Accepted, 2026-08-26.** The owner approved the substance of this ADR — the
fairer queue — before the status line moved, and the implementing change has
been on `main` since it merged. So the status was the last thing here that was
still false, which is the defect §2 of [`STATUS-QUEUE.md`](./STATUS-QUEUE.md)
predicted for an ADR that lands alongside its own code: it sat `Proposed` on
`main` while the code it describes was already shipping.

What is accepted is the mechanism and the five decisions below, on the same
terms as the code that implements them. The approval does **not** reach the
starvation revisit condition recorded under the queueing rule — that stays a
condition to watch rather than a settled answer, and it is named here so a
reader does not mistake an accepted ADR for a closed question.

Three of the five decisions below are answers to questions
[ADR 0028](./0028-object-placement-and-derived-room-capacity.md) left open and
named as owed: its open question 7 (*"where an occupant is released from a
`room-catalog-id` room's occupant set"*), the queueing rule its phase 6
implies, and — this is the one that is a **correction** rather than an answer —
what its decision 3 said about the occupant set not being split.

The implementing change is on the same branch as this document and this ADR
arrived with it, which is the shape §2 of
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) warns about: an ADR that lands alongside
its code is `Proposed` on `main` from the moment it merges and can sit there
unnoticed. Its rule is followed here — the queue entry is in the same commit.

**Two passages below have since been corrected and one has been measured. Read
§*Amendment, 2026-08-26* before relying on §*Consequences* or on decision 5's
revisit condition:** the consequences section's claim that no room a player can
build reaches this gate expired when ADR 0028 phase 4 shipped, its claim that
the yard's ceiling is zero for ever was already wrong when this status line
moved, and the starvation decision 5 names is now measured rather than
predicted. Nothing in the decisions themselves moves.

### The number

**0029**, which `docs/adr/README.md` stated as next-free, and the check that
statement cannot make was made: `gh pr list --state open` returns **no open
pull requests** on this repository, so no unmerged branch is holding 0029 the
way 0024 through 0027 were being held when 0028 was allocated out of band. The
index's next-free is moved to **0030** in this commit, because
`tests/foundation/adr-numbering-contract.test.ts` derives it from the highest
number on disk.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every `file:line`, count and
figure below was read or measured on disk at `84e247c` (v0.0.62) or produced by
running this tree. There is no external tier: ADR 0028 already did the
comparable-game work this depends on, and this document decides the shape of
three functions in it.

---

## Context

### The defect, measured before it was fixed

ADR 0028's §*Context* recorded it and this change re-verified it: **nothing in
`src/simulation/prisoners/action-system.ts` called `assign`, `release` or
`occupancyOf`** — none of the three strings appeared in the file. So a room's
occupant set held only the prisoners `IntakeSystem` had *housed* there, and
`RoomInstanceRegistry.findAvailableForUse` compared that resident count against
`concurrentUseCapacity`. For a canteen the resident count is permanently zero,
so the gate was a pure zero-check.

Measured through `tests/unit/prisoners-concurrent-room-use.test.ts`'s fixture,
on the pre-fix tree, after **one** reconsideration tick:

| prisoners | `concurrentUseCapacity` | simultaneously performing in the canteen | `occupancyOf` |
| --- | --- | --- | --- |
| 5 | 2 | **5** | 0 |
| 40 | 1 | **40** | 0 |

Any capacity above zero admitted an unlimited number of simultaneous users.
That is what ADR 0028 phase 6 exists to fix, and this document decides the four
things fixing it cannot avoid deciding.

### The measurement that forces decision 1, which ADR 0028 did not have

ADR 0028 decision 3 says, in as many words: *"The occupant set is **not**
split. One set per instance stays, because 'who is inside this room right now'
is a fact rather than a role, and the two capacities are two ceilings on the
same count."*

**That does not survive contact with phase 6, and the file that says why was
already in the tree.** `src/simulation/economy/income.ts` carried this, under
the heading *"The stated assumption"*:

> today a slot is always an *accommodation* slot, because `IntakeSystem` is the
> only caller of `assign` anywhere in `src/`. If a future system registers
> occupancy that is not somewhere a prisoner is housed — **a canteen tracking
> diners**, a workshop tracking workers — this definition would **pay twice for
> one prisoner-day** and **has to be narrowed to accommodation before that
> lands**.

`StateIncomeSystem` credits `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` per
unit of `RoomInstanceRegistry.totalOccupancy` once per in-game day, and
`totalOccupancy` is the sum of the occupant sets. A canteen tracking diners is
precisely what phase 6 is. Under one undifferentiated set, a prisoner eating
lunch holds their cell *and* the canteen and the prison earns 600 a day for one
prisoner instead of 300 — a hard economic defect, in a system whose rate was
chosen against a payback derivation (`docs/research/2026-08-25-economy-rate.md`).

Two more consequences of one set, smaller but not arguable:

- **A `Set` cannot hold two claims by the same entity.** `Set.add` is
  idempotent, so a prisoner who both lived in an instance and claimed use of it
  would have one membership and two releases, and whichever release ran first
  would evict the other's claim. No action targets a `room.cell` by catalogue
  id today, so this is not reachable now; it is one content row away from
  being reachable, and it fails silently when it is.
- **`projectOccupancy` compares the count against `residentCapacity`**
  (`src/simulation/presentation/room-projection.ts`). Under one set a canteen
  with three diners projects `current: 3, capacity: 0, free: 0` — "three of
  nought residents", which is not a fact about anything.

So the occupant *set* has to distinguish the two claims. Saying that plainly,
and recording that it contradicts an accepted ADR's decision 3, is better than
implementing it quietly under a sentence that says the opposite.

### What is *not* in doubt

`residentCapacity` and `concurrentUseCapacity` stay two capacities on one
instance, with `findAvailableResidence` and `findAvailableForUse` as the two
gates. ADR 0028 decision 3's other half is right and this changes none of it.
Nor does anything here touch how the two numbers are derived (decision 2),
persisted (decision 6), or what happens to an over-capacity room (decision 2's
"nobody is evicted").

---

## Decision

### 1. A claim carries its kind. Two collections, two counts — and `occupancyOf` keeps the meaning it has always had

**Decided.** `RoomInstanceRegistry` holds `occupants` and `useClaims`, one set
per instance each, and each capacity bounds the count of its own kind:

| | claim taken by | bounded by | counted by |
| --- | --- | --- | --- |
| residency | `assign` — one caller, `IntakeSystem` | `residentCapacity` | `occupancyOf`, `totalOccupancy` |
| concurrent use | `claimUse` — one caller, `ActionSystem` | `concurrentUseCapacity` | `useOccupancyOf`, `totalUseClaims` |

**The property that makes this cheap is that `occupancyOf` and
`totalOccupancy` do not change meaning.** They counted residency before this
change, because residency was the only claim that existed; they count residency
after it. So `StateIncomeSystem`, `projectOccupancy`, the status strip's
`roomOccupants`, `findAvailableResidence` and `findBestAvailable` are all
untouched, and the narrowing `income.ts` demanded is achieved by *not* widening
anything rather than by editing an economy rule. Verified: the 250-actor
scenario's `totalOccupancy` is 250 before this change and 250 after it.

A third accessor, `claimCountOf`, is the sum, and it has exactly one question
to answer — decision 4.

#### Against one set with a per-entity tag. Rejected.

It keeps decision 3's letter ("one set per instance") and costs more than it
saves: every count then has to filter the set by tag, so `occupancyOf` becomes
a walk rather than a `size`, and `totalOccupancy` — read by a per-day economy
system and a twice-a-second projection, which is why it is a maintained counter
and not a sum — would need its own tag-aware counter anyway. Two collections
*are* two tags, with the counters falling out for free.

#### Against making `concurrentUseCapacity` bound residency too (and vice versa). Rejected.

A cell with one bed is `residentCapacity 1` and `concurrentUseCapacity 1`; a
canteen with two tables and four benches is `residentCapacity 0` and
`concurrentUseCapacity 14`. Cross-bounding would make the canteen refuse every
diner, because its residency ceiling is zero. Each capacity bounds its own
kind, and in practice the two never contend for the same room.

### 2. The claim is taken on **arrival**, not at selection

**Decided.** `claimUse` is called at the transition into `performing` — in both
places that transition happens, the `sameTile` fast path in `beginNextAction`
and the arrival in `continueTravelling` — and the claim is taken **before** the
arrival is applied, so a refused prisoner never enters the room: they keep the
tile they were standing on, drop to `idle`, and the cycle is counted in
`unmetDemandCycles`.

Why arrival and not selection: ADR 0028 decision 3 calls the set *"who is
inside this room right now"*, and a prisoner walking to the canteen is not
inside it. `findAvailableForUse` therefore answers a question and holds
nothing.

**The cost is real and is stated rather than discovered.** Between selecting an
instance and arriving at it the room can fill up, so a journey can be wasted.
Measured, with three prisoners starting in the corridor and a one-seat canteen,
one reconsideration tick per row:

```
t=1220  use=0  performing=0  phases=travelling,travelling,travelling  unmet=0
t=1240  use=1  performing=1  phases=performing,idle,idle              unmet=2
t=1260  use=1  performing=1  phases=performing,idle,idle              unmet=4
t=1280  use=0  performing=0  phases=idle,travelling,travelling        unmet=4
```

Two wasted trips, both counted. The ceiling is never exceeded, which is the
property that matters; the waste is visible in a metric that already exists for
exactly this ("observable unmet demand").

#### Against a reservation at selection. Rejected, and it is the closest call here.

It would eliminate the wasted trip: `findAvailableForUse` and the claim become
one operation, so nobody walks to a room they cannot enter. It is rejected for
two reasons.

First, it makes the occupant set mean "who is inside **or on their way to**
this room", and then `occupancyOf`'s sibling stops being a fact about the world
— a projection reading it would report a canteen as full while it is empty, and
"is anybody in this room" would have no accessor at all.

Second, and decisively: **a reservation has to be released on the travel
failure paths, and those are the paths that leak.** `continueTravelling` has
three of them (no path request, a failed route, a vanished target) and
`PrisonerOperationsRuntime.loadSnapshot` has a fourth, which drops every
`travelling` prisoner to `idle` because their path request died with the
previous `NavigationSystem`. Claiming on arrival makes all four leak-proof by
construction rather than by four correct release calls — a traveller holds
nothing, so there is nothing to forget. Given that a leaked claim silently
reduces a room's capacity for the rest of the session, the design that cannot
leak is worth two wasted walks.

**Revisit condition, stated so it is not rediscovered:** if wasted trips ever
become expensive — a locomotion model where walking costs time, or a room whose
seats are contended by hundreds — the answer is a reservation *with an
explicit expiry*, not a reservation without one.

### 3. The claim ends when the **action** ends. This settles ADR 0028's open question 7

**Decided.** ADR 0028 phase 6 names its own open question: *"whether a prisoner
in the canteen is released from the canteen's set when the action ends or when
they leave the tile."*

**When the action ends**, because **there is no departure event to hang the
other answer on.** `continueTravelling`'s arrival is an abstracted teleport
onto the anchor tile — `position.tileX/tileY` are written in one statement, and
the file says so — and there is no locomotion system, no path following and no
"left the room" transition anywhere in `src/`. "When they leave the tile" is
not a cheaper or a more expensive answer; it is not an answer, because the
event it names does not exist. Choosing it would mean inventing one, which is
the invented-consequence defect.

`releaseUseClaim` is therefore called at **every** exit from `performing`, and
there are exactly three:

1. the completion (`elapsed >= action.minDurationTicks`);
2. an unreadable action index — `CurrentActionComponent`'s documented `-1`
   sentinel, the value `reset` writes into a recycled slot, so the action being
   performed cannot be identified and can be neither continued nor completed;
3. the claimed instance no longer existing, which decision 4 makes unreachable
   through `unzone` and which is defended anyway.

One release site per exit, asked unconditionally, so no path can be the one
that forgot. `releaseUse` is total — an unknown instance, an entity holding no
claim, and a second release are all no-ops — which is what lets the release be
unconditional instead of mirroring the claim's `target.kind` test. Mirroring
would make case 2, the case that most needs a release, the case that skips it.

**When the prisoner is removed there is nothing to release, and that is a fact
about this tree rather than a gap.** Nothing in `src/` destroys a prisoner
entity (#31, re-verified: no call to `EntityStore.destroy` anywhere under
`src/simulation/`), so no claim can outlive its holder. The release path #31
adds will have to drop cold state, room occupancy, gang membership and the
component bit for a destroyed prisoner; a use claim is one more item on a list
that already exists, and `releaseUse` is the method it calls. It is named here
so that list is complete when it is written.

### 4. A use claim blocks un-zoning, and the guard and the throw ask the same question

**Decided.** `RoomZoningService.unzone` refuses with `room-occupied` when
`claimCountOf(instanceId) > 0`, and `RoomInstanceRegistry.unregister` throws on
the same predicate.

`unregister`'s existing comment gives the reason and it transfers exactly: a
resident holds an `accommodationInstanceId` in cold state and *"dropping the
instance underneath them would leave that reference naming a room that does not
exist"*. A performer holds a `currentActionTargetInstanceId` naming the same
instance, and it dangles the same way.

**The two must agree or a refusal becomes a crash.** Measured: with the guard
left at the narrower `occupancyOf` and `unregister` at `claimCountOf`, the
zoning test fails with `RangeError: Room instance "room.cell:0:0" still has
occupants` — thrown out of a command handler, through `Kernel.step()`, instead
of reaching the player as a refusal.

The cost is that a canteen cannot be un-zoned while somebody is eating in it.
That refusal is **transient by construction** — a use claim lasts one action —
so the same drag succeeds a moment later, and it is the same answer the player
already gets for an occupied cell.

### 5. Fairness: ascending entity index, no queue — and the starvation this permits is named

**Decided.** When more prisoners want a room than it seats, the ones later in
`EntityQuery.execute`'s **ascending index order** are refused. There is no
queue, no rotation, no priority and no fairness state of any kind.

This is a decision and not an accident, and what makes it defensible is that it
is not a new rule: ascending index is the order `ActionSystem.update` already
iterates in, the order `EntityQuery` documents as its guarantee (*"a total
order derived from state, stable across runs and across a snapshot restore"*),
and therefore the order that already decides every other contended outcome in
this system — including which prisoner gets navigation work budget first.
Contention is resolved at two points and both inherit it: the selection gate
(`findAvailableForUse` sees the claims taken earlier in the same scan) and the
arrival gate (`claimUse` refuses once the seats are gone).

Verified deterministic and verified to be *this* rule rather than merely *a*
rule: with five prisoners and two seats, the two admitted are the two lowest
indices, on every run. A test asserting only "two got in" would also pass for a
random choice, so the test asserts the identities.

**What it permits, said plainly: a low-index prisoner is systematically
favoured, and sustained contention can starve a high-index one.** A prisoner
who is refused retries on the next cycle with a hungrier need, but the need
raises their score against *their own other options*, never against another
prisoner — nothing in `selectBestAction` or in the scan compares two prisoners.
So with demand permanently above capacity, the same prisoners lose every time.

**This is accepted rather than solved, for a reason with a date on it.** A rule
that fixed it would be a scheduling policy — round-robin over a stored cursor,
or ordering the scan by need urgency — and either one is a per-tick ordering
decision over the whole population, which is ADR 0020's territory and a
different change. It is also not yet observable: see the consequences below for
why no room a player can build has a non-zero concurrent-use capacity today.

**Revisit condition:** when phase 4 makes canteens and shower rooms real, the
readout that shows a starving need is what should trigger this, and the fix
should be a stated ordering rather than a tie-break buried in `claimUse`.

*Its premise fired at `b097e70` and its trigger cannot fire, because no shipped
surface shows a prisoner's needs. See §*Amendment, 2026-08-26*, which measures
the starvation this paragraph predicts: with a six-seat canteen and 24
prisoners, indices 0–5 eat 40 meals each and indices 6–23 eat nothing at all,
identically on every run.*

> **Amended 2026-08-28: this decision's fairness half is closed, and its
> revisit condition was never what fired.** ADR 0041 decision 2 was taken as
> issue #434 and
> [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md): `ActionSystem.update` now runs the two contending passes —
> arrivals, then idle selections — in descending need urgency, with ascending
> entity index as the tie-break, which is the *"stated ordering rather than a
> tie-break buried in `claimUse`"* the revisit condition above asked for. What
> actually triggered it was the issue, not a need readout; no HUD surface shows
> a prisoner's needs even now (#104), so the trigger this paragraph names is
> still unable to fire and the fix landed without it.
>
> **Decision 5's own words hold in a narrower form than they did.** *"A
> low-index prisoner is systematically favoured"* is no longer true of a
> contested **need**: measured over 40,000 ticks with 24 prisoners and a
> two-head shower room, the two highest-index prisoners went from zero showers
> to six each and the worst hygiene anyone reached went from 0.0 to 96.8. It is
> still true of a contested **room whose need is served another way**: the
> six-seat canteen this decision's amendment measured leaves all 24 prisoners at
> the same stored hunger unit as each meal block opens, so the urgency key has
> nothing to separate them by and the tie-break reproduces the old order.
> Prisoners 12-23 still never enter it. That residue is recorded rather than
> fixed, because with the prisoners measurably identical there is no
> state-derived reason to prefer either, and the alternatives that would rotate
> them anyway are the ones ADR 0041 rejected as C and D.
>
> **Decision 6 is untouched and no save version moved.** The ordering keys are
> pure functions of state the save already carries — needs in stored units, the
> classification group, the incident override, the room instances and the tick —
> so nothing was persisted to buy the fairness.
>
> **The ADR that records *which need decides urgency* is
> [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md).**
> This paragraph said it "is owed a centrally-assigned number and does not exist
> yet" and told the reader to treat the choice as open; the number was assigned
> the same day and the document exists. It also carries, as its open question 1,
> the half of decision 5 that is *not* closed — a canteen whose contenders are
> identical to the stored unit — with ADR 0041's option C and a tick-derived
> rotation costed against each other and neither taken.

### 6. A use claim is derived, not persisted. No save version moves

**Decided.** `RoomInstanceRegistry.getSnapshot` still emits residency only, no
save-schema key is added, and `SAVE_ENVELOPE_VERSION` does not move.

(**`SAVE_ENVELOPE_VERSION` never existed, on this date or any other.** The
constant this decision means is `SAVE_SCHEMA_VERSION`,
`src/persistence/save-schema.ts:36`, which was already declared and already
`5` in the tree this document was written against — so the sentence above is
true and only its name is wrong. Marked rather than overwritten, per
`docs/AGENT_WORKFLOW.md` §4: the decision is untouched, and
[ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
decision 4 inherited the same misspelling from this line.)

A use claim is a pure function of two values the save already carries:
`CurrentActionComponent.phase` and the cold state's
`currentActionTargetInstanceId`. Persisting it would put a derived value in the
payload that can disagree with the state that produced it — the argument ADR
0028 decision 6 already made for the two derived capacities, one system over.
So `PrisonerOperationsRuntime.loadSnapshot` rebuilds them, and the order is
load-bearing: the registry's `loadSnapshot` clears every claim, the existing
loop drops every `travelling` prisoner to `idle` and clears its target, and
`ActionSystem.reinstateUseClaims` runs last, over `EntityQuery.execute`'s
ascending index order.

Both failure directions are closed by that shape rather than by care:

- **A leak is impossible** because the clear is unconditional — a claim held
  before the restore cannot survive it, so every claim standing afterwards was
  rebuilt from a prisoner who is genuinely still performing.
- **A duplicate is impossible** because the rebuild is idempotent — claims are a
  `Set` and the scan visits each live index once — so restoring the same
  snapshot twice produces the same count.

**The rebuild ignores `concurrentUseCapacity`, deliberately**, through a
separate `reinstateUseClaim` rather than `claimUse`. A claim being rebuilt was
granted once already under whatever capacity stood then, so it is not a grant
and has no ceiling to check. If it were gated, a saved state holding more
performers than the room's current capacity — legal, since ADR 0028 decision 2
makes over-capacity a named state and evicts nobody — would silently drop the
excess claims while those prisoners kept performing, and the room would
over-admit for the rest of the session. Under-counting is the failure this whole
change exists to remove, so the restore reproduces the count exactly and lets it
sit above the ceiling.

### 7. Determinism

Four commitments, and one gate entry.

1. **No RNG.** No stream is registered, no stream's sequence moves, and no
   existing draw is reordered. Contention is decided by index order alone.
2. **No unordered iteration decides an outcome.** The one `Map`/`Set` walk added
   is `this.useClaims.values()` in `loadSnapshot`, which clears every set — it
   touches each set once and leaves no residue an order could depend on, the
   same argument the adjacent `this.occupants.values()` exemption already makes.
   It is added to `tests/determinism/canonical-iteration-contract.test.ts`'s
   allow-list **with its reason recorded**, which is what that gate asks for,
   and the allow-list count moves from 9 to 10.
3. **The rebuild is a total order derived from state**, being
   `EntityQuery.execute`'s ascending index.
4. **A refused claim mutates nothing.** In `beginNextAction` the claim is
   settled before the action index, the action target and `actionsStarted` are
   written, so a refusal leaves no half-started action behind and the metric
   counts actions that actually began.
   *ADR 0041's amendment reported this commitment as held but **unguarded** — a
   mutation violating it left the whole suite green, because no ordinary prison
   can reach the branch. It has a guard since issue #434:
   `tests/unit/prisoners-concurrent-room-use.test.ts`, "leaves no action index,
   no target and no started-action count behind", drives the refusal through a
   registry that refuses `claimUse` and asserts the three production writes.
   Moving `actionsStarted += 1` above the claim turns it red. **The branch is
   still unreachable from a fixture that only builds a prison**, and #434's
   reordering did not change that: `findAvailableForUse` is consulted two
   statements before `claimUseIfNeeded` and nothing runs in between, within one
   prisoner's turn, whichever prisoner's turn it is.*

---

## Consequences

### The 250-actor scenario's behaviour moved, and no pinned fingerprint moved

ADR 0028 called phase 6 *"the only phase that changes a per-tick system's
behaviour ... and the one place a scenario fingerprint moves"*. It does. Measured
on `tests/unit/prisoners-operations-scenario.test.ts`'s own scenario — 250
actors, seed `0x5eed5eed`, 2,500 ticks — through that file's own fingerprint
function, digested here as `FNV-1a/length` because the string is 8,796
characters:

| | `main` @ `84e247c` | this branch |
| --- | --- | --- |
| fingerprint digest | `340c89f2/8796` | `8fda6f9/8796` |
| `actionsStarted` | 9,640 | 10,065 |
| `actionsCompleted` | 2,789 | **1,286** |
| `unmetDemandCycles` | 6,783 | **15,184** |
| `routeFailures` | 6,783 | 7,126 |
| `totalOccupancy` | 250 | 250 |

**Nothing was re-baselined, because nothing is baselined.** That test's
fingerprint is a *run-to-run* comparison — `runScenario` twice with the same
seed, `expect(second.fingerprint).toEqual(first.fingerprint)` — not a pinned
literal, exactly as ADR 0028 decision 7 recorded. It passes. The full suite
passes.

The behavioural numbers are the intended effect, and their shape is worth
reading: `actionsCompleted` more than halves and `unmetDemandCycles` more than
doubles, because that fixture seats 40 in its canteen and 8 in its shower room
against 250 prisoners, so the ceiling genuinely binds for the first time. Note
that on `main` `unmetDemandCycles` and `routeFailures` are *the same number* —
every unmet demand there was a routing failure. They now differ by 8,058, and
that difference is the capacity refusals this change introduced: demand that was
previously invisible because it was silently satisfied.

> **Amended 2026-08-28 (#435): this table has two more rows available, and the
> four it already has are unchanged.** `substitutionCycles` and
> `contendedSubstitutionCycles` count a prisoner who *was* served, and worse
> than they asked for — the case ADR 0041 decision 1 created and nothing
> counted. Re-derived on this same scenario at `aefd8fc` (250 actors, seed
> `0x5eed5eed`, 2,500 ticks, admitted through the test's own generator):
> `substitutionCycles` **3,956** and `contendedSubstitutionCycles` **356**, with
> a per-prisoner spread of 0..29 and 0..3 respectively.
>
> **Those two are a re-derivation and the four above are not**, which is the
> distinction that matters for reading this section. The `main` and `this
> branch` columns are a before/after of *this* decision at `84e247c`; five
> merges of prisoner behaviour later — ADR 0041's fallback, #434's ordering,
> ADR 0059's walk — the same scenario now measures `actionsStarted` 11,828,
> `actionsCompleted` 714, `unmetDemandCycles` 11,004 and `routeFailures` 10,903.
> The table is not restated with those, because what it records is a delta this
> change caused and not a current reading of the fixture.

`totalOccupancy` is unchanged, which is decision 1's whole point: the economy
does not move.

### Nothing a player can build is affected yet

*Both paragraphs of this subsection are false as of `b097e70`, and the second
was false before the status line above moved. They are left standing rather than
edited, and corrected in §*Amendment, 2026-08-26*, which quotes them and says
which clause moved.*

Every action that resolves by catalogue id targets a room whose
`concurrentUseCapacity` is derived from the objects standing in it, and ADR 0028
phase 1 ships one object buildable (`object.bed`). A canteen, shower room,
common room and classroom therefore all derive **0**, and `0 >= 0` refused those
actions before this change as well. So in a shipped session the gate changes
nothing observable; it becomes observable in phase 4, when those objects become
placeable. That is the honest order — the ceiling is made correct before anything
can reach it — and ADR 0028 said as much about phase 5 to 6.

`room.yard` is the one room this can never serve, and it is unchanged: it has no
object requirement at all, so `concurrentUseCapacity` is 0 for ever and
`action.yard-recreation` stays unreachable. That is ADR 0028's open question 4
and this ADR does not close it.

### What is owed, and to whom

- **The "over capacity" readout.** ADR 0028 decision 2 already owed it for the
  residency figure. `concurrentUseCapacity` is now a second number a room can be
  over, and `projectOccupancy` projects neither it nor the use count — noted in
  `room-projection.ts`'s own comment as not projected at all yet. Phase 5's job.

  **Half of that is no longer owed, and the bullet is corrected rather than
  overwritten because the clause that moved is not the one it is about
  (2026-09-05).** The *use count* is projected: `RoomListRowViewModel.
  concurrentUse` carries one ceiling per capability and `useOccupancyOf`'s
  count against each, and the Rooms panel reads it out (#997, #1003). So
  `room-projection.ts`'s comment no longer says "not projected at all yet" and
  an agent who greps for that sentence will not find it. What is still owed is
  the **over-capacity** readout itself, and its reason has changed too: not
  that the projection cannot say it — `current` and `capacity` are both
  published unclamped, so `current > capacity` is derivable — but that no
  surface does.
- **The starvation in decision 5**, with the revisit condition stated there.
- **A use claim in #31's release path**, per decision 3.

## What this decision does not settle

1. **Whether a prisoner should fall back to a second-choice action when the
   first is refused for capacity.** `selectBestAction` returns one action and
   `beginNextAction` gives up if its target does not resolve, so a prisoner
   refused a canteen seat does not then try `action.eat-in-cell` — they wait a
   cycle and re-select. That is pre-existing behaviour for every refusal reason,
   this change adds a new reason to reach it, and changing it is a utility-AI
   decision rather than a capacity one.
2. **Whether the claim should survive the reconsideration cadence.** A claim is
   held for the whole of `performing`, which is a multiple of 20 ticks, so a
   room's seat is granted in 20-tick quanta. Whether that granularity should be
   finer is a scheduling question and touches nothing here.
3. **Whether guards, staff or any non-prisoner actor take use claims.**
   `claimUse` takes an `EntityId` and is agnostic; nothing in
   `src/simulation/security/` calls it, and whether a guard occupying a room
   should count against its seats is a deployment decision.

---

## Amendment, 2026-08-26: both halves of §*Nothing a player can build is affected yet* are false, decision 5's revisit condition cannot fire on its own terms, and the starvation is measured

*This amends **the consequences section and the revisit condition under decision
5**. No decision moves: decisions 1 to 7 are the shipped rule and this changes
none of them, including decision 5's ascending-index tie-break itself. What has
gone false is a **statement about the tree** — a consequences paragraph written
when nothing could reach the gate, and a revisit condition anchored on a surface
that does not exist. The form is the one ADR 0027's §*Status* Update and ADR
0028's three amendments established: the record of what was decided stays, the
old wording is quoted rather than overwritten, and what the tree does instead is
recorded beside it.*

*Status is untouched: this ADR remains **Accepted, 2026-08-26**. Read at
`54418b6` (v0.0.121); every `file:line` below was opened on that tree and every
number was produced by running it.*

### The half that expired: a canteen a player builds now seats six

The consequences section says:

> Every action that resolves by catalogue id targets a room whose
> `concurrentUseCapacity` is derived from the objects standing in it, and ADR
> 0028 phase 1 ships one object buildable (`object.bed`). A canteen, shower
> room, common room and classroom therefore all derive **0**, and `0 >= 0`
> refused those actions before this change as well. So in a shipped session the
> gate changes nothing observable; it becomes observable in phase 4, when those
> objects become placeable.

The last clause came true and the rest expired with it. ADR 0028 phase 4 shipped
at `b097e70` (#384): `src/content/room-catalog.ts:98` finishes `room.canteen`
with two dining tables and four benches, `src/content/object-catalog.ts:87`
gives the `3x2` `object.dining-table` `capabilities: ['dining']`,
`src/simulation/construction/definition.ts:441` makes `dining-table-wooden` a
buildable row, and `src/simulation/prisoners/actions.ts:48-49` is the action
that asks for `'dining'` in `room.canteen`.

Measured on the real command path — `PurchaseMaterials`, `ZoneRoom`,
`PlaceObject`, the real `ConstructionSystem`, the real kernel — a canteen
furnished to its catalogue minimum derives a **`'dining'` ceiling of 6** while
its all-objects `concurrentUseCapacity` reads 14. So **the sentence "nothing a
player can build is affected yet" is false, and the heading above it is false**;
this gate is the thing that now decides who eats. `definition.ts:389-397` states
the same arithmetic from the construction side and predicted this paragraph's
expiry in its own words.

### The half that was already false when the status line moved

The same section says:

> `room.yard` is the one room this can never serve, and it is unchanged: it has
> no object requirement at all, so `concurrentUseCapacity` is 0 for ever and
> `action.yard-recreation` stays unreachable.

That is the wrong direction, and it did not expire — it was **wrong on `main` on
the day this document's status line moved**.
`src/simulation/prisoners/room-instance-registry.ts:350` reads
`if (capability === undefined) return Number.POSITIVE_INFINITY;`, and
`src/simulation/prisoners/actions.ts:63-66` gives `action.yard-recreation` no
`requiredObjectCapability`. The yard's ceiling is therefore **infinite, not
zero**, and `actions.ts:20-26` says so in its own words: *"Absent means any
instance of the target room type qualifies, and no object-derived ceiling
applies"*.

The change that did it is `8a5fdcc` (#335), recorded as ADR 0028's
§*Amendment, 2026-08-26: the concurrent-use ceiling is scoped to the capability
being asked for*. `git merge-base --is-ancestor 8a5fdcc f591648` succeeds, and
`f591648` is #356, the commit that moved this ADR's status line — so the
sentence was already false when it was approved. It is recorded here rather than
deleted, because "an accepted ADR carried a false consequence for two merges"
is the fact worth keeping.

Nothing above touches ADR 0028's open question 4, which this ADR declined to
close and still does not close.

### Decision 5's revisit condition: its premise has fired, its trigger cannot

Decision 5 reads:

> **Revisit condition:** when phase 4 makes canteens and shower rooms real, the
> readout that shows a starving need is what should trigger this, and the fix
> should be a stated ordering rather than a tie-break buried in `claimUse`.

Two clauses, and they have come apart.

- **The premise has fired.** Phase 4 shipped at `b097e70`, per the section
  above.
- **The trigger cannot fire, because the readout it names does not exist.**
  `src/simulation/presentation/prisoner-projection.ts:197` builds `lowestNeed`
  and `projectPrisonerDetail` carries all six need levels;
  `src/simulation/worker/projection-catalog.ts:300` serves them on the
  `hud/prisoner-detail` channel. **Nothing under `src/ui/` asks for that
  channel** — the only prisoner projection the HUD consumes is
  `projectPrisonerPopulationCounts`, through
  `src/simulation/presentation/status-strip-projection.ts:15`, and it carries no
  need. So a prisoner's hunger can sit at 0 for the length of a session with no
  surface in the game reporting it.

That is why this went unnoticed for the two merges above: the condition was
written to be triggered by a player noticing something the game does not show
them. **A revisit condition anchored on a surface that does not exist is not a
condition.** Stated here so the next one is anchored on a measurement instead.

> **Amended 2026-08-29 (#535 decision 6). No decision changes. The surface the
> bullet above says does not exist now does, so the trigger it calls unfireable
> can fire.** Marked rather than rewritten: "the readout does not exist" is the
> premise a reader would carry forward, and the *shape* of the failure it
> records — a condition anchored on a surface nobody built — is worth keeping
> whatever the surface's state today.
>
> The bullet rotted in **two** steps, and neither was wrong when written:
>
> 1. *"the only prisoner projection the HUD consumes is
>    `projectPrisonerPopulationCounts`"* became false at `f8393f0` (#459,
>    2026-08-28), which gave `src/ui/simulation-prisoner-roster.ts` the
>    `hud/prisoner-roster` channel. `git merge-base --is-ancestor f8393f0
>    068dbb5` **fails**, so this paragraph (`068dbb5`, 2026-08-26) predates it
>    and was accurate on the day. What stayed true through that merge is the
>    sentence that matters here: the roster deliberately dropped `lowestNeed`,
>    so nothing yet reported a need.
> 2. *"a prisoner's hunger can sit at 0 for the length of a session with no
>    surface in the game reporting it"* became false today. Each Regime roster
>    row draws that prisoner's worst need as a bar, with the need's word beside
>    it and `data-need-permille` on the row.
>
> `hud/prisoner-detail` is still consumed by nothing under `src/ui/`, so that
> half of the bullet stands unchanged.
>
> **What this does not do is take decision 5's revisit.** It removes the reason
> the revisit could not be triggered; whether the starvation measured below now
> warrants the stated ordering decision 5 asks for is that revisit's question,
> and it is not answered here.

### The measurement decision 5 deferred, taken

Decision 5 accepts the unfairness in terms it chose carefully — *"nothing in
`selectBestAction` or in the scan compares two prisoners. So with demand
permanently above capacity, the same prisoners lose every time"* — and §*What
this decision does not settle* 1 records that a refused prisoner does not fall
back to `action.eat-in-cell`. Neither statement had a number against it. They do
now.

A prison built through the real commands: one `room.cell` with 24 beds
(`residentCapacity: 24`, so every prisoner is housed and every prisoner has an
`own-accommodation` target), one `room.canteen` furnished to its catalogue
minimum (`'dining'` ceiling **6**), 24 prisoners admitted, 24,000 ticks — ten
in-game days, thirty meal blocks. `routeFailures: 0`, so nothing below is a
navigation artefact.

| prisoner index | meals eaten | meals eaten in cell | hunger reached | ticks at hunger 0 | refused at the canteen door |
| --- | --- | --- | --- | --- | --- |
| 0–5 | **40** each | 0 | never below 179.5 | 0 | 0 |
| 6–23 | **0** each | **0** | **0.0** | ~18,915 of 24,000 | 40 each |

The cut falls exactly on the ceiling, and it falls on the same prisoners on
every run — byte-identical per-prisoner outcomes across two runs, and identical
`ActionMetrics`. A sweep against the same six-seat canteen puts the cliff at the
seventh prisoner: 6 prisoners → all six eat; 7 → indices 0–5 eat 40 meals each
and index 6 eats nothing; 8 → indices 6,7 eat nothing; 12 → 6,…,11 eat nothing;
24 → 6,…,23 eat nothing. **The population above the ceiling never eats at all,
however large it is.** With one dining table instead of two the same shape holds
one index lower: 0–2 eat 40 each, 3–23 eat none.

**`action.eat-in-cell` rescues nobody, and cannot.** Not one of the 24 prisoners
performed it in 24,000 ticks. `beginNextAction` picks one action before it asks
about a target — `selectBestAction`
(`src/simulation/prisoners/utility-ai.ts:32`) scores `deficit × effect` with no
availability term — and `action.eat-meal`'s hunger effect is `4` against
`action.eat-in-cell`'s `3` (`actions.ts:49` and `:53`), on the same need, in the
same `meal` category, so the canteen outscores the cell at every hunger level
above zero deficit. When the target then fails to resolve,
`action-system.ts:328-332` counts an unmet cycle and returns; there is no second
candidate. The fallback §*What this decision does not settle* 1 leaves open is
not merely unimplemented — under this scoring rule it is **unreachable**.

**The mechanism is incumbency, not just index order**, and this is the part
decision 5 did not foresee. One meal block traced tick by tick, prisoner 0 (a
winner) against prisoner 6 (a loser), `useClaims` being the canteen's `'dining'`
occupancy:

```
tick   claims  p0                        p6
14000       0  idle/use-toilet/out       idle/use-toilet/out
14020       0  travelling/eat-meal/out   travelling/eat-meal/out
14040       6  performing/eat-meal/IN    idle/eat-meal/out      <- p6 refused at the door
14060       6  performing/eat-meal/IN    idle/eat-meal/out      <- p6 refused at selection
14080       0  idle/eat-meal/IN          travelling/eat-meal/out
14100       6  performing/eat-meal/IN    idle/eat-meal/out      <- p0 re-claims standing still
```

Decision 2 puts the claim at arrival, so **a traveller holds nothing and a
prisoner already standing on the anchor tile holds the `sameTile` fast path**
(`action-system.ts:343`). A winner who finishes a meal stays in the room, and on
the next reconsideration takes the seat again without moving, while the loser is
still walking. Half of every winner's meals are taken that way: of 40 meals
each, **20 were entered from `idle` on the anchor tile and 20 after travelling**.
Ascending index decides the first round of a block; incumbency decides every
round after it, and the two point the same way. So the losing set is not merely
"the high indices lose more often" — it is closed, and it never reopens.

**What the consequence is, bounded honestly.** `hunger` clamps at `NEED_MIN`
(`src/simulation/prisoners/needs.ts`), and **no system in `src/` reads
`hunger`** — the only need feeding a downstream consequence is `safety`, through
`src/simulation/runtime/new-session.ts:598` into `IncidentTriggerSystem`.
Nothing kills, releases or disciplines a starving prisoner (#31 still owns the
release path). So this is **real starvation with a bounded consequence**, not a
spiral: 75% of the population permanently pinned at a need level of zero, doing
nothing about it, in a game that currently has no way to tell the player. The
absent readout is the same gap as the section above, which is why the two are
amended together.

### What this changes, and what a reader has to do that no gate can

- **No decision moves.** Decision 5's ascending-index rule is what ships and is
  what was measured. Whether it should be replaced by a scheduling policy is
  written up separately as a proposal, with options and costs, and is
  deliberately **not** implemented here — decision 5's own reason stands, that a
  fix is a per-tick ordering decision over the whole population and therefore
  ADR 0020's territory. **That proposal is [ADR
  0041](0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md),
  which took decision 5's base half and deferred its fairness half as decision
  2 — now tracked as issue #434.** So the reader's job here is no longer to
  notice that something is owed; it is to read #434 before re-arguing the
  ordering question from this section.
- **§*What is owed, and to whom*'s second bullet is discharged as a
  measurement** and re-owed as a decision.
- **An amendment moves no `Status` line, so nothing mechanical in this
  repository can see this correction.**
  `tests/foundation/adr-status-reference-contract.test.ts:234-244` blanks a
  section whose heading matches `/amendment/i` before it scans, and everywhere
  else it compares *status words* to *status statements* — it has no notion of a
  consequences paragraph that stopped being true.
  `adr-numbering-contract.test.ts` compares the index to the filenames on disk.
  `adr-status-queue-anchor-contract.test.ts` reads `STATUS-QUEUE.md` alone. All
  three are green on this tree with both false paragraphs standing — verified by
  running them, before this amendment was written and after. **A reader is the
  only gate a consequences section has**, and an entry in
  [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) is what that reader is owed; it is not
  written in this commit and is owed by it.
