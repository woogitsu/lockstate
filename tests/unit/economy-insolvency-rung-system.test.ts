import { describe, expect, it } from 'vitest';
import { SimulationEventLog } from '../../src/simulation/events';
import { InsolvencyRungSystem } from '../../src/simulation/economy/insolvency-rung-system';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
  Treasury,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy/treasury';
import { computeStandingPrisonConditions } from '../../src/simulation/presentation/status-strip-projection';
import type { SimulationContext } from '../../src/simulation/kernel/system';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * `InsolvencyRungSystem` and `computeStandingPrisonConditions` at the exact
 * boundary the owner's ruling of 2026-09-01 on issue #767 (ADR 0087 decision
 * 2's amendment) both read: `balance <= floor`, not `< floor` -- the shipped
 * rungs are themselves reachable balances (a payroll tick can land exactly on
 * one), so a strict inequality would silently miss the tick a balance is
 * driven to precisely a rung's own threshold. **This paragraph read "the
 * shipped −1,250 / −2,000 rungs" until the owner's ruling on #771 (2026-09-01,
 * ADR 0017's equalisation amendment); deliveries and construction now share
 * one shipped floor, −1,250, and the boundary this file pins is that shared
 * one plus the starter floor (−1,185) and the wage floor (−2,500) below.** No
 * existing test pins this boundary: `tests/integration/economy-payroll-loop.test.ts`
 * drives a real payroll schedule whose daily bill happens never to land the
 * balance exactly on either floor, so a `<=` vs `<` mutation there survives.
 * This file is the mutation-closing test for that gap.
 */
function context(tick: number): SimulationContext {
  return { tick } as SimulationContext;
}

/**
 * A `RoomInstanceRegistry` with one furnished cell, so `totalResidentCapacity`
 * reads greater than zero and `InsolvencyRungSystem` judges the *mature*
 * rungs -- what every test above the starter-rung section below assumes.
 * `register` is the real registry method, not a stub, so `residentCapacity: 1`
 * is exactly what `RoomCapacityResolver` would have written after a bed
 * completed.
 */
function matureRoomInstances(): RoomInstanceRegistry {
  const registry = new RoomInstanceRegistry();
  registry.register({
    instanceId: 'cell-1',
    roomCatalogId: 'room.cell',
    anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
    residentCapacity: 1,
    concurrentUseCapacity: 1,
    objectCapabilities: ['sleep-surface'],
  });
  return registry;
}

