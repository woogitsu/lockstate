import {
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  purchaseChargeMinorUnits,
  rungFloorMinorUnits,
  sellBackUnitPriceMinorUnits,
} from '../simulation/economy';

/**
 * **Whether the host should refuse a charge before it sends the command, and
 * why.**
 *
 * ## What this is, and what it is not
 *
 * It is the *pre-flight* `src/main.ts` runs on the two intents that cost money
 * -- `purchase-materials` and `hire-staff` -- so that a press the prison
 * cannot pay for is answered on the control the player pressed instead of some
 * ticks later from the worker. It is **an echo of the last published balance,
 * not a second treasury**: `Treasury.spend` is the authority and refuses
 * without overdrawing either way, and the two sit on opposite sides of
 * `sender.submit` so one press produces exactly one report.
 *
 * ## Why it is a module of its own
 *
 * Because the comparison it makes was **wrong for a whole ruling and nothing
 * could see it.** Both call sites read
 * `if (total > viewModel.counts.treasuryMinorUnits) throw`, which is
 * `Treasury.canAfford` with the floor hard-coded at zero. #703 ruling A of
 * 2026-08-31 opened a standing overdraft of `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`
 * in every session
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), so those comparisons would have **refused presses the simulation
 * accepts** -- the interface saying no to a purchase the prison can afford,
 * which is the failure #82 and #207 are about wearing the opposite sign.
 *
 * `vitest.config.ts` sets `environment: 'node'` and `src/main.ts` touches
 * `document`, so that file is unreachable from `pnpm test` *at all* -- a
 * mutation inside it survives because nothing can observe it
 * (`docs/AGENT_WORKFLOW.md`). Extracting the decision is the answer that
 * document names, and `orderPrisonsForDisplay` (#445) is the precedent. ADR
 * 0083 §(d) recorded this divergence as "named here rather than pinned"; this
 * module is what pins it.
 *
 * ## Why the floor is a default argument and not read from a view model
 *
 * The default is the same constant the composition root applies to the
 * `Treasury`, so both sides of the boundary derive from one definition -- and it
 * stays a parameter so that the boundary cases below can be driven at a floor of
 * `0`, which is what a session had before the ruling and what a bare
 * `new Treasury()` still has.
 *
 * **The reason this paragraph used to give is now false and is kept rather than
 * overwritten.** It read: *"The status channel publishes the balance and no
 * floor (`statusCountsSchema`), so the host has nothing to read one from and
 * adding a field would put a second copy of a constant on the wire."* That was
 * true when it was written and stopped being true the same week: the owner's
 * ruling 18 of 2026-08-31 needed the floor **in the interface** -- the `FUNDS`
 * chip's `{remaining} left` badge cannot be computed without it -- and the
 * choice was between publishing it and keeping a second copy of the constant
 * inside `src/ui/`, which is exactly what this paragraph refused. So
 * `statusCountsSchema.treasuryOverdraftFloorMinorUnits` exists, and it carries
 * the treasury's **own** `overdraftFloorMinorUnits` rather than the constant --
 * which is why it is not the second copy the old sentence feared.
 *
 * **This function still does not read it, and that is a decision rather than an
 * oversight.** Reading a floor off the view model here would make the host's
 * pre-flight depend on a *published* value that is at most 500ms old, where the
 * default argument is the same definition the treasury was built from and cannot
 * lag. If the floor ever becomes something a session changes, that trade
 * reverses and this parameter should be fed from `HudCountsViewModel`.
 */
