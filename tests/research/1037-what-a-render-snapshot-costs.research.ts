import { describe, expect, it } from 'vitest';
import { structuresFromConstruction } from '../../src/rendering/world/structures';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { packCommand } from '../../src/simulation/protocol/commands';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
} from '../../src/simulation/runtime/restore-session';

/**
 * What one consistency-poll snapshot costs, leg by leg.
 *
 * The instrument behind ADR 0099's option 4 -- "shorten the poll" -- which
 * needs a price for the thing being multiplied rather than an adjective. The
 * feed's own header calls a poll expensive: each one costs the worker a full
 * `captureSessionSnapshot` and costs the main thread a `jsonValueSchema` walk
 * of the result, and `tests/unit/rendering-feed.test.ts` pins the *count* at
 * two over thirty running seconds. Neither says what one costs.
 *
 * Four legs, because they are paid by three different parties and only two of
 * them scale with the same thing:
 *
 * 1. `captureSessionSnapshot` -- worker thread, inside the tick loop's wake.
 * 2. `structuredClone` of the whole message -- the in-process `postMessage`
 *    proxy ADR 0040 used for the same purpose.
 * 3. `decodeWorkerToMainMessage` -- the main thread's `jsonValueSchema` walk.
 * 4. `WorldRenderView.fromSnapshot` + `structuresFromConstruction` -- building
 *    the frame the painter reads.
 *
 * **What it does not measure, and this is the leg that matters most**: the
 * `TileLayer` rebuild every applied snapshot provokes through the frame
 * revision. That is Phaser, and `vitest.config.ts` runs `environment: 'node'`.
 *
 * The chunk arm is what makes the numbers readable against ADR 0040's own
 * figure of 1.35 ms for a 64-chunk decode: a new prison owns **one** loaded
 * chunk, so 16, 64 and 256 are extrapolation arms rather than states this
 * build reaches, and they are built by loading chunks and writing an edge run
 * and a zoning run in each rather than by playing.
 *
 * Not a gate. Run it with
 *
 *     node node_modules/vitest/vitest.mjs run \
 *       --config tests/research/vitest.research.config.ts \
 *       tests/research/1037-what-a-render-snapshot-costs.research.ts
 *
 * -- the positional filter matters, because that config's include glob also
 * collects a multi-hour instrument.
 */

const SEED = 0x1037;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** A prison with `orderCount` wall orders placed and paid for. */
function prison(orderCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  let sequence = 0;
  for (let index = 0; index < orderCount; index += 1) {
    sequence += 1;
    submit(
      runtime,
      `buy-${String(sequence)}`,
      packCommand({ type: 'PurchaseMaterials', orderId: `buy-${String(sequence)}`, itemId: 'item.brick', quantity: 4 }),
    );
    submit(
      runtime,
      `place-${String(sequence)}`,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: `wall-${String(sequence)}`,
        definitionId: 'wall-brick',
        x: 8 + (index % 16),
        y: 8 + Math.floor(index / 16),
        edge: 'north',
        transactionId: `gesture-${String(sequence)}`,
      }),
    );
  }
  return runtime;
}

/** Loads `chunkCount` chunks and writes an edge run and a zoning run in each, so their render layers are not empty. */
function widen(runtime: SimulationRuntime, chunkCount: number): void {
  const CHUNK = 32;
  const side = Math.ceil(Math.sqrt(chunkCount));
  let loaded = 0;
  for (let cy = 0; cy < side && loaded < chunkCount; cy += 1) {
    for (let cx = 0; cx < side && loaded < chunkCount; cx += 1) {
      runtime.world.load({ x: chunkCoordinate(cx), y: chunkCoordinate(cy) });
      for (let index = 0; index < CHUNK; index += 1) {
        runtime.world.setTopEdge({ x: tileCoordinate(cx * CHUNK + index), y: tileCoordinate(cy * CHUNK + 4) }, 1);
        runtime.world.setZoning({ x: tileCoordinate(cx * CHUNK + index), y: tileCoordinate(cy * CHUNK + 6) }, 3);
      }
      loaded += 1;
    }
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Medians rather than means: the first sample of every leg carries the JIT warm-up and would dominate a mean. */
function timed(label: string, iterations: number, run: () => void): void {
  run();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  console.log(
    `${label}: median ${median(samples).toFixed(3)} ms, min ${Math.min(...samples).toFixed(3)}, max ${Math.max(...samples).toFixed(3)} over ${String(iterations)}`,
  );
}

describe('what one consistency-poll snapshot costs', () => {
  it('prices the four legs of a render snapshot', () => {
    for (const [orderCount, chunkCount] of [[0, 0], [12, 0], [48, 0], [48, 16], [48, 64], [48, 256]] as const) {
      const runtime = prison(orderCount);
      if (chunkCount > 0) widen(runtime, chunkCount);
      // Past the delivery delay and every build, so the orders in the snapshot
      // are a settled mixture rather than one phase.
      for (let step = 0; step < 400; step += 1) runtime.kernel.step();
      const bundle = captureSessionSnapshot(runtime);
      const jsonBytes = JSON.stringify(bundle).length;
      console.log(
        `--- ${String(orderCount)} wall orders, ${String(chunkCount)} extra chunks, tick ${String(runtime.kernel.tick)}, bundle JSON ${String(jsonBytes)} bytes, chunks in bundle ${String((bundle.world as { chunks?: readonly unknown[] }).chunks?.length ?? 0)}`,
      );
      // A refused purchase or placement would make every figure below a
      // measurement of a different prison, so it is checked rather than assumed.
      expect(runtime.refusals.count).toBe(0);

      timed('  worker: captureSessionSnapshot', 40, () => {
        captureSessionSnapshot(runtime);
      });

      const message = {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'render-1',
        replyTo: 'render-1',
        kind: 'simulation/snapshot' as const,
        payload: {
          tick: runtime.kernel.tick,
          reason: 'consistency-check' as const,
          snapshot: {
            schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
            schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
            transport: 'structured-clone' as const,
            data: bundle as unknown as Record<string, unknown>,
          },
        },
      };
      const cloned = structuredClone(message);
      timed('  transport: structuredClone of the message', 40, () => {
        structuredClone(message);
      });
      timed('  main: decodeWorkerToMainMessage (jsonValueSchema walk)', 40, () => {
        const decoded = decodeWorkerToMainMessage(cloned);
        // The decode is the measurement, so a refusal has to fail the run
        // rather than be timed as if it had walked the bundle.
        if (decoded.ok !== true) throw new Error(`decode failed: ${JSON.stringify(decoded)}`);
      });
      timed('  main: WorldRenderView.fromSnapshot + structuresFromConstruction', 40, () => {
        WorldRenderView.fromSnapshot(bundle.world);
        structuresFromConstruction(bundle.construction);
      });
    }
  });
});
