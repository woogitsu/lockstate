import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which modules in `src/` put a guard into which `DeploymentPhase`, pinned as
 * a set.
 *
 * This exists for one claim, which a behaviour test cannot make on its own:
 * **an `'on-search'` guard that no active search job names was an incident
 * responder.** `IncidentResponseSystem.releaseOrphanedClaims` hands such a
 * guard back to the unassigned pool on the first scheduled update after a
 * restore, because a save records the phase but not the response that claimed
 * it (issue #352). The rule is sound only while `'on-search'` has exactly two
 * producers -- that system and `SearchSystem`, whose jobs *are* in the payload
 * and which can therefore say which guards are its own.
 *
 * `tests/integration/incident-response-restore.test.ts` measures the
 * separation behaviourally, with a session holding both kinds of `'on-search'`
 * guard at once. What it cannot see is a **third** producer: a new system that
 * parked a guard on `'on-search'` and held it across a save would have its
 * guard released out from under it, silently, and every existing test would
 * stay green. This is the assertion that goes red instead, in the same shape
 * as the other reachability contracts in this directory -- it reads real files
 * off disk rather than a hand-maintained list, and it rules on nothing except
 * that the set has not changed.
 *
 * A new producer is not forbidden. It has to come with a decision about what a
 * restore owes the claim it makes, and this is where that decision is asked
 * for.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SOURCE_ROOT = join(REPOSITORY_ROOT, 'src');

/*
 * Only a *call* whose phase argument is a literal is matched. `GuardRoster`'s
 * own declaration takes a `DeploymentPhase` parameter and carries no quoted
 * literal, so it is not matched -- which is the difference between scanning for
 * writers and scanning for the setter.
 */

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
 * `<path>: <phase>` for every literal write, **and how many call sites each
 * pair has**.
 *
 * The count is what a set of pairs alone cannot see: a second
 * `setDeploymentPhase(guard, 'on-search')` added inside a file that already
 * writes that phase would leave the pair set unchanged. Counting call sites
 * catches that; keeping the key at file level rather than `file:line` keeps the
 * pin from drifting on every unrelated edit above it, which is the cost
 * `docs/adr/STATUS-QUEUE.md` records ten citations' worth of.
 */
function literalWrites(setter: string): ReadonlyMap<string, number> {
  const pattern = new RegExp(`${setter}\\([^)]*?'([a-z-]+)'\\s*\\)`, 'gu');
  const writes = new Map<string, number>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const body = readFileSync(file, 'utf8');
    for (const match of body.matchAll(pattern)) {
      if (match[1] === undefined) continue;
      const key = `${relative(REPOSITORY_ROOT, file)}: ${match[1]}`;
      writes.set(key, (writes.get(key) ?? 0) + 1);
    }
  }
  return writes;
}

function phaseWrites(): readonly string[] {
  return [...literalWrites('setDeploymentPhase').keys()].sort();
}

/** `<path>: <phase> x<call sites>`, sorted -- the form both assertions below compare. */
function countedWrites(setter: string, phase?: string): readonly string[] {
  return [...literalWrites(setter).entries()]
    .filter(([key]) => phase === undefined || key.endsWith(`: ${phase}`))
    .map(([key, count]) => `${key} x${count}`)
    .sort();
}

describe('deployment-phase producers', () => {
  it('finds phase writes to check', () => {
    // Guards both assertions below: a walk or a pattern that matched nothing
    // would make them vacuously green, which is the failure #375 records three
    // instances of.
    expect(phaseWrites().length).toBeGreaterThan(3);
  });

  it('names every module that writes a deployment phase, and which phase it writes', () => {
    expect(phaseWrites()).toEqual([
      'src/simulation/contraband/search-system.ts: on-search',
      'src/simulation/incidents/response-system.ts: on-search',
      'src/simulation/security/deployment-system.ts: on-post',
      'src/simulation/security/patrol-system.ts: on-post',
      'src/simulation/security/patrol-system.ts: travelling',
    ]);
  });

  it('gives `on-search` exactly the two producers the restore-time release depends on, and one call site each', () => {
    expect(countedWrites('setDeploymentPhase', 'on-search')).toEqual([
      'src/simulation/contraband/search-system.ts: on-search x1',
      'src/simulation/incidents/response-system.ts: on-search x1',
    ]);
  });

  it('gives `lockdown` exactly one producer, for the same reason', () => {
    // The other half of what a restored session releases: a sector's control
    // state. `IncidentResponseSystem` is the only writer of `'lockdown'` in
    // `src/`, and it holds one only while an incident in that sector is open,
    // so a `'lockdown'` no open incident justifies is residue. `'restricted'`
    // has no producer at all and is never touched by the release.
    expect(countedWrites('setControlState')).toEqual([
      'src/simulation/incidents/response-system.ts: lockdown x1',
      'src/simulation/incidents/response-system.ts: normal x3',
    ]);
    expect(countedWrites('setControlState', 'lockdown')).toEqual([
      'src/simulation/incidents/response-system.ts: lockdown x1',
    ]);
    expect(countedWrites('setControlState', 'restricted')).toEqual([]);
  });
});