export interface AffordabilityVerdict {
  /**
   * Whether the charge should be refused before the command is sent.
   *
   * Exactly `refusal !== undefined`, kept as its own field because it is what
   * every call site asks and reading it should not require knowing the
   * vocabulary.
   */
  readonly refused: boolean;
  /**
   * Which branch refused, or `undefined` when none did. See
   * `AffordabilityRefusal`.
   */
  readonly refusal: AffordabilityRefusal | undefined;
  /** The charge that was tested, echoed so a caller can report it without recomputing it. */
  readonly chargeMinorUnits: number;
  /** The balance it was tested against. */
  readonly balanceMinorUnits: number;
  /**
   * What the prison could still spend at that balance: `balance - floor`.
   *
   * Reported rather than left to the caller because it is the figure that makes
   * a refusal legible -- a balance of `-2,480` refusing a `65` plank is not
   * obviously right until the twenty of room left is beside it.
   */
  readonly spendableMinorUnits: number;
  /**
   * **How much more money the prison needs before this charge goes through**,
   * and `0` when it needs none.
   *
   * `charge - spendable`, which is the *shortfall* and deliberately neither of
   * the two figures a reader might mistake it for: not the charge, and not the
   * balance. At the worked example this module's own docblocks use -- a `65`
   * plank against a balance of `-1,230` at the mature `-1,250` rung -- the
   * charge is 65, the balance is -1,230, the spendable room is 20 and this is
   * **45**. Four different numbers, and only the last one answers "what would
   * lift it".
   *
   * ## Why it lives here rather than at the call site
   *
   * Because it is a restatement of the *same* comparison the refusal is
   * decided by, and this module exists so that comparison has exactly one
   * home (see the type's own docblock). A panel computing
   * `charge - (balance - floor)` for itself would need the floor, which is
   * what `pressFloorMinorUnits` was extracted to stop `src/ui/hud/` reaching
   * for (`AGENTS.md` boundary 1) -- and it would be a second expression that
   * could disagree with `refused` about whether there is a shortfall at all.
   *
   * ## Exactly the `'past-the-floor'` branch, and strictly positive there
   *
   * `refused` on that branch is `balance - charge < floor`, i.e.
   * `charge - spendable > 0`, so a `'past-the-floor'` verdict always has a
   * shortfall of at least one minor unit and every other verdict has none.
   * `'malformed-charge'` reports `0` rather than a subtraction: the charge on
   * that branch is not a number the state would carry, so "how much more you
   * need" has no answer, and a `NaN` reaching a player-facing figure would be
   * worse than the branch having nothing to say. That branch says nothing to
   * a player today and this field does not change it.
   */
  readonly shortfallMinorUnits: number;
}

/**
 * Which branch of `judgeAffordability` refused, so the caller can choose a
 * sentence for it (the owner's ruling 18 of 2026-08-31).
 *
 * ## Why two members and not three
 *
 * The obvious vocabulary is "the money ran out" against "a limit was reached",
 * and **with a facility open those are not two events**. `refused` is
 * `balance - charge < floor` and nothing else, so every money refusal a player
 * can provoke is a floor crossing: a prison at 25,000 asked for 30,000 is
 * refused for the same reason, and by the same comparison, as one at -2,480
 * asked for 65. There is no branch left for "no money" to be.
 *
 * What that leaves the generic refusal covering is every refusal that is *not*
 * about money -- no session at all, an item nothing sells, and the malformed
 * charge below -- which is what `hud.refusal.purchase-materials` says today and
 * goes on saying.
 *
 * ## `'past-the-floor'` at a floor of zero
 *
 * A bare `new Treasury()` has no facility, so there the same branch really does
 * mean the money ran out. The branch is still named the same, deliberately: a
 * reason whose meaning changed with the floor would be a reason no caller could
 * map to a string. Choosing the sentence is the composition root's, and the
 * only floor it ever passes is the shipped constant.
 */
export type AffordabilityRefusal = 'past-the-floor' | 'malformed-charge';

