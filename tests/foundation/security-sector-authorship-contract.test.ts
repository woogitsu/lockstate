import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which modules in `src/` author the two fields that decide **where a guard
 * stands and what route it walks**, pinned as a set — and, for `patrolRoute`,
 * pinned at *nobody originating one*.
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
 * it, and adding a writer without answering that question would leave every
 * existing test green.
 *
 * **Amended 2026-09-02, for [ADR 0092](../../docs/adr/0092-who-decides-where-a-guard-stands.md)
 * decision 3 — "the save payload is authoritative for a sector definition it
 * carries."** `restoreSessionSystems` used to skip the payload's copy of a
 * sector id the runtime already holds; it now applies the payload's row onto
 * it through `SecuritySectorRegistry.redefine` (decision 2's narrow mutator,
 * added for this). That is why `session-systems.ts` and `sector.ts` gained new
 * sites below.
 *
 * **Amended again 2026-09-03 (#838).** The sentence above read *"it now
 * applies `postTile`, `patrolRoute` and `expectedPatrolLoopTicks` onto it"*,
 * and those three were all it applied: `gradeId` and `doorIds` were dropped on
 * every restore of every save, because the derived default sector always takes
 * the `redefine` branch. `redefine` moves all five now, and the last
 * expectation in this file is what makes a sixth field's exclusion visible
 * rather than silent. **None of them is a new producer.** `redefine` and the restore loop
 * around it only ever move a value the payload already carried into the
 * runtime's copy of the definition — they cannot manufacture a route or a
 * tile that was not already sitting in `EncodedSessionSystems`, and nothing
 * under `src/` writes a `patrolRoute` into that payload either (`captureSessionSystems`
 * only ever copies `runtime.securitySectors.all()` back out). So the
 * paragraph above is still true of *origination*: this file's job is
 * distinguishing a relay site from an authoring one, not asserting there are
 * none of either kind — read each list below with that distinction in mind
 * rather than assuming a longer list means the underlying claim regressed.
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

/** `readonly <name>:` declarations inside one `interface`/parameter block of `sector.ts`, in declaration order. */
function readonlyFieldsOf(startMarker: string, endMarker: string): readonly string[] {
  const body = readFileSync(join(SOURCE_ROOT, 'simulation/security/sector.ts'), 'utf8');
  const start = body.indexOf(startMarker);
  if (start === -1) throw new Error(`sector.ts no longer contains "${startMarker}" -- this contract cannot be vacuously green.`);
  const end = body.indexOf(endMarker, start);
  if (end === -1) throw new Error(`sector.ts no longer contains "${endMarker}" after "${startMarker}".`);
  return [...body.slice(start, end).matchAll(/^\s*readonly\s+([A-Za-z]+)\??\s*:/gmu)].map((match) => match[1]!);
}

describe('security sector authorship', () => {
  it('finds sector fields to check', () => {
    // Guards every assertion below: a renamed field or a broken lookbehind
    // would make them vacuously green, which is the failure #375 records three
    // instances of.
    expect(countedReads('patrolRoute').length).toBeGreaterThan(2);
    expect(countedReads('postTile').length).toBeGreaterThan(2);
  });

  it('has no module in src/ that originates a patrol route -- relay sites are named, not counted as authors', () => {
    /*
     * Five sites now, up from two, and **still none of them is a value**.
     * `sector.ts` declares the optional field on `SecuritySectorDefinition`
     * once (unchanged) and gains two more from `redefine` (ADR 0092 decision
     * 2): the `changes.patrolRoute?` parameter position and the `patrolRoute:`
     * key in the object it writes back into `this.definitions` -- both are
     * the plumbing of a narrow setter, not a place that invents a route.
     * `save-schema.ts` declares the Zod leaf that would accept one out of a
     * save, unchanged. `session-systems.ts` is the one genuinely new site
     * this ADR added: `redefine(sector.id, { …, patrolRoute: sector.patrolRoute
     * … })` in the restore loop, which only ever forwards whatever
     * `sector.patrolRoute` the payload already held.
     *
     * A sixth entry, or a change to one of these five that starts computing a
     * route from the world rather than relaying one, is what would mean
     * somebody built a route. Read the persistence question in this file's
     * header before deleting this expectation.
     */
    expect(countedSites('patrolRoute')).toEqual([
      'src/persistence/save-schema.ts x1',
      'src/simulation/runtime/session-systems.ts x1',
      'src/simulation/security/sector.ts x3',
    ]);
  });

  it('names every module that reads a patrol route, so a route that nothing walks is visible too', () => {
    // `session-systems.ts` and `sector.ts` are new here for the same reason
    // as above: `redefine`'s `changes.patrolRoute ?? current.patrolRoute`
    // reads both sides of the merge, and the restore loop reads
    // `sector.patrolRoute` twice (an `undefined` check, then the value
    // itself) to decide whether to forward it at all.
    expect(countedReads('patrolRoute')).toEqual([
      'src/simulation/presentation/security-projection.ts x1',
      'src/simulation/runtime/session-systems.ts x2',
      'src/simulation/security/deployment-system.ts x2',
      'src/simulation/security/patrol-system.ts x6',
      'src/simulation/security/sector.ts x4',
    ]);
  });

  it('gives a post tile exactly one producer that computes rather than relays one', () => {
    /*
     * Seven of the eight sites are a declaration, a parameter name, a
     * projection field or a relay. `default-sector.ts` is still the *only*
     * one that computes a value from the world --
     * `chunk * tileChunkSize + floor(tileChunkSize / 2)` — with no input a
     * player can supply; that has not changed.
     *
     * `session-systems.ts` is new (ADR 0092 decision 3): the restore loop's
     * `redefine(sector.id, { postTile: sector.postTile, … })` forwards the
     * payload's tile onto an already-registered sector. It is a relay of a
     * value `default-sector.ts` (or, once a placement command exists, a
     * player) already produced, not a second producer -- the distinction
     * this file's header now spells out.
     *
     * Two of the eight are worth naming because they are what a moved post
     * has to stay consistent with: `deployment-phase.ts` decides whether a
     * guard is standing on its post, and `security-projection.ts` publishes
     * the tile to `hud/security`, which `tests/foundation/projection-reachability-contract.test.ts`
     * records as having no reader.
     */
    expect(countedSites('postTile')).toEqual([
      'src/persistence/save-schema.ts x1',
      'src/simulation/presentation/security-projection.ts x2',
      'src/simulation/runtime/session-systems.ts x2',
      'src/simulation/security/default-sector.ts x1',
      'src/simulation/security/deployment-phase.ts x2',
      'src/simulation/security/deployment-system.ts x1',
      'src/simulation/security/sector.ts x3',
    ]);
  });

  it('offers exactly one narrow way to replace a registered sector definition, and no way to remove one', () => {
    /*
     * **This used to read "offers no way to replace or remove a registered
     * sector definition," and the whole method list below used to end at
     * `loadSnapshot` with no `redefine` in it.** ADR 0036 decision 4 point 2
     * is quoted here for what it still gets right rather than for the
     * conclusion the old title drew from it: *"`SecuritySectorRegistry` has no
     * un-register and no replace, deliberately: it captures each governed
     * door's baseline state at `register` time. Adding one is a decision
     * about what happens to the sector's live control state and to anything
     * naming it, and that decision is not this document's."* That decision
     * is [ADR 0092](../../docs/adr/0092-who-decides-where-a-guard-stands.md)
     * decision 2's, and the owner took it narrowly rather than not at all: a
     * general `replace` was rejected for the exact hazard ADR 0036 names --
     * it would have to decide what happens to a `doorIds` baseline the
     * registry never captured for a door the sector no longer governs.
     *
     * **This paragraph used to end** *"so `redefine` can move only `postTile`,
     * `patrolRoute` and `expectedPatrolLoopTicks`, cannot touch `id`,
     * `gradeId` or `doorIds`, and leaves `controlStates` and
     * `normalDoorStates` exactly as they were"* -- an accurate description of
     * the mutator, and the reason issue #838 exists: `redefine`'s only caller
     * is the restore path, so the two excluded fields were discarded on every
     * restore of every save. `redefine` now moves `gradeId` and `doorIds` too
     * and answers both halves of the deferred baseline question in its own
     * docblock (adopt a baseline no sector held, never re-capture one that
     * exists, drop one nothing governs any more); `controlStates` is still
     * left exactly as it was. There is still no un-register, and this file
     * still has nothing to say
     * about `loadSnapshot`'s own `!this.definitions.has(id)` skip -- that is
     * a *scenario* sector never having been registered at all, a different
     * case from decision 3's "the runtime already holds one."
     *
     * A post a player could move, or a route a player could redraw, is
     * therefore expressible against this class now, through exactly one
     * named method -- pinned here so that widening `redefine` into a general
     * replace, or adding an un-register, is a deliberate edit to this line
     * rather than a side effect of something else.
     */
    expect(registryMethods()).toEqual([
      'constructor',
      'register',
      'getDefinition',
      'redefine',
      'requireDefinition',
      'getControlState',
      'all',
      'setControlState',
      'getBaselineDoorStates',
      'getSnapshot',
      'loadSnapshot',
    ]);
  });
  it('lets `redefine` move every field of a sector definition except its id -- a persisted field it cannot move is a field a restore discards (#838)', () => {
    /*
     * The forcing function issue #838 is the instance of, stated as the class.
     *
     * `SecuritySectorDefinition` is a **persisted** shape
     * (`securitySectorDefinitionSchema` in `save-schema.ts`), and
     * `restoreSessionSystems` applies a save's row for a sector the runtime
     * already holds -- which, since ADR 0036, is the derived default sector on
     * every restore of every save -- through `redefine` and nothing else. So a
     * field `redefine` cannot move is a field the save carries, the restore
     * reads, and the runtime then silently throws away. That is what happened
     * to `gradeId` and `doorIds` between ADR 0092 decision 3 and #838:
     * measured, a row carrying `grade.high-security` and one door id restored
     * as `grade.general` and `[]`, and a lockdown of the restored sector left
     * that door unlocked.
     *
     * `id` is the one deliberate exclusion and it is excluded here too: ADR
     * 0036 decision 4 point 1 keeps it constant because incident records,
     * guard records, gang territory claims and `SectorRiskTracker` state all
     * name a sector by it.
     *
     * **So this expectation is not a copy of a list.** Adding a field to
     * `SecuritySectorDefinition` turns it red until either `redefine` accepts
     * the field or the restore path stops being the only way a payload row
     * reaches the runtime. Widening it back the other way -- deleting a field
     * from `redefine` -- turns it red too.
     */
    const definitionFields = readonlyFieldsOf('export interface SecuritySectorDefinition {', '\n}');
    const redefineFields = readonlyFieldsOf('public redefine(', '): void {');

    expect(definitionFields).toEqual(['id', 'gradeId', 'doorIds', 'postTile', 'patrolRoute', 'expectedPatrolLoopTicks']);
    expect(redefineFields).toEqual(definitionFields.filter((field) => field !== 'id'));
  });
});
