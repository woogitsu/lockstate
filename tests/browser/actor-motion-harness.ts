import Phaser from 'phaser';
import { PRISONER_ACTOR_ASSET_ID } from '../../src/rendering/feed/actors-from-snapshot';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import type { BuildToolPort, EditHistoryPort } from '../../src/rendering/build/edge-picking';
import { LOCOMOTION_SUBTILE_UNITS } from '../../src/simulation/locomotion';
import {
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_PRISONER,
  RENDER_ACTORS_CONTENT_TYPE,
  RENDER_ACTORS_SCHEMA_ID,
  RENDER_ACTORS_SCHEMA_VERSION,
  RenderActorsKeyframeWriter,
} from '../../src/simulation/protocol/render-actors-payload';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import type { LockstateActorMotionHarness, SpritePosition } from './actor-motion-harness-api';

/**
 * The real `WorldScene`, the real `ActorLayer` and the real
 * `SimulationSnapshotFeed`, in a real browser, fed by the bytes the worker
 * would send.
 *
 * ### What this can claim that no headless test can
 *
 * `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so every
 * assertion about `ActorLayer` -- a Phaser display object with a texture, a
 * pivot and a position -- is unreachable from `pnpm test`. The feed's
 * arithmetic is covered there (`tests/unit/actor-extrapolation.test.ts`,
 * `tests/unit/rendering-feed.test.ts`); what is **not** is the sentence #414
 * asks for in its own words: *"a moving actor's rendered position changes
 * between frames, not merely between snapshots."* That is a claim about a
 * sprite, and this is where a sprite exists.
 *
 * ### Why the worker is a fake and the payload is not
 *
 * The message source is a plain object, so a spec can publish one delta and
 * then watch several frames go by with nothing else arriving -- which is the
 * whole point, and which a real worker publishing every 100 ms would make
 * impossible to observe. The **bytes** are built by the production
 * `RenderActorsKeyframeWriter`, so the layout under test is the shipped one
 * rather than a transcription.
 *
 * ### Why the atlases are real
 *
 * `ActorLayer.draw` resolves a clip and a frame before it places anything, and
 * an actor whose asset is missing is counted `unresolved` and **not drawn** --
 * so a harness with no art would find no sprites and pass every "it moved"
 * assertion vacuously by finding nothing at all. The batch under
 * `public/assets/actors/` is git-LFS content;
 * `bash scripts/provision-git-lfs.sh && git lfs pull` is what makes this file
 * runnable, exactly as `docs/AGENT_WORKFLOW.md` records for the rest of the
 * browser suite.
 */

const CANVAS_PARENT_ID = 'actor-motion-harness-root';

/** The entity id every published record carries. One actor is enough and makes the readback unambiguous. */
const ACTOR_ENTITY_ID = 7;

function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** A message source the harness drives by hand, in place of the worker client. */
const listeners: ((message: WorkerToMainMessage) => void)[] = [];
const sent: MainToWorkerMessage[] = [];
const client = {
  addListener: (handler: (message: WorkerToMainMessage) => void): void => {
    listeners.push(handler);
  },
  send: (message: MainToWorkerMessage): void => {
    sent.push(message);
  },
};

function emit(message: WorkerToMainMessage): void {
  for (const listener of listeners) listener(message);
}

const feed = new SimulationSnapshotFeed(client, { onError: () => {} });

const noBuildTool: BuildToolPort = { isArmed: () => false, place: () => {}, target: () => {} };
const noEditHistory: EditHistoryPort = { undo: () => {}, redo: () => {} };

