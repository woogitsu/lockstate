# Playtest: the Build queue's Cancel button never says what it gives back, and the one sentence that tries to is false

**Date:** 2026-09-02
**Branch played:** `playtest/the-economy-played`, cut from `origin/main` at
**v0.0.380** (`1eb1b5b6`), `git fetch origin main` run immediately before the
worktree was cut.

**Surface:** the economy, played end to end -- what a player actually sees
when they cancel a build order, per the brief's naming of
`refundSurplusOf` (`src/simulation/construction/system.ts:820`, called from
`:764`) as recently landed and unplayed.

**The brief, in the owner's words:** *"znajdź bugi i błędy grając"* -- find
defects by playing, against the standing design direction that the game must
be easy and friendly with no hidden mechanics. **A rule a player cannot
predict from what the interface shows them is a defect even when the code is
correct.**

## Reproduction

`tests/browser/playtest-cancel-refund-readout.playtest.ts`:

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node ./node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-cancel-refund-readout.playtest.ts
```

Nothing in CI collects it -- `.playtest.ts`, matched only by
`playwright.playtest.config.ts`, per `browser-suite-partition-contract.test.ts`.

**LFS.** `git lfs checkout` was run in the worktree first (62 objects, 93 MB)
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104`.

**Contention.** A second agent's own playtest (`playtest-intake-and-classification.playtest.ts`
in `/workspace/wt-intake`) was running concurrently for part of this session.
The first attempt at this instrument (below, §0) ran at load and its timing
failure is reported as a finding about the instrument, not about the game.

## 0. First attempt: fast-forwarding hid every intermediate state

The first cut of the instrument bought bricks, fast-forwarded to ×4, placed a
seven-segment wall run, and polled once a second for a row in `'assigned'`
("Awaiting the Crew") and one in `'in-progress'` ("In Progress") at once.
**Every one of 75 samples over 21,015 ticks read `rows=[]`.** The whole run had
already finished before the first poll fired -- fast-forward outruns a
one-second poll by more than the few hundred ticks one wall segment takes to
build. Corrected: resume at **×1**, the slowest speed on offer, place fifteen
segments instead of seven (more of the queue sits `'assigned'` at once, which
widens the window a poll can land in), and poll every 150 ms instead of every
1000 ms. The corrected run is §§1-3 below.

**Even ×1 is fast relative to a single order.** Two consecutive 150 ms polls
read tick 795 and tick 831 -- 36 ticks in roughly a tenth of a second of real
wall-clock time -- so a single wall segment's `'in-progress'` window is on the
order of a few hundred milliseconds of real time even at the slowest speed the
game offers. That is itself worth naming: nothing on screen tells a player the
crew is already working before they can react to the row saying so.

## 1. The row itself: what a player has to go on before pressing Cancel

`src/content/default-locale-en.ts:1168`:

```
'hud.build.queue-order': '{buildable} · {x}, {y} · {edge}',
```

`formatBuildQueueOrderText` (`src/ui/hud/build-panel.ts:591-598`) composes
exactly that plus the state word from `build-order-state`
(`src/content/simulation-message-keys.ts:472-484`: *Planned, Approved,
Awaiting Materials, Awaiting the Crew, In Progress, Completed*). Measured live
on the real page, sample 1 of the corrected run:

```
Brick wall · 12, 12 · North | Awaiting the Crew | Cancel
Brick wall · 13, 12 · North | Awaiting the Crew | Cancel
Brick wall · 14, 12 · North | Awaiting the Crew | Cancel
```

**No money figure anywhere on the row, in any state.** Compare the *other*
Cancel in the same panel -- the pending-deliveries block, three rows above the
queue -- whose row text is `'{count} × {material} · {total} back'`
(`default-locale-en.ts:1174`) and whose header is `'{count} bought · {total}
back if cancelled'` (`:1173`). That control predicts its refund in the
sentence itself. The build-queue row, which is what `refundSurplusOf` and
`cancelOrder`'s ruling-20 table actually govern, predicts nothing: not the
amount, not even whether pressing Cancel will give back money, materials,
both, or nothing.

**This is not a difference of degree.** `cancelOrder`'s own table
(`src/simulation/construction/system.ts:645-651`) says the payout for a queued
order runs from the buildable's full catalogue value down to exactly zero,
inside states two of which render with near-identical row text:

| state at the press | what the player gets | row says |
| --- | --- | --- |
| `approved` / `materials-pending` | money -- the surplus JIT delivery | "Awaiting Materials" |
| `assigned` | money -- the catalogue value of the allocation | "Awaiting the Crew" |
| `in-progress` | **nothing at all** | "In Progress" |
| `completed` | **nothing at all**, and the wall still comes down | not shown in this queue at all (see §4) |

Two adjacent rows in the same list can read `Awaiting the Crew` and `In
Progress` and pay back the whole price of a wall segment or nothing, and
nothing about the row's own text marks the difference.

## 2. Measured live: cancelling a row that reads "In Progress" pays back zero

Sample 2 of the corrected run caught both states at once:

```
order-576187bf … "in-progress": "Brick wall · 12, 12 · North | In Progress | Cancel"
order-8672a6bb … "assigned":    "Brick wall · 13, 12 · North | Awaiting the Crew | Cancel"
```

The clock was then paused so the target row would stop moving, and the
**live** state was re-read immediately before the press (never the stale
sample) -- the pause itself took long enough that the crew had already moved
on:

