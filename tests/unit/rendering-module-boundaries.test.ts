import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeConstructionSite,
  reportConstructionSites,
  type ScannedSource,
} from '../helpers/module-boundaries';

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
 *
 * ## The simulation-construction rule, and why it moved out of this file (#206)
 *
 * This test used to assert
 * `/new (SimulationRuntime|Kernel|SparseWorld|ConstructionSystem)\b/` against
 * every rendering module. Three of those alternatives name real classes. The
 * fourth named an **interface** -- `SimulationRuntime` is declared with
 * `export interface` in `src/simulation/runtime/new-session.ts`, so
 * `new SimulationRuntime(...)` cannot be written at all; `tsc` rejects it. The
 * one alternative that named the thing the failure message was about ("must
 * not build simulation runtimes") was the one that could never fire, and the
 * exported factory that actually builds a runtime,
 * `createNewSimulationRuntime`, was matched by nothing.
 *
 * Measured, on `4ff6d18`, before this change: appending
 *
 *     import { createNewSimulationRuntime } from '../simulation/runtime/new-session';
 *     export const leakedRuntime = createNewSimulationRuntime(1);
 *
 * to `src/rendering/depth.ts` -- a rendering module owning a live simulation at
 * module scope, which is precisely what `AGENTS.md` boundary 1 exists to
 * prevent -- left the suite at 145 files / 1449 passed / 1 skipped with
 * `tsc -b` clean. The same mutation now fails here.
 *
 * The forms live in `tests/helpers/module-boundaries.ts` because two other
 * trees need the same rule (`src/input/**` and `src/ui/**`, #206 part 2) and
 * because a catalog kept there is checked against the declarations
 * `src/simulation/**` really exports -- see
 * `tests/unit/module-boundary-rules.test.ts`. That check is the part that makes
 * this defect unrepeatable rather than merely fixed once: an entry naming
 * something unconstructible now fails with a message saying so.
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

  /** Repository-relative, posix-separated, so failure messages read the same on every platform. */
  const scanned: readonly ScannedSource[] = sources.map((file) => ({
    file: posix.join('src/rendering', relative(RENDERING_DIR, file).split(sep).join(posix.sep)),
    source: readFileSync(file, 'utf8'),
  }));

  it('never writes to simulation state from the renderer', () => {
    // Reading simulation types and pure helpers is the point of a
    // projection; constructing or mutating a live simulation is not.
    // `src/rendering/world/world-view.ts` is the deepest legitimate reach --
    // four pure imports, one of which deliberately delegates the tile-ownership
    // rule to the simulation rather than restating it -- and none of them
    // builds anything.
    const construction = reportConstructionSites(scanned);
    // The denominator first. An empty `sites` list is only evidence of a clean
    // renderer if the scan actually read the renderer: measured, with this
    // call handed `[]` instead of `scanned`, the assertion below goes green
    // while nothing is checked at all.
    expect(construction.scannedFiles).toBe(scanned.length);
    expect(construction.scannedFiles).toBeGreaterThan(10);
    expect(
      construction.sites.map(describeConstructionSite),
      'a rendering module now builds a live simulation. That is AGENTS.md boundary 1: Phaser must never become the source of truth for game state. The renderer is handed snapshots; it does not own the mutable thing',
    ).toEqual([]);

    for (const { file, source } of scanned) {
      // Kept exactly as it was, and worth stating what it does and does not
      // cover: `simulation/submit-command` is the protocol message *kind*, not
      // a module path, so this matches a renderer that hand-assembles the
      // envelope. A renderer that imported `SimulationCommandSender` from
      // `src/ui/` instead would contain no such literal -- that is a layering
      // inversion, recorded in #206 and not claimed as covered here. The
      // dependency direction it would need is what
      // `tests/unit/ui-orchestration-boundaries.test.ts` records from the
      // other side.
      expect(source, `${file} must not submit commands`).not.toMatch(/simulation\/submit-command/);
    }
  });
});
