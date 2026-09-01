import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **ADR 0017 decision 8's insolvency ladder, walked in one run.**
 *
 * Decision 8 is Accepted and it promises an *order*: at a negative balance the
 * state stops paying for discretionary things *"deliveries refused first, then
 * construction halted, then staff unpaid"*. #703 ruling A's standing overdraft
 * inverted it -- `Treasury.canAfford` was one comparison against one floor, so
 * rungs 1 and 2 moved together while `PayrollSystem`'s `Math.min(due, balance)`
 * pinned rung 3 at a balance of zero, which fires *first*. ADR 0083 §2 recorded
 * that an amendment was owed and that choosing it was the owner's.
 *
 * **The owner's ruling 19 of 2026-08-31 was that amendment's source**:
 * *"Dać szczeblom własne progi wewnątrz debetu"* -- give the rungs their own
 * thresholds inside the overdraft -- at **-1,250**, **-2,000** and **-2,500**.
 * It gave the ladder three depths, and in doing so opened a 750-wide band
 * between the first two in which a purchase the shop refused was nevertheless
 * funded for a queued build order needing the identical materials -- filed as
 * [#771](https://github.com/matmaxalez/lockstate/issues/771), reproduced below,
 * and measured there as **ten wall segments, 800 spent, all going through
 * silently** at a balance the shop had already refused a 40-minor-unit brick
 * at.
 *
 * **The owner's ruling on #771 (2026-09-01) closes that band**: *"Equalise the
 * rungs: buying and building stop at the same place"*, put to the owner with
 * the cost stated plainly -- that this narrows what a standing queue can still
 * finish -- and accepted anyway. Both rulings are recorded at
 * `docs/adr/0017-money-primary-resource-model.md` ("Amendment, 2026-09-01",
 * both of them), **Accepted**.
 *
 * **The ladder decision 8 promises is therefore two steps deep today, not
 * three**: deliveries and construction are refused *together*, at the same
 * balance, and staff go unpaid last, at the floor. This file's title keeps the
 * word "ladder" because decision 8's order still holds -- discretionary
 * spending stops before wages do -- and the rung count it asserts is now two,
 * not three.
 *
 * ## What this file is, and why it is not covered by the files it sits beside
 *
 * `tests/unit/economy-treasury.test.ts` pins the arithmetic of one rung at a
 * time against a `Treasury` built by hand.
 * `tests/integration/economy-payroll-loop.test.ts` watches one prison sink
 * through both under a real income line and a real wage bill, and reads
 * the rungs rather than pressing them.
 *
 * **This file presses them.** Every rung here is provoked by the thing a rung
 * is *about*: a `PurchaseMaterials` the player pressed, a `PlaceBuildOrder` the
 * queue has to fund, and a payday nobody can decline. What it asserts is the
 * one property decision 8 states and no single-rung test can: that at each
 * depth the rungs that have fired are a *prefix* of the ladder, and the ones
 * below it are still working -- and, since #771, that the two discretionary
 * rungs never disagree about a shared balance.
 *
 * ## Why the walk is driven by `Treasury.spend(…, 'wages')`
 *
 * Because nothing else can reach these depths. A press and the queue both stop
 * at -1,250, so the only class that can put a balance anywhere past it is the
 * wage rung -- which is what a payday does, and `PayrollSystem` calls exactly
 * this method. Positioning with it rather than by running in-game days keeps
 * every figure below a literal instead of the output of an income model.
 *
 * ## Every figure is a literal
 *
 * `item.brick` is 40, a `wall-brick` order takes two of them, and a guard's
 * day is 80. The thresholds are asserted against the constants once, at
 * the top, and used as literals after that: a threshold derived from the code
 * under test would agree with any threshold.
 */

const SEED = 0x1adde7;
const BRICK = 'item.brick';
const BRICK_PRICE = 40;
const WALL = 'wall-brick';
const WALL_COST = 2 * BRICK_PRICE;
const GUARD = 'staff-role.guard';
const GUARD_DAY = 80;
const ARRIVAL = { x: 16, y: 16 } as const;
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL = 'room.cell';
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;

function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Puts the balance exactly on `balance`, at the only rung that can reach it. */
function sinkTo(runtime: SimulationRuntime, balance: number): void {
  const amount = runtime.treasury.balanceMinorUnits - balance;
  expect(amount, 'the walk only ever goes down').toBeGreaterThan(0);
  expect(runtime.treasury.spend(amount, 'wages')).toBe(true);
  expect(runtime.treasury.balanceMinorUnits).toBe(balance);
}

/**
 * A prison with one guard on the books and one furnished cell, so there is a
 * wage bill to leave unpaid and nothing else that spends -- no prisoners, no
 * income.
 *
 * **The furnished cell is new, since the owner's second ruling on #771
 * (2026-09-01), and this docblock used to say "and nothing else -- no cells".**
 * A prison that never furnishes a sleep surface is "fresh, unfurnished"
 * (`RoomInstanceRegistry.totalResidentCapacity === 0`) for its whole life, and
 * this file's whole subject -- that `'deliveries'` and `'construction'` share
 * one threshold -- is true only of the *mature* rungs. The starter rung
 * deliberately reopens the gap between them for a fresh prison (reserving one
 * plank's worth of room in `'construction'` that `'deliveries'`/`'hiring'`
 * cannot reach), which is a second, narrower and equally deliberate finding
 * with its own test (`tests/integration/economy-liquidity-hard-lock.test.ts`,
 * `tests/unit/economy-treasury.test.ts`) -- not a contradiction of this file's,
 * but a different regime this file is not about. Furnishing one bed here
 * takes the fixture out of that regime for the rest of its life, so the "one
 * comparison, one rung" property below is measured where it actually holds.
 * `sinkTo` computes every position as a delta off whatever the balance
 * happens to be, so the bed's own 65-minor-unit cost changes nothing it
 * targets.
 */
function prisonWithOneGuard(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  send(runtime, 'zone', { type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
  send(runtime, 'bed', { type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', ...BED_TILE });
  // 300 ticks, not 5,000: comfortably inside `DAY_LENGTH_TICKS` (2,400), so
  // furnishing the cell cannot itself consume `payday`'s first, absolute-tick
  // day boundary below it. Measured: a fresh plank order with nothing else
  // queued completes in 151 ticks.
  stepTo(runtime, runtime.kernel.tick + 300);
  expect(runtime.construction.getOrder('bed-0')?.state, 'the fixture must actually furnish the cell it stands on').toBe(
    'completed',
  );
  expect(
    runtime.prisoners.roomInstances.totalResidentCapacity,
    'furnished: no longer "fresh, unfurnished", for the rest of this runtime\'s life',
  ).toBeGreaterThan(0);

  send(runtime, 'hire', { type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL });
  expect(runtime.refusals.count, 'the fixture must be able to hire the guard it hires').toBe(0);
  expect(runtime.payroll.dailyWageBillMinorUnits()).toBe(GUARD_DAY);
  return runtime;
}

/** Whether the press was refused, and whether it took any money. */
function pressBuy(runtime: SimulationRuntime, id: string, quantity = 1): boolean {
  const before = runtime.refusals.count;
  const balanceBefore = runtime.treasury.balanceMinorUnits;
  send(runtime, id, { type: 'PurchaseMaterials', orderId: id, itemId: BRICK, quantity });
  const refused = runtime.refusals.count > before;
  if (refused) {
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits, 'a refusal must not take a minor unit').toBe(balanceBefore);
  }
  return !refused;
}

/** Whether the queue funded the wall order it was handed. */
function queueFunded(runtime: SimulationRuntime, id: string, x: number): boolean {
  send(runtime, id, { type: 'PlaceBuildOrder', orderId: id, definitionId: WALL, x, y: 20 });
  return runtime.justInTimeMaterials.lastReport.unfunded.length === 0;
}

/** What one payday takes, and what it leaves owed. */
function payday(runtime: SimulationRuntime, day: number): { paid: number; owed: number } {
  const before = runtime.treasury.balanceMinorUnits;
  const owedBefore = runtime.payroll.unpaidWagesMinorUnits;
  stepTo(runtime, DAY_LENGTH_TICKS * day);
  return {
    paid: before - runtime.treasury.balanceMinorUnits,
    owed: runtime.payroll.unpaidWagesMinorUnits - owedBefore,
  };
}

/** One `simulation/status-counts` publication, carrying whatever the log last recorded. */
function publication(runtime: SimulationRuntime): WorkerToMainMessage {
  const refusal = runtime.refusals.last;
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-under-test',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
      ...(refusal === undefined ? {} : { refusal }),
    },
  } as WorkerToMainMessage;
}

describe('the thresholds ruling 19 gives ADR 0017 decision 8`s rungs, equalised by the owner`s ruling on #771', () => {
  it('is the owner`s numbers -- deliveries and construction equalised, wages at the floor', () => {
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS, 'deliveries refused below -1,250').toBe(-1_250);
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS, 'construction halted below -1,250, the same rung').toBe(
      -1_250,
    );
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, 'wages unpaid below -2,500, which is the floor').toBe(-2_500);

    /*
     * The equality, asserted on the numbers themselves and not just on their
     * value -- this is what #771 asked for and what the previous version of
     * this file asserted the opposite of (`toBeGreaterThan`). A future edit
     * that gives construction a literal of its own again, even one that
     * happens to equal -1,250, is still the shape #771 exists to forbid: see
     * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`'s own definition.
     */
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS).toBe(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS);
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS).toBeGreaterThan(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
  });

  it('is what a shipped session actually applies, on every class', () => {
    const runtime = createNewSimulationRuntime(SEED);

    expect(runtime.treasury.floorFor('deliveries')).toBe(-1_250);
    expect(runtime.treasury.floorFor('hiring'), 'not a rung of its own: shares the deliveries/construction rung').toBe(
      -1_250,
    );
    expect(runtime.treasury.floorFor('construction'), 'equalised onto the same rung as deliveries').toBe(-1_250);
    expect(runtime.treasury.floorFor('wages'), 'the last rung is the floor, not a second copy of it').toBe(
      runtime.treasury.overdraftFloorMinorUnits,
    );
  });
});

