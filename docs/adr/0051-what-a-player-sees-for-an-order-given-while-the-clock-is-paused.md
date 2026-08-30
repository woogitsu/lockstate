# ADR 0051: What a player sees for an order given while the clock is paused

> **Drafted as `XXXX`; assigned 0051 on landing.** The author could not
> enumerate open pull requests from a worktree, and wrote here that the
> placeholder makes `tests/foundation/adr-numbering-contract.test.ts` fail —
> which it does, and which is the point that has since been settled the other
> way: there is no state in which an unnumbered draft is valid, because that
> test also requires a row in [`README.md`](./README.md) in the same commit and
> a **Next free number** line that no file on disk has taken. Adding the row
> *is* the reservation (`AGENTS.md`), so numbers are now handed out by the
> integrator **before** a draft exists rather than after it returns. See
> `docs/AGENT_WORKFLOW.md` §2.
>
> **The number is provisional** in the ordinary way: 0049 and 0050 were taken
> on unmerged branches while this was written, and a branch nobody has merged
> is invisible from the index. If 0051 collides, renumber this file, its row in
> [`README.md`](./README.md), and every citation of it
> (`grep -rn "0051" src/ tests/ docs/`).

## Status

**Accepted, 2026-08-30, by the repository owner.**

**This clause read `Proposed, 2026-08-28. Not self-approved.` until the owner
accepted it on 2026-08-30.** The paragraph that stood under it is kept below,
unedited, because everything it says is still true: the amendment it names is
still an amendment, and the rule it cites is still the rule. What had not
happened was the acceptance step, and it has now happened.

