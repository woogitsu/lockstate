# ADR 0056: Keeping a player's orders in the order they gave them

## Status

**Proposed, 2026-08-28.** Not self-approved.

It closes issue #437 — the owner's own issue, filed with a reproduction — and it
is implemented on this branch under the owner's standing mandate (`AGENTS.md`,
"The owner's standing mandate": *decide after research rather than asking*).
It **narrows a player-visible promise made by
[ADR 0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
two days after that ADR was written**, which is why it is a document and not
only a commit message, and why it is deliberately not self-approved.

Nothing here touches the four exclusions the mandate keeps: no server entry
point, no `supabase/migrations/`, no deploy configuration. On the fourth — *a
player-visible promise the code does not keep* — this ADR exists precisely to
avoid creating one: ADR 0051 promises that "`Undo` takes back the thing the
player just did instead of nothing", and after this change there is a window in
which it takes it back a second later instead of immediately. That window is
described below rather than left to be found.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), 0056 was assigned by the integrator before this draft
existed, and the stated next-free number is a ceiling rather than a reservation
— an unmerged branch cannot be seen from [the index](./README.md). 0055 is held
by a parallel draft. If 0056 collides, renumber this file, its row in
[`README.md`](./README.md), and every citation of it in `src/`, `tests/` and
`docs/` (`grep -rn "0056" src/ tests/ docs/`).

- Related: issue #437;
  [ADR 0020](./0020-deterministic-kernel.md) (*"Decision, 2026-08-27"*, which
  names this fix and leaves it open, and the *"Amendment, 2026-08-28"*),
  [ADR 0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md),
  [ADR 0009](./0009-challenge-verification-strategy.md),
  [`docs/DETERMINISM.md`](../DETERMINISM.md)

## The question

A player places a wall, presses Play, places a second wall, and pauses again
straight away to think. Then they press Undo, meaning *take back that second
wall*.

**Which wall goes?**

## What the code does today, and the defect

Read on `6f671d5` (v0.0.136). Every line below was opened, and the run at the
end of this section was produced by executing the shipped classes.

1. **The `executeAtTick` every command carries is computed in exactly one
   place**: `SimulationCommandSender.projectExecuteTick`
   (`src/ui/simulation-commands.ts`). It returns the last reported tick while
   the clock is paused, and `lastTick + ceil(elapsed × speed / 50) + leadTicks`
   while it runs, with `DEFAULT_LEAD_TICKS = 20`. ADR 0020's census of
   `Kernel.submitCommand` callers established that this is the only producer:
   one caller in `src/`, one message, one expression.
2. **That expression is not monotonic.** `handleSetClock` answers a pause with
   the kernel's exact tick (`src/simulation/worker/state-machine.ts:827-849`),
   so the projection *collapses* onto it. An order given while the clock ran
   sits twenty-odd ticks in the future; the next order, given during the pause
   that follows, carries a **higher `sequence` and a lower `executeAtTick`**.
3. **The kernel dispatches in ascending `(executeAtTick, sequence)`**
   (`src/simulation/kernel/kernel.ts`, `dispatchDue`). So the later order runs
   first. For twelve of the thirteen gestures that reach the simulation that is
   invisible, because they commute — two walls on two tiles are the same two
   walls in either order.
4. **`Undo` and `Redo` do not commute.** They count positions in the command
   stream (ADR 0009 makes that stream replay evidence, and `dispatchDue`'s own
   header says so), and `ConstructionSystem` maintains the stacks they pop
   (`src/simulation/construction/system.ts:358-424`). An `Undo` dispatched
   before the order it was aimed at reverses **the order before that one**.

Driven end to end — the shipped `SimulationCommandSender` against the shipped
`SimulationWorkerStateMachine`, with a real `Kernel`, a real `FixedStepClock`
and the real `ConstructionSystem` inside it — issue #437's gesture produces:

```
sequence 0  scheduledForTick  0   PlaceBuildOrder first
sequence 1  scheduledForTick 21   PlaceBuildOrder second
sequence 2  scheduledForTick  0   Undo            <-- behind `second`, ahead in dispatch

orders:    [ { id: "first",  state: "cancelled" },
             { id: "second", state: "materials-pending" } ]
undoStack: []
redoStack: [ ["first"] ]
```

