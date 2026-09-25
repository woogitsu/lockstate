import { createHistoricalOpeningRuntime } from '../helpers/historical-opening-treasury';
import { describe, expect, it } from 'vitest';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { placedObjectAt } from '../../src/simulation/objects';
import { tileCoordinate } from '../../src/simulation/world';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { freshUnfurnishedPrison, pressAffordabilityVerdict } from '../../src/ui/affordability';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import { reportedCounts } from '../helpers/hud-counts';

/**
 * **The gate ADR 0017's "Amendment, 2026-09-01" §2 describes under its
 * correction of 2026-09-15 and does not have: the two definitions of "a
 * fresh, unfurnished prison", pinned on a prison where they can actually
 * disagree.**
 *
 * `tests/integration/economy-funds-badge-starter-rung.test.ts` asserts both
 * are `0` on a prison fresh under either, which is the one case in which they
 * cannot come apart, so no test in this repository would have noticed a
 * divergence. This one builds the case that does.
 *
 * ## The two definitions
 *
 * **D1, the simulation's, and the authoritative one.** ADR 0017's amendment
 * §2: *"Defined as `RoomInstanceRegistry.totalResidentCapacity === 0` -- the
 * summed `residentCapacity` of every registered room instance, whatever its
 * room-catalog id"*. `createSessionCommandHandler`, `PayrollSystem`,
 * `InsolvencyRungSystem` and `computeStandingPrisonConditions` all read
 * exactly that.
 *
 * **D2, the host's, until this file's fix.** `counts.roomCapacity === 0`, in
 * `src/ui/hud/projection.ts`, `build-panel.ts` and `staff-panel.ts`.
 * `roomCapacity` is accumulated over `collectRoomInstances`, a fan-out over
 * the *content* room registry's catalogue ids, so an instance registered
 * under an id that registry does not define contributes nothing to it
 * (`docs/HUD_PROJECTIONS.md` gap 15). It is therefore a **sub-sum** of
 * `totalResidentCapacity` over non-negative terms: `roomCapacity === 0` is
 * implied by `totalResidentCapacity === 0` and does not imply it, so the host
 * called a prison fresh in strictly more cases than the simulation did.
 *
 * ## Why the divergent prison is built rather than played
 *
 * `RoomZoningService.zone` refuses an unknown room type, so no live command
 * creates an off-catalogue instance. A **restore** does:
 * `roomInstanceSchemaV5` bounds the id at `z.string().min(1)`, and
 * `restoreSessionSystems` (`src/simulation/runtime/session-systems.ts:862`)
 * registers whatever the row carries with no catalogue check -- ADR 0071
 * decision 4 forbids the registry reading a catalogue, so the check cannot
 * live there. The three calls below are that path's own three calls, in its
 * order: `roomInstances.register`, `placedObjects` loaded, then
 * `roomCapacity.resolveAll()`.
 *
 * ## What is pinned, and why the first assertion is the load-bearing one
 *
 * The first `it` pins the two definitions **equal on the published payload**
 * -- which is the property, and it is what a future divergence would break.
 * The rest price what the divergence cost when it was open: a badge and a
 * pre-flight that disagreed with the command handler reading the same tick.
 */

const SEED = 0xfe5b;
const BRICK = 'item.brick';
const BRICK_PRICE = procurableMaterial(BRICK)!.unitPriceMinorUnits;

/**
 * An id no room catalogue in this build defines, which is the whole fixture.
 * Asserted rather than assumed below: the day something authors this id, this
 * file stops testing what it says it tests and must say so out loud.
 */
const OFF_CATALOGUE_ROOM_ID = 'room.from-a-build-this-one-does-not-have';
const OFF_CATALOGUE_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const OFF_CATALOGUE_ANCHOR = { x: tileCoordinate(OFF_CATALOGUE_RECT.x), y: tileCoordinate(OFF_CATALOGUE_RECT.y) };

function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

/**
 * A prison holding exactly one room instance, registered under an id this
 * build's room catalogue does not define, with a bed standing in it.
 *
 * Fresh to the catalogue fan-out (`roomCapacity` 0) and **not** fresh to the
 * registry (`totalResidentCapacity` 1), which is the disagreement.
 */
