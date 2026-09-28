import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { ObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

vi.mock('phaser', () => ({
  default: { Loader: { Events: { FILE_LOAD_ERROR: 'fileloaderror', COMPLETE: 'complete' } } },
}));

import { ensureObliqueModuleFrameTexture } from '../../src/rendering/phaser/oblique-module-textures';

function catalog(image: string): ObliqueModuleCatalog {
  return {
    yawDegrees: [0], elevationDegrees: [45],
    frames: [{ yawDegrees: 0, elevationDegrees: 45, image, sha256: 'a'.repeat(64) }],
  } as ObliqueModuleCatalog;
}

function fakeScene() {
  const events = new EventEmitter();
  const textures = new Set<string>();
  const queued: string[] = [];
  let starts = 0;
  const scene = {
    textures: { exists: (key: string) => textures.has(key), get: (key: string) => ({ key: textures.has(key) ? key : '__MISSING' }) },
    load: {
      image: (key: string) => { queued.push(key); },
      on: (event: string, handler: (...args: unknown[]) => void) => { events.on(event, handler); },
      once: (event: string, handler: (...args: unknown[]) => void) => { events.once(event, handler); },
      off: (event: string, handler: (...args: unknown[]) => void) => { events.off(event, handler); },
      start: () => {
        starts += 1;
        setTimeout(() => {
          for (const key of queued.splice(0)) textures.add(key);
          events.emit('complete');
        }, 0);
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, queued, getStarts: () => starts };
}

describe('oblique module frame loading', () => {
  it('batches simultaneously requested catalog frames into one Phaser loader run', async () => {
    const { scene, getStarts } = fakeScene();
    const pose = { yawRadians: 0, elevationRadians: Math.PI / 4 };
    const frames = await Promise.all(['floor-a', 'floor-b', 'wall-c'].map((key) =>
      ensureObliqueModuleFrameTexture(scene, catalog(`/assets/environment/oblique/${key}.png`), pose)));
    expect(frames.map((frame) => frame.image)).toEqual([
      '/assets/environment/oblique/floor-a.png',
      '/assets/environment/oblique/floor-b.png',
      '/assets/environment/oblique/wall-c.png',
    ]);
    expect(getStarts()).toBe(1);
  });

  it('deduplicates the same image and batches a later pose after the active load', async () => {
    const { scene, getStarts } = fakeScene();
    const pose = { yawRadians: 0, elevationRadians: Math.PI / 4 };
    const first = ensureObliqueModuleFrameTexture(scene, catalog('/assets/environment/oblique/first.png'), pose);
    const duplicate = ensureObliqueModuleFrameTexture(scene, catalog('/assets/environment/oblique/first.png'), pose);
    await Promise.resolve();
    const later = ensureObliqueModuleFrameTexture(scene, catalog('/assets/environment/oblique/later.png'), pose);
    await Promise.all([first, duplicate, later]);
    expect(getStarts()).toBe(2);
  });
});
