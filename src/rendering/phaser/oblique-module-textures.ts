import Phaser from 'phaser';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';

/** Loads each registry-owned oblique frame as a standalone Phaser texture. */
export async function registerObliqueModuleTextures(
  scene: Phaser.Scene,
  catalogs: ReadonlyMap<string, ObliqueModuleCatalog>,
): Promise<void> {
  const urls = new Set<string>();
  for (const catalog of catalogs.values()) for (const frame of catalog.frames) urls.add(frame.image);
  const missing = [...urls].filter((url) => !scene.textures.exists(url));
  for (const url of missing) scene.load.image(url, url);
  if (missing.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const failures: string[] = [];
    const onError = (file: { key?: string }): void => { failures.push(file.key ?? 'unknown'); };
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      if (failures.length > 0) reject(new Error(`Could not load oblique frame(s): ${failures.join(', ')}.`));
      else resolve();
    });
    scene.load.start();
  });
}