```
ABOUT TO CANCEL a row caught as "Awaiting the Crew"; its state right now is "in-progress".
Its own text: "Brick wall · 13, 12 · North | In Progress | Cancel"
funds immediately before this cancel: 23400
funds immediately after that cancel:  23400
```

**Zero minor units moved.** The row said "In Progress | Cancel" and nothing
else, the player presses it, and the treasury does not change at all --
exactly ruling 20's `in-progress` row, reached by playing rather than by
reading the table. A player who has just watched a wall segment start and
changes their mind gets nothing back and the interface never told them that
would happen. (The order this run had originally caught `in-progress`,
`order-576187bf`, finished and moved to `Completed` -- removed from the queue
entirely, see §4 -- before it could be cancelled to observe the `assigned`
payout live in the same run; §1's table states that payout from the code
rather than from a second live measurement.)

## 3. The only sentence in the panel that tries to say this is false, and has been reported false for two days

The Build panel's Remove tool has one hint line, and it is the single sentence
anywhere in this panel that attempts to describe what cancelling gives back.
Read live off the real page on `v0.0.380` (`1eb1b5b6`), before anything else in this run:

```
REMOVE HINT, as rendered on the real page right now: "Press any tile of an
object to take it away. One still being built is cancelled and its materials
come back; a finished one is not refunded."
```

`src/content/default-locale-en.ts:1097`. **The string itself has carried a
comment since 2026-08-31 (`:1049-1059`) saying it is false:**

> `remove-hint` IS FALSE AS OF 2026-08-31 AND NO REPLACEMENT IS WRITTEN HERE,
> BECAUSE COPY IS THE OWNER'S (`AGENTS.md`'s fourth exclusion). […] So *"its
> materials come back"* names the wrong currency, and the sentence has no
> clause at all for the case where nothing comes back. […] Reported to the
> owner with the branch that made it false.

That comment is a day older than ruling 20 itself and has survived every merge
since, including the ones that shipped `refundSurplusOf`. **It is still true
today, on the branch this playtest is measuring, and the string is still
live and still rendered by the real page** -- confirmed above, not inferred
from the comment. Ruling 20 made a cancellation pay in **money**, not
materials, for three of five cancellable states, and pays **nothing at all**
for `in-progress` (§2 measures exactly that case). The sentence a player
actually reads says the opposite of both: it promises materials back, and
names no case where nothing comes back at all.

This is not a new finding -- it is a two-day-old, self-reported, still-open
one, and it is the single most player-visible defect this pass found: a
sentence the game puts in front of a player, on the one control that tries to
explain a cancellation, that is false about which currency comes back and
silent about the one state where nothing does. `AGENTS.md`'s fourth exclusion
reserves the replacement wording to the owner, so none is drafted here;
what changed since 2026-08-31 is only that the false sentence has now survived
into the exact browser flow (`refundSurplusOf`) the brief was written to have
someone actually play.

## 4. A related, adjacent, and deliberately untouched question

`docs/research`'s own README rule (name the weakest claim) applies here to
what this record does **not** measure: `tests/integration/economy-cancel-what-comes-back.test.ts`
on branch `measure/717-what-cancelling-gives-back` (worktree `/workspace/wt-717c`,
read but not modified — the owner's PR #812 on issue #717 is explicitly
off-limits) documents, at the code level, a **ten-tick window** where an
order sits `'materials-pending'` -- the state the table above marks "money" --
but its delivery has already landed in the container with no allocation made
yet, so `refundSurplusDeliveries` finds nothing on the road to turn around and
a cancel there returns **nothing in either currency**, contradicting the very
table this record's §1 quotes for that state. This record does not
independently reproduce that window live (it is PR #812's subject and stays
untouched per the brief), but it corroborates and sharpens §1's finding: the
same state label, `'materials-pending'`, can mean two different payouts
depending on a ten-tick window nothing on the row marks, which is a second,
narrower instance of the same defect class -- the row's text is not merely
silent about magnitude, it is silent about which of two *outcomes*
applies within one label.

## What was not reached

- **The `assigned` state's payout was not independently confirmed live with a
  treasury delta in this run** -- the run caught it transitioning to
  `in-progress` before the pause landed (§2's parenthetical). §1's table for
  that state is a code citation (`system.ts:645-651`), not a second live
  measurement; a future pass with a still-faster pause (or a debugger
  statement / breakpoint rather than a UI pause click) could close this.
- **Completed orders were not driven through this instrument at all.** They
  are deliberately excluded from the queue view
  (`src/simulation/presentation/construction-projection.ts:73-88`,
  `PENDING_BUILD_ORDER_STATES`), so a finished wall's zero-refund removal is
  reachable only through the Remove gesture or `Undo`, neither of which this
  run exercised end to end with a treasury reading either side.
- **Mobile viewports were not played.** Everything above is desktop, matching
  the owner's stated priority in prior money playtests.
- **#717 / PR #812's own subject (sell-back pricing) was read for
  corroboration only, per the hard constraint not to touch it, and is not
  re-verified live here.**

## Weakest claim

That the Remove hint is the *only* sentence in the panel attempting to
describe a refund. It was established by reading every string in
`src/ui/hud/messages.ts`'s Build-panel block and the corresponding
`default-locale-en.ts` entries, not by an exhaustive runtime sweep of every
panel state; a sentence rendered only in a state this pass did not reach
(a refusal toast, say) would falsify it. What would change this record's
central claim (§1: the queue row shows no money) is any evidence that a
build-order queue row renders differently than measured here in some state or
viewport not covered above.