function prisonRestoredWithAnOffCatalogueRoom(): SimulationRuntime {
  const runtime = createHistoricalOpeningRuntime(SEED);
  runtime.prisoners.roomInstances.register({
    instanceId: 'restored-1',
    roomCatalogId: OFF_CATALOGUE_ROOM_ID,
    anchorTile: OFF_CATALOGUE_ANCHOR,
    width: OFF_CATALOGUE_RECT.width,
    height: OFF_CATALOGUE_RECT.height,
    residentCapacity: 0,
    concurrentUseCapacity: 0,
    objectCapabilities: [],
    openArea: false,
  });
  if (!runtime.placedObjects.place(placedObjectAt('object.bed', OFF_CATALOGUE_ANCHOR, 0))) {
    throw new Error('the fixture\'s bed must be placeable inside the restored room');
  }
  runtime.roomCapacity.resolveAll();
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

describe('"a fresh, unfurnished prison" has one definition, and the host reads it rather than re-deriving one', () => {
  it('publishes the registry\'s own answer, on a prison the catalogue fan-out cannot see', () => {
    const runtime = prisonRestoredWithAnOffCatalogueRoom();

    expect(
      runtime.prisoners.roomInstances.totalResidentCapacity,
      'D1, ADR 0017 amendment 2026-09-01 §2: the registry sees the restored room\'s bed',
    ).toBe(1);

    const counts = reportedCounts(publication(runtime));
    expect(
      counts.roomCapacity,
      'D2: the catalogue fan-out cannot reach an instance under an id it does not define (gap 15) -- this is the divergence, and it stays',
    ).toBe(0);

    /*
     * **The gate.** The host must be told the simulation's answer rather than
     * deriving one from a count that cannot see the whole registry. Before
     * this field existed, `counts.roomCapacity === 0` was the host's
     * predicate and read `true` here while the worker read `false`.
     */
    expect(
      counts.isFreshUnfurnishedPrison,
      'the published predicate must be the registry\'s, not the fan-out\'s',
    ).toBe(false);
    expect(
      counts.isFreshUnfurnishedPrison,
      'and it must be exactly `totalResidentCapacity === 0`, the definition ADR 0017 §2 gives',
    ).toBe(runtime.prisoners.roomInstances.totalResidentCapacity === 0);
  });

  it('judges a press against the floor the command handler will actually enforce', () => {
    const runtime = prisonRestoredWithAnOffCatalogueRoom();
    expect(BRICK_PRICE, 'this file\'s arithmetic is written from 40, not read back off the catalogue').toBe(40);

    // 25,000 - 655 x 40 = -1,200: past the starter rung (-1,185), short of the
    // mature one (-1,250), which is the only window in which the two floors
    // give different answers to the same press.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-bricks', itemId: BRICK, quantity: 655 });
    expect(runtime.refusals.count, 'the fixture must be able to afford the bricks it buys').toBe(0);
    expect(runtime.treasury.balanceMinorUnits, 'the balance this case is built at').toBe(-1_200);

    const counts = reportedCounts(publication(runtime));
    const verdict = pressAffordabilityVerdict(BRICK_PRICE, counts.treasuryMinorUnits, freshUnfurnishedPrison(counts));

    // The same press, through the real command handler, on the same tick.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-one-more', itemId: BRICK, quantity: 1 });
    expect(runtime.refusals.count, 'the worker accepts this press').toBe(0);
    expect(runtime.treasury.balanceMinorUnits, 'and lands here').toBe(-1_240);

    expect(
      verdict,
      'the host\'s pre-flight must not refuse a press the command handler reading the same tick accepts',
    ).toEqual({
      refused: false,
      refusal: undefined,
      shortfallMinorUnits: 0,
      chargeMinorUnits: BRICK_PRICE,
      balanceMinorUnits: -1_200,
      spendableMinorUnits: 50,
    });
  });

  it('states a remainder the same press will honour', () => {
    const runtime = prisonRestoredWithAnOffCatalogueRoom();
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-bricks', itemId: BRICK, quantity: 655 });

    const counts = reportedCounts(publication(runtime));
    const fundsMetric = projectStatusMetrics(counts).find((descriptor) => descriptor.id === 'funds');
    expect(fundsMetric, 'no funds metric in the strip').toBeDefined();

    // -1,200 against the mature -1,250 the worker enforces here: 50 of room,
    // not the `0 left` a badge computed against the starter rung read.
    expect(fundsMetric!.badge, 'the badge must state the room the worker will actually honour').toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.fundsRemaining,
      numberParameters: { remaining: 50 },
    });
  });
});
