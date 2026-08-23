import { describe, expect, it } from 'vitest';
import { SIMULATION_SPEEDS } from '../../src/simulation/clock/fixed-step-clock';
import { clockControlSchema } from '../../src/simulation/protocol/types';
import { HUD_SPEEDS, isHudSpeed } from '../../src/ui/hud/view-model';

/**
 * The clock speed ladder is declared three times, and only one of those is
 * the authority.
 *
 * `SIMULATION_SPEEDS` (`src/simulation/clock/fixed-step-clock.ts`) is it.
 * Two declarations cannot import it and are re-declarations by necessity:
 * the protocol's `speedSchema` needs Zod literals, and `HUD_SPEEDS` sits in
 * `src/ui/hud/`, which `AGENTS.md` boundary 1 forbids from importing
 * `src/simulation/**` at all (enforced by
 * `tests/unit/ui-hud-messages.test.ts`).
 *
 * A re-declaration is legitimate; an *unpinned* one is not. This is the same
 * shape as `HUD_BUILD_EDGES`, which has had its pin in
 * `tests/unit/ui-hud-build-panel.test.ts` from the start.
 *
 * Before this file existed, adding `8` to `HUD_SPEEDS` left the whole suite
 * green and shipped a HUD offering a speed the protocol rejects at runtime --
 * at the worker boundary, as a Zod failure, which is the least useful place
 * for it to surface.
 */
describe('the clock speed ladder is declared once and mirrored under test', () => {
  it('gives the HUD exactly the simulation members, in the same order', () => {
    expect([...HUD_SPEEDS]).toEqual([...SIMULATION_SPEEDS]);
  });

  it('accepts every simulation speed over the worker protocol', () => {
    for (const speed of SIMULATION_SPEEDS) {
      expect(
        clockControlSchema.safeParse({ mode: 'running', speed }).success,
        `the protocol must accept speed ${speed}`,
      ).toBe(true);
    }
  });

  /**
   * The direction that actually catches a drifting ladder. Adding a speed to
   * one declaration and not the protocol is the failure mode; this asserts
   * the protocol accepts *nothing beyond* the authority, so the two cannot
   * disagree in either direction.
   */
  it('rejects any speed the simulation does not declare', () => {
    const declared = new Set<number>(SIMULATION_SPEEDS);
    // Neighbours of the real ladder, its plausible next member, and the
    // shapes a caller gets wrong: zero, negative, fractional, non-finite.
    for (const candidate of [0, 3, 5, 6, 8, 16, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(declared.has(candidate), `${candidate} must not be a declared speed`).toBe(false);
      expect(
        clockControlSchema.safeParse({ mode: 'running', speed: candidate }).success,
        `the protocol must reject speed ${candidate}`,
      ).toBe(false);
    }
  });

  it('agrees with the HUD guard that decides which speeds a control may offer', () => {
    for (const speed of SIMULATION_SPEEDS) expect(isHudSpeed(speed)).toBe(true);
    for (const candidate of [0, 3, 8]) expect(isHudSpeed(candidate)).toBe(false);
  });

  it('carries a paused control with no speed at all', () => {
    // Paused is not speed zero: the discriminated union has no `speed` on
    // that branch, and `.strict()` means supplying one is an error rather
    // than an ignored extra.
    expect(clockControlSchema.safeParse({ mode: 'paused' }).success).toBe(true);
    expect(clockControlSchema.safeParse({ mode: 'paused', speed: 1 }).success).toBe(false);
  });
});