describe('#771: the same two bricks, bought or drawn, agree at every balance', () => {
  /**
   * **The reproduction, driven by arithmetic rather than by the kernel
   * first**, so the property is checked at every balance in and around the
   * 750-wide band ruling 19 opened, not just at the one balance #771 happened
   * to measure. `WALL_COST` (80, two bricks) is asked of both rungs so the
   * *amount* is identical and the only thing that can make the two answers
   * differ is the floor -- which, before this change, it was.
   *
   * This is the test that is red on `origin/feat/name-the-rung-on-screen`
   * (`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS = -2_000`) and green
   * after the equalisation: at every balance from -1,171 to -2,000 inclusive,
   * the old code answered `true` for `'construction'` and `false` for
   * `'deliveries'` -- the exact defect #771 reports.
   */
  it('canAfford agrees for deliveries and construction, for the identical charge, at every balance from -1,170 to -2,001', () => {
    for (let balance = -1_170; balance >= -2_001; balance -= 1) {
      const runtime = createNewSimulationRuntime(SEED);
      runtime.treasury.restore({ balanceMinorUnits: balance });
      const deliveries = runtime.treasury.canAfford(WALL_COST, 'deliveries');
      const construction = runtime.treasury.canAfford(WALL_COST, 'construction');
      expect(construction, `at ${String(balance)}: buying and building the same two bricks must agree`).toBe(
        deliveries,
      );
    }
  });

  /**
   * **The reproduction as #771 played it**: a real `PurchaseMaterials` press
   * for two bricks, and a real `PlaceBuildOrder` for a wall that needs the
   * same two bricks with nothing in stock, at a balance inside the band the
   * old rungs left open (-1,300 -- past the deliveries rung, short of the old
   * construction one). Two separate prisons, because a press and a queued
   * order cannot both be the "first" spend at the same balance in one run;
   * what matters is that the *balance*, the *item* and the *quantity* are
   * identical between them.
   */
  it('refuses a Buy press for two bricks and a wall order needing two bricks alike, at -1,300', () => {
    const BALANCE = -1_300;
    expect(BALANCE, 'inside the band ruling 19 left open: past -1,250, short of the old -2,000').toBeLessThan(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
    );
    expect(BALANCE).toBeGreaterThan(-2_000);

    const shop = prisonWithOneGuard();
    sinkTo(shop, BALANCE);
    expect(pressBuy(shop, 'buy-two-bricks', 2), 'the shop refuses the two bricks').toBe(false);

    const site = prisonWithOneGuard();
    sinkTo(site, BALANCE);
    expect(
      queueFunded(site, 'wall-needing-two-bricks', 2),
      'and a wall order needing the same two bricks, from empty stock, is refused with it -- not funded silently',
    ).toBe(false);
    expect(site.treasury.balanceMinorUnits, 'a refused order must not take a minor unit').toBe(BALANCE);
    expect(site.justInTimeMaterials.lastReport.unfunded).toEqual([
      { itemId: BRICK, quantity: 2, costMinorUnits: WALL_COST },
    ]);
  });
});

