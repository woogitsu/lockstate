import Phaser from 'phaser';
import { selectObliqueModuleFrame, type ObliqueAnglePose, type ObliqueModuleCatalog,
  type ObliqueModuleFrame } from '../assets/oblique-module-catalog';

type FrameRequest = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
type SceneQueue = {
  requests: Map<string, FrameRequest>;
  pending: Set<string>;
  active: boolean;
  scheduled: boolean;
};
const perSceneQueues = new WeakMap<Phaser.Scene, SceneQueue>();

function scheduleBatch(scene: Phaser.Scene, queue: SceneQueue): void {
  if (queue.scheduled || queue.active) return;
  queue.scheduled = true;
  queueMicrotask(() => {
    queue.scheduled = false;
    void loadBatch(scene, queue);
  });
}

async function loadBatch(scene: Phaser.Scene, queue: SceneQueue): Promise<void> {
  if (queue.active || queue.pending.size === 0) return;
  queue.active = true;
  const keys = [...queue.pending];
  queue.pending.clear();
  try {
    const missing = keys.filter((key) => !scene.textures.exists(key));
    for (const key of missing) scene.load.image(key, key);
    if (missing.length > 0) await runLoader(scene);
  } catch {
    // Settle each requested frame from the texture cache below. A failed file
    // must not prevent a successfully loaded frame in the same batch from use.
  } finally {
    for (const key of keys) {
      const request = queue.requests.get(key);
      if (request === undefined) continue;
      if (scene.textures.exists(key) && scene.textures.get(key).key === key) request.resolve();
      else request.reject(new Error(`Oblique module image did not load: ${key}`));
      queue.requests.delete(key);
    }
    queue.active = false;
    if (queue.pending.size > 0) scheduleBatch(scene, queue);
  }
}

/** Stream only the frame selected by the current camera pose, retaining it in Phaser's texture cache. */
export async function ensureObliqueModuleFrameTexture(
  scene: Phaser.Scene, catalog: ObliqueModuleCatalog, pose: ObliqueAnglePose,
): Promise<ObliqueModuleFrame> {
  const frame = selectObliqueModuleFrame(catalog, pose);
  if (scene.textures.exists(frame.image) && scene.textures.get(frame.image).key === frame.image) return frame;
  let queue = perSceneQueues.get(scene);
  if (queue === undefined) {
    queue = { requests: new Map(), pending: new Set(), active: false, scheduled: false };
    perSceneQueues.set(scene, queue);
  }
  let request = queue.requests.get(frame.image);
  if (request === undefined) {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    request = { promise, resolve, reject };
    queue.requests.set(frame.image, request);
    queue.pending.add(frame.image);
    scheduleBatch(scene, queue);
  }
  await request.promise;
  return frame;
}

/** Preload the authored camera poses into the same Phaser texture manager as world art. */
export async function registerObliqueModuleTextures(scene: Phaser.Scene, catalog: ObliqueModuleCatalog): Promise<void> {
  const missing = catalog.frames.filter((frame) => !scene.textures.exists(frame.image));
  if (missing.length === 0) return;
  for (const frame of missing) scene.load.image(frame.image, frame.image);
  await runLoader(scene);
  for (const frame of catalog.frames) if (scene.textures.get(frame.image).key !== frame.image) {
    throw new Error(`Oblique module image did not load: ${frame.image}`);
  }
}

function runLoader(scene: Phaser.Scene): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const failures: string[] = [];
    const onError = (file: { key?: string }): void => { failures.push(file.key ?? 'unknown image'); };
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      if (failures.length > 0) reject(new Error(`Oblique module images failed: ${failures.join(', ')}`));
      else resolve();
    });
    scene.load.start();
  });
}
