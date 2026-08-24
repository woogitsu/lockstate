import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findCollectionNames,
  findEnumerationSites,
  reportCanonicalIterationViolations,
  stripComments,
  type CanonicalIterationExemption,
  type ScannedFile,
} from '../helpers/canonical-iteration';

/**
 * The static guard for `docs/DETERMINISM.md`, "Canonical iteration order"
 * (#132).
 *
 * `iteration-order.test.ts` next door states the canonical orders
 * *behaviourally* -- as concrete expected sequences and as a full session run
 * twice with every incidental registration order reversed. That catches a
 * reverted sort wherever the reversal changes an outcome. It cannot catch one
 * where the computation is order-independent *today*: `SparseWorld.
 * ownedParcelBounds` reverted to `this.parcels.values()` survived the whole
 * suite, because it computes a disjunction. The code was safe in fact, the
 * doc rule was violated, and nothing would have noticed -- and the next such
 * revert lands somewhere that does matter.
 *
 * So this is the other half: a textual contract that asks whether each
 * enumeration of a `Map`/`Set` reaches a canonical order at all, regardless
 * of whether reverting it would change an answer. The rules live in
 * `tests/helpers/canonical-iteration.ts` (exported and exercised against
 * fixtures below); this file walks the filesystem and owns the allow-list,
 * the same split `tests/unit/simulation-message-keys.test.ts` and
 * `src/content/validate-catalog.ts` use.
 *
 * **Scope: `src/simulation/` and `src/content/`**, the two roots
 * `simulation-message-keys.test.ts` also scans, because the rule is about
 * what feeds simulation state and those are the trees that hold it. This is a
 * real limit and not an oversight: a `Map`-order walk in `src/rendering/` or
 * `src/persistence/` is *not* guarded here. Rendering is deliberately outside
 * -- AGENTS.md's first architectural boundary is that rendering is not
 * simulation, its sprite pools iterate insertion order by design, and
 * covering them would add a dozen exemptions whose reason is "this is not
 * what the rule is about". An allow-list padded with those is the list nobody
 * reads, which enforces nothing.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCANNED_ROOTS = ['src/simulation', 'src/content'] as const;

/**
 * Every unordered enumeration in scope, with the reason insertion order is
 * safe there. This list *is* the deliverable: it turns "someone reviewed this
 * once" into a checked-in claim a reviewer can audit, and it makes reverting
 * a canonical sort a change to a reviewable list rather than a quiet edit
 * inside one method.
 *
 * Two entries the scan flagged on `main` are absent because they were fixed
 * instead of exempted, which is the right remedy whenever the sort costs
 * nothing: `DoorRegistry.all()` and `PathRequestQueue.pendingIds()` now sort
 * by id. `ownedParcelBounds`, the walk that started #132, was already fixed
 * the same way.
 */
const ALLOWED: readonly CanonicalIterationExemption[] = [
  {
    file: 'src/simulation/contraband/intelligence.ts',
    expression: 'this.records.entries()',
    reason:
      '`decayAll` subtracts the same fixed amount from every record and deletes the ones that fall to the floor. Each record is independent of the others, so the set of survivors and their confidences are identical in any order. Reads of the ledger go through `all()`/`getSnapshot()`, which sort.',
  },
  {
    file: 'src/simulation/prisoners/room-instance-registry.ts',
    expression: 'this.occupants.values()',
    reason:
      '`loadSnapshot` clears every occupancy set before refilling from the snapshot. Emptying all of them touches each set once and leaves no residue that could depend on the order, and the refill is driven by the snapshot array, not by this walk.',
  },
  {
    file: 'src/simulation/prisoners/room-instance-registry.ts',
    expression: 'this.occupants',
    reason:
      '`instancesOccupiedBy` collects the instance ids holding one entity and returns `result.sort()`, so the walk order cannot reach a caller. Membership is a per-set question, so no earlier ordering decision is folded into the answer either.',
  },
  {
    file: 'src/simulation/rooms/topology.ts',
    expression: 'this.chunkTopologies.entries()',
    reason:
      'This pass builds an adjacency `Map` and a node `Set` from chunk boundaries -- both order-independent, since `addEdge` is symmetric and idempotent. The order-dependent step is which node seeds which connected component, and that walks `[...allNodes].sort()` a few lines below, pinned by `iteration-order.test.ts`.',
  },
  {
    file: 'src/simulation/worker/client.ts',
    expression: 'this.listeners',
    reason:
      'Main-thread transport fan-out, not simulation state: `WorkerClient` hands each decoded worker message to every registered listener. It runs on the main thread, reads nothing the kernel owns and writes nothing into a snapshot; the simulation is on the other side of the port.',
  },
];

function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const repoPath = (file: string): string => relative(REPOSITORY_ROOT, file).split('\\').join(posix.sep);

const SCANNED: readonly ScannedFile[] = SCANNED_ROOTS.flatMap((root) =>
  listTypeScriptFiles(join(REPOSITORY_ROOT, root)).map((file) => ({ file: repoPath(file), source: readFileSync(file, 'utf8') })),
);

const REPORT = reportCanonicalIterationViolations(SCANNED, ALLOWED);

