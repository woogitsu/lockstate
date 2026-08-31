import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../simulation/economy';

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
 * The status channel publishes the *balance* and no floor
 * (`statusCountsSchema`), so the host has nothing to read one from and adding a
 * field would put a second copy of a constant on the wire. The default is the
 * same constant the composition root applies to the `Treasury`, so both sides
 * of the boundary derive from one definition -- and it stays a parameter so
 * that the boundary cases below can be driven at a floor of `0`, which is what
 * a session had before the ruling and what a bare `new Treasury()` still has.
 */
export interface AffordabilityVerdict {
  /** Whether the charge should be refused before the command is sent. */
  readonly refused: boolean;
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
  overdraftFloorMinorUnits: number = TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
): AffordabilityVerdict {
  const spendableMinorUnits = balanceMinorUnits - overdraftFloorMinorUnits;
  const wellFormed = Number.isSafeInteger(chargeMinorUnits) && chargeMinorUnits >= 0;
  return {
    refused: !wellFormed || balanceMinorUnits - chargeMinorUnits < overdraftFloorMinorUnits,
    chargeMinorUnits,
    balanceMinorUnits,
    spendableMinorUnits,
  };
}