const scene = new WorldScene({
  feed,
  keyValueStore: memoryStore(),
  buildTool: noBuildTool,
  editHistory: noEditHistory,
  onError: () => {},
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: CANVAS_PARENT_ID,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0b0e12',
  scene: [scene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
});

let frames = 0;
/**
 * One sample of the first actor sprite per drawn frame.
 *
 * Bounded, because this runs for the life of the page: a spec measures a window
 * of a few hundred milliseconds and the buffer only has to outlive it.
 */
const samples: SpritePosition[] = [];
const SAMPLE_LIMIT = 600;

const countFrame = (): void => {
  // Rescheduled **first**. The sampling below reads the scene's display list,
  // which does not exist until the SceneManager has installed the scene, and a
  // throw after the reschedule loses one sample where a throw before it would
  // stop the loop for good -- which is how the first draft of this file
  // deadlocked every `waitForFrames` in the spec.
  requestAnimationFrame(countFrame);
  frames += 1;
  try {
    const drawn = actorSprites();
    if (drawn.length > 0 && samples.length < SAMPLE_LIMIT) samples.push(drawn[0]!);
  } catch {
    // Before `create`, there is nothing to sample and nothing to report.
  }
};
requestAnimationFrame(countFrame);

/**
 * Resolves once the scene is running **and** its atlas batch has loaded.
 *
 * Both halves are polled rather than awaited on an event, for the reason
 * `world-scene-harness.ts` records at length: `scene.events` does not exist
 * before the SceneManager installs the scene, and subscribing after
 * `new Phaser.Game` races the boot. The atlas half is polled through the same
 * texture manager `ActorLayer` will ask, so "loaded" means the thing that
 * actually has to be true rather than a promise this file kept.
 */
const ready = new Promise<void>((resolve) => {
  const poll = (): void => {
    const active = scene.sys?.isActive() === true;
    if (active && scene.textures.getTextureKeys().some((key) => key.includes('actor.prisoner.base'))) {
      resolve();
      return;
    }
    requestAnimationFrame(poll);
  };
  poll();
});

/** The one texture key family an actor sprite can be holding, so the readback cannot pick up a tile. */
const ACTOR_TEXTURE_MARKER = PRISONER_ACTOR_ASSET_ID;

function actorSprites(): readonly SpritePosition[] {
  const found: SpritePosition[] = [];
  for (const child of scene.children?.list ?? []) {
    const image = child as Phaser.GameObjects.Image;
    if (typeof image.texture?.key !== 'string' || !image.texture.key.includes(ACTOR_TEXTURE_MARKER)) continue;
    if (image.visible !== true) continue;
    found.push({ x: image.x, y: image.y });
  }
  return found;
}

const harness: LockstateActorMotionHarness = {
  ready,
  publishActor: (tick, tile, tilesPerSecond) => {
    const writer = new RenderActorsKeyframeWriter(1);
    writer.writeRecord(
      ACTOR_ENTITY_ID,
      packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, Math.sign(tilesPerSecond.x), Math.sign(tilesPerSecond.y)),
      Math.round(tile.x * LOCOMOTION_SUBTILE_UNITS),
      Math.round(tile.y * LOCOMOTION_SUBTILE_UNITS),
      Math.round(tilesPerSecond.x * LOCOMOTION_SUBTILE_UNITS),
      Math.round(tilesPerSecond.y * LOCOMOTION_SUBTILE_UNITS),
    );
    const data = writer.finish();
    emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `delta-${String(tick)}`,
      kind: 'simulation/delta',
      payload: {
        baseTick: tick - 1,
        tick,
        delta: {
          schemaId: RENDER_ACTORS_SCHEMA_ID,
          schemaVersion: RENDER_ACTORS_SCHEMA_VERSION,
          transport: 'array-buffer',
          contentType: RENDER_ACTORS_CONTENT_TYPE,
          byteLength: data.byteLength,
          data,
        },
      },
    } as unknown as WorkerToMainMessage);
  },
  publishClock: (tick, mode) => {
    emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `clock-${String(tick)}-${mode}`,
      kind: 'simulation/clock-state',
      payload: { tick, clock: mode === 'paused' ? { mode: 'paused' } : { mode: 'running', speed: 1 } },
    } as unknown as WorkerToMainMessage);
  },
  actorSprites,
  motionSamples: () => [...samples],
  resetSamples: () => {
    samples.length = 0;
  },
  framesDrawn: () => frames,
};

// A session, so the feed accepts anything at all: `simulation/ready` is what
// clears its per-session state and marks the clock running.
emit({
  protocolVersion: SIMULATION_PROTOCOL_VERSION,
  messageId: 'ready-1',
  kind: 'simulation/ready',
  payload: { tick: 0, clock: { mode: 'running', speed: 1 } },
} as unknown as WorkerToMainMessage);

window.lockstateActorMotionHarness = harness;