/**
 * **The floor a press is judged against, which since the owner's ruling 19 of
 * 2026-08-31 is a rung and not the overdraft floor.**
 *
 * The two intents this module serves are `purchase-materials` and `hire-staff`.
 * Under ruling 19 (drafted as ADR 0017's "Amendment, 2026-09-01") the first is
 * ADR 0017 decision 8's `'deliveries'` rung and the second is `'hiring'`, which
 * shares its threshold -- so **one number serves both**, and if hiring is ever
 * given a rung of its own this becomes a parameter of the call rather than a
 * constant.
 *
 * Composed through `rungFloorMinorUnits` rather than written out, so the host's
 * pre-flight and `Treasury.floorFor` are one definition. Writing `-1_250` here
 * would rebuild, one ruling later, exactly the second copy this module's own
 * docblock was created to prevent.
 *
 * **The default was `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` until ruling 19, and
 * every paragraph above was written under it.** Leaving it there would have made
 * the host accept every press between -1,250 and -2,500 that the worker then
 * refuses -- not the #82/#207 failure, which is the interface refusing what the
 * simulation accepts, but its mirror: a control that says yes and is overruled
 * some ticks later.
 *
 * **What it did not fix, deliberately, and what fixed it.** This paragraph read:
 * *"`hud.status.funds-remaining` renders `balance - overdraftFloor`
 * (`src/ui/hud/projection.ts`), which is the room to -2,500; between -1,250 and
 * -2,500 that badge now offers a player room they cannot spend. That is a
 * player-visible figure whose meaning the ruling changes, so it is the owner's
 * under `AGENTS.md`'s fourth exclusion and is reported rather than quietly
 * re-based here."* It was reported, and the owner ruled on 2026-09-01 that the
 * badge is re-based onto this same rung. It is: `overdraftRemaining` computes
 * over `deliveriesRungFloorMinorUnits` below, so the host's pre-flight and the
 * figure the player reads before pressing are one number, and `0 left` and
 * "the next press is refused" are one fact.
 *
 * The badge's *words* are a separate question and are still open. The owner
 * chose `{remaining} left before deliveries stop` subject to the badge being
 * measured, `tests/browser/ui-overdraft-badge.spec.ts` measured it, and the
 * long wording costs +133px of chip and pushes the FUNDS chip off the visible
 * edge of the metrics row at 1280x800. The incumbent `{remaining} left` ships
 * until the owner rules on the figures; ADR 0017 "Amendment, 2026-09-01" §5a(d)
 * carries them.
 */
export const HOST_PRESS_FLOOR_MINOR_UNITS = rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);

/**
 * The `'deliveries'` rung under a floor the simulation published, for the one
 * caller that has a published floor to hand.
 *
 * **This exists because `src/ui/hud/` may not import the simulation and this
 * module may.** `tests/unit/ui-hud-messages.test.ts` pins that boundary --
 * *"the HUD is a view over snapshots (`AGENTS.md` boundary 1), so it may not
 * import the simulation"* -- and `overdraftRemaining` in
 * `src/ui/hud/projection.ts` needs the rung the owner's ruling of 2026-09-01
 * re-based the `FUNDS` chip onto. Re-deriving `Math.max(-1_250, floor)` inside
 * the HUD would be a second copy of `rungFloorMinorUnits`'s clamp; going
 * through here is one definition with the boundary intact.
 *
 * **Why the published floor and not `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`,
 * where `HOST_PRESS_FLOOR_MINOR_UNITS` above takes the constant.** The two
 * callers are not in the same position. This module's pre-flight is a
 * *decision* and the docblock above argues at length that a decision must not
 * depend on a value up to 500ms old; the badge is a *readout* of a treasury
 * state, and it already reads the balance and the floor off the same payload,
 * so taking the rung from anywhere else would let the badge disagree with the
 * chip above it. At the only floor anything in `src/` configures the two agree
 * to the minor unit; they part only for a session that sets a shallower floor,
 * and there the payload is right.
 *
 * **`isFreshUnfurnishedPrison` added 2026-09-01, for the same reason
 * `pressFloorMinorUnits` above takes it.** This function predates the starter
 * rung (ADR 0017's "Amendment, 2026-09-01: a starter rung…") and defaulted to
 * `false` by omission, which is `rungFloorMinorUnits`'s own default -- so the
 * one caller, `overdraftRemaining` in `src/ui/hud/projection.ts`, kept
 * computing the mature -1,250 for a fresh, unfurnished prison sitting on the
 * shallower -1,185 starter floor. The badge then overstated spendable room
 * by exactly the 65-minor-unit gap between the two: at a balance of -1,160 it
 * read `90 left` while a 65 press was refused, which is `AGENTS.md`'s fourth
 * exclusion and the defect PR #769 closed for the mature floor, reopened here
 * by an argument that never named the starter rung. The parameter is
 * required rather than defaulted, matching `pressFloorMinorUnits`'s own
 * choice and for the same reason: a caller that reads a published
 * `roomCapacity` and forgets to pass it through would silently get "not
 * fresh" back, which is the direction that reintroduces this exact defect.
 */
