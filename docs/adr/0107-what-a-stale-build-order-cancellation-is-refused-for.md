# ADR 0107: What a stale build-order cancellation is refused for

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0107, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083, 0096, 0097, 0098, 0099, 0100,
> 0101, 0102, 0103, 0104, 0105 and 0106 each pre-committed.
>
> **The sweep, performed rather than trusted.** From this worktree at
> `f70efe73` (v0.0.572): `git fetch origin '+refs/heads/*:refs/remotes/origin/*'
> --prune` (290 heads), then `git ls-tree --name-only <head> -- docs/adr/` read
> out of every one of them. The highest four-digit prefix found on any of the
> 290 was **0106**, matching disk, and `docs/adr/README.md`'s own line already
> reads **"Next free number: 0107."** So 0107 is what this document takes. A
> second agent is drafting a sibling ADR concurrently in its own worktree per
> `docs/AGENT_WORKFLOW.md` §2, which is exactly the situation that rule expects
> and why this preamble exists — the number is re-checked again immediately
> before this branch is pushed, not only here.

## Status

**Proposed. Not self-approved.** `docs/AGENT_WORKFLOW.md` §3: *"**Propose an
ADR rather than deciding architecture inside implementation code, and never
self-approve one** outside a recorded delegation from the owner."*

**The DIRECTION this document designs against was ruled by the owner on
2026-09-10, and is disclosed here in the same shape [ADR 0096](./0096-what-a-way-back-is-and-what-guarantees-one.md)'s
Status block discloses its own.** Put to them on issue #853 as three clickable
options against a measurement that had just refuted the issue's own opening
hypothesis (the refund money *does* come back correctly and in full — see
Context §2), they chose the one labelled:

> **Odmawiaj nieaktualnego anulowania**

