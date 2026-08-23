import Phaser from 'phaser';
import type { AtlasFrameIndex } from '../assets/atlas-frame-index';

/**
 * Publishes a manifest-driven atlas index into Phaser's texture manager.
 *
 * The atlases are packed sheets with no sidecar Phaser-format JSON, so the
 * frames are carved out here from the rectangles the generated manifest
 * already describes. That keeps ADR-0014's rule intact -- the renderer names
 * logical asset ids and lets the registry name the files -- while still
 * getting one texture per atlas rather than one per frame.
 *
 * The texture key is the atlas URL the manifest supplied. Deriving it instead
 * of inventing a parallel naming scheme means a key can never drift from the
 * content it names.
 */
export async function registerAtlasTextures(scene: Phaser.Scene, index: AtlasFrameIndex): Promise<void> {
  const missing = index.images().filter((image) => !scene.textures.exists(image.imageUrl));

  if (missing.length > 0) {
    for (const image of missing) scene.load.image(image.imageUrl, image.imageUrl);
    await runLoader(scene);
  }

  for (const image of index.images()) {
    const texture = scene.textures.get(image.imageUrl);
    // A failed download leaves Phaser's `__MISSING` placeholder in place;
    // carving frames out of it would silently draw nothing forever.
    if (texture.key !== image.imageUrl) {
      throw new Error(`Atlas image "${image.imageUrl}" did not load.`);
    }
    for (const frame of image.frames) {
      if (texture.has(frame.name)) continue;
      texture.add(frame.name, 0, frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height);
    }
  }
}

function runLoader(scene: Phaser.Scene): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const failures: string[] = [];
    const onFileError = (file: { key?: string }): void => {
      failures.push(file.key ?? 'unknown file');
    };

    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
      if (failures.length > 0) {
        reject(new Error(`Could not load atlas image(s): ${failures.join(', ')}.`));
        return;
      }
      resolve();
    });
    scene.load.start();
  });
}
