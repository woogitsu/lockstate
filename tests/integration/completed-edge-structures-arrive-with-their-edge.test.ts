import { describe, expect, it } from 'vitest';
import { buildRowIndex } from '../../src/rendering/world/row-index';
import { isDrawnAsWorldEdge, structuresFromConstruction, type RenderStructure } from '../../src/rendering/world/structures';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';

/**
 * **A completed wall or door never reaches the painter without the edge that
 * suppresses its construction block.**
 *
 * ## The guard this protects, and what it costs when its premise fails
 *
 * `src/rendering/phaser/tile-layer.ts` drops the construction slab of a
 * finished wall or door with a **conjunctive** test -- the structure must be
 * edge-drawn *and* the row must really carry an edge on its tile:
 *
 * ```ts
 * if (isDrawnAsWorldEdge(structure) && edgeTileXs.has(structure.tileX)) continue;
 * ```
 *
 * The second half is there for a save written before #74, which has completed
 * wall orders and no edge values and whose walls would otherwise vanish. Its
 * cost is that a *live* frame carrying a completed order without its edge falls
 * through to `paintSlab` at `alphaFor('built')`, which is **1** -- a finished
 * door drawn as a full-tile opaque block rather than as a door. Issue #1027 is
 * the argument that such a frame exists.
 *
 * ## Why it does not, and why that is worth a gate rather than a comment
 *
 * The two halves of the guard are read off one `RenderFrame`, and
 * `SimulationSnapshotFeed.apply` builds `world` and `structures` in a single
 * object literal from a single `SessionSnapshotBundle`
 * (`src/rendering/feed/simulation-snapshot-feed.ts`). `captureSessionSnapshot`
 * takes `runtime.world.snapshot()` and `runtime.construction.snapshot()` in one
 * synchronous literal of its own, and `ConstructionSystem` moves an order to
 * `'completed'` and writes its edge in two adjacent statements
 * (`order.state = 'completed'; this.finalizeConstruction(order);`). So the two
 * facts cannot arrive apart, however stale the frame is: staleness moves them
 * together.
 *
 * That is a property of the *transport*, not of the painter, and it is exactly
 * the property ADR 0040's slice 4 proposes to give up -- "carrying chunk
 * geometry on the delta channel, and retiring the poll for renders altogether"
 * would put geometry and the construction projection on two channels with two
 * cadences, at which point #1027's frame becomes constructible and the guard
 * starts drawing opaque blocks over finished doors. This test is what says so
 * out loud on the day that lands.
 *
 * ## What it walks
 *
 * Every tick from the order being placed to well past its completion, for a
 * door on a west edge, a door on a north edge, and a wall -- capturing a real
 * session snapshot at each one and projecting it exactly as the renderer does.
 * The per-tick capture is the point: a test that looked only at the end would
 * pass on a simulation that published the completion a tick before the edge.
 */

const SEED = 0x1027;

/** Where each order goes: inside the one chunk a new prison owns, and clear of the others. */
const CASES = [
  { orderId: 'door-west', definitionId: 'door-wooden', x: 12, y: 9, edge: 'west' as const, material: 'item.wood-plank' },
  { orderId: 'door-north', definitionId: 'door-wooden', x: 14, y: 9, edge: 'north' as const, material: 'item.wood-plank' },
  { orderId: 'wall-north', definitionId: 'wall-brick', x: 16, y: 9, edge: 'north' as const, material: 'item.brick' },
] as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * The painter's own question, asked of a captured bundle exactly as
 * `TileLayer.paintRow` asks it of a frame.
 *
 * `buildRowIndex` and `structuresFromConstruction` are the real ones, so a
 * change to how a row's edges are collected is a change to this answer. The
 * only thing restated here is the guard's condition itself, because it lives
 * inside a Phaser paint loop that cannot be reached from `environment: 'node'`.
 */
function structuresDrawnAsConstructionBlocks(runtime: SimulationRuntime): readonly RenderStructure[] {
  const bundle = captureSessionSnapshot(runtime);
  const structures = structuresFromConstruction(bundle.construction);
  const rows = buildRowIndex(WorldRenderView.fromSnapshot(bundle.world), structures);

  const drawn: RenderStructure[] = [];
  for (const structure of structures) {
    if (!isDrawnAsWorldEdge(structure)) continue;
    const row = rows.get(structure.tileY);
    const edgeTileXs = new Set((row?.edges ?? []).map((edge) => edge.tileX));
    if (edgeTileXs.has(structure.tileX)) continue; // the guard fires: the slab is dropped
    drawn.push(structure);
  }
  return drawn;
}

