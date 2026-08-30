# Playtest: what the player sees on the way into ADR 0075's lock, what happens at the bottom, and whether an ambitious build gets there

**Date:** 2026-08-30
**Branch measured:** `agent/675-play-into-the-lock`, cut from `main` at
`v0.0.257`, which carries [#640](https://github.com/matmaxalez/lockstate/pull/640)
(a build order buys its own materials at the press) and
[#655](https://github.com/matmaxalez/lockstate/pull/655) (the shared harness's
`waitForQueueEmpty` regex).
**Reproduction:** `tests/browser/playtest-into-the-lock.playtest.ts`, run with
`LOCKSTATE_BROWSER_TEST_PORT=5189 ./node_modules/.bin/playwright test -c tests/browser/playwright.playtest.config.ts tests/browser/playtest-into-the-lock.playtest.ts`.
Nothing in CI collects `.playtest.ts`.

**The question, and what is deliberately not re-litigated.**
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§4 already measured the arithmetic of the wall route to the segment — 312
funded, the 313th refused, **40 left** — and already refuted issue
[#641](https://github.com/matmaxalez/lockstate/issues/641)'s *"a single
sustained drag reaches it"*: one drag is at most 20 segments, one screenful is
116, and reaching the floor took 24 drags. **Both reproduce here** (§1) and
neither is this pass's contribution. What this pass asks is what that record
left open: what the player is *told* on the way down, what a mouse can do at the
bottom, and whether ambition arrives there without aiming.

**Contention.** Run A was taken on a machine whose load average had fallen to
3.1 from the 8–14 of earlier in the day, with one other agent's `vitest` run
alongside (issue [#667](https://github.com/matmaxalez/lockstate/issues/667)).
**Every figure this document rests on is a tick, a treasury value or panel text
— all of which come from the simulation and are identical across runs — and not
a wall-clock millisecond.** Where a duration is quoted it is labelled and is not
part of any claim; §1 uses one such duration to *correct* a wall-clock figure in
an earlier record, and marks it as the weakest thing here.

**LFS.** `git lfs checkout` was run in the worktree before any browser work:
`file public/assets/actors/actor.guard.base.idle.png` → `PNG image data, 260 x
3104`. Nothing below is a claim about rendering, but a worktree that had skipped
it would have run green with no art and said nothing
(`docs/AGENT_WORKFLOW.md`, §2).

## Claim tiers

- **MEASURED** — produced by a run of the playtest, quoted from its output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **UNKNOWN** — could not be established here.

Nothing below is tiered **FROM MEMORY**.

---

# Part C — which of ADR 0075's three accepted decisions would have caught this

ADR 0075 is `docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md`,
**Accepted, 2026-08-29**. It records three decisions and says the ordering is
the substance: *"decision 1 gets a prison its first bed and pays for growth
after that; decision 2 is what happens when the money runs out anyway; and
decision 3 is the way out of holding the wrong thing."* Taken against the wall
route, one of the three catches it, one does not, and one catches a different
prison from the one this route produces.

## Decision 1 — development grants at population thresholds: **no**, and the ADR says so itself

The decision is *"one-off per threshold, with the first threshold very low"*,
and it is paid **for population crossing a line**.

**A prison at the wall lock has no prisoners and cannot get one.** ADR 0075's
own "why it is terminal" gives the chain: state income is paid per occupied
place, an occupied place needs a standing `sleep-surface`, and both buildables
that place one are priced in `item.wood-plank`. So no threshold above zero can
ever be crossed from the locked state, and a threshold *at* zero is not a
threshold — it is the starting grant the ADR already names and declines to
treat as a mechanic: *"**The very low first threshold is a starting grant in
disguise, and this ADR says so rather than letting it pass.**"*

A starting grant of `G` does not remove the lock either. It moves it: the wall
route's floor is `floor((25,000 + G) / 80)` segments instead of
`floor(25,000 / 80)`, and one more drag arrives at the same place. The ADR
states this conclusion in its own terms, about a different route, and it holds
unchanged here:

> **So: the first threshold alone does not close the class.** It gets the
> prison started; the recurring pressure that the payroll route demonstrates is
> answered by decision 2's ladder and its loan, not by this.

## Decision 2 — the balance may go negative, and loans are the way out: **yes, and only this one**

This is the decision that dissolves the lock rather than moving it, and the
reason is a single sentence of the ADR's own:

> **Its precondition is named in ADR 0017's own text and is not met today.**
> `Treasury.spend` refuses rather than overdrawing
> (`src/simulation/economy/treasury.ts:111`), so there is no negative balance
> for a ladder to respond to. **Building this means changing that.**

Changing that *is* the remedy here. `Treasury.spend` is the whole of the lock:
**VERIFIED, read**, `src/simulation/economy/treasury.ts:111-116` is four lines,
`if (!this.canAfford(amountMinorUnits)) return false;`, and `canAfford` is
`amountMinorUnits <= this.balance`. With overdraw permitted, a balance of 40
buys a plank at 65 and lands at −25; a bed stands; a prisoner is admitted; the
income line starts; the loan is the instrument that keeps the hole
serviceable. Nothing else in the three decisions touches the refusal.

The ADR also says why the loan is not optional beside it, and the sentence is
about exactly the state this route reaches:

> **The loan is not a nice-to-have beside the ladder. It is what keeps
> decision 8 honest.** With no floor and no terminal state, a prison can reach
> a position from which recovery is arithmetically impossible … **a hard-lock
> again, only slower, and dressed as a mechanic.**

## Decision 3 — sell-back at a loss: **not as written**, because the wall route holds no stock to sell

Decision 3 is *"a command that converts **stock** back into money at a fraction
of the purchase price"*, and its justification names the prison it was written
against:

> **This is the general answer to "the money is in the wrong shape"**, which is
> what ECON-002 is underneath: **the 625-brick prison is not poor, it is
> illiquid.**

The 625-brick prison holds 625 bricks in a container. **The wall-drag prison
holds none.** **VERIFIED, read**:

- `ConstructionMaterialsProvider.tryAllocate` is *"all-or-nothing: either every
  requirement is satisfied and **consumed**"* (`src/simulation/construction/materials-provider.ts:3-8`).
- The just-in-time sink buys the **deficit** only —
  `const deficit = requirement.quantity - this.stock.availableOf(requirement.itemId) - inFlight;`
  (`src/simulation/economy/just-in-time-materials.ts:164`) — so it never
  over-buys and the container never accumulates.

Two bricks per segment are bought, delivered, allocated, consumed, and written
into the world's edge layers. So a `SellMaterials` over stock, dropped into this
prison, would find nothing to sell.

**It reaches this prison only through a demolition step that decision 3 does not
mention and the interface barely supports.** `ConstructionSystem.cancelOrder`
(`src/simulation/construction/system.ts:594-612`) reverses the geometry of a
`completed` order and then hands its materials back —
`this.materialsProvider.release(order.materialsAllocated)` — so bricks *can*
return to the container. What can aim that command is the measured part, and it
is Part B's subject.

**This is the sharpest thing the pass has to say about the ADR**: #640 did not
only make the lock reachable by a gesture, it moved the illiquidity from the
container into the world. Decision 3 was written for money in the wrong shape
*in a warehouse*; the wall route puts it in the wrong shape *in the map*.

---

# Part A — what the player sees between 25,000 and 40

## 0. The instrument this section needed, and the first one it tried

**MEASURED, and it is recorded because the first reading was useless in the
flattering direction.** The obvious probe — "does anything on the visible HUD
match a money word" — answers **true on the very first drag of a fresh session
and on every drag after it**, because two pieces of furniture are permanently on
screen:

```
[L1] BASELINE lines that already match a money word (furniture, present at every balance): ["Funds","Buy"]
```

`Funds` is the status strip's label beside the balance; `Buy` is the Build
panel's procurement disclosure toggle. Both are identical at 25,000 and at 40.
A probe that counts them cannot tell a warning from a wall, so the descent
captures the visible-line set at the moment the wall tool is armed and reports
only the lines that were **not** in it, discarding the bare-number line so that
the counter counting does not read as the game speaking.