export function deliveriesRungFloorMinorUnits(
  overdraftFloorMinorUnits: number,
  isFreshUnfurnishedPrison: boolean,
): number {
  return rungFloorMinorUnits('deliveries', overdraftFloorMinorUnits, isFreshUnfurnishedPrison);
}

/**
 * **The floor a press or a hire is judged against, for a session that may be
 * a fresh, unfurnished prison** — the host-side twin of
 * `Treasury.floorFor('deliveries' | 'hiring', floor, isFreshUnfurnishedPrison)`,
 * composed the same way `HOST_PRESS_FLOOR_MINOR_UNITS` is, so the two sides of
 * `sender.submit` cannot disagree about which threshold is in force.
 *
 * **Why this one reads a per-call flag where `HOST_PRESS_FLOOR_MINOR_UNITS`
 * is a module-load constant.** That constant's own docblock argues at length
 * that the pre-flight must not depend on a *published* value that can lag —
 * but "fresh, unfurnished" is exactly as live as the balance the pre-flight
 * already reads off `viewModel.counts.treasuryMinorUnits`, not a new category
 * of staleness: both come from the same status-counts payload, at most 500ms
 * old, and the pre-flight has always accepted that lag for the balance. What
 * it must not do is invent a *second* definition of "fresh" — `roomCapacity`
 * is `statusCountsSchema`'s own field, already on the wire for the Rooms
 * panel, not a value minted for this call.
 *
 * **That last sentence is wrong and is kept rather than rewritten, because
 * reading `roomCapacity` here *is* the second definition (2026-09-15).** The
 * simulation's own answer is `RoomInstanceRegistry.totalResidentCapacity === 0`
 * — ADR 0017's "Amendment, 2026-09-01" §2 defines it that way, and
 * `createSessionCommandHandler`, `PayrollSystem`, `InsolvencyRungSystem` and
 * `computeStandingPrisonConditions` all read exactly that. `roomCapacity` is
 * summed over `collectRoomInstances`, a fan-out over the *content* room
 * registry's catalogue ids, so it cannot see an instance registered under an
 * id that registry does not define (`docs/HUD_PROJECTIONS.md` gap 15, which
 * `totalResidentCapacity`'s own docblock cites for this reason). The
 * implication runs one way only: every prison the simulation calls fresh the
 * host calls fresh, and not the reverse.
 *
 * Measured on a restored session with one off-catalogue room instance holding
 * a bed: registry 1, published `roomCapacity` 0, so at a balance of −1,200 the
 * badge reads `0 left` and this module refuses a 40-minor-unit press
 * `past-the-floor` while the real command handler accepts it and lands at
 * −1,240. The direction is the safe one — the host is stricter, never looser —
 * and the case is unreachable by play (`RoomZoningService.zone` refuses
 * `unknown-room-type`), which is why this is recorded here rather than fixed
 * in place: the fix is to publish the predicate `projectStatusStrip` already
 * computes and drops, which widens `statusCountsSchema` and changes what a
 * press is judged against.
 *
 * **Leaving `HOST_PRESS_FLOOR_MINOR_UNITS` as the mature constant, rather than
 * folding this into it, is deliberate.** The old constant is still what a
 * caller gets by omitting the third argument to `judgeAffordability`
 * (`tests/unit/ui-affordability.test.ts` pins several such calls), and a
 * default that silently varied with a session's furnished state would be
 * exactly the kind of defaulted safety-relevant parameter this corpus argues
 * against elsewhere (`SpendClass`, `rungFloorMinorUnits`'s own docblock). This
 * function is for the two call sites in `src/main.ts` that know which session
 * they are asking about and can say so.
 */
