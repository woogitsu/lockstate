import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The renderer is split on purpose: the parts that decide *what* to draw are
 * plain data and maths, and only the parts that actually talk to a display
 * list import Phaser. That split is what lets direction selection, frame
 * timing, pivot placement, depth ordering and the world projection be tested
 * in the default Node environment with no canvas at all.
 *
 * It is easy to erode by importing Phaser "just for a type", so it is pinned
 * here -- the same way `navigation-no-phaser.test.ts` pins the simulation's
 * side of the boundary.
 */

const RENDERING_DIR = join(import.meta.dirname, '../../src/rendering');

/** Directories whose whole job is to drive Phaser. */
const PHASER_FACING = new Set(['phaser', 'scene']);

function collectSources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSources(full));
    } else if (entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('renderer module boundaries', () => {
  const sources = collectSources(RENDERING_DIR);

  it('finds the renderer sources it is meant to be checking', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('keeps Phaser out of every module that decides what to draw', () => {
    for (const file of sources) {
      const relativePath = relative(RENDERING_DIR, file);
      if (PHASER_FACING.has(relativePath.split(sep)[0] ?? '')) continue;
      expect(readFileSync(file, 'utf8'), `${relativePath} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
    }
  });

  it('never writes to simulation state from the renderer', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      const relativePath = relative(RENDERING_DIR, file);
      // Reading simulation types and pure helpers is the point of a
      // projection; constructing or mutating a live simulation is not.
      expect(source, `${relativePath} must not build simulation runtimes`).not.toMatch(
        /new (SimulationRuntime|Kernel|SparseWorld|ConstructionSystem)\b/,
      );
      expect(source, `${relativePath} must not submit commands`).not.toMatch(/simulation\/submit-command/);
    }
  });
});