Nothing is refused. **The player's earlier wall is cancelled and the wall they
were trying to take back gets built.**

### It survived ADR 0051, and the mechanism changed underneath it

This matters because #437 was filed before ADR 0051 landed, and ADR 0051 changed
the dispatch mechanism this issue is about. It is worth recording that the defect
was re-measured rather than assumed:

- **Before ADR 0051** all three commands sat in the queue and the
  `(executeAtTick, sequence)` comparator put the `Undo` at the head.
- **After ADR 0051** the first order and the `Undo` are each *due* on
  submission, so each is dispatched immediately by
  `Kernel.dispatchDueCommands()` from `handleSubmitCommand`, while `second`
  waits at tick 21 because its lead has not arrived.

Two different routes, **the same outcome** — the block above is this tree's own
output today, and every value in it is the value #437 reported before ADR 0051
existed. The comparator was never the cause; the non-monotonic projection was,
and ADR 0051 neither fixed nor worsened it. That was worth establishing before
touching anything, because "the mechanism this issue describes has been
replaced" is a reason to re-measure and not a reason to assume.

### One correction to the issue's reproduction

#437's script submits both build orders with **no `transactionId`**. The shipped
HUD never does: `src/main.ts:1915` mints `build-${crypto.randomUUID()}` once per
intent, which is why a twelve-segment dragged wall undoes as one wall. With no
id, `registerTransactionOrder` compares `undefined` with `undefined`, finds a
match, and folds every order ever placed into a single open transaction — so one
Undo takes back the whole session. That is a separate, pre-existing and
deliberate property of the grouping rule (`src/main.ts:1900-1914` records the
day it was chosen), and measuring the two together would have confused them. The
guard uses one id per gesture, which is what a player produces.

**Re-run that way, the defect is one step worse than #437 reports.** With a
transaction id per gesture and no fix, the measured outcome is `first`
cancelled, `second` alive at `materials-pending`, and **both stacks empty** —
because `second`, arriving after the Undo, opens a gesture of its own and
`registerTransactionOrder` clears the redo stack for a new gesture. #437's
`redoStack: [["first"]]` only survives because its reproduction sent no ids. So
through the real front door the wrongly cancelled wall is not merely offered
back by the wrong control: it cannot be recovered by any gesture at all. Redo
is a no-op, and pressing it changes nothing.

## Decision

**`SimulationCommandSender.projectExecuteTick` never returns a tick below the
highest this session's command stream is already known to carry.**

1. The sender holds a `highestSubmittedTick` floor, and
   `projectExecuteTick` returns `Math.max(estimate, floor)`. The estimate
   itself is unchanged and is free to move backwards; the floor is the half
   that must not.
2. `submit` raises the floor to the tick it is about to send — before the send,
   so a reply delivered re-entrantly cannot seed a higher floor only for the
   assignment after the send to put it back down; and on the attempt rather
   than on the acknowledgement, exactly as `nextSequence` advances on the
   attempt.
3. **`baseline` seeds the floor from the kernel's own pending queue**, out of
   the session snapshot it already reads `expectedSequence` from. This is the
   half ADR 0020 said a sender-side fix would be incomplete without: a restored
   session can hold commands ahead of anything this sender has submitted, and
   those commands were issued by the player *before* the save was written.
4. A session boundary (`simulation/ready`, `simulation/stopped`) resets it,
   because the stream it describes is gone.

Nothing is refused, no tick is ever lowered, and the floor stops binding the
moment the kernel's tick passes it.

**Why this is the right layer.** The two numbers a command carries have to agree
with each other, and the only place that can make them agree is the place that
issues both. The kernel cannot: ADR 0020 measured all four shapes of a
kernel-side answer — throw, drop, clamp, reschedule — and rejected each, chiefly
because `Kernel.restore` bypasses `submitCommand` by design so no guard there
can establish the invariant it would exist for. This ADR does not re-open that;
it takes the remedy ADR 0020's own closing section names.

### Why an order given during a pause is what pays

