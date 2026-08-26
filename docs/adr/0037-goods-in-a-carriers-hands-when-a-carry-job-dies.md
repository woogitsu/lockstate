# ADR 0037: Where goods go when a carry job dies with them in a carrier's hands

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation.** The owner did not
read this document. Put the choice of how to handle audit findings whose smallest
sensible fix needs an architectural decision, they answered *"choose yourself and
justify it in an ADR"*. So this is a real approval of the judgement delegated,
and not of the text. **A reader who disagrees with the decision below should
treat it as open** rather than as settled by someone who weighed it — the same
standing ADRs 0034, 0035 and 0036 carry, for the same reason.

What was delegated is narrow and worth stating: the owner approved *that someone
decide*, not option A over B and C. The argument for A is below and it is the
whole of the warrant.

**A conservation-preserving stopgap is already on `main` ahead of this
decision, deliberately, and this document is where that choice is now
ratified.** BUG-02 destroyed stock outright: a carry job
cancelled or route-failed on its **dropoff** leg compensated nothing, so the
quantity `withdrawReserved` had already taken out of the source container
ceased to exist. Measured on v0.0.112 before the fix: 10 bricks in, 6 after, 4
gone, nothing returned anywhere. Leaving that in place while a decision was
taken was not an option, so the fix implements **option A below** — return the
quantity to the source container — on the ground that it is the only option
that restores conservation *without introducing a concept the simulation does
not already have*. That reasoning is what this document ratifies. If a later
reader prefers B or C, the seam is one private method
(`JobSystem.compensateHeldStock`) and the change is local — which is the reason
accepting A now costs little.

**One debt, recorded rather than tidied.** This document owes a
`docs/adr/STATUS-QUEUE.md` §2 entry and does not have one. Its author's brief
named `src/simulation/operations/**` as the surface and four other agents were
holding the shared documents at the time; `docs/HANDOVER-2026-08-26.md` records
that the same rule has now failed four times for the same reason and that the
fix is structural. The entry that should exist is quoted in the commit that
adds this file, per the precedent ADRs 0032–0035 set.

**The number is not defended.** If another branch has taken 0037, this document
renumbers without argument and no citation of it is load-bearing yet.

## Context

`docs/OPERATIONS.md`'s **no-teleport rule** is the property this decision sits
against, and it is worth quoting exactly, because the stopgap bends it:

> Every unit of every item that *moves between containers* does so through a
> `CarryItemJob`'s two navigation-backed legs -- `deposit` only ever happens at
> a job's actual dropoff tile, after `withdrawReserved` actually happened at
> its actual pickup tile.

A `CarryItemJob` has two legs and the goods are in exactly one of two places:

- On the **pickup** leg, the job holds a `Container.reserve` and the stock is
  still physically in the source container. Ending the job here is fully
  solved: release the claim, nothing moved, nothing is owed. This case has had
  a dedicated regression test since #25.
- On the **dropoff** leg, `continuePerforming` has already committed
  `withdrawReserved`. There is no reservation left to release and the stock is
  not in any container at all. It is held by nothing but the job object, at
  whatever tile the carrier happens to be standing on.

The second case is the one with no decision behind it. The question is not
whether to compensate — destroying the goods silently is a defect, and it was
one — but **what physically becomes of a quantity that is nowhere when the job
carrying it stops existing.**

Three things make this more than a bookkeeping choice:

1. **There is a precedent, and it is not quite this case.**
   `ContainerMaterialsProvider.release` already decided the same question for
   the construction seam and chose "put it back", with the reasoning written
   beside it: `deposit` rather than a reservation reversal, because the
   withdrawal was already committed. `docs/OPERATIONS.md` accepts that as one
   of the two named exceptions to the no-teleport rule *on the grounds that
   nothing moves between containers*. That reasoning transfers to a carry job
   only partially. `ContainerMaterialsProvider` is bound to **one** container
   and its materials never had a location or a carrier; a carry job's goods
   have both. Returning them to the source container moves them **across
   space** without a route, which is the thing the no-teleport rule exists to
   forbid, even though it moves them between no two containers.
2. **The cancel path has no production caller yet, and the failure path does.**
   Grepped on v0.0.112: `JobSystem.cancel` has no call site anywhere in `src/`
   — it is reachable only from tests and from a future player-facing surface.
   `failJob` is reachable today, from `continueTravelling`, whenever a dropoff
   route comes back `permission-denied`/`unreachable` — a door locking behind a
   carrier mid-errand is an ordinary event in a prison. So the decision governs
   live behaviour now and a player-visible surface later, and those two may
   deserve different answers.
