import Phaser from 'phaser';
import { selectObliqueModuleFrame, type ObliqueAnglePose, type ObliqueModuleCatalog,
  type ObliqueModuleFrame } from '../assets/oblique-module-catalog';

const perSceneQueue = new WeakMap<Phaser.Scene, Promise<void>>();

/** Stream only the frame selected by the current camera pose, retaining it in Phaser's texture cache. */
export async function ensureObliqueModuleFrameTexture(
  scene: Phaser.Scene, catalog: ObliqueModuleCatalog, pose: ObliqueAnglePose,
): Promise<ObliqueModuleFrame> {
  const frame = selectObliqueModuleFrame(catalog, pose);
  const previous = perSceneQueue.get(scene) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (!scene.textures.exists(frame.image)) {
      scene.load.image(frame.image, frame.image);
      await runLoader(scene);
    }
    if (scene.textures.get(frame.image).key !== frame.image) {
      throw new Error(`Oblique module image did not load: ${frame.image}`);
    }
  });
  perSceneQueue.set(scene, task);
  await task;
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
