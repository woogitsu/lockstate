import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findCollectionNames,
  findEnumerationSites,
  hasArrayOnlyUsage,
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
 * **Scope: `src/simulation/`, `src/content/` and `src/persistence/`.** The
 * first two are the roots `simulation-message-keys.test.ts` also scans,
 * because the rule is about what feeds simulation state and those are the
 * trees that hold it. `src/persistence/` was added by #177 for the reason
 * that issue gives: the payload is where an insertion-order walk stops being
 * theoretical, because a walk that reaches a save makes its checksum depend
 * on the history of the session that wrote it, and the failure then surfaces
 * as a `checksum-mismatch` on some later load with nothing pointing at the
 * walk. Extending it needed one thing first -- an array's `.entries()` is
 * written exactly like a `Map`'s, and `save-schema.ts` has one -- which is
 * handled in the scanner rather than by an exemption, and pinned by the
 * array-versus-`Map` fixtures below.
 *
 * `src/rendering/` remains outside, which is a real limit and not an
 * oversight: a `Map`-order walk there is not guarded here. Measured with the
 * same scanner, that tree holds 11 unordered enumerations (9 distinct
 * expressions). It is deliberately excluded -- AGENTS.md's first
 * architectural boundary is that rendering is not simulation, its sprite
 * pools iterate insertion order by design, and its order reaches neither a
 * save nor a hash, so covering it would add nine exemptions whose reason is
 * "this is not what the rule is about". An allow-list padded with those is
 * the list nobody reads, which enforces nothing.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCANNED_ROOTS = ['src/simulation', 'src/content', 'src/persistence'] as const;

/**
 * Every unordered enumeration in scope, with the reason insertion order is
 * safe there. This list *is* the deliverable: it turns "someone reviewed this
 * once" into a checked-in claim a reviewer can audit, and it makes reverting
 * a canonical sort a change to a reviewable list rather than a quiet edit
 * inside one method.
 *
 * Entries the scan flagged are absent whenever they were fixed instead of
 * exempted, which is the right remedy whenever the sort costs nothing:
 * `DoorRegistry.all()` and `PathRequestQueue.pendingIds()` now sort by id,
 * and `MemoryLocalSaveStore`'s `listMetadata` now sorts by `prisonId`, which
 * is also the order the real IndexedDB store returns. `ownedParcelBounds`,
 * the walk that started #132, was already fixed the same way.
 */