function prisonWithEveryEdgeThingOrdered(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  let sequence = 0;
  for (const testCase of CASES) {
    sequence += 1;
    submit(
      runtime,
      `buy-${testCase.orderId}`,
      packCommand({ type: 'PurchaseMaterials', orderId: `buy-${String(sequence)}`, itemId: testCase.material, quantity: 4 }),
    );
    submit(
      runtime,
      `place-${testCase.orderId}`,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: testCase.orderId,
        definitionId: testCase.definitionId,
        x: testCase.x,
        y: testCase.y,
        edge: testCase.edge,
        transactionId: `gesture-${testCase.orderId}`,
      }),
    );
  }
  return runtime;
}

describe('a completed wall or door reaches the painter with the edge that suppresses its block', () => {
  it('never yields a frame in which one is drawn as a construction block, at any tick of the build', () => {
    const runtime = prisonWithEveryEdgeThingOrdered();
    expect(runtime.refusals.count, 'no command may be refused, or this walks an empty queue').toBe(0);

    const offenders: string[] = [];
    const statesSeen = new Set<string>();
    // Past the 100-tick delivery delay and three builds of 30 ticks each, taken
    // one at a time because one crew builds one order. 600 is comfortably past
    // all of it and is not a boundary of anything.
    for (let step = 0; step < 600; step += 1) {
      for (const structure of structuresDrawnAsConstructionBlocks(runtime)) {
        offenders.push(`tick ${runtime.kernel.tick}: ${structure.definitionId} at (${structure.tileX},${structure.tileY})`);
      }
      for (const testCase of CASES) statesSeen.add(runtime.construction.getOrder(testCase.orderId)?.state ?? 'gone');
      runtime.kernel.step();
    }

    expect(offenders).toEqual([]);

    // Not vacuous: the walk really did carry every order from ordered to built,
    // so the assertion above was asked at the ticks that matter.
    expect(statesSeen.has('completed'), 'the walk must reach a completed order').toBe(true);
    expect(statesSeen.has('in-progress'), 'the walk must pass through a build').toBe(true);
    for (const testCase of CASES) {
      expect(runtime.construction.getOrder(testCase.orderId)?.state, testCase.orderId).toBe('completed');
    }
  }, 60_000);

  /**
   * The control: the same question, asked of a frame whose edge layer is a tick
   * behind its construction snapshot.
   *
   * Nothing in the transport can build this frame -- that is the whole finding
   * of #1027 -- so it is built here by hand from two captures of the same
   * session, one taken before the last order finished and one after. If the
   * assertion above ever passes on such a frame it has stopped measuring
   * anything, and this is what says so.
   */
  it('would catch it: an older world under a newer construction snapshot is drawn as a block', () => {
    const runtime = prisonWithEveryEdgeThingOrdered();

    let stale: ReturnType<typeof captureSessionSnapshot> | undefined;
    for (let step = 0; step < 600; step += 1) {
      const complete = CASES.filter((testCase) => runtime.construction.getOrder(testCase.orderId)?.state === 'completed');
      if (complete.length === CASES.length - 1 && stale === undefined) stale = captureSessionSnapshot(runtime);
      runtime.kernel.step();
    }
    if (stale === undefined) throw new Error('the walk never reached the moment one order was still unfinished');

    const fresh = captureSessionSnapshot(runtime);
    const structures = structuresFromConstruction(fresh.construction);
    const rows = buildRowIndex(WorldRenderView.fromSnapshot(stale.world), structures);

    const blocked: string[] = [];
    for (const structure of structures) {
      if (!isDrawnAsWorldEdge(structure)) continue;
      const edgeTileXs = new Set((rows.get(structure.tileY)?.edges ?? []).map((edge) => edge.tileX));
      if (edgeTileXs.has(structure.tileX)) continue;
      blocked.push(`${structure.definitionId} at (${structure.tileX},${structure.tileY})`);
    }

    // Exactly the order that finished between the two captures, and it is drawn
    // as a full-tile block at `alphaFor('built')`, which is 1.
    expect(blocked.length, `a split frame must produce an opaque block, got ${JSON.stringify(blocked)}`).toBe(1);
  }, 60_000);
});
