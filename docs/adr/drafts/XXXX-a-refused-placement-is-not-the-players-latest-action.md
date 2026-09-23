# ADR XXXX (draft, amends ADR 0104): a placement the simulation refuses is not the player's latest action

- Status: **Draft. Not self-approved.** The number is a placeholder and will
  be replaced when numbers are assigned centrally (`docs/adr/README.md`). This
  draft commits in advance to being renumbered.
- Date: 2026-09-23
- Amends: [ADR 0104](../0104-what-undo-takes-back.md), option 2 (accepted by
  the owner 2026-09-09)
- Raised by: [#1370](https://github.com/woogitsu/lockstate/issues/1370),
  coordinator review of its first implementation

## The question

A wall order the simulation refuses when it is placed is marked `failed` and
is still written to the undo history as a transaction. What should `Undo` do
when that dead transaction is on top of the stack and a live one is beneath
it?

ADR 0104 does not address dead transactions. Its option 2 is worded as
*"`undo()` refuses when the newest construction transaction is older than the
newest accepted player command of any kind."* A placement the simulation
refuses on its content is a command the kernel accepted. So a press that
reached the live transaction beneath would, **by the letter of option 2, be
refused**, because the refused placement is newer than it. The coordinator's
proposal is that one press should skip the dead transaction and reverse the
live one. That answers the question the other way, so it is a change to what
ADR 0104 records rather than an implementation detail.

## What the code does today (VERIFIED on the #1370 branch)

- `createConstructionCommandHandler`'s `PlaceBuildOrder` branch calls
  `constructionSystem.registerTransactionOrder(order.id, ...)` **after** the
  `order.state === 'failed'` branch (`src/simulation/construction/handler.ts`,
  the `registerTransactionOrder(order.id, simCommand.transactionId)` line).
  A refused wall is therefore registered: it opens a transaction, pushes the
  previous one onto the stack, **clears the redo stack**, and resets
  `newerActionThanTheStackTop` to `false`.
- `ObjectPlacementService` does the opposite. Every refusal returns through
  `this.refuse(...)` **before** `this.orders.registerTransactionOrder`
  (`src/simulation/objects/object-placement-service.ts`, the `unowned-land`,
  `tile-occupied` and `outside-room` returns). A refused object never enters
  the history, and `PlaceObject` is in `LEAVES_THE_UNDO_HISTORY_CURRENT`, so
  it does not set the flag either.
- `submitOrder` refuses at placement for `unknown-buildable`,
  `duplicate-order` and every `admits` refusal (out of bounds, unowned land
  and the rest). `duplicate-order` is reachable from an ordinary drag that
  crosses a queued wall.
- The only way an order becomes `failed` *after* placement without a player
  command is `update()`'s `unknown-buildable` branch, which fires when content
  is withdrawn. Every other way an order goes terminal is a player command
  (queue cancel, removal), and those set the newer-action flag, so the press
  is refused visibly anyway.

The code and ADR 0104's text **already disagree**:
- **Walls today:** a live wall, then a refused wall, then **two** presses
  reverses the live wall with no refusal. The first press pops the dead
  transaction silently, and nothing sets the flag.
- **The same hole reaches past a hire. MEASURED 2026-09-23** through the real
  kernel and router: live wall at 12,12, then `HireStaff`, then a wall at
  900,900.
  - Result: `{"dead":"failed","p1":[],"p2":["construction.undone"],"live":"cancelled"}`.
  - The first press records nothing. The second reverses a wall that was
    placed **before the hire**, which is the loss ADR 0104 §3 measured.
  - The refused placement had reset `newerActionThanTheStackTop`.
- **Objects today:** a live object, then a refused object, then **one** press
  reverses the live object. This is read from the code, not played.

## The cost #1370 exposed

The strip's Undo is marked unavailable exactly when the next press would
record nothing (`editHistoryAvailability`). With a dead transaction on top,
the mark is true about the next press, and false about what the player can
still take back. A player who sees "nothing to undo" stops pressing.

## Options

### A: a placement refused at submit leaves the history untouched (recommended)

`PlaceBuildOrder` registers the order only when `submitOrder` did not refuse
it. A refused wall then writes nothing:
- no transaction;
- no redo clear;
- no change to the newer-action flag.

This is exactly what `PlaceObject` already does.

- **Outcomes.**
  - live wall, then refused wall, then one press: reverses the live wall.
  - live wall, hire, then refused wall, then press: **refused**, because the
    hire is still the newest action.
- **Reading of option 2.** "The newest accepted player command" is read as
  "the newest player command that changed something". A refused placement
  changed nothing and is already shown to the player as a refusal of its own.
- **Makes walls and objects agree.**
- **Undo-availability getters unchanged.** A dead transaction can then arise
  only from `update()`'s content-withdrawal branch.
- **Drags.** A dragged run whose segments are partly refused keeps its live
  segments in one transaction, as now, minus the refused ones.
- **Save.** No change. The stacks keep their shape, and refused orders stay
  in `orders`, where the renderer and the save already read them.
- **Cost.** A small change in `handler.ts`, and a test that goes red on the
  current code: a refused wall over a live one, one press, the live one is
  reversed. Plus a second test: hire, refused wall, press is refused. Redo
  after a refused placement survives, which is a visible change; today a
  refused wall silently empties the redo stack.

### B: `undo()` skips dead transactions and reverses the newest live one (the coordinator's proposal)

- **Fixes the #1370 case in one press.**
- **Opens a hole that option 2 exists to close.** Take a live wall, then a
  hire, then a refused wall. The refused wall resets the flag. A skipping
  press then reverses the live wall, which was placed **before the hire**:
  the §3 loss ADR 0104 measured, in one press. Today it takes two presses,
  and that is already a hole (see above). Closing it under B would need a
  per-transaction "superseded by a newer action" mark, which is new state.
  To survive a reload it would enter `ConstructionSnapshot`, which is a save
  field and a migration. ADR 0104's field comment rejects a tick per
  transaction for exactly that cost.
- **Redo.** It should receive nothing for the discarded transactions, since
  redoing a refused wall would re-place it on the tile that refused it.
  `undo()` already pushes nothing for a dead transaction.

### C: leave it (the #1370 branch as it stands)

The mark stays true about the next press. The dead-top case remains, and two
presses reach the live wall with no refusal.

## Recommendation

**A.** It is the smaller change, it matches the object path that already
exists, and it keeps the history free of dead-at-placement transactions
rather than teaching `undo()` to step over them. It also narrows the existing
two-press hole instead of widening it to one press.

`update()`'s content-withdrawal branch is the one remaining source of a dead
top. It needs no player action and is left as it is: the mark is true about
the next press there, and the case needs content removed mid-session.

## What would change my mind

- If the owner reads option 2's "accepted command" literally, so that a
  refused placement **should** make the next Undo refuse, then A is wrong.
  The right change would be the opposite: a refused placement calls
  `noteActionThatDoesNotWriteTheUndoStack` instead of registering. The
  object path would then have to change too.
- If a second path turns out to make a transaction dead without a player
  command, B's skip becomes worth its state cost.

## Open question for the owner

Is a placement the simulation refused a thing the player *did*, for the
purpose of "take back what I just did"? A says no, and the object path
already says no.
