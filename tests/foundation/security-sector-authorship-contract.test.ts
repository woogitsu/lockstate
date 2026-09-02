import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which modules in `src/` author the two fields that decide **where a guard
 * stands and what route it walks**, pinned as a set — and, for `patrolRoute`,
 * pinned at *nobody*.
 *
 * This exists for one claim a behaviour test cannot make on its own:
 * **`PatrolSystem` is fully built and structurally unreachable in every
 * session a player can start.** It walks a sector's `patrolRoute` through the
 * real `NavigationSystem`, records on-time, late and missed loops, and is
 * covered by four cases in `tests/unit/security-patrol.test.ts` — all of them
 * against a route the *fixture* registers. Nothing in `src/` ever authors one,
 * so `PatrolSystem.update` returns at its own `patrolRoute === undefined`
 * guard for every guard, on every tick, in every session. A green suite says
 * nothing about that, because the suite is where the only routes are.
 *
 * `postTile` is the same shape with one producer instead of none:
 * `deriveDefaultSecuritySectorPostTile` decides it, from the world, and no
 * command, service or panel can move it.
 *
 * Both absences are decisions rather than oversights — ADR 0036 decision 5
 * argues each of them, and its own words are the reason a route is missing:
 * *"a derived loop would be a made-up path across whatever the player happened
 * to have built"*. This file is not an objection to either. It is where the
 * *next* change to either has to say what it is doing: an authored route or a
 * movable post is a player-facing gesture with a persistence question behind
 * it (`restoreSessionSystems` skips the payload's copy of a sector the runtime
 * already holds), and adding a writer without answering that question would
 * leave every existing test green.
 *
 * Written in the shape of `tests/foundation/deployment-phase-producer-contract.test.ts`,
 * for its stated reason: it reads real files off disk rather than a
 * hand-maintained list, and it rules on nothing except that the set has not
 * changed.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SOURCE_ROOT = join(REPOSITORY_ROOT, 'src');

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
 * `<path> x<sites>` for every occurrence of `field` in **property position** —
 * a declaration or an assignment — never a read.
 *
 * The lookbehind is what makes the two directions separable, and it is the
 * whole mechanism: `sector.patrolRoute === undefined` is a read and is
 * excluded, `patrolRoute: [...]` is an authorship and is not. Without it the
 * `===` comparisons in `patrol-system.ts` would be counted as writes and the
 * assertion below would be about nothing.
 *
 * File-level rather than `file:line`, for the reason the sibling contract
 * gives: a pin on a line number drifts on every unrelated edit above it.
 */
function propertyPositionSites(field: string): ReadonlyMap<string, number> {
  const pattern = new RegExp(`(?<![.\\w])${field}\\??\\s*:`, 'gu');
  const sites = new Map<string, number>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const matches = readFileSync(file, 'utf8').match(pattern);
    if (matches === null) continue;
    sites.set(relative(REPOSITORY_ROOT, file), matches.length);
  }
  return sites;
}

/** `<path> x<sites>`, sorted — the form every assertion below compares. */
function countedSites(field: string): readonly string[] {
  return [...propertyPositionSites(field).entries()].map(([path, count]) => `${path} x${count}`).sort();
}

/** Every `.<field>` read, counted per file — the other direction, so an emptied reader is visible too. */
function countedReads(field: string): readonly string[] {
  const pattern = new RegExp(`\\.${field}\\b`, 'gu');
  const reads: string[] = [];
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const matches = readFileSync(file, 'utf8').match(pattern);
    if (matches === null) continue;
    reads.push(`${relative(REPOSITORY_ROOT, file)} x${matches.length}`);
  }
  return reads.sort();
}

/** `public <name>(` on `SecuritySectorRegistry`, in declaration order. */
function registryMethods(): readonly string[] {
  const body = readFileSync(join(SOURCE_ROOT, 'simulation/security/sector.ts'), 'utf8');
  return [...body.matchAll(/^\s+public\s+([A-Za-z]+)\s*\(/gmu)].map((match) => match[1]!);
}

describe('security sector authorship', () => {
  it('finds sector fields to check', () => {
    // Guards every assertion below: a renamed field or a broken lookbehind
    // would make them vacuously green, which is the failure #375 records three
    // instances of.
    expect(countedReads('patrolRoute').length).toBeGreaterThan(2);
    expect(countedReads('postTile').length).toBeGreaterThan(2);
  });

  it('has no module in src/ that authors a patrol route', () => {
    /*
     * Two sites, and **neither is a value**. `sector.ts` declares the optional
     * field on `SecuritySectorDefinition`; `save-schema.ts` declares the Zod
     * leaf that would accept one out of a save. A save-schema leaf is worth
     * pointing at rather than excluding: the persisted shape has been ready
     * for a route since `SAVE_SCHEMA_VERSION` reached 5, so what is missing is
     * an author and not a format.
     *
     * A third entry here means somebody built a route. Read the persistence
     * question in this file's header before deleting this expectation.
     */
    expect(countedSites('patrolRoute')).toEqual([
      'src/persistence/save-schema.ts x1',
      'src/simulation/security/sector.ts x1',
    ]);
  });

  it('names every module that reads a patrol route, so a route that nothing walks is visible too', () => {
    expect(countedReads('patrolRoute')).toEqual([
      'src/simulation/presentation/security-projection.ts x1',
      'src/simulation/security/deployment-system.ts x2',
      'src/simulation/security/patrol-system.ts x6',
    ]);
  });

  it('gives a post tile exactly one producer, and it derives rather than accepts one', () => {
    /*
     * Six of the seven sites are a declaration, a parameter name or a
     * projection field. `default-sector.ts` is the one that computes a value
     * that reaches `SecuritySectorRegistry.register`, and it computes it from
     * the world — `chunk * tileChunkSize + floor(tileChunkSize / 2)` — with no
     * input a player can supply.
     *
     * Two of the six are worth naming because they are what a moved post would
     * have to stay consistent with: `deployment-phase.ts` decides whether a
     * guard is standing on its post, and `security-projection.ts` publishes
     * the tile to `hud/security`, which `tests/foundation/projection-reachability-contract.test.ts`
     * records as having no reader.
     */
    expect(countedSites('postTile')).toEqual([
      'src/persistence/save-schema.ts x1',
      'src/simulation/presentation/security-projection.ts x2',
      'src/simulation/security/default-sector.ts x1',
      'src/simulation/security/deployment-phase.ts x2',
      'src/simulation/security/deployment-system.ts x1',
      'src/simulation/security/sector.ts x1',
    ]);
  });

  it('offers no way to replace or remove a registered sector definition', () => {
    /*
     * ADR 0036 decision 4 point 2 states this as a decision and hands the
     * consequence forward: *"`SecuritySectorRegistry` has no un-register and
     * no replace, deliberately: it captures each governed door's baseline
     * state at `register` time. Adding one is a decision about what happens to
     * the sector's live control state and to anything naming it, and that
     * decision is not this document's."*
     *
     * So a post a player could move, or a route a player could redraw, cannot
     * be expressed against this class at all — the registry is append-only and
     * `register` throws on a duplicate id. That is the mechanical reason the
     * feature is a decision rather than a wiring job, and it is pinned here so
     * that adding the missing method is a deliberate edit to this line.
     */
    expect(registryMethods()).toEqual([
      'constructor',
      'register',
      'getDefinition',
      'requireDefinition',
      'getControlState',
      'all',
      'setControlState',
      'getBaselineDoorStates',
      'getSnapshot',
      'loadSnapshot',
    ]);
  });
});
