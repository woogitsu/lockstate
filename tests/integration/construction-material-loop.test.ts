import { describe, expect, it } from 'vitest';
import { STARTER_SCENARIO } from '../../src/content/scenario-catalog';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { packCommand } from '../../src/simulation/protocol/commands';
import { applyScenario } from '../../src/simulation/runtime/apply-scenario';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * The whole point of ADR 0018, stated as behaviour: **in a real session, a
 * build order a player places reaches `'completed'` and puts a wall in the
 * world.**
 *
 * Before this change it could not. `createNewSimulationRuntime` registered
 * an empty construction container, `ContainerMaterialsProvider.tryAllocate`
 * therefore returned `false` on every scheduled tick, and every order a
 * player ever placed sat in `'materials-pending'` forever. Nothing was
 * broken; nothing supplied materials.
 *
 * Two deliberate choices about how this is proven:
 *
 * - **Through `InProcessSessionHost`, not by hand-building a runtime.**
 *   That host is one of the two places a new session is actually started
 *   (`WorkerStateMachine.handleInitialize` is the other, and applies the
 *   same scenario the same way), so what runs here is the session a player
 *   gets -- real kernel, real command queue, real construction system, real
 *   container. A test that constructed its own runtime and stocked it
 *   itself would prove that stocking a container works, which was never in
 *   doubt.
 *
 * - **The negative case is asserted too.** "The order completed" on its own
 *   would pass just as happily if the provider had been quietly reverted to
 *   `UNLIMITED_MATERIALS_PROVIDER`. So the same session is also driven past
 *   the end of its stock, and the first order it cannot pay for must stall.
 */

const MASTER_SEED = 4242;

/** Long enough for a `wall-brick` (50 work at +10 per scheduled tick, one scheduled tick in ten) with generous headroom. */
const TICKS_TO_BUILD = 300;

/**
 * Submits a wall order the way the UI does -- as a real kernel command.
 * Sequence and tick come from the kernel itself, because `submitCommand`
 * rejects a gap and rejects the past, and a restored session continues both
 * counters from the save.
 */
function placeWall(runtime: SimulationRuntime, orderId: string, x: number, y: number): void {
  runtime.kernel.submitCommand(
    `cmd-${orderId}`,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', x, y, edge: 'north' }),
  );
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

async function startedSession(): Promise<SimulationRuntime> {
  const host = new InProcessSessionHost();
  await host.startNew(MASTER_SEED);
  const runtime = host.getRuntime();
  if (runtime === undefined) throw new Error('the host must expose a runtime for this test to mean anything');
  return runtime;
}

describe('a build order placed in a real session reaches completion', () => {
  it('completes, writes the wall into the world, and spends exactly the bricks it required', async () => {
    const runtime = await startedSession();
    const materials = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    const before = materials.quantityOf('item.brick');
    expect(before).toBeGreaterThan(0); // the session opened with stock at all

    placeWall(runtime, 'wall-1', 4, 4);
    step(runtime, TICKS_TO_BUILD);

    const order = runtime.construction.getOrder('wall-1');
    expect(order?.state).toBe('completed');
    expect(order?.progress).toBe(50);
    // The wall is really in the world, not merely recorded as finished.
    expect(runtime.world.getTopEdge({ x: tileCoordinate(4), y: tileCoordinate(4) })).toBe(1);
    // And it was paid for out of the session's own container.
    expect(materials.quantityOf('item.brick')).toBe(before - 2);
  });

  it('an identical session with no scenario applied never gets past materials-pending', async () => {
    // The control. This is precisely what every session did before ADR 0018,
    // and it is what the assertions above would look like if `applyScenario`
    // stopped being called.
    const bare = createNewSimulationRuntime(MASTER_SEED);
    placeWall(bare, 'wall-1', 4, 4);
    step(bare, TICKS_TO_BUILD);

    expect(bare.construction.getOrder('wall-1')?.state).toBe('materials-pending');
    expect(bare.world.getTopEdge({ x: tileCoordinate(4), y: tileCoordinate(4) })).toBe(0);
  });

  it('stops building when the declared stock runs out, rather than building forever', async () => {
    const runtime = await startedSession();
    const materials = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);

    // Drain to exactly one wall's worth, through the container's own audited
    // reserve/withdraw pair rather than by reaching into its internals.
    const surplus = materials.quantityOf('item.brick') - 2;
    expect(materials.reserve('item.brick', surplus)).toEqual({ ok: true });
    expect(materials.withdrawReserved('item.brick', surplus)).toEqual({ ok: true });
    expect(materials.quantityOf('item.brick')).toBe(2);

    placeWall(runtime, 'wall-a', 6, 6);
    placeWall(runtime, 'wall-b', 7, 6);
    step(runtime, TICKS_TO_BUILD);

    expect(runtime.construction.getOrder('wall-a')?.state).toBe('completed');
    expect(runtime.construction.getOrder('wall-b')?.state).toBe('materials-pending');
    expect(materials.quantityOf('item.brick')).toBe(0);

    // The stalled order is waiting, not dead: it builds the moment stock
    // exists again -- the `'materials-pending'` backpressure contract (#25).
    materials.deposit('item.brick', 2);
    step(runtime, TICKS_TO_BUILD);
    expect(runtime.construction.getOrder('wall-b')?.state).toBe('completed');
  });

  it('a hundred walls in one session complete without exhausting the starter stock', async () => {
    const runtime = await startedSession();
    const materials = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    const before = materials.quantityOf('item.brick');

    for (let index = 0; index < 100; index += 1) {
      placeWall(runtime, `wall-${String(index).padStart(3, '0')}`, index % 30, Math.floor(index / 30));
    }
    step(runtime, TICKS_TO_BUILD);

    for (let index = 0; index < 100; index += 1) {
      expect(runtime.construction.getOrder(`wall-${String(index).padStart(3, '0')}`)?.state, `wall-${index}`).toBe('completed');
    }
    expect(materials.quantityOf('item.brick')).toBe(before - 200);
    expect(materials.quantityOf('item.brick')).toBeGreaterThan(0);
  });
});

describe('the scenario is applied when a session starts and never again', () => {
  it('restoring a saved session keeps the remaining stock instead of re-granting the starting stock', async () => {
    const host = new InProcessSessionHost();
    await host.startNew(MASTER_SEED);
    const runtime = host.getRuntime()!;

    placeWall(runtime, 'wall-1', 4, 4);
    step(runtime, TICKS_TO_BUILD);
    const remaining = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick');

    const bundle = await host.capture();
    const restoredHost = new InProcessSessionHost();
    await restoredHost.startFromSnapshot(bundle);
    const restored = restoredHost.getRuntime()!;

    expect(restored.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick')).toBe(remaining);

    // Restored, and still able to build -- the stock survived as usable
    // stock, not as a number in a snapshot.
    placeWall(restored, 'wall-2', 5, 5);
    step(restored, TICKS_TO_BUILD);
    expect(restored.construction.getOrder('wall-2')?.state).toBe('completed');
  });

  it('applying the same scenario twice would double the stock, which is why a restore does not', async () => {
    // Not a recommendation -- an explicit statement of the hazard the
    // restore path avoids, so removing that guarantee has to fail something.
    const runtime = createNewSimulationRuntime(MASTER_SEED);
    applyScenario(runtime, STARTER_SCENARIO);
    const once = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick');
    applyScenario(runtime, STARTER_SCENARIO);
    expect(runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick')).toBe(once * 2);
  });
});