describe('ADR 0017 decision 8`s ladder, pressed in one run', () => {
  it('refuses deliveries and construction together, then leaves wages unpaid last', () => {
    const runtime = prisonWithOneGuard();
    let wall = 0;

    /*
     * **Position 1: -1,210, one brick above the shared rung.** Everything
     * works, which is the control: without it every assertion below could be
     * satisfied by a prison that never worked at all.
     */
    sinkTo(runtime, -1_210);
    expect(pressBuy(runtime, 'buy-above-rung'), 'a delivery that lands exactly on the rung is bought').toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(-1_250);
    stepTo(runtime, runtime.kernel.tick + PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    /*
     * **Position 2: -1,251, one minor unit past the shared rung.**
     *
     * This is #771's own case, walked rather than probed directly: one brick
     * is already in stock from position 1, so the wall order below is short
     * by exactly one brick -- the same 40-minor-unit charge a Buy press
     * would make. Before the equalisation this order was funded here while
     * the press above it was refused; now both are refused, together, which
     * is what "buying and building stop at the same place" means as a run
     * rather than as a sentence.
     */
    sinkTo(runtime, -1_251);
    expect(pressBuy(runtime, 'buy-past-rung'), 'the delivery is refused').toBe(false);
    expect(
      queueFunded(runtime, `wall-${String(wall)}`, 2 + wall),
      'and so is the wall order, needing the identical 40 the press was just refused',
    ).toBe(false);
    expect(runtime.justInTimeMaterials.lastReport.unfunded, 'the queue says what it could not buy').toEqual([
      { itemId: BRICK, quantity: 1, costMinorUnits: BRICK_PRICE },
    ]);
    expect(
      runtime.construction.getOrder(`wall-${String(wall)}`)?.state,
      'an unfunded order is kept, not failed -- ADR 0017 decision 8 is a state, not a loss condition',
    ).not.toBe('failed');
    expect(runtime.treasury.balanceMinorUnits, 'a halted queue takes nothing').toBe(-1_251);
    wall += 1;
    expect(payday(runtime, 1), 'wages are still paid in full, far above the floor').toEqual({
      paid: GUARD_DAY,
      owed: 0,
    });

    /*
     * **Position 3: -2,441, part of one guard-day above the floor.** The
     * payday takes the 59 the floor leaves and owes the other 21 -- ADR
     * 0049's arrears, which neither ruling touches. Deliveries and
     * construction are both still refused, exactly as they were 1,191 minor
     * units higher up -- there is no depth left between them at which one
     * fires and the other does not.
     */
    sinkTo(runtime, -2_441);
    expect(pressBuy(runtime, 'buy-near-floor'), 'still refused').toBe(false);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'still halted').toBe(false);
    wall += 1;
    expect(payday(runtime, 2), 'the floor fires: what it leaves is paid and the rest is owed').toEqual({
      paid: 59,
      owed: GUARD_DAY - 59,
    });
    expect(runtime.treasury.balanceMinorUnits, 'exactly the floor').toBe(-2_500);

    /*
     * **Position 4: at the floor.** Every rung has fired. The payday takes
     * nothing at all, the balance does not move again, and the whole bill is
     * owed -- which is what makes the floor the last rung.
     */
    expect(payday(runtime, 3)).toEqual({ paid: 0, owed: GUARD_DAY });
    expect(runtime.treasury.balanceMinorUnits, 'no payday may pass the floor').toBe(-2_500);
    expect(pressBuy(runtime, 'buy-at-the-floor'), 'still refused').toBe(false);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'still halted').toBe(false);

    /*
     * **And the ladder is a prefix at every depth, which is the property
     * decision 8 states -- and the two discretionary rungs never disagree,
     * which is the property #771 adds.** Read back off the treasury rather
     * than off the walk above, so a rung that fired in the wrong order, or
     * came apart from its twin, would fail here as well.
     */
    for (const balance of [-1_210, -1_251, -2_441, -2_500]) {
      const probe = createNewSimulationRuntime(SEED);
      probe.treasury.restore({ balanceMinorUnits: balance });
      const deliveriesFired = !probe.treasury.canAfford(BRICK_PRICE, 'deliveries');
      const constructionFired = !probe.treasury.canAfford(BRICK_PRICE, 'construction');
      const wagesFired = !probe.treasury.canAfford(1, 'wages');

      expect(constructionFired, `at ${String(balance)}: construction must agree with deliveries`).toBe(
        deliveriesFired,
      );
      /*
       * The prefix property, stated as the implication it is: wages firing
       * implies the discretionary rungs above it have fired too. A ladder
       * whose floor fired before its discretionary rungs fails here at the
       * balance between them.
       */
      if (wagesFired) {
        expect(deliveriesFired, `at ${String(balance)}: wages fired, so deliveries must have too`).toBe(true);
      }
    }
  });

  /**
   * **What a prison at -1,300 is *told* when its build queue stalls** -- the
   * owner's ruling of 2026-09-01 on ADR 0017's amendment §5, kept faithful to
   * #771's own equalisation. The events (a stalled queue, a refused press)
   * are still distinguishable even though they now share a threshold: the
   * split in `SpendClass` is what `reportMaterialsFunding` still reads to
   * choose the sentence, and this proves the sentence choice, not the
   * threshold, is what makes the two tellable apart.
   *
   * Driven the whole way: a real command through the real kernel, the real
   * `RefusalLog`, the real `simulation/status-counts` publication, the real
   * `REFUSAL_LABEL_KEYS` table and the bundled English. Nothing here reads a
   * sentence off the thing that chose it.
   *
   * -1,300 is chosen for a property, not for the round number: it is past the
   * shared rung, so a queued order and a Buy press are refused at exactly the
   * same balance -- which is the range #771 found had no sentence of its own
   * for the queue at all before the owner's ruling of 2026-09-01 shipped one.
   */
  it('tells a prison at -1,300 that its build queue stalled, and not that deliveries are refused', () => {
    const runtime = prisonWithOneGuard();
    sinkTo(runtime, -1_300);
    expect(runtime.refusals.count, 'nothing has been refused yet').toBe(0);

    expect(
      queueFunded(runtime, 'wall-a', 2),
      'a wall order from empty stock costs 80, and -1,300 is already past the shared rung',
    ).toBe(false);
    expect(runtime.refusals.last?.reason, 'construction, named on the wire').toBe('construction.materials-unfunded');

    const alerts = hudAlertsFromWorkerMessage(publication(runtime));
    expect(alerts).toEqual([
      { id: 'refusal-1', labelKey: 'hud.alert.refusal.construction.materials-unfunded', severity: 'warning' },
    ]);

    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const stallSentence = localizer.format(alerts![0]!.labelKey);
    expect(stallSentence, 'the key resolved to real text and not to its own dotted self').toBe(
      'The build queue is stalled — no more materials until the state pays what it owes.',
    );

    /*
     * **And it is not the delivery sentence, which is the whole point.**
     * Asserted against the two keys a *Buy* press reaches rather than against
     * a transcription, so that a future edit collapsing the sentences back
     * onto one fails here whatever the collapsed wording turns out to be.
     */
    expect(stallSentence).not.toBe(localizer.format('hud.alert.refusal.purchase.insufficient-funds'));
    expect(stallSentence).not.toBe(localizer.format('hud.refusal.purchase-materials-past-floor'));

    /*
     * The other half of the same run: at this same balance a press really
     * does get the delivery sentence. Without this the assertion above would
     * hold for a prison in which the delivery rung was unreachable, and the
     * two would be distinguishable only because one of them never fires.
     */
    expect(pressBuy(runtime, 'buy-at-minus-1300'), 'the press is refused too, at the same balance').toBe(false);
    const pressAlerts = hudAlertsFromWorkerMessage(publication(runtime));
    expect(localizer.format(pressAlerts![0]!.labelKey)).toBe(
      'Nothing was bought — deliveries are refused until the state pays what it owes.',
    );
  });

  it('has no rungs at all in a prison with no facility open, which is every bare `new Treasury`', () => {
    /*
     * The other direction, and it is what keeps the ladder *inside* the
     * overdraft as ruling 19's own words say. `Treasury.floorFor` clamps every
     * rung up to the treasury's floor, so at a floor of `0` all four classes are
     * the same comparison and a prison that has no facility behaves exactly as
     * it did before ruling 19, to the minor unit.
     */
    const runtime = createNewSimulationRuntime(SEED);
    runtime.treasury.setOverdraftFloor(0);

    for (const spendClass of ['deliveries', 'construction', 'wages', 'hiring'] as const) {
      expect(runtime.treasury.floorFor(spendClass), spendClass).toBe(0);
    }

    sinkTo(runtime, 40);
    expect(runtime.treasury.canAfford(40, 'deliveries'), 'a prison may spend its last coin, on any rung').toBe(true);
    expect(runtime.treasury.canAfford(41, 'deliveries')).toBe(false);
    expect(runtime.treasury.canAfford(41, 'wages')).toBe(false);
  });
});