/** A `RoomInstanceRegistry` with nothing registered -- `totalResidentCapacity` is `0`, the "fresh, unfurnished" state. */
function freshRoomInstances(): RoomInstanceRegistry {
  return new RoomInstanceRegistry();
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
    const system = new InsolvencyRungSystem(treasury, events, matureRoomInstances());

    // Seeding tick: solvent, well above both rungs. Fires nothing.
    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));
    expect(events.since(0), 'the seeding call must announce nothing').toEqual([]);

    // Land exactly on the deliveries floor -- the boundary itself, not one
    // minor unit past it.
    //
    // **This asserted a single `deliveries-refused` event until the owner's
    // ruling on #771 (2026-09-01, ADR 0017's equalisation amendment) moved
    // `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` onto the same −1,250
    // this floor already is.** The deliveries floor is now also, exactly,
    // the construction floor, so landing on it crosses both at once -- the
    // same pairing `'treats a balance exactly at the construction floor as
    // crossed'` below already asserts from the other rung's name.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(
      events.since(0),
      'a balance exactly at the deliveries floor must be reported as refused, not treated as still solvent',
    ).toEqual([
      { sequence: 1, tick: 1, type: 'economy.deliveries-refused' },
      { sequence: 2, tick: 1, type: 'economy.construction-refused' },
    ]);

    // A tick that changes nothing must not repeat the notice.
    system.update(context(2));
    expect(events.since(0), 'holding at the same balance must not re-fire the crossing').toHaveLength(2);
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
    const system = new InsolvencyRungSystem(treasury, events, matureRoomInstances());

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
    const system = new InsolvencyRungSystem(treasury, events, matureRoomInstances());

    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));

    // **Both rungs fire together from here on, since the owner's ruling on
    // #771 (2026-09-01) equalised them** -- see the sibling test above for
    // the full explanation. Two crossings below, not one.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(events.since(0)).toHaveLength(2);

    // Recover strictly above the floor: neither rung is standing any more.
    //
    // **This used to assert `toHaveLength(2)`, "recovering above the floor
    // must not itself announce anything" -- true before
    // [#966](https://github.com/matmaxalez/lockstate/issues/966) site 1 gave
    // the `else` arm a call of its own, false now that it does.** The
    // recovery is exactly as real a transition as the crossing, and now says
    // so: two more events, `economy.deliveries-restored` and
    // `economy.construction-restored`.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + 1 });
    system.update(context(2));
    expect(events.since(0), 'recovering above the floor now announces the recovery, on both rungs').toHaveLength(4);

    // Cross again: a second, genuine crossing of both rungs at once.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(3));
    // **This asserted a four-element array before #966 site 1**:
    //
    // > ['economy.deliveries-refused', 'economy.construction-refused',
    // >  'economy.deliveries-refused', 'economy.construction-refused']
    //
    // The two recovery events land between the two crossings, in the same
    // `WATCHED_RUNGS` order every other pair here does.
    expect(events.since(0).map((event) => event.type)).toEqual([
      'economy.deliveries-refused',
      'economy.construction-refused',
      'economy.deliveries-restored',
      'economy.construction-restored',
      'economy.deliveries-refused',
      'economy.construction-refused',
    ]);
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
    const system = new InsolvencyRungSystem(treasury, events, matureRoomInstances());

    // No seeding tick at all yet: the very first `update()` call sees a
    // treasury already below both rungs (the shape of a restored session,
    // where `Treasury.restore` has already run before the kernel steps).
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS });
    system.update(context(0));
    expect(events.since(0), 'the first call is always a seeding call, however low the balance already is').toEqual([]);

    // Recovering and re-crossing afterward still fires normally -- seeding
    // only suppresses the very first observation, not the mechanism.
    //
    // **Both rungs, not only deliveries, since the owner's ruling on #771
    // (2026-09-01) equalised them** -- see the first test in this file for
    // the full explanation; this assertion predated that ruling and named
    // only the rung its own title mentions.
    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(1));
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(2));
    // **This asserted a two-element array before
    // [#966](https://github.com/matmaxalez/lockstate/issues/966) site 1**:
    //
    // > ['economy.deliveries-refused', 'economy.construction-refused']
    //
    // The `context(1)` recovery (seeded standing, both rungs, straight back to
    // `0`) now announces itself first, on both rungs, before the `context(2)`
    // re-crossing announces itself again.
    expect(events.since(0).map((event) => event.type)).toEqual([
      'economy.deliveries-restored',
      'economy.construction-restored',
      'economy.deliveries-refused',
      'economy.construction-refused',
    ]);
  });
});

/**
 * **The gap the pass that built #771 found and, out of its own brief, could
 * only report: this class predates `rungFloorMinorUnits`'s third argument.**
 * `INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS` (−1,185) is
 * *shallower* than the mature deliveries floor (−1,250) it replaces for a
 * fresh, unfurnished prison, so a balance between the two -- crossed on the
 * live starter floor, not yet crossed on the mature one this system used to
 * read unconditionally -- is the position that tells the two implementations
 * apart. −1,200 is such a balance: `-1_200 <= -1_185` is true and
 * `-1_200 <= -1_250` is false.
 */
