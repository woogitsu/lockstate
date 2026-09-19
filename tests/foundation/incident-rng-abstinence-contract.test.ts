import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * **Every incident this game opens is a deterministic consequence of prison
 * state, and nothing under `src/simulation/incidents/` draws a random number.**
 * [ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
 * decision 5 and its Context 10 (issue
 * [#979](https://github.com/woogitsu/lockstate/issues/979)), pinned by a gate
 * rather than left as a measurement somebody took once.
 *
 * ## Why this file exists
 *
 * Context 10 established the property by running `grep -c "rng"` over the ten
 * files in that tree on the day it was written, and decision 5 undertook to
 * keep it. `src/simulation/incidents/default-gangs.ts:17` then repeats the
 * undertaking in its own words — *"Nothing here draws a random number"* — and
 * `src/simulation/prisoners/classification-review-system.ts` reasons from it
 * that a second gang-membership write site "adds no stream and moves no draw".
 * **Three sites depend on the property and nothing enforced it**, so the first
 * incident producer to reach for a stream would land green and take four
 * docblocks' claims down with it.
 *
 * The cost of that is not abstract. Every named stream a session claims is
 * pinned, in order, by
 * `tests/determinism/rng-stream-isolation.test.ts` — *"Adding a stream changes
 * what a recorded command stream reproduces, so this pin must move
 * deliberately"* — so a seventh stream for gangs would fail there. This gate
 * closes the other half: a producer in this tree drawing from one of the
 * **six streams that already exist** would move that stream's words and
 * silently change every existing seed's classification, contraband and
 * identity draws without adding a name for the census to catch.
 *
 * ## What it does not claim
 *
 * It is a source scan, not a runtime proof: it establishes that no module in
 * this tree *names* an RNG, and a module that reached one through an
 * indirection this regex cannot see would pass. The two checks that keep it
 * honest are the corpus size (a glob that matched nothing would be vacuously
 * green) and the control file below, which is a module that really does draw
 * and which this gate's own matcher must flag.
 */

const INCIDENT_ROOT = join(process.cwd(), 'src', 'simulation', 'incidents');

/**
 * A module that draws, used as the matcher's control: `introduction.ts:286` is
 * `if (rng.nextFloat() >= contrabandIntroductionProbability(...))`. If this
 * file ever stops drawing, this gate must be repointed rather than deleted.
 */
const DRAWING_CONTROL = join(process.cwd(), 'src', 'simulation', 'contraband', 'introduction.ts');

/**
 * `rng` as a whole word catches the parameter, the field, the import and
 * `context.rng`; the rest catch a generator reached without that name.
 */
const DRAW_PATTERNS: readonly (readonly [label: string, pattern: RegExp])[] = [
  ['rng', /\brng\b/i],
  ['Xoshiro', /Xoshiro/],
  ['nextFloat/nextInt', /\bnext(?:Float|Int|Boolean)\s*\(/],
  ['Math.random', /Math\s*\.\s*random\s*\(/],
];

function listTypeScriptFiles(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

function drawSites(path: string): readonly string[] {
  const stripped = stripComments(readFileSync(path, 'utf8'));
  const sites: string[] = [];
  stripped.split('\n').forEach((line, index) => {
    for (const [label, pattern] of DRAW_PATTERNS) {
      if (pattern.test(line)) sites.push(`${relative(process.cwd(), path)}:${String(index + 1)} (${label}) ${line.trim()}`);
    }
  });
  return sites;
}

describe('incident RNG abstinence contract (ADR 0103 decision 5)', () => {
  it('finds the incident modules to check', () => {
    // Non-vacuity: ten files were in this tree when ADR 0103 Context 10
    // counted them, and a glob that matched nothing would make the assertion
    // below pass without reading a line.
    expect(listTypeScriptFiles(INCIDENT_ROOT).length).toBeGreaterThanOrEqual(10);
  });

  it('flags a module that really does draw, so the matcher is not vacuous', () => {
    expect(drawSites(DRAWING_CONTROL).length).toBeGreaterThan(0);
  });

  it('finds no random draw in any incident module, comments excluded', () => {
    const violations = listTypeScriptFiles(INCIDENT_ROOT).flatMap((path) => drawSites(path));

    // Named rather than counted, so a failure says which file and which line
    // took the property away.
    expect(violations).toEqual([]);
  });
});
