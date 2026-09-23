import { describe, expect, it } from 'vitest';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../../src/simulation/economy';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import { reportedCounts } from '../helpers/hud-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **The exact defect a played session found and reported rather than patched
 * on 2026-09-01: the FUNDS badge overstating spendable room during the
 * starter exemption.**
 *
 * ## What was played
 *
 * A fresh, unfurnished prison (a zoned cell, no bed built yet) bought 654
 * bricks at 40 each, landing the treasury at **−1,160**. At that balance the
 * live floor `judgeAffordability` and `Treasury.spend` both actually enforce
 * is the *starter* deliveries rung
 * (`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`, −1,185, the owner's
 * second ruling on #771), not the mature −1,250 -- so only 25 of room remains,
 * and a 65-minor-unit plank is refused. `overdraftRemaining` and
 * `overdraftTone` in `src/ui/hud/projection.ts` computed against the mature
 * rung regardless, so the badge read **"90 left"**: `AGENTS.md`'s fourth
 * exclusion, and the exact defect PR #769 closed for the mature floor,
 * reopened here for a case that ruling never named.
 *
 * ## Why this is the whole path, not a synthetic input
 *
 * `HudCountsViewModel` is built the one way it is ever built outside a
 * fixture: a real command through the real kernel, the real treasury, the
 * real `simulation/status-counts` publication and `hudCountsFromWorkerMessage`
 * -- so `roomCapacity` is the live figure a played session would actually
 * publish, not a value chosen to make the case land.
 *
 * That clause read *"`roomCapacity` is the live
 * `RoomInstanceRegistry.totalResidentCapacity` a played session would actually
 * publish"* until 2026-09-15, and the identification is false in general even
 * though it holds for this fixture. `roomCapacity` is summed over
 * `collectRoomInstances`, a fan-out over the content room registry's catalogue
 * ids (`docs/HUD_PROJECTIONS.md` gap 15); `totalResidentCapacity` walks the
 * registry's own map. They coincide here because every instance this fixture
 * registers is a `room.cell`. **So this file does not gate the divergence**:
 * both assertions below read `0`, on a prison that is fresh under either
 * definition, which is the one case where they cannot disagree. The gate that
 * would notice was described in ADR 0017's "Amendment, 2026-09-01" §2 and is
 * now built:
 * `tests/integration/economy-fresh-unfurnished-prison-definition.test.ts`,
 * which registers a room instance under an id this build's catalogue does not
 * define. This file is unchanged by that fix and is meant to be -- it is the
 * shipped-catalogue case, where the two definitions coincide, and the `0`
 * below still comes off the same live wire message. `docs/TESTING.md`'s rule against a fixture supplying both sides
 * of a comparison holds here for the same reason it holds in
 * `tests/integration/construction-just-in-time-materials.test.ts`, whose own
 * `-1,160` this file's setup is drawn from (`654 bricks, not 656 ... 25,000 -
 * 654 x 40 = -1,160`).
 */

const SEED = 0x771ba7;
const BRICK = 'item.brick';
const PLANK = 'item.wood-plank';
const BRICK_PRICE = procurableMaterial(BRICK)!.unitPriceMinorUnits;
const PLANK_PRICE = procurableMaterial(PLANK)!.unitPriceMinorUnits;
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;

function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

/** A walled, zoned cell with no bed built -- fresh and unfurnished for its whole life so far. */
function prisonWithACell(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  return runtime;
}

/** One `simulation/status-counts` publication, exactly as the worker would send it this tick. */
function publication(runtime: SimulationRuntime): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-under-test',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
    },
  } as WorkerToMainMessage;
}

describe('the FUNDS badge during the starter exemption (#771, fixed 2026-09-01)', () => {
  it('reads a remainder a 65-minor-unit press will actually honour, not the mature rung\'s overstatement', () => {
    const runtime = prisonWithACell();
    expect(
      runtime.prisoners.roomInstances.totalResidentCapacity,
      'the fixture must actually be fresh and unfurnished for this case to mean anything',
    ).toBe(0);
    expect(BRICK_PRICE, 'this file\'s arithmetic is written from 40, not read back off the catalogue').toBe(40);
    expect(PLANK_PRICE, 'and from 65').toBe(65);

    // The played sequence, to the minor unit: 654 bricks, landing at -1,160.
    // 2,529 since the owner's ruling of 2026-09-23 set the grant to 100,000
    // (#641): the largest press the starter rung allows, and the same -1,160.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-bricks', itemId: BRICK, quantity: 2_529 });
    expect(runtime.refusals.count, 'the fixture must be able to afford the bricks it buys').toBe(0);
    expect(runtime.treasury.balanceMinorUnits, 'the exact balance the played session measured').toBe(-1_160);

    // Read the badge the same way the strip does: through the real wire
    // message and the real translator, never a hand-built view model.
    // `reportedCounts` rather than `!`: the translator has answered three
    // things since #1191, and this assertion is about the one that is a row.
    const counts = reportedCounts(publication(runtime));
    expect(counts.roomCapacity, 'published live, and it is what "fresh, unfurnished" means to the host -- see the header, it is not the registry figure').toBe(0);

    const fundsMetric = projectStatusMetrics(counts).find((descriptor) => descriptor.id === 'funds');
    expect(fundsMetric, 'no funds metric in the strip').toBeDefined();

    /*
     * **The number.** 25 of room against the live −1,185 starter floor, not
     * the 90 a badge computed against the mature −1,250 would read. A player
     * who trusts this figure and presses for anything past 25 is told the
     * truth before they press, which is the whole property `overdraftRemaining`
     * exists for.
     */
    expect(
      fundsMetric!.badge,
      'the badge must read the room a press can actually still spend, not the mature rung\'s overstatement',
    ).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.fundsRemaining,
      numberParameters: { remaining: 25 },
    });
    // The tooltip/screen-reader sentence rides the same number, for the same
    // reason `overdraftDescription`'s own doc comment gives.
    expect(fundsMetric!.description).toEqual({
      textKey: HUD_MESSAGE_KEY.fundsBeforeDeliveriesStop,
      numberParameters: { remaining: 25 },
    });

    /*
     * **The press.** A direct plank buy of 65 must be refused here -- 65 is
     * more than the 25 the badge just reported, so the badge and the press it
     * describes have to agree. Driven through the real command handler and
     * `ProcurementSystem.purchase`, not `judgeAffordability` read in
     * isolation, so this is the same refusal a played session hits.
     */
    const balanceBeforePress = runtime.treasury.balanceMinorUnits;
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-plank', itemId: PLANK, quantity: 1 });
    expect(runtime.refusals.last?.reason, 'refused, on the wire, as every insufficient-funds press is').toBe(
      'purchase.insufficient-funds',
    );
    expect(runtime.treasury.balanceMinorUnits, 'a refusal must not take a minor unit').toBe(balanceBeforePress);

    // The two agree: what the badge said a moment ago (25 left) is honestly
    // less than what the press just asked for (65), so the refusal was
    // foreseeable from the number on screen -- the property the pre-#769
    // regression, and this one, both broke.
    expect(25, 'the badge\'s own remainder').toBeLessThan(PLANK_PRICE);
  });
});
