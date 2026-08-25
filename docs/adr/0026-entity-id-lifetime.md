# ADR 0026: The lifetime of `EntityId`-keyed state — generation exhaustion, release, and re-intake

## Status

**Proposed — pending human approval.** Not accepted.

Nothing in `src/` implements any decision in this document, and nothing in
`src/` changed to accompany it. What landed alongside is a set of test cases
that *pin the current, defective behaviour* as a tripwire, so that none of the
options below can be taken without arriving at those files and stating which
one was taken. That is described in §*What landed, and why it asserts the
wrong answer on purpose*.

A reviewer is being asked to settle three questions. They are filed together
because they have one root — this codebase has no point at which a prisoner
stops existing — and answering any one of them in isolation forces a guess at
the other two.

1. **What happens when an index's generation counter is exhausted?**
2. **What must `release` drop, and how does it stay complete?**
3. **May `IntakeSystem.submitIntake` be called for an already-admitted
   prisoner?**

## Context

### The mechanism, and what it actually does at the wrap

`EntityStore.destroy` does `generations[index] = (generations[index] + 1) &
0xFFF` (`EntityStore.destroy`, `src/simulation/entity/entity-store.ts`).
The residues are
`0..4095` and the increment is unconditional, so one index's generation
returns to its starting value after **exactly 4,096 destroy/spawn cycles of
that index**. The period is per index: `generations` is a `Uint16Array`, and
index 7 wrapping says nothing about index 8.

ADR 0015 records the wrap and uses it as an argument — a name cannot be
derived from an entity id, because the id repeats. What it does not record is
what the repeat does to everything else, and that is worse than "an id
repeats". Measured by execution, at the 4,096th recycle of one index:

- **`isAlive(staleId)` returns `true`.** A handle to an entity that died
  4,096 lifetimes ago now names the entity currently in the slot, and no
  record the store keeps can tell them apart — `getIndex` and `getGeneration`
  both agree with the live id, because it *is* the live id.
- **`destroy(staleId)` kills that live entity.** The read side is a
  wrong-data bug; the write side is a wrong-entity kill, from a handle held
  in a queued command, a pending path request, or a projection built one tick
  ago.

This is a use-after-free with the guard that normally catches it — the
generation — having silently come back around to agreeing.

### The three stores whose entire safety is "the key changes"

`PrisonerColdState`'s three maps (`prisoners/components.ts`),
`GangRegistry.gangIdByMember` (`incidents/gangs.ts`) and
`ActorIdentityRegistry.byKind`'s inner maps (`identity/actor-identity.ts`)
are all plain `Map<EntityId, …>`. #111 was about *index*-keyed component arrays
inheriting a released prisoner's state, and PR #150 fixed that by resetting
every component when an index is allocated. These three were never exposed to
#111 for a different reason: a recycled index gets a new generation, so the
old `EntityId` no longer matches and the lookup *misses*.

At the wrap they stop missing. Verified by execution: the new occupant of a
wrapped index inherits the previous occupant's cell, gang membership and
name. It is the same defect as #111, one level up, and no per-index component
reset can reach it, because the mechanism being relied on is "the key is
different now".

`ActorIdentityRegistry` is the sharpest case, because it already states the
contract it then breaks: `release` is documented as **required** when an
actor is destroyed, "because a retained entry would eventually hand the
slot's next occupant the previous occupant's name". Nothing calls it.

### Latency, stated so the severity is not overstated