describe('the simulation iterates collections in a canonical order', () => {
  it('scans the whole of src/simulation and src/content, and finds enumerations there', () => {
    expect(SCANNED.length).toBeGreaterThan(80);
    expect(SCANNED.map((entry) => entry.file)).toContain('src/simulation/world/sparse-world.ts');
    expect(SCANNED.map((entry) => entry.file)).toContain('src/content/registry.ts');
    // Non-vacuous: an empty violation list means nothing if nothing was found
    // to look at. Most of these sites sort, which is the point.
    expect(REPORT.siteCount).toBeGreaterThan(40);
  });

  it('enumerates no Map or Set in insertion order without a recorded reason', () => {
    expect(
      REPORT.violations.map((violation) => `${violation.file}:${violation.line} [${violation.shape}] ${violation.expression}`),
    ).toEqual([]);
  });

  it('keeps its allow-list honest -- every exemption still names a real, still-unordered enumeration', () => {
    expect(REPORT.staleExemptions.map((entry) => `${entry.file} -> ${entry.expression}`)).toEqual([]);
    for (const entry of ALLOWED) {
      expect(SCANNED.map((scanned) => scanned.file), `exemption names a file outside the scan: ${entry.file}`).toContain(entry.file);
      expect(entry.reason.length, `exemption for ${entry.file} -> ${entry.expression} needs a real reason`).toBeGreaterThan(80);
    }
    // The allow-list accounts for every unordered enumeration and nothing
    // more, so its length is the number a reviewer has to audit.
    expect(REPORT.unorderedCount).toBe(ALLOWED.length);
  });
});

/**
 * The scanner's own tests. A static contract is only as good as its pattern,
 * and a pattern that quietly stops matching is worse than no pattern at all:
 * the suite stays green and the guard is gone. So the rules are exercised
 * against fixtures in both directions, rather than only against real sources
 * where a silent failure looks exactly like compliance.
 */
describe('the canonical-iteration scanner recognises what it claims to', () => {
  const site = (source: string) => findEnumerationSites(source)[0];

  it('flags a view of a Map that reaches no sort', () => {
    const found = site('class A { private parcels = new Map<string, P>(); all() { return [...this.parcels.values()]; } }');
    expect(found).toEqual({ expression: 'this.parcels.values()', shape: 'collection-view', line: 1, ordered: false });
  });

  it('accepts a sort later in the same statement, through intervening filters and maps', () => {
    expect(site('all() { return [...this.jobs.values()].filter((j) => j.live).sort((a, b) => (a.id < b.id ? -1 : 1)); }')?.ordered).toBe(true);
  });

  it('accepts a binding that is sorted in place further down the same block', () => {
    const source = 'run() { const entries = [...this.pending.values()]; entries.sort((a, b) => a.n - b.n); return entries; }';
    expect(site(source)?.ordered).toBe(true);
  });

  it('accepts a Set binding materialised and sorted as `[...name].sort()`', () => {
    const source = 'snap() { const ids = new Set([...this.stock.keys()]); return [...ids].sort(); }';
    expect(site(source)?.ordered).toBe(true);
  });

  it('does not let a sort in a *later* block vouch for an unsorted walk', () => {
    const source = 'class A { one() { return [...this.records.values()]; } two() { return [...this.other].sort(); } }';
    expect(site(source)?.ordered).toBe(false);
  });

  it('flags a bare `for ... of` over a Map field -- the one-character way around the view rule', () => {
    const source = 'class A { private parcels = new Map<string, P>(); all() { for (const p of this.parcels) use(p); } }';
    expect(site(source)).toEqual({ expression: 'this.parcels', shape: 'bare-for-of', line: 1, ordered: false });
  });

  it('reads Map and Set fields however they are declared, and nothing else as one', () => {
    expect(findCollectionNames('private readonly byId = new Map<string, T>(); private seen: Set<string> = new Set(); private list: T[] = [];')).toEqual([
      'byId',
      'seen',
    ]);
  });

  it('ignores a class method that merely happens to be called entries()', () => {
    // `ActorIdentityRegistry.entries()` is such a method; reading it as a
    // collection view would put a permanent false positive in the allow-list.
    expect(findEnumerationSites('class A { entries() { return this.entries(); } }')).toEqual([]);
  });

  it('ignores lookups and mutations, which are not enumerations', () => {
    expect(findEnumerationSites('get(id) { return this.byId.has(id) ? this.byId.get(id) : this.byId.delete(id); }')).toEqual([]);
  });

  it('reads the rule out of code and not out of prose about the rule', () => {
    const source = 'class A { private m = new Map<string, T>(); all() { /* never [...this.m.values()] unsorted */ return this.sorted(); } }';
    expect(findEnumerationSites(source)).toEqual([]);
    // Block comments are blanked, not removed, so reported lines stay true.
    expect(stripComments('a\n/* two\nthree */\nfour').split('\n')).toHaveLength(4);
  });

  it('reports the reason an exemption went stale, in both directions', () => {
    const exemption: CanonicalIterationExemption = { file: 'a.ts', expression: 'this.m.values()', reason: 'x'.repeat(90) };
    const sorted: readonly ScannedFile[] = [{ file: 'a.ts', source: 'all() { return [...this.m.values()].sort(); }' }];
    expect(reportCanonicalIterationViolations(sorted, [exemption]).staleExemptions).toEqual([exemption]);

    const unsorted: readonly ScannedFile[] = [{ file: 'a.ts', source: 'all() { return [...this.m.values()]; }' }];
    expect(reportCanonicalIterationViolations(unsorted, [exemption]).violations).toEqual([]);
    expect(reportCanonicalIterationViolations(unsorted, []).violations).toEqual([
      { file: 'a.ts', expression: 'this.m.values()', shape: 'collection-view', line: 1 },
    ]);
  });
});