const ALLOWED: readonly CanonicalIterationExemption[] = [
  {
    file: 'src/persistence/local/autosave.ts',
    expression: 'this.perPrison.values()',
    reason:
      '`dispose` clears each entry\'s own `setTimeout` handle and then empties the map. Cancelling one timer cannot affect another and nothing is read out of the walk, so the set of cancellations is identical in any order. This is main-thread save *scheduling*: when a timer is cancelled reaches neither a payload nor simulation state.',
  },
  {
    file: 'src/persistence/session/worker-session-host.ts',
    expression: 'this.pending.values()',
    reason:
      '`stop` fails every still-pending worker request with the same error after the shutdown reply, clearing each one\'s own timer. No entry\'s teardown is folded into another\'s, and the keys are `crypto.randomUUID()` message ids, so there is no order derived from state to sort into. Main-thread transport, like `worker/client.ts` below; no snapshot or save payload is built from this walk.',
  },
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
    file: 'src/persistence/cloud/memory-client.ts',
    expression: 'this.prisons.values()',
    reason:
      'A membership test, not an ordering: `registerPrison` asks whether any prison already holds the requested slot index, and at most one can -- `prisons_owner_slot_unique` is on `(owner_id, slot_index)`. Every walk order therefore returns the same answer, and the answer is a boolean rather than a sequence. This is a test double for a cloud client besides, so nothing it enumerates reaches a simulation snapshot or a determinism hash.',
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
  it('scans the whole of src/simulation, src/content and src/persistence, and finds enumerations there', () => {
    expect(SCANNED.length).toBeGreaterThan(80);
    expect(SCANNED.map((entry) => entry.file)).toContain('src/simulation/world/sparse-world.ts');
    expect(SCANNED.map((entry) => entry.file)).toContain('src/content/registry.ts');
    expect(SCANNED.map((entry) => entry.file)).toContain('src/persistence/save-schema.ts');
    // Non-vacuous: an empty violation list means nothing if nothing was found
    // to look at. Most of these sites sort, which is the point.
    expect(REPORT.siteCount).toBeGreaterThan(40);
  });

  it('reads the real array `.entries()` in save-schema.ts as the array it is', () => {
    // The fixtures below pin the rule; this pins the file that made it
    // necessary, so the two cannot drift apart. `freeIndices` is an array in
    // the save payload, and its order is the array's own.
    const saveSchema = SCANNED.find((entry) => entry.file === 'src/persistence/save-schema.ts')!;
    expect(saveSchema.source).toContain('value.freeIndices.entries()');
    expect(findEnumerationSites(saveSchema.source).map((found) => found.expression)).not.toContain('value.freeIndices.entries()');
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

  // ## Arrays versus Maps (#177)
  //
  // `array.entries()` and `map.entries()` are textually identical, and the
  // real one is in `src/persistence/save-schema.ts`, which is why bringing
  // that tree into scope needed this first. Both directions are pinned here:
  // a tightening that started flagging arrays again would put an exemption
  // for a non-hazard in the allow-list, and one that stopped matching real
  // `Map` views would look exactly like compliance.

  it('does not flag an array view -- the shape save-schema.ts actually writes', () => {
    // `superRefine` numbering a free list so a zod issue can name the
    // offending position. `.length` on the same expression is the evidence:
    // no `Map` or `Set` has it.
    const source =
      'refine(value) { if (value.freeIndices.length > value.capacity) reject(); for (const [position, index] of value.freeIndices.entries()) check(position, index); }';
    expect(findEnumerationSites(source)).toEqual([]);
  });

  it('reads .push and indexing as array evidence too', () => {
    expect(findEnumerationSites('run(rows) { rows.push(1); return [...rows.values()]; }')).toEqual([]);
    expect(findEnumerationSites('run(rows) { const first = rows[0]; return [...rows.keys()]; }')).toEqual([]);
  });

  it('still flags a Map view whose file happens to talk about lengths elsewhere', () => {
    // The evidence is keyed on the whole receiver expression, so a *different*
    // expression ending in the same property name cannot vouch for this one.
    const source = 'class A { private records = new Map<string, R>(); all(other) { use(other.records.length); return [...this.records.values()]; } }';
    expect(site(source)).toEqual({ expression: 'this.records.values()', shape: 'collection-view', line: 1, ordered: false });
  });

  it('lets a Map declaration override array evidence, so the rule can only ever drop a non-collection', () => {
    // Contrived on purpose: if a file both declares the name as a `Map` and
    // carries array-only usage of it, one of the two is wrong and the scan
    // must err toward flagging rather than toward silence.
    const source = 'class A { private ids = new Set<string>(); all() { use(this.ids.length); return [...this.ids.values()]; } }';
    expect(site(source)?.ordered).toBe(false);
  });

  /*
   * The override branch's own coverage, audited rather than assumed.
   *
   * #177's closing comment reported that this branch was guarded by **exactly
   * one fixture** and that `tsc` did not object when it was removed. Measured,
   * by deleting `!declaredCollection &&` from `findEnumerationSites`:
   *
   * | mutation on the scanner's own branch          | before | after |
   * | --- | --- | --- |
   * | drop `!declaredCollection &&` (the override)  | **1**, and `tsc` clean | 4 |
   * | narrow the declaration regex to `= new Map`   | **1** | 2 |
   * | treat any `const`/`private` name as a collection | 3 | 5 |
   * | drop the `receiver === 'this'` guard          | 3 | 3 |
   * | `hasArrayOnlyUsage` always false              | 6 | 6 |
   *
   * The "before" column was measured against the previous revision of this
   * file, not inferred: the first three mutations were re-run with the old
   * fixtures restored. So the branch that decides *which* of two conflicting
   * signals wins was the thinnest-guarded part of the scanner, and the
   * declaration regex's type-annotation alternative was one fixture deep too --
   * a check whose own branches are single-fixture-deep, which is the shape this
   * repository keeps finding one level up.
   *
   * The last two rows are unchanged and are here as the control: they were
   * already covered, so this work adds nothing to them and does not pretend
   * to. These four fixtures cover the declaration forms the regex actually
   * recognises and the looseness it deliberately keeps.
   */
  it('overrides array evidence for a Map declared as a local, not only as a field', () => {
    // `const byId = new Map<...>()` rather than `private byId = new Map()`.
    // `findCollectionNames` matches both through one regex, so a change that
    // narrowed it to class fields would pass the field fixture and fail here.
    const source = 'function f() { const byId = new Map<string, number>(); use(byId.length); return [...byId.values()]; }';
    expect(site(source)?.ordered).toBe(false);
  });

  it('overrides array evidence for a Map declared by type annotation alone', () => {
    // The other half of the regex: `name: Map<...>` / `name: ReadonlyMap<...>`
    // with no `new`, which is how a constructor parameter or an interface
    // field declares one. Nothing else in this file exercises that alternative.
    const source = 'class A { public constructor(private readonly ids: ReadonlyMap<string, number>) {} all() { use(this.ids.length); return [...this.ids.values()]; } }';
    expect(site(source)?.ordered).toBe(false);
  });

  it('matches the declaration on the receiver\'s final name, and keeps that looseness on purpose', () => {
    // `other.ids` is indexed like an array, and a `Map` named `ids` is declared
    // elsewhere in the file -- so the override fires on the *final name* and
    // the site is flagged even though this particular receiver may well be an
    // array.
    //
    // That is deliberate and is pinned here so it is not "fixed" later: both
    // directions of this rule err toward flagging, and a reviewer reading a
    // false positive has a real choice, while a false negative on a real `Map`
    // walk is silent and reaches a payload. Narrowing this to the whole
    // expression would trade the loud failure for the silent one.
    const source = 'class A { private ids = new Map<string, number>(); all(other: { ids: string[] }) { use(other.ids[0]); return [...other.ids.values()]; } }';
    expect(site(source)?.ordered).toBe(false);
  });

  it('does not invent a declaration from a name that is merely assigned', () => {
    // The negative control for the override, without which the three above
    // could all pass on a branch that treated any mention as a declaration:
    // `byId` here is assigned from a function call, not declared as a
    // collection, so the array evidence stands and the site is skipped.
    const source = 'function f() { const byId = load(); use(byId.length); return [...byId.values()]; }';
    expect(site(source)).toBeUndefined();
  });

  it('answers the array question on its own, for the receiver it was asked about', () => {
    expect(hasArrayOnlyUsage('value.freeIndices.length > 0', 'value.freeIndices')).toBe(true);
    expect(hasArrayOnlyUsage('value . freeIndices [ 0 ]', 'value.freeIndices')).toBe(true);
    expect(hasArrayOnlyUsage('other.freeIndices.length > 0', 'value.freeIndices')).toBe(false);
    expect(hasArrayOnlyUsage('this.pending.size > 0; this.pending.get(id)', 'this.pending')).toBe(false);
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