3. **Whatever is chosen becomes the shape of every future job kind.** #25
   shipped one concrete job kind on purpose ("representative flows prove
   extensibility"). The compensation rule chosen here is the one a kitchen
   job, a laundry job or a workshop job inherits.

## Decision required

Which of these three is the intended behaviour when an active job on the
dropoff leg is cancelled or fails?

### Option A — return the quantity to the source container (implemented as the stopgap)

`this.containers.getById(job.sourceContainerId)?.deposit(job.itemId, job.quantity)`.

- **Conservation:** exact and total on every path **where the source container
  still exists**, which is every path a player can reach.

  **Amended 2026-08-26. This bullet read "exact and total. Stock before equals
  stock after, for every item, on every path", and that was false in the commit
  that wrote it** — `64cd379` added this document and
  `compensateHeldStock`'s `if (source === undefined) return;`
  (`src/simulation/operations/job-system.ts:310`) together. On the **dropoff**
  leg `withdrawReserved` has already committed, so a missing source container
  means the carried quantity has nowhere to go and is voided silently. On the
  pickup leg nothing is lost: what is held there is a reservation *on the
  container that is missing*.

  **The guard is right and must not be removed.** Throwing out of a scheduled
  system update faults the worker and ends the session — that is the whole
  lesson of #419, decided one commit later.

  **What the bullet should have said, and the reachability, checked rather than
  assumed.** `ContainerRegistry` (`src/simulation/operations/inventory.ts:96-127`)
  exposes `register`, `getById`, `require`, `all`, `getSnapshot` and
  `loadSnapshot` — **and no removal of any kind**, so a container cannot
  disappear from a running session. `getSnapshot()` emits every registered
  container, and a job's `sourceContainerId` named a registered container when
  the job was created, so **a save this codebase produces always carries the
  source container of every job it carries.** The early return is therefore
  unreachable by play and is reachable only from a malformed or externally
  edited save. That is why the recommendation below is unchanged: this is a
  false sentence, not a live leak.

  `docs/OPERATIONS.md:264-274` already describes this hole correctly, including
  its cause and the restore route that reaches it — *"the one hole
  `compensateHeldStock` cannot close"*. The document that was wrong is this one.

  **The forward-looking risk, which is the reason to record this rather than
  quietly fix a sentence.** [#99](https://github.com/matmaxalez/lockstate/issues/99)
  — removing a built object dismantles it into salvage — is exactly the change
  that would give `ContainerRegistry` a removal path and turn an unreachable
  early return into a live way to destroy stock. **Whoever implements #99 owns
  this bullet.**
- **New concepts:** none. `deposit` exists, the source container exists, and
  `ContainerMaterialsProvider.release` already reverses a committed withdrawal
  this way.
- **Cost:** the goods cross the map instantly. A carrier that failed two tiles
  from its destination puts the bricks back 400 tiles away with no route. It is
  a third exception to the no-teleport rule and `docs/OPERATIONS.md` has to say
  so, which is a real erosion of a stated rule rather than a footnote — the
  same location-blindness the document already admits to for
  `ProcurementSystem.update`.
- **Player-visible consequence:** cancelling a delivery half-done silently
  rewinds it. No loss, and no cost to changing your mind either.

### Option B — drop the quantity on the floor where the carrier is standing

A container-less stack at a tile, picked up by a later job.

- **Conservation:** exact, and *physically* honest — the goods stay where they
  actually are.
- **New concepts:** a floor stack is a genuinely new entity. Nothing in
  `operations/` can represent stock that is not in a `Container`; it needs a
  representation, a save-schema section and a migration, a renderer, a rule for
  what happens when two stacks land on one tile, and something to generate the
  carry job that recovers it — otherwise it is conservation on paper and a
  permanent leak in play.
- **Cost:** much the largest change here, and it is the one that makes the
  no-teleport rule true rather than further excepted. It is plausibly the right
  long-term answer *and* the wrong thing to do inside a defect fix.

### Option C — void the quantity against a named, accounted reason

Destroy it, but record it — a `goods-lost` counter or ledger entry with a
reason, surfaced to the player.

- **Conservation:** deliberately broken, and *observably* so. Stock before does
  not equal stock after; the difference is accounted for rather than silent.
- **New concepts:** an accounting surface for lost goods, plus the refusal/
  reason discipline `docs/HANDOVER-2026-08-26.md` describes ("a refusal reason
  must come from an exhaustive `Record` over a named union").
- **Cost:** it is the only option under which a player can lose materials to a
  door closing, which is a design choice about difficulty and not only about
  correctness. It should not be arrived at by accident, which is precisely what
  the defect was: C's outcome with none of C's accounting.

## Recommendation

**A now, B as the tracked successor, C not without a deliberate design
intent.** A is already in place because conservation could not wait; it is the
smallest thing that is not a defect. B is what the no-teleport rule actually
implies and is the honest destination once a floor-stack representation is
worth its save-schema bump. C should be reached only if someone wants losing
goods to be a mechanic, and then it needs the accounting first.

## Consequences if A stands

- `docs/OPERATIONS.md`'s no-teleport section gains a third named exception,
  written in the same place as the other two, in the terms that section already
  uses.
- `JobSystem.compensateHeldStock` is the one implementation of compensation for
  both the failure and the cancellation path, so the two cannot drift apart per
  leg again — which is how BUG-02 happened.
- The conservation property is asserted, not assumed:
  `tests/unit/operations-job-system.test.ts` pins total stock before against
  total stock after with literal quantities on the route-failure path, the
  cancellation path, and a case where another job holds a live reservation on
  the same item. All three were run red against the unfixed code first.

## Open questions

1. **Does a player-facing cancel deserve a different answer from a route
   failure?** A rewind is generous for a cancellation the player asked for and
   arguably too generous for an errand that failed; today both take path A.
2. **Should the source container be able to refuse the return?** `deposit` has
   no capacity model, so A cannot overflow a container — because nothing can.
   If containers ever gain capacity, A acquires a failure mode of its own and
   this decision has to be reopened.
3. **What should a restored job on the dropoff leg do?** It is holding stock
   that a previous session withdrew; A compensates it correctly, but nothing
   asserts that a save taken mid-dropoff and reloaded still conserves. This
   deserves the treatment ADR 0033 gave the incident-response case.