export function pressFloorMinorUnits(overdraftFloorMinorUnits: number, isFreshUnfurnishedPrison: boolean): number {
  return rungFloorMinorUnits('deliveries', overdraftFloorMinorUnits, isFreshUnfurnishedPrison);
}

/**
 * The one comparison, and it is deliberately the same shape as
 * `Treasury.canAfford`: `balance - charge >= floor`.
 *
 * Written as the subtraction rather than as `charge <= balance - floor` so that
 * it reads against the production line it echoes and a reviewer can compare
 * them without rearranging either.
 *
 * A charge that is not a non-negative safe integer is **refused**, which is the
 * other half of `canAfford`'s chain. The host composes its charges from the
 * catalogue so none should ever arrive, and refusing is the answer that cannot
 * send a command the schema would reject.
 */
export function judgeAffordability(
  chargeMinorUnits: number,
  balanceMinorUnits: number,
  overdraftFloorMinorUnits: number = HOST_PRESS_FLOOR_MINOR_UNITS,
): AffordabilityVerdict {
  const spendableMinorUnits = balanceMinorUnits - overdraftFloorMinorUnits;
  const wellFormed = Number.isSafeInteger(chargeMinorUnits) && chargeMinorUnits >= 0;
  // Well-formedness first, and the order is the sentence's: a `NaN` quantity is
  // a defect on this thread, and answering it with "the state will not carry
  // that" would be a statement about the prison's finances that is false.
  const refusal: AffordabilityRefusal | undefined = !wellFormed
    ? 'malformed-charge'
    : balanceMinorUnits - chargeMinorUnits < overdraftFloorMinorUnits
      ? 'past-the-floor'
      : undefined;
  return {
    refused: refusal !== undefined,
    refusal,
    chargeMinorUnits,
    balanceMinorUnits,
    spendableMinorUnits,
    // Only the money branch has a shortfall, and there it is strictly
    // positive -- see `AffordabilityVerdict.shortfallMinorUnits`. Written as
    // the same subtraction the comparison above makes rather than as
    // `Math.max(0, ...)` over every branch, so a reader can see that the two
    // agree by construction instead of by a clamp.
    shortfallMinorUnits: refusal === 'past-the-floor' ? chargeMinorUnits - spendableMinorUnits : 0,
  };
}

/**
 * **Whether a press for `chargeMinorUnits` would be refused, judged the
 * identical way `src/main.ts` judges the press itself.**
 *
 * This composes `judgeAffordability` with `pressFloorMinorUnits` exactly as
 * both call sites in `src/main.ts` do inline --
 * `judgeAffordability(total, viewModel.counts.treasuryMinorUnits,
 * pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
 * viewModel.counts.roomCapacity === 0))` -- so that a caller asking "would
 * this be refused" and the dispatch that later asks the real question cannot
 * drift into two approximations of one comparison.
 *
 * ## Why this exists as its own export (issue #772)
 *
 * A control that fires that command needs to answer the same question
 * *before* the player presses it, so that whether it can act stops being
 * discovered by pressing -- and `src/ui/hud/` may not import
 * `src/simulation/**` to reach `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` itself
 * (`AGENTS.md` boundary 1, pinned by `tests/unit/ui-hud-messages.test.ts`).
 * This module already may, for the reason `pressFloorMinorUnits`'s own
 * docblock gives, so it does the composing and a HUD panel gets back only the
 * verdict.
 *
 * **This answer is advice to a control, not a second gate, and the narrowing
 * of 2026-09-02 is what makes that true.** Both callers -- `paintBuyTotal`
 * (`src/ui/hud/build-panel.ts`) and `paintHire`
 * (`src/ui/hud/staff-panel.ts`) -- mark their button `aria-disabled` rather
 * than `disabled`, so a refused press still reaches `src/main.ts` and is
 * still answered there with the sentence naming the reason. This function
 * moving a control's *availability* and the pre-flight deciding the *press*
 * is the whole point of them sharing one comparison; if a caller ever used
 * this verdict to remove the press, the refusal it prevents would be the only
 * explanation the player was ever going to get.
 *
 * **This paragraph said "its one caller" and named only the Buy button.** That
 * was true for the hours between the narrowing and the Hire button being wired
 * the same way, and the count is what rotted rather than the argument -- the
 * shape of `AGENTS.md`'s own warning about sentences that state a tally. The
 * subject is now stated instead: two panels, one comparison, neither of them
 * taking a press away.
 *
 * `isFreshUnfurnishedPrison` is required rather than defaulted, matching
 * `pressFloorMinorUnits` and `deliveriesRungFloorMinorUnits` above and for
 * their same reason: a caller that forgot to pass it would silently get "not
 * fresh" back, which is the direction that reopens the exact defect PR #769
 * closed for the mature floor and #771's starter-rung amendment closed again
 * for a fresh one.
 */