describe('InsolvencyRungSystem: the starter rung (#771, fixed 2026-09-01)', () => {
  it('reports deliveries crossed for a fresh, unfurnished prison at a balance the mature floor would call solvent', () => {
    const treasury = new Treasury(0);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const system = new InsolvencyRungSystem(treasury, events, freshRoomInstances());

    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(0));
    expect(events.since(0), 'the seeding call must announce nothing').toEqual([]);

    // Between the starter floor (-1,185) and the mature one (-1,250): crossed
    // on the live, fresh-prison floor and nowhere near the mature one.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(1));
    expect(
      events.since(0),
      'a fresh, unfurnished prison at its own starter floor must be reported as refused',
    ).toEqual([{ sequence: 1, tick: 1, type: 'economy.deliveries-refused' }]);
  });

  it('moves back onto the mature rung the tick a bed is furnished, mid-session', () => {
    const treasury = new Treasury(0);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const events = new SimulationEventLog();
    const roomInstances = freshRoomInstances();
    const system = new InsolvencyRungSystem(treasury, events, roomInstances);

    // Seed fresh, at the starter floor: standing, but the seeding call
    // announces nothing (existing convention, exercised above).
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(0));
    expect(events.since(0)).toEqual([]);

    // Recover to a balance the starter floor calls solvent but the mature one
    // would not yet reach either, so the rung drops before the room is built.
    //
    // **This asserted `[]` before
    // [#966](https://github.com/matmaxalez/lockstate/issues/966) site 1**: the
    // starter-floor crossing seeded at `context(0)` now has a recovery to
    // announce, one event on `'deliveries'` (construction never stood, since
    // `-1,185` never reached its own, unmoved, `-1,250` floor).
    treasury.restore({ balanceMinorUnits: 0 });
    system.update(context(1));
    expect(events.since(0)).toEqual([{ sequence: 1, tick: 1, type: 'economy.deliveries-restored' }]);

    // A bed completes mid-session: `totalResidentCapacity` moves off zero the
    // same way `RoomCapacityResolver` would move it, live, with no new
    // `InsolvencyRungSystem` constructed and no flag set anywhere.
    roomInstances.register({
      instanceId: 'cell-1',
      roomCatalogId: 'room.cell',
      anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });

    // The old starter floor (-1,185) is now solvent territory -- the mature
    // -1,250 is what governs from this tick on.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(2));
    // **This asserted `[]` before #966 site 1 too** -- unaffected in what this
    // tick itself announces (nothing crosses or recovers here), but the
    // cumulative `events.since(0)` now carries the one recovery event from
    // `context(1)` above.
    expect(
      events.since(0),
      'furnished now, so -1,185 is above the mature floor and nothing has crossed',
    ).toEqual([{ sequence: 1, tick: 1, type: 'economy.deliveries-restored' }]);

    // The mature deliveries floor is also, exactly, the construction floor
    // since the owner's ruling on #771 (2026-09-01) equalised them, so both
    // fire together here -- the same pairing the first describe block's own
    // tests assert.
    treasury.restore({ balanceMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS });
    system.update(context(3));
    // **This asserted a two-element array before #966 site 1**:
    //
    // > [{ sequence: 1, tick: 3, type: 'economy.deliveries-refused' },
    // >  { sequence: 2, tick: 3, type: 'economy.construction-refused' }]
    //
    // Sequence numbers shift by one because the `context(1)` recovery above
    // is now sequence 1.
    expect(events.since(0), 'the mature floor now fires, exactly as a furnished prison always has').toEqual([
      { sequence: 1, tick: 1, type: 'economy.deliveries-restored' },
      { sequence: 2, tick: 3, type: 'economy.deliveries-refused' },
      { sequence: 3, tick: 3, type: 'economy.construction-refused' },
    ]);
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
        isFreshUnfurnishedPrison: false,
      }),
    ).toEqual([]);
  });

  /**
   * **This title said "and not the construction one yet" until the owner's
   * ruling on #771 (2026-09-01, ADR 0017's equalisation amendment) moved
   * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` onto the same −1,250 the
   * deliveries floor already is.** The two conditions are independent
   * predicates over the same balance (this function's own class comment
   * says so), so landing exactly on one floor now lands exactly on the other
   * too. Kept as a record of the boundary this test still proves -- `<=`, not
   * `<` -- with both members it now actually stands.
   */
  it('stands both treasury conditions at the shared floor, equalised by #771', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
        isFreshUnfurnishedPrison: false,
      }),
    ).toEqual(['treasury.construction-refused', 'treasury.deliveries-refused']);
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
        isFreshUnfurnishedPrison: false,
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
        isFreshUnfurnishedPrison: false,
      }),
    ).toEqual(['construction.unfunded', 'intake.no-place', 'treasury.construction-refused', 'treasury.deliveries-refused']);
  });

  /**
   * **The new argument, proven to move the boundary and not just to
   * typecheck.** −1,200 is between the starter deliveries floor (−1,185) and
   * the mature one (−1,250): a fresh, unfurnished prison there has crossed
   * its own live floor and a furnished one has not reached the mature one
   * yet. Construction is unaffected by freshness either way
   * (`STARTER_RUNG_FLOORS_MINOR_UNITS.construction` equals the mature
   * constant), so it never stands in either case here.
   */
  it('stands deliveries for a fresh, unfurnished prison at a balance a mature one would call solvent', () => {
    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
        isFreshUnfurnishedPrison: true,
      }),
    ).toEqual(['treasury.deliveries-refused']);

    expect(
      computeStandingPrisonConditions({
        treasuryMinorUnits: INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
        treasuryOverdraftFloorMinorUnits: -2_500,
        buildQueueUnfunded: false,
        waitingWithoutPlace: 0,
        isFreshUnfurnishedPrison: false,
      }),
    ).toEqual([]);
  });
});