**Because it is the only thing that can.** In the window where the floor binds,
there is a command already queued at a future tick and a new gesture arriving
now. Exactly one of three things can happen to them, and two are worse:

- run the new gesture first — that is the defect;
- pull the queued command forward to the current tick — that rewrites when an
  order the player already gave takes effect, and ADR 0020 rejected the same
  move at the kernel (*"strictly worse than clamping"*);
- hold the new gesture until the queued one has run — this decision.

### What it costs the player, stated as a measurement

**One second, in one window, and never more.**

The floor binds only while a previously submitted command is still ahead of the
kernel's tick. Every command a shipped sender submits carries at most
`lastTick + elapsed + 20`, so the floor can exceed the current tick by at most
one lead — twenty ticks, which is one second of simulated time at ×1 and a
quarter-second at ×4. Once the clock has run that far the floor stops binding
and the estimate leads again.

The bound is in **ticks**, and that is the honest way to state it: a player who
gives an order at ×4 and then drops to ×1 waits longer in real time for those
twenty ticks to pass. It is still bounded, and by the right thing — a held
gesture never runs later than the tick the order ahead of it runs at, because
that tick *is* the floor. Nothing waits on anything except an order the player
themselves already gave.

So the affected gesture is precisely: *an order given during a pause that began
within one second of the previous order.* Outside that window — a pause entered
from a settled clock, which is the ordinary "stop and plan" the game is played
with — the queue is empty, the floor is below the current tick, and **ADR 0051's
immediacy is untouched**. Inside it, the wall appears on the first step after
play instead of at once.

`tests/determinism/command-submission-monotonicity.test.ts` measures the
boundary in both directions: the floored ticks inside the window, and an order
after the drain projecting past it.

### How this narrows ADR 0051, precisely

