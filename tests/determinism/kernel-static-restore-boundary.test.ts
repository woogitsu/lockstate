import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * ADR 0038 §2's merge lives in `Kernel.restoreState`. The static
 * `Kernel.restore` still **replaces** -- `new NamedRngStreams(snapshot.rngStates)`
 * -- which is the exact line #415 was about.
 *
 * ## Why it is left replacing, rather than made to merge
 *
 * The merge is not a policy `restoreState` chose; it is available to it
 * because of what it is called on. ADR 0038 §2 says so in the sentence that
 * is its whole reason for preferring that fix over every alternative:
 *
 * > The expected set needs no new declaration, and this is the reason to
 * > prefer this fix over any other. It is already in the caller's hand:
 * > `restore-session.ts` constructs the runtime, so the kernel holds exactly
 * > the streams this build registers, already correctly derived. The fix is
 * > to stop discarding them. **No registry of stream names, no second list to
 * > keep in step with `new-session.ts`, no new concept.**
 *
 * `Kernel.restore` has no such kernel. It *builds* one, from the snapshot
 * alone, and it takes no `masterSeed`. There is nothing to merge onto. Making
 * it merge would mean giving it a seed **and** the list of stream names this
 * build registers -- which is precisely the second list ADR 0038 §2 declines
 * to create, in the one place where creating it would buy nothing: no caller
 * in `src/` uses this method at all.
 *
 * So the choice taken is the second of the two: leave it, and gate it. The
 * gate is what makes "leave it" a decision rather than an omission -- a future
 * production caller silently reintroduces #415, and until now nothing said so.
 *
 * Two things are asserted, and the first is why the second matters.
 */

const REGISTERED_STREAMS = [
  'contraband.detection',
  'contraband.intelligence',
  'identity.actor-name',
  'prisoners.classification',
] as const;

const SRC_ROOT = resolve(import.meta.dirname, '../../src');

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

const streamNames = (kernel: Kernel): readonly string[] => kernel.snapshot().rngStates.map((entry) => entry.name);

describe('Kernel.restore replaces where restoreState merges, and has no production caller', () => {
  it('drops a stream the snapshot omits, where restoreState keeps it', () => {
    // A kernel wired the way `createNewSimulationRuntime` wires one: the four
    // streams this build registers, derived from a seed.
    const derived = REGISTERED_STREAMS.map((name) => ({ name, state: deriveXoshiroState(11, name) }));
    const shortSnapshot = {
      tick: 7,
      expectedSequence: 0,
      rngStates: derived.filter((entry) => entry.name !== 'prisoners.classification'),
      commands: [],
    };

    // The merging path: the kernel already holds all four, and keeps them.
    const merging = new Kernel(0, 0, new NamedRngStreams(derived));
    merging.restoreState(shortSnapshot);
    expect(streamNames(merging)).toEqual([...REGISTERED_STREAMS]);

    // The replacing path: it builds the kernel from the snapshot, so a stream
    // the snapshot omits simply does not exist afterwards. This is the #415
    // shape, asserted as a fact so "leaving it" is a documented state rather
    // than an assumption.
    const replacing = Kernel.restore(shortSnapshot, []);
    expect(streamNames(replacing)).toEqual([
      'contraband.detection',
      'contraband.intelligence',
      'identity.actor-name',
    ]);
    // And the difference is reachable: the merging kernel can draw from the
    // stream the snapshot dropped, the replacing one throws.
    expect(typeof merging.rng.get('prisoners.classification').nextUint32()).toBe('number');
    expect(() => replacing.rng.get('prisoners.classification')).toThrow(/prisoners\.classification/);
  });

  it('is called from nowhere in src/, which is the only reason the case above is harmless', () => {
    const files = collectTypeScriptFiles(SRC_ROOT);
    // The denominator, so an empty result means "clean" and not "the scan
    // stopped collecting" -- the role `ConstructionScanReport.scannedFiles`
    // plays for its own guard.
    expect(files.length).toBeGreaterThan(200);

    const callers = files
      .filter((path) => /(?<![\w$])Kernel\s*\.\s*restore\s*\(/.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => posix.join('src', relative(SRC_ROOT, path).split(sep).join(posix.sep)));

    expect(
      callers,
      'Kernel.restore replaces the kernel\'s RNG streams instead of merging them (ADR 0038 §2), so a bundle missing a stream this build registers restores silently and throws out of Kernel.step() later -- issue #415. It is left that way deliberately, because merging there would require a masterSeed and a second copy of new-session.ts\'s stream list. A production caller therefore has to decide that first: either use restoreSimulationRuntime/restoreState, or give Kernel.restore the seed and merge, and amend ADR 0038 §2.',
    ).toEqual([]);

    // The scan finds real call sites when there are some: the test suite's own.
    const testCallers = collectTypeScriptFiles(resolve(import.meta.dirname, '..')).filter((path) =>
      /(?<![\w$])Kernel\s*\.\s*restore\s*\(/.test(stripComments(readFileSync(path, 'utf8'))),
    );
    expect(testCallers.length).toBeGreaterThan(0);
  });
});