**How the acceptance arrived, recorded because a reader checking this status
later deserves to know its weight.** It arrived in
[#639](https://github.com/matmaxalez/lockstate/issues/639), *"OWNER RULINGS
2026-08-30: four calls on what the game tells the player"*, filed by the owner
in their own words after they hit a stopped clock live. Its first ruling reads:
*"**ADR 0051 is accepted.** It has been `Proposed, 2026-08-28. Not
self-approved.` while **its behaviour already ships** — a decision the code
already keeps, waiting on a signature."* It was one of four rulings in that
issue and was given against the issue's own summary of this ADR's subject and
its stated cost, not against the full text of this document. `AGENTS.md`'s rule
is *"never self-approve"*; the owner accepted, and this paragraph exists so
that nobody mistakes the **recording** of that acceptance — which is all the
commit carrying it does — for an approval given here.

**Acceptance closes none of the three open questions at the foot of this
document**, and they are left standing rather than tidied away. It does not
decide whether a purchase should spend money during a pause, and that is still
the sharpest one.

**Open question 3 — "does the game ever tell a new player that it starts
paused?" — is half answered by the same issue that accepted this ADR, and the
other half is measured and blocked.** #639's second ruling ships in this commit:
the clock readout says `PAUSED` instead of `×1` and the day, the day progress
and the speed are dimmed while the clock is stopped, so the sentence below —
*"The Pause button is accented and `data-clock-mode` says `paused`, which is
honest but quiet"* — is no longer true of the readout. Its first ruling does
not ship: restoring a renderer for `hud.build.note` was measured against the
assembled page and the Build panel has no room for the sentence at 900x600,
9px short even clipped to a single line. The numbers are in
`src/ui/hud/build-panel.ts` where the renderer would go, and the decision they
need belongs to #174 rather than here.

So the sentence below, *"it does not make the pause more discoverable, and that
is a separate piece of work"*, was right that the work was separate; the work
exists, it is #639, and it is partly done.

This amends the "Ordered Command Queue" heading of
[ADR 0020](./0020-deterministic-kernel.md), which is the deterministic
kernel's own contract, and it changes what the word *paused* means to a
player. `docs/AGENT_WORKFLOW.md` §3: *"Propose an ADR rather than deciding
architecture inside implementation code, and never self-approve one."*

## The question

A player creates a prison, goes to the Build tab and places a wall. The clock
has not been started — a new session arrives paused, and so does a restored
one. **What should they see?**

Today the answer is: nothing at all. This document is about whether that is
right, and if not, which of the three places it could be fixed is the right
one.

## What the code does today

Read on `317f487` (v0.0.124). Every line below was opened.

1. **A session starts paused, and that is deliberate, not an oversight.**
   `handleInitialize` constructs the clock paused and enters the `paused`
   state (`src/simulation/worker/state-machine.ts:786-787`), and reports that
   clock back on `simulation/ready` (`:802`). Nothing in `src/` starts the
   clock by itself: the only caller of `SimulationCommandSender.setClock` is
   the `set-clock` intent branch in `src/main.ts:1636`, which runs when the
   player presses a transport control.
2. **The interface says so.** `hudClockFromWorkerMessage` copies the worker's
   mode onto the view model (`src/ui/simulation-clock.ts:36-46`),
   `transportPressedStates` maps `paused` to a pressed Pause button
   (`src/ui/hud/projection.ts:101-105`), and the strip both presses it and
   stamps `data-clock-mode="paused"` on itself
   (`src/ui/hud/status-strip.ts:229-233`). The UI is not lying about the clock.
3. **No tick runs while paused, and nothing is published.** `transition`
   starts the 15 ms tick loop only for the `running` state and clears it for
   every other one (`src/simulation/worker/state-machine.ts:273-292`), and
   `onTickLoop` is the only caller of `publishClockState`,
   `publishStatusCounts` and `publishRenderDelta` (`:308-310`) — apart from
   one baseline `publishStatusCounts` immediately after `simulation/ready`
   (`:812`).
4. **A command submitted while paused is accepted and then sits.**
   `handleSubmitCommand` calls `Kernel.submitCommand`, which pushes the
   command onto a queue sorted by `(executeAtTick, sequence)` and answers
   `status: 'queued'` (`:839-880`). `Kernel.step()` is the only thing that
   dispatches it (`src/simulation/kernel/kernel.ts:157-227`), and `step()` is
   only reached from the tick loop.
5. **`executeAtTick` is the *current* tick while paused**, because
   `projectExecuteTick` returns the last reported tick with no lead when the
   clock is not running (`src/ui/simulation-commands.ts:127-131`), and
   `handleSetClock` answers with the kernel's exact tick so that number is not
   stale (`src/simulation/worker/state-machine.ts:815-838`). **Every command a
   player submits while paused is therefore already due**; the only thing
   between it and its effect is the absence of a `step()`.
6. **The renderer can already draw the result and never gets the chance.**
   `structuresFromConstruction` maps the `approved` state — which
   `ConstructionSystem.submitOrder` writes synchronously, inside the command
   handler (`src/simulation/construction/system.ts:337-338`) — to the
   `planned` phase, i.e. a ghost (`src/rendering/world/structures.ts:24-39`).
   Nothing reaches it while paused.
7. **Six panel readouts ride the counts cadence**, so they refresh only when a
   `simulation/status-counts` arrives (`src/main.ts:1437-1443`): room needs,
   the build queue, the intake pipeline, pending deliveries, held guards and
   staff coverage. While paused, no such message is ever published.

### What a player can do, and what each gesture produces while paused

`HudIntent` has eighteen members (`src/ui/hud/hud.ts:270-…`). Four are chrome
the HUD owns and never reach the simulation — `select-tab`, `toggle-panel`,
`arm-build-tool`, `arm-room-tool`. One is the clock itself (`set-clock`).
**Thirteen submit a command**: `place-build-order`, `place-object`,
`remove-object`, `zone-room`, `unzone-room`, `purchase-materials`,
`admit-prisoner`, `hire-staff`, `release-guard`, `cancel-build-order`,
`cancel-material-purchase`, `undo`, `redo`.

While the clock is paused, **all thirteen produce no confirmation of any
kind**: no world change, no panel row, no count, no sentence. Three of them
can produce a *refusal* — `purchase-materials`, `admit-prisoner` and
`hire-staff` carry main-thread pre-checks that throw before submitting
(the `case` branches at `src/main.ts:1961`, `:2041` and `:2143`) — but only on the paths those
checks cover, and a refusal is not a confirmation.

## Why the obvious fixes are the wrong ones

**"Publish the projection on command application as well as on tick"** is not
a fix on its own, and this is the load-bearing correction. Nothing is applied
while paused: the command sits in `Kernel._commands` untouched, so a
projection published at that moment reports exactly the state it reported
before. Republishing an unchanged projection changes nothing a player can see.
The problem is not that the answer is not published; it is that there is no
answer yet.

**"Publish a baseline on state entry"** is already done, at
`src/simulation/worker/state-machine.ts:812`, and has been since the channel
was written. It is why a restored prison shows its population rather than a
row of zeros.

**"Start the session running rather than paused"** trades one defect for a
worse one. A management sim that starts moving while the player is still
reading the screen is a worse game, and it would break the case a paused start
exists for: a restored save must not advance before the player has looked at
what they loaded. It would also not fix the actual complaint, which is about
every *later* pause as much as the first one — and pausing to give orders
carefully is, in ADR 0020's own words, *"the ordinary way this game is
played"*.

## Decision

**A command that is due is dispatched when it is submitted, even while the
clock is paused. Pausing stops time; it does not stop the player.**

1. `Kernel` gains `dispatchDueCommands(): number`, which is exactly step 1 of
   `step()` — drain the head of the `(executeAtTick, sequence)`-sorted queue
   while `executeAtTick <= tick`, dispatching each through the command
   handler — factored out and made callable on its own. `step()` calls it and
   is otherwise unchanged. It advances no tick and runs no system.
2. The worker calls it from `handleSubmitCommand`, **after** answering
   `status: 'queued'`, and only while the clock's control is `paused`. While
   the clock runs the tick loop already dispatches within one wake and there
   is nothing to add.
3. When that dispatch did something, the worker publishes
   `simulation/status-counts` immediately, with the same "a player-initiated
   event opens the gate" treatment `publishStatusCounts` already gives a
   refusal and a zoning notice. This is where the "publish on application"
   idea above is correct — as the second half of this decision, not as the
   whole of it.
4. `SimulationSnapshotFeed` applies a snapshot whose tick has not moved when
   the poll that fetched it was provoked by a command, rather than skipping
   it. The existing skip (`src/rendering/feed/simulation-snapshot-feed.ts`,
   *"Nothing in the world can change without the simulation advancing"*) is
   the sentence this decision makes false, and it is the last thing standing
   between an order given while paused and the ghost the renderer already
   knows how to draw.

### Why this is not a determinism change

The dispatch order is unchanged, and that is checkable rather than asserted.
`_commands` is sorted by `(executeAtTick, sequence)` and drained from the
head, and the drain is the same loop in both callers. A command dispatched by
this route at tick *N* is dispatched at tick *N*, before any system has run at
tick *N* — which is precisely where `step()` would have dispatched it. A
replay from a snapshot taken before the pause re-dispatches it at the same
tick in the same position; a replay from a snapshot taken during the pause
carries its effect and no longer carries the command. Every client restoring
the same bundle still dispatches in the same order.

What does change is ADR 0020's sentence *"At the start of a tick, all due
commands are dispatched … before any systems run"*: dispatch is no longer
tied to the start of a tick. The narrower sentence that survives, and that
determinism actually rests on, is **"every command is dispatched at the tick
its `executeAtTick` names, in `(executeAtTick, sequence)` order, before any
system runs at that tick."**

### What the player sees afterwards

The wall appears immediately as a ghost, the Build panel's queue block lists
it, a zoned room registers and its notice is painted, a refused admission is
refused *now* rather than a minute later when the clock is next started, and
`Undo` takes back the thing the player just did instead of nothing. The clock
still does not move: nobody walks, nothing is built, no money is earned, no
day passes. That is the genre convention — plan while paused, watch it happen
when you press play — and it is reached here without copying anything.

## Consequences

**Negative, and each is real:**

- **Money moves while the clock is stopped.** A purchase dispatched during a
  pause debits the treasury there and then. This is defensible — the order
  *was* placed — but it is a change a player can notice, and it is the part of
  this decision most likely to want a second look.
- **`ProcurementSystem`'s `insufficient-funds` refusal stops being reachable
  from the Build panel**, and this was found by a browser test going red rather
  than by reading. Two purchases could be in flight against one balance only
  because a paused clock dispatched neither, so `src/main.ts`'s pre-flight
  measured both against the same published figure and the treasury refused the
  second. Now the first is paid for at once and republishes the balance, so the
  second meets an accurate pre-flight and is refused *here*, on the control the
  player pressed, with nothing sent.

  **For the player this is better** — an immediate refusal that marks the
  button beats a delayed alert about money — and "exactly one message per press,
  never both and never neither" is unchanged; only which side speaks moves.
  What it costs is a test route: the worker's refusal of a *purchase* is now
  reachable from that panel only inside the twenty-tick lead an order given
  while the clock runs carries, a one-second window the browser suite
  measurably cannot win (pressing Buy and then Pause took longer than the lead,
  and the queued order had already been paid for). So
  `tests/browser/app-shell.spec.ts` asserts the new behaviour,
  `tests/unit/worker-state-machine.test.ts` asserts the worker's refusal
  against the shipped worker where it is deterministic, and the *join* from
  `RefusalLog` to the band and the alerts list stays covered in the browser by
  the refused build order, which takes the identical route with a different
  reason id.
- **Several comments in the tree become wrong in the *safe* direction and must
  be corrected in the same commit.** `src/main.ts`'s `admit-prisoner` branch
  justifies its main-thread pre-check partly on the worker's refusal not
  arriving until the clock runs; `src/simulation/runtime/session-commands.ts`'s
  `PurchaseMaterials` branch says *"The clock has to run before this line is
  reached at all"*. Both pre-checks stay — they are still the only thing that
  guarantees one message per press *before* a command is composed — but their
  reasoning changes.
- **The paused drain is a second call site for the command handler.** A system
  that assumed a handler only ever runs inside `step()` would be surprised. No
  handler in `src/simulation/**` reads anything but its command and the
  `SimulationContext` it is handed, which is the same context `step()` builds.

**Positive:**

- Thirteen gestures stop being silent.
- A rendering path that already exists (`phaseOf('approved') === 'planned'`)
  becomes reachable.
- The refusal channel starts working during a pause, which is when a player
  most needs it: `RefusalLog` entries recorded by a paused dispatch are
  published on the same message.

## Open questions for the owner

1. **Should a purchase spend money during a pause?** The alternative is to
   exclude `PurchaseMaterials` and `HireStaff` from the paused drain, which
   would make the rule "orders that change geometry apply while paused; orders
   that spend money wait for the clock" — a rule that is harder to explain,
   that reintroduces silence on two gestures, and that would put the treasury
   back in the state where the pre-flight can disagree with it. This is the
   question the `insufficient-funds` consequence above bears on, and it is the
   one place where reasonable people could take the other side.
2. **Should a *restored* session drain its inherited queue on load?** This
   decision does not: the drain runs only when the player submits something.
   A save's pending commands normally carry future ticks and are not due, so
   the case is close to theoretical, but the asymmetry is deliberate and
   should be either kept on purpose or removed on purpose.
3. **Does the game ever tell a new player that it starts paused?** The Pause
   button is accented and `data-clock-mode` says `paused`, which is honest but
   quiet. This ADR makes the *consequences* of a pause smaller; it does not
   make the pause more discoverable, and that is a separate piece of work.
