import { describe, expect, it } from 'vitest';
import { SimulationEventLog } from '../../src/simulation/events';
import { InsolvencyRungSystem } from '../../src/simulation/economy/insolvency-rung-system';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  Treasury,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy/treasury';
import { computeStandingPrisonConditions } from '../../src/simulation/presentation/status-strip-projection';
import type { SimulationContext } from '../../src/simulation/kernel/system';

/**
 * `InsolvencyRungSystem` and `computeStandingPrisonConditions` at the exact
 * boundary the owner's ruling of 2026-09-01 on issue #767 (ADR 0087 decision
 * 2's amendment) both read: `balance <= floor`, not `< floor` -- the shipped
 * −1,250 / −2,000 rungs are themselves reachable balances (a payroll tick can
 * land exactly on one), so a strict inequality would silently miss the tick a
 * balance is driven to precisely a rung's own threshold. No existing test
 * pins this boundary: `tests/integration/economy-payroll-loop.test.ts` drives
 * a real payroll schedule whose daily bill happens never to land the balance
 * exactly on either floor, so a `<=` vs `<` mutation there survives. This file
 * is the mutation-closing test for that gap.
 */
function context(tick: number): SimulationContext {
  return { tick } as SimulationContext;
}

describe('InsolvencyRungSystem: the boundary is inclusive, and a crossing fires once', () => {
  it('treats a balance exactly at the deliveries floor as crossed, not only strictly below it', () => {
    const treasury = new Treasury(0);
    // The shipped facility, opened exactly as `createNewSimulationRuntime`
    // opens it: with no facility open the clamp in `rungFloorMinorUnits`
    // raises the effective floor to `0` for every class (`Treasury.floorFor`'s
    // own comment), so a rung is only reachable once the overdraft actually
    // exists.
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const system = new InsolvencyRungSystem(treasury, events);

    // Seeding tick: solvent, well above both rungs. Fires nothing.
    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));
    expect(events.since(0), 'the seeding call must announce nothing').toEqual([]);

    // Land exactly on the deliveries floor -- the boundary itself, not one
    // minor unit past it.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(
      events.since(0),
      'a balance exactly at the deliveries floor must be reported as refused, not treated as still solvent',
    ).toEqual([{ sequence: 1, tick: 1, type: 'economy.deliveries-refused' }]);

    // A tick that changes nothing must not repeat the notice.
    system.update(context(2));
    expect(events.since(0), 'holding at the same balance must not re-fire the crossing').toHaveLength(1);
  });

  it('treats a balance exactly at the construction floor as crossed', () => {
    const treasury = new Treasury(0);
    // The shipped facility, opened exactly as `createNewSimulationRuntime`
    // opens it: with no facility open the clamp in `rungFloorMinorUnits`
    // raises the effective floor to `0` for every class (`Treasury.floorFor`'s
    // own comment), so a rung is only reachable once the overdraft actually
    // exists.
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const system = new InsolvencyRungSystem(treasury, events);

    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));

    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(events.since(0).map((event) => event.type)).toEqual([
      'economy.deliveries-refused',
      'economy.construction-refused',
    ]);
  });

  it('re-fires on a second crossing after recovering above the rung (edge detection, not a latch)', () => {
    const treasury = new Treasury(0);
    // The shipped facility, opened exactly as `createNewSimulationRuntime`
    // opens it: with no facility open the clamp in `rungFloorMinorUnits`
    // raises the effective floor to `0` for every class (`Treasury.floorFor`'s
    // own comment), so a rung is only reachable once the overdraft actually
    // exists.
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const system = new InsolvencyRungSystem(treasury, events);

    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));

    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(events.since(0)).toHaveLength(1);

    // Recover strictly above the floor: the rung is no longer standing.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + 1 });
    system.update(context(2));
    expect(events.since(0), 'recovering above the floor must not itself announce anything').toHaveLength(1);

    // Cross again: a second, genuine crossing.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(3));
    expect(events.since(0).map((event) => event.type)).toEqual(['economy.deliveries-refused', 'economy.deliveries-refused']);
  });

  it('seeds silently from a balance already below a rung, so a restored session is not re-told a fact that was already true', () => {
    const treasury = new Treasury(0);
    // The shipped facility, opened exactly as `createNewSimulationRuntime`
    // opens it: with no facility open the clamp in `rungFloorMinorUnits`
    // raises the effective floor to `0` for every class (`Treasury.floorFor`'s
    // own comment), so a rung is only reachable once the overdraft actually
    // exists.
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const system = new InsolvencyRungSystem(treasury, events);

    // No seeding tick at all yet: the very first `update()` call sees a
    // treasury already below both rungs (the shape of a restored session,
    // where `Treasury.restore` has already run before the kernel steps).
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS });
    system.update(context(0));
    expect(events.since(0), 'the first call is always a seeding call, however low the balance already is').toEqual([]);

    // Recovering and re-crossing afterward still fires normally -- seeding
    // only suppresses the very first observation, not the mechanism.
    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(1));
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(2));
    expect(events.since(0).map((event) => event.type)).toEqual(['economy.deliveries-refused']);
  });
});

describe('computeStandingPrisonConditions: the treasury boundary is inclusive', () => {
  it('does not stand a rung one minor unit above its floor', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + 1,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
      }),
    ).toEqual([]);
  });

  it('stands the deliveries condition at exactly its floor, and not the construction one yet', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
      }),
    ).toEqual(['treasury.deliveries-refused']);
  });

  /**
   * Issue #767's own measurement, reproduced directly against the pure
   * function rather than only through a full integration run: one balance,
   * two independent predicates, both true at once, in canonical ascending-id
   * order.
   */
  it('stands both treasury conditions at once for the −1,220 → −2,180 case, in canonical order', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: -2_180,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
      }),
    ).toEqual(['treasury.construction-refused', 'treasury.deliveries-refused']);
  });

  it('stands all four members at once when every predicate holds, in canonical ascending-id order', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: -2_180,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: true,
        waitingWithoutPlace: 3,
      }),
    ).toEqual(['construction.unfunded', 'intake.no-place', 'treasury.construction-refused', 'treasury.deliveries-refused']);
  });
});