export function pressAffordabilityVerdict(
  chargeMinorUnits: number,
  balanceMinorUnits: number,
  isFreshUnfurnishedPrison: boolean,
): AffordabilityVerdict {
  return judgeAffordability(
    chargeMinorUnits,
    balanceMinorUnits,
    pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, isFreshUnfurnishedPrison),
  );
}

/**
 * **What selling `quantity` units at `unitPriceMinorUnits` each would credit**
 * (ADR 0075 decision 3, invoked by ADR 0096 decision 3(b)) -- the Sell
 * control's own preview, composed the identical way
 * `ProcurementSystem.previewSellStock` is so the label a player reads and the
 * credit `sellStock` actually pays can never disagree.
 *
 * Exists here rather than in `src/ui/hud/build-panel.ts`, for
 * `pressAffordabilityVerdict`'s own reason: `src/ui/hud/` may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1, pinned by
 * `tests/unit/ui-hud-messages.test.ts`), and this module already may. There is
 * no floor to cross here and therefore no verdict -- a sale is never refused
 * for want of money, only for want of stock this thread has no published count
 * of, so the Sell control previews a figure rather than an availability the
 * way `pressAffordabilityVerdict` does for Buy.
 */
export function sellBackPreviewMinorUnits(unitPriceMinorUnits: number, quantity: number): number {
  return sellBackUnitPriceMinorUnits(unitPriceMinorUnits) * quantity;
}

/**
 * **What buying `quantity` units at `unitPriceMinorUnits` each would charge**
 * -- the Buy control's own preview, composed by calling the same function
 * `ProcurementSystem.purchase` sets `paidMinorUnits` from, so the label a
 * player reads and the money the press actually takes can never disagree.
 *
 * The buy half of the pair, and it is here for the reason its sell twin above
 * gives: `src/ui/hud/` may not import `src/simulation/**` (`AGENTS.md`
 * boundary 1, pinned by `tests/unit/ui-hud-messages.test.ts`), and this module
 * already may.
 *
 * **It replaces a multiplication the panel did itself** (issue #1160,
 * constitution article 4). `paintBuyTotal` in `src/ui/hud/build-panel.ts` read
 * `material.unitPriceMinorUnits * quantity`, which is the same rule written
 * twice, on two sides of the worker boundary, with nothing keeping them in
 * step. No figure moves: the rule is linear today and this is what makes it
 * one definition when it stops being.
 *
 * No verdict and no floor, exactly as the sell twin has none -- whether the
 * prison can *afford* this charge is `pressAffordabilityVerdict`'s question and
 * the Buy control already asks it separately.
 */
export function purchasePreviewMinorUnits(unitPriceMinorUnits: number, quantity: number): number {
  return purchaseChargeMinorUnits(unitPriceMinorUnits, quantity);
}
