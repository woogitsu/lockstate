import Phaser from 'phaser';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';

/** Preload the authored camera poses into the same Phaser texture manager as world art. */
export async function registerObliqueModuleTextures(scene: Phaser.Scene, catalog: ObliqueModuleCatalog): Promise<void> {
  const missing = catalog.frames.filter((frame) => !scene.textures.exists(frame.image));
  if (missing.length === 0) return;
  for (const frame of missing) scene.load.image(frame.image, frame.image);
  await new Promise<void>((resolve, reject) => {
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
  for (const frame of catalog.frames) if (scene.textures.get(frame.image).key !== frame.image) {
    throw new Error(`Oblique module image did not load: ${frame.image}`);
  }
}
