import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which modules in `src/` draw on the *free* guard pool, pinned as a set
 * (issues [#941](https://github.com/matmaxalez/lockstate/issues/941) and
 * [#989](https://github.com/matmaxalez/lockstate/issues/989)).
 *
 * ## The claim this exists for, which no behaviour test can make
 *
 * The Security panel's covered rung says
 * `hud.security.coverage-met-hint` -- *"Incidents and searches need free
 * guards."* -- and that sentence **enumerates**. It is true only while the
 * things that draw on `claimableGuardIds` are incident response and contraband
 * search and nothing else. `docs/AGENT_WORKFLOW.md` §4 puts this class of
 * sentence first among the ones that rot: *"A sentence asserting an absence or
 * a count rots first ... Adding the thing it denies never touches the sentence
 * denying it."*
 *
 * That is not hypothetical here. It has already happened once, in this exact
 * shape: #941 authored *"Only free guards answer incidents."* on 2026-09-04
 * after opening `IncidentResponseSystem.claimableResponders`, and #989 found
 * the next day that `SearchSystem` had been claiming from the same pool since
 * ADR 0073 -- so the sentence was one duty short on the day it shipped, and
 * every test in the repository stayed green. **A third consumer would do it
 * again, silently.** This is the assertion that goes red instead.
 *
 * **A third consumer arrived on 2026-09-05 and this is what it looked like**
 * (issue [#996](https://github.com/matmaxalez/lockstate/issues/996)). It was
 * not a third *duty*: the owner ruled that a contraband search must draw on its
 * own allowance so that a sweep can never leave a riot with nobody to send, and
 * the two search call sites moved off `claimableGuardIds` and on to
 * `claimableSearchGuardIds` -- the same pool less
 * `INCIDENT_RESPONSE_GUARD_RESERVE`. So the count of *functions* went up and
 * the count of *duties* did not, which is exactly the distinction the covered
 * rung's sentence turns on, and it is why the walk below now spells both names
 * and the last case still counts duties.
 *
 * A third consumer is not forbidden. It has to arrive with a decision about
 * what the covered rung tells a player, and this is where that decision is
 * asked for. `tests/foundation/deployment-phase-producer-contract.test.ts` is
 * the same shape one level down -- it pins who *writes* `'on-search'`, for the
 * restore-time release rule -- and `GUARD_CLAIM_KINDS`
 * (`src/simulation/security/guard-release.ts`) is the third guard on the same
 * class: a closed union whose own docblock says *"a **fourth** claimant cannot
 * be added without somebody deciding what a player is told about it."*
 *
 * ## Why the pool and not the requirement
 *
 * Because the two are different numbers and the whole defect is that they read
 * as one. `DeploymentSystem.requiredGuardCountFor` is the posts a sector asks
 * to have filled and is what the panel prints; `claimableGuardIds` is what is
 * left over once they are filled, and satisfying the first empties nothing
 * into the second. Nothing here rules on how large either should be -- that is
 * balance and `AGENTS.md` reserves it to the owner.
 *
 * ## What is matched, and what is deliberately not
 *
 * A *call* -- `claimableGuardIds(` or `claimableSearchGuardIds(` -- on a line
 * that is not a comment, with the declaration in `post-eligibility.ts` excluded
 * by name (it holds both, and `claimableSearchGuardIds` calls the other one).
 * Prose mentions do not count and must not: this repository's comments cite the function
 * constantly, and one of them (`default-locale-en.ts`) even quotes a call with
 * its argument. Keying on the file rather than on `file:line` keeps the pin
 * from drifting on every unrelated edit above it, which is the cost
 * `docs/adr/STATUS-QUEUE.md` records ten citations' worth of; the per-file
 * *count* is what catches a second call site added inside a file that already
 * has one.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SOURCE_ROOT = join(REPOSITORY_ROOT, 'src');

/** Where the two functions are declared, so neither declaration is counted as one of its own consumers. */
const DECLARATION = 'src/simulation/security/post-eligibility.ts';

/** The two pools: what a response may claim, and what a search may claim (issue #996). */
const POOL_FUNCTIONS = ['claimableGuardIds', 'claimableSearchGuardIds'] as const;

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

/**
 * Whether a line is prose rather than code.
 *
 * Line-level and deliberately crude: a block comment's continuation lines all
 * begin `*` in this repository (`.editorconfig` and every docblock above),
 * `//` covers the rest, and no call to this function shares a line with the
 * start of a comment. The alternative -- stripping comments from the whole
 * file -- would have to reason about `//` inside string literals, and getting
 * that wrong hides a call instead of showing a false one.
 */
function isProse(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

/**
 * `<path> <function> x<call sites>` for every module that claims from either
 * pool, sorted.
 *
 * The function name is part of the row rather than collapsed away, because
 * *which* pool a module reads is the whole subject since #996: a module moving
 * from the search pool back to the responder pool is a change of rule, and a
 * row keyed only on the path would not notice it.
 */
function poolConsumers(): readonly string[] {
  const counts = new Map<string, number>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const path = relative(REPOSITORY_ROOT, file);
    if (path === DECLARATION) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isProse(line)) continue;
      for (const callee of POOL_FUNCTIONS) {
        // `claimableGuardIds(` is a substring of nothing else here, but
        // `split` on it would also match `claimableSearchGuardIds(` if the
        // longer name ever gained that suffix, so each name is counted against
        // the whole identifier rather than against a tail of it.
        const calls = line.split(new RegExp(`(?<![A-Za-z])${callee}\\(`)).length - 1;
        if (calls > 0) counts.set(`${path} ${callee}`, (counts.get(`${path} ${callee}`) ?? 0) + calls);
      }
    }
  }
  return [...counts.entries()].map(([key, count]) => `${key} x${String(count)}`).sort();
}

describe('who draws on the free guard pool', () => {
  it('finds calls to check', () => {
    // Guards every assertion below: a walk or a pattern that matched nothing
    // would make them vacuously green, which is the failure #375 records three
    // instances of.
    expect(poolConsumers().length).toBeGreaterThan(2);
  });

  it('names every module that claims from the pool, and how many call sites each has', () => {
    expect(poolConsumers()).toEqual([
      // The producer, not a consumer of the surplus: this is the call that
      // *fills* the posts the panel prints, and the pool it leaves behind is
      // what the two below compete for.
      'src/simulation/security/deployment-system.ts claimableGuardIds x1',
      // The duty that gates whether a sweep is ordered at all (#989), on the
      // narrowed pool since #996.
      'src/simulation/contraband/sector-search-duty.ts claimableSearchGuardIds x1',
      // The one that staffs it once it is (#989), likewise.
      'src/simulation/contraband/search-system.ts claimableSearchGuardIds x1',
      // The responder claim (#941), which #996 deliberately did not narrow:
      // a response is what the reserve is held for.
      'src/simulation/incidents/response-system.ts claimableGuardIds x1',
    ].sort());
  });

  it('leaves the sentence on the covered rung naming exactly the duties that are here', () => {
    /*
     * The other end of the same thread, asserted in the file that would go red
     * first. `hud.security.coverage-met-hint` is pinned verbatim in
     * `tests/unit/ui-simulation-staff-coverage.test.ts`; what is asserted here
     * is only that the *count* of non-producing consumers is the count the
     * sentence enumerates -- two -- so that adding a third fails here with the
     * reason attached rather than leaving a true-sounding sentence in place.
     */
    const claimants = poolConsumers().filter((entry) => !entry.startsWith('src/simulation/security/deployment-system.ts'));
    expect(
      new Set(claimants.map((entry) => entry.split('/')[2])),
      'the covered rung says "Incidents and searches need free guards." -- two duties, and this is the set it names',
    ).toEqual(new Set(['contraband', 'incidents']));
  });
});