ADR 0051 decided *"a command that is due is dispatched when it is submitted,
even while the clock is paused"*, and its mechanism is a test of dueness:
`executeAtTick <= tick`. **That mechanism is unchanged and no line of it moves.**
What changes is how often a paused command satisfies it — a floored command is
genuinely not yet due, and the worker's paused drain already leaves a not-due
command alone and always did (`handleSubmitCommand`: *"A command still queued
ahead at a future tick … is not due and is left alone"*).

The sentence in ADR 0051's *"What the player sees afterwards"* that this
qualifies is: *"`Undo` takes back the thing the player just did instead of
nothing."* It is still true, and it is **more** true — before this change the
paused `Undo` did something immediately and the something was wrong. What it now
needs is the clause: *unless an order given in the last second is still
pending, in which case it takes it back on the first step after play.*

### Why this is not a determinism change

No simulation code is touched. `executeAtTick` is an **input** to the
simulation, computed on the main thread, and every determinism guarantee this
repository makes is about what the kernel does with a *given* stream: ADR 0009's
*"a recorded command stream plus a seed is the run"* fixes the stream and
replays it. This change alters which stream a live player produces, not how any
stream executes. The comparator, the queue, both restore paths and every system
are untouched.

Shown rather than asserted: the determinism scenario at `SCENARIO_SEED`, run
400 ticks and put through `hashFullRuntime`, produces the state hash
e9751bfca373a613 on `6f671d5` and the same state hash on this branch — twice
per tree, so within a tree as well as across the two. No fingerprint moved.
(Written without backticks on purpose: it is a FNV-1a state hash, not a commit
sha, and `tests/foundation/documentation-commit-citation-contract.test.ts`
reads any backticked hex run as a commit it must be able to resolve.)

## Consequences

**Negative, and each is real:**

- **The one-second window above.** It is the whole cost and it is not nothing:
  a player who pauses fast after an order gets a ghost one step late.
- **Two of ADR 0020's four grounds for refusing nothing at the kernel are
  overtaken, and this must not be discovered by accident.** Its grounds 2
  (*"the cost is every refusal for the length of the pause"*) and 3 (*"it
  refuses the first order after a load"*) were costs of refusing an
  `executeAtTick` *below* the highest queued — and the shipped sender no longer
  submits one, so against this front door the guard ADR 0020 rejected is now
  **inert rather than expensive**. Ground 1 is untouched and is the one the
  decision rests on: `Kernel.restore` bypasses `submitCommand` and
  `kernelSnapshotSchema` never validates the tick relation, so the guard still
  cannot establish its invariant. **ADR 0020's decision is not re-opened here**
  — #437 puts a kernel-side refusal out of scope, and doing it anyway would be
  deciding architecture inside an implementation branch. It is recorded so that
  the next reader of that section knows two of its four numbers describe a
  front door that has changed.
- **A malformed save can defer this sender's orders a long way.** The floor
  follows the restored queue, and `kernelSnapshotSchema` validates `tick` and
  each `executeAtTick` as independent non-negative integers, never the relation
  between them. A bundle carrying a command far in the future would push every
  new order out to that tick. A save this application wrote cannot be that
  shape — its queue is at most one lead ahead of the tick it resumes at — so
  the alternative would be capping the seed at an invented distance, which
  restores the inversion silently for every save just past the cap. The
  relation belongs at the save boundary, which is where `Kernel.dispatchDue`'s
  header already puts its sibling case. Recorded as a known consequence, in
  `seedTickFloor`'s own docblock as well as here.
- **A `simulation/snapshot` now has a third job.** It carried the sequence
  baseline and the tick anchor; it now also carries the queue floor. All three
  are cached echoes of what the worker said, which is what this class is, but
  it is one more thing that goes stale together if the snapshot cadence
  changes.

**Positive:**

- The undo stack becomes something a player can reason about: `undo` then `redo`
  returns to where they were, in the case where it previously did not.
- The two numbers a command carries stop disagreeing at the source, which is
  what ADR 0020's closing section asked for and left open.
- The first gesture after loading a save no longer overtakes the orders the save
  brought with it — a case that was open in the issue and is closed here.
- Dispatch order now equals submission order for everything the shipped HUD
  emits, without a refusal, a clamp or a kernel change.

## Open questions for the owner

1. **Is one second of deferral the right price?** The alternative that keeps
   ADR 0051's immediacy intact is to make the *pause itself* rebase pending
   commands down to the current tick — everything the player has ordered
   happens at once when they pause, and nothing is ever behind anything. That
   is a bigger, more visible change: it alters when an order the player already
   gave takes effect, and it touches the kernel and the queue rather than one
   main-thread expression. It is not proposed here, and it is the one place
   where a reasonable person could take the other side.
2. **Should `Undo` be able to reach a command that has not dispatched yet?**
   This ADR keeps the model where undo reverses *applied* orders only, so a
   queued-but-not-yet-run order is invisible to it and the fix works by making
   the `Undo` wait. The other model — an undo stack that knows about pending
   commands and can cancel one before it runs — would make the pause instant
   again, and would be a much larger change to `ConstructionSystem` and to what
   a save carries. Named because #437 asked whether the undo model itself is
   wrong rather than mis-sequenced, and the answer taken here is
   *mis-sequenced*.
3. **Does ADR 0051's own text get the clause above?** This ADR states the
   narrowing; it does not edit ADR 0051.

   **The reason this bullet gave expired on 2026-08-30 and is marked rather
   than overwritten.** It read, of the ADR this bullet names: *"…because it is
   itself Proposed and unapproved and rewriting an unapproved decision from a
   second unapproved one would leave nothing for the owner to compare."* That
   was true when it was written. The owner accepted that ADR on 2026-08-30 in
   [#639](https://github.com/matmaxalez/lockstate/issues/639), so half the
   reason is gone and half survives: **this** ADR is still unapproved, and it
   is now a proposed document narrowing an accepted one. (The pronoun above
   replaces the number the sentence originally carried, so that quoting a
   sentence that expired does not re-assert a status the ADR no longer holds —
   `tests/foundation/adr-status-reference-contract.test.ts` reads English
   claims and cannot tell a quotation from an assertion, which is the right
   trade for a gate whose whole subject is sentences going stale.)

   **The question is still open, and what it turns on has changed.** An
   accepted decision narrowed by a proposed one is a decision the owner has
   not been shown the narrowed form of — so the clause belongs in ADR 0051's
   text if and when this ADR is accepted too, and not before.