("Refuse a stale cancellation.") So the row keeps advertising what cancelling
would give back, and the two other candidates — stop advertising a figure the
press cannot guarantee, or do nothing and write down that the figure is
aspirational — are declined.

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP**, exactly as ADR 0096, ADR 0104, ADR 0105 and ADR 0106 each disclose of
> their own rulings. The ruling is the label of a clickable option a session
> wrote and the owner chose, given against a summary of the mechanism and the
> two remedies (issue #853, comment
> [5625644897](https://github.com/woogitsu/lockstate/issues/853#issuecomment-5625644897)),
> not a sentence they typed and not against this document's text, which did
> not exist yet.
>
> **What the ruling settles, and what it leaves to this document.** It settles
> that a stale cancellation is refused rather than silently repriced or
> silently allowed to keep advertising a number it cannot pay. It does **not**
> settle what token the command carries, what the refusal says, how often it
> would fire, or whether the token may touch the save format — those are this
> document's own proposal, unaccepted, and the acceptance line below is left
> for the owner because `docs/AGENT_WORKFLOW.md` §3 forbids an implementing
> agent from giving it to itself.
>
> **What this document does not authorise.** No player-visible sentence is
> authored, edited or added to `src/content/default-locale-en.ts` by this
> document. `AGENTS.md`'s 2026-09-04 release of reservation 4 gives the
> *wording* to whoever implements this, not the promise, and the wording
> below is a candidate for that implementer to verify true against the code
> that ships with it, not a string this document ships.
>
> **What this document does not ask the owner to release.** `AGENTS.md`
> reservation 2 (`supabase/migrations/` and the save format) is untouched:
> Decision §6 below argues explicitly that nothing this design needs has to
> survive a save, and does not propose a `SAVE_SCHEMA_VERSION` bump. If that
> argument is wrong, the design in §5 needs to move to a different token and
> this document would need re-arguing rather than merely re-priced — see
> "Weakest claim."

Filed against [issue #853](https://github.com/woogitsu/lockstate/issues/853),
whose own later comments already did most of the mechanism-finding this
document would otherwise owe — read in full, together with the standalone
measurement in issue #859, before this document's Context section was
written. Nothing here re-derives what those already established; §§1–4 below
cross-check each claim against the current tree (line numbers have moved
since both were filed) rather than re-investigating from scratch.

## Claim tiers used below

- **VERIFIED** — read out of the code on disk in this worktree at `f70efe73`
  (v0.0.572), with every citation opened at both ends of any window.
- **MEASURED** — a number produced by running something, attributed to the
  run that produced it (issue #859's browser instrumentation, in every case
  below).
- **ASSERTED** — argued from the above rather than independently re-measured
  by this document, marked every time.

**THE LEGEND ABOVE IS ALSO THIS DOCUMENT'S ANCHOR PIN, AND ITS PLACEMENT IS
WHY TWO SWEEPS LOOKING FOR ONE CLASSIFIED THIS FILE AS UNPINNED.** Every
`VERIFIED` below is declared read at `f70efe73` (v0.0.572), which dates every
anchor under it exactly as [ADR 0038](./0038-what-makes-a-save-compatible.md)'s
header sentence dates its own — but it says so in a claim-tier legend rather
than in a header, so the pin is invisible to a reader skimming for one.
[#1231](https://github.com/woogitsu/lockstate/pull/1231) settles what such a
pin is worth in this corpus: **advisory**. It does not freeze the code and it
has not been honoured here.

**RE-READ 2026-09-16 AGAINST `e044a3e8`, AND THE HEADLINE IS THAT THIS
DOCUMENT'S OWN DECISION HAS SHIPPED.** `expectedRevision` is on
`cancelBuildOrderSchema` (`src/simulation/protocol/commands.ts:77`);
`ConstructionSystem.revisionOf` and the private `setState` Decision §3 asks for
both exist (`src/simulation/construction/system.ts:1440`, `:1458`); the handler
refuses on a mismatch (`src/simulation/construction/handler.ts:168-171`); the
row carries the counter
(`src/simulation/presentation/construction-projection.ts:381`); the per-command
lead exists as `CANCEL_BUILD_ORDER_LEAD_TICKS`
(`src/ui/simulation-commands.ts:183`); and Decision §7's candidate sentence
shipped **verbatim** at `src/content/default-locale-en.ts:886`, with a Polish
translation at `src/content/locale-pl.ts:694`.

**Three things follow, and the third is the one a reader should hold onto.**
(1) The `Status` line is **not** moved by this re-read — that is the owner's,
per `docs/AGENT_WORKFLOW.md` §3 — and nothing below is rewritten to agree with
the tree. (2) Anchors that still name live code are re-aimed to where they now
land, each opened rather than offset. (3) **Context §4 and Decision §3 are
diagnoses of the tree this document's decision replaced**, so they are dated
in place rather than re-aimed, for the reason
[ADR 0040](./0040-the-shape-of-the-render-delta-channel.md)'s own stale section
is: re-aiming a dead diagnosis is the change that looks more impressive and
reads less honestly.

## Context

### 1. What #853 measured, re-checked rather than trusted

A queue row's `Cancel` button advertises what `cancelOrder` would credit the
treasury right now — the owner's ruling of 2026-09-02 (issue #843) — read by
`ConstructionSystem.previewCancelRefundMinorUnits` (`src/simulation/construction/system.ts:1151-1255`,
VERIFIED). #853's three browser runs measured a row reading `assigned`,
`80 back` for roughly 1,050–1,200 ms before dropping to `0` on its own, and a
press that landed **while the row still read `assigned` and `80 back`** moved
FUNDS by **0**, held for eight seconds with the clock running. The row
disappeared, so the cancellation itself took effect — nothing was refunded,
and nothing was left half-done either.

### 2. The material-versus-money question is answered, and it is not this
document's to re-open

#853 named this the one thing it had not established and would not guess at:
whether the 80 came back as material rather than money. Issue #853's own later
comment ([5618356571](https://github.com/woogitsu/lockstate/issues/853#issuecomment-5618356571))
settled it with a Node-level probe driving the real production classes end to
end — `createNewSimulationRuntime`, the real kernel, `packCommand`, the real
command router, no fixture standing in for any of them — including in the
exact circumstance #853 flagged as its reason for doubt, a same-item delivery
still in transit:

```
order A state after cancel: cancelled
treasury before cancel: 24840
treasury after cancel: 24920
treasury delta: 80          <- exactly 40 x 2, the catalogue price
stock delta: 0
```

Proved able to fail rather than assumed: mutating `destroysSpendOnCancel`
(`system.ts:84-86`, VERIFIED) to also treat `'assigned'` as destroy-on-cancel
gives `treasury delta: 0` (RED); reverting restores `delta: 80` (GREEN). **So
the answer is money, correctly and completely, in every state that pays at
all** — and the issue's own binary ("material or money?") had no slot for the
actual third outcome the `destroysSpendOnCancel` arm produces: for
`'in-progress'` and `'completed'`, the allocation is **neither released nor
paid for**. It is destroyed by ruling 20 (2026-08-31) and the owner's ruling
of 2026-09-01, and `previewCancelRefundMinorUnits` reads `0` for both
(`system.ts:1221`, VERIFIED: `if (stateAtCancellation === 'in-progress' ||
stateAtCancellation === 'completed') return 0;`).

This document does not re-measure this. It is settled, and nothing in the
design below touches `refundAllocatedMaterials`, `previewAllocatedRefundMinorUnits`
or `destroysSpendOnCancel`'s own two-state rule.

### 3. The mechanism is deterministic, not a race, and it is the load-bearing fact for this document

Issue #859 (closed, a measurement PR against #853) traced *why* a press
landing on a row that still read `assigned`/`80 back` paid 0. A browser press
goes through `SimulationCommandSender.projectExecuteTick`, whose
`projectFromClock` branch (`src/ui/simulation-commands.ts:319`, name VERIFIED
by `grep`) returns `lastTick + ceil(elapsed × speed / TICK_MILLISECONDS) +
leadTicks` while the clock runs. `leadTicks` defaults to `DEFAULT_LEAD_TICKS`,
documented in the same file as *"one second of real-time tolerance, expressed
in the kernel's own step"* (`:87`, VERIFIED) — **20** ticks at the kernel's
20 Hz. `ConstructionSystem`'s own schedule is `intervalTicks: 10, phaseTicks:
0` (`system.ts:347`, VERIFIED), so an `'assigned'` order becomes
`'in-progress'` at most ten ticks after the tick a row was priced at.

**So the row is priced at tick T, a running-clock command executes at
T+36..55 (MEASURED, #859), and the order can have flipped to `'in-progress'`
as early as T+10.** Ruling 20 pays `0` for `'in-progress'`. This is not a
window a player occasionally loses — it is a deterministic gap of roughly two
seconds of simulation time at 1×, and #859 measured what that gap actually
does to a run of presses (Context §7 below).

**Paused, the gap does not exist.** `projectFromClock` returns the bare
reported tick when the clock is stopped — lead `0` — and every state then
pays exactly what its row advertised (#859, "clock paused, lead 0" table).
This document's design has to say what it does in both regimes, and it does
(Decision §7).

### 4. The structural gap in the command itself, re-verified

> **THIS SECTION IS A DIAGNOSIS OF A TREE THIS DOCUMENT'S OWN DECISION HAS
> SINCE REPLACED, AND IS DATED RATHER THAN RE-AIMED (2026-09-16,
> `e044a3e8`).** The schema quoted below, and the three claims built on it —
> *"One field, `.strict()`"*, *"The command has no way to say 'cancel this
> order as it was when you showed it to me'"*, and *"it does not compare that
> state to anything the player saw, because there is nothing on the wire to
> compare it to"* — were all true at `f70efe73` and are all false now.
> `cancelBuildOrderSchema` is `src/simulation/protocol/commands.ts:63-78` and
> carries `expectedRevision` at `:77`; the handler reads the order's revision
> and refuses on a mismatch at
> `src/simulation/construction/handler.ts:168-171`, **before** `cancelOrder`,
> exactly as Decision §4 below asks. **The gap is closed, and the block below
> is kept because it is what the gap looked like** — re-aiming its anchors
> onto the schema that now has the field would make a sentence about an
> absence point at the thing that fills it.

`cancelBuildOrderSchema` is, in full, at `src/simulation/protocol/commands.ts:62-65`
(VERIFIED):

```ts
export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
}).strict();
```

One field, `.strict()`. The command has no way to say "cancel this order as it
was when you showed it to me," and `ConstructionSystem.cancelOrder`
(`:1004-1053`, VERIFIED) has no way to notice it is being asked to: it reads
`order.state` fresh at execution time, `isCancellable` says yes for
`'in-progress'` (`:55-57`), and it proceeds — correctly, by ruling 20's own
rule for that state. **Nothing here is a bug in `cancelOrder`.** The bug, if
it is one, is that the row and the press can disagree about which order this
is a cancellation *of*, and the protocol gives the worker no way to tell.

`src/simulation/construction/handler.ts:126-192`'s `CancelBuildOrder` branch
(VERIFIED) reads the order's state **before** calling `cancelOrder`, purely so
it can pick the right cancellation-event sentence afterward
(`recordBuildOrderCancelled(stateAtCancellation, ...)`, `:183`) — it does not
compare that state to anything the player saw, because there is nothing on
the wire to compare it to. And it swallows `cancelOrder`'s throw for an
unknown or already-terminal id silently, by design: *"cancellation is
intentionally idempotent at the command boundary"* (`:176`). That existing
idempotency is unrelated to this document and is not touched by it — see
Decision §4.

### 5. What changed since #853 was filed: ADR 0106 and `RemoveWall`

[ADR 0106](./0106-how-a-finished-wall-comes-down-without-a-keyboard.md),
accepted 2026-09-10, added a sibling command, `RemoveWall`
(`src/simulation/protocol/commands.ts:564-569`, VERIFIED), and named
`destroysSpendOnCancel(state)` as the predicate `cancelOrder` and `undo()`
both consult for what a cancellation destroys rather than pays for
(`system.ts:84-86`). Both are already implemented on this tree, not merely
proposed — `RemoveWallRefusalReason`, its mapping in
`src/simulation/refusals/refusal-log.ts:325-327`, its wire id
`'remove-wall.nothing-to-remove'` in `src/simulation/protocol/types.ts:1382`,
and its session-command branch in `src/simulation/runtime/session-commands.ts:910`
are all present and VERIFIED.

**`RemoveWall` has no analogue of this document's hazard, and that is worth
stating precisely rather than assuming.** `ConstructionSystem.completedOrderClaimingEdge`
(`system.ts:1496-1506`, VERIFIED) is called at the tick the command executes,
resolving the edge fresh against whatever the world holds *then* — there is
no client-held expectation on the wire for it to have gone stale against,
because `removeWallSchema` (`commands.ts:564-569`) carries a tile and an edge,
not an order id read off a row painted on an earlier tick. A `RemoveWall`
press cannot be "stale" in #853's sense because it never carries a prediction
to begin with. So this document's design is additive to `CancelBuildOrder`
alone; it does not touch `RemoveWall`, `completedOrderClaimingEdge`, or
anything ADR 0106 added, and composes with that document without needing to
reopen it.

### 6. `hud.build.remove-hint`, read in full

`src/content/default-locale-en.ts:2137` (VERIFIED):

> "Press any tile of an object, or a finished wall, to take it away. One
> still being built is cancelled and refunds its money — but nothing comes
> back once the crew has started it. A finished one is not refunded."

This is the `Remove` gesture's own hint, not the queue row's `Cancel` button's
— but its middle clause ("One still being built is cancelled and refunds its
money") is the same promise ruling 20 makes for `Cancel`, and is the sentence
this document's design has to leave true. It does: the clause promises what
happens **when** a cancellation succeeds, and says nothing about a press
succeeding unconditionally. A refused stale cancellation does not cancel the
order — its state is untouched by Decision §4's design — so the clause is
never asserted of a press that this document's refusal catches; the sentence
is exactly as true after this document as before it, for the same reason a
second press against an order the first press already cancelled does not
falsify it today. **Nothing in `remove-hint` needs to change, and this
document changes nothing that would require it to.**

### 7. How often the refusal would fire — MEASURED, not guessed

Issue #859 ran 14 instrumented presses against a live browser session at 1×
running speed. Ten were aimed at an order that was `'assigned'` when its row
was read:

> "Ten aimed at an order that was `assigned` when its row was read →
> **3 paid 80, 7 paid 0**."

Under today's code, those seven silently paid nothing — exactly #853's
report, reproduced at scale. **Under this document's design, every one of
those seven becomes an explicit refusal instead of a silent zero.** Nothing
in this design changes *how often* the underlying race happens — it does not
touch `DEFAULT_LEAD_TICKS`, `ConstructionSystem.schedule.intervalTicks`, or
`projectFromClock` — it only changes what the seventh-out-of-ten outcome
*is*: a sentence the player reads, rather than a treasury that quietly did
not move.

**So the number is not small.** At 1× with today's lead-tick settings, a
refusal is closer to the modal outcome than the exception for a Cancel press
aimed at a freshly-`assigned` row — roughly **70%** by this sample (n=10, one
session, one machine; see "Weakest claim"). This is the single fact that
should govern how the refusal is designed: a control that says no seven times
out of ten needs a sentence that is informative on every one of those seven,
and a row that corrects itself immediately afterward, or it is a worse
control than the one that silently did nothing. Decision §7 argues both.

### 8. The nearest existing precedent, and why it does not transfer whole

`CancelMaterialPurchase` (`commands.ts:206-209`, VERIFIED) has faced a
version of this question already. Its refusal,
`PurchaseCancelRefusalReason = 'not-pending'` (`src/simulation/economy/procurement.ts:117`),
fires when `ProcurementSystem.cancel`'s id lookup fails
(`procurement.ts:420-421`: `findIndex` returns `-1` because the delivery
already landed or was never pending), mapped to the wire id
`'cancel-purchase.not-pending'` (`refusal-log.ts:403`) and surfaced as *"Nothing
was refunded — that delivery is not on its way any more"*
(`src/content/default-locale-en.ts:902`, VERIFIED).

**That check is a pure identity check — does this id still name a pending
record — and it is sufficient there because a delivery's lifecycle has no
state that both keeps the id alive and stops it from paying.** A delivery is
pending or it is gone; there is no third thing it can become while the id
still resolves. `CancelBuildOrder`'s hazard is different in exactly the way
that matters: the id keeps resolving, `isCancellable` keeps saying yes, and
the *value underneath it moves* — `'assigned'` (pays) to `'in-progress'`
(destroys) is a transition within the set of states an existing id still
names. An identity check cannot see that transition happen; it would have
reported this record as perfectly fine every time, which is exactly the
defect #853 measured. So `not-pending`'s shape is precedent for *how a
cancellation refusal is wired end to end* (a named reason, a namespaced wire
id, a locale sentence beginning "Nothing was refunded —"), and not precedent
for *what the check compares*.

### 9. A second, unrelated existing key with the same command name

`hud.refusal.cancel-build-order` (`src/content/default-locale-en.ts:3086`,
VERIFIED) already exists: *"The order is still queued — the request was
refused."* This is a **main-thread-only** refusal — `hud.ts:564-565`'s own
comment says so in terms, *"the refusal this can paint is about *this thread*
(no worker, no session)"* — fired when the HUD has no session to dispatch the
intent to at all, before any command reaches the wire. It is unrelated to
this document: this document's refusal is a **simulation-level** one, decided
inside the worker after the command has already been sent and read, exactly
the shape `cancel-purchase.not-pending` already is. The new wire id this
document proposes is namespaced `cancel-build-order.*` under
`hud.alert.refusal.*` (the simulation-refusal channel), which cannot collide
with `hud.refusal.cancel-build-order` (a different channel, a different key
family) but is named here explicitly so nobody reading both mistakes one for
the other later.

## Decision

### 1. What the command carries, and why not the two obvious alternatives

**Recommend: a per-order monotonic revision counter**, `expectedRevision:
number`, added to `CancelBuildOrder`. Two other shapes were argued against
first, because the choice is worth having a reason for rather than a
preference.

**Not the state the row displayed (`'assigned'`).** This was the first
candidate and it fails on a concrete, VERIFIED path: `ConstructionSystem.redo()`
(`system.ts:848-875`) restores a `'cancelled'` order to `'approved'` —
*"We restore it to approved"* (`:858-860`) — from which it can progress
forward through `'materials-pending'` and back into `'assigned'` again for the
**same order id**. So `'assigned'` is not a state an order visits once; a
press carrying `expectedState: 'assigned'` could match an order that has
cycled cancelled → approved → materials-pending → assigned since the row was
read, on an allocation that is not the one the row priced. **This is the same
shape of mistake [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md)'s
FINAL-005 finding is about** — a value assumed monotone that a measured path
shows is not — except the direction of the resulting error is the opposite of
ADR 0105's: there, a non-monotone `currentRevision` would have caused a
**false refusal** (rejecting a write that was not actually stale); here, a
recurring state value would risk a **false acceptance** (treating a
genuinely stale press as fresh). Both are the same root cause — comparing a
value that can repeat rather than one that cannot — and ADR 0105's own
answer transposes directly: stop comparing the value that can repeat, compare
a counter that cannot.

**Not the refund figure itself (`80`).** Tempting because it is literally
what the player read, but it is a strictly weaker key than the state: two
different states can preview the same minor-units figure by coincidence (an
`'approved'` order and a `'materials-pending'` order with the same allocation
both preview identically per `previewCancelRefundMinorUnits`'s own two
branches, `system.ts:1221-1230`), so a figure match proves less than a state
match already fails to prove, and it would additionally require the
`previewCancelRefundMinorUnits` pricing rule to be re-derivable — or
duplicated — on whichever side checks it.

**Not a session-wide epoch, [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md)
option 3's shape.** That token answers *"is this write coming from a session
that has since been superseded"* — it is minted once per `beginSession` and
is constant for the whole of one live session. #853's race happens **inside**
a single continuously-running session, between two ticks a couple of seconds
apart; an epoch would not move in that window and could never detect it. The
two questions are genuinely different — "who is writing" versus "what they
saw" — and ADR 0105 says so of its own two tokens; this document's problem is
entirely the second kind.

**A per-order revision is exact where all three above are not.** It changes
if and only if `order.state` is mutated, which is if and only if the order
underwent a transition the row's reader did not see — never on account of a
value recurring, never approximately, and with no threshold to tune (contrast
a tick-based "how much drift is too much" design, which reintroduces exactly
the `DEFAULT_LEAD_TICKS`-versus-`intervalTicks` magic-number mismatch that
produced this defect in the first place, and which would either refuse
presses that raced nothing or accept ones that raced past a real transition,
depending which way the threshold is set).

### 2. Where the counter lives, and why not on `BuildOrder`

**Recommend: private bookkeeping inside `ConstructionSystem`, never added to
`BuildOrder` and never serialized.** A `Map<string, number>` keyed by order
id, read through a new method mirroring `previewCancelRefundMinorUnits`'s own
contract — never throws, `0` for an id that names nothing:

```ts
public revisionOf(orderId: string): number {
  return this.orderRevisions.get(orderId) ?? 0;
}
```

The counter's usefulness is bounded to the lifetime of one live worker
session between the tick a row is painted and the tick a press executes on
it — at most a couple of seconds even in the worst measured case (§7). It
never needs to mean anything across a save and a restore, because the
client's own copy of it cannot survive that boundary either: a restore
rebuilds the Build panel's rows from the restored simulation from scratch, so
there is no pre-restore "expected revision" left anywhere on the main thread
for a post-restore press to compare against. Keeping the counter outside
`ConstructionSnapshot` (never added to `BuildOrder`, never touched by
`snapshot()` or `restore()`) makes this true by construction rather than by
argument: there is nothing to default, migrate, or version, because there is
nothing in the persisted shape to look at. **This is the reasoning Reservation
2 asks for, stated rather than assumed** — see "What this document does not
ask the owner to release," above, and "Weakest claim," below, for what would
overturn it.

### 3. Keeping the invariant in one place

Eleven sites write `order.state` today (VERIFIED, exhaustive `grep -n
"order\.state ="` against this tree): four in `submitOrder`
(`:503,510,520,528`), one in `redo()` (`:816`), one in `cancelOrder` (`:970`),
and five in the scheduled tick loop (`:1598` unknown-buildable-on-restore,
`:1614` approved→materials-pending, `:1634` materials-pending→assigned,
`:1655` assigned→in-progress, `:1671` in-progress→completed). A revision
counter that any twelfth site could forget to bump would be worse than no
counter — a silently-stale key is indistinguishable from a correct one until
somebody measures it. `destroysSpendOnCancel`'s own docblock argues the
identical point about its two states: *"A third state joining this set has to
be told to one place, not remembered in two"* (`system.ts:74-75`). The
implementer therefore owes a single private mutator —

```ts
private setState(order: BuildOrder, next: BuildOrder['state']): void {
  order.state = next;
  this.orderRevisions.set(order.id, this.revisionOf(order.id) + 1);
}
```

— and every one of the eleven sites above rewritten to call it instead of
assigning `order.state` directly, so a twelfth site that assigns the field
directly is a `grep` away from being caught in review rather than a defect a
future #853 has to re-discover.

> **THE CENSUS ABOVE IS DEAD, IN THE DIRECTION IT ASKED FOR, AND IS DATED
> RATHER THAN RE-AIMED (2026-09-16, `e044a3e8`).** *"Eleven sites write
> `order.state` today (VERIFIED, exhaustive `grep -n "order\.state ="` against
> this tree)"* was true at `f70efe73`. That grep now returns **one**
> assignment, `src/simulation/construction/system.ts:1459`, and it is the body
> of the private `setState` this section prescribes; the eleven call sites that
> replace those eleven writes are `this.setState(` — eleven of them, counted by
> `grep -c`. So every one of the ten line numbers this paragraph gives
> (`:503,510,520,528`, `:816`, `:970`, `:1598`, `:1614`, `:1634`, `:1655`,
> `:1671`) now lands on code that no longer assigns the field, and they are
> left pointing at the tree the census was taken against rather than moved onto
> the mutator calls, which would turn a count of a hazard into a count of its
> fix. **The `grep` this section offers as the review check is still the right
> one and now returns the single line it was designed to leave standing.**

### 4. What the handler does with the new field

```ts
export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
```

In `createConstructionCommandHandler`'s `CancelBuildOrder` branch
(`handler.ts:124-155`):

1. **Order not found, or found but not `isCancellable`** — unchanged. This is
   pre-existing, intentional idempotency (`:148-150`'s own comment), is not
   the defect #853 reports (the queue never shows a row for a terminal
   order, so a press against one is not "the row and the world disagreeing" —
   it is a second press against a control that has already fired, or an id
   that never existed), and this document does not propose changing it.
2. **Order found, cancellable, and `order.revision !== expectedRevision`** —
   **new**: refuse. Do not call `cancelOrder`. The order is untouched — its
   state, its allocation, its revision are exactly what they were the instant
   before the press, so the *next* publication of the queue reads the
   order's true current state and true current
   `previewCancelRefundMinorUnits` figure, honestly, whatever they now are.
3. **Order found, cancellable, and `order.revision === expectedRevision`** —
   unchanged: `cancelOrder` runs exactly as it does today.

### 5. The refusal reason, wired the way `RemoveWall`'s was

```ts
export type CancelBuildOrderRefusalReason = 'stale-cancellation';
```

co-located with `RemoveWallRefusalReason` (`system.ts:316`) for the same
reason that type is: a table with one entry is what makes a *second* reason a
compile error at `refusal-log.ts`'s mapping rather than a silent `undefined`
on the wire. Mapped as:

```ts
export const CANCEL_BUILD_ORDER_REFUSAL_REASONS: Readonly<Record<CancelBuildOrderRefusalReason, RefusalReason>> = {
  'stale-cancellation': 'cancel-build-order.stale-cancellation',
};
```

added to `REFUSAL_REASONS` in `src/simulation/protocol/types.ts` beside
`'cancel-purchase.not-pending'` and `'remove-wall.nothing-to-remove'`
(`:1359`, `:1382`), namespaced apart from both and apart from the existing
**unrelated** `hud.refusal.cancel-build-order` key (Context §9) for the same
reason every other collision in `REFUSAL_REASONS` is avoided: a player who
pressed a queue row's `Cancel` and lost the race must not read a sentence
that could be confused with "you had no session" or "that delivery already
landed." A supersession key, mirroring `purchaseCancelSupersessionKey`:

```ts
export function cancelBuildOrderSupersessionKey(orderId: string): string {
  return `cancel-build-order:${orderId}`;
}
```

### 6. Save format — explicitly not touched, and why this is not a request

`AGENTS.md` reservation 2 covers `supabase/migrations/` and the save format;
[ADR 0096](./0096-what-a-way-back-is-and-what-guarantees-one.md)'s own
approval-list item 6 restates that a restore question is "outside any
agent's mandate" even inside an accepted document. **This design does not
need that reservation released, because the token it adds never enters the
persisted shape at all** — Decision §2 keeps `orderRevisions` private to
`ConstructionSystem` and outside `ConstructionSnapshot`, so `BuildOrder`'s
serialized fields are unchanged, `snapshot()` and `restore()` are unchanged,
and there is no `SAVE_SCHEMA_VERSION` question to bump a version for. If an
implementer finds a reason the counter must instead live on `BuildOrder`
itself and be persisted — this document did not find one — that would move
this design back inside reservation 2, and it would need to stop and ask
rather than proceed, exactly as this section's header says. See "Weakest
claim" for what would force that move.

### 7. What the row, the wiring, and the paused case do

`BuildQueueOrderViewModel` (`src/simulation/presentation/construction-projection.ts:210-269`)
gains one field, read the same way `cancelRefundMinorUnits` already is —
carried across the worker boundary unchanged, no arithmetic added in the
projection:

```ts
readonly revision: number;
```

`BuildOrderSource` (`:114-132`) gains `revisionOf(orderId: string): number`,
implemented by `ConstructionSystem.revisionOf` (Decision §2) exactly as
`previewCancelRefundMinorUnits` already is. The intent
(`hud.ts:567`, `{ kind: 'cancel-build-order'; readonly orderId: string; readonly revision: number }`)
gains `revision: number`, read off the row the player pressed
(`hud.ts:2024`'s `dispatchCommand` call site). `src/main.ts:2757`'s producer
becomes:

```ts
case 'cancel-build-order':
  requireSimulation(commands).submit({
    type: 'CancelBuildOrder',
    orderId: intent.orderId,
    expectedRevision: intent.revision,
  });
  return;
```

**Paused behaviour follows from Decision §1 without a special case.**
`projectFromClock` returns lead `0` when the clock is stopped (Context §3), so
a paused press executes at the same tick the row was read, and
`order.revision` cannot have moved in a tick nothing advanced — the refusal
essentially cannot fire while paused, for the same reason every state pays
what its row advertised while paused today. This design therefore does not
need — and does not add — a separate paused-versus-running branch; the
counter's own semantics already collapse to "never stale" when nothing ticks.

**The candidate wording**, proposed here and not written into
`src/content/default-locale-en.ts` by this document (reservation 4's
2026-09-04 release gives the choice of words, not the promise, and the
promise is not true of any code yet, since none of this is implemented):

> **THE PARENTHESIS ABOVE IS FALSE AS OF 2026-09-16 (`e044a3e8`) AND IS KEPT
> RATHER THAN OVERWRITTEN, BECAUSE THE HALF OF IT THAT MATTERS IS STILL
> TRUE.** *"Not written into `src/content/default-locale-en.ts` by this
> document"* holds — this document still writes no string, and that is the
> reservation-4 point it is making. *"None of this is implemented"* does not:
> the sentence below shipped **verbatim, every character**, at
> `src/content/default-locale-en.ts:886`, and is translated at
> `src/content/locale-pl.ts:694`. So the promise is now true of code, which is
> the condition reservation 4's release attaches to the wording rather than a
> licence this document granted itself.

> `'hud.alert.refusal.cancel-build-order.stale-cancellation'`: **"Nothing was
> refunded — this order moved on before the cancellation reached it. Press
> Cancel again to see what it pays now."**

Modelled on `cancel-purchase.not-pending`'s own opening clause ("Nothing was
refunded — ...") for the same family of refusal. It is deliberately generic
across every transition a revision mismatch could represent — not only
`'assigned'` → `'in-progress'`, which is #853's own case, but any of the other
ten `order.state =` sites in Decision §3 — because a sentence naming "the
crew" would be false for a press caught between, say, `'approved'` and
`'materials-pending'`, where no crew is involved yet. The second sentence is
the part that matters given §7's frequency finding: a control that refuses
seven presses in ten owes the player somewhere to look, and the row's own
next publication is exactly that — it will already read the order's honest
current state and honest current refund figure by the time this sentence is
read.

### 8. The frequency finding is not a reason to change the ruling, and it is also not nothing

Context §7's ~70% is a property of `DEFAULT_LEAD_TICKS` (20) against
`ConstructionSystem.schedule.intervalTicks` (10), not of this document's
design — this design does not change how often an order transitions inside
that window, only what a stale press against one now says. **This document
does not recommend changing either constant.** `leadTicks` is a
`SimulationCommandSender`-wide constructor option (`simulation-commands.ts:74-81`,
VERIFIED) shared by every command type for a documented reason (tolerance for
real message latency, scaled by clock speed so a throttled tab does not
reject every command as "scheduled in the past") — shrinking it for
`CancelBuildOrder` alone needs a per-command lead, which nothing in
`SimulationCommandSender.submit` currently supports (`:306`, takes a bare
`SimulationCommand`), and inventing that is a distinct engineering question
with its own measurement owed, not a corollary of this one.

> **THAT CLAUSE IS FALSE AS OF 2026-09-16 (`e044a3e8`), AND THIS DOCUMENT
> ALREADY SAID SO ONE SECTION LOWER WITHOUT AMENDING IT HERE.** *"Nothing in
> `SimulationCommandSender.submit` currently supports"* a per-command lead:
> `submit(command, options: { readonly leadTicks?: number } = {})` at
> `src/ui/simulation-commands.ts:392`, and `CANCEL_BUILD_ORDER_LEAD_TICKS = 12`
> at `:183` is the constant it was built for, passed by `src/main.ts:2773-2774`.
> **"Weakest claim" below records that this was built and what it measured**,
> so the document has carried the fact and its own denial of the fact in the
> same file; the denial is left standing because it is the premise the
> follow-up in this section was declined on, and a reader needs to see which
> premise expired. What it says next — that the per-command lead is a distinct
> question with its own measurement owed — was right, and the measurement was
> taken. **Recorded as a
candidate follow-up rather than decided here**: whether `CancelBuildOrder`
specifically should carry a smaller lead than the sender's default, once this
document's refusal exists to measure the *actual* post-fix rate against
rather than #859's pre-fix one (see "Weakest claim").

## What the owner must approve

1. **The direction is already ruled** (Status, above). What remains is this
   document's mechanism.
2. **Names with no product stake**, in the pattern ADR 0106's own open
   question 1 states of `RemoveWall`'s name: `expectedRevision`, `revisionOf`,
   and `'stale-cancellation'` are working names; nothing below depends on
   them.
3. **The candidate sentence in Decision §7** — the choice of words is ours
   under the 2026-09-04 release; whether it reads well to the owner once they
   play is the harmonising pass that release promises them.
4. **Whether the ~70% frequency (Context §7, MEASURED by #859 pre-fix) is
   acceptable as designed**, or whether it is itself the trigger for the
   follow-up named in Decision §8 to be taken up now rather than later. This
   document takes no position beyond recording the number and naming the
   follow-up as separable. **Sharper as of 2026-09-11's falsifier run
   ("Weakest claim", below): the follow-up itself is now answered — the lead
   fix measurably does not lower the rate — and what remains open is whether
   `Cancel` should be disabled for the ~1-second window instead of pressable
   and mostly refused, which is a new question for the owner and not decided
   here either.**
5. **Whether keeping the revision counter unpersisted (Decision §2, §6) is
   the right call**, given it is the reason this document does not ask
   reservation 2 to release anything. See "Weakest claim."

## Weakest claim

**The ~70% refusal-firing rate (Context §7, Decision §8) is inferred from
issue #859's pre-fix measurement, not measured against an actual
implementation of this document's design.** #859 instrumented the *existing*
handler, where a stale press silently pays `0`; this document assumes the
same ten presses, run again after this design lands, would land on the same
ticks and see the same seven `order.revision` mismatches turn into refusals
instead of silent zeros — which follows from Context §3's timing argument,
but was not run. **What would change my mind**: an implementer instrumenting
`CancelBuildOrder` post-implementation with the same 10-press-at-1×-against-
a-freshly-`assigned`-row protocol #859 used, and finding a rate materially
different from 70% — which would matter most if it came in *lower*, since a
lower real rate would weaken Decision §8's case for treating the lead-tick
mismatch as a live follow-up rather than a curiosity, and *higher*, since a
rate near 100% would make the row's own advertised figure close to
decorative at 1× speed and might argue for revisiting whether `Cancel`
should be disabled for the ~1-second window rather than pressable and mostly
refused.

> **THE CROSS-REFERENCE THE NEXT PARAGRAPH OPENS WITH DANGLES, AND IT
> DANGLED ON THE DAY IT WAS WRITTEN (found 2026-09-16, `e044a3e8`).** It cites
> *"The owner's ruling of 2026-09-11 (Status, above)"* for a ruling *"fix the
> lead first, then the refusal"*. **The Status block above records one ruling
> and it is dated 2026-09-10** — the clickable option *"Odmawiaj
> nieaktualnego anulowania"* — and says nothing about ordering the lead fix
> ahead of the refusal. The 2026-09-11 ruling is real but lives in the commit
> message of `3590705b`, the commit that added the paragraph below, whose own
> last line reads *"Status and acceptance are untouched"*: so the amendment
> pointed at a Status block it had deliberately not written to. **This is the
> shape [#1229](https://github.com/woogitsu/lockstate/pull/1229) found in ADR
> 0086 — an anchor that was wrong at the commit that wrote it — transposed
> from a `file:line` onto a section cross-reference**, and it is marked rather
> than repaired because repairing it means adding an owner's ruling to a
> `Status` block, which `docs/AGENT_WORKFLOW.md` §3 reserves to the owner. The
> paragraph's measurements are unaffected; only its provenance pointer is.

**THE FALSIFIER WAS RUN, 2026-09-11, AND IT ANSWERS TOWARD THE SECOND OF
THOSE TWO READINGS.** The owner's ruling of 2026-09-11 (Status, above) was
"fix the lead first, then the refusal" — a per-command lead was built
(`CANCEL_BUILD_ORDER_LEAD_TICKS`, `src/ui/simulation-commands.ts`, 12 ticks in
place of the sender's default 20) and this protocol run once against the
unmodified tree and once against this design, both after that lead landed.
Against the unmodified tree (`be5061f9`, `DEFAULT_LEAD_TICKS=20`, no refusal):
**0 of 4** valid presses on a freshly-`assigned` row paid what the row
advertised. Against this design (12 ticks, refusal wired): **0 of 9** did,
every one instead reading the authored `stale-cancellation` sentence rather
than a silent zero. Both samples are smaller than #859's own ten because
several presses missed the row's own repaint window entirely (#859's own
side-finding 1, reproduced rather than escaped) — recorded as misses, not
folded into either count.

**Read plainly, that is *higher* than 70%, not lower, in both samples** —
small ones, and not a replacement for a larger run, but they answer the
"what would change my mind" test this section names in the direction it says
matters most: **the lead-tick mismatch is not a live-vs-curiosity question
any more (Decision §8's own follow-up), because halving the margin measurably
changed nothing.** The reason is arithmetic, checked rather than assumed: 12
ticks still exceeds `ConstructionSystem.schedule.intervalTicks` (10) before a
single millisecond of real elapsed time is added, so every press either
sample caught still executed after the transition regardless of which margin
was in effect. A margin low enough to matter (below ten ticks) would drop
under the only documented real-latency floor this repository has —
`tests/browser/command-lead-at-speed.spec.ts`'s own 400 ms stress figure
(#942) — and risk exactly the worse defect this document's Decision §8
warned the follow-up would have to weigh. **This document's own suggestion
that a near-100% rate "might argue for revisiting whether `Cancel` should be
disabled for the ~1-second window" is therefore live and is not decided
here** — it is a new question for the owner, not an implementation detail,
and nothing above builds it.

**The second weakest claim is Decision §2's own**, named there and repeated
here because it is what keeps this document outside reservation 2: that
nothing this design needs has to survive a save. The argument is that the
counter's whole job is done within one live session's few-second window and
the client cannot hold a stale expectation across a restore either, so
defaulting or persisting it buys nothing. **What would falsify it**: a
concrete replay or multiplayer-adjacent scenario (none is known to exist in
this codebase today) in which a client's expectation of an order's revision
is meant to survive a worker restart within the *same* session rather than
across a save-and-reload — if such a scenario exists, the counter would need
to move onto `BuildOrder` and this document's save-format section would need
to be rewritten rather than merely re-priced, exactly as its own header
says.

## Scope note: a small repair seen in passing, not taken here

`handler.ts:145-151`'s comment argues the existing not-found/not-cancellable
idempotency in careful detail and is correct as far as it goes, but nothing
in this codebase currently tests it against a mutation the way
`docs/AGENT_WORKFLOW.md` §3 requires of a new gate — this document adds no
new gate there and does not audit the existing one; it is named here only
because Decision §4 relies on that behaviour being unchanged and a reader
checking this document's claims should know it was read, not re-verified by
mutation testing. Nothing here rises to "note in the ADR or file an issue"
under the scope boundary this document was given, because nothing unambiguous
was found — it is recorded for the next reader's benefit rather than as a
finding.