Nothing in `src/` destroys an entity at all — there is no release or parole
path (#31) — so no index is recycled even once today, let alone 4,096 times.
Every observation above was reached by driving `EntityStore` directly.

What makes this worth deciding *before* #31 rather than after is that 4,096
recycles of one index is a long-running prison, not a pathological input, and
that the three options differ enough in cost that discovering the question
while implementing release would mean choosing under pressure.

The neighbouring, louder defect on the same counter — `spawn()` returning
negative ids from generation 2,048, against three modules that state an
unsigned contract — was a separate matter, needed no decision, and is closed
(`tests/unit/entity-id-unsigned.test.ts`). It is mentioned only because it is
the same bit budget that makes option B below expensive.

## What landed, and why it asserts the wrong answer on purpose

`tests/unit/entity-generation-wrap.test.ts` and one case in
`tests/unit/prisoners-intake-system.test.ts` assert today's behaviour,
labelled `DEFECT` in each case name and explained at the top of each file.

They exist because nothing else in the suite observes any of this. Mutating
the wrap period from `& 0xFFF` to `& 0xF` — a 256× worse version of exactly
this defect — leaves the entire suite green except one case in
`actor-identity.test.ts`, which pins the arithmetic *period* and not a single
one of its consequences.

Pinning a known-defective behaviour is itself a statement, so it is made
explicitly rather than by omission: these cases say "this is what happens
today and it is wrong", not "this is acceptable". Every option below changes
at least one of them, which is the point — none can be implemented silently.

## Question 1 — what happens when a generation is exhausted?

### A. Refuse to recycle an index past its last generation

The index is retired rather than pushed back onto the free list. Silent
corruption becomes a bounded capacity loss, which is the trade this
repository generally prefers: a fault it can name over a fault it cannot see.

**Cost, measured rather than estimated.** Applying this and running the full
suite fails exactly one test:

```
FAIL  tests/unit/actor-identity.test.ts > why a name cannot be derived from an
      entity id > pins that EntityStore hands the same id back after 4,096
      destroy/spawn cycles at one index
```

(Two further failures in the same run, in
`prisoners-operations-scenario.test.ts` and
`prisoners-actor-tier-scale.test.ts`, were 27s and 31s timeouts under
concurrent load; both pass on a re-run with the same patch applied. They are
not consequences of the change.)

That one failing case is the **only** guard this project has on this counter,
and it is load-bearing for ADR 0015's argument rather than incidental — and
since #308 that ADR is **Accepted**, so the argument the pin supports is a
settled decision rather than a pending one, which raises what re-baselining it
costs rather than lowering it. It is
also not obviously wrong after the change: the id genuinely no longer comes
back, so a name still cannot be derived from an id, and the case's stated
purpose survives even though its assertion does not. **Whether that
assertion is re-baselined is part of this decision and is not taken here.**
It is named as the specific thing a reviewer approving option A is also
approving.

Also unresolved under A: what a retired slot costs in a save. `freeIndices`
and `generations` are both snapshotted, so a session that retires slots
carries the retirement across a save with no format change — but
`nextAvailableIndex` climbing past `capacity` is `EntityStore capacity
exhausted`, thrown, and there is no policy for what a prison does at that
point.

### B. Widen the generation field

**Not cheap, and #169 originally said the opposite before correcting itself.**
20 index bits plus 12 generation bits is 32 of 32, and JavaScript's bitwise
operators are 32-bit, so every generation bit gained is an index bit lost:
one bit halves addressable entities from 1,048,575 to 524,287. Going past 32
bits is a different change again — `EntityId` would stop being an int32,
which is what every `>>>`, `& INDEX_MASK` and numeric id sort in the store
assumes.

It also changes what a saved `EntityId` means, so it needs a migration
(`AGENTS.md` boundary 7) and an ADR 0015 amendment, on top of the capacity
cost. It buys a longer period, not a bound: at 13 bits the wrap is at 8,192.

### C. Clear the `EntityId`-keyed stores on release

Correct regardless of wrapping, and the same shape as PR #150's component
reset. It is also the only option that fixes the *general* problem rather
than lengthening the fuse.

Its cost is the one #111 was about: release has to know every store, and
"eighteen today, eighteen of nineteen tomorrow" is how #111 happened. If this
is the answer it wants the reflection-based accounting #167 added for
components, so that a nineteenth store cannot appear without someone choosing
what release does with it.

It also does not, on its own, stop `isAlive(staleId)` returning `true` or
`destroy(staleId)` killing a live entity. Those are properties of the store,
not of the stores keyed off it. **A and C are therefore complements rather
than alternatives**, and a reviewer may reasonably take both.

## Question 2 — what must `release` drop, and how does it stay complete?

#167 recorded that four methods exist and none is called for a destroyed
prisoner. Re-verified in the current tree:

| Method | Callers in `src/` |
| --- | --- |
| `RoomInstanceRegistry.release` | none |
| `ActorIdentityRegistry.release` | only `reconcile`, which itself has no caller |
| `GangRegistry.removeMember` | none |
| `ComponentBitset.remove` | only the snapshot-load bitset rebuild |

`PrisonerColdState` has no per-entity release method at all — only `clear()`
across all three of its maps, for a whole-snapshot load.

This question is inseparable from question 1: option C *is* an answer to it,
and options A and B leave it standing. It is also inseparable from #31, which
is the issue that will need it. The decision to take here is not "should
release drop these" — obviously it should — but **what mechanism keeps the
list complete**, given that a hand-written list is the failure mode #111
already produced once.

## Question 3 — may `submitIntake` be called for an already-admitted prisoner?

`IntakeSystem.submitIntake` (`prisoners/intake-system.ts`) is `public`, takes an
`EntityId`, and performs three writes: sentence length, prior incidents, and
`intakeStage = 'queued'`. It checks nothing — not liveness, not the stage it
is overwriting, not whether the prisoner already has a cell.

`PrisonerOperationsRuntime.admitPrisoner` is its only caller, and it resets
every component immediately before calling, so the stage write is
unobservable from that path: a freshly reset slot already reads `'queued'`.
#167 pinned the write rather than deleting it, on the grounds that a future
re-intake or transfer caller would need it.

**What the write actually enables, measured by execution.** Admit a prisoner,
run the pipeline to `completed` (they are housed in `cell-0`), then call
`submitIntake` again for the same entity. The pipeline runs a second time and
`accommodation-assignment` calls `assign` on a *second* instance while the
first still holds them:

```
after first intake  : cell 'cell-0',           occupies ['cell-0']
after re-submit     : stage 'queued',          occupies ['cell-0']
after second run    : cell 'solitary-cell-0',  occupies ['cell-0', 'solitary-cell-0']
                      occupancyOf('cell-0') = 1,  completedCount = 2
```

Three things are wrong there and none is recoverable:

- **One prisoner, two beds.** `RoomInstanceRegistry` is the authority on
  occupancy and it reports both.
- **The first bed is leaked permanently.** `coldState.getAccommodation`
  points only at the newer cell, and `release` has no caller, so nothing will
  ever free `cell-0`.
- **`completedCount` counts one prisoner as two completed intakes.**

There is a fourth consequence that matters more than the three above for this
repository's central invariant: the second run reaches the `classification`
stage and **draws from `prisoners.classification`**. That is documented as
the only RNG use in the prisoner slice, so a re-intake shifts the stream every
later arrival's classification is read from. A re-intake path that could be
replayed a different number of times would therefore be a determinism defect,
not merely a bookkeeping one.

**The decision.** Three shapes, and the answer changes what the pinned test
asserts:

- **No.** Guard `submitIntake` — reject, or no-op, for an entity that is not
  at a stage where intake may begin. The stage write becomes genuinely
  defensive and `admitPrisoner` stays the only door.
- **Yes, and it must clean up first.** Re-intake releases the existing
  accommodation and cold state before restarting. This is question 2's
  problem again, at a smaller scale, and it needs the RNG consequence
  answered explicitly.
- **Not through this method.** Make it private and give re-intake, transfer
  and return-from-parole their own entry point with their own contract. The
  stage write then serves whatever that new caller needs.

**Not decided here.** #169 calls this a design question in its own words, and
the code answers it only by accident.

## Consequences

- **The defect is now observable.** Three of #169's claims were arithmetic
  arguments in a document; they are executable cases in the suite. Whatever
  is decided, the evidence for it no longer depends on re-deriving the bit
  layout.
- **Any fix arrives at a labelled test.** Options A, B and C each change an
  assertion in `entity-generation-wrap.test.ts`, and each of question 3's
  three shapes changes the case in `prisoners-intake-system.test.ts`.
- **Option A costs a re-baseline of `actor-identity.test.ts`**, which is
  named here rather than performed. It is the only guard on this counter and
  ADR 0015's argument leans on it.
- **A and C together are the only combination that fixes both halves.** C
  alone leaves `isAlive` and `destroy` lying at the wrap; A alone leaves the
  three stores inheriting whenever release does exist and forgets one.
- **#31 inherits all of this.** The release path is where every one of these
  questions becomes load-bearing on the same day.

## What this decision does not settle

1. **What a prison does when entity capacity is genuinely exhausted.** Option
   A makes that reachable; `spawn` throws today and no caller catches it.
2. **Whether `EntityQuery.execute`'s index walk should be reconsidered.** Its
   comment already records that index order is id order only while every live
   slot shares a generation. That is true with or without any option here,
   and the walk delivers a total order derived from state either way, so it
   is a correctness question about a comment rather than about the loop.
3. **Whether the four uncalled `release`/`remove` methods should be removed
   instead.** If #31 never lands, they are dead code that reads as a
   safeguard, which is worse than no method at all. Nobody has proposed
   that; it is named so the option is visible.
